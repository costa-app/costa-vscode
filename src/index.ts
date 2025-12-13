import type { Uri } from 'vscode'
import { execFile } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { defineExtension, useCommands } from 'reactive-vscode'
import { commands, window } from 'vscode'
import { oauth2Client } from './oauth'
import { ContextStatus } from './status/contextStatus'
import { PointsStatus } from './status/pointsStatus'
import { PrimaryStatus } from './status/primaryStatus'
import { UsageStream } from './usageStream'
import { initLogger, log } from './utils/logger'

function getBundledCliPath(context: any): string {
  const extRoot: string = context?.extensionPath ?? context?.extensionUri?.fsPath
  if (!extRoot) {
    throw new Error('extension root path not available')
  }

  // NOTE: right now we only bundle a universal macOS binary
  if (process.platform === 'darwin') {
    return path.join(extRoot, 'res', 'bin', 'darwin-universal', 'costa')
  }

  // Placeholders for future platform support
  if (process.platform === 'win32') {
    return path.join(extRoot, 'res', 'bin', 'win32-x64', 'costa.exe')
  }

  // linux
  return path.join(extRoot, 'res', 'bin', 'linux-x64', 'costa')
}

async function runBundledCli(context: any, args: string[]): Promise<{ stdout: string, stderr: string }> {
  const bin = getBundledCliPath(context)

  if (!existsSync(bin)) {
    throw new Error(`costa CLI not found at ${bin}`)
  }

  // VSIX installs can drop executable bits; best-effort fix on unix.
  if (process.platform !== 'win32') {
    try {
      chmodSync(bin, 0o755)
    }
    catch {
      // ignore
    }
  }

  return await new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || '').toString().trim()
        reject(new Error(msg ? `${String(err)}\n${msg}` : String(err)))
        return
      }
      resolve({ stdout: (stdout || '').toString(), stderr: (stderr || '').toString() })
    })
  })
}

const { activate, deactivate } = defineExtension((context) => {
  // Initializers
  // Initialize the logger
  initLogger(context)
  // Initialize OAuth2 client
  oauth2Client.setContext(context)

  // 1. Create status bar items
  const primaryStatus = new PrimaryStatus()
  context.subscriptions.push(primaryStatus)

  const pointsStatus = new PointsStatus()
  context.subscriptions.push(pointsStatus)

  // Create context length status bar item
  const contextStatus = new ContextStatus()
  context.subscriptions.push(contextStatus)

  // Create usage stream
  const usageStream = new UsageStream()

  // Handle usage data updates
  usageStream.on('usage', (data: any) => {
    log.info(`index: Received usage data: ${JSON.stringify(data)}`)

    try {
      // Add safeguards for data handling
      if (data) {
        pointsStatus.update(data.points, data.total_points)

        const { activate: _activate, deactivate: _deactivate } = defineExtension((context) => {
          // Initializers
          // Initialize the logger
          initLogger(context)
          // Initialize OAuth2 client
          oauth2Client.setContext(context)

          // 1. Create status bar items
          const primaryStatus = new PrimaryStatus()
          context.subscriptions.push(primaryStatus)

          const pointsStatus = new PointsStatus()
          context.subscriptions.push(pointsStatus)

          // Create context length status bar item
          const contextStatus = new ContextStatus()
          context.subscriptions.push(contextStatus)

          // Create usage stream
          const usageStream = new UsageStream()

          // Handle usage data updates
          usageStream.on('usage', (data: any) => {
            log.info(`index: Received usage data: ${JSON.stringify(data)}`)

            try {
              // Add safeguards for data handling
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

          // If we are not logged in, only show primary and make it a warning
          void oauth2Client.getAccessToken()
            .then(Boolean)
            .then((isLoggedIn) => {
              if (isLoggedIn) {
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

          // Register all commands
          useCommands({
            'costa.showExtensionInfo': () => {
              window.showInformationMessage('💫 ready to explore the universe?')
            },
            'costa.login': async () => {
              window.showInformationMessage('Starting Costa authentication process...')
              const success = await oauth2Client.login()
              if (success) {
                log.info('index: Login successful')
                window.showInformationMessage('Successfully logged in to Costa')
                primaryStatus.setLoggedIn()
                pointsStatus.show()
                contextStatus.show()
                // Start the usage stream after login
                usageStream.connect().catch(err => log.error('index: Error starting usage stream:', err))
              }
            },
            'costa.logout': async () => {
              await oauth2Client.logout()
              log.info('index: Logout successful')
              window.showInformationMessage('Logged out from Costa')
              primaryStatus.setLoggedOut()
              pointsStatus.hide()
              contextStatus.hide()
              // Disconnect the usage stream
              usageStream.disconnect()
            },
            'costa.oauthCallback': async (uri: Uri) => {
              // This command will be called when the OAuth callback URI is opened
              // Forward to the OAuth2 client
              log.info('Received OAuth callback URI:', uri.toString())
              oauth2Client.handleCallback(uri)
            },
            'costa.doSSEStuff': () => {
              window.showInformationMessage('did something')
            },
          })

          // Handle URI callbacks
          context.subscriptions.push(
            window.registerUriHandler({
              handleUri(uri: Uri) {
                log.info('URI Handler received:', uri.toString())

                // Check if this is our OAuth callback
                if (uri.path === '/callback') {
                  // Execute the callback command with the URI
                  commands.executeCommand('costa.oauthCallback', uri)
                }
                else {
                  log.info(`Unknown URI path: ${uri.path}`)
                }
              },
            }),
          )

          // Return a cleanup function to dispose the status bar items
          return () => {
            log.info('index: Extension deactivating, disconnecting usage stream')
            usageStream.disconnect()
          }
        })

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

  // If we are not logged in, only show primary and make it a warning
  void oauth2Client.getAccessToken()
    .then(Boolean)
    .then((isLoggedIn) => {
      if (isLoggedIn) {
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

  // Register all commands
  useCommands({
    'costa.showExtensionInfo': () => {
      window.showInformationMessage('💫 ready to explore the universe?')
    },
    'costa.login': async () => {
      window.showInformationMessage('Starting Costa authentication process...')
      const success = await oauth2Client.login()
      if (success) {
        log.info('index: Login successful')
        window.showInformationMessage('Successfully logged in to Costa')
        primaryStatus.setLoggedIn()
        pointsStatus.show()
        contextStatus.show()
        // Start the usage stream after login
        usageStream.connect().catch(err => log.error('index: Error starting usage stream:', err))
      }
    },
    'costa.logout': async () => {
      await oauth2Client.logout()
      log.info('index: Logout successful')
      window.showInformationMessage('Logged out from Costa')
      primaryStatus.setLoggedOut()
      pointsStatus.hide()
      contextStatus.hide()
      // Disconnect the usage stream
      usageStream.disconnect()
    },
    'costa.oauthCallback': async (uri: Uri) => {
      // This command will be called when the OAuth callback URI is opened
      // Forward to the OAuth2 client
      log.info('Received OAuth callback URI:', uri.toString())
      oauth2Client.handleCallback(uri)
    },
    'costa.refreshPoints': async () => {
      log.info('index: Manually refreshing points data')
      window.showInformationMessage('Refreshing Costa usage information...')
      try {
        // Trigger a manual refresh of the usage data
        window.showInformationMessage('Refreshing Costa usage...')
        await usageStream.fetchUsageData()
      }
      catch (error) {
        log.error('index: Error refreshing points data:', error)
        window.showErrorMessage('Failed to refresh Costa points data')
      }
    },
    'costa.testCli': async () => {
      try {
        const { stdout, stderr } = await runBundledCli(context, ['--version'])
        const out = (stdout || stderr).trim()
        window.showInformationMessage(out ? `Costa CLI: ${out}` : 'Costa CLI ran successfully')
      }
      catch (error) {
        log.error('index: costa.testCli failed:', error)
        window.showErrorMessage(`Costa CLI failed: ${String(error)}`)
      }
    },
  })

  // Handle URI callbacks
  context.subscriptions.push(
    window.registerUriHandler({
      handleUri(uri: Uri) {
        log.info('URI Handler received:', uri.toString())

        // Check if this is our OAuth callback
        if (uri.path === '/callback') {
          // Execute the callback command with the URI
          commands.executeCommand('costa.oauthCallback', uri)
        }
        else {
          log.info(`Unknown URI path: ${uri.path}`)
        }
      },
    }),
  )

  // Return a cleanup function to dispose the status bar items
  return () => {
    log.info('index: Extension deactivating, disconnecting usage stream')
    usageStream.disconnect()
  }
})

export { activate, deactivate }
