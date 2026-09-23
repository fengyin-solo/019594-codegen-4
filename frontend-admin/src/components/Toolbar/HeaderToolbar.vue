<template>
  <div class="header-toolbar">
    <div class="toolbar-left">
      <div class="logo">
        <el-icon :size="24"><Tickets /></el-icon>
        <span>标签编辑器</span>
      </div>
      <el-divider direction="vertical" />
      <div class="canvas-size">
        <el-input-number v-model="width" :min="10" :max="200" size="small" controls-position="right" />
        <span class="size-label">×</span>
        <el-input-number v-model="height" :min="10" :max="200" size="small" controls-position="right" />
        <span class="size-unit">mm</span>
        <span class="size-unit">（最大为200*200）</span>
        <el-button type="primary" size="small" @click="applySize">应用</el-button>
        <el-divider direction="vertical" />
        <el-select
          v-model="activePresetId"
          size="small"
          placeholder="常用规格"
          clearable
          class="preset-select"
          popper-class="preset-select-popper"
          @change="applyPreset"
        >
          <el-option v-for="preset in store.canvasPresets" :key="preset.id" :label="preset.name" :value="preset.id">
            <div class="preset-option">
              <span class="preset-name">{{ preset.name }}（{{ preset.width }}×{{ preset.height }}mm）</span>
              <span class="preset-actions">
                <el-icon title="重命名" @click.stop="renamePreset(preset)"><Edit /></el-icon>
                <el-icon title="移除" @click.stop="removePreset(preset)"><Delete /></el-icon>
              </span>
            </div>
          </el-option>
          <template #empty>
            <div class="preset-empty">暂无保存的规格</div>
          </template>
        </el-select>
        <el-button size="small" @click="openSaveDialog">存为规格</el-button>
      </div>
    </div>

    <el-dialog v-model="saveDialogVisible" title="保存画布规格" width="360px">
      <el-form label-width="60px">
        <el-form-item label="名称">
          <el-input v-model="presetForm.name" placeholder="例如：快递面单" maxlength="20" clearable />
        </el-form-item>
        <el-form-item label="宽">
          <el-input-number v-model="presetForm.width" :min="10" :max="200" controls-position="right" class="preset-size-input" />
          <span class="size-unit dialog-unit">mm</span>
        </el-form-item>
        <el-form-item label="高">
          <el-input-number v-model="presetForm.height" :min="10" :max="200" controls-position="right" class="preset-size-input" />
          <span class="size-unit dialog-unit">mm</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePreset">保存</el-button>
      </template>
    </el-dialog>
    
    <div class="toolbar-right">
      <el-select v-model="scaleValue" size="small" style="width: 90px" @change="changeScale">
        <el-option v-for="s in scales" :key="s" :label="`${s * 100}%`" :value="s" />
      </el-select>
      <el-divider direction="vertical" />
      <el-dropdown @command="handleExport">
        <el-button type="success" size="small">
          导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="bmp">导出 BMP (1-bit)</el-dropdown-item>
            <el-dropdown-item command="png">导出 PNG</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button type="danger" size="small" @click="clearCanvas">清空</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessage, ElMessageBox } from 'element-plus'

const emit = defineEmits(['export'])
const store = useCanvasStore()

const width = ref(store.canvasWidth)
const height = ref(store.canvasHeight)
const scaleValue = ref(store.scale)
const scales = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

const saveDialogVisible = ref(false)
const presetForm = ref({ name: '', width: null, height: null })

const activePresetId = computed({
  get: () => store.activePresetId,
  set: (val) => store.setActivePreset(val || null)
})

watch(() => store.scale, (val) => { scaleValue.value = val })

onMounted(() => matchActivePreset())

// 应用后让顶部输入框跟随实际生效的画布尺寸
const syncSizeInputs = () => {
  width.value = store.canvasWidth
  height.value = store.canvasHeight
}

// 当前尺寸与某套规格一致时高亮该规格，否则取消选中
const matchActivePreset = () => {
  const matched = store.canvasPresets.find(
    p => p.width === store.canvasWidth && p.height === store.canvasHeight
  )
  store.setActivePreset(matched ? matched.id : null)
}

const applySize = () => {
  const result = store.resizeCanvas(width.value, height.value)
  if (!result.valid) {
    ElMessage.error(result.message)
    return
  }
  syncSizeInputs()
  matchActivePreset()
  ElMessage.success('画布尺寸已更新')
}

const applyPreset = (id) => {
  if (!id) return
  const preset = store.canvasPresets.find(p => p.id === id)
  if (!preset) return
  const result = store.resizeCanvas(preset.width, preset.height)
  if (!result.valid) {
    ElMessage.error(result.message)
    return
  }
  store.setActivePreset(id)
  syncSizeInputs()
  ElMessage.success(`已套用规格「${preset.name}」`)
}

const openSaveDialog = () => {
  presetForm.value = { name: '', width: width.value, height: height.value }
  saveDialogVisible.value = true
}

const savePreset = () => {
  const result = store.saveCanvasPreset(presetForm.value.name, presetForm.value.width, presetForm.value.height)
  if (!result.valid) {
    ElMessage.error(result.message)
    return
  }
  saveDialogVisible.value = false
  ElMessage.success(`规格「${result.preset.name}」已保存`)
}

const renamePreset = (preset) => {
  ElMessageBox.prompt('请输入新的规格名称', '重命名规格', {
    inputValue: preset.name,
    inputValidator: (val) => {
      if (!val || !val.trim()) return '请输入规格名称'
      if (store.isPresetNameTaken(val.trim(), preset.id)) return '已存在同名规格，请换个名称'
      return true
    },
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(({ value }) => {
    const result = store.renameCanvasPreset(preset.id, value)
    if (!result.valid) {
      ElMessage.error(result.message)
      return
    }
    ElMessage.success('规格已重命名')
  }).catch(() => {})
}

const removePreset = (preset) => {
  ElMessageBox.confirm(`确定要移除规格「${preset.name}」吗？画布将保持当前尺寸不变。`, '提示', { type: 'warning' })
    .then(() => {
      store.removeCanvasPreset(preset.id)
      ElMessage.success('规格已移除')
    })
    .catch(() => {})
}

const changeScale = (val) => store.setScale(val)
const handleExport = (type) => emit('export', type)

const clearCanvas = () => {
  ElMessageBox.confirm('确定要清空画布吗？', '提示', { type: 'warning' })
    .then(() => { store.clearCanvas(); ElMessage.success('画布已清空') })
    .catch(() => {})
}
</script>

<style lang="scss" scoped>
.header-toolbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.toolbar-left { display: flex; align-items: center; gap: 16px; }

.logo {
  display: flex; align-items: center; gap: 8px;
  font-size: 18px; font-weight: 600; color: #409eff;
}

.canvas-size {
  display: flex; align-items: center; gap: 8px;
  .size-label { color: #909399; }
  .size-unit { color: #606266; font-size: 13px; }
  :deep(.el-input-number) { width: 90px; }
  .preset-select { width: 150px; }
}

.dialog-unit { margin-left: 8px; color: #606266; font-size: 13px; }
.preset-size-input { width: 140px; }

.toolbar-right { display: flex; align-items: center; gap: 12px; }
</style>

<!-- 下拉面板挂载在 body 下，相关样式不能放在 scoped 中 -->
<style lang="scss">
.preset-select-popper {
  .preset-option {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    .preset-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preset-actions {
      display: inline-flex; gap: 8px; flex-shrink: 0;
      .el-icon { color: #909399; cursor: pointer; }
      .el-icon:hover { color: #409eff; }
    }
  }
  .preset-empty { padding: 8px 16px; color: #909399; font-size: 13px; text-align: center; }
}
</style>
