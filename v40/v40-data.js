/* =====================================================================
 * UCM Watchlist — v40 BETA — 🌐 dados de fora (buscados NO SEU APARELHO)
 *
 *  TVmaze (sem chave): nome oficial (inglês) de cada episódio, resumo do
 *    episódio (inglês), capa/nota/elenco das séries.
 *  TMDB (com a sua chave, guardada só no aparelho): capa oficial, sinopse em
 *    português, elenco, trailer, nota do público, onde assistir no Brasil,
 *    data de lançamento.
 *
 *  Tudo fica guardado no aparelho (IndexedDB) e só é buscado de novo a cada
 *  30 dias ou quando você pede. Nomes de episódio só aparecem quando a conta
 *  de episódios bate exatamente com a do item.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const TVMAZE = 'https://api.tvmaze.com';
  const TMDB = 'https://api.themoviedb.org/3';
  V40.TMDB_IMG = 'https://image.tmdb.org/t/p/';
  const REFRESH_DAYS = 30;

  // ---------- IndexedDB (cache grande, fora do localStorage) ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('v40b-ext', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function idbGet(k) {
    const d = await db();
    return new Promise(res => { const t = d.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(undefined); });
  }
  async function idbSet(k, v) {
    const d = await db();
    return new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); });
  }
  async function idbAll() {
    const d = await db();
    return new Promise(res => {
      const out = {};
      const req = d.transaction('kv').objectStore('kv').openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      req.onerror = () => res(out);
    });
  }
  async function idbClear() {
    const d = await db();
    return new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.oncomplete = () => res(true); });
  }

  // ---------- memória: resultado por item ----------
  V40.ext = {};            // key -> info do item
  V40.extReady = false;
  V40.extInfo = function (it) { return it && it.key ? V40.ext['item:' + it.key] || null : null; };

  // ---------- rede com fila (respeita limites das APIs) ----------
  const lastCall = { tvmaze: 0, tmdb: 0 };
  const GAP = { tvmaze: 550, tmdb: 90 };
  async function getJSON(url, api) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, lastCall[api] + GAP[api] - Date.now());
      if (wait) await new Promise(r => setTimeout(r, wait));
      lastCall[api] = Date.now();
      let res;
      try { res = await fetch(url); } catch (e) { if (attempt === 2) throw e; await new Promise(r => setTimeout(r, 1500)); continue; }
      if (res.status === 429) { await new Promise(r => setTimeout(r, 2500)); continue; }
      if (res.status === 404) return null;
      if (res.status === 401) { const e = new Error('chave'); e.code = 401; throw e; }
      if (!res.ok) { if (attempt === 2) throw new Error('HTTP ' + res.status); continue; }
      return res.json();
    }
    return null;
  }
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^marvel'?s\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const stripHtml = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  // ---------- TVmaze ----------
  const tvShowCache = {};
  async function tvmazeFindShow(names, year) {
    const ck = names[0] + '|' + year;
    if (tvShowCache[ck] !== undefined) return tvShowCache[ck];
    const stored = await idbGet('tvshow:' + ck);
    if (stored && stored.at && (Date.now() - stored.at) < REFRESH_DAYS * 86400000) { tvShowCache[ck] = stored.v; return stored.v; }
    let best = null;
    for (const q of names) {
      const r = await getJSON(`${TVMAZE}/search/shows?q=${encodeURIComponent(q)}`, 'tvmaze');
      if (!Array.isArray(r)) continue;
      const cands = r.map(x => x.show).filter(s => s && s.premiered && Math.abs(parseInt(s.premiered.slice(0, 4), 10) - year) <= 1);
      cands.sort((a, b) => {
        const ea = names.some(n => norm(n) === norm(a.name)) ? 0 : 1;
        const eb = names.some(n => norm(n) === norm(b.name)) ? 0 : 1;
        const ya = parseInt(a.premiered, 10) === year ? 0 : 1, yb = parseInt(b.premiered, 10) === year ? 0 : 1;
        return (ea - eb) || (ya - yb);
      });
      if (cands[0]) { best = cands[0]; break; }
    }
    const v = best ? { id: best.id, name: best.name, premiered: best.premiered, img: best.image ? (best.image.original || best.image.medium) : null, imgS: best.image ? best.image.medium : null, rating: best.rating ? best.rating.average : null, summary: stripHtml(best.summary).slice(0, 700) } : null;
    tvShowCache[ck] = v;
    await idbSet('tvshow:' + ck, { at: Date.now(), v });
    return v;
  }
  const tvEpsCache = {};
  async function tvmazeEpisodes(showId) {
    if (tvEpsCache[showId]) return tvEpsCache[showId];
    const stored = await idbGet('tveps:' + showId);
    if (stored && stored.at && (Date.now() - stored.at) < REFRESH_DAYS * 86400000) { tvEpsCache[showId] = stored.v; return stored.v; }
    const r = await getJSON(`${TVMAZE}/shows/${showId}/episodes`, 'tvmaze');
    const v = Array.isArray(r) ? r.filter(e => e.type !== 'significant_special' && e.number != null).map(e => ({
      s: e.season, n: e.number, name: e.name, air: e.airdate, img: e.image ? e.image.medium : null, sum: stripHtml(e.summary).slice(0, 420), rt: e.runtime
    })) : [];
    tvEpsCache[showId] = v;
    await idbSet('tveps:' + showId, { at: Date.now(), v });
    return v;
  }
  async function tvmazeCast(showId) {
    const stored = await idbGet('tvcast:' + showId);
    if (stored && stored.at && (Date.now() - stored.at) < REFRESH_DAYS * 86400000) return stored.v;
    const r = await getJSON(`${TVMAZE}/shows/${showId}/cast`, 'tvmaze');
    const v = Array.isArray(r) ? r.slice(0, 10).map(c => ({ name: c.person && c.person.name, ch: c.character && c.character.name })) : [];
    await idbSet('tvcast:' + showId, { at: Date.now(), v });
    return v;
  }
  function selectEpisodes(eps, x) {
    const seasons = Array.isArray(x.s) ? x.s : [x.s];
    let list = eps.filter(e => seasons.includes(e.s)).sort((a, b) => (a.s - b.s) || (a.n - b.n));
    if (x.from || x.to) list = list.filter(e => e.n >= (x.from || 1) && e.n <= (x.to || 999));
    return list;
  }

  // ---------- TMDB ----------
  function tmdbKey() { return (V40.settings.tmdbKey || '').trim(); }
  function tmdbUrl(path, params) {
    const p = new URLSearchParams(Object.assign({ api_key: tmdbKey() }, params || {}));
    return `${TMDB}${path}?${p.toString()}`;
  }
  async function tmdbSearch(kind, names, year) {
    for (const q of names) {
      const params = { query: q, language: 'pt-BR', include_adult: 'false' };
      const r = await getJSON(tmdbUrl(`/search/${kind}`, params), 'tmdb');
      const res = r && Array.isArray(r.results) ? r.results : [];
      const yOf = x => parseInt((kind === 'movie' ? x.release_date : x.first_air_date) || '0', 10);
      const cands = res.filter(x => Math.abs(yOf(x) - year) <= 1);
      cands.sort((a, b) => {
        const ta = kind === 'movie' ? a.original_title : a.original_name, tb = kind === 'movie' ? b.original_title : b.original_name;
        const ea = names.some(n => norm(n) === norm(ta)) ? 0 : 1, eb = names.some(n => norm(n) === norm(tb)) ? 0 : 1;
        const ya = yOf(a) === year ? 0 : 1, yb = yOf(b) === year ? 0 : 1;
        return (ea - eb) || (ya - yb) || ((b.popularity || 0) - (a.popularity || 0));
      });
      if (cands[0]) return cands[0];
    }
    return null;
  }
  async function tmdbDetails(kind, id) {
    return getJSON(tmdbUrl(`/${kind}/${id}`, { language: 'pt-BR', append_to_response: 'credits,videos,watch/providers,release_dates', include_video_language: 'pt,en' }), 'tmdb');
  }
  function pickTrailer(videos) {
    const list = videos && Array.isArray(videos.results) ? videos.results.filter(v => v.site === 'YouTube') : [];
    const score = v => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2) * 10 + (v.iso_639_1 === 'pt' ? 0 : 1) + (v.official ? 0 : 0.5);
    list.sort((a, b) => score(a) - score(b));
    return list[0] ? { key: list[0].key, name: list[0].name, lang: list[0].iso_639_1 } : null;
  }
  function pickProviders(wp) {
    const br = wp && wp.results && wp.results.BR;
    if (!br) return null;
    const map = l => (l || []).map(p => ({ n: p.provider_name, logo: p.logo_path }));
    return { stream: map(br.flatrate), rent: map(br.rent), buy: map(br.buy), link: br.link || null };
  }

  // ---------- busca de 1 item ----------
  async function fetchItem(it) {
    const c = V40.catOf(it);
    if (!c || c.type === 'g') return null;
    const names = [c.en].concat(c.x.q || []);
    const info = { key: it.key, at: Date.now(), type: c.type, en: c.en, year: c.year, rel: c.x.rel || null, matched: {} };
    const eps = extractEpsCount(it.text);

    // --- TVmaze (séries e episódios avulsos) ---
    if (c.type === 'tv' || c.type === 'ep') {
      try {
        const show = await tvmazeFindShow(names, c.year);
        if (show) {
          info.matched.tvmaze = `${show.name} (${(show.premiered || '').slice(0, 4)})`;
          info.posterTv = show.img; info.posterTvS = show.imgS;
          info.ratingTv = show.rating; info.summaryEn = show.summary;
          const all = await tvmazeEpisodes(show.id);
          if (c.type === 'tv' && c.x.s != null) {
            const sel = selectEpisodes(all, c.x);
            info.epExpected = eps || null;
            info.epGot = sel.length;
            if (eps && sel.length === eps) {
              info.epCheck = 'ok';
              info.epNames = sel.map(e => e.name);
              info.epCodes = sel.map(e => `T${e.s}E${e.n}`);
              info.epSums = sel.map(e => e.sum);
              info.epImgs = sel.map(e => e.img);
              if (sel[0] && sel[0].air) info.relTv = sel[0].air;
            } else if (!eps) {
              info.epCheck = 'none';
              if (sel[0] && sel[0].air) info.relTv = sel[0].air;
            } else {
              info.epCheck = 'diff';
              // ainda guarda o que veio, mas NÃO mostra (pode estar desalinhado)
              info.epPreview = sel.slice(0, 3).map(e => `T${e.s}E${e.n} ${e.name}`);
            }
          }
          if (c.type === 'ep') {
            const e = all.find(x => x.s === c.x.s && x.n === c.x.e);
            if (e) {
              info.epTitleEn = e.name; info.epSumEn = e.sum; info.epImg = e.img; info.relTv = e.air;
              info.epCheck = 'ok';
            } else info.epCheck = 'diff';
          }
          info.castTv = await tvmazeCast(show.id);
        } else info.matched.tvmaze = null;
      } catch (e) { info.errTv = String(e.message || e); }
    }

    // --- TMDB (com chave) ---
    if (tmdbKey()) {
      try {
        const kind = (c.type === 'm' || c.type === 's') ? 'movie' : 'tv';
        const hit = await tmdbSearch(kind, names, c.year);
        if (hit) {
          const d = await tmdbDetails(kind, hit.id);
          if (d) {
            info.tmdbId = d.id; info.tmdbKind = kind;
            info.matched.tmdb = `${kind === 'movie' ? d.original_title : d.original_name} (${((kind === 'movie' ? d.release_date : d.first_air_date) || '').slice(0, 4)})`;
            info.titlePt = kind === 'movie' ? d.title : d.name;
            info.titleOrig = kind === 'movie' ? d.original_title : d.original_name;
            info.overview = d.overview || null;
            info.poster = d.poster_path || null;
            info.backdrop = d.backdrop_path || null;
            info.vote = d.vote_average || null; info.votes = d.vote_count || 0;
            info.runtime = d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null;
            info.relTmdb = kind === 'movie' ? d.release_date : d.first_air_date;
            info.genres = (d.genres || []).map(g => g.name);
            info.cast = d.credits && Array.isArray(d.credits.cast) ? d.credits.cast.slice(0, 10).map(p => ({ name: p.name, ch: p.character, img: p.profile_path })) : [];
            info.trailer = pickTrailer(d.videos);
            info.providers = pickProviders(d['watch/providers']);
            // temporada específica: capa, sinopse e data da temporada
            if (kind === 'tv' && c.type === 'tv' && typeof c.x.s === 'number') {
              const se = await getJSON(tmdbUrl(`/tv/${d.id}/season/${c.x.s}`, { language: 'pt-BR' }), 'tmdb');
              if (se) {
                if (se.poster_path) info.poster = se.poster_path;
                if (se.overview) info.overview = se.overview;
                if (se.air_date) info.relTmdb = se.air_date;
                info.seasonName = se.name;
                if (Array.isArray(se.episodes)) info.epNamesPt = se.episodes.map(e => e.name);
              }
            }
            if (kind === 'tv' && c.type === 'ep') {
              const ep = await getJSON(tmdbUrl(`/tv/${d.id}/season/${c.x.s}/episode/${c.x.e}`, { language: 'pt-BR' }), 'tmdb');
              if (ep) {
                if (ep.overview) info.overview = ep.overview;
                info.epTitlePt = ep.name;
                if (ep.still_path) info.still = ep.still_path;
                if (ep.air_date) info.relTmdb = ep.air_date;
                if (ep.vote_average) info.vote = ep.vote_average;
              }
            }
          }
        } else info.matched.tmdb = null;
      } catch (e) {
        if (e && e.code === 401) throw e;
        info.errTmdb = String(e.message || e);
      }
    }
    return info;
  }

  // ---------- aplicar no app ----------
  // Séries animadas da dupla/trio: a base pública numera pela ordem de exibição na TV, que não
  // bate com a ordem que você assiste (Disney+). Até conferir com você, os nomes delas ficam
  // escondidos (o resto continua mostrando).
  V40.ORDER_UNCONFIRMED = ['k52', 'k53', 'k171', 'k54', 'k170'];
  // nomes de episódio desligados de vez (a pedido): a ordem das bases não bate com a do Disney+
  V40.namesHidden = function () { return true; };
  V40.applyExt = function () {
    Object.keys(V40.ext).forEach(k => {
      if (!k.startsWith('item:')) return;
      const info = V40.ext[k];
      if (info && info.epCheck === 'ok' && Array.isArray(info.epNames) && !V40.namesHidden(info.key)) EPISODE_TITLES[info.key] = info.epNames;
      else if (info && EPISODE_TITLES[info.key]) delete EPISODE_TITLES[info.key];
    });
  };
  V40.posterUrl = function (it, size) {
    const info = V40.extInfo(it);
    if (!info) return null;
    if (info.poster) return V40.TMDB_IMG + (size || 'w185') + info.poster;
    if (info.still) return V40.TMDB_IMG + (size === 'w92' ? 'w185' : 'w300') + info.still;
    if (info.epImg) return info.epImg;
    if (info.posterTvS || info.posterTv) return size === 'w500' ? (info.posterTv || info.posterTvS) : (info.posterTvS || info.posterTv);
    return null;
  };
  V40.releaseDate = function (it) {
    const info = V40.extInfo(it);
    const c = V40.catOf(it);
    return (info && (info.relTmdb || info.relTv)) || (c && c.x.rel) || (c ? c.year + '-12-31' : null);
  };
  V40.displayTitle = function (it) {
    const c = V40.catOf(it);
    if (V40.settings.titleLang === 'en' && c) {
      if (c.type === 'ep') {
        const info = V40.extInfo(it);
        return `What If...? T${c.x.s}E${c.x.e}${info && info.epTitleEn ? ' — ' + info.epTitleEn : ''}`;
      }
      if (c.type === 'tv' && typeof c.x.s === 'number') {
        let t = `${c.en} — T${c.x.s}`;
        if (c.x.from) t += ` ep. ${c.x.from}–${c.x.to}`;
        return t;
      }
      if (c.type === 'tv' && Array.isArray(c.x.s)) return `${c.en} — T${c.x.s[0]}–T${c.x.s[c.x.s.length - 1]}`;
      return c.en + (c.year ? ` (${c.year})` : '');
    }
    return null;
  };

  // "onde assistir" do app passa a usar o TMDB (Brasil) quando tiver
  const origWhere = window.whereToWatch;
  window.whereToWatch = function (it) {
    const info = V40.extInfo(it);
    if (info && info.providers && info.providers.stream && info.providers.stream.length) {
      return info.providers.stream.slice(0, 3).map(p => p.n).join(' / ');
    }
    return origWhere(it);
  };

  // ---------- atualização (todos os itens) ----------
  V40.extJob = null;
  V40.refreshExt = async function (opts) {
    opts = opts || {};
    if (V40.extJob) return V40.extJob;
    const list = items.filter(it => { const c = V40.catOf(it); return c && c.type !== 'g'; });
    const todo = list.filter(it => {
      if (opts.force) return true;
      const info = V40.ext['item:' + it.key];
      if (!info) return true;
      if (opts.onlyTmdb) return !info.tmdbId && tmdbKey();
      if (tmdbKey() && !info.tmdbId && !info.errTmdb && info.matched.tmdb === undefined) return true;
      return (Date.now() - info.at) > REFRESH_DAYS * 86400000;
    });
    if (!todo.length) return Promise.resolve({ done: 0 });
    V40.extProgress = { done: 0, total: todo.length, errors: 0 };
    updateExtChip();
    V40.extJob = (async () => {
      for (const it of todo) {
        try {
          const info = await fetchItem(it);
          if (info) {
            V40.ext['item:' + it.key] = info;
            await idbSet('item:' + it.key, info);
          }
        } catch (e) {
          if (e && e.code === 401) {
            V40.extProgress.keyError = true;
            V40.toast('❌ A chave do TMDB foi recusada — confira em Config');
            break;
          }
          V40.extProgress.errors++;
          if (!navigator.onLine) { V40.toast('📴 Sem internet — continuo depois'); break; }
        }
        V40.extProgress.done++;
        updateExtChip();
        if (V40.extProgress.done % 8 === 0) { V40.applyExt(); try { render(); } catch (e) {} }
      }
      V40.applyExt();
      V40.set('ext-last', new Date().toISOString());
      try { render(); } catch (e) {}
      const p = V40.extProgress;
      V40.extJob = null;
      V40.extProgress = null;
      updateExtChip();
      if (!p.keyError) V40.toast(`🌐 Dados atualizados: ${p.done} títulos${p.errors ? ` (${p.errors} com erro)` : ''}`);
      return p;
    })();
    return V40.extJob;
  };
  function updateExtChip() {
    let chip = document.getElementById('v40ExtChip');
    const p = V40.extProgress;
    if (!p) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'v40ExtChip';
      chip.className = 'v40-ext-chip';
      document.body.appendChild(chip);
    }
    chip.innerHTML = `🌐 Buscando capas e episódios… ${p.done}/${p.total}<span class="bar"><span style="width:${Math.round(100 * p.done / p.total)}%"></span></span>`;
    const cfg = document.getElementById('v40ExtStatus');
    if (cfg) cfg.textContent = `Buscando… ${p.done}/${p.total}`;
  }

  // ---------- relatório ----------
  V40.extReport = function () {
    const rows = [];
    items.forEach(it => {
      const c = V40.catOf(it);
      if (!c || c.type === 'g') return;
      const info = V40.ext['item:' + it.key];
      rows.push({ it, c, info });
    });
    return rows;
  };
  V40.openExtReport = function () {
    const rows = V40.extReport();
    const got = rows.filter(r => r.info);
    const epOk = rows.filter(r => r.info && r.c.type === 'tv' && r.info.epCheck === 'ok').length;
    const epDiff = rows.filter(r => r.info && r.info.epCheck === 'diff');
    const noTv = rows.filter(r => r.info && (r.c.type === 'tv' || r.c.type === 'ep') && !r.info.matched.tvmaze);
    const noTmdb = tmdbKey() ? rows.filter(r => r.info && !r.info.tmdbId) : [];
    const withPoster = rows.filter(r => V40.posterUrl(r.it)).length;
    const line = r => `<div class="v40-row"><span style="flex:1">${V40.esc(V40.cleanName(r.it))}<br><small class="v40-muted">${r.info ? [r.info.matched.tvmaze ? 'TVmaze: ' + V40.esc(r.info.matched.tvmaze) : '', r.info.matched.tmdb ? 'TMDB: ' + V40.esc(r.info.matched.tmdb) : '', r.info.epCheck === 'diff' ? `episódios: lista tem ${r.info.epExpected || '?'}, base tem ${r.info.epGot}` : ''].filter(Boolean).join(' · ') : 'ainda não buscado'}</small></span></div>`;
    V40.modal(`<h3>🌐 Relatório dos dados</h3>
      <div class="v40-hero-stats">
        <div><b>${got.length}/${rows.length}</b><small>BUSCADOS</small></div>
        <div><b>${withPoster}</b><small>COM CAPA</small></div>
        <div><b>${rows.filter(r => r.info && r.info.tmdbId).length}</b><small>NO TMDB</small></div>
      </div>
      ${noTv.length ? `<h4>❔ Não achados no TVmaze (${noTv.length})</h4>${noTv.map(line).join('')}` : ''}
      ${noTmdb.length ? `<h4>❔ Não achados no TMDB (${noTmdb.length})</h4>${noTmdb.map(line).join('')}` : ''}
      <details class="v40-help"><summary>Ver tudo o que foi encontrado</summary>${got.map(line).join('')}</details>`, true);
    document.querySelectorAll('[data-shownames]').forEach(cb => cb.addEventListener('change', () => {
      V40.settings.showUnconfirmedNames = V40.settings.showUnconfirmedNames || {};
      V40.settings.showUnconfirmedNames[cb.dataset.shownames] = cb.checked;
      V40.saveSettings();
      if (!cb.checked) delete EPISODE_TITLES[cb.dataset.shownames];
      V40.applyExt(); render();
    }));
  };

  // ---------- 📇 ficha do título ----------
  V40.openInfo = function (it) {
    const info = V40.extInfo(it);
    const c = V40.catOf(it);
    const poster = V40.posterUrl(it, 'w342');
    const year = c ? c.year : '';
    const date = V40.releaseDate(it);
    const cast = (info && (info.cast && info.cast.length ? info.cast : info.castTv)) || [];
    const vote = info && info.vote ? `${info.vote.toFixed(1)}/10 <small class="v40-muted">TMDB${info.votes ? ' · ' + info.votes + ' votos' : ''}</small>` : (info && info.ratingTv ? `${info.ratingTv.toFixed(1)}/10 <small class="v40-muted">TVmaze</small>` : null);
    const my = V40.effRating(it);
    const prov = info && info.providers;
    const provHtml = prov ? [
      prov.stream && prov.stream.length ? `<div class="v40-prov"><small>Assinatura:</small>${prov.stream.map(p => `<span class="pv">${p.logo ? `<img src="${V40.TMDB_IMG}w45${p.logo}" alt="">` : ''}${V40.esc(p.n)}</span>`).join('')}</div>` : '',
      prov.rent && prov.rent.length ? `<div class="v40-prov"><small>Aluguel:</small>${prov.rent.slice(0, 4).map(p => `<span class="pv">${V40.esc(p.n)}</span>`).join('')}</div>` : ''
    ].join('') : '';
    const content = V40.contentFor ? V40.contentFor(it) : null;
    const overview = info && info.overview ? info.overview : (info && (info.epSumEn || info.summaryEn) ? `<i>${V40.esc(info.epSumEn || info.summaryEn)}</i> <small class="v40-muted">(em inglês)</small>` : null);
    V40.modal(`<div class="v40-info">
      <div class="v40-info-top">
        ${poster ? `<img class="v40-info-poster" src="${poster}" alt="Capa" loading="lazy">` : `<div class="v40-info-poster ph">${V40.kindIcon(it)}</div>`}
        <div class="v40-info-head">
          <h3>${V40.esc(info && info.titlePt ? info.titlePt : V40.cleanName(it))}</h3>
          ${c ? `<div class="v40-muted">${V40.esc(info && info.titleOrig && info.titleOrig !== info.titlePt ? info.titleOrig : c.en)}${info && info.seasonName ? ' · ' + V40.esc(info.seasonName) : ''}</div>` : ''}
          ${c && c.type === 'ep' && info && info.epTitleEn ? `<div class="v40-muted">Episódio: <b>${V40.esc(info.epTitleEn)}</b>${info.epTitlePt && info.epTitlePt !== info.epTitleEn ? ` (${V40.esc(info.epTitlePt)})` : ''}</div>` : ''}
          <div class="v40-info-meta">${date ? `📅 ${V40.fmtBR(date, true)}` : (year ? year : '')}${info && info.runtime ? ` · ⏱ ${info.runtime} min` : ''}${info && info.genres && info.genres.length ? ' · ' + V40.esc(info.genres.slice(0, 2).join(', ')) : ''}</div>
          <div class="v40-info-votes">${vote ? `<span>👥 Público: <b>${vote}</b></span>` : ''}${my > 0 ? `<span>⭐ Você: <b>${V40.fmt1(my)}</b></span>` : ''}</div>
          ${info && info.trailer ? `<a class="v40-primary v40-trailer" href="https://www.youtube.com/watch?v=${encodeURIComponent(info.trailer.key)}" target="_blank" rel="noopener">▶️ Trailer${info.trailer.lang === 'pt' ? ' (PT)' : ''}</a>` : ''}
        </div>
      </div>
      ${overview ? `<h4>📖 Sinopse</h4><p class="v40-info-p">${info && info.overview ? V40.esc(overview) : overview}</p>` : ''}
      ${content && content.html ? content.html : ''}
      ${provHtml ? `<h4>📺 Onde assistir (Brasil)</h4>${provHtml}<p class="v40-muted" style="margin-top:2px;">Fonte: TMDB/JustWatch</p>` : ''}
      ${cast.length ? `<h4>🎭 Elenco</h4><div class="v40-cast">${cast.slice(0, 10).map(p => `<div class="cm">${p.img ? `<img src="${V40.TMDB_IMG}w92${p.img}" alt="" loading="lazy">` : '<span class="noimg">👤</span>'}<b>${V40.esc(p.name || '')}</b><small>${V40.esc(p.ch || '')}</small></div>`).join('')}</div>` : ''}
      ${!info ? `<p class="v40-muted">Ainda sem dados de fora pra este título. ${c ? 'Eles chegam quando o app buscar (Config ▸ 🌐 Dados de fora).' : 'Este item foi criado à mão e não está no catálogo.'}</p>` : ''}
      ${!tmdbKey() && info && !info.tmdbId ? '<p class="v40-muted">Com a chave do TMDB (Config) aparecem capa oficial, sinopse em português, elenco, trailer e onde assistir.</p>' : ''}
    </div>`, true);
  };

  // ---------- 📺 último episódio (recap) na lista de episódios ----------
  V40.recapHtml = function (it) {
    const info = V40.extInfo(it);
    if (!info || info.epCheck !== 'ok' || !Array.isArray(info.epNames) || V40.namesHidden(it.key)) return '';
    const done = Array.isArray(it.epDone) ? it.epDone.filter(Boolean).length : 0;
    const parts = [];
    if (done > 0) {
      const i = done - 1;
      parts.push(`<div class="v40-recap-l"><small>ÚLTIMO QUE VOCÊ VIU · ${info.epCodes[i]}</small><b>${V40.esc(info.epNames[i])}</b>${info.epSums && info.epSums[i] ? `<p>${V40.esc(info.epSums[i])}</p>` : ''}</div>`);
    }
    if (done < info.epNames.length) parts.push(`<div class="v40-recap-n"><small>PRÓXIMO · ${info.epCodes[done]}</small><b>${V40.esc(info.epNames[done])}</b></div>`);
    if (!parts.length) return '';
    return `<details class="v40-recap" ${done > 0 ? '' : 'open'}><summary>📺 ${V40.esc(V40.cleanName(it).split(' — ')[0])}: onde você parou</summary>${parts.join('')}<p class="v40-muted" style="margin:4px 0 0;">Resumo em inglês (TVmaze) — só do que você já viu.</p></details>`;
  };
  // injeta o recap quando a lista de episódios abre
  function injectRecap() {
    const list = document.querySelector('#modalBox .interleaved-list');
    if (!list || list.dataset.v40recap) return;
    list.dataset.v40recap = '1';
    const title = document.querySelector('#modalBox h3');
    let html = '';
    if (title && /Ordem Intercalada/.test(title.textContent)) {
      const rowsTxt = list.textContent;
      const cfg = TRIOS.find(c => c.labels.some(l => rowsTxt.includes(l)));
      if (cfg) cfg.keys.forEach(k => { const it = items.find(i => i.key === k); if (it) html += V40.recapHtml(it); });
    } else if (title) {
      const it = items.find(i => title.textContent.trim() === i.text.replace(/^[^\wÀ-ÿ]+\s*/, '').trim());
      if (it) html = V40.recapHtml(it);
    }
    if (!html) return;
    const box = document.createElement('div');
    box.className = 'v40-recap-box';
    box.innerHTML = html;
    const bar = document.querySelector('#modalBox .v40-ep-bar');
    list.parentNode.insertBefore(box, bar || list);
  }
  new MutationObserver(() => { try { injectRecap(); } catch (e) { console.error(e); } }).observe(document.getElementById('modalBox'), { childList: true });

  // ---------- ordem de lançamento (na ordenação da lista) ----------
  const origSort = window.v40SortList;
  window.v40SortList = function (list) {
    if (V40.view.sort === 'release') {
      return list.slice().sort((a, b) => {
        const da = V40.releaseDate(a) || '9999', dbb = V40.releaseDate(b) || '9999';
        return da < dbb ? -1 : da > dbb ? 1 : 0;
      });
    }
    return origSort(list);
  };

  // ---------- configuração (chave e botões) ----------
  V40.openExtSettings = function () {
    const key = tmdbKey();
    const last = V40.get('ext-last', null);
    const n = Object.keys(V40.ext).length;
    V40.modal(`<h3>🌐 Dados de fora</h3>
      <p class="v40-muted">Capas, sinopses, elenco, trailer, nota do público, onde assistir e os nomes oficiais dos episódios. O app busca direto do seu aparelho e guarda tudo nele.</p>
      <div class="v40-form">
        <label>Chave do TMDB <input type="text" id="v40TmdbKey" value="${V40.esc(key)}" placeholder="cole aqui a Chave da API (32 caracteres)" autocomplete="off" spellcheck="false" style="max-width:100%;flex:1;font-family:'JetBrains Mono',monospace;font-size:0.72rem;"></label>
      </div>
      <p class="v40-muted">A chave fica só neste aparelho (não vai pro site nem pra nuvem).</p>
      <label class="v40-check-row"><input type="checkbox" id="v40Posters" ${V40.settings.posters !== false ? 'checked' : ''}><span>🖼 Mostrar capas na lista</span></label>
      <label class="v40-check-row"><input type="checkbox" id="v40TitleEn" ${V40.settings.titleLang === 'en' ? 'checked' : ''}><span>🇺🇸 Nomes dos títulos em inglês (nome oficial)</span></label>
      <div class="v40-sim" id="v40ExtStatus">${V40.extProgress ? `Buscando… ${V40.extProgress.done}/${V40.extProgress.total}` : `${n} título(s) com dados${last ? ' · última busca ' + new Date(last).toLocaleString('pt-BR') : ''}`}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button id="v40ExtSave" class="v40-primary">Salvar e buscar</button>
        <button id="v40ExtForce">🔄 Buscar tudo de novo</button>
        <button id="v40ExtReport">📋 Relatório</button>
        <button id="v40ExtClear" class="v40-danger">Apagar dados baixados</button>
      </div>`);
    document.getElementById('v40Posters').addEventListener('change', e => { V40.settings.posters = e.target.checked; V40.saveSettings(); render(); });
    document.getElementById('v40TitleEn').addEventListener('change', e => { V40.settings.titleLang = e.target.checked ? 'en' : 'pt'; V40.saveSettings(); render(); });
    document.getElementById('v40ExtSave').addEventListener('click', () => {
      const k = document.getElementById('v40TmdbKey').value.trim();
      if (k && !/^[0-9a-f]{32}$/i.test(k)) { alert('Essa não parece a "Chave da API" (são 32 letras/números). O token comprido não serve.'); return; }
      const changed = k !== tmdbKey();
      V40.settings.tmdbKey = k; V40.saveSettings();
      closeModal();
      V40.toast(k ? '🔑 Chave salva — buscando…' : 'Buscando só do TVmaze…');
      V40.refreshExt(changed ? { onlyTmdb: !!k && Object.keys(V40.ext).length > 0 } : {});
    });
    document.getElementById('v40ExtForce').addEventListener('click', () => { closeModal(); V40.refreshExt({ force: true }); });
    document.getElementById('v40ExtReport').addEventListener('click', V40.openExtReport);
    document.getElementById('v40ExtClear').addEventListener('click', async () => {
      if (!confirm('Apagar capas/episódios baixados? (sua lista não muda)')) return;
      await idbClear();
      V40.ext = {}; V40.applyExt(); Object.keys(EPISODE_TITLES).forEach(k => delete EPISODE_TITLES[k]);
      closeModal(); render(); V40.toast('🗑 Dados de fora apagados');
    });
  };

  // ---------- capa, nome em inglês e ficha em cada linha da lista ----------
  const origDecorate = window.v40DecorateRow;
  window.v40DecorateRow = function (row, it, mainCol, actions) {
    origDecorate(row, it, mainCol, actions);
    const txt = mainCol.querySelector('.item-text');
    const en = V40.displayTitle(it);
    if (en && txt && txt.firstChild && txt.firstChild.nodeType === 3) {
      txt.title = it.text;
      txt.firstChild.nodeValue = V40.kindIcon(it) + ' ' + en;
    }
    const url = V40.settings.posters !== false ? V40.posterUrl(it, 'w92') : null;
    if (url) {
      const img = document.createElement('img');
      img.className = 'v40-thumb';
      img.src = url; img.alt = ''; img.loading = 'lazy';
      img.addEventListener('click', ev => { ev.stopPropagation(); V40.openInfo(it); });
      img.addEventListener('error', () => img.remove());
      row.insertBefore(img, mainCol);
    }
    const extra = mainCol.querySelector('.v40-row-extra');
    if (extra && V40.catOf(it)) {
      const b = document.createElement('button');
      b.textContent = '📇 Ficha';
      b.addEventListener('click', ev => { ev.stopPropagation(); V40.openInfo(it); });
      extra.insertBefore(b, extra.firstChild);
    }
  };

  // ---------- init ----------
  V40.initData = async function () {
    try {
      const all = await idbAll();
      Object.keys(all).forEach(k => { if (k.startsWith('item:')) V40.ext[k] = all[k]; });
    } catch (e) { console.error('v40 data load', e); }
    V40.extReady = true;
    V40.applyExt();
    try { render(); } catch (e) {}
    // primeira vez ou vencido: busca sozinho em segundo plano (só com internet)
    if (navigator.onLine && V40.settings.autoExt !== false) {
      setTimeout(() => { V40.refreshExt({}); }, 2500);
    }
  };
})();
