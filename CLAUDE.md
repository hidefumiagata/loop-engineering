# このリポジトリで作業するときの規約

GitHub Issue に目的を書くと Claude Cloud の routine が自律的に作業・レビューを反復する基盤。
設計の根拠は `docs/ARCHITECTURE.md`、セットアップは `docs/SETUP.md`。

## 最初に読むもの

| やろうとしていること | 読むファイル |
| --- | --- |
| ループの挙動を変えたい | `.claude/skills/loop-engine/SKILL.md` — 手順の唯一の定義 |
| モデル・上限・用途を変えたい | `loop/config.json` |
| 作業やレビューの品質を変えたい | `loop/prompts/roles/` と `loop/prompts/usecases/` |
| 合議の偏り検査を変えたい | `loop/bin/synthesis-check.mjs` と `loop/test/synthesis-check.test.mjs` |

ロジックは routine の保存プロンプトではなく**すべてリポジトリ内**にある。
挙動を変えたいときは claude.ai の設定をいじるのではなく、ここを編集して PR を出す。

## 言語

ドキュメント・プロンプト・Issue コメント・コミットメッセージは**日本語**で書く。
コードの識別子は英語。コードコメントは日本語で「なぜ」を書く。

## コードの方針

- **依存ゼロを保つ。** `loop/bin/*.mjs` は Node の標準機能だけで書かれている。
  Claude Cloud のサンドボックスは Node 20〜22 と `gh` がプリインストールされており、
  `npm install` を挟まないことで setup script が不要になっている。この性質を壊さない。
- **外部サービスを叩く層と計算する層を分ける。** `aggregate.mjs` は純関数のみで、
  ネットワークも LLM も使わない。だからユニットテストで検証できる。この境界を守る。
- `loop/bin/` を変更したら `npm test` を通す。
- エラーメッセージには「何が起きたか」と「次に何をすればよいか」を両方書く。
  `ask-llm.mjs` が `x-deny-reason` を設定の指摘に変えているのが基準。

## GitHub の操作は REST だけ

**クラウドセッションからは GitHub GraphQL が 403 で拒否される**（初回 run の実測）。

```
403 "GitHub GraphQL is not available from Claude Code sessions;
     use the REST API (gh api repos/{owner}/{repo}/...)"
```

`gh` の `--json` 系サブコマンド（`gh repo view --json` / `gh issue list` / `gh issue edit` /
`gh issue comment` / `gh label list` / `gh pr create` / `gh pr ready`）は**すべて動かない**。
`gh api`（REST）か `loop/bin/issue-state.mjs` のサブコマンドに置き換える。
`npm test` の wiring テストがこの種の混入を検出するので、追加するときはそこも見ること。

GitHub MCP ツールで回避してはならない。`loop/bin/*.mjs` は MCP を呼べないため、
MCP に逃げると「スクリプトでは再現できない手順」になり、次の run が同じ状態から再開できなくなる。

draft PR を作らないのも同じ理由。`draft → ready` の遷移は GraphQL 専用で、
クラウドから解除できない PR が残ってしまう。完了の signal は `loop:done` ラベルが持つ。

## 他社LLMの呼び出し

必ず `node loop/bin/ask-llm.mjs` 経由。自分で HTTP を書かない。

**`ask-llm.mjs` の内部転送は curl である。Node の `fetch` に戻してはならない。**
サンドボックスは `HTTPS_PROXY` 環境変数でエージェントプロキシを指しており、
API credential のキーはそのプロキシが付与する。Node の `fetch`（undici）は
`HTTPS_PROXY` を既定で無視するため（`NODE_USE_ENV_PROXY` は Node 24 以降・サンドボックスは Node 22）、
プロキシを素通りしてキーの付かないリクエストがプロバイダに届く。
実測で、同一リクエストが curl では 200、Node fetch では 403/401 になった。
wiring テストがこの退行を検出する。

疎通が怪しいときは `node loop/bin/doctor.mjs` を実行する。
fetch と curl の両方で叩いて「キー未付与 / キー無効 / ネットワーク拒否 / プロキシ非経由」を切り分ける。

APIキーはサンドボックス内に**存在しない**。Anthropic のエージェントプロキシが
リクエストがVMを出た後にヘッダを付与する。したがって:

- キーを探す・表示する・ファイルに書くコードを書かない
- 認証ヘッダを自分で組まない（`ask-llm.mjs` がローカル開発時のみ環境変数を見る）
- 新しいプロバイダを足すときは `loop/config.json` の `providers` に定義し、
  `docs/SETUP.md` に API credential の登録手順を追記する

## 課金の扱い

`loop/config.json` の `providers.*.tiers.*.enabled` が課金の門になっている。

- `false` の階層を呼ぶと `ask-llm.mjs` が即エラー終了する。この門を迂回しない。
- 有料階層を既定で `true` にするときは、1呼び出しあたりの実コストを
  `docs/ARCHITECTURE.md` のコスト表に追記する。
- 価格を変えたら `price_per_mtok` も更新する。ここが実コスト表示の根拠になっている。

## 成果物のレイアウト

Issue 1件 = `projects/<4桁Issue番号>-<英数字スラグ>/` 1つ。ディレクトリ名に日本語を使わない。

```
projects/0012-mcp-security/          # pipeline
  README.md  plan.md
  report.md        最終成果物（後日 HTML / PPT 化する対象）
  sources.md       出典と取得日
  journal/NNN-*.md 過程の記録。成果物とは必ず別ファイル
  src/             コード成果物
  loop.json        状態のミラー（正は Issue コメント）

projects/0013-agent-arch/            # panel
  brief.md         共有ブリーフ（唯一の事実源）
  criteria.json    評価基準
  proposals/       A.md B.md C.md（初稿）/ A.v2.md B.v2.md C.v2.md（改稿）/ .authors.json
  challenges/by-*.json  敵対的レビューの結果。手で編集しない（議論の証跡）
  answer.md        最終成果物
  provenance.json  答案の要素 → 由来する案の対応表（統合役が宣言する）
  synthesis-check.json  機械集計の出力。手で書き換えない
```

`report.md` / `answer.md` は素の Markdown + 最小の front matter に統一する。
後から手動で HTML / PPT に変換するため、凝った記法を使わない。

## 絶対に変えてはいけない不変条件

これらは安全装置であり、便利さのために外してはならない。

1. **レビュアーはワーカーと別モデル。** Claude が代行した場合は必ずその事実を
   `journal` と Issue に明記する。黙って自己採点させない。
2. **`synthesis-check.json` は `synthesis-check.mjs` の出力であり、Claude は参照のみ。**
   合議の結論がどこから来たかを検証可能に保つための境界。
   統合のあと必ず `synthesis-check.mjs` を走らせる。走らせずに完了にしない。
3. **panel の propose は Claude の案を単独コミットしてから他案を取る。**
   git 履歴が独立性の証跡になる。
4. **panel は3案揃わなければ続行しない。** 2案の相互批評は決選投票が無く合議にならない。
5. **合議の結論は人間が確定させる。** エージェントは PR を作るところまでで、
   **マージはしない**。`require_human_decision` は `false`（承認待ちで run を止めない）で、
   人間の確定はマージという操作が担う。
6. **`loop` ラベルが付いていない Issue を触らない。**
7. **`main` へ直接 push しない。** ブランチは必ず `claude/` 接頭辞。
