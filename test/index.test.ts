import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('should', () => {
  it('exported', () => {
    expect(1).toEqual(1)
  })
})

// Cross-platform test to ensure an embedded costa binary exists
// and is callable for the current runner's OS/arch.
function expectedBundledBinaryPath(): string {
  const root = process.cwd()
  if (process.platform === 'darwin') {
    return path.join(root, 'res', 'bin', 'darwin-universal', 'costa')
  }
  if (process.platform === 'win32') {
    return path.join(root, 'res', 'bin', 'win32-x64', 'costa.exe')
  }
  if (process.arch === 'arm64') {
    return path.join(root, 'res', 'bin', 'linux-arm64', 'costa')
  }
  return path.join(root, 'res', 'bin', 'linux-x64', 'costa')
}

// Helper to conditionally skip the test (used for Windows until a bundled exe exists)
const itUnless = (cond: boolean) => (cond ? it.skip : it)

describe('embedded costa CLI binary', () => {
  const winExpected = path.join(process.cwd(), 'res', 'bin', 'win32-x64', 'costa.exe')

  itUnless(process.platform === 'win32' && !existsSync(winExpected))(
    'has an embedded binary for this runner arch and it is callable',
    async () => {
      const bin = expectedBundledBinaryPath()

      // It should exist for this OS/arch
      expect(existsSync(bin)).toBe(true)

      // On POSIX ensure it has any execute bit set
      if (process.platform !== 'win32') {
        const mode = statSync(bin).mode
        expect((mode & 0o111) !== 0).toBe(true)
      }

      // Try executing the binary. We don't assert on exit code or output,
      // only that it can be invoked (i.e., not ENOENT/EACCES).
      try {
        await execFileAsync(bin, ['--version'], { timeout: 5000 })
      }
      catch (err: any) {
        const code = (err && (err.code || err.errno)) as string | undefined
        if (code === 'ENOENT' || code === 'EACCES') {
          throw err
        }
        // Other non-zero exit codes are tolerated as long as execution started.
      }
    },
  )
})
