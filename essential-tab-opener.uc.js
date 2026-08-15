(() => {
  "use strict";

  const PREF = "extensions.essentialtabopener.enabled";
  const LOG = "[Essential Tab Opener]";
  let installed = false;

  function enabled() {
    try {
      return Services.prefs.getBoolPref(PREF, true);
    } catch (_) {
      return true;
    }
  }

  function isActionButton(target) {
    return target instanceof Element && !!target.closest(
      ".tab-reset-button, .tab-reset-pin-button, .tab-close-button, .tab-audio-button"
    );
  }

  function isPlainLeftClick(event) {
    return event.type === "click" &&
           event.button === 0 &&
           !event.ctrlKey &&
           !event.metaKey &&
           !event.shiftKey &&
           !event.altKey;
  }

  function getEssentialTab(target) {
    if (!(target instanceof Element)) return null;
    const tab = target.closest("tab.tabbrowser-tab");
    return tab && tab.hasAttribute("zen-essential") ? tab : null;
  }

  function convertDuplicateToNormalTab(newTab) {
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

      gBrowser.selectedTab = newTab;
    } catch (error) {
      console.error(LOG, "Could not convert duplicate to normal tab", error);
    }
  }

  function duplicateEssential(event) {
    if (!enabled() || !isPlainLeftClick(event)) return;
    if (isActionButton(event.target)) return;

    const sourceTab = getEssentialTab(event.target);
    if (!sourceTab) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      // Native Firefox/Zen duplicate operation.
      const newTab = gBrowser.duplicateTab(sourceTab, 1);
      if (!newTab) return;

      // Convert immediately. If session restore is needed, convert again when restored.
      convertDuplicateToNormalTab(newTab);

      if (newTab.hasAttribute("pending")) {
        newTab.addEventListener("SSTabRestored", () => {
          convertDuplicateToNormalTab(newTab);
        }, { once: true });
      }
    } catch (error) {
      console.error(LOG, "Duplicate failed", error);
    }
  }

  function install() {
    if (installed) return;
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) {
      setTimeout(install, 500);
      return;
    }

    tabs.addEventListener("click", duplicateEssential, true);
    installed = true;
    console.log(LOG, "Loaded 1.3.0");
  }

  install();
})();
