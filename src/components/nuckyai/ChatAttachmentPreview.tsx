import type { ChatAttachment } from './types'

function isImageAttachment(att: ChatAttachment): boolean {
  if (att.mimeType?.startsWith('image/')) return true
  if (att.url.startsWith('data:image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name ?? '')
}

interface ChatAttachmentPreviewProps {
  attachment: ChatAttachment
  /** compact row for message bubbles */
  variant?: 'input' | 'message'
  onRemove?: () => void
  removeDisabled?: boolean
}

export default function ChatAttachmentPreview({
  attachment,
  variant = 'input',
  onRemove,
  removeDisabled,
}: ChatAttachmentPreviewProps) {
  const isImage = isImageAttachment(attachment)
  const label = attachment.name ?? (isImage ? 'draft screenshot' : 'attachment')

  if (variant === 'message') {
    return (
      <div className="mb-2 border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
        {isImage ? (
          <img
            src={attachment.url}
            alt={label}
            className="max-h-40 max-w-full object-contain border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          />
        ) : (
          <div className="flex items-center gap-2 text-sm text-[var(--text-primary)] font-[family-name:var(--font-mono)]">
            <span className="text-lg leading-none" aria-hidden>
              📎
            </span>
            <span className="truncate">{label}</span>
          </div>
        )}
        {!isImage && (
          <p className="mt-1 text-[10px] text-[var(--text-tertiary)] font-[family-name:var(--font-mono)]">
            attached file
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mb-2 border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
      <div className="flex items-start gap-3">
        {isImage ? (
          <img
            src={attachment.url}
            alt={label}
            className="max-h-28 max-w-[160px] object-contain border border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0"
          />
        ) : (
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-2xl"
            aria-hidden
          >
            📎
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-[family-name:var(--font-mono)] text-[var(--accent)] truncate">
            {label}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
            {isImage ? 'attached — add your question below, then send' : 'file attached — add your message, then send'}
          </p>
          {onRemove && (
            <button
              type="button"
              className="mt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] font-[family-name:var(--font-mono)]"
              onClick={onRemove}
              disabled={removeDisabled}
            >
              remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
