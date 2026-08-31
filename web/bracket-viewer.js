const FEATURE_ORDER = Object.freeze([
  'inside-pocket-corner',
  'deep-pocket',
  'thin-wall',
  'deep-drilled-hole',
  'mounting-hole-tolerance',
])

export const FEATURE_MESH_MAP = Object.freeze({
  'inside-pocket-corner': Object.freeze([
    'mesh-pocket-corner-nw',
    'mesh-pocket-corner-ne',
    'mesh-pocket-corner-sw',
    'mesh-pocket-corner-se',
  ]),
  'deep-pocket': Object.freeze(['mesh-deep-pocket-floor']),
  'thin-wall': Object.freeze(['mesh-thin-wall']),
  'deep-drilled-hole': Object.freeze(['mesh-deep-hole-ring']),
  'mounting-hole-tolerance': Object.freeze(['mesh-mounting-hole-ring']),
})

function cuboid(meshId, featureId, min, max, color) {
  const vertices = [
    [min.x, min.y, min.z], [max.x, min.y, min.z],
    [max.x, max.y, min.z], [min.x, max.y, min.z],
    [min.x, min.y, max.z], [max.x, min.y, max.z],
    [max.x, max.y, max.z], [min.x, max.y, max.z],
  ]
  return {
    meshId,
    featureId,
    color,
    vertices,
    faces: [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
      [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
    ],
  }
}

function ring(meshId, featureId, center, outerRadius, innerRadius, height, color) {
  const segments = 20
  const vertices = []
  const faces = []
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    vertices.push(
      [center.x + outerRadius * cosine, center.y + outerRadius * sine, center.z],
      [center.x + innerRadius * cosine, center.y + innerRadius * sine, center.z],
      [center.x + outerRadius * cosine, center.y + outerRadius * sine, center.z + height],
      [center.x + innerRadius * cosine, center.y + innerRadius * sine, center.z + height],
    )
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments
    const currentOffset = index * 4
    const nextOffset = next * 4
    faces.push(
      [currentOffset + 2, nextOffset + 2, nextOffset + 3, currentOffset + 3],
      [currentOffset, currentOffset + 2, nextOffset + 2, nextOffset],
      [currentOffset + 1, nextOffset + 1, nextOffset + 3, currentOffset + 3],
    )
  }
  return { meshId, featureId, color, vertices, faces }
}

function pocketCorner(meshId, x, y) {
  return cuboid(
    meshId,
    'inside-pocket-corner',
    { x: x - 0.28, y: y - 0.28, z: 1.02 },
    { x: x + 0.28, y: y + 0.28, z: 1.42 },
    '#648579',
  )
}

export function createParametricBracketScene() {
  return Object.freeze([
    cuboid('mesh-base-plate', null, { x: -6, y: -4, z: 0 }, { x: 6, y: 4, z: 1 }, '#36574d'),
    cuboid('mesh-vertical-flange', null, { x: -6, y: -4, z: 1 }, { x: -5, y: 4, z: 7 }, '#41675b'),
    cuboid('mesh-deep-pocket-floor', 'deep-pocket', { x: -2.7, y: -1.65, z: 1.01 }, { x: 2.7, y: 1.65, z: 1.22 }, '#243d36'),
    pocketCorner('mesh-pocket-corner-nw', -2.45, -1.4),
    pocketCorner('mesh-pocket-corner-ne', 2.45, -1.4),
    pocketCorner('mesh-pocket-corner-sw', -2.45, 1.4),
    pocketCorner('mesh-pocket-corner-se', 2.45, 1.4),
    cuboid('mesh-thin-wall', 'thin-wall', { x: 3.2, y: 2.55, z: 1.02 }, { x: 4.2, y: 3.25, z: 2.45 }, '#52786b'),
    ring('mesh-deep-hole-ring', 'deep-drilled-hole', { x: -3.5, y: 2.7, z: 1.18 }, 0.72, 0.38, 0.2, '#4d7568'),
    ring('mesh-mounting-hole-ring', 'mounting-hole-tolerance', { x: 1.8, y: 3, z: 1.18 }, 0.76, 0.43, 0.2, '#4d7568'),
  ])
}

const FOCUS_TARGETS = Object.freeze({
  'inside-pocket-corner': Object.freeze({ x: 0, y: 0, z: 1.2 }),
  'deep-pocket': Object.freeze({ x: 0, y: 0, z: 0.7 }),
  'thin-wall': Object.freeze({ x: 3.7, y: 2.9, z: 1.7 }),
  'deep-drilled-hole': Object.freeze({ x: -3.5, y: 2.7, z: 1 }),
  'mounting-hole-tolerance': Object.freeze({ x: 1.8, y: 3, z: 1 }),
})

const POCKET_CORNER_POINTS = Object.freeze([
  Object.freeze([-2.45, -1.4, 1.48]),
  Object.freeze([2.45, -1.4, 1.48]),
  Object.freeze([-2.45, 1.4, 1.48]),
  Object.freeze([2.45, 1.4, 1.48]),
])

function pointInPolygon(point, polygon) {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current]
    const previousPoint = polygon[previous]
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
      / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (intersects) inside = !inside
  }
  return inside
}

function mixHexColor(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = Math.max(0, Math.min(255, (value >> 16) + amount))
  const green = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount))
  const blue = Math.max(0, Math.min(255, (value & 255) + amount))
  return `rgb(${red} ${green} ${blue})`
}

export class BracketViewer {
  constructor(canvas, fixture, { onFeatureSelect, onFeatureHover } = {}) {
    this.canvas = canvas
    this.fixture = fixture
    this.context = canvas.getContext('2d')
    this.onFeatureSelect = onFeatureSelect
    this.onFeatureHover = onFeatureHover
    this.meshes = createParametricBracketScene()
    this.featureLabels = new Map(fixture.features.map((feature) => [feature.featureId, feature.label]))
    this.issueSeverities = new Map()
    this.proposal = null
    this.selectedFeatureId = fixture.features.find((feature) => feature.selected)?.featureId ?? null
    this.hoveredFeatureId = null
    this.renderedFeatureFaces = []
    this.camera = { yaw: -0.72, pitch: 0.64, zoom: 30, target: { x: 0, y: 0, z: 1.7 } }
    this.animationFrame = null
    this.resizeObserver = null

    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handlePointerLeave = this.handlePointerLeave.bind(this)
    this.handleClick = this.handleClick.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleResize = this.handleResize.bind(this)

    if (!this.context) {
      canvas.hidden = true
      canvas.insertAdjacentHTML('afterend', '<p class="viewer-fallback">The 3D canvas is unavailable. Use the complete text evidence beside the model.</p>')
      return
    }

    canvas.addEventListener('pointermove', this.handlePointerMove)
    canvas.addEventListener('pointerleave', this.handlePointerLeave)
    canvas.addEventListener('click', this.handleClick)
    canvas.addEventListener('keydown', this.handleKeyDown)
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(this.handleResize)
      this.resizeObserver.observe(canvas)
    } else {
      window.addEventListener('resize', this.handleResize)
    }
    this.resize()
    this.render()
    this.updateAccessibleLabel()
  }

  destroy() {
    if (!this.context) return
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.handleResize)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.removeEventListener('click', this.handleClick)
    this.canvas.removeEventListener('keydown', this.handleKeyDown)
  }

  resize() {
    if (!this.context) return
    const bounds = this.canvas.getBoundingClientRect()
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(320, Math.round(bounds.width || 640))
    const height = Math.max(320, Math.round(bounds.height || 520))
    this.canvas.width = Math.round(width * pixelRatio)
    this.canvas.height = Math.round(height * pixelRatio)
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    this.viewport = { width, height }
  }

  handleResize() {
    this.resize()
    this.render()
  }

  project(vertex) {
    const relativeX = vertex[0] - this.camera.target.x
    const relativeY = vertex[1] - this.camera.target.y
    const relativeZ = vertex[2] - this.camera.target.z
    const cosineYaw = Math.cos(this.camera.yaw)
    const sineYaw = Math.sin(this.camera.yaw)
    const rotatedX = cosineYaw * relativeX - sineYaw * relativeY
    const rotatedY = sineYaw * relativeX + cosineYaw * relativeY
    const screenX = this.viewport.width / 2 + rotatedX * this.camera.zoom
    const screenY = this.viewport.height / 2
      + (rotatedY * Math.sin(this.camera.pitch) - relativeZ * Math.cos(this.camera.pitch)) * this.camera.zoom
    const depth = rotatedY * Math.cos(this.camera.pitch) + relativeZ * Math.sin(this.camera.pitch)
    return { x: screenX, y: screenY, depth }
  }

  faceColor(mesh, faceIndex) {
    const severity = this.issueSeverities.get(mesh.featureId)
    if (mesh.featureId === this.selectedFeatureId) return faceIndex % 2 ? '#8ff7bd' : '#6bdd9e'
    if (mesh.featureId && mesh.featureId === this.hoveredFeatureId) return '#9cbcaf'
    if (severity === 'high') return faceIndex % 2 ? '#e77f78' : '#c85e58'
    if (severity === 'medium') return faceIndex % 2 ? '#e2b66c' : '#bd8f45'
    return mixHexColor(mesh.color, (faceIndex % 3) * 8)
  }

  render() {
    if (!this.context || !this.viewport) return
    const context = this.context
    context.clearRect(0, 0, this.viewport.width, this.viewport.height)

    const gradient = context.createLinearGradient(0, 0, 0, this.viewport.height)
    gradient.addColorStop(0, '#12201c')
    gradient.addColorStop(1, '#08100e')
    context.fillStyle = gradient
    context.fillRect(0, 0, this.viewport.width, this.viewport.height)
    this.drawGrid(context)

    const faces = []
    this.meshes.forEach((mesh) => {
      mesh.faces.forEach((face, faceIndex) => {
        const polygon = face.map((vertexIndex) => this.project(mesh.vertices[vertexIndex]))
        faces.push({
          mesh,
          faceIndex,
          polygon,
          depth: polygon.reduce((sum, point) => sum + point.depth, 0) / polygon.length,
        })
      })
    })
    faces.sort((left, right) => left.depth - right.depth)
    this.renderedFeatureFaces = []

    faces.forEach(({ mesh, faceIndex, polygon }) => {
      context.beginPath()
      polygon.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.closePath()
      context.fillStyle = this.faceColor(mesh, faceIndex)
      context.globalAlpha = mesh.featureId ? 0.92 : 1
      context.fill()
      context.globalAlpha = 1
      context.strokeStyle = mesh.featureId === this.selectedFeatureId ? '#d8ffe7' : '#6d9185'
      context.lineWidth = mesh.featureId === this.selectedFeatureId ? 2.2 : 0.85
      context.stroke()
      if (mesh.featureId) this.renderedFeatureFaces.push({ featureId: mesh.featureId, polygon })
    })
    this.drawProposal(context)
  }

  drawProposal(context) {
    if (!this.proposal) return
    const beforeRadius = this.proposal.before.insideRadiusMm * 4
    const afterRadius = this.proposal.after.insideRadiusMm * 4
    const previewColor = this.proposal.status === 'rejected' ? '#8da39b' : '#78f0b0'
    context.save()
    POCKET_CORNER_POINTS.forEach((corner) => {
      const point = this.project(corner)
      context.beginPath()
      context.arc(point.x, point.y, beforeRadius, 0, Math.PI * 2)
      context.strokeStyle = '#ff7e78'
      context.lineWidth = 1.5
      context.setLineDash([])
      context.stroke()
      context.beginPath()
      context.arc(point.x, point.y, afterRadius, 0, Math.PI * 2)
      context.strokeStyle = previewColor
      context.lineWidth = 2
      context.setLineDash([6, 4])
      context.stroke()
    })
    const labelPoint = this.project([0, -1.4, 2.25])
    context.setLineDash([])
    context.fillStyle = previewColor
    context.font = '700 12px ui-monospace, monospace'
    context.textAlign = 'center'
    context.fillText(`PREVIEW R${this.proposal.after.insideRadiusMm} mm`, labelPoint.x, labelPoint.y)
    context.restore()
  }

  drawGrid(context) {
    context.save()
    context.strokeStyle = 'rgb(120 240 176 / 7%)'
    context.lineWidth = 1
    for (let position = -20; position <= 20; position += 2) {
      const a = this.project([position, -12, -0.05])
      const b = this.project([position, 12, -0.05])
      const c = this.project([-12, position, -0.05])
      const d = this.project([12, position, -0.05])
      context.beginPath()
      context.moveTo(a.x, a.y)
      context.lineTo(b.x, b.y)
      context.stroke()
      context.beginPath()
      context.moveTo(c.x, c.y)
      context.lineTo(d.x, d.y)
      context.stroke()
    }
    context.restore()
  }

  featureAtEvent(event) {
    const bounds = this.canvas.getBoundingClientRect()
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    for (let index = this.renderedFeatureFaces.length - 1; index >= 0; index -= 1) {
      const candidate = this.renderedFeatureFaces[index]
      if (pointInPolygon(point, candidate.polygon)) return candidate.featureId
    }
    return null
  }

  handlePointerMove(event) {
    const featureId = this.featureAtEvent(event)
    if (featureId === this.hoveredFeatureId) return
    this.hoveredFeatureId = featureId
    this.canvas.style.cursor = featureId ? 'pointer' : 'grab'
    this.onFeatureHover?.(featureId)
    this.render()
  }

  handlePointerLeave() {
    this.hoveredFeatureId = null
    this.canvas.style.cursor = 'grab'
    this.onFeatureHover?.(null)
    this.render()
  }

  handleClick(event) {
    const featureId = this.featureAtEvent(event)
    if (!featureId) return
    this.onFeatureSelect?.(featureId)
    this.focusFeature(featureId)
  }

  handleKeyDown(event) {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (direction) {
      event.preventDefault()
      const currentIndex = FEATURE_ORDER.indexOf(this.selectedFeatureId)
      const nextIndex = (currentIndex + direction + FEATURE_ORDER.length) % FEATURE_ORDER.length
      const featureId = FEATURE_ORDER[nextIndex]
      this.onFeatureSelect?.(featureId)
      this.focusFeature(featureId)
    } else if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault()
      this.resetCamera()
    }
  }

  setFindings(findings) {
    this.issueSeverities = new Map(findings.map((finding) => [finding.featureId, finding.severity]))
    this.render()
  }

  setProposal(proposal) {
    this.proposal = proposal
    this.render()
  }

  setHoveredFeature(featureId) {
    if (featureId === this.hoveredFeatureId) return
    this.hoveredFeatureId = featureId
    this.render()
  }

  selectFeature(featureId, { focus = false } = {}) {
    if (!FEATURE_ORDER.includes(featureId)) return
    this.selectedFeatureId = featureId
    this.canvas.dataset.focusedFeature = featureId
    this.updateAccessibleLabel()
    if (focus) this.focusFeature(featureId)
    else this.render()
  }

  focusFeature(featureId) {
    const target = FOCUS_TARGETS[featureId]
    if (!target) return
    this.selectedFeatureId = featureId
    this.canvas.dataset.focusedFeature = featureId
    this.updateAccessibleLabel()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      this.camera.target = { ...target }
      this.camera.zoom = 39
      this.render()
      return
    }

    cancelAnimationFrame(this.animationFrame)
    const startTarget = { ...this.camera.target }
    const startZoom = this.camera.zoom
    const startedAt = performance.now()
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / 260)
      const eased = 1 - (1 - progress) ** 3
      this.camera.target = {
        x: startTarget.x + (target.x - startTarget.x) * eased,
        y: startTarget.y + (target.y - startTarget.y) * eased,
        z: startTarget.z + (target.z - startTarget.z) * eased,
      }
      this.camera.zoom = startZoom + (39 - startZoom) * eased
      this.render()
      if (progress < 1) this.animationFrame = requestAnimationFrame(animate)
    }
    this.animationFrame = requestAnimationFrame(animate)
  }

  resetCamera() {
    cancelAnimationFrame(this.animationFrame)
    this.camera.target = { x: 0, y: 0, z: 1.7 }
    this.camera.zoom = 30
    this.canvas.dataset.focusedFeature = this.selectedFeatureId ?? ''
    this.render()
  }

  updateAccessibleLabel() {
    const label = this.featureLabels.get(this.selectedFeatureId) ?? 'none'
    this.canvas.setAttribute(
      'aria-label',
      `Interactive isometric CNC bracket. Selected feature: ${label}. Use arrow keys to move between five features; Home resets the camera.`,
    )
  }
}

export function mountBracketViewer(canvas, fixture, options) {
  return new BracketViewer(canvas, fixture, options)
}
