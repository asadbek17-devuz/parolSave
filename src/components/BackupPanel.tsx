import { useState } from 'react'
import { messageOf, unwrap } from '../api'

type Props = {
  onImported: () => void | Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
}

export default function BackupPanel({ onImported, onError, onNotice }: Props) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'backup' | 'export' | 'import' | null>(null)

  function reportError(error: unknown) {
    onError(messageOf(error))
  }

  async function handleBackup() {
    setMessage('')
    setBusy('backup')
    try {
      const path = await unwrap(window.vault.backupNow(), onNotice)
      setMessage(`Backup yaratildi: ${path}`)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(null)
    }
  }

  async function handleExport() {
    setMessage('')
    setBusy('export')
    try {
      const path = await unwrap(window.vault.exportVault(), onNotice)
      setMessage(`Eksport tugallandi: ${path}`)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(null)
    }
  }

  async function handleImport() {
    if (!window.confirm("Import qilish barcha mavjud yozuvlarni almashtiradi. Davom etilsinmi?")) return
    setMessage('')
    setBusy('import')
    try {
      const count = await unwrap(window.vault.importVault(), onNotice)
      setMessage(`${count} yozuv import qilindi.`)
      await onImported()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Zaxira va ko'chirish</h2>
      <div className="backup__buttons">
        <button type="button" className="button button--secondary" disabled={busy !== null} onClick={() => void handleBackup()}>
          {busy === 'backup' ? 'Bajarilmoqda...' : 'Backup olish'}
        </button>
        <button type="button" className="button button--secondary" disabled={busy !== null} onClick={() => void handleExport()}>
          {busy === 'export' ? 'Bajarilmoqda...' : 'Eksport (.pwsafe)'}
        </button>
        <button type="button" className="button button--secondary" disabled={busy !== null} onClick={() => void handleImport()}>
          {busy === 'import' ? 'Bajarilmoqda...' : 'Import'}
        </button>
      </div>
      {message && <p className="status-message">{message}</p>}
      <p className="panel__hint">Import oldidan mavjud holat avtomatik zaxiralanadi.</p>
    </section>
  )
}
