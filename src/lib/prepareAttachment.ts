import { MAX_IMAGE_ACCEPT_BYTES, prepareImageAttachment } from './compressImage'
import type { ChatAttachment } from '../components/nuckyai/types'

export { MAX_IMAGE_ACCEPT_BYTES }

export type PreparedAttachment =
  | { ok: true; attachment: ChatAttachment }
  | { ok: false; error: string }

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
}

async function prepareImageFile(file: File): Promise<PreparedAttachment> {
  const result = await prepareImageAttachment(file)
  if (!result.ok) return result
  return {
    ok: true,
    attachment: {
      url: result.dataUrl,
      mimeType: result.mimeType,
      name: result.name,
    },
  }
}

/** Prepare chat attachment — images compressed; other files stored as data URL for preview. */
export async function prepareChatAttachment(file: File): Promise<PreparedAttachment> {
  if (file.size > MAX_IMAGE_ACCEPT_BYTES) {
    return { ok: false, error: 'file too large — max 15MB' }
  }

  if (isImageFile(file)) {
    return prepareImageFile(file)
  }

  try {
    const dataUrl = await readBlobAsDataUrl(file)
    if (!dataUrl.startsWith('data:')) {
      return { ok: false, error: 'could not read that file' }
    }
    return {
      ok: true,
      attachment: {
        url: dataUrl,
        mimeType: file.type || 'application/octet-stream',
        name: file.name,
      },
    }
  } catch {
    return { ok: false, error: 'could not read that file — try another' }
  }
}
