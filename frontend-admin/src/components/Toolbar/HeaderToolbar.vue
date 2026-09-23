<template>
  <div class="header-toolbar">
    <div class="toolbar-left">
      <div class="logo">
        <el-icon :size="24"><Tickets /></el-icon>
        <span>标签编辑器</span>
      </div>
      <el-divider direction="vertical" />
      <div class="canvas-size">
        <el-input-number v-model="width" :min="MIN_SIZE" :max="MAX_SIZE" size="small" controls-position="right" />
        <span class="size-label">×</span>
        <el-input-number v-model="height" :min="MIN_SIZE" :max="MAX_SIZE" size="small" controls-position="right" />
        <span class="size-unit">mm</span>
        <span class="size-unit">（{{ MIN_SIZE }}~{{ MAX_SIZE }}mm）</span>
        <el-button type="primary" size="small" @click="applySize">应用</el-button>
      </div>
      <el-divider direction="vertical" />
      <div class="canvas-presets">
        <el-select
          ref="presetSelectRef"
          :model-value="store.activePresetId"
          size="small"
          style="width: 200px"
          placeholder="常用画布规格"
          popper-class="preset-select-popper"
          @change="handlePresetChange"
        >
          <el-option v-for="preset in store.presets" :key="preset.id" :label="preset.name" :value="preset.id">
            <div class="preset-option">
              <span class="preset-name">
                <el-icon v-if="preset.id === store.activePresetId" class="preset-active-icon"><Check /></el-icon>
                {{ preset.name }}
              </span>
              <span class="preset-dim">{{ preset.width }}×{{ preset.height }}mm</span>
              <span class="preset-actions">
                <el-icon title="重命名/编辑" @click.stop="openPresetDialog(preset.id)"><EditPen /></el-icon>
                <el-icon title="移除" @click.stop="handleRemovePreset(preset)"><Delete /></el-icon>
              </span>
            </div>
          </el-option>
          <template #empty>
            <div class="preset-empty">暂无保存的规格</div>
          </template>
        </el-select>
        <el-button size="small" @click="openPresetDialog()">
          <el-icon style="margin-right: 4px"><Star /></el-icon>保存规格
        </el-button>
      </div>
    </div>

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

    <el-dialog
      v-model="presetDialogVisible"
      :title="editingPresetId ? '编辑规格' : '保存常用规格'"
      width="360px"
      append-to-body
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="规格名称">
          <el-input
            v-model="presetForm.name"
            :maxlength="MAX_NAME_LENGTH"
            show-word-limit
            placeholder="例如：价签、水洗标"
          />
        </el-form-item>
        <el-form-item label="宽（mm）">
          <el-input-number v-model="presetForm.width" :min="MIN_SIZE" :max="MAX_SIZE" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="高（mm）">
          <el-input-number v-model="presetForm.height" :min="MIN_SIZE" :max="MAX_SIZE" controls-position="right" style="width: 100%" />
        </el-form-item>
        <p class="preset-form-tip">宽高均需为 {{ MIN_SIZE }} ~ {{ MAX_SIZE }} 毫米之间的整数。</p>
      </el-form>
      <template #footer>
        <el-button @click="presetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitPreset">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { useCanvasStore, MIN_CANVAS_SIZE_MM, MAX_CANVAS_SIZE_MM, MAX_PRESET_NAME_LENGTH } from '@/stores/canvas'
import { ElMessage, ElMessageBox } from 'element-plus'

const emit = defineEmits(['export'])
const store = useCanvasStore()

const MIN_SIZE = MIN_CANVAS_SIZE_MM
const MAX_SIZE = MAX_CANVAS_SIZE_MM
const MAX_NAME_LENGTH = MAX_PRESET_NAME_LENGTH

const width = ref(store.canvasWidth)
const height = ref(store.canvasHeight)
const scaleValue = ref(store.scale)
const scales = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

watch(() => store.scale, (val) => { scaleValue.value = val })
// 套用规格等导致画布实际尺寸变化后，顶部输入框跟着更新
watch(() => store.canvasWidth, (val) => { width.value = val })
watch(() => store.canvasHeight, (val) => { height.value = val })

const applySize = () => {
  try {
    // 与套用规格走同一个 store 入口：校验、缩放行为完全一致
    store.applyCanvasSize(width.value, height.value)
    ElMessage.success('画布尺寸已更新')
  } catch (err) {
    ElMessage.error(err.message)
    // 未应用成功时输入框恢复为画布当前尺寸，避免显示与实际不符
    width.value = store.canvasWidth
    height.value = store.canvasHeight
  }
}

const presetSelectRef = ref(null)

const handlePresetChange = (presetId) => {
  try {
    store.applyPreset(presetId)
    ElMessage.success('已套用画布规格')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ---------- 规格的新增 / 编辑 ----------
const presetDialogVisible = ref(false)
const editingPresetId = ref(null)
const presetForm = reactive({ name: '', width: null, height: null })

const openPresetDialog = (presetId = null) => {
  presetSelectRef.value?.blur?.()
  editingPresetId.value = presetId
  if (presetId) {
    const preset = store.presets.find(p => p.id === presetId)
    if (!preset) return
    presetForm.name = preset.name
    presetForm.width = preset.width
    presetForm.height = preset.height
  } else {
    // 默认带入当前输入框中的值（若有效），否则带入画布当前尺寸
    const validWidth = Number.isInteger(width.value) && width.value >= MIN_SIZE && width.value <= MAX_SIZE
    const validHeight = Number.isInteger(height.value) && height.value >= MIN_SIZE && height.value <= MAX_SIZE
    presetForm.name = ''
    presetForm.width = validWidth ? width.value : store.canvasWidth
    presetForm.height = validHeight ? height.value : store.canvasHeight
  }
  presetDialogVisible.value = true
}

const submitPreset = () => {
  try {
    if (editingPresetId.value) {
      store.updatePreset(editingPresetId.value, { ...presetForm })
      ElMessage.success('规格已更新')
    } else {
      store.addPreset({ ...presetForm })
      ElMessage.success('规格已保存')
    }
    presetDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err.message)
  }
}

const handleRemovePreset = (preset) => {
  presetSelectRef.value?.blur?.()
  const inUse = preset.id === store.activePresetId
  ElMessageBox.confirm(
    inUse
      ? `该规格「${preset.name}」正在使用，移除后画布保持当前 ${store.canvasWidth}×${store.canvasHeight}mm 尺寸不变。确定移除吗？`
      : `确定移除规格「${preset.name}」吗？画布尺寸不受影响。`,
    '移除规格',
    { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }
  )
    .then(() => {
      store.removePreset(preset.id)
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
  .size-unit { color: #606266; font-size: 13px; white-space: nowrap; }
  :deep(.el-input-number) { width: 90px; }
}

.canvas-presets {
  display: flex; align-items: center; gap: 8px;
}

.preset-form-tip {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.toolbar-right { display: flex; align-items: center; gap: 12px; }
</style>

<style lang="scss">
// 下拉面板被 teleport 到 body，需用全局样式 + popper-class 限定
.preset-select-popper {
  .preset-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    font-size: 13px;

    .preset-name {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: #303133;

      .preset-active-icon { color: #409eff; }
    }

    .preset-dim {
      color: #909399;
      font-size: 12px;
    }

    .preset-actions {
      margin-left: auto;
      display: inline-flex;
      gap: 6px;
      visibility: hidden;

      .el-icon {
        color: #606266;
        cursor: pointer;

        &:hover { color: #409eff; }
      }
    }
  }

  .el-select-dropdown__item:hover .preset-actions,
  .el-select-dropdown__item.hover .preset-actions {
    visibility: visible;
  }

  .preset-empty {
    padding: 8px 0;
    text-align: center;
    color: #909399;
    font-size: 13px;
  }
}
</style>
