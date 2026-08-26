import type { AnnouncementView, EventDetail } from '@playfusion/rest-client'
import { renderPublicTopbar, renderTabs, esc } from '@playfusion/app-shell'

const scopeLabel = (categoryId: string | null): string => categoryId ?? 'Tutte le categorie'

/** Announcements visible for the selected filter: event-wide (null) always show; a selected
 *  category shows event-wide + that category; 'ALL' shows everything. */
export function filterAnnouncements(list: AnnouncementView[], sel: string): AnnouncementView[] {
  return list.filter((a) => sel === 'ALL' || a.categoryId === null || a.categoryId === sel)
}

function renderCards(list: AnnouncementView[]): string {
  if (!list.length) return `<div class="pf-card pf-muted">Nessun avviso pubblicato.</div>`
  return list.map((a) => `<div class="pf-card">
    <div>${a.pinned ? '<span class="pf-annchip">In evidenza</span> ' : ''}<b>${esc(a.title)}</b> <span class="pf-mono pf-muted">· ${esc(scopeLabel(a.categoryId))}</span></div>
    <p style="margin:8px 0 0">${esc(a.body)}</p>
  </div>`).join('')
}

/** Public, read-only announcements (S15) with a category filter. Call wirePublicAvvisi after mount. */
export function renderPublicAvvisi(event: EventDetail, announcements: AnnouncementView[]): string {
  const id = encodeURIComponent(event.sportEventId)
  const tabs = [{ key: 'ALL', label: 'Tutte' }, ...event.categorie.map((c) => ({ key: c, label: c }))]
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Avvisi</h1></div>
      <div id="av-tabs">${renderTabs(tabs, 'ALL')}</div>
      <div id="av-list" class="pf-stack">${renderCards(filterAnnouncements(announcements, 'ALL'))}</div>
      <div class="pf-row" style="margin-top:var(--space-md)"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}

export function wirePublicAvvisi(root: ParentNode, event: EventDetail, announcements: AnnouncementView[]): void {
  const list = root.querySelector('#av-list'); if (!list) return
  const tabbar = root.querySelector('#av-tabs')!
  const tabs = [{ key: 'ALL', label: 'Tutte' }, ...event.categorie.map((c) => ({ key: c, label: c }))]
  let sel = 'ALL'
  function draw() {
    tabbar.innerHTML = renderTabs(tabs, sel)
    tabbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { sel = b.dataset.key!; draw() }))
    list.innerHTML = renderCards(filterAnnouncements(announcements, sel))
  }
  draw()
}
