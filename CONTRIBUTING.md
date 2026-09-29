# Contributing to involvex-term

Thanks for helping with involvex-term — a Git-aware desktop terminal
(Electron + TypeScript + Bun + xterm.js + node-pty). This guide keeps
contributions reviewable and CI green.

## Open an issue first for non-trivial work

For anything beyond a typo or small fix, open an issue before writing code so
design, scope, and ROADMAP fit can be agreed up front. Link the issue from
your PR (`Closes #123`).

## Setup

Bun only — never npm / yarn / pnpm. PowerShell on Windows.

```powershell
bun install
```

- If the Electron install is incomplete (`node_modules/electron/dist/`
  missing its binary), repair it with:
  `node node_modules/electron/install.js`
- On Linux, `node-pty` has no prebuild — compile it for Electron's ABI with:
  `bun run rebuild`

## Branches and commits

- Branch off `main`; open PRs into `main`.
- Commit style: `feat:` / `fix:` / `build:` subject line, with scope bullets in
  the body, e.g. `git commit -m "feat: tray menu" -m "- bullet details"`.

## Mandatory checks

Run all four before pushing; CI (`lint` + `tsc` + `format check` on
`main` / PRs) must be green:

```powershell
bunx tsc --noEmit
bun run lint
bun run format:check
bun test
```

`bunx tsc --noEmit` is the ground truth for types (ignore stale editor
diagnostics about `electron` module declarations). `bun run lint` runs with
`--max-warnings 0`. `bun test` runs the `bun test` suite.

## PR expectations

- Describe what changed and why.
- Link the issue (`Closes #123` / `Relates to #123`).
- State the ROADMAP phase the change belongs to (or why it is a new idea).
- Add screenshots for UI changes (commit them under `docs/img/`).

## Native-build gotchas (node-pty)

- `node-gyp@9` needs CPython ≤ 3.11 (`distutils`). Never upgrade node-gyp to
  v10+ — it is silently incompatible with `electron-rebuild@3`.
- The Spectre patch (`scripts/patch-node-pty.mjs`) strips `SpectreMitigation`
  from node-pty's gyp files (stock VS lacks Spectre libs → MSB8040) and runs
  via postinstall and the rebuild script.

## Changelog and docs

- Add user-facing changes under `CHANGELOG.md` `[Unreleased]` (Keep a
  Changelog format).
- Update README / docs for user-facing changes (features, settings, CLI,
  shortcuts, screenshots).

## Plugins

Plugin proposals and changes go through `PLUGINS.md`. Trust model in brief:
plugins run unsandboxed with full Node.js access in the main process — the
same process that spawns shells and holds settings — and are off by default
(`plugins.enabled: false`). Only run plugins you trust, the same way you
would trust a shell profile script.

## Merging

- PRs are squash-merged.
- CI must be green before merge.
