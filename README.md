# Costa Code

<a href="https://marketplace.visualstudio.com/items?itemName=Costa.costa-code" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/Costa.costa-code.svg?color=eee&amp;label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version" /></a>
<a href="https://kermanx.github.io/reactive-vscode/" target="__blank"><img src="https://img.shields.io/badge/made_with-reactive--vscode-%23007ACC?style=flat&labelColor=%23229863"  alt="Made with reactive-vscode" /></a>

A Visual Studio Code extension that provides seamless integration with Costa AI services, including real-time usage tracking, authentication, and automated setup for Claude Code and Codex.

## Features

- **Authentication**: Secure login/logout to Costa services (OAuth flow handled by the bundled Costa CLI)
- **Real-time Usage Tracking**: Monitor your Costa points and context length usage directly in the status bar
- **Automated Setup**: One-click setup for Claude Code and Codex integration
- **Costa CLI Integration**: Bundled Costa CLI for macOS, Windows, and Linux with automatic platform detection
- **Usage Dashboard**: Dedicated sidebar panels for detailed usage information and setup management

## Configurations

This extension currently has no user-configurable settings. All configuration is handled automatically by the bundled Costa CLI.

## Commands

<!-- commands -->

| Command                   | Title                                |
| ------------------------- | ------------------------------------ |
| `costa.login`             | Costa Code: Login                    |
| `costa.logout`            | Costa Code: Logout                   |
| `costa.sidebar.reveal`    | Costa Code: Show Costa               |
| `costa.revealAndRefresh`  | Costa Code: Reveal and Refresh Costa |
| `costa.setup.claudeCode`  | Costa Code: Set up Claude Code       |
| `costa.setup.codex`       | Costa Code: Set up Codex             |
| `costa.setup.kilo`        | Costa Code: Set up Kilo              |
| `costa.refresh`           | Costa Code: Refresh                  |
| `costa.showExtensionInfo` | Costa Code: Show Extension Info      |
| `costa.refreshPoints`     | Costa Code: Refresh Points           |

<!-- commands -->

## Status Bar Items

When logged in, the extension displays usage information in the VS Code status bar:

- **Primary Status** (`💫`): Click to open Costa panel and refresh data (when logged in) or to log in (when logged out)
- **Points Usage** (`$(sparkle) X/Y`): Displays current points usage with color-coded indicators:
  - Green: 0-25% usage
  - Yellow: 25-50% usage
  - Red: 75%+ usage
  - No color: Unlimited points (`∞`)
- **Context Length** (`$(book) Xk`): Shows current context window usage with adaptive formatting

## Sidebar Views

The extension provides two webview panels in the Costa activity bar:

### Usage Panel
- Real-time points and context length display
- Automatic updates every 3 seconds
- Refresh button for manual updates

### Setup Panel
- **Claude Code Setup**: Configure Claude Code to use Costa AI models
- **Codex Setup**: Configure Codex integration
- Status indicators showing configuration state for each component
- One-click setup buttons for each integration

## Architecture

This extension is built using the [reactive-vscode](https://kermanx.github.io/reactive-vscode/) framework, which provides:

- Declarative extension definition with `defineExtension()`
- Reactive configuration management with VS Code settings
- Integrated logging with `useLogger()`
- Automatic metadata generation from package.json

### Key Components

- **CLI Integration** (`src/cli.ts`): Manages the bundled Costa CLI binary with automatic platform detection and execution
- **Usage Stream** (`src/usageStream.ts`): Real-time polling of usage data from the Costa API via CLI
- **Status Bar Items** (`src/status/`): Three status bar items for primary actions, points, and context tracking
- **Sidebar Provider** (`src/views/sidebar.ts`): Webview panels for usage dashboard and setup management

## Development

### Prerequisites

- Node.js 18+
- pnpm 10.4.1+

### Setup

```bash
# Install dependencies
pnpm install

# Start development mode with watch
pnpm run dev

# Run tests
pnpm run test

# Type checking
pnpm run typecheck

# Lint code
pnpm run lint
```

### Building

```bash
# Build extension
pnpm run build

# Package extension for distribution
pnpm run ext:package
```

## Internal Installation

To install an internal build of the Costa VS Code extension for use inside Costa:

1. Navigate to the GitHub releases page: https://github.com/costa-app/costa-vscode/releases
2. Locate the latest internal release (the `.vsix` file name will include `-internal.` and a commit hash, e.g., `costa-code-0.0.1-internal.1+a88d628.vsix`).
3. Download the `.vsix` file to your machine.
4. In VS Code, open the Extensions view:
   - Windows/Linux: Ctrl+Shift+X
   - macOS: Cmd+Shift+X
5. Click the ellipsis (...) in the top-right corner of the Extensions view and select **Install from VSIX...**.
6. Choose the downloaded `.vsix` file to install the internal version.

## License

[MIT](./LICENSE.md) License © 2025 [Jacob Foster Heimark](https://github.com/hmk) and [Costa Security](https://costa.app)

## Troubleshooting

- If you see "Costa CLI not found", reinstall the extension or install `costa` on your PATH and restart VS Code
- Status bar values show `-` until you're logged in and data is available
