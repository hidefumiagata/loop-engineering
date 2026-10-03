# このリポジトリで作業するときの規約

GitHub Issue に目的を書くと Claude Cloud の routine が自律的に作業・レビューを反復する基盤。
設計の根拠は `docs/ARCHITECTURE.md`、セットアップは `docs/SETUP.md`。

## 最初に読むもの

| やろうとしていること | 読むファイル |
| --- | --- |
| ループの挙動を変えたい | `.claude/skills/loop-engine/SKILL.md` — 手順の唯一の定義 |
| モデル・上限・用途を変えたい | `loop/config.json` |
| 作業やレビューの品質を変えたい | `loop/prompts/roles/` と `loop/prompts/usecases/` |
| 合議の集計を変えたい | `loop/bin/aggregate.mjs` と `loop/test/aggregate.test.mjs` |

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

## 他社LLMの呼び出し

必ず `node loop/bin/ask-llm.mjs` 経由。`curl` を直接書かない。

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
  proposals/A.md B.md C.md .authors.json
  evaluations/by-*.json
  criteria.json    aggregate.mjs が読む評価基準
  scores.json      機械集計の出力。手で書き換えない
  decision.md      最終成果物
```

`report.md` / `decision.md` は素の Markdown + 最小の front matter に統一する。
後から手動で HTML / PPT に変換するため、凝った記法を使わない。

## 絶対に変えてはいけない不変条件

これらは安全装置であり、便利さのために外してはならない。

1. **レビュアーはワーカーと別モデル。** Claude が代行した場合は必ずその事実を
   `journal` と Issue に明記する。黙って自己採点させない。
2. **`scores.json` は `aggregate.mjs` の出力であり、Claude は参照のみ。**
   合議の結論がどこから来たかを検証可能に保つための境界。
3. **panel の propose は Claude の案を単独コミットしてから他案を取る。**
   git 履歴が独立性の証跡になる。
4. **panel は3案揃わなければ続行しない。** 2案の相互批評は決選投票が無く合議にならない。
5. **合議の結論は人間が確定させる。** `require_human_decision: true` を自動化で迂回しない。
6. **`loop` ラベルが付いていない Issue を触らない。**
7. **`main` へ直接 push しない。** ブランチは必ず `claude/` 接頭辞。
