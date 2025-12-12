"""Developer Agent - Task execution and code implementation."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from autonoma.agents.base import AgentRole, BaseAgent, create_xml_prompt
from autonoma.core.config import Config
from autonoma.core.state import StateManager, Task, TaskStatus
from autonoma.core.wrapper import SessionOutput, StopReason


logger = logging.getLogger(__name__)


class DeveloperAgent(BaseAgent):
    """Developer Agent responsible for implementing individual tasks."""

    role = AgentRole.DEVELOPER

    default_system_prompt = """You are a Developer Agent in an autonomous software development system.
Your role is to implement specific coding tasks within your assigned git worktree.

Key responsibilities:
- Implement features according to task specifications
- Write clean, well-tested code
- Follow project standards from CLAUDE.md
- Create appropriate unit tests
- Make atomic commits with semantic messages

Tools available: Edit, Read, Bash (for tests, git), Grep, Glob

<guidelines>
- Use <think> for step-by-step planning before coding
- Run tests after implementation: bash: npm test / pytest / etc.
- Commit semantically: "feat: description" or "fix: description"
- Output [TASK_COMPLETE] only when all acceptance criteria are met
- If stuck, use <debug> tags to analyze issues
- Never push to remote - only local commits
</guidelines>"""

    def __init__(
        self,
        agent_id: str,
        config: Config,
        state_manager: StateManager,
        task: Task,
        working_dir: Path | None = None,
    ):
        """Initialize the Developer agent with a specific task."""
        # Use task's worktree as working directory
        task_working_dir = (
            Path(task.worktree_path)
            if task.worktree_path
            else working_dir or config.project_root
        )
        super().__init__(agent_id, config, state_manager, task_working_dir)
        self.task = task

    def get_system_prompt(self) -> str:
        """Get customized system prompt with task context."""
        metadata = self.task.metadata or {}

        return f"""{self.default_system_prompt}

<task_context>
Task ID: {self.task.task_id}
Description: {self.task.description}
Type: {metadata.get('type', 'feature')}
Branch: {self.task.branch_name}
</task_context>

<files_context>
Files to modify: {metadata.get('files_to_modify', [])}
Files to create: {metadata.get('files_to_create', [])}
</files_context>

<acceptance_criteria>
{chr(10).join(f'- {c}' for c in metadata.get('acceptance_criteria', []))}
</acceptance_criteria>

<test_requirements>
{metadata.get('test_requirements', 'Write appropriate unit tests')}
</test_requirements>"""

    async def run(self, input_data: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        Execute the assigned task.

        Args:
            input_data: Optional additional context

        Returns:
            Dictionary containing:
                - success: bool - Whether task completed successfully
                - output: str - Final output from execution
                - commits: list[str] - Commit hashes created
                - files_changed: list[str] - Files that were modified
        """
        logger.info(f"[{self.agent_id}] Starting task: {self.task.task_id}")

        # Update task status
        await self.state_manager.update_task_status(
            self.task.task_id, TaskStatus.IN_PROGRESS, self.agent_id
        )

        # Create execution prompt
        execution_prompt = self._create_execution_prompt(input_data)

        try:
            # Execute the task
            output = await self.execute_prompt(execution_prompt)

            # Update task token usage for live dashboard display
            if output.tokens_used > 0:
                await self.state_manager.update_task_tokens(
                    self.task.task_id, output.tokens_used
                )

            # Check for completion
            success = self._check_completion(output)

            if success:
                await self.state_manager.update_task_status(
                    self.task.task_id, TaskStatus.REVIEW
                )
                logger.info(f"[{self.agent_id}] Task completed: {self.task.task_id}")
            else:
                # May need retry or debugging
                if output.stop_reason == StopReason.ERROR:
                    retry_count = await self.state_manager.increment_retry(
                        self.task.task_id
                    )
                    if retry_count >= self.config.max_retries:
                        await self.state_manager.update_task_status(
                            self.task.task_id, TaskStatus.FAILED
                        )
                        logger.error(
                            f"[{self.agent_id}] Task failed after {retry_count} retries"
                        )
                    else:
                        # Attempt debug and retry
                        debug_output = await self._debug_and_retry(output)
                        success = self._check_completion(debug_output)

            return {
                "success": success,
                "output": output.text,
                "stop_reason": output.stop_reason.value if output.stop_reason else None,
                "tokens_used": output.tokens_used,
            }

        except Exception as e:
            logger.error(f"[{self.agent_id}] Task execution error: {e}")
            await self.state_manager.update_task_status(
                self.task.task_id, TaskStatus.FAILED
            )
            return {
                "success": False,
                "output": str(e),
                "error": True,
            }

    def _create_execution_prompt(self, input_data: dict[str, Any] | None) -> str:
        """Create the main execution prompt."""
        metadata = self.task.metadata or {}
        additional_context = input_data.get("context", "") if input_data else ""

        return create_xml_prompt(
            role=f"Developer implementing task {self.task.task_id}",
            task=f"""Implement the following task completely and autonomously.

<task>
{self.task.description}
</task>

<additional_context>
{additional_context}
</additional_context>""",
            guidelines=[
                "First, use <think> to plan your implementation approach",
                "Read existing files to understand patterns and context",
                "Implement the feature following project standards",
                "Write unit tests for new functionality",
                "Run tests to verify: bash: npm test (or appropriate command)",
                "If tests pass, commit with semantic message",
                "Output [TASK_COMPLETE] only when ALL acceptance criteria are met",
            ],
            examples=[
                "Task: Add login endpoint → Read auth patterns, create route, add validation, write tests, commit 'feat: add user login endpoint'",
            ],
            context={
                "files_to_modify": str(metadata.get("files_to_modify", [])),
                "files_to_create": str(metadata.get("files_to_create", [])),
                "branch": self.task.branch_name or "main",
            },
        )

    def _check_completion(self, output: SessionOutput) -> bool:
        """Check if the task was completed successfully."""
        # Check for completion token
        if "[TASK_COMPLETE]" in output.text:
            return True

        # Check stop reason
        if output.stop_reason == StopReason.END_TURN:
            # Claude finished normally - may or may not be complete
            # Look for indicators of success
            success_indicators = [
                "tests pass",
                "committed",
                "implementation complete",
                "all criteria met",
            ]
            text_lower = output.text.lower()
            return any(ind in text_lower for ind in success_indicators)

        return False

    async def _debug_and_retry(self, previous_output: SessionOutput) -> SessionOutput:
        """Attempt to debug and retry failed task."""
        debug_prompt = f"""<debug>
The previous implementation attempt had issues. Analyze and fix:

<previous_output>
{previous_output.text[-2000:]}  # Last 2000 chars
</previous_output>

<think>
1. What went wrong?
2. What is the root cause?
3. How can I fix it?
</think>

Please fix the issues and complete the task.
Output [TASK_COMPLETE] when done.
</debug>"""

        output = await self.execute_prompt(debug_prompt)

        # Update task token usage for retry
        if output.tokens_used > 0:
            await self.state_manager.update_task_tokens(
                self.task.task_id, output.tokens_used
            )

        return output


class DeveloperPool:
    """Pool manager for Developer agents."""

    def __init__(
        self,
        config: Config,
        state_manager: StateManager,
        max_workers: int | None = None,
    ):
        """Initialize the developer pool."""
        self.config = config
        self.state_manager = state_manager
        self.max_workers = max_workers or config.max_workers
        self._active_agents: dict[str, DeveloperAgent] = {}
        self._worker_count = 0

    @property
    def active_count(self) -> int:
        """Get count of active workers."""
        return len(self._active_agents)

    @property
    def available_slots(self) -> int:
        """Get number of available worker slots."""
        return self.max_workers - self.active_count

    def _generate_worker_id(self) -> str:
        """Generate a unique worker ID."""
        self._worker_count += 1
        return f"worker-{self._worker_count:03d}"

    async def spawn_worker(self, task: Task) -> DeveloperAgent:
        """Spawn a new worker for a task."""
        if self.active_count >= self.max_workers:
            raise RuntimeError("Worker pool at capacity")

        worker_id = self._generate_worker_id()
        worker = DeveloperAgent(
            agent_id=worker_id,
            config=self.config,
            state_manager=self.state_manager,
            task=task,
        )

        await worker.start()
        self._active_agents[task.task_id] = worker

        logger.info(f"Spawned worker {worker_id} for task {task.task_id}")
        return worker

    async def release_worker(self, task_id: str) -> None:
        """Release a worker after task completion."""
        if task_id in self._active_agents:
            worker = self._active_agents.pop(task_id)
            await worker.stop()
            logger.info(f"Released worker for task {task_id}")

    async def get_worker(self, task_id: str) -> DeveloperAgent | None:
        """Get the worker for a specific task."""
        return self._active_agents.get(task_id)

    async def shutdown(self) -> None:
        """Shutdown all workers."""
        for task_id in list(self._active_agents.keys()):
            await self.release_worker(task_id)
