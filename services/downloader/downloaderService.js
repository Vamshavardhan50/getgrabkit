"use strict";

const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const archiver = require("archiver");
const { DOWNLOAD_MODES } = require("../../utils/constants");
const {
  sanitizeFlatFilename,
  timestampForFileName,
} = require("../../utils/pathUtils");

const SNAPSHOT_FILE_NAME = "grabkit.config.json";

async function ensureDirectory(dirPath) {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

function uniqueSortedFiles(files) {
  return Array.from(new Set(Array.isArray(files) ? files : [])).sort((a, b) =>
    a.localeCompare(b),
  );
}

function createFlatFilenameMap(filePaths) {
  const used = new Map();
  const mapped = new Map();

  for (const filePath of filePaths) {
    const baseName = sanitizeFlatFilename(filePath);
    const count = (used.get(baseName) || 0) + 1;
    used.set(baseName, count);
    mapped.set(filePath, count === 1 ? baseName : `${baseName}__${count}`);
  }

  return mapped;
}

async function writeZipArchive({ zipPath, filePaths, getFileContent }) {
  await new Promise(async (resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);

    try {
      for (const filePath of filePaths) {
        const content = await getFileContent(filePath);
        archive.append(content, { name: filePath });
      }
      await archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

async function downloadFiles(options) {
  const {
    owner,
    repo,
    branch,
    repoUrl,
    files,
    mode = DOWNLOAD_MODES.PRESERVE,
    getFileContent,
  } = options;

  if (typeof getFileContent !== "function") {
    throw new Error("getFileContent callback is required.");
  }

  const filePaths = uniqueSortedFiles(files);
  if (filePaths.length === 0) {
    throw new Error("No files selected for download.");
  }

  const outputRoot = process.cwd();
  await ensureDirectory(outputRoot);

  const stamp = timestampForFileName();

  if (mode === DOWNLOAD_MODES.ZIP) {
    const zipPath = path.join(outputRoot, `${repo}-${stamp}.zip`);
    await writeZipArchive({ zipPath, filePaths, getFileContent });
    return {
      outputPath: zipPath,
      fileCount: filePaths.length,
      mode,
      owner,
      repo,
      branch,
      repoUrl,
    };
  }

  const outputDir = path.join(outputRoot, `${repo}-${stamp}`);
  await ensureDirectory(outputDir);

  const flatMapping =
    mode === DOWNLOAD_MODES.FLAT ? createFlatFilenameMap(filePaths) : null;

  for (const filePath of filePaths) {
    const targetRelativePath =
      mode === DOWNLOAD_MODES.FLAT ? flatMapping.get(filePath) : filePath;
    const outputPath = path.join(outputDir, targetRelativePath);

    await ensureDirectory(path.dirname(outputPath));
    const content = await getFileContent(filePath);
    await fsPromises.writeFile(outputPath, content, "utf8");
  }

  return {
    outputPath: outputDir,
    fileCount: filePaths.length,
    mode,
    owner,
    repo,
    branch,
    repoUrl,
  };
}

async function saveProjectSnapshot(snapshot) {
  const snapshotPath = snapshot.snapshotPath
    ? path.resolve(snapshot.snapshotPath)
    : path.join(process.cwd(), SNAPSHOT_FILE_NAME);

  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    repoUrl: snapshot.repoUrl,
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.branch,
    downloadMode: snapshot.downloadMode,
    selectedFiles: uniqueSortedFiles(snapshot.selectedFiles),
    dependencies: uniqueSortedFiles(snapshot.dependencies),
  };

  await fsPromises.writeFile(
    snapshotPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  return snapshotPath;
}

async function loadProjectSnapshot(
  snapshotPath = path.join(process.cwd(), SNAPSHOT_FILE_NAME),
) {
  const resolvedPath = path.resolve(snapshotPath);
  const content = await fsPromises.readFile(resolvedPath, "utf8");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_error) {
    throw new Error(`Invalid snapshot file format: ${resolvedPath}`);
  }

  if (!parsed.repoUrl) {
    throw new Error(`Snapshot file is missing repoUrl: ${resolvedPath}`);
  }

  return parsed;
}

module.exports = {
  downloadFiles,
  saveProjectSnapshot,
  loadProjectSnapshot,
  SNAPSHOT_FILE_NAME,
};
