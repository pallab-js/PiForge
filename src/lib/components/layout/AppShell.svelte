<script lang="ts">
  import { sidebarCollapsed, activeView } from '../../stores/ui.store';
  import { activeProject, isSaving } from '../../stores/project.store';
  import Sidebar from './Sidebar.svelte';
  import TopBar from './TopBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import SettingsModal from '../settings/SettingsModal.svelte';
  import ExportModal from '../shared/ExportModal.svelte';

  // Import views (to be created)
  import CanvasView from '../canvas/CanvasView.svelte';
  import GraphView from '../graph/GraphView.svelte';
  import BoardView from '../board/BoardView.svelte';
  import ListView from '../list/ListView.svelte';
  import NotesView from '../notes/NotesView.svelte';

  let { children } = $props<{ children?: any }>();

  let isSettingsOpen = $state(false);
  let isExportOpen = $state(false);
</script>

<div class="flex h-screen w-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
  <!-- Sidebar -->
  <Sidebar />

  <!-- Main Area -->
  <div class="flex flex-col flex-1 h-full min-w-0">
    <!-- Header -->
    <TopBar 
      onOpenSettings={() => isSettingsOpen = true}
      onOpenExport={() => isExportOpen = true}
    />

    <!-- Active View Area -->
    <main class="flex-1 min-h-0 relative bg-[var(--canvas-bg)]">
      {#if $activeView === 'canvas'}
        <CanvasView />
      {:else if $activeView === 'graph'}
        <GraphView />
      {:else if $activeView === 'board'}
        <BoardView />
      {:else if $activeView === 'list'}
        <ListView />
      {:else if $activeView === 'notes'}
        <NotesView />
      {/if}
    </main>

    <!-- Footer Status -->
    <StatusBar />
  </div>

  <!-- Settings Modals -->
  <SettingsModal 
    isOpen={isSettingsOpen} 
    onClose={() => isSettingsOpen = false} 
  />

  <!-- Export Modals -->
  <ExportModal 
    isOpen={isExportOpen} 
    onClose={() => isExportOpen = false} 
  />
</div>
