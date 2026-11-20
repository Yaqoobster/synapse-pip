// ==UserScript==
// @name         Synapse Pip
// @namespace    synapse
// @version      1.20261120.034405
// @description  Pip, the Synapse helper, on claude.ai: watches you type, suggests experts, and adds setup commands to your message. Never sends anything.
// @match        https://claude.ai/*
// @run-at       document-idle
// @noframes
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/Yaqoobster/synapse-pip/main/synapse-pip.user.js
// @downloadURL  https://raw.githubusercontent.com/Yaqoobster/synapse-pip/main/synapse-pip.user.js
// ==/UserScript==
// Source: extras/pip-userscript/template.user.js in the Synapse plugin repo. Contract: docs/ARCHITECTURE.md §3.13, ADR 0009/0012.
// Network: only GETs its own public settings file (CONFIG_URL). Never sends page content anywhere.
(function () {
  "use strict";
  // Built-in settings (fallback). Live settings replace them — see "live settings" below. Shape (schema 1):
  // {experts:[[name,title,blurb,specialties,use_when,[triggers]]], modes:[[cmd,label,desc]], labels:{…}, modeRules:{mode:[regex]}}
  let DATA = {"schema":1,"experts":[["stats","Statistician","Study design, sample size, the right test","unit of replication and n · power and sample size · choosing and checking the test or model · mixed models and nested data · multiplicity · effect sizes and uncertainty","you have numbers, n, p-values, groups or a design to plan or check",["p-value","p<","significan","statistic","power","sample size","n=","replicate","pseudoreplic","t-test","anova","mixed model","regression","correlation","confidence interval","effect size","multiple comparison","fdr","batch","normaliz","differential expression","survival","kaplan","cox","bootstrap","bayesian","randomiz","blind"]],["bio","Biologist","Mechanism, model systems, assay validity","cell and molecular mechanism · model-system fit (cell lines, organoids, mice, patient samples) · assay and marker validity · controls and orthogonal validation · physiology · cancer and the tumour microenvironment","a claim is about how a biological system works, or depends on a model, assay or marker",["biology","biological","cellular","protein","genetic","gene expression","physiolog","mechanism","pathway","tumor","tumour","cancer","metasta","niche","platelet","neutrophil","macrophage","t cell","immune","ctc","circulating tumor","microenvironment","mouse","pdx","gemm","xenograft","cell line","organoid","in vivo","in vitro","knockout","crispr","sirna","antibody","marker","staining","flow cytometry","immunofluorescence","scrna","single-cell","spatial","transcriptom","lnp","nanoparticle"]],["physics","Physicist","Equations, scaling and physical limits behind any system","dimensional analysis and scaling · conservation laws and boundary conditions · governing equations (mechanics, transport, kinetics, statistical mechanics, optics) · order-of-magnitude estimates · analytical vs numerical solutions, error and sensitivity","a result depends on forces, flow, diffusion, kinetics, energy, optics or a mathematical model — or a number needs a sanity check against physical limits",["physics","physical","equation","mechanics","mechanical","force","stress","strain","shear","viscosity","viscous","reynolds","fluid","flow rate","diffusion","diffusivity","transport","kinetics","rate constant","binding energy","thermodynamic","entropy","free energy","dimensionless","dimensional","units","scaling","order of magnitude","differential equation","ode","pde","boundary condition","conservation","optics","optical","photon","wavelength","refractive","point spread","signal-to-noise","fourier","spectral","simulation","finite element","monte carlo","biophysic","elastic","stiffness","modulus","adhesion","brownian","stokes","laminar","turbulent"]],["architect","Software architect","Code and pipeline structure, no hardcoding","modular pipeline design · config instead of hardcoding · interfaces and contracts · reproducible environments · testing · QuPath/Python/R tooling","you are writing, refactoring or planning code, scripts or an analysis pipeline",["pipeline","refactor","architecture","module","modular","hardcod","config","yaml","package","function","class","script","notebook","jupyter","python","groovy","qupath","workflow","snakemake","nextflow","api","interface","plugin","registry","reproducib","environment","conda","test","pytest","cli"]],["editor","Science editor","Clarity, structure and claims in writing","argument structure · claim–evidence match and hedging · concision and flow · journal and grant conventions · responses to reviewers","you are drafting or revising a manuscript, abstract, grant, email or response",["write","draft","edit","rewrite","abstract","manuscript","paper","introduction","discussion","cover letter","personal statement","essay","application","grant","aims","response to reviewers","rebuttal","email","tone","wording","concise","clarity","flow"]]],"modes":[["#review","Review my work","Problems, ranked by importance"],["#teach","Teach me","Guide me with questions"],["#build","Build with me","Plan and make it together"]],"labels":{"off":"Off","advise":"Advise","review":"Review","adviseHint":"the expert shapes what Claude writes or builds.","reviewHint":"the expert reviews it separately and gives a verdict; pick two or more to compare.","expertsHeading":"2 · Bring in experts (optional)","modesHeading":"How should Claude work?","info":"What this expert does","specialises":"Specialises in","useWhen":"Use when","tooMany":"At most two experts can advise at once.","empty":"Type or paste your request first.","recommended":"Recommended","addToMessage":"Add to message","moreExperts":"Show more experts","fewerExperts":"Fewer experts","hint":"Adds commands to the start of your message. Nothing is sent until you press Enter.","needExperts":"Need an expert? Tap me"},"modeRules":{"reviewer":["\\breview\\b","\\bcritique\\b","\\bpeer[- ]review","\\bcheck (this|my)\\b","\\bevaluate\\b","\\bis (this|that|it) (right|correct|valid|sound|fine|ok|okay|good enough)\\b","\\bdoes (this|it) hold\\b","\\bpoke holes\\b","\\bfeedback on\\b","\\bwhat'?s wrong\\b","\\bsanity[- ]check\\b"],"mentor":["^\\s*why\\b","\\bwhy (does|do|is|are|would)\\b","\\bhow (does|do|is|are)\\b","\\bexplain\\b","\\bhelp me understand\\b","\\bteach me\\b","\\bwhat (is|are) (a |an |the )?\\w+","\\bi don'?t (get|understand)\\b"],"collaborator":["\\bdesign\\b","\\bplan\\b","\\bbuild\\b","\\blet'?s\\b","\\bcreate\\b","\\bimplement\\b","\\brefactor\\b","\\bdraft\\b","\\bset up\\b","\\bwrite (a|the|me)\\b","\\bdebug","\\bfix\\b","\\bbug\\b","\\berror\\b","\\btraceback\\b","\\bnot working\\b","\\bbroken\\b"]}};
  const CONFIG_URL = "https://raw.githubusercontent.com/Yaqoobster/synapse-pip/main/pip-config.json", CONFIG_TTL = 10 * 60 * 1000, CFG_KEY = "synapse-pip-config";
  const KEY = "synapse-pip-hidden";
  const MIN_CHARS = 60, IDLE_MS = 1000, CHIRP_MS = 5000, FLAP_MS = 700, MIN_UP = 260; // MIN_UP: room above that is enough to open upward
  const mem = {};
  const store = { // storage can be blocked (privacy settings); Pip must keep working
    get: k => { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { mem[k] = v; } } };
  const CMD_RE = /(^|\s)[#@＠+][a-z]/i;
  let TITLE = {}, MODE_RULES = [], L = {};
  function compile() {
    TITLE = Object.fromEntries(DATA.experts.map(e => [e[0], e[1]]));
    MODE_RULES = Object.entries(DATA.modeRules).map(([m, ps]) => [m, ps.map(p => new RegExp(p))]);
    L = DATA.labels || {};
  }
  compile();
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  function findToken(ed, src) { // first whole-word match of regex source src → {node?, start, end, text}
    const re = new RegExp("(^|\\s)(" + src + ")(?=\\s|$)");
    if (ed.tagName === "TEXTAREA") {
      const m = re.exec(ed.value); return m && { start: m.index + m[1].length, end: m.index + m[0].length, text: m[2] };
    }
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const m = re.exec(n.data);
      if (m) return { node: n, start: m.index + m[1].length, end: m.index + m[0].length, text: m[2] };
    }
    return null;
  }
  function writeAt(ed, hit, text) { // replace hit (or insert at start when hit is null)
    ed.focus();
    if (ed.tagName === "TEXTAREA") {
      hit ? ed.setRangeText(text, hit.start, hit.end, "end") : ed.setRangeText(text + " ", 0, 0, "end");
      ed.dispatchEvent(new Event("input", { bubbles: true })); return;
    }
    const s = getSelection(), r = document.createRange();
    if (hit) { r.setStart(hit.node, hit.start); r.setEnd(hit.node, hit.end); }
    else { r.selectNodeContents(ed); r.collapse(true); }
    s.removeAllRanges(); s.addRange(r);
    document.execCommand("insertText", false, hit ? text : text + " ");
  }

  // ---------- commands: add, or switch the conflicting form ----------
  function forms(cmd) { // [exact regex source, conflicting regex source | null]
    const m = cmd.match(/^\+([\w-]+) (advise|review)$/);
    if (m) { // any other form for the same expert (+x, +x advise, +x review, older +x consult) is switched, not duplicated
      const n = esc(m[1]);
      return [`\\+${n} ${m[2]}`, `\\+${n}(?: (?:advise|review|consult))?(?![\\w-])`];
    }
    if (/^#(review|teach|build)$/.test(cmd)) return [esc(cmd), "#(?:review(?:er)?|teach|build|mentor|collab(?:orator)?|auto)"];
    return [esc(cmd), null];
  }
  function apply(ed, cmd) {
    const [ex, conflict] = forms(cmd);
    if (findToken(ed, ex)) return `${cmd} is already in your message`;
    const hit = conflict && findToken(ed, conflict);
    writeAt(ed, hit, cmd);
    return hit ? `Switched ${hit.text} → ${cmd}` : `Added ${cmd}`;
  }

  // ---------- suggestions (same triggers, rules and tie-breaks as the router) ----------
  function suggestHits(text) {
    const t = text.toLowerCase();
    return DATA.experts.map(e => [e[0], [...new Set((e[5] || []).filter(k => k && t.includes(k.toLowerCase())))]])
      .filter(([, h]) => h.length >= 2 || (h.length === 1 && h[0].length >= 9))
      .sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  }
  const suggest = text => suggestHits(text).map(([n]) => n);
  function detectMode(text) {
    const low = text.toLowerCase();
    const counts = MODE_RULES.map(([m, res]) => [m, res.filter(r => r.test(low)).length]);
    const best = Math.max(...counts.map(c => c[1]));
    if (!best) return null;
    const ties = counts.filter(c => c[1] === best).map(c => c[0]);
    if (ties.length > 1) {
      if (ties.includes("collaborator") && /\b(debug|fix|bug|error|traceback|broken|not working)/.test(low)) return "collaborator";
      if (ties.includes("reviewer") && text.length > 800) return "reviewer";
      return null;
    }
    return ties[0];
  }
  function recommend(text) {
    if (!text || CMD_RE.test(text)) return null;
    const hits = suggestHits(text);
    if (!hits.length) return null;
    const mode = detectMode(text), top = hits.slice(0, 2).map(h => h[0]), review = mode === "reviewer";
    const cmds = top.map(n => `+${n} ${review ? "review" : "advise"}`);
    const words = [...new Set(hits.slice(0, 2).flatMap(h => h[1]))].slice(0, 3);
    return { cmds, experts: top, review, mode,
      label: `${review ? L.review : L.advise} · ${top.map(n => TITLE[n]).join(" + ")}`,
      why: `Your message mentions ${words.join(", ")}${review ? " and asks for a check" : ""}.` };
  }

  // ---------- UI (shadow DOM, isolated from the page) ----------
  const host = document.createElement("div");
  host.id = "synapse-pip-host";
  host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000";
  const root = host.attachShadow({ mode: "open" });
  const GRAD = "linear-gradient(135deg,#1e3a8a,#2563eb 55%,#0ea5e9)", MINT = "#bbf7d0";
  root.innerHTML = `<style>
  :host{all:initial}
  .w{position:fixed;width:46px;height:46px;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--fg)}
  .p{width:46px;height:46px;border:0;padding:0;background:transparent;cursor:pointer;position:relative}
  .p:focus{outline:none}.p:focus-visible{outline:2px solid var(--ac);outline-offset:2px;border-radius:10px}
  .p svg{width:46px;height:46px;overflow:visible;animation:bob 2.6s ease-in-out infinite}
  .hb{transform-box:fill-box;transform-origin:60% 95%}
  .typing .hb{animation:nod .45s ease-in-out infinite}
  .wing{transform-box:fill-box;transform-origin:15% 5%}
  .flap .wing{animation:flap .35s ease-in-out 2}
  .e{animation:blink 4.2s infinite;transform-origin:center;transform-box:fill-box}
  .wv path{opacity:0}.chirp .wv path{animation:wave 1s ease-out infinite}.chirp .wv .w2{animation-delay:.15s}.chirp .wv .w3{animation-delay:.3s}
  .dot{position:absolute;top:3px;right:5px;width:10px;height:10px;border-radius:50%;background:#e05a47;border:2px solid var(--bg);display:none}
  .badge .dot{display:block}
  .tip{position:absolute;right:52px;bottom:10px;display:none;background:${GRAD};color:${MINT};font-size:12px;font-weight:600;
    padding:6px 10px;border-radius:12px 12px 4px 12px;width:max-content;max-width:min(240px,calc(100vw - 80px));white-space:normal;line-height:1.3;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
  .chirp .tip{display:block;animation:pop .18s ease-out}
  .b{position:fixed;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.25);display:none}
  .open .b{display:block}
  .top{display:flex;align-items:center;gap:6px}.t{font-weight:600;font-size:14px;flex:1}.m{color:var(--mu);font-size:12px;margin-top:2px}
  .rec{background:${GRAD};color:${MINT};border-radius:10px;padding:8px 10px;margin-top:10px}
  .rec .rt{font-size:10px;letter-spacing:.06em;text-transform:uppercase;opacity:.85}.rec .rl{font-weight:600;font-size:13px;color:#d1fae5}
  .rec .rw{font-size:12px;margin:2px 0 6px}.rec button{font:inherit;font-size:12px;padding:3px 9px;border-radius:7px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#ecfdf5;cursor:pointer}
  .h{font-size:12px;font-weight:600;margin:10px 0 4px}
  .x{display:grid;grid-template-columns:1fr auto;align-items:center;gap:4px 8px;padding:6px 0;border-top:1px solid var(--bd)}
  .x .n{min-width:0}.x small{display:block;color:var(--mu);font-size:11px}
  .x .bt{display:flex;flex-direction:column;gap:4px}.x .bt button{width:100%}
  .sug{color:var(--ac);font-size:10px;font-weight:600;margin-left:4px}
  .inf{border:0;background:none;color:var(--mu);cursor:pointer;font-size:12px;padding:0 2px}.det{display:none;font-size:11px;color:var(--mu);margin-top:2px}.x.showd .det{display:block}
  button.c{font:inherit;font-size:11px;padding:3px 7px;border-radius:7px;border:1px solid var(--bd);background:var(--b2);color:var(--fg);cursor:pointer;white-space:nowrap}
  button.c:hover{border-color:var(--ac)}button.c:disabled{opacity:.45;cursor:default}
  button.c.recb{background:${GRAD};color:${MINT};border-color:transparent;font-weight:600}
  .r{display:flex;flex-wrap:wrap;gap:6px}.st{font-size:12px;color:var(--ac);margin-top:6px}.st:empty{display:none}
  .more{margin-top:6px}
  @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
  @keyframes nod{0%,100%{transform:rotate(0)}50%{transform:rotate(-7deg) translateY(.6px)}}
  @keyframes flap{0%,100%{transform:rotate(0)}50%{transform:rotate(-32deg)}}
  @keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
  @keyframes wave{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
  @keyframes pop{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.p svg,.e,.typing .hb,.flap .wing,.chirp .wv path,.chirp .tip{animation:none}.chirp .wv path{opacity:1}}
  </style>
  <div class="w" part="wrap">
    <div class="tip" role="button" tabindex="0" aria-label="Pip suggestion"></div>
    <button class="p" aria-label="Pip: Synapse setup helper" aria-expanded="false" title="Pip — setup helper">
      <svg viewBox="-6 0 70 64" aria-hidden="true">
        <g class="wv"><path class="w1" d="M11 17Q7 22 11 27" fill="none" stroke="#9fd8bd" stroke-width="2" stroke-linecap="round"/>
        <path class="w2" d="M7 14Q1 22 7 30" fill="none" stroke="#9fd8bd" stroke-width="2" stroke-linecap="round"/>
        <path class="w3" d="M3 11Q-5 22 3 33" fill="none" stroke="#9fd8bd" stroke-width="1.6" stroke-linecap="round"/></g>
        <path d="M40 44L53 61H46L37 48Z" fill="#23704b"/><ellipse cx="34" cy="37" rx="13" ry="15" fill="#3fb27f"/>
        <ellipse cx="30" cy="41" rx="7" ry="9" fill="#f2c94c"/>
        <g class="wing"><path d="M38 29Q51 38 43 51Q36 45 38 29Z" fill="#23704b"/></g>
        <g class="look"><g class="hb">
          <circle cx="28" cy="20" r="10" fill="#3fb27f"/><path d="M29 10.5Q33 3 38 9Q34 9 32 12Z" fill="#e05a47"/>
          <path d="M18.5 18Q11.5 20.5 15.5 27Q19 25 20.5 21.5Z" fill="#f08a24"/><circle cx="25" cy="18" r="3.2" fill="#fff"/>
          <circle class="e" cx="24.5" cy="18" r="1.7" fill="#1b1b1b"/>
        </g></g>
        <path d="M30 51L29 56M36 51L37 56" stroke="#f08a24" stroke-width="2" stroke-linecap="round"/>
      </svg><span class="dot"></span>
    </button>
    <div class="b" role="dialog" aria-label="Synapse setup helper">
      <div class="top"><div class="t">Pip · Synapse</div><button class="c" id="menu" title="Open the full setup panel">@menu</button><button class="c" id="hide">Hide Pip</button></div>
      <div class="m" id="hint"></div>
      <div class="rec" id="rec" hidden><div class="rt"></div><div class="rl"></div><div class="rw"></div><button id="recadd"></button></div>
      <div class="st" id="st" aria-live="polite"></div>
      <div class="h" id="mh"></div><div class="r" id="modes"></div>
      <div class="h" id="eh">Experts</div><div class="m" id="ah"></div><div id="ex"></div><button class="c more" id="more" hidden></button>
    </div>
  </div>`;
  const $ = s => root.querySelector(s);
  const wrap = $(".w"), pip = $(".p"), bub = $(".b"), st = $("#st"), tip = $(".tip"), pupil = $(".e"), lookG = $(".look");
  let showAll = false, rec = null;

  function renderStatic() { // every text that comes from settings (labels, modes)
    $("#hint").textContent = L.hint || ""; $("#mh").textContent = L.modesHeading || "";
    $("#ah").textContent = `${L.advise}: ${L.adviseHint} ${L.review}: ${L.reviewHint}`;
    $("#rec .rt").textContent = L.recommended || ""; $("#recadd").textContent = L.addToMessage || "";
    const modes = $("#modes"); modes.textContent = "";
    DATA.modes.forEach(([cmd, label, desc]) => {
      const b = document.createElement("button"); b.className = "c"; b.textContent = label; b.title = desc; b.dataset.cmd = cmd;
      modes.appendChild(b);
    });
  }
  renderStatic();
  function renderExperts(sugg) {
    const ex = $("#ex"); ex.textContent = "";
    const list = [...DATA.experts].sort((a, b) => sugg.includes(b[0]) - sugg.includes(a[0]));
    const shown = sugg.length && !showAll ? list.filter(e => sugg.includes(e[0])) : list;
    shown.forEach(([n, title, blurb, specialties, useWhen]) => {
      const row = document.createElement("div"); row.className = "x"; row.dataset.n = n;
      row.innerHTML = `<div class="n"><b></b><button class="inf" aria-label="${L.info || "About"}" title="${L.info || "About"}">ⓘ</button>` +
        `${sugg.includes(n) ? '<span class="sug">suggested</span>' : ""}<small></small><div class="det"></div></div>`;
      row.querySelector("b").textContent = title; row.querySelector("small").textContent = blurb;
      row.querySelector(".det").textContent = `${L.specialises}: ${specialties}. ${L.useWhen}: ${useWhen}.`;
      row.querySelector(".inf").addEventListener("click", ev => { ev.stopPropagation(); row.classList.toggle("showd"); fit(); });
      const bt = document.createElement("div"); bt.className = "bt";
      [[L.advise, `+${n} advise`, false], [L.review, `+${n} review`, true]].forEach(([l, cmd, isReview]) => {
        const b = document.createElement("button"); b.className = "c"; b.textContent = l; b.dataset.cmd = cmd;
        if (rec && rec.experts.includes(n) && rec.review === isReview) b.classList.add("recb");
        bt.appendChild(b);
      });
      row.appendChild(bt);
      ex.appendChild(row);
    });
    const hidden = list.length - shown.length, more = $("#more");
    more.hidden = !sugg.length; more.textContent = hidden ? `${L.moreExperts} (${hidden})` : L.fewerExperts;
  }
  function renderRec() {
    const box = $("#rec"); box.hidden = !rec;
    if (rec) { box.querySelector(".rl").textContent = rec.label; box.querySelector(".rw").textContent = rec.why; }
  }

  // ---------- theme, position, fit ----------
  function theme() {
    let dark = matchMedia("(prefers-color-scheme: dark)").matches;
    for (const el of [document.body, document.documentElement]) {
      const m = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (m.length >= 3 && (m.length < 4 || m[3] > 0)) { dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 128; break; }
    }
    const v = dark ? ["#f2f0e8", "#2b2a27", "#46443f", "#9a978d", "#34332f", "#7fc8a6"] : ["#1f1e1b", "#ffffff", "#dedbd2", "#6f6c64", "#f6f5f1", "#23704b"];
    ["--fg", "--bg", "--bd", "--mu", "--b2", "--ac"].forEach((k, i) => wrap.style.setProperty(k, v[i]));
  }
  function fit() { // keep the bubble fully on screen: open toward the larger space, cap height, scroll inside
    if (!wrap.classList.contains("open")) return;
    const pr = pip.getBoundingClientRect(), M = 8, G = 6;
    const W = Math.min(300, innerWidth - 2 * M);
    const above = pr.top - M - G, below = innerHeight - pr.bottom - M - G;
    bub.style.width = W + "px";
    bub.style.left = Math.max(M, Math.min(pr.right - W, innerWidth - W - M)) + "px";
    // prefer opening upward (keeps the message box visible) whenever there is enough room above
    if (above >= Math.min(MIN_UP, below)) { bub.style.top = ""; bub.style.bottom = (innerHeight - pr.top + G) + "px"; bub.style.maxHeight = Math.max(80, above) + "px"; }
    else { bub.style.bottom = ""; bub.style.top = (pr.bottom + G) + "px"; bub.style.maxHeight = Math.max(80, below) + "px"; }
  }
  function place() {
    const ed = composer(), hidden = store.get(KEY) === "1";
    host.style.display = !ed || hidden ? "none" : "block";
    if (!ed || hidden) { setOpen(false); stopChirp(); return; }
    const r = box(ed).getBoundingClientRect();
    wrap.style.left = Math.max(8, Math.min(innerWidth - 54, r.right - 58)) + "px";
    wrap.style.top = Math.max(8, r.top - 44) + "px";
    fit();
  }

  // ---------- state: typing (head bob) → 1 s pause with text → chirp + hint for 5 s; click → flap ----------
  function setOpen(o) {
    wrap.classList.toggle("open", o); pip.setAttribute("aria-expanded", String(o));
    if (o) {
      const ed = composer(), txt = ed ? textOf(ed) : "";
      rec = recommend(txt); showAll = false;
      renderRec(); renderExperts(suggest(txt)); $("#menu").disabled = !!txt; st.textContent = "";
      wrap.classList.remove("badge"); stopChirp(); fit();
    }
  }
  let typingT = 0, idleT = 0, chirpT = 0, flapT = 0;
  function stopChirp() { clearTimeout(chirpT); wrap.classList.remove("chirp"); }
  function onIdle() {
    const ed = composer(); if (!ed || wrap.classList.contains("open")) return;
    const txt = textOf(ed); if (!txt || CMD_RE.test(txt)) return;
    rec = recommend(txt);
    tip.textContent = rec ? rec.label + "?" : (L.needExperts || "Tap me");
    wrap.classList.add("chirp"); clearTimeout(chirpT); chirpT = setTimeout(stopChirp, CHIRP_MS);
  }
  function onInput(e) {
    const ed = composer();
    if (!ed || !(e.target === ed || ed.contains(e.target))) return;
    wrap.classList.add("typing"); stopChirp();
    clearTimeout(typingT); typingT = setTimeout(() => wrap.classList.remove("typing"), IDLE_MS);
    clearTimeout(idleT); idleT = setTimeout(onIdle, IDLE_MS);
    const txt = textOf(ed);
    wrap.classList.toggle("badge", txt.length >= MIN_CHARS && !CMD_RE.test(txt) && suggest(txt).length > 0 && !wrap.classList.contains("open"));
  }
  function flap() {
    wrap.classList.remove("flap"); void wrap.offsetWidth; wrap.classList.add("flap");
    clearTimeout(flapT); flapT = setTimeout(() => wrap.classList.remove("flap"), FLAP_MS);
  }

  // ---------- eyes and head follow the cursor ----------
  let mx = null, my = null, raf = 0;
  function look() {
    raf = 0;
    const pr = pip.getBoundingClientRect();
    let ox = 0, oy = 0, a = 0;
    if (mx != null && pr.width) {
      const ex = pr.left + pr.width * (31 / 70), ey = pr.top + pr.height * (18 / 64);
      const dx = mx - ex, dy = my - ey, d = Math.hypot(dx, dy) || 1;
      ox = dx / d * 0.9; oy = dy / d * 0.9;
      if (!REDUCED) a = Math.max(-9, Math.min(9, -dy / 25));
    }
    pupil.setAttribute("cx", (24.5 + ox).toFixed(2)); pupil.setAttribute("cy", (18 + oy).toFixed(2));
    lookG.setAttribute("transform", `rotate(${a.toFixed(1)} 30 27)`);
  }
  addEventListener("mousemove", e => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(look); }, { passive: true });
  document.addEventListener("mouseleave", () => { mx = my = null; look(); });

  // ---------- live settings: fetch pip-config.json (labels, experts, rules) so text changes need no reinstall ----------
  function valid(c) {
    return c && c.schema === 1 && Array.isArray(c.experts) && c.experts.every(e => Array.isArray(e) && e.length >= 6 && typeof e[0] === "string" && Array.isArray(e[5]))
      && Array.isArray(c.modes) && c.labels && typeof c.labels === "object" && c.modeRules && typeof c.modeRules === "object";
  }
  function applySettings(c, source) {
    if (!valid(c)) return false;
    try { DATA = c; compile(); renderStatic(); if (wrap.classList.contains("open")) setOpen(true); window.__synapsePip.source = source; return true; }
    catch { return false; }
  }
  const gmGet = k => { try { return typeof GM_getValue === "function" ? GM_getValue(k, null) : store.get(k); } catch { return null; } };
  const gmSet = (k, v) => { try { typeof GM_setValue === "function" ? GM_setValue(k, v) : store.set(k, v); } catch { /* ignore */ } };
  function getText(url, cb) {
    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({ method: "GET", url, timeout: 8000, onload: r => cb(r.status === 200 ? r.responseText : null), onerror: () => cb(null), ontimeout: () => cb(null) });
    } else fetch(url, { cache: "no-store" }).then(r => r.ok ? r.text() : null).then(cb, () => cb(null));
  }
  function loadSettings(force) {
    let cached = null;
    try { cached = JSON.parse(gmGet(CFG_KEY) || "null"); } catch { cached = null; }
    if (cached && cached.cfg) applySettings(cached.cfg, "cache");
    if (!force && cached && Date.now() - (cached.at || 0) < CONFIG_TTL) return;
    getText(CONFIG_URL + "?t=" + Math.floor(Date.now() / CONFIG_TTL), txt => {
      if (!txt) return; // offline or blocked: keep cache / built-in
      let cfg = null; try { cfg = JSON.parse(txt); } catch { return; }
      if (applySettings(cfg, "live")) gmSet(CFG_KEY, JSON.stringify({ at: Date.now(), cfg }));
    });
  }

  // ---------- events ----------
  pip.addEventListener("click", e => { e.stopPropagation(); flap(); setOpen(!wrap.classList.contains("open")); });
  tip.addEventListener("click", e => {
    e.stopPropagation(); const ed = composer(); stopChirp();
    if (!ed) return;
    if (rec) { const msgs = rec.cmds.map(c => apply(ed, c)); flap(); setOpen(true); st.textContent = msgs.join(" · "); }
    else setOpen(true);
  });
  bub.addEventListener("click", e => {
    e.stopPropagation();
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const ed = composer(); if (!ed) return;
    if (b.id === "hide") { store.set(KEY, "1"); place(); return; }
    if (b.id === "more") { showAll = !showAll; renderExperts(suggest(textOf(ed))); fit(); return; }
    if (b.id === "menu") { if (!textOf(ed)) { apply(ed, "@menu"); st.textContent = "Added @menu — press Enter to open the full panel."; } return; }
    if (b.id === "recadd" && rec) st.textContent = rec.cmds.map(c => apply(ed, c)).join(" · ");
    else if (b.dataset.cmd) st.textContent = apply(ed, b.dataset.cmd);
    $("#menu").disabled = !!textOf(ed);
  });
  document.addEventListener("click", e => { if (!e.composedPath().includes(host)) setOpen(false); }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); }, true);
  document.addEventListener("input", onInput, true);
  addEventListener("resize", place); addEventListener("scroll", place, true);

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Show Pip", () => { store.set(KEY, null); place(); });
    GM_registerMenuCommand("Hide Pip", () => { store.set(KEY, "1"); place(); });
    GM_registerMenuCommand("Refresh Pip settings now", () => loadSettings(true));
  }
  document.documentElement.appendChild(host);
  theme(); place(); look();
  setInterval(() => { theme(); place(); }, 700);
  window.__synapsePip = { version: "1.20261120.034405", source: "built-in", suggest, detectMode, recommend, composer, root,
    labels: () => L, reload: () => loadSettings(true) };
  loadSettings(false);
})();
