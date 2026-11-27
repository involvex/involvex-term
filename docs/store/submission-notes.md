# Partner Center — Involvex Term

Product: **Involvex Term** · Store ID **`9NBNBH9CJ507`**  
Package identity: `Einzelunternehmen.InvolvexTerm`  
Publisher: `CN=50777D18-6AA9-43B0-9CE5-BB776BC9514F`  
PublisherDisplayName: `involvex`  
PFN: `Einzelunternehmen.InvolvexTerm_nk2dxr82q950t`

**Live listing:** https://apps.microsoft.com/detail/9NBNBH9CJ507  
Share link: https://apps.microsoft.com/store/detail/9NBNBH9CJ507?cid=DevShareMCLPCS  
Protocol: `ms-windows-store://pdp/?productid=9NBNBH9CJ507`  
Badge: `ms-store-badge` productid `9NBNBH9CJ507` (see `docs/STORE.md` / Pages)

Dashboard: https://partner.microsoft.com/dashboard/products/9NBNBH9CJ507/submissions

## Status

**Published** (Submission 1, 2026-11-27). Pre-processing and certification
passed; the product is available in the Microsoft Store.

## Updates

```powershell
bun run build:store
bun run publish:store   # draft (--noCommit); then Partner Center or commit:store
```

## `runFullTrust` justification (kept for future submissions)

Involvex Term is a desktop terminal emulator (Electron + ConPTY/node-pty), not a
sandboxed UWP app. `runFullTrust` is required for the product’s core function:
hosting interactive developer shells with the same trust and filesystem access
as a normal Win32 terminal (Windows Terminal, ConEmu, etc.).

Concrete uses:

1. Spawn and host user shells via ConPTY — PowerShell 7, Windows PowerShell,
   cmd.exe, and WSL.
2. Access the real filesystem as the signed-in user (not only WindowsApps).
3. Run developer CLIs the user installs (git, node, bun, compilers, …).
4. Optional desktop APIs — process list, system tray, `http(s)` / `mailto`
   via the shell API.

We do not use `runFullTrust` for kernel drivers, services, or elevating to
Administrator by default.
