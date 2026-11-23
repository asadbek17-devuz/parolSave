import { useState, type FormEvent } from 'react'
import { messageOf, unwrap } from '../api'

type Props = {
  onUnlocked: () => void | Promise<void>
  onLock: () => void | Promise<void>
  onRecovery: () => void
  onError: (message: string) => void
}

export default function UnlockScreen({ onUnlocked, onLock, onRecovery, onError }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!password) {
      onError('Master parolni kiriting.')
      return
    }
    setBusy(true)
    try {
      await unwrap(window.vault.unlock(password))
      setPassword('')
      await onUnlocked()
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <header className="auth__header">
        <span className="brand">parolSave</span>
        <button type="button" className="button button--ghost" onClick={() => void onLock()}>
          Qulflash
        </button>
      </header>
      <section className="auth__card">
        <h1 className="auth__title">Vaultni ochish</h1>
        <p className="auth__subtitle">Davom etish uchun master parolingizni kiriting.</p>
        <form onSubmit={handleSubmit} autoComplete="off">
          <label className="field">
            <span className="field__label">Master parol</span>
            <input
              className="field__input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <button type="submit" className="button button--primary button--full" disabled={busy}>
            {busy ? 'Ochilmoqda...' : 'Ochish'}
          </button>
        </form>
        <button type="button" className="link-button" onClick={onRecovery}>
          Tiklash kodi bilan tiklash
        </button>
      </section>
    </div>
  )
}
