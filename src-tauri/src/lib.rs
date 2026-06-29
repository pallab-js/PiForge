pub mod models;
pub mod db;
pub mod deploy;

use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use db::{DbState, get_connection, run_migrations};
use deploy::PiConnectionState;

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

pub type Result<T> = std::result::Result<T, Error>;

// --- INPUT VALIDATIONS (SEC-04) ---

fn validate_project(p: &models::Project) -> std::result::Result<(), String> {
    if p.id.is_empty() || p.id.len() > 100 {
        return Err("Invalid project ID".into());
    }
    if p.name.trim().is_empty() || p.name.len() > 200 {
        return Err("Project name must be 1-200 characters".into());
    }
    if p.description.len() > 10000 {
        return Err("Description must be under 10,000 characters".into());
    }
    if p.rpi_model.len() > 50 {
        return Err("Invalid board model".into());
    }
    if p.status != "planning" && p.status != "active" && p.status != "archived" {
        return Err("Invalid project status".into());
    }
    if !p.color.starts_with('#') || p.color.len() > 10 {
        return Err("Invalid project color".into());
    }
    Ok(())
}

fn validate_task(t: &models::Task) -> std::result::Result<(), String> {
    if t.id.is_empty() || t.id.len() > 100 {
        return Err("Invalid task ID".into());
    }
    if t.project_id.is_empty() || t.project_id.len() > 100 {
        return Err("Invalid project ID in task".into());
    }
    if t.title.trim().is_empty() || t.title.len() > 200 {
        return Err("Task title must be 1-200 characters".into());
    }
    if t.description.len() > 10000 {
        return Err("Task description must be under 10,000 characters".into());
    }
    if t.status.len() > 50 {
        return Err("Invalid task status".into());
    }
    if t.priority != "p0" && t.priority != "p1" && t.priority != "p2" && t.priority != "p3" {
        return Err("Invalid task priority".into());
    }
    if t.column_id.len() > 100 {
        return Err("Invalid column ID".into());
    }
    Ok(())
}

fn validate_column(c: &models::Column) -> std::result::Result<(), String> {
    if c.id.is_empty() || c.id.len() > 100 {
        return Err("Invalid column ID".into());
    }
    if c.project_id.is_empty() || c.project_id.len() > 100 {
        return Err("Invalid project ID in column".into());
    }
    if c.name.trim().is_empty() || c.name.len() > 100 {
        return Err("Column name must be 1-100 characters".into());
    }
    if c.color.len() > 50 {
        return Err("Invalid column color".into());
    }
    Ok(())
}

fn validate_canvas_state(state: &str) -> std::result::Result<(), String> {
    if state.len() > 10 * 1024 * 1024 {
        return Err("Canvas state too large (max 10MB)".into());
    }
    Ok(())
}

fn validate_notes(notes: &str) -> std::result::Result<(), String> {
    if notes.len() > 1024 * 1024 {
        return Err("Notes too large (max 1MB)".into());
    }
    Ok(())
}

fn validate_settings(s: &models::UserSettings) -> std::result::Result<(), String> {
    if s.theme.len() > 50 || s.accent_color.len() > 50 || s.font_size.len() > 50 || s.grid_type.len() > 50 {
        return Err("Invalid settings value length".into());
    }
    Ok(())
}

fn validate_custom_component(c: &models::LibraryComponent) -> std::result::Result<(), String> {
    if c.id.is_empty() || c.id.len() > 100 {
        return Err("Invalid component ID".into());
    }
    if c.name.trim().is_empty() || c.name.len() > 100 {
        return Err("Component name must be 1-100 characters".into());
    }
    if c.description.len() > 1000 {
        return Err("Component description must be under 1,000 characters".into());
    }
    if c.category.len() > 50 {
        return Err("Component category must be under 50 characters".into());
    }
    if c.pin_count < 1 || c.pin_count > 100 {
        return Err("Pin count must be between 1 and 100".into());
    }
    if c.icon_svg.len() > 50 * 1024 {
        return Err("Component icon SVG too large (max 50KB)".into());
    }
    Ok(())
}

fn validate_checklist_item(item: &models::ChecklistItem) -> std::result::Result<(), String> {
    if item.id.is_empty() || item.id.len() > 100 {
        return Err("Invalid checklist item ID".into());
    }
    if item.task_id.is_empty() || item.task_id.len() > 100 {
        return Err("Invalid task ID in checklist item".into());
    }
    if item.text.trim().is_empty() || item.text.len() > 500 {
        return Err("Checklist item text must be 1-500 characters".into());
    }
    Ok(())
}

// --- TAURI COMMANDS ---

// Projects CRUD
#[tauri::command]
async fn create_project(
    state: tauri::State<'_, DbState>,
    project: models::Project,
) -> std::result::Result<models::Project, String> {
    validate_project(&project)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
async fn list_projects(
    state: tauri::State<'_, DbState>,
) -> std::result::Result<Vec<models::Project>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, description, rpi_model, status, created_at, updated_at, color FROM projects ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    
    let proj_iter = stmt.query_map([], |row| {
        Ok(models::Project {
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
async fn get_project(
    state: tauri::State<'_, DbState>,
    id: String,
) -> std::result::Result<Option<models::Project>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let res = conn.query_row(
        "SELECT id, name, description, rpi_model, status, created_at, updated_at, color FROM projects WHERE id = ?",
        [id],
        |row| {
            Ok(models::Project {
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
    state: tauri::State<'_, DbState>,
    id: String,
    name: String,
    description: String,
    status: String,
    color: String,
) -> std::result::Result<models::Project, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
    // Fetch current project to retain rpi_model for validation
    let current_project = conn.query_row(
        "SELECT rpi_model, created_at FROM projects WHERE id = ?",
        [&id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    ).map_err(|e| e.to_string())?;

    let updated = models::Project {
        id: id.clone(),
        name: name.clone(),
        description: description.clone(),
        rpi_model: current_project.0,
        status: status.clone(),
        created_at: current_project.1,
        updated_at: now,
        color: color.clone(),
    };
    validate_project(&updated)?;

    conn.execute(
        "UPDATE projects SET name = ?1, description = ?2, status = ?3, color = ?4, updated_at = ?5 WHERE id = ?6",
        params![name, description, status, color, now, id],
    ).map_err(|e| e.to_string())?;

    Ok(updated)
}

#[tauri::command]
async fn delete_project(
    state: tauri::State<'_, DbState>,
    id: String,
) -> std::result::Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM projects WHERE id = ?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

// Tasks CRUD
#[tauri::command]
#[allow(non_snake_case)]
async fn list_tasks(
    state: tauri::State<'_, DbState>,
    projectId: String,
) -> std::result::Result<Vec<models::Task>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, status, priority, labels, due_date, time_estimate,
                milestone_id, canvas_node_id, graph_node_id, column_id, position, created_at, updated_at
         FROM tasks WHERE project_id = ? ORDER BY position ASC"
    ).map_err(|e| e.to_string())?;

    let task_iter = stmt.query_map([projectId], |row| {
        let labels_str: String = row.get(6)?;
        let labels: Vec<String> = serde_json::from_str(&labels_str).unwrap_or_default();
        
        Ok(models::Task {
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
async fn create_task(
    state: tauri::State<'_, DbState>,
    task: models::Task,
) -> std::result::Result<models::Task, String> {
    validate_task(&task)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
async fn update_task(
    state: tauri::State<'_, DbState>,
    task: models::Task,
) -> std::result::Result<models::Task, String> {
    validate_task(&task)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
async fn delete_task(
    state: tauri::State<'_, DbState>,
    id: String,
) -> std::result::Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE id = ?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

// Columns
#[tauri::command]
#[allow(non_snake_case)]
async fn list_columns(
    state: tauri::State<'_, DbState>,
    projectId: String,
) -> std::result::Result<Vec<models::Column>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, project_id, name, color, position, is_done FROM columns WHERE project_id = ? ORDER BY position ASC")
        .map_err(|e| e.to_string())?;
    
    let col_iter = stmt.query_map([projectId], |row| {
        let is_done_val: i32 = row.get(5)?;
        Ok(models::Column {
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
async fn save_column(
    state: tauri::State<'_, DbState>,
    column: models::Column,
) -> std::result::Result<(), String> {
    validate_column(&column)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
#[allow(non_snake_case)]
async fn save_canvas_state(
    db_state: tauri::State<'_, DbState>,
    projectId: String,
    state: String,
) -> std::result::Result<(), String> {
    validate_canvas_state(&state)?;
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
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
#[allow(non_snake_case)]
async fn load_canvas_state(
    state: tauri::State<'_, DbState>,
    projectId: String,
) -> std::result::Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let res = conn.query_row(
        "SELECT state_json FROM canvas_states WHERE project_id = ?",
        [projectId],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;
    Ok(res)
}

// Notes
#[tauri::command]
#[allow(non_snake_case)]
async fn save_notes(
    state: tauri::State<'_, DbState>,
    projectId: String,
    content: String,
) -> std::result::Result<(), String> {
    validate_notes(&content)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
#[allow(non_snake_case)]
async fn load_notes(
    state: tauri::State<'_, DbState>,
    projectId: String,
) -> std::result::Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let res = conn.query_row(
        "SELECT content FROM notes WHERE project_id = ?",
        [projectId],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;
    Ok(res.unwrap_or_default())
}

// Settings
#[tauri::command]
async fn get_settings(
    state: tauri::State<'_, DbState>,
) -> std::result::Result<models::UserSettings, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
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
    
    Ok(models::UserSettings {
        theme,
        accent_color,
        font_size,
        grid_type,
        snap_to_grid: snap_to_grid_str == "true",
    })
}

#[tauri::command]
async fn save_settings(
    state: tauri::State<'_, DbState>,
    settings: models::UserSettings,
) -> std::result::Result<(), String> {
    validate_settings(&settings)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
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

// Custom Components
#[tauri::command]
async fn list_custom_components(
    state: tauri::State<'_, DbState>,
) -> std::result::Result<Vec<models::LibraryComponent>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, category, pin_count, icon_svg, is_builtin, created_at FROM custom_components ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let list = stmt
        .query_map([], |row| {
            let is_builtin_int: i32 = row.get(6)?;
            Ok(models::LibraryComponent {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                category: row.get(3)?,
                pin_count: row.get(4)?,
                icon_svg: row.get(5)?,
                is_builtin: is_builtin_int == 1,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    
    Ok(list)
}

#[tauri::command]
async fn save_custom_component(
    state: tauri::State<'_, DbState>,
    component: models::LibraryComponent,
) -> std::result::Result<models::LibraryComponent, String> {
    validate_custom_component(&component)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let is_builtin_int = if component.is_builtin { 1 } else { 0 };
    
    conn.execute(
        "INSERT INTO custom_components (id, name, description, category, pin_count, icon_svg, is_builtin, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            pin_count = EXCLUDED.pin_count,
            icon_svg = EXCLUDED.icon_svg,
            is_builtin = EXCLUDED.is_builtin",
        params![
            component.id,
            component.name,
            component.description,
            component.category,
            component.pin_count,
            component.icon_svg,
            is_builtin_int,
            component.created_at,
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(component)
}

#[tauri::command]
async fn delete_custom_component(
    state: tauri::State<'_, DbState>,
    id: String,
) -> std::result::Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM custom_components WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Checklist Items (ROB-04)
#[tauri::command]
#[allow(non_snake_case)]
async fn list_checklist_items(
    state: tauri::State<'_, DbState>,
    taskId: String,
) -> std::result::Result<Vec<models::ChecklistItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, task_id, text, done, position FROM checklist_items WHERE task_id = ? ORDER BY position ASC")
        .map_err(|e| e.to_string())?;

    let items_iter = stmt
        .query_map([taskId], |row| {
            let done_val: i32 = row.get(3)?;
            Ok(models::ChecklistItem {
                id: row.get(0)?,
                task_id: row.get(1)?,
                text: row.get(2)?,
                done: done_val != 0,
                position: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for item in items_iter {
        items.push(item.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
async fn save_checklist_item(
    state: tauri::State<'_, DbState>,
    item: models::ChecklistItem,
) -> std::result::Result<(), String> {
    validate_checklist_item(&item)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let done_val = if item.done { 1 } else { 0 };

    conn.execute(
        "INSERT INTO checklist_items (id, task_id, text, done, position)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
            text = EXCLUDED.text,
            done = EXCLUDED.done,
            position = EXCLUDED.position",
        params![item.id, item.task_id, item.text, done_val, item.position],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_checklist_item(
    state: tauri::State<'_, DbState>,
    id: String,
) -> std::result::Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM checklist_items WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Graph States (ROB-05)
#[tauri::command]
#[allow(non_snake_case)]
async fn save_graph_state(
    state: tauri::State<'_, DbState>,
    projectId: String,
    stateJson: String,
) -> std::result::Result<(), String> {
    validate_canvas_state(&stateJson)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();

    conn.execute(
        "INSERT INTO graph_states (project_id, state_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(project_id) DO UPDATE SET
            state_json = EXCLUDED.state_json,
            updated_at = EXCLUDED.updated_at",
        params![projectId, stateJson, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
async fn load_graph_state(
    state: tauri::State<'_, DbState>,
    projectId: String,
) -> std::result::Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let res = conn
        .query_row(
            "SELECT state_json FROM graph_states WHERE project_id = ?",
            [projectId],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(res)
}

// Build runner setup
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = get_connection(app.handle())?;
            
            // PERF-02: Enable WAL mode, busy timeout, and synchronous NORMAL using pragma_update
            conn.pragma_update(None, "journal_mode", &"WAL")?;
            conn.pragma_update(None, "busy_timeout", &5000)?;
            conn.pragma_update(None, "synchronous", &"NORMAL")?;

            run_migrations(&conn)?;
            
            app.manage(DbState {
                conn: std::sync::Mutex::new(conn),
            });
            app.manage(PiConnectionState {
                child_process: std::sync::Mutex::new(None),
            });
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
            save_settings,
            list_custom_components,
            save_custom_component,
            delete_custom_component,
            list_checklist_items,
            save_checklist_item,
            delete_checklist_item,
            save_graph_state,
            load_graph_state,
            deploy::deploy_and_run_pi,
            deploy::stop_pi_execution
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("Failed to open test database");
        run_migrations(&conn).expect("Failed to run database migrations");
        conn
    }

    #[test]
    fn test_database_migrations_integrity() {
        let conn = setup_test_db();
        
        // Verify tables exist
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|t| t.unwrap())
            .collect();
            
        assert!(tables.contains(&"projects".to_string()));
        assert!(tables.contains(&"tasks".to_string()));
        assert!(tables.contains(&"columns".to_string()));
        assert!(tables.contains(&"canvas_states".to_string()));
        assert!(tables.contains(&"notes".to_string()));
        assert!(tables.contains(&"settings".to_string()));
        assert!(tables.contains(&"checklist_items".to_string()));
        assert!(tables.contains(&"graph_states".to_string()));
    }

    #[test]
    fn test_project_crud_lifecycle() {
        let conn = setup_test_db();
        let project_id = "test-project-uuid-1".to_string();
        
        // 1. Create Project
        conn.execute(
            "INSERT INTO projects (id, name, description, rpi_model, status, created_at, updated_at, color)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                project_id,
                "Smart Greenhouse",
                "Greenhouse controller description",
                "rpi5",
                "planning",
                123456789,
                123456789,
                "#cc785c"
            ],
        ).unwrap();

        // 2. Read Project
        let name: String = conn
            .query_row(
                "SELECT name FROM projects WHERE id = ?",
                [&project_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "Smart Greenhouse");

        // 3. Update Project
        conn.execute(
            "UPDATE projects SET name = ?, status = ? WHERE id = ?",
            params!["Greenhouse Alpha", "active", project_id],
        ).unwrap();
        
        let (updated_name, status): (String, String) = conn
            .query_row(
                "SELECT name, status FROM projects WHERE id = ?",
                [&project_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(updated_name, "Greenhouse Alpha");
        assert_eq!(status, "active");

        // 4. Delete Project
        conn.execute("DELETE FROM projects WHERE id = ?", [&project_id]).unwrap();
        let exists: Option<String> = conn
            .query_row(
                "SELECT name FROM projects WHERE id = ?",
                [&project_id],
                |row| row.get(0),
            )
            .optional()
            .unwrap();
        assert!(exists.is_none());
    }

    #[test]
    fn test_task_crud_and_cascade_deletion() {
        let conn = setup_test_db();
        let proj_id = "proj-1".to_string();
        let task_id = "task-1".to_string();
        let col_id = "backlog".to_string();

        // Seed project first
        conn.execute(
            "INSERT INTO projects (id, name, description, rpi_model, status, created_at, updated_at, color)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![proj_id, "Greenhouse", "Desc", "rpi5", "planning", 100, 100, "coral"],
        ).unwrap();

        // 1. Insert Task
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, description, status, priority, labels, due_date, time_estimate, column_id, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                task_id,
                proj_id,
                "Wiring up DHT22",
                "Connect data pin to GPIO 4",
                "backlog",
                "p1",
                "[\"hardware\"]",
                None::<i64>,
                30,
                col_id,
                1.0,
                100,
                100
            ],
        ).unwrap();

        // Verify task exists
        let title: String = conn
            .query_row(
                "SELECT title FROM tasks WHERE id = ?",
                [&task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "Wiring up DHT22");

        // 2. Cascade Delete: Deleting project should delete connected tasks automatically
        conn.execute("DELETE FROM projects WHERE id = ?", [&proj_id]).unwrap();

        let task_exists: Option<String> = conn
            .query_row(
                "SELECT title FROM tasks WHERE id = ?",
                [&task_id],
                |row| row.get(0),
            )
            .optional()
            .unwrap();
        assert!(task_exists.is_none()); // Deleted by cascade!
    }

    #[test]
    fn test_canvas_state_and_notes_persistence() {
        let conn = setup_test_db();
        let proj_id = "proj-2".to_string();
        let canvas_json = "{\"version\":\"1.0\",\"nodes\":[],\"edges\":[]}".to_string();
        let markdown_notes = "# Smart controller documentation".to_string();

        // Seed project first
        conn.execute(
            "INSERT INTO projects (id, name, description, rpi_model, status, created_at, updated_at, color)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![proj_id, "Test Project", "Desc", "rpi5", "planning", 100, 100, "coral"],
        ).unwrap();

        // 1. Save and Load Canvas State
        conn.execute(
            "INSERT INTO canvas_states (project_id, state_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(project_id) DO UPDATE SET state_json = EXCLUDED.state_json",
            params![proj_id, canvas_json, 12345],
        ).unwrap();

        let loaded_canvas: String = conn
            .query_row(
                "SELECT state_json FROM canvas_states WHERE project_id = ?",
                [&proj_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(loaded_canvas, canvas_json);

        // 2. Save and Load Documentation Notes
        conn.execute(
            "INSERT INTO notes (project_id, content, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(project_id) DO UPDATE SET content = EXCLUDED.content",
            params![proj_id, markdown_notes, 12345],
        ).unwrap();

        let loaded_notes: String = conn
            .query_row(
                "SELECT content FROM notes WHERE project_id = ?",
                [&proj_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(loaded_notes, markdown_notes);
    }
}
