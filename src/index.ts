#!/usr/bin/env bun
/**
 * Autonoma - Claude Code Orchestrator
 *
 * A CLI tool to orchestrate multiple Claude Code instances with a split-tile TUI.
 * Supports --stdout mode for token-economic plain-text monitoring.
 */

import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import blessed from 'blessed';
import { Orchestrator } from './orchestrator.ts';
import { Screen } from './tui/screen.ts';
import { TileManager } from './tui/tiles.ts';
import { TasksView } from './tui/views/tasks.ts';
import { StatsView } from './tui/views/stats.ts';
import { DashboardView } from './tui/views/dashboard.ts';
import { NotificationsView } from './tui/views/notifications.ts';
import { IndefiniteLoopController } from './indefinite.ts';
import { HumanQueue } from './human-queue/index.ts';
import type { ViewMode } from './types.ts';

/** Check if stdout mode is enabled */
const STDOUT_MODE = process.argv.includes('--stdout');

/** Exit codes for CI/CD integration */
const EXIT_SUCCESS = 0;
const EXIT_FAILED = 1;
const EXIT_TIMEOUT = 2;
const EXIT_BLOCKED = 3;

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
  autonoma status <project-dir>                  Show current status
  autonoma guide <project-dir> "message"         Send guidance to CEO
  autonoma queue <project-dir> [--pending]       Show human queue messages
  autonoma respond <project-dir> <id> "msg"      Respond to queued message
  autonoma pause <project-dir>                   Pause running orchestration
  autonoma logs <project-dir> [--tail N]         Show recent log entries
  autonoma doctor                                Check system health
  autonoma demo                                  Run demo mode
  autonoma --help                                Show this help

Options:
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
  n        Notifications (human queue messages)
  p        Pause (indefinite mode) - provide guidance
  q        Quit

Exit Codes (for CI/CD):
  0 = Success (project complete)
  1 = Failed (orchestration error)
  2 = Timeout (context limit or time limit reached)
  3 = Blocked (human intervention required)

Notes:
  - State is saved to <project>/.autonoma/state.json
  - Logs are saved to <project>/.autonoma/logs/
  - If CLAUDE.md exists in project folder, it will be used as context
  - Use tmux/screen for long-running tasks
`);
}

/**
 * Show status from status.json (Claude Code Control API)
 */
async function showStatus(projectDir: string): Promise<void> {
  const statusPath = join(projectDir, '.autonoma', 'status.json');
  try {
    const content = await readFile(statusPath, 'utf-8');
    const status = JSON.parse(content);
    console.log('=== AUTONOMA STATUS ===');
    console.log(`Phase: ${status.phase}`);
    console.log(`Iteration: ${status.iteration}`);
    console.log(`Progress: ${status.progress.completed}/${status.progress.total} tasks`);
    console.log('');
    console.log('Agents:');
    for (const [name, state] of Object.entries(status.agents)) {
      const icon = state === 'running' ? '[*]' : state === 'complete' ? '[+]' : '[ ]';
      console.log(`  ${icon} ${name}: ${state}`);
    }
    console.log('');
    console.log(`Updated: ${status.lastUpdate}`);
    console.log('========================');
  } catch {
    console.error('No status available. Is Autonoma running?');
    console.error(`Expected: ${statusPath}`);
    process.exit(1);
  }
}

/**
 * Send guidance to running instance (Claude Code Control API)
 */
async function sendGuidance(projectDir: string, message: string): Promise<void> {
  const guidancePath = join(projectDir, '.autonoma', 'guidance.txt');
  const autonomaDir = join(projectDir, '.autonoma');
  try {
    await mkdir(autonomaDir, { recursive: true });
    await writeFile(guidancePath, message, 'utf-8');
    console.log(`Guidance sent to: ${projectDir}`);
    console.log(`Message: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`);
    console.log('');
    console.log('Autonoma will process this within 5 seconds.');
  } catch (error) {
    console.error(`Error writing guidance: ${error}`);
    process.exit(1);
  }
}

/**
 * Respond to a queued human message
 */
async function respondToMessage(projectDir: string, messageId: string, response: string): Promise<void> {
  const { Database } = await import('bun:sqlite');
  const { HumanQueue } = await import('./human-queue/index.ts');

  const dbPath = join(projectDir, '.autonoma', 'autonoma.db');
  try {
    const db = new Database(dbPath);
    const queue = new HumanQueue(db);

    const success = queue.respond(messageId, response);
    if (success) {
      console.log(`Response sent to message ${messageId}`);
      console.log(`Response: ${response.slice(0, 100)}${response.length > 100 ? '...' : ''}`);
    } else {
      console.error(`Message ${messageId} not found or already responded`);
      process.exit(1);
    }

    db.close();
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

/**
 * Show human queue messages
 */
async function showQueue(projectDir: string, _pendingOnly: boolean): Promise<void> {
  const { Database } = await import('bun:sqlite');
  const { HumanQueue } = await import('./human-queue/index.ts');

  const dbPath = join(projectDir, '.autonoma', 'autonoma.db');
  try {
    const db = new Database(dbPath);
    const queue = new HumanQueue(db);

    const messages = queue.getPending();

    if (messages.length === 0) {
      console.log('No pending messages in queue.');
      db.close();
      return;
    }

    console.log('=== HUMAN QUEUE ===');
    console.log(`${messages.length} pending message(s)\n`);

    for (const m of messages) {
      const icon = m.type === 'blocker' ? '[!] BLOCKER' :
                   m.type === 'question' ? '[?] QUESTION' :
                   '[A] APPROVAL';
      const block = m.blocking ? ' (BLOCKING)' : '';
      console.log(`${icon}${block}`);
      console.log(`  ID: ${m.id}`);
      console.log(`  Priority: ${m.priority}`);
      console.log(`  Task: ${m.taskId || 'N/A'}`);
      console.log(`  Content: ${m.content}`);
      console.log(`  Created: ${m.createdAt}`);
      console.log('');
    }

    console.log('Use: autonoma respond <project-dir> <id> "response"');

    db.close();
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

/**
 * Pause a running orchestration
 */
async function pauseOrchestration(projectDir: string): Promise<void> {
  const pausePath = join(projectDir, '.autonoma', 'pause.txt');
  const autonomaDir = join(projectDir, '.autonoma');
  try {
    await mkdir(autonomaDir, { recursive: true });
    await writeFile(pausePath, new Date().toISOString(), 'utf-8');
    console.log('Pause signal sent.');
    console.log('Autonoma will pause after the current task completes.');
    console.log('');
    console.log('To resume, delete the pause file:');
    console.log(`  rm ${pausePath}`);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

/**
 * Show recent log entries
 */
async function showLogs(projectDir: string, tailLines: number): Promise<void> {
  const logDir = join(projectDir, '.autonoma', 'logs');
  const { readdir, stat } = await import('node:fs/promises');

  try {
    const files = await readdir(logDir);
    if (files.length === 0) {
      console.log('No log files found.');
      return;
    }

    // Get file stats and sort by modification time (newest first)
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const path = join(logDir, file);
        const s = await stat(path);
        return { file, path, mtime: s.mtime };
      })
    );
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    console.log('=== AUTONOMA LOGS ===');
    console.log(`Log directory: ${logDir}`);
    console.log(`Found ${files.length} log file(s)\n`);

    // Show list of log files
    console.log('Recent log files:');
    for (const { file, mtime } of fileStats.slice(0, 10)) {
      console.log(`  ${file}  (${mtime.toLocaleString()})`);
    }
    console.log('');

    // Show tail of most recent log
    const latestLog = fileStats[0];
    if (latestLog) {
      console.log(`=== Latest: ${latestLog.file} ===`);
      const content = await readFile(latestLog.path, 'utf-8');
      const lines = content.split('\n');
      const tail = lines.slice(-tailLines).join('\n');
      console.log(tail);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('No logs directory found. Run autonoma with --log or --stdout to generate logs.');
    } else {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  }
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

  if (command === 'status') {
    const projectDir = args[1];
    if (!projectDir) {
      console.error('Error: Please provide a project directory');
      console.error('Usage: autonoma status <project-dir>');
      process.exit(1);
    }
    await showStatus(resolve(projectDir));
    return;
  }

  if (command === 'guide') {
    const projectDir = args[1];
    const message = args[2];
    if (!projectDir || !message) {
      console.error('Error: Please provide project directory and message');
      console.error('Usage: autonoma guide <project-dir> "message"');
      process.exit(1);
    }
    await sendGuidance(resolve(projectDir), message);
    return;
  }

  if (command === 'respond') {
    const projectDir = args[1];
    const messageId = args[2];
    const response = args[3];
    if (!projectDir || !messageId || !response) {
      console.error('Error: Please provide project directory, message ID, and response');
      console.error('Usage: autonoma respond <project-dir> <message-id> "response"');
      process.exit(1);
    }
    await respondToMessage(resolve(projectDir), messageId, response);
    return;
  }

  if (command === 'queue') {
    const projectDir = args[1];
    if (!projectDir) {
      console.error('Error: Please provide a project directory');
      console.error('Usage: autonoma queue <project-dir> [--pending]');
      process.exit(1);
    }
    const pendingOnly = args.includes('--pending');
    await showQueue(resolve(projectDir), pendingOnly);
    return;
  }

  if (command === 'pause') {
    const projectDir = args[1];
    if (!projectDir) {
      console.error('Error: Please provide a project directory');
      console.error('Usage: autonoma pause <project-dir>');
      process.exit(1);
    }
    await pauseOrchestration(resolve(projectDir));
    return;
  }

  if (command === 'logs') {
    const projectDir = args[1];
    if (!projectDir) {
      console.error('Error: Please provide a project directory');
      console.error('Usage: autonoma logs <project-dir> [--tail N]');
      process.exit(1);
    }
    const tailIdx = args.indexOf('--tail');
    const tailArg = tailIdx !== -1 ? args[tailIdx + 1] : undefined;
    const tailLines = tailArg ? parseInt(tailArg, 10) : 50;
    await showLogs(resolve(projectDir), tailLines);
    return;
  }

  if (command === 'doctor') {
    await runDoctor();
    return;
  }

  console.error(`Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}

/**
 * Run system health checks
 */
async function runDoctor(): Promise<void> {
  console.log('=== AUTONOMA DOCTOR ===\n');
  console.log('Checking system health...\n');

  let allPassed = true;

  // Check 1: Bun version
  process.stdout.write('Bun runtime............. ');
  try {
    const bunVersion = Bun.version;
    console.log(`✓ v${bunVersion}`);
  } catch {
    console.log('✗ Not running in Bun');
    allPassed = false;
  }

  // Check 2: Claude CLI
  process.stdout.write('Claude CLI.............. ');
  try {
    const proc = Bun.spawn(['claude', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      console.log(`✓ ${output.trim().split('\n')[0]}`);
    } else {
      console.log('✗ Not available');
      allPassed = false;
    }
  } catch {
    console.log('✗ Not found in PATH');
    allPassed = false;
  }

  // Check 3: Node.js (for some dependencies)
  process.stdout.write('Node.js (optional)...... ');
  try {
    const proc = Bun.spawn(['node', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      console.log(`✓ ${output.trim()}`);
    } else {
      console.log('- Skipped');
    }
  } catch {
    console.log('- Not installed (optional)');
  }

  // Check 4: Git
  process.stdout.write('Git..................... ');
  try {
    const proc = Bun.spawn(['git', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      const version = output.trim().replace('git version ', '');
      console.log(`✓ ${version}`);
    } else {
      console.log('✗ Not available');
      allPassed = false;
    }
  } catch {
    console.log('✗ Not found in PATH');
    allPassed = false;
  }

  // Check 5: Disk space (current directory)
  process.stdout.write('Disk space.............. ');
  try {
    const proc = Bun.spawn(['df', '-h', '.'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1]!.split(/\s+/);
        const available = parts[3] || 'unknown';
        const usedPercent = parts[4] || '0%';
        const percentNum = parseInt(usedPercent, 10);
        if (percentNum > 90) {
          console.log(`⚠ ${available} available (${usedPercent} used) - LOW`);
        } else {
          console.log(`✓ ${available} available (${usedPercent} used)`);
        }
      } else {
        console.log('✓ OK');
      }
    } else {
      console.log('- Skipped');
    }
  } catch {
    console.log('- Could not check');
  }

  // Check 6: SQLite (for database)
  process.stdout.write('SQLite (bun:sqlite)..... ');
  try {
    const { Database } = await import('bun:sqlite');
    const db = new Database(':memory:');
    db.exec('SELECT 1');
    db.close();
    console.log('✓ Working');
  } catch {
    console.log('✗ Not available');
    allPassed = false;
  }

  // Check 7: Memorai availability (optional)
  process.stdout.write('Memorai database........ ');
  try {
    const { MemoraiClient } = await import('memorai');
    const client = new MemoraiClient();
    if (client.isInitialized()) {
      console.log('✓ Initialized');
    } else {
      console.log('- Not initialized (run: memorai init)');
    }
  } catch {
    console.log('- Not available (optional)');
  }

  // Summary
  console.log('\n========================');
  if (allPassed) {
    console.log('✓ All required checks passed');
    console.log('Autonoma is ready to run!');
  } else {
    console.log('✗ Some checks failed');
    console.log('Please install missing dependencies.');
    process.exit(1);
  }
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

  // For resume mode, load state first
  if (mode === 'resume') {
    await app.orchestrator.loadPersistedState();
  }

  // Note: --max-developers flag removed - developers are now spawned dynamically per batch

  // Initialize agents (CEO, Staff Engineer, QA only - developers spawned per batch)
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

    // Flush final status and kill all agent processes before exiting
    await app.orchestrator.flushStatus();
    app.orchestrator.killAll();

    // Exit with appropriate code for CI/CD
    const exitCode = getExitCode(app.orchestrator.currentPhase);
    process.exit(exitCode);
  } catch (error) {
    console.error(`[ERROR] ${error}`);
    await app.orchestrator.flushStatus();
    app.orchestrator.killAll();
    app.printSummary();
    process.exit(EXIT_FAILED);
  }
}

/**
 * Determine exit code based on final orchestration phase
 */
function getExitCode(phase: string): number {
  switch (phase) {
    case 'complete':
      return EXIT_SUCCESS;
    case 'failed':
      return EXIT_FAILED;
    case 'timeout':
      return EXIT_TIMEOUT;
    case 'blocked':
      return EXIT_BLOCKED;
    default:
      // Any other state (idle, running, etc.) is considered incomplete
      return EXIT_FAILED;
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

  // For resume mode, load state first
  if (mode === 'resume') {
    await app.orchestrator.loadPersistedState();
  }

  // Note: --max-developers flag removed - developers are now spawned dynamically per batch

  // Initialize agents FIRST so tiles can be created (CEO, Staff Engineer, QA only)
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

/** Phase descriptions for status bar display */
const PHASE_DESCRIPTIONS: Record<string, string> = {
  idle: 'Waiting',
  planning: 'CEO planning',
  'task-breakdown': 'Breaking down tasks',
  development: 'Developing',
  testing: 'Testing',
  review: 'QA review',
  'ceo-approval': 'CEO approval',
  complete: 'Complete',
  failed: 'Failed',
};

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
  public notificationsView: NotificationsView;
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
  private humanQueue?: HumanQueue;
  private notificationPollInterval?: ReturnType<typeof setInterval>;
  private currentIteration: number = 0;

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
      onNotifications: () => this.toggleNotifications(),
    });

    // Create tile manager
    this.tileManager = new TileManager(this.screen.screen);

    // Create views
    this.tasksView = new TasksView(this.screen.screen);
    this.statsView = new StatsView(this.screen.screen);
    this.dashboardView = new DashboardView(this.screen.screen);
    this.notificationsView = new NotificationsView(this.screen.screen, (id, response) => {
      // Handle response to human queue message
      this.humanQueue?.respond(id, response);
    });
    this.statsView.setStartTime(this.startTime);

    // Initialize human queue for notifications (database created by orchestrator)
    this.initHumanQueue(workingDir);

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
      onAgentsChanged: () => {
        // Refresh tiles when developers are spawned/cleaned up
        this.tileManager.createTiles(this.orchestrator.getAgents());
        this.updateStatusBar();
        this.screen.render();
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
            this.currentIteration = iteration;
            this.updateStatusBar();
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
          this.orchestrator.getTasks(),
          this.getContextUsageMap()
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
        this.orchestrator.getTasks(),
        this.getContextUsageMap()
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

    const phase = this.orchestrator.currentPhase;
    const phaseDesc = PHASE_DESCRIPTIONS[phase] || phase;
    const viewIndicator = this.currentView.toUpperCase();

    // Build status parts
    const parts = [
      ` {bold}AUTONOMA{/bold}`,
    ];

    // Add indefinite mode indicator with iteration count
    if (this.indefiniteMode) {
      if (this.isPaused) {
        parts.push(`{yellow-fg}[PAUSED]{/yellow-fg}`);
      } else {
        const iterLabel = this.currentIteration > 0 ? ` #${this.currentIteration}` : '';
        parts.push(`{green-fg}[INDEFINITE${iterLabel}]{/green-fg}`);
      }
    }

    parts.push(`{cyan-fg}${phaseDesc}{/cyan-fg}`);
    parts.push(`View: ${viewIndicator}`);
    parts.push(`Agents: ${running} running, ${complete}/${total} complete`);

    // Show notification count if any pending
    const notificationCount = this.notificationsView.getMessageCount();
    if (notificationCount > 0) {
      parts.push(`{yellow-fg}[${notificationCount} msg]{/yellow-fg}`);
    }

    parts.push(`${minutes}m ${seconds}s`);

    // Shortcuts - include pause if in indefinite mode, always show n for notifications
    const shortcuts = this.indefiniteMode
      ? `{gray-fg}q:quit t:tasks s:stats d:dash p:pause n:msgs{/gray-fg}`
      : `{gray-fg}q:quit t:tasks s:stats d:dash n:msgs{/gray-fg}`;
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

  private async initHumanQueue(workingDir: string): Promise<void> {
    try {
      const { Database } = await import('bun:sqlite');
      const dbPath = join(workingDir, '.autonoma', 'autonoma.db');
      // Ensure directory exists
      await mkdir(join(workingDir, '.autonoma'), { recursive: true });
      const db = new Database(dbPath);
      this.humanQueue = new HumanQueue(db);

      // Poll for notifications every 5 seconds
      this.notificationPollInterval = setInterval(() => {
        if (this.humanQueue) {
          const messages = this.humanQueue.getPending();
          this.notificationsView.update(messages);
          // Update status bar to show notification count
          this.updateStatusBar();
        }
      }, 5000);
    } catch {
      // Human queue not available - silently continue
    }
  }

  private getContextUsageMap(): Map<string, number> {
    const agents = this.orchestrator.getAgents();
    const contextMap = new Map<string, number>();
    for (const agent of agents) {
      const percent = this.orchestrator.getContextPercentage(agent.config.id);
      contextMap.set(agent.config.id, percent);
    }
    return contextMap;
  }

  private toggleNotifications(): void {
    if (this.notificationsView.visible) {
      this.notificationsView.hide();
      this.setView('tiles');
    } else {
      // Update with latest messages before showing
      if (this.humanQueue) {
        const messages = this.humanQueue.getPending();
        this.notificationsView.update(messages);
      }
      this.hideCurrentView();
      this.notificationsView.show();
    }
    this.screen.render();
  }

  private quit(): void {
    // Clean up polling interval
    if (this.notificationPollInterval) {
      clearInterval(this.notificationPollInterval);
    }

    // Flush any remaining log entries
    if (this.logPath) {
      this.flushLog().then(() => {
        console.log(`Session log saved: ${this.logPath}`);
      }).catch((e) => {
        console.error('[LOG] Failed to flush log on quit:', e?.message || e);
      });
    }

    this.orchestrator.killAll();
    this.screen.destroy();

    // Exit with appropriate code based on final phase
    const exitCode = getExitCode(this.orchestrator.currentPhase);
    process.exit(exitCode);
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
