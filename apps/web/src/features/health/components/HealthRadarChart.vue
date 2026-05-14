<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  metrics: {
    theme: number
    character: number
    foreshadowing: number
    conflict: number
    pacing: number
    style: number
  }
  size?: number
}>(), {
  size: 200,
})

const labels = [
  { key: 'theme', label: '主题' },
  { key: 'character', label: '人物' },
  { key: 'foreshadowing', label: '伏笔' },
  { key: 'conflict', label: '矛盾' },
  { key: 'pacing', label: '节奏' },
  { key: 'style', label: '文风' },
]

const center = computed(() => props.size / 2)
const radius = computed(() => (props.size / 2) * 0.7)

function getPoint(index: number, total: number, value: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  const r = (radius.value * value) / 100
  return {
    x: center.value + r * Math.cos(angle),
    y: center.value + r * Math.sin(angle),
  }
}

const polygonPoints = computed(() => {
  return labels.map((l, i) => {
    const p = getPoint(i, labels.length, (props.metrics as any)[l.key] || 0)
    return `${p.x},${p.y}`
  }).join(' ')
})

const gridLevels = [25, 50, 75, 100]
const gridPolygons = computed(() => {
  return gridLevels.map((level) => {
    return labels.map((_, i) => {
      const p = getPoint(i, labels.length, level)
      return `${p.x},${p.y}`
    }).join(' ')
  })
})

const labelPositions = computed(() => {
  return labels.map((l, i) => {
    const p = getPoint(i, labels.length, 120) // Position labels slightly outside
    return { ...p, label: l.label }
  })
})
</script>

<template>
  <div class="radar-chart" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" class="overflow-visible">
      <!-- Grid -->
      <polygon
        v-for="points in gridPolygons"
        :key="points"
        :points="points"
        fill="none"
        stroke="currentColor"
        class="text-border-light/40"
        stroke-width="1"
      />

      <!-- Axis Lines -->
      <line
        v-for="(_, i) in labels"
        :key="i"
        :x1="center"
        :y1="center"
        :x2="getPoint(i, labels.length, 100).x"
        :y2="getPoint(i, labels.length, 100).y"
        stroke="currentColor"
        class="text-border-light/40"
        stroke-width="1"
      />

      <!-- Data Area -->
      <polygon
        :points="polygonPoints"
        fill="currentColor"
        class="text-primary/20"
        stroke="currentColor"
        stroke-width="2"
      />
      <circle
        v-for="(l, i) in labels"
        :key="`dot-${i}`"
        :cx="getPoint(i, labels.length, (metrics as any)[l.key]).x"
        :cy="getPoint(i, labels.length, (metrics as any)[l.key]).y"
        r="3"
        fill="currentColor"
        class="text-primary"
      />

      <!-- Labels -->
      <text
        v-for="p in labelPositions"
        :key="p.label"
        :x="p.x"
        :y="p.y"
        text-anchor="middle"
        dominant-baseline="middle"
        class="fill-text-muted text-[10px] font-bold"
      >
        {{ p.label }}
      </text>
    </svg>
  </div>
</template>

<style scoped lang="scss">
.radar-chart {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
