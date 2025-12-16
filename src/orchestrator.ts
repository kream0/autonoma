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
const DEFAULT_MAX_DEVELOPERS = 6;

/** System prompts for each agent role */
const SYSTEM_PROMPTS: Record<AgentRole, string> = {
  ceo: `<role>CEO Agent in Autonoma</role>

<responsibilities>
- Analyze the given requirements and project context
- Create a high-level plan with clear milestones
- Ensure the plan follows any project guidelines provided
- Output a structured plan that the Staff Engineer can break into tasks
</responsibilities>

<output_format>
Your output MUST end with a JSON block containing the plan:
\`\`\`json
{
  "milestones": [
    {"id": 1, "title": "...", "description": "..."},
    {"id": 2, "title": "...", "description": "..."}
  ]
}
\`\`\`
</output_format>

<completion_signal>Signal completion with [PLAN_COMPLETE] after the JSON.</completion_signal>`,

  staff: `<role>Staff Engineer Agent in Autonoma</role>

<responsibilities>
- Receive milestones from the CEO
- Break them into specific, actionable coding tasks
- ANALYZE TASK COMPLEXITY to prevent context overflow in developers
- Recommend optimal number of parallel developers based on task complexity
- Group tasks into BATCHES based on dependencies
- Tasks in the same batch that touch DIFFERENT files can run in PARALLEL
</responsibilities>

<complexity_analysis>
<instruction>For each task, estimate its complexity based on:</instruction>
<factors>
- File count and scope of changes
- Amount of existing code that must be read/understood
- Cognitive complexity (algorithms, architecture decisions)
- Integration points with other components
</factors>
<levels>
- simple: Single file, straightforward change, ~5-50 lines
- moderate: 1-3 files, well-defined scope, ~50-200 lines
- complex: Multiple files, requires understanding codebase, ~200-500 lines
- very_complex: Cross-cutting concern, architectural, requires extensive context
</levels>
</complexity_analysis>

<developer_recommendation>
<critical>Each developer starts with a FRESH context window - NO context carryover between tasks</critical>
<rule>Complex/very_complex tasks consume more context tokens during execution</rule>
<rule>Too many parallel complex tasks = developers may hit context limits (autocompact)</rule>
<guidance>
- All simple/moderate tasks: recommend up to 6 developers (full parallelism)
- Mix with some complex tasks: recommend 3-4 developers
- Mostly complex/very_complex tasks: recommend 1-2 developers, or split large tasks
</guidance>
</developer_recommendation>

<output_format>
Your output MUST end with a JSON block:
\`\`\`json
{
  "recommendedDevelopers": <number 1-6>,
  "reasoning": "<brief explanation of why this number>",
  "batches": [
    {
      "batchId": 1,
      "parallel": false,
      "description": "Initial setup - must run first",
      "tasks": [
        {"id": 1, "title": "Initialize project", "description": "...", "files": ["package.json"], "complexity": "simple"}
      ]
    },
    {
      "batchId": 2,
      "parallel": true,
      "maxParallelTasks": 3,
      "description": "Core features - limited parallelism due to complexity",
      "tasks": [
        {"id": 2, "title": "Implement auth", "description": "...", "files": ["src/auth.ts"], "complexity": "complex", "context": "Reference session.ts patterns"},
        {"id": 3, "title": "Implement API", "description": "...", "files": ["src/api.ts"], "complexity": "moderate"}
      ]
    }
  ]
}
\`\`\`
</output_format>

<batching_rules>
1. Tasks that create foundational files go in early batches (parallel: false)
2. Tasks touching DIFFERENT files can be parallel: true
3. Tasks touching the SAME files must be in different batches or parallel: false
4. Later batches can depend on earlier batches completing
5. Use maxParallelTasks on batches with complex tasks to limit concurrency
</batching_rules>

<completion_signal>Signal completion with [TASKS_READY] after the JSON.</completion_signal>`,

  developer: `<role>Developer Agent in Autonoma</role>

<responsibilities>
- Execute the assigned coding task
- Create or modify files as needed
- Write clean, working code following project conventions
- Focus ONLY on your assigned files - other developers handle other files
</responsibilities>

<permissions>You have full permission to create and edit files. Be autonomous.</permissions>

<constraints>
- DO NOT ask for confirmation - just implement the task
- Complete the task fully before signaling completion
</constraints>

<completion_signal>Signal completion with [TASK_COMPLETE] when done.</completion_signal>`,

  qa: `<role>QA Agent in Autonoma</role>

<responsibilities>
- Review the code that was written
- Check if it meets the requirements and follows project guidelines
- Run any tests if applicable
- Report any issues found
</responsibilities>

<completion_signal>Signal completion with [REVIEW_COMPLETE] and indicate PASS or FAIL.</completion_signal>`,
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
  recommendedDevelopers?: number;  // Staff Engineer's recommendation
  reasoning?: string;  // Explanation for the recommendation
  batches: Array<{
    batchId: number;
    parallel: boolean;
    description?: string;
    maxParallelTasks?: number;  // Per-batch parallelism limit
    tasks: Array<{
      id: number;
      title: string;
      description: string;
      files?: string[];
      complexity?: 'simple' | 'moderate' | 'complex' | 'very_complex';
      context?: string;  // Task-specific context for developer
    }>;
  }>;
}

// Legacy format for backwards compatibility
interface ParsedTasks {
  tasks: Array<{ id: number; title: string; description: string; files?: string[] }>;
}

/** Common project documentation files that many projects use */
const PROJECT_DOC_FILES = ['PRD.md', 'TODO.md', 'LAST_SESSION.md', 'BACKLOG.md', 'COMPLETED_TASKS.md'];

export class Orchestrator {
  private agents: Map<string, { state: AgentState; session: ClaudeSession }> = new Map();
  private tasks: Map<string, Task> = new Map();
  private events: OrchestratorEvents;
  private workingDir: string;
  private taskIdCounter = 0;
  public currentPhase: OrchestrationPhase = 'idle';
  private projectContext: string | null = null;
  private projectDocs: Map<string, string> = new Map();  // Stores loaded project docs
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
   * Load common project documentation files (PRD.md, TODO.md, etc.)
   * These are commonly used in projects to provide context
   */
  async loadProjectDocs(): Promise<Map<string, string>> {
    this.projectDocs.clear();

    for (const fileName of PROJECT_DOC_FILES) {
      const filePath = join(this.workingDir, fileName);
      try {
        const content = await readFile(filePath, 'utf-8');
        this.projectDocs.set(fileName, content);
      } catch {
        // File doesn't exist, skip it
      }
    }

    return this.projectDocs;
  }

  /**
   * Get loaded project docs
   */
  getProjectDocs(): Map<string, string> {
    return this.projectDocs;
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
   * Get permission mode for a role
   * CEO and Staff only need to read/analyze - use plan mode
   * Developer and QA need to write files - use full permissions
   */
  private getPermissionMode(role: AgentRole): 'plan' | 'full' {
    switch (role) {
      case 'ceo':
      case 'staff':
        return 'plan';  // Read-only for planning/analysis
      case 'developer':
      case 'qa':
        return 'full';  // Full access for implementation/testing
    }
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
      permissionMode: this.getPermissionMode(role),
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
   * Build the context section for prompts using XML structure
   * Includes CLAUDE.md and any project documentation files found
   */
  private buildContextSection(): string {
    const sections: string[] = [];

    // Add CLAUDE.md if present
    if (this.projectContext) {
      sections.push(`<project_guidelines>
<source>CLAUDE.md</source>
<instructions>Follow these guidelines when planning and implementing.</instructions>
<content>
${this.projectContext}
</content>
</project_guidelines>`);
    }

    // Add project documentation files if present
    if (this.projectDocs.size > 0) {
      const docSections: string[] = [];
      for (const [fileName, content] of this.projectDocs) {
        docSections.push(`<document name="${fileName}">
${content}
</document>`);
      }

      sections.push(`<project_documentation>
<description>Existing project documentation found in the codebase.</description>
${docSections.join('\n')}
</project_documentation>`);
    }

    if (sections.length === 0) {
      return '';
    }

    return sections.join('\n\n') + '\n\n';
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
   * Load and format context files for adopt prompts using XML structure
   */
  private async loadContextFiles(contextFiles: string[]): Promise<string> {
    if (contextFiles.length === 0) return '';

    const sections: string[] = [];
    for (const filePath of contextFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const fileName = filePath.split('/').pop() || filePath;
        sections.push(`<file name="${fileName}">
${content}
</file>`);
      } catch {
        // Skip files that can't be read
      }
    }

    if (sections.length === 0) return '';

    return `<user_provided_context>
<instructions>
Use this information to SKIP redundant exploration.
Trust this context and only verify critical areas.
</instructions>
<files>
${sections.join('\n')}
</files>
</user_provided_context>

`;
  }

  /**
   * Analyze an existing project to create a resume state
   * Used for projects that weren't initialized with Autonoma
   */
  async adoptProject(requirementsPath: string, contextFiles: string[] = []): Promise<void> {
    await this.initDirs();
    await this.loadProjectContext();
    await this.loadProjectDocs();

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
    if (this.projectDocs.size > 0) {
      const docNames = Array.from(this.projectDocs.keys()).join(', ');
      this.events.onAgentOutput(ceoAgent.state.config.id, `[ADOPT] Found project docs: ${docNames}`);
    }
    this.events.onAgentOutput(ceoAgent.state.config.id, '[ADOPT] Analyzing existing project...');

    // Ask CEO to analyze what exists and create a plan for remaining work
    const projectContextSection = this.buildContextSection();

    // Build prompt with context-aware instructions
    const hasContext = userContextSection.length > 0;
    const analysisInstructions = hasContext
      ? `<instructions>
<step>Use the provided context files to understand the codebase structure</step>
<step>Only verify critical implementation details - trust the context for structure</step>
<step>Identify what has already been implemented based on the context</step>
<step>Create a plan for the REMAINING work only</step>
<step>Output milestones for what still needs to be done</step>
</instructions>`
      : `<instructions>
<step>Analyze the current state of the codebase</step>
<step>Identify what has already been implemented</step>
<step>Create a plan for the REMAINING work only</step>
<step>Output milestones for what still needs to be done</step>
</instructions>`;

    const adoptPrompt = `${userContextSection}${projectContextSection}<task>Adopt an existing project that may have partial implementation.</task>

<requirements>
${requirements}
</requirements>

${analysisInstructions}

<output_format>
Your output MUST end with a JSON block containing the plan for remaining work:
\`\`\`json
{
  "milestones": [
    {"id": 1, "title": "...", "description": "..."},
    {"id": 2, "title": "...", "description": "..."}
  ]
}
\`\`\`
</output_format>

<completion_signal>Signal completion with [PLAN_COMPLETE] after the JSON.</completion_signal>`;

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

    // Load project documentation files
    await this.loadProjectDocs();

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
    if (this.projectDocs.size > 0) {
      const docNames = Array.from(this.projectDocs.keys()).join(', ');
      this.events.onAgentOutput(ceoAgent.state.config.id, `[INFO] Found project docs: ${docNames}`);
    }

    const ceoPrompt = `${contextSection}<task>Analyze requirements and create a development plan.</task>

<requirements>
${requirements}
</requirements>`;

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
      ? plan.milestones.map(m => `<milestone id="${m.id}">${m.title}: ${m.description}</milestone>`).join('\n')
      : `<fallback>Based on requirements directly</fallback>\n${requirements}`;

    const staffPrompt = `${contextSection}<task>Break down milestones into specific coding tasks.</task>

<context>
<available_developers>${this.maxDevelopers}</available_developers>
<execution_mode>PARALLEL - developers work simultaneously</execution_mode>
</context>

<milestones>
${milestoneText}
</milestones>

<instructions>
<step>Group tasks into batches</step>
<step>Tasks in parallel batches will be executed simultaneously by different developers</step>
<step>Ensure tasks in parallel batches touch DIFFERENT files to avoid conflicts</step>
</instructions>`;

    const staffOutput = await this.startAgent(staffAgent.state.config.id, staffPrompt);
    await this.saveAgentLog('staff', staffOutput);

    this.updateTaskStatus(breakdownTask.id, staffAgent.state.status === 'complete' ? 'complete' : 'failed');

    // Try to parse as new batch format first
    const parsed = this.parseJsonFromOutput(staffOutput);

    if (parsed && 'batches' in (parsed as object)) {
      const batchedPlan = parsed as ParsedBatches;

      // Apply Staff Engineer's developer recommendation (advisory - capped by maxDevelopers)
      if (batchedPlan.recommendedDevelopers !== undefined) {
        const recommended = batchedPlan.recommendedDevelopers;
        const actual = Math.min(recommended, this.maxDevelopers);

        this.events.onAgentOutput(staffAgent.state.config.id,
          `[COMPLEXITY] Staff recommends ${recommended} parallel developers: ${batchedPlan.reasoning || 'no reason given'}`);

        if (actual < this.maxDevelopers) {
          this.events.onAgentOutput(staffAgent.state.config.id,
            `[COMPLEXITY] Reducing from ${this.maxDevelopers} to ${actual} developers to avoid context limits`);
          this.setMaxDevelopers(actual);
          this.persistedState!.maxDevelopers = actual;
        } else if (actual === this.maxDevelopers) {
          this.events.onAgentOutput(staffAgent.state.config.id,
            `[COMPLEXITY] Using ${actual} developers (full parallelism)`);
        }
      }

      // Store batches with complexity and context info
      this.persistedState!.batches = batchedPlan.batches.map(b => ({
        batchId: b.batchId,
        tasks: b.tasks.map(t => ({
          ...t,
          status: 'pending' as const,
          complexity: t.complexity,
          context: t.context,
        })),
        parallel: b.parallel,
        maxParallelTasks: b.maxParallelTasks,
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

      const devPrompt = `${contextSection}<task>Implement requirements directly (no task breakdown available).</task>

<requirements>
${requirements}
</requirements>

<instructions>Create the necessary files and code to fulfill the requirements.</instructions>`;

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
    batch: TaskBatch,
    tasks: DevTask[],
    developers: Array<{ state: AgentState; session: ClaudeSession }>,
    contextSection: string
  ): Promise<void> {
    // Use batch-specific parallelism limit if provided, otherwise use all available developers
    const maxParallel = batch.maxParallelTasks ?? developers.length;
    const effectiveDevelopers = developers.slice(0, maxParallel);

    // Log if batch has reduced parallelism due to complexity
    if (maxParallel < developers.length && effectiveDevelopers[0]) {
      this.events.onAgentOutput(effectiveDevelopers[0].state.config.id,
        `[COMPLEXITY] Batch ${batch.batchId} limited to ${maxParallel} parallel tasks`);
    }

    // Process tasks in chunks based on effective developers
    for (let i = 0; i < tasks.length; i += effectiveDevelopers.length) {
      const chunk = tasks.slice(i, i + effectiveDevelopers.length);

      // Track which tasks are in progress
      this.persistedState!.currentTasksInProgress = chunk.map(t => t.id);
      await this.saveState();

      // Start all tasks in this chunk in parallel
      const promises = chunk.map(async (devTask, idx) => {
        const developer = effectiveDevelopers[idx % effectiveDevelopers.length]!;

        devTask.status = 'running';
        devTask.assignedTo = developer.state.config.id;

        const task = this.createTask(devTask.title, developer.state.config.id);
        this.updateTaskStatus(task.id, 'running');

        this.events.onAgentOutput(developer.state.config.id,
          `[PARALLEL] Task ${devTask.id}: ${devTask.title}${devTask.complexity ? ` (${devTask.complexity})` : ''}`);

        const devPrompt = `${contextSection}<task>
<id>${devTask.id}</id>
<title>${devTask.title}</title>
<description>${devTask.description}</description>
${devTask.files ? `<files>${devTask.files.join(', ')}</files>` : ''}
${devTask.complexity ? `<complexity>${devTask.complexity}</complexity>` : ''}
${devTask.context ? `<task_context>${devTask.context}</task_context>` : ''}
</task>

<execution_context>
<mode>PARALLEL</mode>
<constraint>Focus ONLY on the files listed above. Other developers are working on other files simultaneously.</constraint>
</execution_context>

<instructions>Implement this task now. Create the necessary files.</instructions>`;

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
        `[SEQUENTIAL] Task ${devTask.id}: ${devTask.title}${devTask.complexity ? ` (${devTask.complexity})` : ''}`);

      const devPrompt = `${contextSection}<task>
<id>${devTask.id}</id>
<title>${devTask.title}</title>
<description>${devTask.description}</description>
${devTask.files ? `<files>${devTask.files.join(', ')}</files>` : ''}
${devTask.complexity ? `<complexity>${devTask.complexity}</complexity>` : ''}
${devTask.context ? `<task_context>${devTask.context}</task_context>` : ''}
</task>

<execution_context>
<mode>SEQUENTIAL</mode>
</execution_context>

<instructions>Implement this task now. Create the necessary files.</instructions>`;

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
    const qaPrompt = `${contextSection}<task>Review the code that was just created.</task>

<requirements>
${requirements}
</requirements>

<instructions>
<step>List the files that were created</step>
<step>Verify they work correctly</step>
<step>Check if implementation meets the requirements</step>
</instructions>`;

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
    await this.loadProjectDocs();

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
