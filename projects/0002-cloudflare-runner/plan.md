# plan: 0002 CloudflareにGitHub ActionsのSelf Hosted Runnerを作る方法

## 再定義した目的
GitHub Enterprise Cloud を使う組織が、Cloudflare のプラットフォーム（Containers / Workers / Sandbox 等）上で GitHub Actions の self-hosted runner を動かす場合の (1) 具体的な構築手順、(2) インスタンスタイプ別の時間単価と1時間コスト、(3) GitHub-hosted runner の同等サイズとのコスト比較、(4) GitHub-hosted runner の機能一覧に対する Cloudflare 上 runner の実現可否（〇△×）を、一次情報を根拠に提示する。

## 起草した受入基準
| ID | 基準 | 重み |
| --- | --- | --- |
| a1 | Cloudflare 上に self-hosted runner を構築する手順が、前提条件から runner 登録・workflow 実行確認までステップ番号付きで記載され、各ステップにコマンドまたは設定例がある | 3 |
| a2 | Cloudflare 側の各インスタンスタイプについて、単位時間あたり単価と1時間利用時のコストが表で明示され、算出根拠（公式料金の数値と計算式）と出典URLがある | 3 |
| a3 | GitHub-hosted runner の各インスタンスタイプ（標準・larger runner）について、分単価と1時間コストが表で明示され、出典URLがある | 3 |
| a4 | GitHub-hosted runner の機能一覧が「機能名／Cloudflareでの実現可否／備考」の3列の表で、可否は〇△×のいずれかで、△には備考に理由がある | 3 |
| a5 | Cloudflare と GitHub-hosted のコスト比較表があり、同等スペック同士の対応づけと、損益分岐の目安が示される | 2 |
| a6 | 「Cloudflare ではできないこと」が×の項目として抽出・一覧化されている | 2 |
| a7 | 各事実に出典URLと取得日があり、価格・仕様の確認日が明記されている | 2 |
| a8 | GitHub Enterprise Cloud 前提の考慮事項（runner group、組織/Enterprise 登録、ephemeral/JIT runner）が手順に反映されている | 1 |

## 批評の取り込み
`gemini:review`（gemini-3.1-flash-lite）の批評は、不足・検証不能・曖昧・追加提案のいずれも 0 件で「このまま進めてよい」だった。基準は草案どおり確定する。

## 採用しなかった批評とその理由
なし（指摘が 0 件のため）。ただし批評が無指摘だった点は、基準が十分であることの強い証拠とは見なさない。
a2 の「各インスタンスタイプ」は Cloudflare Containers の公式インスタンスタイプ表を指すと work 時に解釈する。
