// aggregate.mjs のユニットテスト。
//   node --test loop/test/
//
// aggregate.mjs は合議の信頼性の根拠なので、ここは手計算で検証できる値だけを使う。
// 期待値はすべてコメントで計算過程を示す。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, averageRanks, kendallW, normalizeLabel } from '../bin/aggregate.mjs';

const CRITERIA = [
  { id: 'c1', text: '運用の単純さ', weight: 3 },
  { id: 'c2', text: '拡張性', weight: 2 },
  { id: 'c3', text: '初期実装コスト', weight: 1 },
];

/** 全基準に同じ点を付ける評価者行を作るヘルパ */
const flat = (label, score) => ({
  label,
  criteria: CRITERIA.map((c) => ({ id: c.id, score, justification: `${label} の ${c.id} は ${score}` })),
  biggest_concern: `${label} の懸念`,
  overall_comment: `${label} の総評`,
});

const evaluation = (rows) => ({ proposals: rows, evaluator_notes: '' });

test('averageRanks: 同順位に平均順位を割り当てる', () => {
  assert.deepEqual(averageRanks({ A: 5, B: 3, C: 1 }), { A: 1, B: 2, C: 3 });
  // B と C が同点 → 2位と3位の平均 2.5 を両方に
  assert.deepEqual(averageRanks({ A: 5, B: 3, C: 3 }), { A: 1, B: 2.5, C: 2.5 });
});

test('kendallW: 完全一致で 1、完全不一致で 0', () => {
  // 3評価者が同じ順位 → rankSums A=3,B=6,C=9 / grand=6 / S=18
  // denom = m^2(n^3-n)/12 = 9*24/12 = 18 → W = 1
  const same = [{ A: 1, B: 2, C: 3 }, { A: 1, B: 2, C: 3 }, { A: 1, B: 2, C: 3 }];
  assert.equal(kendallW(same), 1);

  // 巡回的に食い違う → rankSums が全て 6 で S=0 → W = 0
  const cyclic = [{ A: 1, B: 2, C: 3 }, { A: 3, B: 1, C: 2 }, { A: 2, B: 3, C: 1 }];
  assert.equal(kendallW(cyclic), 0);

  assert.equal(kendallW([{ A: 1, B: 2 }]), null, '評価者1名では一致度を定義しない');
});

test('重み付きスコアと順位を正しく出す', () => {
  // 全基準同点なので重み付き平均 = その点数。A=4 B=3 C=2 で3評価者とも一致。
  const rows = [flat('A', 4), flat('B', 3), flat('C', 2)];
  const r = aggregate({
    criteria: CRITERIA,
    authors: { A: 'openai', B: 'gemini', C: 'claude' },
    evaluations: [
      { evaluator: 'claude', data: evaluation(rows) },
      { evaluator: 'gemini', data: evaluation(rows) },
      { evaluator: 'openai', data: evaluation(rows) },
    ],
  });

  assert.equal(r.total_weight, 6);
  assert.deepEqual(r.proposals.map((p) => [p.label, p.weighted_score, p.rank]), [
    ['A', 4, 1], ['B', 3, 2], ['C', 2, 3],
  ]);
  assert.equal(r.winner.label, 'A');
  assert.equal(r.winner.author, 'openai');
  assert.equal(r.winner.margin, 1);
  assert.equal(r.agreement.kendall_w, 1);
  assert.equal(r.agreement.top_pick_unanimous, true);
  assert.equal(r.proposals[0].inter_evaluator_spread, 0, '全員同点なのでばらつきは 0');
});

test('重みが効いている', () => {
  // A: c1(w3)=5, c2(w2)=1, c3(w1)=1 → (15+2+1)/6 = 3
  // B: c1(w3)=1, c2(w2)=5, c3(w1)=5 → (3+10+5)/6 = 3
  // 重み付けなしの素平均ならどちらも 2.33 で同じだが、重み付けでも同点になる組を選び、
  // 重みが分母・分子に正しく入っていることを値そのもので確かめる。
  const mk = (label, s1, s2, s3) => ({
    label,
    criteria: [{ id: 'c1', score: s1, justification: '' }, { id: 'c2', score: s2, justification: '' }, { id: 'c3', score: s3, justification: '' }],
    biggest_concern: '', overall_comment: '',
  });
  const rows = [mk('A', 5, 1, 1), mk('B', 1, 5, 5)];
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [{ evaluator: 'claude', data: evaluation(rows) }],
  });
  const byLabel = Object.fromEntries(r.proposals.map((p) => [p.label, p.weighted_score]));
  assert.equal(byLabel.A, 3, '(5*3 + 1*2 + 1*1) / 6 = 3');
  assert.equal(byLabel.B, 3, '(1*3 + 5*2 + 5*1) / 6 = 3');
  assert.equal(r.proposals[0].by_criterion.c1.weight, 3);
});

test('自己採点バイアスを検出して警告する', () => {
  // claude が自案 A に 5、他案に 2 を付ける → bias = 5 - 2 = 3
  const claudeRows = [flat('A', 5), flat('B', 2), flat('C', 2)];
  // 他の2名は A を特に高く評価していない
  const otherRows = [flat('A', 3), flat('B', 3), flat('C', 3)];
  const r = aggregate({
    criteria: CRITERIA,
    authors: { A: 'claude', B: 'gemini', C: 'openai' },
    evaluations: [
      { evaluator: 'claude', data: evaluation(claudeRows) },
      { evaluator: 'gemini', data: evaluation(otherRows) },
      { evaluator: 'openai', data: evaluation(otherRows) },
    ],
  });

  const claudeBias = r.self_score_bias.find((b) => b.evaluator === 'claude');
  assert.equal(claudeBias.own_label, 'A');
  assert.equal(claudeBias.own_score, 5);
  assert.equal(claudeBias.others_mean, 2);
  assert.equal(claudeBias.bias, 3);
  assert.ok(
    r.warnings.some((w) => w.includes('自己採点バイアス') && w.includes('claude')),
    '閾値 0.75 を超えたら警告を出す',
  );

  // gemini は自案 B に 3、他案も 3 → bias 0 なので警告しない
  const geminiBias = r.self_score_bias.find((b) => b.evaluator === 'gemini');
  assert.equal(geminiBias.bias, 0);
  assert.equal(r.warnings.filter((w) => w.includes('自己採点バイアス') && w.includes('gemini')).length, 0);
});

test('評価者間の一致度が低いと警告する', () => {
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [
      { evaluator: 'claude', data: evaluation([flat('A', 5), flat('B', 3), flat('C', 1)]) },
      { evaluator: 'gemini', data: evaluation([flat('A', 1), flat('B', 5), flat('C', 3)]) },
      { evaluator: 'openai', data: evaluation([flat('A', 3), flat('B', 1), flat('C', 5)]) },
    ],
  });
  assert.equal(r.agreement.kendall_w, 0, '巡回的な食い違いなので W=0');
  assert.equal(r.agreement.top_pick_unanimous, false);
  assert.ok(r.warnings.some((w) => w.includes('一致度が低い')));
});

test('首位と次点の差が小さいと警告する', () => {
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [{ evaluator: 'claude', data: evaluation([flat('A', 4), flat('B', 4)]) }],
  });
  assert.equal(r.winner.margin, 0);
  assert.ok(r.warnings.some((w) => w.includes('首位と次点の差')));
});

test('どの案も満たせていない基準を指摘する', () => {
  // c1 だけ全案が低得点になるデータ
  const mk = (label, c1) => ({
    label,
    criteria: [{ id: 'c1', score: c1, justification: '' }, { id: 'c2', score: 5, justification: '' }, { id: 'c3', score: 5, justification: '' }],
    biggest_concern: '', overall_comment: '',
  });
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [{ evaluator: 'claude', data: evaluation([mk('A', 2), mk('B', 1)]) }],
  });
  assert.deepEqual(r.unmet_criteria.map((c) => c.id), ['c1']);
  assert.equal(r.unmet_criteria[0].best_mean, 2);
  assert.ok(r.warnings.some((w) => w.includes('基準 c1 をどの案も満たせていません')));
});

test('採点漏れを警告し、平均の母数から除外する', () => {
  const partial = {
    label: 'A',
    criteria: [{ id: 'c1', score: 4, justification: '' }], // c2, c3 が無い
    biggest_concern: '', overall_comment: '',
  };
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [{ evaluator: 'claude', data: evaluation([partial, flat('B', 3)]) }],
  });
  const a = r.proposals.find((p) => p.label === 'A');
  assert.equal(a.weighted_score, 4, '採点された c1 のみで平均するので 4 のまま（0 で埋めない）');
  assert.equal(a.by_criterion.c2.n, 0);
  assert.ok(r.warnings.some((w) => w.includes('c2, c3') && w.includes('採点していません')));
});

test('criteria.json に無い基準は集計から外して警告する', () => {
  const rogue = {
    label: 'A',
    criteria: [...CRITERIA.map((c) => ({ id: c.id, score: 3, justification: '' })), { id: 'zz', score: 5, justification: '' }],
    biggest_concern: '', overall_comment: '',
  };
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [{ evaluator: 'claude', data: evaluation([rogue, flat('B', 1)]) }],
  });
  assert.equal(r.proposals.find((p) => p.label === 'A').weighted_score, 3, 'zz は無視される');
  assert.ok(r.warnings.some((w) => w.includes('未知の基準 zz')));
});

test('案が1件しかなければ合議として成立していないと警告する', () => {
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [{ evaluator: 'claude', data: evaluation([flat('A', 4)]) }],
  });
  assert.ok(r.warnings.some((w) => w.includes('合議として成立していません')));
});

test('入力が壊れていれば例外を投げる', () => {
  assert.throws(() => aggregate({ criteria: [], authors: {}, evaluations: [] }), /criteria\.json が空/);
  assert.throws(() => aggregate({ criteria: CRITERIA, authors: {}, evaluations: [] }), /評価ファイルがありません/);
});

test('scores.json は自分が機械出力であることを明示する', () => {
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},
    evaluations: [{ evaluator: 'claude', data: evaluation([flat('A', 4), flat('B', 2)]) }],
  });
  assert.equal(r.generated_by, 'loop/bin/aggregate.mjs');
  assert.match(r.note, /書き換えません/);
});

test('自己採点を除いた点を案ごとに併記する', () => {
  // claude が自案 B を 5、他案を 2 にして首位を取る構図。
  // 自己採点を除くと B は gemini/openai の 3 点だけになり、A(4,4の平均4) が上に来る。
  const r = aggregate({
    criteria: CRITERIA,
    authors: { A: 'gemini', B: 'claude', C: 'openai' },
    evaluations: [
      { evaluator: 'claude', data: evaluation([flat('A', 2), flat('B', 5), flat('C', 2)]) },
      { evaluator: 'gemini', data: evaluation([flat('A', 4), flat('B', 3), flat('C', 3)]) },
      { evaluator: 'openai', data: evaluation([flat('A', 4), flat('B', 3), flat('C', 2)]) },
    ],
  });

  const byLabel = Object.fromEntries(r.proposals.map((p) => [p.label, p]));
  // B の総合は (5+3+3)/3 = 3.667、自己採点を除くと (3+3)/2 = 3
  assert.equal(byLabel.B.weighted_score, 3.667);
  assert.equal(byLabel.B.weighted_score_excl_self, 3);
  // A の総合は (2+4+4)/3 = 3.333、自己採点(gemini)を除くと (2+4)/2 = 3
  assert.equal(byLabel.A.weighted_score_excl_self, 3);

  assert.equal(r.winner.label, 'B', '総合では自己採点込みで B が首位');
  assert.ok(r.winner_excl_self, '自己採点を除いた首位も出す');
});

test('自己採点を除くと首位が入れ替わるケースを検出して警告する', () => {
  // claude が自案 B を 5、A を 1 にして B を首位に押し上げる構図。
  // 一方 A の著者 gemini は自案を特に優遇しておらず、第三者 openai は A を上と見ている。
  const r = aggregate({
    criteria: CRITERIA,
    authors: { A: 'gemini', B: 'claude' },
    evaluations: [
      { evaluator: 'claude', data: evaluation([flat('A', 1), flat('B', 5)]) },
      { evaluator: 'gemini', data: evaluation([flat('A', 3), flat('B', 3)]) },
      { evaluator: 'openai', data: evaluation([flat('A', 5), flat('B', 2)]) },
    ],
  });

  // 総合: A=(1+3+5)/3=3.0 / B=(5+3+2)/3=3.333 → 首位は B
  assert.equal(r.winner.label, 'B');
  assert.equal(r.winner.weighted_score, 3.333);

  // 自己採点除外: A は gemini を除いて (1+5)/2=3.0 / B は claude を除いて (3+2)/2=2.5
  //            → 首位が A に入れ替わる
  assert.equal(r.winner_excl_self.label, 'A');
  assert.equal(r.winner_excl_self.weighted_score_excl_self, 3);

  assert.ok(
    r.warnings.some((w) => w.includes('自己採点を除くと首位が') && w.includes('B') && w.includes('A')),
    '首位が入れ替わることを警告する。警告だけでは順位が動かないため、両方の順位を出すのが目的',
  );
});

test('著者不明の案は自己採点除外の対象にしない', () => {
  const r = aggregate({
    criteria: CRITERIA,
    authors: {},   // 対応表が無い
    evaluations: [{ evaluator: 'claude', data: evaluation([flat('A', 4), flat('B', 2)]) }],
  });
  // 誰の案か分からないので除外は起きず、総合と同じ値になる
  const a = r.proposals.find((p) => p.label === 'A');
  assert.equal(a.weighted_score_excl_self, a.weighted_score);
  assert.equal(r.self_score_bias.length, 0);
});

test('評価者が返したラベルのゆらぎを吸収する', () => {
  // 実運用で、パケット見出しが「# 案 A」だったため評価者が "案 B" を返した。
  // そのときエージェントは evaluations/*.json を手で書き換えて回避したが、
  // 評価者の出力を編集するのは証跡を壊す。集計側で吸収し、吸収したことを警告に出す。
  const mk = (label, score) => ({ ...flat('X', score), label });
  const r = aggregate({
    criteria: CRITERIA,
    authors: { A: 'claude', B: 'gemini' },
    evaluations: [
      { evaluator: 'claude', data: evaluation([mk('A', 5), mk('B', 3)]) },
      { evaluator: 'gemini', data: evaluation([mk('案 A', 5), mk('案 B', 3)]) },
      { evaluator: 'openai', data: evaluation([mk('Proposal A', 5), mk('b', 3)]) },
    ],
  });

  assert.deepEqual(r.proposals.map((p) => p.label), ['A', 'B'], '3者の表記ゆれが同じ案にまとまる');
  assert.equal(r.proposals.find((p) => p.label === 'A').by_evaluator.openai, 5,
    '"Proposal A" が A として集計されている');
  assert.equal(r.proposals.find((p) => p.label === 'B').by_evaluator.gemini, 3,
    '"案 B" が B として集計されている');
  assert.ok(r.warnings.some((w) => w.includes('正規化しました')), '黙って直さず記録に残す');
});

test('normalizeLabel の規則', () => {
  assert.equal(normalizeLabel('B'), 'B');
  assert.equal(normalizeLabel('案 B'), 'B');
  assert.equal(normalizeLabel('案B'), 'B');
  assert.equal(normalizeLabel('Proposal B'), 'B');
  assert.equal(normalizeLabel(' b '), 'B');
  assert.equal(normalizeLabel('A1'), 'A1', '英数字だけならそのまま大文字化する');
});
