"use strict";

const DOWNLOAD_MODES = {
  PRESERVE: "preserve",
  FLAT: "flat",
  ZIP: "zip",
};

const DOWNLOAD_MODE_LABELS = {
  [DOWNLOAD_MODES.PRESERVE]: "Preserve structure",
  [DOWNLOAD_MODES.FLAT]: "Flat",
  [DOWNLOAD_MODES.ZIP]: "Zip archive",
};

const SPINNER_FRAMES = ["-", "\\", "|", "/"];

const STATUS_LEVELS = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
};

const MAX_PREVIEW_BYTES = 120000;
const MAX_TREE_LINES = 5000;
const MAX_DEPENDENCY_TREE_LINES = 1000;

module.exports = {
  DOWNLOAD_MODES,
  DOWNLOAD_MODE_LABELS,
  SPINNER_FRAMES,
  STATUS_LEVELS,
  MAX_PREVIEW_BYTES,
  MAX_TREE_LINES,
  MAX_DEPENDENCY_TREE_LINES,
};
