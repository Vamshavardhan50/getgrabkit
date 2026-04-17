# GrabKit

GrabKit is a deterministic, full-screen terminal UI for browsing GitHub repositories,
selecting files, analyzing local JavaScript dependencies, and downloading minimal working sets.

## Features

- Full-screen TUI with tree explorer + live preview
- GitHub repository tree loading via a single tree API call
- Multi-file and recursive folder selection
- Smart Grab for local JavaScript dependency closure
- Dependency insight modal tree
- Live filter mode for large repository navigation
- Download modes: flat, preserve structure, zip archive
- Snapshot save/restore via `grabkit.config.json`
- Raw GitHub CDN file fetches (no `/contents` API usage)

## Install

```bash
npm install
```

## Run

```bash
npm start
```

or

```bash
npx grabkit
```

## Avoid GitHub Rate Limits

GrabKit supports two ways to reduce rate-limit issues:

- It uses one GitHub API call for repository tree data.
- It fetches file content from raw CDN endpoints:

```text
https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
```

- The recommended setup is still a GitHub token (`GITHUB_TOKEN` or `GH_TOKEN`).

PowerShell (current terminal session):

```powershell
$env:GITHUB_TOKEN="<your_token_here>"
```

PowerShell (persist for future terminals):

```powershell
setx GITHUB_TOKEN "<your_token_here>"
```

Then open a new terminal and run GrabKit again.

For public repositories, no scope is typically required. For private repositories, use a token with repository access.

Using a `.env` file (recommended for local development):

1. Create a local env file from the template:

```bash
copy .env.example .env
```

2. Open `.env` and set:

```dotenv
GITHUB_TOKEN=your_github_token_here
```

3. Start GrabKit normally:

```bash
npm start
```

GrabKit now auto-loads `.env` at startup.

If your repository URL does not include `/tree/<branch>`, GrabKit uses `HEAD` by default in single-call mode.
You can override this with:

```bash
GRABKIT_DEFAULT_BRANCH=main
```

## Restore from Snapshot

```bash
grabkit restore
```

or with custom path:

```bash
grabkit restore ./path/to/grabkit.config.json
```

## Keybindings

- `↑ ↓ ← →`: navigate and expand/collapse tree
- `Enter`: open folder (if no selected files) or download selected files
- `Backspace`: jump to parent folder
- `Space`: select/unselect file or folder subtree
- `q`: quit

Advanced:

- `s`: Smart Grab (dependency-aware)
- `d`: dependency insight modal
- `p`: toggle preview panel
- `/`: filter/search mode
- `a`: select all
- `x`: deselect all
- `i`: invert selection
- `m`: choose download mode
- `t`: choose theme (classic, minimal, vivid)
- `PageUp` / `PageDown`: scroll preview or modal content

## Architecture

```text
/bin
/cli
/ui
/services/github
/services/parser
/services/downloader
/utils
```

## Notes

- External dependencies (`react`, `express`, npm packages) are intentionally ignored by Smart Grab.
- Local dependency parsing currently targets JavaScript-family files (`.js`, `.mjs`, `.cjs`, `.jsx`).
- Rate limit and missing-file errors are surfaced directly in the UI status bar.
- Downloads are written under the current working directory.
