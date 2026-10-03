export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'trek-band': { limits: Limit[]; scene: number; isPaused: boolean; tick: number; lastMessage: number; ctx: { tokens: number; window: number } }
  }
}
