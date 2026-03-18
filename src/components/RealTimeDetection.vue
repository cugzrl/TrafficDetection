<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { VideoCamera, Setting, List, Upload } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import DetectionWorker from '../workers/detection.worker.ts?worker'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const modelStatus = ref('未加载') // 未加载 | 加载中 | 已就绪

let worker: Worker | null = null
let isDetecting = false
let isWorkerBusy = false

const tableData = ref([
  {
    id: 1,
    plate: '京A·88888',
    type: '汽车',
    length: '4.5m',
    width: '1.8m',
    height: '1.5m',
    speed: '60km/h',
    time: '2023-10-27 10:00:00',
    confidence: '0.98'
  },
  {
    id: 2,
    plate: '粤B·66666',
    type: '行人',
    length: '0.6m',
    width: '0.5m',
    height: '1.7m',
    speed: '5km/h',
    time: '2023-10-27 10:00:05',
    confidence: '0.89'
  },
  {
    id: 3,
    plate: '-',
    type: '骑行者',
    length: '1.8m',
    width: '0.6m',
    height: '1.6m',
    speed: '15km/h',
    time: '2023-10-27 10:00:10',
    confidence: '0.92'
  }
])

const handleVideoChange = (uploadFile: UploadFile) => {
  if (uploadFile && uploadFile.raw && videoRef.value) {
    const url = URL.createObjectURL(uploadFile.raw)
    videoRef.value.src = url
    // 重置状态
    isDetecting = false
    stopDetectionLoop()
    modelStatus.value = '未加载'
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext('2d')
      ctx?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
    }
  }
}

let animationFrameId: number | null = null
let offscreenCanvas: HTMLCanvasElement | null = null
let offscreenCtx: CanvasRenderingContext2D | null = null

// 初始化离屏 Canvas
const initOffscreenCanvas = () => {
  if (!videoRef.value) return
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas')
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true })
  }
  // 设置为视频原始分辨率
  offscreenCanvas.width = videoRef.value.videoWidth
  offscreenCanvas.height = videoRef.value.videoHeight
}

// 停止检测循环
const stopDetectionLoop = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  isWorkerBusy = false
}

// (模拟方法已移除，由 Worker 接管真实推理)

// 在顶层透明 Canvas 上绘制检测框
const drawBoundingBoxes = (boxes: any[], originalWidth: number, originalHeight: number) => {
  if (!canvasRef.value || !videoRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  // 1. 获取 Canvas 的实际渲染尺寸
  const canvasWidth = canvasRef.value.width
  const canvasHeight = canvasRef.value.height

  // 2. 清空上一帧
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // 3. 计算视频的 object-fit: contain 实际显示区域
  // 视频容器宽高比与视频原始宽高比的比较
  const containerRatio = canvasWidth / canvasHeight
  const videoRatio = originalWidth / originalHeight

  let renderWidth = canvasWidth
  let renderHeight = canvasHeight
  let offsetX = 0
  let offsetY = 0

  if (containerRatio > videoRatio) {
    // 容器更宽，视频高度撑满，左右留黑边
    renderHeight = canvasHeight
    renderWidth = renderHeight * videoRatio
    offsetX = (canvasWidth - renderWidth) / 2
  } else {
    // 容器更高，视频宽度撑满，上下留黑边
    renderWidth = canvasWidth
    renderHeight = renderWidth / videoRatio
    offsetY = (canvasHeight - renderHeight) / 2
  }

  // 4. 计算缩放比例 (原始尺寸 -> 实际渲染尺寸)
  const scaleX = renderWidth / originalWidth
  const scaleY = renderHeight / originalHeight

  // 5. 绘制框
  boxes.forEach(box => {
    // 坐标映射转换
    const x = box.x * scaleX + offsetX
    const y = box.y * scaleY + offsetY
    const w = box.width * scaleX
    const h = box.height * scaleY

    // 根据类型获取颜色
    const color = box.type === '汽车' ? '#00ffff' : box.type === '行人' ? '#ff00ff' : '#e6a23c'

    // 画框
    ctx.beginPath()
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.rect(x, y, w, h)
    ctx.stroke()

    // 绘制半透明背景的标签
    const label = `${box.type} ${box.confidence}`
    ctx.font = '14px Arial'
    const textMetrics = ctx.measureText(label)
    const textWidth = textMetrics.width
    
    // 标签背景
    ctx.fillStyle = color
    ctx.fillRect(x, y - 22, textWidth + 10, 22)
    
    // 标签文字
    ctx.fillStyle = '#000000'
    ctx.fillText(label, x + 5, y - 6)
  })
}

const loopDetection = () => {
  if (!videoRef.value || videoRef.value.paused || videoRef.value.ended || !isDetecting) {
    animationFrameId = requestAnimationFrame(loopDetection)
    return
  }

  if (offscreenCanvas && offscreenCtx && !isWorkerBusy && worker) {
    isWorkerBusy = true
    // 将当前视频帧绘制到离屏 Canvas
    offscreenCtx.drawImage(videoRef.value, 0, 0, offscreenCanvas.width, offscreenCanvas.height)
    
    // 提取 ImageData
    const imageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height)
    
    // 发送给 Worker 进行真实推理
    worker.postMessage({ type: 'detect', payload: { imageData } })
  }

  animationFrameId = requestAnimationFrame(loopDetection)
}

const startDetection = () => {
  if (!videoRef.value || !videoRef.value.src) {
    ElMessage.warning('请先选择本地视频文件！')
    return
  }

  if (modelStatus.value === '加载中' || modelStatus.value === '已就绪') return
  modelStatus.value = '加载中'
  
  if (!worker) {
    worker = new DetectionWorker()
    worker.onmessage = (e) => {
      const { type, payload, error } = e.data
      if (type === 'init_done') {
        modelStatus.value = '已就绪'
        console.log("Worker init done, starting detection loop");
        if (videoRef.value) {
          videoRef.value.play()
          initOffscreenCanvas()
          stopDetectionLoop()
          isDetecting = true
          loopDetection()
        }
      } else if (type === 'detect_done') {
        isWorkerBusy = false
        console.log("Detect done, payload:", payload);
        if (videoRef.value) {
           drawBoundingBoxes(payload, videoRef.value.videoWidth, videoRef.value.videoHeight)
        }
      } else if (type === 'error') {
        ElMessage.error(`模型异常: ${error}`)
        modelStatus.value = '未加载'
        isWorkerBusy = false
        isDetecting = false
      }
    }
    worker.postMessage({ type: 'init' })
  } else {
    // Worker 已经初始化过了，直接跑
    modelStatus.value = '已就绪'
    if (videoRef.value) {
      videoRef.value.play()
      initOffscreenCanvas()
      stopDetectionLoop()
      isDetecting = true
      loopDetection()
    }
  }
}

// 确保 canvas 尺寸与 video 容器实际显示尺寸一致
const resizeCanvas = () => {
  if (videoRef.value && canvasRef.value) {
    // 这里我们将 Canvas 的内部分辨率设置为与其 CSS 显示尺寸完全1:1一致
    // 这样可以在上面进行准确的坐标换算
    canvasRef.value.width = videoRef.value.clientWidth
    canvasRef.value.height = videoRef.value.clientHeight
  }
}

let resizeObserver: ResizeObserver | null = null

const currentTime = ref('')
let timeTimer: number | null = null

const updateTime = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const date = now.getDate()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const day = days[now.getDay()]
  currentTime.value = `${year}-${month}-${date} ${hours}:${minutes} ${day}`
}

onMounted(() => {
  if (videoRef.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(videoRef.value)
    videoRef.value.addEventListener('loadedmetadata', resizeCanvas)
    videoRef.value.addEventListener('loadedmetadata', initOffscreenCanvas) // 视频加载后初始化离屏Canvas
  }
  updateTime()
  timeTimer = window.setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (resizeObserver && videoRef.value) {
    resizeObserver.unobserve(videoRef.value)
  }
  if (videoRef.value) {
    videoRef.value.removeEventListener('loadedmetadata', resizeCanvas)
    videoRef.value.removeEventListener('loadedmetadata', initOffscreenCanvas)
  }
  if (timeTimer) {
    clearInterval(timeTimer)
  }
  stopDetectionLoop()
})
</script>

<template>
  <div class="dashboard-container">
    <div class="starry-bg"></div>
    <el-container class="layout-container">
      <el-header class="header" height="auto">
        <div class="header-top">
          <h1 class="title">智能交通实时监测系统</h1>
          <div class="real-time">{{ currentTime }}</div>
        </div>
        <div class="title-decoration">
          <div class="line"></div>
          <div class="dots"></div>
        </div>
      </el-header>

      <el-main class="main-content">
        <div class="top-section">
          <!-- 左侧：视频区域 -->
          <el-card class="tech-panel video-panel" shadow="never">
            <template #header>
              <div class="panel-header">
                <span class="panel-title">
                  <el-icon><VideoCamera /></el-icon> 实时监控画面
                </span>
                <div class="panel-actions">
                  <el-upload
                    action=""
                    :auto-upload="false"
                    :show-file-list="false"
                    accept="video/*"
                    @change="handleVideoChange"
                  >
                    <template #trigger>
                      <el-button type="primary" plain class="tech-btn" :icon="Upload">选择本地视频</el-button>
                    </template>
                  </el-upload>
                  <el-button 
                    type="primary" 
                    class="tech-btn primary-btn" 
                    @click="startDetection" 
                    :disabled="modelStatus === '加载中'"
                  >
                    开始识别
                  </el-button>
                </div>
              </div>
            </template>
            <div class="video-container">
              <video ref="videoRef" controls muted class="tech-video"></video>
              <canvas ref="canvasRef" class="tech-canvas"></canvas>
              <div class="scan-line"></div>
            </div>
          </el-card>

          <!-- 右侧：模型配置区域 -->
          <el-card class="tech-panel config-panel" shadow="never">
            <template #header>
              <div class="panel-header">
                <span class="panel-title">
                  <el-icon><Setting /></el-icon> 模型配置区
                </span>
              </div>
            </template>
            <el-form label-position="top" class="config-form">
              <el-form-item label="目标检测模型">
                <el-input readonly value="RT-DETR (ONNX)" class="tech-input" />
              </el-form-item>
              <el-form-item label="OCR模型">
                <el-input readonly value="Tesseract.js" class="tech-input" />
              </el-form-item>
              <el-form-item label="模型加载状态" class="status-item">
                <div :class="['status-indicator', modelStatus === '已就绪' ? 'ready' : modelStatus === '加载中' ? 'loading' : 'offline']">
                  <span class="dot"></span>
                  <span class="text">{{ modelStatus }}</span>
                </div>
              </el-form-item>
            </el-form>
          </el-card>
        </div>

        <div class="bottom-section">
          <!-- 下方：表格区域 -->
          <el-card class="tech-panel table-panel" shadow="never">
            <template #header>
              <div class="panel-header">
                <span class="panel-title">
                  <el-icon><List /></el-icon> 实时识别结果
                </span>
              </div>
            </template>
            <div class="table-container">
              <el-table :data="tableData" class="tech-table" height="100%">
                <el-table-column prop="id" label="序号" width="80" align="center" />
                <el-table-column prop="plate" label="车牌号码" align="center" />
                <el-table-column prop="type" label="目标类型" align="center" />
                <el-table-column prop="length" label="目标长度" align="center" />
                <el-table-column prop="width" label="目标宽度" align="center" />
                <el-table-column prop="height" label="目标高度" align="center" />
                <el-table-column prop="speed" label="行驶速度" align="center" />
                <el-table-column prop="time" label="识别时间" align="center" width="200" />
                <el-table-column prop="confidence" label="置信度" align="center" />
              </el-table>
            </div>
          </el-card>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
/* 背景与布局 */
.dashboard-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: #02050a;
  overflow: hidden;
  color: #e0e0e0;
}

.starry-bg {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 0;
  background-image: 
    radial-gradient(1.5px 1.5px at 10% 10%, #fff, transparent),
    radial-gradient(2px 2px at 25% 45%, #fff, transparent),
    radial-gradient(1px 1px at 40% 80%, #fff, transparent),
    radial-gradient(2.5px 2.5px at 60% 20%, #e0f7ff, transparent),
    radial-gradient(1.5px 1.5px at 75% 65%, #fff, transparent),
    radial-gradient(2px 2px at 90% 90%, #fff, transparent),
    radial-gradient(1px 1px at 85% 15%, #a3d9ff, transparent),
    radial-gradient(2px 2px at 15% 75%, #fff, transparent),
    radial-gradient(2.5px 2.5px at 50% 50%, #c4e4ff, transparent);
  background-size: 250px 250px;
  opacity: 0.8;
  pointer-events: none;
}

.layout-container {
  position: relative;
  z-index: 1;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* 标题样式 */
.header {
  text-align: center;
  padding-bottom: 20px;
  position: relative;
}

.header-top {
  display: flex;
  justify-content: center;
  align-items: baseline;
  position: relative;
  width: 100%;
}

.title {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 4px;
  background: linear-gradient(180deg, #00ffff 0%, #4d7fff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 
    0 2px 4px rgba(0, 255, 255, 0.3),
    0 0 20px rgba(0, 255, 255, 0.4);
  transition: transform 0.3s;
}

.real-time {
  position: absolute;
  right: 20px;
  bottom: 5px;
  color: #00ffff;
  font-size: 16px;
  font-family: 'Courier New', Courier, monospace;
  font-weight: bold;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.5);
  letter-spacing: 1px;
}

.title:hover {
  transform: translateY(-2px);
}

.title-decoration {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 15px;
}

.title-decoration .line {
  width: 60%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00d2ff, transparent);
  box-shadow: 0 0 10px #00d2ff, 0 0 20px #00d2ff;
}

.title-decoration .dots {
  width: 30%;
  height: 4px;
  margin-top: 4px;
  background-image: radial-gradient(circle, #00ffff 40%, transparent 50%);
  background-size: 15px 4px;
  background-repeat: repeat-x;
  background-position: center;
}

/* 核心内容区 */
.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0 !important;
  overflow: hidden;
}

.top-section {
  display: flex;
  gap: 20px;
  height: 68%;
  min-height: 450px;
}

.bottom-section {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* el-card 面板玻璃质感深度覆盖 */
:deep(.tech-panel) {
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

/* 增强四角装饰 */
.tech-panel::before {
  content: '';
  position: absolute;
  top: -1px; left: -1px; right: -1px; bottom: -1px;
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

:deep(.tech-panel .el-card__header) {
  padding: 12px 20px;
  border-bottom: 1px solid rgba(0, 210, 255, 0.3);
  background: linear-gradient(90deg, rgba(0, 210, 255, 0.1), transparent);
}

:deep(.tech-panel .el-card__body) {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.video-panel {
  flex: 2.2;
}

.config-panel {
  flex: 1;
  min-width: 320px;
}

.table-panel {
  flex: 1;
  width: 100%;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  color: #00ffff;
  font-size: 16px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* 发光按钮定制 */
:deep(.tech-btn) {
  background: rgba(0, 150, 255, 0.15) !important;
  border: 1px solid rgba(0, 210, 255, 0.5) !important;
  color: #00ffff !important;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.5) !important;
  border-radius: 4px;
}

:deep(.tech-btn:hover) {
  background: rgba(0, 210, 255, 0.3) !important;
  border-color: #00ffff !important;
  color: #ffffff !important;
  box-shadow: 0 0 15px rgba(0, 210, 255, 0.6) !important;
  transform: scale(1.02) !important;
}

:deep(.primary-btn) {
  background: rgba(0, 210, 255, 0.2) !important;
  border-color: #00ffff !important;
}

:deep(.primary-btn:hover) {
  background: rgba(0, 210, 255, 0.4) !important;
  box-shadow: 0 0 20px rgba(0, 210, 255, 0.8), inset 0 0 10px rgba(0, 210, 255, 0.5) !important;
}

:deep(.tech-btn.is-disabled) {
  opacity: 0.6;
  transform: none !important;
  box-shadow: none !important;
  cursor: not-allowed;
}

/* 视频容器 */
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

.tech-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  z-index: 1;
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
  top: 0; left: 0; right: 0; bottom: 0;
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

/* 表单定制 */
.config-form {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

:deep(.el-form-item__label) {
  color: #00a8ff !important;
  font-size: 14px;
  text-shadow: 0 0 2px rgba(0, 168, 255, 0.5);
  padding-bottom: 4px !important;
  line-height: 1.2;
}

:deep(.tech-input .el-input__wrapper) {
  background-color: rgba(0, 30, 60, 0.5) !important;
  box-shadow: 0 0 0 1px rgba(0, 210, 255, 0.3) inset !important;
  border-radius: 4px;
  transition: all 0.3s;
}

:deep(.tech-input .el-input__wrapper:hover),
:deep(.tech-input .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #00ffff inset !important;
}

:deep(.tech-input .el-input__inner) {
  color: #00ffff !important;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.5) !important;
  font-weight: bold;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 15px;
  background: rgba(0, 30, 60, 0.5);
  border: 1px solid rgba(0, 210, 255, 0.3);
  border-radius: 4px;
  color: #e0e0e0;
  width: 100%;
  box-sizing: border-box;
}

.status-indicator .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  position: relative;
}

.status-indicator.offline .dot {
  background-color: #909399;
  box-shadow: 0 0 8px #909399;
}

.status-indicator.loading .dot {
  background-color: #e6a23c;
  box-shadow: 0 0 8px #e6a23c;
  animation: pulse-loading 1.5s infinite;
}

.status-indicator.ready .dot {
  background-color: #67c23a;
  box-shadow: 0 0 8px #67c23a;
  animation: pulse-ready 2s infinite;
}

.status-indicator.ready .text {
  color: #67c23a;
  text-shadow: 0 0 5px rgba(103, 194, 58, 0.5);
  font-weight: bold;
}

@keyframes pulse-loading {
  0% { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(230, 162, 60, 0); }
  100% { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0); }
}

@keyframes pulse-ready {
  0% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(103, 194, 58, 0); }
  100% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0); }
}

/* 表格深度定制 */
.table-container {
  flex: 1;
  padding: 15px;
  overflow: hidden;
  height: 100%;
  box-sizing: border-box;
}

:deep(.tech-table) {
  background-color: transparent !important;
  --el-table-border-color: rgba(0, 210, 255, 0.2);
  --el-table-header-bg-color: rgba(0, 50, 120, 0.3);
  --el-table-header-text-color: #00ffff;
  --el-table-text-color: #e0e0e0;
  --el-table-row-hover-bg-color: rgba(0, 210, 255, 0.15);
  --el-table-tr-bg-color: transparent !important;
  --el-table-bg-color: transparent !important;
}

:deep(.tech-table tr),
:deep(.tech-table th.el-table__cell) {
  background-color: transparent !important;
}

:deep(.tech-table th.el-table__cell) {
  border-bottom: 2px solid rgba(0, 210, 255, 0.6) !important;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.5);
  backdrop-filter: blur(4px);
}

:deep(.tech-table td.el-table__cell) {
  border-bottom: 1px solid rgba(0, 210, 255, 0.1) !important;
  transition: all 0.3s;
}

:deep(.tech-table::before),
:deep(.tech-table .el-table__inner-wrapper::before) {
  display: none;
}

:deep(.tech-table tbody tr:hover > td.el-table__cell) {
  background-color: rgba(0, 210, 255, 0.2) !important;
  box-shadow: inset 0 0 10px rgba(0, 210, 255, 0.1);
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
}
</style>
