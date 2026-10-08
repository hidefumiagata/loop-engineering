---
id: gitlab-advisories
title: GitLab の新規脆弱性（24時間以内）
enabled: true
output: daily/gitlab-advisories/{date}.md
---

## 集めるもの

**実行日時点から 24 時間以内**に公開された GitLab のセキュリティリリース（patch release）と、
そこに含まれる CVE。

### 一次情報（ここだけを根拠にする）

| 取得先 | 用途 |
| --- | --- |
| `https://docs.gitlab.com/releases/patch-releases.xml` | **これを主に使う。** Atom フィード |
| 各 entry の `link href` | リリース本文。CVE の表と影響バージョンを読む |
| `https://advisories.gitlab.com/` | 個別 CVE の補足が必要なときだけ |

> **注意: 旧 URL `https://about.gitlab.com/security-releases.xml` は
> `https://docs.gitlab.com/releases/patch-releases.xml` に 301 で移転している**（実測）。
> 移転先を直接引くこと。

Atom の要素名（実測で確認）:

```
<title>      GitLab AI Gateway Critical Patch Release: 19.2.4, 19.3.2, and 19.4.1 のような形
<link href>  リリース本文の URL
<published>  公開日時
<updated>    最終更新日時
<content type="html">  本文。**CVE の表と深刻度がここに埋まっている**
```

### 絞り込み

- `published` が**実行時刻から 24 時間以内**の entry だけを対象にする
- **1つのリリースが複数の CVE を含む。** CVE ごとに項目を立てる
- フィードは「patch release」なので、セキュリティ修正を含まない通常のパッチも流れてくる。
  **CVE を含まない entry は対象外**として除外し、その旨を件数の内訳に書く

### 該当が0件のとき

**0件は正常な結果である。** GitLab のセキュリティリリースは毎日は出ない。
「この期間にセキュリティリリースはありませんでした」と明記して終わる。
件数を埋めるために24時間より古いリリースを混ぜてはならない。

## 作るもの

```markdown
---
title: GitLab 新規脆弱性レポート
date: <YYYY-MM-DD>
vendor: GitLab
window: 24h
count: <CVE の件数>
---

# GitLab 新規脆弱性（<YYYY-MM-DD>）

対象期間: <取得時刻の24時間前（JST）> 〜 <取得時刻（JST）>
セキュリティリリース <R> 件 / CVE <N> 件

<0件なら「この期間にセキュリティリリースはありませんでした。」と書いてここで終わる>

## 対象リリース

| リリース | 公開 | CVE 件数 | 種別 |
| --- | --- | --- | --- |
| <19.2.4, 19.3.2, 19.4.1 など> | <YYYY-MM-DD HH:MM JST> | <n> | <Critical Patch / Patch> |

## 深刻度の内訳

| 深刻度 | 件数 |
| --- | --- |
| Critical | <n> |
| High | <n> |
| Medium | <n> |
| Low | <n> |

## 1. <CVE-ID> — <タイトル>

- **CVE**: <CVE-ID>
- **深刻度**: <Critical / High / Medium / Low>
- **CVSS**: <スコアがリリースに載っていれば写す。無ければ「リリースに記載なし」>
- **影響バージョン**: <「16.x 以降 19.4.1 未満」のように、修正版まで書く>
- **対象**: <GitLab CE / EE / self-managed / GitLab.com のどれに影響するか>
- **含まれるリリース**: <19.2.4, 19.3.2, 19.4.1>
- **出典**: [<リリースのタイトル>](<link href>)

<日本語で200〜400文字。何が起きるのか、前提条件（認証の要否・必要な権限・
 特定機能の有効化が必要か）、self-managed と GitLab.com のどちらが影響を受けるか。
 「アップデートを推奨」で終わらせず、該当判定ができるように書く>

## 2. ...
```

## 規律

- **CVE 番号・深刻度・影響バージョンは、リリース本文の表記をそのまま写す。**
  丸めない、言い換えない
- **リリース本文を開いて読む。** Atom の `<content>` だけで足りるならそれでよいが、
  **読んでいない部分を要約しない**。開けなかったら「本文未読」と明記する
- **深刻度は GitLab の表記を使う。** 自分で判断し直さない
- **self-managed と GitLab.com を区別する。** GitLab.com は GitLab 側が対処済みのことが多く、
  読者がやるべきことが変わる
- **CVSS がリリースに無いなら「記載なし」と書く。** 他所から拾ってきて混ぜない
- 0件のときに曖昧な書き方をしない。**0件と書く**
