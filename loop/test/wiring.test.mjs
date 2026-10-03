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
import { PHASE_LABELS } from '../bin/issue-state.mjs';

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

test('全フェーズのラベルが setup-labels.sh にある', () => {
  // ハードコードするとフェーズを増やしたときにずれるので、issue-state.mjs の定義から導出する。
  // syncPhase はこの集合のラベルを付け外しするため、定義が無いと GitHub 側で
  // 既定色のラベルが勝手に作られてしまう。
  assert.ok(PHASE_LABELS.length >= 10, `PHASE_LABELS の抽出に失敗 (${PHASE_LABELS.length} 件)`);
  for (const label of PHASE_LABELS) {
    assert.ok(LABELS_SH.includes(`${label}|`), `setup-labels.sh に ${label} が無い`);
  }
  for (const ctl of ['loop|', 'loop:needs-human|', 'loop:go|', 'loop:stop|']) {
    assert.ok(LABELS_SH.includes(ctl), `setup-labels.sh に ${ctl.slice(0, -1)} が無い`);
  }
});

test('クラウドで 403 になる GraphQL 経路の gh コマンドを使っていない', () => {
  // 実測: Claude Code のクラウドセッションは GitHub GraphQL を 403 で拒否する。
  //   "GitHub GraphQL is not available from Claude Code sessions; use the REST API"
  // gh の --json 系サブコマンドは GraphQL を使うため、初回の run がこれで失敗した。
  // 再発防止のため、手順書とスクリプトに現れたら落とす。
  const forbidden = [
    [/gh\s+repo\s+view/, 'gh repo view — repoSlug() のように git remote から導出する'],
    [/gh\s+issue\s+list/, 'gh issue list — gh api repos/{repo}/issues?labels=... を使う'],
    [/gh\s+issue\s+edit/, 'gh issue edit — issue-state.mjs の sync-phase / labels を使う'],
    [/gh\s+issue\s+comment/, 'gh issue comment — issue-state.mjs の comment を使う'],
    [/gh\s+issue\s+view/, 'gh issue view — gh api repos/{repo}/issues/{n} を使う'],
    [/gh\s+label\s+list/, 'gh label list — gh api repos/{repo}/labels を使う'],
    [/gh\s+pr\s+create/, 'gh pr create — gh api -X POST repos/{repo}/pulls を使う'],
    [/gh\s+pr\s+ready/, 'gh pr ready — draft 解除は GraphQL 専用。通常PRで作るので不要'],
    [/gh\s+pr\s+view/, 'gh pr view — gh api repos/{repo}/pulls/{n} を使う'],
  ];
  const targets = [
    ['.claude/skills/loop-engine/SKILL.md', SKILL],
    ['loop/bin/issue-state.mjs', read('loop/bin/issue-state.mjs')],
    ['loop/bin/ask-llm.mjs', read('loop/bin/ask-llm.mjs')],
    ['loop/bin/aggregate.mjs', read('loop/bin/aggregate.mjs')],
    ['loop/prompts/roles/worker.md', read('loop/prompts/roles/worker.md')],
    ['loop/prompts/usecases/deliberation.md', read('loop/prompts/usecases/deliberation.md')],
  ];
  // 「使ってはいけないもの」を列挙している区間は、マーカーで明示的に除外する。
  // キーワード判定で誤魔化すと、本当の違反を取りこぼす。
  const stripExcluded = (text) =>
    text.replace(/<!-- graphql-forbidden-table:start[\s\S]*?graphql-forbidden-table:end -->/g, '');

  for (const [path, text] of targets) {
    // 散文で「これは GraphQL なので使えない」と注意している行も対象外にする
    const lines = stripExcluded(text).split('\n').filter((l) => !/使えない|使わない|GraphQL/.test(l));
    for (const [re, why] of forbidden) {
      const hit = lines.find((l) => re.test(l));
      assert.ok(!hit, `${path} が GraphQL 経路の gh を使っている: ${why}\n  → ${hit}`);
    }
  }
});

test('setup-labels.sh だけは gh label create/edit を使ってよい', () => {
  // ラベル作成はローカルから1度だけ実行する運用で、クラウドセッションからは呼ばない。
  // 上のテストの対象外にしていることを明示しておく。
  assert.match(LABELS_SH, /gh label (create|edit)/);
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
