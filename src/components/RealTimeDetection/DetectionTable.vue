<script setup lang="ts">
import { List } from '@element-plus/icons-vue'
import type { TrafficTableRow } from '../../composables/useTrafficMock'

withDefaults(defineProps<{
  tableData?: TrafficTableRow[]
  isTablePaused?: boolean
}>(), {
  tableData: () => [],
  isTablePaused: false
})

const emit = defineEmits<{
  (e: 'expand-change', row: TrafficTableRow, expandedRows: TrafficTableRow[]): void
}>()

const colorMap: Record<string, string> = {
  汽车: '#2EABFF',
  三轮车: '#EF6B6B',
  面包车: '#F273AA',
  公交车: '#927FF0',
  行人: '#98F07F',
  骑自行车的人: '#F0DD7F',
  骑电动车的人: '#FFA270'
}

const getSecurityTagType = (level: number) => {
  switch (level) {
    case 1:
      return 'success'
    case 2:
      return 'info'
    case 3:
      return 'warning'
    case 4:
      return 'warning'
    case 5:
      return 'danger'
    default:
      return 'info'
  }
}

const handleExpandChange = (row: TrafficTableRow, expandedRows: TrafficTableRow[]) => {
  emit('expand-change', row, expandedRows)
}
</script>

<template>
  <el-card class="tech-panel table-panel" shadow="never">
    <template #header>
      <div class="panel-header">
        <span class="panel-title">
          <el-icon><List /></el-icon>
          实时识别结果
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
          <template #default="scope">
            <div class="expand-wrapper">
              <el-descriptions class="tech-descriptions" :column="4" border direction="vertical">
                <el-descriptions-item label="纵向速度">{{ scope.row.lonSpeed }}</el-descriptions-item>
                <el-descriptions-item label="横向速度">{{ scope.row.latSpeed }}</el-descriptions-item>
                <el-descriptions-item label="速度方向">{{ scope.row.speedDir }}</el-descriptions-item>
                <el-descriptions-item label="运动方向">{{ scope.row.motionDir }}</el-descriptions-item>

                <el-descriptions-item label="经度">{{ scope.row.longitude }}</el-descriptions-item>
                <el-descriptions-item label="纬度">{{ scope.row.latitude }}</el-descriptions-item>
                <el-descriptions-item label="海拔">{{ scope.row.altitude }}</el-descriptions-item>
                <el-descriptions-item label="车道信息">{{ scope.row.laneInfo || '--' }}</el-descriptions-item>

                <el-descriptions-item label="纵向加速度">{{ scope.row.lonAcc }}</el-descriptions-item>
                <el-descriptions-item label="横向加速度">{{ scope.row.latAcc }}</el-descriptions-item>
                <el-descriptions-item label="加速度方向" :span="2">{{ scope.row.accDir }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="id" label="序号" align="center" />
        <el-table-column prop="time" label="时间" align="center" />

        <el-table-column prop="type" label="目标类型" align="center">
          <template #default="scope">
            <el-tag effect="dark" class="type-tag" :style="{ backgroundColor: colorMap[scope.row.type] }">
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

.size-text {
  color: #a3d9ff;
  font-family: 'Courier New', Courier, monospace;
  font-size: 17px;
  letter-spacing: 0.5px;
}

.type-tag {
  font-weight: bold;
  border: none !important;
  width: 90px;
  text-align: center;
}

.security-tag {
  font-weight: bold;
  border: none !important;
  width: 60px;
  text-align: center;
}

.level-1 {
  background-color: rgba(155, 255, 105, 0.825) !important;
  box-shadow: 0 0 10px rgba(103, 194, 58, 0.5);
}

.level-2 {
  background-color: rgba(95, 211, 237, 0.908) !important;
  box-shadow: 0 0 10px rgba(0, 210, 255, 0.5);
}

.level-3 {
  background-color: rgba(240, 221, 81, 0.942) !important;
  box-shadow: 0 0 10px rgba(230, 162, 60, 0.5);
}

.level-4 {
  background-color: rgba(255, 167, 60, 0.904) !important;
  box-shadow: 0 0 10px rgba(255, 140, 0, 0.6);
}

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

:deep(.el-table__expand-icon) {
  color: #00ffff;
}

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
