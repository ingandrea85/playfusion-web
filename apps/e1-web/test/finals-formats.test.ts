// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { CustomFinalsFormat } from '@playfusion/rest-client'
import { entitlements } from '@playfusion/entitlements'
import { renderFormatsList, renderFormatEditor, previewMatches, finalsFormatsScreen, finalsFormatEditorScreen } from '../src/views/finals-formats'

const fmt = (over: Partial<CustomFinalsFormat> = {}): CustomFinalsFormat => ({
  id: 'f1', name: 'Semi + finale', seeds: 4, createdAt: 't',
  rounds: [
    { name: 'Semifinali', matches: [{ slot: 'SF1', home: { seed: 1 }, away: { seed: 4 } }, { slot: 'SF2', home: { seed: 2 }, away: { seed: 3 } }] },
    { name: 'Finale', matches: [{ slot: 'F', home: { winnerOf: 'SF1' }, away: { winnerOf: 'SF2' }, placementFrom: 1, placementTo: 2 }] },
  ],
  ...over,
})
const ctx = (over: any = {}) => ({ client: { o7: {} } as any, orgId: 'o', e3BaseUrl: '', navigate: vi.fn(), refresh: vi.fn(), isPlatformAdmin: false, orgRole: 'OWNER', entitlements: entitlements('PRO'), ...over })

describe('finals-formats list', () => {
  it('lists formats with edit/delete + a Nuovo link (org routes)', () => {
    const html = renderFormatsList({ formats: [fmt()] })
    expect(html).toContain('Semi + finale')
    expect(html).toContain('4 seed · 2 turni')
    expect(html).toContain('#/org/finals-formats/f1')
    expect(html).toContain('data-del="f1"')
    expect(html).toContain('#/org/finals-formats/new')
  })
  it('shows an empty state', () => { expect(renderFormatsList({ formats: [] })).toContain('Nessun formato') })
  it('delete calls the client and refreshes', async () => {
    const o7 = { deleteFinalsFormat: vi.fn().mockResolvedValue(undefined) }
    const c = ctx({ client: { o7 } }); const refresh = c.refresh
    const root = document.createElement('div'); root.innerHTML = renderFormatsList({ formats: [fmt()] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    finalsFormatsScreen.mount!(root, c as any, { formats: [fmt()] })
    root.querySelector<HTMLButtonElement>('[data-del="f1"]')!.click()
    await vi.waitFor(() => expect(o7.deleteFinalsFormat).toHaveBeenCalledWith('f1'))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
  })
  it('ORGANIZER load is forbidden; Free owner is locked', async () => {
    const forbidden = await finalsFormatsScreen.load(ctx({ orgRole: 'ORGANIZER' }) as any, {})
    expect(forbidden).toMatchObject({ forbidden: true })
    expect(renderFormatsList(forbidden)).toMatch(/riservato all'owner/)
    const locked = await finalsFormatsScreen.load(ctx({ entitlements: entitlements('FREE') }) as any, {})
    expect(locked).toMatchObject({ locked: true })
    expect(renderFormatsList(locked)).toMatch(/richiede Pro/i)
  })
})

describe('previewMatches', () => {
  it('compiles the model to bracket matches with placeholder labels', () => {
    const ms = previewMatches(fmt())
    expect(ms.find((m) => m.slot === 'F')).toMatchObject({ home: 'Vincente SF1', away: 'Vincente SF2', phase: 'FINAL', placementFrom: 1 })
    expect(ms.find((m) => m.slot === 'SF1')).toMatchObject({ home: 'Seed 1', away: 'Seed 4' })
  })
})

describe('finals-format editor', () => {
  it('renders the form (name/seeds/add-round) and the "Nuovo" heading for a blank editor', () => {
    const html = renderFormatEditor({ format: null })
    expect(html).toContain('Nuovo formato')
    expect(html).toContain('id="ff-name"')
    expect(html).toContain('id="ff-seeds"')
    expect(html).toContain('id="ff-add-round"')
    expect(html).toContain('id="ff-preview"')
  })
  it('editing an existing format shows "Modifica" and prefilled name', () => {
    expect(renderFormatEditor({ format: fmt() })).toContain('Modifica formato')
  })
  it('ORGANIZER is forbidden in the editor', async () => {
    const data = await finalsFormatEditorScreen.load(ctx({ orgRole: 'ORGANIZER' }) as any, {})
    expect(data).toMatchObject({ forbidden: true })
    expect(renderFormatEditor(data)).toMatch(/riservato all'owner/)
  })
  it('mount renders the live preview + adding a round grows the form', () => {
    const root = document.createElement('div'); root.innerHTML = renderFormatEditor({ format: fmt() })
    finalsFormatEditorScreen.mount!(root, ctx() as any, { format: fmt() })
    expect(root.querySelector('#ff-preview')!.innerHTML).toContain('Vincente SF1')
    expect(root.querySelectorAll('#ff-form [data-round]').length).toBe(2)
    root.querySelector<HTMLButtonElement>('#ff-add-round')!.click()
    expect(root.querySelectorAll('#ff-form [data-round]').length).toBe(3)
  })
  it('save on a valid loaded format calls updateFinalsFormat then navigates to the org route', async () => {
    const o7 = { updateFinalsFormat: vi.fn().mockResolvedValue({}), saveFinalsFormat: vi.fn() }
    const c = ctx({ client: { o7 } })
    const root = document.createElement('div'); root.innerHTML = renderFormatEditor({ format: fmt() })
    finalsFormatEditorScreen.mount!(root, c as any, { format: fmt() })
    root.querySelector<HTMLButtonElement>('#ff-save')!.click()
    await vi.waitFor(() => expect(o7.updateFinalsFormat).toHaveBeenCalledWith('f1', expect.objectContaining({ name: 'Semi + finale', seeds: 4 })))
    await vi.waitFor(() => expect(c.navigate).toHaveBeenCalledWith('#/org/finals-formats'))
  })
  it('save is disabled while the format is invalid (empty blank editor)', () => {
    const root = document.createElement('div'); root.innerHTML = renderFormatEditor({ format: null })
    finalsFormatEditorScreen.mount!(root, ctx() as any, { format: null })
    expect(root.querySelector<HTMLButtonElement>('#ff-save')!.disabled).toBe(true)
    expect(root.querySelector('#ff-errors')!.innerHTML).toMatch(/Da correggere/)
  })
})
