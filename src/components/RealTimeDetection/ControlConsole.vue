<script setup lang="ts">
import { computed } from 'vue'
import { Setting, Upload, VideoPlay, VideoPause, Collection } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'

const props = defineProps<{
  modelStatus: string
  connectionStatus?: string
  currentMediaLabel?: string
}>()

const emit = defineEmits<{
  (e: 'upload', file: UploadFile): void
  (e: 'start'): void
  (e: 'pause'): void
  (e: 'config'): void
  (e: 'view-results'): void
  (e: 'library'): void
}>()

const connectionLabelMap: Record<string, string> = {
  idle: '空闲',
  connecting: '连接中',
  connected: '已连接',
  closed: '已关闭',
  error: '异常'
}

const currentConnectionLabel = computed(() => {
  return connectionLabelMap[props.connectionStatus || 'idle'] || props.connectionStatus || '空闲'
})

const handleUploadChange = (uploadFile: UploadFile) => {
  emit('upload', uploadFile)
}
</script>

<template>
  <el-card class="tech-panel control-panel" shadow="never">
    <template #header>
      <div class="panel-header">
        <span class="panel-title">
          <el-icon><Setting /></el-icon>
          系统控制台
        </span>
      </div>
    </template>

    <div class="status-board">
      <div class="status-item wide">
        <span class="status-label">交通要素识别模型</span>
        <span class="status-value">{{ modelStatus }}</span>
      </div>
      
      <div class="status-item wide">
        <span class="status-label">当前媒体</span>
        <span class="status-value ellipsis">{{ currentMediaLabel || '未选择视频' }}</span>
      </div>
    </div>

    <div class="control-grid">
      <el-upload
        action=""
        :auto-upload="false"
        :show-file-list="false"
        accept="video/*"
        class="upload-btn-wrapper"
        @change="handleUploadChange"
      >
        <template #trigger>
          <el-button type="primary" plain class="tech-btn grid-btn" :icon="Upload">上传视频</el-button>
        </template>
      </el-upload>

      <el-button type="primary" plain class="tech-btn grid-btn"  @click="emit('library')">
        视频列表
      </el-button>

      <el-button
        type="primary"
        class="tech-btn primary-btn grid-btn"
        :icon="VideoPlay"
        :disabled="modelStatus === '加载中'"
        @click="emit('start')"
      >
        开始识别
      </el-button>

      <el-button type="warning" plain class="tech-btn grid-btn" :icon="VideoPause" @click="emit('pause')">
        暂停识别
      </el-button>

      <el-button type="primary" plain class="tech-btn grid-btn" @click="emit('config')">
        系统配置
      </el-button>

      <el-button type="primary" plain class="tech-btn grid-btn" @click="emit('view-results')">
        查看结果
      </el-button>
    </div>
  </el-card>
</template>

<style scoped>
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

.control-panel {
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
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

.status-board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 14px 12px 0;
}

.status-item {
  padding: 10px 12px;
  border: 1px solid rgba(0, 210, 255, 0.22);
  background: rgba(0, 18, 34, 0.45);
  box-shadow: inset 0 0 18px rgba(0, 210, 255, 0.06);
  min-width: 0;
}

.status-item.wide {
  grid-column: 1 / -1;
}

.status-label {
  display: block;
  color: #79d8ff;
  font-size: 12px;
  margin-bottom: 5px;
}

.status-value {
  color: #00ffff;
  font-weight: bold;
  text-shadow: 0 0 6px rgba(0, 255, 255, 0.38);
}

.ellipsis {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

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

:deep(.tech-btn.is-disabled) {
  opacity: 0.6;
  transform: none !important;
  box-shadow: none !important;
  cursor: not-allowed;
}

.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;
  padding: 10px 10px;
  height: 100%;
  box-sizing: border-box;
  align-items: center;
  align-content: center;
  justify-items: stretch;
  width: 100%;
}

.grid-btn {
  width: 100%;
  height: 42px;
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
</style>


