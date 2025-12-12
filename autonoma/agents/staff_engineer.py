"""Staff Engineer Agent - Technical architecture and task decomposition."""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from autonoma.agents.base import AgentRole, BaseAgent, create_xml_prompt
from autonoma.core.config import Config
from autonoma.core.state import StateManager, Task, TaskStatus
from autonoma.core.wrapper import SessionOutput


logger = logging.getLogger(__name__)


class StaffEngineerAgent(BaseAgent):
    """Staff Engineer Agent responsible for technical task decomposition."""

    role = AgentRole.STAFF_ENGINEER

    default_system_prompt = """You are the Staff Engineer Agent in an autonomous software development system.
Your role is to convert high-level milestones into executable technical tasks.

Key responsibilities:
- Analyze codebase structure using Grep, Glob, Read tools
- Create detailed task specifications for Developer agents
- Set up git worktrees for parallel development
- Identify dependencies between tasks
- Estimate complexity and flag blockers

Use <think> tags for technical reasoning.
Output tasks in JSON format.
Create git branches via bash commands when needed.

Tools available: Grep, Glob, Read, Bash (for git operations)"""

    async def run(self, input_data: dict[str, Any]) -> dict[str, Any]:
        """
        Convert a milestone into executable tasks.

        Args:
            input_data: Dictionary containing:
                - milestone: dict - The milestone to process
                - plan: dict - The overall project plan
                - codebase_path: Path - Path to analyze (optional)

        Returns:
            Dictionary containing:
                - tasks: list[Task] - Created tasks
                - worktrees: list[str] - Created worktree paths
                - dependency_graph: dict - Task dependency mapping
        """
        milestone = input_data.get("milestone", {})
        plan = input_data.get("plan", {})
        codebase_path = input_data.get("codebase_path", self.working_dir)

        if not milestone:
            raise ValueError("No milestone provided")

        logger.info(
            f"[{self.agent_id}] Processing milestone: {milestone.get('name', 'Unknown')}"
        )

        # Phase 1: Analyze current codebase
        analysis_prompt = self._create_analysis_prompt(milestone, plan, codebase_path)
        analysis_output = await self.execute_prompt(analysis_prompt)

        # Phase 2: Create task breakdown
        task_prompt = self._create_task_prompt(milestone, analysis_output.text)
        task_output = await self.execute_prompt(task_prompt)

        # Parse tasks
        tasks_data = self._parse_tasks(task_output)

        # Phase 3: Set up git worktrees
        worktrees = await self._setup_worktrees(tasks_data)

        # Create task records
        tasks = await self._create_task_records(tasks_data, worktrees)

        # Build dependency graph
        dependency_graph = self._build_dependency_graph(tasks_data)

        return {
            "tasks": tasks,
            "worktrees": worktrees,
            "dependency_graph": dependency_graph,
            "analysis": analysis_output.text,
        }

    def _create_analysis_prompt(
        self, milestone: dict[str, Any], plan: dict[str, Any], codebase_path: Path
    ) -> str:
        """Create codebase analysis prompt."""
        return create_xml_prompt(
            role="Staff Engineer analyzing codebase for task decomposition",
            task=f"""Analyze the codebase and prepare for implementing this milestone.

<milestone>
Name: {milestone.get('name', 'Unknown')}
Description: {milestone.get('description', '')}
Tasks Overview: {json.dumps(milestone.get('tasks', []), indent=2)}
</milestone>

<project_plan>
Tech Stack: {json.dumps(plan.get('tech_stack', {}), indent=2)}
</project_plan>

<codebase_path>{codebase_path}</codebase_path>

Use your tools to:
1. Search for existing relevant code (Grep for patterns)
2. Understand the directory structure (Glob for files)
3. Read key configuration files (Read for package.json, etc.)
4. Identify where new code should be added""",
            guidelines=[
                "Use <think> tags for reasoning about architecture",
                "Note existing patterns that should be followed",
                "Identify files that need modification vs creation",
                "Flag any potential conflicts or blockers",
                "Consider testing requirements",
            ],
        )

    def _create_task_prompt(self, milestone: dict[str, Any], analysis: str) -> str:
        """Create task breakdown prompt."""
        return f"""Based on your analysis, create detailed task specifications for Developer agents.

<milestone>
{json.dumps(milestone, indent=2)}
</milestone>

<codebase_analysis>
{analysis}
</codebase_analysis>

Output a JSON array of tasks:
```json
[
    {{
        "id": "T1.1",
        "description": "Detailed description of what to implement",
        "type": "feature|bugfix|refactor|test|docs",
        "files_to_modify": ["path/to/file.ts"],
        "files_to_create": ["path/to/new.ts"],
        "dependencies": [],
        "parallel": true,
        "branch_name": "feat/task-description",
        "acceptance_criteria": [
            "Specific criteria for completion"
        ],
        "estimated_complexity": "low|medium|high",
        "test_requirements": "Describe required tests"
    }}
]
```

<guidelines>
- Each task should be completable by a single Developer agent
- Include specific file paths based on your analysis
- Parallel tasks should have no code dependencies
- Branch names should follow conventional format
- Be specific in acceptance criteria
</guidelines>

Output ONLY the JSON array."""

    def _parse_tasks(self, output: SessionOutput) -> list[dict[str, Any]]:
        """Parse tasks from Claude's output."""
        text = output.text

        # Find JSON array
        json_start = text.find("[")
        json_end = text.rfind("]") + 1

        if json_start >= 0 and json_end > json_start:
            try:
                json_str = text[json_start:json_end]
                return json.loads(json_str)
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse tasks JSON: {e}")

        # Fallback: return empty list
        logger.error("Could not parse tasks from output")
        return []

    async def _setup_worktrees(
        self, tasks_data: list[dict[str, Any]]
    ) -> dict[str, str]:
        """Set up git worktrees for tasks."""
        worktrees: dict[str, str] = {}

        for task in tasks_data:
            task_id = task.get("id", "")
            branch_name = task.get("branch_name", f"task/{task_id}")

            if not task_id:
                continue

            # Only create worktree for non-parallel tasks or first parallel batch
            worktree_path = self.config.get_worktree_path(task_id)

            try:
                # Create worktree
                await self._run_git_command(
                    ["git", "worktree", "add", "-b", branch_name, str(worktree_path)]
                )
                worktrees[task_id] = str(worktree_path)
                logger.info(f"[{self.agent_id}] Created worktree for {task_id}")
            except Exception as e:
                logger.warning(f"Failed to create worktree for {task_id}: {e}")
                # Try without -b if branch exists
                try:
                    await self._run_git_command(
                        ["git", "worktree", "add", str(worktree_path), branch_name]
                    )
                    worktrees[task_id] = str(worktree_path)
                except Exception as e2:
                    logger.error(f"Worktree creation failed completely: {e2}")

        return worktrees

    async def _run_git_command(self, cmd: list[str]) -> str:
        """Run a git command and return output."""
        result = subprocess.run(
            cmd,
            cwd=self.working_dir,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Git command failed: {result.stderr}")

        return result.stdout

    async def _create_task_records(
        self, tasks_data: list[dict[str, Any]], worktrees: dict[str, str]
    ) -> list[Task]:
        """Create task records in the database."""
        tasks = []

        for t_data in tasks_data:
            task_id = t_data.get("id", "")
            if not task_id:
                continue

            task = Task(
                task_id=task_id,
                description=t_data.get("description", ""),
                status=TaskStatus.PENDING,
                branch_name=t_data.get("branch_name", ""),
                worktree_path=worktrees.get(task_id),
                dependencies=t_data.get("dependencies", []),
                metadata={
                    "type": t_data.get("type", "feature"),
                    "files_to_modify": t_data.get("files_to_modify", []),
                    "files_to_create": t_data.get("files_to_create", []),
                    "parallel": t_data.get("parallel", False),
                    "acceptance_criteria": t_data.get("acceptance_criteria", []),
                    "complexity": t_data.get("estimated_complexity", "medium"),
                    "test_requirements": t_data.get("test_requirements", ""),
                },
            )
            await self.state_manager.create_task(task)
            tasks.append(task)

        return tasks

    def _build_dependency_graph(
        self, tasks_data: list[dict[str, Any]]
    ) -> dict[str, list[str]]:
        """Build a dependency graph for task scheduling."""
        graph: dict[str, list[str]] = {}

        for task in tasks_data:
            task_id = task.get("id", "")
            if task_id:
                graph[task_id] = task.get("dependencies", [])

        return graph

    async def get_parallel_tasks(
        self, tasks: list[Task], completed: set[str]
    ) -> list[Task]:
        """Get tasks that can be executed in parallel."""
        parallel = []

        for task in tasks:
            if task.status != TaskStatus.PENDING:
                continue

            # Check if all dependencies are completed
            deps_met = all(dep in completed for dep in task.dependencies)

            if deps_met:
                parallel.append(task)

        return parallel
