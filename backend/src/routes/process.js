import { Router } from 'express'
import multer from 'multer'
import { ApiError } from '../lib/errors.js'
import { MAX_AUDIO_BYTES, identifyAudio } from '../lib/audio.js'
import { audioDurationSeconds } from '../lib/duration.js'
import { resolveRefinementLevel } from '../lib/refinementLevels.js'
import { transcribeAudio } from '../services/transcription.js'
import { refineTranscript } from '../services/refinement.js'

// Audio is held in memory only for the duration of the request and never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
})

// The browser stops recording at 2 minutes; the margin covers container overhead.
export const MAX_RECORDING_SECONDS = 125

// receive: from the request's headers arriving to its whole body being read. Any part of the
// upload a proxy buffered before forwarding the request is not seen here.
function receiveAudio(req, res, next) {
  const { timing } = res.locals
  upload.single('audio')(req, res, (err) => {
    timing.record('receive', timing.elapsed(), err ? 'failed' : 'success')
    // The browser sends its request ID before the audio, so it is known even when the audio fails.
    timing.setRequestId(req.body?.requestId)
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(413, 'file_too_large', 'The recording is larger than the 10 MB limit.'))
    }
    if (err instanceof multer.MulterError) {
      return next(new ApiError(400, 'invalid_upload', 'The upload could not be read. Send one audio file in the "audio" field.'))
    }
    next(err)
  })
}

// Checks everything about the upload before any usage is counted or OpenAI is called.
async function validateUpload(req, res, next) {
  try {
    const refinementLevel = resolveRefinementLevel(req.body?.refinementLevel)
    if (!req.file) {
      throw new ApiError(400, 'missing_audio', 'No recording was received.')
    }
    if (req.file.size === 0) {
      throw new ApiError(400, 'empty_audio', 'The recording is empty.')
    }
    const format = identifyAudio(req.file.buffer, req.file.mimetype)
    if (!format) {
      throw new ApiError(415, 'unsupported_audio', 'Unsupported audio format. Please record again in a supported browser.')
    }
    const seconds = await audioDurationSeconds(req.file.buffer, format)
    if (seconds === null) {
      throw new ApiError(415, 'unreadable_audio', 'The recording could not be read. Please record again.')
    }
    if (seconds > MAX_RECORDING_SECONDS) {
      throw new ApiError(413, 'recording_too_long', 'The recording is longer than the 2-minute limit. Please record a shorter clip.')
    }
    res.locals.upload = { refinementLevel, format }
    next()
  } catch (err) {
    next(err)
  }
}

export function createProcessRouter({ config, getOpenAIClient, usageLimiters = [] }) {
  const router = Router()

  router.post('/process', receiveAudio, validateUpload, ...usageLimiters, async (req, res, next) => {
    try {
      const { refinementLevel, format } = res.locals.upload
      const { timing } = res.locals
      const client = getOpenAIClient()
      const rawTranscript = await timing.measure('transcription', () =>
        transcribeAudio({
          client,
          model: config.transcriptionModel,
          audio: { buffer: req.file.buffer, ...format },
        }),
      )

      // None skips refinement and returns the raw transcript as the polished text.
      // A refinement failure keeps the raw transcript; the client can retry via /api/refine.
      let polishedTranscript = rawTranscript
      let refinementStatus = 'skipped'
      if (refinementLevel === 'none') {
        timing.skip('refinement')
      } else {
        try {
          polishedTranscript = await timing.measure('refinement', () =>
            refineTranscript({
              client,
              model: config.refinementModel,
              transcript: rawTranscript,
              level: refinementLevel,
            }),
          )
          refinementStatus = 'success'
        } catch {
          polishedTranscript = null
          refinementStatus = 'failed'
        }
      }

      res.json({
        rawTranscript,
        polishedTranscript,
        refinementLevel,
        transcriptionStatus: 'success',
        refinementStatus,
        ...(config.exposeTimings ? { timings: timing.summary() } : {}),
      })
    } catch (err) {
      next(err)
    }
  })

  return router
}
