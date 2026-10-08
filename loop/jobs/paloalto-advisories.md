---
id: paloalto-advisories
title: Palo Alto Networks の新規脆弱性（24時間以内）
enabled: true
output: daily/paloalto-advisories/{date}.md
---

## 集めるもの

**実行日時点から 24 時間以内**に公開または更新された Palo Alto Networks のセキュリティアドバイザリ。

### 一次情報（ここだけを根拠にする）

| 取得先 | 用途 |
| --- | --- |
| `https://security.paloaltonetworks.com/json` | **これを主に使う。** 全アドバイザリの JSON 配列。公開日の降順 |
| `https://security.paloaltonetworks.com/CVE-XXXX-XXXXX` | 個別アドバイザリの本文。影響範囲と回避策を読む |
| `https://security.paloaltonetworks.com/rss.xml` | JSON が取れなかったときの代替 |

JSON の1件はこの形をしている（実測で確認した項目名）。

```
ID            CVE-2026-0310 のような識別子
title         PAN-OS: Buffer Overflow Vulnerability via XML Processing
severity      HIGH / CRITICAL / MEDIUM / LOW
baseScore     9.2（CVSS 基本値）
baseSeverity  基本値に対応する深刻度
threatScore   脅威を加味したスコア（ある場合）
threatSeverity 同じく深刻度
date          2026-09-09T16:00:00.000Z（公開日時）
updated       同形式（最終更新）
product       影響製品の配列
affected      影響バージョンの配列
```

### 絞り込み

- `date` または `updated` が**実行時刻から 24 時間以内**のものだけを対象にする
- 配列は公開日の降順なので、24時間より古いものに達したら打ち切ってよい
- **更新だけのもの（`updated` が新しく `date` が古い）も対象に含める。** ただし
  「新規公開」と「既存アドバイザリの更新」を成果物で区別する

### 該当が0件のとき

**0件は正常な結果である。** 「新規の脆弱性はありませんでした」と明記して終わる。
件数を埋めるために24時間より古いものを混ぜてはならない。

## 作るもの

```markdown
---
title: Palo Alto Networks 新規脆弱性レポート
date: <YYYY-MM-DD>
vendor: Palo Alto Networks
window: 24h
count: <件数>
---

# Palo Alto Networks 新規脆弱性（<YYYY-MM-DD>）

対象期間: <取得時刻の24時間前（JST）> 〜 <取得時刻（JST）>
新規 <N> 件 / 更新 <M> 件

<0件なら「この期間に新規・更新のアドバイザリはありませんでした。」と書いてここで終わる>

## 深刻度の内訳

| 深刻度 | 件数 |
| --- | --- |
| CRITICAL | <n> |
| HIGH | <n> |
| MEDIUM | <n> |
| LOW | <n> |

## 1. <CVE-ID> — <タイトル>

- **CVE**: <CVE-ID>
- **深刻度**: <CRITICAL / HIGH / MEDIUM / LOW>
- **CVSS**: 基本値 <baseScore>（<baseSeverity>）/ 脅威込み <threatScore>（<threatSeverity>）
- **区分**: <新規公開 / 既存の更新>
- **公開**: <YYYY-MM-DD HH:MM JST> / **更新**: <YYYY-MM-DD HH:MM JST>
- **影響製品**: <product の内容>
- **影響バージョン**: <affected の内容。「〜未満」「〜以降で修正」まで書く>
- **出典**: [<CVE-ID>](https://security.paloaltonetworks.com/<CVE-ID>)

<日本語で200〜400文字。何が起きるのか（攻撃者に何ができるのか）、
 前提条件（認証が必要か、特定の設定が必要か）、回避策または修正版。
 「脆弱性が見つかった」で終わらせず、自分の環境が該当するかを読者が判断できるように書く>

## 2. ...
```

## 規律

- **CVE 番号・CVSS・深刻度・影響バージョンは、アドバイザリの表記をそのまま写す。**
  丸めない、言い換えない、換算しない
- **読んでいないアドバイザリを要約しない。** 本文が開けなかったら
  「JSON の項目のみで本文は未読」と明記する
- **深刻度は一次情報の値を使う。** 自分で判断し直さない
- **24時間の境界は取得時刻を基準にする。** 曖昧なら公開日時をそのまま併記して読者に委ねる
- CVSS の基本値と脅威込みのスコアが両方あるなら**両方書く**。片方だけ書くと危険度を誤認させる
- 0件のときに「特筆すべき脆弱性はなし」のような曖昧な書き方をしない。**0件と書く**
