import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')

describe('site marketing markup', () => {
  it('P8: has an accessible mobile menu toggle controlling the nav links', () => {
    // button with aria-expanded + aria-controls pointing at the nav links container
    expect(html).toMatch(/<button class="site-nav__toggle"[^>]*aria-expanded="false"[^>]*aria-controls="site-nav-links"/)
    expect(html).toContain('id="site-nav-links"')
    // section anchors stay in the DOM (revealed via the toggle on mobile)
    expect(html).toContain('href="#prezzi"')
  })

  it('P9: shows a product image (lazy, sized, alt) and an honest social-proof line', () => {
    expect(html).toMatch(/<img src="\/og-image\.png"[^>]*width="1200"[^>]*height="630"[^>]*loading="lazy"/)
    expect(html).toMatch(/<img[^>]*alt="[^"]+"/)
    expect(html).toContain('site-proof')
    // honest/generic copy — no fabricated numbers or company names
    expect(html).toContain('organizzatori di tornei')
  })

  it('P10: Club plan carries a recommended ribbon and stays the featured tier', () => {
    expect(html).toContain('site-plan__ribbon')
    expect(html).toMatch(/site-plan site-plan--featured/)
    // keeps the 4 tiers
    for (const tier of ['Free', 'Starter', 'Club', 'Enterprise']) expect(html).toContain(tier)
  })
})
