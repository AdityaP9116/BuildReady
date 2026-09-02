function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

const response = await fetch(new URL('./fea-domain.json', import.meta.url))
if (!response.ok) throw new Error(`FEA_DOMAIN_LOAD_FAILED: ${response.status}`)
const data = await response.json()
if (data?.analysisType !== 'linear_static' || data?.loadPolicy?.supportedType !== 'force') {
  throw new Error('FEA_DOMAIN_INVALID: expected the controlled linear-static force contract.')
}

export const FEA_DOMAIN = deepFreeze(data)
