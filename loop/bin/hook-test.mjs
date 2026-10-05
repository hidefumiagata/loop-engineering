#!/usr/bin/env node
// Claude Code の PostToolUse hook。仕組みを編集したら npm test を走らせる。
//
//   .claude/settings.json の hooks.PostToolUse から呼ばれる。
//   stdin に {tool_input:{file_path}, tool_response:{filePath}} 形式の JSON が来る。
//
// なぜ必要か:
//   ループの仕組み（手順書・設定・プロンプト・スクリプト・テスト）を変えるのは人間で、
//   そのとき npm test を走らせ忘れると安全装置が壊れたまま残る。
//   実際に、テストが退行を固定していた状態に2日間気づけなかった。
//
// なぜ GitHub Actions ではないのか:
//   このリポジトリは Actions の無料枠を消費しない方針
//   （docs/ARCHITECTURE.md「なぜ GitHub Actions ではないのか」）。
//   ローカルで編集直後に走らせれば、壊した本人がその場で気づける。
//
// なぜ jq を使わないのか:
//   ローカルにも Claude Cloud のサンドボックスにも jq は保証されていない。
//   Node は両方にあるので、stdin の解析も Node で行う。

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 仕組みに当たるパスかどうか。純関数なのでテストできる。
 * 成果物（`projects/` と `daily/`）は対象外 — ループが毎 run 触る場所で、テストと無関係。
 */
export function isMachinery(filePath, root = ROOT) {
  if (!filePath) return false;
  const toPosix = (s) => String(s).split('\\').join('/');
  const p = toPosix(filePath);
  const r = toPosix(root).replace(/\/$/, '');
  const rel = p.startsWith(`${r}/`) ? p.slice(r.length + 1) : p;
  if (/^(projects|daily)\//.test(rel)) return false;
  return /^loop\//.test(rel) || /^\.claude\//.test(rel) || rel === 'package.json';
}

/** 落ちたテストの行だけを拾う。全文を返すと読みづらい */
export function failedLines(output, limit = 20) {
  return String(output)
    .split('\n')
    .filter((l) => /^\s*✖|^not ok|ℹ fail [1-9]/.test(l))
    .slice(0, limit);
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }

  let payload = {};
  try { payload = JSON.parse(raw); } catch { /* 解析できなければ何もしない */ }

  const filePath = payload?.tool_input?.file_path ?? payload?.tool_response?.filePath ?? '';
  if (!isMachinery(filePath)) return;   // 成果物の編集では走らせない

  // shell: true に args 配列を渡すと Node が非推奨警告を出すので、1つの文字列で渡す。
  // Windows では npm が npm.cmd なので、シェル経由でないと起動できない。
  const r = spawnSync('npm test', { cwd: ROOT, encoding: 'utf8', shell: true });
  if (r.status === 0) return;           // 通ったら黙る

  const failed = failedLines(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  process.stdout.write(`${JSON.stringify({
    decision: 'block',
    reason: [
      `npm test が失敗しました（${filePath} の編集後）。安全装置が壊れています。`,
      '',
      ...failed,
      '',
      'テストを書き換えて通すのではなく、なぜ落ちたかを先に確認してください。',
      '不変条件を意図的に変えるなら、それは人間が判断することです。',
    ].join('\n'),
    systemMessage: `npm test 失敗。仕組みの変更が安全装置と衝突しています（${failed.length} 行）。`,
  })}\n`);
}

// 直接実行されたときだけ走らせる。
// import 時に走ると、テストから読み込んだだけで stdin を読んで npm test を起動してしまう。
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
