/**
 * Verification Types
 *
 * Types for objective task verification (tests, build, lint, typecheck).
 */

export type VerificationType =
  | 'tests_pass'
  | 'build_succeeds'
  | 'lint_clean'
  | 'types_check';

export interface VerificationResult {
  type: VerificationType;
  passed: boolean;
  message: string;
  command: string;
  exitCode: number;
  duration: number; // milliseconds
  output?: string; // stdout/stderr for error context
}

export interface VerificationCriteria {
  type: VerificationType;
  command: string;
  required: boolean; // If false, failure is warning only
  timeout?: number; // Default 120000 (2 min)
}

export type ProjectType = 'node' | 'python' | 'go' | 'rust' | 'unknown';

export interface ProjectCommands {
  test?: string[]; // ["npm test", "bun test"]
  build?: string[]; // ["npm run build"]
  lint?: string[]; // ["eslint .", "biome check"]
  typeCheck?: string[]; // ["tsc --noEmit"]
}

export interface VerificationConfig {
  projectType: ProjectType;
  commands: ProjectCommands;
  criteria: VerificationCriteria[];
}
