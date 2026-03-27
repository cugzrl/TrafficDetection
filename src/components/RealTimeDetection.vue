<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { VideoCamera, Setting, List, Upload, Coin, PieChart, TrendCharts } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import axios from 'axios'
import trafficDataMock from '../mock/trafficData.json'

const API_BASE = 'http://127.0.0.1:8000'
const WS_BASE = 'ws://127.0.0.1:8000'

const videoListDialogVisible = ref(false)
const videoList = ref<any[]>([])
const selectedVideoId = ref('')
let wsInstance: WebSocket | null = null

let lastLineChartUpdateTime = 0

const pauseDetection = () => {
  ElMessage.info('已暂停识别')
}

const categories = ['汽车', '面包车', '公交车', '三轮车', '骑电动车的人', '骑自行车的人', '行人']
const colorMap: Record<string, string> = {
  '汽车': '#2EABFF',
  '三轮车': '#EF6B6B',
  '面包车': '#F273AA',
  '公交车': '#927FF0',
  '行人': '#98F07F',
  '骑自行车的人': '#F0DD7F',
  '骑电动车的人': '#FFA270'
}

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const videoContainerRef = ref<HTMLDivElement | null>(null)
const modelStatus = ref('未加载') 

let worker: Worker | null = null
let isDetecting = false
let isWorkerBusy = false

const dbForm = ref({
  type: 'MySQL',
  host: '',
  port: '',
  database: '',
  username: '',
  password: ''
})

const handleDbConnect = () => {
  ElMessage.success(`正在连接到 ${dbForm.value.type} 数据库...`)
}

const tableData = ref<any[]>([])
const isTablePaused = ref(false)

const configDrawerVisible = ref(false)

// 看板
const currentActive = ref(0)
let tempActiveCount = 0 // 后台接收的临时变量
let activeCountTimer: number | null = null // 1秒更新一次

const handleExpandChange = (row: any, expandedRows: any[]) => {
  isTablePaused.value = expandedRows.length > 0
}

// 图表
const pieChartRef = ref<HTMLDivElement | null>(null)
const lineChartRef = ref<HTMLDivElement | null>(null)
let pieChartInstance: echarts.ECharts | null = null
let lineChartInstance: echarts.ECharts | null = null

const initCharts = () => {
  if (pieChartRef.value) {
    pieChartInstance = echarts.init(pieChartRef.value, 'dark')
    pieChartInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: [
        {
          orient: 'vertical',
          right: '5%',
          top: 'middle',
          itemGap: 12,
          textStyle: { 
            color: '#a3d9ff',
            fontSize: 14
          },
          data: ['汽车', '三轮车', '公交车', '面包车']
        },
        {
          orient: 'vertical',
          left: '5%',
          top: 'middle',
          itemGap: 23,
          textStyle: { 
            color: '#a3d9ff',
            fontSize: 14
          },
          data: ['行人', '骑自行车的人', '骑电动车的人']
        }
      ],
      series: [
        {
          name: '目标类型',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: 'rgba(0,0,0,0.5)',
            borderWidth: 2
          },
          label: { show: false },
          labelLine: { show: false },
          data: categories.map(name => ({
            value: 0,
            name,
            itemStyle: { color: colorMap[name] }
          }))
        }
      ]
    })
  }

  if (lineChartRef.value) {
    const initialTimeData = Array(30).fill('')
    const initialValueData = Array(30).fill(0)
    
    lineChartInstance = echarts.init(lineChartRef.value, 'dark')
    lineChartInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { top: 30, right: 20, bottom: 30, left: 40 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: initialTimeData,
        axisLine: { lineStyle: { color: 'rgba(0, 210, 255, 0.5)' } }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(0, 210, 255, 0.1)' } },
        axisLine: { lineStyle: { color: 'rgba(0, 210, 255, 0.5)' } }
      },
      series: [
        {
          name: '流量',
          type: 'line',
          smooth: true,
          lineStyle: { 
            width: 3, 
            color: '#00d2ff',
            shadowColor: '#00d2ff',
            shadowBlur: 10
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 210, 255, 0.5)' },
              { offset: 0.5, color: 'rgba(0, 210, 255, 0.2)' },
              { offset: 1, color: 'rgba(0, 210, 255, 0.02)' }
            ])
          },
          data: initialValueData
        }
      ]
    })
  }
}

const updateChartsWithBoxes = (boxes: any[]) => {
  const counts: Record<string, number> = {}
  categories.forEach(c => counts[c] = 0)
  boxes.forEach(box => {
    if (counts[box.type] !== undefined) {
      counts[box.type]++
    }
  })

  // 更新看板数据（只更新后台临时变量，不直接渲染）
  tempActiveCount = boxes.length

  if (pieChartInstance) {
    const pieData = categories.map(name => ({
      value: counts[name],
      name,
      itemStyle: { color: colorMap[name] }
    }))
    pieChartInstance.setOption({ series: [{ data: pieData }] })
  }

  const nowTime = Date.now()
  if (nowTime - lastLineChartUpdateTime >= 5000) {
    if (lineChartInstance) {
      const currentOption = lineChartInstance.getOption() as any
      if (currentOption && currentOption.series) {
        const data = currentOption.series[0].data
        const xAxisData = currentOption.xAxis[0].data
        
        data.shift()
        data.push(boxes.length)
        
        xAxisData.shift()
        const now = new Date()
        xAxisData.push(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`)
        
        lineChartInstance.setOption({
          xAxis: { data: xAxisData },
          series: [{ data }]
        })
      }
    }
    lastLineChartUpdateTime = nowTime
  }
}

const handleResize = () => {
  if (pieChartInstance) pieChartInstance.resize()
  if (lineChartInstance) lineChartInstance.resize()
}

let mockTimer: number | null = null
let mockIndex = 0

const startMockData = () => {
  mockTimer = window.setInterval(() => {
    const data = trafficDataMock[mockIndex % trafficDataMock.length]
    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    
    if (!isTablePaused.value) {
      const newData = { ...data, time: timeStr, id: tableData.value.length + 1 }
      tableData.value.unshift(newData)
      
      if (tableData.value.length > 100) {
        tableData.value.pop()
      }
    }
    
    mockIndex++
  }, 1500)
}

const getSecurityTagType = (level: number) => {
  switch (level) {
    case 1: return 'success'
    case 2: return 'info'
    case 3: return 'warning'
    case 4: return 'warning'
    case 5: return 'danger'
    default: return 'info'
  }
}


const handleVideoChange = async (uploadFile: UploadFile) => {
  if (uploadFile && uploadFile.raw) {
    const formData = new FormData()
    formData.append('file', uploadFile.raw)
    
    try {
      const res = await axios.post(`${API_BASE}/api/upload/video`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      if (res.data.data) {
        ElMessage.success('上传至本地服务器成功')
      }
    } catch (error) {
      console.error('上传失败:', error)
      ElMessage.error('上传至本地服务器失败，请检查后端服务是否启动')
    }
  }
}

let offscreenCanvas: HTMLCanvasElement | null = null
let offscreenCtx: CanvasRenderingContext2D | null = null

// 初始化Canvas
const initOffscreenCanvas = () => {
  if (!videoRef.value) return
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas')
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true })
  }
  offscreenCanvas.width = videoRef.value.videoWidth
  offscreenCanvas.height = videoRef.value.videoHeight
}


const openVideoSelector = async () => {
  try {
    const res = await axios.get(`${API_BASE}/api/list/video`)
    if (res.data) {
      videoList.value = res.data.data
      videoListDialogVisible.value = true
    }
  } catch (error) {
    console.error('获取视频列表失败:', error)
    ElMessage.error('获取视频列表失败')
  }
}

const startBackendInference = () => {
  if (!selectedVideoId.value) {
    ElMessage.warning('请先选择一个视频')
    return
  }

  videoListDialogVisible.value = false
  modelStatus.value = '加载中'

  if (wsInstance) {
    wsInstance.close()
  }

  wsInstance = new WebSocket(`${WS_BASE}/ws/frame/${selectedVideoId.value}`)

  wsInstance.onopen = () => {
    modelStatus.value = '已就绪'
    isDetecting = true
    ElMessage.success('已连接到推理服务器')
  }

  wsInstance.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      if (data.image && canvasRef.value) {
        const ctx = canvasRef.value.getContext('2d')
        if (!ctx) return

        const img = new Image()
        img.onload = () => {
          // 绘制底图
          const canvasWidth = canvasRef.value!.width
          const canvasHeight = canvasRef.value!.height
          ctx.clearRect(0, 0, canvasWidth, canvasHeight)
          
          const originalWidth = img.width
          const originalHeight = img.height
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

          ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight)

          // 绘制检测框
          if (data.boxes && Array.isArray(data.boxes)) {
            const scaleX = renderWidth / originalWidth
            const scaleY = renderHeight / originalHeight

            data.boxes.forEach((box: any) => {
              const x = box.x * scaleX + offsetX
              const y = box.y * scaleY + offsetY
              const w = box.width * scaleX
              const h = box.height * scaleY

              const color = colorMap[box.type] || '#00d2ff'

              ctx.beginPath()
              ctx.lineWidth = 1.5
              ctx.strokeStyle = color
              ctx.rect(x, y, w, h)
              ctx.stroke()

              const label = `${box.type}`
              ctx.font = '10px Arial'
              const textWidth = ctx.measureText(label).width
              
              ctx.fillStyle = color
              ctx.globalAlpha = 0.85
              ctx.fillRect(x, y - 16, textWidth + 8, 16)
              ctx.globalAlpha = 1.0
              
              ctx.fillStyle = '#000000'
              ctx.fillText(label, x + 4, y - 4)
            })

            // 更新图表和看板
            updateChartsWithBoxes(data.boxes)
          }
        }
        img.src = `data:image/jpeg;base64,${data.image}`
      }
    } catch (error) {
      console.error('解析WebSocket数据失败:', error)
    }
  }

  wsInstance.onerror = (error) => {
    console.error('WebSocket错误:', error)
    ElMessage.error('推理连接发生错误')
    modelStatus.value = '未加载'
    isDetecting = false
  }

  wsInstance.onclose = () => {
    console.log('WebSocket连接已关闭')
    modelStatus.value = '未加载'
    isDetecting = false
  }
}

// canvas与video尺寸一致
const resizeCanvas = () => {
  if (videoContainerRef.value && canvasRef.value) {
    canvasRef.value.width = videoContainerRef.value.clientWidth
    canvasRef.value.height = videoContainerRef.value.clientHeight
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
  if (videoContainerRef.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(videoContainerRef.value)
  }
  if (videoRef.value) {
    videoRef.value.addEventListener('loadedmetadata', resizeCanvas)
    videoRef.value.addEventListener('loadedmetadata', initOffscreenCanvas) // 视频加载后初始化Canvas
  }
  updateTime()
  timeTimer = window.setInterval(updateTime, 1000)
  startMockData()
  
  initCharts()
  window.addEventListener('resize', handleResize)

  // 每秒将临时变量的值赋给前台显示
  activeCountTimer = window.setInterval(() => {
    currentActive.value = tempActiveCount
  }, 1000)
})

onUnmounted(() => {
  if (resizeObserver && videoContainerRef.value) {
    resizeObserver.unobserve(videoContainerRef.value)
  }
  if (videoRef.value) {
    videoRef.value.removeEventListener('loadedmetadata', resizeCanvas)
    videoRef.value.removeEventListener('loadedmetadata', initOffscreenCanvas)
  }
  if (timeTimer) {
    clearInterval(timeTimer)
  }
  if (mockTimer) {
    clearInterval(mockTimer)
  }
  if (activeCountTimer) {
    clearInterval(activeCountTimer)
  }
  
  window.removeEventListener('resize', handleResize)
  if (pieChartInstance) pieChartInstance.dispose()
  if (lineChartInstance) lineChartInstance.dispose()
  if (wsInstance) wsInstance.close()
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
          <div class="left-column">
            <el-card class="tech-panel video-panel" shadow="never">
              <template #header>
                <div class="panel-header">
                  <span class="panel-title">
                    <el-icon><VideoCamera /></el-icon> 实时监控画面
                  </span>
                </div>
              </template>
              <div class="video-container" ref="videoContainerRef">
                <canvas ref="canvasRef" class="tech-canvas"></canvas>
                <div class="scan-line"></div>
              </div>
            </el-card>
          </div>

          <!-- 中间：图表区 -->
          <div class="center-column">
            <el-card class="tech-panel chart-panel" shadow="never">
              <template #header>
                <div class="panel-header">
                  <span class="panel-title">
                    <el-icon><PieChart /></el-icon> 目标类型占比
                  </span>
                </div>
              </template>
              <div class="chart-container" ref="pieChartRef"></div>
            </el-card>

            <el-card class="tech-panel chart-panel" shadow="never">
              <template #header>
                <div class="panel-header">
                  <span class="panel-title">
                    <el-icon><TrendCharts /></el-icon> 实时交通流量趋势
                  </span>
                </div>
              </template>
              <div class="chart-container" ref="lineChartRef"></div>
            </el-card>
          </div>

          <!-- 右侧：控制区 -->
          <div class="right-column">
            <el-card class="tech-panel control-panel" shadow="never">
              <template #header>
                <div class="panel-header">
                  <span class="panel-title">
                    <el-icon><Setting /></el-icon> 系统控制台
                  </span>
                </div>
              </template>
              <div class="control-grid">
                <el-upload
                  action=""
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="video/*"
                  @change="handleVideoChange"
                  class="upload-btn-wrapper"
                >
                  <template #trigger>
                    <el-button type="primary" plain class="tech-btn grid-btn" :icon="Upload">上传视频</el-button>
                  </template>
                </el-upload>
                <el-button 
                  type="primary" 
                  class="tech-btn primary-btn grid-btn" 
                  @click="openVideoSelector" 
                  :disabled="modelStatus === '加载中'"
                >
                  开始识别
                </el-button>
                <el-button type="warning" plain class="tech-btn grid-btn" @click="pauseDetection">
                  暂停识别
                </el-button>
                <el-button type="primary" plain class="tech-btn grid-btn" @click="configDrawerVisible = true">
                  系统配置
                </el-button>
              </div>
            </el-card>

            <el-card class="tech-panel metric-panel" shadow="never">
              <template #header>
                <div class="panel-header">
                  <span class="panel-title">
                    <el-icon><List /></el-icon> 实时活跃追踪
                  </span>
                </div>
              </template>
              <div class="metric-container">
                <div class="metric-card hud-card">
                  <div class="metric-title">实时目标</div>
                  <div class="metric-value active">{{ currentActive }}</div>
                </div>
              </div>
            </el-card>
          </div>
        </div>

        <div class="bottom-section">
          <!-- 下方：表格区域 -->
          <el-card class="tech-panel table-panel" shadow="never">
            <template #header>
              <div class="panel-header">
                <span class="panel-title">
                  <el-icon><List /></el-icon> 实时识别结果
                </span>
                <div class="panel-actions">
                  <el-tag v-if="isTablePaused" type="warning" effect="dark" class="blink-anim table-status-tag">
                    自动锁定中
                  </el-tag>
                  <el-tag v-else type="success" effect="dark" class="table-status-tag">
                    实时刷新中
                  </el-tag>
                </div>
              </div>
            </template>
            <div class="table-container">
              <el-table 
                :data="tableData" 
                class="tech-table" 
                height="100%" 
                preserve-expanded-content
                @expand-change="handleExpandChange"
              >
                <el-table-column type="expand">
                  <template #default="props">
                    <div class="expand-wrapper">
                      <el-descriptions class="tech-descriptions" :column="4" border direction="vertical">
                        <el-descriptions-item label="纵向速度">{{ props.row.lonSpeed }}</el-descriptions-item>
                        <el-descriptions-item label="横向速度">{{ props.row.latSpeed }}</el-descriptions-item>
                        <el-descriptions-item label="速度方向">{{ props.row.speedDir }}</el-descriptions-item>
                        <el-descriptions-item label="运动方向">{{ props.row.motionDir }}</el-descriptions-item>
                        
                        <el-descriptions-item label="经度">{{ props.row.longitude }}</el-descriptions-item>
                        <el-descriptions-item label="纬度">{{ props.row.latitude }}</el-descriptions-item>
                        <el-descriptions-item label="海拔">{{ props.row.altitude }}</el-descriptions-item>
                        <el-descriptions-item label="车道信息">{{ props.row.laneInfo || '--' }}</el-descriptions-item>
                        
                        <el-descriptions-item label="纵向加速度">{{ props.row.lonAcc }}</el-descriptions-item>
                        <el-descriptions-item label="横向加速度">{{ props.row.latAcc }}</el-descriptions-item>
                        <el-descriptions-item label="加速度方向" :span="2">{{ props.row.accDir }}</el-descriptions-item>
                      </el-descriptions>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="id" label="序号" align="center" />
                <el-table-column prop="time" label="时间" align="center" />
                <el-table-column prop="type" label="目标类型" align="center">
                  <template #default="scope">
                    <el-tag 
                      effect="dark" 
                      class="type-tag"
                      :style="{ backgroundColor: colorMap[scope.row.type] }"
                    >
                      {{ scope.row.type }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="plate" label="车牌号" align="center">
                  <template #default="scope">
                    <span v-if="scope.row.plate" class="plate-text">{{ scope.row.plate }}</span>
                    <span v-else class="empty-text">--</span>
                  </template>
                </el-table-column>
                <el-table-column prop="securityLevel" label="安全等级" align="center">
                  <template #default="scope">
                    <el-tag 
                      effect="dark" 
                      :class="['security-tag', `level-${scope.row.securityLevel}`]"
                      :type="getSecurityTagType(scope.row.securityLevel)"
                    >
                      {{ scope.row.securityLevel }} 级
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="尺寸(长×宽×高)" align="center">
                  <template #default="scope">
                    <span class="size-text">{{ scope.row.length }} × {{ scope.row.width }} × {{ scope.row.height }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-card>
        </div>
      </el-main>
    </el-container>

    <!-- 隐藏的配置抽屉 -->
    <el-drawer
      v-model="configDrawerVisible"
      title="系统配置与数据库连接"
      direction="rtl"
      size="400px"
      class="tech-drawer"
      :with-header="true"
    >
      <div class="drawer-content">
        <div class="drawer-section">
          <h3 class="section-title"><el-icon><Setting /></el-icon> 模型配置区</h3>
          <el-form label-position="top" class="config-form">
            <el-form-item label="交通要素识别模型">
              <el-input readonly value="RS-DETR" class="tech-input" />
            </el-form-item>
            <el-form-item label="模型加载状态" class="status-item">
              <div :class="['status-indicator', modelStatus === '已就绪' ? 'ready' : modelStatus === '加载中' ? 'loading' : 'offline']">
                <span class="dot"></span>
                <span class="text">{{ modelStatus }}</span>
              </div>
            </el-form-item>
          </el-form>
        </div>

        <div class="drawer-section">
          <h3 class="section-title"><el-icon><Coin /></el-icon> 关系型数据库连接</h3>
          <el-form label-position="top" class="config-form compact-form" :model="dbForm">
            <el-form-item label="数据库类型">
              <el-select v-model="dbForm.type" class="tech-input" style="width: 100%" popper-class="tech-select-popper">
                <el-option label="MySQL" value="MySQL" />
                <el-option label="SQL Server" value="SQL Server" />
                <el-option label="PostgreSQL" value="PostgreSQL" />
              </el-select>
            </el-form-item>
            
            <el-row :gutter="15">
              <el-col :span="16">
                <el-form-item label="主机地址">
                  <el-input v-model="dbForm.host" class="tech-input" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="端口">
                  <el-input v-model="dbForm.port" class="tech-input" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="数据库名">
              <el-input v-model="dbForm.database" class="tech-input" />
            </el-form-item>

            <el-row :gutter="15">
              <el-col :span="12">
                <el-form-item label="用户名">
                  <el-input v-model="dbForm.username" class="tech-input" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="密码">
                  <el-input v-model="dbForm.password" type="password" show-password class="tech-input" />
                </el-form-item>
              </el-col>
            </el-row>

            <div style="margin-top: 20px;">
              <el-button type="primary" class="tech-btn primary-btn" style="width: 100%" @click="handleDbConnect">
                连接数据库
              </el-button>
            </div>
          </el-form>
        </div>
      </div>
    </el-drawer>

    <!-- 视频选择弹窗 -->
    <el-dialog 
      v-model="videoListDialogVisible" 
      title="选择要进行推理的视频" 
      width="400px"
      class="tech-dialog"
    >
      <div class="dialog-content">
        <el-select 
          v-model="selectedVideoId" 
          placeholder="请选择视频" 
          class="tech-input" 
          style="width: 100%"
          popper-class="tech-select-popper"
        >
          <el-option
            v-for="item in videoList"
            :key="item.id || item"
            :label="item.name || item"
            :value="item.id || item"
          />
        </el-select>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button class="tech-btn" @click="videoListDialogVisible = false">取消</el-button>
          <el-button type="primary" class="tech-btn primary-btn" @click="startBackendInference">
            开始连接并推理
          </el-button>
        </span>
      </template>
    </el-dialog>
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
  padding: 15px 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 标题样式 */
.header {
  text-align: center;
  padding-bottom: 10px;
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
  font-size: 24px;
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
  right: 22px;
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
  margin-top: 8px;
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
  gap: 20px;
  height: 55vh;
  min-height: 400px;
}

.left-column, .center-column, .right-column {
  height: 100%;
  box-sizing: border-box;
}

.left-column {
  flex: 2.5;
  display: flex;
  flex-direction: column;
}

.center-column {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.right-column {
  flex: 0.8;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.control-panel {
  flex: 0.6;
}

.metric-panel {
  flex: 1.4;
}

.chart-panel {
  flex: 1;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 150px;
  padding: 10px;
  box-sizing: border-box;
}

.bottom-section {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
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

/* 四角装饰 */
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
  overflow: hidden;
}

.video-panel {
  flex: 1;
}

.table-panel {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
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

.panel-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* 发光按钮 */
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
  opacity: 0;
  position: absolute;
  pointer-events: none;
  z-index: -1;
  width: 100%;
  height: 100%;
  object-fit: contain;
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
  gap: 5px;
  overflow: hidden;
  flex: 1;
}

.compact-form {
  padding: 15px 20px;
  gap: 15px;
  overflow: hidden;
  flex: 1;
}

.compact-form :deep(.el-form-item) {
  margin-bottom: 0;
}

:deep(.el-form-item__label) {
  color: #00a8ff !important;
  font-size: 16px;
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

/* 下拉菜单弹窗定制 */
:deep(.tech-select-popper) {
  background: rgba(0, 30, 60, 0.9) !important;
  border: 1px solid rgba(0, 210, 255, 0.5) !important;
  box-shadow: 0 0 15px rgba(0, 210, 255, 0.3) !important;
  backdrop-filter: blur(10px);
}

:deep(.tech-select-popper .el-select-dropdown__item) {
  color: #e0e0e0;
}

:deep(.tech-select-popper .el-select-dropdown__item.hover),
:deep(.tech-select-popper .el-select-dropdown__item:hover) {
  background-color: rgba(0, 210, 255, 0.2) !important;
  color: #00ffff;
}

:deep(.tech-select-popper .el-select-dropdown__item.selected) {
  color: #00ffff;
  font-weight: bold;
  background-color: rgba(0, 210, 255, 0.1) !important;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
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

/* 累计追踪通量看板样式 (HUD 大屏化) */
.metric-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.metric-card.hud-card {
  width: 100%;
  height: 90%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, rgba(0, 15, 30, 0.6) 100%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 15px;
  box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.1), 0 0 15px rgba(103, 194, 58, 0.1);
  transition: all 0.3s ease;
}

.metric-card.hud-card:hover {
  box-shadow: inset 0 0 50px rgba(255, 255, 255, 0.2), 0 0 20px rgba(255, 255, 255, 0.2);
}

.metric-title {
  color: #a3d9ff;
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 2px;
  text-shadow: 0 0 5px rgba(163, 217, 255, 0.5);
}

.metric-value.active {
  font-family: 'Courier New', Courier, monospace;
  font-size: 70px; 
  font-weight: bold;
  color: #76cdf6;
  line-height: 1;
  text-shadow: 
    0 0 20px rgba(48, 123, 235, 0.8), 
    0 0 40px rgba(77, 137, 248, 0.4),
    0 0 10px rgba(255, 255, 255, 0.5); /* 核心白光边缘 */
}

/* 控制台网格布局 */
.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  align-items: center;
}

.grid-btn {
  width: 100%;
  height: 45px;
  margin: 0 !important;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 1px;
}

.upload-btn-wrapper {
  width: 100%;
}

.upload-btn-wrapper :deep(.el-upload) {
  width: 100%;
}

/* 抽屉样式 */
:deep(.tech-drawer) {
  background: rgba(0, 15, 30, 0.95) !important;
  backdrop-filter: blur(10px);
  border-left: 1px solid rgba(0, 210, 255, 0.3);
  box-shadow: -10px 0 30px rgba(0, 210, 255, 0.1);
}

:deep(.tech-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 20px;
  border-bottom: 1px solid rgba(0, 210, 255, 0.3);
  color: #00ffff;
  font-size: 20px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
}

:deep(.tech-drawer .el-drawer__body) {
  padding: 0 !important;
  overflow: hidden !important;
}

:deep(.drawer-content) {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 30px;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden; 
  padding-bottom: 40px; 
  scrollbar-width: none;
  -ms-overflow-style: none;
}

:deep(.drawer-content::-webkit-scrollbar) {
  display: none;
} 


.drawer-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.drawer-section {
  background: rgba(0, 30, 60, 0.3);
  border: 1px solid rgba(0, 210, 255, 0.2);
  border-radius: 8px;
  padding: 20px;
}

.section-title {
  color: #00a8ff;
  margin: 0 0 20px 0;
  font-size: 22px;
  display: flex;
  align-items: center;
  gap: 8px;
  text-shadow: 0 0 5px rgba(0, 168, 255, 0.5);
}

.drawer-section .config-form {
  padding: 0;
}

/* 对话框样式深度定制 */
:deep(.tech-dialog) {
  background: rgba(0, 15, 30, 0.95) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 210, 255, 0.3);
  box-shadow: 0 0 30px rgba(0, 210, 255, 0.15);
  border-radius: 8px;
}

:deep(.tech-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px;
  border-bottom: 1px solid rgba(0, 210, 255, 0.3);
}

:deep(.tech-dialog .el-dialog__title) {
  color: #00ffff;
  font-size: 18px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
}

:deep(.tech-dialog .el-dialog__body) {
  padding: 30px 20px;
}

:deep(.tech-dialog .el-dialog__footer) {
  padding: 15px 20px;
  border-top: 1px solid rgba(0, 210, 255, 0.1);
}

.dialog-content {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 表格 */
.table-container {
  flex: 1;
  padding: 15px;
  overflow: hidden;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
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
  font-size: 17px;
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
  background-color: rgba(0, 210, 255, 0.15) !important;
  box-shadow: inset 0 0 15px rgba(0, 210, 255, 0.2);
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
}

/* 车牌号样式 */
.plate-text {
  font-weight: bold;
  color: #00d2ff;
  text-shadow: 0 0 9px rgba(0, 210, 255, 0.8);
  font-family: 'Courier New', Courier, monospace;
  font-size: 15px;
}

.empty-text {
  color: #666;
  font-weight: bold;
}

/* 尺寸样式 */
.size-text {
  color: #a3d9ff;
  font-family: 'Courier New', Courier, monospace;
  font-size: 17px;
  letter-spacing: 0.5px;
}

/* 目标类型 */
.type-tag {
  font-weight: bold;
  border: none !important;
  width: 90px;
  text-align: center;
}

/* 安全要素等级 */
.security-tag {
  font-weight: bold;
  border: none !important;
  width: 60px;
  text-align: center;
}
.level-1 { background-color: rgba(155, 255, 105, 0.825) !important; box-shadow: 0 0 10px rgba(103, 194, 58, 0.5); }
.level-2 { background-color: rgba(95, 211, 237, 0.908) !important; box-shadow: 0 0 10px rgba(0, 210, 255, 0.5); }
.level-3 { background-color: rgba(240, 221, 81, 0.942) !important; box-shadow: 0 0 10px rgba(230, 162, 60, 0.5); }
.level-4 { background-color: rgba(255, 167, 60, 0.904) !important; box-shadow: 0 0 10px rgba(255, 140, 0, 0.6); }
.level-5 { 
  background-color: rgba(255, 98, 98, 0.9) !important; 
  box-shadow: 0 0 15px rgba(245, 108, 108, 0.8), 0 0 5px rgba(245, 108, 108, 0.8) inset; 
  animation: pulse-danger 1.5s infinite;
}

@keyframes pulse-danger {
  0% { box-shadow: 0 0 10px rgba(245, 108, 108, 0.8); }
  50% { box-shadow: 0 0 20px rgba(245, 108, 108, 1), 0 0 10px rgba(245, 108, 108, 0.8) inset; }
  100% { box-shadow: 0 0 10px rgba(245, 108, 108, 0.8); }
}

/* 展开区域样式 */
:deep(.el-table__expanded-cell) {
  background-color: rgba(0, 15, 30, 0.6) !important;
  padding: 20px !important;
  border-bottom: 1px solid rgba(0, 210, 255, 0.3) !important;
}

:deep(.el-table__expanded-cell:hover) {
  background-color: rgba(0, 15, 30, 0.8) !important;
}

.expand-wrapper {
  border: 1px solid rgba(0, 210, 255, 0.2);
  border-radius: 4px;
  padding: 15px;
  background: linear-gradient(180deg, rgba(0, 30, 60, 0.4) 0%, rgba(0, 15, 30, 0.6) 100%);
  box-shadow: inset 0 0 20px rgba(0, 210, 255, 0.1);
}

/* 展开内容列表样式 */
:deep(.tech-descriptions) {
  --el-descriptions-table-border: 1px solid rgba(0, 210, 255, 0.2);
  --el-descriptions-item-bordered-label-background: rgba(0, 50, 100, 0.5);
}

:deep(.tech-descriptions .el-descriptions__label) {
  color: #00ffff;
  font-weight: bold;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
  text-align: center;
  width: 12%;
}

:deep(.tech-descriptions .el-descriptions__content) {
  color: #e0e0e0;
  font-family: 'Courier New', Courier, monospace;
  font-weight: bold;
  text-align: center;
  background-color: rgba(0, 20, 40, 0.4);
  width: 13%;
  text-shadow: 0 0 2px rgba(255, 255, 255, 0.3);
}

/* 展开图标颜色 */
:deep(.el-table__expand-icon) {
  color: #00ffff;
}

/* 表格状态标签动画 */
.table-status-tag {
  font-weight: bold;
  letter-spacing: 1px;
  background: rgba(0, 210, 255, 0.15) !important;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 210, 255, 0.5) !important;
  color: #00ffff !important;
  box-shadow: 0 0 10px rgba(0, 210, 255, 0.2) inset;
}

.blink-anim {
  animation: blink 1.5s infinite ease-in-out;
}

@keyframes blink {
  0% { opacity: 1; box-shadow: 0 0 15px rgba(0, 210, 255, 0.8), 0 0 10px rgba(0, 210, 255, 0.2) inset; }
  50% { opacity: 0.6; box-shadow: 0 0 5px rgba(0, 210, 255, 0.3), 0 0 10px rgba(0, 210, 255, 0.2) inset; }
  100% { opacity: 1; box-shadow: 0 0 15px rgba(0, 210, 255, 0.8), 0 0 10px rgba(0, 210, 255, 0.2) inset; }
}
</style>