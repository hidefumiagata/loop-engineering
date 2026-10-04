# 003 challenge

- 攻撃者3者（claude / gemini / openai）が、自分の案を除いた2案を攻撃した。欠けた攻撃者はなし。
- 各攻撃者に渡したのは brief.md と他2案のみ。`.authors.json` は渡していない。提示順は攻撃者ごとに変えた。
- gemini: `gemini:propose` (gemini-3.8-flash) / USD 0.0230
- openai: `openai:propose` (gpt-5.5) / USD 0.3841
- claude: 本体が代行（攻撃者としての参加。コスト対象外）
- `*.meta.json` は `challenges/` ではなく `journal/` に置いた。

| 攻撃者 | 対象 | severity |
| --- | --- | --- |
| claude | B / C | 要修正 / 要修正 |
| gemini | C / A | 要修正 / 致命的 |
| openai | B / A | 要修正 / 致命的 |
