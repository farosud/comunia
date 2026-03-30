/* ── Comunia Dashboard ── */
(function () {
  'use strict';

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  // ── Auth ──
  const TOKEN_KEY = 'comunia_token';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function authHeaders() {
    return { Authorization: 'Bearer ' + getToken() };
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, authHeaders());
    const res = await fetch('/api' + path, opts);
    if (res.status === 401) {
      clearToken();
      showLogin();
      throw new Error('Unauthorized');
    }
    return res;
  }

  async function apiJSON(path, opts) {
    const res = await apiFetch(path, opts);
    return res.json();
  }

  // ── htmx auth header injection ──
  document.body.addEventListener('htmx:configRequest', function (e) {
    const token = getToken();
    if (token) e.detail.headers['Authorization'] = 'Bearer ' + token;
  });

  // ── Bootstrap ──
  function boot() {
    if (getToken()) {
      showApp();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    $('#app').classList.add('hidden');
    $('#login-screen').classList.remove('hidden');
  }

  function showApp() {
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    navigateToHash();
  }

  // ── Login form ──
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const secret = $('#login-secret').value.trim();
    if (!secret) return;
    setToken(secret);
    $('#login-error').classList.add('hidden');
    // Verify by calling health
    apiFetch('/health')
      .then(function (res) {
        if (!res.ok) throw new Error('bad');
        showApp();
      })
      .catch(function () {
        clearToken();
        $('#login-error').classList.remove('hidden');
      });
  });

  $('#logout-btn').addEventListener('click', function () {
    clearToken();
    if (sseSource) { sseSource.close(); sseSource = null; }
    showLogin();
  });

  // ── Navigation ──
  const sections = ['overview', 'members', 'events', 'product-ideas', 'reasoning', 'agent', 'import', 'settings'];

  function navigateToHash() {
    var hash = (location.hash || '#overview').slice(1);
    if (sections.indexOf(hash) === -1) hash = 'overview';
    loadSection(hash);
  }

  window.addEventListener('hashchange', navigateToHash);

  $$('.nav-link').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      location.hash = '#' + link.dataset.section;
    });
  });

  function setActiveNav(section) {
    $$('.nav-link').forEach(function (l) { l.classList.remove('active'); });
    var link = $('[data-section="' + section + '"]');
    if (link) link.classList.add('active');
  }

  // ── Section loader ──
  var currentSection = null;
  var sseSource = null;

  function loadSection(section) {
    if (sseSource && currentSection === 'reasoning' && section !== 'reasoning') {
      sseSource.close();
      sseSource = null;
    }
    currentSection = section;
    setActiveNav(section);
    var main = $('#main-content');

    // Remove dark background from main when leaving reasoning
    if (section === 'reasoning') {
      main.style.background = '#0d1117';
      main.style.padding = '1.5rem';
    } else {
      main.style.background = '';
      main.style.padding = '';
    }

    var loaders = {
      overview: loadOverview,
      members: loadMembers,
      events: loadEvents,
      'product-ideas': loadProductIdeas,
      reasoning: loadReasoning,
      agent: loadAgent,
      import: loadImport,
      settings: loadSettings,
    };

    main.innerHTML = '<div style="padding:2rem;text-align:center"><span class="spinner"></span></div>';
    loaders[section](main);
  }

  // ── Overview ──
  function loadOverview(el) {
    apiJSON('/overview').then(function (data) {
      el.innerHTML =
        '<h1 class="section-title">Overview</h1>' +
        '<div class="stats-grid">' +
          statCard('Members', data.members) +
          statCard('Total Events', data.events) +
          statCard('Upcoming', data.upcomingEvents) +
          statCard('Avg Rating', data.avgRating || '--') +
        '</div>' +
        '<div class="card">' +
          '<h3>Quick Actions</h3>' +
          '<p>Use the sidebar to manage members, review event drafts, or watch the reasoning terminal.</p>' +
        '</div>';
    }).catch(function () {
      el.innerHTML = '<div class="empty-state"><p>Failed to load overview data.</p></div>';
    });
  }

  function statCard(label, value) {
    return '<div class="stat-card"><div class="label">' + esc(label) + '</div><div class="value">' + esc(String(value)) + '</div></div>';
  }

  // ── Members ──
  function loadMembers(el) {
    apiJSON('/members').then(function (members) {
      var html = '<h1 class="section-title">Members</h1>' +
        '<input class="search-bar" id="member-search" placeholder="Search members...">';
      if (members.length === 0) {
        html += '<div class="empty-state"><p>No members yet.</p></div>';
      } else {
        html += '<div id="member-list">' + renderMemberList(members) + '</div>';
      }
      el.innerHTML = html;
      setupMemberMemoryViewer(el);

      var search = $('#member-search');
      if (search) {
        search.addEventListener('input', function () {
          var q = search.value.toLowerCase();
          var filtered = members.filter(function (m) {
            return (m.name || '').toLowerCase().indexOf(q) !== -1 ||
                   (m.preferredName || '').toLowerCase().indexOf(q) !== -1 ||
                   (m.profile || '').toLowerCase().indexOf(q) !== -1;
          });
          $('#member-list').innerHTML = renderMemberList(filtered);
        });
      }
    }).catch(function () {
      el.innerHTML = '<div class="empty-state"><p>Failed to load members.</p></div>';
    });
  }

  function renderMemberList(members) {
    if (members.length === 0) return '<div class="empty-state"><p>No matching members.</p></div>';
    return members.map(function (m) {
      var initials = (m.name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var statusClass = m.status === 'active' ? 'active' : 'inactive';
      return '<div class="card member-card member-accordion" data-member-id="' + esc(m.id) + '">' +
        '<button class="member-accordion-toggle" type="button" data-member-toggle="' + esc(m.id) + '" aria-expanded="false">' +
          '<span class="member-avatar">' + esc(initials) + '</span>' +
          '<span class="member-info">' +
            '<span class="member-title-row">' + esc(m.name) + (m.preferredName ? ' (' + esc(m.preferredName) + ')' : '') +
              ' <span class="member-status ' + statusClass + '">' + esc(m.status) + '</span></span>' +
            '<span class="member-preview">' + esc(memberPreview(m.profile)) + '</span>' +
          '</span>' +
          '<span class="member-accordion-icon" aria-hidden="true">+</span>' +
        '</button>' +
        '<div class="member-accordion-panel hidden" data-member-panel="' + esc(m.id) + '">' +
          '<div class="profile-summary">' + esc(m.profile || 'No profile data yet.') + '</div>' +
          '<div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">' +
            '<button class="secondary-btn member-memory-btn" data-user-id="' + esc(m.id) + '">View memory.md</button>' +
            (m.memoryFilePath ? '<span class="meta">' + esc(m.memoryFilePath) + '</span>' : '') +
          '</div>' +
          '<div class="member-memory-panel hidden" data-user-memory="' + esc(m.id) + '" style="margin-top:0.75rem">' +
            '<div class="notes">Loading generated memory file...</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function setupMemberMemoryViewer(el) {
    var list = $('#member-list', el);
    if (!list) return;

    list.addEventListener('click', function (event) {
      var toggle = event.target.closest('.member-accordion-toggle');
      if (toggle) {
        var userIdForToggle = toggle.getAttribute('data-member-toggle');
        var accordion = toggle.closest('.member-accordion');
        var memberPanel = $('[data-member-panel="' + userIdForToggle + '"]', list);
        if (!accordion || !memberPanel) return;

        var expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        memberPanel.classList.toggle('hidden', expanded);
        accordion.classList.toggle('is-open', !expanded);
        return;
      }

      var button = event.target.closest('.member-memory-btn');
      if (!button) return;

      var userId = button.getAttribute('data-user-id');
      var panel = $('[data-user-memory="' + userId + '"]', list);
      if (!panel) return;

      if (!panel.classList.contains('hidden') && panel.getAttribute('data-loaded') === 'true') {
        panel.classList.add('hidden');
        button.textContent = 'View memory.md';
        return;
      }

      panel.classList.remove('hidden');
      button.textContent = 'Hide memory.md';

      if (panel.getAttribute('data-loaded') === 'true') return;

      panel.innerHTML = '<div class="notes">Loading generated memory file...</div>';
      apiJSON('/members/' + encodeURIComponent(userId) + '/memory').then(function (data) {
        panel.setAttribute('data-loaded', 'true');
        panel.innerHTML =
          '<div class="notes">Generated file: ' + esc(data.path || '') + '</div>' +
          '<pre style="margin-top:0.5rem;white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:12px;overflow:auto">' + esc(data.content || '') + '</pre>';
      }).catch(function () {
        panel.innerHTML = '<div class="empty-state"><p>Failed to load member memory.</p></div>';
      });
    });
  }

  // ── Events ──
  function loadEvents(el) {
    Promise.all([apiJSON('/events/proposals'), apiJSON('/events/drafts'), apiJSON('/events')]).then(function (results) {
      var proposals = results[0];
      var drafts = results[1];
      var allEvents = results[2];
      var upcoming = allEvents.filter(function (e) { return e.status === 'approved' || e.status === 'confirmed'; });
      var past = allEvents.filter(function (e) { return e.status === 'completed'; });

      el.innerHTML =
        '<h1 class="section-title">Events</h1>' +
        '<div class="tabs">' +
          '<button class="tab-btn active" data-tab="proposals">Proposals (' + proposals.length + ')</button>' +
          '<button class="tab-btn" data-tab="drafts">Drafts (' + drafts.length + ')</button>' +
          '<button class="tab-btn" data-tab="upcoming">Upcoming (' + upcoming.length + ')</button>' +
          '<button class="tab-btn" data-tab="past">Past (' + past.length + ')</button>' +
        '</div>' +
        '<div id="tab-proposals" class="tab-pane active">' + renderProposals(proposals) + '</div>' +
        '<div id="tab-drafts" class="tab-pane">' + renderDrafts(drafts) + '</div>' +
        '<div id="tab-upcoming" class="tab-pane">' + renderEventList(upcoming, 'No upcoming events.') + '</div>' +
        '<div id="tab-past" class="tab-pane">' + renderEventList(past, 'No past events.') + '</div>';

      setupTabs(el);
      setupDraftActions(el);
    }).catch(function () {
      el.innerHTML = '<div class="empty-state"><p>Failed to load events.</p></div>';
    });
  }

  function renderProposals(proposals) {
    if (proposals.length === 0) return '<div class="empty-state"><p>No community ideas being explored right now.</p></div>';
    return proposals.map(function (p) {
      return '<div class="card draft-card" data-id="' + esc(p.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div><h3>' + esc(p.title) + '</h3>' +
            '<div class="meta">proposed &middot; ' + esc(p.type) + ' &middot; ' + esc(p.date || 'TBD') + (p.location ? ' &middot; ' + esc(p.location) : '') + '</div>' +
          '</div>' +
          '<div class="score">?</div>' +
        '</div>' +
        (p.description ? '<p style="margin-top:0.5rem;font-size:0.9rem">' + esc(p.description) + '</p>' : '<p style="margin-top:0.5rem;font-size:0.9rem">Still collecting details from the community.</p>') +
        (p.maxCapacity ? '<div class="notes">Capacidad conversada: ' + esc(String(p.maxCapacity)) + '</div>' : '') +
        (p.agentNotes ? '<div class="notes">' + esc(p.agentNotes) + '</div>' : '') +
      '</div>';
    }).join('');
  }

  function renderDrafts(drafts) {
    if (drafts.length === 0) return '<div class="empty-state"><p>No drafts awaiting approval.</p></div>';
    return drafts.map(function (d) {
      return '<div class="card draft-card" data-id="' + esc(d.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div><h3>' + esc(d.title) + '</h3>' +
            '<div class="meta">' + esc(d.type) + ' &middot; ' + esc(d.date) + (d.location ? ' &middot; ' + esc(d.location) : '') + '</div>' +
          '</div>' +
          '<div class="score">' + (d.score != null ? d.score.toFixed(1) : '--') + '</div>' +
        '</div>' +
        (d.description ? '<p style="margin-top:0.5rem;font-size:0.9rem">' + esc(d.description) + '</p>' : '') +
        (d.agentNotes ? '<div class="notes">' + esc(d.agentNotes) + '</div>' : '') +
        (d.scoreBreakdown ? '<div class="notes">' + esc(typeof d.scoreBreakdown === 'string' ? d.scoreBreakdown : JSON.stringify(d.scoreBreakdown, null, 2)) + '</div>' : '') +
        '<div class="draft-actions">' +
          '<button class="btn btn-primary approve-btn" data-id="' + esc(d.id) + '">Approve</button>' +
          '<button class="btn btn-danger reject-btn" data-id="' + esc(d.id) + '">Reject</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderEventList(events, emptyMsg) {
    if (events.length === 0) return '<div class="empty-state"><p>' + esc(emptyMsg) + '</p></div>';
    return events.map(function (e) {
      return '<div class="card">' +
        '<h3>' + esc(e.title) + '</h3>' +
        '<p>' + esc(e.type) + ' &middot; ' + esc(e.date) + (e.location ? ' &middot; ' + esc(e.location) : '') +
        ' &middot; <strong>' + esc(e.status) + '</strong></p>' +
        (e.description ? '<p style="margin-top:0.35rem">' + esc(e.description) + '</p>' : '') +
      '</div>';
    }).join('');
  }

  function setupTabs(container) {
    $$('.tab-btn', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.tab-btn', container).forEach(function (b) { b.classList.remove('active'); });
        $$('.tab-pane', container).forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        $('#tab-' + btn.dataset.tab, container).classList.add('active');
      });
    });
  }

  function setupDraftActions(container) {
    container.addEventListener('click', function (e) {
      var btn = e.target;
      if (btn.classList.contains('approve-btn')) {
        var id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = 'Approving...';
        apiFetch('/events/' + id + '/approve', { method: 'POST' }).then(function () {
          var card = btn.closest('.draft-card');
          card.style.opacity = '0.5';
          card.innerHTML += '<p style="color:var(--success);font-weight:600;margin-top:0.5rem">Approved</p>';
        });
      }
      if (btn.classList.contains('reject-btn')) {
        var id2 = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = 'Rejecting...';
        apiFetch('/events/' + id2 + '/reject', { method: 'POST' }).then(function () {
          var card = btn.closest('.draft-card');
          card.style.opacity = '0.5';
          card.innerHTML += '<p style="color:var(--danger);font-weight:600;margin-top:0.5rem">Rejected</p>';
        });
      }
    });
  }

  // ── Product Ideas ──
  function loadProductIdeas(el) {
    el.innerHTML =
      '<h1 class="section-title">Product Ideas</h1>' +
      '<div id="product-ideas-root"><div style="padding:2rem;text-align:center"><span class="spinner"></span></div></div>';

    apiJSON('/product-ideas').then(function (state) {
      var summary = state.importSummary || { imports: 0, totalMessages: 0, totalMembers: 0 };
      var html =
        '<div class="card" style="margin-bottom:1rem">' +
          '<div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap">' +
            '<div>' +
              '<h2 style="font-size:1.05rem;margin-bottom:0.45rem">What the community might want built next</h2>' +
              '<p style="color:var(--text-muted);max-width:62ch">This stream turns imported community signals into software ideas worth exploring. New work is seeded after import and one additional product suggestion is proposed every day.</p>' +
            '</div>' +
            '<div class="notes" style="min-width:220px">' +
              '<strong>' + esc(String(summary.totalMembers || 0)) + '</strong> members · ' +
              '<strong>' + esc(String(summary.totalMessages || 0)) + '</strong> imported messages' +
            '</div>' +
          '</div>' +
        '</div>';

      if (!state.hasImportedContext) {
        html +=
          '<div class="empty-state">' +
            '<p>Import a Telegram, WhatsApp, CSV, or text export first. Once Comunia has real member signals, it will seed three product ideas here.</p>' +
          '</div>';
        $('#product-ideas-root').innerHTML = html;
        return;
      }

      if (!state.ideas || !state.ideas.length) {
        html += '<div class="empty-state"><p>No product ideas yet. Try this section again in a moment after your import finishes.</p></div>';
        $('#product-ideas-root').innerHTML = html;
        return;
      }

      html += '<div class="product-idea-grid">' + state.ideas.map(function (idea) {
        return renderProductIdeaCard(idea, state.daioUrl || 'https://daio.md/');
      }).join('') + '</div>';

      $('#product-ideas-root').innerHTML = html;
      setupProductIdeaActions($('#product-ideas-root'));
    }).catch(function () {
      $('#product-ideas-root').innerHTML = '<div class="empty-state"><p>Failed to load product ideas.</p></div>';
    });
  }

  function renderProductIdeaCard(idea, daioUrl) {
    return '<div class="card product-idea-card" data-product-idea="' + esc(idea.id) + '">' +
      '<div class="product-idea-head">' +
        '<div>' +
          '<div class="product-idea-kicker">' + esc(idea.source === 'seed' ? 'starter idea' : 'daily product signal') + '</div>' +
          '<h3>' + esc(idea.title) + '</h3>' +
        '</div>' +
        '<div class="meta">' + esc(formatRelativeDate(idea.createdAt)) + '</div>' +
      '</div>' +
      '<p class="product-idea-summary">' + esc(idea.summary || '') + '</p>' +
      (idea.targetMembers ? '<div class="notes"><strong>Best for:</strong> ' + esc(idea.targetMembers) + '</div>' : '') +
      (idea.rationale ? '<div class="notes"><strong>Why now:</strong> ' + esc(idea.rationale) + '</div>' : '') +
      '<div class="product-idea-actions">' +
        '<button class="btn btn-primary product-build-btn" data-idea-id="' + esc(idea.id) + '">Let&apos;s build this</button>' +
        '<a class="btn btn-outline" href="' + esc(daioUrl) + '" target="_blank" rel="noreferrer">Build it for me</a>' +
      '</div>' +
      '<div class="product-daio-note">Powered by <a href="' + esc(daioUrl) + '" target="_blank" rel="noreferrer">daio</a></div>' +
      '<div class="product-prompt-panel hidden" data-product-prompt="' + esc(idea.id) + '">' +
        '<div class="notes" style="margin-bottom:0.6rem">Copy this prompt into your local coding setup to get an MVP moving quickly.</div>' +
        '<pre class="product-prompt-pre">' + esc(idea.buildPrompt || '') + '</pre>' +
        '<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-top:0.75rem">' +
          '<button class="secondary-btn product-copy-btn" data-copy-id="' + esc(idea.id) + '">Copy prompt</button>' +
          '<span class="save-msg" data-copy-msg="' + esc(idea.id) + '"></span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function setupProductIdeaActions(container) {
    container.addEventListener('click', function (event) {
      var buildButton = event.target.closest('.product-build-btn');
      if (buildButton) {
        var ideaId = buildButton.getAttribute('data-idea-id');
        var panel = $('[data-product-prompt="' + ideaId + '"]', container);
        if (!panel) return;
        var isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        buildButton.textContent = isHidden ? 'Hide build prompt' : 'Let\'s build this';
        return;
      }

      var copyButton = event.target.closest('.product-copy-btn');
      if (!copyButton) return;

      var copyId = copyButton.getAttribute('data-copy-id');
      var promptPanel = $('[data-product-prompt="' + copyId + '"]', container);
      var message = $('[data-copy-msg="' + copyId + '"]', container);
      if (!promptPanel) return;

      var pre = $('.product-prompt-pre', promptPanel);
      var text = pre ? pre.textContent || '' : '';
      if (!text) return;

      navigator.clipboard.writeText(text).then(function () {
        if (message) {
          message.textContent = 'Copied';
          setTimeout(function () { message.textContent = ''; }, 1800);
        }
      }).catch(function () {
        if (message) message.textContent = 'Copy failed';
      });
    });
  }

  // ── Reasoning Terminal ──
  function loadReasoning(el) {
    el.innerHTML =
      '<div class="reasoning-section">' +
        '<h1 class="section-title">Reasoning Terminal</h1>' +
        '<div class="terminal-output" id="terminal-output"></div>' +
        '<div id="reasoning-answer-box"></div>' +
        '<div class="reasoning-input">' +
          '<input type="text" id="reasoning-q" placeholder="Ask the agent a question...">' +
          '<button id="reasoning-ask-btn">Ask</button>' +
        '</div>' +
      '</div>';

    connectSSE();
    setupReasoningInput();
  }

  function connectSSE() {
    if (sseSource) sseSource.close();
    var url = '/api/reasoning/stream';
    // EventSource does not support custom headers, so pass token as query param
    sseSource = new EventSource(url + '?token=' + encodeURIComponent(getToken()));

    sseSource.onmessage = function (e) {
      try {
        var data = JSON.parse(e.data);
        appendTerminalLine(data);
      } catch (_) { /* ignore bad data */ }
    };

    sseSource.onerror = function () {
      appendTerminalLineRaw('<span style="color:#ff7b72">[connection lost — retrying...]</span>');
    };
  }

  function appendTerminalLine(evt) {
    var out = $('#terminal-output');
    if (!out) return;
    var ts = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : '';
    var lvlClass = 'lvl-' + (evt.level || 'detail');
    var line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML =
      '<span class="ts">' + esc(ts) + '</span>' +
      '<span class="job">[' + esc(evt.jobName || '?') + ']</span> ' +
      '<span class="' + lvlClass + '">' + esc(evt.level || '') + '</span> ' +
      '<span class="msg">' + esc(evt.message || '') + '</span>';
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function appendTerminalLineRaw(html) {
    var out = $('#terminal-output');
    if (!out) return;
    var line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = html;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function setupReasoningInput() {
    var input = $('#reasoning-q');
    var btn = $('#reasoning-ask-btn');
    if (!input || !btn) return;

    function ask() {
      var q = input.value.trim();
      if (!q) return;
      btn.disabled = true;
      btn.textContent = 'Thinking...';
      input.value = '';

      apiFetch('/reasoning/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var box = $('#reasoning-answer-box');
          box.innerHTML =
            '<div class="reasoning-answer">' +
              '<div class="answer-label">Agent answer:</div>' +
              esc(data.answer || data.error || 'No response.') +
            '</div>';
        })
        .catch(function () {
          $('#reasoning-answer-box').innerHTML =
            '<div class="reasoning-answer"><div class="answer-label">Error</div>Failed to get a response.</div>';
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Ask';
        });
    }

    btn.addEventListener('click', ask);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') ask();
    });
  }

  // ── Agent ──
  function loadAgent(el) {
    el.innerHTML =
      '<h1 class="section-title">Agent Configuration</h1>' +
      '<div id="agent-editors"><div style="text-align:center"><span class="spinner"></span></div></div>';

    Promise.all([
      apiJSON('/agent/soul'),
      apiJSON('/agent/memory'),
      apiJSON('/agent/agent'),
    ]).then(function (results) {
      var container = $('#agent-editors');
      container.innerHTML =
        agentEditorBlock('soul', 'soul.md', results[0].content || '') +
        agentEditorBlock('memory', 'memory.md', results[1].content || '') +
        agentEditorBlock('agent', 'agent.md', results[2].content || '');

      setupAgentSave('soul', '/agent/soul');
      setupAgentSave('memory', '/agent/memory');
      setupAgentSave('agent', '/agent/agent');
    }).catch(function () {
      el.innerHTML = '<div class="empty-state"><p>Failed to load agent files.</p></div>';
    });
  }

  function agentEditorBlock(id, label, content) {
    return '<div class="agent-editor">' +
      '<label>' + esc(label) + '</label>' +
      '<textarea id="editor-' + id + '">' + esc(content) + '</textarea>' +
      '<div class="save-row">' +
        '<button class="btn btn-primary" id="save-' + id + '">Save</button>' +
        '<span class="save-msg" id="msg-' + id + '"></span>' +
      '</div>' +
    '</div>';
  }

  function setupAgentSave(id, path) {
    var btn = $('#save-' + id);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var content = $('#editor-' + id).value;
      btn.disabled = true;
      btn.textContent = 'Saving...';
      apiFetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content }),
      }).then(function (r) {
        if (r.ok) {
          $('#msg-' + id).textContent = 'Saved';
          setTimeout(function () { $('#msg-' + id).textContent = ''; }, 2000);
        } else {
          $('#msg-' + id).textContent = 'Save failed';
        }
      }).catch(function () {
        $('#msg-' + id).textContent = 'Save failed';
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = 'Save';
      });
    });
  }

  // ── Import ──
  var importHistoryPollTimer = null;

  function loadImport(el) {
    el.innerHTML =
      '<h1 class="section-title">Import</h1>' +
      '<div class="drop-zone" id="drop-zone">' +
        '<p>Drag & drop a file here, or click to select</p>' +
        '<input type="file" id="file-input">' +
      '</div>' +
      '<p class="notes" style="margin-top:0.75rem">Supported files: Telegram export <code>.json</code>, WhatsApp export <code>.txt</code>, <code>.csv</code>, <code>.txt</code>, and <code>.md</code>.</p>' +
      '<div id="upload-status"></div>' +
      '<h2 style="font-size:1.1rem;margin:1.5rem 0 0.75rem">Import History</h2>' +
      '<div id="import-history"><span class="spinner"></span></div>';

    setupDropZone();
    loadImportHistory();
  }

  function setupDropZone() {
    var zone = $('#drop-zone');
    var input = $('#file-input');

    zone.addEventListener('click', function () { input.click(); });

    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () {
      if (input.files.length) uploadFile(input.files[0]);
    });
  }

  function uploadFile(file) {
    var status = $('#upload-status');
    status.innerHTML = '<p>Uploading <strong>' + esc(file.name) + '</strong>...</p>';

    var form = new FormData();
    form.append('file', file);

    apiFetch('/import/upload', { method: 'POST', body: form })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          status.innerHTML = '<p style="color:var(--success)">Uploaded ' + esc(data.filename) + '. Analysis queued.</p>';
          loadImportHistory(true);
        } else {
          status.innerHTML = '<p style="color:var(--danger)">Upload failed: ' + esc(data.error || 'Unknown error') + '</p>';
        }
      })
      .catch(function () {
        status.innerHTML = '<p style="color:var(--danger)">Upload failed.</p>';
      });
  }

  function loadImportHistory(shouldPoll) {
    apiJSON('/import/history').then(function (logs) {
      var container = $('#import-history');
      if (!logs.length) {
        container.innerHTML = '<div class="empty-state"><p>No imports yet.</p></div>';
        return;
      }
      var html = '<table class="import-table"><thead><tr>' +
        '<th>File</th><th>Status</th><th>Type</th><th>Messages</th><th>Members</th><th>Entries</th><th>Updated</th><th>Details</th>' +
        '</tr></thead><tbody>';
      logs.forEach(function (l) {
        var statusClass = l.status === 'completed' ? 'color:var(--success)' :
          l.status === 'failed' ? 'color:var(--danger)' : 'color:var(--warning)';
        var details = l.error || '';
        if (!details) {
          if (l.status === 'processing' && (l.membersProcessed || 0) > 0) {
            details = 'Members imported. Deep profile analysis still running...';
          } else if (l.status === 'processing') {
            details = 'Analyzing file...';
          } else if (l.status === 'uploaded') {
            details = 'Waiting for importer...';
          }
        }
        html += '<tr>' +
          '<td>' + esc(l.sourceFile) + '</td>' +
          '<td><strong style="' + statusClass + '">' + esc(l.status || 'completed') + '</strong></td>' +
          '<td>' + esc(l.type) + '</td>' +
          '<td>' + (l.messagesProcessed || 0) + '</td>' +
          '<td>' + (l.membersProcessed || 0) + '</td>' +
          '<td>' + (l.entriesExtracted || 0) + '</td>' +
          '<td>' + esc(l.updatedAt || l.importedAt || '') + '</td>' +
          '<td>' + esc(details) + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;

      var hasPending = logs.some(function (l) {
        return l.status === 'uploaded' || l.status === 'processing';
      });
      if (importHistoryPollTimer) {
        clearTimeout(importHistoryPollTimer);
        importHistoryPollTimer = null;
      }
      if (shouldPoll || hasPending) {
        importHistoryPollTimer = setTimeout(function () {
          loadImportHistory(true);
        }, 3000);
      }
    }).catch(function () {
      $('#import-history').innerHTML = '<div class="empty-state"><p>Failed to load history.</p></div>';
    });
  }

  // ── Settings ──
  function loadSettings(el) {
    el.innerHTML =
      '<h1 class="section-title">Settings</h1>' +
      '<div class="card" style="margin-bottom:1rem">' +
        '<h2 style="font-size:1.05rem;margin-bottom:0.75rem">Public Community Portal</h2>' +
        '<p style="color:var(--text-muted);margin-bottom:1rem">Share this portal with the community. Members use the passcode below to access events, members, and the AI idea stream.</p>' +
        '<div style="display:grid;gap:0.75rem">' +
          '<label>Public URL<br><input id="public-url" disabled style="width:100%;margin-top:0.35rem" value="' + esc(window.location.origin + '/community') + '"></label>' +
          '<label>Passcode<br><input id="public-passcode" type="text" style="width:100%;margin-top:0.35rem" placeholder="Community passcode"></label>' +
          '<label>Bot URL<br><input id="public-bot-url" type="text" style="width:100%;margin-top:0.35rem" placeholder="https://t.me/your_bot"></label>' +
          '<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">' +
            '<button class="btn btn-primary" id="save-public-settings">Save public portal settings</button>' +
            '<span id="public-settings-msg" class="save-msg"></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="margin-bottom:1rem">' +
        '<h2 style="font-size:1.05rem;margin-bottom:0.75rem">Group Chat Behavior</h2>' +
        '<p style="color:var(--text-muted);margin-bottom:1rem">By default, Comunia should stay quiet in community groups and only respond when an admin explicitly calls on it. Conversations should happen 1:1 unless you change that here.</p>' +
        '<div style="display:grid;gap:0.75rem">' +
          '<label>Group response mode<br>' +
            '<select id="group-response-mode" style="width:100%;margin-top:0.35rem">' +
              '<option value="announcements_only">Announcements only</option>' +
              '<option value="admin_only">Admin only</option>' +
              '<option value="open">Open</option>' +
            '</select>' +
          '</label>' +
          '<label style="display:flex;gap:0.6rem;align-items:flex-start">' +
            '<input id="allow-telegram-topic-creation" type="checkbox" style="width:auto;margin-top:0.2rem">' +
            '<span><strong>Allow Telegram topic creation</strong><br><span style="color:var(--text-muted)">If the bot is an admin in a Telegram forum group, it can create new topics when explicitly asked.</span></span>' +
          '</label>' +
          '<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">' +
            '<button class="btn btn-primary" id="save-group-settings">Save group behavior</button>' +
            '<span id="group-settings-msg" class="save-msg"></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card" id="cloud-credentials-card" style="margin-bottom:1rem;display:none">' +
        '<h2 style="font-size:1.05rem;margin-bottom:0.75rem">Comunia Cloud Publish Tokens</h2>' +
        '<p style="color:var(--text-muted);margin-bottom:1rem">Create one token per community slug on the central cloud server. Give each community only its own token.</p>' +
        '<div style="display:grid;gap:0.75rem;margin-bottom:1rem">' +
          '<label>Community slug<br><input id="cloud-credential-slug" type="text" style="width:100%;margin-top:0.35rem" placeholder="founders-ba"></label>' +
          '<label>Community name (optional)<br><input id="cloud-credential-name" type="text" style="width:100%;margin-top:0.35rem" placeholder="Founders BA"></label>' +
          '<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">' +
            '<button class="btn btn-primary" id="issue-cloud-credential">Create token</button>' +
            '<span id="cloud-credential-msg" class="save-msg"></span>' +
          '</div>' +
          '<div id="cloud-issued-token" class="notes hidden"></div>' +
        '</div>' +
        '<div id="cloud-credentials-list"><span class="spinner"></span></div>' +
      '</div>' +
      '<h2 style="font-size:1.05rem;margin-bottom:0.75rem">Health Status</h2>' +
      '<div id="health-grid" class="health-grid"><span class="spinner"></span></div>';

    apiJSON('/community/public-settings').then(function (settings) {
      $('#public-passcode').value = settings.passcode || '';
      $('#public-bot-url').value = settings.botUrl || '';
    }).catch(function () {
      $('#public-settings-msg').textContent = 'Failed to load public portal settings';
    });

    apiJSON('/community/interaction-settings').then(function (settings) {
      $('#group-response-mode').value = settings.responseMode || 'admin_only';
      $('#allow-telegram-topic-creation').checked = settings.allowTelegramTopicCreation === true;
    }).catch(function () {
      $('#group-settings-msg').textContent = 'Failed to load group settings';
    });

    var saveBtn = $('#save-public-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        apiFetch('/community/public-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passcode: $('#public-passcode').value.trim(),
            botUrl: $('#public-bot-url').value.trim(),
          }),
        })
          .then(function (r) {
            return r.text().then(function (text) {
              var data = text ? safeJSONParse(text) : {};
              if (!r.ok) {
                throw new Error((data && data.error) || ('Request failed (' + r.status + ')'));
              }
              return data;
            });
          })
          .then(function (data) {
            $('#public-passcode').value = data.passcode || '';
            $('#public-bot-url').value = data.botUrl || '';
            $('#public-settings-msg').textContent = 'Saved';
            setTimeout(function () { $('#public-settings-msg').textContent = ''; }, 2000);
          })
          .catch(function (error) {
            $('#public-settings-msg').textContent = error && error.message ? error.message : 'Save failed';
          })
          .finally(function () {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save public portal settings';
          });
      });
    }

    var groupSaveBtn = $('#save-group-settings');
    if (groupSaveBtn) {
      groupSaveBtn.addEventListener('click', function () {
        groupSaveBtn.disabled = true;
        groupSaveBtn.textContent = 'Saving...';
        apiFetch('/community/interaction-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            responseMode: $('#group-response-mode').value,
            allowTelegramTopicCreation: $('#allow-telegram-topic-creation').checked,
          }),
        })
          .then(function (r) {
            return r.text().then(function (text) {
              var data = text ? safeJSONParse(text) : {};
              if (!r.ok) {
                throw new Error((data && data.error) || ('Request failed (' + r.status + ')'));
              }
              return data;
            });
          })
          .then(function (data) {
            $('#group-response-mode').value = data.responseMode || 'admin_only';
            $('#allow-telegram-topic-creation').checked = data.allowTelegramTopicCreation === true;
            $('#group-settings-msg').textContent = 'Saved';
            setTimeout(function () { $('#group-settings-msg').textContent = ''; }, 2000);
          })
          .catch(function (error) {
            $('#group-settings-msg').textContent = error && error.message ? error.message : 'Save failed';
          })
          .finally(function () {
            groupSaveBtn.disabled = false;
            groupSaveBtn.textContent = 'Save group behavior';
          });
      });
    }

    apiJSON('/cloud/status').then(function (status) {
      if (!status.serverEnabled) return;
      $('#cloud-credentials-card').style.display = '';
      loadCloudCredentials();

      var issueBtn = $('#issue-cloud-credential');
      issueBtn.addEventListener('click', function () {
        var slug = ($('#cloud-credential-slug').value || '').trim();
        var communityName = ($('#cloud-credential-name').value || '').trim();
        if (!slug) {
          $('#cloud-credential-msg').textContent = 'Slug is required';
          return;
        }

        issueBtn.disabled = true;
        issueBtn.textContent = 'Creating...';
        apiFetch('/cloud/publish-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: slug, communityName: communityName }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            $('#cloud-credential-msg').textContent = 'Token created';
            $('#cloud-issued-token').classList.remove('hidden');
            $('#cloud-issued-token').innerHTML =
              'Share this once with the community and store it in their <code>COMUNIA_CLOUD_TOKEN</code>:<br><pre style="margin-top:0.5rem;white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:12px;overflow:auto">' + esc(data.token || '') + '</pre>';
            loadCloudCredentials();
          })
          .catch(function () {
            $('#cloud-credential-msg').textContent = 'Create failed';
          })
          .finally(function () {
            issueBtn.disabled = false;
            issueBtn.textContent = 'Create token';
            setTimeout(function () { $('#cloud-credential-msg').textContent = ''; }, 2500);
          });
      });
    }).catch(function () {});

    apiJSON('/health').then(function (data) {
      var container = $('#health-grid');
      var keys = Object.keys(data);
      if (keys.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No services registered yet.</p></div>';
        return;
      }
      container.innerHTML = keys.map(function (key) {
        var svc = data[key];
        return '<div class="health-item">' +
          '<span class="health-dot ' + esc(svc.status) + '"></span>' +
          '<span class="health-name">' + esc(svc.name) + '</span>' +
          '<span class="health-since">' + (svc.error ? esc(svc.error) : 'since ' + esc(svc.since || '')) + '</span>' +
        '</div>';
      }).join('');
    }).catch(function () {
      $('#health-grid').innerHTML = '<div class="empty-state"><p>Failed to load health status.</p></div>';
    });
  }

  function loadCloudCredentials() {
    apiJSON('/cloud/publish-credentials').then(function (rows) {
      var container = $('#cloud-credentials-list');
      if (!rows.length) {
        container.innerHTML = '<div class="empty-state"><p>No cloud publish tokens provisioned yet.</p></div>';
        return;
      }

      container.innerHTML =
        '<table class="data-table"><thead><tr><th>Slug</th><th>Community</th><th>Token</th><th>Updated</th></tr></thead><tbody>' +
        rows.map(function (row) {
          return '<tr>' +
            '<td><code>' + esc(row.slug || '') + '</code></td>' +
            '<td>' + esc(row.communityName || '') + '</td>' +
            '<td><code>' + esc(row.tokenPreview || '') + '</code></td>' +
            '<td>' + esc(row.updatedAt || '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }).catch(function () {
      $('#cloud-credentials-list').innerHTML = '<div class="empty-state"><p>Failed to load cloud publish tokens.</p></div>';
    });
  }

  // ── Utilities ──
  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function safeJSONParse(str) {
    try {
      return JSON.parse(str);
    } catch (_error) {
      return {};
    }
  }

  function formatRelativeDate(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  }

  function memberPreview(profile) {
    var text = String(profile || 'No profile data yet.').replace(/\s+/g, ' ').trim();
    if (text.length <= 96) return text;
    return text.slice(0, 93) + '...';
  }

  // ── Init ──
  boot();
})();
