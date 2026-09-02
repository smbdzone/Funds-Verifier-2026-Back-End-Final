import fs from 'fs-extra'
import path from 'path'

const CHUNKS_ROOT = path.resolve(process.cwd(), 'uploads', 'chunks')
const STALE_MS = 60 * 60 * 1000

export function assertSafeId(value, label = 'id') {
  const id = String(value || '').trim()
  if (!/^[A-Za-z0-9._-]{8,80}$/.test(id) || id.includes('..')) {
    const err = new Error(`Invalid ${label}`)
    err.statusCode = 400
    throw err
  }
  return id
}

function sessionDir(userUUID, uploadId) {
  return path.join(CHUNKS_ROOT, assertSafeId(userUUID, 'user'), assertSafeId(uploadId, 'upload id'))
}

export async function saveChunk({ userUUID, uploadId, chunkIndex, buffer }) {
  const dir = sessionDir(userUUID, uploadId)
  await fs.ensureDir(dir)
  const filePath = path.join(dir, `${Number(chunkIndex)}.part`)
  await fs.writeFile(filePath, buffer)
  return filePath
}

export async function assembleChunks({ userUUID, uploadId, totalChunks }) {
  const dir = sessionDir(userUUID, uploadId)
  const parts = []
  for (let i = 0; i < totalChunks; i += 1) {
    const filePath = path.join(dir, `${i}.part`)
    if (!(await fs.pathExists(filePath))) {
      const err = new Error(`Missing video chunk ${i + 1} of ${totalChunks}`)
      err.statusCode = 400
      throw err
    }
    parts.push(await fs.readFile(filePath))
  }
  return Buffer.concat(parts)
}

export async function removeSession(userUUID, uploadId) {
  try {
    await fs.remove(sessionDir(userUUID, uploadId))
  } catch {
    // ignore cleanup errors
  }
}

export async function sweepStaleChunks() {
  try {
    if (!(await fs.pathExists(CHUNKS_ROOT))) return
    const users = await fs.readdir(CHUNKS_ROOT)
    const cutoff = Date.now() - STALE_MS
    await Promise.all(
      users.map(async (userDir) => {
        const userPath = path.join(CHUNKS_ROOT, userDir)
        const sessions = await fs.readdir(userPath).catch(() => [])
        await Promise.all(
          sessions.map(async (session) => {
            const sessionPath = path.join(userPath, session)
            const stat = await fs.stat(sessionPath).catch(() => null)
            if (stat?.mtimeMs && stat.mtimeMs < cutoff) {
              await fs.remove(sessionPath)
            }
          }),
        )
      }),
    )
  } catch {
    // ignore sweep errors
  }
}
