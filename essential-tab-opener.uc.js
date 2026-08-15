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

  async function unloadEssential(tab) {
    try {
      if (!tab || !tab.isConnected || !tab.hasAttribute("zen-essential")) return;
      if (tab.hasAttribute("pending")) return;

      // Capture the Essential icon before unload. Zen stores the dedicated
      // Essential icon in --zen-essential-tab-icon, while the tab's normal
      // image/session state may be cleared by explicitUnloadTabs().
      let essentialIcon =
        tab.getAttribute("image") ||
        tab.zenStaticIcon ||
        tab.style.getPropertyValue("--zen-essential-tab-icon");

      if (!essentialIcon) {
        essentialIcon = "";
      }

      // Normalize url(...) from the CSS custom property to the raw icon URL.
      const iconUrl = essentialIcon.startsWith("url(")
        ? essentialIcon.replace(/^url\\((?:\"|')?(.*?)(?:\"|')?\\)$/, "$1")
        : essentialIcon;

      // IMPORTANT: explicitUnloadTabs() is asynchronous. The previous version
      // restored the icon on the next animation frame, which could happen
      // BEFORE Zen finished saving the unloaded tab state. Zen then overwrote
      // our icon with the empty state. Wait for the native unload to finish.
      const successful = await gBrowser.explicitUnloadTabs([tab]);
      if (!successful) {
        console.warn(LOG, "explicitUnloadTabs returned false");
        return;
      }

      if (!tab.isConnected || !tab.hasAttribute("zen-essential")) return;

      if (iconUrl) {
        // Restore Zen's Essential-specific CSS icon.
        if (typeof gZenPinnedTabManager !== "undefined" &&
            gZenPinnedTabManager &&
            typeof gZenPinnedTabManager.setEssentialTabIcon === "function") {
          gZenPinnedTabManager.setEssentialTabIcon(tab, iconUrl);
        }

        // Restore the DOM image attribute if the native unload cleared it.
        if (!tab.getAttribute("image")) {
          tab.setAttribute("image", iconUrl);
        }

        // Most importantly, persist the icon in Firefox/Zen's session state so
        // it survives another unload and a full browser restart.
        try {
          const state = JSON.parse(SessionStore.getTabState(tab));
          state.image = iconUrl;
          SessionStore.setTabState(tab, state);
        } catch (stateError) {
          console.error(LOG, "Failed to persist Essential Tab icon:", stateError);
        }
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
        transform: "translate3d(0, 0, 0) scale(1, 1)",
        opacity: "1",
        transition: "transform 680ms cubic-bezier(.18,.72,.22,1), opacity 680ms ease",
        willChange: "transform, opacity"
      });

      document.documentElement.appendChild(clone);

      const oldTargetOpacity = targetContent.style.opacity;
      targetContent.style.opacity = "0";

      requestAnimationFrame(() => requestAnimationFrame(() => {
        // Move from the Essential Tab's center to the normal tab's center
        // while growing exactly to the normal tab's dimensions.
        const fromCenterX = from.left + from.width / 2;
        const fromCenterY = from.top + from.height / 2;
        const toCenterX = to.left + to.width / 2;
        const toCenterY = to.top + to.height / 2;
        const dx = toCenterX - fromCenterX;
        const dy = toCenterY - fromCenterY;
        const scaleX = to.width / from.width;
        const scaleY = to.height / from.height;

        clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})`;
        clone.style.opacity = "1";

        setTimeout(() => {
          clone.remove();
          targetContent.style.opacity = oldTargetOpacity;
        }, 720);
      }));
    } catch (e) {
      console.error(LOG, "Animation failed:", e);
    }
  }

  async function convertDuplicateToNormalTab(newTab, sourceTab) {
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
      await unloadEssential(sourceTab);
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

  function isNormalOpenTab(tab, closingTab) {
    return tab && tab !== closingTab && tab.isConnected && !tab.hidden &&
      !tab.pinned && !tab.hasAttribute("zen-essential") &&
      !tab.closing;
  }

  // Work only with normal tabs in the current tab list.  Do not rely on
  // visibleTabs here because Zen may be in the middle of its own selection
  // update while TabClose is firing.
  function getNextNormalTabBeforeClose(closingTab) {
    const tabs = Array.from(gBrowser.tabs || []);
    const index = tabs.indexOf(closingTab);
    if (index < 0) return null;

    // Prefer the tab immediately to the right, then the closest tab to the left.
    for (let i = index + 1; i < tabs.length; i++) {
      if (isNormalOpenTab(tabs[i], closingTab)) return tabs[i];
    }
    for (let i = index - 1; i >= 0; i--) {
      if (isNormalOpenTab(tabs[i], closingTab)) return tabs[i];
    }
    return null;
  }

  function getAnyNormalTab() {
    return Array.from(gBrowser.tabs || []).find(tab =>
      tab && tab.isConnected && !tab.hidden && !tab.pinned &&
      !tab.hasAttribute("zen-essential") && !tab.closing
    ) || null;
  }

  function isBlankTab(tab) {
    if (!tab || !tab.linkedBrowser) return false;
    const url = tab.linkedBrowser.currentURI?.spec || "";
    return url === "about:blank" || url === "about:newtab" || url === "about:home";
  }

  function getHomepage() {
    try {
      const homepage = Services.prefs.getStringPref("browser.startup.homepage", "about:home");
      return homepage.split("|")[0] || "about:home";
    } catch {
      return "about:home";
    }
  }

  function openHomepageWithoutExtraBlank() {
    try {
      let current = gBrowser.selectedTab;

      // Zen/Firefox may leave one fresh blank normal tab after the final
      // content tab is closed. Reuse it instead of creating another tab.
      if (current && !current.pinned && !current.hasAttribute("zen-essential") && isBlankTab(current)) {
        current.linkedBrowser.loadURI(getHomepage(), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
        });
        return current;
      }

      return gBrowser.addTab(getHomepage(), { inBackground: false });
    } catch (e) {
      console.error(LOG, "Failed to open homepage:", e);
      return gBrowser.addTab("about:home", { inBackground: false });
    }
  }

  function handleTabClose(event) {
    const closingTab = event.target;
    const source = duplicateOrigins.get(closingTab);
    if (!source) return;

    // IMPORTANT: determine the fallback BEFORE Zen removes the tab from its
    // own tab array. This avoids the race that was causing a blank page to be
    // left selected even when another normal tab was already open.
    const fallbackTab = getNextNormalTabBeforeClose(closingTab);
    duplicateOrigins.delete(closingTab);

    // Let native Zen finish the close operation first. Then enforce our desired
    // selection after Zen has completed its own TabSelect/TabClose handling.
    const chooseNext = () => {
      if (!gBrowser || !gBrowser.window || gBrowser.window.closed) return;

      if (fallbackTab && fallbackTab.isConnected && !fallbackTab.closing &&
          !fallbackTab.pinned && !fallbackTab.hasAttribute("zen-essential")) {
        gBrowser.selectedTab = fallbackTab;
        return;
      }

      // A second check catches tabs opened/closed while the close animation was
      // still finishing. If any normal tab exists, always prefer it to Essential.
      const anyNormal = getAnyNormalTab();
      if (anyNormal) {
        gBrowser.selectedTab = anyNormal;
        return;
      }

      // No normal tabs remain: use the existing blank/new tab when possible,
      // otherwise create exactly one homepage tab.
      openHomepageWithoutExtraBlank();
    };

    // Two passes make this robust against Zen's asynchronous tab selection.
    setTimeout(chooseNext, 0);
    setTimeout(chooseNext, 80);
  }

  function install() {
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) return setTimeout(install, 500);

    tabs.addEventListener("click", duplicateEssential, true);
    gBrowser.tabContainer.addEventListener("TabClose", handleTabClose, true);

    console.log(LOG, "Loaded 1.10.0");
  }

  install();
})();
