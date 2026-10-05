# 非公式ソース調査結果

取得日はすべて 2026-10-04。

## 調査した範囲と限界
- 検索: 日本語・英語の技術ブログ（Zenn、classmethod、はてな、個人ブログ、MDMベンダーのヘルプ）。公式ドキュメントと、そのミラー（justalittlebyte.ovh、ts.cloudflare.community、GitHub の cloudflare-docs）は開かずに除外した。
- WebFetch は要約モデル経由のため、数値や文言は要約に依存している。原文での再確認を推奨する。
- 取得に失敗したページ: DTG Lab（HTTP 402）、nanosek（HTTP 403）。検索スニペットのみで、本文は未確認。
- 弱い領域:
  - Intune/Jamf の mdm.xml・plist の「全パラメータ名と値」を網羅した非公式記事は見つからなかった。
  - Network ポリシー（ポート・プロトコル指定）の具体例は乏しい。
  - Access アプリ作成の詳細記事は取得できなかった。
- 古い記事（2022〜2023）が混ざる。UI の名称は変更されている可能性が高い。

## 見つかったこと

### 1. チーム名・IdP・Device enrollment permissions（a1）
- **主張**:
  - チーム名は WARP クライアント接続時に必須で、一意でなければならない。
  - 既定の認証は One-time PIN。企業利用では Entra ID や Okta などの IdP 連携を想定する。
  - 登録権限は `Settings > WARP Client > Device enrollment permissions > Manage` でポリシーを作る。例はメールドメインで制限する方法。
  - 落とし穴: One-time PIN はフリーメールなどで失敗することがあり、IdP 連携が推奨されている。
  - 別記事は、登録フローを次の6段階で説明している: クライアント導入 → チーム名登録 → IdP へリダイレクト → ID クレーム受領 → デバイス証明書とユーザーの紐付け → TUN と DNS の有効化。
  - 登録前に Device enrollment permissions が評価される。ルールは Access ポリシーに似ており、メール・グループ・MFA・地域で include/require/exclude を指定できる。
  - 登録時に「Next」ボタンがグレーアウトして進めず、ウィザードを飛ばして個別に設定した、という報告もある（2025-09 の個人記事）。
- **出典**:
  - [Cloudflare One (Zero Trust, Gateway/Access/WARP) の概要と設定メモ](https://zenn.dev/_pochio_/articles/ed946d8923ae58) — Zenn（_pochio_） — 公開 2025-03-29（更新 2025-03-31）
  - [WARP client and the device enrollment flow](https://cloudsecop.net/en/blog/warp-client-device-enrollment/) — Things Worth Sharing — 公開 2025-04-07
  - [Cloudflare Zero Trust Network Access を設定して自宅環境にアクセスする](https://daahama.hatenablog.com/entry/2025/09/11/050747) — daahama.dmp — 公開 2025-09-11
- **確からしさ**: 中（複数記事が整合。ただし UI パスは 2025 年時点）
- **公式と食い違う可能性**: 不明。Next ボタン問題は個人環境の報告で、再現性は不明。

### 2. Split Tunnels と private network（100.64.0.0/10 の扱い）（a2）
- **主張**:
  - 既定の Exclude モードでは RFC1918 と 100.64.0.0/10 が除外リストに入っている。private network 宛てのトラフィックを Tunnel に流すには、該当レンジを除外リストから外す必要がある。
  - 自宅 LAN の例では `192.168.0.0/16` を除外リストから削除した。
  - 実際の手順としては、`Settings > WARP Client > Device settings (Default profile) > Split Tunnels` で行う。
  - 2026-10 の記事は次を報告している:
    - Include モードで private ルートだけを列挙する構成。
    - RFC 2544 の `198.18.0.0/15` は既定の除外リストに含まれないため、除外リストの編集が不要になる。
    - IPv6 only のネットワークでは IPv4 リテラル宛てが届かず、IPv6 アドレス（`fd00::/8` 系）もルートと include の両方に追加が必要。
    - ルートと include リストは別々に更新が必要で、片方が欠けるとエラー表示なしで接続できない。
  - 別記事は、Split Tunnel のモードをロールアウト途中で切り替えると全端末に影響する点と、Local Domain Fallback の設定漏れで社内ホスト名が解決できない点を指摘している。後者は「WARP 展開後のバグ第1位」と表現されている。
  - Tunnel 作成時に private network の CIDR（例 `192.168.200.0/24`）を登録し、Settings → Network で firewall proxy（ICMP 含む）を有効にする。
- **出典**:
  - [A Private Network for One: Cloudflare WARP, Tunnels and the Machines I Build On](https://jared.lynskey.co.nz/en/posts/2026/2026-10-01-cloudflare-warp-dev-network/) — Jared Lynskey — 公開 2026-10-01
  - [Cloudflare Zero Trust Network Access を設定して自宅環境にアクセスする](https://daahama.hatenablog.com/entry/2025/09/11/050747) — 公開 2025-09-11
  - [Cloudflare One の概要と設定メモ](https://zenn.dev/_pochio_/articles/ed946d8923ae58) — 公開 2025-03-29
  - [WARP client and the device enrollment flow](https://cloudsecop.net/en/blog/warp-client-device-enrollment/) — 公開 2025-04-07
  - 検索結果の抜粋のみ（本文未確認）: [Secure Access to your private network with Cloudflare tunnel and Warp](https://di-marco.net/blog/it/2023-01-08-secure_access_to_your_private_network_with_cloudflare_tunnel_and_warp/)、[Replace your Homelab VPN with Cloudflare Zero Trust](https://chriskirby.net/replace-your-homelab-vpn-with-cloudflare-zero-trust/)
- **確からしさ**: 高（除外リストから外すという点は複数の独立した記事が一致）。IPv6 や 198.18/15 の件は1件のみで低〜中。
- **公式と食い違う可能性**: 100.64.0.0/10 を Tunnel の private network に使う場合に除外リストから外す扱いは、公式側の記述と突き合わせが必要。記事は 100.64.0.0/10 を「既定で除外」と述べている。

### 3. cloudflared の設定と Access による保護（a2）
- **主張**:
  - 古い例の `warp-routing: enabled: true` は、cloudflared の新しい版（記事内では 2026.8 とされる）では拒否される。`warp-routing` ブロックが存在すれば有効になる。
  - SSH の ingress には `tcp://` を使う。`ssh://` はブラウザ端末向けにストリームをラップするため、ネイティブクライアントで壊れる。
  - 「Tunnel のホスト名は DNS レコードが作られた時点で公開インターネットに出る」ため、Access アプリでの保護が必須。
  - 検証はローカルからのプローブではなく API で Tunnel の状態を確認する。
- **出典**: [A Private Network for One…](https://jared.lynskey.co.nz/en/posts/2026/2026-10-01-cloudflare-warp-dev-network/) — 公開 2026-10-01
- **確からしさ**: 低（1件。ただし日付は新しく、設定例が載っている）
- **公式と食い違う可能性**: `enabled: true` の廃止は公式の変更履歴との照合が必要。

### 4. Gateway ポリシー（Network/DNS/HTTP）と TLS 復号（a2）
- **主張**:
  - ポリシーは DNS・Network・HTTP の3種類。構成要素は Selector・Operator・Value・Action。
  - TLS 復号は `Settings > Network > TLS decryption` で有効化する。HTTP ポリシーは復号が前提。
  - HTTP ポリシーの例:
    - Security Categories の in で malware/phishing を Block。
    - Application の in で Allow。
    - URL の is で完全一致 Allow。
    - URL の matches regex で Allow。
    - Application の in で Do Not Inspect。
  - 評価順は、まず Do Not Inspect を上から下へ、次に Block/Allow を上から下へ。Allow は対応する Block より上に置かないと上書きできない。
  - 復号すると壊れるアプリがある。PayPay、Suica、Instagram などでクラッシュした事例があり、`paypay.ne.jp`、`mobilesuica.com`、`apps.mobile.pasmo.jp` を Do Not Inspect にした（2022 年の記事）。
  - 無料プランは 50 ユーザーまで、ログ保持 24 時間（2022〜2023 年時点）。
  - 「Untrusted certificate action」は Error（既定、エラーページ 526）・Block・Pass through の3種。Pass through は独自ルート CA（Enterprise プラン）が必要で、全 TLS 検査に適用される。
  - 独自 CA に切り替える前に証明書を端末へ配布しないと、全 TLS 検査で警告が出る。
  - Gateway を使うには DNS Locations と証明書の事前設定が必要、という記事もある。
- **出典**:
  - [Cloudflare Zero Trustでのコンテンツフィルタリング](https://dev.classmethod.jp/articles/cloudflare-zero-trust-contents-filtering/) — classmethod — 公開 2025-04-14
  - [「Cloudflare Zero Trust」で組織のゼロトラストネットワークを構成する](https://zenn.dev/hiroe_orz17/articles/67f63b9c7a9da5) — Zenn — 公開 2022-05-21（更新 2023-11-27）
  - [Cloudflare Gateway TLS Inspection and Untrusted Server Certificates](https://zenn.dev/oymk/articles/ac5a3ded351243?locale=en) — Zenn（oymk） — 公開 2024-05-27
  - [Cloudflare Zero Trust の基本的なセットアップ手順](https://zenn.dev/hiroe_orz17/articles/650463001ee087)（本文は未取得）
  - 検索結果の抜粋のみ: [Gateway を利用する為の事前設定](https://nw.t-spirits.com/zerotrust/cloudflare-zerotrust-gateway-setting/)、[ポリシー設定編①](https://debslink.hatenadiary.jp/entry/20221110/1668087871)
- **確からしさ**: 中〜高（HTTP ポリシー例と評価順は複数の記事が整合）。Network ポリシーの具体値（ポート等）は見つからなかった。
- **公式と食い違う可能性**: 無料枠の人数・ログ保持は古い数字の可能性が高い。UI 名称（Firewall policies など）も旧称が混在。

### 5. ルート証明書の配布（OS 別・MDM）（a3）
- **主張**:
  - 証明書は `Settings → Resources → Cloudflare certificates → Manage` から取得する。
  - **Jamf（macOS）**:
    - PEM を DER（.cer）へ変換する: `openssl x509 -inform PEM -in certificate.pem -outform DER -out certificate.cer`
    - 構成プロファイルの「証明書」ペイロードにアップロードする。
    - 「Allow all apps access」を有効、「Allow export from keychain」を無効にする。
    - 配布方式は自動インストール。確認は Keychain Access の System → Certificates。
  - **Intune（Windows）**:
    - Devices → Configuration → Policies → New。
    - Windows 10+、Template の「Trusted certificate」を選ぶ。
    - 証明書ストアは「Computer certificate store - Root」。
    - Entra ID グループに割り当てる。
    - 確認は `certlm.msc` の Trusted Root Certification Authorities。
  - macOS Ventura 以降は WARP が証明書を自動で信頼できず、MDM 配布が実質必須。
  - WARP 自身による自動インストールは、`Install CA to system certificate store` を `Settings > WARP Client > Global settings` で有効にする、という記述が別の記事にある。
- **出典**:
  - [Cloudflare Zero Trustのルート証明書をMDM(Jamf , Intune)で配布する](https://dev.classmethod.jp/articles/cloudflare-zero-trust-root-certificate-jamf-intune/) — classmethod — 公開 2025-01-06
  - [Cloudflare One の概要と設定メモ](https://zenn.dev/_pochio_/articles/ed946d8923ae58) — 公開 2025-03-29
- **確からしさ**: 中（具体手順は1件の詳細記事。macOS Ventura の制約は検索結果でも言及あり）
- **公式と食い違う可能性**: 「macOS Ventura 以降は自動信頼不可」は、公式の Install certificate using WARP の説明との突き合わせが必要。Linux・iOS・Android の配布手順は非公式では見つからなかった。

### 6. MDM 配布の具体パラメータ（Windows/macOS）（a3）
- **主張**:
  - Windows: `C:\ProgramData\Cloudflare\mdm.xml` に置く。最重要は `organization`。`service_mode` はフル Tunnel か DNS のみかを決める。`auto_connect` は分単位で、手動で切られても再接続する用途（記事では 1 を例示）。Intune では .msi 導入後にこのファイルをコピーする構成をとる（DTG Lab の検索スニペットのみ。本文は取得できず）。
  - Intune の Win32 アプリ例（MSI v2026.4.1350.0）:
    - Install: `msiexec.exe /i "Cloudflare_WARP_2026.4.1350.0.msi" /qn`
    - コンテキストは System、最低 OS は Windows 10 1607。
    - 検出ルールは `%ProgramFiles%\Cloudflare\Cloudflare WARP\` のファイルとバージョン、またはアンインストールのレジストリキー。
  - macOS（Scalefusion の例）: .mobileconfig のペイロードに次を設定する。
    - PayloadType: `com.cloudflare.warp`
    - `organization`: チーム名
    - `auto_connect`: 120（秒）
    - `onboarding`: false
    - PayloadUUID は `uuidgen` で生成して差し替える。
    - 注意: `auto_connect` の単位は Windows 記事で「分」、macOS 記事で「秒」と書かれている。
  - Hexnode の掲示板（2022-03）:
    - アプリ構成で XML を配るだけでは plist の値が反映されなかった。
    - 公式の .mobileconfig を、カスタム構成プロファイルとして配ると解決した。
    - 反映される側のパスは `/Library/Managed Preferences/` 配下。
  - Jamf では preference domain を `com.cloudflare.warp` にして plist をアップロードする（検索スニペットのみ。本文は公式ミラーに由来するため開いていない）。
- **出典**:
  - [Deploy Cloudflare One Client with Intune](https://intunemdms.com/deploy-cloudflare-one-client-with-intune/) — intunemdms.com — 公開日不明（内容は v26.4.1350.0 を扱う）
  - [Managed WARP Deployments — DTG Lab](https://blog.dtg-lab.net/posts/warp-managed-configurations) — 公開日不明（本文未取得）
  - [Configuring Cloudflare WARP Agent on macOS devices](https://help.scalefusion.com/docs/configuring-cloudflare-warp-agent-on-macos-devices) — Scalefusion — 公開 2025-11-11
  - [Warp configuration not working](https://www.hexnode.com/forums/topic/warp-configuration-not-working/) — Hexnode フォーラム — 公開 2022-03-23
- **確からしさ**: 中（Intune・macOS の例は動く設定に近いが、パラメータの網羅性は低い）
- **公式と食い違う可能性**: `auto_connect` の単位（分と秒）は公式の定義と要突合。`switch_locked`、`service_mode` の値、`auth_client_id`・`auth_client_secret`（サービストークン登録）などの値や書式は、非公式ソースで確認できなかった。

### 7. 動作確認（a6）
- **主張**:
  - `warp-cli status` で接続状態と組織（Teams）を確認する。
  - `curl https://www.cloudflare.com/cdn-cgi/trace/` の出力で `warp=on` を確認する。
  - `warp-cli trace`、`warp-cli diagnose` が診断に使える（検索結果の抜粋。本文は未確認）。
  - 証明書は Jamf では Keychain Access、Intune では `certlm.msc` で配布を確認する。
  - TLS 検査の確認には badssl.com が使える。
  - 疎通確認では ICMP を有効にしておくと変更確認に便利、という報告がある。
- **出典**:
  - [Cloudflare WARP warp-cli quick install and usage (gist)](https://gist.github.com/arafays/619c2fd24db34592b1626c51544d719f) — 公開日不明
  - [Cloudflare WARP Client Guide](https://cli.wiki/Cloudflare-WARP-Client-Guide) — 公開日不明
  - [TLS Inspection and Untrusted Server Certificates](https://zenn.dev/oymk/articles/ac5a3ded351243?locale=en) — 2024-05-27
- **確からしさ**: 低〜中（コマンドは一般的だが、本文での詳細確認が浅い。ポリシー反映の確認手順は見つからなかった）
- **公式と食い違う可能性**: 不明

## 情報が得られなかった論点
- **Access アプリ（self-hosted）の作成手順と設定値**: 一般的な説明しか得られず、画面項目レベルの非公式記事は見つからなかった。
- **Network ポリシーの具体例**（宛先 IP・ポート・プロトコルの組合せ、SNI 条件など）: 見つからなかった。
- **Jamf の plist 完全サンプルと全パラメータ**: 本文を確認できなかった。
- **Linux・iOS・Android のルート証明書配布**: 見つからなかった。
- **ポリシー反映の確認方法**（Gateway ログ、`warp-cli settings` 等）: 本格的な記事は見つからなかった。
- **デバイスプロファイルの詳細**（優先順位、条件式）: 実測や手順を含む非公式記事は見つからなかった。
- **IdP 連携の個別手順**（Entra ID・Okta・Google の画面項目）: 取得できなかった。
- **料金・所要時間の実測**: 無料枠 50 ユーザー（2022〜2023 年の記述）以外は見つからなかった。
- **公式との相違点（a7）**: 明示的に「公式と違った」と書いた記事は少なかった。確認できた相違候補は次の4点。
  - `warp-routing.enabled` の廃止
  - `auto_connect` の単位
  - macOS Ventura 以降の証明書自動信頼
  - Hexnode での XML 配布の不具合
