import { farmPlan } from './farm.ts';

export type Protocol = {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
};
type Snapshot = { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] };
const DAY = 86_400_000;
const MIN_PEERS = 5;
const DEFAULT_MULTIPLE = 0.35;
const MAX_VALUE = 100_000_000_000_000;
const optionalCategory = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX', 'Stablecoin Wrapper']);
const wrapper = /\b(?:wrapped|staked|staking|bridged)\b|\s+(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
const exchange = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const nonempty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const dollars = (x: unknown): x is number => finite(x) && Number.isSafeInteger(x) && x > 0;
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d\d-\d\d$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const nullableText = (x: unknown) => x === null || nonempty(x);
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function validProtocol(x: Protocol) {
  return x && typeof x === 'object' && nonempty(x.slug) && /^[^\s]{1,128}$/.test(x.slug) && nonempty(x.name)
    && nullableText(x.category) && Array.isArray(x.chains) && x.chains.every(nonempty) && dollars(x.tvl_usd)
    && (x.change_7d === null || finite(x.change_7d))
    // The seal has one -1 unavailable-cap sentinel; only positive caps can enter a peer pool.
    && (x.mcap_usd === null || (finite(x.mcap_usd) && Number.isSafeInteger(x.mcap_usd) && x.mcap_usd >= -1))
    && (x.listed_at === null || date(x.listed_at)) && nullableText(x.gecko_id) && nullableText(x.symbol);
}

export function parseSnapshot(raw: string): Snapshot {
  let s: Snapshot;
  try { s = JSON.parse(raw); } catch { throw new Error('Snapshot is not valid JSON.'); }
  if (!s || !date(s.as_of) || !nonempty(s.source) || !dollars(s.floor_usd) || !Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) {
    throw new Error('Snapshot metadata, protocols, or watchlist is invalid.');
  }
  if (!s.protocols.every(validProtocol)) throw new Error('Snapshot contains an invalid protocol record.');
  const slugs = new Set(s.protocols.map(p => p.slug));
  if (slugs.size !== s.protocols.length) throw new Error('Snapshot contains duplicate protocol slugs.');
  if (new Set(s.watchlist).size !== s.watchlist.length || !s.watchlist.every(slug => slugs.has(slug))) {
    throw new Error('Snapshot watchlist contains duplicate or unknown slugs.');
  }
  return s;
}

const hasSignal = (p: Protocol) => p.gecko_id !== null || p.symbol !== null || (p.mcap_usd ?? 0) > 0;
const excluded = (p: Protocol) => optionalCategory.has(p.category ?? '') || wrapper.test(p.name) || exchange.test(p.name);
const quantile = (sorted: number[], q: number) => {
  const i = (sorted.length - 1) * q;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
};

function peerBand(p: Protocol, peers: Protocol[]) {
  const similar = peers.filter(x => x.tvl_usd >= p.tvl_usd / 5 && x.tvl_usd <= p.tvl_usd * 5);
  const pools = [
    { scope: 'Category + size', set: similar.filter(x => x.category === p.category && p.category !== null) },
    { scope: 'Category', set: peers.filter(x => x.category === p.category && p.category !== null) },
    { scope: 'Size cohort', set: similar },
    { scope: 'All priced peers', set: peers },
  ];
  const cohort = pools.find(x => x.set.length >= MIN_PEERS);
  if (!cohort) return { scope: 'Assumption', peerCount: 0, multiple: DEFAULT_MULTIPLE, lowFactor: 0.45, highFactor: 2.15, peers: [] };
  const evidence = cohort.set.map(x => ({
    slug: x.slug, name: x.name, ratio: clamp(x.mcap_usd! / x.tvl_usd, 0.05, 3),
  })).toSorted((a, b) => a.ratio - b.ratio || order(a.slug, b.slug));
  const ratios = evidence.map(x => x.ratio);
  const multiple = quantile(ratios, 0.5);
  const tight = cohort.scope === 'Category + size';
  return {
    scope: cohort.scope, peerCount: ratios.length, multiple, peers: evidence,
    lowFactor: clamp(quantile(ratios, 0.25) / multiple, 0.35, tight ? 0.82 : 0.68),
    highFactor: clamp(quantile(ratios, 0.75) / multiple, tight ? 1.18 : 1.45, 2.6),
  };
}

const quote = (value: number) => clamp(Math.round(value), 1, MAX_VALUE);

function sensitivities(tvl: number, multiple: number, growth: number, age: number) {
  const shock = 0.2;
  return {
    shock,
    multipleDown: quote(tvl * (multiple * (1 - shock)) * growth * age),
    multipleUp: quote(tvl * (multiple * (1 + shock)) * growth * age),
    flatMomentum: quote(tvl * multiple * age),
    neutralAge: quote(tvl * multiple * growth),
  };
}

function score(p: Protocol, peers: Protocol[], asOf: string) {
  const band = peerBand(p, peers);
  const listingDays = p.listed_at === null ? null : Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(p.listed_at)) / DAY));
  const growth = p.change_7d === null ? 1 : 1 + clamp(p.change_7d, -35, 35) / 100;
  const age = listingDays === null ? 1 : 0.88 + 0.35 * Math.min(listingDays, 730) / 730;
  const raw = p.tvl_usd * band.multiple * growth * age;
  const value = quote(raw);
  const uncertainty = p.change_7d === null || listingDays === null ? 1.18 : 1;
  const evidence = band.scope === 'Category + size' && band.peerCount >= 8 && uncertainty === 1 ? 'Stronger'
    : band.peerCount >= MIN_PEERS && uncertainty === 1 ? 'Moderate' : 'Limited';
  return {
    implied_value_usd: value,
    low: Math.min(value, quote(raw * band.lowFactor / uncertainty)),
    high: Math.max(value, quote(raw * band.highFactor * uncertainty)),
    model: { ...band, listingDays, growth, age, evidence, sensitivity: sensitivities(p.tvl_usd, band.multiple, growth, age) },
  };
}

export function buildRadar(snapshot: Snapshot) {
  const mandatory = new Set(snapshot.watchlist);
  const references = snapshot.protocols.filter(p => hasSignal(p) && !mandatory.has(p.slug))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || order(a.slug, b.slug));
  const peers = references.filter(p => p.gecko_id !== null && (p.mcap_usd ?? 0) > 0 && !excluded(p));
  // Let the official list, which also knows about parent protocols, decide the above-floor universe.
  const rows = snapshot.protocols.filter(p => mandatory.has(p.slug) || (p.tvl_usd < snapshot.floor_usd && !hasSignal(p) && !excluded(p)))
    .map(p => {
      const { steps, ...plan } = farmPlan(p);
      return { ...p, ...score(p, peers, snapshot.as_of), watch: mandatory.has(p.slug),
        tokenSignal: hasSignal(p), plan, farm_steps: steps };
    })
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd || order(a.slug, b.slug))
    .map((p, index) => ({ ...p, rank: index + 1 }));
  return {
    asOf: snapshot.as_of, source: snapshot.source, floor: snapshot.floor_usd,
    watchCount: mandatory.size, universe: snapshot.protocols.length, rows, references,
  };
}
