import { contextBridge, ipcRenderer } from 'electron'
import type { EntryDetail, EntryInput, EntrySummary, Result, VaultApi, VaultStatus } from '../../shared/types'

type VaultResult<T> = Result<T> & { warning?: string }

function invoke<T>(channel: string, ...args: unknown[]): Promise<VaultResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<VaultResult<T>>
}

const api: VaultApi = {
  status: () => invoke<VaultStatus>('vault:status'),
  create: (masterPassword) => invoke<{ recoveryCode: string }>('vault:create', masterPassword),
  unlock: (masterPassword) => invoke<true>('vault:unlock', masterPassword),
  restore: (recoveryCode, newMasterPassword) => invoke<true>('vault:restore', recoveryCode, newMasterPassword),
  lock: () => invoke<true>('vault:lock'),
  changePassword: (currentPassword, newPassword) =>
    invoke<true>('vault:changePassword', currentPassword, newPassword),
  entries: {
    list: () => invoke<EntrySummary[]>('entries:list'),
    get: (id) => invoke<EntryDetail>('entries:get', id),
    add: (input: EntryInput) => invoke<string>('entries:add', input),
    remove: (id) => invoke<true>('entries:remove', id),
  },
  backupNow: () => invoke<string>('backup:now'),
  exportVault: () => invoke<string>('vault:export'),
  importVault: () => invoke<number>('vault:import'),
  importPortable: () => invoke<number>('vault:importPortable'),
}

contextBridge.exposeInMainWorld('vault', api)
