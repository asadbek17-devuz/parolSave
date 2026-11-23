import { randomBytes } from 'node:crypto'
import type * as pg from 'pg'
import { decrypt, encrypt } from '../crypto/aes'
import { deriveKey, KDF_PARAMS, newSalt } from '../crypto/kdf'
import type { Database } from '../db/pool'

const META = {
  kdfParams: 'kdf_params',
  salt: 'salt',
  wrappedDek: 'wrapped_dek',
  recoverySalt: 'recovery_salt',
  wrappedDekRecovery: 'wrapped_dek_recovery',
} as const

const DEK_LENGTH = 32
const RECOVERY_CODE_BYTES = 24
const MIN_MASTER_PASSWORD_LENGTH = 8

function assertMasterPassword(password: string, label = 'Master password'): void {
  if (!password) {
    throw new Error(`${label} is required`)
  }
  if (password.length < MIN_MASTER_PASSWORD_LENGTH) {
    throw new Error(`${label} must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters long`)
  }
}

export class VaultService {
  private dek?: Buffer

  constructor(private readonly db: Database) {}

  async isInitialized(): Promise<boolean> {
    const result = await this.db.query<{ key: string }>('SELECT key FROM meta WHERE key = ANY($1::text[])', [
      Object.values(META),
    ])
    const keys = new Set(result.rows.map((row) => row.key))
    return (
      keys.has(META.salt) &&
      keys.has(META.wrappedDek) &&
      keys.has(META.recoverySalt) &&
      keys.has(META.wrappedDekRecovery)
    )
  }

  isUnlocked(): boolean {
    return this.dek !== undefined
  }

  async create(masterPassword: string): Promise<{ recoveryCode: string }> {
    assertMasterPassword(masterPassword)
    if (await this.isInitialized()) {
      throw new Error('Vault is already initialized')
    }

    const salt = newSalt()
    const recoverySalt = newSalt()
    const recoveryCode = randomBytes(RECOVERY_CODE_BYTES).toString('hex')
    const dek = randomBytes(DEK_LENGTH)
    const kek = await deriveKey(masterPassword, salt)
    let recoveryKek: Buffer | undefined
    let committed = false

    try {
      recoveryKek = await deriveKey(recoveryCode, recoverySalt)
      const wrappedDek = encrypt(kek, dek)
      const wrappedDekRecovery = encrypt(recoveryKek, dek)
      await this.db.transaction(async (client) => {
        await this.writeMeta(client, {
          [META.kdfParams]: JSON.stringify(KDF_PARAMS),
          [META.salt]: salt.toString('base64'),
          [META.wrappedDek]: wrappedDek.toString('base64'),
          [META.recoverySalt]: recoverySalt.toString('base64'),
          [META.wrappedDekRecovery]: wrappedDekRecovery.toString('base64'),
        })
      })
      committed = true
      this.replaceDek(dek)
      return { recoveryCode }
    } finally {
      kek.fill(0)
      recoveryKek?.fill(0)
      if (!committed) {
        dek.fill(0)
      }
    }
  }

  async unlock(masterPassword: string): Promise<void> {
    if (!(await this.isInitialized())) {
      throw new Error('Vault is not initialized')
    }
    const dek = await this.unwrapDek(masterPassword, META.salt, META.wrappedDek, 'Invalid master password')
    this.replaceDek(dek)
  }

  async restore(recoveryCode: string, newMasterPassword: string): Promise<void> {
    assertMasterPassword(newMasterPassword)
    const dek = await this.unwrapDek(
      recoveryCode,
      META.recoverySalt,
      META.wrappedDekRecovery,
      'Invalid recovery code',
    )
    const salt = newSalt()
    const kek = await deriveKey(newMasterPassword, salt)
    let committed = false

    try {
      const wrappedDek = encrypt(kek, dek)
      await this.db.transaction(async (client) => {
        await this.writeMeta(client, {
          [META.kdfParams]: JSON.stringify(KDF_PARAMS),
          [META.salt]: salt.toString('base64'),
          [META.wrappedDek]: wrappedDek.toString('base64'),
        })
      })
      committed = true
      this.replaceDek(dek)
    } finally {
      kek.fill(0)
      if (!committed) {
        dek.fill(0)
      }
    }
  }

  async changePassword(current: string, next: string): Promise<void> {
    assertMasterPassword(next, 'New master password')
    const dek = await this.unwrapDek(current, META.salt, META.wrappedDek, 'Invalid current password')
    const salt = newSalt()
    const nextKek = await deriveKey(next, salt)
    let committed = false

    try {
      const wrappedDek = encrypt(nextKek, dek)
      await this.db.transaction(async (client) => {
        await this.writeMeta(client, {
          [META.kdfParams]: JSON.stringify(KDF_PARAMS),
          [META.salt]: salt.toString('base64'),
          [META.wrappedDek]: wrappedDek.toString('base64'),
        })
      })
      committed = true
      this.replaceDek(dek)
    } finally {
      nextKek.fill(0)
      if (!committed) {
        dek.fill(0)
      }
    }
  }

  lock(): void {
    this.dek?.fill(0)
    this.dek = undefined
  }

  requireDek(): Buffer {
    if (!this.dek) {
      throw new Error('Vault is locked')
    }
    return this.dek
  }

  private async unwrapDek(
    password: string,
    saltKey: string,
    wrappedKey: string,
    errorMessage: string,
  ): Promise<Buffer> {
    const kek = await this.deriveStoredKey(password, saltKey)
    try {
      return await this.decryptWrapped(kek, wrappedKey, errorMessage)
    } finally {
      kek.fill(0)
    }
  }

  private async deriveStoredKey(password: string, saltKey: string): Promise<Buffer> {
    const encodedSalt = await this.readMetaValue(saltKey)
    return deriveKey(password, Buffer.from(encodedSalt, 'base64'))
  }

  private async decryptWrapped(kek: Buffer, wrappedKey: string, errorMessage: string): Promise<Buffer> {
    const encoded = await this.readMetaValue(wrappedKey)
    let dek: Buffer
    try {
      dek = decrypt(kek, Buffer.from(encoded, 'base64'))
    } catch {
      throw new Error(errorMessage)
    }
    if (dek.length !== DEK_LENGTH) {
      dek.fill(0)
      throw new Error(errorMessage)
    }
    return dek
  }

  private async readMetaValue(key: string): Promise<string> {
    const result = await this.db.query<{ value: string }>('SELECT value FROM meta WHERE key = $1', [key])
    const row = result.rows[0]
    if (!row) {
      throw new Error(`Missing meta key: ${key}`)
    }
    return row.value
  }

  private async writeMeta(client: pg.PoolClient, values: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      await client.query(
        `INSERT INTO meta (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value],
      )
    }
  }

  private replaceDek(dek: Buffer): void {
    this.dek?.fill(0)
    this.dek = dek
  }
}
