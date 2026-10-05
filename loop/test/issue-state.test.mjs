// issue-state.mjs のうち gh に依存しない部分のテスト。
//   node --test loop/test/issue-state.test.mjs
//
// GitHub を叩く部分（readState / writeState / listCandidates）は
// docs/SETUP.md の検証手順で実リポジトリに対して確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStateComment, parseStateComment, validateState, artifactLinks, MARKER, PHASE_LABELS, BLOCKED_LABEL } from '../bin/issue-state.mjs';

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
  phase: 'challenge',
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
  assert.doesNotThrow(() => validateState({ ...panelState, phase: 'challenge' }));
  assert.doesNotThrow(() => validateState({ ...panelState, phase: 'revise' }));
  assert.doesNotThrow(() => validateState({ ...panelState, phase: 'synthesize' }));
  // 採点をやめたので evaluate は無い。実装への引き継ぎも無いので handoff / decide も無い
  assert.throws(() => validateState({ ...panelState, phase: 'evaluate' }), /phase=evaluate は不正/);
  assert.throws(() => validateState({ ...panelState, phase: 'handoff' }), /phase=handoff は不正/);
});

test('未知の mode を弾く', () => {
  assert.throws(() => validateState({ ...pipelineState, mode: 'freestyle' }), /未知の mode/);
});

test('反復が上限を大きく超えたら弾く', () => {
  // +1 は「上限到達を検出して blocked にする」ための猶予として許す
  assert.doesNotThrow(() => validateState({ ...pipelineState, iteration: 6, max_iterations: 5 }));
  assert.throws(() => validateState({ ...pipelineState, iteration: 7, max_iterations: 5 }), /max_iterations/);
});

test('成果物をリンクとして状態コメントに載せる', () => {
  // Issue には成果物の本文を書かないが、リンクは置く。
  // 作業ブランチ上のファイルは Issue から辿れないため、リンクが無いと
  // 「どこを見ればよいか分からない」状態になる。
  const s = { ...pipelineState, artifacts: ['report.md', 'sources.md'] };
  const body = renderStateComment(s, 'hidefumiagata/loop-engineering');

  assert.match(body, /\[report\.md\]\(https:\/\/github\.com\/hidefumiagata\/loop-engineering\/blob\/claude\/loop-12-mcp-security\/projects\/0012-mcp-security\/report\.md\)/);
  assert.match(body, /\[sources\.md\]\(/);
  assert.match(body, /tree\/claude\/loop-12-mcp-security\/projects\/0012-mcp-security/, '一式へのリンクも出す');
  assert.match(body, /PR をマージすると `main` 側に移ります/, 'リンクが切れる条件を説明する');

  // JSON は無損失で往復する（artifacts を足しても壊れない）
  assert.deepEqual(parseStateComment(body), s);
});

test('repo が分からない、または成果物が無ければリンクを出さない', () => {
  const noRepo = renderStateComment({ ...pipelineState, artifacts: ['report.md'] });
  assert.doesNotMatch(noRepo, /https:\/\/github\.com/, 'repo 不明ならリンクを組み立てない');

  const noArtifacts = renderStateComment(pipelineState, 'owner/repo');
  assert.match(noArtifacts, /（まだありません）/, '成果物が無いことを明示する');
});

test('artifactLinks の組み立て規則', () => {
  const s = { branch: 'claude/loop-9-x', slug: '0009-x', artifacts: ['a.md', 'b.json'] };
  const links = artifactLinks(s, 'o/r');
  assert.equal(links,
    '[a.md](https://github.com/o/r/blob/claude/loop-9-x/projects/0009-x/a.md)'
    + ' · [b.json](https://github.com/o/r/blob/claude/loop-9-x/projects/0009-x/b.json)');
  assert.equal(artifactLinks({ ...s, artifacts: [] }, 'o/r'), null);
  assert.equal(artifactLinks(s, null), null);
});

test('sync-phase は loop:blocked を勝手に外さない', () => {
  // loop:blocked は listCandidates が除外に使う制御ラベルであり、人間が外すまで残る必要がある。
  // PHASE_LABELS に含めると、次の run の sync-phase が「状態は phase: work なのに
  // loop:blocked が付いている」と見て剥がし、人間が確認していない Issue が再開してしまう。
  // 実測: Issue #19 が loop:work と loop:blocked の両方を持った状態で滞留した。
  assert.ok(!PHASE_LABELS.includes(BLOCKED_LABEL),
    'loop:blocked が PHASE_LABELS に入っている。sync-phase が剥がしてしまう');
  assert.equal(BLOCKED_LABEL, 'loop:blocked');

  // 進行フェーズは全部入っていること（blocked 以外を落としていない）
  for (const p of ['plan', 'work', 'review', 'done',
    'brief', 'propose', 'challenge', 'revise', 'synthesize']) {
    assert.ok(PHASE_LABELS.includes(`loop:${p}`), `loop:${p} が PHASE_LABELS に無い`);
  }
});
