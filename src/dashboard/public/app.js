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
  const sections = ['overview', 'members', 'events', 'reasoning', 'agent', 'import', 'settings'];

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
      return '<div class="card member-card">' +
        '<div class="member-avatar">' + esc(initials) + '</div>' +
        '<div class="member-info">' +
          '<h3>' + esc(m.name) + (m.preferredName ? ' (' + esc(m.preferredName) + ')' : '') +
            ' <span class="member-status ' + statusClass + '">' + esc(m.status) + '</span></h3>' +
          '<div class="profile-summary">' + esc(m.profile || 'No profile data yet.') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Events ──
  function loadEvents(el) {
    Promise.all([apiJSON('/events/drafts'), apiJSON('/events')]).then(function (results) {
      var drafts = results[0];
      var allEvents = results[1];
      var upcoming = allEvents.filter(function (e) { return e.status === 'approved' || e.status === 'confirmed'; });
      var past = allEvents.filter(function (e) { return e.status === 'completed'; });

      el.innerHTML =
        '<h1 class="section-title">Events</h1>' +
        '<div class="tabs">' +
          '<button class="tab-btn active" data-tab="drafts">Drafts (' + drafts.length + ')</button>' +
          '<button class="tab-btn" data-tab="upcoming">Upcoming (' + upcoming.length + ')</button>' +
          '<button class="tab-btn" data-tab="past">Past (' + past.length + ')</button>' +
        '</div>' +
        '<div id="tab-drafts" class="tab-pane active">' + renderDrafts(drafts) + '</div>' +
        '<div id="tab-upcoming" class="tab-pane">' + renderEventList(upcoming, 'No upcoming events.') + '</div>' +
        '<div id="tab-past" class="tab-pane">' + renderEventList(past, 'No past events.') + '</div>';

      setupTabs(el);
      setupDraftActions(el);
    }).catch(function () {
      el.innerHTML = '<div class="empty-state"><p>Failed to load events.</p></div>';
    });
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
      // agent.md is read-only from API (no PUT endpoint), so we still show it
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
  function loadImport(el) {
    el.innerHTML =
      '<h1 class="section-title">Import</h1>' +
      '<div class="drop-zone" id="drop-zone">' +
        '<p>Drag & drop a file here, or click to select</p>' +
        '<input type="file" id="file-input">' +
      '</div>' +
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
          status.innerHTML = '<p style="color:var(--success)">Uploaded ' + esc(data.filename) + ' successfully.</p>';
          loadImportHistory();
        } else {
          status.innerHTML = '<p style="color:var(--danger)">Upload failed: ' + esc(data.error || 'Unknown error') + '</p>';
        }
      })
      .catch(function () {
        status.innerHTML = '<p style="color:var(--danger)">Upload failed.</p>';
      });
  }

  function loadImportHistory() {
    apiJSON('/import/history').then(function (logs) {
      var container = $('#import-history');
      if (!logs.length) {
        container.innerHTML = '<div class="empty-state"><p>No imports yet.</p></div>';
        return;
      }
      var html = '<table class="import-table"><thead><tr>' +
        '<th>File</th><th>Type</th><th>Messages</th><th>Members</th><th>Entries</th><th>Date</th>' +
        '</tr></thead><tbody>';
      logs.forEach(function (l) {
        html += '<tr>' +
          '<td>' + esc(l.sourceFile) + '</td>' +
          '<td>' + esc(l.type) + '</td>' +
          '<td>' + (l.messagesProcessed || 0) + '</td>' +
          '<td>' + (l.membersProcessed || 0) + '</td>' +
          '<td>' + (l.entriesExtracted || 0) + '</td>' +
          '<td>' + esc(l.importedAt || '') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }).catch(function () {
      $('#import-history').innerHTML = '<div class="empty-state"><p>Failed to load history.</p></div>';
    });
  }

  // ── Settings ──
  function loadSettings(el) {
    el.innerHTML =
      '<h1 class="section-title">Settings</h1>' +
      '<h2 style="font-size:1.05rem;margin-bottom:0.75rem">Health Status</h2>' +
      '<div id="health-grid" class="health-grid"><span class="spinner"></span></div>';

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

  // ── Utilities ──
  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──
  boot();
})();
