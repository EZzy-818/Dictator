import { describe, expect, it } from 'vitest'
import { isTrustedSender, parseRecorderError, parseRecording } from '../src/main/ipc.js'

const appUrl = 'file:///app/out/renderer/index.html'

describe('parseRecording', () => {
  it('accepts a recording and builds a Blob for the API client', () => {
    const { recording } = parseRecording({ bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/webm;codecs=opus', durationMs: 1200, peak: 0.4 })
    expect(recording.blob).toBeInstanceOf(Blob)
    expect(recording.blob.size).toBe(3)
    expect(recording.blob.type).toBe('audio/webm;codecs=opus')
    expect(recording).toMatchObject({ mimeType: 'audio/webm;codecs=opus', durationMs: 1200, peak: 0.4 })
  })

  it('accepts typed arrays (how IPC may deliver binary data)', () => {
    expect(parseRecording({ bytes: new Uint8Array([1]), mimeType: 'audio/mp4', durationMs: 900 }).recording).toBeTruthy()
  })

  it('rejects anything else', () => {
    const ok = { bytes: new Uint8Array([1]).buffer, mimeType: 'audio/webm', durationMs: 900 }
    expect(parseRecording(null).error).toBeTruthy()
    expect(parseRecording({ ...ok, bytes: 'abc' }).error).toBeTruthy()
    expect(parseRecording({ ...ok, bytes: new ArrayBuffer(0) }).error).toBeTruthy()
    expect(parseRecording({ ...ok, bytes: new ArrayBuffer(10 * 1024 * 1024 + 1) }).error).toBe('recording too large')
    expect(parseRecording({ ...ok, mimeType: 'text/html' }).error).toBe('unsupported type')
    expect(parseRecording({ ...ok, mimeType: 'audio/webm;<script>' }).error).toBe('unsupported type')
    expect(parseRecording({ ...ok, durationMs: -1 }).error).toBeTruthy()
    expect(parseRecording({ ...ok, durationMs: 'x' }).error).toBeTruthy()
  })
})

describe('parseRecorderError', () => {
  it('passes known codes and folds the rest into recording-failed', () => {
    expect(parseRecorderError('too-short', ['too-short'])).toBe('too-short')
    expect(parseRecorderError('rm -rf', ['too-short'])).toBe('recording-failed')
    expect(parseRecorderError({}, ['too-short'])).toBe('recording-failed')
  })
})

describe('isTrustedSender', () => {
  const webContents = {}
  const win = { webContents, isDestroyed: () => false }

  it('trusts only the indicator window on the app page', () => {
    expect(isTrustedSender({ sender: webContents, senderFrame: { url: appUrl } }, win, appUrl)).toBe(true)
    expect(isTrustedSender({ sender: {}, senderFrame: { url: appUrl } }, win, appUrl)).toBe(false)
    expect(isTrustedSender({ sender: webContents, senderFrame: { url: 'https://example.com' } }, win, appUrl)).toBe(false)
    expect(isTrustedSender({ sender: webContents, senderFrame: null }, win, appUrl)).toBe(false)
    expect(isTrustedSender({ sender: webContents, senderFrame: { url: appUrl } }, { ...win, isDestroyed: () => true }, appUrl)).toBe(false)
  })
})
