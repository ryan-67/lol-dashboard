/**
 * Client-side avatar processing + Supabase Storage upload.
 * Resizes to a square max edge (default 512) so most photos work without
 * forcing tiny 200×200 crops; rejects only oversized originals / bad types.
 */

import { supabase } from './supabaseClient'

export const AVATAR_BUCKET = 'avatars'
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024 // 8 MB original
export const AVATAR_MAX_EDGE = 512
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export class AvatarUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvatarUploadError'
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new AvatarUploadError('could not read that image.'))
    }
    img.src = url
  })
}

/** Center-crop to square, then scale so the longest edge ≤ maxEdge. */
export async function processAvatarFile(
  file: File,
  maxEdge = AVATAR_MAX_EDGE,
): Promise<Blob> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new AvatarUploadError('use a JPEG, PNG, WebP, or GIF image.')
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new AvatarUploadError('image must be 8 MB or smaller.')
  }

  const img = await loadImage(file)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  if (side < 32) {
    throw new AvatarUploadError('image is too small (min 32×32).')
  }

  const sx = Math.floor((img.naturalWidth - side) / 2)
  const sy = Math.floor((img.naturalHeight - side) / 2)
  const out = Math.min(side, maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AvatarUploadError('could not process image.')
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
  )
  if (!blob) throw new AvatarUploadError('could not encode image.')
  return blob
}

function publicAvatarUrl(path: string, bust?: number): string {
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const base = data.publicUrl
  return bust ? `${base}?v=${bust}` : base
}

/**
 * Upload a processed avatar for the user. Returns a cache-busted public URL.
 * Path: `{userId}/avatar.jpg`
 */
export async function uploadUserAvatar(userId: string, file: File): Promise<string> {
  const blob = await processAvatarFile(file)
  const path = `${userId}/avatar.jpg`

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })

  if (error) {
    throw new AvatarUploadError(
      error.message.includes('Bucket not found')
        ? 'avatar storage is not set up yet. ask an admin to apply the avatars migration.'
        : `upload failed: ${error.message}`,
    )
  }

  return publicAvatarUrl(path, Date.now())
}

export async function removeUserAvatar(userId: string): Promise<void> {
  const path = `${userId}/avatar.jpg`
  await supabase.storage.from(AVATAR_BUCKET).remove([path])
}
