# 003 challenge

自分以外の2案を攻撃させた（`.authors.json` に従い、各者から自案を除外。提示順は攻撃者ごとに変えた）。

| 攻撃者 | 対象 | 備考 |
| --- | --- | --- |
| gemini (gemini-3.8-flash) | C, A | USD 0.0155 |
| openai (gpt-5.5) | B, C | USD 0.3951 |
| claude | A, B | `challenger.md` に従い本体が執筆 |

- 3者とも取得できた。欠落なし。
- 各攻撃の `severity` は全員 `要修正`。致命的の指摘は無い。
- `*.meta.json` は `challenges/` から `journal/` へ移した。
- 次フェーズ: revise（各者に自案と自案への指摘だけを渡す）。
