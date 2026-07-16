# Design — Mockup navigabili E1 (Organizer) + E3 (Public)

- **Data:** 2026-07-16
- **Stato:** approvato in brainstorming, in attesa di review della spec
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-2-0-product-decisions]] (Experiences E1–E4, PB-1), [[playfusion-2-0-blueprint-execution-state]] (pilot Bundle Enrollment)

## Contesto e obiettivo

Il backend 2.0 è stato validato dal pilot "Bundle Enrollment" (`playfusion-pilot/`): 5 bounded context + workflow PB-1 (Setup), tutto merge-ready, ma **solo backend, nessun frontend**.

Prima di agganciare un frontend reale al pilot vogliamo **disegnare il frontend costruendo mockup navigabili**, per validare flussi e layout a basso costo. Questo primo giro copre **E1 Organizer** ed **E3 Public** (poi si estende a E2 Referee ed E4 Admin).

## Scope

**Incluso:**
- E1 Organizer e E3 Public, sul flusso **Bundle Enrollment** = Setup di PB-1 fino a "quota pagata" (ciò che il pilot backend fa davvero).
- Anello end-to-end navigabile: Organizer apre iscrizioni + genera link → Coach si iscrive via link → iscrizione compare nella inbox Organizer → conferma + registrazione quota.

**Non incluso (stub visibili o rimandati):**
- Step PB-1 successivi a "quota pagata" (genera calendario → approva → pubblica): mostrati **visibili ma disabilitati** in E1, non implementati.
- Classifiche / calendario in E3 (fase Operations): stub, oltre il pilot.
- E2 Referee ed E4 Admin: giro successivo.
- Qualsiasi integrazione con backend reale, Auth0, deploy.

## Decisioni

### D1 — Topologia repo
- `playfusion-web` = **monorepo web** per le Experience web (E1, E3, poi E4). **Per ora contiene solo i mockup.**
- La parte **mobile** (E2 Referee PWA, futuro nativo) avrà un **repo separato** quando ci si arriva.
- Il consolidamento definitivo (contracts condivisi con il backend, ecc.) si valuta quando si aggancia il frontend al pilot — fuori da questo scope.

### D2 — Fedeltà: mid-fidelity (opzione B)
- Pagine reali navigabili (routing vero, dati mock), stile allineato ai **design token** esistenti come CSS custom properties.
- **Non** si trascina dentro la libreria `pf-*` del design system: i mockup restano self-contained e leggeri.
- Sono un artefatto di design, non prodotto da mantenere.

### D3 — Stack
- **Vite + HTML/CSS/TS vanilla** (niente framework): il design system è a web component e non si vuole vincolare la scelta framework delle Experience reali.
- Stile da **design token** copiati/riusati come CSS custom properties.

## Inventario schermate

### E1 — Organizer (desktop-first, mobile-adaptive)
1. **Dashboard eventi** — lista tornei + "Crea evento".
2. **Crea evento** — wizard: scegli template (PB-1 Memorial), nome, date, sport.
3. **Hub evento / Setup** — avanzamento del Playbook come checklist guidata + link alle azioni.
4. **Categorie** — aggiungi/gestisci categorie (U10/U12/U14).
5. **Iscrizioni** — apri/chiudi iscrizioni + genera link condivisibile (ponte verso E3).
6. **Inbox iscrizioni** — squadre iscritte, conferma team.
7. **Quote / Pagamenti** — stato quota per squadra (M-Payments).
8. *(Disabilitati/stub: Genera calendario → Approva → Pubblica.)*

### E3 — Public (mobile-first, no signup)
1. **Landing pubblica evento** — hero, info, categorie, CTA "Iscrivi la squadra".
2. **Form iscrizione pubblica** — il coach iscrive la squadra (alimenta la inbox di E1).
3. **Elenco iscritti / categorie** — chi è iscritto.
4. *(Stub: classifiche / calendario.)*

## Modello di navigazione — l'anello vive

Ponte narrativo = link condivisibile:
- In E1 "Genera link iscrizioni" mostra un URL finto che **naviga davvero** alla landing E3.
- Il form E3 al submit **scrive in `localStorage`** (backend finto condiviso tra le due app).
- La inbox E1 **legge da `localStorage`** → l'iscrizione fatta in E3 compare, confermabile + quota segnabile.
- Pulsante **"reset demo"**: ripulisce lo store e ricarica i dati seed.

Così l'intero Bundle Enrollment è navigabile end-to-end **senza backend**, ma con stato persistente per la sessione.

## Struttura cartelle

```
playfusion-web/
  apps/
    organizer/     # E1 — mockup, desktop-first mobile-adaptive
    public/        # E3 — mockup, mobile-first
  shared/
    tokens.css     # design token (custom properties)
    mock/          # dati seed JSON + store finto (localStorage helper)
    ui.css         # stili condivisi (chrome, bottoni)
  index.html       # hub: link a Organizer e Public
```

La struttura `apps/organizer` + `apps/public` **prefigura** le Experience reali: i pattern si travasano.

## Dati mock (seed)

Scenario realistico: Memorial "Torneo Estivo", 2-3 categorie (U10/U12/U14), qualche squadra pre-iscritta con quote in stati diversi (da pagare / pagata). `localStorage` fa da overlay per nuove iscrizioni e conferme.

## Criteri di successo

1. Da `index.html` si raggiungono entrambe le app.
2. In E1 si crea un evento (mock), si configurano categorie, si aprono iscrizioni e si genera un link.
3. Il link porta alla landing E3; da lì si completa un'iscrizione.
4. L'iscrizione compare nella inbox E1 e la si conferma + si segna la quota pagata.
5. Lo stile è riconoscibilmente Playfusion (design token) e i layout sono coerenti con i form factor (E1 desktop-first, E3 mobile-first).
6. "Reset demo" riporta allo stato seed.

## Fuori scope / futuro

- E2 Referee (repo mobile separato), E4 Admin.
- Aggancio al backend pilot, contracts condivisi, Auth0, deploy.
- Fasi PB-1 Operations/Wrap-up.
