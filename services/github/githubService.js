"use strict";

const https = require("https");
const { Octokit } = require("@octokit/rest");
const { parseGitHubRepoUrl } = require("../../utils/pathUtils");
const { buildTreeFromGitTreeEntries } = require("../../utils/treeUtils");

function requestText(url, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (
        statusCode >= 300 &&
        statusCode < 400 &&
        location &&
        redirectCount < 5
      ) {
        response.resume();
        requestText(location, headers, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data);
          return;
        }

        const error = new Error(`Raw content request failed (${statusCode}).`);
        error.status = statusCode;
        reject(error);
      });
    });

    request.on("error", reject);
  });
}

class GitHubService {
  constructor(options = {}) {
    this.authToken =
      options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    this.defaultBranchRef = process.env.GRABKIT_DEFAULT_BRANCH || "HEAD";

    this.octokit = new Octokit({
      auth: this.authToken || undefined,
      userAgent: "GrabKit/0.1.0",
    });
    this.rawContentCache = new Map();
  }

  isAuthenticated() {
    return Boolean(this.authToken);
  }

  async fetchRepositoryTree(repoUrl) {
    const parsed = parseGitHubRepoUrl(repoUrl);
    const branch = parsed.branch || this.defaultBranchRef;

    try {
      const response = await this.octokit.git.getTree({
        owner: parsed.owner,
        repo: parsed.repo,
        tree_sha: branch,
        recursive: "1",
      });

      const entries = Array.isArray(response.data.tree)
        ? response.data.tree
        : [];
      const { root, nodeByPath } = buildTreeFromGitTreeEntries(entries);
      root.name = parsed.repo;
      root.expanded = true;

      return {
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        subPath: parsed.subPath,
        repoUrl: parsed.normalizedUrl,
        root,
        nodeByPath,
        truncated: Boolean(response.data.truncated),
      };
    } catch (error) {
      if (
        !parsed.branch &&
        error &&
        typeof error.status === "number" &&
        error.status === 404
      ) {
        throw new Error(
          "Could not resolve repository default branch in single-call mode. Use URL format https://github.com/<owner>/<repo>/tree/<branch> or set GRABKIT_DEFAULT_BRANCH.",
        );
      }

      throw this.wrapGitHubError(error);
    }
  }

  async getFileContentFromContext(context, filePath) {
    const node = context.nodeByPath.get(filePath);
    if (!node || node.type !== "file") {
      throw new Error(`File not found in repository tree: ${filePath}`);
    }

    return this.getFileContent({
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      path: filePath,
    });
  }

  async getFileContent({ owner, repo, branch, path }) {
    return this.getRawFileContent({ owner, repo, branch, path });
  }

  buildRawUrl({ owner, repo, branch, path }) {
    const normalizedPath = String(path || "");
    const encodedPath = normalizedPath
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const safeBranch = encodeURIComponent(String(branch || "")).replace(
      /%2F/g,
      "/",
    );

    return `https://raw.githubusercontent.com/${owner}/${repo}/${safeBranch}/${encodedPath}`;
  }

  async getRawFileContent({ owner, repo, branch, path }) {
    const rawUrl = this.buildRawUrl({ owner, repo, branch, path });
    if (this.rawContentCache.has(rawUrl)) {
      return this.rawContentCache.get(rawUrl);
    }

    const headers = {
      "User-Agent": "GrabKit/0.1.0",
      Accept: "text/plain, */*",
    };

    if (this.authToken) {
      headers.Authorization = `token ${this.authToken}`;
    }

    const content = await requestText(rawUrl, headers);
    this.rawContentCache.set(rawUrl, content);
    return content;
  }

  wrapGitHubError(error) {
    const status =
      error && typeof error.status === "number" ? error.status : null;
    const headers =
      error && error.response && error.response.headers
        ? error.response.headers
        : {};
    const remaining = headers["x-ratelimit-remaining"];
    const resetUnix = headers["x-ratelimit-reset"];

    if (status === 403 && remaining === "0") {
      const resetDate = resetUnix
        ? new Date(Number(resetUnix) * 1000).toLocaleTimeString()
        : "later";

      return new Error(
        `GitHub API rate limit reached. Try again after ${resetDate}. Tip: set GITHUB_TOKEN (or GH_TOKEN) for a higher request limit.`,
      );
    }

    if (status === 404) {
      return new Error(
        "Repository or file not found. Check URL, branch, and permissions.",
      );
    }

    if (status === 401) {
      return new Error(
        "GitHub authentication failed. Check your GITHUB_TOKEN if provided.",
      );
    }

    if (error && error.message) {
      return new Error(error.message);
    }

    return new Error("Unexpected GitHub API error.");
  }
}

module.exports = {
  GitHubService,
};
