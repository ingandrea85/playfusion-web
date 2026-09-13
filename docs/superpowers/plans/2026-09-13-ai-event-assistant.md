# AI Event-Configuration Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paid-only AI assistant that turns a natural-language description into a validated, ready-to-apply event configuration draft at creation time.

**Architecture:** New bounded-context service `o13-assistant` (Hono/Lambda) that reads the org plan, enforces a monthly usage cap, calls AWS Bedrock (Claude Haiku 4.5, eu-south-1), and returns a validated `EventDraft` (or completion questions). The service never mutates domain stores — the E1 frontend applies the approved draft through existing endpoints (`o3.createEvent` → `o3.drawGironi` → `o7.generateSchedule`). Gating uses the existing `libs/entitlements` table, extended with `hasAiAssistant`, and enforced backend-side (the project's first real backend entitlement guard).

**Tech Stack:** TypeScript ESM, Nx monorepo, Hono on AWS Lambda, `@aws-sdk/client-bedrock-runtime`, DynamoDB (`@aws-sdk/lib-dynamodb`), zod, Vitest, AWS CDK, vanilla-TS SPA (e1-web).

**Spec:** `docs/superpowers/specs/2026-09-13-ai-event-assistant-design.md`

## Global Constraints

- Provider: **AWS Bedrock**, region **`eu-south-1`**, default model id `eu.anthropic.claude-haiku-4-5-20251001-v1:0` (injectable via env `O13_MODEL_ID`). No external SaaS.
- Paywall entitlement `hasAiAssistant` on **CLUB+**; monthly cap **TRIAL 5 · CLUB 20 · ENTERPRISE unlimited (null)**. `null` = unlimited (existing convention from `maxActiveEvents`).
- The AI **proposes**; the frontend **applies**. No irreversible action without explicit user confirmation.
- Backend enforcement order: entitlement → cap → generate → validate; **count only successful generations**.
- DynamoDB table naming: `resourceName(base)` → `playfusion2-<base>-<env>` (from `@playfusion/platform-lib`).
- All user-facing copy is **Italian**.
- Tests run via the root Vitest `unit` project (`npm test`); a single service runs with `npx vitest run services/o13-assistant`. Services have **no** per-service `test` script; `libs/entitlements` **does** (`vitest run`).
- Money/PII: never log full prompts; log only correlation id + token counts (out of scope to build logging here — just don't add prompt logging).

---

### Task 1: Entitlements — `hasAiAssistant` + cap function

**Files:**
- Modify: `libs/entitlements/src/index.ts`
- Test: `libs/entitlements/test/index.test.ts`

**Interfaces:**
- Consumes: existing `Plan`, `entitlements(plan)`.
- Produces: `Entitlements.hasAiAssistant: boolean`, `Entitlements.aiAssistantMonthlyCap: number | null`, and `aiAssistantCap(plan, status): number | null`.

- [ ] **Step 1: Write the failing tests**

Append to `libs/entitlements/test/index.test.ts`:
```ts
import { aiAssistantCap } from '../src/index.js'

describe('aiAssistantCap', () => {
  it('FREE and STARTER have no AI assistant (cap 0)', () => {
    expect(aiAssistantCap('FREE', 'ACTIVE')).toBe(0)
    expect(aiAssistantCap('STARTER', 'ACTIVE')).toBe(0)
  })
  it('CLUB active gets 20, ENTERPRISE unlimited (null)', () => {
    expect(aiAssistantCap('CLUB', 'ACTIVE')).toBe(20)
    expect(aiAssistantCap('ENTERPRISE', 'ACTIVE')).toBe(null)
  })
  it('a CLUB trial gets the reduced cap of 5', () => {
    expect(aiAssistantCap('CLUB', 'TRIAL')).toBe(5)
  })
  it('an unknown plan is not entitled (cap 0) regardless of status', () => {
    expect(aiAssistantCap('WHATEVER', 'TRIAL')).toBe(0)
    expect(aiAssistantCap(undefined, 'ACTIVE')).toBe(0)
  })
})

describe('entitlements — AI flags', () => {
  it('CLUB unlocks the AI assistant, FREE does not', () => {
    expect(entitlements('CLUB')).toMatchObject({ hasAiAssistant: true, aiAssistantMonthlyCap: 20 })
    expect(entitlements('FREE')).toMatchObject({ hasAiAssistant: false, aiAssistantMonthlyCap: 0 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run libs/entitlements`
Expected: FAIL — `aiAssistantCap` is not exported; `hasAiAssistant` missing.

- [ ] **Step 3: Implement**

In `libs/entitlements/src/index.ts`, add two fields to the `Entitlements` interface (after `hasBusinessFeatures`):
```ts
  hasAiAssistant: boolean
  aiAssistantMonthlyCap: number | null   // null = unlimited (used for ACTIVE plans)
```
Add both fields to every row of `TABLE`:
```ts
  FREE:       { …, hasBusinessFeatures: false, hasAiAssistant: false, aiAssistantMonthlyCap: 0 },
  STARTER:    { …, hasBusinessFeatures: false, hasAiAssistant: false, aiAssistantMonthlyCap: 0 },
  CLUB:       { …, hasBusinessFeatures: false, hasAiAssistant: true,  aiAssistantMonthlyCap: 20 },
  ENTERPRISE: { …, hasBusinessFeatures: true,  hasAiAssistant: true,  aiAssistantMonthlyCap: null },
```
Add the exported function at the end of the file:
```ts
/** Monthly AI-assistant generation cap. 0 = not entitled, null = unlimited.
 *  A trial (status TRIAL) of an entitled plan gets a reduced taster cap. */
export function aiAssistantCap(
  plan: Plan | string | undefined | null,
  status: string | undefined | null,
): number | null {
  const ent = entitlements(plan)
  if (!ent.hasAiAssistant) return 0
  if (status === 'TRIAL') return 5
  return ent.aiAssistantMonthlyCap
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run libs/entitlements`
Expected: PASS (new + existing tests green).

- [ ] **Step 5: Commit**

```bash
git add libs/entitlements/src/index.ts libs/entitlements/test/index.test.ts
git commit -m "feat(entitlements): add hasAiAssistant + aiAssistantCap(plan,status)"
```

---

### Task 2: o13 domain types + prompt builder (pure)

**Files:**
- Create: `services/o13-assistant/src/domain.ts`
- Create: `services/o13-assistant/src/prompt.ts`
- Create: `services/o13-assistant/package.json`
- Create: `services/o13-assistant/tsconfig.json`
- Test: `services/o13-assistant/test/prompt.test.ts`

**Interfaces:**
- Produces (domain.ts): types `EventFormat`, `EventDraftCore`, `DraftGroup`, `ScheduleConfigDraft`, `EventDraft`, `OpenQuestion`, `DraftResponse`, `DraftInput`.
- Produces (prompt.ts): `buildPrompt(input: DraftInput): string`.

- [ ] **Step 1: Create the package scaffolding**

`services/o13-assistant/package.json`:
```json
{
  "name": "o13-assistant",
  "version": "0.0.0",
  "type": "module",
  "dependencies": {
    "@playfusion/platform-lib": "*",
    "@playfusion/entitlements": "*",
    "hono": "^4.5.0",
    "zod": "^3.23.0",
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/lib-dynamodb": "^3.600.0",
    "@aws-sdk/client-bedrock-runtime": "^3.600.0"
  },
  "scripts": { "build": "tsc -p tsconfig.json", "lint": "eslint ." },
  "nx": { "tags": ["scope:service", "type:service"] }
}
```
`services/o13-assistant/tsconfig.json`:
```json
{ "extends": "../../tsconfig.backend.json", "compilerOptions": { "rootDir": "src", "outDir": "dist" }, "include": ["src"] }
```
> Note: confirm `@playfusion/entitlements` is the package name (check `libs/entitlements/package.json` `name`). If it differs, use the actual name in the import and dependency.

- [ ] **Step 2: Write the domain types**

`services/o13-assistant/src/domain.ts`:
```ts
export type EventFormat = 'groups' | 'groups+bracket' | 'bracket' | 'festival'

export interface EventDraftCore {
  name: string
  sportId: string
  participantType: 'team' | 'individual'
  format: EventFormat
  categorie: string[]
  dates: { from: string; to: string }
  startTime?: string
  location?: string
  playbook: 'PB-1' | 'PB-2'
}

export interface DraftGroup { label: string; teamCount: number; field?: string }

/** The subset of o7 ScheduleConfig the assistant fills. Mirrors rest-client ScheduleConfig. */
export interface ScheduleConfigDraft {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  dailyStart: string        // HH:mm
  groupsCount: number
  legs: 'SINGLE' | 'HOME_AWAY'
  finalsEnabled?: boolean
  finalsType?: string
  festivalUsePools?: boolean
  finalissimaField?: string
}

export interface EventDraft {
  event: EventDraftCore
  groupsByCategory?: Record<string, { groups: DraftGroup[] }>
  schedule: ScheduleConfigDraft
  rationale: string
  assumptions: string[]
}

export interface OpenQuestion { field: string; question: string }

/** The model returns EITHER a draft OR completion questions. */
export interface DraftResponse { draft?: EventDraft; openQuestions?: OpenQuestion[] }

export interface DraftInput {
  description: string
  answers?: Record<string, string>
  sportId?: string
}
```

- [ ] **Step 3: Write the failing prompt test**

`services/o13-assistant/test/prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/prompt.js'

describe('buildPrompt', () => {
  it('embeds the description and demands strict JSON with the two allowed shapes', () => {
    const p = buildPrompt({ description: '24 squadre U10, 3 campi' })
    expect(p).toContain('24 squadre U10, 3 campi')
    expect(p).toContain('"draft"')
    expect(p).toContain('"openQuestions"')
    expect(p).toMatch(/festival/i)          // lists the allowed formats
    expect(p).toContain('groupsByCategory')  // documents the structural (teamCount) contract
  })
  it('includes prior answers when re-submitted', () => {
    const p = buildPrompt({ description: 'festa', answers: { pools: '4 pool da 6' } })
    expect(p).toContain('4 pool da 6')
  })
  it('names the pre-selected sport when provided', () => {
    expect(buildPrompt({ description: 'x', sportId: 'rugby' })).toContain('rugby')
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run services/o13-assistant/test/prompt.test.ts`
Expected: FAIL — `buildPrompt` not found.

- [ ] **Step 5: Implement the prompt builder**

`services/o13-assistant/src/prompt.ts`:
```ts
import type { DraftInput } from './domain.js'

const SYSTEM = `Sei l'assistente di configurazione tornei di PlayFusion. Dato un torneo descritto in italiano,
produci UNA configurazione strutturata. Rispondi SOLO con JSON valido, senza testo attorno, in UNO di due formati:

1) Se hai abbastanza informazioni:
{"draft":{
  "event":{"name","sportId","participantType":"team|individual","format":"groups|groups+bracket|bracket|festival",
           "categorie":[...],"dates":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},"startTime":"HH:mm","location","playbook":"PB-1|PB-2"},
  "groupsByCategory":{"<categoria>":{"groups":[{"label","teamCount","field"}]}},
  "schedule":{"fields":[...],"periods","periodMinutes","breakMinutes","dailyStart":"HH:mm","groupsCount","legs":"SINGLE|HOME_AWAY","finalsEnabled","finalsType","festivalUsePools","finalissimaField"},
  "rationale":"spiegazione breve in italiano",
  "assumptions":["assunzione 1","..."]
}}

2) Se manca un dato ESSENZIALE (numero campi, durata giornata, numero pool/gironi):
{"openQuestions":[{"field":"fields","question":"Quanti campi hai a disposizione?"}]}

Regole di dominio: il formato "festival" (festa dello sport) NON ha finali né classifiche (finalsEnabled=false);
il formato "bracket" NON ha gironi (ometti groupsByCategory). Le squadre NON sono ancora iscritte: in
groupsByCategory indica solo la STRUTTURA con teamCount, mai nomi di squadre.`

export function buildPrompt(input: DraftInput): string {
  const parts = [SYSTEM, '', `Descrizione del torneo:`, input.description]
  if (input.sportId) parts.push('', `Sport preselezionato: ${input.sportId}`)
  if (input.answers && Object.keys(input.answers).length) {
    parts.push('', 'Risposte alle domande precedenti:')
    for (const [k, v] of Object.entries(input.answers)) parts.push(`- ${k}: ${v}`)
  }
  return parts.join('\n')
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run services/o13-assistant/test/prompt.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/o13-assistant/package.json services/o13-assistant/tsconfig.json services/o13-assistant/src/domain.ts services/o13-assistant/src/prompt.ts services/o13-assistant/test/prompt.test.ts
git commit -m "feat(o13): domain types + AI prompt builder"
```

---

### Task 3: o13 validation (zod + domain rules) + month key

**Files:**
- Create: `services/o13-assistant/src/validate.ts`
- Test: `services/o13-assistant/test/validate.test.ts`

**Interfaces:**
- Consumes: `DraftResponse`, `EventDraft`, `OpenQuestion` from `domain.js`.
- Produces: `parseAndValidateDraft(raw: string): DraftResponse` (throws `AiInvalidDraft` on malformed/illegal); `monthKey(d: Date): string`; error class `AiInvalidDraft extends Error`.

- [ ] **Step 1: Write the failing tests**

`services/o13-assistant/test/validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseAndValidateDraft, monthKey, AiInvalidDraft } from '../src/validate.js'

const validDraft = {
  draft: {
    event: { name: 'Festa U10', sportId: 'rugby', participantType: 'team', format: 'festival',
             categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, startTime: '09:00', playbook: 'PB-1' },
    groupsByCategory: { U10: { groups: [{ label: 'Pool A', teamCount: 6, field: 'Campo 1' }] } },
    schedule: { fields: ['Campo 1','Campo 2','Campo 3'], periods: 1, periodMinutes: 15, breakMinutes: 3,
                dailyStart: '09:00', groupsCount: 4, legs: 'SINGLE', finalsEnabled: false, festivalUsePools: true },
    rationale: '24 in 4 pool da 6', assumptions: ['niente finali'],
  },
}

describe('monthKey', () => {
  it('formats a date as YYYY-MM', () => {
    expect(monthKey(new Date('2026-09-13T10:00:00Z'))).toBe('2026-09')
    expect(monthKey(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01')
  })
})

describe('parseAndValidateDraft', () => {
  it('accepts a well-formed draft', () => {
    const out = parseAndValidateDraft(JSON.stringify(validDraft))
    expect(out.draft?.event.format).toBe('festival')
  })
  it('tolerates prose around the JSON (extracts the object)', () => {
    const out = parseAndValidateDraft('Ecco la bozza:\n' + JSON.stringify(validDraft) + '\nSpero vada bene.')
    expect(out.draft).toBeDefined()
  })
  it('returns openQuestions when the model asks for missing data', () => {
    const out = parseAndValidateDraft(JSON.stringify({ openQuestions: [{ field: 'fields', question: 'Quanti campi?' }] }))
    expect(out.openQuestions?.[0].field).toBe('fields')
    expect(out.draft).toBeUndefined()
  })
  it('rejects a festival draft that enables finals', () => {
    const bad = structuredClone(validDraft); bad.draft.schedule.finalsEnabled = true
    expect(() => parseAndValidateDraft(JSON.stringify(bad))).toThrow(AiInvalidDraft)
  })
  it('rejects a bracket draft that carries gironi', () => {
    const bad = structuredClone(validDraft)
    bad.draft.event.format = 'bracket'
    expect(() => parseAndValidateDraft(JSON.stringify(bad))).toThrow(AiInvalidDraft)
  })
  it('rejects an empty fields list', () => {
    const bad = structuredClone(validDraft); bad.draft.schedule.fields = []
    expect(() => parseAndValidateDraft(JSON.stringify(bad))).toThrow(AiInvalidDraft)
  })
  it('rejects non-JSON', () => {
    expect(() => parseAndValidateDraft('non ho capito')).toThrow(AiInvalidDraft)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o13-assistant/test/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`services/o13-assistant/src/validate.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/o13-assistant/test/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/o13-assistant/src/validate.ts services/o13-assistant/test/validate.test.ts
git commit -m "feat(o13): draft validation (zod + domain rules) + monthKey"
```

---

### Task 4: o13 ports + `generateDraft` use-case (guard/cap/generate/count)

**Files:**
- Create: `services/o13-assistant/src/ports.ts`
- Create: `services/o13-assistant/src/application/draft.ts`
- Test: `services/o13-assistant/test/draft.test.ts`

**Interfaces:**
- Produces (ports.ts): `SubscriptionReader { getPlanAndStatus(orgId): Promise<{ plan: string; status: string }> }`, `UsageStore { count(orgId, month): Promise<number>; increment(orgId, month): Promise<void> }`, `BedrockGateway { complete(prompt: string): Promise<string> }`.
- Produces (draft.ts): `type Deps = { subs; usage; ai; now? }`; `generateDraft(d: Deps) => (orgId, input: DraftInput) => Promise<DraftResponse>`; error classes `AiForbidden`, `AiCapReached`.
- Consumes: `buildPrompt`, `parseAndValidateDraft`, `monthKey`, `aiAssistantCap`.

- [ ] **Step 1: Write the ports**

`services/o13-assistant/src/ports.ts`:
```ts
export interface SubscriptionReader {
  getPlanAndStatus(organizationId: string): Promise<{ plan: string; status: string }>
}
export interface UsageStore {
  count(organizationId: string, month: string): Promise<number>
  increment(organizationId: string, month: string): Promise<void>
}
export interface BedrockGateway {
  complete(prompt: string): Promise<string>
}
```

- [ ] **Step 2: Write the failing tests**

`services/o13-assistant/test/draft.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { generateDraft, AiForbidden, AiCapReached } from '../src/application/draft.js'
import type { SubscriptionReader, UsageStore, BedrockGateway } from '../src/ports.js'

const DRAFT_JSON = JSON.stringify({ draft: {
  event: { name: 'F', sportId: 'rugby', participantType: 'team', format: 'festival',
           categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, playbook: 'PB-1' },
  schedule: { fields: ['C1'], periods: 1, periodMinutes: 15, breakMinutes: 3, dailyStart: '09:00',
              groupsCount: 1, legs: 'SINGLE', finalsEnabled: false },
  rationale: 'x', assumptions: [],
} })

const deps = (over: Partial<{ plan: string; status: string; used: number; raw: string }> = {}) => {
  const inc = vi.fn().mockResolvedValue(undefined)
  const subs: SubscriptionReader = { getPlanAndStatus: vi.fn().mockResolvedValue({ plan: over.plan ?? 'CLUB', status: over.status ?? 'ACTIVE' }) }
  const usage: UsageStore = { count: vi.fn().mockResolvedValue(over.used ?? 0), increment: inc }
  const ai: BedrockGateway = { complete: vi.fn().mockResolvedValue(over.raw ?? DRAFT_JSON) }
  return { subs, usage, ai, now: () => new Date('2026-09-13T00:00:00Z'), inc }
}

describe('generateDraft', () => {
  it('returns a draft and counts the successful generation', async () => {
    const d = deps()
    const out = await generateDraft(d)('org-1', { description: 'festa' })
    expect(out.draft?.event.format).toBe('festival')
    expect(d.inc).toHaveBeenCalledWith('org-1', '2026-09')
  })
  it('rejects an unentitled plan with AiForbidden and never calls Bedrock', async () => {
    const d = deps({ plan: 'FREE' })
    await expect(generateDraft(d)('org-1', { description: 'x' })).rejects.toBeInstanceOf(AiForbidden)
    expect(d.ai.complete).not.toHaveBeenCalled()
  })
  it('rejects when the monthly cap is reached (CLUB active = 20)', async () => {
    const d = deps({ used: 20 })
    await expect(generateDraft(d)('org-1', { description: 'x' })).rejects.toBeInstanceOf(AiCapReached)
    expect(d.ai.complete).not.toHaveBeenCalled()
  })
  it('a trial is capped at 5', async () => {
    const under = deps({ status: 'TRIAL', used: 4 })
    await expect(generateDraft(under)('o', { description: 'x' })).resolves.toBeDefined()
    const over = deps({ status: 'TRIAL', used: 5 })
    await expect(generateDraft(over)('o', { description: 'x' })).rejects.toBeInstanceOf(AiCapReached)
  })
  it('does NOT count a generation when the model returns completion questions', async () => {
    const d = deps({ raw: JSON.stringify({ openQuestions: [{ field: 'fields', question: 'Quanti campi?' }] }) })
    const out = await generateDraft(d)('o', { description: 'x' })
    expect(out.openQuestions).toHaveLength(1)
    expect(d.inc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run services/o13-assistant/test/draft.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the use-case**

`services/o13-assistant/src/application/draft.ts`:
```ts
import { aiAssistantCap } from '@playfusion/entitlements'
import type { DraftInput, DraftResponse } from '../domain.js'
import type { SubscriptionReader, UsageStore, BedrockGateway } from '../ports.js'
import { buildPrompt } from '../prompt.js'
import { parseAndValidateDraft, monthKey } from '../validate.js'

export class AiForbidden extends Error {}
export class AiCapReached extends Error {}

export type Deps = { subs: SubscriptionReader; usage: UsageStore; ai: BedrockGateway; now?: () => Date }

export function generateDraft(d: Deps) {
  return async (organizationId: string, input: DraftInput): Promise<DraftResponse> => {
    const { plan, status } = await d.subs.getPlanAndStatus(organizationId)
    const cap = aiAssistantCap(plan, status)
    if (cap === 0) throw new AiForbidden('AI assistant non incluso nel piano')

    const month = monthKey(d.now ? d.now() : new Date())
    const used = await d.usage.count(organizationId, month)
    if (cap !== null && used >= cap) throw new AiCapReached('tetto mensile raggiunto')

    const raw = await d.ai.complete(buildPrompt(input))
    const resp = parseAndValidateDraft(raw)     // throws AiInvalidDraft on malformed/illegal
    if (resp.draft) await d.usage.increment(organizationId, month)   // count only successful generations
    return resp
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run services/o13-assistant/test/draft.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/o13-assistant/src/ports.ts services/o13-assistant/src/application/draft.ts services/o13-assistant/test/draft.test.ts
git commit -m "feat(o13): generateDraft use-case (entitlement + cap + count)"
```

---

### Task 5: o13 adapters + deps + Hono handler

**Files:**
- Create: `services/o13-assistant/src/adapters/bedrock-gateway-live.ts`
- Create: `services/o13-assistant/src/adapters/dynamodb-usage-store.ts`
- Create: `services/o13-assistant/src/adapters/dynamodb-subscription-reader.ts`
- Create: `services/o13-assistant/src/deps.ts`
- Create: `services/o13-assistant/src/handler.ts`
- Test: `services/o13-assistant/test/handler.test.ts`
- Test: `services/o13-assistant/test/usage-store.test.ts`

**Interfaces:**
- Produces: `defaultDeps(): Deps`; `makeApp(deps: Deps): Hono`; `handler` (Lambda entry).
- Consumes: `generateDraft`, `AiForbidden`, `AiCapReached`, `AiInvalidDraft`.

- [ ] **Step 1: Write the adapters**

`services/o13-assistant/src/adapters/bedrock-gateway-live.ts`:
```ts
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import type { BedrockGateway } from '../ports.js'

const MODEL_ID = process.env.O13_MODEL_ID ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0'
const REGION = process.env.O13_BEDROCK_REGION ?? 'eu-south-1'

export function makeLiveBedrockGateway(): BedrockGateway {
  const client = new BedrockRuntimeClient({ region: REGION })
  return {
    async complete(prompt: string): Promise<string> {
      const out = await client.send(new ConverseCommand({
        modelId: MODEL_ID,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 2000, temperature: 0.2 },
      }))
      const block = out.output?.message?.content?.find((b) => typeof (b as { text?: string }).text === 'string')
      return (block as { text?: string } | undefined)?.text ?? ''
    },
  }
}
```
`services/o13-assistant/src/adapters/dynamodb-usage-store.ts`:
```ts
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { resourceName } from '@playfusion/platform-lib'
import type { UsageStore } from '../ports.js'

const NINETY_DAYS = 90 * 24 * 3600

export class DynamoUsageStore implements UsageStore {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o13-usage')) {}
  async count(organizationId: string, month: string): Promise<number> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { organizationId, month } }))
    return (res.Item as { count?: number } | undefined)?.count ?? 0
  }
  async increment(organizationId: string, month: string): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + NINETY_DAYS
    await this.db.send(new UpdateCommand({
      TableName: this.table, Key: { organizationId, month },
      UpdateExpression: 'SET #ttl = if_not_exists(#ttl, :ttl) ADD #c :one',
      ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': ttl },
    }))
  }
}
```
`services/o13-assistant/src/adapters/dynamodb-subscription-reader.ts` (reads o11's projection table directly — read-only; see Deviation note below):
```ts
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { resourceName } from '@playfusion/platform-lib'
import type { SubscriptionReader } from '../ports.js'

export class DynamoSubscriptionReader implements SubscriptionReader {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o11-subscriptions')) {}
  async getPlanAndStatus(organizationId: string): Promise<{ plan: string; status: string }> {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { organizationId } }))
    const item = res.Item as { plan?: string; status?: string } | undefined
    return { plan: item?.plan ?? 'FREE', status: item?.status ?? 'ACTIVE' }
  }
}
```
> **Deviation from spec (recorded):** the spec suggested an o13→o11 HTTP read. o11's read route is JWT-guarded, so a server-to-server HTTP call would need a token. Reading o11's projection table directly (read-only IAM grant) is simpler and avoids minting service tokens. o11 remains the sole *writer*/owner; o13 only reads. This is the chosen approach.

- [ ] **Step 2: Write deps + handler**

`services/o13-assistant/src/deps.ts`:
```ts
import { makeDocClient } from '@playfusion/platform-lib'
import type { Deps } from './application/draft.js'
import { DynamoUsageStore } from './adapters/dynamodb-usage-store.js'
import { DynamoSubscriptionReader } from './adapters/dynamodb-subscription-reader.js'
import { makeLiveBedrockGateway } from './adapters/bedrock-gateway-live.js'

export function defaultDeps(): Deps {
  const db = makeDocClient()
  return {
    subs: new DynamoSubscriptionReader(db),
    usage: new DynamoUsageStore(db),
    ai: makeLiveBedrockGateway(),
  }
}
```
`services/o13-assistant/src/handler.ts` (mirrors o11's handler wiring):
```ts
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
```
> Verify the exact `requireOrganizer` / `auth0ConfigFromEnv` / `createAuth0Verifier` / `toHttpError` / `checkpoint` / `withCorrelation` / `currentCorrelationId` exports exist in `@playfusion/platform-lib` (they are used verbatim by `services/o11-subscriptions/src/handler.ts`). If a helper's signature differs, copy o11's usage exactly.

- [ ] **Step 3: Write the usage-store + handler tests**

`services/o13-assistant/test/usage-store.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { DynamoUsageStore } from '../src/adapters/dynamodb-usage-store.js'

describe('DynamoUsageStore', () => {
  it('count returns 0 when the month bucket is absent', async () => {
    const db = { send: vi.fn().mockResolvedValue({}) } as any
    expect(await new DynamoUsageStore(db, 'T').count('org', '2026-09')).toBe(0)
  })
  it('count returns the stored count', async () => {
    const db = { send: vi.fn().mockResolvedValue({ Item: { count: 7 } }) } as any
    expect(await new DynamoUsageStore(db, 'T').count('org', '2026-09')).toBe(7)
  })
  it('increment issues an ADD on the (org, month) key', async () => {
    const send = vi.fn().mockResolvedValue({})
    await new DynamoUsageStore({ send } as any, 'T').increment('org', '2026-09')
    const input = send.mock.calls[0][0].input
    expect(input.Key).toEqual({ organizationId: 'org', month: '2026-09' })
    expect(input.UpdateExpression).toContain('ADD #c :one')
  })
})
```
`services/o13-assistant/test/handler.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { makeApp } from '../src/handler.js'
import type { Deps } from '../src/application/draft.js'

const DRAFT_JSON = JSON.stringify({ draft: {
  event: { name: 'F', sportId: 'rugby', participantType: 'team', format: 'festival',
           categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, playbook: 'PB-1' },
  schedule: { fields: ['C1'], periods: 1, periodMinutes: 15, breakMinutes: 3, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE', finalsEnabled: false },
  rationale: 'x', assumptions: [],
} })

const deps = (plan = 'CLUB', status = 'ACTIVE'): Deps => ({
  subs: { getPlanAndStatus: vi.fn().mockResolvedValue({ plan, status }) },
  usage: { count: vi.fn().mockResolvedValue(0), increment: vi.fn().mockResolvedValue(undefined) },
  ai: { complete: vi.fn().mockResolvedValue(DRAFT_JSON) },
  now: () => new Date('2026-09-13T00:00:00Z'),
})

const call = (app: ReturnType<typeof makeApp>, body: unknown) =>
  app.request('/organizations/org-1/assistant:draft', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

describe('o13 handler', () => {
  it('200 with a draft for an entitled org', async () => {
    const res = await call(makeApp(deps()), { description: 'festa' })
    expect(res.status).toBe(200)
    expect((await res.json()).draft.event.format).toBe('festival')
  })
  it('403 for an unentitled plan', async () => {
    const res = await call(makeApp(deps('FREE')), { description: 'x' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('AI_NOT_ENTITLED')
  })
  it('422 when the model output is unusable', async () => {
    const d = deps(); (d.ai.complete as any) = vi.fn().mockResolvedValue('non ho capito')
    const res = await call(makeApp(d), { description: 'x' })
    expect(res.status).toBe(422)
  })
  it('400 on an empty body (missing description)', async () => {
    const res = await call(makeApp(deps()), {})
    expect(res.status).toBe(400)
  })
})
```
> If `requireOrganizer` blocks unauthenticated `app.request` calls (no JWT) with 401, the handler tests must pass whatever header/stub o11's `test/handler.test.ts` uses to satisfy the middleware. Read `services/o11-subscriptions/test/handler.test.ts` and copy its auth-satisfying setup verbatim (e.g. a dev/bypass mode when `auth0cfg` is undefined). The middleware is `allowPlatformAdmin: true` and, with no Auth0 config in the test env, `verifier` is `undefined` — mirror o11's expectation for that case.

- [ ] **Step 4: Run to verify tests pass**

Run: `npx vitest run services/o13-assistant`
Expected: PASS (prompt, validate, draft, usage-store, handler).

- [ ] **Step 5: Commit**

```bash
git add services/o13-assistant/src/adapters services/o13-assistant/src/deps.ts services/o13-assistant/src/handler.ts services/o13-assistant/test/usage-store.test.ts services/o13-assistant/test/handler.test.ts
git commit -m "feat(o13): adapters (bedrock/usage/subscription) + Hono handler"
```

---

### Task 6: rest-client — `o13` types + factory + registration

**Files:**
- Modify: `libs/rest-client/src/types.ts` (append o13 section)
- Create: `libs/rest-client/src/o13.ts`
- Modify: `libs/rest-client/src/client.ts`
- Test: `libs/rest-client/test/o13.test.ts`

**Interfaces:**
- Produces (types.ts): `EventDraftCore`, `DraftGroup`, `EventDraft`, `OpenQuestion`, `DraftResponse`, `DraftInput` — mirroring the o13 domain types (Task 2). `EventDraft.schedule` is typed as the existing `ScheduleConfig` in this lib.
- Produces (o13.ts): `O13Api { draftEvent(orgId, input: DraftInput): Promise<DraftResponse> }`, `o13(cfg)`.
- Produces (client.ts): `Client.o13: O13Api`; `createClient` wires `o13: o13(cfg)`.

- [ ] **Step 1: Write the failing test**

`libs/rest-client/test/o13.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o13 assistant api', () => {
  it('draftEvent POSTs the description to assistant:draft', async () => {
    const f = vi.fn().mockResolvedValue(res({ openQuestions: [{ field: 'fields', question: 'Quanti campi?' }] }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    const out = await c.o13.draftEvent('org-1', { description: 'festa' })
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o13/organizations/org-1/assistant:draft')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ description: 'festa' })
    expect(out.openQuestions?.[0].field).toBe('fields')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run libs/rest-client/test/o13.test.ts`
Expected: FAIL — `c.o13` is undefined.

- [ ] **Step 3: Append the types**

At the end of `libs/rest-client/src/types.ts` (the file groups DTOs by service with `// oN` comments — add a `// o13` block). `ScheduleConfig` already exists in this file; reuse it:
```ts
// o13 — AI event-configuration assistant
export type EventDraftFormat = 'groups' | 'groups+bracket' | 'bracket' | 'festival'
export interface EventDraftCore {
  name: string
  sportId: string
  participantType: 'team' | 'individual'
  format: EventDraftFormat
  categorie: string[]
  dates: { from: string; to: string }
  startTime?: string
  location?: string
  playbook: 'PB-1' | 'PB-2'
}
export interface DraftGroup { label: string; teamCount: number; field?: string }
export interface EventDraft {
  event: EventDraftCore
  groupsByCategory?: Record<string, { groups: DraftGroup[] }>
  schedule: ScheduleConfig
  rationale: string
  assumptions: string[]
}
export interface OpenQuestion { field: string; question: string }
export interface DraftResponse { draft?: EventDraft; openQuestions?: OpenQuestion[] }
export interface DraftInput { description: string; answers?: Record<string, string>; sportId?: string }
```

- [ ] **Step 4: Write the factory**

`libs/rest-client/src/o13.ts`:
```ts
import { request, type HttpConfig } from './http.js'
import type { DraftInput, DraftResponse } from './types.js'

export interface O13Api {
  draftEvent(organizationId: string, input: DraftInput): Promise<DraftResponse>
}
const enc = encodeURIComponent
export const o13 = (cfg: HttpConfig): O13Api => ({
  draftEvent: (orgId, input) => request(cfg, 'POST', `/o13/organizations/${enc(orgId)}/assistant:draft`, input),
})
```

- [ ] **Step 5: Register in client.ts**

In `libs/rest-client/src/client.ts`: add the import, the interface field, and the assignment (mirror o11/o12):
```ts
import { o13, type O13Api } from './o13.js'
// … in interface Client:  o12: O12Api; o13: O13Api; o7: O7Api …
// … in createClient return: o12: o12(cfg), o13: o13(cfg), o7: o7(cfg) …
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run libs/rest-client/test/o13.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/rest-client/src/types.ts libs/rest-client/src/o13.ts libs/rest-client/src/client.ts libs/rest-client/test/o13.test.ts
git commit -m "feat(rest-client): o13 assistant draftEvent endpoint + types"
```

---

### Task 7: e1-web — assistant panel (render + entitlement gate)

**Files:**
- Modify: `apps/e1-web/src/views/create-event.ts`
- Test: `apps/e1-web/test/create-event-assistant.test.ts`

**Interfaces:**
- Consumes: `ctx.entitlements.hasAiAssistant`; `CreateEventGate`.
- Produces: `CreateEventGate.hasAi: boolean`; the rendered create-event HTML contains an assistant panel (active) or a locked teaser, with stable hooks: `#pf-ai-desc` (textarea), `#pf-ai-go` (button), `#pf-ai-out` (result container).

- [ ] **Step 1: Write the failing tests**

`apps/e1-web/test/create-event-assistant.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { renderCreateEvent } from '../src/views/create-event'
import type { SportProfile } from '@playfusion/rest-client'

const sports: SportProfile[] = []

describe('create-event AI assistant panel', () => {
  it('renders the assistant panel with input + button when entitled', () => {
    const html = renderCreateEvent([], sports, true)
    expect(html).toContain('Assistente AI')
    expect(html).toContain('id="pf-ai-desc"')
    expect(html).toContain('id="pf-ai-go"')
    expect(html).toContain('id="pf-ai-out"')
  })
  it('renders a locked teaser (no input) when not entitled', () => {
    const html = renderCreateEvent([], sports, false)
    expect(html).toContain('Assistente AI')
    expect(html).toContain('Disponibile con Club')
    expect(html).not.toContain('id="pf-ai-desc"')
  })
})
```
> Read `apps/e1-web/src/views/create-event.ts` first to learn the real signature of `renderCreateEvent` (currently `renderCreateEvent(events, sports)`). This task adds a third parameter `hasAi: boolean`. If the current signature or param names differ, adapt the test and implementation to the real ones — the observable contract (panel vs teaser, the three ids) is what matters.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/e1-web/test/create-event-assistant.test.ts`
Expected: FAIL — `renderCreateEvent` ignores the 3rd arg; panel absent.

- [ ] **Step 3: Implement the panel**

In `apps/e1-web/src/views/create-event.ts`:
1. Extend the gate type and load:
```ts
export interface CreateEventGate { capReached: boolean; sports: SportProfile[]; hasAi: boolean }
// in load(): return { capReached: …, sports, hasAi: ctx.entitlements.hasAiAssistant }
// in render(data): pass hasAi through:
//   data.capReached ? renderCapBlocked() : renderCreateEvent([], data.sports, data.hasAi)
```
2. Add the panel builder and inject it at the top of the create-event body (above the manual form). Use existing `esc`:
```ts
function assistantPanel(hasAi: boolean): string {
  if (!hasAi) {
    return `<div class="pf-card pf-aipanel pf-aipanel--locked">
      <h2 class="pf-h3">✨ Assistente AI</h2>
      <p class="pf-muted">Descrivi il torneo a parole e lascia che l'assistente configuri categorie, gironi, calendario e finali. <b>Disponibile con Club.</b></p>
      <a class="pf-btn" href="#/org/subscription">Passa a Club</a>
    </div>`
  }
  return `<div class="pf-card pf-aipanel">
    <h2 class="pf-h3">✨ Assistente AI</h2>
    <p class="pf-muted">Descrivi il torneo: squadre, campi, orari, formato. L'assistente prepara una bozza da rivedere.</p>
    <textarea id="pf-ai-desc" rows="4" class="pf-input" placeholder="Es. Festa dello sport, 24 squadre U10, 3 campi, domenica 9–18, partite da 15', tutti giocano, niente classifiche."></textarea>
    <button id="pf-ai-go" class="pf-btn pf-btn--primary" type="button">✨ Genera bozza</button>
    <div id="pf-ai-out"></div>
  </div>`
}
```
3. In `renderCreateEvent`, add the `hasAi` param and prepend `assistantPanel(hasAi)` before the existing form markup.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run apps/e1-web/test/create-event-assistant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/e1-web/src/views/create-event.ts apps/e1-web/test/create-event-assistant.test.ts
git commit -m "feat(e1): AI assistant panel on create-event (gated on hasAiAssistant)"
```

---

### Task 8: e1-web — assistant interaction + apply orchestration

**Files:**
- Modify: `apps/e1-web/src/views/create-event.ts` (mount)
- Test: `apps/e1-web/test/create-event-apply.test.ts`

**Interfaces:**
- Consumes: `ctx.client.o13.draftEvent`, `ctx.client.o3.createEvent`, `ctx.client.o3.drawGironi`, `ctx.client.o7.generateSchedule`, `ctx.navigate`.
- Produces: exported pure helper `applyDraft(client, navigate, draft): Promise<void>` so the orchestration order is unit-testable without the DOM.

**Apply order (dependency-correct):** `createEvent` → for each category with a `groupsByCategory` entry, `drawGironi(id, cat, groups.length)` → `generateSchedule(id, schedule)` → `navigate`. Gironi must exist before schedule generation (the schedule engine reads group/pool composition). `bracket` drafts have no `groupsByCategory`, so the gironi loop is skipped.

- [ ] **Step 1: Write the failing test**

`apps/e1-web/test/create-event-apply.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { applyDraft } from '../src/views/create-event'
import type { EventDraft } from '@playfusion/rest-client'

const draft: EventDraft = {
  event: { name: 'F', sportId: 'rugby', participantType: 'team', format: 'festival',
           categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, playbook: 'PB-1' },
  groupsByCategory: { U10: { groups: [{ label: 'Pool A', teamCount: 6 }, { label: 'Pool B', teamCount: 6 }] } },
  schedule: { fields: ['C1'], periods: 1, periodMinutes: 15, breakMinutes: 3, dailyStart: '09:00', groupsCount: 2, legs: 'SINGLE', finalsEnabled: false } as EventDraft['schedule'],
  rationale: 'x', assumptions: [],
}

describe('applyDraft', () => {
  it('creates the event, draws gironi per category, generates the schedule, then navigates — in order', async () => {
    const order: string[] = []
    const client = {
      o3: {
        createEvent: vi.fn(async () => { order.push('create'); return { sportEventId: 'ev-1', status: 'Published' } }),
        drawGironi: vi.fn(async () => { order.push('gironi'); return { groups: [], locked: false } }),
      },
      o7: { generateSchedule: vi.fn(async () => { order.push('schedule'); return {} as any }) },
    } as any
    const navigate = vi.fn(() => order.push('nav'))
    await applyDraft(client, navigate, draft)
    expect(client.o3.createEvent).toHaveBeenCalledWith(draft.event)
    expect(client.o3.drawGironi).toHaveBeenCalledWith('ev-1', 'U10', 2)
    expect(client.o7.generateSchedule).toHaveBeenCalledWith('ev-1', draft.schedule)
    expect(navigate).toHaveBeenCalledWith('#/events/ev-1')
    expect(order).toEqual(['create', 'gironi', 'schedule', 'nav'])
  })
  it('skips the gironi step for a bracket draft (no groupsByCategory)', async () => {
    const bracket: EventDraft = { ...draft, event: { ...draft.event, format: 'bracket' }, groupsByCategory: undefined }
    const client = {
      o3: { createEvent: vi.fn(async () => ({ sportEventId: 'ev-2', status: 'Published' })), drawGironi: vi.fn() },
      o7: { generateSchedule: vi.fn(async () => ({} as any)) },
    } as any
    await applyDraft(client, vi.fn(), bracket)
    expect(client.o3.drawGironi).not.toHaveBeenCalled()
  })
}
)
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/e1-web/test/create-event-apply.test.ts`
Expected: FAIL — `applyDraft` not exported.

- [ ] **Step 3: Implement `applyDraft` + wire the mount**

Add the exported helper to `create-event.ts`:
```ts
import type { Client, EventDraft } from '@playfusion/rest-client'

export async function applyDraft(client: Client, navigate: (h: string) => void, draft: EventDraft): Promise<void> {
  const created = await client.o3.createEvent(draft.event)
  const id = created.sportEventId
  if (draft.groupsByCategory) {
    for (const cat of draft.event.categorie) {
      const g = draft.groupsByCategory[cat]
      if (g && g.groups.length) await client.o3.drawGironi(id, cat, g.groups.length)
    }
  }
  await client.o7.generateSchedule(id, draft.schedule)
  navigate(`#/events/${encodeURIComponent(id)}`)
}
```
In the screen's `mount`, wire the panel (only when entitled — guard on the element existing). Render questions/draft into `#pf-ai-out`; on "Applica" call `applyDraft`. Reuse `esc` and `inlineError`:
```ts
const desc = root.querySelector<HTMLTextAreaElement>('#pf-ai-desc')
const go = root.querySelector<HTMLButtonElement>('#pf-ai-go')
const out = root.querySelector<HTMLElement>('#pf-ai-out')
let answers: Record<string, string> = {}

async function requestDraft(): Promise<void> {
  if (!desc || !out) return
  const description = desc.value.trim()
  if (!description) { out.innerHTML = inlineError('Descrivi prima il torneo.'); return }
  if (go) go.disabled = true
  out.innerHTML = '<p class="pf-muted">Genero la bozza…</p>'
  try {
    const resp = await ctx.client.o13.draftEvent(ctx.orgId, { description, answers, sportId: undefined })
    if (resp.openQuestions?.length) renderQuestions(resp.openQuestions)
    else if (resp.draft) renderDraft(resp.draft)
    else out.innerHTML = inlineError('Nessuna bozza. Riprova o configura a mano.')
  } catch (e: unknown) {
    const status = (e as { status?: number }).status
    if (status === 429) out.innerHTML = inlineError('Hai esaurito le generazioni di questo mese. Passa a Enterprise per generazioni illimitate.')
    else out.innerHTML = inlineError('Non sono riuscito a generare una bozza. Configura pure a mano.')
  } finally { if (go) go.disabled = false }
}

function renderQuestions(qs: { field: string; question: string }[]): void {
  if (!out) return
  out.innerHTML = `<div class="pf-aiqs">${qs.map((q) =>
    `<label class="pf-field"><span>${esc(q.question)}</span><input class="pf-input" data-qfield="${esc(q.field)}"></label>`).join('')}
    <button class="pf-btn pf-btn--primary" id="pf-ai-answer" type="button">Completa la bozza</button></div>`
  out.querySelector('#pf-ai-answer')!.addEventListener('click', () => {
    answers = { ...answers }
    out.querySelectorAll<HTMLInputElement>('[data-qfield]').forEach((i) => { answers[i.dataset.qfield!] = i.value })
    void requestDraft()
  })
}

function renderDraft(draft: EventDraft): void {
  if (!out) return
  const cats = draft.event.categorie.map((cat) => {
    const g = draft.groupsByCategory?.[cat]
    const gtxt = g ? ` → ${g.groups.length} gruppi` : ''
    return `<li>${esc(cat)}${gtxt}</li>`
  }).join('')
  out.innerHTML = `<div class="pf-aidraft">
    <h3 class="pf-h4">${esc(draft.event.name)}</h3>
    <p class="pf-muted">${esc(draft.event.format)} · ${esc(draft.event.dates.from)} → ${esc(draft.event.dates.to)}</p>
    <ul>${cats}</ul>
    <p class="pf-muted">${esc(draft.rationale)}</p>
    <div class="pf-row">
      <button class="pf-btn" id="pf-ai-edit" type="button">✎ Modifica a mano</button>
      <button class="pf-btn pf-btn--primary" id="pf-ai-apply" type="button">Applica configurazione</button>
    </div></div>`
  out.querySelector('#pf-ai-apply')!.addEventListener('click', async () => {
    const btn = out.querySelector<HTMLButtonElement>('#pf-ai-apply')!; btn.disabled = true
    try { await applyDraft(ctx.client, ctx.navigate, draft) }
    catch { out.innerHTML = inlineError('Evento creato solo in parte. Controlla dal workspace.'); btn.disabled = false }
  })
  // "Modifica a mano" prefill is best-effort: fill the name field if present.
  out.querySelector('#pf-ai-edit')!.addEventListener('click', () => {
    const nameInput = root.querySelector<HTMLInputElement>('input[name="name"]')
    if (nameInput) nameInput.value = draft.event.name
    desc?.scrollIntoView({ behavior: 'smooth' })
  })
}

if (go) go.addEventListener('click', () => void requestDraft())
```
> Read the current `mount` of `createEventScreen` and add this block inside it (after the existing submit wiring), guarded by `if (go)` so it's inert when the panel is the locked teaser. Keep the existing manual-form submit untouched.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run apps/e1-web/test/create-event-apply.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full e1-web suite (no regressions)**

Run: `npx vitest run apps/e1-web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/e1-web/src/views/create-event.ts apps/e1-web/test/create-event-apply.test.ts
git commit -m "feat(e1): AI draft interaction + apply orchestration (create→gironi→schedule)"
```

---

### Task 9: CDK — `o13-usage` table + o13 Lambda/route + Bedrock IAM

**Files:**
- Modify: `infra/cdk/lib/data-stack.ts` (add the `o13-usage` composite-key table)
- Modify: `infra/cdk/lib/api-stack.ts` (add o13 to `BCS`; grant o11 read; add Bedrock IAM + model env)

**Interfaces:**
- Consumes: existing `DataStack.tables`, `resourceName`, `BcSpec`, `lambda()` factory, per-BC loop.
- Produces: table `playfusion2-o13-usage-<env>`; Lambda `o13-handler` behind `/o13/{proxy+}` with `bedrock:InvokeModel` + read on `o11-subscriptions` + write on `o13-usage`.

- [ ] **Step 1: Add the usage table (composite key)**

In `infra/cdk/lib/data-stack.ts`, near the o11 tables, add a composite-key table with TTL (mirror the existing inline composite-key table pattern in this file):
```ts
this.tables['o13-usage'] = new Table(this, 'o13-usage', {
  tableName: resourceName('o13-usage', env),
  partitionKey: { name: 'organizationId', type: AttributeType.STRING },
  sortKey: { name: 'month', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',
  removalPolicy,
})
```
> If `AttributeType`, `BillingMode`, `Table`, `removalPolicy` are already imported/defined at the top of the file (they are — used by the `table()` helper), reuse them. Do not re-import.

- [ ] **Step 2: Register the o13 service in api-stack**

In `infra/cdk/lib/api-stack.ts`, add to the `BCS` array (mirror o11's entry; note o13 has NO consumer, and lists only `o13-usage` as its read-write table):
```ts
{ key: 'o13-assistant', route: 'o13', tables: ['o13-usage'] },
```
Then, in the per-BC loop, after the `for (const t of bc.tables) …grantReadWriteData(handler)` line, add the o13-specific wiring (read o11's table + Bedrock model env + IAM). Import `PolicyStatement`:
```ts
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
```
Inside the loop:
```ts
if (bc.route === 'o13') {
  props.data.tables['o11-subscriptions']!.grantReadData(handler)   // read-only plan lookup
  handler.addEnvironment('O13_MODEL_ID', 'eu.anthropic.claude-haiku-4-5-20251001-v1:0')
  handler.addEnvironment('O13_BEDROCK_REGION', 'eu-south-1')
  handler.addToRolePolicy(new PolicyStatement({
    actions: ['bedrock:InvokeModel'],
    resources: [
      `arn:aws:bedrock:eu-south-1:*:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0`,
      `arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
    ],
  }))
}
```
> The inference-profile ARN requires both the profile ARN and the underlying foundation-model ARN(s) it routes to — Bedrock checks `InvokeModel` against both. The `*` in the account slot of the profile ARN and the `::` (no account) in the foundation-model ARN follow AWS's documented ARN shapes. If deployment reports an access-denied at invoke time, widen `resources` to `['*']` temporarily to confirm it's an ARN-shape issue, then narrow.

- [ ] **Step 3: Synthesize to verify the stack builds**

Run: `cd infra/cdk && npx cdk synth -c env=stg > /dev/null && echo OK`
Expected: `OK` (no synth errors). If the repo builds CDK via a different command, use the one in `infra/cdk/package.json` scripts.

- [ ] **Step 4: Commit**

```bash
git add infra/cdk/lib/data-stack.ts infra/cdk/lib/api-stack.ts
git commit -m "feat(infra): o13 assistant lambda, o13-usage table, Bedrock IAM"
```

---

### Task 10: Public site FAQ — AI assistant Q&A (visible + JSON-LD)

**Files:**
- Modify: `apps/site/index.html` (add one `.site-faq__item` AND one `FAQPage` `mainEntity` entry)
- Test: `apps/site/test/faq-sync.test.ts`

**Interfaces:**
- Produces: a new FAQ item present in both the visible list and the JSON-LD, with identical question text.

- [ ] **Step 1: Write the failing sync test**

`apps/site/test/faq-sync.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')

describe('site FAQ — AI assistant', () => {
  it('the visible FAQ mentions the AI assistant', () => {
    expect(html).toContain("C'è un assistente AI?")
    expect(html).toMatch(/assistente AI configura l'evento/i)
  })
  it('the JSON-LD FAQPage stays valid JSON and includes the AI question', () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(m).toBeTruthy()
    const data = JSON.parse(m![1])
    const json = JSON.stringify(data)
    expect(json).toContain("C'è un assistente AI?")
  })
})
```
> Confirm the JSON-LD lives in a single `<script type="application/ld+json">` block (it does, per `apps/site/index.html`). If the file has more than one such block, match the one containing `"FAQPage"`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/site/test/faq-sync.test.ts`
Expected: FAIL — the AI question is absent.

- [ ] **Step 3: Add the visible FAQ item**

In `apps/site/index.html`, inside `<div class="site-faq">`, add a new item (after the trial item, keep the existing style):
```html
<div class="site-faq__item"><h3>C'è un assistente AI?</h3><p>Sì: con il piano Club l'assistente AI configura l'evento per te. Descrivi il torneo a parole (squadre, campi, orari, formato) e genera categorie, gironi o pool, calendario e finali, pronti da rivedere e applicare. Disponibile anche durante i 14 giorni di prova.</p></div>
```

- [ ] **Step 4: Add the JSON-LD entry (kept in sync)**

In the `"FAQPage"` `"mainEntity"` array, add (mind the JSON comma before it):
```json
{ "@type": "Question", "name": "C'è un assistente AI?", "acceptedAnswer": { "@type": "Answer", "text": "Sì: con il piano Club l'assistente AI configura l'evento per te. Descrivi il torneo a parole (squadre, campi, orari, formato) e genera categorie, gironi o pool, calendario e finali, pronti da rivedere e applicare. Disponibile anche durante i 14 giorni di prova." } }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run apps/site/test/faq-sync.test.ts`
Expected: PASS (JSON-LD still parses; both contain the question).

- [ ] **Step 6: Commit**

```bash
git add apps/site/index.html apps/site/test/faq-sync.test.ts
git commit -m "feat(site): FAQ entry for the AI event assistant (visible + JSON-LD)"
```

---

## Final verification (after all tasks)

- [ ] Run the whole unit suite: `npm test` — expect green (existing + new).
- [ ] Run the new service in isolation: `npx vitest run services/o13-assistant`.
- [ ] Build: `npm run build` (or `nx run-many -t build`) — o13 service + libs compile.
- [ ] CDK synth for staging: `cd infra/cdk && npx cdk synth -c env=stg > /dev/null && echo OK`.

## Deployment note (not part of task commits)

Deploy to staging follows the project convention: merge `feature/ai-event-assistant` into `stage`, tag `stg-ai-assistant`, push branch+tag, watch `deploy-stage.yml`. **Do not deploy without explicit user authorization.** First-deploy checklist for this feature: confirm Bedrock model access is granted in `eu-south-1` for the account (verified 2026-09-13), and that the o13 Lambda role's `bedrock:InvokeModel` resolves at invoke time (see Task 9 Step 2 note).
