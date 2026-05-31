<script lang="ts">
  import { activeView, selectedNodeId, selectedEdgeId } from '../../stores/ui.store';
  import { activeCanvasState } from '../../stores/project.store';
  import { settings } from '../../stores/settings.store';

  let selectionText = $derived.by(() => {
    let count = 0;
    if ($selectedNodeId) count++;
    if ($selectedEdgeId) count++;
    if (count === 0) return 'Ready';
    return `${count} item${count > 1 ? 's' : ''} selected`;
  });

  let zoomLevel = $derived(Math.round(($activeCanvasState?.viewport?.scale || 1) * 100));

  function handleResetZoom() {
    activeCanvasState.update(state => {
      if (!state) return state;
      return {
        ...state,
        viewport: {
          ...state.viewport,
          scale: 1
        }
      };
    });
  }

  function handleZoomIn() {
    activeCanvasState.update(state => {
      if (!state) return state;
      return {
        ...state,
        viewport: {
          ...state.viewport,
          scale: Math.min(state.viewport.scale + 0.1, 3)
        }
      };
    });
  }

  function handleZoomOut() {
    activeCanvasState.update(state => {
      if (!state) return state;
      return {
        ...state,
        viewport: {
          ...state.viewport,
          scale: Math.max(state.viewport.scale - 0.1, 0.2)
        }
      };
    });
  }
</script>

<footer class="flex items-center justify-between h-6 px-4 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)] select-none shrink-0">
  <!-- Left: Status and Selection -->
  <div class="flex items-center gap-3">
    <span class="font-medium text-[var(--text-primary)]">
      MODE: <span class="text-[var(--accent-coral)] capitalize font-mono">{$activeView}</span>
    </span>
    <span class="text-[var(--border-strong)]">|</span>
    <span class="font-mono">{selectionText}</span>
  </div>

  <!-- Right: Zoom Controls & Help Links -->
  <div class="flex items-center gap-4">
    <!-- Grid snap indicator -->
    <span class="flex items-center gap-1">
      🕸️ Snap Grid:
      <button 
        onclick={() => settings.updateSnapToGrid(!$settings.snap_to_grid)}
        class="font-mono hover:text-[var(--accent-coral)]"
      >
        {$settings.snap_to_grid ? 'ON' : 'OFF'}
      </button>
    </span>

    {#if $activeView === 'canvas' || $activeView === 'graph'}
      <span class="text-[var(--border-strong)]">|</span>
      <!-- Zoom controls -->
      <div class="flex items-center gap-1.5 font-mono">
        <span>Zoom:</span>
        <button onclick={handleZoomOut} class="hover:text-[var(--text-primary)] font-bold px-0.5">[-]</button>
        <button onclick={handleResetZoom} class="hover:text-[var(--text-primary)] hover:underline">{zoomLevel}%</button>
        <button onclick={handleZoomIn} class="hover:text-[var(--text-primary)] font-bold px-0.5">[+]</button>
      </div>
    {/if}

    <span class="text-[var(--border-strong)]">|</span>
    <span class="cursor-help hover:text-[var(--accent-coral)]" title="Keyboard Shortcuts: Cmd+K (Search), Cmd+S (Save), Cmd+Z/Shift+Z (Undo/Redo), 1-5 (Views)">
      ⌨️ Shortcuts Reference
    </span>
  </div>
</footer>
