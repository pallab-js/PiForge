<script lang="ts">
  import { onMount } from 'svelte';
  import { settings } from '../lib/stores/settings.store';
  import { initProjects, projectsList, activeProject, createNewProject, selectProject, deleteProjectById } from '../lib/stores/project.store';
  import { addToast, toasts, removeToast } from '../lib/stores/ui.store';
  import { BOARDS } from '../lib/rpi-boards';
  import AppShell from '../lib/components/layout/AppShell.svelte';
  import ConfirmModal from '../lib/components/shared/ConfirmModal.svelte';

  import { initCustomComponents } from '../lib/stores/components.store';

  // Dashboard state
  let searchQuery = $state('');
  let isCreateOpen = $state(false);
  let isDeleteOpen = $state(false);
  let projectToDelete = $state<{ id: string, name: string } | null>(null);

  // New project form values
  let newName = $state('');
  let newDesc = $state('');
  let newModel = $state('rpi5');
  let newColor = $state('#cc785c');

  // Load baseline on mount
  onMount(async () => {
    await settings.init();
    await initProjects();
    await initCustomComponents();
  });

  // Filter projects by search
  let filteredProjects = $derived.by(() => {
    let list = $projectsList;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    return list;
  });

  // Handle create submit
  async function handleCreateProject(e: Event) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createNewProject(newName, newDesc, newModel, newColor);
      isCreateOpen = false;
      newName = '';
      newDesc = '';
      newModel = 'rpi5';
      newColor = '#cc785c';
    } catch (e) {
      console.error(e);
    }
  }
</script>

<!-- If a project is currently open/selected, load the Workspace shell -->
{#if $activeProject}
  <AppShell />
{:else}
  <!-- GRAND DASHBOARD LANDING PAGE -->
  <div class="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)] select-none">
    <!-- Header banner -->
    <header class="flex items-center justify-between h-14 px-8 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div class="flex items-center gap-2.5">
        <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-coral-dim)] text-[var(--accent-coral)] font-serif font-bold text-xl border border-[var(--accent-coral)]">
          π
        </div>
        <span class="font-serif font-bold text-lg tracking-wide">
          Pi<span class="text-[var(--accent-coral)]">Forge</span>
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button 
          onclick={() => isCreateOpen = true}
          class="px-4 py-1.5 bg-[var(--accent-coral)] text-[var(--text-inverse)] hover:bg-[var(--accent-coral-hover)] text-xs font-semibold rounded-md transition-colors cursor-pointer"
        >
          + New Project
        </button>
      </div>
    </header>

    <!-- Scrollable main panel -->
    <main class="flex-1 overflow-y-auto p-8 select-text">
      <!-- Welcome Hero Area -->
      <div class="max-w-4xl mx-auto mb-10 text-center select-none">
        <h1 class="font-serif text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-2 mt-4">
          Visual project planning, <span class="bg-gradient-to-r from-[var(--accent-coral)] to-[var(--accent-teal)] bg-clip-text text-transparent">engineered for Raspberry Pi.</span>
        </h1>
        <p class="text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
          Offline hardware blueprints, wiring schematics, and milestone task trackers combined in one unified workspace.
        </p>
      </div>

      <!-- Action Search filter Bar -->
      <div class="max-w-4xl mx-auto flex gap-3 items-center mb-6">
        <input 
          type="text" 
          bind:value={searchQuery}
          placeholder="Filter recent projects ledger..."
          class="flex-1 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-4 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-coral)] outline-none transition-colors"
        />
        
        <button 
          onclick={() => isCreateOpen = true}
          class="px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] text-xs font-semibold rounded-lg transition-colors cursor-pointer select-none"
        >
          Create Project
        </button>
      </div>

      <!-- Projects Grid -->
      <div class="max-w-4xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#if filteredProjects.length === 0}
            <div class="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]/20 rounded-xl text-center select-none">
              <span class="text-4xl mb-3">📂</span>
              <h3 class="text-sm font-semibold text-[var(--text-primary)] mb-1">No Projects Found</h3>
              <p class="text-xs text-[var(--text-secondary)] max-w-xs mb-4">Create your first Raspberry Pi wiring schematic or sprint workspace to get started.</p>
              <button 
                onclick={() => isCreateOpen = true}
                class="px-4 py-1.5 bg-[var(--accent-coral)] text-[var(--text-inverse)] hover:bg-[var(--accent-coral-hover)] text-xs font-semibold rounded-md transition-colors cursor-pointer"
              >
                Create Project
              </button>
            </div>
          {:else}
            {#each filteredProjects as proj}
              <!-- Project card -->
              <div 
                onclick={() => selectProject(proj.id)}
                onkeydown={(e) => e.key === 'Enter' && selectProject(proj.id)}
                class="flex flex-col p-5 bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] rounded-xl shadow-md cursor-pointer hover:-translate-y-0.5 transition-all text-left group"
                role="button"
                tabindex="0"
              >
                <!-- Title & bubble color -->
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2 truncate">
                    <div class="w-3 h-3 rounded-full shrink-0" style="background-color: {proj.color}"></div>
                    <span class="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-coral)] transition-colors truncate">
                      {proj.name}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <!-- Status badge -->
                    <span class="px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[9px] font-bold font-mono rounded-full uppercase tracking-wider text-[var(--text-secondary)]">
                      {proj.status}
                    </span>
                    <!-- Delete project button -->
                    <button 
                      onclick={(e) => {
                        e.stopPropagation();
                        projectToDelete = { id: proj.id, name: proj.name };
                        isDeleteOpen = true;
                      }}
                      onkeydown={(e) => e.stopPropagation()}
                      class="p-1 rounded text-neutral-500 hover:text-red-500 hover:bg-[var(--bg-card)] transition-colors cursor-pointer text-xs"
                      title="Delete project"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <!-- Description -->
                <p class="text-xs text-[var(--text-secondary)] leading-relaxed mb-4 line-clamp-2 h-8">
                  {proj.description || 'No description provided.'}
                </p>

                <div class="flex-1"></div>

                <!-- Footer tags & dates -->
                <div class="flex items-center justify-between text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-3 select-none">
                  <span class="font-mono bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded text-[var(--text-secondary)] font-bold">
                    🍓 {BOARDS.find(b => b.id === proj.rpi_model)?.name || proj.rpi_model}
                  </span>
                  <span class="font-mono">
                    Updated {new Date(proj.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </main>

    <!-- Welcome Toast notifications -->
    <div class="fixed bottom-4 right-4 flex flex-col gap-2 z-[200] max-w-sm pointer-events-none select-none">
      {#each $toasts as t}
        <div 
          class="flex items-center gap-3 p-3 rounded-lg shadow-2xl border text-xs font-medium pointer-events-auto select-text animate-slide-up
            {t.type === 'success' ? 'bg-[var(--bg-surface)] border-[var(--accent-teal)] text-[var(--text-primary)]' : t.type === 'error' ? 'bg-[var(--bg-surface)] border-[var(--color-error)] text-[var(--text-primary)]' : 'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)]'}"
        >
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          <span class="flex-1">{t.message}</span>
          <button onclick={() => removeToast(t.id)} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold">✕</button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- CREATE NEW PROJECT MODAL DIALOG -->
{#if isCreateOpen}
  <div class="fixed inset-0 flex items-center justify-center z-[150] bg-black/80 backdrop-blur-sm select-none" role="dialog" aria-modal="true">
    <form 
      onsubmit={handleCreateProject}
      class="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-6 overflow-hidden"
    >
      <!-- Title -->
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-5">
        <h3 class="text-base font-bold text-[var(--text-primary)] font-serif">Setup New PiForge Project</h3>
        <button type="button" onclick={() => isCreateOpen = false} class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">✕</button>
      </div>

      <!-- Form Inputs -->
      <div class="flex flex-col gap-4 overflow-y-auto max-h-[380px] pr-1">
        <!-- Project Name -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="project-name">Project Name</label>
          <input 
            type="text" 
            id="project-name"
            bind:value={newName}
            placeholder="e.g. Smart Irrigation Node..."
            required
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none"
          />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="project-desc">Description</label>
          <textarea 
            id="project-desc"
            bind:value={newDesc}
            placeholder="Brief overview of hardware setups, sensors and milestones..."
            rows="3"
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none resize-none"
          ></textarea>
        </div>

        <!-- RPi Model Tag Select -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="project-model">Primary RPi Board</label>
          <select 
            id="project-model"
            bind:value={newModel}
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
          >
            {#each BOARDS as b}
              <option value={b.id}>{b.name} ({b.pins.length} GPIO pins)</option>
            {/each}
          </select>
        </div>

        <!-- Accent Bubble picker -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="project-color">Workspace Accent Color</label>
          <div id="project-color" class="flex gap-2.5 p-0.5">
            {#each ['#cc785c', '#5db8a6', '#e8a55a', '#9d7adc'] as hex}
              <button 
                type="button"
                onclick={() => newColor = hex}
                class="w-7 h-7 rounded-full border-2 cursor-pointer transition-transform
                  {newColor === hex ? 'border-[var(--text-primary)] scale-110 shadow-lg' : 'border-transparent hover:scale-105'}"
                style="background-color: {hex}"
                aria-label={`Select accent color ${hex}`}
              ></button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4 mt-6">
        <button 
          type="button"
          onclick={() => isCreateOpen = false} 
          class="px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold rounded-md transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          class="px-4 py-2 bg-[var(--accent-coral)] text-[var(--text-inverse)] hover:bg-[var(--accent-coral-hover)] text-xs font-semibold rounded-md transition-colors cursor-pointer"
        >
          Confirm & Create
        </button>
      </div>
    </form>

    <ConfirmModal
      isOpen={isDeleteOpen}
      title="Delete Project"
      message={`Are you sure you want to delete project "${projectToDelete?.name || ''}" permanently? All schematics, tasks, columns, notes, and remote configurations will be permanently erased.`}
      confirmText="Delete"
      cancelText="Cancel"
      type="danger"
      onConfirm={async () => {
        isDeleteOpen = false;
        if (projectToDelete) {
          await deleteProjectById(projectToDelete.id);
          projectToDelete = null;
        }
      }}
      onCancel={() => {
        isDeleteOpen = false;
        projectToDelete = null;
      }}
    />
  </div>
{/if}

<style>
  .animate-slide-up {
    animation: slideUp 250ms ease forwards;
  }
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
</style>
