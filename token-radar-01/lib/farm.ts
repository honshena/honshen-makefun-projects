import { documentedRoutes, type DocumentedRoute } from './routes.ts';

type Route = Readonly<{ label: string; action: string; exit: string }>;

const lending: Route = {
  label: 'Supply-only review',
  action: 'Identify the documented single-asset market, oracle, utilization and pause controls. Preview supply without borrowing or enabling collateral.',
  exit: 'Confirm that the documented pool would allow full withdrawal at current idle liquidity and list any conditions that block it.',
};
const vault: Route = {
  label: 'Vault-share review',
  action: 'Confirm whether a documented public vault exists. Compare share pricing, allocations, fee disclosures and the underlying asset.',
  exit: 'Compare the full-redemption preview with share value and note any queues, cooldowns, fees or unavailable routes.',
};
const swap: Route = {
  label: 'Spot and liquidity review',
  action: 'Confirm whether the official venue supports a spot quote, and verify both asset IDs. Compare price impact and fees for the intended size; do not execute.',
  exit: 'Preview the reverse quote and record total fees and price impact. For an LP route, additionally check the rule for removing liquidity.',
};
const debt: Route = {
  label: 'Collateral review',
  action: 'Compare the collateral list, oracle, peg history and liquidation ratio. Model a 30% collateral drawdown without opening debt.',
  exit: 'Find the official debt repayment and collateral release path. Record when it can fail; do not fund it.',
};
const restake: Route = {
  label: 'Slashing review',
  action: 'Verify the security module, slashable conditions, custody and the withdrawal queue; do not move staked assets.',
  exit: 'Archive the documented unbonding and slashing terms before revisiting.',
};
const rwa: Route = {
  label: 'Eligibility review',
  action: 'Check jurisdiction, allowlist, issuer, minimums and redemption windows. Do not upload identity documents during the comparison.',
  exit: 'Record who may redeem, in what asset, with which fees and notice periods.',
};
const defaultRoute: Route = {
  label: 'Product review',
  action: 'Identify the actual user action in the project’s product and governance docs; the snapshot cannot establish an eligible interaction.',
  exit: 'Stop if the product or exit has no published documentation or only third-party reward claims exist.',
};
const routes = new Map(Object.entries({
  Lending: lending, 'Uncollateralized Lending': defaultRoute, Dexs: swap,
  'Liquidity Manager': swap, 'Risk Curators': vault, 'Onchain Capital Allocator': vault,
  'Yield Aggregator': vault, Yield: vault, CDP: debt, 'CDP Manager': debt,
  Restaking: restake, 'Collateral Markets': restake, 'Staking Pool': restake, RWA: rwa, CeDeFi: rwa,
}));
function documentedPlan(route: DocumentedRoute) {
  const pilot = !route.research;
  const feeCap = route.chain === 'Ethereum' ? '$5' : '$2';
  const estimate = pilot ? '25–44 min' : '18–28 min';
  const quote = pilot
    ? `Add quoted gas, approvals, any request or claim transaction and product fees. Skip above ${feeCap} total; this is a budget ceiling, not a gas estimate.`
    : 'Public documentation checks only; no wallet signature, capital or fee.';
  const steps = [
    `01 · Verify / ${pilot ? '6–10' : '5–8'} min / $0 — ${route.verify} Deployment and user eligibility must be rechecked. No reward is verified.`,
    `02 · Budget & exit check / ${pilot ? '6–10' : '5–8'} min / $0 — ${route.quote} ${quote}`,
    `03 · ${pilot ? 'One conditional pilot / 6–12 min' : 'Research only / 4–6 min / $0'} — ${route.action}${pilot ? ' Illustrative exposure cap: $25, using an asset already on that chain. If the live minimum is higher or the round-trip quote is incomplete, do not sign.' : ''}`,
    `04 · ${pilot ? 'Redeem & reconcile / 7–12 min active' : 'Record & stop / 4–6 min / $0'} — ${route.exit}${pilot ? ' Include exit fees in the same round-trip budget; active time estimates exclude settlement.' : ''}`,
  ];
  return {
    kind: 'documented' as const, label: route.label, capital: pilot ? '$25 cap' : '$0',
    fee: pilot ? `${feeCap} fee cap` : '$0', minutes: estimate, window: route.liquidity,
    sources: route.sources, steps,
  };
}

export function farmPlan(protocol: { slug: string; name: string; category: string | null; chains: string[] }) {
  const named = documentedRoutes.get(protocol.slug);
  if (named && protocol.chains.includes(named.chain)) return documentedPlan(named);
  const route = routes.get(protocol.category ?? '') ?? defaultRoute;
  const network = protocol.chains.slice(0, 2).join(' / ') || 'network not reported';
  const steps = [
    `01 · Identify / 5–8 min / $0 — Locate the official docs for ${protocol.name}; compare the documented deployment with the snapshot (${network}). Resolve any address or chain mismatch before continuing.`,
    '02 · Verify eligibility / 5–8 min / $0 — Check official terms, activity criteria and any verified campaign. Do not sign. No reward is verified and a snapshot category is not a product guide.',
    `03 · Rehearse ${route.label.toLowerCase()} / 4–7 min / $0 — Research only: ${route.action} Treat any suggested action as a read-only checklist or preview, not a live order.`,
    `04 · Rehearse exit / 4–7 min / $0 — ${route.exit} Record a deposit minimum, full exit path and round-trip quote if these are public. If any are missing, retain the research-only status.`,
  ];
  return {
    kind: 'research' as const, label: 'Research only', capital: '$0', fee: '$0', minutes: '18–30 min',
    window: 'No settlement; no transaction', sources: [], steps,
  };
}
