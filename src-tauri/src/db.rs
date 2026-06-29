use std::fs;
use std::sync::Mutex;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use crate::Result;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

// DB connection helper
pub fn get_connection(app: &AppHandle) -> Result<Connection> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::Error::Tauri(e.to_string()))?;
    
    fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("piforge.db");
    let conn = Connection::open(db_path)?;
    Ok(conn)
}

// Database Migrations
pub fn run_migrations(conn: &Connection) -> Result<()> {
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS custom_components (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            pin_count INTEGER NOT NULL,
            icon_svg TEXT NOT NULL,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    // ROB-04: Add checklist_items table to SQLite migrations
    conn.execute(
        "CREATE TABLE IF NOT EXISTS checklist_items (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            position REAL NOT NULL DEFAULT 0
        )",
        [],
    )?;

    // ROB-05: Add graph_states table to SQLite migrations
    conn.execute(
        "CREATE TABLE IF NOT EXISTS graph_states (
            project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            state_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // PERF-03: Add database indexes on FK columns
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_columns_project_id ON columns(project_id);", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_canvas_states_project_id ON canvas_states(project_id);", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_checklist_items_task_id ON checklist_items(task_id);", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_graph_states_project_id ON graph_states(project_id);", [])?;

    Ok(())
}
