import { writable, get } from 'svelte/store';
import type { Project, Task, Column, CanvasState, GraphState } from '../types';
import * as ipc from '../ipc';
import { addToast } from './ui.store';

// States
export const projectsList = writable<Project[]>([]);
export const activeProject = writable<Project | null>(null);
export const tasksList = writable<Task[]>([]);
export const columnsList = writable<Column[]>([]);
export const projectNotes = writable<string>('');
export const activeCanvasState = writable<CanvasState>({
  version: '1.0',
  viewport: { x: 0, y: 0, scale: 1 },
  nodes: [],
  edges: []
});

// Undo/Redo Stacks for Canvas
let canvasUndoStack: CanvasState[] = [];
let canvasRedoStack: CanvasState[] = [];
const MAX_HISTORY = 100;

// Debouncing auto-save
let saveTimeout: any = null;
export const isSaving = writable(false);

export async function initProjects() {
  try {
    const list = await ipc.listProjects();
    projectsList.set(list);
  } catch (e) {
    console.error('Failed to load projects list:', e);
  }
}

export async function selectProject(projectId: string) {
  try {
    const proj = await ipc.getProject(projectId);
    if (!proj) throw new Error('Project not found');

    activeProject.set(proj);
    
    // Load Columns
    const cols = await ipc.listColumns(projectId);
    columnsList.set(cols);

    // Load Tasks
    const tasks = await ipc.listTasks(projectId);
    tasksList.set(tasks);

    // Load Notes
    const notesStr = await ipc.loadNotes(projectId);
    projectNotes.set(notesStr);

    // Load Canvas
    const canvas = await ipc.loadCanvasState(projectId);
    if (canvas) {
      activeCanvasState.set(canvas);
    } else {
      // Default blank canvas
      const defaultState: CanvasState = {
        version: '1.0',
        viewport: { x: 0, y: 0, scale: 1 },
        nodes: [
          {
            id: ipc.uuid(),
            type: 'rpi_board',
            x: 100,
            y: 100,
            width: 320,
            height: 220,
            boardModel: proj.rpi_model,
            locked: false,
            zIndex: 1,
            style: {}
          }
        ],
        edges: []
      };
      activeCanvasState.set(defaultState);
      await ipc.saveCanvasState(projectId, defaultState);
    }

    // Reset History
    canvasUndoStack = [];
    canvasRedoStack = [];

    // Trigger projects list refresh to keep dates updated
    initProjects();
  } catch (e) {
    console.error('Failed to select project:', e);
    addToast('Error loading project details', 'error');
  }
}

export async function createNewProject(name: string, description: string, rpiModel: string, color = '#cc785c') {
  try {
    const proj = await ipc.createProject(name, description, rpiModel, color);
    await initProjects();
    await selectProject(proj.id);
    addToast('Project created successfully', 'success');
    return proj;
  } catch (e) {
    console.error('Failed to create project:', e);
    addToast('Failed to create project', 'error');
    throw e;
  }
}

export async function updateActiveProjectDetails(name: string, description: string, status: Project['status'], color: string) {
  const current = get(activeProject);
  if (!current) return;

  try {
    const updated = await ipc.updateProject(current.id, name, description, status, color);
    activeProject.set(updated);
    initProjects();
    addToast('Project settings saved', 'success');
  } catch (e) {
    console.error(e);
    addToast('Failed to save project settings', 'error');
  }
}

export async function deleteActiveProject() {
  const current = get(activeProject);
  if (!current) return;

  try {
    await ipc.deleteProject(current.id);
    activeProject.set(null);
    initProjects();
    addToast('Project deleted successfully', 'success');
  } catch (e) {
    console.error(e);
    addToast('Failed to delete project', 'error');
  }
}

// TASK ACTIONS
export async function addTask(title: string, columnId: string, priority: Task['priority'] = 'p2', labels: string[] = []) {
  const proj = get(activeProject);
  if (!proj) return;

  const cols = get(columnsList);
  const column = cols.find(c => c.id === columnId) || cols[0];

  const newTask: Partial<Task> = {
    project_id: proj.id,
    title,
    description: '',
    status: column.is_done ? 'done' : 'backlog',
    column_id: columnId,
    priority,
    labels,
    position: get(tasksList).filter(t => t.column_id === columnId).length + 1
  };

  try {
    const saved = await ipc.createTask(newTask);
    tasksList.update(list => [...list, saved]);
    addToast('Task created', 'success');
    return saved;
  } catch (e) {
    console.error(e);
    addToast('Failed to create task', 'error');
  }
}

export async function updateTaskItem(task: Task) {
  try {
    const updated = await ipc.updateTask(task);
    tasksList.update(list => list.map(t => t.id === task.id ? updated : t));
    
    // Check if task status should be updated based on column
    const cols = get(columnsList);
    const col = cols.find(c => c.id === task.column_id);
    if (col) {
      const targetStatus = col.is_done ? 'done' : 'backlog';
      if (task.status !== targetStatus) {
        task.status = targetStatus;
        await ipc.updateTask(task);
      }
    }
  } catch (e) {
    console.error(e);
    addToast('Failed to update task', 'error');
  }
}

export async function deleteTaskItem(id: string) {
  try {
    await ipc.deleteTask(id);
    tasksList.update(list => list.filter(t => t.id !== id));
    addToast('Task deleted', 'success');
  } catch (e) {
    console.error(e);
    addToast('Failed to delete task', 'error');
  }
}

// CANVAS HISTORIES (UNDO / REDO)
export function pushCanvasHistory(state: CanvasState) {
  // Deep clone to prevent direct mutations
  const clone = JSON.parse(JSON.stringify(state));
  canvasUndoStack.push(clone);
  if (canvasUndoStack.length > MAX_HISTORY) {
    canvasUndoStack.shift();
  }
  canvasRedoStack = []; // Clear redo stack on new action
}

export function undoCanvas() {
  if (canvasUndoStack.length === 0) return;
  const current = JSON.parse(JSON.stringify(get(activeCanvasState)));
  canvasRedoStack.push(current);

  const previous = canvasUndoStack.pop()!;
  activeCanvasState.set(previous);
  saveCanvasDebounced(previous);
  addToast('Undo', 'info', 1000);
}

export function redoCanvas() {
  if (canvasRedoStack.length === 0) return;
  const current = JSON.parse(JSON.stringify(get(activeCanvasState)));
  canvasUndoStack.push(current);

  const next = canvasRedoStack.pop()!;
  activeCanvasState.set(next);
  saveCanvasDebounced(next);
  addToast('Redo', 'info', 1000);
}

// CANVAS STATE SAVE
export function updateCanvasStateDirectly(state: CanvasState) {
  activeCanvasState.set(state);
  saveCanvasDebounced(state);
}

function saveCanvasDebounced(state: CanvasState) {
  const proj = get(activeProject);
  if (!proj) return;

  isSaving.set(true);
  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    try {
      await ipc.saveCanvasState(proj.id, state);
    } catch (e) {
      console.error('Auto-save canvas failed:', e);
    } finally {
      isSaving.set(false);
    }
  }, 1000); // 1-second debounce
}

// NOTES SAVE
export function updateNotes(content: string) {
  projectNotes.set(content);
  const proj = get(activeProject);
  if (!proj) return;

  isSaving.set(true);
  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    try {
      await ipc.saveNotes(proj.id, content);
    } catch (e) {
      console.error('Auto-save notes failed:', e);
    } finally {
      isSaving.set(false);
    }
  }, 1000);
}
