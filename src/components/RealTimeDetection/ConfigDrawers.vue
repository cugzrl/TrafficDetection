<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Coin, Setting } from '@element-plus/icons-vue'
import type { DetectionMediaItem } from '../../types/detection'

interface DbFormState {
  type: string
  host: string
  port: string
  database: string
  username: string
  password: string
}

const createDefaultDbForm = (): DbFormState => ({
  type: 'MySQL',
  host: '',
  port: '',
  database: '',
  username: '',
  password: ''
})

const props = withDefaults(defineProps<{
  drawerVisible?: boolean
  dialogVisible?: boolean
  modelStatus: string
  mediaList?: DetectionMediaItem[]
  dbForm: DbFormState
  selectedMediaId: string
}>(), {
  drawerVisible: false,
  dialogVisible: false,
  mediaList: () => []
})

const emit = defineEmits<{
  (e: 'update:drawerVisible', value: boolean): void
  (e: 'update:dialogVisible', value: boolean): void
  (e: 'update:selectedMediaId', value: string): void
  (e: 'update:dbForm', value: DbFormState): void
  (e: 'connect-db', value: DbFormState): void
  (e: 'start-inference', value: string): void
}>()

const drawerVisibleProxy = computed({
  get: () => props.drawerVisible,
  set: (value: boolean) => emit('update:drawerVisible', value)
})

const dialogVisibleProxy = computed({
  get: () => props.dialogVisible,
  set: (value: boolean) => emit('update:dialogVisible', value)
})

const selectedMediaIdProxy = computed({
  get: () => props.selectedMediaId,
  set: (value: string) => emit('update:selectedMediaId', value)
})

const localDbForm = reactive<DbFormState>(createDefaultDbForm())
let syncingFromProps = false

watch(
  () => props.dbForm,
  (nextForm) => {
    syncingFromProps = true
    Object.assign(localDbForm, createDefaultDbForm(), nextForm)
    queueMicrotask(() => {
      syncingFromProps = false
    })
  },
  { deep: true, immediate: true }
)

watch(
  localDbForm,
  (nextForm) => {
    if (syncingFromProps) {
      return
    }

    emit('update:dbForm', { ...nextForm })
  },
  { deep: true }
)

const statusClass = computed(() => {
  if (props.modelStatus === '已就绪' || props.modelStatus === '已完成') {
    return 'ready'
  }

  if (props.modelStatus === '加载中') {
    return 'loading'
  }

  return 'offline'
})

const getMediaOptionLabel = (item: DetectionMediaItem) => {
  const prefix = item.kind === 'image' ? '[图片]' : '[视频]'
  return `${prefix} ${item.name}`
}

const handleConnectDb = () => {
  emit('connect-db', { ...localDbForm })
}

const handleStartInference = () => {
  emit('start-inference', selectedMediaIdProxy.value)
}
</script>

<template>
  <el-drawer
    v-model="drawerVisibleProxy"
    title="系统配置与数据库连接"
    direction="rtl"
    size="400px"
    class="tech-drawer"
    :with-header="true"
  >
    <div class="drawer-content">
      <div class="drawer-section">
        <h3 class="section-title">
          <el-icon><Setting /></el-icon>
          模型配置区
        </h3>
        <el-form label-position="top" class="config-form">
          <el-form-item label="交通要素识别模型">
            <el-input readonly value="RS-DETR" class="tech-input" />
          </el-form-item>
          <el-form-item label="模型加载状态" class="status-item">
            <div :class="['status-indicator', statusClass]">
              <span class="dot"></span>
              <span class="text">{{ modelStatus }}</span>
            </div>
          </el-form-item>
        </el-form>
      </div>

      <div class="drawer-section">
        <h3 class="section-title">
          <el-icon><Coin /></el-icon>
          关系型数据库连接
        </h3>
        <el-form label-position="top" class="config-form compact-form" :model="localDbForm">
          <el-form-item label="数据库类型">
            <el-select v-model="localDbForm.type" class="tech-input" style="width: 100%" popper-class="tech-select-popper">
              <el-option label="MySQL" value="MySQL" />
              <el-option label="SQL Server" value="SQL Server" />
              <el-option label="PostgreSQL" value="PostgreSQL" />
            </el-select>
          </el-form-item>

          <el-row :gutter="15">
            <el-col :span="16">
              <el-form-item label="主机地址">
                <el-input v-model="localDbForm.host" class="tech-input" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="端口">
                <el-input v-model="localDbForm.port" class="tech-input" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item label="数据库名">
            <el-input v-model="localDbForm.database" class="tech-input" />
          </el-form-item>

          <el-row :gutter="15">
            <el-col :span="12">
              <el-form-item label="用户名">
                <el-input v-model="localDbForm.username" class="tech-input" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="密码">
                <el-input v-model="localDbForm.password" type="password" show-password class="tech-input" />
              </el-form-item>
            </el-col>
          </el-row>

          <div class="submit-row">
            <el-button type="primary" class="tech-btn primary-btn full-width-btn" @click="handleConnectDb">
              连接数据库
            </el-button>
          </div>
        </el-form>
      </div>
    </div>
  </el-drawer>

  <el-dialog
    v-model="dialogVisibleProxy"
    title="选择要进行推理的视频"
    width="420px"
    class="tech-dialog"
  >
    <div class="dialog-content">
      <el-select
        v-model="selectedMediaIdProxy"
        placeholder="请选择视频"
        class="tech-input"
        style="width: 100%"
        popper-class="tech-select-popper"
      >
        <el-option
          v-for="item in mediaList"
          :key="item.id"
          :label="getMediaOptionLabel(item)"
          :value="item.id"
        />
      </el-select>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button class="tech-btn" @click="dialogVisibleProxy = false">取消</el-button>
        <el-button type="primary" class="tech-btn primary-btn" @click="handleStartInference">
          载入并开始推理
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<style scoped>
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

:global(.tech-select-popper) {
  background: rgba(0, 30, 60, 0.9) !important;
  border: 1px solid rgba(0, 210, 255, 0.5) !important;
  box-shadow: 0 0 15px rgba(0, 210, 255, 0.3) !important;
  backdrop-filter: blur(10px);
}

:global(.tech-select-popper .el-select-dropdown__item) {
  color: #e0e0e0;
}

:global(.tech-select-popper .el-select-dropdown__item.hover),
:global(.tech-select-popper .el-select-dropdown__item:hover) {
  background-color: rgba(0, 210, 255, 0.2) !important;
  color: #00ffff;
}

:global(.tech-select-popper .el-select-dropdown__item.selected) {
  color: #00ffff;
  font-weight: bold;
  background-color: rgba(0, 210, 255, 0.1) !important;
}

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

:global(.tech-drawer) {
  background: linear-gradient(180deg, rgba(6, 24, 48, 0.96) 0%, rgba(2, 12, 28, 0.96) 100%) !important;
  backdrop-filter: blur(10px);
  border-left: 1px solid rgba(0, 210, 255, 0.3);
  box-shadow: -10px 0 30px rgba(0, 210, 255, 0.15);
}

:global(.tech-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 20px;
  border-bottom: 1px solid rgba(0, 210, 255, 0.3);
  color: #00ffff;
  font-size: 20px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
}

:global(.tech-drawer .el-drawer__body) {
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

:global(.tech-dialog) {
  background: rgba(0, 15, 30, 0.95) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 210, 255, 0.3);
  box-shadow: 0 0 30px rgba(0, 210, 255, 0.15);
  border-radius: 8px;
}

:global(.tech-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px;
  border-bottom: 1px solid rgba(0, 210, 255, 0.3);
}

:global(.tech-dialog .el-dialog__title) {
  color: #00ffff;
  font-size: 18px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
}

:global(.tech-dialog .el-dialog__body) {
  padding: 30px 20px;
}

:global(.tech-dialog .el-dialog__footer) {
  padding: 15px 20px;
  border-top: 1px solid rgba(0, 210, 255, 0.1);
}

.dialog-content {
  display: flex;
  justify-content: center;
  align-items: center;
}

.submit-row {
  margin-top: 20px;
}

.full-width-btn {
  width: 100%;
}
</style>

