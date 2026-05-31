<script lang="ts">
  import { projectNotes, updateNotes } from '../../stores/project.store';
  import { activeProject } from '../../stores/project.store';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let textContent = $state('');

  // Svelte 5 reactive sync with store
  $effect(() => {
    textContent = $projectNotes;
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    textContent = target.value;
    updateNotes(textContent);
  }

  // Parse markdown securely
  let renderedHtml = $derived.by(() => {
    if (!textContent) return '<p class="text-[var(--text-muted)] italic">No notes created yet. Start writing markdown documentation here...</p>';
    try {
      const rawHtml = marked.parse(textContent) as string;
      return DOMPurify.sanitize(rawHtml);
    } catch (e) {
      console.error(e);
      return `<p class="text-[var(--color-error)]">Markdown rendering error</p>`;
    }
  });

  function insertMarkdown(tag: string) {
    const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let replacement = '';
    if (tag === 'bold') replacement = `**${selected || 'bold text'}**`;
    else if (tag === 'italic') replacement = `*${selected || 'italic text'}*`;
    else if (tag === 'code') replacement = `\`${selected || 'code block'}\``;
    else if (tag === 'h1') replacement = `# ${selected || 'Heading 1'}`;
    else if (tag === 'h2') replacement = `## ${selected || 'Heading 2'}`;
    else if (tag === 'link') replacement = `[${selected || 'link text'}](https://)`;
    else if (tag === 'list') replacement = `\n- ${selected || 'list item'}`;

    const nextText = text.substring(0, start) + replacement + text.substring(end);
    textContent = nextText;
    updateNotes(textContent);

    // Refocus
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 50);
  }
</script>

<div class="flex flex-col h-full w-full bg-[var(--bg-base)] select-none">
  <!-- Markdown Toolbar -->
  <div class="flex items-center gap-1 px-4 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] overflow-x-auto select-none shrink-0">
    <button onclick={() => insertMarkdown('h1')} class="px-2 py-1 hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-semibold transition-colors" title="Heading 1">H1</button>
    <button onclick={() => insertMarkdown('h2')} class="px-2 py-1 hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-semibold transition-colors" title="Heading 2">H2</button>
    <div class="w-[1px] h-4 bg-[var(--border-default)] mx-1"></div>
    <button onclick={() => insertMarkdown('bold')} class="px-2 py-1 hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-bold transition-colors" title="Bold">B</button>
    <button onclick={() => insertMarkdown('italic')} class="px-2 py-1 hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded italic transition-colors" title="Italic">I</button>
    <button onclick={() => insertMarkdown('code')} class="px-2 py-1 hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-mono transition-colors" title="Code">{"{}"}</button>
    <div class="w-[1px] h-4 bg-[var(--border-default)] mx-1"></div>
    <button onclick={() => insertMarkdown('link')} class="px-2 py-1 hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors" title="Hyperlink">🔗</button>
    <button onclick={() => insertMarkdown('list')} class="px-2 py-1 hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors" title="Bullet List">• List</button>
  </div>

  <!-- Split Pane Editor -->
  <div class="flex flex-1 min-h-0 divide-x divide-[var(--border-subtle)]">
    <!-- Left: Markdown Text Editor -->
    <div class="flex-1 flex flex-col h-full bg-[var(--bg-base)]">
      <textarea
        id="notes-textarea"
        value={textContent}
        oninput={handleInput}
        placeholder="Document your Raspberry Pi project using Markdown syntax. Describe pin headers, scripts, or bill of materials..."
        class="w-full h-full p-4 bg-[var(--bg-base)] text-[var(--text-primary)] text-sm leading-relaxed border-none outline-none resize-none font-mono focus:ring-0 focus:ring-offset-0"
      ></textarea>
    </div>

    <!-- Right: Rendered HTML Previewer -->
    <div class="flex-1 h-full p-6 overflow-y-auto bg-[var(--bg-surface)] text-[var(--text-primary)] prose prose-invert max-w-none prose-sm select-text selection:bg-[var(--accent-coral-dim)]">
      <div class="markdown-preview">
        {@html renderedHtml}
      </div>
    </div>
  </div>
</div>

<style>
  /* Markdown Preview Styling overrides */
  .markdown-preview :global(h1) {
    font-size: 1.6rem;
    font-weight: 700;
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 0.4rem;
  }
  .markdown-preview :global(h2) {
    font-size: 1.3rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.8rem;
    color: var(--text-primary);
  }
  .markdown-preview :global(p) {
    line-height: 1.6;
    margin-bottom: 1rem;
    color: var(--text-secondary);
  }
  .markdown-preview :global(code) {
    font-family: var(--font-mono);
    background-color: var(--bg-elevated);
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-size: 0.9em;
    color: var(--accent-coral);
  }
  .markdown-preview :global(pre) {
    background-color: var(--bg-elevated);
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid var(--border-default);
    margin-bottom: 1rem;
  }
  .markdown-preview :global(pre code) {
    background-color: transparent;
    padding: 0;
    color: var(--text-primary);
  }
  .markdown-preview :global(ul) {
    list-style-type: disc;
    margin-left: 1.5rem;
    margin-bottom: 1rem;
    color: var(--text-secondary);
  }
  .markdown-preview :global(li) {
    margin-bottom: 0.4rem;
  }
  .markdown-preview :global(a) {
    color: var(--accent-teal);
    text-decoration: underline;
  }
  .markdown-preview :global(a:hover) {
    color: var(--accent-coral);
  }
</style>
