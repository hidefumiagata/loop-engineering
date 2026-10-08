# loop-engineering

GitHub Issue に「達成したいこと」を書くと、AIエージェントが自律的に作業とレビューを反復し、
受入基準を満たすまで回る基盤。Claude Cloud の routines 上で動く。

```
Issue を書く  →  定期実行が着手  →  作業  →  別モデルがレビュー  →  未達なら作業に戻る
                                                                 ↓ 満たしたら
                                                      通常 PR が立つ
```

成果物・過程の記録・意思決定記録はすべてこのリポジトリで管理される。

## 2つの動き方

### 定期ジョブ（Issue を使わない）

毎日決まった時刻に同じ仕事をして成果物を作る。`loop/jobs/*.md` に定義を置く。
反復しない。**PR を作ってマージを1回試す。**
ハーネスがレビュー無しのマージを拒否することがあり、その場合は人間がマージする
（詳細は `docs/ARCHITECTURE.md`）。

| ジョブ | 内容 | 成果物 |
| --- | --- | --- |
| `hackernews-top10` | HN トップ10記事の日本語要約 | `daily/hackernews-top10/YYYY-MM-DD.md` |
| `ai-news-5` | 世界のAIニュース5点の日本語要約 | `daily/ai-news-5/YYYY-MM-DD.md` |
| `paloalto-advisories` | Palo Alto Networks の新規脆弱性（24時間以内） | `daily/paloalto-advisories/YYYY-MM-DD.md` |
| `gitlab-advisories` | GitLab の新規脆弱性（24時間以内） | `daily/gitlab-advisories/YYYY-MM-DD.md` |

脆弱性レポートは**該当0件が正常な結果**である。セキュリティリリースは毎日は出ないので、
件数を埋めるために期間外のものを混ぜない規律を定義側で縛っている。

ジョブを足すときは `loop/jobs/` に MD を1枚置くだけ。`enabled: false` で止められる。

### Issue 駆動のループ（2つのモード）

目的を達成するまで反復する。こちらは Issue を起点にする。

### pipeline — 作って直す

技術調査 / プログラム構築 / アイデア深堀。

`plan`（受入基準の策定）→ `work`（作業）→ `review`（別モデルによる判定）を反復する。
レビュアーは **Gemini**、作業は **Claude**。同じモデルが作って採点する構造を避けている。

**技術調査だけは work がさらに3段に分かれる。**

1. 本体が**公式ドキュメントだけ**を調べる
2. サブエージェントが**公式以外のブログ・実装例だけ**を調べる
3. 別のサブエージェントが両者を突き合わせてレポートを書く。
   一致すれば公式、相違があれば公式を採ったうえで**非公式が何と言っていたかを備考に残す**、
   非公式のみなら**公式から得られなかった旨を明記**する

突き合わせ役には Web ツールを与えていない。追加調査で穴を埋められると照合の意味が消えるため。

### panel — 3つのLLMで議論して結論を出す

```
1. propose     Claude / ChatGPT / Gemini がそれぞれ意見を出す
2. challenge   自分以外の案を敵対的にレビューする
3. revise      指摘を受けて各自が自分の案の精度を高める
4. synthesize  Claude の別エージェントが3つの回答をまとめ、結論を出す
```

**採点はしない。** 点数は「どれが良いか」しか言わないが、敵対的レビューは「どこが壊れるか」を言う。
後者のほうが、改稿にも統合にも使える。

公平性のために埋め込んでいる仕組み:

- **共有ブリーフが唯一の事実源。** 他社2者は実行環境もWebも見られないので、
  Claude が先に調べた事実を全員に配り、同一の証拠・異なる推論に揃える
- **Claude の案は他案取得前に単独コミット。** git 履歴が独立性の証跡になる
- **攻撃者に自分の案を渡さない。** 自己批判か自己弁護にしかならない
- **改稿者に他案を渡さない。** 寄せにいくと3つの独立した答えという前提が崩れる
- **全否定を禁じる。** 攻撃対象の「最も強い点」を必ず認めさせる。
  攻撃者自身も案を書いた当事者なので、他案を一律に潰す動機を構造的に持っている
- **統合は別のサブエージェント。** 独立した文脈で起動し、どれが本体の案かを知らせない
- **寄与比率を機械算出。** 結論が自案に偏っていれば警告し、サブエージェントに差し戻す

## 使い方

1. [新しい Issue を作る](../../issues/new/choose)（「ループタスク」テンプレート）
2. 用途を選び、達成したいことを書く
3. 次の定期実行（毎時）で着手される。急ぐときは routine の **Run now**
4. 進行は Issue 上の「ループ状態」コメントと `loop:*` ラベルで追える。
   **成果物は Issue ではなく PR で読む**（Issue は目的と状態だけを持つ）
5. 止めたくなったら **`loop:stop` ラベル**を付ける

人間の操作が必要になるのは次の場合だけ。いずれも `loop:needs-human` ラベルが付く。

| 状況 | すること |
| --- | --- |
| 合議の答えが出た | PR を確認してマージする。PR 本文に寄与比率と批評の判定が載っているので、偏りと残った指摘はそこで分かる |
| 合議の答えに異論・追加論点がある | Issue にコメントして `loop:go` を付ける。次の run がそれを前提事実に取り込んで議論をやり直す（任意） |
| 反復上限に達した | 受入基準か目的を見直して Issue を編集し、`loop:go` を付ける |
| 設定の問題で止まった | Issue コメントの診断に従う（多くは `loop-env` の credential） |

## 構成

```
.claude/skills/loop-engine/SKILL.md   Issue 駆動ループの手順
.claude/skills/daily-jobs/SKILL.md    定期ジョブの手順（Issue を使わない）
loop/
  config.json      プラン別プリセット・モデル階層・用途ごとのモード定義
  prompts/roles/      planner worker reviewer proposer challenger reviser critic
  prompts/usecases/   research build ideation deliberation
.claude/agents/       research-community / research-reconcile / panel-synthesizer
  jobs/               定期ジョブの定義（MD1枚で1ジョブ）
  bin/jobs.mjs        ジョブ定義の読み込み
  bin/ask-llm.mjs     他社LLM の REST アダプタ（依存ゼロ）
  bin/synthesis-check.mjs   合議スコアの機械集計（純関数）
  bin/synthesis-check.mjs 結論の寄与比率を算出し自案への偏りを検出（純関数）
  bin/issue-state.mjs Issue コメントへの状態の読み書き
  test/               aggregate / issue-state / 設定整合性(wiring) のテスト
projects/<Issue番号>-<スラグ>/          成果物と過程の記録
docs/ARCHITECTURE.md  設計・制約・公平性の担保・コスト実測の根拠
docs/SETUP.md         クラウド環境・API credential・routine の設定手順
```

ロジックは routine の保存プロンプトではなく**すべてリポジトリ内**にある。
挙動を変えたいときは claude.ai の設定ではなく、ここを編集して PR を出す。

## コスト

| | 内容 | 費用 |
| --- | --- | --- |
| Claude | サブスクリプション（現在 **Max**）。routines に日次上限あり（残り回数は claude.ai/code/routines） | 既存 |
| Gemini | 通常レビューは `gemini-3.1-flash-lite` の**無料枠** | $0 |
| Gemini | 合議のみ `gemini-3.8-flash` 有料 | 1ラウンド $0.07（実測） |
| OpenAI | 合議のみ `gemini` と同じ3段で `gpt-5.5` を呼ぶ。通常レビューでは **OFF** | 1ラウンド $1.37（実測） |

合議は **1ラウンド 約 $1.44**（Issue #10 の `*.meta.json` 実測）。
提案・敵対的レビュー・改稿の3段でそれぞれ他社2者を呼ぶので、外部呼び出しは6回になる。
95% が `gpt-5.5` の出力（$30/1M）で、1呼び出しあたり 10,000〜15,000 トークン出る。

月4件 × 2ラウンドなら **約 $11.5/月**。`docs/SETUP.md` が勧めている
OpenAI の使用量上限 **月$10 はこの頻度だと先に当たる**ので、頻度か上限のどちらかを決めること。
**通常の調査ループは追加課金ゼロ**（レビューは Gemini の無料枠に収まる）。

`loop/config.json` の `providers.*.tiers.*.enabled` が課金の門になっており、
`false` の階層を呼ぼうとすると即エラー終了する。

## 開発

```bash
npm test                      # ユニットテスト（キー不要）
bash loop/bin/setup-labels.sh # ラベルを作成/更新（べき等）
```

セットアップと動作確認の全手順は [docs/SETUP.md](docs/SETUP.md)。
設計の根拠と前提にしている制約は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
リポジトリの規約と変えてはいけない不変条件は [CLAUDE.md](CLAUDE.md)。
