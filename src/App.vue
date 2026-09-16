<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Eraser, Github, Grid2x2, Lasso, Lock, Scissors, Sparkles } from 'lucide-vue-next'
import BackgroundPanel from './components/BackgroundPanel.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import DropZone from './components/DropZone.vue'
import EditorCanvas from './components/EditorCanvas.vue'
import PiecesGallery from './components/PiecesGallery.vue'
import type { BgOptions, RGB } from './composables/background'
import type { CutPiece, OutputFormat, ToolMode, TrimOptions } from './composables/useCutter'
import { disposePieces, loadImage, seedLines, setImage, useCutter } from './composables/useCutter'

const repoUrl = 'https://github.com/stevenosse/imgtool'
const xUrl = 'https://x.com/nossesteve'

const { image, vLines, hLines, cells, zones, cutImage, moveLine, addLine, removeLine, addZone, removeZone, clearZones } = useCutter()

// Two views: a marketing landing page and the editor. Dropping an image
// anywhere (or opening #/editor) takes you straight into the tool.
type View = 'landing' | 'editor'
const view = ref<View>(location.hash === '#/editor' ? 'editor' : 'landing')

function onHash() {
  view.value = location.hash === '#/editor' ? 'editor' : 'landing'
}

function openEditor() {
  if (view.value !== 'editor') location.hash = '#/editor'
}

function openLanding() {
  if (view.value !== 'landing') location.hash = '#/'
}

onMounted(() => window.addEventListener('hashchange', onHash))
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))

const columns = ref<number | null>(null)
const rows = ref<number | null>(null)
const addMode = ref<ToolMode | null>(null)
const picking = ref(false)
const format = ref<OutputFormat>('png')
const quality = ref(0.92)
const pieces = ref<CutPiece[]>([])
const busy = ref(false)
const loadError = ref('')

// White-background removal: on by default, tuned for sprite sheets;
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
  openEditor()
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

// Drop an image anywhere on the page, from either view.
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
  <div class="app" :class="{ 'is-editor': view === 'editor' }">
    <header class="app-bar">
      <button class="brand" type="button" title="ImgTool home" @click="openLanding">
        <span class="brand-mark"><Scissors :size="17" /></span>
        <span class="brand-text">
          <span class="brand-name">ImgTool</span>
          <span class="brand-tag">Cut, split &amp; export in your browser</span>
        </span>
      </button>
      <ol v-if="view === 'editor'" class="steps" aria-label="Workflow">
        <li :class="{ active: step === 1, done: step > 1 }"><span>{{ step > 1 ? '✓' : '1' }}</span> Import</li>
        <li :class="{ active: step === 2, done: step > 2 }"><span>{{ step > 2 ? '✓' : '2' }}</span> Split</li>
        <li :class="{ active: step === 3, done: step > 3 }"><span>{{ step > 3 ? '✓' : '3' }}</span> Cut</li>
        <li :class="{ active: step === 4 }"><span>4</span> Export</li>
      </ol>
      <div class="app-actions">
        <a class="btn" :href="repoUrl" target="_blank" rel="noopener" title="Star or fork on GitHub">
          <Github :size="15" />
          GitHub
        </a>
        <button
          v-if="view === 'editor'"
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

    <template v-if="view === 'editor'">
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
    </template>

    <template v-else>
      <main class="landing">
        <section class="hero">
          <span class="hero-badge">
            <Sparkles :size="13" />
            Free &amp; open source · nothing ever leaves your browser
          </span>
          <h2 class="hero-title">Cut images like a pro.<br />No signup. No uploads.</h2>
          <p class="hero-sub">
            Slice sprite sheets with a draggable grid, trace irregular shapes with the lasso,
            strip flat backgrounds and export polished pieces as PNG, JPEG, WebP, or grab
            everything as a ZIP.
          </p>
          <div class="hero-cta">
            <button class="btn primary hero-btn" type="button" @click="openEditor">
              Start cutting · it's free
            </button>
            <a class="btn hero-btn" :href="repoUrl" target="_blank" rel="noopener">
              <Github :size="15" />
              Contribute on GitHub
            </a>
          </div>
          <p class="hero-drop">…or just drop an image anywhere on this page</p>
        </section>

        <section class="features" aria-label="Features">
          <div class="feature-card">
            <div class="feature-ico"><Grid2x2 :size="18" /></div>
            <h3>Pixel-perfect grid slicing</h3>
            <p>Set columns and rows, then drag any cut line exactly where you need it. Every piece exports at full resolution.</p>
          </div>
          <div class="feature-card">
            <div class="feature-ico"><Lasso :size="18" /></div>
            <h3>Freeform lasso &amp; polygon zones</h3>
            <p>Irregular sprite? Trace it freehand or click out a polygon and cut any shape, not just rectangles.</p>
          </div>
          <div class="feature-card">
            <div class="feature-ico"><Eraser :size="18" /></div>
            <h3>One-click background removal</h3>
            <p>Edge-aware, halo-free transparency for flat backgrounds. Sample any color straight from the image with the eyedropper.</p>
          </div>
          <div class="feature-card">
            <div class="feature-ico"><Lock :size="18" /></div>
            <h3>Private by design</h3>
            <p>Everything runs locally in your browser. There is no server, so your images literally can't leave your device.</p>
          </div>
        </section>
      </main>

      <footer class="footer">
        <div class="footer-card">
          <div class="footer-copy">
            <p class="footer-title">Built in the open. Contributions are welcome!</p>
            <p class="footer-fine">ImgTool · free forever · made with Vue 3</p>
          </div>
          <div class="footer-links">
            <a class="footer-chip" :href="repoUrl" target="_blank" rel="noopener" title="Star or fork on GitHub">
              <Github :size="14" />
              Star or fork
            </a>
            <a class="footer-chip" :href="xUrl" target="_blank" rel="noopener" title="Follow @nossesteve on X">
              <svg class="x-logo" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
              </svg>
              Follow @nossesteve
            </a>
          </div>
        </div>
      </footer>
    </template>

    <Transition name="drop-fade">
      <div v-if="dragDepth > 0" class="drop-overlay">
        <div class="drop-card">Drop to import</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
}

.app.is-editor {
  height: 100dvh;
}

/* ---------- app bar ---------- */

.app-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin: 0 -16px 12px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-right: auto;
  appearance: none;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #ffffff;
  background: var(--accent);
  border-radius: 10px;
  transform: rotate(-6deg);
  box-shadow: 0 4px 10px rgba(62, 143, 255, 0.3);
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-size: 15.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.brand-tag {
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
}

.steps {
  display: flex;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: var(--shadow);
}

.steps li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--faint);
  padding: 4px 10px 4px 5px;
  border-radius: 999px;
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
  border-radius: 50%;
  color: var(--muted);
}

.steps li.active {
  color: var(--text);
  background: var(--accent-soft);
}

.steps li.active span {
  background: var(--accent);
  color: #ffffff;
}

.steps li.done {
  color: var(--muted);
}

.steps li.done span {
  background: var(--accent-soft);
  color: var(--accent-strong);
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

/* ---------- landing ---------- */

.landing {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 20px 0 12px;
}

.hero {
  text-align: center;
  padding: 28px 16px 20px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--accent-soft);
  border: 1px solid rgba(62, 143, 255, 0.3);
  color: var(--accent-strong);
  font-size: 12.5px;
  font-weight: 650;
}

.hero-title {
  margin: 18px 0 0;
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.06;
  font-weight: 800;
  letter-spacing: -0.035em;
}

.hero-sub {
  margin: 16px auto 0;
  max-width: 620px;
  font-size: 15px;
  color: var(--muted);
}

.hero-cta {
  margin-top: 22px;
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.hero-btn {
  min-height: 42px;
  padding: 0 20px;
  font-size: 14px;
  border-radius: 12px;
}

.hero-drop {
  margin: 16px 0 0;
  font-size: 12.5px;
  color: var(--faint);
}

/* ---------- features ---------- */

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  padding: 4px 0;
}

.feature-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 18px;
}

.feature-ico {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent-strong);
  border-radius: 11px;
  margin-bottom: 12px;
}

.feature-card h3 {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.feature-card p {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--muted);
}

/* ---------- footer ---------- */

.footer {
  padding: 8px 0 24px;
}

.footer-card {
  max-width: 980px;
  margin: 0 auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.footer-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.footer p.footer-fine {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--faint);
}

.footer-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.footer-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.footer-chip:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-strong);
}

/* ---------- workbench (editor view) ---------- */

.workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 12px;
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
  background: rgba(240, 244, 251, 0.75);
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
  .app.is-editor {
    height: auto;
    min-height: 100dvh;
  }

  .workbench,
  .workbench.with-tray {
    display: flex;
    flex-direction: column;
    min-height: 0;
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
