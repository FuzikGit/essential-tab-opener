# Essential Tab Opener

Sine JavaScript mod for Zen Browser.

## What it does

Plain left-click on an Essential Tab:

- prevents Zen from only switching to the Essential Tab;
- duplicates the Essential Tab using `gBrowser.duplicateTab()`;
- converts the duplicate to a normal, unpinned tab using Zen's `removeEssentials()` when available;
- selects the new normal tab;
- leaves the original Essential Tab untouched.

Modifier clicks and clicks on tab action buttons are not intercepted.

## Sine

This mod uses the standard Sine JS-mod metadata pattern used by existing Sine-compatible Zen mods (`theme.json` with `"js": true`).

Enable or disable the feature using the mod preference:
`extensions.essentialtabopener.enabled`
