import { toPng } from 'html-to-image'

const BRAND = {
  bg: '#141414',
  accent: '#c5a059',
  accentBg: 'rgba(197, 160, 89, 0.12)',
  text: '#f0ece2',
  textMuted: 'rgba(240, 236, 226, 0.65)',
  font: '"Noto Sans Mono", ui-monospace, monospace',
} as const

export interface ChartShareLabels {
  title?: string
  subtitle?: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function extractChartLabels(element: HTMLElement): ChartShareLabels {
  const titleSelectors = [
    '.card-title',
    '.radar-card-title',
    '.performer-card-role',
    'h2',
    'h3',
  ]
  let title = ''
  for (const selector of titleSelectors) {
    const el = element.querySelector<HTMLElement>(selector)
    const text = el?.textContent ? normalizeLabel(el.textContent) : ''
    if (text) {
      title = text
      break
    }
  }

  if (!title) {
    const inline = element.querySelector<HTMLElement>(':scope > div')
    const text = inline?.textContent ? normalizeLabel(inline.textContent) : ''
    if (text && text.length <= 120) title = text
  }

  const subtitleEl = element.querySelector<HTMLElement>('.card-subtitle, .radar-card-subtitle')
  const subtitle = subtitleEl?.textContent ? normalizeLabel(subtitleEl.textContent) : undefined

  return { title: title || undefined, subtitle }
}

function headerHeight(labels: ChartShareLabels): number {
  if (!labels.title) return 0
  return labels.subtitle ? 72 : 52
}

function drawChartHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  labels: ChartShareLabels,
): number {
  const height = headerHeight(labels)
  if (!height || !labels.title) return 0

  ctx.fillStyle = BRAND.bg
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = BRAND.text
  ctx.font = `600 22px ${BRAND.font}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(labels.title, 24, 18)

  if (labels.subtitle) {
    ctx.font = `400 13px ${BRAND.font}`
    ctx.fillStyle = BRAND.textMuted
    ctx.fillText(labels.subtitle, 24, 46)
  }

  return height
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

function shouldSkipCaptureNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false
  const skipClasses = [
    'shareable-chart-export-header',
    'shareable-chart-export-title',
    'shareable-chart-export-subtitle',
    'card-title',
    'card-subtitle',
    'radar-card-title',
    'radar-card-subtitle',
    'radar-card-header',
    'performer-card-role',
  ]
  if (skipClasses.some((cls) => node.classList.contains(cls))) return true
  if (node.parentElement?.classList.contains('radar-card-header')) return true
  return false
}

export async function captureChartWithBranding(
  element: HTMLElement,
  labels?: ChartShareLabels,
): Promise<Blob | null> {
  const resolvedLabels = {
    title: labels?.title ?? extractChartLabels(element).title,
    subtitle: labels?.subtitle ?? extractChartLabels(element).subtitle,
  }
  const includeHeader = Boolean(resolvedLabels.title)

  const dataUrl = await toPng(element, {
    backgroundColor: BRAND.bg,
    pixelRatio: 2,
    cacheBust: true,
    filter: includeHeader ? (node) => !shouldSkipCaptureNode(node) : undefined,
  })

  const img = await loadImage(dataUrl)
  const headerPad = headerHeight(resolvedLabels)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height + headerPad
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = BRAND.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const drawnHeader = drawChartHeader(ctx, canvas.width, resolvedLabels)
  ctx.drawImage(img, 0, drawnHeader)
  drawNuckyWatermark(ctx, canvas.width, canvas.height)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

export async function copyChartImageToClipboard(
  element: HTMLElement,
  labels?: ChartShareLabels,
): Promise<void> {
  const blob = await captureChartWithBranding(element, labels)
  if (!blob) throw new Error('Failed to render chart image')

  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return
  }

  throw new Error('Clipboard image copy is not supported in this browser')
}
