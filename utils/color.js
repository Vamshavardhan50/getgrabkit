"use strict";

const ANSI = {
  reset: "\u001b[0m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
};

function supportsColor() {
  if (Object.prototype.hasOwnProperty.call(process.env, "NO_COLOR")) {
    return false;
  }

  return Boolean(
    (process.stdout && process.stdout.isTTY) ||
    (process.stderr && process.stderr.isTTY),
  );
}

function wrap(text, colorCode) {
  const value = String(text);
  if (!supportsColor()) {
    return value;
  }

  return `${colorCode}${value}${ANSI.reset}`;
}

function red(text) {
  return wrap(text, ANSI.red);
}

function green(text) {
  return wrap(text, ANSI.green);
}

function yellow(text) {
  return wrap(text, ANSI.yellow);
}

function cyan(text) {
  return wrap(text, ANSI.cyan);
}

module.exports = {
  red,
  green,
  yellow,
  cyan,
};
