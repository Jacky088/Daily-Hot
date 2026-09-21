/**
 * emoji.js —— 统一 emoji 渲染层（本地 SVG 图标）
 *
 * 为什么需要它：
 *   emoji 由系统字体渲染，Windows（Segoe UI Emoji）、macOS（Apple Color Emoji）、
 *   Android（Noto Color Emoji）乃至各家 Linux 的字形、粗细、基线、占位宽度都不一样，
 *   同一套界面在不同设备上观感差异很大（菜单图标、卡片标题尤其明显）。
 *   这里把所有会出现在页面上的 emoji 统一换成本地 SVG 图标（Twemoji 资源，
 *   见 public/emoji/），任何设备、任何字体设置下渲染结果完全一致。
 *
 * 怎么生效：
 *   本文件必须在 app.js 之前加载（index.html 中已前置）。它改写 Element 原型上的
 *   innerHTML / outerHTML 的 setter 与 insertAdjacentHTML，凡是写进 DOM 的 HTML 字符串
 *   都会先做一次「emoji → <img class="emo">」转换，因此菜单、卡片、悬浮层等所有动态
 *   渲染出口都无需逐个改造。
 *   - 标签整段跳过：只替换文本节点里的 emoji，属性值里的 emoji（如 onerror 回退字符）
 *     保持原样，避免把 HTML 塞进引号里撑破结构。
 *   - 未收录的 emoji 原样保留（退化成系统 emoji），不会产生破图。
 *
 * 静态与特殊出口（不走 innerHTML，需要单独处理）：
 *   - index.html 里写死的 emoji：直接写成 <img class="emo" src="/emoji/xxx.svg" alt="…">；
 *   - CSS 装饰性 emoji：用等价的 background-image 指向 /emoji/xxx.svg
 *     （见 style.css 的 .hl-hot::before）；
 *   - textContent 出口：textContent 不接受 HTML，需在调用处改用 innerHTML。
 *
 * 图标资源：由 scripts/fetch-emoji.mjs 生成，新增 emoji 后重跑该脚本即可。
 * 图形版权：Twemoji（CC-BY 4.0，https://github.com/jdecked/twemoji）。
 */
(function () {
  'use strict';

  // 项目里用到的全部 emoji。必须逐项写成字符串字面量：像 🛠️（码位 + 变体选择符）、
  // #️⃣（三码位组合）、🇬🇧（两枚区域指示符）这类序列若按单个码位拆开就匹配不到了
  var EMOJI = [
    '#️⃣', '↗', '⏰', '⏱', '⏳', '▶️', '☀️', '☁️', '♀', '♂',
    '⚖️', '⚠️', '⚡', '⛽', '✨', '❤️', '⬇', '⭐', '🇬🇧', '🈯',
    '🌀', '🌅', '🌇', '🌍', '🌐', '🌓', '🌙', '🌤️', '🌦️', '🌧️',
    '🌬️', '🌴', '🌾', '🍀', '🍃', '🍗', '🍿', '🎁', '🎉', '🎊',
    '🎞️', '🎤', '🎥', '🎧', '🎨', '🎪', '🎬', '🎭', '🎮', '🎯',
    '🎵', '🎶', '🎼', '🏀', '🏃', '🏖️', '🏠', '🏮', '🏷️', '🐙',
    '🐟', '🐯', '👍', '👥', '💎', '💡', '💧', '💪', '💬', '💱',
    '💻', '💼', '📅', '📈', '📊', '📌', '📍', '📕', '📖', '📚',
    '📜', '📝', '📡', '📰', '📱', '📺', '🔇', '🔊', '🔍', '🔐',
    '🔓', '🔗', '🔤', '🔥', '🕒', '🖌️', '🖥️', '🖼️', '🗂', '🗓️',
    '🗺️', '😂', '😴', '🚀', '🚗', '🛠️', '🟧', '🤣', '🤪', '🥁',
    '🥇', '🧩', '🧬', '🧭', '🧮',
  ];

  var DIR = '/emoji/';

  // 取字符串的全部码位（正确处理代理对）
  function codePoints(str) {
    var out = [];
    for (var i = 0; i < str.length; ) {
      var cp = str.codePointAt(i);
      out.push(cp);
      i += cp > 0xffff ? 2 : 1;
    }
    return out;
  }

  // emoji → 资源名：丢弃变体选择符 FE0F，其余码位取小写十六进制、以 - 连接
  // 例：🔥 → 1f525，🛠️ → 1f6e0，#️⃣ → 23-20e3，🇬🇧 → 1f1ec-1f1e7
  function assetOf(e) {
    var cps = codePoints(e).filter(function (c) {
      return c !== 0xfe0f;
    });
    return cps
      .map(function (c) {
        return c.toString(16);
      })
      .join('-');
  }

  function imgHtml(e) {
    // alt 保留原字符：读屏可识别；万一图标缺失，浏览器也会退化回 emoji 字形
    return (
      '<img class="emo" src="' +
      DIR +
      assetOf(e) +
      '.svg" alt="' +
      e +
      '" loading="lazy" decoding="async" draggable="false">'
    );
  }

  // 备选项按长度降序，保证多码位组合（#️⃣、🇬🇧、❤️…）先于其单码位前缀匹配
  var ALTERNATIVES = EMOJI.slice()
    .sort(function (a, b) {
      return b.length - a.length;
    })
    .map(function (e) {
      return e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('|');

  // <[^>]*> 先吃掉整段标签，只有落在文本里的 emoji 才会被第 1 组捕获
  var RE = new RegExp('<[^>]*>|(' + ALTERNATIVES + ')', 'g');
  var HAS_EMOJI = new RegExp(ALTERNATIVES);

  function emojiHtml(html) {
    if (typeof html !== 'string' || !HAS_EMOJI.test(html)) return html;
    return html.replace(RE, function (m, e) {
      return e ? imgHtml(e) : m;
    });
  }

  // ---- 接管所有 HTML 写入出口 ----
  function wrapSetter(name) {
    var desc = Object.getOwnPropertyDescriptor(Element.prototype, name);
    if (!desc || !desc.set) return;
    Object.defineProperty(Element.prototype, name, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: function (value) {
        desc.set.call(this, typeof value === 'string' ? emojiHtml(value) : value);
      },
    });
  }
  wrapSetter('innerHTML');
  wrapSetter('outerHTML');

  var insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  if (typeof insertAdjacentHTML === 'function') {
    Element.prototype.insertAdjacentHTML = function (position, html) {
      return insertAdjacentHTML.call(this, position, emojiHtml(html));
    };
  }

  // 供需要显式转换的场景（例如把 textContent 改成 innerHTML）调用
  window.emojiHtml = emojiHtml;
  window.emojiAsset = assetOf;
})();
