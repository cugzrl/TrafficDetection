<script setup lang="ts">
import { List } from '@element-plus/icons-vue'

defineProps<{
  currentActive: number
}>()
</script>

<template>
  <el-card class="tech-panel metric-panel" shadow="never">
    <template #header>
      <div class="panel-header">
        <span class="panel-title">
          <el-icon><List /></el-icon>
          实时活跃追踪
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

.metric-panel {
  flex: 1.15;
  min-height: 0;
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
    0 0 10px rgba(255, 255, 255, 0.5);
}
</style>
