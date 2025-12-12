"""State management using SQLite for Autonoma."""
from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

import aiosqlite
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """Task status enumeration."""

    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    MERGED = "MERGED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"


class AgentStatus(str, Enum):
    """Agent status enumeration."""

    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    ERROR = "ERROR"
    TERMINATED = "TERMINATED"


class Task(BaseModel):
    """Task model for tracking work items."""

    id: int | None = None
    task_id: str
    description: str
    agent_id: str | None = None
    status: TaskStatus = TaskStatus.PENDING
    branch_name: str | None = None
    worktree_path: str | None = None
    retry_count: int = 0
    token_usage: int = 0
    parent_task_id: str | None = None
    dependencies: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AgentRecord(BaseModel):
    """Agent record for tracking agent instances."""

    id: int | None = None
    agent_id: str
    agent_type: str
    status: AgentStatus = AgentStatus.IDLE
    current_task_id: str | None = None
    pid: int | None = None
    token_usage: int = 0
    started_at: datetime | None = None
    last_activity: datetime = Field(default_factory=datetime.utcnow)


class Milestone(BaseModel):
    """Milestone model for high-level planning."""

    id: int | None = None
    milestone_id: str
    name: str
    description: str
    phase: int
    status: TaskStatus = TaskStatus.PENDING
    tasks: list[str] = Field(default_factory=list)
    estimated_tokens: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StateManager:
    """Async SQLite state manager for Autonoma."""

    def __init__(self, db_path: Path):
        """Initialize state manager with database path."""
        self.db_path = db_path
        self._connection: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        """Connect to the database and create tables."""
        self._connection = await aiosqlite.connect(self.db_path)
        self._connection.row_factory = aiosqlite.Row
        await self._create_tables()

    async def close(self) -> None:
        """Close the database connection."""
        if self._connection:
            await self._connection.close()
            self._connection = None

    async def _create_tables(self) -> None:
        """Create database tables if they don't exist."""
        assert self._connection is not None

        await self._connection.executescript("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT UNIQUE NOT NULL,
                description TEXT NOT NULL,
                agent_id TEXT,
                status TEXT DEFAULT 'PENDING',
                branch_name TEXT,
                worktree_path TEXT,
                retry_count INTEGER DEFAULT 0,
                token_usage INTEGER DEFAULT 0,
                parent_task_id TEXT,
                dependencies TEXT DEFAULT '[]',
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT UNIQUE NOT NULL,
                agent_type TEXT NOT NULL,
                status TEXT DEFAULT 'IDLE',
                current_task_id TEXT,
                pid INTEGER,
                token_usage INTEGER DEFAULT 0,
                started_at TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS milestones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                milestone_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                phase INTEGER DEFAULT 0,
                status TEXT DEFAULT 'PENDING',
                tasks TEXT DEFAULT '[]',
                estimated_tokens INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                level TEXT DEFAULT 'INFO',
                message TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
            CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
            CREATE INDEX IF NOT EXISTS idx_logs_agent ON logs(agent_id);
        """)
        await self._connection.commit()

    # Task operations
    async def create_task(self, task: Task) -> Task:
        """Create a new task."""
        assert self._connection is not None

        cursor = await self._connection.execute(
            """
            INSERT INTO tasks (
                task_id, description, agent_id, status, branch_name,
                worktree_path, retry_count, token_usage, parent_task_id,
                dependencies, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task.task_id,
                task.description,
                task.agent_id,
                task.status.value,
                task.branch_name,
                task.worktree_path,
                task.retry_count,
                task.token_usage,
                task.parent_task_id,
                json.dumps(task.dependencies),
                json.dumps(task.metadata),
            ),
        )
        await self._connection.commit()
        task.id = cursor.lastrowid
        return task

    async def get_task(self, task_id: str) -> Task | None:
        """Get a task by task_id."""
        assert self._connection is not None

        async with self._connection.execute(
            "SELECT * FROM tasks WHERE task_id = ?", (task_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return self._row_to_task(row)
        return None

    async def get_tasks_by_status(self, status: TaskStatus) -> list[Task]:
        """Get all tasks with a specific status."""
        assert self._connection is not None

        tasks = []
        async with self._connection.execute(
            "SELECT * FROM tasks WHERE status = ? ORDER BY created_at", (status.value,)
        ) as cursor:
            async for row in cursor:
                tasks.append(self._row_to_task(row))
        return tasks

    async def get_all_tasks(self) -> list[Task]:
        """Get all tasks."""
        assert self._connection is not None

        tasks = []
        async with self._connection.execute(
            "SELECT * FROM tasks ORDER BY created_at"
        ) as cursor:
            async for row in cursor:
                tasks.append(self._row_to_task(row))
        return tasks

    async def update_task(self, task: Task) -> Task:
        """Update a task."""
        assert self._connection is not None

        task.updated_at = datetime.utcnow()
        await self._connection.execute(
            """
            UPDATE tasks SET
                description = ?, agent_id = ?, status = ?, branch_name = ?,
                worktree_path = ?, retry_count = ?, token_usage = ?,
                dependencies = ?, metadata = ?, updated_at = ?
            WHERE task_id = ?
            """,
            (
                task.description,
                task.agent_id,
                task.status.value,
                task.branch_name,
                task.worktree_path,
                task.retry_count,
                task.token_usage,
                json.dumps(task.dependencies),
                json.dumps(task.metadata),
                task.updated_at.isoformat(),
                task.task_id,
            ),
        )
        await self._connection.commit()
        return task

    async def update_task_status(
        self, task_id: str, status: TaskStatus, agent_id: str | None = None
    ) -> None:
        """Update task status."""
        assert self._connection is not None

        if agent_id:
            await self._connection.execute(
                "UPDATE tasks SET status = ?, agent_id = ?, updated_at = ? WHERE task_id = ?",
                (status.value, agent_id, datetime.utcnow().isoformat(), task_id),
            )
        else:
            await self._connection.execute(
                "UPDATE tasks SET status = ?, updated_at = ? WHERE task_id = ?",
                (status.value, datetime.utcnow().isoformat(), task_id),
            )
        await self._connection.commit()

    async def increment_retry(self, task_id: str) -> int:
        """Increment retry count for a task and return new count."""
        assert self._connection is not None

        await self._connection.execute(
            "UPDATE tasks SET retry_count = retry_count + 1, updated_at = ? WHERE task_id = ?",
            (datetime.utcnow().isoformat(), task_id),
        )
        await self._connection.commit()

        async with self._connection.execute(
            "SELECT retry_count FROM tasks WHERE task_id = ?", (task_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return row["retry_count"] if row else 0

    async def update_task_tokens(self, task_id: str, tokens: int) -> None:
        """Update token usage for a task."""
        assert self._connection is not None

        await self._connection.execute(
            "UPDATE tasks SET token_usage = token_usage + ?, updated_at = ? WHERE task_id = ?",
            (tokens, datetime.utcnow().isoformat(), task_id),
        )
        await self._connection.commit()

    def _row_to_task(self, row: aiosqlite.Row) -> Task:
        """Convert a database row to a Task model."""
        return Task(
            id=row["id"],
            task_id=row["task_id"],
            description=row["description"],
            agent_id=row["agent_id"],
            status=TaskStatus(row["status"]),
            branch_name=row["branch_name"],
            worktree_path=row["worktree_path"],
            retry_count=row["retry_count"],
            token_usage=row["token_usage"],
            parent_task_id=row["parent_task_id"],
            dependencies=json.loads(row["dependencies"]),
            metadata=json.loads(row["metadata"]),
        )

    # Agent operations
    async def register_agent(self, agent: AgentRecord) -> AgentRecord:
        """Register a new agent."""
        assert self._connection is not None

        cursor = await self._connection.execute(
            """
            INSERT INTO agents (
                agent_id, agent_type, status, current_task_id, pid,
                token_usage, started_at, last_activity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(agent_id) DO UPDATE SET
                status = excluded.status,
                current_task_id = excluded.current_task_id,
                pid = excluded.pid,
                started_at = excluded.started_at,
                last_activity = excluded.last_activity
            """,
            (
                agent.agent_id,
                agent.agent_type,
                agent.status.value,
                agent.current_task_id,
                agent.pid,
                agent.token_usage,
                agent.started_at.isoformat() if agent.started_at else None,
                agent.last_activity.isoformat(),
            ),
        )
        await self._connection.commit()
        agent.id = cursor.lastrowid
        return agent

    async def get_agent(self, agent_id: str) -> AgentRecord | None:
        """Get an agent by agent_id."""
        assert self._connection is not None

        async with self._connection.execute(
            "SELECT * FROM agents WHERE agent_id = ?", (agent_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return self._row_to_agent(row)
        return None

    async def get_all_agents(self) -> list[AgentRecord]:
        """Get all agents."""
        assert self._connection is not None

        agents = []
        async with self._connection.execute("SELECT * FROM agents") as cursor:
            async for row in cursor:
                agents.append(self._row_to_agent(row))
        return agents

    async def update_agent_status(
        self, agent_id: str, status: AgentStatus, task_id: str | None = None
    ) -> None:
        """Update agent status."""
        assert self._connection is not None

        await self._connection.execute(
            """
            UPDATE agents SET status = ?, current_task_id = ?, last_activity = ?
            WHERE agent_id = ?
            """,
            (status.value, task_id, datetime.utcnow().isoformat(), agent_id),
        )
        await self._connection.commit()

    async def update_agent_tokens(self, agent_id: str, tokens: int) -> None:
        """Update agent token usage."""
        assert self._connection is not None

        await self._connection.execute(
            "UPDATE agents SET token_usage = token_usage + ?, last_activity = ? WHERE agent_id = ?",
            (tokens, datetime.utcnow().isoformat(), agent_id),
        )
        await self._connection.commit()

    async def cleanup_stale_states(self) -> int:
        """Reset stale agent and task states from interrupted sessions.

        Called on resume to clean up agents/tasks that show RUNNING
        but aren't actually running (from previous interrupted session).

        Returns:
            Number of records cleaned up
        """
        assert self._connection is not None

        cleaned = 0

        # Reset RUNNING agents to IDLE (they'll be restarted if needed)
        cursor = await self._connection.execute(
            "UPDATE agents SET status = ? WHERE status = ?",
            (AgentStatus.IDLE.value, AgentStatus.RUNNING.value),
        )
        cleaned += cursor.rowcount

        # Reset IN_PROGRESS tasks to PENDING (they'll be picked up again)
        cursor = await self._connection.execute(
            "UPDATE tasks SET status = ?, agent_id = NULL WHERE status = ?",
            (TaskStatus.PENDING.value, TaskStatus.IN_PROGRESS.value),
        )
        cleaned += cursor.rowcount

        await self._connection.commit()
        return cleaned

    def _row_to_agent(self, row: aiosqlite.Row) -> AgentRecord:
        """Convert a database row to an AgentRecord model."""
        return AgentRecord(
            id=row["id"],
            agent_id=row["agent_id"],
            agent_type=row["agent_type"],
            status=AgentStatus(row["status"]),
            current_task_id=row["current_task_id"],
            pid=row["pid"],
            token_usage=row["token_usage"],
        )

    # Milestone operations
    async def create_milestone(self, milestone: Milestone) -> Milestone:
        """Create a new milestone."""
        assert self._connection is not None

        cursor = await self._connection.execute(
            """
            INSERT INTO milestones (
                milestone_id, name, description, phase, status, tasks, estimated_tokens
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                milestone.milestone_id,
                milestone.name,
                milestone.description,
                milestone.phase,
                milestone.status.value,
                json.dumps(milestone.tasks),
                milestone.estimated_tokens,
            ),
        )
        await self._connection.commit()
        milestone.id = cursor.lastrowid
        return milestone

    async def get_milestones(self) -> list[Milestone]:
        """Get all milestones."""
        assert self._connection is not None

        milestones = []
        async with self._connection.execute(
            "SELECT * FROM milestones ORDER BY phase"
        ) as cursor:
            async for row in cursor:
                milestones.append(
                    Milestone(
                        id=row["id"],
                        milestone_id=row["milestone_id"],
                        name=row["name"],
                        description=row["description"],
                        phase=row["phase"],
                        status=TaskStatus(row["status"]),
                        tasks=json.loads(row["tasks"]),
                        estimated_tokens=row["estimated_tokens"],
                    )
                )
        return milestones

    async def update_milestone_status(
        self, milestone_id: str, status: TaskStatus
    ) -> None:
        """Update milestone status."""
        assert self._connection is not None

        await self._connection.execute(
            "UPDATE milestones SET status = ? WHERE milestone_id = ?",
            (status.value, milestone_id),
        )
        await self._connection.commit()

    # Logging operations
    async def log(
        self,
        agent_id: str,
        message: str,
        level: str = "INFO",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Log a message for an agent."""
        assert self._connection is not None

        await self._connection.execute(
            "INSERT INTO logs (agent_id, level, message, metadata) VALUES (?, ?, ?, ?)",
            (agent_id, level, message, json.dumps(metadata or {})),
        )
        await self._connection.commit()

    async def get_logs(
        self, agent_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        """Get recent logs, optionally filtered by agent."""
        assert self._connection is not None

        logs = []
        if agent_id:
            query = "SELECT * FROM logs WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?"
            params = (agent_id, limit)
        else:
            query = "SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?"
            params = (limit,)

        async with self._connection.execute(query, params) as cursor:
            async for row in cursor:
                logs.append(
                    {
                        "id": row["id"],
                        "agent_id": row["agent_id"],
                        "level": row["level"],
                        "message": row["message"],
                        "metadata": json.loads(row["metadata"]),
                        "timestamp": row["timestamp"],
                    }
                )
        return logs

    # Statistics
    async def get_statistics(self) -> dict[str, Any]:
        """Get overall statistics."""
        assert self._connection is not None

        stats: dict[str, Any] = {"tasks": {}, "agents": {}, "total_tokens": 0}

        # Task counts by status
        async with self._connection.execute(
            "SELECT status, COUNT(*) as count FROM tasks GROUP BY status"
        ) as cursor:
            async for row in cursor:
                stats["tasks"][row["status"]] = row["count"]

        # Agent counts by status
        async with self._connection.execute(
            "SELECT status, COUNT(*) as count FROM agents GROUP BY status"
        ) as cursor:
            async for row in cursor:
                stats["agents"][row["status"]] = row["count"]

        # Total token usage - sum from both tasks AND agents tables
        # Agents track tokens in real-time, tasks may have final token counts
        task_tokens = 0
        agent_tokens = 0

        async with self._connection.execute(
            "SELECT SUM(token_usage) as total FROM tasks"
        ) as cursor:
            row = await cursor.fetchone()
            task_tokens = row["total"] or 0

        async with self._connection.execute(
            "SELECT SUM(token_usage) as total FROM agents"
        ) as cursor:
            row = await cursor.fetchone()
            agent_tokens = row["total"] or 0

        # Use the larger value (agents have real-time data, tasks have final)
        stats["total_tokens"] = max(task_tokens, agent_tokens)

        return stats
