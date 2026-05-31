import { writable } from 'svelte/store';
import type { UserSettings } from '../types';
import * as ipc from '../ipc';

const defaultSettings: UserSettings = {
  theme: 'dark',
  accent_color: 'coral',
  font_size: 'default',
  grid_type: 'dots',
  snap_to_grid: true
};

function createSettingsStore() {
  const { subscribe, set, update } = writable<UserSettings>(defaultSettings);

  return {
    subscribe,
    init: async () => {
      try {
        const saved = await ipc.getSettings();
        set(saved);
        // Apply theme class to document element
        applyTheme(saved.theme);
        applyAccent(saved.accent_color);
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    },
    updateTheme: async (theme: UserSettings['theme']) => {
      update(current => {
        const next = { ...current, theme };
        ipc.saveSettings(next);
        applyTheme(theme);
        return next;
      });
    },
    updateAccent: async (accent: UserSettings['accent_color']) => {
      update(current => {
        const next = { ...current, accent_color: accent };
        ipc.saveSettings(next);
        applyAccent(accent);
        return next;
      });
    },
    updateGrid: async (grid_type: UserSettings['grid_type']) => {
      update(current => {
        const next = { ...current, grid_type };
        ipc.saveSettings(next);
        return next;
      });
    },
    updateSnapToGrid: async (snap: boolean) => {
      update(current => {
        const next = { ...current, snap_to_grid: snap };
        ipc.saveSettings(next);
        return next;
      });
    },
    updateFontSize: async (size: UserSettings['font_size']) => {
      update(current => {
        const next = { ...current, font_size: size };
        ipc.saveSettings(next);
        applyFontSize(size);
        return next;
      });
    }
  };
}

export const settings = createSettingsStore();

// Dom application utilities for theme/styling
function applyTheme(theme: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light', 'theme-warm');
  root.classList.add(`theme-${theme}`);

  // Set default body styles
  if (theme === 'dark') {
    root.style.setProperty('--bg-base', '#111110');
    root.style.setProperty('--bg-surface', '#181715');
    root.style.setProperty('--bg-elevated', '#1f1e1b');
    root.style.setProperty('--bg-card', '#252320');
    root.style.setProperty('--bg-hover', '#2e2c28');
    root.style.setProperty('--bg-selected', '#332f2a');
    root.style.setProperty('--text-primary', '#faf9f5');
    root.style.setProperty('--text-secondary', '#a09d96');
    root.style.setProperty('--canvas-bg', '#0e0d0c');
  } else if (theme === 'light') {
    root.style.setProperty('--bg-base', '#f7f6f5');
    root.style.setProperty('--bg-surface', '#ffffff');
    root.style.setProperty('--bg-elevated', '#f0eee9');
    root.style.setProperty('--bg-card', '#e8e5de');
    root.style.setProperty('--bg-hover', '#dfdbd2');
    root.style.setProperty('--bg-selected', '#d5cfc4');
    root.style.setProperty('--text-primary', '#1c1a17');
    root.style.setProperty('--text-secondary', '#6c6559');
    root.style.setProperty('--canvas-bg', '#fdfdfc');
  } else if (theme === 'warm') {
    // Warm Cream theme
    root.style.setProperty('--bg-base', '#1f1a14');
    root.style.setProperty('--bg-surface', '#29221b');
    root.style.setProperty('--bg-elevated', '#362d24');
    root.style.setProperty('--bg-card', '#42372c');
    root.style.setProperty('--bg-hover', '#4f4235');
    root.style.setProperty('--bg-selected', '#5d4e3f');
    root.style.setProperty('--text-primary', '#fffaeb');
    root.style.setProperty('--text-secondary', '#d7caa8');
    root.style.setProperty('--canvas-bg', '#181410');
  }
}

function applyAccent(accent: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  let coral = '#cc785c';
  let hover = '#a9583e';
  let dim = 'rgba(204, 120, 92, 0.15)';

  if (accent === 'teal') {
    coral = '#5db8a6';
    hover = '#439d8b';
    dim = 'rgba(93, 184, 166, 0.15)';
  } else if (accent === 'amber') {
    coral = '#e8a55a';
    hover = '#c6843c';
    dim = 'rgba(232, 165, 90, 0.15)';
  } else if (accent === 'violet') {
    coral = '#9d7adc';
    hover = '#7d58be';
    dim = 'rgba(157, 122, 220, 0.15)';
  }

  root.style.setProperty('--accent-coral', coral);
  root.style.setProperty('--accent-coral-hover', hover);
  root.style.setProperty('--accent-coral-dim', dim);
}

function applyFontSize(size: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (size === 'compact') {
    root.style.setProperty('font-size', '12px');
  } else if (size === 'comfortable') {
    root.style.setProperty('font-size', '16px');
  } else {
    root.style.setProperty('font-size', '14px');
  }
}
