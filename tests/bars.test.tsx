import { expect, test } from 'claude-code/testing'

import { contextPct, filled, meters, resetAt, termCells } from '../hooks/register'

const BAND = {
  plugin: 'usage-meter',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('filled blocks out of 20, clamped', () => {
  expect(filled(43.1)).toBe(9)
  expect(filled(0)).toBe(0)
  expect(filled(150)).toBe(20)
  expect(filled(undefined)).toBe(0)
})

test('reset time is local: time for 5h, weekday + time for the week', () => {
  // Machine timezone here is Asia/Bangkok (UTC+7).
  expect(resetAt('2026-11-08T07:50:00Z', false)).toBe(' • ↻ 2:50 PM')
  expect(resetAt('2026-11-13T05:00:00Z', true)).toBe(' • ↻ Fri 12:00 PM')
  expect(resetAt(undefined, true)).toBe('')
})

test('context percent comes from tokens over window', () => {
  expect(contextPct({ tokens: 431000, window: 1000000, context: 40 })).toBe(43.1)
  expect(contextPct({ context: 40 })).toBe(40)
})

test('band shows exact context, 5h, week; with Compact button', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { window: 1000000, tokens: 431000, percent: 43 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 72.4, resetsAt: '2026-11-08T07:50:00Z' },
      { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-11-13T05:00:00Z' },
    ],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /◴/ }))?.text).toBe('◴ 43% • 431k/1000k')
    expect((await ui.find({ type: 'Text', text: /⚡72%/ }))?.text).toBe(`⚡72%${resetAt('2026-11-08T07:50:00Z', false)}`)
    expect((await ui.find({ type: 'Text', text: /⚡12%/ }))?.text).toBe(`⚡12%${resetAt('2026-11-13T05:00:00Z', true)}`)
    if (surface === 'desktop') {
      const cells = await ui.findAll({ type: 'Text', text: /^■ $/ })
      expect(cells).toHaveLength(60)
      expect(cells.slice(0, 20).filter(x => x.props.color === 'success')).toHaveLength(9)
      expect(cells.slice(0, 20).filter(x => x.props.color === 'white')).toHaveLength(11)
    } else {
      // One unbroken run per bar, never the desktop's shrinking cells; labels in the terminal's own color.
      expect(await ui.findAll({ type: 'Text', text: /^■ $/ })).toHaveLength(0)
      const green = await ui.findAll({ type: 'Text', text: /^■*$/, props: { color: 'success' } })
      const n = termCells(120, meters({ tokens: 431000, window: 1000000, fiveHour: 72.4, week: 12, fiveReset: '2026-11-08T07:50:00Z', weekReset: '2026-11-13T05:00:00Z' }))
      expect(green[0]?.text).toBe('■'.repeat(Math.round(0.431 * n)))
      expect((await ui.find({ type: 'Text', text: /◴/ }))?.props.color).toBeUndefined()
    }
    expect((await ui.find({ type: 'Button' }))?.key).toBe('compact')
    await ui.unmount()
  }
})

test('Compact runs /compact as a command', async ($, on) => {
  const ran: string[] = []
  on('clock.after', () => ({ value: undefined }) as never)
  on('command.run', (_, e) => {
    ran.push(e.command)
    return { isHandled: true } as never
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, isWorking: false } })
  await ui.press({ key: 'compact' })
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await ui.unmount()
  expect(ran).toEqual(['compact'])
})

test('a model response mid-turn refreshes the bars', async ($, on) => {
  let tokens = 100000
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1000000, tokens, percent: 10 }, rateLimits: [] },
  }))
  on('turn.step', async function* (_, e) {
    tokens = 250000
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'm', input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1 })) void _
  expect((await ui.find({ type: 'Text', text: /◴/ }))?.text).toBe('◴ 25% • 250k/1000k')
  await ui.unmount()
})

test('after a compaction the bars show its token count, not "--"', async ($, on) => {
  let tokens: number | undefined = 800000
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1000000, tokens, percent: tokens && tokens / 10000 }, rateLimits: [] },
  }))
  on('session.compact', () => {
    tokens = undefined
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }], tokensBefore: 800000, tokensAfter: 30000 } as never
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] as never })
  expect((await ui.find({ type: 'Text', text: /◴/ }))?.text).toBe('◴ 3% • 30k/1000k')
  await ui.unmount()
})

test('terminal bars fit what the labels leave, 3 to 20 blocks', () => {
  const ms = meters({ tokens: 431000, window: 1000000, fiveHour: 72, week: 12 })
  expect(termCells(400, ms)).toBe(20)
  expect(termCells(40, ms)).toBe(3)
  const mid = termCells(100, ms)
  expect(mid).toBeGreaterThan(3)
  expect(mid).toBeLessThan(20)
})
