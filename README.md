# Essential Tab Opener 1.7.0

Sine mod for Zen Browser 1.21.14b.

## Behavior

A plain left click on an Essential Tab:
- duplicates it using native `gBrowser.duplicateTab()`;
- converts the duplicate to a normal tab using Zen's `removeEssentials()`;
- keeps the original Essential Tab button;
- unloads the original Essential Tab document from memory;
- selects the new normal tab.

When the generated normal duplicate is later closed:
- the next visible normal (non-pinned, non-essential) tab is selected;
- if no other normal tab exists, the browser homepage is opened.

Modifier clicks and tab action buttons keep Zen's normal behavior.

Requires `sine.allow-unsafe-js = true` for a GitHub/unpublished JavaScript mod.

## Animation

When a plain left-click opens an Essential Tab, the tab content is shown in a short floating animation that moves from the Essential Tabs area to the new normal tab. The original Essential Tab remains in place and is unloaded.


## Animation 1.7.0
The animation now moves the visual tab content from the Essential Tab to the normal-tab section while simultaneously scaling from the Essential Tab size to the exact normal-tab size.

## 1.8.0
Fixes Essential Tab favicon loss after unloading the original Essential Tab. The mod preserves and restores Zen's dedicated Essential icon state after `explicitUnloadTabs()`.
