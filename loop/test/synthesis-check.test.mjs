// synthesis-check.mjs のユニットテスト。
//   node --test loop/test/synthesis-check.test.mjs
//
// panel モードでは Claude が3案のうち1つを書き、そのうえで統合答案も書く。
// 「自案に飾りを付けただけ」を外から見分けるのがこのスクリプトの役目なので、
// 手計算で検証できる値だけを使う。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSynthesis } from '../bin/synthesis-check.mjs';

const AUTHORS = { A: 'openai', B: 'claude', C: 'gemini' };
const el = (from, i) => ({ element: `要素${i}`, from, note: '' });

/** from の配列を並べて provenance を作る */
const prov = (...froms) => froms.map((f, i) => el(f, i));

test('3者一致の要素は寄与を均等に分ける', () => {
  // 一致要素に全員 1 を与えると、一致が多いほど比率が平らになって偏りが隠れる。
  // だから1要素の寄与を由来数で割る。
  const r = checkSynthesis({
    provenance: prov(['A', 'B', 'C'], ['A', 'B', 'C'], ['A', 'B', 'C']),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  for (const x of r.by_label) {
    assert.equal(x.weight, 1, '3要素 × 1/3 = 1');
    assert.equal(x.ratio, round3(1 / 3));
  }
});

const round3 = (x) => Math.round(x * 1000) / 1000;

test('自案に偏っていれば警告する', () => {
  // B(claude) 固有が 6 件、A と C 固有が 1 件ずつ → B は 6/8 = 75%
  const r = checkSynthesis({
    provenance: prov(['B'], ['B'], ['B'], ['B'], ['B'], ['B'], ['A'], ['C'], []),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  const own = r.by_label.find((x) => x.is_synthesizer);
  assert.equal(own.label, 'B');
  assert.equal(own.ratio, 0.75);
  assert.equal(r.even_ratio, 0.333, '3案なら均等は 1/3');
  assert.ok(r.warnings.some((w) => w.includes('統合役自身の案') && w.includes('75%')));
});

test('均等に近ければ偏りの警告は出さない', () => {
  // A:3 B:3 C:3 → それぞれ 33%
  const r = checkSynthesis({
    provenance: prov(['A'], ['A'], ['A'], ['B'], ['B'], ['B'], ['C'], ['C'], ['C'], []),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  assert.equal(r.by_label.find((x) => x.label === 'B').ratio, round3(1 / 3));
  assert.equal(r.warnings.filter((w) => w.includes('統合役自身の案')).length, 0);
});

test('閾値ちょうどでは警告せず、超えたら警告する', () => {
  // 均等 0.333 × 1.6 = 0.533 が閾値
  // B が 5、他が 5 合計 → B = 50% は閾値以下
  const under = checkSynthesis({
    provenance: prov(['B'], ['B'], ['B'], ['B'], ['B'], ['A'], ['A'], ['A'], ['C'], ['C'], []),
    authors: AUTHORS, synthesizer: 'claude',
  });
  assert.equal(under.by_label.find((x) => x.label === 'B').ratio, 0.5);
  assert.equal(under.warnings.filter((w) => w.includes('統合役自身の案')).length, 0, '50% は閾値 53.3% 以下');

  // B が 7 / 全 10 → 70% で警告
  const over = checkSynthesis({
    provenance: prov(['B'], ['B'], ['B'], ['B'], ['B'], ['B'], ['B'], ['A'], ['A'], ['C'], []),
    authors: AUTHORS, synthesizer: 'claude',
  });
  assert.equal(over.by_label.find((x) => x.label === 'B').ratio, 0.7);
  assert.ok(over.warnings.some((w) => w.includes('統合役自身の案')));
});

test('まったく採られなかった案を指摘する', () => {
  const r = checkSynthesis({
    provenance: prov(['A'], ['A'], ['A'], ['B'], ['B'], ['B'], ['A', 'B'], ['A'], []),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  assert.equal(r.by_label.find((x) => x.label === 'C').weight, 0);
  assert.ok(r.warnings.some((w) => w.includes('案 C') && w.includes('1つも採られていません')));
});

test('新規要素が無ければ寄せ集めを疑わせる', () => {
  const r = checkSynthesis({
    provenance: prov(['A'], ['A'], ['A'], ['B'], ['B'], ['B'], ['C'], ['C'], ['C']),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  assert.equal(r.novel_elements, 0);
  assert.ok(r.warnings.some((w) => w.includes('新規要素')));
});

test('新規要素は寄与の分母に入れない', () => {
  // 新規が多くても、既存3案の相対比率は変わってはいけない
  const r = checkSynthesis({
    provenance: prov(['A'], ['B'], ['C'], [], [], [], [], []),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  assert.equal(r.novel_elements, 5);
  assert.equal(r.attributed_weight, 3);
  assert.equal(r.total_elements, 8);
  for (const x of r.by_label) assert.equal(x.ratio, round3(1 / 3), '新規は比率に影響しない');
});

test('粒度が粗すぎれば指摘する', () => {
  const r = checkSynthesis({
    provenance: prov(['A'], ['B'], ['C']),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  assert.ok(r.warnings.some((w) => w.includes('3 件しかありません')));
});

test('未知のラベルは集計から外して警告する', () => {
  const r = checkSynthesis({
    provenance: prov(['A'], ['B'], ['C'], ['Z'], ['A'], ['B'], ['C'], ['A'], []),
    authors: AUTHORS,
    synthesizer: 'claude',
  });
  assert.ok(r.warnings.some((w) => w.includes('未知のラベル Z')));
  // Z は分母に入らない
  assert.equal(r.attributed_weight, 7);
});

test('provenance が空なら例外を投げる', () => {
  assert.throws(() => checkSynthesis({ provenance: [], authors: AUTHORS, synthesizer: 'claude' }),
    /provenance\.json が空/);
});

test('出力は自分が機械集計であることを明示する', () => {
  const r = checkSynthesis({
    provenance: prov(['A'], ['B'], ['C'], ['A'], ['B'], ['C'], ['A'], ['B'], []),
    authors: AUTHORS, synthesizer: 'claude',
  });
  assert.equal(r.generated_by, 'loop/bin/synthesis-check.mjs');
  assert.match(r.note, /書き換えません/);
});
