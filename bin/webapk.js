#!/usr/bin/env node
'use strict';

/**
 * WebAPK Forge — CLI Entry Point
 * Global command: webapk
 *
 * Finds the package root no matter how it was installed:
 *   npm install -g, npx, node_modules, local clone
 */

const path = require('path');
const fs = require('fs');

// ─── Resolve package root reliably ───────────────────────────────────────────
// require.resolve follows symlinks and works globally, locally, via npx, etc.
function getPackageRoot() {
    // 1. Try require.resolve on main entry
    try {
        const mainFile = require.resolve('webapk-forge');
        return path.dirname(path.dirname(mainFile));
    } catch {}

    // 2. Walk up __dirname looking for package.json with our name
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        const pkgJson = path.join(dir, 'package.json');
        if (fs.existsSync(pkgJson)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
                if (pkg.name === 'webapk-forge') return dir;
            } catch {}
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    // 3. Fallback: assume __dirname is bin/ and root is one level up
    return path.resolve(__dirname, '..');
}

const ROOT = getPackageRoot();
const indexPath = path.join(ROOT, 'src', 'index.js');

if (!fs.existsSync(indexPath)) {
    console.error('\x1b[31m✗ Error: Cannot find webapk-forge source files.\x1b[0m');
    console.error('  Package root resolved to: ' + ROOT);
    console.error('  Please reinstall: npm install -g webapk-forge\n');
    process.exit(1);
}

require(indexPath);
