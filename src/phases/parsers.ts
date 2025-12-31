/**
 * Output Parsers
 *
 * Parse JSON output from agent responses.
 */

export interface ParsedPlan {
  milestones: Array<{ id: number; title: string; description: string }>;
}

export interface ParsedBatches {
  recommendedDevelopers?: number;
  reasoning?: string;
  batches: Array<{
    batchId: number;
    parallel: boolean;
    description?: string;
    maxParallelTasks?: number;
    tasks: Array<{
      id: number;
      title: string;
      description: string;
      files?: string[];
      complexity?: 'simple' | 'moderate' | 'complex' | 'very_complex';
      context?: string;
    }>;
  }>;
}

export interface ParsedTasks {
  tasks: Array<{ id: number; title: string; description: string; files?: string[] }>;
}

export interface ParsedQAResult {
  overallStatus: 'PASS' | 'FAIL';
  failedTasks: Array<{ taskId: number; reason: string }>;
  comments?: string;
}

export interface ParsedTestResult {
  overallStatus: 'PASS' | 'FAIL';
  testsPassed: number;
  testsFailed: number;
  testsSkipped?: number;
  failures: Array<{ test: string; error: string }>;
  summary?: string;
}

export interface ParsedCeoDecision {
  decision: 'APPROVE' | 'REJECT';
  confidence?: 'high' | 'medium' | 'low';
  summary?: string;
  requiredChanges?: Array<{ description: string; priority: string }>;
}

/**
 * Parse JSON from agent output
 */
export function parseJsonFromOutput(output: string[]): unknown | null {
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
 * Parse QA output for review results
 */
export function parseQAOutput(output: string[]): ParsedQAResult | null {
  const fullOutput = output.join('\n');

  // Try to find JSON block in markdown code fence
  const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.overallStatus && Array.isArray(parsed.failedTasks)) {
        return {
          overallStatus: parsed.overallStatus,
          failedTasks: parsed.failedTasks,
          comments: parsed.comments,
        };
      }
    } catch {
      // Continue to try other methods
    }
  }

  // Try to find raw JSON with overallStatus
  const objectMatch = fullOutput.match(/\{[\s\S]*"overallStatus"[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (parsed.overallStatus && Array.isArray(parsed.failedTasks)) {
        return {
          overallStatus: parsed.overallStatus,
          failedTasks: parsed.failedTasks,
          comments: parsed.comments,
        };
      }
    } catch {
      // Failed to parse
    }
  }

  // Fallback: check for simple PASS/FAIL keywords
  if (fullOutput.includes('[REVIEW_COMPLETE]')) {
    if (fullOutput.includes('PASS') && !fullOutput.includes('FAIL')) {
      return { overallStatus: 'PASS', failedTasks: [] };
    }
    if (fullOutput.includes('FAIL')) {
      return { overallStatus: 'FAIL', failedTasks: [], comments: 'QA indicated failure but no structured output' };
    }
  }

  return null;
}

/**
 * Parse test output for results
 */
export function parseTestOutput(output: string[]): ParsedTestResult | null {
  const fullOutput = output.join('\n');

  // Try to find JSON block in markdown code fence
  const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.overallStatus) {
        return {
          overallStatus: parsed.overallStatus,
          testsPassed: parsed.testsPassed || 0,
          testsFailed: parsed.testsFailed || 0,
          testsSkipped: parsed.testsSkipped,
          failures: parsed.failures || [],
          summary: parsed.summary,
        };
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: check for completion signal
  if (fullOutput.includes('[TESTING_COMPLETE]')) {
    // Try to infer from keywords
    const hasFail = fullOutput.includes('FAIL') || fullOutput.includes('failed');
    return {
      overallStatus: hasFail ? 'FAIL' : 'PASS',
      testsPassed: 0,
      testsFailed: hasFail ? 1 : 0,
      failures: [],
    };
  }

  return null;
}

/**
 * Parse CEO decision output
 */
export function parseCeoDecision(output: string[]): ParsedCeoDecision | null {
  const fullOutput = output.join('\n');

  // Try to find JSON block in markdown code fence
  const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.decision) {
        return {
          decision: parsed.decision,
          confidence: parsed.confidence,
          summary: parsed.summary,
          requiredChanges: parsed.requiredChanges,
        };
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: check for completion signal and keywords
  if (fullOutput.includes('[CEO_DECISION]')) {
    if (fullOutput.includes('APPROVE')) {
      return { decision: 'APPROVE' };
    }
    if (fullOutput.includes('REJECT')) {
      return { decision: 'REJECT' };
    }
  }

  return null;
}
