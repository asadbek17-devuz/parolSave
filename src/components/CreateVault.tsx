import { useState, type FormEvent } from 'react'
import { messageOf, unwrap } from '../api'

type Props = {
  onCreated: () => void | Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
}

export default function CreateVault({ onCreated, onError, onNotice }: Props) {
  const [masterPassword, setMasterPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [validation, setValidation] = useState('')
  const [busy, setBusy] = useState(false)

  function reportError(error: unknown) {
    onError(messageOf(error))
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidation('')
    if (masterPassword.length < 8) {
      setValidation("Master parol kamida 8 belgi bo'lishi kerak.")
      return
    }
    if (masterPassword !== confirmation) {
      setValidation('Parollar mos kelmadi.')
      return
    }
    setBusy(true)
    try {
      const result = await unwrap(window.vault.create(masterPassword), onNotice)
      setRecoveryCode(result.recoveryCode)
      setConfirmation('')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function handleContinue() {
    setBusy(true)
    try {
      await unwrap(window.vault.unlock(masterPassword))
      setRecoveryCode('')
      setMasterPassword('')
      await onCreated()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCode) {
    return (
      <div className="auth">
        <section className="auth__card">
          <h1 className="auth__title">Tiklash kodi</h1>
          <div className="warning" role="alert">
            <strong>Bu kod faqat bir marta ko'rsatiladi.</strong>
            <p>
              Kodni hozir yozib oling yoki nusxalab xavfsiz joyga saqlang. Master parolni unutsangiz,
              faqat shu kod bilan vaultni tiklaysiz. Keyinroq bu kod qayta ko'rsatilmaydi.
            </p>
          </div>
          <code className="code-box">{recoveryCode}</code>
          <button
            type="button"
            className="button button--primary button--full"
            disabled={busy}
            onClick={() => void handleContinue()}
          >
            {busy ? 'Ochilmoqda...' : "Saqladim, ochishni davom ettirish"}
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="auth">
      <section className="auth__card">
        <h1 className="auth__title">Yangi vault yaratish</h1>
        <p className="auth__subtitle">
          Master parol barcha yozuvlaringizni shifrlash uchun ishlatiladi. Uni hech kimga bermang.
        </p>
        <form onSubmit={handleCreate} autoComplete="off">
          <label className="field">
            <span className="field__label">Master parol</span>
            <input
              className="field__input"
              type="password"
              value={masterPassword}
              onChange={(event) => setMasterPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span className="field__label">Parolni tasdiqlang</span>
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
            {busy ? 'Yaratilmoqda...' : 'Vault yaratish'}
          </button>
        </form>
        <p className="panel__hint">Parol kamida 8 belgidan iborat bo'lishi kerak.</p>
      </section>
    </div>
  )
}
