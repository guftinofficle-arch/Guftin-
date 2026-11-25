# Chat menu feature module

Extraction target for the chat three-dot anchored popover.

Planned modules:
- `ChatActionMenu.tsx`: compact anchored menu.
- `chatMenuActions.ts`: typed action registry mapped to existing handlers.

Compatibility rule: every current menu action must remain connected to its existing handler. The menu must dismiss on outside tap without changing action semantics.
