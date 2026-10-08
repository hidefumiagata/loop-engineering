---
title: ClaudeのサブスクでSAST
issue: 39
updated: 2026-10-08
status: reviewed
---

# ClaudeのサブスクでSAST（サブスク枠内で使える脆弱性検出手段の本命特定）

## 調査概要

サブスク枠内で使える公式のSAST的手段は、Claude Securityプラグイン、`/security-review`、claude-code-action（OAuth認証）、security-guidanceの4つ。本命は全体スキャンにClaude Securityプラグイン、日常の差分に`/security-review`とした。いずれも従来型SASTの代替ではなく併用が前提。再現率の実測と対応言語は公式・非公式とも見つからなかった。

## 調査結果

### 表1 サブスク枠内で使える公式手段と、枠外の手段（a1）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| Claude Security プラグイン | Claude Code内のプラグイン。ローカルのセッション内で実行する。認証はClaude Codeのもので、別途のAPIキーは不要。「each scan counts toward your usage」とあり、サブスク枠（または利用中のAPI/プロバイダ課金）を消費する。`/plugin install claude-security@claude-plugins-official` で入れ、`/claude-security` で起動する | 公式 | [docs](https://code.claude.com/docs/en/claude-security)（取得日 2026-10-08） |
| `/security-review` コマンド | Claude Code内のコマンド。ローカルで実行する。現在ブランチの保留中変更を対象にした「single pass」のレビュー。Pro/Max個人プランとAPI Consoleアカウントで利用可。サブスク枠を消費する | 公式 | [support記事](https://support.claude.com/en/articles/11932705-automated-security-reviews-in-claude-code)（2026-03-16付、取得日 2026-10-08）。枠消費という書き方は公式に明示が無く、「Claude Code内の利用はサブスクに含まれる」という一般記述からの読み取り |
| claude-code-action（GitHub Actions） | GitHub Actionsのランナー上で動く。認証は `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token`、Pro/Max/Team/Enterprise）または `ANTHROPIC_API_KEY`。OAuthを使うと「runs use your Claude subscription instead of API billing」となり、加えてActions分（ランナー）を消費する。プロンプトやスキルで任意のレビュー（`/code-review` 等）を実行でき、cronの定期実行も可。OAuthトークンは実行者のサブスクに紐づくため、組織共有にはAPIキーが推奨されている | 公式（非公式と相違） | [docs](https://code.claude.com/docs/en/github-actions)（取得日 2026-10-08）。非公式では、2025-12時点のOAuthトークンは約1日で失効し確実に動くのはAPIキーのみとの報告がある（[issue #727](https://github.com/anthropics/claude-code-action/issues/727)）。詳細は表8 |
| security-guidance プラグイン | 書いている最中の検査。全プランで利用可。編集時はパターンマッチ（モデル呼び出しなし・無料）。ターン終了時レビューとcommit/push時のagenticレビューはモデルを使い、通常のusageに計上される | 公式 | [docs](https://code.claude.com/docs/en/security-guidance)（取得日 2026-10-08） |
| claude-code-security-review（GitHub Action） | GitHub Actionsのランナー上で動く。入力 `claude-api-key` が必須で、READMEが示す認証はAPIキーのみ。課金はAPI従量。サブスク認証の記載は無い。サブスク枠の手段ではない | 公式 | [README](https://github.com/anthropics/claude-code-security-review)（取得日 2026-10-08）。非公式の設定例（Deriv、nikiforovall、avinashsangle）もすべてAPIキーで、OAuthの実例は見つかっていない |
| Claude Security（マネージド版） | claude.ai/securityで使うクラウドサービス。Enterprise向けpublic beta。管理者がコンソールで有効化する。docsは「managed product, available on the Enterprise plan」。GitHub接続が前提。課金方式（サブスク枠かどうか）と価格は公式に記載なし | 公式 | [公式ブログ](https://claude.com/blog/claude-security-public-beta)（2026-04-30）、[製品ページ](https://claude.com/product/claude-security)（取得日 2026-10-08）。ブログは「TeamとMaxはcoming soon」と記載。課金方式と価格は公式に情報が無い |
| Code Review（マネージドPRレビュー） | サブスク枠外。Team/Enterpriseのresearch preview。「Each review averages $15-25」で、usage creditsで別課金され、プラン付属枠を消費しない。ZDR・HIPAA構成では不可 | 公式 | [docs](https://code.claude.com/docs/en/code-review)（取得日 2026-10-08）。非公式の複数ブログも約15〜25ドルと言及し、公式と一致 |

### 表2 本命と選定（a2）

評価は定性（高/中/低）で、数値スコアは付けない。各軸の根拠は表の備考に書いた。「本命」の判断は、公式と非公式の双方の材料をもとにした本レポートの判断で、公式が推奨しているわけではない。

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 本命A：全体・定期スキャン | Claude Securityプラグイン。サブスク枠内で、リポジトリ全体を多エージェントで走査して検証までできる公式手段は、これのみ | 公式 | 公式は、独立した検証エージェントが確認した所見のみを報告し、SARIF 2.1.0（CWE分類）で出力し、パッチは自動適用しないと説明している |
| 本命B：日常の差分 | `/security-review`。ローカルで1回の通しレビューを行い、差分のみを対象にする。軽いので毎回の変更に向く | 公式 | 非公式（nikiforovall）では、コマンド版は全PRで回せるほど安価で、プラグインは理由があるときだけ使うものと位置づけられている |
| 精度（Claude Securityプラグイン） | 中〜高。ただし再現率（見逃し）は測られていない | 非公式のみ | 公式に精度の数値は無い。DevelopersIOは、候補60件から3観点の投票を経て13件を報告し、24件を誤検知として除外した（2026-10-07）。GMOは約1,670ファイルで72件を報告し、誤検知は「ほぼなし」とした（2026-09-01）。いずれも著者の判断で、見逃しの測定は無い |
| 精度（`/security-review`） | 中〜高（人工ベンチマークのみ）。OWASP Benchmark Java（n=110）では検出率98.2%、誤検知率3.6% | 非公式のみ | Zenn (yukkie1114)、2026-06-27。人工コードで、Javaのみ、1名の検証で、カテゴリごとに分割投入している。実プロジェクトでの精度とは別 |
| 運用コスト | プラグインは高い（1回で大量トークン）。`/security-review`は低い。Actionは従量でAPI課金 | 公式 | 公式は、プラグインは「significant number of tokens」を使い得るとし、`/security-review`は「single pass」としている。実測値は表6 |
| 導入難易度 | プラグインと `/security-review` は低い（ローカルで即時）。CIの無人運用は高い | 公式 | プラグインをActionsで無人実行する公式手順は無い（情報なし）。無人実行ではセッション上限のリセット時刻を考慮して開始時刻を決める必要がある（GMO。非公式のみ） |
| 採用条件 | (1) サブスク枠内で完結させたい。(2) 人が開発端末でスキャンを回せる。(3) 従来型SASTを併用する。この3つが揃うならA+Bを使う | 公式 | 併用の前提は公式の記述（表5）。(1)(2)は、プラグインがローカル実行で枠を消費し、Claude Codeを開いたままにする必要があるという公式記述による |
| 非公式の補足（条件別の選び分け） | PRごとの自動ゲートが必要なら、claude-code-actionのOAuth（枠内）かAPIキー（従量・安定）を選ぶ。常時稼働・業務用途・組織共有ならAPIキーを選ぶ。規約や上限を確実に回避したいときも同様 | 非公式のみ | 組織共有にAPIキーが推奨されるのは公式の記述。常時稼働・業務用途にAPIキーを推奨するのはAutonomee（2026-10-07更新）。公式の判断基準は無い |
| 非採用条件 | 決定論的な保証が要る場合、ゲートとしてマージを機械的に止めたい場合、超大規模リポジトリを枠内で一括スキャンしたい場合は、非採用とする | 公式 | 非決定性（同一コードで所見が変わり得る）は公式の記述。大規模リポジトリは領域ごとのスキャンが公式推奨。GMOではMax 20xでも約29万行（2リポジトリ）で上限に達した（非公式のみ） |

### 表3 公式が明記する制約（a3）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| プラグインのプラン・環境要件 | 有料プラン / API / サードパーティプロバイダ。python3 3.9+。Git（差分スキャンとパッチ生成に必要）。ProはDynamic workflowsを `/config` でオンにする | 公式 | 非公式（Solvio）も同じ内容で、Claude Code v2.1.154以降が要るとし、Python 3.9.6以上と書く。DevelopersIOは、Team/Enterpriseで組織設定がDynamic workflowsを無効にしているとスキャンが始まらないと述べる |
| プラグインの検出範囲 | リポジトリ全体、または差分（ブランチ/PR/コミット）。出力はMarkdown / JSONL / SARIF 2.1.0（CWE分類） | 公式 | |
| プラグインの非決定性 | 「two scans of the same code can surface different findings」 | 公式 | |
| プラグインの実行条件 | 時間がかかる場合があり、トークンを大量に使う場合があり、Claude Codeを開いたままにする必要がある。大規模リポジトリは領域ごとのスキャンを推奨。パッチは自動適用されない | 公式 | 枠消費率の数値は公式に無い |
| `/security-review` の検出対象 | SQLi、XSS、認証/認可の欠陥、安全でないデータ処理、依存関係の脆弱性。保留中の変更のみが対象で「single pass」 | 公式 | 公式内の不一致がある。supportは依存関係の脆弱性を含むが、GitHubリポジトリのプロンプトは古いサードパーティライブラリ起因を除外する（検索要約経由、要確認）。非公式（Zenn h_m）では、確信度80%以上かつ信頼度8未満を除外し、18項目を絶対除外し、HIGH/MEDIUMのみを出力するとされる |
| `/security-review` の提供プラン | Pro/Max個人プランとAPI Consoleアカウント | 公式 | `.claude/commands/` にコピーしてカスタマイズできる |
| Actionの検出範囲・設定 | PRのdiffのみ（diff-aware）。MIT。既定モデル `claude-opus-4-1-20250805`。タイムアウト既定20分。DoS、レート制限、メモリ/CPU枯渇、汎用的な入力検証、オープンリダイレクトは自動除外 | 公式 | 非公式（avinashsangle、2026-04-22）も既定モデルとタイムアウトで一致。ただし現行の既定モデルは変わっている可能性が高いとされ、要確認 |
| Actionの安全性 | プロンプトインジェクションに対して強化されていない。信頼できるPRのみで使う | 公式 | 非公式も、外部コントリビューターのPRは承認必須にすべきとしている |
| 対応言語 | Actionは「Works with any programming language」。プラグインと`/security-review`は一覧なし | 公式 | 非公式でも明示した記事は無かった。事例の言語はTS/JS、Python、CDK、Java（ベンチ） |
| security-guidanceの上限 | ターン終了時レビューは最大30ファイル、連続3回まで。commit/push時のagenticレビューは1時間あたり20回。既定モデルはOpus 4.7。どの層も書き込みやコミットをブロックしない | 公式 | 完全なセキュリティ対策ではないと明記されている |
| Code Reviewの制約 | Team/Enterpriseのみ。ZDR・HIPAAでは不可。平均20分。ブロックしない（check runはneutral）。重大度はImportant / Nit / Pre-existing | 公式 | |
| マネージド版のモデル表記 | ブログはOpus 4.7、製品ページはMythos 5.1。どちらが現行かは未確認（時期差と思われる） | 公式 | 製品ページは「Mythos 5.1のスキャンはclaude.aiのClaude Securityアプリのみ」と記す。プラグイン側は「whichever models you have access to」で、モデルの固定は無い |

### 表4 サブスク枠内利用とAPI従量課金の対比（a4）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| コスト発生のトリガー（サブスク枠） | Claude Code内でスキャンや`/security-review`を実行するたびに、枠を消費する。claude-code-actionにOAuthを使った場合は、モデル利用がサブスクに計上され、これに加えてActionsのランナー分を消費する | 公式 | [costs](https://code.claude.com/docs/en/costs)、[github-actions](https://code.claude.com/docs/en/github-actions) |
| コスト発生のトリガー（API従量） | APIキーを使う実行ごとに従量課金される。対象は、claude-code-security-review Action、claude-code-actionのAPIキー認証、APIまたはConsole利用 | 公式 | Actionは価格の記載なし。非公式（avinashsangle）の概算では、500行・10ファイルのPRで、Opus 4.1が約0.90〜1.80ドル/回、Sonnet 4.6が約0.20〜0.40ドル/回。週30 PRならSonnetで月約25〜35ドル、Opusで月約120〜160ドル（筆者概算、確からしさは低〜中） |
| サブスク枠の制限 | Teams/Enterpriseは席ごとに「5時間のローリング窓と週次窓」の許容量を持ち、Claude chat・Coworkと共有する。Pro/Maxは利用がサブスクに含まれる。超過後はusage creditsで継続でき、上限も設定できる | 公式 | 枠のトークン数や、プラン別のスキャン回数上限は公式に無い（情報なし）。非公式では、Max 20xでも約29万行の2リポジトリのスキャンでセッション上限に達して中断し、リセット後に再開した（GMO）。著者は、この規模は20x前提で5xでは途中で止まる可能性が高いと見ている |
| API従量の制限 | ワークスペース上限と、TPM/RPMの推奨値がある。例として、1〜5人の規模で200k〜300k TPM、5〜7 RPM | 公式 | 数値は小型モデル要約を経由しているため、原文との照合を推奨 |
| 平均的な費用の目安 | 組織導入全体の平均で、開発者1人あたり1アクティブ日で約13ドル、月に150〜250ドル | 公式 | SAST専用の数値ではなく、Claude Code利用全体の目安 |
| キャッシュ | サブスク利用ではキャッシュ寿命が1時間。usage credits利用中は5分 | 公式 | |
| Agent SDK・`claude -p` の課金分離 | 2026年6月15日にサブスク上限から切り離す計画が告知されたが、施行当日に一時停止された。停止後は、これらの利用が引き続きサブスク上限から引かれるという。7〜10月の続報は未確認 | 非公式のみ | 公式サイトからは情報を得られなかった。[The New Stack](https://thenewstack.io/anthropic-pauses-claude-agent-sdk-subscription-change/)、[digitalapplied](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026)（いずれも検索要約のみ、2026-06頃）。告知の内容は、別クレジットがPro 20ドル、Max5x 100ドル、Max20x 200ドルとされる |

### 表5 従来型SASTとの役割差・併用方針（a5）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 公式の方針 | 「The plugin doesn't replace your existing source-code security tools. Run it alongside static analysis, dependency scanning, and code review」。人間のセキュリティ研究者のようにコードを推論するもので、決定論的なチェックを補完する。多層防御の表で、CIに既存の静的解析と依存関係スキャナを置く。`/security-review`も「complement, not replace」 | 公式 | CodeQL / Semgrepへの個別の言及は公式に無い。具体的な比較・併用手順も公式に無い（情報なし） |
| 非公式の整理（役割差） | 静的解析はルール/データフローで既知パターンを網羅し、CodeQLはtaint追跡、Semgrepは高速な構造パターン検出に強い。`/security-review`は文脈を読み、認可不備などのビジネスロジックを補う | 非公式のみ | 公式サイトからは情報を得られなかった。crystal-method、Zenn (rf_p)、start-link、Provectus。いずれも検索要約またはタイトルのみで、独立した実測は無い |
| 非公式の運用案 | Semgrepを毎PRの高速フィードバックに、CodeQLを夜間/定期の深い解析に使う。Claude系は認証・決済・外部入力に絡む変更への補完にする | 非公式のみ | 公式に同様の運用案は無い。併用の効果（重複率・補完率）を測った記事は見つからなかった。Deriv、nikiforovall、GMOの記事は併用に触れていない |
| 精度の比較実測 | CodeQL/Semgrepと同一条件で、同一リポジトリを比較した独立実測は見つからなかった。Trent（ベンダー、利益相反あり、Java、n=28）では、ファイル位置の一致率はClaude Code 8.7%、CodeQL 3.7%、Semgrep 3.6%。CWE種別のみの一致率は順に65%、11.1%、42.9% | 非公式のみ | 公式サイトからは情報を得られなかった。[Trent](https://trent.ai/blog/claude-code-codex-semgrep-codeql-trent-vs-cwe-bench-cve/)（2026-05頃、取得日 2026-10-08）。Claude Codeは汎用エージェントとして使われ、`/security-review`やプラグインの検証ではない。適合率は未報告。確からしさは低〜中 |
| トリアージ層としての利用 | 独立研究者が、約1.1万件のSemgrep検出をClaude Opus 4.6で選別し、約120ドルだったとの報告がある | 非公式のみ | 検索要約のみで本文未確認。確からしさは低 |

### 表6 非公式の構築事例・運用知見（a6）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 全体スキャンの実測（DevelopersIO） | TS/JS 744ファイル・約7.4万行、effort=medium、claude-security v0.11.0。所要79分、エージェント199体。入力約1.37億トークン（うちキャッシュ読込約1.27億）、出力約58万。API換算で約87ドルだが、Teamプランの定額で追加請求は無い。報告は13件（Medium 8 / Low 5） | 非公式のみ | 公式サイトからは実測値を得られなかった。[記事](https://dev.classmethod.jp/articles/claude-security-plugin-full-repository-scan/)（2026-10-07公開、取得日 2026-10-08、確からしさ 中〜高）。攻撃シナリオを含むため共有先に注意（git worktree推奨）。指摘はコードを読んだ判断で、攻撃の実行による検証ではない |
| 全体スキャンの実測（GMO） | 2リポジトリ、約1,670ファイル・約29万行。Max 20xで、Aは約2時間、Bは約3.5時間（Bはセッション上限で中断し再開）。セッション全体で約16.5億トークン、API定価換算で約1,715ドル、実請求は0円。スキャンだけなら約2,430万トークンで全体の約1.5%。報告は72件（HIGH 18 / MEDIUM 54） | 非公式のみ | 公式サイトからは情報を得られなかった。[記事](https://recruit.group.gmo/engineer/jisedai/blog/claude-security-early-vulnerability-automation/)（2026-09-01公開、取得日 2026-10-08、確からしさ 中〜高）。費用の大半はパッチ生成・検証。IDORが最多でSQLiは0件。誤検知は「ほぼなし」だが再現率の評価は無い |
| 検証の取りこぼし（GMO） | effort=mediumでは、検証に回す候補が45件に制限される。A（73件）とB（52件）は未検証のまま残った。修正パッチ9本が検証で却下された（閾値を根拠なく設定、正規利用者を弾く、陰性対照テストなし等） | 非公式のみ | 同上。公式にこの上限の記載は無い |
| 小規模検証（Solvio） | 意図的に仕込んだSQLiとXSSを検出し、意図しない管理画面の認証欠如も指摘した。中規模以上の全体スキャンでプラン上限に届くことがある。対策は範囲を絞る、effortをlowから始める、日常は差分にすること。`/clear`で調査が引き継がれない | 非公式のみ | [Zenn](https://zenn.dev/solvio/articles/6f4739489100a8)（2026-08-13公開、2026-08-24更新、取得日 2026-10-08、確からしさ 中）。トークン数値と誤検知の記述は無い |
| 誤検知抑制の仕組み | `/security-review`は確信度80%以上を要求し、信頼度8未満を除外する。18項目の絶対除外と12項目の前例ルールを持つ。プラグインは、到達性・影響・防御の3観点の検証者が独立に投票し、2/3以上で採用する。副作用として、信頼度7の真の指摘が閾値で消え得る | 非公式のみ | [Zenn h_m](https://zenn.dev/h_m/articles/claude-code-security-review)（2025-12-24）、[nikiforovall](https://nikiforovall.blog/ai/2026/07/28/claude-code-security.html)（2026-07-28）。取得日はいずれも 2026-10-08、確からしさ 中。公式READMEと同内容を解説した記事が多い |
| Action運用のノイズ | 導入後の数週間は、技術的には正しいが自社文脈では問題ない指摘が多い。バイパス理由コメントの蓄積やカスタムフィルタで減る | 非公式のみ | [Deriv](https://derivai.substack.com/p/automated-security-code-reviews-claude-code-github-actions)（2026-03-31公開、取得日 2026-10-08、確からしさ 中）。「PRあたり3〜4件の誤検知が週約1件に減った」という報告は検索要約経由で、一次記事を特定できていない |
| Action設定の落とし穴 | APIキーはClaude APIとClaude Codeの両方で有効化が必要で、欠けるとunauthorizedになるが原因が分かりにくい。大規模PRでは一部ファイルが対象外になり得る。`run-every-commit`は費用増・誤検知増の要因。出力は非決定的なので、ゲートではなく補助にすべき | 非公式のみ | [avinashsangle](https://avinashsangle.com/blog/claude-code-security-review-github-actions)（2026-04-22公開、取得日 2026-10-08、確からしさ 低〜中）。公式はタイムアウトと非決定性のみ記載 |
| 精度が低く出た事例 | 約5万行のJS/Pythonで、Claude Code Securityは検出18件・真の脆弱性15件・精度83.3%。SonarQubeは精度7.7%、ESLint Securityは精度9.0% | 非公式のみ | [note (Kei)](https://note.com/log_noise/n/nbad152667661)（2026-03-04公開、取得日 2026-10-08、確からしさ 低）。タイトルの「7件」に内訳が無く、規模の記述も矛盾する。採用は推奨しない |
| 生のAIスキャンの誤検知（2025年） | 誤検知率が非常に高かった（Path Traversalで最良のCodexが53%、IDORでClaude Codeが78%、SQLiでClaude Codeが95%）。検証パイプライン付きの現行Claude Securityとは別物 | 非公式のみ | [Semgrepブログ](https://semgrep.dev/blog/2025/finding-vulnerabilities-in-modern-web-apps-using-claude-code-and-openai-codex/)（2025年、取得日 2026-10-08、検索要約のみで本文未読、確からしさ 低） |

### 表7 公式に記述が無い論点、または非公式のみの論点（a7）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| プラグイン1スキャンあたりのトークン量・枠消費率 | 公式は「significant number of tokens」と相対コスト表示のみ。実測は表6の2件（約1.37億トークン、約16.5億トークン） | 非公式のみ | 公式サイトからは数値を得られなかった |
| プラン別のスキャン回数上限 | — | 情報なし | 公式のPro/Max/Team別の回数上限を探したが、双方に数値が無かった。非公式はGMO（Max 20x）とDevelopersIO（Team）の2点が散在するのみで、プラン別の比較実測は無い |
| 対応言語の一覧（プラグイン、`/security-review`） | — | 情報なし | 公式はActionが「any language」とのみ記載。非公式にも明示した記事は無い |
| 再現率（見逃し率）・誤検知率の公式数値 | 公式に数値なし。非公式は表2、表5、表6の個別事例のみ | 非公式のみ | 公式サイトからは情報を得られなかった。Claude Securityの見逃しを測った記事は無い |
| `/security-review`（コマンド版）1回あたりのトークン量・枠消費 | — | 情報なし | 公式にも非公式にも実測が無い。非公式にはnikiforovallの「安価」という定性記述と、API前提のavinashsangle概算（Sonnetで0.2〜0.4ドル/PR）のみ |
| Claude Security マネージド版の価格・利用上限 | — | 情報なし | 公式のブログ・製品ページ・docsを探したが記載が無い。非公式にも該当情報は無い |
| プラグインのCI無人実行の公式手順 | — | 情報なし | 公式に手順が無い。非公式ではGMOが、セッション上限のリセット時刻を考慮した開始時刻の決定が必要と述べるのみ |
| サブスクOAuthで claude-code-security-review Action を回した事例 | — | 情報なし | 公式READMEの認証はAPIキーのみ。非公式の実例も無く、Action記事はすべてAPIキー前提 |
| 大規模リポジトリ（数十万行超）の挙動 | — | 情報なし | 公式は領域ごとのスキャンを推奨するのみ。非公式の最大規模はGMOの約29万行（2リポジトリ合計） |
| OAuthトークンの有効期間・ローテーション | setup-tokenのトークンは有効期間1年でリフレッシュトークンが無く、自動ローテーションされない。再生成のリマインダーが推奨される。環境変数のトークンは `~/.claude/.credentials.json` より常に優先される | 非公式のみ | 公式サイトからは情報を得られなかった。[Ken Imoto](https://kenimoto.dev/blog/claude-code-two-layer-auth-setup-token/)（2026-08-05公開、取得日 2026-10-08、確からしさ 中）。`claude login`をしても環境変数のトークン固定は解除されず、UI上のアカウントと実使用アカウントがずれる罠がある |

### 表8 OAuth（サブスク）認証のCI利用の可否と規約（a1, a4, a7）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| claude-code-actionでサブスクOAuthを使えるか | 使える。`CLAUDE_CODE_OAUTH_TOKEN` を設定すると、サブスクを使いAPI課金にならない。ただし組織共有にはAPIキーが推奨される | 公式（非公式と相違） | 非公式の[issue #727](https://github.com/anthropics/claude-code-action/issues/727)（2025-12-08、Claude Code 2.0.56 + Max、状態はOpen）では、当時のOAuthフローのトークンが約1日で失効し、`claude_code_refresh_token`入力が無く、確実に動くのはAPIキーのみ（別課金）とされた。setup-tokenの1年トークン以前の観測の可能性が高いが、記事に説明は無い |
| 規約上の扱い | 公式の規約文言は本調査では確認していない。Autonomee（2026-10-07更新）は、setup-tokenをCI/スクリプト向けの意図された手段と見て、GitHub ActionsでのCI自動化を正規の利用例とみなす。ただしトークンを取り出して自作ツールで使うのは禁止された抽出と同じとし、上限は「ordinary, individual usage」が前提で、業務用途にはAPIキーを推奨する。筆者は法律の専門家ではないと明言している | 非公式のみ | 公式サイトからは規約上の扱いを得られなかった。[Autonomee](https://autonomee.ai/blog/claude-code-terms-of-service-explained/)（確からしさ 低）。検索要約によると、公式文言として「Free/Pro/Maxのoauthトークンは他の製品・ツール・サービス（Agent SDK含む）では許可されない」を引くissueがある（[agentclientprotocol/claude-agent-acp #337](https://github.com/agentclientprotocol/claude-agent-acp/issues/337)、検索要約のみ）。解釈は記事・issueごとに割れており、確定できない。利用前に公式規約の確認が必須 |

## Appendix

### A. 調査の詳細

**A-1. Claude Securityプラグイン**
- 公式は、ローカル実行、利用中のモデルの使用、スキャンごとの利用枠の消費を述べる。出力はMarkdown / JSONL / SARIF 2.1.0（CWE分類）。独立した検証エージェントが確認した所見のみを報告し、パッチは自動適用されない。
- 非公式は、検証の中身を具体的に補う。DevelopersIOは、候補60件から重複除外で37件にし、3観点の検証者が111票を投じ、2票以上の13件を報告したとする。
- 公式と非公式は矛盾しない。公式に無い数値（時間、トークン、費用）は、非公式が補完している。
- DevelopersIOは、claude.aiで追加したプラグインがclaude.ai/codeのクラウドセッションには読み込まれないとも述べる（非公式のみ）。
- 公式は「Claude Codeを開いたままにする必要がある」と書く。非公式のGMOは、この性質から無人実行の開始時刻を考慮すべきとする。

**A-2. マネージド版 Claude Security**
- 公式の2つの出典（ブログ、製品ページ）でモデル名が異なる。ブログはOpus 4.7、製品ページはMythos 5.1。時期差と思われるが未確認。
- 非公式のDevelopersIO（Opus 5.5）は、プラグイン側の事例で、マネージド版ではない。両者を混同しないこと。
- 提供プランは、ブログ時点（2026-04-30）の「Team and Max は coming soon」から、現在どう変わったかが公式のどの記述からも確認できない。docsは「Enterprise plan」と記す。

**A-3. `/security-review` と Action の区別**
- 公式の `/security-review` は、Claude Code内のコマンドで、サブスクで使える。security-review Actionは、別物でAPIキー課金。
- 非公式では、この2つに加えてsecurity-guidanceとCode Reviewが記事内で混同されやすいと指摘されている（論点7）。数値を引用するときは製品の特定が必要。
- 具体例として、noteの記事は（b）プラグインと（c）コマンド/Actionの数字が混ざっている可能性がある。

**A-4. OAuthのCI利用**
- 公式のgithub-actions docsは、OAuthトークンの利用を明記している。一方で、security-review ActionのREADMEはAPIキーのみを示す。したがって、security-reviewを「サブスク枠で、GitHub Actionsから」使うには、claude-code-actionにセキュリティレビューのプロンプトやスキルを渡す形になる。この構成の公式な実証例は、双方に無い。
- 非公式の検索要約（wain.blog、codersloth、Marketplaceの OAuth版 Action）は、`claude_code_oauth_token`にPro/MaxのOAuthトークンを渡せるとする。本文は未読。
- issue #727は2025-12-08の観測で、状態はOpen。setup-token（1年）との関係は未検証。

**A-5. 課金分離の経緯**
- 2026年5月中旬に告知。6月15日に施行される予定が、当日に一時停止された。
- 非公式の二次ブログは、停止後はAgent SDKと `claude -p` の利用が引き続きサブスク上限から引かれると述べる。再開日は未定。
- 7〜10月の続報は確認できていない。公式側の記述は本調査では得られていない。

**A-6. 検索要約のみ、または本文未読の情報**
- 次の項目は検索要約か本文未読で、確からしさが低い。表では備考に明記した。
  - Semgrepブログ、crystal-method、Zenn (rf_p)、start-link、Provectus、The New Stack、digitalapplied、agentclientprotocol issue #337、emelia.io、therundown.ai、Marketplace
  - 約1.1万件のSemgrep検出の選別（約120ドル）、組織固有フィルタの効果

**A-7. 公式側の調査の限界**
- WebFetchは小型モデル要約を経由するため、数値は原文との照合を推奨する。特にTPM/RPM、Code Reviewの平均費用、security-guidanceの上限。
- `/security-review`の依存関係の扱いは、supportとGitHubプロンプトで食い違うが、検索要約経由で要確認。

### B. 出典

#### 公式
- [Scan your codebase for vulnerabilities](https://code.claude.com/docs/en/claude-security) — 取得日 2026-10-08 — プラグインの動作・要件・出力・非決定性・既存ツールとの関係、`/security-review`との比較表、マネージド版のEnterprise記述
- [Catch security issues as Claude writes code](https://code.claude.com/docs/en/security-guidance) — 取得日 2026-10-08 — security-guidanceの3層、上限、課金
- [Code Review](https://code.claude.com/docs/en/code-review) — 取得日 2026-10-08 — 対象プラン、1レビュー15〜25ドル、別課金
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions) — 取得日 2026-10-08 — OAuthトークンとAPIキーの認証、課金
- [Manage costs effectively](https://code.claude.com/docs/en/costs) — 取得日 2026-10-08 — 5時間窓・週次窓、usage credits、TPM/RPM、平均費用、キャッシュ寿命
- [Automated Security Reviews in Claude Code](https://support.claude.com/en/articles/11932705-automated-security-reviews-in-claude-code) — 取得日 2026-10-08 — `/security-review`の検出対象と提供プラン（記事付日 2026-03-16）
- [Claude Security public beta](https://claude.com/blog/claude-security-public-beta) — 取得日 2026-10-08 — マネージド版の提供状況（公式ブログ、2026-04-30）
- [Claude Security 製品ページ](https://claude.com/product/claude-security) — 取得日 2026-10-08 — マネージド版の機能とモデル表記
- [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) — 取得日 2026-10-08 — Actionの認証、既定モデル、タイムアウト、自動除外、安全性

#### 非公式
- [Claude Security プラグインで実案件のリポジトリをまるごとスキャンした結果を実数値から確認してみた](https://dev.classmethod.jp/articles/claude-security-plugin-full-repository-scan/) — DevelopersIO（クラスメソッド） — 公開日 2026-10-07 — 取得日 2026-10-08 — 確からしさ: 中〜高 — 全体スキャンの時間・トークン・費用、検証投票の内訳
- [Claude Securityとsecurity-guidanceで脆弱性対策を自動化](https://recruit.group.gmo/engineer/jisedai/blog/claude-security-early-vulnerability-automation/) — GMOインターネットグループ — 公開日 2026-09-01 — 取得日 2026-10-08 — 確からしさ: 中〜高 — 大規模スキャンの実測、Max 20xの上限到達、検証件数の上限
- [【Claude Code】公式セキュリティプラグイン「Claude Security」に、脆弱性を仕込んだページを診断させてみた](https://zenn.dev/solvio/articles/6f4739489100a8) — Zenn (solvio) — 公開日 2026-08-13（更新 2026-08-24） — 取得日 2026-10-08 — 確からしさ: 中 — 小規模検証、要件、対策
- [Claude Code と Codex のレビュー機能は脆弱性をどれだけ見つけられるかをOWASP Benchmark で検証](https://zenn.dev/yukkie1114/articles/3d927e8c28e085) — Zenn (yukkie1114) — 公開日 2026-06-27（更新 2026-07-07） — 取得日 2026-10-08 — 確からしさ: 中 — OWASP Benchmarkの検出率・誤検知率
- [Claude Code, Codex, Semgrep, CodeQL & Trent vs 28 CWE-Bench CVE Vulnerabilities](https://trent.ai/blog/claude-code-codex-semgrep-codeql-trent-vs-cwe-bench-cve/) — Trent AI（ベンダー、利益相反あり） — 公開日 2026-05頃（日付の明記なし） — 取得日 2026-10-08 — 確からしさ: 低〜中 — CWE-Benchでの各ツールの検出率
- [【実録】Claude Code Securityを試してみた結果、従来ツールが見落とした脆弱性を7件発見｜Kei](https://note.com/log_noise/n/nbad152667661) — note (Kei) — 公開日 2026-03-04 — 取得日 2026-10-08 — 確からしさ: 低 — SonarQube/ESLintとの精度比較（内部矛盾あり）
- [Finding vulnerabilities in modern web apps using Claude Code and OpenAI Codex](https://semgrep.dev/blog/2025/finding-vulnerabilities-in-modern-web-apps-using-claude-code-and-openai-codex/) — Semgrep（ベンダー） — 公開 2025年（日付不明） — 取得日 2026-10-08 — 確からしさ: 低 — 生のAIスキャンの誤検知率（検索要約のみ、本文未読）
- [Claude Codeのレビュー系コマンド完全ガイド（2026年7月更新）](https://crystal-method.com/blog/claude-code-review-commands/) — crystal-method — 公開 2026-07 — 取得日 2026-10-08 — 確からしさ: 低〜中 — SASTとの役割分担の整理（検索要約のみ）
- [Claude Codeレビュー系コマンドの使い分け【2026/7最新】](https://zenn.dev/rf_p/articles/6514b0c69dc4bc) — Zenn (rf_p) — 公開 2026-07 — 取得日 2026-10-08 — 確からしさ: 低〜中 — `/security-review`の使い分け（検索要約のみ）
- [Claude Codeの/security-reviewコマンド](https://start-link.jp/hubspot-ai/ai/claude-code-practice/claude-code-security-review) — start-link — 公開日不明 — 取得日 2026-10-08 — 確からしさ: 低 — 「誤検出率：低め」は根拠数値なし（検索要約のみ）
- [Shift-Left Security Scanning With Claude Code & Semgrep](https://provectus.com/blog/shift-left-security-scanning-with-claude-code-semgrep/) — Provectus — 公開日不明 — 取得日 2026-10-08 — 確からしさ: 低 — Semgrepとの併用（タイトルのみ確認）
- [Claude Code /security-review 解剖：制約設計で作る実用的なAIセキュリティレビュー](https://zenn.dev/h_m/articles/claude-code-security-review) — Zenn (h_m) — 公開日 2025-12-24 — 取得日 2026-10-08 — 確からしさ: 中 — `/security-review`のプロンプト仕様
- [Security Review in Claude Code - Lessons Learned](https://nikiforovall.blog/ai/2026/07/28/claude-code-security.html) — nikiforovall — 公開日 2026-07-28 — 取得日 2026-10-08 — 確からしさ: 中 — 検証者の投票、コマンド版とプラグイン版の使い分け
- [Automated security code reviews with Claude Code and GitHub Actions: How we did it at Deriv](https://derivai.substack.com/p/automated-security-code-reviews-claude-code-github-actions) — Deriv（企業Substack） — 公開日 2026-03-31 — 取得日 2026-10-08 — 確からしさ: 中 — Action運用のノイズと対処
- [Claude Code Security Review GitHub Action: 2026 Setup Guide](https://avinashsangle.com/blog/claude-code-security-review-github-actions) — avinashsangle — 公開日 2026-04-22 — 取得日 2026-10-08 — 確からしさ: 低〜中 — Actionのコスト概算と設定上の落とし穴
- [Claude setup-token: The 2-Layer Auth Trap (2026)](https://kenimoto.dev/blog/claude-code-two-layer-auth-setup-token/) — Ken Imoto — 公開日 2026-08-05 — 取得日 2026-10-08 — 確からしさ: 中 — setup-tokenの有効期間と優先順位の罠
- [Is This Allowed? Claude Code Terms of Service Explained](https://autonomee.ai/blog/claude-code-terms-of-service-explained/) — Autonomee — 初版 2026-02-15 / 更新 2026-10-07 — 取得日 2026-10-08 — 確からしさ: 低 — 規約解釈（法的助言ではない）
- [Support refresh tokens for Claude Max subscribers in GitHub Actions · Issue #727](https://github.com/anthropics/claude-code-action/issues/727) — GitHub issue（投稿者 eversluis） — 公開日 2025-12-08 — 取得日 2026-10-08 — 確からしさ: 中 — OAuthトークンの失効の報告
- [Claude ToS changes · Issue #337 · agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp/issues/337) — GitHub issue — 公開日不明 — 取得日 2026-10-08 — 確からしさ: 低 — OAuth利用範囲の公式文言の引用（検索要約のみ）
- [Anthropic pauses Claude Agent SDK subscription change on day it was due to take effect](https://thenewstack.io/anthropic-pauses-claude-agent-sdk-subscription-change/) — The New Stack — 公開 2026-06頃（日付は要確認） — 取得日 2026-10-08 — 確からしさ: 中 — 課金分離の一時停止（検索要約のみ）
- [Claude Credit Overhaul: The Paused June 15 Change](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026) — digitalapplied — 公開 2026-06頃 — 取得日 2026-10-08 — 確からしさ: 中 — 課金分離の内容（検索要約のみ）
- [Claude Code Action with OAuth - GitHub Marketplace](https://github.com/marketplace/actions/claude-code-action-with-oauth) — GitHub Marketplace — 公開日不明 — 取得日 2026-10-08 — 確からしさ: 低 — OAuth版Actionの存在（本文未読）
- [Claude Code Review: $25 Per Review, Is It Worth It?](https://emelia.io/hub/claude-code-review-test) — emelia.io — 公開日不明 — 取得日 2026-10-08 — 確からしさ: 低 — Code Reviewの費用言及（検索要約のみ）
- [Claude Code Review: Features, Pricing & Alternatives](https://www.therundown.ai/tools/code-review) — The Rundown — 公開日不明 — 取得日 2026-10-08 — 確からしさ: 低 — Code Reviewの費用言及（検索要約のみ）

### C. 突き合わせで判明した相違

| 論点 | 公式 | 非公式 | 採用 |
| --- | --- | --- | --- |
| claude-code-actionでのサブスクOAuth利用 | `CLAUDE_CODE_OAUTH_TOKEN` でサブスクを使えると明記（組織共有にはAPIキー推奨） | [issue #727](https://github.com/anthropics/claude-code-action/issues/727)（2025-12-08）では、トークンが約1日で失効し、確実に動くのはAPIキーのみ。検索要約では、setup-tokenが第三者/CI用途でAPIに拒否されたという2026年初頭の報告もあるとされる（出典記事は特定できず） | 公式。ただし時期差の可能性があり、実運用での動作は未検証 |
| OAuthトークンの第三者・Agent SDK利用 | 本調査では公式の規約文言を確認していない | [issue #337](https://github.com/agentclientprotocol/claude-agent-acp/issues/337)（検索要約）は、公式文言として他の製品・ツール・サービス（Agent SDK含む）では許可されないと引く。一方、Autonomee（2026-10-07更新）はCIでの公式CLI利用を正規とみなす。記事間でも割れている | 確定不可。表8では「非公式のみ」とし、利用前に公式規約を確認すること |
| 検出範囲の細部（`/security-review`の依存関係） | supportは依存関係の脆弱性を検出範囲に含める一方、GitHubリポジトリのプロンプトは古いサードパーティライブラリ起因を除外する（公式内の不一致、検索要約経由で要確認） | Zenn (h_m)は「古いライブラリ」を絶対除外項目に含めると解説し、GitHubプロンプト側の記述と一致 | 公式の2文書が不一致のため、どちらが現行かは確定できない |
| マネージド版のモデル表記 | ブログはOpus 4.7、製品ページはMythos 5.1（公式内の食い違い） | DevelopersIOのプラグイン実測はOpus 5.5（プラグインは利用中のモデルを使うため、直接の矛盾ではない） | 確定できない。時期差と推測されるが未確認 |
| Actionの既定モデル | 現行READMEの既定モデルは `claude-opus-4-1-20250805` | avinashsangle（2026-04-22）も同じ値を記すが、現在は変わっている可能性が高いとする | 公式。ただし取得時点の値で、将来の変更に注意 |
| 上記以外 | プラグインの要件（Pythonバージョン、ProのDynamic workflows）、非決定性、Code Reviewの費用（約15〜25ドル）、既存ツールとの併用方針、ActionのAPIキー認証は、非公式と矛盾しなかった | Solvio、avinashsangle、複数の個人ブログなどが公式の内容を裏付けている | 公式 |
