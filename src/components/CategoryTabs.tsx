type Props = {
  categories: string[]
  active: string
  onChange: (category: string) => void
}

const ALL = 'Barchasi'

export default function CategoryTabs({ categories, active, onChange }: Props) {
  const options = [ALL, ...categories]

  return (
    <div className="tabs" role="group" aria-label="Kategoriyalar">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`tab ${option === active ? 'tab--active' : ''}`}
          aria-pressed={option === active}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
