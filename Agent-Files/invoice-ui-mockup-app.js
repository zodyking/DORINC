/* DORINC Ledger UI Mockup — full client-side interactivity (no backend) */
(function () {
  "use strict";

  var money = function (n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ── Mock data ── */
  var MOCK = {
    invoices: {
      "092": { id: "INV-000092", status: "sent", statusLabel: "Sent · awaiting payment", customer: "Hollis Logistics LLC", tag: "Truck #HL-114", vehicle: "2019 Freightliner Cascadia", vin: "3AKJHHDR9KSJV1234", amount: "$2,418.32", balance: "$841.88", due: "Aug 02, 2026", page: "invoice-detail" },
      "091": { id: "INV-000091", status: "sent", statusLabel: "Sent · awaiting payment", customer: "City of Dover Fleet", tag: "Bus #DOV-31", vehicle: "2021 Ford F-550 Super Duty", vin: "1FDUF5HT3MDA0871", amount: "$1,106.75", balance: "$1,106.75", due: "Jul 31, 2026", page: "invoice-detail" },
      "090": { id: "INV-000090", status: "paid", statusLabel: "Paid in full", customer: "Marren Farms", tag: "Loader #MF-03", vehicle: "CAT 259D3 Skid Steer", vin: "CAT259DKFT904412", amount: "$3,290.00", balance: "$0.00", due: "Jul 28, 2026", page: "invoice-detail" },
      "089": { id: "INV-000089", status: "over", statusLabel: "Overdue · 13 days", customer: "K&S Towing & Recovery", tag: "Truck #KS-07", vehicle: "2018 Kenworth T680", vin: "1XKYD49X1JJ191204", amount: "$2,754.47", balance: "$2,754.47", due: "Jul 24, 2026", page: "invoice-detail" },
      "088": { id: "INV-000088", status: "paid", statusLabel: "Paid in full", customer: "Hollis Logistics LLC", tag: "Truck #HL-109", vehicle: "2020 International MV607", vin: "1HTEUMML7LH552390", amount: "$867.90", balance: "$0.00", due: "Jul 21, 2026", page: "invoice-detail" },
      "087": { id: "INV-000087", status: "draft", statusLabel: "Draft", customer: "Blue Ridge Paving Co.", tag: "Truck #BR-439293", vehicle: "2017 Mack GU713", vin: "1M2AX07C4HM034566", amount: "$5,120.18", balance: "$5,120.18", due: "Jul 18, 2026", page: "editor", complaint: "Hydraulic leak at boom pivot — unit down on job site", internalNotes: "Replaced boom cylinder seal kit. Pressure-tested at 3,200 PSI. Recommend fluid analysis at next PM.", sourceLog: null },
      "086": { id: "INV-000086", status: "paid", statusLabel: "Paid in full", customer: "Marren Farms", tag: "Tractor #MF-07", vehicle: "2015 John Deere 6155M", vin: "1L06155MKFH812345", amount: "$1,482.60", balance: "$0.00", due: "Jul 15, 2026", page: "invoice-detail" },
      "084": { id: "INV-000084", status: "over", statusLabel: "Overdue · 4 days", customer: "Blue Ridge Paving Co.", tag: "Equipment #BR-12", vehicle: "2016 Bobcat T650", vin: "ALJG11223KT090441", amount: "$1,106.75", balance: "$1,106.75", due: "Jul 03, 2026", page: "invoice-detail" },
      "093": { id: "INV-000093", status: "draft", statusLabel: "Draft", customer: "K&S Towing & Recovery", tag: "Truck #KS-07", vehicle: "2018 Kenworth T680", vin: "1XKYD49X1JJ191204", amount: "$684.00", balance: "$684.00", due: "—", page: "editor", complaint: "Scheduled PM B — driver noted rough idle at cold start", internalNotes: "Replaced fuel filters, greased fittings, brake lining check. 6 line items from handwritten sheet.", sourceLog: "3319" },
      "095": { id: "INV-000095", status: "draft", statusLabel: "Draft", customer: "Hollis Logistics LLC", tag: "Truck #HL-114", vehicle: "2019 Freightliner Cascadia", vin: "3AKJHHDR9KSJV1234", amount: "$952.39", balance: "$952.39", due: "Aug 06, 2026", page: "editor", complaint: "Check engine light on, reduced power, regen incomplete — driver reports fault since Monday morning.", internalNotes: "P20EE stored, outlet NOx sensor failed bench test. Replaced sensor P/N 2894940, ECM relearn completed. Monitor DPF soot load over next 500 mi.", sourceLog: "3312" }
    },
    customers: {
      hollis: { name: "Hollis Logistics LLC", contact: "Marcus Hollis", email: "m.hollis@hollislogistics.com", open: "$3,286.20", vehicles: 6, portal: true },
      marren: { name: "Marren Farms", contact: "Ellen Marren", email: "accounts@marrenfarms.com", open: "$9,712.00", vehicles: 9, portal: true },
      dover: { name: "City of Dover Fleet", contact: "R. Whitfield", email: "fleet@doverde.gov", open: "$1,106.75", vehicles: 12, portal: false },
      ks: { name: "K&S Towing & Recovery", contact: "Sam Kessler", email: "dispatch@kstowing.com", open: "$3,438.47", vehicles: 4, portal: true },
      blue: { name: "Blue Ridge Paving Co.", contact: "T. Alvarez", email: "office@blueridgepaving.com", open: "$6,226.93", vehicles: 7, portal: true },
      gary: { name: "Gary Wilmot", contact: "Gary Wilmot", email: "gwilmot@gmail.com", open: "$0.00", vehicles: 1, portal: false }
    },
    users: {
      devon: { name: "Devon R.", email: "devon@dorinc.local", role: "Super Admin", roleCls: "indigo", initials: "DV", avCls: "indigo", logs: 12, invoices: 32 },
      alicia: { name: "Alicia M.", email: "alicia@dorinc.local", role: "Accountant", roleCls: "warn", initials: "AM", avCls: "amber", logs: 0, invoices: 28 },
      jordan: { name: "Jordan T.", email: "jordan@dorinc.local", role: "Mechanic", roleCls: "info", initials: "JT", avCls: "teal", logs: 84, invoices: 0 },
      riley: { name: "Riley K.", email: "riley@dorinc.local", role: "Viewer", roleCls: "gray", initials: "RK", avCls: "slate", logs: 0, invoices: 0 },
      marcus: { name: "Marcus Hollis", email: "m.hollis@hollislogistics.com", role: "Customer", roleCls: "gray", initials: "MH", avCls: "rose", logs: 0, invoices: 0 },
      ellen: { name: "Ellen Marren", email: "accounts@marrenfarms.com", role: "Customer", roleCls: "gray", initials: "EM", avCls: "teal", logs: 0, invoices: 0 }
    },
    logs: {
      "3319": { id: "SL-3319", tag: "Truck #KS-07", title: "PM service B", customer: "K&S Towing & Recovery", status: "Awaiting review", statusCls: "warn", complaint: "Scheduled PM B — driver noted rough idle at cold start, no active fault lights.", internalNotes: "Replaced fuel filters, greased all fittings, checked brake lining. Handwritten sheet attached — 6 line items noted for invoicing.", submittedBy: "Jordan T.", uploaded: "Jul 3, 2026 · 2:14 PM", serviceDate: "Jul 3, 2026", workType: "Preventive maintenance", photos: ["🖼", "🖼", "🖼", "📄"], draftLines: [
        { desc: "Fuel filter, primary (OEM)", qty: "1", rate: "$48.20", amount: "$48.20" },
        { desc: "Fuel filter, secondary (OEM)", qty: "1", rate: "$62.10", amount: "$62.10" },
        { desc: "Labor — PM service B", qty: "2.5 hr", rate: "$145.00", amount: "$362.50" },
        { desc: "Grease, chassis (bulk)", qty: "2", rate: "$12.00", amount: "$24.00" },
        { desc: "Brake lining inspection", qty: "0.5 hr", rate: "$145.00", amount: "$72.50" },
        { desc: "Shop supplies", qty: "—", rate: "—", amount: "$18.50" }
      ]},
      "3318": { id: "SL-3318", tag: "Equipment #BR-12", title: "track replacement", customer: "Blue Ridge Paving Co.", status: "Awaiting review", statusCls: "warn", complaint: "Right track throwing — operator reports slipping on grade.", internalNotes: "Track pads at 15% — replaced RH track assembly. Adjusted tension, torqued to spec.", submittedBy: "Jordan T.", uploaded: "Jul 2, 2026 · 4:02 PM", serviceDate: "Jul 2, 2026", workType: "Repair / breakdown", photos: ["🖼", "🔧", "📄"], draftLines: [
        { desc: "Track assembly, RH (Bobcat T650)", qty: "1", rate: "$1,840.00", amount: "$1,840.00" },
        { desc: "Labor — track replacement", qty: "4 hr", rate: "$145.00", amount: "$580.00" }
      ]},
      "3317": { id: "SL-3317", tag: "Bus #DOV-31", title: "rear brake job", customer: "City of Dover Fleet", status: "Awaiting review", statusCls: "warn", complaint: "Brake pull to the right, squeal under light braking.", internalNotes: "RR drums glazed, shoes at 20%. Replaced shoes and hardware, machined drums.", submittedBy: "Jordan T.", uploaded: "Jul 1, 2026 · 11:30 AM", serviceDate: "Jul 1, 2026", workType: "Repair / breakdown", photos: ["🖼", "🛞", "📄"], draftLines: [
        { desc: "Brake shoes, rear (set)", qty: "1", rate: "$186.40", amount: "$186.40" },
        { desc: "Labor — rear brake service", qty: "2.5 hr", rate: "$145.00", amount: "$362.50" }
      ]},
      "3316": { id: "SL-3316", tag: "Tractor #MF-07", title: "cooling system", customer: "Marren Farms", status: "Invoiced", statusCls: "ok", complaint: "Overheating under load in hay field.", internalNotes: "Thermostat stuck closed. Replaced t-stat and upper hose. Flushed system.", submittedBy: "Jordan T.", uploaded: "Jun 26, 2026 · 3:55 PM", serviceDate: "Jun 26, 2026", workType: "Repair / breakdown", photos: ["🖼", "📄"], draftLines: [] },
      "3312": { id: "SL-3312", tag: "Truck #HL-114", title: "DPF diagnostic", customer: "Hollis Logistics LLC", status: "Invoiced", statusCls: "ok", complaint: "Check engine light on, reduced power, regen incomplete — driver reports fault since Monday morning.", internalNotes: "P20EE stored, outlet NOx sensor failed bench test. Replaced sensor P/N 2894940, ECM relearn completed. Monitor DPF soot load over next 500 mi.", submittedBy: "Jordan T.", uploaded: "Jun 28, 2026 · 10:42 AM", serviceDate: "Jun 28, 2026", workType: "Diagnostic", photos: ["📄", "🖼", "🖼", "🔧"], draftLines: [
        { desc: "Diesel diagnostic — DPF regeneration fault", qty: "2 hr", rate: "$145.00", amount: "$290.00" },
        { desc: "NOx sensor, outlet (OEM 2894940)", qty: "1", rate: "$412.68", amount: "$412.68" },
        { desc: "NOx sensor replacement + ECM relearn", qty: "1.5 hr", rate: "$145.00", amount: "$217.50" }
      ]}
    },
    catalog: [
      { name: "Labor — Diesel tech", sub: "$145.00 / hr · standard rate", type: "Labor", rate: 145 },
      { name: "Labor — Onsite service call", sub: "$95.00 flat · mobile dispatch", type: "Labor", rate: 95 },
      { name: "Oil, 15W-40 (bulk gal)", sub: "$18.40 · PART-0114", type: "Part", rate: 18.4 },
      { name: "DPF gasket & clamp kit", sub: "$64.20 · PART-0301", type: "Part", rate: 64.2 }
    ]
  };

  var ctx = { invoice: "092", customer: "hollis", user: "jordan", log: "3319", editorLog: "3312" };

  /* ── Toast + modal ── */
  function toast(msg, kind) {
    var rack = document.getElementById("toasts");
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.innerHTML = "<span>" + msg + '</span><button class="x" aria-label="Dismiss">✕</button>';
    rack.appendChild(el);
    el.querySelector(".x").onclick = function () { el.remove(); };
    setTimeout(function () { if (el.parentNode) el.remove(); }, 4500);
  }

  function confirmModal(title, body, onOk, okLabel) {
    var scrim = document.getElementById("modal-scrim");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").textContent = body;
    var foot = document.getElementById("modal-foot");
    foot.innerHTML = "";
    var cancel = document.createElement("button");
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.onclick = closeModal;
    var ok = document.createElement("button");
    ok.className = "btn primary";
    ok.textContent = okLabel || "Confirm";
    ok.onclick = function () { closeModal(); if (onOk) onOk(); };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    scrim.classList.add("open");
  }

  function closeModal() {
    document.getElementById("modal-scrim").classList.remove("open");
  }

  document.getElementById("modal-scrim").addEventListener("click", function (e) {
    if (e.target.id === "modal-scrim") closeModal();
  });

  /* ── Navigation ── */
  var crumbs = {
    dashboard: "Workspace / <b>Dashboard</b>",
    invoices: "Workspace / <b>Invoices</b>",
    "invoice-detail": "Invoices / <b id='crumb-inv'>INV-000092</b>",
    create: "Invoices / <b>New Invoice</b>",
    editor: "Invoices / <b>Editor — INV-000095</b>",
    designer: "Billing tools / <b>Template Designer</b>",
    customers: "Workspace / <b>Customers</b>",
    "customer-detail": "Customers / <b id='crumb-cust'>Hollis Logistics LLC</b>",
    vehicles: "Workspace / <b>Vehicles</b>",
    "vehicle-detail": "Vehicles / <b id='crumb-veh'>Truck #HL-114</b>",
    servicelogs: "Workspace / <b>Service Logs</b>",
    "servicelog-create": "Service Logs / <b>New log</b>",
    "servicelog-detail": "Service Logs / <b id='crumb-log'>SL-3319</b>",
    catalog: "Workspace / <b>Catalog</b>",
    users: "System / <b>Users</b>",
    "user-detail": "Users / <b id='crumb-user'>Jordan T.</b>",
    admin: "Super Admin / <b>Control Panel</b>",
    audit: "System / <b>System Logs</b>",
    account: "Account / <b>My Account</b>",
    payment: "Invoices / <b>Record Payment</b>"
  };
  var navParent = {
    "invoice-detail": "invoices", "customer-detail": "customers",
    "servicelog-detail": "servicelogs", "servicelog-create": "servicelogs", "user-detail": "users", "vehicle-detail": "vehicles",
    create: "create", editor: "editor", payment: "invoices", account: null,
    admin: "admin"
  };
  var pageSearch = {
    invoices: { placeholder: "Search invoice #, customer, VIN…", target: "inv-rows" },
    customers: { placeholder: "Search customers by name, contact, email…", target: "cust-grid" },
    vehicles: { placeholder: "Search tag, VIN, fleet #, customer…", target: "staff-veh-rows" },
    servicelogs: { placeholder: "Search service logs…", target: "log-queue" },
    catalog: { placeholder: "Search items, SKUs, categories…", target: "cat-rows" },
    users: { placeholder: "Search users by name, email, role…", target: "users-page-list" },
    audit: { placeholder: "Search system events, users, actions…", target: "audit-rows" },
    admin: { placeholder: "Search users…", target: "user-list" }
  };
  var users = {
    devon: { name: "Devon R.", email: "devon@dorinc.local", role: "Super Admin", initials: "DV", cls: "indigo", greeting: "Devon", nav: null },
    alicia: { name: "Alicia M.", email: "alicia@dorinc.local", role: "Accountant", initials: "AM", cls: "amber", greeting: "Alicia", nav: ["dashboard", "invoices", "create", "editor", "customers", "vehicles", "servicelogs", "catalog", "account"] },
    jordan: { name: "Jordan T.", email: "jordan@dorinc.local", role: "Mechanic", initials: "JT", cls: "teal", greeting: "Jordan", nav: ["dashboard", "vehicles", "servicelogs", "servicelog-create", "servicelog-detail", "account"] },
    riley: { name: "Riley K.", email: "riley@dorinc.local", role: "Viewer", initials: "RK", cls: "slate", greeting: "Riley", nav: ["dashboard", "invoices", "customers", "vehicles", "servicelogs", "catalog", "account"] }
  };
  var currentUser = "devon";

  var sidebar = document.getElementById("sidebar");
  var scrim = document.getElementById("scrim");
  var crumb = document.getElementById("crumb");
  var topsearch = document.getElementById("topsearch");
  var topsearchInput = document.getElementById("topsearch-input");
  var demobar = document.getElementById("demobar");
  var avbtn = document.getElementById("avbtn");
  var menu = document.getElementById("acctmenu");

  function applyUser(key) {
    var u = users[key];
    if (!u) return;
    currentUser = key;
    var av = avbtn.querySelector(".av");
    av.textContent = u.initials;
    av.className = "av " + u.cls;
    avbtn.querySelector(".who b").textContent = u.name;
    avbtn.querySelector(".who small").textContent = u.role;
    document.getElementById("menu-head").innerHTML = "<b>" + u.name + "</b><small>" + u.email + "</small><br /><span class=\"role\" id=\"menu-role\">" + u.role + "</span>";
    document.getElementById("dash-greeting").textContent = "Good morning, " + u.greeting;
    document.querySelectorAll(".uswitch").forEach(function (btn) {
      var on = btn.getAttribute("data-user") === key;
      btn.classList.toggle("on", on);
      btn.querySelector(".chk").style.display = on ? "" : "none";
    });
    demobar.classList.toggle("show", key !== "devon");
    document.getElementById("demo-name").textContent = u.name;
    document.getElementById("demo-role").textContent = u.role;
    document.querySelectorAll(".side .nav-item").forEach(function (btn) {
      var page = btn.getAttribute("data-nav");
      if (!u.nav) { btn.classList.remove("hidden"); return; }
      btn.classList.toggle("hidden", u.nav.indexOf(page) === -1);
    });
    document.querySelectorAll("[data-req]").forEach(function (el) {
      var req = el.getAttribute("data-req");
      el.style.display = !u.nav || u.nav.indexOf(req) !== -1 ? "" : "none";
    });
    updateRoleUI();
  }

  function updateRoleUI() {
    var u = users[currentUser];
    var isMech = u.role === "Mechanic";
    var primary = document.getElementById("dash-primary-cta");
    var secondary = document.getElementById("dash-secondary-cta");
    if (primary) {
      primary.textContent = isMech ? "+ New Service Log" : "+ New Invoice";
      primary.setAttribute("data-nav", isMech ? "servicelog-create" : "create");
    }
    if (secondary) {
      secondary.textContent = isMech ? "My service logs" : "Review queue · 7";
      secondary.setAttribute("data-nav", "servicelogs");
    }
    var sub = document.getElementById("dash-subtext");
    if (sub) {
      sub.textContent = isMech
        ? "Tuesday, July 7, 2026 · 2 logs awaiting review"
        : "Tuesday, July 7, 2026 · 3 items need your attention";
    }
    var billing = document.getElementById("dash-billing");
    var mechDash = document.getElementById("dash-mechanic");
    if (billing) billing.style.display = isMech ? "none" : "";
    if (mechDash) mechDash.style.display = isMech ? "" : "none";
    document.querySelectorAll(".sl-accountant-only").forEach(function (el) {
      el.style.display = isMech ? "none" : "";
    });
    document.querySelectorAll(".sl-mechanic-only").forEach(function (el) {
      el.style.display = isMech ? "" : "none";
    });
    var slTitle = document.getElementById("sl-page-title");
    var slSub = document.getElementById("sl-page-sub");
    var slQueue = document.getElementById("sl-queue-title");
    if (slTitle) slTitle.textContent = isMech ? "My Service Logs" : "Service Logs";
    if (slSub) slSub.textContent = isMech
      ? "Your field uploads — accountants review and invoice from here"
      : "Field uploads land here for review before they become invoice lines";
    if (slQueue) slQueue.textContent = isMech ? "My uploads · 4" : "Review queue · 4";
    var activePage = document.querySelector("#app-shell .page.active");
    if (activePage) {
      var pageId = activePage.id.replace("page-", "");
      if (pageSearch[pageId]) updateTopSearch(pageId);
      else topsearch.classList.remove("show");
    }
  }

  function filterList(listId, q, extraFilter) {
    var list = document.getElementById(listId);
    var empty = document.getElementById(listId + "-empty");
    if (!list) return 0;
    var visible = 0;
    Array.prototype.forEach.call(list.children, function (item) {
      var textHit = q === "" || item.textContent.toLowerCase().indexOf(q) !== -1;
      var chipHit = !extraFilter || extraFilter === "all" || item.getAttribute("data-chip") === extraFilter;
      var show = textHit && chipHit;
      item.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (empty) empty.style.display = visible === 0 ? "block" : "none";
    return visible;
  }

  function updateTopSearch(name) {
    var cfg = pageSearch[name];
    if (!cfg) {
      topsearch.classList.remove("show");
      topsearchInput.value = "";
      return;
    }
    topsearch.classList.add("show");
    topsearchInput.placeholder = cfg.placeholder;
    topsearchInput.value = "";
    topsearchInput.dataset.target = cfg.target;
    var list = document.getElementById(cfg.target);
    if (list) Array.prototype.forEach.call(list.children, function (c) { c.style.display = ""; });
    var empty = document.getElementById(cfg.target + "-empty");
    if (empty) empty.style.display = "none";
    if (name === "customers") custFsApply();
    if (name === "vehicles") vehFsApply();
    if (name === "users") usersFsApply();
  }

  /* ── Populate detail pages ── */
  function populateInvoice(key) {
    var inv = MOCK.invoices[key];
    if (!inv) return;
    ctx.invoice = key;
    var page = document.getElementById("page-invoice-detail");
    page.querySelector(".pagehead h2").innerHTML = inv.id + ' <span class="pill ' + inv.status + '" style="vertical-align:3px">' + inv.statusLabel + "</span>";
    page.querySelector(".pagehead p").innerHTML = '<a href="#" data-nav="invoices">Invoices</a> / ' + inv.id + " · " + inv.customer;
    var kv = page.querySelectorAll(".kv");
    if (kv[0]) {
      var dds = kv[0].querySelectorAll("dd");
      if (dds[0]) dds[0].textContent = inv.customer;
    }
    if (kv[1]) {
      var vdds = kv[1].querySelectorAll("dd");
      if (vdds[0]) vdds[0].textContent = inv.tag + " · " + inv.vehicle;
      if (vdds[1]) vdds[1].textContent = inv.vin;
      if (vdds[3]) vdds[3].textContent = inv.tag.replace(/^.*#/, "#");
    }
    var grand = page.querySelector(".ed-sums .grand span:last-child");
    if (grand) grand.textContent = inv.balance;
    crumbs["invoice-detail"] = "Invoices / <b>" + inv.id + "</b>";
    var payPage = document.getElementById("page-payment");
    if (payPage) {
      payPage.querySelector(".pagehead p").innerHTML = '<a href="#" data-nav="invoice-detail" data-ref="invoice:' + key + '">' + inv.id + "</a> · " + inv.customer + " · balance " + inv.balance;
      var pkv = payPage.querySelector(".kv");
      if (pkv) {
        var pdds = pkv.querySelectorAll("dd");
        if (pdds[0]) pdds[0].textContent = inv.id;
        if (pdds[3]) { pdds[3].textContent = inv.balance; pdds[3].style.color = "#4f46e5"; }
      }
      var amtInput = payPage.querySelector('input[type="number"]');
      if (amtInput) amtInput.value = parseFloat(inv.balance.replace(/[$,]/g, "")) || 0;
    }
  }

  function populateCustomer(key) {
    var c = MOCK.customers[key];
    if (!c) return;
    ctx.customer = key;
    var page = document.getElementById("page-customer-detail");
    page.querySelector(".pagehead h2").innerHTML = c.name + ' <span class="pill ' + (c.portal ? "ok" : "gray") + '" style="vertical-align:3px">' + (c.portal ? "Portal enabled" : "Portal off") + "</span>";
    page.querySelector(".pagehead p").innerHTML = '<a href="#" data-nav="customers">Customers</a> / ' + c.name;
    var kpi = page.querySelector(".kpis .kpi .v");
    if (kpi) kpi.textContent = c.open;
    crumbs["customer-detail"] = "Customers / <b>" + c.name + "</b>";
  }

  function populateUser(key) {
    var u = MOCK.users[key];
    if (!u) return;
    ctx.user = key;
    var page = document.getElementById("page-user-detail");
    page.querySelector(".pagehead h2").innerHTML = u.name + ' <span class="pill ' + u.roleCls + '" style="vertical-align:3px">' + u.role + "</span>";
    page.querySelector(".pagehead p").innerHTML = '<a href="#" data-nav="users">Users</a> / ' + u.email;
    var av = page.querySelector(".cbody .av");
    if (av) { av.textContent = u.initials; av.className = "av " + u.avCls; }
    var inputs = page.querySelectorAll(".cbody input");
    if (inputs[0]) inputs[0].value = u.name;
    if (inputs[1]) inputs[1].value = u.email;
    var kv = page.querySelector(".kv");
    if (kv) {
      var dds = kv.querySelectorAll("dd");
      if (dds[2]) dds[2].textContent = u.logs + " submitted";
      if (dds[3]) dds[3].textContent = String(u.invoices);
    }
    crumbs["user-detail"] = "Users / <b>" + u.name + "</b>";
  }

  function populateLog(key) {
    var l = MOCK.logs[key];
    if (!l) return;
    ctx.log = key;
    var page = document.getElementById("page-servicelog-detail");
    page.querySelector(".pagehead h2").innerHTML = l.id + ' <span class="pill ' + l.statusCls + '" style="vertical-align:3px">' + l.status + "</span>";
    page.querySelector(".pagehead p").innerHTML = '<a href="#" data-nav="servicelogs">Service Logs</a> / ' + l.tag + " · " + l.customer;
    var complaintEl = document.getElementById("log-complaint");
    var internalEl = document.getElementById("log-internal");
    if (complaintEl) complaintEl.textContent = l.complaint || "—";
    if (internalEl) internalEl.textContent = l.internalNotes || "—";
    var photosWrap = page.querySelector(".photos");
    if (photosWrap && l.photos) {
      photosWrap.innerHTML = "";
      l.photos.forEach(function (icon) {
        var ph = document.createElement("div");
        ph.className = "photo";
        ph.textContent = icon;
        photosWrap.appendChild(ph);
      });
      var photoCard = photosWrap.closest(".card");
      var photoHead = photoCard && photoCard.querySelector(".chead h3");
      if (photoHead) photoHead.textContent = "Uploaded files · " + l.photos.length;
    }
    crumbs["servicelog-detail"] = "Service Logs / <b>" + l.id + "</b>";
  }

  function setEdTab(name) {
    document.querySelectorAll("[data-ed-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-ed-tab") === name;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".ed-pane").forEach(function (pane) {
      pane.classList.toggle("active", pane.id === "ed-pane-" + name);
    });
  }

  function populateEditorLogPane(logKey) {
    var logTab = document.querySelector('[data-ed-tab="servicelog"]');
    var hint = document.getElementById("ed-tab-hint");
    var l = logKey ? MOCK.logs[logKey] : null;
    ctx.editorLog = logKey || null;

    if (!l) {
      if (logTab) {
        logTab.disabled = true;
        logTab.classList.remove("on");
      }
      if (hint) hint.textContent = "No service log attached — create from a log in the review queue to attach mechanic photos.";
      setEdTab("invoice");
      return;
    }

    if (logTab) logTab.disabled = false;
    if (hint) hint.textContent = "Mechanic photos and field notes from " + l.id + " attach to this invoice — switch tabs to reference while building line items.";

    var setText = function (id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val || "—";
    };

    setText("ed-log-ref", l.id);
    setText("ed-log-id", l.id);
    setText("ed-log-submitter", l.submittedBy || "—");
    setText("ed-log-uploaded", l.uploaded || "—");
    setText("ed-log-svc-date", l.serviceDate || "—");
    setText("ed-log-vehicle", l.tag + (l.vehicle ? " · " + l.vehicle : ""));
    setText("ed-log-work-type", l.workType || l.title || "—");

    var complaintView = document.getElementById("ed-log-complaint-view");
    var internalView = document.getElementById("ed-log-internal-view");
    if (complaintView) complaintView.textContent = l.complaint || "—";
    if (internalView) internalView.textContent = l.internalNotes || "—";

    var photos = document.getElementById("ed-log-photos");
    var photoCount = document.getElementById("ed-log-photo-count");
    if (photos) {
      photos.innerHTML = "";
      (l.photos || []).forEach(function (icon) {
        var ph = document.createElement("div");
        ph.className = "photo";
        ph.textContent = icon;
        photos.appendChild(ph);
      });
    }
    if (photoCount) photoCount.textContent = String((l.photos || []).length);

    var statusPill = document.getElementById("ed-log-status-pill");
    if (statusPill) {
      statusPill.textContent = l.status || "Attached";
      statusPill.className = "pill " + (l.statusCls || "info");
    }

    var linesBody = document.getElementById("ed-log-lines");
    if (linesBody) {
      linesBody.innerHTML = "";
      (l.draftLines || []).forEach(function (line) {
        var tr = document.createElement("tr");
        tr.innerHTML = "<td>" + line.desc + "</td><td>" + line.qty + "</td><td class=\"num\">" + line.rate + "</td><td class=\"num\">" + line.amount + "</td>";
        linesBody.appendChild(tr);
      });
      if (!l.draftLines || !l.draftLines.length) {
        linesBody.innerHTML = "<tr><td colspan=\"4\" style=\"color:#94a3b8; font-size:13px;\">No draft lines extracted yet.</td></tr>";
      }
    }

    var openFull = document.getElementById("ed-log-open-full");
    if (openFull) openFull.setAttribute("data-ref", "log:" + logKey);
  }

  function loadEditor(key) {
    var inv = MOCK.invoices[key];
    if (!inv) return;
    ctx.invoice = key;
    var page = document.getElementById("page-editor");
    page.querySelector(".pagehead h2").innerHTML = 'Invoice Editor <span class="pill draft" style="vertical-align:3px">Draft · ' + inv.id + "</span>";
    page.querySelector(".pagehead p").innerHTML = '<a href="#" data-nav="invoices">Invoices</a> / ' + inv.id + (inv.sourceLog && MOCK.logs[inv.sourceLog] ? ' · from <a href="#" data-nav="servicelog-detail" data-ref="log:' + inv.sourceLog + '">' + MOCK.logs[inv.sourceLog].id + "</a>" : "");
    var custSel = page.querySelector("select");
    if (custSel) {
      Array.prototype.forEach.call(custSel.options, function (o) {
        if (o.text === inv.customer) custSel.value = o.value || o.text;
      });
    }
    var complaint = document.getElementById("ed-complaint");
    var internal = document.getElementById("ed-internal");
    if (complaint) complaint.value = inv.complaint || "";
    if (internal) internal.value = inv.internalNotes || "";
    populateEditorLogPane(inv.sourceLog || null);
    setEdTab("invoice");
    crumbs.editor = "Invoices / <b>Editor — " + inv.id + "</b>";
  }

  function openSetTab(name) {
    document.querySelectorAll("#page-admin [data-settab]").forEach(function (t) {
      t.classList.toggle("on", t.getAttribute("data-settab") === name);
    });
    document.querySelectorAll("#page-admin .settab").forEach(function (panel) {
      panel.hidden = panel.id !== "settab-" + name;
    });
    if (name === "users") updateTopSearch("admin");
    else topsearch.classList.remove("show");
  }

  function go(name, ref) {
    if (name === "settings") {
      name = "admin";
      if (!ref) ref = "settab:users";
    }
    var target = document.getElementById("page-" + name);
    if (!target) return;
    var settabTarget = null;
    var u = users[currentUser];
    if (u && u.nav && u.nav.indexOf(name) === -1) {
      toast("Not available for " + u.role + " account (demo)", "warn");
      go(u.nav[0] || "dashboard");
      return;
    }
    if (ref) {
      var parts = ref.split(":");
      if (parts[0] === "invoice") populateInvoice(parts[1]);
      if (parts[0] === "customer") populateCustomer(parts[1]);
      if (parts[0] === "user") populateUser(parts[1]);
      if (parts[0] === "log") populateLog(parts[1]);
      if (parts[0] === "editor") loadEditor(parts[1]);
      if (parts[0] === "settab") {
        name = "admin";
        settabTarget = parts[1];
        ref = null;
        target = document.getElementById("page-admin");
        if (!target) return;
      }
    }
    if (name === "invoice-detail") populateInvoice(ctx.invoice);
    if (name === "customer-detail") populateCustomer(ctx.customer);
    if (name === "user-detail") populateUser(ctx.user);
    if (name === "servicelog-detail") populateLog(ctx.log);
    if (name === "servicelog-create") slWizardReset();
    if (name === "payment") populateInvoice(ctx.invoice);
    if (name === "editor" && !ref) populateEditorLogPane(ctx.editorLog || "3312");

    document.querySelectorAll("#app-shell .page").forEach(function (p) { p.classList.remove("active"); });
    target.classList.add("active");
    var hl = Object.prototype.hasOwnProperty.call(navParent, name) ? navParent[name] : name;
    document.querySelectorAll(".side .nav-item").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-nav") === hl);
    });
    crumb.innerHTML = crumbs[name] || "Workspace";
    updateTopSearch(name);
    closeMenu();
    closeNotif();
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
    window.scrollTo({ top: 0 });
    if (name === "admin") {
      if (settabTarget) openSetTab(settabTarget);
      else openSetTab("overview");
    }
  }

  function closeMenu() {
    menu.classList.remove("open");
    avbtn.setAttribute("aria-expanded", "false");
  }

  function closeNotif() {
    document.getElementById("notif-panel").classList.remove("open");
    document.getElementById("notif-btn").setAttribute("aria-expanded", "false");
  }

  /* ── Auto-tag list rows ── */
  function initTags() {
    document.querySelectorAll("#inv-rows tr, #page-dashboard .tbl tbody tr").forEach(function (tr) {
      var pill = tr.querySelector(".pill");
      if (!pill) return;
      var st = "all";
      ["paid", "sent", "over", "draft"].forEach(function (s) { if (pill.classList.contains(s)) st = s; });
      tr.setAttribute("data-chip", st);
      var lead = tr.querySelector(".lead");
      if (lead) {
        var num = lead.textContent.replace("INV-0000", "").replace("INV-", "");
        tr.setAttribute("data-ref", "invoice:" + num);
        var inv = MOCK.invoices[num];
        tr.setAttribute("data-nav", inv ? inv.page : "invoice-detail");
      }
    });
    document.querySelectorAll("#staff-veh-rows tr").forEach(function (tr) {
      var tag = tr.querySelector(".lead");
      if (!tag) return;
      var t = tag.textContent.toLowerCase();
      var chip = t.indexOf("bus") >= 0 ? "bus" : t.indexOf("loader") >= 0 || t.indexOf("equipment") >= 0 ? "equip" : t.indexOf("tractor") >= 0 ? "ag" : "truck";
      tr.setAttribute("data-chip", chip);
      tr.setAttribute("data-type", chip);
      tr.setAttribute("data-tag", tag.textContent.trim());
      if (tr.cells[2]) tr.setAttribute("data-customer", tr.cells[2].textContent.trim());
      if (tr.cells[3]) {
        var odoTxt = tr.cells[3].textContent.replace(/,/g, "");
        var odoNum = parseFloat(odoTxt) || 0;
        tr.setAttribute("data-odo", String(odoNum));
      }
      if (tr.cells[4]) {
        var svc = parseFsDate(tr.cells[4].textContent.trim());
        tr.setAttribute("data-service", svc ? String(svc.getTime()) : "0");
      }
    });
    document.querySelectorAll("#cat-rows tr").forEach(function (tr) {
      var pill = tr.querySelector(".pill");
      if (!pill) return;
      tr.setAttribute("data-chip", pill.classList.contains("info") ? "labor" : pill.classList.contains("ok") ? "part" : "fee");
    });
    document.querySelectorAll("#users-page-list .userrow").forEach(function (row, i) {
      var keys = ["devon", "alicia", "jordan", "riley", "marcus", "ellen"];
      row.setAttribute("data-ref", "user:" + keys[i]);
      var nm = row.querySelector(".nm b");
      var name = nm ? nm.textContent.trim() : "";
      row.setAttribute("data-name", name);
      var small = row.querySelector(".nm small") ? row.querySelector(".nm small").textContent : "";
      var smallLow = small.toLowerCase();
      var isPortal = smallLow.indexOf("customer") >= 0 || smallLow.indexOf("@hollis") >= 0 || smallLow.indexOf("marrenfarms") >= 0;
      row.setAttribute("data-account", isPortal ? "portal" : "internal");
      row.setAttribute("data-chip", isPortal ? "portal" : "internal");
      var statusPill = row.querySelector(".end .pill:last-child");
      var isInactive = statusPill && statusPill.textContent.toLowerCase().indexOf("inactive") >= 0;
      row.setAttribute("data-status", isInactive ? "inactive" : "active");
      if (isInactive) row.setAttribute("data-chip", "inactive");
      var rolePill = row.querySelector(".end .pill:first-child");
      var roleTxt = rolePill ? rolePill.textContent.trim().toLowerCase() : "";
      var roleKey = "viewer";
      if (roleTxt.indexOf("super admin") >= 0) roleKey = "super-admin";
      else if (roleTxt.indexOf("accountant") >= 0) roleKey = "accountant";
      else if (roleTxt.indexOf("mechanic") >= 0) roleKey = "mechanic";
      else if (roleTxt.indexOf("customer") >= 0) roleKey = "customer";
      else if (roleTxt.indexOf("viewer") >= 0) roleKey = "viewer";
      row.setAttribute("data-role", roleKey);
      row.setAttribute("data-active", String(parseUserLastActive(small, isInactive)));
    });
    document.querySelectorAll("#cust-grid .ent").forEach(function (ent, i) {
      var keys = ["hollis", "marren", "dover", "ks", "blue", "gary"];
      ent.setAttribute("data-ref", "customer:" + keys[i]);
      ent.setAttribute("data-nav", "customer-detail");
      var nm = ent.querySelector(".nm");
      var name = nm && nm.childNodes[0] ? nm.childNodes[0].textContent.trim() : "";
      ent.setAttribute("data-name", name);
      var small = nm && nm.querySelector("small") ? nm.querySelector("small").textContent.toLowerCase() : "";
      var isFleet = small.indexOf("individual") < 0 && (small.indexOf("llc") >= 0 || small.indexOf("co.") >= 0 || small.indexOf("fleet") >= 0 || small.indexOf("towing") >= 0 || small.indexOf("paving") >= 0);
      ent.setAttribute("data-type", isFleet ? "fleet" : "individual");
      var portalPill = ent.querySelector(".meta .pill");
      var portalOn = portalPill && portalPill.textContent.toLowerCase().indexOf("portal on") >= 0;
      ent.setAttribute("data-portal", portalOn ? "on" : "off");
      ent.setAttribute("data-chip", portalOn ? "portal" : isFleet ? "fleet" : "individual");
      var openB = ent.querySelector(".meta span:nth-child(2) b");
      var bal = openB ? parseFloat(openB.textContent.replace(/[$,]/g, "")) || 0 : 0;
      ent.setAttribute("data-balance", String(bal));
      var overdue = portalPill && portalPill.classList.contains("bad");
      ent.setAttribute("data-overdue", overdue ? "1" : "0");
      var vehB = ent.querySelector(".meta span:first-child b");
      ent.setAttribute("data-vehicles", vehB ? vehB.textContent : "0");
    });
    document.querySelectorAll("#log-queue .qitem").forEach(function (q, i) {
      var keys = ["3319", "3318", "3317", "3316"];
      if (keys[i]) q.setAttribute("data-ref", "log:" + keys[i]);
    });
  }

  /* ── List filter / sort (customers + vehicles + users) ── */
  var FS_TODAY = new Date(2026, 6, 7);

  function parseFsDate(str) {
    if (!str || str === "—") return null;
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function daysSinceFs(date) {
    return Math.floor((FS_TODAY.getTime() - date.getTime()) / 86400000);
  }

  function parseUserLastActive(small, inactive) {
    if (inactive) return 9999;
    var m = small.match(/last active (.+)$/i);
    if (!m) return 14;
    var la = m[1].toLowerCase().trim();
    if (la === "now") return 0;
    if (la.indexOf("h ago") >= 0) return parseFloat(la) / 24;
    if (la === "yesterday") return 1;
    var d = parseFsDate(m[1]);
    if (d) return daysSinceFs(d);
    return 14;
  }

  function custFsActive() {
    return document.getElementById("cust-f-type").value !== "all" ||
      document.getElementById("cust-f-portal").value !== "all" ||
      document.getElementById("cust-f-balance").value !== "all";
  }

  function vehFsActive() {
    return document.getElementById("veh-f-type").value !== "all" ||
      document.getElementById("veh-f-customer").value !== "all" ||
      document.getElementById("veh-f-service").value !== "all";
  }

  function usersFsActive() {
    return document.getElementById("users-f-account").value !== "all" ||
      document.getElementById("users-f-status").value !== "all" ||
      document.getElementById("users-f-role").value !== "all";
  }

  function usersFsMatch(row, q) {
    var account = document.getElementById("users-f-account").value;
    var status = document.getElementById("users-f-status").value;
    var role = document.getElementById("users-f-role").value;
    if (q && row.textContent.toLowerCase().indexOf(q) < 0) return false;
    if (account !== "all" && row.getAttribute("data-account") !== account) return false;
    if (status !== "all" && row.getAttribute("data-status") !== status) return false;
    if (role !== "all" && row.getAttribute("data-role") !== role) return false;
    return true;
  }

  function custFsMatch(ent, q) {
    var type = document.getElementById("cust-f-type").value;
    var portal = document.getElementById("cust-f-portal").value;
    var balance = document.getElementById("cust-f-balance").value;
    if (q && ent.textContent.toLowerCase().indexOf(q) < 0) return false;
    if (type !== "all" && ent.getAttribute("data-type") !== type) return false;
    if (portal !== "all" && ent.getAttribute("data-portal") !== portal) return false;
    var bal = parseFloat(ent.getAttribute("data-balance") || "0");
    if (balance === "open" && bal <= 0) return false;
    if (balance === "zero" && bal > 0) return false;
    if (balance === "overdue" && ent.getAttribute("data-overdue") !== "1") return false;
    return true;
  }

  function vehFsMatch(tr, q) {
    var type = document.getElementById("veh-f-type").value;
    var customer = document.getElementById("veh-f-customer").value;
    var service = document.getElementById("veh-f-service").value;
    if (q && tr.textContent.toLowerCase().indexOf(q) < 0) return false;
    if (type !== "all" && tr.getAttribute("data-type") !== type) return false;
    if (customer !== "all" && tr.getAttribute("data-customer") !== customer) return false;
    if (service !== "all") {
      var svcMs = parseInt(tr.getAttribute("data-service") || "0", 10);
      var svcDate = svcMs ? new Date(svcMs) : null;
      if (!svcDate) return false;
      var days = daysSinceFs(svcDate);
      if (service === "30" && days > 30) return false;
      if (service === "90" && days > 90) return false;
      if (service === "stale" && days <= 90) return false;
    }
    return true;
  }

  function sortFsItems(items, sortKey, kind) {
    var sorted = Array.prototype.slice.call(items);
    sorted.sort(function (a, b) {
      if (kind === "cust") {
        if (sortKey === "name-asc") return (a.getAttribute("data-name") || "").localeCompare(b.getAttribute("data-name") || "");
        if (sortKey === "name-desc") return (b.getAttribute("data-name") || "").localeCompare(a.getAttribute("data-name") || "");
        if (sortKey === "balance-desc") return parseFloat(b.getAttribute("data-balance") || 0) - parseFloat(a.getAttribute("data-balance") || 0);
        if (sortKey === "balance-asc") return parseFloat(a.getAttribute("data-balance") || 0) - parseFloat(b.getAttribute("data-balance") || 0);
        if (sortKey === "vehicles-desc") return parseInt(b.getAttribute("data-vehicles") || 0, 10) - parseInt(a.getAttribute("data-vehicles") || 0, 10);
      }
      if (kind === "veh") {
        if (sortKey === "tag-asc") return (a.getAttribute("data-tag") || "").localeCompare(b.getAttribute("data-tag") || "");
        if (sortKey === "tag-desc") return (b.getAttribute("data-tag") || "").localeCompare(a.getAttribute("data-tag") || "");
        if (sortKey === "customer-asc") return (a.getAttribute("data-customer") || "").localeCompare(b.getAttribute("data-customer") || "");
        if (sortKey === "customer-desc") return (b.getAttribute("data-customer") || "").localeCompare(a.getAttribute("data-customer") || "");
        if (sortKey === "service-desc") return parseInt(b.getAttribute("data-service") || 0, 10) - parseInt(a.getAttribute("data-service") || 0, 10);
        if (sortKey === "service-asc") return parseInt(a.getAttribute("data-service") || 0, 10) - parseInt(b.getAttribute("data-service") || 0, 10);
        if (sortKey === "odo-desc") return parseFloat(b.getAttribute("data-odo") || 0) - parseFloat(a.getAttribute("data-odo") || 0);
        if (sortKey === "odo-asc") return parseFloat(a.getAttribute("data-odo") || 0) - parseFloat(b.getAttribute("data-odo") || 0);
      }
      if (kind === "user") {
        if (sortKey === "name-asc") return (a.getAttribute("data-name") || "").localeCompare(b.getAttribute("data-name") || "");
        if (sortKey === "name-desc") return (b.getAttribute("data-name") || "").localeCompare(a.getAttribute("data-name") || "");
        if (sortKey === "role-asc") return (a.getAttribute("data-role") || "").localeCompare(b.getAttribute("data-role") || "");
        if (sortKey === "active-asc") return parseFloat(a.getAttribute("data-active") || 0) - parseFloat(b.getAttribute("data-active") || 0);
        if (sortKey === "active-desc") return parseFloat(b.getAttribute("data-active") || 0) - parseFloat(a.getAttribute("data-active") || 0);
      }
      return 0;
    });
    return sorted;
  }

  function custFsApply() {
    var list = document.getElementById("cust-grid");
    var empty = document.getElementById("cust-grid-empty");
    if (!list) return;
    var q = topsearchInput.dataset.target === "cust-grid" ? topsearchInput.value.trim().toLowerCase() : "";
    var sortKey = document.getElementById("cust-f-sort").value;
    var items = Array.prototype.slice.call(list.children);
    var matched = items.filter(function (ent) { return custFsMatch(ent, q); });
    var sorted = sortFsItems(matched, sortKey, "cust");
    sorted.forEach(function (ent) { list.appendChild(ent); });
    var visible = 0;
    items.forEach(function (ent) {
      var show = custFsMatch(ent, q);
      ent.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (empty) empty.style.display = visible === 0 ? "block" : "none";
    document.getElementById("cust-fs-count").textContent = visible === items.length
      ? visible + " customer" + (visible === 1 ? "" : "s")
      : visible + " of " + items.length + " customers";
    document.getElementById("cust-fs-clear").disabled = !custFsActive();
  }

  function vehFsApply() {
    var list = document.getElementById("staff-veh-rows");
    var empty = document.getElementById("staff-veh-rows-empty");
    if (!list) return;
    var q = topsearchInput.dataset.target === "staff-veh-rows" ? topsearchInput.value.trim().toLowerCase() : "";
    var sortKey = document.getElementById("veh-f-sort").value;
    var items = Array.prototype.slice.call(list.children);
    var matched = items.filter(function (tr) { return vehFsMatch(tr, q); });
    var sorted = sortFsItems(matched, sortKey, "veh");
    sorted.forEach(function (tr) { list.appendChild(tr); });
    var visible = 0;
    items.forEach(function (tr) {
      var show = vehFsMatch(tr, q);
      tr.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (empty) empty.style.display = visible === 0 ? "block" : "none";
    document.getElementById("veh-fs-count").textContent = visible === items.length
      ? visible + " vehicle" + (visible === 1 ? "" : "s")
      : visible + " of " + items.length + " vehicles";
    document.getElementById("veh-fs-clear").disabled = !vehFsActive();
    vehFsSyncHeaders(sortKey);
    var foot = list.closest(".card");
    if (foot) {
      var span = foot.querySelector(".cfoot span");
      if (span) span.textContent = visible === 0 ? "No matches" : "Showing 1—" + Math.min(visible, 7) + " of " + visible;
    }
  }

  function usersFsApply() {
    var list = document.getElementById("users-page-list");
    var empty = document.getElementById("users-page-list-empty");
    if (!list) return;
    var q = topsearchInput.dataset.target === "users-page-list" ? topsearchInput.value.trim().toLowerCase() : "";
    var sortKey = document.getElementById("users-f-sort").value;
    var items = Array.prototype.slice.call(list.children);
    var matched = items.filter(function (row) { return usersFsMatch(row, q); });
    var sorted = sortFsItems(matched, sortKey, "user");
    sorted.forEach(function (row) { list.appendChild(row); });
    var visible = 0;
    items.forEach(function (row) {
      var show = usersFsMatch(row, q);
      row.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (empty) empty.style.display = visible === 0 ? "block" : "none";
    document.getElementById("users-fs-count").textContent = visible === items.length
      ? visible + " user" + (visible === 1 ? "" : "s")
      : visible + " of " + items.length + " users";
    document.getElementById("users-fs-clear").disabled = !usersFsActive();
  }

  function vehFsSyncHeaders(sortKey) {
    document.querySelectorAll("#page-vehicles th.sortable").forEach(function (th) {
      th.classList.remove("on-asc", "on-desc");
      var col = th.getAttribute("data-sort");
      if (sortKey.indexOf(col) === 0) {
        th.classList.add(sortKey.indexOf("-desc") >= 0 ? "on-desc" : "on-asc");
      }
    });
  }

  function vehFsPopulateCustomers() {
    var sel = document.getElementById("veh-f-customer");
    if (!sel) return;
    var names = {};
    document.querySelectorAll("#staff-veh-rows tr[data-customer]").forEach(function (tr) {
      names[tr.getAttribute("data-customer")] = true;
    });
    Object.keys(names).sort().forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  function initFsBars() {
    vehFsPopulateCustomers();
    ["cust-f-type", "cust-f-portal", "cust-f-balance", "cust-f-sort"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", custFsApply);
    });
    document.getElementById("cust-fs-clear").onclick = function () {
      document.getElementById("cust-f-type").value = "all";
      document.getElementById("cust-f-portal").value = "all";
      document.getElementById("cust-f-balance").value = "all";
      custFsApply();
    };
    ["veh-f-type", "veh-f-customer", "veh-f-service", "veh-f-sort"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", vehFsApply);
    });
    document.getElementById("veh-fs-clear").onclick = function () {
      document.getElementById("veh-f-type").value = "all";
      document.getElementById("veh-f-customer").value = "all";
      document.getElementById("veh-f-service").value = "all";
      vehFsApply();
    };
    ["users-f-account", "users-f-status", "users-f-role", "users-f-sort"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", usersFsApply);
    });
    document.getElementById("users-fs-clear").onclick = function () {
      document.getElementById("users-f-account").value = "all";
      document.getElementById("users-f-status").value = "all";
      document.getElementById("users-f-role").value = "all";
      usersFsApply();
    };
    document.querySelectorAll("#page-vehicles th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var col = th.getAttribute("data-sort");
        var sortSel = document.getElementById("veh-f-sort");
        var cur = sortSel.value;
        var next;
        if (col === "tag") next = cur === "tag-asc" ? "tag-desc" : "tag-asc";
        else if (col === "customer") next = cur === "customer-asc" ? "customer-desc" : "customer-asc";
        else if (col === "odo") next = cur === "odo-desc" ? "odo-asc" : "odo-desc";
        else next = cur === "service-desc" ? "service-asc" : "service-desc";
        sortSel.value = next;
        vehFsApply();
      });
    });
    custFsApply();
    vehFsApply();
    usersFsApply();
  }

  function initChipFilters() {
    document.querySelectorAll(".card .chead, .filters").forEach(function (head) {
      var chips = head.querySelectorAll(".chip");
      if (!chips.length) return;
      var listId = head.getAttribute("data-filter-list");
      var list = listId ? document.getElementById(listId) : null;
      if (!list) {
        var card = head.closest(".card") || head.parentElement;
        list = card.querySelector("tbody") || card.querySelector("[id$='-rows']") || card.querySelector("[id$='-grid']") || card.querySelector("[id$='-list']") || card.querySelector("[id$='-queue']");
      }
      if (!list) return;
      listId = list.id;
      chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          chips.forEach(function (c) { c.classList.remove("on"); });
          chip.classList.add("on");
          var label = chip.textContent.toLowerCase();
          var val = "all";
          if (label.indexOf("draft") >= 0) val = "draft";
          else if (label.indexOf("sent") >= 0) val = "sent";
          else if (label.indexOf("overdue") >= 0 || label.indexOf("over") >= 0) val = "over";
          else if (label.indexOf("paid") >= 0) val = "paid";
          else if (label.indexOf("truck") >= 0) val = "truck";
          else if (label.indexOf("equipment") >= 0 || label.indexOf("equip") >= 0) val = "equip";
          else if (label.indexOf("ag") >= 0) val = "ag";
          else if (label.indexOf("part") >= 0) val = "part";
          else if (label.indexOf("labor") >= 0) val = "labor";
          else if (label.indexOf("fee") >= 0) val = "fee";
          else if (label.indexOf("fleet") >= 0) val = "fleet";
          else if (label.indexOf("individual") >= 0) val = "individual";
          else if (label.indexOf("portal") >= 0) val = "portal";
          else if (label.indexOf("internal") >= 0) val = "internal";
          else if (label.indexOf("inactive") >= 0) val = "inactive";
          else if (label.indexOf("active") >= 0 && label.indexOf("inactive") < 0) val = "active";
          chip.dataset.activeFilter = val;
          var q = topsearchInput.value.trim().toLowerCase();
          if (listId === topsearchInput.dataset.target) {
            filterList(listId, q, val === "all" ? null : val);
          } else {
            filterList(listId, "", val === "all" ? null : val);
          }
          updateChipCount(list, chips, val);
        });
      });
    });
  }

  function updateChipCount(list, chips, activeVal) {
    var total = list.children.length;
    var visible = 0;
    Array.prototype.forEach.call(list.children, function (c) {
      if (c.style.display !== "none") visible++;
    });
    chips.forEach(function (c) {
      if (c.classList.contains("on") && c.textContent.indexOf("·") >= 0) {
        var base = c.textContent.split("·")[0].trim();
        c.textContent = base + " · " + (activeVal === "all" ? total : visible);
      }
    });
  }

  /* ── Pagination (mock) ── */
  function initPagination() {
    document.querySelectorAll(".cfoot").forEach(function (foot) {
      var pager = foot.querySelector(".pager");
      var list = foot.parentElement.querySelector("tbody") || foot.parentElement.querySelector("[id$='-rows']");
      if (!pager || !list) return;
      var perPage = 8;
      var page = 1;
      var rows = Array.prototype.slice.call(list.children);

      function render() {
        var total = rows.length;
        var pages = Math.max(1, Math.ceil(total / perPage));
        if (page > pages) page = pages;
        rows.forEach(function (r, i) {
          var chipHidden = r.style.display === "none";
          var pageHidden = i < (page - 1) * perPage || i >= page * perPage;
          if (!chipHidden) r.style.display = pageHidden ? "none" : "";
        });
        var span = foot.querySelector("span");
        if (span) {
          var end = Math.min(page * perPage, total);
          span.textContent = "Showing " + ((page - 1) * perPage + 1) + "–" + end + " of " + total;
        }
        pager.querySelectorAll("button").forEach(function (btn, idx) {
          if (idx === 0) btn.disabled = page <= 1;
          else if (idx === pager.children.length - 1) btn.disabled = page >= pages;
          else {
            var pn = parseInt(btn.textContent, 10);
            if (!isNaN(pn)) btn.classList.toggle("on", pn === page);
          }
        });
      }

      pager.addEventListener("click", function (e) {
        var btn = e.target.closest("button");
        if (!btn || btn.disabled) return;
        if (btn.textContent === "‹") page--;
        else if (btn.textContent === "›") page++;
        else {
          var n = parseInt(btn.textContent, 10);
          if (!isNaN(n)) page = n;
        }
        render();
      });
      render();
    });
  }

  /* ── Global click routing ── */
  document.addEventListener("click", function (e) {
    var refEl = e.target.closest("[data-ref]");
    if (refEl && !e.target.closest(".qa button, .end button")) {
      var ref = refEl.getAttribute("data-ref");
      var nav = refEl.getAttribute("data-nav");
      if (ref && nav) {
        e.preventDefault();
        go(nav, ref);
        return;
      }
    }
    var el = e.target.closest("[data-nav]");
    if (el) {
      e.preventDefault();
      var ref2 = el.getAttribute("data-ref");
      var wtab = el.getAttribute("data-settab");
      if (wtab && el.getAttribute("data-nav") === "admin") {
        go("admin", "settab:" + wtab);
        return;
      }
      go(el.getAttribute("data-nav"), ref2 || null);
      return;
    }
    if (e.target.closest(".photo, .thumb") && (document.getElementById("page-servicelog-detail").classList.contains("active") || document.getElementById("ed-pane-servicelog").classList.contains("active"))) {
      var lb = document.getElementById("lightbox");
      document.getElementById("lightbox-inner").textContent = e.target.closest(".photo, .thumb").textContent.trim() || "🖼";
      lb.classList.add("open");
    }
  });

  document.getElementById("lightbox").addEventListener("click", function (e) {
    if (e.target.id === "lightbox") document.getElementById("lightbox").classList.remove("open");
  });

  document.getElementById("burger").addEventListener("click", function () {
    sidebar.classList.add("open");
    scrim.classList.add("show");
  });
  scrim.addEventListener("click", function () {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
  });

  topsearchInput.addEventListener("input", function () {
    var target = topsearchInput.dataset.target;
    if (!target) return;
    if (target === "cust-grid") { custFsApply(); return; }
    if (target === "staff-veh-rows") { vehFsApply(); return; }
    if (target === "users-page-list") { usersFsApply(); return; }
    var activeChip = document.querySelector(".page.active .chip.on");
    var fv = activeChip && activeChip.dataset.activeFilter && activeChip.dataset.activeFilter !== "all" ? activeChip.dataset.activeFilter : null;
    filterList(target, topsearchInput.value.trim().toLowerCase(), fv);
  });

  document.querySelectorAll("[data-filter]").forEach(function (input) {
    input.addEventListener("input", function () {
      filterList(input.getAttribute("data-filter"), input.value.trim().toLowerCase());
    });
  });

  document.querySelectorAll(".uswitch").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      applyUser(btn.getAttribute("data-user"));
      closeMenu();
      toast("Switched to " + users[btn.getAttribute("data-user")].name, "info");
    });
  });
  document.getElementById("demo-reset").addEventListener("click", function () { applyUser("devon"); });

  avbtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = menu.classList.toggle("open");
    avbtn.setAttribute("aria-expanded", String(open));
    closeNotif();
  });
  document.addEventListener("click", function (e) {
    if (!menu.contains(e.target) && e.target !== avbtn) closeMenu();
  });

  var notifBtn = document.getElementById("notif-btn");
  var notifPanel = document.getElementById("notif-panel");
  notifBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = notifPanel.classList.toggle("open");
    notifBtn.setAttribute("aria-expanded", String(open));
    closeMenu();
  });
  document.addEventListener("click", function (e) {
    if (!notifPanel.contains(e.target) && e.target !== notifBtn) closeNotif();
  });
  notifPanel.querySelectorAll(".ni").forEach(function (ni) {
    ni.addEventListener("click", function () {
      ni.classList.remove("unread");
      var unread = notifPanel.querySelectorAll(".ni.unread").length;
      document.getElementById("notif-unread").textContent = String(unread);
      document.getElementById("notif-count").textContent = unread || "";
      document.getElementById("notif-count").style.display = unread ? "" : "none";
      if (ni.textContent.indexOf("INV-000089") >= 0) go("invoice-detail", "invoice:089");
      if (ni.textContent.indexOf("SL-3319") >= 0) go("servicelog-detail", "log:3319");
      if (ni.textContent.indexOf("INV-000090") >= 0) go("invoice-detail", "invoice:090");
    });
  });

  /* ── Wizard ── */
  var wizStep = 1, wizSaved = false;
  var wizLabels = ["Customer & vehicle", "Line items", "Review & send"];
  function markWizDirty() {
    var el = document.getElementById("wiz-autosave");
    el.textContent = "Unsaved changes";
    el.classList.add("pending");
    document.getElementById("wiz-draft-pill").textContent = wizSaved ? "Draft · unsaved changes" : "Unsaved";
    document.getElementById("wiz-draft-pill").className = "pill " + (wizSaved ? "warn" : "draft");
  }
  function saveWizDraft(andContinue) {
    wizSaved = true;
    document.getElementById("wiz-draft-pill").textContent = "Draft · INV-000095";
    document.getElementById("wiz-draft-pill").className = "pill draft";
    document.getElementById("wiz-inv-num").style.display = "";
    document.getElementById("wiz-sum-pill").textContent = "Draft · INV-000095";
    document.getElementById("wiz-autosave").textContent = "Saved just now";
    document.getElementById("wiz-autosave").classList.remove("pending");
    toast("Draft INV-000095 saved (mock)", "ok");
    if (andContinue) go("editor", "editor:093");
  }
  function setWizStep(n) {
    if (n > wizStep + 1 && !wizSaved && n > 1) { toast("Save draft before skipping ahead", "warn"); return; }
    wizStep = n;
    document.querySelectorAll(".wstep").forEach(function (s) {
      var sn = Number(s.getAttribute("data-step"));
      s.classList.toggle("on", sn === n);
      s.classList.toggle("done", sn < n);
    });
    document.querySelectorAll(".wpanel").forEach(function (p) { p.classList.toggle("active", p.id === "wiz-" + n); });
    document.getElementById("wiz-state-label").textContent = "Step " + n + " of 3 — " + wizLabels[n - 1];
    if (n === 3) {
      document.getElementById("wiz-sum-cust").textContent = document.getElementById("wiz-cust").value;
      var veh = document.getElementById("wiz-veh");
      document.getElementById("wiz-sum-veh").textContent = veh.options[veh.selectedIndex].text.split(" — ")[0];
      document.getElementById("wiz-sum-lines").textContent = String(document.getElementById("wiz-body").children.length);
      document.getElementById("wiz-sum-total").textContent = document.getElementById("wiz-total").textContent;
    }
  }
  document.querySelectorAll(".wstep").forEach(function (s) {
    s.addEventListener("click", function () {
      var n = Number(s.getAttribute("data-step"));
      if (n <= wizStep || wizSaved) setWizStep(n);
      else toast("Complete prior steps first", "warn");
    });
  });
  document.getElementById("wiz-next-1").onclick = function () { setWizStep(2); };
  document.getElementById("wiz-back-2").onclick = function () { setWizStep(1); };
  document.getElementById("wiz-next-2").onclick = function () { setWizStep(3); };
  document.getElementById("wiz-back-3").onclick = function () { setWizStep(2); };
  document.querySelectorAll(".wiz-save").forEach(function (b) { b.onclick = function () { saveWizDraft(false); }; });
  document.getElementById("wiz-save-top").onclick = function () { saveWizDraft(false); };
  document.getElementById("wiz-save-final").onclick = function () { saveWizDraft(true); };
  document.getElementById("wiz-finalize").onclick = function () {
    confirmModal("Finalize & send?", "Totals lock server-side. Laravel PDF generates and email queues.", function () {
      toast("INV-000095 finalized and sent (mock)", "ok");
      go("invoice-detail", "invoice:092");
    }, "Finalize");
  };
  document.getElementById("page-create").addEventListener("input", markWizDirty);
  document.getElementById("page-create").addEventListener("change", markWizDirty);

  var wizBody = document.getElementById("wiz-body");
  function wizRecalc() {
    var sub = 0;
    wizBody.querySelectorAll("tr").forEach(function (tr) {
      var qty = parseFloat(tr.querySelector(".qty").value) || 0;
      var rate = parseFloat(tr.querySelector(".rate").value) || 0;
      var amt = Math.round(qty * rate * 100) / 100;
      tr.querySelector(".amt").textContent = money(amt);
      sub += amt;
    });
    var fee = Math.min(Math.round(sub * 3.5) / 100, 60);
    document.getElementById("wiz-sub").textContent = money(sub);
    document.getElementById("wiz-fee").textContent = money(fee);
    document.getElementById("wiz-total").textContent = money(sub + fee);
  }
  wizBody.addEventListener("input", function () { wizRecalc(); markWizDirty(); });
  wizBody.addEventListener("click", function (e) {
    if (e.target.closest(".rm")) { e.target.closest("tr").remove(); wizRecalc(); markWizDirty(); }
  });
  document.getElementById("wiz-add-line").onclick = function () {
    var tr = document.createElement("tr");
    tr.innerHTML = '<td><select><option>Labor</option><option>Part</option><option>Fee</option></select></td><td><input type="text" placeholder="Description" /></td><td><input class="num qty" type="number" value="1" step="0.25" min="0" /></td><td><input class="num rate" type="number" value="0.00" step="0.01" min="0" /></td><td class="amt">$0.00</td><td><button class="rm" aria-label="Remove line">✕</button></td>';
    wizBody.appendChild(tr);
    tr.querySelector("input").focus();
    wizRecalc();
    markWizDirty();
  };
  wizRecalc();

  /* ── AI popover ── */
  var aiPop = document.getElementById("ai-pop");
  var aiTexts = [
    "Performed diagnostic on aftertreatment system following repeated DPF regeneration faults. Identified failed outlet NOx sensor (SPN 3226). Replaced sensor with OEM unit and completed ECM relearn procedure.",
    "Completed PM service B per fleet schedule. Replaced primary and secondary fuel filters, greased all fittings, inspected brake lining thickness within spec.",
    "Replaced worn track on compact loader. Removed old track assembly, installed new grouser track, tensioned and aligned per manufacturer spec."
  ];
  var aiIdx = 0;
  var selectedLine = null;

  function openAiPop(anchor) {
    var r = anchor.getBoundingClientRect();
    aiPop.style.top = Math.min(r.bottom + 8, window.innerHeight - 220) + "px";
    aiPop.style.left = Math.min(Math.max(16, r.left), window.innerWidth - 400) + "px";
    aiPop.classList.add("open");
  }
  function closeAiPop() { aiPop.classList.remove("open"); }
  ["ed-ai-btn", "wiz-ai-btn"].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.onclick = function (e) { e.stopPropagation(); openAiPop(btn); };
  });
  document.getElementById("ai-close").onclick = closeAiPop;
  document.getElementById("ai-regen").onclick = function () {
    aiIdx = (aiIdx + 1) % aiTexts.length;
    document.getElementById("ai-pop-text").textContent = aiTexts[aiIdx];
    toast("Description regenerated (mock)", "info");
  };
  document.getElementById("ai-insert").onclick = function () {
    var page = document.querySelector(".page.active");
    var input = selectedLine || (page && page.querySelector(".ed-lines input[type=text]"));
    if (input) {
      input.value = document.getElementById("ai-pop-text").textContent.slice(0, 160);
      toast("Inserted into line description", "ok");
      if (page && page.id === "page-editor") recalc();
      if (page && page.id === "page-create") { wizRecalc(); markWizDirty(); }
    }
    closeAiPop();
  };
  document.addEventListener("click", function (e) {
    if (!aiPop.contains(e.target) && !e.target.closest(".ai-btn")) closeAiPop();
  });

  /* ── Editor ── */
  var edBody = document.getElementById("ed-body");
  function recalc() {
    var sub = 0;
    edBody.querySelectorAll("tr").forEach(function (tr) {
      var qty = parseFloat(tr.querySelector(".qty").value) || 0;
      var rate = parseFloat(tr.querySelector(".rate").value) || 0;
      var amt = Math.round(qty * rate * 100) / 100;
      tr.querySelector(".amt").textContent = money(amt);
      sub += amt;
    });
    var fee = Math.min(Math.round(sub * 3.5) / 100, 60);
    document.getElementById("ed-sub").textContent = money(sub);
    document.getElementById("ed-fee").textContent = money(fee);
    document.getElementById("ed-total").textContent = money(sub + fee);
  }
  edBody.addEventListener("input", recalc);
  edBody.addEventListener("click", function (e) {
    if (e.target.closest(".rm")) { e.target.closest("tr").remove(); recalc(); return; }
    var tr = e.target.closest("tr");
    if (tr) {
      edBody.querySelectorAll("tr").forEach(function (r) { r.classList.remove("sel"); });
      tr.classList.add("sel");
      selectedLine = tr.querySelector('input[type="text"]');
    }
  });
  document.getElementById("add-line").onclick = function () {
    var tr = document.createElement("tr");
    tr.innerHTML = '<td><select><option>Labor</option><option>Part</option><option>Fee</option></select></td><td><input type="text" placeholder="Description" /></td><td><input class="num qty" type="number" value="1" step="0.25" min="0" /></td><td><input class="num rate" type="number" value="0.00" step="0.01" min="0" /></td><td class="amt">$0.00</td><td><button class="rm" aria-label="Remove line">✕</button></td>';
    edBody.appendChild(tr);
    tr.querySelector("input").focus();
    recalc();
  };
  recalc();

  document.querySelectorAll("#qa-list .btn").forEach(function (btn, i) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var item = MOCK.catalog[i];
      if (!item) return;
      var tr = document.createElement("tr");
      tr.innerHTML = '<td><select><option' + (item.type === "Part" ? " selected" : "") + '>Part</option><option>Labor</option><option>Fee</option></select></td><td><input type="text" value="' + item.name + '" /></td><td><input class="num qty" type="number" value="1" step="0.25" min="0" /></td><td><input class="num rate" type="number" value="' + item.rate + '" step="0.01" min="0" /></td><td class="amt">' + money(item.rate) + '</td><td><button class="rm" aria-label="Remove line">✕</button></td>';
      if (item.type === "Labor") tr.querySelector("select").value = "Labor";
      edBody.appendChild(tr);
      recalc();
      toast("Added " + item.name, "ok");
    });
  });

  /* ── Template designer (Blade code editor) ── */
  var tdCode = document.getElementById("td-code");
  var tdStatus = document.getElementById("td-status");
  var tdTemplate = document.getElementById("td-template");
  var tdVersion = document.getElementById("td-version");
  var tdDirty = false;
  var tdSavedSource = tdCode ? tdCode.value : "";

  var TD_TEMPLATES = {
    "bill-matrix-v2": { label: "Bill Matrix v2", version: "v2 · draft", invoices: 46 },
    "bill-matrix-v1": { label: "Bill Matrix v1", version: "v1 · published", invoices: 128 },
    "fleet-standard": { label: "Fleet Standard", version: "v3 · draft", invoices: 0 },
    "blank": { label: "Blank starter", version: "new", invoices: 0 }
  };

  var TD_SOURCES = {
    "blank": "{{-- New invoice template --}}\n<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>Invoice {{ $invoice->number }}</title>\n  <style>\n    body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #111; padding: 34px 38px; }\n  </style>\n</head>\n<body>\n  {{-- Paste your full layout here --}}\n</body>\n</html>"
  };

  function tdSetStatus(text, dirty) {
    if (!tdStatus) return;
    tdStatus.textContent = text;
    tdStatus.classList.toggle("dirty", !!dirty);
    tdDirty = !!dirty;
  }

  function tdInsertSnippet(snippet) {
    if (!tdCode) return;
    var start = tdCode.selectionStart;
    var end = tdCode.selectionEnd;
    var val = tdCode.value;
    tdCode.value = val.slice(0, start) + snippet + val.slice(end);
    tdCode.selectionStart = tdCode.selectionEnd = start + snippet.length;
    tdCode.focus();
    tdSetStatus("Unsaved changes — refresh preview to validate", true);
  }

  function tdMarkDirty() {
    tdSetStatus("Unsaved changes — refresh preview to validate", true);
  }

  function tdMarkSaved() {
    tdSavedSource = tdCode ? tdCode.value : "";
    var tpl = TD_TEMPLATES[tdTemplate ? tdTemplate.value : "bill-matrix-v2"];
    tdSetStatus("Saved · Laravel PDF · " + (tpl ? tpl.invoices : 0) + " invoices use this template", false);
  }

  if (tdCode) {
    tdCode.addEventListener("input", tdMarkDirty);
    tdCode.addEventListener("paste", function () { setTimeout(tdMarkDirty, 0); });
  }

  document.querySelectorAll("#page-designer [data-snippet]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      tdInsertSnippet(btn.getAttribute("data-snippet") || "");
    });
  });

  var tdPreviewBtn = document.getElementById("td-preview-btn");
  if (tdPreviewBtn) {
    tdPreviewBtn.addEventListener("click", function () {
      toast("Preview rendered from Blade source (mock)", "info");
      tdMarkSaved();
    });
  }

  var tdFormat = document.getElementById("td-format");
  if (tdFormat) {
    tdFormat.addEventListener("click", function () {
      toast("Template formatted (mock)", "info");
    });
  }

  var tdReset = document.getElementById("td-reset");
  if (tdReset) {
    tdReset.addEventListener("click", function () {
      confirmModal("Reset template?", "Restore the last saved version? Unsaved edits will be lost.", function () {
        if (tdCode) tdCode.value = tdSavedSource;
        tdMarkSaved();
        toast("Template reset to last saved version (mock)", "warn");
      }, "Reset");
    });
  }

  if (tdTemplate) {
    tdTemplate.addEventListener("change", function () {
      var key = tdTemplate.value;
      var tpl = TD_TEMPLATES[key];
      if (tdVersion && tpl) tdVersion.textContent = tpl.version;
      var prevKey = tdTemplate.getAttribute("data-current") || "bill-matrix-v2";
      var load = function () {
        if (TD_SOURCES[key] && tdCode) {
          tdCode.value = TD_SOURCES[key];
        } else if (key !== "bill-matrix-v2" && tdCode) {
          tdCode.value = "{{-- " + (tpl ? tpl.label : key) + " --}}\n" + tdCode.value.split("\n").slice(1).join("\n");
        }
        tdTemplate.setAttribute("data-current", key);
        tdMarkSaved();
        toast("Loaded " + (tpl ? tpl.label : key) + " (mock)", "info");
      };
      if (tdDirty) {
        confirmModal("Switch template?", "You have unsaved changes. Switch anyway?", load, "Switch");
        tdTemplate.value = prevKey;
      } else {
        load();
      }
    });
    tdTemplate.setAttribute("data-current", "bill-matrix-v2");
  }

  ["td-save", "td-test-pdf", "td-dup"].forEach(function (id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var tpl = TD_TEMPLATES[tdTemplate ? tdTemplate.value : "bill-matrix-v2"];
      var name = tpl ? tpl.label : "template";
      if (id === "td-save") {
        tdMarkSaved();
        toast(name + " saved (mock)", "ok");
      } else if (id === "td-test-pdf") {
        toast("Test PDF rendered via Laravel PDF (mock)", "info");
      } else {
        toast("Template duplicated as " + name + " copy (mock)", "info");
      }
    });
  });

  document.querySelectorAll("#page-admin [data-settab]").forEach(function (tab) {
    tab.addEventListener("click", function () {
      openSetTab(tab.getAttribute("data-settab"));
    });
  });

  /* ── Setup wizard ── */
  var setupScrim = document.getElementById("setup-scrim");
  var setupStep = 1;
  var setupMax = 8;
  var setupDone = false;

  function setSetupStep(n) {
    setupStep = n;
    document.querySelectorAll("#setup-steps .wstep").forEach(function (s) {
      var sn = parseInt(s.getAttribute("data-setup"), 10);
      s.classList.toggle("on", sn === n && !setupDone);
      s.classList.toggle("done", sn < n || setupDone);
    });
    document.querySelectorAll("#setup-scrim .wpanel").forEach(function (p) {
      p.classList.toggle("active", p.id === "setup-" + n);
    });
    document.getElementById("setup-back").disabled = n <= 1 || setupDone;
    document.getElementById("setup-progress").textContent = setupDone ? "Complete" : "Step " + n + " of " + setupMax;
    document.getElementById("setup-next").textContent = n >= setupMax ? "Complete setup" : "Continue →";
    document.getElementById("setup-done").style.display = setupDone ? "block" : "none";
    if (setupDone) {
      document.querySelectorAll("#setup-scrim .wpanel").forEach(function (p) { p.classList.remove("active"); });
    }
  }

  function openSetup(start) {
    setupDone = false;
    setSetupStep(start || 1);
    setupScrim.classList.add("open");
    document.body.style.overflow = "hidden";
    helpClosePanel();
    helpWidget.classList.add("hidden");
  }

  function closeSetup() {
    setupScrim.classList.remove("open");
    document.body.style.overflow = "";
    toast("Setup progress saved (mock)", "ok");
    if (helpToggle && helpToggle.checked && helpStaffActive()) helpWidget.classList.remove("hidden");
  }

  ["open-setup", "open-setup-2"].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.onclick = function () { openSetup(1); };
  });
  document.getElementById("setup-close").onclick = closeSetup;
  document.getElementById("setup-back").onclick = function () { if (setupStep > 1) setSetupStep(setupStep - 1); };
  document.getElementById("setup-next").onclick = function () {
    if (setupStep >= setupMax) {
      setupDone = true;
      setSetupStep(setupMax);
      document.getElementById("admin-setup-bar").style.width = "100%";
      document.getElementById("admin-setup-pct").innerHTML = "<b style=\"color:#0f172a\">100%</b>";
      document.getElementById("admin-setup-pill").textContent = "8 of 8 complete";
      document.getElementById("admin-setup-pill").className = "pill ok";
      toast("Server setup complete — bootstrap disabled (mock)", "ok");
      return;
    }
    setSetupStep(setupStep + 1);
    toast("Step " + (setupStep - 1) + " saved (mock)", "ok");
  };
  document.getElementById("setup-save-step").onclick = function () {
    toast("Step " + setupStep + " saved — resume anytime from Control Panel (mock)", "ok");
  };
  document.getElementById("setup-finish").onclick = function () {
    closeSetup();
    go("admin");
  };
  document.querySelectorAll("#setup-steps .wstep").forEach(function (s) {
    s.onclick = function () {
      if (!setupDone) setSetupStep(parseInt(s.getAttribute("data-setup"), 10));
    };
  });
  document.getElementById("setup-gen-key").onclick = function () {
    var key = "dorinc_mk_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
    document.getElementById("setup-master-key").value = key;
    document.getElementById("setup-key-ok").classList.add("show");
    toast("Master encryption key generated (mock)", "ok");
  };
  [["setup-test-db", "setup-db-ok", "Database connected — migrations applied"],
   ["setup-test-smtp", "setup-smtp-ok", "Test email delivered"],
   ["setup-test-pdf", "setup-pdf-ok", "Sample PDF rendered"],
   ["setup-test-ai", "setup-ai-ok", "OpenRouter API key valid"]].forEach(function (pair) {
    var btn = document.getElementById(pair[0]);
    if (!btn) return;
    btn.onclick = function () {
      if (pair[1]) document.getElementById(pair[1]).classList.add("show");
      toast(pair[2] + " (mock)", "ok");
    };
  });
  document.getElementById("setup-skip-backup").onclick = function () {
    toast("Backup skipped — configure later in Control Panel (mock)", "info");
    setSetupStep(7);
  };
  document.getElementById("setup-skip-ai").onclick = function () {
    toast("AI skipped — configure later in Control Panel (mock)", "info");
    setSetupStep(8);
  };

  document.querySelectorAll(".reveal").forEach(function (btn) {
    btn.onclick = function () {
      var input = document.getElementById(btn.getAttribute("data-target"));
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
    };
  });

  document.getElementById("save-flags").onclick = function () {
    toast("System feature flags saved (mock)", "ok");
  };
  document.querySelectorAll(".mod-approve").forEach(function (btn) {
    btn.onclick = function () {
      var row = btn.closest(".modrow");
      toast((btn.textContent.indexOf("Grant") >= 0 ? "Portal access granted" : btn.textContent.indexOf("Mark") >= 0 ? "Email marked verified" : "User approved") + " (mock)", "ok");
      if (row) row.remove();
    };
  });
  document.querySelectorAll(".mod-reject").forEach(function (btn) {
    btn.onclick = function () {
      confirmModal("Reject request?", "This action is logged in the audit trail.", function () {
        var row = btn.closest(".modrow");
        if (row) row.remove();
        toast("Request rejected (mock)", "warn");
      }, "Reject");
    };
  });

  /* ── Import / export (workspace settings) ── */
  var ieLabels = {
    customers: "Customers", vehicles: "Vehicles", invoices: "Invoices",
    "invoice-lines": "Invoice line items", payments: "Payments",
    servicelogs: "Service logs", catalog: "Catalog items", users: "Internal users", audit: "Audit log"
  };
  var ieCounts = {
    customers: 18, vehicles: 41, invoices: 46, "invoice-lines": 312, payments: 38,
    servicelogs: 84, catalog: 132, users: 4, audit: 2841
  };
  var ieSelected = null;
  var ieFileReady = false;
  var iePanelImport = document.getElementById("ie-panel-import");
  var iePanelBody = document.getElementById("ie-panel-body");
  var iePanelTitle = document.getElementById("ie-panel-title");
  var iePanelBadge = document.getElementById("ie-panel-badge");
  var ieLog = document.getElementById("ie-log");
  var ieRun = document.getElementById("ie-run");
  var ieFile = document.getElementById("ie-file");

  function ieSelectTable(key) {
    ieSelected = key;
    document.querySelectorAll(".ie-row").forEach(function (r) {
      r.classList.toggle("sel", r.getAttribute("data-ie") === key);
    });
    iePanelBody.hidden = true;
    iePanelImport.hidden = false;
    iePanelTitle.textContent = "Import · " + (ieLabels[key] || key);
    iePanelBadge.textContent = ieCounts[key] + " rows in DB";
    ieFileReady = false;
    ieRun.disabled = true;
    ieLog.classList.remove("show");
    ieLog.textContent = "";
    ieFile.value = "";
    document.getElementById("ie-drop").querySelector("b").textContent = "Drop file here or click to browse";
  }

  document.querySelectorAll(".ie-export").forEach(function (btn) {
    btn.onclick = function (e) {
      e.stopPropagation();
      var key = btn.getAttribute("data-ie");
      var fmt = "csv";
      toast("Exported " + (ieLabels[key] || key) + " → dorinc_" + key + "_" + Date.now().toString(36) + "." + fmt + " (mock)", "ok");
    };
  });

  document.querySelectorAll(".ie-import").forEach(function (btn) {
    btn.onclick = function (e) {
      e.stopPropagation();
      ieSelectTable(btn.getAttribute("data-ie"));
    };
  });

  document.getElementById("ie-export-all").onclick = function () {
    toast("ZIP export queued — 9 tables, redacted secrets (mock)", "info");
  };

  document.getElementById("ie-template").onclick = function () {
    if (!ieSelected) return;
    toast("Template downloaded — " + ieSelected + "_template.csv (mock)", "info");
  };

  function ieSimulateValidate(name) {
    ieLog.classList.add("show");
    ieLog.textContent = "Validating " + name + "…\n";
    ieRun.disabled = true;
    setTimeout(function () {
      ieLog.textContent += "✓ Headers match schema\n✓ 12 rows parsed\n✓ Foreign keys OK\n✓ Money fields numeric(12,2)\nReady to import.";
      ieFileReady = true;
      ieRun.disabled = false;
      toast("File validated — 12 rows ready (mock)", "ok");
    }, 700);
  }

  document.getElementById("ie-validate").onclick = function () {
    if (!ieSelected) return;
    var f = ieFile.files[0];
    if (!f) { toast("Choose a file first", "warn"); return; }
    ieSimulateValidate(f.name);
  };

  ieFile.onchange = function () {
    var f = ieFile.files[0];
    if (!f) return;
    document.getElementById("ie-drop").querySelector("b").textContent = f.name + " (" + Math.round(f.size / 1024) + " KB)";
    ieSimulateValidate(f.name);
  };

  var ieDrop = document.getElementById("ie-drop");
  ieDrop.addEventListener("dragover", function (e) { e.preventDefault(); ieDrop.classList.add("drag"); });
  ieDrop.addEventListener("dragleave", function () { ieDrop.classList.remove("drag"); });
  ieDrop.addEventListener("drop", function (e) {
    e.preventDefault();
    ieDrop.classList.remove("drag");
    if (e.dataTransfer.files[0]) {
      ieFile.files = e.dataTransfer.files;
      ieFile.dispatchEvent(new Event("change"));
    }
  });

  ieRun.onclick = function () {
    if (!ieSelected || !ieFileReady) return;
    var mode = document.getElementById("ie-mode").value;
    var dry = mode.indexOf("Dry run") === 0;
    confirmModal(dry ? "Run dry import?" : "Run import?", (dry ? "Validates only — no rows written." : "Writes to " + ieLabels[ieSelected] + ". Logged in audit trail."), function () {
      var ins = Math.floor(Math.random() * 5) + 1;
      var upd = dry ? 0 : Math.floor(Math.random() * 3);
      toast((dry ? "Dry run OK" : "Import complete") + " — " + ins + " inserted, " + upd + " updated (mock)", "ok");
      var jobs = document.getElementById("ie-jobs");
      var tr = document.createElement("tr");
      tr.innerHTML = '<td class="mono" style="font-size:12px">Just now</td><td>' + users[currentUser].name + "</td><td>" + ieLabels[ieSelected] + '</td><td><span class="pill warn">import.csv</span></td><td><span class="pill ok">' + ins + " inserted · " + upd + " updated</span></td>";
      jobs.insertBefore(tr, jobs.firstChild);
      ieLog.textContent += "\n✓ Import committed — audit entry written.";
    }, dry ? "Validate" : "Import");
  };

  /* ── Platform help assistant (floating chat) ── */
  var helpWidget = document.getElementById("help-widget");
  var helpBackdrop = document.getElementById("help-backdrop");
  var helpPanel = document.getElementById("help-panel");
  var helpFab = document.getElementById("help-fab");
  var helpMsgs = document.getElementById("help-msgs");
  var helpSuggest = document.getElementById("help-suggest");
  var helpInput = document.getElementById("help-input");
  var helpContext = document.getElementById("help-context");
  var helpToggle = document.getElementById("flag-platform-help");
  var helpOpen = false;
  var helpBooted = false;

  var helpSuggestions = {
    dashboard: ["What needs my attention?", "How do I create an invoice?", "Where is the review queue?"],
    invoices: ["How do I send a payment reminder?", "What does overdue mean?", "How are PDFs generated?"],
    "invoice-detail": ["How do I record a payment?", "Can I resend the portal link?", "When does an invoice lock?"],
    create: ["Can I save a draft mid-wizard?", "What happens on finalize?", "How do I add line items?"],
    editor: ["How do description assist work?", "Are totals computed live?", "Difference between save and finalize?"],
    customers: ["How do I enable the customer portal?", "How are credential emails sent?", "Can customers request vehicles?"],
    vehicles: ["Why are vehicle tags shown first?", "How does VIN decode work?", "Who can add vehicles?"],
    servicelogs: ["How does the review queue work?", "Can AI extract line items?", "Who can upload logs?"],
    catalog: ["How do labor rates apply?", "Can I quick-add from the editor?", "Parts vs labor types?"],
    admin: ["What is the moderation queue?", "Do I need a .env file?", "How does setup wizard work?"],
    audit: ["What gets logged here?", "Can I export system logs?", "Where is invoice change history?"],
    designer: ["How do templates affect PDFs?", "What is Bill Matrix?", "Can I preview before saving?"],
    account: ["How do I change my password?", "What is step-up verification?", "Who sees my sessions?"],
    default: ["How do I create an invoice?", "What roles can use the platform?", "How does the customer portal work?"]
  };

  var helpAnswers = [
    { keys: ["attention", "needs", "review queue", "dashboard"], text: "The <b>Needs attention</b> table on your dashboard lists overdue invoices and drafts. The right sidebar shows your <b>Review queue</b> — service logs, portal requests, and AI extractions waiting for action. Click any row to jump straight there." },
    { keys: ["create", "new invoice", "wizard"], text: "Go to <b>Billing tools → New Invoice</b> or click <b>+ New Invoice</b>. The 3-step wizard lets you pick customer & vehicle, add line items, then review. You can <b>Save draft</b> at any step — the invoice keeps its number and you can resume from Invoices or the Editor." },
    { keys: ["finalize", "send", "lock"], text: "<b>Finalize & send</b> locks totals server-side (numeric 12,2), generates the official PDF via <b>Laravel PDF</b>, and queues email + portal delivery. After finalize, line totals cannot be edited without creating a revision." },
    { keys: ["draft", "save"], text: "Drafts can be saved at any wizard step or from the Invoice Editor. Saving recomputes totals server-side and assigns an invoice number. Find drafts in <b>Invoices</b> with the Draft status filter." },
    { keys: ["payment", "record", "balance"], text: "Open the invoice detail page and click <b>Record payment</b>. Enter amount, method (ACH, check, card), and date. The server validates against the open balance — overpayments are rejected." },
    { keys: ["pdf", "laravel", "template"], text: "Official PDFs are rendered server-side only through <b>Laravel PDF</b> using your active template (Bill Matrix v2 by default). Customize layout in <b>Template Designer</b>. Users download or email PDFs — they are never generated in the browser." },
    { keys: ["portal", "customer", "credential"], text: "Enable portal access per customer in their detail page. <b>Credential emails</b> are sent manually from the customer menu (logged every time). Customers see only their invoices, vehicles, and can submit requests." },
    { keys: ["service log", "upload", "review", "sl-"], text: "Mechanics upload logs from <b>Service Logs</b>. Files store in PostgreSQL bytea. Accountants review the queue, optionally approve AI-extracted line items, then create an invoice from the log." },
    { keys: ["description assist", "ctrl+shift", "ai line"], text: "<b>Description assist</b> (✦ AI button or <kbd>Ctrl+Shift+D</kbd>) drafts line-item text from context. It requires human approval before insert — distinct from this platform help chat." },
    { keys: ["role", "permission", "accountant", "mechanic", "admin"], text: "Roles: <b>Super Admin</b> (full system), <b>Accountant</b> (billing + approvals), <b>Mechanic</b> (vehicles + logs), <b>Customer</b> (portal only), <b>Viewer</b> (read-only). Permissions are enforced server-side — use the demo user switcher to preview each view." },
    { keys: ["vehicle", "tag", "vin"], text: "Vehicles are listed by <b>fleet tag</b> first (e.g. Truck #HL-114) because that's how shops think about fleet assets. VIN decode auto-fills year/make when you add a vehicle." },
    { keys: ["moderation", "approve", "signup", "pending"], text: "The <b>Moderation queue</b> in Control Panel shows pending user signups, portal access requests, and unverified emails. Approve or reject — every action writes an audit entry." },
    { keys: ["env", "setup", "smtp", "database", "system settings", "control panel"], text: "DORINC is configured entirely in the UI — no .env secrets. Use <b>Super Admin → Control Panel</b> or the <b>Server setup wizard</b> for database, SMTP, encryption key, PDF worker, backup, and AI credentials. Values are encrypted at rest in PostgreSQL." },
    { keys: ["import", "export", "csv", "migrate", "spreadsheet"], text: "Super Admins can import/export individual tables under <b>Control Panel → Import / Export</b>. Each table (customers, vehicles, invoices, line items, payments, service logs, catalog, users) exports to CSV or JSON. Imports support upsert, insert-only, or dry-run validation. Audit log is export-only." },
    { keys: ["audit", "log", "export", "system logs"], text: "Platform-wide events live in <b>System Logs</b> — settings changes, role updates, backups, imports, and security events. <b>Invoice, customer, and vehicle change history</b> is on each record's detail page (append-only, who + when + what)." },
    { keys: ["overdue", "reminder"], text: "An invoice becomes <b>overdue</b> when past its due date with an open balance. Use <b>Send reminder</b> on the invoice detail page to queue a follow-up email through SMTP." },
    { keys: ["backup", "restore", "google drive"], text: "Encrypted backups run on a schedule to Google Drive. Configure in <b>Control Panel → Backup</b>. Manual runs and restores require Super Admin + step-up verification." }
  ];

  function helpPageName() {
    var page = document.querySelector(".page.active");
    if (!page) return "default";
    return page.id.replace("page-", "") || "default";
  }

  function helpSetSuggestions() {
    var page = helpPageName();
    var list = helpSuggestions[page] || helpSuggestions.default;
    helpSuggest.innerHTML = "";
    list.forEach(function (q) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = q;
      btn.onclick = function () { helpAsk(q); };
      helpSuggest.appendChild(btn);
    });
    var labels = {
      dashboard: "Dashboard", invoices: "Invoices", create: "New Invoice wizard",
      editor: "Invoice Editor", admin: "Control Panel",
      servicelogs: "Service Logs", audit: "System Logs"
    };
    helpContext.textContent = "Viewing · " + (labels[page] || page.replace(/-/g, " "));
  }

  function helpAppend(role, html) {
    var row = document.createElement("div");
    row.className = "help-msg " + role;
    var who = document.createElement("span");
    who.className = "who";
    who.textContent = role === "bot" ? "✦" : users[currentUser].initials;
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = html;
    row.appendChild(who);
    row.appendChild(bubble);
    helpMsgs.appendChild(row);
    helpMsgs.scrollTop = helpMsgs.scrollHeight;
    return row;
  }

  function helpReply(text) {
    var typing = helpAppend("bot typing", "Thinking…");
    setTimeout(function () {
      typing.remove();
      helpAppend("bot", text);
    }, 500 + Math.random() * 500);
  }

  function helpMatchAnswer(q) {
    var lower = q.toLowerCase();
    var best = null;
    var bestScore = 0;
    helpAnswers.forEach(function (a) {
      var score = 0;
      a.keys.forEach(function (k) {
        if (lower.indexOf(k) !== -1) score += k.length;
      });
      if (score > bestScore) { bestScore = score; best = a; }
    });
    if (best) return best.text;
    return "I can help with invoices, service logs, roles, PDFs, the customer portal, system setup, and moderation. Try asking about a specific page you're on, or tap a suggested question below.";
  }

  function helpAsk(q) {
    if (!q || !q.trim()) return;
    helpAppend("user", q.replace(/</g, "&lt;"));
    helpInput.value = "";
    helpReply(helpMatchAnswer(q));
  }

  function helpBoot() {
    if (helpBooted) return;
    helpBooted = true;
    helpMsgs.innerHTML = "";
    helpAppend("bot", "Hi " + users[currentUser].greeting + "! I'm the <b>Platform Assistant</b> — I answer questions about how to use DORINC (workflows, roles, settings). I don't edit invoice data. What can I help with?");
    helpSetSuggestions();
  }

  function helpStaffActive() {
    var shell = document.getElementById("app-shell");
    return shell && !shell.classList.contains("hidden");
  }

  function helpSetEnabled(on) {
    var show = !!on && helpStaffActive();
    if (!helpWidget) return;
    helpWidget.classList.toggle("hidden", !show);
    document.body.classList.toggle("help-on", show);
    if (!show) helpClosePanel();
  }

  function helpOpenPanel() {
    helpOpen = true;
    helpPanel.classList.add("open");
    helpFab.classList.add("open");
    helpFab.setAttribute("aria-expanded", "true");
    helpFab.innerHTML = "✕";
    if (helpBackdrop) {
      helpBackdrop.classList.add("open");
      helpBackdrop.setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("help-chat-open");
    helpBoot();
    helpSetSuggestions();
    setTimeout(function () { helpInput.focus(); }, 120);
  }

  function helpClosePanel() {
    helpOpen = false;
    helpPanel.classList.remove("open");
    helpFab.classList.remove("open");
    helpFab.setAttribute("aria-expanded", "false");
    helpFab.innerHTML = '<span class="pulse"></span>✦';
    if (helpBackdrop) {
      helpBackdrop.classList.remove("open");
      helpBackdrop.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("help-chat-open");
  }

  if (helpToggle) {
    helpToggle.addEventListener("change", function () {
      helpSetEnabled(helpToggle.checked);
      if (helpToggle.checked) toast("Platform help assistant enabled", "info");
      else toast("Platform help assistant disabled", "info");
    });
  }

  helpFab.onclick = function () {
    if (helpOpen) helpClosePanel();
    else helpOpenPanel();
  };
  if (helpBackdrop) helpBackdrop.onclick = helpClosePanel;
  document.getElementById("help-close").onclick = helpClosePanel;
  document.getElementById("help-form").onsubmit = function (e) {
    e.preventDefault();
    helpAsk(helpInput.value);
  };
  helpInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      helpAsk(helpInput.value);
    }
  });

  var origGo = go;
  go = function (name, ref) {
    origGo(name, ref);
    if (helpOpen && helpToggle && helpToggle.checked) helpSetSuggestions();
  };

  /* ── Mock actions (buttons without data-nav) ── */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn, .btn.primary, .btn.danger, .btn.ghost");
    if (!btn || btn.hasAttribute("data-nav") || btn.hasAttribute("data-settab") || btn.hasAttribute("data-systab") || btn.hasAttribute("data-ed-tab") || btn.classList.contains("wiz-save") || btn.id === "wiz-save-top" || btn.id === "wiz-save-final" || btn.id === "ed-log-copy-lines" || btn.closest(".pager") || btn.closest(".uswitch") || btn.closest(".wstep") || btn.closest(".ai-pop") || btn.closest(".modal") || btn.closest(".notif-panel") || btn.closest("#setup-scrim") || btn.closest("#help-widget") || btn.id === "burger" || btn.id === "demo-reset" || btn.id === "notif-btn" || btn.classList.contains("rm") || btn.classList.contains("ai-btn") || btn.classList.contains("chip") || btn.classList.contains("reveal") || btn.classList.contains("mod-approve") || btn.classList.contains("mod-reject") || btn.classList.contains("ie-export") || btn.classList.contains("ie-import") || btn.id === "ie-export-all" || btn.id === "ie-template" || btn.id === "ie-validate" || btn.id === "ie-run" || btn.id === "td-save" || btn.id === "td-test-pdf" || btn.id === "td-dup" || btn.id === "td-preview-btn" || btn.id === "td-format" || btn.id === "td-reset" || btn.closest("#page-designer [data-snippet]")) return;
    var t = btn.textContent.replace(/\s+/g, " ").trim();
    if (t === "Export CSV") { toast("CSV export queued — 46 invoices (mock)", "info"); return; }
    if (t === "Download PDF") { toast("PDF download started via Laravel PDF (mock)", "info"); return; }
    if (t === "Send reminder") { toast("Payment reminder queued for " + MOCK.invoices[ctx.invoice].customer, "ok"); return; }
    if (t === "Preview PDF") { toast("Opening PDF preview in new tab (mock)", "info"); return; }
    if (t === "Save draft") { toast("Draft saved — totals recomputed server-side (mock)", "ok"); return; }
    if (t === "Discard") {
      confirmModal("Discard draft?", "Unsaved line items will be lost. This cannot be undone.", function () {
        toast("Draft discarded (mock)", "warn");
        go("invoices");
      }, "Discard");
      return;
    }
    if (t === "Finalize & send") {
      confirmModal("Finalize & send?", "Totals lock server-side. Laravel PDF generates and email queues.", function () {
        toast("INV-000095 finalized and sent (mock)", "ok");
        go("invoice-detail", "invoice:092");
      }, "Finalize");
      return;
    }
    if (t === "Finalize & send" || t.indexOf("Finalize") >= 0) return;
    if (t === "Record payment") {
      toast("Payment recorded — balance updated (mock)", "ok");
      go("invoice-detail", "invoice:" + ctx.invoice);
      return;
    }
    if (btn.id === "wiz-finalize") return;
    if (t === "Cancel" && document.getElementById("page-payment").classList.contains("active")) { go("invoice-detail"); return; }
    if (t === "Save profile" || t === "Update password") { toast("Account settings saved (mock)", "ok"); return; }
    if (t === "Save system flags" || t === "Save general settings" || t === "Save SMTP settings" || t === "Save security policy" || t === "Save PDF settings" || t === "Save AI credentials") { toast(t + " (mock)", "ok"); return; }
    if (t === "Export config (redacted)") { toast("Redacted config export downloaded (mock)", "info"); return; }
    if (t === "Run pending migrations") { toast("Migrations applied — schema current (mock)", "ok"); return; }
    if (t === "Reconnect Google Drive") { toast("Google Drive OAuth window would open (mock)", "info"); return; }
    if (t === "Begin restore wizard…") { toast("Restore wizard requires step-up auth (mock)", "warn"); return; }
    if (t === "Connect Google Drive (OAuth)") { document.getElementById("setup-backup-ok").classList.add("show"); toast("Google Drive connected (mock)", "ok"); return; }
    if (t === "Resend link") { toast("Verification email resent (mock)", "info"); return; }
    if (t === "Save defaults" || t === "Save AI settings" || t === "Save profile" || t.indexOf("Save") === 0) {
      if (t === "Save AI settings" && helpToggle) helpSetEnabled(helpToggle.checked);
      toast(t + " (mock)", "ok");
      return;
    }
    if (t === "+ Invite user") { toast("Invite email queued (mock)", "info"); return; }
    if (t === "Export" || t === "Export log") { toast("Export queued (mock)", "info"); return; }
    if (t === "+ Upload log") { toast("Upload dialog would open on mobile/desktop (mock)", "info"); return; }
    if (t === "+ New Customer" || t === "+ Add Vehicle" || t === "+ New Item") { toast(t.replace("+ ", "") + " form would open (mock)", "info"); return; }
    if (t === "Decode VIN") { toast("VIN decoder — paste VIN to decode (mock)", "info"); return; }
    if (t === "Run backup now") { toast("Backup job queued — Google Drive encrypted (mock)", "ok"); return; }
    if (t === "Reset password" || t === "Deactivate" || t === "Revoke") { toast(t + " (mock)", "warn"); return; }
    if (t.indexOf("Manage") >= 0) { go("user-detail", "user:" + ctx.user); return; }
  });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && e.key === "D") {
      var page = document.querySelector(".page.active");
      if (!page || (page.id !== "page-editor" && page.id !== "page-create")) return;
      e.preventDefault();
      var btn = page.querySelector(".ai-btn");
      if (btn) openAiPop(btn);
    }
    if (e.key === "Escape") {
      closeAiPop(); closeMenu(); closeNotif(); closeModal();
      if (helpOpen) { helpClosePanel(); return; }
      if (setupScrim.classList.contains("open")) closeSetup();
      document.getElementById("lightbox").classList.remove("open");
    }
  });

  /* ── Customer portal ── */
  var PORTAL_INVOICES = {
    "092": { id: "INV-000092", veh: "Truck #HL-114 — 2019 Freightliner Cascadia", status: "Open · $841.88 due", statusCls: "info" },
    "088": { id: "INV-000088", veh: "Truck #HL-109 — 2020 International MV607", status: "Paid in full", statusCls: "paid" },
    "090": { id: "INV-000090", veh: "Loader #MF-03 — CAT 259D3", status: "Paid in full", statusCls: "paid" }
  };
  var PORTAL_VIN_DECODE = {
    "3AKJHHDR9KSJV1234": { year: 2019, make: "Freightliner", model: "Cascadia" },
    "1HTEUMML7LH552390": { year: 2020, make: "International", model: "MV607" },
    "1XPWD40X1HD123456": { year: 2017, make: "Peterbilt", model: "579" },
    "1GRAA9620MB123456": { year: 2021, make: "Great Dane", model: "Reefer trailer" }
  };
  var portalShell = document.getElementById("portal-shell");
  var portalNav = document.getElementById("portal-nav");
  var portalPendingVeh = null;

  function portalGo(name, opts) {
    opts = opts || {};
    document.querySelectorAll("#portal-shell .page").forEach(function (p) { p.classList.remove("active"); });
    var page = document.getElementById("portal-page-" + name);
    if (page) page.classList.add("active");
    document.querySelectorAll("#portal-nav button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-page") === name || (name === "invoice-detail" && b.getAttribute("data-page") === "invoices"));
    });
    if (name === "requests") {
      if (opts.reqType) portalSetReqType(opts.reqType);
      if (opts.vehicle) {
        var sel = document.getElementById("svc-vehicle");
        if (sel) sel.value = opts.vehicle;
      }
    }
    window.scrollTo(0, 0);
  }

  function portalGetVehicleTags() {
    var tags = [];
    document.querySelectorAll("#veh-rows tr[data-veh-tag]").forEach(function (tr) {
      tags.push(tr.getAttribute("data-veh-tag"));
    });
    return tags;
  }

  function portalSyncVehicleSelects() {
    var tags = portalGetVehicleTags();
    var sel = document.getElementById("svc-vehicle");
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = "";
    if (!tags.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No vehicles — add one first";
      sel.appendChild(empty);
      return;
    }
    tags.forEach(function (tag) {
      var opt = document.createElement("option");
      opt.value = tag;
      opt.textContent = tag;
      sel.appendChild(opt);
    });
    if (prev && tags.indexOf(prev) !== -1) sel.value = prev;
    else if (portalPendingVeh && tags.indexOf(portalPendingVeh) !== -1) {
      sel.value = portalPendingVeh;
      portalPendingVeh = null;
    }
  }

  function portalUpdateVehCount() {
    var n = document.querySelectorAll("#veh-rows tr").length;
    var el = document.getElementById("veh-count");
    if (el) el.textContent = String(n);
    var kpi = document.querySelector("#portal-page-dashboard .kpi:nth-child(2) .v");
    if (kpi) kpi.textContent = String(n);
  }

  function portalOpenAddVehicle() {
    document.getElementById("add-veh-scrim").classList.add("open");
    document.getElementById("add-veh-scrim").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("av-tag").focus();
  }

  function portalCloseAddVehicle() {
    document.getElementById("add-veh-scrim").classList.remove("open");
    document.getElementById("add-veh-scrim").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function portalFormatUnit(year, make, model) {
    var parts = [];
    if (year) parts.push(String(year));
    if (make) parts.push(make);
    if (model) parts.push(model);
    return parts.join(" ") || "—";
  }

  function portalAddVehicleRow(data) {
    var tr = document.createElement("tr");
    tr.setAttribute("data-veh-tag", data.tag);
    tr.innerHTML =
      '<td><span class="lead">' + data.tag + '</span><span class="sub">' + data.type + '</span></td>' +
      '<td>' + portalFormatUnit(data.year, data.make, data.model) + '</td>' +
      '<td class="mono" style="font-size:12px">' + (data.vin || "—") + '</td>' +
      '<td><span class="pill gray">New</span></td>' +
      '<td><div class="veh-actions"><button type="button" class="btn sm req-for-veh" data-veh="' + data.tag + '">Request service</button></div></td>';
    document.getElementById("veh-rows").appendChild(tr);
    portalUpdateVehCount();
    portalSyncVehicleSelects();
  }

  function portalSetReqType(type) {
    document.querySelectorAll("#portal-shell .type-card").forEach(function (c) {
      var on = c.getAttribute("data-req-type") === type;
      c.classList.toggle("on", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("#portal-shell .req-form").forEach(function (f) {
      f.classList.toggle("active", f.getAttribute("data-req-type") === type);
    });
  }

  function portalTodayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function portalFormatDateShort() {
    return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function portalUrgencyLabel(val) {
    if (val === "urgent") return "Urgent";
    if (val === "soon") return "Soon";
    return "Normal";
  }

  function portalPrependRequest(card) {
    var list = document.getElementById("req-history");
    list.insertBefore(card, list.firstChild);
    portalFilterHistory(document.querySelector("#hist-filters .chip.on").getAttribute("data-hist"));
    var kpi = document.querySelector("#portal-page-dashboard .kpi:nth-child(4) .v");
    if (kpi) kpi.textContent = String(document.querySelectorAll('#req-history [data-req-status="open"]').length);
  }

  function portalFilterHistory(kind) {
    var visible = 0;
    document.querySelectorAll("#req-history .req-card").forEach(function (c) {
      var show = kind === "all" || c.getAttribute("data-req-status") === kind;
      c.style.display = show ? "" : "none";
      if (show) visible++;
    });
    document.getElementById("req-history-empty").hidden = visible > 0;
  }

  function portalOpenInvoice(key) {
    var inv = PORTAL_INVOICES[key];
    if (!inv) return;
    document.getElementById("portal-det-inv").textContent = inv.id;
    document.getElementById("portal-det-status").textContent = inv.status;
    document.getElementById("portal-det-status").className = "pill " + inv.statusCls;
    document.getElementById("portal-det-veh").textContent = inv.veh;
    portalGo("invoice-detail");
  }

  function initPortal() {
    if (!portalShell) return;
    portalNav.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-page]");
      if (!btn) return;
      e.preventDefault();
      var opts = {};
      if (btn.getAttribute("data-req-type")) opts.reqType = btn.getAttribute("data-req-type");
      portalGo(btn.getAttribute("data-page"), opts);
    });
    portalShell.addEventListener("click", function (e) {
      var jump = e.target.closest(".nav-jump");
      if (jump) {
        e.preventDefault();
        var opts = {};
        if (jump.getAttribute("data-req-type")) opts.reqType = jump.getAttribute("data-req-type");
        portalGo(jump.getAttribute("data-page"), opts);
        return;
      }
      var reqVeh = e.target.closest(".req-for-veh");
      if (reqVeh) {
        e.preventDefault();
        portalGo("requests", { reqType: "service", vehicle: reqVeh.getAttribute("data-veh") });
        return;
      }
      var row = e.target.closest("#portal-shell tr[data-inv]");
      if (row && !e.target.closest(".dl-pdf")) {
        portalOpenInvoice(row.getAttribute("data-inv"));
        return;
      }
      if (e.target.closest("#portal-shell .dl-pdf")) {
        e.stopPropagation();
        toast("PDF download started via Laravel PDF (mock)", "info");
        return;
      }
      var btn = e.target.closest("#portal-shell .btn");
      if (!btn) return;
      var t = btn.textContent.trim();
      if (t === "Pay invoice") { toast("Payment portal integration would open (mock)", "info"); return; }
      if (t === "Save profile" || t === "Update password") { toast(t + " (mock)", "ok"); }
    });
    document.getElementById("portal-signout").onclick = function () {
      showCustomerAuth();
      toast("Signed out of customer portal", "warn");
    };
    ["veh-add-btn", "dash-add-veh"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.onclick = function () { portalOpenAddVehicle(); };
    });
    document.getElementById("add-veh-close").onclick = portalCloseAddVehicle;
    document.getElementById("add-veh-cancel").onclick = portalCloseAddVehicle;
    document.getElementById("add-veh-scrim").onclick = function (e) {
      if (e.target === this) portalCloseAddVehicle();
    };
    document.getElementById("req-goto-add-veh").onclick = function (e) {
      e.preventDefault();
      portalOpenAddVehicle();
    };
    document.getElementById("av-decode").onclick = function () {
      var vin = document.getElementById("av-vin").value.trim().toUpperCase();
      if (!vin) { toast("Enter a VIN to decode", "warn"); return; }
      var hit = PORTAL_VIN_DECODE[vin];
      if (hit) {
        document.getElementById("av-year").value = hit.year;
        document.getElementById("av-make").value = hit.make;
        document.getElementById("av-model").value = hit.model;
        toast("VIN decoded — " + portalFormatUnit(hit.year, hit.make, hit.model), "ok");
      } else {
        document.getElementById("av-year").value = "2022";
        document.getElementById("av-make").value = "Kenworth";
        document.getElementById("av-model").value = "T680";
        toast("VIN decoded (mock sample data)", "ok");
      }
    };
    document.getElementById("add-veh-form").onsubmit = function (e) {
      e.preventDefault();
      var tag = document.getElementById("av-tag").value.trim();
      if (!tag) { toast("Fleet tag is required", "warn"); return; }
      if (portalGetVehicleTags().some(function (t) { return t.toLowerCase() === tag.toLowerCase(); })) {
        toast("A vehicle with this tag already exists", "warn");
        return;
      }
      portalAddVehicleRow({
        tag: tag, type: document.getElementById("av-type").value,
        vin: document.getElementById("av-vin").value.trim().toUpperCase(),
        year: document.getElementById("av-year").value,
        make: document.getElementById("av-make").value.trim(),
        model: document.getElementById("av-model").value.trim()
      });
      portalCloseAddVehicle();
      e.target.reset();
      toast(tag + " added to your fleet (mock)", "ok");
    };
    document.querySelectorAll("#portal-shell .type-card").forEach(function (card) {
      card.onclick = function () { portalSetReqType(card.getAttribute("data-req-type")); };
    });
    document.querySelectorAll("#hist-filters .chip").forEach(function (chip) {
      chip.onclick = function () {
        document.querySelectorAll("#hist-filters .chip").forEach(function (c) { c.classList.remove("on"); });
        chip.classList.add("on");
        portalFilterHistory(chip.getAttribute("data-hist"));
      };
    });
    var uploadZone = document.getElementById("svc-upload-zone");
    var photoInput = document.getElementById("svc-photos");
    var photoCount = document.getElementById("svc-photo-count");
    if (uploadZone && photoInput) {
      uploadZone.onclick = function () { photoInput.click(); };
      photoInput.onchange = function () {
        photoCount.textContent = photoInput.files.length ? photoInput.files.length + " photo(s) attached" : "";
      };
    }
    document.getElementById("req-form-service").onsubmit = function (e) {
      e.preventDefault();
      var veh = document.getElementById("svc-vehicle").value;
      var desc = document.getElementById("svc-desc").value.trim();
      if (!veh || !desc) { toast(veh ? "Describe the issue or work needed" : "Select a vehicle or add one first", "warn"); return; }
      var card = document.createElement("div");
      card.className = "req-card";
      card.setAttribute("data-req-status", "open");
      card.setAttribute("data-req-kind", "service");
      card.innerHTML = '<span class="req-type-pill">Service</span><b>' + veh + " — " + document.getElementById("svc-category").value + '</b><div class="meta">' + portalFormatDateShort() + " · " + portalUrgencyLabel(document.getElementById("svc-urgency").value) + ' · <span class="pill warn">Under review</span></div>';
      portalPrependRequest(card);
      e.target.reset();
      portalSyncVehicleSelects();
      if (photoCount) photoCount.textContent = "";
      toast("Service request submitted — shop will review (mock)", "ok");
    };
    document.getElementById("req-form-billing").onsubmit = function (e) {
      e.preventDefault();
      var topic = document.getElementById("bill-topic").value;
      var desc = document.getElementById("bill-desc").value.trim();
      if (!topic || !desc) { toast(topic ? "Add details about your billing question" : "Select a billing topic", "warn"); return; }
      var inv = document.getElementById("bill-invoice").value;
      var card = document.createElement("div");
      card.className = "req-card";
      card.setAttribute("data-req-status", "open");
      card.setAttribute("data-req-kind", "billing");
      card.innerHTML = '<span class="req-type-pill">Billing</span><b>' + (inv ? inv + " — " + topic : topic) + '</b><div class="meta">' + portalFormatDateShort() + ' · <span class="pill warn">Under review</span></div>';
      portalPrependRequest(card);
      e.target.reset();
      toast("Billing request submitted (mock)", "ok");
    };
    document.getElementById("req-form-general").onsubmit = function (e) {
      e.preventDefault();
      var subj = document.getElementById("gen-subject").value.trim();
      var desc = document.getElementById("gen-desc").value.trim();
      if (!subj || !desc) { toast("Subject and message are required", "warn"); return; }
      var card = document.createElement("div");
      card.className = "req-card";
      card.setAttribute("data-req-status", "open");
      card.setAttribute("data-req-kind", "general");
      card.innerHTML = '<span class="req-type-pill">General</span><b>' + subj + '</b><div class="meta">' + portalFormatDateShort() + ' · <span class="pill warn">Under review</span></div>';
      portalPrependRequest(card);
      e.target.reset();
      toast("Message sent to the shop (mock)", "ok");
    };
    var svcDate = document.getElementById("svc-date");
    if (svcDate) svcDate.min = portalTodayISO();
    portalSyncVehicleSelects();
    portalSetReqType("service");
  }

  function showPortal() {
    authScreen.classList.add("hidden");
    appShell.classList.add("hidden");
    portalShell.classList.remove("hidden");
    helpWidget.classList.add("hidden");
    document.body.classList.remove("help-on");
    if (helpOpen) helpClosePanel();
    portalGo("dashboard");
  }

  /* ── Auth (customer default + staff) ── */
  var authScreen = document.getElementById("auth-screen");
  var appShell = document.getElementById("app-shell");
  var authCardCustomer = document.getElementById("auth-card-customer");
  var authCardStaff = document.getElementById("auth-card-staff");
  var authSwitchCustomer = document.getElementById("auth-switch-customer");
  var authSwitchStaff = document.getElementById("auth-switch-staff");
  var loggedIn = false;

  function showCustomerAuth() {
    loggedIn = false;
    appShell.classList.add("hidden");
    portalShell.classList.add("hidden");
    authScreen.classList.remove("hidden");
    authCardCustomer.classList.remove("hidden");
    authCardStaff.classList.add("hidden");
    authSwitchCustomer.classList.remove("hidden");
    authSwitchStaff.classList.add("hidden");
    helpWidget.classList.add("hidden");
    document.body.classList.remove("help-on");
    closeMenu();
    closeNotif();
    closeSetup();
    closeAiPop();
    if (helpOpen) helpClosePanel();
    window.scrollTo(0, 0);
  }

  function showStaffAuth(tab) {
    loggedIn = false;
    appShell.classList.add("hidden");
    portalShell.classList.add("hidden");
    authScreen.classList.remove("hidden");
    authCardCustomer.classList.add("hidden");
    authCardStaff.classList.remove("hidden");
    authSwitchCustomer.classList.add("hidden");
    authSwitchStaff.classList.remove("hidden");
    helpWidget.classList.add("hidden");
    document.body.classList.remove("help-on");
    closeMenu();
    closeNotif();
    closeSetup();
    closeAiPop();
    if (helpOpen) helpClosePanel();
    document.querySelectorAll("[data-auth-tab]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-auth-tab") === (tab || "login"));
    });
    document.getElementById("auth-login").classList.toggle("active", (tab || "login") === "login");
    document.getElementById("auth-signup").classList.toggle("active", tab === "signup");
    window.scrollTo(0, 0);
  }

  function showApp() {
    loggedIn = true;
    authScreen.classList.add("hidden");
    portalShell.classList.add("hidden");
    appShell.classList.remove("hidden");
    if (helpToggle && helpToggle.checked) helpSetEnabled(true);
    go("dashboard");
  }

  document.getElementById("auth-open-staff").onclick = function (e) {
    e.preventDefault();
    showStaffAuth("login");
  };
  document.getElementById("auth-open-customer").onclick = function (e) {
    e.preventDefault();
    showCustomerAuth();
  };

  document.querySelectorAll("[data-auth-tab]").forEach(function (btn) {
    btn.onclick = function () {
      var t = btn.getAttribute("data-auth-tab");
      document.querySelectorAll("[data-auth-tab]").forEach(function (b) { b.classList.toggle("on", b === btn); });
      document.getElementById("auth-login").classList.toggle("active", t === "login");
      document.getElementById("auth-signup").classList.toggle("active", t === "signup");
    };
  });

  document.getElementById("portal-login-form").onsubmit = function (e) {
    e.preventDefault();
    showPortal();
    toast("Signed in as Marcus Hollis — Hollis Logistics LLC (mock)", "ok");
  };

  document.getElementById("login-form").onsubmit = function (e) {
    e.preventDefault();
    applyUser("devon");
    showApp();
    toast("Signed in as Devon R. (mock)", "ok");
  };

  document.getElementById("signup-form").onsubmit = function (e) {
    e.preventDefault();
    toast("Account request submitted — pending Super Admin approval (mock)", "info");
    showStaffAuth("login");
  };

  document.querySelectorAll(".sign-out-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      showCustomerAuth();
      toast(btn.closest("#portal-shell") ? "Signed out of customer portal" : "Signed out", "warn");
    });
  });

  /* ── Service log create wizard (mechanic) ── */
  var SL_CUSTOMERS = {
    hollis: { name: "Hollis Logistics LLC", vehicles: [
      { id: "HL-114", tag: "Truck #HL-114", desc: "2019 Freightliner Cascadia" },
      { id: "HL-109", tag: "Truck #HL-109", desc: "2020 International MV607" },
      { id: "HL-102", tag: "Truck #HL-102", desc: "2017 Peterbilt 579" }
    ]},
    ks: { name: "K&S Towing & Recovery", vehicles: [
      { id: "KS-07", tag: "Truck #KS-07", desc: "2018 Kenworth T680" }
    ]},
    marren: { name: "Marren Farms", vehicles: [
      { id: "MF-03", tag: "Loader #MF-03", desc: "CAT 259D3 Skid Steer" },
      { id: "MF-07", tag: "Tractor #MF-07", desc: "2015 John Deere 6155M" }
    ]},
    dover: { name: "City of Dover Fleet", vehicles: [
      { id: "DOV-31", tag: "Bus #DOV-31", desc: "2021 Ford F-550 Super Duty" }
    ]},
    blue: { name: "Blue Ridge Paving Co.", vehicles: [
      { id: "BR-12", tag: "Equipment #BR-12", desc: "2016 Bobcat T650" },
      { id: "BR-439293", tag: "Truck #BR-439293", desc: "2017 Mack GU713" }
    ]}
  };
  var SL_PHOTO_ICONS = ["📷", "🖼", "📄", "🔧", "🛞", "⚙️"];
  var slState = { step: 1, customer: null, customerName: "", vehicle: null, vehicleLabel: "", photos: [] };

  function slWizardReset() {
    slState = { step: 1, customer: null, customerName: "", vehicle: null, vehicleLabel: "", photos: [] };
    document.querySelectorAll("#sl-customers .sl-pick").forEach(function (p) { p.classList.remove("on"); });
    document.getElementById("sl-vehicles").innerHTML = "";
    document.getElementById("sl-veh-empty").hidden = true;
    document.getElementById("sl-date").value = "2026-07-07";
    document.getElementById("sl-odo").value = "";
    document.getElementById("sl-location").value = "";
    document.getElementById("sl-complaint").value = "";
    document.getElementById("sl-internal").value = "";
    document.getElementById("sl-photo-grid").innerHTML = "";
    document.getElementById("sl-next-1").disabled = true;
    document.getElementById("sl-next-2").disabled = true;
    slWizardGo(1);
  }

  function slWizardGo(step) {
    slState.step = step;
    document.querySelectorAll(".sl-panel").forEach(function (p) {
      p.classList.toggle("active", parseInt(p.getAttribute("data-step"), 10) === step);
    });
    document.querySelectorAll("#sl-progress .sl-step").forEach(function (s) {
      var n = parseInt(s.getAttribute("data-sl-step"), 10);
      s.classList.toggle("on", n === step);
      s.classList.toggle("done", n < step);
    });
    if (step === 6) slWizardUpdateReview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function slWizardRenderVehicles() {
    var wrap = document.getElementById("sl-vehicles");
    var empty = document.getElementById("sl-veh-empty");
    wrap.innerHTML = "";
    slState.vehicle = null;
    slState.vehicleLabel = "";
    document.getElementById("sl-next-2").disabled = true;
    if (!slState.customer || !SL_CUSTOMERS[slState.customer]) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    SL_CUSTOMERS[slState.customer].vehicles.forEach(function (v) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sl-pick";
      btn.setAttribute("data-sl-veh", v.id);
      btn.innerHTML = '<span class="av slate">' + v.tag.replace(/[^#A-Z0-9]/gi, "").slice(0, 2) + '</span><span class="nm"><b>' + v.tag + '</b><small>' + v.desc + '</small></span><span class="chk"></span>';
      btn.onclick = function () {
        document.querySelectorAll("#sl-vehicles .sl-pick").forEach(function (p) { p.classList.remove("on"); });
        btn.classList.add("on");
        slState.vehicle = v.id;
        slState.vehicleLabel = v.tag + " · " + v.desc;
        document.getElementById("sl-next-2").disabled = false;
      };
      wrap.appendChild(btn);
    });
  }

  function slWizardUpdateReview() {
    document.getElementById("sl-r-cust").textContent = slState.customerName || "—";
    document.getElementById("sl-r-veh").textContent = slState.vehicleLabel || "—";
    document.getElementById("sl-r-date").textContent = document.getElementById("sl-date").value || "—";
    document.getElementById("sl-r-odo").textContent = document.getElementById("sl-odo").value || "—";
    document.getElementById("sl-r-loc").textContent = document.getElementById("sl-location").value || "—";
    document.getElementById("sl-r-type").textContent = document.getElementById("sl-work-type").value || "—";
    document.getElementById("sl-r-complaint").textContent = document.getElementById("sl-complaint").value.trim() || "—";
    document.getElementById("sl-r-internal").textContent = document.getElementById("sl-internal").value.trim() || "—";
    document.getElementById("sl-r-photos").textContent = String(slState.photos.length);
  }

  function slWizardAddPhoto() {
    var icon = SL_PHOTO_ICONS[slState.photos.length % SL_PHOTO_ICONS.length];
    slState.photos.push(icon);
    var grid = document.getElementById("sl-photo-grid");
    var item = document.createElement("div");
    item.className = "sl-photo-item";
    item.innerHTML = '<div class="ph">' + icon + '</div><button type="button" class="rm" aria-label="Remove">✕</button>';
    item.querySelector(".rm").onclick = function () {
      var idx = slState.photos.indexOf(icon);
      if (idx >= 0) slState.photos.splice(idx, 1);
      item.remove();
    };
    grid.appendChild(item);
  }

  function initSlWizard() {
    document.querySelectorAll("#sl-customers .sl-pick").forEach(function (pick) {
      pick.onclick = function () {
        document.querySelectorAll("#sl-customers .sl-pick").forEach(function (p) { p.classList.remove("on"); });
        pick.classList.add("on");
        slState.customer = pick.getAttribute("data-sl-cust");
        slState.customerName = SL_CUSTOMERS[slState.customer] ? SL_CUSTOMERS[slState.customer].name : "";
        document.getElementById("sl-next-1").disabled = false;
      };
    });
    document.getElementById("sl-next-1").onclick = function () {
      slWizardRenderVehicles();
      slWizardGo(2);
    };
    document.getElementById("sl-back-2").onclick = function () { slWizardGo(1); };
    document.getElementById("sl-next-2").onclick = function () { slWizardGo(3); };
    document.getElementById("sl-back-3").onclick = function () { slWizardGo(2); };
    document.getElementById("sl-next-3").onclick = function () { slWizardGo(4); };
    document.getElementById("sl-back-4").onclick = function () { slWizardGo(3); };
    document.getElementById("sl-next-4").onclick = function () { slWizardGo(5); };
    document.getElementById("sl-back-5").onclick = function () { slWizardGo(4); };
    document.getElementById("sl-next-5").onclick = function () { slWizardGo(6); };
    document.getElementById("sl-back-6").onclick = function () { slWizardGo(5); };
    document.getElementById("sl-back-1").onclick = function () { go("dashboard"); };
    document.getElementById("sl-cancel").onclick = function () { go("dashboard"); };

    var photoInput = document.getElementById("sl-photo-input");
    var photoDrop = document.getElementById("sl-photo-drop");
    photoInput.onchange = function () {
      if (photoInput.files && photoInput.files.length) {
        for (var i = 0; i < photoInput.files.length; i++) slWizardAddPhoto();
        photoInput.value = "";
      }
    };
    photoDrop.addEventListener("dragover", function (e) { e.preventDefault(); photoDrop.classList.add("drag"); });
    photoDrop.addEventListener("dragleave", function () { photoDrop.classList.remove("drag"); });
    photoDrop.addEventListener("drop", function (e) {
      e.preventDefault();
      photoDrop.classList.remove("drag");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        for (var j = 0; j < e.dataTransfer.files.length; j++) slWizardAddPhoto();
      }
    });

    document.getElementById("sl-submit").onclick = function () {
      toast("Service log SL-3320 submitted — queued for accountant review (mock)", "ok");
      go("servicelogs");
    };
  }

  function initEditorTabs() {
    document.querySelectorAll("[data-ed-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        setEdTab(btn.getAttribute("data-ed-tab"));
      });
    });
    var copyBtn = document.getElementById("ed-log-copy-lines");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        setEdTab("invoice");
        toast("Draft lines copied to invoice editor (mock)", "ok");
      });
    }
    populateEditorLogPane(ctx.editorLog || "3312");
    setEdTab("invoice");
  }

  initPortal();

  var qs = window.location.search;
  if (qs.indexOf("app=1") !== -1) {
    applyUser("devon");
    showApp();
  } else if (qs.indexOf("auth=staff") !== -1 || qs.indexOf("auth=1") !== -1) {
    showStaffAuth("login");
  } else {
    showCustomerAuth();
  }

  initTags();
  initFsBars();
  initSlWizard();
  initEditorTabs();
  initChipFilters();
  initPagination();
  applyUser("devon");
})();
