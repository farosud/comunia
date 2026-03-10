import { describe, it, expect, vi } from 'vitest'
import { ReasoningStream } from '../reasoning.js'

describe('ReasoningStream', () => {
  it('emits and stores reasoning events', () => {
    const stream = new ReasoningStream()
    stream.emit_reasoning({ jobName: 'test', level: 'step', message: 'Starting...' })
    stream.emit_reasoning({ jobName: 'test', level: 'detail', message: 'Analyzing...' })

    const history = stream.getHistory()
    expect(history).toHaveLength(2)
    expect(history[0].message).toBe('Starting...')
    expect(history[0].timestamp).toBeDefined()
  })

  it('notifies listeners', () => {
    const stream = new ReasoningStream()
    const handler = vi.fn()
    stream.on('reasoning', handler)

    stream.emit_reasoning({ jobName: 'test', level: 'step', message: 'hello' })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].message).toBe('hello')
  })

  it('caps history at maxHistory', () => {
    const stream = new ReasoningStream(5)
    for (let i = 0; i < 10; i++) {
      stream.emit_reasoning({ jobName: 'test', level: 'detail', message: `msg-${i}` })
    }
    expect(stream.getHistory()).toHaveLength(5)
    expect(stream.getHistory()[0].message).toBe('msg-5')
  })

  it('stores structured data', () => {
    const stream = new ReasoningStream()
    stream.emit_reasoning({
      jobName: 'ideation', level: 'correlation',
      message: 'Found clusters',
      data: { clusters: [{ name: 'tech', count: 52 }] },
    })
    expect(stream.getHistory()[0].data?.clusters).toBeDefined()
  })
})
