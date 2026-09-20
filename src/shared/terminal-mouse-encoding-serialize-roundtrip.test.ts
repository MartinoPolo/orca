// @vitest-environment happy-dom
import { SerializeAddon } from '@xterm/addon-serialize'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { Terminal as BrowserTerminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import { serializeWithAbsoluteCursor } from './terminal-serialize-absolute-cursor'

type RealTerminal = HeadlessTerminal | BrowserTerminal

const terminalFactories = [
  { name: 'headless', create: () => new HeadlessTerminal({ allowProposedApi: true }) },
  { name: 'browser', create: () => new BrowserTerminal({ allowProposedApi: true }) }
]

const bufferCases = [
  { name: 'normal', enter: '', expectedType: 'normal' },
  { name: 'alternate', enter: '\x1b[?1049h', expectedType: 'alternate' }
]

const encodingCases = [
  { name: 'SGR', enable: '\x1b[?1006h', expectedStatus: '\x1b[?1006;1$y\x1b[?1016;2$y' },
  {
    name: 'SGR_PIXELS',
    enable: '\x1b[?1016h',
    expectedStatus: '\x1b[?1006;2$y\x1b[?1016;1$y'
  },
  { name: 'DEFAULT', enable: '', expectedStatus: '\x1b[?1006;2$y\x1b[?1016;2$y' }
]

const activeMouseCases = [
  {
    name: 'X10 with SGR',
    enable: '\x1b[?9h\x1b[?1006h',
    expectedStatus:
      '\x1b[?9;1$y\x1b[?1000;2$y\x1b[?1002;2$y\x1b[?1003;2$y\x1b[?1006;1$y\x1b[?1016;2$y'
  },
  {
    name: 'VT200 with SGR_PIXELS',
    enable: '\x1b[?1000h\x1b[?1016h',
    expectedStatus:
      '\x1b[?9;2$y\x1b[?1000;1$y\x1b[?1002;2$y\x1b[?1003;2$y\x1b[?1006;2$y\x1b[?1016;1$y'
  },
  {
    name: 'drag with SGR_PIXELS',
    enable: '\x1b[?1002h\x1b[?1016h',
    expectedStatus:
      '\x1b[?9;2$y\x1b[?1000;2$y\x1b[?1002;1$y\x1b[?1003;2$y\x1b[?1006;2$y\x1b[?1016;1$y'
  },
  {
    name: 'any-event with SGR',
    enable: '\x1b[?1003h\x1b[?1006h',
    expectedStatus:
      '\x1b[?9;2$y\x1b[?1000;2$y\x1b[?1002;2$y\x1b[?1003;1$y\x1b[?1006;1$y\x1b[?1016;2$y'
  }
]

function write(terminal: RealTerminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve))
}

async function readMouseModes(terminal: RealTerminal): Promise<string> {
  let response = ''
  const disposable = terminal.onData((data) => {
    response += data
  })
  await write(terminal, '\x1b[?9$p\x1b[?1000$p\x1b[?1002$p\x1b[?1003$p\x1b[?1006$p\x1b[?1016$p')
  disposable.dispose()
  return response
}

describe('mouse encoding snapshot round trips', () => {
  for (const terminalFactory of terminalFactories) {
    for (const bufferCase of bufferCases) {
      for (const encodingCase of encodingCases) {
        it(`preserves disabled tracking and ${encodingCase.name} encoding from a real ${terminalFactory.name} ${bufferCase.name} screen`, async () => {
          const source = terminalFactory.create()
          const destination = terminalFactory.create()
          const serializer = new SerializeAddon()
          source.loadAddon(serializer)
          try {
            await write(source, `normal${bufferCase.enter}active${encodingCase.enable}\x1b[?1000l`)
            await write(destination, '\x1b[?1000h\x1b[?1016h')
            await write(destination, serializeWithAbsoluteCursor(serializer, source))

            expect(destination.buffer.active.type).toBe(bufferCase.expectedType)
            expect(await readMouseModes(destination)).toBe(
              `\x1b[?9;2$y\x1b[?1000;2$y\x1b[?1002;2$y\x1b[?1003;2$y${encodingCase.expectedStatus}`
            )
          } finally {
            source.dispose()
            destination.dispose()
          }
        })
      }
    }
  }

  for (const terminalFactory of terminalFactories) {
    for (const activeMouseCase of activeMouseCases) {
      it(`preserves ${activeMouseCase.name} from a real ${terminalFactory.name} alternate screen`, async () => {
        const source = terminalFactory.create()
        const destination = terminalFactory.create()
        const serializer = new SerializeAddon()
        source.loadAddon(serializer)
        try {
          await write(source, `normal\x1b[?1049hfullscreen${activeMouseCase.enable}`)
          await write(destination, '\x1b[?1000h\x1b[?1016h')
          await write(destination, serializeWithAbsoluteCursor(serializer, source))

          expect(destination.buffer.active.type).toBe('alternate')
          expect(await readMouseModes(destination)).toBe(activeMouseCase.expectedStatus)
        } finally {
          source.dispose()
          destination.dispose()
        }
      })
    }
  }

  it('honors excludeModes for a real xterm source', async () => {
    const source = new HeadlessTerminal({ allowProposedApi: true })
    const destination = new HeadlessTerminal({ allowProposedApi: true })
    const serializer = new SerializeAddon()
    source.loadAddon(serializer)
    try {
      await write(source, 'content\x1b[?1006h')
      await write(
        destination,
        serializeWithAbsoluteCursor(serializer, source, { excludeModes: true })
      )
      expect(await readMouseModes(destination)).toBe(
        '\x1b[?9;2$y\x1b[?1000;2$y\x1b[?1002;2$y\x1b[?1003;2$y\x1b[?1006;2$y\x1b[?1016;2$y'
      )
    } finally {
      source.dispose()
      destination.dispose()
    }
  })

  it.each([
    { name: 'missing', core: undefined },
    {
      name: 'unrecognized',
      core: { mouseStateService: { activeProtocol: 'FUTURE', activeEncoding: 'FUTURE' } }
    }
  ])('leaves terminal doubles with $name private mouse state unchanged', ({ core }) => {
    const terminal = {
      cols: 10,
      rows: 5,
      buffer: { active: { cursorX: 2, cursorY: 1 } },
      _core: core
    }
    const serializer = { serialize: () => 'content' }

    expect(serializeWithAbsoluteCursor(serializer, terminal)).toBe('content\x1b[2;3H')
  })
})
