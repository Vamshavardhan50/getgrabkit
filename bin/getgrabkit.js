#!/usr/bin/env node
"use strict";

require("dotenv").config({ quiet: true });

const { red } = require("../utils/color");
const { runCLI } = require("../cli");

async function runFromBin(argv = process.argv.slice(2)) {
  await runCLI(argv);
}

if (require.main === module) {
  runFromBin().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(red(`GetGrabKit failed: ${message}\n`));
    process.exitCode = 1;
  });
}

module.exports = {
  runFromBin,
};
