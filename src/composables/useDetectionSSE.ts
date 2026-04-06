import { onUnmounted, ref, shallowRef } from 'vue'
import type { DetectionBox, DetectionFrameResult } from '../types/detection'

const DEFAULT_SSE_BASE = 'http://127.0.0.1:8000'
const DEFAULT_FRAME_CACHE_SIZE = Number.POSITIVE_INFINITY
const DEFAULT_MATCH_TOLERANCE_SECONDS = 0.12

export type DetectionConnectionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

interface DetectionSSEFramePayload {
  idx?: number
  second?: number
  boxes?: number[][]
  scores?: number[]
  names?: string[]
  labels?: number[]
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
  const count = Math.max(rawBoxes.length, rawScores.length, rawNames.length, rawLabels.length)
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
      objectId: `${frameIndex}-${index}`,
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
  const timelineResults = shallowRef<DetectionFrameResult[]>([])
  const lastMessageAt = ref<number | null>(null)
  const connectionError = ref<string | null>(null)
  const lastBatch = shallowRef<DetectionFrameResult[] | null>(null)
  const latestFrameIndex = ref<number | null>(null)
  const latestKnownFps = ref(30)
  const latestSampleInterval = ref(DEFAULT_MATCH_TOLERANCE_SECONDS)

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

    if (latestKnownFps.value > 0) {
      return frame.frameIndex / latestKnownFps.value
    }

    return undefined
  }

  const clearResults = () => {
    boxes.value = []
    frameResults.value = new Map()
    timelineResults.value = []
    currentActive.value = 0
    lastMessageAt.value = null
    lastBatch.value = null
    latestFrameIndex.value = null
    latestSampleInterval.value = DEFAULT_MATCH_TOLERANCE_SECONDS
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

  const trimFrameCache = (nextTimelineResults: DetectionFrameResult[]) => {
    if (!Number.isFinite(maxFrameCache)) {
      return nextTimelineResults
    }

    if (nextTimelineResults.length <= maxFrameCache) {
      return nextTimelineResults
    }

    return nextTimelineResults.slice(nextTimelineResults.length - maxFrameCache)
  }

  const updateEstimatedFrameState = (nextFrame: DetectionFrameResult, previousFrame?: DetectionFrameResult) => {
    const nextSecond = getFrameSecond(nextFrame)
    const previousSecond = getFrameSecond(previousFrame)

    if (
      typeof previousSecond === 'number' &&
      typeof nextSecond === 'number' &&
      nextSecond > previousSecond
    ) {
      const deltaSeconds = nextSecond - previousSecond
      const deltaFrames = nextFrame.frameIndex - previousFrame!.frameIndex

      latestSampleInterval.value = deltaSeconds

      const estimated = Math.round(deltaFrames / deltaSeconds)
      if (estimated > 0) {
        latestKnownFps.value = estimated
        return
      }
    }

    if (typeof nextSecond === 'number' && nextSecond > 0) {
      const estimated = Math.round(nextFrame.frameIndex / nextSecond)
      if (estimated > 0) {
        latestKnownFps.value = estimated
      }
    }
  }

  const ingestFrame = (nextFrame: DetectionFrameResult) => {
    const previousTimeline = timelineResults.value
    const previousFrame = previousTimeline.length > 0 ? previousTimeline[previousTimeline.length - 1] : undefined

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

    const filteredTimeline = previousTimeline.filter((item) => item.frameIndex !== nextFrame.frameIndex)
    const nextTimeline = trimFrameCache([...filteredTimeline, nextFrame])

    frameResults.value = nextMap
    timelineResults.value = nextTimeline
    boxes.value = nextFrame.boxes
    currentActive.value = nextFrame.boxes.length
    latestFrameIndex.value = nextFrame.frameIndex
    updateEstimatedFrameState(nextFrame, previousFrame)
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

  const getMatchWindow = (results: DetectionFrameResult[], targetIndex: number) => {
    const fallbackWindow = Math.max(
      latestSampleInterval.value,
      latestKnownFps.value > 0 ? 1 / latestKnownFps.value : DEFAULT_MATCH_TOLERANCE_SECONDS,
      DEFAULT_MATCH_TOLERANCE_SECONDS
    )

    const currentSecond = getFrameSecond(results[targetIndex])
    if (typeof currentSecond !== 'number') {
      return fallbackWindow
    }

    const previousSecond = getFrameSecond(results[targetIndex - 1])
    const nextSecond = getFrameSecond(results[targetIndex + 1])
    const previousGap = typeof previousSecond === 'number' ? currentSecond - previousSecond : fallbackWindow
    const nextGap = typeof nextSecond === 'number' ? nextSecond - currentSecond : fallbackWindow

    return Math.max(fallbackWindow, previousGap, nextGap)
  }

  const getFrameResultForTime = (currentTime: number) => {
    const results = timelineResults.value
    if (results.length === 0 || !Number.isFinite(currentTime)) {
      return null
    }

    let low = 0
    let high = results.length - 1
    let answerIndex = -1

    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const middleSecond = getFrameSecond(results[middle])

      if (typeof middleSecond !== 'number') {
        low = middle + 1
        continue
      }

      if (middleSecond <= currentTime + 0.001) {
        answerIndex = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    if (answerIndex < 0) {
      const firstFrame = results[0]
      const firstSecond = getFrameSecond(firstFrame)
      if (typeof firstSecond !== 'number') {
        return null
      }

      return firstSecond - currentTime <= getMatchWindow(results, 0) ? firstFrame : null
    }

    const matchedFrame = results[answerIndex]
    const matchedSecond = getFrameSecond(matchedFrame)
    if (typeof matchedSecond !== 'number') {
      return matchedFrame ?? null
    }

    return currentTime - matchedSecond <= getMatchWindow(results, answerIndex)
      ? matchedFrame
      : null
  }

  const getFrameResultForFrame = (frameIndex: number) => {
    const directMatch = frameResults.value.get(frameIndex)
    if (directMatch) {
      return directMatch
    }

    let matchedResult: DetectionFrameResult | null = null
    for (const item of timelineResults.value) {
      if (item.frameIndex > frameIndex) {
        break
      }

      matchedResult = item
    }

    return matchedResult
  }

  const getBoxesForTime = (currentTime: number) => {
    return getFrameResultForTime(currentTime)?.boxes ?? []
  }

  const getBoxesForFrame = (frameIndex: number) => {
    return getFrameResultForFrame(frameIndex)?.boxes ?? []
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
    timelineResults,
    latestFrameIndex,
    latestKnownFps,
    latestSampleInterval,
    lastBatch,
    lastMessageAt,
    connectionError,
    connect,
    disconnect,
    resetSession,
    clearResults,
    getBoxesForTime,
    getBoxesForFrame,
    getFrameResultForTime,
    getFrameResultForFrame
  }
}


