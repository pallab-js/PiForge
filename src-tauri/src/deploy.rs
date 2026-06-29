use std::process::{Command, Stdio, Child};
use std::io::{BufReader, BufRead};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Emitter};

pub struct PiConnectionState {
    pub child_process: Mutex<Option<Child>>,
}

// SEC-02: Input validation helper
fn is_valid_identifier_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-'
}

fn validate_ssh_input(ip: &str, username: &str, filename: &str) -> std::result::Result<(), String> {
    if ip.is_empty() || !ip.chars().all(is_valid_identifier_char) {
        return Err("Invalid IP address or hostname format".into());
    }
    if username.is_empty() || !username.chars().all(is_valid_identifier_char) {
        return Err("Invalid username format".into());
    }
    if filename.is_empty() || !filename.chars().all(is_valid_identifier_char) {
        return Err("Invalid filename format".into());
    }
    if !filename.ends_with(".py") {
        return Err("Filename must end with .py".into());
    }
    Ok(())
}

// SEC-01: Zeroize sensitive strings in memory
fn zeroize_string(mut s: String) {
    unsafe {
        let bytes = s.as_bytes_mut();
        for byte in bytes {
            *byte = 0;
        }
    }
}

// Verify key file permissions are 0600 on Unix
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

fn verify_key_permissions(path: &str) -> std::result::Result<(), String> {
    let metadata = std::fs::metadata(path).map_err(|e| format!("Failed to read key file metadata: {}", e))?;
    let permissions = metadata.permissions();
    let mode = permissions.mode();
    if mode & 0o077 != 0 {
        return Err("SSH private key file permissions are too open. They must be user-only (e.g., 0600).".into());
    }
    Ok(())
}

#[cfg(not(unix))]
fn verify_key_permissions(_path: &str) -> std::result::Result<(), String> {
    // No-op on non-Unix systems
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn deploy_and_run_pi(
    app: AppHandle,
    state: tauri::State<'_, PiConnectionState>,
    ip: String,
    username: String,
    password_or_key: String,
    auth_method: String, // "password" | "key"
    code: String,
    filename: String,
) -> std::result::Result<String, String> {
    // SEC-02: Validate inputs before spawning command
    if let Err(err_msg) = validate_ssh_input(&ip, &username, &filename) {
        return Err(err_msg);
    }

    // SEC-01: Zeroize passwords/keys on function exit
    let password_or_key_clone = password_or_key.clone();
    let _zeroizer = defer_zeroize(password_or_key_clone);

    // Resolve home directory tilde if present in key path
    let resolved_key_path = if auth_method == "key" && !password_or_key.is_empty() {
        let mut path = std::path::PathBuf::from(&password_or_key);
        if password_or_key.starts_with("~/") {
            if let Ok(home) = std::env::var("HOME") {
                path = std::path::PathBuf::from(home).join(&password_or_key[2..]);
            }
        }
        path.to_string_lossy().to_string()
    } else {
        password_or_key.clone()
    };

    // If key auth, verify key permissions
    if auth_method == "key" && !resolved_key_path.is_empty() {
        if let Err(err) = verify_key_permissions(&resolved_key_path) {
            return Err(err);
        }
    }

    // 1. Kill any existing active process and wait (reap) it
    {
        let mut child_lock = state.child_process.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = child_lock.take() {
            let _ = child.kill();
            let _ = child.wait(); // ROB-07: Reap process immediately
        }
    }

    // 2. Write code to a local unique temp file on host (ARCH-08)
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::Error::Tauri(e.to_string()).to_string())?;
    
    // Create a unique temp file name using uuid
    let unique_filename = format!("{}_{}", uuid::Uuid::new_v4(), filename);
    let temp_filepath = app_dir.join(&unique_filename);
    std::fs::write(&temp_filepath, code).map_err(|e| e.to_string())?;

    // 3. Construct SCP command to copy file to Pi
    let destination = format!("{}@{}:/home/{}/{}", username, ip, username, filename);
    
    let mut scp_args = vec![
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
    ];
    
    if auth_method == "key" && !resolved_key_path.is_empty() {
        scp_args.push("-i");
        scp_args.push(&resolved_key_path);
    }
    
    let temp_path_str = temp_filepath.to_string_lossy().to_string();
    scp_args.push(&temp_path_str);
    scp_args.push(&destination);

    // Spawn SCP command
    let scp_status = Command::new("scp")
        .args(&scp_args)
        .status();

    // ROB-06: Clean up the local temp file immediately after SCP
    let _ = std::fs::remove_file(&temp_filepath);

    let status = scp_status.map_err(|e| format!("Failed to copy file via SCP: {}", e))?;
    if !status.success() {
        return Err("SCP file copy failed. Verify host IP, SSH service status, and credentials.".into());
    }

    // 4. Spawn SSH command to run file on Pi:
    let mut ssh_args = vec![
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
    ];

    if auth_method == "key" && !resolved_key_path.is_empty() {
        ssh_args.push("-i");
        ssh_args.push(&resolved_key_path);
    }

    let host = format!("{}@{}", username, ip);
    ssh_args.push(&host);
    
    let run_cmd = format!("python3 -u /home/{}/{}", username, filename);
    ssh_args.push(&run_cmd);

    let mut child = Command::new("ssh")
        .args(&ssh_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run SSH command: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // 5. Store child process handle
    {
        let mut child_lock = state.child_process.lock().map_err(|e| e.to_string())?;
        *child_lock = Some(child);
    }

    // 6. Spawn background threads to read stdout/stderr and emit Tauri events in real-time
    let app_handle_stdout = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for l in reader.lines().map_while(|line| line.ok()) {
            let _ = app_handle_stdout.emit("pi-console-log", l);
        }
    });

    let app_handle_stderr = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for l in reader.lines().map_while(|line| line.ok()) {
            let _ = app_handle_stderr.emit("pi-console-log", format!("[ERROR] {}", l));
        }
    });

    Ok("Scaffold script deployed and executing on remote board!".into())
}

#[tauri::command]
pub async fn stop_pi_execution(state: tauri::State<'_, PiConnectionState>) -> std::result::Result<String, String> {
    let mut child_lock = state.child_process.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = child_lock.take() {
        let _ = child.kill();
        let _ = child.wait(); // ROB-07: Reap process immediately
        Ok("Remote process execution halted.".into())
    } else {
        Ok("No remote process currently executing.".into())
    }
}

// Helper struct to zeroize string on scope drop
pub struct ZeroizeOnDrop(String);
impl Drop for ZeroizeOnDrop {
    fn drop(&mut self) {
        zeroize_string(std::mem::take(&mut self.0));
    }
}

fn defer_zeroize(s: String) -> ZeroizeOnDrop {
    ZeroizeOnDrop(s)
}
