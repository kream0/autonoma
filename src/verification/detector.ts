/**
 * Project Type and Command Detector
 *
 * Auto-detects project type and available verification commands.
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ProjectType,
  ProjectCommands,
  VerificationCriteria,
} from './types.ts';

const FILE_INDICATORS: Record<ProjectType, string[]> = {
  node: ['package.json', 'package-lock.json', 'bun.lockb', 'yarn.lock'],
  python: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
  go: ['go.mod', 'go.sum'],
  rust: ['Cargo.toml', 'Cargo.lock'],
  unknown: [],
};

/**
 * Detect project type based on indicator files
 */
export async function detectProjectType(
  projectDir: string
): Promise<ProjectType> {
  for (const [type, files] of Object.entries(FILE_INDICATORS)) {
    if (type === 'unknown') continue;
    for (const file of files) {
      try {
        await access(join(projectDir, file));
        return type as ProjectType;
      } catch {
        // File doesn't exist, continue
      }
    }
  }
  return 'unknown';
}

/**
 * Detect available commands for the project
 */
export async function detectProjectCommands(
  projectDir: string
): Promise<ProjectCommands> {
  const projectType = await detectProjectType(projectDir);
  const commands: ProjectCommands = {};

  switch (projectType) {
    case 'node':
      return await detectNodeCommands(projectDir);
    case 'python':
      commands.test = ['pytest', 'python -m pytest'];
      commands.lint = ['flake8', 'pylint'];
      commands.typeCheck = ['mypy .'];
      break;
    case 'go':
      commands.test = ['go test ./...'];
      commands.build = ['go build ./...'];
      commands.lint = ['golangci-lint run'];
      break;
    case 'rust':
      commands.test = ['cargo test'];
      commands.build = ['cargo build'];
      commands.lint = ['cargo clippy'];
      break;
  }

  return commands;
}

/**
 * Detect Node.js project commands from package.json
 */
async function detectNodeCommands(projectDir: string): Promise<ProjectCommands> {
  const commands: ProjectCommands = {};

  try {
    const pkgPath = join(projectDir, 'package.json');
    const content = await Bun.file(pkgPath).text();
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};

    // Test commands
    if (scripts.test) commands.test = ['npm test'];
    if (scripts['test:unit'])
      commands.test = [...(commands.test || []), 'npm run test:unit'];

    // Build commands
    if (scripts.build) commands.build = ['npm run build'];
    if (scripts['build:prod'])
      commands.build = [...(commands.build || []), 'npm run build:prod'];

    // Lint commands
    if (scripts.lint) commands.lint = ['npm run lint'];

    // Type check commands
    if (scripts.typecheck) commands.typeCheck = ['npm run typecheck'];
    else commands.typeCheck = ['npx tsc --noEmit'];

    // Detect bun - prefer bun commands (check both .lockb and .lock)
    const hasBunLock = await Promise.any([
      access(join(projectDir, 'bun.lockb')),
      access(join(projectDir, 'bun.lock')),
    ])
      .then(() => true)
      .catch(() => false);

    if (hasBunLock) {
      commands.test = commands.test?.map((c) => c.replace('npm', 'bun'));
      commands.build = commands.build?.map((c) =>
        c.replace('npm run', 'bun run')
      );
      commands.lint = commands.lint?.map((c) =>
        c.replace('npm run', 'bun run')
      );
      commands.typeCheck = commands.typeCheck?.map((c) =>
        c.replace('npm run', 'bun run').replace('npx', 'bunx')
      );
    }
  } catch {
    // Fallback
    commands.test = ['npm test'];
    commands.build = ['npm run build'];
  }

  return commands;
}

/**
 * Build default verification criteria from detected commands
 */
export function buildDefaultCriteria(
  commands: ProjectCommands
): VerificationCriteria[] {
  const criteria: VerificationCriteria[] = [];

  // Type check is required for TS projects (run first - fast)
  if (commands.typeCheck?.length) {
    criteria.push({
      type: 'types_check',
      command: commands.typeCheck[0]!,
      required: true,
      timeout: 60000,
    });
  }

  // Build is required if exists
  if (commands.build?.length) {
    criteria.push({
      type: 'build_succeeds',
      command: commands.build[0]!,
      required: true,
      timeout: 180000, // 3 min
    });
  }

  // Tests are required
  if (commands.test?.length) {
    criteria.push({
      type: 'tests_pass',
      command: commands.test[0]!,
      required: true,
      timeout: 300000, // 5 min for tests
    });
  }

  // Lint is warning only
  if (commands.lint?.length) {
    criteria.push({
      type: 'lint_clean',
      command: commands.lint[0]!,
      required: false,
      timeout: 60000,
    });
  }

  return criteria;
}
