<script setup lang="ts">
defineProps<{
  currentTime: string
}>()
</script>

<template>
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
</template>

<style scoped>
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
</style>
