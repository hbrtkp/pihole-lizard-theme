# pihole-lizard-theme — changelog

## 1.2.0 — 2026-11-16

- Dark / Light switch at the bottom of the sidebar: two icon buttons (moon / sun) in the
  space between "Log out" and the version tiles. The choice is kept per browser and applied before the page is painted
  (the installer adds a one-line script to header.lp), so a light page does not flash dark.
- Five light palettes: paper (default), sand, mint, slate, contrast — chosen on the Pi with
  `sudo pihole-theme set light <name>`; `status` shows it, `doctor` checks the header hook.
- Light palettes adapt shadows, tooltips, table tints, Network row colours and the chart
  palette. Audited on eight pages: every text meets a 4.5 : 1 contrast ratio (3 : 1 for
  icons, chart colours and large numbers).

## 1.1.0 — 2026-11-14

- Sidebar: when an expanded submenu (Settings, Tools) needs more room than the common
  sidebar height, the sidebar grows to fit it instead of scrolling the menu list; it shrinks
  back when the submenu is closed.
- Four-digit counters (dashboard and the sidebar badges) get the same digit grouping as
  larger numbers. In some languages (Polish among them) the browser groups digits only from
  five digits up, so "3962" stood next to "27 715"; the add-on inserts the separator the
  browser itself uses.
- Removed an unused `.not-used` rule left over from the stock theme.
- README shortened to install, check, update and uninstall.

## 1.0.0 — 2026-11-13

First public release.

### `lizard` theme
- Dark theme for the Pi-hole v6 web interface (Syne + JetBrains Mono): boxes with a title bar
  and a green dot, page title in the same frame as the boxes.
- Dashboard statistics in one wide box: blocked percentage with a bar on the left, three
  counters next to it; each block is a link, the target is shown as a tooltip.
- No top bar and no footer: "Toggle menu", "Log out" and the Pi-hole version tiles (Core, FTL,
  Web interface) sit at the bottom of the sidebar; an amber tile means an update is available.
- Sidebar pinned to the top of the window with the same height on every page; when an expanded
  submenu does not fit, only the menu list scrolls.
- `islands` layout (separate cards, default) or `joined` (joined panels); configurable accent,
  card spacing and corner radius, custom brand text instead of "Pi-hole".
- No "Donate" entry; login page without the Documentation / GitHub / Discourse buttons and
  without the heart line.

### Add-ons (`pihole-theme-addons.js`)
- Charts: "Total queries" as a smooth area, "Client activity" as rounded bars, doughnuts with
  the value in the middle.
- CPU temperature and server status (blocklist age, clock, resolver, bans, power) in the status
  panel; line selection with the `status-lines` command.
- Favicon in the theme colours.
- Tail log: readable box title and highlighting of every kind of block in `pihole.log`.

### Installer (`pihole-theme.sh`)
- The theme takes over the slot of the built-in "High contrast dark" theme; the original is
  kept in `/opt/pihole-theme`.
- Cron re-applies the theme after a Pi-hole update and after boot, and sends a mail
  notification when the `doctor` check fails.
- Commands: `install`, `layout`, `set`, `brand`, `status-lines`, `addons`, `mail`, `reapply`,
  `status`, `doctor`, `version`, `restore`.
