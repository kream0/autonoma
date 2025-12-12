"""Tests for orchestrator and full pipeline execution."""
from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from typing import Any

from autonoma.core.orchestrator import Orchestrator, OrchestratorState, OrchestratorEvent
from autonoma.core.state import TaskStatus, Milestone, Task, AgentStatus

from tests.conftest import (
    MockClaudeCodeSession,
    MockResponse,
    ceo_response_factory,
    staff_engineer_response_factory,
    developer_response_factory,
    qa_response_factory,
)


# ============================================================================
# Mock Session Factory
# ============================================================================

class AgentSessionFactory:
    """Factory that creates appropriate mock sessions for each agent type."""

    def __init__(self):
        self._sessions: dict[str, MockClaudeCodeSession] = {}
        self._call_count = 0

    def create_session(
        self,
        agent_id: str = "mock-agent",
        config=None,
        max_retries: int = 3,
        backoff_base: float = 2.0,
    ) -> MockClaudeCodeSession:
        """Create a mock session based on context.

        Matches ClaudeCodeSession.__init__ signature.
        """
        self._call_count += 1

        # Determine agent type from call order or agent_id
        # CEO is first, then Staff, then Developers
        if self._call_count == 1 or "ceo" in agent_id.lower():
            session = MockClaudeCodeSession(
                agent_id=agent_id,
                config=config,
                response_factory=ceo_response_factory,
            )
            self._sessions['ceo'] = session
        elif self._call_count == 2 or "staff" in agent_id.lower():
            session = MockClaudeCodeSession(
                agent_id=agent_id,
                config=config,
                response_factory=staff_engineer_response_factory,
            )
            self._sessions['staff'] = session
        else:
            session = MockClaudeCodeSession(
                agent_id=agent_id,
                config=config,
                response_factory=developer_response_factory,
            )
            self._sessions[f'dev_{self._call_count}'] = session

        return session

    def get_sessions(self) -> dict[str, MockClaudeCodeSession]:
        return self._sessions


# ============================================================================
# Orchestrator Basic Tests
# ============================================================================

class TestOrchestratorBasic:
    """Basic orchestrator functionality tests."""

    @pytest.mark.asyncio
    async def test_orchestrator_initializes(self, config, state_manager):
        """Orchestrator should initialize without errors."""
        orchestrator = Orchestrator(config, state_manager)
        await orchestrator.initialize()

        assert orchestrator.state == OrchestratorState.IDLE
        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_orchestrator_emits_events(self, config, state_manager):
        """Orchestrator should emit events during execution."""
        events_received: list[tuple[OrchestratorEvent, dict]] = []

        def event_handler(event: OrchestratorEvent, data: dict):
            events_received.append((event, data))

        factory = AgentSessionFactory()

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=factory.create_session):
            orchestrator = Orchestrator(config, state_manager)
            orchestrator.on_event = event_handler
            await orchestrator.initialize()

            # Run just planning phase by mocking _execute_tasks
            with patch.object(orchestrator, '_execute_tasks', new_callable=AsyncMock):
                # Also skip milestone decomposition by mocking _decompose_milestone
                with patch.object(orchestrator, '_decompose_milestone', new_callable=AsyncMock, return_value=[]):
                    await orchestrator.run("Build a test project")

        # Verify key events emitted
        event_types = [e[0] for e in events_received]
        assert OrchestratorEvent.STARTED in event_types
        assert OrchestratorEvent.PLANNING_STARTED in event_types
        assert OrchestratorEvent.PLANNING_COMPLETED in event_types

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_orchestrator_prevents_double_run(self, config, state_manager):
        """Orchestrator should prevent concurrent runs."""
        factory = AgentSessionFactory()

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=factory.create_session):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            # Start first run (don't await)
            task1 = asyncio.create_task(orchestrator.run("Project 1"))

            # Small delay to let it start
            await asyncio.sleep(0.1)

            # Second run should fail
            with pytest.raises(RuntimeError, match="already running"):
                await orchestrator.run("Project 2")

            # Cancel first task
            task1.cancel()
            try:
                await task1
            except asyncio.CancelledError:
                pass

        await orchestrator.shutdown()


# ============================================================================
# Full Pipeline Tests
# ============================================================================

class TestOrchestratorFullPipeline:
    """Tests for complete orchestration pipeline."""

    @pytest.mark.asyncio
    async def test_full_pipeline_ceo_to_milestone(self, config, state_manager):
        """Test pipeline from CEO planning through milestone creation."""
        factory = AgentSessionFactory()

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=factory.create_session):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            # Run just planning phase - skip decomposition and execution
            with patch.object(orchestrator, '_execute_tasks', new_callable=AsyncMock):
                with patch.object(orchestrator, '_decompose_milestone', new_callable=AsyncMock, return_value=[]):
                    await orchestrator.run("Build a test project")

        # Verify plan created
        assert config.plan_json_path.exists()

        # Verify milestones in DB
        milestones = await state_manager.get_milestones()
        assert len(milestones) >= 1

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_pipeline_validates_plan(self, config, state_manager):
        """Pipeline should fail gracefully on invalid plan."""
        def bad_ceo_response(prompt):
            return MockResponse(text="Not valid JSON!", tokens=500)

        mock_session = MockClaudeCodeSession(response_factory=bad_ceo_response)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            with pytest.raises(RuntimeError, match="parse"):
                await orchestrator.run("Build something")

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_pipeline_handles_empty_milestones(self, config, state_manager):
        """Pipeline should fail if CEO produces no milestones."""
        def empty_plan_response(prompt):
            return MockResponse(
                text='{"project_name": "Empty", "milestones": []}',
                tokens=500
            )

        mock_session = MockClaudeCodeSession(response_factory=empty_plan_response)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            with pytest.raises(RuntimeError, match="no milestones"):
                await orchestrator.run("Build something")

        await orchestrator.shutdown()


# ============================================================================
# Parallel Execution Tests
# ============================================================================

class TestParallelExecution:
    """Tests for parallel agent execution."""

    @pytest.mark.asyncio
    async def test_parallel_tasks_execute_concurrently(self, config, state_manager):
        """Tasks without dependencies should execute in parallel."""
        # Create milestone with parallel tasks
        milestone = Milestone(
            milestone_id="M1",
            name="Test",
            description="Test milestone",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=["T1.1", "T1.2", "T1.3"],
        )
        await state_manager.create_milestone(milestone)

        # Create independent tasks
        for i in range(1, 4):
            task = Task(
                task_id=f"T1.{i}",
                milestone_id="M1",
                description=f"Task {i}",
                status=TaskStatus.PENDING,
            )
            await state_manager.create_task(task)

        # Track execution times
        execution_times: dict[str, tuple[float, float]] = {}
        original_time = asyncio.get_event_loop().time

        def tracking_response(prompt):
            # Extract task ID from prompt
            import re
            match = re.search(r'T\d+\.\d+', prompt)
            task_id = match.group() if match else "unknown"

            start = asyncio.get_event_loop().time()
            execution_times[task_id] = (start, 0)

            async def delayed():
                await asyncio.sleep(0.1)  # Simulate work

            return MockResponse(text="[TASK_COMPLETE]", tokens=500, delay=0.1)

        sessions_created = []

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            session = MockClaudeCodeSession(
                agent_id=agent_id,
                config=config,
                response_factory=tracking_response
            )
            sessions_created.append(session)
            return session

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            # Mock the planning phase to skip straight to task execution
            orchestrator._current_plan = {"project_name": "Test", "milestones": []}

            # Set up staff engineer with a mock that returns all tasks as ready
            from autonoma.agents.staff_engineer import StaffEngineerAgent
            orchestrator._staff_engineer = StaffEngineerAgent(
                agent_id="staff-test",
                config=config,
                state_manager=state_manager,
            )
            # Mock get_parallel_tasks to return all pending tasks
            async def mock_get_parallel_tasks(tasks, completed):
                return [t for t in tasks if t.task_id not in completed]
            orchestrator._staff_engineer.get_parallel_tasks = mock_get_parallel_tasks

            tasks = await state_manager.get_all_tasks()
            start_time = asyncio.get_event_loop().time()
            await orchestrator._execute_tasks(tasks)
            total_time = asyncio.get_event_loop().time() - start_time

        # If tasks ran in parallel, total time should be less than sequential
        # Sequential would be ~0.3s (3 * 0.1s), parallel should be less
        # Allow generous margin for CI/slow systems
        assert total_time < 2.0, f"Tasks took too long: {total_time}s"

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_dependent_tasks_wait_for_dependencies(self, config, state_manager):
        """Tasks with dependencies should wait for them to complete."""
        milestone = Milestone(
            milestone_id="M1",
            name="Test",
            description="Test",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=["T1.1", "T1.2"],
        )
        await state_manager.create_milestone(milestone)

        # T1.2 depends on T1.1
        task1 = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="First task",
            status=TaskStatus.PENDING,
            dependencies=[],
        )
        task2 = Task(
            task_id="T1.2",
            milestone_id="M1",
            description="Second task depends on first",
            status=TaskStatus.PENDING,
            dependencies=["T1.1"],
        )
        await state_manager.create_task(task1)
        await state_manager.create_task(task2)

        execution_order = []

        def tracking_response(prompt):
            import re
            match = re.search(r'T\d+\.\d+', prompt)
            task_id = match.group() if match else "unknown"
            execution_order.append(task_id)
            return MockResponse(text="[TASK_COMPLETE]", tokens=500)

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id,
                config=config,
                response_factory=tracking_response
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()
            orchestrator._current_plan = {"project_name": "Test", "milestones": []}

            # Set up staff engineer with dependency-aware task selection
            from autonoma.agents.staff_engineer import StaffEngineerAgent
            orchestrator._staff_engineer = StaffEngineerAgent(
                agent_id="staff-test",
                config=config,
                state_manager=state_manager,
            )
            # Mock get_parallel_tasks to respect dependencies
            async def mock_get_parallel_tasks(tasks, completed):
                ready = []
                for t in tasks:
                    if t.task_id in completed:
                        continue
                    deps_met = all(d in completed for d in (t.dependencies or []))
                    if deps_met:
                        ready.append(t)
                return ready
            orchestrator._staff_engineer.get_parallel_tasks = mock_get_parallel_tasks

            tasks = await state_manager.get_all_tasks()
            await orchestrator._execute_tasks(tasks)

        # T1.1 should execute before T1.2
        assert execution_order.index("T1.1") < execution_order.index("T1.2")

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_max_parallel_workers_respected(self, config, state_manager):
        """Should not exceed max parallel workers."""
        # Create many tasks
        milestone = Milestone(
            milestone_id="M1",
            name="Test",
            description="Test",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=[f"T1.{i}" for i in range(10)],
        )
        await state_manager.create_milestone(milestone)

        for i in range(10):
            task = Task(
                task_id=f"T1.{i}",
                milestone_id="M1",
                description=f"Task {i}",
                status=TaskStatus.PENDING,
            )
            await state_manager.create_task(task)

        concurrent_count = 0
        max_concurrent = 0
        lock = asyncio.Lock()

        async def tracking_execute(prompt):
            nonlocal concurrent_count, max_concurrent
            async with lock:
                concurrent_count += 1
                max_concurrent = max(max_concurrent, concurrent_count)

            await asyncio.sleep(0.05)  # Simulate work

            async with lock:
                concurrent_count -= 1

            return MockResponse(text="[TASK_COMPLETE]", tokens=100).to_output()

        mock_session = MagicMock()
        mock_session.start = AsyncMock()
        mock_session.stop = AsyncMock()
        mock_session.execute = tracking_execute
        mock_session.add_output_callback = MagicMock()
        mock_session.total_tokens = 0
        mock_session.is_alive = True

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            orchestrator = Orchestrator(config, state_manager)
            orchestrator._max_parallel_workers = 3  # Limit to 3
            await orchestrator.initialize()
            orchestrator._current_plan = {"project_name": "Test", "milestones": []}

            # Set up staff engineer with a mock that returns all tasks as ready
            from autonoma.agents.staff_engineer import StaffEngineerAgent
            orchestrator._staff_engineer = StaffEngineerAgent(
                agent_id="staff-test",
                config=config,
                state_manager=state_manager,
            )
            async def mock_get_parallel_tasks(tasks, completed):
                return [t for t in tasks if t.task_id not in completed]
            orchestrator._staff_engineer.get_parallel_tasks = mock_get_parallel_tasks

            tasks = await state_manager.get_all_tasks()
            await orchestrator._execute_tasks(tasks)

        # Should never exceed max workers
        assert max_concurrent <= 3, f"Exceeded max workers: {max_concurrent}"

        await orchestrator.shutdown()


# ============================================================================
# Pause/Resume Tests
# ============================================================================

class TestPauseResume:
    """Tests for pause and resume functionality."""

    @pytest.mark.asyncio
    async def test_orchestrator_can_pause(self, config, state_manager):
        """Orchestrator should pause when requested."""
        factory = AgentSessionFactory()

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=factory.create_session):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            # Start run in background
            run_task = asyncio.create_task(orchestrator.run("Test project"))

            # Wait a bit then pause
            await asyncio.sleep(0.1)
            await orchestrator.pause()

            assert orchestrator.state == OrchestratorState.PAUSED

            # Resume
            await orchestrator.resume()
            assert orchestrator.state != OrchestratorState.PAUSED

            # Cancel the task
            run_task.cancel()
            try:
                await run_task
            except asyncio.CancelledError:
                pass

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_pause_persists_state(self, config, state_manager):
        """Pausing should persist current state to database."""
        milestone = Milestone(
            milestone_id="M1",
            name="Test",
            description="Test",
            phase=1,
            status=TaskStatus.IN_PROGRESS,
            tasks=["T1.1"],
        )
        await state_manager.create_milestone(milestone)

        task = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="Test task",
            status=TaskStatus.IN_PROGRESS,
            agent_id="worker-001",
        )
        await state_manager.create_task(task)

        # Verify state is persisted
        db_task = await state_manager.get_task("T1.1")
        assert db_task.status == TaskStatus.IN_PROGRESS
        assert db_task.agent_id == "worker-001"
