import type { AuthProvider } from '@playfusion/rest-client'

const KEY = 'pf.e3.magiclink'

/** Reads ?token= from the landing URL, persists it, and returns the effective token
 *  (URL token wins, else the stored one). Coaches arrive via an emailed magic-link. */
export function captureMagicLink(url: URL, storage: Storage): string | null {
  const fromUrl = url.searchParams.get('token')
  if (fromUrl) { storage.setItem(KEY, fromUrl); return fromUrl }
  return storage.getItem(KEY)
}
export const storedToken = (storage: Storage): string | null => storage.getItem(KEY)
/** Drops a known-bad token so it isn't re-sent on the next call/reload. */
export const clearToken = (storage: Storage): void => storage.removeItem(KEY)
export const magicLinkAuthProvider = (storage: Storage): AuthProvider => () => {
  const t = storage.getItem(KEY)
  return t ? { name: 'authorization', value: `Bearer ${t}` } : null
}
