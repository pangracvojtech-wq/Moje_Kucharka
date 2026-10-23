// Parses free-text ingredient lines ("500 g hladké mouky", "2 vejce", "špetka soli")
// into rows for public.recipe_ingredients. Unit codes match public.units.

export type ParsedIngredient = {
  position: number;
  group_label: string | null;
  raw_text: string;
  name: string;
  quantity: number | null;
  unit_code: string | null;
  is_optional: boolean;
};

export const UNIT_LABELS: Record<string, string> = {
  g: 'g',
  dkg: 'dkg',
  kg: 'kg',
  ml: 'ml',
  dl: 'dl',
  l: 'l',
  lzicka: 'lžička',
  lzice: 'lžíce',
  hrnek: 'hrnek',
  spetka: 'špetka',
  ks: 'ks',
  strouzek: 'stroužek',
  platek: 'plátek',
  hrst: 'hrst',
  baleni: 'balení',
  svazek: 'svazek',
};

// Keys are lowercase without diacritics and without a trailing dot.
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', gram: 'g', gramu: 'g', gramy: 'g',
  dkg: 'dkg', dag: 'dkg', deka: 'dkg',
  kg: 'kg', kilo: 'kg',
  ml: 'ml',
  dl: 'dl', decilitr: 'dl', decilitru: 'dl', decilitry: 'dl',
  l: 'l', litr: 'l', litru: 'l', litry: 'l',
  lzicka: 'lzicka', lzicky: 'lzicka', lzicek: 'lzicka', lzicku: 'lzicka', kl: 'lzicka',
  lzice: 'lzice', lzic: 'lzice', pl: 'lzice',
  hrnek: 'hrnek', hrnky: 'hrnek', hrnku: 'hrnek',
  spetka: 'spetka', spetky: 'spetka', spetku: 'spetka',
  ks: 'ks', kus: 'ks', kusy: 'ks', kusu: 'ks',
  strouzek: 'strouzek', strouzky: 'strouzek', strouzku: 'strouzek',
  platek: 'platek', platky: 'platek', platku: 'platek',
  hrst: 'hrst', hrsti: 'hrst',
  baleni: 'baleni', bal: 'baleni',
  svazek: 'svazek', svazky: 'svazek', svazku: 'svazek',
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
};

const OPTIONAL_PATTERN = /\b(volitelne|na ozdobu|nepovinne)\b/;

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function parseQuantity(token: string): number | null {
  if (token in UNICODE_FRACTIONS) {
    return UNICODE_FRACTIONS[token];
  }
  const fraction = token.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const value = Number(token.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function lookupUnit(token: string): string | null {
  return UNIT_ALIASES[normalize(token).replace(/\.$/, '')] ?? null;
}

export function parseIngredientLine(
  line: string,
  position = 0,
  groupLabel: string | null = null,
): ParsedIngredient | null {
  const raw = line.replace(/^\s*[-•*–]\s*/, '').trim();
  if (!raw) {
    return null;
  }

  let rest = raw;
  let quantity: number | null = null;
  let unitCode: string | null = null;

  const quantityMatch = rest.match(/^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|[½¼¾⅓⅔])\s*/);
  if (quantityMatch) {
    quantity = parseQuantity(quantityMatch[1]);
    rest = rest.slice(quantityMatch[0].length);
  }

  const unitMatch = rest.match(/^(\S+)\s+(.*)$/);
  if (unitMatch && lookupUnit(unitMatch[1])) {
    unitCode = lookupUnit(unitMatch[1]);
    rest = unitMatch[2];
    if (quantity === null) {
      quantity = 1; // "špetka soli", "hrst petrželky"
    }
  } else if (quantity !== null) {
    unitCode = 'ks'; // "2 vejce"
  }

  const name = rest.trim() || raw;

  return {
    position,
    group_label: groupLabel,
    raw_text: raw,
    name,
    quantity,
    unit_code: unitCode,
    is_optional: OPTIONAL_PATTERN.test(normalize(raw)),
  };
}

// Multi-line input. Lines ending with ":" start a new group ("Na těsto:").
export function parseIngredients(text: string): ParsedIngredient[] {
  const result: ParsedIngredient[] = [];
  let groupLabel: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.endsWith(':')) {
      groupLabel = trimmed.slice(0, -1).trim() || null;
      continue;
    }
    const parsed = parseIngredientLine(trimmed, result.length, groupLabel);
    if (parsed) {
      result.push(parsed);
    }
  }

  return result;
}

export function formatQuantity(quantity: number | null, unitCode: string | null): string {
  if (quantity === null) {
    return '';
  }
  const rounded = Math.round(quantity * 100) / 100;
  const amount = rounded.toLocaleString('cs-CZ');
  const unit = unitCode ? UNIT_LABELS[unitCode] ?? unitCode : '';
  return unit ? `${amount} ${unit}` : amount;
}
