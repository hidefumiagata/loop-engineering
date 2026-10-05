// PostToolUse hook の純関数テスト。
//   node --test loop/test/hook-test.test.mjs
//
// hook が「成果物の編集でも毎回 npm test を走らせる」ようになると、
// ループの run が遅くなり、無関係な失敗で止まる。逆に仕組みを見落とすと
// 安全装置が壊れたまま残る。その境界をここで固定する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMachinery, failedLines } from '../bin/hook-test.mjs';

const ROOT = 'C:/repo';

test('仕組みのパスは検査対象', () => {
  for (const p of [
    'loop/bin/ask-llm.mjs',
    'loop/config.json',
    'loop/prompts/roles/worker.md',
    'loop/test/wiring.test.mjs',
    '.claude/skills/loop-engine/SKILL.md',
    '.claude/agents/research-reconcile.md',
    '.claude/settings.json',
    'package.json',
  ]) {
    assert.equal(isMachinery(`${ROOT}/${p}`, ROOT), true, `${p} が対象外になっている`);
  }
});

test('成果物のパスは検査対象にしない', () => {
  // ループが毎 run 触る場所。ここで npm test を走らせても落ちる余地が無く、
  // run を無駄に遅くするだけ
  for (const p of [
    'projects/0025-sre-strategy/brief.md',
    'projects/0013-cloudflare-warp/report.md',
    'daily/ai-news-5/2026-10-06.md',
    'daily/_log/2026-10-06.md',
  ]) {
    assert.equal(isMachinery(`${ROOT}/${p}`, ROOT), false, `${p} が対象になっている`);
  }
});

test('リポジトリ外・無関係なファイルは検査対象にしない', () => {
  for (const p of ['README.md', 'docs/ARCHITECTURE.md', 'CLAUDE.md', 'C:/other/loop/x.mjs']) {
    assert.equal(isMachinery(p.startsWith('C:/other') ? p : `${ROOT}/${p}`, ROOT), false,
      `${p} が対象になっている`);
  }
});

test('Windows の円記号パスでも判定できる', () => {
  // hook の stdin には OS 依存のパスが来る
  const win = (...parts) => parts.join('\\');
  assert.equal(isMachinery(win('C:', 'repo', 'loop', 'config.json'), win('C:', 'repo')), true,
    '円記号のパスで仕組みを見落としている');
  assert.equal(isMachinery(win('C:', 'repo', 'projects', '0025', 'brief.md'), win('C:', 'repo')), false,
    '円記号のパスで成果物を対象にしている');
});

test('空やおかしな入力で落ちない', () => {
  for (const v of [undefined, null, '', 0, false]) {
    assert.equal(isMachinery(v, ROOT), false);
  }
});

test('失敗したテストの行だけを拾う', () => {
  const out = [
    '✔ 通ったテスト (1ms)',
    '✖ 落ちたテスト (2ms)',
    'ℹ tests 103',
    'ℹ pass 102',
    'ℹ fail 1',
    '何か関係ない行',
  ].join('\n');
  const got = failedLines(out);
  assert.ok(got.some((l) => l.includes('✖ 落ちたテスト')), '失敗行を拾えていない');
  assert.ok(got.some((l) => l.includes('fail 1')), '件数を拾えていない');
  assert.ok(!got.some((l) => l.includes('✔')), '通ったテストまで拾っている');
  assert.ok(!got.some((l) => l.includes('pass 102')), 'pass 行まで拾っている');
});

test('全部通ったときは何も拾わない', () => {
  const out = ['✔ a (1ms)', 'ℹ tests 103', 'ℹ pass 103', 'ℹ fail 0'].join('\n');
  assert.deepEqual(failedLines(out), []);
});

test('拾う行数に上限がある（出力が長すぎないように）', () => {
  const out = Array.from({ length: 50 }, (_, i) => `✖ テスト${i} (1ms)`).join('\n');
  assert.equal(failedLines(out).length, 20);
  assert.equal(failedLines(out, 5).length, 5);
});
