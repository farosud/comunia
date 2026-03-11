(function () {
  'use strict';

  var templates = Array.isArray(window.COMUNIA_MARKETPLACE) ? window.COMUNIA_MARKETPLACE : [];
  var grid = document.getElementById('marketplace-grid');
  if (!grid) return;

  if (!templates.length) {
    grid.innerHTML = '<div class="marketplace-card"><p>No templates loaded.</p></div>';
    return;
  }

  grid.innerHTML = templates.map(function (template) {
    return '<article class="marketplace-card" data-template="' + esc(template.slug) + '">' +
      '<div>' +
        '<h3>' + esc(template.title) + '</h3>' +
        '<p>' + esc(template.summary) + '</p>' +
      '</div>' +
      '<div class="marketplace-actions">' +
        '<button class="marketplace-copy" data-copy="agent">Copy agent.md</button>' +
        '<button class="marketplace-copy" data-copy="soul">Copy soul.md</button>' +
        '<button class="marketplace-toggle" data-toggle>Preview files</button>' +
      '</div>' +
      '<div class="marketplace-preview">' +
        '<div class="marketplace-tabs">' +
          '<button class="marketplace-tab is-active" data-tab="agent">agent.md</button>' +
          '<button class="marketplace-tab" data-tab="soul">soul.md</button>' +
        '</div>' +
        '<div class="marketplace-panel is-active" data-panel="agent"><pre>' + esc(template.agent) + '</pre></div>' +
        '<div class="marketplace-panel" data-panel="soul"><pre>' + esc(template.soul) + '</pre></div>' +
      '</div>' +
    '</article>';
  }).join('');

  grid.addEventListener('click', function (event) {
    var copyButton = event.target.closest('[data-copy]');
    if (copyButton) {
      var card = copyButton.closest('[data-template]');
      var slug = card.getAttribute('data-template');
      var kind = copyButton.getAttribute('data-copy');
      var template = templates.find(function (item) { return item.slug === slug; });
      if (!template) return;
      var text = kind === 'soul' ? template.soul : template.agent;
      navigator.clipboard.writeText(text).then(function () {
        var original = copyButton.textContent;
        copyButton.textContent = 'Copied';
        setTimeout(function () { copyButton.textContent = original; }, 1200);
      });
      return;
    }

    var toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      var card = toggle.closest('[data-template]');
      var preview = card.querySelector('.marketplace-preview');
      preview.classList.toggle('is-open');
      toggle.textContent = preview.classList.contains('is-open') ? 'Hide preview' : 'Preview files';
      return;
    }

    var tab = event.target.closest('[data-tab]');
    if (tab) {
      var card = tab.closest('[data-template]');
      var selected = tab.getAttribute('data-tab');
      card.querySelectorAll('.marketplace-tab').forEach(function (item) {
        item.classList.toggle('is-active', item === tab);
      });
      card.querySelectorAll('.marketplace-panel').forEach(function (panel) {
        panel.classList.toggle('is-active', panel.getAttribute('data-panel') === selected);
      });
    }
  });

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }
})();
