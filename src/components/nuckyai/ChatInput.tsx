import { useEffect, useRef } from 'react'
import type { ChatAttachment } from './types'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  onStop?: () => void
  focusTrigger?: number
  attachment: ChatAttachment | null
  onAttachmentChange: (attachment: ChatAttachment | null) => void
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  onStop,
  focusTrigger,
  attachment,
  onAttachmentChange,
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  useEffect(() => {
    if (focusTrigger === undefined || focusTrigger <= 0) return
    ref.current?.focus()
  }, [focusTrigger])

  const onPickFile = () => {
    if (disabled) return
    fileRef.current?.click()
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > MAX_IMAGE_BYTES) return

    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      if (!url.startsWith('data:image/')) return
      onAttachmentChange({
        url,
        mimeType: file.type,
        name: file.name,
      })
    }
    reader.readAsDataURL(file)
  }

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
      {attachment && (
        <div className="mb-2 flex items-center gap-2 border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-xs font-[family-name:var(--font-mono)]">
          <span className="text-[var(--accent)] truncate max-w-[240px]">
            {attachment.name ?? 'draft screenshot'}
          </span>
          <button
            type="button"
            className="text-[var(--text-secondary)] hover:text-[var(--accent)]"
            onClick={() => onAttachmentChange(null)}
            disabled={disabled}
          >
            remove
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          title="attach draft screenshot"
          className="border border-[var(--border-subtle)] px-2 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 font-[family-name:var(--font-mono)]"
          disabled={disabled}
          onClick={onPickFile}
        >
          img
        </button>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ask nuckyAI..."
          disabled={disabled}
          rows={1}
          className="w-full resize-none border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-60 font-[family-name:var(--font-mono)]"
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
          disabled={disabled || (!value.trim() && !attachment)}
          onClick={onSend}
        >
          send
        </button>
      </div>
    </div>
  )
}
