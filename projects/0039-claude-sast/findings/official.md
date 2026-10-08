# 公式情報の調査結果（Issue #39 / 取得日 2026-10-08）

## 調査した範囲と限界
code.claude.com/docs（claude-security, security-guidance, code-review, github-actions, costs）、support.claude.com の記事、claude.com の製品ページ・公式ブログ、GitHub の anthropics/claude-code-security-review README。ブログ・Q&A等の第三者情報は読んでいない。WebFetch は小型モデル要約を経由するため、数値は原文との照合を推奨。

## 見つかったこと

### 1. Claude Security プラグイン（Claude Code 内、ローカル実行）
- **記述**: 「multi-agent vulnerability scan」を Claude Code セッション内で実行。リポジトリ全体または差分（ブランチ/PR/コミット）が対象。「runs locally in your session, uses whichever models you have access to in Claude Code, and each scan counts toward your usage」。別途の API キー設定は不要（プラグインはモデル呼び出しを自前で行わない）。前提: 有料プラン / API / サードパーティプロバイダ、python3 3.9+、Git（差分スキャンとパッチ生成）。Pro は `/config` で Dynamic workflows をオンにする。`/plugin install claude-security@claude-plugins-official`、`/claude-security` で起動。出力は `CLAUDE-SECURITY-<timestamp>/` に Markdown / JSONL / SARIF 2.1.0（CWE 分類）。検証エージェントが独立に確認した所見のみ報告。パッチは自動適用されない。「Scans are nondeterministic: two scans of the same code can surface different findings」。「A scan may take a while, may use a significant number of tokens, and needs Claude Code left open」。大規模リポジトリは領域ごとのスキャンを推奨。「doesn't replace your existing source-code security tools」。
- **出典**: [Scan your codebase for vulnerabilities](https://code.claude.com/docs/en/claude-security) — 取得日 2026-10-08
- **種別**: ドキュメント

### 2. Claude Security（マネージドサービス）
- **記述**: Enterprise 向け public beta（2026-04-30 公式ブログ時点では「Team and Max は coming soon」）。claude.ai/security から利用、管理者がコンソールで有効化。製品ページは「Claude Mythos 5.1 でスキャン」「Mythos 5.1 のスキャンは claude.ai の Claude Security アプリのみ」。定期スキャン、検証パイプライン、パッチ提案、CSV/Markdown 出力、Slack/Jira webhook。docs 側では「managed product, available on the Enterprise plan」。価格・利用上限は記載なし。リポジトリは GitHub 接続（GitLab/Bitbucket 等はプラグイン側が対応）。
- **出典**: [Claude Security public beta](https://claude.com/blog/claude-security-public-beta)（公式ブログ, 2026-04-30）、[製品ページ](https://claude.com/product/claude-security) — 取得日 2026-10-08
- **種別**: 公式ブログ / 製品ページ
- **注記**: ブログはモデルを Opus 4.7 と記載、製品ページは Mythos 5.1 と記載（時期差と思われる。未確認）。

### 3. `/security-review` コマンド
- **記述**: 現在ブランチの保留中変更に対する「single pass」のセキュリティレビュー。Pro/Max 個人プランと API Console アカウントで利用可（support 記事 2026-03-16 付）。検出対象: SQLi, XSS, 認証/認可の欠陥, 安全でないデータ処理, 依存関係の脆弱性。「should complement, not replace, your existing security practices」。docs では `.claude/commands/` へコピーしてカスタマイズ可能。
- **出典**: [Automated Security Reviews in Claude Code](https://support.claude.com/en/articles/11932705-automated-security-reviews-in-claude-code)、[claude-security docs の比較表](https://code.claude.com/docs/en/claude-security) — 取得日 2026-10-08
- **種別**: ヘルプ記事 / ドキュメント
- **注記（公式内の不一致）**: support 記事は依存関係の脆弱性を検出範囲に含めるが、GitHub リポジトリのプロンプトは古いサードパーティライブラリ起因を除外する（検索要約経由の情報、要確認）。

### 4. claude-code-security-review（GitHub Action）
- **記述**: PR の diff のみ解析（diff-aware）。MIT。入力 `claude-api-key` 必須で、README が示す認証は API キーのみ（「needs to be enabled for both the Claude API and Claude Code usage」）。既定モデル `claude-opus-4-1-20250805`、タイムアウト既定 20 分。「not hardened against prompt injection… only trusted PRs」。DoS・レート制限・メモリ/CPU 枯渇・汎用的な入力検証・オープンリダイレクトは自動除外。言語非依存（"Works with any programming language"）。
- **出典**: [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) — 取得日 2026-10-08
- **種別**: 提供元 GitHub リポジトリ README
- **注記**: 価格の記載なし。サブスク認証の記載なし。

### 5. Claude Code GitHub Actions（claude-code-action）
- **記述**: `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token`、Pro/Max/Team/Enterprise のサブスク認証）または `ANTHROPIC_API_KEY` が使える。「If you authenticate with an OAuth token, runs use your Claude subscription instead of API billing.」加えて GitHub Actions 分（ランナー）を消費。OAuth トークンは実行者のサブスクに紐づくため、組織共有には API キー推奨。プロンプト/スキルで任意のレビュー（`/code-review` 等）を実行可能。定期実行（cron）も可。
- **出典**: [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions) — 取得日 2026-10-08
- **種別**: ドキュメント

### 6. Code Review（マネージド PR レビュー）
- **記述**: research preview、Team / Enterprise のみ。ZDR・HIPAA 構成では不可。既定は正しさ（バグ）中心でセキュリティ脆弱性も対象。重大度は Important / Nit / Pre-existing。課金: 「Each review averages $15-25」「usage credits で別課金され、プラン付属枠を消費しない」。平均 20 分。ブロックしない（check run は neutral）。
- **出典**: [Code Review](https://code.claude.com/docs/en/code-review) — 取得日 2026-10-08
- **種別**: ドキュメント

### 7. security-guidance プラグイン（書いている最中の検査）
- **記述**: 全プランで利用可。編集時パターンマッチ（モデル呼び出しなし・無料）、ターン終了時レビュー（最大 30 ファイル、連続 3 回まで）、commit/push 時 agentic レビュー（1 時間あたり 20 回上限）。既定モデルは Claude Opus 4.7。モデル利用分は通常の usage に計上。「None of the layers block writes or commits」「not a complete security solution」。
- **出典**: [Catch security issues as Claude writes code](https://code.claude.com/docs/en/security-guidance) — 取得日 2026-10-08
- **種別**: ドキュメント

### 8. サブスク枠 vs API 課金
- **記述**: Teams/Enterprise は席ごとに「5 時間のローリング窓と週次窓」の許容量を持ち、Claude chat・Cowork と共有。超過後は usage credits で継続可（上限設定可）。Pro/Max は利用がサブスクに含まれ、超過は usage credits。API/Console は従量課金、ワークスペース上限・TPM/RPM 推奨値（1–5 人: 200k–300k TPM / 5–7 RPM 等）。「Across enterprise deployments, the average cost is around $13 per developer per active day and $150-250 per developer per month」。サブスクでのキャッシュ寿命は 1 時間、usage credits 利用中は 5 分。
- **出典**: [Manage costs effectively](https://code.claude.com/docs/en/costs) — 取得日 2026-10-08
- **種別**: ドキュメント

### 9. 従来型 SAST との関係
- **記述**: 公式は「The plugin doesn't replace your existing source-code security tools. Run it alongside static analysis, dependency scanning, and code review」「reasons about your code the way a human security researcher would, which complements the deterministic checks」。多層防御の表で CI に既存の静的解析・依存関係スキャナを置く。CodeQL / Semgrep 個別への言及は確認できず。
- **出典**: [claude-security docs](https://code.claude.com/docs/en/claude-security) — 取得日 2026-10-08
- **種別**: ドキュメント

## 公式に記述が無かった論点
- Claude Security プラグイン 1 スキャンあたりの具体的なトークン量・枠消費率（「significant number of tokens」「相対コスト表示」のみ）
- Pro / Max / Team 各プランでのスキャン回数上限の数値
- 対応言語の一覧（security-review Action は「any language」のみ）
- 検出精度（再現率・誤検知率）の数値
- CodeQL / Semgrep との具体的な比較・併用手順
- Claude Security マネージド版の価格
- Claude Security プラグインを GitHub Actions / CI で無人実行する公式手順
