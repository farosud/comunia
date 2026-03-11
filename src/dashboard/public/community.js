(function () {
  'use strict';

  var PASSCODE_KEY = 'comunia_public_code';
  var VOTER_KEY = 'comunia_public_voter_id';

  function getPasscode() {
    return localStorage.getItem(PASSCODE_KEY);
  }

  function setPasscode(value) {
    localStorage.setItem(PASSCODE_KEY, value);
  }

  function clearPasscode() {
    localStorage.removeItem(PASSCODE_KEY);
  }

  function getVoterId() {
    var existing = localStorage.getItem(VOTER_KEY);
    if (existing) return existing;
    var created = 'browser_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(VOTER_KEY, created);
    return created;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, {
      'x-community-code': getPasscode() || '',
    });
    return fetch('/community-api' + path, opts);
  }

  function boot() {
    bindLogin();
    bindLogout();
    if (getPasscode()) {
      loadDashboard();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    document.getElementById('community-login').classList.remove('hidden');
    document.getElementById('community-app').classList.add('hidden');
  }

  function showApp() {
    document.getElementById('community-login').classList.add('hidden');
    document.getElementById('community-app').classList.remove('hidden');
  }

  function bindLogin() {
    var form = document.getElementById('community-login-form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var passcode = document.getElementById('community-passcode').value.trim();
      fetch('/community-api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error('bad');
          setPasscode(passcode);
          document.getElementById('community-login-error').classList.add('hidden');
          loadDashboard();
        })
        .catch(function () {
          clearPasscode();
          document.getElementById('community-login-error').classList.remove('hidden');
        });
    });
  }

  function bindLogout() {
    document.getElementById('community-logout').addEventListener('click', function () {
      clearPasscode();
      showLogin();
    });
  }

  function loadDashboard() {
    api('/bootstrap')
      .then(function (response) {
        if (response.status === 401) {
          clearPasscode();
          showLogin();
          throw new Error('unauthorized');
        }
        return response.json();
      })
      .then(function (data) {
        showApp();
        renderCommunity(data);
      })
      .catch(function () {
        clearPasscode();
        showLogin();
      });
  }

  function renderCommunity(data) {
    document.getElementById('community-name').textContent = data.community.name || 'Comunia';
    document.getElementById('community-subtitle').textContent =
      [data.community.type, data.community.location].filter(Boolean).join(' · ');

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
    if (!events.length) {
      container.innerHTML = '<div class="empty-state">No upcoming events yet.</div>';
      return;
    }

    container.innerHTML = events.map(function (event) {
      return '<div class="event-card">' +
        '<h3>' + esc(event.title) + '</h3>' +
        '<div class="event-meta">' + esc(event.date || '') + (event.location ? ' · ' + esc(event.location) : '') + '</div>' +
      '</div>';
    }).join('');
  }

  function renderMembers(members) {
    var container = document.getElementById('public-members');
    if (!members.length) {
      container.innerHTML = '<div class="empty-state">No members visible yet.</div>';
      return;
    }

    container.innerHTML = members.map(function (member) {
      return '<div class="member-card">' +
        '<div class="member-name">' + esc(member.name) + '</div>' +
        '<div class="member-status">' + esc(member.status || 'active') + '</div>' +
      '</div>';
    }).join('');
  }

  function renderIdeas(ideas) {
    var container = document.getElementById('public-ideas');
    if (!ideas.length) {
      container.innerHTML = '<div class="empty-state">The agent has not suggested ideas yet. Check back soon.</div>';
      return;
    }

    container.innerHTML = ideas.map(function (idea) {
      return '<div class="idea-card" data-idea-id="' + esc(idea.id) + '">' +
        '<div class="idea-header">' +
          '<div>' +
            '<h3>' + esc(idea.title) + '</h3>' +
            '<div class="idea-meta">' + esc(idea.description || '') + '</div>' +
          '</div>' +
          '<span class="idea-format">' + esc(idea.format || 'idea') + '</span>' +
        '</div>' +
        (idea.rationale ? '<div class="idea-meta">Why this now: ' + esc(idea.rationale) + '</div>' : '') +
        '<div class="idea-actions">' +
          '<div class="vote-row">' +
            '<button class="vote-btn" data-vote="1">Upvote</button>' +
            '<button class="vote-btn" data-vote="-1">Downvote</button>' +
          '</div>' +
          '<div class="vote-count">' + esc(String(idea.upvotes || 0)) + ' up · ' + esc(String(idea.downvotes || 0)) + ' down</div>' +
        '</div>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.vote-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        var card = button.closest('.idea-card');
        var ideaId = card.getAttribute('data-idea-id');
        api('/ideas/' + encodeURIComponent(ideaId) + '/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voterId: getVoterId(),
            value: Number(button.getAttribute('data-vote')) || 1,
          }),
        })
          .then(function (response) { return response.json(); })
          .then(function (payload) {
            renderIdeas(payload.ideas || []);
          });
      });
    });
  }

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  boot();
})();
