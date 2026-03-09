#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { program } from 'commander';
import { fixAsciiAlign, checkAlignment } from './fix.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/** Read a file with a user-friendly error on failure */
function readFile(file: string): string {
  if (!existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
  }
  return readFileSync(file, 'utf-8');
}

program
  .name('ascii-align')
  .description('Fix misaligned ASCII boxes and tables — perfect for AI-generated diagrams')
  .version(pkg.version);

// Default command: read from stdin
program
  .command('fix [file]', { isDefault: true })
  .description('Fix alignment of ASCII boxes/tables in a file or stdin')
  .option('--stdout', 'Output to stdout instead of overwriting the file')
  .action((file: string | undefined, opts: { stdout?: boolean }) => {
    let input: string;
    if (file) {
      input = readFile(file);
    } else {
      // Read from stdin
      input = readFileSync(0, 'utf-8');
    }

    const fixed = fixAsciiAlign(input);

    if (!file || opts.stdout) {
      process.stdout.write(fixed);
    } else {
      writeFileSync(file, fixed, 'utf-8');
      const regions = checkAlignment(input);
      if (regions.aligned) {
        console.error('Already aligned — no changes needed.');
      } else {
        console.error(`Fixed ${regions.issues.length} misaligned region(s).`);
      }
    }
  });

program
  .command('check <file>')
  .description('Check alignment (exit code 1 if misaligned)')
  .action((file: string) => {
    const input = readFile(file);
    const result = checkAlignment(input);
    if (result.aligned) {
      console.log('All ASCII structures are properly aligned.');
      process.exit(0);
    } else {
      console.error('Alignment issues found:');
      for (const issue of result.issues) {
        console.error(`  - ${issue}`);
      }
      process.exit(1);
    }
  });

program.parse();
