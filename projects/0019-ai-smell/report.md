---
title: AI臭さを消す方法（原因・特徴・対策の文献調査の突き合わせ）
issue: 19
updated: 2026-10-05
status: reviewed
---

# AI臭さを消す方法：公式情報と非公式情報の突き合わせ

## 調査概要

公式文書は「AI臭さ」という語を使わず、出力スタイルの制御法と文章規範しか得られなかった。原因・特徴・対策・限界の大半は非公式のみで、学術論文と個人ブログに依存する。語彙より文長の均質さ、立場や具体性の欠如が重視される。日本語の公的規範、スライド、検出精度は裏付けが弱い。

## 調査結果

### 1. AI臭さの定義と原因

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 「AI臭さ」の定義 | 公式文書に定義は無い。非公式では次の説明がある。(1) 不要な対比・否定・留保から入り主文を直接書かない、抽象語が多い、短文・対句・名詞化で印象的に見せる。(2) 人間が確かめた形跡が無く「あってしかるべきムラが消えている状態」。同じ癖が別々の書き手の出力に繰り返し出て、読み手は「同じゴーストライター」と感じる | 非公式のみ | 公式サイトからは情報を得られなかった。出典は個人の見解（[Speaker Deck](https://speakerdeck.com/nasuvitz/ai-kusai-bunshou-toha-nanina-no-ka)、[GMO天秤AI](https://tenbin.ai/media/ai_tips/ai-writing-remove-ai-slop)。後者は検索要約のみ）。実験データは示されていない（確からしさ: 中） |
| 原因1: 学習・最適化由来の語彙・構文の偏り | 「delve」など21語が2023〜24年の科学論文アブストラクトで急増した。著者らは学習データ組成とモデル構造を主因から除外し、RLHF の関与を示唆した。PubMed 14M 件の分析では、2024年のアブストラクトの少なくとも10%が LLM 処理と推定された。「Not just X but Y」は人間の約3倍（Pangram 推計）。em ダッシュは1年で応答の10%未満から50%超に上昇した。メカニズムは未決着 | 非公式のみ | 公式サイトからは情報を得られなかった。学術: [arXiv:2412.11385](https://arxiv.org/html/2412.11385v1)、[arXiv:2406.07016](https://arxiv.org/abs/2406.07016v1)。実務者: [Lazovic](https://brandonlazovic.dev/articles/llm-negative-parallelism-tic/)。RLHF 説と学習データ説（Markdown 学習、arXiv:2603.27006 は題名のみ確認）が並立する |
| 原因2: 曖昧な入力で中央値に収束し、両論併記になる | 統計的に最も確からしい続きを出すため、指示が曖昧だと平均的な文になる。否定的フィードバックを避ける RLHF で両論併記になり情報価値が消える。状況の文脈が不足すると中心から外れる手掛かりが無い | 非公式のみ | 公式サイトからは情報を得られなかった。[acntechjp / Zenn](https://zenn.dev/acntechjp/articles/c0591c4a642502)（確からしさ: 中）。なお公式は、曖昧・矛盾した指示が出力を悪化させると述べる（GPT-5 ガイド）。方向は整合 |
| 原因3: 修辞の過剰使用（抑制の欠如） | 並列・対比・三点列挙という古典的修辞を一貫して使うため濫用になる。問題は技術ではなく「taste」の欠如 | 非公式のみ | 公式サイトからは情報を得られなかった。[Dead Language Society](https://www.deadlanguagesociety.com/p/rhetorical-analysis-ai)（確からしさ: 低〜中。修辞学者の分析で実測なし） |
| 原因4: リズム・構造の均質化 | 7モデル×406本の実測で、文長均質の検出率は GPT 系3モデルが88/95/93%、Claude 系が55〜64%。段落構造の均質（約4文/段落）は GPT 系45〜52%、Claude 系0〜17%。英語の学術研究も、語彙多様性と文長分散が小さく文体が均一と報告 | 非公式のみ | 公式サイトからは情報を得られなかった。[coji / Zenn](https://zenn.dev/coji/articles/natural-japanese-ai-smell-lint)、[no1s](https://no1s.biz/blog/9670/)（同日付・同系統で独立性は弱い）。学術 arXiv:2509.10179、2604.14111 は題名と要約のみ確認 |
| 原因5: 内容の空洞化（立場・具体性の欠如） | 表層（記号・語彙・書式）は規則で検出できるが、深層（立場・具体性）は検出しにくい。具体的で珍しい事実が一般的・肯定的な記述に置き換わる。擬人的な主語（「課題が浮き彫りになっている」）や一人称の欠如が典型。Rapls は立場・主体を最重要で直しにくい層とする | 非公式のみ | 公式サイトからは情報を得られなかった。[tabayashi](https://zenn.dev/tabayashi/articles/how-to-deodorize-ai-writing)、[Rapls](https://qiita.com/Rapls/items/b98b09ec57c7e4b7be05)、[Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)。日英の複数ソースが同方向（確からしさ: 中〜高）。数値検証は少ない |
| 原因6: 読み手側の認知バイアス | 「AI製」と知らされるだけで評価が下がる、専門家への期待の裏切り、凡庸な発表を後から AI 製とラベル付けする確証バイアスが、聞く気を失わせる要因とされる | 非公式のみ | 公式サイトからは情報を得られなかった。[Nakashima / note](https://note.com/nakashima_takaya/n/nb3bb5dc261b9)。元の研究は特定されていない（確からしさ: 低） |

### 2. 言語的・構成的特徴（AI臭さのリスト）

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 前置き・定型の予告・定型結び | 公式（Claude ガイド）は「Here is...」「Based on...」で始めず直接答えるよう指示する。日本語の「本記事では〜についてご紹介します」「いかがでしたでしょうか」、英語の「Despite challenges...」型の結びも AI 的特徴に挙がる | 公式 | 非公式が同方向で裏付ける（tabayashi、Wikipedia） |
| 冗長な表現・弱い言い回し | 公式（Microsoft）は余分な語を削り、「in order to」→「to」、「utilize」→「use」とし、「there is / there are」を避ける。非公式は日本語の「することが可能です」（→「できます」）、「これにより」、「〜することができます」を挙げる | 公式 | 非公式が同方向で裏付ける。日本語の個別規範は公式側で取得失敗（文化庁、デジタル庁） |
| 過度な熱意・誇張・埋め草 | 公式（Google）は感嘆符、過剰な熱意、"please note" のような埋め草、不要な丁寧さを避けるとする。非公式は「革命的な」「圧倒的に」などの誇張や、「vibrant」「crucial」「testament」を挙げる | 公式 | 非公式が同方向で裏付ける（tabayashi、Russell ら） |
| 書式の過多（太字・箇条書き・絵文字・見出し） | 公式（Claude / OpenAI）は、散文を基本にし、箇条書きは独立した項目のときだけ使うよう指示する。「NEVER output a series of overly short bullet points.」の例がある。OpenAI は Markdown を意味的に正しい場所（コード、リスト、表）だけに使うとする。非公式は、過剰な太字、絵文字+太字のリスト、見出し付き縦リスト、見出しのコロン多用、`**` の残存を挙げる | 公式 | 非公式が同方向で裏付ける（Wikipedia、Rapls、minorun365）。公式はプロンプト自体の Markdown を減らすと出力の Markdown も減ると述べる |
| 見出しの大文字化 | 公式（Microsoft）は見出しを文頭のみ大文字（sentence-style）とし、末尾に句点・コロンを付けない。非公式（Wikipedia）は Title Case の見出しを AI 兆候に挙げる | 公式 | 非公式が同方向で裏付ける |
| 縮約形・口語の欠如 | 公式（Microsoft）は縮約形（it's, you'll）を使うよう勧める。非公式（Russell ら）は、判定者が根拠にした手掛かりの12.3%が形式性（縮約形・口語の欠如）だったと報告 | 公式 | 非公式が同方向で裏付ける |
| em ダッシュ・全角ダッシュ | 公式（Microsoft）が述べるのは「ダッシュ前後に空白を置かない」まで。AI の特徴かどうかには触れない。非公式は em ダッシュを AI 兆候とし、日本語では全角ダッシュ（——）を挙げる | 非公式のみ | 公式サイトからは AI 的特徴としての記述を得られなかった。Wikipedia、Lazovic、Rapls |
| 「結論から言うと」の定型導入 | 公式（Microsoft）は「結論先行」「Get to the point fast」を勧める。非公式（Rapls）は「結論から言うと」の定型導入を AI 的な語として挙げる | 公式（非公式と相違） | 結論先行そのものは公式どおり採る。非公式では定型句としての「結論から言うと」が AI 臭とされている（[Rapls](https://qiita.com/Rapls/items/b98b09ec57c7e4b7be05)）。字面の反復を避ける必要があるかもしれない |
| 文の長さ | 公式（Microsoft）は「Short sentences and fragments are easier to scan.」と短文を勧める。非公式は文長が均質なことが AI 臭で、15〜60モーラでばらつかせ、同じ長さを3連続させず、ときどき5モーラの断定を入れる対策を挙げる。「短文・対句」で印象を作る点も AI 的とされる | 公式（非公式と相違） | 非公式では「文長を揃えること」自体が AI 的とされている（[coji](https://zenn.dev/coji/articles/natural-japanese-ai-smell-lint)、[no1s](https://no1s.biz/blog/9670/)）。公式は読みやすさの観点で、文長の分散には触れていない |
| 英語の語彙・構文（AI vocabulary） | Additionally、pivotal、underscore、tapestry、delve。単純な is/are を避けて「serves as」「marks」を使う。否定的並列「not just X, but Y」。文末の現在分詞句。曖昧な権威への帰属。具体的な事実の落とし込み | 非公式のみ | 公式サイトからは情報を得られなかった。Wikipedia（約15,000語の大規模コミュニティ文書、公開日不明）と学術 arXiv:2412.11385。確からしさ: 高 |
| 判定者が根拠にした手掛かりの内訳 | 語彙53.1%、文構造35.9%、文法・句読点24.8%（「suspiciously perfect」）、独創性23.7%、引用22.3%、明晰さ19.5%（過剰説明）、形式性12.3%、人名11.7%（Emily Carter 等の反復）、トーン9.3% | 非公式のみ | 公式サイトからは情報を得られなかった。[arXiv:2501.15654](https://arxiv.org/html/2501.15654v1)（学術） |
| 日本語固有の特徴 | 「〜と言えるでしょう」の断定回避、「ケースバイケースです」「一般的には」「一概には言えませんが」の濁し、「以下の3つの観点から説明します」の構造宣言、「ステップ1：」の機械的分割、カタカナ語の多さ、「解像度」「熱量」「羅針盤」などの好まれる語彙、体言止め・太字見出し・コロン見出し | 非公式のみ | 公式サイトからは情報を得られなかった（公的規範の取得に失敗）。tabayashi、Rapls、minorun365。一部は検索要約のみで本文未取得（確からしさ: 低〜中） |
| 過度な敬語 | 公式（Google）の「不要な丁寧さを避ける」は英語の "please" の多用についての記述で、日本語の敬語は対象外。非公式は「過剰な丁寧さを避ける」を対策に挙げる記事を確認したが、実測は無い | 非公式のみ | 公式サイトからは日本語の敬語に関する規範を得られなかった。ai-no-chikara.com の検索要約のみで本文未取得 |
| 「まず／次に／最後に」型の定型 | — | 情報なし | 公式・非公式とも、これを AI 臭の根拠とする記述を本文で確認できなかった。非公式（coji）は「最後に」「まさに」を人間コーパス48回 vs AI 2回と、むしろ人間側の語としている |
| 三点列挙の頻度・日本語「AではなくB」の定量 | — | 情報なし | 公式の指摘は無い。非公式で数値があるのは「Not just X but Y」（人間の約3倍）のみ。三点列挙と日本語の対比構文の実測は見つからなかった |

### 3. 対策

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 書式・前置き・冗長さの制御 | 「何をしないか」ではなく「何をするか」を伝える（例: "Your response should be composed of smoothly flowing prose paragraphs."）。前置きを排除する指示を入れる。Claude Opus 5 は既定で長くなり、effort を変えても長さが安定しないため、簡潔さは明示的に指示する。OpenAI は verbosity パラメータで最終回答の長さを制御する | 公式 | 非公式も「既定パターンを明示的に禁止する」を勧める（acntechjp、tabayashi） |
| 口調・構成の誘導（例示・役割設定） | Few-shot 例は出力の形式・口調・構成を誘導する最も確実な方法の一つ。役割設定は口調を絞る。OpenAI は `instructions` に tone・goals・examples を置き、Identity / Instructions / Examples / Context で構成する | 公式 | 非公式も「自分の文章サンプルを2〜3本渡す」「文体サンプルを渡す」と同方向（tabayashi、acntechjp） |
| 指示の書き方の注意 | 矛盾・曖昧な指示は GPT-5 でより有害。「Be THOROUGH」のような強調語は過剰動作を招いた。長い会話では3〜5メッセージごとに再掲しないと遵守が落ちる | 公式 | 非公式に直接の対応記述は無い |
| 口調の基準 | Google は「knowledgeable friend」のような会話的で友好的な口調を勧め、声に出して読んで自然に流れるか確かめるよう求める。Microsoft は簡単な語、短い文、結論先行を勧める | 公式 | 日本語向けの公式規範は取得できていない |
| 対象読者に合わせ、理解度を試す | 米国政府のプレーンランゲージは対象読者ごとに書き、理解度をテストするとする。個別の規則は概要ページのみで取得できていない | 公式 | 非公式は「AI を使ったタスクと検証方法を開示する」を挙げる（Nakashima。検索要約のみ） |
| 優先順位と具体策 | 1 立場（1セクションに検証可能な主張を1つ）、2 リズム、3 語彙（定型句と誇張の置換）、4 記号（em ダッシュ・コロン・太字の削減）の順。生成前に禁止事項を列挙し、一発生成を避けて構成→下書き→レビューに分ける。入力側の7策（切り口と制約、文体サンプル、既定パターンの禁止、状況の詳細、出力前の質問、段階的な人の介入、具体基準での自己評価） | 非公式のみ | 公式サイトからは情報を得られなかった。tabayashi、acntechjp。全て自己申告の実践記録で、比較実験は coji の5サンプルのブラインドテスト（5/5改善、著者自身が暫定と認める）のみ（確からしさ: 中） |
| 採点・リント | 5軸（立場・主体・具体性・リズム・削減）で採点し、35/50未満は書き直す。文長の変動係数 CV ≥ 0.4 を目標とする（tabayashi は CV < 0.50 を AI 的とする）。パターンを S/A/B の確信度で扱う。リント結果は提案として扱い、エージェントが理由付きで採否を判断する | 非公式のみ | 公式サイトからは情報を得られなかった。Rapls、coji、tabayashi。閾値は個人の自前コーパスによる実測で、査読は無い。CV の目標値も記事間で一致しない（0.4 / 0.50） |
| 編集の方針 | 句読点を別の記号に置換するだけでは別の癖になる（em ダッシュ→セミコロン）。文構造を組み替え、冒頭の宣言的な足場と偽の確信を取り除く。直した結果の新しい型（体言止めの連続、「正直」の反復、「〜のだ」の増殖）を検査する | 非公式のみ | 公式サイトからは情報を得られなかった。Lazovic、Rapls |

### 4. 限界・副作用・検出

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| 検出ツールの精度と偏り | 検出器は非ネイティブの英語文を AI と誤判定する（TOEFL エッセイの平均誤検出率61.3%、ある検出器は97.8%を AI 判定）。言語多様性を高めると平均誤検出率が49.45%低下する。検出器の TPR は Pangram Humanizers 99.3%、Pangram 98.0%、GPTZero 85.3%、Fast-DetectGPT 80.0%、Binoculars 66.7%、RADAR 15.3% | 非公式のみ | 公式サイトからは検出ツールに関する情報を得られなかった。学術: [arXiv:2304.02819](https://arxiv.org/abs/2304.02819)、[arXiv:2501.15654](https://arxiv.org/html/2501.15654v1)。日本語環境の独立評価は見つからなかった |
| 人間による判別 | LLM を頻繁に使う5人の多数決は300本中299本を正しく分類した（TPR 99.3%）。個人平均は TPR 92.7%・FPR 3.3%。一般の判定者は TPR 56.7%・FPR 51.7%。o1-Pro に手掛かりを渡して「人間化」させても多数決は完全正解で、専門家は「AI clues still remain after humanization」と述べた | 非公式のみ | 公式サイトからは情報を得られなかった。[arXiv:2501.15654](https://arxiv.org/html/2501.15654v1)。読み手の経験で見え方が大きく変わる。Wikipedia は人間の識別を「no better than random chance」とする（Appendix C） |
| 過剰補正の副作用 | 「消すべき」とされるパターンを機械的に避けると、かえって AI 的になりうる。日本語の実測では、体言止めは人間60% vs AI 0%、文頭反復は人間93% vs AI 41%、「最後に」「まさに」は人間48回 vs AI 2回。検出への警戒が em ダッシュ・セミコロン・特定語彙の自己検閲を生み、文体が均質化する | 非公式のみ | 公式サイトからは情報を得られなかった。coji（実測は1件で、人間コーパスの不均質、較正と評価に同一データを使う循環、Goodhart の法則を著者自身が限界とする。確からしさ: 低〜中）、[Armstrong / Substack](https://writerswithoutwalls.substack.com/p/when-ai-detection-paranoia-kills)（数字は著者が引いたもので一次資料は未確認） |
| 直せない臭さ | 書き手に「自分が言いたいこと」が無ければ技法では防げない。立場・主体（Layer 0）は人間の判断が必須。深層（立場・具体性）は機械的に検出しにくい。スクリプトは文字列パターンの計数のみで、意図的な例示と本当の使用を区別できない。数値は修正前後の比較用で絶対目標ではない | 非公式のみ | 公式サイトからは情報を得られなかった。acntechjp、Rapls、tabayashi。公式（OpenAI）も、プロンプトの出来が出力を左右し、矛盾指示が害になると述べる点で部分的に整合 |
| 公式側が示す制御の限界 | 長さは effort では安定せず明示指示が要る。長い会話では指示の遵守が落ちる。強調語は過剰動作を招く | 公式 | 非公式に対応記述は無い |

### 5. スライド資料

| 項目 | 結論 | 出典区分 | 備考 |
| --- | --- | --- | --- |
| スライド特有の臭さ | 公式にスライド専用の規範は無い。非公式では次が挙がる。(1) 要素間のコントラストが弱い。(2) 文字が過多（AI は情報を足すのが得意で削るのが苦手）。(3) 情報の重みが均一で、フォントサイズに階層が無い。(4) 同じ三分割の配置、内容と無関係な装飾（3Dイラスト、汎用ストック画像、過度なグラデーション）。(5) 説明の無い抽象概念、出所不明の図表や統計。(6) 内容の複雑さに関係なく1枚3項目の箇条書き。(7) タイトルが結論ではなく説明的ラベル | 非公式のみ | 公式サイトからは情報を得られなかった。日本語は [モア / note](https://note.com/more_sunset/n/n11987c6eece0)（Claude 生成スライド1件の観察）と Nakashima。英語は [llemental](https://llemental.com/posts/why-ai-presentations-look-ai-generated)、[Plus AI](https://plusai.com/blog/how-to-make-ai-slides-that-dont-look-like-ai-slop/) などのベンダーブログ（自社製品の宣伝を兼ねる）。確からしさ: 中。学術文献は見つからず、読み手による AI 製スライド判別の実験も無い |
| スライドの対策 | プロンプトの前に、スライドごとの1文のコアメッセージと実データを用意する。禁止リストを渡す。既存テンプレート内で生成する。コントラストと文字量、フォントの階層を手直しする | 非公式のみ | 公式サイトからは情報を得られなかった。ベンダーブログ中心。クリーム背景、イタリック serif、eyebrow ラベルなどは2026年時点の特定ツールの既定値で陳腐化しやすい |
| 「AIは『A。B』と句点で切る形式が67%、判断を持つ見出しは7%」 | — | 情報なし | 検索要約中の数値で出典記事を特定できておらず、引用・再利用してはならない |

## Appendix

### A. 調査の詳細

#### A-1. 調査範囲と限界

- 公式側: Anthropic、OpenAI、Google、Microsoft、digital.gov の文書。公式文書は「AI臭さ」という語を使わない。得られたのは「読みやすい文章の規範」と「LLM の出力スタイルを制御する方法」の2系統。
- 公式側で取得に失敗: 文化庁「公用文作成の考え方」（PDF のテキスト抽出不可）、デジタル庁コンテンツガイド（404）、Google style guide の clarity ページ（404）。digital.gov / plainlanguage.gov は概要のみ。したがって日本語の公的規範は本レポートの公式側に含まれない。
- 非公式側: WebFetch の要約に基づくもので、原文の一次確認はしていない。ベンダーブログは宣伝を兼ねる。日本語の定量データは個人ブログの自前コーパスで査読が無い。公開日は要約中の値で再確認していない。
- 非公式側で本文未取得のため引用できないもの: GMO天秤AIメディア、AI Trends（相武AI）、ai-no-chikara.com、ai-souken.com、AIX Camp、arXiv:2603.27006 / 2509.10179 / 2604.14111 / 2608.26710 / 2607.14729、Wikipedia の各紹介記事（FastCompany、MakeUseOf）、Hacker News スレッド、Tom's Guide。
- 本レポートは突き合わせの結果であり、指示プロンプトの全文や原因・対策の対応表、トレーサビリティ表は含まない。入力2ファイルに無い内容は書いていない。

#### A-2. 公式が述べたこと（要点）

- Claude: 書式は「何をするか」で指示する。流れる散文を基本とし、箇条書きは独立項目のときだけ使う。前置きを排除する。例示と役割設定は口調・構成を強く誘導する。Opus 5 は既定で長くなりやすく、簡潔さは明示指示が必要。
- OpenAI: `instructions` で口調を与える。GPT-5 は verbosity パラメータで長さを制御する。Markdown は意味的に正しい場所だけで使う。矛盾指示は GPT-5 でより有害。
- Google: 友人のような会話的な口調。形式ばった言い回し、流行語、感嘆符、埋め草、過剰な丁寧さを避ける。声に出して読む。
- Microsoft: 結論先行、余分な語を削る、簡単な語、弱い言い回しを避ける、縮約形、同じ概念には同じ用語、見出しは文頭のみ大文字。
- digital.gov: 対象読者に合わせて書き、理解度をテストする。

#### A-3. 非公式が述べたこと（要点）

- 語彙の偏りは学術的に実証されている（arXiv:2412.11385、2406.07016）。メカニズム（RLHF かデータか）は未決着。
- 日本語では語彙よりリズム（文長・段落構造の均質）が目立つとする実測がある（coji、no1s）。モデル依存があり、GPT 系で顕著、Claude 系は低い。coji と no1s は同日付・同系統で独立性が弱い。
- 深層（立場・具体性）が本質で、表層の記号除去だけでは足りないとする記事が多い。
- 検出ツールには言語背景による偏りがあり、日本語環境の独立評価は無い。

#### A-4. バージョン・時点依存

- 公式の Claude Opus 5 に関する記述（長さが effort で安定しない）は、そのモデル世代の記述。
- Wikipedia は AI の文体が時間とともに変化するとし、最終更新日は不明。coji はモデル間で癖が異なることを示す。「どの癖が目立つか」は世代で変わる可能性があるが、この解釈は出典の記述の延長で未確認。
- スライドの視覚的特徴（クリーム背景、イタリック serif）は2026年時点の特定ツールの既定値。

### B. 出典

#### 公式
- [Prompting best practices | Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — 取得日 2026-10-05 — 書式制御、前置き排除、散文指示、例示・役割設定、Opus 5 の長さの傾向
- [Prompt engineering | OpenAI](https://developers.openai.com/api/docs/guides/prompt-engineering) — 取得日 2026-10-05 — instructions による口調指定、開発者メッセージの構成
- [GPT-5 prompting guide | OpenAI Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) — 取得日 2026-10-05 — verbosity、Markdown の使い方、矛盾指示の害、強調語の副作用
- [Tone and content | Google developer documentation style guide](https://developers.google.com/style/tone) — 取得日 2026-10-05 — 会話的口調、避ける表現、声に出して読む
- [Brand voice: simple and human | Microsoft](https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human) — 取得日 2026-10-05 — 結論先行、余分な語の削減
- [Top 10 tips for Microsoft style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice) — 取得日 2026-10-05 — 縮約形、見出し、ダッシュ
- [Use simple words, concise sentences | Microsoft](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences) — 取得日 2026-10-05 — 言い換え例、不要な副詞の削除
- [Plain language guide | digital.gov](https://digital.gov/guides/plain-language) — 取得日 2026-10-05 — 対象読者に合わせる原則（概要のみ）

#### 非公式
- [AI臭い文章とは何なのか](https://speakerdeck.com/nasuvitz/ai-kusai-bunshou-toha-nanina-no-ka) — Kiminori Yokoi / Speaker Deck — 公開日 2026-09-28 — 取得日 2026-10-05 — 確からしさ: 中 — AI臭さの定義
- [AIくささを消す](https://tenbin.ai/media/ai_tips/ai-writing-remove-ai-slop) — GMO天秤AIメディア — 公開日不明 — 取得日 2026-10-05 — 確からしさ: 低（検索要約のみ） — 「確かめた形跡のなさ」
- [「AIっぽい」スライドを見ると、なぜ聞く気がなくなるのか](https://note.com/nakashima_takaya/n/nb3bb5dc261b9) — Nakashima Takaya / note — 公開日 2026-09-22 — 取得日 2026-10-05 — 確からしさ: 中（認知バイアスの項は低） — 読み手の要因、スライドの特徴
- [Why Does ChatGPT "Delve" So Much?](https://arxiv.org/html/2412.11385v1) — arXiv:2412.11385（学術） — 公開日 2024-12頃 — 取得日 2026-10-05 — 確からしさ: 高 — 語彙の急増、RLHF 示唆
- [Delving into ChatGPT usage in academic writing through excess vocabulary](https://arxiv.org/abs/2406.07016v1) — Kobak ほか / arXiv（学術） — 公開日 2024-06頃 — 取得日 2026-10-05 — 確からしさ: 高 — 2024年アブストラクトの10%以上が LLM 処理
- [Why AI Keeps Writing 'Not X, But Y'](https://brandonlazovic.dev/articles/llm-negative-parallelism-tic/) — Brandon Lazovic — 公開日 2026-07-21 — 取得日 2026-10-05 — 確からしさ: 中 — 否定的並列、em ダッシュの数値、原因説、編集方針
- [「AI臭い」と言われるけど、AIだし、どうすりゃいいんだよ](https://zenn.dev/acntechjp/articles/c0591c4a642502) — acntechjp / Zenn — 公開日 2026-04-06 — 取得日 2026-10-05 — 確からしさ: 中 — 原因3つ、入力側の7策
- [Why ChatGPT writes like that](https://www.deadlanguagesociety.com/p/rhetorical-analysis-ai) — Colin Gorrie / Substack — 公開日 2025-07-09 — 取得日 2026-10-05 — 確からしさ: 低〜中 — 修辞の濫用
- [AI臭は語彙よりリズムに出る](https://zenn.dev/coji/articles/natural-japanese-ai-smell-lint) — coji / Zenn — 公開日 2026-07-13 — 取得日 2026-10-05 — 確からしさ: 中（実測は自前コーパスで1件） — リズムの実測、過剰補正の実測
- [AI臭はモデルの質ではなくリズムだった？](https://no1s.biz/blog/9670/) — ナンバーワンソリューションズ — 公開日 2026-07-13 — 取得日 2026-10-05 — 確からしさ: 中 — 文長均質率、リズム指示
- [ドキュメントのAI臭を消す方法](https://zenn.dev/tabayashi/articles/how-to-deodorize-ai-writing) — tabayashi / Zenn — 公開日 2026-08-27 — 取得日 2026-10-05 — 確からしさ: 中 — 二層構造、日本語の特徴、対策の優先順位
- [AIが書いた日本語から「AI臭さ」を消すスキルと、採点スクリプトを公開します](https://qiita.com/Rapls/items/b98b09ec57c7e4b7be05) — Rapls / Qiita — 公開日 2026-08-24 — 取得日 2026-10-05 — 確からしさ: 中 — Layer 0、採点基準、スクリプトの限界
- [ペロッ…これはAI生成記事！ 見分け方のコツ](https://qiita.com/minorun365/items/68740e4ba1d81177199b) — minorun365 / Qiita — 公開日 2025-04-23 — 取得日 2026-10-05 — 確からしさ: 中 — 日本語の特徴、英語圏の影響という見方
- [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) — Wikipedia（コミュニティ文書） — 公開日不明（継続更新） — 取得日 2026-10-05 — 確からしさ: 中〜高 — 英語の特徴リスト、検出の限界
- [People who frequently use ChatGPT for writing tasks are accurate and robust detectors of AI-generated text](https://arxiv.org/html/2501.15654v1) — Russell, Karpinska, Iyyer / arXiv:2501.15654（学術） — 公開日 2025-01 — 取得日 2026-10-05 — 確からしさ: 高 — 手掛かりの内訳、判別精度、検出器の TPR
- [GPT detectors are biased against non-native English writers](https://arxiv.org/abs/2304.02819) — Liang ほか / arXiv:2304.02819（学術） — 公開日 2023-04-06 — 取得日 2026-10-05 — 確からしさ: 高 — 検出器の偏り
- [When AI Detection Paranoia Kills Creativity](https://writerswithoutwalls.substack.com/p/when-ai-detection-paranoia-kills) — James Armstrong / Substack — 公開日 2025-07-02 — 取得日 2026-10-05 — 確からしさ: 低〜中 — 過剰補正（数字の一次資料は未確認）
- [AIスライドを手直しして「なんかAIっぽい」の原因を探ってみた](https://note.com/more_sunset/n/n11987c6eece0) — モア / note — 公開日 2026-04-16 — 取得日 2026-10-05 — 確からしさ: 中（生成1件の観察） — スライドの3要因
- [Why AI Presentations Look AI-Generated (And How to Fix It)](https://llemental.com/posts/why-ai-presentations-look-ai-generated) — llemental（ベンダー） — 公開日 2025-11-15 — 取得日 2026-10-05 — 確からしさ: 低〜中 — スライドの特徴（「40%」の根拠は示されていない）
- [How to Make AI-Generated Slides That Don't Look Like AI Slop](https://plusai.com/blog/how-to-make-ai-slides-that-dont-look-like-ai-slop/) — Plus AI（ベンダー） — 公開日 2026-07-15 — 取得日 2026-10-05 — 確からしさ: 低〜中 — スライドの特徴と対策
- [chatslide.ai](https://www.chatslide.ai/guides/how-to-make-ai-slides-not-look-ai-generated)、[2slides.com](https://2slides.com/blog/why-ai-slides-look-fake-and-how-to-fix)、[presentations.ai](https://www.presentations.ai/blog/common-ai-presentation-mistakes) — 各ベンダー — 公開日不明 — 取得日 2026-10-05 — 確からしさ: 低（検索要約のみ） — スライドの特徴の補強
- arXiv:2603.27006（Markdown 学習の影響）、2509.10179、2604.14111（文体の均一性）、2608.26710、2607.14729（検出の誤判定） — 学術 — 取得日 2026-10-05 — 確からしさ: 低（題名と検索要約のみ。本文未取得のため結論の根拠には使っていない）

### C. 突き合わせで判明した相違

#### C-1. 公式と非公式の相違

| 論点 | 公式 | 非公式 | 扱い |
| --- | --- | --- | --- |
| 結論先行 vs「結論から言うと」 | Microsoft は結論先行（Start with the key takeaway）を勧める | Rapls は「結論から言うと」を AI 的な定型導入として挙げる | 公式を採用。ただし定型句の反復は避けるべき可能性がある |
| 短文 vs 文長の均質 | Microsoft は短い文・断片が読みやすいとする | coji・no1s は文長の均質さが AI 臭で、ばらつかせるべきとする | 公式を採用。ただし公式は文長の分散に触れておらず、直接の矛盾ではない可能性が高い。公式どおりに短文を揃えると非公式の指摘に当たりうる |

#### C-2. 非公式ソース間の相違（公式との相違ではない）

- 人間の判別力: Wikipedia は人間の識別を「no better than random chance」とする。Russell らは、LLM 常用者の多数決は299/300、一般の判定者は TPR 56.7% / FPR 51.7% とする。判定者の経験の違いで説明がつく。
- 語彙かリズムか: Wikipedia・Russell らは語彙（53.1%が最多）を主な手掛かりとし、coji・no1s は「語彙ではなくリズム」とする。モデル世代で目立つ癖が異なる可能性はあるが、未確認。
- 「消すべき」パターンの扱い: 多くの記事は体言止めや「最後に」を AI 的とみなすが、coji の実測では体言止めは人間60% vs AI 0%、「最後に」「まさに」は人間側の語。minorun365 は体言止めを AI の特徴とし、coji と逆方向。
- 原因（RLHF かデータか）: arXiv:2412.11385 は RLHF を有力視して学習データを主因から除外し、Lazovic は em ダッシュがベースモデルにも既にあるとする研究と RLHF 説を並べて未決着とする。Markdown 学習データ説（arXiv:2603.27006、題名のみ確認）とも食い違う。
- AI臭の層: tabayashi・Rapls・acntechjp は立場・具体性（深層）が本質で記号除去は表層とし、Lazovic は記号の置換は無意味とする。検出器の研究は表層の規則性に依存し、言語多様性を上げれば回避できる（Liang ら）。対策の力点が分かれる。
- CV の目標値: Rapls は CV ≥ 0.4 を目標、tabayashi は CV < 0.50 を AI 的とする。
