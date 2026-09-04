const API = location.origin;

// ============ P0: API 响应缓存 ============
// 缓存优先策略：30 分钟内切换分类/模块直接读缓存不重新请求，
// 手动点卡片 ↻ 才强制刷新（forceUpdate 绕过缓存）
const CACHE_TTL = 30 * 60 * 1000;

// 发版时递增：让所有旧的 localStorage 缓存失效，
// 否则用户在 TTL 内会继续看到上一版缓存下来的渲染结果
const CACHE_VERSION = 'v8';

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

function cacheKey(ep, url) { return `cache:${CACHE_VERSION}:${ep.id}:${url}`; }

// ============ 方案二：榜单 Top N 折叠 ============
// 榜单类卡片（type:'list'）默认只渲染前 N 条，点击「展开全部」后本地重渲染全部条目，
// 状态按卡片记忆（localStorage），刷新/切分类回来保持用户的展开偏好
const LIST_COLLAPSE_N = 10;
// 各榜单最近一次渲染的原始数据，供展开/收起切换时免请求重渲染
const listData = {};

function isListExpanded(id) {
  try { return localStorage.getItem('list-full:' + id) === '1'; } catch { return false; }
}
function setListExpanded(id, v) {
  try {
    if (v) localStorage.setItem('list-full:' + id, '1');
    else localStorage.removeItem('list-full:' + id);
  } catch {}
}

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
  { id: 'trans', name: '📚 学习工具' },
];

// type: news|list|kv|obj|text|json|qr|color|palette|pwd|fanyi|lyric|hash|weather|weatherfc|fuel|gold|lunar|calendar|bing|epic|steam|ncm|maoyan|moyu|whois|js|exchange|hist|ainews|kuan|36kr|reddit|game2048
const EPS = [
  // 新闻
  // span:2 锚点卡片，桌面端跨两列（移动端单列回退，见 style.css 媒体查询）
  { cat:'news', id:'60s', name:'60秒读懂世界', icon:'⏰', path:'/v2/60s', type:'news', auto:1, span:2 },
  { cat:'news', id:'history', name:'历史上的今天', icon:'📜', path:'/v2/today-in-history', type:'hist', auto:1 },
  { cat:'news', id:'weibo', name:'微博热搜', icon:'🔥', path:'/v2/weibo', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link'} },
  { cat:'news', id:'zhihu', name:'知乎热榜', icon:'💡', path:'/v2/zhihu', type:'list', auto:1, f:{t:'title',h:'hot_value_desc',l:'link', d:'detail', p:'cover', ps:1} },
  { cat:'news', id:'bili', name:'B站热门', icon:'📺', path:'/v2/bili', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link'} },
  { cat:'news', id:'douyin', name:'抖音热点', icon:'🎵', path:'/v2/douyin', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link', p:'cover', ps:1} },
  { cat:'news', id:'toutiao', name:'今日头条', icon:'📰', path:'/v2/toutiao', type:'list', auto:1, f:{t:'title',h:'hot_value',l:'link', p:'cover', ps:1} },
  { cat:'news', id:'aljazeera', name:'Al Jazeera 头条', icon:'🌍', path:'/v2/world-news?source=aljazeera', type:'list', auto:1, f:{t:'title',h:null,l:'link'} },
  { cat:'news', id:'bbcnews', name:'BBC News 头条', icon:'🇬🇧', path:'/v2/world-news?source=bbc', type:'list', auto:1, f:{t:'title',h:null,l:'link'} },
  { cat:'news', id:'cnnnews', name:'CNN News 头条', icon:'📡', path:'/v2/world-news?source=cnn', type:'list', auto:1, f:{t:'title',h:null,l:'link'} },
  { cat:'news', id:'bdhot', name:'百度热搜', icon:'🔍', path:'/v2/baidu/hot', type:'list', auto:1, f:{t:'title',h:'score_desc',l:'url', d:'desc', p:'cover', ps:1} },
  // 已移除百度实时热点：实测 /baidu/realtime 与 /baidu/hot 返回同一份数据，重复
  { cat:'news', id:'bdtieba', name:'百度贴吧热议', icon:'💬', path:'/v2/baidu/tieba', type:'list', auto:1, f:{t:'title',h:'score_desc',l:'link', d:'abstract', p:'avatar', ps:1} },
  // 已隐藏小红书热榜：上游私有接口凭证（2023 年抓包）已被风控拉黑，
  // 持续返回 300013「访问频繁」或空数据，后端 500。恢复需换新数据源。
  // { cat:'news', id:'rednote', name:'小红书热榜', icon:'📕', path:'/v2/rednote', type:'list', auto:1, f:{t:'title',h:'score',l:'link'} },
  { cat:'news', id:'quark', name:'夸克每日资讯', icon:'☁️', path:'/v2/quark', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'summary', p:'cover', ps:1} },
  { cat:'news', id:'dongchedi', name:'汽车热榜', icon:'🚗', path:'/v2/dongchedi', type:'list', auto:1, f:{t:'title',h:'score_desc',l:'url'} },

  // 科技
  { cat:'tech', id:'nodeseek', name:'NodeSeek新帖', icon:'🌐', path:'/v2/nodeseek', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'description'} },
  { cat:'tech', id:'v2ex', name:'V2EX热帖', icon:'💬', path:'/v2/v2ex', type:'list', auto:1, f:{t:'title',h:'replies',l:'link', d:'node'} },
  { cat:'tech', id:'let', name:'LowEndTalk', icon:'🖥️', path:'/v2/lowendtalk', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'description'} },
  { cat:'tech', id:'hn', name:'Hacker News', icon:'🟧', path:'/v2/hacker-news/top', type:'list', auto:1, f:{t:'title',h:'score',l:'link'} },
  // 已移除 HN 最新帖：实测 /hacker-news/new 与 /hacker-news/top 返回同一份数据，重复
  { cat:'tech', id:'itnews', name:'IT资讯', icon:'💻', path:'/v2/it-news', type:'list', auto:1, f:{t:'title',h:null,l:'link', d:'description'} },
  { cat:'tech', id:'kuan', name:'酷安热榜', icon:'📱', path:'/v2/kuan', type:'kuan', auto:1 },
  { cat:'tech', id:'36kr', name:'36氪热榜', icon:'📰', path:'/v2/36kr', type:'36kr', auto:1 },
  { cat:'tech', id:'sspai', name:'少数派热榜', icon:'🎨', path:'/v2/sspai', type:'sspai', auto:1 },
  { cat:'tech', id:'huxiu', name:'虎嗅热榜', icon:'🐯', path:'/v2/huxiu', type:'huxiu', auto:1 },

  // 娱乐
  // 分组卡片的显示位置由「组内首个成员在本列表中的位置」决定，
  // 故按 目标卡片顺序 排列：猫眼电影榜 → 豆瓣影视周榜 → 百度影视周榜 → 流媒体 → 音乐 → 免费游戏
  // 猫眼组：历史票房置后（标签页与折叠菜单顺序一致，故在映/待映排在历史票房之前）
  { cat:'ent', id:'maoyan-showing', name:'猫眼在映电影', icon:'🎬', path:'/v2/maoyan/showing', type:'maoyan-movie', auto:1 },
  { cat:'ent', id:'maoyan-coming', name:'猫眼待映电影', icon:'🗓️', path:'/v2/maoyan/coming', type:'maoyan-movie', auto:1 },
  { cat:'ent', id:'maoyan', name:'猫眼历史票房', icon:'🍿', path:'/v2/maoyan/all/movie', type:'maoyan', auto:1 },
  { cat:'ent', id:'douban', name:'豆瓣电影周榜', icon:'🎬', path:'/v2/douban/weekly/movie', type:'douban', auto:1 },
  { cat:'ent', id:'douban-tv-cn', name:'豆瓣华语剧集周榜', icon:'📺', path:'/v2/douban/weekly/tv_chinese', type:'douban', auto:1 },
  { cat:'ent', id:'douban-tv-global', name:'豆瓣全球剧集周榜', icon:'🎞️', path:'/v2/douban/weekly/tv_global', type:'douban', auto:1 },
  { cat:'ent', id:'douban-show-cn', name:'豆瓣华语综艺周榜', icon:'🎤', path:'/v2/douban/weekly/show_chinese', type:'douban', auto:1 },
  { cat:'ent', id:'douban-show-global', name:'豆瓣全球综艺周榜', icon:'🎪', path:'/v2/douban/weekly/show_global', type:'douban', auto:1 },
  { cat:'ent', id:'bdtv', name:'百度电视剧榜', icon:'🎭', path:'/v2/baidu/teleplay', type:'baidu-show', auto:1 },
  { cat:'ent', id:'bdmovie', name:'百度电影榜', icon:'🎥', path:'/v2/baidu/movie', type:'baidu-show', auto:1 },
  { cat:'ent', id:'simkl-tv', name:'流媒体热门剧集', icon:'📺', path:'/v2/simkl-trending', type:'simkl', auto:1,
    inputs:[{ n:'network', sel:['', 'Netflix', 'HBO', 'HBO Max', 'Disney+', 'Prime Video', 'Apple TV', 'Hulu', 'Paramount+'], d:'' }], hint:'可选播出平台过滤，数据来自 SIMKL' },
  { cat:'ent', id:'simkl-movies', name:'流媒体热门电影', icon:'🍿', path:'/v2/simkl-trending', type:'simkl', auto:1,
    inputs:[{ n:'type', sel:['movies', 'anime'], d:'movies' }], hint:'下拉可切换为动画榜；数据来自 SIMKL' },
  { cat:'ent', id:'ncm', name:'网易云热歌榜', icon:'🎵', path:'/v2/ncm-rank/3778678', type:'ncm', auto:1 },
  { cat:'ent', id:'ncm-soar', name:'网易云飙升榜', icon:'🚀', path:'/v2/ncm-rank/19723756', type:'ncm', auto:1 },
  { cat:'ent', id:'ncm-acg', name:'网易云ACG榜', icon:'🌸', path:'/v2/ncm-rank/71385702', type:'ncm', auto:1 },
  { cat:'ent', id:'billboard', name:'Billboard Hot 100', icon:'🇺🇸', path:'/v2/ncm-rank/60198', type:'ncm', auto:1 },
  { cat:'ent', id:'epic', name:'Epic免费游戏', icon:'🎮', path:'/v2/epic', type:'epic', auto:1 },
  { cat:'ent', id:'steam', name:'Steam免费游戏', icon:'🎮', path:'/v2/steam', type:'steam', auto:1 },
  { cat:'ent', id:'lyric', name:'歌词搜索', icon:'🎶', path:'/v2/lyric', type:'lyric', auto:0, inputs:[{n:'query',p:'歌名 歌手，如：稻香 周杰伦'}], hint:'精确搜索：使用「歌名 歌手」格式；避免只输入歌词片段' },
  { cat:'ent', id:'changya', name:'唱鸭', icon:'🎤', path:'/v2/changya', type:'changya', auto:1 },

  // 工具
  { cat:'tools', id:'baike', name:'百度百科', icon:'📖', path:'/v2/baike', type:'baike', auto:0, inputs:[{n:'word',p:'关键词',d:'人工智能'}], hint:'查询百度百科词条摘要；输入任意关键词，返回定义、摘要与封面图' },
  { cat:'tools', id:'health', name:'健康计算器', icon:'🧮', path:'/v2/health', type:'health', auto:0, inputs:[{n:'height',p:'身高 50-300cm',d:'175'},{n:'weight',p:'体重 10-300kg',d:'70'},{n:'gender',p:'性别 male 或 female',d:'male'},{n:'age',p:'年龄 1-150岁',d:'30'}], hint:'输入身高(cm)、体重(kg)、性别(male/female)、年龄，计算 BMI、体脂率、基础代谢率等健康指标' },
  { cat:'tools', id:'qr', name:'二维码生成', icon:'📱', path:'/v2/qrcode', type:'qr', auto:0, inputs:[{n:'text',p:'内容',d:'https://github.com/vikiboss/60s'},{n:'size',p:'尺寸',d:'256'}], hint:'内容支持任意文本或链接；尺寸为图片边长像素，默认 256' },
  { cat:'tools', id:'hash', name:'哈希加密', icon:'#️⃣', path:'/v2/hash', type:'hash', auto:0, inputs:[{n:'content',p:'文本',d:'hello'}], hint:'一次性输出 MD5、SHA1/256/512、Base64、URL 编码等常用编解码结果' },
  { cat:'tools', id:'og', name:'网页OG信息', icon:'🌐', path:'/v2/og', type:'og', auto:0, inputs:[{n:'url',p:'URL',d:'github.com'}], hint:'提取网页标题、描述、图标等 OG 元信息；输入域名即可，无需带协议' },
  { cat:'tools', id:'ip', name:'IP查询', icon:'📍', path:'/v2/ip', type:'ip', auto:1, inputs:[{n:'ip',p:'输入 IP，留空查本机',d:''}], hint:'自动识别当前访问 IP 的归属地；输入指定 IP 可手动查询' },
  { cat:'tools', id:'whois', name:'WHOIS查询', icon:'🔗', path:'/v2/whois', type:'whois', auto:0, inputs:[{n:'domain',p:'域名',d:'baidu.com'}], hint:'查询域名的注册商、注册/到期时间与 DNS 服务器等注册信息' },
  { cat:'tools', id:'pwd', name:'密码生成', icon:'🔐', path:'/v2/password', type:'pwd', auto:0, inputs:[{n:'length',p:'长度',d:'16'}], hint:'生成含大小写字母、数字、符号的随机强密码；建议长度 16 位以上' },
  { cat:'tools', id:'pwdchk', name:'密码强度检测', icon:'💪', path:'/v2/password/check', type:'pwdchk', auto:0, inputs:[{n:'password',p:'密码',d:'Test123456'}], hint:'评估密码强度与暴力破解耗时；出于安全考虑，请勿检测真实在用的密码' },
  { cat:'tools', id:'color', name:'随机颜色', icon:'🎨', path:'/v2/color/random', type:'color', auto:1, hint:'随机生成一个颜色，含 RGB/HSL/CMYK 多格式与配色建议' },
  { cat:'tools', id:'palette', name:'配色方案', icon:'🖌️', path:'/v2/color/palette', type:'palette', auto:0, inputs:[{n:'color',p:'hex',d:''}], hint:'输入 hex 颜色值（如 #6366F1）生成互补、类似、三角配色方案；留空则随机' },

  // 生活
  { cat:'life', id:'wnow', name:'实时天气', icon:'☀️', path:'/v2/weather/realtime', type:'weather', auto:1, inputs:[{n:'query',p:'城市',d:'北京'}] },
  { cat:'life', id:'wfc', name:'天气预报', icon:'🌦️', path:'/v2/weather/forecast', type:'weatherfc', auto:1, inputs:[{n:'query',p:'城市',d:'北京'}] },
  { cat:'life', id:'exrate', name:'汇率', icon:'💱', path:'/v2/exchange-rate', type:'exchange', auto:1 },
  { cat:'life', id:'fuel', name:'油价', icon:'⛽', path:'/v2/fuel-price', type:'fuel', auto:1, inputs:[{n:'region', p:'输入城市名，如：上海 / 广东 / 成都', d:'北京'}] },
  { cat:'life', id:'gold', name:'金价', icon:'🥇', path:'/v2/gold-price', type:'gold', auto:1 },
  { cat:'life', id:'calendar', name:'万年历', icon:'📅', path:'/v2/lunar/calendar', type:'calendar', auto:1 },
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
  { cat:'fun', id:'g2048', name:'2048', icon:'🎮', path:'', type:'game2048', auto:1, noapi:1, hint:'拖拽 / 滑动 / 方向键或 WASD 移动合并，凑出 2048' },
  { cat:'fun', id:'bing', name:'必应壁纸', icon:'🖼️', path:'/v2/bing', type:'bing', auto:1 },
  { cat:'fun', id:'awjs', name:'JS题目', icon:'🧩', path:'/v2/awesome-js', type:'js', auto:1 },

  // 学习工具
  { cat:'trans', id:'daily-eng', name:'每日一句英语', icon:'📖', path:'/v2/daily-eng', type:'daily-eng', auto:1 },
  { cat:'trans', id:'fanyi', name:'有道翻译', icon:'🔤', path:'/v2/fanyi', type:'fanyi', auto:0, inputs:[{n:'text',p:'文本',d:'hello'},{n:'from',p:'源语言',d:'en'},{n:'to',p:'目标',d:'zh-CHS'}] },
  { cat:'trans', id:'gtranslate', name:'Google 翻译', icon:'🈯', path:'/v2/google-translate', type:'fanyi', auto:0, inputs:[{n:'text',p:'文本',d:'hello'},{n:'from',p:'源语言',d:'en'},{n:'to',p:'目标',d:'zh-CN'}] },
];

// ============ 卡片分组（标签页整合） ============
// 分组内多个数据源共用一张卡片，标签页切换；tabs 顺序即标签页顺序。
// 分组卡片在分类中的位置由组内首个成员在 EPS 中的位置决定；
// 搜索命中组内任一标签时整组显示，且只渲染命中的标签页
const CARD_GROUPS = [
  { id: 'maoyan-box', name: '猫眼电影榜', icon: '🍿', tabs: [
    { ep: 'maoyan-showing', label: '在映' },
    { ep: 'maoyan-coming', label: '待映' },
    { ep: 'maoyan', label: '历史票房' },
  ]},
  { id: 'douban-week', name: '豆瓣影视周榜', icon: '🎭', tabs: [
    { ep: 'douban', label: '电影' },
    { ep: 'douban-tv-cn', label: '华语剧集' },
    { ep: 'douban-tv-global', label: '全球剧集' },
    { ep: 'douban-show-cn', label: '华语综艺' },
    { ep: 'douban-show-global', label: '全球综艺' },
  ]},
  { id: 'baidu-week', name: '百度影视周榜', icon: '📊', tabs: [
    { ep: 'bdtv', label: '电视剧' },
    { ep: 'bdmovie', label: '电影' },
  ]},
  { id: 'simkl-hot', name: '国外流媒体影视榜', icon: '📺', tabs: [
    { ep: 'simkl-tv', label: '剧集' },
    { ep: 'simkl-movies', label: '电影' },
  ]},
  { id: 'music-rank', name: '网易云音乐榜', icon: '🎵', tabs: [
    { ep: 'ncm', label: '热歌' },
    { ep: 'ncm-soar', label: '飙升' },
    { ep: 'ncm-acg', label: 'ACG' },
    { ep: 'billboard', label: 'Billboard' },
  ]},
  { id: 'free-games', name: '免费游戏', icon: '🎮', tabs: [
    { ep: 'epic', label: 'Epic' },
    { ep: 'steam', label: 'Steam' },
  ]},
];
// ep.id → 所属分组 的反查表（定位跳转用）
const GROUP_OF = {};
CARD_GROUPS.forEach(g => g.tabs.forEach(t => { GROUP_OF[t.ep] = g; }));

// ============ 菜单目录数据与同步（分类=切换视图，模块=本页目录 TOC） ============
let syncSpy = null; // init 内部赋值 setupScrollSpy：render 后按新卡片集合重建滚动监听

// 某分类按渲染顺序列出的「卡片」条目：分组成员合并为一个分组条目，与 appendCards 出卡逻辑一致
function catTocEntries(catId) {
  const out = [];
  const seen = new Set();
  EPS.filter(ep => ep.cat === catId).forEach(ep => {
    const g = GROUP_OF[ep.id];
    if (g) {
      if (seen.has(g.id)) return;
      seen.add(g.id);
      out.push({ key: g.id, type: 'group', icon: g.icon, name: g.name, epId: g.tabs[0].ep });
      return;
    }
    out.push({ key: ep.id, type: 'ep', icon: ep.icon, name: ep.name, epId: ep.id });
  });
  return out;
}

// 目录高亮的唯一写入口：点击定位与 scroll-spy 共用（高亮单元是卡片，分组成员归到分组条目）
function setTocActive(key) {
  document.querySelectorAll('.cat-toc-item').forEach(el => {
    el.classList.toggle('active', !!key && el.dataset.key === key);
  });
}

// 分组条目上的「当前标签」徽章跟随卡片实际激活页；卡片未渲染时保留旧值，render 后会再同步
function updateTocBadges() {
  document.querySelectorAll('.cat-toc-item[data-type="group"]').forEach(el => {
    const badge = el.querySelector('.tb');
    if (!badge) return;
    const card = document.getElementById('card-' + el.dataset.key);
    const activeEp = card && card.dataset.activeEp;
    const g = CARD_GROUPS.find(x => x.id === el.dataset.key);
    const tab = g && activeEp ? g.tabs.find(t => t.ep === activeEp) : null;
    badge.textContent = tab ? tab.label : '';
    badge.style.display = tab ? '' : 'none';
  });
}

// 桌面 scroll-spy：观察当前分类的卡片，视口上部波段内最靠前的卡片即「正在阅读」的条目
let spyObserver = null;
const spyVisible = new Set();
function setupScrollSpy() {
  if (spyObserver) { spyObserver.disconnect(); spyObserver = null; }
  spyVisible.clear();
  // 「全部」无目录；移动端目录是呼出面板，跟随滚动高亮没有意义
  if (curCat === 'all' || window.innerWidth <= 820) return;
  const keys = catTocEntries(curCat).map(e => e.key);
  spyObserver = new IntersectionObserver(entries => {
    for (const en of entries) {
      const k = en.target.dataset.spyKey;
      if (en.isIntersecting) spyVisible.add(k); else spyVisible.delete(k);
    }
    if (!spyVisible.size) return;
    // 点击意图优先：点选的卡片仍有足量部分（≥140px）在视口内时，高亮不跟随滚动，
    // 避免定位后的轻微滚动就让高亮跳走；卡片基本滚出视口后交还 scroll-spy
    const activeKey = activeModuleId
      ? (GROUP_OF[activeModuleId] ? GROUP_OF[activeModuleId].id : activeModuleId)
      : null;
    if (activeKey) {
      const el = document.getElementById('card-' + activeKey);
      const r = el && el.getBoundingClientRect();
      const visible = r ? Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top) : 0;
      if (visible >= 140) { setTocActive(activeKey); return; }
    }
    // 网格同一行的卡片同时可见，取 TOC 顺序最前的作为「当前行」位置标记
    const current = keys.find(k => spyVisible.has(k));
    if (current) setTocActive(current);
  }, { rootMargin: '-110px 0px -65% 0px', threshold: 0 });
  keys.forEach(k => {
    const el = document.getElementById('card-' + k);
    if (!el) return;
    el.dataset.spyKey = k;
    spyObserver.observe(el);
  });
}
// 跨越桌面/移动断点时重建监听（只有桌面需要 spy）
window.matchMedia('(max-width: 820px)').addEventListener('change', () => setupScrollSpy());

let curCat = 'all';
let activeModuleId = null; // 当前高亮的子菜单模块（点击模块菜单后记录）
let syncSubs = null; // init 内部 refreshSubs 的对外钩子：分组卡片切标签页时同步子菜单高亮
let centerSubChip = null; // init 内部 focusSubChip 的对外钩子：切标签页时让对应模块 chip 滚入可视区
let jsonMode = {};
let fanyiLangs = null;

// ============ Splash 开屏：首批自动加载全部完成后渐隐 ============
// 最短展示 600ms：缓存全命中时避免一闪而过显得突兀；
// 最长 3.5s 兜底：个别接口挂起时不让遮罩长时间挡住页面
const splash = (() => {
  const MIN_SHOW = 600;
  const MAX_SHOW = 3500;
  let pending = 0, hidden = false, startedAt = 0, failSafe = null;

  function hideNow() {
    if (hidden) return;
    hidden = true;
    clearTimeout(failSafe);
    const el = document.getElementById('splash');
    if (!el) return;

    // 火焰「归位」动画：从屏幕中央飞向左上角 logo，缩小到 logo 尺寸后随遮罩淡出
    const icon = el.querySelector('.splash-icon');
    const logo = document.querySelector('.logo svg');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (icon && logo && !reduced) {
      const s = icon.getBoundingClientRect();
      const d = logo.getBoundingClientRect();
      const scale = d.width / s.width;
      const dx = (d.left + d.width / 2) - (s.left + s.width / 2);
      const dy = (d.top + d.height / 2) - (s.top + s.height / 2);
      icon.style.animation = 'none';
      icon.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
      // 强制回流，确保 transition 从当前脉冲帧生效而非直接跳到终点
      void icon.getBoundingClientRect();
      icon.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    }

    el.classList.add('splash-hide');
    setTimeout(() => el.remove(), 700); // 等淡出/归位过渡结束再移除节点
  }
  function hide() {
    const wait = Math.max(0, MIN_SHOW - (Date.now() - startedAt));
    if (wait) setTimeout(hideNow, wait); else hideNow();
  }
  return {
    begin(n) {
      startedAt = Date.now();
      if (n <= 0) { hide(); return; }
      pending = n;
      failSafe = setTimeout(hide, MAX_SHOW);
    },
    step() { if (!hidden && --pending <= 0) hide(); },
  };
})();
let firstRenderDone = false; // 仅首屏渲染触发开屏计数，切分类/搜索不再干预遮罩

// Google 翻译内置语言表（代码与 translate.googleapis.com 端点一致）
const G_LANGS = [
  ['auto', '自动检测'], ['zh-CN', '简体中文'], ['zh-TW', '繁体中文'], ['en', '英语'],
  ['ja', '日语'], ['ko', '韩语'], ['fr', '法语'], ['de', '德语'],
  ['es', '西班牙语'], ['ru', '俄语'], ['pt', '葡萄牙语'], ['it', '意大利语'],
  ['ar', '阿拉伯语'], ['th', '泰语'], ['vi', '越南语'], ['id', '印尼语'],
];

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

// 数据源不可用时的友好提示：不暴露错误码/堆栈，保留重试入口
function unavailableHTML(ep, detail) {
  return `<div class="placeholder card-unavailable">
    <span class="un-icon">😴</span>
    <span class="un-text">数据源开小差了，稍后再来看看${detail ? ` <span class="un-detail">（${esc(detail)}）</span>` : ''}</span>
    <button class="retry-btn" onclick="load(window._ep_${ep.id})">再试一次</button>
  </div>`;
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
  const catRow = document.createElement('div');
  catRow.className = 'cat-row';
  // 移动端模块面板：absolute 悬浮在吸顶分类行下方、不占文档流，
  // 吸顶高度恒定，定位系统无需再感知面板开合带来的布局变化
  const catPanel = document.createElement('div');
  catPanel.className = 'cat-panel';
  // 鼠标拖拽横向滚动（分类 pill 行；触摸端原生支持，不重复绑定）
  enableDragScroll(catRow);

  // 生成某分类的子菜单项（模块名按钮，点击定位到对应卡片）
  function buildSubItems(container, catId) {
    EPS.filter(ep => ep.cat === catId).forEach(ep => {
      const item = document.createElement('button');
      item.className = 'cat-subitem';
      item.type = 'button';
      item.dataset.ep = ep.id;
      item.innerHTML = `<span class="ci">${ep.icon}</span>${esc(ep.name)}`;
      item.title = `定位到「${ep.name}」`;
      item.onclick = () => locateCard(ep);
      container.appendChild(item);
    });
  }

  // 桌面侧边栏「本页目录」：按渲染顺序列卡片，分组卡合并为单条目（徽章显示当前标签页）。
  // 目录内容是静态的（分类下的卡片集合不变），动态的只有徽章与高亮，故预构建一次
  function buildToc(container, catId) {
    container.innerHTML = '';
    catTocEntries(catId).forEach((e, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cat-toc-item';
      item.dataset.key = e.key;
      item.dataset.type = e.type;
      item.title = `定位到「${e.name}」`;
      item.innerHTML = `<span class="mm"><span class="no">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="ci">${e.icon}</span><span class="nm">${esc(e.name)}</span></span>` +
        (e.type === 'group' ? '<span class="tb"></span>' : '');
      item.onclick = () => {
        // 分组条目定位到其当前激活的标签页（卡片未渲染时回退首个标签页）
        let target = EPS.find(x => x.id === e.epId);
        if (e.type === 'group') {
          const card = document.getElementById('card-' + e.key);
          const activeEp = card && card.dataset.activeEp;
          if (activeEp) target = EPS.find(x => x.id === activeEp) || target;
        }
        if (target) locateCard(target);
      };
      container.appendChild(item);
    });
  }

  // 窄屏下把元素水平居中到其可滚动容器可视区（分类 pill / 模块 chip 通用）
  function centerInContainer(container, el) {
    if (window.innerWidth > 820) return;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    container.scrollTo({
      left: container.scrollLeft + (elRect.left - cRect.left) - (cRect.width - elRect.width) / 2,
      behavior: 'smooth',
    });
  }

  // 鼠标拖拽横向滚动：触摸端原生支持滑动，这里仅补鼠标（mousedown/move/up），
  // 不影响触摸手势。仅在「横向位移明显」时才抑制随后的点击，避免拖拽误触发
  // 分类切换 / 模块定位；纵向移动（如桌面侧边栏）因 dx≈0 不滚动也不吞点击。
  function enableDragScroll(container) {
    if (!container) return;
    let down = false, sx = 0, sl = 0, dx = 0;
    container.addEventListener('mousedown', e => {
      if (e.button !== 0) return; // 仅左键
      down = true; dx = 0; sx = e.clientX; sl = container.scrollLeft;
      container.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!down) return;
      dx = e.clientX - sx;
      container.scrollLeft = sl - dx;
    });
    const end = () => {
      if (!down) return;
      down = false;
      container.classList.remove('dragging');
      document.body.style.cursor = '';
      // 发生过横向拖拽则本次点击视为拖拽结束，吞掉以免误触分类/模块
      if (Math.abs(dx) > 6) {
        const suppress = ev => { ev.stopPropagation(); ev.preventDefault(); };
        container.addEventListener('click', suppress, { capture: true, once: true });
      }
    };
    window.addEventListener('mouseup', end);
  }

  // 让某模块在菜单中滚入可视区（定位跳转与分组标签页切换共用）：
  // 桌面端目录条目滚动到可视即可；移动端仅在面板展开时把对应 chip 滚入面板可视区
  function focusSubChip(epId) {
    const key = GROUP_OF[epId] ? GROUP_OF[epId].id : epId;
    if (window.innerWidth > 820) {
      const item = catRow.querySelector(`.cat-toc-item[data-key="${key}"]`);
      if (item) item.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (!nav.classList.contains('toc-open')) return;
    const chip = catPanel.querySelector(`.cat-subitem[data-ep="${epId}"]`);
    if (chip) chip.scrollIntoView({ block: 'nearest' });
  }

  // 定位校正任务（模块级单例）：分类定位与模块定位共用一个计时器，
  // 保证同一时刻只有一个任务在滚动页面
  let alignTimer = null;
  let alignToken = 0;

  function stopAlign() {
    if (alignTimer) {
      clearInterval(alignTimer);
      alignTimer = null;
    }
  }

  // 启动一轮校正，返回本轮 token。
  // 必须先取消上一轮：分类定位留下来的是每 100ms 把页面拉回「分类标题」的任务，
  // 若新一轮卡片定位不先清掉它，两者会朝各自目标反复拉扯，表现就是精确定位失效
  function startAlign(fn, interval) {
    stopAlign();
    alignTimer = setInterval(fn, interval);
    return ++alignToken;
  }

  // 延时兜底专用：只有本轮仍是当前任务时才停止，
  // 避免上一轮遗留的 setTimeout 到期后误清新一轮的计时器
  function stopAlignIfCurrent(token) {
    if (token === alignToken) stopAlign();
  }

  // 用户手动滚动立即让位。固定引用，便于 once 监听器去重
  const abortAlign = () => stopAlign();

  // 滚动停靠位：移动端吸顶的是分类导航（单行 pill；模块面板是悬浮层，不影响高度），
  // 桌面端分类栏在侧边不遮挡内容、遮挡卡片的是吸顶顶栏——必须分端测量，
  // 否则桌面端会算出负偏移导致根本不滚动。
  function scrollDockTop() {
    if (window.innerWidth <= 820) {
      const navEl = document.querySelector('.cat-nav');
      return (navEl ? navEl.getBoundingClientRect().bottom : 0) + 12;
    }
    const topbar = document.querySelector('.topbar');
    return (topbar ? topbar.getBoundingClientRect().bottom : 0) + 12;
  }

  // 刷新菜单与页面状态同步：桌面目录展开/高亮、移动面板 chips、分组卡标签徽章
  function refreshSubs() {
    catRow.querySelectorAll('.cat-sub').forEach(el => {
      el.classList.toggle('open', el.dataset.for === curCat);
    });
    // 移动端面板：EPS 级 chips，分组成员可直达对应标签页
    catPanel.innerHTML = '';
    if (curCat !== 'all') buildSubItems(catPanel, curCat);
    // 高亮单元是「卡片」：activeModuleId 属于分组成员时归到分组条目
    const key = activeModuleId ? (GROUP_OF[activeModuleId] ? GROUP_OF[activeModuleId].id : activeModuleId) : null;
    setTocActive(key);
    catPanel.querySelectorAll('.cat-subitem').forEach(el => {
      el.classList.toggle('active', el.dataset.ep === activeModuleId);
    });
    updateTocBadges();
  }
  // 暴露给顶层函数（分组卡片切标签页时同步子菜单高亮 + chip 滚入可视区；
  // render() 末尾也会调用以对齐重建后的 DOM）
  syncSubs = refreshSubs;
  centerSubChip = focusSubChip;
  syncSpy = setupScrollSpy;

  // 定位模块卡片：清搜索过滤 → 必要时切分类 → 滚动到卡片并闪烁高亮
  function locateCard(ep) {
    const searchInput = $('#search');
    if (searchInput && searchInput.value.trim()) searchInput.value = '';
    // 移动端模块面板是悬浮层：定位即收起，避免遮住落点卡片
    nav.classList.remove('toc-open');
    let switched = false;
    if (curCat !== ep.cat) {
      switched = true;
      curCat = ep.cat;
      // 定位跳转切换分类同样要解除折叠态，保证箭头朝向与目录展开状态一致
      nav.classList.remove('sub-collapsed');
      location.hash = ep.cat;
      $$('.cat-row > button').forEach(x => x.classList.remove('active'));
      const btn = catRow.querySelector(`button[data-cat="${ep.cat}"]`);
      if (btn) {
        btn.classList.add('active');
        // 窄屏：让选中的分类 pill 回到可视区
        centerInContainer(catRow, btn);
      }
    }
    activeModuleId = ep.id;
    refreshSubs();
    // 窄屏：让选中的模块 chip 在 chips 条内居中（切分类时等 strip 重建后执行）
    if (switched) setTimeout(() => focusSubChip(ep.id), 80); else focusSubChip(ep.id);
    render();
    // render() 同步重建 DOM，此时目标卡必然存在。
    // 不用 scrollIntoView：它会被可滚动祖先截胡且受布局变化影响，
    // 直接计算卡片绝对坐标用 window.scrollTo 定位最可靠。
    // 分组成员：定位目标是所属分组卡片，并激活 ep 对应的标签页
    // （activate 内部懒加载该标签页数据；activeModuleId 已在上方设置，无需重复）
    const group = GROUP_OF[ep.id];
    const card = group
      ? document.getElementById('card-' + group.id)
      : document.getElementById('card-' + ep.id);
    if (card && group && typeof card._activateTab === 'function') card._activateTab(ep.id);
    if (card) {
      // 先停掉上一轮校正（可能是分类定位留下的）：它会持续把页面拉回分类标题，
      // 与本次卡片定位争抢滚动位置，是精确定位失效的直接原因
      stopAlign();

      // 停靠位与分类定位共用 scrollDockTop()（分端测量顶栏/分类导航底边）
      const absY = () => card.getBoundingClientRect().top + window.scrollY - scrollDockTop();
      // 首跳用 instant：smooth 动画在后台/遮挡标签页会被暂停导致定位中断，
      // 精确性优先于过渡动画；随后的轮询校正同样是瞬时对齐
      window.scrollTo({ top: absY(), behavior: 'instant' });
      // 卡片数据/图片异步加载会改变前方卡片高度，轮询校正：
      // 每 400ms 瞬时对齐；仅当「连续 3 次检测文档高度无变化且已对齐」才提前退出，
      // 8s 超时兜底；用户手动滚动立即让位
      let aligned = 0, stableH = 0, lastH = 0, tries = 0;
      const token = startAlign(() => {
        tries++;
        const h = document.documentElement.scrollHeight;
        stableH = (h === lastH) ? stableH + 1 : 0;
        lastH = h;
        if (!card.isConnected || tries > 20 || (aligned >= 1 && stableH >= 3)) {
          stopAlign(); return;
        }
        if (Math.abs(card.getBoundingClientRect().top - scrollDockTop()) < 40) {
          aligned++;
          return;
        }
        aligned = 0;
        window.scrollTo(0, absY());
      }, 400);
      window.addEventListener('wheel', abortAlign, { once: true, passive: true });
      window.addEventListener('touchmove', abortAlign, { once: true, passive: true });
      setTimeout(() => stopAlignIfCurrent(token), 8300);
      card.classList.add('locate-flash');
      setTimeout(() => card.classList.remove('locate-flash'), 3000);
    }
  }

  // 点分类后定位到该分类的标题行。
  // 必须在 refreshSubs() + render() 之后调用：render() 会重建 #main，
  // 在它之前算出的坐标指向的是即将被销毁的旧 DOM。
  // 移动端吸顶高度已恒定（模块面板是悬浮层不占文档流），但卡片图片异步加载
  // 仍会改变上方高度，所以定位后的轮询校正保留。
  function scrollToCatTitle(catId) {
    // 取消上一轮校正（可能是模块定位留下的），避免两个计时器争抢滚动位置
    stopAlign();

    // 「全部」渲染的是所有分类的分组列表，本身就是从头看起，保持回到页面顶部
    if (catId === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const title = document.querySelector(`.cat-section[data-cat="${catId}"] .cat-title`);
    if (!title) return;

    const absY = () => Math.max(0, title.getBoundingClientRect().top + window.scrollY - scrollDockTop());

    // 首跳 instant：smooth 会被随后的折叠过渡与布局变化打断，精确性优先
    window.scrollTo({ top: absY(), behavior: 'instant' });

    // 轮询校正：卡片异步加载（含图片）会改变上方高度，坐标一变就重新对齐；
    // 连续 2 次复测不变即认为布局已稳定。用户手动滚动立即让位
    let stable = 0, lastY = Math.round(absY()), tries = 0;
    const token = startAlign(() => {
      if (++tries > 15) { stopAlign(); return; }
      const y = Math.round(absY());
      if (y === lastY) {
        if (++stable >= 2) { stopAlign(); return; }
      } else {
        stable = 0;
        window.scrollTo({ top: y, behavior: 'instant' });
      }
      lastY = y;
    }, 100);

    window.addEventListener('wheel', abortAlign, { once: true, passive: true });
    window.addEventListener('touchmove', abortAlign, { once: true, passive: true });
    setTimeout(() => stopAlignIfCurrent(token), 2000);
  }

  CATS.forEach(c => {
    const b = document.createElement('button');
    b.dataset.cat = c.id;
    if (c.id === curCat) b.classList.add('active');
    // 计数徽章：分类下的模块数（移动端由 CSS 隐藏，pill 空间优先给名称）
    const cnt = document.createElement('span');
    cnt.className = 'cnt';
    cnt.textContent = c.id === 'all' ? EPS.length : EPS.filter(ep => ep.cat === c.id).length;
    b.appendChild(document.createTextNode(c.name));
    b.appendChild(cnt);
    b.onclick = () => {
      // 点击已激活分类：桌面折叠/展开目录手风琴；移动端开合模块面板（「全部」无目录）
      if (curCat === c.id) {
        if (c.id === 'all') return;
        if (window.innerWidth <= 820) nav.classList.toggle('toc-open');
        else nav.classList.toggle('sub-collapsed');
        return;
      }
      curCat = c.id;
      activeModuleId = null; // 切换分类后之前的模块高亮不再适用
      // 桌面：切换后必须展开新分类目录，否则箭头朝向与展开状态脱节；
      // 移动端面板保持当前开合——开着就地换内容，关着不打扰
      nav.classList.remove('sub-collapsed');
      location.hash = c.id;
      $$('.cat-row > button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      // 窄屏分类栏是横向滚动的：把选中的 pill 水平居中（内部已按宽度判断，桌面端自动跳过）
      centerInContainer(catRow, b);
      refreshSubs();
      render();
      scrollToCatTitle(c.id);
    };
    catRow.appendChild(b);
    // 桌面侧边栏手风琴：卡片目录紧跟所属分类按钮后（display:contents 参与纵向排列）；
    // inner 包装层供 grid-template-rows 0fr→1fr 展开动画使用
    if (c.id !== 'all') {
      const sub = document.createElement('div');
      sub.className = 'cat-sub';
      sub.dataset.for = c.id;
      const inner = document.createElement('div');
      inner.className = 'cat-sub-inner';
      buildToc(inner, c.id);
      sub.appendChild(inner);
      catRow.appendChild(sub);
    }
  });

  nav.appendChild(catRow);
  nav.appendChild(catPanel);
  refreshSubs();
  // 移动端模块面板的常规退出路径：点击面板外任意处 / Esc（定位点击由 locateCard 自己收起）
  document.addEventListener('click', e => {
    if (window.innerWidth > 820) return;
    if (!nav.classList.contains('toc-open')) return;
    if (!nav.contains(e.target)) nav.classList.remove('toc-open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') nav.classList.remove('toc-open');
  });
  // 刷新/hash 恢复后：窄屏把当前激活的分类 pill 居中，避免落在屏幕外
  const activeBtn = catRow.querySelector('button.active');
  if (activeBtn) centerInContainer(catRow, activeBtn);

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

  // 测量顶栏实际高度，写入 --topbar-h 供移动端分类栏 sticky 吸顶使用。
  // 手机窄屏下 header 会换行成两行，高度不固定，不能用硬编码。
  // 用 getBoundingClientRect 而非 offsetHeight：后者取整会让细边框在
  // 高 DPI 下丢掉小数部分，吸顶分类栏与顶栏底边出现 1px 级错位
  const topbarEl = document.querySelector('.topbar');
  function syncTopbarH() {
    if (topbarEl) document.documentElement.style.setProperty('--topbar-h', topbarEl.getBoundingClientRect().height + 'px');
  }
  syncTopbarH();
  window.addEventListener('resize', syncTopbarH);
  window.addEventListener('load', syncTopbarH);

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
      sec.dataset.cat = c.id; // 供分类导航点击后定位到该分类标题
      sec.innerHTML = `<div class="cat-title">${c.name}<span class="count">${eps.length}</span></div>`;
      const grid = document.createElement('div');
      grid.className = 'grid';
      appendCards(grid, eps);
      sec.appendChild(grid);
      main.appendChild(sec);
    });
  } else if (curCat === 'all' && kw) {
    const eps = EPS.filter(ep => matchKw(ep, kw));
    if (eps.length === 0) { main.innerHTML = '<div class="placeholder" style="text-align:center;padding:40px;">无匹配接口</div>'; return; }
    const grid = document.createElement('div');
    grid.className = 'grid';
    appendCards(grid, eps);
    main.appendChild(grid);
  } else {
    // 只渲染选中的分类
    const selCat = CATS.find(c => c.id === curCat);
    if (selCat) {
      const eps = EPS.filter(ep => ep.cat === curCat && matchKw(ep, kw));
      if (eps.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'cat-section';
        sec.dataset.cat = curCat; // 供分类导航点击后定位到该分类标题
        sec.innerHTML = `<div class="cat-title">${selCat.name}<span class="count">${eps.length}</span></div>`;
        const grid = document.createElement('div');
        grid.className = 'grid';
        appendCards(grid, eps);
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
  // 分组成员不出现在独立自动加载队列：分组卡片只加载当前激活的标签页，
  // 其余标签页由 activate() 在首次点开时懒加载
  const autoEps = EPS.filter(ep => ep.auto && matchKw(ep, kw) && (curCat === 'all' || curCat === ep.cat) && !GROUP_OF[ep.id]);
  document.querySelectorAll('.group-card').forEach(card => {
    const ep = EPS.find(e => e.id === card.dataset.activeEp);
    if (ep && ep.auto && matchKw(ep, kw)) autoEps.push(ep);
  });
  // 首屏：开屏遮罩等这批自动加载全部完成（或 3.5s 兜底）后再渐隐
  if (!firstRenderDone) {
    firstRenderDone = true;
    splash.begin(autoEps.length);
  }
  autoEps.forEach((ep, i) => {
    setTimeout(() => load(ep).finally(() => splash.step()), i * 80);
  });

  // 菜单同步：目录徽章/高亮对齐刚重建的 DOM，并按新卡片集合重建 scroll-spy 监听
  if (syncSubs) syncSubs();
  if (syncSpy) syncSpy();
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
  // 方案一：锚点卡片跨两列（60s 早报 / Hacker News），移动端由媒体查询回退单列
  if (ep.span === 2) card.classList.add('span-2');

  const head = document.createElement('div');
  head.className = 'card-head';
  head.innerHTML = `<div class="card-title"><span class="icon">${ep.icon}</span>${ep.name}</div>
    <div class="card-actions">
      ${ep.noapi ? '' : '<button class="btn-json" title="JSON">{ }</button>'}
      <button class="btn-refresh" title="刷新">↻</button>
    </div>`;
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'card-body';
  body.id = 'body-' + ep.id;

  if (ep.inputs) {
    if (ep.id === 'fanyi' || ep.id === 'gtranslate') {
      // 翻译模块:专用布局（有道用接口拉语言表，Google 用内置语言表，互不混用）
      const isGt = ep.id === 'gtranslate';
      const fromDefault = ep.inputs.find(i => i.n === 'from')?.d || 'en';
      const toDefault = ep.inputs.find(i => i.n === 'to')?.d || (isGt ? 'zh-CN' : 'zh-CHS');
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
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '⇄';
      arrow.title = '交换语言';
      const toSel = document.createElement('select');
      toSel.name = 'to';
      if (isGt) {
        // Google 翻译：内置常用语言表（代码与 Google 端点一致）
        const opts = G_LANGS.map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
        fromSel.innerHTML = opts;
        toSel.innerHTML = opts;
        fromSel.value = fromDefault;
        toSel.value = toDefault;
      } else {
        fromSel.dataset.role = 'fanyi-lang';
        toSel.dataset.role = 'fanyi-lang';
        // 如果语言列表已缓存，直接填充；否则显示加载中
        if (fanyiLangs) {
          const opts = fanyiLangs.map(l => `<option value="${l.code}">${l.label}</option>`).join('');
          fromSel.innerHTML = opts;
          toSel.innerHTML = opts;
          fromSel.value = fromDefault;
          toSel.value = toDefault;
        } else {
          fromSel.innerHTML = `<option value="${fromDefault}">加载中…</option>`;
          toSel.innerHTML = `<option value="${toDefault}">加载中…</option>`;
        }
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

      // 异步加载有道语言列表（如果尚未加载；Google 卡用内置表无需拉取）
      if (!isGt && !fanyiLangs) loadFanyiLangs();
    } else {
      const row = document.createElement('div');
      row.className = 'input-row';
      ep.inputs.forEach(inp => {
        // sel 字段存在则生成下拉框，否则生成文本输入框
        const el = document.createElement(inp.sel ? 'select' : 'input');
        if (inp.sel) {
          inp.sel.forEach(op => {
            const o = document.createElement('option');
            o.value = op;
            o.textContent = op === '' ? '全部平台' : op;
            el.appendChild(o);
          });
        } else {
          el.type = 'text';
          el.placeholder = inp.p;
        }
        el.name = inp.n;
        el.value = inp.d || '';
        // 下拉切换即时生效，无需点查询
        if (inp.sel) el.onchange = () => load(ep);
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
  const jsonBtn = card.querySelector('.btn-json');
  if (jsonBtn) jsonBtn.onclick = () => toggleJson(ep);

  return card;
}

// ============ 分组卡片（标签页整合） ============
// 多个数据源共用一张卡片，卡片头部的 { }/↻ 作用于当前激活标签页。
// 各标签页保留独立的 content-<id> 容器（隐藏≠销毁），因此 load()/30min 缓存/
// JSON 视图/重试按钮等既有机制按 ep.id 工作无需任何改造。
// 非激活标签页首次点开时才加载数据（懒加载），已加载过的直接复用 DOM。
function makeGroupCard(group, eps) {
  const card = document.createElement('div');
  card.className = 'card group-card';
  card.id = 'card-' + group.id;

  const head = document.createElement('div');
  head.className = 'card-head';
  head.innerHTML = `<div class="card-title"><span class="icon">${group.icon}</span>${group.name}</div>
    <div class="card-actions">
      <button class="btn-json" title="JSON">{ }</button>
      <button class="btn-refresh" title="刷新">↻</button>
    </div>`;
  card.appendChild(head);

  const activeEp = () => EPS.find(e => e.id === card.dataset.activeEp);
  head.querySelector('.btn-refresh').onclick = () => { const ep = activeEp(); if (ep) load(ep, true); };
  head.querySelector('.btn-json').onclick = () => { const ep = activeEp(); if (ep) toggleJson(ep); };

  const tabBar = document.createElement('div');
  tabBar.className = 'card-tabs';
  const panes = [];

  eps.forEach((ep, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'card-tab';
    tab.textContent = (group.tabs.find(t => t.ep === ep.id) || {}).label || ep.name;
    tab.onclick = () => {
      card._activateTab(ep.id);
      // 手动切标签页时同步子菜单高亮（定位跳转路径由 locateCard 自己维护）
      activeModuleId = ep.id;
      if (syncSubs) syncSubs();
      // 双向同步：让对应模块 chip / 侧边栏子项滚入可视区
      if (centerSubChip) centerSubChip(ep.id);
    };
    tabBar.appendChild(tab);

    // 复用 makeCard 的 body 构建（输入控件 / hint / content 容器），外壳弃用
    const sub = makeCard(ep);
    const body = sub.querySelector('.card-body');
    const pane = document.createElement('div');
    pane.className = 'card-pane';
    pane.dataset.ep = ep.id;
    while (body.firstChild) pane.appendChild(body.firstChild);
    if (i > 0) pane.hidden = true;
    panes.push({ ep, pane });
  });

  card.appendChild(tabBar);
  panes.forEach(p => card.appendChild(p.pane));

  const loaded = new Set();
  function activate(epId, opts = {}) {
    const idx = panes.findIndex(p => p.ep.id === epId);
    if (idx < 0) return;
    card.dataset.activeEp = panes[idx].ep.id;
    tabBar.querySelectorAll('.card-tab').forEach((b, j) => b.classList.toggle('active', j === idx));
    panes.forEach((p, j) => { p.pane.hidden = j !== idx; });
    // 懒加载：首次激活该标签页且数据源为自动加载类型时才请求
    if (opts.load !== false && panes[idx].ep.auto && !loaded.has(panes[idx].ep.id)) {
      loaded.add(panes[idx].ep.id);
      load(panes[idx].ep);
    }
  }
  // 初始激活第一个标签页；数据加载由 render() 的自动加载队列统一调度
  activate(eps[0].id, { load: false });

  // 供 locateCard 按 ep 激活对应标签页
  card._activateTab = (epId) => activate(epId);

  return card;
}

// 网格填充：分组成员不单独出卡，命中组内任一成员时整组出卡（仅渲染命中的标签页）
function appendCards(grid, eps) {
  const emitted = new Set();
  eps.forEach((ep, i) => {
    const group = GROUP_OF[ep.id];
    if (group) {
      if (emitted.has(group.id)) return;
      emitted.add(group.id);
      const members = group.tabs.map(t => eps.find(e => e.id === t.ep)).filter(Boolean);
      if (!members.length) return;
      grid.appendChild(makeGroupCard(group, members));
      return;
    }
    const card = makeCard(ep);
    card.style.animationDelay = (i * 0.03) + 's';
    grid.appendChild(card);
  });
}

// P0 + P1: load() with cache, skeleton, retry
async function load(ep, forceUpdate = false) {
  const c = document.getElementById('content-' + ep.id);
  if (!c) return;
  // 纯前端卡片（noapi:1）：不发请求、不走缓存，直接渲染（↻ 刷新即重置状态）
  if (ep.noapi) { jsonMode[ep.id] = false; renderData(ep, null, c); return; }
  c.innerHTML = SKELETON_HTML;
  jsonMode[ep.id] = false;

  let url = API + ep.path;
  const params = new URLSearchParams();
  if (ep.inputs) {
    // 分组卡片内数据源 id 与卡片 id 不一致（卡片 id 是分组 id），
    // 故输入控件容器回退到 content 的最近 .card 祖先
    const card = document.getElementById('card-' + ep.id) || c.closest('.card');
    if (!card) return;
    ep.inputs.forEach(inp => {
      const sel = card.querySelector(`select[name="${inp.n}"]`);
      if (sel && sel.value) { params.set(inp.n, sel.value); return; }
      const el = card.querySelector(`*[name="${inp.n}"]`);
      if (el && el.value) params.set(inp.n, el.value);
    });
  }
  if (ep.type === 'qr') params.set('encoding', 'json');
  const qs = params.toString();
  if (qs) url += '?' + qs;

  // 缓存键不含 force-update：它只是回源手段，计入 key 会让刷新结果写到另一个键，
  // 之后普通加载仍命中旧缓存，等于白刷
  const ck = cacheKey(ep, url);

  // 手动刷新时额外告知后端绕过其服务端缓存，否则 TTL 内点 ↻ 会拿回同一份数据
  const requestUrl = forceUpdate ? `${url}${url.includes('?') ? '&' : '?'}force-update=1` : url;

  // 非强制刷新时检查缓存：命中直接渲染，不再后台重复请求
  if (!forceUpdate) {
    const cached = cacheGet(ck);
    if (cached !== null) {
      if (ep.type === 'qr') {
        c.innerHTML = qrWrapHTML(cached);
      } else {
        renderData(ep, cached, c);
      }
      return;
    }
  }

  // Google 翻译：优先浏览器直连 Google 免费端点（用户 IP 不被风控），失败走自建后端
  if (ep.id === 'gtranslate') return gtranslateLoad(ep, params, requestUrl, ck, c, forceUpdate);

  await fetchWithRetry(ep, requestUrl, ck, c, 2);
}

// Google 翻译加载器：浏览器直连 clients5.google.com（允许任意 Origin 的 CORS）；
// 直连失败（如大陆网络）再回退自建 /v2/google-translate（CF 出口被 Google 间歇拦截，尽力而为）
async function gtranslateLoad(ep, params, url, ck, c, forceUpdate) {
  const text = params.get('text');
  const from = params.get('from') || 'auto';
  const to = params.get('to') || 'zh-CN';
  if (text) {
    try {
      const res = await fetch(
        `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw)) {
          let detected = from;
          const trans = raw
            .map(el => {
              if (Array.isArray(el)) {
                if (typeof el[1] === 'string') detected = el[1];
                return String(el[0] ?? '');
              }
              return String(el ?? '');
            })
            .join('');
          const data = { source: { text, type: detected }, target: { text: trans, type: to } };
          cacheSet(ck, data);
          renderData(ep, data, c);
          return;
        }
      }
    } catch (e) { /* 直连失败，走后端兜底 */ }
  }
  await fetchWithRetry(ep, url, ck, c, 2);
}

// 二维码卡：白色衬底相框（保证深色主题下扫码对比度）+ 下载按钮
function qrWrapHTML(blobUrl) {
  // data URI 经 esc() 转义引号以防属性注入；不可用 safeUrl()——它会拒绝 data: 协议
  return `<div class="qr-wrap">
    <div class="qr-frame"><img src="${esc(blobUrl)}" alt="QR"></div>
    <div class="qr-tip">📱 扫码识别内容</div>
    <a class="qr-download" href="${esc(blobUrl)}" download="qrcode.png">⬇ 下载 PNG</a>
  </div>`;
}

// P1: 带重试的 fetch（处理速率限制 + 网络错误）
async function fetchWithRetry(ep, url, ck, c, retriesLeft) {
  try {
    const res = await fetch(url);

    // 速率限制或服务器错误：等待后重试
    if (res.status === 429 || res.status >= 500) {
      // 5xx 多为上游数据源不可达/超时（每次响应都要等满后端的上游超时），
      // 只重试一次——三轮叠加会让加载动画转 30 秒以上才出现错误提示
      if (res.status >= 500) {
        if (retriesLeft >= 2) {
          await new Promise(r => setTimeout(r, 1500));
          return fetchWithRetry(ep, url, ck, c, 1);
        }
        c.innerHTML = unavailableHTML(ep, `HTTP ${res.status}`);
        return;
      }
      if (retriesLeft > 0) {
        await new Promise(r => setTimeout(r, 1500));
        return fetchWithRetry(ep, url, ck, c, retriesLeft - 1);
      }
    }

    if (ep.type === 'qr') {
      const json = await res.json();
      if (json.code !== 200) {
        if (retriesLeft > 0) {
          await new Promise(r => setTimeout(r, 1000));
          return fetchWithRetry(ep, url, ck, c, retriesLeft - 1);
        }
        c.innerHTML = unavailableHTML(ep, json.message);
        return;
      }
      const dataUri = json.data?.data_uri;
      cacheSet(ck, dataUri);
      c.innerHTML = qrWrapHTML(dataUri);
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
      c.innerHTML = unavailableHTML(ep, json.message);
      return;
    }
    cacheSet(ck, json.data);
    renderData(ep, json.data, c);
  } catch(e) {
    if (retriesLeft > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(ep, url, ck, c, retriesLeft - 1);
    }
    c.innerHTML = unavailableHTML(ep, '网络异常');
  }
}

// P0: 后台静默更新 (stale-while-revalidate)
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
    'maoyan-movie': rMaoyanMovie,
    'baidu-show': rBaiduShow,
    baike: rBaike, health: rHealth, geng: rGeng, 'daily-eng': rDailyEng, simkl: rSimkl,
    ip: rIP, pwdchk: rPwdChk, calendar: rCalendar, game2048: rGame2048,
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
  // Top N 折叠：默认只渲染前 N 条，展开状态按卡片记忆；记录原始数据供切换时免请求重渲染
  const expanded = isListExpanded(ep.id);
  const items = expanded ? d : d.slice(0, LIST_COLLAPSE_N);
  listData[ep.id] = d;
  let h = '';
  items.forEach((it, i) => {
    const rank = it.rank || (i + 1);
    const cls = rank <= 3 ? `top${rank}` : '';
    const t = it[f.t] || it.title || '';
    const l = it[f.l] || it.link || it.url || '';
    const hot = f.h ? it[f.h] : '';
    const desc = f.d ? it[f.d] : '';
    // 仅显式配置 f.p 的榜单启用海报模式，避免数据里带 cover 的模块误显示缩略图；
    // f.ps 为方形缩略图变体（新闻/科技封面多为横图，方形裁切更合适）
    const poster = f.p ? (it[f.p] || '') : '';
    const sqCls = f.ps ? ' with-cover' : '';
    let meta = '';
    if (hot) meta += `<span class="hot">🔥 ${esc(String(hot))}</span>`;
    if (poster) {
      // 海报模式：序号内联在标题行首（与流媒体榜 rSimkl 一致）
      h += `<div class="item with-poster${sqCls}">`;
      h += `<img class="poster${f.ps ? ' cover-square' : ''}" src="${esc(poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
      h += `<div class="body-wrap">`;
      h += l ? `<a href="${safeUrl(l)}" target="_blank" rel="noopener"><span class="rank ${cls}">${rank}</span> ${esc(t)}</a>` : `<span class="t"><span class="rank ${cls}">${rank}</span> ${esc(t)}</span>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      if (desc) h += `<div class="desc">${esc(String(desc).slice(0, 80))}${String(desc).length > 80 ? '…' : ''}</div>`;
      h += '</div></div>';
    } else {
      // 无海报模式：保持原有布局，序号徽章独立在左与标题并排
      h += `<div class="item"><span class="rank ${cls}">${rank}</span><div class="body">`;
      h += l ? `<a href="${safeUrl(l)}" target="_blank" rel="noopener">${esc(t)}</a>` : `<span class="t">${esc(t)}</span>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      if (desc) h += `<div class="desc">${esc(String(desc).slice(0, 80))}${String(desc).length > 80 ? '…' : ''}</div>`;
      h += '</div></div>';
    }
  });
  if (d.length > LIST_COLLAPSE_N) {
    h += `<button class="list-toggle" type="button" data-list-toggle="${ep.id}">` +
      (expanded ? `收起，仅看 Top ${LIST_COLLAPSE_N}` : `展开全部 ${d.length} 条`) +
      `</button>`;
  }
  c.innerHTML = h;
  // 展开态同步到卡片 class：span-2 宽卡片收起时走双栏排布，展开时回退单列滚动
  const card = document.getElementById('card-' + ep.id) || c.closest('.card');
  if (card) card.classList.toggle('expanded', expanded);
}

// 展开/收起切换：事件委托统一处理，用 listData 里已缓存的原始数据本地重渲染，不重新请求
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-list-toggle]');
  if (!btn) return;
  const id = btn.dataset.listToggle;
  const ep = window['_ep_' + id];
  const c = document.getElementById('content-' + id);
  const d = listData[id];
  if (!ep || !c || !d) return;
  setListExpanded(id, !isListExpanded(id));
  rList(d, c, ep);
});

// ============ 万年历（calendar） ============
// 各卡当前浏览的年月（切换月份的本地状态）
const calState = {};

function rCalendar(d, c, ep) {
  if (!d || !Array.isArray(d.weeks)) return rJSON(d, c);
  calState[ep.id] = { y: d.year, m: d.month, todayStr: d.today };
  const isCurrentMonth = `${d.year}-${String(d.month).padStart(2, '0')}` === d.today.slice(0, 7);

  let h = '<div class="cal">';
  h += '<div class="cal-head">' +
    `<button class="cal-nav" type="button" data-cal-id="${ep.id}" data-cal-nav="-1" title="上个月">‹</button>` +
    `<span class="cal-title">${d.year} 年 ${d.month} 月</span>` +
    `<button class="cal-nav" type="button" data-cal-id="${ep.id}" data-cal-nav="1" title="下个月">›</button>` +
    (isCurrentMonth ? '' : `<button class="cal-today" type="button" data-cal-today data-cal-id="${ep.id}" title="回到本月">今天</button>`) +
    '</div>';
  h += '<div class="cal-weeks">' +
    ['一', '二', '三', '四', '五', '六', '日'].map((w, i) => `<span${i > 4 ? ' class="wk"' : ''}>${w}</span>`).join('') +
    '</div>';
  h += '<div class="cal-grid">';
  d.weeks.forEach(week => week.forEach(cell => {
    if (!cell) { h += '<div class="cal-cell blank"></div>'; return; }
    const cls = ['cal-cell'];
    if (cell.is_weekend) cls.push('wk');
    if (cell.is_today) cls.push('today');
    const mark = cell.holiday ? (cell.holiday.is_work ? '<i class="cal-mark work">班</i>' : '<i class="cal-mark rest">休</i>') : '';
    h += `<div class="${cls.join(' ')}" title="${esc(cell.date)}">` +
      `<div class="cal-d">${mark}${cell.day}</div>` +
      `<div class="cal-l${cell.label_is_special ? ' sp' : ''}">${esc(cell.label)}</div>` +
      '</div>';
  }));
  h += '</div>';
  h += '<div class="cal-tip">节气与节日以强调色标注 · 休 / 班为法定节假日安排</div>';
  h += '</div>';
  c.innerHTML = h;
}

// 月份切换 / 回到本月：带查询参数重新请求，正常走缓存管线
async function calLoad(id) {
  const ep = window['_ep_' + id];
  const c = document.getElementById('content-' + id);
  const st = calState[id];
  if (!ep || !c || !st) return;
  const url = `${API}${ep.path}?year=${st.y}&month=${st.m}`;
  const ck = cacheKey(ep, url);
  const cached = cacheGet(ck);
  if (cached !== null) { renderData(ep, cached, c); return; }
  c.innerHTML = SKELETON_HTML;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== 200) { c.innerHTML = unavailableHTML(ep, json.message); return; }
    cacheSet(ck, json.data);
    renderData(ep, json.data, c);
  } catch (e) {
    c.innerHTML = unavailableHTML(ep, e.message);
  }
}

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-cal-nav]');
  if (nav) {
    const id = nav.dataset.calId;
    const st = calState[id];
    if (!st) return;
    st.m += +nav.dataset.calNav;
    if (st.m > 12) { st.m = 1; st.y++; }
    if (st.m < 1) { st.m = 12; st.y--; }
    calLoad(id);
    return;
  }
  const todayBtn = e.target.closest('[data-cal-today]');
  if (todayBtn) {
    const id = todayBtn.dataset.calId;
    const todayStr = calState[id] && calState[id].todayStr;
    if (todayStr) {
      calState[id] = { y: +todayStr.slice(0, 4), m: +todayStr.slice(5, 7), todayStr };
      calLoad(id);
    }
  }
});

// ============ 2048 小游戏（纯前端，noapi） ============
// 棋局状态按卡片 id 存内存，最高分 localStorage 持久化；
// 操控统一走 Pointer Events（鼠标拖拽 = 触屏滑动），另支持键盘方向键/WASD
const g2048 = {};
let g2048Seq = 0;

function g2048New(id) {
  const st = g2048[id] = {
    tiles: [],            // { id, v, r, c, isNew, merged } 持久方块，动画靠 DOM 复用
    score: 0, best: g2048Best(), over: false,
    won: false, wonAck: false,  // 2048 达成一次提示，wonAck = 用户点了“继续”
    hist: null,           // 单步撤销快照
    ghosts: [], cleanT: 0
  };
  g2048Spawn(st);
  g2048Spawn(st);
  return st;
}

function g2048Spawn(st) {
  const occ = new Set(st.tiles.map(t => t.r * 4 + t.c));
  const empty = [];
  for (let i = 0; i < 16; i++) if (!occ.has(i)) empty.push(i);
  if (!empty.length) return;
  const i = empty[Math.random() * empty.length | 0];
  st.tiles.push({ id: ++g2048Seq, v: Math.random() < 0.9 ? 2 : 4, r: i / 4 | 0, c: i % 4, isNew: true });
}

function g2048Best() {
  try { return +localStorage.getItem('g2048-best') || 0; } catch { return 0; }
}

function g2048CanMove(st) {
  if (st.tiles.length < 16) return true;
  const g = Array(16).fill(0);
  for (const t of st.tiles) g[t.r * 4 + t.c] = t.v;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const v = g[r * 4 + c];
    if (c < 3 && v === g[r * 4 + c + 1]) return true;
    if (r < 3 && v === g[(r + 1) * 4 + c]) return true;
  }
  return false;
}

function g2048Move(id, dir) {
  const st = g2048[id];
  if (!st || st.over || (st.won && !st.wonAck)) return;
  const vertical = dir === 'up' || dir === 'down';
  const rev = dir === 'right' || dir === 'down';
  // 落子前快照（撤销用）；无效移动时还原，避免空耗一步撤销机会
  const prevHist = st.hist;
  st.hist = {
    tiles: st.tiles.map(t => ({ id: t.id, v: t.v, r: t.r, c: t.c })),
    score: st.score, won: st.won, wonAck: st.wonAck
  };
  st.tiles.forEach(t => { t.merged = false; t.isNew = false; });

  const ghosts = []; // 被合并掉的方块：滑到目标位做动画，之后由 paint 延迟清理
  let moved = false, gained = 0;
  for (let i = 0; i < 4; i++) {
    const line = st.tiles
      .filter(t => vertical ? t.c === i : t.r === i)
      .sort((a, b) => vertical ? a.r - b.r : a.c - b.c);
    if (rev) line.reverse();
    const out = [];
    for (const t of line) {
      const last = out[out.length - 1];
      // last.merged 防止 [2,2,4] 连环并成 8（正确结果是 [4,4]）
      if (last && last.v === t.v && !last.merged) {
        last.v *= 2; last.merged = true; gained += last.v;
        if (last.v >= 2048 && !st.won) st.won = true;
        ghosts.push({ ...t, target: last });
      } else {
        out.push(t);
      }
    }
    out.forEach((t, j) => {
      const pos = rev ? 3 - j : j;
      const nr = vertical ? pos : i, nc = vertical ? i : pos;
      if (t.r !== nr || t.c !== nc) moved = true;
      t.r = nr; t.c = nc;
    });
  }
  if (ghosts.length) moved = true; // 合并发生即有效（存活块可能原地不动）
  if (!moved) { st.hist = prevHist; return; }

  st.tiles = st.tiles.filter(t => !ghosts.some(g => g.id === t.id));
  for (const g of ghosts) { g.r = g.target.r; g.c = g.target.c; } // 幽灵滑向合并目标
  st.ghosts = ghosts;
  st.score += gained;
  if (st.score > st.best) {
    st.best = st.score;
    try { localStorage.setItem('g2048-best', String(st.best)); } catch {}
  }
  g2048Spawn(st);
  if (!g2048CanMove(st)) st.over = true;
  g2048Paint(id);
  if (gained) g2048Float(id, gained);
}

function g2048Undo(id) {
  const st = g2048[id];
  if (!st || !st.hist) return;
  const h = st.hist;
  st.tiles = h.tiles.map(t => ({ ...t }));
  st.score = h.score;
  st.won = h.won;
  st.wonAck = h.wonAck;
  st.over = false; // 游戏结束也可撤销自救
  st.hist = null;
  st.ghosts = [];
  g2048Paint(id);
}

function g2048Float(id, n) {
  const wrap = document.querySelector(`[data-g2048="${id}"]`);
  const box = wrap && wrap.querySelector('.g2048-scorebox');
  if (!box) return;
  const s = document.createElement('span');
  s.className = 'g-add';
  s.textContent = '+' + n;
  box.appendChild(s);
  s.addEventListener('animationend', () => s.remove());
}

function rGame2048(_, c, ep) {
  const id = ep.id;
  const st = g2048New(id);

  c.innerHTML = `<div class="g2048" data-g2048="${id}">
    <div class="g2048-main">
      <div class="g2048-side">
        <div class="g2048-scorebox"><span>分数</span><b class="g-sv">0</b></div>
        <div class="g2048-scorebox"><span>最高</span><b class="g-bv">${st.best}</b></div>
        <button class="g2048-btn" type="button" data-g2048-undo="${id}">↶ 撤销</button>
        <button class="g2048-btn" type="button" data-g2048-new="${id}">↻ 重开</button>
      </div>
      <div class="g2048-wrap">
        <div class="g2048-board" tabindex="0" aria-label="2048 棋盘，方向键或滑动操作">
          <div class="g2048-cells">${'<div class="g-cell"></div>'.repeat(16)}</div>
          <div class="g2048-layer"></div>
        </div>
        <div class="g2048-over" hidden></div>
      </div>
    </div>
  </div>`;
  g2048Paint(id);
  g2048Bind(id);
  // 打开即聚焦：方向键无需先点一下棋盘
  const b = wrap2048Board(id);
  if (b) b.focus({ preventScroll: true });
}

function wrap2048Board(id) {
  const wrap = document.querySelector(`[data-g2048="${id}"]`);
  return wrap ? wrap.querySelector('.g2048-board') : null;
}

function g2048Paint(id) {
  const st = g2048[id];
  const wrap = document.querySelector(`[data-g2048="${id}"]`);
  if (!st || !wrap) return;
  const layer = wrap.querySelector('.g2048-layer');

  // 立即清掉不属于当前棋局的遗留元素（重开 / 撤销 / 上一手未清完的幽灵）
  const keep = new Set([...st.tiles.map(t => t.id), ...st.ghosts.map(g => g.id)]);
  layer.querySelectorAll('.g-tile[data-id]').forEach(el => {
    if (!keep.has(+el.dataset.id)) el.remove();
  });

  // 存活方块：按 id 复用元素，只改坐标（--r/--c）与数值，滑动交给 CSS transition
  for (const t of st.tiles) {
    let el = layer.querySelector(`[data-id="${t.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.id = t.id;
      const ti = document.createElement('div');
      ti.className = 'ti'; // .ti 内层负责视觉/弹出动画，漏掉则无色块、不居中
      el.appendChild(ti);
      layer.appendChild(el);
    }
    el.className = `g-tile t${t.v <= 2048 ? t.v : 'x'} d${String(t.v).length}` +
      (t.isNew ? ' new' : '') + (t.merged ? ' merged' : '');
    el.style.setProperty('--r', t.r);
    el.style.setProperty('--c', t.c);
    el.firstChild.textContent = t.v;
    t.isNew = false;
    t.merged = false;
  }
  // 幽灵方块：定位到合并目标位滑行，220ms 后由下方清理移除
  for (const g of st.ghosts) {
    const el = layer.querySelector(`[data-id="${g.id}"]`);
    if (el) {
      el.className = `g-tile ghost t${g.v <= 2048 ? g.v : 'x'} d${String(g.v).length}`;
      el.style.setProperty('--r', g.r);
      el.style.setProperty('--c', g.c);
    }
  }
  st.ghosts = [];
  clearTimeout(st.cleanT);
  st.cleanT = setTimeout(() => {
    const cur = g2048[id], w = document.querySelector(`[data-g2048="${id}"]`);
    if (!cur || !w) return;
    const live = new Set(cur.tiles.map(t => t.id));
    w.querySelectorAll('.g-tile[data-id]').forEach(el => {
      if (!live.has(+el.dataset.id)) el.remove();
    });
  }, 220);

  wrap.querySelector('.g-sv').textContent = st.score;
  wrap.querySelector('.g-bv').textContent = st.best;
  wrap.querySelector('[data-g2048-undo]').disabled = !st.hist;

  const over = wrap.querySelector('.g2048-over');
  if (st.over) {
    over.innerHTML = `<div class="go-title">游戏结束</div><div class="go-score">得分 <b>${st.score}</b></div>
      <div class="go-row"><button class="go-btn" type="button" data-g2048-new="${id}">再来一局</button>
      <button class="go-btn ghost" type="button" data-g2048-undo="${id}">↶ 撤销一步</button></div>`;
    over.hidden = false;
  } else if (st.won && !st.wonAck) {
    over.innerHTML = `<div class="go-title">🎉 2048 达成</div><div class="go-score">得分 <b>${st.score}</b>，可继续挑战更高分</div>
      <div class="go-row"><button class="go-btn" type="button" data-g2048-continue="${id}">继续游戏</button>
      <button class="go-btn ghost" type="button" data-g2048-new="${id}">重开</button></div>`;
    over.hidden = false;
  } else {
    over.hidden = true;
  }
}

function g2048Bind(id) {
  const wrap = document.querySelector(`[data-g2048="${id}"]`);
  if (!wrap) return;
  const board = wrap.querySelector('.g2048-board');
  let sx = 0, sy = 0, tracking = false, fired = false;
  wrap.addEventListener('pointerdown', e => {
    tracking = true; fired = false; sx = e.clientX; sy = e.clientY;
    try { wrap.setPointerCapture(e.pointerId); } catch {}
    board.focus({ preventScroll: true });
  });
  wrap.addEventListener('pointermove', e => {
    if (!tracking || fired) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    // 阈值随棋盘宽度缩放（约 8%），小屏不迟钝、大屏不误触
    const th = Math.max(18, board.clientWidth * 0.08);
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    fired = true;
    g2048Move(id, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const end = () => { tracking = false; };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  board.addEventListener('keydown', e => {
    // toLowerCase：兼容 CapsLock / Shift 下的大写 WASD
    const map = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    const dir = map[e.key.toLowerCase()];
    if (dir) { e.preventDefault(); g2048Move(id, dir); }
  });
}

document.addEventListener('click', e => {
  const newBtn = e.target.closest('[data-g2048-new]');
  if (newBtn) {
    const id = newBtn.dataset.g2048New;
    g2048New(id);
    g2048Paint(id);
    const b = wrap2048Board(id);
    if (b) b.focus({ preventScroll: true });
    return;
  }
  const undoBtn = e.target.closest('[data-g2048-undo]');
  if (undoBtn) { g2048Undo(undoBtn.dataset.g2048Undo); return; }
  const contBtn = e.target.closest('[data-g2048-continue]');
  if (contBtn) {
    const id = contBtn.dataset.g2048Continue;
    const st = g2048[id];
    if (st) { st.wonAck = true; g2048Paint(id); }
  }
});

function rDouban(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((it, i) => {
    const rank = it.rank || (i + 1);
    const cls = rank <= 3 ? `top${rank}` : '';
    const l = it.url || it.link || '';
    const poster = it.cover_proxy || it.cover || '';
    let meta = '';
    if (it.rating) meta += `⭐ ${esc(String(it.rating))} `;
    if (it.rating_count) meta += `(${esc(String(it.rating_count))}) `;
    if (it.card_subtitle) meta += ` · ${esc(it.card_subtitle)}`;
    if (poster) {
      // 海报模式：序号内联在标题行首（与流媒体榜 rSimkl 一致）
      h += `<div class="item with-poster">`;
      h += `<img class="poster" src="${esc(poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
      h += `<div class="body-wrap">`;
      h += l ? `<a href="${safeUrl(l)}" target="_blank" rel="noopener"><span class="rank ${cls}">${rank}</span> ${esc(it.title)}</a>` : `<span class="t"><span class="rank ${cls}">${rank}</span> ${esc(it.title)}</span>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    } else {
      // 无海报时回退原有布局，序号徽章独立在左与标题并排
      h += `<div class="item"><span class="rank ${cls}">${rank}</span><div class="body">`;
      h += l ? `<a href="${safeUrl(l)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : `<span class="t">${esc(it.title)}</span>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    }
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

// 历史上的今天：时间轴布局，事件/出生/逝世 三类彩色标签 + 年份徽章 + 摘要
function rHist(d, c) {
  const items = d.items || [];
  const TYPE = { event: ['事件', ''], birth: ['出生', 'birth'], death: ['逝世', 'death'] };
  // 公元前年份（负数）显示为「前N」
  const yearText = y => {
    const n = parseInt(y, 10);
    return isNaN(n) ? String(y) : (n < 0 ? `前${-n}` : `${n}`);
  };
  const counts = { event: 0, birth: 0, death: 0 };
  items.forEach(it => { const k = TYPE[it.event_type] ? it.event_type : 'event'; counts[k]++; });

  let h = `<div class="hist-head">
    <span class="hist-date">📅 ${esc(d.month)}月${esc(d.day)}日</span>
    <span class="hist-legend"><b>${items.length}</b> 条大事记
      ${counts.event ? ` · 事件 ${counts.event}` : ''}${counts.birth ? ` · 出生 ${counts.birth}` : ''}${counts.death ? ` · 逝世 ${counts.death}` : ''}
    </span>
  </div>`;
  items.forEach(it => {
    const [label, mod] = TYPE[it.event_type] || TYPE.event;
    const year = yearText(it.year);
    h += `<div class="hist-item">`;
    h += `<span class="hist-year ${mod}">${esc(year)}</span>`;
    h += `<div class="hist-body">`;
    h += `<div class="hist-title"><span class="hist-tag ${mod}">${label}</span>`;
    h += it.link ? `<a href="${safeUrl(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : `<span class="t">${esc(it.title)}</span>`;
    h += `</div>`;
    if (it.description) h += `<div class="hist-desc">${esc(it.description)}</div>`;
    h += `</div></div>`;
  });
  c.innerHTML = h;
}

function rKV(d, c, ep) {
  let h = '<div class="kv">';
  const entries = ep.keys ? ep.keys.map(k => Array.isArray(k) ? [k[0], d[k[0]], k[1]] : [k, d[k]]) : Object.entries(d).map(([k, v]) => [k, v]);
  entries.forEach(([k, v, label]) => {
    if (v == null || v === '') return;
    if (k === 'image' && typeof v === 'string' && /^https?:\/\//.test(v)) {
      h += `<div class="kv-row"><span class="k">${esc(label || k)}</span><span class="v"><img style="max-width:100%;height:auto;display:block;margin-top:4px;border-radius:8px" src="${esc(v)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></span></div>`;
      return;
    }
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

// 网页 OG 信息：社交分享预览卡（大图上、标题描述下、域名行）
function rOG(d, c) {
  const cardEl = c.closest('.card');
  const urlInput = cardEl?.querySelector('input[name="url"]');
  const u = (urlInput?.value || '').trim();
  let host = '';
  try { host = u ? new URL(u.startsWith('http') ? u : 'https://' + u).hostname : ''; } catch {}
  let h = `<div class="og-card">`;
  if (d.image) h += `<div class="og-img"><img src="${esc(d.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></div>`;
  h += `<div class="og-body">`;
  if (d.title) h += `<div class="og-title">${esc(d.title)}</div>`;
  if (d.description) h += `<div class="og-desc">${esc(d.description)}</div>`;
  if (host) h += `<div class="og-host">🔗 ${esc(host)}</div>`;
  h += `</div></div>`;
  c.innerHTML = h;
}

function rText(d, c, ep) {
  const t = ep.dk ? d[ep.dk] : (typeof d === 'string' ? d : JSON.stringify(d, null, 2));
  c.innerHTML = `<div class="text-block">${esc(t)}</div>`;
}

// 答案之书：神谕卡牌面——字标 + 逐字渐显答案（短答案竖排）+ 编号印章
function rAnswer(d, c) {
  const zh = d.answer || '';
  const en = d.answer_en || '';
  const idx = d.index != null ? Number(d.index) + 1 : null;
  // 短答案（≤6 字符）竖排更有神谕感；逐字 span 渐显，重渲染自动重播
  const chars = [...zh];
  const vertical = chars.length <= 6 && chars.every(ch => /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch));
  const zhHtml = chars.map((ch, i) => `<span class="ans-ch" style="animation-delay:${(0.15 + i * 0.07).toFixed(2)}s">${esc(ch)}</span>`).join('');
  const enChars = en ? [...en].map((ch, i) => `<span class="ans-ch" style="animation-delay:${(0.5 + i * 0.03).toFixed(2)}s">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('') : '';
  c.innerHTML = `<div class="answer-card${vertical ? ' vertical' : ''}">
    <div class="ans-frame"></div>
    <div class="ans-title">✦ THE BOOK OF ANSWERS ✦</div>
    <div class="ans-zh">${zhHtml}</div>
    ${en ? `<div class="ans-en">${enChars}</div>` : ''}
    <div class="ans-sep">◆ ◆ ◆</div>
    <div class="ans-seal">${idx ? `№ ${String(idx).padStart(3, '0')}` : 'ORACLE'}</div>
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

// SIMKL 流媒体热门榜：海报 + 评分 + 观看数 + 平台徽标
function rSimkl(d, c) {
  if (!Array.isArray(d) || d.length === 0) {
    c.innerHTML = '<div class="placeholder">该平台暂无上榜内容</div>';
    return;
  }
  let h = '';
  d.forEach(it => {
    const rank = it.rank || 0;
    const cls = rank <= 3 ? `top${rank}` : '';
    h += `<div class="simkl-item">`;
    if (it.poster) h += `<img class="simkl-poster" src="${esc(it.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    h += `<div class="simkl-body">`;
    h += it.link
      ? `<a href="${safeUrl(it.link)}" target="_blank" rel="noopener"><span class="rank ${cls}">${rank}</span> ${esc(it.title)}</a>`
      : `<span class="t"><span class="rank ${cls}">${rank}</span> ${esc(it.title)}</span>`;
    let meta = '';
    if (it.rating) meta += `⭐ ${esc(String(it.rating))} `;
    if (it.watched != null) meta += ` · ${esc(String(it.watched))} 人在看 `;
    if (it.release_date) meta += ` · ${esc(it.release_date)}`;
    if (meta) h += `<div class="meta">${meta}</div>`;
    if (it.network) h += `<span class="simkl-badge">${esc(it.network)}</span>`;
    h += `</div></div>`;
  });
  c.innerHTML = h;
}

// 每日一句英语：中英对照 + 朗读按钮（点击播放 iciba 提供的 TTS mp3）
function rDailyEng(d, c) {
  const hasTts = !!d.tts;
  c.innerHTML = `<div class="daily-eng">
    <div class="de-en">${esc(d.content || '')}</div>
    <div class="de-zh">${esc(d.note || '')}</div>
    ${hasTts ? `<button class="de-tts" data-tts="${esc(d.tts)}" title="朗读">🔊 朗读</button>` : ''}
    ${d.dateline ? `<div class="de-meta">${esc(d.dateline)}</div>` : ''}
  </div>`;
  const btn = c.querySelector('.de-tts');
  if (btn) {
    let audio = null;
    btn.onclick = () => {
      if (!audio) audio = new Audio(btn.dataset.tts);
      if (audio.paused) { audio.play(); btn.classList.add('playing'); }
      else { audio.pause(); btn.classList.remove('playing'); }
      audio.onended = () => btn.classList.remove('playing');
    };
  }
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

// 通用数据瓦片（健康/IP/WHOIS/密码卡共用）：值为空自动跳过
function htTile(k, v) {
  if (v == null || v === '') return '';
  return `<div class="ht-tile"><span class="k">${esc(k)}</span><span class="v">${esc(String(v))}</span></div>`;
}

// 健康计算器：BMI 色带标尺 + 关键数字卡 + 数据瓦片 + 三围/建议折叠
function rHealth(d, c) {
  const bi = d.basic_info || {}, bmi = d.bmi || {}, wa = d.weight_assessment || {},
        me = d.metabolism || {}, bf = d.body_fat || {}, bsa = d.body_surface_area || {},
        im = d.ideal_measurements || {}, ha = d.health_advice || {};
  const num = v => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; };

  // BMI 标尺：15-35 色带（偏瘦蓝/正常绿/超重黄/肥胖红），指针落在当前值
  let gauge = '';
  const bv = num(bmi.value);
  if (bv != null) {
    const pos = Math.min(98, Math.max(2, ((bv - 15) / 20) * 100));
    gauge = `<div class="ht-gauge"><div class="ht-gauge-track"><i style="left:${pos}%"></i></div><div class="ht-gauge-scale"><span>偏瘦</span><span>正常</span><span>超重</span><span>肥胖</span></div></div>`;
  }

  const bmiChip = bmi.category ? `<span class="ht-chip">${esc(bmi.category)}</span>` : '';
  let h = `<div class="ht-bmi"><div class="ht-bmi-num"><b>${esc(String(bmi.value ?? '--'))}</b><span>BMI</span></div><div class="ht-bmi-info"><p>${esc(bmi.evaluation || '')}</p><p class="dim">${esc(bmi.risk || '')}</p></div>${bmiChip}</div>${gauge}`;

  const bigs = [
    ['⚖️', '标准体重', wa.standard_weight],
    ['🔥', '基础代谢', me.bmr != null ? `${me.bmr} kcal` : null],
    ['🏃', '每日消耗', me.tdee != null ? `${me.tdee} kcal` : null],
  ].filter(x => x[2] != null && x[2] !== '');
  if (bigs.length) h += `<div class="ht-bigs">${bigs.map(([ic, k, v]) => `<div class="ht-big"><span class="ic">${ic}</span><div class="tx"><span class="k">${esc(k)}</span><b>${esc(String(v))}</b></div></div>`).join('')}</div>`;

  const bfPct = num(bf.percentage);
  h += `<div class="ht-sec"><div class="ht-sec-t">🧬 体脂与身体组成</div>`;
  if (bfPct != null) {
    h += `<div class="ht-bf"><span>体脂率</span><div class="ht-bf-bar"><i style="width:${Math.min(100, Math.round(bfPct * 2))}%"></i></div><b>${esc(String(bf.percentage))}</b></div>`;
  }
  h += `<div class="ht-tiles">${htTile('体脂分类', bf.category)}${htTile('脂肪重量', bf.fat_weight)}${htTile('瘦体重', bf.lean_weight)}${htTile('体表面积', bsa.value)}</div></div>`;

  h += `<div class="ht-sec"><div class="ht-sec-t">🔥 热量参考</div><div class="ht-tiles">${htTile('推荐摄入', me.recommended_calories ? `${me.recommended_calories} kcal` : null)}${htTile('减重摄入', me.weight_loss_calories ? `${me.weight_loss_calories} kcal` : null)}${htTile('增重摄入', me.weight_gain_calories ? `${me.weight_gain_calories} kcal` : null)}${htTile('理想体重范围', wa.ideal_weight_range)}${htTile('身高', bi.height)}${htTile('体重', bi.weight)}${htTile('性别', bi.gender)}${htTile('年龄', bi.age)}</div></div>`;

  h += `<details class="ht-details"><summary>🎯 理想三围参考</summary><div class="ht-tiles">${htTile('胸围', im.chest)}${htTile('腰围', im.waist)}${htTile('臀围', im.hip)}${htTile('说明', im.note)}</div></details>`;
  const tips = Array.isArray(ha.health_tips) ? ha.health_tips.slice(0, 4).map(t => `<div class="ht-tip">• ${esc(t)}</div>`).join('') : '';
  h += `<details class="ht-details"><summary>💡 个性化建议</summary><div class="ht-tiles">${htTile('每日饮水', ha.daily_water_intake)}${htTile('运动建议', ha.exercise_recommendation)}${htTile('营养建议', ha.nutrition_advice)}</div>${tips}</details>`;
  if (d.disclaimer) h += `<div class="news-tip">⚠️ ${esc(d.disclaimer)}</div>`;
  c.innerHTML = h;
}

// 随机颜色：大色块 hero（亮度自适应文字色）+ 各格式行带复制按钮
function rColor(d, c) {
  const hex = d.hex || '#888';
  const bright = d.brightness != null ? Number(d.brightness) : 50;
  const fg = bright > 55 ? '#1c1917' : '#ffffff';
  const rows = [
    ['HEX', d.hex], ['RGB', d.rgb?.string], ['HSL', d.hsl?.string],
    ['HSV', d.hsv?.string], ['CMYK', d.cmyk?.string], ['LAB', d.lab?.string],
  ].filter(r => r[1]);
  let h = `<div class="clr-hero" style="background:${esc(hex)};color:${fg}"><span class="clr-name">${esc(d.name || '')}</span><b>${esc(hex)}</b><span class="clr-bright">亮度 ${esc(String(bright))}%</span></div>`;
  h += `<div class="clr-rows">${rows.map(([k, v]) => `<div class="clr-row"><span class="k">${esc(k)}</span><code>${esc(String(v))}</code><button class="clr-copy" type="button" data-v="${esc(String(v))}">复制</button></div>`).join('')}</div>`;
  c.innerHTML = h;
  c.querySelectorAll('.clr-copy').forEach(btn => {
    btn.onclick = () => {
      navigator.clipboard.writeText(btn.dataset.v || '').then(() => {
        btn.textContent = '已复制 ✓';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      }).catch(() => {});
    };
  });
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

// 密码生成：大字密码 + 显式复制按钮 + 强度色条 + 字符集 chips
function rPwd(d, c) {
  const setLabels = { lowercase: '小写', uppercase: '大写', numbers: '数字', symbols: '符号' };
  const sets = d.character_sets || {};
  const used = Object.keys(setLabels).filter(k => sets[k]);
  const gi = d.generation_info || {};
  const pwd = esc(d.password);
  const strengthMap = { 弱: ['25%', 'var(--error)'], 中: ['55%', '#f59e0b'], 强: ['85%', 'var(--success)'], 很强: ['100%', 'var(--success)'] };
  const [barW, barColor] = strengthMap[gi.strength] || ['50%', '#f59e0b'];

  c.innerHTML = `<div class="pwd-hero">
    <span class="pwd-text" data-pwd="${pwd}">${pwd}</span>
    <button class="pwd-copy" type="button">复制</button>
  </div>
  <div class="pwd-strength"><div class="pwd-strength-bar"><i style="width:${barW};background:${barColor}"></i></div><span style="color:${barColor}">${esc(gi.strength || '')}</span></div>
  <div class="ht-tiles">${htTile('长度', d.length)}${htTile('预估破解耗时', gi.time_to_crack)}${htTile('包含字符', used.join('、') || '-')}</div>`;
  const copyBtn = c.querySelector('.pwd-copy');
  const textEl = c.querySelector('.pwd-text');
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(textEl.dataset.pwd || '').then(() => {
      copyBtn.textContent = '已复制 ✓';
      copyBtn.classList.add('done');
      setTimeout(() => { copyBtn.textContent = '复制'; copyBtn.classList.remove('done'); }, 1500);
    }).catch(() => {});
  };
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

// 哈希加密：原文行 + 各算法等宽块，每行带复制按钮
function rHash(d, c) {
  const src = String(d.source || '');
  const rows = [
    ['MD5', d.md5],
    ['SHA-1', d.sha?.sha1], ['SHA-256', d.sha?.sha256], ['SHA-512', d.sha?.sha512],
    ['Base64', d.base64?.encoded], ['URL 编码', d.url?.encoded],
  ].filter(r => r[1]);
  let h = `<div class="hash-src">原文 <code>${esc(src.slice(0, 60))}${src.length > 60 ? '…' : ''}</code></div>`;
  h += `<div class="hash-rows">${rows.map(([k, v]) => `<div class="hash-row"><span class="hash-alg">${esc(k)}</span><code class="hash-val">${esc(String(v))}</code><button class="hash-copy" type="button" data-v="${esc(String(v))}">复制</button></div>`).join('')}</div>`;
  c.innerHTML = h;
  c.querySelectorAll('.hash-copy').forEach(btn => {
    btn.onclick = () => {
      navigator.clipboard.writeText(btn.dataset.v || '').then(() => {
        btn.textContent = '已复制 ✓';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      }).catch(() => {});
    };
  });
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
  if (w.humidity != null) stats.push(['💧', '湿度', `${w.humidity}%`]);
  if (w.wind_direction) stats.push(['🌬️', '风力', `${w.wind_direction} ${w.wind_power || ''}${w.wind_power ? '级' : ''}`]);
  if (w.pressure != null) stats.push(['📊', '气压', `${w.pressure} hPa`]);
  if (w.precipitation != null) stats.push(['🌧️', '降水', `${w.precipitation} mm`]);
  if (stats.length) h += `<div class="wx-grid">${stats.map(([ic, k, v]) => `<div class="wx-stat"><span class="wx-stat-ic">${ic}</span><div class="wx-stat-tx"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div></div>`).join('')}</div>`;
  if (a.aqi != null) {
    h += `<div class="wx-aqi-panel">
      <span class="wx-aqi-badge" style="background:${aqiColors[a.level] || '#6b7280'}">${esc(a.quality || '')}<b>${esc(String(a.aqi))}</b></span>
      <div class="wx-aqi-vals">
        <span>PM2.5 <b>${esc(String(a.pm25 ?? '-'))}</b></span>
        <span>PM10 <b>${esc(String(a.pm10 ?? '-'))}</b></span>
      </div>
      ${a.rank ? `<span class="wx-aqi-rank">全国第 ${esc(String(a.rank))}<i>/${esc(String(a.total_cities))} 位</i></span>` : ''}
    </div>`;
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
  s += `<path d="${maxPath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" style="filter:drop-shadow(0 1px 3px rgba(249,115,22,0.35))"/>`;
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
  const W = 560, H = 170, PADL = 34, PADR = 14, PADT = 14, PADB = 22;
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

// 金价：主价格大字 + 高低区间条 + localStorage 按日快照积累的趋势曲线 + 多品种瓷片
function goldHistory() {
  try { return JSON.parse(localStorage.getItem('goldHistory') || '{}'); } catch { return {}; }
}
function goldHistoryPush(date, price) {
  if (!date || price == null || Number.isNaN(Number(price))) return goldHistory();
  const h = goldHistory();
  h[date] = Number(price);
  const keys = Object.keys(h).sort();
  const trimmed = {};
  keys.slice(-30).forEach(k => { trimmed[k] = h[k]; });
  try { localStorage.setItem('goldHistory', JSON.stringify(trimmed)); } catch {}
  return trimmed;
}

function goldChartSVG(hist) {
  const entries = Object.entries(hist).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (entries.length < 2) return '';
  const W = 360, H = 130, padT = 22, padB = 18, padX = 12;
  const vals = entries.map(e => e[1]);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const span = (hi - lo) || 1;
  const x = i => padX + (W - padX * 2) * i / (entries.length - 1);
  const y = v => padT + ((hi - v) / span) * (H - padT - padB);
  const pts = vals.map((v, i) => ({ X: x(i), Y: y(v) }));
  let line = `M ${pts[0].X.toFixed(1)} ${pts[0].Y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], mx = (a.X + b.X) / 2;
    line += ` C ${mx.toFixed(1)} ${a.Y.toFixed(1)}, ${mx.toFixed(1)} ${b.Y.toFixed(1)}, ${b.X.toFixed(1)} ${b.Y.toFixed(1)}`;
  }
  const area = line + ` L ${pts[pts.length - 1].X.toFixed(1)} ${H - padB} L ${pts[0].X.toFixed(1)} ${H - padB} Z`;
  let s = `<svg class="gold-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="金价走势">`;
  s += `<defs><linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59e0b" stop-opacity="0.3"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></linearGradient></defs>`;
  [0.35, 0.7].forEach(f => s += `<line x1="${padX}" x2="${W - padX}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3 5" stroke-width="0.5"/>`);
  s += `<path d="${area}" fill="url(#goldGrad)"/>`;
  s += `<path d="${line}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>`;
  pts.forEach((p, i) => {
    if (i === 0 || i === pts.length - 1) s += `<circle cx="${p.X.toFixed(1)}" cy="${p.Y.toFixed(1)}" r="3" fill="#f59e0b" stroke="var(--card)" stroke-width="1.5"/>`;
  });
  s += `<text x="${padX}" y="${H - 4}" font-size="9" fill="var(--text-dimmer)">${esc(entries[0][0].slice(5))}</text>`;
  s += `<text x="${W - padX}" y="${H - 4}" text-anchor="end" font-size="9" fill="var(--text-dimmer)">${esc(entries[entries.length - 1][0].slice(5))}</text>`;
  s += `<text x="${(pts[pts.length - 1].X - 6).toFixed(1)}" y="${(pts[pts.length - 1].Y - 9).toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="#f59e0b">¥${esc(String(vals[vals.length - 1]))}</text>`;
  s += `</svg>`;
  return s;
}

function rGold(d, c) {
  const main = (d.metals || []).find(m => m.name === '今日金价') || (d.metals || [])[0];
  if (!main) return rJSON(d, c, true);
  const cur = Number(main.today_price || main.sell_price);
  const hist = goldHistoryPush(d.date, cur);
  const hi = Number(main.high_price), lo = Number(main.low_price);
  const pos = (hi > lo && !Number.isNaN(hi) && !Number.isNaN(lo)) ? Math.min(96, Math.max(4, Math.round((cur - lo) / (hi - lo) * 100))) : 50;

  let h = `<div class="gold-head"><span class="gold-date">📅 ${esc(d.date || '')}</span>${main.updated ? `<span class="gold-upd">${esc(String(main.updated).slice(11))}</span>` : ''}</div>`;
  h += `<div class="gold-hero"><div class="gold-price">¥${esc(String(cur))}<span class="gold-unit">/克</span></div><div class="gold-name">${esc(main.name)}</div></div>`;
  if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
    h += `<div class="gold-range"><span class="gold-range-l">低 ¥${esc(String(lo))}</span><div class="gold-range-bar"><i style="left:${pos}%"></i></div><span class="gold-range-h">高 ¥${esc(String(hi))}</span></div>`;
  }
  const chart = goldChartSVG(hist);
  if (chart) h += `<div class="gold-chart-wrap">${chart}</div>`;
  else h += `<div class="gold-chart-tip">📈 已开始记录每日金价，明天起这里会出现趋势曲线</div>`;
  const others = (d.metals || []).filter(m => m !== main).slice(0, 8);
  if (others.length) {
    h += `<div class="gold-grid">${others.map(m => `<div class="gold-tile"><span class="gold-tile-name">${esc(m.name)}</span><span class="gold-tile-val">¥${esc(String(m.today_price || m.sell_price || '-'))}</span></div>`).join('')}</div>`;
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
  if (d.cover) h += `<div class="img-wrap ratio-banner"><img src="${esc(d.cover)}" alt="bing" loading="lazy"></div>`;
  h += '<div class="kv">';
  if (d.copyright) h += `<div class="kv-row"><span class="k">描述</span><span class="v">${esc(d.copyright)}</span></div>`;
  if (d.update_date) h += `<div class="kv-row"><span class="k">日期</span><span class="v">${esc(d.update_date)}</span></div>`;
  h += '</div>';
  c.innerHTML = h;
}

// 免费游戏空态（Epic/Steam 共用）：居中图标 + 主文案 + 副说明，比单行灰字更明显
const EMPTY_GAMES_HTML = `<div class="empty-state"><span class="es-icon">🎁</span><span class="es-text">暂无免费游戏</span><span class="es-sub">新活动上线后会显示在这里</span></div>`;

function rEpic(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  if (!d.length) { c.innerHTML = EMPTY_GAMES_HTML; return; }
  let h = '';
  d.forEach(g => {
    h += '<div class="game-card">';
    if (g.cover) h += `<div class="img-wrap ratio-banner"><img src="${esc(g.cover)}" alt="${esc(g.title)}" loading="lazy" onerror="this.style.display='none'"></div>`;
    h += `<div class="game-title">🎮 ${esc(g.title)}</div>`;
    if (g.description) h += `<div class="desc">${esc(g.description.slice(0, 80))}${g.description.length > 80 ? '…' : ''}</div>`;
    if (g.is_free_now) h += '<span class="game-free">免费</span>';
    if (g.free_end) h += ` <span class="game-end">截止 ${esc(g.free_end)}</span>`;
    if (g.link) h += `<div class="game-claim"><a href="${safeUrl(g.link)}" target="_blank" rel="noopener">领取 →</a></div>`;
    h += '</div>';
  });
  c.innerHTML = h;
}

// Steam 免费游戏：复用 epic 的卡片样式
function rSteam(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  if (!d.length) { c.innerHTML = EMPTY_GAMES_HTML; return; }
  let h = '';
  d.forEach(g => {
    h += '<div class="game-card">';
    if (g.cover) h += `<div class="img-wrap ratio-capsule"><img src="${esc(g.cover)}" alt="${esc(g.title)}" loading="lazy" onerror="this.style.display='none'"></div>`;
    h += `<div class="game-title">🎮 ${esc(g.title)}</div>`;
    if (g.is_free_now) h += '<span class="game-free">免费</span>';
    if (g.original_price) h += ` <span class="game-orig">${esc(g.original_price)}</span>`;
    if (g.link) h += `<div class="game-claim"><a href="${safeUrl(g.link)}" target="_blank" rel="noopener">领取 →</a></div>`;
    h += '</div>';
  });
  c.innerHTML = h;
}

// 酷安热榜
function rKuan(d, c) {
  if (!d || !d.topics) return rJSON(d, c);
  let h = '';
  d.topics.forEach((t, i) => {
    const cls = i < 3 ? 'top'+(i+1) : '';
    // 话题封面优先，缺失时回退方形 logo 图标
    const icon = t.logo || t.cover || '';
    let meta = '';
    if (t.hotness) meta += `<span class="hot">🔥 ${esc(String(t.hotness))}</span>`;
    if (t.followers) meta += ` · 👥 ${esc(String(t.followers))}`;
    if (t.comments) meta += ` · 💬 ${esc(String(t.comments))}`;
    if (t.rating && t.rating.score) meta += ` · ⭐ ${esc(String(t.rating.score))}`;
    if (icon) {
      h += `<div class="item with-poster with-cover">`;
      h += `<img class="poster cover-square" src="${esc(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
      h += `<div class="body-wrap">`;
      h += `<a href="${safeUrl(t.url)}" target="_blank" rel="noopener"><span class="rank ${cls}">${i+1}</span> ${esc(t.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    } else {
      h += `<div class="item"><span class="rank ${cls}">${i+1}</span><div class="body">`;
      h += `<a href="${safeUrl(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    }
  });
  c.innerHTML = h;
}

// 36氪热榜
function r36Kr(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((e, i) => {
    const cls = i < 3 ? 'top'+(i+1) : '';
    const cover = e.cover || '';
    let meta = '';
    if (e.hot) meta += `<span class="hot">🔥 ${esc(e.hot_desc || String(e.hot))}</span>`;
    if (e.author) meta += ` · ${esc(e.author)}`;
    if (e.praise) meta += ` · 👍 ${esc(String(e.praise))}`;
    if (cover) {
      h += `<div class="item with-poster with-cover">`;
      h += `<img class="poster cover-square" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
      h += `<div class="body-wrap">`;
      h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener"><span class="rank ${cls}">${e.rank || i+1}</span> ${esc(e.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    } else {
      h += `<div class="item"><span class="rank ${cls}">${e.rank || i+1}</span><div class="body">`;
      h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    }
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
    const cls = i < 3 ? 'top'+(i+1) : '';
    const cover = e.cover || '';
    let meta = '';
    if (e.hot) meta += `<span class="hot">👍 ${esc(String(e.hot))}</span>`;
    if (e.author) meta += ` · ${esc(e.author)}`;
    if (e.comments) meta += ` · 💬 ${esc(String(e.comments))}`;
    if (cover) {
      h += `<div class="item with-poster with-cover">`;
      h += `<img class="poster cover-square" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
      h += `<div class="body-wrap">`;
      h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener"><span class="rank ${cls}">${e.rank || i+1}</span> ${esc(e.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    } else {
      h += `<div class="item"><span class="rank ${cls}">${e.rank || i+1}</span><div class="body">`;
      h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    }
  });
  c.innerHTML = h;
}

// 虎嗅热榜
function rHuxiu(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.forEach((e, i) => {
    const cls = i < 3 ? 'top'+(i+1) : '';
    const cover = e.cover || '';
    let meta = '';
    if (e.hot) meta += `<span class="hot">🔥 ${esc(String(e.hot))}</span>`;
    if (e.author) meta += ` · ${esc(e.author)}`;
    if (e.comments) meta += ` · 💬 ${esc(String(e.comments))}`;
    if (cover) {
      h += `<div class="item with-poster with-cover">`;
      h += `<img class="poster cover-square" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
      h += `<div class="body-wrap">`;
      h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener"><span class="rank ${cls}">${e.rank || i+1}</span> ${esc(e.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    } else {
      h += `<div class="item"><span class="rank ${cls}">${e.rank || i+1}</span><div class="body">`;
      h += `<a href="${safeUrl(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    }
  });
  c.innerHTML = h;
}

function rNCM(d, c) {
  if (!Array.isArray(d)) return rJSON(d, c);
  let h = '';
  d.slice(0, 20).forEach((r, i) => {
    const cls = i < 3 ? `top${i+1}` : '';
    const artistNames = (r.artist || []).map(a => a.name).join('、');
    // 专辑封面：升级 https 并请求 100x100 缩略图，网易云 CDN 无防盗链
    const cover = r.album?.cover ? `https://${r.album.cover.replace(/^https?:\/\//, '')}?param=100y100` : '';
    let meta = '';
    if (artistNames) meta += esc(artistNames);
    if (r.album?.name) meta += ` · ${esc(r.album.name)}`;
    if (r.duration_desc) meta += ` · ${esc(r.duration_desc)}`;
    if (cover) {
      // 封面模式：序号内联在标题行首（与流媒体榜 rSimkl 一致）
      h += `<div class="item with-poster with-cover">`;
      h += `<img class="poster cover-square" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
      h += `<div class="body-wrap">`;
      h += r.link ? `<a href="${safeUrl(r.link)}" target="_blank" rel="noopener"><span class="rank ${cls}">${i+1}</span> ${esc(r.title)}</a>` : `<span class="t"><span class="rank ${cls}">${i+1}</span> ${esc(r.title)}</span>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    } else {
      // 无封面时回退原有布局
      h += `<div class="item"><span class="rank ${cls}">${i+1}</span><div class="body">`;
      h += r.link ? `<a href="${safeUrl(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : `<span class="t">${esc(r.title)}</span>`;
      if (meta) h += `<div class="meta">${meta}</div>`;
      h += '</div></div>';
    }
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

// 猫眼在映 / 待映影片：复用带海报的榜单行（与豆瓣周榜、百度电视剧榜同一套样式）
function rMaoyanMovie(d, c) {
  const list = Array.isArray(d) ? d : (d && d.list) || [];
  if (!list.length) { c.innerHTML = '<div class="placeholder">暂无影片信息</div>'; return; }
  let h = '';
  list.forEach(m => {
    const rank = m.rank || 0;
    const cls = rank <= 3 ? `top${rank}` : '';
    const meta = [];
    if (m.score) meta.push(`⭐ ${esc(m.score)}`);
    if (m.wish_desc) meta.push(`❤️ ${esc(m.wish_desc)}人想看`);
    // 在映条目 show_info 是排片信息（含「影院/场次」），与上映日期一并展示；
    // 待映条目无排片，优先展示上映日期
    const isShowing = !!m.show_info && /影院|场/.test(m.show_info);
    if (isShowing) meta.push(esc(m.show_info));
    if (m.coming_title) meta.push(`📅 ${esc(m.coming_title)}`);
    else if (!isShowing && m.release_date) meta.push(`📅 ${esc(m.release_date)}`);
    const titleHtml = m.link
      ? `<a href="${safeUrl(m.link)}" target="_blank" rel="noopener"><span class="rank ${cls}">${rank}</span> ${esc(m.movie_name)}</a>`
      : `<span class="t"><span class="rank ${cls}">${rank}</span> ${esc(m.movie_name)}</span>`;
    const bodyInner = titleHtml +
      (meta.length ? `<div class="meta">${meta.join(' · ')}</div>` : '') +
      (m.star ? `<div class="desc">主演 ${esc(String(m.star).slice(0, 40))}${String(m.star).length > 40 ? '…' : ''}</div>` : '');
    // 单条无海报则走无图布局
    if (m.cover) {
      h += `<div class="item with-poster"><img class="poster" src="${esc(m.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` +
        `<div class="body-wrap">${bodyInner}</div></div>`;
    } else {
      h += `<div class="item"><span class="rank ${cls}">${rank}</span><div class="body">${bodyInner}</div></div>`;
    }
  });
  c.innerHTML = h;
}

// 百度电视剧 / 电影榜：海报行 + 类型/热度 + 主演（上游 show 标签已由后端结构化）
function rBaiduShow(d, c) {
  if (!Array.isArray(d) || !d.length) { c.innerHTML = '<div class="placeholder">暂无数据</div>'; return; }
  let h = '';
  d.forEach(it => {
    const rank = it.rank || 0;
    const cls = rank <= 3 ? `top${rank}` : '';
    const meta = [];
    if (it.genre) meta.push(`🏷️ ${esc(it.genre)}`);
    if (it.score_desc) meta.push(`🔥 ${esc(it.score_desc)}`);
    const titleHtml = it.url
      ? `<a href="${safeUrl(it.url)}" target="_blank" rel="noopener"><span class="rank ${cls}">${rank}</span> ${esc(it.title)}</a>`
      : `<span class="t"><span class="rank ${cls}">${rank}</span> ${esc(it.title)}</span>`;
    const bodyInner = titleHtml +
      (meta.length ? `<div class="meta">${meta.join(' · ')}</div>` : '') +
      (it.actors ? `<div class="desc">主演 ${esc(it.actors)}</div>` : '') +
      (it.desc ? `<div class="desc">${esc(String(it.desc).slice(0, 60))}${String(it.desc).length > 60 ? '…' : ''}</div>` : '');
    // 单条无海报则走无图布局
    if (it.cover) {
      h += `<div class="item with-poster"><img class="poster" src="${esc(it.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` +
        `<div class="body-wrap">${bodyInner}</div></div>`;
    } else {
      h += `<div class="item"><span class="rank ${cls}">${rank}</span><div class="body">${bodyInner}</div></div>`;
    }
  });
  c.innerHTML = h;
}

// 摸鱼日历：日期+状态徽标 → 倒计时瓷片 → 下个假期 → 周/月/年进度条 → 摸鱼语录
function rMoyu(d, c) {
  const d0 = d.date || {};
  const t = d.today || {};
  const p = d.progress || {};
  const cd = d.countdown || {};
  const nh = d.nextHoliday || {};
  const ch = d.currentHoliday;

  // 状态徽标：法定/传统假期优先（排除英文星期名），其次休息日/工作日
  let statusBadge = '';
  if (ch && ch.name && t.isHoliday && !/sunday|saturday/i.test(String(ch.name))) {
    statusBadge = `<span class="moyu-badge holiday">🎉 ${esc(String(ch.name))}假期 · 第 ${esc(String(ch.dayOfHoliday))} 天</span>`;
  } else if (t.isWorkday === false) {
    statusBadge = `<span class="moyu-badge rest">🌴 休息日</span>`;
  } else {
    statusBadge = `<span class="moyu-badge work">💼 工作日</span>`;
  }

  const lunarTxt = d0.lunar ? `农历${esc(String(d0.lunar.monthCN))}${esc(String(d0.lunar.dayCN))}` : '';
  let h = `<div class="moyu-head">
    <div class="moyu-date"><b>${esc(String(d0.gregorian || '').slice(5))}</b><span>${esc(d0.weekday || '')}${lunarTxt ? ' · ' + lunarTxt : ''}</span></div>
    ${statusBadge}
  </div>`;

  const tiles = [
    ['💼', '距周五', cd.toFriday], ['🏖️', '距周末', cd.toWeekEnd],
    ['📅', '距月末', cd.toMonthEnd], ['🎊', '距年末', cd.toYearEnd],
  ].filter(x => x[2] != null);
  if (tiles.length) {
    h += `<div class="moyu-tiles">${tiles.map(([ic, k, v]) => `<div class="moyu-tile"><span class="ic">${ic}</span><div class="tx"><span class="k">${esc(k)}</span><span class="v">${esc(String(v))}<i> 天</i></span></div></div>`).join('')}</div>`;
  }

  if (nh.name) {
    h += `<div class="moyu-next">🎊 下一个假期 <b>${esc(String(nh.name))}</b><span>${esc(String(nh.date || ''))} · 放 ${esc(String(nh.duration))} 天 · 还有 <b>${esc(String(nh.until))}</b> 天</span></div>`;
  }

  [['week', '本周'], ['month', '本月'], ['year', '本年']].forEach(([k, label]) => {
    const pr = p[k];
    if (pr && pr.percentage != null) {
      h += `<div class="moyu-progress"><div class="moyu-progress-label"><span>${label}进度</span><span>${esc(String(pr.percentage))}% · 第 ${esc(String(pr.passed))}/${esc(String(pr.total))} 天</span></div><div class="moyu-progress-bar"><i style="width:${Math.min(100, pr.percentage)}%"></i></div></div>`;
    }
  });

  if (d.moyuQuote) h += `<div class="moyu-quote">🐟 ${esc(d.moyuQuote)}</div>`;
  c.innerHTML = h || '<div class="placeholder">暂无数据</div>';
}

// WHOIS：域名头 + 到期倒计时徽标（临期变色）+ 数据瓦片 + NS + 状态 pills
function rWhois(d, c) {
  let remain = null;
  if (d.expires_at) remain = Math.ceil((Number(d.expires_at) - Date.now()) / 86400000);
  const expColor = remain == null ? 'var(--text-dim)' : remain < 30 ? 'var(--error)' : remain < 180 ? '#f59e0b' : 'var(--success)';

  let h = `<div class="whois-dom"><span class="whois-name">${esc(d.domain || '')}</span>${d.dnssec ? '<span class="whois-dnssec" title="已启用 DNSSEC">DNSSEC</span>' : ''}</div>`;
  if (d.expires) {
    h += `<div class="whois-exp"><span class="k">到期时间</span><b>${esc(d.expires)}</b>${remain != null ? `<span class="whois-remain" style="color:${expColor};border-color:${expColor}">剩 ${remain} 天</span>` : ''}</div>`;
  }
  h += `<div class="ht-tiles">${htTile('注册商', d.registrar)}${htTile('创建日期', d.created)}${htTile('更新日期', d.updated)}${htTile('注册时长', d.duration_desc || d.duration)}</div>`;
  if (d.nameservers?.length) {
    h += `<div class="whois-ns"><span class="k">DNS 服务器</span><div>${d.nameservers.slice(0, 6).map(ns => `<code>${esc(ns)}</code>`).join('')}</div></div>`;
  }
  if (d.status?.length) {
    h += `<div class="whois-status">${d.status.slice(0, 6).map(s => `<span class="whois-pill" title="${esc(s)}">${esc(s)}</span>`).join('')}</div>`;
  }
  c.innerHTML = h;
}

// IP 查询：IP 大字 + 归属瓦片 + OSM 地图链接
function rIP(d, c) {
  const loc = [d.country, d.prov, d.city].filter(Boolean).join(' · ');
  let h = `<div class="ip-hero"><span class="ip-label">📍 ${esc(d.ip || '--')}</span></div>`;
  h += `<div class="ht-tiles">${htTile('国家/地区', loc)}${htTile('运营商', d.isp)}${htTile('时区', d.timezone)}${htTile('AS 号', d.asnumber)}${htTile('邮编', d.zipcode)}${htTile('数据源', d.source)}</div>`;
  const lat = parseFloat(d.lat), lng = parseFloat(d.lng);
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    h += `<a class="ip-map" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(d.lat)}&mlon=${encodeURIComponent(d.lng)}#map=11/${encodeURIComponent(d.lat)}/${encodeURIComponent(d.lng)}" target="_blank" rel="noopener">🗺️ 在 OpenStreetMap 上查看大致位置 →</a>`;
  }
  c.innerHTML = h;
}

// 密码强度检测：分数色带 + 强度/破解耗时 + 字符集勾选 + 改进建议
function rPwdChk(d, c) {
  const score = Math.min(100, Math.max(0, Number(d.score) || 0));
  const color = score >= 80 ? 'var(--success)' : score >= 50 ? '#f59e0b' : 'var(--error)';
  const ca = d.character_analysis || {};
  const sets = [['小写字母', ca.has_lowercase], ['大写字母', ca.has_uppercase], ['数字', ca.has_numbers], ['特殊符号', ca.has_symbols]];

  let h = `<div class="pwchk-hero">
    <div class="pwchk-score" style="color:${color}"><b>${score}</b><span>/100</span></div>
    <div class="pwchk-side">
      <span class="pwchk-crack">🔓 破解耗时 <b>${esc(d.time_to_crack || '-')}</b></span>
    </div>
    <span class="pwchk-strength" style="background:${color}">${esc(d.strength || '未知')}</span>
  </div>
  <div class="pwchk-bar"><i style="width:${score}%;background:${color}"></i></div>
  <div class="ht-tiles">${htTile('密码长度', d.length)}${htTile('熵值', d.entropy != null ? `${d.entropy} bits` : null)}${htTile('字符多样度', ca.character_variety != null ? `${ca.character_variety}%` : null)}${htTile('被测密码', d.password)}</div>
  <div class="pwchk-sets">${sets.map(([k, v]) => `<span class="pwchk-set ${v ? 'on' : ''}">${v ? '✓' : '✗'} ${k}</span>`).join('')}</div>`;
  const recs = Array.isArray(d.recommendations) ? d.recommendations : [];
  if (recs.length) h += `<div class="pwchk-recs">${recs.slice(0, 4).map(r => `<div class="pwchk-rec">💡 ${esc(r)}</div>`).join('')}</div>`;
  c.innerHTML = h;
}

// JS 题目：题目排版 + 代码块（可复制）+ 可点击选项答题（答后揭晓正确项与解析）
function rJS(d, c) {
  let ansIdx = -1;
  if (typeof d.answer === 'number') ansIdx = d.answer;
  else if (typeof d.answer === 'string') {
    const t = d.answer.trim();
    if (/^[A-Da-d]$/.test(t)) {
      // 字母答案（"A"-"D"），上游接口返回的就是这种
      ansIdx = t.toUpperCase().charCodeAt(0) - 65;
    } else {
      const byText = Array.isArray(d.options) ? d.options.indexOf(d.answer) : -1;
      const byNum = Number(t);
      ansIdx = byText >= 0 ? byText : (Number.isInteger(byNum) ? byNum : -1);
    }
  }

  let h = `<div class="jsq"><div class="jsq-q"><span class="jsq-no">Q${esc(String(d.id ?? ''))}</span><span class="jsq-qt">${esc(d.question || '')}</span></div>`;
  if (d.code) {
    h += `<div class="jsq-code"><button class="jsq-copy" type="button">复制</button><pre><code>${esc(d.code)}</code></pre></div>`;
  }
  if (Array.isArray(d.options)) {
    h += `<div class="jsq-opts">${d.options.map((opt, i) => `<button class="jsq-opt" type="button" data-i="${i}"><span class="jsq-opt-no">${String.fromCharCode(65 + i)}</span>${esc(opt)}</button>`).join('')}</div>`;
    h += `<div class="jsq-verdict" hidden></div>`;
  }
  if (d.explanation) h += `<div class="jsq-exp" hidden><span class="jsq-exp-t">💡 解析</span>${esc(d.explanation)}</div>`;
  h += `</div>`;
  c.innerHTML = h;

  const opts = [...c.querySelectorAll('.jsq-opt')];
  const verdict = c.querySelector('.jsq-verdict');
  const exp = c.querySelector('.jsq-exp');
  const copyBtn = c.querySelector('.jsq-copy');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(d.code || '').then(() => {
        copyBtn.textContent = '已复制 ✓';
        setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
      }).catch(() => {});
    };
  }
  if (!opts.length || ansIdx < 0) { if (exp) exp.hidden = false; return; }

  let done = false;
  opts.forEach(btn => {
    btn.onclick = () => {
      if (done) return;
      done = true;
      const pick = Number(btn.dataset.i);
      const correct = pick === ansIdx;
      opts.forEach((b, i) => {
        b.disabled = true;
        if (i === ansIdx) b.classList.add('correct');
        else if (i === pick) b.classList.add('wrong');
      });
      if (verdict) {
        verdict.textContent = correct ? '✓ 答对了！' : `✗ 正确答案是 ${String.fromCharCode(65 + ansIdx)}`;
        verdict.className = 'jsq-verdict ' + (correct ? 'ok' : 'bad');
        verdict.hidden = false;
      }
      if (exp) exp.hidden = false;
    };
  });
}

// 汇率：基准 + 常用币种列表 + 金额换算计算器（纯前端，基于已加载的 rates）
// 汇率：瓷片格展示常用币种（每 100 基准货币）+ 换算计算器（支持币种互换）
// 用货币符号而非国旗 emoji：Windows 不渲染区域旗帜，会退化成字母对
const EX_SYMBOLS = { CNY:'¥', USD:'$', EUR:'€', JPY:'¥', GBP:'£', HKD:'HK$', KRW:'₩', AUD:'A$', CAD:'C$', SGD:'S$', TWD:'NT$', THB:'฿', RUB:'₽', INR:'₹', CHF:'Fr', NZD:'NZ$', MYR:'RM', PHP:'₱', VND:'₫', TRY:'₺', BRL:'R$', ZAR:'R' };

function rExchange(d, c) {
  const base = d.base_code || 'CNY';
  const rates = {};
  if (Array.isArray(d.rates)) d.rates.forEach(r => { rates[r.currency] = r.rate; });
  const popular = ['USD','EUR','JPY','GBP','HKD','KRW','AUD','CAD','SGD','TWD'].filter(c => rates[c] != null);
  const sym = code => EX_SYMBOLS[code] || '¤';

  // 头部：基准徽标 + 更新时间
  let h = `<div class="ex-head"><span class="ex-base">基准 <b>${esc(base)}</b></span>${d.updated ? `<span class="ex-upd">${esc(d.updated)}</span>` : ''}</div>`;

  // 常用币种瓷片：每 100 基准货币兑换值（比小数直观，同银行牌价习惯）
  h += `<div class="ex-tiles">${popular.map(code => {
    const v = (rates[code] * 100);
    const vs = v >= 100 ? v.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : v.toFixed(2);
    return `<div class="ex-tile"><span class="ex-sym">${esc(sym(code))}</span><div class="ex-tile-tx"><span class="ex-code">${code}</span><span class="ex-val">${vs}</span></div></div>`;
  }).join('')}</div>`;

  // 换算计算器：金额+源币种在上，结果+目标币种在下，中间互换按钮
  const allCodes = Object.keys(rates).sort();
  h += `<div class="ex-calc">
    <div class="ex-calc-row">
      <input class="ex-amount" type="number" min="0" value="100" inputmode="decimal" aria-label="金额">
      <select class="ex-from" aria-label="源币种">${allCodes.map(cd => `<option value="${cd}"${cd === base ? ' selected' : ''}>${cd}</option>`).join('')}</select>
    </div>
    <button class="ex-swap" type="button" title="交换币种" aria-label="交换币种">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v13"/><path d="M3.5 7.5 7 4l3.5 3.5"/><path d="M17 20V7"/><path d="M13.5 16.5 17 20l3.5-3.5"/></svg>
    </button>
    <div class="ex-calc-row">
      <div class="ex-result">--</div>
      <select class="ex-to" aria-label="目标币种">${allCodes.map(cd => `<option value="${cd}"${cd === popular[0] ? ' selected' : ''}>${cd}</option>`).join('')}</select>
    </div>
  </div>`;

  c.innerHTML = h;

  const amountEl = c.querySelector('.ex-amount');
  const fromEl = c.querySelector('.ex-from');
  const toEl = c.querySelector('.ex-to');
  const resultEl = c.querySelector('.ex-result');
  function calc() {
    const amt = parseFloat(amountEl.value) || 0;
    const from = fromEl.value, to = toEl.value;
    const fr = rates[from], tr = rates[to];
    if (fr == null || tr == null) { resultEl.textContent = '无该币种汇率'; return; }
    const out = (amt * tr / fr).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
    resultEl.innerHTML = `<span class="ex-res-num">${out}</span><span class="ex-res-code">${esc(to)}</span>`;
  }
  amountEl.oninput = calc; fromEl.onchange = calc; toEl.onchange = calc;
  c.querySelector('.ex-swap').onclick = () => {
    const tmp = fromEl.value;
    fromEl.value = toEl.value;
    toEl.value = tmp;
    calc();
  };
  calc();
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
    // 与 style.css 的 --mesh-* 变量保持同源：品牌火焰渐变玫瑰端（#fb7185）派生的玫红色系
    const dark = document.documentElement.dataset.theme === 'dark';
    return {
      line: dark ? 'rgba(225,125,155,0.09)' : 'rgba(238,140,160,0.10)',
      lineNear: dark ? 'rgba(248,130,158,0.16)' : 'rgba(236,120,145,0.18)',
      dot: dark ? 'rgba(251,113,133,0.42)' : 'rgba(251,113,133,0.28)',
      glow: dark ? 'rgba(251,113,133,0.04)' : 'rgba(251,113,133,0.05)',
    };
  }

  function cellKey(cx, cy) { return cx + ',' + cy; }

  function initMesh() {
    // DPR 上限 1.5：更低的栅格化像素量，背景线条极淡看不出差别
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    let id = 0;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const ox = (i - 1) * SPACING;
        const oy = (j - 1) * SPACING;
        pts.push({
          id: id++,
          ox, oy, x: ox, y: oy,
          // 每个点独立的浮动参数
          phase: Math.random() * Math.PI * 2,
          speed: 0.0003 + Math.random() * 0.0005,
          amp: 15 + Math.random() * 25,
        });
      }
    }
  }

  // 30fps 上限：动画本身极缓慢，30fps 与 60fps 观感无差，GPU/CPU 减半
  const MESH_FRAME_INTERVAL = 1000 / 30;
  let lastMeshFrame = 0;

  // 尊重系统“减少动态效果”偏好：只绘制静态网格，不启动动画循环
  const meshReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function drawMesh(ts) {
    if (!meshReduceMotion) rafId = requestAnimationFrame(drawMesh);
    if (ts - lastMeshFrame < MESH_FRAME_INTERVAL) return;
    lastMeshFrame = ts;

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
    cx.strokeStyle = colors.line;
    for (const p of pts) {
      const gx = Math.floor(p.x / SPACING);
      const gy = Math.floor(p.y / SPACING);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighbors = gridMap.get(cellKey(gx + dx, gy + dy));
          if (!neighbors) continue;
          for (const q of neighbors) {
            if (q === p) continue;
            // 避免重复：只画 id 较小的那对（原来是 indexOf 线性扫描，O(n²) 每帧几十万次比较）
            if (p.id >= q.id) continue;
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







