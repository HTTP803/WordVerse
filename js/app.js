// 星云词汇 · 主程序 v1.0.0（本地化 three.js，无需 CDN / 支持 file:// 双击）
function loadError(msg) {
  const l = document.getElementById("loading");
  if (l) { l.style.opacity = 1; const t = l.querySelector(".txt"); if (t) t.textContent = "加载失败：" + msg; const s = l.querySelector(".spin"); if (s) s.style.display = "none"; }
}
window.addEventListener("error", ev => loadError(ev.message || "脚本运行出错"));
if (typeof THREE === "undefined") { loadError("3D 引擎未加载（js/vendor/three.min.js 缺失或被拦截）"); throw new Error("THREE missing"); }

const APP_VERSION = "1.9.4";
const DAILY_GOAL = 20; // 每日任务目标词数（须在初始化 updateHud 前声明，避免 TDZ）
const R = 640;                                   // 家族分布球壳半径
const gold = new THREE.Color(0xffd24a);
// 图例分类：记忆掌握度（数据来自本地 FSRS 状态，随学习实时变化）
const STATUS = { new: { name: "未学", color: 0x6f8bd6 }, learning: { name: "学习中", color: 0x19c3c3 }, mastered: { name: "已掌握", color: 0xffd24a } };
const STATUS_COLOR = { new: new THREE.Color(STATUS.new.color), learning: new THREE.Color(STATUS.learning.color), mastered: gold };
function statusOf(w) { const r = sr[w]; if (!r || r.s === 0) return "new"; if (r.s === 2) return "mastered"; return "learning"; }   // w=单词字符串（sr 系函数统一用字符串 key）
function starSize(st) { return st === "mastered" ? 30 : st === "learning" ? 20 : 12; }   // 已学(大)与未学(小)拉开尺寸，一眼区分
const LIB_KEY = "wordverse_lib";                 // 当前词库
const litKey = id => "wordverse_lit_" + id;      // 各库进度隔离

// ---------- 可变状态（随词库切换重建）----------
let cur = localStorage.getItem(LIB_KEY);
if (!cur || !LIBRARIES[cur]) cur = Object.keys(LIBRARIES)[0];   // 旧库名(如 cet46)失效时回退首个库，避免 undefined.total 崩溃
let core = [], families = [], lines = [], points = null, geo = null;
let col = null, siz = null, total = 0, coreCount = 0, lit = new Set();
let picked = -1, intro = 0;
let sr = {}, quizMode = false;                         // 记忆闭环：复习记录 + 测验态
let filterStatus = null;                             // 图例掌握度筛选（null=全部）
let searchList = [];                               // 单词搜索索引（buildLibrary 重建）
let allCntEl = null;                                 // 图例「全部」计数元素
let flyTarget = null, flying = false, flyKeepTarget = false;
const srKey = id => "wordverse_sr_" + id, DAY = 86400000;

// ---------- 场景 ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 6000);
camera.position.set(0, 0, 2600);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.getElementById("app").appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
controls.minDistance = 120; controls.maxDistance = 2600;

// ---------- 构建某词库的星空 ----------
// ---------- 词缀数据（自动把词成群连星座，纯规则、零人工标注）----------
const PREFIX = [
  ["anti","反对/抗"],["auto","自动"],["circum","环绕"],["contra","反对"],["counter","反"],
  ["de","向下/去除"],["dis","不/分离"],["en","使…/进入"],["ex","前/向外"],["extra","额外"],
  ["fore","在…前"],["hetero","异"],["homo","同"],["hyper","超"],["hypo","次/下"],
  ["il","不(在l前)"],["im","不(b/m/p前)"],["inter","在…间/相互"],["intra","在内"],["ir","不(在r前)"],
  ["macro","宏"],["mal","坏"],["mega","大"],["micro","微"],["mini","小"],["mis","错误"],
  ["mono","单"],["multi","多"],["neo","新"],["non","非/不"],["out","超过/外"],["over","过度/在上"],
  ["peri","周围"],["poly","多"],["post","在…后"],["pre","在…前"],["pro","向前/支持"],
  ["pseudo","假"],["re","再/重新"],["retro","向后"],["self","自身"],["semi","半"],["sub","在下/次"],
  ["super","超过/上"],["tele","远"],["trans","横过/转移"],["tri","三"],["ultra","极端"],
  ["un","否定/相反"],["under","不足/在下"],["uni","一"],["up","向上"],["vice","副"],["with","反对/向后"]
].map(([k, m]) => ({ k, m })).sort((a, b) => b.k.length - a.k.length);

const SUFFIX = [
  ["ability","名词(能力)"],["able","形(可…的)"],["age","名词"],["al","形容词"],["an","形/名"],
  ["ance","名词"],["ant","形/名"],["ary","形/名"],["ate","动/形"],["cy","名词"],
  ["dom","名词(领域/状态)"],["ence","名词"],["er","名(施事者)"],["ese","形/名(民族语)"],
  ["ess","名(女性)"],["etic","形容词"],["ful","形(充满)"],["hood","名(时期/状态)"],
  ["ible","形(可…的)"],["ic","形容词"],["ine","形容词"],["ish","形(略…的)"],
  ["ism","名(主义/学说)"],["ist","名(…者)"],["ite","形/名"],["ity","名(性质)"],
  ["ive","形容词"],["ization","名(…化)"],["ize","动词"],["ise","动词"],["less","形(无)"],
  ["let","名(小)"],["ling","名(小/幼)"],["logy","名(…学)"],["ly","副词"],["ment","名(结果/状态)"],
  ["most","形(最…)"],["ness","名(性质)"],["oid","形(像…的)"],["or","名(施事者)"],
  ["ory","形/名"],["osis","名(过程/状态)"],["ous","形容词"],["ship","名(身份/关系)"],
  ["sion","名词"],["tion","名(动作/状态)"],["ward","副(向)"],["wise","副(在…方面)"]
].map(([k, m]) => ({ k, m })).sort((a, b) => b.k.length - a.k.length);

function affixOf(w) {
  const t = w.w.toLowerCase();
  for (const p of PREFIX) if (t.length > p.k.length + 1 && t.startsWith(p.k)) return { type: "pre", label: p.k + "-", meaning: p.m };
  for (const s of SUFFIX) if (t.length > s.k.length + 2 && t.endsWith(s.k)) return { type: "suf", label: "-" + s.k, meaning: s.m };
  return null;
}
function affixColor(g) {
  const h = [...g.label].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
  return new THREE.Color().setHSL(h / 360, 0.55, 0.62);
}
function buildAffixGroups(lib, placed) {
  const buckets = {};
  lib.words.forEach(w => {
    if (placed.has(w.w)) return;
    const a = affixOf(w); if (!a) return;
    const key = a.type + ":" + a.label;
    (buckets[key] || (buckets[key] = { type: a.type, label: a.label, meaning: a.m, words: [] })).words.push(w);
  });
  let groups = Object.values(buckets).filter(g => g.words.length >= 4);
  groups.sort((x, y) => y.words.length - x.words.length);
  return groups.slice(0, 60);
}

function buildLibrary(id) {
  cur = id; localStorage.setItem(LIB_KEY, id);
  if (points) { scene.remove(points); geo.dispose(); }
  lines.forEach(l => { if (l) { scene.remove(l); l.geometry.dispose(); l.material.dispose(); } });
  lines = [];

  const lib = LIBRARIES[id];
  total = lib.total;
  lit = new Set(JSON.parse(localStorage.getItem(litKey(id)) || "[]"));
  loadSR();

  core = [];
  const famWords = new Set();
  // 1) 词根种子家族
  const groups = lib.families.map(r => ({
    kind: "root", label: r.root, meaning: r.meaning, color: new THREE.Color(THEMES[r.theme].color), words: r.words
  }));
  lib.families.forEach(r => r.words.forEach(w => famWords.add(w.w)));
  // 2) 词缀自动分组（非种子词），最多 60 个最常见词缀簇
  buildAffixGroups(lib, famWords).forEach(g => groups.push({ kind: "affix", type: g.type, label: g.label, meaning: g.meaning, color: affixColor(g), words: g.words }));

  // 已掌握词占比高的家族/词缀簇排到最前（Fibonacci 球面 fi 越小 → +z 前半球越靠近相机）
  const mRatio = g => g.words.length ? g.words.reduce((n, w) => n + (statusOf(w.w) === "mastered" ? 1 : 0), 0) / g.words.length : -1;
  groups.sort((a, b) => mRatio(b) - mRatio(a));

  const N = groups.length;
  const placed = new Set(famWords);
  families = [];
  groups.forEach((g, fi) => {
    const phi = Math.acos(1 - 2 * (fi + 0.5) / N);
    const th = Math.PI * (1 + Math.sqrt(5)) * fi;
    const c = [Math.sin(phi) * Math.cos(th) * R, Math.sin(phi) * Math.sin(th) * R, Math.cos(phi) * R];
    const spread = Math.min(240, 40 + g.words.length * 2.2);
    const members = [];
    g.words.forEach(w => {
      const idx = core.length;
      const root = g.kind === "root"
        ? { root: g.label, meaning: g.meaning, kind: "root" }
        : { root: g.label, meaning: g.meaning, kind: "affix", type: g.type };
      core.push({ word: w, root, theme: null, color: g.color,
        x: c[0] + (Math.random() - .5) * spread, y: c[1] + (Math.random() - .5) * spread, z: c[2] + (Math.random() - .5) * spread, fi });
      members.push(idx); placed.add(w.w);
    });
    families.push({ root: g.label, meaning: g.meaning, kind: g.kind, center: c, color: g.color, members });
  });
  // 3) 未匹配词缀 → 暗淡孤星（仍可见、可点）
  lib.words.forEach(w => {
    if (placed.has(w.w)) return;
    placed.add(w.w);
    const rr = 200 + Math.random() * 1100, u = -Math.random(), t = Math.random() * Math.PI * 2, f = Math.sqrt(1 - u * u);
    core.push({ word: w, root: null, theme: null, color: null,
      x: rr * f * Math.cos(t), y: rr * f * Math.sin(t), z: rr * u, fi: -1 });
  });

  coreCount = core.length;
  total = coreCount;

  // 星点几何
  const pos = new Float32Array(total * 3), colA = new Float32Array(total * 3), sizA = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const s = core[i];
    pos.set([s.x, s.y, s.z], i * 3);
    const st = statusOf(s.word.w), c = STATUS_COLOR[st];
    colA.set([c.r, c.g, c.b], i * 3);
    sizA[i] = starSize(st);
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colA, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizA, 1));
  col = geo.attributes.color; siz = geo.attributes.size;

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=size*(340.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC;
      void main(){ float d=distance(gl_PointCoord,vec2(0.5)); if(d>0.5) discard;
      gl_FragColor=vec4(vC, smoothstep(0.5,0.05,d)); }`
  });
  points = new THREE.Points(geo, mat);
  scene.add(points);

  // 星座连线（词根家族 + 词缀组；过小/过大只聚类不连线）
  families.forEach((f, fi) => {
    if (f.members.length < 2 || f.members.length > 40) { lines.push(null); return; }
    const p = [];
    f.members.forEach(mi => p.push(core[mi].x, core[mi].y, core[mi].z));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(p), 3));
    const lm = new THREE.LineBasicMaterial({ color: f.color, transparent: true, opacity: 0.12 });
    const line = new THREE.LineLoop(lg, lm);
    scene.add(line); lines.push(line);
  });

  updateHud(); updateLibUI(); recolor(); refreshLines();
  searchList = core.map((s, i) => ({ w: s.word.w.toLowerCase(), i }));
}

// ---------- 图例（按记忆掌握度筛选，构建一次，含实时计数）----------
const legend = document.getElementById("legend");
const allRow = document.createElement("div");
allRow.className = "row on"; allRow.dataset.status = "";
allRow.innerHTML = `<span class="dot" style="background:linear-gradient(135deg,#6f8bd6,#19c3c3,#ffd24a)"></span>全部 <span class="cnt">0</span>`;
allRow.onclick = () => toggleStatusFilter(null);
legend.appendChild(allRow);
allCntEl = allRow.querySelector(".cnt");
Object.entries(STATUS).forEach(([key, t]) => {
  const c = new THREE.Color(t.color);
  const row = document.createElement("div");
  row.className = "row"; row.dataset.status = key;
  row.innerHTML = `<span class="dot" style="background:#${c.getHexString()}"></span>${t.name}<span class="cnt" id="cnt_${key}">0</span>`;
  row.onclick = () => toggleStatusFilter(key);
  legend.appendChild(row);
});

// ---------- 词库切换器 ----------
const libBar = document.getElementById("libBar");
Object.keys(LIBRARIES).forEach(id => {
  const b = document.createElement("button");
  b.className = "libBtn"; b.dataset.lib = id;
  b.style.setProperty("--ac", LIBRARIES[id].accent);
  b.title = "共 " + LIBRARIES[id].total + " 词";
  b.innerHTML = `<span class="dot"></span>${LIBRARIES[id].name}`;
  b.onclick = () => { if (quizMode) exitQuiz(); if (id !== cur) { buildLibrary(id); resetView(); } };
  libBar.appendChild(b);
});
function updateLibUI() {
  document.querySelectorAll(".libBtn").forEach(b => b.classList.toggle("on", b.dataset.lib === cur));
  $("libName").textContent = LIBRARIES[cur].name;
}

// ---------- 交互：点击拾取 ----------
const ray = new THREE.Raycaster();
ray.params.Points.threshold = 14;
const mouse = new THREE.Vector2();
let downXY = null;

renderer.domElement.addEventListener("pointerdown", e => downXY = [e.clientX, e.clientY]);
renderer.domElement.addEventListener("pointerup", e => {
  if (quizMode) return;
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const ch = celGroup ? ray.intersectObjects(celHits) : [];
  if (ch.length) { poemToast(ch[0].object.userData.kind); return; }
  const hits = ray.intersectObject(points).filter(h => h.index < coreCount);
  if (hits.length) selectStar(hits[0].index);
});

function selectStar(i) {
  picked = i; refreshLines(); showCard(core[i]); controls.autoRotate = false;
}

// ---------- 单词卡 ----------
const card = document.getElementById("card"), $ = id => document.getElementById(id);
function showCard(s) {
  const w = s.word;
  $("cFam").textContent = s.root
    ? (s.root.kind === "affix" ? (s.root.type === "pre" ? "前缀 " : "后缀 ") : "词根 ") + s.root.root + " · " + s.root.meaning
    : "散词 · 按大纲记忆";
  $("cWord").textContent = w.w;
  $("cPh").textContent = w.ph || "";
  $("cDef").textContent = w.def;
  $("cParse").textContent = "构词：" + (w.parse || "");
  $("cEg").textContent = "例：" + (w.eg || "");
  const btn = $("cBtn"), on = lit.has(w.w);
  btn.className = "btn" + (on ? " lit" : "");
  btn.textContent = on ? "★ 已点亮，点击取消" : "✓ 我背会了，点亮这颗星";
  $("cPh").style.display = w.ph ? "block" : "none";
  $("cParse").style.display = w.parse ? "block" : "none";
  $("cEg").style.display = w.eg ? "block" : "none";
  card.style.display = "block";
}
$("cardClose").onclick = () => { card.style.display = "none"; picked = -1; refreshLines(); controls.autoRotate = true; };
$("cSpk").onclick = () => speak(core[picked].word.w);
$("cBtn").onclick = () => toggleLit(picked);
// ---------- 单词搜索（输入即飞向对应星）----------
const searchEl = $("search"), searchInput = $("searchInput"), searchHint = $("searchHint");
function renderSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) { searchHint.style.display = "none"; return; }
  const r = searchList.filter(x => x.w.includes(q)).sort((a, b) => (a.w.startsWith(q) ? 0 : 1) - (b.w.startsWith(q) ? 0 : 1)).slice(0, 8);
  searchHint.innerHTML = r.map(x => `<div class="si" data-i="${x.i}">${core[x.i].word.w}</div>`).join("");
  searchHint.style.display = r.length ? "block" : "none";
}
searchInput.addEventListener("input", e => renderSearch(e.target.value));
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") { const f = searchHint.querySelector(".si"); if (f) { const i = +f.dataset.i; selectStar(i); flyToStar(i); searchInput.value = ""; searchHint.style.display = "none"; } } });
searchHint.addEventListener("click", e => { const d = e.target.closest(".si"); if (d) { const i = +d.dataset.i; selectStar(i); flyToStar(i); searchInput.value = ""; searchHint.style.display = "none"; searchInput.blur(); } });
document.addEventListener("pointerdown", e => { if (!searchEl.contains(e.target)) searchHint.style.display = "none"; });

// ---------- 发音（女生柔美 + 移动端）----------
let VOICES = [];
function loadVoices() { if (window.speechSynthesis) VOICES = speechSynthesis.getVoices() || []; }
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice() {
  if (!VOICES.length) return null;
  const en = VOICES.filter(v => /^en(-|_)?US/i.test(v.lang));
  const pool = en.length ? en : VOICES.filter(v => /^en/i.test(v.lang));
  return pool.find(v => /female|samantha|victoria|zira|google us english|karen|tessa|monica/i.test(v.name)) || pool[0] || VOICES[0];
}
function speak(t) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = "en-US"; u.rate = 0.8; u.pitch = 1.3;   // 柔美女生：稍慢 + 高音
  const v = pickVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
// iOS / 移动端：首次用户手势解锁语音合成（否则首次点击无声）
if (window.speechSynthesis) {
  const unlock = () => { const u = new SpeechSynthesisUtterance(""); speechSynthesis.speak(u); document.removeEventListener("pointerdown", unlock); };
  document.addEventListener("pointerdown", unlock);
}

// ---------- 背景纯音乐（默认曲 assets/starry.mp3 + 本地音轨覆盖 + 生成式回退）----------
let actx = null, musicNodes = null, musicEl = null, bgmEl = null, musicSrc = "default";
const DEFAULT_BGM = "assets/starry.mp3";           // 《星空》作者：酱油瓶（用户提供音频文件）
let musicOn = localStorage.getItem("wordverse_music") === "1";
function genMusic() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  const master = actx.createGain(); master.gain.value = 0; master.connect(actx.destination);
  const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 0.6; lp.connect(master);
  const freqs = [110, 164.81, 220, 277.18, 329.63];
  const oscs = freqs.map((f, i) => { const o = actx.createOscillator(); o.type = i % 2 ? "sine" : "triangle"; o.frequency.value = f; o.detune.value = (i - 2) * 5; const g = actx.createGain(); g.gain.value = 0.16 / (i + 1.4); o.connect(g); g.connect(lp); o.start(); return o; });
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.04; const lg = actx.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  const sh = actx.createOscillator(); sh.type = "sine"; sh.frequency.value = 880; const sg = actx.createGain(); sg.gain.value = 0; sh.connect(sg); sg.connect(master);
  const trem = actx.createOscillator(); trem.frequency.value = 0.11; const tg = actx.createGain(); tg.gain.value = 0.022; trem.connect(tg); tg.connect(sg.gain); trem.start(); sh.start();
  master.gain.linearRampToValueAtTime(0.15, actx.currentTime + 2.5);
  musicNodes = { master, oscs, lfo, sh, trem };
}
function stopGen() {
  if (!musicNodes) return;
  const m = musicNodes.master, t = actx.currentTime;
  m.gain.cancelScheduledValues(t); m.gain.setValueAtTime(m.gain.value, t); m.gain.linearRampToValueAtTime(0, t + 0.6);
  const n = musicNodes; musicNodes = null;
  setTimeout(() => { try { n.oscs.forEach(o => o.stop()); n.lfo.stop(); n.sh.stop(); n.trem.stop(); } catch (e) {} }, 800);
}
function playMusic() {
  if (musicSrc === "file" && musicEl) { if (actx && actx.state === "suspended") actx.resume(); musicEl.play().catch(() => {}); return; }
  if (!bgmEl) { bgmEl = new Audio(DEFAULT_BGM); bgmEl.loop = true; bgmEl.preload = "auto"; }
  if (actx && actx.state === "suspended") actx.resume();
  bgmEl.play().catch(() => genMusic());            // 默认曲文件缺失/被拦截 → 回退生成式氛围乐
}
function stopMusic() { if (bgmEl) bgmEl.pause(); if (musicEl) musicEl.pause(); stopGen(); }
function toggleMusic() {
  musicOn = !musicOn;
  localStorage.setItem("wordverse_music", musicOn ? "1" : "0");
  musicOn ? playMusic() : stopMusic();
  updateMusicBtn();
}

function setStarLit(i, on) {
  const w = core[i].word.w;
  const had = lit.has(w);
  if (on === had) return;                 // 状态未变则跳过（避免复习重复计数每日任务）
  on ? lit.add(w) : lit.delete(w);
  if (on) touchDaily();
  localStorage.setItem(litKey(cur), JSON.stringify([...lit]));
  recolor();
}
function recolor() {
  const cnt = { new: 0, learning: 0, mastered: 0 };
  for (let i = 0; i < coreCount; i++) {
    const s = core[i], st = statusOf(s.word.w); cnt[st]++;
    const dim = filterStatus && st !== filterStatus;
    const c = dim ? STATUS_COLOR[st].clone().multiplyScalar(0.12) : STATUS_COLOR[st];
    col.set([c.r, c.g, c.b], i * 3);
    siz.array[i] = starSize(st) * (dim ? 0.35 : 1);
  }
  Object.keys(cnt).forEach(k => { const e = document.getElementById("cnt_" + k); if (e) e.textContent = cnt[k]; });
  if (allCntEl) allCntEl.textContent = coreCount;
  col.needsUpdate = true; siz.needsUpdate = true;
}
function refreshLines() {
  lines.forEach((l, fi) => {
    if (!l) return;
    const sel = picked >= 0 && fi === core[picked].fi;
    l.material.opacity = filterStatus ? 0.03 : (sel ? 0.7 : 0.05);
  });
}
function toggleStatusFilter(key) {
  filterStatus = (filterStatus === key) ? null : key;
  const f = filterStatus || "";
  document.querySelectorAll("#legend .row").forEach(r => r.classList.toggle("on", (r.dataset.status || "") === f));
  recolor(); refreshLines();
  if (!filterStatus) flyTo([0, 0, 900]);
}
function flyTo(p, keep) { flyTarget = new THREE.Vector3(p[0], p[1], p[2]); flying = true; controls.autoRotate = false; flyKeepTarget = !!keep; if (!keep) controls.target.set(0, 0, 0); }
function flyToStar(i) { const s = core[i], p = new THREE.Vector3(s.x, s.y, s.z), d = p.clone().normalize(); controls.target.copy(p); flyTo([p.x + d.x * 200, p.y + d.y * 200, p.z + d.z * 200], true); }
function toggleLit(i) {
  const s = core[i], w = s.word.w, on = !lit.has(w);
  setStarLit(i, on);
  on ? (srReview(w, true), speak(w)) : srDelete(w);
  updateHud(); showCard(s);
}
// ---------- 记忆闭环（本地 FSRS-lite）----------
function loadSR() {
  sr = JSON.parse(localStorage.getItem(srKey(cur)) || "{}");
  delete sr.undefined;   // 清理历史 bug 写入的脏 key（曾把所有词的记录写到同一个 undefined）
  let fix = false;       // 迁移：已点亮但缺 sr 记录的词补成"学习中"，恢复星色/图例
  lit.forEach(w => { if (!sr[w]) { sr[w] = { s: 1, d: 5, reps: 1, ivl: 1, due: Date.now() + DAY }; fix = true; } });
  if (fix) saveSR();
}
function saveSR() { localStorage.setItem(srKey(cur), JSON.stringify(sr)); }
function srInit(w) { if (!sr[w]) sr[w] = { s: 0, d: 5, reps: 0, ivl: 0, due: 0 }; }   // w=字符串
function srReview(w, ok) {
  srInit(w); const r = sr[w];
  if (ok) {
    r.ivl = r.s === 0 ? 1 : Math.max(1, Math.round(r.ivl * (r.reps >= 1 ? 2.5 : 1.5) * (1 + (5 - r.d) / 10)));
    r.d = Math.max(1, r.d - 1); r.s = r.ivl >= 21 ? 2 : 1;
  } else { r.ivl = 1; r.d = Math.min(10, r.d + 1); r.s = 1; }
  r.reps++; r.due = Date.now() + r.ivl * DAY; saveSR();
}
function srDelete(w) { delete sr[w]; saveSR(); }
function dueCount() {
  let n = 0;
  core.forEach(s => { const r = sr[s.word.w]; if (!r || r.s === 0 || r.due <= Date.now()) n++; });
  return n;
}
function updateHud() {
  $("litCount").textContent = lit.size; $("libTotal").textContent = total;
  $("dueCount").textContent = dueCount(); $("streak").textContent = getStreak();
  const d = getDaily();
  $("dayLearned").textContent = d.learned; $("dayGoal").textContent = d.goal;
  $("dayFill").style.width = Math.min(100, Math.round(d.learned / d.goal * 100)) + "%";
  renderTrend(); checkAch();
}

function resetView() { card.style.display = "none"; picked = -1; refreshLines(); controls.autoRotate = true; }

// ---------- 激励体系：称号等级 + 成就徽章 + 解锁弹幕（跨词库累计，须在 buildLibrary 前声明避免 TDZ）----------
const RANKS = [["星尘", 0], ["微光", 10], ["流星", 50], ["彗星", 150], ["行星", 400], ["恒星", 800], ["超新星", 1500], ["星云", 3000], ["星系", 6000], ["造星者", 10000]];
function allLit() { return Object.keys(LIBRARIES).reduce((n, id) => n + (JSON.parse(localStorage.getItem(litKey(id)) || "[]")).length, 0); }
function rankOf(n) { let i = 0; while (i + 1 < RANKS.length && n >= RANKS[i + 1][1]) i++; return i; }
function getStats() { try { return JSON.parse(localStorage.getItem("wordverse_stats")) || {}; } catch (e) { return {}; } }
function addStat(k, v) { const s = getStats(); s[k] = (s[k] || 0) + (v || 1); localStorage.setItem("wordverse_stats", JSON.stringify(s)); }
const ACH = [
  { id: "first",   ic: "🌟", nm: "初次点亮",  ds: "点亮第 1 颗星",        ck: n => n >= 1 },
  { id: "ten",     ic: "✨", nm: "小试锋芒",  ds: "累计点亮 10 词",       ck: n => n >= 10 },
  { id: "fifty",   ic: "💫", nm: "崭露头角",  ds: "累计点亮 50 词",       ck: n => n >= 50 },
  { id: "hundred", ic: "🌠", nm: "百词斩",    ds: "累计点亮 100 词",      ck: n => n >= 100 },
  { id: "five00",  ic: "🪐", nm: "词汇行家",  ds: "累计点亮 500 词",      ck: n => n >= 500 },
  { id: "thousand",ic: "🌌", nm: "千词星海",  ds: "累计点亮 1000 词",     ck: n => n >= 1000 },
  { id: "day1",    ic: "📅", nm: "今日达标",  ds: "单日完成 20 词任务",   ck: () => getDaily().learned >= DAILY_GOAL },
  { id: "streak3", ic: "🔥", nm: "三日之约",  ds: "连续打卡 3 天",        ck: () => getStreak() >= 3 },
  { id: "streak7", ic: "🚀", nm: "七日恒星",  ds: "连续打卡 7 天",        ck: () => getStreak() >= 7 },
  { id: "streak21",ic: "👑", nm: "21 天习惯", ds: "连续打卡 21 天",       ck: () => getStreak() >= 21 },
  { id: "perfect", ic: "🎯", nm: "完美一轮",  ds: "一轮测验全部答对",     ck: () => getStats().perfect >= 1 },
  { id: "speller", ic: "⌨️", nm: "拼写高手",  ds: "拼写题累计答对 20 次", ck: () => (getStats().spellOk || 0) >= 20 },
  { id: "explorer",ic: "🧭", nm: "四海探星",  ds: "四个词库都有点亮",     ck: () => Object.keys(LIBRARIES).every(id => (JSON.parse(localStorage.getItem(litKey(id)) || "[]")).length > 0) },
  { id: "master50",ic: "🏅", nm: "记忆大师",  ds: "50 词达到已掌握",      ck: () => core.filter(s => statusOf(s.word.w) === "mastered").length >= 50 }
];
function toast(msg) {
  const t = document.createElement("div"); t.className = "t"; t.textContent = msg;
  const box = document.getElementById("toast"); box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
function checkAch() {
  const n = allLit();
  let got = []; try { got = JSON.parse(localStorage.getItem("wordverse_ach")) || []; } catch (e) {}
  ACH.forEach(a => { if (!got.includes(a.id) && a.ck(n)) { got.push(a.id); toast("🏆 成就解锁 · " + a.ic + " " + a.nm); } });
  localStorage.setItem("wordverse_ach", JSON.stringify(got));
  const ri = rankOf(n), last = +(localStorage.getItem("wordverse_rank") || 0);
  if (ri > last) toast("🎉 晋升称号 · ✦ " + RANKS[ri][0]);
  localStorage.setItem("wordverse_rank", ri);
  const next = RANKS[ri + 1];
  document.getElementById("rankName").textContent = RANKS[ri][0];
  document.getElementById("rankProg").textContent = next ? "· 距「" + next[0] + "」还差 " + (next[1] - n) + " 词" : "· 已至巅峰";
  return { n, ri, got };
}
function openAch() {
  const { n, ri, got } = checkAch();
  const next = RANKS[ri + 1], base = RANKS[ri][1];
  document.getElementById("achRank").textContent = "✦ 当前称号：" + RANKS[ri][0] + "（累计点亮 " + n + " 词）";
  document.getElementById("achRankFill").style.width = next ? Math.round((n - base) / (next[1] - base) * 100) + "%" : "100%";
  document.getElementById("achRankNext").textContent = next ? "再点亮 " + (next[1] - n) + " 词晋升「" + next[0] + "」" : "已达最高称号「造星者」";
  const grid = document.getElementById("achGrid"); grid.innerHTML = "";
  ACH.forEach(a => {
    const on = got.includes(a.id);
    const d = document.createElement("div"); d.className = "a" + (on ? " on" : "");
    d.innerHTML = `<span class="ic">${a.ic}</span><div><div class="nm">${a.nm}</div><div class="ds">${a.ds}</div></div>`;
    grid.appendChild(d);
  });
  document.getElementById("ach").style.display = "flex";
}

// ---------- 背景天体（太阳/月亮/远景恒星，可开关，不干扰单词星）----------
let celGroup=null, sunSprite=null, moonSprite=null, celHits=[];
let fxGroup=null, meteors=[], nextMeteor=0;
const POEMS={ sun:["☀ 太阳不语，却把每个单词都照亮成星。","白昼里，也有属于你的光。","背下的词，是落在心里的日头。"], moon:["🌙 月亮记得你今晚背的每一个词。","夜深了，星河替你保管进度。","安静的夜里，知识悄悄生长。"] };
function poemToast(kind){ const a=POEMS[kind]||POEMS.sun; toast(a[(Math.random()*a.length)|0]); }
function glowTex(stops){ const c=document.createElement("canvas"); c.width=c.height=128; const x=c.getContext("2d"), g=x.createRadialGradient(64,64,0,64,64,64); stops.forEach(s=>g.addColorStop(s[0],s[1])); x.fillStyle=g; x.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); }
function celSprite(tex,size,pos,kind){ const m=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}); const s=new THREE.Sprite(m); s.scale.set(size,size,1); s.position.set(pos[0],pos[1],pos[2]); s.renderOrder=-10; s.userData.kind=kind; return s; }
function createCelestial(){
  if(celGroup){ scene.remove(celGroup); celGroup.traverse(o=>o.material&&o.material.dispose()); }
  celGroup=new THREE.Group();
  sunSprite=celSprite(glowTex([[0,"rgba(255,228,150,.95)"],[.25,"rgba(255,180,80,.55)"],[.6,"rgba(255,140,60,.12)"],[1,"rgba(255,120,40,0)"]]),760,[200,160,-2500],"sun");
  moonSprite=celSprite(glowTex([[0,"rgba(225,235,255,.9)"],[.3,"rgba(180,200,240,.4)"],[.65,"rgba(150,175,225,.1)"],[1,"rgba(120,150,210,0)"]]),440,[-1700,360,-2100],"moon");
  celGroup.add(sunSprite,moonSprite);
  const N=26,p=new Float32Array(N*3);
  for(let i=0;i<N;i++){ const rr=2200+Math.random()*900,u=Math.random()*2-1,t=Math.random()*Math.PI*2,f=Math.sqrt(1-u*u); p[i*3]=rr*f*Math.cos(t); p[i*3+1]=rr*f*Math.sin(t); p[i*3+2]=rr*u; }
  const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.BufferAttribute(p,3));
  const m=new THREE.PointsMaterial({color:0xbfc8ff,size:26,sizeAttenuation:true,transparent:true,opacity:.8,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
  const stars=new THREE.Points(g,m); stars.renderOrder=-11; celGroup.add(stars);
  scene.add(celGroup);
  const hr=new Date().getHours(), day=hr>=6&&hr<18;          // 随真实时间：白天太阳亮、夜晚月亮亮
  sunSprite.material.opacity=day?1:0.4; moonSprite.material.opacity=day?0.4:1;
  celHits=[sunSprite,moonSprite];
  celGroup.visible=localStorage.getItem("wordverse_cel")!=="0";
  updateCelBtn();
}
function spawnMeteor(){
  if(!fxGroup){ fxGroup=new THREE.Group(); fxGroup.renderOrder=-9; scene.add(fxGroup); nextMeteor=performance.now()+2500; }
  const a=new THREE.Vector3((Math.random()*2-1)*1800,900+Math.random()*600,-1800-Math.random()*600);
  const d=new THREE.Vector3((Math.random()*2-1)*0.6,-1,(Math.random()*2-1)*0.2).normalize();
  const L=180+Math.random()*160, sp=900+Math.random()*500, life=1.1+Math.random()*0.6;
  const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(6),3));
  const m=new THREE.LineBasicMaterial({color:0xcfe0ff,transparent:true,opacity:0,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
  const line=new THREE.Line(g,m); line.renderOrder=-9; fxGroup.add(line); meteors.push({a,d,L,sp,age:0,life,line});
}
function updateMeteors(dt){
  if(!celGroup||!celGroup.visible) return;
  if(!fxGroup) spawnMeteor();
  if(performance.now()>nextMeteor){ spawnMeteor(); nextMeteor=performance.now()+7000+Math.random()*9000; }
  for(let i=meteors.length-1;i>=0;i--){ const mt=meteors[i]; mt.age+=dt; const k=mt.age/mt.life;
    if(k>=1){ fxGroup.remove(mt.line); mt.line.geometry.dispose(); mt.line.material.dispose(); meteors.splice(i,1); continue; }
    mt.a.addScaledVector(mt.d,mt.sp*dt);
    const p=mt.line.geometry.attributes.position, tail=mt.a.clone().addScaledVector(mt.d,-mt.L);
    p.setXYZ(0,mt.a.x,mt.a.y,mt.a.z); p.setXYZ(1,tail.x,tail.y,tail.z); p.needsUpdate=true;
    mt.line.material.opacity=Math.sin(k*Math.PI)*0.9;
  }
}
// ---------- 进场动画 + 渲染循环 ----------
createCelestial();
buildLibrary(cur);
let lastT = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (intro < 1) {
    intro = Math.min(1, intro + 0.012);
    const e = 1 - Math.pow(1 - intro, 3);
    camera.position.set(0, 0, 2600 - (2600 - 900) * e);
    camera.lookAt(0, 0, 0);
  } else if (flying) {
    camera.position.lerp(flyTarget, 0.06);
    if (camera.position.distanceTo(flyTarget) < 25) { flying = false; controls.autoRotate = flyKeepTarget ? false : (filterStatus === null); flyKeepTarget = false; }
    controls.update();
  } else controls.update();
  updateMeteors(dt);
  renderer.render(scene, camera);
}
loop();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setTimeout(() => { const l = document.getElementById("loading"); l.style.opacity = 0; setTimeout(() => l.remove(), 800); }, 600);

// ---------- 记忆测验（主动回忆：选择 / 拼写）----------
const quizEl = $("quiz"), qBody = $("qBody"), qDone = $("qDone");
let quiz = [], qi = 0, qOkN = 0, qNoN = 0, qAnswered = false, quizType = "mix", quizModeType = "learn";

// 编辑距离（用于形近干扰项）
function lev(a, b) {
  const m = a.length, n = b.length;
  let p = new Array(n + 1), c = new Array(n + 1);
  for (let j = 0; j <= n; j++) p[j] = j;
  for (let i = 1; i <= m; i++) {
    c[0] = i;
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [p, c] = [c, p];
  }
  return p[n];
}
// 形近 / 同词缀 干扰项（比纯随机更能暴露记忆盲区）
function makeDistractors(ans) {
  const a = ans.toLowerCase(), aff = affixOf({ w: ans }), pool = [];
  for (const s of core) {
    const w = s.word.w; if (w === ans) continue;
    if (Math.abs(w.length - ans.length) > 2) continue;
    const lw = w.toLowerCase();
    const sameAff = aff && JSON.stringify(affixOf({ w })) === JSON.stringify(aff);
    const near = lev(lw, a) <= 2;
    const score = (sameAff ? 2 : 0) + (near ? 1 : 0);
    if (score > 0) pool.push({ w, score });
  }
  pool.sort(() => Math.random() - 0.5);
  pool.sort((x, y) => y.score - x.score);
  const top = pool.slice(0, 40), pick = [];
  while (pick.length < 3 && top.length) { const k = (Math.random() * top.length) | 0; pick.push(top[k].w); top.splice(k, 1); }
  while (pick.length < 3) {
    const c = core[(Math.random() * core.length) | 0].word.w;
    if (c !== ans && !pick.includes(c)) pick.push(c);
  }
  return pick;
}

$("quizBtn").onclick = () => startQuiz("learn");
$("reviewBtn").onclick = () => startQuiz("review");
document.querySelectorAll(".qmode").forEach(b => b.onclick = () => { quizType = b.dataset.t; document.querySelectorAll(".qmode").forEach(x => x.classList.toggle("on", x === b)); startQuiz(quizModeType); });
$("qNext").onclick = () => { qAnswered = false; qi++; nextQuiz(); };
$("qSubmit").onclick = submitSpell;
$("qInput").addEventListener("keydown", e => { if (e.key === "Enter") submitSpell(); });
$("qExit").onclick = exitQuiz; $("qExit2").onclick = exitQuiz;
$("qAgain").onclick = () => startQuiz(quizModeType);

function startQuiz(type) {
  quizModeType = type || quizModeType || "learn";
  const isReview = quizModeType === "review";
  const pool = isReview
    ? core.filter(s => lit.has(s.word.w) || (sr[s.word.w] && sr[s.word.w].s > 0))
    : core.filter(s => { const r = sr[s.word.w]; return !r || r.s === 0 || r.due <= Date.now(); });
  if (!pool.length) { alert(isReview ? "还没有已学习的单词，先去点亮 / 学习一些星吧~" : "当前词库暂无可学习词，先去点亮一些星吧~"); return; }
  quiz = pool.sort(() => Math.random() - 0.5).slice(0, 20);
  qi = qOkN = qNoN = 0; qAnswered = false; quizMode = true; card.style.display = "none";
  qBody.style.display = "block"; qDone.style.display = "none";
  controls.autoRotate = true; quizEl.style.display = "block";   // 复习时星空继续自转
  nextQuiz();
}
function nextQuiz() {
  if (qi >= quiz.length) {
    qBody.style.display = "none"; qDone.style.display = "block";
    $("qStat").textContent = `本轮 ${quiz.length} 词 · 记住 ${qOkN} · 待巩固 ${qNoN}`;
    if (qNoN === 0 && quiz.length >= 5) { addStat("perfect"); checkAch(); }
    return;
  }
  const s = quiz[qi], w = s.word;
  $("qFam").textContent = s.root ? (s.root.kind === "affix" ? (s.root.type === "pre" ? "前缀 " : "后缀 ") : "词根 ") + s.root.root + " · " + s.root.meaning : "散词";
  $("qDef").textContent = w.def;
  $("qPh").textContent = w.ph ? "/" + w.ph + "/" : "";
  $("qPh").style.display = w.ph ? "block" : "none";
  $("qSpk").onclick = () => speak(w.w);
  ["qOpts", "qSpell", "qParse", "qEg", "qFb", "qNext"].forEach(id => $(id).style.display = "none");
  const type = quizType === "mix" ? (Math.random() < 0.5 ? "choose" : "spell") : quizType;
  $("qHint").textContent = type === "choose" ? "根据释义 / 发音，选出正确单词" : "听发音 / 看释义，拼写出单词";
  if (type === "choose") {
    const opts = [w.w, ...makeDistractors(w.w)];
    for (let i = opts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [opts[i], opts[j]] = [opts[j], opts[i]]; }
    const box = $("qOpts"); box.innerHTML = ""; box.style.display = "flex";
    opts.forEach(o => { const b = document.createElement("button"); b.className = "opt"; b.textContent = o; b.onclick = () => pickChoose(b, o === w.w, w); box.appendChild(b); });
  } else {
    const sp = $("qSpell"); sp.style.display = "flex"; sp.dataset.ans = w.w;
    const inp = $("qInput"); inp.value = ""; inp.disabled = false; setTimeout(() => inp.focus(), 50);
    $("qSubmit").style.display = "block";
  }
  $("qProg").textContent = `${qi + 1} / ${quiz.length}`;
}
function pickChoose(btn, correct, w) {
  if (qAnswered) return; qAnswered = true;
  $("qOpts").querySelectorAll(".opt").forEach(el => {
    el.onclick = null;
    if (el.textContent === w.w) el.classList.add("ok");
    else if (el === btn) el.classList.add("no");
    else el.classList.add("dim");
  });
  feedback(correct, w);
}
function submitSpell() {
  if (qAnswered) return; qAnswered = true;
  const w = quiz[qi].word, ans = $("qSpell").dataset.ans;
  const v = $("qInput").value.trim().toLowerCase();
  const correct = v === ans.toLowerCase();
  if (correct) addStat("spellOk");
  $("qInput").disabled = true; $("qSubmit").style.display = "none";
  feedback(correct, w);
}
function feedback(correct, w) {
  srReview(w.w, correct);
  const i = core.findIndex(s => s.word.w === w.w); if (i >= 0) setStarLit(i, correct);
  correct ? qOkN++ : qNoN++;
  touchStreak();
  $("qParse").textContent = w.parse ? "构词：" + w.parse : "";
  $("qParse").style.display = w.parse ? "block" : "none";
  $("qEg").textContent = w.eg ? "例：" + w.eg : "";
  $("qEg").style.display = w.eg ? "block" : "none";
  const fb = $("qFb"); fb.className = "fb " + (correct ? "ok" : "no");
  fb.textContent = correct ? "✓ 答对了，已加入间隔复习" : "✗ 正确答案：" + w.w + (w.ph ? "  /" + w.ph + "/" : "");
  fb.style.display = "block"; $("qNext").style.display = "block";
  updateHud();
}
function exitQuiz() { quizMode = false; quizEl.style.display = "none"; controls.autoRotate = true; }

// 连续打卡（全局，不分子库）
function touchStreak() {
  const today = new Date().toISOString().slice(0, 10);
  let s = null; try { s = JSON.parse(localStorage.getItem("wordverse_streak")); } catch (e) {}
  if (!s) s = { last: today, n: 1 };
  else if (s.last !== today) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    s.n = s.last === y ? s.n + 1 : 1; s.last = today;
  }
  localStorage.setItem("wordverse_streak", JSON.stringify(s));
  touchHistory();
}
function getStreak() {
  try {
    const s = JSON.parse(localStorage.getItem("wordverse_streak"));
    if (!s) return 0;
    const today = new Date().toISOString().slice(0, 10), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    return (s.last === today || s.last === y) ? s.n : 0;
  } catch (e) { return 0; }
}
// ---------- 每日任务（如每天背 20 词）----------
function getDaily() {
  const today = new Date().toISOString().slice(0, 10);
  let d = null; try { d = JSON.parse(localStorage.getItem("wordverse_daily")); } catch (e) {}
  if (!d || d.date !== today) return { date: today, learned: 0, goal: DAILY_GOAL };
  return { date: today, learned: d.learned, goal: DAILY_GOAL };
}
function touchDaily() {
  const today = new Date().toISOString().slice(0, 10);
  let d = null; try { d = JSON.parse(localStorage.getItem("wordverse_daily")); } catch (e) {}
  if (!d || d.date !== today) d = { date: today, learned: 0 };
  d.learned++; d.date = today;
  localStorage.setItem("wordverse_daily", JSON.stringify(d));
}
function touchHistory() {
  const today = new Date().toISOString().slice(0, 10);
  let h = {}; try { h = JSON.parse(localStorage.getItem("wordverse_history")) || {}; } catch (e) {}
  h[today] = (h[today] || 0) + 1;
  localStorage.setItem("wordverse_history", JSON.stringify(h));
}
function weekHistory() {
  const now = new Date(), dow = now.getDay();
  const off = dow === 0 ? 6 : dow - 1; // 距本周一的天数
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - off - i); const key = d.toISOString().slice(0, 10); days.push({ key, wd: d.getDay(), n: 0 }); }
  let h = {}; try { h = JSON.parse(localStorage.getItem("wordverse_history")) || {}; } catch (e) {}
  days.forEach(d => d.n = h[d.key] || 0);
  return days;
}
function renderTrend() {
  const el = $("trend"); if (!el) return;
  const w = weekHistory(), max = Math.max(1, ...w.map(d => d.n)), wd = ["日", "一", "二", "三", "四", "五", "六"];
  el.innerHTML = "";
  w.forEach(d => {
    const col = document.createElement("div"); col.className = "tbar";
    const bar = document.createElement("div"); bar.className = "tfill";
    bar.style.height = (d.n ? Math.max(4, Math.round(d.n / max * 26)) : 0) + "px";
    const lab = document.createElement("div"); lab.className = "tl"; lab.textContent = wd[d.wd];
    col.appendChild(bar); col.appendChild(lab); el.appendChild(col);
  });
}

// ---------- 分享卡（截图星空 + 合成进度海报）----------
const shareEl = $("share");
$("shareBtn").onclick = shareShot;
$("shareClose").onclick = () => shareEl.style.display = "none";
$("shareDl").onclick = () => { const a = document.createElement("a"); a.href = $("shareImg").src; a.download = "星云星图.png"; a.click(); };
function shareShot() {
  try {
    renderer.render(scene, camera);
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1080;
    const ctx = cv.getContext("2d");
    const txt = (t, x, y, font, color, align) => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.fillText(t, x, y); };
    ctx.fillStyle = "#05060f"; ctx.fillRect(0, 0, 1080, 1080);
    // 从宽屏 WebGL 画布中心裁一个正方形再铺满，避免拉伸变形（Web 展示错位的根因）
    const gl = renderer.domElement, side = Math.min(gl.width, gl.height);
    const sx = (gl.width - side) / 2, sy = (gl.height - side) / 2;
    ctx.drawImage(gl, sx, sy, side, side, 0, 0, 1080, 1080);
    let g = ctx.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, "rgba(5,6,15,.85)"); g.addColorStop(1, "rgba(5,6,15,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 320);
    txt("星云词汇", 60, 95, "bold 46px sans-serif", "#e8ecff");
    txt(LIBRARIES[cur].name + " · ✦ " + RANKS[rankOf(allLit())][0] + " · v" + APP_VERSION, 60, 135, "24px sans-serif", "#8b93c0");
    const pct = total ? Math.round(lit.size / total * 100) : 0;
    txt(lit.size + " / " + total, 60, 255, "bold 82px sans-serif", "#ffd24a");
    txt("已点亮单词 · " + pct + "%", 60, 300, "26px sans-serif", "#8b93c0");
    let g2 = ctx.createLinearGradient(0, 740, 0, 1080); g2.addColorStop(0, "rgba(5,6,15,0)"); g2.addColorStop(1, "rgba(5,6,15,.93)");
    ctx.fillStyle = g2; ctx.fillRect(0, 740, 1080, 340);
    txt("🔥 连续打卡 " + getStreak() + " 天", 60, 880, "bold 36px sans-serif", "#ffd24a");
    txt("今日待复习 " + dueCount() + " · 已点亮 " + pct + "%", 60, 918, "22px sans-serif", "#9aa2cf");
    const wh = weekHistory(), mx = Math.max(1, ...wh.map(d => d.n)), wd = ["日", "一", "二", "三", "四", "五", "六"];
    const bx = 580, bw = 52, gap = 12, baseY = 928;
    txt("本周复习趋势", bx, baseY - 132, "20px sans-serif", "#8b93c0");
    wh.forEach((d, i) => {
      const x = bx + i * (bw + gap), h = d.n ? Math.max(6, Math.round(d.n / mx * 118)) : 0;
      const grd = ctx.createLinearGradient(0, baseY - h, 0, baseY); grd.addColorStop(0, "#ffd24a"); grd.addColorStop(1, "#7f77dd");
      ctx.fillStyle = grd; ctx.fillRect(x, baseY - h, bw, h);
      txt(wd[d.wd], x + bw / 2, baseY + 20, "15px sans-serif", "#6f77a6", "center");
    });
    txt("把单词背成一片星空 ✦ 星云词汇 · vinjour.top", 540, 1012, "24px sans-serif", "#9aa2cf", "center");
    $("shareImg").src = cv.toDataURL("image/png");
    shareEl.style.display = "block";
  } catch (e) { loadError("生成星图失败：" + (e && e.message)); }
}

// ---------- 使用教学（随时调出）----------
// 如需接入真实录屏：把 mp4 放到本目录 assets/tutorial.mp4，并把下面改成 "assets/tutorial.mp4"
const TUTORIAL_VIDEO = "";
const TUT = [
  { t: "切换词库", d: "顶部中间的胶囊按钮可在 <b>考研 / 四级 / 六级 / 高考</b> 之间切换，每个词库的学习进度各自独立保存。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><rect x="16" y="64" width="288" height="40" rx="20" fill="rgba(127,119,221,.18)" stroke="rgba(127,119,221,.4)"/><circle cx="46" cy="84" r="6" fill="#ffd24a"/><text x="60" y="89" fill="#fff" font-size="13">考研</text><circle cx="116" cy="84" r="6" fill="#6f8bd6"/><text x="130" y="89" fill="#c8cdf0" font-size="13">四级</text><circle cx="186" cy="84" r="6" fill="#19c3c3"/><text x="200" y="89" fill="#c8cdf0" font-size="13">六级</text><circle cx="252" cy="84" r="6" fill="#6ee7a8"/><text x="266" y="89" fill="#c8cdf0" font-size="13">高考</text><text x="160" y="128" fill="#8b93c0" font-size="11" text-anchor="middle">点击切换 · 各库进度独立</text></svg>` },
  { t: "旋转与缩放", d: "在星空空白处 <b>拖动</b> 可旋转视角，<b>滚轮</b>（手机双指）缩放远近，松手后星空会缓慢自转。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="84" r="48" fill="rgba(127,119,221,.12)" stroke="#7f77dd" stroke-width="2"/><ellipse cx="120" cy="84" rx="48" ry="15" fill="none" stroke="rgba(127,119,221,.5)"/><ellipse cx="120" cy="84" rx="15" ry="48" fill="none" stroke="rgba(127,119,221,.35)"/><circle cx="120" cy="84" r="4" fill="#ffd24a"/><path d="M172 48 A28 28 0 0 1 210 86" fill="none" stroke="#ffd24a" stroke-width="3" stroke-linecap="round"/><polygon points="210,86 208,74 198,80" fill="#ffd24a"/><circle cx="244" cy="104" r="20" fill="none" stroke="#19c3c3" stroke-width="3"/><line x1="259" y1="119" x2="276" y2="136" stroke="#19c3c3" stroke-width="4" stroke-linecap="round"/></svg>` },
  { t: "点星星看单词", d: "<b>点击任意一颗星</b> 弹出单词卡：释义、音标、构词拆解与例句；点 🔊 可听真人发音。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><polygon points="120,40 128,64 154,64 132,80 140,104 120,88 100,104 108,80 86,64 112,64" fill="#ffd24a"/><rect x="168" y="36" width="124" height="96" rx="10" fill="rgba(16,18,38,.92)" stroke="#7f77dd" stroke-width="1.5"/><text x="182" y="62" fill="#fff" font-size="15">abandon</text><text x="182" y="84" fill="#9aa2cf" font-size="11">v. 放弃；抛弃</text><text x="182" y="106" fill="#ffd24a" font-size="11">🔊 听发音</text><text x="182" y="124" fill="#6ee7a8" font-size="10">★ 我背会了</text></svg>` },
  { t: "点亮已掌握的星", d: "在单词卡点 <b>「我背会了」</b>，星星转为金色并记入间隔复习；再次点击可取消。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><polygon points="78,54 84,72 104,72 88,84 94,104 78,92 62,104 68,84 52,72 72,72" fill="rgba(127,119,221,.22)" stroke="rgba(127,119,221,.5)"/><polygon points="196,48 204,72 228,72 206,88 214,114 196,100 178,114 186,88 164,72 188,72" fill="#ffd24a"/><path d="M186 98 l8 8 l16 -18" fill="none" stroke="#05060f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="160" y="150" fill="#8b93c0" font-size="11" text-anchor="middle">点击「我背会了」→ 转金入复习</text></svg>` },
  { t: "主动学习 / 复习", d: "点右上角 <b>🎯 主动学习</b>：根据释义 / 发音 <b>4 选 1</b>，或切到 <b>拼写</b> 模式手输单词，干扰项多为形近 / 同词缀词；已学过的词点 <b>🔁 复习</b> 再巩固一遍。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><rect x="36" y="20" width="248" height="128" rx="12" fill="rgba(16,18,38,.92)" stroke="rgba(255,210,74,.4)"/><text x="52" y="44" fill="#ffd24a" font-size="11">根据释义选出正确单词</text><text x="52" y="64" fill="#e8ecff" font-size="14">「adj. 重要的」</text><rect x="52" y="76" width="216" height="15" rx="6" fill="rgba(127,119,221,.2)"/><rect x="52" y="98" width="216" height="15" rx="6" fill="rgba(80,200,140,.4)"/><rect x="52" y="120" width="150" height="15" rx="6" fill="rgba(127,119,221,.2)"/></svg>` },
  { t: "按掌握度筛选", d: "默认显示<b>全部</b>星星，未学=蓝(小)、学习中=青、已掌握=金(大)，一眼区分；左下角图例点 <b>未学 / 学习中 / 已掌握</b> 可只显示某一类，点「全部」恢复。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><rect x="36" y="28" width="170" height="22" rx="8" fill="rgba(127,119,221,.1)"/><circle cx="54" cy="39" r="5" fill="#6f8bd6"/><text x="68" y="43" fill="#c8cdf0" font-size="12">未学</text><rect x="36" y="62" width="170" height="22" rx="8" fill="rgba(127,119,221,.1)"/><circle cx="54" cy="73" r="5" fill="#19c3c3"/><text x="68" y="77" fill="#c8cdf0" font-size="12">学习中</text><rect x="36" y="96" width="170" height="22" rx="8" fill="rgba(127,119,221,.1)"/><circle cx="54" cy="107" r="5" fill="#ffd24a"/><text x="68" y="111" fill="#c8cdf0" font-size="12">已掌握</text><text x="232" y="64" fill="#8b93c0" font-size="11">点击</text><text x="232" y="84" fill="#8b93c0" font-size="11">筛选</text></svg>` },
  { t: "打卡与趋势", d: "每完成一次复习即 <b>打卡</b>，右上角显示 🔥 连续天数；下方柱状图是本周每日复习量。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><text x="44" y="70" font-size="32">🔥</text><text x="82" y="66" fill="#ffd24a" font-size="20" font-weight="bold">连续 12 天</text><g fill="#7f77dd"><rect x="60" y="112" width="18" height="22" rx="4"/><rect x="88" y="98" width="18" height="36" rx="4"/><rect x="116" y="106" width="18" height="28" rx="4"/><rect x="144" y="86" width="18" height="48" rx="4"/><rect x="172" y="102" width="18" height="32" rx="4"/></g><text x="60" y="148" fill="#8b93c0" font-size="10">本周复习趋势</text></svg>` },
  { t: "生成我的星图", d: "点 <b>📷 我的星图</b> 把当前进度合成海报，可下载分享，连续打卡与本周趋势也会印在图上。",
    svg: `<svg viewBox="0 0 320 168" xmlns="http://www.w3.org/2000/svg"><rect x="44" y="26" width="150" height="112" rx="10" fill="#05060f" stroke="#7f77dd" stroke-width="1.5"/><circle cx="74" cy="60" r="3" fill="#ffd24a"/><circle cx="116" cy="50" r="3" fill="#6f8bd6"/><circle cx="150" cy="92" r="3" fill="#19c3c3"/><circle cx="96" cy="104" r="3" fill="#6ee7a8"/><circle cx="168" cy="72" r="3" fill="#ffd24a"/><path d="M236 64 l0 44 l-13 -15 m13 15 l13 -15" fill="none" stroke="#ffd24a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="222" y="138" fill="#8b93c0" font-size="11">下载 / 分享</text></svg>` }
];
let ti = 0;
const tutEl = $("tut"), tutDots = $("tutDots");
TUT.forEach((_, i) => { const d = document.createElement("span"); d.className = "dot" + (i === 0 ? " on" : ""); tutDots.appendChild(d); });
function renderTut() {
  const s = TUT[ti];
  $("tutIllo").innerHTML = s.svg;
  $("tutTitle").textContent = s.t;
  $("tutDesc").innerHTML = s.d;
  tutDots.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("on", i === ti));
  $("tutPrev").disabled = ti === 0;
  $("tutNext").textContent = ti === TUT.length - 1 ? "完成 ✓" : "下一步 →";
}
function openTut() {
  ti = 0;
  const v = $("tutVideo");
  if (TUTORIAL_VIDEO) { v.src = TUTORIAL_VIDEO; v.style.display = "block"; } else v.style.display = "none";
  renderTut(); tutEl.style.display = "flex";
}
function closeTut() { tutEl.style.display = "none"; const v = $("tutVideo"); if (v) v.pause(); }
$("achBtn").onclick = openAch; $("rankLine").onclick = openAch;
$("achClose").onclick = () => $("ach").style.display = "none";
$("ach").addEventListener("click", e => { if (e.target === $("ach")) $("ach").style.display = "none"; });
function updateCelBtn(){ const b=$("celBtn"); if(!b) return; const on=!celGroup||celGroup.visible; b.textContent=on?"🌟 天体":"🌑 天体"; b.style.opacity=on?"1":".5"; }
$("celBtn").onclick = () => { if(!celGroup) return; celGroup.visible=!celGroup.visible; localStorage.setItem("wordverse_cel",celGroup.visible?"1":"0"); updateCelBtn(); };
function updateMusicBtn() { const b = $("musicBtn"); if (!b) return; b.textContent = musicOn ? "🎵 音乐" : "🔇 音乐"; b.style.opacity = musicOn ? "1" : ".5"; }
$("musicBtn").onclick = toggleMusic;
$("musicUpBtn").onclick = () => $("musicFile").click();
$("musicFile").onchange = e => { const f = e.target.files[0]; if (!f) return; if (!musicEl) { musicEl = new Audio(); musicEl.loop = true; } musicEl.src = URL.createObjectURL(f); musicSrc = "file"; stopGen(); musicOn = true; localStorage.setItem("wordverse_music", "1"); playMusic(); updateMusicBtn(); };
updateMusicBtn();
$("helpBtn").onclick = openTut;
$("tutClose").onclick = closeTut;
$("tutPrev").onclick = () => { if (ti > 0) { ti--; renderTut(); } };
$("tutNext").onclick = () => { if (ti < TUT.length - 1) { ti++; renderTut(); } else closeTut(); };
tutEl.addEventListener("click", e => { if (e.target === tutEl) closeTut(); });

console.log("星云词汇 v" + APP_VERSION + " · 词库 " + cur + " · 核心词 " + coreCount + " / 总星 " + total);
