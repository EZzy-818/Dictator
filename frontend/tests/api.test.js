import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_BYTES, getHealth, processAudio } from '../src/services/api.js'

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
    await expect(processAudio(recording(MAX_UPLOAD_BYTES + 1))).rejects.toMatchObject({ code: 'file_too_large' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports network failures', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(processAudio(recording())).rejects.toMatchObject({
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
    const pending = processAudio(recording())
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(170_000)
    await assertion
  })

  it('uses the server error message when there is one', async () => {
    fetch.mockResolvedValue(response({ ok: false, status: 422, json: async () => ({ error: 'No speech was detected.', code: 'no_speech' }) }))
    await expect(processAudio(recording())).rejects.toMatchObject({ message: 'No speech was detected.', code: 'no_speech', status: 422 })
  })

  it('handles a non-JSON error page safely', async () => {
    fetch.mockResolvedValue(response({ ok: false, status: 502, json: async () => JSON.parse('<html>') }))
    await expect(processAudio(recording())).rejects.toMatchObject({
      status: 502,
      message: 'The server could not complete the request (502). Please try again.',
    })
  })

  it('rejects a successful response that is not the expected JSON', async () => {
    fetch.mockResolvedValue(response({ json: async () => JSON.parse('<html>') }))
    await expect(processAudio(recording())).rejects.toMatchObject({ code: 'bad_response' })

    fetch.mockResolvedValue(response({ json: async () => ({ unexpected: true }) }))
    await expect(processAudio(recording())).rejects.toMatchObject({ code: 'bad_response' })
  })

  it('sends the recording with its real format and no language', async () => {
    fetch.mockResolvedValue(response({ json: async () => ({ rawTranscript: 'x' }) }))
    await processAudio({ blob: new Blob(['a'], { type: 'audio/mp4' }), mimeType: 'audio/mp4' })

    const [url, options] = fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/process$/)
    expect(options.body.has('language')).toBe(false)
    expect(options.body.get('audio').name).toBe('recording.mp4')
  })

  it('sends the refinement level, defaulting to Light', async () => {
    fetch.mockResolvedValue(response({ json: async () => ({ rawTranscript: 'x', polishedTranscript: 'x' }) }))
    await processAudio(recording())
    await processAudio(recording(), 'medium')

    const [process1, process2] = fetch.mock.calls.map(([, options]) => options.body)
    expect(process1.get('refinementLevel')).toBe('light')
    expect(process2.get('refinementLevel')).toBe('medium')
  })

  it('checks health', async () => {
    fetch.mockResolvedValue(response({ json: async () => ({ status: 'ok' }) }))
    await expect(getHealth()).resolves.toEqual({ status: 'ok' })
  })
})

describe('processAudio latency trace', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the request ID before the audio and marks when the request started and answered', async () => {
    fetch.mockResolvedValue(response({ json: async () => ({ rawTranscript: 'hi', timings: { totalMs: 5 } }) }))
    const trace = { requestId: 'rec-1234abcd' }

    const data = await processAudio(recording(), 'none', trace)

    const form = fetch.mock.calls[0][1].body
    expect([...form.keys()]).toEqual(['requestId', 'refinementLevel', 'audio'])
    expect(form.get('requestId')).toBe('rec-1234abcd')
    expect(fetch.mock.calls[0][1].headers).toBeUndefined()
    expect(trace.responseAt).toBeGreaterThanOrEqual(trace.requestStartedAt)
    expect(data.timings).toEqual({ totalMs: 5 })
  })

  it('marks failed requests and keeps the server timings on the error', async () => {
    const timings = { transcriptionStatus: 'failed' }
    fetch.mockResolvedValue(response({ ok: false, status: 502, json: async () => ({ error: 'Failed.', code: 'transcription_failed', timings }) }))
    const trace = { requestId: 'rec-1234abcd' }

    await expect(processAudio(recording(), 'light', trace)).rejects.toMatchObject({ code: 'transcription_failed', timings })
    expect(trace.responseAt).toBeGreaterThanOrEqual(trace.requestStartedAt)
  })

  it('marks requests that never reach the server', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const trace = {}
    await expect(processAudio(recording(), 'light', trace)).rejects.toMatchObject({ code: 'network_error' })
    expect(trace.responseAt).toBeGreaterThanOrEqual(trace.requestStartedAt)
  })

  it('sends no request ID without a trace', async () => {
    fetch.mockResolvedValue(response({ json: async () => ({ rawTranscript: 'hi' }) }))
    await processAudio(recording())
    expect(fetch.mock.calls[0][1].body.has('requestId')).toBe(false)
  })
})
