# 非公式ソース調査結果

取得日はすべて 2026-10-08。公式ドキュメント（docs/code.claude.com、anthropic.com、claude.com、support.claude.com、anthropics org の GitHub 等）は開いていない。
ただし GitHub issue #727（anthropics/claude-code-action）は第三者投稿の issue として参照した。
なお検索ツールの要約文（本文を直接読んでいないもの）は、該当箇所に「検索要約のみ」と明記した。

## 調査した範囲と限界

- 検索した対象: 日本語（Zenn/Qiita/note/DevelopersIO/企業ブログ）と英語（個人ブログ、ベンダーブログ、GitHub issue）。
  論点は /security-review、claude-code-security-review Action、Claude Security プラグイン、サブスク OAuth の CI 利用。
- 本文を取得して読んだ記事: Zenn(yukkie1114)、Trent、GitHub issue #727、Ken Imoto、Autonomee、note(log_noise)、Zenn(h_m)、DevelopersIO、GMO、Zenn(solvio)、Deriv、nikiforovall、avinashsangle。
- 限界:
  - Reddit/HN の個別スレッドは検索にほぼ出ず、一次確認できていない。
  - 「サブスク OAuth で claude-code-security-review Action を回した実例」は見つからなかった。
  - CodeQL/Semgrep と Claude Security を同一リポジトリで実測比較した独立記事も見つからなかった。
  - 2026-06 の Agent SDK 課金分離の「一時停止」以降（7〜10月）の続報は確認できていない。
  - Trent の記事は著者が競合ベンダーで利益相反あり。
  - note(log_noise) 記事は数値の内部矛盾あり（後述）。

## 見つかったこと

### 論点1: Claude Security プラグインの全リポジトリスキャンの実測（時間・トークン・費用・枠）【a6】
- **主張（DevelopersIO）**:
  - 対象は TS/JS 744ファイル・約7.4万行、effort=medium、Claude Code v2.1.280、claude-security v0.11.0、Opus 5.5。
  - 所要79分、エージェント199体。入力約1.37億トークン（うちキャッシュ読込約1.27億）、出力約58万。
  - API 換算で約87ドル。著者は Team プランで定額のため追加請求なし。
  - 候補60件→重複除外37件→3観点の検証者が111票で投票→3票中2票以上の13件を報告（Medium 8 / Low 5）。誤検知として24件が除外された。
  - スキャン中は Claude Code を開いたままにする必要がある。攻撃シナリオを含むので共有先に注意（git worktree 推奨）。
  - claude.ai で追加したプラグインは claude.ai/code のクラウドセッションには読み込まれない。
  - 指摘はコードを読んでの判断で、攻撃の実行による検証ではない。
- **出典**: [Claude Security プラグインで実案件のリポジトリをまるごとスキャンした結果を実数値から確認してみた](https://dev.classmethod.jp/articles/claude-security-plugin-full-repository-scan/) — DevelopersIO（クラスメソッド） — 公開日 2026-10-07 — 取得日 2026-10-08
- **種別**: 企業技術ブログ（実測）
- **確からしさ**: 中〜高（数値が詳細。ただし1件で、著者のプランは明記なし。本文に Team 定額の記述あり）
- **公式と食い違う可能性**: 不明（公式にトークン実測値がないため補完情報になる）。Team/Enterprise は組織設定で Dynamic workflows が無効だとスキャンが始まらない、との記述あり。

- **主張（GMO）**:
  - 2リポジトリ、約1,670ファイル・約29万行（Python FastAPI / TS Next.js / CDK）。
  - Max 20x で実行。リポジトリAは約2時間、Bは約3.5時間。Bはセッション上限に達して中断し、リセット後に再開した。
  - 著者は「この規模は 20x 前提、5x では途中で止まる可能性が高い」と見ている。
  - セッション全体（スキャン＋パッチ生成・検証）で約16.5億トークン（約92.5%がキャッシュ読取）、API 定価換算約1,715ドル。実請求は0円。
  - スキャンだけなら約2,430万トークンで全体の約1.5%。費用の大半はパッチ生成・検証。
  - 候補273件→72件報告（HIGH 18 / MEDIUM 54）。IDOR が最多で SQLi は0件。誤検知と判断したものは「ほぼなし」。
  - effort=medium では検証に回す候補が45件に制限され、A(73件)とB(52件)は未検証のまま残った。
  - 修正パッチ9本が検証で却下された（閾値を根拠なく設定、正規利用者を弾く、陰性対照テストなし等）。
  - 無人実行ではセッション上限のリセット時刻を考慮して開始時刻を決める必要がある。
- **出典**: [Claude Securityとsecurity-guidanceで脆弱性対策を自動化](https://recruit.group.gmo/engineer/jisedai/blog/claude-security-early-vulnerability-automation/) — GMOインターネットグループ — 公開日 2026-09-01 — 取得日 2026-10-08
- **種別**: 企業技術ブログ（実測）
- **確からしさ**: 中〜高（詳細な数値あり。誤検知の判断は著者の主観で、再現率の評価はない）
- **公式と食い違う可能性**: 不明。「サブスク定額内に収まるが大規模は 20x でも上限に当たる」は公式の一般記述より具体的。

- **主張（Solvio）**:
  - 公開は 2026-08-13、更新は 2026-08-24。プラグインは2026年7月公開のベータ（v0.10.0）。要 Claude Code v2.1.154 以降。
  - Pro プランでは `/config` の Dynamic workflows を有効化する必要がある。
  - 多数のエージェントが並行するため消費が大きく、中規模以上の全体スキャンでプラン上限に届くことがある。
  - 対策は範囲を絞る、effort を low から始める、日常は差分スキャンにする。
  - 仕込んだ SQLi と XSS は検出され、意図しない管理画面の認証欠如も指摘された。
  - `/clear` すると調査が引き継がれない。
  - 差分スキャンとパッチ生成には Git が必要。
  - 対応言語は明示されていない。動作には Python 3.9.6 以上が必要。
  - 誤検知についての記述はない。
- **出典**: [【Claude Code】公式セキュリティプラグイン「Claude Security」に、脆弱性を仕込んだページを診断させてみた](https://zenn.dev/solvio/articles/6f4739489100a8) — Zenn (solvio) — 公開日 2026-08-13（更新 2026-08-24） — 取得日 2026-10-08
- **種別**: 個人/企業ブログ（小規模検証）
- **確からしさ**: 中（小規模検証。トークン数値なし）
- **公式と食い違う可能性**: 不明

### 論点2: 検出精度（再現率・誤検知率）の実測・比較【a5, a6】
- **主張（OWASP Benchmark 検証）**:
  - OWASP Benchmark Java 1.2 から110件（脆弱55・安全55、11カテゴリ×10件）を使用。
  - 結果は次のとおり。
    - Codex `/review`（GPT-5.5 high）: Score 0.964、検出率 96.4%、誤検知率 0%。
    - CC `/security-review`（Opus 4.8 high）: Score 0.945、検出率 98.2%、誤検知率 3.6%。
    - CC `/code-review`: Score 0.855、検出率 90.9%、誤検知率 5.5%。
    - CC `/review`: Score 0.418、検出率 43.6%、誤検知率 1.8%。
  - 落とし穴は2点。
    - 110件を一度に渡すと重大なものだけ数件指摘して低深刻度カテゴリを見落とす。そのためカテゴリごと10件に分割した。
    - MD5 か否かなど設定ファイルを渡さないと判定を誤る。そのため周辺コードも渡した。
  - 4方式とも追加 API 課金なしでサブスク内で使えたと述べているが、トークン・枠消費の数値はない。
  - 比較対象に CodeQL/Semgrep は含まれない。
  - OWASP Benchmark は人工的なテストコードで、実プロジェクトの精度とは別。これは記事の主張ではなく注意点として付記する。
- **出典**: [Claude Code と Codex のレビュー機能は脆弱性をどれだけ見つけられるかをOWASP Benchmark で検証](https://zenn.dev/yukkie1114/articles/3d927e8c28e085) — Zenn (yukkie1114) — 公開日 2026-06-27（更新 2026-07-07） — 取得日 2026-10-08
- **種別**: 個人ブログ（実測、n=110）
- **確からしさ**: 中（動く検証だが、人工ベンチマーク・Java のみ・1名・分割投入という条件付き）
- **公式と食い違う可能性**: 不明

- **主張（Trent, CWE-Bench 28件 Java）**:
  - 28件の実 CVE を使い、同じ入力で3回実行した。数値は「Detection Rate（ファイル位置一致）／Category Detection Rate（CWE種別のみ一致）」の順。
    - Trent 25% / 64.3%。
    - Claude Code(Opus 4.7) 8.7% / 65%。
    - CodeQL 3.7% / 11.1%。
    - Semgrep 3.6% / 42.9%。
    - Codex(GPT-5.3) 1.8% / 17.9%。
  - 対象 CWE は XSS・パストラバーサル・コードインジェクション・OS コマンドインジェクションの4種。
  - 適合率（誤検知率）は報告していない。
  - 記事自身が挙げる制約: n が小さい、Java のみ、LLM は実行ごとに結果がぶれる、デフォルト設定のみでカスタムルール未使用。
  - 著者は Trent AI の社員で、最良結果は自社製品。
  - 記事は Claude Code を「リポジトリ全体の監査をさせた汎用エージェント」として使っており、`/security-review` コマンドや Claude Security プラグイン単体の検証ではない。
- **出典**: [Claude Code, Codex, Semgrep, CodeQL & Trent vs 28 CWE-Bench CVE Vulnerabilities](https://trent.ai/blog/claude-code-codex-semgrep-codeql-trent-vs-cwe-bench-cve/) — Trent AI（ベンダー） — 公開日 2026-05（日付の明記なし） — 取得日 2026-10-08
- **種別**: ベンダーブログ（利益相反あり）
- **確からしさ**: 低〜中（小サンプル・利益相反。ただし手法と制約が開示されている）
- **公式と食い違う可能性**: 不明

- **主張（note, log_noise）**: 約5万行の JS/Python 混在プロジェクトで、Claude Code Security は検出18件・真の脆弱性15件・精度83.3%。SonarQube は検出156件・真の脆弱性12件・精度7.7%。ESLint Security は検出89件・真の脆弱性8件・精度9.0%。
  - ただし次の問題がある。タイトルは「7件」だが本文に内訳がない。冒頭は「小さな Web アプリ」、比較は5万行で規模の記述が矛盾する。「Enterprise $500〜 / Team $200〜」という価格記述は他の情報と整合するか未確認。
- **出典**: [【実録】Claude Code Securityを試してみた結果、従来ツールが見落とした脆弱性を7件発見｜Kei](https://note.com/log_noise/n/nbad152667661) — note (Kei) — 公開日 2026-03-04 — 取得日 2026-10-08
- **種別**: 個人ブログ
- **確からしさ**: 低（根拠の透明性が低く、内部矛盾あり）
- **公式と食い違う可能性**: 価格・提供プランの記述は現状と食い違う可能性があるが、未確認。

- **主張（Semgrep 自身のブログ・検索要約のみ、本文未読）**: 生の AI スキャンの誤検知率が非常に高かった（Path Traversal で最良 Codex 53%、IDOR で Claude Code 78%、SQLi で Claude Code 95%）。投稿は約1年前（2025年）とのことで、現行の検証パイプライン付き Claude Security とは別物。
  - 出典 URL: https://semgrep.dev/blog/2025/finding-vulnerabilities-in-modern-web-apps-using-claude-code-and-openai-codex/（ベンダーブログ、2025、取得日 2026-10-08、本文は未読）
  - **確からしさ**: 低（二次要約のみ）

- **まとめ**: Claude 系の精度を CodeQL/Semgrep と同一条件で測った独立の実測は見つからなかった。
  - 手元の根拠は次のとおり。
    - OWASP Benchmark（人工）での高い検出率（n=110）。
    - Trent の小サンプルでは、ファイル位置の特定は弱く、CWE 種別は拾える。
    - GMO/DevelopersIO は「誤検知ほぼなし」と述べるが、再現率（見逃し）は測っていない。
  - 再現率（見逃し）の評価が欠けている点は共通。

### 論点3: 従来型 SAST（CodeQL/Semgrep）との役割差・併用方針【a5】
- **主張**:
  - 一般的な整理は次のとおり。
    - 静的解析はルール/データフローで既知パターンを網羅する。CodeQL はデータフロー（taint）追跡に強い。Semgrep は構造パターンを高速に検出する。
    - `/security-review` は文脈を読み、ビジネスロジック系（認可不備など）を補う。
  - 運用例としては、Semgrep を PR ごとの高速フィードバック、CodeQL を夜間/定期の深い解析にし、Claude 系は認証・決済・外部入力に絡む変更への補完にする、という案が紹介されている。
  - 複数記事で、完全な代替ではなく併用が推奨されている。
  - Zenn(rf_p) は「`/simplify` で整えたあと、セキュリティが絡む変更だけ `/security-review` を追加」という使い方を紹介している（検索要約経由）。
  - 一方、Deriv の記事、nikiforovall の記事、GMO の記事はいずれも SAST との併用に言及していない。
  - 注意: これらはいずれも定性的な整理で、併用の効果（検出の重複率や補完率）を測った記事は見つからなかった。
  - 補足: 検索要約によると、独立研究者が約1.1万件の Semgrep 検出を Claude Opus 4.6 で選別し約120ドルだったとの報告がある（トリアージ層としての利用）。ただし本文未確認。
- **出典**:
  - [Claude Codeのレビュー系コマンド完全ガイド（2026年7月更新）](https://crystal-method.com/blog/claude-code-review-commands/) — crystal-method — 2026-07 — 取得日 2026-10-08（検索要約のみ）
  - [Claude Codeレビュー系コマンドの使い分け【2026/7最新】](https://zenn.dev/rf_p/articles/6514b0c69dc4bc) — Zenn (rf_p) — 2026-07 — 取得日 2026-10-08（検索要約のみ）
  - [Claude Codeの/security-reviewコマンド](https://start-link.jp/hubspot-ai/ai/claude-code-practice/claude-code-security-review) — start-link — 公開日不明 — 取得日 2026-10-08（検索要約のみ、「誤検出率：低め」は根拠の数値なし）
  - [Shift-Left Security Scanning With Claude Code & Semgrep](https://provectus.com/blog/shift-left-security-scanning-with-claude-code-semgrep/) — Provectus — 公開日不明 — 取得日 2026-10-08（タイトルのみ確認）
- **種別**: 個人/企業ブログ
- **確からしさ**: 中（多数が同じ方向だが、独立した実測の裏付けはない）
- **公式と食い違う可能性**: 不明

### 論点4: /security-review と Action の誤検知抑制の仕組みと運用上の学び【a6】
- **主張**:
  - `/security-review` のプロンプトは「80%以上の確信」を要求し、最終的に信頼度8未満（10段階）を除外する。
  - 18項目の絶対除外（DoS、レート制限、テストファイル、古いライブラリ等）と12項目の前例ルール（環境変数は信頼する、React の XSS は対象外等）を持つ。
  - 対象は PR で追加された差分のみ。出力は HIGH/MEDIUM のみ。誤検知率の実測は示されていない（Zenn h_m）。
  - Claude Security プラグインでは、3観点（到達性・影響・防御）の検証者が独立に投票し、2/3 以上で採用される。
    - 検証者は偽陽性を既定とする。設定によっては赤チームの追加検証もある。
    - 副作用として、信頼度7の真の指摘が閾値で消えうる。
    - コストは単発の数倍になる。
    - 著者は「コマンド版は全 PR で回せるほど安価、プラグインは理由があるときだけ」と位置づけている（nikiforovall）。
  - Action 運用では導入後の数週間はノイズ（技術的には正しいが自社文脈では問題ない指摘）が多い。バイパス理由コメントの蓄積やカスタムフィルタで減る（Deriv）。
  - 組織固有フィルタで「PR あたり3〜4件の誤検知が週約1件に減った」という報告もある。ただしこれは検索要約経由で、一次の記事は特定できていない。
- **出典**:
  - [Claude Code /security-review 解剖：制約設計で作る実用的なAIセキュリティレビュー](https://zenn.dev/h_m/articles/claude-code-security-review) — Zenn (h_m) — 公開日 2025-12-24 — 取得日 2026-10-08
  - [Security Review in Claude Code - Lessons Learned](https://nikiforovall.blog/ai/2026/07/28/claude-code-security.html) — nikiforovall — 公開日 2026-07-28 — 取得日 2026-10-08
  - [Automated security code reviews with Claude Code and GitHub Actions: How we did it at Deriv](https://derivai.substack.com/p/automated-security-code-reviews-claude-code-github-actions) — Deriv（企業 Substack） — 公開日 2026-03-31 — 取得日 2026-10-08
- **種別**: 個人/企業ブログ（事例）
- **確からしさ**: 中（プロンプト仕様は複数記事で一致。運用効果の数字は1〜2件）
- **公式と食い違う可能性**: 不明（公式 README と同内容を解説した記事が多い）

### 論点5: claude-code-security-review Action のコストと設定上の落とし穴【a6】
- **主張**（avinashsangle）:
  - 認証は API キー（repo secret）のみ。OAuth への言及なし。キーは Claude API と Claude Code の両方で有効化が必要で、欠けると unauthorized になるがエラーから原因が分かりにくい。
  - 筆者概算のコスト: 500行・10ファイルの PR で Opus 4.1 は約0.90〜1.80ドル/回、Sonnet 4.6 は約0.20〜0.40ドル/回。週30 PR で Sonnet 月約25〜35ドル、Opus 月約120〜160ドル。
  - 既定モデルは `claude-opus-4-1-20250805`（記事時点）。タイムアウト既定は20分。大規模 PR では一部ファイルが対象外になりうる。
  - 出力は非決定的で、ゲートではなく補助にすべき。`run-every-commit` は費用増・誤検知増の要因。
  - プロンプトインジェクション耐性は強化されておらず、外部コントリビューターの PR は承認必須にすべき。
- **出典**: [Claude Code Security Review GitHub Action: 2026 Setup Guide](https://avinashsangle.com/blog/claude-code-security-review-github-actions) — avinashsangle — 公開日 2026-04-22 — 取得日 2026-10-08
- **種別**: 個人ブログ（概算）
- **確からしさ**: 低〜中（筆者概算。既定モデルは現在変わっている可能性が高い）
- **公式と食い違う可能性**: 既定モデルは現行 README と異なる可能性（要確認）。
- **注記**: Deriv(2026-03-31)、nikiforovall(2026-07-28) の Action 設定例も API キー（secret）で渡している。サブスク OAuth で Action を回した例は見つからなかった。

### 論点6: サブスクの OAuth トークンを CI で使えるか（可否・期限・規約）【a6, a7】
- **主張（可否・仕組み）**:
  - `claude setup-token` で発行したトークンを `CLAUDE_CODE_OAUTH_TOKEN` に設定する方式が、CI 向けの手段として複数の個人記事で紹介されている。
    - 有効期間1年、リフレッシュトークンなし。自動ローテーションされないので再生成のリマインダーを推奨（Ken Imoto）。
    - 環境変数 `CLAUDE_CODE_OAUTH_TOKEN` は `~/.claude/.credentials.json` より常に優先される。`claude login` しても環境変数のトークン固定は解除されず、UI 上のアカウントと実使用アカウントがずれる罠がある（Ken Imoto）。
  - claude-code-action の `claude_code_oauth_token` 入力に Pro/Max の OAuth トークンを渡せるとする記事がある（検索要約: wain.blog、codersloth の Medium、GitHub Marketplace の OAuth 版 Action 等。本文未読）。
- **主張（制約・不具合報告）**:
  - GitHub issue #727（2025-12-08、Claude Code 2.0.56 + Max）: 当時の OAuth フローのトークンが約1日で失効する。`claude_code_refresh_token` 入力がない。確実に動くのは API キーだけ（別課金）。状態は Open（取得時点）。
    - ただし setup-token の1年トークンとの関係は未検証。この issue は setup-token 以前の観測である可能性が高いが、記事には書かれていない。
  - 検索要約によれば、setup-token 発行のトークンが第三者/CI 用途で API に拒否されたという2026年初頭の報告が複数あると述べる記事もある（出典記事は特定していない）。
- **主張（規約）**:
  - Autonomee（初版 2026-02-15、最終更新 2026-10-07）は、setup-token を CI/スクリプト向けの意図された手段として扱い、GitHub Actions を含む CI の自動化は公式に載っている正規の利用例とみなしている。
    - トークンを取り出して自作ツールで使うのは禁止された抽出と同じとする。
    - 利用上限は「ordinary, individual usage」を前提としている。
    - 本番・常時稼働・業務用途には API キーを推奨している。
    - 2026年2月の文書では Agent SDK で OAuth 不可とされたが後に表現が変わった。Anthropic 社員は「MAX の使い方は変わらない」と述べたとされる（伝聞）。
    - 筆者は法律の専門家ではないと明言している。
  - 検索要約: 公式文言の引用として「Free/Pro/Max の OAuth トークンは他の製品・ツール・サービス（Agent SDK 含む）では許可されない」を引く GitHub issue（agentclientprotocol/claude-agent-acp #337）がある。
    - 公式の方針解釈は記事・issue ごとに割れている。公式側の記述は本調査では確認していない。
- **主張（枠消費・課金分離）**:
  - 2026年5月中旬に、6月15日から Agent SDK と `claude -p`（GitHub Actions 含む）をサブスク上限から切り離し、別クレジット（Pro $20 / Max5x $100 / Max20x $200）にする計画が告知された。6月15日の施行当日に一時停止となった。
  - 複数の二次ブログによれば、停止後はこれらの利用は引き続きサブスク上限から引かれる。再開日は未定。
  - 7〜10月の続報は確認できていない。
- **出典**:
  - [Claude setup-token: The 2-Layer Auth Trap (2026)](https://kenimoto.dev/blog/claude-code-two-layer-auth-setup-token/) — Ken Imoto — 公開日 2026-08-05 — 取得日 2026-10-08
  - [Is This Allowed? Claude Code Terms of Service Explained](https://autonomee.ai/blog/claude-code-terms-of-service-explained/) — Autonomee — 初版 2026-02-15 / 更新 2026-10-07 — 取得日 2026-10-08
  - [Support refresh tokens for Claude Max subscribers in GitHub Actions · Issue #727](https://github.com/anthropics/claude-code-action/issues/727) — GitHub issue（投稿者 eversluis） — 公開日 2025-12-08 — 取得日 2026-10-08
  - [Anthropic pauses Claude Agent SDK subscription change on day it was due to take effect](https://thenewstack.io/anthropic-pauses-claude-agent-sdk-subscription-change/) — The New Stack — 2026-06 頃（日付は要確認） — 取得日 2026-10-08（検索要約のみ）
  - [Claude Credit Overhaul: The Paused June 15 Change](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026) — digitalapplied — 2026-06 頃 — 取得日 2026-10-08（検索要約のみ）
  - [Claude ToS changes · Issue #337 · agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp/issues/337) — GitHub issue — 公開日不明 — 取得日 2026-10-08（検索要約のみ）
  - [Claude Code Action with OAuth - GitHub Marketplace](https://github.com/marketplace/actions/claude-code-action-with-oauth) — 取得日 2026-10-08（本文未読）
- **種別**: 個人ブログ、GitHub issue、ニュース二次情報
- **確からしさ**: 中（CI で setup-token を使う手順は複数記事で一致）。規約解釈は低（記事間で割れ、法的助言ではない）。課金分離の一時停止は中（複数二次ソースが一致するが一次未確認）。
- **公式と食い違う可能性**:
  - Agent SDK/第三者利用での OAuth 禁止の文言と、CI での公式 CLI 利用が許されるという解釈が、記事間で緊張している。ここは公式文言との突き合わせが必須。
  - issue #727 の「約1日で失効」は setup-token の「1年」と食い違うように見える。時期差の可能性があるが記事にはその説明がない。

### 論点7: 名称の混同と製品の線引き（落とし穴）【a7】
- **主張**:
  - 次の4つが記事内で混同されやすい。
    - (a) 無償の `security-guidance` プラグイン（ファイル編集/コミット時に動く）。
    - (b) `/claude-security` 系の Claude Security プラグイン（ベータ、多エージェント）。
    - (c) `/security-review` コマンド＋ claude-code-security-review Action（API キー課金）。
    - (d) マネージドの Code Review（Team 向け、2026年3月発表。複数ブログで PR あたり約15〜25ドルと言及。Max では使えない、トークン課金という記述あり）。
  - note(log_noise) などは (b) と (c) の数字が混ざる可能性があるため、数値の引用時は製品の特定が必要。
  - Action がサブスク枠か API 課金かについて、記事の設定例はいずれも API キー（claude-api-key / ANTHROPIC_API_KEY / CLAUDE_API_KEY）で、課金はそのキー側。
- **出典**: 上記各記事、および [Claude Code Review: $25 Per Review, Is It Worth It?](https://emelia.io/hub/claude-code-review-test)（公開日不明、検索要約のみ）、[Claude Code Review: Features, Pricing & Alternatives](https://www.therundown.ai/tools/code-review)（検索要約のみ） — 取得日 2026-10-08
- **種別**: 個人/企業ブログ
- **確からしさ**: 中
- **公式と食い違う可能性**: 不明（公式の線引きとの突き合わせが必要）

## 情報が得られなかった論点

- **`/security-review`（コマンド版）1回あたりのトークン量・枠消費の実測**: 見つからなかった。
  - プラグイン版の実測は論点1にある。
  - コマンド版については nikiforovall の「全 PR で回せるほど安価」という定性記述のみ。数値は、API キー前提の avinashsangle の概算（Sonnet で0.2〜0.4ドル/PR）しかない。
- **サブスク OAuth で claude-code-security-review Action を回した事例**: 見つからなかった。
  - Action の記事はすべて API キー前提。
  - OAuth の CI 利用は汎用 claude-code-action の話（論点6）で、security-review 専用の実例ではない。
- **CodeQL/Semgrep と Claude Security を同一リポジトリで比較した独立実測（再現率・誤検知率）**: 見つからなかった。
  - 手元にあるのは Trent（ベンダー、n=28、Java、再現率相当のみ）とOWASP Benchmark（Claude vs Codex のみ）。
- **Claude Security の再現率（見逃し率）の評価**: 見つからなかった。誤検知の少なさを述べる記事はあるが、見逃しは測られていない。
- **対応言語の範囲**: 明示した記事がなかった。
  - 事例の言語は TS/JS、Python、Java（ベンチ）、CDK。
  - Solvio は「対応言語は明示されていない」と記述している。
- **大規模リポジトリ（数十万行超）での挙動**: GMO の約29万行（2リポジトリ合計）が最大。
  - それ以上の規模の報告は見つからなかった。
  - effort=medium で検証対象が45件に頭打ちになり未検証が残る、という挙動の報告のみ。
- **Reddit/HN の運用スレッド**: 検索では個別に確認できなかった。
- **Pro/Max/Team/Enterprise 別の枠消費の違い**: プラン別の比較実測は見つからなかった。
  - GMO（Max 20x、Bで上限到達・5xは厳しいとの見立て）と DevelopersIO（Team、定額）の2点が散在するのみ。
- **規約上の確定的な扱い**: 非公式ソースの見解は割れており、確定できない。公式文言の確認が必要。
