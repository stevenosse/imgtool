<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, FolderDown, PanelRightClose, PanelRightOpen, Puzzle } from 'lucide-vue-next'
import type { CutPiece } from '../composables/useCutter'
import { downloadBlob, piecesToZip } from '../composables/useCutter'

const props = defineProps<{
  pieces: CutPiece[]
  baseName: string
  stale: boolean
}>()

const collapsed = ref(false)
const zipping = ref(false)

const totalSize = computed(() => {
  const bytes = props.pieces.reduce((sum, p) => sum + p.blob.size, 0)
  return fmtSize(bytes)
})

async function downloadZip() {
  if (props.pieces.length === 0 || zipping.value) return
  zipping.value = true
  try {
    const blob = await piecesToZip(props.pieces)
    downloadBlob(blob, `${props.baseName || 'image'}_pieces.zip`)
  } finally {
    zipping.value = false
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <section class="panel tray">
    <div class="tray-head">
      <button
        class="tray-toggle"
        type="button"
        :title="collapsed ? 'Expand' : 'Collapse'"
        @click="collapsed = !collapsed"
      >
        <PanelRightClose v-if="!collapsed" :size="14" />
        <PanelRightOpen v-else :size="14" />
      </button>
      <div class="tray-title">
        <h2 class="panel-title"><span class="ico"><Puzzle :size="13" /></span> Pieces ({{ pieces.length }})</h2>
        <p class="tray-sub">{{ totalSize }} total</p>
      </div>
      <button class="btn small primary" type="button" :disabled="zipping" @click="downloadZip">
        <FolderDown :size="14" />
        {{ zipping ? 'Packing…' : 'ZIP' }}
      </button>
    </div>

    <template v-if="!collapsed">
      <div v-if="stale" class="stale-note">
        Settings changed. Run <strong>Cut image</strong> again to refresh.
      </div>

      <div class="tray-list">
        <div v-for="piece in pieces" :key="piece.url" class="piece">
          <img class="thumb checker" :src="piece.url" alt="" />
          <div class="pmeta">
            <span class="pname" :title="piece.name">{{ piece.name }}</span>
            <span class="pdims">
              {{ piece.w }} × {{ piece.h }} ·
              {{ fmtSize(piece.blob.size) }}
            </span>
          </div>
          <button
            class="dl"
            type="button"
            title="Download this piece"
            @click="downloadBlob(piece.blob, piece.name)"
          >
            <Download :size="14" />
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.tray {
  padding: 12px;
}

.tray-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.tray-toggle {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
  font-size: 9px;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex: none;
  padding: 0;
}

.tray-toggle:hover {
  color: var(--text);
  border-color: var(--accent);
}

.tray-title {
  flex: 1;
  min-width: 0;
}

.tray-title .panel-title {
  margin: 0;
}

.tray-sub {
  margin: 1px 0 0;
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.stale-note {
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(242, 201, 76, 0.4);
  background: var(--warn-soft);
  border-radius: var(--radius-s);
  font-size: 12px;
  color: var(--warn);
}

.tray-list {
  margin-top: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.piece {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--panel-2);
  transition: border-color 0.15s;
}

.piece:hover {
  border-color: var(--accent);
}

.piece:hover .dl {
  opacity: 1;
}

.thumb {
  width: 52px;
  height: 52px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
}

.pmeta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.pname {
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pdims {
  font-size: 10.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dl {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  font-size: 13px;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: color 0.15s, border-color 0.15s, opacity 0.15s;
  opacity: 0.7;
}

.dl:hover {
  color: var(--accent-strong);
  border-color: var(--accent);
}

@media (hover: none) {
  .dl {
    opacity: 1;
  }
}
</style>
