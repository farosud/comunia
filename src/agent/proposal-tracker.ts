import type { EventManager } from '../events/manager.js'
import type { EventSignalSummary } from './event-signals.js'

export interface ProposalTrackerResult {
  eventId: string
  created: boolean
  changedFields: string[]
}

export async function createOrUpdateProposalFromSignals(
  eventManager: EventManager,
  proposedBy: string,
  originalText: string,
  signals: EventSignalSummary,
): Promise<ProposalTrackerResult | undefined> {
  const existing = await eventManager.getLatestProposalByUser(proposedBy)
  if (!shouldTrackProposal(originalText, signals, Boolean(existing))) return undefined

  const patch = buildProposalPatch(originalText, signals, existing)

  if (!existing) {
    const created = await eventManager.create({
      title: patch.title || 'Propuesta de evento',
      type: patch.type || 'other',
      proposedBy,
      date: patch.date || 'TBD',
      status: 'proposed',
      location: patch.location,
      maxCapacity: patch.maxCapacity,
      description: patch.description,
      agentNotes: patch.agentNotes,
    })

    return {
      eventId: created.id,
      created: true,
      changedFields: Object.keys(patch),
    }
  }

  const changedFields = Object.keys(patch).filter((key) => {
    const value = (patch as any)[key]
    return value !== undefined && value !== null && value !== '' && (existing as any)[key] !== value
  })

  if (changedFields.length === 0) {
    return {
      eventId: existing.id,
      created: false,
      changedFields: [],
    }
  }

  await eventManager.update(existing.id, patch)
  return {
    eventId: existing.id,
    created: false,
    changedFields,
  }
}

function shouldTrackProposal(text: string, signals: EventSignalSummary, hasExistingProposal: boolean): boolean {
  const normalized = text.toLowerCase()
  const hasIntent = /\b(quiero|hagamos|organicemos|organizar|propongo|proponer|invitar|armemos|podr[ií]amos hacer|me gustar[ií]a hacer|me pinta|me late|vamos con)\b/.test(normalized)
  const signalCount = [signals.kind, signals.date, signals.location, signals.capacity, signals.time].filter(Boolean).length
  const hasProposalInstruction = /\b(enviar la propuesta|manda la propuesta|mandar al admin|enviar al admin|pasar al admin)\b/.test(normalized)

  if (hasExistingProposal) return signalCount > 0 || hasProposalInstruction
  return hasProposalInstruction || hasIntent || signalCount >= 2
}

function buildProposalPatch(originalText: string, signals: EventSignalSummary, existing?: any) {
  const type = normalizeEventType(signals.kind) || existing?.type || 'other'
  const title = buildTitle(type, signals.location, existing?.title)
  const date = buildDate(signals)
  const maxCapacity = parseCapacity(signals.capacity)
  const notes = buildNotes(originalText, signals, existing?.agentNotes)

  return {
    title,
    type,
    date: date || existing?.date || 'TBD',
    location: signals.location || existing?.location,
    maxCapacity: maxCapacity ?? existing?.maxCapacity,
    description: buildDescription(signals, existing?.description),
    agentNotes: notes,
  }
}

function buildTitle(type: string, location?: string, existingTitle?: string): string {
  if (existingTitle && existingTitle !== 'Propuesta de evento') return existingTitle
  const base = capitalize(type === 'other' ? 'evento' : type)
  return location ? `${base} en ${location}` : base
}

function buildDate(signals: EventSignalSummary): string | undefined {
  const parts = [signals.date, signals.time].filter(Boolean)
  if (parts.length === 0) return undefined
  return parts.join(' - ')
}

function buildDescription(signals: EventSignalSummary, existing?: string): string | undefined {
  const parts: string[] = []
  if (signals.kind) parts.push(`Tipo conversado: ${signals.kind}`)
  if (signals.date) parts.push(`Fecha conversada: ${signals.date}`)
  if (signals.time) parts.push(`Hora conversada: ${signals.time}`)
  if (signals.location) parts.push(`Lugar conversado: ${signals.location}`)
  if (signals.capacity) parts.push(`Capacidad conversada: ${signals.capacity}`)
  if (parts.length === 0) return existing
  return parts.join(' | ')
}

function buildNotes(originalText: string, signals: EventSignalSummary, existing?: string): string {
  const detailLines = [
    signals.kind ? `tipo=${signals.kind}` : undefined,
    signals.date ? `fecha=${signals.date}` : undefined,
    signals.time ? `hora=${signals.time}` : undefined,
    signals.location ? `lugar=${signals.location}` : undefined,
    signals.capacity ? `capacidad=${signals.capacity}` : undefined,
  ].filter(Boolean)

  const block = `Ultimo mensaje del miembro: ${originalText}${detailLines.length ? `\nDetalles detectados: ${detailLines.join(', ')}` : ''}`
  if (!existing) return block
  return `${existing}\n\n${block}`.split('\n\n').slice(-2).join('\n\n')
}

function normalizeEventType(kind?: string): string | undefined {
  if (!kind) return undefined
  if (kind === 'bbq') return 'asado'
  if (kind === 'dinner') return 'dinner'
  if (kind === 'party') return 'party'
  if (kind === 'outdoor') return 'outdoor'
  return kind
}

function parseCapacity(capacity?: string): number | undefined {
  if (!capacity) return undefined
  const match = capacity.match(/(\d+)/)
  return match ? Number(match[1]) : undefined
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
