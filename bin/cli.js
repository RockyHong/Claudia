#!/usr/bin/env node

/**
 * Claudia CLI entry point.
 *
 * Usage:
 *   npx claudia          Start the receptionist
 *   npx claudia init     Configure Claude Code hooks
 *   npx claudia teardown Remove Claudia hooks
 */

const command = process.argv[2];

switch (command) {
  case "init":
    console.log("claudia init — not yet implemented");
    break;
  case "teardown":
    console.log("claudia teardown — not yet implemented");
    break;
  default:
    console.log("claudia — not yet implemented");
    break;
}
