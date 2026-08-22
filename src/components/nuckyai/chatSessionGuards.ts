/**
 * Pure UI/session guards for nuckyAI.
 * Keep /chat mounted, keep the composer alive, and send each prompt once.
 */

import type { AgentChatError, ChatErrorKind, MessageRow } from './types'

export function shouldShowConversationListSkeleton(
  loading: boolean,
  conversationCount: number,
): boolean {
  return loading && conversationCount === 0
}

/** Only drop a resolved subscription when the signed-in user actually changes. */
export function shouldFlipSubscriptionReadyOff(
  currentUserId: string | null,
  nextUserId: string | null,
): boolean {
  return Boolean(nextUserId) && currentUserId !== nextUserId
}

export function canAcceptChatSubmit(args: {
  text: string
  sendLocked: boolean
  streaming: boolean
  composing?: boolean
  quotaBlocked?: boolean
}): boolean {
  if (args.composing || args.sendLocked || args.streaming || args.quotaBlocked) return false
  return Boolean(args.text.trim())
}

export function shouldReloadConversationMessages(args: {
  queryId: string | null
  activeId: string | null
  messageCount: number
  sendInFlight: boolean
}): boolean {
  if (!args.queryId || args.sendInFlight) return false
  if (args.queryId === args.activeId && args.messageCount > 0) return false
  return true
}

function isEnterKey(key: string | undefined): boolean {
  return key === 'Enter' || key === 'NumpadEnter'
}

export function isFunctionKey(key: string | undefined): boolean {
  return typeof key === 'string' && /^F(?:[1-9]|1[0-2])$/.test(key)
}

export function isComposerSendEnter(event: {
  key: string
  shiftKey: boolean
  repeat?: boolean
  isComposing?: boolean
  keyCode?: number
}): boolean {
  if (!isEnterKey(event.key) || event.shiftKey) return false
  if (event.repeat) return false
  if (event.isComposing) return false
  // IME confirmation on many browsers (Windows/Chrome, Korean/JP/CN).
  if (event.keyCode === 229) return false
  return true
}

export type ChatSendResult = true | false | 'duplicate'

export function isDuplicateChatSubmit(
  last: { text: string; at: number } | null | undefined,
  next: string,
  now: number,
  windowMs = 800,
): boolean {
  if (!last) return false
  const text = next.trim()
  if (!text || last.text !== text) return false
  return now - last.at < windowMs
}

export type KeyTargetSnapshot = {
  tagName?: string
  isContentEditable?: boolean
  readOnly?: boolean
  disabled?: boolean
}

export function readKeyTarget(target: EventTarget | null | undefined): KeyTargetSnapshot | null {
  if (!target || typeof target !== 'object') return null
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
    readOnly?: boolean
    disabled?: boolean
  }
  return {
    tagName: typeof el.tagName === 'string' ? el.tagName : undefined,
    isContentEditable: Boolean(el.isContentEditable),
    readOnly: Boolean(el.readOnly),
    disabled: Boolean(el.disabled),
  }
}

export function isEditableComposerTarget(target: KeyTargetSnapshot | null | undefined): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = (target.tagName ?? '').toUpperCase()
  if (tag !== 'TEXTAREA' && tag !== 'INPUT') return false
  return !target.readOnly && !target.disabled
}

/** Backspace outside an editable field is Firefox/legacy "go back" and can land on about:blank. */
export function shouldBlockHistoryNavigationKey(
  event: {
    key: string
    metaKey?: boolean
    ctrlKey?: boolean
    altKey?: boolean
    target?: KeyTargetSnapshot | null
  },
  args?: { composerLocked?: boolean },
): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (args?.composerLocked) return true
  if (event.key === 'Delete') return false
  return !isEditableComposerTarget(event.target)
}

/**
 * Composer Enter must stay in this document.
 * A GET form, target=_blank, or window.open is the new-tab / fork class.
 */
export function composerEnterOpensNewBrowsingContext(event: {
  key: string
  shiftKey: boolean
  repeat?: boolean
  isComposing?: boolean
  keyCode?: number
  metaKey?: boolean
  ctrlKey?: boolean
  formMethod?: string | null
  formTarget?: string | null
  formAction?: string | null
  linkTarget?: string | null
  windowOpen?: boolean
}): boolean {
  if (!isComposerSendEnter(event)) return false
  if (event.windowOpen) return true
  const formTarget = (event.formTarget ?? '').trim().toLowerCase()
  const linkTarget = (event.linkTarget ?? '').trim().toLowerCase()
  if (formTarget === '_blank' || formTarget === '_new') return true
  if (linkTarget === '_blank' || linkTarget === '_new') return true
  if (
    composerSubmitTarget({
      method: event.formMethod,
      target: event.formTarget,
      action: event.formAction,
    }) !== 'stay'
  ) {
    return true
  }
  return false
}

/**
 * A composer <form> is unsafe: method=dialog blanks this tab (about:blank),
 * GET /chat or target=_blank forks a second document.
 */
export function composerSubmitTarget(attrs: {
  method?: string | null
  target?: string | null
  action?: string | null
}): 'stay' | 'new-tab' | 'about:blank' {
  const method = (attrs.method ?? '').trim().toLowerCase()
  const target = (attrs.target ?? '').trim().toLowerCase()
  if (target === '_blank' || target === '_new') return 'new-tab'
  if (method === 'dialog') return 'about:blank'
  if (attrs.action != null && isAuxiliaryBlankHref(attrs.action)) return 'about:blank'
  if (method === 'get' && (attrs.action ?? '').trim()) return 'new-tab'
  return 'stay'
}

export function composerUsesDocumentForm(): boolean {
  return false
}

/** New tab only for cmd/ctrl/middle mouse. Keyboard Enter never opens a second /chat. */
export function shouldOpenConversationInNewBrowsingContext(event: {
  key?: string
  button?: number
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}): boolean {
  if (isEnterKey(event.key)) return false
  if ((event.button ?? 0) === 1) return true
  if ((event.button ?? 0) === 0 && (event.metaKey || event.ctrlKey)) return true
  return false
}

export function createChatRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function conversationHref(conversationId: string): string {
  return `/chat?conversation_id=${encodeURIComponent(conversationId)}`
}

export function isAuxiliaryBlankHref(href: string | null | undefined): boolean {
  if (!href) return true
  const trimmed = href.trim().toLowerCase()
  return trimmed === '' || trimmed === 'about:blank' || trimmed.startsWith('about:blank')
}

/** Primary unmodified click or Enter stays in this ChatSession; cmd/ctrl/middle use the real /chat href. */
export function shouldHandleConversationClick(event: {
  key?: string
  button?: number
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}): boolean {
  if (isEnterKey(event.key)) return !shouldOpenConversationInNewBrowsingContext(event)
  if (shouldOpenConversationInNewBrowsingContext(event)) return false
  if ((event.button ?? 0) !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  return true
}

export function chatDocumentHref(conversationId?: string | null): string {
  if (conversationId && !isAuxiliaryBlankHref(conversationId)) {
    return conversationHref(conversationId)
  }
  return '/chat'
}

export function shouldRestoreChatDocument(args: {
  pathname: string
  href: string
  sendInFlight: boolean
}): boolean {
  if (!args.sendInFlight) return false
  if (isAuxiliaryBlankHref(args.href)) return true
  return args.pathname !== '/chat'
}

/** RETRY must resend the user prompt paired to that assistant error, not a later draft. */
export function userPromptBeforeAssistant(
  messages: MessageRow[],
  assistantIndex: number,
): string | null {
  if (assistantIndex < 0 || assistantIndex >= messages.length) return null
  const assistant = messages[assistantIndex]
  if (!assistant || assistant.role !== 'assistant') return null
  if (assistant.errorKind === 'quota') return null
  if (assistant.requestId) {
    const paired = messages.find(
      (message) => message.role === 'user' && message.requestId === assistant.requestId,
    )
    if (paired?.content?.trim()) return paired.content
  }
  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user' && messages[i].content.trim()) {
      return messages[i].content
    }
  }
  return null
}

const QUOTA_TEXT = /usage limit|quota_exceeded|monthly usage limit/i

export function looksLikeQuotaProse(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 240) return false
  return QUOTA_TEXT.test(trimmed)
}

export function classifyChatError(code?: string, message?: string): AgentChatError {
  const text = (message ?? '').trim()
  if (code === 'quota_exceeded' || looksLikeQuotaProse(text) || code === '429') {
    return {
      kind: 'quota',
      message: text || 'monthly usage limit reached — check your profile for reset date.',
      retryable: false,
      code: code ?? 'quota_exceeded',
    }
  }
  if (code === 'unauthorized' || code === '401') {
    return {
      kind: 'auth',
      message: text || 'session expired — log in again.',
      retryable: true,
      code,
    }
  }
  if (code === 'forbidden' || code === '403') {
    return {
      kind: 'forbidden',
      message: text || 'subscription required — upgrade to chat with nucky.',
      retryable: false,
      code,
    }
  }
  if (code === 'server' || (typeof code === 'string' && /^5\d\d$/.test(code))) {
    return {
      kind: 'server',
      message: text || 'server error — try again in a moment.',
      retryable: true,
      code,
    }
  }
  return {
    kind: 'unknown',
    message: text || 'nucky hit an error. try again.',
    retryable: true,
    code,
  }
}

export type AgentSseInterpretation =
  | { type: 'done' }
  | { type: 'metadata'; conversationId: string }
  | { type: 'chunk'; text: string }
  | { type: 'error'; error: AgentChatError }
  | { type: 'ignore' }

export function interpretAgentSseData(data: string): AgentSseInterpretation {
  const raw = data.trim()
  if (!raw) return { type: 'ignore' }
  if (raw === '[DONE]') return { type: 'done' }

  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    if (looksLikeQuotaProse(raw)) {
      return { type: 'error', error: classifyChatError('quota_exceeded', raw) }
    }
    return { type: 'ignore' }
  }

  if (!parsed || typeof parsed !== 'object') return { type: 'ignore' }
  const rec = parsed as Record<string, unknown>
  const recType = typeof rec.type === 'string' ? rec.type : ''
  const code = typeof rec.code === 'string' ? rec.code : undefined
  const message = typeof rec.message === 'string' ? rec.message : undefined
  const chunk = typeof rec.chunk === 'string' ? rec.chunk : ''
  const conversationId =
    typeof rec.conversation_id === 'string' ? rec.conversation_id : ''

  if (recType === 'error' || code === 'quota_exceeded' || looksLikeQuotaProse(message ?? '')) {
    return { type: 'error', error: classifyChatError(code, message) }
  }
  if (recType === 'metadata' && conversationId) {
    return { type: 'metadata', conversationId }
  }
  if ((recType === 'chunk' || chunk) && chunk) {
    if (looksLikeQuotaProse(chunk)) {
      return { type: 'error', error: classifyChatError('quota_exceeded', chunk) }
    }
    return { type: 'chunk', text: chunk }
  }
  return { type: 'ignore' }
}

export function appendPendingTurn(
  prev: MessageRow[],
  args: {
    requestId: string
    text: string
    thinking: string
    createdAt: string
    skipUserAppend?: boolean
  },
): MessageRow[] {
  const withoutLastAssistant =
    args.skipUserAppend && prev.length && prev[prev.length - 1]?.role === 'assistant'
      ? prev.slice(0, -1)
      : prev
  const base = args.skipUserAppend
    ? withoutLastAssistant
    : [
        ...withoutLastAssistant,
        {
          role: 'user' as const,
          content: args.text,
          created_at: args.createdAt,
          requestId: args.requestId,
          kind: 'text' as const,
        },
      ]
  return [
    ...base,
    {
      role: 'assistant' as const,
      content: args.thinking,
      created_at: args.createdAt,
      requestId: args.requestId,
      retryable: false,
      thinking: true,
      kind: 'text' as const,
    },
  ]
}

function mapAssistantByRequest(
  messages: MessageRow[],
  requestId: string,
  update: (message: MessageRow) => MessageRow,
): { next: MessageRow[]; found: boolean } {
  let found = false
  const next = messages.map((message) => {
    if (found || message.role !== 'assistant' || message.requestId !== requestId) {
      return message
    }
    found = true
    return update(message)
  })
  return { next, found }
}

export function applyStreamChunk(
  messages: MessageRow[],
  requestId: string,
  chunk: string,
): MessageRow[] {
  if (!chunk.trim() || !requestId) return messages
  const { next, found } = mapAssistantByRequest(messages, requestId, (message) => ({
    ...message,
    thinking: false,
    kind: 'text',
    content: message.thinking ? chunk : `${message.content}${chunk}`,
  }))
  return found ? next : messages
}

export function applyStreamError(
  messages: MessageRow[],
  requestId: string,
  error: AgentChatError,
): MessageRow[] {
  const { next, found } = mapAssistantByRequest(messages, requestId, (message) => ({
    ...message,
    thinking: false,
    kind: 'error',
    errorKind: error.kind,
    retryable: error.retryable,
    content: error.message,
  }))
  if (found) return next
  return [
    ...messages,
    {
      role: 'assistant',
      content: error.message,
      created_at: new Date().toISOString(),
      requestId,
      kind: 'error',
      errorKind: error.kind,
      retryable: error.retryable,
    },
  ]
}

const EMPTY_STREAM_MESSAGE = "couldn't get a response — try again."

export function assistantHasVisibleText(
  message: Pick<MessageRow, 'content' | 'thinking' | 'kind'>,
): boolean {
  if (message.thinking) return true
  return Boolean(message.content?.trim())
}

export function applyStreamDone(
  messages: MessageRow[],
  requestId: string,
  receivedChunk: boolean,
): MessageRow[] {
  const { next, found } = mapAssistantByRequest(messages, requestId, (message) => {
    if (receivedChunk && assistantHasVisibleText(message) && !message.thinking) {
      return message
    }
    return {
      ...message,
      thinking: false,
      kind: 'error',
      errorKind: 'unknown' as ChatErrorKind,
      retryable: true,
      content: EMPTY_STREAM_MESSAGE,
    }
  })
  return found ? next : messages
}

/** DB rows with an empty assistant body become a retryable error, not a blank NUCKY bubble. */
export function hydrateLoadedMessages(rows: MessageRow[]): MessageRow[] {
  return rows.map((message) => {
    if (message.role !== 'assistant' || assistantHasVisibleText(message)) return message
    return {
      ...message,
      thinking: false,
      kind: 'error',
      errorKind: 'unknown' as ChatErrorKind,
      retryable: true,
      content: EMPTY_STREAM_MESSAGE,
    }
  })
}

export function messageListKey(message: MessageRow, idx: number): string {
  if (message.id) return message.id
  if (message.requestId) return `${message.requestId}-${message.role}`
  return `${message.role}-${message.created_at ?? idx}-${idx}`
}
