#!/bin/bash
#
# Autonoma Installation Script
# Installs Autonoma globally using Bun
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory (where autonoma source is)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║           AUTONOMA INSTALLER                      ║"
    echo "║   Claude Code Multi-Agent Orchestrator            ║"
    echo "╚═══════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_bun() {
    echo -e "${YELLOW}Checking for Bun...${NC}"
    if ! command -v bun &> /dev/null; then
        echo -e "${RED}Error: Bun is not installed.${NC}"
        echo ""
        echo "Please install Bun first:"
        echo "  curl -fsSL https://bun.sh/install | bash"
        echo ""
        echo "Or visit: https://bun.sh"
        exit 1
    fi

    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✓ Bun found: v${BUN_VERSION}${NC}"
}

check_claude_code() {
    echo -e "${YELLOW}Checking for Claude Code CLI...${NC}"
    if ! command -v claude &> /dev/null; then
        echo -e "${YELLOW}⚠ Warning: 'claude' command not found.${NC}"
        echo "  Autonoma requires Claude Code CLI to function."
        echo "  Install it from: https://claude.ai/claude-code"
        echo ""
        read -p "Continue installation anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Claude Code CLI found${NC}"
    fi
}

install_dependencies() {
    echo -e "${YELLOW}Installing dependencies...${NC}"
    cd "$SCRIPT_DIR"
    bun install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
}

link_globally() {
    echo -e "${YELLOW}Linking Autonoma globally...${NC}"
    cd "$SCRIPT_DIR"
    bun link
    echo -e "${GREEN}✓ Autonoma linked globally${NC}"
}

verify_installation() {
    echo -e "${YELLOW}Verifying installation...${NC}"

    # Check if autonoma command exists
    if command -v autonoma &> /dev/null; then
        echo -e "${GREEN}✓ 'autonoma' command is available${NC}"
    else
        # Try adding bun's global bin to PATH hint
        echo -e "${YELLOW}⚠ 'autonoma' not in PATH yet.${NC}"
        echo ""
        echo "Add this to your ~/.bashrc or ~/.zshrc:"
        echo ""
        echo "  export PATH=\"\$HOME/.bun/bin:\$PATH\""
        echo ""
        echo "Then restart your terminal or run:"
        echo "  source ~/.bashrc  # or ~/.zshrc"
        return
    fi

    # Show version/help
    echo ""
    autonoma --help | head -15
}

uninstall() {
    echo -e "${YELLOW}Uninstalling Autonoma...${NC}"
    cd "$SCRIPT_DIR"
    bun unlink 2>/dev/null || true
    echo -e "${GREEN}✓ Autonoma unlinked${NC}"
    echo ""
    echo "Note: Source files remain in ${SCRIPT_DIR}"
    echo "Delete that directory manually if you want to remove completely."
}

show_usage() {
    echo "Usage: ./install.sh [command]"
    echo ""
    echo "Commands:"
    echo "  install     Install Autonoma globally (default)"
    echo "  uninstall   Remove global Autonoma link"
    echo "  update      Reinstall with latest dependencies"
    echo "  help        Show this help"
}

main() {
    local command="${1:-install}"

    case "$command" in
        install)
            print_banner
            check_bun
            check_claude_code
            install_dependencies
            link_globally
            echo ""
            verify_installation
            echo ""
            echo -e "${GREEN}Installation complete!${NC}"
            echo ""
            echo "Quick start:"
            echo "  cd your-project"
            echo "  autonoma start requirements.md"
            echo ""
            echo "For help:"
            echo "  autonoma --help"
            echo "  cat docs/HOW_TO_USE.md"
            ;;
        uninstall)
            print_banner
            uninstall
            ;;
        update)
            print_banner
            check_bun
            install_dependencies
            link_globally
            echo -e "${GREEN}Update complete!${NC}"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
