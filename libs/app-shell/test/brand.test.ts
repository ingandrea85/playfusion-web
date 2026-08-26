// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { applyBrand, brandWordmark, renderPublicTopbar, renderOrganizerTopbar } from '../src/index'

afterEach(() => applyBrand(null)) // reset the module-level brand between tests

describe('applyBrand', () => {
  it('sets the accent CSS custom properties and returns the wordmark', () => {
    const logo = applyBrand({ logoText: 'Acme Cup', primaryColor: '#123456', accentColor: '#abcdef' })
    expect(logo).toBe('Acme Cup')
    const root = document.documentElement
    expect(root.style.getPropertyValue('--color-action-primary')).toBe('#123456')
    expect(root.style.getPropertyValue('--color-action-accent')).toBe('#abcdef')
  })
  it('null clears the overrides and reverts to the default wordmark', () => {
    applyBrand({ logoText: 'Acme', primaryColor: '#111', accentColor: '#222' })
    applyBrand(null)
    expect(document.documentElement.style.getPropertyValue('--color-action-primary')).toBe('')
    expect(brandWordmark()).toBe('play<b>fusion</b>')
  })
})

describe('brandWordmark in topbars', () => {
  it('defaults to the PlayFusion mark when no brand is applied', () => {
    expect(renderPublicTopbar()).toContain('play<b>fusion</b>')
    expect(renderOrganizerTopbar('dashboard')).toContain('play<b>fusion</b>')
  })
  it('uses the branded wordmark once applied, escaping it', () => {
    applyBrand({ logoText: 'A&B Cup', primaryColor: '#111', accentColor: '#222' })
    expect(renderPublicTopbar()).toContain('A&amp;B Cup')
    expect(renderOrganizerTopbar('dashboard')).toContain('A&amp;B Cup')
    expect(renderPublicTopbar()).not.toContain('play<b>fusion</b>')
  })
})
