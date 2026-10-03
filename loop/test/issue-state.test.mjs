// issue-state.mjs のうち gh に依存しない部分のテスト。
//   node --test loop/test/issue-state.test.mjs
//
// GitHub を叩く部分（readState / writeState / listCandidates）は
// docs/SETUP.md の検証手順で実リポジトリに対して確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStateComment, parseStateComment, validateState, MARKER } from '../bin/issue-state.mjs';

const pipelineState = {
  issue: 12,
  usecase: 'research',
  mode: 'pipeline',
  slug: '0012-mcp-security',
  branch: 'claude/loop-12-mcp-security',
  pr: 34,
  phase: 'review',
  iteration: 2,
  max_iterations: 5,
  acceptance: [{ id: 'a1', text: '主要な実装3件を一次情報で裏付ける', status: 'unmet' }],
  history: [{ n: 1, kind: 'work', by: 'claude', at: '2026-10-03T00:00:00Z' }],
  awaiting_human: false,
  updated_at: '2026-10-03T01:00:00Z',
};

const panelState = {
  issue: 13,
  usecase: 'deliberation',
  mode: 'panel',
  slug: '0013-agent-arch',
  branch: 'claude/loop-13-agent-arch',
  pr: null,
  phase: 'evaluate',
  iteration: 1,
  max_iterations: 5,
  panel_round: 1,
  awaiting_human: false,
  updated_at: '2026-10-03T01:00:00Z',
};

test('状態コメントは JSON を無損失で往復する', () => {
  for (const s of [pipelineState, panelState]) {
    const body = renderStateComment(s);
    assert.ok(body.startsWith(MARKER), 'マーカーが先頭にあること');
    assert.deepEqual(parseStateComment(body), s);
  }
});

test('状態コメントは人間が読める要約を含む', () => {
  const body = renderStateComment(pipelineState);
  assert.match(body, /\*\*review\*\*/, 'フェーズが強調表示されている');
  assert.match(body, /2\/5/, '反復数が見える');
  assert.match(body, /#34/, 'PR 番号が見える');
  assert.match(body, /loop:stop/, '止め方が書かれている');
  assert.match(body, /手で編集しないでください/);
});

test('panel ではラウンド数も表示する', () => {
  assert.match(renderStateComment(panelState), /panelラウンド 1/);
});

test('json ブロックが無いコメントは明示的に失敗する', () => {
  assert.throws(() => parseStateComment(`${MARKER}\n状態が消えた`), /json ブロックが見つかりません/);
});

test('必須フィールド欠落を検出する', () => {
  const broken = { ...pipelineState };
  delete broken.branch;
  delete broken.phase;
  assert.throws(() => validateState(broken), /必須フィールド branch/);
});

test('mode と phase の組み合わせを検証する', () => {
  // panel 専用のフェーズを pipeline に入れたら弾く
  assert.throws(() => validateState({ ...pipelineState, phase: 'propose' }), /phase=propose は不正/);
  // 逆方向も弾く
  assert.throws(() => validateState({ ...panelState, phase: 'work' }), /phase=work は不正/);
  // 正しい組み合わせは通る
  assert.doesNotThrow(() => validateState({ ...pipelineState, phase: 'work' }));
  assert.doesNotThrow(() => validateState({ ...panelState, phase: 'decide' }));
});

test('未知の mode を弾く', () => {
  assert.throws(() => validateState({ ...pipelineState, mode: 'freestyle' }), /未知の mode/);
});

test('反復が上限を大きく超えたら弾く', () => {
  // +1 は「上限到達を検出して blocked にする」ための猶予として許す
  assert.doesNotThrow(() => validateState({ ...pipelineState, iteration: 6, max_iterations: 5 }));
  assert.throws(() => validateState({ ...pipelineState, iteration: 7, max_iterations: 5 }), /max_iterations/);
});
