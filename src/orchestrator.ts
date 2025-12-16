/**
 * Agent Orchestrator
 *
 * Manages the hierarchy of agents and coordinates their work.
 * Supports state persistence, resume capability, and parallel developer execution.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeSession } from './session.ts';
import type {
  AgentConfig,
  AgentRole,
  AgentState,
  AgentStatus,
  Task,
  PersistedState,
  OrchestrationPhase,
  TaskBatch,
  DevTask,
} from './types.ts';

/** Current state file version */
const STATE_VERSION = 3;  // v3: minimal storage (paths instead of content)

/** Default number of parallel developers */
const DEFAULT_MAX_DEVELOPERS = 3;

/** System prompts for each agent role */
const SYSTEM_PROMPTS: Record<AgentRole, string> = {
  ceo: `You are the CEO Agent in Autonoma. Your role is to:
- Analyze the given requirements and project context
- Create a high-level plan with clear milestones
- Ensure the plan follows any project guidelines provided
- Output a structured plan that the Staff Engineer can break into tasks

IMPORTANT: Your output should end with a JSON block containing the plan:
\`\`\`json
{
  "milestones": [
    {"id": 1, "title": "...", "description": "..."},
    {"id": 2, "title": "...", "description": "..."}
  ]
}
\`\`\`

Signal completion with [PLAN_COMPLETE] after the JSON.`,

  staff: `You are the Staff Engineer Agent in Autonoma. Your role is to:
- Receive milestones from the CEO
- Break them into specific, actionable coding tasks
- Group tasks into BATCHES based on dependencies
- Tasks in the same batch that touch DIFFERENT files can run in PARALLEL
- Tasks that depend on other tasks must be in LATER batches

CRITICAL: Organize tasks for PARALLEL EXECUTION by multiple developers.

IMPORTANT: Your output should end with a JSON block containing batched tasks:
\`\`\`json
{
  "batches": [
    {
      "batchId": 1,
      "parallel": false,
      "description": "Initial setup - must run first",
      "tasks": [
        {"id": 1, "title": "Initialize project", "description": "...", "files": ["package.json", "tsconfig.json"]}
      ]
    },
    {
      "batchId": 2,
      "parallel": true,
      "description": "Core features - can run in parallel (different files)",
      "tasks": [
        {"id": 2, "title": "Implement player movement", "description": "...", "files": ["src/player.ts"]},
        {"id": 3, "title": "Implement weapon system", "description": "...", "files": ["src/weapons.ts"]},
        {"id": 4, "title": "Implement HUD", "description": "...", "files": ["src/hud.ts"]}
      ]
    },
    {
      "batchId": 3,
      "parallel": false,
      "description": "Integration - depends on previous batches",
      "tasks": [
        {"id": 5, "title": "Wire up game loop", "description": "...", "files": ["src/main.ts"]}
      ]
    }
  ]
}
\`\`\`

Rules for batching:
1. Tasks that create foundational files go in early batches (parallel: false)
2. Tasks touching DIFFERENT files can be parallel: true
3. Tasks touching the SAME files must be in different batches or parallel: false
4. Later batches can depend on earlier batches completing

Signal completion with [TASKS_READY] after the JSON.`,

  developer: `You are a Developer Agent in Autonoma. Your role is to:
- Execute the assigned coding task
- Create or modify files as needed
- Write clean, working code following project conventions
- DO NOT ask for confirmation - just implement the task
- Focus ONLY on your assigned files - other developers handle other files

You have full permission to create and edit files. Be autonomous and complete the task.
Signal completion with [TASK_COMPLETE] when done.`,

  qa: `You are the QA Agent in Autonoma. Your role is to:
- Review the code that was written
- Check if it meets the requirements and follows project guidelines
- Run any tests if applicable
- Report any issues found

Signal completion with [REVIEW_COMPLETE] and indicate PASS or FAIL.`,
};

/** Tile size ratios for each role */
const TILE_RATIOS: Record<AgentRole, number> = {
  ceo: 40,
  staff: 30,
  developer: 15,
  qa: 15,
};

export interface OrchestratorEvents {
  onAgentOutput: (agentId: string, line: string) => void;
  onAgentStatusChange: (agentId: string, status: AgentStatus) => void;
  onTaskUpdate: (task: Task) => void;
  onPhaseChange?: (phase: string) => void;
}

interface ParsedPlan {
  milestones: Array<{ id: number; title: string; description: string }>;
}

interface ParsedBatches {
  batches: Array<{
    batchId: number;
    parallel: boolean;
    description?: string;
    tasks: Array<{ id: number; title: string; description: string; files?: string[] }>;
  }>;
}

// Legacy format for backwards compatibility
interface ParsedTasks {
  tasks: Array<{ id: number; title: string; description: string; files?: string[] }>;
}

export class Orchestrator {
  private agents: Map<string, { state: AgentState; session: ClaudeSession }> = new Map();
  private tasks: Map<string, Task> = new Map();
  private events: OrchestratorEvents;
  private workingDir: string;
  private taskIdCounter = 0;
  public currentPhase: OrchestrationPhase = 'idle';
  private projectContext: string | null = null;
  private logDir: string;
  private stateDir: string;
  private statePath: string;
  private persistedState: PersistedState | null = null;
  private maxDevelopers: number = DEFAULT_MAX_DEVELOPERS;
  private requirementsContent: string | null = null;

  constructor(workingDir: string, events: OrchestratorEvents) {
    this.workingDir = workingDir;
    this.events = events;
    this.stateDir = join(workingDir, '.autonoma');
    this.logDir = join(this.stateDir, 'logs');
    this.statePath = join(this.stateDir, 'state.json');
  }

  /**
   * Set maximum number of parallel developers
   */
  setMaxDevelopers(n: number): void {
    this.maxDevelopers = Math.max(1, Math.min(n, 10));  // Clamp between 1-10
  }

  /**
   * Initialize directories
   */
  private async initDirs(): Promise<void> {
    await mkdir(this.logDir, { recursive: true });
  }

  /**
   * Check if a saved state exists
   */
  async hasPersistedState(): Promise<boolean> {
    try {
      await access(this.statePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load persisted state from disk
   */
  async loadPersistedState(): Promise<PersistedState | null> {
    try {
      const content = await readFile(this.statePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = JSON.parse(content) as any;

      // Handle version migration
      if (state.version === 1 || state.version === 2) {
        // Migrate v1/v2 to v3: minimal storage format
        state.version = STATE_VERSION;

        // Convert flat tasks to batches (v1 migration)
        if (state.tasks && state.tasks.length > 0 && (!state.batches || state.batches.length === 0)) {
          state.batches = [{
            batchId: 1,
            tasks: state.tasks,
            parallel: false,
            status: 'pending',
          }];
        }

        // v2->v3: Convert requirements content to path
        if (state.requirements && !state.requirementsPath) {
          // We don't know the original path, store a marker
          state.requirementsPath = '__migrated__';
          // Store content in memory for this session only
          this.requirementsContent = state.requirements;
        }

        // v2->v3: Convert projectContext to flag
        if (state.projectContext !== undefined) {
          state.hasProjectContext = !!state.projectContext;
          // Load context at runtime instead
        }

        // Clean up legacy fields before saving
        delete state.requirements;
        delete state.projectContext;
        delete state.tasks;

        state.batches = state.batches || [];
        state.currentBatchIndex = state.currentBatchIndex ?? 0;
        state.currentTasksInProgress = state.currentTasksInProgress || [];
        state.maxDevelopers = state.maxDevelopers || DEFAULT_MAX_DEVELOPERS;
      }

      if (state.version === STATE_VERSION) {
        this.persistedState = state as PersistedState;
        this.maxDevelopers = state.maxDevelopers || DEFAULT_MAX_DEVELOPERS;
        return state as PersistedState;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Save current state to disk
   */
  private async saveState(): Promise<void> {
    if (this.persistedState) {
      this.persistedState.updatedAt = new Date().toISOString();
      await writeFile(this.statePath, JSON.stringify(this.persistedState, null, 2), 'utf-8');
    }
  }

  /**
   * Initialize a new persisted state
   */
  private initPersistedState(requirementsPath: string): void {
    this.persistedState = {
      version: STATE_VERSION,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase: 'idle',
      requirementsPath,
      hasProjectContext: !!this.projectContext,
      plan: null,
      batches: [],
      currentBatchIndex: 0,
      currentTasksInProgress: [],
      completedPhases: [],
      maxDevelopers: this.maxDevelopers,
    };
  }

  /**
   * Load requirements content from file
   */
  async loadRequirements(requirementsPath: string): Promise<string> {
    // If we have cached content from migration, use it
    if (this.requirementsContent) {
      return this.requirementsContent;
    }

    // Handle migrated state where we don't have original path
    if (requirementsPath === '__migrated__') {
      throw new Error('State was migrated from old version. Requirements content is unavailable. Please use "start" with the requirements file.');
    }

    try {
      const content = await readFile(requirementsPath, 'utf-8');
      this.requirementsContent = content;
      return content;
    } catch {
      throw new Error(`Cannot read requirements file: ${requirementsPath}`);
    }
  }

  /**
   * Mark a phase as complete
   */
  private async completePhase(phase: OrchestrationPhase): Promise<void> {
    if (this.persistedState && !this.persistedState.completedPhases.includes(phase)) {
      this.persistedState.completedPhases.push(phase);
      await this.saveState();
    }
  }

  /**
   * Check if a phase was already completed
   */
  private isPhaseComplete(phase: OrchestrationPhase): boolean {
    return this.persistedState?.completedPhases.includes(phase) ?? false;
  }

  /**
   * Save agent output to log file
   */
  private async saveAgentLog(role: string, output: string[]): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(this.logDir, `${role}-${timestamp}.log`);
    await writeFile(logPath, output.join('\n'), 'utf-8');
  }

  /**
   * Load project context from CLAUDE.md if it exists
   */
  async loadProjectContext(): Promise<string | null> {
    const claudeMdPath = join(this.workingDir, 'CLAUDE.md');

    try {
      const content = await readFile(claudeMdPath, 'utf-8');
      this.projectContext = content;
      return content;
    } catch {
      this.projectContext = null;
      return null;
    }
  }

  /**
   * Get all agent states
   */
  getAgents(): AgentState[] {
    return Array.from(this.agents.values()).map(a => a.state);
  }

  /**
   * Get agent state by ID
   */
  getAgent(id: string): AgentState | undefined {
    return this.agents.get(id)?.state;
  }

  /**
   * Get all tasks (runtime tasks created during execution)
   */
  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get all tasks from batches (includes pending tasks not yet started)
   * This provides a complete view of all planned work
   */
  getAllBatchTasks(): Task[] {
    const batches = this.persistedState?.batches || [];
    const allTasks: Task[] = [];

    for (const batch of batches) {
      for (const devTask of batch.tasks) {
        allTasks.push({
          id: `batch-${batch.batchId}-task-${devTask.id}`,
          description: devTask.title,
          agentId: devTask.assignedTo,
          status: devTask.status === 'running' ? 'running' :
                  devTask.status === 'complete' ? 'complete' :
                  devTask.status === 'failed' ? 'failed' : 'pending',
          createdAt: new Date(),
        });
      }
    }

    return allTasks;
  }

  /**
   * Get tile ratio for an agent role
   */
  getTileRatio(role: AgentRole): number {
    return TILE_RATIOS[role];
  }

  /**
   * Create an agent
   */
  createAgent(role: AgentRole, name: string): string {
    const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const config: AgentConfig = {
      id,
      role,
      name,
      systemPrompt: SYSTEM_PROMPTS[role],
      workingDir: this.workingDir,
    };

    const state: AgentState = {
      config,
      status: 'idle',
      output: [],
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
    };

    const session = new ClaudeSession(config, {
      onOutput: (line) => {
        state.output.push(line);
        this.events.onAgentOutput(id, line);
      },
      onStatusChange: (status) => {
        state.status = status;
        if (status === 'running') {
          state.startTime = new Date();
        } else if (status === 'complete' || status === 'error') {
          state.endTime = new Date();
        }
        this.events.onAgentStatusChange(id, status);
      },
      onError: (error) => {
        state.error = error;
      },
      onTokenUpdate: (usage) => {
        // Accumulate tokens across sessions
        state.tokenUsage.inputTokens += usage.inputTokens;
        state.tokenUsage.outputTokens += usage.outputTokens;
        state.tokenUsage.totalCostUsd += usage.totalCostUsd;
      },
    });

    this.agents.set(id, { state, session });
    return id;
  }

  /**
   * Start an agent with a prompt
   */
  async startAgent(agentId: string, prompt: string): Promise<string[]> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Clear previous output for reuse
    agent.state.output = [];

    await agent.session.start(prompt);
    return agent.state.output;
  }

  /**
   * Kill an agent
   */
  killAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.session.kill();
    }
  }

  /**
   * Kill all agents
   */
  killAll(): void {
    for (const [id] of this.agents) {
      this.killAgent(id);
    }
  }

  /**
   * Create a task
   */
  createTask(description: string, agentId?: string): Task {
    const id = `task-${++this.taskIdCounter}`;
    const task: Task = {
      id,
      description,
      agentId,
      status: 'pending',
      createdAt: new Date(),
    };
    this.tasks.set(id, task);
    this.events.onTaskUpdate(task);
    return task;
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: Task['status']): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (status === 'running') {
        task.startedAt = new Date();
      } else if (status === 'complete' || status === 'failed') {
        task.completedAt = new Date();
      }
      this.events.onTaskUpdate(task);
    }
  }

  /**
   * Initialize the standard agent hierarchy
   */
  initializeHierarchy(): void {
    // Check if we already have agents
    const existingDevs = this.getDeveloperAgents().length;

    if (this.agents.size === 0) {
      // Fresh start - create all agents
      this.createAgent('ceo', 'CEO');
      this.createAgent('staff', 'Staff Engineer');
      for (let i = 1; i <= this.maxDevelopers; i++) {
        this.createAgent('developer', `Developer ${i}`);
      }
      this.createAgent('qa', 'QA');
    } else if (existingDevs < this.maxDevelopers) {
      // Need more developers - add them
      for (let i = existingDevs + 1; i <= this.maxDevelopers; i++) {
        this.createAgent('developer', `Developer ${i}`);
      }
    }
  }

  /**
   * Get all developer agents
   */
  private getDeveloperAgents(): Array<{ state: AgentState; session: ClaudeSession }> {
    return Array.from(this.agents.values()).filter(a => a.state.config.role === 'developer');
  }

  private setPhase(phase: OrchestrationPhase): void {
    this.currentPhase = phase;
    if (this.persistedState) {
      this.persistedState.phase = phase;
      this.saveState().catch(() => {}); // Fire and forget
    }
    this.events.onPhaseChange?.(phase);
  }

  /**
   * Parse JSON from agent output
   */
  private parseJsonFromOutput(output: string[]): unknown | null {
    const fullOutput = output.join('\n');

    // Try to find JSON block in markdown code fence
    const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Continue to try other methods
      }
    }

    // Try to find raw JSON object
    const objectMatch = fullOutput.match(/\{[\s\S]*"(?:milestones|tasks|batches)"[\s\S]*\}/);
    if (objectMatch?.[0]) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // Failed to parse
      }
    }

    return null;
  }

  /**
   * Find agent by role
   */
  private findAgentByRole(role: AgentRole): { state: AgentState; session: ClaudeSession } | undefined {
    return Array.from(this.agents.values()).find(a => a.state.config.role === role);
  }

  /**
   * Build the context section for prompts
   */
  private buildContextSection(): string {
    if (!this.projectContext) {
      return '';
    }

    return `
## Project Context (from CLAUDE.md)

The following guidelines and context have been provided for this project:

<project-context>
${this.projectContext}
</project-context>

Please follow these guidelines when planning and implementing.

---

`;
  }

  /**
   * Convert legacy flat tasks to batch format
   */
  private convertLegacyTasksToBatches(tasks: ParsedTasks['tasks']): TaskBatch[] {
    // Simple conversion: put all tasks in one sequential batch
    return [{
      batchId: 1,
      tasks: tasks.map(t => ({
        ...t,
        status: 'pending' as const,
      })),
      parallel: false,
      status: 'pending',
    }];
  }

  /**
   * Load and format context files for adopt prompts
   */
  private async loadContextFiles(contextFiles: string[]): Promise<string> {
    if (contextFiles.length === 0) return '';

    const sections: string[] = [];
    for (const filePath of contextFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const fileName = filePath.split('/').pop() || filePath;
        sections.push(`### ${fileName}\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        // Skip files that can't be read
      }
    }

    if (sections.length === 0) return '';

    return `
## Pre-provided Context Files

The user has provided the following files to help you understand the codebase structure.
Use this information to SKIP redundant exploration - trust this context and only verify critical areas.

${sections.join('\n\n')}

---

`;
  }

  /**
   * Analyze an existing project to create a resume state
   * Used for projects that weren't initialized with Autonoma
   */
  async adoptProject(requirementsPath: string, contextFiles: string[] = []): Promise<void> {
    await this.initDirs();
    await this.loadProjectContext();

    // Load requirements content
    const requirements = await this.loadRequirements(requirementsPath);

    // Load user-provided context files
    const userContextSection = await this.loadContextFiles(contextFiles);

    // Initialize state with path, not content
    this.initPersistedState(requirementsPath);

    const ceoAgent = this.findAgentByRole('ceo');
    if (!ceoAgent) throw new Error('CEO agent not found');

    if (contextFiles.length > 0) {
      this.events.onAgentOutput(ceoAgent.state.config.id, `[ADOPT] Using ${contextFiles.length} context file(s) to guide analysis...`);
    }
    this.events.onAgentOutput(ceoAgent.state.config.id, '[ADOPT] Analyzing existing project...');

    // Ask CEO to analyze what exists and create a plan for remaining work
    const projectContextSection = this.buildContextSection();

    // Build prompt with context-aware instructions
    const hasContext = userContextSection.length > 0;
    const analysisInstructions = hasContext
      ? `Please:
1. Use the provided context files to understand the codebase structure
2. Only verify critical implementation details - trust the context for structure
3. Identify what has already been implemented based on the context
4. Create a plan for the REMAINING work only
5. Output milestones for what still needs to be done`
      : `Please:
1. Analyze the current state of the codebase
2. Identify what has already been implemented
3. Create a plan for the REMAINING work only
4. Output milestones for what still needs to be done`;

    const adoptPrompt = `${userContextSection}${projectContextSection}You are adopting an existing project that may have partial implementation.

Requirements for the full project:
${requirements}

${analysisInstructions}

IMPORTANT: Your output should end with a JSON block containing the plan for remaining work:
\`\`\`json
{
  "milestones": [
    {"id": 1, "title": "...", "description": "..."},
    {"id": 2, "title": "...", "description": "..."}
  ]
}
\`\`\`

Signal completion with [PLAN_COMPLETE] after the JSON.`;

    this.setPhase('planning');
    const output = await this.startAgent(ceoAgent.state.config.id, adoptPrompt);
    await this.saveAgentLog('ceo-adopt', output);

    // Parse the plan
    const plan = this.parseJsonFromOutput(output) as ParsedPlan | null;

    if (plan?.milestones?.length) {
      this.persistedState!.plan = plan;
      this.events.onAgentOutput(ceoAgent.state.config.id, `[ADOPT] Found ${plan.milestones.length} milestones for remaining work`);
    } else {
      this.events.onAgentOutput(ceoAgent.state.config.id, '[ADOPT] No structured plan found, will analyze requirements directly');
    }

    await this.completePhase('planning');
    await this.saveState();

    this.events.onAgentOutput(ceoAgent.state.config.id, '[ADOPT] Project adopted. Run with --resume to continue.');
  }

  /**
   * Resume from saved state
   */
  async resume(): Promise<void> {
    const state = await this.loadPersistedState();
    if (!state) {
      throw new Error('No saved state found. Use "start" to begin or "adopt" for existing projects.');
    }

    await this.initDirs();

    // Load project context at runtime if it exists
    if (state.hasProjectContext) {
      await this.loadProjectContext();
    }

    // Load requirements content from file
    const requirements = await this.loadRequirements(state.requirementsPath);

    // Initialize agents
    if (this.agents.size === 0) {
      this.initializeHierarchy();
    }

    const ceoAgent = this.findAgentByRole('ceo');
    if (ceoAgent) {
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Resuming from phase: ${state.phase}`);
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Completed phases: ${state.completedPhases.join(', ') || 'none'}`);
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Max developers: ${this.maxDevelopers}`);
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Batches: ${state.batches.length}, current: ${state.currentBatchIndex}`);
    }

    // Resume from appropriate phase
    if (!this.isPhaseComplete('planning')) {
      await this.runPlanningPhase(requirements);
    } else if (state.plan) {
      // Restore plan from state
      this.persistedState!.plan = state.plan;
    }

    if (!this.isPhaseComplete('task-breakdown')) {
      await this.runTaskBreakdownPhase(requirements);
    } else if (state.batches.length > 0) {
      // Restore batches from state
      this.persistedState!.batches = state.batches;
    }

    if (!this.isPhaseComplete('development')) {
      await this.runDevelopmentPhase(requirements, state.currentBatchIndex);
    }

    if (!this.isPhaseComplete('review')) {
      await this.runReviewPhase(requirements);
    }

    this.setPhase('complete');
  }

  /**
   * Run planning phase (CEO)
   */
  private async runPlanningPhase(requirements: string): Promise<void> {
    this.setPhase('planning');
    const ceoAgent = this.findAgentByRole('ceo');
    if (!ceoAgent) throw new Error('CEO agent not found');

    const planTask = this.createTask('Analyze requirements and create plan', ceoAgent.state.config.id);
    this.updateTaskStatus(planTask.id, 'running');

    const contextSection = this.buildContextSection();
    if (this.projectContext) {
      this.events.onAgentOutput(ceoAgent.state.config.id, '[INFO] Found CLAUDE.md - using project context for planning');
    }

    const ceoPrompt = `${contextSection}Please analyze these requirements and create a development plan:

${requirements}`;

    const ceoOutput = await this.startAgent(ceoAgent.state.config.id, ceoPrompt);
    await this.saveAgentLog('ceo', ceoOutput);

    this.updateTaskStatus(planTask.id, ceoAgent.state.status === 'complete' ? 'complete' : 'failed');

    // Parse and save the plan
    const plan = this.parseJsonFromOutput(ceoOutput) as ParsedPlan | null;

    if (plan?.milestones?.length) {
      this.persistedState!.plan = plan;
      this.events.onAgentOutput(ceoAgent.state.config.id, `[INFO] Plan created with ${plan.milestones.length} milestones`);
    } else {
      this.events.onAgentOutput(ceoAgent.state.config.id, '[Note: No structured plan found, using direct execution]');
    }

    await this.completePhase('planning');
  }

  /**
   * Run task breakdown phase (Staff Engineer)
   */
  private async runTaskBreakdownPhase(requirements: string): Promise<void> {
    this.setPhase('task-breakdown');
    const staffAgent = this.findAgentByRole('staff');
    if (!staffAgent) throw new Error('Staff Engineer agent not found');

    const breakdownTask = this.createTask('Break plan into development tasks', staffAgent.state.config.id);
    this.updateTaskStatus(breakdownTask.id, 'running');

    const contextSection = this.buildContextSection();
    const plan = this.persistedState?.plan;

    const milestoneText = plan?.milestones
      ? plan.milestones.map(m => `- ${m.title}: ${m.description}`).join('\n')
      : `Based on these requirements:\n${requirements}`;

    const staffPrompt = `${contextSection}Break down these milestones into specific coding tasks.
We have ${this.maxDevelopers} developer agents available to work IN PARALLEL.

Milestones:
${milestoneText}

Group tasks into batches. Tasks in parallel batches will be executed simultaneously by different developers.
Ensure tasks in parallel batches touch DIFFERENT files to avoid conflicts.`;

    const staffOutput = await this.startAgent(staffAgent.state.config.id, staffPrompt);
    await this.saveAgentLog('staff', staffOutput);

    this.updateTaskStatus(breakdownTask.id, staffAgent.state.status === 'complete' ? 'complete' : 'failed');

    // Try to parse as new batch format first
    const parsed = this.parseJsonFromOutput(staffOutput);

    if (parsed && 'batches' in (parsed as object)) {
      const batchedPlan = parsed as ParsedBatches;
      this.persistedState!.batches = batchedPlan.batches.map(b => ({
        batchId: b.batchId,
        tasks: b.tasks.map(t => ({ ...t, status: 'pending' as const })),
        parallel: b.parallel,
        status: 'pending' as const,
      }));

      const totalTasks = batchedPlan.batches.reduce((sum, b) => sum + b.tasks.length, 0);
      const parallelBatches = batchedPlan.batches.filter(b => b.parallel).length;
      this.events.onAgentOutput(staffAgent.state.config.id,
        `[INFO] Created ${batchedPlan.batches.length} batches with ${totalTasks} total tasks (${parallelBatches} parallel batches)`);
    } else if (parsed && 'tasks' in (parsed as object)) {
      // Legacy format - convert to batches
      const legacyPlan = parsed as ParsedTasks;
      this.persistedState!.batches = this.convertLegacyTasksToBatches(legacyPlan.tasks);
      this.events.onAgentOutput(staffAgent.state.config.id,
        `[INFO] Created ${legacyPlan.tasks.length} tasks (legacy format, running sequentially)`);
    }

    await this.completePhase('task-breakdown');
  }

  /**
   * Run development phase (Developer) - with parallel execution
   */
  private async runDevelopmentPhase(requirements: string, startFromBatch: number = 0): Promise<void> {
    this.setPhase('development');

    const contextSection = this.buildContextSection();
    const batches = this.persistedState?.batches || [];
    const developers = this.getDeveloperAgents();

    if (batches.length === 0) {
      // Fallback: implement requirements directly with first developer
      const devAgent = developers[0];
      if (!devAgent) throw new Error('No developer agents found');

      const task = this.createTask('Implement requirements', devAgent.state.config.id);
      this.updateTaskStatus(task.id, 'running');

      const devPrompt = `${contextSection}Implement these requirements directly:

${requirements}

Create the necessary files and code.`;

      const devOutput = await this.startAgent(devAgent.state.config.id, devPrompt);
      await this.saveAgentLog('developer', devOutput);

      this.updateTaskStatus(task.id, devAgent.state.status === 'complete' ? 'complete' : 'failed');
      await this.completePhase('development');
      return;
    }

    // Execute batches
    for (let batchIdx = startFromBatch; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      if (!batch || batch.status === 'complete') continue;

      this.persistedState!.currentBatchIndex = batchIdx;
      batch.status = 'running';
      await this.saveState();

      const pendingTasks = batch.tasks.filter(t => t.status === 'pending' || t.status === 'running');

      if (pendingTasks.length === 0) {
        batch.status = 'complete';
        continue;
      }

      // Log batch start
      const firstDev = developers[0];
      if (firstDev) {
        this.events.onAgentOutput(firstDev.state.config.id,
          `[BATCH ${batchIdx + 1}/${batches.length}] ${batch.parallel ? 'PARALLEL' : 'SEQUENTIAL'} - ${pendingTasks.length} tasks`);
      }

      if (batch.parallel && developers.length > 1) {
        // PARALLEL EXECUTION
        await this.executeTasksInParallel(batch, pendingTasks, developers, contextSection);
      } else {
        // SEQUENTIAL EXECUTION
        await this.executeTasksSequentially(batch, pendingTasks, developers[0]!, contextSection);
      }

      // Mark batch complete if all tasks done
      const allComplete = batch.tasks.every(t => t.status === 'complete');
      batch.status = allComplete ? 'complete' : 'failed';
      await this.saveState();
    }

    await this.completePhase('development');
  }

  /**
   * Execute tasks in parallel using multiple developers
   */
  private async executeTasksInParallel(
    _batch: TaskBatch,
    tasks: DevTask[],
    developers: Array<{ state: AgentState; session: ClaudeSession }>,
    contextSection: string
  ): Promise<void> {
    // Process tasks in chunks based on available developers
    for (let i = 0; i < tasks.length; i += developers.length) {
      const chunk = tasks.slice(i, i + developers.length);

      // Track which tasks are in progress
      this.persistedState!.currentTasksInProgress = chunk.map(t => t.id);
      await this.saveState();

      // Start all tasks in this chunk in parallel
      const promises = chunk.map(async (devTask, idx) => {
        const developer = developers[idx % developers.length]!;

        devTask.status = 'running';
        devTask.assignedTo = developer.state.config.id;

        const task = this.createTask(devTask.title, developer.state.config.id);
        this.updateTaskStatus(task.id, 'running');

        this.events.onAgentOutput(developer.state.config.id,
          `[PARALLEL] Task ${devTask.id}: ${devTask.title}`);

        const devPrompt = `${contextSection}Execute this task:

Title: ${devTask.title}
Description: ${devTask.description}
${devTask.files ? `Files to create/modify: ${devTask.files.join(', ')}` : ''}

IMPORTANT: Focus ONLY on the files listed above. Other developers are working on other files simultaneously.

Implement this now. Create the necessary files.`;

        try {
          const devOutput = await this.startAgent(developer.state.config.id, devPrompt);
          await this.saveAgentLog(`developer-${developer.state.config.name}-task-${devTask.id}`, devOutput);

          devTask.status = developer.state.status === 'complete' ? 'complete' : 'failed';
          this.updateTaskStatus(task.id, devTask.status);
        } catch (error) {
          devTask.status = 'failed';
          this.updateTaskStatus(task.id, 'failed');
          this.events.onAgentOutput(developer.state.config.id, `[ERROR] Task ${devTask.id} failed: ${error}`);
        }
      });

      // Wait for all parallel tasks in this chunk to complete
      await Promise.all(promises);

      this.persistedState!.currentTasksInProgress = [];
      await this.saveState();
    }
  }

  /**
   * Execute tasks sequentially with a single developer
   */
  private async executeTasksSequentially(
    _batch: TaskBatch,
    tasks: DevTask[],
    developer: { state: AgentState; session: ClaudeSession },
    contextSection: string
  ): Promise<void> {
    for (const devTask of tasks) {
      if (devTask.status === 'complete') continue;

      devTask.status = 'running';
      devTask.assignedTo = developer.state.config.id;
      await this.saveState();

      const task = this.createTask(devTask.title, developer.state.config.id);
      this.updateTaskStatus(task.id, 'running');

      this.events.onAgentOutput(developer.state.config.id,
        `[SEQUENTIAL] Task ${devTask.id}: ${devTask.title}`);

      const devPrompt = `${contextSection}Execute this task:

Title: ${devTask.title}
Description: ${devTask.description}
${devTask.files ? `Files to create/modify: ${devTask.files.join(', ')}` : ''}

Implement this now. Create the necessary files.`;

      try {
        const devOutput = await this.startAgent(developer.state.config.id, devPrompt);
        await this.saveAgentLog(`developer-task-${devTask.id}`, devOutput);

        devTask.status = developer.state.status === 'complete' ? 'complete' : 'failed';
        this.updateTaskStatus(task.id, devTask.status);
      } catch (error) {
        devTask.status = 'failed';
        this.updateTaskStatus(task.id, 'failed');
        this.events.onAgentOutput(developer.state.config.id, `[ERROR] Task ${devTask.id} failed: ${error}`);
      }

      await this.saveState();
    }
  }

  /**
   * Run review phase (QA)
   */
  private async runReviewPhase(requirements: string): Promise<void> {
    this.setPhase('review');
    const qaAgent = this.findAgentByRole('qa');
    if (!qaAgent) throw new Error('QA agent not found');

    const reviewTask = this.createTask('Review implementation', qaAgent.state.config.id);
    this.updateTaskStatus(reviewTask.id, 'running');

    const contextSection = this.buildContextSection();
    const qaPrompt = `${contextSection}Review the code that was just created. Check if it meets these requirements:

${requirements}

List the files that were created and verify they work correctly.`;

    const qaOutput = await this.startAgent(qaAgent.state.config.id, qaPrompt);
    await this.saveAgentLog('qa', qaOutput);

    this.updateTaskStatus(reviewTask.id, qaAgent.state.status === 'complete' ? 'complete' : 'failed');

    await this.completePhase('review');
    this.events.onAgentOutput(qaAgent.state.config.id, `[Logs saved to ${this.logDir}]`);
  }

  /**
   * Start the orchestration with requirements - FULL CHAIN
   */
  async start(requirementsPath: string): Promise<void> {
    await this.initDirs();
    await this.loadProjectContext();

    // Load requirements content
    const requirements = await this.loadRequirements(requirementsPath);

    // Initialize state with path, not content
    this.initPersistedState(requirementsPath);
    await this.saveState();

    // Initialize agents if not done
    if (this.agents.size === 0) {
      this.initializeHierarchy();
    }

    // Run all phases
    await this.runPlanningPhase(requirements);
    await this.runTaskBreakdownPhase(requirements);
    await this.runDevelopmentPhase(requirements);
    await this.runReviewPhase(requirements);

    this.setPhase('complete');
  }
}
