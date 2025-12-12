.PHONY: install dev test lint format clean desktop build help

# Default target
help:
	@echo "Autonoma - Autonomous Agentic Orchestration"
	@echo ""
	@echo "Available targets:"
	@echo "  install     Install production dependencies"
	@echo "  dev         Install development dependencies"
	@echo "  test        Run tests"
	@echo "  lint        Run linting checks"
	@echo "  format      Format code"
	@echo "  clean       Clean build artifacts"
	@echo "  desktop     Build desktop application"
	@echo "  build       Build Python package"

# Install production dependencies
install:
	pip install -e .

# Install development dependencies
dev:
	pip install -e ".[dev]"

# Run tests
test:
	pytest tests/ -v --cov=autonoma --cov-report=term-missing

# Run linting
lint:
	ruff check autonoma/ tests/
	mypy autonoma/

# Format code
format:
	ruff check --fix autonoma/ tests/
	ruff format autonoma/ tests/

# Clean build artifacts
clean:
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf .pytest_cache/
	rm -rf .mypy_cache/
	rm -rf .ruff_cache/
	rm -rf htmlcov/
	rm -rf desktop/dist/
	rm -rf desktop/node_modules/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

# Build desktop application
desktop:
	@echo "Building desktop application..."
	cd desktop && bun install && bun run build

# Build desktop for specific platform
desktop-mac:
	cd desktop && bun install && bun run build:mac

desktop-win:
	cd desktop && bun install && bun run build:win

desktop-linux:
	cd desktop && bun install && bun run build:linux

# Build Python package
build:
	python -m build

# Initialize a demo project
demo-init:
	mkdir -p demo
	cd demo && autonoma init

# Run with demo
demo-run:
	cd demo && autonoma start ../examples/simple-api.md --no-tui
