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

  it('shows the header and defaults to Light refinement', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dictator' })).toBeTruthy()
    expect(screen.getByText('Think out loud. Get polished text instantly.')).toBeTruthy()
    expect(screen.getByText('Multilingual transcription and AI refinement for clearer, more concise writing.')).toBeTruthy()
    expect(screen.getByLabelText('Light').checked).toBe(true)
    expect(state()).toBe('idle')
  })

  it('shows empty panels and a disabled Copy before the first recording', () => {
    render(<App />)
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByLabelText('Raw transcript').value).toBe('')
    expect(screen.getByLabelText('Polished text').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Copy' }).disabled).toBe(true)
    expect(screen.queryByTestId('output-level')).toBeNull()
  })

  it('has exactly one Copy button and no Retry, Record Again or account controls', async () => {
    render(<App />)
    await record()

    const buttons = screen.getAllByRole('button').map((button) => button.textContent.trim() || button.getAttribute('aria-label'))
    expect(buttons).toEqual(['Start Recording', 'Copy'])
    expect(screen.queryByRole('button', { name: /retry|record again|account|profile|sign in/i })).toBeNull()
  })

  it('moves through recording, processing and completed states', async () => {
    let resolveProcess
    processResponse = () => new Promise((resolve) => (resolveProcess = resolve))
    render(<App />)

    await startRecording()
    expect(state()).toBe('recording')
    expect(screen.getByText('Recording')).toBeTruthy()

    await stopRecording()
    expect(state()).toBe('processing')
    expect(screen.getByText('Processing')).toBeTruthy()
    expect(screen.getByText('Transcribing and refining…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start Recording' }).disabled).toBe(true)

    await act(async () => resolveProcess(jsonResponse(processResult())))
    expect(state()).toBe('completed')
  })

  it('has no spoken-language setting and shows raw and polished text exactly', async () => {
    render(<App />)
    expect(screen.queryByText('Spoken language')).toBeNull()
    await record()

    expect(calls('/api/process')[0][1].body.has('language')).toBe(false)
    const raw = screen.getByLabelText('Raw transcript')
    expect(raw.value).toBe(MIXED_RAW)
    expect(raw.readOnly).toBe(true)
    expect(raw.lang).toBe('zh-CN')
    expect(screen.getByLabelText('Polished text').value).toBe(MIXED_POLISHED)
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
    expect(screen.getByRole('alert').textContent).toMatch(/Select the polished text/)
    expect(screen.getByLabelText('Polished text').value).toBe(MIXED_POLISHED)
  })

  it('keeps the raw transcript when refinement fails', async () => {
    processResponse = () => jsonResponse(processResult({ polishedTranscript: null, refinementStatus: 'failed' }))
    render(<App />)
    await record()

    expect(screen.getByLabelText('Raw transcript').value).toBe(MIXED_RAW)
    expect(screen.getByRole('alert').textContent).toMatch(/Refinement failed/)
    expect(screen.getByLabelText('Polished text').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Copy' }).disabled).toBe(true)
  })

  it('offers only Copy under the polished text; Start Recording records again', async () => {
    render(<App />)
    await record()

    expect(screen.queryByRole('button', { name: /Retry|Regenerate/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record Again' })).toBeNull()

    await startRecording()
    expect(state()).toBe('recording')
    expect(screen.getByLabelText('Raw transcript').value).toBe('')
    expect(screen.getByLabelText('Polished text').value).toBe('')

    await stopRecording()
    expect(calls('/api/process')).toHaveLength(2)
    expect(calls('/api/refine')).toHaveLength(0)
  })

  it('shows the server error message in the error state', async () => {
    processResponse = () => jsonResponse({ error: 'No speech was detected in the recording.', code: 'no_speech' }, 422)
    render(<App />)
    await record()

    expect(state()).toBe('error')
    expect(screen.getByRole('alert').textContent).toBe('No speech was detected in the recording.')
    expect(screen.getByText('Error')).toBeTruthy()
    expect(screen.getByLabelText('Raw transcript').value).toBe('')
    expect(screen.getByRole('button', { name: 'Copy' }).disabled).toBe(true)
  })

  it('shows a network error when the server is unreachable', async () => {
    processResponse = () => Promise.reject(new TypeError('Failed to fetch'))
    render(<App />)
    await record()

    expect(screen.getByRole('alert').textContent).toMatch(/Could not reach the server/)
  })

  it('cannot start a second recording while one is being processed', async () => {
    processResponse = () => new Promise(() => {})
    render(<App />)
    await record()

    const start = screen.getByRole('button', { name: 'Start Recording' })
    expect(start.disabled).toBe(true)
    await act(async () => fireEvent.click(start))
    expect(media.getUserMedia).toHaveBeenCalledTimes(1)
  })

  describe('refinement levels', () => {
    it('defaults to Light and says what it does', () => {
      render(<App />)
      expect(screen.getByLabelText('Light').checked).toBe(true)
      expect(screen.getByLabelText('None').checked).toBe(false)
      expect(screen.getByLabelText('Medium').checked).toBe(false)
      expect(screen.getByText('Clean up filler words and grammar')).toBeTruthy()

      fireEvent.click(screen.getByLabelText('Medium'))
      expect(screen.getByLabelText('Medium').checked).toBe(true)
      expect(screen.getByText('Improve clarity and conciseness')).toBeTruthy()

      fireEvent.click(screen.getByLabelText('None'))
      expect(screen.getByText('No changes')).toBeTruthy()
    })

    it('sends Light by default and labels the output', async () => {
      render(<App />)
      await record()

      expect(calls('/api/process')[0][1].body.get('refinementLevel')).toBe('light')
      expect(screen.getByTestId('output-level').textContent).toBe('Light refinement')
    })

    it.each(['none', 'medium'])('sends %s when it is selected', async (level) => {
      processResponse = () => jsonResponse(processResult({ refinementLevel: level }))
      render(<App />)
      fireEvent.click(screen.getByLabelText(level === 'none' ? 'None' : 'Medium'))
      await record()

      expect(calls('/api/process')[0][1].body.get('refinementLevel')).toBe(level)
    })

    it('shows the raw transcript as the polished text for None', async () => {
      processResponse = () =>
        jsonResponse(processResult({ polishedTranscript: MIXED_RAW, refinementLevel: 'none', refinementStatus: 'skipped' }))
      render(<App />)
      fireEvent.click(screen.getByLabelText('None'))
      await record()

      expect(screen.getByLabelText('Polished text').value).toBe(MIXED_RAW)
      expect(screen.getByLabelText('Polished text').disabled).toBe(false)
      expect(screen.getByTestId('output-level').textContent).toBe('No refinement')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('switching levels while recording does not interrupt the recording', async () => {
      render(<App />)
      await startRecording()
      fireEvent.click(screen.getByLabelText('Medium'))
      fireEvent.click(screen.getByLabelText('None'))
      expect(state()).toBe('recording')
      expect(media.tracks.some((track) => track.stop.mock.calls.length > 0)).toBe(false)

      // The level selected when the recording stops is the one used.
      fireEvent.click(screen.getByLabelText('Medium'))
      await stopRecording()
      expect(calls('/api/process')[0][1].body.get('refinementLevel')).toBe('medium')
    })

    it('captures the level when processing begins', async () => {
      let resolveProcess
      processResponse = () => new Promise((resolve) => (resolveProcess = resolve))
      render(<App />)
      await record()
      fireEvent.click(screen.getByLabelText('None'))

      await act(async () => resolveProcess(jsonResponse(processResult({ refinementLevel: 'light' }))))
      expect(calls('/api/process')[0][1].body.get('refinementLevel')).toBe('light')
      expect(screen.getByTestId('output-level').textContent).toBe('Light refinement')
      // The new selection applies to the next recording, not to this result.
      expect(screen.getByLabelText('Polished text').value).toBe(MIXED_POLISHED)
    })

    it('says only Transcribing while a None recording is processed', async () => {
      processResponse = () => new Promise(() => {})
      render(<App />)
      fireEvent.click(screen.getByLabelText('None'))
      await record()
      expect(screen.getByText('Transcribing…')).toBeTruthy()
    })
  })

  it('tags Hindi text as Hindi', async () => {
    processResponse = () =>
      jsonResponse(processResult({ rawTranscript: 'उम, कल मीटिंग है।', polishedTranscript: 'कल मीटिंग है।' }))
    render(<App />)
    await record()

    expect(screen.getByLabelText('Polished text').lang).toBe('hi')
  })

  it('keeps English text in an English-tagged field', async () => {
    processResponse = () =>
      jsonResponse(processResult({ rawTranscript: 'Um, hello.', polishedTranscript: 'Hello.' }))
    render(<App />)
    await record()

    expect(screen.getByLabelText('Polished text').lang).toBe('en')
  })
  it('warns when the server cannot be reached and clears the warning once a recording succeeds', async () => {
    const healthy = fetch.getMockImplementation()
    fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/api/health')) throw new TypeError('Failed to fetch')
      return healthy(url, options)
    })
    render(<App />)
    await act(async () => {})
    expect(screen.getByRole('alert').textContent).toMatch(/not responding/)

    await record()
    expect(state()).toBe('completed')
    expect(screen.queryByText(/not responding/)).toBeNull()
  })

  it('warns when the server reports that OpenAI is not configured', async () => {
    const healthy = fetch.getMockImplementation()
    fetch.mockImplementation(async (url, options) =>
      url.endsWith('/api/health') ? jsonResponse({ status: 'ok', openaiConfigured: false }) : healthy(url, options),
    )
    render(<App />)
    await act(async () => {})
    expect(screen.getByText(/not responding/)).toBeTruthy()
  })

  it('shows no server warning or developer status when the server is healthy', async () => {
    render(<App />)
    await act(async () => {})
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/Backend:/)).toBeNull()
  })

  it('explains how audio is handled', () => {
    render(<App />)
    expect(screen.getByText(/sent to the Dictator server and to OpenAI/)).toBeTruthy()
    expect(screen.getByText('How your audio is handled')).toBeTruthy()
    expect(screen.getByText(/never saved to disk/)).toBeTruthy()
  })

  describe('latency panel', () => {
    afterEach(() => localStorage.clear())

    const panel = () => screen.queryByRole('complementary', { name: 'Dictator Performance' })

    async function recordAndPaint() {
      await record()
      // The display mark is taken after the next animation frame.
      await act(async () => vi.advanceTimersByTime(100))
    }

    it('is hidden from regular visitors and still sends a request ID', async () => {
      render(<App />)
      await record()
      expect(panel()).toBeNull()
      expect(calls('/api/process')[0][1].body.get('requestId')).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    })

    it('shows every stage, the total and the slowest stage after a recording', async () => {
      localStorage.setItem('dictator.latencyPanel', 'on')
      const timings = {
        requestId: 'x',
        totalMs: 2000,
        receiveMs: 20,
        receiveStatus: 'success',
        transcriptionMs: 1500,
        transcriptionStatus: 'success',
        refinementMs: 450,
        refinementStatus: 'success',
        overheadMs: 30,
      }
      processResponse = () => jsonResponse(processResult({ timings }))
      render(<App />)
      await recordAndPaint()

      const text = panel().textContent
      for (const label of ['Audio finalization', 'Upload (server receive)', 'Network & proxy', 'Transcription API', 'AI refinement API', 'Backend overhead', 'Frontend display', 'Total latency']) {
        expect(text).toContain(label)
      }
      expect(text).toContain('1,500 ms')
      expect(text).toContain('450 ms')
      expect(screen.getByText('Transcription API').closest('tr').textContent).toContain('slowest')
      expect(text).not.toContain(MIXED_RAW)
      expect(text).not.toContain(MIXED_POLISHED)
    })

    it('shows refinement as skipped at None', async () => {
      localStorage.setItem('dictator.latencyPanel', 'on')
      processResponse = () => jsonResponse(processResult({ refinementStatus: 'skipped', refinementLevel: 'none' }))
      render(<App />)
      fireEvent.click(screen.getByLabelText('None'))
      await recordAndPaint()
      expect(screen.getByText('AI refinement API').closest('tr').textContent).toContain('0 ms · skipped')
    })

    it('records failed requests with the server stage that failed', async () => {
      localStorage.setItem('dictator.latencyPanel', 'on')
      processResponse = () =>
        jsonResponse(
          {
            error: 'Transcription failed. Please try again.',
            code: 'transcription_failed',
            timings: { totalMs: 700, receiveMs: 10, receiveStatus: 'success', transcriptionMs: 650, transcriptionStatus: 'failed', refinementMs: null, refinementStatus: 'not_run', overheadMs: 40 },
          },
          502,
        )
      render(<App />)
      await recordAndPaint()

      expect(panel().textContent).toContain('failed')
      expect(screen.getByText('Transcription API').closest('tr').textContent).toContain('650 ms · failed')
      expect(screen.getByText('AI refinement API').closest('tr').textContent).toContain('not run')
      expect(panel().textContent).toContain('transcription_failed')
    })
  })
})
