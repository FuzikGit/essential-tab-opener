(() => {
  "use strict";

  const PREF_ENABLED = "extensions.essentialtabopener.enabled";
  const LOG = "[Essential Tab Opener]";
  const duplicateOrigins = new WeakMap();
  const CLONE_ATTR = "data-essential-tab-opener-clone";
  const essentialIcons = new WeakMap();

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

  function cssIconToUrl(value) {
    if (!value) return "";
    const v = String(value).trim();
    if (!v || v === "none") return "";
    const match = v.match(/^url\(["']?(.*?)["']?\)$/);
    return match ? match[1] : v;
  }

  function captureEssentialIcon(tab) {
    if (!tab) return "";

    if (essentialIcons.has(tab)) {
      return essentialIcons.get(tab) || "";
    }

    let icon = tab.zenStaticIcon || "";
    if (!icon) icon = cssIconToUrl(tab.style.getPropertyValue("--zen-essential-tab-icon"));
    if (!icon) icon = tab.getAttribute("image") || "";

    // Last-resort: get the image from the current session state.
    if (!icon) {
      try {
        const state = JSON.parse(SessionStore.getTabState(tab));
        icon = state.image || "";
      } catch {}
    }

    essentialIcons.set(tab, icon || "");
    return icon || "";
  }

  function persistEssentialIcon(tab, iconUrl) {
    if (!tab || !iconUrl || !tab.isConnected) return;
    essentialIcons.set(tab, iconUrl);

    try {
      if (typeof gZenPinnedTabManager !== "undefined" &&
          gZenPinnedTabManager &&
          typeof gZenPinnedTabManager.setEssentialTabIcon === "function") {
        gZenPinnedTabManager.setEssentialTabIcon(tab, iconUrl);
      }
    } catch (e) {
      console.error(LOG, "setEssentialTabIcon failed:", e);
    }

    try {
      tab.setAttribute("image", iconUrl);
    } catch {}

    try {
      const state = JSON.parse(SessionStore.getTabState(tab));
      state.image = iconUrl;
      SessionStore.setTabState(tab, state);
    } catch (e) {
      console.error(LOG, "SessionStore icon persistence failed:", e);
    }
  }

  async function unloadEssential(tab) {
    try {
      if (!tab || !tab.isConnected || !tab.hasAttribute("zen-essential")) return;
      if (tab.hasAttribute("pending")) return;

      // IMPORTANT: keep the first known Essential icon forever for this tab.
      const iconUrl = captureEssentialIcon(tab);

      const successful = await gBrowser.explicitUnloadTabs([tab]);
      if (!successful) {
        console.warn(LOG, "explicitUnloadTabs returned false");
        return;
      }

      if (!tab.isConnected || !tab.hasAttribute("zen-essential")) return;

      // Restore only after native unload has completed.
      if (iconUrl) persistEssentialIcon(tab, iconUrl);
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
        const fromCenterX = from.left + from.width / 2;
        const fromCenterY = from.top + from.height / 2;
        const toCenterX = to.left + to.width / 2;
        const toCenterY = to.top + to.height / 2;
        const dx = toCenterX - fromCenterX;
        const dy = toCenterY - fromCenterY;
        const scaleX = to.width / from.width;
        const scaleY = to.height / from.height;

        clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})`;

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
      newTab.setAttribute(CLONE_ATTR, "true");
      gBrowser.selectedTab = newTab;
      animateEssentialToNormal(sourceTab, newTab);
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

    // Capture icon BEFORE the duplicate/unload sequence changes anything.
    captureEssentialIcon(sourceTab);

    try {
      const newTab = gBrowser.duplicateTab(sourceTab, true);
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
      !tab.pinned && !tab.hasAttribute("zen-essential") && !tab.closing;
  }

  function getNearestNormalTab(closingTab) {
    const tabs = Array.from(gBrowser.tabs || []);
    const index = tabs.indexOf(closingTab);
    if (index < 0) return null;

    for (let i = index + 1; i < tabs.length; i++) {
      if (isNormalOpenTab(tabs[i], closingTab)) return tabs[i];
    }
    for (let i = index - 1; i >= 0; i--) {
      if (isNormalOpenTab(tabs[i], closingTab)) return tabs[i];
    }
    return null;
  }

  function getAnyNormalTab(excludeTab = null) {
    return Array.from(gBrowser.tabs || []).find(tab =>
      isNormalOpenTab(tab, excludeTab)
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

  function selectOrOpenFallback(targetTab) {
    if (targetTab && targetTab.isConnected && !targetTab.closing &&
        !targetTab.pinned && !targetTab.hasAttribute("zen-essential")) {
      gBrowser.selectedTab = targetTab;
      return true;
    }

    const anyNormal = getAnyNormalTab();
    if (anyNormal) {
      gBrowser.selectedTab = anyNormal;
      return true;
    }

    // No ordinary tabs left: use the current ordinary blank tab if Zen created one,
    // otherwise create exactly one normal homepage tab.
    const current = gBrowser.selectedTab;
    if (current && !current.pinned && !current.hasAttribute("zen-essential") && isBlankTab(current)) {
      current.linkedBrowser.loadURI(getHomepage(), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
      });
      return true;
    }

    gBrowser.addTab(getHomepage(), { inBackground: false });
    return true;
  }

  function chooseNormalNeighbour(closingTab) {
    const tabs = Array.from(gBrowser.tabs || []);
    const index = tabs.indexOf(closingTab);
    if (index < 0) return getAnyNormalTab(closingTab);

    // Prefer the tab immediately to the right, then to the left.
    for (let i = index + 1; i < tabs.length; i++) {
      if (isNormalOpenTab(tabs[i], closingTab)) return tabs[i];
    }
    for (let i = index - 1; i >= 0; i--) {
      if (isNormalOpenTab(tabs[i], closingTab)) return tabs[i];
    }
    return null;
  }

  function getHomepageTabOrCreate() {
    const blank = Array.from(gBrowser.tabs || []).find(tab =>
      isNormalOpenTab(tab) && isBlankTab(tab)
    );
    if (blank) return blank;

    return gBrowser.addTab(getHomepage(), {
      inBackground: true,
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
    });
  }

  function closeCloneBeforeZenHandlesIt(closingTab) {
    if (!closingTab || !closingTab.hasAttribute(CLONE_ATTR)) return false;

    const target = chooseNormalNeighbour(closingTab);

    // If another normal tab exists, select it BEFORE removing the clone.
    if (target) {
      gBrowser.selectedTab = target;
      gBrowser.removeTab(closingTab);
      return true;
    }

    // No other normal tab exists. Create/select the homepage first, then close
    // the clone. This prevents Zen from falling back to an Essential Tab or an
    // empty transient page.
    const homeTab = getHomepageTabOrCreate();
    gBrowser.selectedTab = homeTab;
    gBrowser.removeTab(closingTab);
    return true;
  }

  function handleCloneCloseClick(event) {
    if (!isPlainLeftClick(event)) return;
    if (!(event.target instanceof Element)) return;

    const closeButton = event.target.closest(".tab-close-button");
    if (!closeButton) return;

    const tab = closeButton.closest("tab.tabbrowser-tab");
    if (!tab || !tab.hasAttribute(CLONE_ATTR)) return;

    // Take control before Zen's own close command/selection logic runs.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    duplicateOrigins.delete(tab);
    closeCloneBeforeZenHandlesIt(tab);
  }

  function handleCloneMiddleClick(event) {
    if (!(event.target instanceof Element)) return;
    if (event.button !== 1) return;

    const tab = event.target.closest("tab.tabbrowser-tab");
    if (!tab || !tab.hasAttribute(CLONE_ATTR)) return;

    // Middle-clicking a tab closes it in Zen/Firefox. Apply the same safe
    // selection logic before removing our generated clone.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    duplicateOrigins.delete(tab);
    closeCloneBeforeZenHandlesIt(tab);
  }

  function install() {
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) return setTimeout(install, 500);

    tabs.addEventListener("click", handleCloneCloseClick, true);
    tabs.addEventListener("click", duplicateEssential, true);
    tabs.addEventListener("auxclick", handleCloneMiddleClick, true);

    console.log(LOG, "Loaded 1.14.0");
  }

  install();
})();
