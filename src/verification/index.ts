/**
 * Task Verification Module
 *
 * Runs objective verification checks after task completion.
 */

import { spawn } from 'node:child_process';
import type { DevTask } from '../types.ts';
import type {
  VerificationResult,
  VerificationCriteria,
  VerificationConfig,
} from './types.ts';
import {
  detectProjectType,
  detectProjectCommands,
  buildDefaultCriteria,
} from './detector.ts';

export * from './types.ts';
export * from './detector.ts';

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
 * Auto-detect project and create verification config
 */
export async function createVerificationConfig(
  projectDir: string
): Promise<VerificationConfig> {
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
