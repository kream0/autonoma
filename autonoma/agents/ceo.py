"""CEO Agent - High-level planning and project decomposition."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from autonoma.agents.base import AgentRole, BaseAgent
from autonoma.core.config import Config
from autonoma.core.state import Milestone, StateManager, TaskStatus
from autonoma.core.wrapper import SessionOutput


logger = logging.getLogger(__name__)

# Simple CLAUDE.md template - CEO doesn't generate this anymore
CLAUDE_MD_TEMPLATE = """# Project Standards

## Guidelines
- Follow existing code patterns in the repository
- Write tests for new functionality
- Use conventional commits: feat/fix/docs/refactor/test

## Commit Format
```
<type>(<scope>): <description>
```

## Testing
- Run tests before committing
- Maintain test coverage for critical paths

## Security
- Never commit secrets or credentials
- Validate all user inputs
- Use parameterized queries
"""


class CEOAgent(BaseAgent):
    """CEO Agent responsible for high-level project planning.

    Redesigned for efficiency:
    - Single prompt instead of multiple
    - Direct JSON output
    - No verbose CLAUDE.md generation
    - Token budget enforcement
    """

    role = AgentRole.CEO

    # Token budget for planning (prevent runaway usage)
    token_budget = 8000

    default_system_prompt = """You are a project planning agent. Your job is to analyze requirements and output a structured JSON plan.

RULES:
1. Output ONLY valid JSON - no markdown, no explanations, no code blocks
2. Be concise - task descriptions should be 1-2 sentences max
3. Create 2-5 milestones with 2-6 tasks each
4. Focus on actionable implementation tasks, not documentation

JSON SCHEMA:
{
  "project_name": "string",
  "tech_stack": {"language": "string", "framework": "string", "database": "string"},
  "milestones": [
    {
      "id": "M1",
      "name": "string",
      "phase": 1,
      "description": "string (1 sentence)",
      "tasks": [
        {
          "id": "T1.1",
          "description": "string (1-2 sentences)",
          "dependencies": [],
          "estimated_complexity": "low|medium|high"
        }
      ]
    }
  ]
}"""

    async def run(self, input_data: dict[str, Any]) -> dict[str, Any]:
        """
        Analyze requirements and create a project plan.

        Args:
            input_data: Dictionary containing:
                - requirements: str - The requirements/PRD text
                - requirements_path: Path - Path to requirements file (optional)

        Returns:
            Dictionary containing:
                - plan: dict - The structured project plan
                - milestones: list[Milestone] - Created milestones
        """
        requirements = input_data.get("requirements", "")
        requirements_path = input_data.get("requirements_path")

        # If path provided, read the file
        if requirements_path and not requirements:
            req_path = Path(requirements_path)
            if req_path.exists():
                requirements = req_path.read_text()

        if not requirements:
            raise ValueError("No requirements provided")

        logger.info(f"[{self.agent_id}] Creating project plan...")

        # Single focused prompt
        prompt = self._create_planning_prompt(requirements)
        output = await self.execute_prompt(prompt)

        # Parse the plan
        plan = self._parse_plan(output)

        # Create milestones in database
        milestones = await self._create_milestones(plan)

        # Save plan to file
        await self._save_plan(plan)

        # Save simple CLAUDE.md if it doesn't exist
        await self._ensure_claude_md()

        logger.info(
            f"[{self.agent_id}] Plan created: {len(milestones)} milestones, "
            f"{self.total_tokens} tokens used"
        )

        return {
            "plan": plan,
            "milestones": milestones,
        }

    def _create_planning_prompt(self, requirements: str) -> str:
        """Create a single focused planning prompt."""
        # Truncate very long requirements to save tokens
        max_req_length = 4000
        if len(requirements) > max_req_length:
            requirements = requirements[:max_req_length] + "\n\n[TRUNCATED - focus on key requirements above]"

        return f"""Analyze these requirements and output a JSON project plan.

REQUIREMENTS:
{requirements}

OUTPUT FORMAT: Raw JSON only (no markdown code blocks, no explanations).
Start your response with {{ and end with }}"""

    def _parse_plan(self, output: SessionOutput) -> dict[str, Any]:
        """Parse the plan from Claude's output."""
        text = output.text.strip()

        # Try to find JSON in the output
        # First, try the whole text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from the text
        json_start = text.find("{")
        json_end = text.rfind("}") + 1

        if json_start >= 0 and json_end > json_start:
            try:
                json_str = text[json_start:json_end]
                return json.loads(json_str)
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse plan JSON: {e}")
                logger.debug(f"Raw output: {text[:500]}")

        # Return error plan
        return {
            "project_name": "Unknown",
            "milestones": [],
            "parse_error": True,
            "raw_output": text[:1000],
        }

    async def _create_milestones(self, plan: dict[str, Any]) -> list[Milestone]:
        """Create milestone records in the database."""
        milestones = []

        for m_data in plan.get("milestones", []):
            # Extract task IDs
            task_ids = [t.get("id", f"T{len(milestones)+1}.{i+1}")
                       for i, t in enumerate(m_data.get("tasks", []))]

            milestone = Milestone(
                milestone_id=m_data.get("id", f"M{len(milestones)+1}"),
                name=m_data.get("name", "Unnamed"),
                description=m_data.get("description", ""),
                phase=m_data.get("phase", len(milestones) + 1),
                status=TaskStatus.PENDING,
                tasks=task_ids,
                estimated_tokens=m_data.get("estimated_tokens", 10000),
            )
            await self.state_manager.create_milestone(milestone)
            milestones.append(milestone)

        return milestones

    async def _save_plan(self, plan: dict[str, Any]) -> None:
        """Save the plan to plan.json."""
        plan_path = self.config.plan_json_path
        plan_path.parent.mkdir(parents=True, exist_ok=True)

        with open(plan_path, "w") as f:
            json.dump(plan, f, indent=2)

        logger.info(f"[{self.agent_id}] Saved plan to {plan_path}")

    async def _ensure_claude_md(self) -> None:
        """Ensure CLAUDE.md exists (use template if not)."""
        claude_md_path = self.config.claude_md_path

        # Don't overwrite existing CLAUDE.md
        if claude_md_path.exists():
            logger.debug(f"[{self.agent_id}] CLAUDE.md already exists, keeping it")
            return

        claude_md_path.parent.mkdir(parents=True, exist_ok=True)

        with open(claude_md_path, "w") as f:
            f.write(CLAUDE_MD_TEMPLATE)

        logger.info(f"[{self.agent_id}] Created CLAUDE.md template")
