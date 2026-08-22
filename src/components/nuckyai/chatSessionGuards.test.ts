import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAcceptChatSubmit,
  shouldFlipSubscriptionReadyOff,
  shouldReloadConversationMessages,
  shouldShowConversationListSkeleton,
} from './chatSessionGuards.ts'

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

  it('rejects empty, locked, or in-flight follow-ups', () => {
    assert.equal(canAcceptChatSubmit({ text: 'who wins?', sendLocked: false, streaming: false }), true)
    assert.equal(canAcceptChatSubmit({ text: 'who wins?', sendLocked: true, streaming: false }), false)
    assert.equal(canAcceptChatSubmit({ text: 'who wins?', sendLocked: false, streaming: true }), false)
    assert.equal(canAcceptChatSubmit({ text: '   ', sendLocked: false, streaming: false }), false)
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
})
