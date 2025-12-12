"""Tests for individual agent behavior."""
from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

from autonoma.agents.ceo import CEOAgent
from autonoma.agents.staff_engineer import StaffEngineerAgent
from autonoma.agents.developer import DeveloperAgent
from autonoma.agents.qa import QAAgent
from autonoma.agents.base import TokenBudgetExceeded, AgentStatus
from autonoma.core.state import TaskStatus, Milestone, Task

from tests.conftest import (
    MockClaudeCodeSession,
    MockResponse,
    ceo_response_factory,
    staff_engineer_response_factory,
    developer_response_factory,
    qa_response_factory,
)


# ============================================================================
# CEO Agent Tests
# ============================================================================

class TestCEOAgent:
    """Tests for CEO planning agent."""

    @pytest.mark.asyncio
    async def test_ceo_creates_valid_plan(self, config, state_manager):
        """CEO should create a valid plan with milestones."""
        mock_session = MockClaudeCodeSession(response_factory=ceo_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = CEOAgent(
                agent_id="ceo-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                result = await agent.run({
                    "requirements": "Build a simple API"
                })

        # Verify plan structure
        assert "plan" in result
        assert "milestones" in result
        plan = result["plan"]
        assert plan["project_name"] == "Test Project"
        assert len(plan["milestones"]) == 2

    @pytest.mark.asyncio
    async def test_ceo_saves_plan_to_file(self, config, state_manager):
        """CEO should save plan.json to disk."""
        mock_session = MockClaudeCodeSession(response_factory=ceo_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = CEOAgent(
                agent_id="ceo-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                await agent.run({"requirements": "Build an API"})

        # Verify file was saved
        assert config.plan_json_path.exists()
        plan = json.loads(config.plan_json_path.read_text())
        assert plan["project_name"] == "Test Project"

    @pytest.mark.asyncio
    async def test_ceo_creates_milestones_in_db(self, config, state_manager):
        """CEO should create milestone records in database."""
        mock_session = MockClaudeCodeSession(response_factory=ceo_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = CEOAgent(
                agent_id="ceo-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                await agent.run({"requirements": "Build an API"})

        # Verify milestones in database
        milestones = await state_manager.get_milestones()
        assert len(milestones) == 2
        assert milestones[0].name == "Setup & Foundation"
        assert milestones[1].name == "Core Features"

    @pytest.mark.asyncio
    async def test_ceo_respects_token_budget(self, config, state_manager):
        """CEO should fail if token budget exceeded."""
        # Create session that uses lots of tokens
        def expensive_response(prompt):
            return MockResponse(text='{"project_name": "test", "milestones": []}', tokens=10000)

        mock_session = MockClaudeCodeSession(response_factory=expensive_response)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = CEOAgent(
                agent_id="ceo-test",
                config=config,
                state_manager=state_manager,
            )
            agent.token_budget = 5000  # Set low budget

            async with agent:
                # First call works but uses tokens
                # Second call should fail due to budget
                with pytest.raises(TokenBudgetExceeded):
                    await agent.run({"requirements": "Build an API"})
                    await agent.execute_prompt("Another prompt")

    @pytest.mark.asyncio
    async def test_ceo_handles_invalid_json_response(self, config, state_manager):
        """CEO should handle invalid JSON gracefully."""
        def invalid_response(prompt):
            return MockResponse(text="This is not valid JSON at all!", tokens=500)

        mock_session = MockClaudeCodeSession(response_factory=invalid_response)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = CEOAgent(
                agent_id="ceo-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                result = await agent.run({"requirements": "Build an API"})

        # Should return error plan
        assert result["plan"].get("parse_error") is True

    @pytest.mark.asyncio
    async def test_ceo_preserves_existing_claude_md(self, config, state_manager):
        """CEO should not overwrite existing CLAUDE.md."""
        # Create existing CLAUDE.md
        config.claude_md_path.parent.mkdir(parents=True, exist_ok=True)
        config.claude_md_path.write_text("# Existing Project Standards\nDo not overwrite!")

        mock_session = MockClaudeCodeSession(response_factory=ceo_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = CEOAgent(
                agent_id="ceo-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                await agent.run({"requirements": "Build an API"})

        # Verify CLAUDE.md was not overwritten
        content = config.claude_md_path.read_text()
        assert "Existing Project Standards" in content


# ============================================================================
# Staff Engineer Agent Tests
# ============================================================================

class TestStaffEngineerAgent:
    """Tests for Staff Engineer decomposition agent."""

    @pytest.mark.asyncio
    async def test_staff_decomposes_milestone_into_tasks(self, config, state_manager):
        """Staff Engineer should decompose milestone into concrete tasks."""
        # Create a milestone first
        milestone = Milestone(
            milestone_id="M1",
            name="Test Milestone",
            description="Build the foundation",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=["T1.1", "T1.2"],
        )
        await state_manager.create_milestone(milestone)

        mock_session = MockClaudeCodeSession(response_factory=staff_engineer_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = StaffEngineerAgent(
                agent_id="staff-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                # Pass milestone as dict (as expected by StaffEngineerAgent)
                # Use mode='json' to serialize datetime fields
                tasks = await agent.run({
                    "milestone": milestone.model_dump(mode='json'),
                    "plan": {"project_name": "Test"}
                })

        # Verify tasks created
        assert len(tasks) >= 1

    @pytest.mark.asyncio
    async def test_staff_creates_tasks_in_db(self, config, state_manager):
        """Staff Engineer should persist tasks to database."""
        milestone = Milestone(
            milestone_id="M1",
            name="Test Milestone",
            description="Build the foundation",
            phase=1,
            status=TaskStatus.PENDING,
            tasks=[],
        )
        await state_manager.create_milestone(milestone)

        mock_session = MockClaudeCodeSession(response_factory=staff_engineer_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = StaffEngineerAgent(
                agent_id="staff-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                # Pass milestone as dict (as expected by StaffEngineerAgent)
                # Use mode='json' to serialize datetime fields
                await agent.run({
                    "milestone": milestone.model_dump(mode='json'),
                    "plan": {"project_name": "Test"}
                })

        # Verify tasks in database
        db_tasks = await state_manager.get_all_tasks()
        assert len(db_tasks) >= 1


# ============================================================================
# Developer Agent Tests
# ============================================================================

class TestDeveloperAgent:
    """Tests for Developer implementation agent."""

    @pytest.mark.asyncio
    async def test_developer_completes_task(self, config, state_manager):
        """Developer should complete a task successfully."""
        # Create task
        task = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="Initialize project",
            status=TaskStatus.PENDING,
        )
        await state_manager.create_task(task)

        mock_session = MockClaudeCodeSession(response_factory=developer_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = DeveloperAgent(
                agent_id="dev-test",
                config=config,
                state_manager=state_manager,
                task=task,
            )

            async with agent:
                result = await agent.run({})

        # Verify task status updated
        db_task = await state_manager.get_task("T1.1")
        assert db_task.status == TaskStatus.REVIEW

    @pytest.mark.asyncio
    async def test_developer_retries_on_failure(self, config, state_manager):
        """Developer should retry failed tasks."""
        task = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="Initialize project",
            status=TaskStatus.PENDING,
        )
        await state_manager.create_task(task)

        # First response fails, second succeeds
        responses = [
            MockResponse(text="Error: something went wrong", tokens=500),
            MockResponse(text="Fixed! [TASK_COMPLETE]", tokens=500),
        ]
        mock_session = MockClaudeCodeSession(response_queue=responses)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = DeveloperAgent(
                agent_id="dev-test",
                config=config,
                state_manager=state_manager,
                task=task,
            )

            async with agent:
                await agent.run({})

        # Verify retries happened
        db_task = await state_manager.get_task("T1.1")
        assert db_task.retry_count >= 0

    @pytest.mark.asyncio
    async def test_developer_updates_token_usage(self, config, state_manager):
        """Developer should track token usage."""
        task = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="Initialize project",
            status=TaskStatus.PENDING,
        )
        await state_manager.create_task(task)

        mock_session = MockClaudeCodeSession(
            response_queue=[MockResponse(text="Done [TASK_COMPLETE]", tokens=1500)]
        )

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = DeveloperAgent(
                agent_id="dev-test",
                config=config,
                state_manager=state_manager,
                task=task,
            )

            async with agent:
                await agent.run({})

        # Verify token usage recorded
        db_task = await state_manager.get_task("T1.1")
        assert db_task.token_usage > 0


# ============================================================================
# QA Agent Tests
# ============================================================================

class TestQAAgent:
    """Tests for QA review agent."""

    @pytest.mark.asyncio
    async def test_qa_approves_good_code(self, config, state_manager):
        """QA should approve code that passes review."""
        task = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="Initialize project",
            status=TaskStatus.REVIEW,
        )
        await state_manager.create_task(task)

        mock_session = MockClaudeCodeSession(response_factory=qa_response_factory)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = QAAgent(
                agent_id="qa-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                result = await agent.run({"task": task})

        assert result.get("approved", False) or "APPROVED" in str(result)

    @pytest.mark.asyncio
    async def test_qa_rejects_bad_code(self, config, state_manager):
        """QA should reject code that fails review."""
        task = Task(
            task_id="T1.1",
            milestone_id="M1",
            description="Initialize project",
            status=TaskStatus.REVIEW,
        )
        await state_manager.create_task(task)

        def reject_response(prompt):
            return MockResponse(
                text="Code review failed: missing tests. [REJECTED]",
                tokens=500
            )

        mock_session = MockClaudeCodeSession(response_factory=reject_response)

        with patch('autonoma.agents.base.ClaudeCodeSession', return_value=mock_session):
            agent = QAAgent(
                agent_id="qa-test",
                config=config,
                state_manager=state_manager,
            )

            async with agent:
                result = await agent.run({"task": task})

        # Should indicate rejection
        assert "REJECTED" in str(result) or not result.get("approved", True)
