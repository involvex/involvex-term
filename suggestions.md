# Involvex-Term Feature Suggestions

Living backlog (refreshed for **v0.11 / post-Store**). Struck items shipped;
keep IDs stable. Grouped release view lives in [`ROADMAP.md`](ROADMAP.md).

## Shipped (do not re-open)

| ID       | Notes                                                         |
| -------- | ------------------------------------------------------------- |
| FEAT-001 | Footer Git fetch / pull / push / stash / stash pop (v0.9.3)   |
| FEAT-002 | Multi-pane search within a tab                                |
| FEAT-003 | Cross-tab pane drag-and-drop                                  |
| FEAT-004 | Lazy pane hydration (xterm/ConPTY on first focus)             |
| FEAT-006 | Import/export profiles independently of full settings (v0.10) |
| FEAT-008 | Recent commands in palette (OSC 633 + app-written; no Ctrl+R) |
| FEAT-009 | Per-profile environment variables (Settings → Shell profiles) |
| FEAT-010 | Read-only Changes list in Git footer (name-status; v0.9.3)    |
| FEAT-011 | Git watcher refresh debounce (250ms in main)                  |
| FEAT-012 | Pane split ratios persisted in session restore                |
| FEAT-014 | Cursor style (block / underline / bar) in Terminal settings   |
| FEAT-015 | Clipboard history ring (Ctrl+Shift+V; persist opt-in; v0.10)  |
| FEAT-024 | Recent directories in new-tab menu + palette (v0.10)          |
| FEAT-025 | Sys stats loop skips when footer sys hidden / window hidden   |
| FEAT-021 | High-contrast theme preset + forced-colors chrome             |

## High Priority (v0.12 candidates)

| ID       | Category      | Description                                                                                      | Impact | Effort | Why now / seam                                         |
| -------- | ------------- | ------------------------------------------------------------------------------------------------ | ------ | ------ | ------------------------------------------------------ |
| FEAT-005 | Security      | ~~Plugin trust gate~~ (shipped)                                                                  | Medium | Low    | Allowlist + Settings confirm/status                    |
| FEAT-026 | Plugins       | Complete plugin API: expose read-only git snapshot (`PluginGitSnapshot`) + prompt hook; sync SDK | Medium | Low    | Type declared in `pluginTypes.ts`; prompt events exist |
| FEAT-027 | Accessibility | Focus-trap tests + modal audit (Tab/Shift+Tab cycle, restore focus)                              | Medium | Low    | `src/lib/focusTrap.ts` exists, 0% coverage today       |

## Medium Priority (v0.12–v0.13)

| ID       | Category      | Description                                                                        | Impact | Effort | Why now / seam                                    |
| -------- | ------------- | ---------------------------------------------------------------------------------- | ------ | ------ | ------------------------------------------------- |
| FEAT-007 | Accessibility | Opt-in spoken readout for background-pane completion (Web Speech API)              | Medium | Low    | Reuses completion toast event                     |
| FEAT-017 | Configuration | Custom notification sound file for background-pane completion                      | Low    | Low    | Same completion event                             |
| FEAT-019 | Performance   | Cache git remote URLs per repo root with TTL/invalidation                          | Low    | Low    | Mirror `repoRootCache` in `gitEngine.ts`          |
| FEAT-022 | Configuration | Per-project auto-start profile (repo root/cwd mapping → profile)                   | Medium | Medium | `ptySpawn` takes profileId; OSC7 cwd tracked      |
| FEAT-028 | Git workflow  | Read-only inline diff preview modal from Changes row (`git diff -- <path>`)        | Medium | Medium | `listChanges()` + modal/IPC patterns exist        |
| FEAT-029 | Git workflow  | Changes row actions: Reveal in Explorer, Copy relative path                        | Low    | Low    | `shell:showItemInFolder` + clipboard IPC exist    |
| FEAT-016 | Git workflow  | Recent commits list in Git footer (last 5, read-only; scoped down from full graph) | Low    | Medium | `getGitDetails`/menu pattern; full graph deferred |

## Low Priority (v0.14 / later)

| ID       | Category      | Description                                                                         | Impact | Effort | Why now / seam                                                  |
| -------- | ------------- | ----------------------------------------------------------------------------------- | ------ | ------ | --------------------------------------------------------------- |
| FEAT-018 | Productivity  | Bundled snippet templates (Git/Bun/OpenCode/Docker/shell) with "add to snippets"    | Low    | Low    | `SnippetSchema` + palette already present                       |
| FEAT-020 | UX            | Animated quake dropdown open/close (respect reduced-motion)                         | Low    | Medium | `electron/quake.ts` owns bounds; additive                       |
| FEAT-030 | Productivity  | Named session layouts (save/restore tabs+panes+ratios by name)                      | Medium | Medium | `session.json` already serializes layout                        |
| FEAT-031 | Configuration | Opt-in sync of recent dirs/commands in Gist portable subset (clipboard stays local) | Low    | Medium | `settingsSync.ts` portable subset + `shellMemory.ts` separation |

## Hardening / follow-ups

| ID       | Category     | Description                                                                     | Impact | Effort | Gate / note                          |
| -------- | ------------ | ------------------------------------------------------------------------------- | ------ | ------ | ------------------------------------ |
| FEAT-032 | Quality      | Raise coverage for `src/lib/panes.ts` and `focusTrap.ts`; pane regression tests | Medium | Low    | Code-ready; baseline 285 tests green |
| FEAT-033 | CI           | Windows CI job for `bun run build:electron` (no node-pty rebuild)               | Medium | Low    | Workflow-only                        |
| FOLLOW-1 | Distribution | Authenticode-sign sparse Explorer MSIX for zero-friction Win11 top-level menu   | Medium | Medium | **Blocked on certificate**           |
| FOLLOW-2 | Git workflow | Full inline diff viewer polish beyond FEAT-028 (hunks/syntax highlight)         | Low    | High   | Defer until FEAT-028 ships           |

## Deferred / high-risk (design first)

| ID       | Category | Description                                                    | Impact | Effort | Why deferred                              |
| -------- | -------- | -------------------------------------------------------------- | ------ | ------ | ----------------------------------------- |
| FEAT-013 | Security | Sandbox plugin filesystem access (restrict to plugin dir only) | Medium | Medium | Security-sensitive; do after FEAT-005     |
| FEAT-023 | Security | Plugin sandboxing via Node.js vm/worker isolation              | Low    | High   | Needs threat model; do after FEAT-005/026 |

## Explicitly out of scope

- In-app git commit/stage UI (use the shell)
- Built-in SSH session manager (use `ssh` in the shell)
- Broadcast input to all panes
- Built-in AI chat that duplicates OpenCode
- Signed / notarized macOS builds until Apple certs exist

## Analysis Notes

### Codebase Strengths

- Clean separation: renderer (`src/`), main process (`electron/`), shared types
- Flat pane rendering with stable keys avoids remounting (`src/components/PaneLayout.tsx`)
- Backward-compatible zod schemas with per-field repair (`electron/settingsStore.ts`)
- Plugin system with isolated loading and error reporting (`electron/pluginManager.ts`)
- Comprehensive OSC 7 / 9;9 / 633 cwd+command tracking with chunk reassembly (`electron/cwdTracker.ts`)
- Git engine with TTL caches and read-only action surface (`electron/gitEngine.ts`)
- Windows Terminal-style copy/paste semantics (Ctrl+C copies only with selection)

### Remaining gaps / risks

- Plugin security is trust-based allowlist (FEAT-005 shipped); no signature/sandbox yet (FEAT-013/023)
- `PluginGitSnapshot` type exists but is not exposed through the plugin API (FEAT-026)
- `focusTrap.ts` has no unit tests (FEAT-027)
- `getRemoteUrl()` is uncached; cheap win (FEAT-019)
- FEAT-016 full graph is high effort; scoped recent-commits list is the realistic slice
- Win11 modern Explorer menu still needs Authenticode for zero-friction install (FOLLOW-1, cert-blocked)
