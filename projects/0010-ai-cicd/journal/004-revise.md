# 004 revise

- 改稿者3者が、自分の案と自分の案への指摘（批評者1/2として匿名化）だけを受け取って改稿した。他案・`.authors.json` は渡していない。
- gemini: `gemini:propose` (gemini-3.8-flash) / USD 0.0301
- openai: `openai:propose` (gpt-5.5) / USD 0.5008。1回目は `max_output_tokens=8000` で打ち切られたため、上限を 16000 にして1回だけ再実行した（打ち切り分のコストは記録なし）。
- claude: 本体が自案を改稿（コスト対象外）。
- 3案とも改稿が取得できた。初稿のコピーで代替した案はない。
- 改稿版: `proposals/A.v2.md` `B.v2.md` `C.v2.md`
