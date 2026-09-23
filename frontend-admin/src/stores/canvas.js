import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MM_TO_DOT = 8
const MIN_CANVAS_SIZE = 10
const MAX_CANVAS_SIZE = 200
const PRESETS_STORAGE_KEY = 'label-editor-canvas-presets'

export const useCanvasStore = defineStore('canvas', () => {
  const canvasWidth = ref(80)
  const canvasHeight = ref(60)
  const scale = ref(1)
  const elements = ref([])
  const selectedElementId = ref(null)
  const selectedElementIds = ref([])
  const canvasPresets = ref(loadCanvasPresets())
  const activePresetId = ref(null)
  let elementIdCounter = 0

  const canvasPixelWidth = computed(() => canvasWidth.value * MM_TO_DOT)
  const canvasPixelHeight = computed(() => canvasHeight.value * MM_TO_DOT)

  const selectedElement = computed(() => {
    if (!selectedElementId.value) return null
    return elements.value.find(el => el.id === selectedElementId.value)
  })

  const selectedElements = computed(() => {
    return elements.value.filter(el => selectedElementIds.value.includes(el.id))
  })

  function setCanvasSize(width, height) {
    canvasWidth.value = width
    canvasHeight.value = height
  }

  // 画布尺寸校验：手工输入与规格套用、保存共用同一套规则
  function validateCanvasSize(width, height) {
    if (width === null || width === undefined || width === '' ||
        height === null || height === undefined || height === '') {
      return { valid: false, message: '宽和高都不能为空' }
    }
    const w = Number(width)
    const h = Number(height)
    if (Number.isNaN(w) || Number.isNaN(h)) {
      return { valid: false, message: '宽和高必须是数字' }
    }
    if (w < MIN_CANVAS_SIZE || w > MAX_CANVAS_SIZE || h < MIN_CANVAS_SIZE || h > MAX_CANVAS_SIZE) {
      return { valid: false, message: `宽和高需在 ${MIN_CANVAS_SIZE}~${MAX_CANVAS_SIZE}mm 之间` }
    }
    return { valid: true }
  }

  // 设置画布尺寸并等比缩放已有内容（手工输入与规格套用都走这里）
  function resizeCanvas(width, height) {
    const check = validateCanvasSize(width, height)
    if (!check.valid) return check

    const oldWidth = canvasPixelWidth.value
    const oldHeight = canvasPixelHeight.value
    setCanvasSize(Number(width), Number(height))

    if (elements.value.length > 0) {
      const scaleX = canvasPixelWidth.value / oldWidth
      const scaleY = canvasPixelHeight.value / oldHeight
      elements.value.forEach(el => {
        updateElement(el.id, {
          x: Math.round(el.x * scaleX),
          y: Math.round(el.y * scaleY),
          width: Math.round(el.width * scaleX),
          height: Math.round(el.height * scaleY)
        })
      })
    }
    return { valid: true }
  }

  function loadCanvasPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (!raw) return []
      const list = JSON.parse(raw)
      if (!Array.isArray(list)) return []
      // 过滤掉损坏或已不符合尺寸规则的数据
      return list
        .filter(p => p && typeof p.name === 'string' && validateCanvasSize(p.width, p.height).valid)
        .map(p => ({
          id: p.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: p.name,
          width: Number(p.width),
          height: Number(p.height)
        }))
    } catch {
      return []
    }
  }

  function persistCanvasPresets() {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(canvasPresets.value))
  }

  function isPresetNameTaken(name, excludeId = null) {
    return canvasPresets.value.some(p => p.id !== excludeId && p.name === name)
  }

  function saveCanvasPreset(name, width, height) {
    const trimmedName = (name ?? '').trim()
    if (!trimmedName) {
      return { valid: false, message: '请输入规格名称' }
    }
    const check = validateCanvasSize(width, height)
    if (!check.valid) return check
    if (isPresetNameTaken(trimmedName)) {
      return { valid: false, message: '已存在同名规格，请换个名称' }
    }
    const preset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      width: Number(width),
      height: Number(height)
    }
    canvasPresets.value.push(preset)
    persistCanvasPresets()
    return { valid: true, preset }
  }

  function renameCanvasPreset(id, name) {
    const trimmedName = (name ?? '').trim()
    if (!trimmedName) {
      return { valid: false, message: '请输入规格名称' }
    }
    const preset = canvasPresets.value.find(p => p.id === id)
    if (!preset) {
      return { valid: false, message: '规格不存在' }
    }
    if (isPresetNameTaken(trimmedName, id)) {
      return { valid: false, message: '已存在同名规格，请换个名称' }
    }
    preset.name = trimmedName
    persistCanvasPresets()
    return { valid: true }
  }

  // 只移除规格本身，不改变当前画布尺寸
  function removeCanvasPreset(id) {
    const index = canvasPresets.value.findIndex(p => p.id === id)
    if (index === -1) return
    canvasPresets.value.splice(index, 1)
    if (activePresetId.value === id) {
      activePresetId.value = null
    }
    persistCanvasPresets()
  }

  function setActivePreset(id) {
    activePresetId.value = id
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
    canvasPresets,
    activePresetId,
    canvasPixelWidth,
    canvasPixelHeight,
    selectedElement,
    selectedElements,
    setCanvasSize,
    validateCanvasSize,
    resizeCanvas,
    saveCanvasPreset,
    renameCanvasPreset,
    removeCanvasPreset,
    isPresetNameTaken,
    setActivePreset,
    setScale,
    addElement,
    updateElement,
    deleteElement,
    selectElement,
    clearSelection,
    alignElements,
    duplicateElement,
    clearCanvas,
    MM_TO_DOT,
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE
  }
})
