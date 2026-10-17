import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_BYTES, getHealth, processAudio, refineTranscript } from '../src/services/api.js'

const recording = (size = 100) => ({ blob: new Blob([new Uint8Array(size)], { type: 'audio/webm' }), mimeType: 'audio/webm;codecs=opus' })

function response({ ok = true, status = 200, json }) {
  return { ok, status, json: json ?? (async () => ({})) }
}

describe('api service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rejects recordings over 10 MB before uploading', async () => {
    await expect(processAudio(recording(MAX_UPLOAD_BYTES + 1), 'en')).rejects.toMatchObject({ code: 'file_too_large' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports network failures', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(processAudio(recording(), 'en')).rejects.toMatchObject({
      code: 'network_error',
      message: expect.stringMatching(/Could not reach the server/),
    })
  })

  it('times out a request that never answers', async () => {
    vi.useFakeTimers()
    fetch.mockImplementation(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = refineTranscript('hi', 'en')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(70_000)
    await assertion
  })

  it('uses the server error message when there is one', async () => {
    fetch.mockResolvedValue(response({ ok: false, status: 422, json: async () => ({ error: 'No speech was detected.', code: 'no_speech' }) }))
    await expect(processAudio(recording(), 'en')).rejects.toMatchObject({ message: 'No speech was detected.', code: 'no_speech', status: 422 })
  })

  it('handles a non-JSON error page safely', async () => {
    fetch.mockResolvedValue(response({ ok: false, status: 502, json: async () => JSON.parse('<html>') }))
    await expect(processAudio(recording(), 'en')).rejects.toMatchObject({
      status: 502,
      message: 'The server could not complete the request (502). Please try again.',
    })
  })

  it('rejects a successful response that is not the expected JSON', async () => {
    fetch.mockResolvedValue(response({ json: async () => JSON.parse('<html>') }))
    await expect(processAudio(recording(), 'en')).rejects.toMatchObject({ code: 'bad_response' })

    fetch.mockResolvedValue(response({ json: async () => ({ unexpected: true }) }))
    await expect(refineTranscript('hi', 'en')).rejects.toMatchObject({ code: 'bad_response' })
  })

  it('sends the recording with its real format and the language', async () => {
    fetch.mockResolvedValue(response({ json: async () => ({ rawTranscript: 'x' }) }))
    await processAudio({ blob: new Blob(['a'], { type: 'audio/mp4' }), mimeType: 'audio/mp4' }, 'zh')

    const [url, options] = fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/process$/)
    expect(options.body.get('language')).toBe('zh')
    expect(options.body.get('audio').name).toBe('recording.mp4')
  })

  it('checks health', async () => {
    fetch.mockResolvedValue(response({ json: async () => ({ status: 'ok' }) }))
    await expect(getHealth()).resolves.toEqual({ status: 'ok' })
  })
})
