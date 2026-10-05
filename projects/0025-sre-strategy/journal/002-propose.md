# 002 propose（未完了）

- claude 案: `proposals/claude.md` を単独コミットで push 済み。
- openai:propose: 取得済み（`proposals/_openai.md`、コストは `.meta.json`）。
- gemini:propose: **取得できず**。HTTP 502（30秒でプロキシが切断）を、ask-llm 内の3回リトライ＋手動の再実行1回、計2回とも再現。
  `loop/config.json` の `providers.gemini.tiers.propose` に `background: true` が無く（openai は有り）、同期リクエストが約30秒制限に当たっている可能性が高い。
- 3案揃わないため `min_proposers: 3` に従い続行せず `loop:blocked`。`phase: propose` のまま。匿名化は未実施。
