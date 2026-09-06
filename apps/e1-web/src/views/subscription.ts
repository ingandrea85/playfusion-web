import { esc } from '@playfusion/app-shell'
import type { PlanKey, Subscription } from '@playfusion/rest-client'
import { inlineError, notAuthorizedCard, type Screen, type ViewCtx } from '../view.js'
import { renderOrgShell } from './org.js'

export interface SubscriptionData { sub?: Subscription; forbidden?: boolean }

interface PlanDef { key: PlanKey; label: string; priceMonthly: number | null; priceYearly: number | null; features: string[] }
const PLANS: PlanDef[] = [
  { key: 'FREE', label: 'Free', priceMonthly: 0, priceYearly: 0, features: ['1 evento attivo', 'Gironi, calendario, classifiche', 'Tabellone pubblico'] },
  { key: 'STARTER', label: 'Starter', priceMonthly: 15, priceYearly: 150, features: ['Eventi illimitati', 'Finali e formule personalizzate', 'Avvisi al pubblico'] },
  { key: 'CLUB', label: 'Club', priceMonthly: 45, priceYearly: 450, features: ['Tutto di Starter', 'Riscossione quote iscrizione', 'Logistica post-partita (docce, terzo tempo)', 'Brand e sito evento personalizzati'] },
  { key: 'ENTERPRISE', label: 'Enterprise', priceMonthly: null, priceYearly: null, features: ['Tutto di Club', 'Multi-società, regia centralizzata', 'SSO e supporto prioritario'] },
]
const planLabel = (k: PlanKey): string => PLANS.find((p) => p.key === k)?.label ?? k

function statusLine(sub: Subscription): string {
  if (sub.status === 'TRIAL') return `<span class="pf-badge">Prova Club</span> <b>${sub.trialDaysLeft}</b> giorn${sub.trialDaysLeft === 1 ? 'o' : 'i'} rimast${sub.trialDaysLeft === 1 ? 'o' : 'i'}`
  return sub.plan === 'FREE' ? `<span class="pf-badge">Free</span> Piano gratuito limitato` : `<span class="pf-badge">${esc(planLabel(sub.plan))}</span> Attivo · rinnovo ${esc(sub.renewsOn)}`
}

function priceBlock(p: PlanDef): string {
  if (p.priceMonthly === null) return `<div class="pf-plan__price">Su preventivo</div>`
  if (p.priceMonthly === 0) return `<div class="pf-plan__price">Gratis</div>`
  return `<div class="pf-plan__price">€${p.priceMonthly}<span class="pf-muted">/mese</span></div><div class="pf-muted pf-plan__year">o €${p.priceYearly}/anno · 2 mesi gratis</div>`
}

function planCard(p: PlanDef, sub: Subscription): string {
  // "Paid current" = the active paid plan. A CLUB trial is NOT paid-current: the Club card still
  // offers "Attiva Club" (convert trial → paid), and is highlighted as the plan in use.
  const paidCurrent = sub.status === 'ACTIVE' && sub.plan === p.key
  const trialingClub = p.key === 'CLUB' && sub.status === 'TRIAL'
  const feats = p.features.map((f) => `<li>${esc(f)}</li>`).join('')
  let cta = ''
  if (paidCurrent) cta = `<span class="pf-badge pf-badge--paid">Piano attuale</span>`
  else if (p.key === 'STARTER') cta = `<button class="pf-btn pf-btn--ghost" id="activate-starter">Attiva Starter</button>`
  else if (p.key === 'CLUB') cta = `<button class="pf-btn pf-btn--primary" id="activate-club">Attiva Club</button>${trialingClub ? ' <span class="pf-muted">in prova ora</span>' : ''}`
  else if (p.key === 'ENTERPRISE') cta = `<a class="pf-btn pf-btn--ghost" href="mailto:sales@playfusion.example">Contattaci</a>`
  return `<div class="pf-card pf-plan${paidCurrent || trialingClub ? ' pf-plan--current' : ''}">
    <div class="pf-eyebrow">${esc(p.label)}</div>
    ${priceBlock(p)}
    <ul class="pf-plan__feats">${feats}</ul>
    <div>${cta}</div>
  </div>`
}

export function renderSubscription(sub: Subscription): string {
  const expireLever = sub.status === 'TRIAL'
    ? `<button class="pf-btn pf-btn--ghost" id="expire-trial">Simula scadenza prova</button>`
    : ''
  return renderOrgShell('subscription', `
      <div class="pf-pagehead"><div class="pf-eyebrow">Organizzazione</div><h1>Abbonamento</h1></div>
      <div id="err"></div>
      <div class="pf-card"><h2 class="pf-h3">Il tuo piano</h2><p>${statusLine(sub)}</p>${expireLever}</div>
      <div class="pf-plangrid">${PLANS.map((p) => planCard(p, sub)).join('')}</div>`)
}

export const subscriptionScreen: Screen<SubscriptionData> = {
  load: async (ctx) => {
    if (ctx.orgRole !== 'OWNER') return { forbidden: true }
    return { sub: await ctx.client.o11.getSubscription(ctx.orgId) }
  },
  render: (data) => data.forbidden ? renderOrgShell('subscription', notAuthorizedCard('Abbonamento')) : renderSubscription(data.sub!),
  mount(root, ctx: ViewCtx, data) {
    if (data.forbidden) return // owner-only
    const fail = (msg: string) => { root.querySelector('#err')!.innerHTML = inlineError(msg) }
    root.querySelector<HTMLButtonElement>('#activate-starter')?.addEventListener('click', async () => {
      try { await ctx.client.o11.activatePlan(ctx.orgId, 'STARTER'); ctx.refresh() }
      catch { fail('Attivazione non riuscita. Riprova.') }
    })
    root.querySelector<HTMLButtonElement>('#activate-club')?.addEventListener('click', async () => {
      try { await ctx.client.o11.activatePlan(ctx.orgId, 'CLUB'); ctx.refresh() }
      catch { fail('Attivazione non riuscita. Riprova.') }
    })
    root.querySelector<HTMLButtonElement>('#expire-trial')?.addEventListener('click', async () => {
      try { await ctx.client.o11.expireTrial(ctx.orgId); ctx.refresh() }
      catch { fail('Operazione non riuscita. Riprova.') }
    })
  },
}
