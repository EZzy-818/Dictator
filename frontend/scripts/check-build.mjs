// Fails if the frontend build contains anything that looks like an OpenAI secret or a
// direct OpenAI call. Runs after every `npm run build`, so a hosting provider that builds
// the frontend runs it too.
//
// Usage: node scripts/check-build.mjs [dist folder]
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.resolve(process.argv[2] ?? path.join(root, 'frontend/dist'))

const patterns = [
  { label: 'an OpenAI secret key (sk-...)', test: (text) => /sk-[A-Za-z0-9_-]{20,}/.test(text) },
  { label: 'the OPENAI_API_KEY variable name', test: (text) => text.includes('OPENAI_API_KEY') },
  { label: 'a direct call to api.openai.com', test: (text) => text.includes('api.openai.com') },
]

// The real key, if this machine has one, must not appear either.
const keys = [process.env.OPENAI_API_KEY]
try {
  const match = fs.readFileSync(path.join(root, 'backend/.env'), 'utf8').match(/^OPENAI_API_KEY=(.+)$/m)
  keys.push(match?.[1].trim())
} catch {
  // No backend/.env on this machine.
}
for (const key of keys.filter((value) => value && value.length >= 8)) {
  patterns.push({ label: 'the configured OPENAI_API_KEY value', test: (text) => text.includes(key) })
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}

if (!fs.existsSync(dist)) {
  console.error(`No build found at ${dist}. Run npm run build first.`)
  process.exit(1)
}

const findings = []
const all = files(dist)
for (const file of all) {
  const text = fs.readFileSync(file, 'latin1')
  for (const pattern of patterns) {
    if (pattern.test(text)) findings.push(`${path.relative(root, file)} contains ${pattern.label}`)
  }
}

if (findings.length) {
  for (const finding of findings) console.error(`Build check failed: ${finding}`)
  process.exit(1)
}
console.log(`Build check passed: ${all.length} files in ${path.relative(root, dist) || dist}, no OpenAI secrets or direct OpenAI calls.`)
