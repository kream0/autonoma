"""Tests for state management."""

import pytest
from pathlib import Path
import tempfile

from autonoma.core.state import StateManager, Task, TaskStatus, AgentRecord, AgentStatus


@pytest.fixture
async def state_manager():
    """Create a temporary state manager."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_state.db"
        manager = StateManager(db_path)
        await manager.connect()
        yield manager
        await manager.close()


@pytest.mark.asyncio
async def test_create_task(state_manager):
    """Test creating a task."""
    task = Task(
        task_id="T1",
        description="Test task",
        status=TaskStatus.PENDING,
    )

    created = await state_manager.create_task(task)

    assert created.id is not None
    assert created.task_id == "T1"
    assert created.status == TaskStatus.PENDING


@pytest.mark.asyncio
async def test_get_task(state_manager):
    """Test retrieving a task."""
    task = Task(task_id="T2", description="Another task")
    await state_manager.create_task(task)

    retrieved = await state_manager.get_task("T2")

    assert retrieved is not None
    assert retrieved.task_id == "T2"
    assert retrieved.description == "Another task"


@pytest.mark.asyncio
async def test_update_task_status(state_manager):
    """Test updating task status."""
    task = Task(task_id="T3", description="Status test")
    await state_manager.create_task(task)

    await state_manager.update_task_status("T3", TaskStatus.IN_PROGRESS, "worker-001")

    updated = await state_manager.get_task("T3")
    assert updated.status == TaskStatus.IN_PROGRESS
    assert updated.agent_id == "worker-001"


@pytest.mark.asyncio
async def test_increment_retry(state_manager):
    """Test incrementing retry count."""
    task = Task(task_id="T4", description="Retry test")
    await state_manager.create_task(task)

    count = await state_manager.increment_retry("T4")
    assert count == 1

    count = await state_manager.increment_retry("T4")
    assert count == 2


@pytest.mark.asyncio
async def test_register_agent(state_manager):
    """Test registering an agent."""
    agent = AgentRecord(
        agent_id="ceo-001",
        agent_type="CEO",
        status=AgentStatus.RUNNING,
    )

    registered = await state_manager.register_agent(agent)

    assert registered.agent_id == "ceo-001"


@pytest.mark.asyncio
async def test_get_tasks_by_status(state_manager):
    """Test filtering tasks by status."""
    await state_manager.create_task(Task(task_id="T5", description="Pending 1"))
    await state_manager.create_task(Task(task_id="T6", description="Pending 2"))

    task = Task(task_id="T7", description="In progress")
    await state_manager.create_task(task)
    await state_manager.update_task_status("T7", TaskStatus.IN_PROGRESS)

    pending = await state_manager.get_tasks_by_status(TaskStatus.PENDING)
    assert len(pending) == 2

    in_progress = await state_manager.get_tasks_by_status(TaskStatus.IN_PROGRESS)
    assert len(in_progress) == 1


@pytest.mark.asyncio
async def test_statistics(state_manager):
    """Test getting statistics."""
    await state_manager.create_task(Task(task_id="T8", description="Task 1"))
    await state_manager.create_task(Task(task_id="T9", description="Task 2"))
    await state_manager.update_task_status("T9", TaskStatus.MERGED)

    stats = await state_manager.get_statistics()

    assert "tasks" in stats
    assert stats["tasks"].get("PENDING", 0) >= 1
    assert stats["tasks"].get("MERGED", 0) >= 1


@pytest.mark.asyncio
async def test_logging(state_manager):
    """Test log storage and retrieval."""
    await state_manager.log("test-agent", "Test message 1", level="INFO")
    await state_manager.log("test-agent", "Test message 2", level="ERROR")

    logs = await state_manager.get_logs(agent_id="test-agent", limit=10)

    assert len(logs) == 2
    # Verify both messages are present (order may vary if timestamps are identical)
    messages = {log["message"] for log in logs}
    assert "Test message 1" in messages
    assert "Test message 2" in messages
