/**
 * Indefinite Loop Controller
 *
 * Manages continuous autonomous operation until project completion.
 * Handles:
 * - Main development loop with CEO approval
 * - Context window monitoring and agent replacement
 * - Health monitoring and crash recovery
 * - User interrupt handling
 * - Completion criteria checking
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Orchestrator } from './orchestrator.ts';
import { HealthMonitor } from './watchdog.ts';
import type { AgentRole, UserInterrupt } from './types.ts';

/** Browser framework dependencies that indicate E2E testing is needed */
const BROWSER_FRAMEWORKS = [
  'react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'gatsby',
  'vite', 'webpack', '@vitejs/plugin-react', 'react-dom',
];

export interface IndefiniteLoopEvents {
  onLoopIteration: (iteration: number) => void;
  onUserInterruptRequest: () => Promise<string | null>;
  onProjectComplete: () => void;
  onProjectFailed: (reason: string) => void;
  onAgentRespawn: (oldAgentId: string, newAgentId: string, role: AgentRole) => void;
}

export interface IndefiniteLoopConfig {
  maxLoopIterations?: number;  // Safety limit, default 100
  checkInterruptsBetweenPhases?: boolean;
  enableE2ETesting?: boolean;  // Auto-detect if not specified
  enableHealthMonitoring?: boolean;
}

const DEFAULT_CONFIG: Required<IndefiniteLoopConfig> = {
  maxLoopIterations: 100,
  checkInterruptsBetweenPhases: true,
  enableE2ETesting: true,
  enableHealthMonitoring: true,
};

export class IndefiniteLoopController {
  private orchestrator: Orchestrator;
  private events: IndefiniteLoopEvents;
  private config: Required<IndefiniteLoopConfig>;
  private healthMonitor: HealthMonitor;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private currentIteration: number = 0;
  private userInterrupts: UserInterrupt[] = [];
  private isBrowserProject: boolean = false;
  private requirements: string = '';  // Store requirements content for cycle calls

  constructor(
    orchestrator: Orchestrator,
    events: IndefiniteLoopEvents,
    config: IndefiniteLoopConfig = {}
  ) {
    this.orchestrator = orchestrator;
    this.events = events;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize health monitor
    this.healthMonitor = new HealthMonitor({
      onHealthIssue: (agentId, issue) => {
        this.handleHealthIssue(agentId, issue);
      },
      onWatchdogDecision: (agentId, decision, reason) => {
        console.log(`[WATCHDOG] ${agentId}: ${decision} - ${reason}`);
      },
    });
  }

  /**
   * Enable indefinite mode on orchestrator
   */
  enableIndefiniteMode(): void {
    this.orchestrator.indefiniteMode = true;
  }

  /**
   * Detect if project is a browser project requiring E2E testing
   */
  async detectBrowserProject(workingDir: string): Promise<boolean> {
    try {
      const pkgPath = join(workingDir, 'package.json');
      const content = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const framework of BROWSER_FRAMEWORKS) {
        if (framework in allDeps) {
          this.isBrowserProject = true;
          return true;
        }
      }
    } catch {
      // No package.json or parse error
    }

    this.isBrowserProject = false;
    return false;
  }

  /**
   * Check if project is complete
   */
  isProjectComplete(): boolean {
    // Get all tasks from batches
    const tasks = this.orchestrator.getAllBatchTasks();

    // Check all tasks complete
    const allComplete = tasks.every(t => t.status === 'complete');
    if (!allComplete) return false;

    // Check current phase
    return this.orchestrator.currentPhase === 'complete';
  }

  /**
   * Handle health issues detected by monitor
   */
  private async handleHealthIssue(agentId: string, issue: string): Promise<void> {
    const agent = this.orchestrator.getAgent(agentId);
    if (!agent) return;

    console.log(`[HEALTH] Issue with ${agent.config.name}: ${issue}`);

    // Make decision (heuristic for now, can invoke Claude watchdog later)
    const { decision, reason } = await this.healthMonitor.invokeWatchdog(
      agentId,
      agent.config.role,
      agent.output.slice(-50),
      issue
    );

    console.log(`[WATCHDOG] Decision: ${decision} - ${reason}`);

    if (decision === 'respawn') {
      await this.respawnAgent(agentId);
    } else if (decision === 'escalate_to_user') {
      // Pause and wait for user input
      this.isPaused = true;
    }
  }

  /**
   * Respawn an agent after crash or health issue
   */
  private async respawnAgent(agentId: string): Promise<string> {
    const agent = this.orchestrator.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found for respawn`);
    }

    const role = agent.config.role;

    // Perform handoff (will create replacement)
    const newAgentId = await this.orchestrator.performHandoff(agentId);

    this.events.onAgentRespawn(agentId, newAgentId, role);
    this.healthMonitor.registerAgent(newAgentId);

    return newAgentId;
  }

  /**
   * Check for user interrupt between phases
   */
  private async checkForUserInterrupt(): Promise<void> {
    if (!this.config.checkInterruptsBetweenPhases) return;
    if (this.isPaused) return;

    // This would be called by the TUI when user presses 'p'
    const guidance = await this.events.onUserInterruptRequest();

    if (guidance && guidance.trim().length > 0) {
      const interrupt: UserInterrupt = {
        timestamp: new Date().toISOString(),
        guidance,
      };
      this.userInterrupts.push(interrupt);

      console.log(`[INTERRUPT] User guidance received: ${guidance.slice(0, 100)}...`);

      // Have CEO process the guidance and adjust plan
      await this.processCeoGuidance(guidance);
    }
  }

  /**
   * Have CEO process user guidance and replan the project
   * This triggers a full replan: CEO creates new milestones, Staff breaks them down
   */
  private async processCeoGuidance(guidance: string): Promise<void> {
    console.log('[CEO GUIDANCE] Processing user input and replanning...');

    try {
      // Use orchestrator's replan method which:
      // 1. Has CEO create updated milestones
      // 2. Runs Staff Engineer to break down tasks
      // 3. Resets batch progress
      const success = await this.orchestrator.replanWithGuidance(guidance, this.requirements);

      if (success) {
        console.log('[CEO GUIDANCE] Replan complete - executing updated plan');
      } else {
        console.log('[CEO GUIDANCE] Replan failed - continuing with current plan');
      }
    } catch (error) {
      console.log(`[CEO GUIDANCE] Error processing guidance: ${error}`);
    }
  }

  /**
   * Pause the loop
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume the loop
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Stop the loop
   */
  stop(): void {
    this.isRunning = false;
    this.healthMonitor.stopPeriodicChecks();
  }

  /**
   * Main indefinite loop
   * Runs until project is complete or max iterations reached
   */
  async run(requirementsPath: string, workingDir: string): Promise<void> {
    this.isRunning = true;
    this.enableIndefiniteMode();

    // Run initial phases (planning, task breakdown) - these only run once
    console.log('[INDEFINITE] Running initial phases...');
    this.requirements = await this.orchestrator.runInitialPhases(requirementsPath);

    // Detect browser project for E2E testing
    if (this.config.enableE2ETesting) {
      await this.detectBrowserProject(workingDir);
      if (this.isBrowserProject) {
        console.log('[INDEFINITE] Browser project detected - E2E testing enabled');
      }
    }

    // Start health monitoring
    if (this.config.enableHealthMonitoring) {
      this.healthMonitor.startPeriodicChecks(30_000);
    }

    // Register all agents with health monitor
    for (const agent of this.orchestrator.getAgents()) {
      this.healthMonitor.registerAgent(agent.config.id);
    }

    try {
      // Main loop
      while (this.isRunning && this.currentIteration < this.config.maxLoopIterations) {
        // Wait if paused
        while (this.isPaused && this.isRunning) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!this.isRunning) break;

        this.currentIteration++;
        this.events.onLoopIteration(this.currentIteration);

        console.log(`[INDEFINITE] Loop iteration ${this.currentIteration}`);

        // Check for user interrupt
        await this.checkForUserInterrupt();

        // Run one full cycle: development -> testing -> QA -> CEO approval
        const cycleResult = await this.orchestrator.runOneCycle(this.requirements);

        if (cycleResult.approved) {
          this.isRunning = false;
          this.events.onProjectComplete();
          console.log('[INDEFINITE] Project approved by CEO - complete!');
          break;
        }

        // CEO rejected - cycle will loop for retry
        console.log(`[INDEFINITE] CEO rejected: ${cycleResult.feedback || 'No feedback'}`);

        // Check for agents needing handoff after each cycle
        for (const agent of this.orchestrator.getAgents()) {
          if (this.orchestrator.needsHandoff(agent.config.id)) {
            console.log(`[INDEFINITE] Agent ${agent.config.name} needs handoff`);
            const newId = await this.respawnAgent(agent.config.id);
            console.log(`[INDEFINITE] Replaced with ${newId}`);
          }
        }

        // Small delay between iterations to prevent spinning
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (this.currentIteration >= this.config.maxLoopIterations) {
        this.events.onProjectFailed(`Max iterations (${this.config.maxLoopIterations}) reached`);
      }
    } finally {
      this.healthMonitor.stopPeriodicChecks();
      this.isRunning = false;
    }
  }

  /**
   * Get current loop status
   */
  getStatus(): {
    isRunning: boolean;
    isPaused: boolean;
    iteration: number;
    maxIterations: number;
    isBrowserProject: boolean;
    userInterruptsCount: number;
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      iteration: this.currentIteration,
      maxIterations: this.config.maxLoopIterations,
      isBrowserProject: this.isBrowserProject,
      userInterruptsCount: this.userInterrupts.length,
    };
  }

  /**
   * Get user interrupts history
   */
  getUserInterrupts(): UserInterrupt[] {
    return [...this.userInterrupts];
  }
}
