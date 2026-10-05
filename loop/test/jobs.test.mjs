// jobs.mjs と定期ジョブ定義のテスト。
//   node --test loop/test/jobs.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJob, resolveOutput, loadJobs, JOBS_DIR } from '../bin/jobs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const VALID = `---
id: sample-job
title: サンプル
enabled: true
output: daily/sample/{date}.md
---

## 集めるもの
なにか
`;

test('front matter と本文を読み分ける', () => {
  const j = parseJob(VALID, 'sample.md');
  assert.equal(j.id, 'sample-job');
  assert.equal(j.title, 'サンプル');
  assert.equal(j.enabled, true, 'true は真偽値として読む');
  assert.equal(j.output, 'daily/sample/{date}.md');
  assert.equal(j.file, 'sample.md');
  assert.match(j.body, /^## 集めるもの/, '本文は front matter を含まない');
});

test('enabled: false も真偽値として読む', () => {
  const j = parseJob(VALID.replace('enabled: true', 'enabled: false'), 'x.md');
  assert.equal(j.enabled, false);
});

test('front matter が無ければ失敗する', () => {
  assert.throws(() => parseJob('## 本文だけ', 'x.md'), /front matter/);
});

test('必須フィールドの欠落を検出する', () => {
  for (const key of ['id', 'title', 'output']) {
    const broken = VALID.replace(new RegExp(`^${key}:.*$`, 'm'), '');
    assert.throws(() => parseJob(broken, 'x.md'), new RegExp(`${key} がありません`));
  }
  const noEnabled = VALID.replace(/^enabled:.*$/m, '');
  assert.throws(() => parseJob(noEnabled, 'x.md'), /enabled は true か false/);
});

test('enabled に true/false 以外を書いたら弾く', () => {
  assert.throws(() => parseJob(VALID.replace('enabled: true', 'enabled: yes'), 'x.md'),
    /enabled は true か false/);
});

test('id はファイル名・パスに使える形に制限する', () => {
  for (const bad of ['Sample', 'sample job', 'sample/job', '-sample', 'サンプル']) {
    assert.throws(() => parseJob(VALID.replace('id: sample-job', `id: ${bad}`), 'x.md'),
      /id は英小文字/, `${bad} は弾かれるべき`);
  }
});

test('output に {date} が無ければ弾く', () => {
  // 日付が無いと毎日同じファイルを上書きしてしまい、履歴が残らない
  assert.throws(() => parseJob(VALID.replace('{date}', 'latest'), 'x.md'),
    /\{date\} が含まれていません/);
});

test('resolveOutput が日付を展開する', () => {
  const j = parseJob(VALID, 'x.md');
  assert.equal(resolveOutput(j, '2026-10-04'), 'daily/sample/2026-10-04.md');
  assert.throws(() => resolveOutput(j, '2026/10/04'), /YYYY-MM-DD/);
  assert.throws(() => resolveOutput(j, 'today'), /YYYY-MM-DD/);
});

test('実際のジョブ定義がすべて読める', () => {
  const jobs = loadJobs(JOBS_DIR, { all: true });
  assert.ok(jobs.length >= 2, `ジョブが ${jobs.length} 件しかない`);

  const ids = jobs.map((j) => j.id);
  assert.ok(ids.includes('hackernews-top10'));
  assert.ok(ids.includes('ai-news-5'));

  for (const j of jobs) {
    assert.ok(j.body.includes('## 集めるもの'), `${j.id}: 「集めるもの」が無い`);
    assert.ok(j.body.includes('## 作るもの'), `${j.id}: 「作るもの」が無い`);
    assert.ok(j.output.startsWith('daily/'), `${j.id}: 成果物は daily/ 配下に置く`);
  }
});

test('有効なジョブだけを既定で返す', () => {
  const all = loadJobs(JOBS_DIR, { all: true });
  const enabled = loadJobs(JOBS_DIR);
  assert.equal(enabled.length, all.filter((j) => j.enabled).length);
  for (const j of enabled) assert.equal(j.enabled, true);
});

test('daily-jobs の手順書が Issue を触らせない', () => {
  // この routine は Issue と無関係。Closes #N を書くと無関係な Issue を閉じてしまう
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  assert.match(skill, /^name:\s*daily-jobs/m);
  assert.match(skill, /Issue を作らない・触らない・コメントしない/);
  assert.match(skill, /`Closes #N` を入れてはならない/);
});

test('daily-jobs が GraphQL 経路の gh を使っていない', () => {
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  const lines = skill.split('\n').filter((l) => !/使えない|使わない|GraphQL/.test(l));
  for (const re of [/gh pr create/, /gh pr merge/, /gh issue /]) {
    const hit = lines.find((l) => re.test(l));
    assert.ok(!hit, `GraphQL 経路の gh を使っている: ${hit}`);
  }
  // REST での PR 作成とマージが書かれていること
  assert.match(skill, /repos\/\$REPO\/pulls/, 'REST で PR を作る');
  assert.match(skill, /pulls\/\$PR\/merge/, 'REST でマージする');
});

test('PR 作成は POST で、PUT のフォールバックを残していない', () => {
  // PUT は PR 作成のメソッドではない。以前は PUT → 失敗 → POST の順で書かれていたため、
  // 毎回1回ぶん無駄な呼び出しが出ていた。
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  assert.match(skill, /-X POST "repos\/\$REPO\/pulls"/, 'POST で PR を作る');
  assert.doesNotMatch(skill, /-X PUT "repos\/\$REPO\/pulls"/,
    'PR 作成に PUT を使っている。PUT は作成のメソッドではない');
});

test('マージは1回だけ試し、再試行しない', () => {
  // 守る不変条件: マージの呼び出しは1回。再試行しない。結果は必ず記録する。
  //
  // 根拠: PR #27 でハーネス（auto-mode 権限分類器）が merge を Merge Without Review と
  // 判定して GitHub API に届く前に止めた。権限判定は決定的なので再試行しても
  // 同じ理由で拒否されるだけで、run とトークン枠を無駄にする。
  // 一方で「必ず拒否される」とも言えない（PR #17 が未マージだった理由は記録が無く不明）。
  // だから呼び出しは残し、1回で判断する。
  const skill = read('.claude/skills/daily-jobs/SKILL.md');

  const calls = (skill.match(/pulls\/\$PR\/merge/g) || []).length;
  assert.equal(calls, 1, `merge の呼び出しが ${calls} 箇所ある。1回だけにすること`);

  // merge が再試行ループの中に入っていないこと
  const lines = skill.split('\n');
  const mi = lines.findIndex((l) => l.includes('pulls/$PR/merge'));
  const context = lines.slice(Math.max(0, mi - 6), mi + 1).join('\n');
  assert.doesNotMatch(context, /for\s+i\s+in|^\s*until\s|^\s*while\s/m,
    'merge が再試行ループの中にある。権限判定は決定的なので再試行しても拒否される');
  assert.match(skill, /試すのは1回だけ。再試行しない/, '1回だけという明示が無い');

  // 拒否理由を手順書に残す（次に同じ症状を見たとき照合できるように）
  assert.match(skill, /Merge Without Review/, '拒否理由が書かれていない');

  // エラー本文を捨てない。捨てると原因が分からなくなる（PR #17 がそれだった）
  const mergeLine = lines[mi];
  assert.doesNotMatch(mergeLine, />\s*\/dev\/null/, `merge の出力を捨てている: ${mergeLine.trim()}`);
  assert.match(skill, /失敗の本文を必ず出す/, 'エラー本文を残す明示が無い');

  // 結果をログに残す。これがあったから PR #27 の原因が分かった
  assert.match(skill, /`daily\/_log\/\$DATE\.md` の末尾に/,
    'マージできなかったことをログに追記する手順が無い');
});
