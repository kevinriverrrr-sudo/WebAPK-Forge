# 🔨 WebAPK Forge

<div align="center">

**Professional CLI Android WebView APK Builder for Termux**

Собирайте Android APK приложения из любого URL прямо на телефоне!
Build Android APK apps from any website URL directly on your device!

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D14-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Termux%20%7C%20Android-orange.svg)]()

[English](#english) | [Русский](#русский)

</div>

---

## Русский

### Что это?

**WebAPK Forge** — это CLI-утилита для Termux, которая позволяет собирать полноценные Android APK приложения с WebView из любого URL-адреса прямо на вашем Android-устройстве. **Никакого Android SDK не требуется!**

### Возможности

- 🚀 **Сборка APK из URL** — введите ссылку на сайт и получите готовый APK
- 📱 **Работает в Termux** — полный билд без ПК, без Android Studio, без SDK
- 🔧 **Без SDK** — используется минималистичный подход с aapt2 + javac + d8
- 🎨 **Fullscreen WebView** — приложения в полноэкранном режиме с поддержкой JavaScript
- 🔒 **HTTPS + HTTP** — поддержка безопасных и небезопасных соединений
- ⚡ **Быстрая сборка** — среднее время сборки 5-15 секунд
- 📦 **npm установка** — одна команда для установки

### Установка

#### Способ 1: Быстрая установка (рекомендуется)

```bash
# Склонируйте репозиторий
git clone https://github.com/kevinriverrrr-sudo/WebAPK-Forge.git
cd WebAPK-Forge

# Запустите установку (установит все зависимости Termux)
bash scripts/setup-termux.sh
```

#### Способ 2: Через npm (если опубликовано)

```bash
npm install -g webapk-forge
webapk
```

#### Способ 3: Ручная установка

```bash
# 1. Установите Termux-пакеты
pkg update && pkg upgrade -y
pkg install -y openjdk-17 aapt2 wget unzip zip nodejs

# 2. Установите CLI
git clone https://github.com/kevinriverrrr-sudo/WebAPK-Forge.git
cd webapk-forge
npm install -g .
```

### Использование

Запустите CLI:

```bash
webapk
```

Вы увидите меню:

```
  ╔══════════════════════════════════════════════╗
  ║       WebAPK Forge v1.0.0                   ║
  ║   CLI Android WebView APK Builder           ║
  ║   Powered by Termux                         ║
  ╚══════════════════════════════════════════════╝

  МЕНЮ:

  [1] 📦 Build APK       — Собрать WebView APK из URL
  [2] ⚙️ Setup            — Настройка окружения Termux
  [0] 🚪 Exit            — Выход из программы
```

### Пайплайн сборки

```
URL → AndroidManifest + MainActivity.java
  → aapt2 compile (ресурсы)
  → aapt2 link (R.java)
  → javac (Java → .class)
  → d8/r8 (.class → classes.dex)
  → aapt2 add (DEX → APK)
  → jarsigner (подпись APK)
  → Готовый APK файл!
```

### Требования

- Android 7.0+ (API 21+)
- Termux (последняя версия)
- ~200 MB свободного места

### Зависимости Termux

| Пакет | Назначение |
|-------|-----------|
| `openjdk-17` | Java компилятор (javac) |
| `aapt2` | Android Asset Packaging Tool |
| `wget` | Скачивание инструментов |
| `zip` / `unzip` | Работа с архивами |
| `nodejs` | Запуск CLI |

---

## English

### What is it?

**WebAPK Forge** is a CLI tool for Termux that builds full Android WebView APK applications from any website URL, directly on your Android device. **No Android SDK required!**

### Features

- 🚀 **Build APK from URL** — enter a website link and get a ready APK
- 📱 **Works in Termux** — full build without PC, Android Studio, or SDK
- 🔧 **No SDK** — uses a minimal approach with aapt2 + javac + d8
- 🎨 **Fullscreen WebView** — apps in fullscreen mode with JavaScript support
- 🔒 **HTTPS + HTTP** — supports both secure and insecure connections
- ⚡ **Fast builds** — average build time 5-15 seconds
- 📦 **npm install** — single command to install

### Installation

```bash
# Clone the repository
git clone https://github.com/kevinriverrrr-sudo/WebAPK-Forge.git
cd WebAPK-Forge

# Run setup (installs all Termux dependencies)
bash scripts/setup-termux.sh
```

### Usage

```bash
webapk
```

### Build Pipeline

```
URL → AndroidManifest + MainActivity.java
  → aapt2 compile (resources)
  → aapt2 link (R.java)
  → javac (Java → .class)
  → d8/r8 (.class → classes.dex)
  → aapt2 add (DEX → APK)
  → jarsigner (APK signing)
  → Ready APK file!
```

### Requirements

- Android 7.0+ (API 21+)
- Termux (latest version)
- ~200 MB free space

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Made with ❤️ for the Termux community
</div>
