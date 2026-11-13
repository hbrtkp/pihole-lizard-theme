#!/bin/bash
# ============================================================================
# pihole-theme.sh — "lizard" theme for Pi-hole v6
#
# Dark theme in the style of the TheLizardWizard guide (Syne + JetBrains Mono):
# boxes with a title bar and a green dot, statistics tiles as small boxes, no top
# bar (logout and menu toggle live at the bottom of the sidebar).
#
# Pi-hole v6 has a fixed list of themes (built into FTL), so this theme takes
# over the SLOT of the built-in dark theme "high-contrast-dark".
# "pihole updatePihole" restores the stock interface files — the installer
# adds a cron job that re-applies the theme after an update.
#
# Add-ons (pihole-theme-addons.js): chart skin, favicon, CPU temperature and
# server status in the status panel. They need one line in
# scripts/lua/footer.lp — the installer adds it and restores it after an update.
#
# Usage (as root):
#   sudo bash pihole-theme.sh install            # install / update
#   sudo pihole-theme layout islands|joined      # separate cards / joined panels
#   sudo pihole-theme set accent '#hex' | gap N | radius N | reset
#   sudo pihole-theme brand "Name" | off         # header text instead of "Pi-hole"
#   sudo pihole-theme addons on|off              # charts, favicon, temperature, server status
#   sudo pihole-theme status-lines lists bans ...  # which server status lines to collect and show
#   sudo pihole-theme mail test | <address> | off | default   # notification when the theme does not come back
#   sudo pihole-theme reapply | status | doctor | version | restore
# ============================================================================
set -u

VERSION="1.0.0"
TESTED_WEB="pi-hole/web master, commit fb699c4 (2026-10-17), Chart.js 4.5.1"
MARKER="pihole-theme"
STORE="${STORE:-/opt/pihole-theme}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/pihole-theme}"
BIN_LINK="${BIN_LINK:-/usr/local/bin/pihole-theme}"
CSS="lizard.css"
SLOT="high-contrast-dark"
ADDON_JS="pihole-theme-addons.js"
ADDON_MARK="pihole-theme-addons"
STATUS_JSON="pihole-theme-status.json"
SELF="$(readlink -f "$0")"
SRC_DIR="$(dirname "$SELF")"

say() { [ "${QUIET:-0}" = 1 ] || echo "$@"; }
die() { echo "ERROR: $*" >&2; exit 1; }
need_root() { [ "$(id -u)" = 0 ] || die "run with sudo"; }
opt() { cat "$STORE/$1" 2> /dev/null || echo "${2:-}"; }

installed() { [ -f "$STORE/active" ]; }

theme_dir() {
  # Web interface path from the FTL config (default /var/www/html + /admin/)
  local root home
  root="${WEBROOT:-$(pihole-FTL --config webserver.paths.webroot 2> /dev/null)}"
  home="${WEBHOME:-$(pihole-FTL --config webserver.paths.webhome 2> /dev/null)}"
  root="${root:-/var/www/html}"; home="${home:-/admin/}"
  echo "${root%/}/${home#/}style/themes" | sed 's#//*#/#g'
}
admin_dir() { dirname "$(dirname "$1")"; }
footer_lp() { echo "$(admin_dir "$1")/scripts/lua/footer.lp"; }
is_ours() { [ -f "$1" ] && grep -q "$MARKER" "$1"; }

# Mix a #rrggbb colour with another one in the given ratio (0-100 of the first).
# Pure bash: the default awk on Raspberry Pi OS (mawk) has no strtonum.
mix() {
  local a="${1#\#}" b="${2#\#}" p="$3"
  printf '#%02x%02x%02x\n' \
    $(( (16#${a:0:2} * p + 16#${b:0:2} * (100 - p)) / 100 )) \
    $(( (16#${a:2:2} * p + 16#${b:2:2} * (100 - p)) / 100 )) \
    $(( (16#${a:4:2} * p + 16#${b:4:2} * (100 - p)) / 100 ))
}

# Build the CSS file to deploy from the source theme and the stored settings:
# layout (islands/joined), parameters (accent, gap, radius), brand
build_css() {
  local css="$1" out="$STORE/.active.css" tmp="$STORE/.active.tmp" k v accent brand size
  cp -f "$STORE/$css" "$tmp"
  if [ "$(opt layout islands)" = "joined" ]; then
    sed -i '/>>> layout:islands/,/<<< layout:islands/d' "$tmp"
  fi
  if [ -s "$STORE/params" ]; then
    {
      echo ""
      echo "/* Parameters set with: pihole-theme set ... */"
      echo ":root {"
      while IFS='=' read -r k v; do
        case "$k" in
          accent)
            accent="$v"
            echo "  --theme-accent: $accent;"
            echo "  --theme-accent-dark: $(mix "$accent" "#000000" 75);"
            echo "  --theme-accent-tint: $(mix "$accent" "#ffffff" 8);"
            echo "  --theme-accent-shade: $(mix "$accent" "#0d1117" 24);"
            echo "  --theme-accent-bright: $(mix "$accent" "#ffffff" 82);"
            ;;
          gap) echo "  --theme-gap: ${v}px;" ;;
          radius) echo "  --theme-radius: ${v}px;" ;;
        esac
      done < "$STORE/params"
      echo "}"
    } >> "$tmp"
  fi
  brand="$(opt brand)"
  if [ -n "$brand" ]; then
    # longer name -> smaller font so it fits the logo card (230 px, also in the
    # wide Syne face: 15 characters at 15 px took 208 px of the 200 px available)
    size=20; [ "${#brand}" -gt 10 ] && size=17; [ "${#brand}" -gt 14 ] && size=14; [ "${#brand}" -gt 18 ] && size=12
    cat >> "$tmp" << EOF

/* Brand set with: pihole-theme brand "..." (text instead of "Pi-hole") */
.main-header .logo .logo-lg,
.login-logo .logo-lg {
  font-size: 0 !important;
}
.main-header .logo {
  padding: 0 10px;
}
.main-header .logo .logo-lg::after {
  content: "$brand";
  font-size: ${size}px;
  /* guard for very long names: ellipsis instead of overflowing the card.
     inline-block, not block: the zeroed "Pi-hole" text still occupies the 50 px line,
     so a block element would drop below the clipped edge of the card */
  display: inline-block;
  max-width: 100%;
  vertical-align: top;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.login-logo .logo-lg::after {
  content: "$brand";
  font-size: 25px;
}
EOF
  fi
  mv -f "$tmp" "$out"
  echo "$out"
}

# Restore the original built-in theme in the given slot (from the backup or from the repo)
restore_slot() {
  local tdir="$1" slot="$2"
  is_ours "$tdir/$slot.css" || return 0
  if [ -f "$STORE/$slot.css.orig" ]; then
    cp -f "$STORE/$slot.css.orig" "$tdir/$slot.css"
  else
    git -C "$(admin_dir "$tdir")" checkout -- "style/themes/$slot.css" 2> /dev/null || return 1
  fi
  chown --reference="$tdir" "$tdir/$slot.css" 2> /dev/null
  return 0
}

# Remove the add-on line from the footer, the script file and the server status file
addons_remove() {
  local tdir="$1" lp
  lp="$(footer_lp "$tdir")"
  [ -f "$lp" ] && grep -q "$ADDON_MARK" "$lp" && sed -i "/$ADDON_MARK/d" "$lp"
  rm -f "$tdir/$ADDON_JS" "$tdir/$STATUS_JSON"
  return 0
}

# Deploy the add-on script and add the line loading it right after the footer.js line (idempotent)
addons_apply() {
  local tdir="$1" lp
  [ "$(opt addons on)" = "off" ] && { addons_remove "$tdir"; return 0; }
  [ -f "$STORE/$ADDON_JS" ] || return 0
  lp="$(footer_lp "$tdir")"
  cp -f "$STORE/$ADDON_JS" "$tdir/$ADDON_JS"
  chown --reference="$tdir" "$tdir/$ADDON_JS" 2> /dev/null; chmod 644 "$tdir/$ADDON_JS"
  [ -f "$lp" ] || { say "  [i] $lp not found — add-ons skipped"; return 0; }
  grep -q "$ADDON_MARK" "$lp" && return 0
  if grep -q "scripts/js/footer.js" "$lp"; then
    sed -i "/scripts\/js\/footer.js/a <script src=\"<?=pihole.fileversion('style/themes/$ADDON_JS')?>\"></script>" "$lp"
  else
    say "  [i] Unknown footer.lp layout — add-ons skipped (the theme works normally, with stock charts)"
  fi
  return 0
}

copy_into_slot() {
  local tdir="$1" slot="$SLOT" css="$CSS" f
  [ -d "$tdir" ] || die "themes directory not found: $tdir (is this Pi-hole v6?)"
  installed || die "theme is not installed — run 'install' first"
  [ -f "$STORE/$css" ] || die "missing file $STORE/$css"
  # Back up the original — only if the slot does NOT already hold our theme
  if [ -f "$tdir/$slot.css" ] && ! is_ours "$tdir/$slot.css"; then
    cp -f "$tdir/$slot.css" "$STORE/$slot.css.orig"
  fi
  cp -f "$(build_css "$css")" "$tdir/$slot.css"
  for f in "$STORE"/lizard-*.woff2; do
    [ -f "$f" ] || continue
    cp -f "$f" "$tdir/"; chown --reference="$tdir" "$tdir/$(basename "$f")" 2> /dev/null; chmod 644 "$tdir/$(basename "$f")"
  done
  chown --reference="$tdir" "$tdir/$slot.css" 2> /dev/null
  chmod 644 "$tdir/$slot.css"
  addons_apply "$tdir"
  return 0
}

write_cron() {
  cat > "$CRON_FILE" << EOF
# Custom Pi-hole theme: 'pihole updatePihole' restores the stock interface files
20 3 * * 0 root QUIET=1 $STORE/pihole-theme.sh cron-reapply
@reboot root sleep 120 && QUIET=1 $STORE/pihole-theme.sh cron-reapply
# Server status for the status panel (clock, resolver, list age, bans) - every minute
* * * * * root QUIET=1 $STORE/pihole-theme.sh write-status
EOF
  chmod 644 "$CRON_FILE"
}

cmd_install() {
  need_root
  local tdir f css="$CSS" slot="$SLOT"
  tdir="$(theme_dir)"
  mkdir -p "$STORE"
  # Copy the package files (theme, fonts, add-on) to the permanent directory
  if [ "$SRC_DIR" != "$STORE" ]; then
    for f in "$SRC_DIR"/lizard.css "$SRC_DIR"/lizard-*.woff2 "$SRC_DIR/$ADDON_JS"; do
      [ -f "$f" ] && cp -f "$f" "$STORE/"
    done
    cp -f "$SELF" "$STORE/pihole-theme.sh"
  fi
  [ -f "$STORE/$css" ] || die "missing file $css (it must sit next to the script)"
  chmod 755 "$STORE/pihole-theme.sh"
  ln -sf "$STORE/pihole-theme.sh" "$BIN_LINK"
  echo lizard > "$STORE/active"
  [ -f "$STORE/addons" ] || echo on > "$STORE/addons"
  [ -f "$STORE/layout" ] || echo islands > "$STORE/layout"

  copy_into_slot "$tdir" || exit 1
  say "  [✓] Lizard theme deployed to slot: $tdir/$slot.css"
  if [ "$(opt addons)" = "on" ] && grep -q "$ADDON_MARK" "$(footer_lp "$tdir")" 2> /dev/null; then
    say "  [✓] Add-ons enabled: charts, favicon, temperature, server status, menu"
  fi
  write_cron
  say "  [✓] Cron: $CRON_FILE"
  cmd_write_status

  if command -v pihole-FTL > /dev/null 2>&1; then
    if pihole-FTL --config webserver.interface.theme "$slot" > /dev/null 2>&1; then
      say "  [✓] Theme enabled (webserver.interface.theme = $slot)"
    else
      say "  [i] Enable it manually: Settings -> Web interface / API -> Theme -> $slot"
    fi
  fi
  say ""
  say "Done (pihole-theme $VERSION). Reload the web interface bypassing the cache (Ctrl+F5)."
  say "Layout:   sudo pihole-theme layout islands|joined      (now: $(opt layout))"
  say "Check:    sudo pihole-theme doctor     Back to stock: sudo pihole-theme restore"
}

cmd_reapply() {
  need_root
  local tdir css="$CSS" slot="$SLOT"
  tdir="$(theme_dir)"
  installed || die "theme is not installed — run 'install' first"
  if [ -f "$tdir/$slot.css" ] && cmp -s "$(build_css "$css")" "$tdir/$slot.css"; then
    # CSS is in place; the add-on may have vanished on its own (e.g. only footer.lp was replaced)
    if [ "$(opt addons on)" = "off" ] || grep -q "$ADDON_MARK" "$(footer_lp "$tdir")" 2> /dev/null; then
      say "  [✓] Theme is in place — nothing to do"; return 0
    fi
  fi
  copy_into_slot "$tdir" || exit 1
  logger -t pihole-theme "theme re-applied to $tdir/$slot.css" 2> /dev/null
  say "  [✓] Theme re-applied"
}

# --- Mail notification -----------------------------------------------------
# Recipient: the "mail" setting or root by default (msmtp expands it through
# /etc/aliases). Sent the same way as other system notifications:
# mail -s "[hostname] ..." address.
mail_to() { local v; v="$(opt mailto)"; echo "${v:-root}"; }
send_mail() {
  local subject="$1" body="$2" to
  to="$(mail_to)"
  [ "$to" = "off" ] && return 0
  if command -v mail > /dev/null 2>&1; then
    printf '%s\n' "$body" | mail -s "$subject" "$to"
  elif command -v sendmail > /dev/null 2>&1; then
    printf 'To: %s\nSubject: %s\n\n%s\n' "$to" "$subject" "$body" | sendmail -t
  else
    return 1
  fi
}

# Run from cron (after the Sunday Pi-hole update and after boot): re-apply the
# theme, check that everything still has something to hook into, and send a mail
# ONLY when the check reports an error - e.g. a new Pi-hole version changed the
# files the theme relies on.
cmd_cron_reapply() {
  need_root
  local out report rc
  out="$(QUIET=0 cmd_reapply 2>&1)" || true
  report="$(cmd_doctor 2>&1)"; rc=$?
  [ "$rc" -eq 0 ] && return 0
  logger -t pihole-theme "check after re-apply reports errors — sending notification" 2> /dev/null
  send_mail "[$(hostname)] Pi-hole: web interface theme did not come back after the update" "The Pi-hole web interface theme was not re-applied correctly after an update or after boot.
DNS and blocking work independently of the theme - this only affects the look of the web interface.

Re-apply:
$out

Check (sudo pihole-theme doctor):
$report

What you can do:
  sudo pihole-theme reapply      try again
  sudo pihole-theme addons off   keep the look only, without charts and indicators
  sudo pihole-theme restore      go back to the stock Pi-hole interface
To disable these notifications: sudo pihole-theme mail off"
  return 0
}

cmd_mail() {
  need_root; [ -f "$STORE/active" ] || die "theme is not installed — run 'install' first"
  case "${1:-}" in
    test)
      [ "$(mail_to)" = "off" ] && die "notifications are disabled (enable with: pihole-theme mail default)"
      if send_mail "[$(hostname)] Pi-hole: theme notification test" "This is a test message from pihole-theme $VERSION.
This is how you will be notified if the web interface theme cannot be re-applied after a Pi-hole update."; then
        say "  [✓] Test message sent to: $(mail_to) — check your inbox (and spam)"
      else
        die "sending failed — no mail/sendmail command or a delivery error (check /var/log/msmtp.log)"
      fi ;;
    off) echo off > "$STORE/mailto"; say "  [✓] Mail notifications disabled" ;;
    default) rm -f "$STORE/mailto"; say "  [✓] Mail notifications: to $(mail_to) (default)" ;;
    "") die "usage: pihole-theme mail test | <address> | off | default" ;;
    *)
      echo "$1" | grep -Eq '^[A-Za-z0-9._%+-]+(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?$' || die "this does not look like an e-mail address or a user name: $1"
      echo "$1" > "$STORE/mailto"; say "  [✓] Mail notifications: to $1" ;;
  esac
}

# Change one setting + rebuild and re-deploy the CSS
apply_option() {
  need_root
  [ -f "$STORE/active" ] || die "theme is not installed — run 'install' first"
  copy_into_slot "$(theme_dir)" || exit 1
}

cmd_layout() {
  case "${1:-}" in islands | joined) ;; *) die "usage: pihole-theme layout islands|joined" ;; esac
  need_root; [ -f "$STORE/active" ] || die "theme is not installed — run 'install' first"
  echo "$1" > "$STORE/layout"; apply_option
  say "  [✓] Layout: $1 (Ctrl+F5 in the browser)"
}

cmd_set() {
  local key="${1:-}" val="${2:-}"
  need_root; [ -f "$STORE/active" ] || die "theme is not installed — run 'install' first"
  case "$key" in
    reset) rm -f "$STORE/params"; apply_option; say "  [✓] Parameters reset to defaults"; return 0 ;;
    accent) echo "$val" | grep -Eq '^#[0-9a-fA-F]{6}$' || die "accent as #rrggbb, e.g. '#ff8800' (in quotes)" ;;
    gap) echo "$val" | grep -Eq '^[0-9]{1,2}$' && [ "$val" -ge 4 ] && [ "$val" -le 40 ] || die "card gap: a number 4-40 (px)" ;;
    radius) echo "$val" | grep -Eq '^[0-9]{1,2}$' && [ "$val" -le 40 ] || die "card radius: a number 0-40 (px)" ;;
    *) die "usage: pihole-theme set accent '#rrggbb' | gap N | radius N | reset" ;;
  esac
  touch "$STORE/params"
  grep -v "^$key=" "$STORE/params" > "$STORE/params.tmp" || true
  echo "$key=$val" >> "$STORE/params.tmp"; mv -f "$STORE/params.tmp" "$STORE/params"
  apply_option
  say "  [✓] $key = $val (Ctrl+F5 in the browser)"
}

cmd_brand() {
  local name="${1:-}"
  need_root; [ -f "$STORE/active" ] || die "theme is not installed — run 'install' first"
  [ -n "$name" ] || die "usage: pihole-theme brand \"Name\" | off"
  if [ "$name" = "off" ]; then
    rm -f "$STORE/brand"; apply_option; say "  [✓] Brand disabled — text \"Pi-hole\""; return 0
  fi
  # the name goes into the CSS as a quoted string: safe characters only, up to 24
  echo "$name" | grep -Eq '^[A-Za-z0-9 ._-]{1,24}$' || die "name: ASCII letters, digits, space, dot, underscore, hyphen; up to 24 characters"
  echo "$name" > "$STORE/brand"; apply_option
  say "  [✓] Brand: \"$name\" (Ctrl+F5 in the browser)"
}

cmd_addons() {
  need_root
  local tdir; tdir="$(theme_dir)"
  case "${1:-}" in
    on) echo on > "$STORE/addons"; addons_apply "$tdir"; cmd_write_status; say "  [✓] Add-ons enabled (Ctrl+F5 in the browser)" ;;
    off) echo off > "$STORE/addons"; addons_remove "$tdir"; say "  [✓] Add-ons disabled: stock charts, no temperature or server status" ;;
    *) die "usage: pihole-theme addons on|off" ;;
  esac
}

# Server status lines: explicit setting (status-lines) or the default - list age and
# a power warning when there is a problem. A line not listed here is not collected.
STATUS_KEYS="clock resolver lists bans power"
STATUS_DEFAULT="lists power"
status_lines() {
  local v
  v="$(opt statuslines)"
  echo "${v:-$STATUS_DEFAULT}"
}
want() { case " $(status_lines) " in *" $1 "*) return 0 ;; esac; return 1; }

cmd_status_lines() {
  local k keys=""
  need_root; [ -f "$STORE/active" ] || die "theme is not installed — run 'install' first"
  [ $# -gt 0 ] || die "usage: pihole-theme status-lines clock resolver lists bans power | all | none | default"
  case "$1" in
    all) keys="$STATUS_KEYS" ;;
    none) keys="none" ;;
    default) rm -f "$STORE/statuslines"; cmd_write_status; say "  [✓] Server status lines: default ($(status_lines))"; return 0 ;;
    *)
      for k in "$@"; do
        case " $STATUS_KEYS " in *" $k "*) keys="$keys $k" ;; *) die "unknown line '$k' (allowed: $STATUS_KEYS)" ;; esac
      done
      keys="${keys# }" ;;
  esac
  echo "$keys" > "$STORE/statuslines"
  cmd_write_status
  say "  [✓] Server status lines: $keys (the panel refreshes within a minute)"
}

# Write the server status to a JSON file read by the add-on (from cron, every minute).
# Every field is optional: missing tool = missing field, no error.
cmd_write_status() {
  local tdir out tmp clock dns lists bans f2b cs detail power now v
  tdir="$(theme_dir)"; out="$tdir/$STATUS_JSON"
  if [ "$(opt addons on)" = "off" ] || [ ! -d "$tdir" ]; then rm -f "$out"; return 0; fi
  now="$(date +%s)"; tmp="$out.tmp"
  clock=""; dns=""; lists=""; bans=""; detail=""; power=""
  if want clock && command -v timedatectl > /dev/null 2>&1; then
    v="$(timedatectl show -p NTPSynchronized --value 2> /dev/null)"
    [ "$v" = "yes" ] && clock="synced"; [ "$v" = "no" ] && clock="unsynced"
  fi
  if want resolver && command -v dig > /dev/null 2>&1; then
    if [ -n "$(dig +time=2 +tries=1 +short pi-hole.net @127.0.0.1 2> /dev/null | head -1)" ]; then dns="ok"; else dns="fail"; fi
  fi
  if want lists && [ -f /etc/pihole/gravity.db ]; then
    lists="$(( (now - $(stat -c %Y /etc/pihole/gravity.db)) / 3600 ))"
  fi
  if want bans && command -v fail2ban-client > /dev/null 2>&1; then
    f2b="$(fail2ban-client status sshd 2> /dev/null | awk -F: '/Currently banned/ {gsub(/[^0-9]/,"",$2); print $2}')"
  fi
  if want bans && command -v cscli > /dev/null 2>&1; then
    cs="$(cscli decisions list -o raw 2> /dev/null | tail -n +2 | grep -c . )"
  fi
  if [ -n "${f2b:-}" ] || [ -n "${cs:-}" ]; then
    bans="$(( ${f2b:-0} + ${cs:-0} ))"
    detail="Fail2Ban: ${f2b:-n/a}, CrowdSec: ${cs:-n/a}"
  fi
  if want power && command -v vcgencmd > /dev/null 2>&1; then
    v="$(vcgencmd get_throttled 2> /dev/null | cut -d= -f2)"
    if [ "$v" = "0x0" ]; then power="ok"; elif [ -n "$v" ]; then power="$v"; fi
  fi
  {
    printf '{"ts":%s' "$now"
    [ -n "$clock" ] && printf ',"clock":"%s"' "$clock"
    [ -n "$dns" ] && printf ',"dns":"%s"' "$dns"
    [ -n "$lists" ] && printf ',"lists_age_h":%s' "$lists"
    [ -n "$bans" ] && printf ',"bans":%s,"bans_detail":"%s"' "$bans" "$detail"
    [ -n "$power" ] && printf ',"power":"%s"' "$power"
    printf '}\n'
  } > "$tmp"
  chown --reference="$tdir" "$tmp" 2> /dev/null; chmod 644 "$tmp"
  mv -f "$tmp" "$out"
}

cmd_restore() {
  need_root
  local tdir s="$SLOT"
  tdir="$(theme_dir)"
  if is_ours "$tdir/$s.css"; then
    if restore_slot "$tdir" "$s"; then say "  [✓] Original $s.css restored"
    else say "  [i] No backup of $s.css — the next 'pihole -up' will restore it"; fi
  fi
  addons_remove "$tdir"
  rm -f "$tdir"/lizard-*.woff2 "$CRON_FILE" "$BIN_LINK" "$STORE/active" "$STORE/.active.css"
  if command -v pihole-FTL > /dev/null 2>&1 && pihole-FTL --config webserver.interface.theme default-auto > /dev/null 2>&1; then
    say "  [✓] Theme set to default-auto"
  fi
  say "  [i] Package files and settings remain in $STORE (remove manually: sudo rm -rf $STORE)"
}

cmd_status() {
  local tdir s="$SLOT"
  tdir="$(theme_dir)"
  echo "pihole-theme    : $VERSION"
  echo "Themes directory: $tdir"
  echo "Theme           : $(installed && echo lizard || echo none)"
  echo "Layout          : $(opt layout islands)"
  if [ -s "$STORE/params" ]; then echo "Parameters      : $(tr '\n' ' ' < "$STORE/params")"; else echo "Parameters      : default"; fi
  echo "Brand           : $(opt brand '(Pi-hole)')"
  echo "Notifications   : $(mail_to)"
  echo "Server status   : $(status_lines)$([ -f "$STORE/statuslines" ] || echo ' (default)')"
  if is_ours "$tdir/$s.css"; then echo "Slot $s : CUSTOM theme ($(wc -c < "$tdir/$s.css") B)"
  else echo "Slot $s : stock Pi-hole"; fi
  echo "Fonts           : $(find "$tdir" -maxdepth 1 -name 'lizard-*.woff2' 2> /dev/null | wc -l) file(s)"
  if grep -q "$ADDON_MARK" "$(footer_lp "$tdir")" 2> /dev/null && [ -f "$tdir/$ADDON_JS" ]; then echo "Add-ons         : enabled"
  else echo "Add-ons         : disabled"; fi
  if [ -f "$CRON_FILE" ]; then echo "Cron            : $CRON_FILE"; else echo "Cron            : none"; fi
  command -v pihole-FTL > /dev/null 2>&1 && echo "Theme in FTL    : $(pihole-FTL --config webserver.interface.theme 2> /dev/null)"
  return 0
}

# Compatibility check after a Pi-hole update: does the theme and the add-on still have something to hook into
cmd_doctor() {
  local tdir adir css="$CSS" slot="$SLOT" lp fails=0 warns=0 age
  ok() { echo "  [OK]   $*"; }
  warn() { echo "  [WARN] $*"; warns=$((warns + 1)); }
  fail() { echo "  [FAIL] $*"; fails=$((fails + 1)); }
  has() { [ -f "$1" ] && grep -q -- "$2" "$1"; }
  tdir="$(theme_dir)"; adir="$(admin_dir "$tdir")"; lp="$(footer_lp "$tdir")"
  echo "pihole-theme $VERSION — check (tested with: $TESTED_WEB)"
  [ -d "$tdir" ] && ok "themes directory: $tdir" || { fail "themes directory $tdir not found"; echo "Result: errors=$fails"; return 1; }
  if installed; then
    if [ -f "$tdir/$slot.css" ] && cmp -s "$(build_css "$css")" "$tdir/$slot.css"; then ok "theme is in slot $slot and up to date"
    elif is_ours "$tdir/$slot.css"; then warn "slot $slot holds the theme, but not with the current settings — run: sudo pihole-theme reapply"
    else fail "slot $slot holds the stock Pi-hole file (after an update?) — run: sudo pihole-theme reapply"; fi
    [ -f "$tdir/$slot.css" ] && ok "slot $slot exists in this Pi-hole version" || fail "slot file $slot missing — Pi-hole changed its theme list"
  else
    fail "theme is not installed — run the installer (sudo bash pihole-theme.sh install)"
  fi
  if command -v pihole-FTL > /dev/null 2>&1 && installed; then
    [ "$(pihole-FTL --config webserver.interface.theme 2> /dev/null)" = "$slot" ] && ok "FTL uses theme $slot" || warn "FTL has a theme other than $slot selected (Settings -> Web interface / API -> Theme)"
  fi
  # Hooks in the Pi-hole code the theme and the add-on rely on
  has "$adir/scripts/lua/header.lp" "style/themes/' ..theme.name" && ok "header loads the theme from the slot (header.lp)" || fail "header.lp loads themes differently than before — the theme may not load"
  has "$adir/scripts/lua/sidebar.lp" 'class="user-panel"' && has "$adir/scripts/lua/sidebar.lp" 'id="memory"' && ok "status panel has the known structure (sidebar.lp)" || warn "status panel structure changed — temperature and server status may not show"
  if [ "$(opt addons on)" = "on" ]; then
    has "$lp" "scripts/js/footer.js" && ok "footer has the add-on hook (footer.lp)" || fail "footer.lp does not load footer.js the known way — the add-on will not be attached"
    has "$lp" "$ADDON_MARK" && [ -f "$tdir/$ADDON_JS" ] && ok "add-on is attached and deployed" || fail "add-on is not attached — run: sudo pihole-theme reapply"
    # the theme hides the top bar: the add-on adds logout and menu toggle to the sidebar
    has "$adir/scripts/lua/sidebar.lp" 'class="sidebar-menu' && has "$adir/scripts/lua/header_authenticated.lp" 'data-toggle="push-menu"' && ok "sidebar and menu toggle have the known structure" || warn "sidebar or menu toggle structure changed — check that Toggle menu and Log out are at the bottom of the menu"
    has "$adir/scripts/js/charts.js" "globalThis.THEME_COLORS" && ok "chart palette is a global variable (charts.js)" || warn "charts.js does not define THEME_COLORS — doughnuts will keep the stock colours"
    has "$adir/scripts/js/index.js" 'queryOverTimeChart' && has "$adir/scripts/js/index.js" 'clientsChart' && has "$adir/scripts/js/index.js" 'forwardDestinationPieChart' && ok "dashboard charts have the known identifiers (index.js)" || warn "index.js changed the chart identifiers — the skin may not cover some of them"
    if ls "$adir"/vendor/chartjs/chart.umd*.js > /dev/null 2>&1; then
      grep -q "Chart.js v4" "$adir"/vendor/chartjs/chart.umd*.js 2> /dev/null && ok "Chart.js version 4" || warn "Chart.js is not version 4 — the chart skin was written for version 4"
    else warn "Chart.js library not found in vendor/chartjs"; fi
    if grep -qs "cpu_thermal\|coretemp\|k10temp" /sys/class/hwmon/*/name 2> /dev/null; then ok "CPU temperature sensor is visible in the system"
    else warn "no CPU sensor in /sys/class/hwmon — the temperature indicator will show n/a"; fi
    if [ -f "$tdir/$STATUS_JSON" ]; then
      age=$(( $(date +%s) - $(stat -c %Y "$tdir/$STATUS_JSON") ))
      [ "$age" -lt 300 ] && ok "server status file is fresh (${age} s)" || warn "server status file is ${age} s old — check the cron job ($CRON_FILE)"
    else warn "server status file missing — check the cron job ($CRON_FILE)"; fi
  else
    ok "add-ons disabled (addons off) — skipping their checks"
  fi
  [ -f "$CRON_FILE" ] && ok "re-apply cron job: $CRON_FILE" || fail "no cron job — the theme will not come back by itself after a Pi-hole update (run install)"
  echo "Result: errors=$fails, warnings=$warns"
  [ "$fails" -eq 0 ]
}

case "${1:-}" in
  install) cmd_install "${2:-}" ;;
  layout) cmd_layout "${2:-}" ;;
  set) cmd_set "${2:-}" "${3:-}" ;;
  brand) cmd_brand "${2:-}" ;;
  addons) cmd_addons "${2:-}" ;;
  status-lines) shift; cmd_status_lines "$@" ;;
  reapply) cmd_reapply ;;
  cron-reapply) cmd_cron_reapply ;;
  mail) cmd_mail "${2:-}" ;;
  write-status) cmd_write_status ;;
  restore) cmd_restore ;;
  status) cmd_status ;;
  doctor) cmd_doctor ;;
  version | --version | -v) echo "pihole-theme $VERSION" ;;
  *) echo "Usage: $0 {install | layout islands|joined | set accent|gap|radius|reset | brand \"Name\"|off | addons on|off | status-lines <lines>|all|none|default | mail test|<address>|off|default | reapply | status | doctor | version | restore}"; exit 2 ;;
esac
