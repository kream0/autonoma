/**
 * Agent Orchestrator
 *
 * Manages the hierarchy of agents and coordinates their work.
 * Supports state persistence, resume capability, and parallel developer execution.
 */

import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeSession } from './session.ts';
import { ContextMonitor } from './context-monitor.ts';
import {
  parseHandoffBlock,
  createHandoffRecord,
  formatHandoffForInjection,
  HandoffStorage,
} from './handoff.ts';
import { AutonomaDb, createDatabase } from './db/schema.ts';
import { ProtocolParser } from './protocol/parser.ts';
import { MemoraiClient } from 'memorai';
import { HumanQueue } from './human-queue/index.ts';
import { RetryContextStore } from './retry/index.ts';
import { createVerificationConfig, type VerificationConfig } from './verification/index.ts';
import type {
  AgentConfig,
  AgentRole,
  AgentState,
  AgentStatus,
  ContextThreshold,
  Task,
  PersistedState,
  OrchestrationPhase,
  StatusFile,
} from './types.ts';

// Import from phases module
import {
  SYSTEM_PROMPTS,
  TILE_RATIOS,
  runPlanningPhase,
  runAdoptPhase,
  runReplanPhase,
  runTaskBreakdownPhase,
  runDevelopmentPhase,
  runTestingPhase,
  runReviewPhase,
  runCeoApprovalPhase,
  type PhaseContext,
  type Agent,
} from './phases/index.ts';

/** Current state file version */
const STATE_VERSION = 4;

/** Common project documentation files */
const PROJECT_DOC_FILES = ['PRD.md', 'TODO.md', 'LAST_SESSION.md', 'BACKLOG.md', 'COMPLETED_TASKS.md'];

export interface OrchestratorEvents {
  onAgentOutput: (agentId: string, line: string) => void;
  onAgentStatusChange: (agentId: string, status: AgentStatus) => void;
  onTaskUpdate: (task: Task) => void;
  onPhaseChange?: (phase: string) => void;
  onContextThreshold?: (agentId: string, threshold: ContextThreshold, percent: number) => void;
  onHandoffRequired?: (agentId: string) => void;
}

export class Orchestrator {
  private agents: Map<string, { state: AgentState; session: ClaudeSession }> = new Map();
  private tasks: Map<string, Task> = new Map();
  private events: OrchestratorEvents;
  private workingDir: string;
  private taskIdCounter = 0;
  public currentPhase: OrchestrationPhase = 'idle';
  private projectContext: string | null = null;
  private projectDocs: Map<string, string> = new Map();
  private logDir: string;
  private stateDir: string;
  private statePath: string;
  private statusPath: string;
  private guidancePath: string;
  private guidanceWatcherInterval?: ReturnType<typeof setInterval>;
  private statusWritePending: boolean = false;
  private persistedState: PersistedState | null = null;
  private requirementsContent: string | null = null;

  // Context monitoring and handoff management
  private contextMonitor: ContextMonitor;
  private handoffStorage: HandoffStorage;
  private pendingHandoffs: Map<string, boolean> = new Map();
  private pendingContextMessages: Map<string, string> = new Map();
  public indefiniteMode: boolean = false;

  // Database
  private db: AutonomaDb | null = null;
  private protocolParser: ProtocolParser = new ProtocolParser();

  // Memory and supervisor systems
  private memorai: MemoraiClient | null = null;
  private humanQueue: HumanQueue | null = null;
  private retryContextStore: RetryContextStore | null = null;
  private verificationConfig: VerificationConfig | null = null;

  constructor(workingDir: string, events: OrchestratorEvents) {
    this.workingDir = workingDir;
    this.events = events;
    this.stateDir = join(workingDir, '.autonoma');
    this.logDir = join(this.stateDir, 'logs');
    this.statePath = join(this.stateDir, 'state.json');
    this.statusPath = join(this.stateDir, 'status.json');
    this.guidancePath = join(this.stateDir, 'guidance.txt');

    // Initialize context monitor
    this.contextMonitor = new ContextMonitor({
      onThresholdReached: (agentId, threshold, message) => {
        this.pendingContextMessages.set(agentId, message);
        const state = this.contextMonitor.getAgentState(agentId);
        this.events.onContextThreshold?.(agentId, threshold, state?.percentUsed ?? 0);
        this.events.onAgentOutput(agentId, `[CONTEXT] ${threshold}% threshold reached`);
      },
      onHandoffRequired: (agentId) => {
        this.pendingHandoffs.set(agentId, true);
        this.events.onHandoffRequired?.(agentId);
        this.events.onAgentOutput(agentId, '[CONTEXT] Handoff required - preparing for replacement');
      },
    });

    // Initialize handoff storage
    this.handoffStorage = new HandoffStorage(workingDir);
  }

  /**
   * Create PhaseContext for use by phase functions
   */
  private createPhaseContext(): PhaseContext {
    return {
      workingDir: this.workingDir,
      persistedState: this.persistedState,
      projectContext: this.projectContext,
      projectDocs: this.projectDocs,
      memorai: this.memorai,
      protocolParser: this.protocolParser,
      humanQueue: this.humanQueue,
      verificationConfig: this.verificationConfig,
      retryContextStore: this.retryContextStore,

      findAgentByRole: (role: AgentRole) => this.findAgentByRole(role),
      getDeveloperAgents: () => this.getDeveloperAgents(),
      spawnDevelopersForBatch: (count: number) => this.spawnDevelopersForBatch(count),
      cleanupDevelopers: () => this.cleanupDevelopers(),
      startAgent: (agentId: string, prompt: string) => this.startAgent(agentId, prompt),
      createTask: (description: string, agentId?: string) => this.createTask(description, agentId),
      updateTaskStatus: (taskId: string, status: Task['status']) => this.updateTaskStatus(taskId, status),

      saveState: () => this.saveState(),
      saveAgentLog: (role: string, output: string[]) => this.saveAgentLog(role, output),
      completePhase: (phase: OrchestrationPhase) => this.completePhase(phase),

      emitOutput: (agentId: string, line: string) => this.events.onAgentOutput(agentId, line),
      buildContextSection: () => this.buildContextSection(),
    };
  }

  /**
   * Initialize directories and database
   */
  private async initDirs(): Promise<void> {
    await mkdir(this.logDir, { recursive: true });

    if (!this.db) {
      this.db = await createDatabase(this.workingDir);

      // Memorai - memory package
      this.memorai = new MemoraiClient({ projectDir: this.workingDir });
      try {
        const isInit = this.memorai.isInitialized();
        if (!isInit) {
          this.memorai.init();
          this.events.onAgentOutput('orchestrator', '[MEMORAI] Initialized memory database');
        }
      } catch (error) {
        this.events.onAgentOutput('orchestrator', `[MEMORAI] Warning: Init failed: ${error}`);
        this.memorai = null;
      }

      // Human queue for blockers
      this.humanQueue = new HumanQueue(this.db.raw);

      // Retry context store
      this.retryContextStore = new RetryContextStore(this.db.raw);

      // Verification config - detect project type
      try {
        this.verificationConfig = await createVerificationConfig(this.workingDir);
        this.events.onAgentOutput('orchestrator',
          `[VERIFY] Detected ${this.verificationConfig.projectType} project with ${this.verificationConfig.criteria.length} verification criteria`);
      } catch (error) {
        this.events.onAgentOutput('orchestrator', `[VERIFY] Warning: Detection failed: ${error}`);
      }
    }
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
        state.version = STATE_VERSION;

        if (state.tasks && state.tasks.length > 0 && (!state.batches || state.batches.length === 0)) {
          state.batches = [{
            batchId: 1,
            tasks: state.tasks,
            parallel: false,
            status: 'pending',
          }];
        }

        if (state.requirements && !state.requirementsPath) {
          state.requirementsPath = '__migrated__';
          this.requirementsContent = state.requirements;
        }

        if (state.projectContext !== undefined) {
          state.hasProjectContext = !!state.projectContext;
        }

        delete state.requirements;
        delete state.projectContext;
        delete state.tasks;

        state.batches = state.batches || [];
        state.currentBatchIndex = state.currentBatchIndex ?? 0;
        state.currentTasksInProgress = state.currentTasksInProgress || [];
        // maxDevelopers deprecated - developers spawned dynamically per batch
      }

      if (state.version === STATE_VERSION) {
        this.persistedState = state as PersistedState;
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
  async saveState(): Promise<void> {
    if (this.persistedState) {
      this.persistedState.updatedAt = new Date().toISOString();
      await writeFile(this.statePath, JSON.stringify(this.persistedState, null, 2), 'utf-8');
    }
  }

  /**
   * Write status.json for external monitoring (Claude Code Control API)
   * Non-blocking write with lock to prevent concurrent writes
   */
  private writeStatus(): void {
    // Skip if a write is already in progress
    if (this.statusWritePending) return;
    this.statusWritePending = true;

    const agents: Record<string, AgentStatus> = {};
    let devIndex = 1;
    for (const [, agent] of this.agents) {
      const role = agent.state.config.role;
      const key = role === 'developer' ? `developer-${devIndex++}` : role;
      agents[key] = agent.state.status;
    }

    const tasks = this.getAllBatchTasks();
    const status: StatusFile = {
      phase: this.currentPhase,
      iteration: this.persistedState?.totalLoopIterations || 1,
      progress: {
        completed: tasks.filter(t => t.status === 'complete').length,
        total: tasks.length,
      },
      agents,
      lastUpdate: new Date().toISOString(),
    };

    writeFile(this.statusPath, JSON.stringify(status, null, 2), 'utf-8')
      .finally(() => { this.statusWritePending = false; })
      .catch(() => {});
  }

  /**
   * Start polling for guidance file (Claude Code Control API)
   * Polls every 5 seconds for .autonoma/guidance.txt
   */
  startGuidanceWatcher(onGuidance: (guidance: string) => Promise<void>): void {
    this.stopGuidanceWatcher();
    this.guidanceWatcherInterval = setInterval(async () => {
      try {
        const content = await readFile(this.guidancePath, 'utf-8');
        const guidance = content.trim();
        if (guidance.length > 0) {
          await unlink(this.guidancePath).catch(() => {});
          await onGuidance(guidance);
        }
      } catch {
        // File doesn't exist or read error - ignore
      }
    }, 5000);
  }

  /**
   * Stop the guidance file watcher
   */
  stopGuidanceWatcher(): void {
    if (this.guidanceWatcherInterval) {
      clearInterval(this.guidanceWatcherInterval);
      this.guidanceWatcherInterval = undefined;
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
      // maxDevelopers deprecated - developers spawned dynamically per batch
    };
  }

  /**
   * Load requirements content from file
   */
  async loadRequirements(requirementsPath: string): Promise<string> {
    if (this.requirementsContent) {
      return this.requirementsContent;
    }

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
   * Load project context from CLAUDE.md
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
   * Load common project documentation files
   */
  async loadProjectDocs(): Promise<Map<string, string>> {
    this.projectDocs.clear();
    for (const fileName of PROJECT_DOC_FILES) {
      const filePath = join(this.workingDir, fileName);
      try {
        const content = await readFile(filePath, 'utf-8');
        this.projectDocs.set(fileName, content);
      } catch {
        // File doesn't exist
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
   * Get all tasks
   */
  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get all tasks from batches
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
   */
  private getPermissionMode(role: AgentRole): 'plan' | 'full' {
    switch (role) {
      case 'ceo':
      case 'staff':
        return 'plan';
      case 'developer':
      case 'qa':
      case 'e2e':
        return 'full';
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
        this.writeStatus();
      },
      onError: (error) => {
        state.error = error;
      },
      onTokenUpdate: (usage) => {
        state.tokenUsage.inputTokens += usage.inputTokens;
        state.tokenUsage.outputTokens += usage.outputTokens;
        state.tokenUsage.totalCostUsd += usage.totalCostUsd;

        if (this.indefiniteMode) {
          this.contextMonitor.updateTokenUsage(id, state.tokenUsage);
        }
      },
    });

    this.agents.set(id, { state, session });
    this.contextMonitor.registerAgent(id);

    return id;
  }

  /**
   * Start an agent with a prompt
   */
  async startAgent(agentId: string, prompt: string): Promise<string[]> {
    let agent = this.agents.get(agentId);

    if (!agent) {
      const roleMatch = agentId.match(/^(ceo|staff|developer|qa)-/);
      if (roleMatch) {
        const role = roleMatch[1] as AgentRole;
        agent = this.findAgentByRole(role);
        if (agent) {
          this.events.onAgentOutput(agent.state.config.id,
            `[RECOVERY] Agent ${agentId.slice(0, 20)}... was replaced, using new agent`);
        }
      }
    }

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.state.output = [];

    let finalPrompt = prompt;
    if (this.indefiniteMode) {
      const contextMessage = this.pendingContextMessages.get(agentId);
      if (contextMessage) {
        finalPrompt = `${contextMessage}\n\n${prompt}`;
        this.pendingContextMessages.delete(agentId);
      }
    }

    await agent.session.start(finalPrompt);
    return agent.state.output;
  }

  /**
   * Check if an agent needs handoff
   */
  needsHandoff(agentId: string): boolean {
    return this.indefiniteMode && (this.pendingHandoffs.get(agentId) ?? false);
  }

  /**
   * Perform agent handoff
   */
  async performHandoff(agentId: string, currentTaskId?: number): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found for handoff`);
    }

    const role = agent.state.config.role;
    const name = agent.state.config.name;

    this.events.onAgentOutput(agentId, '[HANDOFF] Processing handoff...');

    const handoffBlock = parseHandoffBlock(agent.state.output);
    const handoff = createHandoffRecord(
      agentId,
      role,
      currentTaskId,
      agent.state.tokenUsage,
      handoffBlock
    );

    await this.handoffStorage.saveHandoff(handoff);

    if (this.persistedState) {
      this.persistedState.handoffs = this.persistedState.handoffs || [];
      this.persistedState.handoffs.push(handoff);
      await this.saveState();
    }

    this.events.onAgentOutput(agentId, `[HANDOFF] Saved handoff record with ${handoffBlock ? 'structured data' : 'minimal data'}`);

    this.killAgent(agentId);
    this.contextMonitor.unregisterAgent(agentId);
    this.pendingHandoffs.delete(agentId);
    this.agents.delete(agentId);

    const newAgentId = this.createAgent(role, name);
    handoff.replacementAgentId = newAgentId;
    await this.handoffStorage.saveHandoff(handoff);

    this.events.onAgentOutput(newAgentId, `[HANDOFF] New agent created (replacing ${agentId.slice(0, 20)}...)`);

    return newAgentId;
  }

  /**
   * Get handoff context to inject into replacement agent prompt
   */
  async getHandoffContext(role: AgentRole): Promise<string> {
    const latestHandoff = await this.handoffStorage.getLatestHandoff(role);
    if (!latestHandoff) {
      return '';
    }
    return formatHandoffForInjection(latestHandoff);
  }

  /**
   * Get context usage percentage for an agent
   */
  getContextPercentage(agentId: string): number {
    return this.contextMonitor.getContextPercentage(agentId);
  }

  /**
   * Get handoff count for statistics
   */
  async getHandoffCount(): Promise<number> {
    return this.handoffStorage.getHandoffCount();
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
      this.writeStatus();
    }
  }

  /**
   * Initialize the standard agent hierarchy (CEO, Staff Engineer, QA only)
   * Developers are spawned dynamically per batch for optimal parallelism
   */
  initializeHierarchy(): void {
    if (this.agents.size === 0) {
      this.createAgent('ceo', 'CEO');
      this.createAgent('staff', 'Staff Engineer');
      this.createAgent('qa', 'QA');
      // Developers spawned dynamically per batch via spawnDevelopersForBatch()
    }
  }

  /**
   * Spawn developers dynamically for a batch
   * Returns the spawned developer agents
   */
  private spawnDevelopersForBatch(count: number): Agent[] {
    // Cleanup any existing developers first
    this.cleanupDevelopers();

    // Warn if spawning many developers
    if (count >= 20) {
      this.events.onAgentOutput('orchestrator',
        `[WARN] Spawning ${count} developers - high resource usage`);
    }

    const developers: Agent[] = [];
    for (let i = 1; i <= count; i++) {
      const id = this.createAgent('developer', `Developer ${i}`);
      const agent = this.agents.get(id);
      if (agent) developers.push(agent);
    }

    this.events.onAgentOutput('orchestrator',
      `[SPAWN] Created ${developers.length} developers for this batch`);

    return developers;
  }

  /**
   * Cleanup all developer agents between batches
   */
  private cleanupDevelopers(): void {
    const devIds: string[] = [];
    for (const [id, agent] of this.agents) {
      if (agent.state.config.role === 'developer') {
        devIds.push(id);
      }
    }
    for (const id of devIds) {
      this.agents.delete(id);
    }
  }

  /**
   * Get all developer agents
   */
  private getDeveloperAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.state.config.role === 'developer');
  }

  private setPhase(phase: OrchestrationPhase): void {
    this.currentPhase = phase;
    if (this.persistedState) {
      this.persistedState.phase = phase;
      this.saveState().catch(() => {});
    }
    this.events.onPhaseChange?.(phase);
    this.writeStatus();
  }

  /**
   * Find agent by role
   */
  private findAgentByRole(role: AgentRole): Agent | undefined {
    return Array.from(this.agents.values()).find(a => a.state.config.role === role);
  }

  /**
   * Build the context section for prompts
   */
  private buildContextSection(): string {
    const sections: string[] = [];

    sections.push(`<project_path>
<absolute_path>${this.workingDir}</absolute_path>
<instruction>This is the TARGET PROJECT you are working on. ALL file operations, tests, and builds must be done in this directory. Do NOT navigate to or test parent directories.</instruction>
</project_path>`);

    if (this.projectContext) {
      sections.push(`<project_guidelines>
<source>CLAUDE.md</source>
<instructions>Follow these guidelines when planning and implementing.</instructions>
<content>
${this.projectContext}
</content>
</project_guidelines>`);
    }

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

    if (this.persistedState?.ceoFeedback) {
      sections.push(`<ceo_required_changes>
<instruction>The CEO rejected the previous iteration. You MUST fix these specific issues:</instruction>
<changes>
${this.persistedState.ceoFeedback}
</changes>
<directive>Focus ONLY on fixing these issues. Do not re-explore the codebase unnecessarily.</directive>
</ceo_required_changes>`);
    }

    return sections.join('\n\n') + '\n\n';
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
   */
  async adoptProject(requirementsPath: string, contextFiles: string[] = []): Promise<void> {
    await this.initDirs();
    await this.loadProjectContext();
    await this.loadProjectDocs();

    const requirements = await this.loadRequirements(requirementsPath);
    const userContextSection = await this.loadContextFiles(contextFiles);

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

    this.setPhase('planning');
    const ctx = this.createPhaseContext();
    await runAdoptPhase(ctx, requirements, userContextSection);
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

    if (state.hasProjectContext) {
      await this.loadProjectContext();
    }
    await this.loadProjectDocs();

    const requirements = await this.loadRequirements(state.requirementsPath);

    if (this.agents.size === 0) {
      this.initializeHierarchy();
    }

    const ceoAgent = this.findAgentByRole('ceo');
    if (ceoAgent) {
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Resuming from phase: ${state.phase}`);
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Completed phases: ${state.completedPhases.join(', ') || 'none'}`);
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Batches: ${state.batches.length}, current: ${state.currentBatchIndex}`);
      this.events.onAgentOutput(ceoAgent.state.config.id, `[RESUME] Developers: spawned dynamically per batch`);
    }

    const ctx = this.createPhaseContext();

    // Resume from appropriate phase
    if (!this.isPhaseComplete('planning')) {
      this.setPhase('planning');
      await runPlanningPhase(ctx, requirements);
    } else if (state.plan) {
      this.persistedState!.plan = state.plan;
    }

    if (!this.isPhaseComplete('task-breakdown')) {
      this.setPhase('task-breakdown');
      await runTaskBreakdownPhase(ctx, requirements);
    } else if (state.batches.length > 0) {
      this.persistedState!.batches = state.batches;
    }

    // Main execution loop with CEO approval
    const maxAttempts = 3;
    const currentAttempts = state.ceoApprovalAttempts || 0;
    let approved = this.isPhaseComplete('ceo-approval');
    let attempts = currentAttempts;

    let testOutput = state.lastTestOutput || [];
    let qaOutput = state.lastQaOutput || [];

    while (!approved && attempts < maxAttempts) {
      attempts++;

      if (ceoAgent && attempts > 1) {
        this.events.onAgentOutput(ceoAgent.state.config.id,
          `[CEO LOOP] Attempt ${attempts}/${maxAttempts} - Retrying with feedback`);
      }

      if (!this.isPhaseComplete('development')) {
        this.setPhase('development');
        await runDevelopmentPhase(ctx, requirements, state.currentBatchIndex);
      }

      if (!this.isPhaseComplete('testing')) {
        this.setPhase('testing');
        const testResults = await runTestingPhase(ctx);
        testOutput = testResults.output;
      }

      if (!this.isPhaseComplete('review')) {
        this.setPhase('review');
        qaOutput = await runReviewPhase(ctx, requirements);
      }

      if (!this.isPhaseComplete('ceo-approval')) {
        this.setPhase('ceo-approval');
        const ceoResult = await runCeoApprovalPhase(ctx, requirements, testOutput, qaOutput);
        approved = ceoResult.approved;

        if (!approved && attempts < maxAttempts) {
          this.resetForRetry();
          if (ceoAgent) {
            this.events.onAgentOutput(ceoAgent.state.config.id,
              `[CEO FEEDBACK] Changes required: ${ceoResult.feedback}`);
          }
        }
      } else {
        approved = true;
      }
    }

    if (!approved) {
      this.setPhase('failed');
      if (ceoAgent) {
        this.events.onAgentOutput(ceoAgent.state.config.id,
          `[CEO] Project failed after ${maxAttempts} attempts`);
      }
      return;
    }

    this.setPhase('complete');
  }

  /**
   * Reset state for retry after CEO rejection
   */
  private async resetForRetry(): Promise<void> {
    if (this.persistedState) {
      this.persistedState.completedPhases = this.persistedState.completedPhases.filter(
        p => p === 'planning' || p === 'task-breakdown'
      );
      this.persistedState.currentBatchIndex = 0;
      for (const batch of this.persistedState.batches) {
        batch.status = 'pending';
        for (const task of batch.tasks) {
          task.status = 'pending';
          task.assignedTo = undefined;
        }
      }
      await this.saveState();
    }
  }

  /**
   * Start the orchestration with requirements - FULL CHAIN
   */
  async start(requirementsPath: string): Promise<void> {
    await this.initDirs();
    await this.loadProjectContext();
    await this.loadProjectDocs();

    const requirements = await this.loadRequirements(requirementsPath);
    this.initPersistedState(requirementsPath);
    await this.saveState();

    if (this.agents.size === 0) {
      this.initializeHierarchy();
    }

    const ctx = this.createPhaseContext();

    // Run planning phases
    this.setPhase('planning');
    await runPlanningPhase(ctx, requirements);

    this.setPhase('task-breakdown');
    await runTaskBreakdownPhase(ctx, requirements);

    // Main execution loop with CEO approval
    const maxAttempts = 3;
    let approved = false;
    let attempts = 0;
    let testOutput: string[] = [];
    let qaOutput: string[] = [];

    while (!approved && attempts < maxAttempts) {
      attempts++;

      const ceoAgent = this.findAgentByRole('ceo');
      if (ceoAgent && attempts > 1) {
        this.events.onAgentOutput(ceoAgent.state.config.id,
          `[CEO LOOP] Attempt ${attempts}/${maxAttempts} - Retrying with feedback`);
      }

      this.setPhase('development');
      await runDevelopmentPhase(ctx, requirements);

      this.setPhase('testing');
      const testResults = await runTestingPhase(ctx);
      testOutput = testResults.output;

      this.setPhase('review');
      qaOutput = await runReviewPhase(ctx, requirements);

      this.setPhase('ceo-approval');
      const ceoResult = await runCeoApprovalPhase(ctx, requirements, testOutput, qaOutput);
      approved = ceoResult.approved;

      if (!approved && attempts < maxAttempts) {
        await this.resetForRetry();
        if (ceoAgent) {
          this.events.onAgentOutput(ceoAgent.state.config.id,
            `[CEO FEEDBACK] Changes required: ${ceoResult.feedback}`);
        }
      }
    }

    if (!approved) {
      this.setPhase('failed');
      const ceoAgent = this.findAgentByRole('ceo');
      if (ceoAgent) {
        this.events.onAgentOutput(ceoAgent.state.config.id,
          `[CEO] Project failed after ${maxAttempts} attempts`);
      }
      return;
    }

    this.setPhase('complete');
  }

  /**
   * Run initial planning phases for indefinite mode
   */
  async runInitialPhases(requirementsPath: string): Promise<string> {
    await this.initDirs();
    await this.loadProjectContext();
    await this.loadProjectDocs();

    const requirements = await this.loadRequirements(requirementsPath);
    this.initPersistedState(requirementsPath);
    await this.saveState();

    if (this.agents.size === 0) {
      this.initializeHierarchy();
    }

    const ctx = this.createPhaseContext();

    if (!this.isPhaseComplete('planning')) {
      this.setPhase('planning');
      await runPlanningPhase(ctx, requirements);
    }

    if (!this.isPhaseComplete('task-breakdown')) {
      this.setPhase('task-breakdown');
      await runTaskBreakdownPhase(ctx, requirements);
    }

    return requirements;
  }

  /**
   * Replan the project based on user guidance
   */
  async replanWithGuidance(guidance: string, requirements: string): Promise<boolean> {
    const ceoAgent = this.findAgentByRole('ceo');
    const staffAgent = this.findAgentByRole('staff');

    if (!ceoAgent || !staffAgent) {
      console.log('[REPLAN] Missing CEO or Staff Engineer agent');
      return false;
    }

    const ctx = this.createPhaseContext();

    this.setPhase('planning');
    const updatedPlan = await runReplanPhase(ctx, requirements, guidance);

    if (!updatedPlan) {
      return false;
    }

    // Run Staff Engineer to break down new milestones
    this.setPhase('task-breakdown');
    await runTaskBreakdownPhase(ctx, requirements);

    // Reset batch progress
    if (this.persistedState) {
      this.persistedState.currentBatchIndex = 0;
      for (const batch of this.persistedState.batches) {
        batch.status = 'pending';
        for (const task of batch.tasks) {
          task.status = 'pending';
          task.assignedTo = undefined;
        }
      }
      await this.saveState();
    }

    this.events.onAgentOutput(ceoAgent.state.config.id, '[REPLAN] Ready to execute updated plan');
    return true;
  }

  /**
   * Run one development cycle for indefinite mode
   */
  async runOneCycle(requirements: string): Promise<{
    approved: boolean;
    feedback?: string;
    hasFailures: boolean;
  }> {
    const ctx = this.createPhaseContext();

    if (!this.isPhaseComplete('development')) {
      this.setPhase('development');
      await runDevelopmentPhase(ctx, requirements);
    }

    let testOutput: string[] = [];
    if (!this.isPhaseComplete('testing')) {
      this.setPhase('testing');
      const testResults = await runTestingPhase(ctx);
      testOutput = testResults.output;
    } else if (this.persistedState?.lastTestOutput) {
      testOutput = this.persistedState.lastTestOutput;
    }

    let qaOutput: string[] = [];
    if (!this.isPhaseComplete('review')) {
      this.setPhase('review');
      qaOutput = await runReviewPhase(ctx, requirements);
    } else if (this.persistedState?.lastQaOutput) {
      qaOutput = this.persistedState.lastQaOutput;
    }

    this.setPhase('ceo-approval');
    const ceoResult = await runCeoApprovalPhase(ctx, requirements, testOutput, qaOutput);

    if (!ceoResult.approved) {
      await this.resetForRetry();
      const ceoAgent = this.findAgentByRole('ceo');
      if (ceoAgent) {
        this.events.onAgentOutput(ceoAgent.state.config.id,
          `[CEO FEEDBACK] Changes required: ${ceoResult.feedback}`);
      }
    }

    return {
      approved: ceoResult.approved,
      feedback: ceoResult.feedback,
      hasFailures: !ceoResult.approved,
    };
  }
}
