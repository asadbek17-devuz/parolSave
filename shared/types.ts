export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type VaultStatus = {
  initialized: boolean
  unlocked: boolean
  hasPortableFile?: boolean
}

export type EntryInput = {
  category: string
  name: string
  password: string
}

export type EntrySummary = {
  id: string
  category: string
  name: string
  createdAt: string
}

export type EntryDetail = EntrySummary & {
  password: string
}

export type VaultApi = {
  status(): Promise<Result<VaultStatus>>
  create(masterPassword: string): Promise<Result<{ recoveryCode: string }>>
  unlock(masterPassword: string): Promise<Result<true>>
  restore(recoveryCode: string, newMasterPassword: string): Promise<Result<true>>
  lock(): Promise<Result<true>>
  changePassword(currentPassword: string, newPassword: string): Promise<Result<true>>
  entries: {
    list(): Promise<Result<EntrySummary[]>>
    get(id: string): Promise<Result<EntryDetail>>
    add(input: EntryInput): Promise<Result<string>>
    remove(id: string): Promise<Result<true>>
  }
  backupNow(): Promise<Result<string>>
  exportVault(): Promise<Result<string>>
  importVault(): Promise<Result<number>>
  importPortable(): Promise<Result<number>>
}

declare global {
  interface Window {
    vault: VaultApi
  }
}
