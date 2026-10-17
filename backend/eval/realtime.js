// Streaming client and partial-transcript metrics for the realtime benchmark
// (docs/realtime-benchmark.md). Benchmark code only: nothing in src/ uses it.
//
// One recording is streamed to an OpenAI Realtime transcription session the way the proposed
// app would: 24 kHz mono 16-bit PCM in frames, paced at real time, committed once at Stop (the
// realtime transcription models reject server turn detection). Every server event is timed.
import WebSocket from 'ws'

export const REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription'
export const SAMPLE_RATE = 24_000
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000

const DELTA = 'conversation.item.input_audio_transcription.delta'
const COMPLETED = 'conversation.item.input_audio_transcription.completed'
const FAILED = 'conversation.item.input_audio_transcription.failed'

/** The session.update body for one configuration. transcription: { model, prompt, languages, delay, ... }. */
export function transcriptionSession(transcription, { noiseReduction = null } = {}) {
  return {
    type: 'transcription',
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: SAMPLE_RATE },
        transcription,
        turn_detection: null,
        noise_reduction: noiseReduction ? { type: noiseReduction } : null,
      },
    },
  }
}

/**
 * Streams pcm (a Buffer of 24 kHz mono s16le) and resolves when the transcript of everything
 * committed at Stop is complete, or on failure. Never rejects.
 *
 * Times: connectMs and readyMs from the start of the call; firstDeltaMs and every delta's ms from
 * the first audio frame ("speech start"); stopMs is when the last frame was sent; finalMs (the
 * figure that matters) is from Stop to the completed transcript.
 *
 * Options for fault injection and timing:
 *   speed        1 sends audio in real time; higher is faster (tests only).
 *   dropAtMs     closes the socket this long after the first frame, as a lost connection would.
 *   commit       false never commits, so no transcript can complete.
 *   onStop(info) called once the last frame is sent, before the commit (the name check starts here).
 */
export function streamPcm({
  pcm,
  session,
  apiKey,
  url = REALTIME_URL,
  frameMs = 100,
  speed = 1,
  connectTimeoutMs = 10_000,
  completeTimeoutMs = 30_000,
  dropAtMs = null,
  commit = true,
  onStop = null,
  WebSocketImpl = WebSocket,
}) {
  return new Promise((resolve) => {
    const t0 = performance.now()
    const now = () => performance.now() - t0
    const result = {
      ok: false,
      error: null,
      audioMs: pcm.length / BYTES_PER_MS,
      connectMs: null,
      readyMs: null,
      audioStart: null,
      stopMs: null,
      firstDeltaMs: null,
      finalMs: null,
      deltas: [],
      committed: [],
      completed: {},
      finalText: null,
      usage: [],
      events: {},
    }
    let ws
    let finished = false
    let timer = null
    let pacer = null

    const finish = (error = null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      clearTimeout(pacer)
      result.ok = !error
      result.error = error
      try {
        ws?.terminate()
      } catch {
        // Already closed.
      }
      resolve(result)
    }

    // Done once every item committed at or after Stop has its completed transcript.
    const checkDone = () => {
      if (result.stopMs === null || !commit) return
      if (!result.committed.length || !result.committed.every((id) => result.completed[id])) return
      if (!result.committedAfterStop) return
      result.finalMs = now() - result.stopMs
      result.finalText = result.committed.map((id) => result.completed[id].text).join(' ').trim()
      finish()
    }

    const sendFrames = () => {
      result.audioStart = now()
      const frameBytes = Math.round(frameMs * BYTES_PER_MS)
      let offset = 0
      let index = 0
      const step = () => {
        if (finished) return
        if (dropAtMs !== null && now() - result.audioStart >= dropAtMs) return finish('dropped')
        if (offset >= pcm.length) {
          result.stopMs = now()
          onStop?.({ stopMs: result.stopMs })
          if (commit) ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
          timer = setTimeout(() => finish(commit ? 'timeout' : 'not committed'), completeTimeoutMs)
          return
        }
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.subarray(offset, offset + frameBytes).toString('base64') }))
        offset += frameBytes
        index += 1
        // Scheduled against the start, so timer drift does not stretch the recording.
        pacer = setTimeout(step, Math.max(0, result.audioStart + (index * frameMs) / speed - now()))
      }
      step()
    }

    try {
      ws = new WebSocketImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    } catch (err) {
      return finish(`connect: ${err.message}`)
    }
    timer = setTimeout(() => finish('connect timeout'), connectTimeoutMs)

    ws.on('open', () => {
      result.connectMs = now()
      ws.send(JSON.stringify({ type: 'session.update', session }))
    })
    ws.on('error', (err) => finish(`socket: ${err.message}`))
    ws.on('close', (code) => finish(result.stopMs === null ? `closed ${code} before Stop` : `closed ${code}`))
    ws.on('message', (data) => {
      let event
      try {
        event = JSON.parse(data.toString())
      } catch {
        return
      }
      const t = now()
      result.events[event.type] = (result.events[event.type] ?? 0) + 1
      if (event.type === 'error') return finish(`api: ${event.error?.code ?? ''} ${event.error?.message ?? ''}`.trim())
      if ((event.type === 'session.updated' || event.type === 'transcription_session.updated') && result.readyMs === null) {
        result.readyMs = t
        clearTimeout(timer)
        sendFrames()
        return
      }
      if (event.type === 'input_audio_buffer.committed') {
        result.committed.push(event.item_id)
        if (result.stopMs !== null) result.committedAfterStop = true
        return checkDone()
      }
      if (event.type === DELTA) {
        const ms = result.audioStart === null ? 0 : t - result.audioStart
        if (result.firstDeltaMs === null) result.firstDeltaMs = ms
        result.deltas.push({ ms, item: event.item_id, text: event.delta ?? '' })
        return
      }
      if (event.type === COMPLETED) {
        result.completed[event.item_id] = { text: event.transcript ?? '', ms: t - (result.stopMs ?? t) }
        if (event.usage) result.usage.push(event.usage)
        return checkDone()
      }
      if (event.type === FAILED) return finish(`transcription failed: ${event.error?.message ?? ''}`.trim())
    })
  })
}

// Levenshtein distance over code points, for comparing partial and final text.
export function editDistance(a, b) {
  const x = [...a]
  const y = [...b]
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const current = [i]
    for (let j = 1; j <= y.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[y.length]
}

const compact = (text) => text.normalize('NFKC').replace(/\s+/g, ' ').trim()

/**
 * How the partial transcript related to the final one, for one stream.
 *   joined        the deltas appended in order, per committed item
 *   matchesFinal  whether that is the final text (ignoring whitespace)
 *   revision      edit distance between them over the final's length: 0 means the partials never
 *                 had to be corrected
 *   shownAtStop   share of the final text's characters already shown as partials at Stop
 *   cumulative    whether deltas looked like whole-text snapshots rather than increments
 */
export function partialStability(stream) {
  if (!stream.finalText) return null
  const byItem = (deltas) => stream.committed.map((id) => deltas.filter((d) => d.item === id).map((d) => d.text).join('')).join(' ')
  const joined = byItem(stream.deltas)
  const atStop = byItem(stream.deltas.filter((d) => stream.stopMs === null || d.ms <= stream.stopMs - (stream.audioStart ?? 0)))
  const final = compact(stream.finalText)
  const texts = stream.deltas.map((d) => d.text)
  const cumulative = texts.length > 2 && texts.slice(1).every((text, i) => text.startsWith(texts[i]))
  return {
    joined,
    matchesFinal: compact(joined) === final,
    revision: final.length ? editDistance(compact(joined), final) / final.length : 0,
    shownAtStop: final.length ? Math.min(1, compact(atStop).length / final.length) : 0,
    cumulative,
    deltaCount: stream.deltas.length,
  }
}

/** A 16-bit mono WAV file around raw PCM, as the backend would send the name check. */
export function wavFromPcm(pcm, sampleRate = SAMPLE_RATE) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
