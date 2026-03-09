import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, '..', 'dist', 'cli.js');

function run(args: string[], input?: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [cli, ...args], {
      encoding: 'utf-8',
      input,
      timeout: 10000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

describe('CLI', () => {
  it('prints a user-friendly error for non-existent file on check', () => {
    // Issue #5: should not crash with raw stack trace
    const result = run(['check', 'nonexistent.txt']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain('ENOENT');
    expect(result.stderr).not.toContain('at ');
    expect(result.stderr.toLowerCase()).toContain('not found');
  });

  it('prints a user-friendly error for non-existent file on fix', () => {
    const result = run(['fix', 'nonexistent.txt']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain('ENOENT');
    expect(result.stderr).not.toContain('at ');
    expect(result.stderr.toLowerCase()).toContain('not found');
  });

  it('reports correct version matching package.json', () => {
    // Issue #6: version should not be hardcoded
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    const result = run(['--version']);
    expect(result.stdout.trim()).toBe(pkg.version);
  });
});
