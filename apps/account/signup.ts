import { renderPublicTopbar } from '../../shared/chrome'
import { signUp } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const data = new FormData(f)
  const name = String(data.get('name')).trim()
  const email = String(data.get('email')).trim()
  const orgName = String(data.get('orgName')).trim()
  if (!name || !email.includes('@') || !orgName) return
  signUp({ name, email, orgName })
  location.href = '/apps/organizer/dashboard.html'
})
