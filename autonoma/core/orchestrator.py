"""Orchestrator - Main coordination engine for Autonoma."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from autonoma.agents.ceo import CEOAgent
from autonoma.agents.developer import DeveloperAgent, DeveloperPool
from autonoma.agents.qa import QAAgent
from autonoma.agents.staff_engineer import StaffEngineerAgent
from autonoma.core.config import Config
from autonoma.core.state import (
    AgentStatus,
    Milestone,
    StateManager,
    Task,
    TaskStatus,
)


logger = logging.getLogger(__name__)


class OrchestratorState(str, Enum):
    """Orchestrator state."""

    IDLE = "IDLE"
    PLANNING = "PLANNING"
    EXECUTING = "EXECUTING"
    REVIEWING = "REVIEWING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    PAUSED = "PAUSED"


class OrchestratorEvent(str, Enum):
    """Events emitted by the orchestrator."""

    STARTED = "started"
    PLANNING_STARTED = "planning_started"
    PLANNING_COMPLETED = "planning_completed"
    MILESTONE_STARTED = "milestone_started"
    MILESTONE_COMPLETED = "milestone_completed"
    TASK_QUEUED = "task_queued"
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    REVIEW_STARTED = "review_started"
    REVIEW_COMPLETED = "review_completed"
    ESCALATION = "escalation"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


class Orchestrator:
    """Main orchestration engine that coordinates all agents."""

    def __init__(
        self,
        config: Config,
        state_manager: StateManager,
        on_event: Callable[[OrchestratorEvent, dict[str, Any]], None] | None = None,
    ):
        """Initialize the orchestrator."""
        self.config = config
        self.state_manager = state_manager
        self.on_event = on_event

        self._state = OrchestratorState.IDLE
        self._ceo: CEOAgent | None = None
        self._staff_engineer: StaffEngineerAgent | None = None
        self._qa: QAAgent | None = None
        self._developer_pool: DeveloperPool | None = None

        self._current_plan: dict[str, Any] = {}
        self._current_milestone: Milestone | None = None
        self._completed_tasks: set[str] = set()
        self._failed_tasks: set[str] = set()

        self._running = False
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Not paused initially

    @property
    def state(self) -> OrchestratorState:
        """Get current orchestrator state."""
        return self._state

    @property
    def is_running(self) -> bool:
        """Check if orchestrator is running."""
        return self._running

    def _emit(self, event: OrchestratorEvent, data: dict[str, Any] | None = None) -> None:
        """Emit an event."""
        if self.on_event:
            try:
                self.on_event(event, data or {})
            except Exception as e:
                logger.error(f"Event handler error: {e}")

    async def initialize(self) -> None:
        """Initialize the orchestrator and its agents."""
        logger.info("Initializing orchestrator...")

        # Ensure directories exist
        self.config.ensure_dirs()

        # Connect to state database
        await self.state_manager.connect()

        # Initialize agent pool
        self._developer_pool = DeveloperPool(
            self.config, self.state_manager, self.config.max_workers
        )

        logger.info("Orchestrator initialized")

    async def shutdown(self) -> None:
        """Shutdown the orchestrator and all agents."""
        logger.info("Shutting down orchestrator...")

        self._running = False

        # Stop all agents with timeouts to avoid hanging
        async def safe_stop(coro: Any, name: str) -> None:
            try:
                await asyncio.wait_for(coro, timeout=2.0)
            except (asyncio.TimeoutError, Exception) as e:
                logger.warning(f"Timeout/error stopping {name}: {e}")

        if self._ceo:
            await safe_stop(self._ceo.stop(), "CEO")
            self._ceo = None
        if self._staff_engineer:
            await safe_stop(self._staff_engineer.stop(), "Staff Engineer")
            self._staff_engineer = None
        if self._qa:
            await safe_stop(self._qa.stop(), "QA")
            self._qa = None
        if self._developer_pool:
            await safe_stop(self._developer_pool.shutdown(), "Developer Pool")
            self._developer_pool = None

        logger.info("Orchestrator shutdown complete")

    async def run(self, requirements: str, requirements_path: Path | None = None) -> dict[str, Any]:
        """
        Run the full orchestration pipeline.

        Args:
            requirements: Requirements text or PRD content
            requirements_path: Optional path to requirements file

        Returns:
            Final execution results
        """
        if self._running:
            raise RuntimeError("Orchestrator already running")

        self._running = True
        self._state = OrchestratorState.PLANNING
        self._emit(OrchestratorEvent.STARTED)

        try:
            # Phase 1: Planning with CEO
            self._emit(OrchestratorEvent.PLANNING_STARTED)
            plan = await self._run_planning(requirements, requirements_path)
            self._current_plan = plan

            # Validate plan
            if plan.get("parse_error"):
                raise RuntimeError("CEO planning failed - could not parse plan JSON. Check logs for details.")

            if not plan.get("milestones"):
                raise RuntimeError("CEO planning produced no milestones. The plan may be incomplete.")

            self._emit(OrchestratorEvent.PLANNING_COMPLETED, {"plan": plan})

            # Phase 2: Execute milestones
            milestones = await self.state_manager.get_milestones()

            if not milestones:
                raise RuntimeError("No milestones found in database after planning. CEO may have failed to save.")

            for milestone in milestones:
                await self._pause_event.wait()  # Check for pause

                self._current_milestone = milestone
                self._emit(OrchestratorEvent.MILESTONE_STARTED, {"milestone": milestone.name})

                # Decompose milestone into tasks
                tasks = await self._decompose_milestone(milestone)

                # Execute tasks with parallelism
                await self._execute_tasks(tasks)

                # Mark milestone complete
                await self.state_manager.update_milestone_status(
                    milestone.milestone_id, TaskStatus.MERGED
                )
                self._emit(OrchestratorEvent.MILESTONE_COMPLETED, {"milestone": milestone.name})

            # All done
            self._state = OrchestratorState.COMPLETED
            self._emit(OrchestratorEvent.COMPLETED)

            return await self._generate_report()

        except Exception as e:
            logger.error(f"Orchestration failed: {e}")
            self._state = OrchestratorState.FAILED
            self._emit(OrchestratorEvent.FAILED, {"error": str(e)})
            raise

        finally:
            self._running = False

    async def _run_planning(
        self, requirements: str, requirements_path: Path | None
    ) -> dict[str, Any]:
        """Run the CEO planning phase."""
        self._ceo = CEOAgent(
            agent_id="ceo-001",
            config=self.config,
            state_manager=self.state_manager,
        )

        async with self._ceo:
            result = await self._ceo.run({
                "requirements": requirements,
                "requirements_path": requirements_path,
            })

        return result.get("plan", {})

    async def _decompose_milestone(self, milestone: Milestone) -> list[Task]:
        """Decompose a milestone into tasks using Staff Engineer."""
        if not self._staff_engineer:
            self._staff_engineer = StaffEngineerAgent(
                agent_id="staff-001",
                config=self.config,
                state_manager=self.state_manager,
            )
            await self._staff_engineer.start()

        result = await self._staff_engineer.run({
            "milestone": {
                "id": milestone.milestone_id,
                "name": milestone.name,
                "description": milestone.description,
                "tasks": milestone.tasks,
            },
            "plan": self._current_plan,
        })

        return result.get("tasks", [])

    async def _execute_tasks(self, tasks: list[Task]) -> None:
        """Execute tasks with parallelism management."""
        self._state = OrchestratorState.EXECUTING
        pending_tasks = {t.task_id: t for t in tasks}
        in_flight: dict[str, asyncio.Task[Any]] = {}

        assert self._developer_pool is not None
        assert self._staff_engineer is not None

        while pending_tasks or in_flight:
            await self._pause_event.wait()  # Check for pause

            # Get tasks ready to execute
            ready_tasks = await self._staff_engineer.get_parallel_tasks(
                list(pending_tasks.values()), self._completed_tasks
            )

            # Spawn workers for ready tasks
            for task in ready_tasks[:self._developer_pool.available_slots]:
                if task.task_id in in_flight:
                    continue

                self._emit(OrchestratorEvent.TASK_STARTED, {"task_id": task.task_id})

                # Spawn worker and create execution task
                worker = await self._developer_pool.spawn_worker(task)
                async_task = asyncio.create_task(self._execute_single_task(worker, task))
                in_flight[task.task_id] = async_task
                pending_tasks.pop(task.task_id, None)

            # Wait for any task to complete
            if in_flight:
                done, _ = await asyncio.wait(
                    in_flight.values(),
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for completed_task in done:
                    # Find which task_id this was
                    task_id = None
                    for tid, atask in list(in_flight.items()):
                        if atask == completed_task:
                            task_id = tid
                            del in_flight[tid]
                            break

                    if task_id:
                        try:
                            result = completed_task.result()
                            if result.get("success"):
                                self._completed_tasks.add(task_id)
                                self._emit(
                                    OrchestratorEvent.TASK_COMPLETED,
                                    {"task_id": task_id},
                                )
                            else:
                                await self._handle_task_failure(task_id, result)
                        except Exception as e:
                            await self._handle_task_failure(task_id, {"error": str(e)})

                        # Release worker
                        await self._developer_pool.release_worker(task_id)

            # Small delay to prevent tight loop
            await asyncio.sleep(0.1)

    async def _execute_single_task(
        self, worker: DeveloperAgent, task: Task
    ) -> dict[str, Any]:
        """Execute a single task with a worker."""
        try:
            result = await worker.run()

            # If task completed, run QA review
            if result.get("success"):
                review_result = await self._review_task(task)
                result["review"] = review_result

            return result

        except Exception as e:
            logger.error(f"Task {task.task_id} execution error: {e}")
            return {"success": False, "error": str(e)}

    async def _review_task(self, task: Task) -> dict[str, Any]:
        """Review a completed task with QA agent."""
        self._state = OrchestratorState.REVIEWING
        self._emit(OrchestratorEvent.REVIEW_STARTED, {"task_id": task.task_id})

        if not self._qa:
            self._qa = QAAgent(
                agent_id="qa-001",
                config=self.config,
                state_manager=self.state_manager,
            )
            await self._qa.start()

        result = await self._qa.run({"task": task, "auto_merge": True})

        self._emit(
            OrchestratorEvent.REVIEW_COMPLETED,
            {"task_id": task.task_id, "approved": result.get("approved")},
        )

        # Cleanup worktree if merged
        if result.get("merged"):
            await self._qa.cleanup_worktree(task)

        return result

    async def _handle_task_failure(
        self, task_id: str, result: dict[str, Any]
    ) -> None:
        """Handle a failed task."""
        self._emit(OrchestratorEvent.TASK_FAILED, {"task_id": task_id, "result": result})

        task = await self.state_manager.get_task(task_id)
        if not task:
            return

        retry_count = await self.state_manager.increment_retry(task_id)

        if retry_count >= self.config.max_retries:
            # Escalate
            self._failed_tasks.add(task_id)
            await self.state_manager.update_task_status(task_id, TaskStatus.BLOCKED)
            self._emit(
                OrchestratorEvent.ESCALATION,
                {"task_id": task_id, "reason": "Max retries exceeded"},
            )
        else:
            # Will be retried
            await self.state_manager.update_task_status(task_id, TaskStatus.PENDING)

    async def pause(self) -> None:
        """Pause orchestration."""
        self._pause_event.clear()
        self._state = OrchestratorState.PAUSED
        self._emit(OrchestratorEvent.PAUSED)

    async def resume(self) -> None:
        """Resume orchestration."""
        self._pause_event.set()
        self._state = OrchestratorState.EXECUTING

    async def _generate_report(self) -> dict[str, Any]:
        """Generate final execution report."""
        stats = await self.state_manager.get_statistics()
        tasks = await self.state_manager.get_all_tasks()
        milestones = await self.state_manager.get_milestones()

        return {
            "status": "completed" if not self._failed_tasks else "completed_with_failures",
            "statistics": stats,
            "completed_tasks": len(self._completed_tasks),
            "failed_tasks": list(self._failed_tasks),
            "milestones": [
                {
                    "id": m.milestone_id,
                    "name": m.name,
                    "status": m.status.value,
                }
                for m in milestones
            ],
            "total_tokens": sum(t.token_usage for t in tasks),
            "timestamp": datetime.utcnow().isoformat(),
        }


async def run_autonoma(
    requirements: str,
    project_root: Path | None = None,
    on_event: Callable[[OrchestratorEvent, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """
    Convenience function to run Autonoma.

    Args:
        requirements: Requirements text or PRD content
        project_root: Project root directory
        on_event: Event callback

    Returns:
        Execution results
    """
    config = Config(project_root=project_root or Path.cwd())
    state_manager = StateManager(config.state_db_path)

    orchestrator = Orchestrator(config, state_manager, on_event)

    try:
        await orchestrator.initialize()
        return await orchestrator.run(requirements)
    finally:
        await orchestrator.shutdown()
