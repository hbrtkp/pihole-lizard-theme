/* ==========================================================================
   pihole-theme-addons — add-ons for Pi-hole v6 themes
     1. Dashboard chart skin (Chart.js 4)
     2. Browser favicon in the theme colours
     3. CPU temperature indicator in the status panel
     4. Server status in the status panel (clock, resolver, list age, bans)
     5. Logout and menu toggle as sidebar entries; sidebar height
     6. Tail log: highlighting of every kind of block in pihole.log
     7. Pi-hole versions at the bottom of the sidebar (instead of the footer)
     8. Tail log: readable box title instead of the tail -F command
     9. Dashboard: blocked-percentage bar and link tooltips in the statistics box
    10. Digit grouping for four-digit counters (dashboard and sidebar)
    11. Dark / Light switch at the bottom of the sidebar
   Loaded by one line added to scripts/lua/footer.lp right after footer.js
   (done by pihole-theme.sh; a Pi-hole update removes it, cron restores it).
   The file runs BEFORE the charts are created (they are built only after the
   page has loaded), so the settings apply from the first draw. Without this
   file the themes work normally - with stock charts.
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Charts
      - "Total queries": smooth area chart (bands with a gradient, guide line
        under the cursor). Pi-hole passes data prepared for the line mode as
        well, so only the chart type changes.
      - "Client activity": bars with a rounded top and spacing.
      - Doughnuts: rounded, separated segments; the share of the largest slice
        in the middle. In "Upstream servers" the blocklist and cache entries
        have the same colours as "blocked" and "cached" on the chart next to it.
      - Common: palette and font from the theme, horizontal dotted grid only,
        plain axis labels.
      Configuration in the theme CSS (:root):
        --chart-palette   list of colours for doughnuts and "Client activity"
        --chart-font      axis font and the doughnut number (default: page font)
        --chart-center    colour of the number in the middle of a doughnut
        --allowed-color / --blocked-color / --cached-color   (Pi-hole variables)
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  var Chart = window.Chart;
  if (!Chart || !Chart.register) return;

  var rootStyle = getComputedStyle(document.documentElement);
  function cssVar(name) {
    return rootStyle.getPropertyValue(name).trim();
  }

  var AREA = { queryOverTimeChart: true }; // charts drawn as an area
  var TIMELINES = { queryOverTimeChart: true, clientsChart: true };

  function rgb(color) {
    var m = /^#([0-9a-f]{3,8})$/i.exec(color);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
    return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  function alpha(color, a) {
    var c = rgb(color);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  // Palette: Pi-hole reads the global THEME_COLORS array on every data refresh
  var palette = cssVar("--chart-palette");
  if (palette) {
    globalThis.THEME_COLORS = palette.split(",").map(function (s) {
      return s.trim();
    });
  }

  // Chart.js defaults. Font: --chart-font from the theme, otherwise the page body font
  function chartFont() {
    return cssVar("--chart-font") || getComputedStyle(document.body).fontFamily;
  }
  Chart.defaults.font.family = chartFont();
  Chart.defaults.font.size = 12;
  Chart.defaults.elements.bar.borderRadius = 3; // in a stack only its top is rounded
  Chart.defaults.datasets.bar.categoryPercentage = 0.94;
  Chart.defaults.datasets.bar.barPercentage = 0.74;
  Chart.defaults.elements.arc.borderWidth = 3;
  Chart.defaults.elements.arc.borderRadius = 7;
  Chart.defaults.datasets.doughnut.cutout = "64%";
  Chart.defaults.datasets.doughnut.spacing = 2;

  Chart.register({
    id: "piholeThemeSkin",

    // Option tweaks — once, before the first draw
    beforeInit: function (chart) {
      var o = chart.config.options || {};
      var id = chart.canvas && chart.canvas.id;

      if (TIMELINES[id] && o.scales && o.scales.x && o.scales.y) {
        if (AREA[id]) {
          chart.config.type = "line";
          o.interaction = { mode: "index", intersect: false };
          o.elements = o.elements || {};
          o.elements.point = Object.assign({ radius: 0, hitRadius: 5 }, o.elements.point, { hoverRadius: 4 });
        }
        o.scales.x.grid = Object.assign({}, o.scales.x.grid, { display: false });
        o.scales.x.ticks = Object.assign({}, o.scales.x.ticks, { maxRotation: 0, autoSkipPadding: 18 });
        o.scales.y.ticks = Object.assign({}, o.scales.y.ticks, { maxTicksLimit: 5, padding: 8 });
        o.scales.y.grid = Object.assign({}, o.scales.y.grid, { drawTicks: false });
        o.scales.y.border = Object.assign({}, o.scales.y.border, { dash: [2, 5] });
        // the tooltip shows the base colour, even when the band fill is a gradient
        if (o.plugins && o.plugins.tooltip) {
          o.plugins.tooltip.callbacks = o.plugins.tooltip.callbacks || {};
          o.plugins.tooltip.callbacks.labelColor = function (ctx) {
            var c = ctx.dataset._base || ctx.dataset.backgroundColor;
            return { backgroundColor: c, borderColor: c };
          };
        }
      }

      if (chart.config.type === "doughnut") {
        o.elements = o.elements || {};
        o.elements.arc = Object.assign({}, o.elements.arc, { hoverOffset: 6 });
        o.layout = Object.assign({}, o.layout, { padding: 8 });
      }
    },

    // Dataset tweaks — on every refresh (Pi-hole rebuilds them from scratch)
    beforeUpdate: function (chart) {
      var id = chart.canvas && chart.canvas.id;
      var ds = chart.data.datasets || [];

      if (AREA[id]) {
        ds.forEach(function (d, i) {
          if (typeof d.backgroundColor === "string") d._base = d.backgroundColor;
          var base = d._base;
          if (!base) return;
          d.borderColor = base;
          d.borderWidth = 1.5;
          d.fill = i === 0 ? "origin" : "-1"; // band between neighbouring lines, not down to zero
          d.tension = 0.35;
          d.backgroundColor = function (ctx) {
            var a = ctx.chart.chartArea;
            if (!a) return alpha(base, 0.5);
            var g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, alpha(base, 0.78));
            g.addColorStop(1, alpha(base, 0.42));
            return g;
          };
        });
      }

      if (id === "forwardDestinationPieChart" && ds[0] && Array.isArray(ds[0].backgroundColor)) {
        var sem = { blocklist: cssVar("--blocked-color"), cache: cssVar("--cached-color") };
        var rest = [cssVar("--allowed-color")].concat(globalThis.THEME_COLORS || []).filter(function (c) {
          return c && c !== sem.blocklist && c !== sem.cache;
        });
        var n = 0;
        var current = ds[0].backgroundColor;
        ds[0].backgroundColor = (chart.data.labels || []).map(function (label, idx) {
          return sem[label] || (rest.length ? rest[n++ % rest.length] : current[idx]);
        });
      }
    },

    // In the middle of a doughnut: share of the largest visible slice or the one under the cursor
    afterDatasetsDraw: function (chart) {
      if (chart.config.type !== "doughnut") return;
      var d = chart.data.datasets[0];
      if (!d || !d.data || !d.data.length) return;

      var best = -1;
      var total = 0;
      d.data.forEach(function (v, i) {
        if (!chart.getDataVisibility(i)) return;
        total += v;
        if (best < 0 || v > d.data[best]) best = i;
      });
      if (best < 0 || total <= 0) return;
      // under the cursor (or when hovering a legend entry): show that slice instead of the largest
      var hovered = chart.getActiveElements();
      if (hovered.length && chart.getDataVisibility(hovered[0].index)) best = hovered[0].index;

      var a = chart.chartArea;
      var size = a.bottom - a.top;
      var x = (a.left + a.right) / 2;
      var y = (a.top + a.bottom) / 2;
      var c = chart.ctx;
      var family = Chart.defaults.font.family;
      c.save();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = cssVar("--chart-center") || getComputedStyle(document.body).color;
      c.font = "600 " + Math.round(size * 0.15) + "px " + family;
      // share computed among visible slices (after hiding a legend entry the total is still 100%)
      c.fillText(Math.round((100 * d.data[best]) / total) + "%", x, y - size * 0.02);
      c.globalAlpha = 0.65;
      c.font = "500 13px " + family;
      c.fillText(String(chart.data.labels[best]), x, y + size * 0.11);
      c.restore();
    },

    // Guide line under the cursor on the area chart
    afterDraw: function (chart) {
      if (chart.config.type !== "line") return;
      var active = chart.getActiveElements();
      if (!active.length) return;
      var a = chart.chartArea;
      var x = active[0].element.x;
      var c = chart.ctx;
      c.save();
      c.strokeStyle = alpha(getComputedStyle(document.body).color, 0.35);
      c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(x, a.top);
      c.lineTo(x, a.bottom);
      c.stroke();
      c.restore();
    }
  });

  // The theme font loads asynchronously — redraw the axis labels once it has loaded
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      Chart.defaults.font.family = chartFont();
      Object.keys(Chart.instances || {}).forEach(function (k) {
        Chart.instances[k].update("none");
      });
    });
  }
})();

/* --------------------------------------------------------------------------
   Browser favicon in the theme colours: a rounded square with a ring.
   Colours: --brand-fav-bg / --brand-fav-fg in the theme CSS. Replaced on the
   fly (without touching Pi-hole files), so it does not apply to the login page.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";
  var probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;color:var(--brand-fav-fg);background-color:var(--brand-fav-bg)";
  if (!document.body) return;
  document.body.appendChild(probe);
  var cs = getComputedStyle(probe);
  var fg = cs.color;
  var bg = cs.backgroundColor;
  probe.remove();
  // variables not set -> transparent background: keep the stock icon
  if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return;

  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="16" fill="' + bg + '"/>' +
    '<circle cx="32" cy="32" r="14" fill="none" stroke="' + fg + '" stroke-width="9"/>' +
    "</svg>";
  var href = "data:image/svg+xml," + encodeURIComponent(svg);
  var links = document.querySelectorAll('link[rel~="icon"], link[rel="mask-icon"]');
  for (var i = 0; i < links.length; i++) links[i].parentNode.removeChild(links[i]);
  var link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = href;
  document.head.appendChild(link);
})();

/* --------------------------------------------------------------------------
   3. CPU temperature in the status panel
      Pi-hole v6 does not show it in the interface, but FTL exposes it at
      /api/info/sensors (cpu_temp, hot_limit, unit). Fifth line under
      "Memory usage", in the layout of the Pi-hole indicators (icon + text),
      refreshed every 20 s. "Hot" threshold: webserver.api.temp.limit (default 60).
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  var $ = window.jQuery;
  if (!$) return;

  var REFRESH_MS = 20000;
  var timer = null;

  // Slot for the indicator: added once, under the existing panel lines
  function slot() {
    var info = document.querySelector(".user-panel .info");
    if (!info) return null; // page without the panel (e.g. login)
    var el = document.getElementById("temperature");
    if (!el) {
      // the temperature sits directly under "Memory usage" - before the server status block,
      // if that one happened to be created earlier
      var before = document.getElementById("server-status");
      el = document.createElement("span");
      el.id = "temperature";
      info.insertBefore(document.createElement("br"), before);
      info.insertBefore(el, before);
    }
    return el;
  }

  function render(el, sensors) {
    var temp = sensors.cpu_temp;
    if (typeof temp !== "number") {
      // FTL did not detect a CPU sensor — say so instead of an empty line
      el.innerHTML = '<i class="fa fa-fw fa-temperature-half"></i>&nbsp;&nbsp;Temp:&nbsp;n/a';
      el.title = "No CPU temperature sensor reported by FTL";
      return;
    }

    var limit = typeof sensors.hot_limit === "number" ? sensors.hot_limit : null;
    var unit = sensors.unit || "C";
    var symbol = unit === "K" ? "K" : "\u00B0" + unit;
    // Two states, like load and memory: red from the threshold, green otherwise
    var color = limit !== null && temp >= limit ? "text-red" : "text-green-light";

    el.innerHTML =
      '<i class="fa fa-fw fa-temperature-half ' +
      color +
      '"></i>&nbsp;&nbsp;Temp:&nbsp;' +
      temp.toFixed(1) +
      "&thinsp;" +
      symbol;
    el.title =
      "CPU temperature" + (limit !== null ? "\nHot limit: " + limit + " " + symbol : "");
  }

  function update() {
    var el = slot();
    if (!el) return;

    $.ajax({ url: document.body.dataset.apiurl + "/info/sensors" })
      .done(function (data) {
        if (data && data.sensors) render(el, data.sensors);
      })
      .always(function () {
        clearTimeout(timer);
        timer = setTimeout(update, REFRESH_MS);
      });
  }

  $(update);
})();

/* --------------------------------------------------------------------------
   4. Server status in the status panel
      Pi-hole does not expose this data, so a script on the Pi writes it to a
      file every minute (pihole-theme.sh write-status, from cron):
        style/themes/pihole-theme-status.json
      { ts, clock, dns, lists_age_h, bans, bans_detail, power }
      Missing fields (e.g. no fail2ban) are skipped. A file older than 5 minutes
      means the script stopped running - then one warning line is shown instead
      of stale data. The file is static and readable without logging in: it
      contains only states, no addresses or names.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  // URL from the web interface root (data-webhome, e.g. "/admin/"), not relative:
  // on two-level pages (/admin/groups/domains, /admin/settings/dns) a relative
  // URL would point to /admin/groups/style/... and the file would not be found.
  var URL = (document.body.dataset.webhome || "") + "style/themes/pihole-theme-status.json";
  var REFRESH_MS = 60000;
  var STALE_S = 300;
  var timer = null;

  function slot() {
    var info = document.querySelector(".user-panel .info");
    if (!info) return null;
    var el = document.getElementById("server-status");
    if (!el) {
      el = document.createElement("span");
      el.id = "server-status";
      el.style.display = "block";
      info.appendChild(el);
    }
    return el;
  }

  function line(icon, ok, text, title) {
    var color = ok === null ? "" : ok ? "text-green-light" : "text-red";
    return (
      '<span class="server-status-line" title="' + (title || "") + '">' +
      '<i class="fa fa-fw ' + icon + " " + color + '"></i>&nbsp;&nbsp;' + text + "</span>"
    );
  }

  function age(hours) {
    if (hours < 1) return "under 1 h";
    if (hours < 48) return Math.round(hours) + " h";
    return Math.round(hours / 24) + " d";
  }

  function render(el, s) {
    var now = Date.now() / 1000;
    if (typeof s.ts !== "number" || now - s.ts > STALE_S) {
      el.innerHTML = line("fa-triangle-exclamation", false, "Server status: stale", "Status file is older than 5 minutes - check the pihole-theme cron job");
      return;
    }
    var out = [];
    if (s.clock) out.push(line("fa-clock", s.clock === "synced", "Clock: " + s.clock, "System clock synchronisation (NTP). An unsynchronised clock breaks DNSSEC validation."));
    if (s.dns) out.push(line("fa-shield-halved", s.dns === "ok", "Resolver: " + s.dns, "Test query through Pi-hole and its upstream resolver"));
    if (typeof s.lists_age_h === "number") out.push(line("fa-list-check", s.lists_age_h < 8 * 24 + 6, "Lists: " + age(s.lists_age_h), "Time since the last gravity (blocklist) update"));
    if (typeof s.bans === "number") out.push(line("fa-ban", null, "Bans: " + s.bans, s.bans_detail || "Addresses currently banned"));
    // power is shown only when there is a problem (vcgencmd get_throttled flags other than 0x0)
    if (s.power && s.power !== "ok") out.push(line("fa-bolt", false, "Power: " + s.power, "Undervoltage or throttling reported by the firmware"));
    el.innerHTML = out.join("");
  }

  function update() {
    var el = slot();
    if (!el) return;
    fetch(URL + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data) render(el, data);
        else el.innerHTML = ""; // file does not exist: indicators disabled
      })
      .catch(function () {
        el.innerHTML = "";
      })
      .then(function () {
        clearTimeout(timer);
        timer = setTimeout(update, REFRESH_MS);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", update);
  else update();
})();

/* --------------------------------------------------------------------------
   5. Panel tools in the sidebar + sidebar height
      The theme may hide the Pi-hole top bar. That bar, however, holds the only
      logout button and the menu toggle, so both are added here as entries at
      the bottom of the sidebar. They are always created but hidden (hidden
      attribute) - only the theme CSS shows them and hides the bar, via the
      pt-tools-ready class on <html>. The original buttons stay in place: on
      phones and in the "joined" layout the bar is still visible.
      Height: if the theme sets --pt-sidebar-end (an element selector), the
      bottom edge of the sidebar card is aligned with the bottom edge of the box
      holding that element. On pages without it the card has its content height.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  var menu = document.querySelector(".sidebar-menu");
  var sidebar = document.querySelector(".main-sidebar");
  if (!menu || !sidebar) return;

  function entry(extraClass, icon, label) {
    var li = document.createElement("li");
    li.className = "pt-tools " + extraClass;
    li.hidden = true;
    var a = document.createElement("a");
    a.href = "#";
    a.innerHTML = '<i class="fa fa-fw menu-icon ' + icon + '"></i> <span>' + label + "</span>";
    li.appendChild(a);
    menu.appendChild(li);
    return a;
  }

  if (!menu.querySelector(".pt-tools")) {
    var head = document.createElement("li");
    head.className = "header text-uppercase pt-tools";
    head.hidden = true;
    head.textContent = "Panel";
    menu.appendChild(head);

    // Toggle: AdminLTE handles every element with data-toggle="push-menu" (event delegation)
    entry("pt-collapse", "fa-angles-left", "Toggle menu").setAttribute("data-toggle", "push-menu");

    // Logout: click the original button (it exists only when the interface has a password)
    var original = document.getElementById("logout-button");
    if (original) {
      entry("pt-logout", "fa-arrow-right-from-bracket", "Log out").addEventListener("click", function (e) {
        e.preventDefault();
        original.click();
      });
    }
    document.documentElement.classList.add("pt-tools-ready");
  }

  // Natural position of the sidebar top edge (without the sticky offset), in window coordinates
  function sidebarTop() {
    var wrapper = document.querySelector(".wrapper");
    var header = document.querySelector(".main-header");
    var headerH = header && getComputedStyle(header).display !== "none" ? header.getBoundingClientRect().height : 0;
    return wrapper.getBoundingClientRect().top + headerH + parseFloat(getComputedStyle(sidebar).marginTop || 0);
  }

  // Sidebar height - the same on every page:
  //  - the dashboard is the reference: sidebar bottom edge level with the box pointed to by
  //    --pt-sidebar-end (Query Types). The height measured there is remembered
  //    in the browser (localStorage) and used on the other pages;
  //  - the sidebar is never taller than the window (otherwise the version tiles at the
  //    bottom would be invisible) - then it has the window height, on the dashboard too;
  //  - until something is remembered (first visit skipping the dashboard): window height;
  //  - exception: when the menu needs more room (expanded Settings / Tools), the sidebar
  //    grows to fit its content, so nothing has to be scrolled; it shrinks back to the
  //    common height when the submenu is closed.
  var STORE_KEY = "pt-sidebar-height";

  function bucket() {
    return window.innerWidth >= 992 ? "lg" : "md"; // the dashboard layout changes at 992 px
  }
  function remember(height) {
    try {
      var all = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      all[bucket()] = height;
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  function recall() {
    try {
      var h = JSON.parse(localStorage.getItem(STORE_KEY) || "{}")[bucket()];
      return typeof h === "number" && h > 200 ? h : null;
    } catch (e) {
      return null;
    }
  }

  function align() {
    var root = document.documentElement;
    var cs = getComputedStyle(sidebar);
    sidebar.style.minHeight = "";
    if (cs.position !== "sticky" || !document.querySelector(".wrapper")) {
      sidebar.style.height = "";
      root.classList.remove("pt-fixed-height");
      return;
    }
    var gap = parseFloat(getComputedStyle(root).getPropertyValue("--isl-gap")) || 12;
    var available = Math.floor(window.innerHeight - (parseFloat(cs.top) || 0) - gap);

    var target = getComputedStyle(root).getPropertyValue("--pt-sidebar-end").trim().replace(/["']/g, "");
    var el = target ? document.querySelector(target) : null;
    var box = el && el.closest(".box");
    var wanted = null;
    if (box) {
      wanted = Math.round(box.getBoundingClientRect().bottom - sidebarTop());
      if (wanted > 200) remember(wanted);
      else wanted = null;
    } else {
      wanted = recall();
    }
    var height = Math.max(200, wanted ? Math.min(wanted, available) : available);
    // natural height of the content (status panel + menu + version tiles): measured with the
    // height unset; an expanded submenu makes it larger than the common height
    sidebar.style.height = "";
    var natural = Math.ceil(sidebar.getBoundingClientRect().height);
    sidebar.style.height = Math.max(height, natural) + "px";
    root.classList.add("pt-fixed-height");
  }

  function alignAll() {
    align();
  }

  alignAll();
  window.addEventListener("resize", alignAll);
  window.addEventListener("load", alignAll);
  if (window.ResizeObserver) {
    var content = document.querySelector(".content-wrapper");
    if (content) new ResizeObserver(alignAll).observe(content);
    // submenus change size while they slide open or closed (the menu list itself does not:
    // its size is bound by the sidebar height)
    var sub = new ResizeObserver(alignAll);
    Array.prototype.forEach.call(sidebar.querySelectorAll(".treeview-menu"), function (ul) { sub.observe(ul); });
  }
})();

/* --------------------------------------------------------------------------
   6. Tail log (pihole.log): highlighting of blocked queries
      Pi-hole colours only the lines with "gravity blocked" or "denied" red.
      FTL also logs other kinds of blocks - "special domain", "blocked
      upstream", blocks during CNAME inspection - which stay grey.
      Here every blocked line gets the pt-log-blocked class; the look (red
      text and a full-line highlight) comes from the theme CSS.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  // log page: the #output element with the pre-taillog class (detected by element, not by URL)
  var output = document.getElementById("output");
  if (!output || !output.classList.contains("pre-taillog")) return;
  // DNS query log only; FTL.log and webserver.log have a different format and their own priority colours
  var file = /[?&]file=([a-z]+)/.exec(location.search);
  if (file && file[1] !== "dnsmasq") return;

  function isBlocked(text) {
    if (/\bnot blocked\b/.test(text)) return false;
    return /\b(blocked|denied)\b/.test(text) || /\bspecial domain\b/.test(text);
  }

  function mark(entry) {
    if (!entry.classList || !entry.classList.contains("log-entry") || entry.dataset.ptSeen) return;
    entry.dataset.ptSeen = "1";
    if (isBlocked(entry.textContent)) entry.classList.add("pt-log-blocked");
  }

  Array.prototype.forEach.call(output.children, mark);
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      Array.prototype.forEach.call(r.addedNodes, function (n) {
        if (n.nodeType === 1) mark(n);
      });
    });
  }).observe(output, { childList: true });
})();

/* --------------------------------------------------------------------------
   7. Pi-hole versions at the bottom of the sidebar (instead of the footer)
      The source is the #versions list that Pi-hole itself fills in the footer
      (with its "Update available!" logic and links to the release notes) - the
      add-on fetches nothing itself, it only rewrites the list into tiles:
      icon + version number. The CSS hides the footer only after the tiles are
      built (pt-versions-ready class), so if the list never appears, the
      footer stays.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  var list = document.getElementById("versions");
  var side = document.querySelector(".main-sidebar > .sidebar");
  if (!list || !side) return;

  var ICONS = { "Core": "fa-cube", "FTL": "fa-gears", "Web interface": "fa-display", "Docker Tag": "fa-box" };
  var RELEASES = {
    "Core": "https://github.com/pi-hole/pi-hole/releases",
    "FTL": "https://github.com/pi-hole/FTL/releases",
    "Web interface": "https://github.com/pi-hole/web/releases",
    "Docker Tag": "https://github.com/pi-hole/docker-pi-hole/releases",
  };
  var box = document.createElement("div");
  box.className = "pt-versions";

  function render() {
    var tiles = [];
    Array.prototype.forEach.call(list.querySelectorAll("li"), function (li) {
      var strong = li.querySelector("strong");
      if (!strong) return;
      var name = strong.textContent.trim();
      var update = li.querySelector("a.lookatme");
      var link = li.querySelector("a:not(.lookatme)");
      // version number = entry text without the name and without the update notice
      var copy = li.cloneNode(true);
      Array.prototype.forEach.call(copy.querySelectorAll("strong, a.lookatme"), function (n) { n.remove(); });
      var version = copy.textContent.replace(/[\s\u00a0\u00b7]+/g, " ").trim();
      if (!version) return;

      var a = document.createElement("a");
      a.href = (update && update.href) || (link && link.href) || RELEASES[name] || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = name + " " + version + (update ? " \u2014 update available" : "");
      if (update) a.className = "pt-update";
      var icon = document.createElement("i");
      icon.className = "fa " + (ICONS[name] || "fa-code-branch");
      var label = document.createElement("b");
      label.textContent = version;
      a.appendChild(icon);
      a.appendChild(label);
      tiles.push(a);
    });
    if (!tiles.length) return;
    box.textContent = "";
    tiles.forEach(function (t) { box.appendChild(t); });
    box.style.setProperty("--pt-vcols", String(Math.min(tiles.length, 4)));
    if (!box.parentNode) {
      side.appendChild(box);
      document.documentElement.classList.add("pt-versions-ready");
    }
  }

  render();
  new MutationObserver(render).observe(list, { childList: true, subtree: true });
})();

/* --------------------------------------------------------------------------
   8. Tail log: readable box title
      Pi-hole shows the command "tail -F /var/log/pihole/pihole.log" in the title.
      The add-on shows "Tail log" and just the file name; the full command stays
      in the tooltip on hover.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  var file = document.getElementById("filename");
  var title = file && file.closest(".box-title");
  if (!file || !title) return;

  var name = document.createElement("span");
  name.className = "pt-logname";

  function update() {
    var path = file.textContent.trim();
    if (!path || path === "...") return;
    if (!name.parentNode) {
      title.appendChild(document.createTextNode("Tail log"));
      title.appendChild(name);
      title.classList.add("pt-logtitle");
    }
    name.textContent = path.split("/").pop();
    title.title = "tail -F " + path;
  }

  update();
  new MutationObserver(update).observe(file, { childList: true, characterData: true, subtree: true });
})();

/* --------------------------------------------------------------------------
   9. Dashboard: statistics box
      Width of the bar under the blocked percentage (the --pt-blocked variable,
      read by the CSS) and a tooltip on every block with the text of the old
      tile footer ("14 active clients", "Manage lists"), which is now an
      invisible link stretched over the whole block.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  var pct = document.getElementById("percent_blocked");
  if (!pct) return;
  var box = pct.closest(".small-box");

  function bar() {
    var v = parseFloat(pct.textContent.replace(",", "."));
    box.style.setProperty("--pt-blocked", (isNaN(v) ? 0 : Math.max(0, Math.min(100, v))) + "%");
  }
  function tips() {
    Array.prototype.forEach.call(document.querySelectorAll(".small-box > .small-box-footer"), function (a) {
      var t = a.textContent.replace(/\s+/g, " ").trim();
      if (t) a.closest(".small-box").title = t;
    });
  }
  bar();
  tips();
  new MutationObserver(bar).observe(pct, { childList: true, characterData: true, subtree: true });
  var clients = document.getElementById("active_clients");
  if (clients) new MutationObserver(tips).observe(clients, { childList: true, characterData: true, subtree: true });
})();

/* --------------------------------------------------------------------------
   10. Digit grouping for four-digit counters (dashboard and sidebar)
       Pi-hole formats the counters with Intl.NumberFormat(). In some languages
       (Polish among them) the locale rules group digits only from five digits
       up, so "3962" stands next to "27 715". The add-on inserts the same
       separator the browser uses for larger numbers, so every counter is
       grouped the same way. Only plain integers of four or more digits are
       touched; the percentage and already formatted values are left alone.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  // dashboard counters and the badges in the sidebar menu (Groups, Clients, Domains, Lists)
  var ids = ["dns_queries", "blocked_queries", "gravity_size", "active_clients",
    "num_groups", "num_clients", "num_allowed", "num_denied", "num_lists", "num_gravity"];
  var els = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if (!els.length) return;

  // the separator the browser puts into a seven-digit number in the page language
  var probe = new Intl.NumberFormat().format(1234567);
  var m = /^1(\D+)234(?:\1)567$/.exec(probe); // (?:) keeps "\1567" from being read as an octal escape
  var sep = m ? m[1] : (probe === "1234567" ? "\u00a0" : null);
  if (!sep) return; // unknown format - leave Pi-hole's output as it is

  function fix(el) {
    var t = el.textContent;
    if (/^\d{4,}$/.test(t)) el.textContent = t.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }
  els.forEach(function (el) {
    fix(el);
    new MutationObserver(function () { fix(el); }).observe(el, { childList: true, characterData: true, subtree: true });
  });
})();

/* --------------------------------------------------------------------------
   11. Dark / Light switch at the bottom of the sidebar
       "Light" applies the palette named by --pt-light (pihole-theme set light
       <name>, default "paper") by setting data-lz-scheme on <html>; the choice
       is kept per browser in localStorage ("pt-scheme") and re-applied before
       the page is painted by the one-line script the installer adds to
       header.lp. The switch reloads the page, so the charts and the favicon
       pick up the new colours.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";

  var KEY = "pt-scheme";
  var side = document.querySelector(".main-sidebar > .sidebar");
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch (e) { return "dark"; }
  }
  function lightName() {
    var n = getComputedStyle(root).getPropertyValue("--pt-light").trim().replace(/["']/g, "");
    return /^[a-z]+$/.test(n) ? n : "paper";
  }
  function apply(mode) {
    if (mode === "light") {
      root.setAttribute("data-lz-scheme", lightName());
      root.setAttribute("data-lz-light", "");
    } else {
      root.removeAttribute("data-lz-scheme");
      root.removeAttribute("data-lz-light");
    }
  }

  // fallback for pages without the header.lp script (the attribute is then set here, late)
  apply(stored());
  if (!side) return;

  var box = document.createElement("div");
  box.className = "pt-scheme";
  var seg = document.createElement("div");
  seg.className = "seg";
  [["dark", "fa-moon", "Dark"], ["light", "fa-sun", "Light"]].forEach(function (d) {
    var b = document.createElement("button");
    b.type = "button";
    b.dataset.mode = d[0];
    b.title = d[2] === "Light" ? "Light (" + lightName() + ")" : "Dark";
    var i = document.createElement("i");
    i.className = "fa " + d[1];
    var t = document.createElement("span");
    t.textContent = d[2];
    b.appendChild(i);
    b.appendChild(t);
    if (stored() === d[0]) b.className = "on";
    b.addEventListener("click", function () {
      if (stored() === d[0]) return;
      try { localStorage.setItem(KEY, d[0]); } catch (e) {}
      apply(d[0]);
      location.reload();
    });
    seg.appendChild(b);
  });
  box.appendChild(seg);
  var versions = side.querySelector(".pt-versions");
  if (versions) side.insertBefore(box, versions); else side.appendChild(box);
})();
