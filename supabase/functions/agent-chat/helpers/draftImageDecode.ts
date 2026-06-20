/** PNG decode + grayscale helpers for draft template matching (Deno edge). */

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function unfilterScanline(
  filter: number,
  scanline: Uint8Array,
  prior: Uint8Array,
  bpp: number,
): Uint8Array {
  const out = new Uint8Array(scanline.length);
  for (let i = 0; i < scanline.length; i++) {
    const left = i >= bpp ? out[i - bpp]! : 0;
    const up = prior[i]!;
    const upLeft = i >= bpp ? prior[i - bpp]! : 0;
    let v = scanline[i]!;
    if (filter === 1) v = (v + left) & 0xff;
    else if (filter === 2) v = (v + up) & 0xff;
    else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      v = (v + pr) & 0xff;
    }
    out[i] = v;
  }
  return out;
}

export async function decodePngAsync(
  bytes: Uint8Array,
): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8 || bytes[0] !== 0x89) throw new Error("not png");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === "IHDR" && length >= 13) {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      colorType = bytes[dataStart + 9]!;
    } else if (type === "IDAT") {
      idatChunks.push(bytes.slice(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height) throw new Error("png missing IHDR");

  const zlibData = concatUint8Arrays(idatChunks);
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  await writer.write(zlibData);
  await writer.close();
  const inflated = new Uint8Array(await new Response(ds.readable).arrayBuffer());

  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let rawPos = 0;
  let prior = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = inflated[rawPos++]!;
    const scanline = inflated.slice(rawPos, rawPos + stride);
    rawPos += stride;
    const decoded = unfilterScanline(filter, scanline, prior, bpp);
    prior = decoded;
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if (colorType === 6) {
        out[di] = decoded[x * 4]!;
        out[di + 1] = decoded[x * 4 + 1]!;
        out[di + 2] = decoded[x * 4 + 2]!;
        out[di + 3] = decoded[x * 4 + 3]!;
      } else if (colorType === 2) {
        out[di] = decoded[x * 3]!;
        out[di + 1] = decoded[x * 3 + 1]!;
        out[di + 2] = decoded[x * 3 + 2]!;
        out[di + 3] = 255;
      } else {
        const g = decoded[x]!;
        out[di] = g;
        out[di + 1] = g;
        out[di + 2] = g;
        out[di + 3] = 255;
      }
    }
  }
  return { width, height, rgba: out };
}

export function rgbaToGrayFull(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return out;
}

/** Decode PNG/JPEG/WebP via createImageBitmap when PNG parse fails. */
export async function decodeImageToRgba(
  bytes: Uint8Array,
): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  try {
    return await decodePngAsync(bytes);
  } catch {
    // JPEG loading screens + some team logos
    if (typeof createImageBitmap === "undefined") {
      throw new Error("unsupported image format");
    }
    const blob = new Blob([bytes]);
    const bitmap = await createImageBitmap(blob);
    try {
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(bitmap, 0, 0);
        const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return {
          width: bitmap.width,
          height: bitmap.height,
          rgba: new Uint8Array(img.data.buffer.slice(0)),
        };
      }
      throw new Error("no OffscreenCanvas");
    } finally {
      bitmap.close();
    }
  }
}

export function rgbaToGrayTemplate(
  id: string,
  label: string,
  rgba: Uint8Array,
  width: number,
  height: number,
  targetSize: number,
): { id: string; label: string; width: number; height: number; pixels: Uint8Array } {
  const out = new Uint8Array(targetSize * targetSize);
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const sx = Math.floor((x / targetSize) * width);
      const sy = Math.floor((y / targetSize) * height);
      const si = (sy * width + sx) * 4;
      const r = rgba[si]!;
      const g = rgba[si + 1]!;
      const b = rgba[si + 2]!;
      out[y * targetSize + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  return { id, label, width: targetSize, height: targetSize, pixels: out };
}
