<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Image as ImageIcon } from 'lucide-vue-next'
import type { LoadedImage } from '../composables/useCutter'

defineProps<{
  image: LoadedImage | null
  error: string
}>()

const emit = defineEmits<{
  file: [file: File]
}>()

const input = ref<HTMLInputElement | null>(null)

function onPick(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) emit('file', file)
  target.value = ''
}

function onPaste(e: ClipboardEvent) {
  const file = e.clipboardData?.files?.[0]
  if (file) emit('file', file)
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <section class="panel">
    <h2 class="panel-title"><span class="ico"><ImageIcon :size="13" /></span> Image</h2>
    <input ref="input" type="file" accept="image/*" hidden @change="onPick" />

    <div v-if="!image" class="dropzone" @click="input?.click()">
      <div class="dz-icon"><ImageIcon :size="30" /></div>
      <p class="dz-main">Drop an image anywhere</p>
      <p class="dz-sub">or click to browse · paste with ⌘/Ctrl+V</p>
    </div>

    <div v-else class="image-card">
      <img class="thumb checker" :src="image.url" alt="" />
      <div class="meta">
        <p class="name" :title="image.name">{{ image.name }}</p>
        <p class="dims">{{ image.width }} × {{ image.height }} px</p>
      </div>
      <button class="btn ghost small" type="button" @click="input?.click()">Replace</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 26px 12px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-s);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, background 0.15s;
}

.dropzone:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dz-icon {
  color: var(--accent);
}

.dz-main {
  margin: 6px 0 0;
  font-weight: 600;
}

.dz-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.image-card {
  display: flex;
  align-items: center;
  gap: 10px;
}

.thumb {
  width: 52px;
  height: 52px;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: 8px;
  flex: none;
}

.meta {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dims {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
