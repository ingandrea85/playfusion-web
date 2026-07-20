# br — Organization brand identity

**Data:** 2026-07-21
**Stato:** design approvato, pronto per il piano
**Esperienze toccate:** E1 Organizer (impostazioni + shell), E3 Public (portale)
**Attua:** Blueprint **D-O1-1** (brand identity posseduta dall'Organization, presentation metadata, gated da M-Broadcast)

## Obiettivo

Dare all'`Organization` un brand (colori + logo testuale) modificabile dall'organizer e applicato allo shell organizer e al portale pubblico, **gated da M-Broadcast** (Free = brand PlayFusion di default; Pro = brand proprio). Presentation metadata pura: nessun campo sul dominio sportivo (Event/Category/…), coerente con *Domain First*.

## Modello dati

`Organization` (in `shared/mock/types.ts`) guadagna:
```ts
brand?: { logoText: string; primaryColor: string; accentColor: string }
```
- `primaryColor`/`accentColor`: stringhe colore CSS (es. `#0b5fff`).
- `logoText`: il wordmark testuale che sostituisce "playfusion".
- Nel seed **nessuna org ha `brand`** (restano sul default PlayFusion); la personalizzazione si dimostra dal vivo dalla schermata impostazioni.

Store:
- `getBrand(orgId): Organization['brand']` — il brand grezzo salvato (indipendente dal gate).
- `setBrand(orgId, brand): void` — salva/aggiorna.
- `resolveBrand(orgId): { logoText: string; primaryColor: string; accentColor: string } | null` — **puro/testabile**: ritorna il brand da applicare **solo se** `hasModule(orgId,'M-Broadcast')` **e** `brand` è impostato; altrimenti `null` (→ default PlayFusion).

## Theming

Il design system usa già CSS custom properties in `tokens.css` (`--color-action-primary`, `--color-action-accent`). Nuovo helper in `shared/chrome.ts`:
```ts
applyOrgBrand(orgId: string): string | null
```
- legge `resolveBrand(orgId)`; se non-null, esegue `document.documentElement.style.setProperty('--color-action-primary', b.primaryColor)` e `...('--color-action-accent', b.accentColor)`, e ritorna `b.logoText`;
- se null, non tocca nulla e ritorna `null` (resta il tema/wordmark di default).

Applicazione (un punto per lato):
- **Organizer**: dentro `renderOrganizerWorkspace(event, activeKey)` — chiama `applyOrgBrand(event.organizationId)` e, se ritorna un `logoText`, lo usa al posto di `play<b>fusion</b>` nel wordmark dello shell. Copre tutte le pagine evento. La **dashboard** (senza evento) chiama `applyOrgBrand(getCurrentOrgId())` in `dashboard.ts`.
- **Pubblico E3**: `renderPublicTopbar(brandText?)` accetta un logo opzionale; ogni pagina pubblica risolve `event.organizationId`, chiama `applyOrgBrand(orgId)` e passa il `logoText` al topbar. Pagine: `landing`, `calendar`, `standings`, `bracket`, `avvisi`, `participants`, `enroll`.

## Schermata E1 "Impostazioni organizzazione" — `apps/organizer/organizzazione.html` + `.ts`

- **Pro** (org con M-Broadcast): form `logoText` (input testo), `primaryColor` + `accentColor` (input `type="color"`), **anteprima live** (un mini blocco: wordmark + un bottone primario + un badge accent che riflettono i valori correnti del form) e **Salva** → `setBrand` → ricarica/riapplica il tema. Un bottone "Ripristina default" cancella il brand.
- **Free**: card lock "🔒 Brand personalizzato — richiede Pro" + link ad `abbonamento` (stesso pattern di payments/avvisi in `ac`).
- Usa lo shell (`activeKey: 'settings'`).

## ⚙ Impostazioni → indice — `apps/organizer/impostazioni.html` + `.ts`

Lo shell oggi fa puntare la tab **⚙ Impostazioni** a `competition.html`. Diventa un piccolo **indice** `impostazioni.html` (activeKey `settings`) con link a: **Competizione**, **Gironi**, **Categorie**, **Brand organizzazione**. Aggiorno il target della tab `settings` in `renderOrganizerWorkspace` a `impostazioni.html`. Le pagine competition/gironi/categorie restano invariate (mantengono `activeKey:'settings'`, evidenziata).

## Gating

Modifica **e** applicazione del brand sono gated su **M-Broadcast** (via `hasModule`/`resolveBrand`). Un'org Free: schermata brand bloccata; shell e pubblico restano sul default. Su Pro: modifica attiva e tema applicato ovunque.

## Vite

Nuovi entry `organizzazione` e `impostazioni` in `vite.config.ts`.

## Test — `shared/mock/brand.test.ts`

Scenario-driven (reset seed):
- `setBrand`/`getBrand` persistono il brand su un'org.
- `resolveBrand` ritorna il brand quando l'org ha M-Broadcast + brand; ritorna `null` se manca il brand; ritorna `null` se l'org non ha M-Broadcast (es. dopo `expireTrial`, moduli ridotti) anche se `brand` è salvato.
- Suite esistente (115) resta verde.

Le pagine/shell/theming si verificano con `npm run build` + `tsc --noEmit` + verifica manuale (no unit test di pagina, come nel repo).

## Fuori scope (YAGNI)

Upload logo immagine, font custom, preset/temi multipli, dark mode, brand per singolo evento (vietato da D-O1-1), validazione contrasto/accessibilità dei colori, persistenza del brand oltre `localStorage`.

## Naming

Tag di fetta **`br`**.
