/**
 * Backend "build": syntax-check every project .js file (no transpile).
 * Fails CI if any file has invalid JavaScript.
 */
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..')

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'coverage',
  '.nyc_output',
  'dist',
])

/** Parallel `node --check` calls (Windows AV is slow per process). */
const CONCURRENCY = 12

async function collectJsFiles(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) out.push(...(await collectJsFiles(full)))
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      out.push(full)
    }
  }
  return out
}

async function checkOne(file) {
  try {
    await execFile(process.execPath, ['--check', file], {
      maxBuffer: 2 * 1024 * 1024,
    })
    return { file, ok: true }
  } catch (e) {
    return {
      file,
      ok: false,
      err: (e.stderr && String(e.stderr).trim()) || e.message || String(e),
    }
  }
}

async function runPool(items, limit, fn) {
  let next = 0
  const results = new Array(items.length)
  async function worker() {
    for (; ;) {
      const i = next++
      if (i >= items.length) break
      results[i] = await fn(items[i])
    }
  }
  const n = Math.min(limit, Math.max(1, items.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

const files = await collectJsFiles(root)
if (files.length === 0) {
  console.error('fv_backend build: no .js files found under', root)
  process.exit(1)
}

const results = await runPool(files, CONCURRENCY, checkOne)
const failures = results.filter((r) => !r.ok)

for (const r of failures) {
  console.error(`\n--check failed: ${r.file}`)
  if (r.err) console.error(r.err)
}

if (failures.length > 0) {
  console.error(
    `\nfv_backend build: ${failures.length}/${files.length} file(s) failed syntax check.`,
  )
  process.exit(1)
}

console.log(`fv_backend build OK: ${files.length} JS file(s) passed syntax check.`)
