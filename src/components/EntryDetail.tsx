import { useEffect, useRef, useState } from 'react'
import type { EntryDetail as EntryDetailData } from '../../shared/types'
import { messageOf, unwrap, writeClipboard } from '../api'

type Props = {
  entryId: string | null
  onDeleted: () => void | Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
}

const REVEAL_MS = 15_000
const CLIPBOARD_MS = 30_000
const MASK = '••••••••'

export default function EntryDetail({ entryId, onDeleted, onError, onNotice }: Props) {
  const [entry, setEntry] = useState<EntryDetailData | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const revealTimer = useRef<number | null>(null)
  const clipboardTimer = useRef<number | null>(null)
  const clipboardArmed = useRef(false)

  function stopRevealTimer() {
    if (revealTimer.current !== null) {
      window.clearTimeout(revealTimer.current)
      revealTimer.current = null
    }
  }

  function stopClipboardTimer() {
    if (clipboardTimer.current !== null) {
      window.clearTimeout(clipboardTimer.current)
      clipboardTimer.current = null
    }
  }

  async function wipeClipboard() {
    stopClipboardTimer()
    const armed = clipboardArmed.current
    clipboardArmed.current = false
    setCopied(false)
    if (!armed) return
    try {
      await writeClipboard('')
    } catch (error) {
      onError(messageOf(error))
    }
  }

  useEffect(() => {
    let active = true
    setEntry(null)
    setRevealed(false)
    setCopied(false)
    stopRevealTimer()
    if (!entryId) {
      return
    }
    const id = entryId

    async function load() {
      try {
        const data = await unwrap(window.vault.entries.get(id))
        if (active) setEntry(data)
      } catch (error) {
        if (active) onError(messageOf(error))
      }
    }

    void load()
    return () => {
      active = false
      setEntry(null)
    }
  }, [entryId, onError])

  useEffect(
    () => () => {
      stopRevealTimer()
      stopClipboardTimer()
      if (clipboardArmed.current) {
        clipboardArmed.current = false
        void writeClipboard('').catch(() => undefined)
      }
    },
    [],
  )

  function handleToggleReveal() {
    stopRevealTimer()
    if (revealed) {
      setRevealed(false)
      return
    }
    setRevealed(true)
    revealTimer.current = window.setTimeout(() => {
      revealTimer.current = null
      setRevealed(false)
    }, REVEAL_MS)
  }

  async function handleCopy() {
    if (!entry) return
    try {
      await writeClipboard(entry.password)
    } catch (error) {
      onError(messageOf(error))
      return
    }
    stopClipboardTimer()
    clipboardArmed.current = true
    setCopied(true)
    clipboardTimer.current = window.setTimeout(() => {
      clipboardTimer.current = null
      void wipeClipboard()
    }, CLIPBOARD_MS)
  }

  async function handleDelete() {
    if (!entry) return
    if (!window.confirm(`"${entry.name}" yozuvini o'chirishni tasdiqlaysizmi?`)) return
    setBusy(true)
    try {
      await unwrap(window.vault.entries.remove(entry.id), onNotice)
      await wipeClipboard()
      stopRevealTimer()
      setRevealed(false)
      setEntry(null)
      await onDeleted()
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  if (!entryId) {
    return (
      <div className="empty">
        Parolni ko'rish uchun chap tomondan yozuvni tanlang.
      </div>
    )
  }

  if (!entry) {
    return <div className="empty">Yozuv yuklanmoqda...</div>
  }

  return (
    <div className="detail">
      <div className="detail__row">
        <span className="detail__label">Kategoriya</span>
        <span className="detail__value">{entry.category}</span>
      </div>
      <div className="detail__row">
        <span className="detail__label">Nom</span>
        <span className="detail__value">{entry.name}</span>
      </div>
      <div className="detail__row">
        <span className="detail__label">Parol</span>
        <div className="secret" aria-live="polite">
          {revealed ? entry.password : MASK}
        </div>
      </div>
      <div className="detail__actions">
        <button type="button" className="button button--secondary" onClick={handleToggleReveal}>
          {revealed ? 'Yashirish' : "Ko'rsat"}
        </button>
        <button type="button" className="button button--secondary" onClick={() => void handleCopy()}>
          Nusxalash
        </button>
        <button
          type="button"
          className="button button--danger"
          disabled={busy}
          onClick={() => void handleDelete()}
        >
          {busy ? "O'chirilmoqda..." : "O'chirish"}
        </button>
      </div>
      <p className="panel__hint">Parol 15 soniyadan keyin avtomatik yashiriladi.</p>
      {copied && <p className="detail__status">Parol nusxalandi. 30 soniyadan keyin clipboard tozalanadi.</p>}
    </div>
  )
}
