/* Réglages : même rangement que TimeTracker (Langue, puis le reste des réglages). Fermeture par la croix ✕ en haut à droite. */
(function () {
  window.TTScreens = window.TTScreens || {};
  window.TTScreens.settings = {
    render: function (el) {
      var cur = TTI.lang;
      el.innerHTML =
        '<div class="pageHead"><div class="screenTitle">Réglages</div><button type="button" class="topIconBtn" id="closePage" aria-label="Fermer">✕</button></div>' +
        '<div class="sectionTitle">Langue</div>' +
        '<div class="card"><div class="themeSwitch" role="group" aria-label="Langue">' +
        '<button type="button" class="themeBtn' + (cur === 'fr' ? ' active' : '') + '" data-lang="fr" aria-pressed="' + (cur === 'fr') + '">Français</button>' +
        '<button type="button" class="themeBtn' + (cur === 'en' ? ' active' : '') + '" data-lang="en" aria-pressed="' + (cur === 'en') + '">English</button></div></div>' +
        '<div class="sectionTitle">Sécurité</div>' +
        '<div class="card"><a class="btnGhost linkBtn" style="margin-top:0" href="#/security">Sécurité du compte</a></div>';
      el.querySelector('#closePage').addEventListener('click', function () { location.hash = '#/dashboard'; });
      el.querySelectorAll('[data-lang]').forEach(function (b) {
        b.addEventListener('click', function () { if (b.dataset.lang !== cur) TTI.setLang(b.dataset.lang); });
      });
    }
  };
})();
