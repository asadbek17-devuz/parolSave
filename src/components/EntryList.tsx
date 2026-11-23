import type { EntrySummary } from '../../shared/types'

type Props = {
  entries: EntrySummary[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('uz-UZ')
}

export default function EntryList({ entries, selectedId, loading, onSelect }: Props) {
  if (loading) {
    return <div className="empty">Yozuvlar yuklanmoqda...</div>
  }

  if (entries.length === 0) {
    return <div className="empty">Bu kategoriyada yozuv yo'q.</div>
  }

  return (
    <ul className="entries">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            className={`entry ${entry.id === selectedId ? 'entry--active' : ''}`}
            aria-pressed={entry.id === selectedId}
            onClick={() => onSelect(entry.id)}
          >
            <span className="entry__name">{entry.name}</span>
            <span className="entry__date">
              {entry.category}
              {formatDate(entry.createdAt) ? ` · ${formatDate(entry.createdAt)}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
