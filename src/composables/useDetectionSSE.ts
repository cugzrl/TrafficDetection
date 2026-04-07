import { onUnmounted, ref, shallowRef } from 'vue'
import type { DetectionBox, DetectionFrameResult } from '../types/detection'

const DEFAULT_SSE_BASE = 'http://127.0.0.1:8000'
const DEFAULT_FRAME_CACHE_SIZE = Number.POSITIVE_INFINITY

export type DetectionConnectionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

interface DetectionSSEFramePayload {
  idx?: number
  second?: number
  boxes?: number[][]
  scores?: number[]
  names?: string[]
  labels?: number[]
  track_ids?: Array<string | number>
  [key: string]: unknown
}

export interface UseDetectionSSEOptions {
  sseBase?: string
  maxFrameCache?: number
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: unknown) => void
  onParseError?: (error: unknown, rawMessage: string) => void
}

interface ConnectDetectionSSEOptions {
  preserveResults?: boolean
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

const normalizeDetectionFrame = (value: unknown): DetectionFrameResult | null => {
  if (!isRecord(value)) {
    return null
  }

  const frameIndex = toFiniteNumber(value.idx)
  if (frameIndex === undefined) {
    return null
  }

  const second = toFiniteNumber(value.second)
  const rawBoxes = Array.isArray(value.boxes) ? value.boxes : []
  const rawScores = Array.isArray(value.scores) ? value.scores : []
  const rawNames = Array.isArray(value.names) ? value.names : []
  const rawLabels = Array.isArray(value.labels) ? value.labels : []
  const rawTrackIds = Array.isArray(value.track_ids) ? value.track_ids : []
  const count = Math.max(rawBoxes.length, rawScores.length, rawNames.length, rawLabels.length, rawTrackIds.length)
  const boxes: DetectionBox[] = []

  for (let index = 0; index < count; index += 1) {
    const coords = Array.isArray(rawBoxes[index])
      ? rawBoxes[index].map((item: unknown) => toFiniteNumber(item) ?? 0)
      : []

    if (coords.length < 4) {
      continue
    }

    const x1 = coords[0] ?? 0
    const y1 = coords[1] ?? 0
    const x2 = coords[2] ?? x1
    const y2 = coords[3] ?? y1
    const confidence = toFiniteNumber(rawScores[index])
    const labelId = toFiniteNumber(rawLabels[index])
    const rawTrackId = rawTrackIds[index]
    const trackId = typeof rawTrackId === 'number' || typeof rawTrackId === 'string'
      ? rawTrackId
      : undefined
    const labelName = typeof rawNames[index] === 'string' && rawNames[index].length > 0
      ? rawNames[index]
      : `目标-${labelId ?? index}`

    boxes.push({
      x: x1,
      y: y1,
      width: Math.max(0, x2 - x1),
      height: Math.max(0, y2 - y1),
      type: labelName,
      confidence,
      score: confidence,
      frameIndex,
      second,
      trackId,
      objectId: trackId ?? `${frameIndex}-${index}`,
      labelId
    })
  }

  return {
    frameIndex,
    second,
    timestampMs: typeof second === 'number' ? Math.round(second * 1000) : undefined,
    boxes
  }
}

const normalizeBatchPayload = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as DetectionFrameResult[]
  }

  return value
    .map(normalizeDetectionFrame)
    .filter((item: DetectionFrameResult | null): item is DetectionFrameResult => item !== null)
}

const parseSSEPayload = (chunk: string) => {
  return chunk
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
}

export const useDetectionSSE = (options: UseDetectionSSEOptions = {}) => {
  const {
    sseBase = DEFAULT_SSE_BASE,
    maxFrameCache = DEFAULT_FRAME_CACHE_SIZE,
    onOpen,
    onClose,
    onError,
    onParseError
  } = options

  const abortController = shallowRef<AbortController | null>(null)
  const sseStatus = ref<DetectionConnectionStatus>('idle')
  const modelStatus = ref('未加载')
  const isDetecting = ref(false)
  const currentActive = ref(0)
  const boxes = ref<DetectionBox[]>([])
  const frameResults = shallowRef<Map<number, DetectionFrameResult>>(new Map())
  const lastMessageAt = ref<number | null>(null)
  const connectionError = ref<string | null>(null)
  const lastBatch = shallowRef<DetectionFrameResult[] | null>(null)
  const latestFrameIndex = ref<number | null>(null)
  const latestKnownFps = ref(30)
  const lastObservedFrame = shallowRef<DetectionFrameResult | null>(null)

  const getFrameSecond = (frame: DetectionFrameResult | null | undefined) => {
    if (!frame) {
      return undefined
    }

    if (typeof frame.second === 'number' && Number.isFinite(frame.second)) {
      return frame.second
    }

    if (typeof frame.timestampMs === 'number' && Number.isFinite(frame.timestampMs)) {
      return frame.timestampMs / 1000
    }

    return undefined
  }

  const clearResults = () => {
    boxes.value = []
    frameResults.value = new Map()
    currentActive.value = 0
    lastMessageAt.value = null
    lastBatch.value = null
    latestFrameIndex.value = null
    lastObservedFrame.value = null
  }

  const disconnect = () => {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }

    if (sseStatus.value !== 'error') {
      sseStatus.value = 'closed'
    }

    modelStatus.value = '未加载'
    isDetecting.value = false
  }

  const resetSession = () => {
    disconnect()
    clearResults()
    connectionError.value = null
  }

  const updateEstimatedFrameState = (nextFrame: DetectionFrameResult) => {
    const previousFrame = lastObservedFrame.value
    const nextSecond = getFrameSecond(nextFrame)
    const previousSecond = getFrameSecond(previousFrame)

    if (
      previousFrame &&
      nextFrame.frameIndex > previousFrame.frameIndex &&
      typeof previousSecond === 'number' &&
      typeof nextSecond === 'number' &&
      nextSecond > previousSecond
    ) {
      const deltaSeconds = nextSecond - previousSecond
      const deltaFrames = nextFrame.frameIndex - previousFrame.frameIndex
      const estimated = Math.round(deltaFrames / deltaSeconds)

      if (estimated > 0) {
        latestKnownFps.value = estimated
      }
    } else if (typeof nextSecond === 'number' && nextSecond > 0 && nextFrame.frameIndex > 0) {
      const estimated = Math.round(nextFrame.frameIndex / nextSecond)
      if (estimated > 0) {
        latestKnownFps.value = estimated
      }
    }

    lastObservedFrame.value = nextFrame
  }

  const ingestFrame = (nextFrame: DetectionFrameResult) => {
    const nextMap = new Map(frameResults.value)
    nextMap.set(nextFrame.frameIndex, nextFrame)

    if (Number.isFinite(maxFrameCache)) {
      while (nextMap.size > maxFrameCache) {
        const oldestFrameIndex = nextMap.keys().next().value
        if (oldestFrameIndex === undefined) {
          break
        }

        nextMap.delete(oldestFrameIndex)
      }
    }

    frameResults.value = nextMap
    boxes.value = nextFrame.boxes
    currentActive.value = nextFrame.boxes.length
    latestFrameIndex.value = nextFrame.frameIndex
    updateEstimatedFrameState(nextFrame)
  }

  const processMessage = (rawMessage: string) => {
    try {
      const parsed = JSON.parse(rawMessage) as DetectionSSEFramePayload[]
      const batch = normalizeBatchPayload(parsed)
      if (batch.length === 0) {
        return
      }

      batch.forEach(ingestFrame)
      lastBatch.value = batch
      lastMessageAt.value = Date.now()
    } catch (error) {
      onParseError?.(error, rawMessage)
    }
  }

  const processBuffer = (buffer: string, flush = false) => {
    let normalizedBuffer = buffer.replace(/\r\n/g, '\n')
    let separatorIndex = normalizedBuffer.indexOf('\n\n')

    while (separatorIndex >= 0) {
      const chunk = normalizedBuffer.slice(0, separatorIndex).trim()
      if (chunk.length > 0) {
        const payload = parseSSEPayload(chunk)
        if (payload) {
          processMessage(payload)
        }
      }

      normalizedBuffer = normalizedBuffer.slice(separatorIndex + 2)
      separatorIndex = normalizedBuffer.indexOf('\n\n')
    }

    if (flush && normalizedBuffer.trim().length > 0) {
      const payload = parseSSEPayload(normalizedBuffer.trim())
      if (payload) {
        processMessage(payload)
      }

      return ''
    }

    return normalizedBuffer
  }

  const connect = (videoId: string, options: ConnectDetectionSSEOptions = {}) => {
    if (!videoId) {
      connectionError.value = '未提供视频ID'
      return null
    }

    const { preserveResults = false } = options

    disconnect()
    if (!preserveResults) {
      clearResults()
    }
    lastObservedFrame.value = null

    const controller = new AbortController()
    abortController.value = controller
    connectionError.value = null
    sseStatus.value = 'connecting'
    modelStatus.value = '加载中'

    void (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      try {
        const response = await fetch(`${sseBase}/sse/second/${encodeURIComponent(videoId)}`, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream'
          },
          cache: 'no-store',
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`SSE请求失败: ${response.status}`)
        }

        if (!response.body) {
          throw new Error('SSE响应为空')
        }

        sseStatus.value = 'connected'
        modelStatus.value = '已就绪'
        isDetecting.value = true
        onOpen?.()

        reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          buffer = processBuffer(buffer)
        }

        buffer += decoder.decode()
        processBuffer(buffer, true)

        if (!controller.signal.aborted) {
          sseStatus.value = 'closed'
          modelStatus.value = '已完成'
          isDetecting.value = false
          onClose?.()
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        console.error('SSE连接异常:', error)
        connectionError.value = error instanceof Error ? error.message : 'SSE连接异常'
        sseStatus.value = 'error'
        modelStatus.value = '未加载'
        isDetecting.value = false
        onError?.(error)
      } finally {
        await reader?.cancel().catch(() => undefined)
        if (abortController.value === controller) {
          abortController.value = null
        }
      }
    })()

    return controller
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    sseStatus,
    modelStatus,
    isDetecting,
    currentActive,
    boxes,
    frameResults,
    latestFrameIndex,
    latestKnownFps,
    lastBatch,
    lastMessageAt,
    connectionError,
    connect,
    disconnect,
    resetSession,
    clearResults
  }
}


