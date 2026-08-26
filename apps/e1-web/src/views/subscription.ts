import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'
import type { PlanKey, Subscription } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

const PLANS: Array<{ key: PlanKey; label: string; price: number; features: string[] }> = [
  { key: 'FREE', label: 'Free', price: 0, features: ['1 evento attivo', 'Gironi, calendario, classifiche', 'Tabellone pubblico'] },
  { key: 'PRO', label: 'Pro', price: 19, features: ['Eventi illimitati', 'Avvisi al pubblico', 'Riscossione quote', 'Brand personalizzato'] },
  { key: 'BUSINESS', label: 'Business', price: 29, features: ['Tutto di Pro', 'Multi-organizzazione', 'Supporto prioritario'] },
]
const planLabel = (k: PlanKey): string => PLANS.find((p) => p.key === k)?.label ?? k

function statusLine(sub: Subscription): string {
  if (sub.status === 'TRIAL') return `<span class="pf-badge">Prova Pro</span> <b>${sub.trialDaysLeft}</b> giorn${sub.trialDaysLeft === 1 ? 'o' : 'i'} rimast${sub.trialDaysLeft === 1 ? 'o' : 'i'}`
  return sub.plan === 'FREE' ? `<span class="pf-badge">Free</span> Piano gratuito limitato` : `<span class="pf-badge">${esc(planLabel(sub.plan))}</span> Attivo · rinnovo ${esc(sub.renewsOn)}`
}

function planCard(p: (typeof PLANS)[number], sub: Subscription): string {
  // "Paid current" = the active paid plan. A PRO trial is NOT paid-current: the Pro card still
  // offers "Attiva Pro" (convert trial → paid), and is highlighted as the plan in use.
  const paidCurrent = p.key === 'FREE' ? sub.plan === 'FREE' : p.key === 'PRO' ? sub.plan === 'PRO' && sub.status === 'ACTIVE' : false
  const trialingPro = p.key === 'PRO' && sub.status === 'TRIAL'
  const feats = p.features.map((f) => `<li>${esc(f)}</li>`).join('')
  let cta = ''
  if (paidCurrent) cta = `<span class="pf-badge pf-badge--paid">Piano attuale</span>`
  else if (p.key === 'PRO') cta = `<button class="pf-btn pf-btn--primary" id="activate-pro">Attiva Pro</button>${trialingPro ? ' <span class="pf-muted">in prova ora</span>' : ''}`
  else if (p.key === 'BUSINESS') cta = `<a class="pf-btn pf-btn--ghost" href="mailto:sales@playfusion.example">Contattaci</a>`
  return `<div class="pf-card pf-plan${paidCurrent || trialingPro ? ' pf-plan--current' : ''}">
    <div class="pf-eyebrow">${esc(p.label)}</div>
    <div class="pf-plan__price">${p.price === 0 ? 'Gratis' : `€${p.price}<span class="pf-muted">/mese</span>`}</div>
    <ul class="pf-plan__feats">${feats}</ul>
    <div>${cta}</div>
  </div>`
}

export function renderSubscription(sub: Subscription): string {
  const expireLever = sub.status === 'TRIAL'
    ? `<button class="pf-btn pf-btn--ghost" id="expire-trial">Simula scadenza prova</button>`
    : ''
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container">
      <div class="pf-pagehead"><div class="pf-eyebrow">Account</div><h1>Abbonamento</h1></div>
      <div id="err"></div>
      <div class="pf-card"><h2 class="pf-h3">Il tuo piano</h2><p>${statusLine(sub)}</p>${expireLever}</div>
      <div class="pf-plangrid">${PLANS.map((p) => planCard(p, sub)).join('')}</div>
      <div class="pf-row" style="margin-top:var(--space-md)"><a class="pf-btn" href="#/">← Torna ai tornei</a></div>
    </main>`
}

export const subscriptionScreen: Screen<Subscription> = {
  load: (ctx) => ctx.client.o11.getSubscription(ctx.orgId),
  render: (sub) => renderSubscription(sub),
  mount(root, ctx: ViewCtx) {
    const fail = (msg: string) => { root.querySelector('#err')!.innerHTML = inlineError(msg) }
    root.querySelector<HTMLButtonElement>('#activate-pro')?.addEventListener('click', async () => {
      try { await ctx.client.o11.activatePro(ctx.orgId); ctx.refresh() }
      catch { fail('Attivazione non riuscita. Riprova.') }
    })
    root.querySelector<HTMLButtonElement>('#expire-trial')?.addEventListener('click', async () => {
      try { await ctx.client.o11.expireTrial(ctx.orgId); ctx.refresh() }
      catch { fail('Operazione non riuscita. Riprova.') }
    })
  },
}
