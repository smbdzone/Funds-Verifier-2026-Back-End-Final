/**
 * Map developer unit size fields onto Property size fields (off-plan style).
 * Always clears the opposite unit so republish does not leave stale SQFT/SQM values.
 */
export function mapUnitSizeToPropertyFields(unit = {}) {
  const sizeUnit =
    String(unit.sizeUnit || 'SQFT').trim().toUpperCase() === 'SQM'
      ? 'SQM'
      : 'SQFT'
  const from = Number(unit.builtUpArea)
  const toRaw = Number(unit.builtUpAreaTo)
  const hasFrom = Number.isFinite(from) && from > 0
  const hasTo = Number.isFinite(toRaw) && toRaw > 0
  const to = hasTo ? toRaw : hasFrom ? from : null

  if (sizeUnit === 'SQM') {
    return {
      sizeUnit: 'SQM',
      sizeType: 'SQM',
      sizeSQM: hasFrom ? from : 0,
      sizeSQMFrom: hasFrom ? from : null,
      sizeSQMTo: hasFrom ? to : null,
      sizeSQFT: 0,
      sizeSQFTFrom: null,
      sizeSQFTTo: null,
    }
  }

  return {
    sizeUnit: 'SQFT',
    sizeType: 'SQFT',
    sizeSQFT: hasFrom ? from : 0,
    sizeSQFTFrom: hasFrom ? from : null,
    sizeSQFTTo: hasFrom ? to : null,
    sizeSQM: 0,
    sizeSQMFrom: null,
    sizeSQMTo: null,
  }
}
