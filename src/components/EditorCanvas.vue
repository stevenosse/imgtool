<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Lasso, Maximize, MousePointer2, PenTool, Pipette, SeparatorHorizontal, SeparatorVertical, ZoomIn, ZoomOut } from 'lucide-vue-next'
import type { BgOptions, RGB } from '../composables/background'
import { removeBackground } from '../composables/background'
import type { Cell, LineAxis, LoadedImage, ToolMode, Zone, ZonePoint } from '../composables/useCutter'

const props = defineProps<{
  image: LoadedImage | null
  vLines: number[]
  hLines: number[]
  cells: Cell[]
  zones: Zone[]
  bgOptions: BgOptions
  bgPreview: boolean
}>()

const addMode = defineModel<ToolMode | null>('addMode')
const picking = defineModel<boolean>('picking')

const emit = defineEmits<{
  moveLine: [axis: LineAxis, index: number, position: number]
  addLine: [axis: LineAxis, position: number]
  removeLine: [axis: LineAxis, index: number]
  pick: [color: RGB]
  addZone: [kind: Zone['kind'], points: ZonePoint[]]
  removeZone: [id: number]
}>()

function toggleAddMode(mode: ToolMode) {
  addMode.value = addMode.value === mode ? null : mode
  picking.value = false
}

function togglePicking() {
  picking.value = !picking.value
  addMode.value = null
}

function selectTool() {
  addMode.value = null
  picking.value = false
}

const viewport = ref<HTMLDivElement | null>(null)
const stage = ref<HTMLDivElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const vpSize = ref({ w: 0, h: 0 })

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    const rect = entries[0].contentRect
    vpSize.value = { w: rect.width, h: rect.height }
  })
  if (viewport.value) resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// --- zoom -------------------------------------------------------------------
// Base scale fits the image in the viewport; zoom multiplies on top of that.
// When zoomed in, the viewport scrolls to pan.

const ZOOM_MIN = 1
const ZOOM_MAX = 8
const MARGIN = 16

const zoom = ref(1)

const fitScale = computed(() => {
  const img = props.image
  const vp = vpSize.value
  if (!img || vp.w <= 0 || vp.h <= 0) return 1
  const pad = 32
  const availW = Math.max(vp.w - pad, 40)
  const availH = Math.max(vp.h - pad, 40)
  return Math.min(availW / img.width, availH / img.height, 10)
})

const scale = computed(() => fitScale.value * zoom.value)
const stageW = computed(() => (props.image ? Math.round(props.image.width * scale.value) : 0))
const stageH = computed(() => (props.image ? Math.round(props.image.height * scale.value) : 0))
const stageOffset = computed(() => ({
  x: Math.max((vpSize.value.w - stageW.value) / 2, MARGIN),
  y: Math.max((vpSize.value.h - stageH.value) / 2, MARGIN),
}))

function zoomBy(factor: number) {
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(zoom.value * factor).toFixed(4)))
}

function resetZoom() {
  zoom.value = 1
}

// Ctrl/⌘ + wheel zooms toward the cursor; plain wheel pans (native scroll).
function onWheel(e: WheelEvent) {
  if (!props.image || !(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  const vp = viewport.value
  if (!vp) return
  const rect = vp.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const ix = (cx + vp.scrollLeft - stageOffset.value.x) / scale.value
  const iy = (cy + vp.scrollTop - stageOffset.value.y) / scale.value
  zoomBy(e.deltaY < 0 ? 1.25 : 0.8)
  vp.scrollLeft = ix * scale.value + stageOffset.value.x - cx
  vp.scrollTop = iy * scale.value + stageOffset.value.y - cy
}

// --- pointer interaction ----------------------------------------------------

const dragging = ref<{ axis: LineAxis; index: number } | null>(null)
const hover = ref<{ x: number; y: number } | null>(null)

function toImageCoords(e: { clientX: number; clientY: number }) {
  const rect = stage.value!.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) / scale.value,
    y: (e.clientY - rect.top) / scale.value,
  }
}

function onStagePointerMove(e: PointerEvent) {
  if (!stage.value || dragging.value) return
  hover.value = toImageCoords(e)
}

function onStagePointerLeave() {
  hover.value = null
}

// Window-level listeners instead of pointer capture: capture retargets the
// second click of a double-click to the stage, which would break line deletion.
function onLinePointerDown(e: PointerEvent, axis: LineAxis, index: number) {
  if (addMode.value || picking.value) return
  e.preventDefault()
  dragging.value = { axis, index }
  window.addEventListener('pointermove', onWinPointerMove)
  window.addEventListener('pointerup', onWinPointerUp)
  window.addEventListener('pointercancel', onWinPointerUp)
}

function onWinPointerMove(e: PointerEvent) {
  if (!dragging.value || !stage.value) return
  const p = toImageCoords(e)
  hover.value = p
  emit('moveLine', dragging.value.axis, dragging.value.index, dragging.value.axis === 'v' ? p.x : p.y)
}

function onWinPointerUp() {
  dragging.value = null
  window.removeEventListener('pointermove', onWinPointerMove)
  window.removeEventListener('pointerup', onWinPointerUp)
  window.removeEventListener('pointercancel', onWinPointerUp)
}

// --- freeform zone drawing ---------------------------------------------------

const draft = ref<{ kind: Zone['kind']; points: ZonePoint[] } | null>(null)
const selectedZoneId = ref<number | null>(null)
const isSelectMode = computed(() => !addMode.value && !picking.value)
let lastZoneCloseAt = 0

/** Start a freehand stroke; runs on the stage, so line presses bubble here too. */
function onStagePointerDown(e: PointerEvent) {
  if (addMode.value !== 'freehand') return
  e.preventDefault()
  draft.value = { kind: 'freehand', points: [toImageCoords(e)] }
  window.addEventListener('pointermove', onDrawPointerMove)
  window.addEventListener('pointerup', onDrawPointerUp)
  window.addEventListener('pointercancel', onDrawPointerUp)
}

function onDrawPointerMove(e: PointerEvent) {
  if (!draft.value || !stage.value) return
  const p = toImageCoords(e)
  const pts = draft.value.points
  const last = pts[pts.length - 1]
  // Decimate: skip points nearer than ~2 screen px to keep the polygon small.
  if (last && Math.hypot(p.x - last.x, p.y - last.y) * scale.value < 2) return
  draft.value = { ...draft.value, points: [...pts, p] }
}

function onDrawPointerUp() {
  window.removeEventListener('pointermove', onDrawPointerMove)
  window.removeEventListener('pointerup', onDrawPointerUp)
  window.removeEventListener('pointercancel', onDrawPointerUp)
  const d = draft.value
  draft.value = null
  // The composable validates and silently rejects degenerate shapes.
  if (d) emit('addZone', d.kind, d.points)
}

function addPolygonVertex(p: ZonePoint) {
  if (performance.now() - lastZoneCloseAt < 250) return
  const d = draft.value
  if (!d) {
    draft.value = { kind: 'polygon', points: [p] }
    return
  }
  const last = d.points[d.points.length - 1]
  // Ignore sub-pixel repeats — the second click of a double-click lands here too.
  if (last && Math.hypot(p.x - last.x, p.y - last.y) * scale.value < 2) return
  draft.value = { ...d, points: [...d.points, p] }
}

function closePolygonDraft() {
  const d = draft.value
  if (!d) return
  const pts = [...d.points]
  // Drop the vertex the closing double-click may have jittered in.
  if (pts.length >= 2) {
    const a = pts[pts.length - 1]
    const b = pts[pts.length - 2]
    if (Math.hypot(a.x - b.x, a.y - b.y) * scale.value < 4) pts.pop()
  }
  draft.value = null
  lastZoneCloseAt = performance.now()
  if (pts.length >= 3) emit('addZone', d.kind, pts)
}

function selectZone(id: number) {
  selectedZoneId.value = selectedZoneId.value === id ? null : id
}

function zonePointsAttr(points: ZonePoint[]): string {
  return points.map(p => `${p.x},${p.y}`).join(' ')
}

function onStageClick(e: MouseEvent) {
  if (picking.value) {
    pickColorAt(e)
    return
  }
  if (addMode.value === 'v' || addMode.value === 'h') {
    const p = toImageCoords(e)
    emit('addLine', addMode.value, addMode.value === 'v' ? p.x : p.y)
    return
  }
  if (addMode.value === 'polygon') addPolygonVertex(toImageCoords(e))
}

function onStageDblClick() {
  if (addMode.value === 'polygon') closePolygonDraft()
}

/** Sample the original image's color under the click and hand it to the app. */
function pickColorAt(e: MouseEvent) {
  const img = props.image
  if (!img) return
  const p = toImageCoords(e)
  const x = Math.min(img.width - 1, Math.max(0, Math.round(p.x)))
  const y = Math.min(img.height - 1, Math.max(0, Math.round(p.y)))
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(img.el, x, y, 1, 1, 0, 0, 1, 1)
  const dd = ctx.getImageData(0, 0, 1, 1).data
  emit('pick', [dd[0], dd[1], dd[2]])
  picking.value = false
}

function onLineDblClick(axis: LineAxis, index: number) {
  emit('removeLine', axis, index)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    // Cancel the in-progress drawing first, keeping the tool active.
    if (draft.value) draft.value = null
    else if (addMode.value) addMode.value = null
    else if (picking.value) picking.value = false
    else selectedZoneId.value = null
  } else if (e.key === 'Enter' && draft.value?.kind === 'polygon') {
    closePolygonDraft()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedZoneId.value !== null) {
    const t = e.target as HTMLElement | null
    if (!t || !t.closest('input, textarea, select, [contenteditable]')) {
      emit('removeZone', selectedZoneId.value)
      selectedZoneId.value = null
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  onWinPointerUp()
  if (previewTimer) clearTimeout(previewTimer)
})

// Drop stale cursor state when the image changes.
watch(() => props.image, () => {
  hover.value = null
  dragging.value = null
  draft.value = null
  selectedZoneId.value = null
  zoom.value = 1
})

// Switching tools discards any unfinished zone.
watch(addMode, () => {
  draft.value = null
  selectedZoneId.value = null
})

// --- background-removal live preview ---------------------------------------

let previewTimer: ReturnType<typeof setTimeout> | undefined

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(renderPreview, 140)
}

async function renderPreview() {
  const img = props.image
  const cv = previewCanvas.value
  if (!img || !cv || !props.bgPreview) return
  if (cv.width !== img.width || cv.height !== img.height) {
    cv.width = img.width
    cv.height = img.height
  }
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.drawImage(img.el, 0, 0)
  if (props.bgOptions.enabled) {
    const id = ctx.getImageData(0, 0, cv.width, cv.height)
      removeBackground(id, props.bgOptions)
    ctx.putImageData(id, 0, 0)
  }
}

watch(
  () => [
    props.image,
    props.bgPreview,
    props.bgOptions.enabled,
    props.bgOptions.color,
    props.bgOptions.tolerance,
    props.bgOptions.mode,
  ] as const,
  () => {
    if (props.bgPreview) schedulePreview()
  },
)
watch(() => props.bgPreview, on => {
  if (on) nextTick(schedulePreview)
  else if (previewTimer) clearTimeout(previewTimer)
})

const hoverCell = computed<Cell | null>(() => {
  const p = hover.value
  const img = props.image
  if (!p || !img || dragging.value || addMode.value || picking.value) return null
  if (p.x < 0 || p.y < 0 || p.x >= img.width || p.y >= img.height) return null
  return props.cells.find(c => p.x >= c.x && p.x < c.x + c.w && p.y >= c.y && p.y < c.y + c.h) ?? null
})

function cellStyle(cell: Cell) {
  const s = scale.value
  return {
    left: `${cell.x * s}px`,
    top: `${cell.y * s}px`,
    width: `${cell.w * s}px`,
    height: `${cell.h * s}px`,
  }
}

function badgeStyle(cell: Cell) {
  const s = scale.value
  return {
    left: `${cell.x * s + 6}px`,
    top: `${cell.y * s + 6}px`,
  }
}
</script>

<template>
  <div ref="viewport" class="editor-viewport" @wheel="onWheel">
    <div v-if="!image" class="editor-empty">
      <div class="empty-mark">✂</div>
      <p class="empty-title">No image yet</p>
      <p class="empty-sub">Drop one anywhere on this page, paste it, or pick a file from the sidebar</p>
    </div>

    <div
      v-else
      ref="stage"
      class="stage"
      :class="{ 'add-mode': !!addMode, dragging: !!dragging, picking: picking }"
      :style="{
        width: `${stageW}px`,
        height: `${stageH}px`,
        left: `${stageOffset.x}px`,
        top: `${stageOffset.y}px`,
      }"
      @pointerdown="onStagePointerDown"
      @pointermove="onStagePointerMove"
      @pointerleave="onStagePointerLeave"
      @pointerup="onWinPointerUp"
      @pointercancel="onWinPointerUp"
      @click="onStageClick"
      @dblclick="onStageDblClick"
    >
      <img v-if="!bgPreview" class="stage-img" :src="image.url" alt="" draggable="false" />
      <canvas v-else ref="previewCanvas" class="stage-img"></canvas>

      <!-- freeform zones: committed (selectable in select mode) + live draft -->
      <svg
        class="zones-overlay"
        :class="{ selectable: isSelectMode, 'polygon-mode': addMode === 'polygon' }"
        :viewBox="`0 0 ${image.width} ${image.height}`"
        preserveAspectRatio="none"
      >
        <polygon
          v-for="zone in zones"
          :key="zone.id"
          class="zone"
          :class="{ selected: zone.id === selectedZoneId }"
          :points="zonePointsAttr(zone.points)"
          @click.stop="selectZone(zone.id)"
        />
        <polygon
          v-if="draft && draft.points.length >= 2"
          class="zone draft"
          :points="zonePointsAttr(draft.points)"
        />
        <polyline
          v-if="draft?.kind === 'polygon' && hover"
          class="zone-rubber"
          :points="zonePointsAttr([...draft.points, hover])"
        />
        <circle
          v-if="draft?.kind === 'polygon' && draft.points.length >= 3"
          class="zone-close-hint"
          :cx="draft.points[0].x"
          :cy="draft.points[0].y"
          :r="5 / scale"
          @click.stop="closePolygonDraft"
        />
      </svg>

      <!-- pick marker: ring at the sampled point -->
      <div
        v-if="picking && hover"
        class="pick-marker"
        :style="{ left: `${hover.x * scale}px`, top: `${hover.y * scale}px` }"
      ></div>

      <!-- hovered cell highlight -->
      <div v-if="hoverCell" class="cell-highlight" :style="cellStyle(hoverCell)"></div>

      <!-- placement guide in add mode -->
      <div
        v-if="addMode === 'v' && hover"
        class="guide guide-v"
        :style="{ left: `${hover.x * scale}px` }"
      ></div>
      <div
        v-else-if="addMode === 'h' && hover"
        class="guide guide-h"
        :style="{ top: `${hover.y * scale}px` }"
      ></div>

      <!-- cut lines -->
      <div
        v-for="(x, i) in vLines"
        :key="`v${i}`"
        class="cutline cutline-v"
        :class="{ active: dragging?.axis === 'v' && dragging.index === i }"
        :style="{ left: `${x * scale}px` }"
        @pointerdown="onLinePointerDown($event, 'v', i)"
        @dblclick="onLineDblClick('v', i)"
      ></div>
      <div
        v-for="(y, i) in hLines"
        :key="`h${i}`"
        class="cutline cutline-h"
        :class="{ active: dragging?.axis === 'h' && dragging.index === i }"
        :style="{ top: `${y * scale}px` }"
        @pointerdown="onLinePointerDown($event, 'h', i)"
        @dblclick="onLineDblClick('h', i)"
      ></div>

      <!-- hovered cell size badge -->
      <div v-if="hoverCell" class="size-badge" :style="badgeStyle(hoverCell)">
        {{ Math.round(hoverCell.w) }} × {{ Math.round(hoverCell.h) }} px
      </div>
    </div>

    <!-- floating HUD: tool rail + zoom controls -->
    <div v-if="image" class="canvas-hud">
      <div class="tool-rail">
        <button
          class="tool"
          type="button"
          title="Select — drag lines, click a zone then Delete to remove it"
          :class="{ active: !addMode && !picking }"
          @click="selectTool"
        >
          <MousePointer2 :size="15" />
        </button>
        <button
          class="tool"
          type="button"
          title="Add vertical line"
          :class="{ active: addMode === 'v' }"
          @click="toggleAddMode('v')"
        >
          <SeparatorVertical :size="15" />
        </button>
        <button
          class="tool"
          type="button"
          title="Add horizontal line"
          :class="{ active: addMode === 'h' }"
          @click="toggleAddMode('h')"
        >
          <SeparatorHorizontal :size="15" />
        </button>
        <button
          class="tool"
          type="button"
          title="Freehand zone — drag to draw a cut region"
          :class="{ active: addMode === 'freehand' }"
          @click="toggleAddMode('freehand')"
        >
          <Lasso :size="15" />
        </button>
        <button
          class="tool"
          type="button"
          title="Polygon zone — click points, double-click or Enter to close"
          :class="{ active: addMode === 'polygon' }"
          @click="toggleAddMode('polygon')"
        >
          <PenTool :size="15" />
        </button>
        <button
          v-if="bgOptions.enabled"
          class="tool"
          type="button"
          title="Pick background color"
          :class="{ active: picking }"
          @click="togglePicking"
        >
          <Pipette :size="15" />
        </button>
      </div>

      <div class="canvas-toolbar">
        <button class="tool" type="button" title="Zoom out (⌘/Ctrl + scroll)" @click="zoomBy(0.8)">
          <ZoomOut :size="15" />
        </button>
        <button class="tool zoom-level" type="button" title="Fit to view" @click="resetZoom">
          {{ Math.round(zoom * 100) }}%
        </button>
        <button class="tool" type="button" title="Zoom in (⌘/Ctrl + scroll)" @click="zoomBy(1.25)">
          <ZoomIn :size="15" />
        </button>
        <button class="tool" type="button" title="Fit to view" @click="resetZoom">
          <Maximize :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-viewport {
  position: relative;
  height: 100%;
  min-height: 320px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  box-shadow: var(--shadow);
  background:
    conic-gradient(#191d25 25%, #141821 0 50%, #191d25 0 75%, #141821 0) 0 0 / 20px 20px;
}

.editor-empty {
  position: sticky;
  left: 0;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
  padding: 24px;
}

.empty-mark {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  font-size: 26px;
  color: var(--accent);
  border: 2px dashed var(--border);
  border-radius: 16px;
  margin-bottom: 10px;
  transform: rotate(-8deg);
}

.empty-title {
  margin: 0;
  font-weight: 650;
  color: var(--text);
}

.empty-sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
  max-width: 300px;
}

.stage {
  position: absolute;
  overflow: hidden;
  touch-action: none;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 12px 40px rgba(0, 0, 0, 0.45);
}

.stage.add-mode,
.stage.picking {
  cursor: crosshair;
}

.pick-marker {
  position: absolute;
  z-index: 4;
  width: 14px;
  height: 14px;
  border: 2px solid var(--accent-strong);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.canvas-hud {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 5;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  pointer-events: none;
}

.canvas-hud .tool-rail,
.canvas-hud .canvas-toolbar {
  pointer-events: auto;
}

.tool-rail {
  width: fit-content;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 3px;
  background: rgba(13, 17, 22, 0.88);
  border: 1px solid var(--border);
  border-radius: 9px;
  backdrop-filter: blur(6px);
}

.tool-rail .tool {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s, color 0.15s;
}

.tool-rail .tool:hover {
  background: var(--panel-2);
  color: var(--text);
}

.tool-rail .tool.active {
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.stage.dragging {
  cursor: grabbing;
}

.stage-img {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-drag: none;
}

.cell-highlight {
  position: absolute;
  z-index: 1;
  background: rgba(47, 214, 169, 0.12);
  outline: 1px solid rgba(47, 214, 169, 0.5);
  pointer-events: none;
}

.guide {
  position: absolute;
  z-index: 2;
  pointer-events: none;
}

.guide-v {
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 2px dashed var(--accent-strong);
}

.guide-h {
  left: 0;
  right: 0;
  height: 0;
  border-top: 2px dashed var(--accent-strong);
}

/* ---------- freeform zones (SVG, image-space viewBox) ---------- */

.zones-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.zones-overlay .zone {
  fill: rgba(47, 214, 169, 0.12);
  stroke: var(--accent);
  stroke-width: 1.5;
  /* viewBox is in image px — keep strokes at a constant screen width when zoomed. */
  vector-effect: non-scaling-stroke;
}

.zones-overlay .zone.draft {
  fill: rgba(47, 214, 169, 0.08);
  stroke-dasharray: 5 4;
}

.zones-overlay.selectable .zone {
  pointer-events: auto;
  cursor: pointer;
}

.zones-overlay.selectable .zone:hover {
  fill: rgba(47, 214, 169, 0.22);
  stroke: var(--accent-strong);
}

.zones-overlay .zone.selected {
  fill: rgba(47, 214, 169, 0.25);
  stroke: var(--accent-strong);
  stroke-dasharray: 4 3;
}

.zone-rubber {
  fill: none;
  stroke: var(--accent-strong);
  stroke-width: 1;
  stroke-dasharray: 4 4;
  vector-effect: non-scaling-stroke;
  opacity: 0.8;
}

.zone-close-hint {
  fill: var(--accent);
  stroke: rgba(0, 0, 0, 0.5);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  opacity: 0;
  pointer-events: none;
}

.zones-overlay.polygon-mode .zone-close-hint {
  opacity: 0.9;
  pointer-events: auto;
  cursor: pointer;
}

.cutline {
  position: absolute;
  z-index: 3;
}

.cutline-v {
  top: 0;
  bottom: 0;
  width: 0;
  cursor: col-resize;
}

.cutline-h {
  left: 0;
  right: 0;
  height: 0;
  cursor: row-resize;
}

/* invisible hit area so thin lines are easy to grab */
.cutline::before {
  content: '';
  position: absolute;
}

.cutline-v::before {
  left: -8px;
  right: -8px;
  top: 0;
  bottom: 0;
}

.cutline-h::before {
  top: -8px;
  bottom: -8px;
  left: 0;
  right: 0;
}

.cutline::after {
  content: '';
  position: absolute;
  background: var(--accent);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}

.cutline-v::after {
  left: -1px;
  width: 2px;
  top: 0;
  bottom: 0;
}

.cutline-h::after {
  top: -1px;
  height: 2px;
  left: 0;
  right: 0;
}

.cutline:hover::after {
  background: var(--accent-strong);
}

.cutline.active::after {
  background: var(--danger);
}

.size-badge {
  position: absolute;
  z-index: 4;
  background: rgba(8, 11, 15, 0.88);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px;
  border-radius: 6px;
  pointer-events: none;
  white-space: nowrap;
}

.canvas-toolbar {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: rgba(13, 17, 22, 0.88);
  border: 1px solid var(--border);
  border-radius: 9px;
  backdrop-filter: blur(6px);
}

.canvas-toolbar .tool {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  min-width: 28px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s, color 0.15s;
}

.canvas-toolbar .tool:hover {
  background: var(--panel-2);
  color: var(--text);
}

.canvas-toolbar .zoom-level {
  font-size: 11.5px;
  min-width: 46px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
</style>
