import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomUUID } from 'node:crypto'
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer,
} from '@playfusion/platform-lib'
import { z } from 'zod'
import { generateDraft, AiForbidden, AiCapReached, type Deps } from './application/draft.js'
import { AiInvalidDraft } from './validate.js'
import { defaultDeps } from './deps.js'

export { defaultDeps }

const auth0cfg = auth0ConfigFromEnv()
const verifier = auth0cfg ? createAuth0Verifier(auth0cfg) : undefined
const organizer = requireOrganizer({ auth0: verifier, allowPlatformAdmin: true })

const draftBody = z.object({
  description: z.string().min(1),
  answers: z.record(z.string()).optional(),
  sportId: z.string().optional(),
})

export function makeApp(deps: Deps): Hono {
  const app = new Hono()
  app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'OPTIONS'] }))

  app.post('/organizations/:orgId/assistant:draft', organizer, async (c) => {
    const body = draftBody.parse(await c.req.json().catch(() => ({})))
    try {
      return c.json(await generateDraft(deps)(c.req.param('orgId'), body))
    } catch (e) {
      if (e instanceof AiForbidden) return c.json({ code: 'AI_NOT_ENTITLED', message: e.message }, 403)
      if (e instanceof AiCapReached) return c.json({ code: 'AI_CAP_REACHED', message: e.message }, 429)
      if (e instanceof AiInvalidDraft) return c.json({ code: 'AI_INVALID_DRAFT', message: e.message }, 422)
      throw e
    }
  })

  app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any) })
  return app
}

import { handle } from 'hono/aws-lambda'
let cachedInner: ReturnType<typeof handle> | undefined
const getInner = () => (cachedInner ??= handle(makeApp(defaultDeps())))

export const handler = async (event: any, ctx: any) => {
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`
  const correlationId = event.headers?.['x-correlation-id'] ?? randomUUID()
  return withCorrelation(correlationId, async () => {
    checkpoint('o13-handler', 'START', { path: event.rawPath ?? event.path, correlationId: currentCorrelationId() })
    try { return await getInner()(event, ctx) }
    finally { checkpoint('o13-handler', 'STOP', {}) }
  })
}
