"use strict";

const blessed = require("blessed");
const figlet = require("figlet");

const COLOR_RAMP_TAGS = ["cyan-fg", "blue-fg", "magenta-fg"];

const STATUS_STYLE_TAGS = {
  ready: "green-fg",
  loading: "cyan-fg",
  warning: "yellow-fg",
  error: "red-fg",
};

function escapeTags(value) {
  return String(value || "")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function stripTags(value) {
  return String(value || "").replace(/\{\/?[^}]+\}/g, "");
}

function getVisibleLength(value) {
  return stripTags(value).length;
}

function centerTaggedLine(value, width) {
  const line = String(value || "");
  const visibleLength = getVisibleLength(line);
  const leftPadding = Math.max(0, Math.floor((width - visibleLength) / 2));
  return `${" ".repeat(leftPadding)}${line}`;
}

function buildAsciiLogo(text) {
  try {
    const rendered = figlet.textSync(text, {
      font: "ANSI Shadow",
      horizontalLayout: "default",
      verticalLayout: "default",
    });
    return rendered.split("\n");
  } catch (_error) {
    return [String(text || "GetGrabKit")];
  }
}

function colorizeLogoLine(line) {
  const rawLine = String(line || "");
  if (!rawLine.trim()) {
    return "";
  }

  const charCount = Math.max(1, rawLine.length - 1);
  let output = "";

  for (let index = 0; index < rawLine.length; index += 1) {
    const character = rawLine[index];
    if (character === " ") {
      output += " ";
      continue;
    }

    const ratio = index / charCount;
    const colorIndex = Math.min(
      COLOR_RAMP_TAGS.length - 1,
      Math.floor(ratio * COLOR_RAMP_TAGS.length),
    );
    const colorTag = COLOR_RAMP_TAGS[colorIndex];
    output += `{${colorTag}}${escapeTags(character)}{/}`;
  }

  return `{bold}${output}{/bold}`;
}

function getScreenWidth(parent) {
  const widthValue = Number(parent && parent.width);
  if (Number.isFinite(widthValue) && widthValue > 0) {
    return widthValue;
  }

  return process.stdout.columns || 100;
}

class HeaderBar {
  constructor(options = {}) {
    const {
      parent,
      title = "GetGrabKit",
      tagline = "Grab only what you need from GitHub",
      version = "v1.0.0",
      status = "Ready",
      statusType = "ready",
    } = options;

    if (!parent) {
      throw new Error("HeaderBar requires a parent screen.");
    }

    this.parent = parent;
    this.title = title;
    this.tagline = tagline;
    this.version = version;
    this.status = status;
    this.statusType = statusType;
    this.logoLines = buildAsciiLogo(this.title);
    this.coloredLogoLines = this.logoLines.map((line) =>
      colorizeLogoLine(line),
    );
    this.logoHeight = this.logoLines.length;
    this.height = this.logoHeight + 3;

    this.container = blessed.box({
      parent: this.parent,
      top: 0,
      left: 0,
      width: "100%",
      height: this.height,
      tags: true,
      style: {
        fg: "white",
        bg: "black",
      },
    });

    this.logoBox = blessed.box({
      parent: this.container,
      top: 0,
      left: 0,
      width: "100%",
      height: this.logoHeight,
      tags: true,
      style: {
        fg: "white",
        bg: "black",
      },
    });

    this.taglineBox = blessed.box({
      parent: this.container,
      top: this.logoHeight,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      align: "center",
      style: {
        fg: "white",
        bg: "black",
      },
    });

    this.metaBox = blessed.box({
      parent: this.container,
      top: this.logoHeight + 1,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      align: "center",
      style: {
        fg: "white",
        bg: "black",
      },
    });

    this.separatorBox = blessed.box({
      parent: this.container,
      top: this.height - 1,
      left: 1,
      width: "100%-2",
      height: 1,
      tags: true,
      style: {
        fg: "gray",
        bg: "black",
      },
    });

    this.parent.on("resize", () => {
      this.render();
    });

    this.render();
  }

  getHeight() {
    return this.height;
  }

  setStatus(status, statusType = "ready") {
    if (this.status === status && this.statusType === statusType) {
      return;
    }

    this.status = status;
    this.statusType = statusType;
    this.renderMeta();
  }

  setVersion(version) {
    if (this.version === version) {
      return;
    }

    this.version = version;
    this.renderMeta();
  }

  renderLogo() {
    const screenWidth = getScreenWidth(this.parent);
    const innerWidth = Math.max(20, screenWidth - 2);
    const outputLines = this.coloredLogoLines.map((line) =>
      centerTaggedLine(line, innerWidth),
    );

    this.logoBox.setContent(outputLines.join("\n"));
  }

  renderMeta() {
    const safeVersion = escapeTags(this.version);
    const safeStatus = escapeTags(this.status);
    const statusTag =
      STATUS_STYLE_TAGS[this.statusType] || STATUS_STYLE_TAGS.ready;
    const metadata =
      `{gray-fg}${safeVersion}  by GetGrabKit{/}  ` +
      `{magenta-fg}|{/}  {${statusTag}}${safeStatus}{/}`;

    const screenWidth = getScreenWidth(this.parent);
    const innerWidth = Math.max(20, screenWidth - 2);

    this.metaBox.setContent(centerTaggedLine(metadata, innerWidth));
  }

  renderTagline() {
    const safeTagline = escapeTags(this.tagline);
    const tagline = `{cyan-fg}${safeTagline}{/}`;
    const screenWidth = getScreenWidth(this.parent);
    const innerWidth = Math.max(20, screenWidth - 2);
    this.taglineBox.setContent(centerTaggedLine(tagline, innerWidth));
  }

  renderSeparator() {
    const screenWidth = getScreenWidth(this.parent);
    const separatorWidth = Math.max(12, screenWidth - 4);
    this.separatorBox.setContent(`{gray-fg}${"-".repeat(separatorWidth)}{/}`);
  }

  render() {
    this.renderLogo();
    this.renderMeta();
    this.renderTagline();
    this.renderSeparator();
  }
}

module.exports = {
  HeaderBar,
};
