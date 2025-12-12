"""Base agent class for Autonoma agents."""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from autonoma.core.config import Config
from autonoma.core.state import AgentRecord, AgentStatus, StateManager, Task, TaskStatus
from autonoma.core.wrapper import ClaudeCodeSession, SessionConfig, SessionOutput


logger = logging.getLogger(__name__)


class AgentRole(str, Enum):
    """Agent role types."""

    CEO = "CEO"
    STAFF_ENGINEER = "STAFF_ENGINEER"
    DEVELOPER = "DEVELOPER"
    QA = "QA"
    DEBUGGER = "DEBUGGER"


class AgentEvent(str, Enum):
    """Events emitted by agents."""

    STARTED = "started"
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    OUTPUT = "output"
    ERROR = "error"
    TERMINATED = "terminated"
    BUDGET_EXCEEDED = "budget_exceeded"


class TokenBudgetExceeded(Exception):
    """Raised when an agent exceeds its token budget."""

    def __init__(self, agent_id: str, used: int, budget: int):
        self.agent_id = agent_id
        self.used = used
        self.budget = budget
        super().__init__(
            f"Agent {agent_id} exceeded token budget: {used:,} > {budget:,}"
        )


class BaseAgent(ABC):
    """Base class for all Autonoma agents."""

    role: AgentRole
    default_system_prompt: str = ""

    # Token budget (0 = unlimited). Subclasses can override.
    token_budget: int = 0

    def __init__(
        self,
        agent_id: str,
        config: Config,
        state_manager: StateManager,
        working_dir: Path | None = None,
    ):
        """Initialize the agent."""
        self.agent_id = agent_id
        self.config = config
        self.state_manager = state_manager
        self.working_dir = working_dir or config.project_root

        self._session: ClaudeCodeSession | None = None
        self._running = False
        self._event_handlers: dict[AgentEvent, list[Callable[..., Any]]] = {
            event: [] for event in AgentEvent
        }
        self._record: AgentRecord | None = None

    @property
    def is_running(self) -> bool:
        """Check if agent is running."""
        return self._running

    @property
    def total_tokens(self) -> int:
        """Get total tokens used by this agent."""
        return self._session.total_tokens if self._session else 0

    def on(self, event: AgentEvent, handler: Callable[..., Any]) -> None:
        """Register an event handler."""
        self._event_handlers[event].append(handler)

    def _emit(self, event: AgentEvent, **kwargs: Any) -> None:
        """Emit an event to all handlers."""
        for handler in self._event_handlers[event]:
            try:
                handler(agent_id=self.agent_id, event=event, **kwargs)
            except Exception as e:
                logger.error(f"Event handler error: {e}")

    def _get_session_config(self) -> SessionConfig:
        """Get the session configuration for this agent."""
        return SessionConfig(
            model=self.config.claude_model,
            system_prompt=self.get_system_prompt(),
            working_dir=self.working_dir,
            timeout=self.config.agent_timeout,
            dangerously_skip_permissions=self.config.dangerously_skip_permissions,
        )

    def get_system_prompt(self) -> str:
        """Get the system prompt for this agent. Override in subclasses."""
        return self.default_system_prompt

    async def start(self) -> None:
        """Start the agent session."""
        if self._running:
            raise RuntimeError(f"Agent {self.agent_id} already running")

        logger.info(f"Starting agent {self.agent_id} ({self.role.value})")

        # Register agent in state
        self._record = AgentRecord(
            agent_id=self.agent_id,
            agent_type=self.role.value,
            status=AgentStatus.RUNNING,
            started_at=datetime.utcnow(),
        )
        await self.state_manager.register_agent(self._record)

        # Create and start session
        session_config = self._get_session_config()
        self._session = ClaudeCodeSession(
            agent_id=self.agent_id,
            config=session_config,
            max_retries=self.config.max_retries,
            backoff_base=self.config.retry_backoff_base,
        )

        # Add output callback
        self._session.add_output_callback(self._on_session_output)

        await self._session.start()
        self._running = True

        self._emit(AgentEvent.STARTED)

    async def stop(self) -> None:
        """Stop the agent session."""
        if not self._running:
            return

        logger.info(f"Stopping agent {self.agent_id}")

        if self._session:
            await self._session.stop()
            self._session = None

        self._running = False

        # Update state
        await self.state_manager.update_agent_status(
            self.agent_id, AgentStatus.TERMINATED
        )

        self._emit(AgentEvent.TERMINATED)

    def _on_session_output(self, line: str) -> None:
        """Handle session output."""
        # Skip empty lines
        if not line.strip():
            return

        self._emit(AgentEvent.OUTPUT, line=line)

        # Log to state (truncate very long lines)
        message = line[:500] if len(line) > 500 else line
        asyncio.create_task(
            self.state_manager.log(self.agent_id, message, level="OUTPUT")
        )

    async def execute_prompt(self, prompt: str) -> SessionOutput:
        """Execute a prompt on this agent's session."""
        if not self._session:
            raise RuntimeError(f"Agent {self.agent_id} not started")

        # Check budget BEFORE executing (fail fast)
        if self.token_budget > 0 and self.total_tokens >= self.token_budget:
            self._emit(AgentEvent.BUDGET_EXCEEDED, used=self.total_tokens, budget=self.token_budget)
            raise TokenBudgetExceeded(self.agent_id, self.total_tokens, self.token_budget)

        logger.debug(f"[{self.agent_id}] Executing prompt")

        output = await self._session.execute(prompt)

        # Update token usage
        if output.tokens_used > 0:
            await self.state_manager.update_agent_tokens(
                self.agent_id, output.tokens_used
            )

        # Check budget AFTER executing (warn but return result)
        if self.token_budget > 0 and self.total_tokens > self.token_budget:
            logger.warning(
                f"[{self.agent_id}] Token budget exceeded: {self.total_tokens:,} > {self.token_budget:,}"
            )
            self._emit(AgentEvent.BUDGET_EXCEEDED, used=self.total_tokens, budget=self.token_budget)

        return output

    @abstractmethod
    async def run(self, input_data: Any) -> Any:
        """Run the agent's main logic. Override in subclasses."""
        pass

    async def __aenter__(self) -> "BaseAgent":
        """Async context manager entry."""
        await self.start()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.stop()


class SubAgent(BaseAgent):
    """Base class for sub-agents spawned by other agents."""

    parent_agent_id: str | None = None

    def __init__(
        self,
        agent_id: str,
        config: Config,
        state_manager: StateManager,
        parent_agent_id: str | None = None,
        working_dir: Path | None = None,
    ):
        """Initialize the sub-agent."""
        super().__init__(agent_id, config, state_manager, working_dir)
        self.parent_agent_id = parent_agent_id


def create_xml_prompt(
    role: str,
    task: str,
    guidelines: list[str],
    examples: list[str] | None = None,
    context: dict[str, str] | None = None,
) -> str:
    """Create an XML-structured prompt for Claude."""
    lines = [f"<role>{role}</role>"]

    if context:
        lines.append("<context>")
        for key, value in context.items():
            lines.append(f"  <{key}>{value}</{key}>")
        lines.append("</context>")

    lines.append(f"<task>{task}</task>")

    lines.append("<guidelines>")
    for guideline in guidelines:
        lines.append(f"  - {guideline}")
    lines.append("</guidelines>")

    if examples:
        lines.append("<examples>")
        for example in examples:
            lines.append(f"  {example}")
        lines.append("</examples>")

    return "\n".join(lines)
