# loop-engineering

GitHub Issue に「達成したいこと」を書くと、AIエージェントが自律的に作業とレビューを反復し、
受入基準を満たすまで回る基盤。Claude Cloud の routines 上で動く。

```
Issue を書く  →  定期実行が着手  →  作業  →  別モデルがレビュー  →  未達なら作業に戻る
                                                                 ↓ 満たしたら
                                                      draft PR が ready になる
```

成果物・過程の記録・意思決定記録はすべてこのリポジトリで管理される。

## 2つのモード

### pipeline — 作って直す

技術調査 / プログラム構築 / アイデア深堀。

`plan`（受入基準の策定）→ `work`（作業）→ `review`（別モデルによる判定）を反復する。
レビュアーは **Gemini**、作業は **Claude**。同じモデルが作って採点する構造を避けている。

### panel — 3つのLLMで合議する

アーキテクチャ検討のように「正解が1つに決まらないが、決めなければ進めない」課題。

Claude / Gemini / OpenAI が**それぞれ独立に案を出し、互いを匿名で採点し、機械集計した結果を人間が確定**させる。

公平性のために埋め込んでいる仕組み:

- **共有ブリーフが唯一の事実源。** 他社2者は実行環境のファイルもWebも見られない。
  Claude が先に調べた事実を全員に配り、同一の証拠・異なる推論に揃える
- **Claude の案は他案取得前に単独コミットする。** git 履歴が独立性の証跡になる
- **提案は匿名化し、提示順を評価者ごとにシャッフルする**
- **集計は `loop/bin/aggregate.mjs` が機械的に行う。** Claude は `scores.json` を参照のみ。
  自己採点バイアスと評価者間一致度も自動で測る
- **反対意見と限界を `decision.md` に必ず残す**
- **結論は人間が `/decide <ラベル>` で確定させる。** 自動では確定しない

## 使い方

1. [新しい Issue を作る](../../issues/new/choose)（「ループタスク」テンプレート）
2. 用途を選び、達成したいことを書く
3. 次の定期実行（JST 09:00 / 15:00 / 21:00）で着手される。急ぐときは routine の **Run now**
4. 進行は Issue 上の「ループ状態」コメントと `loop:*` ラベルで追える
5. 止めたくなったら **`loop:stop` ラベル**を付ける

人間の操作が必要になるのは次の場合だけ。いずれも `loop:needs-human` ラベルが付く。

| 状況 | すること |
| --- | --- |
| 合議の結論が出た | `decision.md` を読み、`/decide <ラベル>` とコメントして `loop:go` を付ける |
| 反復上限に達した | 受入基準か目的を見直して Issue を編集し、`loop:go` を付ける |
| 設定の問題で止まった | Issue コメントの診断に従う（多くは `loop-env` の credential） |

## 構成

```
.claude/skills/loop-engine/SKILL.md   ループ手順の唯一の定義。routine はこれを読む
loop/
  config.json      プラン別プリセット・モデル階層・用途ごとのモード定義
  prompts/roles/      planner worker reviewer proposer evaluator
  prompts/usecases/   research build ideation deliberation
  bin/ask-llm.mjs     他社LLM の REST アダプタ（依存ゼロ）
  bin/aggregate.mjs   合議スコアの機械集計（純関数）
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
| Claude | Pro サブスクリプション。routines は **5 run/日**が上限 | $20/月（既存） |
| Gemini | 通常レビューは `gemini-3.1-flash-lite` の**無料枠** | $0 |
| Gemini | 合議のみ `gemini-3.1-pro` 有料 | 1ラウンド $0.24 |
| OpenAI | 合議のみ（`propose`=gpt-5.2 / `evaluate`=gpt-5-mini）。通常レビューでは **OFF** | 1ラウンド $0.09 |

合議を月4件 × 2ラウンド回しても **約 $2.6/月**。通常の調査ループは追加課金ゼロ。

`loop/config.json` の `providers.*.tiers.*.enabled` が課金の門になっており、
`false` の階層を呼ぼうとすると即エラー終了する。

## 開発

```bash
npm test                      # ユニットテスト（キー不要、37件）
bash loop/bin/setup-labels.sh # ラベルを作成/更新（べき等）
```

セットアップと動作確認の全手順は [docs/SETUP.md](docs/SETUP.md)。
設計の根拠と前提にしている制約は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
リポジトリの規約と変えてはいけない不変条件は [CLAUDE.md](CLAUDE.md)。
