import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendPendingTurn,
  applyStreamChunk,
  applyStreamDone,
  applyStreamError,
  canAcceptChatSubmit,
  classifyChatError,
  composerEnterOpensNewBrowsingContext,
  composerSubmitTarget,
  composerUsesDocumentForm,
  conversationHref,
  hydrateLoadedMessages,
  interpretAgentSseData,
  isAuxiliaryBlankHref,
  isComposerSendEnter,
  isDuplicateChatSubmit,
  isFunctionKey,
  shouldBlockHistoryNavigationKey,
  shouldFlipSubscriptionReadyOff,
  shouldHandleConversationClick,
  shouldOpenConversationInNewBrowsingContext,
  shouldReloadConversationMessages,
  shouldRestoreChatDocument,
  shouldShowConversationListSkeleton,
  userPromptBeforeAssistant,
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
    assert.equal(isComposerSendEnter({ key: 'NumpadEnter', shiftKey: false }), true)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: true }), false)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: false, repeat: true }), false)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: false, isComposing: true }), false)
    assert.equal(isComposerSendEnter({ key: 'Enter', shiftKey: false, keyCode: 229 }), false)
    assert.equal(isComposerSendEnter({ key: 'a', shiftKey: false }), false)
  })

  it('never treats function keys, Backspace, or Delete as send', () => {
    for (const key of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']) {
      assert.equal(isFunctionKey(key), true)
      assert.equal(isComposerSendEnter({ key, shiftKey: false }), false)
    }
    assert.equal(isFunctionKey('Enter'), false)
    assert.equal(isComposerSendEnter({ key: 'Backspace', shiftKey: false }), false)
    assert.equal(isComposerSendEnter({ key: 'Delete', shiftKey: false }), false)
    assert.equal(isComposerSendEnter({ key: 'Tab', shiftKey: false }), false)
  })

  it('blocks Backspace history navigation when the composer is locked or unfocused', () => {
    assert.equal(
      shouldBlockHistoryNavigationKey(
        { key: 'Backspace', target: { tagName: 'TEXTAREA', readOnly: true } },
        { composerLocked: true },
      ),
      true,
    )
    assert.equal(
      shouldBlockHistoryNavigationKey({
        key: 'Backspace',
        target: { tagName: 'TEXTAREA', readOnly: false, disabled: false },
      }),
      false,
    )
    assert.equal(
      shouldBlockHistoryNavigationKey({ key: 'Backspace', target: { tagName: 'BODY' } }),
      true,
    )
    assert.equal(
      shouldBlockHistoryNavigationKey({
        key: 'Delete',
        target: { tagName: 'TEXTAREA', readOnly: false },
      }),
      false,
    )
    assert.equal(
      shouldBlockHistoryNavigationKey(
        { key: 'Delete', target: { tagName: 'TEXTAREA', readOnly: true } },
        { composerLocked: true },
      ),
      true,
    )
  })

  it('dedupes one Enter into one submit without blocking an explicit later retry', () => {
    assert.equal(isDuplicateChatSubmit({ text: 'F3', at: 1000 }, 'F3', 1200), true)
    assert.equal(isDuplicateChatSubmit({ text: 'F3', at: 1000 }, 'F3', 1000 + 800), false)
    assert.equal(isDuplicateChatSubmit({ text: 'F3', at: 1000 }, 'F2', 1100), false)
    assert.equal(isDuplicateChatSubmit(null, 'F3', 1100), false)
  })

  it('retries the user prompt paired to that failed turn, not a later F2 draft', () => {
    const messages: MessageRow[] = [
      { role: 'user', content: 'F2', created_at: 't1', requestId: 'req-f2' },
      {
        role: 'assistant',
        content: 'ok',
        created_at: 't2',
        requestId: 'req-f2',
        kind: 'text',
      },
      { role: 'user', content: 'F3', created_at: 't3', requestId: 'req-f3' },
      {
        role: 'assistant',
        content: "couldn't get a response — try again.",
        created_at: 't4',
        requestId: 'req-f3',
        kind: 'error',
        retryable: true,
      },
    ]
    assert.equal(userPromptBeforeAssistant(messages, 3), 'F3')
    assert.equal(userPromptBeforeAssistant(messages, 1), 'F2')
    assert.equal(userPromptBeforeAssistant(messages, 2), null)
  })

  it('Enter does not open a new browsing context', () => {
    assert.equal(composerUsesDocumentForm(), false)
    assert.equal(composerSubmitTarget({}), 'stay')
    assert.equal(composerEnterOpensNewBrowsingContext({ key: 'Enter', shiftKey: false }), false)
    assert.equal(
      composerEnterOpensNewBrowsingContext({ key: 'Enter', shiftKey: false, metaKey: true }),
      false,
    )
    assert.equal(
      composerEnterOpensNewBrowsingContext({
        key: 'Enter',
        shiftKey: false,
        formMethod: 'get',
        formAction: '/chat',
        formTarget: '_blank',
      }),
      true,
    )
    assert.equal(
      composerEnterOpensNewBrowsingContext({ key: 'Enter', shiftKey: false, windowOpen: true }),
      true,
    )
    assert.equal(shouldOpenConversationInNewBrowsingContext({ key: 'Enter', button: 0 }), false)
    assert.equal(shouldOpenConversationInNewBrowsingContext({ button: 0 }), false)
    assert.equal(shouldOpenConversationInNewBrowsingContext({ button: 0, metaKey: true }), true)
    assert.equal(shouldOpenConversationInNewBrowsingContext({ button: 0, ctrlKey: true }), true)
    assert.equal(shouldOpenConversationInNewBrowsingContext({ button: 1 }), true)
    assert.equal(shouldHandleConversationClick({ key: 'Enter', button: 0 }), true)
  })

  it('does not navigate this tab to about:blank', () => {
    assert.equal(composerSubmitTarget({ method: 'dialog' }), 'about:blank')
    assert.equal(composerSubmitTarget({ action: '' }), 'about:blank')
    assert.equal(composerSubmitTarget({ action: 'about:blank' }), 'about:blank')
    assert.equal(
      composerEnterOpensNewBrowsingContext({
        key: 'Enter',
        shiftKey: false,
        formMethod: 'dialog',
      }),
      true,
    )
    assert.equal(isAuxiliaryBlankHref('about:blank'), true)
    assert.equal(isAuxiliaryBlankHref('/chat?conversation_id=8b38946c'), false)
    assert.equal(
      shouldRestoreChatDocument({
        pathname: '',
        href: 'about:blank',
        sendInFlight: true,
      }),
      true,
    )
    assert.equal(
      shouldRestoreChatDocument({
        pathname: '/chat',
        href: 'https://nucky.gg/chat?conversation_id=1',
        sendInFlight: true,
      }),
      false,
    )
    assert.equal(
      shouldRestoreChatDocument({
        pathname: '/dashboard',
        href: 'https://nucky.gg/dashboard',
        sendInFlight: false,
      }),
      false,
    )
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

  it('does not render an empty NUCKY bubble when the stream has no text', () => {
    let messages = appendPendingTurn([], {
      requestId: 'req-blank',
      text: 'hey',
      thinking: 'looking…',
      createdAt: 't1',
    })
    messages = applyStreamChunk(messages, 'req-blank', '   ')
    messages = applyStreamDone(messages, 'req-blank', true)
    const assistant = messages.find((m) => m.requestId === 'req-blank' && m.role === 'assistant')
    assert.equal(assistant?.thinking, false)
    assert.equal(assistant?.kind, 'error')
    assert.equal(assistant?.retryable, true)
    assert.match(assistant?.content ?? '', /try again/i)

    const hydrated = hydrateLoadedMessages([
      { role: 'user', content: 'hey', created_at: 't1' },
      { role: 'assistant', content: '', created_at: 't2' },
    ])
    assert.equal(hydrated[1]?.kind, 'error')
    assert.match(hydrated[1]?.content ?? '', /try again/i)
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
