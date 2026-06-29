# PiForge -- Technical Analysis & Optimization Report

> **Date:** 2026-06-26
> **Scope:** Full codebase audit -- security, performance, robustness, architecture, testing
> **Codebase Size:** ~8,300 lines across 37 source files (Svelte 5 + Rust/Tauri v2 + SQLite)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical -- Security](#2-critical----security)
3. [High Priority -- Performance](#3-high-priority----performance)
4. [High Priority -- Robustness & Error Handling](#4-high-priority----robustness--error-handling)
5. [Medium Priority -- Architecture & Code Quality](#5-medium-priority----architecture--code-quality)
6. [Medium Priority -- Testing](#6-medium-priority----testing)
7. [Low Priority -- UX & Practicality](#7-low-priority----ux--practicality)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1. Executive Summary

PiForge is a well-conceived offline-first desktop application for Raspberry Pi project planning. The dual-mode persistence (Tauri SQLite + localStorage fallback) is a strong architectural choice. However, the codebase has several **critical security vulnerabilities**, **performance bottlenecks**, and **robustness gaps** that must be addressed before any production release. This report identifies 24 discrete issues ranked by severity with concrete fix recommendations.

### Severity Distribution

| Severity | Count | Examples |
|----------|-------|---------|
| **CRITICAL** | 4 | SSH credential handling, command injection, CSP gaps, no input validation |
| **HIGH** | 7 | DB connection leak, O(n^2) canvas rendering, missing FK indexes, no WAL mode |
| **MEDIUM** | 8 | Monolithic files, no undo on notes, race conditions, unused deps |
| **LOW** | 5 | Accessibility gaps, missing keyboard shortcuts, no i18n |

---

## 2. Critical -- Security

### SEC-01: SSH Credentials Stored in Plaintext & Passed as Command Args

**File:** `src-tauri/src/lib.rs:657-763`, `src/lib/components/code/CodeView.svelte:370`
**Risk:** SSH passwords and private key paths are passed as Tauri IPC arguments and held in component state (`$state`). The password/key path is visible in the Tauri IPC layer and stored in the frontend reactivity system without any encryption. Command-line arguments are visible to other processes on the system via `/proc/<pid>/cmdline`.

**Impact:** Credential leakage. Any process on the host can read SSH passwords from the command line of `ssh`/`scp` child processes.

**Recommendation:**
```rust
// Use ssh-agent or SSH_ASKPASS instead of passing credentials as args.
// At minimum, write key path to a temporary file with restricted permissions
// and use -F (ssh config) instead of -i with inline paths.
// For passwords: use SSH_ASKPASS environment variable or sshpass with
// proper process isolation.
```

- Never pass passwords as CLI arguments. Use `SSH_ASKPASS` or `sshpass` via stdin pipe.
- For key auth, verify the key file permissions (`0600`) before use.
- Clear sensitive strings from memory after use (zeroize on drop).

### SEC-02: Command Injection via SSH Parameters

**File:** `src-tauri/src/lib.rs:685-727`
**Risk:** `username`, `ip`, `filename`, and `password_or_key` are interpolated directly into SCP/SSH command arguments without sanitization. A malicious `ip` value like `; rm -rf /` or a crafted `username` could inject arbitrary shell commands.

```rust
// Current: Direct string interpolation -- VULNERABLE
let destination = format!("{}@{}:/home/{}/{}", username, ip, username, filename);
```

**Impact:** Remote code execution on the host machine if user-supplied values contain shell metacharacters.

**Recommendation:**
- Validate `ip` against a strict regex (IPv4/IPv6/hostname only): `^[a-zA-Z0-9._-]+$`
- Validate `username` against `^[a-zA-Z0-9._-]+$` (no spaces, no shell metacharacters)
- Validate `filename` against `^[a-zA-Z0-9._-]+$`
- Use `Command::new("ssh").args([...])` with individual argument arrays (already done, but validate inputs first)
- Add a `validate_ssh_input()` function and reject invalid inputs before spawning processes

### SEC-03: CSP Allows `'unsafe-inline'` for Styles

**File:** `src-tauri/tauri.conf.json:21`
**Risk:** `style-src 'self' 'unsafe-inline'` permits inline style injection, which can be exploited for UI redressing or data exfiltration via CSS selectors.

**Impact:** Moderate -- limited by Tauri's webview sandbox, but weakens defense-in-depth.

**Recommendation:**
- Migrate all inline `style=` attributes to Tailwind utility classes or CSS custom properties defined in `app.css`.
- Use `style-src 'self'` with nonce-based or hash-based inline styles if absolutely needed.
- Audit all 1,145 lines of `CanvasView.svelte` for inline styles that can be converted.

### SEC-04: No Input Validation on Tauri IPC Commands

**File:** `src-tauri/src/lib.rs` (all `#[tauri::command]` functions)
**Risk:** All 21 Tauri commands accept raw strings from the frontend without length limits, format validation, or type constraints. The frontend can send arbitrarily large `state_json` blobs, project names, or task descriptions.

**Impact:** Database bloat, potential OOM on SQLite operations, storage exhaustion.

**Recommendation:**
```rust
// Add validation at the Tauri command boundary:
fn validate_project_input(name: &str, description: &str) -> Result<()> {
    if name.len() > 200 || name.is_empty() {
        return Err(Error::Tauri("Project name must be 1-200 characters".into()));
    }
    if description.len() > 10_000 {
        return Err(Error::Tauri("Description must be under 10,000 characters".into()));
    }
    Ok(())
}
```

- Add max length checks for: `name` (200), `description` (10,000), `content` (notes: 1MB), `state_json` (canvas: 10MB), `icon_svg` (custom components: 50KB).
- Validate `status` enums against allowed values (`planning`, `active`, `archived`).
- Validate `priority` enums (`p0`, `p1`, `p2`, `p3`).
- Validate `color` as a hex color regex.

---

## 3. High Priority -- Performance

### PERF-01: Database Connection Created Per-Request (No Connection Pooling)

**File:** `src-tauri/src/lib.rs:103-113`
**Risk:** Every single Tauri command opens a new SQLite connection via `get_connection()`. With rapid auto-save (1-second debounce) and multiple concurrent operations, this creates connection churn and repeated schema migration checks.

**Impact:** ~5-15ms overhead per request. On rapid canvas editing (dragging nodes), this can cause visible lag.

**Recommendation:**
```rust
// Store a single Connection in Tauri managed state:
pub struct DbState {
    pub conn: Mutex<Connection>,
}

// In setup():
let conn = get_connection(app.handle())?;
run_migrations(&conn)?;
app.manage(DbState { conn: Mutex::new(conn) });

// In commands:
#[tauri::command]
async fn list_projects(state: tauri::State<'_, DbState>) -> Result<Vec<Project>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    // ... use conn
}
```

### PERF-02: SQLite Not in WAL Mode

**File:** `src-tauri/src/lib.rs:111`
**Risk:** Default SQLite journal mode is `DELETE` (rollbacks). For a desktop app with concurrent reads/writes (auto-save + UI reads), this causes write contention and potential `SQLITE_BUSY` errors.

**Impact:** Write operations block reads. On rapid auto-save, UI may freeze.

**Recommendation:**
```rust
conn.execute("PRAGMA journal_mode=WAL;", [])?;
conn.execute("PRAGMA busy_timeout=5000;", [])?;
conn.execute("PRAGMA synchronous=NORMAL;", [])?;
```

### PERF-03: Missing Database Indexes

**File:** `src-tauri/src/lib.rs:116-206`
**Risk:** No indexes on foreign key columns. `tasks.project_id`, `columns.project_id`, `canvas_states.project_id`, `notes.project_id` are all queried frequently but not indexed.

**Impact:** Full table scans on every project load. Degrades as task count grows beyond ~100.

**Recommendation:**
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_columns_project_id ON columns(project_id);
CREATE INDEX IF NOT EXISTS idx_canvas_states_project_id ON canvas_states(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
```

### PERF-04: CanvasView.svelte O(n*m) Rendering Pattern

**File:** `src/lib/components/canvas/CanvasView.svelte:593-656, 661-896`
**Risk:** For every edge in the SVG layer, `canvas.nodes.find()` is called twice (once for source, once for target) -- O(n) per edge, O(n*m) total. With 50 nodes and 80 edges, this is 4,000 iterations per render.

Additionally, each of the 40 GPIO pins renders as a separate `<button>` element per RPi board node, and each `{#each}` block inside the node loop re-evaluates `BUILTIN_COMPONENTS.find()`.

**Impact:** Canvas jank on projects with 30+ nodes. Frame drops during pan/zoom.

**Recommendation:**
```svelte
<!-- Pre-compute a node lookup map -->
{@const nodeMap = new Map($activeCanvasState.nodes.map(n => [n.id, n]))}

{#each $activeCanvasState.edges as edge}
  {@const src = nodeMap.get(edge.sourceId)}
  {@const dst = nodeMap.get(edge.targetId)}
  ...
{/each}
```

- Build a `nodeMap` (Map<id, CanvasNode>) once per render instead of calling `.find()` per edge.
- Consider virtualizing the GPIO pin grid -- only render visible pins.
- Memoize `computeOrthogonalPath` results for unchanged wire endpoints.

### PERF-05: Deep Clone on Every Undo/Redo Push

**File:** `src/lib/stores/project.store.ts:204-211`
**Risk:** `JSON.parse(JSON.stringify(state))` is called on every canvas mutation. For a canvas with 50 nodes and 80 edges, this serializes and deserializes the entire state on every mouse move during node dragging.

**Impact:** ~2-5ms per drag event. With 60fps dragging, this is 120-300ms/second wasted on serialization.

**Recommendation:**
- Use structural sharing: only deep clone when pushing to undo stack, not during intermediate drag updates.
- Implement dirty-flag approach: track which parts changed and only clone those.
- Consider using `structuredClone()` (native, faster than JSON roundtrip in modern runtimes).

### PERF-06: `isEdgePowered` Re-computes Full BFS Per Edge

**File:** `src/lib/stores/simulation.store.ts:227-244`
**Risk:** `isEdgePowered()` is called once per edge in the template (line 605 of CanvasView.svelte). Each call reads `nodeSimStates`, `boardPinStates`, and traverses the graph. With 80 edges, this is 80 separate graph traversals.

**Impact:** Simulation mode frame drops with complex circuits.

**Recommendation:**
```svelte
<!-- Pre-compute powered edges set in a single pass -->
{@const poweredEdges = computePoweredEdges($activeCanvasState, $nodeSimStates, $boardPinStates)}

<!-- Then use: -->
{@const isPowered = $isSimulating && poweredEdges.has(edge.id)}
```

- Run `propagateSignals()` once and cache the `Set<string>` of powered edge IDs.
- Pass the pre-computed set to the template instead of calling per-edge.

### PERF-07: Unused `konva` Dependency (Bundle Size)

**File:** `package.json:23`
**Risk:** `konva` (10.3.0) is listed as a dependency but never imported anywhere in the source code. This adds ~150KB gzipped to the production bundle.

**Recommendation:** Remove `konva` from `package.json` unless planned for future use.

---

## 4. High Priority -- Robustness & Error Handling

### ROB-01: Shared `saveTimeout` Variable Between Canvas and Notes

**File:** `src/lib/stores/project.store.ts:25,242-258,261-278`
**Risk:** A single `saveTimeout` variable is shared between canvas auto-save and notes auto-save. If the user edits notes while canvas is saving (or vice versa), the timeout is overwritten, potentially dropping one save.

**Impact:** Data loss -- the earlier pending save is cancelled without execution.

**Recommendation:**
```typescript
let canvasSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let notesSaveTimeout: ReturnType<typeof setTimeout> | null = null;
```

### ROB-02: No Error Recovery on Canvas Save Failure

**File:** `src/lib/stores/project.store.ts:249-257`
**Risk:** If `ipc.saveCanvasState()` fails, the error is only logged to console. There is no retry mechanism, no user notification, and no local fallback.

**Impact:** Silent data loss. User may lose hours of canvas work on transient DB errors.

**Recommendation:**
- Retry 3 times with exponential backoff.
- Show toast notification on persistent failure.
- Store failed canvas state in `localStorage` as emergency fallback.

### ROB-03: `updateTaskItem` Mutates Task Before Save

**File:** `src/lib/stores/project.store.ts:171-190`
**Risk:** The function calls `updateTask(task)` first, then reads `task.column_id` to check if status should be updated. But it also mutates `task.status` directly (`task.status = targetStatus`) and calls `updateTask(task)` again -- this is a double-write and the first call already saved the wrong status.

**Impact:** Inconsistent state -- task may briefly show incorrect status.

**Recommendation:**
- Compute the correct status before the first save.
- Never mutate the input parameter directly.

### ROB-04: Checklist Operations Have No Backend Persistence in Tauri Mode

**File:** `src/lib/ipc.ts:521-538`
**Risk:** `getChecklistItems`, `saveChecklistItem`, `deleteChecklistItem` always use `mockDb` (localStorage) regardless of whether Tauri is available. There is no Tauri command for checklist operations, and no `checklist_items` table in SQLite.

**Impact:** Checklists are lost when switching from browser mode to Tauri desktop mode. They persist only in localStorage.

**Recommendation:**
- Add a `checklist_items` table to SQLite migrations.
- Add Tauri IPC commands: `list_checklist_items`, `save_checklist_item`, `delete_checklist_item`.
- Route through the same `isTauri()` pattern as other operations.

### ROB-05: Graph State Not Persisted in Tauri Mode

**File:** `src/lib/ipc.ts:607-615`
**Risk:** `saveGraphState` and `loadGraphState` have no Tauri IPC counterparts. Graph state only exists in localStorage via `mockDb`.

**Impact:** Graph view state is lost on desktop mode. No persistence across sessions in Tauri.

**Recommendation:**
- Add `graph_states` table and corresponding Tauri commands, or
- Store graph state inside `canvas_states` as a sub-field.

### ROB-06: `delete_project` Does Not Clean Up Temp Files

**File:** `src-tauri/src/lib.rs:314-319`, `src-tauri/src/lib.rs:676-682`
**Risk:** `deploy_and_run_pi` writes code to `app_data_dir/filename`. When a project is deleted, these temp files are not cleaned up. Over time, orphaned scaffold scripts accumulate.

**Recommendation:**
- Use a temp directory that is cleaned on app startup, or
- Delete the scaffold file after SCP completes successfully.

### ROB-07: Thread Safety of `PiConnectionState`

**File:** `src-tauri/src/lib.rs:98-100, 739-743`
**Risk:** The `Child` process is stored in `Mutex<Option<Child>>`. After spawning, the stdout/stderr reader threads hold references to the child's piped output, but the `Child` handle itself (needed for `kill()`) is moved into the mutex. The current code works, but if `stop_pi_execution` is called while the reader threads are still reading, there is a race between `child.kill()` and the reader threads consuming EOF.

**Impact:** Potential orphaned SSH processes if kill races with reader EOF.

**Recommendation:**
- Use `child.kill()` followed by `child.wait()` to reap the process.
- Signal reader threads to stop via a shared `AtomicBool` flag.

---

## 5. Medium Priority -- Architecture & Code Quality

### ARCH-01: Monolithic Components (Violation of Single Responsibility)

**Files:**
- `CanvasView.svelte` -- 1,145 lines (rendering, drag-drop, wire routing, diagnostics, simulation UI, toolbars, modals)
- `BoardView.svelte` -- 879 lines (kanban, Gantt, critical path, task detail panel, checklist, dependencies)
- `CodeView.svelte` -- 599 lines (code generation for 3 languages, SSH deploy, console terminal)
- `lib.rs` -- 1,109 lines (all models, DB, all 21 commands, tests)

**Impact:** Difficult to maintain, test, and reason about. Changes in one area risk regressions in unrelated areas.

**Recommendation:**
- Extract `CanvasView` into: `CanvasToolbar.svelte`, `CanvasDiagnostics.svelte`, `CanvasSvgWires.svelte`, `CanvasNodeRenderer.svelte`, `WireStyleEditor.svelte`.
- Extract `BoardView` into: `KanbanBoard.svelte`, `GanttTimeline.svelte`, `TaskDetailPanel.svelte`.
- Extract `CodeView` into: `CodeGenerator.svelte`, `SshDeployer.svelte`, `ConsoleTerminal.svelte`.
- Split `lib.rs` into: `models.rs`, `db.rs`, `commands/` (one file per resource), `deploy.rs`.

### ARCH-02: `lib.rs` Uses `#[allow(non_snake_case)]` Globally

**File:** `src-tauri/src/lib.rs:1`
**Risk:** Suppresses Rust's naming convention lint for the entire file, hiding potential naming issues.

**Recommendation:**
- Remove the global allow. Use `#[allow(non_snake_case)]` on individual struct fields where Tauri IPC requires camelCase (or use `#[serde(rename = "camelCase")]`).

### ARCH-03: No Structured Error Types for Frontend

**File:** `src-tauri/src/lib.rs:12-30`
**Risk:** All Tauri commands return `Result<T, String>`. The frontend receives opaque error strings with no structured error codes or categories.

**Impact:** Frontend cannot differentiate between "project not found" vs "database locked" vs "invalid input".

**Recommendation:**
```rust
#[derive(Debug, Serialize)]
pub enum AppError {
    NotFound { entity: String, id: String },
    Validation { field: String, message: String },
    Database(String),
    Io(String),
    SshConnection(String),
}

impl Serialize for AppError { /* serialize as JSON */ }
```

### ARCH-04: Canvas State Uses Raw JSON Blob in SQLite

**File:** `src-tauri/src/lib.rs:165-172`
**Risk:** The entire canvas state (all nodes, edges, viewport) is serialized as a single JSON TEXT column. This means:
- Cannot query individual nodes/edges without deserializing the full blob.
- Concurrent edits to different parts of the canvas cause full-blob overwrites.
- No diff-based sync possible.

**Impact:** Limits future features like collaborative editing, search within canvas, or partial saves.

**Recommendation:**
- For v1: Acceptable for local-first single-user.
- For v2: Normalize into `canvas_nodes` and `canvas_edges` tables with FK to project.

### ARCH-05: Inconsistent State Management Patterns

**File:** Multiple stores
**Risk:** The codebase mixes Svelte 5 runes (`$state`, `$derived`, `$effect`) in components with legacy Svelte stores (`writable`, `get`) in stores. The stores use `writable()` + `get()` pattern while components use runes.

**Impact:** Two mental models for reactivity. Contributors must understand both.

**Recommendation:**
- Migrate stores to Svelte 5 runes-compatible patterns (use `$state` in `.svelte.ts` store files) or keep stores as the single source of truth with a consistent pattern. Don't mix.

### ARCH-06: MockDb Silently Swallows Errors

**File:** `src/lib/ipc.ts:15-65`
**Risk:** `getStorage()` calls `JSON.parse()` without try/catch. Corrupted localStorage data will crash the entire app.

**Impact:** App crash on corrupted localStorage.

**Recommendation:**
```typescript
private getStorage<T>(key: string, defaultValue: T): T {
  if (typeof localStorage === 'undefined') return defaultValue;
  const data = localStorage.getItem(`piforge_${key}`);
  if (!data) return defaultValue;
  try {
    return JSON.parse(data);
  } catch {
    console.warn(`Corrupted localStorage for ${key}, resetting to default`);
    localStorage.removeItem(`piforge_${key}`);
    return defaultValue;
  }
}
```

### ARCH-07: Missing `rpi_model` Validation in `update_project`

**File:** `src-tauri/src/lib.rs:280-312`
**Risk:** `update_project` accepts `name, description, status, color` but not `rpi_model`. Once set at creation, the board model can never be changed.

**Impact:** Users cannot change their target board without deleting and recreating the project.

**Recommendation:** Add `rpi_model` parameter to `update_project` or create a separate `update_project_model` command.

### ARCH-08: `deploy_and_run_pi` Overwrites Existing Files Without Warning

**File:** `src-tauri/src/lib.rs:681-682`
**Risk:** `std::fs::write(&temp_filepath, code)` silently overwrites any existing file at that path.

**Impact:** If two projects have the same filename, deployment of one overwrites the other's scaffold.

**Recommendation:** Use unique temp filenames (e.g., UUID-prefixed) or write to a project-specific subdirectory.

---

## 6. Medium Priority -- Testing

### TEST-01: No Frontend Tests Whatsoever

**Files:** Entire `src/` directory
**Risk:** Zero `.test.*` or `.spec.*` files. No testing framework configured in `package.json`. The `svelte-check` in CI only does type checking, not behavioral testing.

**Impact:** Any frontend change can introduce regressions undetected. UI bugs only caught by manual testing.

**Recommendation:**
- Add `vitest` as dev dependency (already using Vite, native integration).
- Add `@testing-library/svelte` for component testing.
- Prioritize tests for:
  1. `ipc.ts` MockDb operations (CRUD correctness)
  2. `simulation.store.ts` signal propagation logic
  3. `project.store.ts` undo/redo state machine
  4. `BoardView.svelte` critical path calculation
  5. `CodeView.svelte` code generation templates

### TEST-02: Rust Tests Only Cover DB Operations

**File:** `src-tauri/src/lib.rs:817-1108`
**Risk:** 6 tests cover DB migrations and CRUD, but zero tests for:
- `deploy_and_run_pi` command logic
- Input validation
- Error handling paths
- Concurrent access patterns
- Settings upsert behavior

**Recommendation:**
- Add test for `deploy_and_run_pi` with mock SSH (or at least test input validation).
- Add test for malformed input handling.
- Add test for concurrent `save_canvas_state` calls.

### TEST-03: No E2E or Integration Tests

**Risk:** No Playwright, Cypress, or Tauri integration tests exist. The CI pipeline only runs type checks and Rust unit tests.

**Recommendation:**
- Add at least basic E2E smoke tests: create project -> add task -> switch views -> verify state persists.
- Tauri supports WebDriver-based testing via `tauri-driver`.

---

## 7. Low Priority -- UX & Practicality

### UX-01: No Keyboard Shortcuts for Common Actions

**Files:** All view components
**Risk:** No global keyboard shortcut handler. Users cannot use `Ctrl+Z` for undo, `Ctrl+S` for save, `Ctrl+N` for new task, etc. The `handleKeyDown` in CanvasView only handles `Delete`/`Backspace`.

**Recommendation:**
- Implement a global `keydown` listener in `AppShell.svelte` with shortcuts:
  - `Ctrl+Z` / `Ctrl+Shift+Z` -- Undo/Redo
  - `Ctrl+S` -- Force save
  - `Ctrl+N` -- New task
  - `Delete` / `Backspace` -- Delete selected
  - `V` -- Select tool
  - `C` -- Wire tool
  - `N` -- New sticky note
  - `T` -- New text label
  - `1-5` -- Switch views

### UX-02: No Confirmation Dialogs for Destructive Actions

**File:** `src/lib/components/board/BoardView.svelte:848`
**Risk:** Task deletion uses `confirm()` (browser native). Project deletion in `+page.svelte` likely does the same. These are inconsistent with the app's visual design.

**Recommendation:** Create a custom `ConfirmModal.svelte` component matching the app's design system.

### UX-03: Toast Notifications Auto-Dismiss Without User Control

**File:** `src/lib/stores/ui.store.ts` (assumed)
**Risk:** Toasts auto-dismiss after timeout. Error toasts may disappear before the user reads them.

**Recommendation:**
- Error toasts should persist until manually dismissed.
- Success toasts auto-dismiss after 3 seconds.
- Add a toast queue display area.

### UX-04: No Loading States for Initial Data Load

**File:** `src/routes/+page.svelte`
**Risk:** When the app first loads, there is no skeleton or loading indicator while projects are being fetched from SQLite.

**Recommendation:** Add skeleton loading states for the project list and workspace.

### UX-05: Hardcoded SSH Key Path in CodeView

**File:** `src/lib/components/code/CodeView.svelte:370`
**Risk:** `let piPasswordOrKey = $state('/Users/pallabpc/.ssh/id_rsa');` -- hardcoded developer-specific path.

**Impact:** Confusing for other users. Looks unprofessional.

**Recommendation:** Default to `~/.ssh/id_rsa` (resolved at runtime) or leave empty and require user input.

---

## 8. Implementation Checklist

Prioritized implementation order, grouped into phases:

### Phase 1: Security Hardening (Immediate)

- [ ] SEC-02: Add input validation for SSH parameters (ip, username, filename)
- [ ] SEC-01: Remove password from CLI args, use SSH_ASKPASS or stdin
- [ ] SEC-04: Add length/format validation to all Tauri IPC commands
- [ ] SEC-03: Audit and remove `unsafe-inline` from CSP

### Phase 2: Performance (Week 1)

- [ ] PERF-01: Implement connection pooling (single `DbState` in Tauri managed state)
- [ ] PERF-02: Enable WAL mode and busy timeout pragmas
- [ ] PERF-03: Add database indexes on FK columns
- [ ] PERF-04: Build nodeMap for O(1) lookups in CanvasView
- [ ] PERF-07: Remove unused `konva` dependency

### Phase 3: Robustness (Week 2)

- [ ] ROB-01: Separate save timeouts for canvas and notes
- [ ] ROB-02: Add retry logic and user notification for canvas save failures
- [ ] ROB-03: Fix double-write in `updateTaskItem`
- [ ] ROB-04: Add checklist persistence to SQLite + Tauri commands
- [ ] ROB-05: Add graph state persistence to Tauri
- [ ] ARCH-06: Add try/catch to MockDb localStorage parsing

### Phase 4: Architecture (Week 3)

- [ ] ARCH-01: Break down CanvasView, BoardView, CodeView into sub-components
- [ ] ARCH-01: Split `lib.rs` into modules (`models.rs`, `db.rs`, `commands/`)
- [ ] ARCH-03: Implement structured error types for Tauri commands
- [ ] ARCH-08: Use UUID-prefixed temp filenames for deploy

### Phase 5: Testing (Week 4)

- [ ] TEST-01: Set up vitest + testing-library/svelte
- [ ] TEST-01: Write tests for MockDb, simulation store, undo/redo
- [ ] TEST-02: Add Rust tests for deploy input validation
- [ ] TEST-03: Add basic E2E smoke test

### Phase 6: UX Polish (Week 5)

- [ ] UX-01: Implement global keyboard shortcuts
- [ ] UX-02: Create custom confirmation modal
- [ ] UX-03: Improve toast notification behavior
- [ ] UX-04: Add loading skeletons
- [ ] UX-05: Fix hardcoded SSH key path

---

## Appendix: File-by-File Issue Index

| File | Issues |
|------|--------|
| `src-tauri/src/lib.rs` | SEC-01, SEC-02, SEC-04, PERF-01, PERF-02, PERF-03, ROB-06, ROB-07, ARCH-02, ARCH-03, ARCH-04, ARCH-07, ARCH-08, TEST-02 |
| `src/lib/ipc.ts` | ROB-04, ROB-05, ARCH-06 |
| `src/lib/stores/project.store.ts` | ROB-01, ROB-02, ROB-03, PERF-05 |
| `src/lib/stores/simulation.store.ts` | PERF-06 |
| `src/lib/components/canvas/CanvasView.svelte` | SEC-03, PERF-04, ARCH-01 |
| `src/lib/components/board/BoardView.svelte` | ARCH-01 |
| `src/lib/components/code/CodeView.svelte` | UX-05, ARCH-01 |
| `src-tauri/tauri.conf.json` | SEC-03 |
| `package.json` | PERF-07 |
| All frontend files | TEST-01, TEST-03, UX-01, UX-02, UX-03, UX-04 |

---

*End of Report*
