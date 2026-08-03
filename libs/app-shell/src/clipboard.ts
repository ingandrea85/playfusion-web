/** Copy text to the clipboard. Resolves true on success, false on failure — never throws,
 *  so callers can show a fallback (e.g. a selectable input) without a try/catch. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
