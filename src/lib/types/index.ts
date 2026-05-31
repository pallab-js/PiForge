// PiForge Types Definitions

export interface Project {
  id: string;
  name: string;
  description: string;
  rpi_model: string; // 'rpi4b' | 'rpi5' | 'rpi-zero2w' | 'rpi-pico' | 'rpi-pico-w' | 'rpi3b-plus' | 'rpi-cm4'
  status: 'planning' | 'active' | 'shipped' | 'archived';
  created_at: number; // Unix ms
  updated_at: number;
  color: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string; // Markdown
  status: string; // 'backlog' | 'in_progress' | 'review' | 'done'
  priority: 'p0' | 'p1' | 'p2' | 'p3'; // critical, high, medium, low
  labels: string[];
  due_date: number | null;
  time_estimate: number | null; // in minutes
  milestone_id: string | null;
  canvas_node_id: string | null;
  graph_node_id: string | null;
  column_id: string;
  position: number;
  created_at: number;
  updated_at: number;
  checklist?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  due_date: number | null;
  created_at: number;
}

export interface Column {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  is_done: boolean;
}

export interface LibraryComponent {
  id: string;
  name: string;
  description: string;
  category: 'gpio' | 'sensors' | 'actuators' | 'displays' | 'power' | 'communication';
  icon_svg: string;
  pin_count: number;
  datasheet_path?: string;
  is_builtin: boolean;
  created_at: number;
}

export interface CanvasState {
  version: string;
  viewport: {
    x: number;
    y: number;
    scale: number;
  };
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasNode {
  id: string;
  type: 'rpi_board' | 'component' | 'text' | 'sticky' | 'shape' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  boardModel?: string; // e.g., 'rpi4b', 'rpi5', etc.
  componentId?: string;
  taskId?: string;
  style: {
    fill?: string;
    stroke?: string;
    fontSize?: number;
    fontFamily?: string;
  };
  locked: boolean;
  zIndex: number;
}

export interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePinId?: string; // GPIO physical or BCM identifier
  targetPinId?: string;
  label?: string;
  type: 'wire' | 'power' | 'data' | 'i2c' | 'spi' | 'uart' | 'custom';
  color?: string;
  style: 'solid' | 'dashed';
}

export interface GraphState {
  version: string;
  layout: 'cose-bilkent' | 'dagre' | 'grid' | 'concentric' | 'breadthfirst';
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: 'task' | 'component' | 'service' | 'rpi_board' | 'external';
  label: string;
  taskId?: string;
  componentId?: string;
  position?: { x: number; y: number };
  meta?: Record<string, string>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'depends_on' | 'connects_to' | 'powers' | 'communicates' | 'custom';
  label?: string;
  directed: boolean;
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'warm';
  accent_color: 'coral' | 'teal' | 'amber' | 'violet';
  font_size: 'compact' | 'default' | 'comfortable';
  grid_type: 'dots' | 'lines' | 'none';
  snap_to_grid: boolean;
}
