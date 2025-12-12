"""QA/Review Agent - Code review and quality assurance."""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any

from autonoma.agents.base import AgentRole, BaseAgent, create_xml_prompt
from autonoma.core.config import Config
from autonoma.core.state import StateManager, Task, TaskStatus
from autonoma.core.wrapper import SessionOutput


logger = logging.getLogger(__name__)


class QAAgent(BaseAgent):
    """QA Agent responsible for code review and quality assurance."""

    role = AgentRole.QA

    default_system_prompt = """You are the QA/Review Agent in an autonomous software development system.
Your role is to ensure code quality, run tests, and approve merges.

Key responsibilities:
- Review code changes for quality and best practices
- Run the test suite and verify all tests pass
- Check for security vulnerabilities
- Verify acceptance criteria are met
- Approve and merge changes or request fixes

Tools available: Read, Grep, Glob, Bash (for tests, git)

<guidelines>
- Be thorough but efficient in reviews
- Focus on: correctness, security, maintainability, test coverage
- Run tests before approving: bash: npm test / pytest
- Use structured output for review findings
- Merge with squash: git merge --squash <branch>
- If issues found, provide specific, actionable feedback
</guidelines>"""

    def __init__(
        self,
        agent_id: str,
        config: Config,
        state_manager: StateManager,
        working_dir: Path | None = None,
    ):
        """Initialize the QA agent."""
        super().__init__(agent_id, config, state_manager, working_dir)
        self._review_count = 0

    async def run(self, input_data: dict[str, Any]) -> dict[str, Any]:
        """
        Review and potentially merge a completed task.

        Args:
            input_data: Dictionary containing:
                - task: Task - The task to review
                - auto_merge: bool - Whether to auto-merge on approval

        Returns:
            Dictionary containing:
                - approved: bool - Whether the review passed
                - merged: bool - Whether the code was merged
                - findings: list[dict] - Review findings
                - feedback: str - Feedback for developer
        """
        task = input_data.get("task")
        auto_merge = input_data.get("auto_merge", True)

        if not task:
            raise ValueError("No task provided for review")

        logger.info(f"[{self.agent_id}] Reviewing task: {task.task_id}")
        self._review_count += 1

        # Phase 1: Run tests
        test_result = await self._run_tests(task)

        if not test_result["passed"]:
            # Tests failed - provide feedback
            feedback = await self._generate_feedback(task, test_result)
            return {
                "approved": False,
                "merged": False,
                "findings": [{"type": "test_failure", "details": test_result}],
                "feedback": feedback,
            }

        # Phase 2: Code review
        review_prompt = self._create_review_prompt(task)
        review_output = await self.execute_prompt(review_prompt)

        # Parse review results
        findings = self._parse_review(review_output)
        approved = self._evaluate_findings(findings)

        if approved and auto_merge:
            # Phase 3: Merge
            merge_result = await self._merge_branch(task)
            if merge_result["success"]:
                await self.state_manager.update_task_status(
                    task.task_id, TaskStatus.MERGED
                )
                return {
                    "approved": True,
                    "merged": True,
                    "findings": findings,
                    "feedback": "Code approved and merged successfully.",
                    "merge_commit": merge_result.get("commit"),
                }

        if not approved:
            # Generate improvement feedback
            feedback = await self._generate_feedback(task, {"findings": findings})
            return {
                "approved": False,
                "merged": False,
                "findings": findings,
                "feedback": feedback,
            }

        return {
            "approved": True,
            "merged": False,
            "findings": findings,
            "feedback": "Code approved. Ready for merge.",
        }

    async def _run_tests(self, task: Task) -> dict[str, Any]:
        """Run the test suite."""
        worktree_path = Path(task.worktree_path) if task.worktree_path else self.working_dir

        # Detect test command
        test_commands = [
            ("npm", ["npm", "test"]),
            ("pytest", ["pytest", "-v"]),
            ("cargo", ["cargo", "test"]),
            ("go", ["go", "test", "./..."]),
        ]

        for name, cmd in test_commands:
            try:
                result = subprocess.run(
                    cmd,
                    cwd=worktree_path,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )

                return {
                    "passed": result.returncode == 0,
                    "test_framework": name,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "returncode": result.returncode,
                }
            except FileNotFoundError:
                continue
            except subprocess.TimeoutExpired:
                return {
                    "passed": False,
                    "error": "Test timeout",
                    "test_framework": name,
                }

        # No test framework found - consider passed
        logger.warning(f"[{self.agent_id}] No test framework detected")
        return {
            "passed": True,
            "test_framework": None,
            "warning": "No test framework detected",
        }

    def _create_review_prompt(self, task: Task) -> str:
        """Create the code review prompt."""
        metadata = task.metadata or {}

        return create_xml_prompt(
            role="Senior Code Reviewer",
            task=f"""Review the code changes for task {task.task_id}.

<task_description>
{task.description}
</task_description>

<acceptance_criteria>
{chr(10).join(f'- {c}' for c in metadata.get('acceptance_criteria', []))}
</acceptance_criteria>

<branch>
{task.branch_name}
</branch>

Use your tools to:
1. Read the changed files
2. Check for code quality issues
3. Verify security best practices
4. Ensure acceptance criteria are met""",
            guidelines=[
                "Be thorough but fair in your review",
                "Focus on: correctness, security, maintainability",
                "Check for: hardcoded secrets, SQL injection, XSS",
                "Verify proper error handling",
                "Look for missing tests",
                "Output findings in structured format",
            ],
            examples=[
                "Finding: {severity: 'high', type: 'security', file: 'auth.ts', line: 42, issue: 'Hardcoded API key', suggestion: 'Use environment variable'}",
            ],
        )

    def _parse_review(self, output: SessionOutput) -> list[dict[str, Any]]:
        """Parse review findings from output."""
        findings: list[dict[str, Any]] = []
        text = output.text

        # Look for structured findings
        severity_keywords = {
            "critical": 4,
            "high": 3,
            "medium": 2,
            "low": 1,
            "info": 0,
        }

        # Simple parsing - look for severity indicators
        lines = text.split("\n")
        for line in lines:
            line_lower = line.lower()
            for severity, level in severity_keywords.items():
                if severity in line_lower:
                    findings.append({
                        "severity": severity,
                        "level": level,
                        "description": line.strip(),
                    })
                    break

        # If no structured findings, treat as general review
        if not findings:
            # Check for approval indicators
            if any(word in text.lower() for word in ["approve", "lgtm", "looks good"]):
                findings.append({
                    "severity": "info",
                    "level": 0,
                    "description": "Code review passed",
                })

        return findings

    def _evaluate_findings(self, findings: list[dict[str, Any]]) -> bool:
        """Evaluate if findings allow approval."""
        for finding in findings:
            if finding.get("level", 0) >= 3:  # high or critical
                return False
        return True

    async def _generate_feedback(
        self, task: Task, context: dict[str, Any]
    ) -> str:
        """Generate feedback for the developer."""
        feedback_prompt = f"""Generate constructive feedback for the developer based on the review.

<task>
{task.description}
</task>

<review_context>
{context}
</review_context>

Provide:
1. Summary of issues found
2. Specific suggestions for fixes
3. Priority order for addressing issues

Be constructive and actionable."""

        output = await self.execute_prompt(feedback_prompt)
        return output.text

    async def _merge_branch(self, task: Task) -> dict[str, Any]:
        """Merge the task branch into main."""
        if not task.branch_name:
            return {"success": False, "error": "No branch name"}

        try:
            # Get worktree path or use main repo
            cwd = Path(task.worktree_path) if task.worktree_path else self.working_dir

            # Switch to main and merge
            commands = [
                ["git", "checkout", "main"],
                ["git", "merge", "--squash", task.branch_name],
                ["git", "commit", "-m", f"feat: {task.description[:50]}"],
            ]

            for cmd in commands:
                result = subprocess.run(
                    cmd,
                    cwd=self.working_dir,  # Always merge in main repo
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    return {
                        "success": False,
                        "error": result.stderr,
                        "command": " ".join(cmd),
                    }

            # Get commit hash
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=self.working_dir,
                capture_output=True,
                text=True,
            )

            return {
                "success": True,
                "commit": result.stdout.strip(),
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def cleanup_worktree(self, task: Task) -> bool:
        """Clean up a task's worktree after merge."""
        if not task.worktree_path:
            return True

        try:
            subprocess.run(
                ["git", "worktree", "remove", task.worktree_path],
                cwd=self.working_dir,
                capture_output=True,
            )

            # Also delete the branch
            if task.branch_name:
                subprocess.run(
                    ["git", "branch", "-d", task.branch_name],
                    cwd=self.working_dir,
                    capture_output=True,
                )

            return True
        except Exception as e:
            logger.warning(f"Failed to cleanup worktree: {e}")
            return False
