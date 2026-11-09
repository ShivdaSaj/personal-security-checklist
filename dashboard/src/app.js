/* Defense Console — a customizable, visual personal security checklist.
 * All checklist state lives in localStorage and never leaves the browser. The only network
 * request is the optional footer newsletter sign-up, which posts just the email entered. */
(() => {
  'use strict';

  const STORE_KEY = 'defense-console:v1';
  const LEVELS = ['essential', 'optional', 'advanced'];
  const PALETTE = {
    blue: '#60a5fa', cyan: '#22d3ee', emerald: '#34d399', fuchsia: '#e879f9', indigo: '#818cf8', lime: '#a3e635',
    pink: '#f472b6', purple: '#c084fc', red: '#f87171', teal: '#2dd4bf', violet: '#a78bfa', yellow: '#facc15',
    orange: '#fb923c', sky: '#38bdf8', amber: '#fbbf24', rose: '#fb7185',
  };
  const ACCENTS = { cyan: '#22d3ee', emerald: '#34d399', violet: '#a78bfa', pink: '#f472b6', amber: '#fbbf24', blue: '#60a5fa', lime: '#a3e635', red: '#f87171' };
  const ACCENTS_LIGHT = { cyan: '#0891b2', emerald: '#059669', violet: '#7c3aed', pink: '#db2777', amber: '#b45309', blue: '#2563eb', lime: '#4d7c0f', red: '#dc2626' };
  const PRESETS = [
    { id: 'everyday', name: 'Everyday user', desc: 'Essential actions only. The 20% that stops 80% of attacks.', levels: { essential: true, optional: false, advanced: false } },
    { id: 'enthusiast', name: 'Privacy enthusiast', desc: 'Essential and optional actions for solid everyday privacy.', levels: { essential: true, optional: true, advanced: false } },
    { id: 'highrisk', name: 'High-risk profile', desc: 'Everything, including advanced. For journalists, activists and admins.', levels: { essential: true, optional: true, advanced: true } },
  ];

  const defaults = () => ({
    done: {}, ignored: {}, notes: {}, prio: {}, hidden: {},
    custom: [], customSections: [],
    scope: { essential: true, optional: true, advanced: true },
    weights: { essential: 3, optional: 2, advanced: 1 },
    theme: null, accent: 'cyan', history: [],
    view: { status: 'all', levels: { essential: true, optional: true, advanced: true }, sort: 'default', q: '' },
  });

  let state = load();
  let DATA = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && typeof s === 'object') {
        const d = defaults();
        return { ...d, ...s, weights: { ...d.weights, ...s.weights }, scope: { ...d.scope, ...s.scope }, view: { ...d.view, ...s.view, levels: { ...d.view.levels, ...(s.view || {}).levels } } };
      }
    } catch (_) { /* storage unavailable */ }
    return defaults();
  }
  function save() {
    recordHistory();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { toast('Could not save — browser storage is unavailable'); }
  }

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const today = () => new Date().toISOString().slice(0, 10);
  const linkify = (s) => esc(s).replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, '<br>');
  const color = (c) => PALETTE[c] || (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : PALETTE.cyan);
  function icon(name, cls = 'ic') {
    const i = DATA.icons[name] || DATA.icons.shield || DATA.icons.star;
    return i ? `<svg class="${cls}" viewBox="${i.vb}" aria-hidden="true"><path d="${i.path}"/></svg>` : '';
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- model ----------
  function model() {
    const base = DATA.sections.map((s) => ({ ...s, custom: false, checklist: s.checklist.map((c) => ({ ...c, custom: false })) }));
    for (const cs of state.customSections) {
      base.push({ title: cs.title, slug: cs.slug, description: cs.description || 'Your own section', intro: '', icon: cs.icon || 'star', color: cs.color || 'cyan', custom: true, checklist: [], softwareLinks: [], helpfulTools: [], furtherResources: [] });
    }
    const bySlug = Object.fromEntries(base.map((s) => [s.slug, s]));
    for (const c of state.custom) {
      const sec = bySlug[c.section] || bySlug[state.customSections[0]?.slug];
      if (sec) sec.checklist.push({ id: c.id, point: c.point, pointHtml: esc(c.point), details: c.details ? `<p>${linkify(c.details)}</p>` : '', priority: c.priority, custom: true });
    }
    for (const s of base) {
      for (const it of s.checklist) {
        it.key = `${s.slug}/${it.id}`;
        it.basePriority = it.priority;
        it.priority = state.prio[it.key] || it.priority;
        it.section = s;
        it.done = !!state.done[it.key] && !state.ignored[it.key];
        it.ignored = !!state.ignored[it.key];
        it.inScope = !!state.scope[it.priority];
      }
      s.hidden = !!state.hidden[s.slug];
    }
    return base;
  }
  const visibleSections = (m) => m.filter((s) => !s.hidden && s.checklist.length);
  function stats(items) {
    const r = { total: 0, done: 0, ignored: 0, w: 0, wDone: 0, by: {} };
    for (const l of LEVELS) r.by[l] = { total: 0, done: 0 };
    for (const it of items) {
      if (it.ignored) { r.ignored++; continue; }
      if (!it.inScope) continue;
      const w = Number(state.weights[it.priority]) || 0;
      r.total++; r.w += w; r.by[it.priority].total++;
      if (it.done) { r.done++; r.wDone += w; r.by[it.priority].done++; }
    }
    r.score = r.w ? Math.round((r.wDone / r.w) * 100) : 0;
    return r;
  }
  const grade = (s) => (s >= 90 ? ['A', 'Hardened'] : s >= 75 ? ['B', 'Strong'] : s >= 60 ? ['C', 'Solid'] : s >= 40 ? ['D', 'Developing'] : s >= 20 ? ['E', 'Exposed'] : ['F', 'Getting started']);

  function recordHistory() {
    if (!DATA) return;
    const m = model();
    const st = stats(visibleSections(m).flatMap((s) => s.checklist));
    const d = today();
    const h = state.history;
    if (h.length && h[h.length - 1].d === d) h[h.length - 1].s = st.score;
    else h.push({ d, s: st.score });
    if (h.length > 366) h.splice(0, h.length - 366);
  }

  // ---------- SVG charts ----------
  const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  function arc(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function gauge(score) {
    const [g, label] = grade(score);
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5, a1 = a0 + span * Math.max(0.001, score / 100);
    const ticks = Array.from({ length: 31 }, (_, i) => {
      const a = a0 + (span * i) / 30; const [x0, y0] = polar(130, 130, 118, a); const [x1, y1] = polar(130, 130, i % 5 ? 112 : 106, a);
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--line-strong)" stroke-width="${i % 5 ? 1 : 2}"/>`;
    }).join('');
    return `<svg class="gauge" viewBox="0 0 260 230" role="img" aria-label="Security score ${score} out of 100, grade ${g}">
      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="var(--advanced)"/><stop offset=".5" stop-color="var(--optional)"/><stop offset="1" stop-color="var(--essential)"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      ${ticks}
      <path d="${arc(130, 130, 92, a0, a0 + span)}" fill="none" stroke="var(--track)" stroke-width="18" stroke-linecap="round"/>
      <path d="${arc(130, 130, 92, a0, a1)}" fill="none" stroke="url(#gg)" stroke-width="18" stroke-linecap="round" filter="url(#glow)"/>
      <text x="130" y="128" text-anchor="middle" font-size="56" font-weight="800" fill="var(--text)">${score}</text>
      <text x="130" y="152" text-anchor="middle" font-size="13" fill="var(--muted)">SECURITY SCORE</text>
      <text x="130" y="200" text-anchor="middle" font-size="22" font-weight="700" fill="var(--accent)">Grade ${g}</text>
      <text x="130" y="220" text-anchor="middle" font-size="12" fill="var(--muted)">${label}</text></svg>`;
  }
  function rings(by) {
    const cols = { essential: 'var(--essential)', optional: 'var(--optional)', advanced: 'var(--advanced)' };
    const out = LEVELS.map((l, i) => {
      const r = 80 - i * 22, c = 2 * Math.PI * r, p = by[l].total ? by[l].done / by[l].total : 0;
      return `<circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--track)" stroke-width="14"/>
        <circle cx="100" cy="100" r="${r}" fill="none" stroke="${cols[l]}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 100 100)"><title>${l}: ${by[l].done}/${by[l].total}</title></circle>`;
    }).join('');
    return `<svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Progress by priority">${out}</svg>`;
  }
  function miniRing(p, c, size = 54) {
    const r = size / 2 - 5, C = 2 * Math.PI * r, h = size / 2;
    return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="var(--track)" stroke-width="5"/>
      <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${((C * p) / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${h} ${h})"/>
      <text x="${h}" y="${h + 4}" text-anchor="middle" font-size="${size / 4.2}" font-weight="700" fill="var(--text)">${p}%</text></svg>`;
  }
  function radar(secs) {
    const n = secs.length; if (n < 3) return '<p class="sub">Add at least three visible sections to see the radar.</p>';
    const cx = 220, cy = 200, R = 140, ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
    let grid = '';
    for (const f of [0.25, 0.5, 0.75, 1]) grid += `<polygon points="${secs.map((_, i) => polar(cx, cy, R * f, ang(i)).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`;
    const axes = secs.map((_, i) => { const [x, y] = polar(cx, cy, R, ang(i)); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/>`; }).join('');
    const pts = secs.map((s, i) => polar(cx, cy, R * Math.max(0.02, s.pct / 100), ang(i)));
    const dots = pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color(secs[i].color)}"><title>${esc(secs[i].title)}: ${secs[i].pct}%</title></circle>`).join('');
    const labels = secs.map((s, i) => {
      const [x, y] = polar(cx, cy, R + 22, ang(i)); const a = Math.cos(ang(i));
      return `<a href="#/section/${s.slug}"><text class="lbl" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${a > 0.2 ? 'start' : a < -0.2 ? 'end' : 'middle'}">${esc(s.title)} · ${s.pct}%</text></a>`;
    }).join('');
    return `<svg viewBox="-90 -10 620 420" width="620" role="img" aria-label="Progress per section radar chart">${grid}${axes}
      <polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent)" stroke-width="2"/>${dots}${labels}</svg>`;
  }
  function trend(history) {
    const h = history.slice(-60);
    if (h.length < 2) return '<p class="sub">Your score trend will appear here as you make progress over multiple days.</p>';
    const W = 600, H = 150, P = 24, x = (i) => P + ((W - 2 * P) * i) / (h.length - 1), y = (s) => H - P - ((H - 2 * P) * s) / 100;
    const line = h.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.s).toFixed(1)}`).join('');
    const area = `${line}L${x(h.length - 1).toFixed(1)} ${H - P}L${P} ${H - P}Z`;
    const grid = [0, 50, 100].map((v) => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text class="lbl" x="${P - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Score history"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#tg)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      <text class="lbl" x="${P}" y="${H - 6}">${h[0].d}</text><text class="lbl" x="${W - P}" y="${H - 6}" text-anchor="end">${h[h.length - 1].d}</text></svg>`;
  }
  function segBar(st) {
    const t = st.total || 1;
    return `<div class="seg" title="${st.done}/${st.total} done"><span class="e" style="width:${(st.by.essential.done / t) * 100}%"></span><span class="o" style="width:${(st.by.optional.done / t) * 100}%"></span><span class="a" style="width:${(st.by.advanced.done / t) * 100}%"></span></div>`;
  }
  const legend = () => `<div class="legend"><span><i style="background:var(--essential)"></i>Essential</span><span><i style="background:var(--optional)"></i>Optional</span><span><i style="background:var(--advanced)"></i>Advanced</span></div>`;

  // ---------- views ----------
  function viewDashboard() {
    const m = model(), secs = visibleSections(m), all = secs.flatMap((s) => s.checklist), st = stats(all);
    const secStats = secs.map((s) => { const ss = stats(s.checklist); return { ...s, st: ss, pct: pct(ss.done, ss.total) }; });
    const next = all.filter((i) => !i.done && !i.ignored && i.inScope)
      .sort((a, b) => (state.weights[b.priority] - state.weights[a.priority]) || (a.section.checklist.indexOf(a) - b.section.checklist.indexOf(b))).slice(0, 6);
    const weakest = [...secStats].filter((s) => s.st.total).sort((a, b) => a.pct - b.pct)[0];
    return `
      <div class="pagehead"><div><div class="eyebrow">Your security posture</div><h1>Dashboard</h1>
        <p>${st.done} of ${st.total} in-scope actions complete${weakest ? ` · weakest area: <a href="#/section/${weakest.slug}">${esc(weakest.title)}</a>` : ''}</p></div>
        <div class="chips"><a class="btn" href="#/customize">Customize</a><a class="btn primary" href="#/all">Open checklist</a></div></div>
      <div class="grid dash">
        <section class="panel span-7"><div class="hero">${gauge(st.score)}
          <div class="stats">
            <div class="stat"><div class="v">${st.done}<small style="font-size:.9rem;color:var(--muted)">/${st.total}</small></div><div class="l">Actions completed</div></div>
            <div class="stat"><div class="v">${st.ignored}</div><div class="l">Marked not applicable</div></div>
            <div class="stat e"><div class="v">${st.by.essential.total - st.by.essential.done}</div><div class="l">Essential remaining</div></div>
            <div class="stat o"><div class="v">${st.by.optional.total - st.by.optional.done}</div><div class="l">Optional remaining</div></div>
            <div class="stat a"><div class="v">${st.by.advanced.total - st.by.advanced.done}</div><div class="l">Advanced remaining</div></div>
            <div class="stat"><div class="v">${secStats.filter((s) => s.st.total && s.pct === 100).length}<small style="font-size:.9rem;color:var(--muted)">/${secs.length}</small></div><div class="l">Sections complete</div></div>
          </div></div></section>
        <section class="panel span-5"><h2>Progress by priority</h2><p class="sub">Score weights: ${LEVELS.map((l) => `${l} ×${state.weights[l]}`).join(' · ')}</p>
          <div class="chartwrap">${rings(st.by)}<div class="grid" style="gap:10px">${LEVELS.map((l) => `<div><span class="badge ${l}">${l}</span> <b>${pct(st.by[l].done, st.by[l].total)}%</b> <small style="color:var(--muted)">${st.by[l].done}/${st.by[l].total}</small></div>`).join('')}</div></div></section>
        <section class="panel span-7"><h2>Coverage radar</h2><p class="sub">Completion per section. Click a label to jump in.</p><div class="chartwrap">${radar(secStats)}</div></section>
        <section class="panel span-5"><h2>Next best actions</h2><p class="sub">Highest-impact items you haven't done yet.</p>
          ${next.length ? `<ul class="actions">${next.map((i) => `<li><input class="check" type="checkbox" data-act="done" data-key="${i.key}" style="--pc:var(--${i.priority})" aria-label="Mark done"><a href="#/section/${i.section.slug}/${i.id}">${i.pointHtml}<span class="sec">${esc(i.section.title)}</span></a><span class="badge ${i.priority}">${i.priority}</span></li>`).join('')}</ul>` : '<div class="empty">🎉 Nothing left in scope. Great work!</div>'}</section>
        <section class="panel span-12"><h2>Security matrix</h2><p class="sub">Every action as a tile — filled when done, striped when not applicable. Click a tile to open it.</p>${legend()}
          <div class="matrix" style="margin-top:14px">${secStats.map((s) => `<a class="row-l" href="#/section/${s.slug}">${esc(s.title)} <b>${s.pct}%</b></a><div class="cells">${s.checklist.map((i) => `<button class="cell p-${i.priority}${i.done ? ' done' : ''}${i.ignored ? ' ign' : ''}" data-go="#/section/${s.slug}/${i.id}" title="${esc(i.point)} (${i.priority}${i.done ? ', done' : i.ignored ? ', n/a' : ''})" aria-label="${esc(i.point)}"></button>`).join('')}</div>`).join('')}</div></section>
        <section class="panel span-12"><h2>Score history</h2>${trend(state.history)}</section>
      </div>
      <h2 style="margin:28px 0 14px">Sections</h2>
      <div class="grid cards">${secStats.map((s) => `<a class="card" href="#/section/${s.slug}" style="--c:${color(s.color)}">${miniRing(s.pct, color(s.color))}<div style="flex:1;min-width:0"><h3>${icon(s.icon)} ${esc(s.title)}</h3><p>${esc(s.description)}</p><div style="margin-top:8px">${segBar(s.st)}</div><p>${s.st.done}/${s.st.total} done${s.custom ? ' · custom' : ''}</p></div></a>`).join('')}</div>`;
  }

  function toolbar(v, total, shown, opts = {}) {
    return `<div class="toolbar">
      <input type="search" id="q" placeholder="Filter items…" value="${esc(v.q)}" aria-label="Filter items">
      <div class="grp"><span>Show</span><div class="chips">${['all', 'remaining', 'completed', 'ignored'].map((s) => `<button class="chip" data-status="${s}" aria-pressed="${v.status === s}">${s}</button>`).join('')}</div></div>
      <div class="grp"><span>Level</span><div class="chips">${LEVELS.map((l) => `<button class="chip ${l[0]}" data-level="${l}" aria-pressed="${!!v.levels[l]}">${l}</button>`).join('')}</div></div>
      <select class="field" id="sort" aria-label="Sort">${[['default', 'Default order'], ['priority', 'Priority'], ['alpha', 'A → Z'], ['status', 'Remaining first']].map(([k, t]) => `<option value="${k}"${v.sort === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <div class="grp">${opts.bulk ? '<button class="btn sm" data-act="bulk-done">Mark shown done</button><button class="btn sm" data-act="bulk-undo">Clear shown</button>' : ''}<button class="btn sm" data-act="expand">Expand all</button></div>
      <span class="count">${shown} of ${total}</span></div>`;
  }
  function applyView(items, v) {
    const q = v.q.trim().toLowerCase();
    const order = { essential: 0, optional: 1, advanced: 2 };
    let r = items.filter((i) => {
      if (!v.levels[i.priority]) return false;
      if (v.status === 'remaining' && (i.done || i.ignored)) return false;
      if (v.status === 'completed' && !i.done) return false;
      if (v.status === 'ignored' && !i.ignored) return false;
      if (q && !(`${i.point} ${i.details} ${i.section.title} ${state.notes[i.key] || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
    if (v.sort === 'priority') r = [...r].sort((a, b) => order[a.priority] - order[b.priority]);
    if (v.sort === 'alpha') r = [...r].sort((a, b) => a.point.localeCompare(b.point));
    if (v.sort === 'status') r = [...r].sort((a, b) => (a.done || a.ignored) - (b.done || b.ignored));
    return r;
  }
  function itemHtml(i, showSection) {
    const note = state.notes[i.key] || '';
    return `<article class="item p-${i.priority}${i.done ? ' done' : ''}${i.ignored ? ' ignored' : ''}" id="item-${i.key.replace('/', '--')}" data-key="${i.key}">
      <div class="ihead">
        <input class="check" type="checkbox" data-act="done" data-key="${i.key}" ${i.done ? 'checked' : ''} ${i.ignored ? 'disabled' : ''} aria-label="Mark “${esc(i.point)}” as done">
        <button class="ititle" data-act="toggle">${i.pointHtml}</button>
        <div class="imeta">${note ? '<span class="notedot" title="Has a note"></span>' : ''}${showSection ? `<span class="secname">${esc(i.section.title)}</span>` : ''}${i.custom ? '<span class="badge custom">custom</span>' : ''}<span class="badge ${i.priority}">${i.priority}</span>
          <button class="tog" data-act="toggle" aria-label="Show details"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="m7 10 5 5 5-5z"/></svg></button></div>
      </div>
      <div class="ibody">${i.details || '<p><em>No details.</em></p>'}
        <div class="itools">
          <label><input type="checkbox" data-act="ignore" data-key="${i.key}" ${i.ignored ? 'checked' : ''}> Not applicable to me</label>
          <label>Priority <select class="field" data-act="prio" data-key="${i.key}">${LEVELS.map((l) => `<option value="${l}"${i.priority === l ? ' selected' : ''}>${l}${i.basePriority === l ? ' (default)' : ''}</option>`).join('')}</select></label>
          ${i.custom ? `<button class="btn sm danger" data-act="del-custom" data-id="${i.id}">Delete item</button>` : ''}
          <a class="btn sm" href="#/section/${i.section.slug}/${i.id}" data-act="permalink">Link</a>
          <textarea class="field" data-act="note" data-key="${i.key}" placeholder="Private notes (e.g. which accounts you've updated, when to re-check)…">${esc(note)}</textarea>
        </div></div></article>`;
  }

  function viewSection(slug, focusId) {
    const m = model(), s = m.find((x) => x.slug === slug);
    if (!s) return `<div class="empty">Section not found. <a href="#/">Back to dashboard</a></div>`;
    const st = stats(s.checklist), v = state.view, items = applyView(s.checklist, v), c = color(s.color);
    const idx = visibleSections(m).findIndex((x) => x.slug === slug), vs = visibleSections(m);
    const prev = vs[idx - 1], next = vs[idx + 1];
    const linkBlock = (title, arr) => arr && arr.length ? `<h3 style="margin-top:18px">${title}</h3><div class="linkgrid">${arr.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}<small>${esc(l.description || new URL(l.url).hostname)}</small></a>`).join('')}</div>` : '';
    setTimeout(() => focusId && focusItem(`${slug}/${focusId}`), 30);
    return `
      <div class="sechead" style="--c:${c}"><div class="big">${icon(s.icon)}</div>
        <div><div class="eyebrow" style="color:${c}">Section ${idx + 1} of ${vs.length}${s.hidden ? ' · hidden from dashboard' : ''}</div><h1>${esc(s.title)}</h1><p>${esc(s.description)}</p><div style="margin-top:10px;max-width:520px">${segBar(st)}</div></div>
        <div class="ringbox">${miniRing(pct(st.done, st.total), c, 96)}</div></div>
      ${s.intro ? `<div class="panel intro" style="margin-bottom:16px"><details class="more"><summary>Why this matters</summary><div style="margin-top:10px">${s.intro}</div></details></div>` : ''}
      ${toolbar(v, s.checklist.length, items.length, { bulk: true })}
      <div class="items">${items.length ? items.map((i) => itemHtml(i, false)).join('') : '<div class="empty">No items match these filters.</div>'}</div>
      <div class="panel" style="margin-top:18px"><h2>Add your own item to ${esc(s.title)}</h2>${customForm(slug)}</div>
      ${s.softwareLinks?.length || s.helpfulTools?.length || s.furtherResources?.length ? `<div class="panel" style="margin-top:18px">${linkBlock('Recommended software', s.softwareLinks)}${linkBlock('Helpful tools', s.helpfulTools)}${linkBlock('Further resources', s.furtherResources)}</div>` : ''}
      <div class="pagehead" style="margin-top:22px">${prev ? `<a class="btn" href="#/section/${prev.slug}">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="btn primary" href="#/section/${next.slug}">${esc(next.title)} →</a>` : '<a class="btn primary" href="#/">Back to dashboard</a>'}</div>`;
  }

  function viewAll() {
    const m = model(), secs = visibleSections(m), all = secs.flatMap((s) => s.checklist), v = state.view, items = applyView(all, v), st = stats(all);
    return `<div class="pagehead"><div><div class="eyebrow">Full checklist</div><h1>All actions</h1><p>${st.done}/${st.total} done · score ${st.score}</p></div><div style="min-width:260px;flex:0 1 380px">${segBar(st)}</div></div>
      ${toolbar(v, all.length, items.length, { bulk: true })}
      <div class="items">${items.length ? items.map((i) => itemHtml(i, true)).join('') : '<div class="empty">No items match these filters.</div>'}</div>`;
  }

  function customForm(slug) {
    const m = model();
    return `<form class="form" data-form="custom">
      <div class="row"><label>Action title<input class="field" name="point" required maxlength="140" placeholder="e.g. Rotate home Wi-Fi password"></label>
      <label>Priority<select class="field" name="priority">${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join('')}</select></label></div>
      ${slug ? `<input type="hidden" name="section" value="${esc(slug)}">` : `<label>Section<select class="field" name="section">${m.map((s) => `<option value="${esc(s.slug)}">${esc(s.title)}</option>`).join('')}</select></label>`}
      <label>Details (optional, URLs become links)<textarea class="field" name="details" rows="3" maxlength="2000"></textarea></label>
      <div><button class="btn primary" type="submit">Add item</button></div></form>`;
  }

  function viewCustomize() {
    const m = model(), base = m;
    const customItems = state.custom.map((c) => ({ ...c, sec: m.find((s) => s.slug === c.section) }));
    return `<div class="pagehead"><div><div class="eyebrow">Make it yours</div><h1>Customize</h1><p>Tailor the checklist to your threat model. Everything is stored locally in this browser.</p></div></div>
      <div class="grid dash">
        <section class="panel span-12"><h2>Threat-model presets</h2><p class="sub">Sets which priority levels count toward your score and appear as "next best actions".</p>
          <div class="presets">${PRESETS.map((p) => `<button class="preset" data-preset="${p.id}"><b>${p.name}${LEVELS.every((l) => !!state.scope[l] === p.levels[l]) ? ' ✓' : ''}</b><span>${p.desc}</span></button>`).join('')}</div>
          <div class="toggles" style="margin-top:12px">${LEVELS.map((l) => `<label><input type="checkbox" data-scope="${l}" ${state.scope[l] ? 'checked' : ''}> Include <span class="badge ${l}">${l}</span></label>`).join('')}</div></section>
        <section class="panel span-6"><h2>Score weighting</h2><p class="sub">How much each priority level contributes to your security score.</p>
          ${LEVELS.map((l) => `<div class="slider"><span class="badge ${l}">${l}</span><input type="range" min="0" max="10" step="1" value="${state.weights[l]}" data-weight="${l}" aria-label="${l} weight"><output>${state.weights[l]}</output></div>`).join('')}</section>
        <section class="panel span-6"><h2>Appearance</h2>
          <div class="form"><label>Theme<select class="field" data-setting="theme"><option value="">System</option><option value="dark"${state.theme === 'dark' ? ' selected' : ''}>Dark</option><option value="light"${state.theme === 'light' ? ' selected' : ''}>Light</option></select></label>
          <div><div style="font-size:.84rem;color:var(--muted);margin-bottom:6px">Accent colour</div><div class="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button class="swatch" style="--sw:${c}" data-accent="${k}" aria-pressed="${state.accent === k}" aria-label="${k}"></button>`).join('')}</div></div></div></section>
        <section class="panel span-6"><h2>Visible sections</h2><p class="sub">Hidden sections are excluded from the dashboard and score.</p>
          <div class="toggles">${base.map((s) => `<label style="--c:${color(s.color)}"><input type="checkbox" data-hide="${esc(s.slug)}" ${s.hidden ? '' : 'checked'}> ${esc(s.title)} <small style="color:var(--muted);margin-left:auto">${s.checklist.length}</small></label>`).join('')}</div></section>
        <section class="panel span-6"><h2>Add a custom section</h2>
          <form class="form" data-form="section"><label>Title<input class="field" name="title" required maxlength="60" placeholder="e.g. Work laptop"></label>
            <label>Description<input class="field" name="description" maxlength="120" placeholder="Short description"></label>
            <label>Colour<select class="field" name="color">${Object.keys(PALETTE).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></label>
            <div><button class="btn primary" type="submit">Create section</button></div></form>
          ${state.customSections.length ? `<ul class="customlist" style="margin-top:12px">${state.customSections.map((s) => `<li><span>${esc(s.title)}</span><a class="btn sm" href="#/section/${esc(s.slug)}">Open</a><button class="btn sm danger" data-act="del-section" data-slug="${esc(s.slug)}">Delete</button></li>`).join('')}</ul>` : ''}</section>
        <section class="panel span-6"><h2>Add a custom item</h2>${customForm(null)}</section>
        <section class="panel span-6"><h2>Your custom items (${customItems.length})</h2>
          ${customItems.length ? `<ul class="customlist">${customItems.map((c) => `<li><span>${esc(c.point)}<br><small style="color:var(--muted)">${esc(c.sec?.title || '—')}</small></span><span class="badge ${c.priority}">${c.priority}</span><button class="btn sm danger" data-act="del-custom" data-id="${esc(c.id)}">Delete</button></li>`).join('')}</ul>` : '<p class="sub">None yet.</p>'}</section>
        <section class="panel span-12"><h2>Data</h2><p class="sub">Back up your progress, move it to another device, or export a report.</p>
          <div class="chips"><button class="btn" data-act="export-json">Export backup (.json)</button><label class="btn" style="cursor:pointer">Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
          <button class="btn" data-act="export-csv">Export report (.csv)</button><button class="btn" data-act="export-md">Export checklist (.md)</button><button class="btn" data-act="print">Print</button>
          <button class="btn danger" data-act="reset-progress">Reset progress</button><button class="btn danger" data-act="reset-all">Reset everything</button></div></section>
      </div>`;
  }

  function viewAbout() {
    const total = DATA.sections.reduce((n, s) => n + s.checklist.length, 0);
    return `<div class="prose"><div class="eyebrow">About</div><h1 style="color:var(--text)">Defense Console</h1>
      <p>A customizable, visual take on the <a href="https://github.com/ShivdaSaj/personal-security-checklist" target="_blank" rel="noopener noreferrer">Personal Security Checklist</a> — ${total} actions across ${DATA.sections.length} areas to help you protect your privacy and secure your digital life. Inspired by <a href="https://digital-defense.io/" target="_blank" rel="noopener noreferrer">digital-defense.io</a>.</p>
      <h2>How it works</h2><p>Tick actions as you complete them, mark things that don't apply to you, re-prioritise items, add your own notes, items and sections. Your <b>security score</b> is a weighted percentage of in-scope actions completed — tune the weights and scope on the <a href="#/customize">Customize</a> page.</p>
      <h2>Privacy</h2><p>No accounts, no trackers, no external requests. All progress is kept in your browser's local storage. Use <em>Export backup</em> to move it between devices.</p>
      <h2>Priorities</h2><p><span class="badge essential">essential</span> — everyone should do these. <span class="badge optional">optional</span> — recommended for better privacy. <span class="badge advanced">advanced</span> — for high-risk profiles or the security-curious.</p>
      <h2>Shortcuts</h2><p><kbd>/</kbd> search · <kbd>g</kbd> then <kbd>d</kbd> dashboard · <kbd>g</kbd> then <kbd>c</kbd> checklist · <kbd>Esc</kbd> close</p>
      <p><small>Checklist data generated ${new Date(DATA.generated).toLocaleDateString()}.</small></p></div>`;
  }

  // ---------- router ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [page, a, b] = h.split('/');
    let html, nav = page || 'home';
    if (!page) html = viewDashboard();
    else if (page === 'all') html = viewAll();
    else if (page === 'section') { html = viewSection(decodeURIComponent(a || ''), b && decodeURIComponent(b)); nav = 'all'; }
    else if (page === 'customize') html = viewCustomize();
    else if (page === 'about') html = viewAbout();
    else html = '<div class="empty">Page not found. <a href="#/">Go to dashboard</a></div>';
    $('#main').innerHTML = html;
    $$('.mainnav a').forEach((el) => el.classList.toggle('active', el.dataset.nav === nav));
    const titles = { home: 'Dashboard', all: 'Checklist', customize: 'Customize', about: 'About' };
    document.title = `${page === 'section' ? ($('.sechead h1')?.textContent || 'Section') : titles[nav] || 'Defense Console'} · Defense Console`;
  }
  // Re-render preserving scroll position and focused filter input.
  function rerender() {
    const y = scrollY, f = document.activeElement, fid = f && f.id, pos = f && f.selectionStart;
    const open = $$('.item.open').map((e) => e.dataset.key);
    route();
    open.forEach((k) => $(`.item[data-key="${CSS.escape(k)}"]`)?.classList.add('open'));
    scrollTo(0, y);
    if (fid && $('#' + fid)) { const el = $('#' + fid); el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) { /* not text */ } }
  }
  function focusItem(key) {
    const el = $(`.item[data-key="${CSS.escape(key)}"]`);
    if (!el) return;
    el.classList.add('open', 'flash');
    el.scrollIntoView({ block: 'center' });
  }

  // ---------- actions ----------
  function setDone(key, val) { if (val) state.done[key] = true; else delete state.done[key]; }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCsv() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['Section', 'Item', 'Priority', 'Status', 'Custom', 'Notes']];
    for (const s of model()) for (const i of s.checklist) rows.push([s.title, i.point, i.priority, i.ignored ? 'n/a' : i.done ? 'done' : 'todo', i.custom ? 'yes' : '', state.notes[i.key] || '']);
    download(`security-checklist-${today()}.csv`, rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
  }
  function exportMd() {
    const m = model(), st = stats(visibleSections(m).flatMap((s) => s.checklist));
    let out = `# Personal Security Checklist\n\nScore: **${st.score}/100** (grade ${grade(st.score)[0]}) · ${st.done}/${st.total} done · exported ${today()}\n`;
    for (const s of m) {
      if (!s.checklist.length) continue;
      out += `\n## ${s.title}\n\n`;
      for (const i of s.checklist) out += `- [${i.done ? 'x' : ' '}] ${i.ignored ? '~~' : ''}${i.point}${i.ignored ? '~~ (n/a)' : ''} — _${i.priority}_${state.notes[i.key] ? `\n  > ${state.notes[i.key].replace(/\n/g, ' ')}` : ''}\n`;
    }
    download(`security-checklist-${today()}.md`, out, 'text/markdown');
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-status],[data-level],[data-preset],[data-accent],[data-go]');
    if (!t) return;
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.status) { state.view.status = t.dataset.status; save(); return rerender(); }
    if (t.dataset.level) { state.view.levels[t.dataset.level] = !state.view.levels[t.dataset.level]; save(); return rerender(); }
    if (t.dataset.preset) { state.scope = { ...PRESETS.find((p) => p.id === t.dataset.preset).levels }; save(); toast('Preset applied'); return rerender(); }
    if (t.dataset.accent) { state.accent = t.dataset.accent; save(); applyTheme(); return rerender(); }
    const act = t.dataset.act;
    if (act === 'toggle') { t.closest('.item').classList.toggle('open'); return; }
    if (act === 'expand') { const items = $$('.item'); const open = !items.every((i) => i.classList.contains('open')); items.forEach((i) => i.classList.toggle('open', open)); t.textContent = open ? 'Collapse all' : 'Expand all'; return; }
    if (act === 'permalink') return;
    if (act === 'bulk-done' || act === 'bulk-undo') {
      const keys = $$('.item').map((i) => i.dataset.key).filter((k) => !state.ignored[k]);
      if (act === 'bulk-done' && !confirm(`Mark ${keys.length} shown items as done?`)) return;
      keys.forEach((k) => setDone(k, act === 'bulk-done')); save(); return rerender();
    }
    if (act === 'del-custom') { if (!confirm('Delete this custom item?')) return; const id = t.dataset.id; state.custom = state.custom.filter((c) => c.id !== id); save(); return rerender(); }
    if (act === 'del-section') {
      const slug = t.dataset.slug; if (!confirm('Delete this section and its custom items?')) return;
      state.customSections = state.customSections.filter((s) => s.slug !== slug); state.custom = state.custom.filter((c) => c.section !== slug); save(); return rerender();
    }
    if (act === 'export-json') return download(`defense-console-backup-${today()}.json`, JSON.stringify({ app: 'defense-console', version: 1, state }, null, 2), 'application/json');
    if (act === 'export-csv') return exportCsv();
    if (act === 'export-md') return exportMd();
    if (act === 'print') return print();
    if (act === 'reset-progress') { if (!confirm('Clear all ticks, n/a marks and notes?')) return; Object.assign(state, { done: {}, ignored: {}, notes: {}, history: [] }); save(); toast('Progress reset'); return rerender(); }
    if (act === 'reset-all') { if (!confirm('Reset everything, including custom items, sections and settings?')) return; state = defaults(); save(); applyTheme(); toast('Everything reset'); return rerender(); }
  });

  document.addEventListener('change', (e) => {
    const t = e.target, act = t.dataset.act;
    if (act === 'done') {
      setDone(t.dataset.key, t.checked); save();
      if (t.checked) toast('Nice — one step safer ✓');
      return rerender();
    }
    if (act === 'ignore') { if (t.checked) state.ignored[t.dataset.key] = true; else delete state.ignored[t.dataset.key]; save(); return rerender(); }
    if (act === 'prio') {
      const key = t.dataset.key, it = model().flatMap((s) => s.checklist).find((i) => i.key === key);
      if (it && it.basePriority === t.value) delete state.prio[key]; else state.prio[key] = t.value;
      save(); return rerender();
    }
    if (act === 'note') { const v = t.value.trim(); if (v) state.notes[t.dataset.key] = v; else delete state.notes[t.dataset.key]; save(); toast('Note saved'); return; }
    if (act === 'import') {
      const f = t.files[0]; if (!f) return;
      f.text().then((txt) => {
        const j = JSON.parse(txt); const s = j.state || j;
        if (typeof s !== 'object' || !('done' in s)) throw new Error('bad');
        localStorage.setItem(STORE_KEY, JSON.stringify(s)); state = load(); save(); applyTheme(); toast('Backup imported'); rerender();
      }).catch(() => toast('That file is not a valid backup'));
      return;
    }
    if (t.id === 'sort') { state.view.sort = t.value; save(); return rerender(); }
    if (t.dataset.scope) { state.scope[t.dataset.scope] = t.checked; save(); return rerender(); }
    if (t.dataset.hide) { if (t.checked) delete state.hidden[t.dataset.hide]; else state.hidden[t.dataset.hide] = true; save(); return; }
    if (t.dataset.weight) { state.weights[t.dataset.weight] = Number(t.value); save(); return rerender(); }
    if (t.dataset.setting === 'theme') { state.theme = t.value || null; save(); applyTheme(); }
  });

  let qTimer;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { clearTimeout(qTimer); qTimer = setTimeout(() => { state.view.q = t.value; save(); rerender(); }, 180); }
    if (t.dataset.weight) t.nextElementSibling.textContent = t.value;
  });

  document.addEventListener('submit', (e) => {
    const f = e.target; if (!f.dataset.form) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (f.dataset.form === 'custom') {
      if (!d.point.trim()) return;
      const sec = d.section || state.customSections[0]?.slug;
      state.custom.push({ id: `c-${Date.now().toString(36)}`, section: sec, point: d.point.trim(), details: (d.details || '').trim(), priority: LEVELS.includes(d.priority) ? d.priority : 'optional' });
      toast('Custom item added');
    } else if (f.dataset.form === 'section') {
      let slug = `my-${slugify(d.title)}` || `my-${Date.now()}`; const taken = new Set(model().map((s) => s.slug));
      while (taken.has(slug)) slug += '-2';
      state.customSections.push({ slug, title: d.title.trim(), description: (d.description || '').trim(), color: d.color, icon: 'star' });
      toast('Section created');
    }
    save(); rerender();
  });

  // ---------- search palette ----------
  let palSel = 0, palResults = [];
  function openPalette() { $('#palette').hidden = false; const i = $('#paletteInput'); i.value = ''; renderPalette(''); i.focus(); }
  function closePalette() { $('#palette').hidden = true; }
  function renderPalette(q) {
    q = q.trim().toLowerCase();
    const all = model().flatMap((s) => s.checklist);
    const secHits = model().filter((s) => !q || s.title.toLowerCase().includes(q)).map((s) => ({ type: 'section', s }));
    const itemHits = q ? all.filter((i) => `${i.point} ${i.details}`.toLowerCase().includes(q)).sort((a, b) => b.point.toLowerCase().includes(q) - a.point.toLowerCase().includes(q)).map((i) => ({ type: 'item', i })) : [];
    palResults = [...secHits.slice(0, q ? 4 : 14), ...itemHits].slice(0, 40); palSel = 0;
    $('#paletteResults').innerHTML = palResults.length ? palResults.map((r, n) => r.type === 'section'
      ? `<li role="option" data-n="${n}" aria-selected="${n === 0}"><span style="width:16px;fill:${color(r.s.color)}">${icon(r.s.icon)}</span>${esc(r.s.title)}<small>section</small></li>`
      : `<li role="option" data-n="${n}" aria-selected="${n === 0}"><span class="badge ${r.i.priority}">${r.i.priority[0]}</span>${r.i.done ? '✓ ' : ''}${esc(r.i.point)}<small>${esc(r.i.section.title)}</small></li>`).join('') : '<li>No results</li>';
  }
  function choosePalette(n) {
    const r = palResults[n]; if (!r) return;
    closePalette();
    location.hash = r.type === 'section' ? `#/section/${r.s.slug}` : `#/section/${r.i.section.slug}/${r.i.id}`;
  }
  $('#paletteInput').addEventListener('input', (e) => renderPalette(e.target.value));
  $('#paletteInput').addEventListener('keydown', (e) => {
    const lis = $$('#paletteResults li[data-n]');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); palSel = (palSel + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % Math.max(1, lis.length);
      lis.forEach((l, i) => l.setAttribute('aria-selected', i === palSel)); lis[palSel]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); choosePalette(palSel); }
  });
  $('#paletteResults').addEventListener('click', (e) => { const li = e.target.closest('li[data-n]'); if (li) choosePalette(Number(li.dataset.n)); });
  $('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });
  $('#searchBtn').addEventListener('click', openPalette);

  let gPressed = false;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closePalette();
    if (/input|textarea|select/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); return openPalette(); }
    if (e.key === 'g') { gPressed = true; setTimeout(() => (gPressed = false), 800); return; }
    if (gPressed && e.key === 'd') location.hash = '#/';
    if (gPressed && e.key === 'c') location.hash = '#/all';
  });

  // ---------- footer newsletter sign-up ----------
  // Mirrors the server-side check in server/subscribe.mjs: one plain ASCII address, nothing else.
  function validEmail(value) {
    const email = String(value || '').trim();
    if (email.length < 6 || email.length > 254 || /[^\x21-\x7e]/.test(email)) return null;
    const at = email.lastIndexOf('@');
    if (at < 1 || email.indexOf('@') !== at) return null;
    const local = email.slice(0, at), domain = email.slice(at + 1).toLowerCase(), labels = domain.split('.');
    if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return null;
    if (labels.length < 2 || !labels.every((l) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l))) return null;
    if (!/^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/.test(labels[labels.length - 1])) return null;
    return `${local}@${domain}`;
  }
  function initSubscribe() {
    const form = $('#subscribe-form'), msg = $('#sub-msg');
    if (!form) return;
    const input = form.elements.email, btn = form.querySelector('button');
    let hideTimer;
    const show = (text, ok) => {
      clearTimeout(hideTimer);
      msg.textContent = text; msg.className = `sub-msg ${ok ? 'ok' : 'err'}`; msg.hidden = false;
      if (ok) hideTimer = setTimeout(() => (msg.hidden = true), 6000);
    };
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); if (!msg.hidden && msg.classList.contains('err')) msg.hidden = true; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const email = validEmail(input.value);
      if (!email) { input.setAttribute('aria-invalid', 'true'); show('Please enter a valid email address, like name@example.com.', false); input.focus(); return; }
      btn.disabled = true; btn.classList.add('loading');
      try {
        const r = await fetch('/api/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
          body: JSON.stringify({ email, website: form.elements.website.value }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.ok !== true) throw new Error(data.error || 'Subscription failed. Please try again later.');
        show(data.message || 'Thanks for subscribing!', true);
        form.reset();
      } catch (err) {
        show(err instanceof TypeError ? 'Could not reach the server. Please check your connection and try again.' : err.message, false);
      } finally {
        btn.disabled = false; btn.classList.remove('loading');
      }
    });
  }

  // ---------- theme ----------
  function applyTheme() {
    const root = document.documentElement;
    const sys = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const theme = state.theme || sys;
    root.dataset.theme = theme;
    root.style.setProperty('--accent', (theme === 'light' ? ACCENTS_LIGHT : ACCENTS)[state.accent] || ACCENTS.cyan);
  }
  $('#themeBtn').addEventListener('click', () => { state.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; save(); applyTheme(); });
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);

  // ---------- boot ----------
  applyTheme();
  const fy = $('#footer-year'); if (fy) fy.textContent = new Date().getFullYear();
  initSubscribe();
  window.addEventListener('hashchange', () => { route(); if (!location.hash.split('/')[3]) scrollTo(0, 0); });
  fetch('data.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    DATA = d; recordHistory(); route();
  }).catch(() => { $('#main').innerHTML = '<div class="empty">Could not load the checklist data. Please refresh.</div>'; });
})();
