import { invoke } from '@tauri-apps/api/core';
import type { Project, Task, Column, ChecklistItem, Milestone, CanvasState, GraphState, LibraryComponent, UserSettings } from './types';

// Check if running inside Tauri
export function isTauri(): boolean {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
}

// Generate UUID
export function uuid(): string {
  return crypto.randomUUID();
}

// IN-MEMORY / LOCAL STORAGE FALLBACK DB MANAGER
class MockDb {
  private getStorage<T>(key: string, defaultValue: T): T {
    if (typeof localStorage === 'undefined') return defaultValue;
    const data = localStorage.getItem(`piforge_${key}`);
    if (!data) return defaultValue;
    try {
      return JSON.parse(data);
    } catch {
      console.warn(`Corrupted localStorage for ${key}, resetting to default`);
      localStorage.removeItem(`piforge_${key}`);
      return defaultValue;
    }
  }

  private setStorage<T>(key: string, value: T): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`piforge_${key}`, JSON.stringify(value));
  }

  // Database structure
  get projects(): Project[] { return this.getStorage<Project[]>('projects', []); }
  set projects(val: Project[]) { this.setStorage('projects', val); }

  get tasks(): Task[] { return this.getStorage<Task[]>('tasks', []); }
  set tasks(val: Task[]) { this.setStorage('tasks', val); }

  get columns(): Column[] { return this.getStorage<Column[]>('columns', []); }
  set columns(val: Column[]) { this.setStorage('columns', val); }

  get milestones(): Milestone[] { return this.getStorage<Milestone[]>('milestones', []); }
  set milestones(val: Milestone[]) { this.setStorage('milestones', val); }

  get checklistItems(): ChecklistItem[] { return this.getStorage<ChecklistItem[]>('checklist_items', []); }
  set checklistItems(val: ChecklistItem[]) { this.setStorage('checklist_items', val); }

  get canvasStates(): Record<string, CanvasState> { return this.getStorage<Record<string, CanvasState>>('canvas_states', {}); }
  set canvasStates(val: Record<string, CanvasState>) { this.setStorage('canvas_states', val); }

  get graphStates(): Record<string, GraphState> { return this.getStorage<Record<string, GraphState>>('graph_states', {}); }
  set graphStates(val: Record<string, GraphState>) { this.setStorage('graph_states', val); }

  get notes(): Record<string, string> { return this.getStorage<Record<string, string>>('notes', {}); }
  set notes(val: Record<string, string>) { this.setStorage('notes', val); }

  get components(): LibraryComponent[] { return this.getStorage<LibraryComponent[]>('components', []); }
  set components(val: LibraryComponent[]) { this.setStorage('components', val); }

  get settings(): UserSettings {
    return this.getStorage<UserSettings>('settings', {
      theme: 'dark',
      accent_color: 'coral',
      font_size: 'default',
      grid_type: 'dots',
      snap_to_grid: true
    });
  }
  set settings(val: UserSettings) { this.setStorage('settings', val); }
}

const mockDb = new MockDb();

// INITIALIZE DEFAULT COLUMNS FOR PROJECT
export function createDefaultColumns(projectId: string): Column[] {
  return [
    { id: uuid(), project_id: projectId, name: 'Backlog', color: '#6c6a64', position: 1, is_done: false },
    { id: uuid(), project_id: projectId, name: 'In Progress', color: '#e8a55a', position: 2, is_done: false },
    { id: uuid(), project_id: projectId, name: 'Review', color: '#5db8a6', position: 3, is_done: false },
    { id: uuid(), project_id: projectId, name: 'Done', color: '#5db872', position: 4, is_done: true }
  ];
}

// PROJECT OPERATIONS
export async function createProject(name: string, description: string, rpiModel: string, color: string): Promise<Project> {
  const newProject: Project = {
    id: uuid(),
    name,
    description,
    rpi_model: rpiModel,
    status: 'planning',
    created_at: Date.now(),
    updated_at: Date.now(),
    color
  };

  if (isTauri()) {
    try {
      return await invoke<Project>('create_project', { project: newProject });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock database:', e);
    }
  }

  // Mock
  mockDb.projects = [...mockDb.projects, newProject];
  // Seed default columns
  const defaultCols = createDefaultColumns(newProject.id);
  mockDb.columns = [...mockDb.columns, ...defaultCols];

  // Seed default canvas state
  const defaultCanvas: CanvasState = {
    version: '1.0',
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [
      {
        id: uuid(),
        type: 'rpi_board',
        x: 100,
        y: 100,
        width: 320,
        height: 220,
        boardModel: rpiModel,
        locked: false,
        zIndex: 1,
        style: {}
      }
    ],
    edges: []
  };
  const currentStates = mockDb.canvasStates;
  currentStates[newProject.id] = defaultCanvas;
  mockDb.canvasStates = currentStates;

  return newProject;
}

export async function listProjects(): Promise<Project[]> {
  if (isTauri()) {
    try {
      return await invoke<Project[]>('list_projects');
    } catch (e) {
      console.warn('Tauri invoke failed, using mock database:', e);
    }
  }

  // Seed default demo project if empty
  if (mockDb.projects.length === 0) {
    const demo: Project = {
      id: 'demo-project-id',
      name: 'Smart Greenhouse Controller',
      description: 'An automated RPi greenhouse manager with ventilation, watering, and temperature graphing.',
      rpi_model: 'rpi4b',
      status: 'active',
      created_at: Date.now() - 86400000 * 5,
      updated_at: Date.now(),
      color: '#cc785c'
    };
    mockDb.projects = [demo];
    
    // Seed columns
    const cols = createDefaultColumns(demo.id);
    mockDb.columns = cols;

    // Seed tasks
    const tasks: Task[] = [
      {
        id: 'task-1',
        project_id: demo.id,
        title: 'Design GPIO Wiring Diagram',
        description: 'Create the wiring diagram on the visual canvas showing connections for DHT22, water pump relay, and OLED status screen.',
        status: 'done',
        priority: 'p1',
        labels: ['hardware', 'planning'],
        due_date: Date.now() - 86400000,
        time_estimate: 60,
        milestone_id: null,
        canvas_node_id: null,
        graph_node_id: null,
        column_id: cols[3].id, // Done
        position: 1,
        created_at: Date.now() - 86400000 * 4,
        updated_at: Date.now() - 86400000
      },
      {
        id: 'task-2',
        project_id: demo.id,
        title: 'Write I2C OLED Driver Script',
        description: 'Implement python code using `Adafruit_SSD1306` library to draw temperature, humidity, and relay states on the display screen.',
        status: 'in_progress',
        priority: 'p0',
        labels: ['software', 'python'],
        due_date: Date.now() + 86400000 * 2,
        time_estimate: 120,
        milestone_id: null,
        canvas_node_id: null,
        graph_node_id: null,
        column_id: cols[1].id, // In Progress
        position: 1,
        created_at: Date.now() - 86400000 * 3,
        updated_at: Date.now()
      },
      {
        id: 'task-3',
        project_id: demo.id,
        title: 'Calibrate DHT22 Temp Sensor',
        description: 'Test the DHT22 readings against a reference thermometer to ensure we have high accuracy in extreme heat ranges.',
        status: 'backlog',
        priority: 'p2',
        labels: ['sensors', 'calibration'],
        due_date: null,
        time_estimate: 30,
        milestone_id: null,
        canvas_node_id: null,
        graph_node_id: null,
        column_id: cols[0].id, // Backlog
        position: 1,
        created_at: Date.now() - 86400000 * 2,
        updated_at: Date.now()
      }
    ];
    mockDb.tasks = tasks;

    // Seed checklist
    mockDb.checklistItems = [
      { id: 'check-1', task_id: 'task-2', text: 'Initialize I2C bus', done: true, position: 1 },
      { id: 'check-2', task_id: 'task-2', text: 'Render custom font', done: false, position: 2 },
      { id: 'check-3', task_id: 'task-2', text: 'Create screen rotation script', done: false, position: 3 }
    ];

    // Seed canvas state
    const demoCanvas: CanvasState = {
      version: '1.0',
      viewport: { x: 50, y: 50, scale: 0.95 },
      nodes: [
        {
          id: 'node-rpi',
          type: 'rpi_board',
          x: 100,
          y: 100,
          width: 320,
          height: 220,
          boardModel: 'rpi4b',
          locked: false,
          zIndex: 1,
          style: {}
        },
        {
          id: 'node-dht22',
          type: 'component',
          x: 550,
          y: 80,
          width: 120,
          height: 80,
          label: 'DHT22 Temp Sensor',
          componentId: 'dht22',
          locked: false,
          zIndex: 2,
          style: {}
        },
        {
          id: 'node-relay',
          type: 'component',
          x: 550,
          y: 280,
          width: 120,
          height: 80,
          label: 'Water Pump Relay',
          componentId: 'relay',
          locked: false,
          zIndex: 3,
          style: {}
        },
        {
          id: 'node-note',
          type: 'sticky',
          x: 200,
          y: 400,
          width: 180,
          height: 120,
          label: 'NOTE: Ensure water pump is powered externally. Do not draw direct 5V power from RPi header under full load!',
          locked: false,
          zIndex: 4,
          style: { fill: '#cc785c' }
        }
      ],
      edges: [
        {
          id: 'edge-1',
          sourceId: 'node-rpi',
          sourcePinId: '1', // 3.3V
          targetId: 'node-dht22',
          targetPinId: '1',
          type: 'power',
          color: '#c64545',
          style: 'solid'
        },
        {
          id: 'edge-2',
          sourceId: 'node-rpi',
          sourcePinId: '6', // GND
          targetId: 'node-dht22',
          targetPinId: '4',
          type: 'wire',
          color: '#6c6a64',
          style: 'solid'
        },
        {
          id: 'edge-3',
          sourceId: 'node-rpi',
          sourcePinId: '7', // GPIO 4
          targetId: 'node-dht22',
          targetPinId: '2',
          type: 'data',
          color: '#5db8a6',
          style: 'solid'
        },
        {
          id: 'edge-4',
          sourceId: 'node-rpi',
          sourcePinId: '2', // 5V
          targetId: 'node-relay',
          targetPinId: '1',
          type: 'power',
          color: '#c64545',
          style: 'solid'
        },
        {
          id: 'edge-5',
          sourceId: 'node-rpi',
          sourcePinId: '14', // GND
          targetId: 'node-relay',
          targetPinId: '3',
          type: 'wire',
          color: '#6c6a64',
          style: 'solid'
        },
        {
          id: 'edge-6',
          sourceId: 'node-rpi',
          sourcePinId: '11', // GPIO 17
          targetId: 'node-relay',
          targetPinId: '2',
          type: 'data',
          color: '#5db8a6',
          style: 'solid'
        }
      ]
    };
    const cStates = mockDb.canvasStates;
    cStates[demo.id] = demoCanvas;
    mockDb.canvasStates = cStates;

    // Seed Notes
    const n = mockDb.notes;
    n[demo.id] = `# Smart Greenhouse Controller Docs
This project operates as a self-contained automatic greenhouse monitoring module.

## Core Features
1. **Automatic Ventilation**: Triggers standard servo motor if humidity exceeds 75%.
2. **Irrigation Control**: Pulls relay low to switch on the 12V external solar pump when soil moisture sensors drop below 20%.
3. **Data Telemetry**: Captures local metrics and outputs them on an I2C OLED screen.

## Safe Operating Limits
- Max voltage load: 12V 1.5A for the pump circuit.
- Relays are optically-isolated to protect the RPi motherboard from back-EMF spikes.
`;
    mockDb.notes = n;
  }

  return mockDb.projects;
}

export async function getProject(id: string): Promise<Project | null> {
  if (isTauri()) {
    try {
      return await invoke<Project | null>('get_project', { id });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  const p = mockDb.projects.find(proj => proj.id === id);
  return p || null;
}

export async function updateProject(id: string, name: string, description: string, status: Project['status'], color: string): Promise<Project> {
  if (isTauri()) {
    try {
      return await invoke<Project>('update_project', { id, name, description, status, color });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  const projects = mockDb.projects;
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Project not found');

  const updated: Project = {
    ...projects[index],
    name,
    description,
    status,
    color,
    updated_at: Date.now()
  };

  projects[index] = updated;
  mockDb.projects = projects;
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('delete_project', { id });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  mockDb.projects = mockDb.projects.filter(p => p.id !== id);
  mockDb.tasks = mockDb.tasks.filter(t => t.project_id !== id);
  mockDb.columns = mockDb.columns.filter(c => c.project_id !== id);
  mockDb.milestones = mockDb.milestones.filter(m => m.project_id !== id);

  const canv = mockDb.canvasStates;
  delete canv[id];
  mockDb.canvasStates = canv;

  const gr = mockDb.graphStates;
  delete gr[id];
  mockDb.graphStates = gr;

  const nt = mockDb.notes;
  delete nt[id];
  mockDb.notes = nt;
}

// TASK OPERATIONS
export async function listTasks(projectId: string): Promise<Task[]> {
  if (isTauri()) {
    try {
      return await invoke<Task[]>('list_tasks', { projectId });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  return mockDb.tasks.filter(t => t.project_id === projectId);
}

export async function createTask(task: Partial<Task>): Promise<Task> {
  const newTask: Task = {
    id: task.id || uuid(),
    project_id: task.project_id || '',
    title: task.title || 'Untitled Task',
    description: task.description || '',
    status: task.status || 'backlog',
    priority: task.priority || 'p2',
    labels: task.labels || [],
    due_date: task.due_date || null,
    time_estimate: task.time_estimate || null,
    milestone_id: task.milestone_id || null,
    canvas_node_id: task.canvas_node_id || null,
    graph_node_id: task.graph_node_id || null,
    column_id: task.column_id || 'backlog',
    position: task.position || 0,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  if (isTauri()) {
    try {
      return await invoke<Task>('create_task', { task: newTask });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  mockDb.tasks = [...mockDb.tasks, newTask];
  return newTask;
}

export async function updateTask(task: Task): Promise<Task> {
  if (isTauri()) {
    try {
      return await invoke<Task>('update_task', { task });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  const tasks = mockDb.tasks;
  const index = tasks.findIndex(t => t.id === task.id);
  if (index === -1) {
    // Try to create it instead of throwing if it doesn't exist
    return await createTask(task);
  }

  const updated: Task = {
    ...task,
    updated_at: Date.now()
  };

  tasks[index] = updated;
  mockDb.tasks = tasks;
  return updated;
}

export async function deleteTask(id: string): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('delete_task', { id });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  mockDb.tasks = mockDb.tasks.filter(t => t.id !== id);
  mockDb.checklistItems = mockDb.checklistItems.filter(item => item.task_id !== id);
}

// CHECKLIST OPERATIONS
export async function getChecklistItems(taskId: string): Promise<ChecklistItem[]> {
  if (isTauri()) {
    try {
      return await invoke<ChecklistItem[]>('list_checklist_items', { taskId });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }
  return mockDb.checklistItems.filter(item => item.task_id === taskId);
}

export async function saveChecklistItem(item: ChecklistItem): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('save_checklist_item', { item });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }
  const items = mockDb.checklistItems;
  const index = items.findIndex(i => i.id === item.id);
  if (index === -1) {
    mockDb.checklistItems = [...items, item];
  } else {
    items[index] = item;
    mockDb.checklistItems = items;
  }
}

export async function deleteChecklistItem(id: string): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('delete_checklist_item', { id });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }
  mockDb.checklistItems = mockDb.checklistItems.filter(i => i.id !== id);
}

// KANBAN COLUMNS
export async function listColumns(projectId: string): Promise<Column[]> {
  if (isTauri()) {
    try {
      return await invoke<Column[]>('list_columns', { projectId });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  const cols = mockDb.columns.filter(c => c.project_id === projectId);
  if (cols.length === 0) {
    const defaultCols = createDefaultColumns(projectId);
    mockDb.columns = [...mockDb.columns, ...defaultCols];
    return defaultCols;
  }
  return cols.sort((a, b) => a.position - b.position);
}

export async function saveColumn(column: Column): Promise<void> {
  const cols = mockDb.columns;
  const index = cols.findIndex(c => c.id === column.id);
  if (index === -1) {
    mockDb.columns = [...cols, column];
  } else {
    cols[index] = column;
    mockDb.columns = cols;
  }
}

// PERSIST CANVAS STATE
export async function saveCanvasState(projectId: string, state: CanvasState): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('save_canvas_state', { projectId, state: JSON.stringify(state) });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  const canv = mockDb.canvasStates;
  canv[projectId] = state;
  mockDb.canvasStates = canv;

  // Touch project updated_at
  const proj = mockDb.projects;
  const index = proj.findIndex(p => p.id === projectId);
  if (index !== -1) {
    proj[index].updated_at = Date.now();
    mockDb.projects = proj;
  }
}

export async function loadCanvasState(projectId: string): Promise<CanvasState | null> {
  if (isTauri()) {
    try {
      const stateStr = await invoke<string | null>('load_canvas_state', { projectId });
      return stateStr ? JSON.parse(stateStr) : null;
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  return mockDb.canvasStates[projectId] || null;
}

// GRAPH STATE
export async function saveGraphState(projectId: string, state: GraphState): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('save_graph_state', { projectId, state: JSON.stringify(state) });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }
  const graph = mockDb.graphStates;
  graph[projectId] = state;
  mockDb.graphStates = graph;
}

export async function loadGraphState(projectId: string): Promise<GraphState | null> {
  if (isTauri()) {
    try {
      const stateStr = await invoke<string | null>('load_graph_state', { projectId });
      return stateStr ? JSON.parse(stateStr) : null;
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }
  return mockDb.graphStates[projectId] || null;
}

// NOTES OPERATIONS
export async function saveNotes(projectId: string, content: string): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('save_notes', { projectId, content });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  const n = mockDb.notes;
  n[projectId] = content;
  mockDb.notes = n;
}

export async function loadNotes(projectId: string): Promise<string> {
  if (isTauri()) {
    try {
      return await invoke<string>('load_notes', { projectId });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  return mockDb.notes[projectId] || '';
}

// SETTINGS
export async function getSettings(): Promise<UserSettings> {
  if (isTauri()) {
    try {
      return await invoke<UserSettings>('get_settings');
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  return mockDb.settings;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('save_settings', { settings });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  mockDb.settings = settings;
}

// CUSTOM COMPONENTS OPERATIONS
export async function listCustomComponents(): Promise<LibraryComponent[]> {
  if (isTauri()) {
    try {
      return await invoke<LibraryComponent[]>('list_custom_components');
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }
  return mockDb.components;
}

export async function saveCustomComponent(component: LibraryComponent): Promise<LibraryComponent> {
  if (isTauri()) {
    try {
      return await invoke<LibraryComponent>('save_custom_component', { component });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  const list = mockDb.components;
  const index = list.findIndex(c => c.id === component.id);
  if (index >= 0) {
    list[index] = component;
  } else {
    list.push(component);
  }
  mockDb.components = list;
  return component;
}

export async function deleteCustomComponent(id: string): Promise<void> {
  if (isTauri()) {
    try {
      return await invoke<void>('delete_custom_component', { id });
    } catch (e) {
      console.warn('Tauri invoke failed, using mock:', e);
    }
  }

  mockDb.components = mockDb.components.filter(c => c.id !== id);
}

// REMOTE DEPLOY & SSH DAEMON BRIDGE OPERATIONS
export async function deployAndRunPi(
  ip: string,
  username: string,
  passwordOrKey: string,
  authMethod: 'password' | 'key',
  code: string,
  filename: string
): Promise<string> {
  if (isTauri()) {
    try {
      return await invoke<string>('deploy_and_run_pi', {
        ip,
        username,
        passwordOrKey,
        authMethod,
        code,
        filename
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return Promise.reject('Remote Raspberry Pi SSH Deploy requires Tauri native desktop execution.');
}

export async function stopPiExecution(): Promise<string> {
  if (isTauri()) {
    try {
      return await invoke<string>('stop_pi_execution');
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return Promise.resolve('Mock process stopped.');
}
