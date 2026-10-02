# Tern AI frontend audit

The existing application now uses a shared dark-first interface for chat and every router dashboard screen. Routing endpoints, provider adapters, authentication, PostgreSQL storage, GTPS retrieval, Lua validation and repair remain unchanged.

## Components

Added `Select` (searchable combobox/listbox), `BottomSheet`, `Overlay`, `Dropdown`, `UIProvider` (toasts, text dialogs, confirmations), `SecretInput`, `Form`, `ResponsiveSidebar`, and an extracted chat `RouterSelector`. Reworked `Modal`, `Drawer`, `Button`, `Badge`, `EmptyState`, provider cards and drawers, pool editor, routing graph, model catalog and request tables. Design tokens, controls, overlays and screen refinements live in separate stylesheets.

Pickers use DOM elements on desktop and a custom mobile sheet. Overlays trap focus, restore the trigger, close with Escape or backdrop, lock background scrolling, and make the background inert. Destructive actions require a custom dialog. Form errors are rendered inline. Toasts stack, dismiss automatically, pause while focused/hovered, and report copy failures honestly. Stored credentials are never fetched into the secret visibility control.

## Coverage

Audited all ten screens: Chats, Providers, Proxy Pools, Routing, Models, Usage, Quota, Requests, GTPS API and Settings. Sidebar navigation, provider/account details, local history actions, file controls, chat composer, code/artifacts, settings, filters and empty/loading/error states were included.

| Check | Result |
| --- | --- |
| Native application select / option / datalist | 0 / 0 / 0 |
| Browser alert / confirm / prompt calls | 0 / 0 / 0 |
| `node scripts/audit-native-ui.mjs` | Passed; AST audit across frontend source |
| `npm run lint` | Passed, including web typecheck |
| `npm run typecheck` | Passed |
| `npm test` | 117 passed |
| `npm run build` | Passed, including Next production prerender |
| `npx playwright test` | 17 passed |
| Viewport widths | 320, 360, 375, 390, 412, 430, 768, 1024, 1440 |

Playwright covers model search, account/provider grouping, exact model selection, preferred provider and pool persistence, keyboard navigation, scroll, Escape, backdrop, focus restoration, nested dialogs, secret masking, form validation, confirmation cancellation/acceptance, error and success toasts, pool ordering, every screen's horizontal overflow, chat streaming/cancellation, file handling, history, GTPS references and legacy browser credential removal.

## Screenshot review

These screenshots use explicit **test-only UI fixtures**, including synthetic health/latency/usage data. They are visual QA evidence, not proof of live provider inference. Fixtures are confined to Playwright interception and never imported by application code.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Chat | [Screenshot](qa/ui/audit-chat-1440.png) | [Screenshot](qa/ui/audit-chat-390.png) |
| Providers | [Screenshot](qa/ui/audit-providers-1440.png) | [Screenshot](qa/ui/audit-providers-390.png) |
| Model picker | [Screenshot](qa/ui/model-picker-desktop.png) | [Screenshot](qa/ui/model-picker-mobile-390.png) |
| Provider drawer | [Screenshot](qa/ui/audit-provider-drawer-desktop.png) | [Screenshot](qa/ui/audit-provider-drawer-mobile.png) |
| Settings | — | [Screenshot](qa/ui/audit-settings-390.png) |
| Routing | [Screenshot](qa/ui/audit-routing-1440.png) | — |
| Usage | — | [Screenshot](qa/ui/audit-usage-390.png) |
| Requests | [Screenshot](qa/ui/audit-requests-1440.png) | — |
| Models | — | [Screenshot](qa/ui/audit-models-390.png) |
| Proxy pools | — | [Screenshot](qa/ui/audit-pools-390.png) |
| Quota | — | [Screenshot](qa/ui/audit-quota-390.png) |
| GTPS API | — | [Screenshot](qa/ui/audit-apis-390.png) |

## Limits

Browser testing uses desktop Chromium and mobile viewport emulation, not physical Android/iOS devices or a screen reader. The operating system file chooser remains necessary for user-authorized attachments; its input is visually hidden behind an accessible product button. Provider availability and inference quality were not changed by this UI work. No new provider runtime verification is claimed from UI fixtures. Existing routes are retained, including query-based dashboard navigation and the `/providers` redirect.
