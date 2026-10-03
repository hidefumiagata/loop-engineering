// 設定・プロンプト・Issueテンプレート・ラベル定義の整合性テスト。
//   node --test loop/test/wiring.test.mjs
//
// ここが壊れると、ループは「エラーにならずに間違ったことをする」形で失敗する。
// 用途を追加したときに4箇所の更新を忘れるのが最もありがちな事故なので、機械で検出する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTier } from '../bin/ask-llm.mjs';
import { SCHEMA_NAMES } from '../bin/schemas.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const config = JSON.parse(read('loop/config.json'));

const USECASES = Object.keys(config.usecases);
const SKILL = read('.claude/skills/loop-engine/SKILL.md');
const LABELS_SH = read('loop/bin/setup-labels.sh');
const TEMPLATE = read('.github/ISSUE_TEMPLATE/loop-task.yml');

test('preset が presets に存在する', () => {
  assert.ok(config.presets[config.preset], `preset "${config.preset}" が presets に無い`);
  for (const [name, p] of Object.entries(config.presets)) {
    assert.ok(['iteration', 'phase'].includes(p.granularity), `${name}.granularity が不正`);
    assert.ok(Number.isInteger(p.issues_per_run) && p.issues_per_run >= 1, `${name}.issues_per_run が不正`);
  }
});

test('用途が参照するプロバイダ階層がすべて解決でき、有効である', () => {
  // config の中に出てくる "provider:tier" 形式の値を全部集める
  const specs = new Set();
  for (const uc of Object.values(config.usecases)) {
    for (const v of [uc.reviewer, uc.planner_critic]) if (v) specs.add(v);
    for (const list of [uc.proposers, uc.evaluators]) {
      for (const v of list ?? []) if (v !== 'claude') specs.add(v);
    }
  }
  assert.ok(specs.size > 0, 'spec が1つも見つからない');
  for (const spec of specs) {
    // enabled:false なら resolveTier が投げる。用途から参照されている階層は有効でなければならない
    assert.doesNotThrow(() => resolveTier(spec, config), `${spec} が解決できない、または enabled:false`);
  }
});

test('有料階層には価格が入っている（実コスト表示の根拠）', () => {
  for (const [pname, provider] of Object.entries(config.providers)) {
    for (const [tname, tier] of Object.entries(provider.tiers)) {
      assert.ok(tier.model, `${pname}:${tname} に model が無い`);
      const p = tier.price_per_mtok;
      assert.ok(p && typeof p.in === 'number' && typeof p.out === 'number',
        `${pname}:${tname} に price_per_mtok が無い。これが無いとコスト表示が 0 になる`);
    }
  }
});

test('プロバイダの認証定義が揃っている', () => {
  for (const [pname, provider] of Object.entries(config.providers)) {
    assert.match(provider.endpoint, /^https:\/\//, `${pname}.endpoint が https でない`);
    assert.ok(provider.auth?.header, `${pname}.auth.header が無い`);
    assert.ok(provider.auth?.local_env, `${pname}.auth.local_env が無い`);
    assert.ok('prefix' in provider.auth, `${pname}.auth.prefix が無い（空文字でも明示する）`);
  }
  // Gemini は生値を x-goog-api-key で受ける。Bearer を付けると認証が通らない
  assert.equal(config.providers.gemini.auth.header, 'x-goog-api-key');
  assert.equal(config.providers.gemini.auth.prefix, '', 'Gemini の prefix は空でなければならない');
  assert.equal(config.providers.openai.auth.prefix, 'Bearer');
});

test('すべての用途に mode / label / プロンプトファイルがある', () => {
  for (const name of USECASES) {
    const uc = config.usecases[name];
    assert.ok(['pipeline', 'panel'].includes(uc.mode), `${name}.mode が不正: ${uc.mode}`);
    assert.equal(uc.label, `use:${name}`, `${name}.label の命名が規約から外れている`);
    assert.ok(existsSync(resolve(ROOT, `loop/prompts/usecases/${name}.md`)),
      `loop/prompts/usecases/${name}.md が無い`);
  }
});

test('すべての用途ラベルが setup-labels.sh にある', () => {
  for (const name of USECASES) {
    assert.ok(LABELS_SH.includes(`use:${name}|`), `setup-labels.sh に use:${name} が無い`);
  }
});

test('SKILL.md が使うフェーズラベルが setup-labels.sh にある', () => {
  // issue-state.mjs の PHASES と対応するラベル
  const phases = ['plan', 'work', 'review', 'brief', 'propose', 'evaluate', 'decide', 'done', 'blocked'];
  for (const ph of phases) {
    assert.ok(LABELS_SH.includes(`loop:${ph}|`), `setup-labels.sh に loop:${ph} が無い`);
  }
  for (const ctl of ['loop|', 'loop:needs-human|', 'loop:go|', 'loop:stop|']) {
    assert.ok(LABELS_SH.includes(ctl), `setup-labels.sh に ${ctl.slice(0, -1)} が無い`);
  }
});

test('Issueテンプレートの用途キーが config.usecases と一致する', () => {
  // ドロップダウンは「表示名 (機械キー)」の形で、SKILL.md が括弧内を読む
  const keys = [...TEMPLATE.matchAll(/^\s*-\s.*\(([a-z]+)\)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), [...USECASES].sort(),
    `テンプレートの用途キーと config.usecases が食い違っている: template=${keys} config=${USECASES}`);
});

test('Issueテンプレートが loop ラベルを自動付与する', () => {
  // これが無いと作られた Issue が一切拾われない
  assert.match(TEMPLATE, /^labels:\s*\["loop"\]/m);
});

test('SKILL.md が参照するファイルがすべて存在する', () => {
  const refs = new Set([
    ...[...SKILL.matchAll(/`(loop\/[\w./-]+)`/g)].map((m) => m[1]),
    ...[...SKILL.matchAll(/(loop\/bin\/[\w.-]+\.mjs)/g)].map((m) => m[1]),
    ...[...SKILL.matchAll(/(loop\/prompts\/[\w/.-]+\.md)/g)].map((m) => m[1]),
  ]);
  const placeholders = (p) => p.includes('<') || p.includes('NNN') || p.endsWith('/');
  for (const ref of refs) {
    if (placeholders(ref)) continue;
    assert.ok(existsSync(resolve(ROOT, ref)), `SKILL.md が参照する ${ref} が存在しない`);
  }
  assert.ok(refs.size >= 5, `参照の抽出に失敗している可能性がある (${refs.size} 件しか見つからない)`);
});

test('SKILL.md が使うスキーマ名が schemas.mjs に存在する', () => {
  const used = new Set([...SKILL.matchAll(/--schema\s+(\w+)/g)].map((m) => m[1]));
  assert.ok(used.size >= 3, `--schema の抽出に失敗 (${[...used]})`);
  for (const s of used) {
    assert.ok(SCHEMA_NAMES.includes(s), `SKILL.md が使う --schema ${s} が schemas.mjs に無い`);
  }
});

test('SKILL.md が使う provider:tier がすべて有効である', () => {
  const used = new Set([...SKILL.matchAll(/--spec\s+(\w+:\w+)/g)].map((m) => m[1]));
  assert.ok(used.size >= 3, `--spec の抽出に失敗 (${[...used]})`);
  for (const spec of used) {
    assert.doesNotThrow(() => resolveTier(spec, config), `SKILL.md が使う ${spec} が無効`);
  }
});

test('SKILL.md が jq に依存していない（サンドボックスに保証されていない）', () => {
  assert.doesNotMatch(SKILL, /\bjq\b\s+-/, 'SKILL.md が jq を使っている。node -e で読むこと');
});

test('panel 用途は人間の確定を必須にしている', () => {
  for (const [name, uc] of Object.entries(config.usecases)) {
    if (uc.mode !== 'panel') continue;
    assert.equal(uc.require_human_decision, true, `${name} は panel なので require_human_decision が必須`);
    assert.ok(uc.proposers?.length >= 3, `${name} の proposers が3者未満`);
    assert.ok(uc.evaluators?.length >= 3, `${name} の evaluators が3者未満`);
    assert.equal(uc.min_proposers, 3, `${name}.min_proposers は 3 でなければならない`);
    // 提案者と評価者に Claude 以外が2者以上いること（別モデルによる採点の担保）
    const external = (uc.evaluators ?? []).filter((e) => e !== 'claude');
    assert.ok(external.length >= 2, `${name} の外部評価者が2者未満。合議として成立しない`);
  }
});

test('pipeline 用途のレビュアーは Claude ではない', () => {
  for (const [name, uc] of Object.entries(config.usecases)) {
    if (uc.mode !== 'pipeline') continue;
    assert.ok(uc.reviewer && uc.reviewer !== 'claude',
      `${name}.reviewer が claude になっている。作って自分で採点する構造を許してはならない`);
  }
});

test('上限の既定値が入っている', () => {
  assert.ok(config.defaults.max_iterations >= 1);
  assert.ok(config.defaults.max_panel_rounds >= 1);
  assert.equal(config.defaults.branch_prefix, 'claude/loop-',
    'Claude Cloud は claude/ 接頭辞のブランチのみ常に push を許す');
});
