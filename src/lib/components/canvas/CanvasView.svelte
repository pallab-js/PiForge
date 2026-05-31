<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions a11y_click_events_have_key_events a11y-click-events-have-key-events -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { activeCanvasState, updateCanvasStateDirectly, tasksList, pushCanvasHistory, undoCanvas, redoCanvas } from '../../stores/project.store';
  import { selectedNodeId, selectedEdgeId, selectedPinId, addToast } from '../../stores/ui.store';
  import { settings } from '../../stores/settings.store';
  import { BOARDS, RPI_40PIN_HEADER, RPI_PICO_HEADER } from '../../rpi-boards';
  import type { PinInfo } from '../../rpi-boards';
  import { BUILTIN_COMPONENTS } from '../../components-library';
  import * as ipc from '../../ipc';
  import type { CanvasNode, CanvasEdge, CanvasState } from '../../types';
  import { 
    isSimulating, 
    nodeSimStates, 
    boardPinStates, 
    toggleSimulation, 
    toggleBoardPin, 
    updateNodeSimState, 
    isEdgePowered, 
    activeMacroName, 
    startMacro, 
    stopMacro 
  } from '../../stores/simulation.store';

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

  // Diagnostics Panel toggle state
  let showDiagnostics = $state(false);

  // Wire routing style state
  let isOrthogonal = $state(true);

  function computeOrthogonalPath(x1: number, y1: number, x2: number, y2: number, radius = 8): string {
    if (Math.abs(x1 - x2) < 2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (Math.abs(y1 - y2) < 2) return `M ${x1} ${y1} L ${x2} ${y2}`;

    const midX = x1 + (x2 - x1) / 2;
    const signX = Math.sign(x2 - x1);
    const signY = Math.sign(y2 - y1);
    const r = Math.min(radius, Math.abs(midX - x1), Math.abs(y2 - y1) / 2);

    const p1x = midX - signX * r;
    const p1y = y1;
    const c1x = midX;
    const c1y = y1;
    const p2x = midX;
    const p2y = y1 + signY * r;

    const p3x = midX;
    const p3y = y2 - signY * r;
    const c2x = midX;
    const c2y = y2;
    const p4x = midX + signX * r;
    const p4y = y2;

    return `M ${x1} ${y1} L ${p1x} ${p1y} Q ${c1x} ${c1y}, ${p2x} ${p2y} L ${p3x} ${p3y} Q ${c2x} ${c2y}, ${p4x} ${p4y} L ${x2} ${y2}`;
  }

  function updateWireProperty(edgeId: string, updates: Partial<CanvasEdge>) {
    activeCanvasState.update(state => {
      if (!state) return state;
      const edges = state.edges.map(edge => {
        if (edge.id === edgeId) {
          return { ...edge, ...updates };
        }
        return edge;
      });
      const next = { ...state, edges };
      updateCanvasStateDirectly(next);
      return next;
    });
  }

  // Hardware Diagnostics & Conflicts Validator
  interface DiagnosticIssue {
    type: 'error' | 'warning';
    message: string;
  }

  let diagnostics = $derived.by<DiagnosticIssue[]>(() => {
    const canvas = $activeCanvasState;
    if (!canvas) return [];

    const issues: DiagnosticIssue[] = [];
    const rpiNodes = canvas.nodes.filter(n => n.type === 'rpi_board');
    if (rpiNodes.length === 0) return [];

    const rpiNode = rpiNodes[0];
    const header = rpiNode.boardModel?.includes('pico') ? RPI_PICO_HEADER : RPI_40PIN_HEADER;

    // 1. Check for GPIO Pin Conflicts (multiple components wired to the same physical pin)
    const pinUsage: Record<string, string[]> = {};

    canvas.edges.forEach(edge => {
      let rpiPinId: string | null = null;
      let targetNodeId: string | null = null;

      if (edge.sourceId === rpiNode.id && edge.sourcePinId) {
        rpiPinId = edge.sourcePinId;
        targetNodeId = edge.targetId;
      } else if (edge.targetId === rpiNode.id && edge.targetPinId) {
        rpiPinId = edge.targetPinId;
        targetNodeId = edge.sourceId;
      }

      if (rpiPinId && targetNodeId) {
        const targetNode = canvas.nodes.find(n => n.id === targetNodeId);
        if (targetNode && targetNode.type === 'component') {
          const pinName = rpiPinId;
          if (!pinUsage[pinName]) pinUsage[pinName] = [];
          
          const label = targetNode.label || 'Component';
          if (!pinUsage[pinName].includes(label)) {
            pinUsage[pinName].push(label);
          }
        }
      }
    });

    Object.entries(pinUsage).forEach(([pin, components]) => {
      const physicalPin = parseInt(pin);
      const pinInfo = header.find(p => p.physical === physicalPin);
      const pinLabel = pinInfo ? `${pinInfo.function} (Pin ${pin})` : `Pin ${pin}`;

      // Bypass shared buses (I2C Pin 3/5, HAT EEPROM Pin 27/28)
      if (components.length > 1 && pin !== '3' && pin !== '5' && pin !== '27' && pin !== '28') {
        issues.push({
          type: 'error',
          message: `GPIO Pin Conflict: ${pinLabel} is wired to multiple accessories: ${components.join(' and ')}.`
        });
      }
    });

    // 2. Check for power voltage mismatches
    canvas.edges.forEach(edge => {
      let rpiPinId: string | null = null;
      let targetNodeId: string | null = null;
      let targetPinId: string | null = null;

      if (edge.sourceId === rpiNode.id && edge.sourcePinId) {
        rpiPinId = edge.sourcePinId;
        targetNodeId = edge.targetId;
        targetPinId = edge.targetPinId || '1';
      } else if (edge.targetId === rpiNode.id && edge.targetPinId) {
        rpiPinId = edge.targetPinId;
        targetNodeId = edge.sourceId;
        targetPinId = edge.sourcePinId || '1';
      }

      if (rpiPinId && targetNodeId && targetPinId) {
        const targetNode = canvas.nodes.find(n => n.id === targetNodeId);
        if (targetNode && targetNode.type === 'component') {
          const physicalPin = parseInt(rpiPinId);
          const pinInfo = header.find(p => p.physical === physicalPin);
          
          if (pinInfo) {
            // SG90 Servo power warnings (expects 5V)
            if (targetNode.componentId === 'servo' && targetPinId === '1') {
              if (pinInfo.type === 'power3v3') {
                issues.push({
                  type: 'warning',
                  message: `Power Mismatch: SG90 Servo VCC is wired to 3.3V Power (Pin ${physicalPin}). 5V Power (Pin 2 or 4) is highly recommended for high-load torque.`
                });
              }
            }

            // Relay power warnings (expects 5V)
            if (targetNode.componentId === 'relay' && targetPinId === '1') {
              if (pinInfo.type === 'power3v3') {
                issues.push({
                  type: 'warning',
                  message: `Power Mismatch: Relay coil VCC is wired to 3.3V (Pin ${physicalPin}). Use 5V Power (Pin 2 or 4) to ensure robust latching.`
                });
              }
            }
          }
        }
      }
    });

    return issues;
  });

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
          
          {@const midX = x1 + (x2 - x1) / 2}
          {@const isPowered = $isSimulating && isEdgePowered(edge.id, $activeCanvasState)}
          {@const pathD = isOrthogonal 
            ? computeOrthogonalPath(x1, y1, x2, y2) 
            : `M ${x1} ${y1} C ${x1 + (x2 - x1)/2} ${y1}, ${x1 + (x2 - x1)/2} ${y2}, ${x2} ${y2}`}

          <path 
            d={pathD} 
            fill="none" 
            stroke={edge.id === $selectedEdgeId 
              ? 'var(--accent-coral)' 
              : isPowered 
                ? '#e8a55a' 
                : edge.color || '#5db8a6'} 
            stroke-width={edge.id === $selectedEdgeId ? 4 : isPowered ? 3.5 : 2} 
            stroke-dasharray={edge.style === 'dashed' ? '5,5' : 'none'}
            class="cursor-pointer hover:stroke-[var(--accent-coral)] transition-all {isPowered ? 'animate-pulse drop-shadow-[0_0_8px_rgba(232,165,90,0.8)]' : ''}"
            onmousedown={(e) => {
              e.stopPropagation();
              selectedEdgeId.set(edge.id);
              selectedNodeId.set(null);
            }}
          />

          <!-- Net Label overlay on wire with clean background mask -->
          {#if edge.label}
            {@const labelX = isOrthogonal ? midX : x1 + (x2 - x1) / 2}
            {@const labelY = (y1 + y2) / 2}
            <g class="pointer-events-none select-none">
              <!-- Background mask -->
              <rect 
                x={labelX - (edge.label.length * 2.5) - 3} 
                y={labelY - 5} 
                width={(edge.label.length * 5) + 6} 
                height={10} 
                fill="var(--canvas-bg)" 
                rx="2"
              />
              <text 
                x={labelX} 
                y={labelY + 2.5} 
                fill="var(--text-secondary)" 
                font-size="7" 
                font-family="monospace" 
                font-weight="bold"
                text-anchor="middle"
              >
                {edge.label}
              </text>
            </g>
          {/if}
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
                    {@const pinNum = (i + 1).toString()}
                    {@const isPinHigh = $isSimulating && $boardPinStates[pinNum] === 1}
                    <button 
                      onclick={(e) => {
                        e.stopPropagation();
                        if ($isSimulating) {
                          toggleBoardPin(pinNum);
                        } else {
                          handlePinClick(e, node.id, pinNum);
                        }
                      }}
                      class="w-2.5 h-2.5 rounded-sm text-[6px] flex items-center justify-center border font-mono select-none transition-colors cursor-pointer
                        {wireStartPinId === pinNum && wireStartNodeId === node.id 
                          ? 'bg-[var(--accent-coral)] border-[var(--text-primary)] text-[var(--text-inverse)]' 
                          : isPinHigh
                            ? 'bg-[#e8a55a] border-[var(--text-primary)] text-black font-bold shadow-lg scale-110'
                            : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--accent-coral)]'}"
                      title={$isSimulating ? `Physical Pin ${pinNum} (Click to toggle High/Low)` : `Physical Pin ${pinNum}`}
                    >
                      {pinNum}
                    </button>
                  {/each}
                </div>
              </div>
            </div>

          <!-- ACCESSORIES HARDWARE COMPONENT -->
          {:else if node.type === 'component'}
            {@const comp = BUILTIN_COMPONENTS.find(c => c.id === node.componentId)}
            <div class="flex flex-col h-full w-full p-2.5 justify-between">
              
              {#if node.componentId === 'led'}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg transition-all duration-300 { $isSimulating && $nodeSimStates[node.id]?.lit ? 'scale-125 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : '' }">
                    { $isSimulating && $nodeSimStates[node.id]?.lit ? '🔴' : '⚫' }
                  </span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                {#if $isSimulating && $nodeSimStates[node.id]?.lit}
                  <span class="text-[9px] text-[var(--accent-coral)] font-bold animate-pulse text-center">✨ Glowing Active (3.3V)</span>
                {:else}
                  <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
                {/if}

              {:else if node.componentId === 'button'}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg">{comp?.icon_svg || '🔘'}</span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                {#if $isSimulating}
                  <button 
                    onmousedown={() => updateNodeSimState(node.id, { pressed: true })}
                    onmouseup={() => updateNodeSimState(node.id, { pressed: false })}
                    onmouseleave={() => updateNodeSimState(node.id, { pressed: false })}
                    class="w-full py-1 bg-[var(--accent-coral)] hover:bg-[var(--accent-coral-hover)] text-[var(--text-inverse)] text-[10px] font-bold rounded cursor-pointer select-none transition-transform active:scale-95 text-center"
                  >
                    { $nodeSimStates[node.id]?.pressed ? '🔴 PRESSING...' : '🔘 CLICK & HOLD' }
                  </button>
                {:else}
                  <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
                {/if}

              {:else if node.componentId === 'buzzer'}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg transition-transform { $isSimulating && $nodeSimStates[node.id]?.active ? 'animate-bounce' : '' }">
                    { $isSimulating && $nodeSimStates[node.id]?.active ? '🔊' : '🔕' }
                  </span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                {#if $isSimulating && $nodeSimStates[node.id]?.active}
                  <span class="text-[9px] text-[var(--accent-amber)] font-bold animate-pulse text-center">🔊 BEEPING ACTIVE</span>
                {:else}
                  <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
                {/if}

              {:else if node.componentId === 'servo'}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg">⚙️</span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                {#if $isSimulating}
                  <div class="flex flex-col gap-1 w-full mt-1">
                    <div class="flex items-center justify-between text-[8px] font-mono text-[var(--text-secondary)]">
                      <span>Shaft Angle:</span>
                      <span class="font-bold text-[var(--accent-coral)]">{$nodeSimStates[node.id]?.angle || 90}°</span>
                    </div>
                    <div class="w-full bg-[var(--bg-elevated)] h-1.5 rounded-full overflow-hidden relative">
                      <div class="bg-[var(--accent-coral)] h-full transition-all duration-150" style="width: {(($nodeSimStates[node.id]?.angle || 90) / 180) * 100}%"></div>
                    </div>
                  </div>
                {:else}
                  <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
                {/if}

              {:else if node.componentId === 'oled' || node.componentId === 'lcd1602'}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg">{comp?.icon_svg || '📺'}</span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                {#if $isSimulating && $nodeSimStates[node.id]?.isOn}
                  <div class="w-full bg-black border border-[var(--accent-teal)] rounded p-1 font-mono text-[7px] text-[var(--accent-teal)] leading-tight h-10 select-none overflow-hidden flex flex-col justify-center">
                    {#each ($nodeSimStates[node.id]?.text || []) as textLine}
                      <div class="truncate">{textLine}</div>
                    {/each}
                  </div>
                {:else if $isSimulating}
                  <div class="w-full bg-neutral-900 border border-neutral-700 rounded p-1 font-mono text-[7px] text-neutral-500 italic leading-tight h-10 select-none flex items-center justify-center">
                    Unpowered Display
                  </div>
                {:else}
                  <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
                {/if}

              {:else if node.componentId === 'rotary'}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg">🔄</span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                {#if $isSimulating}
                  <div class="flex items-center gap-2 mt-1 w-full justify-between">
                    <button 
                      onclick={() => updateNodeSimState(node.id, { steps: ($nodeSimStates[node.id]?.steps || 0) - 1 })}
                      class="px-1 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[8px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      ◀ CW
                    </button>
                    <span class="text-[9px] font-mono font-bold text-[var(--accent-coral)]">{$nodeSimStates[node.id]?.steps || 0}</span>
                    <button 
                      onclick={() => updateNodeSimState(node.id, { steps: ($nodeSimStates[node.id]?.steps || 0) + 1 })}
                      class="px-1 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[8px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      CCW ▶
                    </button>
                  </div>
                {:else}
                  <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
                {/if}

              {:else if node.componentId === 'dht22' || node.componentId === 'ds18b20'}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg">🌡️</span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                {#if $isSimulating}
                  <div class="flex flex-col gap-1 mt-1 w-full">
                    <div class="flex items-center justify-between text-[8px] font-mono">
                      <span>Temp:</span>
                      <span class="font-bold text-[var(--accent-teal)]">{$nodeSimStates[node.id]?.temp || 24.5}°C</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="50" 
                      step="0.5"
                      value={$nodeSimStates[node.id]?.temp || 24.5} 
                      oninput={(e) => updateNodeSimState(node.id, { temp: parseFloat((e.target as HTMLInputElement).value) })}
                      class="w-full accent-[var(--accent-teal)] h-1 cursor-pointer bg-neutral-800 rounded"
                    />
                  </div>
                {:else}
                  <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
                {/if}

              {:else}
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-lg">{comp?.icon_svg || '🔌'}</span>
                  <span class="text-xs font-bold text-[var(--text-primary)] truncate">{node.label}</span>
                </div>
                <p class="text-[9px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{comp?.description || 'Custom Wiring Component'}</p>
              {/if}

              <div class="flex-1"></div>
              
              <!-- Component Pin nodes -->
              <div class="flex gap-1 justify-end border-t border-[var(--border-subtle)] pt-1.5 mt-1 select-none">
                {#each Array(comp?.pin_count || 2) as _, i}
                  {@const pinStr = (i + 1).toString()}
                  <button 
                    onclick={(e) => handlePinClick(e, node.id, pinStr)}
                    class="w-3.5 h-3.5 rounded text-[8px] font-bold border flex items-center justify-center font-mono select-none cursor-pointer transition-colors
                      {wireStartPinId === pinStr && wireStartNodeId === node.id 
                        ? 'bg-[var(--accent-coral)] border-[var(--text-primary)] text-[var(--text-inverse)]' 
                        : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--accent-teal)] hover:bg-[var(--accent-teal)] hover:text-black'}"
                    title={`Component Pin ${pinStr}`}
                  >
                    P{pinStr}
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
      onclick={toggleSimulation}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer
        {$isSimulating ? 'bg-[var(--accent-teal-dim)] text-[var(--accent-teal)] border border-[var(--accent-teal)] font-bold scale-110 shadow-lg' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}"
      title="Toggle Circuit Simulation (⚡)"
      aria-label="Toggle simulation"
    >
      ⚡
    </button>
    <button 
      onclick={() => isOrthogonal = !isOrthogonal}
      class="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer
        {isOrthogonal ? 'bg-[var(--accent-coral-dim)] text-[var(--accent-coral)] border border-[var(--accent-coral)] font-bold shadow-md scale-110' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}"
      title="Toggle Orthogonal Wire Routing (📐)"
      aria-label="Toggle orthogonal wire routing"
    >
      📐
    </button>
    <div class="h-[1px] bg-[var(--border-subtle)] mx-1"></div>
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

  <!-- AUTOMATED MACROS / FIRMWARE TEST LOOPS PANEL -->
  {#if $isSimulating}
    <div class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl px-4 py-2 z-[90] select-none animate-slide-down">
      <span class="text-xs font-serif font-bold text-[var(--accent-teal)]">⚡ Logic Simulation Active</span>
      <div class="h-4 w-[1px] bg-[var(--border-subtle)]"></div>
      
      {#if $activeMacroName === null}
        <button 
          onclick={() => startMacro('blink')}
          class="px-2.5 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--accent-teal)] hover:text-black border border-[var(--border-default)] text-[10px] font-bold rounded cursor-pointer transition-colors"
        >
          ▶ Run LED Blink script
        </button>
        <button 
          onclick={() => startMacro('sweep')}
          class="px-2.5 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--accent-teal)] hover:text-black border border-[var(--border-default)] text-[10px] font-bold rounded cursor-pointer transition-colors"
        >
          ▶ Run Servo Sweep script
        </button>
      {:else}
        <span class="text-[10px] font-mono text-[var(--text-secondary)] animate-pulse">Running script: {$activeMacroName}...</span>
        <button 
          onclick={stopMacro}
          class="px-2.5 py-1 bg-[var(--color-error)] text-[var(--text-inverse)] hover:bg-[var(--color-error)]/80 text-[10px] font-bold rounded cursor-pointer transition-colors"
        >
          ⏹ Stop Script
        </button>
      {/if}
    </div>
  {/if}

  <!-- REAL-TIME HARDWARE DIAGNOSTICS & CONFLICTS OVERLAY -->
  <div class="absolute right-4 top-4 flex flex-col items-end gap-2 z-[90] select-none">
    <!-- Float Badge -->
    <button 
      onclick={() => showDiagnostics = !showDiagnostics}
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-xl border text-xs font-semibold cursor-pointer transition-all hover:scale-102 bg-[var(--bg-surface)]
        {diagnostics.length > 0 
          ? 'border-[var(--accent-amber)] text-[var(--accent-amber)] animate-pulse' 
          : 'border-[var(--accent-teal)] text-[var(--accent-teal)]'}"
      aria-label="Diagnostics details"
    >
      {#if diagnostics.length > 0}
        ⚠️ {diagnostics.length} Issue{diagnostics.length > 1 ? 's' : ''} Detected
      {:else}
        🛡️ Diagnostics: Clear
      {/if}
    </button>

    <!-- Collapsible Diagnostics Dropdown list -->
    {#if showDiagnostics}
      <div class="w-72 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-4 flex flex-col gap-2.5 animate-slide-in">
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Board Diagnostics Ledger</span>
          <button onclick={() => showDiagnostics = false} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[10px] font-bold">✕</button>
        </div>
        <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          {#if diagnostics.length === 0}
            <div class="text-[10px] text-[var(--text-muted)] italic py-2 text-center">
              All visual wire connections are physically safe. Zero GPIO pin conflicts or power mismatches detected.
            </div>
          {:else}
            {#each diagnostics as issue}
              <div 
                class="flex gap-2 p-2 rounded text-[10px] leading-relaxed border
                  {issue.type === 'error' 
                    ? 'bg-[var(--color-error)]/5 border-[var(--color-error)]/25 text-[var(--color-error)]' 
                    : 'bg-[var(--accent-amber)]/5 border-[var(--accent-amber)]/25 text-[var(--accent-amber)]'}"
              >
                <span class="shrink-0">{issue.type === 'error' ? '❌' : '⚠️'}</span>
                <span>{issue.message}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- FLOATING WIRE STYLE CUSTOMIZER -->
  {#if $selectedEdgeId}
    {@const selectedEdge = $activeCanvasState.edges.find(e => e.id === $selectedEdgeId)}
    {#if selectedEdge}
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl px-4 py-2 z-[90] select-none animate-slide-up">
        <span class="text-xs font-serif font-bold text-[var(--accent-coral)]">🔌 Wire Net Properties</span>
        <div class="h-4 w-[1px] bg-[var(--border-subtle)]"></div>
        
        <!-- Label input -->
        <div class="flex items-center gap-1.5">
          <label class="text-[9px] font-bold text-[var(--text-secondary)] uppercase" for="wire-label">Net Name:</label>
          <input 
            type="text" 
            id="wire-label"
            value={selectedEdge.label || ''} 
            oninput={(e) => updateWireProperty(selectedEdge.id, { label: (e.target as HTMLInputElement).value })}
            placeholder="e.g. SPI_MOSI..."
            class="w-24 bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-coral)]"
          />
        </div>
        
        <div class="h-4 w-[1px] bg-[var(--border-subtle)]"></div>
        
        <!-- Color Picker presets -->
        <div class="flex items-center gap-1">
          {#each [
            { name: 'Red', hex: '#ef4444', title: '5V Power' },
            { name: 'Orange', hex: '#f97316', title: '3.3V Power' },
            { name: 'Teal', hex: '#5db8a6', title: 'GPIO/Signal' },
            { name: 'Violet', hex: '#9d7adc', title: 'Data/Bus' },
            { name: 'Grey', hex: '#6c6a64', title: 'GND Ground' }
          ] as colorPreset}
            <button 
              onclick={() => updateWireProperty(selectedEdge.id, { color: colorPreset.hex })}
              class="w-4 h-4 rounded-full border border-black/25 cursor-pointer hover:scale-110 transition-transform"
              style="background-color: {colorPreset.hex}"
              title={colorPreset.title}
              aria-label={colorPreset.title}
            ></button>
          {/each}
        </div>
        
        <div class="h-4 w-[1px] bg-[var(--border-subtle)]"></div>
        
        <!-- Line Style switcher -->
        <button 
          onclick={() => updateWireProperty(selectedEdge.id, { style: selectedEdge.style === 'dashed' ? 'solid' : 'dashed' })}
          class="px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[9px] font-bold hover:bg-[var(--bg-hover)] cursor-pointer text-[var(--text-primary)]"
        >
          Style: {selectedEdge.style === 'dashed' ? 'Dashed ╌' : 'Solid ──'}
        </button>
        
        <div class="h-4 w-[1px] bg-[var(--border-subtle)]"></div>
        
        <!-- Delete wire button -->
        <button 
          onclick={handleDeleteSelected}
          class="px-2 py-0.5 bg-[var(--color-error)] text-[var(--text-inverse)] rounded text-[9px] font-bold hover:bg-[var(--color-error)]/80 cursor-pointer"
        >
          ✕ Delete Wire
        </button>
      </div>
    {/if}
  {/if}
</div>
