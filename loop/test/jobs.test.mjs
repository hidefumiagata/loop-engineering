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

test('マージ失敗時に成果物を失わない手順になっている', () => {
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  assert.match(skill, /3回とも失敗したら.*PR を残し/s);
  assert.match(skill, /成果物は PR に残っているので失われない/);
});

test('自動マージは mergeable の算出を待ってから叩く', () => {
  // 実測: PR #17 は作成直後 mergeable=null で、その状態で merge を叩くと
  // 405 Base branch was modified になる。数秒後には clean になり同じ呼び出しが通った。
  // これが daily-jobs の自動マージが失敗する主な原因だった。
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  assert.match(skill, /mergeable/,
    'mergeable を確認する手順が無い');
  assert.match(skill, /いきなり merge を叩かない/,
    'mergeable 未算出のまま merge を叩かせない明示が無い');
  // 待ちループが merge より前に書かれていること
  const wait = skill.indexOf('.mergeable | tostring');
  const merge = skill.indexOf('pulls/$PR/merge');
  assert.ok(wait > 0, 'mergeable のポーリングが無い');
  assert.ok(wait < merge, 'mergeable の待ちが merge より後に書かれている');
});

test('マージの再試行は回数で数え、エラー本文を捨てない', () => {
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  // $SECONDS はシェルの起動からの秒数。シェルが生きていると初回で打ち切られる。
  // 本文で「使ってはならない理由」として言及するのは許すので、コードブロックだけを見る
  const code = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  assert.ok(code.length > 0, 'bash のコードブロックが見つからない');
  assert.doesNotMatch(code, /\$SECONDS/,
    '$SECONDS で打ち切ると、シェルの生存時間に依存して再試行されなくなる');
  assert.match(skill, /試行回数で数える/,
    '再試行を回数で数える明示が無い');
  // 失敗本文を捨てていないこと（merge の行で >/dev/null していない）
  const mergeLines = skill.split('\n').filter((l) => /pulls\/\$PR\/merge/.test(l));
  assert.ok(mergeLines.length > 0, 'merge の呼び出しが無い');
  for (const l of mergeLines) {
    assert.doesNotMatch(l, />\s*\/dev\/null/,
      `merge の出力を捨てている。失敗の切り分けができなくなる: ${l.trim()}`);
  }
  assert.match(skill, /エラー本文を `>\/dev\/null` で捨ててはならない/,
    'エラー本文を捨てないことの明示が無い');
});

test('マージを諦めたときは理由をログに追記する手順がある', () => {
  // Step 4 でログを書いた時点ではマージ結果が分からないので、諦めたときだけ追記する。
  // 省くと「PR が残っているが理由がどこにも無い」状態になる（実測: PR #17）。
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  assert.match(skill, /daily\/_log\/\$DATE\.md` の末尾に/,
    'マージ失敗をログに追記する手順が無い');
  assert.match(skill, /PR は作り直さない/,
    '追記時に PR を作り直させない明示が無い');
});
