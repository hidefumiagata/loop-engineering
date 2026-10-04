# 公式情報の調査結果

## 調査した範囲と限界
- 見た公式サイト: Jamf 公式ドキュメント (learn.jamf.com)、Apple Platform Deployment (support.apple.com/guide/deployment)、NIST mSCP (github.com/usnistgov/macos_security)、個人情報保護委員会 (ppc.go.jp)。
- 取得は WebFetch の要約経由。多くのページで目次部分しか取得できず、**キー単位の詳細を確認できたのはパスコード・制限の2ページのみ**。それ以外は「該当ページが存在する」までしか確認できていない。
- 取得日はすべて 2026-10-04。
- FISC 安全対策基準: fisc.or.jp は 403 で取得不可。有償刊行物のため本文は確認できていない。

## 見つかったこと

### Jamf Pro のバージョン
- **記述**: 公式ドキュメント（current）の版は Jamf Pro 11.32.0。リリース日は取得できなかった（リリースノートURLは404）。
- **出典**: [Computer Configuration Profiles](http://learn.jamf.com/r/en-US/jamf-pro-documentation-current/Computer_Configuration_Profiles) — 取得日 2026-10-04
- **種別**: ドキュメント

### 構成プロファイルで設定できる項目（Jamf Pro）
- **記述**: 目次上、Wi-Fi、ログインウインドウのメッセージ、壁紙、パスワード準拠、ディレクトリバインド、FileVault 暗号化、リモート管理の設定項目が存在する。ペイロード全一覧は取得できなかった。
- **出典**: 同上 — 取得日 2026-10-04
- **種別**: ドキュメント

### パスコード（com.apple.mobiledevice.passwordpolicy）
- **記述**: minLength（最小文字数）、maxPINAgeInDays（1〜730日、または none）、pinHistory（1〜50、または none）、maxInactivity（無操作で自動ロックする分数）、maxGracePeriod（再入力なしで解除できる猶予。即時〜8時間）、maxFailedAttempts（超過でアカウント無効化。既定6）、minComplexChars（記号の必要数）、requireAlphanumeric（英字と数字を必須）、allowSimple（連続・反復文字の許可）。macOS 固有に「失敗後の遅延（分）」「次回認証でパスワード変更を強制」。
- **出典**: [Passcode payload settings](https://support.apple.com/guide/deployment/passcode-payload-settings-dep4d6a472a/web) — 取得日 2026-10-04
- **種別**: ドキュメント

### 制限（Restrictions for Mac）
- **記述**: 外部ストレージ関連は「デスクトップに表示」（OS X 10.7、非監視でも可）のみ。**USB 等の外部メディアを禁止／読み取り専用にする専用キーは、取得できた範囲では記載を確認できなかった**。AirDrop 禁止（macOS 10.13）、スクリーンショット・画面収録禁止（10.14.4）、iCloud 書類とデータ（OS X 10.11）、Bluetooth 設定変更の禁止（macOS 14）、カメラ（OS X 10.11）。いずれも監視（supervision）不要。macOS 15 系で Apple Intelligence 関連（書き込みツール、外部インテリジェンス連携、Mail/Notes/Safari 要約など）の制限が追加されている。
- **出典**: [Restrictions for Mac](https://support.apple.com/guide/deployment/restrictions-for-mac-depba790e53/web) — 取得日 2026-10-04
- **種別**: ドキュメント

### ソフトウェアアップデートの強制
- **記述**: 宣言型デバイス管理（DDM）による強制が現行の方式。延期（deferral）90日設定の例が示されている。自動更新の前提: バッテリー50%（Apple Silicon・Intel とも）、電源接続、十分な空き容量、Apple サーバーへの無制限接続（HTTPS 傍受は無効にする）。
- **出典**: [Managing software updates](https://support.apple.com/guide/deployment/managing-software-updates-depc4c80847a/web) — 取得日 2026-10-04
- **種別**: ドキュメント

### インベントリ
- **記述**: Jamf Pro が収集する区分は一般、ハードウェア、OS、ユーザ/ロケーション、セキュリティ（ファイアウォール・暗号化・コンプライアンス状態）、購入、アプリ、プロファイルと証明書、ストレージ/ディスク暗号化、ローカルユーザ。拡張属性（Extension Attributes）で独自項目を収集できる。
- **出典**: [Computer Inventory Collection Settings](https://learn.jamf.com/r/en-US/jamf-pro-documentation-current/Computer_Inventory_Collection_Settings) — 取得日 2026-10-04
- **種別**: ドキュメント

### コンプライアンス基準
- **記述**: NIST mSCP は NIST 800-53、800-171、CIS Benchmark Level 1/2、CIS Controls v8、CNSSI 1253、DISA STIG 等のベースラインを提供し、macOS 27.0 に対応するバッジが付いている。Jamf の Allen Golbig が共著者。
- **出典**: [usnistgov/macos_security](https://github.com/usnistgov/macos_security) — 取得日 2026-10-04
- **種別**: 仕様書（公式リポジトリ）

### 個人情報保護法ガイドライン（通則編）
- **記述**: 別添「講ずべき安全管理措置の内容」に、基本方針、規律の整備、組織的・人的・物理的・技術的安全管理措置、外的環境の把握の各節がある。**項番号と本文の詳細は取得結果が不整合で確認できなかった**（組織的を 10-3 とする回答と、技術的を 10-6 とする回答が食い違った）。
- **出典**: [個人情報の保護に関する法律についてのガイドライン（通則編）](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/) — 取得日 2026-10-04
- **種別**: ガイドライン

## 公式に記述が無かった（確認できなかった）論点
- FileVault（個人用復旧キーのエスクロー等）、ファイアウォール、Gatekeeper、Platform SSO、リモートロック/ワイプの**設定キー・推奨値**: ページの存在は確認したが本文を取得できなかった。
- USB/外部メディアの制限方法（Jamf Pro の制限ペイロード側の項目、システム拡張・Endpoint Security 経由を含む）。
- システム拡張 / 内蔵MDM承認（PPPC・Notification Settings 含む）の詳細。
- Jamf Pro 11.32.0 のリリース日、Jamf Protect の機能。
- FISC 安全対策基準の項目番号。J-SOX（金融商品取引法の内部統制報告制度）の ITGC 対応。
- DLP、EDR、ログ保管の公式推奨。
