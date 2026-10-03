// ask-llm.mjs の診断ロジックのテスト。
//   node --test loop/test/diagnose.test.mjs
//
// 初回の実運用で、Gemini から 403 PERMISSION_DENIED が返ってループが止まった。
// エラー本文だけでは「ネットワークで止められた」のか「キーが付いていない」のか区別できず、
// 原因究明が遠回りになった。ここでは**その実際のレスポンス本文**を固定して、
// 診断が正しい設定画面を名指しすることを検証する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, loadConfig } from '../bin/ask-llm.mjs';

const config = loadConfig();
const GEMINI = config.providers.gemini;
const OPENAI = config.providers.openai;

/** headers.get だけを持つ最小の Response スタブ */
const res = (status, headers = {}) => ({
  status,
  statusText: status === 403 ? 'Forbidden' : 'Unauthorized',
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});

// 2026-10-03 の run で Gemini が実際に返した本文
const GEMINI_NO_KEY = JSON.stringify({
  error: {
    code: 403,
    message: "Method doesn't allow unregistered callers (callers without established identity). Please use API Key or other form of API consumer identity to call this API.",
    status: 'PERMISSION_DENIED',
  },
});

const GEMINI_BAD_KEY = JSON.stringify({
  error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' },
});

const OPENAI_NO_KEY = JSON.stringify({
  error: { message: 'Missing bearer or basic authentication in header', type: 'invalid_request_error' },
});

const OPENAI_BAD_KEY = JSON.stringify({
  error: { message: 'Incorrect API key provided: sk-***. You can find your API key at https://platform.openai.com/account/api-keys.', type: 'invalid_request_error' },
});

test('x-deny-reason があればネットワーク設定を名指しする', () => {
  const d = diagnose(res(403, { 'x-deny-reason': 'host_not_allowed' }), '', GEMINI, 'proxy');
  assert.match(d, /x-deny-reason=host_not_allowed/);
  assert.match(d, /Network access/, 'ネットワーク設定を見るよう言う');
  assert.match(d, /プロバイダに届いていません/, 'プロバイダに到達していないことを明示する');
  assert.doesNotMatch(d, /API credentials/, 'credential 画面に誘導してはならない（原因が違う）');
});

test('Gemini の「身元不明の呼び出し元」はキー未付与と診断する', () => {
  const d = diagnose(res(403), GEMINI_NO_KEY, GEMINI, 'proxy');
  assert.match(d, /付与されていません/);
  assert.match(d, /API credentials/, 'credential 画面を名指しする');
  assert.match(d, /ネットワーク設定は正常/, 'ネットワークを疑わせない');
  assert.match(d, /x-goog-api-key/, '必要なヘッダ名を示す');
  assert.match(d, /もう一度開かないと/, '環境を再度開く必要があるという落とし穴を伝える');
});

test('OpenAI の bearer 欠落もキー未付与と診断する', () => {
  const d = diagnose(res(401), OPENAI_NO_KEY, OPENAI, 'proxy');
  assert.match(d, /付与されていません/);
  assert.match(d, /API credentials/);
});

test('Gemini のキー無効では Prefix を空にする指示を出す', () => {
  const d = diagnose(res(403), GEMINI_BAD_KEY, GEMINI, 'proxy');
  assert.match(d, /拒否されました/);
  assert.match(d, /Prefix/, 'Gemini 固有の落とし穴（Prefix に Bearer が残る）を指摘する');
  assert.match(d, /空/);
});

test('OpenAI のキー無効では Prefix の話をしない', () => {
  // OpenAI は Authorization: Bearer が正しいので、Prefix を空にしろと言ってはいけない
  const d = diagnose(res(401), OPENAI_BAD_KEY, OPENAI, 'proxy');
  assert.match(d, /拒否されました/);
  assert.doesNotMatch(d, /Prefix/);
});

test('ローカル開発時は環境変数を名指しする', () => {
  const d = diagnose(res(403), GEMINI_NO_KEY, GEMINI, 'local-env');
  assert.match(d, /GEMINI_API_KEY/, 'クラウドの credential ではなく環境変数を指す');
  assert.doesNotMatch(d, /loop-env/);
});

test('認可以外のエラーには診断を付けない（再試行の余地を残す）', () => {
  for (const status of [429, 500, 502, 503]) {
    assert.equal(diagnose(res(status), 'rate limited', GEMINI, 'proxy'), null, `HTTP ${status} は再試行対象`);
  }
});

test('認可エラーだが本文が未知なら、一般的な案内を返す', () => {
  const d = diagnose(res(403), '<html>Forbidden</html>', GEMINI, 'proxy');
  assert.match(d, /HTTP 403/);
  assert.match(d, /API credentials/);
});
