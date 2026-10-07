# 002 propose（3案揃わず停止）

- claude: `proposals/claude.md` を単独コミット・push 済み
- openai:propose: 成功（USD 0.3279）。`proposals/_openai.md`（匿名化前のまま保持）
- gemini:propose: HTTP 502 を3回リトライしても失敗（31秒でプロキシが切断）。案は未取得

`min_proposers: 3` により続行しない。`phase: propose` のまま `loop:blocked`。
Gemini は同期呼び出しで約30秒制限に当たっている。`loop/` の設定変更は人間の仕事なので手を付けない。

## 再実行（2026-10-06 の次の run）
- gemini:propose を再実行したが、同じく 502（30秒、3回リトライ）で失敗。案は未取得のまま
- `min_proposers: 3` により続行しない。`phase: propose` のまま `loop:blocked` + `loop:needs-human`
- `loop/config.json` は人間の領分なので変更しない

## 再々実行（2026-10-07）
- main の `stream: true` 修正（Gemini propose）をブランチに merge して取り込んだ
- gemini:propose 成功（USD 0.0164、43秒、最初のバイト 6.3秒、attempts=1）。3案が揃った
- 3案を A/B/C にランダム割り当てして匿名化し、`.authors.json` に対応表を分離。匿名化前のファイルは削除、`*.meta.json` はリネームして保持
- 各案に著者を示す記述は無いことを確認
- 次は `phase: challenge`
