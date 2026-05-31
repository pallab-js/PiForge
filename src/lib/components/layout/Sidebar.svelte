<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions -->
<script lang="ts">
  import { sidebarCollapsed, activeView } from '../../stores/ui.store';
  import type { ViewType } from '../../stores/ui.store';
  import { activeProject, projectsList, selectProject } from '../../stores/project.store';
  import { BOARDS } from '../../rpi-boards';
  import { allComponents, createCustomComponent, removeCustomComponent } from '../../stores/components.store';
  import type { LibraryComponent } from '../../types';

  let showLibrary = $state<'boards' | 'components' | null>(null);

  // Custom component builder modal states
  let isCustomPartOpen = $state(false);
  let customName = $state('');
  let customDesc = $state('');
  let customCategory = $state<LibraryComponent['category']>('communication');
  let customPinCount = $state(4);
  let customIcon = $state('🔌');

  async function handleCreateCustomPart(e: Event) {
    e.preventDefault();
    if (!customName.trim()) return;
    try {
      await createCustomComponent(customName, customDesc, customCategory, customPinCount, customIcon);
      isCustomPartOpen = false;
      customName = '';
      customDesc = '';
      customCategory = 'communication';
      customPinCount = 4;
      customIcon = '🔌';
    } catch (err) {
      console.error(err);
    }
  }

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
          <div class="flex flex-col gap-1.5 py-1 mb-3">
            <!-- Add custom part button -->
            <button 
              onclick={() => isCustomPartOpen = true}
              class="w-full py-1.5 border border-dashed border-[var(--accent-teal)] text-[var(--accent-teal)] hover:bg-[var(--accent-teal)]/10 text-[10px] font-bold rounded cursor-pointer transition-colors text-center uppercase tracking-wider shrink-0 mb-1.5"
            >
              + Create Custom Part
            </button>
            
            <div class="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
              {#each $allComponents as comp}
                <div 
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, 'component', comp.id)}
                  class="flex items-center gap-2.5 p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded hover:border-[var(--accent-teal)] transition-colors cursor-grab active:cursor-grabbing text-xs text-[var(--text-primary)] group select-none"
                  title={comp.description}
                >
                  <span class="text-sm shrink-0">{comp.icon_svg}</span>
                  <div class="overflow-hidden flex-1 flex flex-col">
                    <div class="font-medium truncate group-hover:text-[var(--accent-teal)] flex justify-between items-center w-full">
                      <span class="truncate">{comp.name}</span>
                      {#if !comp.is_builtin}
                        <button 
                          onclick={(e) => {
                            e.stopPropagation();
                            removeCustomComponent(comp.id);
                          }}
                          class="text-neutral-500 hover:text-red-500 text-[10px] pl-1 font-bold cursor-pointer"
                          title="Delete custom part"
                        >
                          ✕
                        </button>
                      {/if}
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)] capitalize">{comp.category} · {comp.pin_count} Pins</div>
                  </div>
                </div>
              {/each}
            </div>
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

<!-- CUSTOM ACCESSORY COMPONENT BUILDER DIALOG -->
{#if isCustomPartOpen}
  <div class="fixed inset-0 flex items-center justify-center z-[150] bg-black/80 backdrop-blur-sm select-none" role="dialog" aria-modal="true">
    <form 
      onsubmit={handleCreateCustomPart}
      class="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-6 overflow-hidden text-left"
    >
      <!-- Title -->
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-5">
        <h3 class="text-base font-bold text-[var(--text-primary)] font-serif">Design Custom Visual Accessory</h3>
        <button type="button" onclick={() => isCustomPartOpen = false} class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">✕</button>
      </div>

      <!-- Inputs -->
      <div class="flex flex-col gap-4 overflow-y-auto max-h-[380px] pr-1">
        <!-- Component Name -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="comp-name">Accessory Name</label>
          <input 
            type="text" 
            id="comp-name"
            bind:value={customName}
            placeholder="e.g. ESP8266 WiFi, MQ-2 Gas Sensor..."
            required
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-teal)] outline-none"
          />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="comp-desc">Description</label>
          <textarea 
            id="comp-desc"
            bind:value={customDesc}
            placeholder="Describe electrical connections, voltage expectations, and BCM interfaces..."
            rows="3"
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-teal)] outline-none resize-none"
          ></textarea>
        </div>

        <!-- Category and Pin selection -->
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="comp-category">Category</label>
            <select 
              id="comp-category"
              bind:value={customCategory}
              class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
            >
              <option value="gpio">GPIO Switch</option>
              <option value="sensors">Analog / Digital Sensor</option>
              <option value="actuators">Servo / Actuator</option>
              <option value="displays">OLED / Screen</option>
              <option value="power">Power Regulator</option>
              <option value="communication">I2C / SPI Communication</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider" for="comp-pins">Pin Count (1-16)</label>
            <input 
              type="number" 
              id="comp-pins"
              bind:value={customPinCount}
              min="1"
              max="16"
              required
              class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-teal)] outline-none"
            />
          </div>
        </div>

        <!-- Icon Picker -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Accessory Icon</label>
          <div class="flex gap-2 p-1 overflow-x-auto bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg">
            {#each ['🔌', '🌡️', '📏', '⚙️', '📺', '📟', '🔔', '🏎️', '🎛️', '🔘', '📶', '🔋', '🧬'] as icon}
              <button 
                type="button"
                onclick={() => customIcon = icon}
                class="text-lg p-1.5 rounded transition-colors cursor-pointer
                  {customIcon === icon ? 'bg-[var(--accent-teal-dim)] border border-[var(--accent-teal)]' : 'hover:bg-[var(--bg-hover)]'}"
              >
                {icon}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-3 border-t border-[var(--border-subtle)] pt-4 mt-6">
        <button 
          type="submit"
          class="flex-1 py-2 bg-[var(--accent-teal)] text-black hover:bg-[var(--accent-teal)]/90 text-xs font-semibold rounded-lg cursor-pointer transition-colors text-center"
        >
          Add to Visual Library
        </button>
        <button 
          type="button" 
          onclick={() => isCustomPartOpen = false} 
          class="px-5 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium rounded-lg cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
{/if}
