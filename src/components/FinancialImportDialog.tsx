import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { Investment, Movement } from '../types'
import { AVAILABLE_ACCOUNT_ID } from '../lib/investmentFlows'
import {
  isSupportedFinancialFile,
  parseFinancialFile,
  transactionFingerprint,
} from '../lib/financialImport'
import type { ImportDirection, ImportedTransaction } from '../lib/financialImport'

interface FinancialImportDialogProps {
  open: boolean
  existingMovements: Movement[]
  investments: Investment[]
  incomeActivities: string[]
  onClose: () => void
  onImport: (transactions: ImportedTransaction[]) => void
}

interface ReviewTransaction extends ImportedTransaction {
  include: boolean
}

const directionLabels: Record<ImportDirection, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Aporte a inversión',
  withdrawal: 'Transferencia entre cuentas (retiro)',
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(amount)

const isAvailableAccount = (investment: Investment) => investment.type.toLocaleLowerCase() === 'disponible'
const matchesNu = (investment: Investment) => /\b(nu|cajita)\b/i.test(`${investment.name} ${investment.institution}`)

function AccountSelect({ label, value, emptyLabel, accounts, onChange, offerAvailable }: {
  label: string
  value?: string
  emptyLabel: string
  accounts: Investment[]
  onChange: (investmentId?: string) => void
  offerAvailable?: boolean
}) {
  return (
    <label className="review-account">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">{emptyLabel}</option>
        {offerAvailable && <option value={AVAILABLE_ACCOUNT_ID}>Dinero disponible (cuenta de ahorros) · nueva</option>}
        {accounts.map((investment) => (
          <option key={investment.id} value={investment.id}>{investment.name} · {formatCurrency(investment.value)}</option>
        ))}
      </select>
    </label>
  )
}

interface ReviewRowProps {
  transaction: ReviewTransaction
  index: number
  related?: ReviewTransaction
  investments: Investment[]
  incomeActivities: string[]
  onChange: (id: string, patch: Partial<ReviewTransaction>) => void
  onRemove: (id: string) => void
}

const ReviewRow = memo(function ReviewRow({ transaction, index, related, investments, incomeActivities, onChange, onRemove }: ReviewRowProps) {
  const { id } = transaction
  const isFee = Boolean(transaction.relatedTransactionId)
  const sourceAccounts = investments.filter((investment) => !isAvailableAccount(investment))
  const availableAccounts = investments.filter(isAvailableAccount)

  return (
    <article className={`review-row${transaction.duplicate ? ' possible-duplicate' : ''}${isFee ? ' review-card-related' : ''}${transaction.include ? '' : ' excluded'}`}>
      <div className="review-row-main">
        <label className="review-select">
          <input type="checkbox" checked={transaction.include} onChange={(event) => onChange(id, { include: event.target.checked })} aria-label={`Incluir movimiento ${index + 1}`} />
          <span>{index + 1}</span>
        </label>
        <label>Fecha<input type="date" value={transaction.date} onChange={(event) => onChange(id, { date: event.target.value })} /></label>
        <label>Hora<input type="time" value={transaction.time} onChange={(event) => onChange(id, { time: event.target.value })} /></label>
        <label className="review-field-wide">Descripción<input value={transaction.title} onChange={(event) => onChange(id, { title: event.target.value })} /></label>
        <label>Monto<input type="number" min="0.01" step="0.01" value={transaction.amount} onChange={(event) => onChange(id, { amount: event.target.value })} /></label>
        <label>Tipo<select value={transaction.direction} onChange={(event) => {
          const direction = event.target.value as ImportDirection
          const usesAccount = direction === 'transfer' || direction === 'withdrawal' || direction === 'expense'
          onChange(id, {
            direction,
            investmentId: usesAccount ? transaction.investmentId : undefined,
            destinationInvestmentId: direction === 'withdrawal' ? transaction.destinationInvestmentId : undefined,
            incomeActivity: direction === 'income' ? transaction.incomeActivity || 'Empleo' : undefined,
          })
        }}>{Object.entries(directionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Categoría<input value={transaction.category} onChange={(event) => onChange(id, { category: event.target.value })} placeholder="Categoría" /></label>
        <span className={`confidence confidence-${transaction.confidence}`}>
          {transaction.duplicate ? 'Posible duplicado' : transaction.confidence === 'high' ? 'Lectura clara' : transaction.confidence === 'medium' ? 'Revisar' : 'Confianza baja'}
        </span>
        <button type="button" className="delete-button" onClick={() => onRemove(id)} aria-label={`Quitar movimiento ${index + 1}`}>×</button>
      </div>
      <div className="review-row-extra">
        {transaction.direction === 'income' && (
          <label className="review-account"><span>Actividad</span><input required list={`import-income-activities-${id}`} value={transaction.incomeActivity ?? 'Empleo'} onChange={(event) => onChange(id, { incomeActivity: event.target.value })} placeholder="Ej. Empleo" /><datalist id={`import-income-activities-${id}`}>{incomeActivities.map((activity) => <option key={activity} value={activity} />)}</datalist></label>
        )}
        {transaction.direction === 'transfer' && (
          <AccountSelect label="Aporte a" value={transaction.investmentId} emptyLabel="No sumar a inversiones" accounts={investments} offerAvailable={!availableAccounts.length} onChange={(investmentId) => onChange(id, { investmentId })} />
        )}
        {transaction.direction === 'withdrawal' && (
          <>
            <AccountSelect label="Sale de" value={transaction.investmentId} emptyLabel="No restar de inversiones" accounts={sourceAccounts} onChange={(investmentId) => onChange(id, { investmentId })} />
            <AccountSelect label="Llega a" value={transaction.destinationInvestmentId} emptyLabel="No sumar a dinero disponible" accounts={availableAccounts} offerAvailable={!availableAccounts.length} onChange={(destinationInvestmentId) => onChange(id, { destinationInvestmentId })} />
            <span className="review-hint">No es un ingreso: mueve dinero entre tus cuentas.</span>
          </>
        )}
        {transaction.direction === 'expense' && (
          <AccountSelect label="Pagado desde" value={transaction.investmentId} emptyLabel="No descontar de cuentas" accounts={investments} offerAvailable={!availableAccounts.length} onChange={(investmentId) => onChange(id, { investmentId })} />
        )}
        {related && <span className="review-hint">{isFee ? `Impuesto de ${related.title}` : `Incluye ${related.title}: ${formatCurrency(Number(related.amount))}`}</span>}
        <span className="review-source">{transaction.sourceFile}</span>
      </div>
    </article>
  )
})

export function FinancialImportDialog({
  open,
  existingMovements,
  investments,
  incomeActivities,
  onClose,
  onImport,
}: FinancialImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [transactions, setTransactions] = useState<ReviewTransaction[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const existingFingerprints = useMemo(() => new Set(existingMovements.map((movement) =>
    transactionFingerprint({
      date: movement.date,
      amount: String(movement.amount),
      title: movement.title,
      direction: movement.direction,
    }),
  )), [existingMovements])

  const updateTransaction = useCallback((id: string, patch: Partial<ReviewTransaction>) => {
    setTransactions((current) => {
      const transaction = current.find((item) => item.id === id)
      const relatedId = transaction?.relatedTransactionId
        ?? current.find((item) => item.relatedTransactionId === id)?.id
      return current.map((item) => {
        if (item.id === id) return { ...item, ...patch }
        if (patch.include !== undefined && item.id === relatedId) return { ...item, include: patch.include }
        return item
      })
    })
  }, [])

  const removeTransaction = useCallback((id: string) => {
    setTransactions((current) => {
      const transaction = current.find((item) => item.id === id)
      const relatedId = transaction?.relatedTransactionId
        ?? current.find((item) => item.relatedTransactionId === id)?.id
      return current.filter((item) => item.id !== id && item.id !== relatedId)
    })
  }, [])

  const relatedById = useMemo(() => {
    const byId = new Map(transactions.map((item) => [item.id, item]))
    const result = new Map<string, ReviewTransaction>()
    for (const item of transactions) {
      if (!item.relatedTransactionId) continue
      const parent = byId.get(item.relatedTransactionId)
      if (parent) {
        result.set(item.id, parent)
        result.set(parent.id, item)
      }
    }
    return result
  }, [transactions])

  if (!open) return null

  const processFiles = async (files: File[]) => {
    const supportedFiles = files.filter(isSupportedFinancialFile)
    const unsupportedFiles = files.filter((file) => !isSupportedFinancialFile(file))
    setErrors(unsupportedFiles.map((file) => `${file.name}: formato no compatible.`))
    if (!supportedFiles.length) return

    setIsProcessing(true)
    setWarnings([])
    const nextTransactions: ReviewTransaction[] = []
    const nextErrors = unsupportedFiles.map((file) => `${file.name}: formato no compatible.`)
    try {
      for (const [index, file] of supportedFiles.entries()) {
        setProgress(`Procesando ${index + 1} de ${supportedFiles.length}: ${file.name}`)
        try {
          const result = await parseFinancialFile(file, (status) => setProgress(status.message))
          setWarnings((current) => [...current, ...result.warnings])
          for (const transaction of result.transactions) {
            const duplicate = existingFingerprints.has(transactionFingerprint(transaction))
              || nextTransactions.some((item) => transactionFingerprint(item) === transactionFingerprint(transaction))
            const isNuCajitaContribution = transaction.direction === 'transfer'
              && /\b(cajita|bolsillo)\b/i.test(transaction.title)
            const isNuCajitaWithdrawal = transaction.direction === 'withdrawal'
              && /\b(cajita|bolsillo)\b/i.test(transaction.title)
            const availableAccounts = investments.filter(isAvailableAccount)
            const matchedInvestment = isNuCajitaContribution
              ? investments.find(matchesNu)
              : isNuCajitaWithdrawal
                ? investments.find((investment) => !isAvailableAccount(investment) && matchesNu(investment))
                : undefined
            const destination = isNuCajitaWithdrawal
              ? availableAccounts.find(matchesNu) ?? availableAccounts[0]
              : undefined
            nextTransactions.push({
              ...transaction,
              investmentId: matchedInvestment?.id,
              destinationInvestmentId: destination?.id ?? (isNuCajitaWithdrawal ? AVAILABLE_ACCOUNT_ID : undefined),
              duplicate,
              include: !duplicate,
            })
          }
          for (const transaction of nextTransactions) {
            if (!transaction.relatedTransactionId) continue
            const related = nextTransactions.find((item) => item.id === transaction.relatedTransactionId)
            if (transaction.duplicate || related?.duplicate) {
              transaction.include = false
              if (related) related.include = false
            }
          }
          if (!result.transactions.length && !result.warnings.length) {
            nextErrors.push(`${file.name}: no se encontraron movimientos reconocibles.`)
          }
        } catch (error) {
          nextErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'No se pudo leer el archivo.'}`)
        }
      }
      // Si la captura incluye un retiro, los gastos salen de ese dinero disponible salvo que se elija otra cuenta.
      const receivedAt = nextTransactions.find((item) => item.direction === 'withdrawal' && item.destinationInvestmentId)?.destinationInvestmentId
      if (receivedAt) {
        for (const item of nextTransactions) {
          if (item.direction === 'expense' && !item.investmentId) item.investmentId = receivedAt
        }
      }
      setTransactions((current) => [...current, ...nextTransactions])
      setErrors(nextErrors)
      setProgress(nextTransactions.length ? `${nextTransactions.length} movimiento(s) detectado(s). Revisa cada campo antes de guardar.` : '')
    } finally {
      setIsProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void processFiles(Array.from(event.currentTarget.files ?? []))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void processFiles(Array.from(event.dataTransfer.files))
  }

  const selectedTransactions = transactions.filter((transaction) => transaction.include)

  return (
    <div className="import-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isProcessing) onClose()
    }}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="import-header">
          <div>
            <span className="section-kicker">IMPORTACIÓN PRIVADA</span>
            <h2 id="import-title">Importar documentos financieros</h2>
            <p>Los archivos se procesan en este dispositivo. No se envían a un servidor.</p>
          </div>
          <button type="button" className="import-close" onClick={onClose} disabled={isProcessing} aria-label="Cerrar">×</button>
        </header>

        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setIsDragging(false)
          }}
          onDrop={handleDrop}
        >
          <span className="drop-icon">↑</span>
          <div className="drop-copy">
            <strong>{isProcessing ? 'Leyendo archivo en tu dispositivo…' : 'Arrastra aquí tus documentos'}</strong>
            <span>Imágenes, PDF, Excel, CSV, OFX, QFX o TXT · máximo 25 MB por archivo</span>
          </div>
          <button type="button" className="button button-light" onClick={() => inputRef.current?.click()} disabled={isProcessing}>Seleccionar archivos</button>
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.pdf,.csv,.txt,.ofx,.qfx,.xlsx"
            multiple
            onChange={handleFileChange}
            hidden
          />
        </div>

        {progress && <p className="import-progress" role="status">{progress}</p>}
        {warnings.map((warning, index) => <p className="import-warning" key={`${warning}-${index}`}>{warning}</p>)}
        {errors.map((error, index) => <p className="import-error" key={`${error}-${index}`}>{error}</p>)}

        {transactions.length > 0 && (
          <div className="review-section">
            <div className="review-heading">
              <div><h3>Revisa los movimientos detectados</h3><p>Corrige lo que el OCR haya leído mal. Los retiros de Cajita son transferencias entre cuentas, no ingresos.</p></div>
              <span>{selectedTransactions.length} de {transactions.length} seleccionados</span>
            </div>
            <div className="review-list">
              {transactions.map((transaction, index) => (
                <ReviewRow
                  key={transaction.id}
                  transaction={transaction}
                  index={index}
                  related={relatedById.get(transaction.id)}
                  investments={investments}
                  incomeActivities={incomeActivities}
                  onChange={updateTransaction}
                  onRemove={removeTransaction}
                />
              ))}
            </div>
          </div>
        )}

        <footer className="import-footer">
          <span>La lectura automática puede equivocarse; compara cada dato con el documento original.</span>
          <div>
            <button type="button" className="button button-light" onClick={onClose} disabled={isProcessing}>Cancelar</button>
            <button
              type="button"
              className="button button-primary"
              disabled={isProcessing || selectedTransactions.length === 0 || selectedTransactions.some((transaction) => !transaction.date || !transaction.title.trim() || !Number.isFinite(Number(transaction.amount)) || Number(transaction.amount) <= 0 || (transaction.direction === 'income' && !transaction.incomeActivity?.trim()))}
              onClick={() => onImport(selectedTransactions)}
            >
              Guardar {selectedTransactions.length} movimiento{selectedTransactions.length === 1 ? '' : 's'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
