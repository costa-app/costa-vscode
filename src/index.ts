import { defineExtension, useCommands } from 'reactive-vscode'
import { env, Uri, window } from 'vscode'
import * as cli from './cli'
import { ContextStatus } from './status/contextStatus'
import { PointsStatus } from './status/pointsStatus'
import { PrimaryStatus } from './status/primaryStatus'
import { UsageStream } from './usageStream'
import { initLogger, log } from './utils/logger'

const { activate, deactivate } = defineExtension((context) => {
  // Initialize the logger
  initLogger(context)

  // Initialize CLI context
  cli.setContext(context)

  // Create status bar items
  const primaryStatus = new PrimaryStatus()
  context.subscriptions.push(primaryStatus)

  const pointsStatus = new PointsStatus()
  context.subscriptions.push(pointsStatus)

  const contextStatus = new ContextStatus()
  context.subscriptions.push(contextStatus)

  // Create usage stream
  const usageStream = new UsageStream()

  // Handle usage data updates
  usageStream.on('usage', (data: any) => {
    log.info(`index: Received usage data: ${JSON.stringify(data)}`)

    try {
      if (data) {
        pointsStatus.update(data.points, data.total_points)
        contextStatus.update(data.context_length)
      }
      else {
        log.warn('index: Received null or undefined usage data')
      }
    }
    catch (error) {
      log.error('index: Error handling usage data:', error)
    }
  })

  // Check login status on startup
  void cli.status()
    .then((result) => {
      if (result.logged_in) {
        log.info('index: User is logged in, showing all status items')
        primaryStatus.setLoggedIn()
        pointsStatus.show()
        contextStatus.show()
        // Start the usage stream
        usageStream.connect().catch(err => log.error('index: Error starting usage stream:', err))
      }
      else {
        log.info('index: User is not logged in, hiding points and context status')
        primaryStatus.setLoggedOut()
        pointsStatus.hide()
        contextStatus.hide()
      }
    })
    .catch((error) => {
      log.error('index: Error checking login status:', error)
      primaryStatus.setLoggedOut()
      pointsStatus.hide()
      contextStatus.hide()
    })

  // Register all commands
  useCommands({
    'costa.showExtensionInfo': () => {
      window.showInformationMessage('💫 ready to explore the universe?')
    },
    'costa.login': async () => {
      try {
        window.showInformationMessage('Starting Costa authentication process...')

        // Call CLI login
        const loginResult = await cli.login()

        if (loginResult.auth_url) {
          // Open the auth URL in the browser
          await env.openExternal(Uri.parse(loginResult.auth_url))

          if (loginResult.message) {
            window.showInformationMessage(loginResult.message)
          }

          // Start polling for login completion
          log.info('index: Starting login polling...')
          const pollInterval = setInterval(async () => {
            try {
              const statusResult = await cli.status()
              if (statusResult.logged_in) {
                clearInterval(pollInterval)
                log.info('index: Login successful')
                window.showInformationMessage('Successfully logged in to Costa')
                primaryStatus.setLoggedIn()
                pointsStatus.show()
                contextStatus.show()
                // Start the usage stream after login
                usageStream.connect().catch(err => log.error('index: Error starting usage stream:', err))
              }
            }
            catch (error) {
              log.error('index: Error during login polling:', error)
            }
          }, 3000)

          // Set a timeout to stop polling after the timeout_seconds from CLI
          const timeoutSeconds = loginResult.timeout_seconds ?? 600
          setTimeout(() => {
            clearInterval(pollInterval)
            log.info('index: Login polling timed out')
          }, timeoutSeconds * 1000)
        }
        else {
          window.showErrorMessage('Login failed: No auth URL returned')
        }
      }
      catch (error) {
        log.error('index: Login failed:', error)
        window.showErrorMessage(`Login failed: ${String(error)}`)
      }
    },
    'costa.logout': async () => {
      try {
        await cli.logout()
        log.info('index: Logout successful')
        window.showInformationMessage('Logged out from Costa')
        primaryStatus.setLoggedOut()
        pointsStatus.hide()
        contextStatus.hide()
        // Disconnect the usage stream
        usageStream.disconnect()
      }
      catch (error) {
        log.error('index: Logout failed:', error)
        window.showErrorMessage(`Logout failed: ${String(error)}`)
      }
    },
    'costa.refreshPoints': async () => {
      log.info('index: Manually refreshing points data')
      window.showInformationMessage('Refreshing Costa usage information...')
      try {
        await usageStream.fetchUsageData()
        window.showInformationMessage('Costa usage refreshed')
      }
      catch (error) {
        log.error('index: Error refreshing points data:', error)
        window.showErrorMessage('Failed to refresh Costa points data')
      }
    },
    'costa.testCli': async () => {
      try {
        const statusResult = await cli.status()
        const msg = statusResult.logged_in
          ? `Logged in - Points: ${statusResult.points ?? 0}/${statusResult.total_points ?? 0}`
          : 'Not logged in'
        window.showInformationMessage(`Costa CLI: ${msg}`)
      }
      catch (error) {
        log.error('index: costa.testCli failed:', error)
        window.showErrorMessage(`Costa CLI failed: ${String(error)}`)
      }
    },
  })

  // Return a cleanup function to dispose the status bar items
  return () => {
    log.info('index: Extension deactivating, disconnecting usage stream')
    usageStream.disconnect()
  }
})

export { activate, deactivate }
