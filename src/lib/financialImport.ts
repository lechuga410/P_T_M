import { unzipSync } from 'fflate'
import type { Worker } from 'tesseract.js'

export type ImportDirection = 'income' | 'expense' | 'transfer'
export type ImportConfidence = 'high' | 'medium' | 'low'

export interface ImportedTransaction {
  id: string
  date: string
  time: string
  title: string
  amount: string
  direction: ImportDirection
  category: string
  incomeActivity?: string
  institution: string
  account: string
  annualYield: string
  investmentId?: string
  relatedTransactionId?: string
  confidence: ImportConfidence
  sourceFile: string
  duplicate: boolean
}

export interface ImportProgress {
  message: string
  percent: number
}

export interface ImportResult {
  transactions: ImportedTransaction[]
  warnings: string[]
}

type TableRow = Record<string, string>

const supportedExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'pdf', 'csv', 'txt', 'ofx', 'qfx', 'xlsx'])
const monthNames: Record<string, string> = {
  ene: '01', enero: '01', jan: '01', january: '01',
  feb: '02', febrero: '02', february: '02',
  mar: '03', marzo: '03', march: '03',
  abr: '04', abril: '04', apr: '04', april: '04',
  may: '05', mayo: '05',
  jun: '06', junio: '06', june: '06',
  jul: '07', julio: '07', july: '07',
  ago: '08', agosto: '08', aug: '08', august: '08',
  sep: '09', sept: '09', septiembre: '09', september: '09',
  oct: '10', octubre: '10', october: '10',
  nov: '11', noviembre: '11', november: '11',
  dic: '12', diciembre: '12', dec: '12', december: '12',
}
const monthAlternation = Object.keys(monthNames).sort((left, right) => right.length - left.length).join('|')
const namedDatePattern = new RegExp(
  `\\b(\\d{1,2})\\s*(?:de\\s+)?(${monthAlternation})\\.?(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`,
  'i',
)

const newId = () => globalThis.crypto?.randomUUID?.() ?? `import-${Date.now()}-${Math.random().toString(36).slice(2)}`
const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function isSupportedFinancialFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase() ?? ''
  return supportedExtensions.has(extension)
}

export function transactionFingerprint(
  transaction: Pick<ImportedTransaction, 'date' | 'amount' | 'title' | 'direction'>,
): string {
  return [
    transaction.date,
    Number(transaction.amount),
    normalize(transaction.title).replace(/^gmf 4x1000(?: .*)?$/, 'gmf 4x1000'),
    transaction.direction,
  ].join('|')
}

function parseDate(value: string, yearFallback: number): string | undefined {
  const text = value.trim()
  let match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (match) {
    const [, year, month, day] = match
    const date = validDate(Number(year), Number(month), Number(day))
    if (date) return date
  }
  match = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (match) {
    let [, day, month, year] = match
    if (year.length === 2) year = `20${year}`
    const date = validDate(Number(year), Number(month), Number(day))
    if (date) return date
  }
  match = text.toLocaleLowerCase().match(namedDatePattern)
  if (match) {
    const [, day, rawMonth, year] = match
    const month = monthNames[normalize(rawMonth).slice(0, 4)] ?? monthNames[normalize(rawMonth).slice(0, 3)]
    if (month) return validDate(Number(year ?? yearFallback), Number(month), Number(day))
  }
  return undefined
}

function validDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseTime(value: string): string {
  const match = value.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/i)
  if (!match) return ''
  let hours = Number(match[1])
  const meridiem = match[4]?.toLocaleLowerCase().replace(/\./g, '')
  if (meridiem === 'pm' && hours < 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  return `${String(hours).padStart(2, '0')}:${match[2]}`
}

function parseAmount(value: string): number | undefined {
  let text = value.replace(/[^\d,.'’\-()]/g, '').replace(/’/g, "'").trim()
  if (!text || !/\d/.test(text)) return undefined
  const negative = text.startsWith('-') || (text.startsWith('(') && text.endsWith(')'))
  text = text.replace(/[()\-']/g, '')
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? /\./g : /,/g
    text = text.replace(thousandsSeparator, '').replace(decimalSeparator, '.')
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.'
    const parts = text.split(separator)
    const trailing = parts[parts.length - 1]
    if (parts.length > 2 || trailing.length === 3) {
      text = parts.join('')
    } else if (trailing.length === 1 || trailing.length === 2) {
      text = `${parts.slice(0, -1).join('')}.${trailing}`
    } else {
      text = parts.join('')
    }
  }
  const amount = Number(text)
  if (!Number.isFinite(amount)) return undefined
  return negative ? -Math.abs(amount) : Math.abs(amount)
}

function classify(text: string, amount: number): { direction: ImportDirection; category: string; confidence: ImportConfidence } {
  const description = normalize(text)
  if (/\b(gmf|4x1000|gravamen (?:a los )?movimientos financieros|impuesto financiero)\b/.test(description)) {
    return { direction: 'expense', category: 'Impuesto', confidence: 'high' }
  }
  if (/\b(transferencia (?:entre|a|hacia|desde) (?:mis )?(?:cuentas|ahorros|cajita)|traslado (?:entre|a|hacia)|transfer to savings|internal transfer)\b/.test(description)) {
    return { direction: 'transfer', category: 'Transferencia propia', confidence: 'high' }
  }
  if (/\b(agregaste|agregaste dinero|anadiste|sumaste)\b.*\b(cajita|bolsillo|inversion)\b/.test(description)) {
    return { direction: 'transfer', category: 'Aporte a inversión', confidence: 'high' }
  }
  if (/\b(nomina|sueldo|salario|payroll|salary|abono|consignacion|deposito recibido|recibiste|interes(?:es)? abonado|rendimiento(?:s)? abonado)\b/.test(description)) {
    return { direction: 'income', category: /\b(nomina|sueldo|salario|payroll|salary)\b/.test(description) ? 'Salario' : 'Ingreso', confidence: 'high' }
  }
  if (/\b(pago|compra|retiro|debito|deuda|cuota|comision|cargo|withdrawal|payment|purchase|fee)\b/.test(description) || amount < 0) {
    return { direction: 'expense', category: /\b(deuda|credito|loan|credit card|tarjeta)\b/.test(description) ? 'Pago de deuda' : 'Gasto', confidence: 'medium' }
  }
  if (/\b(transferencia|traslado|transfer)\b/.test(description)) {
    return { direction: 'transfer', category: 'Transferencia', confidence: 'low' }
  }
  return { direction: amount < 0 ? 'expense' : 'income', category: '', confidence: 'low' }
}

function fieldByHeader(row: TableRow, patterns: RegExp[]): string {
  const entry = Object.entries(row).find(([key]) => patterns.some((pattern) => pattern.test(normalize(key))))
  return entry?.[1]?.trim() ?? ''
}

const headers = {
  date: [/^fecha\b/, /^date\b/, /posted date/, /transaction date/, /fecha de movimiento/],
  time: [/^hora\b/, /^time\b/, /hora de transaccion/],
  title: [/descripcion/, /description/, /detalle/, /concepto/, /movimiento/, /transaction/, /name/, /memo/],
  amount: [/^monto\b/, /^amount\b/, /^valor\b/, /^importe\b/, /^trnamt\b/, /^total\b/],
  debit: [/debito/, /debit/, /retiro/, /withdrawal/, /cargo/],
  credit: [/credito/, /credit/, /abono/, /deposit/, /ingreso/],
  category: [/categoria/, /category/, /tipo de transaccion/, /transaction type/],
  direction: [/^tipo$/, /tipo de movimiento/, /tipo de operacion/, /tipo de transaccion/, /^naturaleza$/, /^direction$/, /debe haber/],
  institution: [/entidad/, /banco/, /institution/, /bank/],
  account: [/cuenta/, /account/],
  annualYield: [/tasa/, /rate/, /rendimiento/, /rentabilidad/],
}

function fromRow(row: TableRow, sourceFile: string, referenceYear: number): ImportedTransaction | undefined {
  const rawDate = fieldByHeader(row, headers.date)
  const rawTitle = fieldByHeader(row, headers.title)
  const amountField = fieldByHeader(row, headers.amount)
  const debitField = fieldByHeader(row, headers.debit)
  const creditField = fieldByHeader(row, headers.credit)
  const parsedAmount = parseAmount(amountField || debitField || creditField)
  const date = parseDate(rawDate, referenceYear)
  if (!date || !parsedAmount || !rawTitle) return undefined

  const hasDebitCredit = Boolean(debitField || creditField)
  const rawDirection = normalize(fieldByHeader(row, headers.direction))
  const explicitDirection: ImportDirection | undefined =
    /\b(ingreso|abono|credito|credit|deposito|income)\b/.test(rawDirection) ? 'income'
    : /\b(gasto|egreso|debito|debit|cargo|expense)\b/.test(rawDirection) ? 'expense'
      : /\b(transferencia|traslado|transfer)\b/.test(rawDirection) ? 'transfer'
        : undefined
  const directionInfo = explicitDirection
    ? { direction: explicitDirection, category: '', confidence: 'high' as const }
    : hasDebitCredit
    ? debitField && parseAmount(debitField)
      ? { direction: 'expense' as const, category: 'Gasto', confidence: 'high' as const }
      : { direction: 'income' as const, category: 'Ingreso', confidence: 'high' as const }
    : classify(`${rawTitle} ${fieldByHeader(row, headers.category)}`, parsedAmount)
  const enteredAmount = Math.abs(parsedAmount)
  const rawCategory = fieldByHeader(row, headers.category)
  return {
    id: newId(),
    date,
    time: parseTime(fieldByHeader(row, headers.time)),
    title: rawTitle,
    amount: String(enteredAmount),
    direction: directionInfo.direction,
    category: rawCategory || directionInfo.category,
    incomeActivity: directionInfo.direction === 'income' ? 'Empleo' : undefined,
    institution: fieldByHeader(row, headers.institution),
    account: fieldByHeader(row, headers.account),
    annualYield: fieldByHeader(row, headers.annualYield).replace('%', '').replace(',', '.'),
    confidence: /\b20\d{2}\b/.test(rawDate) ? directionInfo.confidence : 'low',
    sourceFile,
    duplicate: false,
  }
}

function excelSerialToDate(value: string): string | undefined {
  const serial = Number(value)
  if (!Number.isFinite(serial) || serial < 20000 || serial > 100000) return undefined
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000)
  return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

function splitDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const candidates = [',', ';', '\t', '|']
  const delimiter = candidates.reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best, ',')
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (!quoted && character === delimiter) {
      current.push(field.trim())
      field = ''
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      current.push(field.trim())
      if (current.some((cell) => cell)) rows.push(current)
      current = []
      field = ''
    } else {
      field += character
    }
  }
  current.push(field.trim())
  if (current.some((cell) => cell)) rows.push(current)
  return rows
}

function parseDelimited(text: string, sourceFile: string, referenceYear: number): ImportedTransaction[] {
  const rows = splitDelimited(text)
  if (rows.length < 2) return []
  const columnNames = rows[0].map((cell) => cell.replace(/^\uFEFF/, '').trim())
  if (!columnNames.some((cell) => headers.date.some((pattern) => pattern.test(normalize(cell))))) return []
  return rows.slice(1).flatMap((cells) => {
    const row = Object.fromEntries(columnNames.map((header, index) => [header, cells[index] ?? '']))
    const transaction = fromRow(row, sourceFile, referenceYear)
    return transaction ? [transaction] : []
  })
}

function parseOfx(text: string, sourceFile: string, referenceYear: number): ImportedTransaction[] {
  const blocks = text.match(/<STMTTRN\b[^>]*>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN\b)|$)/gi) ?? []
  return blocks.flatMap((block) => {
    const get = (tag: string) => block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'))?.[1]?.trim() ?? ''
    const posted = get('DTPOSTED')
    const year = posted.slice(0, 4)
    const date = parseDate(`${year}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`, referenceYear)
    const amount = parseAmount(get('TRNAMT'))
    const title = get('NAME') || get('MEMO') || get('PAYEE')
    if (!date || amount === undefined || !title) return []
    const classification = classify(title, amount)
    return [{
      id: newId(),
      date,
      time: posted.length >= 14 ? `${posted.slice(8, 10)}:${posted.slice(10, 12)}` : '',
      title,
      amount: String(Math.abs(amount)),
      direction: amount < 0 ? 'expense' : classification.direction,
      category: classification.category,
      incomeActivity: amount > 0 && classification.direction === 'income' ? 'Empleo' : undefined,
      institution: '',
      account: '',
      annualYield: '',
      confidence: 'high' as const,
      sourceFile,
      duplicate: false,
    }]
  })
}

function parseTextLines(text: string, sourceFile: string, referenceYear: number): ImportedTransaction[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const date = parseDate(line, referenceYear)
    if (!date) return []
    const time = parseTime(line)
    const annualYieldMatch = line.match(/\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:e\.?\s*a\.?|ea)?/i)
    const annualYield = annualYieldMatch ? String(parseAmount(annualYieldMatch[1]) ?? '') : ''
    const withoutDate = line
      .replace(/\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/, ' ')
      .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/, ' ')
      .replace(/\b\d{1,2}\s*(?:de\s+)?[a-záéíóúñ]+\.?(?:\s+(?:de\s+)?(?:20\d{2}))?\b/i, ' ')
      .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/i, ' ')
      .replace(/\b\d{1,2}(?:[.,]\d{1,2})?\s*%\s*(?:e\.?\s*a\.?|ea)?/i, ' ')
    const amountTokens = [...withoutDate.matchAll(/(?:COP\s*)?\$?\s*-?\d[\d\s.,']*\d|-?\d/g)]
      .map((match) => ({ token: match[0].trim(), index: match.index ?? 0, amount: parseAmount(match[0]) }))
      .filter((candidate) => candidate.amount !== undefined && Math.abs(candidate.amount) > 0)
    if (!amountTokens.length) return []
    const selectedAmount = amountTokens[0]
    const title = withoutDate
      .slice(0, selectedAmount.index)
      .replace(/[$:|•·]/g, ' ')
      .replace(/\b(COP|USD)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title || /^\d/.test(title)) return []
    const classified = classify(title, selectedAmount.amount ?? 0)
    const confidence = amountTokens.length > 1 ? 'low' : classified.confidence
    return [{
      id: newId(),
      date,
      time,
      title,
      amount: String(Math.abs(selectedAmount.amount ?? 0)),
      direction: classified.direction,
      category: classified.category,
      incomeActivity: classified.direction === 'income' ? 'Empleo' : undefined,
      institution: /\bnu\b/i.test(line) ? 'Nu' : '',
      account: /\bcajita\b/i.test(line) ? 'Cajita' : '',
      annualYield,
      confidence,
      sourceFile,
      duplicate: false,
    }]
  })
}

const nuMoneyPattern = /[+-]?\s*\$?\s*(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{2}))/g
const nuMonthPattern = /\b\d{1,2}\s*(?:de\s+)?(?:ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\.?(?:\s+(?:de\s+)?20\d{2})?\b/gi

function parseNuRow(text: string, sourceFile: string, referenceYear: number, confidence: number): ImportedTransaction[] {
  const date = parseDate(text, referenceYear)
  if (!date) return []

  const time = parseTime(text)
  const money = [...text.matchAll(nuMoneyPattern)]
    .map((match) => ({ raw: match[0], index: match.index ?? 0, amount: parseAmount(match[0]) }))
    .filter((candidate): candidate is typeof candidate & { amount: number } => candidate.amount !== undefined && candidate.amount !== 0)
  if (!money.length) return []

  const normalizedText = normalize(text)
  const extractedTitle = text
    .replace(nuMonthPattern, ' ')
    .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/i, ' ')
    .replace(nuMoneyPattern, ' ')
    .replace(/\b\d+\s*[x×]\s*(?:mil|1000)\b/gi, ' ')
    .replace(/[$+−\-:|•·.…_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const title = /\bagregaste\b/.test(normalizedText) && /\bcajita\b/.test(normalizedText)
    ? 'Agregaste dinero a tu Cajita'
    : /\brecibiste\b.*\bbancolombia\b/.test(normalizedText)
      ? 'Recibiste de Bancolombia'
      : /\bpagaste\b.*\baddi\b/.test(normalizedText)
        ? 'Pagaste en P.A. ADDI'
        : extractedTitle
  if (!title) return []

  const feeAmounts = money.filter((candidate) => {
    const nearbyText = normalize(text.slice(Math.max(0, candidate.index - 30), candidate.index + candidate.raw.length + 32))
    return /\b(4xmil|gmf|gravamen)\b/.test(nearbyText)
  })
  const feeIndexes = new Set(feeAmounts.map((candidate) => candidate.index))
  const mainAmount = money.find((candidate) => !feeIndexes.has(candidate.index)) ?? feeAmounts[0]
  if (!mainAmount) return []

  const classified = classify(title, mainAmount.amount)
  const rowConfidence: ImportConfidence = confidence >= 82 && time ? 'high' : confidence >= 55 ? 'medium' : 'low'
  const transactions: ImportedTransaction[] = [{
    id: newId(),
    date,
    time,
    title,
    amount: Math.abs(mainAmount.amount).toFixed(2),
    direction: classified.direction,
    category: classified.category,
    incomeActivity: classified.direction === 'income' ? 'Empleo' : undefined,
    institution: /\bnu\b/i.test(text) ? 'Nu' : '',
    account: /\bcajita\b/i.test(text) ? 'Cajita' : '',
    annualYield: '',
    confidence: rowConfidence,
    sourceFile,
    duplicate: false,
  }]

  for (const fee of feeAmounts) {
    if (fee.index === mainAmount.index) continue
    transactions.push({
      id: newId(),
      date,
      time,
      title: 'GMF / 4x1000',
      amount: Math.abs(fee.amount).toFixed(2),
      direction: 'expense',
      category: 'Impuesto',
      institution: /\bnu\b/i.test(text) ? 'Nu' : '',
      account: '',
      annualYield: '',
      relatedTransactionId: transactions[0].id,
      confidence: rowConfidence,
      sourceFile,
      duplicate: false,
    })
  }

  if (normalizedText.includes('4xmil') && !feeAmounts.length) {
    transactions[0].confidence = 'low'
  }
  return transactions
}

function findNuRowBounds(context: CanvasRenderingContext2D, width: number, height: number): number[] {
  const { data } = context.getImageData(0, 0, width, height)
  const dividerRows: number[] = []
  for (let y = Math.floor(height * 0.18); y < height * 0.94; y += 1) {
    let grayPixels = 0
    let sampledPixels = 0
    for (let x = 0; x < width; x += 4) {
      const offset = (y * width + x) * 4
      const [red, green, blue, alpha] = data.subarray(offset, offset + 4)
      if (alpha > 220 && red > 205 && red < 250 && Math.abs(red - green) < 12 && Math.abs(green - blue) < 12) grayPixels += 1
      sampledPixels += 1
    }
    if (grayPixels / sampledPixels > 0.78) dividerRows.push(y)
  }

  const dividers: number[] = []
  for (let index = 0; index < dividerRows.length;) {
    let end = index
    while (end + 1 < dividerRows.length && dividerRows[end + 1] <= dividerRows[end] + 2) end += 1
    const center = Math.round((dividerRows[index] + dividerRows[end]) / 2)
    if (center > height * 0.2 && center < height * 0.92) dividers.push(center)
    index = end + 1
  }
  const bounds = [0, ...dividers, height].filter((value, index, all) => index === 0 || value - all[index - 1] >= 55)
  if (bounds[bounds.length - 1] !== height) bounds.push(height)
  return bounds.length >= 3 && bounds.length <= 6 ? bounds : []
}

async function parseNuImage(
  file: File,
  worker: Worker,
  referenceYear: number,
  singleBlockMode: NonNullable<Parameters<Worker['setParameters']>[0]>['tessedit_pageseg_mode'],
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportedTransaction[]> {
  const image = await createImageBitmap(file)
  try {
    const source = globalThis.document.createElement('canvas')
    source.width = image.width
    source.height = image.height
    const sourceContext = source.getContext('2d', { willReadFrequently: true })
    if (!sourceContext) throw new Error('El navegador no pudo preparar la imagen para OCR.')
    sourceContext.drawImage(image, 0, 0)
    const bounds = findNuRowBounds(sourceContext, source.width, source.height)
    if (!bounds.length) return []

    await worker.setParameters({ tessedit_pageseg_mode: singleBlockMode })
    const transactions: ImportedTransaction[] = []
    const rows = bounds.length - 1
    for (let index = 0; index < rows; index += 1) {
      const top = bounds[index] + 4
      const bottom = bounds[index + 1] - 4
      if (bottom <= top) continue
      onProgress({ message: `Leyendo movimiento Nu ${index + 1} de ${rows}…`, percent: Math.round(((index + 1) / rows) * 90) })
      const crop = globalThis.document.createElement('canvas')
      const left = Math.round(source.width * 0.2)
      const scale = 1.5
      crop.width = Math.round((source.width - left) * scale)
      crop.height = Math.round((bottom - top) * scale)
      const cropContext = crop.getContext('2d')
      if (!cropContext) throw new Error('El navegador no pudo preparar una fila de movimientos para OCR.')
      cropContext.drawImage(source, left, top, source.width - left, bottom - top, 0, 0, crop.width, crop.height)
      const result = await worker.recognize(crop)
      transactions.push(...parseNuRow(result.data.text, file.name, referenceYear, result.data.confidence))
      crop.width = 0
      crop.height = 0
    }
    source.width = 0
    source.height = 0
    return transactions
  } finally {
    image.close()
  }
}

function parseOfxRowsAsFallback(text: string, sourceFile: string, referenceYear: number): ImportedTransaction[] {
  const tagged = parseOfx(text, sourceFile, referenceYear)
  return tagged.length ? tagged : parseTextLines(text, sourceFile, referenceYear)
}

function parseXlsx(buffer: ArrayBuffer, sourceFile: string, referenceYear: number): ImportedTransaction[] {
  let expandedSize = 0
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (file) => {
      const isRelevant = file.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name)
      if (!isRelevant) return false
      if (file.originalSize > 20 * 1024 * 1024 || expandedSize + file.originalSize > 50 * 1024 * 1024) {
        throw new Error('La hoja de cálculo se expande demasiado para leerla de forma segura en el navegador.')
      }
      expandedSize += file.originalSize
      return true
    },
  })
  const decoder = new TextDecoder()
  const sharedXml = files['xl/sharedStrings.xml'] ? decoder.decode(files['xl/sharedStrings.xml']) : ''
  const sharedStrings = sharedXml
    ? [...new DOMParser().parseFromString(sharedXml, 'application/xml').querySelectorAll('si')]
      .map((item) => [...item.querySelectorAll('t')].map((node) => node.textContent ?? '').join(''))
    : []
  const worksheetNames = Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()
  const transactions: ImportedTransaction[] = []
  for (const worksheetName of worksheetNames) {
    const document = new DOMParser().parseFromString(decoder.decode(files[worksheetName]), 'application/xml')
    const rows = [...document.querySelectorAll('sheetData row')]
    const matrix = rows.map((row) => {
      const values: string[] = []
      for (const cell of row.querySelectorAll('c')) {
        const reference = cell.getAttribute('r') ?? ''
        const column = reference.match(/^[A-Z]+/)?.[0] ?? ''
        let index = 0
        for (const character of column) index = index * 26 + character.charCodeAt(0) - 64
        index -= 1
        const type = cell.getAttribute('t')
        const raw = type === 'inlineStr'
          ? [...cell.querySelectorAll('is t')].map((node) => node.textContent ?? '').join('')
          : cell.querySelector('v')?.textContent ?? ''
        values[index] = type === 's' ? sharedStrings[Number(raw)] ?? '' : raw
      }
      return values
    }).filter((row) => row.length)
    if (matrix.length < 2) continue
    const columnNames = matrix[0]
    for (const cells of matrix.slice(1)) {
      const row = Object.fromEntries(columnNames.map((header, index) => [header, cells[index] ?? '']))
      const dateColumn = columnNames.find((header) => headers.date.some((pattern) => pattern.test(normalize(header))))
      if (dateColumn) row[dateColumn] = excelSerialToDate(row[dateColumn]) ?? row[dateColumn]
      const transaction = fromRow(row, sourceFile, referenceYear)
      if (transaction) transactions.push(transaction)
    }
  }
  return transactions
}

async function readPdf(file: File, referenceYear: number, onProgress: (progress: ImportProgress) => void): Promise<{ text: string; usedOcr: boolean }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  if (document.numPages > 40) throw new Error('El PDF tiene más de 40 páginas. Divídelo en partes para procesarlo en este dispositivo.')

  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress({ message: `Leyendo texto del PDF: página ${pageNumber} de ${document.numPages}`, percent: Math.round((pageNumber / document.numPages) * 35) })
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const lines = new Map<number, string[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const line = lines.get(y) ?? []
      line.push(item.str.trim())
      lines.set(y, line)
    }
    pages.push([...lines.entries()].sort(([left], [right]) => right - left).map(([, line]) => line.join(' ')).join('\n'))
  }
  const text = pages.join('\n')
  if (parseTextLines(text, file.name, referenceYear).length > 0) return { text, usedOcr: false }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') onProgress({ message: `Leyendo imagen del PDF: ${Math.round(message.progress * 100)}%`, percent: 35 + Math.round(message.progress * 60) })
    },
  })
  try {
    const scannedPages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.6 })
      const canvas = globalThis.document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('El navegador no pudo preparar la página del PDF para OCR.')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      const result = await worker.recognize(canvas)
      scannedPages.push(result.data.text)
      canvas.width = 0
      canvas.height = 0
    }
    return { text: scannedPages.join('\n'), usedOcr: true }
  } finally {
    await worker.terminate()
  }
}

export async function parseFinancialFile(
  file: File,
  onProgress: (progress: ImportProgress) => void = () => undefined,
): Promise<ImportResult> {
  if (!isSupportedFinancialFile(file)) {
    throw new Error('Formato no compatible. Usa una imagen, PDF, hoja XLSX, CSV, OFX, QFX o TXT.')
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('El archivo supera 25 MB. Divide o comprime el archivo antes de importarlo.')

  const referenceYear = new Date().getFullYear()
  const extension = file.name.split('.').pop()?.toLocaleLowerCase() ?? ''
  let transactions: ImportedTransaction[] = []
  let usedOcr = false
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(extension)) {
    const { createWorker, PSM } = await import('tesseract.js')
    const worker = await createWorker('spa', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text') onProgress({ message: `Reconociendo movimiento: ${Math.round(message.progress * 100)}%`, percent: Math.round(message.progress * 90) })
      },
    })
    try {
      transactions = await parseNuImage(file, worker, referenceYear, PSM.SINGLE_BLOCK, onProgress)
      if (!transactions.length) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
        const result = await worker.recognize(file)
        transactions = parseTextLines(result.data.text, file.name, referenceYear)
      }
      usedOcr = true
    } finally {
      await worker.terminate()
    }
  } else if (extension === 'pdf') {
    const result = await readPdf(file, referenceYear, onProgress)
    transactions = parseTextLines(result.text, file.name, referenceYear)
    usedOcr = result.usedOcr
  } else if (extension === 'xlsx') {
    transactions = parseXlsx(await file.arrayBuffer(), file.name, referenceYear)
  } else {
    const text = await file.text()
    transactions = extension === 'ofx' || extension === 'qfx'
      ? parseOfxRowsAsFallback(text, file.name, referenceYear)
      : parseDelimited(text, file.name, referenceYear).length
        ? parseDelimited(text, file.name, referenceYear)
        : parseTextLines(text, file.name, referenceYear)
  }

  const warnings: string[] = []
  if (usedOcr) warnings.push('La lectura OCR puede confundir cifras o separadores. Revisa especialmente fechas, montos y movimientos con baja confianza.')
  if (!transactions.length) {
    warnings.push('No se identificaron movimientos con suficiente información en este archivo. Prueba con un extracto más nítido o en CSV/OFX.')
  }
  return { transactions, warnings }
}
