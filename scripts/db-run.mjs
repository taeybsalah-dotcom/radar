// Runs SQL files against the Supabase Postgres database WITHOUT manual pasting.
//
//   node scripts/db-run.mjs readonly <file.sql>   read-only (BEGIN READ ONLY ... ROLLBACK)
//   node scripts/db-run.mjs dry <file.sql...>     run everything, then ROLLBACK (nothing is saved)
//   node scripts/db-run.mjs apply <file.sql...>   run everything in ONE transaction, COMMIT if all OK
//   node scripts/db-run.mjs test <file.sql>       run a test file (it rolls back by itself)
//
// The connection string is typed at the prompt (hidden). It is never written to any file.
// Requires:  npm i --no-save pg
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const [mode, ...files] = process.argv.slice(2);
if (!['readonly', 'dry', 'apply', 'test'].includes(mode) || files.length === 0) {
  console.error('Usage: node scripts/db-run.mjs <readonly|dry|apply|test> <file.sql...>');
  process.exit(2);
}

const logPath = path.join(os.tmpdir(), 'radar-db-run.log');
const log = [];
const out = (line) => {
  console.log(line);
  log.push(line);
};

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => (data += c));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0].trim()));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

const connectionString = process.env.RADAR_DB_URL || (await askHidden('Paste the database connection string (hidden), then Enter: '));
if (!connectionString) {
  console.error('No connection string given.');
  process.exit(2);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
client.on('notice', (n) => out('NOTICE: ' + n.message));

const sql = files.map((f) => `-- >>> ${path.basename(f)}\n` + fs.readFileSync(f, 'utf8')).join('\n;\n');

let exitCode = 0;
try {
  await client.connect();
  out(`Connected. Mode=${mode}. Files: ${files.map((f) => path.basename(f)).join(', ')}`);

  let script;
  if (mode === 'readonly') script = `BEGIN READ ONLY;\n${sql}\n;ROLLBACK;`;
  else if (mode === 'dry') script = `BEGIN;\n${sql}\n;ROLLBACK;`;
  else if (mode === 'apply') script = `BEGIN;\n${sql}\n;COMMIT;`;
  else script = sql;

  const res = await client.query(script);
  const results = Array.isArray(res) ? res : [res];
  for (const r of results) {
    if (r.rows && r.rows.length && r.command === 'SELECT') {
      out(JSON.stringify(r.rows, null, 2));
    }
  }
  out(mode === 'apply' ? 'RESULT: APPLIED (committed)' : `RESULT: OK (${mode}, nothing saved)`);
} catch (e) {
  exitCode = 1;
  out(`RESULT: FAILED -> ${e.message}${e.position ? ' (at char ' + e.position + ')' : ''}${e.where ? '\nWHERE: ' + e.where : ''}`);
  try {
    await client.query('ROLLBACK');
    out('Rolled back. Nothing was saved.');
  } catch {
    /* ignore */
  }
} finally {
  await client.end().catch(() => {});
  fs.writeFileSync(logPath, log.join('\n') + '\n');
  console.log(`(log saved to ${logPath})`);
  process.exit(exitCode);
}
