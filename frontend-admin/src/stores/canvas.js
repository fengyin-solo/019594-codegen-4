import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MM_TO_DOT = 8
export const MIN_CANVAS_SIZE_MM = 10
export const MAX_CANVAS_SIZE_MM = 200
export const MAX_PRESET_NAME_LENGTH = 20

const PRESET_STORAGE_KEY = 'label-editor:canvas-presets'

/**
 * 校验画布宽高（毫米）。手工输入与规格套用共用这一套规则。
 * 通过返回 { valid: true }，否则返回 { valid: false, field, message }。
 */
export function validateCanvasSize(width, height) {
  const check = (value, label) => {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
      return `${label}不能为空`
    }
    const num = Number(value)
    if (!Number.isInteger(num)) {
      return `${label}必须为整数`
    }
    if (num < MIN_CANVAS_SIZE_MM || num > MAX_CANVAS_SIZE_MM) {
      return `${label}必须在 ${MIN_CANVAS_SIZE_MM} ~ ${MAX_CANVAS_SIZE_MM} 毫米之间`
    }
    return null
  }

  const widthError = check(width, '宽度')
  if (widthError) return { valid: false, field: 'width', message: widthError }

  const heightError = check(height, '高度')
  if (heightError) return { valid: false, field: 'height', message: heightError }

  return { valid: true }
}

function findPresetId(presets, width, height) {
  const found = presets.find(p => p.width === width && p.height === height)
  return found ? found.id : null
}

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const result = []
    const usedIds = new Set()
    let seq = 0
    for (const item of parsed) {
      // 只保留结构与尺寸都合法的数据，避免历史脏数据绕过校验
      if (!item || typeof item.name !== 'string' || !item.name.trim()) continue
      const check = validateCanvasSize(item.width, item.height)
      if (!check.valid) continue
      let id = typeof item.id === 'string' && item.id && !usedIds.has(item.id)
        ? item.id
        : `preset_${Date.now()}_${++seq}`
      usedIds.add(id)
      result.push({ id, name: item.name.trim(), width: item.width, height: item.height })
    }
    return result
  } catch {
    return []
  }
}

function persistPresets(presets) {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // 存储不可用（隐私模式等）时本次会话仍可使用，只是刷新后丢失
  }
}

export const useCanvasStore = defineStore('canvas', () => {
  const canvasWidth = ref(80)
  const canvasHeight = ref(60)
  const scale = ref(1)
  const elements = ref([])
  const selectedElementId = ref(null)
  const selectedElementIds = ref([])
  let elementIdCounter = 0

  const presets = ref(loadPresets())
  // 初始画布尺寸若恰好与某套规格相同，则默认高亮该规格
  const activePresetId = ref(findPresetId(presets.value, canvasWidth.value, canvasHeight.value))
  let presetIdCounter = 0

  const canvasPixelWidth = computed(() => canvasWidth.value * MM_TO_DOT)
  const canvasPixelHeight = computed(() => canvasHeight.value * MM_TO_DOT)

  const selectedElement = computed(() => {
    if (!selectedElementId.value) return null
    return elements.value.find(el => el.id === selectedElementId.value)
  })

  const selectedElements = computed(() => {
    return elements.value.filter(el => selectedElementIds.value.includes(el.id))
  })

  /**
   * 应用画布尺寸的唯一入口：手工输入点「应用」和套用规格都走这里，
   * 因此尺寸变化带动内容缩放的表现完全一致。
   * 校验不通过时抛出 Error（message 为原因），画布保持不变。
   */
  function applyCanvasSize(width, height) {
    const check = validateCanvasSize(width, height)
    if (!check.valid) {
      throw new Error(check.message)
    }
    const newWidth = Number(width)
    const newHeight = Number(height)

    const oldPixelWidth = canvasPixelWidth.value
    const oldPixelHeight = canvasPixelHeight.value

    canvasWidth.value = newWidth
    canvasHeight.value = newHeight

    const newPixelWidth = canvasPixelWidth.value
    const newPixelHeight = canvasPixelHeight.value

    // 与原手工输入「应用」的缩放算法保持一致：按宽高各自的比例整体缩放
    if (elements.value.length > 0) {
      const scaleX = newPixelWidth / oldPixelWidth
      const scaleY = newPixelHeight / oldPixelHeight
      elements.value.forEach(el => {
        updateElement(el.id, {
          x: Math.round(el.x * scaleX),
          y: Math.round(el.y * scaleY),
          width: Math.round(el.width * scaleX),
          height: Math.round(el.height * scaleY)
        })
      })
    }

    activePresetId.value = findPresetId(presets.value, newWidth, newHeight)
  }

  function applyPreset(presetId) {
    const preset = presets.value.find(p => p.id === presetId)
    if (!preset) throw new Error('所选规格不存在或已被移除')
    applyCanvasSize(preset.width, preset.height)
  }

  /** 新增一套常用规格。名称与尺寸不合法时抛出 Error 说明原因。 */
  function addPreset({ name, width, height }) {
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) throw new Error('请填写规格名称')
    if (trimmedName.length > MAX_PRESET_NAME_LENGTH) {
      throw new Error(`规格名称不能超过 ${MAX_PRESET_NAME_LENGTH} 个字符`)
    }
    const check = validateCanvasSize(width, height)
    if (!check.valid) throw new Error(check.message)
    if (presets.value.some(p => p.name === trimmedName)) {
      throw new Error('已存在同名规格，请换一个名称')
    }

    const id = `preset_${Date.now()}_${++presetIdCounter}`
    presets.value.push({ id, name: trimmedName, width: Number(width), height: Number(height) })
    persistPresets(presets.value)

    // 若保存的恰好是当前画布尺寸，直接高亮新规格（画布不变）
    if (canvasWidth.value === Number(width) && canvasHeight.value === Number(height)) {
      activePresetId.value = id
    }
    return id
  }

  /** 修改已有规格（改名或改尺寸）。只更新规格本身，不改变当前画布。 */
  function updatePreset(id, { name, width, height }) {
    const index = presets.value.findIndex(p => p.id === id)
    if (index === -1) throw new Error('要修改的规格不存在')

    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) throw new Error('请填写规格名称')
    if (trimmedName.length > MAX_PRESET_NAME_LENGTH) {
      throw new Error(`规格名称不能超过 ${MAX_PRESET_NAME_LENGTH} 个字符`)
    }
    const check = validateCanvasSize(width, height)
    if (!check.valid) throw new Error(check.message)
    if (presets.value.some(p => p.id !== id && p.name === trimmedName)) {
      throw new Error('已存在同名规格，请换一个名称')
    }

    presets.value[index] = {
      ...presets.value[index],
      name: trimmedName,
      width: Number(width),
      height: Number(height)
    }
    persistPresets(presets.value)

    // 若当前画布尺寸因此与某套规格重新匹配，保持高亮一致；画布尺寸不受影响
    activePresetId.value = findPresetId(presets.value, canvasWidth.value, canvasHeight.value)
  }

  /** 移除规格。即使移除的是正在使用的那套，也只删规格、画布保持当前尺寸不变。 */
  function removePreset(id) {
    const index = presets.value.findIndex(p => p.id === id)
    if (index === -1) return
    presets.value.splice(index, 1)
    persistPresets(presets.value)

    if (activePresetId.value === id) {
      activePresetId.value = findPresetId(presets.value, canvasWidth.value, canvasHeight.value)
    }
  }

  function setScale(newScale) {
    scale.value = Math.max(0.25, Math.min(4, newScale))
  }

  function addElement(element) {
    const id = `element_${++elementIdCounter}`
    const newElement = {
      id,
      ...element,
      x: element.x || 10,
      y: element.y || 10,
      width: element.width || 100,
      height: element.height || 30,
      rotation: element.rotation || 0,
      locked: false,
      visible: true
    }
    elements.value.push(newElement)
    selectElement(id)
    return id
  }

  function updateElement(id, updates) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value[index] = { ...elements.value[index], ...updates }
    }
  }

  function deleteElement(id) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value.splice(index, 1)
      selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)

      // 删除后选中第一个元件
      if (elements.value.length > 0) {
        const firstElement = elements.value[elements.value.length - 1]
        selectedElementId.value = firstElement.id
        selectedElementIds.value = [firstElement.id]
      } else {
        selectedElementId.value = null
        selectedElementIds.value = []
      }
    }
  }

  function selectElement(id, multiSelect = false) {
    if (multiSelect) {
      if (selectedElementIds.value.includes(id)) {
        selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)
        if (selectedElementIds.value.length > 0) {
          selectedElementId.value = selectedElementIds.value[selectedElementIds.value.length - 1]
        } else {
          selectedElementId.value = null
        }
      } else {
        selectedElementIds.value.push(id)
        selectedElementId.value = id
      }
    } else {
      selectedElementId.value = id
      selectedElementIds.value = id ? [id] : []
    }
  }

  function clearSelection() {
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  // 多选元件之间对齐
  function alignElements(alignment) {
    const selected = selectedElements.value
    if (selected.length < 2) return

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...selected.map(el => el.x))
        selected.forEach(el => updateElement(el.id, { x: minX }))
        break
      }
      case 'right': {
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        selected.forEach(el => updateElement(el.id, { x: maxRight - el.width }))
        break
      }
      case 'center-h': {
        const minX = Math.min(...selected.map(el => el.x))
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        const centerX = (minX + maxRight) / 2
        selected.forEach(el => updateElement(el.id, { x: Math.round(centerX - el.width / 2) }))
        break
      }
      case 'top': {
        const minY = Math.min(...selected.map(el => el.y))
        selected.forEach(el => updateElement(el.id, { y: minY }))
        break
      }
      case 'bottom': {
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        selected.forEach(el => updateElement(el.id, { y: maxBottom - el.height }))
        break
      }
      case 'center-v': {
        const minY = Math.min(...selected.map(el => el.y))
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        const centerY = (minY + maxBottom) / 2
        selected.forEach(el => updateElement(el.id, { y: Math.round(centerY - el.height / 2) }))
        break
      }
    }
  }

  function duplicateElement(id) {
    const element = elements.value.find(el => el.id === id)
    if (!element) return

    const newElement = {
      ...element,
      x: Math.min(element.x + 20, canvasPixelWidth.value - element.width),
      y: Math.min(element.y + 20, canvasPixelHeight.value - element.height)
    }
    delete newElement.id
    return addElement(newElement)
  }

  function clearCanvas() {
    elements.value = []
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  return {
    canvasWidth,
    canvasHeight,
    scale,
    elements,
    selectedElementId,
    selectedElementIds,
    canvasPixelWidth,
    canvasPixelHeight,
    selectedElement,
    selectedElements,
    presets,
    activePresetId,
    applyCanvasSize,
    applyPreset,
    addPreset,
    updatePreset,
    removePreset,
    setScale,
    addElement,
    updateElement,
    deleteElement,
    selectElement,
    clearSelection,
    alignElements,
    duplicateElement,
    clearCanvas,
    MM_TO_DOT
  }
})
