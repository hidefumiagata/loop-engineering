# work 1回目

## 今回やったこと
- Cloudflare Containers の料金・制限・アーキテクチャ、GitHub-hosted の料金表と仕様、self-hosted の要件と JIT API、OSS 実装（k2wanko）と Sandbox PoC（gist）を取得し、report.md を作成。
- Cloudflare のコストは公式単価から自分で計算した（CPU フル使用の上限値）。

## 成果物に載せなかったこと
- 二次情報ブログ（Cloudflare 経由の Actions 失敗など）は主題と無関係のため除外。

## 行き詰まり
- WebFetch は要約を返すため、取得できなかった項目（GitHub-hosted の Docker/service containers の詳細、larger runner の RAM、無料枠）は「未確認」と report.md に明記した。
- 実環境でのデプロイはクレデンシャルが無く未実施。

## 残る疑問
- Workers / Durable Objects の単価。Windows/macOS/arm64 の公式な非対応明記。
