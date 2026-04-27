#!/usr/bin/env node

/**
 * WebAPK Forge — CLI Android WebView APK Builder
 * Entry point for the `webapk` command
 */

const path = require('path');
const fs = require('fs');

// Ensure the project root is in the module path
const projectRoot = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(projectRoot, 'src', 'index.js'))) {
    console.error('Error: Could not find src/index.js. Please reinstall webapk-forge.');
    process.exit(1);
}

require(path.join(projectRoot, 'src', 'index.js'));
