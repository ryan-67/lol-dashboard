import { useEffect, useRef, useState } from 'react'
import { MAX_IMAGE_ACCEPT_BYTES, prepareImageAttachment } from '../../lib/compressImage'
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

const ERROR_DISMISS_MS = 6000
const maxMbLabel = Math.round(MAX_IMAGE_ACCEPT_BYTES / (1024 * 1024))

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
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [preparingImage, setPreparingImage] = useState(false)

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

  useEffect(() => {
    if (!attachment) setAttachmentError(null)
  }, [attachment])

  useEffect(() => {
    if (!attachmentError) return
    const timer = window.setTimeout(() => setAttachmentError(null), ERROR_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [attachmentError])

  const dismissError = () => setAttachmentError(null)

  const onPickFile = () => {
    if (disabled || preparingImage) return
    setAttachmentError(null)
    fileRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setPreparingImage(true)
    setAttachmentError(null)

    const result = await prepareImageAttachment(file)
    setPreparingImage(false)

    if (!result.ok) {
      setAttachmentError(result.error)
      return
    }

    onAttachmentChange({
      url: result.dataUrl,
      mimeType: result.mimeType,
      name: result.name,
    })
  }

  return (
    <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shrink-0">
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
        <div className="mb-2 border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
          <div className="flex items-start gap-3">
            <img
              src={attachment.url}
              alt={attachment.name ?? 'attached draft screenshot'}
              className="max-h-28 max-w-[160px] object-contain border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-[family-name:var(--font-mono)] text-[var(--accent)] truncate">
                {attachment.name ?? 'draft screenshot'}
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                attached — add your question below, then send
              </p>
              <button
                type="button"
                className="mt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] font-[family-name:var(--font-mono)]"
                onClick={() => onAttachmentChange(null)}
                disabled={disabled}
              >
                remove image
              </button>
            </div>
          </div>
        </div>
      )}
      {attachmentError && (
        <div className="mb-2 flex items-start justify-between gap-2 border border-[rgb(220,38,38)] bg-[rgba(220,38,38,0.06)] px-2 py-1.5">
          <p className="text-xs text-[rgb(220,38,38)] font-[family-name:var(--font-mono)]">
            {attachmentError}
          </p>
          <button
            type="button"
            className="text-xs text-[rgb(220,38,38)] hover:text-[var(--text-primary)] shrink-0 font-[family-name:var(--font-mono)]"
            onClick={dismissError}
            aria-label="dismiss error"
          >
            dismiss
          </button>
        </div>
      )}
      {preparingImage && (
        <p className="mb-2 text-xs text-[var(--text-tertiary)] font-[family-name:var(--font-mono)]">
          compressing screenshot…
        </p>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFileChange(e)}
        />
        <button
          type="button"
          title={`attach draft screenshot (up to ${maxMbLabel}MB)`}
          className="border border-[var(--border-subtle)] px-2 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 font-[family-name:var(--font-mono)] shrink-0"
          disabled={disabled || preparingImage}
          onClick={onPickFile}
        >
          img
        </button>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={attachment ? 'ask about this draft screenshot…' : 'ask nuckyAI...'}
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
          className="btn min-w-[84px] shrink-0"
          disabled={disabled || preparingImage || (!value.trim() && !attachment)}
          onClick={onSend}
        >
          send
        </button>
      </div>
    </div>
  )
}
