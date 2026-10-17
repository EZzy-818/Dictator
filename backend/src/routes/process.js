import { Router } from 'express'
import multer from 'multer'
import { ApiError } from '../lib/errors.js'
import { MAX_AUDIO_BYTES, identifyAudio } from '../lib/audio.js'
import { audioDurationSeconds } from '../lib/duration.js'
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../lib/languages.js'
import { transcribeAudio } from '../services/transcription.js'
import { refineTranscript } from '../services/refinement.js'

// Audio is held in memory only for the duration of the request and never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
})

// The browser stops recording at 2 minutes; the margin covers container overhead.
export const MAX_RECORDING_SECONDS = 125

function receiveAudio(req, res, next) {
  upload.single('audio')(req, res, (err) => {
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
    const language = req.body?.language || DEFAULT_LANGUAGE
    if (!isSupportedLanguage(language)) {
      throw new ApiError(400, 'invalid_language', 'Unsupported language. Choose English, 中文, or Auto-detect.')
    }
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
    res.locals.upload = { language, format }
    next()
  } catch (err) {
    next(err)
  }
}

export function createProcessRouter({ config, getOpenAIClient, usageLimiters = [] }) {
  const router = Router()

  router.post('/process', receiveAudio, validateUpload, ...usageLimiters, async (req, res, next) => {
    try {
      const { language, format } = res.locals.upload
      const client = getOpenAIClient()
      const rawTranscript = await transcribeAudio({
        client,
        model: config.transcriptionModel,
        audio: { buffer: req.file.buffer, ...format },
        language,
      })

      // A refinement failure keeps the raw transcript; the client can retry via /api/refine.
      let polishedTranscript = null
      let refinementStatus = 'success'
      try {
        polishedTranscript = await refineTranscript({
          client,
          model: config.refinementModel,
          transcript: rawTranscript,
          language,
        })
      } catch {
        refinementStatus = 'failed'
      }

      res.json({
        rawTranscript,
        polishedTranscript,
        selectedLanguage: language,
        transcriptionStatus: 'success',
        refinementStatus,
      })
    } catch (err) {
      next(err)
    }
  })

  return router
}
