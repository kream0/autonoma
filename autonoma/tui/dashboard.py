"""Dashboard components for Autonoma TUI."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from rich.console import RenderableType
from rich.panel import Panel
from rich.progress import BarColumn, Progress, TaskID, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.text import Text
from textual.widgets import Static

from autonoma.core.state import AgentStatus, TaskStatus


class StatusColors:
    """Color mapping for statuses."""

    TASK_COLORS = {
        TaskStatus.PENDING: "dim",
        TaskStatus.IN_PROGRESS: "yellow",
        TaskStatus.REVIEW: "cyan",
        TaskStatus.MERGED: "green",
        TaskStatus.FAILED: "red",
        TaskStatus.BLOCKED: "magenta",
    }

    AGENT_COLORS = {
        AgentStatus.IDLE: "dim",
        AgentStatus.RUNNING: "green",
        AgentStatus.WAITING: "yellow",
        AgentStatus.ERROR: "red",
        AgentStatus.TERMINATED: "dim",
    }


class AgentStatusWidget(Static):
    """Widget showing status of all agents."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._agents: list[dict[str, Any]] = []

    def update_agents(self, agents: list[dict[str, Any]]) -> None:
        """Update the agent data."""
        self._agents = agents
        self.refresh()

    def render(self) -> RenderableType:
        """Render the agent status table."""
        table = Table(title="Agents", expand=True, border_style="blue")
        table.add_column("ID", style="cyan", width=12)
        table.add_column("Type", width=15)
        table.add_column("Status", width=12)
        table.add_column("Task", width=20)
        table.add_column("Tokens", justify="right", width=10)

        for agent in self._agents:
            status = AgentStatus(agent.get("status", "IDLE"))
            color = StatusColors.AGENT_COLORS.get(status, "white")

            table.add_row(
                agent.get("agent_id", ""),
                agent.get("agent_type", ""),
                Text(status.value, style=color),
                agent.get("current_task_id", "-") or "-",
                f"{agent.get('token_usage', 0):,}",
            )

        if not self._agents:
            table.add_row("No agents", "", "", "", "")

        return Panel(table, border_style="blue")


class TaskListWidget(Static):
    """Widget showing task list with status."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._tasks: list[dict[str, Any]] = []

    def update_tasks(self, tasks: list[dict[str, Any]]) -> None:
        """Update the task data."""
        self._tasks = tasks
        self.refresh()

    def render(self) -> RenderableType:
        """Render the task list."""
        table = Table(title="Tasks", expand=True, border_style="green")
        table.add_column("ID", style="cyan", width=10)
        table.add_column("Description", width=35)
        table.add_column("Status", width=12)
        table.add_column("Agent", width=12)
        table.add_column("Tokens", justify="right", width=8)
        table.add_column("R", justify="center", width=3)  # Retries column (compact)

        for task in self._tasks[:20]:  # Limit to 20 visible
            status = TaskStatus(task.get("status", "PENDING"))
            color = StatusColors.TASK_COLORS.get(status, "white")

            desc = task.get("description", "")[:33]
            if len(task.get("description", "")) > 33:
                desc += "..."

            retry_count = task.get("retry_count", 0)
            retry_text = Text(str(retry_count), style="red" if retry_count > 0 else "dim")

            table.add_row(
                task.get("task_id", ""),
                desc,
                Text(status.value, style=color),
                task.get("agent_id", "-") or "-",
                f"{task.get('token_usage', 0):,}",
                retry_text,
            )

        if not self._tasks:
            table.add_row("No tasks", "", "", "", "", "")

        remaining = len(self._tasks) - 20
        if remaining > 0:
            table.add_row(f"... and {remaining} more", "", "", "", "", "")

        return Panel(table, border_style="green")


class MilestoneWidget(Static):
    """Widget showing milestone progress."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._milestones: list[dict[str, Any]] = []
        self._task_stats: dict[str, dict[str, int]] = {}  # milestone_id -> {completed, total}

    def update_milestones(self, milestones: list[dict[str, Any]]) -> None:
        """Update milestone data."""
        self._milestones = milestones
        self.refresh()

    def update_task_stats(self, task_stats: dict[str, dict[str, int]]) -> None:
        """Update task completion stats per milestone."""
        self._task_stats = task_stats
        self.refresh()

    def render(self) -> RenderableType:
        """Render milestone progress."""
        table = Table(title="Milestones", expand=True, border_style="yellow")
        table.add_column("Phase", width=6)
        table.add_column("Name", width=25)
        table.add_column("Status", width=12)
        table.add_column("Progress", width=15)

        for milestone in self._milestones:
            status = TaskStatus(milestone.get("status", "PENDING"))
            color = StatusColors.TASK_COLORS.get(status, "white")
            tasks = milestone.get("tasks", [])
            milestone_id = milestone.get("milestone_id", "")

            # Get task completion stats if available
            stats = self._task_stats.get(milestone_id, {})
            completed = stats.get("completed", 0)
            total = stats.get("total", len(tasks))

            if total > 0:
                progress_text = f"{completed}/{total}"
                if completed == total and total > 0:
                    progress_style = "green"
                elif completed > 0:
                    progress_style = "yellow"
                else:
                    progress_style = "dim"
            else:
                progress_text = f"{len(tasks)} tasks"
                progress_style = "dim"

            table.add_row(
                str(milestone.get("phase", 0)),
                milestone.get("name", "")[:23],
                Text(status.value, style=color),
                Text(progress_text, style=progress_style),
            )

        if not self._milestones:
            table.add_row("-", "No milestones", "", "")

        return Panel(table, border_style="yellow")


class LogWidget(Static):
    """Widget showing recent logs."""

    MAX_LINES = 15

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._logs: list[dict[str, Any]] = []
        self._total_count: int = 0

    def add_log(self, log: dict[str, Any]) -> None:
        """Add a log entry."""
        self._logs.insert(0, log)
        self._logs = self._logs[: self.MAX_LINES]
        self._total_count += 1
        self.refresh()

    def update_logs(self, logs: list[dict[str, Any]]) -> None:
        """Update all logs."""
        self._logs = logs[: self.MAX_LINES]
        self.refresh()

    def render(self) -> RenderableType:
        """Render log entries."""
        lines = []

        for log in self._logs:
            timestamp = log.get("timestamp", "")
            if isinstance(timestamp, datetime):
                timestamp = timestamp.strftime("%H:%M:%S")
            elif isinstance(timestamp, str) and len(timestamp) > 8:
                timestamp = timestamp[11:19]  # Extract time portion

            level = log.get("level", "INFO")
            level_colors = {
                "DEBUG": "dim",
                "INFO": "blue",
                "WARNING": "yellow",
                "ERROR": "red",
                "OUTPUT": "green",
            }
            color = level_colors.get(level, "white")

            agent = log.get("agent_id", "system")[:10]
            # Truncate message but show more chars (80 instead of 60)
            message = log.get("message", "")
            if len(message) > 80:
                message = message[:77] + "..."

            line = Text()
            line.append(f"[{timestamp}] ", style="dim")
            line.append(f"[{level:<7}] ", style=color)
            line.append(f"{agent}: ", style="cyan")
            line.append(message)
            lines.append(line)

        if not lines:
            lines.append(Text("No logs yet...", style="dim"))

        content = Text("\n").join(lines)
        return Panel(content, title="Logs", border_style="magenta")


class StatsWidget(Static):
    """Widget showing overall statistics."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._stats: dict[str, Any] = {}
        self._start_time: datetime | None = None

    def update_stats(self, stats: dict[str, Any]) -> None:
        """Update statistics."""
        self._stats = stats
        if not self._start_time:
            self._start_time = datetime.now()
        self.refresh()

    def render(self) -> RenderableType:
        """Render statistics panel."""
        task_stats = self._stats.get("tasks", {})
        agent_stats = self._stats.get("agents", {})
        total_tokens = self._stats.get("total_tokens", 0)

        # Calculate totals
        total_tasks = sum(task_stats.values())
        completed = task_stats.get("MERGED", 0)
        in_progress = task_stats.get("IN_PROGRESS", 0)
        pending = task_stats.get("PENDING", 0)
        review = task_stats.get("REVIEW", 0)
        failed = task_stats.get("FAILED", 0) + task_stats.get("BLOCKED", 0)

        # Agent counts
        active_agents = agent_stats.get("RUNNING", 0)
        total_agents = sum(agent_stats.values())

        # Calculate elapsed time
        elapsed = ""
        if self._start_time:
            delta = datetime.now() - self._start_time
            hours = int(delta.total_seconds() // 3600)
            minutes = int((delta.total_seconds() % 3600) // 60)
            seconds = int(delta.total_seconds() % 60)
            if hours > 0:
                elapsed = f"{hours}:{minutes:02d}:{seconds:02d}"
            else:
                elapsed = f"{minutes:02d}:{seconds:02d}"

        # Build progress bar
        progress_pct = (completed / total_tasks * 100) if total_tasks > 0 else 0

        content = Table.grid(padding=1)
        content.add_column(justify="left")
        content.add_column(justify="right")

        content.add_row("Tasks:", f"{completed}/{total_tasks}")
        content.add_row("Progress:", Text(f"{progress_pct:.1f}%", style="green" if progress_pct == 100 else "yellow" if progress_pct > 0 else "dim"))
        content.add_row("Pending:", Text(str(pending), style="dim" if pending == 0 else "white"))
        content.add_row("In Progress:", Text(str(in_progress + review), style="yellow" if in_progress + review > 0 else "dim"))
        content.add_row("Failed:", Text(str(failed), style="red" if failed else "green"))
        content.add_row("Agents:", Text(f"{active_agents}/{total_agents}", style="green" if active_agents > 0 else "dim"))
        content.add_row("Tokens:", f"{total_tokens:,}")
        content.add_row("Elapsed:", elapsed or "-")

        return Panel(content, title="Statistics", border_style="cyan")


class Dashboard:
    """Standalone Rich-based dashboard for non-Textual usage."""

    def __init__(self) -> None:
        """Initialize dashboard."""
        self._progress = Progress(
            TextColumn("[bold blue]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
        )
        self._main_task: TaskID | None = None

    def start(self) -> None:
        """Start the progress display."""
        self._progress.start()
        self._main_task = self._progress.add_task("Autonoma", total=100)

    def stop(self) -> None:
        """Stop the progress display."""
        self._progress.stop()

    def update_progress(self, percentage: float, description: str = "") -> None:
        """Update the main progress bar."""
        if self._main_task is not None:
            self._progress.update(
                self._main_task,
                completed=percentage,
                description=description or "Autonoma",
            )

    def __enter__(self) -> "Dashboard":
        """Context manager entry."""
        self.start()
        return self

    def __exit__(self, *args: Any) -> None:
        """Context manager exit."""
        self.stop()
