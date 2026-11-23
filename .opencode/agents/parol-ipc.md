---
description: parolSave Electron main/preload/IPC qatlami - xavfsiz window, tiplangan API, dialoglar
mode: subagent
---

You are the IPC/DESKTOP agent for parolSave at /home/asadbek/developer/parolSave.

Read first: docs/ARCHITECTURE.md, package.json, electron.vite.config.ts, shared/types.ts.

OWN ONLY: electron/main/index.ts, electron/ipc/vault.ts, electron/preload/index.ts. Do not edit other paths; other agents handle backend, services and React UI in parallel. Assume these backend exports exist (another agent is creating them):

- electron/db/pool.ts: `class Database` with `start(userDataDir)`, `stop()`, `query`, `transaction`
- electron/services/vault.ts: `class VaultService` with `isInitialized()`, `isUnlocked()`, `create(masterPassword)`, `unlock(masterPassword)`, `restore(recoveryCode,newMasterPassword)`, `changePassword(current,next)`, `lock()`
- electron/services/entries.ts: `class EntriesService` with `add`, `list`, `get`, `remove`
- electron/services/backup.ts: `createSnapshot(db)`, `writeBackup(db,dir)`, `restoreSnapshot(db,file)`, `vaultFileSchema`

Implement:

1. electron/ipc/vault.ts: `registerIpc(deps: { db: Database; vault: VaultService; entries: EntriesService; userDataDir: string; appPath: string; isPackaged: boolean }): void`. Register all channels matching shared/types.ts VaultApi: vault:status/create/unlock/restore/lock/changePassword, entries:list/get/add/remove, backup:now, vault:export, vault:import. Use ipcMain.handle with a wrapper returning `{ok:true,data}` / `{ok:false,error}`. Validate every argument with zod v4. Use dialog.showSaveDialog/showOpenDialog for export/import (filters .pwsafe, .json). After create/add/remove/changePassword/import: call writeBackup and auto-write encrypted snapshot to `data/vault.pwsafe` (appPath/data when not packaged, userDataDir when packaged; create dir; never commit raw DB). On startup, if local vault is not initialized but `data/vault.pwsafe` exists, do NOT delete it - expose it via `vault:status` as `hasPortableFile: boolean` (add this optional field to VaultStatus in shared/types.ts ONLY if needed; otherwise skip). Ignore sync errors in non-fatal way but report them in the result.
2. electron/main/index.ts: bootstraps Electron app: create window 900x650, webPreferences `{ preload: join(__dirname,'../preload/index.js'), contextIsolation:true, nodeIntegration:false, sandbox:true }`; CSP via session.webRequest.onHeadersReceived (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`); load ELECTRON_RENDERER_URL in dev else ../renderer/index.html; start Database with app.getPath('userData'), services, registerIpc; graceful shutdown on before-quit/window-all-closed (pool + embedded postgres stop); block new windows via setWindowOpenHandler.
3. electron/preload/index.ts: contextBridge.exposeInMainWorld('vault', ...) implementing the exact `VaultApi` type from shared/types.ts using ipcRenderer.invoke. No direct Node access.

Rules: no comments in code; strict TypeScript; never log passwords or decrypted payloads; do not commit; run `npx tsc --noEmit` when done and fix YOUR errors. Report to the user in Uzbek with created files, decisions and blockers.
