import { useState, type FormEvent } from 'react'
import { messageOf, unwrap } from '../api'

type Props = {
  onRestored: () => void | Promise<void>
  onBack: () => void
  onError: (message: string) => void
  onNotice: (message: string) => void
}

export default function RecoveryScreen({ onRestored, onBack, onError, onNotice }: Props) {
  const [recoveryCode, setRecoveryCode] = useState('')
  const [masterPassword, setMasterPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [validation, setValidation] = useState('')
  const [busy, setBusy] = useState(false)

  function reportError(error: unknown) {
    onError(messageOf(error))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidation('')
    if (!recoveryCode.trim()) {
      setValidation('Tiklash kodini kiriting.')
      return
    }
    if (masterPassword.length < 8) {
      setValidation("Yangi master parol kamida 8 belgi bo'lishi kerak.")
      return
    }
    if (masterPassword !== confirmation) {
      setValidation('Parollar mos kelmadi.')
      return
    }
    setBusy(true)
    try {
      await unwrap(window.vault.restore(recoveryCode.trim(), masterPassword), onNotice)
      setRecoveryCode('')
      setMasterPassword('')
      setConfirmation('')
      await onRestored()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <section className="auth__card">
        <h1 className="auth__title">Tiklash kodi bilan ochish</h1>
        <p className="auth__subtitle">
          Saqlagan tiklash kodingizni va yangi master parolni kiriting. Eski master parol o'rniga
          yangisi ishlatiladi.
        </p>
        <form onSubmit={handleSubmit} autoComplete="off">
          <label className="field">
            <span className="field__label">Tiklash kodi</span>
            <input
              className="field__input"
              type="text"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="field__label">Yangi master parol</span>
            <input
              className="field__input"
              type="password"
              value={masterPassword}
              onChange={(event) => setMasterPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span className="field__label">Yangi parolni tasdiqlang</span>
            <input
              className="field__input"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          {validation && (
            <p className="validation" role="alert">
              {validation}
            </p>
          )}
          <button type="submit" className="button button--primary button--full" disabled={busy}>
            {busy ? 'Tiklanmoqda...' : 'Tiklash'}
          </button>
        </form>
        <button type="button" className="link-button" onClick={onBack}>
          Ochish ekraniga qaytish
        </button>
      </section>
    </div>
  )
}
