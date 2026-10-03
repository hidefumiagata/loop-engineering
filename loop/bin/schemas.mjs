// 構造化出力のスキーマ定義。
// 正は「strict JSON Schema」形式（additionalProperties:false・全プロパティ required）で書く。
// OpenAI Responses API の strict モードがこの形をそのまま要求するため。
// Gemini の responseSchema は OpenAPI 3.0 のサブセットしか受けないので、
// toGeminiSchema() で非対応キーワードを落としてから渡す。

const str = (description) => ({ type: 'string', description });
const arr = (items, description) => ({ type: 'array', items, description });

/** @type {Record<string, {name: string, schema: object}>} */
export const SCHEMAS = {
  // pipeline: レビュー判定
  verdict: {
    name: 'loop_verdict',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['verdict', 'summary', 'criteria', 'gaps', 'next_actions', 'confidence'],
      properties: {
        verdict: { type: 'string', enum: ['PASS', 'REVISE', 'BLOCKED'], description: 'PASS=受入基準を全て満たす / REVISE=追加作業で到達可能 / BLOCKED=人間の判断なしには進めない' },
        summary: str('判定理由を3文以内で'),
        criteria: arr({
          type: 'object',
          additionalProperties: false,
          required: ['id', 'status', 'comment'],
          properties: {
            id: str('plan.md の受入基準ID'),
            status: { type: 'string', enum: ['met', 'partial', 'unmet'] },
            comment: str('その判定の根拠。成果物の該当箇所を引用すること'),
          },
        }, '受入基準ごとの充足状況。plan.md の全IDを必ず網羅する'),
        gaps: arr(str(), '未達の具体的な内容。次の作業指示としてそのまま使える粒度で書く'),
        next_actions: arr(str(), 'ギャップを埋めるために次に行うべき作業。優先度順'),
        confidence: { type: 'integer', enum: [1, 2, 3, 4, 5], description: 'この判定自体の確信度。1=情報不足で判断しきれない' },
      },
    },
  },

  // pipeline: 受入基準の批評
  critique: {
    name: 'loop_critique',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['missing_criteria', 'unverifiable_criteria', 'ambiguities', 'suggested_criteria', 'overall'],
      properties: {
        missing_criteria: arr(str(), '目的を達成したと言うために必要なのに基準に無いもの'),
        unverifiable_criteria: arr({
          type: 'object',
          additionalProperties: false,
          required: ['id', 'why'],
          properties: { id: str(), why: str('なぜ検証不能か') },
        }, '書かれているが客観的に検証できない基準'),
        ambiguities: arr(str(), '複数の解釈が可能で作業が発散しうる記述'),
        suggested_criteria: arr({
          type: 'object',
          additionalProperties: false,
          required: ['id', 'text', 'weight', 'verification'],
          properties: {
            id: str('a1, a2 ... の形式'),
            text: str('基準の本文'),
            weight: { type: 'integer', enum: [1, 2, 3], description: '1=あれば良い 2=重要 3=これが無ければ失敗' },
            verification: str('どうやって満たしたと確認するか'),
          },
        }, '追加・置換を提案する基準'),
        overall: str('全体講評を3文以内で'),
      },
    },
  },

  // panel: 相互評価
  evaluation: {
    name: 'loop_evaluation',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposals', 'evaluator_notes'],
      properties: {
        proposals: arr({
          type: 'object',
          additionalProperties: false,
          required: ['label', 'criteria', 'biggest_concern', 'overall_comment'],
          properties: {
            label: str('提案のラベル。提示されたとおりに返す'),
            criteria: arr({
              type: 'object',
              additionalProperties: false,
              required: ['id', 'score', 'justification'],
              properties: {
                id: str('brief.md の評価基準ID'),
                score: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '1=基準を全く満たさない 5=申し分なく満たす' },
                justification: str('その点数にした根拠。提案の該当箇所を引用すること'),
              },
            }, 'brief.md の全評価基準IDを必ず網羅する'),
            biggest_concern: str('この案を採用した場合に最も危険だと思う点を1つ'),
            overall_comment: str('総評を3文以内で'),
          },
        }, '提示された全提案について、提示順どおりに返す'),
        evaluator_notes: str('採点全体に関する補足。どの案も満たせていない基準があればここに書く'),
      },
    },
  },
};

/** OpenAI Responses API の text.format に渡す形 */
export function toOpenAIFormat(schemaName) {
  const s = SCHEMAS[schemaName];
  if (!s) throw new Error(`unknown schema: ${schemaName}`);
  return { type: 'json_schema', name: s.name, strict: true, schema: s.schema };
}

/** Gemini の responseSchema が受けない keyword を再帰的に落とす */
export function toGeminiSchema(schemaName) {
  const s = SCHEMAS[schemaName];
  if (!s) throw new Error(`unknown schema: ${schemaName}`);
  const DROP = new Set(['additionalProperties', '$schema', 'strict']);
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (DROP.has(k)) continue;
      // Gemini は integer + enum の組を受けないので type だけ残す
      if (k === 'enum' && node.type === 'integer') continue;
      out[k] = walk(v);
    }
    return out;
  };
  return walk(s.schema);
}

export const SCHEMA_NAMES = Object.keys(SCHEMAS);
