import { BroadcastChannel } from './BroadcastChannel'
import { LeaderElector } from './LeaderElector'
import { createToken } from '../utils/token'
import { MessageActionType } from '../types/MessageActionType'

interface ITabManagerOptions {
  channelName: string
  leaderElection: boolean
  onPrompt: (event?: Event) => void
  onIdle: (event?: Event) => void
  onActive: (event?: Event) => void
  onMessage: (data: any) => void
  start: (remote?: boolean) => void
  reset: (remote?: boolean) => void
  activate: (remote?: boolean) => void
  pause: (remote?: boolean) => void
  resume: (remote?: boolean) => void
}

enum RegistryState {
  PROMPTED,
  ACTIVE,
  IDLE
}

interface IMessage {
  action: MessageActionType
  token: string
  data?: any
  dateNow?: number
}

export class TabManager {
  private channel: BroadcastChannel
  private options: ITabManagerOptions
  private elector: LeaderElector

  public token: string = createToken()
  public registry: Map<string, RegistryState> = new Map()
  public lastActiveRegistry: Map<string, number> = new Map()
  public allIdle: boolean = false

  constructor (options: ITabManagerOptions) {
    const { channelName } = options
    this.options = options

    this.channel = new BroadcastChannel(channelName)

    this.registry.set(this.token, RegistryState.ACTIVE)
    this.lastActiveRegistry.set(this.token, Date.now())

    if (options.leaderElection) {
      const electorOptions = {
        fallbackInterval: 2000,
        responseTime: 100,
      }
      this.elector = new LeaderElector(this.channel, electorOptions)
      this.elector.waitForLeadership()
    }

    this.channel.addEventListener('message', (message: MessageEvent<IMessage>) => {
        const { action, token, data, dateNow } = message.data

      switch (action) {
        case MessageActionType.REGISTER:
          this.registry.set(token, RegistryState.IDLE)
          this.lastActiveRegistry.set(this.token, Date.now())
          break
        case MessageActionType.DEREGISTER:
          this.registry.delete(token)
          this.lastActiveRegistry.delete(token)
          break
        case MessageActionType.IDLE:
          this.idle(token)
          break
        case MessageActionType.ACTIVE:
          this.active(token)
          break
        case MessageActionType.PROMPT:
          this.prompt(token)
          break
        case MessageActionType.START:
          this.start(token)
          break
        case MessageActionType.RESET:
          this.reset(token)
          break
        case MessageActionType.ACTIVATE:
          this.activate(token)
          break
        case MessageActionType.PAUSE:
          this.pause(token)
          break
        case MessageActionType.RESUME:
          this.resume(token)
          break
        case MessageActionType.MESSAGE:
          this.options.onMessage(data)
          break
        case MessageActionType.LAST_ACTIVE:
          this.lastActive(dateNow, token)
          break
      }
    })

    this.send(MessageActionType.REGISTER)
  }

  get isLeader () {
    if (!this.elector) throw new Error('❌ Leader election is not enabled. To Enable it set the "leaderElection" property to true.')
    return this.elector.isLeader
  }

  get isLastActiveTab() {
    if (!this.lastActiveRegistry.has(this.token))  
      return false

    const currTabLastActive = this.lastActiveRegistry.get(this.token)
    return [...this.lastActiveRegistry.values()].some(v => v > currTabLastActive)
  }

  prompt (token: string = this.token) {
    this.registry.set(token, RegistryState.PROMPTED)
    const isPrompted = [...this.registry.values()].every(v => v === RegistryState.PROMPTED)

    if (token === this.token) {
      this.send(MessageActionType.PROMPT)
    }

    if (isPrompted) {
      this.options.onPrompt()
    }
  }

  idle (token: string = this.token) {
    this.registry.set(token, RegistryState.IDLE)
    const isIdle = [...this.registry.values()].every(v => v === RegistryState.IDLE)

    if (token === this.token) {
      this.send(MessageActionType.IDLE)
    }

    if (!this.allIdle && isIdle) {
      this.allIdle = true
      this.options.onIdle()
    }
  }

  active (token: string = this.token) {
    this.allIdle = false
    this.registry.set(token, RegistryState.ACTIVE)
    const isActive = [...this.registry.values()].some(v => v === RegistryState.ACTIVE)

    if (token === this.token) {
      this.send(MessageActionType.ACTIVE)
    }

    if (isActive) {
      this.options.onActive()
    }
  }

  start (token = this.token) {
    this.allIdle = false
    this.registry.set(token, RegistryState.ACTIVE)
    if (token === this.token) {
      this.send(MessageActionType.START)
    } else {
      this.options.start(true)
    }
  }

  reset (token = this.token) {
    this.allIdle = false
    this.registry.set(token, RegistryState.ACTIVE)
    if (token === this.token) {
      this.send(MessageActionType.RESET)
    } else {
      this.options.reset(true)
    }
  }

  activate (token = this.token) {
    this.allIdle = false
    this.registry.set(token, RegistryState.ACTIVE)
    if (token === this.token) {
      this.send(MessageActionType.ACTIVATE)
    } else {
      this.options.activate(true)
    }
  }

  pause (token = this.token) {
    if (token === this.token) {
      this.send(MessageActionType.PAUSE)
    } else {
      this.options.pause(true)
    }
  }

  resume (token = this.token) {
    if (token === this.token) {
      this.send(MessageActionType.RESUME)
    } else {
      this.options.resume(true)
    }
  }

  message (data: any) {
    try {
      this.channel.postMessage({
        action: MessageActionType.MESSAGE,
        token: this.token,
        data,
      })
    } catch {}
  }

  lastActive (dateNow: number, token: string = this.token) {
    this.lastActiveRegistry.set(this.token, dateNow)
    
    if (token !== this.token)
      return
    
    try {
      this.channel.postMessage({
        action: MessageActionType.LAST_ACTIVE,
        token: this.token,
        dateNow,
      })
    } catch {}
  }

  send (action: MessageActionType) {
    try {
      this.channel.postMessage({ action, token: this.token })
    } catch {}
  }

  close () {
    if (this.options.leaderElection) {
      this.elector.close()
    }
    this.send(MessageActionType.DEREGISTER)
    this.channel.close()
  }
}
