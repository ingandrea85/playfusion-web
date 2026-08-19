import type { EventDetail, RegistrationWindowView, ApplyRegistrationInput } from '@playfusion/rest-client'
import { renderPublicTopbar, esc } from '@playfusion/app-shell'

/** Categories a coach can still apply to: present on the event and not full. A category
 *  with no window capacity entry is treated as open (the window carries caps only for
 *  categories that were given one). */
export function openCategories(event: EventDetail, window: RegistrationWindowView): string[] {
  return event.categorie.filter((c) => {
    const w = window.categories.find((x) => x.categoria === c)
    return w ? w.remaining > 0 : true
  })
}

/** Assembles the apply DTO from the form fields, trimming the free-text team name. */
export function buildApplyInput(sportEventId: string, fields: { participantRef: string; categoria: string }): ApplyRegistrationInput {
  return { participantRef: fields.participantRef.trim(), sportEventId, categoria: fields.categoria }
}

/** One <option> per category, showing its fill count; full categories (no room left) are
 *  disabled and labelled "(completa)" instead of being hidden — so the coach sees the whole
 *  set and understands why a category isn't selectable (matches the mockup). */
function categoryOptions(event: EventDetail, window: RegistrationWindowView): string {
  return event.categorie.map((c) => {
    const w = window.categories.find((x) => x.categoria === c)
    const cap = w?.cap ?? 0
    const count = w?.count ?? 0
    const full = cap > 0 && count >= cap
    const meta = cap > 0 ? ` — ${count}/${cap}${full ? ' · completa' : ''}` : ''
    return `<option value="${esc(c)}"${full ? ' disabled' : ''}>${esc(c)}${meta}</option>`
  }).join('')
}

export function renderApply(event: EventDetail, window: RegistrationWindowView, hasToken: boolean): string {
  const head = `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Iscrizione</div><h1>${esc(event.name ?? event.sport)}</h1></div>`
  // Without a magic-link token the O5 apply call would 401 — show the notice instead of a form.
  if (!hasToken) {
    return `${head}
      <div class="pf-card pf-muted">Apri il link ricevuto dall'organizzatore per iscrivere la tua squadra.</div>
    </main>`
  }
  // No category still has room → nothing to apply to; explain instead of a dead form.
  if (openCategories(event, window).length === 0) {
    return `${head}
      <div class="pf-card pf-muted">Tutte le categorie sono complete: non è più possibile iscriversi.</div>
    </main>`
  }
  return `${head}
      <div id="msg"></div>
      <form id="apply" class="pf-card">
        <div class="pf-field"><label>Nome squadra</label><input name="participantRef" required placeholder="es. Falchi Rossi" /></div>
        <div class="pf-field"><label>Categoria</label><select name="categoria" required>${categoryOptions(event, window)}</select></div>
        <button class="pf-btn pf-btn--primary pf-btn--lg" type="submit" data-apply>Invia iscrizione</button>
      </form>
    </main>`
}
