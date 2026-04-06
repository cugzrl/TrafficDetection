<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import DashboardHeader from './RealTimeDetection/DashboardHeader.vue'
import VideoMonitor from './RealTimeDetection/VideoMonitor.vue'
import TrafficCharts from './RealTimeDetection/TrafficCharts.vue'
import ControlConsole from './RealTimeDetection/ControlConsole.vue'
import DetectionTable from './RealTimeDetection/DetectionTable.vue'
import ConfigDrawers from './RealTimeDetection/ConfigDrawers.vue'
import { useClock } from '../composables/useClock'
import { useDetectionSSE } from '../composables/useDetectionSSE'
import type { DetectionBox, DetectionMediaItem, MediaKind, MediaLoadedPayload } from '../types/detection'
import { getDetectionBoxKey, getMediaKindFromMime } from '../types/detection'

interface DbFormState {
  type: string
  host: string
  port: string
  database: string
  username: string
  password: string
}

interface VideoMonitorExposed {
  play: () => Promise<void> | void
  pause: () => void
}

const API_BASE = 'http://127.0.0.1:8000'
const BUFFER_START_THRESHOLD = 15.0
const BUFFER_STOP_THRESHOLD = 0.5
const BUFFERING_STATUS = '正在缓冲'
const DETECTING_STATUS = '正在识别'

const { currentTime } = useClock()

const {
  sseStatus,
  modelStatus,
  isDetecting,
  boxes,
  timelineResults,
  latestKnownFps,
  connect,
  disconnect,
  resetSession,
  getFrameResultForTime
} = useDetectionSSE({
  onOpen: () => {
    ElMessage.success('已连接到推理通道')
  },
  onClose: () => {
    ElMessage.success('当前视频检测已完成')
  },
  onError: (error) => {
    console.error('SSE错误:', error)
    ElMessage.error('推理连接发生错误')
  },
  onParseError: (error, rawMessage) => {
    console.error('解析数据失败:', error, rawMessage)
  }
})

const mediaListDialogVisible = ref(false)
const configDrawerVisible = ref(false)
const resultsDrawerVisible = ref(false)
const mediaList = ref<DetectionMediaItem[]>([])
const selectedMediaId = ref('')
const currentMedia = ref<DetectionMediaItem | null>(null)
const videoMonitorRef = ref<VideoMonitorExposed | null>(null)
const currentPlaybackTime = ref(0)
const fallbackPlaybackFrameIndex = ref(0)
const mediaLoaded = ref(false)
const pendingAutoStart = ref(false)
const selectedBox = ref<DetectionBox | null>(null)
const selectedBoxKey = ref<string | null>(null)
const localPreviewUrl = ref<string | null>(null)
const dbForm = ref<DbFormState>({
  type: 'MySQL',
  host: '',
  port: '',
  database: '',
  username: '',
  password: ''
})

const currentMediaLabel = computed(() => currentMedia.value?.name ?? '未选择视频')
const activeFrameRate = computed(() => currentMedia.value?.fps ?? latestKnownFps.value ?? 30)
const effectiveMediaKind = computed<MediaKind>(() => currentMedia.value?.kind ?? 'unknown')
const currentMediaSrc = computed(() => currentMedia.value?.previewSrc ?? '')
const latestProcessedSecond = computed(() => {
  const timeline = timelineResults.value
  if (timeline.length === 0) {
    return 0
  }

  const latestFrame = timeline[timeline.length - 1]
  if (typeof latestFrame?.second === 'number' && Number.isFinite(latestFrame.second)) {
    return latestFrame.second
  }

  if (typeof latestFrame?.timestampMs === 'number' && Number.isFinite(latestFrame.timestampMs)) {
    return latestFrame.timestampMs / 1000
  }

  return 0
})
const activeDetectionFrame = computed(() => {
  if (currentMedia.value?.kind !== 'video') {
    return null
  }

  return getFrameResultForTime(currentPlaybackTime.value)
})
const currentFrameIndex = computed(() => {
  return activeDetectionFrame.value?.frameIndex ?? fallbackPlaybackFrameIndex.value
})
const displayedBoxes = computed(() => {
  if (currentMedia.value?.kind === 'video') {
    return activeDetectionFrame.value?.boxes ?? []
  }

  return boxes.value
})

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const getStringByKeys = (value: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }

  return ''
}

const getNumberByKeys = (value: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Number(candidate)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return undefined
}

const buildVideoPreviewSrc = (videoId: string) => {
  return `${API_BASE}/static/videos/${encodeURIComponent(videoId)}`
}

const resolvePreviewSrc = (value: Record<string, unknown>) => {
  const candidate = getStringByKeys(value, [
    'previewSrc',
    'preview',
    'previewUrl',
    'url',
    'videoUrl',
    'video_url',
    'src',
    'path'
  ])

  if (!candidate) {
    const videoId = getStringByKeys(value, ['id', 'videoId', 'video_id', 'name', 'filename', 'fileName'])
    return videoId ? buildVideoPreviewSrc(videoId) : ''
  }

  if (/^(blob:|data:|https?:\/\/)/.test(candidate)) {
    return candidate
  }

  if (candidate.startsWith('/')) {
    return `${API_BASE}${candidate}`
  }

  return `${API_BASE}/${candidate.replace(/^\.?\//, '')}`
}

const normalizeLibraryMediaItem = (value: unknown): DetectionMediaItem | null => {
  if (typeof value === 'string') {
    return {
      id: value,
      name: value,
      kind: 'video',
      previewSrc: buildVideoPreviewSrc(value),
      source: 'library'
    }
  }

  if (!isRecord(value)) {
    return null
  }

  const name = getStringByKeys(value, ['name', 'title', 'filename', 'fileName']) || '未命名视频'
  const id = getStringByKeys(value, ['id', 'videoId', 'video_id']) || name
  const fps = getNumberByKeys(value, ['fps', 'frameRate', 'frame_rate'])

  return {
    id,
    name,
    kind: 'video',
    previewSrc: resolvePreviewSrc({ ...value, id, name }),
    source: 'library',
    raw: value,
    fps
  }
}

const normalizeUploadedMediaItem = (responseData: unknown, file: File, previewSrc: string) => {
  if (typeof responseData === 'string' || typeof responseData === 'number') {
    return {
      id: String(responseData),
      name: file.name,
      kind: 'video' as const,
      previewSrc,
      source: 'upload' as const
    }
  }

  if (isRecord(responseData)) {
    const name = getStringByKeys(responseData, ['name', 'title', 'filename', 'fileName']) || file.name
    const id = getStringByKeys(responseData, ['id', 'videoId', 'video_id']) || name
    const remotePreviewSrc = resolvePreviewSrc({ ...responseData, id, name })

    return {
      id,
      name,
      kind: 'video' as const,
      previewSrc: previewSrc || remotePreviewSrc,
      source: 'upload' as const,
      raw: responseData,
      fps: getNumberByKeys(responseData, ['fps', 'frameRate', 'frame_rate'])
    }
  }

  return {
    id: file.name,
    name: file.name,
    kind: 'video' as const,
    previewSrc,
    source: 'upload' as const
  }
}

const upsertMediaItem = (nextMedia: DetectionMediaItem) => {
  mediaList.value = [nextMedia, ...mediaList.value.filter((item) => item.id !== nextMedia.id)]
}

const revokeLocalPreview = () => {
  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
    localPreviewUrl.value = null
  }
}

const clearSelectedTarget = () => {
  selectedBox.value = null
  selectedBoxKey.value = null
}

const openConfigDrawer = () => {
  configDrawerVisible.value = true
}

const openResultsDrawer = () => {
  resultsDrawerVisible.value = true
}

const closeResultsDrawer = () => {
  resultsDrawerVisible.value = false
}

const setCurrentMediaSession = (media: DetectionMediaItem) => {
  if (localPreviewUrl.value && media.previewSrc !== localPreviewUrl.value) {
    revokeLocalPreview()
  }

  currentMedia.value = media
  selectedMediaId.value = media.id
  currentPlaybackTime.value = 0
  fallbackPlaybackFrameIndex.value = 0
  mediaLoaded.value = false
  pendingAutoStart.value = false
  clearSelectedTarget()
  resultsDrawerVisible.value = false
  resetSession()
}

const startDetectionForCurrentMedia = ({ forceImmediate = false, silent = false } = {}) => {
  const media = currentMedia.value

  if (!media) {
    if (!silent) {
      ElMessage.warning('请先选择视频')
    }
    return false
  }

  if (!media.id) {
    if (!silent) {
      ElMessage.warning('当前视频还没有可用的后端标识，暂时无法开始检测')
    }
    return false
  }

  if (!forceImmediate && !mediaLoaded.value) {
    pendingAutoStart.value = true
    if (!silent) {
      ElMessage.info('视频还在加载，加载完成后会自动开始检测')
    }
    return false
  }

  resetSession()
  const controller = connect(media.id)
  if (!controller) {
    return false
  }

  pendingAutoStart.value = false
  mediaListDialogVisible.value = false

  if (!silent) {
    ElMessage.success('检测任务已启动')
  }

  return true
}

const openMediaSelector = async () => {
  try {
    const res = await axios.get(`${API_BASE}/api/list/video`)
    const nextMediaList = Array.isArray(res.data?.data)
      ? res.data.data
          .map(normalizeLibraryMediaItem)
          .filter((item: DetectionMediaItem | null): item is DetectionMediaItem => item !== null)
      : []

    mediaList.value = nextMediaList
    if (!selectedMediaId.value && nextMediaList.length > 0) {
      selectedMediaId.value = nextMediaList[0].id
    }

    mediaListDialogVisible.value = true
  } catch (error) {
    console.error('获取视频列表失败:', error)
    ElMessage.error('获取视频列表失败')
  }
}

const handleMediaChange = async (uploadFile: UploadFile) => {
  if (!uploadFile.raw) {
    return
  }

  const rawFile = uploadFile.raw as File
  const detectedKind = getMediaKindFromMime(rawFile.type)
  if (detectedKind !== 'video') {
    ElMessage.warning('当前仅支持视频检测，请上传视频文件')
    return
  }

  revokeLocalPreview()
  const previewSrc = URL.createObjectURL(rawFile)
  localPreviewUrl.value = previewSrc

  setCurrentMediaSession({
    id: '',
    name: rawFile.name,
    kind: 'video',
    previewSrc,
    source: 'upload'
  })

  ElMessage.success('视频预览已载入，正在上传到本地服务器')

  const formData = new FormData()
  formData.append('file', rawFile)

  try {
    const res = await axios.post(`${API_BASE}/api/upload/video`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    const uploadedMedia = normalizeUploadedMediaItem(res.data?.data, rawFile, previewSrc)
    currentMedia.value = uploadedMedia
    selectedMediaId.value = uploadedMedia.id
    upsertMediaItem(uploadedMedia)

    if (mediaLoaded.value) {
      startDetectionForCurrentMedia({ forceImmediate: true })
    } else {
      pendingAutoStart.value = true
      ElMessage.success('上传成功，视频加载完成后将自动开始检测')
    }
  } catch (error) {
    console.error('上传失败:', error)
    ElMessage.error('上传至本地服务器失败，请检查后端服务是否启动')
  }
}

const handleStartCurrentDetection = () => {
  if (!currentMedia.value) {
    openMediaSelector()
    return
  }

  startDetectionForCurrentMedia()
}

const handleStartInferenceFromLibrary = (mediaId?: string) => {
  const targetMediaId = mediaId ?? selectedMediaId.value
  const targetMedia = mediaList.value.find((item) => item.id === targetMediaId)

  if (!targetMedia) {
    ElMessage.warning('请先选择一个视频')
    return
  }

  setCurrentMediaSession(targetMedia)
  pendingAutoStart.value = true
  mediaListDialogVisible.value = false
  ElMessage.success('视频已载入，画面准备完成后将自动开始检测')
}

const pauseDetection = () => {
  if (sseStatus.value === 'connected' || sseStatus.value === 'connecting' || isDetecting.value) {
    disconnect()
    ElMessage.info('已暂停识别')
    return
  }

  ElMessage.info('当前没有进行中的识别任务')
}

const handleDbConnect = () => {
  ElMessage.success(`正在连接到 ${dbForm.value.type} 数据库...`)
}

const handleMediaLoaded = (_payload: MediaLoadedPayload) => {
  mediaLoaded.value = true

  if (pendingAutoStart.value) {
    const started = startDetectionForCurrentMedia({ forceImmediate: true, silent: true })
    if (started) {
      ElMessage.success('视频加载完成，已自动开始检测')
    }
  }
}

const handleFrameChange = (payload: { currentTime: number; frameIndex: number }) => {
  currentPlaybackTime.value = payload.currentTime
  fallbackPlaybackFrameIndex.value = payload.frameIndex
}

const handleBoxSelect = (box: DetectionBox | null) => {
  if (!box) {
    return
  }

  const matchedIndex = displayedBoxes.value.findIndex((item) => {
    const itemIdentity = item.objectId ?? item.trackId ?? item.id
    const boxIdentity = box.objectId ?? box.trackId ?? box.id

    if (itemIdentity !== undefined && boxIdentity !== undefined) {
      return String(itemIdentity) === String(boxIdentity)
    }

    return (
      item.x === box.x &&
      item.y === box.y &&
      item.width === box.width &&
      item.height === box.height &&
      item.type === box.type &&
      (item.frameIndex ?? currentFrameIndex.value) === (box.frameIndex ?? currentFrameIndex.value)
    )
  })

  selectedBoxKey.value = matchedIndex >= 0
    ? getDetectionBoxKey(displayedBoxes.value[matchedIndex], matchedIndex)
    : getDetectionBoxKey(box)
  selectedBox.value = { ...box }
  resultsDrawerVisible.value = true
}

const handleDrawerVisibleUpdate = (value: boolean) => {
  configDrawerVisible.value = value
}

const handleDialogVisibleUpdate = (value: boolean) => {
  mediaListDialogVisible.value = value
}

const handleSelectedMediaIdUpdate = (value: string) => {
  selectedMediaId.value = value
}

const handleDbFormUpdate = (value: DbFormState) => {
  dbForm.value = value
}

watch(
  [latestProcessedSecond, currentPlaybackTime, isDetecting],
  ([latestSecond, playbackTime, detecting]) => {
    if (!videoMonitorRef.value || currentMedia.value?.kind !== 'video') {
      return
    }

    if (!detecting && modelStatus.value !== '已完成') {
      return
    }

    const bufferDiff = latestSecond - playbackTime

    if (bufferDiff < BUFFER_STOP_THRESHOLD && modelStatus.value !== '已完成') {
      videoMonitorRef.value.pause()
      modelStatus.value = BUFFERING_STATUS
      return
    }

    if (bufferDiff >= BUFFER_START_THRESHOLD || modelStatus.value === '已完成') {
      void videoMonitorRef.value.play()
      if (modelStatus.value === BUFFERING_STATUS) {
        modelStatus.value = DETECTING_STATUS
      }
    }
  }
)

watch(
  displayedBoxes,
  (nextBoxes) => {
    if (!selectedBoxKey.value) {
      return
    }

    const match = nextBoxes.find((box, index) => getDetectionBoxKey(box, index) === selectedBoxKey.value)
    if (match) {
      selectedBox.value = { ...match }
    }
  },
  { deep: true }
)

onUnmounted(() => {
  revokeLocalPreview()
})
</script>

<template>
  <div class="dashboard-container">
    <div class="starry-bg"></div>

    <el-container class="layout-container">
      <DashboardHeader :current-time="currentTime" />

      <el-main class="main-content">
        <div class="top-section">
          <div class="left-column">
            <VideoMonitor
              ref="videoMonitorRef"
              :media-kind="effectiveMediaKind"
              :media-src="currentMediaSrc"
              :fallback-frame-src="''"
              :boxes="displayedBoxes"
              :selected-box-key="selectedBoxKey"
              :frame-rate="activeFrameRate"
              :current-frame-index="currentFrameIndex"
              :media-label="currentMediaLabel"
              @media-loaded="handleMediaLoaded"
              @frame-change="handleFrameChange"
              @box-click="handleBoxSelect"
            />
          </div>

          <div class="analysis-column">
            <div class="upper-row">
              <div class="pie-column">
                <TrafficCharts variant="pie" :boxes="displayedBoxes" />
              </div>

              <div class="control-column">
                <ControlConsole
                  :model-status="modelStatus"
                  :connection-status="sseStatus"
                  :current-media-label="currentMediaLabel"
                  @upload="handleMediaChange"
                  @library="openMediaSelector"
                  @start="handleStartCurrentDetection"
                  @pause="pauseDetection"
                  @config="openConfigDrawer"
                  @view-results="openResultsDrawer"
                />
              </div>
            </div>

            <div class="lower-row">
              <TrafficCharts variant="line" :boxes="displayedBoxes" />
            </div>
          </div>
        </div>
      </el-main>
    </el-container>

    <el-drawer
      v-model="resultsDrawerVisible"
      direction="rtl"
      size="40%"
      :modal="false"
      class="tech-drawer results-drawer"
      :with-header="false"
    >
      <div class="drawer-content table-drawer-content">
        <DetectionTable
          :boxes="displayedBoxes"
          :selected-box="selectedBox"
          :selected-box-key="selectedBoxKey"
          :current-frame-index="currentFrameIndex"
          :show-close-button="true"
          @select-box="handleBoxSelect"
          @close="closeResultsDrawer"
        />
      </div>
    </el-drawer>

    <ConfigDrawers
      :drawer-visible="configDrawerVisible"
      :dialog-visible="mediaListDialogVisible"
      :model-status="modelStatus"
      :media-list="mediaList"
      :db-form="dbForm"
      :selected-media-id="selectedMediaId"
      @update:drawer-visible="handleDrawerVisibleUpdate"
      @update:dialog-visible="handleDialogVisibleUpdate"
      @update:selected-media-id="handleSelectedMediaIdUpdate"
      @update:db-form="handleDbFormUpdate"
      @connect-db="handleDbConnect"
      @start-inference="handleStartInferenceFromLibrary"
    />
  </div>
</template>

<style scoped>
.dashboard-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: #02050a;
  overflow: hidden;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
}

.starry-bg {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  background-image:
    radial-gradient(1.5px 1.5px at 10% 10%, #fff, transparent),
    radial-gradient(2px 2px at 25% 45%, #fff, transparent),
    radial-gradient(1px 1px at 40% 80%, #fff, transparent),
    radial-gradient(2.5px 2.5px at 60% 20%, #e0f7ff, transparent),
    radial-gradient(1.5px 1.5px at 75% 65%, #fff, transparent),
    radial-gradient(2px 2px at 90% 90%, #cceeff, transparent),
    radial-gradient(300px 150px at 15% 30%, rgba(0, 50, 120, 0.15), transparent),
    radial-gradient(250px 180px at 85% 70%, rgba(0, 100, 180, 0.12), transparent);
  background-repeat: repeat;
  background-size: 250px 250px;
  opacity: 0.8;
  pointer-events: none;
}

.layout-container {
  position: relative;
  z-index: 1;
  height: 100%;
  padding: 15px 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 0 !important;
  overflow: hidden;
  flex: 1;
}

.top-section {
  display: flex;
  gap: 15px;
  flex: 1;
  height: 100%;
  min-height: 420px;
}

.left-column,
.analysis-column,
.upper-row,
.lower-row,
.pie-column,
.control-column {
  height: 100%;
  box-sizing: border-box;
  min-height: 0;
}

.left-column {
  flex: 3;
  display: flex;
  flex-direction: column;
}

.analysis-column {
  flex: 2;
  display: flex;
  flex-direction: column;
  gap: 15px;
  min-width: 0;
}

.upper-row {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1.2fr);
  gap: 15px;
  width: 100%;
}

.lower-row {
  flex: 1.1;
  display: flex;
  width: 100%;
  min-width: 0;
}

.pie-column {
  display: flex;
  min-width: 0;
  width: 100%;
  max-width: none;
}

.control-column {
  display: flex;
  align-items: stretch;
  justify-self: stretch;
  width: 100%;
  min-width: 0;
  max-width: none;
  margin: 0 !important;
}

.pie-column > *,
.control-column > * {
  width: 100%;
  min-width: 0;
  max-width: none;
}

.table-drawer-content {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

:global(.results-drawer .el-drawer__body) {
  padding: 15px !important;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>

