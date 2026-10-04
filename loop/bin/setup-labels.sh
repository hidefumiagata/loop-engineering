#!/usr/bin/env bash
# ループ基盤が使う GitHub ラベルを作成する。べき等（既存ラベルは色と説明を更新するだけ）。
#   bash loop/bin/setup-labels.sh [owner/repo]
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
echo "対象リポジトリ: $REPO"

# name|color|description
LABELS=(
  "loop|0e8a16|このIssueをループ基盤の処理対象にする。これが無いと一切触られない"
  "loop:plan|c5def5|受入基準を策定中 (pipeline)"
  "loop:work|1d76db|作業中 (pipeline)"
  "loop:review|5319e7|レビュー中 (pipeline)"
  "loop:brief|c5def5|共有ブリーフを作成中 (panel)"
  "loop:propose|1d76db|3者が提案を作成中 (panel)"
  "loop:challenge|5319e7|自分以外の案を敵対的レビュー中 (panel)"
  "loop:revise|5319e7|レビューを受けて各自が改稿中 (panel)"
  "loop:synthesize|8b5cf6|別エージェントが3案の結論をまとめ中 (panel)"
  "loop:done|0e8a16|受入基準を満たして完了。PRのマージ待ち"
  "loop:blocked|b60205|自動で進められない。原因はIssueコメント参照"
  "loop:needs-human|d93f0b|人間の判断待ち。確認して loop:go を付けるか指示をコメントする"
  "loop:go|fbca04|人間が確認済み。次の実行で再開してよい"
  "loop:stop|000000|進行を即時停止する。緊急停止スイッチ"
  "use:research|fef2c0|用途: 技術調査"
  "use:build|fef2c0|用途: プログラム構築"
  "use:ideation|fef2c0|用途: アイデア深堀"
  "use:deliberation|f9d0c4|用途: 合議 (3LLMが案を出し相互評価する)"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<< "$entry"
  if gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null; then
    echo "  作成: $name"
  else
    gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null
    echo "  更新: $name"
  fi
done

echo "完了: ${#LABELS[@]} 件のラベルを設定しました"
