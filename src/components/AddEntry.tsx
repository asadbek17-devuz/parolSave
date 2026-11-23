import { useState, type FormEvent } from 'react'
import { messageOf, unwrap } from '../api'

type Props = {
  categories: string[]
  onAdded: () => void | Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
}

export default function AddEntry({ categories, onAdded, onError, onNotice }: Props) {
  const [category, setCategory] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [validation, setValidation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function reportError(error: unknown) {
    onError(messageOf(error))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidation('')
    setMessage('')
    if (!category.trim()) {
      setValidation('Kategoriyani kiriting.')
      return
    }
    if (!name.trim()) {
      setValidation('Nomni kiriting.')
      return
    }
    if (!password) {
      setValidation('Parolni kiriting.')
      return
    }
    setBusy(true)
    try {
      await unwrap(
        window.vault.entries.add({
          category: category.trim(),
          name: name.trim(),
          password,
        }),
        onNotice,
      )
      setName('')
      setPassword('')
      setMessage("Yozuv qo'shildi.")
      await onAdded()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Yangi yozuv</h2>
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Kategoriya</span>
            <input
              className="field__input"
              type="text"
              list="category-options"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Mavjud yoki yangi kategoriya"
            />
          </label>
          <datalist id="category-options">
            {categories.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <label className="field">
            <span className="field__label">Nom</span>
            <input
              className="field__input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Parol</span>
            <input
              className="field__input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>
        {validation && (
          <p className="validation" role="alert">
            {validation}
          </p>
        )}
        {message && <p className="status-message">{message}</p>}
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? "Qo'shilmoqda..." : "Qo'shish"}
        </button>
      </form>
    </section>
  )
}
