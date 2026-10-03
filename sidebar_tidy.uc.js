// ==UserScript==
// @name           Sidebar Tidy
// @version        1.0
// @description    VPN + Réglages dans la barre du bas de la sidebar ; URL en domaine seul.
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    const PREF_PREFIX = 'extension.sidebar-tidy.';
    const BUTTON_IDS = ['ipprotection-button', 'PanelUI-button']; // VPN puis Réglages

    function readPref(key, fallback) {
        const fullKey = PREF_PREFIX + key;
        try {
            switch (Services.prefs.getPrefType(fullKey)) {
                case Services.prefs.PREF_BOOL: return Services.prefs.getBoolPref(fullKey);
                case Services.prefs.PREF_INT: return Services.prefs.getIntPref(fullKey);
                case Services.prefs.PREF_STRING: return Services.prefs.getCharPref(fullKey);
            }
        } catch (_) { /* pref absente */ }
        return fallback;
    }
    const boolPref = (key, fb) => {
        const v = readPref(key, fb);
        return v === true || v === 'true';
    };
    const log = (...a) => { if (boolPref('debug', false)) console.log('[sidebar-tidy]', ...a); };

    /* ================= 1. Boutons dans la barre du bas ================= */

    function placeButtons() {
        if (!boolPref('move-buttons', true)) return false;
        const foot = document.getElementById('zen-sidebar-foot-buttons');
        const anchor = document.getElementById('zen-workspaces-button');
        if (!foot || !anchor) return false;
        for (const id of BUTTON_IDS) {
            const el = document.getElementById(id);
            if (el && el.parentNode !== foot) {
                foot.insertBefore(el, anchor);
                log('déplacé', id);
            }
        }
        return true;
    }

    function watchButtons() {
        if (!boolPref('move-buttons', true)) return;
        let tries = 0;
        const timer = setInterval(() => {
            if (placeButtons() || ++tries > 40) clearInterval(timer);
        }, 500);

        // Si Firefox/Zen replace les boutons dans leur barre d'origine, on les reprend.
        // placeButtons() est idempotent (test parentNode), donc pas de boucle.
        const targets = ['nav-bar-customization-target', 'zen-sidebar-foot-buttons', 'nav-bar'];
        for (const id of targets) {
            const node = document.getElementById(id);
            if (node) new MutationObserver(() => placeButtons()).observe(node, { childList: true, subtree: true });
        }
    }

    /* ================= 2. URL : domaine seul ================= */

    function domainOf(uri) {
        if (!uri || !/^https?$/.test(uri.scheme)) return null;
        try { return uri.host.replace(/^www\./, ''); } catch (_) { return null; }
    }

    function applyDomainOnly() {
        if (!boolPref('force-domain-only', true)) return;
        const bar = window.gURLBar;
        if (!bar || bar.focused || bar.valueIsTyped) return;
        const host = domainOf(gBrowser.selectedBrowser?.currentURI);
        if (!host) return;
        const input = bar.inputField;
        if (input && input.value !== host) {
            input.value = host;
            log('url →', host);
        }
    }

    // Plusieurs passages : Zen/Firefox réécrivent la valeur après la navigation.
    function scheduleDomainOnly() {
        for (const ms of [0, 60, 250, 800]) setTimeout(applyDomainOnly, ms);
    }

    function watchUrl() {
        const bar = window.gURLBar;
        if (!bar) return;

        // Après chaque setURI (changement de page / d'onglet / blur)
        if (typeof bar.setURI === 'function') {
            const orig = bar.setURI.bind(bar);
            bar.setURI = function (...args) {
                const r = orig(...args);
                scheduleDomainOnly();
                return r;
            };
        }

        // Filet de sécurité : changements de page, d'onglet, perte de focus
        gBrowser.addTabsProgressListener({
            onLocationChange(browser, _wp, _req, _loc, flags) {
                if (browser === gBrowser.selectedBrowser) scheduleDomainOnly();
            },
        });
        gBrowser.tabContainer.addEventListener('TabSelect', scheduleDomainOnly);
        bar.inputField.addEventListener('blur', scheduleDomainOnly);

        scheduleDomainOnly();
    }

    /* ================= Démarrage ================= */

    function init() {
        try { watchButtons(); } catch (e) { console.error('[sidebar-tidy] boutons', e); }
        try { watchUrl(); } catch (e) { console.error('[sidebar-tidy] url', e); }
    }

    if (window.gBrowserInit?.delayedStartupFinished) {
        init();
    } else {
        const obs = (subject) => {
            if (subject !== window) return;
            Services.obs.removeObserver(obs, 'browser-delayed-startup-finished');
            init();
        };
        Services.obs.addObserver(obs, 'browser-delayed-startup-finished');
    }
})();
