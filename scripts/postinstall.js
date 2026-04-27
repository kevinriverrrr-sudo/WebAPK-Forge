#!/usr/bin/env node
'use strict';

/**
 * WebAPK Forge — postinstall script
 * Runs after `npm install -g webapk-forge`
 */

console.log('');
console.log('  ╔══════════════════════════════════════════════╗');
console.log('  ║       WebAPK Forge — Installed!             ║');
console.log('  ╚══════════════════════════════════════════════╝');
console.log('');
console.log('  Run the CLI:');
console.log('    webapk');
console.log('');
console.log('  First time? Select [2] Setup to install dependencies.');
console.log('  Requirements: Termux + Node.js');
console.log('');
console.log('  Quick install in Termux:');
console.log('    pkg install openjdk-17 aapt2 nodejs');
console.log('    npm install -g kevinriverrrr-sudo/WebAPK-Forge');
console.log('    webapk');
console.log('');
