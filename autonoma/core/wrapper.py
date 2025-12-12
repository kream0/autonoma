"""Claude Code PTY wrapper for Autonoma."""
from __future__ import annotations

import asyncio
import logging
import os
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable


logger = logging.getLogger(__name__)


class SessionState(str, Enum):
    """Claude Code session state."""

    STARTING = "STARTING"
    READY = "READY"
    PROCESSING = "PROCESSING"
    WAITING_INPUT = "WAITING_INPUT"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"
    TERMINATED = "TERMINATED"


class StopReason(str, Enum):
    """Reason why Claude stopped generating."""

    END_TURN = "end_turn"
    PAUSE_TURN = "pause_turn"
    TOOL_USE = "tool_use"
    MAX_TOKENS = "max_tokens"
    RATE_LIMIT = "rate_limit"
    ERROR = "error"
    TIMEOUT = "timeout"
    USER_INTERRUPT = "user_interrupt"


@dataclass
class SessionOutput:
    """Output from a Claude Code session."""

    text: str
    stop_reason: StopReason | None = None
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    tokens_used: int = 0
    timestamp: datetime = field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SessionConfig:
    """Configuration for a Claude Code session."""

    model: str = "claude-opus-4-5-20251101"
    system_prompt: str | None = None
    append_system_prompt: str | None = None
    working_dir: Path | None = None
    timeout: int = 300
    dangerously_skip_permissions: bool = False
    print_output: bool = False
    allowedTools: list[str] | None = None
    disallowedTools: list[str] | None = None
    mcp_config: dict[str, Any] | None = None


class ClaudeCodeWrapper:
    """Wrapper for Claude Code CLI using subprocess for automation."""

    # Patterns for parsing output
    TASK_COMPLETE_PATTERN = re.compile(r"\[TASK_COMPLETE\]")
    ERROR_PATTERN = re.compile(r"(?:Error|Exception|FAILED):", re.IGNORECASE)
    RATE_LIMIT_PATTERN = re.compile(r"rate.?limit|too many requests", re.IGNORECASE)
    TOOL_CALL_PATTERN = re.compile(r"Tool:\s*(\w+)")
    # Match various token output formats from Claude CLI
    TOKEN_PATTERN = re.compile(r"(?:tokens?|usage|input|output)[\s:]+(\d[\d,]+)", re.IGNORECASE)
    # Match cost/usage summary lines
    USAGE_PATTERN = re.compile(r"(\d[\d,]+)\s+(?:input|output|total)\s+tokens?", re.IGNORECASE)

    def __init__(
        self,
        config: SessionConfig,
        agent_id: str,
        on_output: Callable[[str], None] | None = None,
    ):
        """Initialize the Claude Code wrapper."""
        self.config = config
        self.agent_id = agent_id
        self.on_output = on_output

        self._state = SessionState.STARTING
        self._output_buffer: list[str] = []
        self._total_tokens = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> SessionState:
        """Get current session state."""
        return self._state

    @property
    def total_tokens(self) -> int:
        """Get total tokens used in this session."""
        return self._total_tokens

    @property
    def is_alive(self) -> bool:
        """Check if wrapper is ready."""
        return self._state in (SessionState.READY, SessionState.PROCESSING)

    def _build_command(self, prompt: str) -> list[str]:
        """Build the Claude Code CLI command."""
        cmd = ["claude", "--model", self.config.model]

        if self.config.system_prompt:
            cmd.extend(["--system-prompt", self.config.system_prompt])

        if self.config.append_system_prompt:
            cmd.extend(["--append-system-prompt", self.config.append_system_prompt])

        if self.config.dangerously_skip_permissions:
            cmd.append("--dangerously-skip-permissions")

        if self.config.allowedTools:
            cmd.extend(["--allowedTools", ",".join(self.config.allowedTools)])

        if self.config.disallowedTools:
            cmd.extend(["--disallowedTools", ",".join(self.config.disallowedTools)])

        # Use -p for single prompt execution with --print for output
        cmd.extend(["--print", "-p", prompt])

        return cmd

    async def start(self) -> None:
        """Mark the wrapper as ready."""
        async with self._lock:
            self._state = SessionState.READY
            logger.info(f"[{self.agent_id}] Session ready")

    async def send(self, prompt: str) -> SessionOutput:
        """Send a prompt and wait for response."""
        async with self._lock:
            self._state = SessionState.PROCESSING
            self._output_buffer.clear()

            logger.debug(f"[{self.agent_id}] Sending prompt: {prompt[:100]}...")

            cmd = self._build_command(prompt)
            working_dir = str(self.config.working_dir or Path.cwd())

            logger.info(f"[{self.agent_id}] Running: {' '.join(cmd[:5])}...")

            # Run claude command
            try:
                result = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: subprocess.run(
                            cmd,
                            cwd=working_dir,
                            capture_output=True,
                            text=True,
                            timeout=self.config.timeout,
                            env={**os.environ, "NO_COLOR": "1"},
                        )
                    ),
                    timeout=self.config.timeout + 10
                )

                output_text = result.stdout + result.stderr

                # Notify callback
                if self.on_output:
                    for line in output_text.split('\n'):
                        if line.strip():
                            self.on_output(line)

                # Parse output
                return self._parse_output(output_text, result.returncode)

            except subprocess.TimeoutExpired:
                logger.error(f"[{self.agent_id}] Command timed out")
                return SessionOutput(
                    text="Command timed out",
                    stop_reason=StopReason.TIMEOUT,
                )
            except Exception as e:
                logger.error(f"[{self.agent_id}] Error: {e}")
                return SessionOutput(
                    text=str(e),
                    stop_reason=StopReason.ERROR,
                )
            finally:
                self._state = SessionState.READY

    def _parse_output(self, text: str, returncode: int) -> SessionOutput:
        """Parse the output from Claude Code."""
        stop_reason = StopReason.END_TURN
        tool_calls: list[dict[str, Any]] = []
        tokens_used = 0

        # Check for errors
        if returncode != 0:
            stop_reason = StopReason.ERROR

        # Check for rate limiting
        if self.RATE_LIMIT_PATTERN.search(text):
            stop_reason = StopReason.RATE_LIMIT

        # Check for task completion
        if self.TASK_COMPLETE_PATTERN.search(text):
            stop_reason = StopReason.END_TURN

        # Extract tool calls
        for match in self.TOOL_CALL_PATTERN.finditer(text):
            tool_calls.append({"tool": match.group(1)})

        # Extract token usage from various formats
        token_match = self.TOKEN_PATTERN.search(text)
        if token_match:
            tokens_str = token_match.group(1).replace(",", "")
            tokens_used = int(tokens_str)
            self._total_tokens += tokens_used
        else:
            # Try usage pattern
            usage_match = self.USAGE_PATTERN.search(text)
            if usage_match:
                tokens_str = usage_match.group(1).replace(",", "")
                tokens_used = int(tokens_str)
                self._total_tokens += tokens_used
            else:
                # Estimate based on output length (rough approximation)
                # Claude averages ~4 chars per token
                estimated_tokens = len(text) // 4
                if estimated_tokens > 100:
                    tokens_used = estimated_tokens
                    self._total_tokens += tokens_used

        return SessionOutput(
            text=text,
            stop_reason=stop_reason,
            tool_calls=tool_calls,
            tokens_used=tokens_used,
        )

    async def send_interrupt(self) -> None:
        """Not applicable for subprocess mode."""
        pass

    async def send_eof(self) -> None:
        """Not applicable for subprocess mode."""
        pass

    async def terminate(self, force: bool = False) -> None:
        """Mark as terminated."""
        async with self._lock:
            self._state = SessionState.TERMINATED

    async def restart(self) -> None:
        """Restart the session."""
        await self.terminate()
        await self.start()

    def get_output_history(self) -> list[str]:
        """Get the output history."""
        return self._output_buffer.copy()


class ClaudeCodeSession:
    """High-level Claude Code session manager with retry logic."""

    def __init__(
        self,
        agent_id: str,
        config: SessionConfig,
        max_retries: int = 3,
        backoff_base: float = 2.0,
    ):
        """Initialize the session manager."""
        self.agent_id = agent_id
        self.config = config
        self.max_retries = max_retries
        self.backoff_base = backoff_base

        self._wrapper: ClaudeCodeWrapper | None = None
        self._output_callbacks: list[Callable[[str], None]] = []

    def add_output_callback(self, callback: Callable[[str], None]) -> None:
        """Add a callback for output events."""
        self._output_callbacks.append(callback)

    def _on_output(self, line: str) -> None:
        """Internal output handler."""
        for callback in self._output_callbacks:
            try:
                callback(line)
            except Exception as e:
                logger.error(f"Output callback error: {e}")

    async def __aenter__(self) -> "ClaudeCodeSession":
        """Async context manager entry."""
        await self.start()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.stop()

    async def start(self) -> None:
        """Start the session."""
        self._wrapper = ClaudeCodeWrapper(
            config=self.config,
            agent_id=self.agent_id,
            on_output=self._on_output,
        )
        await self._wrapper.start()

    async def stop(self) -> None:
        """Stop the session."""
        if self._wrapper:
            await self._wrapper.terminate()
            self._wrapper = None

    async def execute(self, prompt: str) -> SessionOutput:
        """Execute a prompt with retry logic."""
        if not self._wrapper:
            raise RuntimeError("Session not started")

        last_error: Exception | None = None

        for attempt in range(self.max_retries):
            try:
                output = await self._wrapper.send(prompt)

                # Check for rate limiting
                if output.stop_reason == StopReason.RATE_LIMIT:
                    wait_time = self.backoff_base ** (attempt + 1)
                    logger.warning(
                        f"[{self.agent_id}] Rate limited, waiting {wait_time}s"
                    )
                    await asyncio.sleep(wait_time)
                    continue

                # Check for errors
                if output.stop_reason == StopReason.ERROR:
                    if attempt < self.max_retries - 1:
                        # Send feedback prompt for retry
                        logger.warning(f"[{self.agent_id}] Error, retrying...")
                        await asyncio.sleep(self.backoff_base)
                        continue

                return output

            except Exception as e:
                last_error = e
                logger.error(f"[{self.agent_id}] Attempt {attempt + 1} failed: {e}")

                if attempt < self.max_retries - 1:
                    wait_time = self.backoff_base ** (attempt + 1)
                    await asyncio.sleep(wait_time)

        # All retries exhausted
        raise RuntimeError(
            f"[{self.agent_id}] Failed after {self.max_retries} attempts: {last_error}"
        )

    @property
    def total_tokens(self) -> int:
        """Get total tokens used."""
        return self._wrapper.total_tokens if self._wrapper else 0

    @property
    def is_alive(self) -> bool:
        """Check if session is alive."""
        return self._wrapper is not None and self._wrapper.is_alive
