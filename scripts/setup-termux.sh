#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  WebAPK Forge — Termux One-Click Setup
#  Installs all required packages and build tools
# ─────────────────────────────────────────────────────────────────────────────

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "  ${CYAN}▸${NC} $1"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
err()   { echo -e "  ${RED}✗${NC} $1"; }

echo ""
echo -e "${CYAN}${BOLD}  ╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}  ║       WebAPK Forge — Termux Setup          ║${NC}"
echo -e "${CYAN}${BOLD}  ║       One-Click Environment Installer      ║${NC}"
echo -e "${CYAN}${BOLD}  ╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Update package manager ────────────────────────────────────────────────────
log "Updating package manager..."
pkg update -y 2>/dev/null || apt update -y 2>/dev/null || true
ok "Package lists updated"

# ── Install required packages ─────────────────────────────────────────────────
PACKAGES="openjdk-17 aapt2 wget unzip zip git nodejs"

for pkg in $PACKAGES; do
    log "Installing $pkg..."
    if pkg install -y "$pkg" 2>/dev/null || apt install -y "$pkg" 2>/dev/null; then
        ok "$pkg installed"
    else
        warn "Could not install $pkg (may already be installed)"
    fi
done

echo ""

# ── Install webapk-forge globally via npm ─────────────────────────────────────
log "Installing webapk-forge CLI..."
if command -v npm &>/dev/null; then
    # Try installing from current directory first
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    if [ -f "$SCRIPT_DIR/package.json" ]; then
        npm install -g "$SCRIPT_DIR" 2>/dev/null && ok "webapk-forge installed from local" || {
            warn "Local install failed, trying npm registry..."
            npm install -g webapk-forge 2>/dev/null && ok "webapk-forge installed from npm" || warn "npm install failed"
        }
    else
        npm install -g webapk-forge 2>/dev/null && ok "webapk-forge installed from npm" || warn "npm install failed"
    fi
else
    warn "npm not found — install Node.js first: pkg install nodejs"
fi

echo ""
ok "Setup complete!"
echo ""
echo -e "  ${BOLD}Run ${CYAN}webapk${NC}${BOLD} to start building APKs${NC}"
echo ""
