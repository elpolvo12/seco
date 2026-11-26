import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LastAnswer } from '../types'

const PANE = 'spar-modus'
const SMALL = 'haiku'

const isOn = atom({ plugin: 'spar-modus', key: 'isOn' } as const, true, {
  shape: 'on-1',
})
const last = atom({ plugin: 'spar-modus', key: 'last' } as const, null, {
  shape: 'last-1',
})
const smallCount = atom({ plugin: 'spar-modus', key: 'smallCount' } as const, 0, {
  shape: 'count-1',
})

// Words that mean real work: those turns stay on the big model.
const WORK =
  /\b(bau\w*|implementier\w*|refactor\w*|fix\w*|debug\w*|schreib\w*|erstell\w*|ändere\w*|änder\w*|migrier\w*|deploy\w*|teste?\w*|build|implement|write|create|change|edit|rewrite|migrate|analy[sz]\w*|review\w*|plan\w*|optimi\w*|konfigurier\w*|install\w*|lös\w*|repar\w*)\b|```|\/[\w.-]+\.\w{1,5}\b/i

function isSimple(text: string): boolean {
  const t = text.trim()
  if (t === '' || t.startsWith('/')) return false
  if (t.length > 220 || t.split('\n').length > 3) return false
  return !WORK.test(t)
}

export const register: Register = on => {
  // Per turn of the main loop: was it judged simple, did it call a tool yet.
  const simple = new Map<string, boolean>()
  let currentTurn = ''
  let usedTool = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'spar',
      description: 'Spar-Modus ein- oder ausschalten',
    })
    void $.ui.open({ id: PANE, title: 'Spar-Modus' })

    return next(e)
  })

  on('command.run', { command: 'spar' }, async $ => {
    const now = await update($, isOn, v => !v)
    await $.ui.open({ id: PANE, title: 'Spar-Modus' })

    return { text: `Spar-Modus ${now ? 'an' : 'aus'}.` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      currentTurn = e.turnId
      usedTool = false
      simple.set(e.turnId, isSimple(e.text))
      if (simple.size > 50) simple.delete(simple.keys().next().value as string)
    }

    return next(e)
  })

  on('tool.call', ($, e, next) => {
    usedTool = true

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const wantsSmall =
      (await read($, isOn)) &&
      !usedTool &&
      e.turnId === currentTurn &&
      simple.get(e.turnId) === true
    const model = wantsSmall ? SMALL : e.model

    const answer: LastAnswer = { model, isSmall: wantsSmall }
    await update($, last, () => answer)
    if (wantsSmall) await update($, smallCount, n => n + 1)
    $.ui.status(`Modell: ${model}${wantsSmall ? ' (Spar-Modus)' : ''}`)

    return yield* next(wantsSmall ? { ...e, model } : e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const active = await read($, isOn)
    const l = await read($, last)
    const n = await read($, smallCount)

    return (
      <Box flexDirection="column">
        <Text>Spar-Modus: {active ? "AN" : "AUS"}</Text>
        <Button
          key="toggle"
          label={active ? "Ausschalten" : "Einschalten"}
          onPress={() => update($, isOn, v => !v)}
        />
        <Text> </Text>
        <Text>Zuletzt geantwortet:</Text>
        <Text>{l === null ? 'noch keine Antwort' : l.model}</Text>
        {l !== null && (
          <Text dimColor>{l.isSmall ? 'kleines Modell (gespart)' : 'großes Modell'}</Text>
        )}
        <Text dimColor>Schritte beim kleinen Modell: {n}</Text>
      </Box>
    )
  })
}
