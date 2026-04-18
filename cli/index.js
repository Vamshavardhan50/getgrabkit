"use strict";

const os = require("os");
const path = require("path");
const chalk = require("chalk");
const { runTui } = require("../ui/app");
const { GitHubService } = require("../services/github/githubService");
const {
  downloadFiles,
  loadProjectSnapshot,
} = require("../services/downloader/downloaderService");
const { DOWNLOAD_MODES } = require("../utils/constants");

function printHelp() {
  const lines = [
    "GrabKit - advanced deterministic GitHub file grabber",
    "Commands: grabkit, getgrabkit",
    "",
    "Usage:",
    "  grabkit                Start interactive TUI",
    "  getgrabkit             Start interactive TUI",
    "  grabkit restore        Restore from ./grabkit.config.json",
    "  getgrabkit restore     Restore from ./grabkit.config.json",
    "  grabkit restore PATH   Restore from a custom snapshot file",
    "  getgrabkit restore PATH Restore from a custom snapshot file",
    "",
    "Examples:",
    "  grabkit restore ./backup/grabkit.config.json",
    "  getgrabkit restore ./backup/grabkit.config.json",
    '  grabkit restore "D:/My Backups/grabkit.config.json"',
    "",
    "Note: Do not include angle brackets in commands.",
    "  grabkit --help         Show help",
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function resolveSnapshotPath(snapshotArg) {
  if (!snapshotArg) {
    return path.join(process.cwd(), "grabkit.config.json");
  }

  const trimmed = snapshotArg.trim();
  if (!trimmed) {
    return path.join(process.cwd(), "grabkit.config.json");
  }

  if (trimmed.includes("<") || trimmed.includes(">")) {
    throw new Error(
      "Invalid snapshot path. Use an actual file path and do not include angle brackets.",
    );
  }

  if (trimmed === "path" || /^path_to_/i.test(trimmed)) {
    throw new Error(
      "Invalid snapshot path placeholder. Replace it with a real file path.",
    );
  }

  if (trimmed === "~") {
    return os.homedir();
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }

  return path.resolve(process.cwd(), trimmed);
}

async function runRestore(snapshotArg) {
  const snapshotPath = resolveSnapshotPath(snapshotArg);

  let snapshot;
  try {
    snapshot = await loadProjectSnapshot(snapshotPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(
        `Snapshot file not found: ${snapshotPath}. Use: grabkit restore ./path/to/grabkit.config.json`,
      );
    }

    throw error;
  }

  const selectedFiles = Array.isArray(snapshot.selectedFiles)
    ? snapshot.selectedFiles
    : [];
  const dependencies = Array.isArray(snapshot.dependencies)
    ? snapshot.dependencies
    : [];

  const requestedFiles = Array.from(
    new Set([...selectedFiles, ...dependencies]),
  ).sort((a, b) => a.localeCompare(b));

  if (requestedFiles.length === 0) {
    throw new Error("Snapshot has no files to restore.");
  }

  process.stdout.write(chalk.cyan("Restoring snapshot...\n"));

  const githubService = new GitHubService();
  const repoContext = await githubService.fetchRepositoryTree(snapshot.repoUrl);

  const existingFiles = [];
  const missingFiles = [];

  for (const filePath of requestedFiles) {
    const node = repoContext.nodeByPath.get(filePath);
    if (node && node.type === "file") {
      existingFiles.push(filePath);
    } else {
      missingFiles.push(filePath);
    }
  }

  if (existingFiles.length === 0) {
    throw new Error(
      "None of the snapshot files are present in the repository.",
    );
  }

  const mode = snapshot.downloadMode || DOWNLOAD_MODES.PRESERVE;
  const result = await downloadFiles({
    owner: repoContext.owner,
    repo: repoContext.repo,
    branch: repoContext.branch,
    repoUrl: snapshot.repoUrl,
    files: existingFiles,
    mode,
    getFileContent: async (filePath) =>
      githubService.getFileContentFromContext(repoContext, filePath),
  });

  process.stdout.write(
    chalk.green(
      `Restore complete. ${result.fileCount} files downloaded to ${result.outputPath}\n`,
    ),
  );

  if (missingFiles.length > 0) {
    process.stdout.write(
      chalk.yellow(
        `Skipped ${missingFiles.length} missing files:\n${missingFiles
          .slice(0, 20)
          .join("\n")}\n`,
      ),
    );
  }
}

async function runCLI(argv) {
  const command = argv[0];

  if (!command) {
    await runTui();
    return;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "restore") {
    await runRestore(argv[1]);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

module.exports = {
  runCLI,
};
