"use strict";
const $ = (s) => document.querySelector(s);
// Arayüz dili: tr | th. Dinamik metin tt("Türkçe", "ไทย") ile yazılır; durağan HTML data-th / data-th-title / data-th-ph taşır.
let LANG = localStorage.getItem("lang") === "th" ? "th" : "tr";
const tt = (tr, th) => LANG === "th" ? th : tr;
const LOC = () => LANG === "th" ? "th-TH" : "tr-TR";
// {anahtar: [tr, th]} sözlüğü; okununca seçili dildeki metni verir
const bi = (o) => new Proxy(o, { get: (t, k) => Array.isArray(t[k]) ? tt(t[k][0], t[k][1]) : t[k] });
const TYPE_TR = bi({ retail: ["Dükkan", "ร้านค้า"], shophouse: ["Shophouse", "อาคารพาณิชย์"], office: ["Ofis", "สำนักงาน"],
  warehouse: ["Depo", "โกดัง"], other: ["Diğer", "อื่นๆ"] });
const SRC_TR = bi({ fazwaz: "FazWaz", propertyscout: "PropertyScout", ddproperty: "DDproperty", propertyhub: "PropertyHub",
  hipflat: "Hipflat", livinginsider: "Livinginsider", lazudi: "Lazudi", thaihometown: "Thaihometown",
  baania: "Baania", zmyhome: "Zmyhome", bkkcitismart: "BKK Citismart", cbre: "CBRE", terrabkk: "TerraBKK",
  ennxo: "ENNXO", officebangkok: "Office Bangkok", eposta: ["Portal (e-posta uyarısı)", "พอร์ทัล (อีเมลแจ้งเตือน)"] });
const CONF_TR = bi({ yuksek: ["yüksek", "สูง"], orta: ["orta", "ปานกลาง"], dusuk: ["düşük", "ต่ำ"] });

const BKK_BOUNDS = [[13.660, 100.528], [13.765, 100.650]];
const map = L.map("map", { zoomControl: false }).setView([13.714, 100.595], 13);
// Varsayılan altlık etiketsiz: cadde/istasyon/bölge adlarını uygulama İngilizce yazar (OSM altlığı Tayca etiketliydi).
const BASE = [
  [["Sade harita (İngilizce adlar)", "แผนที่เรียบ (ชื่อภาษาอังกฤษ)"], L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, maxNativeZoom: 16, attribution: "© Esri, HERE, Garmin, © OpenStreetMap contributors" })],
  [["Ayrıntılı harita (Tayca)", "แผนที่ละเอียด (ภาษาไทย)"], L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap contributors" })],
  [["Uydu", "ดาวเทียม"], L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "© Esri, Maxar" })],
];
BASE[0][1].addTo(map);
const stationLayer = L.layerGroup().addTo(map), stationLabels = L.layerGroup(), minorLabels = L.layerGroup();
const pinLayer = L.layerGroup().addTo(map);
// sağ üst: dil seçici, altında altlık seçici (dil değişince altlık adları için yeniden kurulur)
const LangCtl = L.Control.extend({ options: { position: "topright" }, onAdd() {
  const d = L.DomUtil.create("div", "leaflet-bar langctl");
  d.innerHTML = `<select id="lang" title="Dil / ภาษา"><option value="tr">Türkçe</option><option value="th">ไทย</option></select>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  return d;
} });
new LangCtl().addTo(map);
let mobView = "split";
function setMobView(v) {
  mobView = v;
  document.body.classList.remove("map-big", "mob-map", "mob-list");
  if (v === "map") document.body.classList.add("mob-map", "map-big");
  else if (v === "list") document.body.classList.add("mob-list");
  for (const b of document.querySelectorAll("#mobmodes button[data-mview]")) {
    b.classList.toggle("on", b.dataset.mview === v);
  }
  setTimeout(() => map.invalidateSize(), 190);
}
function toggleMobFilt(force) {
  const side = $("#side");
  if (!side) return;
  const open = typeof force === "boolean" ? force : !side.classList.contains("mob-filt-open");
  side.classList.toggle("mob-filt-open", open);
  $("#mobfiltbtn")?.classList.toggle("on", open);
  if (open && mobView === "map") setMobView("split");
  if (open) side.scrollTo({ top: 0, behavior: "smooth" });
}
// haritanın altı: + / − yakınlaştırma, hızlı alan çizimi, alan temizleme ve mobilde harita büyüt/küçült
const MapBarCtl = L.Control.extend({ options: { position: "bottomright" }, onAdd() {
  const d = L.DomUtil.create("div", "leaflet-bar mapbar");
  d.innerHTML = `<button type="button" id="zout" title="Uzaklaştır" data-th-title="ซูมออก" aria-label="Zoom out">−</button>`
    + `<button type="button" id="zin" title="Yakınlaştır" data-th-title="ซูมเข้า" aria-label="Zoom in">+</button>`
    + `<button type="button" id="mapdraw" class="drawbtn">✏ Çiz</button>`
    + `<button type="button" id="mapclear" class="clrbtn" hidden title="Çizili alanı temizle" data-th-title="ล้างพื้นที่ที่วาด" data-th="✕ ล้าง">✕ Sil</button>`
    + `<button type="button" id="mapsize" class="mobonly" title="Haritayı büyüt / küçült" data-th-title="ขยาย / ย่อแผนที่">⤢</button>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  d.querySelector("#zin").onclick = () => map.zoomIn();
  d.querySelector("#zout").onclick = () => map.zoomOut();
  d.querySelector("#mapdraw").onclick = () => setDrawing(!drawing);
  d.querySelector("#mapclear").onclick = () => $("#clear")?.click();
  d.querySelector("#mapsize").onclick = () => {
    setMobView(mobView === "map" ? "split" : "map");
  };
  return d;
} });
new MapBarCtl().addTo(map);
let baseCtl = null;
function baseControl() {
  if (baseCtl) baseCtl.remove();
  baseCtl = L.control.layers(Object.fromEntries(BASE.map(([n, l]) => [tt(n[0], n[1]), l]))).addTo(map);  // bindirme katmanları sol paneldeki "Katmanlar" kutusunda
}
baseControl();
L.control.scale({ imperial: false }).addTo(map);

let ALL = [], STATIONS = [], zone = null, selId = null, MODEL = null;
let CONDO = null;  // condo modu: null kapalı; dizi: ölçülen binalar (kira puanına göre)
let SAVED = [];    // kaydedilen condo linkleri ve kendi aralarında puanlanan aday listesi
let MALLS = null, mallsKey = "", selMallId = null, mallScope = "all", mallHovTimer = null, lastHovMallId = null;
const MALL_UNITS = new Map();
const mallFootprintLayer = L.layerGroup().addTo(map);
let viewTab = "circle", loadedKey = "", circleOnlyDeal = false;
const condoQuery = () => ($("#condoq")?.value || "").trim();
const needsData = () => viewTab === "deals" || viewTab === "saved" || viewTab === "malls" || !!zone || !!condoQuery();
const markers = new Map();

// ------------------------------------------------------------------ yardımcılar
const fmt = (n) => n == null ? "—" : Math.round(n).toLocaleString(LOC());
const kfmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function hav(a, b, c, d) {
  const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
}
const lineTxt = (l) => l && l !== "Raylı" ? l + " " : "";
const scoreColor = (s) => s >= 75 ? "#1a9c3e" : s >= 60 ? "#6aa51d" : s >= 45 ? "#c99200" : "#9aa3ad";
const ago = (t) => { const d = (Date.now() / 1000 - t) / 3600; return d < 1 ? tt("az önce", "เมื่อสักครู่") : d < 48 ? Math.round(d) + tt(" saat önce", " ชั่วโมงที่แล้ว") : Math.round(d / 24) + tt(" gün önce", " วันที่แล้ว"); };

// Fotoğraf sırası: etiketli dış, etiketli iç, sonra kalanlar (en çok 6). "Dış"/"İç" yalnız kaynak
// etiketlediyse yazılır; etiketsiz fotoğrafa iç/dış diye tahmin yazılmaz.
function gallery(r) {
  const im = r.images || [], out = [];
  const dis = im.find((i) => i.kind === "dis"), ic = im.find((i) => i.kind === "ic");
  if (dis) out.push({ url: dis.url, cap: tt("Dış", "ภายนอก") });
  if (ic) out.push({ url: ic.url, cap: tt("İç", "ภายใน") });
  for (const i of im) { if (out.length >= 6) break; if (!out.some((o) => o.url === i.url)) out.push({ url: i.url, cap: "" }); }
  return out.map((o, k) => ({ ...o, cap: o.cap || `${tt("Foto", "รูป")} ${k + 1}/${out.length}` }));
}
function galleryHtml(r, start = 0) {
  const g = gallery(r);
  if (!g.length) return "";
  const n = g.length, prev = start - 2 < 0 ? (n - 1) - ((n - 1) % 2) : start - 2, next = start + 2 >= n ? 0 : start + 2;
  const nav = n > 2 ? `<button class="gnav prev" data-id="${esc(r.id)}" data-i="${prev}">‹</button>`
    + `<button class="gnav next" data-id="${esc(r.id)}" data-i="${next}">›</button>` : "";
  return `<div class="imgs">${g.slice(start, start + 2).map((i) => `<figure><a href="${esc(r.url)}" target="_blank" rel="noopener"><img src="${esc(i.url)}" alt=""></a><figcaption>${i.cap}</figcaption></figure>`).join("")}${nav}</div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".gnav");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const box = b.closest(".imgs");
  if (!box) return;
  if (b.dataset.cslug && CONDO) {
    const c = CONDO.find((x) => x.slug === b.dataset.cslug);
    if (c) box.outerHTML = condoGalleryHtml(c, +b.dataset.i);
    return;
  }
  const r = ALL.find((x) => x.id === b.dataset.id) || MALL_UNITS.get(b.dataset.id);
  if (r) box.outerHTML = galleryHtml(r, +b.dataset.i);
});
// kartta yalnız kararı değiştiren uyarılar; konum yaklaşıklığı açılır pencerede
const FLAG_TR = bi({ supheli: ["Şüpheli ucuz", "ถูกผิดปกติ"], veri_supheli: ["Veri şüpheli", "ข้อมูลน่าสงสัย"], devir: ["Devir/hava parası", "เซ้ง/ค่าแป๊ะเจี๊ยะ"] });

// ------------------------------------------------------------------ veri
const STATIC_MODE = window.DUKKAN_STATIC === true || /\.github\.io$|\.pages\.dev$/i.test(location.hostname);
const PERMANENT_CLOUD_URL = "https://yasaraydemir.github.io/tayland-harita/";
const _STATIC_LISTINGS_CACHE = new Map();
const _STATIC_SAVED_BASE = new Map();

function _staticSavedKey(city) {
  return `dukkan_static_saved_v1_${city || "bangkok"}`;
}
function _loadStaticSavedOverrides(city) {
  try {
    return JSON.parse(localStorage.getItem(_staticSavedKey(city)) || "{}");
  } catch (_) {
    return {};
  }
}
function _saveStaticSavedOverrides(city, ov) {
  try {
    localStorage.setItem(_staticSavedKey(city), JSON.stringify(ov));
  } catch (_) {}
}
function _scoreStaticSavedList(items) {
  const list = items.map((it) => {
    const c = { ...it };
    const b = (CONDO || []).find((x) => x.slug === c.building_slug || (c.building_name && normCondoStr(x.name) === normCondoStr(c.building_name)));
    if (b) {
      c.building_slug = c.building_slug || b.slug;
      c.building_name = c.building_name || b.name;
      c.lat = c.lat ?? b.lat;
      c.lng = c.lng ?? b.lng;
      c.district = c.district || b.district;
      c.transit = c.transit || b.transit;
      c.transit_km = c.transit_km ?? b.transit_km;
      c.year = c.year || b.year;
      const uMatch = (b.rents || []).find((u) => (c.unit_id && String(u.id) === String(c.unit_id)) || (c.url && u.url === c.url));
      if (uMatch) {
        c.pts = c.pts || uMatch.pts;
        c.total = c.total ?? uMatch.total;
        c.coverage = c.coverage ?? uMatch.coverage ?? 100;
        c.available_max = c.available_max ?? uMatch.available_max ?? 100;
        c.exp = c.exp ?? uMatch.exp;
        c.save = c.save ?? uMatch.save;
        c.n_cmp = c.n_cmp ?? uMatch.n_cmp;
        c.price_confidence = c.price_confidence || uMatch.price_confidence;
      }
    }
    if (c.price && c.size) c.ppsm = Math.round(c.price / c.size);
    if (c.total == null) {
      c.total = 60;
      c.coverage = c.coverage ?? 60;
      c.available_max = c.available_max ?? 60;
      c.pts = c.pts || { fiyat: 24, yas: 24, bts: 12, cevre: 2, yalitim: 0, trafik: 0 };
    }
    c.badges = [];
    return c;
  });
  list.sort((a, b) => (b.total || 0) - (a.total || 0));
  list.forEach((it, idx) => { it.pool_rank = idx + 1; });
  return list;
}
async function _handleStaticSaved(city, opt) {
  if (!_STATIC_SAVED_BASE.has(city)) {
    try {
      const r = await fetch(`static_data/saved_condos_${encodeURIComponent(city)}.json`);
      const d = await r.json();
      _STATIC_SAVED_BASE.set(city, (d && d.items) || []);
    } catch (_) {
      _STATIC_SAVED_BASE.set(city, []);
    }
  }
  const baseItems = _STATIC_SAVED_BASE.get(city) || [];
  const ov = _loadStaticSavedOverrides(city);
  const deleted = new Set(ov.deleted || []);
  const edits = ov.edits || {};
  const added = ov.added || [];

  let lastId = null;
  if (opt && opt.method === "POST") {
    const body = JSON.parse(opt.body || "{}");
    const act = body.action || "add";
    if (act === "delete") {
      const sid = String(body.id || "");
      deleted.add(sid);
      ov.deleted = [...deleted];
      ov.added = added.filter((x) => String(x.id) !== sid);
      _saveStaticSavedOverrides(city, ov);
      lastId = sid;
    } else if (act === "update") {
      const sid = String(body.id || "");
      edits[sid] = { ...(edits[sid] || {}), ...body };
      delete edits[sid].action;
      ov.edits = edits;
      _saveStaticSavedOverrides(city, ov);
      lastId = sid;
    } else {
      const uid = String(body.unit_id || "").trim();
      const existing = [...baseItems, ...added].find((x) => (uid && String(x.unit_id || "") === uid) || (body.url && x.url === body.url));
      const nid = existing ? String(existing.id) : (uid ? `u:${uid}` : `local_${Date.now()}`);
      lastId = nid;
      deleted.delete(nid);
      ov.deleted = [...deleted];
      if (!existing) {
        added.push({
          id: nid,
          unit_id: uid,
          url: body.url || "",
          building_slug: body.building_slug || "",
          building_name: body.building_name || "Kaydedilen Condo",
          price: body.price ? +body.price : null,
          size: body.size ? +body.size : null,
          floor: body.floor || null,
          br: body.br || null,
          img: body.img || null,
          note: body.note || "",
          user_rating: body.user_rating ?? null,
        });
        ov.added = added;
      }
      _saveStaticSavedOverrides(city, ov);
    }
  }
  const merged = [];
  for (const it of [...baseItems, ...(ov.added || [])]) {
    const sid = String(it.id);
    if ((ov.deleted || []).includes(sid)) continue;
    const ed = (ov.edits || {})[sid] || {};
    merged.push({ ...it, ...ed });
  }
  return { ok: true, id: lastId, items: _scoreStaticSavedList(merged) };
}

async function api(path, opt) {
  if (!STATIC_MODE) {
    const r = await fetch(path, opt);
    return r.json();
  }
  const u = new URL(path, location.origin);
  const p = u.pathname;
  const city = u.searchParams.get("city") || "bangkok";
  if (p === "/api/cities") return (await fetch("static_data/cities.json")).json();
  if (p === "/api/status") return (await fetch("static_data/status.json")).json();
  if (p === "/api/share") return { url: PERMANENT_CLOUD_URL, local: false, static: true };
  if (p === "/api/ai") return { ok: false };
  if (p === "/api/stations") return (await fetch(`static_data/stations_${encodeURIComponent(city)}.json`)).json();
  if (p === "/api/condo") return (await fetch(`static_data/condo_${encodeURIComponent(city)}.json`)).json();
  if (p === "/api/condo_images") {
    const slug = u.searchParams.get("slug") || "";
    const hit = (CONDO || []).find((b) => b.slug === slug);
    return { bimgs: (hit && hit.bimgs) || [] };
  }
  if (p === "/api/malls") return (await fetch(`static_data/malls_${encodeURIComponent(city)}.json`)).json();
  if (p === "/api/listings") {
    const tStr = u.searchParams.get("types") || "";
    if (tStr === "none") return [];
    if (!_STATIC_LISTINGS_CACHE.has(city)) {
      const r = await fetch(`static_data/listings_${encodeURIComponent(city)}.json`);
      _STATIC_LISTINGS_CACHE.set(city, await r.json());
    }
    const allRows = _STATIC_LISTINGS_CACHE.get(city) || [];
    const want = new Set(tStr.split(",").filter(Boolean));
    return want.size ? allRows.filter((x) => want.has(x.ptype)) : allRows;
  }
  if (p === "/api/model") return (await fetch(`static_data/model_${encodeURIComponent(city)}.json`)).json();
  if (p === "/api/layers") {
    const kind = u.searchParams.get("kind") || "";
    return (await fetch(`static_data/layer_${encodeURIComponent(city)}_${encodeURIComponent(kind)}.json`)).json();
  }
  if (p === "/api/saved_condos") return _handleStaticSaved(city, opt);
  return {};
}

let CITY_META = [], anaSeq = 0, anaLoading = false;
function updateStatus() {
  if (polling) return;
  const city = $("#city").value, c = CITY_META.find((x) => x.id === city);
  if (!c) return;
  $("#status").textContent = c.last
    ? `${ALL.length ? ALL.length : c.count} ${tt("ilan · son güncelleme", "ประกาศ · อัปเดตล่าสุด")} ${ago(c.last)}`
    : tt("Henüz veri yok — “Verileri güncelle”ye bas (≈3–4 dk).", "ยังไม่มีข้อมูล — กด “อัปเดตข้อมูล” (≈3–4 นาที)");
}

async function loadCities() {
  const cs = await api("/api/cities");
  CITY_META = cs;
  $("#city").innerHTML = cs.map((c) => `<option value="${c.id}">${c.id[0].toUpperCase() + c.id.slice(1)} (${c.count})</option>`).join("");
  const saved = localStorage.getItem("city");
  if (saved && cs.some((c) => c.id === saved)) $("#city").value = saved;
  return cs;
}

function stationLineGroup(line, lname) {
  const ln = String(line || "").toUpperCase();
  const nm = String(lname || "");
  if (ln === "BTS" || /\b(bts|gold line)\b/i.test(nm)) return "BTS";
  if (ln === "MRT" || /\b(mrt|yellow line|pink line|blue line|purple line)\b/i.test(nm)) return "MRT";
  if (ln === "ARL" || /airport rail link/i.test(nm)) return "ARL";
  return "SRT";
}

function selectedStationLines() {
  return new Set([...document.querySelectorAll("#stlines input:checked")].map((i) => i.value));
}

function renderStations() {
  const active = selectedStationLines();
  for (const inp of document.querySelectorAll("#stlines input")) {
    inp.closest(".stchip")?.classList.toggle("on", inp.checked);
  }
  const hasAny = active.size > 0;
  if ($("#stmainchk")) $("#stmainchk").checked = hasAny;
  if ($("#sttoggle")) $("#sttoggle").classList.toggle("on", hasAny);
  if ($("#sttogglelbl")) {
    const subTxt = !hasAny
      ? tt("Kapalı", "ปิด")
      : active.size === 4
      ? tt("Tümü", "ทั้งหมด")
      : [...active].join(", ");
    $("#sttogglelbl").textContent = `🚇 ${tt("İstasyonlar", "สถานี")} (${subTxt}) ▾`;
  }
  stationLayer.clearLayers();
  stationLabels.clearLayers();
  minorLabels.clearLayers();
  if (!hasAny) {
    stationLabelSync();
    return;
  }
  const named = [];
  for (const s of STATIONS) {
    const grp = stationLineGroup(s.line, s.lname);
    if (!active.has(grp)) continue;
    const col = s.color || "#495057";
    L.circleMarker([s.lat, s.lng], { radius: 6, color: "#fff", weight: 2.5, fillColor: col, fillOpacity: 1 })
      .bindTooltip(`${lineTxt(s.line)}${esc(s.name)}${s.lname ? `<br><span class="muted">${esc(s.lname)}</span>` : ""}`).addTo(stationLayer);
    if (named.some((n) => n.name === s.name && hav(n.lat, n.lng, s.lat, s.lng) < 400)) continue;
    named.push(s);
    L.marker([s.lat, s.lng], { interactive: false, keyboard: false, pane: "names", icon: L.divIcon({ className: "slabel", iconSize: [0, 0],
      html: `<span><i style="background:${esc(col)}">${esc(s.line && s.line !== "Raylı" ? s.line : "RAIL")}</i>${esc(s.name)}</span>` }) })
      .addTo(stationLabels);
  }
  stationLabelSync();
}

async function loadCity(fly = true) {
  const city = $("#city").value;
  localStorage.setItem("city", city);
  const [st, cs] = await Promise.all([api(`/api/stations?city=${city}`), api("/api/cities")]);
  CITY_META = cs; STATIONS = st;
  const c = cs.find((x) => x.id === city);
  applyCondoDefaultArea();
  if (fly && !zone && c) {
    if (city === "bangkok") {
      if (window.innerWidth <= 820) map.fitBounds(BKK_BOUNDS, { padding: [8, 8] });
      else map.setView([13.714, 100.595], 13);
    } else {
      map.setView(c.center, 13);
    }
  }
  $("#stationlist").innerHTML = [...new Set(st.map((s) => s.name))].map((n) => `<option value="${esc(n)}">`).join("");
  renderStations();
  ALL = []; loadedKey = "";
  updateStatus();
  syncLayers();
  if (CONDO !== null && needsData() && condoKey !== city) { CONDO = []; await loadCondo(); }
  if (needsData()) await loadAnalysis(true);
  else render();
}

// Fırsat/beklenen fiyat seçili türlerin kendi emsal havuzuyla hesaplanır: tür değişince sunucudan yeniden alınır.
const selTypes = () => [...document.querySelectorAll("#types input:checked")].map((i) => i.value).filter((v) => v !== "condo");
// "kat" (kat dükkânı) sunucuda tür değildir: üst kattaki dükkân türleri (extra.kat = ust) istemcide ayrılır
const SHOP_T = new Set(["retail", "shophouse", "other"]);
const API_T = ["retail", "shophouse", "office", "warehouse", "other"];
function apiTypes() {
  const t = new Set(selTypes());
  if (t.delete("kat")) for (const s of SHOP_T) t.add(s);
  return API_T.filter((x) => t.has(x));
}
const condoOn = () => !!document.querySelector('#types input[value="condo"]:checked');
async function loadAnalysis(draw = true) {
  if (!needsData()) { if (draw) render(); return; }
  const city = $("#city").value, t = apiTypes().join(",") || "none", key = city + "|" + t, seq = ++anaSeq;
  if (t === "none") { ALL = []; MODEL = null; loadedKey = key; anaLoading = false; updateStatus(); if (draw) render(); return; }
  anaLoading = true;
  if (!ALL.length && !CONDO) $("#summary").textContent = tt("İlanlar analiz ediliyor…", "กำลังวิเคราะห์ประกาศ…");
  else if (draw && !ALL.length && CONDO && CONDO.length) render(true);  // condo pinleri analizi beklemesin
  try {
    const [rows, md] = await Promise.all([api(`/api/listings?city=${city}&types=${t}`), api(`/api/model?city=${city}&types=${t}`)]);
    if (seq !== anaSeq) return; // daha yeni bir seçim geldi
    ALL = apiTypes().length ? rows : []; MODEL = md; loadedKey = key;
    anaLoading = false;
    updateStatus();
    if (draw) render();
  } catch (e) {
    if (seq !== anaSeq) return;
    anaLoading = false;
    $("#summary").textContent = `${tt("İlanlar alınamadı", "ดึงประกาศไม่สำเร็จ")}: ${e.message}`;
  }
}

// ------------------------------------------------------------------ filtre + liste
// Asok ile Nana istasyonlarının ortası; 2,5 km Sukhumvit Soi 1–Soi 39 ve Ratchada–Petchaburi kesişimini kapsar
const ASOK_NANA = [13.7388, 100.5576], ASOK_NANA_M = 2500;
// üst filtre kutusu: kira, m² ve istasyon dükkâna da condoya da; bina yaşı yalnız condoya (dükkânda yapım yılı yok)
function dateAgeDays(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const ms = Date.parse(t.slice(0, 10) + "T12:00:00Z");
    return Number.isNaN(ms) ? null : Math.max(0, (Date.now() - ms) / 86400000);
  }
  if (/today|just now|hour|min/.test(t)) return 0.5;
  if (/yesterday/.test(t)) return 1;
  const m = t.match(/(\d+|a|an)\s*(day|week|month|year)/);
  if (m) {
    const n = m[1] === "a" || m[1] === "an" ? 1 : +m[1];
    const mul = { day: 1, week: 7, month: 30.5, year: 365 }[m[2]] || 1;
    return n * mul;
  }
  return null;
}
function filt() {
  const v = (id) => +$(id).value || 0;
  const fageRaw = ($("#fage")?.value ?? "").trim();
  const ageVal = fageRaw === "" || Number.isNaN(+fageRaw) ? Infinity : Math.max(0, +fageRaw);
  return { pmin: v("#pmin"), pmax: v("#pmax") || Infinity, smin: v("#smin"), smax: v("#smax") || Infinity,
    br: ($("#fbr")?.value || ""), bts: v("#fbts") || Infinity, age: ageVal, upd: v("#fupd") || Infinity,
    wall: ($("#fwall")?.value || ""), traf: ($("#ftraf")?.value || "") };
}
function filtered() {
  if (viewTab === "circle" && !zone) return [];
  const types = new Set(selTypes());
  const { pmin, pmax, smin, smax, bts, upd } = filt();
  const fmod = viewTab === "deals" ? $("#fmod").value : "", only = viewTab === "deals" || $("#onlydeal").checked || !!fmod, katf = $("#katf").value;
  // "Alan İçi" sekmesinde liste yalnız çizilen alanın içindekilerden oluşur; "Fırsat Bölümü" tüm şehri listeler.
  const c = viewTab === "circle" && zone ? zone.c : null;
  const out = [];
  for (const r of ALL) {
    const kt = (r.extra || {}).kat;
    if (SHOP_T.has(r.ptype) && kt === "ust" ? !types.has("kat") : !types.has(r.ptype)) continue;
    if (r.price_thb && r.price_thb > pmax) continue;
    if (pmin && !(r.price_thb >= pmin)) continue;
    if (r.size_m2 && (r.size_m2 < smin || r.size_m2 > smax)) continue;
    if ((smin || smax < Infinity) && !r.size_m2) continue;
    if (bts < Infinity && !(r.station?.m <= bts)) continue;
    if (upd < Infinity) {
      let d = dateAgeDays((r.extra || {}).guncelleme || r.listed);
      if (d == null && r.first_seen) d = Math.max(0, (Date.now() / 1000 - r.first_seen) / 86400);
      if (d != null && d > upd) continue;
    }
    if (only && !r.firsat) continue;
    const ex = r.extra || {};
    if (katf === "cadde" && (!ex.cadde || kt === "ust" || (r.ptype !== "shophouse" && kt === "tum"))) continue;
    if (katf === "giris" && kt !== "giris" && !(r.ptype === "shophouse" && kt === "tum")) continue;
    if (katf === "ustdegil" && kt === "ust") continue;
    if (fmod === "asok" && hav(ASOK_NANA[0], ASOK_NANA[1], r.lat, r.lng) > ASOK_NANA_M) continue;
    r._dc = c ? hav(c.lat, c.lng, r.lat, r.lng) : null;
    if (c && !inZone(r.lat, r.lng)) continue;
    out.push(r);
  }
  if (fmod) {  // kalabalık düzeyi (yoğundan), eşitlikte fırsat puanı
    const f = fmod === "asok" ? "crowd" : "crowd_bkk";
    out.sort((a, b) => (b[f] ?? -1) - (a[f] ?? -1) || b.score - a.score);
    return out;
  }
  const k = $("#sort").value, inf = Infinity;
  const key = {
    score: (r) => -(r.score + (r.firsat ? 100 : 0)), price: (r) => r.price_thb ?? inf, ppsm: (r) => r.ppsm ?? inf,
    size: (r) => -(r.size_m2 ?? 0), pop: (r) => -(r.pop ?? 0), station: (r) => r.station?.m ?? inf, center: (r) => r._dc ?? 0, new: (r) => -r.first_seen,
    deal: (r) => -(r.deal ?? -9) + (r.conf === "dusuk" ? 10 : 0),
  }[k];
  out.sort((a, b) => key(a) - key(b));
  return out;
}

let LIST_N = 200;  // listede gösterilen ilk N ilan; "daha göster" artırır, süzgeç değişince sıfırlanır
function render(keepN) {
  if (keepN !== true) LIST_N = 200;
  if (viewTab === "saved") return renderSaved();
  if (viewTab === "malls") return renderMalls();
  if (CONDO && (!selTypes().length || condoQuery())) return renderCondo();
  if (viewTab === "circle" && !zone) {
    pinLayer.clearLayers(); markers.clear(); $("#list").innerHTML = "";
    $("#summary").textContent = tt("Haritada alan çizilmedi — ilanları görmek için alan çizin ya da “★ Fırsat Bölümü” sekmesine geçin.",
      "ยังไม่ได้วาดพื้นที่บนแผนที่ — วาดพื้นที่เพื่อดูประกาศ หรือไปที่แท็บ “★ ดีลเด่น”");
    return;
  }
  if (anaLoading && !ALL.length) {  // condo binaları dükkân analizini beklemez
    pinLayer.clearLayers(); markers.clear(); $("#list").innerHTML = "";
    $("#summary").textContent = tt("İlanlar analiz ediliyor…", "กำลังวิเคราะห์ประกาศ…");
    if (CONDO && CONDO.length) renderCondo(true);
    return;
  }
  const rows = filtered();
  const deals = rows.filter((r) => r.firsat).length;
  const pp = rows.map((r) => r.ppsm).filter(Boolean).sort((a, b) => a - b);
  const med = pp.length ? pp[Math.floor(pp.length / 2)] : null;
  const fm = viewTab === "deals" ? $("#fmod").value : "";
  $("#summary").textContent = (fm ? (fm === "asok" ? tt("★ Fırsat Bölümü · Asok–Nana 2,5 km · kalabalığa göre · ", "★ ดีลเด่น · Asok–Nana 2.5 กม. · ตามความหนาแน่นคน · ")
      : tt("★ Fırsat Bölümü · Tüm Bangkok · kalabalığa göre · ", "★ ดีลเด่น · ทั่วกรุงเทพฯ · ตามความหนาแน่นคน · ")) : "")
    + (!fm && viewTab === "deals" ? tt("★ Fırsat Bölümü (Tüm şehir) · ", "★ ดีลเด่น (ทั้งเมือง) · ") : "")
    + (viewTab === "circle" && zone ? tt("✏ Alan içi · ", "✏ ในพื้นที่ · ") : "")
    + `${rows.length} ${tt("ilan", "ประกาศ")} · ${deals} ${tt("fırsat", "ดีล")}` + (fm ? "" : ` · ${tt("sıra", "เรียง")}: ${$("#sort").selectedOptions[0].textContent}`)
    + (med ? ` · ${tt("bölge medyanı", "มัธยฐานพื้นที่")} ${fmt(med)} ฿/m²` : "")
    + (MODEL && MODEL.mdape != null ? ` · ${tt("beklenen fiyat hatası", "ความคลาดเคลื่อนราคาคาดการณ์")} ±${Math.round(MODEL.mdape * 100)}% (${tt("medyan", "มัธยฐาน")})` : "");

  pinLayer.clearLayers(); markers.clear();
  for (const r of rows) {
    const label = r.price_thb ? "฿" + kfmt(r.price_thb) : "?";
    const icon = L.divIcon({ className: "pinwrap", html: `<span class="pin${r.firsat ? " deal" : ""}${r.flags.includes("konum_yaklasik") ? " approx" : ""}${r.id === selId ? " sel" : ""}">${r.firsat ? "★ " : ""}${label}</span>` });
    const m = L.marker([r.lat, r.lng], { icon, zIndexOffset: r.firsat ? 1000 : 0, riseOnHover: true })
      .bindPopup(() => popup(r), { maxWidth: 320, minWidth: window.innerWidth <= 820 ? 240 : 295, autoPanPadding: [10, 10] })
      .on("click", () => select(r.id, false));
    m.addTo(pinLayer); markers.set(r.id, m);
  }

  const list = $("#list");
  list.innerHTML = rows.slice(0, LIST_N).map((r, i) => {
    // kart yalnız karar bilgisini taşır: kira, m², kat, cadde, puan, istasyon, emsale göre fark; gerisi açılır pencerede
    const ex = r.extra || {}, im = gallery(r)[0], kat = KAT_TR[ex.kat];
    const caddeTag = ex.cadde ? `<span class="tag wall-high" title="${esc(ex.cadde_kanit || (r.road ? `${r.road.name || "Ana cadde"} · ${r.road.m} m` : ""))}">🛣 ${tt("Yola sıfır", "ติดถนน")}</span>` : "";
    const roadTxt = r.road && r.road.m <= 60 ? ` · 🛣 ${esc(r.road.name || tt("Ana cadde", "ถนนหลัก"))} ${fmt(r.road.m)} m` : "";
    const sites = r.also.length ? `<span class="tag src" title="${esc(r.also.map((a) => `${SRC_TR[a.source] || a.source}: ฿${fmt(a.price_thb)}`).join(" · "))}">${r.also.length + 1} ${tt("sitede", "เว็บไซต์")}${r.cheapest ? tt(" · en ucuzu bu", " · ถูกสุดที่นี่") : ""}</span>` : "";
    return `<li data-id="${esc(r.id)}" class="${r.firsat ? "deal" : ""}${r.id === selId ? " sel" : ""}">
      ${im ? `<img loading="lazy" src="${esc(im.url)}" alt="">` : `<img alt="">`}
      <div>
        <div class="big"><span class="rank">${i + 1}.</span> <b>฿${fmt(r.price_thb)}</b>/${tt("ay", "เดือน")} · <b>${r.size_m2 ? fmt(r.size_m2) + " m²" : "m² ?"}</b>
          ${caddeTag}${kat ? `<span class="tag ${kat[0]}">${kat[1]}</span>` : `<span class="tag kat2">${tt("Kat ?", "ชั้น ?")}</span>`}</div>
        <div class="m"><span class="score" data-score-shop="${esc(r.id)}" title="${tt("Tıkla: Neyden kaç puan kazandı / kesildi detaylı gör", "คลิกเพื่อดูรายละเอียดคะแนน")}" style="background:${scoreColor(r.score)}">${r.score}</span>
          ${TYPE_TR[r.ptype] || r.ptype}${roadTxt}${r.station ? ` · ${esc(r.station.name)} ${fmt(r.station.m)} m` : ""}${r.deal != null ? ` · ${tt("emsale göre", "เทียบราคาตลาด")} <b>${r.deal >= 0 ? tt("%" + Math.round(r.deal * 100) + " ucuz", "ถูกกว่า " + Math.round(r.deal * 100) + "%") : tt("%" + Math.abs(Math.round(r.deal * 100)) + " pahalı", "แพงกว่า " + Math.abs(Math.round(r.deal * 100)) + "%")}</b>` : ""}</div>
        <div>${r.firsat ? `<span class="tag deal">★ ${tt("Fırsat", "ดีล")}</span>` : ""}${confTag(r)}${sites}${r.flags.filter((f) => FLAG_TR[f]).map((f) => `<span class="tag warn">${FLAG_TR[f]}</span>`).join("")}</div>
      </div></li>`;
  }).join("") + (rows.length > LIST_N
    ? `<li class="more"><button id="more">${tt(`${Math.min(200, rows.length - LIST_N)} ilan daha göster`, `แสดงเพิ่มอีก ${Math.min(200, rows.length - LIST_N)} ประกาศ`)} (${LIST_N}/${rows.length})</button> <button id="moreall">${tt("Hepsini göster", "แสดงทั้งหมด")}</button></li>` : "");
  if (CONDO) renderCondo(true);
}

// kat ilan metninden çıkarılır (kat.py); Tayland'da "1st floor" giriş katıdır
const KAT_I = {
  giris: ["kat0", ["Giriş katı", "ชั้นล่าง"], ["Giriş katı", "ชั้นล่าง (ติดถนน)"]],
  tum: ["kat0", ["Bina (giriş dahil)", "ทั้งอาคาร (รวมชั้นล่าง)"], ["Bütün bina / çok katlı — giriş katı dahil", "ทั้งอาคาร / หลายชั้น — รวมชั้นล่าง"]],
  ust: ["kat2", ["Üst kat", "ชั้นบน"], ["Yalnız üst kat (giriş katı değil)", "เฉพาะชั้นบน (ไม่ใช่ชั้นล่าง)"]],
};
const KAT_TR = new Proxy(KAT_I, { get: (t, k) => t[k] && [t[k][0], tt(...t[k][1]), tt(...t[k][2])] });

const PART_TR = { fiyat: [["fiyat", "ราคา"], 55], kalabalik: [["kalabalık", "ความหนาแน่นคน"], 15], nufus: [["nüfus", "ประชากร"], 10],
  istasyon: [["istasyon", "สถานี"], 10], kat: [["giriş katı", "ชั้นล่าง"], 10] };
const partsTxt = (r) => r.puan_parca ? `<br><span class="muted">${Object.entries(PART_TR).map(([k, [t, w]]) => `${tt(...t)} ${Math.round(r.puan_parca[k])}/${w}`).join(" · ")}${r.flags.includes("ust_kat") ? tt(" · <b>yalnız üst kat: dükkân olarak en çok 30</b>", " · <b>เฉพาะชั้นบน: ในฐานะร้านค้าได้สูงสุด 30</b>") : r.score === 40 && ["supheli", "veri_supheli", "devir"].some((f) => r.flags.includes(f)) ? tt(" · uyarı nedeniyle 40'ta kesildi", " · ถูกจำกัดที่ 40 เพราะมีคำเตือน") : ""}</span>` : "";
const confTag = (r) => r.conf ? `<span class="tag${r.conf === "dusuk" ? " warn" : ""}" title="${tt("Emsal sayısı ve yayılımı; puanı değiştirmez", "จำนวนและการกระจายของประกาศเทียบเคียง ไม่มีผลต่อคะแนน")}">${tt("güven", "ความน่าเชื่อถือ")}: ${CONF_TR[r.conf]}</span>` : "";
function crowdTxt(r) {
  const p = (v) => v == null ? tt("kapsam dışı", "นอกขอบเขต") : v > 0 ? `${Math.round(v * 100)}/100` : tt("düşük (ilk %30 dışı)", "ต่ำ (ไม่อยู่ใน 30% แรก)");
  return `${tt("merkez", "ใจกลาง")}: ${p(r.crowd)} · ${tt("Bangkok", "กรุงเทพฯ")}: ${p(r.crowd_bkk)} <span class="muted">(${tt("OSM tahmini", "ประมาณจาก OSM")})</span>`;
}
function popup(r) {
  const imgs = galleryHtml(r);
  const ll = `${r.lat},${r.lng}`, x = r.extra || {}, pct = (v) => Math.abs(Math.round(v * 100));
  const cmp = r.expected_ppsm
    ? `${fmt(r.expected_ppsm)} ฿/m² (${r.comps} ${tt("emsal, etkin", "รายการเทียบ, มีผล")} ${r.n_eff}) → <b>${r.deal >= 0 ? tt(`%${pct(r.deal)} ucuz`, `ถูกกว่า ${pct(r.deal)}%`) : tt(`%${pct(r.deal)} pahalı`, `แพงกว่า ${pct(r.deal)}%`)}</b>`
      + `<br><span class="muted">z ${r.z} · ${tt("güven", "ความน่าเชื่อถือ")} ${CONF_TR[r.conf] || r.conf}${r.comp_group ? ` · ${tt("kıyas", "เทียบกับ")}: ` + (TYPE_TR[r.comp_group] || r.comp_group) : ""}</span>`
    : tt("kıyas için yeterli emsal yok", "มีรายการเทียบไม่พอ");
  const notes = [
    r.flags.includes("konum_yaklasik") ? tt("Konum yaklaşık — site mahalle/proje merkezini veriyor; gerçek adres farklı olabilir.", "ตำแหน่งโดยประมาณ — เว็บไซต์ให้จุดกึ่งกลางย่าน/โครงการ ที่อยู่จริงอาจต่างออกไป") : "",
    r.flags.includes("supheli") ? tt("Emsallerden çok ucuz — fiyat/m² hatalı ya da kısmi kira olabilir; ilanı doğrula.", "ถูกกว่าราคาตลาดมาก — ราคา/ตร.ม. อาจผิดหรือเป็นค่าเช่าบางส่วน โปรดตรวจสอบประกาศ") : "",
    r.flags.includes("veri_supheli") ? tt("Fiyat ya da m² tutarsız (ör. satış fiyatı/arsa alanı) — puanlamaya alınmadı.", "ราคาหรือพื้นที่ไม่สอดคล้อง (เช่น ราคาขาย/ขนาดที่ดิน) — ไม่นำมาคิดคะแนน") : "",
    r.flags.includes("devir") ? tt("İlan devir/hava parası (key money) içeriyor — aylık kiraya ek ödeme var.", "ประกาศมีค่าเซ้ง/ค่าแป๊ะเจี๊ยะ (key money) — มีค่าใช้จ่ายเพิ่มจากค่าเช่ารายเดือน") : "",
  ].filter(Boolean);
  const nopts = tt(" <span class=\"muted\">· puana girmez</span>", " <span class=\"muted\">· ไม่มีผลต่อคะแนน</span>");
  const rows = [
    [tt("Kira", "ค่าเช่า"), `<b>฿${fmt(r.price_thb)}</b> / ${tt("ay", "เดือน")}`],
    [tt("Alan", "พื้นที่"), r.size_m2 ? `${fmt(r.size_m2)} m²` : "—"],
    ["฿/m²", r.ppsm ? `${fmt(r.ppsm)}` : "—"],
    [tt("Beklenen ฿/m²", "฿/m² ที่คาดไว้"), cmp],
    [tt("Bölge kira düzeyi", "ระดับค่าเช่าในพื้นที่"), r.area_pct != null ? tt(`şehirde %${r.area_pct} dilim (100 m² eşdeğeri kira)`, `เปอร์เซ็นไทล์ ${r.area_pct}% ของเมือง (ค่าเช่าเทียบ 100 m²)`) + nopts : "—"],
    [tt("Kalabalık", "ความหนาแน่นคน"), crowdTxt(r)],
    [tt("Çevre nüfusu", "ประชากรโดยรอบ"), r.pop != null ? `${fmt(r.pop)} ${tt("kişi/km²", "คน/ตร.กม.")} <span class="muted">(3×3 km, WorldPop 2020)</span>` : "—"],
    [tt("İstasyon", "สถานี"), r.station ? `${lineTxt(r.station.line)}${esc(r.station.name)} · ${fmt(r.station.m)} m` : (esc(r.near_transit) || "—")],
    [tt("Tür", "ประเภท"), TYPE_TR[r.ptype] || r.ptype],
    [tt("Cadde / Konum", "ทำเล / ถนน"), (x.cadde ? `<b>🛣 ${tt("Yola sıfır / cadde üstü", "ติดถนนสายหลัก/รอง")}</b>` : tt("Ara sokak / içeride", "ในซอย / ด้านใน"))
      + (r.road ? ` · ${esc(r.road.name || tt("Ana cadde", "ถนนหลัก"))} (${fmt(r.road.m)} m)` : "")
      + (x.cadde_kanit ? `<br><span class="muted">${tt("ilanda", "ในประกาศ")}: “${esc(x.cadde_kanit)}”</span>` : "")],
    [tt("Kat", "ชั้น"), x.kat ? `${KAT_TR[x.kat][2]}<br><span class="muted">${tt("ilanda", "ในประกาศ")}: “${esc(x.kat_kanit || "")}”</span>`
      : (x.kat_kontrol ? tt("ilanda yazmıyor", "ประกาศไม่ระบุ") : tt("okunmadı", "ยังไม่ได้อ่าน"))],
    [tt("Kiracı puanı", "คะแนนผู้เช่า"), `<span class="score" data-score-shop="${esc(r.id)}" title="${tt("Tıkla: Neyden kaç puan kazandı / kesildi detaylı gör", "คลิกเพื่อดูรายละเอียดคะแนน")}" style="background:${scoreColor(r.score)}">${r.score}</span>${r.firsat ? tt(" ★ Fırsat", " ★ ดีล") : ""}${partsTxt(r)}`],
    [tt("Güven", "ความน่าเชื่อถือ"), r.conf ? `${confTag(r)} <span class="muted">${tt(`etkin ${r.n_eff} emsal · yayılım ${r.sigma} · puana girmez`, `รายการเทียบที่มีผล ${r.n_eff} · การกระจาย ${r.sigma} · ไม่มีผลต่อคะแนน`)}</span>` : tt("emsal yok", "ไม่มีรายการเทียบ")],
    r.flags.includes("fiyat_dustu") ? [tt("Fiyat geçmişi", "ประวัติราคา"), tt(`%${pct(r.drop_pct)} düştü`, `ลดลง ${pct(r.drop_pct)}%`) + nopts] : null,
    [tt("İlk görülme", "พบครั้งแรก"), ago(r.first_seen) + (r.yeni ? ` · <b>${tt("yeni", "ใหม่")}</b>` : "") + (r.listed ? ` · ${tt("sitede", "บนเว็บไซต์")}: ${esc(r.listed)}` : "") + (x.guncelleme ? ` · ${tt("güncelleme", "อัปเดต")} ${esc(x.guncelleme)}` : "")],
    x.ilan_veren || x.asil_kaynak ? [tt("İlan veren", "ผู้ลงประกาศ"), esc([x.ilan_veren, x.asil_kaynak && tt("kaynak: ", "แหล่งที่มา: ") + x.asil_kaynak].filter(Boolean).join(" · "))] : null,
    x.musaitlik || x.min_sozlesme ? [tt("Koşul", "เงื่อนไข"), esc([x.musaitlik, x.min_sozlesme && tt("en az ", "ขั้นต่ำ ") + x.min_sozlesme].filter(Boolean).join(" · "))] : null,
    x.arsa_m2 ? [tt("Arsa", "ที่ดิน"), `${fmt(x.arsa_m2)} m²`] : null,
  ].filter(Boolean);
  const src = [`<a href="${esc(r.url)}" target="_blank" rel="noopener">${tt(`${SRC_TR[r.source] || r.source}'da aç`, `เปิดใน ${SRC_TR[r.source] || r.source}`)}</a>`]
    .concat(r.also.map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${SRC_TR[a.source] || a.source} (฿${fmt(a.price_thb)})</a>`));
  return `<div class="pop">${imgs}<h3>${esc(r.title)}</h3>
    ${notes.map((n) => `<div class="note">⚠ ${n}</div>`).join("")}
    <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>
    <div class="links">${src.join("")}
      <a href="https://www.google.com/maps/search/?api=1&query=${ll}" target="_blank" rel="noopener">Google Maps</a>
      <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}" target="_blank" rel="noopener">${tt("Street View (dış görünüm)", "Street View (ภาพภายนอก)")}</a></div></div>`;
}

function select(id, open = true) {
  selId = id;
  document.querySelectorAll("#list li").forEach((li) => li.classList.toggle("sel", li.dataset.id === id));
  document.querySelectorAll(".pin.sel").forEach((p) => p.classList.remove("sel"));
  const m = markers.get(id);
  if (!m) return;
  m.getElement()?.querySelector(".pin")?.classList.add("sel");
  if (open) {
    if (window.innerWidth <= 820 && mobView === "list") setMobView("split");
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 17));
    m.openPopup();
  } else {
    document.querySelector(`#list li[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// ------------------------------------------------------------------ sekme + alan
async function syncDataAndRender() {
  areaText();
  if (viewTab === "saved") { renderSaved(); return; }
  if (viewTab === "malls") {
    const city = $("#city").value || "bangkok";
    if (!MALLS || mallsKey !== city) {
      $("#summary").textContent = tt("AVM listesi ve içindeki kiralıklar yükleniyor…", "กำลังโหลดรายชื่อห้างและประกาศเช่า…");
      await loadMalls();
    }
    renderMalls();
    return;
  }
  if (!needsData()) { render(); return; }
  if (CONDO !== null && condoKey !== $("#city").value) {
    $("#summary").textContent = tt("Condo binaları yükleniyor…", "กำลังโหลดอาคารคอนโด…");
    await loadCondo();
  }
  if (CONDO !== null && !selTypes().length) { render(); return; }
  const curKey = $("#city").value + "|" + (apiTypes().join(",") || "none");
  if (loadedKey !== curKey) await loadAnalysis(true);
  else render();
}

let prevNonSavedTab = "circle";
let savedBoxOpen = false;
let lastUpdatedSavedId = null;
let lastUpdatedTimer = null;

function setSavedBoxOpen(open) {
  savedBoxOpen = !!open;
  if (savedBoxOpen && viewTab !== "saved") {
    setViewTab("saved");
    return;
  }
  if (!savedBoxOpen && viewTab === "saved") {
    setViewTab(prevNonSavedTab || "circle");
    return;
  }
  if ($("#savedbox")) $("#savedbox").hidden = !savedBoxOpen;
  if (typeof syncSavedBadge === "function") syncSavedBadge();
}

function setViewTab(tab) {
  if (tab !== "circle" && tab !== "deals" && tab !== "saved" && tab !== "malls") return;
  const prev = viewTab;
  if (tab === "saved" && prev !== "saved") prevNonSavedTab = prev;
  viewTab = tab;
  savedBoxOpen = tab === "saved";
  document.body.classList.toggle("saved-tab", tab === "saved");
  document.body.classList.toggle("malls-tab", tab === "malls");
  if ($("#savedbox")) $("#savedbox").hidden = tab !== "saved";
  if ($("#mallbox")) $("#mallbox").hidden = tab !== "malls";
  if (window.innerWidth <= 820 && (tab === "saved" || tab === "malls")) {
    if ($("#side")?.classList.contains("mob-filt-open")) toggleMobFilt(false);
    if (mobView === "map") setMobView("split");
  }
  if (tab !== "malls") {
    selMallId = null;
    lastHovMallId = null;
    clearTimeout(mallHovTimer);
    mallFootprintLayer.clearLayers();
  }
  if (typeof syncMallTabBtn === "function") syncMallTabBtn();
  for (const b of document.querySelectorAll("#viewtabs button")) b.classList.toggle("on", b.dataset.tab === tab);
  if (tab === "deals") {
    if (prev === "circle") circleOnlyDeal = $("#onlydeal").checked;
    $("#onlydeal").checked = true;
    $("#onlydeal").disabled = true;
    $("#sort").disabled = !!$("#fmod").value;
  } else if (tab === "circle") {
    $("#onlydeal").disabled = false;
    if (prev === "deals") $("#onlydeal").checked = circleOnlyDeal;
    $("#sort").disabled = false;
  }
  if (typeof syncSavedBadge === "function") syncSavedBadge();
  syncDataAndRender();
}

// Seçili alan (zone): kapalı çokgen. pts [[lat,lng]…]; c ağırlık merkezi ("Merkeze yakın" sırası ve
// danışman), r merkezden en uzak köşe (m), km2 alan. İstasyon "Bölge" düğmesi de çemberi çokgenle yaklaştırır.
const ZONE_STYLE = { color: "#1767d1", weight: 2, fillOpacity: 0.06, dashArray: "6 4" };
const toXY = (p, lat0) => [p[1] * 111320 * Math.cos(lat0 * Math.PI / 180), p[0] * 110574];  // yerel metre
function makeZone(pts) {
  const lat0 = pts[0][0], xy = pts.map((p) => toXY(p, lat0));
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    const f = xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
    a += f; cx += (xy[j][0] + xy[i][0]) * f; cy += (xy[j][1] + xy[i][1]) * f;
  }
  let c;
  if (Math.abs(a) > 1) c = { lat: cy / (3 * a) / 110574, lng: cx / (3 * a) / (111320 * Math.cos(lat0 * Math.PI / 180)) };
  else c = { lat: pts.reduce((s, p) => s + p[0], 0) / pts.length, lng: pts.reduce((s, p) => s + p[1], 0) / pts.length };
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  return { pts, c, km2: Math.abs(a) / 2e6, r: Math.max(...pts.map((p) => hav(c.lat, c.lng, p[0], p[1]))),
    box: [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)],
    layer: L.polygon(pts, ZONE_STYLE).addTo(map) };
}
// Initial Bangkok condo area traced from the user's Phrom Phong–Udom Suk map.
const CONDO_DEFAULT_ZONE = [[13.725603, 100.564389], [13.728019, 100.564389], [13.732933, 100.566278], [13.734433, 100.569971], [13.734766, 100.578729], [13.733933, 100.587144], [13.731767, 100.594185], [13.726186, 100.605091], [13.720023, 100.612218], [13.715441, 100.614879], [13.710527, 100.616769], [13.70353, 100.620117], [13.697033, 100.622608], [13.688954, 100.62484], [13.683956, 100.625871], [13.680124, 100.626042], [13.676876, 100.624239], [13.675127, 100.62089], [13.674127, 100.618057], [13.674211, 100.610157], [13.676126, 100.602686], [13.678292, 100.600024], [13.683706, 100.597019], [13.689037, 100.594014], [13.695118, 100.592039], [13.701031, 100.589463], [13.706029, 100.586629], [13.709694, 100.583709], [13.713776, 100.579845], [13.71844, 100.575981], [13.722105, 100.572804], [13.724521, 100.569026], [13.72577, 100.565849]];
let condoDefaultAreaApplied = false;
function applyCondoDefaultArea() {
  if (condoDefaultAreaApplied || CONDO === null || $("#city").value !== "bangkok") return;
  condoDefaultAreaApplied = true;
  if (zone) return; // Keep any area the user has already drawn.
  zone = makeZone(CONDO_DEFAULT_ZONE);
  if ($("#mapclear")) $("#mapclear").hidden = false;
  areaText();
  updateMobChips();
  map.fitBounds(zone.layer.getBounds(), { padding: [30, 30] });
}

function circlePts(lat, lng, r, n = 64) {
  const k = Math.cos(lat * Math.PI / 180);
  return Array.from({ length: n }, (_, i) => {
    const t = 2 * Math.PI * i / n;
    return [lat + r * Math.sin(t) / 110574, lng + r * Math.cos(t) / (111320 * k)];
  });
}
// çift-tek kuralı (ışın atma): kendini kesen elle çizimde de kapalı halkaların içi sayılır
function inZone(lat, lng) {
  const [la0, la1, ln0, ln1] = zone.box;
  if (lat < la0 || lat > la1 || lng < ln0 || lng > ln1) return false;
  const p = zone.pts;
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][0] > lat) !== (p[j][0] > lat)
      && lng < (p[j][1] - p[i][1]) * (lat - p[i][0]) / (p[j][0] - p[i][0]) + p[i][1]) inside = !inside;
  }
  return inside;
}
function clearZone() {
  if (zone) zone.layer.remove();
  zone = null;
  if ($("#mapclear")) $("#mapclear").hidden = true;
  if (typeof updateMobChips === "function") updateMobChips();
}
function setZone(pts) {
  clearZone();
  zone = makeZone(pts);
  if ($("#mapclear")) $("#mapclear").hidden = false;
  if (typeof updateMobChips === "function") updateMobChips();
  if (window.innerWidth <= 820 && mobView === "map") setMobView("split");
  map.fitBounds(zone.layer.getBounds(), { padding: [30, 30] });
  if (viewTab !== "circle") setViewTab("circle");
  else syncDataAndRender();
}
function areaText() {
  if (!zone) {
    $("#area").textContent = viewTab === "deals"
      ? tt("Fırsat bölümü — tüm şehirdeki fırsatlar listeleniyor.", "ดีลเด่น — แสดงดีลทั้งเมือง")
      : tt("Bölge seçilmedi — ilanları görmek için haritada alan çizin.", "ยังไม่ได้เลือกพื้นที่ — วาดพื้นที่บนแผนที่เพื่อดูประกาศ");
    return;
  }
  const c = zone.c, ns = STATIONS.map((s) => [s, hav(c.lat, c.lng, s.lat, s.lng)]).sort((a, b) => a[1] - b[1])[0];
  $("#area").textContent = `${tt("Alan", "พื้นที่")}: ${pct1(zone.km2)} km²` + (ns ? tt(` · merkez ${ns[0].name} istasyonuna ${fmt(ns[1])} m`, ` · จุดกึ่งกลางห่างสถานี ${ns[0].name} ${fmt(ns[1])} ม.`) : "");
}

// Serbest el çizimi: düğmeyle çizim kipine gir ya da Ctrl + sol tık; basılı tutup alanın sınırını çiz,
// bırakınca çizgi başlangıca kapanır.
let drawing = false, drawPts = null, drawLine = null, drawLast = null;
const mapEl = map.getContainer();
const drawShield = document.createElement("div");
drawShield.id = "drawshield";
mapEl.appendChild(drawShield);

function setDrawing(on) {
  drawing = on;
  $("#draw").classList.toggle("on", on);
  $("#draw").textContent = on ? tt("Basılı tut, alanın sınırını çiz…", "กดค้างแล้ววาดขอบเขตพื้นที่…") : tt("✏ Haritada alan çiz", "✏ วาดพื้นที่บนแผนที่");
  if ($("#mapdraw")) {
    $("#mapdraw").classList.toggle("on", on);
    $("#mapdraw").textContent = on ? tt("✏ Çiziliyor…", "✏ กำลังวาด…") : tt("✏ Çiz", "✏ วาด");
  }
  mapEl.classList.toggle("drawing", on);
  if (on) {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    if (map.boxZoom) map.boxZoom.disable();
    if (map.tapHold) map.tapHold.disable();
  } else {
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    if (map.boxZoom) map.boxZoom.enable();
    if (map.tapHold) map.tapHold.enable();
  }
}
$("#draw").onclick = () => {
  setDrawing(!drawing);
  if (drawing && window.innerWidth <= 820) mapEl.scrollIntoView({ behavior: "instant" });
};
window.addEventListener("resize", () => map.invalidateSize());
// Yakalama aşamasında dinlenir ve olay durdurulur: Leaflet'in sürükleyicisi (harita kaydırma) ve
// ilan iğneleri basışı hiç görmez.
function evToPt(ev) {
  const r = mapEl.getBoundingClientRect();
  return L.point(ev.clientX - r.left, ev.clientY - r.top);
}
function startDrawAt(clientEvent) {
  map.closePopup();
  clearZone();
  const pt = evToPt(clientEvent);
  const ll = map.containerPointToLatLng(pt);
  drawPts = [[ll.lat, ll.lng]]; drawLast = pt;
  drawLine = L.polyline(drawPts, { ...ZONE_STYLE, dashArray: null }).addTo(map);
}
function moveDrawAt(clientEvent) {
  const pt = evToPt(clientEvent);
  if (pt.distanceTo(drawLast) < 4) return;  // 4 px'ten sık nokta alınmaz
  const ll = map.containerPointToLatLng(pt);
  drawPts.push([ll.lat, ll.lng]); drawLast = pt;
  drawLine.addLatLng(ll);
}
function cancelShortStroke() {
  if (drawLine) drawLine.remove();
  drawPts = null; drawLine = null; drawLast = null;
  $("#area").textContent = tt("Parmağınızı/fareyi basılı tutup alanı çevreleyerek sürükleyin.", "กดค้างแล้วลากนิ้ววาดรอบพื้นที่บนแผนที่");
}
mapEl.addEventListener("mousedown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.button !== 0 || (!drawing && !ctrl) || e.target.closest(".leaflet-control")) return;
  e.preventDefault(); e.stopPropagation();
  startDrawAt(e);
}, true);
document.addEventListener("mousemove", (e) => {
  if (!drawPts) return;
  e.preventDefault();
  moveDrawAt(e);
}, true);
mapEl.addEventListener("touchstart", (e) => {
  if (!drawing || e.touches.length !== 1 || e.target.closest(".leaflet-control")) return;
  e.preventDefault(); e.stopPropagation();
  startDrawAt(e.touches[0]);
}, { capture: true, passive: false });
document.addEventListener("touchmove", (e) => {
  if (!drawPts || !e.touches.length) return;
  e.preventDefault(); e.stopPropagation();
  moveDrawAt(e.touches[0]);
}, { capture: true, passive: false });
// Ctrl+tık iğnenin "click"ini de tetiklemesin (çizim yerine popup açılmasın)
mapEl.addEventListener("click", (e) => { if (drawing || e.ctrlKey || e.metaKey) e.stopPropagation(); }, true);
function endDraw() {
  if (!drawPts) return;
  const pts = drawPts;
  const px = pts.map((p) => map.latLngToContainerPoint(p));
  const xs = px.map((p) => p.x), ys = px.map((p) => p.y);
  const span = pts.length >= 3 ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
  if (span < 18) {
    // Dokunmatik/fare kısa tıklandığında 500m çember atıp çizim modundan çıkma; çizim modunda kal
    cancelShortStroke();
    return;
  }
  drawLine.remove(); drawPts = null; drawLine = null; drawLast = null;
  if (drawing) setDrawing(false);
  setZone(L.LineUtil.simplify(px, 1.5).map((p) => { const ll = map.containerPointToLatLng(p); return [ll.lat, ll.lng]; }));
}
document.addEventListener("mouseup", endDraw, true); // imleç haritadan çıkıp bırakılırsa da biter
document.addEventListener("touchend", endDraw, { capture: true, passive: false });
document.addEventListener("touchcancel", () => {
  if (!drawPts) return;
  if (drawPts.length >= 6) endDraw();
  else cancelShortStroke();
}, { capture: true, passive: false });
$("#clear").onclick = () => { clearZone(); areaText(); render(); };

function findStation(q) {
  q = q.trim().toLowerCase();
  if (!q) return null;
  return STATIONS.find((s) => s.name.toLowerCase() === q) || STATIONS.find((s) => s.name.toLowerCase().startsWith(q))
    || STATIONS.find((s) => s.name.toLowerCase().includes(q));
}
$("#go").onclick = () => {
  const parts = $("#stationq").value.split(/\s*[-–—,]\s*/).filter(Boolean);
  const ss = parts.map(findStation).filter(Boolean);
  if (!ss.length) { $("#area").textContent = tt("İstasyon bulunamadı.", "ไม่พบสถานี"); return; }
  if (ss.length === 1) { setZone(circlePts(ss[0].lat, ss[0].lng, 600)); }
  else {
    const lat = ss.reduce((a, s) => a + s.lat, 0) / ss.length, lng = ss.reduce((a, s) => a + s.lng, 0) / ss.length;
    const r = Math.max(...ss.map((s) => hav(lat, lng, s.lat, s.lng))) + 450;
    setZone(circlePts(lat, lng, r));
  }
};
$("#stationq").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#go").click(); });

// ------------------------------------------------------------------ güncelleme
let polling = null;
let lastDoneSources = 0;
async function poll() {
  const s = await api("/api/status");
  const cnt = Object.entries(s.counts || {}).map(([k, v]) => `${SRC_TR[k] || k}: ${v}`).join(" · ");
  const lastLog = (s.log || []).slice(-1)[0] || "";
  if (s.running || s.condo_running) {
    const prog = s.total_sources ? ` (${s.done_sources || 0}/${s.total_sources})` : "";
    $("#status").textContent = `${tt("Güncelleniyor…", "กำลังอัปเดต…")}${prog} ${cnt} — ${lastLog}`;
    $("#refresh").disabled = true;
    $("#refresh").textContent = `${tt("⏳ Güncelleniyor", "⏳ กำลังอัปเดต")}${prog}`;
    $("#refresh").title = lastLog || tt("Arka planda tüm siteler taranıyor…", "กำลังอัปเดตข้อมูลจากทุกเว็บไซต์…");
    if ((s.done_sources || 0) > lastDoneSources) {
      lastDoneSources = s.done_sources || 0;
      loadCities().then(() => loadCity(false)).catch(() => {});
    }
  } else {
    $("#refresh").disabled = false;
    $("#refresh").textContent = tt("Verileri güncelle", "อัปเดตข้อมูล");
    $("#refresh").title = tt("Bütün kaynaklardan şehrin ilanlarını yeniden çek", "ดึงประกาศของเมืองจากทุกแหล่งใหม่");
    lastDoneSources = 0;
    if (polling) {
      clearInterval(polling); polling = null;
      condoKey = "";  // ilan yenilemesi condo taramasını da başlatabilir; bitince bina verisi tazelenir
      mallsCity = "";
      await loadCities(); await loadCity(false);
    }
  }
}
$("#refresh").onclick = async () => {
  $("#refresh").disabled = true;
  $("#refresh").textContent = tt("⏳ Başlatılıyor…", "⏳ กำลังเริ่ม…");
  await api("/api/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: $("#city").value }) });
  if (!polling) polling = setInterval(poll, 2000);
  poll();
};

// ------------------------------------------------------------------ katmanlar
// OSM katmanları ilk açılışta sunucudan alınır (sunucu 30 gün saklar); şehir değişince yeniden kurulur.
for (const [n, z] of [["nufus", 345], ["crowd", 350], ["districts", 355], ["roads", 360], ["rail", 370], ["names", 650]]) map.createPane(n).style.zIndex = z;
map.getPane("names").style.pointerEvents = "none";
const ROAD_COL = { motorway: "#c2255c", trunk: "#e8590c", primary: "#f08c00", secondary: "#a6912b" };
const NOK_COL = { avm: "#c2255c", istasyon_cikis: "#7b2cbf", otel: "#1971c2", ofis: "#495057", gece: "#e8590c",
  park: "#2f9e44", kavsak: "#c92a2a", skywalk: "#0c8599", diger: "#868e96" };
const NOK_TR = bi({ avm: ["AVM", "ห้างสรรพสินค้า"], istasyon_cikis: ["İstasyon çıkışı", "ทางออกสถานี"], otel: ["Otel", "โรงแรม"],
  ofis: ["Ofis binası", "อาคารสำนักงาน"], gece: ["Gece hayatı", "สถานบันเทิงกลางคืน"], park: ["Park", "สวนสาธารณะ"],
  kavsak: ["Kavşak", "ทางแยก"], skywalk: ["Skywalk", "สกายวอล์ก"], diger: ["Diğer", "อื่นๆ"] });
const LAYER_TR = bi({ rail: ["Raylı hatlar", "เส้นทางรถไฟฟ้า"], roads: ["Ana caddeler", "ถนนสายหลัก"], districts: ["Bölgeler", "เขต"],
  crowd: ["Kalabalık", "ความหนาแน่นคน"], crowd_bkk: ["Kalabalık (tüm Bangkok)", "ความหนาแน่นคน (ทั่วกรุงเทพฯ)"],
  noktalar: ["Önemli noktalar", "จุดสำคัญ"], nufus: ["Nüfus yoğunluğu", "ความหนาแน่นประชากร"] });
const ROAD_TH = { motorway: "ทางด่วน", trunk: "ถนนสายหลักใหญ่", primary: "ถนนสายหลัก", secondary: "ถนนสายรอง" };
const noteOf = (g) => typeof g.note === "function" ? g.note() : g.note || "";
// nüfus: açık mavi (5.000 kişi/km²'nin altı) → koyu lacivert (25.000+); puandaki ölçekle aynı
function popCol(p) {
  const t = Math.max(0, Math.min(1, Math.log10(Math.max(p, 1) / 5000) / Math.log10(5)));
  const a = [207, 226, 255], b = [8, 48, 107];
  return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * t)).join(",")})`;
}
// açık sarı → sarı → turuncu → çok koyu turuncu
const CROWD_STOPS = [[0, [255, 240, 150]], [0.35, [255, 200, 40]], [0.65, [245, 120, 10]], [0.85, [200, 70, 0]], [1, [120, 35, 0]]];
function crowdCol(v) {
  let i = 1;
  while (i < CROWD_STOPS.length - 1 && v > CROWD_STOPS[i][0]) i++;
  const [a, ca] = CROWD_STOPS[i - 1], [b, cb] = CROWD_STOPS[i], t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * t)).join(",")})`;
}
const LAY = {}, LOADING = new Set(), NOTES = {};
const layerOn = {};

function showNotes() { $("#layernote").innerHTML = Object.values(NOTES).filter(Boolean).join("<br>"); }

async function buildLayer(kind, city) {
  const d = await api(`/api/layers?city=${city}&kind=${kind}`);
  if (d.error) throw new Error(d.error);
  const g = L.layerGroup();
  if (kind === "rail") {
    const rr = L.canvas({ pane: "rail" });
    for (const l of d.lines) L.polyline(l.pts, { color: l.color, weight: 4, opacity: 0.85, renderer: rr, pane: "rail" })
      .bindTooltip(esc(l.name), { sticky: true }).addTo(g);
  } else if (kind === "roads") {
    const rr = L.canvas({ pane: "roads", tolerance: 4 });
    for (const x of d.roads) {
      const tip = () => `<b>${esc(x.name || tt("adsız", "ไม่มีชื่อ"))}</b><br>${esc(tt(d.labels[x.cls], ROAD_TH[x.cls]) || x.cls)}`
        + (x.oneway ? tt(" · tek yönlü şerit (refüjlü caddede her yön ayrı çizilir)", " · เดินรถทางเดียว (ถนนที่มีเกาะกลางวาดแยกแต่ละทิศ)") : tt(" · çift yön", " · สองทิศทาง"))
        + (x.lanes ? ` · ${esc(x.lanes)} ${tt("şerit", "ช่องจราจร")}` : "");
      L.polyline(x.pts, { color: ROAD_COL[x.cls] || "#888", weight: d.widths[x.cls] || 2, opacity: 0.6, renderer: rr, pane: "roads" })
        .bindTooltip(tip, { sticky: true }).addTo(g);
    }
    g.labels = roadLabels(d.roads);
  } else if (kind === "districts") {
    const rr = L.canvas({ pane: "districts" });
    for (const pts of d.lines) L.polyline(pts, { color: "#5c636a", weight: 1.5, dashArray: "6 5", opacity: 0.7, renderer: rr, pane: "districts", interactive: false }).addTo(g);
    const small = L.layerGroup(), tiny = L.layerGroup(), seen = new Set();
    for (const b of d.labels) {
      if (seen.has(b.name)) continue;
      seen.add(b.name);
      const big = b.kind === "khet";
      L.marker([b.lat, b.lng], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: "dlabel" + (big ? " big" : ""), html: `<span>${esc(b.name)}</span>`, iconSize: [0, 0] }) })
        .addTo(big ? g : b.kind === "neighbourhood" ? tiny : small);
    }
    g.small = small; g.tiny = tiny;
  } else if (kind === "crowd" || kind === "crowd_bkk") {
    const rr = L.canvas({ pane: "crowd" });
    for (const [la, ln, v] of d.cells) L.rectangle([[la, ln], [la + d.dlat, ln + d.dlng]],
      { stroke: false, fillColor: crowdCol(v), fillOpacity: 0.22 + 0.4 * v, renderer: rr, pane: "crowd", interactive: false }).addTo(g);
    g.note = () => `<span class="sw crowd"></span> ` + tt(`${kind === "crowd" ? "Merkez (Asok–Nana ±8 km)" : "Tüm Bangkok"}: açık sarı = kapsamın ilk %30'u, çok koyu turuncu = en yoğun %1'i. ${esc(d.note || "")}`,
      `${kind === "crowd" ? "ใจกลาง (Asok–Nana ±8 กม.)" : "ทั่วกรุงเทพฯ"}: เหลืองอ่อน = 30% แรกของพื้นที่ครอบคลุม, ส้มเข้มมาก = หนาแน่นที่สุด 1% ค่าประมาณ: ความหนาแน่นร้านค้า/ร้านอาหาร/โรงแรม/สำนักงานจาก OSM + ความใกล้สถานี ไม่ใช่การนับคนเดินเท้าจริง`);
  } else if (kind === "nufus") {
    const rr = L.canvas({ pane: "nufus" });
    for (const [la, ln, p] of d.cells) L.rectangle([[la, ln], [la + d.step, ln + d.step]],
      { stroke: false, fillColor: popCol(p), fillOpacity: 0.45, renderer: rr, pane: "nufus" })
      .bindTooltip(() => `${fmt(p)} ${tt("kişi/km²", "คน/ตร.กม.")}`, { sticky: true }).addTo(g);
    g.note = () => `<span class="sw nufus"></span> ` + tt(`Açık mavi = 5.000 kişi/km² altı, lacivert = 25.000+. ${esc(d.note || "")}`,
      "ฟ้าอ่อน = ต่ำกว่า 5,000 คน/ตร.กม., น้ำเงินเข้ม = 25,000+ ประชากรที่อาศัยอยู่ (WorldPop 2020, 1 กม.) เป็นประชากรกลางคืน ไม่ใช่การสัญจรเท้ากลางวัน");
  } else if (kind === "noktalar") {
    if (!d.points.length) g.note = () => tt("Önemli noktalar yalnız Bangkok (Nana–Asok) için araştırıldı.", "จุดสำคัญสำรวจไว้เฉพาะกรุงเทพฯ (Nana–Asok)");
    for (const p of d.points) L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2, fillColor: NOK_COL[p.kind] || "#868e96", fillOpacity: 1 })
      .bindTooltip(esc(p.name))
      .bindPopup(() => `<b>${esc(p.name)}</b> <span class="tag src">${esc(NOK_TR[p.kind] || p.kind)}</span><br>${esc(p.note || "")}`).addTo(g);
  }
  return g;
}

// Cadde adı yol boyunca, yola paralel yazılır. Yakınlığa göre üç sıklık: z13 seyrek, z15 orta, z16+ sık.
// Refüjlü caddede iki yön ayrı çizildiği için aynı ad yakında bir kez yazılır.
const ROAD_LBL = [[13, 2600, ["motorway", "trunk", "primary"]], [15, 1100, ["motorway", "trunk", "primary", "secondary"]],
  [16, 550, ["motorway", "trunk", "primary", "secondary"]]];
function roadLabels(roads) {
  return ROAD_LBL.map(([z, gap, cls]) => {
    const grp = L.layerGroup(), placed = {};
    for (const x of roads) {
      // İngilizce adı olmayan (yalnız Tayca) cadde yazılmaz; çizgisi ve tooltip'i kalır
      if (!x.name || !cls.includes(x.cls) || /[฀-๿]/.test(x.name)) continue;
      const mine = placed[x.name] || (placed[x.name] = []);
      const segs = [];
      for (let i = 1; i < x.pts.length; i++) segs.push([x.pts[i - 1], x.pts[i], hav(x.pts[i - 1][0], x.pts[i - 1][1], x.pts[i][0], x.pts[i][1])]);
      // OSM caddeyi çoğu kez kısa parçalara böler: aralıktan kısa parça en uzun kesitinden aday verir
      const total = segs.reduce((t, q) => t + q[2], 0), cand = [];
      if (total < gap) { const best = segs.reduce((m, q) => (q[2] > m[2] ? q : m), segs[0]); if (best) cand.push(best); }
      else { let run = gap / 2; for (const q of segs) { run += q[2]; if (run >= gap && q[2] >= 25) { cand.push(q); run = 0; } } }
      for (const [a, b, seg] of cand) {
        if (seg < 25) continue;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (mine.some((q) => hav(q[0], q[1], m[0], m[1]) < gap)) continue;
        mine.push(m);
        let ang = Math.atan2(-(b[0] - a[0]), (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180)) * 180 / Math.PI;
        if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
        L.marker(m, { interactive: false, keyboard: false, pane: "names", icon: L.divIcon({ className: "rlabel " + x.cls, iconSize: [0, 0],
          html: `<span style="transform:translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)">${esc(x.name)}</span>` }) }).addTo(grp);
      }
    }
    grp.minZoom = z;
    return grp;
  });
}
function roadLabelSync() {
  const g = LAY.roads && LAY.roads.group, z = map.getZoom();
  if (!g || !g.labels) return;
  const on = map.hasLayer(g);
  // yalnız o yakınlığa uyan sıklık görünür
  const pick = [...g.labels].reverse().find((l) => z >= l.minZoom);
  for (const l of g.labels) if (on && l === pick) l.addTo(map); else l.remove();
}
// BTS/MRT/ARL adları uzaklaşınca kaybolmaz, yakınlığa göre küçülür; banliyö treni (SRT) yalnız z16+.
// İlanlar z15 altında fiyat balonu yerine küçük nokta olur; harita okunur kalır.
function stationLabelSync() {
  const on = map.hasLayer(stationLayer), z = map.getZoom();
  if (on) stationLabels.addTo(map); else stationLabels.remove();
  if (on && z >= 16) minorLabels.addTo(map); else minorLabels.remove();
  const el = map.getContainer();
  el.classList.toggle("far", z < 15);
  const scale = z >= 13 ? 1 : z === 12 ? 0.82 : z === 11 ? 0.68 : 0.56;
  el.style.setProperty("--slabel-scale", String(scale));
}
map.on("zoomend", () => { roadLabelSync(); stationLabelSync(); });

function districtLabels() {
  const g = LAY.districts && LAY.districts.group;
  if (!g || !g.small) return;
  // khet adı hep, semt adı z14+, mahalle adı z16+ (429 mahalle adı z14'te haritayı kaplıyordu)
  const on = map.hasLayer(g), z = map.getZoom();
  if (on && z >= 14) g.small.addTo(map); else g.small.remove();
  if (on && z >= 16) g.tiny.addTo(map); else g.tiny.remove();
}
map.on("zoomend", districtLabels);
// Kalabalık 120 m'lik hücrelerden kurulur; bulanıklık hücre boyuna göre ayarlanır, kareli görünüm yerine ısı haritası olur.
function crowdBlur() {
  const mpp = 156543.03 * Math.cos(map.getCenter().lat * Math.PI / 180) / 2 ** map.getZoom();
  map.getPane("crowd").style.filter = `blur(${Math.min(60, Math.round(0.45 * 120 / mpp))}px)`;
}
map.on("zoomend", crowdBlur); crowdBlur();

async function ensureLayer(inp, city) {
  const k = inp.value, key = k + "|" + city;
  if (LOADING.has(key)) return;
  LOADING.add(key); inp.parentElement.classList.add("loading");
  NOTES[k] = `${LAYER_TR[k]} ${tt("yükleniyor… (ilk kez çekiliyorsa OSM'den 30–150 sn)", "กำลังโหลด… (ครั้งแรกดึงจาก OSM 30–150 วินาที)")}`; showNotes();
  try {
    const g = await buildLayer(k, city);
    LAY[k] = { group: g, city };
    NOTES[k] = noteOf(g);
  } catch (e) {
    NOTES[k] = `<span class="err">${LAYER_TR[k]} ${tt("alınamadı", "โหลดไม่สำเร็จ")}: ${esc(e.message)}</span>`;
  } finally {
    LOADING.delete(key); inp.parentElement.classList.remove("loading");
  }
  showNotes(); syncLayers();
}

function syncLayers() {
  const city = $("#city").value;
  for (const inp of document.querySelectorAll("#layers input")) {
    const k = inp.value, on = inp.checked;
    layerOn[k] = on;
    if (k === "stations" || k === "pins") { const lg = k === "stations" ? stationLayer : pinLayer; if (on) lg.addTo(map); else lg.remove(); continue; }
    const cur = LAY[k];
    if (cur && (!on || cur.city !== city)) {
      cur.group.remove();
      if (cur.group.small) { cur.group.small.remove(); cur.group.tiny.remove(); }
      if (cur.group.labels) for (const l of cur.group.labels) l.remove();
    }
    if (cur && cur.city !== city) delete LAY[k];
    if (!on) { if (!LOADING.has(k + "|" + city)) NOTES[k] = ""; continue; }
    if (LAY[k]) { LAY[k].group.addTo(map); NOTES[k] = noteOf(LAY[k].group); } else ensureLayer(inp, city);
  }
  districtLabels(); showNotes();
  roadLabelSync(); stationLabelSync();
}
$("#layers").addEventListener("input", syncLayers);
$("#sttoggle")?.addEventListener("click", () => {
  const sub = $("#stsub");
  if (!sub) return;
  sub.hidden = !sub.hidden;
  $("#sttoggle")?.classList.toggle("open", !sub.hidden);
});
$("#stclose")?.addEventListener("click", () => {
  if ($("#stsub")) $("#stsub").hidden = true;
  $("#sttoggle")?.classList.remove("open");
});
$("#stlines")?.addEventListener("input", () => {
  renderStations();
  syncLayers();
});
$("#stall")?.addEventListener("click", () => {
  for (const inp of document.querySelectorAll("#stlines input")) inp.checked = true;
  renderStations();
  syncLayers();
});
$("#stnone")?.addEventListener("click", () => {
  for (const inp of document.querySelectorAll("#stlines input")) inp.checked = false;
  renderStations();
  syncLayers();
});

// ------------------------------------------------------------------ bölge danışmanı
// Yanıt sunucuda yerel `claude` CLI'den gelir (web araması açık); takip soruları aynı oturumu sürdürür.
let chatSid = null, chatBusy = false;
function md(s) {
  let h = esc(s);
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/^#{1,4}\s*(.+)$/gm, "<b>$1</b>").replace(/`([^`\n]+)`/g, "<code>$1</code>");
  return h.replace(/\n/g, "<br>");
}
function addMsg(cls, html) {
  const el = document.createElement("div");
  el.className = "msg " + cls; el.innerHTML = html;
  $("#chatlog").appendChild(el); el.scrollIntoView({ block: "nearest" });
  return el;
}
async function ask() {
  const q = $("#chatq").value.trim();
  if (!q || chatBusy) return;
  chatBusy = true; $("#chatsend").disabled = true; $("#chatq").value = "";
  addMsg("u", esc(q));
  const wait = addMsg("a wait", `${tt("Düşünüyor… (web'de arıyor olabilir)", "กำลังคิด… (อาจกำลังค้นเว็บ)")} <span class="t">0 ${tt("sn", "วิ")}</span>`);
  const t0 = Date.now(), tick = setInterval(() => { wait.querySelector(".t").textContent = Math.round((Date.now() - t0) / 1000) + tt(" sn", " วิ"); }, 1000);
  const body = { q, session_id: chatSid, city: $("#city").value, types: selTypes().join(","), sel: selId, lang: LANG };
  if (zone) Object.assign(body, { lat: zone.c.lat, lng: zone.c.lng, r: zone.r, poly: zone.pts });  // r: alanı kapsayan çember
  try {
    const d = await api("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (d.session_id) chatSid = d.session_id;
    wait.className = "msg a";
    wait.innerHTML = d.error ? `<span class="err">${tt("Yanıt alınamadı", "ไม่ได้รับคำตอบ")}: ${esc(d.error)}</span>`
      : md(d.answer) + `<div class="muted meta">${Math.round((Date.now() - t0) / 1000)} ${tt("sn", "วิ")}${d.turns ? " · " + d.turns + tt(" adım", " ขั้นตอน") : ""}</div>`;
  } catch (e) {
    wait.className = "msg a"; wait.innerHTML = `<span class="err">${tt("Sunucuya ulaşılamadı", "ติดต่อเซิร์ฟเวอร์ไม่ได้")}: ${esc(e.message)}</span>`;
  } finally {
    clearInterval(tick); chatBusy = false; $("#chatsend").disabled = false;
  }
}
$("#chatsend").onclick = ask;
$("#chatq").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
$("#chatnew").onclick = () => { chatSid = null; $("#chatlog").innerHTML = ""; };

// ------------------------------------------------------------------ olaylar
$("#list").addEventListener("click", (e) => {
  if (e.target.id === "more" || e.target.id === "moreall") {
    LIST_N = e.target.id === "more" ? LIST_N + 200 : Infinity;
    return render(true);
  }
});
let hovId = null;
function setPinHover(id) {
  const next = id || null;
  if (hovId === next) return;
  if (hovId) {
    const prev = markers.get(hovId);
    const el = prev && prev.getElement();
    if (el) el.querySelector(".pin")?.classList.remove("hov");
    if (prev && prev._baseZ !== undefined) prev.setZIndexOffset(prev._baseZ);
  }
  hovId = next;
  if (hovId) {
    const cur = markers.get(hovId);
    const el = cur && cur.getElement();
    if (el) el.querySelector(".pin")?.classList.add("hov");
    if (cur) {
      if (cur._baseZ === undefined) cur._baseZ = cur.options.zIndexOffset || 0;
      cur.setZIndexOffset(9999);
    }
  }
}
async function loadMalls() {
  const city = $("#city")?.value || "bangkok";
  try {
    const d = await api(`/api/malls?city=${encodeURIComponent(city)}`);
    MALLS = (d && d.malls) || [];
    mallsKey = city;
    MALL_UNITS.clear();
    for (const m of MALLS) {
      for (const u of m.inside || []) MALL_UNITS.set(u.id, u);
      for (const u of m.nearby || []) if (!MALL_UNITS.has(u.id)) MALL_UNITS.set(u.id, u);
    }
  } catch (e) {
    MALLS = [];
    $("#summary").textContent = `${tt("AVM listesi alınamadı", "โหลดรายชื่อห้างไม่สำเร็จ")}: ${e.message}`;
  }
}

function showMallFootprint(m) {
  mallFootprintLayer.clearLayers();
  if (!m) return;
  L.circle([m.lat, m.lng], {
    radius: m.radius_m || 130,
    color: m.n_inside > 0 ? "#059669" : "#7c3aed",
    weight: 2.5,
    fillColor: m.n_inside > 0 ? "#10b981" : "#8b5cf6",
    fillOpacity: 0.12,
    dashArray: "5 4",
    interactive: false,
  }).addTo(mallFootprintLayer);
}

function syncMallTabBtn() {
  if ($("#mallbacktop")) $("#mallbacktop").hidden = !(viewTab === "malls" && selMallId);
  if ($("#mallstab")) {
    $("#mallstab").textContent = viewTab === "malls" && selMallId
      ? tt("🛍 ✕ AVM'den Çık", "🛍 ✕ ออกจากห้าง")
      : tt("🛍 AVM'ler", "🛍 ห้าง (Mall)");
  }
}

function closeMall() {
  clearTimeout(mallHovTimer);
  map.stop();
  map.closePopup();
  selMallId = null;
  lastHovMallId = null;
  mallFootprintLayer.clearLayers();
  syncMallTabBtn();
  renderMalls(false);
}

function focusMallOnHover(mallId) {
  if (selMallId) return;
  const m = (MALLS || []).find((x) => x.id === mallId);
  if (!m) return;
  setPinHover("mall:" + m.id);
  showMallFootprint(m);
  if (lastHovMallId === mallId) return;
  lastHovMallId = mallId;
  clearTimeout(mallHovTimer);
  mallHovTimer = setTimeout(() => {
    if (selMallId) return;
    map.stop();
    map.flyTo([m.lat, m.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.35 });
    const mk = markers.get("mall:" + m.id);
    if (mk && mk.openTooltip) mk.openTooltip();
  }, 110);
}

function openMall(mallId, fly = true) {
  const m = (MALLS || []).find((x) => x.id === mallId);
  if (!m) return;
  clearTimeout(mallHovTimer);
  map.stop();
  selMallId = m.id;
  mallScope = m.n_inside > 0 ? "all" : "nearby";
  syncMallTabBtn();
  renderMalls(fly);
  $("#summary")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function filteredMalls() {
  const q = normCondoStr($("#mallq")?.value || "");
  const onlyWithUnits = !!$("#mallonly")?.checked && !q;
  const sortMode = $("#mallsort")?.value || "in_first";
  const out = [];
  for (const m of MALLS || []) {
    if (onlyWithUnits && !m.n_total) continue;
    if (q) {
      const hay = normCondoStr(`${m.name} ${m.zone || ""} ${m.station?.name || ""}`);
      if (!hay.includes(q) && matchCondoQuery({ name: m.name, slug: `${m.id} ${m.zone || ""}` }, q) <= 0) continue;
    }
    out.push(m);
  }
  if (sortMode === "total") {
    out.sort((a, b) => b.n_total - a.n_total || b.n_inside - a.n_inside || b.best_score - a.best_score);
  } else if (sortMode === "score") {
    out.sort((a, b) => b.best_score - a.best_score || b.n_inside - a.n_inside || b.n_total - a.n_total);
  } else if (sortMode === "name") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => (b.n_inside > 0 ? 1 : 0) - (a.n_inside > 0 ? 1 : 0) || b.n_inside - a.n_inside || (b.inside_best_score || 0) - (a.inside_best_score || 0) || b.n_total - a.n_total || b.best_score - a.best_score);
  }
  return out;
}

function spreadMallUnitCoords(m, units) {
  // Aynı koordinata (veya AVM merkezinin tam üstüne ≤15m) düşen ilan pinlerini halka halinde açar;
  // böylece 5 ilanın 5'i de haritada üst üste binmeden tek tek görünür ve tıklanabilir.
  const groups = new Map();
  const cosLat = Math.cos(m.lat * Math.PI / 180);
  for (const r of units) {
    const nearCenter = hav(m.lat, m.lng, r.lat, r.lng) <= 18;
    const baseLat = nearCenter ? m.lat : r.lat;
    const baseLng = nearCenter ? m.lng : r.lng;
    const key = `${baseLat.toFixed(4)},${baseLng.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, { baseLat, baseLng, nearCenter, items: [] });
    groups.get(key).items.push(r);
  }
  const coords = new Map();
  for (const g of groups.values()) {
    const n = g.items.length;
    if (n === 1 && !g.nearCenter) {
      coords.set(g.items[0].id, { lat: g.items[0].lat, lng: g.items[0].lng, shifted: false });
      continue;
    }
    g.items.forEach((r, idx) => {
      const ring = Math.floor(idx / 8);
      const countInRing = Math.min(8, n - ring * 8);
      const posInRing = idx % 8;
      const radM = (g.nearCenter ? 28 : 18) + ring * 18;
      const ang = (2 * Math.PI * posInRing) / Math.max(1, countInRing) - Math.PI / 4;
      const dLat = (radM * Math.sin(ang)) / 110574;
      const dLng = (radM * Math.cos(ang)) / (111320 * cosLat);
      coords.set(r.id, {
        lat: g.baseLat + dLat,
        lng: g.baseLng + dLng,
        origLat: g.baseLat,
        origLng: g.baseLng,
        shifted: true,
      });
    });
  }
  return coords;
}

function renderMalls(fly = false) {
  pinLayer.clearLayers();
  markers.clear();
  syncMallTabBtn();
  if (!MALLS) {
    $("#list").innerHTML = "";
    $("#summary").textContent = tt("AVM listesi yükleniyor…", "กำลังโหลดรายชื่อห้าง…");
    return;
  }

  // 1) Bir AVM'ye tıklandıysa: O AVM'nin içindeki/çevresindeki kiralıkları puan sırasıyla göster
  if (selMallId) {
    const m = MALLS.find((x) => x.id === selMallId);
    if (!m) {
      selMallId = null;
      syncMallTabBtn();
      return renderMalls(false);
    }
    showMallFootprint(m);
    const units = mallScope === "inside" ? (m.inside || [])
      : mallScope === "nearby" ? (m.nearby || [])
      : [...(m.inside || []), ...(m.nearby || [])];

    const stTxt = m.station ? `🚇 ${lineTxt(m.station.line)}${esc(m.station.name)} ${fmt(m.station.m)} m` : "";
    const ll = `${m.lat},${m.lng}`;
    $("#summary").innerHTML = `<b>🛍 ${esc(m.name)}</b> · ${tt(`${units.length} kiralık ilan puan sırasıyla listeleniyor`, `แสดงประกาศเช่า ${units.length} รายการเรียงตามคะแนน`)} `
      + `<button type="button" class="mini saved-close-btn" data-mall-back="1" style="margin-left:6px">✕ ${tt("AVM'den Çık", "ออกจากห้าง")}</button>`;

    // AVM merkez etiketi (tıklayınca AVM'den çıkar)
    const mIcon = L.divIcon({
      className: "pinwrap",
      html: `<span class="pin mpin has-in" title="${tt("Tıkla: Tüm AVM'ler listesine dön", "คลิกเพื่อกลับไปรายชื่อห้าง")}">🛍 ${esc(m.name.slice(0, 22))} ✕</span>`,
    });
    L.marker([m.lat, m.lng], { icon: mIcon, zIndexOffset: 2200 })
      .on("click", () => closeMall())
      .addTo(pinLayer);

    // Kiralık ilan pinleri (üst üste binenler halka şeklinde açılır)
    const coordMap = spreadMallUnitCoords(m, units);
    const boundsPts = [[m.lat, m.lng]];
    units.forEach((r, idx) => {
      const pos = coordMap.get(r.id) || { lat: r.lat, lng: r.lng, shifted: false };
      boundsPts.push([pos.lat, pos.lng]);
      if (pos.shifted) {
        L.polyline([[pos.origLat, pos.origLng], [pos.lat, pos.lng]], {
          color: "#059669",
          weight: 1.5,
          dashArray: "3 3",
          opacity: 0.75,
          interactive: false,
        }).addTo(mallFootprintLayer);
      }
      const label = r.price_thb ? `#${idx + 1} ฿${kfmt(r.price_thb)} · ${r.score}p` : `#${idx + 1} · ${r.score}p`;
      const icon = L.divIcon({
        className: "pinwrap",
        html: `<span class="pin${r.firsat ? " deal" : ""}${r.id === selId ? " sel" : ""}">${r.firsat ? "★ " : ""}${label}</span>`,
      });
      const mk = L.marker([pos.lat, pos.lng], { icon, zIndexOffset: 3500 - idx, riseOnHover: true })
        .bindPopup(() => popup(r), { maxWidth: 325, minWidth: window.innerWidth <= 820 ? 240 : 295, autoPanPadding: [10, 10] })
        .on("click", () => select(r.id, false));
      mk.addTo(pinLayer);
      markers.set(r.id, mk);
    });

    if (fly) {
      if (window.innerWidth <= 820 && mobView === "list") setMobView("split");
      map.stop();
      if (boundsPts.length >= 2) {
        map.fitBounds(boundsPts, { padding: [55, 55], maxZoom: 17, animate: true, duration: 0.4 });
      } else {
        map.setView([m.lat, m.lng], 17);
      }
    }

    const headHtml = `<li class="mall-head">
      <div class="mall-head-top">
        <button type="button" class="mall-back-btn" data-mall-back="1">← ${tt("Tüm AVM'ler Listesine Dön (AVM'den Çık)", "กลับไปรายชื่อห้างทั้งหมด")}</button>
        <span class="muted">${esc(m.zone || "")}${stTxt ? ` · ${stTxt}` : ""}</span>
      </div>
      <div class="big" style="font-size:15px"><b>🛍 ${esc(m.name)}</b></div>
      <div class="mall-scopes">
        <button type="button" class="mall-scope-btn${mallScope === "all" ? " on" : ""}" data-mall-scope="all">🏢+📍 ${tt(`Tümü (${m.n_total})`, `ทั้งหมด (${m.n_total})`)}</button>
        <button type="button" class="mall-scope-btn${mallScope === "inside" ? " on" : ""}" data-mall-scope="inside">🏢 ${tt(`AVM İçi (${m.n_inside})`, `ในห้าง (${m.n_inside})`)}</button>
        <button type="button" class="mall-scope-btn${mallScope === "nearby" ? " on" : ""}" data-mall-scope="nearby">📍 ${tt(`Çevresi ≤250m (${m.n_nearby})`, `รอบห้าง ≤250ม. (${m.n_nearby})`)}</button>
      </div>
      <div class="m" style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.name + " Bangkok")}" target="_blank" rel="noopener">📍 Google Maps</a>
        <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}" target="_blank" rel="noopener">🌐 360° Street View</a>
      </div>
    </li>`;

    const unitsHtml = units.length
      ? units.map((r, i) => {
          const ex = r.extra || {}, im = gallery(r)[0], kat = KAT_TR[ex.kat];
          const relBadge = r.mall_rel === "inside"
            ? `<span class="tag mall-in">🏢 ${tt("AVM İçi", "ในห้าง")}</span>`
            : `<span class="tag mall-near">📍 ${tt(`AVM Çevresi (${r.mall_dist_m} m)`, `รอบห้าง (${r.mall_dist_m} ม.)`)}</span>`;
          const sites = (r.also || []).length ? `<span class="tag src">${r.also.length + 1} ${tt("sitede", "เว็บไซต์")}</span>` : "";
          const srcLabel = SRC_TR[r.source] || r.source || "İlan";
          const directLink = r.url
            ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="mall-unit-link" title="${tt("İlan sayfasını yeni sekmede aç", "เปิดหน้าประกาศในแท็บใหม่")}">🔗 ${esc(srcLabel)}'da Aç ↗</a>`
            : "";
          return `<li data-id="${esc(r.id)}" class="${r.firsat ? "deal" : ""}${r.id === selId ? " sel" : ""}">
            ${im ? `<img loading="lazy" src="${esc(im.url)}" alt="">` : `<img alt="">`}
            <div>
              <div class="big"><span class="rank">${i + 1}.</span> <span class="score" data-score-shop="${esc(r.id)}" title="${tt("Tıkla: Neyden kaç puan kazandı / kesildi detaylı gör", "คลิกเพื่อดูรายละเอียดคะแนน")}" style="background:${scoreColor(r.score)}">${r.score} ${tt("puan", "คะแนน")}</span> <b>฿${fmt(r.price_thb)}</b>/${tt("ay", "เดือน")} · <b>${r.size_m2 ? fmt(r.size_m2) + " m²" : "m² ?"}</b>${directLink}</div>
              <div style="margin:2px 0">${relBadge}${kat ? `<span class="tag ${kat[0]}">${kat[1]}</span>` : ""}${r.firsat ? `<span class="tag deal">★ ${tt("Fırsat", "ดีล")}</span>` : ""}${confTag(r)}${sites}</div>
              <div class="m">${r.ppsm ? `${fmt(r.ppsm)} ฿/m²` : ""}${r.deal != null ? ` · ${tt("emsale göre", "เทียบตลาด")} <b>${r.deal >= 0 ? tt("%" + Math.round(r.deal * 100) + " ucuz", "ถูกกว่า " + Math.round(r.deal * 100) + "%") : tt("%" + Math.abs(Math.round(r.deal * 100)) + " pahalı", "แพงกว่า " + Math.abs(Math.round(r.deal * 100)) + "%")}</b>` : ""}${r.station ? ` · 🚇 ${esc(r.station.name)} ${fmt(r.station.m)} m` : ""}</div>
              <div class="t">${esc(r.title)}</div>
              ${partsTxt(r)}
            </div>
          </li>`;
        }).join("")
      : `<li class="more"><span class="muted">${tt("Bu kapsamda şu an kiralık ilan bulunmuyor. Üstteki sekmeden 'Tümü' veya 'Çevresi ≤250m' seçebilirsiniz.", "ไม่มีประกาศในหมวดนี้ ลองเลือก 'ทั้งหมด' หรือ 'รอบห้าง'")}</span></li>`;

    $("#list").innerHTML = headHtml + unitsHtml;
    return;
  }

  // 2) Genel AVM Listesi Görünümü (Üzerine gelince haritada AVM'ye götürür, tıklayınca içindekileri açar)
  mallFootprintLayer.clearLayers();
  const rows = filteredMalls();
  const withIn = rows.filter((m) => m.n_inside > 0).length;
  const withAny = rows.filter((m) => m.n_total > 0).length;
  $("#summary").textContent = tt(
    `🛍 ${rows.length} AVM listeleniyor (${withIn} AVM'nin içinde, toplam ${withAny} AVM'de aktif kiralık var) — üzerine gelince harita oraya gider, tıklayınca kiralıklar açılır.`,
    `🛍 แสดง ${rows.length} ห้าง (มีประกาศในห้าง ${withIn} แห่ง, รวม ${withAny} แห่ง) — ชี้เพื่อดูบนแผนที่ คลิกเพื่อดูประกาศเช่า`
  );

  rows.forEach((m, idx) => {
    const cntTxt = m.n_total > 0 ? ` (${m.n_total})` : "";
    const cls = m.n_inside > 0 ? " has-in" : m.n_total > 0 ? "" : " empty";
    const icon = L.divIcon({
      className: "pinwrap",
      html: `<span class="pin mpin${cls}">🛍 ${esc(m.name.slice(0, 18))}${cntTxt}</span>`,
    });
    const tip = `<b>🛍 ${esc(m.name)}</b><br>${tt("AVM İçi", "ในห้าง")}: <b>${m.n_inside}</b> · ${tt("Çevresi (≤250m)", "รอบห้าง")}: <b>${m.n_nearby}</b>${m.best_score ? `<br>${tt("En yüksek puan", "คะแนนสูงสุด")}: <b>${m.best_score}</b>` : ""}`;
    const mk = L.marker([m.lat, m.lng], { icon, zIndexOffset: m.n_inside > 0 ? 2800 - idx : 1500 - idx, riseOnHover: true })
      .bindTooltip(tip, { direction: "top", offset: [0, -8] })
      .on("click", () => openMall(m.id, true));
    mk.addTo(pinLayer);
    markers.set("mall:" + m.id, mk);
  });

  $("#list").innerHTML = rows.map((m, i) => {
    const inBadge = m.n_inside > 0
      ? `<span class="tag mall-in">🏢 ${m.n_inside} ${tt("AVM içi kiralık", "ในห้าง")}</span>`
      : "";
    const nearBadge = m.n_nearby > 0
      ? `<span class="tag mall-near">📍 ${m.n_nearby} ${tt(m.n_inside > 0 ? "çevrede (≤250m)" : "kiralık (AVM çevresi ≤250m)", "รอบห้าง ≤250ม.")}</span>`
      : "";
    const emptyBadge = !m.n_total
      ? `<span class="tag kat2">${tt("Aktif ilan yok", "ไม่มีประกาศ")}</span>`
      : "";
    const scoreBadge = m.best_score > 0
      ? `<span class="score" style="background:${scoreColor(m.best_score)}" title="${tt("Bu AVM'deki en yüksek kiracı puanı", "คะแนนสูงสุดในห้างนี้")}">${tt("En iyi", "สูงสุด")}: ${m.best_score}p</span>`
      : "";
    const dealBadge = m.deals > 0
      ? `<span class="tag deal">★ ${m.deals} ${tt("fırsat", "ดีล")}</span>`
      : "";
    const stTxt = m.station ? `🚇 ${lineTxt(m.station.line)}${esc(m.station.name)} ${fmt(m.station.m)} m` : "";
    const minTxt = m.min_price ? ` · ${tt("En düşük", "เริ่มต้น")} <b>฿${fmt(m.min_price)}</b>/${tt("ay", "เดือน")}` : "";
    return `<li class="mall-card${m.n_inside > 0 ? " has-in" : m.n_total > 0 ? "" : " empty-mall"}" data-mall-id="${esc(m.id)}">
      <div class="big"><span class="rank">${i + 1}.</span> <b>🛍 ${esc(m.name)}</b> <span class="muted">(${esc(m.zone || "")})</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${scoreBadge}${inBadge}${nearBadge}${emptyBadge}${dealBadge}</div>
      <div class="m">${stTxt}${minTxt}</div>
    </li>`;
  }).join("");
}

$("#mallbacktop")?.addEventListener("click", () => closeMall());
$("#summary")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-mall-back]")) {
    e.preventDefault();
    closeMall();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && viewTab === "malls" && selMallId) {
    closeMall();
  }
});

$("#mallq")?.addEventListener("input", () => {
  if (selMallId) selMallId = null;
  renderMalls(false);
});
$("#mallsort")?.addEventListener("input", () => {
  if (selMallId) selMallId = null;
  renderMalls(false);
});
$("#mallonly")?.addEventListener("input", () => {
  if (selMallId) selMallId = null;
  renderMalls(false);
});

$("#list").addEventListener("click", (e) => {
  const backBtn = e.target.closest("[data-mall-back]");
  if (backBtn) {
    e.preventDefault();
    e.stopPropagation();
    closeMall();
    return;
  }
  const scopeBtn = e.target.closest("[data-mall-scope]");
  if (scopeBtn) {
    e.preventDefault();
    e.stopPropagation();
    mallScope = scopeBtn.dataset.mallScope || "all";
    renderMalls(true);
    return;
  }
  if (e.target.closest("input, select, button, a, label")) return;
  const mallLi = e.target.closest("li[data-mall-id]");
  if (mallLi) {
    openMall(mallLi.dataset.mallId, true);
    return;
  }
  const li = e.target.closest("li[data-id]");
  if (li) select(li.dataset.id);
});
$("#list").addEventListener("mouseover", (e) => {
  const mallLi = e.target.closest("li[data-mall-id]");
  if (mallLi) {
    focusMallOnHover(mallLi.dataset.mallId);
    return;
  }
  const li = e.target.closest("li[data-id]");
  setPinHover(li ? li.dataset.id : null);
});
$("#list").addEventListener("mouseleave", () => {
  clearTimeout(mallHovTimer);
  lastHovMallId = null;
  setPinHover(null);
});
$("#condosug")?.addEventListener("mouseover", (e) => {
  const it = e.target.closest(".sitem[data-slug]");
  setPinHover(it ? it.dataset.slug : null);
});
$("#condosug")?.addEventListener("mouseleave", () => setPinHover(null));
$("#viewtabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  if (b.dataset.tab === "malls" && viewTab === "malls" && selMallId) {
    closeMall();
    return;
  }
  if (b.dataset.tab === "saved" && viewTab === "saved") {
    setViewTab(prevNonSavedTab || "circle");
  } else {
    setViewTab(b.dataset.tab);
  }
});
let typeT = null;
for (const el of ["#onlydeal", "#katf", "#sort"]) $(el).addEventListener("input", () => {
  if (el === "#onlydeal" && viewTab === "circle") circleOnlyDeal = $("#onlydeal").checked;
  render();
});
const FILT = ["#pmin", "#pmax", "#smin", "#smax", "#fbr", "#fbts", "#fage", "#fwall", "#ftraf", "#fupd"];
let condoDefaultFilt = true;  // kullanıcı #pmax/#fupd'a elle dokunmadıysa condo↔dükkân geçişinde otomatik uyarlanır
function updateMobChips() {
  const box = $("#mobchips");
  if (!box) return;
  const isCondo = condoOn() && !selTypes().length;
  const chips = [];
  chips.push(`<span class="mchip mode" data-act="mode">${isCondo ? tt("🏢 Condo (Dükkan'a geç)", "🏢 คอนโด (สลับเป็นร้านค้า)") : tt("🏪 Dükkan (Condo'ya geç)", "🏪 ร้านค้า (สลับเป็นคอนโด)")}</span>`);
  chips.push(`<span class="mchip${viewTab === "saved" ? " mode" : ""}" data-act="saved">⭐ ${tt(`Kayıtlı (${SAVED.length})`, `ที่บันทึก (${SAVED.length})`)}</span>`);
  if (zone) chips.push(`<span class="mchip" data-act="clearzone">📍 ${tt("Çizili alan ✕", "พื้นที่ที่วาด ✕")}</span>`);
  const pmin = $("#pmin")?.value, pmax = $("#pmax")?.value;
  if (pmin || pmax) chips.push(`<span class="mchip" data-act="filt">฿ ${pmin ? kfmt(+pmin) : "0"}–${pmax ? kfmt(+pmax) : "∞"}</span>`);
  const smin = $("#smin")?.value, smax = $("#smax")?.value;
  if (smin || smax) chips.push(`<span class="mchip" data-act="filt">${smin || "0"}–${smax || "∞"} m²</span>`);
  if (isCondo && $("#fbr")?.value) chips.push(`<span class="mchip" data-act="filt">${$("#fbr").selectedOptions[0]?.textContent || ""}</span>`);
  if ($("#fbts")?.value) chips.push(`<span class="mchip" data-act="filt">🚇 ≤${$("#fbts").value}m</span>`);
  if (isCondo && $("#fage")?.value) chips.push(`<span class="mchip" data-act="filt">🏗 ≤${$("#fage").value} ${tt("yaş", "ปี")}</span>`);
  if (isCondo && $("#fwall")?.value) chips.push(`<span class="mchip" data-act="filt">${$("#fwall").selectedOptions[0]?.textContent || ""}</span>`);
  if (isCondo && $("#ftraf")?.value) chips.push(`<span class="mchip" data-act="filt">${$("#ftraf").selectedOptions[0]?.textContent || ""}</span>`);
  if ($("#fupd")?.value) chips.push(`<span class="mchip" data-act="filt">🕒 ${$("#fupd").selectedOptions[0]?.textContent || ""}</span>`);
  box.innerHTML = chips.join("");
}
const filtMark = () => {
  const n = FILT.filter((id) => $(id)?.value).length;
  $("#filters").classList.toggle("on", n > 0);
  if ($("#mobfiltbtn")) {
    $("#mobfiltbtn").textContent = tt(`⚙ Filtre${n ? ` (${n})` : ""}`, `⚙ ตัวกรอง${n ? ` (${n})` : ""}`);
  }
  updateMobChips();
};
for (const el of FILT) $(el)?.addEventListener("input", () => {
  if ((el === "#pmax" || el === "#smin" || el === "#fupd") && !condoOn()) condoDefaultFilt = false;
  filtMark(); clearTimeout(typeT);
  if ((el === "#fwall" || el === "#ftraf") && $(el).value && viewTab === "circle" && !zone && !condoQuery()) {
    setViewTab("deals");
    return;
  }
  typeT = setTimeout(render, (el.startsWith("#f") && el !== "#fage") ? 0 : 250);  // yazarken her tuşta çizme
});
$("#freset").onclick = () => {
  condoDefaultFilt = false;
  for (const id of FILT) if ($(id)) $(id).value = "";
  if ($("#katf")) $("#katf").value = "";
  if (viewTab !== "deals" && $("#onlydeal")) { $("#onlydeal").checked = false; circleOnlyDeal = false; }
  filtMark(); render();
};
// kalabalık modu: eşleşen kalabalık katmanını açar, ötekini kapatır, haritayı bölgeye götürür
$("#fmod").addEventListener("input", () => {
  const m = $("#fmod").value;
  $("#sort").disabled = !!m;  // kalabalık modu kendi sırasını kullanır
  if (m) {
    for (const i of document.querySelectorAll("#layers input")) {
      if (i.value === "crowd") i.checked = m === "asok";
      if (i.value === "crowd_bkk") i.checked = m === "bkk";
    }
    syncLayers();
    if (m === "asok") map.setView(ASOK_NANA, 15); else map.setView([13.745, 100.57], 11);
  }
  if (viewTab !== "deals") setViewTab("deals");
  else render();
});
$("#types").addEventListener("input", async (e) => {
  if (e.target.value === "condo") {
    if (e.target.checked) {
      for (const i of document.querySelectorAll("#types input")) if (i.value !== "condo") i.checked = false;
    }
    return setCondo(e.target.checked);
  }
  if (e.target.checked && condoOn()) {
    const cchk = document.querySelector('#types input[value="condo"]');
    if (cchk) cchk.checked = false;
    CONDO = null; condoKey = "";
    if ($("#condoq")) $("#condoq").value = "";
    if ($("#condosug")) $("#condosug").hidden = true;
  }
  bodyMode();
  render(); loadAnalysis();
});

// ------------------------------------------------------------------ condo: yalnız kiralama (kiracı gözüyle)
// Puan sunucuda (condo_puan.py): kiralık daire → total (0–100) = m² 25 + yaş 25 + istasyon 25 + fiyat 15 + çevre 10.
const BR_TR = { get studio() { return tt("Stüdyo", "สตูดิโอ"); }, one_bedroom: "1+1", two_bedrooms: "2+1", three_bedrooms: "3+1", four_plus: "4+", four_bedrooms: "4+1", five_bedrooms: "5+1", six_bedrooms: "6+1" };
const FOUR_PLUS_BR = new Set(["four_plus", "four_bedrooms", "five_bedrooms", "six_bedrooms"]);
function matchBr(u, br) {
  if (!br) return true;
  const b = u.br || "";
  if (br === "studio") return b === "studio";
  if (br === "one_bedroom") return b === "one_bedroom";
  if (br === "two_bedrooms") return b === "two_bedrooms";
  if (br === "three_bedrooms") return b === "three_bedrooms";
  if (br === "four_plus") return FOUR_PLUS_BR.has(b);
  if (br === "studio_1br") return b === "studio" || b === "one_bedroom";
  if (br === "1br_2br") return b === "one_bedroom" || b === "two_bedrooms";
  if (br === "2plus") return b === "two_bedrooms" || b === "three_bedrooms" || FOUR_PLUS_BR.has(b);
  return true;
}
const scoreCol = (s) => s >= 80 ? "#0b7a2e" : s >= 70 ? "#1a9c3e" : s >= 60 ? "#6aa51d" : s >= 50 ? "#c99200" : "#9aa3ad";
// Fırsat uygunluğu ve fiyat avantajı sunucunun ortak modeliyle belirlenir.
const NOW_Y = new Date().getFullYear();
const pct1 = (x) => (Math.round(x * 10) / 10).toLocaleString(LOC());
const okUnit = (u) => !u.suspect;
const condoDeal = (u) => u.deal_eligible === true;
const condoPartial = (u) => u.score_status === "partial" || u.score_rankable === false;
const condoOpportunityOrder = (a, b) => (b.opportunity_score ?? -1) - (a.opportunity_score ?? -1) || (b.monthly_saving ?? -Infinity) - (a.monthly_saving ?? -Infinity);
const condoUnitOrder = (a, b) => Number(!!a.suspect) - Number(!!b.suspect) || Number(condoPartial(a)) - Number(condoPartial(b)) || b.total - a.total;
const PTS_TR = [["fiyat", ["fiyat (฿/m²)", "ราคา (฿/ตร.ม.)"], 40], ["yas", ["yaş", "อายุ"], 37], ["bts", ["istasyon", "สถานี"], 20], ["cevre", ["gece çevresi", "สภาพแวดล้อมกลางคืน"], 3], ["yalitim", ["yalıtım", "เก็บเสียง"], 0], ["trafik", ["trafik", "การจราจร"], 0]];
const ptsTxt = (u) => PTS_TR.filter(([, , mx]) => mx > 0).map(([k, t, mx]) => `${tt(...t)} ${(u.unscored || []).includes(k) ? tt("bilinmiyor", "ไม่ทราบ") : `${(u.pts || {})[k] ?? 0}/${mx}`}`).join(" · ");
const condoScoreText = (u) => u.available_max === 0 ? tt("Puan yok", "ไม่มีคะแนน") : `${Math.round(u.total)}${condoPartial(u) ? tt(" · kısmi", " · ข้อมูลไม่ครบ") : u.coverage < 100 ? "*" : ""}`;
function condoPriceText(u) {
  if (u.exp == null || u.save == null || u.price_basis === "insufficient") return tt("Benzer daire emsali yetersiz; fiyat puanlanmadı.", "ข้อมูลห้องเทียบไม่พอ ไม่คิดคะแนนราคา");
  const diff = Math.round(Math.abs(u.save));
  const confidence = {high: tt("yüksek", "สูง"), medium: tt("orta", "ปานกลาง"), low: tt("düşük", "ต่ำ"), insufficient: tt("yetersiz", "ไม่เพียงพอ")}[u.price_confidence] || tt("bilinmiyor", "ไม่ทราบ");
  const range = u.price_low != null && u.price_high != null ? ` · ${tt("emsallerin orta yarısı", "ช่วงกลางของห้องเทียบ")}: ฿${fmt(u.price_low)}–${fmt(u.price_high)}` : "";
  const saving = u.monthly_saving != null && u.monthly_saving > 0 ? ` · ${tt("aylık fark", "ประหยัดต่อเดือน")}: ฿${fmt(u.monthly_saving)}` : "";
  return `${tt("Aynı binada benzer daire medyanı", "ค่ากลางห้องคล้ายกันในอาคารเดียวกัน")}: ฿${fmt(u.exp)}/${tt("ay", "เดือน")} · ${u.save >= 0 ? tt(`%${diff} ucuz`, `ถูกกว่า ${diff}%`) : tt(`%${diff} pahalı`, `แพงกว่า ${diff}%`)}${range}${saving} · ${fmt(u.n_cmp)} ${tt("emsal", "รายการเทียบ")} · ${tt("veri güveni", "ความเชื่อมั่น")}: ${confidence}. ${tt("İlan fiyatlarıdır; müsaitlik doğrulanmış değildir.", "เป็นราคาประกาศ ยังไม่ได้ยืนยันว่าห้องว่าง")}`;
}

const floorTxt = (u) => u.floor ? `<b>${tt(`${esc(u.floor)}. kat`, `ชั้น ${esc(u.floor)}`)}</b>` : `<span class="muted">${tt("kat ?", "ชั้น ?")}</span>`;
function trafficTxt(b, full = false) {
  if (!b || b.traffic == null || b.trafik == null) return "";
  const t = b.trafik;
  if (t >= 4.5) {
    return full
      ? `<span class="tag wall-high">🚗 ${tt("Trafik: Sakin", "การจราจร: สงบ")} (${Math.round(t)}/6)</span>`
      : ` · <span class="tag wall-high" title="${tt("Ana cadde/otoyol gürültüsünden içeride sakin sokak", "ซอยสงบห่างจากถนนใหญ่/ทางด่วน")}">🚗 ${tt("Trafik: Sakin", "จราจร: สงบ")}</span>`;
  }
  if (t >= 2.0) {
    return full
      ? `<span class="tag wall-mid">🚗 ${tt("Trafik: Orta", "การจราจร: ปานกลาง")} (${Math.round(t)}/6)</span>`
      : ` · <span class="tag wall-mid" title="${tt("Orta düzey cadde trafiği", "การจราจรปานกลาง")}">🚗 ${tt("Trafik: Orta", "จราจร: ปานกลาง")}</span>`;
  }
  return full
    ? `<span class="tag wall-low">🚗 ${tt("Trafik: Yoğun", "การจราจร: หนาแน่น")} (${Math.round(t)}/6)</span>`
    : ` · <span class="tag wall-low" title="${tt("Otoyol, viyadük veya ana kavşak dibinde yoğun trafik", "ติดทางด่วนหรือถนนสายหลัก การจราจรหนาแน่น")}">🚗 ${tt("Trafik: Yoğun", "จราจร: หนาแน่น")}</span>`;
}
function wallTxt(b, full = false) {
  const trf = trafficTxt(b, full);
  const labels = { yuksek: tt("Yüksek", "สูง"), orta: tt("Orta", "ปานกลาง"), dusuk: tt("Düşük", "ต่ำ") };
  const label = labels[b?.wall] || tt("Bilinmiyor", "ไม่ทราบ");
  const detail = b?.wall ? tt("Kaynaklı yalıtım bilgisi; puana etkisi yok", "ข้อมูลการเก็บเสียงมีแหล่งอ้างอิง") : tt("Doğrulanmış bilgi yok; puana dahil değil", "ไม่มีข้อมูลยืนยัน ไม่รวมในคะแนน");
  const tag = `<span class="tag" title="${detail}">🧱 ${tt("Yalıtım", "เก็บเสียง")}: ${label}</span>`;
  return full ? `<div class="m">${tag} ${trf}</div>` : ` · ${tag}${trf}`;
}
function updTxt(u) {
  const d = dateAgeDays(u.upd);
  if (d == null) return "";
  if (d < 1) return tt("bugün", "วันนี้");
  if (d < 2) return tt("dün", "เมื่อวาน");
  if (d < 31) return `${Math.round(d)} ${tt("gün", "วัน")}`;
  return `${Math.round(d / 30.5)} ${tt("ay", "เดือน")}`;
}

function normCondoStr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/@/g, " at ").replace(/&/g, " and ")
    .replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, " ")
    .trim();
}
// Damerau-Levenshtein mesafesi (1 harf eksik/fazla/yanlış/yer değiştirmiş yazım hatalarını yakalar)
function editDist(a, b) {
  const la = a.length, lb = b.length;
  if (a === b) return 0;
  if (!la) return lb;
  if (!lb) return la;
  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[la][lb];
}
function matchCondoQuery(b, rawQ) {
  const qNorm = normCondoStr(rawQ);
  if (!qNorm) return 0;
  const qTokens = qNorm.split(/\s+/).filter(Boolean);
  if (!qTokens.length) return 0;
  if (!b._nName) {
    const nName = normCondoStr(b.name);
    const nWords = nName.split(/\s+/).filter(Boolean);
    const pairs = [];
    for (let i = 0; i + 1 < nWords.length; i++) pairs.push(nWords[i] + nWords[i + 1]);
    const slugWords = normCondoStr(b.slug || "").split(/\s+/).filter(Boolean);
    b._nName = nName;
    b._nWords = [...new Set([...nWords, ...pairs])];
    b._allWords = [...new Set([...b._nWords, ...slugWords])];
  }
  let total = 0, usedTypo = false;
  for (const qt of qTokens) {
    const isNum = /^\d+$/.test(qt);
    let best = 0, tokenTypo = false;
    for (const w of b._allWords) {
      let sc = 0, isTypo = false;
      if (isNum) {
        if (w === qt) sc = 35;
        else if (qt.length >= 3 && w.startsWith(qt)) sc = 20;
      } else {
        if (w === qt) sc = 32;
        else if (qt.length >= 2 && w.startsWith(qt)) sc = 25;
        else if (qt.length >= 4 && w.includes(qt)) sc = 19;
        else if (qt.length >= 3 && Math.abs(w.length - qt.length) <= 1 && editDist(qt, w) <= 1) { sc = 16; isTypo = true; }
        else if (qt.length >= 4 && w.length > qt.length && editDist(qt, w.slice(0, qt.length)) <= 1) { sc = 13; isTypo = true; }
        else if (qt.length >= 7 && Math.abs(w.length - qt.length) <= 2 && editDist(qt, w) <= 2) { sc = 10; isTypo = true; }
      }
      if (sc > 0) {
        if (b._nWords.includes(w)) sc += 6;
        if (sc > best) { best = sc; tokenTypo = isTypo; }
      }
    }
    if (!best) return 0;
    if (tokenTypo) usedTypo = true;
    total += best;
  }
  if (b._nName === qNorm) total += 80;
  else if (b._nName.includes(qNorm)) total += 40;
  total += Math.max(0, 10 - b._nWords.length);
  // Yazım hatasız (tam/önek) eşleşen binalar 1000+ puan alır; eğer tam eşleşen bina varsa alakasız 1-harf benzerleri ("room" -> "roof") elenir
  return (usedTypo ? 0 : 1000) + total;
}

function condoQueryMatches() {
  const q = condoQuery();
  if (!q || !CONDO) return null;
  let hasStrict = false;
  const scored = [];
  for (const b of CONDO) {
    const ms = matchCondoQuery(b, q);
    if (ms > 0) {
      if (ms >= 1000) hasStrict = true;
      scored.push([ms, b]);
    }
  }
  const filtered = hasStrict ? scored.filter(([ms]) => ms >= 1000) : scored;
  return new Map(filtered.map(([ms, b]) => [b.slug, ms]));
}

function matchWall(b, w) {
  if (!w) return true;
  if (w === "yuksek") return b.wall === "yuksek";
  if (w === "yuksek_orta") return b.wall === "yuksek" || b.wall === "orta";
  if (w === "orta") return b.wall === "orta";
  if (w === "dusuk_degil") return b.wall !== "dusuk";
  if (w === "dusuk") return b.wall === "dusuk";
  return true;
}
function matchTraf(b, trf) {
  if (!trf) return true;
  const t = b.trafik;
  if (t == null) return false;
  if (trf === "sakin") return t >= 4.5;
  if (trf === "sakin_orta") return t >= 2.0;
  if (trf === "orta") return t >= 2.0 && t < 4.5;
  if (trf === "yogun") return t < 2.0;
  return true;
}
function condoRows() {
  const q = condoQuery();
  if (viewTab === "circle" && !zone && !q) return [];
  const qMap = q ? condoQueryMatches() : null;
  const n = +$("#cmin").value, { pmin, pmax, smin, smax, br, bts, age, upd, wall, traf } = filt();
  const inside = viewTab === "circle" && !!zone && !q;
  const out = [];
  for (const b of CONDO || []) {
    let mScore = 0;
    if (qMap) {
      mScore = qMap.get(b.slug) || 0;
      if (!mScore) continue;
    }
    const passBld = (viewTab === "deals" || b.n_rent >= n)
      && (!inside || inZone(b.lat, b.lng))
      && (bts === Infinity || (b.transit_km != null && b.transit_km * 1000 <= bts))
      && (age === Infinity || (b.year && b.year <= NOW_Y && NOW_Y - b.year <= age))
      && matchWall(b, wall)
      && matchTraf(b, traf);
    const filtUnits = passBld ? (b.rents || []).filter((u) => {
      if (!(u.price >= pmin && u.price <= pmax && u.size >= smin && u.size <= smax)) return false;
      if (!matchBr(u, br)) return false;
      if (upd < Infinity) {
        const d = dateAgeDays(u.upd);
        if (d == null || d > upd) return false;
      }
      return viewTab !== "deals" || condoDeal(u);
    }) : [];
    const passDeals = filtUnits.length;
    if (filtUnits.length && passDeals) {
      filtUnits.sort(viewTab === "deals" ? condoOpportunityOrder : condoUnitOrder);
      const best = filtUnits[0];
      const score = best.total - (okUnit(best) ? 0 : 200);
      out.push({ ...b, _units: filtUnits, _best: best, score, _mScore: mScore, _filterBypass: false });
    } else if (q && (b.rents || []).length) {
      // İsimle aranan bina bütçe/m²/yaş filtresine takılsa bile gizlenmez; ancak seçili güncelleme (tarih) filtresini delmez
      const updUnits = upd < Infinity ? (b.rents || []).filter((u) => {
        const d = dateAgeDays(u.upd);
        return d != null && d <= upd;
      }) : [...b.rents];
      if (updUnits.length) {
        updUnits.sort(condoUnitOrder);
        const best = updUnits[0];
        const score = best.total - (okUnit(best) ? 0 : 200);
        out.push({ ...b, _units: updUnits, _best: best, score, _mScore: mScore, _filterBypass: true });
      }
    }
  }
  const cheap = (b) => Math.min(...b._units.filter(okUnit).map((u) => u.price), Infinity);
  const key = { total: (b) => -b.score, rcheap: cheap,
    bts: (b) => b.transit_km ?? 99, new: (b) => b.year && b.year <= NOW_Y ? -b.year : Infinity }[$("#csort").value] || ((b) => -b.score);
  if (q) return out.sort((a, b) => b._mScore - a._mScore || (a._filterBypass ? 1 : 0) - (b._filterBypass ? 1 : 0) || (viewTab === "deals" ? condoOpportunityOrder(a._best, b._best) : Number(condoPartial(a._best)) - Number(condoPartial(b._best)) || key(a) - key(b) || b.score - a.score));
  return out.sort((a, b) => viewTab === "deals" ? condoOpportunityOrder(a._best, b._best) : Number(condoPartial(a._best)) - Number(condoPartial(b._best)) || key(a) - key(b) || b.score - a.score);
}
const transitTxt = (b) => b.transit ? `🚇 ${esc(b.transit.replace(/_/g, " "))} ${fmt(b.transit_km * 1000)} m` : tt("istasyon yok", "ไม่มีสถานี");
const yearTxt = (b) => !b.year ? tt("yapım yılı yok", "ไม่ทราบปีที่สร้าง") : b.year > NOW_Y
  ? `🏗 ${esc(String(b.year))} (${tt("gelecek tarih · doğrulanmalı", "ปีในอนาคต · ต้องตรวจสอบ")})`
  : `🏗 ${esc(String(b.year))} (${tt(`${NOW_Y - b.year} yaş`, `อายุ ${NOW_Y - b.year} ปี`)})`;

function isUnitSaved(u) {
  if (!u || !SAVED.length) return null;
  const uid = String(u.id || "");
  const uurl = String(u.url || "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  return SAVED.find((s) => (uid && s.unit_id === uid) || (uurl && String(s.url || "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase() === uurl)) || null;
}
function saveUnitBtn(u, b) {
  const hit = isUnitSaved(u);
  const bslug = b ? b.slug : "";
  const bname = b ? b.name : "";
  const urTxt = hit && hit.user_rating ? ` (${hit.user_rating}/10)` : "";
  return `<button type="button" class="savebtn${hit ? " on" : ""}" data-save-uid="${esc(u.id || "")}" data-save-url="${esc(u.url || "")}" data-save-bslug="${esc(bslug)}" data-save-bname="${esc(bname)}" data-save-price="${u.price || ""}" data-save-size="${u.size || ""}" data-save-floor="${esc(u.floor || "")}" data-save-br="${esc(u.br || "")}" data-save-img="${esc(u.img || "")}" data-saved-id="${hit ? esc(hit.id) : ""}" title="${hit ? tt("Kayıtlı — tıklayınca puanlama ve kıyas listesini açar", "บันทึกแล้ว — คลิกเพื่อเปิดหน้าให้คะแนนและเปรียบเทียบ") : tt("Bu daireyi Kaydedilenler'e ekle ve puanla", "บันทึกห้องนี้เพื่อเปรียบเทียบและให้คะแนน")}">${hit ? tt(`★ Kayıtlı${urTxt} · Puanla`, `★ บันทึกแล้ว${urTxt} · ให้คะแนน`) : tt("☆ Kaydet", "☆ บันทึก")}</button>`;
}
function unitTag(u, b) {
  const bslug = b ? b.slug : "";
  const uid = u ? (u.id || "") : "";
  return `<span class="score" data-score-condo="${esc(bslug)}" data-score-uid="${esc(uid)}" style="background:${okUnit(u) && !condoPartial(u) ? scoreCol(u.total) : "#9aa3ad"}" title="${tt("Tıkla: Neyden kaç puan kazandı / kesildi detaylı gör", "คลิกเพื่อดูรายละเอียดคะแนน")} (${ptsTxt(u)})">${condoScoreText(u)} ${tt("puan", "คะแนน")}</span> <span class="muted">${tt("veri kapsamı", "ข้อมูลครอบคลุม")} %${u.coverage ?? 100}</span> ${condoDeal(u) ? `<span class="tag deal">★ ${tt("Fırsat adayı", "ผู้สมัครดีล")} · %${Math.round(u.save)} · ฿${fmt(u.monthly_saving)}/${tt("ay", "เดือน")}</span>` : ""} `;
}
function unitRow(u, b, reasonBadge = "") {
  const urlStr = String(u.url || "");
  const srcName = urlStr.includes("ddproperty.com") ? "DDproperty"
    : urlStr.includes("propertyhub.in.th") ? "PropertyHub"
    : urlStr.includes("baania.com") ? "Baania"
    : urlStr.includes("bkkcitismart.com") ? "BKK Citismart"
    : urlStr.includes("scancondo.com") ? "ScanCondo"
    : urlStr.includes("ennxo.com") ? "Ennxo" : "";
  const ut = updTxt(u);
  const srcBadge = (ut ? ` · <span class="muted">${ut}</span>` : "") + (srcName ? ` · <span class="muted">${srcName}</span>` : "");
  const base = `<a href="${esc(u.url)}" target="_blank" rel="noopener">฿${fmt(u.price)}${u.kind === "rent" ? tt("/ay", "/เดือน") : ""}</a>
    · ${fmt(u.size)} m² · ${fmt(u.ppsm)} ฿/m²${BR_TR[u.br] ? " · " + BR_TR[u.br] : ""} · ${floorTxt(u)}${srcBadge}${reasonBadge}${saveUnitBtn(u, b)}`;
  const extra = ` · <span class="muted">${ptsTxt(u)}</span>${u.suspect ? tt(" · ⚠ şüpheli ucuz (ilan hatası olabilir)", " · ⚠ ถูกผิดปกติ (ประกาศอาจผิดพลาด)") : ""}`;
  return `<li>${unitTag(u, b)}${base}${extra}</li>`;
}

function unitFilterReasons(u) {
  const { pmin, pmax, smin, smax, br, upd } = filt();
  const reasons = [];
  if (br && !matchBr(u, br)) {
    const uBrLbl = BR_TR[u.br] || tt("oda ?", "ห้อง ?");
    const selLbl = ($("#fbr")?.selectedOptions[0]?.textContent || br).replace(/^🛏\s*/, "");
    reasons.push(tt(`${uBrLbl} ≠ ${selLbl} filtre`, `${uBrLbl} ≠ ตัวกรอง ${selLbl}`));
  }
  if (u.size < smin) reasons.push(tt(`${fmt(u.size)} m² < ${fmt(smin)} m² filtre`, `${fmt(u.size)} ตร.ม. < เกณฑ์ ${fmt(smin)} ตร.ม.`));
  if (smax < Infinity && u.size > smax) reasons.push(tt(`${fmt(u.size)} m² > ${fmt(smax)} m² filtre`, `${fmt(u.size)} ตร.ม. > เกณฑ์ ${fmt(smax)} ตร.ม.`));
  if (u.price < pmin) reasons.push(tt(`฿${fmt(u.price)} < ฿${fmt(pmin)} filtre`, `฿${fmt(u.price)} < เกณฑ์ ฿${fmt(pmin)}`));
  if (pmax < Infinity && u.price > pmax) reasons.push(tt(`฿${fmt(u.price)} > ฿${fmt(pmax)} filtre`, `฿${fmt(u.price)} > เกณฑ์ ฿${fmt(pmax)}`));
  if (upd < Infinity) {
    const d = dateAgeDays(u.upd);
    if (d == null) reasons.push(tt("tarihsiz ilan", "ไม่มีวันที่อัปเดต"));
    else if (d > upd) reasons.push(tt(`${Math.round(d)}g önce (> ${upd}g filtre)`, `${Math.round(d)} วันก่อน (> เกณฑ์ ${upd} วัน)`));
  }
  if (viewTab === "deals" && !condoDeal(u)) reasons.push(tt("fırsat eşiği dışı", "นอกเกณฑ์ดีลเด่น"));
  return reasons.length ? ` <span class="filt-reason-badge" title="${tt("Bu ilan mevcut sol panel filtrenize takıldığı için üst listede gizlendi", "ประกาศนี้ถูกซ่อนจากรายการหลักเนื่องจากติดตัวกรองด้านซ้าย")}">[${esc(reasons.join(" · "))}]</span>` : "";
}

const BIMG_TR = bi({
  dis: ["Dış cephe", "ภายนอกอาคาร"],
  bina: ["Bina", "อาคาร"],
  havuz: ["Havuz", "สระว่ายน้ำ"],
  manzara: ["Manzara", "วิว"],
  spor: ["Spor salonu", "ฟิตเนส"],
  ortak: ["Ortak alan", "ส่วนกลาง"],
});
function condoGallery(b) {
  const out = [], seen = new Set();
  for (const i of b.bimgs || []) {
    if (!i || !i.url || seen.has(i.url)) continue;
    seen.add(i.url);
    out.push({ url: i.url, full: i.full || i.url, cap: BIMG_TR[i.kind] || tt("Bina", "อาคาร") });
  }
  for (const u of b.rents || []) {
    if (out.length >= 8) break;
    if (u.img && !seen.has(u.img)) {
      seen.add(u.img);
      out.push({ url: u.img, full: u.img, cap: tt("Daire", "ห้องเช่า") });
    }
  }
  return out.map((o, k) => ({ ...o, cap: `${o.cap} (${k + 1}/${out.length})` }));
}
function condoGalleryHtml(b, start = 0) {
  const g = condoGallery(b);
  if (!g.length) return `<div class="imgs" data-cslug="${esc(b.slug)}" style="display:none"></div>`;
  const n = g.length, prev = start - 2 < 0 ? (n - 1) - ((n - 1) % 2) : start - 2, next = start + 2 >= n ? 0 : start + 2;
  const nav = n > 2 ? `<button class="gnav prev" data-cslug="${esc(b.slug)}" data-i="${prev}">‹</button>`
    + `<button class="gnav next" data-cslug="${esc(b.slug)}" data-i="${next}">›</button>` : "";
  return `<div class="imgs" data-cslug="${esc(b.slug)}">${g.slice(start, start + 2).map((i) => `<figure><a href="${esc(i.full)}" target="_blank" rel="noopener" title="${tt("Büyük fotoğrafı aç", "เปิดภาพขนาดใหญ่")}"><img src="${esc(i.url)}" alt=""></a><figcaption>${esc(i.cap)}</figcaption></figure>`).join("")}${nav}</div>`;
}
function ensureCondoImages(b) {
  const raw = CONDO && CONDO.find((x) => x.slug === b.slug);
  const target = raw || b;
  if ((Array.isArray(target.bimgs) && target.bimgs.length > 0) || target.bimgs === null || !b.slug || b.slug.startsWith("ddp-") || b.slug.startsWith("bkk-")) {
    if (raw && raw.bimgs && !b.bimgs) b.bimgs = raw.bimgs;
    return;
  }
  target.bimgs = null;
  const city = $("#city").value || "bangkok";
  api(`/api/condo_images?city=${encodeURIComponent(city)}&slug=${encodeURIComponent(b.slug)}`).then((d) => {
    const imgs = (d && d.bimgs) || [];
    target.bimgs = imgs;
    b.bimgs = imgs;
    if (!imgs.length) return;
    const box = document.querySelector(`.imgs[data-cslug="${CSS.escape(b.slug)}"]`);
    if (box) box.outerHTML = condoGalleryHtml(b, 0);
  }).catch(() => {});
}
function condoExtUrls(b) {
  const ll = `${b.lat},${b.lng}`;
  const qName = encodeURIComponent(`${b.name} Condo Bangkok`);
  const qImg = encodeURIComponent(`${b.name} condo bangkok exterior building`);
  return {
    sv: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`,
    earth: `https://earth.google.com/web/search/${qName}/@${ll},35a,320d,35y,0h,60t,0r`,
    gmaps: `https://www.google.com/maps/search/?api=1&query=${qName}`,
    gimg: `https://www.google.com/search?tbm=isch&q=${qImg}`,
  };
}

function condoPopup(b) {
  ensureCondoImages(b);
  const u = b._best;
  const mo = tt("ay", "เดือน");
  const ext = condoExtUrls(b);
  const extBar = `<div class="extbar">`
    + `<a href="${ext.sv}" target="_blank" rel="noopener" title="${tt("Sokaktan 360° döndürerek dış görünüşe bak", "ดูมุมมองถนน 360° รอบอาคาร")}">🌐 360° Street View</a>`
    + `<a href="${ext.earth}" target="_blank" rel="noopener" title="${tt("Google Earth 3D ile binanın etrafında her açıdan dön", "หมุนดูอาคาร 3D รอบทิศทางใน Google Earth")}">🛰 ${tt("3D Her Açıdan", "3D รอบทิศ")}</a>`
    + `<a href="${ext.gimg}" target="_blank" rel="noopener" title="${tt("Binanın dış cephe fotoğraflarını gör", "ดูภาพภายนอกอาคาร")}">📷 ${tt("Dış Görünüş", "ภาพภายนอก")}</a>`
    + `<a href="${ext.gmaps}" target="_blank" rel="noopener" title="${tt("Google Maps bina sayfası ve kullanıcı fotoğrafları", "หน้าอาคารและภาพถ่ายใน Google Maps")}">📍 Maps</a>`
    + `</div>`;
  const head = `${unitTag(u, b)} ${tt("en iyi kiralık", "ห้องเช่าที่ดีที่สุด")}: ฿${fmt(u.price)}/${mo} · ${fmt(u.size)} m²${BR_TR[u.br] ? " · " + BR_TR[u.br] : ""} · ${floorTxt(u)} ${saveUnitBtn(u, b)}<div class="muted">${ptsTxt(u)}</div>`;
  const calc = `<div class="muted">${condoPriceText(u)}</div>`;
  const bUrl = String(b.url || "");
  const linkLabel = bUrl.includes("ddproperty.com") ? tt("DDproperty sayfası", "หน้า DDproperty")
    : bUrl.includes("propertyhub.in.th") ? tt("PropertyHub sayfası", "หน้า PropertyHub")
    : bUrl.includes("baania.com") ? tt("Baania sayfası", "หน้า Baania")
    : bUrl.includes("bkkcitismart.com") ? tt("BKK Citismart sayfası", "หน้า BKK Citismart")
    : tt("PropertyScout bina sayfası", "หน้าอาคารใน PropertyScout");
  const bypassNote = b._filterBypass ? `<div class="note">⚠ ${tt("Bu bina mevcut bütçe/güncelleme/fırsat filtrenizin dışında kalıyor; aradığınız için tüm daireleri gösteriliyor.", "อาคารนี้อยู่นอกตัวกรองงบ/อัปเดต/ดีลปัจจุบัน แสดงทุกห้องเนื่องจากคุณค้นหาชื่อโดยตรง")}</div>` : "";
  const allRents = Array.isArray(b.rents) ? b.rents : b._units;
  const shownIds = new Set(b._units.map((x) => `${x.id || ""}|${x.url || ""}`));
  const hiddenUnits = allRents.filter((x) => !shownIds.has(`${x.id || ""}|${x.url || ""}`)).slice().sort(condoUnitOrder);
  const hiddenBlock = hiddenUnits.length ? `<details class="other-units-box"><summary>${tt(`▾ Filtreye takılan diğer ${hiddenUnits.length} aktif ilanı da göster (ör. <${fmt(filt().smin || 0)} m² veya eski tarihli)`, `▾ แสดงประกาศที่ติดตัวกรองอีก ${hiddenUnits.length} รายการ (เช่น <${fmt(filt().smin || 0)} ตร.ม. หรือเกินกำหนดวัน)`)}</summary><ul class="units other-units">${hiddenUnits.map((x) => unitRow(x, b, unitFilterReasons(x))).join("")}</ul></details>` : "";
  const listHeader = hiddenUnits.length
    ? tt(`Kiralık daireler — filtreye uyan ${b._units.length} / ${allRents.length} aktif ilan (puana göre)`, `ห้องเช่า — ตรงตัวกรอง ${b._units.length} / ${allRents.length} ประกาศที่ว่างอยู่ (เรียงตามคะแนน)`)
    : tt(`Kiralık daireler (${b._units.length} aktif ilan · puana göre)`, `ห้องเช่า (${b._units.length} ประกาศที่ว่างอยู่ · เรียงตามคะแนน)`);
  const archiveNote = b.rent_total && b.rent_total > allRents.length
    ? tt(`aktif ${allRents.length} ilan · sitedeki toplam arşiv kaydı ${fmt(b.rent_total)} (kiralanmış/eski kayıtlar dahil)`, `ว่างอยู่ ${allRents.length} ประกาศ · รวมประวัติในเว็บ ${fmt(b.rent_total)} (รวมห้องที่ปล่อยเช่าแล้ว/ประกาศเก่า)`)
    : tt(`toplam ${fmt(b.rent_total || allRents.length)} aktif kiralık`, `ห้องเช่าว่างทั้งหมด ${fmt(b.rent_total || allRents.length)} ประกาศ`);
  return `<div class="pop condo">${condoGalleryHtml(b)}<a class="btitle" href="${ext.gmaps}" target="_blank" rel="noopener" title="${tt("Google Maps'te binanın dış görünüşünü ve fotoğraflarını aç", "เปิดดูภาพอาคารใน Google Maps")}"><b>${esc(b.name)}</b> ↗</a>${extBar}${bypassNote}<div class="muted">${esc(b.district || "")} · ${transitTxt(b)} · ${yearTxt(b)}${b.floors ? ` · ${b.floors} ${tt("kat", "ชั้น")}` : ""}${b.units_total ? ` · ${fmt(b.units_total)} ${tt("daire", "ห้อง")}` : ""}</div>${wallTxt(b, true)}
    <div class="cy">${head}</div>${calc}
    <div>${tt("Kira", "ค่าเช่า")} <b>${fmt(b.rent_m2)} ฿/m²/${mo}</b> (${tt(`filtreye uyan ${b._units.length} / aktif ${allRents.length} ilan`, `ตรงตัวกรอง ${b._units.length} / ว่าง ${allRents.length} ประกาศ`)})</div>
    <div class="boxh">${listHeader}</div><ul class="units">${b._units.slice(0, 35).map((x) => unitRow(x, b)).join("")}</ul>${hiddenBlock}
    <div class="links"><a href="${esc(b.url)}" target="_blank" rel="noopener">${linkLabel}</a>
      · ${archiveNote}</div></div>`;
}

// append: dükkân ilanları zaten çizildi; condo binaları onların üstüne eklenir, liste altta ayrı başlıkla sürer
function renderCondo(append = false) {
  const q = condoQuery();
  if (viewTab === "circle" && !zone && !q) {
    pinLayer.clearLayers(); markers.clear(); $("#list").innerHTML = "";
    $("#summary").textContent = tt("Condo · haritada alan çizilmedi — binaları görmek için alan çizin, bina adı arayın ya da “★ Fırsat Bölümü” sekmesine geçin.",
      "คอนโด · ยังไม่ได้วาดพื้นที่ — วาดพื้นที่ ค้นหาชื่ออาคาร หรือไปที่แท็บ “★ ดีลเด่น”");
    return;
  }
  const rows = condoRows();
  const sum = tt(`Condo · kiralık · ${(CONDO || []).length} bina ölçüldü · ${rows.length} bina listede`, `คอนโด · ให้เช่า · วัดแล้ว ${(CONDO || []).length} อาคาร · อยู่ในรายการ ${rows.length} อาคาร`)
    + (q ? ` · 🔍 "${q}"` : "");
  if (append) $("#summary").textContent += ` · ${sum}`;
  else {
    $("#summary").textContent = sum + (q ? tt(" (isim araması)", " (ค้นหาชื่อ)") : viewTab === "circle" && zone ? tt(" (alan içinde)", " (ในพื้นที่)") : tt(" (tüm Bangkok · fırsat bölümü)", " (ทั่วกรุงเทพฯ · ดีลเด่น)")) + ` · ${tt("sıra", "เรียง")}: ${viewTab === "deals" ? tt("fiyat fırsatı", "ความคุ้มค่าดีล") : $("#csort").selectedOptions[0].textContent}`;
    pinLayer.clearLayers(); markers.clear();
  }
  rows.forEach((b, i) => {
    const u = b._best;
    const col = okUnit(u) && !condoPartial(u) ? scoreCol(u.total) : "#9aa3ad";
    const lab = condoScoreText(u);
    const icon = L.divIcon({ className: "pinwrap", html: `<span class="pin cpin${i < 10 ? " top" : ""}${b.slug === selId ? " sel" : ""}" style="background:${col}">${i < 50 ? (i + 1) + ". " : ""}${lab}</span>` });
    const m = L.marker([b.lat, b.lng], { icon, zIndexOffset: 2000 - i, riseOnHover: true })
      .bindPopup(() => condoPopup(b), { maxWidth: 390, minWidth: window.innerWidth <= 820 ? 250 : 330, autoPanPadding: [10, 10] })
      .on("click", () => select(b.slug, false));
    m.addTo(pinLayer); markers.set(b.slug, m);
  });
  const html = rows.slice(0, LIST_N).map((b, i) => {
    const u = b._best;
    const thumb = u.img || ((b.bimgs || [])[0] || {}).url || ((b.rents || [])[0] || {}).img || "";
    const bypassBadge = b._filterBypass ? ` · <span class="tag warn">${tt("Filtre dışı (tüm daireler)", "อยู่นอกตัวกรอง (แสดงทุกห้อง)")}</span>` : "";
    const line = `${tt("En iyi kiralık", "ห้องเช่าที่ดีที่สุด")}: <b>฿${fmt(u.price)}/${tt("ay", "เดือน")}</b> · ${fmt(u.size)} m²${BR_TR[u.br] ? " · " + BR_TR[u.br] : ""} · ${floorTxt(u)} · ${ptsTxt(u)}`;
    return `<li data-id="${esc(b.slug)}" class="${b.slug === selId ? "sel" : ""}">
      <img loading="lazy" src="${esc(thumb)}" alt="">
      <div>
        <div class="big"><span class="rank">${i + 1}.</span> <b>${esc(b.name)}</b> ${saveUnitBtn(u, b)}</div>
        <div class="m">${unitTag(u, b)}${floorTxt(u)}${wallTxt(b, false)} · ${b._units.length}/${b.n_rent} ${tt("kiralık ilan", "ประกาศให้เช่า")}${bypassBadge}</div>
        <div class="m">${transitTxt(b)} · ${yearTxt(b)}${b.floors ? ` · ${b.floors} ${tt("katlı", "ชั้น")}` : ""}</div>
        <div class="m">${line}</div>
      </div></li>`;
  }).join("") + (rows.length > LIST_N
    ? `<li class="more"><button id="more">${tt(`${Math.min(200, rows.length - LIST_N)} bina daha göster`, `แสดงเพิ่มอีก ${Math.min(200, rows.length - LIST_N)} อาคาร`)} (${LIST_N}/${rows.length})</button> <button id="moreall">${tt("Hepsini göster", "แสดงทั้งหมด")}</button></li>` : "");
  if (!append) $("#list").innerHTML = html;
  else if (rows.length) $("#list").insertAdjacentHTML("beforeend", `<li class="more"><b>${tt("Condo binaları", "อาคารคอนโด")} (${rows.length})</b></li>` + html);
}

const NOTE = () => tt("Condo puanı: yalnız bilinen ölçütler 100'e ölçeklenir; * eksik veriyle geçici puandır. Fiyat yalnız aynı binadaki benzer dairelerle karşılaştırılır. Yalıtım ve trafik yalnız bilgidir; puana etkileri yoktur. Gece çevresinin ağırlığı 3 puandır. Yaşam ölçütleri ve fiyat avantajı ayrı gösterilir; veri kapsamı düşük puanları dikkatle karşılaştırın. Fırsat adayları: medyandan en az %10 ucuz, emsallerin alt çeyreğinin altında, orta/yüksek veri güveni ve son 30 günde güncellenmiş ilan. Fırsatlar fiyat avantajına göre sıralanır; müsaitlik doğrulanmış sayılmaz. Kısmi puanlar tam değerlendirilmiş ilanlardan sonra gösterilir.", "คะแนนคอนโดคำนวณจากข้อมูลที่ทราบเท่านั้น * หมายถึงข้อมูลไม่ครบ เปรียบเทียบราคากับห้องคล้ายกันในอาคารเดียวกัน ไม่คาดเดาการเก็บเสียงจากชื่อโครงการ");
let condoJob = {};
function syncMode() {
  $("#condonote").textContent = (condoJob.running ? tt(`Tarama sürüyor: ${condoJob.done}/${condoJob.total} bina · `, `กำลังสแกน: ${condoJob.done}/${condoJob.total} อาคาร · `) : "") + NOTE();
}
// condo-on: condo kutusu görünür; condo-mode: yalnız condo açık (dükkân süzgeçleri gizlenir)
function bodyMode() {
  const on = CONDO !== null;
  const shopMode = selTypes().length > 0;
  document.body.classList.toggle("condo-on", on);
  document.body.classList.toggle("condo-mode", on && !shopMode);
  if (condoDefaultFilt) {
    if (shopMode && !on) {
      if ($("#pmax").value === "21000") $("#pmax").value = "";
      if ($("#smin").value === "30") $("#smin").value = "";
      if ($("#fupd").value === "14") $("#fupd").value = "";
    } else if (on && !shopMode) {
      if ($("#pmax").value === "") $("#pmax").value = "21000";
      if ($("#smin").value === "") $("#smin").value = "30";
      if ($("#fupd").value === "") $("#fupd").value = "14";
    }
    filtMark();
  } else {
    updateMobChips();
  }
  if (on) syncMode();
}
let condoKey = "";  // condo verisinin yüklendiği şehir; boş = yüklenmedi
async function loadCondo() {
  const city = $("#city").value || "bangkok";
  const d = await api("/api/condo?city=" + encodeURIComponent(city));
  if (CONDO === null) return;  // bu arada kapatıldı
  CONDO = d.rows; condoKey = city;
  condoJob = d.job || {};
  syncMode();
}
async function setCondo(on, start = false) {
  if (!on) { CONDO = null; condoKey = ""; }
  else if (CONDO === null) CONDO = [];
  bodyMode();
  if (on) applyCondoDefaultArea();
  if (on && needsData() && condoKey !== $("#city").value) {
    $("#summary").textContent = tt("Condo binaları yükleniyor…", "กำลังโหลดอาคารคอนโด…");
    await loadCondo();
  }
  if (on && !zone && !start && !selTypes().length) {
    if (window.innerWidth <= 820) map.fitBounds(BKK_BOUNDS, { padding: [8, 8] });
    else map.setView([13.714, 100.595], 13);
  }
  render();
}
let condoT = null;
for (const el of ["#cmin", "#csort"]) $(el).addEventListener("input", () => {
  clearTimeout(condoT); if (CONDO) condoT = setTimeout(render, el === "#csort" ? 0 : 250);
});
function renderCondoSug() {
  const box = $("#condosug");
  if (!box) return;
  const q = condoQuery();
  if (!q || !CONDO || !CONDO.length) { box.hidden = true; box.innerHTML = ""; return; }
  const qMap = condoQueryMatches();
  const matches = [];
  for (const b of CONDO) {
    const ms = qMap ? (qMap.get(b.slug) || 0) : 0;
    if (ms > 0) matches.push([ms, b]);
  }
  matches.sort((a, b) => b[0] - a[0] || ((b[1].rents?.[0]?.total || 0) - (a[1].rents?.[0]?.total || 0)));
  if (!matches.length) {
    box.innerHTML = `<div class="sitem"><span class="sub">${tt("Eşleşen condo bulunamadı", "ไม่พบคอนโดที่ตรงกัน")}</span></div>`;
    box.hidden = false;
    return;
  }
  box.innerHTML = matches.slice(0, 50).map(([, b], idx) => {
    const prices = (b.rents || []).filter(okUnit).map((u) => u.price);
    const minP = prices.length ? Math.min(...prices) : (b.rents?.[0]?.price || null);
    const bestPts = b.rents?.[0] ? Math.round(b.rents[0].total) : null;
    return `<div class="sitem${b.slug === selId ? " sel" : ""}" data-slug="${esc(b.slug)}" data-name="${esc(b.name)}">
      <b>${idx + 1}. ${esc(b.name)}</b>
      <span class="sub">${minP ? `฿${fmt(minP)}/${tt("ay", "เดือน")}+ · ` : ""}${b.n_rent} ${tt("ilan", "ประกาศ")}${bestPts != null ? ` · ${bestPts} ${tt("puan", "คะแนน")}` : ""} · ${transitTxt(b)}</span>
    </div>`;
  }).join("");
  box.hidden = false;
}
async function onCondoSearchInput(flyFirst = false) {
  if (CONDO === null) CONDO = [];
  if (condoKey !== $("#city").value) {
    $("#summary").textContent = tt("Condo binaları yükleniyor…", "กำลังโหลดอาคารคอนโด…");
    await loadCondo();
  }
  render();
  renderCondoSug();
  if (flyFirst) {
    const rows = condoRows();
    if (rows.length) {
      select(rows[0].slug, true);
      renderCondoSug();
    }
  }
}
if ($("#condoq")) {
  $("#condoq").addEventListener("input", () => {
    clearTimeout(condoT);
    condoT = setTimeout(() => onCondoSearchInput(false), 100);
  });
  $("#condoq").addEventListener("focus", () => {
    if (condoQuery()) onCondoSearchInput(false);
  });
  $("#condoq").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(condoT);
      onCondoSearchInput(true);
    } else if (e.key === "Escape") {
      $("#condosug").hidden = true;
    }
  });
  $("#condosug")?.addEventListener("click", (e) => {
    const it = e.target.closest(".sitem[data-slug]");
    if (!it) return;
    const slug = it.dataset.slug;
    if (!markers.has(slug)) render();
    if (window.innerWidth <= 820) $("#condosug").hidden = true;
    select(slug, true);
    for (const el of $("#condosug").querySelectorAll(".sitem")) {
      el.classList.toggle("sel", el.dataset.slug === slug);
    }
  });
}
$("#mobmodes")?.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mview]");
  if (b) setMobView(b.dataset.mview);
});
$("#mobfiltbtn")?.addEventListener("click", () => toggleMobFilt());
$("#mobapply")?.addEventListener("click", () => toggleMobFilt(false));
$("#mobchips")?.addEventListener("click", (e) => {
  const ch = e.target.closest(".mchip[data-act]");
  if (!ch) return;
  const act = ch.dataset.act;
  if (act === "clearzone") {
    $("#clear")?.click();
  } else if (act === "mode") {
    const isCondo = condoOn() && !selTypes().length;
    if (isCondo) {
      $("#alltypes")?.click();
    } else {
      for (const i of document.querySelectorAll("#types input")) i.checked = i.value === "condo";
      setCondo(true);
    }
    updateMobChips();
  } else if (act === "filt") {
    toggleMobFilt(true);
  } else if (act === "saved") {
    setViewTab(viewTab === "saved" ? (prevNonSavedTab || "circle") : "saved");
  }
});
(() => {
  const h = $("#mobhandle");
  if (!h) return;
  let y0 = null;
  h.addEventListener("touchstart", (e) => { if (e.touches.length === 1) y0 = e.touches[0].clientY; }, { passive: true });
  h.addEventListener("touchend", (e) => {
    if (y0 == null || !e.changedTouches.length) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    if (dy < -24) setMobView(mobView === "map" ? "split" : "list");
    else if (dy > 24) setMobView(mobView === "list" ? "split" : "map");
  }, { passive: true });
})();
$("#alltypes").onclick = () => {
  for (const i of document.querySelectorAll("#types input")) i.checked = i.value !== "condo";
  CONDO = null; condoKey = "";
  if ($("#condoq")) $("#condoq").value = "";
  if ($("#condosug")) $("#condosug").hidden = true;
  bodyMode();
  render(); loadAnalysis();
};
$("#city").onchange = () => { clearZone(); areaText(); loadCity(); };

// ------------------------------------------------------------------ kaydedilen condolar & kendi içlerinde puanlama
const BADGE_TR = bi({
  en_ucuz_kira: ["💰 En düşük kira", "💰 ค่าเช่าถูกสุด"],
  en_ucuz_m2: ["📐 En ucuz m²", "📐 ฿/m² ถูกสุด"],
  en_genis: ["🏠 En geniş", "🏠 กว้างสุด"],
  en_yakin_bts: ["🚇 İstasyona en yakın", "🚇 ใกล้สถานีสุด"],
  en_yuksek_kat: ["🏙 En yüksek kat", "🏙 ชั้นสูงสุด"],
});

function rateButtonsHtml(it) {
  const cur = it.user_rating != null ? Math.round(Number(it.user_rating)) : null;
  const btns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((v) => `<button type="button" class="rate-btn${cur === v ? " on" : ""}" data-rate-id="${esc(it.id)}" data-rate-val="${v}" title="${tt(`${v}/10 puan ver (seçiliyse kaldırır)`, `ให้ ${v}/10 คะแนน`)}">${v}</button>`)
    .join("");
  return `<div class="rate-row"><span class="rlab">⭐ ${tt("Senin Puanın:", "คะแนนของคุณ:")}</span>${btns}</div>`;
}

function savedBuildingTitle(it) {
  const raw = String(it?.building_name || "").trim();
  if (!raw || raw === "Kaydedilen Condo") return tt("Kaydedilen Condo", "คอนโดที่บันทึกไว้");
  return raw;
}

function savedCardHtml(it, idx) {
  const mo = tt("ay", "เดือน");
  const isUpd = it.id === lastUpdatedSavedId;
  const bTitle = savedBuildingTitle(it);
  const badges = (it.badges || []).map((k) => `<span class="tag pbadge">${BADGE_TR[k] || k}</span>`).join("");
  const bts = it.transit ? `🚇 ${esc(it.transit.replace(/_/g, " "))} ${fmt((it.transit_km || 0) * 1000)} m` : "";
  const yr = it.year ? yearTxt(it) : "";
  const fl = it.floor ? `<b>${tt(`${esc(it.floor)}. kat`, `ชั้น ${esc(it.floor)}`)}</b>` : `<span class="muted">${tt("kat ?", "ชั้น ?")}</span>`;
  const cityTag = "";
  const ur = it.user_rating != null ? Math.round(Number(it.user_rating)) : null;
  const urBadge = ur != null
    ? ` <span class="user-rate-badge" title="${tt("Kişisel beğenin; sistem puanını değiştirmez", "ความชอบส่วนตัว ไม่เปลี่ยนคะแนนระบบ")}">⭐ ${tt("Sen", "คุณ")}: ${ur}/10</span>`
    : "";
  return `<li data-id="${esc(it.id)}" class="saved-card${idx === 0 ? " rank1" : ""}${it.id === selId ? " sel" : ""}${isUpd ? " updated-flash" : ""}">
    <div class="saved-top">
      ${it.img ? `<img loading="lazy" src="${esc(it.img)}" alt="">` : `<img alt="">`}
      <div>
        <div class="big" style="display:flex;flex-wrap:wrap;align-items:center;gap:5px">
          <span class="pool-score-box" data-score-saved="${esc(it.id)}" title="${tt("Tıkla: Puan kazanç ve kesinti karnesini gör", "คลิกเพื่อดูรายละเอียดคะแนน")}">🏆 #${it.pool_rank} · ${condoScoreText(it)} ${tt("puan", "คะแนน")}</span>${urBadge}
          <b>${esc(bTitle)}</b>
        </div>
        <div class="m">
          <b>${it.price ? "฿" + fmt(it.price) + "/" + mo : tt("Kira girilmedi", "ยังไม่ระบุค่าเช่า")}</b>
          · <b>${it.size ? fmt(it.size) + " m²" : "m² ?"}</b>${it.ppsm ? ` (${fmt(it.ppsm)} ฿/m²)` : ""}
          ${BR_TR[it.br] ? " · " + BR_TR[it.br] : ""} · ${fl}
          ${it.source ? ` · <span class="tag src">${esc(it.source)}</span>` : ""}${cityTag}
        </div>
        <div class="m">${[it.district, bts, yr].filter(Boolean).join(" · ")}${wallTxt(it, false)}</div>
        ${badges ? `<div style="margin-top:3px">${badges}</div>` : ""}
      </div>
    </div>
    <div class="pool-pts">${tt("Sistem kıyası", "คะแนนระบบ")} (${condoScoreText(it)}/100): ${poolPtsTxt(it)}</div>
    ${rateButtonsHtml(it)}
    <div class="saved-controls" data-sid="${esc(it.id)}">
      <input type="number" class="s-num s-price" value="${it.price || ""}" placeholder="${tt("Kira ฿", "ค่าเช่า ฿")}" step="500" title="${tt("Aylık kira (฿)", "ค่าเช่ารายเดือน (฿)")}">
      <input type="number" class="s-num s-size" value="${it.size || ""}" placeholder="${tt("m²", "ตร.ม.")}" step="1" title="${tt("Daire alanı (m²)", "พื้นที่ (ตร.ม.)")}">
      <input type="text" class="s-fl s-floor" value="${esc(it.floor || "")}" placeholder="${tt("Kat", "ชั้น")}" title="${tt("Bulunduğu kat", "ชั้นที่อยู่")}">
      <input type="text" class="s-note" value="${esc(it.note || "")}" placeholder="${tt("Not ekle (ör. pazarlık, manzara…)", "เพิ่มบันทึกส่วนตัว…")}">
      <button type="button" class="s-save${isUpd ? " ok" : ""}" data-save-row="${esc(it.id)}" title="${tt("Kira / m² / kat / not ve puan değişikliklerini kaydet", "บันทึกการแก้ไข")}">${isUpd ? `✓ ${tt("Güncellendi!", "อัปเดตแล้ว!")}` : `✓ ${tt("Güncelle", "อัปเดต")}`}</button>
      ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener" class="s-link">${tt("İlana Git ↗", "เปิดลิงก์ ↗")}</a>` : ""}
      <button type="button" class="s-del" data-del-id="${esc(it.id)}" title="${tt("Listeden kaldır", "ลบออกจากรายการ")}">🗑 ${tt("Sil", "ลบ")}</button>
    </div>
    ${isUpd ? `<div class="saved-ok-msg">✓ ${tt(`Bilgiler ve puan güncellendi — Güncel skor: ${condoScoreText(it)} puan`, `อัปเดตข้อมูลและคะแนนเรียบร้อยแล้ว (${condoScoreText(it)} คะแนน)`)}</div>` : ""}
  </li>`;
}

function syncSavedBadge() {
  const n = SAVED.length;
  const isSavedTab = viewTab === "saved";
  if ($("#savedtab")) {
    $("#savedtab").textContent = isSavedTab
      ? tt(`✕ Kaydedilenleri Kapat (${n})`, `✕ ปิดรายการที่บันทึก (${n})`)
      : tt(`⭐ Kaydedilenler (${n})`, `⭐ ที่บันทึก (${n})`);
  }
  if ($("#savedclose")) {
    $("#savedclose").textContent = tt("✕ Kapat", "✕ ปิด");
  }
  if (typeof updateMobChips === "function") updateMobChips();
}

function markSavedUpdated(id) {
  lastUpdatedSavedId = id;
  clearTimeout(lastUpdatedTimer);
  syncSavedBadge();
  render(true);
  lastUpdatedTimer = setTimeout(() => {
    if (lastUpdatedSavedId === id) {
      lastUpdatedSavedId = null;
      syncSavedBadge();
      if (viewTab === "saved") renderSaved(false);
    }
  }, 2600);
}

function closeSavedView() {
  setSavedBoxOpen(false);
  if (viewTab === "saved") {
    setViewTab(prevNonSavedTab || "circle");
  }
}

async function loadSaved() {
  const city = $("#city")?.value || "bangkok";
  try {
    const d = await api(`/api/saved_condos?city=${encodeURIComponent(city)}`);
    SAVED = (d && d.items) || [];
    syncSavedBadge();
  } catch (_) {}
}

async function saveCondoPayload(payload) {
  const city = $("#city")?.value || "bangkok";
  const d = await api("/api/saved_condos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add", city, ...payload }),
  });
  if (d && d.ok) {
    SAVED = d.items || [];
    syncSavedBadge();
    return d;
  }
  throw new Error((d && d.error) || "Kaydedilemedi");
}

async function updateSavedField(id, patch) {
  const city = $("#city")?.value || "bangkok";
  const d = await api("/api/saved_condos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", city, id, ...patch }),
  });
  if (d && d.ok) {
    SAVED = d.items || [];
    syncSavedBadge();
    if (viewTab === "saved") renderSaved(false);
  }
}

async function deleteSavedId(id) {
  const city = $("#city")?.value || "bangkok";
  const d = await api("/api/saved_condos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", city, id }),
  });
  if (d && d.ok) {
    SAVED = d.items || [];
    syncSavedBadge();
    render(true);
  }
}

function poolPtsTxt(it) {
  return ptsTxt(it) + ` · ${tt("veri kapsamı", "ข้อมูลครอบคลุม")} %${it.coverage ?? 0}`;
}

function savedPopup(it) {
  const mo = tt("ay", "เดือน");
  const bTitle = savedBuildingTitle(it);
  const badges = (it.badges || []).map((k) => `<span class="tag pbadge">${BADGE_TR[k] || k}</span>`).join("");
  const bts = it.transit ? `🚇 ${esc(it.transit.replace(/_/g, " "))} ${fmt((it.transit_km || 0) * 1000)} m` : "";
  const yr = it.year ? yearTxt(it) : "";
  const fl = it.floor ? `<b>${tt(`${esc(it.floor)}. kat`, `ชั้น ${esc(it.floor)}`)}</b>` : tt("kat ?", "ชั้น ?");
  return `<div class="pop condo">
    ${it.img ? `<div class="imgs"><figure><a href="${esc(it.url)}" target="_blank" rel="noopener"><img src="${esc(it.img)}" alt=""></a></figure></div>` : ""}
    <div><span class="pool-score-box" data-score-saved="${esc(it.id)}" title="${tt("Tıkla: Puan kazanç ve kesinti karnesini gör", "คลิกเพื่อดูรายละเอียดคะแนน")}">🏆 #${it.pool_rank} · ${condoScoreText(it)}/100</span> ${badges}</div>
    <h3 style="margin-top:5px">${esc(bTitle)}</h3>
    <div class="cy"><b>${it.price ? "฿" + fmt(it.price) + "/" + mo : tt("Fiyat girilmedi", "ยังไม่ระบุราคา")}</b>
      · ${it.size ? fmt(it.size) + " m²" : "m² ?"}${it.ppsm ? ` (${fmt(it.ppsm)} ฿/m²)` : ""}
      ${BR_TR[it.br] ? " · " + BR_TR[it.br] : ""} · ${fl}</div>
    <div class="muted">${[it.district, bts, yr].filter(Boolean).join(" · ")}</div>
    <div class="pool-pts" style="margin-top:5px">${poolPtsTxt(it)}</div>
    <div style="margin-top:5px">${rateButtonsHtml(it)}</div>
    ${it.note ? `<div class="note">📝 ${esc(it.note)}</div>` : ""}
    <div class="links">
      ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${tt("İlan Linkini Aç ↗", "เปิดลิงก์ประกาศ ↗")}</a>` : ""}
    </div>
  </div>`;
}

function renderSaved(fitMap = true) {
  pinLayer.clearLayers();
  markers.clear();
  const n = SAVED.length;
  const closeBtn = `<button type="button" class="mini saved-close-btn close-saved-inline" style="margin-left:6px">${tt("✕ Sekmeyi Kapat (Tüm İlanlara Dön)", "✕ ปิดแท็บ (กลับไปดูทั้งหมด)")}</button>`;
  $("#summary").innerHTML = (n
    ? esc(tt(
        `⭐ Kaydedilen Condolar · ${n} aday bina emsalleriyle puanlandı (Kira 40 · İstasyon 20 · Bina yaşı 37 · Gece çevresi 3; kişisel beğenin ayrı)`,
        `⭐ คอนโดที่บันทึกไว้ · เปรียบเทียบ ${n} รายการในกลุ่มเดียวกัน`
      ))
    : esc(tt(
        "⭐ Henüz kaydedilmiş condo yok — yukarıdaki kutuya beğendiğin condo linklerini yapıştırıp “+ Kaydet”e bas ya da haritadaki condolarda “☆ Kaydet” butonuna tıkla.",
        "⭐ ยังไม่มีคอนโดที่บันทึกไว้ — วางลิงก์ด้านบนแล้วกด “+ บันทึก” หรือกด “☆ บันทึก” บนการ์ดคอนโด"
      ))) + " " + closeBtn;

  const bounds = [];
  SAVED.forEach((it, idx) => {
    if (it.lat && it.lng) {
      bounds.push([it.lat, it.lng]);
      const icon = L.divIcon({
        className: "pinwrap",
        html: `<span class="pin spin${idx === 0 ? " top1" : ""}${it.id === selId ? " sel" : ""}">#${it.pool_rank} · ${condoScoreText(it)}p</span>`,
      });
      const m = L.marker([it.lat, it.lng], { icon, zIndexOffset: 3000 - idx, riseOnHover: true })
        .bindPopup(() => savedPopup(it), { maxWidth: 360, minWidth: window.innerWidth <= 820 ? 245 : 310, autoPanPadding: [10, 10] })
        .on("click", () => select(it.id, false));
      m.addTo(pinLayer);
      markers.set(it.id, m);
    }
  });
  if (fitMap && bounds.length >= 2) {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  } else if (fitMap && bounds.length === 1) {
    map.setView(bounds[0], 15);
  }

  $("#list").innerHTML = SAVED.map(savedCardHtml).join("");
}

function focusSavedCard(id) {
  if (viewTab !== "saved") setViewTab("saved");
  setTimeout(() => {
    const el = document.querySelector(`#list li[data-id="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      select(id, false);
    }
  }, 60);
}

$("#savedclose")?.addEventListener("click", () => {
  closeSavedView();
});
$("#saveadd")?.addEventListener("click", async () => {
  const url = ($("#saveurl")?.value || "").trim();
  const bname = ($("#savebname")?.value || "").trim();
  if (!url && !bname) {
    if ($("#savemsg")) $("#savemsg").textContent = tt("⚠ Lütfen bir condo ilan linki yapıştırın.", "⚠ กรุณาวางลิงก์ประกาศคอนโด");
    return;
  }
  const btn = $("#saveadd");
  btn.disabled = true;
  if ($("#savemsg")) $("#savemsg").textContent = tt("İlan bilgileri çözümleniyor ve puanlanıyor…", "กำลังดึงข้อมูลและคำนวณคะแนน…");
  try {
    setSavedBoxOpen(true);
    const res = await saveCondoPayload({
      url,
      building_name: bname,
      price: $("#saveprice")?.value || null,
      size: $("#savesize")?.value || null,
      floor: $("#savefloor")?.value || null,
      user_rating: $("#saverate")?.value || null,
      note: $("#savenote")?.value || "",
    });
    for (const id of ["#saveurl", "#savebname", "#saveprice", "#savesize", "#savefloor", "#saverate", "#savenote"]) {
      if ($(id)) $(id).value = "";
    }
    if ($("#savemore")) $("#savemore").open = false;
    if ($("#savemsg")) $("#savemsg").textContent = tt(`✓ Kaydedildi! Aşağıdaki 1–10 butonlarıyla kendi puanını verebilirsin.`, `✓ บันทึกแล้ว! กดปุ่ม 1–10 ด้านล่างเพื่อให้คะแนนส่วนตัว`);
    if (res && res.id) focusSavedCard(res.id);
  } catch (e) {
    if ($("#savemsg")) $("#savemsg").textContent = `⚠ ${e.message}`;
  } finally {
    btn.disabled = false;
  }
});
$("#saveurl")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("#saveadd")?.click();
  }
});

async function saveRowFromWrap(wrap) {
  if (!wrap) return;
  const sid = wrap.dataset.sid;
  const card = wrap.closest("li.saved-card");
  const activeRateBtn = card ? card.querySelector(".rate-btn.on[data-rate-val]") : null;
  const btn = wrap.querySelector(".s-save");
  if (btn) {
    btn.disabled = true;
    btn.textContent = tt("⏳ Kaydediliyor…", "⏳ กำลังบันทึก…");
  }
  const patch = {
    price: wrap.querySelector(".s-price")?.value ?? "",
    size: wrap.querySelector(".s-size")?.value ?? "",
    floor: wrap.querySelector(".s-floor")?.value ?? "",
    note: wrap.querySelector(".s-note")?.value ?? "",
  };
  if (activeRateBtn) {
    patch.user_rating = Number(activeRateBtn.dataset.rateVal);
  }
  await updateSavedField(sid, patch);
  markSavedUpdated(sid);
}

document.addEventListener("click", async (e) => {
  const closeInline = e.target.closest(".close-saved-inline");
  if (closeInline) {
    e.preventDefault();
    e.stopPropagation();
    closeSavedView();
    return;
  }
  const rb = e.target.closest(".rate-btn[data-rate-id]");
  if (rb) {
    e.preventDefault();
    e.stopPropagation();
    const sid = rb.dataset.rateId;
    const val = Number(rb.dataset.rateVal);
    const cur = SAVED.find((x) => x.id === sid);
    const nextVal = cur && Number(cur.user_rating) === val ? "" : val;
    const card = rb.closest("li.saved-card");
    const wrap = card ? card.querySelector(".saved-controls[data-sid]") : null;
    const patch = { user_rating: nextVal };
    if (wrap) {
      patch.price = wrap.querySelector(".s-price")?.value ?? "";
      patch.size = wrap.querySelector(".s-size")?.value ?? "";
      patch.floor = wrap.querySelector(".s-floor")?.value ?? "";
      patch.note = wrap.querySelector(".s-note")?.value ?? "";
    }
    await updateSavedField(sid, patch);
    markSavedUpdated(sid);
    return;
  }
  const svBtn = e.target.closest(".s-save[data-save-row]");
  if (svBtn) {
    e.preventDefault();
    e.stopPropagation();
    await saveRowFromWrap(svBtn.closest(".saved-controls[data-sid]"));
    return;
  }
  const sb = e.target.closest(".savebtn");
  if (sb) {
    e.preventDefault();
    e.stopPropagation();
    const existingId = sb.dataset.savedId;
    if (existingId) {
      focusSavedCard(existingId);
      return;
    }
    const oldTxt = sb.textContent;
    sb.disabled = true;
    sb.textContent = tt("⏳ Kaydediliyor…", "⏳ กำลังบันทึก…");
    try {
      const uid = sb.dataset.saveUid || "";
      const uurl = sb.dataset.saveUrl || "";
      const res = await saveCondoPayload({
        unit_id: uid,
        url: uurl,
        building_slug: sb.dataset.saveBslug,
        building_name: sb.dataset.saveBname,
        price: sb.dataset.savePrice,
        size: sb.dataset.saveSize,
        floor: sb.dataset.saveFloor,
        br: sb.dataset.saveBr,
        img: sb.dataset.saveImg,
      });
      if (res && res.id) {
        // Harita popup'ını kapatmadan hem popup içindeki hem listedeki aynı daire butonlarını güncelle
        for (const btn of document.querySelectorAll(".savebtn")) {
          if ((uid && btn.dataset.saveUid === uid) || (uurl && btn.dataset.saveUrl === uurl) || btn === sb) {
            btn.classList.add("on");
            btn.dataset.savedId = res.id;
            btn.textContent = tt("★ Kayıtlı · Puanla", "★ บันทึกแล้ว · ให้คะแนน");
            btn.title = tt("Kayıtlı — tıklayınca puanlama ve kıyas listesini açar", "บันทึกแล้ว — คลิกเพื่อเปิดหน้าให้คะแนนและเปรียบเทียบ");
          }
        }
      } else {
        sb.textContent = oldTxt;
      }
      if (viewTab === "saved") {
        render(true);
        if (res && res.id) focusSavedCard(res.id);
      }
    } catch (err) {
      sb.textContent = oldTxt;
      alert(tt("Kaydetme hatası (yerel sunucu kapalı olabilir): ", "บันทึกไม่สำเร็จ: ") + (err.message || err));
    } finally {
      sb.disabled = false;
    }
    return;
  }
  const delBtn = e.target.closest(".s-del[data-del-id]");
  if (delBtn) {
    e.preventDefault();
    e.stopPropagation();
    await deleteSavedId(delBtn.dataset.delId);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const wrap = e.target.closest(".saved-controls[data-sid]");
    if (wrap) {
      e.preventDefault();
      saveRowFromWrap(wrap);
    }
  }
});

// dil: HTML'deki data-th* öğeleri; Türkçe asılları ilk geçişte data-tr* olarak saklanır
function applyLang() {
  const th = LANG === "th";
  for (const [sel, prop, keep] of [["[data-th]", "textContent", "tr"], ["[data-th-title]", "title", "trTitle"], ["[data-th-ph]", "placeholder", "trPh"]]) {
    const src = sel.slice(1, -1).replace("data-", "").replace(/-(\w)/g, (_, c) => c.toUpperCase());
    for (const el of document.querySelectorAll(sel)) {
      if (el.dataset[keep] === undefined) el.dataset[keep] = el[prop];
      el[prop] = th ? el.dataset[src] : el.dataset[keep];
    }
  }
  document.documentElement.lang = LANG;
  document.title = tt("Dükkan Harita — Tayland kiralık dükkan", "แผนที่ร้านค้า — ร้านค้าให้เช่าในไทย");
  $("#lang").value = LANG;
}
applyLang();
$("#lang").onchange = (e) => {
  LANG = e.target.value === "th" ? "th" : "tr";
  localStorage.setItem("lang", LANG);
  applyLang(); baseControl(); map.closePopup();
  setDrawing(drawing); areaText(); updateStatus();
  if ($("#savemsg")) $("#savemsg").textContent = "";
  syncSavedBadge();
  if (typeof syncMallTabBtn === "function") syncMallTabBtn();
  filtMark();
  renderStations();
  if (CONDO) syncMode();
  for (const k of Object.keys(NOTES)) if (LAY[k]) NOTES[k] = noteOf(LAY[k].group);
  showNotes();
  render(true);
};

(async () => {
  setTimeout(() => map.invalidateSize(), 80);
  if ($("#cmin")) $("#cmin").value = "1";
  if ($("#fupd")) $("#fupd").value = "14";
  filtMark();
  setDrawing(false);
  if (condoOn()) { CONDO = []; bodyMode(); }  // açılış: condo + dükkân birlikte (loadCity yükler)
  let shareUrl = PERMANENT_CLOUD_URL;
  async function syncShare() {
    try {
      if (STATIC_MODE) {
        $("#refresh").style.display = "none";
        if ($("#cloudbtn")) $("#cloudbtn").hidden = true;
        $("#sharebtn").hidden = false;
        shareUrl = location.origin + location.pathname;
        $("#sharebtn").title = tt(`7/24 açık sabit bulut linki (tıkla kopyala): ${shareUrl}`, `ลิงก์คลาวด์เปิดตลอด 24/7 (คลิกเพื่อคัดลอก): ${shareUrl}`);
        $("#chat").hidden = true;
        return;
      }
      const d = await api("/api/share");
      if (!d.local) {
        $("#refresh").style.display = "none";
        if ($("#cloudbtn")) $("#cloudbtn").hidden = true;
        $("#sharebtn").hidden = false;
        shareUrl = d.cloud_url || PERMANENT_CLOUD_URL;
        $("#chat").hidden = true;
        return;
      }
      $("#sharebtn").hidden = false;
      if ($("#cloudbtn")) $("#cloudbtn").hidden = false;
      api("/api/ai").then((a) => { $("#chat").hidden = !a.ok; }).catch(() => {});
      shareUrl = d.cloud_url || d.url || PERMANENT_CLOUD_URL;
      $("#sharebtn").title = `7/24 açık sabit paylaşım linki (tıkla kopyala): ${shareUrl}`;
    } catch (_) {}
  }
  if ($("#cloudbtn")) {
    $("#cloudbtn").onclick = async () => {
      const btn = $("#cloudbtn");
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = tt("⏳ Buluta yükleniyor…", "⏳ กำลังอัปโหลด…");
      try {
        const res = await api("/api/publish_cloud", { method: "POST" });
        if (res && res.ok) {
          shareUrl = res.url || PERMANENT_CLOUD_URL;
          btn.textContent = tt("✓ 7/24 Bulut Güncel!", "✓ อัปเดตคลาวด์แล้ว!");
        } else {
          alert(tt("Bulut yayını hatası: ", "อัปโหลดไม่สำเร็จ: ") + ((res && res.error) || ""));
          btn.textContent = old;
        }
      } catch (e) {
        alert(tt("Bulut yayını hatası: ", "อัปโหลดไม่สำเร็จ: ") + e.message);
        btn.textContent = old;
      } finally {
        btn.disabled = false;
        setTimeout(() => { btn.textContent = old; }, 3500);
      }
    };
  }
  $("#sharebtn").onclick = async () => {
    if (!shareUrl) { await syncShare(); }
    const targetUrl = shareUrl || PERMANENT_CLOUD_URL;
    try {
      await navigator.clipboard.writeText(targetUrl);
      const old = $("#sharebtn").textContent;
      $("#sharebtn").textContent = tt("✓ Link Kopyalandı", "✓ คัดลอกลิงก์แล้ว");
      setTimeout(() => { $("#sharebtn").textContent = old; }, 2000);
    } catch (_) {
      prompt("7/24 açık kalan sabit paylaşım linki:", targetUrl);
    }
  };
  syncShare();
  await loadCities();
  await loadSaved();
  await loadCity();
  setTimeout(() => map.invalidateSize(), 150);
  const s = await api("/api/status");
  if (s.running || s.condo_running) {
    polling = setInterval(poll, 2000);
    poll();
  }
})();

// ------------------------------------------------------------------ Detaylı Puan Karnesi (Kazanç & Kesinti Analizi)
function closeScoreModal() {
  const m = $("#scoremodal");
  if (m) m.hidden = true;
}
if ($("#scoremodalclose")) $("#scoremodalclose").onclick = closeScoreModal;
if ($("#scoremodal")) {
  $("#scoremodal").addEventListener("click", (e) => {
    if (e.target === $("#scoremodal")) closeScoreModal();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#scoremodal") && !$("#scoremodal").hidden) {
    closeScoreModal();
  }
});

function renderScoreItemsHtml(totalScore, maxTotal, items, extraBanner = "") {
  const gain = Math.round(totalScore);
  const loss = Math.max(0, maxTotal - gain);
  const sumHtml = `
    <div class="sc-summary">
      <div class="sc-sum-box total">
        <div class="lbl">${tt("Toplam Puan", "คะแนนรวม")}</div>
        <div class="val">${gain} / ${maxTotal}</div>
      </div>
      <div class="sc-sum-box gain">
        <div class="lbl">${tt("Kazanılan", "คะแนนที่ได้")}</div>
        <div class="val">+${gain}p</div>
      </div>
      <div class="sc-sum-box loss">
        <div class="lbl">${tt("Kesilen", "คะแนนที่ถูกหัก")}</div>
        <div class="val">-${loss}p</div>
      </div>
    </div>
    ${extraBanner}
  `;
  const rowsHtml = items.map((it) => {
    const got = Math.round(it.got * 10) / 10;
    const gotInt = Math.round(it.got);
    const max = it.max;
    const cut = Math.max(0, Math.round((max - it.got) * 10) / 10);
    const cutInt = Math.max(0, max - gotInt);
    const pctFill = Math.max(0, Math.min(100, (it.got / max) * 100));
    const badgeHtml = cutInt > 0
      ? `<span class="sc-gain-pill">+${gotInt} / ${max} ${tt("puan", "คะแนน")}</span><span class="sc-loss-pill">-${cutInt} ${tt("kesildi", "ถูกหัก")}</span>`
      : `<span class="sc-full-pill">✓ +${gotInt} / ${max} (${tt("Tam Puan · 0 Kesinti", "คะแนนเต็ม")})</span>`;
    return `
      <div class="sc-item ${cutInt > 0 ? "has-loss" : "full-pts"}">
        <div class="sc-row-top">
          <span class="sc-cat">${it.icon} ${esc(it.label)}</span>
          <span class="sc-badges">${badgeHtml}</span>
        </div>
        <div class="sc-bar"><div class="sc-bar-fill" style="width:${pctFill}%"></div></div>
        <div class="sc-reason">${it.reason} (<b>${got}/${max}</b>${cut > 0 ? `, <b>-${cut}p</b>` : ""})</div>
      </div>
    `;
  }).join("");
  return sumHtml + rowsHtml;
}

function openCondoScoreModal(b, u) {
  if (!b || !u) return;
  const p = u.pts || {}, unknown = new Set(u.unscored || []);
  const value = (v) => v == null ? tt("Bilinmiyor", "ไม่ทราบ") : `${v}/100`;
  const source = b.wall_evidence?.source;
  const reasons = {
    fiyat: `${condoPriceText(u)} ${tt("En az 3 ayrı emsal; önce ±%15 m², yetersizse ±%25; bilinen oda sayısı eşleşir. İlçe ortalaması kullanılmaz. Emsal fiyatında 24/40; %10 ucuzda 29/40, %20 ucuzda 34/40, %30 ucuzda 38/40, %40 ucuzda 40/40; %35 pahalıda 0/40. Kat, eşya ve yenileme farkları henüz düzeltilmez.", "อย่างน้อย 3 ห้อง ขนาด ±15% ก่อน ขยายถึง ±25% เมื่อจำเป็น จำนวนห้องนอนตรงกัน ราคาเท่าตลาด 24/40 ถูกกว่า 20% ได้ 34/40 ถูกกว่า 40% ได้ 40/40 แพงกว่า 35% ได้ 0/40 ยังไม่ปรับชั้น เฟอร์นิเจอร์และการปรับปรุง")}`,
    yas: b.year > NOW_Y ? `${yearTxt(b)}. ${tt("Gelecekteki yapım yılı tamamlanmış bina yaşı sayılmaz; yaş puanı hesap dışıdır.", "ปีสร้างในอนาคตไม่ถือเป็นอาคารสร้างเสร็จ ไม่คิดคะแนนอายุ")}` : b.year ? `${esc(String(b.year))} · ${NOW_Y - b.year} ${tt("yaş. İlk 3 yıl tam puan. 10 üzerinden: 5 yaş 8, 7 yaş 7, 10 yaş 5, 15 yaş 3, 20 yaş 2, 25 yaş 1, 30 yaş 0,5. Ara yaşlar kesintisiz hesaplanır; sonuç 37 puana ölçeklenir. Yaş bakım veya yapı kalitesinin ölçümü değildir.", "ปี 3 ปีแรกเต็ม 10; อายุ 5/7/10/15/20/25/30 ปีได้ 8/7/5/3/2/1/0.5 ตามลำดับ ลดต่อเนื่องและปรับเป็น 37 คะแนน อายุไม่ได้บอกคุณภาพการดูแลหรือก่อสร้าง")}` : tt("Yapım yılı bilinmiyor.", "ไม่ทราบปีที่สร้าง"),
    bts: b.transit_km != null ? `${esc(b.transit || "")} · ${fmt(b.transit_km * 1000)} m. ${tt("≤100 m: 20/20; sonra her 100 m için 4 puan kesintisiz düşer; 600 m ve üstü: 0/20. Mesafe yürüyüş güzergâhı garantisi değildir.", "≤100 ม.: 20/20 จากนั้นลดต่อเนื่อง 4 คะแนนต่อ 100 ม. ตั้งแต่ 600 ม.: 0/20 ไม่ใช่ระยะเส้นทางเดินจริง")}` : tt("İstasyon mesafesi bilinmiyor.", "ไม่ทราบระยะสถานี"),
    yalitim: b.wall ? `${tt("Kaynaklı yalıtım sınıfı", "ระดับการเก็บเสียงที่มีข้อมูล")}: ${esc(b.wall)}. ${tt("Kaynak", "แหล่งข้อมูล")}: ${esc(String(source || ""))}` : tt("Doğrulanmış yalıtım bilgisi yok. Bina adı, marka ve malzemeden komşu sesi sonucu çıkarılmaz.", "ไม่มีข้อมูลการเก็บเสียงยืนยัน ไม่คาดเดาจากชื่อโครงการหรือวัสดุ"),
    cevre: b.night != null ? `${tt("600 m çevrede bar/kulüp/otel yoğunluğu", "ความหนาแน่นบาร์/คลับ/โรงแรมใน 600 ม.")}: ${pct1(b.night)}. ${tt("Çevresel göstergedir; daire içinde ölçülmüş ses değildir.", "เป็นตัวชี้วัดบริเวณ ไม่ใช่เสียงที่วัดในห้อง")}` : tt("Gece çevresi verisi yok.", "ไม่มีข้อมูลสภาพแวดล้อมกลางคืน"),
    trafik: b.traffic != null ? `${tt("550 m çevrede ana yol yoğunluğu", "ความหนาแน่นถนนใหญ่ใน 550 ม.")}: ${pct1(b.traffic)}. ${tt("Daire içinde ölçülmüş ses değildir.", "ไม่ใช่เสียงที่วัดในห้อง")}` : tt("Trafik verisi yok.", "ไม่มีข้อมูลจราจร")
  };
  $("#scoremodaltitle").innerHTML = `<b>🏢 ${esc(b.name)}</b> — ${tt("Condo Puan Karnesi", "รายละเอียดคะแนนคอนโด")}<div class="muted">฿${fmt(u.price)}/${tt("ay", "เดือน")} · ${fmt(u.size)} m² · ${floorTxt(u)}</div>`;
  const boxes = [[condoPartial(u) ? tt("Uygunluk (kısmi)", "ความเหมาะสม (ข้อมูลไม่ครบ)") : tt("Uygunluk", "ความเหมาะสม"), u.available_max === 0 ? tt("Puan yok", "ไม่มีคะแนน") : `${condoScoreText(u)}/100`], [tt("Yaşam ölçütleri", "ด้านการอยู่อาศัย"), value(u.quality_score)], [tt("Fiyat avantajı", "ความคุ้มค่าราคา"), value(u.value_score)]];
  const summary = `<div class="sc-summary">${boxes.map(([label, v]) => `<div class="sc-sum-box total"><div class="lbl">${label}</div><div class="val">${v}</div></div>`).join("")}</div><div class="sc-cap-warn">${tt("Veri kapsamı", "ข้อมูลครอบคลุม")}: <b>%${u.coverage ?? 100}</b>. ${tt("Bilinmeyenler puana dahil edilmez; bilinen ölçütlerin puanı kendi toplam ağırlığına bölünerek 100'e ölçeklenir. Eksik bilgi tam puan anlamına gelmez. Yaşam ölçütleri; yaş, ulaşım ve çevre göstergeleridir, kapsamlı bina kalite ekspertizi değildir.", "ข้อมูลที่ไม่ทราบไม่รวมในคะแนน ปรับคะแนนจากน้ำหนักที่มีข้อมูลเป็น 100 คะแนน ข้อมูลขาดไม่ได้หมายถึงคะแนนเต็ม ตัวชี้วัดการอยู่อาศัยไม่ใช่การตรวจคุณภาพอาคาร")}</div>`;
  const rows = PTS_TR.map(([key, label, max]) => {
    const infoOnly = max === 0, missing = unknown.has(key), got = p[key] ?? 0;
    const badge = infoOnly ? tt("Yalnız bilgi · puana etkisi yok", "ข้อมูลเท่านั้น · ไม่มีผลต่อคะแนน") : missing ? tt("Bilinmiyor · hesap dışı", "ไม่ทราบ · ไม่รวมคะแนน") : `${got}/${max}`;
    return `<div class="sc-item"><div class="sc-row-top"><span class="sc-cat">${esc(tt(...label))}</span><span class="sc-gain-pill">${badge}</span></div>${missing || infoOnly ? "" : `<div class="sc-bar"><div class="sc-bar-fill" style="width:${Math.max(0, Math.min(100, got / max * 100))}%"></div></div>`}<div class="sc-reason">${reasons[key]}${missing ? ` <b>${tt("Puan kesilmedi.", "ไม่หักคะแนน")}</b>` : ""}</div></div>`;
  }).join("");
  const warning = u.suspect ? `<div class="sc-cap-warn">${tt("İlan benzer dairelerin %45'inden fazla altında; fiyat ve kira dönemi doğrulanmalı.", "ราคาต่ำกว่าห้องเทียบเกิน 45% ควรตรวจสอบราคาและระยะเช่า")}</div>` : "";
  $("#scoremodalbody").innerHTML = summary + warning + rows;
  $("#scoremodal").hidden = false;
}

function openShopScoreModal(r) {
  if (!r) return;
  const pp = r.puan_parca || {};
  const ex = r.extra || {};
  const mo = tt("ay", "เดือน");
  $("#scoremodaltitle").innerHTML = `
    <div><b>🏪 ${esc((r.title || "").slice(0, 68))}</b> — ${tt("Dükkan Puan Karnesi", "รายละเอียดคะแนนร้านค้า")}</div>
    <div class="muted" style="font-size:12.5px;margin-top:2px">
      <b>฿${fmt(r.price_thb)}/${mo}</b> · ${r.size_m2 ? fmt(r.size_m2) + " m²" : "m² ?"}${r.ppsm ? ` (${fmt(r.ppsm)} ฿/m²)` : ""} · ${TYPE_TR[r.ptype] || r.ptype}
    </div>
  `;

  const rawSum = Object.values(pp).reduce((a, b) => a + (b || 0), 0);
  let capBanner = "";
  if ((r.flags || []).includes("ust_kat")) {
    capBanner = `<div class="sc-cap-warn">⚠ <b>${tt("Üst Kat Tavanı Uygulandı:", "จำกัดคะแนนชั้นบน:")}</b> ${tt(`İlan yalnız üst katta (giriş katı değil) olduğu için ham puanı (${Math.round(rawSum)}) dükkan tavanı olan <b>30 puanda</b> kesilmiştir.`, `เฉพาะชั้นบน คะแนนถูกจำกัดสูงสุดที่ 30`)}</div>`;
  } else if (r.score === 40 && ["supheli", "veri_supheli", "devir"].some((f) => (r.flags || []).includes(f))) {
    capBanner = `<div class="sc-cap-warn">⚠ <b>${tt("Uyarı Tavanı (40 Puan):", "จำกัดคะแนนที่ 40:")}</b> ${tt("İlanda devir parası (key money) veya şüpheli veri uyarısı bulunduğu için toplam puan en çok 40 ile sınırlandırılmıştır.", "ประกาศมีค่าเซ้งหรือข้อมูลน่าสงสัย จำกัดสูงสุดที่ 40")}</div>`;
  }

  const dealPct = r.deal != null ? Math.round(r.deal * 100) : null;
  const items = [
    {
      icon: "💰",
      label: tt("Kira Avantajı (Emsale Göre ฿/m²)", "ความคุ้มค่าราคาเช่า"),
      got: pp.fiyat ?? 0,
      max: 55,
      reason: r.expected_ppsm
        ? `${tt("İlan", "ประกาศ")}: <b>${fmt(r.ppsm)} ฿/m²</b> · ${tt("Çevre emsal beklentisi", "ราคาตลาดรอบข้าง")}: <b>${fmt(r.expected_ppsm)} ฿/m²</b> (${dealPct >= 0 ? `%${dealPct} ${tt("ucuz", "ถูกกว่า")}` : `%${Math.abs(dealPct)} ${tt("pahalı", "แพงกว่า")}`}).`
        : tt("Çevrede yeterli emsal bulunamadığı için nötr fiyat puanı verildi.", "มีรายการเทียบไม่พอ"),
    },
    {
      icon: "🚶",
      label: tt("Yaya Kalabalığı & Ticari Yoğunluk", "ความหนาแน่นคนเดิน"),
      got: pp.kalabalik ?? 0,
      max: 15,
      reason: `${tt("Bölge yaya/mekan yoğunluğu", "ความหนาแน่น")}: ${crowdTxt(r)}.`,
    },
    {
      icon: "👥",
      label: tt("Çevre Nüfus Yoğunluğu (3×3 km)", "ความหนาแน่นประชากร"),
      got: pp.nufus ?? 0,
      max: 10,
      reason: r.pop != null ? `${tt("Çevre yerleşik nüfusu", "ประชากร")}: <b>${fmt(r.pop)} ${tt("kişi/km²", "คน/ตร.กม.")}</b> (25.000+ kişi/km² tam 10 puan alır).` : tt("Nüfus verisi yok.", "ไม่มีข้อมูลประชากร"),
    },
    {
      icon: "🚇",
      label: tt("Raylı İstasyon Yakınlığı", "ความใกล้สถานีรถไฟฟ้า"),
      got: pp.istasyon ?? 0,
      max: 10,
      reason: r.station ? `${tt("En yakın istasyon", "สถานีใกล้สุด")}: <b>${esc(r.station.name)} (${fmt(r.station.m)} m)</b>.` : tt("Yakında raylı istasyon yok.", "ไม่มีสถานีใกล้เคียง"),
    },
    {
      icon: "🚪",
      label: tt("Giriş Katı & Cadde Cephesi", "ชั้นล่างและติดถนน"),
      got: pp.kat ?? 0,
      max: 10,
      reason: `${ex.kat ? KAT_TR[ex.kat][2] : tt("Kat belirtilmemiş", "ไม่ระบุชั้น")} · ${ex.cadde ? `<b>${tt("Yola sıfır / cadde üstü (10/10)", "ติดถนน")}</b>` : tt("Ara sokak / içeride", "ในซอย")}.`,
    },
  ];

  $("#scoremodalbody").innerHTML = renderScoreItemsHtml(r.score || 0, 100, items, capBanner);
  $("#scoremodal").hidden = false;
}

function openSavedScoreModal(it) {
  if (!it) return;
  openCondoScoreModal({...it, name: savedBuildingTitle(it)}, it);
  if (it.user_rating != null) $("#scoremodalbody").insertAdjacentHTML("afterbegin", `<div class="sc-cap-warn">⭐ ${tt("Kişisel beğenin", "ความชอบส่วนตัว")}: ${esc(String(it.user_rating))}/10. ${tt("Sistem puanını ve fırsat değerlendirmesini değiştirmez.", "ไม่เปลี่ยนคะแนนระบบหรือการประเมินดีล")}</div>`);
}

document.addEventListener("click", (e) => {
  const condoEl = e.target.closest("[data-score-condo]");
  if (condoEl) {
    e.preventDefault();
    e.stopPropagation();
    const slug = condoEl.getAttribute("data-score-condo");
    const uid = condoEl.getAttribute("data-score-uid");
    const rows = condoRows();
    const b = rows.find((x) => x.slug === slug) || (CONDO || []).find((x) => x.slug === slug);
    if (b) {
      const u = (uid && (b._units || b.rents || []).find((x) => String(x.id) === uid)) || b._best || (b.rents || [])[0];
      if (u) openCondoScoreModal(b, u);
    }
    return;
  }
  const shopEl = e.target.closest("[data-score-shop]");
  if (shopEl) {
    e.preventDefault();
    e.stopPropagation();
    const id = shopEl.getAttribute("data-score-shop");
    const r = (ALL || []).find((x) => x.id === id) || MALL_UNITS.get(id);
    if (r) openShopScoreModal(r);
    return;
  }
  const savedEl = e.target.closest("[data-score-saved]");
  if (savedEl) {
    e.preventDefault();
    e.stopPropagation();
    const id = savedEl.getAttribute("data-score-saved");
    const it = (SAVED || []).find((x) => String(x.id) === String(id));
    if (it) openSavedScoreModal(it);
  }
}, true);
