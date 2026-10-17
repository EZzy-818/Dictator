import { createHmac, randomBytes } from 'node:crypto'
import { MemoryStore, ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { ApiError } from './errors.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

// IPv6 clients are grouped by /56 subnet, since one user usually controls a whole subnet.
export function clientKey(req) {
  return ipKeyGenerator(req.ip ?? '')
}

// Logs identify a client by a keyed hash that changes on every restart, never by its address.
const salt = randomBytes(32)
export function clientTag(req) {
  return createHmac('sha256', salt).update(clientKey(req)).digest('hex').slice(0, 12)
}

export function formatWait(seconds) {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} seconds`
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60)
    return minutes === 1 ? '1 minute' : `${minutes} minutes`
  }
  const hours = Math.ceil(seconds / 3600)
  return hours === 1 ? 'about 1 hour' : `about ${hours} hours`
}

/**
 * Counting limits for one kind of request. All counters are fixed windows that start with the
 * first counted request. Each counter needs its own store; createStore(prefix) can return a
 * shared one (Redis) so limits survive restarts and hold across instances.
 */
export function createUsageLimiters({ name, noun, limits, createStore, log }) {
  const counters = [
    { id: 'minute', windowMs: MINUTE, limit: limits.perMinute, perClient: true },
    { id: 'day', windowMs: DAY, limit: limits.perDay, perClient: true },
    { id: 'global-day', windowMs: DAY, limit: limits.globalPerDay, perClient: false },
  ]
  return counters.map(({ id, windowMs, limit, perClient }) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      identifier: `${name}-${id}`,
      keyGenerator: perClient ? clientKey : () => 'all',
      store: createStore ? createStore(`dictator:${name}-${id}:`) : new MemoryStore(),
      handler: (req, res, next) => {
        const wait = formatWait(Math.max(0, (req.rateLimit.resetTime - Date.now()) / 1000))
        log({ event: 'limit', limit: `${name}-${id}`, client: clientTag(req) })
        const message =
          id === 'minute'
            ? `Too many ${noun} in a short time. Please wait ${wait} and try again.`
            : id === 'day'
              ? `You have reached today's limit of ${limit} ${noun}. Please try again in ${wait}.`
              : `Dictator has reached its usage limit for today. Please try again in ${wait}.`
        next(new ApiError(429, id === 'global-day' ? 'daily_limit_reached' : 'rate_limited', message))
      },
    }),
  )
}

/**
 * Caps requests in progress, overall and per client, so a few slow uploads cannot tie up the
 * server or open many OpenAI requests at once. A slot is freed when the response closes.
 */
export function concurrencyLimit({ maxTotal, maxPerClient, log }) {
  let total = 0
  const perClient = new Map()
  return (req, res, next) => {
    const key = clientKey(req)
    const mine = perClient.get(key) ?? 0
    if (total >= maxTotal) {
      log({ event: 'limit', limit: 'concurrent-total', client: clientTag(req) })
      res.set('Retry-After', '10')
      return next(new ApiError(503, 'server_busy', 'Dictator is busy right now. Please try again in a few seconds.'))
    }
    if (mine >= maxPerClient) {
      log({ event: 'limit', limit: 'concurrent-client', client: clientTag(req) })
      return next(new ApiError(429, 'too_many_concurrent', 'Please wait for your current request to finish.'))
    }
    total++
    perClient.set(key, mine + 1)
    res.once('close', () => {
      total--
      const left = perClient.get(key) - 1
      if (left > 0) perClient.set(key, left)
      else perClient.delete(key)
    })
    next()
  }
}
