<script setup lang="ts">
import type { Conflict, ConflictTimelineEvent } from '@ai-novel/shared'
import { computed } from 'vue'

const props = defineProps<{
  conflicts: Conflict[]
  events: ConflictTimelineEvent[]
  chapters: Array<{ id: string, chapterNumber: number, title: string }>
}>()

const WIDTH = 600
const HEIGHT = 240
const PADDING_LEFT = 40
const PADDING_RIGHT = 20
const PADDING_TOP = 20
const PADDING_BOTTOM = 30

const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT
const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM

const CONFLICT_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f43f5e',
]

interface CurvePoint {
  x: number
  y: number
  chapterNumber: number
  intensity: number
}

interface ConflictCurve {
  conflictId: string
  conflictTitle: string
  color: string
  points: CurvePoint[]
}

const sortedChapters = computed(() =>
  [...props.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber),
)

const curves = computed<ConflictCurve[]>(() => {
  return props.conflicts.map((conflict, idx) => {
    const conflictEvents = props.events.filter(e => e.conflictId === conflict.id)
    const points: CurvePoint[] = []

    for (const chapter of sortedChapters.value) {
      const chapterEvents = conflictEvents
        .filter(e => e.chapterId === chapter.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

      let intensity = conflict.intensity

      if (chapterEvents.length > 0) {
        // Use the last event's intensityAfter for this chapter
        intensity = chapterEvents[chapterEvents.length - 1].intensityAfter ?? conflict.intensity
      }

      points.push({
        x: 0,
        y: 0,
        chapterNumber: chapter.chapterNumber,
        intensity,
      })
    }

    // If no chapters, use the conflict's current intensity as a single point
    if (sortedChapters.value.length === 0) {
      points.push({
        x: PADDING_LEFT + plotWidth / 2,
        y: PADDING_TOP + plotHeight - (conflict.intensity / 10) * plotHeight,
        chapterNumber: 0,
        intensity: conflict.intensity,
      })
    }

    return {
      conflictId: conflict.id,
      conflictTitle: conflict.title,
      color: CONFLICT_COLORS[idx % CONFLICT_COLORS.length],
      points,
    }
  })
})

const xTicks = computed(() => {
  const chapters = sortedChapters.value
  if (chapters.length === 0)
    return []
  if (chapters.length === 1) {
    return [{ label: `${chapters[0].chapterNumber}`, x: PADDING_LEFT + plotWidth / 2 }]
  }
  return chapters.map((ch) => {
    const idx = chapters.indexOf(ch)
    const x = PADDING_LEFT + (idx / (chapters.length - 1)) * plotWidth
    return { label: `${ch.chapterNumber}`, x }
  })
})

const yTicks = computed(() => {
  const ticks = []
  for (let i = 0; i <= 10; i += 2) {
    const y = PADDING_TOP + plotHeight - (i / 10) * plotHeight
    ticks.push({ label: `${i}`, y })
  }
  return ticks
})

const curvePointsWithCoords = computed(() => {
  const chapters = sortedChapters.value
  const chapterCount = chapters.length

  return curves.value.map((curve) => {
    if (chapterCount <= 1) {
      // Already has coordinates set above
      return { ...curve, points: curve.points }
    }

    const points = curve.points.map((p, idx) => {
      const x = PADDING_LEFT + (idx / (chapterCount - 1)) * plotWidth
      const y = PADDING_TOP + plotHeight - (p.intensity / 10) * plotHeight
      return { ...p, x, y }
    })

    return { ...curve, points }
  })
})

function polylinePoints(points: CurvePoint[]): string {
  return points.map(p => `${p.x},${p.y}`).join(' ')
}
</script>

<template>
  <div class="conflict-intensity-curve">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      class="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- Grid lines -->
      <line
        v-for="tick in yTicks"
        :key="`grid-${tick.y}`"
        :x1="PADDING_LEFT"
        :y1="tick.y"
        :x2="WIDTH - PADDING_RIGHT"
        :y2="tick.y"
        stroke="currentColor"
        stroke-opacity="0.06"
        stroke-dasharray="4 4"
      />

      <!-- Y-axis labels -->
      <text
        v-for="tick in yTicks"
        :key="`y-${tick.y}`"
        :x="PADDING_LEFT - 8"
        :y="tick.y + 4"
        text-anchor="end"
        class="fill-text-muted"
        style="font-size: 10px"
      >
        {{ tick.label }}
      </text>

      <!-- X-axis labels -->
      <text
        v-for="tick in xTicks"
        :key="`x-${tick.x}`"
        :x="tick.x"
        :y="HEIGHT - 6"
        text-anchor="middle"
        class="fill-text-muted"
        style="font-size: 10px"
      >
        {{ tick.label }}
      </text>

      <!-- Axis lines -->
      <line
        :x1="PADDING_LEFT"
        :y1="PADDING_TOP"
        :x2="PADDING_LEFT"
        :y2="PADDING_TOP + plotHeight"
        stroke="currentColor"
        stroke-opacity="0.15"
      />
      <line
        :x1="PADDING_LEFT"
        :y1="PADDING_TOP + plotHeight"
        :x2="WIDTH - PADDING_RIGHT"
        :y2="PADDING_TOP + plotHeight"
        stroke="currentColor"
        stroke-opacity="0.15"
      />

      <!-- Conflict curves -->
      <template v-for="curve in curvePointsWithCoords" :key="curve.conflictId">
        <polyline
          v-if="curve.points.length > 1"
          :points="polylinePoints(curve.points)"
          fill="none"
          :stroke="curve.color"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          v-for="pt in curve.points"
          :key="`${curve.conflictId}-${pt.chapterNumber}`"
          :cx="pt.x"
          :cy="pt.y"
          r="3.5"
          :fill="curve.color"
          stroke="white"
          stroke-width="1.5"
        />
      </template>
    </svg>

    <!-- Legend -->
    <div v-if="curves.length > 0" class="mt-2 flex flex-wrap gap-3">
      <div
        v-for="curve in curves"
        :key="curve.conflictId"
        class="flex items-center gap-1.5"
      >
        <span
          class="inline-block h-2.5 w-2.5 rounded-full"
          :style="{ backgroundColor: curve.color }"
        />
        <span class="text-[10px] text-text-muted">{{ curve.conflictTitle }}</span>
      </div>
    </div>

    <div v-if="curves.length === 0" class="py-8 text-center text-xs text-text-muted opacity-50">
      暂无冲突数据
    </div>
  </div>
</template>

<style scoped>
.conflict-intensity-curve {
  font-variant-numeric: tabular-nums;
}
</style>
