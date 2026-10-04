---
name: daily-jobs
description: 毎日決まった時刻に実行される定期ジョブを1 run 分まとめて実行する。loop/jobs/ の定義（Hacker News Top10 要約、AIニュース5点など）に従って成果物を作り、PR を作って自動マージする。Issue は使わない。Issue 駆動のループ（loop-engine）とは別の routine から呼ばれる。
---

# daily-jobs

毎日同じ仕事をして成果物を作る routine の手順。**Issue 駆動のループとは別物である。**

| | loop-engine | daily-jobs |
| --- | --- | --- |
| 起動 | 毎時 cron。Issue をポーリング | 毎日 5:00 JST の cron |
| 入力 | GitHub Issue | `loop/jobs/*.md` の定義 |
| 終わり方 | 受入基準を満たすまで反復 | 1 run で完結。反復しない |
| 状態 | Issue の状態コメント | **持たない。** 毎回ゼロから作る |
| PR | 人間がマージする | **自動でマージする** |

**Issue を作らない・触らない・コメントしない。** この routine は Issue と無関係である。

## 絶対規則

1. **`loop/jobs/` の `enabled: true` のジョブをすべて実行する。** 一部だけ実行しない。
2. **1つのジョブが失敗しても、残りは実行する。** 失敗は記録して次へ進む。
3. **成果物を捏造しない。** 情報が取れなかったら「取れなかった」と書く。
   件数が揃わないなら、揃わなかった理由を成果物の冒頭に書く。
4. **GitHub の操作は REST だけ。** GraphQL はクラウドセッションから 403 で拒否される。
   `gh pr create` / `gh pr merge` は**使えない**。`gh api` を使う。
5. **他社LLMは呼ばない。** この routine は Claude 自身が調べて書く。
   `ask-llm.mjs` を使う必要はない。
6. `LOOP_DRY_RUN=1` のときは push・PR 作成・マージを行わず、何をするかだけ出力する。

---

## Step 1. 準備

```bash
node loop/bin/jobs.mjs list        # 有効なジョブを取得
date -u +%Y-%m-%d                  # 実行日（UTC）
```

**日付は UTC で取る。** 5:00 JST に動くので UTC では前日になる。
成果物の日付は「実行した日（JST）」を使う:

```bash
DATE=$(TZ=Asia/Tokyo date +%Y-%m-%d)
```

ジョブが0件なら何もせず終了する。

## Step 2. ブランチを作る

```bash
git fetch origin
git checkout -B "claude/daily-$DATE" origin/main
git rev-parse --abbrev-ref HEAD
```

**`claude/` 接頭辞は必須**（これ以外への push は拒否されうる）。
1 run につき1ブランチ。全ジョブの成果物を同じブランチに載せる。

## Step 3. ジョブを順に実行する

各ジョブについて:

1. `node loop/bin/jobs.mjs show <id>` で定義の本文を読む
2. 本文の「集めるもの」に従って調べる（`WebSearch` / `WebFetch`）
3. 本文の「作るもの」のテンプレートどおりに成果物を書く
4. `output` の `{date}` を `$DATE` に置いて保存する
   （例: `daily/hackernews-top10/2026-10-04.md`）
5. ディレクトリが無ければ作る

**失敗したジョブはそこで打ち切り、次のジョブへ進む。**
途中まで書けたファイルは**消す**。半端な成果物を残さない。
何が起きたかを Step 4 の実行ログに書く。

### 調べるときの規律

- **読んでいないものを要約しない。** 開けなかったら開けなかったと書く
- **日付を書く。** 「最新」と言うからには、いつの情報かが要る
- **一次情報を優先する。** 二次情報しか無いならその旨を書く
- 定義の本文にある文字数・件数の指定を守る。超えたら削る

## Step 4. 実行ログを書く

`daily/_log/$DATE.md` に、この run で何が起きたかを書く。**成果物とは別ファイル。**

```markdown
# 定期ジョブ実行ログ <DATE>

| ジョブ | 結果 | 成果物 |
| --- | --- | --- |
| hackernews-top10 | 成功 | daily/hackernews-top10/<DATE>.md |
| ai-news-5 | **失敗** | — |

## 補足
- ai-news-5: <何が起きたか。どこで止まったか>
- hackernews-top10: 10件中9件のみ（1件はリンク先が403だった）
```

**全ジョブが失敗した場合もログだけはコミットする。** 沈黙して終わらない。

## Step 5. コミットして PR を作り、マージする

```bash
git add -A
git commit -m "daily($DATE): <成功したジョブのid をカンマ区切り>"
git push -u origin HEAD
```

### PR を作る

`gh pr create` は GraphQL なので使えない。REST を使う。

```bash
REPO=$(node -e "import('./loop/bin/issue-state.mjs').then(m=>console.log(m.repoSlug()))")
cat > /tmp/pr.json <<EOF
{ "title": "daily($DATE): 定期ジョブの成果物",
  "head": "claude/daily-$DATE", "base": "main",
  "body": "<実行ログの表をそのまま貼る>\n\n自動生成・自動マージ。" }
EOF
PR=$(gh api -X PUT "repos/$REPO/pulls" --input /tmp/pr.json --jq .number 2>/dev/null \
  || gh api -X POST "repos/$REPO/pulls" --input /tmp/pr.json --jq .number)
echo "PR #$PR"
```

**Issue 番号を書かない。** `Closes #N` を入れてはならない。この routine は Issue と無関係で、
無関係な Issue を閉じてしまう事故になる。

### マージする

`gh pr merge` は GraphQL なので使えない。REST の merge を使う。

```bash
cat > /tmp/merge.json <<EOF
{ "merge_method": "squash", "commit_title": "daily($DATE): 定期ジョブの成果物 (#$PR)" }
EOF
gh api -X PUT "repos/$REPO/pulls/$PR/merge" --input /tmp/merge.json --jq '{merged, sha}'
```

**作成直後は `405 Base branch was modified` や `mergeable` 未算出で失敗することがある。**
GitHub がマージ可否を計算するまで数秒かかるため。失敗したら **5秒待って最大3回**まで再試行する。
3回とも失敗したら**マージを諦めて PR を残し**、実行ログと通知にその旨を書く。
成果物は PR に残っているので失われない。

```bash
# 再試行の例（前景で sleep を連ねない。until ループで待つ）
until gh api -X PUT "repos/$REPO/pulls/$PR/merge" --input /tmp/merge.json >/dev/null 2>&1; do
  [ $SECONDS -gt 60 ] && break
  sleep 5
done
```

マージ後、ブランチはリポジトリ設定（`delete_branch_on_merge`）で自動削除される。
自分で削除しなくてよい。

## Step 6. 通知

`PushNotification` で結果を知らせる。成功したジョブ数・失敗したジョブ・PR 番号・
マージできたかどうかを1〜2文で。

---

## 失敗したときの振る舞い

| 起きたこと | やること |
| --- | --- |
| 有効なジョブが0件 | 何もせず終了。ブランチも作らない |
| 一部のジョブが失敗 | 残りを実行し、ログに記録して PR を作る |
| 全ジョブが失敗 | 実行ログだけをコミットして PR を作りマージする。沈黙しない |
| push が拒否された | ブランチ名が `claude/` 始まりか確認する |
| PR 作成が失敗 | push 済みなので成果物は残る。通知とログに書いて終える |
| マージが3回失敗 | PR を残して終える。成果物は失われない |

## 禁止事項

- Issue を作る・触る・コメントすること
- PR 本文に `Closes #N` を書くこと（無関係な Issue を閉じてしまう）
- `main` へ直接 push すること
- 成果物を捏造すること。件数合わせのために中身の薄い項目を足すこと
- 読んでいない記事を要約すること
- 半端な成果物を残すこと（失敗したジョブのファイルは消す）
- `loop/jobs/` の定義を自分で書き換えること（定義を変えるのは人間の仕事）
