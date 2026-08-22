import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendPendingTurn,
  applyStreamChunk,
  applyStreamDone,
  applyStreamError,
  canAcceptChatSubmit,
  classifyChatError,
  conversationHref,
  interpretAgentSseData,
  isAuxiliaryBlankHref,
  isComposerSendEnter,
  shouldFlipSubscriptionReadyOff,
  shouldHandleConversationClick,
  shouldReloadConversationMessages,
  shouldShowConversationListSkeleton,
} from './chatSessionGuards.ts'
import type { MessageRow } from './types.ts'

describe('nuckyAI session guards', () => {
  it('does not replace an existing sidebar list with LOADING CHATS', () => {
    assert.equal(shouldShowConversationListSkeleton(true, 3), false)
    assert.equal(shouldShowConversationListSkeleton(true, 0), true)
    assert.equal(shouldShowConversationListSkeleton(false, 0), false)
  })

  it('keeps subscriptionReady after the same user refreshes', () => {
    assert.equal(shouldFlipSubscriptionReadyOff('user-1', 'user-1'), false)
    assert.equal(shouldFlipSubscriptionReadyOff('user-1', 'user-2'), true)
    assert.equal(shouldFlipSubscriptionReadyOff(null, 'user-1'), true)
    assert.equal(shouldFlipSubscriptionReadyOff('user-1', null), false)
  })

  it('rejects empty, locked, composing, quota, or in-flight follow-ups', () => {
    assert.equal(canAcceptChatSubmit({ text: 'who wins?', sendLocked: false, streaming: false }), true)
    assert.equal(canAcceptChatSubmit({ text: 'who wins?', sendLocked: true, streaming: false }), false)
    assert.equal(canAcceptChatSubmit({ text: 'who wins?', sendLocked: false, streaming: true }), false)
    assert.equal(canAcceptChatSubmit({ text: '   ', sendLocked: false, streaming: false }), false)
    assert.equal(
      canAcceptChatSubmit({ text: 'who wins?', sendLocked: false, streaming: false, composing: true }),
      false,
    )
    assert.equal(
      canAcceptChatSubmit({
        text: 'who wins?',
        sendLocked: false,
        streaming: false,
        quotaBlocked: true,
      }),
      false,
    )
  })

  it('does not reload the active thread while a send owns the message list', () => {
    assert.equal(
      shouldReloadConversationMessages({
        queryId: 'c1',
        activeId: 'c1',
        messageCount: 2,
        sendInFlight: false,
      }),
      false,
    )
    assert.equal(
      shouldReloadConversationMessages({
        queryId: 'c1',
        activeId: 'c1',
        messageCount: 0,
        sendInFlight: true,
      }),
      false,
    )
    assert.equal(
      shouldReloadConversationMessages({
        queryId: 'c2',
        activeId: 'c1',
        messageCount: 2,
        sendInFlight: false,
      }),
      true,
    )
  })

  it('ignores IME confirmation, key-repeat, and shift-enter', () => {
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: false }), true)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: true }), false)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: false, repeat: true }), false)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: false, isComposing: true }), false)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: false, keyCode: 229 }), false)
    assert.equal(isComposerSendEnter({ key: 'a', shiftKey: false }), false)
  })

  it('pairs streamed chunks to the request that produced them', () => {
    let messages: MessageRow[] = []
    messages = appendPendingTurn(messages, {
      requestId: 'req-a',
      text: 'who won MSI?',
      thinking: 'looking…',
      createdAt: 't1',
    })
    messages = appendPendingTurn(messages, {
      requestId: 'req-b',
      text: 'recipe for pasta?',
      thinking: 'looking…',
      createdAt: 't2',
    })

    messages = applyStreamChunk(messages, 'req-a', 'HLE won MSI 2026.')

    const firstAssistant = messages.find((m) => m.requestId === 'req-a' && m.role === 'assistant')
    const secondAssistant = messages.find((m) => m.requestId === 'req-b' && m.role === 'assistant')
    assert.equal(firstAssistant?.content, 'HLE won MSI 2026.')
    assert.equal(firstAssistant?.thinking, false)
    assert.equal(secondAssistant?.content, 'looking…')
    assert.equal(secondAssistant?.thinking, true)
    assert.equal(messages.filter((m) => m.role === 'user').length, 2)
  })

  it('keeps a late first-request chunk off the next prompt', () => {
    let messages = appendPendingTurn([], {
      requestId: 'req-1',
      text: 'NS vs BRO',
      thinking: 'looking…',
      createdAt: 't1',
    })
    messages = applyStreamChunk(messages, 'req-1', 'Nongshim ')
    messages = appendPendingTurn(messages, {
      requestId: 'req-2',
      text: 'ignore this recipe',
      thinking: 'looking…',
      createdAt: 't2',
    })
    messages = applyStreamChunk(messages, 'req-1', 'beat BRO.')

    const first = messages.find((m) => m.requestId === 'req-1' && m.role === 'assistant')
    const second = messages.find((m) => m.requestId === 'req-2' && m.role === 'assistant')
    assert.equal(first?.content, 'Nongshim beat BRO.')
    assert.equal(second?.content, 'looking…')
  })

  it('treats usage-limit SSE as a typed error, not assistant prose', () => {
    const fromType = interpretAgentSseData(
      JSON.stringify({
        type: 'error',
        code: 'quota_exceeded',
        message: "you've hit your usage limit for the month.",
      }),
    )
    assert.equal(fromType.type, 'error')
    if (fromType.type !== 'error') return
    assert.equal(fromType.error.kind, 'quota')
    assert.equal(fromType.error.retryable, false)

    const fromChunk = interpretAgentSseData(
      JSON.stringify({
        type: 'chunk',
        chunk: 'monthly usage limit reached — check your profile for reset date.',
      }),
    )
    assert.equal(fromChunk.type, 'error')
    if (fromChunk.type !== 'error') return
    assert.equal(fromChunk.error.kind, 'quota')

    const classified = classifyChatError('quota_exceeded')
    assert.equal(classified.retryable, false)
    assert.equal(classified.kind, 'quota')
  })

  it('writes quota onto the matching request and does not mark it retryable', () => {
    let messages = appendPendingTurn([], {
      requestId: 'req-q',
      text: 'another ask',
      thinking: 'looking…',
      createdAt: 't1',
    })
    messages = applyStreamError(messages, 'req-q', classifyChatError('quota_exceeded'))
    const assistant = messages.find((m) => m.requestId === 'req-q' && m.role === 'assistant')
    assert.equal(assistant?.kind, 'error')
    assert.equal(assistant?.errorKind, 'quota')
    assert.equal(assistant?.retryable, false)
    assert.equal(assistant?.thinking, false)
    assert.match(assistant?.content ?? '', /usage limit/i)
  })

  it('does not leave a thinking bubble when the paired request ends empty', () => {
    let messages = appendPendingTurn([], {
      requestId: 'req-empty',
      text: 'hello',
      thinking: 'looking…',
      createdAt: 't1',
    })
    messages = applyStreamDone(messages, 'req-empty', false)
    const assistant = messages.find((m) => m.requestId === 'req-empty' && m.role === 'assistant')
    assert.equal(assistant?.thinking, false)
    assert.equal(assistant?.kind, 'error')
    assert.equal(assistant?.retryable, true)
  })

  it('keeps conversation links on /chat instead of about:blank', () => {
    assert.equal(conversationHref('19951608'), '/chat?conversation_id=19951608')
    assert.equal(isAuxiliaryBlankHref('about:blank'), true)
    assert.equal(isAuxiliaryBlankHref('https://nucky.gg/chat'), false)
    assert.equal(shouldHandleConversationClick({ button: 0 }), true)
    assert.equal(shouldHandleConversationClick({ button: 0, metaKey: true }), false)
    assert.equal(shouldHandleConversationClick({ button: 1 }), false)
  })
})
