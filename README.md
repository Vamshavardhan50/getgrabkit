# GrabKit

**Dependency-aware GitHub file extraction from an interactive terminal UI.**

GrabKit helps you explore a repository tree, preview files, select exactly what you need, and download only the minimal working set.

## Overview

Modern repositories are large. Cloning an entire repo when you only need a few files is slow and noisy.

GrabKit solves this by providing an interactive TUI workflow for selective extraction with optional dependency awareness.

Key benefits:

- Faster than full-clone workflows for targeted use cases
- Minimal and deterministic file extraction
- Built-in visibility (tree explorer + preview + dependency insight)
- Developer-friendly CLI controls and restore workflow

## Documentation Website

- Live docs URL: https://getgrabkit.vercel.app/
- Source files: `docs/`
- Deployment workflow: `.github/workflows/deploy-docs.yml`

GitHub setup (one-time):

1. Open repository Settings -> Pages.
2. Set Build and deployment Source to GitHub Actions.
3. Push to `main` to trigger docs deployment.

Local preview:

```bash
python -m http.server 4173 --directory docs
```

Then open: http://localhost:4173

## Features

- Interactive full-screen TUI file explorer
- Live file preview panel
- Multi-file and folder subtree selection
- Smart Grab (dependency-aware download)
- Dependency insight view before downloading
- Real-time filter/search inside repository
- Download modes:
  - Flat
  - Preserve structure
  - Zip archive
- Project snapshot and restore (`grabkit.config.json`)

## Installation

```bash
npm install -g getgrabkit
```

Note:

- Official package for this project: `getgrabkit`
- CLI commands supported: `grabkit` and `getgrabkit`

## Usage

```bash
grabkit
```

or

```bash
getgrabkit
```

Typical flow:

1. Enter a GitHub repository URL.
2. Navigate the tree with arrow keys.
3. Select files/folders with Space.
4. Download selected files with Enter, or use Smart Grab with `s`.

Help:

```bash
grabkit --help
```

or

```bash
getgrabkit --help
```

## CLI Controls

| Key       | Action                                 |
| --------- | -------------------------------------- |
| ↑ ↓ ← →   | Navigate tree                          |
| Space     | Select/unselect file or folder subtree |
| Enter     | Open folder or download selected files |
| Backspace | Go to parent folder                    |
| s         | Smart Grab (dependency-aware)          |
| d         | Dependency insight view                |
| /         | Filter/search mode                     |
| m         | Choose download mode                   |
| p         | Toggle preview panel                   |
| a         | Select all                             |
| x         | Deselect all                           |
| i         | Invert selection                       |
| t         | Toggle theme                           |
| q         | Quit                                   |

## Examples

### Example 1: Selective download from a large repo

1. Run `grabkit` (or `getgrabkit`)
2. Enter: `https://github.com/owner/repo`
3. Navigate to `src/utils`
4. Select `format.js` and `validate.js`
5. Press Enter to download

### Example 2: Dependency-aware extraction (Smart Grab)

1. Highlight/select `src/server/index.js`
2. Press `s`
3. Review dependency count in confirmation
4. Continue to download a minimal working set

### Example 3: Restore previous snapshot

```bash
grabkit restore
```

or

```bash
grabkit restore ./backup/grabkit.config.json
```

Equivalent alias commands:

```bash
getgrabkit restore
getgrabkit restore ./backup/grabkit.config.json
```

## Smart Grab

Smart Grab parses selected JavaScript files and recursively resolves **local** dependencies.

What it detects:

- `import ... from '...'`
- `require('...')`
- dynamic `import('...')`

Current language support:

- JavaScript family (`.js`, `.mjs`, `.cjs`, `.jsx`)

Limitations:

- External packages (`react`, `express`, etc.) are intentionally ignored
- Non-local imports are not pulled
- Missing or circular references are reported, then handled safely

## Configuration

User-level configuration location:

```text
~/.grabkit/config.json
```

Example structure:

```json
{
  "savedRepos": [
    "https://github.com/owner/repo",
    "https://github.com/org/project"
  ],
  "preferences": {
    "downloadMode": "preserve",
    "theme": "classic",
    "previewEnabled": true
  },
  "githubToken": "optional_token_value"
}
```

Field notes:

- `savedRepos`: quick-access repository history
- `preferences`: UI/download defaults
- `githubToken`: optional; environment variables are preferred for security

## GitHub API Strategy

GrabKit minimizes API usage to reduce rate-limit pressure.

- Uses one tree API call for repository structure:

```text
GET /repos/:owner/:repo/git/trees/:branch?recursive=1
```

- Uses `raw.githubusercontent.com` for file content downloads:

```text
https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
```

- Avoids `/contents` API usage for file payloads

## Troubleshooting

### `grabkit` or `getgrabkit` is not recognized

1. Verify installation:

```bash
npm ls -g --depth=0 getgrabkit
```

2. Check npm prefix:

```bash
npm config get prefix
```

3. Ensure npm global bin is in PATH.

Windows common PATH entry:

```text
C:\Users\<your-user>\AppData\Roaming\npm
```

4. Restart terminal.

### Permission issues (global install)

- On Windows, run terminal as Administrator if needed.
- If stale shim conflicts appear, uninstall and reinstall globally.

### Rate limit issues

Set token temporarily:

```powershell
$env:GITHUB_TOKEN="your_token_here"
```

Persist token:

```powershell
setx GITHUB_TOKEN "your_token_here"
```

### Invalid repository URL

- Ensure URL format is `https://github.com/<owner>/<repo>`
- For branch-specific URLs, use `.../tree/<branch>`

## Development

Project structure:

```text
/bin
/cli
/ui
/services/github
/services/parser
/services/downloader
/utils
```

Run locally:

```bash
npm install
npm start
```

Link local build globally for testing:

```bash
npm link
grabkit --help
getgrabkit --help
```

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes with tests/validation.
4. Open a Pull Request with a clear description.

Recommended PR content:

- What changed
- Why it changed
- How to verify
- Screenshots or terminal output (if relevant)

## Skills and Technologies

- **Node.js (CLI development):** runtime and module ecosystem for shipping portable command-line tools.
- **Terminal UI (blessed):** full-screen interactive interface with panels, lists, and keyboard-driven navigation.
- **GitHub API integration:** repository tree retrieval with minimal API surface.
- **File system handling:** deterministic writing, snapshot persistence, and mode-based output layouts.
- **Dependency parsing (AST/regex):** local import/require extraction for Smart Grab and dependency insight.
- **CLI UX design:** keybinding ergonomics, status messaging, error recovery, and flow clarity.
- **Package publishing (npm):** global-installable distribution with executable bin mapping.
- **Cross-platform CLI development:** Windows/macOS/Linux command behavior and path handling considerations.

## License

MIT
