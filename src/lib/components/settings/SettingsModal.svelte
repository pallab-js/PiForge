<script lang="ts">
  import { settings } from '../../stores/settings.store';

  let { isOpen, onClose } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  function selectTheme(theme: 'dark' | 'light' | 'warm') {
    settings.updateTheme(theme);
  }

  function selectAccent(accent: 'coral' | 'teal' | 'amber' | 'violet') {
    settings.updateAccent(accent);
  }

  function selectFontSize(size: 'compact' | 'default' | 'comfortable') {
    settings.updateFontSize(size);
  }

  function selectGrid(type: 'dots' | 'lines' | 'none') {
    settings.updateGrid(type);
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 flex items-center justify-center z-[100] bg-black/70 backdrop-blur-sm select-none" role="dialog" aria-modal="true">
    <!-- Modal Dialog Body -->
    <div class="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-6 overflow-hidden">
      <!-- Title -->
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-5">
        <h3 class="text-base font-semibold text-[var(--text-primary)]">Preferences & Settings</h3>
        <button 
          onclick={onClose} 
          class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer"
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      <!-- Settings Content -->
      <div class="flex flex-col gap-5 overflow-y-auto max-h-[420px] pr-1">
        <!-- Theme Selection -->
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]" for="theme-options">Color Theme</label>
          <div id="theme-options" class="grid grid-cols-3 gap-2">
            <button 
              onclick={() => selectTheme('dark')}
              class="flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium cursor-pointer transition-all
                {$settings.theme === 'dark' ? 'border-[var(--accent-coral)] bg-[var(--bg-selected)] text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'}"
            >
              <span class="text-lg mb-1">🌑</span>
              Dark
            </button>
            <button 
              onclick={() => selectTheme('light')}
              class="flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium cursor-pointer transition-all
                {$settings.theme === 'light' ? 'border-[var(--accent-coral)] bg-[var(--bg-selected)] text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'}"
            >
              <span class="text-lg mb-1">☀️</span>
              Light
            </button>
            <button 
              onclick={() => selectTheme('warm')}
              class="flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium cursor-pointer transition-all
                {$settings.theme === 'warm' ? 'border-[var(--accent-coral)] bg-[var(--bg-selected)] text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'}"
            >
              <span class="text-lg mb-1">🍂</span>
              Warm
            </button>
          </div>
        </div>

        <!-- Accent Colors -->
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]" for="accent-options">Accent Highlights</label>
          <div id="accent-options" class="flex gap-3 p-1">
            <button 
              onclick={() => selectAccent('coral')} 
              class="w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-[#cc785c]
                {$settings.accent_color === 'coral' ? 'border-[var(--text-primary)] scale-110 shadow-lg' : 'border-transparent hover:scale-105'}"
              title="Coral accent"
              aria-label="Coral accent"
            ></button>
            <button 
              onclick={() => selectAccent('teal')} 
              class="w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-[#5db8a6]
                {$settings.accent_color === 'teal' ? 'border-[var(--text-primary)] scale-110 shadow-lg' : 'border-transparent hover:scale-105'}"
              title="Teal accent"
              aria-label="Teal accent"
            ></button>
            <button 
              onclick={() => selectAccent('amber')} 
              class="w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-[#e8a55a]
                {$settings.accent_color === 'amber' ? 'border-[var(--text-primary)] scale-110 shadow-lg' : 'border-transparent hover:scale-105'}"
              title="Amber accent"
              aria-label="Amber accent"
            ></button>
            <button 
              onclick={() => selectAccent('violet')} 
              class="w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-[#9d7adc]
                {$settings.accent_color === 'violet' ? 'border-[var(--text-primary)] scale-110 shadow-lg' : 'border-transparent hover:scale-105'}"
              title="Violet accent"
              aria-label="Violet accent"
            ></button>
          </div>
        </div>

        <!-- Layout Typography Size -->
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]" for="size-options">Typography Scale</label>
          <div id="size-options" class="grid grid-cols-3 gap-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] p-1 rounded-lg">
            <button 
              onclick={() => selectFontSize('compact')} 
              class="py-1.5 px-3 rounded text-xs font-medium cursor-pointer transition-all
                {$settings.font_size === 'compact' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              Compact
            </button>
            <button 
              onclick={() => selectFontSize('default')} 
              class="py-1.5 px-3 rounded text-xs font-medium cursor-pointer transition-all
                {$settings.font_size === 'default' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              Default
            </button>
            <button 
              onclick={() => selectFontSize('comfortable')} 
              class="py-1.5 px-3 rounded text-xs font-medium cursor-pointer transition-all
                {$settings.font_size === 'comfortable' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              Comfortable
            </button>
          </div>
        </div>

        <!-- Canvas Grids Configuration -->
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]" for="grid-options">Drawing Grid Layout</label>
          <div id="grid-options" class="grid grid-cols-3 gap-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] p-1 rounded-lg">
            <button 
              onclick={() => selectGrid('dots')} 
              class="py-1.5 px-3 rounded text-xs font-medium cursor-pointer transition-all
                {$settings.grid_type === 'dots' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              Dots
            </button>
            <button 
              onclick={() => selectGrid('lines')} 
              class="py-1.5 px-3 rounded text-xs font-medium cursor-pointer transition-all
                {$settings.grid_type === 'lines' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              Gridlines
            </button>
            <button 
              onclick={() => selectGrid('none')} 
              class="py-1.5 px-3 rounded text-xs font-medium cursor-pointer transition-all
                {$settings.grid_type === 'none' ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              Clean
            </button>
          </div>
        </div>

        <!-- Snap grid toggle -->
        <div class="flex items-center justify-between p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg">
          <div class="flex flex-col">
            <span class="text-xs font-medium text-[var(--text-primary)]">Snap to Grid</span>
            <span class="text-[10px] text-[var(--text-secondary)]">Align nodes to gridlines while dragging</span>
          </div>
          <button 
            onclick={() => settings.updateSnapToGrid(!$settings.snap_to_grid)}
            class="w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer
              {$settings.snap_to_grid ? 'bg-[var(--accent-coral)]' : 'bg-[var(--bg-card)]'}"
            aria-label="Toggle snap to grid"
          >
            <div 
              class="w-4 h-4 rounded-full bg-white transition-transform duration-200 transform
                {$settings.snap_to_grid ? 'translate-x-5' : 'translate-x-0'}"
            ></div>
          </button>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-end border-t border-[var(--border-subtle)] pt-4 mt-6">
        <button 
          onclick={onClose} 
          class="px-4 py-2 bg-[var(--accent-coral)] text-[var(--text-inverse)] hover:bg-[var(--accent-coral-hover)] text-xs font-semibold rounded-md transition-colors cursor-pointer"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
