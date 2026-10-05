# 公式情報の調査結果

## 調査した範囲と限界
- 見たもの: Anthropic 公式ドキュメント（2件）、OpenAI 公式ドキュメント／Cookbook（2件）、Google Developer Documentation Style Guide、Microsoft Style Guide（3件）。いずれも取得日 2026-10-05。
- 公式文書は「AI臭さ」という語を使っていない。ここで拾えるのは「読みやすい文章の公式な規範」と「LLM の出力スタイルを制御する公式な方法」の2系統である。
- 取得を試みて失敗: 文化庁「公用文作成の考え方」PDF（テキスト抽出不可）、デジタル庁コンテンツガイド（URL が 404）、Google style guide の clarity ページ（404）。日本語の公的規範は今回の公式側に含められていない。
- digital.gov / plainlanguage.gov のガイドは概要ページのみ取得でき、個別の規則は得られなかった。

## 見つかったこと

### 1. LLM は冗長・マークダウン過多・前置きに寄りやすく、プロンプトで制御する
- **記述**: Claude 公式ガイドは、書式制御の方法として「何をしないかではなく何をするかを伝える」を挙げる（例: "Do not use markdown" ではなく "Your response should be composed of smoothly flowing prose paragraphs."）。長文では「流れる散文で書き、箇条書きは本当に独立した項目のときだけ」「NEVER output a series of overly short bullet points.」とするサンプルプロンプトを公式に載せている。
- **記述**: プロンプト自体の書式が出力の書式に影響する。「removing markdown from your prompt can reduce the volume of markdown in the output」。
- **記述**: 前置きの排除として「Respond directly without preamble. Do not start with phrases like 'Here is...', 'Based on...'」を例示。
- **記述**: Claude Opus 5 は既定で応答が長くなりやすく、effort を変えても長さは安定しないので、簡潔さは明示的に指示する。
- **出典**: [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — 取得日 2026-10-05
- **種別**: ドキュメント

### 2. Few-shot 例と役割設定は口調・構成を強く誘導する
- **記述**: "Examples are one of the most reliable ways to steer Claude's output format, tone, and structure." / 役割設定は「focuses Claude's behavior and tone」。
- **出典**: 同上 — 取得日 2026-10-05
- **種別**: ドキュメント

### 3. OpenAI: 口調は instructions で、構造は Markdown/XML で与える
- **記述**: `instructions` は「tone, goals, and examples of correct responses」を含む高位の指示。開発者向けメッセージは Identity（コミュニケーションスタイル）/ Instructions / Examples / Context で構成するのが典型。
- **出典**: [Prompt engineering | OpenAI](https://developers.openai.com/api/docs/guides/prompt-engineering) — 取得日 2026-10-05
- **種別**: ドキュメント

### 4. OpenAI GPT-5: 冗長度は専用パラメータ、Markdown は意味的に正しい場所だけ、矛盾指示は害になる
- **記述**: 「verbosity」パラメータが最終回答の長さを左右する。"Use Markdown only where semantically correct (e.g., inline code, code fences, lists, tables)." 長い会話では3〜5メッセージごとに再掲しないと遵守が落ちる。
- **記述**: "Poorly-constructed prompts containing contradictory or vague instructions can be more damaging to GPT-5 than to other models."
- **記述**: 「Be THOROUGH」のような強調語は過剰な動作を招いたため、Cursor は弱めた。
- **出典**: [GPT-5 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) — 取得日 2026-10-05
- **種別**: 公式 Cookbook

### 5. Google: 友人のように話す口調。避けるものが明示されている
- **記述**: "Write in a conversational, friendly, and respectful tone ... avoiding slang and overly casual language." "Try to sound like a knowledgeable friend."
- **記述**: 避けるもの: 過度に形式ばった・学者ぶった言い回し、専門用語・流行語、感嘆符と過剰な熱意、"please note" のような埋め草、不要な丁寧さ（"please" の多用）。
- **記述**: 声に出して読み、自然に流れるかを確かめる。
- **出典**: [Tone and content | Google developer documentation style guide](https://developers.google.com/style/tone) — 取得日 2026-10-05
- **種別**: スタイルガイド

### 6. Microsoft: 結論先行・短く・簡単な語
- **記述**: "Get to the point fast. Start with the key takeaway." "Prune every excess word." "Short sentences and fragments are easier to scan."
- **記述**: 言い換え例: "in order to" → "to"、"utilize" → "use"、"in addition" → "also"、"establish connectivity" → "connect"。不要な副詞（quite, very, quickly, easily, effectively）は削る。
- **記述**: 「there is / there are」のような弱い言い回しを避け、動詞で始める。不要な "you can" を削る。縮約形（it's, you'll）を使う。
- **記述**: 同じ概念には同じ用語を使う。
- **出典**: [Brand voice: simple and human](https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human) / [Top 10 tips for Microsoft style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice) / [Use simple words, concise sentences](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences) — いずれも取得日 2026-10-05
- **種別**: スタイルガイド

### 7. Microsoft: 大文字化・句読点・ダッシュ
- **記述**: 見出しは文頭のみ大文字（sentence-style）。見出しの末尾に句点・コロンを付けない。ダッシュ前後に空白を置かない。
- **出典**: Top 10 tips（上記）— 取得日 2026-10-05
- **種別**: スタイルガイド

### 8. 米国政府: プレーンランゲージは対象読者に合わせ、理解度をテストする
- **記述**: 「Writing for Understanding / Design for Understanding / Test for Understanding」と、対象読者ごとに書く原則。
- **出典**: [Plain language guide | digital.gov](https://digital.gov/guides/plain-language) — 取得日 2026-10-05
- **種別**: 政府ガイド

## 公式に記述が無かった論点
- 「AI臭さ」という概念そのものの定義、読み手が AI と感じる要因の調査（公式文書には無い）。
- スライド資料（箇条書きの量、1枚あたりの情報量、タイトルの書き方）に特化した公式規範。
- 日本語特有の特徴（過度な敬語、「〜と言えるでしょう」型の断定回避、「まず／次に／最後に」の定型）に関する公式規範。公用文の規範は取得に失敗した。
- 三点列挙・対比構文（「AではなくB」）など修辞パターンの公式な指摘。
- 検出ツール・AI検出の精度に関する公式情報。
