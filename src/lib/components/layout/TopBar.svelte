<!-- svelte-ignore a11y_autofocus a11y-autofocus -->
<script lang="ts">
  import { sidebarCollapsed, activeView, addToast } from '../../stores/ui.store';
  import type { ViewType } from '../../stores/ui.store';
  import { activeProject, updateActiveProjectDetails, isSaving } from '../../stores/project.store';
  import { goto } from '$app/navigation';

  let { onOpenSettings, onOpenExport } = $props<{
    onOpenSettings: () => void;
    onOpenExport: () => void;
  }>();

  let isEditingTitle = $state(false);
  let editTitleValue = $state('');

  // Watch for active project changes to update edit value
  $effect(() => {
    if ($activeProject) {
      editTitleValue = $activeProject.name;
    }
  });

  function toggleSidebar() {
    sidebarCollapsed.update(val => !val);
  }

  async function saveTitle() {
    if (!$activeProject || !editTitleValue.trim()) {
      isEditingTitle = false;
      return;
    }
    isEditingTitle = false;
    await updateActiveProjectDetails(
      editTitleValue,
      $activeProject.description,
      $activeProject.status,
      $activeProject.color
    );
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveTitle();
    if (e.key === 'Escape') {
      isEditingTitle = false;
      if ($activeProject) editTitleValue = $activeProject.name;
    }
  }

  function handleBackToDashboard() {
    activeProject.set(null);
  }
</script>

<header class="flex items-center justify-between h-12 px-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
  <!-- Left Side: Collapsible and Project Info -->
  <div class="flex items-center gap-3 overflow-hidden">
    <button 
      onclick={toggleSidebar}
      class="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
      title={$sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      aria-label="Toggle Sidebar"
    >
      {#if $sidebarCollapsed}
        ➡️
      {:else}
        ⬅️
      {/if}
    </button>

    <button 
      onclick={handleBackToDashboard}
      class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mr-1"
      title="Return to Projects List"
    >
      📂 Projects
    </button>

    <span class="text-[var(--text-muted)] text-sm">/</span>

    {#if $activeProject}
      <div class="flex items-center gap-2 overflow-hidden">
        <div class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {$activeProject.color}"></div>
        {#if isEditingTitle}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            bind:value={editTitleValue}
            onblur={saveTitle}
            onkeydown={handleKeydown}
            class="bg-[var(--bg-card)] border border-[var(--accent-coral)] rounded px-1.5 py-0.5 text-sm font-medium text-[var(--text-primary)] outline-none"
            autofocus
          />
        {:else}
          <button 
            onclick={() => isEditingTitle = true}
            class="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-coral)] transition-colors truncate text-left"
            title="Click to Rename Project"
          >
            {$activeProject.name}
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Right Side: Workspace Control Buttons -->
  <div class="flex items-center gap-2 shrink-0">
    <!-- Auto-save Indicator -->
    {#if $isSaving}
      <span class="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mr-2">
        <span class="w-1.5 h-1.5 bg-[var(--accent-teal)] rounded-full animate-ping"></span>
        Saving...
      </span>
    {:else}
      <span class="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mr-2" title="All edits saved locally">
        <span class="w-1.5 h-1.5 bg-[var(--color-success)] rounded-full"></span>
        Saved
      </span>
    {/if}

    <!-- Quick Export -->
    <button 
      onclick={onOpenExport}
      class="flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] hover:text-[var(--text-primary)] text-xs text-[var(--text-secondary)] rounded-md font-medium transition-colors cursor-pointer"
      title="Export Canvas, BOM or Project File"
      aria-label="Export Menu"
    >
      📤 Export
    </button>

    <!-- Project Settings -->
    <button 
      onclick={onOpenSettings}
      class="flex items-center justify-center w-7 h-7 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors cursor-pointer"
      title="Workspace Settings"
      aria-label="Preferences"
    >
      ⚙️
    </button>
  </div>
</header>
