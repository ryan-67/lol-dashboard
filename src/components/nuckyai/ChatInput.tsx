import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDashboard } from '../../context/DashboardContext'
import {
  buildEntitySearchIndex,
  entityPath,
  searchEntities,
  type EntitySearchEntry,
} from '../../lib/entities/searchIndex'
import { shellAwarePath } from '../../lib/shellPath'
import ChampionIcon from '../entities/ChampionIcon'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  onStop?: () => void
  focusTrigger?: number
  floating?: boolean
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  onStop,
  focusTrigger,
  floating = false,
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { catalog } = useDashboard()
  const navigate = useNavigate()
  const location = useLocation()
  const [index, setIndex] = useState<EntitySearchEntry[]>([])
  const [highlight, setHighlight] = useState(0)
  const [showTypeahead, setShowTypeahead] = useState(false)

  useEffect(() => {
    if (!catalog) return
    void buildEntitySearchIndex(catalog).then(setIndex)
  }, [catalog])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => {
    if (focusTrigger === undefined || focusTrigger <= 0) return
    ref.current?.focus()
  }, [focusTrigger])

  useEffect(() => {
    // autofocus on first mount
    ref.current?.focus()
  }, [])

  const results = useMemo(() => {
    const q = value.trim()
    if (q.length < 1) return []
    // Prefer identity search when query looks like a short name/token, not a full sentence
    if (q.includes('?') || q.split(/\s+/).length > 4) return []
    return searchEntities(index, q).slice(0, 8)
  }, [index, value])

  useEffect(() => {
    setShowTypeahead(results.length > 0)
    setHighlight(0)
  }, [results.length, value])

  const pickEntity = (entry: EntitySearchEntry) => {
    navigate(shellAwarePath(entityPath(entry), location.pathname))
    onChange('')
    setShowTypeahead(false)
  }

  const handleSendOrPick = () => {
    if (showTypeahead && results[highlight]) {
      pickEntity(results[highlight])
      return
    }
    onSend()
  }

  return (
    <div className={`chat-input-wrap${floating ? ' chat-input-floating' : ''}`}>
      {disabled && onStop ? (
        <div className="mb-2">
          <button
            type="button"
            className="border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)]"
            onClick={onStop}
          >
            stop
          </button>
        </div>
      ) : null}

      <div className="chat-input-shell">
        {showTypeahead ? (
          <ul className="chat-typeahead" role="listbox">
            {results.map((entry, i) => (
              <li key={`${entry.type}-${entry.slug}`}>
                <button
                  type="button"
                  className={`entity-search-result${i === highlight ? ' is-active' : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pickEntity(entry)}
                >
                  {entry.type === 'champion' ? <ChampionIcon name={entry.label} size={18} /> : null}
                  <span className="entity-search-result-label">{entry.label}</span>
                  <span className="entity-search-result-type">{entry.type}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ask nucky..."
          disabled={disabled}
          rows={1}
          onKeyDown={(e) => {
            if (showTypeahead && results.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight((h) => Math.min(h + 1, results.length - 1))
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight((h) => Math.max(h - 1, 0))
                return
              }
              if (e.key === 'Escape') {
                setShowTypeahead(false)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendOrPick()
            }
          }}
        />
        <div className="chat-input-toolbar">
          <button
            type="button"
            className="chat-input-send"
            disabled={disabled || !value.trim()}
            onClick={handleSendOrPick}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
