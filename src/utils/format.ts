// src/utils/format.ts
export const getSecurityTagType = (level: number) => {
    switch (level) {
      case 1: return 'success'
      case 2: return 'info'
      case 3: return 'warning'
      case 4: return 'warning'
      case 5: return 'danger'
      default: return 'info'
    }
  }
  
  export const formatCurrentTime = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const date = now.getDate()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const day = days[now.getDay()]
    return `${year}-${month}-${date} ${hours}:${minutes} ${day}`
  }