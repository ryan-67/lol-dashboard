import { toPng } from 'html-to-image'

const BRAND = {
  bg: '#141414',
  accent: '#c5a059',
  accentBg: 'rgba(197, 160, 89, 0.12)',
  text: '#f0ece2',
  font: '"Noto Sans Mono", ui-monospace, monospace',
} as const

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawNuckyWatermark(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) {
  const logoSize = 28
  const gap = 8
  const pad = 14
  const text = 'nucky'

  ctx.font = `500 16px ${BRAND.font}`
  const textWidth = ctx.measureText(text).width
  const totalWidth = logoSize + gap + textWidth
  const startX = canvasWidth - pad - totalWidth
  const centerY = canvasHeight - pad - logoSize / 2

  ctx.fillStyle = 'rgba(20, 20, 20, 0.82)'
  ctx.fillRect(startX - 10, centerY - logoSize / 2 - 8, totalWidth + 20, logoSize + 16)

  ctx.fillStyle = BRAND.accentBg
  ctx.fillRect(startX, centerY - logoSize / 2, logoSize, logoSize)
  ctx.strokeStyle = BRAND.accent
  ctx.lineWidth = 1
  ctx.strokeRect(startX, centerY - logoSize / 2, logoSize, logoSize)

  ctx.fillStyle = BRAND.accent
  ctx.font = `700 14px ${BRAND.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', startX + logoSize / 2, centerY)

  ctx.font = `500 16px ${BRAND.font}`
  ctx.fillStyle = BRAND.text
  ctx.textAlign = 'left'
  ctx.fillText(text, startX + logoSize + gap, centerY)
}

export async function captureChartWithBranding(element: HTMLElement): Promise<Blob | null> {
  const dataUrl = await toPng(element, {
    backgroundColor: BRAND.bg,
    pixelRatio: 2,
    cacheBust: true,
  })

  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(img, 0, 0)
  drawNuckyWatermark(ctx, canvas.width, canvas.height)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

export async function copyChartImageToClipboard(element: HTMLElement): Promise<void> {
  const blob = await captureChartWithBranding(element)
  if (!blob) throw new Error('Failed to render chart image')

  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return
  }

  throw new Error('Clipboard image copy is not supported in this browser')
}
