export interface EventSignalSummary {
  kind?: string
  date?: string
  time?: string
  location?: string
  capacity?: string
}

export function extractEventSignals(text: string): EventSignalSummary {
  const normalized = text.toLowerCase()
  const signals: EventSignalSummary = {}

  const kindMatch = normalized.match(/\b(asado|bbq|cena|dinner|fiesta|party|meetup|zoom|salida|caminata|outdoor)\b/)
  if (kindMatch) signals.kind = kindMatch[1]

  const dateMatch = text.match(/\b(\d{1,2}\s+de\s+[a-záéíóú]+|sábado\s+\d{1,2}|sabado\s+\d{1,2}|domingo\s+\d{1,2}|viernes\s+\d{1,2}|lunes\s+\d{1,2}|martes\s+\d{1,2}|miércoles\s+\d{1,2}|miercoles\s+\d{1,2}|jueves\s+\d{1,2}|pr[oó]ximo\s+s[áa]bado|pr[oó]ximo\s+viernes)\b/i)
  if (dateMatch) signals.date = dateMatch[1]

  const timeMatch = text.match(/\b(a las\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i)
  if (timeMatch) signals.time = timeMatch[1]

  const capacityMatch = text.match(/\b(m[aá]ximo\s+\d+\s+personas?|hasta\s+\d+\s+personas?|\d+\s+personas\s+m[aá]ximo)\b/i)
  if (capacityMatch) signals.capacity = capacityMatch[1]

  const locationMatch = text.match(/\b(en\s+(?:el|la)\s+.+?)(?=\s+a\s+las\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?\b|,\s*m[aá]ximo\b|,\s*hasta\b|[.!?\n]|$)/i)
  if (locationMatch) {
    signals.location = locationMatch[1].replace(/^en\s+/i, '')
  }

  return signals
}

export function buildEventProgressMessage(signals: EventSignalSummary): string | undefined {
  const parts: string[] = []
  if (signals.kind) parts.push(`tipo: ${signals.kind}`)
  if (signals.date) parts.push(`fecha: ${signals.date}`)
  if (signals.time) parts.push(`hora: ${signals.time}`)
  if (signals.location) parts.push(`lugar: ${signals.location}`)
  if (signals.capacity) parts.push(`capacidad: ${signals.capacity}`)

  if (parts.length === 0) return undefined
  return `Ya detecté una propuesta con ${parts.join(', ')}.`
}
