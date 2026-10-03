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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

export async function askLLM({
  spec, system, input, schema = null, maxOutputTokens = 16000,
  config = loadConfig(), log = (m) => process.stderr.write(m + '\n'),
}) {
  if (schema && !SCHEMA_NAMES.includes(schema)) {
    throw new Error(`未知のスキーマ: ${schema} (有効: ${SCHEMA_NAMES.join(', ')})`);
  }
  const { providerName, tierName, provider, tier } = resolveTier(spec, config);
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
    try {
      res = await fetch(url, {
        method: 'POST',
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
      const json = await res.json();
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

    const bodyText = await res.text().catch(() => '');
    lastErr = new Error(`HTTP ${res.status} ${res.statusText}: ${bodyText.slice(0, 500)}`);

    // x-deny-reason はクラウド環境の allowlist / credential 未設定。再試行しても直らない。
    const deny = res.headers.get('x-deny-reason');
    if (deny) {
      lastErr.message += `\n[診断] x-deny-reason=${deny} — loop-env の Network access と API credentials を確認してください。`;
      break;
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
  const maxOutputTokens = args.max_output_tokens ? Number(args.max_output_tokens) : 16000;

  const r = await askLLM({ spec, system, input, schema, maxOutputTokens });

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
