# work 1回目の記録

## 今回やったこと
- 段階1: 公式サイト（Jamf / Apple / NIST mSCP / 個人情報保護委員会 / FISC）を調べ `findings/official.md` に記述。
- 段階2: `research-community` に非公式のみを調査させ `findings/community.md` を得た（段階1の結果は渡していない）。
- 段階3: `research-reconcile` に突き合わせさせた。同エージェントの Write は「サブエージェントはレポートファイルを書かず本文を返す」制約で拒否されたため、返された本文を**無編集で** `report.md` に保存した（loop-engine 本体は内容を足していない。B 節のみ sources.md への参照に置換された状態をそのまま保存）。`sources.md` はサブエージェントが保存。

## 載せなかったこと
- 情シスフォース・Magic Hat Tech Blog は本文取得不可のため引用なし。

## 行き詰まり
- 公式ページの多くが目次しか取得できず、FileVault・ファイアウォール・Gatekeeper・Platform SSO 等の公式キーを確認できなかった。
- FISC は 403・有償、個人情報保護法の項番は取得結果が不整合で、いずれも「未確認」。a2・a3 は未達の見込み。

## 次に残る疑問
- 金融向けの根拠付き推奨値、FISC/J-SOX との対応、DLP・ログ保管の実践。Apple 各ペイロードページの本文の再取得。
