import { Router } from 'express'
import { resolveRefinementLevel } from '../lib/refinementLevels.js'
import { refineTranscript, validateRefinementRequest } from '../services/refinement.js'

// Rejects invalid requests before any usage is counted.
function validateBody(req, res, next) {
  try {
    const { transcript, refinementLevel } = req.body ?? {}
    res.locals.refinementLevel = resolveRefinementLevel(refinementLevel)
    validateRefinementRequest(transcript)
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
      const { transcript } = req.body
      const { refinementLevel } = res.locals
      const polishedTranscript = await refineTranscript({
        client: getOpenAIClient(),
        model: config.refinementModel,
        transcript,
        level: refinementLevel,
      })
      res.json({ polishedTranscript, refinementLevel })
    } catch (err) {
      next(err)
    }
  })

  return router
}
