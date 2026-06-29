import { writable, get } from 'svelte/store';
import type { Project, Task, Column, CanvasState } from '../types';
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

// Debouncing auto-save (ROB-01: Split save timeouts)
let canvasSaveTimeout: any = null;
let notesSaveTimeout: any = null;
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

    // Load Notes (ROB-02: Fallback restore)
    let notesStr = '';
    if (typeof localStorage !== 'undefined') {
      const fallbackNotes = localStorage.getItem(`piforge_fallback_notes_${projectId}`);
      if (fallbackNotes !== null) {
        notesStr = fallbackNotes;
        addToast('Restored unsaved notes from browser cache', 'info');
      }
    }
    if (!notesStr) {
      notesStr = await ipc.loadNotes(projectId);
    }
    projectNotes.set(notesStr);

    // Load Canvas (ROB-02: Fallback restore)
    let canvas = null;
    if (typeof localStorage !== 'undefined') {
      const fallback = localStorage.getItem(`piforge_fallback_canvas_${projectId}`);
      if (fallback) {
        try {
          canvas = JSON.parse(fallback);
          addToast('Restored unsaved canvas changes from browser cache', 'info');
        } catch (e) {
          console.error('Failed to parse fallback canvas state:', e);
        }
      }
    }
    if (!canvas) {
      canvas = await ipc.loadCanvasState(projectId);
    }

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

export async function deleteProjectById(id: string) {
  try {
    await ipc.deleteProject(id);
    const current = get(activeProject);
    if (current && current.id === id) {
      activeProject.set(null);
    }
    await initProjects();
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

// ROB-03: Clean task updating avoiding mutation and double-writes
export async function updateTaskItem(task: Task) {
  try {
    // Determine target status based on column first
    let targetStatus = task.status;
    const cols = get(columnsList);
    const col = cols.find(c => c.id === task.column_id);
    if (col) {
      targetStatus = col.is_done ? 'done' : 'backlog';
    }

    const taskToSave: Task = {
      ...task,
      status: targetStatus,
    };

    const updated = await ipc.updateTask(taskToSave);
    tasksList.update(list => list.map(t => t.id === task.id ? updated : t));
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

// CANVAS HISTORIES (UNDO / REDO) - PERF-05: High-perf structuredClone
export function pushCanvasHistory(state: CanvasState) {
  const clone = structuredClone(state);
  canvasUndoStack.push(clone);
  if (canvasUndoStack.length > MAX_HISTORY) {
    canvasUndoStack.shift();
  }
  canvasRedoStack = []; // Clear redo stack on new action
}

export function undoCanvas() {
  if (canvasUndoStack.length === 0) return;
  const current = structuredClone(get(activeCanvasState));
  canvasRedoStack.push(current);

  const previous = canvasUndoStack.pop()!;
  activeCanvasState.set(previous);
  saveCanvasDebounced(previous);
  addToast('Undo', 'info', 1000);
}

export function redoCanvas() {
  if (canvasRedoStack.length === 0) return;
  const current = structuredClone(get(activeCanvasState));
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

// ROB-02: Retry mechanism and local storage fallback for canvas saving
async function saveCanvasWithRetry(projectId: string, state: CanvasState) {
  let attempts = 3;
  let delay = 500;
  while (attempts > 0) {
    try {
      await ipc.saveCanvasState(projectId, state);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`piforge_fallback_canvas_${projectId}`);
      }
      return;
    } catch (e) {
      attempts--;
      if (attempts === 0) {
        console.error('Persistent canvas save failure, saving to fallback local storage:', e);
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`piforge_fallback_canvas_${projectId}`, JSON.stringify(state));
          } catch (storageError) {
            console.error('Failed to write emergency fallback to localStorage:', storageError);
          }
        }
        addToast('Failed to save canvas to database. Saved to browser fallback.', 'error');
        throw e;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

function saveCanvasDebounced(state: CanvasState) {
  const proj = get(activeProject);
  if (!proj) return;

  isSaving.set(true);
  if (canvasSaveTimeout) clearTimeout(canvasSaveTimeout);

  canvasSaveTimeout = setTimeout(async () => {
    try {
      await saveCanvasWithRetry(proj.id, state);
    } catch (e) {
      console.error('Auto-save canvas failed:', e);
    } finally {
      isSaving.set(false);
    }
  }, 1000); // 1-second debounce
}

// ROB-02: Retry mechanism and local storage fallback for notes saving
async function saveNotesWithRetry(projectId: string, content: string) {
  let attempts = 3;
  let delay = 500;
  while (attempts > 0) {
    try {
      await ipc.saveNotes(projectId, content);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`piforge_fallback_notes_${projectId}`);
      }
      return;
    } catch (e) {
      attempts--;
      if (attempts === 0) {
        console.error('Persistent notes save failure, saving to fallback local storage:', e);
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`piforge_fallback_notes_${projectId}`, content);
          } catch (storageError) {
            console.error('Failed to write emergency notes fallback:', storageError);
          }
        }
        addToast('Failed to save notes to database. Saved to browser fallback.', 'error');
        throw e;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

// NOTES SAVE
export function updateNotes(content: string) {
  projectNotes.set(content);
  const proj = get(activeProject);
  if (!proj) return;

  isSaving.set(true);
  if (notesSaveTimeout) clearTimeout(notesSaveTimeout);

  notesSaveTimeout = setTimeout(async () => {
    try {
      await saveNotesWithRetry(proj.id, content);
    } catch (e) {
      console.error('Auto-save notes failed:', e);
    } finally {
      isSaving.set(false);
    }
  }, 1000);
}
