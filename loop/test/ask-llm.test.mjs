// ask-llm.mjs の純関数テスト。
//   node --test loop/test/ask-llm.test.mjs
//
// ここは「文章にそう書いてあるか」ではなく「実際にそう振る舞うか」を見る。
// 文章マッチだけだと、コメントが正規表現に一致して本体の退行を見逃す。
// 実測: 出力上限の解決を `?? 16000` に書き換えても、コメントが一致するため
// wiring テストは通ってしまった（Issue #25 の修正本体が無検証だった）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolveTier, resolveMaxOutputTokens, computeCost, extractGemini,
  ASYNC_PROVIDERS, STREAM_PROVIDERS, SYNC_MAX_OUTPUT_TOKENS, buildRequest, parseGeminiSSE,
} from '../bin/ask-llm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = JSON.parse(readFileSync(resolve(ROOT, 'loop/config.json'), 'utf8'));

// ---- 出力上限（Issue #25 の再発防止の本体） ----

test('出力上限は config の階層設定から解決される', () => {
  // ストリーミング階層。最初のチャンクでヘッダが返るので30秒の壁に当たらない
  assert.equal(resolveMaxOutputTokens('gemini:propose', config), 16000);
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

test('非ストリーミングの同期階層は上限を上げていない', () => {
  // プロキシは最初のバイトを約30秒待って届かないと 502 を返す。非ストリーミングの同期呼び出しは
  // 全文を生成し終えるまで最初のバイトが返らないので、長い生成は原理的に通らない。
  // background を実装しているのは openai だけ、stream を実装しているのは gemini だけ
  // （buildRequest が他を見ない）。例外を認めるのは実装のある組み合わせだけ。
  // enabled:false の階層は resolveTier が投げるので、config の値を直接見る。
  for (const [pname, provider] of Object.entries(config.providers)) {
    for (const [tname, tier] of Object.entries(provider.tiers)) {
      if (ASYNC_PROVIDERS.includes(pname) && tier.background === true) continue;
      if (STREAM_PROVIDERS.includes(pname) && tier.stream === true) continue;
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

// ---- 空の応答を成功として返さない（Issue #25 / #32 の調査で見つけた潜在バグ） ----
//
// gemini-3.8-flash は thinking がデフォルト有効で、思考トークンは maxOutputTokens に
// 算入される（公式ドキュメント記載）。つまり思考が予算を食い切ると
// finishReason=MAX_TOKENS かつ本文が空になりうる。
// 以前はこれを正常系として返していたため、空の proposals/*.md が合議に入る余地があった。

const geminiResponse = ({ text = 'ok', finishReason = 'STOP', thoughts = 0, candidates = 10 } = {}) => ({
  candidates: [{ finishReason, content: { parts: text === null ? [] : [{ text }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: candidates, thoughtsTokenCount: thoughts },
});

test('本文が空なら例外になる（MAX_TOKENS で思考が予算を食い切った場合）', () => {
  assert.throws(
    () => extractGemini(geminiResponse({ text: '', finishReason: 'MAX_TOKENS', thoughts: 8000, candidates: 0 })),
    /空の応答/,
    '空の提案文が成果物として書かれてしまう',
  );
  // 原因が分かるメッセージになっていること
  try {
    extractGemini(geminiResponse({ text: '', finishReason: 'MAX_TOKENS', thoughts: 8000, candidates: 0 }));
  } catch (e) {
    assert.match(e.message, /思考トークン 8000/, '思考トークン数が出ない');
    assert.match(e.message, /max_output_tokens/, '対処が示されていない');
  }
});

test('空白だけの本文も例外になる', () => {
  assert.throws(() => extractGemini(geminiResponse({ text: '   \n\n  ' })), /空の応答/);
});

test('parts が空でも例外になる', () => {
  assert.throws(() => extractGemini(geminiResponse({ text: null })), /空の応答/);
});

test('本文があれば MAX_TOKENS でも成功として返す（truncated フラグ付き）', () => {
  // 途中まで書けているなら呼び出し側が判断できる。ここで落とすと復旧できない
  const r = extractGemini(geminiResponse({ text: '途中まで書けた本文', finishReason: 'MAX_TOKENS' }));
  assert.equal(r.truncated, true);
  assert.equal(r.text, '途中まで書けた本文');
});

test('思考トークンを本文トークンと分けて記録する', () => {
  // 以前は合算しか残らず、生成時間の主因（思考量）が見えなかった
  const r = extractGemini(geminiResponse({ candidates: 4000, thoughts: 1914 }));
  assert.equal(r.usage.candidates_tokens, 4000);
  assert.equal(r.usage.thoughts_tokens, 1914);
  // 価格は思考分も課金対象なので、合算が output_tokens であること
  assert.equal(r.usage.output_tokens, 5914);
});

test('includeThoughts の思考 part は本文に入れない', () => {
  const r = extractGemini({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '考え中…', thought: true }, { text: '本文' }] } }],
    usageMetadata: {},
  });
  assert.equal(r.text, '本文');
});

test('異常終了は従来どおり例外', () => {
  assert.throws(() => extractGemini(geminiResponse({ finishReason: 'SAFETY' })), /異常終了/);
  assert.throws(() => extractGemini({ candidates: [] }), /候補を返しませんでした/);
});

// ---- 30秒型の 502 を再試行しない ----

test('長い生成が原因の 502 は再試行しない方針が実装にある', () => {
  // 実測: 同一 run 内の再試行は 20 試行すべて失敗し、通ったのは次の run（約7時間後）。
  // 1 invocation に約138秒かけても成功機構が無い。
  const src = readFileSync(resolve(ROOT, 'loop/bin/ask-llm.mjs'), 'utf8');
  assert.match(src, /const slowGateway =/, 'slowGateway の判定が無い');
  assert.match(src, /if \(slowGateway\) break;/,
    '30秒型の 502 で break していない。再試行して run を無駄にする');
  // 診断だけ出して再試行に落ちる、という以前の形に戻っていないこと
  const idxDiag = src.indexOf('const slowGateway =');
  const idxBreak = src.indexOf('if (slowGateway) break;');
  assert.ok(idxDiag > 0 && idxBreak > idxDiag, 'slowGateway の判定が break より後にある');
});

test('失敗時にも機械可読な記録を残す', () => {
  // これが無かったので、20回の 502 について機械の記録がゼロだった。
  // 残っていたのは Claude が書いた散文の journal だけで、そこに
  // 「存在しなかった設定値」が書かれて次の判断を誤らせた。
  const dir = mkdtempSync(join(tmpdir(), 'loop-err-'));
  try {
    const inFile = join(dir, 'in.md');
    const outFile = join(dir, 'out.md');
    writeFileSync(inFile, 'ping\n', 'utf8');

    // 不正な上限を渡して必ず失敗させる。ローカル（credential 無し）なら 403、
    // クラウド（プロキシがキーを付与する）なら生成前に 400 で弾かれるので課金も無い。
    // 以前は「ローカルには credential が無いので 403」を前提にしており、クラウドでは成功して落ちていた。
    const r = spawnSync(process.execPath, [
      resolve(ROOT, 'loop/bin/ask-llm.mjs'),
      '--spec', 'gemini:review', '--input', inFile, '--out', outFile, '--max-output-tokens', '-1',
    ], { encoding: 'utf8' });

    assert.notEqual(r.status, 0, '失敗するはずの呼び出しが成功した');
    const errFile = `${outFile}.error.json`;
    assert.ok(existsSync(errFile), `失敗の記録 ${errFile} が書かれていない`);

    const rec = JSON.parse(readFileSync(errFile, 'utf8'));
    for (const key of ['http_status', 'elapsed_sec', 'ttfb_sec', 'attempts', 'error', 'at']) {
      assert.ok(rec[key] !== undefined, `記録に ${key} が無い`);
    }
    assert.equal(typeof rec.elapsed_sec, 'number',
      'elapsed_sec が数値でない。壁が応答開始までか総所要かを判定できない');
    // 成果物は書かれていないこと（失敗したのに空ファイルを残さない）
    assert.ok(!existsSync(outFile), '失敗したのに成果物ファイルを書いている');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('成功時の meta に計測値が入る形になっている', () => {
  // 実際の成功は credential が無いと作れないので、書き出し側の形を見る。
  // meta を作っているオブジェクトリテラルの中に3つのキーがあることを確認する。
  const src = readFileSync(resolve(ROOT, 'loop/bin/ask-llm.mjs'), 'utf8');
  const at = src.indexOf('.meta.json`, JSON.stringify({');
  assert.ok(at > 0, 'meta の書き出し箇所が見つからない');
  const block = src.slice(at, src.indexOf('}, null, 2)', at));
  for (const key of ['elapsed_sec', 'ttfb_sec', 'stream', 'attempts', 'max_output_tokens']) {
    assert.match(block, new RegExp(`${key}:`), `meta の書き出しに ${key} が無い`);
  }
});

// ---- ストリーミング（30秒の壁は最初のバイトまでの制限。総所要ではない） ----
//
// 実測: 非ストリーミングは生成が30秒を越えると 30.4秒で 502。ストリーミングは
// 137〜182秒・1.1万〜1.4万トークンの生成が 7/7 成功した。

const req = (tier) => buildRequest({
  providerName: 'gemini', provider: config.providers.gemini, tier,
  system: 's', input: 'i', schema: null, maxOutputTokens: 100,
});

test('stream: true の Gemini 階層は SSE のエンドポイントに投げる', () => {
  const r = req({ model: 'm', stream: true });
  assert.equal(r.stream, true);
  assert.match(r.url, /\/models\/m:streamGenerateContent\?alt=sse$/);
  // 付けなければ従来どおり
  const plain = req({ model: 'm' });
  assert.ok(!plain.stream);
  assert.match(plain.url, /\/models\/m:generateContent$/);
});

test('gemini:propose はストリーミングで呼ぶ', () => {
  const t = config.providers.gemini.tiers.propose;
  assert.equal(t.stream, true, 'stream を外すと生成が30秒を越えた時点で 502 になる');
});

test('SSE のチャンクを1つの応答に畳む', () => {
  const sse = [
    'data: {"candidates":[{"content":{"parts":[{"text":"前半"}],"role":"model"}}]}',
    '',
    'data: {"candidates":[{"content":{"parts":[{"text":"後半"}],"role":"model"},"finishReason":"STOP"}],'
      + '"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":20,"thoughtsTokenCount":5}}',
    '',
  ].join('\r\n');
  const r = extractGemini(parseGeminiSSE(sse));
  assert.equal(r.text, '前半後半');
  assert.equal(r.truncated, false);
  assert.equal(r.usage.input_tokens, 10);
  assert.equal(r.usage.output_tokens, 25);
});

test('SSE の途中のエラーは例外になる（部分的な本文を成功にしない）', () => {
  const sse = 'data: {"candidates":[{"content":{"parts":[{"text":"途中"}]}}]}\n\n'
    + 'data: {"error":{"code":500,"message":"internal"}}\n\n';
  assert.throws(() => parseGeminiSSE(sse), /ストリームの途中でエラー/);
});

test('SSE が finishReason の前に途切れたら例外になる', () => {
  const sse = 'data: {"candidates":[{"content":{"parts":[{"text":"途中まで"}]}}]}\n\n';
  assert.throws(() => parseGeminiSSE(sse), /途切れました/);
});

test('SSE にイベントが無ければ例外になる', () => {
  assert.throws(() => parseGeminiSSE('upstream request failed'), /イベントが1つもありません/);
});
