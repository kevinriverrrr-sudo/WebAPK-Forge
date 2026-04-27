/**
 * WebAPK Forge — Main CLI Module
 * Interactive menu-driven CLI for building Android WebView APKs in Termux
 */

const readline = require('readline');
const path = require('path');
const { setupEnvironment, checkEnvironment } = require('./setup');
const { buildAPK } = require('./builder');

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    white:   '\x1b[37m',
    bgBlue:  '\x1b[44m',
    bgGreen: '\x1b[42m',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function banner() {
    const lines = [
        '',
        `${C.cyan}${C.bold}  ╔══════════════════════════════════════════════╗${C.reset}`,
        `${C.cyan}${C.bold}  ║${C.reset}       ${C.white}${C.bold}WebAPK Forge v1.0.0${C.reset}               ${C.cyan}${C.bold}║${C.reset}`,
        `${C.cyan}${C.bold}  ║${C.reset}   ${C.dim}CLI Android WebView APK Builder${C.reset}         ${C.cyan}${C.bold}║${C.reset}`,
        `${C.cyan}${C.bold}  ║${C.reset}   ${C.dim}Powered by Termux${C.reset}                       ${C.cyan}${C.bold}║${C.reset}`,
        `${C.cyan}${C.bold}  ╚══════════════════════════════════════════════╝${C.reset}`,
        '',
    ];
    lines.forEach(l => console.log(l));
}

function menu() {
    const items = [
        { key: '1', label: 'Build APK',       icon: '📦', desc: 'Собрать WebView APK из URL' },
        { key: '2', label: 'Setup',           icon: '⚙️',  desc: 'Настройка окружения Termux' },
        { key: '0', label: 'Exit',            icon: '🚪', desc: 'Выход из программы' },
    ];

    console.log(`${C.bold}  МЕНЮ:${C.reset}\n`);
    items.forEach(item => {
        console.log(
            `  ${C.cyan}[${item.key}]${C.reset} ${item.icon}  ${C.bold}${item.label}${C.reset}  ${C.dim}— ${item.desc}${C.reset}`
        );
    });
    console.log('');
}

// ─── Readline wrapper (Promise-based) ────────────────────────────────────────

function createRL() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

function question(rl, prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionBuild(rl) {
    console.log(`\n${C.yellow}${C.bold}  ═══ Режим сборки APK ═══${C.reset}\n`);

    // URL
    let url = await question(rl, `  ${C.cyan}🌐 Введите URL сайта:${C.reset} `);
    url = url.trim();
    if (!url) {
        console.log(`\n  ${C.red}✗ URL не может быть пустым!${C.reset}\n`);
        return;
    }
    // Auto-add https:// if missing
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }

    // App name
    const defaultName = extractAppName(url);
    let appName = await question(rl, `  ${C.cyan}📝 Имя приложения${C.dim} [${defaultName}]:${C.reset} `);
    appName = (appName.trim() || defaultName).replace(/[^a-zA-Z0-9_\- ]/g, '');

    // Package name
    const pkgDefault = 'com.webapk.' + appName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let pkgName = await question(rl, `  ${C.cyan}📦 Имя пакета${C.dim} [${pkgDefault}]:${C.reset} `);
    pkgName = (pkgName.trim() || pkgDefault).replace(/[^a-z0-9.]/g, '');

    // Version
    let version = await question(rl, `  ${C.cyan}🔢 Версия${C.dim} [1.0]:${C.reset} `);
    version = version.trim() || '1.0';

    console.log('');
    console.log(`  ${C.bold}Параметры сборки:${C.reset}`);
    console.log(`  URL:     ${C.green}${url}${C.reset}`);
    console.log(`  Имя:     ${C.green}${appName}${C.reset}`);
    console.log(`  Пакет:   ${C.green}${pkgName}${C.reset}`);
    console.log(`  Версия:  ${C.green}${version}${C.reset}`);
    console.log('');

    const confirm = await question(rl, `  ${C.yellow}Начать сборку? (y/N):${C.reset} `);
    if (confirm.trim().toLowerCase() !== 'y') {
        console.log(`\n  ${C.dim}Сборка отменена.${C.reset}\n`);
        return;
    }

    console.log('');
    await buildAPK({ url, appName, pkgName, version });
}

async function actionSetup(rl) {
    console.log(`\n${C.yellow}${C.bold}  ═══ Настройка окружения ═══${C.reset}\n`);
    await setupEnvironment();
}

function extractAppName(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        // Capitalize each word
        return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1) + ' App';
    } catch {
        return 'MyApp';
    }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function main() {
    banner();

    const rl = createRL();

    while (true) {
        menu();
        const choice = await question(rl, `  ${C.bold}Выберите действие:${C.reset} `);

        switch (choice.trim()) {
            case '1':
                // Quick env check before build
                const envOk = await checkEnvironment();
                if (!envOk) {
                    console.log(`\n  ${C.red}✗ Окружение не настроено. Выберите [2] Setup для настройки.${C.reset}\n`);
                    break;
                }
                await actionBuild(rl);
                break;
            case '2':
                await actionSetup(rl);
                break;
            case '0':
            case 'q':
            case 'exit':
                console.log(`\n  ${C.cyan}До свидания!${C.reset}\n`);
                rl.close();
                process.exit(0);
            default:
                console.log(`\n  ${C.red}✗ Неизвестная команда. Выберите 1, 2 или 0.${C.reset}\n`);
        }
    }
}

// ─── Start ───────────────────────────────────────────────────────────────────

main().catch(err => {
    console.error(`\n${C.red}Fatal error: ${err.message}${C.reset}`);
    console.error(err.stack);
    process.exit(1);
});
