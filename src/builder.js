/**
 * WebAPK Forge — APK Builder Module
 * Compiles and packages WebView APK without full Android SDK
 *
 * Build pipeline:
 *   1. Generate project (Manifest, Java, Resources)
 *   2. aapt2 compile  → compiled resources
 *   3. aapt2 link     → resources.apk + R.java
 *   4. javac          → .class files
 *   5. d8 (r8.jar)    → classes.dex
 *   6. aapt2 add      → APK with DEX
 *   7. zipalign + jarsigner → signed APK
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getToolsDir, run, getTermuxPrefix } = require('./setup');

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', white: '\x1b[37m',
};

function log(text, type = 'info') {
    const icons = { info: 'ℹ️ ', ok: '✓ ', err: '✗ ', warn: '⚠️ ', step: '▸ ' };
    const colors = { info: C.cyan, ok: C.green, err: C.red, warn: C.yellow, step: C.dim };
    console.log(`  ${colors[type]}${icons[type]}${C.reset} ${text}`);
}

function phase(title) {
    console.log('');
    console.log(`  ${C.bold}${C.yellow}[ ${title} ]${C.reset}`);
}

// ─── Template loaders ────────────────────────────────────────────────────────

function loadTemplate(name) {
    return fs.readFileSync(path.join(__dirname, 'templates', name), 'utf-8');
}

// ─── File generators ─────────────────────────────────────────────────────────

function generateManifest(opts) {
    const tpl = loadTemplate('AndroidManifest.xml');
    return tpl
        .replace(/{{PACKAGE_NAME}}/g, opts.pkgName)
        .replace(/{{APP_NAME}}/g, opts.appName)
        .replace(/{{VERSION_CODE}}/g, opts.versionCode || '1')
        .replace(/{{VERSION_NAME}}/g, opts.version);
}

function generateMainActivity(opts) {
    const tpl = loadTemplate('MainActivity.java');
    const pkgDir = opts.pkgName.replace(/\./g, '/');
    return {
        content: tpl.replace(/{{PACKAGE_NAME}}/g, opts.pkgName).replace(/{{URL}}/g, opts.url),
        packageDir: pkgDir,
    };
}

function generateStrings(appName) {
    return loadTemplate('strings.xml').replace(/{{APP_NAME}}/g, appName);
}

function generateStyles() {
    return loadTemplate('styles.xml');
}

function generateNetworkConfig() {
    return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`;
}

// ─── Build steps ─────────────────────────────────────────────────────────────

async function buildAPK(opts) {
    const startTime = Date.now();

    const buildDir = path.join(os.tmpdir(), `webapk-build-${Date.now()}`);
    const resDir = path.join(buildDir, 'res', 'values');
    const xmlDir = path.join(buildDir, 'res', 'xml');
    const javaDir = path.join(buildDir, 'java');
    const genDir = path.join(buildDir, 'gen');
    const classesDir = path.join(buildDir, 'classes');
    const dexDir = path.join(buildDir, 'dex');

    const toolsDir = getToolsDir();
    const prefix = getTermuxPrefix();

    try {
        // ── Create directories ────────────────────────────────────────────
        fs.mkdirSync(buildDir, { recursive: true });
        fs.mkdirSync(resDir, { recursive: true });
        fs.mkdirSync(xmlDir, { recursive: true });
        fs.mkdirSync(genDir, { recursive: true });
        fs.mkdirSync(classesDir, { recursive: true });
        fs.mkdirSync(dexDir, { recursive: true });

        // ════════════════════════════════════════════════════════════════════
        // PHASE 1: Generate project files
        // ════════════════════════════════════════════════════════════════════
        phase('Генерация проекта');

        // AndroidManifest.xml
        const manifest = generateManifest(opts);
        fs.writeFileSync(path.join(buildDir, 'AndroidManifest.xml'), manifest);
        log('AndroidManifest.xml', 'ok');

        // MainActivity.java
        const activity = generateMainActivity(opts);
        fs.mkdirSync(path.join(javaDir, activity.packageDir), { recursive: true });
        fs.writeFileSync(path.join(javaDir, activity.packageDir, 'MainActivity.java'), activity.content);
        log('MainActivity.java', 'ok');

        // Resources
        fs.writeFileSync(path.join(resDir, 'strings.xml'), generateStrings(opts.appName));
        fs.writeFileSync(path.join(resDir, 'styles.xml'), generateStyles());
        fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), generateNetworkConfig());
        log('Resources (strings, styles, network config)', 'ok');

        // ════════════════════════════════════════════════════════════════════
        // PHASE 2: Compile resources with aapt2
        // ════════════════════════════════════════════════════════════════════
        phase('Компиляция ресурсов');

        const compiledRes = path.join(buildDir, 'compiled_res.zip');
        const aapt2 = findBinary('aapt2', prefix);

        let result = run(`"${aapt2}" compile --dir "${path.join(buildDir, 'res')}" -o "${compiledRes}"`);
        if (!result.ok) {
            log(`aapt2 compile failed: ${result.stderr}`, 'err');
            throw new Error('Resource compilation failed');
        }
        log('Ресурсы скомпилированы', 'ok');

        // ════════════════════════════════════════════════════════════════════
        // PHASE 3: Link resources and generate R.java
        // ════════════════════════════════════════════════════════════════════
        phase('Линковка ресурсов');

        const resourcesApk = path.join(buildDir, 'resources.apk');
        const androidJar = path.join(toolsDir, 'android.jar');

        // Build the aapt2 link command
        let aapt2LinkCmd = `"${aapt2}" link`;
        aapt2LinkCmd += ` --manifest "${path.join(buildDir, 'AndroidManifest.xml')}"`;
        aapt2LinkCmd += ` --java "${genDir}"`;
        aapt2LinkCmd += ` --auto-add-overlay`;
        if (fs.existsSync(androidJar)) {
            aapt2LinkCmd += ` -I "${androidJar}"`;
        }
        aapt2LinkCmd += ` -o "${resourcesApk}"`;
        aapt2LinkCmd += ` "${compiledRes}"`;

        result = run(aapt2LinkCmd);
        if (!result.ok) {
            log(`aapt2 link failed: ${result.stderr}`, 'err');
            throw new Error('Resource linking failed');
        }
        log('R.java сгенерирован', 'ok');

        // ════════════════════════════════════════════════════════════════════
        // PHASE 4: Compile Java sources
        // ════════════════════════════════════════════════════════════════════
        phase('Компиляция Java');

        // Collect all .java files from gen/ and java/
        const javaFiles = [];
        function collectJavaFiles(dir) {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) collectJavaFiles(full);
                else if (entry.name.endsWith('.java')) javaFiles.push(full);
            }
        }
        collectJavaFiles(genDir);
        collectJavaFiles(javaDir);

        if (javaFiles.length === 0) {
            throw new Error('No Java source files found');
        }

        let javacCmd = `javac -source 8 -target 8`;
        if (fs.existsSync(androidJar)) {
            javacCmd += ` -bootclasspath "${androidJar}" -classpath "${androidJar}"`;
        }
        javacCmd += ` -d "${classesDir}"`;
        javacCmd += ` ${javaFiles.map(f => `"${f}"`).join(' ')}`;

        result = run(javacCmd, { timeout: 120000 });
        if (!result.ok) {
            log(`javac failed: ${result.stderr}`, 'err');
            throw new Error('Java compilation failed');
        }
        log(`Скомпилировано файлов: ${javaFiles.length}`, 'ok');

        // ════════════════════════════════════════════════════════════════════
        // PHASE 5: Convert to DEX with d8 (r8.jar)
        // ════════════════════════════════════════════════════════════════════
        phase('Конвертация в DEX');

        const r8Jar = path.join(toolsDir, 'r8.jar');
        if (!fs.existsSync(r8Jar)) {
            throw new Error('r8.jar not found. Run setup first: webapk-setup');
        }

        // Collect all .class files
        const classFiles = [];
        function collectClassFiles(dir) {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) collectClassFiles(full);
                else if (entry.name.endsWith('.class')) classFiles.push(full);
            }
        }
        collectClassFiles(classesDir);

        if (classFiles.length === 0) {
            throw new Error('No .class files found');
        }

        const d8Cmd = `java -jar "${r8Jar}" --release --output "${dexDir}" --min-api 21 ${classFiles.map(f => `"${f}"`).join(' ')}`;
        result = run(d8Cmd, { timeout: 120000 });
        if (!result.ok) {
            log(`d8 failed: ${result.stderr}`, 'err');
            throw new Error('DEX conversion failed');
        }
        log('classes.dex создан', 'ok');

        // ════════════════════════════════════════════════════════════════════
        // PHASE 6: Package into APK
        // ════════════════════════════════════════════════════════════════════
        phase('Сборка APK');

        const unsignedApk = path.join(buildDir, 'app.unsigned.apk');

        // Copy resources.apk to unsigned.apk and add DEX
        fs.copyFileSync(resourcesApk, unsignedApk);

        // Add classes.dex into the APK
        result = run(`"${aapt2}" add "${unsignedApk}" "${path.join(dexDir, 'classes.dex')}"`);
        if (!result.ok) {
            log(`aapt2 add failed: ${result.stderr}`, 'err');
            throw new Error('APK packaging failed');
        }
        log('DEX добавлен в APK', 'ok');

        // ════════════════════════════════════════════════════════════════════
        // PHASE 7: Sign the APK
        // ════════════════════════════════════════════════════════════════════
        phase('Подпись APK');

        const keystore = path.join(toolsDir, 'debug.keystore');
        if (!fs.existsSync(keystore)) {
            throw new Error('debug.keystore not found. Run setup first.');
        }

        // Check for zipalign
        const zipalign = findBinary('zipalign', prefix);
        const alignedApk = path.join(buildDir, 'app.aligned.apk');
        const finalApk = path.join(buildDir, `${opts.appName.replace(/[^a-zA-Z0-9_\-]/g, '-')}-release.apk`);

        if (zipalign) {
            // Use zipalign before signing
            result = run(`"${zipalign}" -f 4 "${unsignedApk}" "${alignedApk}"`);
            if (!result.ok) {
                log('zipalign failed, signing without alignment', 'warn');
                fs.copyFileSync(unsignedApk, alignedApk);
            } else {
                log('APK выровнен (zipalign)', 'ok');
            }
        } else {
            fs.copyFileSync(unsignedApk, alignedApk);
            log('zipalign не найден, пропускаем выравнивание', 'warn');
        }

        // Sign with jarsigner
        result = run(`jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${keystore}" -storepass android -keypass android "${alignedApk}" androiddebugkey`, {
            timeout: 60000,
        });

        if (!result.ok) {
            log(`jarsigner failed: ${result.stderr}`, 'err');
            throw new Error('APK signing failed');
        }
        log('APK подписан (jarsigner)', 'ok');

        // ════════════════════════════════════════════════════════════════════
        // PHASE 8: Output final APK
        // ════════════════════════════════════════════════════════════════════
        phase('Завершение');

        // Copy to output directory
        const homeDir = process.env.HOME || os.homedir();
        const outputDir = path.join(homeDir);
        const outputPath = path.join(outputDir, path.basename(alignedApk));

        fs.copyFileSync(alignedApk, outputPath);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const fileSize = (fs.statSync(outputPath).size / 1024).toFixed(0);

        console.log('');
        console.log(`  ${C.green}${C.bold}╔══════════════════════════════════════════╗${C.reset}`);
        console.log(`  ${C.green}${C.bold}║${C.reset}   ${C.white}${C.bold}APK успешно собран!${C.reset}               ${C.green}${C.bold}║${C.reset}`);
        console.log(`  ${C.green}${C.bold}╚══════════════════════════════════════════╝${C.reset}`);
        console.log('');
        console.log(`  ${C.bold}Файл:${C.reset}     ${C.cyan}${outputPath}${C.reset}`);
        console.log(`  ${C.bold}Размер:${C.reset}   ${C.green}${fileSize} KB${C.reset}`);
        console.log(`  ${C.bold}Время:${C.reset}    ${C.green}${elapsed}s${C.reset}`);
        console.log('');
        log('Для установки: adb install ' + outputPath, 'info');
        console.log('');

    } catch (err) {
        console.log('');
        log(`Ошибка сборки: ${err.message}`, 'err');
        console.log('');

        // Keep build directory for debugging
        log(`Директория сборки сохранена: ${buildDir}`, 'info');
        log('Вы можете проверить файлы и повторить попытку.', 'info');

        throw err;
    }
}

// ─── Utility: find binary ────────────────────────────────────────────────────

function findBinary(name, termuxPrefix) {
    // Try PATH first
    const pathResult = run(`command -v ${name}`);
    if (pathResult.ok) return pathResult.stdout.trim();

    // Try Termux prefix
    const termuxPath = path.join(termuxPrefix, 'bin', name);
    if (fs.existsSync(termuxPath)) return termuxPath;

    return name; // Let the shell handle it
}

module.exports = { buildAPK };
