# Essential Tab Opener — Sine 1.4.0

For Zen Browser 1.21.x.

## What it does

A plain left-click on an Essential Tab:

1. uses Firefox/Zen's native `gBrowser.duplicateTab()`;
2. creates the duplicate immediately after the source;
3. converts the duplicate from Essential/pinned to a normal tab with Zen's native `removeEssentials()`;
4. selects the new normal tab;
5. leaves the original Essential Tab unchanged.

Modifier clicks and clicks on tab action buttons are not intercepted.

## Sine 2.3.x format

This mod uses the Sine 2.3+ `scripts` metadata format. The script entry is an object with an `include` list; Sine's current engine loads `.uc.js` entries from `mod.scripts` and applies the include pattern to browser chrome windows.

## Important for GitHub/unpublished JS mods

Sine 2.3 introduced a security gate for JavaScript mods. If this repository is installed as an unpublished/untrusted GitHub mod rather than from the Sine Store, Sine may require:

`about:config` → `sine.allow-unsafe-js` → `true`

Restart Zen after changing that preference if the script does not load.

You can also disable the mod completely with Sine's main ON/OFF toggle. The optional preference is retained for compatibility but the Sine toggle is the primary enable/disable control.
