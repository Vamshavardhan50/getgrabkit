#!/usr/bin/env node
"use strict";

require("dotenv").config({ quiet: true });

const chalk = require("chalk");
const { runCLI } = require("../cli");

runCLI(process.argv.slice(2)).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(chalk.red(`GrabKit failed: ${message}\n`));
  process.exitCode = 1;
});
