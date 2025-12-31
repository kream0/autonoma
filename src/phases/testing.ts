/**
 * Testing Phase
 *
 * QA agent runs automated tests and reports results.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PhaseContext, TestResult } from './types.ts';
import { parseTestOutput } from './parsers.ts';

/**
 * Detect the test command from package.json
 */
async function detectTestCommand(workingDir: string): Promise<string> {
  try {
    const pkgPath = join(workingDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);

    if (pkg.scripts?.test) {
      return 'npm test';
    }
    if (pkg.scripts?.['test:unit']) {
      return 'npm run test:unit';
    }
  } catch {
    // No package.json or parse error
  }

  return 'npm test';  // Default fallback
}

/**
 * Run testing phase - execute automated tests
 */
export async function runTestingPhase(ctx: PhaseContext): Promise<TestResult> {
  const qaAgent = ctx.findAgentByRole('qa');
  if (!qaAgent) throw new Error('QA agent not found');

  const testCommand = await detectTestCommand(ctx.workingDir);

  const testTask = ctx.createTask('Run automated tests', qaAgent.state.config.id);
  ctx.updateTaskStatus(testTask.id, 'running');

  ctx.emitOutput(qaAgent.state.config.id, `[TESTING] Running: ${testCommand}`);

  const contextSection = ctx.buildContextSection();
  const testPrompt = `${contextSection}<task>Run the automated test suite in the TARGET PROJECT and report results.</task>

<instructions>
<step>Navigate to the project directory: cd ${ctx.workingDir}</step>
<step>Execute tests: ${testCommand}</step>
<step>Analyze the output carefully</step>
<step>Report all test failures with details</step>
</instructions>

<warning>Run tests ONLY in ${ctx.workingDir}. Do NOT run tests in parent directories or other projects.</warning>

<output_format>
Your output MUST end with a JSON block:
\`\`\`json
{
  "testsPassed": <number>,
  "testsFailed": <number>,
  "testsSkipped": <number>,
  "overallStatus": "PASS" | "FAIL",
  "failures": [
    {"test": "test name", "error": "error message"}
  ],
  "summary": "Brief summary of test results"
}
\`\`\`
</output_format>

<completion_signal>Signal completion with [TESTING_COMPLETE] after the JSON.</completion_signal>`;

  const output = await ctx.startAgent(qaAgent.state.config.id, testPrompt);
  await ctx.saveAgentLog('testing', output);

  // Parse test results
  const results = parseTestOutput(output);
  const passed = results?.overallStatus === 'PASS';

  ctx.updateTaskStatus(testTask.id, passed ? 'complete' : 'failed');

  // Store output for CEO
  if (ctx.persistedState) {
    ctx.persistedState.lastTestOutput = output;
  }

  ctx.emitOutput(qaAgent.state.config.id,
    `[TESTING] ${passed ? 'PASSED' : 'FAILED'}${results?.summary ? ` - ${results.summary}` : ''}`);

  await ctx.completePhase('testing');
  return { passed, output };
}
