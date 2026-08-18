#!/usr/bin/env node
// ============================================================
// Runner de testes unitários — usa o runner nativo do Node.
// Roda com: npm test  ou  node src/tests/run-tests.mjs
// ============================================================
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  path.join(__dirname, 'phone.test.mjs'),
  path.join(__dirname, 'validation.test.mjs'),
  path.join(__dirname, 'auth-license.test.mjs'),
  path.join(__dirname, 'pairing.test.mjs'),
  path.join(__dirname, 'pairing.integration.test.mjs'),
  path.join(__dirname, 'pairing-board.test.mjs'),
];

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
