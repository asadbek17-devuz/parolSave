import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { z } from 'zod'
import type { Result, VaultStatus } from '../../shared/types'
import type { Database } from '../db/pool'
import { createSnapshot, restoreSnapshot, vaultFileSchema, writeBackup } from '../services/backup'
import type { EntriesService } from '../services/entries'
import type { VaultService } from '../services/vault'

export type IpcDeps = {
  db: Database
  vault: VaultService
  entries: EntriesService
  userDataDir: string
  appPath: string
  isPackaged: boolean
}

type IpcResult<T> = Result<T> & { warning?: string }
type Outcome<T> = { data: T; warning?: string }

const noArgs = z.tuple([])
const password = z.string().min(1)
const id = z.uuid()
const shortText = z.string().min(1).max(500)
const createArgs = z.tuple([password])
const restoreArgs = z.tuple([password, password])
const passwordArgs = z.tuple([password, password])
const idArgs = z.tuple([id])
const entryInputArgs = z.tuple([
  z.object({
    category: shortText,
    name: shortText,
    password,
  }),
])

const fileFilters = [
  { name: 'parolSave (.pwsafe)', extensions: ['pwsafe'] },
  { name: 'JSON (.json)', extensions: ['json'] },
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function portableDir(deps: IpcDeps): string {
  return deps.isPackaged ? deps.userDataDir : join(deps.appPath, 'data')
}

function portableFile(deps: IpcDeps): string {
  return join(portableDir(deps), 'vault.pwsafe')
}

function backupsDir(deps: IpcDeps): string {
  return deps.isPackaged ? join(deps.userDataDir, 'backups') : join(deps.appPath, 'backups')
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function writePortableFile(deps: IpcDeps): Promise<void> {
  const dir = portableDir(deps)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const snapshot = await createSnapshot(deps.db)
  const target = portableFile(deps)
  const temporary = `${target}.tmp`
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, target)
}

async function syncSnapshot(deps: IpcDeps): Promise<string | undefined> {
  try {
    await writeBackup(deps.db, backupsDir(deps))
    await writePortableFile(deps)
    return undefined
  } catch (error) {
    const warning = `Zaxira yoki ko'chma fayl yozilmadi: ${errorMessage(error)}`
    console.error(warning)
    return warning
  }
}

async function withSync<T>(deps: IpcDeps, data: T): Promise<Outcome<T>> {
  const warning = await syncSnapshot(deps)
  return { data, warning }
}

function register<TArgs extends unknown[], TData>(
  deps: IpcDeps,
  channel: string,
  parse: (raw: unknown[]) => TArgs,
  run: (args: TArgs, deps: IpcDeps) => Promise<Outcome<TData>>,
): void {
  ipcMain.handle(channel, async (_event, ...raw: unknown[]): Promise<IpcResult<TData>> => {
    try {
      const args = parse(raw)
      const outcome = await run(args, deps)
      return outcome.warning
        ? { ok: true, data: outcome.data, warning: outcome.warning }
        : { ok: true, data: outcome.data }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  })
}

export function registerIpc(deps: IpcDeps): void {
  register(
    deps,
    'vault:status',
    (raw) => noArgs.parse(raw),
    async (_args, d) => {
      const status: VaultStatus = {
        initialized: await d.vault.isInitialized(),
        unlocked: d.vault.isUnlocked(),
        hasPortableFile: await fileExists(portableFile(d)),
      }
      return { data: status }
    },
  )

  register(
    deps,
    'vault:create',
    (raw) => createArgs.parse(raw),
    async ([masterPassword], d) => {
      const { recoveryCode } = await d.vault.create(masterPassword)
      return withSync(d, { recoveryCode })
    },
  )

  register(
    deps,
    'vault:unlock',
    (raw) => createArgs.parse(raw),
    async ([masterPassword], d) => {
      await d.vault.unlock(masterPassword)
      return { data: true as const }
    },
  )

  register(
    deps,
    'vault:restore',
    (raw) => restoreArgs.parse(raw),
    async ([recoveryCode, newMasterPassword], d) => {
      await d.vault.restore(recoveryCode, newMasterPassword)
      return withSync(d, true as const)
    },
  )

  register(
    deps,
    'vault:lock',
    (raw) => noArgs.parse(raw),
    async (_args, d) => {
      d.vault.lock()
      return { data: true as const }
    },
  )

  register(
    deps,
    'vault:changePassword',
    (raw) => passwordArgs.parse(raw),
    async ([currentPassword, newPassword], d) => {
      await d.vault.changePassword(currentPassword, newPassword)
      return withSync(d, true as const)
    },
  )

  register(
    deps,
    'entries:list',
    (raw) => noArgs.parse(raw),
    async (_args, d) => ({ data: await d.entries.list() }),
  )

  register(
    deps,
    'entries:get',
    (raw) => idArgs.parse(raw),
    async ([entryId], d) => ({ data: await d.entries.get(entryId) }),
  )

  register(
    deps,
    'entries:add',
    (raw) => entryInputArgs.parse(raw),
    async ([input], d) => withSync(d, await d.entries.add(input)),
  )

  register(
    deps,
    'entries:remove',
    (raw) => idArgs.parse(raw),
    async ([entryId], d) => {
      await d.entries.remove(entryId)
      return withSync(d, true as const)
    },
  )

  register(
    deps,
    'backup:now',
    (raw) => noArgs.parse(raw),
    async (_args, d) => ({ data: await writeBackup(d.db, backupsDir(d)) }),
  )

  register(
    deps,
    'vault:export',
    (raw) => noArgs.parse(raw),
    async (_args, d) => {
      const selection = await dialog.showSaveDialog({
        title: 'Vaultni eksport qilish',
        defaultPath: portableFile(d),
        filters: fileFilters,
      })
      if (selection.canceled || !selection.filePath) {
        throw new Error('Eksport bekor qilindi')
      }
      const snapshot = await createSnapshot(d.db)
      await writeFile(selection.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
      return { data: selection.filePath }
    },
  )

  register(
    deps,
    'vault:import',
    (raw) => noArgs.parse(raw),
    async (_args, d) => {
      const selection = await dialog.showOpenDialog({
        title: 'Vaultni import qilish',
        properties: ['openFile'],
        filters: fileFilters,
      })
      if (selection.canceled || selection.filePaths.length === 0) {
        throw new Error('Import bekor qilindi')
      }
      const file = vaultFileSchema.parse(JSON.parse(await readFile(selection.filePaths[0]!, 'utf8')) as unknown)
      let preBackupWarning: string | undefined
      try {
        await writeBackup(d.db, backupsDir(d))
      } catch (error) {
        preBackupWarning = `Oldingi holat zaxirasi yozilmadi: ${errorMessage(error)}`
      }
      d.vault.lock()
      const count = await restoreSnapshot(d.db, file)
      const syncWarning = await syncSnapshot(d)
      const warning = [preBackupWarning, syncWarning].filter(Boolean).join('; ')
      return { data: count, warning: warning || undefined }
    },
  )

  register(
    deps,
    'vault:importPortable',
    (raw) => noArgs.parse(raw),
    async (_args, d) => {
      const filePath = portableFile(d)
      if (!(await fileExists(filePath))) {
        throw new Error("Ko'chma vault fayli topilmadi")
      }
      const file = vaultFileSchema.parse(JSON.parse(await readFile(filePath, 'utf8')) as unknown)
      let preBackupWarning: string | undefined
      try {
        await writeBackup(d.db, backupsDir(d))
      } catch (error) {
        preBackupWarning = `Oldingi holat zaxirasi yozilmadi: ${errorMessage(error)}`
      }
      d.vault.lock()
      const count = await restoreSnapshot(d.db, file)
      const syncWarning = await syncSnapshot(d)
      const warning = [preBackupWarning, syncWarning].filter(Boolean).join('; ')
      return { data: count, warning: warning || undefined }
    },
  )
}
