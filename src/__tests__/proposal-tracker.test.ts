import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { EventManager } from '../events/manager.js'
import { createOrUpdateProposalFromSignals } from '../agent/proposal-tracker.js'

describe('proposal tracker', () => {
  let db: ReturnType<typeof createDb>
  let eventManager: EventManager

  beforeEach(() => {
    db = createDb(':memory:')
    eventManager = new EventManager(db)
    db.insert(users).values({
      id: 'u1',
      telegramId: 'tg_123',
      name: 'Emi',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }).run()
  })

  it('creates a proposal from conversational event intent', async () => {
    const result = await createOrUpdateProposalFromSignals(eventManager, 'u1', 'Quiero hacer un asado', {
      kind: 'asado',
    })

    expect(result?.created).toBe(true)
    const proposals = await eventManager.getProposals()
    expect(proposals).toHaveLength(1)
    expect(proposals[0].status).toBe('proposed')
  })

  it('updates the latest proposal with additional details', async () => {
    await createOrUpdateProposalFromSignals(eventManager, 'u1', 'Quiero hacer un asado', {
      kind: 'asado',
    })

    const result = await createOrUpdateProposalFromSignals(eventManager, 'u1', 'Quiero invitar a la comunidad el próximo sábado a las 8 pm en el Cowork, máximo 14 personas', {
      date: 'próximo sábado',
      time: '8 pm',
      location: 'el Cowork',
      capacity: 'máximo 14 personas',
    })

    expect(result?.created).toBe(false)
    const proposal = (await eventManager.getProposals())[0]
    expect(proposal.location).toContain('Cowork')
    expect(proposal.maxCapacity).toBe(14)
  })

  it('creates a proposal from conversational phrasing like "me pinta"', async () => {
    const result = await createOrUpdateProposalFromSignals(
      eventManager,
      'u1',
      'Me pinta un asado el Sabado 14 en el Cowork de crecimiento a las 18:00 horas',
      {
        kind: 'asado',
        date: 'Sabado 14',
        time: 'a las 18:00',
        location: 'el Cowork de crecimiento',
      },
    )

    expect(result?.created).toBe(true)
    const proposal = (await eventManager.getProposals())[0]
    expect(proposal.title).toContain('Asado')
    expect(proposal.location).toBe('el Cowork de crecimiento')
    expect(proposal.date).toContain('Sabado 14')
  })

  it('updates an existing proposal when the member asks to send it to the admin', async () => {
    await createOrUpdateProposalFromSignals(eventManager, 'u1', 'Quiero hacer un asado', {
      kind: 'asado',
    })

    const result = await createOrUpdateProposalFromSignals(
      eventManager,
      'u1',
      'Podes enviar la propuesta de ese plan al admin?',
      {},
    )

    expect(result?.created).toBe(false)
    expect(result?.changedFields).toContain('agentNotes')
    const proposals = await eventManager.getProposals()
    expect(proposals).toHaveLength(1)
    expect(proposals[0].agentNotes).toContain('Podes enviar la propuesta de ese plan al admin?')
  })
})
