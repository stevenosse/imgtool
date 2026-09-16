<script setup lang="ts">
import { Crop, Download, Scissors, Slice } from 'lucide-vue-next'
import type { OutputFormat } from '../composables/useCutter'

const columns = defineModel<number | null>('columns')
const rows = defineModel<number | null>('rows')
const format = defineModel<OutputFormat>('format', { default: 'png' })
const quality = defineModel<number>('quality', { default: 0.92 })
const trimEnabled = defineModel<boolean>('trimEnabled', { default: false })
const trimPadding = defineModel<number>('trimPadding', { default: 0 })

defineProps<{
  hasImage: boolean
  lineCount: number
  zoneCount: number
}>()

const emit = defineEmits<{
  reset: []
}>()

const formats: Array<{ value: OutputFormat; label: string; hint: string }> = [
  { value: 'png', label: 'PNG', hint: 'lossless' },
  { value: 'jpeg', label: 'JPEG', hint: 'small' },
  { value: 'webp', label: 'WebP', hint: 'compact' },
]

function toCount(e: Event): number | null {
  const raw = (e.target as HTMLInputElement).value.trim()
  if (raw === '') return null
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, 100)
}
</script>

<template>
  <section class="panel">
    <h2 class="panel-title"><span class="ico"><Scissors :size="13" /></span> Split</h2>
    <div class="counts">
      <label class="field">
        <span>Columns</span>
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          placeholder="0"
          :value="columns ?? ''"
          @input="columns = toCount($event)"
        />
      </label>
      <label class="field">
        <span>Rows</span>
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          placeholder="0"
          :value="rows ?? ''"
          @input="rows = toCount($event)"
        />
      </label>
    </div>
    <p class="hint">A count seeds evenly spaced lines, then drag any line to place cuts freely.</p>

    <h2 class="panel-title"><span class="ico"><Slice :size="13" /></span> Lines &amp; zones</h2>
    <p class="hint">
      Lines: drag to move · double-click to remove · the lasso and polygon tools draw freeform zones
      <template v-if="lineCount > 0"> · {{ lineCount }} line{{ lineCount === 1 ? '' : 's' }}</template>
      <template v-if="zoneCount > 0"> · {{ zoneCount }} zone{{ zoneCount === 1 ? '' : 's' }}</template>
    </p>
    <div class="reset-row">
      <button class="btn ghost small" type="button" :disabled="!hasImage" @click="emit('reset')">
        Reset to grid
      </button>
    </div>

    <h2 class="panel-title"><span class="ico"><Crop :size="13" /></span> Trim</h2>
    <label class="switch">
      <input v-model="trimEnabled" type="checkbox" />
      <span class="track"></span>
      <span class="switch-label">Trim empty margins</span>
    </label>
    <template v-if="trimEnabled">
      <label class="field trim-pad">
        <span>Padding · {{ trimPadding }} px</span>
        <input v-model.number="trimPadding" type="range" min="0" max="48" step="1" />
      </label>
      <p class="hint">Crops transparent space around each piece. Needs alpha (background removal or a transparent PNG).</p>
    </template>

    <h2 class="panel-title"><span class="ico"><Download :size="13" /></span> Output</h2>
    <div class="seg" role="group" aria-label="Output format">
      <button
        v-for="f in formats"
        :key="f.value"
        type="button"
        :class="{ active: format === f.value }"
        :title="f.hint"
        @click="format = f.value"
      >
        {{ f.label }}
      </button>
    </div>
    <label v-if="format !== 'png'" class="field quality">
      <span>Quality · {{ Math.round(quality * 100) }}%</span>
      <input v-model.number="quality" type="range" min="0.5" max="1" step="0.05" />
    </label>
    <div class="cut-note">
      <Scissors :size="13" />
      <span>Cut from the toolbar above · pieces land in the tray</span>
    </div>
  </section>
</template>

<style scoped>
.counts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.reset-row {
  margin-top: 10px;
}

.quality {
  margin-top: 12px;
}

.trim-pad {
  margin-top: 12px;
}

.cut-note {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--faint);
}

.cut-note svg {
  color: var(--accent);
  flex: none;
}
</style>
