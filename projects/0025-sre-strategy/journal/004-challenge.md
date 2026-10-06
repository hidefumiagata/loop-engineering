# 004 challenge

攻撃者は3者すべてが揃った（欠落なし）。各者には自分の案を除く2案だけを渡し、`.authors.json` は渡していない。

| 攻撃者 | 対象 | 使用モデル | コスト |
| --- | --- | --- | --- |
| gemini:propose | B, A（提示順はシャッフル） | gemini-3.8-flash | USD 0.0192 |
| openai:propose | C, A | gpt-5.5 | USD 0.3279 |
| claude | B, C | claude（本体） | — |

severity は全件「要修正」（致命的なし）。結果は `challenges/by-*.json` を参照。
`*.meta.json` は `journal/004-challenge-by-*.json.meta.json` に移した。
