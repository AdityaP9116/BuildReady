// Manual measurements never masquerade as automatically measured geometry.
export const REVIEW_GROUPS = Object.freeze([
  ['inside-pocket-corner', 'Internal corner', ['insideRadiusMm', 'selectedCutterRadiusMm']],
  ['deep-pocket', 'Pocket', ['depthMm', 'minWidthMm']],
  ['thin-wall', 'Wall', ['thicknessMm']],
  ['deep-drilled-hole', 'Drilled hole', ['depthMm', 'diameterMm']],
  ['mounting-hole-tolerance', 'Mounting tolerance', ['diameterMm', 'tolerancePlusMinusMm']],
])

export async function reviewManufacturingInputs(design, input) {
  if (!design.sourceIdentity || input.snapshotKey !== design.sourceSnapshotKey) throw new Error('Measurements must match the current live CAD revision.')
  if (input.acknowledged !== true || typeof input.reviewer !== 'string' || !input.reviewer.trim() || input.reviewer.length > 100) throw new Error('A named reviewer must confirm the measurements and applicability.')
  if (!Array.isArray(input.groups) || input.groups.length > 5) throw new Error('Invalid measurement groups.')
  const features = [], seen = new Set()
  for (const entry of input.groups) {
    const definition = REVIEW_GROUPS.find(([id]) => id === entry.featureId)
    if (!definition || seen.has(entry.featureId)) throw new Error('Unknown or duplicate measurement group.')
    seen.add(entry.featureId)
    if (typeof entry.reference !== 'string' || !entry.reference.trim() || entry.reference.length > 500) throw new Error('Record the measured faces or drawing reference for each group.')
    if (!entry.dimensions || Object.keys(entry.dimensions).sort().join() !== [...definition[2]].sort().join()) throw new Error('Complete every dimension in a selected group.')
    for (const value of Object.values(entry.dimensions)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100000) throw new Error('Dimensions must be positive finite millimeter values.')
    }
    features.push({ featureId: definition[0], label: definition[1], dimensions: { ...entry.dimensions },
      highlightIds: [], inputReviewStatus: 'human-reviewed',
      evidenceReference: `onshape://review/${encodeURIComponent(input.snapshotKey)}/${definition[0]}`,
      measurementProvenance: { method: 'human-entered', reviewer: input.reviewer.trim(), reference: entry.reference.trim(), sourceSnapshotKey: input.snapshotKey },
    })
  }
  if (!features.length) throw new Error('Enter at least one complete group; leave unknown groups empty.')
  const content = JSON.stringify({ snapshotKey: input.snapshotKey, reviewer: input.reviewer.trim(), features })
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))].map(n => n.toString(16).padStart(2, '0')).join('')
  return { ...design, features, manufacturingReview: { hash: `sha256-${hash}`, reviewer: input.reviewer.trim(), method: 'human-entered', productionApproved: false },
    manufacturingInputGaps: (design.manufacturingInputGaps ?? []).filter(gap => !seen.has(gap.featureId)) }
}

export function mountManufacturingReview(container, design, save) {
  container.replaceChildren()
  if (!design.sourceIdentity) return
  const details = document.createElement('details')
  const summary = document.createElement('summary'); summary.textContent = 'Review measured manufacturing inputs'; details.append(summary)
  const note = document.createElement('p'); note.textContent = 'Enter final-solid measurements in mm and a face/drawing reference. Leave unknown groups empty. This session-only review does not certify manufacturability or change CAD.'; details.append(note)
  const form = document.createElement('form')
  function field(parent, name, label, type = 'text') {
    const wrapper = document.createElement('label'); wrapper.textContent = label
    const element = document.createElement('input'); element.name = name; element.type = type
    if (type === 'number') { element.step = 'any'; element.min = '0' }
    else element.maxLength = 500
    wrapper.append(element); parent.append(wrapper); return element
  }
  const reviewer = field(form, 'reviewer', 'Reviewer name'); reviewer.required = true; reviewer.maxLength = 100
  for (const [id, label, keys] of REVIEW_GROUPS) {
    const group = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = label; group.append(legend)
    for (const key of keys) field(group, `${id}.${key}`, `${key} (mm)`, 'number')
    field(group, `${id}.reference`, 'Measured faces / drawing and section reference')
    form.append(group)
  }
  const ack = field(form, 'ack', 'I checked the measurements and applicability to this revision.', 'checkbox'); ack.required = true
  const button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Apply reviewed inputs and clear old conclusions'; form.append(button)
  const message = document.createElement('p'); message.setAttribute('role', 'status'); form.append(message)
  form.addEventListener('submit', async event => {
    event.preventDefault(); button.disabled = true
    try {
      const data = new FormData(form), groups = []
      for (const [id, , keys] of REVIEW_GROUPS) {
        if (!keys.some(key => data.get(`${id}.${key}`)) && !data.get(`${id}.reference`)) continue
        groups.push({ featureId: id, reference: data.get(`${id}.reference`), dimensions: Object.fromEntries(keys.map(key => [key, data.get(`${id}.${key}`) === '' ? null : Number(data.get(`${id}.${key}`))])) })
      }
      await save(await reviewManufacturingInputs(design, { snapshotKey: design.sourceSnapshotKey, reviewer: reviewer.value, acknowledged: ack.checked, groups }))
      message.textContent = 'Inputs applied. Run manufacturing checks again.'
    } catch (error) { message.textContent = error.message } finally { button.disabled = false }
  })
  details.append(form); container.append(details)
}
