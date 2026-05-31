<script lang="ts">
  import { get } from 'svelte/store';
  import { activeProject, tasksList, columnsList, projectNotes, activeCanvasState, selectProject, initProjects } from '../../stores/project.store';
  import { addToast } from '../../stores/ui.store';
  import { BUILTIN_COMPONENTS } from '../../components-library';
  import jsPDF from 'jspdf';

  let { isOpen, onClose } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  let importFileInput: HTMLInputElement | null = $state(null);

  // Generate a human-readable BOM array from active canvas components
  function generateBOM() {
    const canvas = get(activeCanvasState);
    if (!canvas) return [];

    const compNodes = canvas.nodes.filter(n => n.type === 'component');
    const counts: Record<string, { name: string; category: string; qty: number }> = {};

    compNodes.forEach(node => {
      const cid = node.componentId || 'custom';
      const label = node.label || 'Unknown Component';
      const builtin = BUILTIN_COMPONENTS.find(c => c.id === cid);
      
      const key = cid === 'custom' ? `custom_${label}` : cid;
      
      if (!counts[key]) {
        counts[key] = {
          name: builtin ? builtin.name : label,
          category: builtin ? builtin.category : 'custom',
          qty: 0
        };
      }
      counts[key].qty++;
    });

    return Object.values(counts);
  }

  // EXPORTS
  function exportAsJson() {
    const proj = get(activeProject);
    if (!proj) return;

    const data = {
      piforge_version: '1.0.0',
      exported_at: Date.now(),
      project: proj,
      tasks: get(tasksList),
      columns: get(columnsList),
      notes: get(projectNotes),
      canvas_state: get(activeCanvasState),
      graph_state: { version: '1.0', layout: 'cose-bilkent', nodes: [], edges: [] }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.toLowerCase().replace(/\s+/g, '_')}.piforge`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Project file exported successfully', 'success');
  }

  function exportBOMAsCsv() {
    const proj = get(activeProject);
    if (!proj) return;

    const bom = generateBOM();
    if (bom.length === 0) {
      addToast('No components on canvas to export', 'warning');
      return;
    }

    let csvContent = 'Component Name,Category,Quantity\n';
    bom.forEach(row => {
      csvContent += `"${row.name}","${row.category}",${row.qty}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.toLowerCase().replace(/\s+/g, '_')}_BOM.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Bill of Materials exported as CSV', 'success');
  }

  function exportBOMAsPdf() {
    const proj = get(activeProject);
    if (!proj) return;

    const bom = generateBOM();
    if (bom.length === 0) {
      addToast('No components on canvas to export', 'warning');
      return;
    }

    try {
      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(204, 120, 92); // Coral color
      doc.text('PiForge Bill of Materials', 15, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Project: ${proj.name}`, 15, 28);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 15, 34);

      // Draw table headers
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(240, 240, 240);
      doc.rect(15, 42, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 20, 20);
      doc.text('Component Name', 18, 47);
      doc.text('Category', 110, 47);
      doc.text('Quantity', 170, 47);

      doc.setFont('helvetica', 'normal');
      let y = 56;
      bom.forEach(row => {
        doc.line(15, y - 6, 195, y - 6);
        doc.text(row.name, 18, y);
        doc.text(row.category, 110, y);
        doc.text(row.qty.toString(), 170, y);
        y += 10;
      });

      doc.save(`${proj.name.toLowerCase().replace(/\s+/g, '_')}_BOM.pdf`);
      addToast('Bill of Materials exported as PDF', 'success');
    } catch (e) {
      console.error(e);
      addToast('Failed to generate PDF', 'error');
    }
  }

  function exportCanvasAsImage(format: 'png' | 'svg') {
    // Stage elements inside CanvasView can be captured
    // Since Konva provides a stage object, let's grab it or output the canvas
    const stageContainer = document.querySelector('.konvajs-content');
    if (!stageContainer) {
      addToast('Active canvas element not found to screenshot', 'warning');
      return;
    }

    try {
      const canvEl = stageContainer.querySelector('canvas') as HTMLCanvasElement;
      if (!canvEl) throw new Error('Canvas not found');

      const url = canvEl.toDataURL(`image/${format === 'svg' ? 'svg+xml' : 'png'}`);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas_export.${format}`;
      a.click();
      addToast(`Canvas exported as ${format.toUpperCase()}`, 'success');
    } catch (e) {
      console.error(e);
      addToast('Canvas viewport capture failed', 'error');
    }
  }

  // IMPORT
  function triggerFileInput() {
    if (importFileInput) importFileInput.click();
  }

  async function handleFileImport(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (data.piforge_version !== '1.0.0' || !data.project) {
          throw new Error('Invalid PiForge project schema format');
        }

        // Hydrate Mock Database
        // Retrieve projects and append
        if (typeof localStorage !== 'undefined') {
          const importedProj: activeProject = data.project;
          
          // Deduplicate if already exists
          let projects = JSON.parse(localStorage.getItem('piforge_projects') || '[]');
          projects = projects.filter((p: any) => p.id !== importedProj.id);
          projects.push(importedProj);
          localStorage.setItem('piforge_projects', JSON.stringify(projects));

          // Tasks
          let tasks = JSON.parse(localStorage.getItem('piforge_tasks') || '[]');
          tasks = tasks.filter((t: any) => t.project_id !== importedProj.id);
          tasks = [...tasks, ...data.tasks];
          localStorage.setItem('piforge_tasks', JSON.stringify(tasks));

          // Columns
          let columns = JSON.parse(localStorage.getItem('piforge_columns') || '[]');
          columns = columns.filter((c: any) => c.project_id !== importedProj.id);
          columns = [...columns, ...data.columns];
          localStorage.setItem('piforge_columns', JSON.stringify(columns));

          // Notes
          let notes = JSON.parse(localStorage.getItem('piforge_notes') || '{}');
          notes[importedProj.id] = data.notes;
          localStorage.setItem('piforge_notes', JSON.stringify(notes));

          // Canvas State
          let canvasStates = JSON.parse(localStorage.getItem('piforge_canvas_states') || '{}');
          canvasStates[importedProj.id] = data.canvas_state;
          localStorage.setItem('piforge_canvas_states', JSON.stringify(canvasStates));
        }

        addToast('Project imported successfully!', 'success');
        onClose();
        
        // Re-load
        await initProjects();
        await selectProject(data.project.id);
      } catch (err: any) {
        console.error(err);
        addToast(`Import failed: ${err.message || 'Malformed file'}`, 'error');
      }
    };
    reader.readAsText(file);
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 flex items-center justify-center z-[100] bg-black/70 backdrop-blur-sm select-none" role="dialog" aria-modal="true">
    <div class="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl p-6 overflow-hidden">
      <!-- Title -->
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-5">
        <h3 class="text-base font-semibold text-[var(--text-primary)]">Export & Share Project</h3>
        <button onclick={onClose} class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">✕</button>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <!-- Left: Export Options -->
        <div class="flex flex-col gap-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Export Formats</span>
          
          <button 
            onclick={exportAsJson}
            class="flex items-center gap-3 w-full p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] rounded-lg text-left transition-colors cursor-pointer group"
          >
            <span class="text-xl">📦</span>
            <div>
              <div class="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-coral)]">PiForge Archive (.piforge)</div>
              <div class="text-[10px] text-[var(--text-secondary)]">Full human-readable project json backup</div>
            </div>
          </button>

          <button 
            onclick={() => exportCanvasAsImage('png')}
            class="flex items-center gap-3 w-full p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] rounded-lg text-left transition-colors cursor-pointer group"
          >
            <span class="text-xl">🖼️</span>
            <div>
              <div class="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-coral)]">Viewport Capture (PNG)</div>
              <div class="text-[10px] text-[var(--text-secondary)]">Screenshot of the current canvas board</div>
            </div>
          </button>

          <button 
            onclick={exportBOMAsPdf}
            class="flex items-center gap-3 w-full p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] rounded-lg text-left transition-colors cursor-pointer group"
          >
            <span class="text-xl">📄</span>
            <div>
              <div class="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-coral)]">Bill of Materials (PDF)</div>
              <div class="text-[10px] text-[var(--text-secondary)]">Clean table list of all wiring accessories</div>
            </div>
          </button>

          <button 
            onclick={exportBOMAsCsv}
            class="flex items-center gap-3 w-full p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--accent-coral)] rounded-lg text-left transition-colors cursor-pointer group"
          >
            <span class="text-xl">📊</span>
            <div>
              <div class="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-coral)]">BOM Spreadsheet (CSV)</div>
              <div class="text-[10px] text-[var(--text-secondary)]">Import lists into Excel or shopping carts</div>
            </div>
          </button>
        </div>

        <!-- Right: Import Options -->
        <div class="flex flex-col border-l border-[var(--border-subtle)] pl-6">
          <span class="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">Import / Restore Project</span>
          
          <div 
            onclick={triggerFileInput}
            onkeydown={(e) => e.key === 'Enter' && triggerFileInput()}
            class="flex flex-col items-center justify-center border-2 border-dashed border-[var(--border-default)] hover:border-[var(--accent-coral)] rounded-xl p-8 text-center transition-all cursor-pointer flex-1 bg-[var(--bg-elevated)]/50 select-none group"
            role="button"
            tabindex="0"
          >
            <span class="text-3xl mb-2 group-hover:scale-110 transition-transform">📥</span>
            <div class="text-xs font-semibold text-[var(--text-primary)] mb-1">Click to Upload</div>
            <div class="text-[10px] text-[var(--text-secondary)]">Select a valid .piforge file from your computer</div>

            <input 
              type="file"
              accept=".piforge,.json"
              bind:this={importFileInput}
              onchange={handleFileImport}
              class="hidden"
            />
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-end border-t border-[var(--border-subtle)] pt-4 mt-6">
        <button 
          onclick={onClose} 
          class="px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold rounded-md transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
