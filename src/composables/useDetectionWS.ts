import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { DetectionBox, DetectionFrameResult, DetectionStreamPayload } from '../types/detection'

const DEFAULT_WS_BASE = 'ws://127.0.0.1:8000'
const DEFAULT_FRAME_CACHE_SIZE = 600

export type DetectionConnectionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

export interface UseDetectionWSOptions {
  wsBase?: string
  activeSyncInterval?: number
  autoSyncActive?: boolean
  maxFrameCache?: number
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
  onError?: (event: Event) => void
  onPayload?: (payload: DetectionStreamPayload) => void
  onBoxes?: (boxes: DetectionBox[], payload: DetectionStreamPayload) => void
  onParseError?: (error: unknown, rawMessage: string) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

const getNumberByKeys = (value: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const parsed = toFiniteNumber(value[key])
    if (parsed !== undefined) {
      return parsed
    }
  }

  return undefined
}

const getStringByKeys = (value: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }

  return undefined
}

const normalizeBox = (value: unknown): DetectionBox | null => {
  if (!isRecord(value)) {
    return null
  }

  const x = getNumberByKeys(value, ['x', 'left', 'xmin']) ?? 0
  const y = getNumberByKeys(value, ['y', 'top', 'ymin']) ?? 0
  const x2 = getNumberByKeys(value, ['x2', 'right', 'xmax'])
  const y2 = getNumberByKeys(value, ['y2', 'bottom', 'ymax'])
  const width = getNumberByKeys(value, ['width', 'w']) ?? (x2 !== undefined ? Math.max(0, x2 - x) : 0)
  const height = getNumberByKeys(value, ['height', 'h']) ?? (y2 !== undefined ? Math.max(0, y2 - y) : 0)
  const confidence =
    getNumberByKeys(value, ['confidence', 'conf', 'score', 'probability']) ??
    undefined
  const frameIndex = getNumberByKeys(value, ['frameIndex', 'frame', 'frame_id']) ?? undefined
  const trackId =
    getStringByKeys(value, ['trackId', 'track_id']) ??
    getNumberByKeys(value, ['trackId', 'track_id'])
  const objectId =
    getStringByKeys(value, ['objectId', 'object_id', 'id']) ??
    getNumberByKeys(value, ['objectId', 'object_id', 'id'])

  return {
    ...value,
    x,
    y,
    width,
    height,
    type: getStringByKeys(value, ['type', 'label', 'className', 'name']) ?? '未知目标',
    confidence,
    frameIndex,
    trackId,
    objectId
  }
}

const normalizePayload = (value: unknown): DetectionStreamPayload | null => {
  if (!isRecord(value)) {
    return null
  }

  const rawBoxes = Array.isArray(value.boxes) ? value.boxes : []
  const boxes = rawBoxes
    .map(normalizeBox)
    .filter((box): box is DetectionBox => box !== null)
  const frameIndex =
    getNumberByKeys(value, ['frameIndex', 'frame', 'frame_id']) ??
    boxes.find((box) => typeof box.frameIndex === 'number')?.frameIndex

  return {
    ...value,
    image: typeof value.image === 'string' ? value.image : undefined,
    boxes,
    frameIndex,
    fps: getNumberByKeys(value, ['fps', 'frameRate', 'frame_rate']),
    timestampMs: getNumberByKeys(value, ['timestampMs', 'timestamp', 'ts']),
    mediaType: getStringByKeys(value, ['mediaType', 'media_type', 'sourceType']),
    taskId: getStringByKeys(value, ['taskId', 'task_id'])
  }
}

export const useDetectionWS = (options: UseDetectionWSOptions = {}) => {
  const {
    wsBase = DEFAULT_WS_BASE,
    activeSyncInterval = 1000,
    autoSyncActive = true,
    maxFrameCache = DEFAULT_FRAME_CACHE_SIZE,
    onOpen,
    onClose,
    onError,
    onPayload,
    onBoxes,
    onParseError
  } = options

  const wsInstance = shallowRef<WebSocket | null>(null)
  const wsStatus = ref<DetectionConnectionStatus>('idle')
  const modelStatus = ref('未加载')
  const isDetecting = ref(false)
  const currentActive = ref(0)
  const boxes = ref<DetectionBox[]>([])
  const frameResults = shallowRef<Map<number, DetectionFrameResult>>(new Map())
  const latestFrameBase64 = ref<string | null>(null)
  const latestFrameIndex = ref<number | null>(null)
  const latestKnownFps = ref(25)
  const lastPayload = shallowRef<DetectionStreamPayload | null>(null)
  const lastMessageAt = ref<number | null>(null)
  const connectionError = ref<string | null>(null)

  let pendingActiveCount = 0
  let activeSyncTimer: number | null = null

  const latestFrameSrc = computed(() => {
    return latestFrameBase64.value ? `data:image/jpeg;base64,${latestFrameBase64.value}` : ''
  })

  const clearResults = () => {
    boxes.value = []
    frameResults.value = new Map()
    latestFrameBase64.value = null
    latestFrameIndex.value = null
    lastPayload.value = null
    lastMessageAt.value = null
    pendingActiveCount = 0
    currentActive.value = 0
  }

  const startActiveSync = () => {
    if (activeSyncTimer !== null) {
      return
    }

    activeSyncTimer = window.setInterval(() => {
      currentActive.value = pendingActiveCount
    }, activeSyncInterval)
  }

  const stopActiveSync = () => {
    if (activeSyncTimer !== null) {
      window.clearInterval(activeSyncTimer)
      activeSyncTimer = null
    }
  }

  const pushFrameResult = (frameIndex: number, nextBoxes: DetectionBox[], timestampMs?: number) => {
    const nextMap = new Map(frameResults.value)
    nextMap.set(frameIndex, {
      frameIndex,
      boxes: nextBoxes,
      timestampMs
    })

    while (nextMap.size > maxFrameCache) {
      const oldestFrame = nextMap.keys().next().value
      if (oldestFrame === undefined) {
        break
      }

      nextMap.delete(oldestFrame)
    }

    frameResults.value = nextMap
  }

  const getBoxesForFrame = (frameIndex: number, maxFallbackGap = 2) => {
    const directMatch = frameResults.value.get(frameIndex)
    if (directMatch) {
      return directMatch.boxes
    }

    for (let offset = 1; offset <= maxFallbackGap; offset += 1) {
      const previousMatch = frameResults.value.get(frameIndex - offset)
      if (previousMatch) {
        return previousMatch.boxes
      }
    }

    return boxes.value
  }

  const handleSocketMessage = (rawMessage: string) => {
    try {
      const parsed = JSON.parse(rawMessage) as unknown
      const payload = normalizePayload(parsed)

      if (!payload) {
        return
      }

      lastPayload.value = payload
      lastMessageAt.value = Date.now()
      latestFrameBase64.value = payload.image ?? latestFrameBase64.value
      boxes.value = payload.boxes
      pendingActiveCount = payload.boxes.length

      if (typeof payload.frameIndex === 'number') {
        latestFrameIndex.value = payload.frameIndex
        pushFrameResult(payload.frameIndex, payload.boxes, payload.timestampMs)
      }

      if (typeof payload.fps === 'number' && payload.fps > 0) {
        latestKnownFps.value = payload.fps
      }

      onPayload?.(payload)
      onBoxes?.(payload.boxes, payload)
    } catch (error) {
      onParseError?.(error, rawMessage)
    }
  }

  const disconnect = () => {
    const socket = wsInstance.value
    if (!socket) {
      wsStatus.value = 'closed'
      modelStatus.value = '未加载'
      isDetecting.value = false
      return
    }

    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    socket.close()

    wsInstance.value = null
    wsStatus.value = 'closed'
    modelStatus.value = '未加载'
    isDetecting.value = false
  }

  const resetSession = () => {
    disconnect()
    clearResults()
    connectionError.value = null
  }

  const connect = (videoId: string) => {
    if (!videoId) {
      connectionError.value = '未提供视频ID'
      return null
    }

    disconnect()

    connectionError.value = null
    wsStatus.value = 'connecting'
    modelStatus.value = '加载中'

    const socket = new WebSocket(`${wsBase}/ws/frame/${videoId}`)
    wsInstance.value = socket

    socket.onopen = () => {
      wsStatus.value = 'connected'
      modelStatus.value = '已就绪'
      isDetecting.value = true
      onOpen?.()
    }

    socket.onmessage = (event) => {
      handleSocketMessage(event.data)
    }

    socket.onerror = (event) => {
      wsStatus.value = 'error'
      modelStatus.value = '未加载'
      isDetecting.value = false
      connectionError.value = '推理连接发生错误'
      onError?.(event)
    }

    socket.onclose = (event) => {
      if (wsInstance.value === socket) {
        wsInstance.value = null
      }

      if (wsStatus.value !== 'error') {
        wsStatus.value = 'closed'
      }

      modelStatus.value = '未加载'
      isDetecting.value = false
      onClose?.(event)
    }

    return socket
  }

  if (autoSyncActive) {
    onMounted(startActiveSync)
  }

  onUnmounted(() => {
    stopActiveSync()
    disconnect()
  })

  return {
    wsInstance,
    wsStatus,
    modelStatus,
    isDetecting,
    currentActive,
    boxes,
    frameResults,
    latestFrameBase64,
    latestFrameSrc,
    latestFrameIndex,
    latestKnownFps,
    lastPayload,
    lastMessageAt,
    connectionError,
    connect,
    disconnect,
    resetSession,
    clearResults,
    startActiveSync,
    stopActiveSync,
    getBoxesForFrame
  }
}
