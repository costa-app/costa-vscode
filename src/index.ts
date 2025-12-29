import { defineExtension, useCommands } from 'reactive-vscode'
import * as vscode from 'vscode'
import { env, ExtensionMode, ProgressLocation, Uri, window } from 'vscode'
import * as cli from './cli'
import { ContextStatus } from './status/contextStatus'
import { PointsStatus } from './status/pointsStatus'
import { PrimaryStatus } from './status/primaryStatus'
import { UsageStream } from './usageStream'
import { initLogger, log } from './utils/logger'
import { SidebarProvider } from './views/sidebar'

const { activate, deactivate } = defineExtension((context) => {
  // Initialize the logger
  initLogger(context)

  // Check if we're in development mode
  const isDevelopment = context.extensionMode === ExtensionMode.Development

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

  // Create and register sidebar providers
  const usageProvider = new SidebarProvider(context, usageStream, 'usage')
  const setupProvider = new SidebarProvider(context, usageStream, 'setup')

  context.subscriptions.push(
    window.registerWebviewViewProvider('costa.usage', usageProvider),
    window.registerWebviewViewProvider('costa.setup', setupProvider),
  )

  // Handle usage data updates
  usageStream.on('usage', (data: any) => {
    log.info(`index: Received usage data: ${JSON.stringify(data)}`)

    try {
      if (data) {
        pointsStatus.update(data.points, data.total_points)
        contextStatus.update(data.context_length)
        usageProvider.notifyUsage(data)
        setupProvider.notifyUsage(data)
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
        vscode.commands.executeCommand('setContext', 'costa.loggedIn', true)
        primaryStatus.setLoggedIn()
        pointsStatus.show()
        contextStatus.show()
        // Start the usage stream
        usageStream.connect().catch(err => log.error('index: Error starting usage stream:', err))
      }
      else {
        log.info('index: User is not logged in, hiding points and context status')
        vscode.commands.executeCommand('setContext', 'costa.loggedIn', false)
        primaryStatus.setLoggedOut()
        pointsStatus.hide()
        contextStatus.hide()
      }
    })
    .catch((error) => {
      log.error('index: Error checking login status:', error)
      vscode.commands.executeCommand('setContext', 'costa.loggedIn', false)
      primaryStatus.setLoggedOut()
      pointsStatus.hide()
      contextStatus.hide()
    })

  // Register all commands
  useCommands({
    'costa.showExtensionInfo': () => {
      window.showInformationMessage('💫 ready to explore the universe?')
    },
    'costa.sidebar.reveal': async () => {
      try {
        await vscode.commands.executeCommand('costa.sidebar.focus')
      }
      catch (error) {
        log.error('index: sidebar.reveal failed:', error)
      }
    },
    'costa.revealAndRefresh': async () => {
      try {
        await vscode.commands.executeCommand('costa.usage.focus')
        await usageStream.fetchUsageData()
        await usageProvider.refreshAll()
        await setupProvider.refreshAll()
      }
      catch (error) {
        log.error('index: revealAndRefresh failed:', error)
        window.showErrorMessage('Failed to open or refresh Costa panel')
      }
    },
    'costa.login': async () => {
      try {
        if (isDevelopment) {
          window.showInformationMessage('Starting Costa authentication process...')
        }

        // Call CLI login
        const loginResult = await cli.login()

        if (loginResult.auth_url) {
          // Open the auth URL in the browser
          await env.openExternal(Uri.parse(loginResult.auth_url))

          // Start polling for login completion
          log.info('index: Starting login polling...')
          const pollInterval = setInterval(async () => {
            try {
              const statusResult = await cli.status()
              if (statusResult.logged_in) {
                clearInterval(pollInterval)
                log.info('index: Login successful')
                if (isDevelopment) {
                  window.showInformationMessage('Successfully logged in to Costa')
                }
                vscode.commands.executeCommand('setContext', 'costa.loggedIn', true)
                primaryStatus.setLoggedIn()
                pointsStatus.show()
                contextStatus.show()
                // Start the usage stream after login
                usageStream.connect().catch(err => log.error('index: Error starting usage stream:', err))
                // Refresh sidebar to show logged-in state
                usageProvider.refreshAll().catch(err => log.error('index: Error refreshing usage view:', err))
                setupProvider.refreshAll().catch(err => log.error('index: Error refreshing setup view:', err))
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
        if (isDevelopment) {
          window.showInformationMessage('Logged out from Costa')
        }
        vscode.commands.executeCommand('setContext', 'costa.loggedIn', false)
        primaryStatus.setLoggedOut()
        pointsStatus.hide()
        contextStatus.hide()
        // Disconnect the usage stream
        usageStream.disconnect()
        // Refresh sidebar to show logged-out state
        await usageProvider.refreshAll()
        await setupProvider.refreshAll()
      }
      catch (error) {
        log.error('index: Logout failed:', error)
        window.showErrorMessage(`Logout failed: ${String(error)}`)
      }
    },
    'costa.setup.claudeCode': async () => {
      try {
        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: 'Setting up Claude Code...',
            cancellable: false,
          },
          async () => {
            await cli.setupClaudeCode()
            await usageProvider.refreshAll()
            await setupProvider.refreshAll()
          },
        )
        window.showInformationMessage('Claude Code setup complete')
      }
      catch (error) {
        log.error('index: setup.claudeCode failed', error)
        window.showErrorMessage(`Claude Code setup failed: ${String(error)}`)
      }
    },
    'costa.setup.codex': async () => {
      try {
        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: 'Setting up Codex...',
            cancellable: false,
          },
          async () => {
            await cli.setupCodex()
            await usageProvider.refreshAll()
            await setupProvider.refreshAll()
          },
        )
        window.showInformationMessage('Codex setup complete')
      }
      catch (error) {
        log.error('index: setup.codex failed', error)
        window.showErrorMessage(`Codex setup failed: ${String(error)}`)
      }
    },
    'costa.refreshPoints': async () => {
      log.info('index: Manually refreshing points data')
      if (isDevelopment) {
        window.showInformationMessage('Refreshing Costa usage information...')
      }
      try {
        await usageStream.fetchUsageData()
        if (isDevelopment) {
          window.showInformationMessage('Costa usage refreshed')
        }
      }
      catch (error) {
        log.error('index: Error refreshing points data:', error)
        window.showErrorMessage('Failed to refresh Costa points data')
      }
    },
    'costa.refresh': async () => {
      log.info('index: Refreshing sidebar')
      try {
        await usageStream.fetchUsageData()
        await usageProvider.refreshAll()
        await setupProvider.refreshAll()
      }
      catch (error) {
        log.error('index: Error refreshing sidebar:', error)
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
