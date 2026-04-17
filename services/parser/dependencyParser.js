"use strict";

const path = require("path");

const JS_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx"]);

const DEPENDENCY_PATTERNS = [
  /\bimport\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
  /\bexport\s+[^'";]+?\s+from\s+["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function isJavaScriptFile(filePath) {
  const extension = path.posix.extname(filePath).toLowerCase();
  return JS_EXTENSIONS.has(extension);
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function extractDependencySpecifiers(content) {
  const specifiers = new Set();

  for (const pattern of DEPENDENCY_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(content);
    while (match) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
      match = pattern.exec(content);
    }
  }

  return Array.from(specifiers);
}

function buildPathCandidates(basePath) {
  const normalized = path.posix.normalize(basePath);
  const ext = path.posix.extname(normalized);

  const candidates = new Set([normalized]);
  if (!ext) {
    candidates.add(`${normalized}.js`);
    candidates.add(`${normalized}.mjs`);
    candidates.add(`${normalized}.cjs`);
    candidates.add(`${normalized}.jsx`);
    candidates.add(`${normalized}.json`);
    candidates.add(path.posix.join(normalized, "index.js"));
    candidates.add(path.posix.join(normalized, "index.mjs"));
    candidates.add(path.posix.join(normalized, "index.cjs"));
    candidates.add(path.posix.join(normalized, "index.jsx"));
    candidates.add(path.posix.join(normalized, "index.json"));
  }

  return Array.from(candidates);
}

function resolveLocalDependency(sourceFilePath, specifier, allFilesSet) {
  if (!isLocalSpecifier(specifier)) {
    return null;
  }

  const sourceDir = path.posix.dirname(sourceFilePath);
  const basePath = path.posix.join(sourceDir, specifier);

  for (const candidate of buildPathCandidates(basePath)) {
    if (allFilesSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function buildSmartDependencySet({
  selectedFiles,
  allFiles,
  getFileContent,
}) {
  const entryFiles = Array.from(
    new Set(Array.isArray(selectedFiles) ? selectedFiles : []),
  ).sort((left, right) => left.localeCompare(right));

  const allFilesSet = new Set(Array.isArray(allFiles) ? allFiles : []);
  const entrySet = new Set(entryFiles);
  const graph = new Map();
  const missing = new Map();
  const cycles = [];
  const dependencyFiles = new Set();
  const visited = new Set();
  const inStack = new Set();

  async function walk(filePath, stack = []) {
    if (inStack.has(filePath)) {
      cycles.push([...stack, filePath]);
      return;
    }

    if (visited.has(filePath)) {
      return;
    }

    visited.add(filePath);
    inStack.add(filePath);

    let dependencies = new Set();

    if (isJavaScriptFile(filePath)) {
      let content = "";
      try {
        content = await getFileContent(filePath);
      } catch (_error) {
        content = "";
      }

      const specs = extractDependencySpecifiers(content);
      dependencies = new Set();

      for (const specifier of specs) {
        if (!isLocalSpecifier(specifier)) {
          continue;
        }

        const resolvedPath = resolveLocalDependency(
          filePath,
          specifier,
          allFilesSet,
        );
        if (!resolvedPath) {
          if (!missing.has(filePath)) {
            missing.set(filePath, []);
          }
          missing.get(filePath).push(specifier);
          continue;
        }

        dependencies.add(resolvedPath);
        if (!entrySet.has(resolvedPath)) {
          dependencyFiles.add(resolvedPath);
        }
      }
    }

    graph.set(filePath, dependencies);

    const sortedDependencies = Array.from(dependencies).sort((a, b) =>
      a.localeCompare(b),
    );
    for (const dependencyPath of sortedDependencies) {
      await walk(dependencyPath, [...stack, filePath]);
    }

    inStack.delete(filePath);
  }

  for (const filePath of entryFiles) {
    await walk(filePath);
  }

  const finalFiles = Array.from(
    new Set([...entryFiles, ...dependencyFiles]),
  ).sort((a, b) => a.localeCompare(b));

  return {
    entryFiles,
    finalFiles,
    dependencyFiles: Array.from(dependencyFiles).sort((a, b) =>
      a.localeCompare(b),
    ),
    graph,
    missing,
    cycles,
  };
}

function buildDependencyTreeText(graph, entryFiles, maxLines = 1000) {
  const lines = [];
  const roots = Array.from(new Set(entryFiles || [])).sort((left, right) =>
    left.localeCompare(right),
  );

  function appendLine(text) {
    if (lines.length >= maxLines) {
      return false;
    }
    lines.push(text);
    return true;
  }

  function walk(filePath, prefix, isLast, ancestors) {
    if (lines.length >= maxLines) {
      return;
    }

    if (prefix === "") {
      appendLine(filePath);
    } else {
      const branch = isLast ? "└── " : "├── ";
      appendLine(`${prefix}${branch}${filePath}`);
    }

    if (ancestors.has(filePath)) {
      const cyclePrefix = prefix + (isLast ? "    " : "│   ");
      appendLine(`${cyclePrefix}└── [circular]`);
      return;
    }

    const dependencies = Array.from(graph.get(filePath) || []).sort((a, b) =>
      a.localeCompare(b),
    );
    if (dependencies.length === 0) {
      return;
    }

    const childPrefix =
      prefix + (prefix === "" ? "" : isLast ? "    " : "│   ");
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(filePath);

    dependencies.forEach((dependencyPath, index) => {
      walk(
        dependencyPath,
        childPrefix,
        index === dependencies.length - 1,
        nextAncestors,
      );
    });
  }

  roots.forEach((rootFile, index) => {
    walk(rootFile, "", index === roots.length - 1, new Set());
  });

  if (lines.length >= maxLines) {
    lines.push("... output truncated ...");
  }

  return lines.join("\n");
}

module.exports = {
  isJavaScriptFile,
  buildSmartDependencySet,
  buildDependencyTreeText,
};
