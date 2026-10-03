---
name: loop-engine
description: GitHub Issue 駆動の自律作業ループを1 run 分だけ進める。Claude Cloud の routine から定期実行される。pipeline モード（技術調査・プログラム構築・アイデア深堀）と panel モード（3LLMの合議）の両方を扱う。Issue のポーリング、受入基準の策定、作業、他社LLMによるレビュー、合議の集計、Issue への記録、ブランチと PR の更新を行う。
---

# loop-engine

このファイルが、ループの手順の**唯一の定義**である。
routine の保存プロンプトは「このファイルを読んで従え」とだけ言う。ロジックはすべてこことリポジトリ内にある。

## 絶対規則

1. **1 run で処理する Issue は `loop/config.json` の `issues_per_run` 件まで。** 既定 1 件。
   Pro プランは routines が 5 run/日 しかない。張り切って全部やろうとせず、1件を確実に前進させる。
2. **この手順書に書かれていない判断を足さない。** 迷ったら Issue にコメントして `loop:needs-human` を付け、
   人間に渡す。自分で決めてよいのは手順書が委ねている範囲だけ。
3. **他社LLMの呼び出しは必ず `node loop/bin/ask-llm.mjs` 経由。** 自分で `curl` を書いてはならない。
   APIキーはサンドボックス内に存在しない（Anthropic のプロキシが付与する）。キーを探さない、ログに出さない。
4. **`scores.json` を書き換えない。** あれは `aggregate.mjs` の出力である。数値を引用するときは必ずそこから取る。
5. **run の終わりに必ず Issue へ記録を残す。** 何もできなかった場合も、できなかったことを書く。
   黙って終わる run は、次の run から見て「何が起きたか分からない」状態を作る。
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
| `iteration` (Pro 既定) | 1イテレーション分を通す。pipeline なら work→review→判定、panel なら propose→evaluate→aggregate→decide |
| `phase` (Max 向け) | フェーズを1つだけ実行して終える |

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
3. どちらでも決まらなければ `research` を既定とし、そう判断したことを Issue にコメントする。

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
| `BLOCKED` | `phase: blocked` | `loop:blocked` + `loop:needs-human` | 理由を Issue に書く |

`iteration` が `max_iterations` を超えたら、verdict が `REVISE` でも `phase: blocked` にし、
`loop:needs-human` を付けて「上限 N 回に達した。現状の未達項目は…」と Issue に書く。

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

### phase: brief

1. `loop/prompts/roles/planner.md` と deliberation.md の brief 節に従い `projects/<slug>/brief.md` を書く。
   **「前提事実」節に、自分が調べた事実をすべて展開する。** Gemini と OpenAI はここに無いことを知りえない。
2. 同じ基準を `projects/<slug>/criteria.json` に `[{"id","text","weight"}]` で書き出す。
   `brief.md` の表と**1件もずれていないこと**を自分で確認する（`aggregate.mjs` は json のみ読む）。
3. `gemini:review` に `critique` スキーマで基準を批評させ、取り込む。
4. commit & push。Issue に `brief.md` の「決めたいこと」と基準表を投稿する
   （人間がこの段階で軌道修正できるようにするため）。
5. 状態を `phase: propose`、`panel_round: 1` にする。

`granularity: iteration` でも **brief の後は一度 run を終える。**
ブリーフは人間が目を通す価値がある分岐点であり、ここで止めることに意味がある。

### phase: propose

**この順序を守る。git 履歴が独立性の証跡になる。**

1. 自分の案を `projects/<slug>/proposals/claude.md` に書く
   （`loop/prompts/roles/proposer.md` の出力形式に従う。自分も同じ規律に従う）。
2. **それだけをコミットして push する:**
   ```bash
   git add projects/<slug>/proposals/claude.md
   git commit -m "propose(#<issue>): claude の案（他案取得前の単独コミット）"
   git push
   ```
3. その後で他の提案者を呼ぶ。`config.usecases.deliberation.proposers` から `claude` 以外を取る。

   > **提案の生成は数分かかることがある。** エージェントプロキシは1リクエスト約30秒で諦めるため、
   > `openai:propose` は `background: true` で非同期化してあり、`ask-llm.mjs` が内部でポーリングする
   > （最大 420 秒。`--max-wait` で変更可）。
   > **この呼び出しは Bash の `run_in_background: true` で実行すること。**
   > 前景で実行すると 120 秒で打ち切られ、`sleep` での待機は禁止されているため扱いに困る。
   > 完了通知を受けてから結果ファイルを読む。


   ```bash
   node loop/bin/ask-llm.mjs --spec gemini:propose --system loop/prompts/roles/proposer.md \
     --input projects/<slug>/brief.md --max-output-tokens 8000 \
     --out projects/<slug>/proposals/_gemini.md
   node loop/bin/ask-llm.mjs --spec openai:propose --system loop/prompts/roles/proposer.md \
     --input projects/<slug>/brief.md --max-output-tokens 8000 \
     --out projects/<slug>/proposals/_openai.md
   ```
4. **3案揃わなければ `loop:blocked` にして終える。2案で続行してはならない**
   （`min_proposers: 3`。2案の相互批評には決選投票が無く、合議として成立しない）。
   Issue に落ちた提案者と理由を書く。次の run で propose からやり直す。
5. 3案を A/B/C にランダム割り当てしてリネームし、対応表を書く。
   **`*.meta.json`（コスト記録）も一緒にリネームして残す。削除してはならない。**
   実コストの監査記録であり、消すと後からコスト表を検証できなくなる:
   ```bash
   # 割り当てはラウンドごとにランダムにする（毎回 claude=A だと著者が推測できる）
   # 例: shuf で順序を決める
   ```
   - `proposals/A.md` `B.md` `C.md`
   - `proposals/.authors.json` = `{"A":"gemini","B":"claude","C":"openai"}` のような対応表
   - 匿名化前のファイル（`claude.md` `_gemini.md` `_openai.md`）は**削除する**
6. 各案の冒頭に著者を示す記述が残っていないか確認する（モデルが「私は Gemini です」と書く場合がある）。
   あれば削る。
7. 状態を `phase: evaluate` にする。

### phase: evaluate

1. 評価者ごとに**提示順をシャッフルした**パケットを作る（`/tmp/eval-packet-<評価者>.md`）。中身:
   - `brief.md` 全文
   - A/B/C の本文（その評価者用の順序で）
   - `.authors.json` は**絶対に含めない**

   **各案の見出しは `## A` のように、ラベル1文字だけにする。**
   `## 案 A` のような装飾を付けると評価者が `label` に「案 A」を返し、集計が別案として扱う。
   （集計側でも正規化して吸収するが、そもそも揺らさないのが本筋）
2. `config.usecases.deliberation.evaluators` の各者を呼ぶ:
   ```bash
   node loop/bin/ask-llm.mjs --spec gemini:propose --system loop/prompts/roles/evaluator.md \
     --input /tmp/eval-packet-gemini.md --schema evaluation \
     --out projects/<slug>/evaluations/by-gemini.json
   node loop/bin/ask-llm.mjs --spec openai:evaluate --system loop/prompts/roles/evaluator.md \
     --input /tmp/eval-packet-openai.md --schema evaluation \
     --out projects/<slug>/evaluations/by-openai.json
   ```
3. Claude 自身も `evaluator.md` に従い、**同じスキーマで**採点して
   `projects/<slug>/evaluations/by-claude.json` に書く。自分の案も採点する
   （自己採点バイアスは `aggregate.mjs` が測るので、避けずに採点してよい）。
4. 状態を `phase: decide` にする。

### phase: decide（aggregate を含む）

1. 集計する。**出力を手で触らない:**
   ```bash
   node loop/bin/aggregate.mjs --dir projects/<slug>
   ```
2. `scores.json` の `unmet_criteria` に重み3の基準が含まれていて、
   `panel_round < config.defaults.max_panel_rounds` なら:
   - ギャップを `brief.md` の「前提事実」に追記する
   - `panel_round` を +1 し `phase: propose` に戻す（`proposals/` と `evaluations/` は退避して作り直す）
   - Issue に「どの基準も満たせなかったためラウンド2に入る」と書く
3. そうでなければ `decision.md` を書く。deliberation.md の構成に厳密に従い、
   **以下4節を省略してはならない:**
   - **各案の要旨** — 人間はここだけを読んで決める。スコアと推奨だけでは判断できない。
     案ごとに「何をする案か」「他案との違い」「犠牲にしているもの」を書く。
     ファイルへのリンクだけで済ませてはならない（作業ブランチ上のファイルは読まれない）
   - 不採用案から拾うべき要素
   - 保存すべき反対意見
   - この合議の限界（他社2者が環境に触れていないこと）

   加えて「集計上の注意」に `scores.json` の `warnings` を**そのまま全件**列挙する。
   自己採点バイアスや一致度の低さを隠してはならない。

   **`winner` と `winner_excl_self` が食い違っている場合は、スコア表に両方の順位を並べて示す。**
   総合首位が著者自身の採点で押し上げられている状態なので、どちらを推奨するかの判断根拠を
   質的に説明する（点数の再計算で押し通してはならない）。
4. commit & push。Issue には **`decision.md` の「各案の要旨」節をそのまま貼る**。
   そのうえでスコア表・推奨案・`warnings` を載せる。
   **人間は Issue しか見ないつもりで書くこと。** 作業ブランチ上のファイルを開かせてはならない。
5. 状態を `phase: handoff`、`awaiting_human: true` にし、`loop:needs-human` を付ける。
   **ここで必ず停止する。合議の結論を自動で確定させてはならない。**

### phase: handoff（人間の確定を受けて引き継ぐ）

このフェーズに入るのは、Issue に `loop:go` が付いている場合だけ
（`issue-state.mjs list` が `loop:needs-human` を `loop:go` 無しでは除外する）。

```bash
node loop/bin/issue-state.mjs decision <issue>
```

- `/decide <ラベル>` が取れたら、そのラベルの案を `plan.md` に落とす。
  採用案の「設計」を受入基準に翻訳し（`planner.md` の条件を満たす形で）、
  `decision.md` の `decided_by` を実行者名に更新する。
  状態を `mode: pipeline`、`phase: work`、`iteration: 1`、`usecase` は Issue のラベルに応じて
  `build` か `research` に切り替える。`loop:go` と `loop:needs-human` を外す。
- 取れなければ、Issue に「`/decide <ラベル>` の形でコメントしてください」と書き、
  `loop:go` を外して `loop:needs-human` のまま終える。

---

## Step 4. run の記録（毎 run 必須）

### 4-1. Issue に人間可読のコメントを投稿する

`gh issue comment` は GraphQL なので使えない。本文をファイルに書いてから:

```bash
node loop/bin/issue-state.mjs comment <issue> /tmp/run-comment.md
```

本文の形:

```markdown
### <フェーズ名> を実行しました — <YYYY-MM-DD HH:MM JST>

**やったこと**
（3〜6行。何を作ったか・何が変わったか）

**結果**
（pipeline なら verdict と未達項目。panel ならスコア表と推奨案）

**使った他社LLM**
| 役割 | プロバイダ:階層 | モデル | コスト |
| --- | --- | --- | --- |
| reviewer | gemini:review | gemini-3.1-flash-lite | USD 0.0053 |

**次にやること**
（次の run が何をするか。人間の操作が必要ならそれを明記）

<!-- 成果物: projects/<slug>/ / ブランチ: <branch> / PR: #<pr> -->
```

コストの行は `*.meta.json` の実測値から埋める。推定値を書かない。

### 4-2. 状態コメントを更新する

```bash
cat > /tmp/state.json <<'EOF'
{ ... }
EOF
node loop/bin/issue-state.mjs write <issue> /tmp/state.json
```

`history` に今回の 1 エントリを追加する（`{n, kind, by, at}` と、あれば `verdict` / `cost_usd`）。
`history` が 20 件を超えたら古いものから落とす（コメントが肥大すると読めなくなる）。

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
- `scores.json` / `*.meta.json` を手で編集・削除すること
- **`evaluations/by-*.json` を手で編集すること。** 評価者が返した出力は合議の証跡である。
  ラベルの表記ゆれやスキーマの軽微なずれは `aggregate.mjs` が吸収して警告に出すので、
  集計が通らないからといって評価結果を書き換えてはならない。
  どうしても集計できないなら `loop:blocked` にして人間に渡す
- `evaluations/` に `by-*.json` 以外のファイルを置くこと（評価者として誤集計されうる）
- APIキーを探す・表示する・ファイルに書くこと
- レビュアーや評価者を自分で代行したことを隠すこと
- 3案揃わない panel を2案で続行すること
- 合議の結論を人間の確定なしに実装へ進めること
