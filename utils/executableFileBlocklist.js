export const BLOCKED_EXECUTABLE_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.wsf', '.msi', '.dll',
  '.sh', '.bash', '.zsh', '.run', '.bin', '.out', '.deb', '.rpm',
  '.js', '.py', '.pl', '.rb', '.php', '.asp', '.aspx', '.jsp',
  '.jar', '.war', '.ear', '.apk',
  '.app', '.dmg', '.pkg',
  '.ps1', '.psm1', '.psd1', '.ps1xml', '.pssc', '.cdxml',
  '.scpt', '.scptd', '.command', '.tool',
  '.so', '.dylib', '.dll',
]

export const BLOCKED_EXECUTABLE_MIMETYPES = [
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-sharedlib',
  'application/x-shared-library',
  'application/x-elf',
  'application/x-mach-binary',
  'application/x-ms-shortcut',
  'application/x-shellscript',
  'application/x-perl',
  'application/x-python',
  'application/x-ruby',
  'application/x-php',
  'application/java-archive',
  'application/vnd.android.package-archive',
  'application/x-debian-package',
  'application/x-rpm',
  'text/x-shellscript',
  'text/x-perl',
  'text/x-python',
  'text/x-ruby',
  'text/x-php',
]

export const EXECUTABLE_MAGIC_BYTES = [
  '4D5A',
  '7F454C46',
  'FEEDFACE',
  'FEEDFACF',
  'CEFAEDFE',
  'CFFAEDFE',
  'CAFEBABE',
  '504B0304',
]

export const isExecutableExtension = (filename) => {
  if (!filename) return false
  
  const ext = filename.toLowerCase()
  return BLOCKED_EXECUTABLE_EXTENSIONS.some(blocked => ext.endsWith(blocked))
}

export const isExecutableMimetype = (mimetype) => {
  if (!mimetype) return false
  
  const mime = mimetype.toLowerCase()
  return BLOCKED_EXECUTABLE_MIMETYPES.some(blocked => mime.includes(blocked))
}

export const hasExecutableSignature = (buffer) => {
  if (!buffer || buffer.length < 4) return false
  
  const hex = buffer.slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  
  for (const magic of EXECUTABLE_MAGIC_BYTES) {
    if (hex.startsWith(magic)) {
      if (magic === '504B0304') {
        const bufferStr = buffer.toString('utf-8', 0, Math.min(1000, buffer.length))
        if (bufferStr.includes('META-INF') || bufferStr.includes('PK')) {
          return true
        }
        continue
      }
      return true
    }
  }
  
  return false
}

export const checkExecutableFile = (file) => {
  if (!file) {
    return { isBlocked: false, reason: null }
  }
  
  // Check extension
  if (isExecutableExtension(file.originalname)) {
    return {
      isBlocked: true,
      reason: `Executable file extension blocked: ${file.originalname}`
    }
  }
  
  if (isExecutableMimetype(file.mimetype)) {
    return {
      isBlocked: true,
      reason: `Executable MIME type blocked: ${file.mimetype}`
    }
  }
  
  if (file.buffer && hasExecutableSignature(file.buffer)) {
    return {
      isBlocked: true,
      reason: 'Executable file signature detected in file content'
    }
  }
  
  return { isBlocked: false, reason: null }
}

export default {
  BLOCKED_EXECUTABLE_EXTENSIONS,
  BLOCKED_EXECUTABLE_MIMETYPES,
  EXECUTABLE_MAGIC_BYTES,
  isExecutableExtension,
  isExecutableMimetype,
  hasExecutableSignature,
  checkExecutableFile,
}