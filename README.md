# 🔨 WebAPK Forge

<div align="center">

**Professional CLI Android WebView APK Builder for Termux**

Build Android WebView APK apps from any website URL — directly on your phone!

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D14-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Termux%20%7C%20Android-orange.svg)]()
[![No SDK](https://img.shields.io/badge/No%20Android%20SDK-required-red.svg)]()

</div>

---

## Установка (через npm)

### Шаг 1 — Установи Termux-зависимости

```bash
pkg update -y
pkg install -y openjdk-17 aapt2 nodejs
```

### Шаг 2 — Установи WebAPK Forge

```bash
npm install -g kevinriverrrr-sudo/WebAPK-Forge
```

### Шаг 3 — Запусти

```bash
webapk
```

При первом запуске выбери **[2] Setup** — он скачает r8.jar и создаст android.jar автоматически.

**Всё!** Теперь выбирай **[1] Build APK**, вводи URL сайта и получай готовый APK файл.

---

## English

### Install (via npm)

```bash
# 1. Termux dependencies
pkg update -y && pkg install -y openjdk-17 aapt2 nodejs

# 2. Install WebAPK Forge
npm install -g kevinriverrrr-sudo/WebAPK-Forge

# 3. Run
webapk
```

First run: select **[2] Setup** to download build tools (r8.jar, android.jar, keystore).

Then select **[1] Build APK**, enter any URL, and get a signed APK file.

---

## CLI Menu

```
  ╔══════════════════════════════════════════════╗
  ║       WebAPK Forge v1.0.0                   ║
  ║   CLI Android WebView APK Builder           ║
  ║   Powered by Termux                         ║
  ╚══════════════════════════════════════════════╝

  [1] 📦 Build APK   — Собрать WebView APK из URL
  [2] ⚙️ Setup        — Настройка окружения Termux
  [0] 🚪 Exit         — Выход
```

---

## How It Works (No Android SDK!)

```
URL → AndroidManifest + MainActivity.java
  → aapt2 compile   (resources → compiled_res.zip)
  → aapt2 link      (→ resources.apk + R.java)
  → javac           (Java sources → .class files)
  → d8 / r8         (.class → classes.dex)
  → aapt2 add       (DEX packed into APK)
  → jarsigner       (debug signature)
  → Ready .apk file!
```

**Instead of Android SDK (~5 GB), we use:**
| Tool | Size | Source |
|------|------|--------|
| aapt2 | ~3 MB | `pkg install aapt2` |
| javac | ~50 MB | `pkg install openjdk-17` |
| r8.jar (d8) | ~15 MB | Auto-downloaded to `~/.webapk-forge/` |
| android.jar | ~20 KB | Auto-generated from stubs |
| debug.keystore | ~2 KB | Auto-generated |

---

## Features

- 🚀 **Build APK from any URL** — enter a link, get a signed APK
- 📱 **Works in Termux** — no PC, no Android Studio, no SDK
- 🔧 **One-command install** — `npm install -g` and done
- 🎨 **Fullscreen WebView** — immersive mode, JavaScript enabled
- 🔒 **HTTP + HTTPS** — network security config included
- ⚡ **Fast builds** — average 5-15 seconds
- 💾 **Persistent tools** — downloaded once to `~/.webapk-forge/`

---

## Requirements

- Android 7.0+ (API 21+)
- Termux (latest)
- Node.js >= 14
- ~200 MB free space

---

## Directory Layout

After `npm install -g`, tools are stored in your home directory:

```
~/.webapk-forge/
  └── tools/
        ├── r8.jar          ← d8 compiler (auto-downloaded)
        ├── android.jar     ← Android API stubs (auto-generated)
        └── debug.keystore  ← APK signing key (auto-generated)
```

These persist across reinstalls — you never download them twice.

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  Made for the Termux community
</div>
