(function () {
  'use strict';

  var programmeRoot = document.getElementById('programme-content');
  var posterRoot = document.getElementById('poster-abstracts-content');
  if (!programmeRoot || !posterRoot) return;

  var openButton = null;
  var talksById = {};
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function accordion(id, summary, body, headingLevel) {
    var buttonId = 'toggle-' + id;
    var panelId = 'abstract-' + id;
    return '<h' + headingLevel + ' class="abstract-heading">' +
      '<button class="abstract-toggle" id="' + buttonId + '" type="button" aria-expanded="false" aria-controls="' + panelId + '">' +
      '<span class="abstract-summary">' + summary + '</span><span class="abstract-mark" aria-hidden="true">+</span></button></h' + headingLevel + '>' +
      '<div class="abstract-panel" id="' + panelId + '" role="region" aria-labelledby="' + buttonId + '" aria-hidden="true" data-open="false" inert>' +
      '<div class="abstract-clip"><div class="abstract-body">' + body + '</div></div></div>';
  }

  function talkRow(event, dayId) {
    var talk = talksById[event.talkId];
    if (!talk) throw new Error('Missing talk ' + event.talkId);
    var summary = '<span class="abstract-speaker">' + escapeHtml(talk.id + ' / ' + talk.speaker) + '</span>' +
      '<span class="abstract-title">' + talk.titleHtml + '</span>' +
      '<span class="abstract-affiliation">' + talk.affiliationHtml + '</span>';
    return '<article class="programme-row programme-row--talk" id="talk-' + talk.id + '" data-day="' + dayId + '">' +
      '<div class="programme-time">' + escapeHtml(event.time) + '</div><div class="programme-entry">' +
      accordion('talk-' + talk.id, summary, talk.abstractHtml, 4) + '</div></article>';
  }

  function setOpen(button, isOpen) {
    var panel = document.getElementById(button.getAttribute('aria-controls'));
    button.setAttribute('aria-expanded', String(isOpen));
    panel.setAttribute('aria-hidden', String(!isOpen));
    panel.dataset.open = String(isOpen);
    panel.inert = !isOpen;
    button.closest('article').classList.toggle('is-open', isOpen);
  }

  function toggleAbstract(button, forceOpen) {
    var shouldOpen = forceOpen || button.getAttribute('aria-expanded') !== 'true';
    if (openButton && openButton !== button) setOpen(openButton, false);
    setOpen(button, shouldOpen);
    openButton = shouldOpen ? button : null;
  }

  function selectDay(dayId, focusTab) {
    document.querySelectorAll('.programme-day-tab').forEach(function (tab) {
      var selected = tab.dataset.day === dayId;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    document.querySelectorAll('.programme-day-panel').forEach(function (panel) {
      panel.hidden = panel.id !== 'day-' + dayId;
    });
    if (openButton) {
      var row = openButton.closest('[data-day]');
      if (row && row.dataset.day !== dayId) {
        setOpen(openButton, false);
        openButton = null;
      }
    }
  }

  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!/^(talk-T\d{2}|poster-P\d{2})$/.test(id)) return;
    var article = document.getElementById(id);
    if (!article) return;
    if (article.dataset.day) selectDay(article.dataset.day, false);
    var button = article.querySelector('.abstract-toggle');
    if (button) toggleAbstract(button, true);
    requestAnimationFrame(function () { article.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  }

  function render(data) {
    data.talks.forEach(function (talk) { talksById[talk.id] = talk; });
    var tabs = data.days.map(function (day, index) {
      var parts = day.label.split(' ');
      return '<button class="programme-day-tab" id="tab-' + day.id + '" role="tab" type="button" aria-selected="' + (index === 0) + '" aria-controls="day-' + day.id + '" tabindex="' + (index === 0 ? 0 : -1) + '" data-day="' + day.id + '">' +
        '<span>' + escapeHtml(parts[0]) + '</span><strong>' + escapeHtml(parts.slice(1).join(' ')) + '</strong></button>';
    }).join('');
    var panels = data.days.map(function (day, index) {
      var rows = day.events.map(function (event) {
        if (event.kind === 'talk') return talkRow(event, day.id);
        if (event.kind === 'session') return '<p class="programme-session">' + escapeHtml(event.title) + '</p>';
        return '<div class="programme-row programme-row--event"><div class="programme-time">' + escapeHtml(event.time) + '</div>' +
          '<div class="programme-event"><strong>' + (event.titleHtml || escapeHtml(event.title)) + '</strong>' +
          (event.detailHtml ? '<div class="programme-event-detail">' + event.detailHtml + '</div>' : '') + '</div></div>';
      }).join('');
      return '<div class="programme-day-panel" id="day-' + day.id + '" role="tabpanel" aria-labelledby="tab-' + day.id + '"' + (index ? ' hidden' : '') + '>' +
        '<h3 class="programme-day-title">' + escapeHtml(day.label) + ' · Council Room</h3>' + rows + '</div>';
    }).join('');
    programmeRoot.innerHTML = '<div class="programme-controls"><div class="programme-tabs" role="tablist" aria-label="Programme day">' + tabs + '</div>' +
      '<p>Select a talk to read its abstract.</p></div>' + panels;

    posterRoot.innerHTML = '<div class="poster-list">' + data.posters.map(function (poster) {
      var summary = '<span class="abstract-title">' + poster.titleHtml + '</span><span class="abstract-speaker">' + escapeHtml(poster.presenter) + '</span>';
      var body = '<div class="poster-authors">' + poster.authorsHtml + '</div>' + poster.abstractHtml;
      return '<article class="poster-abstract" id="poster-' + poster.id + '"><div class="poster-id">' + escapeHtml(poster.id) + '</div><div class="programme-entry">' +
        accordion('poster-' + poster.id, summary, body, 3) + '</div></article>';
    }).join('') + '</div>';

    document.querySelectorAll('.abstract-toggle').forEach(function (button) {
      button.addEventListener('click', function () { toggleAbstract(button, false); });
    });
    document.querySelectorAll('.programme-day-tab').forEach(function (tab, index, tabs) {
      tab.addEventListener('click', function () { selectDay(tab.dataset.day, false); });
      tab.addEventListener('keydown', function (event) {
        var next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next != null) { event.preventDefault(); selectDay(tabs[next].dataset.day, true); }
      });
    });
    if (typeof window.renderMathInElement === 'function') {
      [programmeRoot, posterRoot].forEach(function (root) {
        window.renderMathInElement(root, {
          delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }],
          throwOnError: false,
          strict: 'ignore',
          trust: false
        });
      });
    }

    function normalizeName(name) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/gi, '').toLowerCase(); }
    document.querySelectorAll('.speaker-card').forEach(function (card) {
      var name = normalizeName(card.querySelector('h3').textContent);
      var talk = data.talks.find(function (entry) {
        var fullName = normalizeName(entry.speaker);
        var parts = entry.speaker.trim().split(/\s+/);
        var shortName = normalizeName(parts[0] + parts[parts.length - 1]);
        return fullName === name || shortName === name;
      });
      if (!talk) return;
      var link = document.createElement('a');
      link.className = 'speaker-talk-link';
      link.href = '#talk-' + talk.id;
      link.textContent = 'Talk & abstract →';
      link.addEventListener('click', function (event) {
        if (link.hash === location.hash) {
          event.preventDefault();
          openFromHash();
        }
      });
      card.appendChild(link);
    });
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
  }

  try {
    var embeddedData = document.getElementById('programme-data');
    if (!embeddedData) throw new Error('Programme data is missing');
    render(JSON.parse(embeddedData.textContent));
  } catch (error) {
    console.error(error);
    var fallback = '<p class="programme-fallback">Please <a href="programme/gradient-flows-2026-programme.pdf">open the programme PDF</a> for the timetable and all abstracts.</p>';
    programmeRoot.innerHTML = fallback;
    posterRoot.innerHTML = fallback;
  }
}());
