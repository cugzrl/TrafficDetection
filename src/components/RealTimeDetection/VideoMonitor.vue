<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { VideoCamera } from '@element-plus/icons-vue'
import type { DetectionBox } from '../../composables/useDetectionWS'

interface RenderMetrics {
  renderWidth: number
  renderHeight: number
  offsetX: number
  offsetY: number
  originalWidth: number
  originalHeight: number
}

const props = withDefaults(defineProps<{
  latestFrameSrc?: string
  boxes?: DetectionBox[]
}>(), {
  latestFrameSrc: '',
  boxes: () => []
})

const COLOR_MAP: Record<string, string> = {
  汽车: '#2EABFF',
  三轮车: '#EF6B6B',
  面包车: '#F273AA',
  公交车: '#927FF0',
  行人: '#98F07F',
  骑自行车的人: '#F0DD7F',
  骑电动车的人: '#FFA270'
}

const videoContainerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let resizeObserver: ResizeObserver | null = null
let loadedImage: HTMLImageElement | null = null
let currentImageToken = 0

const getCanvasContext = () => {
  return canvasRef.value?.getContext('2d') ?? null
}

const clearCanvas = () => {
  const ctx = getCanvasContext()
  const canvas = canvasRef.value

  if (!ctx || !canvas) {
    return
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

const getRenderMetrics = (image: HTMLImageElement): RenderMetrics | null => {
  const canvas = canvasRef.value
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return null
  }

  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const originalWidth = image.width
  const originalHeight = image.height
  const containerRatio = canvasWidth / canvasHeight
  const videoRatio = originalWidth / originalHeight

  let renderWidth = canvasWidth
  let renderHeight = canvasHeight
  let offsetX = 0
  let offsetY = 0

  if (containerRatio > videoRatio) {
    renderHeight = canvasHeight
    renderWidth = renderHeight * videoRatio
    offsetX = (canvasWidth - renderWidth) / 2
  } else {
    renderWidth = canvasWidth
    renderHeight = renderWidth / videoRatio
    offsetY = (canvasHeight - renderHeight) / 2
  }

  return {
    renderWidth,
    renderHeight,
    offsetX,
    offsetY,
    originalWidth,
    originalHeight
  }
}

const drawBoxes = (ctx: CanvasRenderingContext2D, metrics: RenderMetrics) => {
  const scaleX = metrics.renderWidth / metrics.originalWidth
  const scaleY = metrics.renderHeight / metrics.originalHeight

  props.boxes.forEach((box) => {
    const x = box.x * scaleX + metrics.offsetX
    const y = box.y * scaleY + metrics.offsetY
    const width = box.width * scaleX
    const height = box.height * scaleY
    const color = COLOR_MAP[box.type] || '#00d2ff'

    ctx.beginPath()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = color
    ctx.rect(x, y, width, height)
    ctx.stroke()

    const label = `${box.type}`
    ctx.font = '10px Arial'
    const textWidth = ctx.measureText(label).width

    ctx.fillStyle = color
    ctx.globalAlpha = 0.85
    ctx.fillRect(x, y - 16, textWidth + 8, 16)
    ctx.globalAlpha = 1

    ctx.fillStyle = '#000000'
    ctx.fillText(label, x + 4, y - 4)
  })
}

const renderFrame = () => {
  const ctx = getCanvasContext()
  const canvas = canvasRef.value

  if (!ctx || !canvas) {
    return
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!loadedImage) {
    return
  }

  const metrics = getRenderMetrics(loadedImage)
  if (!metrics) {
    return
  }

  ctx.drawImage(
    loadedImage,
    metrics.offsetX,
    metrics.offsetY,
    metrics.renderWidth,
    metrics.renderHeight
  )

  drawBoxes(ctx, metrics)
}

const resizeCanvas = () => {
  if (!videoContainerRef.value || !canvasRef.value) {
    return
  }

  canvasRef.value.width = videoContainerRef.value.clientWidth
  canvasRef.value.height = videoContainerRef.value.clientHeight
  renderFrame()
}

const loadFrame = (src: string) => {
  if (!src) {
    loadedImage = null
    clearCanvas()
    return
  }

  const imageToken = ++currentImageToken
  const image = new Image()

  image.onload = () => {
    if (imageToken !== currentImageToken) {
      return
    }

    loadedImage = image
    renderFrame()
  }

  image.onerror = () => {
    if (imageToken !== currentImageToken) {
      return
    }

    loadedImage = null
    clearCanvas()
  }

  image.src = src
}

watch(
  () => props.latestFrameSrc,
  (nextFrameSrc) => {
    loadFrame(nextFrameSrc)
  },
  { immediate: true }
)

watch(
  () => props.boxes,
  () => {
    renderFrame()
  },
  { deep: true }
)

onMounted(() => {
  resizeCanvas()

  if (videoContainerRef.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(videoContainerRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <el-card class="tech-panel video-panel" shadow="never">
    <template #header>
      <div class="panel-header">
        <span class="panel-title">
          <el-icon><VideoCamera /></el-icon>
          实时监控画面
        </span>
      </div>
    </template>

    <div ref="videoContainerRef" class="video-container">
      <canvas ref="canvasRef" class="tech-canvas"></canvas>
      <div class="scan-line"></div>
    </div>
  </el-card>
</template>

<style scoped>
.tech-panel {
  background: rgba(5, 20, 40, 0.5) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  border: 1px solid rgba(0, 210, 255, 0.3) !important;
  box-shadow: 0 0 20px rgba(0, 210, 255, 0.15) !important;
  border-radius: 8px !important;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: visible;
}

.tech-panel::before {
  content: '';
  position: absolute;
  top: -1px;
  right: -1px;
  bottom: -1px;
  left: -1px;
  border: 2px solid transparent;
  background:
    linear-gradient(to right, #00ffff, #00ffff) left top no-repeat,
    linear-gradient(to bottom, #00ffff, #00ffff) left top no-repeat,
    linear-gradient(to left, #00ffff, #00ffff) right top no-repeat,
    linear-gradient(to bottom, #00ffff, #00ffff) right top no-repeat,
    linear-gradient(to right, #00ffff, #00ffff) left bottom no-repeat,
    linear-gradient(to top, #00ffff, #00ffff) left bottom no-repeat,
    linear-gradient(to left, #00ffff, #00ffff) right bottom no-repeat,
    linear-gradient(to top, #00ffff, #00ffff) right bottom no-repeat;
  background-size: 20px 3px, 3px 20px;
  pointer-events: none;
  z-index: 10;
  border-radius: 8px;
}

.tech-panel :deep(.el-card__header) {
  padding: 12px 20px;
  border-bottom: 1px solid rgba(0, 210, 255, 0.3);
  background: linear-gradient(90deg, rgba(0, 210, 255, 0.1), transparent);
}

.tech-panel :deep(.el-card__body) {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.video-panel {
  flex: 1;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  color: #00ffff;
  font-size: 19px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 8px;
}

.video-container {
  flex: 1;
  position: relative;
  background: rgba(0, 5, 15, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.tech-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
}

.scan-line {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 255, 255, 0.05) 3px,
    rgba(0, 255, 255, 0.05) 4px
  );
  pointer-events: none;
  z-index: 2;
}
</style>
