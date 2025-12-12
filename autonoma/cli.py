"""Command-line interface for Autonoma."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

import click
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from autonoma import __version__
from autonoma.core.config import Config
from autonoma.core.orchestrator import Orchestrator, OrchestratorEvent, run_autonoma
from autonoma.core.state import AgentStatus, StateManager


console = Console()


def async_command(f: Any) -> Any:
    """Decorator to run async Click commands."""
    import functools

    @functools.wraps(f)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        return asyncio.run(f(*args, **kwargs))

    return wrapper


@click.group()
@click.version_option(version=__version__, prog_name="autonoma")
def cli() -> None:
    """Autonoma - Autonomous Agentic Orchestration for Software Development.

    A "software company in a box" that leverages multiple Claude Code
    instances to autonomously plan, implement, test, and deploy codebases.
    """
    pass


@cli.command()
@click.option(
    "--project-root",
    "-p",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Project root directory (default: current directory)",
)
@async_command
async def init(project_root: Path | None) -> None:
    """Initialize Autonoma in the current project.

    Creates the .autonoma directory structure and configuration files.
    """
    root = project_root or Path.cwd()
    config = Config(project_root=root)

    console.print(Panel.fit(
        "[bold blue]Initializing Autonoma[/bold blue]",
        subtitle=str(root),
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Creating directory structure...", total=None)

        # Create directories
        config.ensure_dirs()
        progress.update(task, description="Created .autonoma directories")

        # Create default CLAUDE.md if it doesn't exist
        if not config.claude_md_path.exists():
            progress.update(task, description="Creating CLAUDE.md...")
            default_claude_md = """# Project Standards

## Tech Stack
- Define your technology stack here

## Testing
- Framework: (e.g., Jest, pytest)
- Coverage target: 80%

## Commits
- Use conventional commits (feat:, fix:, docs:, etc.)

## Security
- No hardcoded secrets
- Use environment variables for sensitive data
"""
            config.claude_md_path.write_text(default_claude_md)

        # Initialize state database
        progress.update(task, description="Initializing state database...")
        state_manager = StateManager(config.state_db_path)
        await state_manager.connect()
        await state_manager.close()

        # Create sample requirements.md if it doesn't exist
        requirements_path = root / "requirements.md"
        if not requirements_path.exists():
            progress.update(task, description="Creating sample requirements.md...")
            sample_requirements = """# Project Requirements

## Overview
Describe your project here. What are you building? What problem does it solve?

## Features
List the main features you want to implement:

1. **Feature 1**: Description of the first feature
2. **Feature 2**: Description of the second feature
3. **Feature 3**: Description of the third feature

## Technical Requirements

### Tech Stack
- Language: (e.g., Python, TypeScript, Go)
- Framework: (e.g., FastAPI, Express, React)
- Database: (e.g., PostgreSQL, MongoDB)

### API Endpoints (if applicable)
```
GET    /api/resource     - List resources
POST   /api/resource     - Create resource
GET    /api/resource/:id - Get single resource
PUT    /api/resource/:id - Update resource
DELETE /api/resource/:id - Delete resource
```

## Success Criteria
- [ ] All features implemented and working
- [ ] Tests written with 80%+ coverage
- [ ] Documentation complete
- [ ] Clean git history with conventional commits

---
Edit this file with your actual requirements, then run:
  autonoma start requirements.md
"""
            requirements_path.write_text(sample_requirements)

        progress.update(task, description="[green]Initialization complete!")

    console.print()
    console.print("[green]✓[/green] Autonoma initialized successfully!")
    console.print()
    console.print("Next steps:")
    console.print("  1. Edit [cyan]requirements.md[/cyan] with your project requirements")
    console.print("  2. (Optional) Edit [cyan].autonoma/CLAUDE.md[/cyan] with project standards")
    console.print("  3. Run [cyan]autonoma start requirements.md[/cyan]")


async def _resume_impl(project_root: Path | None, tui: bool, requirements: Path | None) -> None:
    """Internal implementation of resume logic.

    Separated from the CLI command to allow direct async calls without
    nested asyncio.run() issues.
    """
    root = project_root or Path.cwd()
    config = Config(project_root=root)

    # Check if initialized
    if not config.state_db_path.exists():
        console.print("[red]Error:[/red] No previous execution found.")
        console.print("Run [cyan]autonoma start requirements.md[/cyan] first.")
        sys.exit(1)

    # Check for existing plan - if missing, we can still resume if requirements exist
    plan_exists = config.plan_json_path.exists()
    if not plan_exists:
        console.print("[yellow]Warning:[/yellow] No plan.json found (CEO may have crashed).")
        # Find requirements file
        if not requirements:
            for req_name in ["requirements.md", "PRD.md"]:
                default_req = root / req_name
                if default_req.exists():
                    requirements = default_req
                    console.print(f"Found [cyan]{requirements}[/cyan] - will restart planning")
                    break
        if not requirements:
            console.print("[red]Error:[/red] No plan and no requirements file found.")
            console.print("Run [cyan]autonoma resume -r requirements.md[/cyan]")
            sys.exit(1)

    console.print(Panel.fit(
        "[bold blue]Resuming Autonoma[/bold blue]",
        subtitle=str(root),
    ))

    state_manager = StateManager(config.state_db_path)
    await state_manager.connect()

    # Clean up stale states from interrupted sessions
    cleaned = await state_manager.cleanup_stale_states()
    if cleaned > 0:
        console.print(f"[dim]Cleaned up {cleaned} stale states from previous session[/dim]")

    # Load existing plan if it exists
    import json
    plan: dict = {}
    plan_failed = True  # Default to failed if no plan

    if plan_exists:
        with open(config.plan_json_path) as f:
            plan = json.load(f)
        console.print(f"Found plan: [cyan]{plan.get('project_name', 'Unknown')}[/cyan]")
        # Check if plan failed and needs re-planning
        plan_failed = plan.get("parse_error", False) or not plan.get("milestones")
    else:
        console.print("[yellow]No existing plan - will start fresh[/yellow]")

    if plan_failed:
        if plan_exists:
            console.print("[yellow]Warning:[/yellow] Previous planning phase failed or incomplete.")

        # Find requirements file if not already set
        if not requirements:
            for req_name in ["requirements.md", "PRD.md"]:
                default_req = root / req_name
                if default_req.exists():
                    requirements = default_req
                    console.print(f"Using [cyan]{requirements}[/cyan] for re-planning")
                    break

        if not requirements:
            console.print("[red]Error:[/red] Requirements file needed for re-planning.")
            console.print("Run [cyan]autonoma resume -r requirements.md[/cyan]")
            await state_manager.close()
            sys.exit(1)

        console.print("[yellow]Re-running CEO planning phase...[/yellow]")

        # Reset CEO agent status if terminated
        agents = await state_manager.get_all_agents()
        for agent in agents:
            if agent.agent_type == "CEO":
                await state_manager.update_agent_status(agent.agent_id, AgentStatus.IDLE)

    # Show current status
    stats = await state_manager.get_statistics()
    task_counts = stats.get("tasks", {})
    console.print(f"Tasks: {task_counts.get('MERGED', 0)} completed, "
                  f"{task_counts.get('PENDING', 0)} pending, "
                  f"{task_counts.get('IN_PROGRESS', 0)} in progress")

    if tui:
        from autonoma.tui.app import run_tui
        await state_manager.close()
        # Pass requirements for re-planning or resuming
        req_path = requirements if plan_failed else None
        await run_tui(requirements_path=req_path, project_root=root)
    else:
        from autonoma.core.orchestrator import Orchestrator, OrchestratorEvent

        orchestrator = Orchestrator(config, state_manager)
        await orchestrator.initialize()

        def on_event(event: OrchestratorEvent, data: dict[str, Any]) -> None:
            event_icons = {
                OrchestratorEvent.PLANNING_STARTED: "🧠",
                OrchestratorEvent.PLANNING_COMPLETED: "✅",
                OrchestratorEvent.MILESTONE_STARTED: "📋",
                OrchestratorEvent.MILESTONE_COMPLETED: "✓",
                OrchestratorEvent.TASK_STARTED: "⚡",
                OrchestratorEvent.TASK_COMPLETED: "✓",
                OrchestratorEvent.TASK_FAILED: "❌",
                OrchestratorEvent.COMPLETED: "🎉",
            }
            icon = event_icons.get(event, "•")
            console.print(f"{icon} {event.value}: {data}")

        orchestrator.on_event = on_event

        try:
            # If plan failed, re-run planning
            if plan_failed and requirements:
                console.print("[cyan]Starting CEO planning phase...[/cyan]")
                requirements_text = requirements.read_text()
                plan = await orchestrator._run_planning(requirements_text, requirements)
                orchestrator._current_plan = plan
                console.print("[green]Planning completed![/green]")
            else:
                # Load the existing plan into orchestrator
                orchestrator._current_plan = plan

            # Get milestones and continue execution
            milestones = await state_manager.get_milestones()
            pending_milestones = [m for m in milestones if m.status.value != "MERGED"]

            if not pending_milestones:
                console.print("[green]All milestones already completed![/green]")
            else:
                console.print(f"Resuming {len(pending_milestones)} milestone(s)...")
                # Continue with pending work
                for milestone in pending_milestones:
                    orchestrator._current_milestone = milestone
                    tasks = await orchestrator._decompose_milestone(milestone)
                    await orchestrator._execute_tasks(tasks)

            result = await orchestrator._generate_report()
            console.print(Panel.fit(
                f"[green]Done![/green]\n"
                f"Tasks: {result.get('completed_tasks', 0)} completed\n"
                f"Tokens: {result.get('total_tokens', 0):,}",
                title="Summary",
            ))
        finally:
            await orchestrator.shutdown()
            await state_manager.close()


@cli.command()
@click.option(
    "--project-root",
    "-p",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Project root directory",
)
@click.option(
    "--tui/--no-tui",
    default=True,
    help="Use TUI dashboard (default: true)",
)
@click.option(
    "--requirements",
    "-r",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="Requirements file (needed if plan failed and needs re-planning)",
)
@async_command
async def resume(project_root: Path | None, tui: bool, requirements: Path | None) -> None:
    """Resume a previously started Autonoma execution.

    Continues from where the last execution left off, using the existing
    plan and picking up incomplete tasks.
    """
    await _resume_impl(project_root, tui, requirements)


@cli.command()
@click.argument(
    "requirements",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
)
@click.option(
    "--project-root",
    "-p",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Project root directory",
)
@click.option(
    "--tui/--no-tui",
    default=True,
    help="Use TUI dashboard (default: true)",
)
@click.option(
    "--max-workers",
    "-w",
    type=int,
    default=None,
    help="Maximum parallel workers (default: 5)",
)
@async_command
async def start(
    requirements: Path,
    project_root: Path | None,
    tui: bool,
    max_workers: int | None,
) -> None:
    """Start Autonoma with a requirements file.

    REQUIREMENTS is the path to your project requirements or PRD file.
    """
    root = project_root or Path.cwd()

    # Check if initialized
    autonoma_dir = root / ".autonoma"
    if not autonoma_dir.exists():
        console.print("[red]Error:[/red] Autonoma not initialized in this directory.")
        console.print("Run [cyan]autonoma init[/cyan] first.")
        sys.exit(1)

    config = Config(project_root=root)

    # Check for existing work - only prompt if there's actual work (a plan exists)
    # Just having state.db from init is not enough to prompt
    has_existing_plan = config.plan_json_path.exists()

    if has_existing_plan:
        # Check what work exists
        existing_info = []
        try:
            import json
            with open(config.plan_json_path) as f:
                plan = json.load(f)
            existing_info.append(f"Plan: [cyan]{plan.get('project_name', 'Unknown')}[/cyan]")
        except Exception:
            existing_info.append("Plan: [dim]exists[/dim]")

        if config.state_db_path.exists():
            state_manager = StateManager(config.state_db_path)
            await state_manager.connect()
            stats = await state_manager.get_statistics()
            task_counts = stats.get("tasks", {})
            total = sum(task_counts.values())
            completed = task_counts.get("MERGED", 0)
            if total > 0:
                existing_info.append(f"Tasks: {completed}/{total} completed")
            await state_manager.close()

        console.print(Panel(
            "\n".join(existing_info) if existing_info else "Previous execution found",
            title="[yellow]Existing Work Detected[/yellow]",
            border_style="yellow",
        ))

        console.print()
        console.print("What would you like to do?")
        console.print("  [cyan]1[/cyan]) [bold]Resume[/bold] - Continue from where you left off")
        console.print("  [cyan]2[/cyan]) [bold]Restart[/bold] - Erase everything and start fresh")
        console.print("  [cyan]3[/cyan]) [bold]Cancel[/bold] - Exit without changes")
        console.print()

        choice = click.prompt(
            "Enter choice",
            type=click.Choice(["1", "2", "3"]),
            default="1",
        )

        if choice == "1":
            # Resume - call resume logic directly (not via ctx.invoke to avoid nested asyncio.run)
            console.print()
            console.print("[green]Resuming...[/green]")
            await _resume_impl(project_root=root, tui=tui, requirements=requirements)
            return

        elif choice == "2":
            # Restart - clean up existing data
            console.print()
            if not click.confirm("[yellow]This will erase all progress. Are you sure?[/yellow]"):
                console.print("[dim]Cancelled.[/dim]")
                sys.exit(0)

            console.print("Cleaning up previous execution...")
            import shutil
            # Remove state database
            if config.state_db_path.exists():
                config.state_db_path.unlink()
            # Remove plan
            if config.plan_json_path.exists():
                config.plan_json_path.unlink()
            # Remove worktrees
            if config.worktrees_dir.exists():
                shutil.rmtree(config.worktrees_dir)
                config.worktrees_dir.mkdir(parents=True, exist_ok=True)
            # Remove logs
            if config.logs_dir.exists():
                shutil.rmtree(config.logs_dir)
                config.logs_dir.mkdir(parents=True, exist_ok=True)

            # Reinitialize state database
            state_manager = StateManager(config.state_db_path)
            await state_manager.connect()
            await state_manager.close()

            console.print("[green]Cleaned. Starting fresh...[/green]")

        else:  # choice == "3"
            console.print("[dim]Cancelled.[/dim]")
            sys.exit(0)

    requirements_text = requirements.read_text()

    console.print(Panel.fit(
        "[bold blue]Starting Autonoma[/bold blue]",
        subtitle=f"Requirements: {requirements}",
    ))

    if tui:
        # Run with TUI
        from autonoma.tui.app import run_tui
        await run_tui(requirements_path=requirements, project_root=root)
    else:
        # Run without TUI - simple progress output
        config = Config(project_root=root)
        if max_workers:
            config.max_workers = max_workers

        def on_event(event: OrchestratorEvent, data: dict[str, Any]) -> None:
            event_icons = {
                OrchestratorEvent.STARTED: "🚀",
                OrchestratorEvent.PLANNING_STARTED: "🧠",
                OrchestratorEvent.PLANNING_COMPLETED: "✅",
                OrchestratorEvent.MILESTONE_STARTED: "📋",
                OrchestratorEvent.MILESTONE_COMPLETED: "✓",
                OrchestratorEvent.TASK_STARTED: "⚡",
                OrchestratorEvent.TASK_COMPLETED: "✓",
                OrchestratorEvent.TASK_FAILED: "❌",
                OrchestratorEvent.REVIEW_STARTED: "🔍",
                OrchestratorEvent.REVIEW_COMPLETED: "✓",
                OrchestratorEvent.ESCALATION: "⚠️",
                OrchestratorEvent.COMPLETED: "🎉",
                OrchestratorEvent.FAILED: "💥",
            }
            icon = event_icons.get(event, "•")
            console.print(f"{icon} {event.value}: {data}")

        try:
            result = await run_autonoma(
                requirements=requirements_text,
                project_root=root,
                on_event=on_event,
            )

            console.print()
            console.print(Panel.fit(
                f"[green]Completed![/green]\n\n"
                f"Tasks: {result.get('completed_tasks', 0)} completed\n"
                f"Tokens: {result.get('total_tokens', 0):,}",
                title="Summary",
            ))

        except Exception as e:
            console.print(f"[red]Error:[/red] {e}")
            sys.exit(1)


@cli.command()
@click.option(
    "--project-root",
    "-p",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Project root directory",
)
@async_command
async def dashboard(project_root: Path | None) -> None:
    """Open the TUI dashboard for monitoring.

    Shows real-time status of agents, tasks, and logs.
    """
    root = project_root or Path.cwd()

    # Check if initialized
    autonoma_dir = root / ".autonoma"
    if not autonoma_dir.exists():
        console.print("[red]Error:[/red] Autonoma not initialized in this directory.")
        console.print("Run [cyan]autonoma init[/cyan] first.")
        sys.exit(1)

    from autonoma.tui.app import run_tui
    await run_tui(project_root=root)


@cli.command()
@click.option(
    "--project-root",
    "-p",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Project root directory",
)
@async_command
async def status(project_root: Path | None) -> None:
    """Show current status of Autonoma execution."""
    root = project_root or Path.cwd()
    config = Config(project_root=root)

    if not config.state_db_path.exists():
        console.print("[yellow]No state database found.[/yellow]")
        console.print("Run [cyan]autonoma init[/cyan] to initialize.")
        return

    state_manager = StateManager(config.state_db_path)
    await state_manager.connect()

    try:
        stats = await state_manager.get_statistics()
        agents = await state_manager.get_all_agents()
        tasks = await state_manager.get_all_tasks()
        milestones = await state_manager.get_milestones()

        # Statistics
        console.print(Panel.fit("[bold]Autonoma Status[/bold]"))

        stats_table = Table(title="Statistics")
        stats_table.add_column("Metric", style="cyan")
        stats_table.add_column("Value", justify="right")

        task_counts = stats.get("tasks", {})
        stats_table.add_row("Total Tasks", str(sum(task_counts.values())))
        stats_table.add_row("Completed", str(task_counts.get("MERGED", 0)))
        stats_table.add_row("In Progress", str(task_counts.get("IN_PROGRESS", 0)))
        stats_table.add_row("Failed", str(task_counts.get("FAILED", 0)))
        stats_table.add_row("Total Tokens", f"{stats.get('total_tokens', 0):,}")

        console.print(stats_table)

        # Agents
        if agents:
            agent_table = Table(title="Agents")
            agent_table.add_column("ID")
            agent_table.add_column("Type")
            agent_table.add_column("Status")
            agent_table.add_column("Task")

            for agent in agents:
                agent_table.add_row(
                    agent.agent_id,
                    agent.agent_type,
                    agent.status.value,
                    agent.current_task_id or "-",
                )

            console.print(agent_table)

        # Recent tasks
        if tasks:
            task_table = Table(title="Recent Tasks")
            task_table.add_column("ID")
            task_table.add_column("Description")
            task_table.add_column("Status")

            for task in tasks[-10:]:
                task_table.add_row(
                    task.task_id,
                    task.description[:40] + "..." if len(task.description) > 40 else task.description,
                    task.status.value,
                )

            console.print(task_table)

    finally:
        await state_manager.close()


@cli.command()
@click.option(
    "--project-root",
    "-p",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Project root directory",
)
@click.option(
    "--agent",
    "-a",
    type=str,
    default=None,
    help="Filter logs by agent ID",
)
@click.option(
    "--limit",
    "-n",
    type=int,
    default=50,
    help="Number of log entries to show",
)
@async_command
async def logs(project_root: Path | None, agent: str | None, limit: int) -> None:
    """Show execution logs."""
    root = project_root or Path.cwd()
    config = Config(project_root=root)

    if not config.state_db_path.exists():
        console.print("[yellow]No state database found.[/yellow]")
        return

    state_manager = StateManager(config.state_db_path)
    await state_manager.connect()

    try:
        log_entries = await state_manager.get_logs(agent_id=agent, limit=limit)

        if not log_entries:
            console.print("[dim]No logs found.[/dim]")
            return

        for entry in reversed(log_entries):
            timestamp = entry.get("timestamp", "")
            if isinstance(timestamp, str) and len(timestamp) > 19:
                timestamp = timestamp[:19]

            level = entry.get("level", "INFO")
            level_colors = {
                "DEBUG": "dim",
                "INFO": "blue",
                "WARNING": "yellow",
                "ERROR": "red",
                "OUTPUT": "green",
            }
            color = level_colors.get(level, "white")

            console.print(
                f"[dim]{timestamp}[/dim] "
                f"[{color}]{level}[/{color}] "
                f"[cyan]{entry.get('agent_id', 'system')}[/cyan]: "
                f"{entry.get('message', '')}"
            )

    finally:
        await state_manager.close()


@cli.command(name="build-desktop")
@click.option(
    "--platform",
    "-t",
    type=click.Choice(["darwin", "win32", "linux", "all"]),
    default="all",
    help="Target platform (default: all)",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(path_type=Path),
    default=None,
    help="Output directory for built artifacts",
)
def build_desktop(platform: str, output: Path | None) -> None:
    """Build the Autonoma desktop application.

    Uses Electrobun to create native desktop applications for
    macOS, Windows, and Linux.
    """
    import subprocess

    desktop_dir = Path(__file__).parent.parent / "desktop"

    if not desktop_dir.exists():
        console.print("[red]Error:[/red] Desktop source not found.")
        console.print(f"Expected at: {desktop_dir}")
        sys.exit(1)

    console.print(Panel.fit(
        "[bold blue]Building Autonoma Desktop[/bold blue]",
        subtitle=f"Platform: {platform}",
    ))

    # Check for bun
    try:
        subprocess.run(["bun", "--version"], capture_output=True, check=True)
    except FileNotFoundError:
        console.print("[red]Error:[/red] Bun runtime not found.")
        console.print("Install Bun: curl -fsSL https://bun.sh/install | bash")
        sys.exit(1)

    # Install dependencies
    console.print("Installing dependencies...")
    subprocess.run(["bun", "install"], cwd=desktop_dir, check=True)

    # Build
    build_cmd = ["bun", "run", "build"]
    if platform != "all":
        build_cmd.extend(["--platform", platform])

    console.print(f"Building for {platform}...")
    result = subprocess.run(build_cmd, cwd=desktop_dir)

    if result.returncode != 0:
        console.print("[red]Build failed![/red]")
        sys.exit(1)

    # Copy output if specified
    dist_dir = desktop_dir / "dist"
    if output and dist_dir.exists():
        import shutil
        output.mkdir(parents=True, exist_ok=True)
        for item in dist_dir.iterdir():
            if item.is_file():
                shutil.copy2(item, output)
            else:
                shutil.copytree(item, output / item.name, dirs_exist_ok=True)
        console.print(f"Output copied to: {output}")

    console.print("[green]✓[/green] Desktop build complete!")
    console.print(f"Artifacts at: {dist_dir}")


@cli.command()
@click.option(
    "--project-root",
    "-p",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Project root directory",
)
@click.confirmation_option(prompt="Are you sure you want to clean all Autonoma data?")
@async_command
async def clean(project_root: Path | None) -> None:
    """Clean up Autonoma state and worktrees."""
    root = project_root or Path.cwd()
    config = Config(project_root=root)

    console.print("[yellow]Cleaning Autonoma data...[/yellow]")

    import shutil

    # Remove worktrees
    if config.worktrees_dir.exists():
        shutil.rmtree(config.worktrees_dir)
        console.print("  Removed worktrees")

    # Remove state database
    if config.state_db_path.exists():
        config.state_db_path.unlink()
        console.print("  Removed state database")

    # Remove logs
    if config.logs_dir.exists():
        shutil.rmtree(config.logs_dir)
        console.print("  Removed logs")

    # Recreate directories
    config.ensure_dirs()

    console.print("[green]✓[/green] Cleanup complete!")


def main() -> None:
    """Main entry point."""
    cli()


if __name__ == "__main__":
    main()
