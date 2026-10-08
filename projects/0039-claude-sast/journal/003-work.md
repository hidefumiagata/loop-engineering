# 003 work（iteration 1）

## 今回やったこと
- 段階1: 本体が公式ドキュメントのみ調査 → findings/official.md
- 段階2: research-community が公式以外のみ調査 → findings/community.md（公式の結果は渡していない）
- 段階3: research-reconcile が突き合わせ。**突き合わせは research-reconcile が行い、本体は転記のみ**。返却本文を一字一句変えず report.md に保存した（front matter の `status: reviewed` もサブエージェントの記述のまま。これは本 run のレビュー済みを意味しない。レビューは次の review フェーズで Gemini が行う）

## 成果物に載せなかったこと
- 特になし（本体は編集していない）

## 行き詰まった点
- WebFetch は小型モデル要約を経由するため、公式の数値は原文照合が未了。report の Appendix A-7 に明記済み
- 規約上の OAuth 利用可否は公式文言を確認できていない（report 表8）

## 次に残っている疑問
- 公式の利用規約でのサブスク OAuth のCI利用の扱い
- /security-review の依存関係の扱い（support とリポジトリのプロンプトで不一致）
- マネージド版のモデル表記・提供プランの現状
