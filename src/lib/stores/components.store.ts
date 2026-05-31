import { writable, derived, get } from 'svelte/store';
import type { LibraryComponent } from '../types';
import { BUILTIN_COMPONENTS } from '../components-library';
import * as ipc from '../ipc';
import { addToast } from './ui.store';

// Live list of custom components loaded from database/storage
export const customComponents = writable<LibraryComponent[]>([]);

// Derived store merging static builtin catalog with newly constructed models
export const allComponents = derived(
  customComponents,
  ($customComponents) => [...BUILTIN_COMPONENTS, ...$customComponents]
);

// Load custom parts on start
export async function initCustomComponents() {
  try {
    const list = await ipc.listCustomComponents();
    customComponents.set(list || []);
  } catch (e) {
    console.error('Failed to load custom components:', e);
  }
}

// Save a new custom component model
export async function createCustomComponent(
  name: string,
  description: string,
  category: LibraryComponent['category'],
  pinCount: number,
  iconSvg: string
) {
  const cleanId = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Math.random().toString(36).substring(2, 6);
  const newComp: LibraryComponent = {
    id: cleanId,
    name,
    description,
    category,
    pin_count: pinCount,
    icon_svg: iconSvg || '🔌',
    is_builtin: false,
    created_at: Date.now()
  };

  try {
    const saved = await ipc.saveCustomComponent(newComp);
    customComponents.update(list => [saved, ...list]);
    addToast(`Custom component '${name}' created!`, 'success');
    return saved;
  } catch (e) {
    console.error(e);
    addToast('Failed to create custom component', 'error');
    throw e;
  }
}

// Remove custom component model
export async function removeCustomComponent(id: string) {
  try {
    await ipc.deleteCustomComponent(id);
    customComponents.update(list => list.filter(c => c.id !== id));
    addToast('Custom component deleted', 'info');
  } catch (e) {
    console.error(e);
    addToast('Failed to delete component', 'error');
  }
}
