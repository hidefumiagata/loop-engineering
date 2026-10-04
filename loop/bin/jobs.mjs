#!/usr/bin/env node
// 定期ジョブ（daily-jobs）の定義を読む。
//
//   node loop/bin/jobs.mjs list          有効なジョブを JSON で列挙
//   node loop/bin/jobs.mjs list --all    無効なものも含める
//   node loop/bin/jobs.mjs show <id>     1件の定義と本文を表示
//
// Issue 駆動のループ（loop-engine）とは別物。
//   loop-engine  目的を達成するまで反復する。状態は Issue に持つ
//   daily-jobs   毎日同じ仕事をして成果物を作る。状態を持たない
// 混ぜると SKILL.md が両方の都合を抱えて読めなくなるので、分けている。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const JOBS_DIR = resolve(HERE, '..', 'jobs');

/**
 * front matter を取り出す。YAML パーサは入れない（依存ゼロを保つ）。
 * `key: value` の1行形式だけを受ける。複雑な構造が要るならジョブ定義のほうを見直す。
 */
export function parseJob(text, file) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: front matter（--- で囲まれた部分）がありません`);

  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) throw new Error(`${file}: front matter の行を解釈できません: ${line}`);
    let v = kv[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    meta[kv[1]] = v;
  }

  for (const k of ['id', 'title', 'output']) {
    if (!meta[k]) throw new Error(`${file}: front matter に ${k} がありません`);
  }
  if (typeof meta.enabled !== 'boolean') {
    throw new Error(`${file}: enabled は true か false で書いてください`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(meta.id)) {
    throw new Error(`${file}: id は英小文字・数字・ハイフンのみ（received: ${meta.id}）`);
  }
  if (!meta.output.includes('{date}')) {
    throw new Error(`${file}: output に {date} が含まれていません。日ごとに上書きされてしまいます`);
  }

  return { ...meta, file: basename(file), body: m[2].trim() };
}

/** output の {date} を YYYY-MM-DD に展開する */
export function resolveOutput(job, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`date は YYYY-MM-DD 形式で指定してください (received: ${date})`);
  }
  return job.output.replace(/\{date\}/g, date);
}

export function loadJobs(dir = JOBS_DIR, { all = false } = {}) {
  if (!existsSync(dir)) return [];
  const jobs = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseJob(readFileSync(join(dir, f), 'utf8'), f));

  const ids = new Set();
  for (const j of jobs) {
    if (ids.has(j.id)) throw new Error(`id が重複しています: ${j.id}`);
    ids.add(j.id);
  }
  return all ? jobs : jobs.filter((j) => j.enabled);
}

// ---------------- CLI ----------------

const USAGE = [
  '使い方:',
  '  node loop/bin/jobs.mjs list [--all]   有効なジョブを JSON で列挙（--all で無効も含む）',
  '  node loop/bin/jobs.mjs show <id>      1件の定義と本文を表示',
].join('\n');

function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'list') {
    const jobs = loadJobs(JOBS_DIR, { all: process.argv.includes('--all') });
    console.log(JSON.stringify(jobs.map(({ body, ...m }) => m), null, 2));
    process.stderr.write(`[ok] ${jobs.length} 件\n`);
    return;
  }
  if (cmd === 'show') {
    const job = loadJobs(JOBS_DIR, { all: true }).find((j) => j.id === arg);
    if (!job) throw new Error(`ジョブが見つかりません: ${arg}`);
    console.log(JSON.stringify({ ...job, body: undefined }, null, 2));
    console.log('\n---\n');
    console.log(job.body);
    return;
  }
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}

if (process.argv[1]?.endsWith('jobs.mjs')) {
  try { main(); } catch (e) { process.stderr.write(`[error] ${e.message}\n`); process.exit(1); }
}
