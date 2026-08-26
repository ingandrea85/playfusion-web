import '@playfusion/tokens/tokens.css'
import './site.css'

// Marketing site is static; the only script is a tiny footer-year touch-up.
const year = document.getElementById('year')
if (year) year.textContent = String(new Date().getFullYear())
