import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/App.jsx'
import { installMediaMocks, removeMediaMocks } from './mediaMocks.js'

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

describe('App', () => {
  let media
  let processResponse

  beforeEach(() => {
    vi.useFakeTimers()
    processResponse = () =>
      jsonResponse({
        rawTranscript: '我觉得我们应该用 PostgreSQL。',
        polishedTranscript: null,
        selectedLanguage: 'zh',
        transcriptionStatus: 'success',
        refinementStatus: 'skipped',
      })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => (url.endsWith('/api/process') ? processResponse() : jsonResponse({ status: 'ok' }))),
    )
    media = installMediaMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    removeMediaMocks()
  })

  async function record(ms = 2_000) {
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Recording' })))
    act(() => vi.advanceTimersByTime(ms))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' })))
  }

  function processCalls() {
    return fetch.mock.calls.filter(([url]) => url.endsWith('/api/process'))
  }

  it('defaults to Auto-detect', () => {
    render(<App />)
    expect(screen.getByLabelText('Auto-detect').checked).toBe(true)
  })

  it('changing the language during recording does not interfere, and the choice is uploaded', async () => {
    render(<App />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Recording' })))
    fireEvent.click(screen.getByLabelText('中文'))
    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByText('Recording')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' })))

    expect(media.tracks[0].stop).toHaveBeenCalled()
    const [, options] = processCalls()[0]
    expect(options.method).toBe('POST')
    expect(options.body.get('language')).toBe('zh')
    expect(options.body.get('audio').size).toBeGreaterThan(0)
    expect(options.body.get('audio').name).toBe('recording.webm')

    expect(screen.getByLabelText('Raw transcript').value).toBe('我觉得我们应该用 PostgreSQL。')
    expect(screen.getByLabelText('中文').checked).toBe(true)
  })

  it('sends auto by default', async () => {
    render(<App />)
    await record()
    expect(processCalls()[0][1].body.get('language')).toBe('auto')
  })

  it('shows the server error message and no transcript when transcription fails', async () => {
    processResponse = () => jsonResponse({ error: 'No speech was detected in the recording.', code: 'no_speech' }, 422)
    render(<App />)
    await record()

    expect(screen.getByRole('alert').textContent).toBe('No speech was detected in the recording.')
    expect(screen.queryByLabelText('Raw transcript')).toBeNull()
  })

  it('shows a network error when the server is unreachable', async () => {
    processResponse = () => Promise.reject(new TypeError('Failed to fetch'))
    render(<App />)
    await record()

    expect(screen.getByRole('alert').textContent).toMatch(/Could not reach the server/)
  })

  it('allows a second recording without refreshing', async () => {
    render(<App />)
    await record()
    await record()

    expect(processCalls()).toHaveLength(2)
    expect(media.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true)
  })
})
