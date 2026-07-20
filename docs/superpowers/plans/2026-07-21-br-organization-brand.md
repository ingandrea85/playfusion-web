# br — Organization brand identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'Organization un brand (colori + logo testuale), modificabile in E1 e applicato a shell organizer + portale pubblico, gated da M-Broadcast (D-O1-1).

**Architecture:** `Organization.brand?` (presentation metadata) + store `getBrand/setBrand/resolveBrand` (resolveBrand applica il gate M-Broadcast); un helper `applyOrgBrand(orgId)` sovrascrive due CSS custom properties e ritorna il logo; consumato dallo shell organizer e da ogni pagina pubblica; una schermata E1 di editing (lock su Free) + un indice ⚙ Impostazioni.

**Tech Stack:** TypeScript, Vite (MPA), Vitest + jsdom. Nessuna dipendenza nuova.

## Global Constraints

- Stato finto: seed + `localStorage` (`playfusion-mock-v1`). Nessun backend.
- Brand = presentation metadata sull'Organization; MAI su Event/Category (Domain First).
- `brand = { logoText: string; primaryColor: string; accentColor: string }`.
- CSS var da sovrascrivere: `--color-action-primary` e `--color-action-accent` (definite in `tokens.css`).
- Gating: modifica **e** applicazione richiedono `hasModule(orgId,'M-Broadcast')` (Free = default PlayFusion). `resolveBrand` ritorna `null` se manca il modulo o il brand.
- Seed: nessuna org ha `brand`.
- MPA: i CSS var si resettano a ogni page load — nessun reset esplicito necessario.
- Italiano; classi/token esistenti. Tag di fetta: `br`.

---

### Task 1: Modello + store (brand + resolveBrand con gate)

**Files:**
- Modify: `shared/mock/types.ts` (`Organization.brand?`)
- Modify: `shared/mock/store.ts` (import + `getBrand`/`setBrand`/`resolveBrand`)
- Test: `shared/mock/brand.test.ts`

**Interfaces:**
- Consumes: `hasModule(orgId, key)` (esistente), `getSubscription`/`signUp`/`expireTrial` nei test.
- Produces:
  - `Organization['brand']` = `{ logoText: string; primaryColor: string; accentColor: string } | undefined`
  - `getBrand(orgId: string): Organization['brand']`
  - `setBrand(orgId: string, brand: { logoText: string; primaryColor: string; accentColor: string }): void`
  - `resolveBrand(orgId: string): { logoText: string; primaryColor: string; accentColor: string } | null`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `shared/mock/brand.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getBrand, setBrand, resolveBrand, signUp, expireTrial } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

const B = { logoText: 'ASD Aurora', primaryColor: '#123456', accentColor: '#abcdef' }

describe('brand store', () => {
  it('setBrand/getBrand persist on an org', () => {
    setBrand('org-1', B)
    expect(getBrand('org-1')).toEqual(B)
  })

  it('resolveBrand returns the brand when org has M-Broadcast + brand', () => {
    // org-1 seed modules include M-Broadcast
    setBrand('org-1', B)
    expect(resolveBrand('org-1')).toEqual(B)
  })

  it('resolveBrand is null when no brand set', () => {
    expect(resolveBrand('org-1')).toBeNull()
  })

  it('resolveBrand is null without M-Broadcast, even if a brand is saved', () => {
    // org-2 seed modules = M-Core + M-Compete only
    setBrand('org-2', B)
    expect(getBrand('org-2')).toEqual(B)      // saved…
    expect(resolveBrand('org-2')).toBeNull()  // …but gated off
  })

  it('losing M-Broadcast (trial expiry) gates the brand off', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org Brand' })
    setBrand(organization.id, B)
    expect(resolveBrand(organization.id)).toEqual(B) // PRO trial has M-Broadcast
    expireTrial(organization.id)                      // modules → core+compete
    expect(resolveBrand(organization.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npm test -- brand`
Expected: FAIL (funzioni assenti).

- [ ] **Step 3: Estendi il tipo Organization**

In `shared/mock/types.ts`, dentro `export interface Organization { ... }` aggiungi:

```ts
  brand?: { logoText: string; primaryColor: string; accentColor: string }
```

- [ ] **Step 4: Aggiungi le funzioni store**

In `shared/mock/store.ts`, in fondo:

```ts
export function getBrand(orgId: string): Organization['brand'] {
  return load().organizations.find(o => o.id === orgId)?.brand
}
export function setBrand(orgId: string, brand: { logoText: string; primaryColor: string; accentColor: string }): void {
  const state = load()
  const o = state.organizations.find(x => x.id === orgId); if (o) o.brand = brand
  save(state)
}
export function resolveBrand(orgId: string): { logoText: string; primaryColor: string; accentColor: string } | null {
  if (!hasModule(orgId, 'M-Broadcast')) return null
  return load().organizations.find(o => o.id === orgId)?.brand ?? null
}
```

(`Organization` è già importato nei tipi di `store.ts`; `hasModule` è già definito.)

- [ ] **Step 5: Esegui i test**

Run: `npm test -- brand`
Expected: PASS (5 test).

- [ ] **Step 6: Suite completa + typecheck**

Run: `npm test` → tutti PASS (115 + 5). Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 7: Commit**

```bash
git add shared/mock/types.ts shared/mock/store.ts shared/mock/brand.test.ts docs/superpowers/specs/2026-07-21-br-organization-brand-design.md docs/superpowers/plans/2026-07-21-br-organization-brand.md
git commit -m "feat(br): Organization.brand + getBrand/setBrand/resolveBrand (M-Broadcast gated)"
```

---

### Task 2: Theming — `applyOrgBrand` + shell wordmark + public topbar signature

**Files:**
- Modify: `shared/chrome.ts` (import `resolveBrand`; new `applyOrgBrand`; wordmark in `renderOrganizerWorkspace`; `renderPublicTopbar(brandText?)`)
- Modify: `apps/organizer/dashboard.ts` (apply brand)

**Interfaces:**
- Consumes: `resolveBrand` (Task 1); `getCurrentOrgId` (esistente).
- Produces:
  - `applyOrgBrand(orgId: string): string | null` — sets `--color-action-primary`/`--color-action-accent` on `document.documentElement` when `resolveBrand` non-null; returns its `logoText` (or `null`).
  - `renderPublicTopbar(brandText?: string): string` — usa `brandText` come wordmark se fornito.
  - `renderOrganizerWorkspace` — wordmark diventa il brand logo quando risolto.

- [ ] **Step 1: Import + `applyOrgBrand` in `shared/chrome.ts`**

Estendi l'import store (già presente `getEventPhase, getSubscription, trialDaysLeft`):

```ts
import { getEventPhase, getSubscription, trialDaysLeft, resolveBrand } from './mock/store'
```

Aggiungi (vicino agli altri export):

```ts
// Apply the tenant brand (colors) to the document and return its wordmark, when M-Broadcast-gated brand resolves. No-op otherwise.
export function applyOrgBrand(orgId: string): string | null {
  const b = resolveBrand(orgId)
  if (!b) return null
  const root = document.documentElement.style
  root.setProperty('--color-action-primary', b.primaryColor)
  root.setProperty('--color-action-accent', b.accentColor)
  return b.logoText
}
```

- [ ] **Step 2: Wordmark brandizzato nello shell**

In `renderOrganizerWorkspace`, prima del `return`, aggiungi:

```ts
  const brandLogo = applyOrgBrand(event.organizationId)
  const wordmark = brandLogo ? brandLogo : 'play<b>fusion</b>'
```

E nel markup ritornato sostituisci, nel `.pf-topbar`, `play<b>fusion</b><small>Organizer</small>` con `${wordmark}<small>Organizer</small>`.

- [ ] **Step 3: `renderPublicTopbar` accetta un brand**

Sostituisci la funzione con:

```ts
export function renderPublicTopbar(brandText?: string): string {
  return `<a class="pf-brand" href="/index.html">${brandText ?? 'play<b>fusion</b>'}</a>`
}
```

- [ ] **Step 4: Dashboard applica il brand**

In `apps/organizer/dashboard.ts`, dopo aver ricavato `orgId` (già presente `const orgId = getCurrentOrgId()` dalla fetta ac), aggiungi l'import `applyOrgBrand` da `../../shared/chrome` e chiama una volta:

```ts
applyOrgBrand(orgId)
```

(La dashboard non usa lo shell workspace; questa chiamata applica i colori del tenant anche lì. Il topbar della dashboard resta `renderOrganizerTopbar`.)

- [ ] **Step 5: Build + typecheck**

Run: `npm run build` → OK. Run: `npx tsc --noEmit` → nessun errore. Run: `npm test` → 120 PASS (il cambio firma di `renderPublicTopbar` è retro-compatibile: `brandText` è opzionale).

- [ ] **Step 6: Commit**

```bash
git add shared/chrome.ts apps/organizer/dashboard.ts
git commit -m "feat(br): applyOrgBrand theming + brand wordmark in organizer shell & public topbar"
```

---

### Task 3: Schermata brand + indice Impostazioni

**Files:**
- Create: `apps/organizer/organizzazione.html`, `apps/organizer/organizzazione.ts`
- Create: `apps/organizer/impostazioni.html`, `apps/organizer/impostazioni.ts`
- Modify: `shared/chrome.ts` (tab `settings` → `impostazioni.html`)
- Modify: `vite.config.ts` (entry `organizzazione`, `impostazioni`)

**Interfaces:**
- Consumes: `renderOrganizerWorkspace`; `getCurrentOrgId`, `getEvents`, `getBrand`, `setBrand`, `hasModule` (store).

- [ ] **Step 1: Retarget della tab Impostazioni**

In `shared/chrome.ts`, in `renderOrganizerWorkspace`, cambia l'href della tab `settings`:

```ts
    { key: 'settings', label: '⚙ Impostazioni', href: `/apps/organizer/impostazioni.html?event=${id}` },
```

- [ ] **Step 2: Indice Impostazioni**

`apps/organizer/impostazioni.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Impostazioni</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header id="shell"></header>
  <main class="pf-container">
    <div class="pf-pagehead"><div class="pf-eyebrow">Impostazioni</div><h1>Impostazioni evento & organizzazione</h1></div>
    <div id="links"></div>
  </main>
  <script type="module" src="./impostazioni.ts"></script>
</body>
</html>
```

`apps/organizer/impostazioni.ts`:

```ts
import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getEvent } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'settings')

const items = [
  { label: 'Competizione', desc: 'Formato, gironi, finali per categoria', href: `/apps/organizer/competition.html?event=${id}` },
  { label: 'Gironi', desc: 'Composizione dei gironi', href: `/apps/organizer/gironi.html?event=${id}` },
  { label: 'Categorie', desc: 'Categorie e capienza', href: `/apps/organizer/categories.html?event=${id}` },
  { label: 'Brand organizzazione', desc: 'Logo e colori del tuo brand (Pro)', href: `/apps/organizer/organizzazione.html?event=${id}` },
]
document.getElementById('links')!.innerHTML = items.map(i =>
  `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit" href="${i.href}">
    <h2 style="margin:0 0 4px">${i.label}</h2><p class="pf-muted" style="margin:0">${i.desc}</p></a>`).join('')
```

- [ ] **Step 3: Schermata brand**

`apps/organizer/organizzazione.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Brand</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header id="shell"></header>
  <main class="pf-container">
    <div class="pf-pagehead"><div class="pf-eyebrow">Organizzazione</div><h1>Brand</h1></div>
    <div id="flash"></div>
    <div id="body"></div>
  </main>
  <script type="module" src="./organizzazione.ts"></script>
</body>
</html>
```

`apps/organizer/organizzazione.ts`:

```ts
import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getCurrentOrgId, getEvents, getEvent, getBrand, setBrand, hasModule } from '../../shared/mock/store'

const eventId = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const orgId = getCurrentOrgId()
const ev = getEvent(eventId) ?? getEvents().find(e => e.organizationId === orgId)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'settings')

const body = document.getElementById('body')!
if (!hasModule(orgId, 'M-Broadcast')) {
  body.innerHTML = `<div class="pf-card"><h2>🔒 Brand personalizzato — richiede Pro</h2>
    <p class="pf-muted">Con il piano Free il tuo torneo usa il brand PlayFusion. Passa a Pro per usare logo e colori tuoi.</p>
    <a class="pf-btn pf-btn--primary" href="/apps/organizer/abbonamento.html">Passa a Pro</a></div>`
} else {
  const b = getBrand(orgId)
  const cur = { logoText: b?.logoText ?? 'playfusion', primaryColor: b?.primaryColor ?? '#0b5fff', accentColor: b?.accentColor ?? '#ff6b00' }
  body.innerHTML = `<div class="pf-card">
    <div class="pf-field"><label>Logo (testo)</label><input id="b-logo" value="${cur.logoText}" /></div>
    <div class="pf-row" style="gap:var(--space-4)">
      <div class="pf-field"><label>Colore primario</label><input id="b-primary" type="color" value="${cur.primaryColor}" /></div>
      <div class="pf-field"><label>Colore accent</label><input id="b-accent" type="color" value="${cur.accentColor}" /></div>
    </div>
    <div class="pf-card" id="preview" style="margin-top:var(--space-3)"></div>
    <div class="pf-row" style="gap:var(--space-2);margin-top:var(--space-3)">
      <button class="pf-btn pf-btn--primary" id="b-save">Salva</button>
      <button class="pf-btn" id="b-reset">Ripristina default</button>
    </div>
  </div>`
  const logo = () => (document.getElementById('b-logo') as HTMLInputElement).value
  const primary = () => (document.getElementById('b-primary') as HTMLInputElement).value
  const accent = () => (document.getElementById('b-accent') as HTMLInputElement).value
  function preview(): void {
    document.getElementById('preview')!.innerHTML = `<div class="pf-eyebrow">Anteprima</div>
      <div style="font-family:var(--font-display);font-weight:800;font-size:22px;margin:6px 0">${logo()}</div>
      <button class="pf-btn" style="background:${accent()};color:#fff;border-color:transparent">Bottone primario</button>
      <span class="pf-badge" style="background:${primary()};color:#fff">Accent</span>`
  }
  preview()
  ;['b-logo', 'b-primary', 'b-accent'].forEach(idp => document.getElementById(idp)!.addEventListener('input', preview))
  document.getElementById('b-save')!.addEventListener('click', () => {
    setBrand(orgId, { logoText: logo().trim() || 'playfusion', primaryColor: primary(), accentColor: accent() })
    location.reload()
  })
  document.getElementById('b-reset')!.addEventListener('click', () => {
    setBrand(orgId, { logoText: 'playfusion', primaryColor: '#0b5fff', accentColor: '#ff6b00' })
    location.reload()
  })
}
```

- [ ] **Step 4: Vite entries**

In `vite.config.ts`, dopo `abbonamento`:

```ts
        organizzazione: r('apps/organizer/organizzazione.html'),
        impostazioni: r('apps/organizer/impostazioni.html'),
```

- [ ] **Step 5: Build + typecheck + verifica**

Run: `npm run build` → OK. `npx tsc --noEmit` → OK. `npm test` → 120 PASS.
Manuale: da un evento org-1 (Pro), ⚙ Impostazioni → indice → Brand → cambia colori/logo, anteprima aggiorna, Salva → hero e bottoni cambiano colore, wordmark = logo. Da un'org Free (dopo signUp+expire) → schermata brand mostra il lock.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer/organizzazione.html apps/organizer/organizzazione.ts apps/organizer/impostazioni.html apps/organizer/impostazioni.ts shared/chrome.ts vite.config.ts
git commit -m "feat(br): brand editor + Impostazioni index; settings tab points to index"
```

---

### Task 4: Applicazione del brand sulle pagine pubbliche (E3)

**Files (Modify):** `apps/public/{landing,calendar,standings,bracket,avvisi,participants,enroll}.ts`

**Interfaces:**
- Consumes: `applyOrgBrand` (Task 2), `renderPublicTopbar(brandText?)` (Task 2), `getEvent` (store).

Trasformazione **uniforme** per ogni pagina pubblica. Oggi la riga 4 è:
```ts
document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
```
e subito sotto `const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'`.

Sostituisci le due righe con (in quest'ordine — prima `id`, poi il topbar brandizzato):

```ts
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const brandLogo = applyOrgBrand(getEvent(id)?.organizationId ?? 'org-1')
document.getElementById('topbar')!.innerHTML = renderPublicTopbar(brandLogo ?? undefined)
```

Rimuovi la successiva ri-dichiarazione di `const id = …` che ora sarebbe duplicata (ogni pagina la aveva subito dopo la riga topbar — spostata sopra). Aggiorna gli import di ciascuna pagina: aggiungi `applyOrgBrand` a quelli da `../../shared/chrome` e assicurati che `getEvent` sia importato da `../../shared/mock/store` (quasi tutte lo importano già; aggiungilo dove manca).

- [ ] **Step 1: Applica la trasformazione alle 7 pagine**

Per ciascuna (`landing, calendar, standings, bracket, avvisi, participants, enroll`): sposta la lettura di `id` sopra, sostituisci il topbar come indicato, dedup `id`, sistema gli import.

- [ ] **Step 2: Build + typecheck**

Run: `npm run build` → OK. `npx tsc --noEmit` → nessun errore (nessuna doppia dichiarazione di `id`, nessun import mancante).

- [ ] **Step 3: Verifica**

Manuale: con org-1 su brand personalizzato (impostato in Task 3), aprire le pagine pubbliche di un suo evento (`landing.html?event=evt-1`, ecc.) → colori e wordmark riflettono il brand. Con un evento di un'org Free → default PlayFusion.

- [ ] **Step 4: Suite completa**

Run: `npm test` → 120 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/public/landing.ts apps/public/calendar.ts apps/public/standings.ts apps/public/bracket.ts apps/public/avvisi.ts apps/public/participants.ts apps/public/enroll.ts
git commit -m "feat(br): apply tenant brand across public E3 pages"
```

---

## Self-Review

**Spec coverage:**
- `Organization.brand?` + getBrand/setBrand/resolveBrand (M-Broadcast gate) → Task 1. ✓
- `applyOrgBrand` (CSS var override) + shell wordmark + `renderPublicTopbar(brandText?)` + dashboard → Task 2. ✓
- Editor brand (Pro) + lock (Free) + indice ⚙ Impostazioni + retarget tab + vite → Task 3. ✓
- Applicazione su tutte le pagine pubbliche E3 → Task 4. ✓
- Seed senza brand → Task 1 (nessuna modifica al seed). ✓
- Test resolveBrand + gate → Task 1. ✓
- Fuori scope (upload, preset, dark mode, brand per-evento) → non implementati. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando. La trasformazione ripetuta (Task 4) è mostrata una volta con l'elenco esatto delle 7 pagine.

**Type consistency:** `brand` shape `{logoText, primaryColor, accentColor}` identico in types/store/editor/applyOrgBrand; `resolveBrand(): …|null` e `applyOrgBrand(): string|null` firme coerenti tra Task 1/2 e i consumi (Task 2/3/4); `renderPublicTopbar(brandText?)` retro-compatibile; tab `settings` href aggiornato una volta (Task 3) coerente con l'uso in competition/gironi/categorie (invariati, restano `activeKey:'settings'`).
