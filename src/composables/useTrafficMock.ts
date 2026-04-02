import { onMounted, onUnmounted, ref } from 'vue'
import trafficDataMock from '../mock/trafficData.json'

type TrafficMockSeed = (typeof trafficDataMock)[number]

export interface TrafficTableRow extends TrafficMockSeed {
  id: number
  time: string
}

export interface UseTrafficMockOptions {
  autoStart?: boolean
  interval?: number
  maxRows?: number
  initialRows?: TrafficTableRow[]
}

const formatRowTime = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}

export const useTrafficMock = (options: UseTrafficMockOptions = {}) => {
  const {
    autoStart = true,
    interval = 1500,
    maxRows = 100,
    initialRows = []
  } = options

  const tableData = ref<TrafficTableRow[]>([...initialRows])
  const isTablePaused = ref(false)

  let mockTimer: number | null = null
  let mockIndex = 0
  let nextRowId = initialRows.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1

  const appendNextRow = () => {
    const seed = trafficDataMock[mockIndex % trafficDataMock.length]

    if (!isTablePaused.value) {
      const nextRow: TrafficTableRow = {
        ...seed,
        id: nextRowId++,
        time: formatRowTime(new Date())
      }

      tableData.value.unshift(nextRow)

      if (tableData.value.length > maxRows) {
        tableData.value.pop()
      }
    }

    mockIndex += 1
  }

  const startMockData = () => {
    if (mockTimer !== null) {
      return
    }

    mockTimer = window.setInterval(appendNextRow, interval)
  }

  const stopMockData = () => {
    if (mockTimer !== null) {
      window.clearInterval(mockTimer)
      mockTimer = null
    }
  }

  const setPaused = (paused: boolean) => {
    isTablePaused.value = paused
  }

  const handleExpandChange = <TRow>(_: TRow, expandedRows: TRow[]) => {
    isTablePaused.value = expandedRows.length > 0
  }

  const resetTableData = () => {
    tableData.value = []
    mockIndex = 0
    nextRowId = 1
  }

  if (autoStart) {
    onMounted(startMockData)
  }

  onUnmounted(stopMockData)

  return {
    tableData,
    isTablePaused,
    startMockData,
    stopMockData,
    setPaused,
    handleExpandChange,
    resetTableData
  }
}
