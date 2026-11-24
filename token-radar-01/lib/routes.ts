type Source = Readonly<{ title: string; url: string }>;
export type DocumentedRoute = Readonly<{
  label: string; chain: string; liquidity: string; sources: readonly Source[];
  verify: string; quote: string; action: string; exit: string; research?: true;
}>;

// Official documents establish product mechanics, not a current quote, eligible wallet or verified reward.
export const documentedRoutes: ReadonlyMap<string, DocumentedRoute> = new Map(Object.entries({
  'steakhouse-financial': {
    label: 'Prime Instant USDC', chain: 'Base', liquidity: 'Liquidity-dependent exit',
    sources: [
      { title: 'Steakhouse · Prime Instant product and deployments', url: 'https://www.steakhouse.financial/docs/products/vault-products/current/prime-instant' },
    ],
    verify: 'Open the documented Steakhouse Prime Instant USDC Base Morpho V2 vault, not the Ethereum vault or the separate Coinbase product. Match the vault and underlying USDC on Base.',
    quote: 'Check deposit capacity, available withdrawal liquidity, and preview approval, deposit and redemption. Do not bridge to do this pilot.',
    action: 'If the route and costs pass, deposit only USDC already on Base. Record the vault shares received and the USDC redemption preview.',
    exit: 'Preview a full withdrawal; do not assume “Instant” is guaranteed. If liquidity is inadequate or the preview fails, stop adding funds and recheck availability.',
  },
  gauntlet: {
    label: 'USD Alpha · Base', chain: 'Base', liquidity: '6–12 hours on average for redemption; not guaranteed',
    sources: [
      { title: 'Gauntlet · How to Supply', url: 'https://vaultbook.gauntlet.xyz/vaults/gauntlet-usd-alpha-vault/how-to-supply' },
      { title: 'Gauntlet · Async integration', url: 'https://vaultbook.gauntlet.xyz/vaults/gauntlet-usd-alpha-vault/how-to-integrate-with-gauntlet-usd-alpha' },
    ],
    verify: 'Find Gauntlet USD Alpha (gtUSDa), select Base and match the USDC asset and deposit router in the official flow.',
    quote: 'Preview the full deposit and redemption request costs, including approval if needed. Verify that an asynchronous exit is acceptable and that the vault accepts the pilot size.',
    action: 'Submit one approved USDC deposit request only if the checks pass. It is asynchronous: wait for gtUSDa in the wallet; do not submit a duplicate if the request is pending.',
    exit: 'Request USDC redemption and track the request until the wallet receives USDC. The supply guide reports 6–12 hours on average, not an SLA. No second deposit before settlement.',
  },
  veda: {
    label: 'Liquid USD · Optimism', chain: 'Optimism', liquidity: 'Estimated up to 3 days for withdrawal; not guaranteed',
    sources: [
      { title: 'Veda · ether.fi integration', url: 'https://veda.tech/customer/etherfi' },
      { title: 'ether.fi · Liquid USD vault', url: 'https://etherfi.gitbook.io/etherfi/products/liquid/live-vaults/liquid-usd-vault' },
      { title: 'ether.fi · Withdrawal timelines', url: 'https://help.ether.fi/en/articles/269720-typical-liquid-withdrawal-timelines' },
    ],
    verify: 'Use the ether.fi Liquid USD vault powered by Veda, not Liquid ETH. Select Optimism and verify the vault and USDC deposit option in the current app.',
    quote: 'Preview receipt shares, queue redemption and any network or vault fees. Skip if the active route requires bridging or the minimum exceeds your cap.',
    action: 'If within budget, submit one USDC deposit and record shares. Use the same vault and chain for the exit; do not treat the receipt as instantly redeemable.',
    exit: 'Use the published Liquid withdrawal queue. The operator estimates up to 3 days for Liquid USD; confirm current terms and track the request separately from active task time.',
  },
  upshift: {
    label: 'NEMO USDC Prime', chain: 'Ethereum', liquidity: 'Standard exit within 30 days per vault page; recheck terms',
    sources: [
      { title: 'Upshift · NEMO USDC Prime', url: 'https://app.upshift.finance/vaults/ethereum/nemo-usdc-prime' },
      { title: 'Upshift · Request and claim flow', url: 'https://docs.upshift.finance/sdk/quick-start' },
    ],
    verify: 'Find NEMO USDC Prime on Ethereum (USDC in, nUSDC shares). Do not substitute the distinct upUSDC product from the SDK walkthrough.',
    quote: 'Choose the standard withdrawal path and check the deposit minimum and round-trip Ethereum gas. The vault page lists zero standard withdrawal fee, not zero gas; instant withdrawal can charge a fee.',
    action: 'If the live checks pass and you accept the long exit window, make one USDC deposit and record nUSDC shares. Otherwise remain in research mode.',
    exit: 'Submit a standard redemption and follow the vault’s claim instructions. The vault page states processing within 30 days; do not rely on the separate instant exit.',
  },
  curvance: {
    label: 'Monad · Supply only', chain: 'Monad', liquidity: 'Idle pool liquidity required to exit',
    sources: [
      { title: 'Curvance · Monad addresses', url: 'https://docs.curvance.com/app/protocol-overview/monad-contract-addresses.md' },
      { title: 'Curvance · Lend assets', url: 'https://docs.curvance.com/app/developer-docs/quick-start-guides/loans-and-collateral/lend-assets.md' },
      { title: 'Curvance · Withdraw', url: 'https://docs.curvance.com/app/developer-docs/quick-start-guides/loans-and-collateral/withdraw.md' },
    ],
    verify: 'Select Monad mainnet and match the isolated lending market and cToken to the official address registry. Use only an underlying asset you already hold.',
    quote: 'Inspect idle market liquidity, supply limits and pause state, then preview a deposit and full redemption with gas. Do not borrow or enable collateral.',
    action: 'Use plain supply to receive cToken shares in the matching market; do not take the collateral or Earn Vault route. Record share balance and redemption preview.',
    exit: 'Redeem cToken shares back to underlying. A paused market or insufficient idle cash can block the exit; if so, do not add funds and recheck market status.',
  },
  tydro: {
    label: 'Ink · Supply only', chain: 'Ink', liquidity: 'No supply lockup; idle pool liquidity required',
    sources: [
      { title: 'Tydro · Protocol overview', url: 'https://docs.tydro.com/i.-introduction/overview.md' },
      { title: 'Tydro · Pool contract', url: 'https://docs.tydro.com/vii.-developers/developer-overview/smart-contracts/pool.md' },
      { title: 'Tydro · Withdraw', url: 'https://docs.tydro.com/iii.-using-tydro/repay-loans-and-withdraw.md' },
    ],
    verify: 'Select Ink and a supported reserve in Tydro’s public lending market. Do not use the separate permissioned market; match the underlying and pool addresses.',
    quote: 'Read utilization, available liquidity and reserve status before previewing supply and full withdrawal. Price the required approval and any extra collateral toggle; do not borrow.',
    action: 'If the preview and reserve pass, supply the supported asset and record the aToken. Keep the position free of debt.',
    exit: 'Withdraw the underlying against the aToken. There is no supply lockup, but withdrawal requires unborrowed liquidity. Defer entry if the full exit cannot be previewed.',
  },
  onre: {
    label: 'ONyc · Exit eligibility', chain: 'Solana', liquidity: 'Redemption eligibility and liquidity must be verified', research: true,
    sources: [
      { title: 'OnRe · Access routes', url: 'https://docs.onre.finance/for-capital-providers/open-access-vs-institutional-access.md' },
      { title: 'OnRe · Onchain redemptions', url: 'https://docs.onre.finance/for-capital-providers/redemptions-and-onchain-liquidity.md' },
      { title: 'OnRe · FAQ and conditions', url: 'https://docs.onre.finance/technical-resources/frequently-asked-questions.md' },
    ],
    verify: 'Find ONyc on Solana in OnRe’s official docs. It is reinsurance exposure, not a stablecoin. Check which access route applies and whether your jurisdiction is allowed.',
    quote: 'Separate ability to acquire ONyc from eligibility to redeem. Confirm whether your wallet would be verified for primary redemption and obtain the current minimum, quote currency and fees from the operator.',
    action: 'Reconcile the onchain redemption page’s USDG route with the FAQ before relying on any timing or conversion. Write down the default exit and the fallback if liquidity is thin; do not mint or buy.',
    exit: 'If eligibility, timing or liquidity remains unverified, stop. Record the operator’s dated confirmation before reconsidering; no position is opened in this route.',
  },
  usdd: {
    label: 'USDD Savings · No debt', chain: 'Ethereum', liquidity: 'No documented Savings lockup; check exit preview',
    sources: [
      { title: 'USDD · Savings', url: 'https://docs.usdd.io/user-guide/usdd-savings.md' },
      { title: 'USDD · Deployments', url: 'https://docs.usdd.io/developers/deployment-addresses.md' },
      { title: 'USDD · Frontend terms', url: 'https://docs.usdd.io/legals/terms-of-use.md' },
    ],
    verify: 'Use USDD Savings on Ethereum, not TRON’s collateral Vault or PSM. Confirm the Savings and USDD addresses and frontend eligibility. USDD is the existing stablecoin product, not a modeled launch.',
    quote: 'Review peg risk and preview both directions, including Ethereum gas and approvals. Only consider Savings if you already hold USDD on Ethereum and the approved cap is viable.',
    action: 'If the checks pass, deposit USDD into Savings and record the sUSDD receipt and exchange preview. Do not mint USDD against collateral or open debt for this workflow.',
    exit: 'Use Savings to redeem sUSDD for USDD; the guide states no lockup. Recheck preview and peg before entry; recovering USDD is not the same as exiting into dollars.',
  },
} satisfies Record<string, DocumentedRoute>));
