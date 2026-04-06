<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { PictureFilled, VideoCamera } from '@element-plus/icons-vue'
import type {
  DetectionBox,
  MediaFramePayload,
  MediaKind,
  MediaLoadedPayload
} from '../../types/detection'
import { getDetectionBoxKey } from '../../types/detection'

interface RenderMetrics {
  renderWidth: number
  renderHeight: number
  offsetX: number
  offsetY: number
  originalWidth: number
  originalHeight: number
}

interface RenderedBoxMetrics {
  key: string
  box: DetectionBox
  x: number
  y: number
  width: number
  height: number
}

const props = withDefaults(defineProps<{
  mediaKind?: MediaKind
  mediaSrc?: string
  fallbackFrameSrc?: string
  boxes?: DetectionBox[]
  selectedBoxKey?: string | null
  frameRate?: number
  currentFrameIndex?: number | null
  mediaLabel?: string
  buffering?: boolean
  bufferingLabel?: string
}>(), {
  mediaKind: 'unknown',
  mediaSrc: '',
  fallbackFrameSrc: '',
  boxes: () => [],
  selectedBoxKey: null,
  frameRate: 25,
  currentFrameIndex: null,
  mediaLabel: '未选择媒体',
  buffering: false,
  bufferingLabel: '正在缓冲检测结果'
})

const emit = defineEmits<{
  (e: 'media-loaded', payload: MediaLoadedPayload): void
  (e: 'frame-change', payload: MediaFramePayload): void
  (e: 'box-click', payload: DetectionBox | null): void
}>()

const COLOR_MAP: Record<string, string> = {
  汽车: '#2EABFF',
  三轮车: '#EF6B6B',
  面包车: '#F273AA',
  公交车: '#927FF0',
  行人: '#98F07F',
  骑自行车的人: '#F0DD7F',
  骑电动车的人: '#FFA270'
}

const monitorRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const renderedBoxes = ref<RenderedBoxMetrics[]>([])

let resizeObserver: ResizeObserver | null = null
let frameLoopId: number | null = null
let lastLoadedMediaKey = ''

const displayMode = computed<'video' | 'image' | 'stream' | 'empty'>(() => {
  if (props.mediaKind === 'video' && props.mediaSrc) {
    return 'video'
  }

  if (props.mediaSrc) {
    return 'image'
  }

  if (props.fallbackFrameSrc) {
    return 'stream'
  }

  return 'empty'
})

const activeImageSrc = computed(() => {
  if (displayMode.value === 'image') {
    return props.mediaSrc
  }

  if (displayMode.value === 'stream') {
    return props.fallbackFrameSrc
  }

  return ''
})

const mediaModeLabel = computed(() => {
  if (displayMode.value === 'video') {
    return '视频预览'
  }

  if (displayMode.value === 'image') {
    return '图片预览'
  }

  if (displayMode.value === 'stream') {
    return '识别结果画面'
  }

  return '等待媒体'
})

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
  renderedBoxes.value = []
}

const getIntrinsicSize = () => {
  if (displayMode.value === 'video') {
    const video = videoRef.value
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null
    }

    return {
      width: video.videoWidth,
      height: video.videoHeight
    }
  }

  const image = imageRef.value
  if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return null
  }

  return {
    width: image.naturalWidth,
    height: image.naturalHeight
  }
}

const getRenderMetrics = (): RenderMetrics | null => {
  const canvas = canvasRef.value
  const intrinsicSize = getIntrinsicSize()

  if (!canvas || !intrinsicSize || canvas.width === 0 || canvas.height === 0) {
    return null
  }

  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const containerRatio = canvasWidth / canvasHeight
  const mediaRatio = intrinsicSize.width / intrinsicSize.height

  let renderWidth = canvasWidth
  let renderHeight = canvasHeight
  let offsetX = 0
  let offsetY = 0

  if (containerRatio > mediaRatio) {
    renderHeight = canvasHeight
    renderWidth = renderHeight * mediaRatio
    offsetX = (canvasWidth - renderWidth) / 2
  } else {
    renderWidth = canvasWidth
    renderHeight = renderWidth / mediaRatio
    offsetY = (canvasHeight - renderHeight) / 2
  }

  return {
    renderWidth,
    renderHeight,
    offsetX,
    offsetY,
    originalWidth: intrinsicSize.width,
    originalHeight: intrinsicSize.height
  }
}

const drawBoxes = (ctx: CanvasRenderingContext2D, metrics: RenderMetrics) => {
  const scaleX = metrics.renderWidth / metrics.originalWidth
  const scaleY = metrics.renderHeight / metrics.originalHeight
  const nextRenderedBoxes: RenderedBoxMetrics[] = []

  props.boxes.forEach((box, index) => {
    const x = box.x * scaleX + metrics.offsetX
    const y = box.y * scaleY + metrics.offsetY
    const width = box.width * scaleX
    const height = box.height * scaleY
    const color = COLOR_MAP[box.type] || '#00d2ff'
    const boxKey = getDetectionBoxKey(box, index)
    const isSelected = props.selectedBoxKey === boxKey
    const labelText = box.confidence !== undefined
      ? `${box.type} ${(box.confidence * 100).toFixed(1)}%`
      : box.type

    ctx.beginPath()
    ctx.lineWidth = isSelected ? 2.6 : 1.8
    ctx.strokeStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = isSelected ? 14 : 8
    ctx.rect(x, y, width, height)
    ctx.stroke()
    ctx.shadowBlur = 0

    const labelPaddingX = 8
    const labelHeight = 18
    ctx.font = '12px Microsoft YaHei'
    const textWidth = ctx.measureText(labelText).width
    const labelWidth = textWidth + labelPaddingX * 2
    const labelX = x
    const labelY = Math.max(0, y - labelHeight - 2)

    ctx.fillStyle = color
    ctx.globalAlpha = isSelected ? 0.95 : 0.82
    ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
    ctx.globalAlpha = 1

    ctx.fillStyle = '#031018'
    ctx.fillText(labelText, labelX + labelPaddingX, labelY + 13)

    nextRenderedBoxes.push({
      key: boxKey,
      box,
      x,
      y,
      width,
      height
    })
  })

  renderedBoxes.value = nextRenderedBoxes
}

const renderOverlay = () => {
  const ctx = getCanvasContext()
  const canvas = canvasRef.value
  if (!ctx || !canvas) {
    return
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const metrics = getRenderMetrics()
  if (!metrics) {
    renderedBoxes.value = []
    return
  }

  drawBoxes(ctx, metrics)
}

const resizeCanvas = () => {
  if (!monitorRef.value || !canvasRef.value) {
    return
  }

  canvasRef.value.width = monitorRef.value.clientWidth
  canvasRef.value.height = monitorRef.value.clientHeight
  renderOverlay()
}

const resolveVideoFrameIndex = (video: HTMLVideoElement) => {
  const safeFrameRate = props.frameRate > 0 ? props.frameRate : 30
  const rawFrameIndex = Math.floor(video.currentTime * safeFrameRate) + 1

  if (Number.isFinite(video.duration) && video.duration > 0) {
    const estimatedFrameCount = Math.max(1, Math.floor(video.duration * safeFrameRate))
    return Math.min(estimatedFrameCount, Math.max(1, rawFrameIndex))
  }

  return Math.max(1, rawFrameIndex)
}

const syncVideoFrame = () => {
  const video = videoRef.value
  if (!video) {
    return
  }

  const nextFrameIndex = resolveVideoFrameIndex(video)
  emit('frame-change', {
    currentTime: video.currentTime,
    frameIndex: nextFrameIndex
  })

  renderOverlay()
}

const stopFrameLoop = () => {
  if (frameLoopId !== null) {
    cancelAnimationFrame(frameLoopId)
    frameLoopId = null
  }
}

const startFrameLoop = () => {
  if (frameLoopId !== null) {
    return
  }

  const loop = () => {
    syncVideoFrame()

    if (videoRef.value && !videoRef.value.paused && !videoRef.value.ended) {
      frameLoopId = requestAnimationFrame(loop)
      return
    }

    frameLoopId = null
  }

  frameLoopId = requestAnimationFrame(loop)
}

const handleImageLoad = () => {
  renderOverlay()

  if (displayMode.value === 'stream') {
    return
  }

  const image = imageRef.value
  if (!image) {
    return
  }

  const mediaKey = `${displayMode.value}:${props.mediaSrc}`
  if (mediaKey === lastLoadedMediaKey) {
    return
  }

  lastLoadedMediaKey = mediaKey
  emit('media-loaded', {
    kind: 'image',
    width: image.naturalWidth,
    height: image.naturalHeight
  })
}

const handleVideoLoaded = () => {
  const video = videoRef.value
  if (!video) {
    return
  }

  renderOverlay()

  const mediaKey = `video:${props.mediaSrc}`
  if (mediaKey !== lastLoadedMediaKey) {
    lastLoadedMediaKey = mediaKey
    emit('media-loaded', {
      kind: 'video',
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) ? video.duration : undefined
    })
  }

  syncVideoFrame()
  stopFrameLoop()
}

const handleCanvasClick = (event: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  const rect = canvas.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const clickY = event.clientY - rect.top

  const hit = [...renderedBoxes.value].reverse().find((item) => {
    return clickX >= item.x && clickX <= item.x + item.width && clickY >= item.y && clickY <= item.y + item.height
  })

  emit('box-click', hit?.box ?? null)
}

const play = async () => {
  try {
    await videoRef.value?.play()
  } catch (error) {
    console.warn('视频播放被阻止:', error)
  }
}

const pause = () => {
  videoRef.value?.pause()
}

const resetToStart = () => {
  const video = videoRef.value
  if (!video) {
    return
  }

  video.pause()

  try {
    video.currentTime = 0
  } catch (error) {
    console.warn('重置视频播放位置失败:', error)
  }

  syncVideoFrame()
}

watch(
  () => props.boxes,
  () => {
    renderOverlay()
  },
  { deep: true }
)

watch(
  () => props.selectedBoxKey,
  () => {
    renderOverlay()
  }
)

watch(
  () => [props.mediaSrc, props.fallbackFrameSrc, props.mediaKind],
  () => {
    lastLoadedMediaKey = ''
    stopFrameLoop()
    window.requestAnimationFrame(resizeCanvas)
  }
)

onMounted(() => {
  resizeCanvas()

  if (monitorRef.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(monitorRef.value)
  }
})

onUnmounted(() => {
  stopFrameLoop()
  resizeObserver?.disconnect()
})

defineExpose({
  play,
  pause,
  resetToStart
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

    <div ref="monitorRef" class="video-container">
      <video
        v-if="displayMode === 'video'"
        ref="videoRef"
        class="media-layer"
        :src="mediaSrc"
        muted
        loop
        playsinline
        preload="auto"
        @loadeddata="handleVideoLoaded"
        @play="startFrameLoop"
        @pause="stopFrameLoop"
        @seeked="syncVideoFrame"
        @timeupdate="syncVideoFrame"
      ></video>

      <img
        v-else-if="displayMode === 'image' || displayMode === 'stream'"
        ref="imageRef"
        class="media-layer"
        :src="activeImageSrc"
        alt="监控画面"
        @load="handleImageLoad"
      />

      <div v-else class="empty-state">
        <el-icon class="empty-icon">
          <PictureFilled />
        </el-icon>
        <div class="empty-title">等待媒体接入</div>
      </div>

      <canvas
        ref="canvasRef"
        :class="['overlay-canvas', { interactive: boxes.length > 0 }]"
        @click="handleCanvasClick"
      ></canvas>

      <div class="media-badge">
        <span class="badge-label">{{ mediaModeLabel }}</span>
        <span class="badge-value">{{ mediaLabel }}</span>
      </div>

      <div v-if="currentFrameIndex !== null && displayMode === 'video'" class="frame-badge">
        当前帧 {{ currentFrameIndex }}
      </div>

      <div v-if="displayMode === 'video' && buffering" class="buffering-overlay">
        <div class="buffering-spinner"></div>
        <div class="buffering-text">{{ bufferingLabel }}</div>
      </div>

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
  background:
    radial-gradient(circle at top, rgba(0, 110, 180, 0.16), transparent 48%),
    rgba(0, 5, 15, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.media-layer {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
}

.overlay-canvas {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
}

.overlay-canvas.interactive {
  cursor: crosshair;
}

.media-badge,
.frame-badge {
  position: absolute;
  z-index: 8;
  padding: 8px 12px;
  border: 1px solid rgba(0, 210, 255, 0.35);
  background: rgba(2, 18, 35, 0.72);
  box-shadow: 0 0 14px rgba(0, 210, 255, 0.14);
  backdrop-filter: blur(8px);
  color: #9fe7ff;
  font-size: 12px;
  letter-spacing: 0.6px;
}

.media-badge {
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-width: calc(100% - 28px);
}

.frame-badge {
  top: 16px;
  right: 14px;
  color: #00ffff;
  text-shadow: 0 0 6px rgba(0, 255, 255, 0.5);
}

.buffering-overlay {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(1, 10, 20, 0.36);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.buffering-spinner {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid rgba(0, 210, 255, 0.18);
  border-top-color: #00ffff;
  border-right-color: #00d2ff;
  box-shadow: 0 0 18px rgba(0, 210, 255, 0.25);
  animation: buffering-spin 0.9s linear infinite;
}

.buffering-text {
  padding: 8px 14px;
  border: 1px solid rgba(0, 210, 255, 0.28);
  background: rgba(2, 18, 35, 0.72);
  color: #dffcff;
  font-size: 13px;
  letter-spacing: 0.6px;
  text-shadow: 0 0 6px rgba(0, 210, 255, 0.3);
  box-shadow: 0 0 12px rgba(0, 210, 255, 0.12);
}

.badge-label {
  color: #00d2ff;
}

.badge-value {
  color: #e6fbff;
  font-weight: bold;
  text-shadow: 0 0 6px rgba(0, 210, 255, 0.35);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(340px, calc(100% - 40px));
  padding: 28px 24px;
  border: 1px solid rgba(0, 210, 255, 0.22);
  background: rgba(3, 20, 38, 0.58);
  backdrop-filter: blur(10px);
  text-align: center;
  color: #c9f6ff;
  z-index: 4;
}

.empty-icon {
  font-size: 34px;
  color: #00d2ff;
  margin-bottom: 10px;
}

.empty-title {
  font-size: 18px;
  font-weight: bold;
  color: #00ffff;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.45);
  margin-bottom: 8px;
}

.empty-text {
  font-size: 13px;
  line-height: 1.7;
  color: #95dfff;
}

@keyframes buffering-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
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
    rgba(0, 255, 255, 0.04) 3px,
    rgba(0, 255, 255, 0.04) 4px
  );
  pointer-events: none;
  z-index: 2;
}
</style>
