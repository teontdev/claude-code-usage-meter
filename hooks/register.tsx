import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Snap } from '../types'

const snap = atom({ plugin: 'usage-meter', key: 'snap' } as const, null)

const toSnap = (context: SessionContextUsage, limits: SessionRateLimit[]): Snap => {
  const five = limits.find(l => l.kind === 'five_hour')
  const week = limits.find(l => l.kind === 'seven_day')
  return {
    tokens: context.tokens,
    window: context.window,
    context: context.percent,
    fiveHour: five?.percentUsed,
    fiveReset: five?.resetsAt,
    week: week?.percentUsed,
    weekReset: week?.resetsAt,
  }
}

// A figure the engine doesn't know yet (right after a compaction, until the next response) keeps
// its last value instead of turning into "--".
const merge = (prev: Snap | null, next: Snap): Snap => {
  const out: Snap = { ...prev }
  for (const [key, v] of Object.entries(next)) if (v !== undefined) Object.assign(out, { [key]: v })
  return out
}

const refresh = async ($: EngineInterface, tokens?: number) => {
  const u = await $.session.usage()
  await update($, snap, prev => merge(prev, { ...toSnap(u.context, u.rateLimits), ...(tokens !== undefined && { tokens }) }))
}

// Blocks per bar: fixed, so the green share is right however wide the bar is drawn.
const CELLS = 20
export const filled = (pct: number | undefined) =>
  Math.max(0, Math.min(CELLS, Math.round(((pct ?? 0) / 100) * CELLS)))
const GAP = 3
const k = (n: number) => `${Math.round(n / 1000)}k`

// Context percent from the raw token count, so it matches the numbers shown beside it.
export const contextPct = (s: Snap) =>
  s.tokens !== undefined && s.window ? (s.tokens / s.window) * 100 : s.context

// Local time of the machine: "2:50 PM", or with the weekday "Fri 12:00 PM".
export const resetAt = (iso: string | undefined, withDay: boolean) => {
  if (iso === undefined) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  return ` • ↻ ${d.toLocaleString('en-US', withDay ? { ...opts, weekday: 'short' } : opts)}`
}

export type Meter = { pct?: number; text: string }

export const meters = (s: Snap): Meter[] => {
  const ctx = contextPct(s)
  const pct = (p: number | undefined) => (p === undefined ? '--' : `${Math.round(p)}%`)
  return [
    {
      pct: ctx,
      text: `◴ ${pct(ctx)}${s.tokens !== undefined && s.window ? ` • ${k(s.tokens)}/${k(s.window)}` : ''}`,
    },
    { pct: s.fiveHour, text: `⚡${pct(s.fiveHour)}${resetAt(s.fiveReset, false)}` },
    { pct: s.week, text: `⚡${pct(s.week)}${resetAt(s.weekReset, true)}` },
  ]
}

// Compacting outlasts what a button press may run, so a timer starts it. It runs /compact as a
// command: the session's own compaction is refused on the desktop app.
let isCompacting = false
const compactNow = ($: EngineInterface, isWorking: boolean) => {
  if (isCompacting) return
  if (isWorking) return void $.ui.toast('Claude đang chạy, thử lại khi trả lời xong')
  isCompacting = true
  $.clock.after(0, async () => {
    try {
      await $.command.run({ command: 'compact' })
      await refresh($)
    } catch (err) {
      $.ui.toast(`Compact lỗi: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      isCompacting = false
    }
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    return r
  })

  // After every model response, so the bars move during a turn, not only at its end.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    await refresh($)
    return r
  })

  // Compaction (button, /compact or automatic) shrinks the context without a turn ending.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    // The engine reports no context fill until the next response; the compaction's own count does.
    if (r.messages && !e.agentId && e.trigger !== 'precompute') await refresh($, r.tokensAfter)
    return r
  })

  // After each turn and whenever a rate-limit window moves a point.
  on('session.measure', async ($, e, next) => {
    await update($, snap, prev => merge(prev, toSnap(e.context, e.rateLimits)))
    return next(e)
  })

  // One text row per band: three groups sharing the width; in each, a bar that grows and its label.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const ms = meters((await read($, snap)) ?? {})
    const { Box, Text, Button } = $.ui.resolve(e)

    // Each cell is a Box holding one ■ glyph: as tall as the text's letters (a background fill is a
    // whole line high), and all cells shrink alike when the bar is squeezed.
    const bar = (n: number) => (
      <Box flexDirection="row" flexWrap="nowrap" flexShrink={1} minWidth={0} columnGap={0}>
        {Array.from({ length: CELLS }, (_, i) => (
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text color={i < n ? 'success' : 'white'}>■ </Text>
          </Box>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="row" flexWrap="nowrap" justifyContent="space-between" width="100%" columnGap={GAP} marginTop={1} paddingX={1}>
        {ms.map(m => (
          <Box flexDirection="row" flexWrap="nowrap" flexShrink={1} minWidth={0} columnGap={1}>
            {bar(filled(m.pct))}
            <Box flexShrink={0}>
              <Text color="black" wrap="truncate">{m.text}</Text>
            </Box>
          </Box>
        ))}
        <Box flexShrink={0}>
          <Button key="compact" label="Compact" plain onPress={() => compactNow($, e.props.isWorking)}>
            <Text color="black">Compact</Text>
          </Button>
        </Box>
      </Box>
    )
  })
}
