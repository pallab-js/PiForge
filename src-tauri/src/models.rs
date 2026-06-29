use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub rpi_model: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub labels: Vec<String>,
    pub due_date: Option<i64>,
    pub time_estimate: Option<i32>,
    pub milestone_id: Option<String>,
    pub canvas_node_id: Option<String>,
    pub graph_node_id: Option<String>,
    pub column_id: String,
    pub position: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub color: String,
    pub position: f64,
    pub is_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub theme: String,
    pub accent_color: String,
    pub font_size: String,
    pub grid_type: String,
    pub snap_to_grid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryComponent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub pin_count: i32,
    pub icon_svg: String,
    pub is_builtin: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub id: String,
    pub task_id: String,
    pub text: String,
    pub done: bool,
    pub position: f64,
}
