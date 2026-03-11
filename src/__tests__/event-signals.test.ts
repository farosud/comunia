import { describe, it, expect } from 'vitest'
import { buildEventProgressMessage, extractEventSignals } from '../agent/event-signals.js'

describe('event signals', () => {
  it('extracts useful event details from conversational text', () => {
    const signals = extractEventSignals('Un asado el próximo sábado 14 de marzo a las 8 pm en el Cowork de crecimiento, máximo 14 personas')

    expect(signals.kind).toBe('asado')
    expect(signals.date).toBeDefined()
    expect(signals.time).toContain('8 pm')
    expect(signals.location).toContain('Cowork de crecimiento')
    expect(signals.capacity).toContain('14')
  })

  it('does not absorb the time into the detected location', () => {
    const signals = extractEventSignals('Me pinta un asado el Sabado 14 en el Cowork de crecimiento a las 18:00 horas')

    expect(signals.kind).toBe('asado')
    expect(signals.date).toContain('Sabado 14')
    expect(signals.time).toContain('18:00')
    expect(signals.location).toBe('el Cowork de crecimiento')
  })

  it('builds a human progress summary from the detected details', () => {
    const message = buildEventProgressMessage({
      kind: 'asado',
      date: '14 de marzo',
      location: 'el Cowork',
    })

    expect(message).toContain('tipo: asado')
    expect(message).toContain('fecha: 14 de marzo')
    expect(message).toContain('lugar: el Cowork')
  })
})
