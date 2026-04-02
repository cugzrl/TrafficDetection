import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'

const DEFAULT_WS_BASE = 'ws://127.0.0.1:8000'

export type DetectionConnectionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

export interface DetectionBox {
  x: number
  y: number
  width: number
  height: number
  type: string
  [key: string]: unknown
}

export interface DetectionStreamPayload {
  image?: string
  boxes: DetectionBox[]
  [key: string]: unknown
}

export interface UseDetectionWSOptions {
  wsBase?: string
  activeSyncInterval?: number
  autoSyncActive?: boolean
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

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

const normalizeBox = (value: unknown): DetectionBox | null => {
  if (!isRecord(value)) {
    return null
  }

  return {
    ...value,
    x: toNumber(value.x),
    y: toNumber(value.y),
    width: toNumber(value.width),
    height: toNumber(value.height),
    type: typeof value.type === 'string' ? value.type : '未知目标'
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

  return {
    ...value,
    image: typeof value.image === 'string' ? value.image : undefined,
    boxes
  }
}

export const useDetectionWS = (options: UseDetectionWSOptions = {}) => {
  const {
    wsBase = DEFAULT_WS_BASE,
    activeSyncInterval = 1000,
    autoSyncActive = true,
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
  const latestFrameBase64 = ref<string | null>(null)
  const lastPayload = shallowRef<DetectionStreamPayload | null>(null)
  const lastMessageAt = ref<number | null>(null)
  const connectionError = ref<string | null>(null)

  let pendingActiveCount = 0
  let activeSyncTimer: number | null = null

  const latestFrameSrc = computed(() => {
    return latestFrameBase64.value ? `data:image/jpeg;base64,${latestFrameBase64.value}` : ''
  })

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

  const handleSocketMessage = (rawMessage: string) => {
    try {
      const parsed = JSON.parse(rawMessage) as unknown
      const payload = normalizePayload(parsed)

      if (!payload) {
        return
      }

      lastPayload.value = payload
      lastMessageAt.value = Date.now()
      latestFrameBase64.value = payload.image ?? null
      boxes.value = payload.boxes
      pendingActiveCount = payload.boxes.length

      onPayload?.(payload)
      onBoxes?.(payload.boxes, payload)
    } catch (error) {
      onParseError?.(error, rawMessage)
    }
  }

  const disconnect = () => {
    const socket = wsInstance.value
    if (!socket) {
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
    latestFrameBase64,
    latestFrameSrc,
    lastPayload,
    lastMessageAt,
    connectionError,
    connect,
    disconnect,
    startActiveSync,
    stopActiveSync
  }
}
