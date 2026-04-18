#!/usr/bin/env node
"use strict";

const chalk = require("chalk");
const { runFromBin } = require("./getgrabkit");

runFromBin(process.argv.slice(2)).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(chalk.red(`GetGrabKit failed: ${message}\n`));
  process.exitCode = 1;
});
