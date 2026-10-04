# 非公式ソース調査結果

取得日はすべて 2026-10-04。公式ドキュメント（docs.jamf.com / jamf.com ブログ / support.jamf.com / trusted.jamf.com / learn.microsoft.com / Apple）は検索結果に出ても開いていない。
なお community.jamf.com は Jamf 運営のフォーラムだが、ユーザー投稿を非公式知見として扱った。

## 調査した範囲と限界
- 検索は日英で約10クエリ。取得できた本文は15件前後。
- **見つからなかった、または不十分だったもの**: 日本の金融機関での Jamf 導入事例、FISC 安全対策基準の項番と Mac 設定の対応表、J-SOX と Mac 設定の対応、DLP 連携の実践例、Jamf Pro 上での FileVault 個人用復旧キーの設定値の詳細（Escrow Buddy の記事のみ）、ファイアウォールと Gatekeeper の推奨値の実測記事。
- FISC・J-SOX は一般解説記事しかなく、Mac/Jamf に結びつく記述は無かった。**FISC 項番は全て「未確認」**とすること。
- 情シスフォース（FileVault 復旧キー再発行）と Magic Hat Tech Blog（Platform SSO）の記事は本文を取得できず（本文空・ログイン要求）、タイトルのみ確認。内容は引用していない。
- 記事の多くは 2025〜2026 年で比較的新しい。USB 制限の Jamf フォーラム投稿は 2018 年で古い。

## 見つかったこと

### 1. FileVault: 既に有効な端末の個人用復旧キー再エスクロー（Escrow Buddy）
- **主張**: 後から MDM 登録した端末は FileVault が既に有効で、復旧キーが未エスクローになりやすい。Netflix 製の Escrow Buddy（認証プラグイン）で、ユーザー操作なしに新規キーを生成してエスクローできる。手順は次のとおり。
  1. FileVault エスクロー用構成プロファイルを配布する。
  2. 「暗号化済みだが有効なキーが無い」端末のスマートグループを作る。
  3. Escrow Buddy を policy で配布する。
  4. `defaults write /Library/Preferences/com.netflix.Escrow-Buddy.plist GenerateNewKey -bool true` を実行する。
  - 新キー生成は次回ログイン時、Jamf への送信はその後の SecurityInfo コマンド時で、別イベント。反映に時間がかかる。macOS 10.14.4 以降が対象。
- **出典**: [Escrow Buddyを使ってFileVaultのリカバリーキーを再発行してみる](https://blog.cloudnative.co.jp/18046/) — クラウドネイティブ社ブログ — 公開日不明 — 取得日 2026-10-04
- **確からしさ**: 中（1件。コマンドは具体的だが、日付が不明で現行の Escrow Buddy バージョンとの整合は未確認）
- **公式と食い違う可能性**: 不明。公式の「復旧キー再発行」機能と別経路で補う運用の位置づけ。

### 2. FileVault・Gatekeeper・スクリーンセーバー・ファイアウォールの基本値（日本の情シス向け記事）
- **主張**: 初期セットアップ用のセキュリティプロファイルとして、FileVault 必須、Gatekeeper は「App Store と確認済みの開発元のみ」、スクリーンセーバーは 15 分で起動しパスワード要求、ファイアウォール有効を推奨している。ハマりどころとして次の 3 つを挙げる。
  - チェックイン失敗（ファイアウォールのポート遮断、または MDM プロファイル未導入）。
  - FileVault キーのエスクロー失敗（有効化時の通信失敗）。
  - ABM 自動登録の失敗。
- **出典**: [Jamf Pro 初期設定の進め方（きりんの情シスさん）](https://note.com/yoyoyoyo_anpan/n/n67e4cafcd5b4) — note — 2026-06-12 — 取得日 2026-10-04
- **確からしさ**: 低（1件。根拠となる基準や実測は示されていない。金融向けの値ではなく一般的な初期値）
- **公式と食い違う可能性**: 不明。画面ロック 15 分は金融の標準より緩い可能性がある。ただし根拠となる基準は確認できていない。

### 3. USB/外部メディア制限の実現方法
- **主張**:
  - Jamf Pro の制限（Restrictions）プロファイルのメディア項目で、外部メディアを読み取り専用にするか、マウントを禁止できる。
  - 実体は `com.apple.applicationaccess` の `allowExternalMediaDataStorage=false`（`IOUSBMassStorageClass` が対象）。キーボード、マウス、Web カメラなどの HID は止まらない。
  - Apple Silicon では、ユーザーがアクセサリ許可ダイアログで「許可」を押してもマウントされない。
  - Time Machine バックアップに影響し得る。
  - 反映に再起動かログアウト/ログインが必要な場合がある。
  - 古い「メディア制限」は macOS 10.15 以降で非推奨とされる。
  - ログ機能は確実な情報が無い。
  - 別の事例では、USB 制御を Jamf ではなく Microsoft Defender for Endpoint の Device Control で実施していた。
- **出典**:
  - [Blocking the use of Removable Media on Macs with Jamf Pro](https://community.jamf.com/general-discussions-2/blocking-the-use-of-removable-media-on-macs-with-jamf-pro-3448) — Jamf Community — 2018-01-29 — 取得日 2026-10-04
  - [How to Block USB Storage on macOS Sequoia & Sonoma via MDM](https://netnxt.com/knowledge-base/block-usb-external-storage-macos-mdm) — NetNXT（ベンダー記事） — 2025-12-16 — 取得日 2026-10-04
  - [Jamf Proの設定についてわかっていることの棚卸し](https://note.com/tnkt_/n/n8c601aca5a03) — note（tnkt） — 2024-02-25 — 取得日 2026-10-04
- **確からしさ**: 中（3件が概ね一致。ただし NetNXT は他社 MDM 向けのベンダー記事）
- **公式と食い違う可能性**: 「特定の USB だけ許可する」ホワイトリスト運用は MDM 標準機能では見当たらない。Defender Device Control のような EDR 側の機能で補う運用が示唆される（記事の記述、一般化は推測）。

### 4. Platform SSO（macOS 26 / Entra ID）
- **主張**:
  - Jamf Pro で macOS 26 のセットアップアシスタント中に Platform SSO 登録を MDM 登録の前に行えるようになった。ただし記事は Entra ID のみが対象。
  - Microsoft Company Portal 5.2404.0 以降が登録前に必要。古い版が入っていると失敗する。
  - まず無人（unattended）ワークフローで SAML、MFA、条件付きアクセス、アカウントマッピングを検証してから attended に進むよう勧めている。
  - セットアップアシスタントから Microsoft、Jamf、パッケージ配信元の全エンドポイントに到達できることを、実際の従業員ネットワークで確認する必要がある。
  - Simplified Setup では、PSSO 認証のトークンに含まれるのは name、preferred_username、oid、sub、tid のみ。`onPremisesSamAccountName` はトークンに入らず、Microsoft サポートによれば仕様。
  - 回避策は 3 つ。(1) `com.apple.PlatformSSO.AccountShortName` で UPN の接頭辞をローカルアカウント名にする（フォーラムでの推奨）。(2) SSO 登録でユーザー情報を取得し、ローカル名は UPN ベースで受け入れる。(3) Entra のエンタープライズアプリで SAML クレームを加工する（1名が成功を報告）。
- **出典**:
  - [Jamf Moves Platform SSO Into the Enrollment Gate](https://jonbrown.org/blog/jamf-attended-platform-sso-enrollment/) — Jon Brown — 2026-07-30 — 取得日 2026-10-04
  - [Platform SSO Simplified Setup (macOS 26 + Entra ID): onPremisesSamAccountName ...](https://community.jamf.com/general-discussions-2/platform-sso-simplified-setup-macos-26-entra-id-onpremisessamaccountname-not-available-in-token-anyone-found-a-workaround-58413) — Jamf Community — 2026-06-04（議論は 2026-08 まで継続） — 取得日 2026-10-04
- **確からしさ**: 中（2件、いずれも 2026 年で新しい。ただしフォーラムは未解決寄りで、Company Portal の版番号は記事ごとに揺れ得る）
- **公式と食い違う可能性**: 不明。AD 由来のユーザー名を持つ環境ではアカウント名の命名規則が変わる。金融では既存のアカウント命名規則との整合を要確認。
- 補足: Magic Hat Tech Blog に「Simplified Setup for PSSO with Jamf Pro and Entra ID」の記事があることは確認したが、本文は取得できなかった。

### 5. システム拡張・PPPC 承認（EDR 配備）
- **主張**:
  - CrowdStrike Falcon では、PPPC にバンドル ID `com.crowdstrike.falcon.Agent`、システム拡張に Team ID `X9E956P446`、コンテンツフィルタの設定が必要。
  - EDR エージェントのインストールより前に、システム拡張と Full Disk Access の PPPC を配布しておく。さもないと機能縮退モードで入る。
  - Jamf では、プロファイルを scope の前提条件にし、導入後にインストール済み、拡張承認済み、FDA 付与済みの 3 点を検証する。
  - MDM で完全に管理される前にソフトを入れると、「システム拡張がブロックされた」と表示される。
- **出典**: [macOS Endpoint Security EDR 2026](https://www.decryptiondigest.com/blog/macos-endpoint-security-edr-threat-detection-guide)、[How to Manually Create a Jamf Pro Configuration Profile for all CrowdStrike macOS Sensor Versions](https://support.redcanary.com/hc/en-us/articles/4535994057879-How-to-Manually-Create-a-Jamf-Pro-Configuration-Profile-for-all-CrowdStrike-macOS-Sensor-Versions)、[Jamf Community: Falcon sensor v6.11+ Big Sur/M1](https://community.jamf.com/t5/jamf-pro/crowdstrike-falcon-sensor-v6-11-big-sur-and-m1-deployment-help/m-p/223726) — いずれも公開日は検索結果から確認できず（本文未取得） — 取得日 2026-10-04
- **確からしさ**: 中（検索結果の要約のみ。本文は精査していない）
- **公式と食い違う可能性**: 不明。Team ID やバンドル ID はセンサーのバージョンで変わり得るため、ベンダー最新資料の確認が必要。

### 6. macOS 更新の強制（DDM / Blueprints）
- **主張**:
  - Blueprint の設定値は「Latest OS version」、リリース後の日数（例は 1 日）、ローカル時刻の適用時刻（例は 18:00）、対象グループ。
  - 期限は OS のリリース日から計算される。配備が期限後なら、端末は即座に期限超過の通知を受けて更新を試みる。
  - 繰延（deferral）の細かい設定が無く、段階導入が難しい。ヘルプダイアログの連絡先情報は OS 側の固定文面で編集できない。
  - 端末が期限後に初めてチェックインした場合は、その接触日の指定時刻に強制される。
  - Apple の GDMF から消えた版を指定すると、宣言が有効でも更新できない。
  - 特定バージョン指定で DDM コマンドが不正になるバグの報告があり、「デバイス適合の最新版」や「最新マイナー版」の指定が推奨されている。
  - オンプレミス版 Jamf Pro では期限のスケジュールができず、Jamf Cloud のみ。
  - Nudge を併用する場合は、Nudge の期限と DDM の強制日を一致させる。
- **出典**:
  - [Deploying software update declarations ... using Blueprints in Jamf Pro](https://derflounder.wordpress.com/2025/11/06/deploying-software-update-declarations-for-automatic-os-upgrades-using-blueprints-in-jamf-pro/) — Rich Trouton — 2025-11-06 — 取得日 2026-10-04（本文取得済み）
  - 検索結果要約: [macjediwizard.blog](https://macjediwizard.blog/software-updates-in-jamf-pro-blueprints-a-technical-deep-dive/)、[Jamf Community: Forcing updates ...](https://community.jamf.com/general-discussions-2/forcing-updates-using-the-new-software-update-feature-31916)、[Jon Brown: Nudge with DDM](https://jonbrown.org/blog/using-nudge-with-ddm-macos-updates-jamf/) — 公開日は未確認（本文未取得） — 取得日 2026-10-04
- **確からしさ**: 中（複数の独立した記事が同方向。ただし本文を確認できたのは 1 件で、他は検索要約）
- **公式と食い違う可能性**: 金融向けの検証期間（リリース後 N 日待つ）は「リリースから N 日」の設計で表現でき、段階導入は Smart Group を分けた複数 Blueprint で行うことになる。この運用は私の推測で、記事の記述ではない。

### 7. 設定の競合と CIS/mSCP ベースライン
- **主張**:
  - Jamf Pro の Restrictions、Accessibility、Login Window などは「一つ設定するには全項目を設定する」モノリシックなペイロードで、compliance benchmark と同じドメインを重複して設定すると競合する。適用順は指定できず、最後に適用されたものが有効になる。
  - 対策は、benchmark 導入を機に制限設定を作り直すか、カスタムペイロードや Blueprints に移行すること。
  - CIS L2 の 5.2.6（パスワードポリシーのカスタム正規表現）は、plist アップロードでは効かず、GUI にも項目が無いという報告がある。
  - Honestpuck の HOWTO によれば、登録直後のチェックは FileVault 有効化の再起動前に走り、誤って非準拠と判定される。FileVault だけ別扱いにして回避している。
  - ルール単位で例外を持たせる JSON スキーマのスクリプトがある。Self Service policy で、元に戻しやすいルールから試すことを勧めている。
  - Jamf の compliance benchmarks は監視のみ（monitor only）と強制（enforce）を選べ、まず監視で影響を見る流れ（検索要約。公式寄りの記述）。
- **出典**:
  - [Dissect And Replace Your Monolithic Legacy Configuration Profiles](https://grahamrpugh.com/2026/01/28/monolithic-profile-dissector.html) — Graham R Pugh — 2026-01-28 — 取得日 2026-10-04
  - [Honestpuck/NIST-macos-security-HOWTO](https://github.com/Honestpuck/NIST-macos-security-HOWTO) — GitHub（個人） — 更新日不明 — 取得日 2026-10-04
  - [help mapping jamf protect cis18 failures ...](https://community.jamf.com/general-discussions-2/help-mapping-jamf-protect-cis18-failures-to-jamf-pro-configuration-profiles-49390) — Jamf Community — 公開日不明（検索要約のみ） — 取得日 2026-10-04
- **確からしさ**: 中（競合の仕様は 1 件の著名管理者の記事。HOWTO は動く手順だが日付不明）
- **公式と食い違う可能性**: 公式は benchmark を「数分で導入」と謳うが、既存プロファイルとの重複で挙動が不定になる点は公式の宣伝からは読み取れない。

### 8. リモートロック/ワイプの運用上の注意
- **主張**:
  - ロックとワイプを両方送ると、ユーザーがロック解除した時点で保留中のワイプが走り、端末が Jamf から未管理になる。再登録まで Jamf は制御できない。「無効（disabled）」表示になった場合、Intel は Apple に連絡、Apple Silicon は DFU 復元で解除する（2023-11-01 の投稿）。
  - Jamf Pro 10.20.0 以降の監督下 Mac では、Activation Lock バイパスコードが自動生成され、インベントリに保存される（検索結果要約）。
  - macOS 11.4 以前の Apple Silicon では、リモートロックの 6 桁パスコードが設定されない（検索結果要約）。
- **出典**: [Mac is disabled after remote wipe](https://community.jamf.com/t5/jamf-pro/mac-is-disabled-after-remote-wipe/td-p/303331) — Jamf Community — 2023-11-01 — 取得日 2026-10-04。検索要約: [Using an Activation Lock bypass code from Jamf Pro](https://derflounder.wordpress.com/2020/06/19/using-an-activation-lock-bypass-code-from-jamf-pro-to-clear-activation-lock-on-a-mac/)（2020-06-19）
- **確からしさ**: 中（日付はやや古く、最新の macOS 26 での挙動は未確認）
- **公式と食い違う可能性**: 不明。紛失時の手順書では「ロックのみ → 発見できなければワイプ」と手順を分け、同時送信しないことが示唆される（私の推測）。

### 9. J-SOX・ログ保管期間（一般解説のみ）
- **主張**: 検索結果の一般記事に「J-SOX では財務業務の証跡の保存期間は原則 7 年」という記述があった。別の記事は一般企業の推奨を「重要ログは最低 3〜5 年」としている。
- **出典**: [J-SOX IT全般統制（ITGC）の実装ガイド](https://www.btncon.com/blog/j-sox-itgc-implementation)、[アクセスログや監査証跡の保存期間はどれくらいが適切なのか？](https://www.keepersecurity.com/blog/ja/2025/05/05/how-long-should-access-logs-and-audit-trails-be-retained/) — いずれも検索結果の要約のみで本文未取得、公開日は後者が 2025-05-05、前者は不明 — 取得日 2026-10-04
- **確からしさ**: 低（本文未確認。「J-SOX 自体が 7 年と定めている」という記述は法令根拠が示されておらず、会社法・法人税法等の保存義務との混同の可能性がある。これは私の推測で、記事の主張ではない）
- **公式と食い違う可能性**: あり得る。法令上の根拠は一次情報（金融庁の実施基準等）で確認すべきで、本調査では未確認。

## 情報が得られなかった論点
- **FISC 安全対策基準の項番と Mac 設定の対応**: 一般解説（第13版が 2025 年 3 月公表とする記事など）しか無く、Mac/MDM/Jamf と結びつく記述は無かった。項番は全て「未確認」。
- **J-SOX（ITGC）と Mac 設定の対応**: 一般的な ITGC の解説のみ。端末設定の具体的な対応は見つからなかった。
- **個人情報保護法と Mac 設定の対応**: 検索していない、または見つからなかった（この論点は十分に調べていない）。
- **FileVault の復旧キーの Jamf 側設定値**: 個人用復旧キー、組織用復旧キー、エスクロー先の推奨値を示す第三者記事は、Escrow Buddy 以外に取得できなかった。
- **ファイアウォールの推奨値（ステルスモード、ブロックオール等）**: 第三者の実測記事は取得できなかった。
- **パスワードポリシー・画面ロックの金融向け具体値**: 一般記事の「15 分」以外に無し。
- **DLP 連携の実践例**: 取得できず。
- **ログ保管（Jamf のログ・Unified Log の外部転送）の実践例**: 取得できず。
- **日本の金融・上場企業での Jamf 運用事例**: 取得できず。
- **USB の例外運用（特定デバイスの許可）の実例**: Jamf 標準機能での記述は無し。
