# セットアップ

所要 20〜30分。手順 4 以降は claude.ai 上のブラウザ操作が必要。

前提: Claude **Pro**（または Max）プラン、`gh` CLI がログイン済み、Node 20 以上。

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

17件のラベルが作成される。べき等なので何度実行してもよい。

## 4. APIキーを発行する

### Gemini（必須）

1. <https://aistudio.google.com/apikey> でキーを発行する
2. **課金を有効にする。** `gemini-3.1-pro` を panel の提案・評価で使うため。
   通常レビューは無料枠モデル（`gemini-3.1-flash-lite`）のままなので、
   合議を回さなければ課金は発生しない

### OpenAI（panel モードを使うなら必須）

1. <https://platform.openai.com/api-keys> でキーを発行する
2. **使用量上限を設定する**（Settings → Limits）。月 $10 程度で十分。
   合議8ラウンドでも $1 未満だが、設定ミスに対する最終防壁として必ず入れる

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
| Model | **Sonnet 5**（Pro の使用枠を保たせる） |
| Repositories | `hidefumiagata/loop-engineering` |
| Environment | `loop-env` |
| Connectors | **不要なものをすべて外す**（included だと書き込み系ツールも無断で使える） |
| Trigger | Schedule（後で cron を調整する） |

プロンプトはこれだけ。ロジックはリポジトリ側にある。

```
このリポジトリの .claude/skills/loop-engine/SKILL.md を読み、
そこに書かれた手順に厳密に従って 1 run 分を実行せよ。
手順書に書かれていない判断を勝手に足さないこと。
```

### cron を 1日3回にする

作成フォームはプリセット（hourly / daily / weekdays / weekly）しか選べない。
いずれかを選んで保存した後、ローカルの CLI で cron 式を指定する。

```
/schedule update
```

対話で `loop-engine` を選び、cron を `0 0,6,12 * * *`（UTC）に設定する。
= JST 09:00 / 15:00 / 21:00 の3回。

**なぜ3回か**: Pro の routines は **5 run/日**（アカウント単位・全routine合算・UTC 0時リセット）。
cron で3回使い、残り2回を手動発火（Run now / API）の予備に残す配分である。

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

37件すべて pass すること。`aggregate.mjs` と `issue-state.mjs` の純粋な部分に加え、
設定・プロンプト・Issueテンプレート・ラベル定義の整合性（wiring）も検証する。

### 7-2. アダプタの疎通（キーが必要）

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
- [ ] draft PR が立っている
- [ ] `journal/NNN-review.md` の冒頭が `reviewer: gemini:review (...)` である
      （`claude (fallback)` になっていたら Gemini 側の設定を疑う）
- [ ] Issue コメントに実測コストの表が入っている

### 7-6. panel の E2E

Issue を1件作る（用途: 合議）。例:

> このループ基盤の状態保持方式を決めたい。Issueコメント / リポジトリ内ファイル /
> 外部DB の3案を比較して、運用の単純さを最優先に選びたい。

**Run now を2回**（1回目で brief、2回目で propose〜decide）。確認すること:

- [ ] 1回目で `brief.md` ができ、基準表が Issue に投稿されている
- [ ] `criteria.json` の内容が `brief.md` の表と一致している
- [ ] 2回目で `proposals/A.md` `B.md` `C.md` と `.authors.json` が揃っている
- [ ] **git log で Claude の提案コミットが他案の取得より前にある**（独立性の証跡）
      ```bash
      git log --oneline --name-only claude/loop-<n>-<slug> | head -30
      ```
      `propose(#n): claude の案（他案取得前の単独コミット）` が単独で先にあること
- [ ] `evaluations/by-claude.json` `by-gemini.json` `by-openai.json` が揃っている
- [ ] `scores.json` の `generated_by` が `loop/bin/aggregate.mjs` である
- [ ] `decision.md` の数値が `scores.json` と一致している
- [ ] `decision.md` に「不採用案から拾うべき要素」「保存すべき反対意見」「この合議の限界」がある
- [ ] `scores.json` の `warnings` が `decision.md` に全件転記されている
- [ ] `loop:needs-human` が付いて**停止している**

その後、Issue に `/decide B` とコメントし `loop:go` ラベルを付けて **Run now**:

- [ ] `plan.md` が生成され、pipeline の work に引き継がれている
- [ ] `decision.md` の `decided_by` が更新されている

### 7-7. 失敗系

`loop-env` の Gemini credential を一時的に削除して **Run now**:

- [ ] `403` / `x-deny-reason` を検知している
- [ ] `loop:blocked` + `loop:needs-human` が付いている
- [ ] Issue コメントに「`loop-env` の Network access と API credentials を確認」と出ている

確認後、credential を再登録する。

### 7-8. 日次上限の実測（数日運用して記録する）

<https://claude.ai/code/routines> の run 履歴と
<https://claude.ai/settings/usage> を数日見て、次を `docs/` に追記する。

- 5 run/日 に張り付いているか（→ cron 回数の調整 or Max 移行の判断材料）
- **`Run now` と API 発火が日次上限に計上されるか**
  （公式ドキュメントは「一度きりのスケジュール実行は上限に含まれない」とするが、
  `Run now` と API 発火については記載が割れている。実測が唯一の確実な情報源）

---

## トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| `403` + `x-deny-reason: host_not_allowed` | `loop-env` の Network access が Trusted のまま、または credential のホスト指定が違う |
| Gemini が `API key not valid` | credential の Custom header Prefix に `Bearer` が残っている。**Prefix を空にする** |
| OpenAI が `401` | Credential type が Bearer でない、またはキーが無効 |
| `ask-llm.mjs` が `enabled:false` で止まる | 意図した課金なら `loop/config.json` の該当 `enabled` を `true` にする。意図していないなら呼び出し側のバグ |
| routine が動かない | GitHub 連携が切れると最大72時間スキップし、その後 routine 自体が OFF になる。再連携して ON に戻す |
| `git push` が拒否される | ブランチ名が `claude/` 始まりか確認する |
| 状態コメントが増殖した | 手で古い方を削除する。`issue-state.mjs` はマーカーを含む最初のコメントを正とする |
| `/schedule` が Unknown command | claude.ai サブスクでログインしているか確認する（`ANTHROPIC_API_KEY` が環境にあると優先されてしまう） |
| 日次上限に達した | スキップされた run は**翌日に繰り越されない**。cron 回数を減らすか Max を検討する |

## プランを Max に上げたとき

`loop/config.json` の1行だけ変える。

```diff
-  "preset": "pro",
+  "preset": "max",
```

これで `granularity` が `phase` に、`issues_per_run` が 2 になる。
cron も `/schedule update` で増やせる（15 run/日 まで）。
