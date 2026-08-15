(() => {
  "use strict";

  const PREF_ENABLED = "extensions.essentialtabopener.enabled";
  const LOG = "[Essential Tab Opener]";

  const isEnabled = () => {
    try {
      return Services.prefs.getBoolPref(PREF_ENABLED, true);
    } catch {
      return true;
    }
  };

  const isPlainLeftClick = (event) =>
    event.type === "click" &&
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey;

  const getTab = (target) => {
    if (!(target instanceof Element)) return null;
    const tab = target.closest("tab.tabbrowser-tab");
    return tab && tab.hasAttribute("zen-essential") ? tab : null;
  };

  const isTabAction = (target) =>
    target instanceof Element &&
    !!target.closest(
      ".tab-reset-button, .tab-reset-pin-button, .tab-close-button, .tab-audio-button"
    );

  const convertToNormalTab = (tab) => {
    if (!tab || !tab.isConnected) return;

    try {
      if (
        typeof gZenPinnedTabManager !== "undefined" &&
        gZenPinnedTabManager &&
        typeof gZenPinnedTabManager.removeEssentials === "function" &&
        tab.hasAttribute("zen-essential")
      ) {
        // Use Zen's own Essential -> normal tab conversion.
        gZenPinnedTabManager.removeEssentials(tab, true);
      } else {
        tab.removeAttribute("zen-essential");
        if (tab.pinned) gBrowser.unpinTab(tab);
      }

      gBrowser.selectedTab = tab;
    } catch (error) {
      console.error(LOG, "Failed to convert duplicated tab:", error);
    }
  };

  const duplicateEssential = (event) => {
    if (!isEnabled() || !isPlainLeftClick(event)) return;
    if (isTabAction(event.target)) return;

    const sourceTab = getTab(event.target);
    if (!sourceTab) return;

    // Prevent the normal Essential Tab selection behavior.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      // Firefox/Zen native duplicate operation. The second argument (1)
      // inserts the duplicate immediately after the source tab, matching
      // the normal "Duplicate Tab" operation.
      const newTab = gBrowser.duplicateTab(sourceTab, 1);
      if (!newTab) return;

      const finish = () => convertToNormalTab(newTab);

      // A duplicated tab can initially be pending/session-restored.
      if (newTab.hasAttribute("pending")) {
        newTab.addEventListener("SSTabRestored", finish, { once: true });
        // Safety fallback if the restore event already happened.
        setTimeout(() => {
          if (newTab.isConnected && newTab.pinned) finish();
        }, 1000);
      } else {
        finish();
      }
    } catch (error) {
      console.error(LOG, "Duplicate failed:", error);
    }
  };

  const install = () => {
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) {
      setTimeout(install, 500);
      return;
    }

    tabs.addEventListener("click", duplicateEssential, true);
    console.log(LOG, "Loaded 1.4.0");
  };

  install();
})();
