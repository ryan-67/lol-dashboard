import { useEffect, useRef } from 'react'
import {
  chatDocumentHref,
  isAuxiliaryBlankHref,
  readKeyTarget,
  shouldBlockHistoryNavigationKey,
  shouldRestoreChatDocument,
} from './chatSessionGuards'

interface UseChatDocumentStayArgs {
  active: boolean
  sendInFlight: boolean
  conversationId?: string | null
}

/**
 * Keep this /chat document from turning into about:blank or history-back
 * while a stream owns the tab. Backspace/Delete never navigate.
 */
export function useChatDocumentStay({
  active,
  sendInFlight,
  conversationId,
}: UseChatDocumentStayArgs) {
  const sendInFlightRef = useRef(sendInFlight)
  const conversationIdRef = useRef(conversationId)
  sendInFlightRef.current = sendInFlight
  conversationIdRef.current = conversationId

  useEffect(() => {
    if (!active) return

    const pinnedHref = () => {
      const here = `${window.location.pathname}${window.location.search}`
      if (here.startsWith('/chat') && !isAuxiliaryBlankHref(window.location.href)) {
        return here
      }
      return chatDocumentHref(conversationIdRef.current)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !shouldBlockHistoryNavigationKey(
          {
            key: event.key,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            target: readKeyTarget(event.target),
          },
          { composerLocked: sendInFlightRef.current },
        )
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
    }

    const onPopState = () => {
      if (!sendInFlightRef.current) return
      if (
        !shouldRestoreChatDocument({
          pathname: window.location.pathname,
          href: window.location.href,
          sendInFlight: true,
        })
      ) {
        return
      }
      window.history.pushState(null, '', pinnedHref())
    }

    const onSubmit = (event: Event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      if (!form.closest('.chat-pane, .chat-window, .nuckyai-shell, .chat-input-wrap')) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onClick = (event: MouseEvent) => {
      for (const node of event.composedPath()) {
        if (!(node instanceof HTMLAnchorElement)) continue
        if (!isAuxiliaryBlankHref(node.getAttribute('href'))) continue
        event.preventDefault()
        event.stopPropagation()
        break
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('submit', onSubmit, true)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [active])
}
