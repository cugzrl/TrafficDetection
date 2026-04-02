<script setup lang="ts">
import { ref } from 'vue'
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
import { useTrafficMock, type TrafficTableRow } from '../composables/useTrafficMock'
import { useDetectionWS } from '../composables/useDetectionWS'

interface DbFormState {
  type: string
  host: string
  port: string
  database: string
  username: string
  password: string
}

type VideoListItem =
  | string
  | {
      id?: string | number
      name?: string
      [key: string]: unknown
    }

const API_BASE = 'http://127.0.0.1:8000'

const { currentTime } = useClock()

const { tableData, isTablePaused, setPaused } = useTrafficMock()

const {
  wsStatus,
  modelStatus,
  isDetecting,
  boxes,
  latestFrameSrc,
  connect,
  disconnect
} = useDetectionWS({
  onOpen: () => {
    ElMessage.success('已连接到推理服务器')
  },
  onError: (error) => {
    console.error('WebSocket错误:', error)
    ElMessage.error('推理连接发生错误')
  },
  onParseError: (error) => {
    console.error('解析WebSocket数据失败:', error)
  }
})

const videoListDialogVisible = ref(false)
const configDrawerVisible = ref(false)
const videoList = ref<VideoListItem[]>([])
const selectedVideoId = ref('')
const dbForm = ref<DbFormState>({
  type: 'MySQL',
  host: '',
  port: '',
  database: '',
  username: '',
  password: ''
})

const openConfigDrawer = () => {
  configDrawerVisible.value = true
}

const openVideoSelector = async () => {
  try {
    const res = await axios.get(`${API_BASE}/api/list/video`)

    if (res.data) {
      videoList.value = Array.isArray(res.data.data) ? res.data.data : []
      videoListDialogVisible.value = true
    }
  } catch (error) {
    console.error('获取视频列表失败:', error)
    ElMessage.error('获取视频列表失败')
  }
}

const handleVideoChange = async (uploadFile: UploadFile) => {
  if (!uploadFile.raw) {
    return
  }

  const formData = new FormData()
  formData.append('file', uploadFile.raw)

  try {
    const res = await axios.post(`${API_BASE}/api/upload/video`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    if (res.data?.data) {
      ElMessage.success('上传至本地服务器成功')
    }
  } catch (error) {
    console.error('上传失败:', error)
    ElMessage.error('上传至本地服务器失败，请检查后端服务是否启动')
  }
}

const startBackendInference = (videoId?: string) => {
  const targetVideoId = videoId ?? selectedVideoId.value

  if (!targetVideoId) {
    ElMessage.warning('请先选择一个视频')
    return
  }

  selectedVideoId.value = targetVideoId

  if (connect(targetVideoId)) {
    videoListDialogVisible.value = false
  }
}

const pauseDetection = () => {
  if (wsStatus.value === 'connected' || isDetecting.value) {
    disconnect()
    ElMessage.info('已暂停识别')
    return
  }

  ElMessage.info('当前没有进行中的识别任务')
}

const handleDbConnect = () => {
  ElMessage.success(`正在连接到 ${dbForm.value.type} 数据库...`)
}

const handleTableExpandChange = (_row: TrafficTableRow, expandedRows: TrafficTableRow[]) => {
  setPaused(expandedRows.length > 0)
}

const handleDrawerVisibleUpdate = (value: boolean) => {
  configDrawerVisible.value = value
}

const handleDialogVisibleUpdate = (value: boolean) => {
  videoListDialogVisible.value = value
}

const handleSelectedVideoIdUpdate = (value: string) => {
  selectedVideoId.value = value
}

const handleDbFormUpdate = (value: DbFormState) => {
  dbForm.value = value
}
</script>

<template>
  <div class="dashboard-container">
    <div class="starry-bg"></div>

    <el-container class="layout-container">
      <DashboardHeader :current-time="currentTime" />

      <el-main class="main-content">
        <div class="top-section">
          <div class="left-column">
            <VideoMonitor :latest-frame-src="latestFrameSrc" :boxes="boxes" />
          </div>

          <div class="analysis-column">
            <div class="upper-row">
              <div class="pie-column">
                <TrafficCharts variant="pie" :boxes="boxes" />
              </div>

              <div class="control-column">
                <ControlConsole
                  :model-status="modelStatus"
                  @upload="handleVideoChange"
                  @start="openVideoSelector"
                  @pause="pauseDetection"
                  @config="openConfigDrawer"
                />
              </div>
            </div>

            <div class="lower-row">
              <TrafficCharts variant="line" :boxes="boxes" />
            </div>
          </div>
        </div>

        <div class="bottom-section">
          <DetectionTable
            :table-data="tableData"
            :is-table-paused="isTablePaused"
            @expand-change="handleTableExpandChange"
          />
        </div>
      </el-main>
    </el-container>

    <ConfigDrawers
      :drawer-visible="configDrawerVisible"
      :dialog-visible="videoListDialogVisible"
      :model-status="modelStatus"
      :video-list="videoList"
      :db-form="dbForm"
      :selected-video-id="selectedVideoId"
      @update:drawer-visible="handleDrawerVisibleUpdate"
      @update:dialog-visible="handleDialogVisibleUpdate"
      @update:selected-video-id="handleSelectedVideoIdUpdate"
      @update:db-form="handleDbFormUpdate"
      @connect-db="handleDbConnect"
      @start-inference="startBackendInference"
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
  height: 55vh;
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
  flex: 3.2;
  display: flex;
  flex-direction: column;
}

.analysis-column {
  flex: 2.0;
  display: flex;
  flex-direction: column;
  gap: 15px;
  min-width: 0;
}

.upper-row {
  flex: 1.0;
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1.20fr);
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

.pie-column > *{
  width: 100%;
  min-width: 0;
  max-width: none;
}

.control-column > * {
  width: 100%;
  min-width: 0;
  max-width: none;
}

.bottom-section {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
</style>
