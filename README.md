# Essential Tab Opener 1.13.0

Sine JavaScript mod for Zen Browser 1.21.14b.

## Behavior

- Plain left-click on an Essential Tab creates a normal duplicate.
- The original Essential Tab remains in the Essential section and is unloaded.
- The Essential icon is preserved across repeated use and browser restarts.
- The duplicate is selected.
- When a duplicate created by this mod is closed, Zen selects the nearest normal tab instead of an Essential tab.
- If no other normal tab exists, the current blank normal tab is reused for the homepage; otherwise one homepage tab is created.
- Modifier clicks and tab action buttons retain native behavior.


## 1.14.0
Close handling for generated normal tabs is intercepted before Zen's native selection, so closing a generated tab selects the nearest normal tab first. Middle-click is handled the same way.
