import { EventEmitter } from 'node:events'
import * as cli from './cli'
import { log } from './utils/logger'

export interface UsageData {
  points: number | string // Can be a number or a string like '∞'
  total_points: number | string // Can be a number or a string like '∞'
  context_length: number | string // Can be a number or '-k'
}

export class UsageStream extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private isConnecting = false

  constructor() {
    super()
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      return
    }

    this.isConnecting = true
    log.info('UsageStream: Starting connection attempt')
    try {
      // Fetch initial usage data
      await this.fetchUsageData()

      // Set up polling every 30 seconds
      this.setupPolling()
    }
    catch (error) {
      log.error('UsageStream: Error connecting to usage API:', error)
      this.scheduleReconnect()
    }
    finally {
      this.isConnecting = false
    }
  }

  private setupPolling(): void {
    // Clear any existing polling interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
    }

    // Poll every 3 seconds (local CLI, can be aggressive)
    log.info('UsageStream: Setting up polling interval (3s)')
    this.pollInterval = setInterval(() => {
      this.fetchUsageData().catch((err) => {
        log.error('UsageStream: Error polling usage data:', err)
        this.scheduleReconnect()
      })
    }, 3000)
  }

  async fetchUsageData(): Promise<void> {
    try {
      const statusResult = await cli.status()

      if (!statusResult.logged_in) {
        log.info('UsageStream: User not logged in')
        return
      }

      // Map CLI status to UsageData format
      const data: UsageData = {
        points: statusResult.points ?? 0,
        total_points: statusResult.total_points ?? 0,
        context_length: '-', // Placeholder until CLI supports it
      }

      log.info(`UsageStream: Received usage data: points=${data.points}, total_points=${data.total_points}, context_length=${data.context_length}`)

      // Only emit usage event if we have actual usage data
      if (data.points !== undefined || data.total_points !== undefined || data.context_length !== undefined) {
        this.emit('usage', data)
      }
    }
    catch (error) {
      log.error('UsageStream: Error fetching status from CLI:', error)
      throw error
    }
  }

  disconnect(): void {
    log.info('UsageStream: Disconnecting')

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    log.info('UsageStream: Scheduling reconnect in 5 seconds')
    this.reconnectTimeout = setTimeout(() => {
      log.info('UsageStream: Attempting reconnect')
      this.connect().catch(err => log.error('UsageStream: Error reconnecting:', err))
    }, 5000)
  }
}
