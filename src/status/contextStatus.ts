import type { Disposable } from 'vscode'
import { StatusBarAlignment, ThemeColor, window } from 'vscode'
import { log } from '../utils/logger'

/**
 * Points usage status item.
 * Call `update(percentage)` whenever we receive new data.
 */
export class ContextStatus implements Disposable {
  private readonly item = window.createStatusBarItem(StatusBarAlignment.Left, 98)

  constructor() {
    this.item.text = '$(book) -k'
    this.item.tooltip = 'Context Length: -'
    this.item.show()
    log.info('ContextStatus: Initialized with default text')
  }

  /**
   * Map context length → VS Code theme color.
   */
  private colorForContextLength(context_length: number) {
    if (context_length >= 100000)
      return new ThemeColor('charts.red')
    if (context_length >= 25000)
      return new ThemeColor('charts.yellow')
    if (context_length >= 10000)
      return new ThemeColor('charts.green')
    return undefined
  }

  private formatForDisplay(context_length: number) {
    const formatted = context_length >= 1000
      ? `${Math.round(context_length / 1000)}k`
      : `${context_length}`
    return formatted
  }

  /**
   * Update the status bar to show current context length (0–100).
   * Clamps out-of-range inputs and formats tooltip/text.
   */
  update(context_length: number | string) {
    log.info(`ContextStatus: Update called with context_length=${context_length}`)

    // Check for undefined, invalid values, or placeholder string
    if (context_length === undefined || context_length === '-' || Number.isNaN(Number(context_length))) {
      log.info(`ContextStatus: No context_length data available, using default. context_length=${context_length}`)
      this.item.text = '$(book) -k'
      this.item.color = undefined
      this.item.tooltip = 'Context Length: -'
      return
    }

    try {
      const contextNum = typeof context_length === 'string' ? Number.parseInt(context_length, 10) : context_length
      const formattedValue = this.formatForDisplay(contextNum)
      const newText = `$(book) ${formattedValue}`
      log.info(`ContextStatus: Setting text to "${newText}" with context_length ${context_length}`)

      this.item.text = newText
      this.item.color = this.colorForContextLength(contextNum)
      this.item.tooltip = `Context Length: ${contextNum}`
    }
    catch (error) {
      log.error('ContextStatus: Error updating status bar:', error)
      // Fallback to default
      this.item.text = '$(book) -k'
      this.item.color = undefined
      this.item.tooltip = 'Context Length: -'
    }
  }

  show() {
    log.info('ContextStatus: Show called')
    this.item.show()
  }

  hide() {
    log.info('ContextStatus: Hide called')
    this.item.hide()
  }

  dispose() {
    log.info('ContextStatus: Dispose called')
    this.item.dispose()
  }
}
