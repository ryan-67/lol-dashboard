import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboard } from '../../context/DashboardContext'
import {
  buildEntitySearchIndex,
  entityPath,
  searchEntities,
  type EntitySearchEntry,
} from '../../lib/entities/searchIndex'
import ChampionIcon from './ChampionIcon'

export default function GlobalSearch({ onBeforeNavigate }: { onBeforeNavigate?: () => void }) {
  const { catalog } = useDashboard()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<EntitySearchEntry[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!catalog) return
    setLoading(true)
    void buildEntitySearchIndex(catalog)
      .then(setIndex)
      .finally(() => setLoading(false))
  }, [catalog])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const results = useMemo(() => searchEntities(index, query), [index, query])

  const pick = (entry: EntitySearchEntry) => {
    setQuery('')
    setOpen(false)
    onBeforeNavigate?.()
    navigate(entityPath(entry))
  }

  return (
    <div ref={wrapRef} className="global-search">
      <input
        type="search"
        className="global-search-input"
        placeholder={loading ? 'Loading index…' : 'Search players, teams, champions…'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        aria-label="Global search"
      />
      {open && query.trim() && (
        <div className="global-search-dropdown">
          {results.length === 0 ? (
            <div className="global-search-empty">No matches</div>
          ) : (
            results.map((entry) => (
              <button
                key={`${entry.type}-${entry.slug}`}
                type="button"
                className="global-search-row"
                onClick={() => pick(entry)}
              >
                <span className="global-search-type">{entry.type}</span>
                {entry.type === 'champion' ? <ChampionIcon name={entry.label} size={20} /> : null}
                <span className="global-search-label">{entry.label}</span>
                {entry.meta ? <span className="global-search-meta">{entry.meta}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
