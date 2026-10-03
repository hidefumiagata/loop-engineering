#!/usr/bin/env node
// panel モードのスコア機械集計。
//
//   node loop/bin/aggregate.mjs --dir projects/0013-agent-arch
//     → <dir>/scores.json を生成する
//
// このスクリプトが存在する理由:
//   Claude は panel の参加者でありながらオーケストレータでもある。
//   採点結果の重み付けを Claude にやらせると、自案を勝たせる余地が構造的に残る。
//   集計をここに切り出し、Claude は scores.json を「参照するだけ・書き換えない」と決めることで、
//   合議の結論がどこから来たのかを検証可能にする。
//
// したがってこのファイルは純関数の集まりに保つ。ネットワークも LLM も使わない。

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ---------------- 純粋な計算部 ----------------

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

/**
 * 評価者が返したラベルを正規化する。
 *
 * 実運用で、提示パケットの見出しが「# 案 A」だったため評価者が label に「案 B」を返し、
 * 集計が別案として扱った。そのときエージェントは evaluations/*.json を手で書き換えて
 * しのいだが、**評価者の出力を編集するのは合議の証跡を壊す行為**であり、繰り返させてはならない。
 * ゆらぎは集計側で吸収する。
 *
 *   "B" → "B" / "案 B" → "B" / "Proposal B" → "B" / "b" → "B"
 */
export function normalizeLabel(raw) {
  const s = String(raw ?? '').trim();
  if (/^[A-Za-z0-9]+$/.test(s)) return s.toUpperCase();
  const tokens = s.match(/[A-Za-z0-9]+/g);
  return tokens?.length ? tokens[tokens.length - 1].toUpperCase() : s;
}

/** 同順位は平均順位を割り当てる（1 が最良 = 高スコア） */
export function averageRanks(scoreByLabel) {
  const entries = Object.entries(scoreByLabel).sort((a, b) => b[1] - a[1]);
  const ranks = {};
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1][1] === entries[i][1]) j++;
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[entries[k][0]] = avg;
    i = j + 1;
  }
  return ranks;
}

/**
 * Kendall の一致係数 W。0=まったく一致しない 1=完全一致。
 * 同順位補正は入れていない（評価者3・案3程度では影響が小さく、
 * 補正式を入れるとこの関数の検証可能性が落ちるため）。
 */
export function kendallW(rankRows) {
  const m = rankRows.length;                       // 評価者数
  const labels = Object.keys(rankRows[0] ?? {});
  const n = labels.length;                         // 案の数
  if (m < 2 || n < 2) return null;
  const rankSums = labels.map((l) => rankRows.reduce((a, r) => a + r[l], 0));
  const grand = mean(rankSums);
  const S = rankSums.reduce((a, r) => a + (r - grand) ** 2, 0);
  const denom = (m ** 2 * (n ** 3 - n)) / 12;
  return denom === 0 ? null : round(S / denom);
}

/**
 * 集計本体。
 * @param {{criteria: {id:string,text?:string,weight:number}[],
 *          authors: Record<string,string>,
 *          evaluations: {evaluator: string, data: object}[]}} input
 */
export function aggregate({ criteria, authors, evaluations }) {
  const warnings = [];
  if (!criteria?.length) throw new Error('criteria.json が空です。brief フェーズが評価基準を書き出していません。');
  if (!evaluations?.length) throw new Error('evaluations/ に評価ファイルがありません。');

  const criterionIds = criteria.map((c) => c.id);
  const weightOf = Object.fromEntries(criteria.map((c) => [c.id, c.weight ?? 1]));
  const totalWeight = criterionIds.reduce((a, id) => a + weightOf[id], 0);
  // ラベルのゆらぎをここで吸収する。評価者の出力そのものは書き換えさせない。
  const renamed = new Set();
  for (const { data } of evaluations) {
    for (const p of data.proposals ?? []) {
      const n = normalizeLabel(p.label);
      if (n !== p.label) renamed.add(`"${p.label}" → "${n}"`);
      p.label = n;
    }
  }
  if (renamed.size) {
    warnings.push(`評価者が返したラベルを正規化しました: ${[...renamed].join(', ')}。`
      + '提示パケットの見出しが単独のラベルになっているか確認してください。');
  }

  const labels = [...new Set(evaluations.flatMap((e) => (e.data.proposals ?? []).map((p) => p.label)))].sort();

  if (labels.length < 2) warnings.push(`評価対象の案が ${labels.length} 件しかありません。合議として成立していません。`);

  // 評価者 × 案 → 基準ごとのスコア
  /** @type {Record<string, Record<string, Record<string, number>>>} */
  const cell = {};
  for (const { evaluator, data } of evaluations) {
    cell[evaluator] = {};
    const seen = new Set();
    for (const p of data.proposals ?? []) {
      seen.add(p.label);
      const byCriterion = {};
      for (const c of p.criteria ?? []) {
        if (!criterionIds.includes(c.id)) {
          warnings.push(`${evaluator} が未知の基準 ${c.id} を採点しています（criteria.json に無い）。集計から除外しました。`);
          continue;
        }
        byCriterion[c.id] = c.score;
      }
      const missing = criterionIds.filter((id) => byCriterion[id] === undefined);
      if (missing.length) {
        warnings.push(`${evaluator} は案 ${p.label} の基準 ${missing.join(', ')} を採点していません。平均の算出母数から除外しました。`);
      }
      cell[evaluator][p.label] = byCriterion;
    }
    const notScored = labels.filter((l) => !seen.has(l));
    if (notScored.length) warnings.push(`${evaluator} は案 ${notScored.join(', ')} を採点していません。`);
  }

  // 案ごとの集計
  const evaluators = evaluations.map((e) => e.evaluator);
  const weightedByEvaluator = {};   // label -> evaluator -> 重み付きスコア
  const proposals = labels.map((label) => {
    const byEvaluator = {};
    for (const ev of evaluators) {
      const sc = cell[ev]?.[label];
      if (!sc) continue;
      let acc = 0;
      let w = 0;
      for (const id of criterionIds) {
        if (sc[id] === undefined) continue;
        acc += sc[id] * weightOf[id];
        w += weightOf[id];
      }
      if (w > 0) byEvaluator[ev] = round(acc / w);
    }
    weightedByEvaluator[label] = byEvaluator;

    const byCriterion = {};
    for (const id of criterionIds) {
      const xs = evaluators.map((ev) => cell[ev]?.[label]?.[id]).filter((x) => typeof x === 'number');
      byCriterion[id] = {
        weight: weightOf[id],
        mean: round(mean(xs)),
        spread: xs.length ? round(Math.max(...xs) - Math.min(...xs)) : null,
        n: xs.length,
      };
    }

    const vals = Object.values(byEvaluator);
    // 自案への採点を除いた点。自己採点だけで首位になっている案を可視化するために出す。
    const exclSelf = Object.entries(byEvaluator)
      .filter(([ev]) => authors?.[label] !== ev)
      .map(([, v]) => v);
    return {
      label,
      author: authors?.[label] ?? null,
      weighted_score: round(mean(vals)),
      weighted_score_excl_self: exclSelf.length ? round(mean(exclSelf)) : null,
      by_evaluator: byEvaluator,
      inter_evaluator_spread: vals.length ? round(Math.max(...vals) - Math.min(...vals)) : null,
      by_criterion: byCriterion,
      concerns: evaluations
        .map(({ evaluator, data }) => {
          const p = (data.proposals ?? []).find((x) => x.label === label);
          return p ? { evaluator, biggest_concern: p.biggest_concern } : null;
        })
        .filter(Boolean),
    };
  });

  proposals.sort((a, b) => b.weighted_score - a.weighted_score);
  proposals.forEach((p, i) => { p.rank = i + 1; });

  // 自己採点バイアス: 自案につけた点 − 他案につけた点の平均
  const selfScoreBias = [];
  for (const ev of evaluators) {
    const own = labels.find((l) => authors?.[l] === ev);
    if (!own) continue;
    const ownScore = weightedByEvaluator[own]?.[ev];
    const others = labels.filter((l) => l !== own).map((l) => weightedByEvaluator[l]?.[ev]).filter((x) => typeof x === 'number');
    if (typeof ownScore !== 'number' || !others.length) continue;
    const bias = round(ownScore - mean(others));
    selfScoreBias.push({ evaluator: ev, own_label: own, own_score: ownScore, others_mean: round(mean(others)), bias });
    if (bias > 0.75) {
      warnings.push(`${ev} は自案 ${own} を他案より ${bias} 点高く採点しています。自己採点バイアスの疑いがあります。decision.md に明記してください。`);
    }
  }

  // 評価者間の一致度
  const rankRows = evaluators
    .filter((ev) => labels.every((l) => typeof weightedByEvaluator[l]?.[ev] === 'number'))
    .map((ev) => averageRanks(Object.fromEntries(labels.map((l) => [l, weightedByEvaluator[l][ev]]))));
  const w = rankRows.length >= 2 ? kendallW(rankRows) : null;
  const topPicks = new Set(rankRows.map((r) => Object.entries(r).find(([, v]) => v === Math.min(...Object.values(r)))?.[0]));
  const agreement = {
    kendall_w: w,
    mean_inter_evaluator_spread: round(mean(proposals.map((p) => p.inter_evaluator_spread ?? 0))),
    evaluators_in_agreement_metric: rankRows.length,
    top_pick_unanimous: topPicks.size === 1,
  };
  if (w !== null && w < 0.5) {
    warnings.push(`評価者間の一致度が低い (Kendall W=${w})。評価階層のモデルを引き上げるか、brief.md の基準を具体化してください。`);
  }

  // 勝者と差
  const winner = proposals[0]
    ? {
        label: proposals[0].label,
        author: proposals[0].author,
        weighted_score: proposals[0].weighted_score,
        margin: proposals[1] ? round(proposals[0].weighted_score - proposals[1].weighted_score) : null,
      }
    : null;
  if (winner?.margin !== null && winner?.margin !== undefined && winner.margin < 0.25) {
    warnings.push(`首位と次点の差が ${winner.margin} 点しかありません。スコアだけで決めず、decision.md で質的な根拠を示してください。`);
  }

  // 自己採点を除いた順位。自案への点だけで首位になっている案を検出する。
  // 警告するだけでは順位が動かないので、別の順位として並べて出す。
  const rankedExclSelf = proposals
    .filter((p) => typeof p.weighted_score_excl_self === 'number')
    .sort((a, b) => b.weighted_score_excl_self - a.weighted_score_excl_self);
  const winnerExclSelf = rankedExclSelf[0]
    ? {
        label: rankedExclSelf[0].label,
        author: rankedExclSelf[0].author,
        weighted_score_excl_self: rankedExclSelf[0].weighted_score_excl_self,
        margin: rankedExclSelf[1]
          ? round(rankedExclSelf[0].weighted_score_excl_self - rankedExclSelf[1].weighted_score_excl_self)
          : null,
      }
    : null;
  if (winner && winnerExclSelf && winner.label !== winnerExclSelf.label) {
    warnings.push(
      `自己採点を除くと首位が ${winner.label}(${winner.author}) から `
      + `${winnerExclSelf.label}(${winnerExclSelf.author}) に入れ替わります。`
      + `${winner.label} は著者自身の採点で首位になっています。decision.md では両方の順位を示し、`
      + `どちらを採るかの判断根拠を質的に説明してください。`,
    );
  }

  // どの案も満たせていない基準
  const unmetCriteria = criterionIds
    .map((id) => ({ id, weight: weightOf[id], best_mean: round(Math.max(...proposals.map((p) => p.by_criterion[id]?.mean ?? 0))) }))
    .filter((c) => c.best_mean < 3);
  for (const c of unmetCriteria) {
    warnings.push(`基準 ${c.id} をどの案も満たせていません (最高 ${c.best_mean}/5)。brief.md への追記とラウンド追加を検討してください。`);
  }

  return {
    generated_at: new Date().toISOString(),
    generated_by: 'loop/bin/aggregate.mjs',
    note: 'このファイルは機械集計の出力です。Claude は参照のみで書き換えません。',
    criteria: criteria.map((c) => ({ id: c.id, text: c.text ?? null, weight: weightOf[c.id] })),
    total_weight: totalWeight,
    evaluators,
    proposals,
    winner,
    winner_excl_self: winnerExclSelf,
    self_score_bias: selfScoreBias,
    agreement,
    unmet_criteria: unmetCriteria,
    warnings,
  };
}

// ---------------- I/O 部 ----------------

export function collectFromDir(dir) {
  const criteriaPath = join(dir, 'criteria.json');
  if (!existsSync(criteriaPath)) throw new Error(`${criteriaPath} がありません。brief フェーズが評価基準を書き出していません。`);
  const criteria = JSON.parse(readFileSync(criteriaPath, 'utf8'));

  const authorsPath = join(dir, 'proposals', '.authors.json');
  const authors = existsSync(authorsPath) ? JSON.parse(readFileSync(authorsPath, 'utf8')) : {};

  const evalDir = join(dir, 'evaluations');
  if (!existsSync(evalDir)) throw new Error(`${evalDir} がありません。`);
  const evaluations = readdirSync(evalDir)
    // `by-gemini.json.meta.json` のようなコスト記録を評価者として数えてはいけない。
    // 実運用で by-gemini.json.meta という架空の評価者が集計に混ざった。
    .filter((f) => /^by-[^.]+\.json$/.test(f))
    .sort()
    .map((f) => ({
      evaluator: basename(f, '.json').replace(/^by-/, ''),
      data: JSON.parse(readFileSync(join(evalDir, f), 'utf8')),
    }));

  return { criteria, authors, evaluations };
}

function main() {
  const argv = process.argv.slice(2);
  const dirFlag = argv.indexOf('--dir');
  if (dirFlag === -1 || !argv[dirFlag + 1]) {
    console.log('使い方: node loop/bin/aggregate.mjs --dir projects/<n>-<slug> [--out <path>]');
    console.log('  <dir>/criteria.json, <dir>/proposals/.authors.json, <dir>/evaluations/by-*.json を読み');
    console.log('  <dir>/scores.json を生成します。');
    process.exit(dirFlag === -1 ? 1 : 0);
  }
  const dir = argv[dirFlag + 1];
  const outFlag = argv.indexOf('--out');
  const out = outFlag !== -1 ? argv[outFlag + 1] : join(dir, 'scores.json');

  const result = aggregate(collectFromDir(dir));
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');

  process.stderr.write(`[ok] ${out}\n`);
  for (const p of result.proposals) {
    const excl = typeof p.weighted_score_excl_self === 'number' ? ` 自己採点除外 ${p.weighted_score_excl_self}` : '';
    process.stderr.write(`  ${p.rank}. ${p.label} (${p.author ?? '著者不明'}) = ${p.weighted_score}/5${excl}  ばらつき ${p.inter_evaluator_spread}\n`);
  }
  if (result.winner_excl_self && result.winner?.label !== result.winner_excl_self.label) {
    process.stderr.write(`  自己採点を除いた首位: ${result.winner_excl_self.label} (${result.winner_excl_self.author})\n`);
  }
  process.stderr.write(`  一致度 Kendall W=${result.agreement.kendall_w} 首位一致=${result.agreement.top_pick_unanimous}\n`);
  for (const w of result.warnings) process.stderr.write(`  [warn] ${w}\n`);
}

if (process.argv[1]?.endsWith('aggregate.mjs')) main();
