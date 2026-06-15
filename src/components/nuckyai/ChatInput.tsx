import { useEffect, useRef } from 'react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  onStop?: () => void
}

export default function ChatInput({ value, onChange, onSend, disabled, onStop }: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  return (
    <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      {disabled && onStop && (
        <div className="mb-2">
          <button
            type="button"
            className="border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)]"
            onClick={onStop}
          >
            stop
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ask nuckyAI..."
          disabled={disabled}
          rows={1}
          className="w-full resize-none border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <button
          type="button"
          className="btn min-w-[84px]"
          disabled={disabled || !value.trim()}
          onClick={onSend}
        >
          send
        </button>
      </div>
    </div>
  )
}
