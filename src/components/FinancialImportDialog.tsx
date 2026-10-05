import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { Investment, Movement } from '../types'
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
  transfer: 'Transferencia',
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(amount)

const formatExactCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

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

  if (!open) return null

  const existingFingerprints = new Set(existingMovements.map((movement) =>
    transactionFingerprint({
      date: movement.date,
      amount: String(movement.amount),
      title: movement.title,
      direction: movement.direction,
    }),
  ))

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
            const matchedInvestment = isNuCajitaContribution
              ? investments.find((investment) => /\b(nu|cajita)\b/i.test(`${investment.name} ${investment.institution}`))
              : undefined
            nextTransactions.push({
              ...transaction,
              investmentId: matchedInvestment?.id,
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

  const updateTransaction = (id: string, patch: Partial<ReviewTransaction>) => {
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
  }

  const removeTransaction = (id: string) => {
    setTransactions((current) => {
      const transaction = current.find((item) => item.id === id)
      const relatedId = transaction?.relatedTransactionId
        ?? current.find((item) => item.relatedTransactionId === id)?.id
      return current.filter((item) => item.id !== id && item.id !== relatedId)
    })
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
          <strong>{isProcessing ? 'Leyendo archivo en tu dispositivo…' : 'Arrastra aquí tus documentos'}</strong>
          <span>Imágenes, PDF, Excel, CSV, OFX, QFX o TXT · máximo 25 MB por archivo</span>
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
              <div><h3>Revisa los movimientos detectados</h3><p>Confirma la descripción, el monto, la fecha y el tipo antes de guardar.</p></div>
              <span>{selectedTransactions.length} seleccionados</span>
            </div>
            <div className="review-list">
              {transactions.map((transaction, index) => {
                const related = transactions.find((item) =>
                  item.id === transaction.relatedTransactionId || item.relatedTransactionId === transaction.id,
                )
                return (
                <article className={`${transaction.duplicate ? 'review-card possible-duplicate' : 'review-card'}${transaction.relatedTransactionId ? ' review-card-related' : ''}`} key={transaction.id}>
                  <div className="review-card-heading">
                    <label className="review-select">
                      <input type="checkbox" checked={transaction.include} onChange={(event) => updateTransaction(transaction.id, { include: event.target.checked })} />
                      <span>Movimiento {index + 1}</span>
                    </label>
                    <span className={`confidence confidence-${transaction.confidence}`}>
                      {transaction.duplicate ? 'Posible duplicado' : transaction.confidence === 'high' ? 'Lectura clara' : transaction.confidence === 'medium' ? 'Revisar' : 'Confianza baja'}
                    </span>
                    <button type="button" className="delete-button" onClick={() => removeTransaction(transaction.id)} aria-label={`Quitar movimiento ${index + 1}`}>×</button>
                  </div>
                  <div className="review-fields">
                    <label>Fecha<input type="date" value={transaction.date} onChange={(event) => updateTransaction(transaction.id, { date: event.target.value })} /></label>
                    <label>Hora<input type="time" value={transaction.time} onChange={(event) => updateTransaction(transaction.id, { time: event.target.value })} /></label>
                    <label className="review-field-wide">Descripción<input value={transaction.title} onChange={(event) => updateTransaction(transaction.id, { title: event.target.value })} /></label>
                    <label>Monto<input type="number" min="0.01" step="0.01" value={transaction.amount} onChange={(event) => updateTransaction(transaction.id, { amount: event.target.value })} /></label>
                    <label>Tipo<select value={transaction.direction} onChange={(event) => {
                      const direction = event.target.value as ImportDirection
                      updateTransaction(transaction.id, {
                        direction,
                        investmentId: direction === 'transfer' ? transaction.investmentId : undefined,
                        incomeActivity: direction === 'income' ? transaction.incomeActivity || 'Empleo' : undefined,
                      })
                    }}>{Object.entries(directionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>Categoría<input value={transaction.category} onChange={(event) => updateTransaction(transaction.id, { category: event.target.value })} placeholder="Escribe o corrige la categoría" /></label>
                    {transaction.direction === 'income' && <label>Actividad<input required list={`import-income-activities-${transaction.id}`} value={transaction.incomeActivity ?? 'Empleo'} onChange={(event) => updateTransaction(transaction.id, { incomeActivity: event.target.value })} placeholder="Ej. Empleo" /><datalist id={`import-income-activities-${transaction.id}`}>{incomeActivities.map((activity) => <option key={activity} value={activity} />)}</datalist></label>}
                    <span className="review-source">Archivo: {transaction.sourceFile}</span>
                  </div>
                  {related && <div className="related-expense-note">
                    <span>{transaction.relatedTransactionId ? `Impuesto relacionado con ${related.title}` : 'Impuesto asociado a este pago'}</span>
                    <strong>{related.title}</strong>
                    <span>{formatExactCurrency(Number(related.amount))} · {related.category}</span>
                  </div>}
                  {transaction.direction === 'transfer' && <section className="investment-target" aria-label={`Destino del movimiento ${index + 1}`}>
                      <div>
                        <strong>¿A qué inversión se destinó?</strong>
                        <span>Solo al seleccionar una cuenta se sumará este aporte a su saldo. Los ingresos y gastos no se asignan automáticamente.</span>
                      </div>
                      <div className="investment-target-options">
                        <button
                          type="button"
                          className={`investment-target-card no-investment${transaction.investmentId ? '' : ' selected'}`}
                          aria-pressed={!transaction.investmentId}
                          onClick={() => updateTransaction(transaction.id, { investmentId: undefined })}
                        >
                          <span className="target-icon">↗</span>
                          <span><strong>No aplica</strong><small>No sumar a inversiones</small></span>
                        </button>
                        {investments.map((investment) => {
                          return (
                            <button
                              type="button"
                              className={`investment-target-card${transaction.investmentId === investment.id ? ' selected' : ''}`}
                              aria-pressed={transaction.investmentId === investment.id}
                              key={investment.id}
                              onClick={() => updateTransaction(transaction.id, {
                                investmentId: investment.id,
                                direction: transaction.direction === 'expense' ? 'transfer' : transaction.direction,
                              })}
                            >
                              <span className="target-icon">◉</span>
                              <span><strong>{investment.name}</strong><small>{investment.institution} · {formatCurrency(investment.value)}</small></span>
                            </button>
                          )
                        })}
                        {!investments.length && <p className="investment-target-empty">Primero crea una cuenta o inversión en la sección Inversiones.</p>}
                      </div>
                    </section>}
                </article>
                )
              })}
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
