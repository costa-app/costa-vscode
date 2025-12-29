import type { ExtensionContext, Webview, WebviewView, WebviewViewProvider } from 'vscode'
import type { SetupStatusResult } from '../cli'

import type { UsageStream } from '../usageStream'
import * as vscode from 'vscode'
import * as cli from '../cli'
import { log } from '../utils/logger'

interface SidebarState {
  loggedIn: boolean
  usage?: {
    points: number | string
    total_points: number | string
    context_length: number | string
  }
  setup?: SetupStatusResult
  loading?: boolean
  error?: string
}

export class SidebarProvider implements WebviewViewProvider {
  private view?: WebviewView
  private latestUsage?: { points: any, total_points: any, context_length: any }
  private currentState: SidebarState = { loggedIn: false }

  constructor(
    private context: ExtensionContext,
    private usageStream: UsageStream,
    private mode: 'usage' | 'setup',
  ) {}

  resolveWebviewView(webviewView: WebviewView) {
    this.view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    }

    webviewView.webview.html = this.getHtml(webviewView.webview)

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.type) {
          case 'login':
            await vscode.commands.executeCommand('costa.login')
            break
          case 'logout':
            await vscode.commands.executeCommand('costa.logout')
            break
          case 'setup:claudeCode':
            await vscode.commands.executeCommand('costa.setup.claudeCode')
            break
          case 'setup:codex':
            await vscode.commands.executeCommand('costa.setup.codex')
            break
          case 'install:systemCosta':
            await vscode.commands.executeCommand('costa.install.system')
            break
          case 'refresh':
            await this.refreshAll()
            break
        }
      }
      catch (error) {
        log.error('sidebar: Error handling message:', error)
      }
    })

    // Send initial state
    void this.refreshAll()
  }

  public notifyUsage(data: { points: any, total_points: any, context_length: any }) {
    this.latestUsage = data
    // Update usage in current state and repost
    this.postState({
      usage: {
        points: data.points,
        total_points: data.total_points,
        context_length: data.context_length,
      },
    })
  }

  public async refreshAll() {
    try {
      const [status, setupStatus, systemBinary] = await Promise.all([
        cli.status().catch((err) => {
          log.error('sidebar: status failed', err)
          return undefined
        }),
        cli.setupStatus().catch((err) => {
          log.error('sidebar: setup status failed', err)
          return undefined
        }),
        cli.getSystemBinaryInfo().catch((err) => {
          log.error('sidebar: getSystemBinaryInfo failed', err)
          return undefined
        }),
      ])

      const loggedIn = !!status?.logged_in
      const usage = {
        points: this.latestUsage?.points ?? status?.points ?? 0,
        total_points: this.latestUsage?.total_points ?? status?.total_points ?? 0,
        context_length: this.latestUsage?.context_length ?? (status as any)?.context_length ?? '-',
      }

      const setup = {
        ...setupStatus,
        system_binary: systemBinary,
      }

      this.postState({ loggedIn, usage, setup })
    }
    catch (e) {
      log.error('sidebar: refreshAll error', e)
      this.postState({ error: 'Failed to refresh state' })
    }
  }

  private postState(partial?: Partial<SidebarState>) {
    if (!this.view)
      return

    // Merge with current state to preserve values like loggedIn
    this.currentState = {
      ...this.currentState,
      ...partial,
    }

    log.info(`sidebar: Posting state - loggedIn=${this.currentState.loggedIn}, hasUsage=${!!this.currentState.usage}, hasSetup=${!!this.currentState.setup}`)
    this.view.webview.postMessage({ type: 'state', body: this.currentState })
  }

  private getHtml(webview: Webview) {
    const nonce = getNonce()
    const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`
    const mode = this.mode

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Costa</title>
<style nonce="${nonce}">
  * {
    box-sizing: border-box;
  }
  body {
    padding: 0;
    margin: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 13px;
    border-radius: 2px;
  }
  button:hover {
    background: var(--vscode-button-hoverBackground);
  }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  #content {
    padding: 16px;
  }
  .section {
    margin-bottom: 24px;
  }
  .section h3 {
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .usage-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .usage-row:last-child {
    border-bottom: none;
  }
  .usage-label {
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
  }
  .usage-value {
    font-family: var(--vscode-editor-font-family);
  }
  .card {
    padding: 12px;
    margin-bottom: 12px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
  }
  .card h4 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
  }
  .card p {
    margin: 4px 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .card button {
    margin-top: 8px;
    width: 100%;
    background: #4f46e5;
    color: #ffffff;
  }
  .card button:hover {
    background: #4338ca;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
  }
  .status-configured {
    background: #6366f1;
    color: #ffffff;
  }
  .status-not-configured {
    background: #ea580c;
    color: #ffffff;
  }
  footer {
    position: sticky;
    bottom: 0;
    padding: 12px 16px;
    border-top: 1px solid var(--vscode-widget-border);
    background: var(--vscode-sideBar-background);
  }
  footer button {
    width: 100%;
  }
  .login-prompt {
    text-align: center;
    padding: 40px 20px;
  }
  .login-prompt h3 {
    margin-bottom: 16px;
    font-size: 16px;
  }
  .login-prompt p {
    margin-bottom: 24px;
    color: var(--vscode-descriptionForeground);
  }
  .login-prompt button {
    background: #4f46e5;
    color: #ffffff;
  }
  .login-prompt button:hover {
    background: #4338ca;
  }
  .error-message {
    padding: 12px;
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    color: var(--vscode-errorForeground);
    border-radius: 4px;
    margin-bottom: 16px;
  }
</style>
</head>
<body>
  <main id="content"></main>
  ${mode === 'setup' ? `<footer id="footer">
    <button id="logout" class="secondary">Logout</button>
  </footer>` : ''}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const mode = '${mode}';

function render(state) {
  const content = document.getElementById('content');
  const footer = document.getElementById('footer');

  if (state?.error) {
    content.innerHTML = \`<div class="error-message">\${state.error}</div>\`;
    if (footer) footer.style.display = 'none';
    return;
  }

  if (!state?.loggedIn) {
    content.innerHTML = \`
      <div class="login-prompt">
        <h3>Welcome to Costa</h3>
        <p>Log in to access AI models and manage your setup</p>
        <button id="login">Login to Costa</button>
      </div>
    \`;
    const loginBtn = document.getElementById('login');
    if (loginBtn) {
      loginBtn.onclick = () => vscode.postMessage({ type: 'login' });
    }
    if (footer) footer.style.display = 'none';
    return;
  }

  // Show footer when logged in
  if (footer) footer.style.display = 'block';

  // Logged in view
  const usage = state.usage || {};
  const setup = state.setup || {};

  const pts = usage.points ?? '-';
  const tot = usage.total_points ?? '-';
  const ctx = usage.context_length ?? '-';

  const claudeCodeConfigured = setup.claude_code?.config_exists && setup.claude_code?.is_costa_enabled;
  const codexConfigured = setup.codex?.config_exists && setup.codex?.is_costa_enabled;

  if (mode === 'usage') {
    content.innerHTML = \`
      <div class="section">
        <div class="usage-row">
          <span class="usage-label">Points</span>
          <span class="usage-value">\${pts}/\${tot}</span>
        </div>
        <div class="usage-row">
          <span class="usage-label">Context</span>
          <span class="usage-value">\${ctx}</span>
        </div>
      </div>
    \`;
  } else if (mode === 'setup') {
    const isUnix = navigator.platform.includes('Mac') || navigator.platform.includes('Linux');
    content.innerHTML = \`
      <div class="section">
        <div class="card">
          <h4>Claude Code</h4>
          <p>
            <span class="status-badge \${claudeCodeConfigured ? 'status-configured' : 'status-not-configured'}">
              \${claudeCodeConfigured ? '✓ Connected' : '⚠ Setup Needed'}
            </span>
          </p>
          \${setup.claude_code?.version ? \`<p>Version: \${setup.claude_code.version}</p>\` : ''}
          <button id="setup-claude-code">Set up Claude Code</button>
        </div>

        <div class="card">
          <h4>Codex</h4>
          <p>
            <span class="status-badge \${codexConfigured ? 'status-configured' : 'status-not-configured'}">
              \${codexConfigured ? '✓ Connected' : '⚠ Setup Needed'}
            </span>
          </p>
          <button id="setup-codex">Set up Codex</button>
        </div>

        \${isUnix ? \`
        <div class="card">
          <h4>System CLI</h4>
          <p>
            <span class="status-badge \${setup.system_binary?.installed ? 'status-configured' : 'status-not-configured'}">
              \${setup.system_binary?.installed ? '✓ Installed' : '⚠ Not Installed'}
            </span>
          </p>
          \${setup.system_binary?.version ? \`<p>Version: \${setup.system_binary.version}</p>\` : ''}
          <button id="install-system-costa">Install to /usr/local/bin</button>
        </div>
        \` : ''}
      </div>
    \`;

    const setupClaudeBtn = document.getElementById('setup-claude-code');
    if (setupClaudeBtn) {
      setupClaudeBtn.onclick = () => vscode.postMessage({ type: 'setup:claudeCode' });
    }

    const setupCodexBtn = document.getElementById('setup-codex');
    if (setupCodexBtn) {
      setupCodexBtn.onclick = () => vscode.postMessage({ type: 'setup:codex' });
    }

    const installBtn = document.getElementById('install-system-costa');
    if (installBtn) {
      installBtn.onclick = () => vscode.postMessage({ type: 'install:systemCosta' });
    }
  }
}

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
  logoutBtn.onclick = () => vscode.postMessage({ type: 'logout' });
}

window.addEventListener('message', ev => {
  if (ev.data?.type === 'state') {
    render(ev.data.body);
  }
});

// Request initial state
vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`
  }
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  return result
}
