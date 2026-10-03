---
title: CloudflareにGitHub ActionsのSelf Hosted Runnerを作る方法
issue: 2
updated: 2026-10-03
status: draft
---

## 要約

- Cloudflare 上の self-hosted runner は **Cloudflare Containers**（Firecracker microVM）上で、GitHub の JIT runner を1ジョブ1コンテナで起動する構成が現実解。OSS の [k2wanko/cloudflare-github-self-hosted-runner](https://github.com/k2wanko/cloudflare-github-self-hosted-runner)（MIT）が `workflow_job` webhook → Durable Object → JIT runner の自動スケール構成を提供している。
- 単価は Containers 公式料金から計算で 2 vCPU（standard-3）が約 **$0.22/時（$0.00367/分）**。GitHub-hosted Linux 2コアは **$0.006/分（$0.36/時）** で、CPU を使い切る前提なら Cloudflare が約 39% 安い。ただし Workers Paid の月額 $5 や Durable Object 等は別。
- Cloudflare 上で **×（できない）** になる主なものは Windows / macOS runner、GPU、`ubuntu-latest` 同梱ツール、fork PR、6 時間超ジョブ、最大 4 vCPU/12 GiB を超えるサイズ。Docker は標準 Containers ではなく rootless Docker 構成が必要で、**△**。
- 公式ドキュメントで確認できなかった項目は本文で「未確認」と明記した。

## 調査の前提

- 前提: GitHub は SaaS の Enterprise Cloud。調査日は 2026-10-03。価格は USD、すべて公式ページの 2026-10-03 時点の値。
- 調べたこと: Cloudflare Containers / Sandbox での runner 構築、両社のコスト、機能の可否。
- 調べていない / 範囲外: 日本円換算、Cloudflare Workers / Durable Objects / R2 等の周辺課金の実測、ジョブ実行性能のベンチマーク、セキュリティ監査。
- 「Cloudflare Runner」という公式製品は確認できなかった。本書では Containers / Sandbox 上に自前で runner を載せる構成を指す。

## 調査結果

### 1. 構築手順（OSS 実装 k2wanko/cloudflare-github-self-hosted-runner を使う場合）

構成: GitHub が `workflow_job`（queued）webhook を Worker に送る → Worker が署名検証し `RunnerJob` Durable Object に委譲 → Durable Object が JIT runner 設定を作りコンテナを起動 → runner が1ジョブ実行して終了、コンテナ破棄。5 分ごとに孤児コンテナを検査し、15 分ジョブが割り当たらなければ破棄する（出典: 同リポジトリ README）。

1. **前提を揃える。** Cloudflare アカウント（Containers が有効。公式料金ページ上は Workers Paid $5/月のプランに含まれる枠がある）、Docker、`cf` CLI、Bun。
   ```bash
   git clone https://github.com/k2wanko/cloudflare-github-self-hosted-runner && cd cloudflare-github-self-hosted-runner
   bun install
   ```
2. **デプロイする。** 利用を許可する GitHub owner を `ALLOWED_OWNERS` に指定する。
   ```bash
   ALLOWED_OWNERS=example-org bunx cf deploy
   ```
   任意設定: `CFRUNNER_WORKER_NAME`（既定 `cfrunner`）、`LABEL_PREFIX`（既定 `cfrunner`）、`SNAPSHOT_RESTORE_ANY_REF`（既定 false）。
3. **GitHub App を作る。** Worker が提供するセットアップページ（App Manifest flow）で作成する。組織の App には「Self-hosted runners」権限、個人アカウントの App にはリポジトリの「Administration」権限が必要。App の所有者は `ALLOWED_OWNERS` に含める。webhook の URL と秘密は自動で設定され、資格情報は Worker 内にだけ保存される。
4. **App を対象リポジトリにインストールする。** runner を使う全リポジトリ（または Enterprise Cloud なら組織全体）が対象。
5. **workflow で runner を指定する。**
   ```yaml
   jobs:
     build:
       runs-on:
         - cfrunner-${{ github.run_id }}-${{ github.run_attempt }}
         - instance:standard-2
   ```
   `instance:` で Containers のインスタンスタイプ、`instance:cpu=2,memory=6,disk=16` でカスタムサイズを指定する。Docker が要る場合は `- docker` ラベルを追加する。
6. **動作確認。** 上の workflow を push し、Actions 画面でジョブが queued → in progress → success になること、完了後に runner が組織の runner 一覧から消える（ephemeral）ことを確認する。※本調査では実環境でのデプロイ・実行は行っておらず、この確認手順は README の挙動記述からの推論である。

**Enterprise Cloud 前提の考慮点（a8）**

| 観点 | 内容 | 出典 |
| --- | --- | --- |
| 登録単位 | runner はリポジトリ / 組織 / Enterprise の3階層。Enterprise 登録の runner は複数組織に割り当てられる | [GitHub Docs: About self-hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners) |
| JIT API | `POST /orgs/{org}/actions/runners/generate-jitconfig`（`name`・`runner_group_id`・`labels` が必須、`work_folder` は任意）。org には `admin:org`、repo には `repo` スコープ | [GitHub REST: Self-hosted runners](https://docs.github.com/en/rest/actions/self-hosted-runners) |
| runner group | JIT 発行時に `runner_group_id` が必須。Enterprise Cloud では group でリポジトリ単位に利用を絞れる（本調査では group 制御自体の公式確認は行っていない＝未確認） | 同上 |
| ephemeral | GitHub は「ephemeral runner による autoscaling」を推奨。k2wanko 実装は JIT で ephemeral | GitHub Docs: Self-hosted runners reference |
| 自動更新 | `--disableupdate` で止めても 30 日以内に更新しないとジョブが割り当たらない。k2wanko 実装は Dockerfile のバージョンを更新する運用 | 同上 / README |
| 必須の外向き通信 | 443 で github.com, api.github.com, `*.actions.githubusercontent.com`, `*.blob.core.windows.net`, ghcr.io 等 | GitHub Docs: Self-hosted runners reference |

**代替（PoC）**: Cloudflare 社員の gist [Minimal ephemeral GitHub Actions runner on Cloudflare Sandboxes](https://gist.github.com/elithrar/082344e39d8a10c5d48b93075554ce89) は Sandbox 上で rootless Docker 付き runner を `POST /runners` で1台起動する最小例。**自動スケールが無い PoC** と明記されており、本番には webhook 処理または GitHub の Runner Scale Set Client が別途必要。

### 2. Cloudflare Containers のコスト（a2）

公式単価（[Containers pricing](https://developers.cloudflare.com/containers/pricing/)、2026-10-03 取得）: メモリ $0.0000025 / GiB-秒、CPU $0.000020 / vCPU-秒、ディスク $0.00000007 / GB-秒。10 ms 単位で課金。メモリとディスクは割り当て量、**CPU は実際に使った分のみ**。

換算: メモリ $0.009/GiB-時、CPU $0.072/vCPU-時、ディスク $0.000252/GB-時。以下は **CPU を1時間フルに使い切った場合（上限）** の計算値で、公式が示す単価表ではなく本書の計算。

| インスタンス | vCPU | メモリ | ディスク | 計算式（USD/時） | 1時間のコスト | 1分あたり |
| --- | --- | --- | --- | --- | --- | --- |
| lite | 1/16 | 256 MiB | 2 GB | 0.25×0.009 + 0.0625×0.072 + 2×0.000252 | **$0.0073** | $0.00012 |
| basic | 1/4 | 1 GiB | 4 GB | 1×0.009 + 0.25×0.072 + 4×0.000252 | **$0.0280** | $0.00047 |
| standard-1 | 1/2 | 4 GiB | 8 GB | 4×0.009 + 0.5×0.072 + 8×0.000252 | **$0.0740** | $0.00123 |
| standard-2 | 1 | 6 GiB | 12 GB | 6×0.009 + 1×0.072 + 12×0.000252 | **$0.1290** | $0.00215 |
| standard-3 | 2 | 8 GiB | 16 GB | 8×0.009 + 2×0.072 + 16×0.000252 | **$0.2200** | $0.00367 |
| standard-4 | 4 | 12 GiB | 20 GB | 12×0.009 + 4×0.072 + 20×0.000252 | **$0.4010** | $0.00668 |

- 月の込み枠（Workers Paid $5/月）: メモリ 25 GiB-時、CPU 375 vCPU-分、ディスク 200 GB-時。超過分が上表の単価。
- 外向き通信: 北米・欧州 $0.025/GB（月 1 TB 込み）、その他は $0.04〜0.05/GB（月 500 GB 込み）。
- k2wanko 実装の仕様上 standard-1〜4 とカスタムサイズ（1〜4 vCPU、3 GiB/vCPU 以上、最大 12 GiB、ディスク最大 20 GB）が選べる。lite / basic は runner には小さすぎるため実用外と判断する（推論）。
- **含まれない費用**: Workers / Durable Objects のリクエスト・実行料金、ログ。Sandbox は Containers の料金に従い、別途 Workers・DO・ログが課金されうる（[Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/)）。これらの単価は本調査で未確認。

### 3. GitHub-hosted runner のコスト（a3）

出典: [GitHub Docs: Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)（2026-10-03 取得）。1時間 = 分単価 × 60。

| 種別 | vCPU | 分単価 | 1時間 |
| --- | --- | --- | --- |
| Linux slim（ubuntu-slim） | 1 | $0.002 | $0.12 |
| Linux 標準 | 2 | $0.006 | $0.36 |
| Linux arm64 標準 | 2 | $0.005 | $0.30 |
| Linux larger 4 / 8 / 16 / 32 / 64 / 96 | 4 / 8 / 16 / 32 / 64 / 96 | $0.012 / 0.022 / 0.042 / 0.082 / 0.162 / 0.252 | $0.72 / 1.32 / 2.52 / 4.92 / 9.72 / 15.12 |
| Linux arm larger 4 / 8 / 16 / 32 / 64 | 4〜64 | $0.008 / 0.014 / 0.026 / 0.050 / 0.098 | $0.48 / 0.84 / 1.56 / 3.00 / 5.88 |
| Windows 標準 | 2 | $0.010 | $0.60 |
| Windows larger 4 / 8 / 16 / 32 / 64 / 96 | 4〜96 | $0.022 / 0.042 / 0.082 / 0.162 / 0.322 / 0.552 | $1.32 / 2.52 / 4.92 / 9.72 / 19.32 / 33.12 |
| Windows arm 2 / 4 / 8 / 16 / 32 / 64 | 2〜64 | $0.010(標準) / 0.014 / 0.026 / 0.050 / 0.098 / 0.194 | $0.60 / 0.84 / 1.56 / 3.00 / 5.88 / 11.64 |
| macOS 標準 | 3-4 | $0.062 | $3.72 |
| macOS larger（Intel 12 vCPU） | 12 | $0.077 | $4.62 |
| macOS XL（M2 Pro 5 vCPU） | 5 | $0.102 | $6.12 |
| GPU Linux / Windows | 4 | $0.052 / $0.102 | $3.12 / $6.12 |

注: 上表の Windows arm 2 vCPU は取得表で標準 `actions_windows_arm` が $0.010、larger の `windows_2_core_arm` が $0.008 と2系統あり、ここでは標準側を載せた。公開リポジトリの標準 runner は無料（本調査では公式課金ページの該当記述の取得は未実施のため、一般知識であり**未確認**）。Enterprise Cloud の月間無料枠も本書では扱っていない。

### 4. コスト比較（a5）

| 用途 | Cloudflare（上限計算） | GitHub-hosted | 差 |
| --- | --- | --- | --- |
| 1〜2 vCPU 相当 | standard-2（1 vCPU）$0.00215/分 | Linux slim（1 vCPU）$0.002/分 | ほぼ同等。slim の方がわずかに安いが slim は 15 分上限・Docker 不可 |
| 2 vCPU | standard-3 $0.00367/分 | Linux 標準 $0.006/分 | Cloudflare が約 39% 安い |
| 4 vCPU | standard-4 $0.00668/分 | Linux 4 コア $0.012/分 | Cloudflare が約 44% 安い |
| 8 vCPU 以上 | **提供なし**（最大 4 vCPU） | $0.022/分〜 | 比較不能 |

注意: メモリ・ディスクの構成は両社で異なる。GitHub 標準 Linux（private）は 2 vCPU/8 GB、larger の仕様は本調査で未取得。

**損益分岐の目安**: Cloudflare は Workers Paid の固定費 $5/月 を払い、込み枠（CPU 375 vCPU-分 ≒ 6.25 vCPU-時）を超えた分が従量。GitHub-hosted は固定費なしで、Enterprise の無料分枠を超えた分が従量。standard-3 を月 N 時間使うと、Cloudflare は概算 $5 + 0.22×N、GitHub 2 コアは 0.36×N。差が $5 に達する N ≒ 5 / (0.36−0.22) ≒ **36 時間/月**（込み枠と周辺課金を無視した概算）。それ以下の利用ならコスト面の利点は小さい。

### 5. 機能比較（a4・a6）

可否凡例: 〇＝実現可 / △＝条件付き / ×＝実現不可。根拠が公式に確認できたものは出典を、推論は「推論」と備考に書いた。

| 機能名 | Cloudflareでの実現可否 | 備考 |
| --- | --- | --- |
| Ubuntu Linux x64 runner | 〇 | Containers は `linux/amd64` 前提（[Architecture](https://developers.cloudflare.com/containers/platform-details/architecture/)） |
| Linux arm64 runner | × | Containers は `linux/amd64` を前提とする記述のみ。arm64 の提供は確認できず |
| Windows runner | × | Containers は Linux コンテナのみ（推論。Windows 対応の記述は確認できず） |
| macOS runner | × | 同上。macOS は Apple 実機・ライセンスが必要（推論） |
| GPU runner | × | Containers の公式インスタンス表に GPU が無い |
| ジョブごとにクリーンな環境（ephemeral） | 〇 | 起動ごとにイメージの新しいディスク（ディスクは既定で揮発）。k2wanko 実装は1ジョブ1コンテナ |
| `ubuntu-latest` 同梱ツール群 | △ | 自前イメージ。k2wanko の既定イメージは「GitHub-hosted のツールが無い」ため `setup-*` Action で補う。イメージ側に入れれば可 |
| 最大サイズ 8〜96 vCPU の larger runner | × | カスタムでも最大 4 vCPU / 12 GiB / ディスク 20 GB |
| ディスク容量（GitHub 標準 14 GB SSD 以上） | △ | 最大 20 GB。大きなビルドは不足しうる |
| sudo（パスワードなし） | △ | Ubuntu 実行ユーザー `runner`。sudo 付与はイメージ作成次第（未確認） |
| Docker（container action / docker build） | △ | 標準 Containers は非特権で `--privileged` 不可。k2wanko は `docker` ラベルで Docker を起動し bridge ネットワーク等をサポートと記載。Sandbox の rootless Docker 構成は iptables 無効のため published ports に制約 |
| Job container / service containers | △ | Sandbox PoC では service container は `localhost:port` 経由・host ネットワーク。GitHub-hosted と同じ書き方では動かない場合あり。k2wanko の実績は未確認 |
| 実行時間 6 時間上限 | 〇（同等） | k2wanko 実装は最大 6 時間。GitHub-hosted の上限は本調査で未取得 |
| fork からの pull request | × | k2wanko 実装は未対応（ジョブが queued のまま） |
| 起動の速さ（ウォームプール） | △ | コンテナ起動の遅延を測っていないため未確認。スナップショット復元で依存を事前復元できる |
| キャッシュ / アーティファクト | 〇 | runner 標準機能。`*.blob.core.windows.net` 等への外向き 443 が必要 |
| 静的 IP / VNet 接続 | × | Containers の送信元 IP 固定の記述は確認できず。GitHub 側は larger runner のみ提供 |
| カスタムイメージ | 〇 | 任意の Dockerfile（イメージサイズ上限はディスク容量と同じ 20 GB、アカウント合計 50 GB） |
| runner の自動更新対応 | △ | 30 日で拒否される。イメージ再ビルド・再デプロイが必要 |
| 運用負荷なしの autoscale | △ | k2wanko 実装を使えば自動。自前運用（webhook 取りこぼし時は手動 re-run） |
| 並列数 | △ | アカウント上限 1,500 vCPU / 6 TiB メモリ（Containers limits） |
| スナップショットによる状態復元 | 〇（Cloudflare 固有の強み） | 最大 20 GB・保持 30 日 |

**「Cloudflare ではできないこと」（×の一覧）**: Windows runner / macOS runner / arm64 runner / GPU runner / 4 vCPU・12 GiB・20 GB を超える larger runner / fork PR / 静的 IP・VNet。

## 結論と推奨

- **Linux x64・最大 4 vCPU に収まるビルド/テストが中心で、月 36 時間以上使う**（standard-3 相当の概算）なら、k2wanko 実装を使った Cloudflare Containers runner はコスト面で有利。推奨サイズは 2 vCPU（standard-3）と 4 vCPU（standard-4）。
- **Windows / macOS / GPU / arm64、larger runner、fork PR、固定 IP が必要**なら GitHub-hosted を使う。Cloudflare で代替できない。
- **Docker を多用する**（docker build、service containers）場合は、事前に実ジョブで Docker 構成を検証するまで Cloudflare へ移さない。△が多く、書き換えコストが出る。
- 本番採用前に、実環境での PoC（1 リポジトリ・2 週間）で webhook の取りこぼし率と起動遅延を実測すること。

## 残った不確実性

- 実環境でのデプロイ・実行は行っていない。手順は README と公式 API ドキュメントの記述に基づく。
- Workers / Durable Objects / ログの課金単価は未取得のため、総コストは上記より高くなる。
- Windows / macOS / arm64 が不可という判断は「提供の記述が確認できない」ことに基づく（公式が「不可」と明記しているわけではない）。
- GitHub-hosted の標準 runner の無料枠・Enterprise の含有分は未調査。
- GitHub の self-hosted runner への $0.002/分 課金は 2025-12 に告知後、延期され現状課金されていないと複数の二次情報が報じているが、一次情報（changelog 本文）では確認していない。再開されると self-hosted 側にも加算される。

## 出典

`sources.md` を参照。
