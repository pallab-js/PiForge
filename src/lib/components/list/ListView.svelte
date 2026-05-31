<script lang="ts">
  import { tasksList, columnsList, addTask, updateTaskItem, deleteTaskItem } from '../../stores/project.store';
  import type { Task } from '../../types';

  let filterStatus = $state('all');
  let filterPriority = $state('all');
  let searchQuery = $state('');
  
  let sortField = $state<'title' | 'priority' | 'due_date' | 'status'>('title');
  let sortDirection = $state<'asc' | 'desc'>('asc');

  let newTaskTitle = $state('');

  // Priority helpers
  const priorityLabels = { p0: 'Critical', p1: 'High', p2: 'Medium', p3: 'Low' };
  const priorityColors = { p0: 'text-[var(--color-error)]', p1: 'text-[var(--accent-amber)]', p2: 'text-[var(--accent-teal)]', p3: 'text-[var(--text-muted)]' };

  // Filtered and sorted tasks
  let filteredTasks = $derived.by(() => {
    let list = [...$tasksList];

    // Status Filter
    if (filterStatus !== 'all') {
      list = list.filter(t => t.column_id === filterStatus);
    }

    // Priority Filter
    if (filterPriority !== 'all') {
      list = list.filter(t => t.priority === filterPriority);
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }

    // Sorting
    list.sort((a, b) => {
      let valA: any = a[sortField] || '';
      let valB: any = b[sortField] || '';

      if (sortField === 'status') {
        const colA = $columnsList.find(c => c.id === a.column_id)?.name || '';
        const colB = $columnsList.find(c => c.id === b.column_id)?.name || '';
        valA = colA;
        valB = colB;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  });

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'asc';
    }
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    // Find backlog column or first column
    const defaultCol = $columnsList[0]?.id || 'backlog';
    await addTask(newTaskTitle, defaultCol);
    newTaskTitle = '';
  }

  async function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter') handleAddTask();
  }

  async function changeTaskPriority(task: Task, e: Event) {
    const target = e.target as HTMLSelectElement;
    task.priority = target.value as Task['priority'];
    await updateTaskItem(task);
  }

  async function changeTaskColumn(task: Task, e: Event) {
    const target = e.target as HTMLSelectElement;
    task.column_id = target.value;
    await updateTaskItem(task);
  }
</script>

<div class="flex flex-col h-full w-full bg-[var(--bg-base)] select-none">
  <!-- List Filter Toolbar -->
  <div class="flex flex-wrap items-center gap-3 p-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0">
    <!-- Search -->
    <input 
      type="text" 
      bind:value={searchQuery}
      placeholder="Search tasks ledger..."
      class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-coral)] outline-none min-w-[180px] flex-1 max-w-[280px]"
    />

    <!-- Status filter dropdown -->
    <div class="flex items-center gap-1.5 text-xs">
      <span class="text-[var(--text-secondary)]">Status:</span>
      <select 
        bind:value={filterStatus}
        class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2.5 py-1 text-[var(--text-primary)] outline-none"
      >
        <option value="all">All Statuses</option>
        {#each $columnsList as col}
          <option value={col.id}>{col.name}</option>
        {/each}
      </select>
    </div>

    <!-- Priority filter dropdown -->
    <div class="flex items-center gap-1.5 text-xs">
      <span class="text-[var(--text-secondary)]">Priority:</span>
      <select 
        bind:value={filterPriority}
        class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2.5 py-1 text-[var(--text-primary)] outline-none"
      >
        <option value="all">All Priorities</option>
        <option value="p0">Critical (P0)</option>
        <option value="p1">High (P1)</option>
        <option value="p2">Medium (P2)</option>
        <option value="p3">Low (P3)</option>
      </select>
    </div>

    <div class="flex-1"></div>

    <!-- Fast Quick task insert -->
    <div class="flex items-center gap-1.5">
      <input 
        type="text" 
        bind:value={newTaskTitle}
        onkeydown={handleKeyPress}
        placeholder="Quick add new task title..."
        class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-3 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent-coral)] outline-none w-[180px]"
      />
      <button 
        onclick={handleAddTask}
        class="px-3 py-1 bg-[var(--accent-coral)] text-[var(--text-inverse)] hover:bg-[var(--accent-coral-hover)] text-xs font-semibold rounded transition-colors cursor-pointer"
      >
        + Add
      </button>
    </div>
  </div>

  <!-- Spreadsheet Table Display -->
  <div class="flex-1 overflow-auto p-4 select-text">
    <table class="w-full border-collapse border border-[var(--border-subtle)] text-xs text-left bg-[var(--bg-surface)] rounded-lg overflow-hidden">
      <thead>
        <tr class="bg-[var(--bg-elevated)] border-b border-[var(--border-default)] text-[var(--text-secondary)]">
          <th onclick={() => toggleSort('title')} class="p-3 font-semibold cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none">
            Task Title {sortField === 'title' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </th>
          <th onclick={() => toggleSort('status')} class="p-3 font-semibold cursor-pointer hover:text-[var(--text-primary)] transition-colors w-[150px] select-none">
            Status {sortField === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </th>
          <th onclick={() => toggleSort('priority')} class="p-3 font-semibold cursor-pointer hover:text-[var(--text-primary)] transition-colors w-[120px] select-none">
            Priority {sortField === 'priority' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </th>
          <th onclick={() => toggleSort('due_date')} class="p-3 font-semibold cursor-pointer hover:text-[var(--text-primary)] transition-colors w-[150px] select-none">
            Due Date {sortField === 'due_date' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </th>
          <th class="p-3 font-semibold w-[80px] text-center select-none">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--border-subtle)]">
        {#if filteredTasks.length === 0}
          <tr>
            <td colspan="5" class="p-8 text-center text-[var(--text-muted)] italic">
              No matching tasks found. Start by entering a new task above.
            </td>
          </tr>
        {:else}
          {#each filteredTasks as task}
            <tr class="hover:bg-[var(--bg-hover)] transition-colors group">
              <!-- Title -->
              <td class="p-3 font-medium text-[var(--text-primary)]">
                {task.title}
                {#if task.labels && task.labels.filter(l => !l.startsWith('dep:')).length > 0}
                  <span class="inline-flex gap-1 ml-2">
                    {#each task.labels.filter(l => !l.startsWith('dep:')) as label}
                      <span class="px-1.5 py-0.5 bg-[var(--bg-card)] border border-[var(--border-default)] rounded text-[9px] text-[var(--text-secondary)] font-normal font-mono select-none">
                        {label}
                      </span>
                    {/each}
                  </span>
                {/if}
              </td>

              <!-- Column/Status Dropdown -->
              <td class="p-3">
                <select 
                  value={task.column_id} 
                  onchange={(e) => changeTaskColumn(task, e)}
                  class="bg-transparent border-0 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:bg-[var(--bg-card)] p-1 rounded cursor-pointer"
                >
                  {#each $columnsList as col}
                    <option value={col.id}>{col.name}</option>
                  {/each}
                </select>
              </td>

              <!-- Priority Dropdown -->
              <td class="p-3">
                <select 
                  value={task.priority} 
                  onchange={(e) => changeTaskPriority(task, e)}
                  class="bg-transparent border-0 font-semibold p-1 rounded cursor-pointer {priorityColors[task.priority]}"
                >
                  <option value="p0" class="text-[var(--color-error)]">🔴 Critical</option>
                  <option value="p1" class="text-[var(--accent-amber)]">🟡 High</option>
                  <option value="p2" class="text-[var(--accent-teal)]">🟢 Medium</option>
                  <option value="p3" class="text-[var(--text-muted)]">⚪ Low</option>
                </select>
              </td>

              <!-- Due Date -->
              <td class="p-3 font-mono text-[var(--text-secondary)]">
                {#if task.due_date}
                  📅 {new Date(task.due_date).toLocaleDateString()}
                {:else}
                  <span class="text-[var(--text-muted)] italic">No due date</span>
                {/if}
              </td>

              <!-- Delete actions -->
              <td class="p-3 text-center">
                <button 
                  onclick={() => deleteTaskItem(task.id)}
                  class="text-[var(--text-secondary)] hover:text-[var(--color-error)] opacity-0 group-hover:opacity-100 transition-all font-bold px-1.5 py-0.5 rounded cursor-pointer"
                  title="Delete Task"
                >
                  🗑️
                </button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
