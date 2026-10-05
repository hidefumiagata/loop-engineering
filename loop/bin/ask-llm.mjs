#!/usr/bin/env node
// 他社LLM（Gemini / OpenAI）を REST で単発呼び出しするアダプタ。
//
//   node loop/bin/ask-llm.mjs --provider gemini --tier review \
//        --system loop/prompts/roles/reviewer.md --input packet.md \
//        --schema verdict --out journal/003-review.json
//
// 設計上の約束:
//  * 認証ヘッダは原則送らない。Claude Cloud のエージェントプロキシが付与する。
//    ローカル開発時のみ、対応する環境変数があれば自分で付ける。
//  * tiers.<tier>.enabled が false の階層は即エラー終了する（誤課金の防止）。
//  * 実測トークン数から実コストを計算し、stderr と <out>.meta.json に出す。
//  * 429/5xx は指数バックオフで再試行し、最終失敗は非ゼロ終了する。
//    呼び出し側（SKILL.md）がフォールバックを判断する。

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { toGeminiSchema, toOpenAIFormat, SCHEMA_NAMES } from './schemas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = resolve(HERE, '..', 'config.json');

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

export function loadConfig(path = CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** "gemini:review" または {provider,tier} を正規化して解決する */
export function resolveTier(spec, config = loadConfig()) {
  const [providerName, tierName] = typeof spec === 'string'
    ? spec.split(':')
    : [spec.provider, spec.tier];
  if (!providerName || !tierName) {
    throw new Error(`provider:tier の形で指定してください (received: ${JSON.stringify(spec)})`);
  }
  const provider = config.providers?.[providerName];
  if (!provider) throw new Error(`未知のプロバイダ: ${providerName}`);
  const tier = provider.tiers?.[tierName];
  if (!tier) {
    throw new Error(`プロバイダ ${providerName} に階層 ${tierName} はありません (有効: ${Object.keys(provider.tiers).join(', ')})`);
  }
  if (tier.enabled !== true) {
    throw new Error(
      `${providerName}:${tierName} は enabled:false です。意図した課金でなければ呼び出し側の設定が誤っています。`
      + ` 有効化するには loop/config.json の providers.${providerName}.tiers.${tierName}.enabled を true にしてください。`,
    );
  }
  return { providerName, tierName, provider, tier };
}

/** `background: true` を実装しているプロバイダ。buildRequest がこれしか見ていない */
export const ASYNC_PROVIDERS = ['openai'];

/** 同期呼び出しが約30秒のプロキシ制限内に返しきれる上限 */
export const SYNC_MAX_OUTPUT_TOKENS = 8000;

/**
 * 出力上限を決める。**階層ごとの制約なので config が正。** 純関数。
 *
 * 同期呼び出し（background 無し）はエージェントプロキシの約30秒制限内に返しきる必要があり、
 * 上限を上げると 502 になる（実測: Issue #25 で gemini:propose が 16000 で止まった）。
 * 非同期（background: true）はポーリングで取るので上げてよい
 * （実測: Issue #10 で openai:propose が 8000 では打ち切られた）。
 * この非対称を散文で管理すると必ずずれるので、ここ1箇所で解決する。
 *
 * @param {string|{provider:string,tier:string}} spec
 * @param {object} [config]
 * @param {number|null} [override] 明示指定があればそれを使う（一時的な上書き用）
 */
export function resolveMaxOutputTokens(spec, config = loadConfig(), override = null) {
  if (override != null) return Number(override);
  const { tier } = resolveTier(spec, config);
  return tier.max_output_tokens ?? SYNC_MAX_OUTPUT_TOKENS;
}

/** 実測トークン数から USD を算出 */
export function computeCost(tier, usage) {
  const p = tier.price_per_mtok ?? { in: 0, out: 0 };
  const cost = (usage.input_tokens * p.in + usage.output_tokens * p.out) / 1000000;
  return Math.round(cost * 1e6) / 1e6;
}

function authHeaders(provider) {
  // ローカル開発時だけ自分で認証する。クラウドでは未設定なのでプロキシ経路になる。
  const key = provider.auth?.local_env ? process.env[provider.auth.local_env] : undefined;
  if (!key) return { headers: {}, mode: 'proxy' };
  const { header, prefix } = provider.auth;
  return { headers: { [header]: prefix ? `${prefix} ${key}` : key }, mode: 'local-env' };
}

function buildRequest({ providerName, provider, tier, system, input, schema, maxOutputTokens }) {
  const url = provider.endpoint.replace('{model}', tier.model);

  if (providerName === 'gemini') {
    const generationConfig = { maxOutputTokens, temperature: tier.temperature ?? 0.3 };
    if (schema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = toGeminiSchema(schema);
    }
    return {
      url,
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig,
      },
    };
  }

  if (providerName === 'openai') {
    const body = {
      model: tier.model,
      instructions: system,
      input: [{ role: 'user', content: [{ type: 'input_text', text: input }] }],
      max_output_tokens: maxOutputTokens,
    };
    if (tier.reasoning_effort) body.reasoning = { effort: tier.reasoning_effort };
    if (schema) body.text = { format: toOpenAIFormat(schema) };
    // 長い生成はエージェントプロキシの約30秒の壁に当たり 502 "upstream request failed" になる。
    // background なら POST は即座に返り、あとは短い GET のポーリングで取りに行けるので壁を越えられる。
    if (tier.background) { body.background = true; body.store = true; }
    return { url, body };
  }

  throw new Error(`リクエスト構築が未実装のプロバイダ: ${providerName}`);
}

function extractGemini(json) {
  const cand = json.candidates?.[0];
  if (!cand) throw new Error(`Gemini が候補を返しませんでした: ${JSON.stringify(json).slice(0, 400)}`);
  if (cand.finishReason && !['STOP', 'MAX_TOKENS'].includes(cand.finishReason)) {
    throw new Error(`Gemini が異常終了しました finishReason=${cand.finishReason}`);
  }
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const u = json.usageMetadata ?? {};
  return {
    text,
    truncated: cand.finishReason === 'MAX_TOKENS',
    usage: {
      input_tokens: u.promptTokenCount ?? 0,
      output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    },
  };
}

function extractOpenAI(json) {
  if (json.status === 'incomplete') {
    throw new Error(`OpenAI の応答が途中で打ち切られました reason=${json.incomplete_details?.reason}。max_output_tokens を増やしてください。`);
  }
  const chunks = [];
  for (const item of json.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === 'output_text' && typeof c.text === 'string') chunks.push(c.text);
    }
  }
  if (chunks.length === 0) {
    throw new Error(`OpenAI がテキストを返しませんでした: ${JSON.stringify(json).slice(0, 400)}`);
  }
  const u = json.usage ?? {};
  return {
    text: chunks.join(''),
    truncated: false,
    usage: { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0 },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HTTP POST を curl で行う。
 *
 * ★ Node の fetch を使ってはならない。
 *   Claude Cloud のサンドボックスは HTTPS_PROXY 環境変数でエージェントプロキシを指しており、
 *   API credential のキーはそのプロキシがリクエストに付与する。
 *   ところが Node の fetch(undici) は HTTPS_PROXY を既定で無視するため、
 *   プロキシを素通りしてキーの付かないリクエストがプロバイダに届く。
 *   （env proxy を見る NODE_USE_ENV_PROXY は Node 24 以降。サンドボックスは Node 22。）
 *   実測: 同一リクエストが curl では 200、Node fetch では 403/401 になった。
 *   curl は HTTPS_PROXY を尊重するので、転送は curl に一本化する。
 *
 * 認証ヘッダは argv ではなく -K の設定ファイルで渡し、プロセス一覧にキーが出ないようにする
 * （クラウドではそもそも送らないが、ローカル開発で環境変数のキーを使うときのため）。
 */
export function curlPostJson(url, { headers = {}, body = '', timeoutSec = 180, method = 'POST' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'loop-llm-'));
  const reqFile = join(dir, 'request.json');
  const resFile = join(dir, 'response.body');
  const hdrFile = join(dir, 'response.headers');
  const cfgFile = join(dir, 'curl.conf');

  try {
    writeFileSync(reqFile, body, 'utf8');
    // ヘッダは設定ファイル経由。値に " が含まれる場合に備えてエスケープする。
    writeFileSync(
      cfgFile,
      Object.entries(headers).map(([k, v]) => `header = "${k}: ${String(v).replace(/"/g, '\\"')}"`).join('\n') + '\n',
      'utf8',
    );

    // --fail 系は付けない。HTTP エラーは -w のステータスで判定し、本文も読みたいため。
    // こうしておくと curl の終了コードが非ゼロなのは本当の転送エラーのときだけになる。
    const args = [
      '-sS', '-X', method, url,
      '-K', cfgFile,
      '-o', resFile, '-D', hdrFile,
      '-w', '%{http_code}',
      '--max-time', String(timeoutSec),
    ];
    if (method !== 'GET') args.push('--data-binary', `@${reqFile}`);

    let statusText = '';
    try {
      statusText = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 1 << 20, windowsHide: true });
    } catch (e) {
      const why = [e.stderr, e.message].filter(Boolean).join(' ').trim();
      throw new Error(`curl の実行に失敗しました: ${why || '原因不明'}`);
    }
    if (!/^\d{3}$/.test(statusText.trim())) {
      throw new Error(`curl がステータスコードを返しませんでした: ${statusText.slice(0, 200)}`);
    }

    const status = Number(statusText.trim());
    const text = readFileSync(resFile, 'utf8');
    const raw = readFileSync(hdrFile, 'utf8');

    const map = new Map();
    for (const line of raw.split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) map.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status >= 400 ? 'Error' : 'OK',
      headers: { get: (k) => map.get(String(k).toLowerCase()) ?? null },
      text,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * OpenAI の background レスポンスが終わるまで短い GET を繰り返す。
 *
 * なぜ必要か:
 *   エージェントプロキシは1リクエストあたり約30秒で諦め、
 *   502 "upstream request failed" を返す（実測。gpt-5.2 も gpt-5.5 も同じ30秒で落ちた）。
 *   提案の生成は数千トークンかかるので同期リクエストでは原理的に収まらない。
 *   background なら POST が即座に返り、以降は1回数百ミリ秒の GET で済むため壁を越えられる。
 */
export async function pollOpenAIBackground(provider, created, { log, maxWaitSec = 420, intervalSec = 5 } = {}) {
  const url = `${provider.endpoint.replace(/\/$/, '')}/${created.id}`;
  const { headers } = authHeaders(provider);
  const deadline = Date.now() + maxWaitSec * 1000;
  let last = created.status;

  log(`[background] ${created.id} を投入しました。完了まで最大 ${maxWaitSec} 秒ポーリングします。`);

  while (Date.now() < deadline) {
    await sleep(intervalSec * 1000);
    const res = curlPostJson(url, { method: 'GET', headers, timeoutSec: 30 });
    if (!res.ok) {
      // ポーリング自体の一時的な失敗は致命ではない。期限まで続ける。
      log(`[background] ポーリングが HTTP ${res.status} を返しました。続行します。`);
      continue;
    }
    let json;
    try { json = JSON.parse(res.text); } catch { continue; }

    if (json.status !== last) { log(`[background] status=${json.status}`); last = json.status; }
    if (['completed', 'incomplete'].includes(json.status)) return json;
    if (['failed', 'cancelled'].includes(json.status)) {
      throw new Error(`OpenAI の background 実行が ${json.status} になりました: ${JSON.stringify(json.error ?? {}).slice(0, 300)}`);
    }
  }
  throw new Error(
    `OpenAI の background 実行が ${maxWaitSec} 秒以内に完了しませんでした (id=${created.id}, 最後の status=${last})。`
    + ' --max-wait を延ばすか、max_output_tokens を減らしてください。',
  );
}

/**
 * 設定起因の失敗を切り分けて、人間が見るべき画面を名指しする診断文を返す。
 * 直らないものだけを返す（再試行の価値があるエラーには null を返す）。
 *
 * 403 には性質の違う3種類があり、区別しないと間違った設定画面を見に行くことになる。
 *   1. Anthropic プロキシがホストを許可していない → x-deny-reason が付く
 *   2. プロバイダに到達したがキーが付いていない   → 「身元不明の呼び出し元」系のエラー本文
 *   3. キーは届いたが無効                         → 「キーが正しくない」系のエラー本文
 * 初回の実運用では 2 が起き、エラー本文だけでは 1 と区別できず原因究明が遠回りになった。
 */
export function diagnose(res, bodyText, provider, authMode) {
  const deny = res.headers.get('x-deny-reason');
  if (deny) {
    return `[診断] x-deny-reason=${deny} — リクエストが Anthropic のプロキシでブロックされ、`
      + 'プロバイダに届いていません。loop-env の Network access（Full か、該当ホストを含む Custom）を確認してください。';
  }
  // モデル名が存在しない。資料や記憶から書くと外れるので、プロバイダ自身に聞かせる。
  if (res.status === 404 || /is not found for API version|model.*does not exist|unknown model/i.test(bodyText)) {
    return '[診断] 指定したモデルがプロバイダに存在しません。'
      + '`node loop/bin/doctor.mjs --models` を実行すると実際に使えるモデル名が一覧されるので、'
      + 'そこから選んで loop/config.json の providers.*.tiers.*.model を直してください。'
      + '推測で書き直すと同じ失敗を繰り返します。';
  }

  if (res.status !== 401 && res.status !== 403) return null;

  const body = bodyText.toLowerCase();
  const header = provider.auth?.header ?? '(未設定)';
  const where = authMode === 'local-env'
    ? `ローカル環境変数 ${provider.auth?.local_env} の値`
    : 'loop-env の API credentials';

  // キーが1つも届いていない
  const missing = [
    'unregistered callers',          // Google: Method doesn't allow unregistered callers
    'without established identity',
    'missing bearer',                // OpenAI
    'you didn\'t provide an api key',
    'no api key provided',
    'api key not found',
  ];
  if (missing.some((s) => body.includes(s))) {
    return `[診断] 認証情報がプロキシで付与されていません。リクエストはプロバイダに到達していますが、`
      + `キーが付いていません（ネットワーク設定は正常です）。${where} に、このホスト宛の credential が`
      + `登録されているか確認してください。ヘッダ名は "${header}" である必要があります。`
      + '（環境を作成したあと、もう一度開かないと API credentials 欄は現れません。'
      + '一覧で "Not sent" になっている場合はその下の注記に理由が書かれています。）'
      + ' 切り分けには node loop/bin/doctor.mjs を使ってください。';
  }

  // キーは届いたが無効
  const invalid = [
    'api key not valid', 'api_key_invalid', 'invalid api key',
    'incorrect api key', 'invalid_api_key', 'unauthorized',
  ];
  if (invalid.some((s) => body.includes(s))) {
    const prefixHint = provider.auth?.prefix === ''
      ? ` このプロバイダはキーの生値を "${header}" で受け取ります。credential の Custom header の Prefix が`
        + '**空**になっているか確認してください（"Bearer" が残っていると失敗します）。'
      : '';
    return `[診断] 認証情報が拒否されました。キーはプロバイダに届いていますが受け付けられていません。`
      + `${where} のキーが有効か、期限切れでないかを確認してください。${prefixHint}`;
  }

  return `[診断] HTTP ${res.status} の認可エラーです。${where} とプロバイダ側の権限設定を確認してください。`;
}

export async function askLLM({
  spec, system, input, schema = null, maxOutputTokens = null, maxWaitSec = 420,
  config = loadConfig(), log = (m) => process.stderr.write(m + '\n'),
}) {
  if (schema && !SCHEMA_NAMES.includes(schema)) {
    throw new Error(`未知のスキーマ: ${schema} (有効: ${SCHEMA_NAMES.join(', ')})`);
  }
  const { providerName, tierName, provider, tier } = resolveTier(spec, config);
  maxOutputTokens = resolveMaxOutputTokens(spec, config, maxOutputTokens);
  const { url, body } = buildRequest({ providerName, provider, tier, system, input, schema, maxOutputTokens });
  const { headers, mode } = authHeaders(provider);

  if (process.env.LOOP_DRY_RUN === '1') {
    log(`[dry-run] ${providerName}:${tierName} (${tier.model}) auth=${mode} schema=${schema ?? 'none'} input=${input.length}chars`);
    return {
      dryRun: true, providerName, tierName, model: tier.model,
      text: schema ? '{}' : '(dry-run: 本文は生成されていません)',
      parsed: schema ? {} : null,
      usage: { input_tokens: 0, output_tokens: 0 }, cost_usd: 0,
    };
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    const startedAt = Date.now();
    try {
      res = curlPostJson(url, {
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = new Error(`ネットワークエラー: ${e.message}`);
      if (attempt === MAX_ATTEMPTS) break;
      const wait = 2 ** attempt * 1000;
      log(`[retry ${attempt}/${MAX_ATTEMPTS - 1}] ${lastErr.message} — ${wait}ms 待機`);
      await sleep(wait);
      continue;
    }

    if (res.ok) {
      let json;
      try {
        json = JSON.parse(res.text);
      } catch {
        throw new Error(`${providerName}:${tierName} が JSON を返しませんでした。先頭200文字: ${res.text.slice(0, 200)}`);
      }
      // background で投げた場合、POST は {id, status:"queued"} を即返すだけ。本体はポーリングで取る。
      if (providerName === 'openai' && tier.background && json.id && !json.output?.length) {
        json = await pollOpenAIBackground(provider, json, { log, maxWaitSec: maxWaitSec });
      }

      const out = providerName === 'gemini' ? extractGemini(json) : extractOpenAI(json);
      const cost = computeCost(tier, out.usage);
      let parsed = null;
      if (schema) {
        try {
          parsed = JSON.parse(out.text);
        } catch {
          throw new Error(`${providerName}:${tierName} が構造化出力を返しませんでした。先頭200文字: ${out.text.slice(0, 200)}`);
        }
      }
      log(`[cost] ${providerName}:${tierName} ${tier.model} in=${out.usage.input_tokens} out=${out.usage.output_tokens} = USD ${cost.toFixed(4)} (auth=${mode})`);
      if (out.truncated) log(`[warn] 出力が maxOutputTokens(${maxOutputTokens}) で打ち切られた可能性があります`);
      return {
        providerName, tierName, model: tier.model, text: out.text, parsed,
        usage: out.usage, cost_usd: cost, truncated: out.truncated,
      };
    }

    const bodyText = res.text ?? '';
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    // 所要時間は 502/504 の切り分けに効く。長考がゲートウェイのタイムアウトに
    // 当たっているのか、即座に蹴られているのかはこの数字でしか分からない。
    lastErr = new Error(`HTTP ${res.status} (${elapsed}秒): ${bodyText.slice(0, 500)}`);
    // 実測では 30 秒ちょうどで 502 "upstream request failed" が返った（プロキシ側のメッセージ）。
    if ((res.status === 502 || res.status === 504) && elapsed >= 25) {
      lastErr.message += `\n[診断] 応答までに ${elapsed} 秒かかってから ${res.status} になりました。`
        + 'エージェントプロキシは約30秒で諦めるため、長い生成は同期リクエストでは通りません。'
        + 'loop/config.json の該当階層に background: true を付けて非同期化してください。'
        + '（reasoning_effort を下げるだけでは、生成そのものが長い場合に足りません。'
        + 'background に対応していないプロバイダなら max_output_tokens を減らすしかありません。）';
    }

    const diag = diagnose(res, bodyText, provider, mode);
    if (diag) {
      lastErr.message += `\n${diag}`;
      break;   // 設定起因なので再試行しても直らない
    }
    if (!RETRY_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) break;

    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    log(`[retry ${attempt}/${MAX_ATTEMPTS - 1}] HTTP ${res.status} — ${wait}ms 待機`);
    await sleep(wait);
  }
  throw lastErr;
}

// ---------------- CLI ----------------

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`想定外の引数: ${a}`);
    const key = a.slice(2).replace(/-/g, '_');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; continue; }
    out[key] = next; i++;
  }
  return out;
}

const USAGE = [
  '使い方:',
  '  node loop/bin/ask-llm.mjs --provider <gemini|openai> --tier <tier> \\',
  '      [--system <file>] --input <file> [--schema <' + SCHEMA_NAMES.join('|') + '>] \\',
  '      [--max-output-tokens <n>] --out <file>',
  '',
  '  --max-output-tokens は通常渡さない。既定は config の tiers.*.max_output_tokens。',
  '  同期階層（background 無し）で上げるとプロキシの約30秒制限に当たって 502 になる。',
  '',
  '  --provider/--tier の代わりに --spec gemini:review と書いてもよい。',
  '  --schema を省くとプレーンテキスト（提案文など）として扱う。',
  '  --out に書くと同じ場所に <out>.meta.json（モデル・トークン・コスト）も出力する。',
  '  LOOP_DRY_RUN=1 でネットワークを使わず送信内容だけ表示する。',
].join('\n');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) { console.log(USAGE); return; }

  const spec = args.spec ?? (args.provider && args.tier ? `${args.provider}:${args.tier}` : null);
  if (!spec) throw new Error(`--provider と --tier（または --spec）は必須です\n\n${USAGE}`);
  if (!args.input) throw new Error(`--input は必須です\n\n${USAGE}`);
  if (!args.out) throw new Error(`--out は必須です\n\n${USAGE}`);

  const system = args.system ? readFileSync(args.system, 'utf8') : 'あなたは厳密で簡潔なアシスタントです。';
  const input = readFileSync(args.input, 'utf8');
  const schema = typeof args.schema === 'string' ? args.schema : null;
  // 既定は config の tier.max_output_tokens（askLLM が解決する）。
  // --max-output-tokens は一時的な上書き用で、通常は渡さない。
  const maxOutputTokens = args.max_output_tokens ? Number(args.max_output_tokens) : null;
  const maxWaitSec = args.max_wait ? Number(args.max_wait) : 420;

  const r = await askLLM({ spec, system, input, schema, maxOutputTokens, maxWaitSec });

  // ★ ドライランでは一切書き込まない。
  //   ここで書くと、既にある成果物がプレースホルダに、既にある *.meta.json が
  //   cost_usd: 0 に置き換わる。実リポジトリに対してドライランする運用があるため
  //   （docs/SETUP.md の動作確認）、これは成果物とコスト記録の破壊になる。
  //   SKILL.md の絶対規則6（DRY では書き込まない）と禁止事項（*.meta.json を編集しない）の両方に反する。
  if (r.dryRun) {
    process.stderr.write(`[dry-run] 書き込む予定: ${args.out} と ${args.out}.meta.json（実行しません）\n`);
    return;
  }

  writeFileSync(args.out, schema ? JSON.stringify(r.parsed, null, 2) + '\n' : r.text, 'utf8');
  writeFileSync(`${args.out}.meta.json`, JSON.stringify({
    provider: r.providerName, tier: r.tierName, model: r.model,
    schema, usage: r.usage, cost_usd: r.cost_usd,
    truncated: r.truncated ?? false, dry_run: r.dryRun ?? false,
    at: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8');
  process.stderr.write(`[ok] ${args.out} に書き込みました\n`);
}

if (process.argv[1]?.endsWith('ask-llm.mjs')) {
  main().catch((e) => { process.stderr.write(`[error] ${e.message}\n`); process.exit(1); });
}
