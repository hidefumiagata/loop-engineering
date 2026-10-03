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
import { loadConfig } from './ask-llm.mjs';

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

async function main() {
  const config = loadConfig();

  if (process.argv.includes('--models')) { listModels(config); return; }

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
