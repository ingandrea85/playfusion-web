import { z } from 'zod'
import type { DraftResponse } from './domain.js'

export class AiInvalidDraft extends Error {}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const HHMM = /^\d{2}:\d{2}$/
const YMD = /^\d{4}-\d{2}-\d{2}$/

const groupSchema = z.object({
  label: z.string().min(1),
  teamCount: z.number().int().positive(),
  field: z.string().optional(),
})

const scheduleSchema = z.object({
  fields: z.array(z.string().min(1)).min(1),
  periods: z.number().int().positive(),
  periodMinutes: z.number().int().positive(),
  breakMinutes: z.number().int().nonnegative(),
  dailyStart: z.string().regex(HHMM),
  groupsCount: z.number().int().nonnegative(),
  legs: z.enum(['SINGLE', 'HOME_AWAY']),
  finalsEnabled: z.boolean().optional(),
  finalsType: z.string().optional(),
  festivalUsePools: z.boolean().optional(),
  finalissimaField: z.string().optional(),
})

const draftSchema = z.object({
  event: z.object({
    name: z.string().min(1),
    sportId: z.string().min(1),
    participantType: z.enum(['team', 'individual']),
    format: z.enum(['groups', 'groups+bracket', 'bracket', 'festival']),
    categorie: z.array(z.string().min(1)).min(1),
    dates: z.object({ from: z.string().regex(YMD), to: z.string().regex(YMD) }),
    startTime: z.string().regex(HHMM).optional(),
    location: z.string().optional(),
    playbook: z.enum(['PB-1', 'PB-2']),
  }),
  groupsByCategory: z.record(z.object({ groups: z.array(groupSchema) })).optional(),
  schedule: scheduleSchema,
  rationale: z.string(),
  assumptions: z.array(z.string()),
})

const openQuestionsSchema = z.object({
  openQuestions: z.array(z.object({ field: z.string().min(1), question: z.string().min(1) })).min(1),
})

/** Extract the first {...} JSON object from possibly-chatty model output. */
function extractJson(raw: string): unknown {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AiInvalidDraft('nessun JSON nella risposta')
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { throw new AiInvalidDraft('JSON non valido') }
}

export function parseAndValidateDraft(raw: string): DraftResponse {
  const obj = extractJson(raw)

  const oq = openQuestionsSchema.safeParse(obj)
  if (oq.success) return { openQuestions: oq.data.openQuestions }

  const parsed = draftSchema.safeParse((obj as { draft?: unknown }).draft ?? obj)
  if (!parsed.success) throw new AiInvalidDraft(parsed.error.message)
  const draft = parsed.data

  // Domain rules the schema can't express structurally.
  const hasGironi = !!draft.groupsByCategory && Object.keys(draft.groupsByCategory).length > 0
  if (draft.event.format === 'festival' && draft.schedule.finalsEnabled === true)
    throw new AiInvalidDraft('festival non ha finali')
  if (draft.event.format === 'bracket' && hasGironi)
    throw new AiInvalidDraft('bracket non ha gironi')

  return { draft }
}
