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

**技術調査だけは work がさらに3段に分かれる。**

1. 本体が**公式ドキュメントだけ**を調べる
2. サブエージェントが**公式以外のブログ・実装例だけ**を調べる
3. 別のサブエージェントが両者を突き合わせてレポートを書く。
   一致すれば公式、相違があれば公式を採ったうえで**非公式が何と言っていたかを備考に残す**、
   非公式のみなら**公式から得られなかった旨を明記**する

突き合わせ役には Web ツールを与えていない。追加調査で穴を埋められると照合の意味が消えるため。

### panel — 3つのLLMで合議する

アーキテクチャ検討のように「正解が1つに決まらないが、決めなければ進めない」課題。

Claude / Gemini / OpenAI が**それぞれ独立に案を出し、互いを匿名で採点し、
それを全部読んだ Claude が1つの答えに統合する**。最後に他の2者がその答えを批評する。

**どれを採るかを人間に選ばせる仕組みではない。** 成果物は統合された答えそのもので、読めば終わる。
最後に PR を作るので、答えを main に残すかどうかだけ人間が決める。

公平性のために埋め込んでいる仕組み:

- **共有ブリーフが唯一の事実源。** 他社2者は実行環境のファイルもWebも見られない。
  Claude が先に調べた事実を全員に配り、同一の証拠・異なる推論に揃える
- **Claude の案は他案取得前に単独コミットする。** git 履歴が独立性の証跡になる
- **提案は匿名化し、提示順を評価者ごとにシャッフルする**
- **集計は `loop/bin/aggregate.mjs` が機械的に行う。** Claude は `scores.json` を参照のみ。
  自己採点バイアスと評価者間一致度も自動で測る
- **統合答案の寄与比率を `loop/bin/synthesis-check.mjs` が機械的に算出する。**
  Claude は3案のうち1つを自分で書いているため、統合が「自案に飾りを付けただけ」に
  なっていないかを外から検証できるようにしている。偏れば警告が出る
- **統合答案は他の2者が批評する。** 自分の答えを自分で検品させない。
  批評者が最も見るのは「統合によって失われたもの」
- **見解が割れた点・取り込まなかった要素・限界を `answer.md` に必ず残す**

## 使い方

1. [新しい Issue を作る](../../issues/new/choose)（「ループタスク」テンプレート）
2. 用途を選び、達成したいことを書く
3. 次の定期実行（JST 09:00 / 15:00 / 21:00）で着手される。急ぐときは routine の **Run now**
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
.claude/skills/loop-engine/SKILL.md   ループ手順の唯一の定義。routine はこれを読む
loop/
  config.json      プラン別プリセット・モデル階層・用途ごとのモード定義
  prompts/roles/      planner worker reviewer proposer evaluator synthesizer critic
  prompts/usecases/   research build ideation deliberation
.claude/agents/       research-community / research-reconcile（技術調査のサブエージェント）
  bin/ask-llm.mjs     他社LLM の REST アダプタ（依存ゼロ）
  bin/aggregate.mjs   合議スコアの機械集計（純関数）
  bin/synthesis-check.mjs 統合答案の寄与比率を算出し自案への偏りを検出（純関数）
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
| Claude | Pro サブスクリプション。routines に日次上限あり（残り回数は claude.ai/code/routines） | $20/月（既存） |
| Gemini | 通常レビューは `gemini-3.1-flash-lite` の**無料枠** | $0 |
| Gemini | 合議のみ `gemini-3.8-flash` 有料 | 1ラウンド $0.03（実測） |
| OpenAI | 合議のみ（`propose`=gpt-5.5 / `evaluate`=gpt-5-mini）。通常レビューでは **OFF** | 1ラウンド $0.32（実測） |

合議を月4件 × 2ラウンド回しても **約 $2.9/月**。通常の調査ループは追加課金ゼロ。

`loop/config.json` の `providers.*.tiers.*.enabled` が課金の門になっており、
`false` の階層を呼ぼうとすると即エラー終了する。

## 開発

```bash
npm test                      # ユニットテスト（キー不要、71件）
bash loop/bin/setup-labels.sh # ラベルを作成/更新（べき等）
```

セットアップと動作確認の全手順は [docs/SETUP.md](docs/SETUP.md)。
設計の根拠と前提にしている制約は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
リポジトリの規約と変えてはいけない不変条件は [CLAUDE.md](CLAUDE.md)。
