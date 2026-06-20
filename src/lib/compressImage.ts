/** Max file size we'll accept from disk (large YouTube/Twitch screenshots). */
export const MAX_IMAGE_ACCEPT_BYTES = 15 * 1024 * 1024

/** Target compressed size — keeps base64 under edge-function payload limits (~4M chars). */
const TARGET_BYTES = 2.4 * 1024 * 1024

const MAX_DIMENSION = 1920

export type PreparedImage =
  | { ok: true; dataUrl: string; mimeType: string; name: string }
  | { ok: false; error: string }

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('could not decode image'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('compression failed'))),
      type,
      quality,
    )
  })
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

async function compressToTarget(img: HTMLImageElement): Promise<{ blob: Blob; mimeType: string }> {
  const mimeType = 'image/jpeg'
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(img, 0, 0, width, height)

  let quality = 0.88
  let blob = await canvasToBlob(canvas, mimeType, quality)

  while (blob.size > TARGET_BYTES && quality > 0.45) {
    quality -= 0.08
    blob = await canvasToBlob(canvas, mimeType, quality)
  }

  if (blob.size > TARGET_BYTES && scale < 1) {
    const smaller = Math.min(1, (MAX_DIMENSION * 0.75) / Math.max(img.width, img.height))
    canvas.width = Math.max(1, Math.round(img.width * smaller))
    canvas.height = Math.max(1, Math.round(img.height * smaller))
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    quality = 0.82
    blob = await canvasToBlob(canvas, mimeType, quality)
    while (blob.size > TARGET_BYTES && quality > 0.4) {
      quality -= 0.08
      blob = await canvasToBlob(canvas, mimeType, quality)
    }
  }

  return { blob, mimeType }
}

/**
 * Accept large stream/video screenshots, compress for upload when needed.
 */
export async function prepareImageAttachment(file: File): Promise<PreparedImage> {
  const isImage =
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)

  if (!isImage) {
    return { ok: false, error: 'images only — png, jpg, gif, webp' }
  }

  if (file.size > MAX_IMAGE_ACCEPT_BYTES) {
    return { ok: false, error: 'image too large — max 15MB' }
  }

  try {
    if (file.size <= TARGET_BYTES && /^image\/(jpeg|png|webp)$/i.test(file.type)) {
      const dataUrl = await readBlobAsDataUrl(file)
      if (!dataUrl.startsWith('data:image/')) {
        return { ok: false, error: 'could not load image preview' }
      }
      return {
        ok: true,
        dataUrl,
        mimeType: file.type,
        name: file.name,
      }
    }

    const img = await loadImageFromFile(file)
    const { blob, mimeType } = await compressToTarget(img)
    const dataUrl = await readBlobAsDataUrl(blob)

    if (!dataUrl.startsWith('data:image/')) {
      return { ok: false, error: 'could not load image preview' }
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'screenshot'
    return {
      ok: true,
      dataUrl,
      mimeType,
      name: `${baseName}.jpg`,
    }
  } catch {
    return { ok: false, error: 'could not read that file — try another image' }
  }
}
