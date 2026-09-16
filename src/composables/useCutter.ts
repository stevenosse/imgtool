import JSZip from 'jszip'
import { computed, ref, shallowRef } from 'vue'
import type { BgOptions } from './background'
import { contentBBox, removeBackground } from './background'

export interface LoadedImage {
  el: ImageBitmap | HTMLImageElement
  url: string
  width: number
  height: number
  name: string
}

export type LineAxis = 'v' | 'h'
export type OutputFormat = 'png' | 'jpeg' | 'webp'
/** Canvas tool modes: line placement, freeform zone drawing, or null (select). */
export type ToolMode = LineAxis | 'freehand' | 'polygon'

export interface Cell {
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
}

export interface ZonePoint {
  x: number
  y: number
}

/** A user-drawn closed region to cut, in whole image pixels. */
export interface Zone {
  id: number
  kind: 'freehand' | 'polygon'
  points: ZonePoint[]
}

export interface CutPiece {
  blob: Blob
  name: string
  /** Grid cell this piece came from — null for drawn-zone pieces. */
  cell: Cell | null
  /** Drawn zone this piece came from — null for grid pieces. */
  zone: Zone | null
  /** Final pixel size (after background removal and trimming). */
  w: number
  h: number
  url: string
}

export interface TrimOptions {
  enabled: boolean
  /** Transparent margin kept around the content, in pixels. */
  padding: number
}

/** Smallest allowed piece size, in image pixels. */
const MIN_GAP = 1
/** "Columns"/"rows" are piece counts; a count of N seeds N-1 lines. */
const MAX_PIECES_PER_AXIS = 100

const image = shallowRef<LoadedImage | null>(null)
const vLines = ref<number[]>([])
const hLines = ref<number[]>([])
const zones = ref<Zone[]>([])
let zoneSeq = 0

/** Fewer points than this can't enclose an area. */
const MIN_ZONE_PTS = 3
/** A zone narrower than this in either dimension is treated as a stray stroke. */
const MIN_ZONE_SIZE = 2

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

/** Clamp into [MIN_GAP, max - MIN_GAP], drop lines that collide with a neighbor. */
function normalize(lines: number[], max: number): number[] {
  const out: number[] = []
  for (const v of sorted(lines)) {
    const clamped = Math.min(Math.max(v, MIN_GAP), max - MIN_GAP)
    if (out.length === 0 || clamped - out[out.length - 1] >= MIN_GAP) out.push(clamped)
  }
  return out
}

function axisMax(axis: LineAxis): number {
  const img = image.value
  return img ? (axis === 'v' ? img.width : img.height) : 0
}

export function seedLines(axis: LineAxis, count: number | null) {
  const target = axis === 'v' ? vLines : hLines
  const max = axisMax(axis)
  if (!image.value || count === null || count < 2) {
    target.value = []
    return
  }
  const pieces = Math.min(Math.round(count), MAX_PIECES_PER_AXIS)
  const lines: number[] = []
  for (let i = 1; i < pieces; i++) lines.push(Math.round((max * i) / pieces))
  target.value = normalize(lines, max)
}

export function moveLine(axis: LineAxis, index: number, position: number) {
  const arr = axis === 'v' ? [...vLines.value] : [...hLines.value]
  const max = axisMax(axis)
  const prev = index > 0 ? arr[index - 1] : 0
  const next = index < arr.length - 1 ? arr[index + 1] : max
  arr[index] = Math.min(Math.max(position, prev + MIN_GAP), next - MIN_GAP)
  if (axis === 'v') vLines.value = arr
  else hLines.value = arr
}

export function addLine(axis: LineAxis, position: number) {
  const max = axisMax(axis)
  if (max <= 0) return
  const at = Math.round(Math.min(Math.max(position, MIN_GAP), max - MIN_GAP))
  if (axis === 'v') vLines.value = normalize([...vLines.value, at], max)
  else hLines.value = normalize([...hLines.value, at], max)
}

export function removeLine(axis: LineAxis, index: number) {
  if (axis === 'v') vLines.value = vLines.value.filter((_, i) => i !== index)
  else hLines.value = hLines.value.filter((_, i) => i !== index)
}

/** Round to whole image pixels and keep the point inside the image. */
function snapPoint(p: ZonePoint): ZonePoint {
  const img = image.value!
  return {
    x: Math.min(img.width, Math.max(0, Math.round(p.x))),
    y: Math.min(img.height, Math.max(0, Math.round(p.y))),
  }
}

/** Validate + commit a drawn zone; returns null when the shape is degenerate. */
export function addZone(kind: Zone['kind'], points: ZonePoint[]): Zone | null {
  const img = image.value
  if (!img || points.length < MIN_ZONE_PTS) return null
  const snapped: ZonePoint[] = []
  for (const raw of points) {
    const p = snapPoint(raw)
    const prev = snapped[snapped.length - 1]
    if (prev && Math.abs(prev.x - p.x) < 1 && Math.abs(prev.y - p.y) < 1) continue
    snapped.push(p)
  }
  if (snapped.length < MIN_ZONE_PTS) return null
  const xs = snapped.map(p => p.x)
  const ys = snapped.map(p => p.y)
  if (Math.max(...xs) - Math.min(...xs) < MIN_ZONE_SIZE) return null
  if (Math.max(...ys) - Math.min(...ys) < MIN_ZONE_SIZE) return null
  const zone: Zone = { id: ++zoneSeq, kind, points: snapped }
  zones.value = [...zones.value, zone]
  return zone
}

export function removeZone(id: number) {
  zones.value = zones.value.filter(z => z.id !== id)
}

export function clearZones() {
  zones.value = []
  zoneSeq = 0
}

const cells = computed<Cell[]>(() => {
  const img = image.value
  if (!img) return []
  const xs = [0, ...vLines.value, img.width]
  const ys = [0, ...hLines.value, img.height]
  const out: Cell[] = []
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      out.push({
        row: r + 1,
        col: c + 1,
        x: xs[c],
        y: ys[r],
        w: xs[c + 1] - xs[c],
        h: ys[r + 1] - ys[r],
      })
    }
  }
  return out
})

export async function loadImage(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  const url = URL.createObjectURL(file)
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { el: bitmap, url, width: bitmap.width, height: bitmap.height, name: file.name || 'image' }
  } catch {
    // createImageBitmap unavailable or the format is unsupported — fall back to <img>.
  }
  const el = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode this image.'))
    img.src = url
  }).catch((err: unknown) => {
    URL.revokeObjectURL(url)
    throw err
  })
  return { el, url, width: el.naturalWidth, height: el.naturalHeight, name: file.name || 'image' }
}

export function setImage(next: LoadedImage | null) {
  if (image.value) URL.revokeObjectURL(image.value.url)
  clearZones()
  image.value = next
}

export async function cutImage(
  format: OutputFormat,
  quality: number,
  bg?: BgOptions,
  trim?: TrimOptions,
): Promise<CutPiece[]> {
  const img = image.value
  if (!img) return []
  const base = img.name.replace(/\.[^.]+$/, '') || 'image'
  const ext = format === 'jpeg' ? 'jpg' : format
  const mime = `image/${format}`
  const pieces: CutPiece[] = []

  function makeCanvas(w: number, h: number): CanvasRenderingContext2D | null {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (format === 'jpeg') {
      // JPEG has no alpha — flatten transparency onto white instead of black.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    return ctx
  }

  // Background removal → trim → encode; shared by grid cells and drawn zones.
  async function rasterize(ctx: CanvasRenderingContext2D, name: string, cell: Cell | null, zone: Zone | null) {
    const canvas = ctx.canvas
    const w = canvas.width
    const h = canvas.height
    // Background removal never applies to JPEG — it has no alpha channel.
    if (bg?.enabled && format !== 'jpeg') {
      const id = ctx.getImageData(0, 0, w, h)
      removeBackground(id, bg)
      ctx.putImageData(id, 0, 0)
    }
    // Trim transparent margins down to the content bbox (+ padding).
    let out: HTMLCanvasElement = canvas
    if (trim?.enabled) {
      const id = ctx.getImageData(0, 0, w, h)
      const box = contentBBox(id, Math.max(0, Math.round(trim.padding)))
      if (box && (box.w !== w || box.h !== h)) {
        const cropped = document.createElement('canvas')
        cropped.width = box.w
        cropped.height = box.h
        cropped.getContext('2d')!.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h)
        out = cropped
      }
    }
    const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, mime, format === 'png' ? undefined : quality))
    if (!blob) return
    pieces.push({
      blob,
      name,
      cell,
      zone,
      w: out.width,
      h: out.height,
      url: URL.createObjectURL(blob),
    })
  }

  for (const cell of cells.value) {
    const x0 = Math.round(cell.x)
    const y0 = Math.round(cell.y)
    const w = Math.round(cell.x + cell.w) - x0
    const h = Math.round(cell.y + cell.h) - y0
    if (w < 1 || h < 1) continue
    const ctx = makeCanvas(w, h)
    if (!ctx) continue
    ctx.drawImage(img.el, cell.x, cell.y, cell.w, cell.h, 0, 0, w, h)
    await rasterize(ctx, `${base}_r${cell.row}_c${cell.col}.${ext}`, cell, null)
  }

  let zoneN = 0
  for (const zone of zones.value) {
    const xs = zone.points.map(p => p.x)
    const ys = zone.points.map(p => p.y)
    const x0 = Math.min(...xs)
    const y0 = Math.min(...ys)
    const w = Math.max(...xs) - x0
    const h = Math.max(...ys) - y0
    if (w < 1 || h < 1) continue
    const ctx = makeCanvas(w, h)
    if (!ctx) continue
    // Keep only the path interior, translated so the bbox lands at (0, 0).
    ctx.save()
    ctx.beginPath()
    zone.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x - x0, p.y - y0) : ctx.lineTo(p.x - x0, p.y - y0)))
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(img.el, -x0, -y0)
    ctx.restore()
    await rasterize(ctx, `${base}_zone${++zoneN}.${ext}`, null, zone)
  }
  return pieces
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function piecesToZip(pieces: CutPiece[]): Promise<Blob> {
  const zip = new JSZip()
  for (const piece of pieces) zip.file(piece.name, piece.blob)
  return zip.generateAsync({ type: 'blob' })
}

export function disposePieces(pieces: CutPiece[]) {
  for (const piece of pieces) URL.revokeObjectURL(piece.url)
}

export function useCutter() {
  return {
    image,
    vLines,
    hLines,
    cells,
    zones,
    loadImage,
    setImage,
    seedLines,
    moveLine,
    addLine,
    removeLine,
    addZone,
    removeZone,
    clearZones,
    cutImage,
    downloadBlob,
    piecesToZip,
    disposePieces,
  }
}
