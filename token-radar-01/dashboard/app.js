'use strict';
{
  const $ = id => document.getElementById(id);
  const radar = window.ATLAS;
  if (!radar) {
    $('status').textContent = 'Snapshot unavailable. Run the ATLAS build before opening this page.';
  } else {
    start(radar);
  }

  function start(data) {
    const perPage = 9;
    const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
    const short = n => n == null ? '—' : compact.format(n);
    const percentage = n => n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`;
    const $board = $('board');
    const $modal = $('detail');
    const $inputs = ['search', 'chain', 'category', 'scope', 'sort'].map($);
    const defaults = () => ({ page: 0, reference: false });
    let state = defaults();

    const text = (id, value) => { $(id).textContent = value; };
    const node = (tag, className, value) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (value !== undefined) element.textContent = value;
      return element;
    };
    const nodes = (parent, ...children) => { parent.append(...children); return parent; };
    const unique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));
    const label = p => p.category ?? 'Unclassified';
    const network = p => p.chains.length > 2 ? `${p.chains.slice(0, 2).join(' / ')} +${p.chains.length - 2}` : p.chains.join(' / ') || 'Network unreported';
    const datasets = [...data.rows, ...data.references];
    const signal = p => p.mcap_usd > 0 ? 'Market cap recorded' : p.symbol ? `Ticker: ${p.symbol}` : 'CoinGecko record';

    function options() {
      for (const chain of unique(datasets.flatMap(p => p.chains))) $('chain').add(new Option(chain, chain));
      for (const category of unique(datasets.map(label))) $('category').add(new Option(category, category));
    }
    function configure(reference) {
      $('candidate-view').setAttribute('aria-pressed', String(!reference));
      $('reference-view').setAttribute('aria-pressed', String(reference));
      $('scope').disabled = reference;
      $('sort').options[0].text = reference ? 'Market cap · high to low' : 'Value · high to low';
      text('board-heading', reference ? 'Token reference' : 'Launch candidates');
      text('value-caption', reference ? 'USD / REPORTED MARKET CAP' : 'USD / BASE SCENARIO');
      text('rank-col', reference ? 'Signal' : 'Rank');
      text('value-col', reference ? 'Market cap' : 'Implied value');
      text('route-col', reference ? 'Record' : 'Farm route');
    }
    function matching() {
      const [q, chain, category, scope, sort] = $inputs.map(input => input.value);
      const query = q.trim().toLowerCase();
      const list = (state.reference ? data.references : data.rows).filter(p => {
        return (!query || [p.name, p.slug, p.symbol].some(field => field?.toLowerCase().includes(query)))
          && (!chain || p.chains.includes(chain)) && (!category || label(p) === category)
          && (state.reference || !scope || (scope === 'watch' ? p.watch : !p.watch));
      });
      const sorts = {
        value: state.reference ? (a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) : (a, b) => a.rank - b.rank,
        growth: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
        tvl: (a, b) => b.tvl_usd - a.tvl_usd,
        name: (a, b) => a.name.localeCompare(b.name, 'en'),
      };
      return list.toSorted(sorts[sort] ?? sorts.value);
    }
    function row(p) {
      const name = node('strong', '', p.name);
      if (!state.reference) {
        const button = nodes(node('button', 'open'), name);
        button.type = 'button';
        button.dataset.slug = p.slug;
        button.addEventListener('click', () => openDetail(p));
        const identity = nodes(node('td', 'identity'), button);
        if (p.watch) identity.append(node('span', 'tag', 'WATCH'));
        identity.append(node('small', '', `${label(p)} · ${network(p)}`));
        return cells(p, identity, false);
      }
      return cells(p, nodes(node('td', 'identity'), name, node('small', '', `${label(p)} · ${network(p)}`)), true);
    }
    function cells(p, identity, reference) {
      const rank = node('td', 'rank', reference ? 'REF' : String(p.rank).padStart(2, '0'));
      const tvl = node('td', '', short(p.tvl_usd));
      const growth = node('td', p.change_7d > 0 ? 'up' : p.change_7d < 0 ? 'down' : 'rank', percentage(p.change_7d));
      const number = reference ? (p.mcap_usd > 0 ? p.mcap_usd : null) : p.implied_value_usd;
      const quote = node('td', 'quote', short(number));
      if (number !== null) quote.title = usd.format(number);
      const route = node('td', 'action', reference ? signal(p) : p.plan.label);
      return nodes(node('tr'), rank, identity, tvl, growth, quote, route);
    }
    function render() {
      configure(state.reference);
      const matches = matching();
      const pages = Math.max(1, Math.ceil(matches.length / perPage));
      const first = state.page * perPage;
      const current = matches.slice(first, first + perPage);
      text('status', `${matches.length} / ${state.reference ? data.references.length : data.rows.length} ${state.reference ? 'references' : 'candidates'}${state.reference ? ' · excluded from ranking' : ' · canonical ranks retained'}`);
      text('page-status', `${matches.length ? first + 1 : 0}–${first + current.length} · PAGE ${state.page + 1} / ${pages}`);
      const focused = document.activeElement;
      $('prev').disabled = state.page === 0;
      $('next').disabled = state.page + 1 >= pages;
      if (focused === $('prev') && $('prev').disabled && !$('next').disabled) $('next').focus();
      if (focused === $('next') && $('next').disabled && !$('prev').disabled) $('prev').focus();
      if (current.length) { $board.replaceChildren(...current.map(row)); return; }
      const message = node('td', 'empty', 'No matching records. Try clearing a filter.');
      message.colSpan = 6;
      $board.replaceChildren(nodes(node('tr'), message));
    }
    function pair(term, value) { return nodes(node('div'), node('dt', '', term), node('dd', '', value)); }
    function estimate(p) {
      const m = p.model;
      const scenarios = nodes(node('dl', 'scenarios'), pair('Low', short(p.low)), pair('Base', short(p.implied_value_usd)), pair('High', short(p.high)));
      scenarios.querySelectorAll('dd')[1].title = usd.format(p.implied_value_usd);
      const inputs = nodes(node('dl', 'inputs'), pair('Snapshot TVL', usd.format(p.tvl_usd)),
        pair('Peer proxy', `${m.multiple.toFixed(2)}× · ${m.peerCount} peers`), pair('Peer cohort', m.scope),
        pair('7d momentum', `${percentage(p.change_7d)} → ${m.growth.toFixed(2)}×`),
        pair('Time tracked', `${m.listingDays == null ? '—' : `${m.listingDays}d`} → ${m.age.toFixed(2)}×`), pair('Model evidence', m.evidence));
      return nodes(node('section', 'card'), node('p', 'eyebrow', '01 / IMPLIED USD'), node('h3', '', 'Launch scenario'), scenarios, inputs,
        node('p', 'aside-note', 'Scenario estimate, not a traded price, launch probability, or expected reward. The peer median uses reported market cap as a proxy.'));
    }
    function workflow(p) {
      const steps = p.farm_steps.map(step => {
        const delimiter = step.indexOf(' — ');
        return nodes(node('li'), node('strong', '', step.slice(0, delimiter)), node('span', '', step.slice(delimiter + 3)));
      });
      return nodes(node('section', 'card'), node('p', 'eyebrow', '02 / FARM WORKFLOW'), node('h3', '', p.plan.label),
        node('p', 'cost', `Illustrative · ${p.plan.capital} exposure · ${p.plan.fee} network fees · ${p.plan.minutes} active`), nodes(node('ol', 'steps'), ...steps));
    }
    function openDetail(p) {
      const heading = node('h2', 'detail-heading', p.name);
      heading.id = 'detail-name';
      const coverage = p.watch ? 'Official watchlist' : 'Extended scan';
      const caveat = p.tokenSignal ? 'Token signal recorded' : 'No token signal recorded';
      $('detail-body').replaceChildren(node('p', 'eyebrow', `RANK ${String(p.rank).padStart(2, '0')} / ${data.rows.length} · ${coverage.toUpperCase()}`),
        heading, node('p', 'detail-sub', `${label(p)} · ${p.chains.join(' / ') || 'Network unreported'} · ${caveat}`),
        nodes(node('div', 'detail-grid'), estimate(p), workflow(p)));
      $modal.showModal();
    }
    function update(changes) { state = { ...state, ...changes }; render(); }
    function bind() {
      $inputs.forEach(input => input.addEventListener(input.id === 'search' ? 'input' : 'change', () => update({ page: 0 })));
      $('candidate-view').addEventListener('click', () => update({ reference: false, page: 0 }));
      $('reference-view').addEventListener('click', () => update({ reference: true, page: 0 }));
      $('prev').addEventListener('click', () => update({ page: state.page - 1 }));
      $('next').addEventListener('click', () => update({ page: state.page + 1 }));
      $('reset').addEventListener('click', () => {
        $inputs.forEach(input => { input.value = input.id === 'sort' ? 'value' : ''; });
        update(defaults());
      });
      $('close').addEventListener('click', () => $modal.close());
    }
    text('date', data.asOf);
    text('source', `Source: ${data.source}. ${data.universe} protocol records. Watchlist TVL floor: ${usd.format(data.floor)}.`);
    text('stat-rows', data.rows.length);
    text('stat-watch', `${data.rows.filter(p => p.watch).length} / ${data.watchCount}`);
    text('stat-extended', data.rows.length - data.watchCount);
    text('stat-reference', data.references.length);
    options();
    bind();
    render();
  }
}
