---
title: Jamf Pro 推奨設定（日本の上場企業・金融系 Mac）
issue: 7
updated: 2026-10-04
status: reviewed
---

# Jamf Pro 推奨設定（日本の上場企業・金融系 Mac）

## 調査概要

Jamf Pro（公式ドキュメント current は 11.32.0）の Mac 管理項目と、金融・上場企業向けの推奨値を調べた。公式から詳細を確認できたのはパスコードと制限の2ページのみ。FISC項番・J-SOX対応・金融向け推奨値は双方に無く、未確認が多い。網羅的な推奨値表は作れていない。

## 調査結果

### 1. 前提バージョン（a6）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| Jamf Pro のバージョン | 公式ドキュメント（current）は Jamf Pro 11.32.0。リリース日は不明（リリースノートURLが404） | 公式 | |
| macOS のバージョン | 単一の前提は確定できない。公式では NIST mSCP が macOS 27.0 のバッジ付き、Apple の制限ページは macOS 15 系の Apple Intelligence 制限を記載。非公式の Platform SSO 記事は macOS 26 が対象 | 公式 | 非公式（Platform SSO）は macOS 26 + Entra ID 前提。Jamf Pro 11.32.0 と各 macOS の対応関係は情報なし |

### 2. 管理項目のカテゴリ別一覧と管理方式（a1）

| カテゴリ | 項目 | 管理方式 | 出典区分 | 備考 |
| --- | --- | --- | --- | --- |
| セキュリティ | パスコード（パスワード）ポリシー | 構成プロファイル（com.apple.mobiledevice.passwordpolicy） | 公式 | |
| セキュリティ | 制限（AirDrop、スクリーンショット・画面収録、iCloud書類、Bluetooth設定変更、カメラ等） | 構成プロファイル（Restrictions）。いずれも監視（supervision）不要 | 公式 | 外部メディア制限の項目は公式では確認できず（下記3参照） |
| セキュリティ | FileVault 暗号化 | 構成プロファイル（項目の存在は目次で確認） | 公式 | 設定キーは公式本文を取得できず。復旧キーの再エスクローは Escrow Buddy（policy 配布 + `defaults write`）の事例あり（非公式のみ、下記3参照） |
| セキュリティ | 構成プロファイルの設定項目（Wi-Fi、ログインウインドウのメッセージ、壁紙、パスワード準拠、ディレクトリバインド、リモート管理） | 構成プロファイル | 公式 | 目次上の存在確認のみ。ペイロード全一覧は取得できず |
| セキュリティ | ファイアウォール、Gatekeeper | 管理方式は確認できず | 情報なし | 公式はページの存在のみ確認、本文未取得。非公式は値のみ（下記3参照）で管理方式の記述なし |
| 更新管理 | macOS ソフトウェアアップデート強制 | 宣言型デバイス管理（DDM）。Jamf Pro では Blueprints | 公式 | Blueprints は非公式記事（Rich Trouton 等）による |
| インベントリ | 収集区分: 一般、ハードウェア、OS、ユーザ/ロケーション、セキュリティ（ファイアウォール・暗号化・コンプライアンス状態）、購入、アプリ、プロファイルと証明書、ストレージ/ディスク暗号化、ローカルユーザ。拡張属性（Extension Attributes）で独自項目を収集可 | インベントリ収集設定 | 公式 | |
| コンプライアンス | NIST mSCP ベースライン（NIST 800-53、800-171、CIS Level 1/2、CIS Controls v8、CNSSI 1253、DISA STIG 等） | ベースライン適用（構成プロファイル等の具体的な方式は未確認） | 公式 | Jamf の compliance benchmarks は monitor only と enforce を選べるとの検索要約あり（非公式。本文未取得） |
| アカウント | Platform SSO | 構成プロファイル（`com.apple.PlatformSSO.AccountShortName` 等） | 非公式のみ | 公式サイトからは情報を得られなかった |
| 権限・拡張 | システム拡張、PPPC（Full Disk Access 等） | 構成プロファイル | 非公式のみ | 公式サイトからは情報を得られなかった（EDR 配備の事例のみ） |
| アプリ配布 | パッケージ配信、Self Service | policy（Escrow Buddy の配布が policy で行われる事例のみ） | 非公式のみ | 公式サイトからは情報を得られなかった。カテゴリとしての網羅的な一覧は作成できていない |
| ネットワーク | Wi-Fi 等 | 構成プロファイル | 公式 | 目次上の存在確認のみ |

### 3. 主要セキュリティ項目の推奨値（a2）

| 項目 | 結論（推奨値・設定可能な値） | 出典区分 | 備考 |
| --- | --- | --- | --- |
| パスワードポリシー | 設定可能なキー: minLength、maxPINAgeInDays（1〜730日または none）、pinHistory（1〜50または none）、maxFailedAttempts（既定6）、minComplexChars、requireAlphanumeric、allowSimple、maxGracePeriod（即時〜8時間）。macOS 固有で失敗後の遅延（分）と次回認証でのパスワード変更強制。**金融向けの推奨値は双方に無い** | 公式 | 公式は仕様値のみで推奨値なし。非公式にも金融向けの具体値は無い |
| 画面ロック | 公式は maxInactivity（無操作で自動ロックする分数）の存在のみ。推奨値は公式に無し。非公式の一般的な初期値はスクリーンセーバー 15 分で起動しパスワード要求 | 非公式のみ | 公式サイトから推奨値を得られなかった。出典は note 記事1件（確からしさ低、根拠基準なし）。金融の標準より緩い可能性があるが基準は未確認 |
| FileVault | 非公式の推奨は「必須」。既に有効で復旧キー未エスクローの端末は、エスクロー用構成プロファイル配布 → 「暗号化済みだが有効なキー無し」のスマートグループ作成 → Escrow Buddy を policy で配布 → `defaults write /Library/Preferences/com.netflix.Escrow-Buddy.plist GenerateNewKey -bool true`。新キー生成は次回ログイン時、Jamf 送信はその後の SecurityInfo コマンド時（macOS 10.14.4 以降） | 非公式のみ | 公式サイトからは設定キー・推奨値を得られなかった。出典はクラウドネイティブ社ブログ1件（確からしさ中、公開日不明）と note 記事（低） |
| ファイアウォール | 有効化（非公式の一般記事）。ステルスモード・ブロックオール等の具体値は情報なし | 非公式のみ | 公式サイトからは情報を得られなかった。第三者の実測記事も無し |
| Gatekeeper | 「App Store と確認済みの開発元のみ」（非公式の一般記事） | 非公式のみ | 公式サイトからは情報を得られなかった。確からしさ低 |
| USB/外部メディア制限 | Restrictions のメディア項目で外部メディアを読み取り専用またはマウント禁止にできる。実体は `com.apple.applicationaccess` の `allowExternalMediaDataStorage=false`。HID（キーボード等）は止まらない。反映に再起動またはログアウト/ログインが必要な場合あり | 非公式のみ | 公式（Restrictions for Mac）では、取得できた範囲に外部メディア禁止／読み取り専用の専用キーの記載を確認できず（「デスクトップに表示」のみ確認）。非公式3件（Jamf Community 2018、NetNXT 2025、note 2024）は概ね一致するが、NetNXT は他社 MDM 向けのベンダー記事 |
| MDM/システム拡張承認 | EDR 導入前にシステム拡張と Full Disk Access の PPPC を配布する。例: CrowdStrike Falcon はバンドル ID `com.crowdstrike.falcon.Agent`、Team ID `X9E956P446`。先に入れると機能縮退モードや「システム拡張がブロックされた」表示になる | 非公式のみ | 公式サイトからは情報を得られなかった。出典は検索要約のみ（本文未精査）。ID はセンサーのバージョンで変わり得る |
| macOS 更新制御 | DDM による強制が現行方式。延期（deferral）90日の設定例あり。自動更新の前提: バッテリー50%、電源接続、十分な空き容量、Apple サーバーへの無制限接続（HTTPS 傍受は無効に）。Blueprint の設定値は「Latest OS version」、リリース後の日数、適用時刻、対象グループ | 公式（非公式と相違） | 非公式（Rich Trouton 2025-11-06）では「繰延（deferral）の細かい設定が無く、段階導入が難しい」とされる（[出典](https://derflounder.wordpress.com/2025/11/06/deploying-software-update-declarations-for-automatic-os-upgrades-using-blueprints-in-jamf-pro/)）。公式例は Apple 仕様、非公式は Jamf Blueprints の画面仕様で、同一対象かは未確認。Blueprint の値は非公式由来 |
| SSO / Platform SSO | 非公式: macOS 26 でセットアップアシスタント中に MDM 登録前の PSSO 登録が可能（Entra ID のみ記事対象）。Microsoft Company Portal 5.2404.0 以降が必要。無人ワークフローで SAML・MFA・条件付きアクセス・アカウントマッピングを検証してから attended へ。Simplified Setup のトークンに `onPremisesSamAccountName` は入らない | 非公式のみ | 公式サイトからは情報を得られなかった。出典は Jon Brown（2026-07-30）と Jamf Community（2026-06-04）で確からしさ中。フォーラムは未解決寄り |

### 4. 規制・基準との対応（a3）

| 対象の推奨値 | 規制・基準 | 紐付けの粒度 | 出典区分 | 備考 |
| --- | --- | --- | --- | --- |
| 全般（CIS/NIST mSCP） | NIST 800-53、800-171、CIS Benchmark Level 1/2、CIS Controls v8、CNSSI 1253、DISA STIG | ベースライン名レベル。個々の rule 番号と各推奨値の対応は未確認 | 公式 | 非公式で CIS L2 の 5.2.6（パスワードポリシーのカスタム正規表現）が plist アップロードで効かず GUI にも項目が無いとの報告（[Jamf Community](https://community.jamf.com/general-discussions-2/help-mapping-jamf-protect-cis18-failures-to-jamf-pro-configuration-profiles-49390)、検索要約のみ） |
| 全般（FISC 安全対策基準） | FISC 安全対策基準 | 未確認（項番は全て未確認） | 情報なし | fisc.or.jp は 403 で取得不可、有償刊行物。非公式も Mac/Jamf と結びつく記述なし（第13版を2025年3月公表とする一般記事のみ） |
| 全般（個人情報保護法） | 個人情報保護法ガイドライン（通則編）別添「講ずべき安全管理措置の内容」 | 章レベル（組織的・人的・物理的・技術的安全管理措置、外的環境の把握）。項番は未確認（取得結果が不整合） | 公式 | 非公式は個人情報保護法と Mac 設定の対応を十分に調べておらず記述なし。各推奨値と章の個別対応も未確認 |
| ログ保管 | J-SOX（ITGC） | 未確認（統制目標との対応も未確認） | 非公式のみ | 公式（金融庁の実施基準等）は確認できず。一般記事に「J-SOX では財務業務の証跡の保存期間は原則 7 年」、別記事に「重要ログは最低 3〜5 年」。法令根拠は示されておらず確からしさ低 |
| パスワード、画面ロック、FileVault、USB、更新制御、SSO 各推奨値 | FISC・J-SOX・個人情報保護法の各項番 | 未確認 | 情報なし | 各推奨値と規制の個別紐付けを示す資料が双方に無かった |

### 5. 業務影響が大きい設定の運用・競合（a5）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 更新強制の段階導入 | 非公式の記述: 期限は OS リリース日から計算され、配備が期限後なら端末は即座に期限超過通知を受ける。期限後に初チェックインした端末はその日の指定時刻に強制される。繰延の細かい設定が無く段階導入が難しい。Nudge 併用時は期限と DDM 強制日を一致させる。オンプレミス版 Jamf Pro では期限スケジュール不可（Jamf Cloud のみ）。Apple の GDMF から消えた版を指定すると更新不可。特定バージョン指定で DDM コマンドが不正になるバグ報告があり「最新マイナー版」等の指定が推奨される | 非公式のみ | 公式サイトからは Blueprints の運用上の注意を得られなかった。本文確認は Rich Trouton の1件のみで他は検索要約。段階導入を Smart Group 分割の複数 Blueprint で行う案は非公式調査者の推測で、記事の記述ではない |
| USB 制限の例外運用 | 特定 USB だけ許可するホワイトリスト運用は MDM 標準機能では見当たらない。別事例では Microsoft Defender for Endpoint の Device Control で USB 制御。Apple Silicon ではアクセサリ許可ダイアログで「許可」してもマウントされない。Time Machine バックアップに影響し得る | 非公式のみ | 公式サイトからは情報を得られなかった。例外運用の実例は未確認 |
| 設定の競合 | Restrictions、Accessibility、Login Window 等は全項目を設定するモノリシックなペイロードで、compliance benchmark と同一ドメインを重複設定すると競合し、適用順は指定できず最後に適用されたものが有効になる。対策は制限設定の作り直し、カスタムペイロードや Blueprints への移行 | 非公式のみ | 公式サイトからは情報を得られなかった。出典は Graham R Pugh（2026-01-28）の1件で確からしさ中 |
| ベンチマーク導入の段階導入 | monitor only で影響を確認してから enforce へ。Self Service policy で元に戻しやすいルールから試す。ルール単位の例外を持たせる JSON スキーマのスクリプトがある。登録直後のチェックは FileVault 有効化の再起動前に走り誤って非準拠判定になるため、FileVault だけ別扱いで回避（Honestpuck HOWTO、更新日不明） | 非公式のみ | 公式サイトからは情報を得られなかった。monitor/enforce は検索要約のみ |
| EDR 配備の順序依存 | プロファイルを scope の前提条件にし、導入後にインストール済み・拡張承認済み・FDA 付与済みの3点を検証する | 非公式のみ | 公式サイトからは情報を得られなかった |
| 初期セットアップの失敗要因 | チェックイン失敗（ファイアウォールのポート遮断または MDM プロファイル未導入）、FileVault キーのエスクロー失敗、ABM 自動登録の失敗 | 非公式のみ | 公式サイトからは情報を得られなかった。確からしさ低（note 1件） |

### 6. 金融特有の追加要件（a7）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| EDR | 推奨製品・設定の公式推奨は無し。非公式に CrowdStrike Falcon の PPPC・システム拡張の配備手順（上記3参照） | 非公式のみ | 公式サイトからは情報を得られなかった。本文未精査 |
| DLP 連携 | — | 情報なし | 公式・非公式とも DLP の記述を取得できなかった |
| 証跡・ログ保管 | Jamf のログや Unified Log の外部転送の実践例は無し。保管期間は J-SOX で原則 7 年とする一般記事と、重要ログ最低 3〜5 年とする記事があるが法令根拠未確認（上記4参照） | 非公式のみ | 公式サイトからは情報を得られなかった。確からしさ低。本文未取得 |
| 紛失時のロック/ワイプ | ロックとワイプを両方送ると、ユーザーがロック解除した時点で保留中のワイプが走り Jamf から未管理になる。再登録まで制御不能。「無効」表示になった場合、Intel は Apple に連絡、Apple Silicon は DFU 復元で解除（2023-11-01 の投稿）。Jamf Pro 10.20.0 以降の監督下 Mac は Activation Lock バイパスコードが自動生成されインベントリに保存。macOS 11.4 以前の Apple Silicon ではリモートロックの 6 桁パスコードが設定されない | 非公式のみ | 公式サイトからは情報を得られなかった。投稿は古く macOS 26 での挙動は未確認。バイパスコードと 11.4 以前の件は検索要約のみ |
| 日本の金融機関での Jamf 運用事例 | — | 情報なし | 日英の検索で日本の金融・上場企業の事例を取得できなかった |

## Appendix

### A. 調査の詳細

**調査の限界**
- 公式側は WebFetch の要約経由で、キー単位の詳細を確認できたのはパスコード（Apple Platform Deployment）と制限（Restrictions for Mac）の2ページのみ。他は「ページが存在する」ことまでの確認。
- 非公式側は日英約10クエリ、本文取得15件前後。docs.jamf.com / jamf.com ブログ / support.jamf.com / trusted.jamf.com / learn.microsoft.com / Apple は検索結果に出ても開いていない。community.jamf.com は Jamf 運営のフォーラムだがユーザー投稿を非公式として扱った。
- 情シスフォース（FileVault 復旧キー再発行）と Magic Hat Tech Blog（Platform SSO）は本文取得不可のため引用していない。
- 本レポートは受入基準 a2・a3 の推奨値表を完成できていない。公式は仕様値、非公式は一般的な初期値止まりで、金融向けの根拠付き推奨値は双方に無かった。

**論点別**
- パスコード: 公式のみ。非公式に対応記述なし。
- USB: 公式は Restrictions for Mac で外部ストレージ関連が「デスクトップに表示」（OS X 10.7、非監視でも可）のみ確認でき、禁止／読み取り専用キーは取得範囲で未確認。非公式は `allowExternalMediaDataStorage=false`（`IOUSBMassStorageClass` 対象）を挙げ、古い「メディア制限」は macOS 10.15 以降で非推奨とする。公式に「無い」と断定できる材料ではなく、取得範囲に無かったにとどまる。
- 更新: 公式は DDM が現行方式、deferral 90日の例、自動更新の前提条件。非公式は Blueprints の実際の挙動と制約。
- Restrictions のその他: AirDrop 禁止（macOS 10.13）、スクリーンショット・画面収録禁止（10.14.4）、iCloud 書類とデータ（OS X 10.11）、Bluetooth 設定変更の禁止（macOS 14）、カメラ（OS X 10.11）。macOS 15 系で Apple Intelligence 関連の制限が追加。
- 個人情報保護法: 組織的を 10-3 とする回答と技術的を 10-6 とする回答が食い違い、項番は確定できない。レポートには項番を記載していない。
- 公式に記述が無かった論点: FileVault（個人用復旧キーのエスクロー等）、ファイアウォール、Gatekeeper、Platform SSO、リモートロック/ワイプの設定キー・推奨値、システム拡張/内蔵MDM承認、Jamf Protect の機能、J-SOX の ITGC 対応、DLP・EDR・ログ保管の公式推奨。
- 非公式の「公式と食い違う可能性」の指摘は、いずれも調査者が「不明」または推測としたもの。公式と非公式の直接の矛盾として確認できたものではない。

### B. 出典

公式・非公式の出典一覧（取得日はすべて 2026-10-04）は [sources.md](sources.md) を参照。

### C. 突き合わせで判明した相違

| 論点 | 公式 | 非公式 | 扱い |
| --- | --- | --- | --- |
| macOS 更新の繰延 | 延期（deferral）90日設定の例が示されている | Blueprints には繰延の細かい設定が無く段階導入が難しい（Rich Trouton 2025-11-06） | 公式を採用し相違として備考に記載。両者の対象（Apple 仕様と Jamf Blueprints 画面）が同一かは未確認 |
| USB/外部メディア制限 | 取得範囲の Restrictions ページに専用キーの記載を確認できず（無いと断定はできない） | Restrictions のメディア項目と `allowExternalMediaDataStorage=false` で制限可能 | 公式に確認できた記述が無いため、非公式のみとして扱い、その旨を備考に記載 |

上記以外に、公式と非公式が直接矛盾した論点は確認されていない。
