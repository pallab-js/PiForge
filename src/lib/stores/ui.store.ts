import { writable } from 'svelte/store';

export type ViewType = 'canvas' | 'graph' | 'board' | 'list' | 'notes';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  duration?: number;
}

// Sidebar collapse status
export const sidebarCollapsed = writable(false);

// Active View: 'canvas' | 'graph' | 'board' | 'list' | 'notes'
export const activeView = writable<ViewType>('canvas');

// Selected node/edge details (for right properties panel)
export const selectedNodeId = writable<string | null>(null);
export const selectedEdgeId = writable<string | null>(null);
export const selectedPinId = writable<string | null>(null); // Hover/Click details of a board pin

// Toast Notification Store
export const toasts = writable<ToastMessage[]>([]);

export function addToast(message: string, type: ToastMessage['type'] = 'success', duration = 3000) {
  const id = crypto.randomUUID();
  toasts.update(current => [...current, { id, message, type, duration }]);

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }
}

export function removeToast(id: string) {
  toasts.update(current => current.filter(t => t.id !== id));
}
