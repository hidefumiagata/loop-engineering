# 002 propose

- Claude の案を他案取得前に単独コミット・push した（git 履歴が独立性の証跡）。
- Gemini (gemini:propose) は初回で取得。OpenAI (openai:propose) は max_output_tokens=8000 で打ち切られたため、
  20000 に増やして 1 回だけ再実行し取得した（コスト USD 0.4831。打ち切られた初回分の課金は不明）。
- 3案が揃った（min_proposers: 3 を満たす）。A/B/C にランダム割り当てし、対応表は `proposals/.authors.json`。
- 匿名化前のファイルは削除し、`*.meta.json` はリネームして残した。
