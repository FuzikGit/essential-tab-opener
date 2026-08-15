# Essential Tab Opener 1.5.0

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
