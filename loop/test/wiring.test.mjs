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
  assert.ok(PHASE_LABELS.length >= 9, `PHASE_LABELS の抽出に失敗 (${PHASE_LABELS.length} 件)`);
  for (const label of PHASE_LABELS) {
    assert.ok(LABELS_SH.includes(`${label}|`), `setup-labels.sh に ${label} が無い`);
  }
  for (const ctl of ['loop|', 'loop:blocked|', 'loop:needs-human|', 'loop:go|', 'loop:stop|']) {
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
    ['loop/bin/synthesis-check.mjs', read('loop/bin/synthesis-check.mjs')],
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

test('ask-llm.mjs は他社LLMの呼び出しに Node の fetch を使っていない', () => {
  // 実測: Claude Cloud は HTTPS_PROXY 環境変数でエージェントプロキシを指しており、
  // API credential のキーはそのプロキシが付与する。Node の fetch(undici) は
  // HTTPS_PROXY を既定で無視するため（NODE_USE_ENV_PROXY は Node 24 以降・
  // サンドボックスは Node 22）、プロキシを素通りしてキーの付かないリクエストが届く。
  // 同一リクエストが curl では 200、Node fetch では 403/401 になることを確認している。
  // ここで fetch に戻すと、また「credential を登録したのに 403」で数時間溶かすことになる。
  const src = read('loop/bin/ask-llm.mjs');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /(?<![.\w])fetch\s*\(/, 'ask-llm.mjs がグローバル fetch を呼んでいる。curlPostJson を使うこと');
  assert.match(code, /execFileSync\('curl'/, 'curl 経由であることを明示的に確認する');
});

test('技術調査のサブエージェントが定義され、権限が分離されている', () => {
  // 公式と非公式を1人が同時に読むと文脈の中で混ざり、「公式に書いてあった気がするが
  // 実はブログだった」という取り違えが後から検証できなくなる。
  // 分離そのものがこの用途の価値なので、定義と権限を固定する。
  const read1 = (p) => read(p);

  const community = read1('.claude/agents/research-community.md');
  assert.match(community, /^name:\s*research-community/m);
  assert.match(community, /^tools:.*WebSearch/m, '非公式調査には検索が要る');
  assert.match(community, /公式ドキュメントに当たってはいけない/,
    '公式を読ませると突き合わせる相手が居なくなる');

  const reconcile = read1('.claude/agents/research-reconcile.md');
  assert.match(reconcile, /^name:\s*research-reconcile/m);
  // 突き合わせ役に Web を与えると、追加調査で穴を埋めてしまい照合の意味が消える
  const tools = reconcile.match(/^tools:\s*(.+)$/m)?.[1] ?? '';
  assert.doesNotMatch(tools, /WebSearch|WebFetch/,
    'research-reconcile に Web ツールを与えてはならない。突き合わせ役は追加調査をしない');
  // ハーネスがサブエージェントの report ファイル書き込みを拒否する
  // （Subagents should return findings as text, not write report files）。
  // Write を持たせても必ず失敗するので、テキストを返す契約にしてある。
  // 実測: Issue #13 と #19 がこれで2回止まった。
  assert.doesNotMatch(tools, /Write/,
    'research-reconcile に Write を与えてはならない。ハーネスが report の書き込みを拒否する');
  assert.match(reconcile, /テキストで返す/,
    'レポート本文をテキストで返す契約が書かれていない');

  // 公式優先の3規則が書かれていること
  assert.match(reconcile, /公式（非公式と相違）/, '相違時は公式を採りつつ備考に残す');
  assert.match(reconcile, /非公式のみ/, '非公式のみの場合の区分');
  assert.match(reconcile, /200文字程度/, '調査概要の字数指定');
});

test('research 用途がサブエージェントを使う手順になっている', () => {
  const research = read('loop/prompts/usecases/research.md');
  for (const name of ['research-community', 'research-reconcile']) {
    assert.ok(research.includes(name), `research.md が ${name} を参照していない`);
    assert.ok(SKILL.includes(name), `SKILL.md が ${name} を参照していない`);
  }
  // 代行の禁止。1人でやると分離の意味が消える
  assert.match(SKILL, /サブエージェントが起動できない場合、自分で代行してはならない/);
});

test('成果物を Issue に書かせない', () => {
  // Issue は「目的」と「状態」の置き場。成果物の置き場は PR とリポジトリ。
  // run ごとに結果コメントを積むと Issue が読めなくなり、
  // 成果物の正がどこにあるかが曖昧になる。
  const targets = [
    ['.claude/skills/loop-engine/SKILL.md', SKILL],
    ['loop/prompts/usecases/deliberation.md', read('loop/prompts/usecases/deliberation.md')],
    ['loop/prompts/usecases/research.md', read('loop/prompts/usecases/research.md')],
  ];
  // 「貼らない」「投稿しない」と否定している行は対象外
  const forbidden = [
    [/全文を\s*Issue\s*に投稿/, '成果物の全文を Issue に貼らせている'],
    [/Issue\s*に[^。\n]*全文を投稿/, '成果物の全文を Issue に貼らせている'],
    [/読者は\s*Issue\s*しか見ない/, 'Issue を読み先として扱っている。読み先は PR'],
  ];
  for (const [path, text] of targets) {
    const lines = text.split('\n').filter((l) => !/貼らない|投稿しない|書かない|書いてはならない/.test(l));
    for (const [re, why] of forbidden) {
      const hit = lines.find((l) => re.test(l));
      assert.ok(!hit, `${path}: ${why}\n  → ${hit}`);
    }
  }

  // 例外（進められないときだけコメントしてよい）が明記されていること
  assert.match(SKILL, /コメントしてよいのは、人間が動かないと進めないときだけ/);
  // 状態コメントの更新は必須のまま
  assert.match(SKILL, /run の終わりに必ず状態コメントを更新する/);
});

test('どちらのモードも最後は PR を作って人間に委ねる', () => {
  // panel は実装への引き継ぎが無いが、成果物が作業ブランチに取り残されると参照できなくなる。
  // main に入れるかどうかは人間が決める、という形を両モードで揃える。
  const stripExcluded = (t) =>
    t.replace(/<!-- graphql-forbidden-table:start[\s\S]*?graphql-forbidden-table:end -->/g, '');
  const skill = stripExcluded(SKILL);

  // REST での PR 作成が pipeline と panel の両方に書かれていること
  const prCreations = [...skill.matchAll(/gh api -X POST "repos\/\$REPO\/pulls"/g)];
  assert.ok(prCreations.length >= 2,
    `PR 作成が ${prCreations.length} 箇所しかない。pipeline と panel の両方に必要`);

  // 「PR は作らなくてよい」のような逃げ道が残っていないこと
  assert.doesNotMatch(skill, /PR は作らなくてよい/, 'panel でも PR を作る');
  // マージは人間に委ねる
  assert.match(skill, /マージはしない/, 'エージェントにマージさせない');
});

test('PR 本文が Issue を自動クローズする', () => {
  // Closes が無いと、完了した Issue が open のまま残る。
  // loop ラベルが付いたままなので、ラベル構成によっては次の run が拾い直してしまう。
  const bodies = [...SKILL.matchAll(/"body":\s*"([^"]*(?:\\.[^"]*)*)"/g)].map((m) => m[1]);
  const prBodies = bodies.filter((b) => b.includes('projects/<slug>/'));
  assert.ok(prBodies.length >= 2,
    `PR 本文テンプレートが ${prBodies.length} 件しか見つからない。pipeline と panel の両方に必要`);
  for (const b of prBodies) {
    assert.match(b, /Closes #<issue>/,
      `PR 本文に Closes #<issue> が無い: ${b.slice(0, 70)}…`);
  }
  assert.match(SKILL, /マージ時に Issue が自動でクローズされる/, '理由を手順書に残す');
});

test('状態コメントが成果物へのリンクを持つ', () => {
  // Issue に本文を貼らない代わりに、リンクで辿れるようにする。
  assert.match(SKILL, /`artifacts` に成果物のファイル名を入れる/);
  // 中間ファイルを並べると、どれを読めばよいか分からなくなる
  assert.match(SKILL, /中間ファイル（`findings\/` や `journal\/`）は入れない/);
});

test('長文を生成する propose 階層は background で非同期化されている', () => {
  // 実測: エージェントプロキシは1リクエスト約30秒で諦め、
  // 502 "upstream request failed" を返す（gpt-5.2 も gpt-5.5 も同じ30秒で落ちた）。
  // 提案は数千トークンの生成なので同期リクエストでは原理的に収まらない。
  // background を外すと合議が propose で止まる。
  const t = config.providers.openai.tiers.propose;
  assert.equal(t.background, true, 'openai:propose の background を外してはならない');
  // 他プロバイダは background 非対応。収まる範囲で使う前提なので強制しない。
  assert.notEqual(config.providers.gemini.tiers.propose.background, true,
    'Gemini に background は無い。付けると送信ボディに未知のフィールドが混じる');
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

test('panel 用途は4段（提案・敵対的レビュー・改稿・統合）を備えている', () => {
  for (const [name, uc] of Object.entries(config.usecases)) {
    if (uc.mode !== 'panel') continue;

    // 1. 3者が意見を出す
    assert.ok(uc.proposers?.length >= 3, `${name} の proposers が3者未満`);
    assert.equal(uc.min_proposers, 3,
      `${name}.min_proposers は 3。2案だと各自が1案しか攻撃できず、攻撃の重なりが消える`);

    // 2. 自分以外を敵対的レビュー / 3. 改稿
    //    提案者と同じ顔ぶれでなければ「自分以外を攻撃する」「自分の案を直す」が成立しない
    assert.deepEqual(uc.challengers, uc.proposers,
      `${name} の challengers は proposers と同じ顔ぶれである必要がある`);
    assert.deepEqual(uc.revisers, uc.proposers,
      `${name} の revisers は proposers と同じ顔ぶれである必要がある`);

    // 4. 統合は「Claude の別エージェント」。本体が兼ねると自案を土台にする動機が残る
    assert.equal(uc.synthesizer, 'subagent:panel-synthesizer',
      `${name}.synthesizer はサブエージェントでなければならない。本体が統合すると自案に偏る`);
    assert.ok(!uc.proposers.includes(uc.synthesizer),
      `${name} の統合役が提案者に含まれている`);

    // 採点は廃止。敵対的レビューが評価の役割を担う
    assert.equal(uc.evaluators, undefined, `${name} に evaluators が残っている。採点は廃止した`);
    assert.equal(uc.critics, undefined, `${name} に critics が残っている。批評は challenge に統合した`);

    // 外部プロバイダの階層がすべて解決できること
    for (const spec of [...uc.proposers, ...uc.challengers, ...uc.revisers]) {
      if (spec === 'claude') continue;
      assert.doesNotThrow(() => resolveTier(spec, config), `${spec} が解決できない`);
    }

    assert.equal(uc.require_human_decision, false,
      `${name} は結論を出して完了する用途。承認待ちで止める設計ではない`);
    assert.equal(uc.deliverable, 'answer.md');
  }
});

test('合議のサブエージェントが定義され、権限が分離されている', () => {
  const synth = read('.claude/agents/panel-synthesizer.md');
  assert.match(synth, /^name:\s*panel-synthesizer/m);

  // 統合役に Web を与えると、入力に無いことを書き足してしまう
  const tools = synth.match(/^tools:\s*(.+)$/m)?.[1] ?? '';
  assert.doesNotMatch(tools, /WebSearch|WebFetch/,
    'panel-synthesizer に Web ツールを与えてはならない。まとめ役は追加調査をしない');
  assert.match(tools, /Write/, 'answer.md と provenance.json を書くので Write は要る');

  // 著者を知らないまま読むことがこの工程の価値
  assert.match(synth, /どれが本体の案かを知りません/);
  assert.match(synth, /authors\.json` は渡されません|authors\.json.*渡されません/);
});

test('敵対的レビューと改稿の分離が手順書に書かれている', () => {
  // ここを間違えると議論が成立しない。文章で縛るしかない箇所なので明示を確認する
  assert.match(SKILL, /自分が書いた案を除いた2案.*だけを渡す/s,
    '攻撃者に自分の案を渡さないこと');
  assert.match(SKILL, /自分の案」と「自分の案への指摘」だけを渡す/,
    '改稿者に他案を渡さないこと');
  assert.match(SKILL, /`\.authors\.json` のパスは渡さない/,
    '統合役に対応表を渡さないこと');
  assert.match(SKILL, /サブエージェントに差し戻して書き直させる/,
    '偏りの指摘を本体が自分で直さないこと');
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

test('サブエージェントの起動手順に出力先パスの指示がある', () => {
  // 実測: Issue #13 は research-reconcile が report.md を書けずに blocked になった。
  // 原因は手順書が出力先パスを渡していなかったこと。エージェント定義側は
  // 「保存先のパスは呼び出し元から渡されます」と書かれているので、
  // 渡し忘れても設定エラーにはならず、run が落ちる形で初めて分かる。
  for (const agent of ['research-community', 'research-reconcile', 'panel-synthesizer']) {
    const at = SKILL.indexOf(agent);
    assert.ok(at > 0, `${agent} が SKILL.md に出てこない`);
    assert.match(SKILL.slice(at, at + 900), /出力先/,
      `${agent} の起動手順に出力先パスを渡す指示がない。渡さないと書き込みに失敗する`);
  }

  // エージェント定義が呼び出し元にパスを委ねているなら、手順書側がそれを渡していること
  const reconcile = read('.claude/agents/research-reconcile.md');
  if (/パスは呼び出し元から渡され/.test(reconcile)) {
    assert.match(SKILL, /出力先パス `projects\/<slug>\/report\.md`/,
      'research-reconcile は呼び出し元からパスを受け取る前提なので、SKILL.md が明示的に渡すこと');
  }
});

test('サブエージェントが失敗した run は記録を残して終わる', () => {
  // レビュアーの失敗には5分岐の対応表があるのに、統合役の失敗には手順が無かった。
  // 失敗を記録せずに終えると、毎時の run が黙って積み上がっても誰も気づけない。
  // これは実測ではなく、非対称を埋めるための予防的な規定である。
  const from = SKILL.indexOf('### phase: synthesize');
  assert.ok(from > 0, 'synthesize のフェーズ節が無い');
  const section = SKILL.slice(from, SKILL.indexOf('### phase:', from + 10) + 1 || undefined);
  assert.match(section, /loop:blocked/,
    'synthesize に失敗したときの blocked 手順が無い');
  assert.match(section, /loop:needs-human/,
    'synthesize に失敗したときの needs-human 手順が無い');
  assert.match(SKILL, /黙って同じフェーズをやり直して終わってはならない/,
    '黙って再試行して終わることを禁じる文言が無い');
});

test('長文を生成する階層の出力上限が打ち切られない値になっている', () => {
  // 実測: Issue #10 で gpt-5.5 の出力は 10,705 / 15,612 トークンだった。
  // 8000 では打ち切られて再実行になり、1回目の課金は meta.json にも残らず消える。
  const limits = [...SKILL.matchAll(/--max-output-tokens (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(limits.length >= 3, '--max-output-tokens の指定が見つからない');
  for (const n of limits) {
    assert.ok(n >= 16000,
      `--max-output-tokens ${n} は低すぎる。reasoning_effort: high は推論トークンも出力に数える`);
  }
});

test('突き合わせ役はテキストを返し、本体は転記するだけという契約が手順書にある', () => {
  // ハーネスがサブエージェントの report ファイル書き込みを拒否するため
  // （Subagents should return findings as text, not write report files）、
  // 「サブエージェントが書く」設計は成立しない。実測で Issue #13 と #19 が2回止まった。
  // 代わりに本体が転記するが、転記と代行の線引きを文章で縛る必要がある。
  assert.match(SKILL, /サブエージェントにファイルを書かせない/,
    'サブエージェントに書かせない明示が無い');
  assert.match(SKILL, /一字一句変えずに保存する/,
    '本体が転記するだけである明示が無い');
  assert.match(SKILL, /編集・要約・追記/,
    '転記時に内容へ手を入れない明示が無い');
  assert.match(SKILL, /突き合わせそのものを自分でやってはならない/,
    '転記は許すが代行は禁じる、という線引きが無い');

  // 用途別指示にも同じ線引きがあること
  const research = read('loop/prompts/usecases/research.md');
  assert.match(research, /Subagents should return findings as text/,
    'research.md に実際のエラー文が残っていない。次に同じ症状を見たとき照合できない');
  assert.match(research, /転記は代行ではない/,
    'research.md に転記と代行の線引きが無い');
});
