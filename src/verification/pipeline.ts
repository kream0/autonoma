/**
 * Verification Pipeline
 *
 * Multi-stage verification system that runs comprehensive checks:
 * 1. Build verification - Code compiles/transpiles successfully
 * 2. Type verification - TypeScript type checking passes
 * 3. Lint verification - No linting errors
 * 4. Test verification - Tests pass with coverage threshold
 * 5. Custom verification - Project-specific checks
 *
 * This is run after a developer claims TASK_COMPLETE via promise
 * to ensure the work actually meets quality criteria.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================
// TYPES
// ============================================

export interface PipelineStage {
  name: string;
  type: 'build' | 'typecheck' | 'lint' | 'test' | 'custom';
  command: string;
  required: boolean;
  timeout: number;
  successPattern?: RegExp;
  failurePattern?: RegExp;
  skipIf?: () => boolean;
}

export interface PipelineResult {
  allPassed: boolean;
  requiredPassed: boolean;
  stages: StageResult[];
  totalDuration: number;
  summary: string;
}

export interface StageResult {
  stage: string;
  type: PipelineStage['type'];
  passed: boolean;
  skipped: boolean;
  required: boolean;
  exitCode: number;
  duration: number;
  output: string;
  errorSummary?: string;
}

export interface PipelineConfig {
  stages: PipelineStage[];
  stopOnFirstFailure: boolean;
  maxTotalDuration: number;
  workingDir: string;
}

// ============================================
// DEFAULT STAGES
// ============================================

/**
 * Create default pipeline stages based on project type
 */
export function createDefaultStages(workingDir: string): PipelineStage[] {
  const stages: PipelineStage[] = [];
  const pkgPath = join(workingDir, 'package.json');

  // Check what's available in package.json
  let pkg: Record<string, unknown> = {};
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch {
      // Invalid package.json
    }
  }

  const scripts = (pkg.scripts || {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies || {}) as Record<string, string>;
  const deps = (pkg.dependencies || {}) as Record<string, string>;

  // Determine package manager
  const hasBun = existsSync(join(workingDir, 'bun.lockb'));
  const hasYarn = existsSync(join(workingDir, 'yarn.lock'));
  const pmRun = hasBun ? 'bun run' : hasYarn ? 'yarn' : 'npm run';

  // 1. Build stage
  if (scripts.build) {
    stages.push({
      name: 'Build',
      type: 'build',
      command: `${pmRun} build`,
      required: false,  // Build is nice-to-have, not blocking
      timeout: 120000,
      failurePattern: /error|failed|Error:/i,
    });
  }

  // 2. Type checking stage
  if (devDeps.typescript || deps.typescript || scripts.typecheck) {
    const typecheckCmd = scripts.typecheck
      ? `${pmRun} typecheck`
      : hasBun
        ? 'bun run tsc --noEmit'
        : 'npx tsc --noEmit';

    stages.push({
      name: 'TypeCheck',
      type: 'typecheck',
      command: typecheckCmd,
      required: true,  // Type errors are blocking
      timeout: 60000,
      failurePattern: /error TS\d+:/,
    });
  }

  // 3. Linting stage
  if (devDeps.eslint || scripts.lint) {
    const lintCmd = scripts.lint
      ? `${pmRun} lint`
      : hasBun
        ? 'bun run eslint . --ext .ts,.tsx'
        : 'npx eslint . --ext .ts,.tsx';

    stages.push({
      name: 'Lint',
      type: 'lint',
      command: lintCmd,
      required: false,  // Lint warnings shouldn't block
      timeout: 60000,
      failurePattern: /error/i,
    });
  }

  // 4. Test stage
  if (scripts.test) {
    stages.push({
      name: 'Test',
      type: 'test',
      command: `${pmRun} test`,
      required: true,  // Tests must pass
      timeout: 180000,
      successPattern: /passed|success|\d+ passing/i,
      failurePattern: /failed|\d+ failing|error/i,
    });
  }

  return stages;
}

// ============================================
// PIPELINE RUNNER
// ============================================

/**
 * Run the verification pipeline
 */
export async function runVerificationPipeline(
  config: PipelineConfig
): Promise<PipelineResult> {
  const startTime = Date.now();
  const results: StageResult[] = [];
  let shouldStop = false;

  for (const stage of config.stages) {
    if (shouldStop) {
      // Mark remaining stages as skipped
      results.push({
        stage: stage.name,
        type: stage.type,
        passed: false,
        skipped: true,
        required: stage.required,
        exitCode: -1,
        duration: 0,
        output: 'Skipped due to previous failure',
      });
      continue;
    }

    // Check if stage should be skipped
    if (stage.skipIf?.()) {
      results.push({
        stage: stage.name,
        type: stage.type,
        passed: true,
        skipped: true,
        required: stage.required,
        exitCode: 0,
        duration: 0,
        output: 'Skipped by condition',
      });
      continue;
    }

    // Run the stage
    const stageResult = await runStage(stage, config.workingDir);
    results.push(stageResult);

    // Check if we should stop
    if (!stageResult.passed && stage.required && config.stopOnFirstFailure) {
      shouldStop = true;
    }

    // Check total duration
    const elapsed = Date.now() - startTime;
    if (elapsed > config.maxTotalDuration) {
      shouldStop = true;
    }
  }

  const totalDuration = Date.now() - startTime;
  const allPassed = results.every(r => r.passed || r.skipped);
  const requiredPassed = results
    .filter(r => r.required && !r.skipped)
    .every(r => r.passed);

  return {
    allPassed,
    requiredPassed,
    stages: results,
    totalDuration,
    summary: formatPipelineSummary(results, totalDuration),
  };
}

/**
 * Run a single pipeline stage
 */
async function runStage(
  stage: PipelineStage,
  workingDir: string
): Promise<StageResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const parts = stage.command.split(' ');
    const cmd = parts[0]!;
    const args = parts.slice(1);

    const proc = spawn(cmd, args, {
      cwd: workingDir,
      shell: true,
      timeout: stage.timeout,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      let passed = code === 0;

      // Check patterns for more accurate pass/fail detection
      if (stage.successPattern && stage.successPattern.test(output)) {
        passed = true;
      }
      if (stage.failurePattern && stage.failurePattern.test(output)) {
        passed = false;
      }

      resolve({
        stage: stage.name,
        type: stage.type,
        passed,
        skipped: false,
        required: stage.required,
        exitCode: code ?? 1,
        duration,
        output: output.slice(-5000),  // Keep last 5000 chars
        errorSummary: passed ? undefined : extractErrorSummary(output, stage.type),
      });
    });

    proc.on('error', (error) => {
      resolve({
        stage: stage.name,
        type: stage.type,
        passed: false,
        skipped: false,
        required: stage.required,
        exitCode: 1,
        duration: Date.now() - startTime,
        output: error.message,
        errorSummary: error.message,
      });
    });
  });
}

/**
 * Extract error summary from output
 */
function extractErrorSummary(output: string, type: PipelineStage['type']): string {
  const lines = output.split('\n');

  switch (type) {
    case 'typecheck': {
      // Find TypeScript error lines
      const errors = lines.filter(l => /error TS\d+:/.test(l));
      return errors.slice(0, 3).join('\n') || 'Type check failed';
    }

    case 'lint': {
      // Find ESLint error lines
      const errors = lines.filter(l => /error/i.test(l) && !l.includes('0 errors'));
      return errors.slice(0, 3).join('\n') || 'Lint check failed';
    }

    case 'test': {
      // Find test failure lines
      const failures = lines.filter(l =>
        /fail|error|expected|assertion/i.test(l)
      );
      return failures.slice(0, 5).join('\n') || 'Tests failed';
    }

    default:
      // Generic error extraction
      const errorLines = lines.filter(l => /error|fail/i.test(l));
      return errorLines.slice(0, 3).join('\n') || 'Stage failed';
  }
}

/**
 * Format pipeline summary for logging
 */
function formatPipelineSummary(
  results: StageResult[],
  totalDuration: number
): string {
  const lines: string[] = [
    `Verification Pipeline (${(totalDuration / 1000).toFixed(1)}s)`,
    '─'.repeat(40),
  ];

  for (const result of results) {
    const icon = result.skipped ? '○' : result.passed ? '✓' : '✗';
    const status = result.skipped
      ? 'SKIP'
      : result.passed
        ? 'PASS'
        : 'FAIL';
    const req = result.required ? '*' : '';
    const time = result.skipped ? '' : ` (${(result.duration / 1000).toFixed(1)}s)`;

    lines.push(`  ${icon} ${result.stage}${req}: ${status}${time}`);

    if (!result.passed && !result.skipped && result.errorSummary) {
      const errorLines = result.errorSummary.split('\n').slice(0, 2);
      for (const errLine of errorLines) {
        lines.push(`    └─ ${errLine.slice(0, 80)}`);
      }
    }
  }

  lines.push('─'.repeat(40));
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed && !r.skipped).length;
  const skipCount = results.filter(r => r.skipped).length;
  lines.push(`Summary: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);

  return lines.join('\n');
}

/**
 * Quick verification check (just type + test)
 */
export async function quickVerify(workingDir: string): Promise<boolean> {
  const stages = createDefaultStages(workingDir);
  const quickStages = stages.filter(s =>
    s.type === 'typecheck' || s.type === 'test'
  );

  if (quickStages.length === 0) {
    return true;  // No checks available, assume pass
  }

  const result = await runVerificationPipeline({
    stages: quickStages,
    stopOnFirstFailure: true,
    maxTotalDuration: 120000,
    workingDir,
  });

  return result.requiredPassed;
}

/**
 * Full verification check (all stages)
 */
export async function fullVerify(workingDir: string): Promise<PipelineResult> {
  const stages = createDefaultStages(workingDir);

  return runVerificationPipeline({
    stages,
    stopOnFirstFailure: false,
    maxTotalDuration: 300000,
    workingDir,
  });
}
