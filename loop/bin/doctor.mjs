#!/usr/bin/env node
// 他社LLM が呼べないときの切り分けツール。
//
//   node loop/bin/doctor.mjs            疎通の切り分け
//   node loop/bin/doctor.mjs --models   各プロバイダで実際に使えるモデル名を列挙
//
// --models が要る理由:
//   config.json のモデル名を資料や記憶から書くと外れる。実際に
//   「models/gemini-3.1-pro is not found for API version v1beta」で合議が止まった。
//   プロバイダ自身に聞けば確実なので、推測で直さずここで列挙して選ぶ。
//
// 「credential を登録したのに 403 PERMISSION_DENIED が出る」状態には、
// 対処がまったく違う原因が複数ある。一覧画面からは header 名も Prefix も見えないため、
// 設定を当てずっぽうに変えても当たらない。ここで実際に測って切り分ける。
//
//   A. credential の設定が効いていない（ヘッダ名 / Prefix / ホスト指定）
//   B. リクエストがプロキシを経由していない
//      → Node の fetch（undici）は HTTPS_PROXY を既定で無視する。
//        curl は尊重する。両方で叩いて差が出れば B が確定する。
//   C. ネットワークそのものが通っていない（x-deny-reason が返る）
//
// ★ キーの値は絶対に出力しない。環境変数も「設定されているか」だけを見る。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveTier, askLLM } from './ask-llm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const line = (s = '') => process.stdout.write(s + '\n');

// 認証ヘッダを含みうるものは名前だけ出し、値は出さない
const PROXY_VARS = [
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy',
  'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy',
  'NODE_USE_ENV_PROXY', 'NODE_EXTRA_CA_CERTS',
];
const KEY_VARS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY'];

/** 最小のリクエストを組む。内容は何でもよく、認証が通るかだけを見る */
function probeBody(providerName) {
  if (providerName === 'gemini') {
    return { contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } };
  }
  return { model: 'gpt-5-mini', input: 'ping', max_output_tokens: 16 };
}

function classify(status, body) {
  const b = (body || '').toLowerCase();
  if (status >= 200 && status < 300) return 'OK — キーが付与され、認証も通った';
  if (/unregistered callers|without established identity|missing bearer|no api key provided/.test(b)) {
    return 'キー未付与 — リクエストは届いたがキーが付いていない';
  }
  if (/api key not valid|invalid api key|incorrect api key|api_key_invalid/.test(b)) {
    return 'キー無効 — キーは届いたが受け付けられない（ヘッダ名/Prefix/キー自体を疑う）';
  }
  if (/host_not_allowed|denied/.test(b)) return 'ネットワーク拒否 — プロキシでブロックされた';
  if (status === 429) return 'レート上限 — 認証自体は通っている可能性が高い';
  return `その他 (HTTP ${status})`;
}

async function viaFetch(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text, deny: res.headers.get('x-deny-reason') };
  } catch (e) {
    return { status: 0, body: `ネットワークエラー: ${e.message}`, deny: null };
  }
}

function viaCurl(url, body) {
  try {
    const out = execFileSync('curl', [
      '-sS', '-o', '-', '-w', '\n__HTTP_STATUS__%{http_code}',
      '-X', 'POST', url,
      '-H', 'content-type: application/json',
      '--data-binary', '@-',
      '--max-time', '30',
    ], { input: JSON.stringify(body), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const m = out.match(/\n__HTTP_STATUS__(\d+)$/);
    return { status: m ? Number(m[1]) : 0, body: m ? out.slice(0, m.index) : out };
  } catch (e) {
    return { status: 0, body: `curl 失敗: ${[e.stderr, e.message].filter(Boolean).join(' ')}` };
  }
}

/** GET を curl で行う。プロキシ経由でなければキーが付かないので fetch は使わない。 */
function curlGet(url) {
  try {
    const out = execFileSync('curl', [
      '-sS', url, '-w', '\n__HTTP_STATUS__%{http_code}', '--max-time', '30',
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const m = out.match(/\n__HTTP_STATUS__(\d+)$/);
    return { status: m ? Number(m[1]) : 0, body: m ? out.slice(0, m.index) : out };
  } catch (e) {
    return { status: 0, body: `curl 失敗: ${[e.stderr, e.message].filter(Boolean).join(' ')}` };
  }
}

/** 各プロバイダに「いま使えるモデル」を聞く。config.json のモデル名はここから選ぶ。 */
function listModels(config) {
  line('# 利用可能なモデル一覧');
  line('');
  line('config.json の providers.*.tiers.*.model はこの一覧から選ぶこと。');
  line('');

  for (const [name, provider] of Object.entries(config.providers)) {
    const host = new URL(provider.endpoint).origin;
    const url = name === 'gemini' ? `${host}/v1beta/models?pageSize=200` : `${host}/v1/models`;
    line(`## ${name}  (${url})`);

    const r = curlGet(url);
    if (r.status !== 200) {
      line(`  HTTP ${r.status} — ${(r.body || '').replace(/\s+/g, ' ').slice(0, 200)}`);
      line('');
      continue;
    }

    let ids = [];
    try {
      const json = JSON.parse(r.body);
      if (name === 'gemini') {
        ids = (json.models ?? [])
          // generateContent に対応しているものだけが ask-llm.mjs から使える
          .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
          .map((m) => String(m.name).replace(/^models\//, ''));
      } else {
        ids = (json.data ?? []).map((m) => m.id);
      }
    } catch {
      line(`  応答を JSON として解釈できませんでした: ${(r.body || '').slice(0, 200)}`);
      line('');
      continue;
    }

    // 生成用途に使いそうなものを先に出す。埋め込み・音声・画像などは末尾へ。
    const noise = /embed|tts|whisper|audio|image|dall-e|moderation|vision-preview|aqa|retrieval/i;
    const primary = ids.filter((i) => !noise.test(i)).sort();
    const rest = ids.filter((i) => noise.test(i)).sort();

    line(`  生成に使えそうなもの (${primary.length} 件):`);
    for (const i of primary) {
      const used = Object.entries(provider.tiers).filter(([, t]) => t.model === i).map(([k]) => k);
      line(`    ${i}${used.length ? `   ← いま ${used.join(', ')} 階層が指定` : ''}`);
    }
    if (rest.length) line(`  その他 (${rest.length} 件): ${rest.slice(0, 12).join(', ')}${rest.length > 12 ? ' …' : ''}`);

    // 設定済みのモデルが実在するかを明示的に突き合わせる
    line('');
    for (const [tierName, tier] of Object.entries(provider.tiers)) {
      const ok = ids.includes(tier.model);
      line(`  config ${name}:${tierName} = ${tier.model}  → ${ok ? '実在する' : '★この一覧に無い（404 の原因）'}`);
    }
    line('');
  }
  line('---');
  line('この出力にキーの値は含まれていません。そのまま貼って共有して構いません。');
}

/**
 * 本番と同じ長さの生成を n 回投げて、所要時間と 502 率を測る。
 *
 *   node loop/bin/doctor.mjs --latency [--spec gemini:propose] [--n 10] [--input <file>] [--no-stream]
 *
 * なぜ必要か:
 *   「約30秒の壁」に当たっているかどうかは、所要時間を測らないと分からない。
 *   organic な panel run を待つと1時間に1点しか取れず、しかも propose / revise の
 *   ときだけなので、「502 が出なかった」が効果なのか偶然なのかを区別できない。
 *   実際にそれで3回判断を誤った。ここで一度に複数点を取る。
 *
 * 判定の仕方:
 *   壁は「最初のバイトまで約30秒」で、総所要の制限ではない（実測で確定。ストリーミングで
 *   137〜182秒の生成が 7/7 成功した）。だから所要と最初のバイトまでの秒数を分けて出す。
 *   - 失敗の最初のバイトが30秒前後 → 壁に当たっている。非ストリーミングなら stream: true、
 *     ストリーミングなら thinking_level を下げる（思考中は1バイトも流れない）
 *   - 502 が0件なら、パラメータではなく時間相関の外部要因
 *
 *   ★ 以前の判定は非ストリーミングしか測らずに「成功が全て30秒未満なら総所要の制限が濃厚」と
 *     結論していた。非ストリーミングでは最初のバイト＝総所要なので、この観測からは両者を原理的に
 *     区別できない。--no-stream で旧方式と比較できるようにしてある。
 */
async function measureLatency(config) {
  const argOf = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
  };
  const spec = argOf('--spec', 'gemini:propose');
  const n = Math.max(1, Math.min(30, Number(argOf('--n', '6'))));
  const inputPath = argOf('--input', null);
  // 旧方式（非ストリーミング）との比較用。config は書き換えず、この測定の中だけで外す
  if (process.argv.includes('--no-stream')) {
    config = structuredClone(config);
    const [p, t] = spec.split(':');
    if (config.providers?.[p]?.tiers?.[t]) config.providers[p].tiers[t].stream = false;
  }

  // ★ ドライランでは測れない。LLM を呼ばないので所要0秒・502なしになり、
  //   「パラメータではなく外部要因」という誤った判定を出してしまう。
  if (process.env.LOOP_DRY_RUN === '1') {
    line('# 所要時間の実測');
    line('');
    line('LOOP_DRY_RUN=1 では測定できません（LLM を呼ばないため所要0秒になります）。');
    line('配線の確認だけなら以下が解決できていれば十分です:');
    const { tier: t } = resolveTier(spec, config);
    line(`  spec=${spec} → ${t.model} / max_output_tokens=${t.max_output_tokens ?? '(既定)'}`);
    line('実測するには LOOP_DRY_RUN を外して、credential のあるクラウドの run で実行してください。');
    return;
  }

  const { tier } = resolveTier(spec, config);
  const input = inputPath
    ? readFileSync(inputPath, 'utf8')
    // 本番の提案生成に近い長さの出力を要求する。入力が無いときの既定
    : 'あなたは技術的な提案を書きます。題材は「社内の勉強会を継続させる仕組み」です。\n'
      + '要旨・設計・トレードオフ・失敗モード・前提の5節で、本文 1200〜2500 語程度で書いてください。';
  const system = readFileSync(resolve(HERE, '..', 'prompts', 'roles', 'proposer.md'), 'utf8');

  line('# 所要時間の実測');
  line('');
  line(`spec: ${spec} (${tier.model})  n=${n}  入力 ${input.length} 文字`);
  line(`max_output_tokens: ${tier.max_output_tokens ?? '(既定)'}  stream: ${tier.stream === true}`
    + `  thinking_level: ${tier.thinking_level ?? '(既定)'}`);
  line('');
  line('| # | 結果 | 最初のバイト秒 | 所要秒 | out | thoughts | truncated | 備考 |');
  line('| --- | --- | --- | --- | --- | --- | --- | --- |');

  const rows = [];
  for (let i = 1; i <= n; i++) {
    const t0 = Date.now();
    try {
      const r = await askLLM({ spec, system, input, config, log: () => {} });
      const sec = r.elapsed_sec ?? Math.round((Date.now() - t0) / 1000);
      rows.push({ ok: true, sec, ttfb: r.ttfb_sec, out: r.usage.output_tokens, th: r.usage.thoughts_tokens, tr: r.truncated });
      line(`| ${i} | OK | ${r.ttfb_sec ?? '-'} | ${sec} | ${r.usage.output_tokens} | ${r.usage.thoughts_tokens ?? '-'} | ${r.truncated} | attempts=${r.attempts} |`);
    } catch (e) {
      const d = e.detail ?? {};
      const sec = d.elapsed_sec ?? Math.round((Date.now() - t0) / 1000);
      rows.push({ ok: false, sec, ttfb: d.ttfb_sec, status: d.http_status });
      line(`| ${i} | **失敗** | ${d.ttfb_sec ?? '-'} | ${sec} | - | - | - | HTTP ${d.http_status ?? '?'} ${String(e.message).split('\n')[0].slice(0, 60)} |`);
    }
  }

  const ok = rows.filter((r) => r.ok);
  // 時間の壁に当たった失敗だけを数える。403（credential）や 404（モデル名）は別問題で、
  // これを壁の判定に混ぜると「総所要の制限が濃厚」と誤読する
  const ng = rows.filter((r) => !r.ok && (r.status === 502 || r.status === 504) && r.sec >= 25);
  const other = rows.filter((r) => !r.ok && !ng.includes(r));
  const maxOk = ok.length ? Math.max(...ok.map((r) => r.sec)) : null;
  line('');
  line(`成功 ${ok.length}/${rows.length}  時間の壁による失敗 ${ng.length}/${rows.length}`
    + (other.length ? `  その他の失敗 ${other.length}/${rows.length}` : ''));
  if (ok.length) {
    line(`成功の所要: 最小 ${Math.min(...ok.map((r) => r.sec))}秒 / 最大 ${maxOk}秒`);
    const tt = ok.map((r) => r.ttfb).filter((v) => v != null);
    if (tt.length) line(`成功の最初のバイト: 最小 ${Math.min(...tt)}秒 / 最大 ${Math.max(...tt)}秒`);
  }
  if (ng.length) line(`壁による失敗の所要: 最小 ${Math.min(...ng.map((r) => r.sec))}秒 / 最大 ${Math.max(...ng.map((r) => r.sec))}秒`);
  line('');
  line('## 判定');
  if (other.length === rows.length) {
    line(`  全件が時間の壁とは別の理由で失敗している（HTTP ${[...new Set(other.map((r) => r.status))].join(', ')}）。`);
    line('  → 壁の判定はできない。まず node loop/bin/doctor.mjs（引数なし）で credential を切り分けること。');
  } else if (!ng.length && !ok.length) {
    line('  成功も壁による失敗も無い。測定不能。');
  } else if (!ng.length) {
    line('  時間の壁による失敗が0件。'
      + (maxOk != null && maxOk > 30 ? `30秒を超える成功（最大 ${maxOk} 秒）があり、壁が総所要の制限でないことと整合する。` : ''));
    line('  → 本番で 502 が出ているなら、*.error.json の ttfb_sec を見ること。'
      + '30秒前後なら壁、短ければプロキシかプロバイダ側の一時的な障害。');
  } else if (tier.stream) {
    line('  ストリーミングでも最初のバイトが約30秒届かずに落ちた回がある。思考中は1バイトも流れないため。');
    line('  → loop/config.json の該当階層の thinking_level を "low" にする（実測: 最初のバイトまで 1.9〜4.0秒）。');
  } else {
    line('  非ストリーミングでは全文を生成し終えるまで最初のバイトが返らないので、生成が30秒を越えると落ちる。');
    line('  （この観測だけでは総所要の制限と区別できないが、ストリーミングで30秒超の成功が実測済み）');
    line('  → loop/config.json の該当階層に stream: true を付ける（Gemini）か background: true を付ける（OpenAI）。');
  }
  line('');
  line('この出力にキーの値は含まれていません。そのまま貼って共有して構いません。');
}

async function main() {
  const config = loadConfig();

  if (process.argv.includes('--models')) { listModels(config); return; }
  if (process.argv.includes('--latency')) { await measureLatency(config); return; }

  line('# loop-engineering 疎通診断');
  line('');
  line(`node: ${process.version}`);
  line(`curl: ${(() => { try { return execFileSync('curl', ['--version'], { encoding: 'utf8' }).split('\n')[0]; } catch { return '(見つからない)'; } })()}`);
  line('');

  line('## プロキシ関連の環境変数（値は出さない）');
  for (const v of PROXY_VARS) {
    line(`  ${v.padEnd(22)} ${process.env[v] === undefined ? '未設定' : `設定あり (${process.env[v].length} 文字)`}`);
  }
  line('');
  line('## APIキーの環境変数（クラウドでは「未設定」が正常）');
  for (const v of KEY_VARS) {
    line(`  ${v.padEnd(22)} ${process.env[v] === undefined ? '未設定' : '★設定あり — クラウドでは credential を使うべき'}`);
  }
  line('');

  for (const [name, provider] of Object.entries(config.providers)) {
    // 有効な階層が1つでもあるプロバイダだけ試す
    const tierName = Object.keys(provider.tiers).find((t) => provider.tiers[t].enabled);
    if (!tierName) { line(`## ${name}: 有効な階層が無いので省略`); line(''); continue; }
    const url = provider.endpoint.replace('{model}', provider.tiers[tierName].model);
    const body = probeBody(name);

    line(`## ${name} (${tierName} / ${provider.tiers[tierName].model})`);
    line(`  ホスト: ${new URL(url).host}`);
    line(`  期待するヘッダ: ${provider.auth.header}${provider.auth.prefix ? ` (Prefix: "${provider.auth.prefix}")` : ' (Prefix: 空)'}`);
    line('');

    const f = await viaFetch(url, body);
    line(`  [node fetch] HTTP ${f.status}${f.deny ? ` x-deny-reason=${f.deny}` : ''}`);
    line(`               ${classify(f.status, f.body)}`);
    line(`               ${(f.body || '').replace(/\s+/g, ' ').slice(0, 220)}`);

    const c = viaCurl(url, body);
    line(`  [curl]       HTTP ${c.status}`);
    line(`               ${classify(c.status, c.body)}`);
    line(`               ${(c.body || '').replace(/\s+/g, ' ').slice(0, 220)}`);
    line('');

    // ここが切り分けの肝
    const fOk = f.status >= 200 && f.status < 300;
    const cOk = c.status >= 200 && c.status < 300;
    if (fOk && cOk) line('  → 判定: 両方とも通る。credential は正しく付与されている。');
    else if (!fOk && cOk) {
      line('  → 判定: **curl だけ通る。** プロキシが環境変数ベースで、Node の fetch がそれを無視している。');
      line('           ask-llm.mjs を curl 経由に切り替えるか、NODE_USE_ENV_PROXY=1 を設定する必要がある。');
    } else if (fOk && !cOk) {
      line('  → 判定: fetch だけ通る。curl 側の設定（プロキシ環境変数）が誤っている可能性。');
    } else {
      line('  → 判定: **両方とも通らない。** プロキシ経路の問題ではなく、credential の設定自体を疑う。');
      line('           loop-env の API credentials で、このホスト宛の credential の');
      line(`           ヘッダ名が "${provider.auth.header}"、Prefix が ${provider.auth.prefix ? `"${provider.auth.prefix}"` : '空'} になっているか確認する。`);
      line('           （値は保存後に表示できないため、疑わしければ削除して登録し直す）');
    }
    line('');
  }

  line('---');
  line('この出力にキーの値は含まれていません。そのまま貼って共有して構いません。');
}

main().catch((e) => { process.stderr.write(`[error] ${e.message}\n`); process.exit(1); });
