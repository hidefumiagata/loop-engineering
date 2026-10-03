#!/usr/bin/env node
// ループ状態を GitHub Issue 上の固定コメント1件に読み書きする。
//
//   node loop/bin/issue-state.mjs read     12
//   node loop/bin/issue-state.mjs write    12 state.json
//   node loop/bin/issue-state.mjs decision 12
//   node loop/bin/issue-state.mjs list
//
// なぜブランチ上のファイルではなく Issue コメントなのか:
//   ポーラーは常に default branch から起動する。各 Issue の作業ブランチにある状態ファイルは
//   読めないため、状態の正は GitHub 側に置く必要がある。
//   副産物として「作業結果を Issue に記録する」という要件も同じ仕組みで満たせる。
//
// 認証は gh CLI に任せる。Claude Cloud では GH_TOKEN が自動で入っている。

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const MARKER = '<!-- loop-state:v1 -->';
const DRY = process.env.LOOP_DRY_RUN === '1';

function gh(args, { input } = {}) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      input,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (e) {
    const detail = [e.stderr, e.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`gh ${args.join(' ')} が失敗しました\n${detail || e.message}`);
  }
}

export function repoSlug() {
  if (process.env.LOOP_REPO) return process.env.LOOP_REPO;
  return JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
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
  return JSON.parse(gh(['api', '--paginate', `repos/${repo}/issues/${issue}/comments`, '--jq', '[.[] | {id, body, user: .user.login, created_at}]']));
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

/** ループ対象の Issue を1件選ぶ（最終更新が最も古いもの = ラウンドロビン） */
export function listCandidates(repo = repoSlug()) {
  const raw = JSON.parse(gh([
    'issue', 'list', '--repo', repo, '--state', 'open', '--label', 'loop',
    '--limit', '100', '--json', 'number,title,labels,updatedAt',
  ]));
  const names = (i) => i.labels.map((l) => l.name);
  return raw
    .filter((i) => {
      const l = names(i);
      if (l.includes('loop:stop') || l.includes('loop:done') || l.includes('loop:blocked')) return false;
      // 人間の判断待ちは、go が付くまで触らない
      if (l.includes('loop:needs-human') && !l.includes('loop:go')) return false;
      return true;
    })
    .map((i) => ({ number: i.number, title: i.title, labels: names(i), updatedAt: i.updatedAt }))
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
}

// ---------------- CLI ----------------

const USAGE = [
  '使い方:',
  '  node loop/bin/issue-state.mjs read <issue>              状態を JSON で標準出力（無ければ null）',
  '  node loop/bin/issue-state.mjs write <issue> <file.json> 状態コメントを作成/更新',
  '  node loop/bin/issue-state.mjs decision <issue>          状態更新後に投稿された /decide <ラベル> を取得',
  '  node loop/bin/issue-state.mjs list                      ループ対象 Issue を古い順に列挙',
  '',
  '  LOOP_REPO=owner/repo でリポジトリを明示できる（既定は gh repo view）。',
  '  LOOP_DRY_RUN=1 で書き込みを行わずに内容だけ表示する。',
].join('\n');

function main() {
  const [cmd, a1, a2] = process.argv.slice(2);
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
    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1]?.endsWith('issue-state.mjs')) {
  try { main(); } catch (e) { process.stderr.write(`[error] ${e.message}\n`); process.exit(1); }
}
