import sanitizeHtml from 'sanitize-html';

// Shared allowlist for the event-site rich-text fields (Chi siamo, Programma). Authored by tenant
// members via a WYSIWYG editor, sanitised HERE (backend, at save) so stored HTML is always safe to
// render with innerHTML. Formatting only — no images, no scripts/handlers/styles.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'blockquote'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Every link opens safely in a new tab and can't reach window.opener.
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
  disallowedTagsMode: 'discard',
};

/** Sanitise rich-text HTML to the event-site allowlist (drops script, style, event handlers, img, unknown tags). */
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html ?? '', OPTIONS);
}

/** Sanitise, then collapse to undefined when the result carries no visible text (e.g. empty `<p><br></p>`). */
export function richTextOrUndefined(value: unknown): string | undefined {
  const clean = sanitizeRichHtml(typeof value === 'string' ? value : '').trim();
  const text = clean.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return text ? clean : undefined;
}
