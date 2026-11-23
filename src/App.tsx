import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EntrySummary, VaultStatus } from '../shared/types'
import { messageOf, unwrap } from './api'
import AddEntry from './components/AddEntry'
import BackupPanel from './components/BackupPanel'
import CategoryTabs from './components/CategoryTabs'
import CreateVault from './components/CreateVault'
import EntryDetail from './components/EntryDetail'
import EntryList from './components/EntryList'
import RecoveryScreen from './components/RecoveryScreen'
import UnlockScreen from './components/UnlockScreen'

type BannerKind = 'error' | 'info' | 'success' | 'warning'
type Banner = { kind: BannerKind; text: string }

const ALL = 'Barchasi'

export default function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [booting, setBooting] = useState(true)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [entries, setEntries] = useState<EntrySummary[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [category, setCategory] = useState(ALL)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [skipRestore, setSkipRestore] = useState(false)
  const [importing, setImporting] = useState(false)

  const notify = useCallback((kind: BannerKind, text: string) => {
    setBanner({ kind, text })
  }, [])

  const reportError = useCallback((message: string) => {
    setBanner({ kind: 'error', text: message })
  }, [])

  const reportNotice = useCallback((message: string) => {
    setBanner({ kind: 'warning', text: message })
  }, [])

  const loadStatus = useCallback(async (): Promise<VaultStatus | null> => {
    try {
      const next = await unwrap(window.vault.status())
      setStatus(next)
      return next
    } catch (error) {
      reportError(messageOf(error))
      setStatus(null)
      return null
    }
  }, [reportError])

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true)
    try {
      const list = await unwrap(window.vault.entries.list())
      setEntries(list)
      setSelectedId((current) => (current && list.some((item) => item.id === current) ? current : null))
    } catch (error) {
      reportError(messageOf(error))
    } finally {
      setEntriesLoading(false)
    }
  }, [reportError])

  useEffect(() => {
    let active = true
    async function boot() {
      try {
        const next = await unwrap(window.vault.status())
        if (active) setStatus(next)
      } catch (error) {
        if (active) reportError(messageOf(error))
      } finally {
        if (active) setBooting(false)
      }
    }
    void boot()
    return () => {
      active = false
    }
  }, [reportError])

  useEffect(() => {
    if (status?.unlocked) {
      void loadEntries()
    } else {
      setEntries([])
      setSelectedId(null)
      setCategory(ALL)
    }
  }, [status?.unlocked, loadEntries])

  const categories = useMemo(() => {
    const names = new Set(entries.map((entry) => entry.category))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [entries])

  const visibleEntries = useMemo(
    () => (category === ALL ? entries : entries.filter((entry) => entry.category === category)),
    [entries, category],
  )

  async function handleLock() {
    try {
      await unwrap(window.vault.lock())
      await loadStatus()
      notify('info', 'Vault qulflandi.')
    } catch (error) {
      reportError(messageOf(error))
    }
  }

  async function handleUnlocked() {
    setShowRecovery(false)
    await loadStatus()
  }

  async function handleCreated() {
    await loadStatus()
    notify('success', 'Vault yaratildi va ochildi.')
  }

  async function handleRestored() {
    const next = await loadStatus()
    setShowRecovery(false)
    if (next && !next.unlocked) {
      notify('info', 'Tiklash tugallandi. Yangi master parol bilan oching.')
    } else {
      notify('success', 'Vault tiklandi.')
    }
  }

  async function handleImported() {
    const next = await loadStatus()
    if (next?.unlocked) {
      await loadEntries()
    } else {
      notify('info', 'Import tugallandi. Master parol bilan qayta oching.')
    }
  }

  async function handlePortableImport() {
    setImporting(true)
    try {
      const count = await unwrap(window.vault.importPortable(), reportNotice)
      const next = await loadStatus()
      if (next?.unlocked) {
        await loadEntries()
        notify('success', `${count} yozuv ko'chma nusxadan tiklandi.`)
      } else {
        notify('success', `${count} yozuv tiklandi. Master parol bilan oching.`)
      }
    } catch (error) {
      reportError(messageOf(error))
    } finally {
      setImporting(false)
    }
  }

  if (booting) {
    return (
      <div className="boot">
        <p className="muted">Yuklanmoqda...</p>
      </div>
    )
  }

  return (
    <div className="app">
      {banner && (
        <div className={`banner banner--${banner.kind}`} role="alert">
          <span>{banner.text}</span>
          <button
            type="button"
            className="banner__close"
            aria-label="Xabarni yopish"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      {!status ? (
        <div className="auth">
          <section className="auth__card">
            <h1 className="auth__title">Holat olinmadi</h1>
            <p className="muted">Vault holatini yuklashda xatolik yuz berdi.</p>
            <button type="button" className="button button--primary" onClick={() => void loadStatus()}>
              Qayta urinish
            </button>
          </section>
        </div>
      ) : !status.initialized ? (
        status.hasPortableFile && !skipRestore ? (
          <div className="auth">
            <section className="auth__card">
              <h1 className="auth__title">Ko'chma nusxa topildi</h1>
              <p className="auth__subtitle">
                <code>data/vault.pwsafe</code> fayli topildi. Undagi yozuvlarni tiklashni
                xohlaysizmi? Import qilish barcha mavjud yozuvlarni shu fayldagi yozuvlar bilan
                almashtiradi.
              </p>
              <button
                type="button"
                className="button button--primary button--full"
                disabled={importing}
                onClick={() => void handlePortableImport()}
              >
                {importing ? 'Import qilinmoqda...' : 'Import qilish'}
              </button>
              <button
                type="button"
                className="button button--secondary button--full"
                disabled={importing}
                onClick={() => setSkipRestore(true)}
              >
                Yangi vault yaratish
              </button>
            </section>
          </div>
        ) : (
          <CreateVault onCreated={handleCreated} onError={reportError} onNotice={reportNotice} />
        )
      ) : !status.unlocked ? (
        showRecovery ? (
          <RecoveryScreen
            onRestored={handleRestored}
            onBack={() => setShowRecovery(false)}
            onError={reportError}
            onNotice={reportNotice}
          />
        ) : (
          <UnlockScreen
            onUnlocked={handleUnlocked}
            onLock={handleLock}
            onRecovery={() => setShowRecovery(true)}
            onError={reportError}
          />
        )
      ) : (
        <main className="main">
          <header className="app__header">
            <span className="brand">parolSave</span>
            <div className="header__right">
              <span className="header__status">Vault ochilgan</span>
              <button type="button" className="button button--ghost" onClick={() => void handleLock()}>
                Qulflash
              </button>
            </div>
          </header>

          {status.hasPortableFile && <div className="notice">Ko'chma nusxa (vault.pwsafe) topildi.</div>}

          <div className="workspace">
            <section className="panel panel--list">
              <CategoryTabs categories={categories} active={category} onChange={setCategory} />
              <EntryList
                entries={visibleEntries}
                selectedId={selectedId}
                loading={entriesLoading}
                onSelect={setSelectedId}
              />
            </section>
            <section className="panel panel--detail">
              <EntryDetail
                entryId={selectedId}
                onError={reportError}
                onNotice={reportNotice}
                onDeleted={() => {
                  setSelectedId(null)
                  void loadEntries()
                }}
              />
            </section>
          </div>

          <div className="bottom">
            <AddEntry
              categories={categories}
              onError={reportError}
              onNotice={reportNotice}
              onAdded={loadEntries}
            />
            <BackupPanel onError={reportError} onNotice={reportNotice} onImported={handleImported} />
          </div>
        </main>
      )}
    </div>
  )
}
