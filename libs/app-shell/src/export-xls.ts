/** Dependency-free Excel export: SpreadsheetML 2003 (a plain XML `.xls` that Excel and Google Sheets
 *  open, with multiple sheets and styled headers). PlayFusion styling: accent-green header fill, white
 *  bold header text, subtle zebra rows. Cells are typed (String / Number). SSR-safe generation;
 *  `downloadXls` needs a DOM. */

export type XlsCell = string | number
export interface XlsSheet { name: string; headers: string[]; rows: XlsCell[][] }

const xesc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Excel sheet names can't exceed 31 chars or contain : \ / ? * [ ]
const sheetName = (name: string): string => name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Foglio'

function cellXml(v: XlsCell, styleId?: string): string {
  const isNum = typeof v === 'number' && Number.isFinite(v)
  const type = isNum ? 'Number' : 'String'
  const data = isNum ? String(v) : xesc(String(v))
  return `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ''}><Data ss:Type="${type}">${data}</Data></Cell>`
}

function rowXml(cells: XlsCell[], styleId?: string): string {
  return `<Row>${cells.map((c) => cellXml(c, styleId)).join('')}</Row>`
}

function worksheetXml(s: XlsSheet): string {
  const header = `<Row>${s.headers.map((h) => cellXml(h, 'hdr')).join('')}</Row>`
  const body = s.rows.map((r, i) => rowXml(r, i % 2 === 1 ? 'alt' : undefined)).join('')
  return `<Worksheet ss:Name="${xesc(sheetName(s.name))}"><Table>${header}${body}</Table></Worksheet>`
}

/** Build the SpreadsheetML document (one `<Worksheet>` per sheet). */
export function buildXls(sheets: XlsSheet[]): string {
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
<Style ss:ID="hdr"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F9D6B" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
<Style ss:ID="alt"><Font ss:FontName="Calibri" ss:Size="11"/><Interior ss:Color="#EAF4EF" ss:Pattern="Solid"/></Style>
</Styles>
${sheets.map(worksheetXml).join('\n')}
</Workbook>`
}

/** Trigger a browser download of `sheets` as `filename`.xls. */
export function downloadXls(filename: string, sheets: XlsSheet[]): void {
  const xml = buildXls(sheets)
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.toLowerCase().endsWith('.xls') ? filename : `${filename}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
