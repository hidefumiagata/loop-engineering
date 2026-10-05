---
name: loop-engine
description: GitHub Issue 駆動の自律作業ループを1 run 分だけ進める。Claude Cloud の routine から定期実行される。pipeline モード（技術調査・プログラム構築・アイデア深堀）と panel モード（3LLMの合議）の両方を扱う。Issue のポーリング、受入基準の策定、作業、他社LLMによるレビュー、合議の統合、状態コメントの更新、ブランチと PR の作成を行う。成果物は PR で読ませ、Issue には結果を書かない。
---

# loop-engine

このファイルが、ループの手順の**唯一の定義**である。
routine の保存プロンプトは「このファイルを読んで従え」とだけ言う。ロジックはすべてこことリポジトリ内にある。

## 絶対規則

1. **1 run で処理する Issue は `loop/config.json` の `issues_per_run` 件まで。** 既定 1 件。
   張り切って全部やろうとせず、1件を確実に前進させる。
   1 run を短く保つことが、トークン枠（5時間枠・週次枠）を食い潰さないための主な手段である。
2. **この手順書に書かれていない判断を足さない。** 迷ったら Issue にコメントして `loop:needs-human` を付け、
   人間に渡す。自分で決めてよいのは手順書が委ねている範囲だけ。
3. **他社LLMの呼び出しは必ず `node loop/bin/ask-llm.mjs` 経由。** 自分で `curl` を書いてはならない。
   APIキーはサンドボックス内に存在しない（Anthropic のプロキシが付与する）。キーを探さない、ログに出さない。
4. **機械集計の出力を書き換えない。** `synthesis-check.json` は `synthesis-check.mjs` の出力である。
   数値を引用するときは必ずそこから取る。
5. **Issue に成果物の内容を書かない。** Issue は「目的」と「状態」の置き場であって、成果物の置き場ではない。
   調査結果・レポート本文・合議の答え・案の要旨・スコア表・比較表などを
   Issue コメントに貼ってはならない。**成果物はリポジトリにあり、読む場所は PR である。**

   | 置き場 | 何を置くか |
   | --- | --- |
   | Issue 本文 | 人間が書いた目的・制約・受入のヒント |
   | Issue の状態コメント（1件） | 機械状態。フェーズ・反復数・ブランチ・PR番号・最終更新 |
   | Issue の追加コメント | **原則なし。** 例外は下記の「進められないとき」だけ |
   | PR | 成果物。レビューと参照はここで行う |
   | `projects/<slug>/` | 成果物の実体と過程の記録 |

   **run の終わりに必ず状態コメントを更新する。** 黙って終わる run は、
   次の run から見て「何が起きたか分からない」状態を作る。
   ただし更新するのは状態であって、結果の本文ではない。
6. **`LOOP_DRY_RUN=1` のときは push・コメント投稿・ラベル変更・他社LLM呼び出しを一切行わない。**
   代わりに「何をするつもりか」を順に標準出力に書いて終わる。
7. **GitHub の操作は REST だけを使う。** このクラウドセッションからは **GitHub GraphQL が 403 で拒否される**
   （実測。`"GitHub GraphQL is not available from Claude Code sessions; use the REST API"`）。
   `gh` の `--json` 系サブコマンドは GraphQL を使うため **すべて動かない**。下表の左を使ってはならない。

<!-- graphql-forbidden-table:start — この表は「使ってはいけないもの」の一覧なので、wiring テストの検出対象から外す -->
| 使えない（GraphQL） | 代わりに使うもの |
| --- | --- |
| `gh repo view --json` | `node loop/bin/issue-state.mjs` が `git remote` から導出する。自分で呼ぶ必要はない |
| `gh issue list --json` | `node loop/bin/issue-state.mjs list` |
| `gh issue view --json` | `gh api repos/{repo}/issues/{n}` |
| `gh issue edit --add-label` | `node loop/bin/issue-state.mjs sync-phase` / `labels` |
| `gh issue comment` | `node loop/bin/issue-state.mjs comment` |
| `gh label list` | `gh api repos/{repo}/labels` |
| `gh pr create` | `gh api -X POST repos/{repo}/pulls`（下記 work フェーズ参照） |
| `gh pr ready` | **使わない。** draft 解除は GraphQL 専用なので PR は最初から通常PRで作る |
<!-- graphql-forbidden-table:end -->

GitHub MCP ツールが使える場合でも**使ってはならない。** `loop/bin/*.mjs` は MCP を呼べないため、
MCP で回避すると「スクリプトでは再現できない手順」になり、次の run が同じ状態から再開できなくなる。

---

## Step 0. 準備

```bash
cat loop/config.json                                  # preset / providers / usecases を把握する
node loop/bin/issue-state.mjs list                    # 対象 Issue を古い順に取得
```

`config.presets[config.preset]` から `granularity` と `issues_per_run` を読む。

| granularity | 1 run でやること |
| --- | --- |
| `iteration` | 1イテレーション分を通す。pipeline なら work→review→判定、panel なら propose→challenge→revise→synthesize。**run が少ないとき向け** |
| `phase` | フェーズを1つだけ実行して終える。**run が潤沢なとき向け**（毎時実行など）。1 run が短くなるのでトークン枠を食い潰しにくい |

`list` が空なら、**何もせずに終了する**。Issue も作らない。リトライループも組まない。
「対象 Issue なし」とだけ標準出力に書く。

> `list` は REST の `/issues?labels=loop` を引く。検索インデックスを経由しないので、
> 作成直後の Issue もすぐ取得できる。空振りしたなら本当に対象が無い（または
> `loop:stop` / `loop:done` / `loop:blocked` / `loop:needs-human` で除外されている）。

## Step 1. 対象 Issue の選定

`list` の先頭（最終更新が最も古いもの）を取る。これがラウンドロビンになり、
1件の重い Issue が他を飢餓状態にするのを防ぐ。

`issues_per_run` が 2 以上なら先頭からその件数を順に処理する。1件目で失敗しても2件目に進む。

### 用途の決め方

1. `use:*` ラベルが付いていればそれを使う。複数付いていたら `loop:blocked` にして人間に渡す。
2. ラベルが無ければ Issue 本文から読む。本文は `gh api repos/{repo}/issues/<issue> --jq .body` で取る。
   `.github/ISSUE_TEMPLATE/loop-task.yml` の「用途」ドロップダウンは本文に `### 用途` 節として現れ、
   値は `技術調査 (research)` のように **括弧内に機械キーを含む**。
   そのキー（`research` / `build` / `ideation` / `deliberation`）を取る。取れたらラベルを付ける:
   ```bash
   node loop/bin/issue-state.mjs labels <issue> add "use:<キー>"
   ```
3. どちらでも決まらなければ `research` を既定とし、そう判断した旨だけを1〜2行で Issue にコメントする
   （4-1 の例外に当たる。結果は書かない）。

`### 最大反復回数` 節があれば先頭の数字を `max_iterations` に使う。無ければ `config.defaults.max_iterations`。

## Step 2. 状態の読み取り、または初期化

```bash
node loop/bin/issue-state.mjs read <issue>
```

### 状態がある場合

**まず `state.branch` に移る。これを飛ばしてはならない。**
セッションは毎回まっさらな VM で始まり、`main` ではなく自動生成の `claude/<形容詞>-<名前>`
ブランチに居ることがある（実測）。checkout を省くと、再開した run が設計外のブランチに push し、
Issue と成果物の対応が切れる。

```bash
git fetch origin
# リモートに既にあればそれを追跡し、無ければ origin/main から作る
git checkout -B "<state.branch>" "$(git rev-parse --verify --quiet "origin/<state.branch>" >/dev/null \
  && echo "origin/<state.branch>" || echo "origin/main")"
git rev-parse --abbrev-ref HEAD    # state.branch と一致しているか必ず確認する
```

一致しなければ、そこで止めて Issue に書き `loop:blocked` にする。違うブランチで作業を続けない。

そのうえで `state.phase` から再開する。**前回の run が途中で落ちた場合、状態コメントは更新されていない。**
その場合は同じフェーズをもう一度実行することになる。各フェーズは冪等に書かれているので、
やり直して構わない（既にあるファイルは上書きされる）。

**`state.phase` が `blocked` または `done` だったとき**（この手順書に対応する節が無い値）:
古い状態、または人間が手で書き換えた状態である。**推測で再開しない。**
`loop:needs-human` を付け、Issue に
「`state.phase` が `<値>` で再開先が決まらない。どのフェーズから再開するかを指示してほしい」
と書いて run を終える。`history` の最後の `kind` から類推してはならない。

### 状態が無い場合（ブートストラップ）

1. `slug` を決める: `<4桁ゼロ埋めIssue番号>-<タイトルの英数字ケバブ>`。
   タイトルが日本語のみなら英数字部分が空になるので、その場合は Issue のラベルや本文から
   英語の短い語を2〜3語作る（例: `0013-agent-arch`）。日本語をそのままディレクトリ名にしない。
2. ブランチを作る: `claude/loop-<issue>-<slugの後半>`。
   **`claude/` 接頭辞は必須**（これ以外のブランチへの push は Claude Cloud 側で拒否されうる）。

   > **セッションは `main` ではなく、自動生成された `claude/<形容詞>-<名前>` ブランチで始まることがある**（実測）。
   > そこに成果物を置くと、Issue と成果物の対応が追えなくなる。
   > だから現在のブランチを確認せず、**無条件に `-B` で設計どおりのブランチへ移る。**

   ```bash
   git fetch origin
   git checkout -B claude/loop-<issue>-<name> origin/main
   git rev-parse --abbrev-ref HEAD    # 設計どおりの名前になっているか必ず確認する
   ```
3. `projects/<slug>/` を作り、`README.md` に Issue へのリンクと目的を書く。
4. 状態を書く。`mode` は `config.usecases[usecase].mode`。
   初期 `phase` は pipeline なら `plan`、panel なら `brief`。
   `max_iterations` は Issue 本文に指定があればそれ、無ければ `config.defaults.max_iterations`。
5. フェーズラベルを揃える: `node loop/bin/issue-state.mjs sync-phase <issue> <phase>`

---

## Step 3-A. pipeline モード

用途別の指示 `loop/prompts/usecases/<usecase>.md` を**必ず読んでから**作業する。

### phase: plan

`loop/prompts/roles/planner.md` に従う。要点だけ再掲する。

1. 目的を自分の言葉で1段落に再定義する。
2. 受入基準を 4〜8 件起草する（ID `a1..`、重み 3/2/1、重み3は 2〜4 件）。
3. 批評させる:
   ```bash
   # パケットを組む: 再定義した目的 + 起草した基準のみ
   node loop/bin/ask-llm.mjs --spec gemini:review \
     --system loop/prompts/roles/planner.md \
     --input /tmp/plan-packet.md --schema critique \
     --out projects/<slug>/journal/001-plan-critique.json
   ```
4. 批評を取り込み `projects/<slug>/plan.md` を書く。
   **取り込まなかった指摘は `plan.md` の末尾に「採用しなかった批評とその理由」として残す。**
5. 状態を `phase: work`、`iteration: 1` にする。

`granularity: iteration` のときは、ここで止めずに続けて work に進む。

### phase: work

`loop/prompts/roles/worker.md` と用途別指示に従う。

- 2回目以降は、直前の `journal/*-review.json` の `gaps` をチェックリストとして最優先で潰す。
- 成果物（`report.md` または `src/`）を更新する。

**`usecase: research` のときは3段構成で行う。** 詳細は `research.md` にあるが、骨格は次のとおり:

1. **あなたが公式サイト・公式ドキュメントだけを調べ**、`findings/official.md` に書く。
   ブログや第三者の記事は読まない
2. `research-community` サブエージェントを起動し、**公式以外**だけを調べさせて
   `findings/community.md` に書かせる。
   渡すのは調査テーマ・受入基準・「公式に記述が無かった論点」・出力先パス。
   **段階1の結果そのものは渡さない**（公式の記述に引きずられ、独立した調査にならない）
3. `research-reconcile` サブエージェントを起動し、2つの結果を突き合わせて
   **レポート本文をテキストで返させる。サブエージェントにファイルを書かせない。**
   渡すのは `projects/<slug>/findings/official.md`・`projects/<slug>/findings/community.md`・
   `projects/<slug>/plan.md` のパス。

   > **ハーネスはサブエージェントによる report ファイルの書き込みを拒否する。**
   > `Subagents should return findings as text, not write report files` というエラーになり、
   > エージェント定義の `tools` に `Write` を書いても通らない。だから
   > `research-reconcile` から `Write` を外し、テキストを返す契約に変えてある。
   > 実測: Issue #13 と #19 がこれで2回止まった。出力先パスを渡しても解決しない。

   **返ってきた本文を、あなたが `projects/<slug>/report.md` に一字一句変えずに保存する。**
   これは代行ではなく転記である。**内容に手を入れてはならない** —
   編集・要約・追記・節の並べ替え・表の作り直しをしない。
   前置きや後書きが混じっていたらそこだけ落とし、本文は変えない。
   `journal/NNN-work.md` に「突き合わせは `research-reconcile` が行い、本体は転記のみ」と書く。

   突き合わせそのものを自分でやってはならない。このエージェントには Web を引く手段を
   与えていない。突き合わせ役が追加調査で穴を埋めると、照合の意味が消えるため

**サブエージェントが起動できない場合、自分で代行してはならない。**
`loop:blocked` にして Issue に理由を書く。1人で公式と非公式を両方調べると、
両者が文脈の中で混ざり、「公式に書いてあった気がするが実はブログだった」という
取り違えが後から検証できなくなる。分離そのものがこの用途の価値である。
- `journal/NNN-work.md` に過程を残す（成果物とは別ファイル。worker.md の4点を書く）。
- 調査系は `sources.md` に出典と取得日を追記する。
- commit & push:
  ```bash
  git add -A && git commit -m "work(#<issue>): <何をしたか>" && git push -u origin HEAD
  ```
- PR が無ければ作る。**`gh pr create` は GraphQL なので使えない。REST を使う:**
  ```bash
  REPO=$(node -e "import('./loop/bin/issue-state.mjs').then(m=>console.log(m.repoSlug()))")
  cat > /tmp/pr.json <<'EOF'
  { "title": "loop(#<issue>): <タイトル>", "head": "<branch>", "base": "main",
    "body": "Issue #<issue> の自動作業。受入基準は projects/<slug>/plan.md 参照。\n\nCloses #<issue>" }
  EOF
  gh api -X POST "repos/$REPO/pulls" --input /tmp/pr.json --jq .number
  ```
  **draft では作らない。** draft → ready の解除は GraphQL 専用でクラウドから叩けないため、
  開いたまま解除できない PR が残ってしまう。完了の signal は `loop:done` ラベルが持つので draft は不要。

  **本文の末尾に `Closes #<issue>` を必ず入れる。** マージ時に Issue が自動でクローズされる。
  これが無いと、完了した Issue が open のまま残り、`loop` ラベル付きなので
  **次の run がまた拾ってしまう**（`loop:done` で除外されるが、ラベルを外すと再開する）。

  作成した PR 番号を状態の `pr` に入れる。
- 状態を `phase: review` にする。

### phase: review

1. **レビューパケット**を組む（`/tmp/review-packet.md`）。中身はこの順:
   - `plan.md` の受入基準（表のまま）
   - 成果物本文（`report.md` 全文、またはコードなら `src/README.md` + 変更ファイル一覧 + テスト実行結果）
   - `git diff origin/main...HEAD --stat` の出力
   - 過去のレビュー履歴の要約（`verdict` と `gaps` のみ。全文は入れない）
2. 呼ぶ:
   ```bash
   # jq はサンドボックスに保証されていないので node で読む
   REVIEWER=$(node -e "console.log(require('./loop/config.json').usecases['<usecase>'].reviewer)")
   node loop/bin/ask-llm.mjs --spec "$REVIEWER" \
     --system loop/prompts/roles/reviewer.md \
     --input /tmp/review-packet.md --schema verdict \
     --out projects/<slug>/journal/NNN-review.json
   ```
3. 結果を `journal/NNN-review.md` に人間可読で書き出す。**冒頭に必ず次の1行を置く:**
   ```
   reviewer: gemini:review (gemini-3.1-flash-lite) / cost: USD 0.0053
   ```
   モデル名とコストは `journal/NNN-review.json.meta.json` から取る。
4. 判定に従って状態を更新する。

| verdict | 次の状態 | ラベル | 追加の操作 |
| --- | --- | --- | --- |
| `PASS` | `phase: done` | `loop:done` | PR に完了コメントを投稿する（draft 解除は不要。最初から通常PR） |
| `REVISE` | `iteration` を +1 して `phase: work` | `loop:work` | — |
| `BLOCKED` | **`phase` は `work` のまま変えない** | `loop:blocked` + `loop:needs-human` | 理由を Issue に書く |

`iteration` が `max_iterations` を超えたら、verdict が `REVISE` でも
`loop:blocked` + `loop:needs-human` を付け、`phase` は `work` のまま残して
「上限 N 回に達した。現状の未達項目は…」と Issue に書く。

> **★ blocked はラベルで表す。`state.phase` に `blocked` を書かない。**
> `state.phase` は「次の run がどこから再開するか」を表す値である。
> ここに `blocked` を書くと、人間がラベルを外したあと**再開先が無くなる**。
> この手順書に `### phase: blocked` の節は無いので、拾った run は手順書に無い判断を
> 迫られる（絶対規則2に反する）。実測: Issue #13 が `phase: blocked` のまま残り、
> ラベルを外しても段階3へ戻れない状態になった。
> 止めるときは**ラベルだけ**を付け、`phase` は再開すべきフェーズに保つ。
> これは synthesize の失敗時の扱い（`phase: synthesize` のまま変えない）と同じ原則である。

### レビュアーが呼べなかったとき

`ask-llm.mjs` が非ゼロ終了した場合の扱いを、エラーの種類で分ける。

`ask-llm.mjs` は 403/401 を2種類に分けて診断を出す。**エラー本文の `[診断]` 行をそのまま Issue に転記する。**

| 状況 | 見分け方 | 対応 |
| --- | --- | --- |
| 429（レート上限） | HTTP 429 | このフェーズを**実行せずに終える**。状態は変えない。Issue に「Geminiのレート上限により次回に持ち越し」と書く。次の run で再試行される |
| ネットワーク拒否 | `[診断] x-deny-reason=...` | `loop:blocked` + `loop:needs-human`。`loop-env` の **Network access** がホストを許していない。Issue にそう書く |
| キーが未付与 | `[診断] 認証情報がプロキシで付与されていません` | `loop:blocked` + `loop:needs-human`。リクエストはプロバイダに届いているが**キーが付いていない**。`loop-env` の **API credentials** にそのホストの credential が登録されているか（一覧が `Not sent` になっていないか）を確認するよう Issue に書く |
| キーが無効 | `[診断] 認証情報が拒否されました` | 同上だが、キー自体が誤っている・期限切れ・ヘッダ指定が違う可能性。Gemini なら Custom header の **Prefix が空になっているか**を確認するよう書く |
| それ以外（スキーマ違反・5xx継続など） | — | Claude 自身がレビューを代行する。**ただし `journal/NNN-review.md` の冒頭を必ず `reviewer: claude (fallback — gemini が <理由> で失敗)` にし、Issue コメントにも同じ断り書きを入れる。** 黙って自己採点してはならない |

`403` だからといって一律 blocked にしない。上の表で**どちらの 403 か**を見分けてから書く。
原因の切り分けを間違えると、人間が間違った設定画面を何度も見ることになる。

---

## Step 3-B. panel モード

`loop/prompts/usecases/deliberation.md` を**必ず読んでから**作業する。
以下は実行順の骨格であり、各フェーズの中身の規律はそちらにある。

```
brief → propose → challenge → revise → synthesize → done
        3者が      自分以外を   指摘を受けて  別エージェントが
        意見を出す  敵対的に攻撃 各自が改稿   結論をまとめる
```

**採点はしない。** 評価の役割は敵対的レビュー（challenge）が担う。

### phase: brief

1. `loop/prompts/roles/planner.md` と deliberation.md の brief 節に従い `projects/<slug>/brief.md` を書く。
   **「前提事実」節に、自分が調べた事実をすべて展開する。** Gemini と OpenAI はここに無いことを知りえない。
2. 同じ基準を `projects/<slug>/criteria.json` に `[{"id","text","weight"}]` で書き出す。
   敵対的レビューは「どの基準を満たせなくなるか」で攻撃するため、基準が曖昧だと攻撃も曖昧になる。
3. `gemini:review` に `critique` スキーマで基準を批評させ、取り込む。
4. commit & push。**Issue には投稿しない。** `brief.md` はブランチ上にあり、PR で読める。
5. 状態を `phase: propose`、`panel_round: 1` にする。

`granularity: iteration` でも **brief の後は一度 run を終える。**
ブリーフは人間が目を通す価値がある分岐点であり、ここで止めることに意味がある。

### phase: propose（3者が意見を出す）

**この順序を守る。git 履歴が独立性の証跡になる。**

1. 自分の案を `projects/<slug>/proposals/claude.md` に書く
   （`loop/prompts/roles/proposer.md` の出力形式に従う。自分も同じ規律に従う）。
2. **それだけをコミットして push する:**
   ```bash
   git add projects/<slug>/proposals/claude.md
   git commit -m "propose(#<issue>): claude の案（他案取得前の単独コミット）"
   git push
   ```
3. その後で他の提案者を呼ぶ。`config.usecases.<usecase>.proposers` から `claude` 以外を取る。

   > **提案の生成は数分かかる。** `openai:propose` は `background: true` で非同期化してあり、
   > `ask-llm.mjs` が内部でポーリングする。**Bash の `run_in_background: true` で実行すること。**

   > **`--max-output-tokens` を 16000 より下げない。** `gpt-5.5` は `reasoning_effort: high` で
   > 推論トークンも出力に数えるため、8000 では本文が出来上がる前に打ち切られる。
   > 打ち切られると再実行することになり、**1回目の課金は `*.meta.json` にも残らないまま消える**
   > （実測: Issue #10 で実際の出力は 10,705 / 15,612 トークン。初回 8000 で打ち切られ再実行した）。

   ```bash
   node loop/bin/ask-llm.mjs --spec gemini:propose --system loop/prompts/roles/proposer.md \
     --input projects/<slug>/brief.md --max-output-tokens 16000 \
     --out projects/<slug>/proposals/_gemini.md
   node loop/bin/ask-llm.mjs --spec openai:propose --system loop/prompts/roles/proposer.md \
     --input projects/<slug>/brief.md --max-output-tokens 16000 \
     --out projects/<slug>/proposals/_openai.md
   ```
4. **3案揃わなければ `loop:blocked` にして終える。2案で続行してはならない**（`min_proposers: 3`）。
   敵対的レビューは「自分以外の2案を攻撃する」形なので、2案だと各自が1案しか攻撃できず、
   攻撃の重なりが消えて検証にならない。
5. 3案を A/B/C に**ランダム割り当て**してリネームし、対応表を書く。
   **`*.meta.json`（コスト記録）も一緒にリネームして残す。削除してはならない。**
   - `proposals/A.md` `B.md` `C.md`
   - `proposals/.authors.json` = `{"A":"gemini","B":"claude","C":"openai"}`
   - 匿名化前のファイル（`claude.md` `_gemini.md` `_openai.md`）は**削除する**
6. 各案の冒頭に著者を示す記述が残っていないか確認する（「私は Gemini です」等）。あれば削る。
7. 状態を `phase: challenge` にする。

### phase: challenge（自分以外を敵対的レビュー）

**各者には「自分が書いた案を除いた2案」だけを渡す。** ここが最も間違えやすい。
`.authors.json` を見て、その者が書いた案を**必ず除外**する。自分の案を攻撃させると
自己批判か自己弁護のどちらかになり、どちらも議論にならない。

1. 攻撃者ごとにパケットを作る（`/tmp/challenge-packet-<攻撃者>.md`）。中身:
   - `brief.md` 全文
   - **その攻撃者が書いた案を除いた2案**の本文。見出しは `## A` のようにラベル1文字だけ
   - `.authors.json` は**渡さない**（誰の案かは伏せたまま）
   - 提示順は攻撃者ごとにシャッフルする
2. 呼ぶ。スキーマは `challenge`:
   ```bash
   node loop/bin/ask-llm.mjs --spec gemini:propose --system loop/prompts/roles/challenger.md \
     --input /tmp/challenge-packet-gemini.md --schema challenge \
     --out projects/<slug>/challenges/by-gemini.json
   node loop/bin/ask-llm.mjs --spec openai:propose --system loop/prompts/roles/challenger.md \
     --input /tmp/challenge-packet-openai.md --schema challenge \
     --out projects/<slug>/challenges/by-openai.json
   ```
3. Claude 自身も `challenger.md` に従い、**自分の案を除いた2案**を同じスキーマで攻撃し
   `challenges/by-claude.json` に書く。
4. **`*.meta.json` は `challenges/` に置かない。** `journal/` に移す
   （`by-*.json` の glob に `by-*.json.meta.json` が引っかかるため）。
5. 攻撃者が欠けた場合は**停止しない**。欠けた事実を記録して進む。
   提案と違い、攻撃の欠落は議論を無効にはしない（その案への攻撃が1件減るだけ）。
6. 状態を `phase: revise` にする。

### phase: revise（指摘を受けて各自が改稿）

**各者には「自分の案」と「自分の案への指摘」だけを渡す。他案は渡さない。**
他案を見せると寄せにいってしまい、3つの独立した答えという前提が崩れる。

1. 改稿者ごとにパケットを作る（`/tmp/revise-packet-<改稿者>.md`）。中身:
   - `brief.md` 全文
   - **その者が書いた案**（`.authors.json` で特定する）
   - `challenges/by-*.json` から、**その案を対象とした指摘だけ**を抜き出したもの。
     誰の指摘かは伏せ、`批評者1` `批評者2` として示す
2. 呼ぶ。スキーマは**使わない**（改稿後の案を Markdown で返させる）:
   ```bash
   node loop/bin/ask-llm.mjs --spec gemini:propose --system loop/prompts/roles/reviser.md \
     --input /tmp/revise-packet-gemini.md --max-output-tokens 16000 \
     --out projects/<slug>/proposals/<geminiのラベル>.v2.md
   ```
   OpenAI も同様（`run_in_background: true` で実行する）。
   **propose と同じ理由で `--max-output-tokens` を 16000 より下げない。**
3. Claude 自身も `reviser.md` に従って自案を改稿し `<claudeのラベル>.v2.md` に書く。
4. 改稿が取得できなかった案は、**初稿をそのまま `.v2.md` にコピーする**。
   欠けたままにすると統合役の入力が揃わない。コピーした事実を `journal` に書く。
5. 状態を `phase: synthesize` にする。

### phase: synthesize（別エージェントが結論をまとめる）

**ここが成果物である。そして、あなた自身は書かない。**

3案のうち1つはあなたが書いている。あなたが統合すると自案を土台にする動機が構造的に残る。
`panel-synthesizer` サブエージェントは独立した文脈で起動され、どれがあなたの案かを知らない。

1. `panel-synthesizer` サブエージェントを起動する。渡すもの:
   - `brief.md` のパス
   - `proposals/A.v2.md` `B.v2.md` `C.v2.md` のパス（**改稿後**を渡す。初稿ではない）
   - `challenges/by-*.json` のパス
   - 出力先 `projects/<slug>/answer.md` と `projects/<slug>/provenance.json`

   **`.authors.json` のパスは渡さない。内容も伝えない。**
   「どれがあなたの案か」を示唆する発言もしない。

   **`panel-synthesizer` が起動できない、または `answer.md` / `provenance.json` を
   書き込めないとき:** **あなたが代行してはならない。**
   `loop:blocked` と `loop:needs-human` を付け、Issue に「何が起きたか」と
   「次に何をすればよいか」を書いて run を終える。
   状態は `phase: synthesize` のまま変えない（解消後に同じフェーズから再開する）。

   **黙って同じフェーズをやり直して終わってはならない。**
   記録を残さずに終えると、失敗した run が毎時積み上がっていても誰も気づけない。

   この規定は、レビュアーの失敗には5分岐の対応表があるのに統合役の失敗には手順が無い、
   という非対称を埋めるためのものである。**まだ実際には起きていない失敗への備えであり、
   実測に基づく記述ではない**（PR #15 は Issue #10 の滞留を根拠として挙げていたが、
   これは誤読だった。#10 は次の run が正常に synthesize を完了させている）。

2. **自案への偏りを機械的に確認する:**
   ```bash
   node loop/bin/synthesis-check.mjs --dir projects/<slug>
   ```
   偏りが警告されたら、**サブエージェントに差し戻して書き直させる**（警告文をそのまま渡す）。
   あなたが自分で直してはならない。直した時点で別エージェントである意味が消える。
   `synthesis-check.json` は手で編集しない。

3. commit & push。

4. **PR を作る**（pipeline の work フェーズと同じ REST 呼び出し）:
   ```bash
   REPO=$(node -e "import('./loop/bin/issue-state.mjs').then(m=>console.log(m.repoSlug()))")
   cat > /tmp/pr.json <<'EOF'
   { "title": "deliberation(#<issue>): <テーマ>", "head": "<branch>", "base": "main",
     "body": "Issue #<issue> の合議の結論。\n\n- 結論: projects/<slug>/answer.md\n- 寄与比率: A xx% / B xx% / C xx%（synthesis-check.json）\n- 敵対的レビューの severity: A <値> / B <値> / C <値>\n\nCloses #<issue>" }
   EOF
   gh api -X POST "repos/$REPO/pulls" --input /tmp/pr.json --jq .number
   ```
   PR 本文には**結論の要旨・寄与比率・severity** を載せる。
   マージする人が「何が結論か」「自案に偏っていないか」「どの案が攻撃に耐えたか」を
   PR 画面だけで判断できるようにする。

5. `phase: done`、`loop:done`。**マージはしない。人間に委ねる**

**`require_human_decision` は `false`。承認待ちで止めない。**
人間が追加の論点や反証を Issue にコメントし `loop:go` を付けたら、
次の run がそれを `brief.md` の「前提事実」に取り込んで `propose` からやり直す。

---

## Step 4. run の記録（毎 run 必須）

### 4-1. Issue にコメントしない（原則）

**成果物の内容を Issue に書いてはならない。** 進捗も結果も状態コメント（4-2）が持つ。
run ごとに報告コメントを積むと、Issue が読めなくなり、成果物の正がどこにあるか曖昧になる。

やったこと・使った他社LLM・コストは `journal/NNN-*.md` と `*.meta.json` に残す。
そこが一次記録であり、PR で読める。

**コメントしてよいのは、人間が動かないと進めないときだけ。** 次の3つに限る。

| 場面 | 書くこと |
| --- | --- |
| `loop:blocked` にするとき | 何が起きて、何を確認・修正すればよいか。`[診断]` 行があればそのまま転記する |
| `loop:needs-human` を付けるとき | 人間に何を判断・操作してほしいか |
| 用途を本文から推測で決めたとき | そう判断した旨（1〜2行） |

いずれも**短く、対処だけ**を書く。調査結果やレポート本文を添えない。

```bash
# 上の3場面に当たるときだけ
node loop/bin/issue-state.mjs comment <issue> /tmp/blocked.md
```

成果物を読ませたいときは **PR を案内する**。本文を Issue に貼らない。

### 4-2. 状態コメントを更新する（毎 run 必須）

```bash
cat > /tmp/state.json <<'EOF'
{ ... }
EOF
node loop/bin/issue-state.mjs write <issue> /tmp/state.json
```

`history` に今回の 1 エントリを追加する（`{n, kind, by, at}` と、あれば `verdict` / `cost_usd`）。
`history` が 20 件を超えたら古いものから落とす（コメントが肥大すると読めなくなる）。

**`artifacts` に成果物のファイル名を入れる。** `projects/<slug>/` からの相対パスで、
人間が読むべきものだけを 2〜5 件。状態コメントがこれを GitHub のリンクに展開する。

| 用途 | 入れるもの |
| --- | --- |
| research | `["report.md", "sources.md"]` |
| build | `["src/README.md"]` |
| ideation | `["report.md"]` |
| deliberation | `["answer.md", "synthesis-check.json"]` |

中間ファイル（`findings/` や `journal/`）は入れない。一式は「一式」行のリンクから辿れる。
**Issue に本文を貼らない代わりに、リンクで辿れるようにするのがこの欄の役目である。**

### 4-3. ラベルを状態に合わせる

フェーズラベルの入れ替えは専用コマンドに任せる。`loop` / `use:*` / 制御ラベルには触らない作りになっている。

```bash
node loop/bin/issue-state.mjs sync-phase <issue> <phase>
```

制御ラベル（`loop:needs-human` / `loop:go` / `loop:stop`）は別に操作する:

```bash
node loop/bin/issue-state.mjs labels <issue> add    loop:needs-human
node loop/bin/issue-state.mjs labels <issue> remove loop:go loop:needs-human
```

### 4-4. push を確認する

未コミットの変更が残っていないか確認する。残っていたらコミットして push する。
`projects/<slug>/loop.json` に状態のミラーを書いておく（正は Issue コメント。
ブランチ上にも残しておくと PR を見ただけで経緯が追える）。

---

## 失敗したときの振る舞い

| 起きたこと | やること |
| --- | --- |
| 対象 Issue が無い | 何もせず「対象なし」と出力して終了 |
| git push が拒否された | ブランチ名が `claude/` 始まりか確認する。違えば作り直す。それでも駄目なら `loop:blocked` |
| 他社LLMが 429 | そのフェーズを実行せず状態を変えずに終える。Issue に持ち越しを記録 |
| 他社LLMが 403 / x-deny-reason | `loop:blocked` + `loop:needs-human`。`loop-env` の設定を疑うよう記録 |
| 構造化出力が壊れている | 1回だけ再実行する。それでも駄目なら上表の「それ以外」に従う |
| 自分が何をすべきか分からなくなった | 推測で進めない。Issue に状況を書いて `loop:needs-human` |

どの場合も **Step 4-1 の Issue コメントは必ず投稿する。** 沈黙して終わらない。

## 禁止事項

- `main` へ直接 push すること
- `loop` ラベルが付いていない Issue を触ること
- Issue を新規作成すること（このループは既存 Issue に応答するだけ）
- `synthesis-check.json` / `*.meta.json` を手で編集・削除すること
- **`challenges/by-*.json` を手で編集すること。** 攻撃者が返した出力は議論の証跡である。
  スキーマの軽微なずれで扱いに困るなら `loop:blocked` にして人間に渡す
- `challenges/` に `by-*.json` 以外のファイルを置くこと（`*.meta.json` は `journal/` へ）
- **攻撃者に自分の案を渡すこと。** 自己批判か自己弁護にしかならず、議論にならない
- **改稿者に他案を渡すこと。** 寄せにいってしまい、3つの独立した答えという前提が崩れる
- **統合を自分でやること。** `panel-synthesizer` サブエージェントの仕事である。
  偏りを指摘されたときも、自分で直さずサブエージェントに差し戻す
- **`.authors.json` を攻撃者・改稿者・統合役に渡すこと**（改稿者には自分の案だけを渡す。
  どれが自分の案かは呼び出し側が `.authors.json` で特定し、本人には伝えない）
- APIキーを探す・表示する・ファイルに書くこと
- レビュアーや攻撃者を自分で代行したことを隠すこと
- 3案揃わない panel を2案で続行すること
