import { Router } from 'express'
import { refineTranscript, validateRefinementRequest } from '../services/refinement.js'

export function createRefineRouter({ config, getOpenAIClient }) {
  const router = Router()

  router.post('/refine', async (req, res, next) => {
    try {
      const { transcript, language } = req.body ?? {}
      validateRefinementRequest(transcript, language)

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
