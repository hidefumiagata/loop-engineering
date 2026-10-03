#!/usr/bin/env node
// ループ状態を GitHub Issue 上の固定コメント1件に読み書きする。
//
//   node loop/bin/issue-state.mjs read       12
//   node loop/bin/issue-state.mjs write      12 state.json
//   node loop/bin/issue-state.mjs decision   12
//   node loop/bin/issue-state.mjs list
//   node loop/bin/issue-state.mjs comment    12 body.md
//   node loop/bin/issue-state.mjs sync-phase 12 review
//   node loop/bin/issue-state.mjs labels     12 add|remove <名前...>
//
// なぜブランチ上のファイルではなく Issue コメントなのか:
//   ポーラーは常に default branch から起動する。各 Issue の作業ブランチにある状態ファイルは
//   読めないため、状態の正は GitHub 側に置く必要がある。
//   副産物として「作業結果を Issue に記録する」という要件も同じ仕組みで満たせる。
//
// ★ 重要な制約（実測で判明）:
//   Claude Code のクラウドセッションからは **GitHub GraphQL が 403 で拒否される**。
//     403 "GitHub GraphQL is not available from Claude Code sessions;
//          use the REST API (gh api repos/{owner}/{repo}/...)"
// <!-- graphql-forbidden-table:start — 以下は「呼べないもの」の列挙なので wiring テストの検出対象外 -->
//   呼べないサブコマンド: gh repo view --json / gh issue list --json / gh issue view --json /
//   gh issue edit / gh issue comment / gh label list / gh pr create / gh pr ready
// <!-- graphql-forbidden-table:end -->
//   このファイルは `gh api`（REST）と `git` だけで完結させる。
//   REST の /issues?labels= は検索インデックスを経由しないため、
//   作成直後の Issue もすぐ取得できる（GraphQL 版にあったラベル反映遅延は起きない）。
//
// 認証は gh CLI に任せる。Claude Cloud では GH_TOKEN が自動で入っている。

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const MARKER = '<!-- loop-state:v1 -->';
const DRY = process.env.LOOP_DRY_RUN === '1';

function run(cmd, args, { input, tolerate } = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      input,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (e) {
    const detail = [e.stderr, e.stdout].filter(Boolean).join('\n').trim();
    if (tolerate && tolerate.test(detail)) return '';
    throw new Error(`${cmd} ${args.join(' ')} が失敗しました\n${detail || e.message}`);
  }
}

const gh = (args, opts) => run('gh', args, opts);
const git = (args, opts) => run('git', args, opts);

/**
 * `gh api --paginate --jq` はページごとに1つの JSON を出力するため、
 * 出力全体を JSON.parse すると2ページ目以降で壊れる。行ごとに読んで連結する。
 */
function ghJsonLines(args) {
  return gh(args)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => JSON.parse(l));
}

/**
 * owner/repo を決める。GraphQL が使えないので `gh repo view` は呼べない。
 * 優先順: LOOP_REPO → GITHUB_REPOSITORY → git remote origin の URL。
 */
export function repoSlug() {
  if (process.env.LOOP_REPO) return process.env.LOOP_REPO;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git(['remote', 'get-url', 'origin']).trim();
  // https://github.com/owner/repo(.git) と git@github.com:owner/repo(.git) の両方を受ける
  const m = url.match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`git remote origin の URL から owner/repo を読めません: ${url}`);
  return `${m[1]}/${m[2]}`;
}

// ---------------- 状態の検証 ----------------

const REQUIRED = ['issue', 'usecase', 'mode', 'slug', 'branch', 'phase', 'iteration', 'max_iterations'];
const PHASES = {
  pipeline: ['plan', 'work', 'review', 'done', 'blocked'],
  panel: ['brief', 'propose', 'evaluate', 'decide', 'handoff', 'done', 'blocked'],
};

export function validateState(s) {
  const problems = [];
  for (const k of REQUIRED) if (s[k] === undefined || s[k] === null) problems.push(`必須フィールド ${k} がありません`);
  if (s.mode && !PHASES[s.mode]) problems.push(`未知の mode: ${s.mode}`);
  if (s.mode && PHASES[s.mode] && !PHASES[s.mode].includes(s.phase)) {
    problems.push(`mode=${s.mode} に phase=${s.phase} は不正です (有効: ${PHASES[s.mode].join(', ')})`);
  }
  if (typeof s.iteration === 'number' && typeof s.max_iterations === 'number' && s.iteration > s.max_iterations + 1) {
    problems.push(`iteration(${s.iteration}) が max_iterations(${s.max_iterations}) を大きく超えています`);
  }
  if (problems.length) throw new Error(`状態が不正です:\n - ${problems.join('\n - ')}`);
  return s;
}

// ---------------- コメント本文の組み立てと解析 ----------------

/** 人間が Issue を開いたときに一目で分かる見出しを付けてから JSON を埋める */
export function renderStateComment(state) {
  const pct = state.max_iterations ? `${state.iteration}/${state.max_iterations}` : String(state.iteration);
  const head = [
    MARKER,
    '### ループ状態',
    '',
    `| 項目 | 値 |`,
    `| --- | --- |`,
    `| 用途 | \`${state.usecase}\` (${state.mode}) |`,
    `| フェーズ | **${state.phase}** |`,
    `| 反復 | ${pct}${state.panel_round ? ` / panelラウンド ${state.panel_round}` : ''} |`,
    `| ブランチ | \`${state.branch}\` |`,
    `| PR | ${state.pr ? `#${state.pr}` : '未作成'} |`,
    `| 成果物 | \`projects/${state.slug}/\` |`,
    `| 人間の判断待ち | ${state.awaiting_human ? '**はい**' : 'いいえ'} |`,
    `| 最終更新 | ${state.updated_at ?? '-'} |`,
    '',
    'このコメントは loop-engine が自動更新します。手で編集しないでください。',
    '進行を止めたいときは Issue に `loop:stop` ラベルを付けてください。',
    '',
    '<details><summary>生の状態 (JSON)</summary>',
    '',
    '```json',
    JSON.stringify(state, null, 2),
    '```',
    '',
    '</details>',
  ];
  return head.join('\n');
}

export function parseStateComment(body) {
  const m = body.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error('状態コメントに json ブロックが見つかりません。手で編集された可能性があります。');
  return JSON.parse(m[1]);
}

// ---------------- 操作 ----------------

function listComments(repo, issue) {
  return ghJsonLines([
    'api', '--paginate', `repos/${repo}/issues/${issue}/comments?per_page=100`,
    '--jq', '[.[] | {id, body, user: .user.login, created_at}]',
  ]);
}

export function readState(issue, repo = repoSlug()) {
  const hit = listComments(repo, issue).find((c) => c.body.includes(MARKER));
  if (!hit) return null;
  return { commentId: hit.id, state: parseStateComment(hit.body) };
}

export function writeState(issue, state, repo = repoSlug()) {
  validateState(state);
  state.updated_at = new Date().toISOString();
  const body = renderStateComment(state);
  const existing = readState(issue, repo);

  if (DRY) {
    process.stderr.write(`[dry-run] ${existing ? `コメント ${existing.commentId} を更新` : '状態コメントを新規作成'} (issue #${issue}, phase=${state.phase})\n`);
    return { commentId: existing?.commentId ?? null, dryRun: true };
  }

  const payload = JSON.stringify({ body });
  if (existing) {
    gh(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing.commentId}`, '--input', '-'], { input: payload });
    return { commentId: existing.commentId, created: false };
  }
  const created = JSON.parse(gh(['api', '-X', 'POST', `repos/${repo}/issues/${issue}/comments`, '--input', '-'], { input: payload }));
  return { commentId: created.id, created: true };
}

/**
 * 人間の確定コメントを探す。
 * panel モードは require_human_decision が true なので、Issue 上の `/decide <ラベル>` を待つ。
 * 状態コメントより後に投稿されたものだけを有効とし、古い指示を再実行しないようにする。
 */
export function readDecision(issue, repo = repoSlug()) {
  const comments = listComments(repo, issue);
  const stateComment = comments.find((c) => c.body.includes(MARKER));
  const after = stateComment ? new Date(stateComment.created_at) : new Date(0);

  // 状態コメントは更新されても created_at が変わらないため、更新時刻は状態側の updated_at を使う
  let since = after;
  if (stateComment) {
    try {
      const u = parseStateComment(stateComment.body).updated_at;
      if (u) since = new Date(u);
    } catch { /* 解析できなければ created_at のままにする */ }
  }

  const hits = comments
    .filter((c) => !c.body.includes(MARKER))
    .filter((c) => new Date(c.created_at) > since)
    .map((c) => {
      const m = c.body.match(/(?:^|\s)\/decide\s+([A-Za-z0-9_-]+)/);
      return m ? { label: m[1], by: c.user, at: c.created_at } : null;
    })
    .filter(Boolean);

  return hits.length ? hits[hits.length - 1] : null;
}

/**
 * ループ対象の Issue を古い順に列挙する（先頭を処理するとラウンドロビンになる）。
 * REST の /issues は Pull Request も混ぜて返すので pull_request を持つものを除く。
 */
export function listCandidates(repo = repoSlug()) {
  const raw = ghJsonLines([
    'api', '--paginate',
    `repos/${repo}/issues?labels=loop&state=open&sort=updated&direction=asc&per_page=100`,
    '--jq', '[.[] | {number, title, labels: [.labels[].name], updatedAt: .updated_at, is_pr: has("pull_request")}]',
  ]);
  return raw
    .filter((i) => !i.is_pr)
    .filter((i) => {
      const l = i.labels;
      if (l.includes('loop:stop') || l.includes('loop:done') || l.includes('loop:blocked')) return false;
      // 人間の判断待ちは、go が付くまで触らない
      if (l.includes('loop:needs-human') && !l.includes('loop:go')) return false;
      return true;
    })
    .map(({ number, title, labels, updatedAt }) => ({ number, title, labels, updatedAt }))
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
}

// ---------------- ラベルとコメント（すべて REST） ----------------

/** Issue に現在付いているラベル名 */
export function currentLabels(issue, repo = repoSlug()) {
  return ghJsonLines(['api', '--paginate', `repos/${repo}/issues/${issue}/labels?per_page=100`, '--jq', '[.[].name]']);
}

export function addLabels(issue, names, repo = repoSlug()) {
  if (!names.length) return;
  if (DRY) { process.stderr.write(`[dry-run] ラベル追加 ${names.join(', ')} (issue #${issue})\n`); return; }
  gh(['api', '-X', 'POST', `repos/${repo}/issues/${issue}/labels`, '--input', '-'], { input: JSON.stringify({ labels: names }) });
}

export function removeLabels(issue, names, repo = repoSlug()) {
  for (const n of names) {
    if (DRY) { process.stderr.write(`[dry-run] ラベル削除 ${n} (issue #${issue})\n`); continue; }
    // 付いていないラベルの削除は 404 になる。冪等に扱いたいので許容する。
    gh(['api', '-X', 'DELETE', `repos/${repo}/issues/${issue}/labels/${encodeURIComponent(n)}`],
      { tolerate: /Label does not exist|HTTP 404/i });
  }
}

/** 既知のフェーズラベル。sync-phase がこの集合の中だけを入れ替える */
export const PHASE_LABELS = [
  ...new Set([...PHASES.pipeline, ...PHASES.panel].map((p) => `loop:${p}`)),
];

/**
 * フェーズラベルを1つだけに揃える。`loop` / `use:*` / 制御ラベル（needs-human, go, stop）は触らない。
 * 手でラベルを足し引きさせると取り違えが起きるので、この操作をスクリプト側に閉じ込める。
 */
export function syncPhase(issue, phase, repo = repoSlug()) {
  const want = `loop:${phase}`;
  if (!PHASE_LABELS.includes(want)) {
    throw new Error(`未知のフェーズ: ${phase} (有効: ${PHASE_LABELS.join(', ')})`);
  }
  const have = DRY ? [] : currentLabels(issue, repo);
  const stale = have.filter((l) => PHASE_LABELS.includes(l) && l !== want);
  removeLabels(issue, stale, repo);
  if (!have.includes(want)) addLabels(issue, [want], repo);
  return { added: have.includes(want) ? [] : [want], removed: stale };
}

/** Issue に人間可読のコメントを投稿する（gh issue comment は GraphQL なので使えない） */
export function postComment(issue, body, repo = repoSlug()) {
  if (DRY) {
    process.stderr.write(`[dry-run] issue #${issue} にコメント投稿 (${body.length} 文字)\n`);
    return { id: null, dryRun: true };
  }
  const created = JSON.parse(
    gh(['api', '-X', 'POST', `repos/${repo}/issues/${issue}/comments`, '--input', '-'], { input: JSON.stringify({ body }) }),
  );
  return { id: created.id, url: created.html_url };
}

// ---------------- CLI ----------------

const USAGE = [
  '使い方:',
  '  node loop/bin/issue-state.mjs read <issue>              状態を JSON で標準出力（無ければ null）',
  '  node loop/bin/issue-state.mjs write <issue> <file.json> 状態コメントを作成/更新',
  '  node loop/bin/issue-state.mjs decision <issue>          状態更新後に投稿された /decide <ラベル> を取得',
  '  node loop/bin/issue-state.mjs list                      ループ対象 Issue を古い順に列挙',
  '  node loop/bin/issue-state.mjs comment <issue> <file.md> 人間可読コメントを投稿',
  '  node loop/bin/issue-state.mjs sync-phase <issue> <phase> フェーズラベルを1つに揃える',
  '  node loop/bin/issue-state.mjs labels <issue> add|remove <名前...>',
  '',
  '  すべて REST (gh api) で動く。クラウドセッションでは GitHub GraphQL が 403 になるため、',
  '  --json 系サブコマンド（issue list / issue edit / issue comment / pr create 等）は使えない。',
  '',
  '  LOOP_REPO=owner/repo でリポジトリを明示できる（既定は git remote origin から導出）。',
  '  LOOP_DRY_RUN=1 で書き込みを行わずに内容だけ表示する。',
].join('\n');

function main() {
  const [cmd, a1, a2, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'read': {
      if (!a1) throw new Error(USAGE);
      const r = readState(Number(a1));
      console.log(JSON.stringify(r ? { comment_id: r.commentId, state: r.state } : null, null, 2));
      break;
    }
    case 'write': {
      if (!a1 || !a2) throw new Error(USAGE);
      const state = JSON.parse(readFileSync(a2, 'utf8'));
      const r = writeState(Number(a1), state);
      process.stderr.write(`[ok] issue #${a1} state comment ${r.commentId ?? '(dry-run)'} ${r.created ? '新規作成' : '更新'}\n`);
      console.log(JSON.stringify(state, null, 2));
      break;
    }
    case 'decision': {
      if (!a1) throw new Error(USAGE);
      console.log(JSON.stringify(readDecision(Number(a1)), null, 2));
      break;
    }
    case 'list': {
      const c = listCandidates();
      console.log(JSON.stringify(c, null, 2));
      process.stderr.write(`[ok] ループ対象 ${c.length} 件${c.length ? ` / 次に処理すべきは #${c[0].number}` : ''}\n`);
      break;
    }
    case 'comment': {
      if (!a1 || !a2) throw new Error(USAGE);
      const r = postComment(Number(a1), readFileSync(a2, 'utf8'));
      process.stderr.write(`[ok] issue #${a1} にコメント投稿 ${r.url ?? '(dry-run)'}\n`);
      break;
    }
    case 'sync-phase': {
      if (!a1 || !a2) throw new Error(USAGE);
      const r = syncPhase(Number(a1), a2);
      process.stderr.write(`[ok] issue #${a1} のフェーズラベルを loop:${a2} に揃えました`
        + `${r.removed.length ? ` (削除: ${r.removed.join(', ')})` : ''}\n`);
      break;
    }
    case 'labels': {
      if (!a1 || !a2 || !rest.length) throw new Error(USAGE);
      if (a2 === 'add') addLabels(Number(a1), rest);
      else if (a2 === 'remove') removeLabels(Number(a1), rest);
      else throw new Error(`labels の操作は add か remove です (received: ${a2})`);
      process.stderr.write(`[ok] issue #${a1} のラベルを ${a2}: ${rest.join(', ')}\n`);
      break;
    }
    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1]?.endsWith('issue-state.mjs')) {
  try { main(); } catch (e) { process.stderr.write(`[error] ${e.message}\n`); process.exit(1); }
}
