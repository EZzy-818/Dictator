import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { editDistance, partialStability, streamPcm, transcriptionSession, wavFromPcm } from '../eval/realtime.js'

// A stand-in for the Realtime API: a delta per 2 frames, a completed transcript after commit.
function fakeServer({ finalText = 'hello world', deltas = ['hel', 'lo ', 'world'], completeDelayMs = 20, reject = null } = {}) {
  const server = new WebSocketServer({ port: 0 })
  const seen = { appends: 0, sessions: [], auth: null }
  server.on('connection', (socket, req) => {
    seen.auth = req.headers.authorization
    let sent = 0
    socket.on('message', (data) => {
      const event = JSON.parse(data.toString())
      if (event.type === 'session.update') {
        seen.sessions.push(event.session)
        if (reject) return socket.send(JSON.stringify({ type: 'error', error: { code: 'invalid_value', message: reject } }))
        return socket.send(JSON.stringify({ type: 'session.updated' }))
      }
      if (event.type === 'input_audio_buffer.append') {
        seen.appends += 1
        if (seen.appends % 2 === 0 && sent < deltas.length) {
          socket.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item_1', delta: deltas[sent++] }))
        }
      }
      if (event.type === 'input_audio_buffer.commit') {
        socket.send(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'item_1' }))
        setTimeout(() => socket.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item_1', transcript: finalText, usage: { type: 'duration', seconds: 1 } })), completeDelayMs)
      }
    })
  })
  return new Promise((resolve) => server.on('listening', () => resolve({ server, seen, url: `ws://127.0.0.1:${server.address().port}` })))
}

let open = []
afterEach(() => {
  for (const server of open) server.close()
  open = []
})

// 600 ms of silence at 24 kHz: 6 frames of 100 ms.
const pcm = Buffer.alloc(24_000 * 2 * 0.6)
const session = transcriptionSession({ model: 'gpt-live-transcribe', languages: ['zh', 'en', 'hi'] })

describe('streamPcm', () => {
  it('streams every frame, commits at Stop and returns the completed transcript', async () => {
    const { server, seen, url } = await fakeServer()
    open.push(server)
    let stopped = null
    const result = await streamPcm({ pcm, session, apiKey: 'k', url, speed: 20, onStop: (info) => (stopped = info) })
    expect(result.ok).toBe(true)
    expect(result.finalText).toBe('hello world')
    expect(seen.appends).toBe(6)
    expect(seen.auth).toBe('Bearer k')
    expect(seen.sessions[0].audio.input.turn_detection).toBeNull()
    expect(stopped.stopMs).toBe(result.stopMs)
    expect(result.finalMs).toBeGreaterThanOrEqual(15)
    expect(result.deltas.map((d) => d.text).join('')).toBe('hello world')
  })

  it('reports an API error from the session update', async () => {
    const { server, url } = await fakeServer({ reject: 'Turn detection is not supported for this transcription model.' })
    open.push(server)
    const result = await streamPcm({ pcm, session, apiKey: 'k', url, speed: 20 })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/invalid_value Turn detection/)
  })

  it('gives up when no transcript completes in time', async () => {
    const { server, url } = await fakeServer({ completeDelayMs: 500 })
    open.push(server)
    const result = await streamPcm({ pcm, session, apiKey: 'k', url, speed: 20, completeTimeoutMs: 50 })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('timeout')
  })

  it('can drop the connection mid-recording or never commit', async () => {
    const { server, url } = await fakeServer()
    open.push(server)
    const dropped = await streamPcm({ pcm, session, apiKey: 'k', url, speed: 1, dropAtMs: 250 })
    expect(dropped.error).toBe('dropped')
    expect(dropped.stopMs).toBeNull()
    const silent = await streamPcm({ pcm, session, apiKey: 'k', url, speed: 20, commit: false, completeTimeoutMs: 50 })
    expect(silent.error).toBe('not committed')
  })

  it('fails cleanly when nothing listens', async () => {
    const result = await streamPcm({ pcm, session, apiKey: 'k', url: 'ws://127.0.0.1:9', speed: 20 })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^socket:/)
  })
})

describe('partialStability', () => {
  const stream = (deltas, finalText) => ({ finalText, committed: ['a'], stopMs: 1000, audioStart: 0, deltas: deltas.map(([ms, text]) => ({ ms, item: 'a', text })) })

  it('scores partials that the final text kept as stable', () => {
    const s = partialStability(stream([[100, 'send the '], [900, 'invoice']], 'send the invoice'))
    expect(s.matchesFinal).toBe(true)
    expect(s.revision).toBe(0)
    expect(s.shownAtStop).toBe(1)
  })

  it('measures how much the final text corrected and how much came after Stop', () => {
    const s = partialStability(stream([[100, 'send the '], [1200, 'invoices']], 'send the invoice'))
    expect(s.matchesFinal).toBe(false)
    expect(s.revision).toBeCloseTo(1 / 16)
    expect(s.shownAtStop).toBeCloseTo(8 / 16)
  })

  it('compares code points, so Chinese counts per character', () => {
    expect(editDistance('纽约大学', '纽约大雪')).toBe(1)
  })
})

it('wraps PCM in a WAV header the transcription API accepts', () => {
  const wav = wavFromPcm(Buffer.alloc(48_000))
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
  expect(wav.readUInt32LE(24)).toBe(24_000)
  expect(wav.length).toBe(48_044)
})
