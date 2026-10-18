import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEBOUNCE_MS, RESULT_MS, SLOW_MS, createController } from '../src/main/controller.js'
import { MESSAGES } from '../src/main/messages.js'

const recording = { blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm', durationMs: 2000 }

function setup(overrides = {}) {
  let clock = 1_000_000
  const states = []
  const deps = {
    recorder: { start: vi.fn(), stop: vi.fn(), cancel: vi.fn() },
    microphone: { ensureAccess: vi.fn(async () => 'granted') },
    transcribe: vi.fn(async () => ({ rawTranscript: 'um hello', polishedTranscript: 'Hello.', refinementStatus: 'success' })),
    copy: vi.fn(async () => true),
    getLevel: vi.fn(() => 'light'),
    onChange: (state) => states.push(state),
    now: () => clock,
    ...overrides,
  }
  const controller = createController(deps)
  const advance = (ms) => {
    clock += ms
    vi.advanceTimersByTime(ms)
  }
  // Presses far enough apart not to be debounced.
  const press = async () => {
    advance(DEBOUNCE_MS + 1)
    await controller.toggle()
  }
  return { controller, deps, states, press, advance, phase: () => controller.getState().phase }
}

// Start, let the recorder report it started, then stop and deliver the recording.
async function dictate(t) {
  await t.press()
  t.controller.recorderStarted()
  await t.press()
  await t.controller.recordingReady(recording)
}

beforeEach(() => vi.useFakeTimers())

describe('controller', () => {
  it('starts on the first press and stops on the second', async () => {
    const t = setup()
    await t.press()
    expect(t.deps.microphone.ensureAccess).toHaveBeenCalled()
    expect(t.deps.recorder.start).toHaveBeenCalledWith({ measure: false })
    expect(t.phase()).toBe('starting')
    t.controller.recorderStarted()
    expect(t.phase()).toBe('recording')
    await t.press()
    expect(t.deps.recorder.stop).toHaveBeenCalled()
    expect(t.phase()).toBe('processing')
  })

  it('copies refined text and reports it as refined', async () => {
    const t = setup()
    await dictate(t)
    expect(t.deps.transcribe).toHaveBeenCalledWith(recording, 'light')
    expect(t.deps.copy).toHaveBeenCalledWith('Hello.')
    expect(t.controller.getState()).toMatchObject({ phase: 'done', outcome: 'refined', message: MESSAGES.copied })
    t.advance(RESULT_MS.refined)
    expect(t.phase()).toBe('idle')
  })

  it('copies the raw transcript when refinement failed, as a distinct outcome', async () => {
    const t = setup({ transcribe: vi.fn(async () => ({ rawTranscript: 'um hello', polishedTranscript: null, refinementStatus: 'failed' })) })
    await dictate(t)
    expect(t.deps.copy).toHaveBeenCalledWith('um hello')
    expect(t.controller.getState()).toMatchObject({ outcome: 'raw', message: MESSAGES.copiedRaw })
  })

  it('copies the raw transcript for None (skipped refinement)', async () => {
    const t = setup({
      getLevel: () => 'none',
      transcribe: vi.fn(async () => ({ rawTranscript: 'um hello', polishedTranscript: 'um hello', refinementStatus: 'skipped' })),
    })
    await dictate(t)
    expect(t.deps.transcribe).toHaveBeenCalledWith(recording, 'none')
    expect(t.deps.copy).toHaveBeenCalledWith('um hello')
    expect(t.controller.getState().outcome).toBe('refined')
  })

  it('leaves the clipboard alone when transcription fails', async () => {
    const error = Object.assign(new Error('Could not reach the server.'), { code: 'network_error' })
    const t = setup({ transcribe: vi.fn(async () => Promise.reject(error)) })
    await dictate(t)
    expect(t.deps.copy).not.toHaveBeenCalled()
    expect(t.controller.getState()).toMatchObject({ outcome: 'failed', message: 'Could not reach the server.', code: 'network_error' })
  })

  it('copies nothing when no speech was recognized', async () => {
    const t = setup({ transcribe: vi.fn(async () => ({ rawTranscript: '  ', polishedTranscript: '', refinementStatus: 'success' })) })
    await dictate(t)
    expect(t.deps.copy).not.toHaveBeenCalled()
    expect(t.controller.getState()).toMatchObject({ outcome: 'failed', code: 'no_speech' })
  })

  it('reports a clipboard failure and can copy the transcript again', async () => {
    const copy = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const t = setup({ copy })
    await dictate(t)
    expect(t.controller.getState()).toMatchObject({ outcome: 'copy_failed', code: 'clipboard' })
    expect(t.controller.getLastTranscript()).toBe('Hello.')
    expect(await t.controller.copyLast()).toBe(true)
    expect(copy).toHaveBeenLastCalledWith('Hello.')
  })

  it('fails without recording when microphone access is denied', async () => {
    const t = setup({ microphone: { ensureAccess: vi.fn(async () => 'denied') } })
    await t.press()
    expect(t.deps.recorder.start).not.toHaveBeenCalled()
    expect(t.controller.getState()).toMatchObject({ phase: 'done', outcome: 'failed', code: 'permission-denied' })
  })

  it('shows recorder errors and copies nothing', async () => {
    const t = setup()
    await t.press()
    t.controller.recorderFailed('no-microphone')
    expect(t.controller.getState()).toMatchObject({ outcome: 'failed', code: 'no-microphone' })
    expect(t.deps.copy).not.toHaveBeenCalled()
  })

  it('ignores presses closer together than the debounce', async () => {
    const t = setup()
    await t.press()
    t.controller.recorderStarted()
    await t.controller.toggle()
    expect(t.phase()).toBe('recording')
    expect(t.deps.recorder.stop).not.toHaveBeenCalled()
  })

  it('ignores presses while transcribing and says so', async () => {
    let resolve
    const t = setup({ transcribe: vi.fn(() => new Promise((r) => (resolve = r))) })
    await t.press()
    t.controller.recorderStarted()
    await t.press()
    const pending = t.controller.recordingReady(recording)
    const before = t.states.length
    await t.press()
    expect(t.phase()).toBe('processing')
    expect(t.states.at(-1).notice).toBe(MESSAGES.busy)
    expect(t.states.length).toBe(before + 1)
    expect(t.deps.recorder.start).toHaveBeenCalledTimes(1)
    resolve({ rawTranscript: 'a', polishedTranscript: 'A.', refinementStatus: 'success' })
    await pending
    expect(t.controller.getState().outcome).toBe('refined')
  })

  it('cancels when pressed again before the microphone started', async () => {
    const t = setup()
    await t.press()
    await t.press()
    expect(t.deps.recorder.cancel).toHaveBeenCalled()
    expect(t.phase()).toBe('idle')
    // A late "started" from the cancelled recording changes nothing.
    t.controller.recorderStarted()
    expect(t.phase()).toBe('idle')
    expect(t.deps.recorder.cancel).toHaveBeenCalledTimes(2)
  })

  it('starts a new recording from a shown result', async () => {
    const t = setup()
    await dictate(t)
    await t.press()
    expect(t.phase()).toBe('starting')
    expect(t.deps.recorder.start).toHaveBeenCalledTimes(2)
  })

  it('processes a recording stopped by the 2-minute limit', async () => {
    const t = setup()
    await t.press()
    t.controller.recorderStarted()
    await t.controller.recordingReady(recording)
    expect(t.controller.getState().outcome).toBe('refined')
  })

  it('keeps what was said when interrupted mid-recording', async () => {
    const t = setup()
    await t.press()
    t.controller.recorderStarted()
    t.controller.interrupt()
    expect(t.deps.recorder.stop).toHaveBeenCalled()
    expect(t.phase()).toBe('processing')
    await t.controller.recordingReady(recording)
    expect(t.controller.getState().outcome).toBe('refined')
  })

  it('drops a recording interrupted before it started', async () => {
    const t = setup()
    await t.press()
    t.controller.interrupt()
    expect(t.deps.recorder.cancel).toHaveBeenCalled()
    expect(t.phase()).toBe('idle')
  })

  it('says the server may be waking up when transcription is slow', async () => {
    const t = setup({ transcribe: vi.fn(() => new Promise(() => {})) })
    await t.press()
    t.controller.recorderStarted()
    await t.press()
    t.controller.recordingReady(recording)
    t.advance(SLOW_MS)
    expect(t.controller.getState().message).toBe(MESSAGES.slow)
  })

  it('ends a dictation whose recorder page crashed', async () => {
    const t = setup()
    await t.press()
    t.controller.recorderStarted()
    t.controller.rendererLost()
    expect(t.controller.getState()).toMatchObject({ outcome: 'failed', code: 'recording-failed' })
  })

  it('lets a transcription in flight finish when the recorder page crashes', async () => {
    let resolve
    const t = setup({ transcribe: vi.fn(() => new Promise((r) => (resolve = r))) })
    await t.press()
    t.controller.recorderStarted()
    await t.press()
    const pending = t.controller.recordingReady(recording)
    t.controller.rendererLost()
    expect(t.phase()).toBe('processing')
    resolve({ rawTranscript: 'a', polishedTranscript: 'A.', refinementStatus: 'success' })
    await pending
    expect(t.controller.getState().outcome).toBe('refined')
  })

  it('uses the level chosen when recording started', async () => {
    let level = 'medium'
    const t = setup({ getLevel: () => level })
    await t.press()
    level = 'none'
    t.controller.recorderStarted()
    await t.press()
    await t.controller.recordingReady(recording)
    expect(t.deps.transcribe).toHaveBeenCalledWith(recording, 'medium')
  })
})
