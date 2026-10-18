// Compiles the Auto-Paste helper (native/paste-helper.swift) into out-native/dictator-paste, a
// universal (Apple Silicon and Intel) binary that packaging copies into the app's Resources.
// Needs the Xcode Command Line Tools (xcode-select --install). Skipped on other platforms, where
// Auto-Paste is unavailable, and when the binary is newer than its source.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = path.join(root, 'native/paste-helper.swift')
const outDir = path.join(root, 'out-native')
const output = path.join(outDir, 'dictator-paste')
// The oldest macOS Electron 44 supports.
const MIN_MACOS = '12.0'

if (process.platform !== 'darwin') {
  console.log('build-helper: not macOS, skipping the Auto-Paste helper')
  process.exit(0)
}
if (fs.existsSync(output) && fs.statSync(output).mtimeMs > fs.statSync(source).mtimeMs) process.exit(0)

fs.mkdirSync(outDir, { recursive: true })
const slices = ['arm64', 'x86_64'].map((arch) => {
  const slice = path.join(outDir, `dictator-paste-${arch}`)
  execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos${MIN_MACOS}`, source, '-o', slice], { stdio: 'inherit' })
  return slice
})
execFileSync('xcrun', ['lipo', '-create', ...slices, '-output', output], { stdio: 'inherit' })
for (const slice of slices) fs.rmSync(slice)
console.log(`build-helper: wrote ${path.relative(root, output)}`)
