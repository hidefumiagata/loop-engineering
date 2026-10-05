# 公式情報の調査結果

## 調査した範囲と限界
developers.cloudflare.com（Cloudflare One ドキュメント）の以下を 2026-10-04 に取得した。
setup / Cloudflare One Client 概要 / manual-deployment / mdm-deployment/parameters / device-profiles / split-tunnels / device-enrollment / user-side-certificates / traffic-policies / dns-policies / cloudflare-tunnel / private-net/cloudflared / troubleshooting 索引。
取得は要約付き取得のため、各ページの全文は未確認。Network・HTTP ポリシーの個別ページ、Access アプリ作成、MDM の OS 別手順（Intune/Jamf）、warp-cli status の詳細は未取得。

## 見つかったこと

### 1. 組織作成・IdP
- **記述**: ダッシュボードで Zero Trust を選び、オンボーディングでチーム名（一意の内部識別子）を決める。Cloudflare 自身の ID プロバイダが既定で有効で、ワンタイムPINやサードパーティ IdP は後から追加できる。サブスクリプション選択と支払い情報入力で完了。ユーザーは手動登録時にチーム名を入力する。
- **出典**: [Zero Trust setup](https://developers.cloudflare.com/cloudflare-one/setup/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 2. Device enrollment 権限
- **記述**: Zero Trust > Team & Resources > Devices > Device profiles > Management > Device enrollment > Device enrollment permissions > Manage。Policies タブで Access ポリシーを設定（例: Include / Emails ending in / `@company.com`）。デバイス姿勢チェックは登録ポリシーでは使えない（登録後のみ）。任意設定「Apply instant authentication」で SSO に直接リダイレクト。IdP 未連携ならワンタイムPIN。
- **出典**: [Device enrollment](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/device-enrollment/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 3. デバイスプロファイル
- **記述**: Zero Trust > Team & Resources > Devices > Device profiles > General profiles > Create new profile（Default プロファイルを複製）。Default は評価リスト最下位、評価は上から first match。設定項目に Service Mode / Auto Connect（例 600 秒）/ Switch Locked。マッチ条件はユーザーメール、IdP グループ、OS、OS バージョン、管理ネットワーク、SAML 属性、サービストークン（演算子 is / in）。
- **出典**: [Device profiles](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/device-profiles/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 4. Split Tunnels
- **記述**: Exclude（既定）は指定した IP/ドメイン以外を Gateway へ送る。Include は指定した IP/ドメインのみ Gateway へ送り、Zero Trust のドメイン/IP を手動追加する必要がある（デバイス姿勢チェック等のため）。Exclude 既定除外: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, IPv6 link-local/ULA など。設定: 対象プロファイル > Configure > Split Tunnels > Manage。変更は約 10 分で端末に反映。
- **出典**: [Split Tunnels](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/route-traffic/split-tunnels/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 5. Gateway ポリシー
- **記述**: DNS ポリシーは全 DNS クエリを検査。Network ポリシーは TCP/UDP/GRE を IP・ポート・プロトコル・SNI で検査（SSH/RDP 等）。HTTP ポリシーは URL/ヘッダ/ファイルを検査し、HTTPS 復号にはルート証明書のインストールが必要。アクションは Allow / Block / Quarantine 等。ユーザーID・デバイス姿勢をセレクタに使える。DNS ポリシーは Gateway > Traffic Policies > DNS Policies。要素は Action・Selector・Operator、And/Or 結合、first match。例: Content Categories in Adult Themes → Block / Host is www.example.com → Override 1.2.3.4。
- **出典**: [Traffic policies](https://developers.cloudflare.com/cloudflare-one/traffic-policies/) / [DNS policies](https://developers.cloudflare.com/cloudflare-one/traffic-policies/dns-policies/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 6. Cloudflare Tunnel による社内接続
- **記述**: cloudflared が社内ホストで outbound-only の接続を張る。作成はダッシュボードまたは API。WARP 利用者は Tunnel 経由で内部サービスへ到達でき、方式は private hostname と IP/CIDR ルーティングの2種。
- **出典**: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) / [private-net/cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 7. クライアント導入と登録
- **記述**: Windows/macOS/Linux 対応、iOS/Android/ChromeOS は Cloudflare One Agent。MDM 例: Intune, JAMF, JumpCloud。既定は Traffic and DNS モード、代替は DNS-only。GUI 登録: Zero Trust security を選択 > チーム名入力 > 認証。CLI: `warp-cli registration new <team>`, `warp-cli registration show`, `warp-cli connect`。モバイルは URL `cf1app://oneapp.cloudflare.com/team?name=<team>`。
- **出典**: [Client overview](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/) / [Manual deployment](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/manual-deployment/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 8. MDM パラメータ
- **記述**: 必須 `organization`（string）。`gateway_unique_id`（DNS-only 用 DoH サブドメイン）。主な任意: `auth_client_id` / `auth_client_secret`（サービストークン、無人登録）、`auto_connect`（整数 0〜1440 分）、`service_mode`（`warp` / `1dot1` / `proxy` / `postureonly` / `tunnelonly`）、`switch_locked`（bool、既定 false）、`onboarding`（bool、既定 true）、`display_name`、`support_url`、`warp_tunnel_protocol`（`masque` / `wireguard`）、`allow_managed_deployments`（既定 true）、`enable_post_quantum`、`hardware_backed_registration`（既定 false）、`override_*_endpoint`。トップレベル: `configs`, `multi_user`, `organization_configs`, `pre_login`。
- **出典**: [MDM parameters](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/mdm-deployment/parameters/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 9. ルート証明書
- **記述**: HTTPS 検査・DLP・アンチウイルス・Access for Infrastructure・Browser Isolation で必要。生成証明書は Zero Trust > Traffic policies > Traffic settings > Certificates から Download .pem / .crt。既定証明書は 2025-02-02 に期限切れ。OS 別・MDM 配布手順は取得ページに含まれず。
- **出典**: [User-side certificates](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/user-side-certificates/) — 取得日 2026-10-04
- **種別**: ドキュメント

### 10. 動作確認
- **記述**: `warp-cli registration show` で登録確認。`curl --silent https://www.cloudflare.com/cdn-cgi/trace | grep '^warp=on$'` で WARP 経由を確認。`curl --fail --silent --show-error "https://<TEAM>.cloudflareaccess.com/cdn-cgi/access/certs"` で組織到達性を検証。診断は warp-diag（索引ページのみ確認）。
- **出典**: [Manual deployment](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/manual-deployment/) / [Troubleshooting](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/troubleshooting/) — 取得日 2026-10-04
- **種別**: ドキュメント

## 公式に記述が無かった論点（今回の取得範囲で）
- Network ポリシーの具体的な設定値例（セレクタ・ポート）、HTTP ポリシーと TLS 復号設定の手順
- Access アプリ（セルフホスト）の作成手順
- ルート証明書の OS 別インストール手順・MDM 配布
- Tunnel 作成のダッシュボード手順、private network ルート追加、`100.64.0.0/10` 除外の扱い
- Intune / Jamf での MDM 設定の実際の書式
- `warp-cli status` 出力の読み方、ポリシー反映確認の方法
