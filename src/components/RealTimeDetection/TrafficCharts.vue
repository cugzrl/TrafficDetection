<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { PieChart, TrendCharts } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import type { DetectionBox } from '../../composables/useDetectionWS'

const props = withDefaults(defineProps<{
  boxes?: DetectionBox[]
  variant?: 'pie' | 'line' | 'both'
}>(), {
  boxes: () => [],
  variant: 'both'
})

const categories = ['汽车', '面包车', '公交车', '三轮车', '骑电动车的人', '骑自行车的人', '行人']
const colorMap: Record<string, string> = {
  汽车: '#2EABFF',
  三轮车: '#EF6B6B',
  面包车: '#F273AA',
  公交车: '#927FF0',
  行人: '#98F07F',
  骑自行车的人: '#F0DD7F',
  骑电动车的人: '#FFA270'
}

const chartGroupRef = ref<HTMLDivElement | null>(null)
const pieChartRef = ref<HTMLDivElement | null>(null)
const lineChartRef = ref<HTMLDivElement | null>(null)

let pieChartInstance: echarts.ECharts | null = null
let lineChartInstance: echarts.ECharts | null = null
let lastLineChartUpdateTime = 0
let resizeObserver: ResizeObserver | null = null

const showPieChart = computed(() => props.variant === 'pie' || props.variant === 'both')
const showLineChart = computed(() => props.variant === 'line' || props.variant === 'both')
const isSingleChart = computed(() => props.variant !== 'both')

const initPieChart = () => {
  if (!pieChartRef.value) {
    return
  }

  pieChartInstance = echarts.init(pieChartRef.value, 'dark')
  pieChartInstance.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: [
      {
        orient: 'vertical',
        right: '5%',
        top: 'middle',
        itemGap: 23,
        textStyle: {
          color: '#a3d9ff',
          fontSize: 15
        },
        data: ['汽车', '三轮车', '公交车', '面包车','行人', '骑自行车的人', '骑电动车的人']
      }
    ],
    series: [
        {
          name: '目标类型',
          type: 'pie',
          radius: ['36%', '60%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 5,
          borderColor: 'rgba(0,0,0,0.5)',
          borderWidth: 2
        },
        label: { show: false },
        labelLine: { show: false },
        data: categories.map((name) => ({
          value: 0,
          name,
          itemStyle: { color: colorMap[name] }
        }))
      }
    ]
  })
}

const initLineChart = () => {
  if (!lineChartRef.value) {
    return
  }

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

const updateLineChart = (activeBoxes: DetectionBox[]) => {
  const nowTime = Date.now()
  if (nowTime - lastLineChartUpdateTime < 5000 || !lineChartInstance) {
    return
  }

  const currentOption = lineChartInstance.getOption() as echarts.EChartsOption & {
    series?: Array<{ data?: number[] }>
    xAxis?: Array<{ data?: string[] }>
  }

  const seriesData = currentOption.series?.[0]?.data
  const xAxisData = currentOption.xAxis?.[0]?.data

  const currentData = Array.isArray(seriesData)
    ? [...seriesData]
    : Array(30).fill(0)
  const currentXAxisData = Array.isArray(xAxisData)
    ? [...xAxisData]
    : Array(30).fill('')

  currentData.shift()
  currentData.push(activeBoxes.length)

  currentXAxisData.shift()
  const now = new Date()
  currentXAxisData.push(
    `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  )

  lineChartInstance.setOption({
    xAxis: { data: currentXAxisData },
    series: [{ data: currentData }]
  })

  lastLineChartUpdateTime = nowTime
}

const updateChartsWithBoxes = (activeBoxes: DetectionBox[]) => {
  const counts: Record<string, number> = {}
  categories.forEach((category) => {
    counts[category] = 0
  })

  activeBoxes.forEach((box) => {
    if (counts[box.type] !== undefined) {
      counts[box.type] += 1
    }
  })

  if (pieChartInstance) {
    pieChartInstance.setOption({
      series: [
        {
          data: categories.map((name) => ({
            value: counts[name],
            name,
            itemStyle: { color: colorMap[name] }
          }))
        }
      ]
    })
  }

  updateLineChart(activeBoxes)
}

const handleResize = () => {
  pieChartInstance?.resize()
  lineChartInstance?.resize()
}

watch(
  () => props.boxes,
  (nextBoxes) => {
    updateChartsWithBoxes(nextBoxes)
  },
  { deep: true }
)

onMounted(() => {
  if (showPieChart.value) {
    initPieChart()
  }

  if (showLineChart.value) {
    initLineChart()
  }

  updateChartsWithBoxes(props.boxes)
  handleResize()

  if (chartGroupRef.value) {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(chartGroupRef.value)
  }

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
  pieChartInstance?.dispose()
  lineChartInstance?.dispose()
})
</script>

<template>
  <div ref="chartGroupRef" :class="['chart-group', { single: isSingleChart }]">
    <el-card v-if="showPieChart" class="tech-panel chart-panel" shadow="never">
      <template #header>
        <div class="panel-header">
          <span class="panel-title">
            <el-icon><PieChart /></el-icon>
            目标类型占比
          </span>
        </div>
      </template>
      <div ref="pieChartRef" class="chart-container"></div>
    </el-card>

    <el-card v-if="showLineChart" class="tech-panel chart-panel" shadow="never">
      <template #header>
        <div class="panel-header">
          <span class="panel-title">
            <el-icon><TrendCharts /></el-icon>
            实时交通流量趋势
          </span>
        </div>
      </template>
      <div ref="lineChartRef" class="chart-container"></div>
    </el-card>
  </div>
</template>

<style scoped>
.chart-group {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  flex: 1;
  height: 100%;
  min-height: 0;
}

.chart-group.single {
  gap: 0;
}

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

.chart-panel {
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

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 150px;
  padding: 10px;
  box-sizing: border-box;
}
</style>
