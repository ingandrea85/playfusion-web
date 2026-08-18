type Handler = (params: Record<string, string>) => void
interface Route { pattern: string; keys: string[]; regex: RegExp; handler: Handler }

/** ~40-line hash router shared by both SPAs. Patterns look like '#/events/:id'.
 *  No framework (YAGNI). Falls back to '#/' when no route matches. */
export class HashRouter {
  private routes: Route[] = []
  on(pattern: string, handler: Handler): this {
    const keys: string[] = []
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)' }) + '$')
    this.routes.push({ pattern, keys, regex, handler })
    return this
  }
  private resolve(): void {
    const hash = window.location.hash || '#/'
    for (const r of this.routes) {
      const m = hash.match(r.regex)
      if (m) { r.handler(Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))); return }
    }
    const home = this.routes.find((r) => r.pattern === '#/')
    home?.handler({})
  }
  start(): void { window.addEventListener('hashchange', () => this.resolve()); this.resolve() }
  go(path: string): void { window.location.hash = path }
}
