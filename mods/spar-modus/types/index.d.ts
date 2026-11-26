export type LastAnswer = { model: string; isSmall: boolean }

declare module 'claude-code' {
  interface PluginState {
    'spar-modus': {
      isOn: Shaped<boolean>
      last: Shaped<LastAnswer | null>
      smallCount: Shaped<number>
    }
  }
}
