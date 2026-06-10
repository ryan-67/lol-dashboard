/** Muted pastel champion pie colors — hue from champion identity, dashboard-style saturation. */

const ICONIC_HUES: Record<string, string> = {
  Annie: '#e05252',
  Brand: '#e86a2f',
  'Jarvan IV': '#e07b28',
  Leona: '#e8c547',
  Lux: '#f0e6a8',
  Garen: '#4a8fd4',
  Ashe: '#5eb8e8',
  Ezreal: '#d4b84a',
  Jinx: '#e85a9a',
  Vi: '#c45ce8',
  Thresh: '#2ecc8a',
  Morgana: '#7b4fd4',
  Kayle: '#f0d060',
  Yasuo: '#6a8fa8',
  Zed: '#8b2a2a',
  Ahri: '#e878a8',
  Sylas: '#4a6ad4',
  Ornn: '#c87840',
  Azir: '#d4b050',
  Renekton: '#3a9e5a',
  Rumble: '#d45828',
  Fizz: '#40b8c8',
  Nautilus: '#3a6a9e',
  Pyke: '#2a8a9a',
  Senna: '#6a4a8a',
  Viego: '#4a9e8a',
  Hwei: '#5a6ad4',
  Aurora: '#c878d4',
  Mel: '#9b6ad4',
  Yunara: '#d4a85c',
  Ambessa: '#8a5c4a',
  Smolder: '#c87848',
}

function hashHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return h % 360
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toByte = (v: number) => Math.round((v + m) * 255)
  return `#${toByte(r).toString(16).padStart(2, '0')}${toByte(g).toString(16).padStart(2, '0')}${toByte(b).toString(16).padStart(2, '0')}`
}

/** Dashboard-style muted pastel from a hue source. */
function toMutedPastel(h: number, s: number, l: number): string {
  const mutedS = Math.min(0.4, Math.max(0.28, s * 0.5 + 0.12))
  const mutedL = Math.min(0.7, Math.max(0.54, l * 0.45 + 0.38))
  return hslToHex(h, mutedS, mutedL)
}

function baseHueForChampion(name: string): number {
  const iconic = ICONIC_HUES[name]
  if (iconic) return hexToHsl(iconic).h
  return hashHue(name)
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Assign visually distinct muted champion colors for a pie chart slice list. */
export function championPieColors(championNames: string[]): Record<string, string> {
  const hues = championNames.map((name) => baseHueForChampion(name))

  for (let i = 1; i < hues.length; i++) {
    for (let j = 0; j < i; j++) {
      if (hueDistance(hues[i]!, hues[j]!) < 28) {
        hues[i] = (hues[i]! + 38) % 360
        j = -1
      }
    }
  }

  const out: Record<string, string> = {}
  for (let i = 0; i < championNames.length; i++) {
    const name = championNames[i]!
    const iconic = ICONIC_HUES[name]
    const source = iconic ? hexToHsl(iconic) : { h: hues[i]!, s: 0.45, l: 0.5 }
    out[name] = toMutedPastel(source.h, source.s, source.l)
  }
  return out
}
