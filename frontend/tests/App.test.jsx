import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/App.jsx'
import { installMediaMocks, removeMediaMocks } from './mediaMocks.js'

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

const MIXED_RAW = '嗯，我觉得这个backend应该用Python，不对，用 Go。'
const MIXED_POLISHED = '我觉得这个 backend 应该用 Go。'

function processResult(overrides = {}) {
  return {
    rawTranscript: MIXED_RAW,
    polishedTranscript: MIXED_POLISHED,
    selectedLanguage: 'zh',
    transcriptionStatus: 'success',
    refinementStatus: 'success',
    ...overrides,
  }
}

describe('App', () => {
  let media
  let processResponse
  let refineResponse
  let clipboard

  beforeEach(() => {
    vi.useFakeTimers()
    processResponse = () => jsonResponse(processResult())
    refineResponse = () => jsonResponse({ polishedTranscript: 'Retried text。' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.endsWith('/api/process')) return processResponse()
        if (url.endsWith('/api/refine')) return refineResponse()
        return jsonResponse({ status: 'ok' })
      }),
    )
    clipboard = { writeText: vi.fn(async () => {}) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    media = installMediaMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    removeMediaMocks()
    delete navigator.clipboard
  })

  async function startRecording(name = 'Start Recording') {
    await act(async () => fireEvent.click(screen.getByRole('button', { name })))
  }

  async function stopRecording(ms = 2_000) {
    act(() => vi.advanceTimersByTime(ms))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' })))
  }

  async function record() {
    await startRecording()
    await stopRecording()
  }

  function calls(path) {
    return fetch.mock.calls.filter(([url]) => url.endsWith(path))
  }

  function state() {
    return screen.getByRole('main').dataset.state
  }

  it('shows the header and defaults to Auto-detect', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dictator' })).toBeTruthy()
    expect(screen.getByText('AI Voice-to-Text')).toBeTruthy()
    expect(screen.getByLabelText('Auto-detect').checked).toBe(true)
    expect(state()).toBe('idle')
  })

  it('moves through recording, processing and completed states', async () => {
    let resolveProcess
    processResponse = () => new Promise((resolve) => (resolveProcess = resolve))
    render(<App />)

    await startRecording()
    expect(state()).toBe('recording')

    await stopRecording()
    expect(state()).toBe('processing')
    expect(screen.getByText('Transcribing and refining…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start Recording' }).disabled).toBe(true)

    await act(async () => resolveProcess(jsonResponse(processResult())))
    expect(state()).toBe('completed')
  })

  it('uploads the selected language and shows raw and polished text exactly', async () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText('中文'))
    await record()

    expect(calls('/api/process')[0][1].body.get('language')).toBe('zh')
    const raw = screen.getByLabelText('Raw transcript')
    expect(raw.value).toBe(MIXED_RAW)
    expect(raw.readOnly).toBe(true)
    expect(raw.lang).toBe('zh-CN')
    expect(screen.getByLabelText('Polished text').value).toBe(MIXED_POLISHED)
    expect(screen.getByLabelText('中文').checked).toBe(true)
  })

  it('copies the edited text exactly, including Unicode', async () => {
    render(<App />)
    await record()

    const edited = '我觉得 backend 应该用 Go，而不是 Python。🚀 “quoted” — done'
    fireEvent.change(screen.getByLabelText('Polished text'), { target: { value: edited } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })))

    expect(clipboard.writeText).toHaveBeenCalledWith(edited)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('reports a copy failure without losing the text', async () => {
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
    render(<App />)
    await record()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })))
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy()
    expect(screen.getByLabelText('Polished text').value).toBe(MIXED_POLISHED)
  })

  it('keeps the raw transcript when refinement fails and retries only refinement', async () => {
    processResponse = () => jsonResponse(processResult({ polishedTranscript: null, refinementStatus: 'failed' }))
    render(<App />)
    await record()

    expect(screen.getByLabelText('Raw transcript').value).toBe(MIXED_RAW)
    expect(screen.getByRole('alert').textContent).toMatch(/Refinement failed/)
    expect(screen.getByLabelText('Polished text').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Copy' }).disabled).toBe(true)

    // Changing the selector afterwards must not change how this transcript is refined.
    fireEvent.click(screen.getByLabelText('English'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry Refinement' })))

    expect(calls('/api/process')).toHaveLength(1)
    const [, options] = calls('/api/refine')[0]
    expect(JSON.parse(options.body)).toEqual({ transcript: MIXED_RAW, language: 'zh' })
    expect(screen.getByLabelText('Polished text').value).toBe('Retried text。')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an error when retrying refinement fails again', async () => {
    processResponse = () => jsonResponse(processResult({ polishedTranscript: null, refinementStatus: 'failed' }))
    refineResponse = () => jsonResponse({ error: 'Refinement failed.', code: 'refinement_failed' }, 502)
    render(<App />)
    await record()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry Refinement' })))
    expect(screen.getByRole('alert').textContent).toMatch(/Refinement failed/)
    expect(screen.getByLabelText('Raw transcript').value).toBe(MIXED_RAW)
  })

  it('Record Again clears the results and starts a new recording', async () => {
    render(<App />)
    await record()

    await startRecording('Record Again')
    expect(state()).toBe('recording')
    expect(screen.queryByLabelText('Raw transcript')).toBeNull()

    await stopRecording()
    expect(calls('/api/process')).toHaveLength(2)
    expect(media.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true)
  })

  it('shows the server error message in the error state', async () => {
    processResponse = () => jsonResponse({ error: 'No speech was detected in the recording.', code: 'no_speech' }, 422)
    render(<App />)
    await record()

    expect(state()).toBe('error')
    expect(screen.getByRole('alert').textContent).toBe('No speech was detected in the recording.')
    expect(screen.queryByLabelText('Raw transcript')).toBeNull()
  })

  it('shows a network error when the server is unreachable', async () => {
    processResponse = () => Promise.reject(new TypeError('Failed to fetch'))
    render(<App />)
    await record()

    expect(screen.getByRole('alert').textContent).toMatch(/Could not reach the server/)
  })

  it('keeps English text in an English-tagged field', async () => {
    processResponse = () =>
      jsonResponse(processResult({ rawTranscript: 'Um, hello.', polishedTranscript: 'Hello.', selectedLanguage: 'en' }))
    render(<App />)
    await record()

    expect(screen.getByLabelText('Polished text').lang).toBe('en')
  })
})
