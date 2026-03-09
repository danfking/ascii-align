#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { program } from 'commander';
import { fixAsciiAlign, checkAlignment } from './fix.js';

program
  .name('ascii-align')
  .description('Fix misaligned ASCII boxes and tables — perfect for AI-generated diagrams')
  .version('1.0.0');

// Default command: read from stdin
program
  .command('fix [file]', { isDefault: true })
  .description('Fix alignment of ASCII boxes/tables in a file or stdin')
  .option('--stdout', 'Output to stdout instead of overwriting the file')
  .action((file: string | undefined, opts: { stdout?: boolean }) => {
    let input: string;
    if (file) {
      input = readFileSync(file, 'utf-8');
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
    const input = readFileSync(file, 'utf-8');
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
