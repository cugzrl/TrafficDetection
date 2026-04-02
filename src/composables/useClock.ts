import { onMounted, onUnmounted, readonly, ref } from 'vue'

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export interface UseClockOptions {
  autoStart?: boolean
  interval?: number
  formatter?: (date: Date) => string
}

export const formatDashboardTime = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const dayOfMonth = date.getDate()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const dayName = WEEK_DAYS[date.getDay()]

  return `${year}-${month}-${dayOfMonth} ${hours}:${minutes} ${dayName}`
}

export const useClock = (options: UseClockOptions = {}) => {
  const {
    autoStart = true,
    interval = 1000,
    formatter = formatDashboardTime
  } = options

  const currentTime = ref('')
  let timer: number | null = null

  const updateTime = () => {
    currentTime.value = formatter(new Date())
  }

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  const start = () => {
    stop()
    updateTime()
    timer = window.setInterval(updateTime, interval)
  }

  if (autoStart) {
    onMounted(start)
  }

  onUnmounted(stop)

  return {
    currentTime: readonly(currentTime),
    start,
    stop,
    updateTime
  }
}
