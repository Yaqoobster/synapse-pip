// ==UserScript==
// @name         Synapse Pip
// @namespace    synapse
// @version      1.20261120.010903
// @description  Pip, the Synapse helper, on claude.ai: suggests experts while you type and adds setup commands to your message. Never sends anything.
// @match        https://claude.ai/*
// @run-at       document-idle
// @noframes
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/Yaqoobster/synapse-pip/main/synapse-pip.user.js
// @downloadURL  https://raw.githubusercontent.com/Yaqoobster/synapse-pip/main/synapse-pip.user.js
// ==/UserScript==
// Source: extras/pip-userscript/template.user.js in the Synapse plugin repo. Contract: docs/ARCHITECTURE.md §3.13, ADR 0009.
(function () {
  "use strict";
  const DATA = {"experts":[["stats","Statistician","Study design, sample size, the right test",["p-value","p<","significan","statistic","power","sample size","n=","replicate","pseudoreplic","t-test","anova","mixed model","regression","correlation","confidence interval","effect size","multiple comparison","fdr","batch","normaliz","differential expression","survival","kaplan","cox","bootstrap","bayesian","randomiz","blind"]],["bio","Cancer biologist","Mechanism, model systems, assay validity",["mechanism","pathway","tumor","tumour","cancer","metasta","niche","platelet","neutrophil","macrophage","t cell","immune","ctc","circulating tumor","microenvironment","mouse","pdx","gemm","xenograft","cell line","organoid","in vivo","in vitro","knockout","crispr","sirna","antibody","marker","staining","flow cytometry","immunofluorescence","scrna","single-cell","spatial","transcriptom","lnp","nanoparticle"]],["skeptic","Tough reviewer","Hunts the weakest assumption in anything",["is this right","poke holes","critique","what's wrong","devil","stress test","weakness","flaw","assumption","convince","sanity check","does this hold","reviewer"]],["architect","Software architect","Code and pipeline structure, no hardcoding",["pipeline","refactor","architecture","module","modular","hardcod","config","yaml","package","function","class","script","notebook","jupyter","python","groovy","qupath","workflow","snakemake","nextflow","api","interface","plugin","registry","reproducib","environment","conda","test","pytest","cli"]],["editor","Science editor","Clarity, structure and claims in writing",["write","draft","edit","rewrite","abstract","manuscript","paper","introduction","discussion","cover letter","personal statement","essay","application","grant","aims","response to reviewers","rebuttal","email","tone","wording","concise","clarity","flow"]]],"modes":[["#reviewer","Check my work","Problems, ranked by importance"],["#mentor","Teach me","Guide me with questions"],["#collab","Build with me","Plan and make it together"]]}; // {experts:[[cmd,title,desc,[triggers]]], modes:[[cmd,label,desc]]}
  const KEY = "synapse-pip-hidden";
  const MIN_CHARS = 60;
  const store = { // storage can be blocked (privacy settings); Pip must keep working
    get: k => { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { mem[k] = v; } } };
  const mem = {};
  const CMD_RE = /(^|\s)[#@＠+][a-z]/i;

  // ---------- page adapters (the only code that knows claude.ai's markup) ----------
  function composer() {
    const sel = ['[contenteditable="true"][aria-label*="prompt" i]', 'div.ProseMirror[contenteditable="true"]',
      'textarea[aria-label*="prompt" i]', 'fieldset [contenteditable="true"]'];
    for (const s of sel) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    return null;
  }
  function visible(el) { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 8; }
  function box(ed) { return ed.closest("fieldset") || ed.parentElement?.parentElement || ed; }
  function textOf(ed) { return (ed.value ?? ed.innerText ?? "").trim(); }
  function prepend(ed, cmd) {
    const cur = textOf(ed);
    if ((" " + cur + " ").includes(" " + cmd + " ")) return false;
    ed.focus();
    if (ed.tagName === "TEXTAREA") {
      ed.setRangeText(cmd + " ", 0, 0, "end"); ed.dispatchEvent(new Event("input", { bubbles: true })); return true;
    }
    const s = getSelection(), r = document.createRange();
    r.selectNodeContents(ed); r.collapse(true); s.removeAllRanges(); s.addRange(r);
    return document.execCommand("insertText", false, cmd + " ");
  }

  // ---------- suggestions (same triggers and rule as the router's score_advisors) ----------
  function suggest(text) {
    const t = text.toLowerCase();
    return DATA.experts.map(e => [e[0], [...new Set((e[3] || []).filter(k => k && t.includes(k.toLowerCase())))]])
      .filter(([, h]) => h.length >= 2 || (h.length === 1 && h[0].length >= 9))
      .sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([n]) => n);
  }

  // ---------- UI (shadow DOM, isolated from the page) ----------
  const host = document.createElement("div");
  host.id = "synapse-pip-host";
  host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
  :host{all:initial}
  .w{position:fixed;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--fg)}
  .p{width:46px;height:46px;border:0;padding:0;background:transparent;cursor:pointer;position:relative}
  .p svg{width:46px;height:46px;animation:bob 2.6s ease-in-out infinite}
  .p:focus{outline:none}.p:focus-visible{outline:2px solid var(--ac);outline-offset:2px;border-radius:10px}
  .e{animation:blink 4.2s infinite;transform-origin:center;transform-box:fill-box}
  .wv{opacity:0}.typing .wv{animation:wave 1s ease-out infinite}.typing .w2{animation-delay:.15s}.typing .w3{animation-delay:.3s}
  .dot{position:absolute;top:3px;right:5px;width:10px;height:10px;border-radius:50%;background:#e05a47;border:2px solid var(--bg);display:none}
  .badge .dot{display:block}
  .b{position:fixed;width:300px;max-height:70vh;overflow:auto;background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.25);display:none}
  .open .b{display:block}
  .t{font-weight:600;font-size:14px;margin-bottom:2px}.m{color:var(--mu);font-size:12px}
  .h{font-size:12px;font-weight:600;margin:10px 0 4px}
  .x{display:flex;align-items:center;gap:6px;padding:5px 0;border-top:1px solid var(--bd)}
  .x .n{flex:1;min-width:0}.x small{display:block;color:var(--mu);font-size:11px}
  .sug{color:var(--ac);font-size:10px;font-weight:600;margin-left:4px}
  button.c{font:inherit;font-size:11px;padding:3px 7px;border-radius:7px;border:1px solid var(--bd);background:var(--b2);color:var(--fg);cursor:pointer;white-space:nowrap}
  button.c:hover{border-color:var(--ac)}button.c:disabled{opacity:.45;cursor:default}
  .r{display:flex;flex-wrap:wrap;gap:6px}.st{min-height:16px;font-size:12px;color:var(--ac);margin-top:8px}
  @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
  @keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
  @keyframes wave{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
  @media (prefers-reduced-motion:reduce){.p svg,.e,.typing .wv{animation:none}}
  </style>
  <div class="w" part="wrap">
    <button class="p" aria-label="Pip: Synapse setup helper" aria-expanded="false" title="Pip — setup helper">
      <svg viewBox="-6 0 70 64" aria-hidden="true">
        <path class="wv w1" d="M11 17Q7 22 11 27" fill="none" stroke="#9fd8bd" stroke-width="2" stroke-linecap="round"/>
        <path class="wv w2" d="M7 14Q1 22 7 30" fill="none" stroke="#9fd8bd" stroke-width="2" stroke-linecap="round"/>
        <path class="wv w3" d="M3 11Q-5 22 3 33" fill="none" stroke="#9fd8bd" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M40 44L53 61H46L37 48Z" fill="#23704b"/><ellipse cx="34" cy="37" rx="13" ry="15" fill="#3fb27f"/>
        <ellipse cx="30" cy="41" rx="7" ry="9" fill="#f2c94c"/><path d="M38 29Q51 38 43 51Q36 45 38 29Z" fill="#23704b"/>
        <circle cx="28" cy="20" r="10" fill="#3fb27f"/><path d="M29 10.5Q33 3 38 9Q34 9 32 12Z" fill="#e05a47"/>
        <path d="M18.5 18Q11.5 20.5 15.5 27Q19 25 20.5 21.5Z" fill="#f08a24"/><circle cx="25" cy="18" r="3.2" fill="#fff"/>
        <circle class="e" cx="24.5" cy="18" r="1.7" fill="#1b1b1b"/><path d="M30 51L29 56M36 51L37 56" stroke="#f08a24" stroke-width="2" stroke-linecap="round"/>
      </svg><span class="dot"></span>
    </button>
    <div class="b" role="dialog" aria-label="Synapse setup helper">
      <div class="t">Pip · Synapse</div>
      <div class="m" id="hint">Adds commands to the start of your message. Nothing is sent until you press Enter.</div>
      <div class="h">How should Claude work?</div><div class="r" id="modes"></div>
      <div class="h">Experts</div><div id="ex"></div>
      <div class="r" style="margin-top:10px"><button class="c" id="menu">Full setup menu (@menu)</button><button class="c" id="hide">Hide Pip</button></div>
      <div class="st" id="st" aria-live="polite"></div>
    </div>
  </div>`;
  const $ = s => root.querySelector(s), wrap = $(".w"), pip = $(".p"), bub = $(".b"), st = $("#st");

  DATA.modes.forEach(([cmd, label, desc]) => {
    const b = document.createElement("button"); b.className = "c"; b.textContent = label; b.title = desc; b.dataset.cmd = cmd;
    $("#modes").appendChild(b);
  });
  function renderExperts(sugg) {
    const ex = $("#ex"); ex.textContent = "";
    [...DATA.experts].sort((a, b) => sugg.includes(b[0]) - sugg.includes(a[0])).forEach(([n, title, desc]) => {
      const row = document.createElement("div"); row.className = "x";
      row.innerHTML = `<div class="n"><b></b>${sugg.includes(n) ? '<span class="sug">suggested</span>' : ""}<small></small></div>`;
      row.querySelector("b").textContent = title; row.querySelector("small").textContent = desc;
      [["Weigh in", "+" + n], ["Second opinion", "+" + n + " consult"]].forEach(([l, cmd]) => {
        const b = document.createElement("button"); b.className = "c"; b.textContent = l; b.dataset.cmd = cmd; row.appendChild(b);
      });
      ex.appendChild(row);
    });
  }

  // ---------- theme + position ----------
  function theme() {
    let dark = matchMedia("(prefers-color-scheme: dark)").matches;
    for (const el of [document.body, document.documentElement]) {
      const m = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (m.length >= 3 && (m.length < 4 || m[3] > 0)) { dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 128; break; }
    }
    const v = dark ? ["#f2f0e8", "#2b2a27", "#46443f", "#9a978d", "#34332f", "#7fc8a6"] : ["#1f1e1b", "#ffffff", "#dedbd2", "#6f6c64", "#f6f5f1", "#23704b"];
    ["--fg", "--bg", "--bd", "--mu", "--b2", "--ac"].forEach((k, i) => wrap.style.setProperty(k, v[i]));
  }
  let lastKey = "";
  function place() {
    const ed = composer();
    const hidden = store.get(KEY) === "1";
    host.style.display = !ed || hidden ? "none" : "block";
    if (!ed || hidden) { setOpen(false); return; }
    const r = box(ed).getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - 54, r.right - 58)), top = Math.max(8, r.top - 44);
    const key = left + "," + top;
    if (key !== lastKey) {
      lastKey = key;
      wrap.style.left = left + "px"; wrap.style.top = top + "px";
      bub.style.left = Math.max(8, Math.min(innerWidth - 308, left + 46 - 300)) + "px";
      bub.style.bottom = (innerHeight - top + 6) + "px";
    }
  }

  // ---------- state ----------
  function setOpen(o) {
    wrap.classList.toggle("open", o); pip.setAttribute("aria-expanded", String(o));
    if (o) { const ed = composer(); const txt = ed ? textOf(ed) : ""; renderExperts(suggest(txt)); $("#menu").disabled = !!txt; st.textContent = txt ? "" : ""; wrap.classList.remove("badge"); }
  }
  let typingTimer = 0;
  function onInput(e) {
    const ed = composer();
    if (!ed || !(e.target === ed || ed.contains(e.target))) return;
    wrap.classList.add("typing"); clearTimeout(typingTimer);
    typingTimer = setTimeout(() => wrap.classList.remove("typing"), 1200);
    const txt = textOf(ed);
    wrap.classList.toggle("badge", txt.length >= MIN_CHARS && !CMD_RE.test(txt) && suggest(txt).length > 0 && !wrap.classList.contains("open"));
  }

  pip.addEventListener("click", e => { e.stopPropagation(); setOpen(!wrap.classList.contains("open")); });
  bub.addEventListener("click", e => {
    e.stopPropagation();
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const ed = composer(); if (!ed) return;
    if (b.id === "hide") { store.set(KEY, "1"); place(); return; }
    if (b.id === "menu") { if (!textOf(ed)) { prepend(ed, "@menu"); st.textContent = "Added @menu — press Enter to open the full panel."; } return; }
    if (b.dataset.cmd) st.textContent = prepend(ed, b.dataset.cmd) ? `Added ${b.dataset.cmd}` : `${b.dataset.cmd} is already in your message`;
    $("#menu").disabled = !!textOf(ed);
  });
  document.addEventListener("click", e => { if (!e.composedPath().includes(host)) setOpen(false); }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); }, true);
  document.addEventListener("input", onInput, true);
  addEventListener("resize", place); addEventListener("scroll", place, true);

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Show Pip", () => { store.set(KEY, null); place(); });
    GM_registerMenuCommand("Hide Pip", () => { store.set(KEY, "1"); place(); });
  }
  document.documentElement.appendChild(host);
  theme(); place();
  setInterval(() => { theme(); place(); }, 700);
  window.__synapsePip = { version: "1.20261120.010903", suggest, composer };
})();
