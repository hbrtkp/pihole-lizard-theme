# pihole-lizard-theme

A dark theme for the Pi-hole v6 web interface in the style of the *TheLizardWizard* guide
(Syne + JetBrains Mono), with an installer that survives Pi-hole updates.

**Version:** 1.1.0 · **Tested with:** pi-hole/web `master`, commit `fb699c4` (2026-10-17), Chart.js 4.5.1

## What the theme does

- boxes with a title bar and a green dot; dashboard statistics in one wide box — blocked
  percentage with a bar on the left, three counters next to it (each block is a link, the
  target is shown as a tooltip on hover),
- no top bar: "Toggle menu" and "Log out" live at the bottom of the sidebar,
- sidebar pinned to the top of the window, with the same height on every page (on the
  dashboard it ends level with the "Query Types" box and is never taller than the window);
  when an expanded submenu needs more room, the sidebar grows to fit it, so nothing has
  to be scrolled,
- no footer: the Pi-hole versions (Core, FTL, Web interface) are three tiles at the bottom
  of the sidebar; an amber tile means an update is available, clicking it opens the release
  notes (with `addons off` the regular footer comes back),
- page title in the same frame as the boxes,
- status panel with CPU temperature and blocklist age,
- charts: "Total queries" as a smooth area, "Client activity" as rounded bars, doughnuts with
  the value in the middle,
- no "Donate" entry; login page without the Documentation / GitHub / Discourse buttons and
  without the heart line.

## Install and update (same steps)

1. On the Pi, clone the repository (or copy the package files there any other way):

   ```bash
   git clone https://github.com/hbrtkp/pihole-lizard-theme.git
   ```

2. Run the installer:

   ```bash
   sudo bash ~/pihole-lizard-theme/pihole-theme.sh install
   ```

3. In the browser: `Ctrl+F5` on `http://pi.hole/admin`
4. Check:

   ```bash
   sudo pihole-theme doctor
   ```

To update later: `cd ~/pihole-lizard-theme && git pull && sudo bash pihole-theme.sh install`.
Settings (layout, accent, brand, status lines) are kept across updates.

The installer registers the `pihole-theme` command and keeps its files in `/opt/pihole-theme`
— the repository name and the command name differ on purpose.

## Commands

Available after installation as `sudo pihole-theme ...`:

| Command | Effect |
|---|---|
| `layout islands\|joined` | separate cards (default) / joined panels |
| `set accent '#rrggbb'` | accent colour (in quotes) |
| `set gap N` / `set radius N` | card spacing and corner radius in px (*islands* layout) |
| `set reset` | back to defaults |
| `brand "Name"` / `brand off` | text shown instead of "Pi-hole" (login page, phone) |
| `status-lines <lines>` | server status lines under the temperature: `clock resolver lists bans power` / `all` / `none` / `default` |
| `addons on\|off` | charts, favicon, temperature, server status, menu |
| `mail test` | send a test message |
| `mail <address>` / `off` / `default` | notification recipient (default `root`) / disable |
| `reapply` | re-apply the theme (after a manual `pihole -up`) |
| `status` | current settings |
| `doctor` | compatibility check against the installed Pi-hole version |
| `version` | package version |
| `restore` | back to the original interface |

Settings are stored in `/opt/pihole-theme` and survive Pi-hole updates.

## How it works

Pi-hole v6 has a fixed list of themes (built into FTL), so the theme takes over the slot of the
built-in "High contrast dark" theme. The original goes to `/opt/pihole-theme/*.orig`.
A Pi-hole update restores the stock files — a cron job (`/etc/cron.d/pihole-theme`) re-applies
the theme on Sundays at 3:20 and after boot.

### Mail notification

After the Sunday Pi-hole update and after boot, cron re-applies the theme and runs the check
(`doctor`). If the check fails — e.g. a new Pi-hole version changed the files the theme relies
on — a mail with the full result is sent. When everything is fine, no message is sent.

Delivery: the `mail` command (e.g. msmtp), recipient `root`, i.e. the address from
`/etc/aliases`. Test it with `sudo pihole-theme mail test`.

After a manual update (`pihole -up`) you still need to run `sudo pihole-theme reapply` —
a manual re-apply does not send mail.

## Add-ons (`pihole-theme-addons.js`)

They need one line in the footer template (`scripts/lua/footer.lp`) — the installer adds it,
restores it after an update and removes it on `addons off` and `restore`.

- **Charts** — smoothing joins the 10‑minute intervals with a curve; exact values are shown in
  the tooltip.
- **Temperature** — from `/api/info/sensors`, every 20 s. "Hot" threshold (default 60 °C):
  `sudo pihole-FTL --config webserver.api.temp.limit 70`
- **Server status** — by default the blocklist age plus a power warning when there is a
  problem. The other lines (`clock`, `resolver`, `bans`) are enabled with `status-lines`.
  A disabled line is not collected at all. Cron writes the data every minute to
  `style/themes/pihole-theme-status.json`; the file is readable on the local network without
  logging in and contains only states and numbers.
- **Menu** — the Pi-hole top bar holds the only logout button and the menu toggle, so the
  add-on adds both at the bottom of the sidebar. The bar is hidden only once those entries
  exist.
- **Favicon** — a rounded square with a ring in the theme colours.
- **Versions** — tiles with the version numbers at the bottom of the sidebar instead of the
  footer.
- **Tail log** — the box title is "Tail log" plus the file name instead of the `tail -F`
  command; in `pihole.log` every blocked line is red and highlighted — including the kinds
  Pi-hole does not colour itself (special domain, blocked upstream, blocks during CNAME
  inspection).

## Limitations

- The top bar stays on phones (below 768 px), in the `joined` layout and with `addons off` —
  without it you could not open the menu or log out there.
- Without the top bar there is no hostname and no menu with documentation links.
- `set accent` changes the accent green (dots, blocked percentage, active states); the chart
  palettes stay unchanged.
- Charts on pages other than the dashboard stay stock.
- Dashboard numbers are formatted by Pi-hole according to the browser language; the add-on
  only makes sure four-digit counters (dashboard and sidebar badges) get the same digit
  grouping as larger ones.
- Themed dropdowns need Chrome/Edge 135+; in other browsers they stay native.

## Files

| File | Contents |
|---|---|
| `lizard.css` | the theme |
| `lizard-syne.woff2`, `lizard-jbmono.woff2` | Syne and JetBrains Mono fonts |
| `pihole-theme-addons.js` | add-ons |
| `pihole-theme.sh` | installer / `pihole-theme` tool |
| `CHANGELOG.md` | change history |

## License

Theme code (CSS, JS, installer) — [MIT](LICENSE).

The [Syne](https://fonts.google.com/specimen/Syne) and
[JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) fonts are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/) and are not covered by the MIT license.
