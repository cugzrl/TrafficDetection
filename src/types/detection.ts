export type DetectionTransportMode = 'ws' | 'sse'

export type MediaKind = 'image' | 'video' | 'stream' | 'unknown'

export interface DetectionBox {
  x: number
  y: number
  width: number
  height: number
  type: string
  confidence?: number
  frameIndex?: number
  second?: number
  trackId?: string | number
  objectId?: string | number
  score?: number
  [key: string]: unknown
}

export interface DetectionStreamPayload {
  image?: string
  boxes: DetectionBox[]
  frameIndex?: number
  fps?: number
  timestampMs?: number
  mediaType?: string
  taskId?: string
  [key: string]: unknown
}

export interface DetectionFrameResult {
  frameIndex: number
  boxes: DetectionBox[]
  timestampMs?: number
  second?: number
}

export interface DetectionMediaItem {
  id: string
  name: string
  kind: MediaKind
  previewSrc?: string
  source: 'upload' | 'library'
  raw?: unknown
  fps?: number
}

export interface MediaLoadedPayload {
  kind: MediaKind
  width: number
  height: number
  duration?: number
}

export interface MediaFramePayload {
  currentTime: number
  frameIndex: number
}

const numberLikeToString = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return ''
}

export const getDetectionBoxKey = (box: DetectionBox, fallbackIndex = 0) => {
  const explicitId =
    numberLikeToString(box.id) ||
    numberLikeToString(box.objectId) ||
    numberLikeToString(box.trackId)

  if (explicitId) {
    return explicitId
  }

  const framePart = typeof box.frameIndex === 'number' ? box.frameIndex : 'na'
  return `${box.type}-${framePart}-${box.x}-${box.y}-${box.width}-${box.height}-${fallbackIndex}`
}

export const getMediaKindFromMime = (mimeType?: string) => {
  if (!mimeType) {
    return 'unknown' as const
  }

  if (mimeType.startsWith('image/')) {
    return 'image' as const
  }

  if (mimeType.startsWith('video/')) {
    return 'video' as const
  }

  return 'unknown' as const
}
