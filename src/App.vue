<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Scissors } from 'lucide-vue-next'
import BackgroundPanel from './components/BackgroundPanel.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import DropZone from './components/DropZone.vue'
import EditorCanvas from './components/EditorCanvas.vue'
import PiecesGallery from './components/PiecesGallery.vue'
import type { BgOptions, RGB } from './composables/background'
import type { CutPiece, OutputFormat, ToolMode, TrimOptions } from './composables/useCutter'
import { disposePieces, loadImage, seedLines, setImage, useCutter } from './composables/useCutter'

const { image, vLines, hLines, cells, zones, cutImage, moveLine, addLine, removeLine, addZone, removeZone, clearZones } = useCutter()

const columns = ref<number | null>(null)
const rows = ref<number | null>(null)
const addMode = ref<ToolMode | null>(null)
const picking = ref(false)
const format = ref<OutputFormat>('png')
const quality = ref(0.92)
const pieces = ref<CutPiece[]>([])
const busy = ref(false)
const loadError = ref('')

// White-background removal: on by default, tuned for sprite sheets —
// 'edges' keeps background-colored details inside the artwork.
const bg = reactive<BgOptions>({ enabled: true, color: [255, 255, 255], tolerance: 15, mode: 'edges' })
const bgPreview = ref(true)
const trim = reactive<TrimOptions>({ enabled: false, padding: 0 })

function onPickColor(color: RGB) {
  bg.color = color
  bg.enabled = true
}

const lineCount = computed(() => vLines.value.length + hLines.value.length)
/** Everything one "Cut image" run will produce: grid cells + drawn zones. */
const pieceCount = computed(() => cells.value.length + zones.value.length)
const baseName = computed(() => image.value?.name.replace(/\.[^.]+$/, '') || 'image')

// Workflow step for the header indicator.
const step = computed(() => {
  if (!image.value) return 1
  if (pieceCount.value === 0) return 2
  return pieces.value.length > 0 ? 4 : 3
})

const canCut = computed(() => !!image.value && pieceCount.value > 0 && !busy.value)

const cutHint = computed(() => {
  if (!image.value) return 'Import an image first'
  if (pieceCount.value === 0) return 'Add a cut line or draw a zone'
  return `Cut into ${pieceCount.value} piece${pieceCount.value === 1 ? '' : 's'}`
})

// "Settings changed" detection for the gallery.
const lastCutSig = ref<string | null>(null)
const currentSig = computed(() =>
  JSON.stringify({
    v: vLines.value,
    h: hLines.value,
    z: zones.value,
    f: format.value,
    q: quality.value,
    b: [bg.enabled, bg.color, bg.tolerance, bg.mode],
    t: [trim.enabled, trim.padding],
  }),
)
const piecesStale = computed(
  () => pieces.value.length > 0 && lastCutSig.value !== null && lastCutSig.value !== currentSig.value,
)

// Counts only seed their own axis, so manual drags on the other axis survive.
watch(columns, count => {
  if (image.value) seedLines('v', count ?? null)
})
watch(rows, count => {
  if (image.value) seedLines('h', count ?? null)
})

async function onFile(file: File) {
  loadError.value = ''
  try {
    const loaded = await loadImage(file)
    disposePieces(pieces.value)
    pieces.value = []
    lastCutSig.value = null
    addMode.value = null
    setImage(loaded)
    seedLines('v', columns.value ?? null)
    seedLines('h', rows.value ?? null)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Could not load this image.'
  }
}

function onReset() {
  clearZones()
  seedLines('v', columns.value ?? null)
  seedLines('h', rows.value ?? null)
}

async function onCut() {
  if (busy.value || !image.value) return
  busy.value = true
  const sig = currentSig.value
  try {
    const next = await cutImage(format.value, quality.value, { ...bg }, { ...trim })
    disposePieces(pieces.value)
    pieces.value = next
    lastCutSig.value = sig
  } finally {
    busy.value = false
  }
}

// Drop an image anywhere on the page.
const dragDepth = ref(0)

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragDepth.value++
}

function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth.value = 0
  const file = e.dataTransfer?.files?.[0]
  if (file) onFile(file)
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('drop', onDrop)
  disposePieces(pieces.value)
})
</script>

<template>
  <div class="app">
    <header class="app-bar">
      <div class="brand">
        <span class="brand-mark">✂</span>
        <div class="brand-text">
          <h1>Image Cutter</h1>
          <p>Split · cut the background · export</p>
        </div>
      </div>
      <ol class="steps" aria-label="Workflow">
        <li :class="{ active: step === 1, done: step > 1 }"><span>{{ step > 1 ? '✓' : '1' }}</span> Import</li>
        <li :class="{ active: step === 2, done: step > 2 }"><span>{{ step > 2 ? '✓' : '2' }}</span> Split</li>
        <li :class="{ active: step === 3, done: step > 3 }"><span>{{ step > 3 ? '✓' : '3' }}</span> Cut</li>
        <li :class="{ active: step === 4 }"><span>4</span> Export</li>
      </ol>
      <div class="app-actions">
        <button
          class="btn primary cut"
          type="button"
          :disabled="!canCut"
          :title="cutHint"
          @click="onCut"
        >
          <span v-if="busy" class="spinner"></span>
          <Scissors v-else :size="15" />
          {{ busy ? 'Cutting…' : 'Cut image' }}
        </button>
      </div>
    </header>

    <main class="workbench" :class="{ 'with-tray': pieces.length > 0 }">
      <aside class="controls-col">
        <DropZone :image="image" :error="loadError" @file="onFile" />
        <ControlsPanel
          v-model:columns="columns"
          v-model:rows="rows"
          v-model:format="format"
          v-model:quality="quality"
          v-model:trim-enabled="trim.enabled"
          v-model:trim-padding="trim.padding"
          :has-image="!!image"
          :line-count="lineCount"
          :zone-count="zones.length"
          @reset="onReset"
        />
        <BackgroundPanel
          v-model:enabled="bg.enabled"
          v-model:color="bg.color"
          v-model:tolerance="bg.tolerance"
          v-model:mode="bg.mode"
          v-model:preview="bgPreview"
          :has-image="!!image"
          :lossy-format="format === 'jpeg'"
        />
      </aside>

      <section class="canvas-col">
        <EditorCanvas
          v-model:add-mode="addMode"
          v-model:picking="picking"
          :image="image"
          :v-lines="vLines"
          :h-lines="hLines"
          :cells="cells"
          :zones="zones"
          :bg-options="bg"
          :bg-preview="bgPreview && bg.enabled"
          @move-line="(a, i, p) => moveLine(a, i, p)"
          @add-line="(a, p) => addLine(a, p)"
          @remove-line="removeLine"
          @add-zone="addZone"
          @remove-zone="removeZone"
          @pick="onPickColor"
        />
      </section>

      <aside v-if="pieces.length" class="tray-col">
        <PiecesGallery :pieces="pieces" :base-name="baseName" :stale="piecesStale" />
      </aside>
    </main>

    <Transition name="drop-fade">
      <div v-if="dragDepth > 0" class="drop-overlay">
        <div class="drop-card">Drop to import</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}

/* ---------- app bar ---------- */

.app-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-right: auto;
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  font-size: 17px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(47, 214, 169, 0.35);
  border-radius: 10px;
  transform: rotate(-6deg);
}

.brand-text h1 {
  margin: 0;
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.brand-text p {
  margin: 1px 0 0;
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
}

.steps {
  display: flex;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.steps li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 550;
  color: var(--faint);
  padding: 4px 10px 4px 5px;
  border-radius: 999px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.steps li span {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--muted);
}

.steps li.active {
  color: var(--text);
  border-color: var(--border);
  background: var(--panel);
}

.steps li.active span {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-ink);
}

.steps li.done {
  color: var(--muted);
}

.steps li.done span {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
}

/* narrow header: keep the numbered dots, drop the labels */
@media (max-width: 1240px) {
  .steps li {
    font-size: 0;
    gap: 0;
    padding: 4px;
  }
}

.cut {
  min-width: 132px;
  min-height: 38px;
  font-size: 14px;
  border-radius: 10px;
}

/* ---------- workbench ---------- */

.workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
}

.workbench.with-tray {
  grid-template-columns: 268px minmax(0, 1fr) 316px;
}

.controls-col {
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px;
  margin: -2px;
}

.canvas-col {
  min-height: 0;
  min-width: 0;
  display: flex;
}

.canvas-col > :deep(.editor-viewport) {
  flex: 1;
  height: auto;
}

.tray-col {
  min-height: 0;
  display: flex;
}

.tray-col > :deep(.panel) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ---------- drop overlay ---------- */

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(8, 11, 15, 0.7);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  pointer-events: none;
}

.drop-card {
  padding: 28px 48px;
  border: 2px dashed var(--accent);
  border-radius: 16px;
  background: var(--panel);
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-strong);
  box-shadow: var(--shadow);
}

.drop-fade-enter-active,
.drop-fade-leave-active {
  transition: opacity 0.15s;
}

.drop-fade-enter-from,
.drop-fade-leave-to {
  opacity: 0;
}

/* ---------- stacked fallback for narrow screens ---------- */

@media (max-width: 1099px) {
  .app {
    height: auto;
    min-height: 100vh;
  }

  .workbench,
  .workbench.with-tray {
    display: flex;
    flex-direction: column;
  }

  .canvas-col {
    order: -1;
    height: 56vh;
  }

  .controls-col {
    overflow: visible;
  }

  .tray-col {
    min-height: 280px;
  }
}
</style>
