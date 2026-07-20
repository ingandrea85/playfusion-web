# cm1 — Bacheca avvisi (comunicazioni, slice 1)

**Data:** 2026-07-20
**Stato:** design approvato, pronto per il piano
**Esperienze toccate:** E1 Organizer, E3 Public

## Obiettivo

Dare all'organizer un canale per comunicare con squadre e pubblico: pubblica
un avviso dall'E1, l'avviso compare in E3. Prima fetta del filone
"comunicazioni". Vertical slice sottile e navigabile end-to-end, coerente col
demo-loop del mockup (stato finto: seed + `localStorage`, nessun backend).

## Scope della fetta

Una **bacheca avvisi** per evento. Ogni avviso ha un titolo, un testo, un
targeting opzionale per categoria e un flag "in evidenza". L'organizer crea ed
elimina avvisi e può metterli/toglierli dall'evidenza; il pubblico li legge in
una pagina dedicata, con l'ultimo avviso mostrato in evidenza su landing e
calendario.

## Modello dati

Nuova entità in `shared/mock/types.ts`:

```ts
export interface Announcement {
  id: string
  eventId: string
  categoryId: string | null   // null = tutto l'evento
  title: string
  body: string
  pinned: boolean             // "in evidenza"
  createdAt: string           // ISO string
}
```

- `State.announcements: Announcement[]` aggiunto a `State` in `types.ts`.
- La migrazione del `localStorage` deve tollerare stati salvati senza il campo
  (default `[]`), coerentemente con come lo store già gestisce le chiavi nuove.

### Funzioni store (`shared/mock/store.ts`)

- `getAnnouncements(eventId: string): Announcement[]`
  Ritorna gli avvisi dell'evento **ordinati**: prima i `pinned` (true prima di
  false), poi per `createdAt` decrescente (più recente prima).
- `addAnnouncement(input: { eventId; categoryId: string | null; title; body; pinned }): Announcement`
  Genera `id` e `createdAt`, persiste, ritorna l'avviso creato.
- `removeAnnouncement(id: string): void`
- `togglePin(id: string): void` — inverte `pinned` sull'avviso indicato.

### Seed (`shared/mock/seed.ts`)

Su `evt-1`, 2-3 avvisi demo che mostrino i casi:
- uno **evento-wide** non in evidenza (es. "Ritrovo mezz'ora prima"),
- uno **su una categoria specifica** (es. cambio campo per una categoria),
- uno **in evidenza** (es. "Iscrizioni chiuse: ecco i gironi").

## E1 Organizer — `apps/organizer/avvisi.html` + `avvisi.ts`

- Raggiungibile dall'`event-hub` (nuova voce/card "Avvisi" o "Bacheca").
- Topbar organizer + link "back" all'event-hub, come le altre pagine E1.

**Form di pubblicazione:**
- `titolo` (input testo, obbligatorio)
- `testo` (textarea, obbligatorio)
- `categoria` (select: prima opzione "Tutte le categorie" → `categoryId = null`,
  poi una opzione per categoria dell'evento)
- checkbox **In evidenza** (`pinned`)
- pulsante **Pubblica** → `addAnnouncement`, poi re-render e reset form.

**Riga "reach" simulata** (sotto al form): testo muted che indica
*"Sarà visibile a N squadre confermate"*, dove N è il numero di `Registration`
con `status === 'CONFIRMED'` nello scope selezionato (tutte le categorie
dell'evento se `categoryId === null`, altrimenti solo quella categoria). È un
tocco mock per rendere tangibile il "reach": nessun invio email/SMS reale.

**Lista avvisi pubblicati** (sotto): per ogni avviso — titolo, testo, tag
categoria (o "Tutte le categorie"), badge "In evidenza" se `pinned`, timestamp;
azioni per riga: **Elimina** (`removeAnnouncement`) e **toggle In evidenza**
(`togglePin`). Ordine come da `getAnnouncements`.

## E3 Public — `apps/public/avvisi.html` + `avvisi.ts`

- Pagina pubblica dedicata: lista completa degli avvisi dell'evento.
- **Filtro per categoria** con il pattern chip/tab già usato altrove in public
  (es. calendario/classifiche): "Tutte" + una chip per categoria. Un avviso
  evento-wide (`categoryId === null`) è sempre mostrato in ogni filtro.
- Link "Avvisi" nella nav della `landing.html`.

**In evidenza (cross-page):**
- Su `landing.html`: card in testa che mostra l'avviso in evidenza — il primo
  di `getAnnouncements` (quindi un `pinned` se esiste, altrimenti il più
  recente). Se non ci sono avvisi, la card non compare.
- Su `calendar.html` (public): striscia compatta in cima con lo stesso avviso in
  evidenza, con link ad `avvisi.html`. Il calendario resta read-only.

## Test — `shared/mock/announcements.test.ts`

Test unitari sullo store (stile scenario-driven, uno per caso):
- ordinamento: i `pinned` precedono i non-pinned; a parità, il più recente prima;
- `getAnnouncements` filtra per `eventId`;
- `addAnnouncement` genera id/createdAt e persiste;
- `removeAnnouncement` rimuove solo l'avviso indicato;
- `togglePin` inverte il flag;
- il conteggio "reach" per scope (helper puro, se estratto) conta le
  `CONFIRMED` giuste per evento-wide vs categoria.

## Fuori scope (YAGNI — possibili slice successive)

- Email/SMS/push reali (qui è solo feed in-app + etichetta reach simulata).
- Messaggi diretti organizer ↔ singola squadra (thread).
- Ricevute di lettura / conteggio visualizzazioni.
- Editing in-place di un avviso esistente (si elimina e si ri-pubblica).
- Rich text nel corpo dell'avviso.
- **Notifiche automatiche** da eventi di dominio ("Calendario pubblicato",
  "Match spostato", "Iscrizione confermata") → candidata **slice 2 (cm2)**.

## Naming

Tag di fetta **`cm1`** (comunicazioni slice 1), sullo stile `o8b3` / `pb2` per
doc e messaggi di commit.
