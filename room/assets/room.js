/* ============================================================
   背水对战平台 · 社区服大厅
   纯原生实现，无构建依赖；可直接双击打开，也可由 serve.mjs 提供
   A2S 实时检测与同源代理。
   ============================================================ */
(function () {
  'use strict';

  var LS_SERVERS = 'bsp-room.servers.v1';
  var LS_FAV = 'bsp-room.favorites.v1';
  var LS_PREFS = 'bsp-room.prefs.v1';
  var LS_NOTICE = 'bsp-room.notice.v1';
  var LS_SHORTCUT = 'bsp-room.shortcut.v1';
  var REFRESH_MS = 30000;
  var SHORTCUT_URL = 'https://bade-gusi.github.io/beishui-platform/room/';
  var STATUS_URL = String(window.BEISHUI_STATUS_URL || '').trim();

  var MAPS = {
    de_dust2:    { name: '炙热沙城 II', a: '#8A6A2F', b: '#C9A24E' },
    de_mirage:   { name: '荒漠迷城',   a: '#9A4E2E', b: '#D9825B' },
    de_inferno:  { name: '炼狱小镇',   a: '#7A2F26', b: '#C0523F' },
    de_nuke:     { name: '核子危机',   a: '#42596B', b: '#8BA6B8' },
    de_overpass: { name: '死亡游乐园', a: '#31553F', b: '#5C8A6A' },
    de_ancient:  { name: '远古遗迹',   a: '#2A5B52', b: '#4F8A7B' },
    de_vertigo:  { name: '殒命大厦',   a: '#4C596B', b: '#7E8FA8' },
    de_anubis:   { name: '阿努比斯',   a: '#2C5C66', b: '#4B9AA8' },
    de_train:    { name: '列车停放站', a: '#4F4638', b: '#7A6F5E' },
    de_tuscan:   { name: '托斯卡纳',   a: '#7A6436', b: '#C7A36A' },
    de_cbble:    { name: '古堡激战',   a: '#4B3A2E', b: '#8A6F55' },
    de_cache:    { name: '死城之谜',   a: '#3D4B3B', b: '#708A68' },
    de_neon:     { name: '霓虹町',     a: '#4B2A66', b: '#A855F7' },
    de_newyear:  { name: '新年广场',   a: '#6B2C2C', b: '#C94C4C' },
    de_blackgold: { name: '黑色城镇',  a: '#2D2F38', b: '#5E6472' },
    de_bikini:   { name: '比奇堡',     a: '#1F5A6B', b: '#3FB4C8' }
  };

  var MAP_ALIAS = {
    '炙热沙城2': 'de_dust2', '炙热沙城Ⅱ': 'de_dust2', '沙2': 'de_dust2',
    '炼狱小镇': 'de_inferno', '荒漠迷城': 'de_mirage', '核子危机': 'de_nuke',
    '死亡游乐园': 'de_overpass', '列车停放站': 'de_train', '殒命大厦': 'de_vertigo',
    '阿努比斯': 'de_anubis', '远古遗迹': 'de_ancient', '死城之谜': 'de_cache',
    '古堡激战': 'de_cbble', '托斯卡纳': 'de_tuscan', '霓虹町': 'de_neon'
  };

  var state = {
    servers: [],
    base: [],
    favorites: new Set(),
    view: 'grid',
    mode: '全部',
    search: '',
    notFull: false,
    hasPlayers: false,
    onlyFav: false,
    sort: 'default',
    live: false,
    cloud: false,
    origin: '',
    lastUpdated: null,
    loading: true,
    timer: null,
    pendingJoin: null,
    editingId: null,
    localBase: false,
    refreshAbort: null,
    refreshSeq: 0,
    hasRenderedList: false,
    lastFocus: null,
    lastSig: '',
    modesSig: '',
    localLaunch: null,
    quickSig: '',
    quickPickId: null,
    deferredPrompt: null,
    shortcutState: null,
    standalone: false,
    promptTimer: null
  };

  var els = {};
  var hashHandled = false;

  /* ---------------- 工具 ---------------- */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name) {
    return '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function stableId(address, index) {
    var slug = String(address || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return 'srv-' + (slug || 'x' + index);
  }

  function isValidAddress(address) {
    var m = /^([A-Za-z0-9._-]+):(\d{1,5})$/.exec(String(address || '').trim());
    if (!m) return false;
    var port = Number(m[2]);
    return port > 0 && port <= 65535;
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  function normalizeMap(raw) {
    if (!raw) return '';
    var v = String(raw).trim();
    var lower = v.toLowerCase();
    if (MAPS[lower]) return lower;
    if (MAP_ALIAS[v]) return MAP_ALIAS[v];
    return lower;
  }

  function mapInfo(raw) {
    var id = normalizeMap(raw);
    return MAPS[id] || { name: id ? id.replace(/^de_/, '').toUpperCase() : '未知地图', a: '#2C4A38', b: '#14321F' };
  }

  function normalizeServer(raw, index) {
    raw = raw || {};
    var address = String(raw.address || raw.Address || '').trim();
    var players = raw.players;
    if (raw.Players != null) players = raw.Players;
    players = (players === null || players === undefined || players === '' || isNaN(Number(players)))
      ? null : Number(players);

    var max = raw.maxPlayers || raw.MaxPlayers || raw.max || 10;
    max = Number(max) || 10;

    return {
      id: raw.id || stableId(address, index),
      name: String(raw.name || raw.Name || '未命名服务器').trim(),
      address: address,
      map: normalizeMap(raw.map || raw.Map || ''),
      mode: String(raw.mode || raw.Mode || '社区服').trim(),
      region: String(raw.region || raw.Region || raw.location || '').trim(),
      players: players,
      maxPlayers: max,
      password: raw.password ? String(raw.password) : '',
      requirePassword: !!raw.requirePassword,
      appId: Number(raw.appId) || 730,
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
      note: String(raw.note || ''),
      live: raw.live || null
    };
  }

  function normalizeList(list) {
    var seen = {};
    return (Array.isArray(list) ? list : [])
      .map(normalizeServer)
      .filter(function (s) {
        if (!isValidAddress(s.address) || seen[s.address]) return false;
        seen[s.address] = true;
        return true;
      });
  }

  function stripLive(s) {
    return Object.assign({}, s, { live: null });
  }

  function effective(s) {
    var l = s.live;
    if (l && l.online) {
      return Object.assign({}, s, {
        name: l.name || s.name,
        map: normalizeMap(l.map) || s.map,
        players: typeof l.players === 'number' ? l.players : s.players,
        maxPlayers: typeof l.maxPlayers === 'number' && l.maxPlayers > 0 ? l.maxPlayers : s.maxPlayers,
        online: true,
        ping: typeof l.ping === 'number' ? l.ping : null
      });
    }
    return Object.assign({}, s, {
      online: l ? false : null,
      ping: null
    });
  }

  function loadPrefs() {
    var p = readJSON(LS_PREFS, {});
    state.view = p.view === 'list' ? 'list' : 'grid';
    state.sort = p.sort || 'default';
  }

  function savePrefs() {
    writeJSON(LS_PREFS, { view: state.view, sort: state.sort });
  }

  function loadBase() {
    var saved = readJSON(LS_SERVERS, null);
    if (Array.isArray(saved)) {
      state.localBase = true;
      return normalizeList(saved);
    }
    state.localBase = false;
    return normalizeList(window.BEISHUI_SERVERS || []);
  }

  function saveBase() {
    state.localBase = true;
    writeJSON(LS_SERVERS, state.base);
  }

  /* ---------------- 数据刷新 ---------------- */

  function adoptApiServers(apiList, statusOnly) {
    var api = normalizeList(apiList);
    var byAddress = {};
    var byId = {};

    api.forEach(function (s) {
      byAddress[s.address] = s;
      byId[s.id] = s;
    });

    // 状态服务只提供在线人数，不覆盖本地服务器元数据；
    // 完整后台接口仍保持原来的“接口即权威”行为。
    if (!state.localBase && !statusOnly) state.base = api.map(stripLive);

    state.servers = state.base.map(function (s) {
      var source = byAddress[s.address] || byId[s.id];
      return Object.assign({}, s, { live: source ? source.live : null });
    });
  }

  function refresh(manual) {
    var seq = ++state.refreshSeq;

    if (state.refreshAbort) {
      try { state.refreshAbort.abort(); } catch (e) { /* ignore */ }
    }

    var controller = window.AbortController ? new AbortController() : null;
    state.refreshAbort = controller;
    var abortTimer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;

    if (els.refreshBtn) {
      els.refreshBtn.classList.add('is-spinning');
      els.refreshBtn.disabled = true;
    }

    var endpoint = STATUS_URL || 'api/servers';
    var useCache = endpoint !== 'api/servers' && !manual;

    fetch(endpoint, {
      cache: useCache ? 'default' : 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .finally(function () { if (abortTimer) clearTimeout(abortTimer); })
      .then(function (data) {
        if (seq !== state.refreshSeq) return;
        if (!data || !Array.isArray(data.servers)) throw new Error('bad payload');

        var signature = data.servers.map(function (s) {
          var live = s.live || {};
          return [s.id, s.address, s.name, s.map, s.mode, s.region, s.players, s.maxPlayers,
            live.online === true ? 1 : 0, live.players, live.maxPlayers].join('|');
        }).join(';');
        var changed = signature !== state.lastSig;
        var wasLoading = state.loading;
        var wasCloud = state.cloud;
        var wasLive = state.live;
        var hasLiveData = data.servers.some(function (s) {
          return s.live && typeof s.live.online === 'boolean';
        });

        state.lastSig = signature;
        state.cloud = true;
        state.origin = data.origin || (STATUS_URL ? 'status' : 'local');
        state.live = data.source === 'a2s' && hasLiveData;
        state.lastUpdated = new Date();
        adoptApiServers(data.servers, data.statusOnly === true);
        state.loading = false;

        if (changed || wasLoading || manual || !wasCloud || state.live !== wasLive) renderAll();
        else renderSource();

        if (manual) toast('已同步 ' + state.servers.length + ' 个服务器', 'ok');
      })
      .catch(function () {
        if (seq !== state.refreshSeq) return;
        state.live = false;
        state.cloud = false;
        state.origin = '';
        state.lastSig = '';
        state.lastUpdated = new Date();
        state.servers = state.base.map(stripLive);
        state.loading = false;
        renderAll();
        if (manual) toast('未连接实时检测服务，已使用静态配置', 'warn');
      })
      .then(function () {
        if (seq !== state.refreshSeq) return;
        state.refreshAbort = null;
        if (els.refreshBtn) {
          els.refreshBtn.classList.remove('is-spinning');
          els.refreshBtn.disabled = false;
        }
        scheduleRefresh();
        applyHashOnce();
      });
  }

  function applyHashOnce() {
    if (hashHandled) return;
    hashHandled = true;
    var hash = location.hash || '';
    if (hash === '#settings') openSettings();
    else if (hash.indexOf('#server=') === 0) {
      openDetail(decodeURIComponent(hash.slice(8)));
    }
  }

  function scheduleRefresh() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(function () {
      if (document.visibilityState === 'visible' && (state.cloud || STATUS_URL)) refresh(false);
    }, REFRESH_MS);
  }

  /* ---------------- 统计 ---------------- */

  function stats() {
    var list = state.servers.map(effective);
    var maxPlayers = 0, knownPlayers = 0, online = 0, slots = 0;
    var hasKnown = false, liveKnown = false;

    list.forEach(function (s) {
      maxPlayers += s.maxPlayers || 0;
      if (s.online === true || s.online === false) liveKnown = true;
      if (s.online === true) online++;
      if (typeof s.players === 'number') {
        knownPlayers += s.players;
        slots += Math.max(0, (s.maxPlayers || 0) - s.players);
        hasKnown = true;
      }
    });

    return {
      total: list.length,
      players: hasKnown ? knownPlayers : null,
      online: liveKnown ? online : null,
      slots: hasKnown ? slots : null,
      maxPlayers: maxPlayers,
      fill: maxPlayers ? Math.min(100, Math.round((knownPlayers / maxPlayers) * 100)) : 0
    };
  }

  /* ---------------- 筛选与排序 ---------------- */

  function visibleServers() {
    var q = state.search.trim().toLowerCase();
    var list = state.servers.map(effective).filter(function (s) {
      if (state.mode !== '全部' && s.mode !== state.mode) return false;
      if (state.onlyFav && !state.favorites.has(s.id)) return false;
      if (state.notFull && typeof s.players === 'number' && s.players >= s.maxPlayers) return false;
      if (state.hasPlayers && !(typeof s.players === 'number' && s.players > 0)) return false;
      if (q) {
        var hay = [s.name, s.address, s.map, mapInfo(s.map).name, s.mode, s.region]
          .concat(s.tags || []).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      var favA = state.favorites.has(a.id) ? 1 : 0;
      var favB = state.favorites.has(b.id) ? 1 : 0;
      if (state.sort === 'players') {
        return (b.players == null ? -1 : b.players) - (a.players == null ? -1 : a.players);
      }
      if (state.sort === 'slots') {
        var sa = a.players == null ? -1 : (a.maxPlayers - a.players);
        var sb = b.players == null ? -1 : (b.maxPlayers - b.players);
        return sb - sa;
      }
      if (state.sort === 'map') {
        return mapInfo(a.map).name.localeCompare(mapInfo(b.map).name, 'zh-CN');
      }
      if (state.sort === 'name') {
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      if (favA !== favB) return favB - favA;
      if (a.online !== b.online) return a.online === true ? -1 : 1;
      return (b.players == null ? -1 : b.players) - (a.players == null ? -1 : a.players);
    });

    return list;
  }

  /* ---------------- 渲染 ---------------- */

  function renderAll() {
    renderStats();
    renderQuickEntry();
    renderChips();
    renderList();
    renderSource();
    renderNav();
  }

  function setText(el, v) { if (el) el.textContent = v; }

  function renderStats() {
    var s = stats();

    setText(els.statPlayers, s.players == null ? '—' : s.players);
    setText(els.statPlayersSub,
      s.players == null
        ? (state.live ? '等待服务器响应' : (state.cloud ? '云端配置' : '静态配置'))
        : (state.live ? '实时检测' : (state.cloud ? '云端配置' : '配置数据')));
    setText(els.statServers, s.total);
    setText(els.statServersSub, s.online == null ? '共 ' + s.total + ' 个' : '在线 ' + s.online + ' 个');
    setText(els.statSlots, s.slots == null ? '—' : s.slots);
    setText(els.statSlotsSub, s.slots == null ? '等待检测' : '总容量 ' + s.maxPlayers);
    setText(els.statFav, state.favorites.size);

    if (els.statRing) els.statRing.style.setProperty('--ring', (s.online == null ? 100 : (s.total ? Math.round(s.online / s.total * 100) : 0)) + '%');
    if (els.sideMeterFill) els.sideMeterFill.style.width = s.fill + '%';

    setText(els.sidePlayers, s.players == null ? '—' : s.players);
    setText(els.sideServers, s.online == null ? s.total : s.online + ' / ' + s.total);
    setText(els.sideSlots, s.slots == null ? '—' : s.slots);
    setText(els.navFavCount, state.favorites.size);

    if (els.sideHint) {
      if (state.origin === 'status') {
        els.sideHint.textContent = state.live
          ? '状态服务已连接 · 每 ' + (REFRESH_MS / 1000) + ' 秒自动刷新'
          : '状态服务已连接 · 等待服务器响应';
      } else if (state.live) {
        els.sideHint.textContent = (state.origin === 'cloud' ? '云端实时检测已连接' : '本地实时检测已连接') +
          ' · 每 ' + (REFRESH_MS / 1000) + ' 秒自动刷新';
      } else if (state.cloud) {
        els.sideHint.textContent = '已连接云端后台 · 配置由管理后台下发';
      } else {
        els.sideHint.textContent = '静态配置模式 · 运行 serve.mjs 可检测实时人数';
      }
    }
  }

  function renderSource() {
    if (!els.sourceBadge) return;
    els.sourceBadge.classList.toggle('is-live', state.live);
    els.sourceBadge.classList.toggle('is-cloud', state.cloud && !state.live);
    setText(els.sourceText,
      state.live ? '实时检测' : state.origin === 'status' ? '状态服务' : state.cloud ? '云端配置' : '静态配置');
    setText(els.footSource,
      state.origin === 'cloud' ? '云端后台（D1）' : state.origin === 'status' ? '状态服务' : '本地服务器配置');

    if (els.updatedText) {
      if (!state.lastUpdated) {
        els.updatedText.textContent = '尚未刷新';
      } else if (state.live) {
        els.updatedText.textContent = '更新于 ' + state.lastUpdated.toLocaleTimeString('zh-CN', { hour12: false }) + ' · 每 ' + (REFRESH_MS / 1000) + ' 秒刷新';
      } else if (state.origin === 'status') {
        els.updatedText.textContent = '状态服务 · ' + state.lastUpdated.toLocaleTimeString('zh-CN', { hour12: false }) + ' · 每 ' + (REFRESH_MS / 1000) + ' 秒刷新';
      } else if (state.cloud) {
        els.updatedText.textContent = '云端同步 · ' + state.lastUpdated.toLocaleTimeString('zh-CN', { hour12: false }) + ' · 每 ' + (REFRESH_MS / 1000) + ' 秒刷新';
      } else {
        els.updatedText.textContent = '静态配置 · ' + state.lastUpdated.toLocaleTimeString('zh-CN', { hour12: false });
      }
    }
  }

  function renderChips() {
    var modes = ['全部'];
    state.servers.forEach(function (s) {
      if (s.mode && modes.indexOf(s.mode) === -1) modes.push(s.mode);
    });
    if (state.mode !== '全部' && modes.indexOf(state.mode) === -1) modes.push(state.mode);

    if (els.modeChips) {
      var signature = modes.join('\u0001');
      if (signature !== state.modesSig) {
        var wasChip = document.activeElement && document.activeElement.classList &&
          document.activeElement.classList.contains('chip');

        els.modeChips.innerHTML = modes.map(function (m) {
          var on = state.mode === m;
          return '<button class="chip' + (on ? ' is-active' : '') + '" data-mode="' + esc(m) +
            '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(m) + '</button>';
        }).join('');
        state.modesSig = signature;

        if (wasChip) {
          var current = els.modeChips.querySelector('.chip.is-active');
          if (current) current.focus();
        }
      } else {
        els.modeChips.querySelectorAll('.chip').forEach(function (btn) {
          var on = btn.getAttribute('data-mode') === state.mode;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
    }

    var active = [];
    if (state.notFull) active.push('仅看未满');
    if (state.hasPlayers) active.push('有人在线');
    if (state.onlyFav) active.push('只看收藏');
    setText(els.filterSummary, active.length ? ' · ' + active.join(' + ') : '');
  }

  function renderNav() {
    document.querySelectorAll('[data-nav]').forEach(function (btn) {
      var name = btn.getAttribute('data-nav');
      var on = name === 'favorites' ? state.onlyFav : (name === 'servers' && !state.onlyFav);
      btn.classList.toggle('is-active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    setText(els.navFavCount, state.favorites.size);
    document.querySelectorAll('[data-filter]').forEach(function (btn) {
      var key = btn.getAttribute('data-filter');
      btn.classList.toggle('is-active', !!state[key]);
      btn.setAttribute('aria-pressed', !!state[key] ? 'true' : 'false');
    });
    document.querySelectorAll('[data-view]').forEach(function (btn) {
      var on = btn.getAttribute('data-view') === state.view;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (els.sortSelect) els.sortSelect.value = state.sort;
    if (els.searchInput && els.searchInput.value !== state.search) els.searchInput.value = state.search;
  }

  function pingClass(ping) {
    if (ping == null) return '';
    if (ping < 60) return 'good';
    if (ping < 120) return 'mid';
    return 'bad';
  }

  function statusInfo(s) {
    if (s.online === true) {
      if (typeof s.players === 'number' && s.players >= s.maxPlayers) return { cls: 'is-full', text: '满员' };
      if (typeof s.players === 'number' && s.players > 0) return { cls: 'is-live', text: '在线' };
      return { cls: 'is-live', text: '空闲' };
    }
    if (s.online === false) return { cls: '', text: '未响应' };
    return { cls: '', text: '未检测' };
  }

  function freeSlots(s) {
    return typeof s.players === 'number' ? Math.max(0, (s.maxPlayers || 0) - s.players) : null;
  }

  function recommendRank(s) {
    var free = freeSlots(s);
    if (s.online === true && (free === null || free > 0)) return 0;
    if (s.online !== false && (free === null || free > 0)) return 1;
    if (s.online === true) return 3;
    return 2;
  }

  function sortedQuickServers() {
    return state.servers.map(effective).map(function (s, i) {
      return { s: s, i: i };
    }).sort(function (a, b) {
      var ra = recommendRank(a.s), rb = recommendRank(b.s);
      if (ra !== rb) return ra - rb;
      var fa = freeSlots(a.s), fb = freeSlots(b.s);
      if (fa !== fb) return (fb == null ? -1 : fb) - (fa == null ? -1 : fa);
      return a.i - b.i;
    }).map(function (x) { return x.s; });
  }

  function quickCardHTML(s, rec) {
    var mi = mapInfo(s.map);
    var st = statusInfo(s);
    var free = freeSlots(s);
    var meta;
    if (typeof s.players === 'number') {
      meta = '<b>' + s.players + '</b> / ' + s.maxPlayers + ' 人 · ' +
        (free > 0 ? free + ' 个空位' : '已满') +
        (s.ping != null ? ' · ' + s.ping + ' ms' : '');
    } else {
      meta = '状态未检测 · 可直接尝试进入' + (s.ping != null ? ' · ' + s.ping + ' ms' : '');
    }

    return '' +
      '<article class="quick-card' + (rec ? ' is-rec' : '') + '" data-id="' + esc(s.id) + '" style="--map-a:' + mi.a + ';--map-b:' + mi.b + '">' +
        '<div class="quick-art">' +
          '<div class="quick-art-top">' +
            '<span class="mode-badge" data-mode="' + esc(s.mode) + '">' + esc(s.mode) + '</span>' +
            '<span class="state-badge ' + st.cls + '"><i class="dot"></i>' + st.text + '</span>' +
            (rec ? '<span class="quick-rec">' + icon('star') + '推荐</span>' : '') +
          '</div>' +
          '<div class="quick-map"><strong>' + esc(mi.name) + '</strong><span>' + esc((s.map || 'unknown').replace(/^de_/, '')) + '</span></div>' +
        '</div>' +
        '<div class="quick-body">' +
          '<div class="quick-head-row">' +
            '<h3 title="' + esc(s.name) + '">' + esc(s.name) + '</h3>' +
            (s.password || s.requirePassword ? '<span class="tag" title="需要密码">' + icon('lock') + '</span>' : '') +
          '</div>' +
          '<p class="quick-meta">' + meta + '</p>' +
          '<div class="quick-addr">' +
            '<span class="addr" title="' + esc(s.address) + '">' + esc(s.address) + '</span>' +
            '<button class="copy-btn" data-action="copy" data-id="' + esc(s.id) + '" title="复制连接指令" aria-label="复制连接指令">' + icon('copy') + '</button>' +
          '</div>' +
          '<div class="quick-btns">' +
            '<button class="btn btn-primary btn-join-lg" data-action="join" data-id="' + esc(s.id) + '">' + icon('play') + '进入服务器</button>' +
            '<button class="btn" data-action="detail" data-id="' + esc(s.id) + '">详情</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderQuickEntry() {
    if (!els.quickServers) return;

    if (state.loading) {
      els.quickServers.innerHTML = '<div class="quick-skeleton"></div><div class="quick-skeleton"></div>';
      if (els.quickJoinBtn) els.quickJoinBtn.disabled = true;
      setText(els.quickJoinName, '读取中');
      state.quickSig = '';
      return;
    }

    var list = sortedQuickServers();
    if (!list.length) {
      state.quickPickId = null;
      setText(els.quickJoinName, '暂无服务器');
      if (els.quickJoinBtn) els.quickJoinBtn.disabled = true;
      if (state.quickSig !== 'empty') {
        state.quickSig = 'empty';
        els.quickServers.innerHTML =
          '<div class="quick-empty">' +
            '<div class="quick-empty-icon">' + icon('server') + '</div>' +
            '<div><b>还没有可用的服务器</b><p>线上列表由管理员维护；你也可以在「本地设置」中添加仅本机可见的服务器。</p></div>' +
            '<button class="btn" data-action="settings">' + icon('settings') + '打开设置</button>' +
          '</div>';
      }
      return;
    }

    var pick = list[0];
    state.quickPickId = pick.id;
    setText(els.quickJoinName, pick.name);
    if (els.quickJoinBtn) els.quickJoinBtn.disabled = false;

    var sig = list.slice(0, 2).map(function (s) {
      return [s.id, s.name, s.address, s.map, s.mode, s.players, s.maxPlayers, s.online === true ? 1 : s.online === false ? 0 : -1, s.ping].join('|');
    }).join(';');
    if (sig === state.quickSig) return;
    state.quickSig = sig;

    els.quickServers.innerHTML = list.slice(0, 2).map(function (s, i) {
      return quickCardHTML(s, i === 0 && recommendRank(s) <= 1);
    }).join('');
  }

  function cardHTML(s, i) {
    var mi = mapInfo(s.map);
    var st = statusInfo(s);
    var fav = state.favorites.has(s.id);
    var pct = typeof s.players === 'number' && s.maxPlayers ? Math.min(100, Math.round(s.players / s.maxPlayers * 100)) : 0;
    var barCls = pct >= 95 ? ' is-full' : (pct >= 60 ? ' is-mid' : '');
    var playerText = typeof s.players === 'number' ? s.players : '—';
    var fullCls = (typeof s.players === 'number' && s.players >= s.maxPlayers) ? ' is-full' : '';
    var ping = s.ping == null ? '' : (s.ping + ' ms');
    var tags = (s.tags || []).slice(0, 3).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    var mapCode = (s.map || 'unknown').replace(/^de_/, '');

    return '' +
      '<article class="server-card" data-id="' + esc(s.id) + '" style="--map-a:' + mi.a + ';--map-b:' + mi.b + ';animation-delay:' + Math.min(i * 36, 320) + 'ms">' +
        '<div class="card-art">' +
          '<div class="map-line"></div>' +
          '<div class="map-watermark">' + esc(mapCode) + '</div>' +
          '<div class="art-top">' +
            '<span class="mode-badge" data-mode="' + esc(s.mode) + '">' + esc(s.mode) + '</span>' +
            '<span class="state-badge ' + st.cls + '"><i class="dot"></i>' + st.text + '</span>' +
            '<button class="fav-btn' + (fav ? ' is-on' : '') + '" data-action="fav" data-id="' + esc(s.id) + '" title="' + (fav ? '取消收藏' : '收藏服务器') + '" aria-label="' + (fav ? '取消收藏' : '收藏服务器') + '" aria-pressed="' + (fav ? 'true' : 'false') + '">' + icon('star') + '</button>' +
          '</div>' +
          '<div class="art-bottom">' +
            '<div class="map-name"><small>MAP</small><strong>' + esc(mi.name) + '</strong></div>' +
            (s.region ? '<span class="region-tag">' + icon('pin') + esc(s.region) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-title-row">' +
            '<span class="ping-dot ' + pingClass(s.ping) + '" title="' + (ping || '未检测延迟') + '"></span>' +
            '<span class="server-name" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' +
            (s.password || s.requirePassword ? '<span class="tag" title="需要密码">' + icon('lock') + '</span>' : '') +
          '</div>' +
          '<div class="addr-row">' +
            '<span class="addr" title="' + esc(s.address) + '">' + esc(s.address) + '</span>' +
            '<button class="copy-btn" data-action="copy" data-id="' + esc(s.id) + '" title="复制连接指令" aria-label="复制连接指令">' + icon('copy') + '</button>' +
          '</div>' +
          '<div class="player-row">' +
            '<span class="player-num' + fullCls + '"><b>' + playerText + '</b> / ' + s.maxPlayers + '</span>' +
            '<span class="player-bar"><i class="' + barCls + '" style="width:' + pct + '%"></i></span>' +
          '</div>' +
          '<div class="card-foot">' +
            '<div class="tags">' + tags + '</div>' +
            '<div class="card-actions">' +
              '<button class="btn btn-sm btn-ghost" data-action="detail" data-id="' + esc(s.id) + '">详情</button>' +
              '<button class="btn btn-sm btn-primary join-btn" data-action="join" data-id="' + esc(s.id) + '">' + icon('play') + '进服</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderList() {
    if (!els.serverList) return;
    els.serverList.classList.toggle('is-list', state.view === 'list');
    els.serverList.classList.toggle('no-intro', state.hasRenderedList);
    els.serverList.setAttribute('aria-busy', state.loading ? 'true' : 'false');

    var list = visibleServers();
    setText(els.resultCount, list.length);

    if (state.loading) {
      els.serverList.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      return;
    }

    if (!list.length) {
      var msg = state.base.length === 0
        ? '还没有服务器。线上列表由管理员维护；你也可以在「本地设置」中添加仅本机可见的服务器。'
        : '当前筛选条件下没有匹配的服务器。试试清空搜索或关闭部分筛选。';
      els.serverList.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">' + icon('server') + '</div>' +
          '<h3>' + (state.base.length === 0 ? '服务器列表为空' : '没有符合条件的服务器') + '</h3>' +
          '<p>' + msg + '</p>' +
          '<button class="btn btn-primary" data-action="settings">' + icon('settings') + '打开数据设置</button>' +
        '</div>';
      state.hasRenderedList = true;
      return;
    }

    els.serverList.innerHTML = list.map(cardHTML).join('');
    state.hasRenderedList = true;
  }

  /* ---------------- 弹窗 ---------------- */

  function closeModal() {
    els.modalRoot.innerHTML = '';
    state.pendingJoin = null;
    state.editingId = null;
    renderNav();
    if (state.lastFocus && document.contains(state.lastFocus)) {
      try { state.lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    state.lastFocus = null;
  }

  function openModal(html, size) {
    state.lastFocus = document.activeElement;
    els.modalRoot.innerHTML =
      '<div class="modal-backdrop" data-modal-backdrop>' +
        '<div class="modal ' + (size || '') + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' + html + '</div>' +
      '</div>';
    var first = els.modalRoot.querySelector('.modal-body input, .modal-body select, .modal-body textarea') ||
      els.modalRoot.querySelector('.modal-close');
    if (first) setTimeout(function () { first.focus(); }, 60);
  }

  function modalHead(title, sub) {
    return '<div class="modal-head"><div><h2 id="modalTitle">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      '<button class="modal-close" data-action="close" aria-label="关闭">' + icon('x') + '</button></div>';
  }

  function findServer(id) {
    return state.servers.map(effective).filter(function (s) { return s.id === id; })[0] ||
      state.base.filter(function (s) { return s.id === id; })[0] || null;
  }

  function openDetail(id) {
    var s = findServer(id);
    if (!s) return;
    var mi = mapInfo(s.map);
    var st = statusInfo(s);
    var fav = state.favorites.has(s.id);
    var playerText = typeof s.players === 'number' ? s.players : '—';

    var html = modalHead(s.name, s.region ? s.region + ' · ' + s.mode : s.mode) +
      '<div class="modal-body">' +
        '<div class="detail-art" style="--map-a:' + mi.a + ';--map-b:' + mi.b + '">' +
          '<div class="detail-art-text">' +
            '<div><div class="map-code">' + esc(s.map || 'unknown') + '</div><h3>' + esc(mi.name) + '</h3></div>' +
            '<span class="state-badge ' + st.cls + ' detail-mode"><i class="dot"></i>' + st.text + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="detail-grid">' +
          '<div class="detail-cell"><span>在线人数</span><b>' + playerText + ' / ' + s.maxPlayers + '</b></div>' +
          '<div class="detail-cell"><span>模式</span><b>' + esc(s.mode) + '</b></div>' +
          '<div class="detail-cell"><span>延迟</span><b>' + (s.ping == null ? '未检测' : s.ping + ' ms') + '</b></div>' +
        '</div>' +
        '<div class="detail-address">' +
          '<span class="addr">connect ' + esc(s.address) + '</span>' +
          '<button class="copy-btn" data-action="copy" data-id="' + esc(s.id) + '" title="复制连接指令">' + icon('copy') + '</button>' +
        '</div>' +
        (s.note ? '<div class="detail-note"><b>提示</b> · ' + esc(s.note) + '</div>' : '') +
        '<div class="detail-actions">' +
          '<button class="btn" data-action="fav" data-id="' + esc(s.id) + '">' + icon('star') + (fav ? '取消收藏' : '收藏') + '</button>' +
          '<button class="btn btn-primary" data-action="join" data-id="' + esc(s.id) + '">' + icon('play') + '启动 CS2 并加入</button>' +
        '</div>' +
        '<p class="field-hint" style="margin-top:12px">进服命令：<code>connect ' + esc(s.address) + '</code>。如果游戏已启动，会直接连接；否则将通过 Steam 启动 CS2。</p>' +
      '</div>';

    openModal(html, 'modal-lg');
  }

  function openPassword(id) {
    var s = findServer(id);
    if (!s) return;
    state.pendingJoin = s.id;
    var html = modalHead('需要进服密码', '该服务器启用了密码保护') +
      '<form data-form="password">' +
        '<div class="modal-body">' +
          '<div class="pw-icon">' + icon('lock') + '</div>' +
          '<div class="pw-target">即将加入<b>' + esc(s.name) + '</b></div>' +
          '<div class="field"><label for="joinPwd">进服密码</label>' +
            '<input id="joinPwd" name="password" type="password" autocomplete="off" placeholder="' +
            (s.password ? '留空则使用配置中的密码' : '请输入服务器密码') + '">' +
          '</div>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn" data-action="close">取消</button>' +
          '<button type="submit" class="btn btn-primary">' + icon('play') + '加入服务器</button>' +
        '</div>' +
      '</form>';
    openModal(html, 'modal-sm');
  }

  /* ---------------- 快捷方式 / 公告 / 帮助 ---------------- */

  function isStandalone() {
    return state.standalone ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
  }

  function setShortcutState(value) {
    state.shortcutState = value;
    writeJSON(LS_SHORTCUT, { state: value, at: Date.now() });
  }

  function showShortcutPrompt() {
    if (!els.shortcutPrompt || state.shortcutState || isStandalone()) return;
    if (els.modalRoot && els.modalRoot.innerHTML) {
      state.promptTimer = setTimeout(showShortcutPrompt, 4000);
      return;
    }
    els.shortcutPrompt.hidden = false;
    document.body.classList.add('has-shortcut-prompt');
  }

  function hideShortcutPrompt() {
    if (els.shortcutPrompt) els.shortcutPrompt.hidden = true;
    document.body.classList.remove('has-shortcut-prompt');
  }

  function openShortcutModal() {
    if (isStandalone()) {
      toast('当前已在桌面应用模式运行', 'ok');
      hideShortcutPrompt();
      return;
    }

    var installed = state.shortcutState === 'installed';
    var canInstall = !!state.deferredPrompt && !installed;
    var html = modalHead('桌面快捷方式', '由你确认后才会创建') +
      '<div class="modal-body">' +
        '<div class="shortcut-hero">' +
          '<div class="sp-icon">' + icon('desktop') + '</div>' +
          '<b>背水进服大厅</b>' +
          '<p>' + (installed ? '桌面快捷方式已创建。' : '创建桌面快捷方式，下次一步直达进服大厅。') + '</p>' +
        '</div>' +
        '<ul class="shortcut-points">' +
          '<li>仅创建网站快捷方式，不安装后台程序。</li>' +
          '<li>不读取、不上传任何个人数据。</li>' +
          '<li>可随时从桌面删除，不影响游戏与账号。</li>' +
        '</ul>' +
        (canInstall
          ? '<div class="shortcut-steps">点击下方「创建快捷方式」后，浏览器会弹出安装确认。同意后，桌面会生成「背水进服大厅」快捷方式，可像普通应用一样打开。</div>'
          : installed
            ? '<div class="shortcut-steps"><b>桌面快捷方式已创建。</b><br>如果没有在桌面看到图标，可下载快捷方式文件，保存到桌面后使用。</div>'
            : '<div class="shortcut-steps"><b>当前浏览器未提供一键安装，可手动添加：</b><br>' +
              '1. 电脑端：打开浏览器右上角菜单，选择「应用」或「安装此站点」。<br>' +
              '2. iPhone / iPad：在 Safari 分享菜单中选择「添加到主屏幕」。<br>' +
              '3. 也可以下载快捷方式文件，保存到桌面后使用。</div>') +
        '<p class="shortcut-note">桌面快捷方式只指向本页面，不会在后台运行，也不会修改游戏文件。</p>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn" data-action="close">取消</button>' +
        (canInstall
          ? '<button class="btn btn-primary" data-action="installShortcut">' + icon('desktop') + '创建快捷方式</button>'
          : '<button class="btn btn-primary" data-action="downloadShortcut">' + icon('download') + '下载快捷方式文件</button>') +
      '</div>';

    openModal(html, 'modal-sm');
  }

  function installShortcut() {
    if (isStandalone()) {
      hideShortcutPrompt();
      toast('当前已在桌面应用模式运行', 'ok');
      return;
    }

    if (!state.deferredPrompt) {
      openShortcutModal();
      return;
    }

    var promptEvent = state.deferredPrompt;
    state.deferredPrompt = null;
    var promptResult;
    try {
      promptResult = promptEvent.prompt();
    } catch (e) {
      openShortcutModal();
      return;
    }
    if (promptResult && typeof promptResult.catch === 'function') {
      promptResult.catch(function () { openShortcutModal(); });
    }

    promptEvent.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') {
        setShortcutState('installed');
        hideShortcutPrompt();
        closeModal();
        toast('桌面快捷方式已创建', 'ok');
      } else {
        setShortcutState('declined');
        hideShortcutPrompt();
        closeModal();
        toast('已取消创建快捷方式', 'warn');
      }
    }).catch(function () {
      openShortcutModal();
      toast('浏览器未能完成安装，可下载快捷方式文件', 'warn');
    });
  }

  function downloadShortcutFile() {
    var page = location.href.split('#')[0];
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') page = SHORTCUT_URL;
    var iconUrl = new URL('assets/favicon.ico', page).href;
    var content = '[InternetShortcut]\r\nURL=' + page + '\r\nIconFile=' + iconUrl + '\r\nIconIndex=0\r\n';
    var blob = new Blob([content], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '背水平台进服大厅.url';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    setShortcutState('downloaded');
    hideShortcutPrompt();
    closeModal();
    toast('快捷方式文件已下载，请保存到桌面', 'ok');
  }

  function setupShortcut() {
    state.standalone = isStandalone();
    var saved = readJSON(LS_SHORTCUT, null);
    state.shortcutState = saved && saved.state ? saved.state : null;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      state.deferredPrompt = e;
    });

    window.addEventListener('appinstalled', function () {
      state.deferredPrompt = null;
      setShortcutState('installed');
      hideShortcutPrompt();
      toast('桌面快捷方式已创建', 'ok');
    });

    if (!state.standalone && !state.shortcutState) {
      state.promptTimer = setTimeout(function () {
        if (!state.shortcutState && !isStandalone()) showShortcutPrompt();
      }, 2800);
    }
  }

  function renderNotice() {
    if (!els.noticeBar) return;
    var id = els.noticeBar.getAttribute('data-notice-id') || '';
    var seen = readJSON(LS_NOTICE, '');
    if (id && seen === id) els.noticeBar.classList.add('is-hidden');
    else els.noticeBar.classList.remove('is-hidden');
  }

  function dismissNotice() {
    if (!els.noticeBar) return;
    var id = els.noticeBar.getAttribute('data-notice-id') || 'notice';
    writeJSON(LS_NOTICE, id);
    els.noticeBar.classList.add('is-hidden');
  }

  function openGuide() {
    var sample = state.base[0] ? state.base[0].address : 'frp-hip.com:30355';
    var html = modalHead('进服指南', '首次进服与常见问题') +
      '<div class="modal-body">' +
        '<ol class="guide-list">' +
          '<li><b>准备 Steam 与 CS2</b><span>确认 Steam 已登录，并已安装 Counter-Strike 2。服务器使用 Steam 账号，不需要额外注册。</span></li>' +
          '<li><b>选择服务器</b><span>在首屏选择标有「推荐」的节点，或点击「浏览全部服务器」按模式、人数和延迟挑选。</span></li>' +
          '<li><b>点击进入服务器</b><span>本地服务运行时将直接启动 CS2；未运行时自动回退到 Steam 协议。首次加载地图可能需要几十秒，请耐心等待。</span></li>' +
          '<li><b>连接失败怎么办</b><span>先重试一次；仍失败时检查加速器、网络与服务器是否满员。也可以复制下方 connect 指令，在游戏控制台手动连接。</span></li>' +
        '</ol>' +
        '<div class="guide-cmd">' +
          '<code>connect ' + esc(sample) + '</code>' +
          '<button class="copy-btn" data-action="copyconnect" data-address="' + esc(sample) + '" title="复制连接指令" aria-label="复制连接指令">' + icon('copy') + '</button>' +
        '</div>' +
        '<p class="field-hint" style="margin-top:10px">控制台可在 CS2 设置中启用。若服务器有密码，请向管理员获取后再进入。</p>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn btn-primary" data-action="close">知道了</button></div>';
    openModal(html, 'modal-lg');
  }

  function openContact() {
    var html = modalHead('联系管理员', '账号、满员与连接问题') +
      '<div class="modal-body">' +
        '<div class="contact-card">' +
          '<div class="sp-icon">' + icon('message') + '</div>' +
          '<p class="contact-sub">遇到无法进服、服务器满员、密码或账号问题时，请携带服务器名称与报错截图联系管理员。</p>' +
          '<div class="contact-qq">2994938720</div>' +
          '<p class="contact-sub">管理员 QQ</p>' +
          '<button class="btn btn-primary" data-action="copyqq">' + icon('copy') + '复制 QQ 号</button>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" data-action="close">关闭</button></div>';
    openModal(html, 'modal-sm');
  }

  function copyQQ() {
    copyText('2994938720').then(function (ok) {
      toast(ok ? 'QQ 号已复制' : '复制失败，请手动记录 QQ 2994938720', ok ? 'ok' : 'error');
    });
  }

  function copyConnectAddress(address) {
    copyText('connect ' + address).then(function (ok) {
      toast(ok ? '连接指令已复制' : '复制失败，请手动输入 connect ' + address, ok ? 'ok' : 'error');
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {
        /* 离线能力不可用时不打扰玩家 */
      });
    });
  }

  function openSettings(focusForm) {
    var options = Object.keys(MAPS).map(function (k) {
      return '<option value="' + k + '"' + (k === 'de_dust2' ? ' selected' : '') + '>' +
        esc(MAPS[k].name) + '（' + k + '）</option>';
    }).join('');
    var modes = ['满十', '混战', '死斗', '回防', '刀战', '娱乐', '社区服'];

    var html = modalHead('本地设置', '增删只影响当前浏览器，不会修改线上服务器列表') +
      '<div class="modal-body">' +
        '<div class="local-notice">' +
          icon('info') +
          '<div><b>仅本机</b> · 这里的添加、修改、删除只写入当前浏览器的 localStorage，不会影响其他玩家，也不会修改线上 <code>room/data/servers.js</code>。线上列表由管理员通过 GitHub 仓库维护。</div>' +
        '</div>' +
        '<div class="settings-section">' +
          '<div class="settings-title">' + icon('info') + '数据源</div>' +
          '<div class="source-note">' +
            icon('check') +
            '<div>本地覆盖只对当前浏览器生效；恢复线上列表后会重新读取部署的 <code>data/servers.js</code>。运行 <code>start.cmd</code> 时还会通过 A2S 查询真实人数与延迟。</div>' +
          '</div>' +
          '<div class="settings-row" style="margin-top:12px">' +
            '<button class="btn" data-action="import">' + icon('upload') + '导入本地 servers.json</button>' +
            '<button class="btn" data-action="export">' + icon('download') + '导出本地配置</button>' +
            '<button class="btn" data-action="reset">' + icon('refresh') + '恢复线上列表</button>' +
          '</div>' +
          '<div class="source-note" style="margin-top:10px">' +
            icon('gamepad') +
            '<div>运行 <code>start.cmd</code> 时优先直接启动 <code>cs2.exe</code>（<code>-steam +connect</code>）；静态托管时自动回退到 <code>steam://rungame/730/…/+connect</code>。嵌入 WebView2 时还会发送 <code>bsp-join</code> 消息给宿主。</div>' +
          '</div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-title">' + icon('server') + '本地列表（仅本机） <span class="tag" id="editorCount">' + state.base.length + '</span></div>' +
          '<div class="editor-list" id="editorList">' + editorRows() + '</div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-title">' + icon(state.editingId ? 'settings' : 'plus') + (state.editingId ? '编辑本地服务器' : '添加本地服务器') + '</div>' +
          '<form data-form="server" id="serverForm">' +
            '<div class="field-grid">' +
              '<div class="field full"><label>名称</label><input name="name" required maxlength="60" placeholder="例如：背水 · 主服"></div>' +
              '<div class="field full"><label>地址 <span>host:port</span></label><input name="address" required placeholder="frp-hip.com:30355" pattern="[^\\s:]+:\\d{1,5}"></div>' +
              '<div class="field"><label>地图</label><select name="map"><option value="">未知地图</option>' + options + '</select></div>' +
              '<div class="field"><label>模式</label><select name="mode">' + modes.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>' +
              '<div class="field"><label>地区</label><input name="region" maxlength="20" placeholder="例如：宁波 / 远程"></div>' +
              '<div class="field"><label>最大人数</label><input name="maxPlayers" type="number" min="2" max="128" value="10"></div>' +
              '<div class="field"><label>进服密码 <span>可选</span></label><input name="password" type="password" autocomplete="off" placeholder="随 Steam 命令发送"></div>' +
              '<div class="field full"><label class="check"><input type="checkbox" name="requirePassword"> 进服时要求玩家输入密码</label></div>' +
              '<div class="field"><label>标签 <span>逗号分隔</span></label><input name="tags" placeholder="满十,主服"></div>' +
              '<div class="field full"><label>备注 <span>可选</span></label><textarea name="note" maxlength="300" placeholder="例如：由 FRP 隧道转发，进服前请确认隧道已启动"></textarea></div>' +
            '</div>' +
            '<div class="settings-row">' +
              '<button type="submit" class="btn btn-primary">' + icon('check') + (state.editingId ? '保存本地修改' : '添加到本地') + '</button>' +
              (state.editingId ? '<button type="button" class="btn" data-action="cancelEdit">取消编辑</button>' : '') +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';

    openModal(html, 'modal-lg');
    if (focusForm) {
      var f = els.modalRoot.querySelector('#serverForm');
      if (f) f.scrollIntoView({ block: 'center' });
    }
  }

  function editorRows() {
    if (!state.base.length) return '<div class="field-hint" style="padding:8px 2px">当前浏览器没有本地服务器，请在下方添加。</div>';
    return state.base.map(function (s) {
      return '<div class="editor-row" data-edit-id="' + esc(s.id) + '">' +
        '<div class="er-icon">' + icon('server') + '</div>' +
        '<div class="er-main"><b>' + esc(s.name) + '</b><span>' + esc(s.address) + '</span></div>' +
        '<span class="er-tag">' + esc(s.mode) + '</span>' +
        '<button class="icon-btn" data-action="edit" data-id="' + esc(s.id) + '" title="编辑">' + icon('settings') + '</button>' +
        '<button class="icon-btn" data-action="delete" data-id="' + esc(s.id) + '" title="删除">' + icon('trash') + '</button>' +
      '</div>';
    }).join('');
  }

  /* ---------------- 动作 ---------------- */

  function toggleFav(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    writeJSON(LS_FAV, Array.from(state.favorites));
    renderStats();
    renderList();
    renderNav();
    toast(state.favorites.has(id) ? '已加入收藏' : '已取消收藏', 'ok');
    if (els.modalRoot.querySelector('.detail-art')) openDetail(id);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  function connectCommand(s) {
    return s.password
      ? 'password ' + s.password + '; connect ' + s.address
      : 'connect ' + s.address;
  }

  function copyConnect(id) {
    var s = findServer(id);
    if (!s) return;
    copyText(connectCommand(s)).then(function (ok) {
      toast(ok ? '已复制：' + connectCommand(s) : '复制失败，请手动选择地址', ok ? 'ok' : 'error');
    });
  }

  function navigateSteam(uri) {
    try {
      var a = document.createElement('a');
      a.href = uri;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('正在通过 Steam 启动 CS2…', 'ok');
    } catch (e) {
      toast('无法唤起 Steam，请复制连接指令手动进服', 'error');
    }
  }

  function buildSteamUri(s, password) {
    var appId = Number(s.appId) || 730;
    var cmd = (password ? '+password%20' + encodeURIComponent(password) + '%20' : '') +
      '+connect%20' + s.address;
    return 'steam://rungame/' + appId + '/76561202255233023/' + cmd;
  }

  function directLaunch(s, password) {
    if (state.localLaunch === false || !window.fetch) return Promise.resolve(false);

    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 2500) : null;

    return fetch('api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: s.address, password: password || '' }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) return false;
        return res.json().then(function (data) { return !!(data && data.ok); });
      })
      .catch(function () { return false; })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function fallbackLaunch(uri, s, password) {
    // WebView2 宿主可监听该消息并直接调用 GameLauncher.LaunchGameAsync。
    // 宿主处理后把 window.__BSP_JOIN_HANDLED 设为 true，页面便不会再走系统协议。
    if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
      window.__BSP_JOIN_HANDLED = false;
      window.chrome.webview.postMessage({
        type: 'bsp-join',
        address: s.address,
        password: password || '',
        uri: uri
      });
      toast('正在请求平台启动 CS2…', 'ok');
      setTimeout(function () {
        if (!window.__BSP_JOIN_HANDLED) navigateSteam(uri);
      }, 800);
      return;
    }

    navigateSteam(uri);
  }

  function launch(s, password) {
    if (!isValidAddress(s.address)) {
      toast('服务器地址无效，请先在数据设置中修正', 'error');
      return;
    }

    var uri = buildSteamUri(s, password);
    toast('正在启动 CS2…');

    directLaunch(s, password).then(function (ok) {
      if (ok) {
        toast('CS2 已启动，正在连接服务器…', 'ok');
        return;
      }
      fallbackLaunch(uri, s, password);
    });
  }

  function checkLocalLaunch() {
    if (!window.fetch) return;
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 2000) : null;

    fetch('api/launch', { cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        state.localLaunch = !!(data && data.available);
        if (els.launchMode) {
          els.launchMode.textContent = state.localLaunch
            ? '一键进服 · 本地直连'
            : '一键进服 · Steam 协议';
          els.launchMode.title = state.localLaunch && data.exe
            ? '本地直连：' + data.exe
            : (data && data.reason) || '未运行本地服务，使用 Steam 协议进服';
        }
        if (els.asideLaunchMode) {
          els.asideLaunchMode.textContent = state.localLaunch
            ? '本地直连已就绪，点击即可启动 CS2。'
            : 'Steam 协议模式，点击后将唤起 Steam。';
        }
      })
      .catch(function () {
        state.localLaunch = null;
        if (els.asideLaunchMode) els.asideLaunchMode.textContent = 'Steam 协议模式，点击后将唤起 Steam。';
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function requestJoin(id) {
    var s = findServer(id);
    if (!s) return;

    if (s.requirePassword) {
      openPassword(id);
      return;
    }

    launch(s, s.password || '');
  }

  function pruneFavorites() {
    var ids = {};
    state.servers.forEach(function (s) { ids[s.id] = true; });
    var changed = false;
    Array.from(state.favorites).forEach(function (id) {
      if (!ids[id]) { state.favorites.delete(id); changed = true; }
    });
    if (changed) writeJSON(LS_FAV, Array.from(state.favorites));
  }

  function persistAndRefresh(message) {
    saveBase();
    state.servers = state.base.map(function (s) { return Object.assign({}, s, { live: null }); });
    pruneFavorites();
    renderAll();
    refresh(false);
    if (message) toast(message, 'ok');
  }

  function handleImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = String(reader.result || '');
        var start = text.indexOf('[');
        var end = text.lastIndexOf(']');
        if (start === -1 || end === -1) throw new Error('not array');
        var raw = JSON.parse(text.slice(start, end + 1));
        if (!Array.isArray(raw) || !raw.length) throw new Error('empty');
        var imported = normalizeList(raw);
        if (!imported.length) throw new Error('no address');

        state.base = imported.map(stripLive);
        saveBase();
        state.servers = state.base.slice();
        pruneFavorites();
        renderAll();
        openSettings();
        refresh(false);
        toast('已导入 ' + state.base.length + ' 个服务器到当前浏览器', 'ok');
      } catch (e) {
        toast('导入失败：文件不是有效的 servers.json', 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function exportConfig() {
    var header = '/* 背水对战平台 · 社区服配置（导出） */\nwindow.BEISHUI_SERVERS = ';
    var payload = header + JSON.stringify(state.base.map(function (s) {
      return {
        id: s.id, name: s.name, address: s.address, map: s.map, mode: s.mode,
        region: s.region, players: s.players, maxPlayers: s.maxPlayers,
        password: s.password, requirePassword: s.requirePassword, appId: s.appId,
        tags: s.tags, note: s.note
      };
    }), null, 2) + ';\n';
    var blob = new Blob([payload], { type: 'text/javascript;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'servers.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('配置已导出为 servers.js', 'ok');
  }

  function readForm() {
    var f = els.modalRoot.querySelector('#serverForm');
    if (!f) return null;
    var data = new FormData(f);
    return {
      name: String(data.get('name') || '').trim(),
      address: String(data.get('address') || '').trim(),
      map: String(data.get('map') || ''),
      mode: String(data.get('mode') || '社区服'),
      region: String(data.get('region') || '').trim(),
      maxPlayers: Number(data.get('maxPlayers')) || 10,
      password: String(data.get('password') || ''),
      requirePassword: data.get('requirePassword') === 'on',
      tags: String(data.get('tags') || '').split(/[，,]/).map(function (t) { return t.trim(); }).filter(Boolean),
      note: String(data.get('note') || '').trim()
    };
  }

  function submitServer() {
    var data = readForm();
    if (!data) return;
    if (!isValidAddress(data.address)) {
      toast('地址格式应为 host:port，例如 frp-hip.com:30355', 'error');
      return;
    }
    if (state.base.some(function (s) { return s.address === data.address && s.id !== state.editingId; })) {
      toast('该服务器地址已存在', 'error');
      return;
    }

    if (state.editingId) {
      var idx = state.base.findIndex(function (s) { return s.id === state.editingId; });
      if (idx >= 0) {
        state.base[idx] = Object.assign({}, state.base[idx], data);
      }
    } else {
      state.base.push(Object.assign({
        id: stableId(data.address, state.base.length),
        players: null,
        appId: 730
      }, data));
    }

    state.editingId = null;
    persistAndRefresh('已保存到当前浏览器');
    openSettings();
  }

  function editServer(id) {
    var s = state.base.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    state.editingId = id;
    openSettings();
    var f = els.modalRoot.querySelector('#serverForm');
    if (!f) return;
    f.name.value = s.name;
    f.address.value = s.address;

    f.map.value = s.map || '';
    if (f.map.value !== (s.map || '')) {
      var mo = document.createElement('option');
      mo.value = s.map;
      mo.textContent = s.map;
      f.map.appendChild(mo);
      f.map.value = s.map;
    }

    f.mode.value = s.mode || '社区服';
    if (f.mode.value !== (s.mode || '社区服')) {
      var xo = document.createElement('option');
      xo.value = s.mode;
      xo.textContent = s.mode;
      f.mode.appendChild(xo);
      f.mode.value = s.mode;
    }

    f.region.value = s.region || '';
    f.maxPlayers.value = s.maxPlayers || 10;
    f.password.value = s.password || '';
    f.requirePassword.checked = !!s.requirePassword;
    f.tags.value = (s.tags || []).join(',');
    f.note.value = s.note || '';
  }

  function deleteServer(id) {
    var s = state.base.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    if (!window.confirm('确定从当前浏览器删除「' + s.name + '」？不会影响线上列表。')) return;
    state.base = state.base.filter(function (x) { return x.id !== id; });
    state.favorites.delete(id);
    writeJSON(LS_FAV, Array.from(state.favorites));
    persistAndRefresh('已从当前浏览器删除');
    openSettings();
  }

  function resetConfig() {
    if (!window.confirm('恢复线上列表？只会清除当前浏览器的本地覆盖。')) return;
    try { localStorage.removeItem(LS_SERVERS); } catch (e) { /* ignore */ }
    state.localBase = false;
    state.base = normalizeList(window.BEISHUI_SERVERS || []);
    state.servers = state.base.map(stripLive);
    pruneFavorites();
    renderAll();
    refresh(false);
    openSettings();
    toast('已恢复线上列表', 'ok');
  }

  function toast(message, type) {
    if (!els.toastRoot) return;
    var node = document.createElement('div');
    node.className = 'toast' + (type === 'error' ? ' is-error' : type === 'warn' ? ' is-warn' : '');
    node.innerHTML = icon(type === 'error' ? 'alert' : type === 'warn' ? 'info' : 'check') + '<span>' + esc(message) + '</span>';
    els.toastRoot.appendChild(node);
    setTimeout(function () {
      node.classList.add('is-out');
      setTimeout(function () { node.remove(); }, 240);
    }, 2800);
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    document.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        var name = nav.getAttribute('data-nav');
        if (name === 'settings') {
          openSettings();
          return;
        }
        state.onlyFav = name === 'favorites';
        renderAll();
        if (els.main) els.main.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      var mode = e.target.closest('.chip[data-mode]');
      if (mode) {
        state.mode = mode.getAttribute('data-mode');
        renderAll();
        return;
      }

      var filter = e.target.closest('[data-filter]');
      if (filter) {
        var key = filter.getAttribute('data-filter');
        state[key] = !state[key];
        renderAll();
        return;
      }

      var view = e.target.closest('[data-view]');
      if (view) {
        state.view = view.getAttribute('data-view');
        savePrefs();
        renderAll();
        return;
      }

      var action = e.target.closest('[data-action]');
      if (action) {
        var act = action.getAttribute('data-action');
        var id = action.getAttribute('data-id');

        if (act === 'fav') { toggleFav(id); return; }
        if (act === 'copy') { copyConnect(id); return; }
        if (act === 'join') { requestJoin(id); return; }
        if (act === 'detail') { openDetail(id); return; }
        if (act === 'settings') { openSettings(); return; }
        if (act === 'close') { closeModal(); return; }
        if (act === 'edit') { editServer(id); return; }
        if (act === 'delete') { deleteServer(id); return; }
        if (act === 'import') { pickFile(); return; }
        if (act === 'export') { exportConfig(); return; }
        if (act === 'reset') { resetConfig(); return; }
        if (act === 'cancelEdit') { state.editingId = null; openSettings(); return; }
        if (act === 'quickjoin') { if (state.quickPickId) requestJoin(state.quickPickId); return; }
        if (act === 'browse') {
          if (els.serverList) els.serverList.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (act === 'guide') { openGuide(); return; }
        if (act === 'contact') { openContact(); return; }
        if (act === 'shortcut') { openShortcutModal(); return; }
        if (act === 'installShortcut') { installShortcut(); return; }
        if (act === 'downloadShortcut') { downloadShortcutFile(); return; }
        if (act === 'dismissShortcut') {
          setShortcutState('declined');
          hideShortcutPrompt();
          closeModal();
          toast('已选择暂不创建桌面快捷方式', 'warn');
          return;
        }
        if (act === 'dismissNotice') { dismissNotice(); return; }
        if (act === 'copyqq') { copyQQ(); return; }
        if (act === 'copyconnect') { copyConnectAddress(action.getAttribute('data-address') || ''); return; }
      }

      var quickCard = e.target.closest('.quick-card');
      if (quickCard && !e.target.closest('button')) {
        openDetail(quickCard.getAttribute('data-id'));
        return;
      }

      var card = e.target.closest('.server-card');
      if (card && !e.target.closest('button')) {
        openDetail(card.getAttribute('data-id'));
        return;
      }

      var backdrop = e.target.closest('[data-modal-backdrop]');
      if (backdrop && e.target === backdrop) closeModal();
    });

    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (form.matches('[data-form="server"]')) {
        e.preventDefault();
        submitServer();
      } else if (form.matches('[data-form="password"]')) {
        e.preventDefault();
        var input = form.querySelector('[name="password"]');
        var pwd = input ? input.value : '';
        var s = findServer(state.pendingJoin);
        if (!s) { closeModal(); return; }
        launch(s, pwd || s.password || '');
        closeModal();
      }
    });

    if (els.searchInput) {
      var searchTimer = null;
      els.searchInput.addEventListener('input', function () {
        state.search = els.searchInput.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderList, 120);
      });
    }

    if (els.sortSelect) {
      els.sortSelect.addEventListener('change', function () {
        state.sort = els.sortSelect.value;
        savePrefs();
        renderList();
      });
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', function () { refresh(true); });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (els.modalRoot && els.modalRoot.innerHTML) closeModal();
      }
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        if (els.searchInput) els.searchInput.focus();
      }
    });

    if (els.openSettings) els.openSettings.addEventListener('click', function () { openSettings(); });
    if (els.footSettings) els.footSettings.addEventListener('click', function () { openSettings(); });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && (state.cloud || STATUS_URL)) refresh(false);
    });

    window.addEventListener('hashchange', function () {
      hashHandled = false;
      applyHashOnce();
    });
  }

  function pickFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.js,application/json,text/javascript';
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) handleImportFile(input.files[0]);
    });
    input.click();
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    els = {
      serverList: document.getElementById('serverList'),
      modeChips: document.getElementById('modeChips'),
      searchInput: document.getElementById('searchInput'),
      sortSelect: document.getElementById('sortSelect'),
      refreshBtn: document.getElementById('refreshBtn'),
      sourceBadge: document.getElementById('sourceBadge'),
      sourceText: document.getElementById('sourceText'),
      updatedText: document.getElementById('updatedText'),
      resultCount: document.getElementById('resultCount'),
      filterSummary: document.getElementById('filterSummary'),
      statPlayers: document.getElementById('statPlayers'),
      statPlayersSub: document.getElementById('statPlayersSub'),
      statServers: document.getElementById('statServers'),
      statServersSub: document.getElementById('statServersSub'),
      statSlots: document.getElementById('statSlots'),
      statSlotsSub: document.getElementById('statSlotsSub'),
      statFav: document.getElementById('statFav'),
      statRing: document.getElementById('statRing'),
      footSource: document.getElementById('footSource'),
      navFavCount: document.getElementById('navFavCount'),
      sidePlayers: document.getElementById('sidePlayers'),
      sideServers: document.getElementById('sideServers'),
      sideSlots: document.getElementById('sideSlots'),
      sideMeterFill: document.getElementById('sideMeterFill'),
      sideHint: document.getElementById('sideHint'),
      modalRoot: document.getElementById('modalRoot'),
      toastRoot: document.getElementById('toastRoot'),
      openSettings: document.getElementById('openSettings'),
      footSettings: document.getElementById('footSettings'),
      launchMode: document.getElementById('launchMode'),
      quickServers: document.getElementById('quickServers'),
      quickJoinBtn: document.getElementById('quickJoinBtn'),
      quickJoinName: document.getElementById('quickJoinName'),
      noticeBar: document.getElementById('noticeBar'),
      shortcutPrompt: document.getElementById('shortcutPrompt'),
      asideLaunchMode: document.getElementById('asideLaunchMode'),
      launchHint: document.getElementById('launchHint'),
      main: document.querySelector('.main')
    };

    loadPrefs();

    var params = new URLSearchParams(location.search);
    if (params.get('view') === 'list') state.view = 'list';
    if (params.get('mode')) state.mode = params.get('mode');
    if (params.get('q')) state.search = params.get('q');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('fav') === '1') state.onlyFav = true;

    state.base = loadBase();
    state.servers = state.base.map(function (s) { return Object.assign({}, s, { live: null }); });
    var savedFav = readJSON(LS_FAV, []);
    state.favorites = new Set(Array.isArray(savedFav) ? savedFav : []);
    pruneFavorites();

    bind();
    renderAll();
    renderNotice();
    setupShortcut();
    registerServiceWorker();
    checkLocalLaunch();
    refresh(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
