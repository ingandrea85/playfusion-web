// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { Auth0Port, Auth0User } from '../src/auth/auth0'
import { renderUserBadge, mountUserBadge, roleLabel } from '../src/views/user-badge'

const user = (over: Partial<Auth0User> = {}): Auth0User => ({ name: 'Andrea Rossi', email: 'a.rossi@x.io', roles: ['organizer'], ...over })

const fakePort = (over: Partial<Auth0Port> = {}): Auth0Port => ({
  isAuthenticated: vi.fn(), handleRedirectCallback: vi.fn(), loginWithRedirect: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined), getToken: vi.fn(), getOrgId: vi.fn(),
  getUser: vi.fn().mockResolvedValue(user()), changePassword: vi.fn().mockResolvedValue(undefined), ...over,
})

const mount = (u: Auth0User, port: Auth0Port) => {
  const host = document.createElement('div'); host.innerHTML = renderUserBadge(u)
  document.body.appendChild(host); mountUserBadge(host, port)
  return host
}

describe('roleLabel', () => {
  it('capitalises the first Auth0 role', () => { expect(roleLabel(user({ roles: ['organizer'] }))).toBe('Organizer') })
  it('defaults to Organizer when there is no role claim', () => { expect(roleLabel(user({ roles: [] }))).toBe('Organizer') })
})

describe('renderUserBadge', () => {
  it('shows the name, role and initials, with a hidden menu', () => {
    const html = renderUserBadge(user())
    expect(html).toContain('Andrea Rossi')
    expect(html).toContain('Organizer')
    expect(html).toContain('>AR<') // initials from the two name words
    expect(html).toContain('id="ub-pwd"')
    expect(html).toContain('id="ub-logout"')
    expect(html).toContain('a.rossi@x.io')
  })
  it('uses the picture when present', () => {
    expect(renderUserBadge(user({ picture: 'https://img/x.png' }))).toContain('<img class="pf-userbadge__avatar"')
  })
})

describe('mountUserBadge', () => {
  it('toggles the menu open on click', () => {
    const host = mount(user(), fakePort())
    const menu = host.querySelector<HTMLElement>('#ub-menu')!
    expect(menu.hidden).toBe(true)
    host.querySelector<HTMLButtonElement>('#ub-toggle')!.click()
    expect(menu.hidden).toBe(false)
  })
  it('change-password calls the port and shows a confirmation', async () => {
    const port = fakePort()
    const host = mount(user(), port)
    host.querySelector<HTMLButtonElement>('#ub-pwd')!.click()
    await vi.waitFor(() => expect(port.changePassword).toHaveBeenCalled())
    await vi.waitFor(() => expect(host.querySelector('#ub-status')!.textContent).toMatch(/email/i))
  })
  it('shows an error when change-password fails', async () => {
    const port = fakePort({ changePassword: vi.fn().mockRejectedValue(new Error('boom')) })
    const host = mount(user(), port)
    host.querySelector<HTMLButtonElement>('#ub-pwd')!.click()
    await vi.waitFor(() => expect(host.querySelector('#ub-status')!.classList.contains('pf-userbadge__status--err')).toBe(true))
  })
  it('logout calls the port', () => {
    const port = fakePort()
    const host = mount(user(), port)
    host.querySelector<HTMLButtonElement>('#ub-logout')!.click()
    expect(port.logout).toHaveBeenCalled()
  })
})
