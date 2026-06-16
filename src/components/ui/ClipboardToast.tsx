interface ClipboardToastProps {
  visible: boolean
  message?: string
}

export default function ClipboardToast({
  visible,
  message = 'copied to clipboard',
}: ClipboardToastProps) {
  if (!visible) return null
  return <span className="clipboard-toast">{message}</span>
}
