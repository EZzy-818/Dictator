import { Router } from 'express'
import { resolveRefinementLevel } from '../lib/refinementLevels.js'
import { refineTranscript, validateRefinementRequest } from '../services/refinement.js'

// Rejects invalid requests before any usage is counted.
function validateBody(req, res, next) {
  try {
    const { transcript, language, refinementLevel } = req.body ?? {}
    res.locals.refinementLevel = resolveRefinementLevel(refinementLevel)
    validateRefinementRequest(transcript, language)
    next()
  } catch (err) {
    next(err)
  }
}

// None needs no model call, so it answers before the usage limits and the API key check.
function returnUnrefined(req, res, next) {
  if (res.locals.refinementLevel !== 'none') return next()
  res.json({ polishedTranscript: req.body.transcript, refinementLevel: 'none' })
}

export function createRefineRouter({ config, getOpenAIClient, usageLimiters = [] }) {
  const router = Router()

  router.post('/refine', validateBody, returnUnrefined, ...usageLimiters, async (req, res, next) => {
    try {
      const { transcript, language } = req.body
      const { refinementLevel } = res.locals
      const polishedTranscript = await refineTranscript({
        client: getOpenAIClient(),
        model: config.refinementModel,
        transcript,
        language,
        level: refinementLevel,
      })
      res.json({ polishedTranscript, refinementLevel })
    } catch (err) {
      next(err)
    }
  })

  return router
}
