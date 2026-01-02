/**
 * Task Verification Module
 *
 * Runs objective verification checks after task completion.
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DevTask } from '../types.ts';
import type {
  VerificationResult,
  VerificationCriteria,
  VerificationConfig,
  ProjectCommands,
} from './types.ts';
import {
  detectProjectType,
  detectProjectCommands,
  buildDefaultCriteria,
} from './detector.ts';

/** Config file path relative to project */
const CONFIG_FILE = '.autonoma/verification.json';

/** Config file schema for external configuration */
interface VerificationConfigFile {
  projectType?: 'node' | 'python' | 'go' | 'rust' | 'unknown';
  commands?: ProjectCommands;
  criteria?: Array<{
    type: 'tests_pass' | 'build_succeeds' | 'lint_clean' | 'types_check';
    command: string;
    required?: boolean;
    timeout?: number;
  }>;
}

export * from './types.ts';
export * from './detector.ts';
export * from './pipeline.ts';

/**
 * Run a single verification command
 */
async function runVerification(
  command: string,
  cwd: string,
  timeout: number = 120000
): Promise<VerificationResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const parts = command.split(' ');
    const cmd = parts[0]!;
    const args = parts.slice(1);

    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;

      resolve({
        type: 'tests_pass', // Will be overwritten by caller
        passed,
        message: passed ? 'Passed' : `Failed with exit code ${code}`,
        command,
        exitCode: code ?? 1,
        duration,
        output: passed ? undefined : (stderr || stdout).slice(-2000),
      });
    });

    proc.on('error', (error) => {
      resolve({
        type: 'tests_pass',
        passed: false,
        message: `Error: ${error.message}`,
        command,
        exitCode: 1,
        duration: Date.now() - startTime,
        output: error.message,
      });
    });
  });
}

/**
 * Verify a completed task against configured criteria
 */
export async function verifyTask(
  _task: DevTask,
  cwd: string,
  criteria: VerificationCriteria[]
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const criterion of criteria) {
    const result = await runVerification(
      criterion.command,
      cwd,
      criterion.timeout
    );
    result.type = criterion.type;
    results.push(result);

    // If required check fails, stop early
    if (criterion.required && !result.passed) {
      break;
    }
  }

  return results;
}

/**
 * Load verification config from file if it exists
 */
async function loadConfigFile(
  projectDir: string
): Promise<VerificationConfigFile | null> {
  try {
    const configPath = join(projectDir, CONFIG_FILE);
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as VerificationConfigFile;
  } catch {
    return null;
  }
}

/**
 * Auto-detect project and create verification config
 * Checks for .autonoma/verification.json first, falls back to auto-detection
 */
export async function createVerificationConfig(
  projectDir: string
): Promise<VerificationConfig> {
  // Check for config file first
  const fileConfig = await loadConfigFile(projectDir);

  if (fileConfig) {
    // Use config file settings
    const projectType = fileConfig.projectType ?? await detectProjectType(projectDir);

    // Build commands from file or detect
    let commands: ProjectCommands;
    if (fileConfig.commands) {
      commands = fileConfig.commands;
    } else {
      commands = await detectProjectCommands(projectDir);
    }

    // Build criteria from file or defaults
    let criteria: VerificationCriteria[];
    if (fileConfig.criteria && fileConfig.criteria.length > 0) {
      criteria = fileConfig.criteria.map(c => ({
        type: c.type,
        command: c.command,
        required: c.required ?? true,
        timeout: c.timeout ?? 120000,
      }));
    } else {
      criteria = buildDefaultCriteria(commands);
    }

    return { projectType, commands, criteria };
  }

  // Fall back to auto-detection
  const projectType = await detectProjectType(projectDir);
  const commands = await detectProjectCommands(projectDir);
  const criteria = buildDefaultCriteria(commands);

  return {
    projectType,
    commands,
    criteria,
  };
}

/**
 * Check if all required verifications passed
 */
export function allRequiredPassed(
  results: VerificationResult[],
  criteria: VerificationCriteria[]
): boolean {
  for (const criterion of criteria) {
    if (!criterion.required) continue;

    const result = results.find((r) => r.type === criterion.type);
    if (!result || !result.passed) {
      return false;
    }
  }
  return true;
}

/**
 * Format verification results for logging
 */
export function formatVerificationResults(
  results: VerificationResult[]
): string {
  return results
    .map((r) => {
      const icon = r.passed ? '[OK]' : '[FAIL]';
      const time = `${(r.duration / 1000).toFixed(1)}s`;
      return `${icon} ${r.type}: ${r.message} (${time})`;
    })
    .join('\n');
}

/**
 * Extract file:line references from error output
 * Supports TypeScript, Jest/Vitest, ESLint patterns
 */
function extractFileReferences(output: string): string[] {
  const refs: string[] = [];
  const lines = output.split('\n');

  // Common patterns for file:line references
  const patterns = [
    // TypeScript: src/file.ts(10,5): error TS...
    /([^\s(]+\.tsx?)\((\d+),(\d+)\):\s*(.+)/,
    // TypeScript alt: src/file.ts:10:5 - error TS...
    /([^\s:]+\.tsx?):\s*(\d+):(\d+)\s*-\s*(.+)/,
    // Jest/Vitest stack: at Object.<anonymous> (src/file.ts:10:5)
    /at\s+.+\(([^:]+):(\d+):(\d+)\)/,
    // ESLint: src/file.ts:10:5 warning/error ...
    /([^\s:]+):(\d+):(\d+)\s+(error|warning)\s+(.+)/i,
    // Generic: file.ts:10:5
    /([^\s:]+\.[tj]sx?):(\d+):(\d+)/,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const file = match[1];
        const lineNum = match[2];
        const col = match[3];
        const msg = match[4] || line.trim().slice(0, 80);
        refs.push(`${file}:${lineNum}:${col} - ${msg}`);
        break;
      }
    }
    if (refs.length >= 10) break; // Cap at 10 to avoid noise
  }

  return refs;
}

/**
 * Extract top failures with file:line references from verification results
 * Returns formatted string with top 3 actionable errors
 */
export function extractTopFailures(
  results: VerificationResult[],
  limit: number = 3
): string {
  const failures: string[] = [];

  for (const result of results) {
    if (result.passed || !result.output) continue;

    const refs = extractFileReferences(result.output);
    if (refs.length > 0) {
      failures.push(`[${result.type}]`);
      failures.push(...refs.slice(0, limit));
    } else {
      // No file refs found, extract first meaningful error lines
      const lines = result.output.split('\n')
        .filter(l => l.trim().length > 0)
        .filter(l => /error|fail|exception/i.test(l))
        .slice(0, limit);
      if (lines.length > 0) {
        failures.push(`[${result.type}]`);
        failures.push(...lines);
      }
    }
  }

  return failures.slice(0, limit * 2).join('\n');
}
