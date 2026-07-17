# Design — E4 Admin: billing / subscription (B) — O11

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; Blueprint `o11-billing.md`; segue E4a (tenant monitoring).

## Contesto e obiettivo

Seconda fetta di E4: la **subscription Playfusion→società** (O11, CP19) nel back-office. Solo abbonamento (piano/stato/rinnovo) — niente fatture (CP20 rimandata). Mockup mid-fi.

## Scope

**Incluso:** entità `Subscription` (una per org) + tabella `PLANS`; store ops; sezione "Abbonamento" nel dettaglio organizzazione (piano/stato/prezzo/rinnovo, cambia piano/stato).

**Non incluso:** fatture / fattura elettronica IT (CP20); cruscotto billing globale; pagamenti/proration reali.

## Modello (mock store)

```
PlanKey = 'FREE' | 'PRO' | 'BUSINESS'
SubStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE'
Subscription { organizationId: string; plan: PlanKey; status: SubStatus; renewsOn: string }
```
- `State.subscriptions: Subscription[]` (una per org). Seed `[]`? No — seed una per org:
  - `org-1` PRO / ACTIVE / renewsOn `2027-01-10`
  - `org-2` FREE / TRIAL / `2026-08-15`
  - `org-3` PRO / PAST_DUE / `2026-07-01`
  - `org-4` BUSINESS / ACTIVE / `2027-03-20`
- Prezzo derivato (NON salvato) da `PLANS` (in `shared/mock/plans.ts` o inline): `FREE €0`, `PRO €19`, `BUSINESS €29` al mese (illustrativi, fascia prosumer). Le etichette/prezzi vivono in una costante condivisa riusata da store-test e UI.

## Store

- `getSubscription(orgId): Subscription | undefined`
- `setSubscriptionPlan(orgId, plan: PlanKey): void`
- `setSubscriptionStatus(orgId, status: SubStatus): void`
- Reset ripristina il seed.

## UI — sezione "Abbonamento" in `apps/admin/organization.ts`

Sotto la sezione Moduli, una card **Abbonamento**:
- **Piano**: `<select>` (Free/Pro/Business) → `setSubscriptionPlan` + re-render.
- **Stato**: badge (Trial neutro / Attivo verde / Insoluto rosso) + `<select>` per cambiarlo → `setSubscriptionStatus`.
- **Prezzo/mese**: derivato dal piano (`€0` / `€19` / `€29`), in mono.
- **Prossimo rinnovo**: `renewsOn` (mono).
- Se manca la subscription per l'org: messaggio "Nessun abbonamento".

(Opzionale, se leggero: chip piano nella lista organizzazioni.)

## Revisione Blueprint

**D-O11-1** (`o11-billing.md`): un tenant ha una **Subscription** (piano, stato Trial/Active/PastDue, data di rinnovo) come stato di O11 Billing (CP19). Coerente con **ADR-007**: il *tier/prezzo* è concern di packaging del Product Catalog (derivato), mentre la *subscription* è il rapporto commerciale Playfusion→Organization owned da O11. La fattura elettronica IT (CP20) è rimandata.

## Criteri di successo

1. Nel dettaglio org compare la card Abbonamento con piano/stato/prezzo/rinnovo del seed (org-3 = PAST_DUE).
2. Cambiare piano aggiorna il prezzo mostrato; cambiare stato aggiorna il badge; entrambi persistono; reset ripristina.
3. E1/E3 invariati; store test (subscription) verdi.

## Fuori scope / futuro

Fatture + fattura elettronica IT (CP20); cruscotto ricavi; pagamenti reali; legame piano↔moduli attivi (packaging).
