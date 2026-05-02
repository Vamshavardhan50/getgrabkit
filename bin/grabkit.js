#!/usr/bin/env node
"use strict";

const { red } = require("../utils/color");
const { runFromBin } = require("./getgrabkit");

runFromBin(process.argv.slice(2)).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(red(`GetGrabKit failed: ${message}\n`));
  process.exitCode = 1;
});
