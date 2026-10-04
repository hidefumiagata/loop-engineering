# 設計

GitHub Issue に目的を書くと、Claude Cloud の routine が自律的に作業とレビューを反復し、
受入基準を満たすまで回る基盤。成果物はすべてこのリポジトリで管理する。

## 全体像

```
GitHub (private)
  Issues(label:loop) ──── 状態は Issue 上の固定コメント1件に集約 ────┐
  branches claude/loop-<n>-<slug> → draft PR                        │
  projects/<n>-<slug>/ 成果物と過程の記録                             │
        ▲ clone / push / gh（GH_TOKEN は自動設定）                    │
        │                                                           │
Claude Cloud Routine "loop-engine" ─────────────────────────────────┘
  trigger : cron 0 0,6,12 * * * (UTC) = JST 09/15/21 の3回
            + API /fire（手動発火。日次上限5のうち2 run を予備に残す）
  env     : loop-env（Network=Full / API credentials: Gemini・OpenAI）
  model   : Sonnet 5
  prompt  : 「.claude/skills/loop-engine/SKILL.md を読んで厳密に従え」

  1 run = 1 Issue × 1 イテレーション（Pro プリセット）
       ↓
  他社LLMは node loop/bin/ask-llm.mjs 経由で REST 単発呼び出し
       ↓
  Anthropic エージェントプロキシが VM の外でAPIキーを付与
  （キーはサンドボックス内に存在しない）
```

## なぜ GitHub Actions ではないのか

実行基盤を Claude Cloud の routines に置いている。GitHub Actions を使わないことで:

- private リポジトリの Actions 無料枠（月2000分）を消費しない
- Claude Code のセッションがそのまま実行主体になるため、`gh` / git / Web / サブエージェントが
  追加設定なしで使える
- APIキーをリポジトリ Secrets に置かずに済む（API credentials がプロキシ側で保持する）

代償は次節の制約である。

## 前提にしている制約

| 制約 | 出典 | 設計上の対応 |
| --- | --- | --- |
| routines の GitHub トリガーは **Pull Request と Release のみ**。Issue イベントは非対応 | [routines](https://code.claude.com/docs/en/routines) | Issue 駆動を **cron ポーリング**で実装。即時性が必要なときは API トリガーで手動発火 |
| cron は**最短1時間**。日次実行上限は **Pro 5 run/日 / Max 15 run/日**（アカウント単位・全routine合算・UTC 0時リセット・未消化は繰り越されない） | 同上 / [解説](https://openhelm.ai/blog/claude-code-routines-daily-limit) | **最大の制約。** 1 run の粒度を「1フェーズ」ではなく「1イテレーション」にした（後述） |
| Cloud環境の **API credentials**（Pro/Max限定）は指定ホスト宛にプロキシがキーを付与し、キーがサンドボックス内に露出しない | [cloud-environments](https://code.claude.com/docs/en/cloud-environments) | これが3LLM構成の要。Gemini / OpenAI を鍵を晒さず呼べる |
| サンドボックスは Ubuntu 24.04 / Node 20-22 / Python3 / **`gh` プリインストール（`GH_TOKEN` 自動設定）** | 同上 | `loop/bin/*.mjs` を依存ゼロで書き、setup script を不要にした |
| routine は clone したリポジトリ内の skill を読んで実行できる | [routines](https://code.claude.com/docs/en/routines) | ループ手順そのものを `.claude/skills/loop-engine/SKILL.md` で版管理 |
| Claude は `claude/` 接頭辞のブランチに常に push できる | 同上 | ブランチ名を `claude/loop-<n>-<slug>` に固定 |
| **他社LLMはサンドボックスのファイル・コマンド・Webに触れない**（REST単発のみ） | 設計上の帰結 | panel の公平性を共有ブリーフで担保（後述） |
| **エージェントプロキシは1リクエスト約30秒で諦め、502 `upstream request failed` を返す** | 3回目の実測。`gpt-5.2` も `gpt-5.5` も同じ30秒で落ち、Gemini Flash は成功した | 長文を生成する `openai:propose` は `background: true` で非同期化し、短い GET のポーリングで取りに行く。`reasoning_effort` を下げるだけでは生成そのものが長い場合に足りない |
| **サンドボックスは `HTTPS_PROXY` 環境変数でエージェントプロキシを指しており、API credential のキーはそこで付与される。Node の `fetch` はこれを無視する**（`NODE_USE_ENV_PROXY` は Node 24 以降、サンドボックスは Node 22） | 2回目の run の実測。同一リクエストが curl で 200、Node fetch で 403 | `ask-llm.mjs` の転送を **curl に一本化**した。fetch に戻すと「credential を登録したのに 403」が再発する |
| **クラウドセッションからは GitHub GraphQL が 403 で拒否される**（`"GitHub GraphQL is not available from Claude Code sessions; use the REST API"`） | 初回 run の実測 | `gh` の `--json` 系サブコマンドが全滅する。GitHub 操作をすべて `gh api`（REST）に寄せた（後述） |
| **セッションは `main` ではなく自動生成の `claude/<形容詞>-<名前>` ブランチで始まることがある** | 初回 run の実測 | ブートストラップで無条件に `git checkout -B claude/loop-<n>-<slug> origin/main` する |

## なぜ「1 run = 1 イテレーション」なのか

Pro は routines が 5 run/日。1 run = 1フェーズにすると、3反復必要な Issue 1件で

```
plan(1) + work(3) + review(3) = 7 run
```

となり、1.5日かかって並行2件で完全に詰まる。Pro では **run 数が律速でトークン枠は余る**ため、
1 run の中で work → review → 判定 まで通す設計にした。これで3反復の Issue が約4 run ≒ 1日強で完了する。

`loop/config.json` の `preset` を `"max"` にすると `granularity: "phase"` に切り替わり、
1フェーズ1run の細かい粒度（Issue に残る記録が細かく、失敗時の巻き戻しが楽）に戻る。
Max 移行の判断は、claude.ai/code/routines の run 履歴が 5 run/日 に張り付くかを実測してから行う。

ただし panel の `brief` フェーズだけは `granularity: iteration` でも**必ずそこで run を終える**。
ブリーフは人間が目を通す価値がある分岐点だからである。

## 状態機械

1 Issue = 1 状態。**正は Issue 上の固定コメント1件**（`<!-- loop-state:v1 -->` マーカー付き）。

ブランチ上のファイルを正にしない理由: ポーラーは常に default branch から起動するため、
各 Issue の作業ブランチにある状態ファイルを読めない。
副産物として「作業結果を Issue に記録する」という要件が同じ仕組みで満たされる。

```
pipeline:  plan → work → review ─┬─ PASS ──→ done
                   ↑             ├─ REVISE → work （iteration++）
                   └─────────────┘
                                 └─ BLOCKED → blocked + needs-human
           iteration > max_iterations → blocked + needs-human

panel:     brief → propose → evaluate → synthesize → critique ─┬─ PASS → PR作成 → done
             ↑                                     ↑ REVISE   │        （マージは人間）
             │                                     └──1回だけ──┘
             └── 重み3が全案未達 / BLOCKED のとき round++ して propose へ（max_panel_rounds まで）
```

ラベルは状態の人間向けミラーであり、`gh issue list` のフィルタでもある。
`loop:stop` は緊急停止スイッチで、`issue-state.mjs list` が即座に対象から外す。

### 冪等性

各フェーズは「既にあるファイルを上書きする」形で書かれている。
run が途中で落ちた場合、状態コメントは更新されていないので、次の run が同じフェーズをやり直す。
これが唯一の障害復旧手段であり、だからフェーズの途中で状態を半端に書き換えてはならない。

## 技術調査の3段構成

`research` 用途だけは、1 run の中でさらに役割を分ける。

```
1. loop-engine 本体          公式サイト・公式ドキュメントだけ  → findings/official.md
2. research-community (sub)  公式以外のブログ・実装例だけ      → findings/community.md
3. research-reconcile (sub)  1と2を突き合わせてレポート作成    → report.md
```

**なぜ分けるのか**: 1人が公式と非公式を同時に読むと、両者が文脈の中で混ざる。
「公式に書いてあった気がするが実はブログの記述だった」という取り違えが起き、
しかも後から検証できない。文脈を分けておけば突き合わせる相手が残る。

**突き合わせ役には Web ツールを与えていない**（`tools: Read, Write, Glob, Grep`）。
追加調査で穴を埋められると、1と2を照合する意味が消えるため。
材料が足りなければ「情報なし」と書くのが正しい振る舞いになる。

突き合わせの規則:

| 状況 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 公式と非公式が一致 | 公式 | `公式` | — |
| 公式と非公式が相違 | **公式** | `公式（非公式と相違）` | 非公式の主張と出典を残す |
| 非公式のみ | 非公式 | `非公式のみ` | 公式から得られなかった旨 |
| どちらにも無い | — | `情報なし` | 何を探したか |

公式を常に優先するが、**相違があった事実は消さない**。
読者が「公式どおりに行かない可能性がある」と判断できるようにするためである。

サブエージェントが起動できない場合、本体が代行してはならない。`loop:blocked` にする。
分離そのものがこの用途の価値であり、1人でやると検証可能性が失われる。

> routine の `allowed_tools` に **`Agent` が必要**。
> 無いとサブエージェントを起動できず、調査が blocked になる。

## 役割分担

| | pipeline | panel: 提案 | panel: 評価 |
| --- | --- | --- | --- |
| Claude（セッション本体） | Planner起草 + Worker | 参加者（自案を書く） | 評価者 |
| Gemini | 基準の批評 + **Reviewer** | 参加者 | 評価者 |
| OpenAI | 未使用（`enabled: false`） | 参加者 | 評価者 |

Claude だけがファイル・git・gh・Web を触れる。他2者は REST の単発呼び出しである。
この非対称性が設計上の中心的な問題であり、panel ではブリーフで打ち消している。

**レビュアーはワーカーと別モデルであることを不変条件とする。** Gemini が落ちて Claude が代行する場合は、
`journal` と Issue コメントの両方に `reviewer: claude (fallback — gemini が <理由> で失敗)` と明記する。
黙った自己採点を許すと、ループが「自分で作って自分で合格を出す」装置に退化する。

## panel モードの公平性の担保

対策なしでは合議は儀式になる。次の6点を構造として埋め込んでいる。

### 1. 共有ブリーフを唯一の事実源にする

Gemini と OpenAI は Web もコードも見られない。Claude だけが事実を知っている状態で案を競わせると、
Claude の案が有利になるだけで合議にならない。
そこで Claude が先に `brief.md` を書き、関連コードの抜粋・ドキュメントの引用（出典URL付き）・実測値を
「前提事実」節に展開する。**3者全員がこれだけを入力に案を書く。**
同一の証拠・異なる推論、という形に揃える。

### 2. Claude の案を他案取得前に単独コミットする

Claude はオーケストレータ兼参加者なので、他案を見てから自案を書けてしまう。
これを封じるため、`proposals/claude.md` だけを先にコミットして push してから他2者を呼ぶ。
**git 履歴が独立性の証跡になる**（検証手順に含まれている）。

### 3. 匿名化とシャッフル

提案は `A.md` / `B.md` / `C.md` にリネームし、対応表は `.authors.json` に分離する。
評価プロンプトには対応表を渡さない。A/B/C の割り当てはラウンドごとにランダム（毎回 claude=A だと推測できる）。
提示順も評価者ごとにシャッフルし、順序効果を散らす。

### 4. 集計を機械で行う

採点結果の重み付けを Claude にやらせると、自案を勝たせる余地が構造的に残る。
`loop/bin/aggregate.mjs` が純関数として計算し、Claude は `scores.json` を参照のみする。
出力には次が含まれる。

| 指標 | 何を見るためのものか |
| --- | --- |
| `weighted_score` | 基準の重み付き平均を評価者間で平均した総合点 |
| `by_evaluator` / `inter_evaluator_spread` | 評価者ごとの点とばらつき。1人だけ極端な評価をしていないか |
| `self_score_bias` | 自案につけた点 − 他案の平均。0.75 超で警告 |
| `weighted_score_excl_self` / `winner_excl_self` | **著者自身の採点を除いた点と順位。** 警告だけでは順位が動かないので、別系統の順位として並べて出す。総合首位と入れ替わる場合は警告する |
| `agreement.kendall_w` | 評価者間の順位一致度。0.5 未満で警告（評価階層の引き上げを検討） |
| `agreement.top_pick_unanimous` | 首位が全評価者で一致しているか |
| `winner.margin` | 首位と次点の差。0.25 未満で「スコアだけで決めるな」と警告 |
| `unmet_criteria` | どの案も満たせていない基準（最高点が3未満） |

### 5. 反対意見を捨てない

`decision.md` は「不採用案から拾うべき要素」と「保存すべき反対意見」を必須節として持つ。
合議の価値の半分はここにある。

### 6. 限界の明示

`decision.md` に「Gemini と OpenAI は実行環境のファイル・コマンド・Webに触れていない。
両者の評価は `brief.md` の記述のみに基づく。コードの実地検証は Claude のみが行った」を必ず書く。

### 3案揃わなかったとき

`min_proposers: 3`。提案者が落ちたら **2案のまま続行せず** `loop:blocked` にする。
2案の相互批評には決選投票が無く、合議として成立しないため。

## モデル階層とコスト

高頻度の作業（レビュー）を無料に閉じ込め、低頻度・高価値の合議にだけ金を使う構成。

| | 通常レビュー | panel: 提案生成 | panel: 相互評価 |
| --- | --- | --- | --- |
| Claude | — | Sonnet / Opus（サブスク） | Sonnet / Opus（サブスク） |
| Gemini | `gemini-3.1-flash-lite` **無料枠** | `gemini-3.8-flash` 有料 | `gemini-3.8-flash` 有料 |
| OpenAI | **OFF** (`enabled: false`) | `gpt-5.5` | `gpt-5-mini` |

> モデル名は **`node loop/bin/doctor.mjs --models` で実在を確認してから** 設定すること。
> 当初 `gemini-3.1-pro` と書いていたが実在せず、合議が 404 で止まった。
> Gemini は Flash が 3.8 まで進む一方 Pro は 3.1 preview 止まりだったため、世代の新しい Flash を採った。

### 実測の根拠

入力10k / 出力1.5k トークンのレビュー1件あたり:

| モデル | 単価 (in/out per 1M) | 1レビュー | 月150件 |
| --- | --- | --- | --- |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | $0.005 | 約 $0.8 |
| Gemini 3.8 Flash | $0.75 / $3.75 | $0.013 | 約 $2 |
| gpt-5 mini | $0.25 / $2.00 | $0.0055 | 約 $0.8 |
| gpt-5.2 | $1.75 / $14.00 | $0.039 | 約 $6 |

合議1ラウンドあたり。これは見積りではなく **Issue #4 の実測値**（`*.meta.json` より）:

| 呼び出し | モデル | in / out トークン | 実コスト |
| --- | --- | --- | --- |
| 提案 | gemini-3.8-flash | 1,690 / 2,869 | $0.012 |
| 提案 | gpt-5.5 | 2,161 / **10,069** | **$0.313** |
| 相互評価 | gemini-3.8-flash | 10,144 / 3,948 | $0.022 |
| 相互評価 | gpt-5-mini | 13,621 / 3,930 | $0.011 |
| **合計** | | | **約 $0.36** |

当初の見積りは $0.23 だった。外れた原因は1つで、`gpt-5.5` の出力が
想定の 4,000 トークンではなく **10,069 トークン**だったこと。出力単価が $30/1M なので
ここだけで $0.31 になる。提案の長さは `proposer.md` が「本文 1200〜2500 語程度」と
指示しているが、`max_output_tokens` は 8,000 を渡していた。
**コストを抑えたいなら締めるべきはモデルの単価ではなく出力長である。**

月4件 × 2ラウンド = 8ラウンドで **約 $2.9/月**。
つまり **LLM の API 代は誤差であり、実質的な費用判断は Claude Pro($20) か Max 5x($100) かの一点**である。

### gpt-5-mini を提案生成に使わない理由

相互評価（明示された基準に対する採点）は mini で十分だが、提案生成は違う。
Opus と Gemini Pro の案と並べたときに明らかに弱い第3案は、多様性ではなくノイズを増やし、
集計を歪める。差額は月1ドル程度なので `propose` 階層だけ `gpt-5.2` にしている。

評価階層を `gpt-5-mini` に据え置いているのは節約（1ラウンド $0.09 の差）だが、
評価者の実力差はスコアのばらつきになる。
**`scores.json` の `agreement.kendall_w` が継続して 0.5 未満なら、evaluate 階層も `gpt-5.2` に上げる。**
これが運用上の判断ルールである。

### Gemini 無料枠を使う判断

レビュー用途は 1 run あたり1〜2コール、つまり日5〜30コール。
無料枠（Flash-Lite 系で1000〜1500 RPD）に対して桁違いに余裕がある。

有料化を検討する理由はレートではなく、**無料枠のデータが Google の製品改善に利用される**こと。
private リポジトリの調査内容（`report.md` の抜粋が毎回レビューパケットとして送られる）を
学習に出したくなくなった時点で `loop/config.json` の `providers.gemini.tiers.review.model` を
有料モデルに変え、同じキーに課金を有効にする。

### ChatGPT サブスクリプションを使わない理由

Codex CLI は `codex login --device-auth` で headless 認証でき、`~/.codex/auth.json` に
トークンを保持して自動更新する。しかし Claude Cloud は **run ごとに新しい VM** を立てるため、
auth.json を環境変数から書き戻す形にしてもトークンのローテーションで失効する。
自走基盤の土台としては壊れやすいため採用していない。

## 暴走と課金の制御

| 手段 | 効果 |
| --- | --- |
| cron 3回/日 + API発火用に2 run 予備 | Pro の 5 run/日 上限に収める |
| `granularity: iteration` / `issues_per_run: 1` | run 数が律速の Pro で1 run あたりの前進量を最大化 |
| routine のモデルを Sonnet 5 に固定 | Pro の5時間枠・週次枠を保たせる |
| モデル階層の分離 | 高頻度のレビューを無料に閉じ込める |
| `tiers.*.enabled` ガード | `false` の階層を呼ぶと `ask-llm.mjs` が即エラー終了する |
| 呼び出しごとの実コスト出力 | `*.meta.json` と Issue コメントに実測値が残り、後から追える |
| OpenAI 側の使用量上限（月$10推奨） | プロバイダ側の最終防壁 |
| `max_iterations: 5` / `max_panel_rounds: 2` | 無限ループを構造的に防止 |
| `require_human_decision` | アーキテクチャ決定が誰も見ないまま確定するのを防ぐ |
| `loop:stop` ラベル | 任意の Issue を即時停止 |
| Gemini 429 時は持ち越し | 無料枠を超えても状態を壊さず次の run で再試行する |

## 用途を追加する方法

1. `loop/prompts/usecases/<新用途>.md` を書く（成果物の構成と規律）
2. `loop/config.json` の `usecases` に1ブロック足す（`mode` / `label` / `reviewer` など）
3. `loop/bin/setup-labels.sh` の `LABELS` に `use:<新用途>` を足して実行
4. `.github/ISSUE_TEMPLATE/loop-task.yml` の用途ドロップダウンに
   `表示名 (機械キー)` の形で選択肢を足す

`SKILL.md` は用途名をハードコードしていないため、通常はこの4箇所で足りる。
`mode` に `pipeline` / `panel` 以外を増やす場合だけ `SKILL.md` と
`issue-state.mjs` の `PHASES` に手を入れる必要がある。
