#![allow(non_snake_case)]

use std::fs;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// Custom unified error type
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Tauri path error: {0}")]
    Tauri(String),
}

// Enable serialization of our errors to JS strings
impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, Error>;

// Models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    id: String,
    name: String,
    description: String,
    rpi_model: String,
    status: String,
    created_at: i64,
    updated_at: i64,
    color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    id: String,
    project_id: String,
    title: String,
    description: String,
    status: String,
    priority: String,
    labels: Vec<String>,
    due_date: Option<i64>,
    time_estimate: Option<i32>,
    milestone_id: Option<String>,
    canvas_node_id: Option<String>,
    graph_node_id: Option<String>,
    column_id: String,
    position: f64,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    id: String,
    project_id: String,
    name: String,
    color: String,
    position: f64,
    is_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    theme: String,
    accent_color: String,
    font_size: String,
    grid_type: String,
    snap_to_grid: bool,
}

// DB connection helper
fn get_connection(app: &AppHandle) -> Result<Connection> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| Error::Tauri(e.to_string()))?;
    
    fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("piforge.db");
    let conn = Connection::open(db_path)?;
    Ok(conn)
}

// Database Migrations
fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            rpi_model TEXT,
            status TEXT NOT NULL DEFAULT 'planning',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            color TEXT DEFAULT '#cc785c'
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'backlog',
            priority TEXT NOT NULL DEFAULT 'p2',
            labels TEXT, -- JSON array
            due_date INTEGER,
            time_estimate INTEGER,
            milestone_id TEXT,
            canvas_node_id TEXT,
            graph_node_id TEXT,
            column_id TEXT NOT NULL,
            position REAL NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS columns (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            color TEXT,
            position REAL NOT NULL DEFAULT 0,
            is_done INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS canvas_states (
            project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            state_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            content TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    Ok(())
}

// --- TAURI COMMANDS ---

// Projects CRUD
#[tauri::command]
async fn create_project(app: AppHandle, project: Project) -> std::result::Result<Project, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO projects (id, name, description, rpi_model, status, created_at, updated_at, color)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            project.id,
            project.name,
            project.description,
            project.rpi_model,
            project.status,
            project.created_at,
            project.updated_at,
            project.color
        ],
    ).map_err(|e| e.to_string())?;
    Ok(project)
}

#[tauri::command]
async fn list_projects(app: AppHandle) -> std::result::Result<Vec<Project>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, description, rpi_model, status, created_at, updated_at, color FROM projects ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    
    let proj_iter = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            rpi_model: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            color: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut projects = Vec::new();
    for p in proj_iter {
        projects.push(p.map_err(|e| e.to_string())?);
    }
    Ok(projects)
}

#[tauri::command]
async fn get_project(app: AppHandle, id: String) -> std::result::Result<Option<Project>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let res = conn.query_row(
        "SELECT id, name, description, rpi_model, status, created_at, updated_at, color FROM projects WHERE id = ?",
        [id],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                rpi_model: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                color: row.get(7)?,
            })
        },
    ).optional().map_err(|e| e.to_string())?;
    Ok(res)
}

#[tauri::command]
async fn update_project(
    app: AppHandle,
    id: String,
    name: String,
    description: String,
    status: String,
    color: String,
) -> std::result::Result<Project, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE projects SET name = ?1, description = ?2, status = ?3, color = ?4, updated_at = ?5 WHERE id = ?6",
        params![name, description, status, color, now, id],
    ).map_err(|e| e.to_string())?;

    let p = conn.query_row(
        "SELECT id, name, description, rpi_model, status, created_at, updated_at, color FROM projects WHERE id = ?",
        [id],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                rpi_model: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                color: row.get(7)?,
            })
        },
    ).map_err(|e| e.to_string())?;
    Ok(p)
}

#[tauri::command]
async fn delete_project(app: AppHandle, id: String) -> std::result::Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM projects WHERE id = ?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

// Tasks CRUD
#[tauri::command]
async fn list_tasks(app: AppHandle, projectId: String) -> std::result::Result<Vec<Task>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, status, priority, labels, due_date, time_estimate,
                milestone_id, canvas_node_id, graph_node_id, column_id, position, created_at, updated_at
         FROM tasks WHERE project_id = ? ORDER BY position ASC"
    ).map_err(|e| e.to_string())?;

    let task_iter = stmt.query_map([projectId], |row| {
        let labels_str: String = row.get(6)?;
        let labels: Vec<String> = serde_json::from_str(&labels_str).unwrap_or_default();
        
        Ok(Task {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            status: row.get(4)?,
            priority: row.get(5)?,
            labels,
            due_date: row.get(7)?,
            time_estimate: row.get(8)?,
            milestone_id: row.get(9)?,
            canvas_node_id: row.get(10)?,
            graph_node_id: row.get(11)?,
            column_id: row.get(12)?,
            position: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for t in task_iter {
        tasks.push(t.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

#[tauri::command]
async fn create_task(app: AppHandle, task: Task) -> std::result::Result<Task, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let labels_str = serde_json::to_string(&task.labels).unwrap_or_else(|_| "[]".to_string());
    
    conn.execute(
        "INSERT INTO tasks (id, project_id, title, description, status, priority, labels, due_date, time_estimate,
                            milestone_id, canvas_node_id, graph_node_id, column_id, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            task.id,
            task.project_id,
            task.title,
            task.description,
            task.status,
            task.priority,
            labels_str,
            task.due_date,
            task.time_estimate,
            task.milestone_id,
            task.canvas_node_id,
            task.graph_node_id,
            task.column_id,
            task.position,
            task.created_at,
            task.updated_at
        ],
    ).map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
async fn update_task(app: AppHandle, task: Task) -> std::result::Result<Task, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let labels_str = serde_json::to_string(&task.labels).unwrap_or_else(|_| "[]".to_string());
    let now = chrono::Utc::now().timestamp_millis();

    conn.execute(
        "UPDATE tasks SET
            title = ?1, description = ?2, status = ?3, priority = ?4, labels = ?5, due_date = ?6,
            time_estimate = ?7, milestone_id = ?8, canvas_node_id = ?9, graph_node_id = ?10,
            column_id = ?11, position = ?12, updated_at = ?13
         WHERE id = ?14",
        params![
            task.title,
            task.description,
            task.status,
            task.priority,
            labels_str,
            task.due_date,
            task.time_estimate,
            task.milestone_id,
            task.canvas_node_id,
            task.graph_node_id,
            task.column_id,
            task.position,
            now,
            task.id
        ],
    ).map_err(|e| e.to_string())?;
    
    let mut updated = task;
    updated.updated_at = now;
    Ok(updated)
}

#[tauri::command]
async fn delete_task(app: AppHandle, id: String) -> std::result::Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE id = ?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

// Columns
#[tauri::command]
async fn list_columns(app: AppHandle, projectId: String) -> std::result::Result<Vec<Column>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, project_id, name, color, position, is_done FROM columns WHERE project_id = ? ORDER BY position ASC")
        .map_err(|e| e.to_string())?;
    
    let col_iter = stmt.query_map([projectId], |row| {
        let is_done_val: i32 = row.get(5)?;
        Ok(Column {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            position: row.get(4)?,
            is_done: is_done_val != 0,
        })
    }).map_err(|e| e.to_string())?;

    let mut columns = Vec::new();
    for c in col_iter {
        columns.push(c.map_err(|e| e.to_string())?);
    }
    Ok(columns)
}

#[tauri::command]
async fn save_column(app: AppHandle, column: Column) -> std::result::Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let is_done_val = if column.is_done { 1 } else { 0 };
    
    conn.execute(
        "INSERT INTO columns (id, project_id, name, color, position, is_done)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            position = EXCLUDED.position,
            is_done = EXCLUDED.is_done",
        params![
            column.id,
            column.project_id,
            column.name,
            column.color,
            column.position,
            is_done_val
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// Canvas States
#[tauri::command]
async fn save_canvas_state(app: AppHandle, projectId: String, state: String) -> std::result::Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();
    
    conn.execute(
        "INSERT INTO canvas_states (project_id, state_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(project_id) DO UPDATE SET
            state_json = EXCLUDED.state_json,
            updated_at = EXCLUDED.updated_at",
        params![projectId, state, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_canvas_state(app: AppHandle, projectId: String) -> std::result::Result<Option<String>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let res = conn.query_row(
        "SELECT state_json FROM canvas_states WHERE project_id = ?",
        [projectId],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;
    Ok(res)
}

// Notes
#[tauri::command]
async fn save_notes(app: AppHandle, projectId: String, content: String) -> std::result::Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();
    
    conn.execute(
        "INSERT INTO notes (project_id, content, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(project_id) DO UPDATE SET
            content = EXCLUDED.content,
            updated_at = EXCLUDED.updated_at",
        params![projectId, content, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_notes(app: AppHandle, projectId: String) -> std::result::Result<String, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let res = conn.query_row(
        "SELECT content FROM notes WHERE project_id = ?",
        [projectId],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;
    Ok(res.unwrap_or_default())
}

// Settings
#[tauri::command]
async fn get_settings(app: AppHandle) -> std::result::Result<UserSettings, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    
    let theme: String = conn.query_row("SELECT value FROM settings WHERE key = 'theme'", [], |row| row.get(0))
        .unwrap_or_else(|_| "dark".to_string());
    let accent_color: String = conn.query_row("SELECT value FROM settings WHERE key = 'accent_color'", [], |row| row.get(0))
        .unwrap_or_else(|_| "coral".to_string());
    let font_size: String = conn.query_row("SELECT value FROM settings WHERE key = 'font_size'", [], |row| row.get(0))
        .unwrap_or_else(|_| "default".to_string());
    let grid_type: String = conn.query_row("SELECT value FROM settings WHERE key = 'grid_type'", [], |row| row.get(0))
        .unwrap_or_else(|_| "dots".to_string());
    let snap_to_grid_str: String = conn.query_row("SELECT value FROM settings WHERE key = 'snap_to_grid'", [], |row| row.get(0))
        .unwrap_or_else(|_| "true".to_string());
    
    Ok(UserSettings {
        theme,
        accent_color,
        font_size,
        grid_type,
        snap_to_grid: snap_to_grid_str == "true",
    })
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: UserSettings) -> std::result::Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    
    let kv = vec![
        ("theme", settings.theme),
        ("accent_color", settings.accent_color),
        ("font_size", settings.font_size),
        ("grid_type", settings.grid_type),
        ("snap_to_grid", if settings.snap_to_grid { "true" } else { "false" }.to_string()),
    ];

    for (k, v) in kv {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            [k, &v],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Build runner setup
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = get_connection(app.handle())?;
            run_migrations(&conn)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            list_projects,
            get_project,
            update_project,
            delete_project,
            list_tasks,
            create_task,
            update_task,
            delete_task,
            list_columns,
            save_column,
            save_canvas_state,
            load_canvas_state,
            save_notes,
            load_notes,
            get_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
