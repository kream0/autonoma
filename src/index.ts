#!/usr/bin/env bun
/**
 * Autonoma - Claude Code Orchestrator
 *
 * A CLI tool to orchestrate multiple Claude Code instances with a split-tile TUI.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import blessed from 'blessed';
import { Orchestrator } from './orchestrator.ts';
import { Screen } from './tui/screen.ts';
import { TileManager } from './tui/tiles.ts';
import { TasksView } from './tui/views/tasks.ts';
import { StatsView } from './tui/views/stats.ts';
import { DashboardView } from './tui/views/dashboard.ts';
import type { ViewMode } from './types.ts';

// CLI parsing
const args = process.argv.slice(2);

function showHelp(): void {
  console.log(`
Autonoma - Claude Code Orchestrator

Usage:
  autonoma start <requirements.md>    Start new orchestration with requirements file
  autonoma resume <project-dir>       Resume from saved state in project directory
  autonoma adopt <requirements.md> [--context file1,file2,...]
                                      Adopt existing project and plan remaining work
  autonoma demo                       Run demo mode with mock agents
  autonoma --help                     Show this help

Commands:
  start   - Begin fresh orchestration. Creates .autonoma/state.json for resume.
  resume  - Continue from last checkpoint. Skips completed phases.
  adopt   - Analyze existing project, create plan for remaining work, then resume.
            Use --context to provide files with codebase info (folder structure,
            architecture docs, etc.) to save tokens on large codebases.

Keyboard Shortcuts (in TUI):
  ↑↓←→     Navigate between tiles
  Enter    Focus (maximize) selected tile
  Escape   Return to split view / Close overlay
  t        Task list view
  s        Stats view
  d        Dashboard view
  q        Quit

Notes:
  - State is saved to <project>/.autonoma/state.json after each phase
  - Logs are saved to <project>/.autonoma/logs/
  - If CLAUDE.md exists in project folder, it will be used as context
  - Use tmux/screen for long-running tasks to survive terminal closes
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

  if (mode === 'resume') {
    // For resume, the argument is the project directory
    workingDir = fullPath;

    // Check if state exists
    const app = new App(workingDir);
    const hasState = await app.orchestrator.hasPersistedState();

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

  const app = new App(workingDir);

  // For resume mode, load state first to get maxDevelopers
  if (mode === 'resume') {
    await app.orchestrator.loadPersistedState();
  }

  // Initialize agents FIRST so tiles can be created
  app.orchestrator.initializeHierarchy();

  // Create tiles now that agents exist
  app.tileManager.createTiles(app.orchestrator.getAgents());

  // Start rendering
  app.screen.render();

  // Start the appropriate orchestration mode
  const orchestrationPromise = (async () => {
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
 * Main Application class that wires everything together
 */
class App {
  public screen: Screen;
  public tileManager: TileManager;
  public orchestrator: Orchestrator;
  public tasksView: TasksView;
  public statsView: StatsView;
  public dashboardView: DashboardView;

  private currentView: ViewMode = 'tiles';
  private statusBar: blessed.Widgets.BoxElement;
  private startTime: Date;

  constructor(workingDir: string) {
    this.startTime = new Date();

    // Create screen
    this.screen = new Screen({
      onQuit: () => this.quit(),
      onViewChange: (mode) => this.setView(mode),
      onNavigate: (dir) => this.tileManager.navigate(dir),
      onFocus: () => this.tileManager.focus(),
      onUnfocus: () => this.tileManager.unfocus(),
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
      },
      onAgentStatusChange: (agentId, status) => {
        this.tileManager.updateStatus(agentId, status);
        this.updateStatusBar();
        this.updateViews();
      },
      onTaskUpdate: () => {
        this.updateViews();
        this.updateStatusBar();
      },
      onPhaseChange: (_phase) => {
        this.updateStatusBar();
        // Could also show phase in a dedicated area
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

    this.statusBar.setContent(
      ` {bold}AUTONOMA{/bold} │ ` +
      `Phase: ${phase} │ ` +
      `View: ${viewIndicator} │ ` +
      `Agents: ${running} running, ${complete}/${total} complete │ ` +
      `${minutes}m ${seconds}s │ ` +
      `{gray-fg}q:quit t:tasks s:stats d:dashboard{/gray-fg}`
    );
    this.screen.render();
  }

  private quit(): void {
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
