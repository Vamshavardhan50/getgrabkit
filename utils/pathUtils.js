"use strict";

function parseGitHubRepoUrl(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Repository URL is required.");
  }

  let normalized = input.trim();
  if (!normalized) {
    throw new Error("Repository URL is required.");
  }

  if (normalized.startsWith("git@github.com:")) {
    normalized = `https://github.com/${normalized.slice("git@github.com:".length)}`;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalized);
  } catch (_error) {
    throw new Error("Invalid URL. Example: https://github.com/owner/repo");
  }

  if (!/^(www\.)?github\.com$/i.test(parsedUrl.hostname)) {
    throw new Error("Only github.com repository URLs are supported.");
  }

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Repository URL must include owner and repository name.");
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");

  let branch = null;
  let subPath = "";
  if (segments[2] === "tree" && segments[3]) {
    branch = segments[3];
    if (segments.length > 4) {
      subPath = segments.slice(4).join("/");
    }
  }

  return {
    owner,
    repo,
    branch,
    subPath,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function sanitizeFlatFilename(relativePath) {
  return toPosixPath(relativePath)
    .replace(/\//g, "__")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function timestampForFileName(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

module.exports = {
  parseGitHubRepoUrl,
  toPosixPath,
  sanitizeFlatFilename,
  timestampForFileName,
};
