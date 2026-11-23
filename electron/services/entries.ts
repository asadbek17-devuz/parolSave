import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { EntryDetail, EntryInput, EntrySummary } from '../../shared/types'
import { decrypt, encrypt } from '../crypto/aes'
import type { Database } from '../db/pool'
import type { VaultService } from './vault'

const payloadSchema = z.object({
  category: z.string(),
  name: z.string(),
  password: z.string(),
})

type EntryRow = {
  id: string
  payload: Buffer
  created_at: Date | string
}

type EntryPayload = z.infer<typeof payloadSchema>

function decodePayload(vault: VaultService, payload: Buffer): EntryPayload {
  const plain = decrypt(vault.requireDek(), payload)
  return payloadSchema.parse(JSON.parse(plain.toString('utf8')) as unknown)
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString()
}

function assertValidId(id: string): void {
  if (!z.uuid().safeParse(id).success) {
    throw new Error('Invalid entry id')
  }
}

export class EntriesService {
  constructor(
    private readonly db: Database,
    private readonly vault: VaultService,
  ) {}

  async add(input: EntryInput): Promise<string> {
    const id = randomUUID()
    const plain = Buffer.from(
      JSON.stringify({ category: input.category, name: input.name, password: input.password }),
      'utf8',
    )
    const payload = encrypt(this.vault.requireDek(), plain)
    await this.db.query('INSERT INTO entries (id, payload) VALUES ($1, $2)', [id, payload])
    return id
  }

  async list(): Promise<EntrySummary[]> {
    const result = await this.db.query<EntryRow>(
      'SELECT id, payload, created_at FROM entries ORDER BY created_at DESC, id DESC',
    )
    return result.rows.map((row) => {
      const { category, name } = decodePayload(this.vault, row.payload)
      return { id: row.id, category, name, createdAt: toIso(row.created_at) }
    })
  }

  async get(id: string): Promise<EntryDetail> {
    assertValidId(id)
    const result = await this.db.query<EntryRow>('SELECT id, payload, created_at FROM entries WHERE id = $1', [id])
    const row = result.rows[0]
    if (!row) {
      throw new Error('Entry not found')
    }
    const payload = decodePayload(this.vault, row.payload)
    return {
      id: row.id,
      category: payload.category,
      name: payload.name,
      password: payload.password,
      createdAt: toIso(row.created_at),
    }
  }

  async remove(id: string): Promise<void> {
    assertValidId(id)
    const result = await this.db.query('DELETE FROM entries WHERE id = $1', [id])
    if (result.rowCount === 0) {
      throw new Error('Entry not found')
    }
  }
}
