# pihole-lizard-theme — changelog

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
