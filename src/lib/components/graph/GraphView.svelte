<script lang="ts">
  import { onMount } from 'svelte';
  import cytoscape from 'cytoscape';
  import { tasksList, activeCanvasState } from '../../stores/project.store';
  import { addToast } from '../../stores/ui.store';
  import { BOARDS } from '../../rpi-boards';
  import { BUILTIN_COMPONENTS } from '../../components-library';

  let containerEl = $state<HTMLDivElement | null>(null);
  let cy = $state<any>(null);
  let layoutName = $state<'cose' | 'grid' | 'concentric' | 'breadthfirst'>('cose');

  // Convert tasks and canvas components to Cytoscape elements
  function getGraphElements() {
    const elements: any[] = [];
    const tasks = $tasksList;
    const canvas = $activeCanvasState;

    // 1. Add RPi board nodes
    const boardNodes = canvas?.nodes.filter(n => n.type === 'rpi_board') || [];
    boardNodes.forEach(b => {
      const modelInfo = BOARDS.find(m => m.id === b.boardModel);
      elements.push({
        data: {
          id: b.id,
          label: modelInfo ? modelInfo.name : 'RPi Board',
          type: 'rpi_board',
          color: '#7ab648' // Raspberry Green
        }
      });
    });

    // 2. Add Component nodes
    const compNodes = canvas?.nodes.filter(n => n.type === 'component') || [];
    compNodes.forEach(c => {
      const builtin = BUILTIN_COMPONENTS.find(m => m.id === c.componentId);
      elements.push({
        data: {
          id: c.id,
          label: c.label || (builtin ? builtin.name : 'Component'),
          type: 'component',
          color: '#5db8a6' // Teal
        }
      });
    });

    // 3. Add Sprint Task nodes
    tasks.forEach(t => {
      elements.push({
        data: {
          id: t.id,
          label: t.title,
          type: 'task',
          color: t.priority === 'p0' ? '#c64545' : t.priority === 'p1' ? '#e8a55a' : '#cc785c' // Red, Amber, Coral
        }
      });
    });

    // 4. Add Connection edges from canvas wires
    const wires = canvas?.edges || [];
    wires.forEach(w => {
      elements.push({
        data: {
          id: w.id,
          source: w.sourceId,
          target: w.targetId,
          label: w.label || w.type,
          type: 'wire',
          color: w.color || '#5db8a6'
        }
      });
    });

    // 5. Add actual dependency edges from labels
    tasks.forEach(t => {
      const prereqIds = t.labels
        .filter(l => l.startsWith('dep:'))
        .map(l => l.substring(4));

      prereqIds.forEach(pId => {
        elements.push({
          data: {
            id: `dep_${t.id}_${pId}`,
            source: pId,
            target: t.id,
            label: 'depends_on',
            type: 'dependency',
            color: '#cc785c' // Coral color for active task dependency
          }
        });
      });
    });

    return elements;
  }

  function initGraph() {
    if (!containerEl) return;

    const elements = getGraphElements();

    cy = cytoscape({
      container: containerEl,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': '#faf9f5',
            'font-family': 'DM Sans, Inter, sans-serif',
            'font-size': '11px',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'width': '65px',
            'height': '65px',
            'border-width': '2px',
            'border-color': 'rgba(255,255,255,0.12)',
            'shape': 'ellipse',
            'overlay-opacity': 0,
            'transition-property': 'background-color, border-color, border-width',
            'transition-duration': 0.15
          } as any
        },
        {
          selector: 'node[type="rpi_board"]',
          style: {
            'shape': 'round-rectangle',
            'width': '85px',
            'height': '55px',
            'border-color': '#7ab648'
          } as any
        },
        {
          selector: 'node[type="component"]',
          style: {
            'shape': 'hexagon',
            'border-color': '#5db8a6'
          } as any
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '8px',
            'color': '#a09d96',
            'text-background-opacity': 0.8,
            'text-background-color': '#111110',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'overlay-opacity': 0
          } as any
        },
        {
          selector: 'edge[type="dependency"]',
          style: {
            'line-style': 'dashed',
            'target-arrow-shape': 'chevron'
          } as any
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#faf9f5',
            'border-width': '4px'
          } as any
        }
      ],
      layout: {
        name: layoutName,
        animate: true,
        animationDuration: 400
      } as any
    });

    // Tap node listener
    cy.on('tap', 'node', (evt: any) => {
      const node = evt.target;
      addToast(`Selected node: ${node.data('label')}`, 'info', 1500);
    });
  }

  // Redraw when views/layout changes
  function applyLayout() {
    if (!cy) return;
    const layout = cy.layout({
      name: layoutName,
      animate: true,
      animationDuration: 300,
      fit: true,
      padding: 30
    });
    layout.run();
  }

  $effect(() => {
    if (layoutName) applyLayout();
  });

  onMount(() => {
    initGraph();
    return () => {
      if (cy) cy.destroy();
    };
  });
</script>

<div class="flex flex-col h-full w-full bg-[var(--canvas-bg)]">
  <!-- Controls toolbar -->
  <div class="flex items-center justify-between p-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
    <div class="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
      <span>Auto Layout:</span>
      <select 
        bind:value={layoutName} 
        class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2.5 py-1 text-[var(--text-primary)] outline-none cursor-pointer"
      >
        <option value="cose">Force Directed (Cose)</option>
        <option value="grid">Grid alignment</option>
        <option value="concentric">Concentric Rings</option>
        <option value="breadthfirst">Breadthfirst Tree</option>
      </select>
    </div>

    <div class="flex gap-2">
      <button 
        onclick={() => cy?.fit(30)}
        class="px-3 py-1 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-medium transition-colors cursor-pointer"
      >
        Fit Screen
      </button>
      <button 
        onclick={initGraph}
        class="px-3 py-1 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-medium transition-colors cursor-pointer"
      >
        Refresh Graph
      </button>
    </div>
  </div>

  <!-- Cytoscape Container -->
  <div bind:this={containerEl} class="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing"></div>
</div>

<style>
  /* Ensure cytoscape overlays fits perfectly */
  :global(.cytoscape-container) {
    outline: none;
  }
</style>
