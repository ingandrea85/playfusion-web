import { describe, it, expect } from 'vitest'
import { buildXls } from '../src/export-xls'

describe('buildXls (SpreadsheetML)', () => {
  it('emits a valid multi-sheet workbook with a styled header and typed cells', () => {
    const xml = buildXls([
      { name: 'Calendario', headers: ['Ora', 'Persone'], rows: [['09:00', 14], ['10:30 <"A">', 3]] },
      { name: 'Risorse', headers: ['Risorsa'], rows: [] },
    ])
    expect(xml).toContain('progid="Excel.Sheet"')
    expect(xml).toContain('<Worksheet ss:Name="Calendario">')
    expect(xml).toContain('<Worksheet ss:Name="Risorse">')
    // header uses the accent style; text and numbers are typed distinctly
    expect(xml).toContain('ss:StyleID="hdr"')
    expect(xml).toContain('<Data ss:Type="String">Ora</Data>')
    expect(xml).toContain('<Data ss:Type="Number">14</Data>')
    // XML-escaping of user text
    expect(xml).toContain('10:30 &lt;&quot;A&quot;&gt;')
  })

  it('sanitizes/truncates over-long or illegal sheet names', () => {
    const xml = buildXls([{ name: 'A/B:C very long name that exceeds the excel limit of chars!!', headers: ['x'], rows: [] }])
    const m = xml.match(/ss:Name="([^"]*)"/)!
    expect(m[1]!.length).toBeLessThanOrEqual(31)
    expect(m[1]).not.toMatch(/[:\\/?*[\]]/)
  })
})
