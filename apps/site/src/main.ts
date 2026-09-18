import '@playfusion/tokens/tokens.css'
import './site.css'

// Marketing site is static; the only script is a tiny footer-year touch-up.
const year = document.getElementById('year')
if (year) year.textContent = String(new Date().getFullYear())

// P8: accessible mobile disclosure menu. The hamburger toggles aria-expanded and reveals the nav
// links (hidden by CSS at <=640px); choosing a link closes it again.
const navToggle = document.querySelector<HTMLButtonElement>('.site-nav__toggle')
const navLinks = document.getElementById('site-nav-links')
if (navToggle && navLinks) {
  const setOpen = (open: boolean): void => {
    navToggle.setAttribute('aria-expanded', String(open))
    navLinks.classList.toggle('is-open', open)
  }
  navToggle.addEventListener('click', () => setOpen(navToggle.getAttribute('aria-expanded') !== 'true'))
  navLinks.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false)
  })
}
