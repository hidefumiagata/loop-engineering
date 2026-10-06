# セットアップ

所要 20〜30分。手順 4 以降は claude.ai 上のブラウザ操作が必要。

前提: Claude **Pro / Max** のいずれか（API credentials は Pro と Max のみ）、`gh` CLI がログイン済み、Node 20 以上。

---

## 1. GitHub リポジトリを作る

```bash
cd /c/Users/hidef/orca/projects/loop-engineering
gh repo create hidefumiagata/loop-engineering --private --source=. --remote=origin --push
```

既に push 済みなら不要。default branch が `main` であることを確認する。

```bash
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name   # → main
```

`master` のままなら `main` に改名する（`loop/config.json` の `defaults.base_branch` と揃える）。

## 2. Claude GitHub App をインストールする

Cloud セッションがリポジトリを clone / push するために必要。

<https://github.com/apps/claude> を開き、`loop-engineering` に対してインストールする。

> `/web-setup` でも clone はできるが、それだけでは不足する場合がある。
> routine が確実に動くのは GitHub App を入れた状態である。

## 3. ラベルを作る

```bash
bash loop/bin/setup-labels.sh
```

ラベルが作成される（件数はスクリプトが出力する）。べき等なので何度実行してもよい。

## 4. APIキーを発行する

### Gemini（必須）

1. <https://aistudio.google.com/apikey> でキーを発行する
2. **課金を有効にする。** `gemini-3.8-flash` を panel の提案・敵対的レビュー・改稿で使うため。
   通常レビューは無料枠モデル（`gemini-3.1-flash-lite`）のままなので、
   合議を回さなければ課金は発生しない

### OpenAI（panel モードを使うなら必須）

1. <https://platform.openai.com/api-keys> でキーを発行する
2. **使用量上限を設定する**（Settings → Limits）。設定ミスに対する最終防壁として必ず入れる。
   **合議は1ラウンド約 $1.44（実測）**で、月4件×2ラウンド＝8ラウンドなら約 $11.5。
   月 $10 だと先に当たるので、頻度を落とすか上限を上げるかを決めてから設定する

合議を使わないなら OpenAI キーは不要。`loop/config.json` の
`providers.openai.tiers.*.enabled` をすべて `false` にしておけば呼ばれない。

## 5. Cloud 環境 `loop-env` を作る

<https://claude.ai/code> を開き、メッセージ入力欄の上にある**雲アイコン**を押して
環境セレクタを開く → **Add cloud environment**。

| 項目 | 値 |
| --- | --- |
| Name | `loop-env` |
| Network access | **Full** |
| Environment variables | **空のまま**（キーは次の手順で credential として入れる） |
| Setup script | **空のまま**（`gh` と Node はプリインストール済み、依存ゼロで動く） |

**Network access を Full にする理由**: 技術調査の用途で WebFetch が任意のURLを引く必要がある。
Trusted（既定の許可リスト）だと調査中に `403 host_not_allowed` で止まる。
Custom で個別許可する運用もできるが、調査先を事前に列挙できないため現実的でない。

### API credentials を登録する

**一度 Create した後に、もう一度その環境を開く**（新規作成ダイアログには
API credentials の欄が出ない）。環境にカーソルを合わせて右に出る歯車アイコン →
**API credentials → Add credential**。2件登録する。

#### Gemini

| 項目 | 値 |
| --- | --- |
| Name | `Gemini` |
| Allowed websites | `generativelanguage.googleapis.com` |
| Credential type | Bearer のまま（ヘッダは下で上書きする） |
| Custom headers → Name | `x-goog-api-key` |
| Custom headers → Prefix | **空にする** ← 重要 |
| Custom headers → Value | AI Studio のキー |

> **Prefix を `Bearer` のまま残すと Gemini 側が認証に失敗する。**
> Gemini はキーの生値を `x-goog-api-key` ヘッダで受け取る仕様なので、必ず Prefix を消す。

#### OpenAI

| 項目 | 値 |
| --- | --- |
| Name | `OpenAI` |
| Allowed websites | `api.openai.com` |
| Credential type | **Bearer**（`Authorization` + `Bearer` のまま） |
| Value | OpenAI のキー |

保存すると一覧に出る。**値は二度と表示できない**ので、変更したいときは削除して再登録する。
一覧に `Not sent` と出ていたら、その下の注記に理由が書かれている。

> これで `api.openai.com` と `generativelanguage.googleapis.com` は
> Network access の設定に関わらず到達可能になり、かつ**キーはサンドボックス内に一切現れない**。
> プロキシがリクエストがVMを出た後にヘッダを付与する。

## 6. routine `loop-engine` を作る

<https://claude.ai/code/routines> → **New routine**。

| 項目 | 値 |
| --- | --- |
| Name | `loop-engine` |
| Prompt | 下記 |
| Model | **Sonnet 5**（使用枠を保たせる）。Max で枠に余裕があるなら Opus にすると調査・統合の品質が上がる |
| Repositories | `hidefumiagata/loop-engineering` |
| Environment | `loop-env` |
| Connectors | **不要なものをすべて外す**（included だと書き込み系ツールも無断で使える） |
| 許可ツール | `Bash` `Read` `Write` `Edit` `Glob` `Grep` `WebFetch` `WebSearch` **`Agent`**。**`Agent` が無いと技術調査のサブエージェントを起動できず blocked になる** |
| Trigger | Schedule（後で cron を調整する） |

プロンプトはこれだけ。ロジックはリポジトリ側にある。

```
このリポジトリの .claude/skills/loop-engine/SKILL.md を読み、
そこに書かれた手順に厳密に従って 1 run 分を実行せよ。
手順書に書かれていない判断を勝手に足さないこと。
```

### cron を毎時にする

作成フォームのプリセット（hourly / daily / weekdays / weekly）から **hourly** を選ぶ。
cron 式は `0 * * * *`（UTC）になる。別の頻度にしたい場合は、保存後に
ローカルの CLI で指定できる。

```
/schedule update
```

**`loop/config.json` の `preset` と必ず揃えること。** 現在は毎時なので `"hourly"`
（`granularity: "phase"` / `issues_per_run: 1`）。毎時なら run が潤沢で律速はトークン枠に移るため、
1 run を短く保つ粒度が正しい。1日数回に落とすなら run 数が律速になるので `preset` は
`"pro"`（`granularity: "iteration"`）に変える。
理由は `docs/ARCHITECTURE.md`「なぜ『1 run = 1 イテレーション』なのか」を参照。

routines には日次実行上限がある（アカウント単位・全routine合算・UTC 0時リセット）。
**公称値は確認できていない**ので、残り回数は claude.ai/code/routines で見る。
上限に当たってスキップされた run は翌日に繰り越されない。

### API トリガーを足す（手動発火用）

routine 詳細ページ → 名前の横のメニュー → **Edit** → **Select a trigger** →
**Add another trigger** → **API**。

URL をコピーし、**Generate token** を押してトークンを控える
（**一度しか表示されない**。パスワードマネージャに入れる）。

発火はこの形:

```bash
curl -X POST https://api.anthropic.com/v1/claude_code/routines/<ROUTINE_ID>/fire \
  -H "Authorization: Bearer <TOKEN>" \
  -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{}'
```

`text` は渡さなくてよい。SKILL.md が自分で対象 Issue を選ぶ。

---

## 7. 動作確認

### 7-1. ローカルのユニットテスト（キー不要）

```bash
npm test
```

すべて pass すること。`synthesis-check.mjs` と `issue-state.mjs` の純粋な部分に加え、
設定・プロンプト・Issueテンプレート・ラベル定義の整合性（wiring）も検証する。

### 7-2. アダプタの疎通（キーが必要）

行き詰まったら `node loop/bin/doctor.mjs` を使う。
ローカルでもクラウドセッションでも動き、どこで止まっているかを名指しする。
**クラウドで実行するときは `loop-env` を選んだ通常セッションで行う**（routine ではないので日次 run 上限を消費しない）。


```bash
export GEMINI_API_KEY=...        # ローカル開発時のみ。クラウドでは不要
printf 'こんにちは。動作確認です。「OK」とだけ答えてください。\n' > /tmp/smoke.md
node loop/bin/ask-llm.mjs --spec gemini:review --input /tmp/smoke.md --out /tmp/out.txt
cat /tmp/out.txt /tmp/out.txt.meta.json
```

`[cost] gemini:review ... (auth=local-env)` が出て、`meta.json` に実トークン数が入ること。

課金ガードも確認する（**非ゼロ終了するのが正常**）:

```bash
node loop/bin/ask-llm.mjs --spec openai:review --input /tmp/smoke.md --out /tmp/x.json
echo "exit=$?"    # → 1、かつ enabled:false の説明が出る
```

### 7-3. 状態管理の往復（リポジトリが必要）

テスト用 Issue を1件作り、番号を `N` として:

```bash
node loop/bin/issue-state.mjs list
node loop/bin/issue-state.mjs read N        # → null
# 手で state.json を書いて
node loop/bin/issue-state.mjs write N /tmp/state.json
node loop/bin/issue-state.mjs read N        # → 書いた内容が返る
node loop/bin/issue-state.mjs write N /tmp/state.json   # 2回目
```

**2回目で新しいコメントが増えず、同じコメントが更新されること**を Issue 画面で確認する。

### 7-4. クラウドでのドライラン（run を1つ使う）

claude.ai/code で `loop-env` を選び、手動でセッションを作って次を送る。

```
LOOP_DRY_RUN=1 を前提として、.claude/skills/loop-engine/SKILL.md に従い
1 run 分で何をするつもりかを順に説明せよ。push・コメント投稿・ラベル変更・
他社LLM呼び出しは一切行うな。
```

これは routine ではなく通常のセッションなので**日次 run 上限を消費しない**。
API credentials とネットワークの疎通もここで確認できる。

### 7-5. pipeline の E2E

Issue を1件作る（用途: 技術調査）。例:

> Claude Code の routines と GitHub Actions のどちらを自動化基盤に使うべきか、
> コスト・制約・運用の手間の観点で比較して判断材料をそろえたい。

routine 詳細ページで **Run now**。確認すること:

- [ ] Issue に「ループ状態」コメントが1件できている
- [ ] フェーズが plan → work → review → 判定 まで進んでいる
- [ ] `projects/0001-*/report.md` `sources.md` `journal/` ができている
- [ ] 通常 PR が立っている（draft ではない）
- [ ] `journal/NNN-review.md` の冒頭が `reviewer: gemini:review (...)` である
      （`claude (fallback)` になっていたら Gemini 側の設定を疑う）
- [ ] `journal/NNN-review.json.meta.json` に実測コストが入っている（Issue には書かれない）

### 7-6. panel の E2E

Issue を1件作る（用途: 合議）。例:

> このループ基盤の状態保持方式を決めたい。Issueコメント / リポジトリ内ファイル /
> 外部DB の3案を比較して、運用の単純さを最優先に選びたい。

panel は4段（propose → challenge → revise → synthesize）で、`preset: "hourly"` では
1 run = 1フェーズなので **brief を含めて5 run** かかる。`Run now` を順に叩いて確認する。

**brief（1 run 目）**

- [ ] `brief.md` と `criteria.json` ができている
- [ ] `criteria.json` の内容が `brief.md` の評価基準の表と一致している
- [ ] **Issue には状態コメントだけがある**（基準表を Issue に貼っていない）

**propose（2 run 目）**

- [ ] `proposals/A.md` `B.md` `C.md` と `.authors.json` が揃っている
- [ ] **git log で Claude の提案コミットが他案の取得より前にある**（独立性の証跡）
      ```bash
      git log --oneline --name-only claude/loop-<n>-<slug> | head -30
      ```
      `propose(#n): claude の案（他案取得前の単独コミット）` が単独で先にあること
- [ ] 匿名化前のファイル（`claude.md` `_gemini.md` `_openai.md`）が消えている
- [ ] `*.meta.json` が `proposals/` に残っている（コストの証跡）

**challenge（3 run 目）**

- [ ] `challenges/by-claude.json` `by-gemini.json` `by-openai.json` が揃っている
- [ ] 各ファイルの `targets` が**自分以外の2案だけ**を対象にしている
- [ ] どの `targets` にも `strongest_point` が入っている（全否定になっていない）
- [ ] `challenges/` に `by-*.json` 以外が無い（`*.meta.json` は `journal/` にある）

**revise（4 run 目）**

- [ ] `proposals/A.v2.md` `B.v2.md` `C.v2.md` が揃っている
- [ ] 各 `.v2.md` に「改稿で変えた点」と「反論」の節がある

**synthesize（5 run 目）**

- [ ] `answer.md` と `provenance.json` ができている
- [ ] `synthesis-check.json` の `generated_by` が `loop/bin/synthesis-check.mjs` である
- [ ] `synthesis-check.json` の `warnings` が空である
      （空でなければ、統合役に差し戻した記録が `journal/` にあること）
- [ ] 統合役自身の案の `ratio` が `bias_threshold`（均等配分の1.6倍）を下回っている
- [ ] `answer.md` に「見解が割れた点」「攻撃で崩れた主張」「この答えの限界」がある
- [ ] PR 本文に**結論の要旨・寄与比率・severity** が載っている
- [ ] `loop:done` が付き、**PR はマージされずに残っている**（確定は人間の操作）

### 7-7. 失敗系

`loop-env` の Gemini credential を一時的に削除して **Run now**:

- [ ] `403` / `x-deny-reason` を検知している
- [ ] `loop:blocked` + `loop:needs-human` が付いている
- [ ] Issue コメントに「`loop-env` の Network access と API credentials を確認」と出ている

確認後、credential を再登録する。

### 7-8. 日次上限の実測（数日運用して記録する）

<https://claude.ai/code/routines> の run 履歴と
<https://claude.ai/settings/usage> を数日見て、次を `docs/` に追記する。

- 日次上限に張り付いているか（→ cron 回数の調整 or Max 移行の判断材料）
- **`Run now` と API 発火が日次上限に計上されるか**
  （公式ドキュメントは「一度きりのスケジュール実行は上限に含まれない」とするが、
  `Run now` と API 発火については記載が割れている。実測が唯一の確実な情報源）

---

## トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| **502 `upstream request failed`（30秒前後で発生）** | エージェントプロキシが最初のバイトを約30秒待って諦めている（総所要の制限ではない）。`loop/config.json` の該当階層に、Gemini なら `stream: true`、OpenAI なら `background: true` を付ける。ストリーミングでも出るなら Gemini の `thinking_level` を `low` にする。`*.error.json` の `ttfb_sec` と `node loop/bin/doctor.mjs --latency` で切り分けられる。モデルを変えても直らない |
| **モデル名で 404（`is not found for API version` 等）** | `node loop/bin/doctor.mjs --models` で実際に使えるモデル名を列挙し、そこから `loop/config.json` の `providers.*.tiers.*.model` を直す。資料や記憶から書くと外れる |
| **他社LLM が呼べない（原因が分からない）** | **まず `node loop/bin/doctor.mjs` を実行する。** Node fetch と curl の両方で叩いて「キー未付与 / キー無効 / ネットワーク拒否 / プロキシ非経由」を切り分ける。キーの値は出力しないのでそのまま共有してよい |
| `403` + `x-deny-reason: host_not_allowed` | `loop-env` の Network access が Trusted のまま、または credential のホスト指定が違う |
| Gemini が `API key not valid` | credential の Custom header Prefix に `Bearer` が残っている。**Prefix を空にする** |
| OpenAI が `401` | Credential type が Bearer でない、またはキーが無効 |
| `ask-llm.mjs` が `enabled:false` で止まる | 意図した課金なら `loop/config.json` の該当 `enabled` を `true` にする。意図していないなら呼び出し側のバグ |
| routine が動かない | GitHub 連携が切れると最大72時間スキップし、その後 routine 自体が OFF になる。再連携して ON に戻す |
| `git push` が拒否される | ブランチ名が `claude/` 始まりか確認する |
| 状態コメントが増殖した | 手で古い方を削除する。`issue-state.mjs` はマーカーを含む最初のコメントを正とする |
| `/schedule` が Unknown command | claude.ai サブスクでログインしているか確認する（`ANTHROPIC_API_KEY` が環境にあると優先されてしまう） |
| `gh` が `403 GitHub GraphQL is not available from Claude Code sessions` | クラウドセッションの制約。`--json` 系サブコマンドは使えない。`gh api`（REST）か `issue-state.mjs` のサブコマンドに置き換える。`npm test` の wiring テストがこの種の混入を検出する |
| 成果物が `claude/loop-<n>-<slug>` 以外のブランチに入った | セッションが自動生成ブランチで始まり、`git checkout -B` が実行されていない。SKILL.md の Step 2 を確認する |
| 日次上限に達した | スキップされた run は**翌日に繰り越されない**。cron 回数を減らすか Max を検討する |
| Issue を作った直後の Run now が「対象なし」で終わる | 除外ラベル（`loop:stop` / `loop:done` / `loop:blocked` / `loop:needs-human`）が付いていないか確認する。REST の `/issues?labels=` は検索インデックスを経由しないので、反映待ちは起きない。旧記述（ラベル検索インデックスに載るまで数十秒〜数分かかる（実測で確認）。少し待ってもう一度発火する |

## プランを Max に上げたとき

`loop/config.json` の1行だけ変える。

```diff
-  "preset": "pro",
+  "preset": "max",
```

これで `granularity` が `phase` に、`issues_per_run` が 2 になる。
cron も `/schedule update` で増やせる。
