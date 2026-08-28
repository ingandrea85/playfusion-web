import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { esc } from '@playfusion/app-shell'

// Formatting-only toolbar (no image button — images aren't allowed in the event site).
const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'blockquote'],
  ['clean'],
]

/**
 * A rich-text field: a Quill placeholder bound to a hidden <textarea> that holds the HTML (the
 * form's source of truth, read by collect* and set as the editor's initial content). The stored
 * HTML is sanitised server-side, so the textarea seed is safe to escape into markup here.
 */
/** Just the editor + hidden source (no field label) — for use inside an override group. */
export function richFieldBare(id: string, html: string): string {
  return `<div class="js-quill" data-target="${id}"></div>
    <textarea id="${id}" class="js-richsrc" hidden>${esc(html)}</textarea>`
}

export function richField(id: string, label: string, html: string): string {
  return `<div class="pf-field"><label>${esc(label)}</label>${richFieldBare(id, html)}</div>`
}

/** Seed HTML for Quill: legacy plain-text content (no tags) is escaped and its newlines become <br>
 *  so the editor shows the line breaks; already-HTML content is loaded as-is. */
export function seedHtml(value: string): string {
  const v = value ?? ''
  if (/<[a-z][\s\S]*>/i.test(v)) return v
  return v.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)).replace(/\r?\n/g, '<br>')
}

/** Upgrade each .js-quill placeholder into a Quill editor, syncing to its hidden textarea on change. */
export function initRichEditors(root: ParentNode, onChange?: () => void): void {
  root.querySelectorAll<HTMLElement>('.js-quill').forEach((el) => {
    if (el.dataset.ready) return
    const src = root.querySelector<HTMLTextAreaElement>(`#${el.dataset.target}`)
    if (!src) return
    try {
      const q = new Quill(el, { theme: 'snow', modules: { toolbar: TOOLBAR }, placeholder: 'Scrivi qui…' })
      q.root.innerHTML = seedHtml(src.value)
      q.on('text-change', () => { src.value = q.root.innerHTML; onChange?.() })
      el.dataset.ready = '1'
    } catch { /* non-browser env (tests): the hidden textarea stays the source of truth */ }
  })
}
