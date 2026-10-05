// ask-llm.mjs の純関数テスト。
//   node --test loop/test/ask-llm.test.mjs
//
// ここは「文章にそう書いてあるか」ではなく「実際にそう振る舞うか」を見る。
// 文章マッチだけだと、コメントが正規表現に一致して本体の退行を見逃す。
// 実測: 出力上限の解決を `?? 16000` に書き換えても、コメントが一致するため
// wiring テストは通ってしまった（Issue #25 の修正本体が無検証だった）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolveTier, resolveMaxOutputTokens, computeCost,
  ASYNC_PROVIDERS, SYNC_MAX_OUTPUT_TOKENS,
} from '../bin/ask-llm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = JSON.parse(readFileSync(resolve(ROOT, 'loop/config.json'), 'utf8'));

// ---- 出力上限（Issue #25 の再発防止の本体） ----

test('出力上限は config の階層設定から解決される', () => {
  // 同期階層。約30秒のプロキシ制限内に返しきる必要がある
  assert.equal(resolveMaxOutputTokens('gemini:propose', config), 8000);
  // 非同期階層。background: true なのでポーリングで取れる
  assert.equal(resolveMaxOutputTokens('openai:propose', config), 16000);
});

test('明示指定があればそれを使う（一時的な上書き）', () => {
  assert.equal(resolveMaxOutputTokens('gemini:propose', config, 999), 999);
  assert.equal(resolveMaxOutputTokens('gemini:propose', config, '1234'), 1234);
});

test('階層に設定が無ければ同期の安全値に落ちる', () => {
  const c = structuredClone(config);
  delete c.providers.gemini.tiers.propose.max_output_tokens;
  assert.equal(resolveMaxOutputTokens('gemini:propose', c), SYNC_MAX_OUTPUT_TOKENS);
  assert.equal(SYNC_MAX_OUTPUT_TOKENS, 8000);
});

test('同期階層の上限が約30秒で返しきれる値に収まっている', () => {
  // background を実装しているのは openai だけ（buildRequest が他を見ない）。
  // 非 openai に background: true を付けても非同期にはならないので、
  // 例外を認めるのは ASYNC_PROVIDERS に属する階層だけ。
  // enabled:false の階層は resolveTier が投げるので、config の値を直接見る。
  for (const [pname, provider] of Object.entries(config.providers)) {
    for (const [tname, tier] of Object.entries(provider.tiers)) {
      if (ASYNC_PROVIDERS.includes(pname) && tier.background === true) continue;
      const cap = tier.max_output_tokens ?? SYNC_MAX_OUTPUT_TOKENS;
      assert.ok(cap <= SYNC_MAX_OUTPUT_TOKENS,
        `${pname}:${tname} は同期扱いなのに上限が ${cap}。`
        + ' 約30秒のプロキシ制限を超えて 502 になる（Issue #25）');
    }
  }
});

test('background を実装しているプロバイダは openai だけ', () => {
  // ここがずれると、上のテストの例外判定が実態と合わなくなる。
  // buildRequest の各プロバイダ分岐を切り出し、tier.background を読んでいる分岐だけを拾う。
  const src = readFileSync(resolve(ROOT, 'loop/bin/ask-llm.mjs'), 'utf8');
  const marks = [...src.matchAll(/providerName === '(\w+)'/g)];
  assert.ok(marks.length >= 2, `プロバイダ分岐の抽出に失敗 (${marks.length} 件)`);
  const found = marks
    .filter((m, i) => {
      const from = m.index;
      const to = i + 1 < marks.length ? marks[i + 1].index : src.length;
      return /tier\.background/.test(src.slice(from, to));
    })
    .map((m) => m[1]);
  assert.deepEqual([...new Set(found)], ASYNC_PROVIDERS,
    'ASYNC_PROVIDERS と buildRequest の実装がずれている');
});

// ---- 課金の門 ----

test('enabled:false の階層を呼ぶと例外になる（課金の門）', () => {
  // CLAUDE.md「課金の扱い」: false の階層を呼ぶと即エラー終了する。この門を迂回しない。
  // 実測: この門を撤去しても既存テストは1件も落ちなかったので、throw を直接確かめる。
  const c = structuredClone(config);
  c.providers.gemini.tiers.review.enabled = false;
  assert.throws(() => resolveTier('gemini:review', c), /enabled:false/,
    'enabled:false の階層が通ってしまう。意図しない課金を防げない');
});

test('有効な階層は解決できる', () => {
  assert.doesNotThrow(() => resolveTier('gemini:review', config));
  const r = resolveTier('gemini:review', config);
  assert.equal(r.providerName, 'gemini');
  assert.equal(r.tierName, 'review');
  assert.ok(r.tier.model);
});

test('未知のプロバイダ・階層は例外になる', () => {
  assert.throws(() => resolveTier('nope:review', config), /未知のプロバイダ/);
  assert.throws(() => resolveTier('gemini:nope', config), /階層 nope はありません/);
  assert.throws(() => resolveTier('gemini', config), /provider:tier の形/);
});

// ---- コスト計算 ----

test('実コストは実測トークンと単価から算出される', () => {
  // gemini:propose は in $0.75 / out $3.75 per 1M
  const tier = config.providers.gemini.tiers.propose;
  assert.equal(computeCost(tier, { input_tokens: 1000000, output_tokens: 0 }), 0.75);
  assert.equal(computeCost(tier, { input_tokens: 0, output_tokens: 1000000 }), 3.75);
  // Issue #10 の実測値で検算（2,302 in / 4,861 out → $0.019955）
  assert.equal(computeCost(tier, { input_tokens: 2302, output_tokens: 4861 }), 0.019955);
});

test('価格が無い階層はコスト0になる（表示の破綻を防ぐ）', () => {
  assert.equal(computeCost({}, { input_tokens: 100, output_tokens: 100 }), 0);
});

// ---- ドライラン（SKILL.md 絶対規則6） ----
//
// 実測: LOOP_DRY_RUN=1 でも main() が --out と <out>.meta.json を上書きしていた。
// 既にある成果物がプレースホルダに、既にある *.meta.json が cost_usd: 0 に置き換わる。
// 実リポジトリに対してドライランする運用（docs/SETUP.md の動作確認）があるので、
// これは成果物とコスト記録の破壊になる。CLI をサブプロセスで実行して実際の挙動を見る。

test('LOOP_DRY_RUN=1 は既存ファイルを上書きしない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-dry-'));
  try {
    const inFile = join(dir, 'in.md');
    const outFile = join(dir, 'out.md');
    const metaFile = `${outFile}.meta.json`;
    writeFileSync(inFile, 'ping\n', 'utf8');
    writeFileSync(outFile, '本物の成果物\n', 'utf8');
    writeFileSync(metaFile, '{"cost_usd":0.5}\n', 'utf8');

    const r = spawnSync(process.execPath, [
      resolve(ROOT, 'loop/bin/ask-llm.mjs'),
      '--spec', 'gemini:propose', '--input', inFile, '--out', outFile,
    ], { encoding: 'utf8', env: { ...process.env, LOOP_DRY_RUN: '1' } });

    assert.equal(r.status, 0, `ドライランが失敗した: ${r.stderr}`);
    assert.equal(readFileSync(outFile, 'utf8'), '本物の成果物\n',
      'ドライランが成果物を上書きした');
    assert.equal(readFileSync(metaFile, 'utf8'), '{"cost_usd":0.5}\n',
      'ドライランが *.meta.json を上書きした。実コストの記録が消える');
    assert.match(r.stderr, /dry-run/, 'ドライランであることを出力していない');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('LOOP_DRY_RUN=1 では他社LLMを呼ばない', () => {
  // 呼んでしまうと課金が発生する。curl を PATH から外した状態でも成功することで確認する。
  const dir = mkdtempSync(join(tmpdir(), 'loop-dry2-'));
  try {
    const inFile = join(dir, 'in.md');
    writeFileSync(inFile, 'ping\n', 'utf8');
    const r = spawnSync(process.execPath, [
      resolve(ROOT, 'loop/bin/ask-llm.mjs'),
      '--spec', 'gemini:propose', '--input', inFile, '--out', join(dir, 'out.md'),
    ], { encoding: 'utf8', env: { ...process.env, LOOP_DRY_RUN: '1', PATH: dir } });
    assert.equal(r.status, 0,
      `curl が無い環境でドライランが失敗した = 実際に呼びに行っている: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
