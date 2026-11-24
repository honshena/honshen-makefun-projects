type Route = Readonly<{ label: string; action: string; exit: string; days: string; cap: string }>;

const lending: Route = {
  label: 'Supply-only pilot', cap: '$10–25', days: '2–7 days',
  action: 'Choose a documented single-asset supply market. Check utilization, oracle, and pause controls. Supply only; do not borrow or enable collateral.',
  exit: 'Check available liquidity and withdraw. If utilization or withdrawal latency rises, do not add funds.',
};
const vault: Route = {
  label: 'Vault-share pilot', cap: '$10–25', days: '3–7 days',
  action: 'Find a documented public vault for an asset you already hold. Check allocator/curator access, share pricing, caps, fees, and underlying strategies before minting a small share position.',
  exit: 'Try redeeming shares at the next permitted window; stop if liquidity, share pricing or redemption timing diverges from the published terms.',
};
const swap: Route = {
  label: 'Swap-first pilot', cap: '$5–15', days: '1–3 days',
  action: 'Compare a small spot swap against an independent quote. Check slippage and the token mint on both sides; make one useful swap only. Add no liquidity unless documented eligibility and impermanent-loss exposure have been assessed.',
  exit: 'Compare realized price and fees with the quote; avoid repeat volume and do not leave unwanted inventory.',
};
const debt: Route = {
  label: 'Collateral review', cap: '$0', days: 'No hold',
  action: 'Research only: compare the collateral list, oracle, peg history and liquidation ratio. Model a 30% collateral drawdown before considering any position; do not open debt to farm.',
  exit: 'Save the official eligibility and redemption references if available; otherwise mark the route unverified and move on.',
};
const restake: Route = {
  label: 'Exit and slashing review', cap: '$0', days: 'No hold',
  action: 'Research only: verify the security module, slashable conditions, withdrawal queue and custody. Do not move staked assets for an unconfirmed program.',
  exit: 'Archive the published unbonding and slashing terms before revisiting; no deposit is needed for the audit.',
};
const rwa: Route = {
  label: 'Eligibility review', cap: '$0', days: 'No hold',
  action: 'Research only: check jurisdiction, allowlist, issuer, minimums and redemption windows from official disclosures. Do not upload identity documents or transact solely for speculative rewards.',
  exit: 'Record who can redeem and when, including fees and notice periods; stop if those terms cannot be verified.',
};
const defaultRoute: Route = {
  label: 'Research only', cap: '$0', days: 'No hold',
  action: 'Research only: identify the protocol’s actual user action from its official product and governance pages. The snapshot alone cannot establish a safe or eligible transaction.',
  exit: 'Set a reminder to recheck official documentation or governance. Stop if only third-party reward claims exist.',
};
const routes = new Map(Object.entries({
  Lending: lending, 'Uncollateralized Lending': defaultRoute, Dexs: swap,
  'Liquidity Manager': swap, 'Risk Curators': vault, 'Onchain Capital Allocator': vault,
  'Yield Aggregator': vault, Yield: vault, CDP: debt, 'CDP Manager': debt,
  Restaking: restake, 'Collateral Markets': restake, 'Staking Pool': restake, RWA: rwa, CeDeFi: rwa,
}));
const lowFee = new Set(['Base', 'Arbitrum', 'Optimism', 'Polygon', 'Solana', 'Sui', 'Monad', 'Unichain']);

export function farmPlan(protocol: { name: string; category: string | null; chains: string[] }) {
  const route = routes.get(protocol.category ?? '') ?? defaultRoute;
  const chain = protocol.chains.find(item => lowFee.has(item)) ?? protocol.chains[0];
  const network = chain ? `on ${chain}, only if officially supported` : 'on a network listed by the official app';
  const pilot = route.cap !== '$0';
  const fee = !pilot ? '$0' : chain && lowFee.has(chain) ? '$0.05–2' : '$2–15';
  const minutes = pilot ? '20–35 min' : '12–20 min';
  const steps = [
    `01 · Verify / 5–8 min / $0 — Find ${protocol.name} through its published docs. Match chain ID and contract or mint with the explorer; read audit scope and admin controls. No signature required.`,
    `02 · Decide / 5–8 min / $0 — Check official eligibility, terms and any explicit qualifying actions ${network}. No reward is assumed. If evidence is absent, contradictory or restricted, use only the research route.`,
    `03 · ${route.label} / ${pilot ? '6–12 min if eligible' : '3–5 min'} — ${route.action} ${pilot ? `Illustrative exposure ${route.cap}; estimated network fees ${fee} round trip, excluding bridging, slippage and venue fees. Check the live quote first.` : '$0 capital and fees.'}`,
    `04 · Close / 3–7 min / ${route.days} review window — ${route.exit} Keep the transaction record if any, and remove any unneeded allowance. Review window is not an eligibility requirement.`,
  ];
  return { label: route.label, capital: route.cap, fee, minutes, window: route.days, steps };
}
