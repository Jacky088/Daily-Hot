const API = location.origin;

// ============ P0: API 响应缓存 ============
const CACHE_TTL = 30 * 1000; // 30 秒

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function cacheKey(ep, url) { return `cache:${ep.id}:${url}`; }

// 清理过期缓存（每次 init 时调用）
function cacheClean() {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cache:')) {
        try {
          const { ts } = JSON.parse(localStorage.getItem(k));
          if (now - ts > CACHE_TTL * 2) localStorage.removeItem(k);
        } catch { localStorage.removeItem(k); }
      }
    }
  } catch {}
}

const CATS = [
  { id: 'all', name: '全部' },
  { id: 'news', name: '📰 新闻资讯' },
  { id: 'tech', name: '🚀 科技资讯' },
  { id: 'ent', name: '🎬 影视娱乐' },
  { id: 'tools', name: '🛠️ 实用工具' },
  { id: 'life', name: '🌤️ 生活信息' },
  { id: 'fun', name: '🎯 趣味内容' },
  { id: 'trans', name: '🔤 翻译' },
];

// type: news|list|kv|obj|text|json|qr|color|palette|pwd|fanyi|lyric|hash|weather|weatherfc|fuel|gold|lunar|bing|epic|steam|ncm|maoyan|moyu|whois|js|exchange|hist|ainews|kuan|36kr|reddit
const EPS = [
  // 新闻
  { cat:'news', id:'60s', name:'60秒读懂世界', icon:'⏰', path:'/v2/60s', type:'news', auto:1 },
  { cat:'news', id:'weibo', name:'微博热搜', icon:'🔥', path:'/v2/weibo', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link'} },
  { cat:'news', id:'zhihu', name:'知乎热榜', icon:'💡', path:'/v2/zhihu', type:'list', auto:1, f:{t:'title',h:'hot_value_desc',l:'link', d:'detail'} },
  { cat:'news', id:'bili', name:'B站热门', icon:'📺', path:'/v2/bili', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link'} },
  { cat:'news', id:'douyin', name:'抖音热点', icon:'🎵', path:'/v2/douyin', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link'} },
  { cat:'news', id:'toutiao', name:'今日头条', icon:'📰', path:'/v2/toutiao', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link'} },
  { cat:'news', id:'bdhot', name:'百度热搜', icon:'🔍', path:'/v2/baidu/hot', type:'list', auto:1, f:{t:'title',h:'score_desc',l:'url', d:'desc'} },
  { cat:'news', id:'bdtieba', name:'百度贴吧热议', icon:'💬', path:'/v2/baidu/tieba', type:'list', auto:1, f:{t:'title',h:'score_desc',l:'link', d:'abstract'} },
  { cat:'news', id:'history', name:'历史上的今天', icon:'📜', path:'/v2/today-in-history', type:'hist', auto:1 },
  { cat:'news', id:'rednote', name:'小红书热榜', icon:'📕', path:'/v2/rednote', type:'list', auto:1, f:{t:'title',h:'score',l:'link'} },
  { cat:'news', id:'quark', name:'夸克每日资讯', icon:'☁️', path:'/v2/quark', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'summary'} },
  { cat:'news', id:'dongchedi', name:'汽车热榜', icon:'🚗', path:'/v2/dongchedi', type:'list', auto:1, f:{t:'title',h:'score_desc',l:'url'} },

  // 科技
  { cat:'tech', id:'nodeseek', name:'NodeSeek新帖', icon:'🌐', path:'/v2/nodeseek', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'description'} },
  { cat:'tech', id:'v2ex', name:'V2EX热帖', icon:'💬', path:'/v2/v2ex', type:'list', auto:1, f:{t:'title',h:'replies',l:'link', d:'node'} },
  { cat:'tech', id:'let', name:'LowEndTalk', icon:'🖥️', path:'/v2/lowendtalk', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'description'} },
  { cat:'tech', id:'hn', name:'Hacker News', icon:'🟧', path:'/v2/hacker-news/top', type:'list', auto:1, f:{t:'title',h:'score',l:'link'} },
  { cat:'tech', id:'itnews', name:'IT资讯', icon:'💻', path:'/v2/it-news', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'description'} },
  { cat:'tech', id:'kuan', name:'酷安热榜', icon:'📱', path:'/v2/kuan', type:'kuan', auto:1 },
  { cat:'tech', id:'36kr', name:'36氪热榜', icon:'📰', path:'/v2/36kr', type:'36kr', auto:1 },
  { cat:'tech', id:'reddit', name:'Reddit热帖', icon:'👽', path:'/v2/reddit', type:'reddit', auto:1 },
  { cat:'tech', id:'sspai', name:'少数派热榜', icon:'🎨', path:'/v2/sspai', type:'sspai', auto:1 },
  { cat:'tech', id:'huxiu', name:'虎嗅热榜', icon:'🐯', path:'/v2/huxiu', type:'huxiu', auto:1 },

  // 娱乐
  { cat:'ent', id:'maoyan', name:'猫眼历史票房', icon:'🍿', path:'/v2/maoyan/all/movie', type:'maoyan', auto:1 },
  { cat:'ent', id:'bdtv', name:'百度电视剧榜', icon:'🎭', path:'/v2/baidu/teleplay', type:'list', auto:1, f:{t:'title',h:'score_desc',l:'link'} },
  { cat:'ent', id:'douban', name:'豆瓣电影周榜', icon:'🎬', path:'/v2/douban/weekly/movie', type:'douban', auto:1 },
  { cat:'ent', id:'epic', name:'Epic免费游戏', icon:'🎮', path:'/v2/epic', type:'epic', auto:1 },
  { cat:'ent', id:'steam', name:'Steam免费游戏', icon:'🎮', path:'/v2/steam', type:'steam', auto:1 },
  { cat:'ent', id:'ncm', name:'网易云热歌榜', icon:'🎵', path:'/v2/ncm-rank/3778678', type:'ncm', auto:1 },
  { cat:'ent', id:'ncm-soar', name:'网易云飙升榜', icon:'🚀', path:'/v2/ncm-rank/19723756', type:'ncm', auto:1 },
  { cat:'ent', id:'ncm-acg', name:'网易云ACG榜', icon:'🌸', path:'/v2/ncm-rank/71385702', type:'ncm', auto:1 },
  { cat:'ent', id:'billboard', name:'Billboard Hot 100', icon:'🇺🇸', path:'/v2/ncm-rank/60198', type:'ncm', auto:1 },
  { cat:'ent', id:'lyric', name:'歌词搜索', icon:'🎶', path:'/v2/lyric', type:'lyric', auto:0, inputs:[{n:'query',p:'歌名 歌手，如：稻香 周杰伦'}], hint:'精确搜索：使用「歌名 歌手」格式；避免只输入歌词片段' },
  { cat:'ent', id:'changya', name:'唱鸭', icon:'🎤', path:'/v2/changya', type:'changya', auto:1 },

  // 工具
  { cat:'tools', id:'baike', name:'百度百科', icon:'📖', path:'/v2/baike', type:'baike', auto:0, inputs:[{n:'word',p:'关键词',d:'人工智能'}], hint:'查询百度百科词条摘要；输入任意关键词，返回定义、摘要与封面图' },
  { cat:'tools', id:'health', name:'健康计算器', icon:'🧮', path:'/v2/health', type:'health', auto:0, inputs:[{n:'height',p:'身高 50-300cm',d:'175'},{n:'weight',p:'体重 10-300kg',d:'70'},{n:'gender',p:'性别 male 或 female',d:'male'},{n:'age',p:'年龄 1-150岁',d:'30'}], hint:'输入身高(cm)、体重(kg)、性别(male/female)、年龄，计算 BMI、体脂率、基础代谢率等健康指标' },
  { cat:'tools', id:'qr', name:'二维码生成', icon:'📱', path:'/v2/qrcode', type:'qr', auto:0, inputs:[{n:'text',p:'内容',d:'https://github.com/vikiboss/60s'},{n:'size',p:'尺寸',d:'256'}], hint:'内容支持任意文本或链接；尺寸为图片边长像素，默认 256' },
  { cat:'tools', id:'hash', name:'哈希加密', icon:'#️⃣', path:'/v2/hash', type:'hash', auto:0, inputs:[{n:'content',p:'文本',d:'hello'}], hint:'一次性输出 MD5、SHA1/256/512、Base64、URL 编码等常用编解码结果' },
  { cat:'tools', id:'og', name:'网页OG信息', icon:'🌐', path:'/v2/og', type:'og', auto:0, inputs:[{n:'url',p:'URL',d:'github.com'}], hint:'提取网页标题、描述、图标等 OG 元信息；输入域名即可，无需带协议' },
  { cat:'tools', id:'ip', name:'IP查询', icon:'📍', path:'/v2/ip', type:'kv', auto:1, inputs:[{n:'ip',p:'输入 IP，留空查本机',d:''}], keys:[['ip','IP 地址'],['country','国家'],['prov','省份'],['city','城市'],['isp','运营商'],['lat','纬度'],['lng','经度'],['timezone','时区'],['source','数据源']], hint:'自动识别当前访问 IP 的归属地；输入指定 IP 可手动查询' },
  { cat:'tools', id:'whois', name:'WHOIS查询', icon:'🔗', path:'/v2/whois', type:'whois', auto:0, inputs:[{n:'domain',p:'域名',d:'baidu.com'}], hint:'查询域名的注册商、注册/到期时间与 DNS 服务器等注册信息' },
  { cat:'tools', id:'pwd', name:'密码生成', icon:'🔐', path:'/v2/password', type:'pwd', auto:0, inputs:[{n:'length',p:'长度',d:'16'}], hint:'生成含大小写字母、数字、符号的随机强密码；建议长度 16 位以上' },
  { cat:'tools', id:'pwdchk', name:'密码强度检测', icon:'💪', path:'/v2/password/check', type:'kv', auto:0, inputs:[{n:'password',p:'密码',d:'Test123456'}], keys:[['password','密码'],['length','长度'],['score','评分'],['strength','强度'],['entropy','熵值'],['time_to_crack','破解耗时']], hint:'评估密码强度与暴力破解耗时；出于安全考虑，请勿检测真实在用的密码' },
  { cat:'tools', id:'color', name:'随机颜色', icon:'🎨', path:'/v2/color/random', type:'color', auto:1, hint:'随机生成一个颜色，含 RGB/HSL/CMYK 多格式与配色建议' },
  { cat:'tools', id:'palette', name:'配色方案', icon:'🖌️', path:'/v2/color/palette', type:'palette', auto:0, inputs:[{n:'color',p:'hex',d:''}], hint:'输入 hex 颜色值（如 #6366F1）生成互补、类似、三角配色方案；留空则随机' },
  { cat:'tools', id:'chem', name:'化学元素', icon:'⚗️', path:'/v2/chemical', type:'kv', auto:1, keys:[['name','名称'],['formula','分子式'],['mass','平均质量'],['monoisotopicMass','单同位素质量']], hint:'随机展示一个化合物；加 id 参数可查询指定化合物' },

  // 生活
  { cat:'life', id:'wnow', name:'实时天气', icon:'☀️', path:'/v2/weather/realtime', type:'weather', auto:1, inputs:[{n:'query',p:'城市',d:'北京'}] },
  { cat:'life', id:'wfc', name:'天气预报', icon:'🌦️', path:'/v2/weather/forecast', type:'weatherfc', auto:1, inputs:[{n:'query',p:'城市',d:'北京'}] },
  { cat:'life', id:'exrate', name:'汇率', icon:'💱', path:'/v2/exchange-rate', type:'exchange', auto:1 },
  { cat:'life', id:'fuel', name:'油价', icon:'⛽', path:'/v2/fuel-price', type:'fuel', auto:1, inputs:[{n:'region', p:'输入城市名，如：上海 / 广东 / 成都', d:'北京'}] },
  { cat:'life', id:'gold', name:'金价', icon:'🥇', path:'/v2/gold-price', type:'gold', auto:1 },
  { cat:'life', id:'lunar', name:'农历信息', icon:'🌙', path:'/v2/lunar', type:'lunar', auto:1 },
  { cat:'life', id:'moyu', name:'摸鱼日历', icon:'🐟', path:'/v2/moyu', type:'moyu', auto:1 },

  // 趣味
  { cat:'fun', id:'duanzi', name:'随机段子', icon:'😂', path:'/v2/duanzi', type:'quote', auto:1, dk:'duanzi' },
  { cat:'fun', id:'dadjoke', name:'英文冷笑话', icon:'🤣', path:'/v2/dad-joke', type:'quote', auto:1, dk:'content' },
  { cat:'fun', id:'hitokoto', name:'一言', icon:'💬', path:'/v2/hitokoto', type:'quote', auto:1, dk:'hitokoto' },
  { cat:'fun', id:'kfc', name:'KFC疯狂星期四', icon:'🍗', path:'/v2/kfc', type:'quote', auto:1, dk:'kfc' },
  { cat:'fun', id:'fabing', name:'发病文案', icon:'🤪', path:'/v2/fabing', type:'quote', auto:1, dk:'saying' },
  // 已隐藏今日运势：刷新即变、无参考价值；梗百科上移填补此位
  // { cat:'fun', id:'luck', name:'今日运势', icon:'🍀', path:'/v2/luck', type:'kv', auto:1, keys:[['luck_desc','综合运势'],['luck_rank','运势指数'],['luck_tip','今日提示']] },
  { cat:'fun', id:'geng', name:'梗百科', icon:'🎭', path:'/v2/geng', type:'geng', auto:1 },
  { cat:'fun', id:'answer', name:'答案之书', icon:'📖', path:'/v2/answer', type:'answer', auto:1, hint:'心中默念你的问题，点击 ↻ 揭晓答案' },
  { cat:'fun', id:'bing', name:'必应壁纸', icon:'🖼️', path:'/v2/bing', type:'bing', auto:1 },
  { cat:'fun', id:'awjs', name:'JS题目', icon:'🧩', path:'/v2/awesome-js', type:'js', auto:1 },

  // 翻译
  { cat:'trans', id:'fanyi', name:'有道翻译', icon:'🔤', path:'/v2/fanyi', type:'fanyi', auto:0, inputs:[{n:'text',p:'文本',d:'hello'},{n:'from',p:'源语言',d:'en'},{n:'to',p:'目标',d:'zh-CHS'}] },
];

let curCat = 'all';
let jsonMode = {};
let fanyiLangs = null;

// 加载有道翻译支持的语言列表（预加载，不依赖卡片渲染）
async function loadFanyiLangs() {
  if (fanyiLangs) { fillFanyiSelects(); return; }
  try {
    const r = await fetch(API + '/v2/fanyi/langs');
    const j = await r.json();
    if (j.code === 200 && Array.isArray(j.data)) {
      fanyiLangs = j.data.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
      fillFanyiSelects();
    }
  } catch(e) {}
}

function fillFanyiSelects() {
  if (!fanyiLangs) return;
  const opts = fanyiLangs.map(l => `<option value="${l.code}">${l.label}</option>`).join('');
  document.querySelectorAll('select[data-role="fanyi-lang"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = opts;
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  });
}

// ============ Init ============
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// 安全 URL 校验：仅放行 http/https/mailto，其余（javascript:、data: 等）替换为 #
function safeUrl(u) {
  if (!u) return '#';
  try {
    const url = new URL(u, location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? u : '#';
  } catch {
    return '#';
  }
}

// P1: 骨架屏 HTML
const SKELETON_HTML = '<div class="skeleton"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-line-short"></div></div>';

// P1: 重试按钮 HTML
function retryHTML(ep) {
  return `<div class="placeholder"><span class="badge fail">加载失败</span> <button class="retry-btn" onclick="load(window._ep_${ep.id})">点击重试</button></div>`;
}

function init() {
  // P0: 清理过期缓存
  cacheClean();

  // Theme：优先用用户手动保存的偏好，否则跟随系统日间/夜间模式
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.dataset.theme = saved;
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  }
  $('#themeToggle').onclick = () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  };

  // 系统主题变化时，若用户未手动设置过主题则自动跟随
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    }
  });

  // 从 URL hash 恢复分类状态（刷新不丢失）
  const hash = location.hash.replace('#', '');
  if (hash && CATS.some(c => c.id === hash)) curCat = hash;

  const nav = $('#catNav');
  CATS.forEach(c => {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.dataset.cat = c.id;
    if (c.id === curCat) b.classList.add('active');
    b.onclick = () => {
      curCat = c.id;
      location.hash = c.id;
      $$('.cat-nav button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      // 窄屏（分类栏为顶部横向滚动）：将选中的按钮在栏内水平居中，并回到内容顶部
      // 用 nav.scrollTo 直接驱动容器水平滚动，避免 scrollIntoView 与 window.scrollTo 同时触发互相中断
      if (window.innerWidth <= 820) {
        const btnRect = b.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        nav.scrollTo({
          left: nav.scrollLeft + (btnRect.left - navRect.left) - (navRect.width - btnRect.width) / 2,
          behavior: 'smooth',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      render();
    };
    nav.appendChild(b);
  });

  $('#search').oninput = render;

  // 实时时钟（精确到秒）
  // 桌面 / 移动（>360px）：“今天是 2026年8月28日周五 14:23:45”
  // 极窄屏（<=360px）：仅 “14:23:45”，日期隐藏由 CSS 控制
  // 一日进度填充：当前秒数 / 86400 * 100，0:00 起铺满到 24:00
  const timeEls = [$('#clockTimeDesktop'), $('#clockTimeMobile')];
  const dateEls = [$('#clockDateDesktop'), $('#clockDateMobile')];
  const fillEls = document.querySelectorAll('.clock-fill');
  const wdNames = ['日', '一', '二', '三', '四', '五', '六'];
  function pad(n) { return String(n).padStart(2, '0'); }
  function tick() {
    const d = new Date();
    const t = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const ds = `今天是 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${wdNames[d.getDay()]}`;
    timeEls.forEach(el => { if (el) el.textContent = t; });
    dateEls.forEach(el => { if (el) el.textContent = ds; });
    const pct = ((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400) * 100;
    fillEls.forEach(el => { if (el) el.style.width = pct + '%'; });
  }
  tick();
  setInterval(tick, 1000);

  render();

  // P3: 键盘快捷键
  initKeyboardShortcuts();

  // P2: 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function render() {
  const main = $('#main');
  main.innerHTML = '';
  const kw = ($('#search')?.value || '').trim().toLowerCase();

  if (curCat === 'all' && !kw) {
    CATS.filter(c => c.id !== 'all').forEach(c => {
      const eps = EPS.filter(ep => ep.cat === c.id && matchKw(ep, kw));
      if (eps.length === 0) return;
      const sec = document.createElement('div');
      sec.className = 'cat-section';
      sec.innerHTML = `<div class="cat-title">${c.name}<span class="count">${eps.length}</span></div>`;
      const grid = document.createElement('div');
      grid.className = 'grid';
      eps.forEach(ep => {
        const card = makeCard(ep);
        card.style.animationDelay = (eps.indexOf(ep) * 0.03) + 's';
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      main.appendChild(sec);
    });
  } else if (curCat === 'all' && kw) {
    const eps = EPS.filter(ep => matchKw(ep, kw));
    if (eps.length === 0) { main.innerHTML = '<div class="placeholder" style="text-align:center;padding:40px;">无匹配接口</div>'; return; }
    const grid = document.createElement('div');
    grid.className = 'grid';
    eps.forEach(ep => grid.appendChild(makeCard(ep)));
    main.appendChild(grid);
  } else {
    // 只渲染选中的分类
    const selCat = CATS.find(c => c.id === curCat);
    if (selCat) {
      const eps = EPS.filter(ep => ep.cat === curCat && matchKw(ep, kw));
      if (eps.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'cat-section';
        sec.innerHTML = `<div class="cat-title">${selCat.name}<span class="count">${eps.length}</span></div>`;
        const grid = document.createElement('div');
        grid.className = 'grid';
        eps.forEach(ep => {
          const card = makeCard(ep);
          card.style.animationDelay = (eps.indexOf(ep) * 0.03) + 's';
          grid.appendChild(card);
        });
        sec.appendChild(grid);
        main.appendChild(sec);
      }
    }
  }

  if (main.children.length === 0) {
    main.innerHTML = '<div class="placeholder" style="text-align:center;padding:40px;">无匹配接口</div>';
    return;
  }

  // Auto load — 错开请求，避免触发速率限制
  const autoEps = EPS.filter(ep => ep.auto && matchKw(ep, kw) && (curCat === 'all' || curCat === ep.cat));
  autoEps.forEach((ep, i) => {
    setTimeout(() => load(ep), i * 80);
  });
}

function matchKw(ep, kw) {
  if (!kw) return true;
  return ep.name.toLowerCase().includes(kw) || ep.id.includes(kw) || ep.path.includes(kw);
}

function makeCard(ep) {
  // 暴露 ep 到 window 供重试按钮使用
  window['_ep_' + ep.id] = ep;

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'card-' + ep.id;

  const head = document.createElement('div');
  head.className = 'card-head';
  head.innerHTML = `<div class="card-title"><span class="icon">${ep.icon}</span>${ep.name}</div>
    <div class="card-actions">
      <button class="btn-json" title="JSON">{ }</button>
      <button class="btn-refresh" title="刷新">↻</button>
    </div>`;
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'card-body';
  body.id = 'body-' + ep.id;

  if (ep.inputs) {
    if (ep.id === 'fanyi') {
      // 翻译模块:专用布局
      const textInput = document.createElement('textarea');
      textInput.className = 'fanyi-textarea';
      textInput.name = 'text';
      textInput.placeholder = '输入要翻译的文本…';
      textInput.value = ep.inputs.find(i => i.n === 'text')?.d || '';
      body.appendChild(textInput);

      // 语言选择行
      const langRow = document.createElement('div');
      langRow.className = 'fanyi-lang-row';
      const fromSel = document.createElement('select');
      fromSel.name = 'from';
      fromSel.dataset.role = 'fanyi-lang';
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '⇄';
      arrow.title = '交换语言';
      const toSel = document.createElement('select');
      toSel.name = 'to';
      toSel.dataset.role = 'fanyi-lang';
      // 如果语言列表已缓存，直接填充；否则显示加载中
      if (fanyiLangs) {
        const opts = fanyiLangs.map(l => `<option value="${l.code}">${l.label}</option>`).join('');
        fromSel.innerHTML = opts;
        toSel.innerHTML = opts;
        fromSel.value = ep.inputs.find(i => i.n === 'from')?.d || 'en';
        toSel.value = ep.inputs.find(i => i.n === 'to')?.d || 'zh-CHS';
      } else {
        fromSel.innerHTML = `<option value="en">加载中…</option>`;
        toSel.innerHTML = `<option value="zh-CHS">加载中…</option>`;
      }
      // 点击箭头交换语言
      arrow.onclick = () => {
        const tmp = fromSel.value;
        fromSel.value = toSel.value;
        toSel.value = tmp;
      };
      langRow.appendChild(fromSel);
      langRow.appendChild(arrow);
      langRow.appendChild(toSel);
      body.appendChild(langRow);

      // 翻译按钮（独立一行，全宽，触屏友好）
      const go = document.createElement('button');
      go.className = 'fanyi-submit';
      go.textContent = '翻译';
      go.onclick = () => load(ep);
      body.appendChild(go);

      // 异步加载语言列表（如果尚未加载）
      if (!fanyiLangs) loadFanyiLangs();
    } else {
      const row = document.createElement('div');
      row.className = 'input-row';
      ep.inputs.forEach(inp => {
        const el = document.createElement('input');
        el.type = 'text';
        el.name = inp.n;
        el.placeholder = inp.p;
        el.value = inp.d || '';
        row.appendChild(el);
      });
      const go = document.createElement('button');
      go.className = 'go';
      go.textContent = '查询';
      go.onclick = () => load(ep);
      row.appendChild(go);
      body.appendChild(row);
    }
  }

  if (ep.hint) {
    const tip = document.createElement('div');
    tip.className = 'news-tip';
    tip.textContent = '💡 ' + ep.hint;
    body.appendChild(tip);
  }

  const content = document.createElement('div');
  content.id = 'content-' + ep.id;
  // P1: 使用骨架屏替代简单文字
  content.innerHTML = ep.auto ? SKELETON_HTML : '<div class="placeholder">点击查询获取数据</div>';
  body.appendChild(content);

  card.appendChild(body);
  card.querySelector('.btn-refresh').onclick = () => load(ep, true);
  card.querySelector('.btn-json').onclick = () => toggleJson(ep);

  return card;
}

// P0 + P1: load() with cache, skeleton, retry
async function load(ep, forceUpdate = false) {
  const c = document.getElementById('content-' + ep.id);
  if (!c) return;
  c.innerHTML = SKELETON_HTML;
  jsonMode[ep.id] = false;

  let url = API + ep.path;
  const params = new URLSearchParams();
  if (ep.inputs) {
    const card = document.getElementById('card-' + ep.id);
    ep.inputs.forEach(inp => {
      const sel = card.querySelector(`select[name="${inp.n}"]`);
      if (sel && sel.value) { params.set(inp.n, sel.value); return; }
      const el = card.querySelector(`*[name="${inp.n}"]`);
      if (el && el.value) params.set(inp.n, el.value);
    });
  }
  if (ep.type === 'qr') params.set('encoding', 'image');
  const qs = params.toString();
  if (qs) url += '?' + qs;

  const ck = cacheKey(ep, url);

  // 非强制刷新时检查缓存
  if (!forceUpdate) {
    const cached = cacheGet(ck);
    if (cached !== null) {
      // 缓存命中，直接渲染
      if (ep.type === 'qr') {
        c.innerHTML = `<div class="qr-wrap"><img src="${cached}" alt="QR"></div>`;
      } else {
        renderData(ep, cached, c);
      }
      // 后台静默更新 (stale-while-revalidate)
      fetchAndUpdate(ep, url, ck, c);
      return;
    }
  }

  await fetchWithRetry(ep, url, ck, c, 2);
}

// P1: 带重试的 fetch（处理速率限制 + 网络错误）
async function fetchWithRetry(ep, url, ck, c, retriesLeft) {
  try {
    const res = await fetch(url);

    // 速率限制或服务器错误：等待后重试
    if (res.status === 429 || res.status >= 500) {
      if (retriesLeft > 0) {
        await new Promise(r => setTimeout(r, 1500));
        return fetchWithRetry(ep, url, ck, c, retriesLeft - 1);
      }
      if (res.status >= 500) {
        c.innerHTML = `<div class="placeholder"><span class="badge fail">服务器错误 ${res.status}</span> ${res.statusText || '请稍后重试'}</div>`;
      } else {
        c.innerHTML = retryHTML(ep);
      }
      return;
    }

    if (ep.type === 'qr') {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      cacheSet(ck, blobUrl);
      c.innerHTML = `<div class="qr-wrap"><img src="${blobUrl}" alt="QR"></div>`;
      return;
    }
    const json = await res.json();
    if (json.code !== 200) {
      // 速率限制（JSON body 内的 429）：等待后重试
      if ((json.code === 429 || json.code === 428) && retriesLeft > 0) {
        await new Promise(r => setTimeout(r, 1500));
        return fetchWithRetry(ep, url, ck, c, retriesLeft - 1);
      }
      if (retriesLeft > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return fetchWithRetry(ep, url, ck, c, retriesLeft - 1);
      }
      c.innerHTML = `<div class="placeholder"><span class="badge fail">错误 ${json.code}</span> ${esc(json.message)}</div>`;
      return;
    }
    cacheSet(ck, json.data);
    renderData(ep, json.data, c);
  } catch(e) {
    if (retriesLeft > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(ep, url, ck, c, retriesLeft - 1);
    }
    c.innerHTML = retryHTML(ep);
  }
}

// P0: 后台静默更新 (stale-while-revalidate)
async function fetchAndUpdate(ep, url, ck, c) {
  try {
    const res = await fetch(url);
    if (res.status === 429) return; // 速率限制，跳过本次静默更新
    if (ep.type === 'qr') return; // 二维码跳过静默更新
    const json = await res.json();
    if (json.code === 200) {
      cacheSet(ck, json.data);
      // 如果当前仍在显示缓存内容（未被其他操作覆盖），刷新显示
      const current = document.getElementById('content-' + ep.id);
      if (current && current === c && !jsonMode[ep.id]) {
        renderData(ep, json.data, c);
      }
    }
  } catch {}
}

function toggleJson(ep) {
  const c = document.getElementById('content-' + ep.id);
  if (!c) return;
  if (jsonMode[ep.id]) {
    jsonMode[ep.id] = false;
    load(ep);
  } else {
    jsonMode[ep.id] = true;
    fetch(API + ep.path).then(r => r.json()).then(j => {
      c.innerHTML = `<div class="json-view">${esc(JSON.stringify(j, null, 2))}</div>`;
    }).catch(() => load(ep));
  }
}

// ============ Renderers ============
function renderData(ep, d, c) {
  const fn = {
    news: rNews, list: rList, douban: rDouban, ainews: rAINews, hist: rHist,
    kv: rKV, obj: rObj, text: rText, qr: () => {}, color: rColor, palette: rPalette,
    pwd: rPwd, fanyi: rFanyi, lyric: rLyric, hash: rHash, weather: rWeather, changya: rChangya,
    weatherfc: rWeatherFC, fuel: rFuel, gold: rGold, lunar: rLunar, bing: rBing,
    epic: rEpic, steam: rSteam, ncm: rNCM, maoyan: rMaoyan, moyu: rMoyu, whois: rWhois,
    js: rJS, exchange: rExchange, og: rOG, answer: rAnswer, quote: rQuote,
    kuan: rKuan, '36kr': r36Kr, reddit: rReddit, sspai: rSspai, huxiu: rHuxiu,
    baike: rBaike, health: rHealth, geng: rGeng,
  }[ep.type] || rJSON;
  fn(d, c, ep);
}

function rNews(d, c) {
  let h = '';
  if (d.date || d.day_of_week) {
    h += '<div class="news-header">';
    if (d.date) h += `<span>📅 ${esc(d.date)}</span>`;
    if (d.day_of_week) h += `<span>${esc(d.day_of_week)}</span>`;
    if (d.lunar_date) h += `<span>🌙 ${esc(d.lunar_date)}</span>`;
    h += '</div>';
  }
  (d.news || []).forEach((n, i) => {
    const t = typeof n === 'string' ? n : n.title;
    const l = typeof n === 'string' ? '' : n.link;
    h += `<div class="news-item"><span class="num">${i+1}</span>`;
    h += l ? `<a href="${safeUrl(l)}" target="_blank" rel="noopener">${esc(t)}</a>` : `<span class="nt">${esc(t)}</span>`;
    h += '</div>';
  });
  if (d.tip) h += `<div class="news-tip">💡 ${esc(d.tip)}</div>`;
  c.innerHTML = h;
}

function rList(d, c, ep) {
  if (!Array.isArray(d)) return rJSON(d, c);
  if (!d.length) { c.innerHTML = '<div class="placeholder">暂无数据</div>'; return; }
  const f = ep.f || {};
  let h = '';
  d.forEach((it, i) => {
    const rank = it.rank || (i + 1);
    const cls = rank <= 3 ? `top${rank}` : '';
    const t = it[f.t] || it.title || '';
    const l = it[f.l] || it.link || it.url || '';
    const hot = f.h ? it[f.h] : '';
    const desc = f.d ? it[f.d] : '';
    let meta = '';
    if (hot) meta += `<span class="hot">🔥 ${esc(String(hot))}</span>`;
    h += `<div class="item"><span class="rank ${cls}">${rank}</span><div class="body">`;
    h += l ? `<a href="${safeUrl(l)}" target="_blank" rel="noopener">${esc(t)}</a>` : `<span class="t">${esc(t)}</span>`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    if (desc) h += `<div class="desc">${esc(String(desc).slice(0, 80))}${String(desc).length > 80 ? '…' : ''}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

function rDouban(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((it, i) => {
    const rank = it.rank || (i + 1);
    const cls = rank <= 3 ? `top${rank}` : '';
    const l = it.url || it.link || '';
    h += `<div class="item"><span class="rank ${cls}">${rank}</span><div class="body">`;
    h += l ? `<a href="${safeUrl(l)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : `<span class="t">${esc(it.title)}</span>`;
    let meta = '';
    if (it.rating) meta += `⭐ ${esc(String(it.rating))} `;
    if (it.rating_count) meta += `(${esc(String(it.rating_count))}) `;
    if (it.card_subtitle) meta += ` · ${esc(it.card_subtitle)}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

function rAINews(d, c) {
  let h = '';
  if (d.date) h += `<div class="news-header"><span>📅 ${esc(d.date)}</span></div>`;
  (d.news || []).forEach((n, i) => {
    h += `<div class="news-item"><span class="num">${i+1}</span>`;
    h += n.link ? `<a href="${safeUrl(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : `<span class="nt">${esc(n.title)}</span>`;
    h += '</div>';
    if (n.summary) h += `<div class="desc" style="margin-left:22px;font-size:11px;color:var(--text-dim);margin-bottom:2px;">${esc(n.summary)}</div>`;
  });
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
}

function rHist(d, c) {
  let h = `<div class="news-header"><span>📅 ${esc(d.month)}月${esc(d.day)}日</span></div>`;
  (d.items || []).forEach(it => {
    h += `<div class="news-item"><span class="num">${esc(it.year)}</span>`;
    h += it.link ? `<a href="${safeUrl(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : `<span class="nt">${esc(it.title)}</span>`;
    h += '</div>';
  });
  c.innerHTML = h;
}

function rKV(d, c, ep) {
  let h = '<div class="kv">';
  const entries = ep.keys ? ep.keys.map(k => Array.isArray(k) ? [k[0], d[k[0]], k[1]] : [k, d[k]]) : Object.entries(d).map(([k, v]) => [k, v]);
  entries.forEach(([k, v, label]) => {
    if (v == null || v === '') return;
    let disp = typeof v === 'object' ? JSON.stringify(v) : Array.isArray(v) ? v.join(', ') : v;
    h += `<div class="kv-row"><span class="k">${esc(label || k)}</span><span class="v">${esc(String(disp))}</span></div>`;
  });
  h += '</div>';
  c.innerHTML = h;
}

function rObj(d, c, ep) {
  let h = '<div class="kv">';
  const entries = ep.keys ? ep.keys.map(k => [k, d[k]]) : Object.entries(d).slice(0, 10);
  entries.forEach(([k, v]) => {
    if (v == null || v === '') return;
    let disp = typeof v === 'object' ? JSON.stringify(v) : v;
    h += `<div class="kv-row"><span class="k">${esc(k)}</span><span class="v">${esc(String(disp))}</span></div>`;
  });
  h += '</div>';
  c.innerHTML = h;
}

function rOG(d, c) {
  let h = '';
  if (d.image) h += `<div class="img-wrap"><img src="${esc(d.image)}" alt="og"></div>`;
  h += '<div class="kv">';
  if (d.title) h += `<div class="kv-row"><span class="k">标题</span><span class="v">${esc(d.title)}</span></div>`;
  if (d.description) h += `<div class="kv-row"><span class="k">描述</span><span class="v">${esc(d.description)}</span></div>`;
  h += '</div>';
  c.innerHTML = h;
}

function rText(d, c, ep) {
  const t = ep.dk ? d[ep.dk] : (typeof d === 'string' ? d : JSON.stringify(d, null, 2));
  c.innerHTML = `<div class="text-block">${esc(t)}</div>`;
}

function rAnswer(d, c) {
  const zh = d.answer || '';
  const en = d.answer_en || '';
  const idx = d.index != null ? Number(d.index) + 1 : null;
  c.innerHTML = `<div class="answer-book">
    <div class="answer-quote">「</div>
    <div class="answer-zh">${esc(zh)}</div>
    ${en ? `<div class="answer-en">${esc(en)}</div>` : ''}
    <div class="answer-meta">${idx ? `第 ${idx} 个答案` : ''}</div>
  </div>`;
}

// 通用金句卡片：短文本居中衬线排版，长文本左对齐易读
function rQuote(d, c, ep) {
  const t = (ep.dk ? d[ep.dk] : '') || '';
  const idx = d.index != null ? Number(d.index) + 1 : null;
  const isLong = t.length > 64;
  c.innerHTML = `<div class="quote-card${isLong ? ' long' : ''}">
    <div class="quote-mark">“</div>
    <div class="quote-text">${esc(t)}</div>
    ${idx ? `<div class="quote-meta"><i></i><span>第 ${idx} 条</span><i></i></div>` : ''}
  </div>`;
}

function rGeng(d, c) {
  const idx = d.index != null ? Number(d.index) + 1 : null;
  c.innerHTML = `<div class="geng-card">
    <div class="geng-title">${esc(d.title || '')}</div>
    <div class="geng-content">${esc(d.content || '')}</div>
    ${idx ? `<div class="geng-meta">第 ${idx} 个梗</div>` : ''}
  </div>`;
}

function rBaike(d, c) {
  let h = '';
  if (d.cover) h += `<div class="img-wrap"><img src="${esc(d.cover)}" alt="${esc(d.title)}" referrerpolicy="no-referrer"></div>`;
  h += '<div class="kv">';
  if (d.title) h += `<div class="kv-row"><span class="k">词条</span><span class="v">${esc(d.title)}</span></div>`;
  if (d.description) h += `<div class="kv-row"><span class="k">简介</span><span class="v">${esc(d.description)}</span></div>`;
  if (d.abstract) h += `<div class="kv-row"><span class="k">摘要</span><span class="v">${esc(d.abstract)}</span></div>`;
  if (d.has_other) h += `<div class="kv-row"><span class="k">备注</span><span class="v">该词条有多个义项</span></div>`;
  if (d.link) h += `<div class="kv-row"><span class="k">链接</span><span class="v"><a href="${esc(d.link)}" target="_blank">查看完整词条 ↗</a></span></div>`;
  h += '</div>';
  c.innerHTML = h;
}

function rHealth(d, c) {
  const row = (k, v) => (v ? `<div class="kv-row"><span class="k">${k}</span><span class="v">${esc(String(v))}</span></div>` : '');
  const sec = (title, body) => `<div class="health-sec"><div class="health-sec-title">${title}</div><div class="kv">${body}</div></div>`;
  let h = '';
  const bi = d.basic_info || {};
  h += sec('基本信息', row(bi.height_desc || '身高', bi.height) + row(bi.weight_desc || '体重', bi.weight) + row(bi.gender_desc || '性别', bi.gender) + row(bi.age_desc || '年龄', bi.age));
  const bmi = d.bmi || {};
  h += sec('体质指数 BMI', row(bmi.value_desc || 'BMI', bmi.value) + row(bmi.category_desc || '分类', bmi.category) + row(bmi.evaluation_desc || '评价', bmi.evaluation) + row(bmi.risk_desc || '风险', bmi.risk));
  const wa = d.weight_assessment || {};
  h += sec('体重评估', row(wa.status_desc || '状态', wa.status) + row(wa.ideal_weight_range_desc || '理想范围', wa.ideal_weight_range) + row(wa.standard_weight_desc || '标准体重', wa.standard_weight) + row(wa.adjustment_desc || '调整建议', wa.adjustment));
  const me = d.metabolism || {};
  h += sec('代谢与热量', row(me.bmr_desc || '基础代谢率', me.bmr) + row(me.tdee_desc || '每日总消耗', me.tdee) + row(me.recommended_calories_desc || '推荐摄入', me.recommended_calories) + row(me.weight_loss_calories_desc || '减重卡路里', me.weight_loss_calories) + row(me.weight_gain_calories_desc || '增重卡路里', me.weight_gain_calories));
  const bf = d.body_fat || {};
  h += sec('体脂与身体组成', row(bf.percentage_desc || '体脂率', bf.percentage) + row(bf.category_desc || '体脂分类', bf.category) + row(bf.fat_weight_desc || '脂肪重量', bf.fat_weight) + row(bf.lean_weight_desc || '瘦体重', bf.lean_weight));
  const bsa = d.body_surface_area || {};
  h += sec('体表面积', row(bsa.value_desc || '体表面积', bsa.value) + row(bsa.formula_desc || '计算公式', bsa.formula));
  const im = d.ideal_measurements || {};
  h += sec('理想三围参考', row(im.chest_desc || '胸围', im.chest) + row(im.waist_desc || '腰围', im.waist) + row(im.hip_desc || '臀围', im.hip) + (im.note ? row('说明', im.note) : ''));
  const ha = d.health_advice || {};
  const tips = Array.isArray(ha.health_tips) ? ha.health_tips.slice(0, 4).map(t => row('•', t)).join('') : '';
  h += sec('个性化建议', row(ha.daily_water_intake_desc || '每日饮水', ha.daily_water_intake) + row(ha.exercise_recommendation_desc || '运动建议', ha.exercise_recommendation) + row(ha.nutrition_advice_desc || '营养建议', ha.nutrition_advice) + tips);
  if (d.disclaimer) h += `<div class="news-tip">⚠️ ${esc(d.disclaimer)}</div>`;
  c.innerHTML = h;
}

function rColor(d, c) {
  const labels = { hex: 'HEX', name: '色系', rgb: 'RGB', hsl: 'HSL', hsv: 'HSV', cmyk: 'CMYK', brightness: '亮度', complementary: '互补色' };
  let h = `<div class="swatch" style="background:${esc(d.hex||'#000')}"></div><div class="kv">`;
  Object.entries(labels).forEach(([k, label]) => {
    const v = d[k];
    if (v == null || v === '') return;
    // rgb/hsl 等色彩对象自带格式化字符串 (如 "rgb(19, 9, 72)")
    const disp = typeof v === 'object' ? (v.string || JSON.stringify(v)) : v;
    h += `<div class="kv-row"><span class="k">${esc(label)}</span><span class="v">${esc(String(disp))}</span></div>`;
  });
  if (d.analogous?.length) h += `<div class="kv-row"><span class="k">类似色</span><span class="v">${esc(d.analogous.join('、'))}</span></div>`;
  if (d.triadic?.length) h += `<div class="kv-row"><span class="k">三角配色</span><span class="v">${esc(d.triadic.join('、'))}</span></div>`;
  h += '</div>';
  c.innerHTML = h;
}

function rPalette(d, c) {
  let h = '';
  if (d.input) {
    h += `<div class="swatch" style="background:${esc(d.input.hex||'#000')}"></div>`;
    h += `<div class="kv-row"><span class="k">输入</span><span class="v">${esc(d.input.hex||'')} ${esc(d.input.name||'')}</span></div>`;
  }
  if (d.palettes) {
    d.palettes.slice(0, 4).forEach(p => {
      h += `<div style="font-size:11px;font-weight:600;margin:8px 0 4px;">${esc(p.name||'')}</div><div class="palette-grid">`;
      (p.colors||[]).forEach(col => {
        h += `<div class="palette-chip"><div class="c" style="background:${esc(col.hex)}"></div>${esc(col.hex)}</div>`;
      });
      h += '</div>';
    });
  }
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
}

function rChangya(d, c) {
  const u = d.user || {}, s = d.song || {}, a = d.audio || {};
  const gender = u.gender === 'male' ? '♂' : u.gender === 'female' ? '♀' : '';
  let h = '<div class="changya-user">';
  if (u.avatar_url) h += `<img class="changya-avatar" src="${esc(u.avatar_url)}" alt="" onerror="this.style.display='none'">`;
  h += `<div><div style="font-weight:600;">${esc(u.nickname || '')} ${gender}</div>`;
  if (s.name) h += `<div style="font-size:12px;color:var(--text-dim);">演唱《${esc(s.name)}》${s.singer ? ` · 原唱: ${esc(s.singer)}` : ''}</div>`;
  h += '</div></div>';
  const audioUrl = a.url ? a.url.replace(/^http:\/\//, 'https://') : '';
  if (audioUrl) h += `<audio controls preload="none" src="${esc(audioUrl)}" style="width:100%;height:36px;margin:8px 0;"></audio>`;
  if (Array.isArray(s.lyrics) && s.lyrics.length) {
    h += `<div class="text-block" style="margin-top:6px;">${esc(s.lyrics.join('\n'))}</div>`;
  }
  h += '<div class="kv" style="margin-top:8px;">';
  if (a.duration) { const sec = Math.round(a.duration / 1000); h += `<div class="kv-row"><span class="k">时长</span><span class="v">${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</span></div>`; }
  if (a.like_count != null) h += `<div class="kv-row"><span class="k">点赞</span><span class="v">${a.like_count}</span></div>`;
  if (a.publish) h += `<div class="kv-row"><span class="k">发布时间</span><span class="v">${esc(a.publish)}</span></div>`;
  if (a.link) h += `<div class="kv-row"><span class="k">作品链接</span><span class="v"><a href="${safeUrl(a.link)}" target="_blank" rel="noopener">在线收听</a></span></div>`;
  h += '</div>';
  c.innerHTML = h;
}

function rPwd(d, c) {
  const setLabels = { lowercase: '小写字母', uppercase: '大写字母', numbers: '数字', symbols: '特殊符号' };
  const sets = d.character_sets || {};
  const used = Object.keys(setLabels).filter(k => sets[k]).map(k => setLabels[k]);
  const gi = d.generation_info || {};
  const pwd = esc(d.password);
  c.innerHTML = `<div class="pwd-box" data-pwd="${pwd}">${pwd}</div>
    <div class="kv" style="margin-top:8px;"><div class="kv-row"><span class="k">长度</span><span class="v">${d.length}</span></div>
    ${gi.strength ? `<div class="kv-row"><span class="k">强度</span><span class="v">${esc(gi.strength)}</span></div>` : ''}
    ${gi.time_to_crack ? `<div class="kv-row"><span class="k">预估破解耗时</span><span class="v">${esc(gi.time_to_crack)}</span></div>` : ''}
    <div class="kv-row"><span class="k">包含字符</span><span class="v">${esc(used.join('、') || '-')}</span></div></div>`;
  // 点击复制：通过 data 属性取值，避免内联拼接 JS 字符串导致引号注入
  const box = c.querySelector('.pwd-box');
  if (box) {
    box.style.cursor = 'pointer';
    box.onclick = () => {
      const val = box.dataset.pwd || '';
      navigator.clipboard.writeText(val).then(() => {
        box.classList.add('copied');
        box.innerText = '已复制 ✓';
        setTimeout(() => { box.classList.remove('copied'); box.innerText = val; }, 1500);
      });
    };
  }
}

function rFanyi(d, c) {
  let h = '';
  if (d.source) h += `<div class="kv-row"><span class="k">原文</span><span class="v">${esc(d.source.text)} <span style="color:var(--text-dim);font-size:10px;">[${esc(d.source.type_desc)}]</span></span></div>`;
  if (d.target) h += `<div style="padding:8px 10px;background:var(--accent-bg);border-left:2px solid var(--accent);border-radius:4px;margin:6px 0;"><div style="font-size:13px;">${esc(d.target.text)}</div><div style="font-size:10px;color:var(--text-dim);margin-top:2px;">[${esc(d.target.type_desc)}]${d.target.pronounce?' · '+esc(d.target.pronounce):''}</div></div>`;
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
}

function rLyric(d, c) {
  if (!d) { c.innerHTML = '<div class="placeholder">未找到歌词</div>'; return; }
  let h = `<div class="kv-row"><span class="k">🎵</span><span class="v">${esc(d.title)} - ${esc((d.artists||[]).join(', '))}</span></div>`;
  if (d.album) h += `<div class="kv-row"><span class="k">专辑</span><span class="v">${esc(d.album)}</span></div>`;
  if (d.formatted) h += `<div class="text-block" style="margin-top:6px;">${esc(d.formatted)}</div>`;
  c.innerHTML = h;
}

function rHash(d, c) {
  let h = `<div class="kv-row"><span class="k">原文</span><span class="v">${esc(d.source)}</span></div>`;
  if (d.md5) h += `<div class="kv-row"><span class="k">MD5</span><span class="v mono">${esc(d.md5)}</span></div>`;
  if (d.sha) Object.entries(d.sha).forEach(([k, v]) => h += `<div class="kv-row"><span class="k">${k.toUpperCase()}</span><span class="v mono">${esc(v)}</span></div>`);
  if (d.base64) Object.entries(d.base64).forEach(([k, v]) => h += `<div class="kv-row"><span class="k">b64-${k}</span><span class="v mono" style="word-break:break-all;">${esc(v)}</span></div>`);
  c.innerHTML = '<div class="kv">' + h + '</div>';
}

// 城市名去重：优先 city + county（name 可能是"北京北京"这类重复值）
function wxLoc(loc) {
  if (!loc) return '';
  return loc.city ? (loc.city + (loc.county ? ' ' + loc.county : '')) : (loc.name || '');
}

function rWeather(d, c) {
  const w = d.weather || {}, a = d.air_quality || {}, s = d.sunrise || {};
  const alerts = d.alerts || [], life = d.life_indices || [];
  const aqiColors = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444', 5: '#a855f7', 6: '#7f1d1d' };
  let h = `<div class="wx-loc"><span>📍 ${esc(wxLoc(d.location))}</span>${w.updated ? `<span class="wx-upd">更新于 ${esc(w.updated)}</span>` : ''}</div>`;
  alerts.forEach(al => { h += `<div class="wx-alert" title="${esc(al.detail||'')}">⚠️ ${esc(al.type)}${esc(al.level)}预警</div>`; });
  h += '<div class="wx-main">';
  if (w.weather_icon) h += `<img class="wx-icon" src="${esc(w.weather_icon)}" alt="" onerror="this.style.display='none'">`;
  h += `<div class="wx-temp">${esc(String(w.temperature ?? '--'))}°<div class="wx-cond">${esc(w.condition || '')}</div></div></div>`;
  const stats = [];
  if (w.humidity != null) stats.push(['湿度', `${w.humidity}%`]);
  if (w.wind_direction) stats.push(['风力', `${w.wind_direction} ${w.wind_power || ''}${w.wind_power ? '级' : ''}`]);
  if (w.pressure != null) stats.push(['气压', `${w.pressure} hPa`]);
  if (w.precipitation != null) stats.push(['降水量', `${w.precipitation} mm`]);
  if (stats.length) h += `<div class="wx-grid">${stats.map(([k, v]) => `<div class="wx-stat"><span class="k">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>`;
  if (a.aqi != null) {
    h += `<div class="wx-aqi"><span class="wx-aqi-badge" style="background:${aqiColors[a.level] || '#6b7280'}">${esc(a.quality || '')}</span><span>AQI ${esc(String(a.aqi))} · PM2.5 ${esc(String(a.pm25 ?? '-'))} · PM10 ${esc(String(a.pm10 ?? '-'))}${a.rank ? ` · 全国第 ${a.rank}/${a.total_cities} 位` : ''}</span></div>`;
  }
  if (s.sunrise_desc) h += `<div class="wx-sun"><span>🌅 日出 ${esc(s.sunrise_desc)}</span><span>🌇 日落 ${esc(s.sunset_desc)}</span></div>`;
  if (life.length) {
    h += `<div class="wx-life">${life.slice(0, 10).map(li => `<span class="wx-chip" title="${esc(li.description || '')}">${esc(li.name)}·${esc(li.level)}</span>`).join('')}</div>`;
  }
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
}

// 7 日温度曲线 SVG：最高温实线（渐变面积），最低温虚线
function wxTempChart(days, W) {
  const H = 110, padT = 16, padB = 16;
  const n = days.length, colW = W / n;
  const xs = days.map((_, i) => colW * i + colW / 2);
  const maxs = days.map(x => x.max_temperature ?? 0);
  const mins = days.map(x => x.min_temperature ?? 0);
  const hi = Math.max(...maxs), lo = Math.min(...mins);
  const y = t => padT + ((hi + 0.6 - t) / (hi - lo + 1.2)) * (H - padT - padB);
  const smooth = pts => {
    let p = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], mx = (a.x + b.x) / 2;
      p += ` C ${mx.toFixed(1)} ${a.y.toFixed(1)} ${mx.toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return p;
  };
  const maxPts = maxs.map((t, i) => ({ x: xs[i], y: y(t) }));
  const minPts = mins.map((t, i) => ({ x: xs[i], y: y(t) }));
  const maxPath = smooth(maxPts), minPath = smooth(minPts);
  const area = maxPath + ` L ${xs[n - 1].toFixed(1)} ${H} L ${xs[0].toFixed(1)} ${H} Z`;
  let s = `<svg width="${Math.round(W)}" height="${H}" viewBox="0 0 ${Math.round(W)} ${H}" role="img" aria-label="7日温度曲线">`;
  s += `<defs><linearGradient id="wxgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  [0.35, 0.7].forEach(f => s += `<line x1="4" x2="${W - 4}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3 5" stroke-width="0.5"/>`);
  s += `<path d="${area}" fill="url(#wxgrad)"/>`;
  s += `<path d="${minPath}" fill="none" stroke="var(--text-dimmer)" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round"/>`;
  s += `<path d="${maxPath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" style="filter:drop-shadow(0 1px 3px rgba(99,102,241,0.35))"/>`;
  maxPts.forEach((p, i) => {
    s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--accent)" stroke="var(--card)" stroke-width="1.5"/>`;
    s += `<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text)">${esc(String(maxs[i]))}°</text>`;
  });
  minPts.forEach((p, i) => {
    s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--card)" stroke="var(--text-dimmer)" stroke-width="1.5"/>`;
    s += `<text x="${p.x.toFixed(1)}" y="${(p.y + 15).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--text-dim)">${esc(String(mins[i]))}°</text>`;
  });
  return s + '</svg>';
}

function rWeatherFC(d, c) {
  let h = `<div class="wx-loc"><span>📍 ${esc(wxLoc(d.location))}</span><span class="wx-upd">7 日温度趋势 · 24 小时预报</span></div>`;
  const wdNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const daily = (d.daily_forecast || []).filter(x => x.date >= todayStr);
  if (daily.length) {
    const cols = `grid-template-columns:repeat(${daily.length},1fr)`;
    h += `<div class="wx-chart"><div class="wx-chart-head" style="${cols}">`;
    daily.forEach(day => {
      h += `<div class="wxc-col" title="${esc(day.day_condition || '')} 转 ${esc(day.night_condition || '')} · 夜间 ${esc(day.night_wind_direction || '')}${esc(day.night_wind_power || '')}级">${day.day_weather_icon ? `<img src="${esc(day.day_weather_icon)}" alt="" onerror="this.style.display='none'">` : ''}<span>${esc(day.day_condition || '')}</span></div>`;
    });
    h += `</div><div class="wx-chart-svg"></div><div class="wx-chart-foot" style="${cols}">`;
    daily.forEach(day => {
      const isToday = day.date === todayStr;
      h += `<div class="wxc-day${isToday ? ' today' : ''}">${isToday ? '今天' : esc(wdNames[new Date(day.date).getDay()])}</div>`;
    });
    h += '</div></div>';
  }
  const hourly = d.hourly_forecast || [];
  if (hourly.length) {
    h += '<div class="wx-hourly-title">⏱ 24 小时预报（可横向滑动）</div><div class="wx-hourly">';
    hourly.slice(0, 24).forEach(f => {
      h += `<div class="wx-hour"><div class="wx-hour-t">${esc((f.datetime || '').slice(11, 16))}</div><img src="${esc(f.weather_icon || '')}" alt="" onerror="this.style.display='none'"><div class="wx-hour-temp">${esc(String(f.temperature ?? '-'))}°</div><div class="wx-hour-c">${esc(f.condition || '')}</div></div>`;
    });
    h += '</div>';
  }
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
  const box = c.querySelector('.wx-chart-svg');
  if (box && daily.length) box.innerHTML = wxTempChart(daily, box.clientWidth || 280);
}

function rFuel(d, c) {
  // 顶部：位置 + 更新时间
  let h = `<div class="fuel-head"><span class="fuel-region">📍 ${esc(d.region || '')}</span>${d.updated ? `<span class="fuel-updated">更新于 ${esc(d.updated)}</span>` : ''}</div>`;

  // 下次调价预测条
  if (d.trend && d.trend.description) {
    const up = d.trend.direction === '上调', down = d.trend.direction === '下调';
    const cls = up ? 'up' : (down ? 'down' : 'flat');
    const arrow = up ? '▲' : (down ? '▼' : '●');
    h += `<div class="fuel-trend ${cls}"><span class="dir">${arrow} ${esc(d.trend.direction)}</span><span class="desc">${esc(d.trend.change_ton_desc ? '预计' + d.trend.change_ton_desc : '')}${d.trend.change_liter_desc ? ' ' + esc(d.trend.change_liter_desc) : ''}</span><span class="date">⏱ ${esc(d.trend.next_adjustment_date || '')}</span></div>`;
  }

  // 油价卡片网格
  if (Array.isArray(d.items) && d.items.length) {
    const palette = ['#f59e0b', '#6366f1', '#ec4899', '#10b981'];
    h += '<div class="fuel-grid">';
    d.items.forEach((it, i) => {
      h += `<div class="fuel-card" style="--c:${palette[i % 4]}"><span class="name">${esc(it.name)}</span><span class="price">${esc(String(it.price != null ? it.price.toFixed ? it.price.toFixed(2) : it.price : ''))}<small>元/升</small></span></div>`;
    });
    h += '</div>';
  }

  // 历史油价曲线（SVG）
  if (Array.isArray(d.history) && d.history.length > 1) {
    h += rFuelChart(d.history, d.history_region);
  }

  if (d.link) h += `<div class="fuel-link"><a href="${safeUrl(d.link)}" target="_blank" rel="noopener">数据来源详情 →</a></div>`;
  c.innerHTML = h;
}

// 油价历史曲线图（纯 SVG，无依赖）
function rFuelChart(rows, regionName) {
  const series = [
    { key: 'p92', name: '92#汽油', color: '#f59e0b' },
    { key: 'p95', name: '95#汽油', color: '#6366f1' },
    { key: 'p98', name: '98#汽油', color: '#ec4899' },
    { key: 'p0', name: '0#柴油', color: '#10b981' },
  ];
  const W = 560, H = 200, PADL = 34, PADR = 14, PADT = 16, PADB = 24;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const n = rows.length;
  let min = Infinity, max = -Infinity;
  rows.forEach(r => series.forEach(s => {
    const v = r[s.key];
    if (v != null && !isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
  }));
  if (!isFinite(min) || !isFinite(max)) return '';
  if (max - min < 0.4) { const mid = (max + min) / 2; min = mid - 0.2; max = mid + 0.2; }
  else { const pad = (max - min) * 0.08; min -= pad; max += pad; }
  const x = i => PADL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = v => PADT + ih - ((v - min) / (max - min)) * ih;
  let g = '';
  // 网格线 + Y 轴刻度
  for (let i = 0; i <= 4; i++) {
    const gy = PADT + (ih / 4) * i;
    const val = (max - ((max - min) / 4) * i).toFixed(2);
    g += `<line x1="${PADL}" y1="${gy}" x2="${W - PADR}" y2="${gy}" class="fl-grid"/><text x="${PADL - 6}" y="${gy + 3}" class="fl-ylabel" text-anchor="end">${val}</text>`;
  }
  // X 轴日期标注（首/中/尾）
  [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
    const label = (rows[i].date || '').slice(2);
    g += `<text x="${x(i)}" y="${H - 8}" class="fl-xlabel" text-anchor="${i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle')}">${esc(label)}</text>`;
  });
  // 折线 + 92# 面积渐变
  const first = series[0];
  let area = `M ${x(0)} ${y(rows[0][first.key])}`;
  rows.forEach((r, i) => { if (i) area += ` L ${x(i)} ${y(r[first.key])}`; });
  area += ` L ${x(n - 1)} ${PADT + ih} L ${x(0)} ${PADT + ih} Z`;
  series.forEach(s => {
    let pts = '';
    rows.forEach((r, i) => {
      const v = r[s.key];
      if (v != null && !isNaN(v)) pts += `${x(i)},${y(v)} `;
    });
    g += `<polyline points="${pts.trim()}" fill="none" stroke="${s.color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // 92# 面积（在折线下层，重新拼）
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="fuel-chart-svg" role="img">`;
  svg += `<defs><linearGradient id="fuelArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59e0b" stop-opacity="0.18"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<path d="${area}" fill="url(#fuelArea)"/>`;
  svg += g;
  // 最后一点高亮（92#）
  const lastV = rows[n - 1][first.key];
  if (lastV != null && !isNaN(lastV)) {
    svg += `<circle cx="${x(n - 1)}" cy="${y(lastV)}" r="3.2" fill="#f59e0b"/>`;
    svg += `<text x="${x(n - 1)}" y="${y(lastV) - 7}" class="fl-last" text-anchor="end">${lastV.toFixed(2)}</text>`;
  }
  svg += '</svg>';
  // 图例
  let legend = '<div class="fuel-legend">';
  series.forEach(s => { legend += `<span><i style="background:${s.color}"></i>${s.name}</span>`; });
  legend += '</div>';
  const title = regionName ? `${esc(regionName)} · 最近 ${n} 期调价走势` : `最近 ${n} 期调价走势`;
  return `<div class="fuel-chart"><div class="fuel-chart-title">📈 ${title}</div>${svg}${legend}</div>`;
}

function rGold(d, c) {
  let h = '';
  if (d.date) h += `<div class="kv-row"><span class="k">📅</span><span class="v">${esc(d.date)}</span></div>`;
  if (d.metals) {
    d.metals.slice(0, 5).forEach(m => {
      h += `<div class="item"><span class="rank">🥇</span><div class="body"><span class="t">${esc(m.name)}</span><div class="meta">现价 ¥${esc(m.today_price||m.sell_price||'')}/g · 高 ¥${esc(m.high_price||'')} · 低 ¥${esc(m.low_price||'')}</div></div></div>`;
    });
  }
  c.innerHTML = h || rJSON(d, c, true);
}

function rLunar(d, c) {
  let h = '<div class="kv">';
  const s = d.solar || {}, l = d.lunar || {};
  if (s.full) h += `<div class="kv-row"><span class="k">公历</span><span class="v">${esc(s.full)} ${esc(s.week_desc||'')}</span></div>`;
  if (l.desc_short) h += `<div class="kv-row"><span class="k">农历</span><span class="v">${esc(l.desc_short)}</span></div>`;
  const z = d.zodiac;
  if (z && z.year) h += `<div class="kv-row"><span class="k">生肖</span><span class="v">${esc(z.year)}年 ${esc(z.month)}月 ${esc(z.day)}日 ${esc(z.hour)}时</span></div>`;
  const t = d.term;
  if (t && (t.today || t.stage?.name)) {
    const txt = t.today ? `今日${t.today}` : `${t.stage.name} 第${t.stage.position}天`;
    h += `<div class="kv-row"><span class="k">节气</span><span class="v">${esc(txt)}</span></div>`;
  }
  if (d.constellation?.name) h += `<div class="kv-row"><span class="k">星座</span><span class="v">${esc(d.constellation.name)}</span></div>`;
  const f = d.festival;
  const ftxt = f ? (f.both_desc || [f.solar, f.lunar].filter(Boolean).join('、')) : '';
  if (ftxt) h += `<div class="kv-row"><span class="k">节日</span><span class="v">${esc(ftxt)}</span></div>`;
  if (d.phase?.name) h += `<div class="kv-row"><span class="k">月相</span><span class="v">${esc(d.phase.name)}</span></div>`;
  const fo = d.fortune;
  if (fo) {
    if (fo.today_luck) h += `<div class="kv-row"><span class="k">今日运势</span><span class="v">${esc(fo.today_luck)}</span></div>`;
    if (fo.career) h += `<div class="kv-row"><span class="k">事业</span><span class="v">${esc(fo.career)}</span></div>`;
    if (fo.money) h += `<div class="kv-row"><span class="k">财运</span><span class="v">${esc(fo.money)}</span></div>`;
    if (fo.love) h += `<div class="kv-row"><span class="k">感情</span><span class="v">${esc(fo.love)}</span></div>`;
  }
  const tb = d.taboo?.day;
  if (tb) {
    if (tb.recommends) h += `<div class="kv-row"><span class="k">宜</span><span class="v">${esc(tb.recommends)}</span></div>`;
    if (tb.avoids) h += `<div class="kv-row"><span class="k">忌</span><span class="v">${esc(tb.avoids)}</span></div>`;
  }
  h += '</div>';
  c.innerHTML = h;
}

function rBing(d, c) {
  let h = '';
  if (d.cover) h += `<div class="img-wrap"><img src="${esc(d.cover)}" alt="bing"></div>`;
  h += '<div class="kv">';
  if (d.copyright) h += `<div class="kv-row"><span class="k">描述</span><span class="v">${esc(d.copyright)}</span></div>`;
  if (d.update_date) h += `<div class="kv-row"><span class="k">日期</span><span class="v">${esc(d.update_date)}</span></div>`;
  h += '</div>';
  c.innerHTML = h;
}

function rEpic(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach(g => {
    h += '<div class="game-card">';
    if (g.cover) h += `<div class="img-wrap"><img src="${esc(g.cover)}" alt="${esc(g.title)}"></div>`;
    h += `<div class="game-title">🎮 ${esc(g.title)}</div>`;
    if (g.description) h += `<div class="desc">${esc(g.description.slice(0, 80))}…</div>`;
    if (g.is_free_now) h += '<span class="game-free">免费</span>';
    if (g.free_end) h += ` <span style="font-size:10px;color:var(--warn);">截止 ${esc(g.free_end)}</span>`;
    if (g.link) h += `<div style="margin-top:4px;"><a href="${safeUrl(g.link)}" target="_blank" rel="noopener" style="font-size:11px;">领取 →</a></div>`;
    h += '</div>';
  });
  c.innerHTML = h;
}

// Steam 免费游戏：复用 epic 的卡片样式
function rSteam(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  if (!d.length) { c.innerHTML = '<div class="placeholder">暂无免费游戏</div>'; return; }
  let h = '';
  d.forEach(g => {
    h += '<div class="game-card">';
    if (g.cover) h += `<div class="img-wrap"><img src="${esc(g.cover)}" alt="${esc(g.title)}" loading="lazy" onerror="this.style.display=\'none\'"></div>`;
    h += `<div class="game-title">🎮 ${esc(g.title)}</div>`;
    if (g.is_free_now) h += '<span class="game-free">免费</span>';
    if (g.original_price) h += ` <span style="font-size:10px;color:var(--text-dim);text-decoration:line-through;">${esc(g.original_price)}</span>`;
    if (g.link) h += `<div style="margin-top:4px;"><a href="${safeUrl(g.link)}" target="_blank" rel="noopener" style="font-size:11px;">领取 →</a></div>`;
    h += '</div>';
  });
  c.innerHTML = h;
}

// 酷安热榜
function rKuan(d, c) {
  if (!d || !d.topics) return rJSON(d, c);
  let h = '';
  d.topics.forEach((t, i) => {
    h += `<div class="item"><span class="rank ${i < 3 ? 'top'+(i+1) : ''}">${i+1}</span><div class="body">`;
    h += `<a href="${safeUrl(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>`;
    let meta = '';
    if (t.hotness) meta += `<span class="hot">🔥 ${esc(String(t.hotness))}</span>`;
    if (t.followers) meta += ` · 👥 ${esc(String(t.followers))}`;
    if (t.comments) meta += ` · 💬 ${esc(String(t.comments))}`;
    if (t.rating && t.rating.score) meta += ` · ⭐ ${esc(String(t.rating.score))}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

// 36氪热榜
function r36Kr(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((e, i) => {
    h += `<div class="item"><span class="rank ${i < 3 ? 'top'+(i+1) : ''}">${e.rank || i+1}</span><div class="body">`;
    h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>`;
    let meta = '';
    if (e.hot) meta += `<span class="hot">🔥 ${esc(e.hot_desc || String(e.hot))}</span>`;
    if (e.author) meta += ` · ${esc(e.author)}`;
    if (e.praise) meta += ` · 👍 ${esc(String(e.praise))}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

// Reddit 热帖
function rReddit(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((e, i) => {
    h += `<div class="item"><span class="rank ${i < 3 ? 'top'+(i+1) : ''}">${e.rank || i+1}</span><div class="body">`;
    h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>`;
    let meta = '';
    if (e.subreddit) meta += `<span class="hot">r/${esc(e.subreddit)}</span>`;
    if (e.author) meta += ` · u/${esc(e.author)}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

// 少数派热榜
function rSspai(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((e, i) => {
    h += `<div class="item"><span class="rank ${i < 3 ? 'top'+(i+1) : ''}">${e.rank || i+1}</span><div class="body">`;
    h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>`;
    let meta = '';
    if (e.hot) meta += `<span class="hot">👍 ${esc(String(e.hot))}</span>`;
    if (e.author) meta += ` · ${esc(e.author)}`;
    if (e.comments) meta += ` · 💬 ${esc(String(e.comments))}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

// 虎嗅热榜
function rHuxiu(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((e, i) => {
    h += `<div class="item"><span class="rank ${i < 3 ? 'top'+(i+1) : ''}">${e.rank || i+1}</span><div class="body">`;
    h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>`;
    let meta = '';
    if (e.hot) meta += `<span class="hot">🔥 ${esc(String(e.hot))}</span>`;
    if (e.author) meta += ` · ${esc(e.author)}`;
    if (e.comments) meta += ` · 💬 ${esc(String(e.comments))}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

function rNCM(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.slice(0, 20).forEach((r, i) => {
    const cls = i < 3 ? `top${i+1}` : '';
    const artistNames = (r.artist || []).map(a => a.name).join('、');
    h += `<div class="item"><span class="rank ${cls}">${i+1}</span><div class="body">`;
    h += r.link ? `<a href="${safeUrl(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : `<span class="t">${esc(r.title)}</span>`;
    let meta = '';
    if (artistNames) meta += esc(artistNames);
    if (r.album?.name) meta += ` · ${esc(r.album.name)}`;
    if (r.duration_desc) meta += ` · ${esc(r.duration_desc)}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    h += '</div></div>';
  });
  c.innerHTML = h;
}

function rMaoyan(d, c) {
  let h = '';
  if (d.update_time) h += `<div class="kv-row"><span class="k">📅</span><span class="v">${esc(d.update_time)}</span></div>`;
  const m = d.movie || d;
  if (m.box_office_desc) h += `<div class="kv-row"><span class="k">总票房</span><span class="v" style="font-size:15px;font-weight:700;color:var(--warn);">${esc(m.box_office_desc||'')}</span></div>`;
  if (m.list) {
    m.list.slice(0, 10).forEach((it, i) => {
      const cls = i < 3 ? `top${i+1}` : '';
      h += `<div class="item"><span class="rank ${cls}">${i+1}</span><div class="body"><span class="t">${esc(it.movie_name)}</span><div class="meta">票房 ${esc(it.box_office_desc||'')} · ${esc(it.sum_box_desc||'')} <span class="hot">🔥${esc(it.box_rate||'')}</span></div></div></div>`;
    });
  }
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
}

function rMoyu(d, c) {
  let h = '';
  if (d.today) h += `<div class="kv-row"><span class="k">📅</span><span class="v">${esc(d.today.isWorkday?'工作日':'休息日')}</span></div>`;
  if (d.progress) {
    [['week','本周'],['month','本月'],['year','本年']].forEach(([k, label]) => {
      const p = d.progress[k];
      if (p && p.percentage != null) {
        h += `<div class="kv-row"><span class="k">${label}</span><span class="v">${esc(String(p.percentage))}% (${esc(String(p.passed))}/${esc(String(p.total))})</span></div>`;
        h += `<div class="progress-bar"><div class="progress-fill" style="width:${p.percentage}%"></div></div>`;
      }
    });
  }
  if (d.moyuQuote) h += `<div class="news-tip">🐟 ${esc(d.moyuQuote)}</div>`;
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
}

function rWhois(d, c) {
  let h = '<div class="kv">';
  [['domain','域名'],['registrar','注册商'],['created','创建日期'],['updated','更新日期'],['expires','过期日期']].forEach(([k, label]) => {
    const v = d[k];
    if (v == null) return;
    const disp = Array.isArray(v) ? v.join(', ') : v;
    h += `<div class="kv-row"><span class="k">${label}</span><span class="v">${esc(String(disp))}</span></div>`;
  });
  if (d.status && d.status.length) h += `<div class="kv-row"><span class="k">状态</span><span class="v">${esc(d.status.join(', '))}</span></div>`;
  h += '</div>';
  c.innerHTML = h;
}

function rJS(d, c) {
  let h = `<div style="font-weight:600;font-size:12px;margin-bottom:6px;">${esc(d.question||'')}</div>`;
  if (d.code) h += `<div class="json-view">${esc(d.code)}</div>`;
  if (d.options) {
    h += '<div style="margin-top:6px;">';
    d.options.forEach((opt, i) => {
      const isAns = d.answer === i || d.answer === opt;
      h += `<div style="padding:3px 8px;margin:2px 0;border-radius:4px;font-size:12px;${isAns?'background:rgba(52,211,153,0.12);color:var(--success);':'background:var(--bg);'}">${String.fromCharCode(65+i)}. ${esc(opt)} ${isAns?'✓':''}</div>`;
    });
    h += '</div>';
  }
  if (d.explanation) h += `<div class="desc" style="margin-top:6px;">${esc(d.explanation)}</div>`;
  c.innerHTML = h;
}

function rExchange(d, c) {
  let h = `<div class="kv-row"><span class="k">基准</span><span class="v">${esc(d.base_code||'')}</span></div>`;
  if (d.rates) {
    const popular = ['USD','EUR','JPY','GBP','HKD','KRW','AUD','CAD','SGD','TWD'];
    const map = {};
    d.rates.forEach(r => { map[r.currency] = r.rate; });
    h += '<div class="kv" style="margin-top:4px;">';
    popular.forEach(code => {
      if (map[code] != null) h += `<div class="kv-row"><span class="k">${code}</span><span class="v">${esc(String(map[code]))}</span></div>`;
    });
    h += '</div>';
  }
  if (d.updated) h += `<div class="meta" style="margin-top:6px;">更新于 ${esc(d.updated)}</div>`;
  c.innerHTML = h;
}

function rJSON(d, c) {
  c.innerHTML = `<div class="json-view">${esc(JSON.stringify(d, null, 2))}</div>`;
}

// ============ P2: Canvas 网格动画（空间分区优化） ============
  const cv = document.getElementById('meshCanvas');
  const cx = cv.getContext('2d');
  let pts = [];
  let meshW = 0, meshH = 0;
  const SPACING = 130; // 网格间距
  let rafId = null;
  let gridMap = new Map(); // 空间分区 map

  function getMeshColors() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return {
      line: dark ? 'rgba(180,120,200,0.09)' : 'rgba(214,150,204,0.10)',
      lineNear: dark ? 'rgba(200,130,220,0.16)' : 'rgba(186,136,196,0.18)',
      dot: dark ? 'rgba(200,130,220,0.45)' : 'rgba(186,136,196,0.30)',
      glow: dark ? 'rgba(180,120,210,0.04)' : 'rgba(208,146,214,0.05)',
    };
  }

  function cellKey(cx, cy) { return cx + ',' + cy; }

  function initMesh() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    meshW = window.innerWidth;
    meshH = window.innerHeight;
    cv.width = meshW * dpr;
    cv.height = meshH * dpr;
    cv.style.width = meshW + 'px';
    cv.style.height = meshH + 'px';
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 生成网格点，每个点有原始位置和偏移
    pts = [];
    const cols = Math.ceil(meshW / SPACING) + 2;
    const rows = Math.ceil(meshH / SPACING) + 2;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const ox = (i - 1) * SPACING;
        const oy = (j - 1) * SPACING;
        pts.push({
          ox, oy, x: ox, y: oy,
          // 每个点独立的浮动参数
          phase: Math.random() * Math.PI * 2,
          speed: 0.0003 + Math.random() * 0.0005,
          amp: 15 + Math.random() * 25,
        });
      }
    }
  }

  function drawMesh(ts) {
    cx.clearRect(0, 0, meshW, meshH);
    const colors = getMeshColors();
    const maxDist = SPACING * 1.6;

    // 更新点位置并重建空间分区
    gridMap.clear();
    for (const p of pts) {
      p.x = p.ox + Math.cos(ts * p.speed + p.phase) * p.amp;
      p.y = p.oy + Math.sin(ts * p.speed * 1.3 + p.phase) * p.amp;
      const gx = Math.floor(p.x / SPACING);
      const gy = Math.floor(p.y / SPACING);
      const key = cellKey(gx, gy);
      if (!gridMap.has(key)) gridMap.set(key, []);
      gridMap.get(key).push(p);
    }

    // 画连线（空间分区：只检查相邻 cell）
    cx.lineWidth = 1;
    for (const p of pts) {
      const gx = Math.floor(p.x / SPACING);
      const gy = Math.floor(p.y / SPACING);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighbors = gridMap.get(cellKey(gx + dx, gy + dy));
          if (!neighbors) continue;
          for (const q of neighbors) {
            if (q === p) continue;
            // 避免重复：只画 id 较小的那对
            if (pts.indexOf(p) >= pts.indexOf(q)) continue;
            const ddx = p.x - q.x, ddy = p.y - q.y;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dist < maxDist) {
              const alpha = 1 - dist / maxDist;
              cx.strokeStyle = colors.line;
              cx.globalAlpha = alpha;
              cx.beginPath();
              cx.moveTo(p.x, p.y);
              cx.lineTo(q.x, q.y);
              cx.stroke();
            }
          }
        }
      }
    }

    // 画节点
    cx.globalAlpha = 1;
    for (const p of pts) {
      cx.fillStyle = colors.dot;
      cx.beginPath();
      cx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      cx.fill();
    }

    rafId = requestAnimationFrame(drawMesh);
  }

  // 主题切换时刷新颜色（无需重建网格）
  const observer = new MutationObserver(() => { /* 颜色在 drawMesh 内实时读取，自动适配 */ });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  initMesh();
  rafId = requestAnimationFrame(drawMesh);

  // 窗口缩放时重建
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cancelAnimationFrame(rafId);
      initMesh();
      rafId = requestAnimationFrame(drawMesh);
    }, 200);
  });

  // 页面不可见时暂停动画，节省资源
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!rafId) {
      rafId = requestAnimationFrame(drawMesh);
    }
  });

// ============ P3: 键盘快捷键 ============
let kbCardIndex = -1;

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    // Escape: 始终生效
    if (e.key === 'Escape') {
      if (isInput) { e.target.blur(); return; }
      // 取消卡片聚焦
      clearKbFocus();
      return;
    }

    // 聚焦搜索框
    if (e.key === '/' && !isInput) {
      e.preventDefault();
      $('#search')?.focus();
      return;
    }

    // 输入框内不触发 j/k/r
    if (isInput) return;

    const cards = [...document.querySelectorAll('.card')];
    if (!cards.length) return;

    if (e.key === 'j') {
      e.preventDefault();
      kbCardIndex = Math.min(kbCardIndex + 1, cards.length - 1);
      setKbFocus(cards[kbCardIndex]);
    } else if (e.key === 'k') {
      e.preventDefault();
      kbCardIndex = Math.max(kbCardIndex - 1, 0);
      setKbFocus(cards[kbCardIndex]);
    } else if (e.key === 'r' && kbCardIndex >= 0 && kbCardIndex < cards.length) {
      e.preventDefault();
      const card = cards[kbCardIndex];
      const id = card.id.replace('card-', '');
      const ep = EPS.find(e => e.id === id);
      if (ep) load(ep, true);
    }
  });
}

function setKbFocus(card) {
  $$('.card.kb-focus').forEach(c => c.classList.remove('kb-focus'));
  if (card) {
    card.classList.add('kb-focus');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function clearKbFocus() {
  $$('.card.kb-focus').forEach(c => c.classList.remove('kb-focus'));
  kbCardIndex = -1;
}

init();







