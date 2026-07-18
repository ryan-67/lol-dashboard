import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDashboard } from '../../context/DashboardContext'
import {
  buildEntitySearchIndex,
  entityPath,
  searchEntities,
  type EntitySearchEntry,
} from '../../lib/entities/searchIndex'
import ChampionIcon from '../entities/ChampionIcon'

/** entityPath returns /players/..., /teams/..., /champions/... */
function shellAwarePath(path: string, pathname: string): string {
  if (pathname.startsWith('/duo')) return `/duo${path}`
  if (pathname.startsWith('/chat')) return `/dashboard${path}`
  if (pathname.startsWith('/dashboard')) return `/dashboard${path}`
  return `/dashboard${path}`
}

interface EntitySearchProps {
  compact?: boolean
  placeholder?: string
  className?: string
  onNavigate?: () => void
}

export default function EntitySearch({
  compact = false,
  placeholder = 'search players, teams, champions…',
  className = '',
  onNavigate,
}: EntitySearchProps) {
  const { catalog } = useDashboard()
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<EntitySearchEntry[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!catalog) return
    void buildEntitySearchIndex(catalog).then(setIndex)
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
    const target = shellAwarePath(entityPath(entry), location.pathname)
    setQuery('')
    setOpen(false)
    onNavigate?.()
    navigate(target)
  }

  return (
    <div ref={wrapRef} className={`entity-search ${compact ? 'entity-search-compact' : ''} ${className}`}>
      <input
        type="search"
        className="entity-search-input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(results[highlight] ?? results[0])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && query.trim() && results.length > 0 ? (
        <ul className="entity-search-results" role="listbox">
          {results.map((entry, i) => (
            <li key={`${entry.type}-${entry.slug}`}>
              <button
                type="button"
                className={`entity-search-result${i === highlight ? ' is-active' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(entry)}
              >
                {entry.type === 'champion' ? <ChampionIcon name={entry.label} size={18} /> : null}
                <span className="entity-search-result-label">{entry.label}</span>
                <span className="entity-search-result-type">{entry.type}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export { shellAwarePath }
