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
  // REST での PR 作成が書かれていること
  assert.match(skill, /repos\/\$REPO\/pulls/, 'REST で PR を作る');
});

test('PR 作成は POST で、PUT のフォールバックを残していない', () => {
  // PUT は PR 作成のメソッドではない。以前は PUT → 失敗 → POST の順で書かれていたため、
  // 毎回1回ぶん無駄な呼び出しが出ていた。
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  assert.match(skill, /-X POST "repos\/\$REPO\/pulls"/, 'POST で PR を作る');
  assert.doesNotMatch(skill, /-X PUT "repos\/\$REPO\/pulls"/,
    'PR 作成に PUT を使っている。PUT は作成のメソッドではない');
});

test('daily-jobs はマージしない', () => {
  // 根拠: 自動マージは3回の run すべて（PR #17・#27・#34）で auto モードの権限分類器に
  // Merge Without Review として拒否された。判定条件は「人間の approve が無い PR のマージ」で、
  // 「PR を作ってすぐ自分でマージする」この routine の流れは定義上これに当たる。
  // 呼び出すと PR 作成まで巻き添えで拒否された（PR #34）。だから呼び出し自体を置かない。
  const skill = read('.claude/skills/daily-jobs/SKILL.md');
  const code = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  assert.doesNotMatch(code, /\/merge\b|gh pr merge|auto-merge|merge_pull_request/,
    '手順のコードにマージ操作がある。分類器に拒否され、PR 作成まで巻き添えになる');
  assert.match(skill, /マージ API を呼ばない/, 'マージしないことが明示されていない');
  // 理由を手順書に残す（次に「試してみよう」と戻されないように）
  assert.match(skill, /Merge Without Review/, '拒否理由が書かれていない');
});

// ---- 脆弱性レポートのジョブ（paloalto / gitlab） ----
//
// 脆弱性情報は誤ると実害が出る。件数を埋めるための捏造と、
// 深刻度や影響バージョンの言い換えを、定義の文言として縛る。

test('脆弱性レポートのジョブが定義されている', () => {
  const jobs = loadJobs(JOBS_DIR, { all: true });
  const ids = jobs.map((j) => j.id);
  for (const id of ['paloalto-advisories', 'gitlab-advisories']) {
    assert.ok(ids.includes(id), `${id} が無い`);
  }
});

test('脆弱性レポートは0件を正常な結果として扱う', () => {
  // セキュリティリリースは毎日は出ない。0件のときに
  // 24時間より古いものを混ぜて件数を埋めるのが最も危険な失敗
  const jobs = loadJobs(JOBS_DIR, { all: true })
    .filter((j) => j.id.endsWith('-advisories'));
  assert.ok(jobs.length >= 2, `対象ジョブが ${jobs.length} 件しかない`);
  for (const j of jobs) {
    assert.match(j.body, /0件は正常な結果である/, `${j.id}: 0件を正常と明示していない`);
    assert.match(j.body, /件数を埋めるために24時間より古いものを混ぜてはならない|件数を埋めるために24時間より古いリリースを混ぜてはならない/,
      `${j.id}: 件数の捏造を禁じていない`);
    assert.match(j.body, /\*\*0件と書く\*\*/, `${j.id}: 0件を曖昧に書かせない明示が無い`);
  }
});

test('脆弱性レポートは一次情報の表記をそのまま写させる', () => {
  const jobs = loadJobs(JOBS_DIR, { all: true })
    .filter((j) => j.id.endsWith('-advisories'));
  for (const j of jobs) {
    assert.match(j.body, /そのまま写す/, `${j.id}: 表記をそのまま写す指示が無い`);
    assert.match(j.body, /丸めない/, `${j.id}: 丸めることを禁じていない`);
    assert.match(j.body, /自分で判断し直さない/, `${j.id}: 深刻度を再判定させない指示が無い`);
    // 読んでいないものを要約させない（daily-jobs 共通の規律）
    assert.match(j.body, /未読/, `${j.id}: 未読を明記させる指示が無い`);
    // CVE と深刻度と影響バージョンが成果物テンプレートに入っていること
    for (const field of ['CVE', '深刻度', '影響バージョン']) {
      assert.ok(j.body.includes(field), `${j.id}: 成果物に ${field} が無い`);
    }
  }
});

test('脆弱性レポートが一次情報の URL を明示している', () => {
  // 出典を間違えると実害が出る。定義に URL を書いておき、
  // run が検索で当てずっぽうに拾わないようにする
  const jobs = Object.fromEntries(
    loadJobs(JOBS_DIR, { all: true }).map((j) => [j.id, j.body]),
  );
  assert.match(jobs['paloalto-advisories'], /security\.paloaltonetworks\.com\/json/,
    'Palo Alto の JSON エンドポイントが書かれていない');
  assert.match(jobs['gitlab-advisories'], /docs\.gitlab\.com\/releases\/patch-releases\.xml/,
    'GitLab の移転先 Atom フィードが書かれていない');
  // 旧 URL を主たる取得先にしていないこと（301 で移転済み）
  assert.match(jobs['gitlab-advisories'], /301 で移転/,
    'GitLab の旧 URL が移転済みである注意書きが無い');
});
