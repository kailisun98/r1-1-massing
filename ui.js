/* ui.js -- the app's UI components: small, dependency-free, accessible.

   Contract. Every factory takes a host element and a props object, renders into the host and returns a handle
   { el, update(partialProps), destroy() }. Props go in, callbacks come out (onChange, onToggle); a component never
   reaches into the app. update() re-syncs the DOM in place (keeping focus and scroll) when the items are the same,
   and rebuilds only when the set of item ids changes. destroy() removes listeners and empties the host.

   Accessibility. Each component follows the WAI-ARIA Authoring Practices pattern of its kind: tabs (tablist with
   roving tabindex and arrow keys), segmented control (radiogroup), option list (listbox with typeahead-free arrow
   navigation), stepper (spinbutton on a numeric input with labelled buttons), collapsible (button with aria-expanded
   and aria-controls), status (live region; errors are assertive), notice (status, or alert for errors), tables
   (caption, column headers, row groups, state marks with text alternatives). Disabled items stay readable
   (aria-disabled) so a screen reader hears why an option is out; focus is never lost on update.

   States. loading (aria-busy, skeleton rows or a spinner with text), disabled, empty (emptyText), error (notice tone,
   field aria-invalid). Edge cases handled everywhere: an empty item list, one item, a value that is not among the
   items (nothing selected, first enabled item tabbable, console.warn), a disabled current value, long labels
   (ellipsis plus a title), rapid updates.

   Responsive. Lists and toolbars wrap; tab strips scroll sideways instead of wrapping; controls grow to 44 px on
   coarse pointers; nothing sets a width wider than its container. Motion respects prefers-reduced-motion. */
var R1UI = (function () {
  "use strict";
  var seq = 0;
  function uid(prefix) { return (prefix || "ui") + "-" + (++seq); }
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "className") node.className = v;
      else if (k === "htmlFor") node.htmlFor = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.indexOf("on") === 0 && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (v === true) node.setAttribute(k, k === "hidden" || k === "disabled" ? "" : "true");
      else node.setAttribute(k, String(v));
    });
    (children || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function sameIds(a, b) { return a.length === b.length && a.every(function (x, i) { return x.id === b[i].id; }); }
  function warnValue(name, value, items) { if (value !== null && value !== undefined && !items.some(function (i) { return i.id === value; })) console.warn("R1UI." + name + ": value " + JSON.stringify(value) + " is not one of the items"); }

  /* roving tabindex over the focusable items of a container: arrows move focus (and call onMove), Home/End jump,
     disabled items are skipped; orientation "horizontal", "vertical" or "both" */
  function roving(container, selector, opts) {
    opts = opts || {};
    function items() { return Array.prototype.slice.call(container.querySelectorAll(selector)); }
    function enabled(list) { return list.filter(function (b) { return !b.disabled && b.getAttribute("aria-disabled") !== "true" || opts.focusDisabled; }); }
    function onKey(e) {
      var list = items(), ok = enabled(list), i = ok.indexOf(document.activeElement), horiz = opts.orientation !== "vertical", vert = opts.orientation !== "horizontal", n = null;
      if (i < 0) return;
      if ((horiz && e.key === "ArrowRight") || (vert && e.key === "ArrowDown")) n = (i + 1) % ok.length;
      else if ((horiz && e.key === "ArrowLeft") || (vert && e.key === "ArrowUp")) n = (i - 1 + ok.length) % ok.length;
      else if (e.key === "Home") n = 0; else if (e.key === "End") n = ok.length - 1;
      if (n === null) return;
      e.preventDefault(); ok[n].focus(); if (opts.onMove) opts.onMove(ok[n]);
    }
    container.addEventListener("keydown", onKey);
    return { sync: function (currentEl) { var list = items(), ok = enabled(list), cur = currentEl && ok.indexOf(currentEl) >= 0 ? currentEl : ok[0]; list.forEach(function (b) { b.tabIndex = b === cur ? 0 : -1; }); }, destroy: function () { container.removeEventListener("keydown", onKey); } };
  }
  function fitLabel(node, label) { node.textContent = label; if (label && label.length > 28) node.title = label; }

  // ------------------------------------------------------------------ Tabs
  /** @typedef {{id: string, label: string, disabled?: boolean, panel?: string|Element, title?: string}} TabItem
      props: { items: TabItem[], value: string, onChange(id), ariaLabel: string, activation: "manual"|"automatic" }
      Manual activation (the default): arrow keys move focus, Enter or Space selects, so a heavy panel (3D, the
      plans) is not built while the user is only passing over its tab. */
  function tabs(host, props) {
    var state = Object.assign({ items: [], value: null, activation: "manual" }, props), list = h("div", { role: "tablist", "aria-label": state.ariaLabel || "Views", className: "ui-tabs" }), buttons = {}, rv;
    function panelOf(it) { return typeof it.panel === "string" ? document.getElementById(it.panel) : it.panel || null; }
    function build() {
      clear(list); buttons = {};
      state.items.forEach(function (it) {
        var id = uid("tab"), b = h("button", { type: "button", role: "tab", id: id, "aria-selected": "false", className: "ui-tab", title: it.title || null, onClick: function () { if (!b.disabled) select(it.id); } });
        fitLabel(b, it.label); buttons[it.id] = b; list.appendChild(b);
        var p = panelOf(it); if (p) { p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", id); if (!p.id) p.id = uid("panel"); b.setAttribute("aria-controls", p.id); }
      });
      sync();
    }
    function sync() {
      warnValue("tabs", state.value, state.items);
      state.items.forEach(function (it) {
        var b = buttons[it.id], on = it.id === state.value; if (!b) return;
        b.disabled = !!it.disabled; b.setAttribute("aria-selected", on ? "true" : "false"); b.classList.toggle("on", on);
        var p = panelOf(it); if (p) p.hidden = !on;
      });
      rv.sync(buttons[state.value]);
    }
    function select(id) { if (id === state.value) return; state.value = id; sync(); if (state.onChange) state.onChange(id); }
    clear(host).appendChild(list);
    rv = roving(list, "[role=tab]", { orientation: "horizontal", onMove: function (b) { if (state.activation !== "automatic") return; var id = Object.keys(buttons).filter(function (k) { return buttons[k] === b; })[0]; if (id !== undefined) select(id); } });
    build();
    return { el: list, update: function (p) { var rebuild = p.items && !sameIds(p.items, state.items); Object.assign(state, p); if (rebuild) build(); else sync(); }, get value() { return state.value; }, isDisabled: function (id) { var it = state.items.filter(function (x) { return x.id === id; })[0]; return !it || !!it.disabled; }, destroy: function () { rv.destroy(); clear(host); } };
  }

  // ------------------------------------------------------------------ Segmented control (a radio group)
  /** props: { items: [{id, label, disabled, title}], value, onChange(id), ariaLabel, disabled, busy } */
  function segmented(host, props) {
    var state = Object.assign({ items: [], value: null }, props), group = h("div", { role: "radiogroup", "aria-label": state.ariaLabel || null, className: "seg ui-seg" }), buttons = {}, rv;
    function build() {
      clear(group); buttons = {};
      state.items.forEach(function (it) {
        var b = h("button", { type: "button", role: "radio", "aria-checked": "false", className: "segbtn", title: it.title || null, onClick: function () { if (!b.disabled) select(it.id); } });
        fitLabel(b, it.label); buttons[it.id] = b; group.appendChild(b);
      });
      sync();
    }
    function sync() {
      warnValue("segmented", state.value, state.items);
      group.setAttribute("aria-busy", state.busy ? "true" : "false"); group.classList.toggle("busy", !!state.busy);
      state.items.forEach(function (it) { var b = buttons[it.id], on = it.id === state.value; b.disabled = !!(it.disabled || state.disabled || state.busy); b.setAttribute("aria-checked", on ? "true" : "false"); b.classList.toggle("on", on); });
      rv.sync(buttons[state.value]);
    }
    function select(id) { if (id === state.value) { if (state.onReselect) state.onReselect(id); return; } state.value = id; sync(); if (state.onChange) state.onChange(id); }
    clear(host).appendChild(group);
    rv = roving(group, "[role=radio]", { orientation: "horizontal", onMove: function (b) { var id = Object.keys(buttons).filter(function (k) { return buttons[k] === b; })[0]; if (id !== undefined) select(id); } });
    build();
    return { el: group, update: function (p) { var rebuild = p.items && !sameIds(p.items, state.items); Object.assign(state, p); if (rebuild) build(); else sync(); }, get value() { return state.value; }, destroy: function () { rv.destroy(); clear(host); } };
  }

  // ------------------------------------------------------------------ Status strip (live region)
  /** props: { text, level: "info"|"ok"|"error"|"busy" } */
  function status(host, props) {
    var state = Object.assign({ text: "", level: "info" }, props);
    var dot = h("span", { className: "dot", "aria-hidden": "true" }), text = h("span", { className: "ui-status-text" }), sr = h("span", { className: "vh" });
    host.classList.add("status"); host.setAttribute("role", "status"); host.setAttribute("aria-live", "polite");
    clear(host); host.appendChild(dot); host.appendChild(sr); host.appendChild(text);   // the hidden prefix ("Error:") is read before the text
    function sync() {
      host.className = "status " + state.level; text.textContent = state.text; host.setAttribute("aria-busy", state.level === "busy" ? "true" : "false");
      host.setAttribute("aria-live", state.level === "error" ? "assertive" : "polite"); sr.textContent = state.level === "error" ? "Error: " : (state.level === "busy" ? "Working: " : "");
    }
    sync();
    return { el: host, update: function (p) { Object.assign(state, p); sync(); }, destroy: function () { clear(host); } };
  }

  // ------------------------------------------------------------------ Collapsible section (enhances a section with a heading)
  /** props: { open: boolean, onToggle(open) }; the section's first h2/h3 becomes the toggle, the rest the body */
  function collapsible(section, props) {
    var state = Object.assign({ open: true }, props), heading = section.querySelector("h2, h3"), body = section.querySelector(".stepbody") || null;
    if (!heading) throw new Error("R1UI.collapsible: the section needs a heading");
    if (!body) { body = h("div", { className: "stepbody" }); Array.prototype.slice.call(section.childNodes).forEach(function (n) { if (n !== heading) body.appendChild(n); }); section.appendChild(body); }
    if (!body.id) body.id = uid("body");
    var btn = h("button", { type: "button", className: "ui-collapse", "aria-expanded": "true", "aria-controls": body.id });
    while (heading.firstChild) btn.appendChild(heading.firstChild);
    heading.appendChild(btn);
    function sync() { btn.setAttribute("aria-expanded", state.open ? "true" : "false"); section.classList.toggle("collapsed", !state.open); body.hidden = !state.open; }
    function toggle() { state.open = !state.open; sync(); if (state.onToggle) state.onToggle(state.open); }
    btn.addEventListener("click", toggle);
    sync();
    return { el: section, button: btn, update: function (p) { Object.assign(state, p); sync(); }, destroy: function () { btn.removeEventListener("click", toggle); } };
  }

  // ------------------------------------------------------------------ Option list (a listbox of cards)
  /** @typedef {{id, title, meta?, badge?: {text, tone: "ok"|"no"|"n"}, detail?, disabled?: boolean, reason?: string}} OptionItem
      props: { items: OptionItem[], value, onChange(id), ariaLabel, emptyText, loading, loadingText } */
  function optionList(host, props) {
    var state = Object.assign({ items: [], value: null, emptyText: "Nothing to show.", loadingText: "Loading…" }, props);
    var list = h("div", { role: "listbox", "aria-label": state.ariaLabel || null, className: "optlist ui-optlist" }), nodes = {}, rv;
    function build() {
      clear(list); nodes = {};
      if (state.loading) {
        list.setAttribute("aria-busy", "true");
        for (var i = 0; i < 3; i++) list.appendChild(h("div", { className: "opt skeleton", "aria-hidden": "true" }, [h("span", { className: "sk-line w60" }), h("span", { className: "sk-line w30" })]));
        list.appendChild(h("p", { className: "vh", role: "status", text: state.loadingText }));
        return;
      }
      list.setAttribute("aria-busy", "false");
      if (!state.items.length) { list.appendChild(h("p", { className: "empty", text: state.emptyText })); return; }
      state.items.forEach(function (it) {
        var off = !!it.disabled, item = h("div", { role: "option", className: "opt " + (off ? "nofit" : "fit"), "aria-selected": "false", "aria-disabled": off ? "true" : null, tabindex: "-1", title: off ? (it.reason || "Not available") : "Select" });
        item.appendChild(h("span", { className: "name", text: it.title }));
        if (it.badge) item.appendChild(h("span", { className: "pill " + (it.badge.tone || "n"), text: it.badge.text }));
        if (it.meta) item.appendChild(h("span", { className: "meta", text: it.meta }));
        if (off && it.reason) item.appendChild(h("span", { className: "why", text: it.reason }));
        else if (it.detail) item.appendChild(h("span", { className: "why", text: it.detail }));
        item.addEventListener("click", function () { if (!off) select(it.id); else item.focus(); });
        item.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !off) { e.preventDefault(); select(it.id); } });
        nodes[it.id] = item; list.appendChild(item);
      });
      sync();
    }
    function sync() {
      if (state.loading || !state.items.length) return;
      warnValue("optionList", state.value, state.items);
      state.items.forEach(function (it) { var n = nodes[it.id]; if (!n) return; var on = it.id === state.value; n.setAttribute("aria-selected", on ? "true" : "false"); n.classList.toggle("on", on); });
      rv.sync(nodes[state.value]);
    }
    function select(id) { if (id === state.value) return; state.value = id; sync(); if (state.onChange) state.onChange(id); }
    clear(host).appendChild(list);
    rv = roving(list, "[role=option]", { orientation: "vertical", focusDisabled: true });
    build();
    return { el: list, update: function (p) { var rebuild = p.items && !sameIds(p.items, state.items) || p.loading !== undefined && p.loading !== state.loading; Object.assign(state, p); if (rebuild || state.loading) build(); else sync(); }, destroy: function () { rv.destroy(); clear(host); } };
  }

  // ------------------------------------------------------------------ Data table
  /** @typedef {{key?: string, label: string, kind?: "clause"|"status"|"num"}} Column
      @typedef {{cells: string[], group?: string, state?: "ok"|"fail"|"na"}} Row  (a row with `group` is a group heading)
      props: { caption, captionHidden, columns: Column[], rows: Row[], emptyText, loading, dense }
      The host is a <table> (rendered in place) or any element (a table is created inside). */
  var STATE = { ok: ["st-ok", "✓", "applied and met"], fail: ["st-fail", "✕", "not met"], na: ["st-na", "–", "not applicable to what is drawn"] };
  function table(host, props) {
    var state = Object.assign({ columns: [], rows: [], emptyText: "No rows.", loading: false }, props);
    var tbl = host.tagName === "TABLE" ? host : h("table"); if (tbl !== host) clear(host).appendChild(tbl);
    tbl.classList.add("ui-table");
    function build() {
      clear(tbl);
      tbl.classList.toggle("dense", !!state.dense); tbl.setAttribute("aria-busy", state.loading ? "true" : "false");
      if (state.caption) tbl.appendChild(h("caption", { className: state.captionHidden ? "vh" : null, text: state.caption }));
      var tr = h("tr"); state.columns.forEach(function (c) { tr.appendChild(h("th", { scope: "col", className: c.kind === "num" ? "num" : null }, [c.hidden ? h("span", { className: "vh", text: c.label }) : c.label])); });   // a hidden label still names the column for a screen reader
      tbl.appendChild(h("thead", null, [tr]));
      var tbody = h("tbody"), n = state.columns.length;
      if (state.loading) { for (var i = 0; i < 3; i++) { var sk = h("tr", { className: "skeleton", "aria-hidden": "true" }); for (var j = 0; j < n; j++) sk.appendChild(h("td", null, [h("span", { className: "sk-line w60" })])); tbody.appendChild(sk); } }
      else if (!state.rows.length) tbody.appendChild(h("tr", null, [h("td", { colspan: n, className: "empty", text: state.emptyText })]));
      state.rows.forEach(function (r) {
        if (r.group) { tbody.appendChild(h("tr", { className: "group" }, [h("th", { scope: "rowgroup", colspan: n, text: r.group })])); return; }
        var row = h("tr");
        r.cells.slice(0, n).forEach(function (c, i) {
          var col = state.columns[i], td = h("td", { className: col.kind === "clause" ? "clause" : (col.kind === "status" ? "status-cell" : (col.kind === "num" ? "num" : null)) });
          if (col.kind === "status" && r.state && STATE[r.state]) { var s = STATE[r.state]; td.appendChild(h("span", { className: "st " + s[0], role: "img", "aria-label": s[2], title: s[2], text: s[1] })); }
          if (c && typeof c === "object" && c.nodeType) td.appendChild(c);   // a cell may carry an element (a colour swatch)
          else td.appendChild(document.createTextNode(c === null || c === undefined ? "" : String(c)));
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
      tbl.appendChild(tbody);
    }
    build();
    return { el: tbl, update: function (p) { Object.assign(state, p); build(); }, destroy: function () { clear(tbl); } };
  }

  // ------------------------------------------------------------------ Toolbar of labelled option groups (sheet tools)
  /** props: { ariaLabel, groups: [{ id, label, items: [{id, label}], value, onChange(id) }] } */
  function toolbar(host, props) {
    var state = Object.assign({ groups: [] }, props), bar = h("div", { role: "toolbar", "aria-label": state.ariaLabel || "Sheet options", className: "sheet-tools ui-toolbar" }), segs = {};
    function build() {
      clear(bar); segs = {};
      state.groups.forEach(function (g) {
        var lid = uid("grp"), wrap = h("div", { className: "grp", role: "group", "aria-labelledby": lid }), mount = h("div");
        wrap.appendChild(h("span", { id: lid, text: g.label })); wrap.appendChild(mount); bar.appendChild(wrap);
        segs[g.id] = segmented(mount, { items: g.items, value: g.value, ariaLabel: g.label, onChange: g.onChange });
      });
    }
    clear(host).appendChild(bar); build();
    return { el: bar, update: function (p) { var ids = p.groups ? p.groups.map(function (g) { return g.id; }).join() : null; var rebuild = p.groups && ids !== state.groups.map(function (g) { return g.id; }).join(); Object.assign(state, p); if (rebuild) build(); else state.groups.forEach(function (g) { if (segs[g.id]) segs[g.id].update({ items: g.items, value: g.value, onChange: g.onChange }); }); }, destroy: function () { Object.keys(segs).forEach(function (k) { segs[k].destroy(); }); clear(host); } };
  }

  // ------------------------------------------------------------------ Stepper (a bounded number with - and + buttons)
  /** props: { id, label, value, min, max, step, onChange(n), help, maxReason, disabled, suffix } */
  function stepper(host, props) {
    var state = Object.assign({ value: 0, min: 0, max: 0, step: 1 }, props), id = state.id || uid("step"), helpId = id + "-help";
    var input = h("input", { type: "number", id: id, className: "ui-stepper-input", inputmode: "numeric", "aria-describedby": helpId });
    var dec = h("button", { type: "button", className: "ui-stepper-btn", "aria-label": "Fewer " + (state.label || "").toLowerCase(), text: "−" }), inc = h("button", { type: "button", className: "ui-stepper-btn", "aria-label": "More " + (state.label || "").toLowerCase(), text: "+" });
    var label = h("label", { htmlFor: id, text: state.label || "" }), help = h("p", { id: helpId, className: "muted ui-stepper-help" }), row = h("div", { className: "ui-stepper-row" }, [dec, input, inc, state.suffix ? h("span", { className: "muted", text: state.suffix }) : null]);
    label.htmlFor = id;
    var root = h("div", { className: "row ui-stepper" }, [label, h("div", null, [row, help])]);
    function clamp(n) { n = isNaN(n) ? state.min : n; return Math.max(state.min, Math.min(state.max, Math.round(n / state.step) * state.step)); }
    function sync() {
      var off = !!state.disabled || state.max <= state.min && state.max === 0;
      input.value = String(state.value); input.min = String(state.min); input.max = String(state.max); input.step = String(state.step); input.disabled = off;
      input.setAttribute("aria-valuemin", state.min); input.setAttribute("aria-valuemax", state.max); input.setAttribute("aria-valuenow", state.value);
      dec.disabled = off || state.value <= state.min; inc.disabled = off || state.value >= state.max;
      help.textContent = state.help || ("up to " + state.max + (state.maxReason ? " (" + state.maxReason + ")" : ""));
      root.classList.toggle("off", off);
    }
    function set(n, fire) { var v = clamp(n); var changed = v !== state.value; state.value = v; sync(); if (changed && fire && state.onChange) state.onChange(v); }
    dec.addEventListener("click", function () { set(state.value - state.step, true); });
    inc.addEventListener("click", function () { set(state.value + state.step, true); });
    input.addEventListener("change", function () { set(parseInt(input.value, 10), true); });
    input.addEventListener("keydown", function (e) { if (e.key === "ArrowUp") { e.preventDefault(); set(state.value + state.step, true); } else if (e.key === "ArrowDown") { e.preventDefault(); set(state.value - state.step, true); } });
    clear(host).appendChild(root); sync();
    return { el: root, input: input, update: function (p) { Object.assign(state, p); state.value = clamp(state.value); sync(); }, get value() { return state.value; }, destroy: function () { clear(host); } };
  }

  // ------------------------------------------------------------------ Field (a labelled select or text input with help and error)
  /** props: { id, label, type: "select"|"text"|"number", options: [{value, label, disabled, title}], value, onChange(value), help, error, disabled, placeholder, list } */
  function field(host, props) {
    var state = Object.assign({ type: "select", options: [], value: "" }, props), id = state.id || uid("field"), helpId = id + "-help", errId = id + "-err";
    var input = state.type === "select" ? h("select", { id: id }) : h("input", { id: id, type: state.type, placeholder: state.placeholder || null, list: state.list || null, autocomplete: state.autocomplete || null });
    var label = h("label", { htmlFor: id, text: state.label }), help = h("p", { id: helpId, className: "muted ui-field-help" }), err = h("p", { id: errId, className: "ui-field-error", role: "alert" });
    label.htmlFor = id;
    var root = h("div", { className: "row ui-field" }, [label, h("div", null, [input, help, err])]);
    function sync() {
      if (state.type === "select") {
        var cur = String(state.value);
        if (input.options.length !== state.options.length || Array.prototype.some.call(input.options, function (o, i) { return o.value !== String(state.options[i].value) || o.textContent !== state.options[i].label; })) {
          clear(input); state.options.forEach(function (o) { input.appendChild(h("option", { value: String(o.value), text: o.label, disabled: !!o.disabled, title: o.title || null })); });
        }
        if (state.options.some(function (o) { return String(o.value) === cur; })) input.value = cur; else if (state.options.length) { input.selectedIndex = 0; }
      } else if (input.value !== String(state.value)) input.value = state.value === null || state.value === undefined ? "" : state.value;
      input.disabled = !!state.disabled;
      help.textContent = state.help || ""; help.hidden = !state.help;
      err.textContent = state.error || ""; err.hidden = !state.error;
      input.setAttribute("aria-invalid", state.error ? "true" : "false");
      var desc = [state.help ? helpId : null, state.error ? errId : null].filter(Boolean).join(" ");
      if (desc) input.setAttribute("aria-describedby", desc); else input.removeAttribute("aria-describedby");
    }
    input.addEventListener("change", function () { state.value = input.value; if (state.onChange) state.onChange(input.value); });
    if (state.onEnter) input.addEventListener("keydown", function (e) { if (e.key === "Enter") state.onEnter(input.value); });
    clear(host).appendChild(root); sync();
    return { el: root, input: input, update: function (p) { Object.assign(state, p); sync(); }, get value() { return input.value; }, destroy: function () { clear(host); } };
  }

  // ------------------------------------------------------------------ Notice (a result or a warning, with an optional list)
  /** props: { tone: "ok"|"warn"|"error"|"info", title, text, items: string[] } */
  function notice(host, props) {
    var state = Object.assign({ tone: "info", items: [] }, props), root = h("div", { className: "ui-notice" });
    function build() {
      clear(root); root.className = "ui-notice " + state.tone; root.setAttribute("role", state.tone === "error" ? "alert" : "status");
      root.appendChild(h("span", { className: "ui-notice-icon", "aria-hidden": "true", text: state.tone === "ok" ? "✓" : (state.tone === "error" ? "✕" : (state.tone === "warn" ? "!" : "i")) }));
      var body = h("div", { className: "ui-notice-body" });
      if (state.title) body.appendChild(h("strong", { text: state.title }));
      if (state.text) body.appendChild(h("span", { text: (state.title ? " " : "") + state.text }));
      if (state.items && state.items.length) body.appendChild(h("ul", null, state.items.map(function (t) { return h("li", { text: t }); })));
      root.appendChild(body);
    }
    clear(host).appendChild(root); build();
    return { el: root, update: function (p) { Object.assign(state, p); build(); }, destroy: function () { clear(host); } };
  }

  // ------------------------------------------------------------------ Busy placeholder (while a sheet is computed)
  /** props: { text } */
  function busy(host, props) {
    var state = Object.assign({ text: "Working…" }, props), p = h("p", { className: "empty busy", role: "status", "aria-live": "polite", text: state.text });
    host.setAttribute("aria-busy", "true"); clear(host).appendChild(p);
    return { el: p, update: function (q) { Object.assign(state, q); p.textContent = state.text; }, destroy: function () { host.removeAttribute("aria-busy"); if (p.parentNode) p.parentNode.removeChild(p); } };
  }

  // ------------------------------------------------------------------ Icon / toggle button (enhances an existing button)
  /** props: { label (the accessible name; omit it when the button's own text already says what it does), title, pressed, onToggle(pressed), disabled } */
  function toggleButton(button, props) {
    var state = Object.assign({ pressed: false }, props);
    function sync() {
      if (state.label) button.setAttribute("aria-label", state.label);
      if (state.title || state.label) button.title = state.title || state.label;
      button.setAttribute("aria-pressed", state.pressed ? "true" : "false"); button.classList.toggle("on", !!state.pressed); button.disabled = !!state.disabled;
    }
    function onClick() { state.pressed = !state.pressed; sync(); if (state.onToggle) state.onToggle(state.pressed); }
    button.addEventListener("click", onClick); sync();
    return { el: button, update: function (p) { Object.assign(state, p); sync(); }, toggle: onClick, get pressed() { return state.pressed; }, destroy: function () { button.removeEventListener("click", onClick); } };
  }

  return { tabs: tabs, segmented: segmented, status: status, collapsible: collapsible, optionList: optionList, table: table, toolbar: toolbar, stepper: stepper, field: field, notice: notice, busy: busy, toggleButton: toggleButton, h: h, uid: uid, STATE: STATE };
})();
