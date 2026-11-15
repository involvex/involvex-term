# Explorer command (Win11 modern menu)

Sparse-package shell extension so **Open in involvex-term** appears in the
Windows 11 top-level Explorer context menu (not only under “Show more options”).

## Build (Windows + VS Build Tools + Windows SDK)

```powershell
bun scripts/build-explorer-command.mjs
```

Outputs under `native/explorer-command/out/`:

- `InvolvexTermExplorerCommand.dll`
- `InvolvexTermExplorerCommand.msix` (unsigned sparse package)
- `AppxManifest.xml` + `Assets/`

Optional signing: set `INVOLVEX_SIGN_PFX` (+ `INVOLVEX_SIGN_PASSWORD`) before the
script runs `signtool`.

## Install

Classic HKCU verbs remain the default. Modern registration:

```powershell
Add-AppxPackage -Path InvolvexTermExplorerCommand.msix -ExternalLocation <install-dir>
```

Unsigned packages need Developer Mode (or a trusted cert). The CLI
`involvex-term context-menu install` attempts modern registration and always
installs classic as fallback.
