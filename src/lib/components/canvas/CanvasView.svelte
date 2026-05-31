<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions a11y_click_events_have_key_events a11y-click-events-have-key-events -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { activeCanvasState, updateCanvasStateDirectly, tasksList, pushCanvasHistory, undoCanvas, redoCanvas } from '../../stores/project.store';
  import { selectedNodeId, selectedEdgeId, selectedPinId, addToast } from '../../stores/ui.store';
  import { settings } from '../../stores/settings.store';
  import { BOARDS } from '../../rpi-boards';
  import type { PinInfo } from '../../rpi-boards';
  import { BUILTIN_COMPONENTS } from '../../components-library';
  import * as ipc from '../../ipc';
  import type { CanvasNode, CanvasEdge, CanvasState } from '../../types';

  // Toolbar active tool: 'select' | 'wire' | 'text' | 'sticky'
  let activeTool = $state<'select' | 'wire' | 'sticky'>('select');

  // Viewport transforms
  let panX = $state(0);
  let panY = $state(0);
  let scale = $state(1);

  // Drag states
  let isPanning = $state(false);
  let startPanX = $state(0);
  let startPanY = $state(0);

  let draggingNodeId = $state<string | null>(null);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let nodeStartX = $state(0);
  let nodeStartY = $state(0);

  // Connection wire drawer state
  let wireStartNodeId = $state<string | null>(null);
  let wireStartPinId = $state<string | null>(null);

  // Sync viewport scale with status bar and store
  $effect(() => {
    if ($activeCanvasState) {
      panX = $activeCanvasState.viewport.x;
      panY = $activeCanvasState.viewport.y;
      scale = $activeCanvasState.viewport.scale;
    }
  });

  // Snaps to grid helper
  function snap(val: number): number {
    if (!$settings.snap_to_grid) return val;
    const grid = 20;
    return Math.round(val / grid) * grid;
  }

  // --- VIEWPORT PAN/ZOOM HANDLERS ---
  function handleMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    
    // Middle click or Space+Click or clicking canvas background starts panning
    if (e.button === 1 || e.shiftKey || target.classList.contains('canvas-bg') || target.classList.contains('grid-layer')) {
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      e.preventDefault();
      return;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (isPanning) {
      panX = e.clientX - startPanX;
      panY = e.clientY - startPanY;
      saveViewport();
      return;
    }

    if (draggingNodeId) {
      const dx = (e.clientX - dragStartX) / scale;
      const dy = (e.clientY - dragStartY) / scale;
      
      activeCanvasState.update(state => {
        if (!state) return state;
        const nodes = state.nodes.map(n => {
          if (n.id === draggingNodeId) {
            return {
              ...n,
              x: snap(nodeStartX + dx),
              y: snap(nodeStartY + dy)
            };
          }
          return n;
        });
        return { ...state, nodes };
      });
    }
  }

  function handleMouseUp() {
    if (isPanning) {
      isPanning = false;
    }
    if (draggingNodeId) {
      pushCanvasHistory($activeCanvasState);
      updateCanvasStateDirectly($activeCanvasState);
      draggingNodeId = null;
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 0.05;
    let nextScale = scale;
    if (e.deltaY < 0) {
      nextScale = Math.min(scale + zoomFactor, 3);
    } else {
      nextScale = Math.max(scale - zoomFactor, 0.2);
    }
    
    scale = nextScale;
    saveViewport();
  }

  function saveViewport() {
    activeCanvasState.update(state => {
      if (!state) return state;
      return {
        ...state,
        viewport: { x: panX, y: panY, scale }
      };
    });
  }

  // --- NODE INTERACTION ---
  function startDragNode(e: MouseEvent, node: CanvasNode) {
    if (activeTool !== 'select' || node.locked) return;
    e.stopPropagation();
    
    draggingNodeId = node.id;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    nodeStartX = node.x;
    nodeStartY = node.y;
    
    selectedNodeId.set(node.id);
    selectedEdgeId.set(null);
  }

  // --- WIRE DRAWING ---
  function handlePinClick(e: MouseEvent, nodeId: string, pinId: string) {
    e.stopPropagation();
    selectedPinId.set(`${nodeId}_${pinId}`);

    if (activeTool === 'wire') {
      if (!wireStartNodeId) {
        // Start connection
        wireStartNodeId = nodeId;
        wireStartPinId = pinId;
        addToast('Connection started. Click target pin to connect.', 'info', 2000);
      } else {
        // End connection
        if (wireStartNodeId === nodeId) {
          addToast('Cannot connect a pin to the same node', 'warning');
          wireStartNodeId = null;
          wireStartPinId = null;
          return;
        }

        // Add edge
        const newEdge: CanvasEdge = {
          id: ipc.uuid(),
          sourceId: wireStartNodeId,
          sourcePinId: wireStartPinId || undefined,
          targetId: nodeId,
          targetPinId: pinId,
          type: 'wire',
          color: $settings.accent_color === 'coral' ? '#cc785c' : $settings.accent_color === 'teal' ? '#5db8a6' : '#e8a55a',
          style: 'solid'
        };

        activeCanvasState.update(state => {
          if (!state) return state;
          const edges = [...state.edges, newEdge];
          const next = { ...state, edges };
          pushCanvasHistory(next);
          updateCanvasStateDirectly(next);
          return next;
        });

        addToast('Pins connected successfully', 'success');
        wireStartNodeId = null;
        wireStartPinId = null;
      }
    }
  }

  // --- DROP DROP HANDLERS FROM SIDEBAR ---
  function handleDragOverCanvas(e: DragEvent) {
    e.preventDefault();
  }

  async function handleDropCanvas(e: DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer?.getData('application/piforge-type');
    const id = e.dataTransfer?.getData('application/piforge-id');
    if (!type || !id) return;

    // Calculate canvas drop coordinates
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // Transform coordinates from screen back to canvas space
    const x = snap((clientX - panX) / scale);
    const y = snap((clientY - panY) / scale);

    if (type === 'board') {
      const board = BOARDS.find(b => b.id === id);
      if (!board) return;

      const newNode: CanvasNode = {
        id: ipc.uuid(),
        type: 'rpi_board',
        x,
        y,
        width: 320,
        height: 220,
        boardModel: id,
        locked: false,
        zIndex: $activeCanvasState.nodes.length + 1,
        style: {}
      };

      activeCanvasState.update(state => {
        const next = { ...state, nodes: [...state.nodes, newNode] };
        pushCanvasHistory(next);
        updateCanvasStateDirectly(next);
        return next;
      });
      addToast(`${board.name} added to board`, 'success');
    } else if (type === 'component') {
      const comp = BUILTIN_COMPONENTS.find(c => c.id === id);
      if (!comp) return;

      const newNode: CanvasNode = {
        id: ipc.uuid(),
        type: 'component',
        x,
        y,
        width: 140,
        height: 80,
        label: comp.name,
        componentId: id,
        locked: false,
        zIndex: $activeCanvasState.nodes.length + 1,
        style: {}
      };

      activeCanvasState.update(state => {
        const next = { ...state, nodes: [...state.nodes, newNode] };
        pushCanvasHistory(next);
        updateCanvasStateDirectly(next);
        return next;
      });
      addToast(`${comp.name} accessory added`, 'success');
    }
  }

  // --- TOOLBAR CONTROLS ---
  function handleAddSticky() {
    activeTool = 'select';
    
    const newNode: CanvasNode = {
      id: ipc.uuid(),
      type: 'sticky',
      x: snap(200 - panX),
      y: snap(150 - panY),
      width: 180,
      height: 120,
      label: 'Type some details or warnings here. Double click to modify!',
      locked: false,
      zIndex: $activeCanvasState.nodes.length + 1,
      style: { fill: '#cc785c' }
    };

    activeCanvasState.update(state => {
      const next = { ...state, nodes: [...state.nodes, newNode] };
      pushCanvasHistory(next);
      updateCanvasStateDirectly(next);
      return next;
    });
    addToast('Sticky note placed', 'success');
  }

  function handleAddText() {
    activeTool = 'select';
    
    const newNode: CanvasNode = {
      id: ipc.uuid(),
      type: 'text',
      x: snap(200 - panX),
      y: snap(150 - panY),
      width: 120,
      height: 40,
      label: 'Text Label',
      locked: false,
      zIndex: $activeCanvasState.nodes.length + 1,
      style: {}
    };

    activeCanvasState.update(state => {
      const next = { ...state, nodes: [...state.nodes, newNode] };
      pushCanvasHistory(next);
      updateCanvasStateDirectly(next);
      return next;
    });
  }

  function handleDeleteSelected() {
    const nid = $selectedNodeId;
    const eid = $selectedEdgeId;

    if (nid) {
      activeCanvasState.update(state => {
        const nodes = state.nodes.filter(n => n.id !== nid);
        // Also remove connected wires
        const edges = state.edges.filter(e => e.sourceId !== nid && e.targetId !== nid);
        const next = { ...state, nodes, edges };
        pushCanvasHistory(next);
        updateCanvasStateDirectly(next);
        return next;
      });
      selectedNodeId.set(null);
      addToast('Deleted selected component', 'info');
    } else if (eid) {
      activeCanvasState.update(state => {
        const edges = state.edges.filter(e => e.id !== eid);
        const next = { ...state, edges };
        pushCanvasHistory(next);
        updateCanvasStateDirectly(next);
        return next;
      });
      selectedEdgeId.set(null);
      addToast('Deleted wire connection', 'info');
    }
  }

  // --- DOUBLE CLICK STICKY EDIT ---
  let isEditingText = $state(false);
  let editingNodeValue = $state('');
  let editingNodeId = $state<string | null>(null);

  function startEditingNode(node: CanvasNode) {
    if (node.type !== 'sticky' && node.type !== 'text' && node.type !== 'component') return;
    editingNodeId = node.id;
    editingNodeValue = node.label || '';
    isEditingText = true;
  }

  function saveEditingNode() {
    if (!editingNodeId) return;
    activeCanvasState.update(state => {
      const nodes = state.nodes.map(n => {
        if (n.id === editingNodeId) {
          return { ...n, label: editingNodeValue };
        }
        return n;
      });
      const next = { ...state, nodes };
      pushCanvasHistory(next);
      updateCanvasStateDirectly(next);
      return next;
    });
    isEditingText = false;
    editingNodeId = null;
  }

  // KEYBOARD DELETES
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      // Don't delete if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || isEditingText) return;
      handleDeleteSelected();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div 
  class="flex h-full w-full relative overflow-hidden"
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
  onwheel={handleWheel}
  ondragover={handleDragOverCanvas}
  ondrop={handleDropCanvas}
>
  <!-- Infinite Dot Grids background layer -->
  <div 
    class="absolute inset-0 grid-layer pointer-events-none select-none"
    style="
      background-color: var(--canvas-bg);
      background-size: {20 * scale}px {20 * scale}px;
      background-position: {panX}px {panY}px;
      background-image: {$settings.grid_type === 'dots' 
        ? `radial-gradient(var(--canvas-grid-dot) 1px, transparent 1px)` 
        : $settings.grid_type === 'lines' 
          ? `linear-gradient(to right, var(--canvas-grid-dot) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid-dot) 1px, transparent 1px)`
          : 'none'};
    "
  ></div>

  <!-- Drawing viewport (Scales and Translates dynamically) -->
  <div 
    class="absolute inset-0 pointer-events-none select-none"
    style="transform: translate({panX}px, {panY}px) scale({scale}); transform-origin: 0 0;"
  >
    <!-- SVG Wires Connection Layer -->
    <svg class="absolute inset-0 w-[5000px] h-[5000px] pointer-events-auto" style="overflow: visible;">
      {#each $activeCanvasState.edges as edge}
        {@const src = $activeCanvasState.nodes.find(n => n.id === edge.sourceId)}
        {@const dst = $activeCanvasState.nodes.find(n => n.id === edge.targetId)}
        
        {#if src && dst}
          <!-- Calculate start/end line coordinates -->
          {@const x1 = src.x + (edge.sourcePinId ? (src.type === 'rpi_board' ? 80 : 15) : src.width/2)}
          {@const y1 = src.y + (edge.sourcePinId ? (src.type === 'rpi_board' ? 35 : 15) : src.height/2)}
          {@const x2 = dst.x + (edge.targetPinId ? 15 : dst.width/2)}
          {@const y2 = dst.y + (edge.targetPinId ? 15 : dst.height/2)}
          
          <!-- Bezier curved wires -->
          {@const cx1 = x1 + (x2 - x1) / 2}
          {@const cy1 = y1}
          {@const cx2 = x1 + (x2 - x1) / 2}
          {@const cy2 = y2}

          <path 
            d="M {x1} {y1} C {cx1} {cy1}, {cx2} {cy2}, {x2} {y2}" 
            fill="none" 
            stroke={edge.id === $selectedEdgeId ? 'var(--accent-coral)' : edge.color || '#5db8a6'} 
            stroke-width={edge.id === $selectedEdgeId ? 4 : 2} 
            stroke-dasharray={edge.style === 'dashed' ? '5,5' : 'none'}
            class="cursor-pointer hover:stroke-[var(--accent-coral)] transition-colors"
            onmousedown={(e) => {
              e.stopPropagation();
              selectedEdgeId.set(edge.id);
              selectedNodeId.set(null);
            }}
          />
        {/if}
      {/each}
    </svg>

    <!-- Node objects overlay -->
    <div class="absolute inset-0 pointer-events-none">
      {#each $activeCanvasState.nodes as node}
        <!-- Node wrapper -->
        <div 
          class="absolute pointer-events-auto select-none rounded border transition-shadow
            {node.id === $selectedNodeId ? 'border-[var(--accent-coral)] shadow-2xl z-40' : 'border-[var(--border-default)] shadow-md z-10'}"
          style="
            left: {node.x}px; 
            top: {node.y}px; 
            width: {node.width}px; 
            height: {node.height}px;
            background-color: {node.type === 'sticky' ? 'var(--bg-elevated)' : 'var(--bg-surface)'};
          "
          onmousedown={(e) => startDragNode(e, node)}
          ondblclick={() => startEditingNode(node)}
        >
          <!-- RPI MOTHERBOARD RENDER -->
          {#if node.type === 'rpi_board'}
            <div class="flex flex-col h-full w-full p-3 select-none">
              <div class="flex items-center justify-between pb-1 mb-2 border-b border-[var(--border-subtle)]">
                <span class="text-xs font-serif font-bold text-[var(--accent-coral)]">🍓 Raspberry Pi Model</span>
                <span class="text-[9px] uppercase font-mono text-[var(--text-secondary)]">{node.boardModel}</span>
              </div>
              <div class="flex-1 flex flex-col items-center justify-center bg-[var(--bg-base)]/40 rounded border border-[var(--border-subtle)] p-2">
                <span class="text-4xl mb-1">🍓</span>
                <span class="text-[10px] font-bold text-[var(--text-primary)]">GPIO Header (40-Pins)</span>
                
                <!-- Quick interactive pin row -->
                <div class="flex gap-0.5 mt-2 flex-wrap max-w-[180px] justify-center">
                  {#each Array(40) as _, i}
                    <button 
                      onclick={(e) => handlePinClick(e, node.id, (i + 1).toString())}
                      class="w-2.5 h-2.5 rounded-sm text-[6px] flex items-center justify-center border font-mono select-none transition-colors cursor-pointer
                        {wireStartPinId === (i+1).toString() && wireStartNodeId === node.id 
                          ? 'bg-[var(--accent-coral)] border-[var(--text-primary)] text-[var(--text-inverse)]' 
                          : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--accent-coral)]'}"
                      title={`Physical Pin ${i+1}`}
                    >
                      {i + 1}
                    </button>
                  {/each}
                </div>
              </div>
            </div>

          <!-- ACCESSORIES HARDWARE COMPONENT -->
          {:else if node.type === 'component'}
            {@const comp = BUILTIN_COMPONENTS.find(c => c.id === node.componentId)}
            <div class="flex flex-col h-full w-full p-2.5">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="text-lg">{comp?.icon_svg || '🔌'}</span>
                <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
              </div>
              <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
              
              <div class="flex-1"></div>
              
              <!-- Component Pin nodes -->
              <div class="flex gap-1 justify-end border-t border-[var(--border-subtle)] pt-1.5 mt-1 select-none">
                {#each Array(comp?.pin_count || 2) as _, i}
                  <button 
                    onclick={(e) => handlePinClick(e, node.id, (i + 1).toString())}
                    class="w-3.5 h-3.5 rounded text-[8px] font-bold border flex items-center justify-center font-mono select-none cursor-pointer transition-colors
                      {wireStartPinId === (i+1).toString() && wireStartNodeId === node.id 
                        ? 'bg-[var(--accent-coral)] border-[var(--text-primary)] text-[var(--text-inverse)]' 
                        : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--accent-teal)] hover:bg-[var(--accent-teal)] hover:text-black'}"
                    title={`Component Pin ${i+1}`}
                  >
                    P{i + 1}
                  </button>
                {/each}
              </div>
            </div>

          <!-- STICKY ANNOTATION NOTE -->
          {:else if node.type === 'sticky'}
            <div class="flex flex-col h-full w-full p-3 border-l-4 border-l-[var(--accent-coral)] select-none">
              <div class="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-coral)] mb-1">Sticky Note</div>
              <p class="text-xs text-[var(--text-primary)] leading-normal line-clamp-5 select-text font-serif italic">{node.label}</p>
            </div>

          <!-- PLAIN TEXT LABEL -->
          {:else if node.type === 'text'}
            <div class="flex items-center justify-center h-full w-full p-1 bg-transparent border-0 select-none">
              <span class="text-xs font-bold text-[var(--text-primary)]">{node.label}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Left Float toolbar pill -->
  <div class="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-1.5 gap-1.5 z-[90] select-none">
    <button 
      onclick={() => { activeTool = 'select'; wireStartNodeId = null; }}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer
        {activeTool === 'select' ? 'bg-[var(--accent-coral-dim)] text-[var(--accent-coral)] border border-[var(--accent-coral)] font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}"
      title="Select & Drag Tool (V)"
      aria-label="Select tool"
    >
      🔲
    </button>
    <button 
      onclick={() => activeTool = 'wire'}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer
        {activeTool === 'wire' ? 'bg-[var(--accent-coral-dim)] text-[var(--accent-coral)] border border-[var(--accent-coral)] font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}"
      title="Wiring Tool (C)"
      aria-label="Wiring tool"
    >
      🔌
    </button>
    <div class="h-[1px] bg-[var(--border-subtle)] mx-1"></div>
    <button 
      onclick={handleAddSticky}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
      title="Add Sticky Note (N)"
      aria-label="Add sticky note"
    >
      📝
    </button>
    <button 
      onclick={handleAddText}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
      title="Add Text Label (T)"
      aria-label="Add text label"
    >
      🔤
    </button>
    <div class="h-[1px] bg-[var(--border-subtle)] mx-1"></div>
    <button 
      onclick={undoCanvas}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
      title="Undo Operation"
      aria-label="Undo"
    >
      ↩️
    </button>
    <button 
      onclick={redoCanvas}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
      title="Redo Operation"
      aria-label="Redo"
    >
      ↪️
    </button>
  </div>

  <!-- Inline text modifier box for sticky/labels -->
  {#if isEditingText}
    <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-[110] backdrop-blur-sm select-none">
      <div class="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-5">
        <h4 class="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">Edit Annotation Details</h4>
        <textarea 
          bind:value={editingNodeValue}
          rows="4"
          class="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg p-3 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none resize-none mb-4"
        ></textarea>
        <div class="flex gap-2">
          <button 
            onclick={saveEditingNode}
            class="flex-1 py-1.5 bg-[var(--accent-coral)] text-[var(--text-inverse)] hover:bg-[var(--accent-coral-hover)] text-xs font-semibold rounded cursor-pointer transition-colors"
          >
            Apply Change
          </button>
          <button 
            onclick={() => isEditingText = false}
            class="px-4 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium rounded cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
