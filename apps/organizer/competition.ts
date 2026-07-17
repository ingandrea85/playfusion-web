import { renderOrganizerTopbar } from '../../shared/chrome'
import { getCategories, getCompetition, applyToAllCategories, upsertCompetition } from '../../shared/mock/store'
import type { CompetitionConfig } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const cats = getCategories(id)
const DEFAULT: CompetitionConfig = { format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' }

function sameConfig(a: CompetitionConfig, b: CompetitionConfig): boolean {
  return a.format === b.format && a.legs === b.legs && a.groupsCount === b.groupsCount
    && a.qualifiersPerGroup === b.qualifiersPerGroup && a.finalsType === b.finalsType
    && (a.thirdPlace ?? false) === (b.thirdPlace ?? false)
}
function allSame(): boolean {
  const comps = cats.map(c => getCompetition(c.id))
  if (comps.length === 0 || comps.some(c => !c)) return false
  return (comps as CompetitionConfig[]).every(c => sameConfig(c, comps[0] as CompetitionConfig))
}

function configFields(cfg: CompetitionConfig): string {
  const opt = (v: string, cur: string, label: string) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`
  const ko = cfg.format === 'GROUPS_KNOCKOUT'
  return `
    <div class="pf-field"><label>Formato</label>
      <select name="format">
        ${opt('ROUND_ROBIN', cfg.format, "Girone all'italiana")}
        ${opt('GROUPS_KNOCKOUT', cfg.format, 'Gironi + tabellone')}
      </select></div>
    <div class="pf-field"><label>Modalità</label>
      <select name="legs">
        ${opt('SINGLE', cfg.legs, 'Girone singolo')}
        ${opt('HOME_AWAY', cfg.legs, 'Andata e ritorno')}
      </select></div>
    <div class="js-ko" style="display:${ko ? 'block' : 'none'}">
      <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
        <div class="pf-field" style="flex:1;margin-bottom:0"><label>N. gironi</label><input name="groupsCount" type="number" min="1" value="${cfg.groupsCount}" /></div>
        <div class="pf-field" style="flex:1;margin-bottom:0"><label>Qualificate per girone</label><input name="qualifiersPerGroup" type="number" min="1" value="${cfg.qualifiersPerGroup}" /></div>
      </div>
      <div class="pf-field"><label>Tipo finali</label>
        <select name="finalsType">
          ${opt('PLACEMENT', cfg.finalsType, 'Piazzamento')}
          ${opt('SINGLE_GROUP_CROSSOVER', cfg.finalsType, 'Crossover girone unico')}
          ${opt('SPLIT_GROUP_FINALS', cfg.finalsType, 'Split-group')}
        </select></div>
      <div class="pf-field"><label><input type="checkbox" name="thirdPlace" ${cfg.thirdPlace ? 'checked' : ''} /> Finale 3º/4º</label></div>
    </div>`
}

function readConfig(form: HTMLFormElement): CompetitionConfig {
  const d = new FormData(form)
  return {
    format: d.get('format') as CompetitionConfig['format'],
    legs: d.get('legs') as CompetitionConfig['legs'],
    groupsCount: Number(d.get('groupsCount')),
    qualifiersPerGroup: Number(d.get('qualifiersPerGroup')),
    finalsType: d.get('finalsType') as CompetitionConfig['finalsType'],
    thirdPlace: (form.querySelector('input[name=thirdPlace]') as HTMLInputElement | null)?.checked ?? false,
  }
}

function wireConditional(scope: HTMLElement): void {
  const fmt = scope.querySelector<HTMLSelectElement>('select[name="format"]')!
  const ko = scope.querySelector<HTMLElement>('.js-ko')!
  fmt.addEventListener('change', () => { ko.style.display = fmt.value === 'GROUPS_KNOCKOUT' ? 'block' : 'none' })
}

let uniform = allSame()
const toggle = document.getElementById('uniform') as HTMLInputElement
toggle.checked = uniform
toggle.addEventListener('change', () => { uniform = toggle.checked; render() })

function flash(msg: string): void {
  document.getElementById('flash')!.innerHTML = `<div class="pf-flash">✓ ${msg}</div>`
}

function render(): void {
  const content = document.getElementById('content')!
  document.getElementById('flash')!.innerHTML = ''
  if (cats.length === 0) {
    content.innerHTML = `<div class="pf-card pf-muted">Nessuna categoria. Aggiungile prima nello step Categorie.</div>`
    return
  }
  if (uniform) {
    const shared = getCompetition(cats[0].id) ?? DEFAULT
    content.innerHTML = `
      <form class="pf-card" id="common">
        <h2>Schema comune</h2>
        ${configFields(shared)}
        <button class="pf-btn pf-btn--primary" type="submit">Applica a tutte le categorie</button>
      </form>
      <div class="pf-card">
        <h2>Categorie</h2>
        <p class="pf-muted">Applicato a: ${cats.map(c => c.name).join(', ')}</p>
      </div>`
    const form = document.getElementById('common') as HTMLFormElement
    wireConditional(form)
    form.addEventListener('submit', (e) => { e.preventDefault(); applyToAllCategories(id, readConfig(form)); render(); flash('Configurazione applicata a tutte le categorie') })
  } else {
    content.innerHTML = cats.map(c => {
      const cfg = getCompetition(c.id) ?? DEFAULT
      return `<form class="pf-card js-catform" data-cat="${c.id}">
        <div class="pf-cat__label" style="margin-bottom:var(--space-3)">${c.name}</div>
        ${configFields(cfg)}
        <button class="pf-btn pf-btn--primary" type="submit">Salva ${c.name}</button>
      </form>`
    }).join('')
    document.querySelectorAll<HTMLFormElement>('.js-catform').forEach(form => {
      wireConditional(form)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        upsertCompetition({ eventId: id, categoryId: form.dataset.cat!, ...readConfig(form) })
        render()
        const cat = cats.find(c => c.id === form.dataset.cat)
        flash(`Categoria ${cat?.name ?? ''} salvata`)
      })
    })
  }
}
render()
