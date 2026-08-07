/** Yield to the browser so paint / input can run between heavy sync chunks. */
export const yieldToMain = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 32 })
      return
    }
    setTimeout(resolve, 0)
  })
