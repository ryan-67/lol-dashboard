import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../../context/DashboardContext'
import {
  buildEntitySearchIndex,
  searchEntities,
  type EntitySearchEntry,
} from '../../lib/entities/searchIndex'
import ChampionIcon from '../entities/ChampionIcon'
import { isComposerSendEnter } from './chatSessionGuards'

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
  const composingRef = useRef(false)
  const sentAtRef = useRef(0)
  const { catalog } = useDashboard()
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
    // Insert the entity name into the draft (don't navigate away from chat).
    const insert = entry.label
    const next = value.trim().length ? `${value.replace(/\s+$/, '')} ${insert} ` : `${insert} `
    onChange(next)
    setShowTypeahead(false)
    requestAnimationFrame(() => ref.current?.focus())
  }

  const handleSendOrPick = () => {
    if (disabled || composingRef.current) return
    if (showTypeahead && results[highlight]) {
      pickEntity(results[highlight])
      return
    }
    if (!value.trim()) return
    sentAtRef.current = Date.now()
    onSend()
  }

  const handleChange = (next: string) => {
    // IME/compositionend can write a leftover fragment after a successful send.
    if (Date.now() - sentAtRef.current < 200) return
    onChange(next)
  }

  return (
    <div className={`chat-input-wrap${floating ? ' chat-input-floating' : ''}`}>
      {disabled && onStop ? (
        <div className="chat-input-stop-row">
          <button
            type="button"
            className="chat-input-stop"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <span className="chat-input-stop-icon" aria-hidden="true" />
            stop
          </button>
        </div>
      ) : null}

      <div className="chat-input-shell">
        {showTypeahead ? (
          <ul className="chat-typeahead" role="listbox" aria-label="Entity matches">
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
          onChange={(e) => handleChange(e.target.value)}
          placeholder="ask nucky…"
          disabled={disabled}
          rows={1}
          aria-label="Message nucky"
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            window.setTimeout(() => {
              composingRef.current = false
            }, 0)
          }}
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
            const composing = composingRef.current || e.nativeEvent.isComposing
            if (
              !isComposerSendEnter({
                key: e.key,
                shiftKey: e.shiftKey,
                repeat: e.repeat,
                isComposing: composing,
                keyCode: e.keyCode,
              })
            ) {
              return
            }
            e.preventDefault()
            handleSendOrPick()
          }}
        />
        <div className="chat-input-toolbar">
          <span className="chat-input-hint" aria-hidden="true">
            enter to send
          </span>
          <button
            type="button"
            className="chat-input-send"
            disabled={disabled || !value.trim()}
            onClick={handleSendOrPick}
            aria-label="Send message"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
