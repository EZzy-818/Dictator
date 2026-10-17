import { Router } from 'express'
import { refineTranscript, validateRefinementRequest } from '../services/refinement.js'

// Rejects invalid requests before any usage is counted.
function validateBody(req, res, next) {
  try {
    const { transcript, language } = req.body ?? {}
    validateRefinementRequest(transcript, language)
    next()
  } catch (err) {
    next(err)
  }
}

export function createRefineRouter({ config, getOpenAIClient, usageLimiters = [] }) {
  const router = Router()

  router.post('/refine', validateBody, ...usageLimiters, async (req, res, next) => {
    try {
      const { transcript, language } = req.body
      const polishedTranscript = await refineTranscript({
        client: getOpenAIClient(),
        model: config.refinementModel,
        transcript,
        language,
      })
      res.json({ polishedTranscript })
    } catch (err) {
      next(err)
    }
  })

  return router
}
