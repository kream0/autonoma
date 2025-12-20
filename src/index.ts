#!/usr/bin/env bun
/**
 * Autonoma - Claude Code Orchestrator
 *
 * A CLI tool to orchestrate multiple Claude Code instances with a split-tile TUI.
 * Supports --stdout mode for token-economic plain-text monitoring.
 */

import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import blessed from 'blessed';
import { Orchestrator } from './orchestrator.ts';
import { Screen } from './tui/screen.ts';
import { TileManager } from './tui/tiles.ts';
import { TasksView } from './tui/views/tasks.ts';
import { StatsView } from './tui/views/stats.ts';
import { DashboardView } from './tui/views/dashboard.ts';
import { IndefiniteLoopController } from './indefinite.ts';
import type { ViewMode } from './types.ts';

/** Check if stdout mode is enabled */
const STDOUT_MODE = process.argv.includes('--stdout');

/** Check if indefinite mode is enabled */
const INDEFINITE_MODE = process.argv.includes('--indefinite');

/** Check if logging is enabled (TUI mode only - stdout auto-logs) */
const LOG_MODE = process.argv.includes('--log');

// CLI parsing
const args = process.argv.slice(2);

function showHelp(): void {
  console.log(`
Autonoma - Claude Code Orchestrator

Usage:
  autonoma start <requirements.md> [options]     Start new orchestration
  autonoma resume <project-dir> [options]        Resume from saved state
  autonoma adopt <requirements.md> [options]     Adopt existing project
  autonoma demo                                  Run demo mode
  autonoma --help                                Show this help

Options:
  --max-developers N    Maximum parallel developers (default: 6)
  --stdout              Plain-text output mode (no TUI, auto-logs to file)
  --log                 Save session transcript to .autonoma/logs/ (TUI mode)
  --indefinite          Run continuously until project is 100% complete
                        Includes: context management, auto-respawn, E2E testing
  --context file1,...   (adopt only) Provide context files for analysis

Indefinite Mode (--indefinite):
  Enables autonomous operation that continues until the project is complete:
  - Agents are automatically replaced before hitting context limits
  - Handoff blocks preserve knowledge between agent replacements
  - Health monitoring detects and recovers from crashes
  - E2E testing runs for browser projects (auto-detected)
  - Press 'p' to pause and provide guidance
  - Project runs until CEO approves final state

Keyboard Shortcuts (in TUI):
  ↑↓←→     Navigate between tiles
  Enter    Focus (maximize) selected tile
  Escape   Return to split view / Close overlay
  t        Task list view
  s        Stats view
  d        Dashboard view
  p        Pause (indefinite mode) - provide guidance
  q        Quit

Notes:
  - State is saved to <project>/.autonoma/state.json
  - Logs are saved to <project>/.autonoma/logs/
  - If CLAUDE.md exists in project folder, it will be used as context
  - Use tmux/screen for long-running tasks
`);
}

async function main(): Promise<void> {
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  if (command === 'demo') {
    await runDemo();
    return;
  }

  if (command === 'start') {
    const requirementsPath = args[1];
    if (!requirementsPath) {
      console.error('Error: Please provide a requirements file');
      console.error('Usage: autonoma start <requirements.md>');
      process.exit(1);
    }

    await runOrchestration(requirementsPath, 'start');
    return;
  }

  if (command === 'resume') {
    const projectDir = args[1];
    if (!projectDir) {
      console.error('Error: Please provide a project directory');
      console.error('Usage: autonoma resume <project-dir>');
      process.exit(1);
    }

    await runOrchestration(projectDir, 'resume');
    return;
  }

  if (command === 'adopt') {
    const requirementsPath = args[1];
    if (!requirementsPath) {
      console.error('Error: Please provide a requirements file');
      console.error('Usage: autonoma adopt <requirements.md> [--context file1,file2,...]');
      process.exit(1);
    }

    // Parse --context flag
    let contextFiles: string[] = [];
    const contextIdx = args.indexOf('--context');
    if (contextIdx !== -1 && args[contextIdx + 1]) {
      contextFiles = args[contextIdx + 1]!.split(',').map(f => f.trim());
    }

    await runOrchestration(requirementsPath, 'adopt', contextFiles);
    return;
  }

  console.error(`Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}

async function runDemo(): Promise<void> {
  const app = new App(process.cwd());

  // Initialize hierarchy FIRST
  app.orchestrator.initializeHierarchy();

  // THEN create tiles
  app.tileManager.createTiles(app.orchestrator.getAgents());

  // Start rendering
  app.screen.render();

  // Simulate some output
  const agents = app.orchestrator.getAgents();
  let counter = 0;

  const outputInterval = setInterval(() => {
    counter++;
    for (const agent of agents) {
      const messages = [
        `[${new Date().toLocaleTimeString()}] Agent ${agent.config.name} processing...`,
        `Analyzing codebase structure...`,
        `Reading configuration files...`,
        `Planning next steps...`,
        `Executing task ${counter}...`,
      ];
      const message = messages[counter % messages.length];
      if (message) {
        app.tileManager.addOutput(agent.config.id, message);
      }
    }

    if (counter >= 20) {
      clearInterval(outputInterval);
    }
  }, 1000);
}

type OrchestrationMode = 'start' | 'resume' | 'adopt';

async function runOrchestration(pathArg: string, mode: OrchestrationMode, contextFiles: string[] = []): Promise<void> {
  const fullPath = resolve(pathArg);
  let workingDir: string;
  let requirementsPath: string | null = null;

  // Use stdout mode check (check early for state validation)
  const useStdout = STDOUT_MODE;

  if (mode === 'resume') {
    // For resume, the argument is the project directory
    workingDir = fullPath;

    // Check if state exists using a temporary orchestrator
    const tempOrchestrator = new Orchestrator(workingDir, {
      onAgentOutput: () => {},
      onAgentStatusChange: () => {},
      onTaskUpdate: () => {},
    });
    const hasState = await tempOrchestrator.hasPersistedState();

    if (!hasState) {
      console.error(`No saved state found in ${workingDir}/.autonoma/state.json`);
      console.error('Use "start" to begin new orchestration or "adopt" for existing projects.');
      process.exit(1);
    }
  } else {
    // For start/adopt, the argument is the requirements file
    // Just verify it exists, don't load content (orchestrator does that)
    try {
      await readFile(fullPath, 'utf-8');
      requirementsPath = fullPath;
    } catch {
      console.error(`Error reading requirements file: ${fullPath}`);
      process.exit(1);
    }

    // Use the directory containing the requirements file as working directory
    workingDir = dirname(fullPath);
  }

  // Choose app type based on mode
  if (useStdout) {
    await runStdoutOrchestration(workingDir, mode, requirementsPath, contextFiles, INDEFINITE_MODE);
  } else {
    await runTuiOrchestration(workingDir, mode, requirementsPath, contextFiles, INDEFINITE_MODE);
  }
}

async function runStdoutOrchestration(
  workingDir: string,
  mode: OrchestrationMode,
  requirementsPath: string | null,
  contextFiles: string[],
  indefiniteMode: boolean = false
): Promise<void> {
  console.log('════════════════════ AUTONOMA ════════════════════');
  console.log(`Mode: ${mode.toUpperCase()} | Output: STDOUT${indefiniteMode ? ' | INDEFINITE' : ''}`);
  console.log(`Working Dir: ${workingDir}`);
  console.log('═══════════════════════════════════════════════════\n');

  const app = new StdoutApp(workingDir, indefiniteMode);

  // For resume mode, load state first to get saved maxDevelopers
  if (mode === 'resume') {
    await app.orchestrator.loadPersistedState();
  }

  // Parse --max-developers flag
  const maxDevIdx = args.indexOf('--max-developers');
  if (maxDevIdx !== -1 && args[maxDevIdx + 1]) {
    const maxDevs = parseInt(args[maxDevIdx + 1]!, 10);
    if (!isNaN(maxDevs) && maxDevs >= 1 && maxDevs <= 10) {
      app.orchestrator.setMaxDevelopers(maxDevs);
      if (mode === 'resume') {
        await app.orchestrator.saveState();
      }
    } else {
      console.error('Error: --max-developers must be a number between 1 and 10');
      process.exit(1);
    }
  }

  // Initialize agents
  app.orchestrator.initializeHierarchy();
  app.registerAgents();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[INTERRUPTED] Shutting down...');
    app.orchestrator.killAll();
    app.printSummary();
    process.exit(0);
  });

  try {
    // In indefinite mode, use the indefinite controller for start/adopt
    if (indefiniteMode && app.indefiniteController && (mode === 'start' || mode === 'adopt')) {
      if (mode === 'adopt') {
        if (!requirementsPath) throw new Error('Requirements path not set');
        await app.orchestrator.adoptProject(requirementsPath, contextFiles);
        app.orchestrator.initializeHierarchy();
        app.registerAgents();
      }

      // Run indefinite loop (handles initial phases + cycling)
      if (!requirementsPath) throw new Error('Requirements path not set');
      await app.indefiniteController.run(requirementsPath, workingDir);
    } else {
      // Normal (non-indefinite) mode
      switch (mode) {
        case 'start':
          if (!requirementsPath) throw new Error('Requirements path not set');
          await app.orchestrator.start(requirementsPath);
          break;
        case 'resume':
          await app.orchestrator.resume();
          break;
        case 'adopt':
          if (!requirementsPath) throw new Error('Requirements path not set');
          await app.orchestrator.adoptProject(requirementsPath, contextFiles);
          app.orchestrator.initializeHierarchy();
          app.registerAgents();
          await app.orchestrator.resume();
          break;
      }
    }

    app.printSummary();
  } catch (error) {
    console.error(`[ERROR] ${error}`);
    app.printSummary();
    process.exit(1);
  }
}

async function runTuiOrchestration(
  workingDir: string,
  mode: OrchestrationMode,
  requirementsPath: string | null,
  contextFiles: string[],
  indefiniteMode: boolean = false
): Promise<void> {
  const app = new App(workingDir, indefiniteMode, LOG_MODE);

  // For resume mode, load state first to get saved maxDevelopers
  if (mode === 'resume') {
    await app.orchestrator.loadPersistedState();
  }

  // Parse --max-developers flag - applies to ALL modes, can override saved state
  const maxDevIdx = args.indexOf('--max-developers');
  if (maxDevIdx !== -1 && args[maxDevIdx + 1]) {
    const maxDevs = parseInt(args[maxDevIdx + 1]!, 10);
    if (!isNaN(maxDevs) && maxDevs >= 1 && maxDevs <= 10) {
      app.orchestrator.setMaxDevelopers(maxDevs);
      // Persist the override so future resumes use this value
      if (mode === 'resume') {
        await app.orchestrator.saveState();
      }
    } else {
      console.error('Error: --max-developers must be a number between 1 and 10');
      process.exit(1);
    }
  }

  // Initialize agents FIRST so tiles can be created
  app.orchestrator.initializeHierarchy();

  // Create tiles now that agents exist
  app.tileManager.createTiles(app.orchestrator.getAgents());

  // Start rendering
  app.screen.render();

  // Start the appropriate orchestration mode
  const orchestrationPromise = (async () => {
    // In indefinite mode, use the indefinite controller for start/adopt
    if (indefiniteMode && app.indefiniteController && (mode === 'start' || mode === 'adopt')) {
      if (mode === 'adopt') {
        if (!requirementsPath) throw new Error('Requirements path not set');
        await app.orchestrator.adoptProject(requirementsPath, contextFiles);
        // After adopt, re-initialize hierarchy
        app.orchestrator.initializeHierarchy();
        app.tileManager.createTiles(app.orchestrator.getAgents());
        app.screen.render();
      }

      // Run indefinite loop (handles initial phases + cycling)
      if (!requirementsPath) throw new Error('Requirements path not set');
      await app.indefiniteController.run(requirementsPath, workingDir);
    } else {
      // Normal (non-indefinite) mode
      switch (mode) {
        case 'start':
          if (!requirementsPath) throw new Error('Requirements path not set');
          await app.orchestrator.start(requirementsPath);
          break;
        case 'resume':
          await app.orchestrator.resume();
          break;
        case 'adopt':
          if (!requirementsPath) throw new Error('Requirements path not set');
          await app.orchestrator.adoptProject(requirementsPath, contextFiles);
          // After adopt, re-initialize hierarchy with correct developer count
          // and recreate tiles to show all developers
          app.orchestrator.initializeHierarchy();
          app.tileManager.createTiles(app.orchestrator.getAgents());
          app.screen.render();
          // Now continue with resume
          await app.orchestrator.resume();
          break;
      }
    }
  })();

  orchestrationPromise.catch(error => {
    // Show error in CEO tile
    const agents = app.orchestrator.getAgents();
    const ceo = agents.find(a => a.config.role === 'ceo');
    if (ceo) {
      app.tileManager.addOutput(ceo.config.id, `[ERROR] ${error}`);
    }
  });
}

/**
 * Stdout-only Application for headless/token-economic operation
 * Outputs clean, parseable text instead of TUI
 * Supports stdin input: type a line and press Enter to send guidance to CEO
 */
class StdoutApp {
  public orchestrator: Orchestrator;
  public indefiniteController?: IndefiniteLoopController;
  private startTime: Date;
  private agentNames: Map<string, string> = new Map();
  private indefiniteMode: boolean;
  private pendingGuidance: string | null = null;
  private stdinListener?: (data: Buffer) => void;
  private logPath: string;
  private logBuffer: string[] = [];

  constructor(workingDir: string, indefiniteMode: boolean = false) {
    this.startTime = new Date();
    this.indefiniteMode = indefiniteMode;

    // Set up automatic session logging
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logPath = join(workingDir, '.autonoma', 'logs', `session-${timestamp}.log`);

    // Enable indefinite mode on orchestrator if needed
    if (this.indefiniteMode) {
      console.log('[INDEFINITE] Indefinite mode enabled');
      console.log('[INDEFINITE] Type guidance and press Enter to send to CEO (or just press Enter to skip)');
    }

    // Create orchestrator with stdout handlers
    this.orchestrator = new Orchestrator(workingDir, {
      onAgentOutput: (agentId, line) => {
        const agentName = this.agentNames.get(agentId) || agentId.split('-')[0]?.toUpperCase() || 'AGENT';
        this.log(agentName, 'OUT', line);
      },
      onAgentStatusChange: (agentId, status) => {
        const agentName = this.agentNames.get(agentId) || agentId.split('-')[0]?.toUpperCase() || 'AGENT';
        this.log(agentName, status.toUpperCase(), `Status changed to ${status}`);
      },
      onTaskUpdate: (task) => {
        this.log('TASK', task.status.toUpperCase(), `${task.id}: ${task.description}`);
      },
      onPhaseChange: (phase) => {
        this.log('PHASE', 'CHANGE', `═══════════════ ${phase.toUpperCase()} ═══════════════`);
      },
    });

    // Set up stdin listener for user guidance in indefinite mode
    if (this.indefiniteMode) {
      this.setupStdinListener();
    }

    // Initialize indefinite loop controller if in indefinite mode
    if (this.indefiniteMode) {
      this.indefiniteController = new IndefiniteLoopController(
        this.orchestrator,
        {
          onLoopIteration: (iteration) => {
            this.log('INDEFINITE', 'LOOP', `Iteration ${iteration}`);
          },
          onUserInterruptRequest: async () => {
            // Return pending guidance if user typed any
            if (this.pendingGuidance) {
              const guidance = this.pendingGuidance;
              this.pendingGuidance = null;
              return guidance;
            }
            return null;
          },
          onProjectComplete: () => {
            this.log('INDEFINITE', 'COMPLETE', 'Project complete!');
            this.cleanupStdin();
          },
          onProjectFailed: (reason) => {
            this.log('INDEFINITE', 'FAILED', `Project failed: ${reason}`);
            this.cleanupStdin();
          },
          onAgentRespawn: (oldId, newId, role) => {
            this.log('INDEFINITE', 'RESPAWN', `Replaced ${role} agent ${oldId.slice(0, 10)}... with ${newId.slice(0, 10)}...`);
          },
        }
      );
    }
  }

  private setupStdinListener(): void {
    // Set stdin to raw mode if possible (allows reading without waiting for Enter in some terminals)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);  // Keep line mode for simplicity
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.stdinListener = (data: Buffer) => {
      const input = data.toString().trim();
      if (input.length > 0) {
        this.pendingGuidance = input;
        this.log('USER', 'GUIDANCE', `Queued: ${input.slice(0, 100)}${input.length > 100 ? '...' : ''}`);
      }
    };

    process.stdin.on('data', this.stdinListener);
  }

  private cleanupStdin(): void {
    if (this.stdinListener) {
      process.stdin.removeListener('data', this.stdinListener);
      process.stdin.pause();
    }
  }

  private log(agent: string, status: string, message: string): void {
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - this.startTime.getTime()) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timestamp = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Filter out noisy lines for token economy
    if (message.includes('[Session initialized]')) return;
    if (message.includes('[Working dir:')) return;
    if (message.startsWith('[stderr]') && message.length < 20) return;

    // Compact format: [MM:SS] [AGENT/STATUS] message
    const logLine = `[${timestamp}] [${agent}/${status}] ${message}`;
    console.log(logLine);

    // Buffer for file logging
    this.logBuffer.push(logLine);
    if (this.logBuffer.length >= 20) {
      this.flushLog();
    }
  }

  private async flushLog(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    // Capture and clear buffer synchronously to prevent race conditions
    const toWrite = this.logBuffer;
    this.logBuffer = [];

    try {
      // Ensure log directory exists
      const logDir = dirname(this.logPath);
      await mkdir(logDir, { recursive: true });

      // Append to log file
      await appendFile(this.logPath, toWrite.join('\n') + '\n');
    } catch (error) {
      // Silently ignore logging errors to not disrupt main flow
    }
  }

  registerAgents(): void {
    for (const agent of this.orchestrator.getAgents()) {
      this.agentNames.set(agent.config.id, agent.config.name.toUpperCase().replace(' ', '-'));
    }
  }

  async printSummary(): Promise<void> {
    const agents = this.orchestrator.getAgents();
    const elapsed = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    // Add summary to log buffer
    this.logBuffer.push('');
    this.logBuffer.push('════════════════════ SUMMARY ════════════════════');
    this.logBuffer.push(`Duration: ${mins}m ${secs}s`);
    this.logBuffer.push(`Phase: ${this.orchestrator.currentPhase}`);
    this.logBuffer.push('Agents:');
    for (const agent of agents) {
      const tokens = agent.tokenUsage.inputTokens + agent.tokenUsage.outputTokens;
      this.logBuffer.push(`  ${agent.config.name}: ${agent.status} (${tokens.toLocaleString()} tokens)`);
    }
    this.logBuffer.push('═════════════════════════════════════════════════');

    // Flush remaining log buffer to file
    await this.flushLog();

    // Print to console
    console.log('\n════════════════════ SUMMARY ════════════════════');
    console.log(`Duration: ${mins}m ${secs}s`);
    console.log(`Phase: ${this.orchestrator.currentPhase}`);
    console.log('Agents:');
    for (const agent of agents) {
      const tokens = agent.tokenUsage.inputTokens + agent.tokenUsage.outputTokens;
      console.log(`  ${agent.config.name}: ${agent.status} (${tokens.toLocaleString()} tokens)`);
    }
    console.log(`Log saved: ${this.logPath}`);
    console.log('═════════════════════════════════════════════════\n');
  }
}

/**
 * Main Application class that wires everything together
 */
class App {
  public screen: Screen;
  public tileManager: TileManager;
  public orchestrator: Orchestrator;
  public tasksView: TasksView;
  public statsView: StatsView;
  public dashboardView: DashboardView;
  public indefiniteController?: IndefiniteLoopController;

  private currentView: ViewMode = 'tiles';
  private statusBar: blessed.Widgets.BoxElement;
  private startTime: Date;
  private indefiniteMode: boolean;
  private isPaused: boolean = false;
  private guidanceOverlay?: blessed.Widgets.BoxElement;
  private guidanceTextarea?: blessed.Widgets.TextareaElement;
  private pendingGuidance: string | null = null;
  private logPath?: string;
  private logBuffer: string[] = [];

  constructor(workingDir: string, indefiniteMode: boolean = false, enableLogging: boolean = false) {
    this.startTime = new Date();
    this.indefiniteMode = indefiniteMode;

    // Set up optional session logging
    if (enableLogging) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logPath = join(workingDir, '.autonoma', 'logs', `session-${timestamp}.log`);
    }

    // Create screen
    this.screen = new Screen({
      onQuit: () => this.quit(),
      onViewChange: (mode) => this.setView(mode),
      onNavigate: (dir) => this.tileManager.navigate(dir),
      onFocus: () => this.tileManager.focus(),
      onUnfocus: () => this.tileManager.unfocus(),
      onPause: indefiniteMode ? () => this.togglePause() : undefined,
    });

    // Create tile manager
    this.tileManager = new TileManager(this.screen.screen);

    // Create views
    this.tasksView = new TasksView(this.screen.screen);
    this.statsView = new StatsView(this.screen.screen);
    this.dashboardView = new DashboardView(this.screen.screen);
    this.statsView.setStartTime(this.startTime);

    // Create orchestrator with event handlers that update the TUI
    this.orchestrator = new Orchestrator(workingDir, {
      onAgentOutput: (agentId, line) => {
        this.tileManager.addOutput(agentId, line);
        this.logToFile(`[${agentId}] ${line}`);
      },
      onAgentStatusChange: (agentId, status) => {
        this.tileManager.updateStatus(agentId, status);
        this.updateStatusBar();
        this.updateViews();
        this.logToFile(`[${agentId}] Status: ${status}`);
      },
      onTaskUpdate: (task) => {
        this.updateViews();
        this.updateStatusBar();
        this.logToFile(`[TASK] ${task.id}: ${task.status} - ${task.description}`);
      },
      onPhaseChange: (phase) => {
        this.updateStatusBar();
        this.logToFile(`[PHASE] ═══════════════ ${phase.toUpperCase()} ═══════════════`);
      },
    });

    // Create status bar
    this.statusBar = blessed.box({
      parent: this.screen.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        bg: 'blue',
        fg: 'white',
      },
      tags: true,
    });
    this.updateStatusBar();

    // Initialize indefinite loop controller if in indefinite mode
    if (this.indefiniteMode) {
      this.indefiniteController = new IndefiniteLoopController(
        this.orchestrator,
        {
          onLoopIteration: (iteration) => {
            const agents = this.orchestrator.getAgents();
            const ceo = agents.find(a => a.config.role === 'ceo');
            if (ceo) {
              this.tileManager.addOutput(ceo.config.id, `[INDEFINITE] Loop iteration ${iteration}`);
            }
          },
          onUserInterruptRequest: async () => {
            // Return pending guidance if user provided any during pause
            if (this.pendingGuidance) {
              const guidance = this.pendingGuidance;
              this.pendingGuidance = null;
              return guidance;
            }
            return null;
          },
          onProjectComplete: () => {
            const agents = this.orchestrator.getAgents();
            const ceo = agents.find(a => a.config.role === 'ceo');
            if (ceo) {
              this.tileManager.addOutput(ceo.config.id, '[INDEFINITE] Project complete!');
            }
          },
          onProjectFailed: (reason) => {
            const agents = this.orchestrator.getAgents();
            const ceo = agents.find(a => a.config.role === 'ceo');
            if (ceo) {
              this.tileManager.addOutput(ceo.config.id, `[INDEFINITE] Project failed: ${reason}`);
            }
          },
          onAgentRespawn: (_oldId, newId, role) => {
            // Update tiles when agent is respawned
            this.tileManager.addOutput(newId, `[RESPAWN] Replaced ${role} agent (context limit reached)`);
          },
        }
      );
    }
  }

  private togglePause(): void {
    if (!this.indefiniteController) return;

    // If already paused and overlay is showing, this is handled by overlay
    if (this.isPaused && this.guidanceOverlay) {
      return;
    }

    this.isPaused = true;
    this.indefiniteController.pause();
    this.showGuidanceOverlay();
    this.updateStatusBar();
  }

  private showGuidanceOverlay(): void {
    // Create overlay container
    this.guidanceOverlay = blessed.box({
      parent: this.screen.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 14,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black',
      },
      tags: true,
      shadow: true,
    });

    // Title
    blessed.box({
      parent: this.guidanceOverlay,
      top: 0,
      left: 'center',
      width: 'shrink',
      height: 1,
      content: '{bold}{yellow-fg} PAUSED - Enter Guidance {/yellow-fg}{/bold}',
      tags: true,
      style: { bg: 'black' },
    });

    // Instructions
    blessed.box({
      parent: this.guidanceOverlay,
      top: 2,
      left: 2,
      width: '100%-4',
      height: 2,
      content: 'Type your guidance for the CEO below.\nPress Enter to submit, Escape to resume without guidance.',
      style: { fg: 'gray', bg: 'black' },
    });

    // Textarea for user input
    this.guidanceTextarea = blessed.textarea({
      parent: this.guidanceOverlay,
      top: 5,
      left: 2,
      width: '100%-4',
      height: 5,
      border: { type: 'line' },
      style: {
        border: { fg: 'white' },
        bg: 'black',
        fg: 'white',
        focus: { border: { fg: 'green' } },
      },
      inputOnFocus: true,
      mouse: true,
      keys: true,
    });

    // Status hint
    blessed.box({
      parent: this.guidanceOverlay,
      bottom: 0,
      left: 2,
      width: '100%-4',
      height: 1,
      content: '{gray-fg}Enter: Submit | Escape: Resume without guidance{/gray-fg}',
      tags: true,
      style: { bg: 'black' },
    });

    // Handle Enter key - submit guidance
    this.guidanceTextarea.key(['enter'], () => {
      const text = this.guidanceTextarea?.getValue()?.trim() || '';
      this.submitGuidance(text);
    });

    // Handle Escape key - resume without guidance
    this.guidanceTextarea.key(['escape'], () => {
      this.submitGuidance('');
    });

    // Focus the textarea
    this.guidanceTextarea.focus();
    this.screen.render();
  }

  private submitGuidance(guidance: string): void {
    // Store guidance if provided
    if (guidance.length > 0) {
      this.pendingGuidance = guidance;
      const agents = this.orchestrator.getAgents();
      const ceo = agents.find(a => a.config.role === 'ceo');
      if (ceo) {
        this.tileManager.addOutput(ceo.config.id, `[USER GUIDANCE] ${guidance.slice(0, 100)}${guidance.length > 100 ? '...' : ''}`);
      }
    }

    // Destroy overlay
    if (this.guidanceOverlay) {
      this.guidanceOverlay.destroy();
      this.guidanceOverlay = undefined;
      this.guidanceTextarea = undefined;
    }

    // Resume execution
    this.isPaused = false;
    this.indefiniteController?.resume();

    const agents = this.orchestrator.getAgents();
    const ceo = agents.find(a => a.config.role === 'ceo');
    if (ceo) {
      if (guidance.length > 0) {
        this.tileManager.addOutput(ceo.config.id, '[RESUMED] CEO will process your guidance');
      } else {
        this.tileManager.addOutput(ceo.config.id, '[RESUMED] Continuing execution');
      }
    }

    this.updateStatusBar();
    this.screen.render();
  }

  private setView(mode: ViewMode): void {
    // Hide current view
    this.hideCurrentView();

    this.currentView = mode;

    // Show new view
    switch (mode) {
      case 'tiles':
        this.tileManager.show();
        break;
      case 'tasks':
        // Show all batch tasks (includes pending) for complete visibility
        const batchTasks = this.orchestrator.getAllBatchTasks();
        // Fall back to runtime tasks if no batches exist yet
        const tasksToShow = batchTasks.length > 0 ? batchTasks : this.orchestrator.getTasks();
        this.tasksView.update(tasksToShow, this.orchestrator.getAgents());
        this.tasksView.show();
        break;
      case 'stats':
        this.statsView.update(
          this.orchestrator.getAgents(),
          this.orchestrator.getTasks()
        );
        this.statsView.show();
        break;
      case 'dashboard':
        this.dashboardView.update(this.orchestrator.getAgents());
        this.dashboardView.show();
        break;
    }

    this.updateStatusBar();
  }

  private hideCurrentView(): void {
    switch (this.currentView) {
      case 'tiles':
        this.tileManager.hide();
        break;
      case 'tasks':
        this.tasksView.hide();
        break;
      case 'stats':
        this.statsView.hide();
        break;
      case 'dashboard':
        this.dashboardView.hide();
        break;
    }
  }

  private updateViews(): void {
    // Update views if visible
    if (this.tasksView.visible) {
      const batchTasks = this.orchestrator.getAllBatchTasks();
      const tasksToShow = batchTasks.length > 0 ? batchTasks : this.orchestrator.getTasks();
      this.tasksView.update(tasksToShow, this.orchestrator.getAgents());
    }
    if (this.statsView.visible) {
      this.statsView.update(
        this.orchestrator.getAgents(),
        this.orchestrator.getTasks()
      );
    }
    if (this.dashboardView.visible) {
      this.dashboardView.update(this.orchestrator.getAgents());
    }
  }

  private updateStatusBar(): void {
    const agents = this.orchestrator.getAgents();
    const running = agents.filter(a => a.status === 'running').length;
    const complete = agents.filter(a => a.status === 'complete').length;
    const total = agents.length;

    const duration = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    const phase = this.orchestrator.currentPhase.toUpperCase();
    const viewIndicator = this.currentView.toUpperCase();

    // Build status parts
    const parts = [
      ` {bold}AUTONOMA{/bold}`,
    ];

    // Add indefinite mode indicator
    if (this.indefiniteMode) {
      if (this.isPaused) {
        parts.push(`{yellow-fg}[PAUSED]{/yellow-fg}`);
      } else {
        parts.push(`{green-fg}[INDEFINITE]{/green-fg}`);
      }
    }

    parts.push(`Phase: ${phase}`);
    parts.push(`View: ${viewIndicator}`);
    parts.push(`Agents: ${running} running, ${complete}/${total} complete`);
    parts.push(`${minutes}m ${seconds}s`);

    // Shortcuts - include pause if in indefinite mode
    const shortcuts = this.indefiniteMode
      ? `{gray-fg}q:quit t:tasks s:stats d:dash p:pause{/gray-fg}`
      : `{gray-fg}q:quit t:tasks s:stats d:dashboard{/gray-fg}`;
    parts.push(shortcuts);

    this.statusBar.setContent(parts.join(' │ '));
    this.screen.render();
  }

  private logToFile(message: string): void {
    if (!this.logPath) return;

    const now = new Date();
    const elapsed = Math.floor((now.getTime() - this.startTime.getTime()) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timestamp = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    this.logBuffer.push(`[${timestamp}] ${message}`);

    // Flush periodically
    if (this.logBuffer.length >= 20) {
      this.flushLog();
    }
  }

  private async flushLog(): Promise<void> {
    if (!this.logPath || this.logBuffer.length === 0) return;

    // Capture and clear buffer synchronously to prevent race conditions
    const toWrite = this.logBuffer;
    this.logBuffer = [];

    try {
      const logDir = dirname(this.logPath);
      await mkdir(logDir, { recursive: true });
      await appendFile(this.logPath, toWrite.join('\n') + '\n');
    } catch (error) {
      // Silently ignore logging errors
    }
  }

  private quit(): void {
    // Flush any remaining log entries
    if (this.logPath) {
      this.flushLog().then(() => {
        console.log(`Session log saved: ${this.logPath}`);
      }).catch(() => {});
    }

    this.orchestrator.killAll();
    this.screen.destroy();
    process.exit(0);
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
