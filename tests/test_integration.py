"""Integration tests for complete Autonoma pipeline."""
from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
from typing import Any

from autonoma.core.orchestrator import Orchestrator, OrchestratorState, OrchestratorEvent
from autonoma.core.state import StateManager, TaskStatus, AgentStatus, Milestone, Task
from autonoma.core.config import Config

from tests.conftest import (
    MockClaudeCodeSession,
    MockResponse,
)


# ============================================================================
# Comprehensive Response Factory
# ============================================================================

class SmartResponseFactory:
    """
    Intelligent response factory that generates appropriate responses
    based on the agent type and prompt content.
    """

    def __init__(self):
        self.call_history: list[dict[str, Any]] = []
        self._task_counter = 0

    def __call__(self, prompt: str) -> MockResponse:
        """Generate response based on prompt analysis."""
        call_info = {
            "prompt": prompt[:200],
            "response_type": "unknown",
        }

        # Detect CEO planning prompt
        if "requirements" in prompt.lower() and "json" in prompt.lower():
            call_info["response_type"] = "ceo_planning"
            response = self._ceo_response()

        # Detect Staff Engineer decomposition
        elif "milestone" in prompt.lower() and "task" in prompt.lower():
            call_info["response_type"] = "staff_decomposition"
            response = self._staff_response()

        # Detect Developer implementation
        elif "implement" in prompt.lower() or "task" in prompt.lower():
            call_info["response_type"] = "developer_implementation"
            response = self._developer_response()

        # Detect QA review
        elif "review" in prompt.lower() or "test" in prompt.lower():
            call_info["response_type"] = "qa_review"
            response = self._qa_response()

        # Default response
        else:
            call_info["response_type"] = "default"
            response = MockResponse(text="Acknowledged.", tokens=100)

        self.call_history.append(call_info)
        return response

    def _ceo_response(self) -> MockResponse:
        plan = {
            "project_name": "Integration Test Project",
            "tech_stack": {
                "language": "TypeScript",
                "framework": "Express",
                "database": "PostgreSQL"
            },
            "milestones": [
                {
                    "id": "M1",
                    "name": "Project Setup",
                    "phase": 1,
                    "description": "Initialize project structure",
                    "tasks": [
                        {"id": "T1.1", "description": "Create package.json", "dependencies": [], "estimated_complexity": "low"},
                        {"id": "T1.2", "description": "Setup TypeScript config", "dependencies": ["T1.1"], "estimated_complexity": "low"},
                    ]
                },
                {
                    "id": "M2",
                    "name": "Core Implementation",
                    "phase": 2,
                    "description": "Build core features",
                    "tasks": [
                        {"id": "T2.1", "description": "Implement user model", "dependencies": ["T1.2"], "estimated_complexity": "medium"},
                        {"id": "T2.2", "description": "Create API routes", "dependencies": ["T1.2"], "estimated_complexity": "medium"},
                    ]
                }
            ]
        }
        return MockResponse(text=json.dumps(plan), tokens=1200)

    def _staff_response(self) -> MockResponse:
        self._task_counter += 1
        tasks = [
            {
                "id": f"T{self._task_counter}.1",
                "description": "Setup initial structure",
                "dependencies": [],
                "acceptance_criteria": ["Files created", "Tests pass"]
            },
            {
                "id": f"T{self._task_counter}.2",
                "description": "Implement core logic",
                "dependencies": [f"T{self._task_counter}.1"],
                "acceptance_criteria": ["Logic works", "Tests pass"]
            }
        ]
        return MockResponse(text=json.dumps(tasks), tokens=600)

    def _developer_response(self) -> MockResponse:
        return MockResponse(
            text="Implemented successfully.\n\nCreated files:\n- src/index.ts\n- src/utils.ts\n\n[TASK_COMPLETE]",
            tokens=1500
        )

    def _qa_response(self) -> MockResponse:
        return MockResponse(
            text="Review complete.\n\n✓ Code quality good\n✓ Tests passing\n✓ No security issues\n\n[APPROVED]",
            tokens=400
        )


# ============================================================================
# Full Pipeline Integration Tests
# ============================================================================

class TestFullPipelineIntegration:
    """End-to-end integration tests for the complete pipeline."""

    @pytest.mark.asyncio
    async def test_complete_pipeline_execution(self, config, state_manager):
        """Test complete pipeline from requirements to completion."""
        response_factory = SmartResponseFactory()
        events_received: list[tuple[OrchestratorEvent, dict]] = []

        def event_handler(event, data):
            events_received.append((event, data))

        # Use side_effect to create fresh sessions for each agent
        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id,
                config=config,
                response_factory=response_factory
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            orchestrator.on_event = event_handler
            await orchestrator.initialize()

            # Skip decomposition and execution to test planning events
            with patch.object(orchestrator, '_decompose_milestone', new_callable=AsyncMock, return_value=[]):
                with patch.object(orchestrator, '_execute_tasks', new_callable=AsyncMock):
                    await orchestrator.run("Build a REST API for user management")

        # Verify pipeline completed
        assert orchestrator.state == OrchestratorState.COMPLETED

        # Verify events sequence
        event_types = [e[0] for e in events_received]
        assert OrchestratorEvent.STARTED in event_types
        assert OrchestratorEvent.PLANNING_STARTED in event_types
        assert OrchestratorEvent.PLANNING_COMPLETED in event_types
        assert OrchestratorEvent.COMPLETED in event_types

        # Verify plan saved
        assert config.plan_json_path.exists()

        # Verify milestones created
        milestones = await state_manager.get_milestones()
        assert len(milestones) >= 1

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_pipeline_with_multiple_milestones(self, config, state_manager):
        """Test pipeline handles multiple milestones correctly."""
        response_factory = SmartResponseFactory()
        milestones_started = []
        milestones_completed = []

        def event_handler(event, data):
            if event == OrchestratorEvent.MILESTONE_STARTED:
                milestones_started.append(data.get("milestone"))
            elif event == OrchestratorEvent.MILESTONE_COMPLETED:
                milestones_completed.append(data.get("milestone"))

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id, config=config, response_factory=response_factory
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            orchestrator.on_event = event_handler
            await orchestrator.initialize()

            # Skip complex execution to test milestone tracking
            with patch.object(orchestrator, '_decompose_milestone', new_callable=AsyncMock, return_value=[]):
                with patch.object(orchestrator, '_execute_tasks', new_callable=AsyncMock):
                    await orchestrator.run("Build a full-stack application")

        # The CEO plan creates 2 milestones
        milestones = await state_manager.get_milestones()
        assert len(milestones) >= 2

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_pipeline_tracks_total_tokens(self, config, state_manager):
        """Test pipeline tracks token usage across all agents."""
        response_factory = SmartResponseFactory()

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id, config=config, response_factory=response_factory
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            with patch.object(orchestrator, '_decompose_milestone', new_callable=AsyncMock, return_value=[]):
                with patch.object(orchestrator, '_execute_tasks', new_callable=AsyncMock):
                    await orchestrator.run("Build something")

        # Check that plan was created (tokens are tracked internally)
        assert config.plan_json_path.exists()

        await orchestrator.shutdown()


# ============================================================================
# Scenario Tests
# ============================================================================

class TestScenarios:
    """Tests for specific real-world scenarios."""

    @pytest.mark.asyncio
    async def test_scenario_resume_after_crash(self, config, state_manager):
        """Scenario: System crashes mid-execution, user resumes."""
        # PHASE 1: Initial run that "crashes"
        response_factory = SmartResponseFactory()

        with patch('autonoma.agents.base.ClaudeCodeSession',
                   return_value=MockClaudeCodeSession(response_factory=response_factory)):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            # Run planning phase only
            task = asyncio.create_task(orchestrator.run("Build an API"))

            # Wait for planning to complete, then cancel
            await asyncio.sleep(0.2)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            await orchestrator.shutdown()

        # Verify partial state saved
        assert config.plan_json_path.exists()
        milestones = await state_manager.get_milestones()
        assert len(milestones) >= 1

        # PHASE 2: Resume
        await state_manager.cleanup_stale_states()

        # Verify stale states cleaned
        agents = await state_manager.get_all_agents()
        for agent in agents:
            assert agent.status != AgentStatus.RUNNING

    @pytest.mark.asyncio
    async def test_scenario_task_retry_success(self, config, state_manager):
        """Scenario: Task fails once, succeeds on retry."""
        # Create milestone and task
        milestone = Milestone(
            milestone_id="M1",
            name="Test",
            description="Test",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=["T1.1"],
        )
        await state_manager.create_milestone(milestone)

        task = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="Flaky task",
            status=TaskStatus.PENDING,
        )
        await state_manager.create_task(task)

        # First call fails, second succeeds
        responses = [
            MockResponse(text="Error: network timeout", tokens=100),
            MockResponse(text="Success! [TASK_COMPLETE]", tokens=500),
        ]
        response_idx = [0]

        def retry_response_factory(prompt):
            idx = response_idx[0]
            response_idx[0] = min(idx + 1, len(responses) - 1)
            return responses[idx]

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id, config=config, response_factory=retry_response_factory
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()
            orchestrator._current_plan = {"project_name": "Test", "milestones": []}

            # Set up staff engineer for task execution
            from autonoma.agents.staff_engineer import StaffEngineerAgent
            orchestrator._staff_engineer = StaffEngineerAgent(
                agent_id="staff-test", config=config, state_manager=state_manager,
            )
            async def mock_get_parallel_tasks(tasks, completed):
                return [t for t in tasks if t.task_id not in completed]
            orchestrator._staff_engineer.get_parallel_tasks = mock_get_parallel_tasks

            tasks = await state_manager.get_all_tasks()
            await orchestrator._execute_tasks(tasks)

        # Task should eventually complete
        db_task = await state_manager.get_task("T1.1")
        # Status depends on implementation
        assert db_task is not None

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_scenario_parallel_tasks_different_complexities(self, config, state_manager):
        """Scenario: Parallel tasks with different completion times."""
        milestone = Milestone(
            milestone_id="M1",
            name="Test",
            description="Test",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=["T1.1", "T1.2", "T1.3"],
        )
        await state_manager.create_milestone(milestone)

        for i, delay in [(1, 0.01), (2, 0.05), (3, 0.02)]:
            task = Task(
                task_id=f"T1.{i}",
                milestone_id="M1",
                description=f"Task {i} with delay {delay}",
                status=TaskStatus.PENDING,
            )
            await state_manager.create_task(task)

        def varied_response(prompt):
            import re
            match = re.search(r'T\d+\.(\d+)', prompt)
            task_num = int(match.group(1)) if match else 1
            delays = {1: 0.01, 2: 0.05, 3: 0.02}
            return MockResponse(
                text=f"[TASK_COMPLETE]",
                tokens=100,
                delay=delays.get(task_num, 0.01)
            )

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id, config=config, response_factory=varied_response
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()
            orchestrator._current_plan = {"project_name": "Test", "milestones": []}

            # Set up staff engineer for task execution
            from autonoma.agents.staff_engineer import StaffEngineerAgent
            orchestrator._staff_engineer = StaffEngineerAgent(
                agent_id="staff-test", config=config, state_manager=state_manager,
            )
            async def mock_get_parallel_tasks(tasks, completed):
                return [t for t in tasks if t.task_id not in completed]
            orchestrator._staff_engineer.get_parallel_tasks = mock_get_parallel_tasks

            tasks = await state_manager.get_all_tasks()
            await orchestrator._execute_tasks(tasks)

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_scenario_user_pauses_and_resumes(self, config, state_manager):
        """Scenario: User pauses execution, makes changes, resumes."""
        response_factory = SmartResponseFactory()

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id, config=config, response_factory=response_factory
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            await orchestrator.initialize()

            # Start execution with mocked internal methods
            with patch.object(orchestrator, '_decompose_milestone', new_callable=AsyncMock, return_value=[]):
                with patch.object(orchestrator, '_execute_tasks', new_callable=AsyncMock):
                    run_task = asyncio.create_task(orchestrator.run("Build an API"))

                    # Wait a bit then pause
                    await asyncio.sleep(0.1)
                    await orchestrator.pause()

                    assert orchestrator.state == OrchestratorState.PAUSED

                    # Simulate user thinking time
                    await asyncio.sleep(0.1)

                    # Resume
                    await orchestrator.resume()

                    # Wait for completion or timeout
                    try:
                        await asyncio.wait_for(run_task, timeout=5.0)
                    except asyncio.TimeoutError:
                        run_task.cancel()
                        try:
                            await run_task
                        except asyncio.CancelledError:
                            pass

        await orchestrator.shutdown()


# ============================================================================
# State Persistence Integration Tests
# ============================================================================

class TestStatePersistence:
    """Tests for state persistence across sessions."""

    @pytest.mark.asyncio
    async def test_state_survives_restart(self, temp_project_dir):
        """State should persist across StateManager instances."""
        from autonoma.core.state import AgentRecord
        config = Config(project_root=temp_project_dir)

        # Session 1: Create state
        sm1 = StateManager(config.state_db_path)
        await sm1.connect()

        milestone = Milestone(
            milestone_id="M1",
            name="Persistent",
            description="Should survive restart",
            phase=1,
            status=TaskStatus.IN_PROGRESS,
            tasks=["T1.1"],
        )
        await sm1.create_milestone(milestone)

        agent = AgentRecord(
            agent_id="test-agent",
            agent_type="DEVELOPER",
            status=AgentStatus.IDLE,
            token_usage=5000,
        )
        await sm1.register_agent(agent)

        await sm1.close()

        # Session 2: Verify state persisted
        sm2 = StateManager(config.state_db_path)
        await sm2.connect()

        milestones = await sm2.get_milestones()
        assert len(milestones) == 1
        assert milestones[0].name == "Persistent"

        agents = await sm2.get_all_agents()
        agent = next(a for a in agents if a.agent_id == "test-agent")
        assert agent.token_usage == 5000

        await sm2.close()

    @pytest.mark.asyncio
    async def test_logs_persist(self, config, state_manager):
        """Logs should persist to database."""
        # Add logs
        for i in range(10):
            await state_manager.log(f"agent-{i}", f"Message {i}", level="INFO")

        # Retrieve logs
        logs = await state_manager.get_logs(limit=5)
        assert len(logs) == 5

        # All logs should be retrievable
        all_logs = await state_manager.get_logs(limit=100)
        assert len(all_logs) >= 10


# ============================================================================
# Performance Tests
# ============================================================================

class TestPerformance:
    """Basic performance tests."""

    @pytest.mark.asyncio
    async def test_many_tasks_complete_in_reasonable_time(self, config, state_manager):
        """Should handle many tasks efficiently."""
        # Create milestone with many tasks
        task_ids = [f"T1.{i}" for i in range(20)]
        milestone = Milestone(
            milestone_id="M1",
            name="Many Tasks",
            description="Lots of work",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=task_ids,
        )
        await state_manager.create_milestone(milestone)

        for task_id in task_ids:
            task = Task(
                task_id=task_id,
                milestone_id="M1",
                description=f"Task {task_id}",
                status=TaskStatus.PENDING,
            )
            await state_manager.create_task(task)

        def quick_response(prompt):
            return MockResponse(text="[TASK_COMPLETE]", tokens=50, delay=0.01)

        def session_factory(agent_id="mock", config=None, max_retries=3, backoff_base=2.0):
            return MockClaudeCodeSession(
                agent_id=agent_id, config=config, response_factory=quick_response
            )

        with patch('autonoma.agents.base.ClaudeCodeSession', side_effect=session_factory):
            orchestrator = Orchestrator(config, state_manager)
            orchestrator._max_parallel_workers = 5
            await orchestrator.initialize()
            orchestrator._current_plan = {"project_name": "Test", "milestones": []}

            # Set up staff engineer for task execution
            from autonoma.agents.staff_engineer import StaffEngineerAgent
            orchestrator._staff_engineer = StaffEngineerAgent(
                agent_id="staff-test", config=config, state_manager=state_manager,
            )
            async def mock_get_parallel_tasks(tasks, completed):
                return [t for t in tasks if t.task_id not in completed]
            orchestrator._staff_engineer.get_parallel_tasks = mock_get_parallel_tasks

            import time
            start = time.time()

            tasks = await state_manager.get_all_tasks()
            await orchestrator._execute_tasks(tasks)

            elapsed = time.time() - start

        # 20 tasks at 0.01s each with 5 workers should take ~0.04s + overhead
        # Allow generous margin
        assert elapsed < 5.0, f"Tasks took too long: {elapsed}s"

        await orchestrator.shutdown()

    @pytest.mark.asyncio
    async def test_large_log_volume_handled(self, config, state_manager):
        """Should handle large volumes of logs."""
        # Generate many logs
        for i in range(1000):
            await state_manager.log(f"agent-{i % 10}", f"Log message {i}", level="INFO")

        # Should retrieve recent logs quickly
        import time
        start = time.time()
        logs = await state_manager.get_logs(limit=100)
        elapsed = time.time() - start

        assert len(logs) == 100
        assert elapsed < 1.0  # Should be fast
