"use strict";

const blessed = require("blessed");
const { GitHubService } = require("../services/github/githubService");
const {
  buildSmartDependencySet,
  buildDependencyTreeText,
} = require("../services/parser/dependencyParser");
const {
  downloadFiles,
  saveProjectSnapshot,
} = require("../services/downloader/downloaderService");
const {
  DOWNLOAD_MODES,
  DOWNLOAD_MODE_LABELS,
  SPINNER_FRAMES,
  STATUS_LEVELS,
  MAX_PREVIEW_BYTES,
  MAX_TREE_LINES,
  MAX_DEPENDENCY_TREE_LINES,
} = require("../utils/constants");
const {
  flattenVisibleTree,
  collectFilePaths,
  getAllFilePaths,
  computeFolderSelectionState,
} = require("../utils/treeUtils");
const { parseGitHubRepoUrl } = require("../utils/pathUtils");
const packageJson = require("../package.json");
const { HeaderBar } = require("./header");

const DEFAULT_THEME_KEY = "vivid";

const THEME_LABELS = {
  classic: "Classic",
  minimal: "Minimal monochrome",
  vivid: "Legacy vivid",
};

const THEMES = {
  classic: {
    fg: "white",
    bg: "black",
    border: "white",
    selectedFg: "black",
    selectedBg: "white",
    accentTag: "blue-fg",
    folderTag: "blue-fg",
    mutedTag: "white-fg",
    partialTag: "blue-fg",
    treeGuideTag: "white-fg",
    scrollbar: "white",
    statusFg: "black",
    statusBg: "white",
    statusInfoTag: "black-fg",
    statusSuccessTag: "green-fg",
    statusWarningTag: "yellow-fg",
    statusErrorTag: "red-fg",
  },
  minimal: {
    fg: "white",
    bg: "black",
    border: "grey",
    selectedFg: "black",
    selectedBg: "white",
    accentTag: "white-fg",
    folderTag: "white-fg",
    mutedTag: "grey-fg",
    partialTag: "white-fg",
    treeGuideTag: "grey-fg",
    scrollbar: "grey",
    statusFg: "white",
    statusBg: "black",
    statusInfoTag: "white-fg",
    statusSuccessTag: "white-fg",
    statusWarningTag: "white-fg",
    statusErrorTag: "white-fg",
  },
  vivid: {
    fg: "white",
    bg: "black",
    border: "cyan",
    selectedFg: "cyan",
    selectedBg: "black",
    accentTag: "cyan-fg",
    folderTag: "magenta-fg",
    mutedTag: "yellow-fg",
    partialTag: "yellow-fg",
    treeGuideTag: "blue-fg",
    scrollbar: "cyan",
    statusFg: "black",
    statusBg: "cyan",
    statusInfoTag: "black-fg",
    statusSuccessTag: "green-fg",
    statusWarningTag: "yellow-fg",
    statusErrorTag: "red-fg",
  },
};

function escapeTags(value) {
  return String(value || "")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function isPrintableCharacter(ch) {
  return typeof ch === "string" && ch.length === 1 && ch >= " ";
}

class GrabKitApp {
  constructor(options = {}) {
    this.githubService = options.githubService || new GitHubService();

    this.screen = null;
    this.header = null;
    this.inputBar = null;
    this.treePanel = null;
    this.treeList = null;
    this.previewPanel = null;
    this.previewBox = null;
    this.statusBar = null;

    this.repoContext = null;
    this.visibleRows = [];
    this.currentIndex = 0;
    this.selectedFiles = new Set();
    this.folderSelectionState = new Map();
    this.lastDependencyFiles = new Set();
    this.previewCache = new Map();

    this.previewEnabled = true;
    this.downloadMode = DOWNLOAD_MODES.PRESERVE;
    this.filterQuery = "";
    this.themeKey = DEFAULT_THEME_KEY;
    this.theme = THEMES[this.themeKey];

    this.inputMode = "repo";
    this.inputBuffer = "";
    this.modalActive = false;

    this.spinnerTimer = null;
    this.spinnerFrameIndex = 0;
    this.spinnerBaseText = "";

    this.previewRequestToken = 0;
    this.statusText = "Enter GitHub repository URL.";
    this.statusLevel = STATUS_LEVELS.INFO;

    this.resolveExit = null;
    this.rejectExit = null;
  }

  start() {
    this.buildLayout();
    this.bindEvents();
    this.enterRepoInputMode();
    this.render();

    return new Promise((resolve, reject) => {
      this.resolveExit = resolve;
      this.rejectExit = reject;
    });
  }

  buildLayout() {
    const theme = this.theme;

    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      title: "GetGrabKit",
    });

    this.header = new HeaderBar({
      parent: this.screen,
      title: "GetGrabKit",
      tagline: "Grab only what you need from GitHub",
      version: `v${packageJson.version || "1.0.0"}`,
      status: "Ready",
      statusType: "ready",
    });

    const headerHeight = this.header.getHeight();
    const panelTop = headerHeight + 3;

    this.inputBar = blessed.box({
      parent: this.screen,
      top: headerHeight,
      left: 0,
      width: "100%",
      height: 3,
      border: "line",
      label: " Input ",
      tags: true,
      style: {
        fg: theme.fg,
        bg: theme.bg,
        border: {
          fg: theme.border,
        },
      },
    });

    this.treePanel = blessed.box({
      parent: this.screen,
      top: panelTop,
      bottom: 1,
      left: 0,
      width: "45%",
      border: "line",
      label: " Tree Explorer ",
      style: {
        fg: theme.fg,
        bg: theme.bg,
        border: {
          fg: theme.border,
        },
      },
    });

    this.treeList = blessed.list({
      parent: this.treePanel,
      top: 0,
      left: 0,
      width: "100%-2",
      height: "100%-2",
      tags: true,
      keys: false,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: theme.fg,
        bg: theme.bg,
        selected: {
          fg: theme.selectedFg,
          bg: theme.selectedBg,
          bold: true,
        },
        item: {
          fg: theme.fg,
          bg: theme.bg,
        },
      },
      scrollbar: {
        ch: " ",
        track: {
          bg: theme.bg,
        },
        style: {
          bg: theme.scrollbar,
        },
      },
    });

    this.previewPanel = blessed.box({
      parent: this.screen,
      top: panelTop,
      bottom: 1,
      left: "45%",
      width: "55%",
      border: "line",
      label: " Live Preview ",
      style: {
        fg: theme.fg,
        bg: theme.bg,
        border: {
          fg: theme.border,
        },
      },
    });

    this.previewBox = blessed.box({
      parent: this.previewPanel,
      top: 0,
      left: 0,
      width: "100%-2",
      height: "100%-2",
      tags: false,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      style: {
        fg: theme.fg,
        bg: theme.bg,
      },
      scrollbar: {
        ch: " ",
        track: {
          bg: theme.bg,
        },
        style: {
          bg: theme.scrollbar,
        },
      },
    });

    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      style: {
        fg: theme.statusFg,
        bg: theme.statusBg,
      },
    });

    this.treeList.setItems([
      `{${theme.mutedTag}}Enter a GitHub repository URL above to load repository data.{/}`,
    ]);
    this.previewBox.setContent(this.getStartupGuideText());

    this.syncHeaderStatus();
  }

  bindEvents() {
    this.screen.on("keypress", (ch, key) => {
      this.handleKeypress(ch, key).catch((error) => {
        this.setStatus(
          error.message || "Unexpected input handler failure.",
          STATUS_LEVELS.ERROR,
        );
      });
    });

    this.treeList.on("select", (_item, selectedIndex) => {
      if (typeof selectedIndex === "number") {
        this.currentIndex = selectedIndex;
        this.loadPreviewForCurrentNode().catch(() => {
          this.previewBox.setContent("Preview unavailable.");
          this.render();
        });
      }
    });
  }

  async handleKeypress(ch, key = {}) {
    if (key.ctrl && key.name === "c") {
      this.quit();
      return;
    }

    if (this.modalActive) {
      return;
    }

    if (this.inputMode) {
      await this.handleInputKeypress(ch, key);
      return;
    }

    const lowered = typeof ch === "string" ? ch.toLowerCase() : "";

    if (lowered === "q") {
      this.quit();
      return;
    }

    if (key.name === "up") {
      this.moveSelection(-1);
      return;
    }

    if (key.name === "down") {
      this.moveSelection(1);
      return;
    }

    if (key.name === "left") {
      this.collapseCurrentNode();
      return;
    }

    if (key.name === "right") {
      this.expandCurrentNode();
      return;
    }

    if (key.name === "backspace") {
      this.moveSelectionToParent();
      return;
    }

    if (key.name === "space") {
      this.toggleCurrentSelection();
      return;
    }

    if (key.name === "enter") {
      await this.handleEnterAction();
      return;
    }

    if (key.name === "pageup") {
      this.scrollPreview(-12);
      return;
    }

    if (key.name === "pagedown") {
      this.scrollPreview(12);
      return;
    }

    if (ch === "/" || key.name === "slash") {
      this.enterFilterMode();
      return;
    }

    if (lowered === "p") {
      this.togglePreview();
      return;
    }

    if (lowered === "a") {
      this.selectAllFiles();
      return;
    }

    if (lowered === "x") {
      this.deselectAllFiles();
      return;
    }

    if (lowered === "i") {
      this.invertSelection();
      return;
    }

    if (lowered === "m") {
      await this.chooseDownloadMode();
      return;
    }

    if (lowered === "t") {
      await this.chooseTheme();
      return;
    }

    if (lowered === "s") {
      await this.handleSmartGrab();
      return;
    }

    if (lowered === "d") {
      await this.showDependencyInsight();
    }
  }

  async handleInputKeypress(ch, key) {
    if (key.name === "escape") {
      if (this.inputMode === "filter") {
        this.exitInputMode();
        this.setStatus(
          this.filterQuery
            ? `Filter active: ${this.filterQuery}`
            : "Filter cleared.",
          STATUS_LEVELS.INFO,
        );
        this.refreshTree(false);
      }
      return;
    }

    if (key.name === "enter") {
      const value = this.inputBuffer.trim();

      if (this.inputMode === "repo") {
        if (!value) {
          this.setStatus(
            "Repository URL cannot be empty.",
            STATUS_LEVELS.WARNING,
          );
          return;
        }
        await this.loadRepository(value);
        return;
      }

      if (this.inputMode === "filter") {
        this.filterQuery = this.inputBuffer.trim();
        this.exitInputMode();
        this.refreshTree(true);
        this.setStatus(
          this.filterQuery
            ? `Filter active: ${this.filterQuery}`
            : "Filter cleared.",
          STATUS_LEVELS.INFO,
        );
      }
      return;
    }

    if (key.name === "backspace") {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
      if (this.inputMode === "filter") {
        this.filterQuery = this.inputBuffer;
        this.refreshTree(false);
      }
      this.updateInputBar();
      this.render();
      return;
    }

    if (key.name === "delete") {
      this.inputBuffer = "";
      if (this.inputMode === "filter") {
        this.filterQuery = "";
        this.refreshTree(false);
      }
      this.updateInputBar();
      this.render();
      return;
    }

    if (isPrintableCharacter(ch)) {
      this.inputBuffer += ch;
      if (this.inputMode === "filter") {
        this.filterQuery = this.inputBuffer;
        this.refreshTree(false);
      }
      this.updateInputBar();
      this.render();
    }
  }

  enterRepoInputMode(initialValue = "") {
    this.inputMode = "repo";
    this.inputBuffer = initialValue;
    this.updateInputBar();
  }

  enterFilterMode() {
    if (!this.repoContext) {
      this.setStatus(
        "Load a repository before filtering.",
        STATUS_LEVELS.WARNING,
      );
      return;
    }

    this.inputMode = "filter";
    this.inputBuffer = this.filterQuery;
    this.updateInputBar();
    this.setStatus(
      "Filter mode: type to filter repository tree.",
      STATUS_LEVELS.INFO,
    );
    this.render();
  }

  exitInputMode() {
    this.inputMode = null;
    this.inputBuffer = "";
    this.updateInputBar();
  }

  updateInputBar() {
    if (!this.inputBar) {
      return;
    }

    if (this.inputMode === "repo") {
      this.inputBar.setLabel(" Input ");
      this.inputBar.setContent(
        `{bold}Enter GitHub Repository URL{/bold}: ${escapeTags(this.inputBuffer)}`,
      );
      return;
    }

    if (this.inputMode === "filter") {
      this.inputBar.setLabel(" Filter ");
      this.inputBar.setContent(
        `{bold}Filter{/bold}: ${escapeTags(this.inputBuffer)}`,
      );
      return;
    }

    if (!this.repoContext) {
      this.inputBar.setLabel(" GrabKit ");
      this.inputBar.setContent(
        `{${this.theme.mutedTag}}No repository loaded{/}`,
      );
      return;
    }

    const repoInfo = `${this.repoContext.owner}/${this.repoContext.repo}@${this.repoContext.branch}`;
    const filterInfo = this.filterQuery
      ? ` | {${this.theme.accentTag}}Filter: ${escapeTags(this.filterQuery)}{/}`
      : "";
    this.inputBar.setLabel(" GrabKit ");
    this.inputBar.setContent(
      `{${this.theme.accentTag}}${escapeTags(repoInfo)}{/}${filterInfo}`,
    );
  }

  getStartupGuideText() {
    return [
      "Welcome to GetGrabKit",
      "",
      "Start:",
      "1. Paste a GitHub repository URL in the Input bar.",
      "2. Press Enter to load repository tree.",
      "",
      "TUI Commands:",
      "↑↓ move  ← collapse  → expand",
      "Space select/unselect  Enter open/download",
      "s smart grab  d dependency insight",
      "/ filter  m mode  p preview  t theme",
      "a select all  x deselect all  i invert",
      "q quit",
      "",
      "CLI Commands:",
      "grabkit --help",
      "getgrabkit --help",
      "grabkit restore ./grabkit.config.json",
      "getgrabkit restore ./grabkit.config.json",
    ].join("\n");
  }

  setStatus(message, level = STATUS_LEVELS.INFO) {
    this.statusText = message;
    this.statusLevel = level;
    this.syncHeaderStatus();
    this.updateStatusBar();
    this.render();
  }

  syncHeaderStatus({ loading = false } = {}) {
    if (!this.header) {
      return;
    }

    if (loading) {
      this.header.setStatus("Loading", "loading");
      return;
    }

    if (this.statusLevel === STATUS_LEVELS.WARNING) {
      this.header.setStatus("Attention", "warning");
      return;
    }

    if (this.statusLevel === STATUS_LEVELS.ERROR) {
      this.header.setStatus("Error", "error");
      return;
    }

    this.header.setStatus("Ready", "ready");
  }

  updateStatusBar() {
    if (!this.statusBar) {
      return;
    }

    const levelColorTag =
      {
        [STATUS_LEVELS.INFO]: this.theme.statusInfoTag,
        [STATUS_LEVELS.SUCCESS]: this.theme.statusSuccessTag,
        [STATUS_LEVELS.WARNING]: this.theme.statusWarningTag,
        [STATUS_LEVELS.ERROR]: this.theme.statusErrorTag,
      }[this.statusLevel] || this.theme.statusInfoTag;

    const modeLabel = this.inputMode
      ? this.inputMode === "repo"
        ? "Repo Input"
        : "Filter Input"
      : "Browse";

    const selectedCount = this.selectedFiles.size;
    const dependencyCount = this.lastDependencyFiles.size;
    const stateSummary = `✔ ${selectedCount} files selected | ${dependencyCount} dependencies | ${modeLabel}`;
    const hintSummary =
      "↑↓←→ nav  Enter download  Space select  s smart  d deps  / filter  p preview  m mode  t theme  q quit";

    this.statusBar.setContent(
      `{${levelColorTag}}${escapeTags(this.statusText)}{/} | ${stateSummary} | ${DOWNLOAD_MODE_LABELS[this.downloadMode]} | ${hintSummary}`,
    );
  }

  startSpinner(baseText) {
    this.stopSpinner();
    this.syncHeaderStatus({ loading: true });

    this.spinnerBaseText = baseText;
    this.spinnerFrameIndex = 0;
    this.spinnerTimer = setInterval(() => {
      const frame =
        SPINNER_FRAMES[this.spinnerFrameIndex % SPINNER_FRAMES.length];
      this.spinnerFrameIndex += 1;
      this.statusText = `${frame} ${this.spinnerBaseText}`;
      this.statusLevel = STATUS_LEVELS.INFO;
      this.updateStatusBar();
      this.render();
    }, 90);
  }

  stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  async loadRepository(repoUrl) {
    parseGitHubRepoUrl(repoUrl);
    this.startSpinner("Fetching repository...");

    try {
      const context = await this.githubService.fetchRepositoryTree(repoUrl);
      for (const node of context.nodeByPath.values()) {
        if (node.type === "dir" && node.path) {
          node.expanded = false;
        }
      }
      context.root.expanded = true;

      this.repoContext = context;
      this.selectedFiles.clear();
      this.lastDependencyFiles.clear();
      this.previewCache.clear();
      this.filterQuery = "";
      this.currentIndex = 0;

      if (context.subPath) {
        this.expandPath(context.subPath);
      }

      this.exitInputMode();
      this.refreshTree(true);

      const fileCount = Array.from(context.nodeByPath.values()).filter(
        (node) => node.type === "file",
      ).length;

      if (context.truncated) {
        this.setStatus(
          `Repository loaded with ${fileCount} files (GitHub tree was truncated).`,
          STATUS_LEVELS.WARNING,
        );
      } else {
        this.setStatus(
          `Repository loaded: ${context.owner}/${context.repo} (${fileCount} files).`,
          STATUS_LEVELS.SUCCESS,
        );
      }
    } catch (error) {
      this.enterRepoInputMode(repoUrl);
      this.setStatus(
        `Failed to load repository: ${error.message}`,
        STATUS_LEVELS.ERROR,
      );
    } finally {
      this.stopSpinner();
    }
  }

  expandPath(targetPath) {
    if (!this.repoContext || !targetPath) {
      return;
    }

    const segments = String(targetPath).split("/").filter(Boolean);

    let cursor = this.repoContext.root;
    let accumulated = "";

    for (const segment of segments) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      const nextNode = this.repoContext.nodeByPath.get(accumulated);
      if (!nextNode) {
        break;
      }

      if (cursor.type === "dir") {
        cursor.expanded = true;
      }

      if (nextNode.type === "dir") {
        nextNode.expanded = true;
      }

      cursor = nextNode;
    }
  }

  refreshTree(loadPreview = true) {
    if (!this.treeList) {
      return;
    }

    if (!this.repoContext) {
      this.visibleRows = [];
      this.treeList.setItems([
        `{${this.theme.mutedTag}}Enter a GitHub repository URL above to load repository data.{/}`,
      ]);
      this.previewBox.setContent(this.getStartupGuideText());
      this.previewBox.setScroll(0);
      this.currentIndex = 0;
      this.updateInputBar();
      this.updateStatusBar();
      this.render();
      return;
    }

    const previousPath = this.getCurrentNode()
      ? this.getCurrentNode().path
      : null;
    this.folderSelectionState = computeFolderSelectionState(
      this.repoContext.root,
      this.selectedFiles,
    );

    this.visibleRows = flattenVisibleTree(
      this.repoContext.root,
      this.filterQuery,
      MAX_TREE_LINES,
    );

    const rowMetadata = this.buildTreeRowMetadata(this.visibleRows);
    const rowLines = this.visibleRows.map(({ node, depth }, index) =>
      this.formatTreeRow(node, depth, rowMetadata[index]),
    );

    if (rowLines.length === 0) {
      this.treeList.setItems([`{${this.theme.mutedTag}}No matching files{/}`]);
      this.currentIndex = 0;
      this.previewBox.setContent("No files to preview.");
      this.updateInputBar();
      this.updateStatusBar();
      this.render();
      return;
    }

    this.treeList.setItems(rowLines);

    let nextIndex = this.currentIndex;
    if (previousPath) {
      const foundIndex = this.visibleRows.findIndex(
        (row) => row.node.path === previousPath,
      );
      if (foundIndex >= 0) {
        nextIndex = foundIndex;
      }
    }

    nextIndex = Math.max(0, Math.min(nextIndex, this.visibleRows.length - 1));
    this.currentIndex = nextIndex;
    this.treeList.select(this.currentIndex);

    if (loadPreview) {
      this.loadPreviewForCurrentNode().catch(() => {
        this.previewBox.setContent("Preview unavailable.");
      });
    }

    if (this.visibleRows.length >= MAX_TREE_LINES) {
      this.statusText =
        "Large repository detected. Tree rendering is capped for smooth performance.";
      this.statusLevel = STATUS_LEVELS.WARNING;
    }

    this.updateInputBar();
    this.updateStatusBar();
    this.render();
  }

  buildTreeRowMetadata(rows) {
    const metadata = new Array(rows.length);
    const depthHasNextSibling = [];

    for (let index = 0; index < rows.length; index += 1) {
      const currentDepth = rows[index].depth;
      const nextDepth = index + 1 < rows.length ? rows[index + 1].depth : -1;
      const isLast = nextDepth <= currentDepth;

      depthHasNextSibling.length = currentDepth;

      let prefix = "";
      if (currentDepth > 0) {
        const prefixParts = [];
        for (
          let depthIndex = 0;
          depthIndex < currentDepth - 1;
          depthIndex += 1
        ) {
          prefixParts.push(depthHasNextSibling[depthIndex] ? "│  " : "   ");
        }
        prefixParts.push(isLast ? "└─ " : "├─ ");
        prefix = prefixParts.join("");
      }

      metadata[index] = {
        prefix,
      };

      depthHasNextSibling[currentDepth] = !isLast;
    }

    return metadata;
  }

  formatTreeRow(node, _depth, metadata = {}) {
    const guideTag = this.theme.treeGuideTag || "blue-fg";
    const safePrefix = escapeTags(metadata.prefix || "");
    const guidePrefix = safePrefix ? `{${guideTag}}${safePrefix}{/}` : "";
    const safeName = escapeTags(node.name);

    if (node.type === "dir") {
      const folderState = this.folderSelectionState.get(node.path) || {
        all: false,
        partial: false,
      };

      const check = folderState.all
        ? "{green-fg}●{/}"
        : folderState.partial
          ? `{${this.theme.partialTag}}◐{/}`
          : "{gray-fg}○{/}";
      const caret = node.expanded ? "{cyan-fg}▾{/}" : "{cyan-fg}▸{/}";

      const folderLabel =
        this.themeKey === "minimal"
          ? `{${this.theme.folderTag}}${safeName}{/}`
          : `{white-fg}{magenta-bg} ${safeName} {/}`;

      return `${guidePrefix}${caret} ${check} {magenta-fg}◼{/} ${folderLabel}`;
    }

    const isSelected = this.selectedFiles.has(node.path);
    const check = isSelected ? "{green-fg}●{/}" : "{gray-fg}○{/}";
    const fileLabel =
      this.themeKey === "minimal" ? safeName : `{cyan-fg}${safeName}{/}`;

    return `${guidePrefix}  ${check} {blue-fg}•{/} ${fileLabel}`;
  }

  getCurrentNode() {
    if (this.currentIndex < 0 || this.currentIndex >= this.visibleRows.length) {
      return null;
    }

    return this.visibleRows[this.currentIndex].node;
  }

  moveSelection(delta) {
    if (this.visibleRows.length === 0) {
      return;
    }

    this.currentIndex = Math.max(
      0,
      Math.min(this.currentIndex + delta, this.visibleRows.length - 1),
    );
    this.treeList.select(this.currentIndex);
    this.loadPreviewForCurrentNode().catch(() => {
      this.previewBox.setContent("Preview unavailable.");
      this.render();
    });
    this.render();
  }

  selectNodeByPath(nodePath) {
    if (!nodePath) {
      return false;
    }

    const index = this.visibleRows.findIndex(
      (row) => row.node.path === nodePath,
    );
    if (index < 0) {
      return false;
    }

    this.currentIndex = index;
    this.treeList.select(index);
    return true;
  }

  expandCurrentNode() {
    const currentNode = this.getCurrentNode();
    if (!currentNode) {
      return;
    }

    if (currentNode.type === "dir") {
      if (!currentNode.expanded) {
        currentNode.expanded = true;
        this.refreshTree(true);
        return;
      }

      const nextIndex = this.currentIndex + 1;
      if (nextIndex < this.visibleRows.length) {
        this.moveSelection(1);
      }
    }
  }

  collapseCurrentNode() {
    const currentNode = this.getCurrentNode();
    if (!currentNode) {
      return;
    }

    if (currentNode.type === "dir" && currentNode.expanded) {
      currentNode.expanded = false;
      this.refreshTree(true);
      return;
    }

    if (currentNode.parent && currentNode.parent.path !== "") {
      this.selectNodeByPath(currentNode.parent.path);
      this.loadPreviewForCurrentNode().catch(() => {
        this.previewBox.setContent("Preview unavailable.");
      });
      this.render();
    }
  }

  moveSelectionToParent() {
    const currentNode = this.getCurrentNode();
    if (!currentNode || !currentNode.parent || currentNode.parent.path === "") {
      return;
    }

    this.selectNodeByPath(currentNode.parent.path);
    this.loadPreviewForCurrentNode().catch(() => {
      this.previewBox.setContent("Preview unavailable.");
    });
    this.render();
  }

  toggleCurrentSelection() {
    if (!this.repoContext) {
      return;
    }

    const currentNode = this.getCurrentNode();
    if (!currentNode) {
      return;
    }

    if (currentNode.type === "file") {
      if (this.selectedFiles.has(currentNode.path)) {
        this.selectedFiles.delete(currentNode.path);
      } else {
        this.selectedFiles.add(currentNode.path);
      }
    } else {
      // Auto-expand so users can immediately see what was selected.
      if (!currentNode.expanded) {
        currentNode.expanded = true;
      }

      const childrenFiles = collectFilePaths(currentNode, []);
      const allSelected =
        childrenFiles.length > 0 &&
        childrenFiles.every((filePath) => this.selectedFiles.has(filePath));

      for (const filePath of childrenFiles) {
        if (allSelected) {
          this.selectedFiles.delete(filePath);
        } else {
          this.selectedFiles.add(filePath);
        }
      }
    }

    this.refreshTree(false);
    this.setStatus(
      `${this.selectedFiles.size} files currently selected.`,
      STATUS_LEVELS.INFO,
    );
  }

  selectAllFiles() {
    if (!this.repoContext) {
      return;
    }

    const allFiles = getAllFilePaths(this.repoContext.root);
    this.selectedFiles = new Set(allFiles);
    this.refreshTree(false);
    this.setStatus(
      `Selected all ${allFiles.length} files.`,
      STATUS_LEVELS.SUCCESS,
    );
  }

  deselectAllFiles() {
    this.selectedFiles.clear();
    this.refreshTree(false);
    this.setStatus("Selection cleared.", STATUS_LEVELS.INFO);
  }

  invertSelection() {
    if (!this.repoContext) {
      return;
    }

    const allFiles = getAllFilePaths(this.repoContext.root);
    const nextSelection = new Set();
    for (const filePath of allFiles) {
      if (!this.selectedFiles.has(filePath)) {
        nextSelection.add(filePath);
      }
    }

    this.selectedFiles = nextSelection;
    this.refreshTree(false);
    this.setStatus(
      `Selection inverted. ${this.selectedFiles.size} files selected.`,
      STATUS_LEVELS.INFO,
    );
  }

  async loadPreviewForCurrentNode() {
    if (!this.previewEnabled || !this.repoContext) {
      return;
    }

    const currentNode = this.getCurrentNode();
    if (!currentNode) {
      this.previewBox.setContent("No item selected.");
      this.render();
      return;
    }

    if (currentNode.type === "dir") {
      const directFolderCount = currentNode.children.filter(
        (child) => child.type === "dir",
      ).length;
      const directFileCount = currentNode.children.filter(
        (child) => child.type === "file",
      ).length;
      const recursiveFileCount = collectFilePaths(currentNode, []).length;

      this.previewBox.setContent(
        [
          `Folder: ${currentNode.path || this.repoContext.repo}`,
          "",
          `Direct children: ${currentNode.children.length}`,
          `Direct folders: ${directFolderCount}`,
          `Direct files: ${directFileCount}`,
          `Recursive files: ${recursiveFileCount}`,
          "",
          "Use Space to select this folder recursively.",
        ].join("\n"),
      );
      this.previewBox.setScroll(0);
      this.render();
      return;
    }

    if (this.previewCache.has(currentNode.path)) {
      this.previewBox.setContent(this.previewCache.get(currentNode.path));
      this.previewBox.setScroll(0);
      this.render();
      return;
    }

    const token = ++this.previewRequestToken;
    this.previewBox.setContent("Loading file preview...");
    this.render();

    try {
      let content = await this.githubService.getFileContentFromContext(
        this.repoContext,
        currentNode.path,
      );

      if (token !== this.previewRequestToken) {
        return;
      }

      if (Buffer.byteLength(content, "utf8") > MAX_PREVIEW_BYTES) {
        content = `${content.slice(0, MAX_PREVIEW_BYTES)}\n\n... preview truncated ...`;
      }

      const rendered = content;

      this.previewCache.set(currentNode.path, rendered);
      this.previewBox.setContent(rendered);
      this.previewBox.setScroll(0);
      this.render();
    } catch (error) {
      if (token !== this.previewRequestToken) {
        return;
      }
      this.previewBox.setContent(`Preview error: ${error.message}`);
      this.render();
    }
  }

  togglePreview() {
    this.previewEnabled = !this.previewEnabled;

    if (this.previewEnabled) {
      this.previewPanel.show();
      this.treePanel.width = "45%";
      this.previewPanel.left = "45%";
      this.previewPanel.width = "55%";
      this.loadPreviewForCurrentNode().catch(() => {
        this.previewBox.setContent("Preview unavailable.");
      });
      this.setStatus("Preview panel enabled.", STATUS_LEVELS.SUCCESS);
    } else {
      this.previewPanel.hide();
      this.treePanel.width = "100%";
      this.setStatus("Preview panel disabled.", STATUS_LEVELS.INFO);
    }

    this.refreshTree(false);
  }

  scrollPreview(amount) {
    if (!this.previewEnabled) {
      return;
    }

    this.previewBox.scroll(amount);
    this.render();
  }

  getDefaultSelection() {
    if (this.selectedFiles.size > 0) {
      return Array.from(this.selectedFiles).sort((a, b) => a.localeCompare(b));
    }

    const currentNode = this.getCurrentNode();
    if (currentNode && currentNode.type === "file") {
      return [currentNode.path];
    }

    return [];
  }

  async handleEnterAction() {
    const currentNode = this.getCurrentNode();

    if (currentNode && currentNode.type === "dir") {
      currentNode.expanded = !currentNode.expanded;
      this.refreshTree(true);
      return;
    }

    const selection = this.getDefaultSelection();
    if (selection.length === 0) {
      this.setStatus(
        "No files selected. Use Space to select files, or highlight a file and press Enter.",
        STATUS_LEVELS.WARNING,
      );
      return;
    }

    await this.performDownload({
      selectedFiles: selection,
      dependencies: [],
      finalFiles: selection,
      triggerLabel: "manual",
    });
  }

  async analyzeDependencies(seedFiles) {
    if (!this.repoContext) {
      throw new Error("Repository is not loaded.");
    }

    const allFiles = getAllFilePaths(this.repoContext.root);
    return buildSmartDependencySet({
      selectedFiles: seedFiles,
      allFiles,
      getFileContent: async (filePath) =>
        this.githubService.getFileContentFromContext(
          this.repoContext,
          filePath,
        ),
    });
  }

  async handleSmartGrab() {
    if (!this.repoContext) {
      this.setStatus(
        "Load a repository before using Smart Grab.",
        STATUS_LEVELS.WARNING,
      );
      return;
    }

    const seedFiles = this.getDefaultSelection();
    if (seedFiles.length === 0) {
      this.setStatus(
        "Select at least one file for Smart Grab.",
        STATUS_LEVELS.WARNING,
      );
      return;
    }

    this.startSpinner("Analyzing local dependencies...");

    let analysis;
    try {
      analysis = await this.analyzeDependencies(seedFiles);
    } finally {
      this.stopSpinner();
    }

    this.lastDependencyFiles = new Set(analysis.dependencyFiles);
    this.refreshTree(false);

    const proceed = await this.promptYesNo(
      `Found ${analysis.dependencyFiles.length} dependencies. Continue? (y/n)`,
    );

    if (!proceed) {
      this.setStatus("Smart Grab cancelled.", STATUS_LEVELS.INFO);
      return;
    }

    await this.performDownload({
      selectedFiles: seedFiles,
      dependencies: analysis.dependencyFiles,
      finalFiles: analysis.finalFiles,
      triggerLabel: "smart",
    });

    if (analysis.missing.size > 0) {
      this.setStatus(
        `Download complete with ${analysis.missing.size} files containing unresolved local imports.`,
        STATUS_LEVELS.WARNING,
      );
    }
  }

  async showDependencyInsight() {
    if (!this.repoContext) {
      this.setStatus(
        "Load a repository before dependency insight.",
        STATUS_LEVELS.WARNING,
      );
      return;
    }

    const seedFiles = this.getDefaultSelection();
    if (seedFiles.length === 0) {
      this.setStatus(
        "Select or highlight at least one file first.",
        STATUS_LEVELS.WARNING,
      );
      return;
    }

    this.startSpinner("Building dependency insight...");
    let analysis;

    try {
      analysis = await this.analyzeDependencies(seedFiles);
    } finally {
      this.stopSpinner();
    }

    this.lastDependencyFiles = new Set(analysis.dependencyFiles);
    this.refreshTree(false);

    let insightText = buildDependencyTreeText(
      analysis.graph,
      seedFiles,
      MAX_DEPENDENCY_TREE_LINES,
    );

    if (!insightText.trim()) {
      insightText = "No local JavaScript dependencies detected.";
    }

    if (analysis.missing.size > 0) {
      const unresolved = [];
      for (const [filePath, specs] of analysis.missing.entries()) {
        unresolved.push(`${filePath} -> ${specs.join(", ")}`);
      }
      insightText += `\n\nUnresolved local imports:\n${unresolved.slice(0, 50).join("\n")}`;
    }

    if (analysis.cycles.length > 0) {
      const cycleLines = analysis.cycles
        .slice(0, 10)
        .map((cycle) => cycle.join(" -> "));
      insightText += `\n\nCircular references:\n${cycleLines.join("\n")}`;
    }

    await this.showTextModal("Dependency Insight", insightText);
    this.setStatus(
      `Dependency insight ready (${analysis.dependencyFiles.length} dependencies).`,
      STATUS_LEVELS.SUCCESS,
    );
  }

  async performDownload({
    selectedFiles,
    dependencies,
    finalFiles,
    triggerLabel,
  }) {
    if (!this.repoContext) {
      throw new Error("Repository is not loaded.");
    }

    const filesToDownload = Array.from(new Set(finalFiles)).sort((a, b) =>
      a.localeCompare(b),
    );
    if (filesToDownload.length === 0) {
      this.setStatus("No files selected for download.", STATUS_LEVELS.WARNING);
      return;
    }

    this.startSpinner("Downloading selected files...");

    try {
      const result = await downloadFiles({
        owner: this.repoContext.owner,
        repo: this.repoContext.repo,
        branch: this.repoContext.branch,
        repoUrl: this.repoContext.repoUrl,
        files: filesToDownload,
        mode: this.downloadMode,
        getFileContent: async (filePath) =>
          this.githubService.getFileContentFromContext(
            this.repoContext,
            filePath,
          ),
      });

      await saveProjectSnapshot({
        repoUrl: this.repoContext.repoUrl,
        owner: this.repoContext.owner,
        repo: this.repoContext.repo,
        branch: this.repoContext.branch,
        downloadMode: this.downloadMode,
        selectedFiles,
        dependencies,
      });

      this.stopSpinner();
      this.statusText = `✔ Download complete (${triggerLabel}): ${result.fileCount} files`;
      this.statusLevel = STATUS_LEVELS.SUCCESS;
      this.updateStatusBar();
      this.render();

      const summary = [
        "Download complete",
        "",
        `Files: ${result.fileCount}`,
        `Mode: ${DOWNLOAD_MODE_LABELS[this.downloadMode]}`,
        `Output: ${result.outputPath}`,
        "Snapshot: grabkit.config.json",
      ].join("\n");
      await this.showTextModal("Success", summary, 14, 60);
    } catch (error) {
      this.stopSpinner();
      this.setStatus(`Download failed: ${error.message}`, STATUS_LEVELS.ERROR);
    }
  }

  async chooseDownloadMode() {
    const choice = await this.promptChoice(
      "Download Mode",
      [
        {
          key: "1",
          value: DOWNLOAD_MODES.FLAT,
          label: "1. Flat (all files in one folder)",
        },
        {
          key: "2",
          value: DOWNLOAD_MODES.PRESERVE,
          label: "2. Preserve structure (default)",
        },
        {
          key: "3",
          value: DOWNLOAD_MODES.ZIP,
          label: "3. Zip archive",
        },
      ],
      `Current mode: ${DOWNLOAD_MODE_LABELS[this.downloadMode]}`,
    );

    if (!choice) {
      this.setStatus("Download mode unchanged.", STATUS_LEVELS.INFO);
      return;
    }

    this.downloadMode = choice;
    this.setStatus(
      `Download mode set to ${DOWNLOAD_MODE_LABELS[this.downloadMode]}.`,
      STATUS_LEVELS.SUCCESS,
    );
  }

  applyTheme(themeKey, { announce = false } = {}) {
    const nextTheme = THEMES[themeKey];
    if (!nextTheme) {
      return false;
    }

    this.themeKey = themeKey;
    this.theme = nextTheme;
    this.previewCache.clear();

    if (this.inputBar) {
      this.inputBar.style.fg = this.theme.fg;
      this.inputBar.style.bg = this.theme.bg;
      if (this.inputBar.style.border) {
        this.inputBar.style.border.fg = this.theme.border;
      }
    }

    if (this.treePanel) {
      this.treePanel.style.fg = this.theme.fg;
      this.treePanel.style.bg = this.theme.bg;
      if (this.treePanel.style.border) {
        this.treePanel.style.border.fg = this.theme.border;
      }
    }

    if (this.treeList) {
      this.treeList.style.fg = this.theme.fg;
      this.treeList.style.bg = this.theme.bg;
      this.treeList.style.selected = this.treeList.style.selected || {};
      this.treeList.style.selected.fg = this.theme.selectedFg;
      this.treeList.style.selected.bg = this.theme.selectedBg;
      this.treeList.style.selected.bold = true;
      this.treeList.style.item = this.treeList.style.item || {};
      this.treeList.style.item.fg = this.theme.fg;
      this.treeList.style.item.bg = this.theme.bg;

      if (this.treeList.scrollbar) {
        this.treeList.scrollbar.track = this.treeList.scrollbar.track || {};
        this.treeList.scrollbar.style = this.treeList.scrollbar.style || {};
        this.treeList.scrollbar.track.bg = this.theme.bg;
        this.treeList.scrollbar.style.bg = this.theme.scrollbar;
      }
    }

    if (this.previewPanel) {
      this.previewPanel.style.fg = this.theme.fg;
      this.previewPanel.style.bg = this.theme.bg;
      if (this.previewPanel.style.border) {
        this.previewPanel.style.border.fg = this.theme.border;
      }
    }

    if (this.previewBox) {
      this.previewBox.style.fg = this.theme.fg;
      this.previewBox.style.bg = this.theme.bg;

      if (this.previewBox.scrollbar) {
        this.previewBox.scrollbar.track = this.previewBox.scrollbar.track || {};
        this.previewBox.scrollbar.style = this.previewBox.scrollbar.style || {};
        this.previewBox.scrollbar.track.bg = this.theme.bg;
        this.previewBox.scrollbar.style.bg = this.theme.scrollbar;
      }
    }

    if (this.statusBar) {
      this.statusBar.style.fg = this.theme.statusFg;
      this.statusBar.style.bg = this.theme.statusBg;
    }

    if (this.header) {
      this.header.render();
    }

    this.refreshTree(false);

    if (this.previewEnabled) {
      this.loadPreviewForCurrentNode().catch(() => {
        this.previewBox.setContent("Preview unavailable.");
        this.render();
      });
    }

    if (announce) {
      this.setStatus(
        `Theme set to ${THEME_LABELS[this.themeKey]}.`,
        STATUS_LEVELS.SUCCESS,
      );
    }

    return true;
  }

  async chooseTheme() {
    const choice = await this.promptChoice(
      "Theme",
      [
        {
          key: "1",
          value: "classic",
          label: "1. Classic (default)",
        },
        {
          key: "2",
          value: "minimal",
          label: "2. Minimal monochrome",
        },
        {
          key: "3",
          value: "vivid",
          label: "3. Legacy vivid",
        },
      ],
      `Current theme: ${THEME_LABELS[this.themeKey]}`,
    );

    if (!choice) {
      this.setStatus("Theme unchanged.", STATUS_LEVELS.INFO);
      return;
    }

    this.applyTheme(choice, { announce: true });
  }

  async promptYesNo(question) {
    this.modalActive = true;

    return new Promise((resolve) => {
      const modal = blessed.box({
        parent: this.screen,
        top: "center",
        left: "center",
        width: "70%",
        height: 7,
        border: "line",
        label: " Confirm ",
        tags: true,
        content: `${escapeTags(question)}\n\nPress {green-fg}y{/} to continue or {red-fg}n{/} to cancel.`,
        style: {
          fg: this.theme.fg,
          bg: this.theme.bg,
          border: {
            fg: this.theme.border,
          },
        },
      });

      const cleanup = (answer) => {
        this.screen.off("keypress", onKeypress);
        modal.destroy();
        this.modalActive = false;
        this.render();
        resolve(answer);
      };

      const onKeypress = (pressedChar, pressedKey = {}) => {
        const lowered =
          typeof pressedChar === "string" ? pressedChar.toLowerCase() : "";

        if (lowered === "y" || pressedKey.name === "enter") {
          cleanup(true);
          return;
        }

        if (lowered === "n" || pressedKey.name === "escape") {
          cleanup(false);
        }
      };

      this.screen.on("keypress", onKeypress);
      this.render();
    });
  }

  async promptChoice(title, options, subtitle = "") {
    this.modalActive = true;

    return new Promise((resolve) => {
      const body = [
        subtitle,
        "",
        ...options.map((option) => option.label),
        "",
        "Esc to cancel",
      ]
        .filter(Boolean)
        .join("\n");

      const modal = blessed.box({
        parent: this.screen,
        top: "center",
        left: "center",
        width: "70%",
        height: Math.min(14, options.length + 8),
        border: "line",
        label: ` ${title} `,
        tags: true,
        content: escapeTags(body),
        style: {
          fg: this.theme.fg,
          bg: this.theme.bg,
          border: {
            fg: this.theme.border,
          },
        },
      });

      const cleanup = (selectedValue) => {
        this.screen.off("keypress", onKeypress);
        modal.destroy();
        this.modalActive = false;
        this.render();
        resolve(selectedValue);
      };

      const onKeypress = (pressedChar, pressedKey = {}) => {
        const lowered =
          typeof pressedChar === "string" ? pressedChar.toLowerCase() : "";
        if (pressedKey.name === "escape") {
          cleanup(null);
          return;
        }

        const picked = options.find((option) => option.key === lowered);
        if (picked) {
          cleanup(picked.value);
        }
      };

      this.screen.on("keypress", onKeypress);
      this.render();
    });
  }

  async showTextModal(title, content, height = "80%", width = "80%") {
    this.modalActive = true;

    return new Promise((resolve) => {
      const modal = blessed.box({
        parent: this.screen,
        top: "center",
        left: "center",
        width,
        height,
        border: "line",
        label: ` ${title} `,
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        vi: true,
        mouse: true,
        tags: false,
        content: `${content}\n\nPress q, Enter, or Esc to close.`,
        style: {
          fg: this.theme.fg,
          bg: this.theme.bg,
          border: {
            fg: this.theme.border,
          },
        },
        scrollbar: {
          ch: " ",
          track: {
            bg: this.theme.bg,
          },
          style: {
            bg: this.theme.scrollbar,
          },
        },
      });

      const close = () => {
        modal.destroy();
        this.modalActive = false;
        this.render();
        resolve();
      };

      modal.key(["q", "enter", "escape"], close);
      modal.focus();
      this.render();
    });
  }

  render() {
    if (this.screen) {
      this.screen.render();
    }
  }

  quit() {
    this.stopSpinner();

    if (this.screen) {
      this.screen.destroy();
      this.screen = null;
    }

    if (typeof this.resolveExit === "function") {
      this.resolveExit();
      this.resolveExit = null;
    }
  }
}

function runTui(options = {}) {
  const app = new GrabKitApp(options);
  return app.start();
}

module.exports = {
  GrabKitApp,
  runTui,
};
