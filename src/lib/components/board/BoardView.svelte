<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions a11y_click_events_have_key_events a11y-click-events-have-key-events a11y_autofocus a11y-autofocus -->
<script lang="ts">
  import { tasksList, columnsList, addTask, updateTaskItem, deleteTaskItem } from '../../stores/project.store';
  import { addToast } from '../../stores/ui.store';
  import type { Task, Column, ChecklistItem } from '../../types';
  import * as ipc from '../../ipc';
  import ConfirmModal from '../shared/ConfirmModal.svelte';

  let activeTaskId = $state<string | null>(null);
  let activeTask = $derived($tasksList.find(t => t.id === activeTaskId) || null);
  let isDeleteModalOpen = $state(false);

  // Timeline view state
  let isGanttView = $state(false);

  // Generate 14-day timeline headers
  let timelineDays = $derived.by(() => {
    const list: Date[] = [];
    const start = new Date();
    start.setDate(start.getDate() - 3); // Start 3 days ago for baseline context
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push(d);
    }
    return list;
  });

  // Calculate task positions in the timeline grid
  interface GanttTaskPosition {
    task: Task;
    left: number;
    width: number;
    color: string;
  }

  let ganttTasks = $derived.by<GanttTaskPosition[]>(() => {
    const tasks = $tasksList;
    if (tasks.length === 0) return [];

    const days = timelineDays;
    const gridStart = new Date(days[0]);
    gridStart.setHours(0,0,0,0);
    const gridStartTime = gridStart.getTime();

    const gridEnd = new Date(days[days.length - 1]);
    gridEnd.setHours(23,59,59,999);
    const gridEndTime = gridEnd.getTime();
    
    const gridDuration = gridEndTime - gridStartTime;

    return tasks.map(t => {
      const start = t.created_at;
      const end = t.due_date || (t.created_at + (t.time_estimate || 1440) * 60 * 1000);
      
      const clampedStart = Math.max(gridStartTime, start);
      const clampedEnd = Math.min(gridEndTime, end);
      
      let left = ((clampedStart - gridStartTime) / gridDuration) * 100;
      let width = ((clampedEnd - clampedStart) / gridDuration) * 100;
      
      if (end < gridStartTime || start > gridEndTime) {
        left = -100;
        width = 0;
      }
      
      if (width > 0 && width < 5) width = 5;

      const colors = {
        p0: 'bg-[var(--color-error)] border-red-700 text-white',
        p1: 'bg-[var(--accent-amber)] border-amber-700 text-black',
        p2: 'bg-[var(--accent-teal)] border-teal-700 text-black',
        p3: 'bg-[var(--text-muted)] border-neutral-700 text-white'
      };

      return {
        task: t,
        left,
        width,
        color: colors[t.priority] || colors.p2
      };
    }).filter(g => g.width > 0);
  });

  // Dynamic measurement of Gantt track width for pixel-precise SVG pathing
  let trackWidth = $state(0);

  // Cycle detection helper for prerequisite selection
  function wouldCreateCycle(taskId: string, potentialPrereqId: string): boolean {
    const visited = new Set<string>();
    const queue = [potentialPrereqId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === taskId) return true; // Cycle detected!
      
      visited.add(curr);
      const currTask = $tasksList.find(t => t.id === curr);
      if (currTask && currTask.labels) {
        const prereqs = currTask.labels
          .filter(l => l.startsWith('dep:'))
          .map(l => l.substring(4));
        
        prereqs.forEach(pId => {
          if (!visited.has(pId)) {
            queue.push(pId);
          }
        });
      }
    }
    return false;
  }

  // Topological sorting & Critical Path DP calculator
  let criticalPath = $derived.by(() => {
    const tasks = $tasksList;
    const adj: Record<string, string[]> = {}; 
    const inDegree: Record<string, number> = {};
    const duration: Record<string, number> = {};
    const dp: Record<string, number> = {};
    const nextNode: Record<string, string | null> = {};

    tasks.forEach(t => {
      adj[t.id] = [];
      inDegree[t.id] = 0;
      duration[t.id] = (t.time_estimate || 1440) * 60 * 1000; 
      dp[t.id] = 0;
      nextNode[t.id] = null;
    });

    // Parse dependencies
    tasks.forEach(t => {
      if (!t.labels) return;
      const prereqIds = t.labels
        .filter(l => l.startsWith('dep:'))
        .map(l => l.substring(4));

      prereqIds.forEach(pId => {
        if (adj[pId]) {
          adj[pId].push(t.id);
          inDegree[t.id]++;
        }
      });
    });

    // Kahn's algorithm
    const queue: string[] = [];
    tasks.forEach(t => {
      if (inDegree[t.id] === 0) {
        queue.push(t.id);
      }
    });

    const topoOrder: string[] = [];
    const tempInDegree = { ...inDegree };
    
    while (queue.length > 0) {
      const u = queue.shift()!;
      topoOrder.push(u);
      if (adj[u]) {
        adj[u].forEach(v => {
          tempInDegree[v]--;
          if (tempInDegree[v] === 0) {
            queue.push(v);
          }
        });
      }
    }

    const revTopo = [...topoOrder].reverse();
    let maxPathLength = 0;
    let criticalStartNode: string | null = null;

    revTopo.forEach(u => {
      let maxSub = 0;
      let bestNext: string | null = null;
      if (adj[u]) {
        adj[u].forEach(v => {
          if (dp[v] > maxSub) {
            maxSub = dp[v];
            bestNext = v;
          }
        });
      }
      dp[u] = duration[u] + maxSub;
      nextNode[u] = bestNext;

      if (dp[u] > maxPathLength) {
        maxPathLength = dp[u];
        criticalStartNode = u;
      }
    });

    const criticalNodes = new Set<string>();
    const criticalEdges = new Set<string>();

    let curr: string | null = criticalStartNode;
    while (curr) {
      criticalNodes.add(curr);
      const next: string | null = nextNode[curr];
      if (next) {
        criticalEdges.add(`${curr}->${next}`);
      }
      curr = next;
    }

    return {
      nodes: criticalNodes,
      edges: criticalEdges
    };
  });

  // Derived Bezier curves for all dependency connections
  interface GanttEdgePath {
    id: string;
    path: string;
    isCritical: boolean;
    isConflict: boolean;
  }

  let ganttEdges = $derived.by<GanttEdgePath[]>(() => {
    if (ganttTasks.length === 0 || trackWidth === 0) return [];

    const edges: GanttEdgePath[] = [];
    const tasks = $tasksList;

    const taskMap = new Map<string, { index: number; left: number; width: number; task: Task }>();
    ganttTasks.forEach((gt, index) => {
      taskMap.set(gt.task.id, { index, left: gt.left, width: gt.width, task: gt.task });
    });

    tasks.forEach(t => {
      const gtSelf = taskMap.get(t.id);
      if (!gtSelf) return;

      if (!t.labels) return;
      const prereqIds = t.labels
        .filter(l => l.startsWith('dep:'))
        .map(l => l.substring(4));

      prereqIds.forEach(pId => {
        const gtPrereq = taskMap.get(pId);
        if (!gtPrereq) return;

        const yPrereq = gtPrereq.index * 48 + 24;
        const xPrereqEnd = (gtPrereq.left + gtPrereq.width) / 100 * trackWidth;

        const ySelf = gtSelf.index * 48 + 24;
        const xSelfStart = gtSelf.left / 100 * trackWidth;

        const isCritical = criticalPath.edges.has(`${pId}->${t.id}`);

        const prereqEndTimestamp = gtPrereq.task.due_date || (gtPrereq.task.created_at + (gtPrereq.task.time_estimate || 1440) * 60 * 1000);
        const selfStartTimestamp = gtSelf.task.created_at;
        const isConflict = prereqEndTimestamp > selfStartTimestamp;

        const dx = Math.max(30, Math.abs(xSelfStart - xPrereqEnd) / 2);
        
        let path = '';
        if (xSelfStart >= xPrereqEnd) {
          path = `M ${xPrereqEnd} ${yPrereq} C ${xPrereqEnd + dx} ${yPrereq}, ${xSelfStart - dx} ${ySelf}, ${xSelfStart} ${ySelf}`;
        } else {
          const loopOffset = 40;
          path = `M ${xPrereqEnd} ${yPrereq} C ${xPrereqEnd + loopOffset} ${yPrereq}, ${xSelfStart - loopOffset} ${ySelf}, ${xSelfStart} ${ySelf}`;
        }

        edges.push({
          id: `${pId}->${t.id}`,
          path,
          isCritical,
          isConflict
        });
      });
    });

    return edges;
  });

  let newColumnName = $state('');
  let isAddingCol = $state(false);

  // New task titles per column input
  let columnTaskInputs = $state<Record<string, string>>({});

  // Checklist for active task
  let activeChecklist = $state<ChecklistItem[]>([]);

  // Drag and drop state
  let draggingTaskId = $state<string | null>(null);

  // Load checklist items when task is selected
  $effect(() => {
    if (activeTaskId) {
      ipc.getChecklistItems(activeTaskId).then(items => {
        activeChecklist = items.sort((a, b) => a.position - b.position);
      });
    } else {
      activeChecklist = [];
    }
  });

  // DRAG & DROP HANDLERS
  function handleDragStart(e: DragEvent, taskId: string) {
    draggingTaskId = taskId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', taskId);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(e: DragEvent, columnId: string) {
    e.preventDefault();
    const taskId = e.dataTransfer?.getData('text/plain') || draggingTaskId;
    if (!taskId) return;

    const task = $tasksList.find(t => t.id === taskId);
    if (task && task.column_id !== columnId) {
      task.column_id = columnId;
      await updateTaskItem(task);
      addToast('Task moved', 'success', 1000);
    }
    draggingTaskId = null;
  }

  // ADD COLUMN
  async function handleAddColumn() {
    if (!newColumnName.trim()) return;
    const project = $tasksList[0]?.project_id || '';
    const newCol: Column = {
      id: crypto.randomUUID(),
      project_id: project,
      name: newColumnName,
      color: '#6c6a64',
      position: $columnsList.length + 1,
      is_done: false
    };

    await ipc.saveColumn(newCol);
    columnsList.update(list => [...list, newCol]);
    newColumnName = '';
    isAddingCol = false;
    addToast('Column added', 'success');
  }

  // TASK WORKFLOWS
  async function handleAddTask(columnId: string) {
    const title = columnTaskInputs[columnId] || '';
    if (!title.trim()) return;

    await addTask(title, columnId);
    columnTaskInputs = { ...columnTaskInputs, [columnId]: '' };
  }

  // Priority helpers
  const priorityDots = { p0: '🔴', p1: '🟡', p2: '🟢', p3: '⚪' };
  const priorityColors = {
    p0: 'border-l-4 border-l-[var(--color-error)]',
    p1: 'border-l-4 border-l-[var(--accent-amber)]',
    p2: 'border-l-4 border-l-[var(--accent-teal)]',
    p3: 'border-l-4 border-l-[var(--text-muted)]'
  };

  // CHECKLIST FLOWS
  let newCheckItemText = $state('');
  async function addChecklistItem() {
    if (!activeTaskId || !newCheckItemText.trim()) return;
    const item: ChecklistItem = {
      id: crypto.randomUUID(),
      task_id: activeTaskId,
      text: newCheckItemText,
      done: false,
      position: activeChecklist.length + 1
    };

    await ipc.saveChecklistItem(item);
    activeChecklist = [...activeChecklist, item];
    newCheckItemText = '';
  }

  async function toggleCheckItem(item: ChecklistItem) {
    item.done = !item.done;
    await ipc.saveChecklistItem(item);
    activeChecklist = [...activeChecklist];
  }

  async function deleteCheckItem(id: string) {
    await ipc.deleteChecklistItem(id);
    activeChecklist = activeChecklist.filter(i => i.id !== id);
  }
</script>

<div class="flex flex-col h-full w-full bg-[var(--bg-base)] select-none overflow-hidden relative">
  <!-- Layout selector topbar toolbar -->
  <div class="flex items-center justify-between p-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
    <div class="flex items-center gap-2 text-xs text-[var(--text-secondary)] font-serif font-bold uppercase tracking-wider">
      📋 Board Workspace Planner
    </div>
    
    <div class="flex bg-[var(--bg-card)] border border-[var(--border-default)] rounded p-0.5 font-medium shrink-0">
      <button 
        onclick={() => isGanttView = false}
        class="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors
          {!isGanttView ? 'bg-[var(--accent-coral)] text-[var(--text-inverse)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
      >
        Kanban Grid
      </button>
      <button 
        onclick={() => isGanttView = true}
        class="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors
          {isGanttView ? 'bg-[var(--accent-coral)] text-[var(--text-inverse)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
      >
        Timeline Gantt
      </button>
    </div>
  </div>

  {#if !isGanttView}
    <!-- Kanban Board View rows -->
    <div class="flex-1 overflow-x-auto min-h-0 relative">
      <div class="flex gap-4 p-4 items-start h-full min-w-max select-none">
    {#each $columnsList as col}
      <div 
        ondragover={handleDragOver}
        ondrop={(e) => handleDrop(e, col.id)}
        class="flex flex-col w-[260px] max-h-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-3 select-none"
      >
        <!-- Column Title -->
        <div class="flex items-center justify-between pb-2 mb-3 border-b border-[var(--border-subtle)] shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-[var(--text-primary)]">{col.name}</span>
            <span class="px-1.5 py-0.5 bg-[var(--bg-card)] rounded-full text-[10px] font-bold text-[var(--text-secondary)] font-mono">
              {$tasksList.filter(t => t.column_id === col.id).length}
            </span>
          </div>
        </div>

        <!-- Task Card Stack -->
        <div class="flex-1 flex flex-col gap-2 overflow-y-auto min-h-[150px] pr-0.5">
          {#each $tasksList.filter(t => t.column_id === col.id) as task}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div 
              draggable="true"
              ondragstart={(e) => handleDragStart(e, task.id)}
              onclick={() => activeTaskId = task.id}
              class="flex flex-col bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md p-3 hover:border-[var(--border-strong)] transition-all cursor-grab active:cursor-grabbing hover:-translate-y-0.5 select-none relative overflow-hidden group {priorityColors[task.priority]}"
            >
              <div class="flex items-start justify-between gap-1 mb-1">
                <span class="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-coral)] transition-colors leading-tight line-clamp-2">
                  {task.title}
                </span>
                <span class="text-xs select-none shrink-0" title={`Priority: ${task.priority.toUpperCase()}`}>
                  {priorityDots[task.priority]}
                </span>
              </div>

              <!-- Labels row -->
              {#if task.labels && task.labels.filter(l => !l.startsWith('dep:')).length > 0}
                <div class="flex flex-wrap gap-1 mt-1.5 mb-2 select-none">
                  {#each task.labels.filter(l => !l.startsWith('dep:')) as label}
                    <span class="px-1.5 py-0.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[9px] rounded text-[var(--text-secondary)] font-mono">
                      {label}
                    </span>
                  {/each}
                </div>
              {/if}

              <!-- Task Card footer -->
              <div class="flex items-center justify-between text-[10px] text-[var(--text-secondary)] mt-2 border-t border-[var(--border-subtle)] pt-2 select-none">
                {#if task.due_date}
                  <span class="flex items-center gap-1 font-mono">
                    📅 {new Date(task.due_date).toLocaleDateString()}
                  </span>
                {:else}
                  <span></span>
                {/if}

                {#if task.time_estimate}
                  <span class="font-mono">⏱️ {task.time_estimate}m</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- Add Task Input Box inside Column -->
        <div class="mt-3 border-t border-[var(--border-subtle)] pt-2.5 shrink-0 flex items-center gap-1">
          <input 
            type="text"
            placeholder="+ Add task..."
            bind:value={columnTaskInputs[col.id]}
            onkeydown={(e) => e.key === 'Enter' && handleAddTask(col.id)}
            class="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2.5 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-coral)] outline-none"
          />
        </div>
      </div>
    {/each}

    <!-- Add column button card -->
    {#if isAddingCol}
      <div class="flex flex-col w-[260px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg p-3 shrink-0">
        <!-- svelte-ignore a11y_autofocus -->
        <input 
          type="text" 
          bind:value={newColumnName}
          placeholder="Column Name..."
          class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none mb-3"
          autofocus
        />
        <div class="flex gap-2">
          <button 
            onclick={handleAddColumn}
            class="flex-1 py-1.5 bg-[var(--accent-coral)] text-[var(--text-inverse)] hover:bg-[var(--accent-coral-hover)] text-xs font-semibold rounded cursor-pointer transition-colors"
          >
            Confirm
          </button>
          <button 
            onclick={() => isAddingCol = false}
            class="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    {:else}
      <button 
        onclick={() => isAddingCol = true}
        class="flex items-center justify-center w-[260px] py-4 bg-[var(--bg-surface)]/40 border border-dashed border-[var(--border-default)] hover:border-[var(--accent-coral)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg text-xs font-semibold transition-all cursor-pointer select-none"
      >
        + Add New Sprint Column
      </button>
    {/if}
    </div>
    </div>
  {:else}
    <!-- Timeline Gantt Scheduler View -->
    <div class="flex-1 overflow-y-auto p-6 bg-[var(--bg-surface)] flex flex-col min-h-0 relative select-none">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] shrink-0">
        <div class="flex flex-col">
          <h3 class="text-sm font-bold text-[var(--text-primary)] font-serif">Milestone Timeline Gantt</h3>
          <span class="text-[10px] text-[var(--text-secondary)]">Relational sprint milestones and task critical path scheduler.</span>
        </div>
        
        <!-- Legend indicators -->
        <div class="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          <span class="flex items-center gap-1">🔴 Critical</span>
          <span class="flex items-center gap-1">🟡 High</span>
          <span class="flex items-center gap-1">🟢 Medium</span>
          <span class="flex items-center gap-1">⚪ Low</span>
        </div>
      </div>

      <!-- Main Gantt grid container -->
      <div class="flex-1 flex flex-col mt-4 border border-[var(--border-default)] rounded-xl overflow-hidden min-h-0 bg-[var(--bg-base)]/40 relative">
        
        <!-- Timeline Day columns header -->
        <div class="flex border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 h-10 select-none text-[9px] font-mono font-bold">
          <!-- Task column spacer -->
          <div class="w-60 border-r border-[var(--border-subtle)] flex items-center px-4 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            Sprint Tasks
          </div>
          
          <!-- Day cells -->
          <div class="flex-1 flex min-w-0" bind:clientWidth={trackWidth}>
            {#each timelineDays as day}
              <div class="flex-1 border-r border-[var(--border-subtle)] flex flex-col justify-center items-center text-[var(--text-secondary)] min-w-0">
                <span>{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span class="text-[10px] font-bold text-[var(--text-primary)]">{day.getDate()}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Rows container -->
        <div class="flex-1 overflow-y-auto flex flex-col min-h-0 relative select-none">
          {#if ganttTasks.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center p-12 text-center select-none italic text-[11px] text-[var(--text-muted)]">
              <span>📅 No sprint tasks mapped to the active 14-day schedule.</span>
              <span>Create tasks with estimated durations or due dates to visualize timelines.</span>
            </div>
          {:else}
            <div class="relative w-full flex flex-col min-h-0 divide-y divide-[var(--border-subtle)]">
              
              <!-- SVG Dependency Overlay -->
              <div class="absolute inset-y-0 right-0 w-[calc(100%-240px)] pointer-events-none z-10 overflow-hidden">
                <svg class="w-full h-full" style="min-height: {ganttTasks.length * 48}px">
                  <defs>
                    <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(255,255,255,0.25)" />
                    </marker>
                    <marker id="arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--accent-coral)" />
                    </marker>
                    <marker id="arrow-conflict" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
                    </marker>
                  </defs>
                  
                  {#each ganttEdges as edge}
                    <path 
                      d={edge.path}
                      stroke={edge.isConflict ? '#ef4444' : edge.isCritical ? 'var(--accent-coral)' : 'rgba(255,255,255,0.25)'}
                      stroke-width={edge.isCritical ? 2.5 : 1.5}
                      stroke-dasharray={edge.isConflict ? '4,4' : 'none'}
                      fill="none"
                      marker-end="url(#arrow-{edge.isConflict ? 'conflict' : edge.isCritical ? 'critical' : 'default'})"
                      class={edge.isCritical ? 'animate-pulse-stroke' : ''}
                    />
                  {/each}
                </svg>
              </div>

              {#each ganttTasks as row}
                <!-- Task row -->
                <div class="flex h-12 min-h-12 hover:bg-[var(--bg-surface)]/40 transition-colors select-none">
                  <!-- Row label -->
                  <div 
                    onclick={() => activeTaskId = row.task.id}
                    class="w-60 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/20 flex flex-col justify-center px-4 gap-0.5 cursor-pointer hover:text-[var(--accent-coral)] transition-colors min-w-0"
                    role="button"
                    tabindex="0"
                  >
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="text-[11px] font-semibold text-[var(--text-primary)] truncate leading-snug">{row.task.title}</span>
                      {#if criticalPath.nodes.has(row.task.id)}
                        <span class="px-1 py-0.2 bg-[var(--accent-coral)] text-white text-[7px] font-extrabold rounded select-none shrink-0" title="On Critical Path">CRITICAL</span>
                      {/if}
                    </div>
                    <span class="text-[8px] font-mono font-bold text-[var(--text-secondary)] uppercase tracking-wider">{row.task.status.replace('_', ' ')}</span>
                  </div>
                  
                  <!-- Row timeline track -->
                  <div class="flex-1 relative min-w-0 flex items-center">
                    
                    <!-- Background grid column lines -->
                    <div class="absolute inset-0 flex pointer-events-none">
                      {#each Array(14) as _}
                        <div class="flex-1 border-r border-[var(--border-subtle)]/50 h-full"></div>
                      {/each}
                    </div>

                    <!-- Task Gantt Pill Bar -->
                    <button 
                      onclick={() => activeTaskId = row.task.id}
                      class="absolute h-6 rounded-md border text-[9px] font-bold text-black px-2 flex items-center overflow-hidden truncate transition-transform hover:scale-[1.01] hover:shadow-lg cursor-pointer select-none leading-none
                        {row.color} {criticalPath.nodes.has(row.task.id) ? 'ring-2 ring-[var(--accent-coral)] ring-offset-1 ring-offset-[var(--bg-base)]' : ''}"
                      style="left: {row.left}%; width: {row.width}%;"
                      title={`${row.task.title} (Est: ${row.task.time_estimate || 0}m)`}
                    >
                      <span class="truncate">{row.task.title}</span>
                    </button>

                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Right Slider panel details -->
  {#if activeTaskId && activeTask}
    <div class="absolute inset-y-0 right-0 w-[320px] bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col z-50 animate-slide-in select-text p-4">
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-4 select-none">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Task Properties</span>
        <button 
          onclick={() => activeTaskId = null} 
          class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer"
        >
          ✕
        </button>
      </div>

      <!-- Scrollable attributes -->
      <div class="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
        <!-- Title input -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Title</span>
          <input 
            type="text" 
            bind:value={activeTask.title}
            onblur={() => updateTaskItem(activeTask!)}
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none"
          />
        </div>

        <!-- Priority Select -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Priority</span>
          <select 
            bind:value={activeTask.priority}
            onchange={() => updateTaskItem(activeTask!)}
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
          >
            <option value="p0">🔴 Critical (P0)</option>
            <option value="p1">🟡 High (P1)</option>
            <option value="p2">🟢 Medium (P2)</option>
            <option value="p3">⚪ Low (P3)</option>
          </select>
        </div>

        <!-- Column select -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Sprint Status</span>
          <select 
            bind:value={activeTask.column_id}
            onchange={() => updateTaskItem(activeTask!)}
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
          >
            {#each $columnsList as col}
              <option value={col.id}>{col.name}</option>
            {/each}
          </select>
        </div>

        <!-- Time estimate -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Time Estimate (minutes)</span>
          <input 
            type="number" 
            bind:value={activeTask.time_estimate}
            onblur={() => updateTaskItem(activeTask!)}
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none"
          />
        </div>

        <!-- Due Date Calendar -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Due Date</span>
          <input 
            type="date" 
            value={activeTask.due_date ? new Date(activeTask.due_date).toISOString().substring(0,10) : ''}
            onchange={(e) => {
              const val = (e.target as HTMLInputElement).value;
              activeTask!.due_date = val ? new Date(val).getTime() : null;
              updateTaskItem(activeTask!);
            }}
            class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none"
          />
        </div>

        <!-- Checklist Section -->
        <div class="flex flex-col gap-2 mt-2 select-none">
          <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Sub-Task Checklist</span>
          
          <div class="flex flex-col gap-1.5">
            {#each activeChecklist as check}
              <div class="flex items-center gap-2 p-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded hover:border-[var(--border-default)]">
                <input 
                  type="checkbox"
                  checked={check.done}
                  onchange={() => toggleCheckItem(check)}
                  class="cursor-pointer"
                />
                <span class="text-xs flex-1 text-[var(--text-primary)] {check.done ? 'line-through text-[var(--text-secondary)]' : ''}">
                  {check.text}
                </span>
                <button 
                  onclick={() => deleteCheckItem(check.id)}
                  class="text-[var(--text-secondary)] hover:text-[var(--color-error)] text-[10px] font-bold px-1"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>

          <div class="flex gap-1 mt-1">
            <input 
              type="text" 
              bind:value={newCheckItemText}
              placeholder="Add sub-task..."
              onkeydown={(e) => e.key === 'Enter' && addChecklistItem()}
              class="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none"
            />
            <button 
              onclick={addChecklistItem}
              class="px-2.5 py-1 bg-[var(--accent-teal)] text-[var(--text-inverse)] font-bold text-xs rounded hover:bg-[#439d8b]"
            >
              +
            </button>
          </div>
        </div>

        <!-- Dependencies Section -->
        <div class="flex flex-col gap-2 mt-2 select-none border-t border-[var(--border-subtle)] pt-3">
          <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Prerequisite Dependencies</span>
          
          <!-- List of current dependencies -->
          {#if (activeTask.labels || []).filter(l => l.startsWith('dep:')).length === 0}
            <span class="text-[10px] text-[var(--text-muted)] italic">No prerequisite dependencies.</span>
          {:else}
            <div class="flex flex-wrap gap-1.5 mb-1.5">
              {#each (activeTask.labels || []).filter(l => l.startsWith('dep:')) as depLabel}
                {@const depId = depLabel.substring(4)}
                {@const depTask = $tasksList.find(t => t.id === depId)}
                <div class="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded text-[10px] text-[var(--text-primary)] font-medium">
                  <span class="truncate max-w-[120px]">{depTask ? depTask.title : 'Unknown Task'}</span>
                  <button 
                    onclick={async () => {
                      activeTask!.labels = activeTask!.labels.filter(l => l !== depLabel);
                      await updateTaskItem(activeTask!);
                    }}
                    class="text-[var(--text-secondary)] hover:text-[var(--color-error)] font-bold cursor-pointer ml-1 select-none"
                    title="Remove dependency"
                  >
                    ✕
                  </button>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Add dependency form -->
          <div class="flex gap-1 mt-1">
            <select 
              id="new-dep-select"
              class="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
              value=""
              onchange={async (e) => {
                const targetId = (e.target as HTMLSelectElement).value;
                if (!targetId) return;

                const depLabel = `dep:${targetId}`;
                if (!activeTask!.labels.includes(depLabel)) {
                  activeTask!.labels = [...activeTask!.labels, depLabel];
                  await updateTaskItem(activeTask!);
                }
                (e.target as HTMLSelectElement).value = ""; // Reset select
              }}
            >
              <option value="" disabled selected>+ Add prerequisite...</option>
              <!-- Filter out itself, already added dependencies, and potential cyclic dependencies -->
              {#each $tasksList.filter(t => t.id !== activeTask!.id && !activeTask!.labels.includes(`dep:${t.id}`) && !wouldCreateCycle(activeTask!.id, t.id)) as t}
                <option value={t.id}>{t.title}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <div class="border-t border-[var(--border-subtle)] pt-3 mt-4 flex select-none">
        <button 
          onclick={() => isDeleteModalOpen = true}
          class="w-full py-2 bg-[var(--color-error)]/10 hover:bg-[var(--color-error)]/25 text-[var(--color-error)] border border-[var(--color-error)]/30 rounded text-xs font-semibold cursor-pointer"
        >
          🗑️ Delete Sprint Task
        </button>
      </div>
    </div>
  {/if}

  <ConfirmModal
    isOpen={isDeleteModalOpen}
    title="Delete Task"
    message="Are you sure you want to delete this sprint task permanently? This action cannot be undone."
    confirmText="Delete"
    cancelText="Cancel"
    type="danger"
    onConfirm={async () => {
      isDeleteModalOpen = false;
      if (activeTaskId) {
        await deleteTaskItem(activeTaskId);
        activeTaskId = null;
      }
    }}
    onCancel={() => {
      isDeleteModalOpen = false;
    }}
  />
</div>

<style>
  .animate-slide-in {
    animation: slideIn 200ms ease forwards;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @keyframes pulseStroke {
    0% { stroke-opacity: 0.4; }
    50% { stroke-opacity: 1; }
    100% { stroke-opacity: 0.4; }
  }
  :global(.animate-pulse-stroke) {
    animation: pulseStroke 2s infinite ease-in-out;
  }
</style>
