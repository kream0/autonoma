"""Pytest configuration and shared fixtures for Autonoma tests."""
from __future__ import annotations

import asyncio
import json
import os
import signal
import tempfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from autonoma.core.config import Config
from autonoma.core.state import StateManager, AgentStatus, TaskStatus, Milestone, Task
from autonoma.core.wrapper import SessionOutput, SessionConfig, StopReason


# ============================================================================
# Mock Session Output Builder
# ============================================================================

@dataclass
class MockResponse:
    """Builder for mock Claude responses."""
    text: str
    tokens: int = 500
    stop_reason: StopReason = StopReason.END_TURN
    delay: float = 0.01  # Simulate processing time

    def to_output(self) -> SessionOutput:
        return SessionOutput(
            text=self.text,
            stop_reason=self.stop_reason,
            tokens_used=self.tokens,
            timestamp=datetime.utcnow(),
        )


# ============================================================================
# Mock Claude Code Session
# ============================================================================

class MockClaudeCodeSession:
    """Mock Claude Code session that doesn't use real tokens.

    Matches the interface of autonoma.core.wrapper.ClaudeCodeSession.
    Responses are configurable via `response_queue` or `response_factory`.
    """

    def __init__(
        self,
        agent_id: str = "mock-agent",
        config: SessionConfig | None = None,
        max_retries: int = 3,
        backoff_base: float = 2.0,
        response_queue: list[MockResponse] | None = None,
        response_factory: Callable[[str], MockResponse] | None = None,
    ):
        # Match ClaudeCodeSession interface
        self.agent_id = agent_id
        self.config = config or SessionConfig()
        self.max_retries = max_retries
        self.backoff_base = backoff_base

        # Mock-specific state
        self._response_queue = list(response_queue) if response_queue else []
        self._response_factory = response_factory
        self._started = False
        self._terminated = False
        self._prompts_received: list[str] = []
        self._output_callbacks: list[Callable[[str], None]] = []
        self._total_tokens = 0

        # For simulating failures
        self._fail_on_prompt: int | None = None
        self._fail_with: Exception | None = None
        self._hang_on_prompt: int | None = None

    def add_output_callback(self, callback: Callable[[str], None]) -> None:
        """Add a callback for output events (matches ClaudeCodeSession interface)."""
        self._output_callbacks.append(callback)

    def _emit_output(self, line: str) -> None:
        """Emit output to all callbacks."""
        for callback in self._output_callbacks:
            try:
                callback(line)
            except Exception:
                pass

    async def start(self) -> None:
        """Start the mock session."""
        if self._terminated:
            raise RuntimeError("Cannot start terminated session")
        await asyncio.sleep(0.01)  # Simulate startup
        self._started = True

    async def execute(self, prompt: str) -> SessionOutput:
        """Execute a prompt and return mock response."""
        if not self._started:
            raise RuntimeError("Session not started")
        if self._terminated:
            raise RuntimeError("Session terminated")

        self._prompts_received.append(prompt)
        prompt_num = len(self._prompts_received)

        # Check for simulated failures
        if self._fail_on_prompt == prompt_num:
            if self._fail_with:
                raise self._fail_with
            raise RuntimeError(f"Simulated failure on prompt {prompt_num}")

        # Check for simulated hang (for interrupt testing)
        if self._hang_on_prompt == prompt_num:
            await asyncio.sleep(3600)  # Hang for an hour (will be cancelled)

        # Get response
        if self._response_queue:
            response = self._response_queue.pop(0)
        elif self._response_factory:
            response = self._response_factory(prompt)
        else:
            response = MockResponse(text="Default mock response")

        # Simulate processing time
        await asyncio.sleep(response.delay)

        # Emit output to all callbacks
        for line in response.text.split('\n'):
            if line.strip():
                self._emit_output(line)

        output = response.to_output()
        self._total_tokens += output.tokens_used
        return output

    async def stop(self) -> None:
        """Stop the mock session."""
        self._terminated = True
        await asyncio.sleep(0.01)

    @property
    def total_tokens(self) -> int:
        """Get total tokens used (matches ClaudeCodeSession interface)."""
        return self._total_tokens

    @property
    def is_alive(self) -> bool:
        """Check if session is alive (matches ClaudeCodeSession interface)."""
        return self._started and not self._terminated

    # Test helpers
    def simulate_failure(self, on_prompt: int, exception: Exception | None = None):
        """Configure session to fail on specific prompt number."""
        self._fail_on_prompt = on_prompt
        self._fail_with = exception

    def simulate_hang(self, on_prompt: int):
        """Configure session to hang on specific prompt (for interrupt testing)."""
        self._hang_on_prompt = on_prompt

    @property
    def prompts(self) -> list[str]:
        """Get all prompts received."""
        return self._prompts_received.copy()


# ============================================================================
# Response Factories for Different Agent Types
# ============================================================================

def ceo_response_factory(prompt: str) -> MockResponse:
    """Generate CEO planning response."""
    plan = {
        "project_name": "Test Project",
        "tech_stack": {
            "language": "TypeScript",
            "framework": "React",
            "database": "PostgreSQL"
        },
        "milestones": [
            {
                "id": "M1",
                "name": "Setup & Foundation",
                "phase": 1,
                "description": "Project setup and basic structure",
                "tasks": [
                    {"id": "T1.1", "description": "Initialize project", "dependencies": [], "estimated_complexity": "low"},
                    {"id": "T1.2", "description": "Setup database", "dependencies": ["T1.1"], "estimated_complexity": "medium"},
                ]
            },
            {
                "id": "M2",
                "name": "Core Features",
                "phase": 2,
                "description": "Implement core functionality",
                "tasks": [
                    {"id": "T2.1", "description": "User authentication", "dependencies": ["T1.2"], "estimated_complexity": "high"},
                    {"id": "T2.2", "description": "API endpoints", "dependencies": ["T1.2"], "estimated_complexity": "medium"},
                ]
            }
        ]
    }
    return MockResponse(text=json.dumps(plan), tokens=1500)


def staff_engineer_response_factory(prompt: str) -> MockResponse:
    """Generate Staff Engineer task decomposition response."""
    tasks = [
        {
            "id": "T1.1",
            "description": "Initialize project with package.json and tsconfig",
            "dependencies": [],
            "estimated_complexity": "low",
            "acceptance_criteria": ["package.json exists", "tsconfig.json exists"]
        },
        {
            "id": "T1.2",
            "description": "Setup database schema and migrations",
            "dependencies": ["T1.1"],
            "estimated_complexity": "medium",
            "acceptance_criteria": ["Schema file created", "Migration runs successfully"]
        }
    ]
    return MockResponse(text=json.dumps(tasks), tokens=800)


def developer_response_factory(prompt: str) -> MockResponse:
    """Generate Developer implementation response."""
    return MockResponse(
        text="Implemented the feature successfully.\n\n[TASK_COMPLETE]",
        tokens=2000
    )


def qa_response_factory(prompt: str) -> MockResponse:
    """Generate QA review response."""
    if "review" in prompt.lower():
        return MockResponse(
            text="Code review passed. All tests passing.\n\n[APPROVED]",
            tokens=500
        )
    return MockResponse(text="QA check completed", tokens=300)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def temp_project_dir():
    """Create a temporary project directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir) / "test_project"
        project_dir.mkdir()

        # Create basic project structure
        autonoma_dir = project_dir / ".autonoma"
        autonoma_dir.mkdir()
        (autonoma_dir / "logs").mkdir()
        (autonoma_dir / "worktrees").mkdir()

        # Create requirements file
        (project_dir / "requirements.md").write_text("""
# Test Requirements
Build a simple REST API with user authentication.
        """)

        yield project_dir


@pytest.fixture
def config(temp_project_dir):
    """Create a Config instance for testing."""
    return Config(project_root=temp_project_dir)


@pytest_asyncio.fixture
async def state_manager(config):
    """Create and connect a StateManager."""
    manager = StateManager(config.state_db_path)
    await manager.connect()
    yield manager
    await manager.close()


@pytest.fixture
def mock_session_class():
    """Provide MockClaudeCodeSession class for patching."""
    return MockClaudeCodeSession


@pytest.fixture
def mock_ceo_session():
    """Create a mock session configured for CEO agent."""
    return MockClaudeCodeSession(response_factory=ceo_response_factory)


@pytest.fixture
def mock_staff_session():
    """Create a mock session configured for Staff Engineer."""
    return MockClaudeCodeSession(response_factory=staff_engineer_response_factory)


@pytest.fixture
def mock_developer_session():
    """Create a mock session configured for Developer."""
    return MockClaudeCodeSession(response_factory=developer_response_factory)


@pytest.fixture
def mock_qa_session():
    """Create a mock session configured for QA."""
    return MockClaudeCodeSession(response_factory=qa_response_factory)


# ============================================================================
# Interrupt Simulation Helpers
# ============================================================================

class InterruptSimulator:
    """Helper to simulate interrupts at specific points."""

    def __init__(self):
        self._interrupt_after: float | None = None
        self._interrupt_task: asyncio.Task | None = None

    async def schedule_interrupt(self, delay: float):
        """Schedule a KeyboardInterrupt after delay seconds."""
        self._interrupt_after = delay

        async def _send_interrupt():
            await asyncio.sleep(delay)
            os.kill(os.getpid(), signal.SIGINT)

        self._interrupt_task = asyncio.create_task(_send_interrupt())

    def cancel(self):
        """Cancel scheduled interrupt."""
        if self._interrupt_task:
            self._interrupt_task.cancel()


@pytest.fixture
def interrupt_simulator():
    """Provide interrupt simulator."""
    sim = InterruptSimulator()
    yield sim
    sim.cancel()


# ============================================================================
# Async Test Helpers
# ============================================================================

@pytest.fixture
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
