(() => {
  "use strict";

  const PREF_ENABLED = "extensions.essentialtabopener.enabled";
  const LOG = "[Essential Tab Opener]";
  const duplicateOrigins = new WeakMap();

  function isEnabled() {
    try { return Services.prefs.getBoolPref(PREF_ENABLED, true); }
    catch { return true; }
  }

  function isPlainLeftClick(event) {
    return event.type === "click" && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
  }

  function getEssentialTab(target) {
    if (!(target instanceof Element)) return null;
    const tab = target.closest("tab.tabbrowser-tab");
    return tab && tab.hasAttribute("zen-essential") ? tab : null;
  }

  function isTabAction(target) {
    return target instanceof Element && !!target.closest(
      ".tab-reset-button, .tab-reset-pin-button, .tab-close-button, .tab-audio-button"
    );
  }

  function unloadEssential(tab) {
    try {
      if (!tab || !tab.isConnected || !tab.hasAttribute("zen-essential")) return;
      if (!tab.hasAttribute("pending")) {
        const ok = gBrowser.explicitUnloadTabs([tab]);
        if (!ok) console.warn(LOG, "explicitUnloadTabs returned false");
      }
    } catch (e) {
      console.error(LOG, "Failed to unload Essential Tab:", e);
    }
  }


  function animateEssentialToNormal(sourceTab, targetTab) {
    try {
      const sourceContent = sourceTab.querySelector(".tab-content");
      const targetContent = targetTab.querySelector(".tab-content");
      if (!sourceContent || !targetContent) return;

      const from = sourceContent.getBoundingClientRect();
      const to = targetContent.getBoundingClientRect();
      if (!from.width || !from.height || !to.width || !to.height) return;

      const clone = sourceContent.cloneNode(true);
      clone.setAttribute("data-essential-tab-opener-animation", "true");
      Object.assign(clone.style, {
        position: "fixed",
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        margin: "0",
        padding: "0",
        boxSizing: "border-box",
        zIndex: "2147483647",
        pointerEvents: "none",
        transformOrigin: "center center",
        transform: "translate3d(0, 0, 0) scale(1)",
        opacity: "1",
        transition: "transform 520ms cubic-bezier(.22,.61,.36,1), opacity 520ms ease",
        willChange: "transform, opacity"
      });

      document.documentElement.appendChild(clone);

      const oldTargetOpacity = targetContent.style.opacity;
      targetContent.style.opacity = "0";

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const dx = to.left - from.left;
        const dy = to.top - from.top;
        const scaleX = Math.max(0.72, Math.min(1.08, to.width / from.width));
        const scaleY = Math.max(0.72, Math.min(1.08, to.height / from.height));

        clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})`;
        clone.style.opacity = "0.05";

        setTimeout(() => {
          clone.remove();
          targetContent.style.opacity = oldTargetOpacity;
        }, 550);
      }));
    } catch (e) {
      console.error(LOG, "Animation failed:", e);
    }
  }

  function convertDuplicateToNormalTab(newTab, sourceTab) {
    if (!newTab || !newTab.isConnected) return;
    try {
      if (typeof gZenPinnedTabManager !== "undefined" &&
          gZenPinnedTabManager &&
          typeof gZenPinnedTabManager.removeEssentials === "function" &&
          newTab.hasAttribute("zen-essential")) {
        gZenPinnedTabManager.removeEssentials(newTab, true);
      } else {
        newTab.removeAttribute("zen-essential");
        if (newTab.pinned) gBrowser.unpinTab(newTab);
      }

      duplicateOrigins.set(newTab, sourceTab);
      gBrowser.selectedTab = newTab;

      // Animate the visual tab content from Essentials into the new normal tab.
      animateEssentialToNormal(sourceTab, newTab);

      // The original Essential remains as a button, but its document is unloaded.
      unloadEssential(sourceTab);
    } catch (e) {
      console.error(LOG, "Failed to convert duplicate:", e);
    }
  }

  function duplicateEssential(event) {
    if (!isEnabled() || !isPlainLeftClick(event) || isTabAction(event.target)) return;
    const sourceTab = getEssentialTab(event.target);
    if (!sourceTab) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      const newTab = gBrowser.duplicateTab(sourceTab, 1);
      if (!newTab) return;

      const finish = () => convertDuplicateToNormalTab(newTab, sourceTab);
      if (newTab.hasAttribute("pending")) {
        newTab.addEventListener("SSTabRestored", finish, { once: true });
        setTimeout(() => {
          if (newTab.isConnected && newTab.hasAttribute("zen-essential")) finish();
        }, 1200);
      } else {
        finish();
      }
    } catch (e) {
      console.error(LOG, "Duplicate failed:", e);
    }
  }

  function isNormalVisibleTab(tab, closingTab) {
    return tab && tab !== closingTab && tab.isConnected && !tab.hidden &&
      !tab.pinned && !tab.hasAttribute("zen-essential");
  }

  function getNextNormalTab(closingTab) {
    const visible = Array.from(gBrowser.visibleTabs || []).filter(t => t !== closingTab);
    if (!visible.length) return null;
    const normal = visible.filter(t => isNormalVisibleTab(t, closingTab));
    if (!normal.length) return null;

    const all = Array.from(gBrowser.visibleTabs || []);
    const index = all.indexOf(closingTab);
    if (index >= 0) {
      for (let i = index + 1; i < all.length; i++) {
        if (isNormalVisibleTab(all[i], closingTab)) return all[i];
      }
      for (let i = index - 1; i >= 0; i--) {
        if (isNormalVisibleTab(all[i], closingTab)) return all[i];
      }
    }
    return normal[0];
  }

  function openHomepage() {
    try {
      let homepage = Services.prefs.getStringPref("browser.startup.homepage", "about:home");
      // Firefox can store multiple home pages separated by |; use the first one.
      homepage = homepage.split("|")[0] || "about:home";
      return gBrowser.addTab(homepage, { inBackground: false });
    } catch (e) {
      console.error(LOG, "Failed to open homepage:", e);
      return gBrowser.addTab("about:home", { inBackground: false });
    }
  }

  function handleTabClose(event) {
    const closingTab = event.target;
    const source = duplicateOrigins.get(closingTab);
    if (!source) return;

    duplicateOrigins.delete(closingTab);

    // Let Zen finish its own close/selection work first, then choose a normal tab.
    setTimeout(() => {
      if (!gBrowser || !gBrowser.window || gBrowser.window.closed) return;

      const nextTab = getNextNormalTab(closingTab);
      if (nextTab) {
        gBrowser.selectedTab = nextTab;
        return;
      }

      // No other normal tab exists: open the browser start/home page.
      openHomepage();
    }, 0);
  }

  function install() {
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) return setTimeout(install, 500);

    tabs.addEventListener("click", duplicateEssential, true);
    gBrowser.tabContainer.addEventListener("TabClose", handleTabClose, true);

    console.log(LOG, "Loaded 1.6.0");
  }

  install();
})();
