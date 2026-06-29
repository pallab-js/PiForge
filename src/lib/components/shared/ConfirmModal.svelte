<script lang="ts">
  let { 
    isOpen, 
    title, 
    message, 
    confirmText = 'Confirm', 
    cancelText = 'Cancel', 
    type = 'danger', // 'info' | 'warning' | 'danger'
    onConfirm, 
    onCancel 
  } = $props<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'info' | 'warning' | 'danger';
    onConfirm: () => void;
    onCancel: () => void;
  }>();

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      onConfirm();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div 
    class="fixed inset-0 flex items-center justify-center z-[250] bg-black/80 backdrop-blur-sm select-none" 
    role="dialog" 
    aria-modal="true"
  >
    <!-- Modal Card Container -->
    <div class="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-6 overflow-hidden animate-zoom-in">
      <!-- Icon & Header -->
      <div class="flex items-start gap-3 mb-4">
        <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-lg
          {type === 'danger' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
           type === 'warning' ? 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20' : 
           'bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20'}"
        >
          {#if type === 'danger'}
            ⚠️
          {:else}
            ℹ️
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-bold text-[var(--text-primary)] font-serif truncate leading-tight">
            {title}
          </h4>
          <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2 select-text">
            {message}
          </p>
        </div>
      </div>

      <!-- Action Buttons Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4 mt-6">
        <button 
          type="button"
          onclick={onCancel}
          class="px-3.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
        >
          {cancelText}
        </button>
        <button 
          type="button"
          onclick={onConfirm}
          class="px-3.5 py-1.5 text-[var(--text-inverse)] text-[11px] font-semibold rounded-md transition-colors cursor-pointer
            {type === 'danger' ? 'bg-red-600 hover:bg-red-500' : 
             type === 'warning' ? 'bg-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/90' : 
             'bg-[var(--accent-teal)] hover:bg-[var(--accent-teal)]/90'}"
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .animate-zoom-in {
    animation: zoomIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes zoomIn {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
</style>
