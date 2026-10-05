# 非公式ソース調査結果

取得日はすべて 2026-10-05。種別は「学術」(arXiv 論文など) / 「実務者・その他」(個人ブログ、Zenn/Qiita/note、ベンダーブログ、Wikipedia、スライド)。
公開日は WebFetch が返した要約中の値で、原文での再確認はしていない。

## 調査した範囲と限界

- 検索した範囲は、Wikipedia の Signs of AI writing、日本語の Zenn / Qiita / note / Speaker Deck、arXiv 論文、スライド生成ツール各社のブログ、検出ツールの誤検出に関する論文とブログ。公式ドキュメントは開いていない。
- 限界1: WebFetch は小型モデルによる要約を返すため、「原文のまま」の引用は要約中に括弧付きで出ていたものに限る。他は要約の言い換えで、一次確認はしていない。
- 限界2: Wikipedia のページは最終更新日を取得できなかった。公開日不明。
- 限界3: スライド系の英語記事 (Plus AI など) は自社製品の宣伝を兼ねたベンダーブログ。確からしさは割り引く。
- 限界4: 日本語の定量データ (モーラ長、CV 閾値など) は個人ブログの自前コーパスによる実測で、査読はない。
- 限界5: 検索結果に出たが開いていない記事がある。確認できていない主張は末尾に分けて書いた。
- 限界6: 日本語のスライド固有の分析は note 記事が中心で、学術文献は見つからなかった。

## 見つかったこと

### 論点1: AI臭さの定義と、読み手が嫌がる理由

- **主張A**: AI臭い文章とは「不要な対比・否定・留保から入り、主文を直接書かない」「抽象語や比喩的な動詞を多用し何をするのかが曖昧」「短文・対句・不自然な読点・名詞化で内容以上に印象的に見せる」文章。別々の書き手が編集せずに出力すると同じ癖が繰り返し現れる。読み手は「同じゴーストライターを使っている」印象を受け、本人の判断や真正性に疑問を持つ。
  - 出典: [AI臭い文章とは何なのか](https://speakerdeck.com/nasuvitz/ai-kusai-bunshou-toha-nanina-no-ka) — Kiminori Yokoi (@nasuvitz) / Speaker Deck — 公開日 2026-09-28 — 種別: 実務者・その他
- **主張B**: AI臭さは文体の問題ではなく「人間が確かめた形跡のなさ」のサイン。AI臭とは「あってしかるべきムラが消えている状態」。
  - 出典: [AIくささを消す — AI生成文を「自分の文章」に変える実践ルール](https://tenbin.ai/media/ai_tips/ai-writing-remove-ai-slop) — GMO天秤AIメディア — 公開日不明 — 種別: 実務者・その他。検索結果の要約のみで本文は未取得。
- **主張C**: 「AI」と知らされるだけで評価が下がる認知バイアス、専門家への期待が裏切られること、凡庸な発表を後から「AI製」とラベル付けする確証バイアスの3点が、聞く気を失わせる要因。
  - 出典: [「AIっぽい」スライドを見ると、なぜ聞く気がなくなるのか](https://note.com/nakashima_takaya/n/nb3bb5dc261b9) — Nakashima Takaya / note — 公開日 2026-09-22 — 種別: 実務者・その他
- **確からしさ**: 中。主張A・C は個人の見解で、実験データは示されていない。主張B は複数の Zenn 記事 (論点3 の A・B) とも方向が一致するが、それぞれ独立した実測ではない。
- **公式と食い違う可能性**: 不明。

### 論点2: 原因の分類

#### 2-1 学習・最適化に由来する原因
- **主張**: 「delve」など21語が2023〜24年に科学論文アブストラクトで急増した。著者らは7つの仮説を検討し、学習データ組成とモデル構造は主因から除外した。RLHF が関与する可能性を示唆した。人間の選好調査では、アブストラクト冒頭の「delve」に評価者が警戒を示した。
  - 出典: [Why Does ChatGPT "Delve" So Much? Exploring the Sources of Lexical Overrepresentation in Large Language Models](https://arxiv.org/html/2412.11385v1) — arXiv:2412.11385 — 公開日 2024-12 頃 (v1 の日付は未確認) — 種別: 学術
- **主張**: 14M 件の PubMed アブストラクト (2010–2024) の語彙変化から「少なくとも2024年のアブストラクトの10%が LLM で処理された」と推定。LLM の登場は「Covid パンデミックを上回る」語彙への影響を与えた。
  - 出典: [Delving into ChatGPT usage in academic writing through excess vocabulary](https://arxiv.org/abs/2406.07016v1) — Kobak ほか / arXiv:2406.07016 — 公開日 2024-06 頃 — 種別: 学術
- **主張**: 「Not just X but Y」型は AI 文で人間の約3倍 (Pangram 推計)。Washington Post の328,744件の ChatGPT メッセージ分析では2025年7月のチャットの6%に出現し、em ダッシュ使用は1年で応答の10%未満から50%超に上昇。原因の説は分かれる。(a) RLHF による出力多様性の低下 (Kirk ら)、(b) 学習データ説 (19世紀の電子化テキスト、Markdown 多用の技術文書)、(c) 否定から入る方が統計的に安全、評価者が「考えている風」に報酬を与えた、AI 生成文での再学習。記事は「em ダッシュ傾向は RLHF 前のベースモデルにも既にある」とする研究にも言及する。
  - 出典: [Why AI Keeps Writing 'Not X, But Y'](https://brandonlazovic.dev/articles/llm-negative-parallelism-tic/) — Brandon Lazovic — 公開日 2026-07-21 — 種別: 実務者・その他
  - 補強: [The Last Fingerprint: How Markdown Training Shapes LLM Prose](https://arxiv.org/pdf/2603.27006) — arXiv:2603.27006 — 公開日 2026-03 頃 — 種別: 学術。検索結果で題名のみ確認。本文は未取得。
- **主張**: 原因は3つ。(1) 統計的に最も確からしい続きを出すため、指示が曖昧だと中央値に収束する。(2) 否定的フィードバックを避ける RLHF により「両論併記」になり情報価値が消える。(3) 状況の文脈が不足していると中心から外れる手掛かりが無い。「LLM は増幅器であり、入力に中身がなければノイズを増幅する」。
  - 出典: [「AI臭い」と言われるけど、AIだし、どうすりゃいいんだよ――Claudeが自分で調べて、考えてみた](https://zenn.dev/acntechjp/articles/c0591c4a642502) — acntechjp / Zenn — 公開日 2026-04-06 — 種別: 実務者・その他
- **確からしさ**: 中。学術2件は語彙の急増を実証している。メカニズム (RLHF かデータか) は文献間で未決着で、論点10に記載する。

#### 2-2 修辞の過剰使用 (技術ではなく「抑制の欠如」)
- **主張**: LLM は並列・対比・三点列挙という古典的修辞を使う。問題は使うことではなく「ロボットのように一貫して使うため濫用になる」こと。「What the LLM lacks is not technical ability, but taste.」「An LLM writes like someone who has just learned about all these sophisticated rhetorical devices and can't wait to use them at every possible opportunity.」
  - 出典: [Why ChatGPT writes like that](https://www.deadlanguagesociety.com/p/rhetorical-analysis-ai) — Colin Gorrie / Dead Language Society (Substack) — 公開日 2025-07-09 — 種別: 実務者・その他
- **確からしさ**: 低〜中。修辞学者の分析で、実測はない。三点列挙が多い理由を「人間も三点を好むから」とする別記事が検索結果に出ている (未取得)。

#### 2-3 リズム・構造の均質化
- **主張**: AI臭は語彙よりリズムに出る。7モデルのうち GPT 系3モデルは文長均質の検出率が88/95/93%、Claude 系は55〜64%。段落構造の均質 (約4文/段落) は GPT 系で45〜52%、Claude 系は0〜17%。
  - 出典: [AI臭は語彙よりリズムに出る - 自然な日本語を書くAgent Skillと7モデル×406本の実測](https://zenn.dev/coji/articles/natural-japanese-ai-smell-lint) — coji / Zenn — 公開日 2026-07-13 — 種別: 実務者・その他。コーパスはAI生成406本、人間137本。
  - 同趣旨: [AI臭はモデルの質ではなくリズムだった？](https://no1s.biz/blog/9670/) — ナンバーワンソリューションズ — 公開日 2026-07-13 — 種別: 実務者・その他。「文長が均質になる」ことが機械的な印象を生むと主張。low_burstiness と low_sentence_variance の指標を使い、均質率は88〜95%。
  - 英語圏の学術側: LLM の出力は語彙多様性と文長の分散が小さく、テキスト全体で文体が均一。出典: [Benchmark of stylistic variation in LLM-generated texts](https://arxiv.org/pdf/2509.10179) (arXiv:2509.10179、題名と検索要約のみ確認) / [Interpretable Stylistic Variation in Human and LLM Writing](https://arxiv.org/html/2604.14111v1) (arXiv:2604.14111、同上) — 種別: 学術。
- **確からしさ**: 中。日本語2記事は同日付で同系統の測定を扱い、独立性は弱い。英語の学術の方向とは一致する。

#### 2-4 内容の空洞化 (具体性・立場の欠如)
- **主張**: AI臭には2層ある。表層 (記号・語彙・書式) は規則で検出できる。深層 (立場・具体性) は機械的に検出しにくい。LLM は「流暢だが何も残らない」文を出し、論争的な主張や検証可能な主張を避け、両論併記に寄る。
  - 出典: [ドキュメントのAI臭を消す方法](https://zenn.dev/tabayashi/articles/how-to-deodorize-ai-writing) — tabayashi / Zenn — 公開日 2026-08-27 — 種別: 実務者・その他
- **主張**: 最重要で直しにくいのは Layer 0 (立場・主体)。例は擬人的な主語 (「課題が浮き彫りになっている」)、一人称の欠如 (「多くの人が」)。
  - 出典: [AIが書いた日本語から「AI臭さ」を消すスキルと、採点スクリプトを公開します](https://qiita.com/Rapls/items/b98b09ec57c7e4b7be05) — Rapls / Qiita — 公開日 2026-08-24 — 種別: 実務者・その他
- **主張 (英語)**: Wikipedia の AI 兆候ページは、LLM が具体的で珍しい事実を落として一般的で肯定的な記述に置き換えること、文末に現在分詞句を付けた浅い分析、曖昧な権威への帰属 (weasel wording) を挙げる。
  - 出典: [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) — Wikipedia — 公開日不明 (継続更新) — 種別: 実務者・その他 (コミュニティ文書)
- **確からしさ**: 中〜高。日英の独立した複数ソースが同じ方向を述べている。ただし数値による検証は少ない。

### 論点3: 言語的・構成的特徴のリスト

- **主張 (英語、Wikipedia)**: 「AI vocabulary」(Additionally, pivotal, underscore, tapestry, delve)。単純な is/are を避け「serves as」「marks」「features」を使う。否定的並列「not just X, but Y」「not X, but Y」。過剰な太字と em ダッシュ。見出しの Title Case。絵文字の書式利用。レベル1見出しの乱用と見出しレベル飛び。見出し付き縦リスト。「Despite challenges...」型の定型結び。引用の痕跡 (「oaicite」「[cite: 1]」)。
  - 出典: [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) — 公開日不明 — 種別: 実務者・その他。ページは約15,000語と紹介されている (FastCompany の紹介記事より)。
- **主張 (英語、人間の判別根拠)**: 頻繁に LLM を使う5人の判定者が根拠にした手掛かりの内訳。語彙 53.1% (「vibrant」「crucial」「testament」)、文構造 35.9% (予測可能なパターン、一定の文長、反復構文)、文法・句読点 24.8% (「suspiciously perfect」。人間はダッシュや省略記号を使う)、独創性 23.7%、引用 22.3% (会話的でない整った引用)、明晰さ 19.5% (過剰説明)、形式性 12.3% (縮約形・口語の欠如)、人名 11.7% (Emily Carter, Sarah Thompson の反復)、トーン 9.3% (一貫して中立か肯定)。
  - 出典: [People who frequently use ChatGPT for writing tasks are accurate and robust detectors of AI-generated text](https://arxiv.org/html/2501.15654v1) — Russell, Karpinska, Iyyer / arXiv:2501.15654 — 公開日 2025-01 — 種別: 学術
- **主張 (日本語)**:
  - 定型の予告: 「本記事では〜についてご紹介します」。冗長表現: 「することが可能です」(→「できます」)。誇張: 「革命的な」「圧倒的に」。絵文字+太字のリスト (✅ メリット)。断定回避: 「〜と言えるでしょう」。「いかがでしたでしょうか」も挙げられている。出典: [ドキュメントのAI臭を消す方法](https://zenn.dev/tabayashi/articles/how-to-deodorize-ai-writing) (2026-08-27)。
  - 全角ダッシュ (——)、「ラベル: 内容」形式、絵文字箇条書き、「これにより」「〜することができます」、好まれる語彙 (「解像度」「熱量」「羅針盤」)、「結論から言うと」の定型導入、命令形の見出し。出典: [Qiita: Rapls](https://qiita.com/Rapls/items/b98b09ec57c7e4b7be05) (2026-08-24)。
  - 箇条書きと太字見出しの多用、見出しのコロン多用、体言止め。著者は後2者を「英語圏のライティング文化の影響」「英語表現に引っ張られている」と解釈。コピペ時に `**` が残る記事も多い。出典: [ペロッ…これはAI生成記事！ 見分け方のコツ](https://qiita.com/minorun365/items/68740e4ba1d81177199b) — minorun365 / Qiita — 公開日 2025-04-23。
  - 「ケースバイケースです」「状況によります」で結論を濁す、「一概には言えませんが」「一般的には」の枕詞、「以下の3つの観点から説明します」といった構造の宣言、「ステップ1：」の機械的な分割、カタカナ語の多さ、語句の反復。出典: 検索結果の要約 (AI Trends by 相武AI、ai-souken.com 等の記事を引用した要約。本文は未取得)。種別: 実務者・その他。
  - 「まず/次に/最後に」型の定型: これを AI 臭の根拠とする記事は、今回の調査では本文で確認できなかった。次項の「食い違い」を参照。
- **確からしさ**: 英語の語彙・書式は高 (学術+複数の実務記事が一致)。日本語の個別項目は中 (複数の個人ブログが似た項目を挙げるが、検証の厳密さは記事ごとに異なる)。
- **公式と食い違う可能性**: 不明。

### 論点4: 原因ごとの対策

- **主張 (優先順位)**: 1 立場 (1セクションに検証可能な主張を1つ)、2 リズム (文・段落長を意図的にばらす)、3 語彙 (定型句と誇張の置換)、4 記号 (em ダッシュ・コロン・太字の削減)。予防プロンプトは、生成前に禁止事項を列挙する、自分の文章サンプルを2〜3本渡す、`.claude/skills/` や `CLAUDE.md` にガイドラインを置く、一発生成を避けて構成→下書き→レビューに分ける。textlint プリセットは書式・絵文字・冗長を捕まえるが、「いかがでしたでしょうか」のような定型句は検出漏れ。
  - 出典: [ドキュメントのAI臭を消す方法](https://zenn.dev/tabayashi/articles/how-to-deodorize-ai-writing) — 2026-08-27 — 種別: 実務者・その他
- **主張 (入力側の7策)**: 広いテーマではなく切り口と制約を与える、文体サンプルを渡す、既定パターンを明示的に禁止する、状況の詳細を共有する、出力前に質問させる、段階に分けて人が介入する、具体的基準での自己評価を求める。
  - 出典: [acntechjp / Zenn](https://zenn.dev/acntechjp/articles/c0591c4a642502) — 2026-04-06 — 種別: 実務者・その他
- **主張 (リズム指示)**: 文長を15〜60モーラの間でばらつかせ、ときどき5モーラの断定を入れる。同じ長さの文を3つ連続させない。体言止めなどの修辞は1文書に1〜2回に抑える。
  - 出典: [no1s.biz](https://no1s.biz/blog/9670/) — 2026-07-13 — 種別: 実務者・その他
- **主張 (採点・過剰補正防止)**: 5軸 (立場・主体・具体性・リズム・削減) で採点し、35/50 未満は書き直し。リズムは文長の変動係数 CV ≥ 0.4 を目標 (別記事 tabayashi は CV < 0.50 を AI 的とする)。パターンを S/A/B の3段階の確信度で扱い、B は頻度が閾値を超えたときだけ直す。「捏造禁止」を含む5つの鉄則。直した結果の新しい型 (体言止めの連続、「正直」の反復、「〜のだ」の増殖) を検査する。
  - 出典: [Qiita: Rapls](https://qiita.com/Rapls/items/b98b09ec57c7e4b7be05) — 2026-08-24 — 種別: 実務者・その他
- **主張 (編集)**: 句読点を別の記号に置換するだけでは別の癖になる (em ダッシュ→セミコロン)。文構造を組み替える。冒頭の宣言的な足場と偽の確信を取り除く。
  - 出典: [brandonlazovic.dev](https://brandonlazovic.dev/articles/llm-negative-parallelism-tic/) — 2026-07-21 — 種別: 実務者・その他
- **主張 (リント+エージェント判断)**: リント結果を提案として扱い、エージェントが採否を理由付きで判断する。
  - 出典: [coji / Zenn](https://zenn.dev/coji/articles/natural-japanese-ai-smell-lint) — 2026-07-13 — 種別: 実務者・その他
- **確からしさ**: 中。全て自己申告の実践記録。比較実験は coji の「5サンプルのブラインドテストで5/5改善」のみで、著者自身が暫定と認めている。
- **公式と食い違う可能性**: 不明。

### 論点5: 対策の限界・副作用・検出ツールの誤検出

- **主張 (検出ツールの偏り)**: 検出器は非ネイティブの英語文を AI と誤判定する。TOEFL エッセイの平均誤検出率は61.3%、ある検出器は97.8%を AI 判定。米国学生のエッセイは正しく分類。言語多様性を高める操作で平均誤検出率は49.45%低下。簡単なプロンプトで偏りを緩和でき、同時に検出を回避できる。著者らは評価・教育場面での利用に反対する。
  - 出典: [GPT detectors are biased against non-native English writers](https://arxiv.org/abs/2304.02819) — Liang, Yuksekgonul, Mao, Wu, Zou / arXiv:2304.02819 — 公開日 2023-04-06 (v3: 2023-07-10) — 種別: 学術
  - 追加の検索ヒット (題名のみ確認): [Style as a Confound: False Positives in AI Detection of Non-Native Academic Writing](https://arxiv.org/pdf/2608.26710) (arXiv:2608.26710) と [The Misclassification of Autistic Writing as AI-Generated](https://arxiv.org/pdf/2607.14729) (arXiv:2607.14729) — 種別: 学術。本文は未取得。
- **主張 (人間の判別と検出器の精度)**: 頻繁に LLM を使う5人の多数決は300本中299本を正しく分類 (TPR 99.3%、オリジナルの GPT-4o / Claude 記事で FPR 0%)。個人平均は TPR 92.7%・FPR 3.3%、一般の判定者は TPR 56.7%・FPR 51.7%。検出器の TPR は Pangram Humanizers 99.3%、Pangram 98.0%、GPTZero 85.3% (o1-Pro で低下)、Fast-DetectGPT 80.0%、Binoculars 66.7%、RADAR 15.3%。言い換え攻撃に専門家は頑健 (GPT-4o 記事で精度100%)。o1-Pro に手掛かりのガイドブックを渡して「人間化」させても、多数決は完全正解。専門家は「AI clues still remain after humanization」と述べた。個人では TPR 0% に落ちた人もいた。
  - 出典: [arXiv:2501.15654](https://arxiv.org/html/2501.15654v1) — 公開日 2025-01 — 種別: 学術
- **主張 (Wikipedia)**: 検出ツールには「non-trivial error rates」があり、人間の AI/人間の識別は「no better than random chance」。AI の文体は時間とともに変化する。LLM が人間の文章で学習しているため重なりは避けられず、兆候はあくまで可能性。人間の文章が LLM の影響を受けて検出をさらに難しくしている。
  - 出典: [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) — 公開日不明 — 種別: 実務者・その他
- **主張 (過剰補正)**: AI 検出への警戒が、em ダッシュ・セミコロン・特定語彙の自己検閲を生み、文体が均質化して不自然になる。Washington Post の調査として「50% false positive rate」、Turnitin の公称「1%未満」との対比、Vanderbilt が検出機能を無効化した件を挙げる。数字は著者が引いたもので、一次資料は未確認。
  - 出典: [When AI Detection Paranoia Kills Creativity](https://writerswithoutwalls.substack.com/p/when-ai-detection-paranoia-kills) — James "JD" Armstrong / Writers Without Walls (Substack) — 公開日 2025-07-02 — 種別: 実務者・その他
- **主張 (日本語での過剰補正)**: 人間の文章では体言止めが60%に対し AI は0% (体言止めがゼロなのが AI 的)。文頭反復は人間93% vs AI 41%。「最後に」「まさに」は人間コーパス48回 vs AI 2回で、むしろ人間側の語。つまり「消すべきとされるパターン」を機械的に避けると、かえって AI 的になりうる。限界として、人間コーパスの不均質、較正と評価に同一データを使う循環、リントの検出と人間の知覚は別物、Goodhart の法則 (指標最適化が新しい型を生む)。
  - 出典: [coji / Zenn](https://zenn.dev/coji/articles/natural-japanese-ai-smell-lint) — 2026-07-13 — 種別: 実務者・その他
- **主張 (スクリプトの限界)**: 文字列パターンの計数のみで、意図的な例示と本当の使用を区別できない。記事自身が警告を誘発する。数値は修正前後の比較用で絶対目標ではない。Layer 0 は人間の判断が不可欠。
  - 出典: [Qiita: Rapls](https://qiita.com/Rapls/items/b98b09ec57c7e4b7be05) — 2026-08-24 — 種別: 実務者・その他
- **主張 (根本的限界)**: 書き手に「自分が言いたいこと」がなければ、技法では防げない。
  - 出典: [acntechjp / Zenn](https://zenn.dev/acntechjp/articles/c0591c4a642502) — 2026-04-06 — 種別: 実務者・その他
- **確からしさ**: 高 (検出器の偏りは学術論文+複数の実務記事、専門家判定の頑健性は定量データあり)。日本語の過剰補正は1件の実測 (低〜中)。
- **公式と食い違う可能性**: 不明。ただし「一般の判定者は51.7% FPR」「人間の識別はランダム並み」は、読み手が AI と感じるかどうかが読み手の経験に強く依存することを示す。

### 論点6: スライド資料特有の臭さ

- **主張 (日本語、実際に手直しした記録)**: 「AIっぽい」原因は3つ。(1) 要素間のコントラストが弱い。区切りはあるが視覚的な差が不足し、強調したい箇所が分かりにくい。(2) 文字の過多。「AI is skilled at 'adding information' but struggles with 'removing information.'」(要約中の英訳)。(3) 情報の重み付けが均一で、フォントサイズに階層がなく、主要メッセージと補足が同列。たとえば表紙でプロジェクト名が主役になり、聴衆が知りたい「今日の議論は何か」が埋もれた。
  - 出典: [AIスライドを手直しして「なんかAIっぽい」の原因を探ってみた【Claudeパワポ検証06】](https://note.com/more_sunset/n/n11987c6eece0) — モア / note — 公開日 2026-04-16 — 種別: 実務者・その他。対象は Claude が生成したスライド1件。
- **主張 (日本語)**: 同じ三分割の配置、内容と無関係な装飾の3Dイラスト、「個別化医療」のような説明のない抽象概念、出所不明の図表や統計。
  - 出典: [Nakashima Takaya / note](https://note.com/nakashima_takaya/n/nb3bb5dc261b9) — 2026-09-22 — 種別: 実務者・その他
- **主張 (英語・ベンダー)**:
  - 「Three bullet points per slide regardless of content complexity」「Predictable introduction patterns」「Repetitive conclusion formatting」、過度なグラデーション、汎用ストック画像、ブランドに合わない配色。解決策は既存テンプレート内での生成。ベンダー (テンプレート保持型のツール) のブログで、「40% of PowerPoint creation time is wasted on formatting」の根拠は示されていない。出典: [Why AI Presentations Look AI-Generated (And How to Fix It)](https://llemental.com/posts/why-ai-presentations-look-ai-generated) — llemental — 公開日 2025-11-15 — 種別: 実務者・その他。
  - タイトルのイタリック serif の強調 (例: 「Seventy years, _five waves_」)、全て大文字の「eyebrow」ラベル、各テキストボックス横の色付きバー、ダッシュボード風のデータタイル (全指標が同じ重み)、クリーム背景に落ち着いた差し色。対策は、プロンプトの前にスライドごとの1文のコアメッセージと実データを用意し、禁止リストを渡すこと。記事自身が Plus AI のベンダーブログと明示されている。出典: [How to Make AI-Generated Slides That Don't Look Like AI Slop](https://plusai.com/blog/how-to-make-ai-slides-that-dont-look-like-ai-slop/) — Plus AI — 公開日 2026-07-15 — 種別: 実務者・その他。
  - 検索結果の要約 (本文未取得): 「three boxes, random icons, bullet points that don't mean anything」(元マッキンゼーのデザイン責任者の言とされる)、タイトルが結論ではなく説明的ラベル、全スライドの重みが同じ、箇条書きが自明なことを繰り返す。出典: [chatslide.ai](https://www.chatslide.ai/guides/how-to-make-ai-slides-not-look-ai-generated)、[2slides.com](https://2slides.com/blog/why-ai-slides-look-fake-and-how-to-fix)、[presentations.ai](https://www.presentations.ai/blog/common-ai-presentation-mistakes) など。いずれもスライド生成ツールのベンダー。公開日不明。
  - 検索要約中の数値「AIは『A。B』と句点で切る形式が67%、判断を持つ見出しは7%」は、出典記事を特定できていない (検索結果中のどの記事かを確認していない)。引用や再利用はしないこと。
- **確からしさ**: 中。日本語2件+英語複数が「3分割レイアウト」「均一な重み」「汎用装飾」で一致する。ただし日本語は生成1〜数件の観察、英語はベンダーが自社製品の宣伝を兼ねる。デザイン面の記述 (クリーム背景、イタリック serif) は2026年時点の特定ツールの既定値で、陳腐化しやすい。
- **公式と食い違う可能性**: 不明。

### 論点7: 日本語特有の特徴

- **主張**: 日本語では「〜と言えるでしょう」「〜も重要です」「いかがでしたか」といったヘッジ・定型の終わり方、「ケースバイケースです」「一般的には」で結論を濁すこと、「以下の3つの観点から説明します」の構造宣言、カタカナ語の多さが挙がる。体言止め・コロン見出し・太字箇条書きは英語圏の書き方の影響という見方 (minorun365)。リズム面では文長が揃うこと (全文が平均56モーラ前後との報告、GPT系で顕著)。
  - 出典: [tabayashi](https://zenn.dev/tabayashi/articles/how-to-deodorize-ai-writing)、[minorun365](https://qiita.com/minorun365/items/68740e4ba1d81177199b)、[coji](https://zenn.dev/coji/articles/natural-japanese-ai-smell-lint)、検索要約 (相武AI 等、未取得)。種別: 実務者・その他。
- **主張 (過剰な敬語)**: 「過剰な丁寧さを避ける」を対策に挙げる記事はある (検索要約: ai-no-chikara.com、本文未取得)。「過剰敬語」を実測した記事は見つからなかった。
- **確からしさ**: 低〜中。個々の記述は複数あるが、日本語の学術文献は見つからず、実測はリズム (coji) に偏る。
- **公式と食い違う可能性**: 不明。

### 論点8: 読み手側の要因 (AI だと分かること自体の影響)

- **主張**: 同じ内容でも AI 生成と知るだけで評価が下がる (認知バイアス)。出典は記事内の言及で、元の研究は未特定。
  - 出典: [Nakashima Takaya / note](https://note.com/nakashima_takaya/n/nb3bb5dc261b9) — 2026-09-22 — 種別: 実務者・その他
- **主張**: 「AI臭い」は AI を使った事実ではなく、確かめた形跡と判断の欠如で決まる。対策として、AI を使ったタスクと検証方法を開示する。
  - 出典: nakashima (同上)、天秤AIメディア (検索要約のみ)。
- **確からしさ**: 低。1件の記事内の言及で、一次研究は未確認。

### 論点9: 出典間で食い違う点

- 食い違い1: 人間が AI 文を見分けられるか。Wikipedia は人間の識別を「no better than random chance」とする。Russell らは、LLM を日常的に使う判定者は多数決で 299/300 と判定できるが、一般の判定者は TPR 56.7% / FPR 51.7% とする。矛盾というより対象 (判定者の経験) の違い。
- 食い違い2: 語彙かリズムか。Wikipedia・Russell ら (語彙53.1%が最多) は語彙を主な手掛かりに挙げる。coji・no1s は「語彙ではなくリズム」と主張。coji はモデル依存を示し、GPT 系は語彙が清潔でもリズムが単調という。モデルの世代で最も目立つ癖が異なる可能性がある (この解釈は出典の記述の延長で、確認していない)。Wikipedia も語彙が時間で変化するとしている。
- 食い違い3: 「消すべき」とされるパターンの扱い。多くの記事は「最後に」「まず/次に」型や体言止めを AI 的とみなす方向で書く。一方 coji の実測では、体言止めは人間60% vs AI 0%、「最後に」「まさに」は人間コーパス48回 vs AI 2回で、逆に人間側の特徴。minorun365 は体言止めを AI の特徴に挙げており、coji と逆方向。
- 食い違い4: 原因 (RLHF かデータか)。Lazovic の記事は、em ダッシュはベースモデルにも既にあるとする研究と、RLHF 説を並べて未決着とする。「Why Does ChatGPT Delve」は RLHF を有力視し、学習データを主因から除外。Markdown 学習データ説 (arXiv:2603.27006) とも食い違う。
- 食い違い5: AI 臭の層。tabayashi・Rapls・acntechjp は立場・具体性 (深層) が本質で、記号の除去は表層とする。Lazovic は記号の置換は無意味とする。他方、検出器の研究は表層の語彙・文法の規則性に依存し、言語多様性を上げれば検出を回避できる (Liang ら)。対策の力点が分かれる。

## 情報が得られなかった論点

- 日本語の過剰な敬語 (「〜させていただきます」「〜でございます」の過多など) を実測した文献。対策として言及する記事はあったが、測定や出典付きの根拠は見つからなかった。
- 「まず/次に/最後に」の定型を AI 臭の根拠とする、本文で確認できた記事。構造宣言 (「以下の3つの観点から」) や「ステップ1：」の機械的分割は検索要約にあったが、本文は未取得。coji の記事は「最後に」を人間側の語とする。
- スライドに特化した学術論文、および読み手による AI 製スライド判別の実験。ベンダーブログと個人 note のみ。
- 日本語の AI 検出ツールの精度を測った独立した評価。英語の検出器の評価 (Liang ら、Russell ら) だけを得た。「検出ツールの誤検出」は日本語環境で未確認。
- 三点列挙 (rule of three) の頻度の定量データ。「Not just X but Y」(Pangram 推計の約3倍) のみ数値を得た。三点列挙の頻度の実測や、日本語の「AではなくB」構文の定量は見つからなかった。
- em ダッシュ以外の絵文字・太字・箇条書き過多の定量データ。Wikipedia と日本語ブログの定性的記述のみ。
- 未取得のため引用できない記事 (本文を開いていない): GMO天秤AIメディア、AI Trends (相武AI)、ai-no-chikara.com、ai-souken.com、AIX Camp、arXiv:2603.27006 / 2509.10179 / 2604.14111 / 2608.26710 / 2607.14729、「Wikipedia: Signs of AI Writing」の各紹介記事 (FastCompany、MakeUseOf など)、Hacker News のスレッド、Tom's Guide (ChatGPT の em ダッシュ無効化設定の報道。これは公式機能の報道で、公式側の担当領域に近い)。
- Wikipedia ページの最終更新日。
