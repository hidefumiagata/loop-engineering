#!/usr/bin/env node
// 統合答案が、統合役自身の案に偏っていないかを機械的に調べる。
//
//   node loop/bin/synthesis-check.mjs --dir projects/0004-ai-cicd
//     → <dir>/synthesis-check.json を生成する
//
// このスクリプトが存在する理由:
//   panel モードでは Claude が3案のうち1つを書き、そのうえで統合答案も書く。
//   無策だと統合答案が「自案に飾りを付けただけ」になり得て、しかも外からは見分けがつかない。
//   そこで統合役に provenance.json（答案の要素 → 由来する案）を宣言させ、
//   寄与比率をここで算出する。Claude は synthesis-check.json を参照するだけで書き換えない。
//
// aggregate.mjs と同じく純関数に保つ。ネットワークも LLM も使わない。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

/**
 * @param {{provenance: {element:string, from:string[], note?:string}[],
 *          authors: Record<string,string>,
 *          synthesizer: string}} input
 */
export function checkSynthesis({ provenance, authors, synthesizer }) {
  const warnings = [];
  if (!Array.isArray(provenance) || provenance.length === 0) {
    throw new Error('provenance.json が空です。統合答案の要素と由来を宣言させてください。');
  }

  const labels = Object.keys(authors ?? {}).sort();
  const authorOf = (label) => authors?.[label] ?? null;

  // 1要素が複数案に由来する場合、その要素の寄与を均等に分ける。
  // 3者一致の要素で全員に 1 を与えると、一致が多いほど比率が平らになって偏りが隠れるため。
  const share = Object.fromEntries(labels.map((l) => [l, 0]));
  let novel = 0;
  const unknown = new Set();

  for (const item of provenance) {
    const from = (item.from ?? []).filter((l) => {
      if (labels.includes(l)) return true;
      unknown.add(l);
      return false;
    });
    if (from.length === 0) { novel += 1; continue; }
    for (const l of from) share[l] += 1 / from.length;
  }

  if (unknown.size) {
    warnings.push(`provenance.json に未知のラベル ${[...unknown].join(', ')} があります。`
      + `有効なラベルは ${labels.join(', ')} です。`);
  }

  const attributed = Object.values(share).reduce((a, b) => a + b, 0);
  const total = attributed + novel;

  const byLabel = labels.map((l) => ({
    label: l,
    author: authorOf(l),
    weight: round(share[l]),
    ratio: attributed > 0 ? round(share[l] / attributed) : 0,
    is_synthesizer: authorOf(l) === synthesizer,
  })).sort((a, b) => b.weight - a.weight);

  const own = byLabel.find((x) => x.is_synthesizer) ?? null;
  const evenRatio = labels.length ? 1 / labels.length : 0;

  // 自案への偏り。均等配分の 1.6 倍を超えたら疑う。
  // 3案なら均等 0.333 なので、0.533 を超えると警告。
  const BIAS_FACTOR = 1.6;
  if (own && own.ratio > evenRatio * BIAS_FACTOR) {
    warnings.push(
      `統合答案の ${Math.round(own.ratio * 100)}% が統合役自身の案(${own.label}) 由来です`
      + `（均等なら ${Math.round(evenRatio * 100)}%）。自案を土台にしていないか見直し、`
      + '他案固有の要素を取り込むか、取り込まない理由を答案に書いてください。',
    );
  }

  // まったく採られなかった案。素材として無視されたなら理由が要る。
  for (const x of byLabel) {
    if (x.weight === 0) {
      warnings.push(`案 ${x.label}（${x.author ?? '著者不明'}）の要素が1つも採られていません。`
        + '取り込まなかった理由を答案に明記してください。');
    }
  }

  if (novel === 0) {
    warnings.push('新規要素（from が空）が1つもありません。3案の寄せ集めになっていないか確認してください。'
      + 'どの案も満たせなかった基準があるなら、そこは自分で埋める必要があります。');
  }

  if (provenance.length < 8) {
    warnings.push(`provenance.json の要素が ${provenance.length} 件しかありません。`
      + '粒度が粗すぎると寄与比率が意味を持ちません（8〜20 件が目安）。');
  }

  return {
    generated_at: new Date().toISOString(),
    generated_by: 'loop/bin/synthesis-check.mjs',
    note: 'このファイルは機械集計の出力です。Claude は参照のみで書き換えません。',
    synthesizer,
    element_count: provenance.length,
    novel_elements: novel,
    attributed_weight: round(attributed),
    total_elements: total,
    by_label: byLabel,
    even_ratio: round(evenRatio),
    bias_threshold: round(evenRatio * BIAS_FACTOR),
    warnings,
  };
}

export function collectFromDir(dir, synthesizer = 'claude') {
  const provPath = join(dir, 'provenance.json');
  if (!existsSync(provPath)) {
    throw new Error(`${provPath} がありません。synthesize フェーズが由来を書き出していません。`);
  }
  const authorsPath = join(dir, 'proposals', '.authors.json');
  if (!existsSync(authorsPath)) throw new Error(`${authorsPath} がありません。`);

  return {
    provenance: JSON.parse(readFileSync(provPath, 'utf8')),
    authors: JSON.parse(readFileSync(authorsPath, 'utf8')),
    synthesizer,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const get = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
  const dir = get('--dir');
  if (!dir) {
    console.log('使い方: node loop/bin/synthesis-check.mjs --dir projects/<n>-<slug> [--synthesizer claude] [--out <path>]');
    console.log('  <dir>/provenance.json と <dir>/proposals/.authors.json を読み、');
    console.log('  <dir>/synthesis-check.json を生成します。');
    process.exit(argv.length ? 1 : 0);
  }
  const synthesizer = get('--synthesizer') ?? 'claude';
  const out = get('--out') ?? join(dir, 'synthesis-check.json');

  const result = checkSynthesis(collectFromDir(dir, synthesizer));
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');

  process.stderr.write(`[ok] ${out}\n`);
  process.stderr.write(`  要素 ${result.element_count} 件（うち新規 ${result.novel_elements} 件）\n`);
  for (const x of result.by_label) {
    process.stderr.write(`  案 ${x.label} (${x.author ?? '著者不明'})`
      + `${x.is_synthesizer ? ' ←統合役の自案' : ''} = ${Math.round(x.ratio * 100)}%\n`);
  }
  for (const w of result.warnings) process.stderr.write(`  [warn] ${w}\n`);
}

if (process.argv[1]?.endsWith('synthesis-check.mjs')) main();
