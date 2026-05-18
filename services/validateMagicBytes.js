import fs from 'fs'

async function validateMagicBytes(file) {
  let buffer
  if (Buffer.isBuffer(file)) {
    buffer = file
  } else {
    buffer = fs.readFileSync(file)
  }

  const bytes = buffer.slice(0, 12)
  const hex = [...bytes]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

  // JPEG
  if (hex.startsWith('FFD8FF')) return true
  // PNG
  if (hex.startsWith('89504E470D0A1A0A')) return true
  // GIF
  if (hex.startsWith('47494638')) return true
  // WebP
  if (hex.startsWith('52494646') && hex.includes('57454250')) return true
  // PDF
  if (hex.startsWith('25504446')) return true
  // MP4
  if (hex.includes('66747970')) return true
  // MOV
  if (hex.includes('6D6F6F76')) return true
  // MKV
  if (hex.startsWith('1A45DFA3')) return true
  // AVI
  if (hex.startsWith('52494646') && hex.includes('415649')) return true

  return false
}
export default validateMagicBytes
