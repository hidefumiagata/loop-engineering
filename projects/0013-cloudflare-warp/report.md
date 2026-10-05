---
title: Cloudflare WARP の設定方法
issue: 13
updated: 2026-10-05
status: reviewed
---

# Cloudflare WARP（Cloudflare One クライアント）の設定方法

## 調査概要

Cloudflare One クライアントでゼロトラスト環境を作るための、管理側（組織作成・登録権限・プロファイル・Split Tunnels・Gateway・Tunnel）と端末側（導入・登録・MDM・ルート証明書）の設定を整理した。基本手順は公式で確認できた。UI パス、`auto_connect` の単位、証明書配布の実手順では非公式との相違や非公式のみの情報がある。Access アプリ作成は双方で情報なし。

## 調査結果

### 1. サーバ側の前提設定（組織・IdP・登録権限）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 組織（チーム名）の作成 | ダッシュボードで Zero Trust を選び、オンボーディングでチーム名（一意の内部識別子）を決める。最後にサブスクリプション選択と支払い情報入力を行う。ユーザーは手動登録時にこのチーム名を入力する。 | 公式 | 非公式（Zenn _pochio_）も「チーム名は接続時に必須で一意」と述べ、公式を裏付けている。 |
| IdP 連携 | Cloudflare 自身の ID プロバイダが既定で有効。ワンタイムPIN やサードパーティ IdP は後から追加できる。IdP 未連携ならワンタイムPIN になる。 | 公式 | 非公式も「既定は One-time PIN、企業利用は Entra ID や Okta を想定」で一致。 |
| ワンタイムPIN の落とし穴 | フリーメールなどで失敗することがあるため、IdP 連携が推奨されるという報告がある。 | 非公式のみ | 公式サイトからは情報を得られなかった。Zenn（_pochio_, 2025-03-29）の記述で、確からしさは中。 |
| IdP 個別手順（Entra ID・Okta・Google の画面項目） | — | 情報なし | 公式は今回の取得範囲に個別手順が無かった。非公式でも取得できなかった。 |
| Device enrollment permissions の設定場所 | Zero Trust > Team & Resources > Devices > Device profiles > Management > Device enrollment > Device enrollment permissions > Manage。Policies タブで Access ポリシーを作る（例: Include / Emails ending in / `@company.com`）。 | 公式（非公式と相違） | 非公式では「`Settings > WARP Client > Device enrollment permissions > Manage`」とされている（[Zenn _pochio_](https://zenn.dev/_pochio_/articles/ed946d8923ae58)、2025-03-29）。旧 UI 名称の可能性がある。 |
| 登録ポリシーの条件 | 姿勢チェックは登録ポリシーでは使えない（登録後のみ）。任意の「Apply instant authentication」で SSO へ直接リダイレクトできる。 | 公式 | 非公式は、メール・グループ・MFA・地域で include/require/exclude を指定できるとし、ルールは Access ポリシーに似ていると述べる。 |
| 登録時に「Next」がグレーアウトする問題 | ウィザードを飛ばして個別設定した、という個人環境の報告が1件ある。再現性は不明。 | 非公式のみ | 公式サイトからは情報を得られなかった。daahama.dmp（2025-09-11）の記事による。 |

### 2. サーバ側のトラフィック制御（プロファイル・Split Tunnels・Gateway・Tunnel）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| デバイスプロファイルの作成 | Zero Trust > Team & Resources > Devices > Device profiles > General profiles > Create new profile（Default を複製）。Default は評価リスト最下位で、評価は上から first match。設定項目は Service Mode / Auto Connect / Switch Locked。 | 公式 | 非公式には優先順位や条件式の実測・手順記事が無かった。 |
| デバイスプロファイルのマッチ条件 | ユーザーメール、IdP グループ、OS、OS バージョン、管理ネットワーク、SAML 属性、サービストークン。演算子は is / in。 | 公式 | |
| Split Tunnels のモード | Exclude（既定）は指定以外を Gateway へ送る。Include は指定した IP/ドメインのみを送り、Zero Trust のドメイン/IP を手動追加する必要がある（デバイス姿勢チェック等のため）。変更は約 10 分で端末に反映。 | 公式 | 非公式も Include モード構成に言及している。 |
| Split Tunnels の既定除外リスト | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`、IPv6 link-local/ULA など。 | 公式 | 非公式も RFC1918 と `100.64.0.0/10` が既定で除外と述べ、一致している。 |
| Split Tunnels の設定場所 | 対象プロファイル > Configure > Split Tunnels > Manage。 | 公式（非公式と相違） | 非公式では「`Settings > WARP Client > Device settings (Default profile) > Split Tunnels`」とされている（[daahama.dmp](https://daahama.hatenablog.com/entry/2025/09/11/050747)、2025-09-11）。旧 UI 名称の可能性がある。 |
| private network を Tunnel に流すときの除外リスト編集 | 該当レンジを除外リストから外す。自宅 LAN の例では `192.168.0.0/16` を削除した。Include モードで private ルートだけを列挙する方法もある。 | 非公式のみ | 公式サイトからは情報を得られなかった（`100.64.0.0/10` 除外の扱いは公式の取得範囲に無い）。複数の独立した記事が一致しており、確からしさは高。 |
| Split Tunnels の落とし穴（IPv6・`198.18.0.0/15`・ルートとの二重管理） | `198.18.0.0/15` は既定除外に含まれないため編集不要。IPv6-only 網では IPv6 アドレス（`fd00::/8` 系）もルートと include の両方に追加が必要。ルートと include は別々に更新が必要で、片方が欠けるとエラー表示なしで接続できない。 | 非公式のみ | 公式サイトからは情報を得られなかった。Jared Lynskey（2026-10-01）の1件のみで、確からしさは低〜中。 |
| Local Domain Fallback とモード切替 | Local Domain Fallback の設定漏れで社内ホスト名が解決できない。ロールアウト途中の Split Tunnel モード切替は全端末に影響する。 | 非公式のみ | 公式サイトからは情報を得られなかった。1件の記事で、確からしさは低。 |
| Gateway ポリシーの種類 | DNS は全 DNS クエリを検査。Network は TCP/UDP/GRE を IP・ポート・プロトコル・SNI で検査（SSH/RDP 等）。HTTP は URL/ヘッダ/ファイルを検査し、HTTPS 復号にはルート証明書が必要。アクションは Allow / Block / Quarantine 等。ユーザーID・デバイス姿勢をセレクタに使える。 | 公式 | 非公式も DNS・Network・HTTP の3種類、HTTP は復号が前提と述べ、一致している。 |
| DNS ポリシーの設定 | Gateway > Traffic Policies > DNS Policies。要素は Action・Selector・Operator で、And/Or 結合、first match。例: Content Categories in Adult Themes → Block、Host is www.example.com → Override 1.2.3.4。 | 公式 | |
| HTTP ポリシーの具体例と評価順 | 例は5種。Security Categories in malware/phishing → Block、Application in → Allow、URL is（完全一致）→ Allow、URL matches regex → Allow、Application in → Do Not Inspect。評価は Do Not Inspect を上から下へ、次に Block/Allow を上から下へ。Allow は対応する Block より上に置く。 | 非公式のみ | 公式サイトからは HTTP ポリシー個別ページを取得できず、具体例を得られなかった。classmethod（2025-04-14）ほか複数記事が整合し、確からしさは中〜高。 |
| TLS 復号の有効化場所 | `Settings > Network > TLS decryption`。 | 非公式のみ | 公式サイトからは情報を得られなかった（HTTP ポリシーと TLS 復号設定の手順が公式の取得範囲に無い）。UI 名称は旧称の可能性がある。 |
| 復号で壊れるアプリと Untrusted certificate action | PayPay・Suica・Instagram などで不具合が出た事例があり、`paypay.ne.jp` 等を Do Not Inspect にした（2022 年）。Untrusted certificate action は Error（既定、526）/ Block / Pass through の3種。Pass through は独自ルート CA（Enterprise）が必要。独自 CA へ切り替える前に端末へ証明書を配布しないと全 TLS 検査で警告が出る。 | 非公式のみ | 公式サイトからは情報を得られなかった。Zenn（hiroe_orz17, 2022-05-21）、Zenn（oymk, 2024-05-27）による。古い記事を含む。 |
| 無料プランの上限 | ユーザー 50 人まで、ログ保持 24 時間（2022〜2023 年時点の記述）。 | 非公式のみ | 公式サイトからは情報を得られなかった。古い数字の可能性が高く、現行値として扱わないこと。 |
| Network ポリシーの具体的な設定値例（ポート・SNI 等） | — | 情報なし | 公式の概要説明以外に具体値の記述が無く、非公式でもポート・プロトコル指定の具体例が見つからなかった。 |
| Cloudflare Tunnel の概要 | cloudflared が社内ホストから outbound-only で接続する。作成はダッシュボードまたは API。WARP 利用者は private hostname と IP/CIDR ルーティングの2方式で内部サービスへ到達できる。 | 公式 | |
| Tunnel 作成時の private network 登録 | Tunnel 作成時に private network の CIDR（例 `192.168.200.0/24`）を登録し、Settings → Network で firewall proxy（ICMP 含む）を有効にする。 | 非公式のみ | 公式サイトからはダッシュボード手順・ルート追加の記述を得られなかった。確からしさは低〜中。 |
| cloudflared 設定の注意（`warp-routing`、`tcp://`、公開リスク） | 古い例の `warp-routing: enabled: true` は新しい版（記事では 2026.8）で拒否され、ブロックが存在すれば有効になる。SSH ingress は `tcp://` を使い、`ssh://` はネイティブクライアントで壊れる。Tunnel のホスト名は DNS レコード作成時点で公開されるため Access での保護が必須。 | 非公式のみ | 公式サイトからは情報を得られなかった。Jared Lynskey（2026-10-01）の1件のみで、確からしさは低。公式の変更履歴との照合が必要。 |
| Access アプリ（self-hosted）の作成手順 | — | 情報なし | 公式の Access アプリ作成ページは未取得で、非公式でも画面項目レベルの記事が見つからなかった。 |

### 3. クライアント側（導入・登録・MDM・証明書）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 対応 OS と動作モード | Windows/macOS/Linux に対応。iOS/Android/ChromeOS は Cloudflare One Agent。MDM の例は Intune, JAMF, JumpCloud。既定は Traffic and DNS モードで、代替は DNS-only。 | 公式 | |
| 端末での登録手順 | GUI: Zero Trust security を選択 > チーム名入力 > 認証。CLI: `warp-cli registration new <team>`、`warp-cli registration show`、`warp-cli connect`。モバイルは URL `cf1app://oneapp.cloudflare.com/team?name=<team>`。 | 公式 | 非公式の登録フロー説明（導入 → チーム名 → IdP → ID クレーム → 証明書紐付け → TUN/DNS 有効化）と矛盾しない。 |
| MDM パラメータ（必須・主要） | 必須は `organization`（string）。`gateway_unique_id` は DNS-only 用 DoH サブドメイン。`auth_client_id` / `auth_client_secret` はサービストークン（無人登録）。`service_mode` は `warp` / `1dot1` / `proxy` / `postureonly` / `tunnelonly`。`switch_locked` は bool（既定 false）、`onboarding` は bool（既定 true）。 | 公式 | 非公式でも `organization`、`service_mode`、`onboarding: false` の使用を確認。`switch_locked`・`service_mode` の値・サービストークンの書式は非公式で確認できなかった。 |
| MDM パラメータ（その他） | `display_name`、`support_url`、`warp_tunnel_protocol`（`masque` / `wireguard`）、`allow_managed_deployments`（既定 true）、`enable_post_quantum`、`hardware_backed_registration`（既定 false）、`override_*_endpoint`。トップレベルは `configs`, `multi_user`, `organization_configs`, `pre_login`。 | 公式 | |
| `auto_connect` の単位 | 整数 0〜1440 の「分」。 | 公式（非公式と相違） | 非公式では、Windows 記事は「分」、macOS 記事（Scalefusion, 2025-11-11）は `auto_connect: 120` を「秒」と書いている（[Scalefusion](https://help.scalefusion.com/docs/configuring-cloudflare-warp-agent-on-macos-devices)）。なお公式のデバイスプロファイル側の例は「600 秒」で、MDM パラメータ側の「分」とは別設定。公式の取得は要約付きで全文未確認のため、設定時は原文確認を推奨。 |
| Windows の MDM 配置 | `C:\ProgramData\Cloudflare\mdm.xml` に配置する。Intune では .msi 導入後にこのファイルをコピーする構成。 | 非公式のみ | 公式サイトからは Intune/Jamf の OS 別書式を得られなかった。配置パスは DTG Lab の検索スニペットのみ（本文未取得）で、確からしさは低〜中。 |
| Intune の Win32 アプリ例 | Install: `msiexec.exe /i "Cloudflare_WARP_2026.4.1350.0.msi" /qn`。コンテキストは System、最低 OS は Windows 10 1607。検出ルールは `%ProgramFiles%\Cloudflare\Cloudflare WARP\` のファイルとバージョン、またはアンインストールのレジストリキー。 | 非公式のみ | 公式サイトからは情報を得られなかった。intunemdms.com（公開日不明）による。確からしさは中。 |
| macOS の MDM 配布（.mobileconfig） | PayloadType は `com.cloudflare.warp`。`organization` にチーム名、`onboarding: false` などを設定し、PayloadUUID は `uuidgen` で生成して差し替える。Jamf では preference domain を `com.cloudflare.warp` にして plist をアップロードする。 | 非公式のみ | 公式サイトからは情報を得られなかった。Scalefusion の例と Jamf の検索スニペット（本文未取得）による。Jamf の plist 完全サンプルは確認できていない。 |
| Hexnode での XML 配布の不具合 | アプリ構成で XML を配るだけでは plist の値が反映されなかった。公式の .mobileconfig をカスタム構成プロファイルとして配ると解決した（反映先は `/Library/Managed Preferences/`）。 | 非公式のみ | 公式サイトからは情報を得られなかった。Hexnode フォーラム（2022-03-23）の古い報告で、確からしさは低。 |
| ルート証明書が必要な機能 | HTTPS 検査・DLP・アンチウイルス・Access for Infrastructure・Browser Isolation で必要。 | 公式 | |
| ルート証明書の取得場所 | Zero Trust > Traffic policies > Traffic settings > Certificates から Download .pem / .crt。既定証明書は 2025-02-02 に期限切れ。 | 公式（非公式と相違） | 非公式では「`Settings → Resources → Cloudflare certificates → Manage`」とされている（[classmethod](https://dev.classmethod.jp/articles/cloudflare-zero-trust-root-certificate-jamf-intune/)、2025-01-06）。旧 UI 名称の可能性がある。 |
| ルート証明書の Jamf（macOS）配布 | PEM を `openssl x509 -inform PEM -in certificate.pem -outform DER -out certificate.cer` で DER に変換し、構成プロファイルの「証明書」ペイロードにアップロード。「Allow all apps access」を有効、「Allow export from keychain」を無効にする。確認は Keychain Access の System → Certificates。 | 非公式のみ | 公式サイトからは OS 別・MDM 配布手順を得られなかった（取得ページに含まれず）。classmethod の1件で、確からしさは中。 |
| ルート証明書の Intune（Windows）配布 | Devices → Configuration → Policies → New。Windows 10+、Template「Trusted certificate」、ストアは「Computer certificate store - Root」。Entra ID グループに割り当てる。確認は `certlm.msc` の Trusted Root Certification Authorities。 | 非公式のみ | 公式サイトからは情報を得られなかった。classmethod の1件で、確からしさは中。 |
| macOS Ventura 以降の証明書自動信頼 | WARP が証明書を自動で信頼できないため、MDM 配布が実質必須。 | 非公式のみ | 公式サイトからは情報を得られなかった。公式の「Install certificate using WARP」の説明との突き合わせが必要。 |
| WARP による証明書の自動インストール | `Settings > WARP Client > Global settings` の `Install CA to system certificate store` を有効にする、という記述が別の記事にある。 | 非公式のみ | 公式サイトからは情報を得られなかった。Zenn（_pochio_, 2025-03-29）による。 |
| Linux・iOS・Android のルート証明書配布 | — | 情報なし | 公式の取得ページに OS 別手順が無く、非公式でも見つからなかった。 |

### 4. 動作確認

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 登録の確認 | `warp-cli registration show` | 公式 | |
| WARP 経由の確認 | `curl --silent https://www.cloudflare.com/cdn-cgi/trace \| grep '^warp=on$'` | 公式 | 非公式も `cdn-cgi/trace` の出力で `warp=on` を確認するとしており、一致している。 |
| 組織への到達性の確認 | `curl --fail --silent --show-error "https://<TEAM>.cloudflareaccess.com/cdn-cgi/access/certs"` | 公式 | |
| 接続状態の確認 | `warp-cli status` で接続状態と組織（Teams）を確認する。 | 非公式のみ | 公式サイトからは `warp-cli status` の出力の読み方を得られなかった。gist・cli.wiki（公開日不明）による。確からしさは低〜中。 |
| 診断コマンド | 公式は warp-diag（索引ページのみ確認）。非公式は `warp-cli trace` / `warp-cli diagnose`（検索抜粋のみ）。 | 公式 | 公式は詳細未確認。非公式の2コマンドは本文未確認で、公式側の記述と一致するかも未確認。 |
| 証明書配布・TLS 検査の確認 | Jamf は Keychain Access、Intune は `certlm.msc` で配布を確認。TLS 検査の確認には badssl.com が使える。ICMP を有効にしておくと変更確認に便利という報告もある。 | 非公式のみ | 公式サイトからは情報を得られなかった。classmethod、Zenn（oymk）、Jared Lynskey による。 |
| ポリシー反映の確認方法（Gateway ログ、`warp-cli settings` 等） | — | 情報なし | 公式は未取得範囲で、非公式でも本格的な記事が見つからなかった。Split Tunnels の反映に約 10 分かかる点（公式）のみ把握。 |

### 5. サーバ側とクライアント側の設定の対応関係

| サーバ側の設定（ダッシュボード） | 対応するクライアント側の設定・挙動 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| チーム名（組織作成） | MDM `organization`（必須）／手動登録でのチーム名入力／`warp-cli registration new <team>` | 公式 | |
| Device enrollment permissions | 登録時の認証画面で評価される（許可されないと登録できない） | 公式 | 非公式も「登録前に評価される」と述べ、一致している。 |
| 認証用サービストークン | MDM `auth_client_id` / `auth_client_secret`（無人登録） | 公式 | |
| デバイスプロファイル（Service Mode / Auto Connect / Switch Locked） | MDM `service_mode` / `auto_connect` / `switch_locked` | 公式 | `auto_connect` の単位は上の相違を参照。 |
| Split Tunnels（Exclude / Include） | 端末のトラフィック経路。変更は約 10 分で反映 | 公式 | |
| Gateway HTTP ポリシー（TLS 復号） | 端末へのルート証明書インストール（MDM 配布など） | 公式 | 公式は「HTTPS 復号にルート証明書が必要」まで。OS 別の配布手順は非公式のみ。 |
| Tunnel の private network ルート | 端末側で該当レンジを Split Tunnels の除外リストから外す（または Include に追加する） | 非公式のみ | 公式サイトからは情報を得られなかった。 |

## Appendix

### A. 調査の詳細

#### 取得の限界
- 公式は developers.cloudflare.com の各ページを 2026-10-04 に要約付きで取得した。全文は未確認。Network/HTTP ポリシー個別ページ、Access アプリ作成、MDM の OS 別手順（Intune/Jamf）、`warp-cli status` の詳細は未取得。
- 非公式は技術ブログ・MDM ベンダーのヘルプ・フォーラムを取得日 2026-10-04 に取得した。WebFetch は要約モデル経由のため、数値や文言は要約に依存する。DTG Lab（HTTP 402）と nanosek（HTTP 403）は本文を取得できなかった。2022〜2023 年の古い記事が混在し、UI 名称は変更されている可能性が高い。
- 公式ドキュメントとそのミラー（justalittlebyte.ovh、ts.cloudflare.community、GitHub の cloudflare-docs）は、非公式調査では除外した。

#### 論点ごとの公式と非公式
- **UI パス（登録権限・Split Tunnels・証明書）**: 公式は Team & Resources > Devices 配下の新しい体系、または Traffic policies > Traffic settings。非公式は `Settings > WARP Client` / `Settings → Resources` 系の旧称。公式を採用した。非公式の記事は 2025 年時点のものが中心で、名称変更の可能性が高い。
- **100.64.0.0/10 の扱い**: 公式は既定除外リストに含まれると記す。除外リストから外す手順や Tunnel との関係は公式の取得範囲に無かった。非公式は既定除外を認めたうえで、private network を Tunnel に流すなら除外リストから外すと述べる。既定値の記述は一致しているので公式を採用し、外す手順は非公式のみとした。
- **`auto_connect`**: 公式の MDM パラメータは整数 0〜1440（分）。デバイスプロファイルの例（600 秒）は別設定。非公式は Windows で「分」、macOS（Scalefusion の例 120）で「秒」。単位の不一致は非公式内でも発生しており、設定前に原文確認が必要。
- **Gateway ポリシー**: 公式は概念と DNS ポリシーの例が中心。HTTP ポリシーの具体例と評価順（Do Not Inspect を先に評価）は非公式のみ。
- **証明書**: 公式は必要性と取得場所まで。Jamf/Intune の具体手順、Ventura 以降の制約は非公式のみ。公式の「Install certificate using WARP」の説明は今回取得していないため、突き合わせ未了。
- **`warp-routing`**: 非公式の1件のみ。公式の変更履歴は未確認。
- **Hexnode の事例**: 2022 年の古い報告。現行バージョンでの再現性は不明。

#### 探したが双方に無かった論点
- Access アプリ（self-hosted）の作成手順と設定値。
- Network ポリシーの具体値（宛先 IP・ポート・プロトコル・SNI の組合せ）。
- Linux・iOS・Android のルート証明書配布。
- ポリシー反映の確認方法（Gateway ログ、`warp-cli settings` 等）。
- IdP 連携の個別手順（Entra ID・Okta・Google）。
- 料金・所要時間の実測（無料枠 50 ユーザーは 2022〜2023 年の非公式記述のみ）。

### B. 出典

#### 公式
- [Zero Trust setup](https://developers.cloudflare.com/cloudflare-one/setup/) — 取得日 2026-10-04 — チーム名・IdP・オンボーディング
- [Device enrollment](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/device-enrollment/) — 取得日 2026-10-04 — 登録権限の設定場所とポリシー
- [Device profiles](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/device-profiles/) — 取得日 2026-10-04 — プロファイル作成・評価順・マッチ条件
- [Split Tunnels](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/route-traffic/split-tunnels/) — 取得日 2026-10-04 — Exclude/Include、既定除外リスト、設定場所
- [Traffic policies](https://developers.cloudflare.com/cloudflare-one/traffic-policies/) — 取得日 2026-10-04 — Gateway ポリシー3種の概要
- [DNS policies](https://developers.cloudflare.com/cloudflare-one/traffic-policies/dns-policies/) — 取得日 2026-10-04 — DNS ポリシーの設定と例
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) — 取得日 2026-10-04 — Tunnel の概要
- [private-net/cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/) — 取得日 2026-10-04 — private hostname と IP/CIDR ルーティング
- [Client overview](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/) — 取得日 2026-10-04 — 対応 OS・モード
- [Manual deployment](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/manual-deployment/) — 取得日 2026-10-04 — 登録手順、動作確認コマンド
- [MDM parameters](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/mdm-deployment/parameters/) — 取得日 2026-10-04 — MDM パラメータ一覧
- [User-side certificates](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/user-side-certificates/) — 取得日 2026-10-04 — ルート証明書の必要機能・取得場所
- [Troubleshooting](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/troubleshooting/) — 取得日 2026-10-04 — 診断（warp-diag、索引のみ）

#### 非公式
- [Cloudflare One (Zero Trust, Gateway/Access/WARP) の概要と設定メモ](https://zenn.dev/_pochio_/articles/ed946d8923ae58) — Zenn（_pochio_） — 公開日 2025-03-29（更新 2025-03-31） — 取得日 2026-10-04 — 確からしさ: 中 — チーム名・OTP・登録権限の旧 UI パス、証明書自動インストール
- [WARP client and the device enrollment flow](https://cloudsecop.net/en/blog/warp-client-device-enrollment/) — Things Worth Sharing — 公開日 2025-04-07 — 取得日 2026-10-04 — 確からしさ: 中 — 登録フロー6段階、登録前のポリシー評価
- [Cloudflare Zero Trust Network Access を設定して自宅環境にアクセスする](https://daahama.hatenablog.com/entry/2025/09/11/050747) — daahama.dmp — 公開日 2025-09-11 — 取得日 2026-10-04 — 確からしさ: 中 — Next ボタン問題、192.168.0.0/16 の除外削除、旧 UI パス
- [A Private Network for One: Cloudflare WARP, Tunnels and the Machines I Build On](https://jared.lynskey.co.nz/en/posts/2026/2026-10-01-cloudflare-warp-dev-network/) — Jared Lynskey — 公開日 2026-10-01 — 取得日 2026-10-04 — 確からしさ: 低（IPv6・198.18/15・cloudflared 設定は1件のみ） — Split Tunnels の落とし穴、`warp-routing`、`tcp://`、Tunnel 公開リスク
- [Cloudflare Zero Trustでのコンテンツフィルタリング](https://dev.classmethod.jp/articles/cloudflare-zero-trust-contents-filtering/) — classmethod — 公開日 2025-04-14 — 取得日 2026-10-04 — 確からしさ: 中〜高 — HTTP ポリシー例・評価順
- [「Cloudflare Zero Trust」で組織のゼロトラストネットワークを構成する](https://zenn.dev/hiroe_orz17/articles/67f63b9c7a9da5) — Zenn — 公開日 2022-05-21（更新 2023-11-27） — 取得日 2026-10-04 — 確からしさ: 低（古い） — 復号で壊れるアプリ、無料枠
- [Cloudflare Gateway TLS Inspection and Untrusted Server Certificates](https://zenn.dev/oymk/articles/ac5a3ded351243?locale=en) — Zenn（oymk） — 公開日 2024-05-27 — 取得日 2026-10-04 — 確からしさ: 中 — Untrusted certificate action、TLS 検査の確認
- [Cloudflare Zero Trustのルート証明書をMDM(Jamf , Intune)で配布する](https://dev.classmethod.jp/articles/cloudflare-zero-trust-root-certificate-jamf-intune/) — classmethod — 公開日 2025-01-06 — 取得日 2026-10-04 — 確からしさ: 中 — Jamf/Intune の証明書配布手順、Ventura の制約
- [Deploy Cloudflare One Client with Intune](https://intunemdms.com/deploy-cloudflare-one-client-with-intune/) — intunemdms.com — 公開日不明 — 取得日 2026-10-04 — 確からしさ: 中 — Intune Win32 アプリ例
- [Managed WARP Deployments — DTG Lab](https://blog.dtg-lab.net/posts/warp-managed-configurations) — DTG Lab — 公開日不明 — 取得日 2026-10-04 — 確からしさ: 低（本文未取得、検索スニペットのみ） — mdm.xml の配置パス
- [Configuring Cloudflare WARP Agent on macOS devices](https://help.scalefusion.com/docs/configuring-cloudflare-warp-agent-on-macos-devices) — Scalefusion — 公開日 2025-11-11 — 取得日 2026-10-04 — 確からしさ: 中 — macOS の .mobileconfig 例、`auto_connect` の単位
- [Warp configuration not working](https://www.hexnode.com/forums/topic/warp-configuration-not-working/) — Hexnode フォーラム — 公開日 2022-03-23 — 取得日 2026-10-04 — 確からしさ: 低（古い） — XML 配布の不具合
- [Cloudflare WARP warp-cli quick install and usage (gist)](https://gist.github.com/arafays/619c2fd24db34592b1626c51544d719f) — GitHub gist — 公開日不明 — 取得日 2026-10-04 — 確からしさ: 低 — `warp-cli status` 等
- [Cloudflare WARP Client Guide](https://cli.wiki/Cloudflare-WARP-Client-Guide) — cli.wiki — 公開日不明 — 取得日 2026-10-04 — 確からしさ: 低 — `warp-cli` の使い方

### C. 突き合わせで判明した相違

| 論点 | 公式（採用） | 非公式の記述 | 備考 |
| --- | --- | --- | --- |
| Device enrollment permissions の場所 | Team & Resources > Devices > Device profiles > Management > Device enrollment | `Settings > WARP Client > Device enrollment permissions > Manage`（Zenn _pochio_） | 旧 UI 名称の可能性が高い |
| Split Tunnels の場所 | 対象プロファイル > Configure > Split Tunnels > Manage | `Settings > WARP Client > Device settings (Default profile) > Split Tunnels`（daahama.dmp） | 同上 |
| ルート証明書の取得場所 | Zero Trust > Traffic policies > Traffic settings > Certificates | `Settings → Resources → Cloudflare certificates → Manage`（classmethod） | 同上 |
| `auto_connect` の単位 | 整数 0〜1440（分） | Windows 記事は分、macOS の Scalefusion 記事は 120 を秒と記述 | 公式のデバイスプロファイル例は「600 秒」で別設定。原文での再確認を推奨 |

公式に記述が無く非公式のみで得た論点（相違ではないが裏付けが弱い。上の表の「非公式のみ」を参照）は、`warp-routing.enabled` の廃止、macOS Ventura 以降の証明書自動信頼不可、Hexnode での XML 配布の不具合、HTTP ポリシー例・TLS 復号の設定場所、Jamf/Intune の具体手順、無料枠 50 ユーザー。これらは公式の変更履歴・該当ページとの照合が未了。

公式に記述が無く非公式にも無かった論点（情報なし）は、Access アプリ作成手順、Network ポリシーの具体値、Linux/iOS/Android の証明書配布、ポリシー反映の確認方法、IdP 個別手順。探した範囲は Appendix A に記載した。
