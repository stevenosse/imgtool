<script setup lang="ts">
import { computed } from 'vue'
import type { BgMode, RGB } from '../composables/background'

const enabled = defineModel<boolean>('enabled')
const color = defineModel<RGB>('color')
const tolerance = defineModel<number>('tolerance')
const mode = defineModel<BgMode>('mode')
const preview = defineModel<boolean>('preview')

defineProps<{
  hasImage: boolean
  lossyFormat: boolean
}>()

const scopes: Array<{ value: BgMode; label: string }> = [
  { value: 'edges', label: 'Edges only' },
  { value: 'all', label: 'Everywhere' },
]

const hex = computed(() =>
  '#' + (color.value ?? [255, 255, 255]).map(v => v.toString(16).padStart(2, '0')).join(''),
)

function setColorFromHex(e: Event) {
  const h = (e.target as HTMLInputElement).value
  color.value = [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
}

function setWhite() {
  color.value = [255, 255, 255]
}
</script>

<template>
  <section class="panel">
    <h2 class="panel-title"><span class="ico">🧽</span> Background</h2>

    <label class="switch">
      <input v-model="enabled" type="checkbox" />
      <span class="track"></span>
      <span class="switch-label">Remove background</span>
    </label>

    <template v-if="enabled">
      <div class="color-row">
        <label class="swatch" title="Choose the background color">
          <span class="swatch-fill" :style="{ background: hex }"></span>
          <input type="color" :value="hex" @input="setColorFromHex" />
        </label>
        <div class="color-meta">
          <span class="color-name">Background color</span>
          <span class="color-hex">{{ hex }}</span>
        </div>
        <button
          v-if="hex !== '#ffffff'"
          class="btn ghost small"
          type="button"
          @click="setWhite"
        >
          White
        </button>
      </div>
      <p class="hint">
        💧 Use the eyedropper on the canvas to sample it straight from the image.
      </p>

      <label class="field tolerance">
        <span>Tolerance — {{ tolerance }}%</span>
        <input v-model.number="tolerance" type="range" min="0" max="100" step="1" />
      </label>

      <div class="field scope">
        <span>Scope</span>
        <div class="seg" role="group" aria-label="Removal scope">
          <button
            v-for="s in scopes"
            :key="s.value"
            type="button"
            :class="{ active: mode === s.value }"
            @click="mode = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <p v-if="mode === 'edges'" class="hint">
        Only the background touching the borders is removed — the same color inside the artwork
        (eyes, highlights) is kept.
      </p>

      <label class="switch preview-toggle">
        <input v-model="preview" type="checkbox" :disabled="!hasImage" />
        <span class="track"></span>
        <span class="switch-label">Live preview in editor</span>
      </label>

      <p v-if="lossyFormat" class="error">
        JPEG has no transparency — switch to PNG or WebP to keep the removed background.
      </p>
      <p class="hint">Anti-aliased edges keep partial transparency with the background un-blended, so no halo remains.</p>
    </template>
  </section>
</template>

<style scoped>
.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.swatch {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;
  flex: none;
  overflow: hidden;
}

.swatch-fill {
  position: absolute;
  inset: 0;
}

.swatch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.color-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.color-name {
  font-size: 12.5px;
  font-weight: 550;
}

.color-hex {
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
}

.tolerance {
  margin-top: 14px;
}

.scope {
  margin-top: 12px;
}

.preview-toggle {
  margin-top: 14px;
}
</style>
