import type { ExtensionContext } from 'vscode'
import { execFile } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { log } from './utils/logger'

export interface LoginResult {
  status: 'waiting_for_user' | 'ready' | 'error'
  message?: string
  auth_url?: string
  redirect_uri?: string
  timeout_seconds?: number
}

export interface StatusResult {
  logged_in: boolean
  points?: number | string
  total_points?: number | string
}

export interface TokenResult {
  access_token?: string
  expires_at?: number
  token_type?: string
}

let extensionContext: ExtensionContext | null = null

export function setContext(context: ExtensionContext) {
  extensionContext = context
}

function getBundledCliPath(context: ExtensionContext): string {
  const extRoot: string = context?.extensionPath ?? context?.extensionUri?.fsPath
  if (!extRoot) {
    throw new Error('extension root path not available')
  }

  if (process.platform === 'darwin') {
    return path.join(extRoot, 'res', 'bin', 'darwin-universal', 'costa')
  }

  if (process.platform === 'win32') {
    return path.join(extRoot, 'res', 'bin', 'win32-x64', 'costa.exe')
  }

  // linux - check architecture
  if (process.arch === 'arm64') {
    return path.join(extRoot, 'res', 'bin', 'linux-arm64', 'costa')
  }

  return path.join(extRoot, 'res', 'bin', 'linux-x64', 'costa')
}

async function run(args: string[]): Promise<{ stdout: string, stderr: string }> {
  if (!extensionContext) {
    throw new Error('CLI context not initialized. Call setContext() first.')
  }

  const bundledBin = getBundledCliPath(extensionContext)
  let binToUse: string | null = null

  // Try bundled binary first
  if (existsSync(bundledBin)) {
    binToUse = bundledBin
    log.info(`cli: Using bundled CLI at ${bundledBin}`)

    // VSIX installs can drop executable bits; best-effort fix on unix.
    if (process.platform !== 'win32') {
      try {
        chmodSync(binToUse, 0o755)
      }
      catch {
        // ignore
      }
    }
  }
  else {
    // Fallback to PATH
    log.info(`cli: Bundled CLI not found at ${bundledBin}, trying PATH`)
    binToUse = 'costa'
  }

  return await new Promise((resolve, reject) => {
    execFile(binToUse!, args, { timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || '').toString().trim()
        if (err.message.includes('ENOENT') && binToUse === 'costa') {
          reject(new Error('Costa CLI not found. Please reinstall the extension or install costa CLI manually.'))
          return
        }
        reject(new Error(msg ? `${String(err)}\n${msg}` : String(err)))
        return
      }
      resolve({ stdout: (stdout || '').toString(), stderr: (stderr || '').toString() })
    })
  })
}

export async function login(): Promise<LoginResult> {
  try {
    const { stdout } = await run(['login', '--format', 'json'])
    const result = JSON.parse(stdout) as LoginResult
    log.info(`cli.login: ${JSON.stringify(result)}`)
    return result
  }
  catch (error) {
    log.error('cli.login failed:', error)
    throw error
  }
}

export async function status(): Promise<StatusResult> {
  try {
    const { stdout } = await run(['status', '--format', 'json'])
    const result = JSON.parse(stdout) as StatusResult
    log.info(`cli.status: ${JSON.stringify(result)}`)
    return result
  }
  catch (error) {
    log.error('cli.status failed:', error)
    throw error
  }
}

export async function token(): Promise<TokenResult> {
  try {
    const { stdout } = await run(['token', '--format', 'json'])
    const result = JSON.parse(stdout) as TokenResult
    log.info(`cli.token: ${JSON.stringify(result)}`)
    return result
  }
  catch (error) {
    log.error('cli.token failed:', error)
    throw error
  }
}

export async function logout(): Promise<void> {
  try {
    await run(['logout'])
    log.info('cli.logout: successful')
  }
  catch (error) {
    log.error('cli.logout failed:', error)
    throw error
  }
}
