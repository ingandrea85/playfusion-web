// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Brand, EventDetail } from '@playfusion/rest-client'
import { applyBrand } from '@playfusion/app-shell'
import { renderBrand, brandScreen, type BrandData } from '../src/views/brand'

const event: EventDetail = {
  sportEventId: 'e1', organizationId: 'org-1', sport: 'Calcio', categorie: ['U10'],
  dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1', name: 'Torneo',
}
const data = (brand: Brand | null = null): BrandData => ({ event, brand })

afterEach(() => applyBrand(null))

describe('renderBrand', () => {
  it('prefills the form from the saved brand', () => {
    const html = renderBrand(data({ logoText: 'Acme Cup', primaryColor: '#112233', accentColor: '#445566' }))
    expect(html).toContain('value="Acme Cup"')
    expect(html).toContain('value="#112233"')
    expect(html).toContain('value="#445566"')
    expect(html).toContain('Anteprima')
  })
  it('falls back to the token defaults when there is no brand', () => {
    const html = renderBrand(data(null))
    expect(html).toContain('value="#0b5fff"')
    expect(html).toContain('value="#ff6b00"')
  })
})

describe('brand mount', () => {
  const mountWith = (brand: Brand | null = null) => {
    const o1 = { setBrand: vi.fn().mockResolvedValue({}), resetBrand: vi.fn().mockResolvedValue(undefined) }
    const refresh = vi.fn()
    const ctx = { client: { o1 } as any, orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh }
    const root = document.createElement('div'); root.innerHTML = renderBrand(data(brand))
    brandScreen.mount!(root, ctx as any, data(brand))
    return { root, o1, refresh }
  }

  it('live preview reflects the typed wordmark', () => {
    const { root } = mountWith()
    const logo = root.querySelector<HTMLInputElement>('#b-logo')!
    logo.value = 'My Cup'; logo.dispatchEvent(new Event('input'))
    expect(root.querySelector('#b-prev')!.innerHTML).toContain('My Cup')
  })

  it('save persists the brand for the org and applies it', async () => {
    const { root, o1, refresh } = mountWith()
    ;(root.querySelector('#b-logo') as HTMLInputElement).value = 'Acme'
    ;(root.querySelector('#b-primary') as HTMLInputElement).value = '#123456'
    ;(root.querySelector('#b-accent') as HTMLInputElement).value = '#abcdef'
    root.querySelector<HTMLButtonElement>('#b-save')!.click()
    await vi.waitFor(() => expect(o1.setBrand).toHaveBeenCalledWith('org-1', { logoText: 'Acme', primaryColor: '#123456', accentColor: '#abcdef' }))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(document.documentElement.style.getPropertyValue('--color-action-primary')).toBe('#123456')
  })

  it('save is blocked with an empty wordmark', () => {
    const { root, o1 } = mountWith()
    ;(root.querySelector('#b-logo') as HTMLInputElement).value = '  '
    root.querySelector<HTMLButtonElement>('#b-save')!.click()
    expect(o1.setBrand).not.toHaveBeenCalled()
  })

  it('reset removes the brand and reverts the theme', async () => {
    applyBrand({ logoText: 'X', primaryColor: '#111', accentColor: '#222' })
    const { root, o1, refresh } = mountWith({ logoText: 'X', primaryColor: '#111', accentColor: '#222' })
    root.querySelector<HTMLButtonElement>('#b-reset')!.click()
    await vi.waitFor(() => expect(o1.resetBrand).toHaveBeenCalledWith('org-1'))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(document.documentElement.style.getPropertyValue('--color-action-primary')).toBe('')
  })
})
