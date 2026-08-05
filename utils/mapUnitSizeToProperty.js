/**
 * Map developer unit size fields onto Property size fields (off-plan style).
 */
export function mapUnitSizeToPropertyFields(unit = {}) {
  const sizeUnit =
    String(unit.sizeUnit || 'SQFT').toUpperCase() === 'SQM' ? 'SQM' : 'SQFT'
  const from = Number(unit.builtUpArea)
  const toRaw = Number(unit.builtUpAreaTo)
  const hasFrom = Number.isFinite(from) && from > 0
  const hasTo = Number.isFinite(toRaw) && toRaw > 0
  const to = hasTo ? toRaw : hasFrom ? from : 0

  if (sizeUnit === 'SQM') {
    return {
      sizeUnit: 'SQM',
      sizeType: 'SQM',
      sizeSQM: hasFrom ? from : 0,
      sizeSQMFrom: hasFrom ? from : undefined,
      sizeSQMTo: hasFrom ? to : undefined,
      sizeSQFT: 0,
      sizeSQFTFrom: undefined,
      sizeSQFTTo: undefined,
    }
  }

  return {
    sizeUnit: 'SQFT',
    sizeType: 'SQFT',
    sizeSQFT: hasFrom ? from : 0,
    sizeSQFTFrom: hasFrom ? from : undefined,
    sizeSQFTTo: hasFrom ? to : undefined,
    sizeSQM: 0,
    sizeSQMFrom: undefined,
    sizeSQMTo: undefined,
  }
}
