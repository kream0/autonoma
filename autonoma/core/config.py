"""Configuration management for Autonoma."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    """Autonoma configuration settings."""

    model_config = SettingsConfigDict(
        env_prefix="AUTONOMA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Project paths
    project_root: Path = Field(default_factory=Path.cwd)
    autonoma_dir: Path = Field(default=Path(".autonoma"))

    # Claude Code settings
    claude_model: str = Field(default="claude-opus-4-5-20251101")
    claude_code_path: str = Field(default="claude")

    # Agent settings
    max_workers: int = Field(default=5, ge=1, le=10)
    max_retries: int = Field(default=3, ge=1, le=5)
    retry_backoff_base: float = Field(default=2.0)

    # Timeout settings (in seconds)
    task_timeout: int = Field(default=600)
    agent_timeout: int = Field(default=300)

    # Safety settings
    dangerously_skip_permissions: bool = Field(default=False)
    sandbox_enabled: bool = Field(default=True)

    # TUI settings
    refresh_rate: float = Field(default=0.5)
    log_level: str = Field(default="INFO")

    @property
    def logs_dir(self) -> Path:
        """Get the logs directory path."""
        return self.project_root / self.autonoma_dir / "logs"

    @property
    def worktrees_dir(self) -> Path:
        """Get the worktrees directory path."""
        return self.project_root / self.autonoma_dir / "worktrees"

    @property
    def mcp_dir(self) -> Path:
        """Get the MCP temp directory path."""
        return self.project_root / self.autonoma_dir / "mcp"

    @property
    def state_db_path(self) -> Path:
        """Get the state database path."""
        return self.project_root / self.autonoma_dir / "state.db"

    @property
    def claude_md_path(self) -> Path:
        """Get the CLAUDE.md file path."""
        return self.project_root / self.autonoma_dir / "CLAUDE.md"

    @property
    def plan_json_path(self) -> Path:
        """Get the plan.json file path."""
        return self.project_root / self.autonoma_dir / "plan.json"

    def ensure_dirs(self) -> None:
        """Create necessary directories if they don't exist."""
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.worktrees_dir.mkdir(parents=True, exist_ok=True)
        self.mcp_dir.mkdir(parents=True, exist_ok=True)

    def get_agent_log_path(self, agent_id: str) -> Path:
        """Get the log file path for an agent."""
        return self.logs_dir / f"{agent_id}.log"

    def get_worktree_path(self, task_id: str) -> Path:
        """Get the worktree path for a task."""
        return self.worktrees_dir / f"task-{task_id}"

    def to_dict(self) -> dict[str, Any]:
        """Convert config to dictionary."""
        return {
            "project_root": str(self.project_root),
            "autonoma_dir": str(self.autonoma_dir),
            "claude_model": self.claude_model,
            "max_workers": self.max_workers,
            "max_retries": self.max_retries,
            "task_timeout": self.task_timeout,
            "sandbox_enabled": self.sandbox_enabled,
        }
