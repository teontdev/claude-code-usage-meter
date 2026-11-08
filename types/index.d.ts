export type Snap = {
  tokens?: number
  window?: number
  context?: number
  fiveHour?: number
  fiveReset?: string
  week?: number
  weekReset?: string
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { snap: Snap | null }
  }
}
