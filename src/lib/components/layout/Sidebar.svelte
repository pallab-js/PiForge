<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions -->
<script lang="ts">
  import { sidebarCollapsed, activeView } from '../../stores/ui.store';
  import type { ViewType } from '../../stores/ui.store';
  import { activeProject, projectsList, selectProject } from '../../stores/project.store';
  import { BOARDS } from '../../rpi-boards';
  import { BUILTIN_COMPONENTS } from '../../components-library';

  let showLibrary = $state<'boards' | 'components' | null>(null);

  // Switch between views
  function setView(view: ViewType) {
    activeView.set(view);
  }

  // Handle board drag start (for Canvas drop)
  function handleDragStart(e: DragEvent, type: 'board' | 'component', itemId: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData('application/piforge-type', type);
    e.dataTransfer.setData('application/piforge-id', itemId);
    e.dataTransfer.effectAllowed = 'copy';
  }
</script>

<aside class="flex flex-col h-full bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] transition-all duration-200" style="width: {$sidebarCollapsed ? '56px' : '240px'}">
  <!-- Logo Section -->
  <div class="flex items-center h-12 px-4 border-b border-[var(--border-subtle)] overflow-hidden shrink-0">
    <div class="flex items-center gap-2">
      <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-coral-dim)] text-[var(--accent-coral)] font-serif font-bold text-lg border border-[var(--accent-coral)] shrink-0">
        π
      </div>
      {#if !$sidebarCollapsed}
        <span class="font-serif font-bold text-lg tracking-wide text-[var(--text-primary)]">
          Pi<span class="text-[var(--accent-coral)]">Forge</span>
        </span>
      {/if}
    </div>
  </div>

  <!-- Navigation Views -->
  <div class="flex flex-col gap-1 p-2 border-b border-[var(--border-subtle)] shrink-0">
    <button 
      onclick={() => setView('canvas')} 
      class="flex items-center gap-3 w-full px-3 py-2 rounded-md transition-all text-left relative overflow-hidden group
        {$activeView === 'canvas' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium border-l-2 border-[var(--accent-coral)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}"
      aria-label="Canvas View"
    >
      <span class="text-lg">🎨</span>
      {#if !$sidebarCollapsed}
        <span class="text-sm">Canvas View</span>
      {/if}
    </button>

    <button 
      onclick={() => setView('graph')} 
      class="flex items-center gap-3 w-full px-3 py-2 rounded-md transition-all text-left relative overflow-hidden group
        {$activeView === 'graph' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium border-l-2 border-[var(--accent-coral)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}"
      aria-label="Graph View"
    >
      <span class="text-lg">🕸️</span>
      {#if !$sidebarCollapsed}
        <span class="text-sm">Graph View</span>
      {/if}
    </button>

    <button 
      onclick={() => setView('board')} 
      class="flex items-center gap-3 w-full px-3 py-2 rounded-md transition-all text-left relative overflow-hidden group
        {$activeView === 'board' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium border-l-2 border-[var(--accent-coral)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}"
      aria-label="Board View"
    >
      <span class="text-lg">📋</span>
      {#if !$sidebarCollapsed}
        <span class="text-sm">Kanban Board</span>
      {/if}
    </button>

    <button 
      onclick={() => setView('list')} 
      class="flex items-center gap-3 w-full px-3 py-2 rounded-md transition-all text-left relative overflow-hidden group
        {$activeView === 'list' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium border-l-2 border-[var(--accent-coral)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}"
      aria-label="List View"
    >
      <span class="text-lg">📝</span>
      {#if !$sidebarCollapsed}
        <span class="text-sm">List View</span>
      {/if}
    </button>

    <button 
      onclick={() => setView('notes')} 
      class="flex items-center gap-3 w-full px-3 py-2 rounded-md transition-all text-left relative overflow-hidden group
        {$activeView === 'notes' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium border-l-2 border-[var(--accent-coral)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}"
      aria-label="Notes View"
    >
      <span class="text-lg">📚</span>
      {#if !$sidebarCollapsed}
        <span class="text-sm">Documentation</span>
      {/if}
    </button>

    <button 
      onclick={() => setView('code')} 
      class="flex items-center gap-3 w-full px-3 py-2 rounded-md transition-all text-left relative overflow-hidden group
        {$activeView === 'code' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium border-l-2 border-[var(--accent-coral)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}"
      aria-label="Code Scaffolder"
    >
      <span class="text-lg">💻</span>
      {#if !$sidebarCollapsed}
        <span class="text-sm">Code Scaffolder</span>
      {/if}
    </button>
  </div>

  <!-- Library Section -->
  <div class="flex-1 flex flex-col min-h-0 overflow-y-auto">
    {#if !$sidebarCollapsed}
      <div class="p-3">
        <!-- RPi Boards Library Header -->
        <button 
          onclick={() => showLibrary = showLibrary === 'boards' ? null : 'boards'} 
          class="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] py-1 mb-1 border-b border-[var(--border-subtle)]"
        >
          <span>🍓 Raspberry Pi Boards</span>
          <span class="text-[10px]">{showLibrary === 'boards' ? '▼' : '▶'}</span>
        </button>

        {#if showLibrary === 'boards'}
          <div class="flex flex-col gap-1.5 py-1 mb-3 max-h-[160px] overflow-y-auto pr-1">
            {#each BOARDS as board}
              <div 
                draggable="true"
                ondragstart={(e) => handleDragStart(e, 'board', board.id)}
                class="flex items-center gap-2.5 p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded hover:border-[var(--accent-coral)] transition-colors cursor-grab active:cursor-grabbing text-xs text-[var(--text-primary)] group select-none"
              >
                <span class="text-sm shrink-0">🍓</span>
                <div class="overflow-hidden">
                  <div class="font-medium truncate group-hover:text-[var(--accent-coral)]">{board.name}</div>
                  <div class="text-[10px] text-[var(--text-secondary)] capitalize">{board.type} · {board.pins.length} Pins</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Accessories Component Header -->
        <button 
          onclick={() => showLibrary = showLibrary === 'components' ? null : 'components'} 
          class="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] py-1 mb-1 border-b border-[var(--border-subtle)] mt-2"
        >
          <span>🔌 Component Library</span>
          <span class="text-[10px]">{showLibrary === 'components' ? '▼' : '▶'}</span>
        </button>

        {#if showLibrary === 'components'}
          <div class="flex flex-col gap-1.5 py-1 max-h-[220px] overflow-y-auto pr-1">
            {#each BUILTIN_COMPONENTS as comp}
              <div 
                draggable="true"
                ondragstart={(e) => handleDragStart(e, 'component', comp.id)}
                class="flex items-center gap-2.5 p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded hover:border-[var(--accent-teal)] transition-colors cursor-grab active:cursor-grabbing text-xs text-[var(--text-primary)] group select-none"
                title={comp.description}
              >
                <span class="text-sm shrink-0">{comp.icon_svg}</span>
                <div class="overflow-hidden">
                  <div class="font-medium truncate group-hover:text-[var(--accent-teal)]">{comp.name}</div>
                  <div class="text-[10px] text-[var(--text-secondary)] capitalize">{comp.category} · {comp.pin_count} Pins</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <!-- Mini library indicator icons -->
      <div class="flex flex-col items-center gap-3 py-4 shrink-0">
        <button onclick={() => sidebarCollapsed.set(false)} class="text-lg p-2 rounded hover:bg-[var(--bg-hover)]" title="Expand Sidebar">🍓</button>
        <button onclick={() => sidebarCollapsed.set(false)} class="text-lg p-2 rounded hover:bg-[var(--bg-hover)]" title="Expand Sidebar">🔌</button>
      </div>
    {/if}
  </div>

  <!-- Bottom Workspace Nav -->
  {#if !$sidebarCollapsed && $activeProject}
    <div class="p-3 border-t border-[var(--border-subtle)] shrink-0">
      <div class="text-xs text-[var(--text-secondary)] mb-1 font-semibold uppercase tracking-wider">Current Project</div>
      <div class="flex items-center gap-2 overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded p-2 text-xs">
        <div class="w-3 h-3 rounded-full shrink-0" style="background-color: {$activeProject.color}"></div>
        <span class="font-medium text-[var(--text-primary)] truncate">{$activeProject.name}</span>
      </div>
    </div>
  {/if}
</aside>
