/** Escape dynamic text before interpolating into an innerHTML string. Use for ALL
 *  backend/user-supplied values rendered as HTML text (R6: views are string builders). */
export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string))
