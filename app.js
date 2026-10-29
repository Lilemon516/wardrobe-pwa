// ===== 电子衣橱 PWA 逻辑 + 本地存储 =====

// --- Service Worker 注册（离线/可安装）---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// --- 存储抽象：优先 IndexedDB，回退 localStorage ---
const USE_IDB = 'indexedDB' in window;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('wardrobeDB', 1);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function loadItems() {
  if (USE_IDB) {
    try {
      const db = await openDB();
      return await new Promise(res => {
        const t = db.transaction('items', 'readonly').objectStore('items').getAll();
        t.onsuccess = () => res(t.result || []);
        t.onerror = () => res([]);
      });
    } catch (e) {}
  }
  return JSON.parse(localStorage.getItem('wcol_items') || '[]');
}
async function saveItem(it) {
  if (USE_IDB) {
    try {
      const db = await openDB();
      await new Promise(res => {
        const t = db.transaction('items', 'readwrite');
        t.objectStore('items').put(it);
        t.oncomplete = () => res();
      });
      return;
    } catch (e) {}
  }
  const arr = JSON.parse(localStorage.getItem('wcol_items') || '[]');
  const i = arr.findIndex(x => x.id === it.id);
  if (i >= 0) arr[i] = it; else arr.push(it);
  localStorage.setItem('wcol_items', JSON.stringify(arr));
}
async function deleteItem(id) {
  if (USE_IDB) {
    try {
      const db = await openDB();
      await new Promise(res => {
        const t = db.transaction('items', 'readwrite');
        t.objectStore('items').delete(id);
        t.oncomplete = () => res();
      });
      return;
    } catch (e) {}
  }
  const arr = JSON.parse(localStorage.getItem('wcol_items') || '[]').filter(x => x.id !== id);
  localStorage.setItem('wcol_items', JSON.stringify(arr));
}

// --- 演示种子数据（首次运行填充）---
const SEED = [
  { name: '米色针织毛衣', cat: '上衣', season: '秋/冬', scene: '工作·休闲', thick: '中等', color: '#D8C9A8', tags: ['通勤', '百搭'], price: 399, img: null, status: 'active' },
  { name: '白色衬衫', cat: '上衣', season: '春/秋', scene: '工作', thick: '薄', color: '#F4F1EA', tags: ['正式'], price: 259, img: null, status: 'active' },
  { name: '直筒牛仔裤', cat: '下装', season: '四季', scene: '百搭', thick: '中等', color: '#6B7B8C', tags: ['百搭'], price: 329, img: null, status: 'active' },
  { name: '西装外套', cat: '外套', season: '春/秋', scene: '正式', thick: '中等', color: '#3A3631', tags: ['正式'], price: 899, img: null, status: 'active' },
  { name: '棕色乐福鞋', cat: '鞋', season: '四季', scene: '通勤', thick: '-', color: '#8A5A3B', tags: ['通勤'], price: 599, img: null, status: 'active' },
  { name: '大象灰托特包', cat: '包', season: '四季', scene: '日常', thick: '-', color: '#9A9A92', tags: ['大容量'], price: 459, img: null, status: 'active' }
];
async function seedIfEmpty() {
  const items = await loadItems();
  if (items.length === 0) {
    for (const s of SEED) await saveItem({ id: 'seed-' + Math.random().toString(36).slice(2), ...s });
  }
}

// --- 工具 ---
const CATS = ['上衣', '下装', '外套', '鞋', '包', '配饰'];
const TAGS = ['通勤', '温柔', '百搭', '正式', '大容量', '运动', '休闲', '复古'];
function activeItems() { return ALL.filter(i => i.status !== 'retired'); }
function retiredItems() { return ALL.filter(i => i.status === 'retired'); }
function fmtPrice(p) { p = Number(p) || 0; return p > 0 ? '¥' + p : '未填价'; }
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function dominantColor(dataUrl) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 24; c.height = 24;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        res(rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n)));
      } catch (e) { res('#CCCCCC'); }
    };
    img.onerror = () => res('#CCCCCC');
    img.src = dataUrl;
  });
}
function guessCat(name) {
  const n = (name || '').toLowerCase();
  if (/(shirt|衬衫|上衣|tee|t恤|卫衣|毛衣|针织|sweater|hoodie|polo)/.test(n)) return '上衣';
  if (/(pant|裤|jean|牛仔|skirt|裙|short|短裤)/.test(n)) return '下装';
  if (/(coat|外套|jacket|西装|风衣|大衣|blazer)/.test(n)) return '外套';
  if (/(shoe|鞋|boot|靴|sneaker|乐福|loafer|sandal)/.test(n)) return '鞋';
  if (/(bag|包|tote|背包|purse|handbag|双肩)/.test(n)) return '包';
  if (/(scarf|围巾|帽|hat|饰|belt|腰带|glasses|眼镜|首饰|jewelry|发带)/.test(n)) return '配饰';
  return '上衣';
}

// --- 全局数据 ---
let ALL = [];
let editingId = null;       // 编辑中的单品 id
let studioOutfits = [];     // 工坊当前搭配
let studioByCat = {};       // 工坊可用单品（按类）
let swapCtx = null;         // 换装上下文 {slide, index}

// --- 渲染：衣橱计数 / 最近 / 回收仓数 ---
async function refreshAll() {
  ALL = await loadItems();
  if (ALL.length === 0) { await seedIfEmpty(); ALL = await loadItems(); }
  const byCat = {};
  activeItems().forEach(it => { byCat[it.cat] = (byCat[it.cat] || 0) + 1; });
  document.querySelectorAll('.cat[data-cat]').forEach(c => {
    const n = byCat[c.dataset.cat] || 0;
    c.querySelector('[data-ct]').textContent = n + ' 件';
  });
  const rec = document.getElementById('recents');
  rec.innerHTML = '';
  activeItems().slice(-8).reverse().forEach(it => {
    const d = document.createElement('div');
    d.className = 'r';
    if (it.img) d.style.backgroundImage = `url(${it.img})`;
    else d.style.background = it.color || '#ccc';
    rec.appendChild(d);
  });
  const ret = retiredItems().length;
  document.getElementById('recycleBtn').textContent = `♻️ 回收仓（${ret}）`;
  if (document.getElementById('p-recycle').classList.contains('show')) renderRecycle();
  if (document.getElementById('p-catdetail').classList.contains('show')) renderCat(currentCat);
  buildStudio();
}

// --- 导航切换 ---
const navItems = document.querySelectorAll('.nav a');
function setActive(el) { navItems.forEach(n => n.classList.remove('on')); if (el) el.classList.add('on'); }
function show(id, navEl) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('show'));
  document.getElementById(id).classList.add('show');
  if (navEl) setActive(navEl);
}
navItems.forEach(a => a.addEventListener('click', () => show(a.dataset.target, a)));

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1200);
}

// --- 首页 换一套 / 保存 ---
const homeSets = [
  { n: ['米色针织毛衣', '直筒牛仔裤', '棕色乐福鞋', '大象灰托特包'], m: ['上衣 · 秋/冬 · 工作', '下装 · 百搭', '鞋 · 通勤', '包 · 大容量'] },
  { n: ['白色衬衫', '西装外套', '黑色西裤', '黑色乐福鞋'], m: ['上衣 · 春/秋', '外套 · 正式', '下装 · 正式', '鞋 · 通勤'] },
  { n: ['连帽卫衣', '运动裤', '小白鞋', '帆布包'], m: ['上衣 · 休闲', '下装 · 运动', '鞋 · 休闲', '包 · 日常'] }
];
let hi = parseInt(localStorage.getItem('wcol_home') || '0', 10) % homeSets.length;
function applyHome() {
  const s = homeSets[hi], cols = document.querySelectorAll('#homeCollage .strip');
  cols.forEach((st, k) => {
    st.querySelector('.nm').textContent = s.n[k];
    st.querySelector('.meta').textContent = s.m[k];
  });
}
applyHome();
document.getElementById('homeChange').addEventListener('click', () => {
  hi = (hi + 1) % homeSets.length; applyHome(); localStorage.setItem('wcol_home', String(hi));
});
document.getElementById('homeSave').addEventListener('click', () => {
  localStorage.setItem('wcol_home', String(hi)); toast('已保存到今日穿搭');
});

// --- 衣橱 → 添加 / 回收仓 ---
const addNav = document.querySelector('.nav a.add');
const wardrobeNav = document.querySelector('.nav a[data-target="p-wardrobe"]');
addNav.addEventListener('click', () => openAdd(null, addNav));
document.getElementById('wardrobeAdd').addEventListener('click', () => openAdd(null, addNav));
document.getElementById('recycleBtn').addEventListener('click', () => { renderRecycle(); show('p-recycle', wardrobeNav); });
document.getElementById('recycleBack').addEventListener('click', () => show('p-wardrobe', wardrobeNav));

// --- 分类详情 ---
let currentCat = null;
document.querySelectorAll('.cat[data-cat]').forEach(c => {
  c.addEventListener('click', () => { currentCat = c.dataset.cat; renderCat(currentCat); show('p-catdetail', wardrobeNav); });
});
document.getElementById('catBack').addEventListener('click', () => show('p-wardrobe', wardrobeNav));

function itemCard(it, context) {
  const card = document.createElement('div');
  card.className = 'item-card';
  const thumb = document.createElement('div');
  thumb.className = 'item-thumb';
  if (it.img) thumb.style.backgroundImage = `url(${it.img})`;
  else thumb.style.background = it.color || '#ccc';
  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = `<div class="item-name">${it.name}</div>
    <div class="item-meta">${it.cat} · ${it.season || '—'} · ${it.scene || '—'}</div>
    <div class="item-price">${fmtPrice(it.price)}</div>`;
  card.appendChild(thumb); card.appendChild(info);
  const acts = document.createElement('div');
  acts.className = 'item-acts';
  if (context === 'cat') {
    const e = document.createElement('div'); e.className = 'btn sm ghost'; e.textContent = '编辑';
    e.onclick = () => openAdd(it, wardrobeNav);
    const t = document.createElement('div'); t.className = 'btn sm danger'; t.textContent = '淘汰';
    t.onclick = () => retire(it.id);
    acts.appendChild(e); acts.appendChild(t);
  } else {
    const r = document.createElement('div'); r.className = 'btn sm ghost'; r.textContent = '恢复';
    r.onclick = () => restore(it.id);
    const d = document.createElement('div'); d.className = 'btn sm danger'; d.textContent = '删除';
    d.onclick = () => destroy(it.id);
    acts.appendChild(r); acts.appendChild(d);
  }
  card.appendChild(acts);
  return card;
}
function renderCat(cat) {
  document.getElementById('catTitle').textContent = cat;
  const list = document.getElementById('catList');
  const items = activeItems().filter(i => i.cat === cat);
  document.getElementById('catSub').textContent = items.length + ' 件单品';
  list.innerHTML = '';
  document.getElementById('catEmpty').style.display = items.length ? 'none' : 'block';
  items.forEach(it => list.appendChild(itemCard(it, 'cat')));
}
function renderRecycle() {
  const list = document.getElementById('recycleList');
  const items = retiredItems();
  list.innerHTML = '';
  document.getElementById('recycleEmpty').style.display = items.length ? 'none' : 'block';
  items.forEach(it => list.appendChild(itemCard(it, 'recycle')));
}
async function retire(id) { const it = ALL.find(x => x.id === id); if (!it) return; it.status = 'retired'; await saveItem(it); toast('已移入回收仓'); refreshAll(); }
async function restore(id) { const it = ALL.find(x => x.id === id); if (!it) return; it.status = 'active'; await saveItem(it); toast('已恢复'); refreshAll(); }
async function destroy(id) { await deleteItem(id); toast('已彻底删除'); refreshAll(); }

// --- 添加 / 编辑单品 ---
const capInput = document.getElementById('capInput');
const capture = document.getElementById('capture');
let captureImg = null;
capture.addEventListener('click', () => capInput.click());
capInput.addEventListener('change', () => {
  const f = capInput.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { captureImg = rd.result; capture.querySelectorAll('span').forEach(s => s.style.display = 'none');
    let im = capture.querySelector('img'); if (!im) { im = document.createElement('img'); capture.appendChild(im); } im.src = captureImg; };
  rd.readAsDataURL(f);
});
const catChips = document.getElementById('catChips');
catChips.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  catChips.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on');
}));
const fColor = document.getElementById('f-color'), fHex = document.getElementById('f-colorhex');
fColor.addEventListener('input', () => fHex.textContent = fColor.value.toUpperCase());
document.querySelectorAll('#tagRow .tag').forEach(t => t.addEventListener('click', () => t.classList.toggle('sel')));

function openAdd(it, navEl) {
  editingId = it ? it.id : null;
  document.getElementById('addTitle').textContent = it ? '编辑单品' : '添加单品';
  document.getElementById('addSub').textContent = it ? '修改信息后保存' : '拍照/上传 · 自动识别标签';
  document.getElementById('f-name').value = it ? it.name : '';
  document.getElementById('f-season').value = it ? (it.season || '') : '';
  document.getElementById('f-scene').value = it ? (it.scene || '') : '';
  document.getElementById('f-thick').value = it ? (it.thick || '') : '';
  document.getElementById('f-price').value = it ? (it.price || '') : '';
  const col = it ? (it.color || '#D8C9A8') : '#D8C9A8';
  fColor.value = col; fHex.textContent = col.toUpperCase();
  captureImg = it ? it.img : null;
  capture.querySelectorAll('span').forEach(s => s.style.display = it && it.img ? 'none' : '');
  let im = capture.querySelector('img');
  if (it && it.img) { if (!im) { im = document.createElement('img'); capture.appendChild(im); } im.src = it.img; }
  else if (im) im.remove();
  catChips.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', it && x.dataset.c === it.cat));
  document.querySelectorAll('#tagRow .tag').forEach(t => t.classList.toggle('sel', it && (it.tags || []).includes(t.dataset.t)));
  show('p-add', navEl);
}
document.getElementById('addBack').addEventListener('click', () => show('p-wardrobe', wardrobeNav));
document.getElementById('toBatch').addEventListener('click', () => show('p-batch', null));
document.getElementById('addSave').addEventListener('click', async () => {
  const selCat = catChips.querySelector('.chip.on');
  const data = {
    name: document.getElementById('f-name').value || '未命名单品',
    cat: selCat ? selCat.dataset.c : '上衣',
    season: document.getElementById('f-season').value,
    scene: document.getElementById('f-scene').value,
    thick: document.getElementById('f-thick').value,
    price: parseFloat(document.getElementById('f-price').value) || 0,
    color: fColor.value,
    tags: Array.from(document.querySelectorAll('#tagRow .tag.sel')).map(t => t.dataset.t),
    img: captureImg
  };
  if (editingId) { const old = ALL.find(x => x.id === editingId); Object.assign(old, data); await saveItem(old); toast('已更新单品'); }
  else { await saveItem({ id: 'it-' + Date.now() + Math.random().toString(36).slice(2, 6), status: 'active', ...data }); toast('单品已录入衣橱'); }
  editingId = null; captureImg = null;
  show('p-wardrobe', wardrobeNav); refreshAll();
});

// --- 批量录入 ---
const batchInput = document.getElementById('batchInput');
const batchDrop = document.getElementById('batchDrop');
let batchRows = [];
batchDrop.addEventListener('click', () => batchInput.click());
batchInput.addEventListener('change', async () => {
  const files = Array.from(batchInput.files || []);
  for (const f of files) {
    const dataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(f); });
    const base = f.name.replace(/\.[^.]+$/, '');
    const cat = guessCat(base);
    const color = await dominantColor(dataUrl);
    batchRows.push({ img: dataUrl, name: base, cat, color, season: '四季', scene: '', price: 0, tags: [] });
  }
  batchInput.value = '';
  renderBatch();
});
function renderBatch() {
  const list = document.getElementById('batchList');
  list.innerHTML = '';
  document.getElementById('batchSave').style.display = batchRows.length ? 'block' : 'none';
  batchRows.forEach((row, idx) => {
    const el = document.createElement('div'); el.className = 'batch-row';
    const catsHtml = CATS.map(c => `<span class="chip ${c === row.cat ? 'on' : ''}" data-i="${idx}" data-c="${c}">${c}</span>`).join('');
    el.innerHTML = `
      <div class="batch-thumb" style="${row.img ? `background-image:url(${row.img})` : 'background:' + row.color}"></div>
      <div class="batch-fields">
        <input class="v b-name" data-i="${idx}" value="${row.name}">
        <div class="chips b-cat" style="margin:6px 0;">${catsHtml}</div>
        <div class="b-2col">
          <input class="v b-season" data-i="${idx}" placeholder="季节" value="${row.season}">
          <input class="v b-scene" data-i="${idx}" placeholder="场景" value="${row.scene}">
        </div>
        <div class="b-2col">
          <input class="v b-price" data-i="${idx}" inputmode="decimal" placeholder="价格¥" value="${row.price || ''}">
          <div class="b-color"><input type="color" class="b-colorin" data-i="${idx}" value="${row.color}"><span>${row.color}</span></div>
        </div>
        <div class="b-del" data-i="${idx}">移除</div>
      </div>`;
    list.appendChild(el);
  });
  // 绑定
  list.querySelectorAll('.b-name,.b-season,.b-scene,.b-price').forEach(inp => inp.addEventListener('input', e => {
    const i = +e.target.dataset.i; batchRows[i][e.target.className.includes('b-name') ? 'name' : e.target.className.includes('b-season') ? 'season' : e.target.className.includes('b-scene') ? 'scene' : 'price'] = e.target.value;
  }));
  list.querySelectorAll('.b-colorin').forEach(inp => inp.addEventListener('input', e => {
    const i = +e.target.dataset.i; batchRows[i].color = e.target.value; e.target.nextElementSibling.textContent = e.target.value.toUpperCase();
  }));
  list.querySelectorAll('.b-cat .chip').forEach(c => c.addEventListener('click', e => {
    const i = +c.dataset.i; batchRows[i].cat = c.dataset.c;
    e.target.parentElement.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on');
  }));
  list.querySelectorAll('.b-del').forEach(d => d.addEventListener('click', e => { batchRows.splice(+e.target.dataset.i, 1); renderBatch(); }));
}
document.getElementById('batchBack').addEventListener('click', () => show('p-add', addNav));
document.getElementById('batchSave').addEventListener('click', async () => {
  for (const row of batchRows) {
    await saveItem({ id: 'it-' + Date.now() + Math.random().toString(36).slice(2, 6), status: 'active',
      name: row.name || '未命名', cat: row.cat, season: row.season, scene: row.scene,
      thick: '', price: parseFloat(row.price) || 0, color: row.color, tags: [], img: row.img });
  }
  toast(`已录入 ${batchRows.length} 件`);
  batchRows = []; renderBatch();
  show('p-wardrobe', wardrobeNav); refreshAll();
});

// --- 工坊：数据驱动 + 换装 ---
const car = document.getElementById('studioCar');
const sdots = document.getElementById('studioDots');
const NEED = ['上衣', '下装', '鞋', '包'];
function buildStudio(randomize) {
  const acts = activeItems();
  studioByCat = {};
  acts.forEach(i => { (studioByCat[i.cat] = studioByCat[i.cat] || []).push(i); });
  const cats = NEED.filter(c => studioByCat[c] && studioByCat[c].length);
  const titles = ['通勤温柔风', '干练职场风', '休闲周末风'];
  studioOutfits = [];
  for (let o = 0; o < 3; o++) {
    const set = { title: titles[o] || ('搭配 ' + (o + 1)), items: [] };
    cats.forEach(c => {
      const arr = studioByCat[c];
      const base = randomize ? Math.floor(Math.random() * arr.length) : 0;
      const pick = arr[(base + o) % arr.length];
      if (pick) set.items.push({ ...pick, slot: c });
    });
    studioOutfits.push(set);
  }
  renderStudio();
}
function renderStudio() {
  car.innerHTML = ''; sdots.innerHTML = '';
  if (studioOutfits.length === 0) {
    car.innerHTML = '<div class="slide"><div class="board"><div class="ot">暂无单品</div><div class="note">请先到衣橱添加上衣/下装/鞋/包</div></div></div>';
    return;
  }
  studioOutfits.forEach((set, si) => {
    const slide = document.createElement('div'); slide.className = 'slide';
    const board = document.createElement('div'); board.className = 'board';
    const ot = document.createElement('div'); ot.className = 'ot'; ot.textContent = set.title; board.appendChild(ot);
    set.items.forEach((it, ii) => {
      const note = document.createElement('div'); note.className = 'note clickable';
      note.innerHTML = `<span class="tape"></span>${it.name}<span class="swap-hint">换</span>`;
      note.onclick = () => openSwap(si, ii);
      board.appendChild(note);
    });
    slide.appendChild(board); car.appendChild(slide);
    const dot = document.createElement('span'); dot.className = 'dot' + (si === 0 ? ' on' : '');
    dot.onclick = () => car.scrollTo({ left: si * car.clientWidth, behavior: 'smooth' });
    sdots.appendChild(dot);
  });
}
car.addEventListener('scroll', () => {
  const i = Math.round(car.scrollLeft / car.clientWidth);
  sdots.querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('on', k === i));
});
document.getElementById('studioGen').addEventListener('click', () => { buildStudio(true); toast('已重新生成搭配'); });
document.getElementById('studioSave').addEventListener('click', () => toast('搭配已保存'));

// --- 换装弹层 ---
const swapMask = document.getElementById('swapMask');
function openSwap(slide, index) {
  const it = studioOutfits[slide].items[index];
  swapCtx = { slide, index };
  document.getElementById('swapTitle').textContent = '换一件 · ' + it.slot;
  const list = document.getElementById('swapList'); list.innerHTML = '';
  const pool = (studioByCat[it.slot] || []).filter(x => x.id !== it.id);
  if (pool.length === 0) { list.innerHTML = '<div class="empty">该分类没有其他单品</div>'; }
  pool.forEach(x => {
    const row = document.createElement('div'); row.className = 'swap-item';
    const th = document.createElement('div'); th.className = 'swap-thumb';
    if (x.img) th.style.backgroundImage = `url(${x.img})`; else th.style.background = x.color;
    const nm = document.createElement('div'); nm.className = 'swap-name'; nm.textContent = x.name + ' · ' + fmtPrice(x.price);
    row.appendChild(th); row.appendChild(nm);
    row.onclick = () => {
      studioOutfits[slide].items[index] = { ...x, slot: it.slot };
      renderStudio(); closeSwap(); toast('已替换');
    };
    list.appendChild(row);
  });
  swapMask.classList.add('show');
}
function closeSwap() { swapMask.classList.remove('show'); swapCtx = null; }
document.getElementById('swapClose').addEventListener('click', closeSwap);
swapMask.addEventListener('click', e => { if (e.target === swapMask) closeSwap(); });

// --- 日历 选中（持久化）---
const calSel = new Set(JSON.parse(localStorage.getItem('wcol_cal') || '[]'));
function applyCal() {
  document.querySelectorAll('#calGrid .day').forEach(d => {
    if (d.classList.contains('emp')) return;
    d.classList.toggle('sel', calSel.has(d.textContent));
  });
}
applyCal();
document.querySelectorAll('#calGrid .day').forEach(d => {
  if (d.classList.contains('emp')) return;
  d.addEventListener('click', () => {
    const n = d.textContent;
    if (calSel.has(n)) calSel.delete(n); else calSel.add(n);
    localStorage.setItem('wcol_cal', JSON.stringify([...calSel])); applyCal();
  });
});

// --- 启动 ---
refreshAll();
