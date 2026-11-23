import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { Database } from '../db/pool'

export const vaultFileSchema = z.object({
  format: z.literal('pwsafe'),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  meta: z.record(z.string(), z.string()),
  entries: z.array(
    z.object({
      id: z.uuid(),
      payload: z.base64(),
      createdAt: z.iso.datetime(),
    }),
  ),
})

export type VaultFile = z.infer<typeof vaultFileSchema>

type MetaRow = { key: string; value: string }
type EntryRow = { id: string; payload: Buffer; created_at: Date | string }

const BACKUP_LIMIT = 10
const BACKUP_NAME = /^vault-\d{8}-\d{6}(?:-\d+)?\.json$/

function toIso(value: Date | string): string {
  return new Date(value).toISOString()
}

function fileStamp(date: Date): string {
  const iso = date.toISOString()
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`
}

async function pruneBackups(dir: string): Promise<void> {
  const names = (await readdir(dir)).filter((name) => BACKUP_NAME.test(name))
  const files = await Promise.all(
    names.map(async (name) => ({ name, modified: (await stat(join(dir, name))).mtimeMs })),
  )
  files.sort((a, b) => b.modified - a.modified)
  await Promise.all(
    files.slice(BACKUP_LIMIT).map((file) => unlink(join(dir, file.name)).catch(() => undefined)),
  )
}

export async function createSnapshot(db: Database): Promise<VaultFile> {
  const [metaResult, entriesResult] = await Promise.all([
    db.query<MetaRow>('SELECT key, value FROM meta ORDER BY key'),
    db.query<EntryRow>('SELECT id, payload, created_at FROM entries ORDER BY created_at DESC, id DESC'),
  ])

  return vaultFileSchema.parse({
    format: 'pwsafe',
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: Object.fromEntries(metaResult.rows.map((row) => [row.key, row.value])),
    entries: entriesResult.rows.map((row) => ({
      id: row.id,
      payload: Buffer.from(row.payload).toString('base64'),
      createdAt: toIso(row.created_at),
    })),
  })
}

export async function writeBackup(db: Database, backupsDir: string): Promise<string> {
  const snapshot = await createSnapshot(db)
  const dir = resolve(backupsDir)
  await mkdir(dir, { recursive: true, mode: 0o700 })

  const stamp = fileStamp(new Date())
  let filePath = join(dir, `vault-${stamp}.json`)
  for (let attempt = 1; ; attempt += 1) {
    try {
      await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      filePath = join(dir, `vault-${stamp}-${attempt}.json`)
    }
  }

  await pruneBackups(dir)
  return filePath
}

export async function restoreSnapshot(db: Database, file: VaultFile): Promise<number> {
  const snapshot = vaultFileSchema.parse(file)
  await db.transaction(async (client) => {
    await client.query('DELETE FROM entries')
    await client.query('DELETE FROM meta')
    for (const [key, value] of Object.entries(snapshot.meta)) {
      await client.query('INSERT INTO meta (key, value) VALUES ($1, $2)', [key, value])
    }
    for (const entry of snapshot.entries) {
      await client.query('INSERT INTO entries (id, payload, created_at) VALUES ($1, $2, $3)', [
        entry.id,
        Buffer.from(entry.payload, 'base64'),
        new Date(entry.createdAt),
      ])
    }
  })
  return snapshot.entries.length
}
