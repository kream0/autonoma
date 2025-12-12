"""Tests for configuration management."""

import pytest
from pathlib import Path
import tempfile

from autonoma.core.config import Config


def test_default_config():
    """Test default configuration values."""
    config = Config()

    assert config.claude_model == "claude-opus-4-5-20251101"
    assert config.max_workers == 5
    assert config.max_retries == 3
    assert config.sandbox_enabled is True


def test_config_paths():
    """Test path generation."""
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        config = Config(project_root=root)

        assert config.logs_dir == root / ".autonoma" / "logs"
        assert config.worktrees_dir == root / ".autonoma" / "worktrees"
        assert config.state_db_path == root / ".autonoma" / "state.db"


def test_ensure_dirs():
    """Test directory creation."""
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        config = Config(project_root=root)

        config.ensure_dirs()

        assert config.logs_dir.exists()
        assert config.worktrees_dir.exists()
        assert config.mcp_dir.exists()


def test_agent_log_path():
    """Test agent log path generation."""
    config = Config()

    log_path = config.get_agent_log_path("ceo-001")

    assert "ceo-001.log" in str(log_path)


def test_worktree_path():
    """Test worktree path generation."""
    config = Config()

    worktree_path = config.get_worktree_path("T123")

    assert "task-T123" in str(worktree_path)


def test_config_to_dict():
    """Test config serialization."""
    config = Config()

    config_dict = config.to_dict()

    assert "project_root" in config_dict
    assert "claude_model" in config_dict
    assert "max_workers" in config_dict
