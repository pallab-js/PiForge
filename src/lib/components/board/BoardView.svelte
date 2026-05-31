<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions a11y_click_events_have_key_events a11y-click-events-have-key-events a11y_autofocus a11y-autofocus -->
<script lang="ts">
  import { tasksList, columnsList, addTask, updateTaskItem, deleteTaskItem } from '../../stores/project.store';
  import { addToast } from '../../stores/ui.store';
  import type { Task, Column, ChecklistItem } from '../../types';
  import * as ipc from '../../ipc';

  let activeTaskId = $state<string | null>(null);
  let activeTask = $derived($tasksList.find(t => t.id === activeTaskId) || null);

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

<div class="flex h-full w-full bg-[var(--bg-base)] overflow-x-auto select-none relative">
  <!-- Kanban Board flex rows -->
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
              {#if task.labels && task.labels.length > 0}
                <div class="flex flex-wrap gap-1 mt-1.5 mb-2 select-none">
                  {#each task.labels as label}
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
      </div>

      <div class="border-t border-[var(--border-subtle)] pt-3 mt-4 flex select-none">
        <button 
          onclick={async () => {
            if (confirm('Delete this task permanently?')) {
              await deleteTaskItem(activeTaskId!);
              activeTaskId = null;
            }
          }}
          class="w-full py-2 bg-[var(--color-error)]/10 hover:bg-[var(--color-error)]/25 text-[var(--color-error)] border border-[var(--color-error)]/30 rounded text-xs font-semibold cursor-pointer"
        >
          🗑️ Delete Sprint Task
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .animate-slide-in {
    animation: slideIn 200ms ease forwards;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
</style>
