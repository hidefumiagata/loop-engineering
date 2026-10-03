# 用途: 合議（panel モード）

3つのLLMがそれぞれ独立に案を出し、互いを匿名で採点し、機械集計した結果を人間が確定させる。
アーキテクチャ検討のように「正解が1つに決まらないが、決めなければ進めない」課題に使う。

成果物は `decision.md`（意思決定記録）。過程は `brief.md` / `proposals/` / `evaluations/` / `scores.json` / `journal/`。

## brief.md — 共有ブリーフ（Claude が書く）

**これが合議の公平性の土台である。**
Gemini と OpenAI はこの実行環境のファイルもコマンドもWebも触れない。
Claude だけが事実を知っている状態で案を競わせると、Claude の案が有利になるだけで合議にならない。
だから Claude は先に、3者全員が同じ出発点に立てるブリーフを書く。

```
---
title: <決めたいこと>
issue: <番号>
round: <ラウンド番号>
updated: <YYYY-MM-DD>
---

## 決めたいこと
（1段落。何を決めるのか。決めた後に何が起きるのか）

## 制約
（変えられない条件。予算・プラン上限・既存の設計・納期など）

## 前提事実
（★最重要。Claude が調べた・読んだ事実をここに展開する。
  関連コードの抜粋、ドキュメントの引用（出典URL付き）、実測値。
  「調べれば分かる」ではなく、ここに書く。ここに無いことは他の2者には存在しない）

## 評価基準
| ID | 基準 | 重み | 満たしたと判断する根拠 |
| --- | --- | --- | --- |
| c1 | ... | 3 | ... |

（重み: 3=これが無ければ失敗 / 2=重要 / 1=あれば良い。重み3は 2〜4 件）

## 検討の対象外
（今回は決めないこと。提案者が発散しないための枠）
```

`brief.md` の基準表と同じ内容を `criteria.json`（`[{"id","text","weight"}]`）にも書き出す。
`aggregate.mjs` は `criteria.json` のみを読むため、**両者が食い違うと集計が無意味になる**。

## propose フェーズの順序規律

この順序を破ってはならない。守られているかは git 履歴で検証される。

1. Claude が自分の案を `proposals/claude.md` に書き、**それだけを単独でコミットして push する**。
2. その後で `gemini:propose` と `openai:propose` を呼ぶ。
3. 3案を A / B / C に匿名化して `proposals/A.md` `B.md` `C.md` にリネームし、
   対応表を `proposals/.authors.json`（`{"A":"gemini","B":"claude","C":"openai"}`）に書く。
   **割り当てはラウンドごとにランダムにする**（毎回 claude=A だと著者が推測できる）。
4. `proposals/claude.md` は削除する（匿名化前の名前が残ると著者が分かってしまう）。

Claude が他案を見てから自案を書けてしまう構造を、コミット順で物理的に封じるのが 1. の意図である。

## evaluate フェーズの規律

- 各評価者に渡すのは `brief.md` + A/B/C の本文のみ。`.authors.json` は**絶対に渡さない**。
- **提示順を評価者ごとにシャッフルする。** 順序効果（最初/最後に出た案が有利）を散らす。
- Claude も他の2者と同じ `evaluator.md` と同じスキーマで採点する。自分の案も採点する
  （自己採点バイアスは `aggregate.mjs` が測るので、避けずに採点してよい）。
- 結果は `evaluations/by-claude.json` `by-gemini.json` `by-openai.json` に保存する。

## aggregate フェーズ

`node loop/bin/aggregate.mjs --dir projects/<n>-<slug>` を実行するだけ。
**`scores.json` を手で書き換えてはならない。** 数値を引用するときは必ずこのファイルから取る。

## decision.md — 意思決定記録（Claude が書く）

```
---
title: <決めたこと>
issue: <番号>
decided_by: pending-human | <ユーザー名>
updated: <YYYY-MM-DD>
---

## 推奨
（scores.json の首位案。ラベルと著者と総合点を明記）

## スコア表
（scores.json から転記。案 × 基準の平均点、評価者ごとの点、ばらつき。
  `weighted_score` と `weighted_score_excl_self`（著者自身の採点を除いた点）の**両方**を列に持つ。
  `winner` と `winner_excl_self` が違う場合は、その事実を表の直下に明記する）

## 推奨理由
（点数の羅列ではなく、どの基準でどう差がついたのかを質的に説明する）

## 不採用案から拾うべき要素
（★必須。負けた案の中で、採用案に取り込む価値がある部分。
  合議の価値の半分はここにある）

## 保存すべき反対意見
（★必須。少数意見・最も厳しい biggest_concern。
  後から「あのとき誰も言わなかった」とならないために残す）

## 集計上の注意
（scores.json の warnings をそのまま列挙する。
  自己採点バイアス・一致度の低さ・首位との差が小さい、などを隠さない）

## この合議の限界
（★必須。定型文で構わないが必ず書く:
  「Gemini と OpenAI はこの実行環境のファイル・コマンド・Webに触れていない。
   両者の評価は brief.md の記述のみに基づく。コードの実地検証は Claude のみが行った。」
  これに加えて、今回固有の限界があれば書く）
```

## 終了条件

- `scores.json` を出して `decision.md` を書いたら、`loop:needs-human` を付けて**必ず停止する**。
  合議の結論を自動で確定させてはならない。
- 人間が Issue に `/decide <ラベル>` とコメントし `loop:go` を付けたら、
  次の実行が採用案を `plan.md` に落として pipeline モードの work フェーズに引き継ぐ。
- 全案が重み3の基準を満たせていない（`scores.json` の `unmet_criteria` に重み3が含まれる）場合は、
  ギャップを `brief.md` の「前提事実」に追記して propose からやり直す。
  これを `max_panel_rounds` 回まで行い、収束しなければ `loop:needs-human`。

## 提案者が3者揃わなかったとき

`min_proposers` は 3。Gemini か OpenAI が 429/403 等で落ちた場合、
**2案のまま続行してはならない。** `loop:blocked` を付けて Issue に原因を書き、次の実行で再試行する。
2案の相互批評は決選投票が無く、合議として成立しないため。
