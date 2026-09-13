# AI Event-Configuration Assistant — Design Spec

**Date:** 2026-09-13
**Status:** Draft, pending user review
**Branch:** `feature/ai-event-assistant`

## 1. Summary

A **paid-only AI assistant** that helps an organizer configure a new event from a
free-text natural-language description. v1 is scoped to the **event-creation
moment**: the organizer describes the tournament in words, the assistant produces a
**complete, validated draft** (event core + gironi/pool structure + schedule config +
finals), the organizer reviews it and applies it with one action. The manual creation
form remains available and unchanged as an alternative on-ramp.

The assistant **proposes**; it never writes. The frontend applies the approved draft
through the existing endpoints (`o3.createEvent` → `o7.schedule:generate` →
`o3.gironi:draw`). Nothing irreversible happens without explicit human confirmation.

## 2. Goals & non-goals

**Goals**
- Lower the friction of the highest-value, highest-uncertainty moment (first event).
- A premium differentiator that new users experience **during the trial** (conversion lever).
- Real backend paywall + usage cap (the project's first real backend entitlement guard).

**Non-goals (out of scope for v1)**
- Copilot on **existing** events (would require o3 update endpoints that don't exist).
- Streaming / multi-turn chat UI.
- Real team-name assignment at creation (teams aren't enrolled yet; exception: PB-2 names in the description).
- Languages other than Italian.
- Prompt caching (a later cost optimization).

## 3. Product decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Assistant type | Copilot that drafts + applies, anchored at **creation** (natural-language, with completion questions). |
| Scope v1 | Only at event creation → generates a complete draft. |
| Provider | **AWS Bedrock / Claude**, in-account, region **`eu-south-1`** (verified available), EU inference profile. No external SaaS, no new authorization. |
| Default model | `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` (EU residency). `eu.anthropic.claude-haiku-4-5-20251001-v1:0` as the low-cost fallback if testing shows it suffices. |
| Apply model | **AI proposes `EventDraft`; frontend applies** via existing endpoints, human-in-the-loop. |
| Paywall | New entitlement `hasAiAssistant` on **CLUB+**, with a monthly usage cap. |
| Cap | Trial (`status: TRIAL`) = **5**/month · CLUB active = **20**/month · ENTERPRISE = **unlimited**. |
| Trial availability | **Available in trial** (differentiators are experienced in trial; it's the conversion moment). |

## 4. Architecture

New bounded context **`o13-assistant`** (follows the `oN` service-per-BC convention).
Single responsibility: *natural-language description + event context → a validated,
structured configuration proposal*. It does not mutate any domain store.

```
E1 (create-event form, "✨ Assistente AI" panel)
  │  POST /o13/assistant/draft  { description, answers?, sportId? }
  ▼
o13 Lambda (Hono)
  ├─ 1. AuthN: orgId + role from the Auth0 JWT claim (NOT the x-organization-id header)
  ├─ 2. Plan: read subscription from o11 → entitlements(plan).hasAiAssistant ? else 403
  ├─ 3. Cap: read o13-usage counter for the month; count >= cap(plan,status) → 429
  ├─ 4. Bedrock Converse (eu-south-1, EU inference profile) → forced-JSON EventDraft
  ├─ 5. Validate (zod + domain rules); missing essentials → { openQuestions } (no counter change)
  └─ 6. On a valid draft: atomically increment o13-usage; return EventDraft
  ▼
E1 renders the draft → [Modifica a mano] (prefill form) | [Applica]
       Apply = o3.createEvent → o7.schedule:generate → o3.gironi:draw → workspace
```

### 4.1 Provider / region
- Region **`eu-south-1`** (same as the rest of the stack — no cross-region). Verified: Anthropic
  models present and EU/global inference profiles `ACTIVE` in eu-south-1 as of 2026-09-13.
- Single synchronous request/response → **no SSE/streaming infrastructure needed** (none exists today).
- IAM: `bedrock:InvokeModel` restricted to the specific inference-profile ARNs used.

## 5. The `EventDraft` contract

```ts
interface EventDraft {
  event: {                       // → o3.createEvent (CreateEventInput)
    name: string
    sportId: string
    participantType: 'team' | 'individual'
    format: 'groups' | 'groups+bracket' | 'bracket' | 'festival'
    categorie: string[]
    dates: { from: string; to: string }
    startTime?: string
    location?: string
    playbook: 'PB-1' | 'PB-2'
  }
  groupsByCategory?: Record<string, {          // → o3 gironi/pool — STRUCTURE, not real teams
    groups: { label: string; teamCount: number; field?: string }[]
  }>
  schedule: ScheduleConfig       // → o7 schedule:generate (fields, periods, slot, finals*, festival*)
  rationale: string              // human-readable explanation of the choices
  assumptions: string[]          // what it inferred
}

interface DraftResponse {
  draft?: EventDraft
  openQuestions?: { field: string; question: string }[]   // returned instead of draft when data is missing
}

interface DraftInput {
  description: string
  answers?: Record<string, string>   // answers to a previous round's openQuestions
  sportId?: string                   // optional pre-selected sport
}
```

**Timing constraint:** at creation, **teams are not yet enrolled**, so `groupsByCategory`
describes group/pool **structure** (label, `teamCount`, optional `field`), not real team
names. Real assignment happens later in the Gironi tab after enrollment. (Exception: PB-2
direct roster — if the organizer lists names in the description, they may be captured.)

## 6. Validation (two levels)

1. **Forced structured JSON** — Bedrock in tool/JSON mode returns exactly the `EventDraft`
   schema; no free-text parsing.
2. **`zod` + domain rules**, server-side, before responding:
   - `format` ↔ `finalsType` coherence (`festival` → no finals; `bracket` → no gironi).
   - `schedule.fields` non-empty; times parse; slot/period durations sane.
   - pool/group count coherent with categories.
   - If an **essential datum is missing** (how many fields? day length? number of pools?) →
     return `openQuestions` instead of a fabricated draft. Max 1–2 rounds.

## 7. Paywall & usage cap (backend enforcement)

Extend `libs/entitlements` (pure, already server-importable) — the single source of truth:

```ts
interface Entitlements {
  …
  hasAiAssistant: boolean
  aiAssistantMonthlyCap: number | null   // null = unlimited (used for ACTIVE plans)
}
// FREE: false / 0 · STARTER: false / 0 · CLUB: true / 20 · ENTERPRISE: true / null
```

The cap depends on **status** as well as plan (trial gets a smaller cap):

```ts
function aiAssistantCap(plan: Plan, status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE'): number | null {
  const ent = entitlements(plan)
  if (!ent.hasAiAssistant) return 0
  if (status === 'TRIAL') return 5           // trial taster, bounds no-card farming
  return ent.aiAssistantMonthlyCap           // CLUB 20 · ENTERPRISE null (unlimited)
}
```

**Handler order** (o13):
1. AuthN — `orgId`, `role` from the **Auth0 JWT** (header `x-organization-id` is spoofable).
   Only OWNER/ORGANIZER (they're the roles that can create events).
2. Plan — read subscription from **o11** (o11 stays the source of truth for the Stripe
   projection). `entitlements(plan).hasAiAssistant` false → **403**.
   *Trade-off:* o13→o11 is a small internal service-to-service read; chosen over o13 reading
   o11's table directly, to preserve bounded-context ownership. Latency is negligible vs the LLM call.
3. Cap — compare month counter to `aiAssistantCap(plan, status)`. `count >= cap` → **429**.
4. Bedrock → draft.
5. Validate. Invalid after retries → **422** (UI shows the manual fallback). Missing data →
   **200** with `openQuestions` (no counter change).
6. **Count only successful generations** — increment after a valid draft, so a system error
   doesn't burn a user's generation.

### 7.1 Usage store
New minimal DynamoDB table **`o13-usage`**:
- PK `organizationId`, SK `yyyy-mm` (monthly bucket), attribute `count`, **TTL** to auto-expire old months.
- Atomic increment `UpdateItem … ADD count 1`. Cap pre-check before calling Bedrock; concurrent
  requests may over-shoot by at most 1 — acceptable for a soft cap.

## 8. Frontend (E1 create-event)

A panel **"✨ Assistente AI"** at the top of `apps/e1-web/src/views/create-event.ts`, above the
manual form. For **CLUB+** it is active; for FREE/STARTER it renders the **locked** teaser
(existing `locked` pattern) + upgrade link. Three states:

1. **Description** — textarea with an example placeholder; "Genera bozza" → `POST /o13/assistant/draft`.
   Global progress bar + button pending (existing `progress.ts`).
2. **Completion questions** — `openQuestions` shown as a small inline form (chips/inputs);
   answers → resubmit with `answers`.
3. **Draft & apply** — a review card (event · format · per-category structure · schedule · finals)
   plus a discreet "Perché così" (`rationale`) + "Assunzioni" (`assumptions`) block. Two actions:
   - **Modifica a mano** → prefill the manual form for hand-editing.
   - **Applica configurazione** → staged apply `createEvent → schedule:generate → gironi:draw` →
     navigate to the event workspace with a toast.

**Error states (never a dead end):**
- LLM/invalid draft after retries → "Non sono riuscito a generare una bozza, configura a mano"
  (the manual form is already present).
- Cap reached (429) → "Hai usato le N generazioni di questo mese. Passa a ENTERPRISE per
  generazioni illimitate." + upgrade link.
- Partial apply (create ok, schedule ko) → event exists; toast "Evento creato, rigenera il
  calendario dal tab Calendario". Non-transactional but each step is independently valid.

## 9. New/changed surfaces

- **New service** `services/o13-assistant/` — Hono handler, prompt builder (pure), draft
  parser/validator (pure, zod), Bedrock client (injectable port, mockable), usage store.
- **`libs/entitlements`** — add `hasAiAssistant` + `aiAssistantMonthlyCap` to the interface and
  all four rows; add `aiAssistantCap(plan, status)`.
- **`libs/rest-client`** — `o13.ts` (interface + factory), `EventDraft`/`DraftInput`/`DraftResponse`
  in `types.ts`, register in `client.ts`, export from `index.ts`.
- **`apps/e1-web`** — assistant panel + three-state flow + apply orchestration in `create-event.ts`
  (and any small helper split if the file grows unwieldy).
- **CDK** — o13 Lambda + API Gateway route `POST /o13/assistant/draft`; `o13-usage` DynamoDB table;
  IAM (`bedrock:InvokeModel` on the specific inference-profile ARNs; read access to o11).

## 10. Testing

- **Prompt builder & parser (pure):** description+context → prompt; model JSON → validated
  `EventDraft`; incomplete JSON → `openQuestions`.
- **Domain rules (zod):** festival→no-finals rejected; bracket→no-gironi; empty fields rejected;
  times parse; pool counts coherent.
- **Guard:** FREE → 403; CLUB over cap → 429; CLUB under cap → 200; TRIAL cap 5 vs ACTIVE cap 20
  (o11 + usage store mocked).
- **Usage store:** increment, cap, monthly rollover.
- **Bedrock client:** mocked in unit tests (no real calls); one optional flagged integration test.
- **UI E1:** panel render (locked vs active); question loop; apply orchestration asserts
  `createEvent → schedule:generate → gironi:draw` order (client mocked).

## 11. Privacy & logging

No full prompts in logs by default (they contain event descriptions, possibly names) — log only
`correlation-id` + token counts. Bedrock does not train on the data.

## 12. Cost

~$0.03 per generation (Sonnet-class); ~$0.60/org/month at the 20-cap. Account has **active AWS
credits currently offsetting all monthly usage** (net ~0) — likely covering Bedrock too (confirm
"Applicable services" on the Billing→Credits page). Economics are not a design risk.
