export type BgMode = 'all' | 'edges'
export type RGB = [number, number, number]

export interface BgOptions {
  enabled: boolean
  /** The flat background color to remove — sampled with the eyedropper or chosen manually. */
  color: RGB
  /** 0..100 — how close to the background color still counts as background. */
  tolerance: number
  mode: BgMode
}

/**
 * Remove a flat background color while preserving anti-aliased edges.
 *
 * An edge pixel is a blend obs = α·C + (1-α)·bg. With the background color bg
 * known, α can be recovered per channel as (obs_c − bg_c)/(C_c − bg_c); C is
 * unknown, so it is estimated from the most similar solid neighbor. Solid
 * regions of ANY color stay fully opaque (a uniform patch yields α = 1), while
 * true edge fringes get partial alpha and their blended-in background
 * un-blended — no halo, whatever the background hue.
 *
 * "Distance from background" is the Chebyshev distance max_c|obs_c − bg_c|.
 * Pixels within tolerance become fully transparent. Mode 'edges' restricts
 * soft processing to a small ring around that background (8-connected flood
 * fill from the borders), keeping enclosed details inside the artwork; mode
 * 'all' processes the whole image (GIMP-style color-to-alpha, safe on solid
 * regions thanks to the neighbor-based C estimate).
 */
const RING_RADIUS = 4

/** tolerance % → Chebyshev distance cutoff used for background matching. */
function toleranceToDist(tolerance: number): number {
  return Math.max(1, Math.round((tolerance / 100) * 96))
}

export function removeBackground(img: ImageData, opts: BgOptions): void {
  const { width: w, height: h, data } = img
  const [br, bg, bb] = opts.color
  const low = toleranceToDist(opts.tolerance)
  // tolerance 0 => binary cutout of the exact color only; otherwise keep a soft band
  const high = low <= 1 ? low + 1 : Math.min(low * 2 + 16, 160)
  const n = w * h

  const d = new Uint8Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const dr = Math.abs(data[p] - br)
    const dg = Math.abs(data[p + 1] - bg)
    const db = Math.abs(data[p + 2] - bb)
    d[i] = Math.max(dr, dg, db)
  }

  let bgMask: Uint8Array | null = null
  let ring: Uint8Array | null = null
  if (opts.mode === 'edges') {
    bgMask = floodFromBorders(d, w, h, low)
    ring = ringAround(bgMask, w, h, RING_RADIUS)
  }

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const di = d[i]
    if (di <= low) {
      if (!bgMask || bgMask[i]) data[p + 3] = 0
      continue
    }
    if (ring && !ring[i]) continue
    // Soft pixel: solve obs = α·C + (1-α)·bg for α, estimating C from the most
    // similar solid neighbor.
    const best = mostSimilarSolid(data, d, i, w, h, bgMask, high)
    let a: number
    if (best < 0) {
      a = di // no solid neighbor: assume the darkest possible color (bg = white case)
    } else {
      const q = best * 4
      let num = 0
      let den = 0
      for (let c = 0; c < 3; c++) {
        const nc = data[q + c]
        const bc = opts.color[c]
        const weight = Math.abs(nc - bc)
        if (weight > 12) {
          num += (data[p + c] - bc) * Math.sign(nc - bc)
          den += weight
        }
      }
      a = den > 0 ? Math.round((Math.max(0, num) / den) * 255) : di
    }
    a = Math.min(255, a)
    if (a >= 255) continue
    data[p + 3] = a
    const af = a / 255
    for (let c = 0; c < 3; c++) {
      data[p + c] = (data[p + c] - (1 - af) * opts.color[c]) / af
    }
  }
}

/** Index of the solid neighbor whose color is closest to pixel i's (−1 if none). */
function mostSimilarSolid(
  data: Uint8ClampedArray,
  d: Uint8Array,
  i: number,
  w: number,
  h: number,
  bgMask: Uint8Array | null,
  high: number,
): number {
  const x = i % w
  const p = i * 4
  let bestIdx = -1
  let bestDist = Infinity
  const check = (j: number): void => {
    if (d[j] <= high || (bgMask && bgMask[j])) return
    const q = j * 4
    const dist =
      Math.abs(data[q] - data[p]) + Math.abs(data[q + 1] - data[p + 1]) + Math.abs(data[q + 2] - data[p + 2])
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = j
    }
  }
  if (x > 0) check(i - 1)
  if (x < w - 1) check(i + 1)
  if (i >= w) check(i - w)
  if (i < w * h - w) check(i + w)
  return bestIdx
}

/** 8-connected flood fill of near-background pixels starting at the borders. */
function floodFromBorders(d: Uint8Array, w: number, h: number, low: number): Uint8Array {
  const bgMask = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let sp = 0
  const push = (i: number): void => {
    if (!bgMask[i] && d[i] <= low) {
      bgMask[i] = 1
      stack[sp++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (sp > 0) {
    const i = stack[--sp]
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
    if (x > 0 && y > 0) push(i - w - 1)
    if (x < w - 1 && y > 0) push(i - w + 1)
    if (x > 0 && y < h - 1) push(i + w - 1)
    if (x < w - 1 && y < h - 1) push(i + w + 1)
  }
  return bgMask
}

/** Non-background pixels within `radius` of a background pixel (BFS rings). */
function ringAround(bgMask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const n = w * h
  const dist = new Int16Array(n).fill(-1)
  const queue = new Int32Array(n)
  let qh = 0
  let qt = 0
  for (let i = 0; i < n; i++) {
    if (bgMask[i]) {
      dist[i] = 0
      queue[qt++] = i
    }
  }
  while (qh < qt) {
    const i = queue[qh++]
    if (dist[i] >= radius) continue
    const x = i % w
    const tryPush = (j: number): void => {
      if (j >= 0 && dist[j] === -1) {
        dist[j] = dist[i] + 1
        queue[qt++] = j
      }
    }
    if (x > 0) tryPush(i - 1)
    if (x < w - 1) tryPush(i + 1)
    if (i >= w) tryPush(i - w)
    if (i < n - w) tryPush(i + w)
  }
  const ring = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    ring[i] = !bgMask[i] && dist[i] !== -1 ? 1 : 0
  }
  return ring
}

/** A flat color (plus distance) treated as empty space when trimming. */
export interface TrimRef {
  color: RGB
  /** Chebyshev distance from `color` still counted as empty. */
  tol: number
}

/** Pixels fainter than this alpha are ignored when trimming (anti-aliased fringes). */
const TRIM_ALPHA_MIN = 16
/** Trim accepts slightly more background tint than removal, so soft glows just
 *  past the removal tolerance don't pin the crop box. */
const TRIM_SLACK = 8

/** Trim reference from the background-removal settings. */
export function trimRefFromBg(bg: BgOptions): TrimRef {
  return { color: bg.color, tol: toleranceToDist(bg.tolerance) + TRIM_SLACK }
}

/** Dominant flat color along the borders, for trimming pieces without alpha
 *  (JPEG output, background removal off). Returns null when the border is
 *  varied — photos have no meaningful "empty margin" to crop. */
export function detectBorderTrimRef(img: ImageData): TrimRef | null {
  const { width: w, height: h, data } = img
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  const sample = (x: number, y: number): void => {
    const p = (y * w + x) * 4
    if (data[p + 3] < 128) return
    // 16-step buckets absorb the slight noise of JPEG/WebP backgrounds.
    const key = (data[p] >> 4 << 8) | (data[p + 1] >> 4 << 4) | (data[p + 2] >> 4)
    const c = buckets.get(key)
    if (c) {
      c.n++
      c.r += data[p]
      c.g += data[p + 1]
      c.b += data[p + 2]
    } else {
      buckets.set(key, { n: 1, r: data[p], g: data[p + 1], b: data[p + 2] })
    }
  }
  for (let x = 0; x < w; x++) {
    sample(x, 0)
    sample(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    sample(0, y)
    sample(w - 1, y)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const c of buckets.values()) {
    if (!best || c.n > best.n) best = c
  }
  if (!best || best.n < (2 * (w + h - 2)) / 2) return null
  return {
    color: [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)],
    tol: 12 + TRIM_SLACK,
  }
}

/** Bounding box of content pixels, grown by `pad`, clamped to the image.
 *
 * A pixel counts as content when it is opaque enough (faint fringes don't
 * hold the box open) and, when `ref` is given, differs from the flat
 * background color — so trim also crops flat-but-opaque margins. */
export function contentBBox(
  img: ImageData,
  pad: number,
  ref?: TrimRef | null,
): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h, data } = img
  const [br, bg, bb] = ref?.color ?? [0, 0, 0]
  const tol = ref?.tol ?? -1
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      const p = row + x * 4
      if (data[p + 3] < TRIM_ALPHA_MIN) continue
      if (tol >= 0) {
        const dr = Math.abs(data[p] - br)
        const dg = Math.abs(data[p + 1] - bg)
        const db = Math.abs(data[p + 2] - bb)
        if (Math.max(dr, dg, db) <= tol) continue
      }
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  const x0 = Math.max(0, minX - pad)
  const y0 = Math.max(0, minY - pad)
  const x1 = Math.min(w, maxX + 1 + pad)
  const y1 = Math.min(h, maxY + 1 + pad)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
