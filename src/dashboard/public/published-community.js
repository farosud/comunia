(function () {
  'use strict';

  var slug = window.COMUNIA_PUBLISHED_SLUG;
  var root = document.getElementById('published-community-root');
  if (!slug || !root) return;

  root.innerHTML =
    '<div id="community-login" class="community-login">' +
      '<div class="community-login-card">' +
        '<p class="eyebrow">Comunia Cloud</p>' +
        '<h1>Enter the community passcode</h1>' +
        '<p>Use the shared code from the community admin to unlock this public portal.</p>' +
        '<form id="community-login-form">' +
          '<input id="community-passcode" type="password" placeholder="Community passcode" required>' +
          '<button type="submit">Enter</button>' +
        '</form>' +
        '<p id="community-login-error" class="error hidden">Wrong passcode. Try again.</p>' +
      '</div>' +
    '</div>' +
    '<div id="community-app" class="community-app hidden">' +
      '<header class="community-hero">' +
        '<div>' +
          '<p class="eyebrow">Published Community Portal</p>' +
          '<h1 id="community-name">Comunia</h1>' +
          '<p id="community-subtitle" class="subtitle"></p>' +
        '</div>' +
        '<div class="hero-actions">' +
          '<a id="bot-link" class="hero-button hidden" href="#" target="_blank" rel="noreferrer">Talk to the bot</a>' +
          '<button id="community-logout" class="secondary-button">Lock portal</button>' +
        '</div>' +
      '</header>' +
      '<main class="community-layout">' +
        '<section class="community-panel"><div class="panel-heading"><div><p class="panel-kicker">Upcoming</p><h2>Events</h2></div></div><div id="public-events" class="stack"></div></section>' +
        '<section class="community-panel"><div class="panel-heading"><div><p class="panel-kicker">People</p><h2>Members</h2></div></div><div id="public-members" class="member-grid"></div></section>' +
        '<section class="community-panel full-span"><div class="panel-heading"><div><p class="panel-kicker">AI Stream</p><h2>Potential ideas for the community</h2></div><p class="panel-note">Vote up or down. For now, votes only shape the visible signal.</p></div><div id="public-ideas" class="idea-stream"></div></section>' +
      '</main>' +
    '</div>';

  var passcodeKey = 'comunia_cloud_code_' + slug;
  var voterKey = 'comunia_cloud_voter_' + slug;
  var stream = null;

  function getPasscode() { return localStorage.getItem(passcodeKey); }
  function setPasscode(value) { localStorage.setItem(passcodeKey, value); }
  function clearPasscode() { localStorage.removeItem(passcodeKey); }
  function getVoterId() {
    var existing = localStorage.getItem(voterKey);
    if (existing) return existing;
    var created = 'browser_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(voterKey, created);
    return created;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, {
      'x-community-code': getPasscode() || '',
    });
    return fetch('/cloud-api/communities/' + encodeURIComponent(slug) + path, opts);
  }

  document.getElementById('community-login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var passcode = document.getElementById('community-passcode').value.trim();
    fetch('/cloud-api/unlock/' + encodeURIComponent(slug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: passcode }),
    }).then(function (response) {
      if (!response.ok) throw new Error('bad');
      setPasscode(passcode);
      document.getElementById('community-login-error').classList.add('hidden');
      load();
    }).catch(function () {
      clearPasscode();
      document.getElementById('community-login-error').classList.remove('hidden');
    });
  });

  document.getElementById('community-logout').addEventListener('click', function () {
    clearPasscode();
    closeStream();
    showLogin();
  });

  function showLogin() {
    document.getElementById('community-login').classList.remove('hidden');
    document.getElementById('community-app').classList.add('hidden');
  }

  function showApp() {
    document.getElementById('community-login').classList.add('hidden');
    document.getElementById('community-app').classList.remove('hidden');
  }

  function load() {
    api('/bootstrap')
      .then(function (response) {
        if (response.status === 401) {
          clearPasscode();
          showLogin();
          throw new Error('unauthorized');
        }
        if (!response.ok) throw new Error('bad');
        return response.json();
      })
      .then(function (data) {
        render(data);
        showApp();
        openStream();
      })
      .catch(function () {
        closeStream();
        showLogin();
      });
  }

  function openStream() {
    closeStream();
    var code = getPasscode();
    if (!code) return;

    stream = new EventSource('/cloud-api/communities/' + encodeURIComponent(slug) + '/stream?code=' + encodeURIComponent(code));
    stream.addEventListener('portal', function (event) {
      try {
        render(JSON.parse(event.data));
      } catch (_) {}
    });
    stream.onerror = function () {
      // Let EventSource reconnect by itself.
    };
  }

  function closeStream() {
    if (stream) stream.close();
    stream = null;
  }

  function render(data) {
    document.getElementById('community-name').textContent = data.community.name || slug;
    document.getElementById('community-subtitle').textContent = [data.community.type, data.community.location].filter(Boolean).join(' · ');
    var botLink = document.getElementById('bot-link');
    if (data.community.botUrl) {
      botLink.href = data.community.botUrl;
      botLink.classList.remove('hidden');
    } else {
      botLink.classList.add('hidden');
    }

    renderEvents(data.upcomingEvents || []);
    renderMembers(data.members || []);
    renderIdeas(data.ideas || []);
  }

  function renderEvents(events) {
    var container = document.getElementById('public-events');
    container.innerHTML = events.length
      ? events.map(function (event) {
          return '<div class="event-card"><h3>' + esc(event.title) + '</h3><div class="event-meta">' +
            esc(event.date || '') + (event.location ? ' · ' + esc(event.location) : '') + '</div></div>';
        }).join('')
      : '<div class="empty-state">No upcoming events yet.</div>';
  }

  function renderMembers(members) {
    var container = document.getElementById('public-members');
    container.innerHTML = members.length
      ? members.map(function (member) {
          return '<div class="member-card"><div class="member-name">' + esc(member.name) + '</div><div class="member-status">' + esc(member.status || 'active') + '</div></div>';
        }).join('')
      : '<div class="empty-state">No members visible yet.</div>';
  }

  function renderIdeas(ideas) {
    var container = document.getElementById('public-ideas');
    if (!ideas.length) {
      container.innerHTML = '<div class="empty-state">No public ideas published yet.</div>';
      return;
    }

    container.innerHTML = ideas.map(function (idea) {
      return '<div class="idea-card" data-idea-id="' + esc(idea.id) + '">' +
        '<div class="idea-header"><div><h3>' + esc(idea.title) + '</h3><div class="idea-meta">' + esc(idea.description || '') + '</div></div><span class="idea-format">' + esc(idea.format || 'idea') + '</span></div>' +
        (idea.rationale ? '<div class="idea-meta">Why this now: ' + esc(idea.rationale) + '</div>' : '') +
        '<div class="idea-actions"><div class="vote-row"><button class="vote-btn" data-vote="1">Upvote</button><button class="vote-btn" data-vote="-1">Downvote</button></div><div class="vote-count">' +
        esc(String(idea.upvotes || 0)) + ' up · ' + esc(String(idea.downvotes || 0)) + ' down</div></div></div>';
    }).join('');

    container.querySelectorAll('.vote-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        var card = button.closest('.idea-card');
        var ideaId = card.getAttribute('data-idea-id');
        api('/ideas/' + encodeURIComponent(ideaId) + '/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voterId: getVoterId(), value: Number(button.getAttribute('data-vote')) || 1 }),
        }).then(function (response) { return response.json(); })
          .then(function (payload) {
            if (payload.portal) render(payload.portal);
          });
      });
    });
  }

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  window.addEventListener('beforeunload', closeStream);

  if (getPasscode()) load();
  else showLogin();
})();
