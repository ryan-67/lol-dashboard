/**
 * Pure UI/session guards for nuckyAI.
 * Keep /chat mounted, keep the composer alive, and send each prompt once.
 */

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
}): boolean {
  return Boolean(args.text.trim()) && !args.sendLocked && !args.streaming
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
