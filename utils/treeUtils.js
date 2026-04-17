"use strict";

const path = require("path");

function createNode({
  type,
  name,
  nodePath,
  parent = null,
  sha = null,
  size = 0,
}) {
  return {
    type,
    name,
    path: nodePath,
    parent,
    sha,
    size,
    expanded: false,
    children: [],
    childMap: new Map(),
  };
}

function normalizeDirectoryPath(dirPath) {
  if (!dirPath || dirPath === ".") {
    return "";
  }

  return dirPath.replace(/^\/+/, "").replace(/\/+$/, "");
}

function ensureDirectory(root, nodeByPath, dirPath) {
  const normalizedDir = normalizeDirectoryPath(dirPath);
  if (!normalizedDir) {
    return root;
  }

  const existing = nodeByPath.get(normalizedDir);
  if (existing) {
    return existing;
  }

  const parentPath = normalizeDirectoryPath(path.posix.dirname(normalizedDir));
  const parent = ensureDirectory(root, nodeByPath, parentPath);
  const name = normalizedDir.split("/").pop();

  const node = createNode({
    type: "dir",
    name,
    nodePath: normalizedDir,
    parent,
  });

  parent.children.push(node);
  parent.childMap.set(node.name, node);
  nodeByPath.set(node.path, node);
  return node;
}

function buildTreeFromGitTreeEntries(entries) {
  const root = createNode({
    type: "dir",
    name: "",
    nodePath: "",
  });
  root.expanded = true;

  const nodeByPath = new Map();
  nodeByPath.set("", root);

  const sortedEntries = Array.isArray(entries)
    ? [...entries].sort((a, b) => String(a.path).localeCompare(String(b.path)))
    : [];

  for (const entry of sortedEntries) {
    if (!entry || !entry.path) {
      continue;
    }

    const entryPath = String(entry.path).replace(/^\/+/, "");
    if (!entryPath) {
      continue;
    }

    if (entry.type === "tree") {
      ensureDirectory(root, nodeByPath, entryPath);
      continue;
    }

    if (entry.type !== "blob") {
      continue;
    }

    const dirPath = normalizeDirectoryPath(path.posix.dirname(entryPath));
    const parentDir = ensureDirectory(root, nodeByPath, dirPath);
    const fileName = path.posix.basename(entryPath);

    if (nodeByPath.has(entryPath)) {
      continue;
    }

    const fileNode = createNode({
      type: "file",
      name: fileName,
      nodePath: entryPath,
      parent: parentDir,
      sha: entry.sha || null,
      size: typeof entry.size === "number" ? entry.size : 0,
    });

    parentDir.children.push(fileNode);
    parentDir.childMap.set(fileNode.name, fileNode);
    nodeByPath.set(fileNode.path, fileNode);
  }

  sortTree(root);
  return {
    root,
    nodeByPath,
  };
}

function sortTree(node) {
  if (!node || !Array.isArray(node.children)) {
    return;
  }

  node.children.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "dir" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  for (const child of node.children) {
    if (child.type === "dir") {
      sortTree(child);
    }
  }
}

function flattenVisibleTree(root, filterQuery = "", maxLines = Infinity) {
  if (!root) {
    return [];
  }

  const query = String(filterQuery || "")
    .trim()
    .toLowerCase();
  const flattened = [];
  const matchMemo = new Map();

  function hasMatch(node) {
    if (!query) {
      return true;
    }

    if (matchMemo.has(node.path)) {
      return matchMemo.get(node.path);
    }

    const selfMatch = node.name.toLowerCase().includes(query);
    if (selfMatch) {
      matchMemo.set(node.path, true);
      return true;
    }

    if (node.type === "dir") {
      for (const child of node.children) {
        if (hasMatch(child)) {
          matchMemo.set(node.path, true);
          return true;
        }
      }
    }

    matchMemo.set(node.path, false);
    return false;
  }

  function walk(parentNode, depth) {
    for (const child of parentNode.children) {
      if (query && !hasMatch(child)) {
        continue;
      }

      flattened.push({ node: child, depth });
      if (flattened.length >= maxLines) {
        return;
      }

      if (child.type === "dir" && child.expanded) {
        walk(child, depth + 1);
        if (flattened.length >= maxLines) {
          return;
        }
      }
    }
  }

  walk(root, 0);
  return flattened;
}

function collectFilePaths(node, output = []) {
  if (!node) {
    return output;
  }

  if (node.type === "file") {
    output.push(node.path);
    return output;
  }

  for (const child of node.children) {
    collectFilePaths(child, output);
  }

  return output;
}

function getAllFilePaths(root) {
  return collectFilePaths(root, []);
}

function computeFolderSelectionState(root, selectedFiles) {
  const selectedSet = selectedFiles instanceof Set ? selectedFiles : new Set();
  const stateMap = new Map();

  function walk(node) {
    if (node.type === "file") {
      return {
        total: 1,
        selected: selectedSet.has(node.path) ? 1 : 0,
      };
    }

    let total = 0;
    let selected = 0;

    for (const child of node.children) {
      const childState = walk(child);
      total += childState.total;
      selected += childState.selected;
    }

    stateMap.set(node.path, {
      total,
      selected,
      all: total > 0 && selected === total,
      partial: selected > 0 && selected < total,
    });

    return { total, selected };
  }

  walk(root);
  return stateMap;
}

module.exports = {
  buildTreeFromGitTreeEntries,
  flattenVisibleTree,
  collectFilePaths,
  getAllFilePaths,
  computeFolderSelectionState,
};
