import { describe, expect, it } from 'vitest'
import { createCopy } from '../src/main/clipboard.js'

describe('createCopy', () => {
  it('writes and confirms by reading back', async () => {
    let value = ''
    const copy = createCopy({ writeText: (text) => (value = text), readText: () => value })
    expect(await copy('你好 hello नमस्ते')).toBe(true)
    expect(value).toBe('你好 hello नमस्ते')
  })

  it('reports a write that did not stick or threw', async () => {
    expect(await createCopy({ writeText: async () => {}, readText: async () => 'old' })('new')).toBe(false)
    expect(await createCopy({ writeText: async () => Promise.reject(new Error('busy')), readText: async () => '' })('new')).toBe(false)
    expect(await createCopy({ writeText: () => { throw new Error('busy') }, readText: () => '' })('new')).toBe(false)
  })
})
