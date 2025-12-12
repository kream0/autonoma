"""Textual TUI Application for Autonoma."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container
from textual.widgets import Footer, Header, Static

from autonoma.core.config import Config
from autonoma.core.orchestrator import Orchestrator, OrchestratorEvent, OrchestratorState
from autonoma.core.state import StateManager
from autonoma.tui.dashboard import (
    AgentStatusWidget,
    LogWidget,
    MilestoneWidget,
    StatsWidget,
    TaskListWidget,
)


class StatusBar(Static):
    """Status bar showing orchestrator state."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._state = OrchestratorState.IDLE
        self._message = ""

    def update_state(self, state: OrchestratorState, message: str = "") -> None:
        """Update the status bar."""
        self._state = state
        self._message = message
        self.refresh()

    def render(self) -> str:
        """Render status bar content."""
        state_emoji = {
            OrchestratorState.IDLE: "[]",
            OrchestratorState.PLANNING: "[PLAN]",
            OrchestratorState.EXECUTING: "[EXEC]",
            OrchestratorState.REVIEWING: "[REVIEW]",
            OrchestratorState.COMPLETED: "[DONE]",
            OrchestratorState.FAILED: "[FAIL]",
            OrchestratorState.PAUSED: "[PAUSE]",
        }
        indicator = state_emoji.get(self._state, "[?]")
        msg = f" - {self._message}" if self._message else ""
        # Add help text for selection
        help_text = " | Shift+drag: select text | d: dump to file"
        return f"{indicator} {self._state.value}{msg}{help_text}"


class AutonomaApp(App[None]):
    """Main Textual application for Autonoma."""

    TITLE = "Autonoma"
    SUB_TITLE = "Autonomous Software Development"

    # Enable text selection - allows terminal to handle mouse selection
    # Hold Shift while selecting to bypass Textual's mouse handling
    ENABLE_COMMAND_PALETTE = False

    CSS = """
    Screen {
        layout: grid;
        grid-size: 2 3;
        grid-columns: 1fr 1fr;
        grid-rows: auto 1fr 1fr;
    }

    #status-bar {
        column-span: 2;
        height: 3;
        background: $surface;
        border: solid $primary;
        padding: 0 1;
    }

    #agents-container {
        height: 100%;
    }

    #stats-container {
        height: 100%;
    }

    #tasks-container {
        height: 100%;
    }

    #milestones-container {
        height: 100%;
    }

    #logs-container {
        column-span: 2;
        height: 100%;
    }

    #logs-container.hidden {
        display: none;
    }

    .widget-container {
        padding: 0 1;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True),
        Binding("ctrl+c", "quit", "Quit", priority=True, show=False),
        Binding("ctrl+q", "quit", "Quit", priority=True, show=False),
        Binding("escape", "quit", "Quit", priority=True, show=False),
        Binding("p", "pause", "Pause/Resume"),
        Binding("r", "refresh", "Refresh"),
        Binding("l", "toggle_logs", "Hide/Show Logs"),
        Binding("d", "dump_state", "Dump to File"),
    ]

    def __init__(
        self,
        config: Config | None = None,
        state_manager: StateManager | None = None,
        orchestrator: Orchestrator | None = None,
    ) -> None:
        """Initialize the app."""
        super().__init__()
        self.config = config or Config()
        self._state_manager = state_manager
        self._orchestrator = orchestrator
        self._refresh_task: asyncio.Task[None] | None = None
        self._orchestration_task: asyncio.Task[None] | None = None
        self._shutting_down = False

    def compose(self) -> ComposeResult:
        """Compose the UI."""
        yield Header()

        yield StatusBar(id="status-bar")

        with Container(id="agents-container", classes="widget-container"):
            yield AgentStatusWidget(id="agents")

        with Container(id="stats-container", classes="widget-container"):
            yield StatsWidget(id="stats")

        with Container(id="tasks-container", classes="widget-container"):
            yield TaskListWidget(id="tasks")

        with Container(id="milestones-container", classes="widget-container"):
            yield MilestoneWidget(id="milestones")

        with Container(id="logs-container"):
            yield LogWidget(id="logs")

        yield Footer()

    async def on_mount(self) -> None:
        """Handle mount event."""
        # Log dashboard startup
        if self._state_manager:
            await self._state_manager.log(
                "system", "Dashboard started", level="INFO"
            )

        # Start refresh loop
        self._refresh_task = asyncio.create_task(self._refresh_loop())

        # Initial load
        await self._refresh_data()

    async def on_unmount(self) -> None:
        """Handle unmount event."""
        await self._cleanup()

    async def _cleanup(self) -> None:
        """Clean up background tasks."""
        self._shutting_down = True

        # Cancel refresh task with short timeout
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()
            try:
                await asyncio.wait_for(self._refresh_task, timeout=0.5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        # Cancel orchestration task - don't wait long, main cleanup happens in run_tui
        if self._orchestration_task and not self._orchestration_task.done():
            self._orchestration_task.cancel()
            # Don't wait here - let run_tui's finally block handle it

    async def _refresh_loop(self) -> None:
        """Background refresh loop."""
        while not self._shutting_down:
            try:
                await asyncio.sleep(self.config.refresh_rate)
                if not self._shutting_down:
                    await self._refresh_data()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.log.error(f"Refresh loop error: {e}")

    async def _refresh_data(self) -> None:
        """Refresh all dashboard data."""
        if not self._state_manager or self._shutting_down:
            return

        try:
            # Get data from state manager
            agents = await self._state_manager.get_all_agents()
            tasks = await self._state_manager.get_all_tasks()
            milestones = await self._state_manager.get_milestones()
            stats = await self._state_manager.get_statistics()
            logs = await self._state_manager.get_logs(limit=15)

            # Update widgets
            self.query_one("#agents", AgentStatusWidget).update_agents(
                [
                    {
                        "agent_id": a.agent_id,
                        "agent_type": a.agent_type,
                        "status": a.status.value,
                        "current_task_id": a.current_task_id,
                        "token_usage": a.token_usage,
                    }
                    for a in agents
                ]
            )

            self.query_one("#tasks", TaskListWidget).update_tasks(
                [
                    {
                        "task_id": t.task_id,
                        "description": t.description,
                        "status": t.status.value,
                        "agent_id": t.agent_id,
                        "retry_count": t.retry_count,
                        "token_usage": t.token_usage,
                    }
                    for t in tasks
                ]
            )

            # Compute milestone task stats for progress display
            milestone_task_stats: dict[str, dict[str, int]] = {}
            for m in milestones:
                completed = 0
                total = len(m.tasks)
                for task_id in m.tasks:
                    # Find task status
                    for t in tasks:
                        if t.task_id == task_id and t.status.value == "MERGED":
                            completed += 1
                            break
                milestone_task_stats[m.milestone_id] = {"completed": completed, "total": total}

            milestone_widget = self.query_one("#milestones", MilestoneWidget)
            milestone_widget.update_milestones(
                [
                    {
                        "milestone_id": m.milestone_id,
                        "name": m.name,
                        "phase": m.phase,
                        "status": m.status.value,
                        "tasks": m.tasks,
                    }
                    for m in milestones
                ]
            )
            milestone_widget.update_task_stats(milestone_task_stats)

            self.query_one("#stats", StatsWidget).update_stats(stats)
            self.query_one("#logs", LogWidget).update_logs(logs)

            # Update status bar
            if self._orchestrator:
                self.query_one("#status-bar", StatusBar).update_state(
                    self._orchestrator.state
                )

        except Exception as e:
            if not self._shutting_down:
                self.log.error(f"Refresh error: {e}")

    def handle_orchestrator_event(
        self, event: OrchestratorEvent, data: dict[str, Any]
    ) -> None:
        """Handle events from the orchestrator."""
        if self._shutting_down:
            return

        try:
            # Format the data for display
            data_str = ""
            if data:
                key_items = []
                for k, v in data.items():
                    if isinstance(v, str) and len(v) > 50:
                        v = v[:50] + "..."
                    key_items.append(f"{k}={v}")
                data_str = " | ".join(key_items[:3])  # Limit to 3 items

            message = f"{event.value}: {data_str}" if data_str else event.value

            # Persist to database so it shows up in refresh
            if self._state_manager:
                asyncio.create_task(
                    self._state_manager.log("orchestrator", message, level="INFO")
                )

            # Update status bar
            status_bar = self.query_one("#status-bar", StatusBar)
            messages = {
                OrchestratorEvent.STARTED: "Starting...",
                OrchestratorEvent.PLANNING_STARTED: "CEO planning project...",
                OrchestratorEvent.PLANNING_COMPLETED: "Plan ready",
                OrchestratorEvent.MILESTONE_STARTED: f"Working on: {data.get('milestone', '')}",
                OrchestratorEvent.TASK_STARTED: f"Task: {data.get('task_id', '')}",
                OrchestratorEvent.TASK_COMPLETED: f"Completed: {data.get('task_id', '')}",
                OrchestratorEvent.REVIEW_STARTED: f"Reviewing: {data.get('task_id', '')}",
                OrchestratorEvent.COMPLETED: "All done!",
                OrchestratorEvent.FAILED: f"Failed: {data.get('error', '')}",
            }
            if event in messages:
                status_bar.update_state(
                    self._orchestrator.state if self._orchestrator else OrchestratorState.IDLE,
                    messages[event],
                )

            # Force a refresh to show updated data
            asyncio.create_task(self._refresh_data())
        except Exception as e:
            self.log.error(f"Event handler error: {e}")

    def action_quit(self) -> None:
        """Quit the application immediately."""
        # Set shutdown flag to stop background loops
        self._shutting_down = True
        # Exit immediately - cleanup happens in run_tui's finally block
        self.exit()

    def action_pause(self) -> None:
        """Toggle pause state."""
        if self._orchestrator and not self._shutting_down:
            if self._orchestrator.state == OrchestratorState.PAUSED:
                asyncio.create_task(self._orchestrator.resume())
            else:
                asyncio.create_task(self._orchestrator.pause())

    def action_refresh(self) -> None:
        """Manual refresh."""
        if not self._shutting_down:
            asyncio.create_task(self._refresh_data())

    def action_toggle_logs(self) -> None:
        """Toggle log panel visibility."""
        logs_container = self.query_one("#logs-container")
        logs_container.toggle_class("hidden")

    async def action_dump_state(self) -> None:
        """Dump current dashboard state to a file for easy copying.

        Creates a text file with all visible dashboard data that can be
        easily opened and copied from.
        """
        if not self._state_manager:
            self.notify("No state manager available", severity="error")
            return

        try:
            from datetime import datetime

            # Gather all data
            agents = await self._state_manager.get_all_agents()
            tasks = await self._state_manager.get_all_tasks()
            milestones = await self._state_manager.get_milestones()
            stats = await self._state_manager.get_statistics()
            logs = await self._state_manager.get_logs(limit=50)

            # Build text output
            lines = []
            lines.append("=" * 80)
            lines.append(f"AUTONOMA STATE DUMP - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            lines.append("=" * 80)
            lines.append("")

            # Statistics
            lines.append("STATISTICS")
            lines.append("-" * 40)
            task_stats = stats.get("tasks", {})
            lines.append(f"Tasks: {task_stats.get('MERGED', 0)}/{sum(task_stats.values())} completed")
            lines.append(f"Total Tokens: {stats.get('total_tokens', 0):,}")
            lines.append("")

            # Agents
            lines.append("AGENTS")
            lines.append("-" * 40)
            for a in agents:
                lines.append(f"  {a.agent_id} ({a.agent_type}): {a.status.value} - Tokens: {a.token_usage:,}")
            lines.append("")

            # Milestones
            lines.append("MILESTONES")
            lines.append("-" * 40)
            for m in milestones:
                lines.append(f"  Phase {m.phase}: {m.name} - {m.status.value}")
            lines.append("")

            # Tasks
            lines.append("TASKS")
            lines.append("-" * 40)
            for t in tasks:
                lines.append(f"  {t.task_id}: {t.status.value} - {t.description[:50]}")
            lines.append("")

            # Logs
            lines.append("RECENT LOGS")
            lines.append("-" * 40)
            for log in logs[:20]:
                ts = log.get("timestamp", "")
                if isinstance(ts, str) and len(ts) > 19:
                    ts = ts[11:19]
                lines.append(f"  [{ts}] {log.get('agent_id', 'system')}: {log.get('message', '')[:60]}")

            # Write to file
            dump_path = self.config.logs_dir / f"state_dump_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
            dump_path.write_text("\n".join(lines))

            self.notify(f"State dumped to: {dump_path}", timeout=5)
            self.log.info(f"State dumped to {dump_path}")

        except Exception as e:
            self.notify(f"Failed to dump state: {e}", severity="error")
            self.log.error(f"Dump failed: {e}")

    def set_orchestration_task(self, task: asyncio.Task[None]) -> None:
        """Set the orchestration task for cleanup tracking."""
        self._orchestration_task = task


async def run_tui(
    requirements_path: Path | None = None,
    project_root: Path | None = None,
) -> None:
    """Run Autonoma with TUI interface."""
    config = Config(project_root=project_root or Path.cwd())
    state_manager = StateManager(config.state_db_path)

    await state_manager.connect()

    # Clean up stale states from interrupted sessions
    cleaned = await state_manager.cleanup_stale_states()
    if cleaned > 0:
        await state_manager.log(
            "system", f"Cleaned up {cleaned} stale agent/task states from previous session", level="INFO"
        )

    orchestrator = Orchestrator(config, state_manager)
    await orchestrator.initialize()

    app = AutonomaApp(
        config=config,
        state_manager=state_manager,
        orchestrator=orchestrator,
    )

    # Connect orchestrator events to app
    orchestrator.on_event = app.handle_orchestrator_event

    orch_task: asyncio.Task[None] | None = None

    # Check if we need to run orchestration
    should_run_orchestration = False
    requirements = ""

    if requirements_path and requirements_path.exists():
        requirements = requirements_path.read_text()
        should_run_orchestration = True

        # Log that we're starting orchestration
        await state_manager.log(
            "system", f"Starting orchestration with {requirements_path.name}", level="INFO"
        )
    else:
        # Check if there's an existing plan that needs resuming
        if config.plan_json_path.exists():
            import json
            with open(config.plan_json_path) as f:
                plan = json.load(f)

            # Check if plan failed or has no milestones
            plan_failed = plan.get("parse_error", False) or not plan.get("milestones")

            if plan_failed:
                # Try to find requirements file for re-planning
                for req_name in ["requirements.md", "PRD.md", "README.md"]:
                    req_file = config.project_root / req_name
                    if req_file.exists():
                        requirements = req_file.read_text()
                        should_run_orchestration = True
                        await state_manager.log(
                            "system", f"Re-planning with {req_name} (previous plan failed)", level="WARNING"
                        )
                        break

                if not should_run_orchestration:
                    await state_manager.log(
                        "system", "Plan failed but no requirements file found for re-planning", level="ERROR"
                    )
            else:
                # Valid plan exists, check for incomplete work
                milestones = await state_manager.get_milestones()
                pending = [m for m in milestones if m.status.value != "MERGED"]
                if pending:
                    # Resume existing work - orchestrator will pick up from plan
                    should_run_orchestration = True
                    # Load requirements for potential retries
                    for req_name in ["requirements.md", "PRD.md"]:
                        req_file = config.project_root / req_name
                        if req_file.exists():
                            requirements = req_file.read_text()
                            break

                    await state_manager.log(
                        "system", f"Resuming {len(pending)} incomplete milestone(s)", level="INFO"
                    )
        else:
            # No plan.json - check if CEO crashed before saving
            # Try to start fresh with requirements if available
            for req_name in ["requirements.md", "PRD.md", "README.md"]:
                req_file = config.project_root / req_name
                if req_file.exists():
                    requirements = req_file.read_text()
                    should_run_orchestration = True
                    await state_manager.log(
                        "system", f"No plan found, starting fresh with {req_name}", level="WARNING"
                    )
                    break

    # Run app and orchestrator concurrently if needed
    if should_run_orchestration and requirements:
        async def run_orchestration() -> None:
            try:
                await asyncio.sleep(1)  # Let TUI initialize
                await orchestrator.run(requirements)
            except asyncio.CancelledError:
                pass  # Normal shutdown
            except Exception as e:
                app.log.error(f"Orchestration error: {e}")
                # Log the error to the state for visibility
                await state_manager.log(
                    "orchestrator", f"Error: {str(e)[:100]}", level="ERROR"
                )

        orch_task = asyncio.create_task(run_orchestration())
        app.set_orchestration_task(orch_task)

    import os
    import threading

    # Set up a hard exit timer in case cleanup hangs (cross-platform)
    force_exit_timer: threading.Timer | None = None

    def force_exit() -> None:
        os._exit(0)

    try:
        await app.run_async()
    except asyncio.CancelledError:
        pass  # Normal exit
    except KeyboardInterrupt:
        pass  # Ctrl+C
    finally:
        # Start a timer that will force exit after 3 seconds if cleanup hangs
        force_exit_timer = threading.Timer(3.0, force_exit)
        force_exit_timer.daemon = True
        force_exit_timer.start()

        # Cancel any running orchestration with timeout
        if orch_task and not orch_task.done():
            orch_task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(orch_task), timeout=1.0)
            except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                pass

        # Ensure cleanup with timeouts - orchestrator first, then state manager
        try:
            await asyncio.wait_for(orchestrator.shutdown(), timeout=2.0)
        except (asyncio.TimeoutError, Exception):
            pass

        try:
            await asyncio.wait_for(state_manager.close(), timeout=1.0)
        except (asyncio.TimeoutError, Exception):
            pass

        # Cancel the force exit timer if cleanup completed in time
        if force_exit_timer:
            force_exit_timer.cancel()
