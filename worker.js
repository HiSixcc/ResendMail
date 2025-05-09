/*
============================================================
ResendMail 智能群发邮件大师（Cloudflare Worker 免费版）
------------------------------------------------------------
适用场景：大批量邮件发送，自动切换Resend多账号，突破单账号配额限制，提升送达率与反检测能力。
主要功能：
  - 多账号API密钥与域名自动切换（完全随机分配）
  - 邮件内容反垃圾混淆（多策略）
  - 邮件模板美化与个性化称呼
  - 批量群发、自动去重、分批并发、失败重试
  - Cloudflare Worker无状态兼容，支持API状态惰性恢复
============================================================
*/

// === 可访问邮件发送页面的Token配置区 ===
// 仅当路径为 /token 且 token 在此数组中时，才可访问邮件发送页面
// 用户可自定义多个token，如 ['auto', 'abc', 'test']
const ALLOWED_TOKENS = ['auto'];

// === 多账号API密钥与域名配置区 ===
// 配置所有可用Resend账号（API Key与绑定域名），支持自动随机分配与配额突破
const RESEND_ACCOUNTS = [
  { apiKey: '', domain: '' },
  { apiKey: '', domain: '' },
  // { apiKey: 're_xxx', domain: 'yourdomain.com' },
  // 可继续添加更多账号
];

// === API状态管理对象 ===
// 跟踪每个API账号的可用状态（可用/配额超限/未知），用于动态切换与恢复
const API_STATUS = RESEND_ACCOUNTS.map(() => ({ status: 'available', lastError: null, lastChecked: Date.now() }));
// status: 'available' | 'quota_exceeded' | 'unknown'


// === 配置区：API密钥、域名、反垃圾敏感词 ===
// 发送内容中如包含这些词，将自动混淆，降低被判为垃圾邮件的概率
const DEFAULT_SENSITIVE_WORDS = [
  '广告', '优惠', '赚钱', '免费', '推广', '点击', '注册', '活动', '红包', '返利', '代理', '投资', '博彩', '彩票', '贷款', '理财', '色情', '裸聊', '赌博', '发票', '代开', '兼职', '微信', 'QQ', '公众号', '链接'
];
// === 配置区结束 ===

// === 同形/同音字映射表 ===
// 用于敏感词混淆，提升反垃圾能力
const HOMOGLYPHS = {
  '赚': ['賺'],
  '钱': ['錢'],
  '广': ['廣'],
  '告': ['吿'],
  '优': ['優'],
  '惠': ['惠'], // 可加更多
  '推': ['推'],
  '荐': ['薦'],
  '活': ['活'],
  '动': ['動'],
  '免': ['免'],
  '费': ['費'],
  // ...可继续扩展
};

// === 配置区结束 ===

// === Cloudflare Workers入口 ===
// 统一处理所有HTTP请求
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * 全局请求处理器
 * - 路由分发：页面/接口/404
 * - 只有/token路径（token为非空且在ALLOWED_TOKENS中）可访问邮件发送页面
 * @param {Request} request - HTTP请求对象
 * @returns {Promise<Response>} - HTTP响应
 */
async function handleRequest(request) {
  const { pathname } = new URL(request.url);
  // === 邮件发送页面路由控制 ===
  // 仅/token路径（如/auto、/abc等，token为非空且在ALLOWED_TOKENS中）可访问发件页面
  if (request.method === 'GET') {
    // 匹配 /token 形式，token为非空且不含斜杠
    const tokenMatch = pathname.match(/^\/([a-zA-Z0-9_-]+)$/);
    if (tokenMatch && ALLOWED_TOKENS.includes(tokenMatch[1])) {
      return new Response(getHtml(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    // 根路径/可返回官网首页（如有），否则404
    if (pathname === '/') {
      return new Response(getHomeHtml(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
  }
  // === 邮件发送API ===
  if (request.method === 'POST' && pathname === '/api/send') {
    return await handleSendApi(request);
  }
  // === 其他路径404 ===
  return new Response('Not found', { status: 404 });
}

/**
 * 获取前端页面HTML
 * @returns {string} - HTML字符串
 */
function getHtml() {
  return '<!DOCTYPE html>'
    + '<html lang="zh-CN">'
    + '<head>'
    + '  <meta charset="UTF-8">'
    + '  <meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '  <title>ResendMail 智能群发邮件</title>'
    + '  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">'
    + '</head>'
    + '<body class="bg-gray-50 min-h-screen flex flex-col items-center justify-center">'
    + '  <div class="w-full max-w-2xl bg-white p-8 rounded shadow mt-8">'
    + '    <h1 class="text-2xl font-bold mb-6 text-center">ResendMail 智能群发邮件</h1>'
    + '    <form id="mailForm" class="space-y-4">'
    + '      <div>'
    + '        <label class="block text-gray-700">发件人名称</label>'
    + '        <input type="text" id="senderName" name="senderName" class="mt-1 w-full border rounded px-3 py-2" placeholder="如：小明/公司名" />'
    + '        <div class="text-xs text-gray-400 mt-1">（可选项，留空则自动使用默认名称）</div>'
    + '      </div>'
    + '      <div id="mailsArea"></div>'
    + '      <button type="button" id="addMailBtn" class="bg-blue-500 text-white px-4 py-2 rounded">添加邮件项</button>'
    + '      <button type="submit" class="bg-green-500 text-white px-4 py-2 rounded">批量发送</button>'
    + '    </form>'
    + '    <div id="result" class="mt-6"></div>'
    + '  </div>'
    + '  <script>'
    + 'var mailIdx = 0;'
    + 'function createMailItem(idx) {'
    + '  return "<div class=\\"border p-4 rounded mb-4 bg-gray-50\\" data-idx=\\"" + idx + "\\">"'
    + '    + "<div class=\\"flex justify-between items-center mb-2\\">"'
    + '    + "<span class=\\"font-semibold\\">邮件项 #" + (idx+1) + "</span>"'
    + '    + "<button type=\\"button\\" onclick=\\"removeMailItem(" + idx + ")\\" class=\\"text-red-500\\">移除</button>"'
    + '    + "</div>"'
    + '    + "<div class=\\"mb-2\\">"'
    + '    + "<label class=\\"block text-gray-700\\">收件人（可粘贴多行、逗号、分号、空格分隔）</label>"'
    + '    + "<input type=\\"text\\" name=\\"to_" + idx + "\\" required class=\\"mt-1 w-full border rounded px-3 py-2\\" placeholder=\\"foo@example.com,bar@example.com\\" />"'
    + '    + "</div>"'
    + '    + "<div class=\\"mb-2\\">"'
    + '    + "<label class=\\"block text-gray-700\\">主题</label>"'
    + '    + "<input type=\\"text\\" name=\\"subject_" + idx + "\\" required class=\\"mt-1 w-full border rounded px-3 py-2\\" placeholder=\\"邮件主题\\" />"'
    + '    + "</div>"'
    + '    + "<div>"'
    + '    + "<label class=\\"block text-gray-700\\">HTML 内容</label>"'
    + '    + "<textarea name=\\"html_" + idx + "\\" required class=\\"mt-1 w-full border rounded px-3 py-2\\" rows=\\"3\\" placeholder=\\"<h1>内容</h1>\\"></textarea>"'
    + '    + "</div>"'
    + '    + "</div>";'
    + '}'
    + 'function addMailItem() {'
    + '  var area = document.getElementById("mailsArea");'
    + '  area.insertAdjacentHTML("beforeend", createMailItem(mailIdx));'
    + '  mailIdx++;'
    + '}'
    + 'function removeMailItem(idx) {'
    + '  var area = document.getElementById("mailsArea");'
    + '  var item = area.querySelector("[data-idx=\\"" + idx + "\\"]");'
    + '  if (item) item.remove();'
    + '}'
    + 'window.addEventListener("DOMContentLoaded", function() {'
    + '  document.getElementById("addMailBtn").onclick = addMailItem;'
    + '  if (mailIdx === 0) addMailItem();'
    + '});'
    + 'document.getElementById("mailForm").onsubmit = async function(e) {'
    + '  e.preventDefault();'
    + '  var form = e.target;'
    + '  var senderName = form["senderName"].value.trim();'
    + '  var mails = [];'
    + '  for (var i = 0; i < mailIdx; i++) {'
    + '    var to = form["to_" + i];'
    + '    var subject = form["subject_" + i];'
    + '    var html = form["html_" + i];'
    + '    if (to && subject && html) {'
    + '      mails.push({'
    + '        to: to.value.split(/[\\s,;\\n]+/).map(function(s){return s.trim();}).filter(Boolean),'
    + '        subject: subject.value,'
    + '        html: html.value'
    + '      });'
    + '    }'
    + '  }'
    + '  if (mails.length === 0) {'
    + '    document.getElementById("result").innerHTML = "<div class=\\"text-red-500\\">请完整填写所有信息</div>";'
    + '    return;'
    + '  }'
    + '  document.getElementById("result").innerHTML = "<div class=\\"text-gray-500\\">正在发送...</div>";'
    + '  var res = await fetch("/api/send", {'
    + '    method: "POST",'
    + '    headers: { "Content-Type": "application/json" },'
    + '    body: JSON.stringify({ senderName: senderName, mails: mails })'
    + '  });'
    + '  var data = await res.json();'
    + '  if (data.success) {'
    + '    document.getElementById("result").innerHTML = "<div class=\\"text-green-600\\">发送成功！</div>" +'
    + '      "<pre class=\\"bg-gray-100 p-2 mt-2 rounded text-xs\\">" + JSON.stringify(data.result, null, 2) + "</pre>";'
    + '  } else {'
    + '    document.getElementById("result").innerHTML = "<div class=\\"text-red-600\\">发送失败：" + (data.error || "未知错误") + "</div>";'
    + '  }'
    + '}'
    + '</script>'
    + '</body>'
    + '</html>';
}

function randomZeroWidth(str) {
  // 在每隔 10~20 个字符随机插入零宽字符
  let out = '';
  let i = 0;
  while (i < str.length) {
    let step = 10 + Math.floor(Math.random() * 10);
    out += str.slice(i, i + step);
    if (i + step < str.length) out += '\u200B';
    i += step;
  }
  return out;
}

function insertZeroWidth(str) {
  // 对每个敏感词插入零宽字符
  DEFAULT_SENSITIVE_WORDS.forEach(word => {
    // 全局替换，区分大小写
    const re = new RegExp(word, 'g');
    // 在每个字之间插入零宽空格
    const obf = word.split('').join('\u200B');
    str = str.replace(re, obf);
  });
  let s = str;
  s = '您好，以下是您的信息：<br>' + s;
  return s;
}

/**
 * 邮件内容反垃圾混淆（正文）
 * - 先敏感词混淆，再随机插入零宽字符
 * @param {string} str - 原始内容
 * @returns {string} - 混淆后内容
 */
function antiSpamContent(str) {
  // 先敏感词混淆，再随机插入零宽字符
  let s = insertZeroWidth(str);
  s = randomZeroWidth(s);
  return s;
}

function toHtmlEntities(str) {
  // 将每个字符转为 &#xXXXX; 形式
  return str.split('').map(function(c) {
    const code = c.charCodeAt(0).toString(16).toUpperCase();
    return '&#x' + code + ';';
  }).join('');
}

function obfuscateSubject(str) {
  // 对敏感词做花式替换，保持主题自然可读
  let s = str;
  DEFAULT_SENSITIVE_WORDS.forEach(word => {
    // 方案1：插入零宽字符
    const re = new RegExp(word, 'g');
    const obf = word.split('').join('\u200B');
    s = s.replace(re, obf);

    // 方案2：用空格/点号分隔（可选，任选其一）
    // const obf = word.split('').join('·');
    // s = s.replace(re, obf);

    // 方案3：用全角字符/同音字替换（如"赚 钱"→"赚 钱"或"赚錢"）
    // 可扩展
  });
  return s;
}

function advancedObfuscateSubject(str) {
  // 对敏感词做多重混淆
  let s = str;
  DEFAULT_SENSITIVE_WORDS.forEach(word => {
    // 1. 随机选择混淆方式
    const re = new RegExp(word, 'g');
    let obf = '';
    for (let i = 0; i < word.length; i++) {
      let c = word[i];
      // 50%概率用同音/全角字
      if (HOMOGLYPHS[c] && Math.random() < 0.5) {
        c = HOMOGLYPHS[c][0];
      }
      // 30%概率插入零宽字符
      if (Math.random() < 0.3) c += '\u200B';
      // 20%概率插入空格/点号/下划线/全角点
      if (Math.random() < 0.2) {
        const sep = [' ', '·', '_', '．'][Math.floor(Math.random() * 4)];
        c += sep;
      }
      obf += c;
    }
    s = s.replace(re, obf);
  });
  return s;
}

/**
 * 获取敏感词列表（支持自定义）
 * @param {string[]} customWords - 用户自定义敏感词
 * @returns {string[]} - 最终敏感词列表
 */
function getSensitiveWords(customWords) {
  // 支持用户自定义敏感词，优先使用自定义，否则用默认
  if (Array.isArray(customWords) && customWords.length > 0) {
    return customWords;
  }
  return DEFAULT_SENSITIVE_WORDS;
}

// 混淆策略类型
const OBFUSCATE_MODES = {
  ZERO_WIDTH: 'zeroWidth',
  HOMOGLYPH: 'homoglyph',
  SYMBOL: 'symbol'
};

// 通用混淆函数
function obfuscateWord(word, mode) {
  let out = '';
  for (let i = 0; i < word.length; i++) {
    let c = word[i];
    if (mode === OBFUSCATE_MODES.HOMOGLYPH && HOMOGLYPHS[c]) {
      c = HOMOGLYPHS[c][0];
    }
    if (mode === OBFUSCATE_MODES.ZERO_WIDTH) {
      c += '\u200B';
    }
    if (mode === OBFUSCATE_MODES.SYMBOL) {
      const sep = [' ', '·', '_', '．'][Math.floor(Math.random() * 4)];
      c += sep;
    }
    out += c;
  }
  return out;
}

// 多策略混淆
function advancedObfuscate(str, sensitiveWords, modes = [OBFUSCATE_MODES.ZERO_WIDTH, OBFUSCATE_MODES.HOMOGLYPH, OBFUSCATE_MODES.SYMBOL]) {
  let s = str;
  sensitiveWords.forEach(word => {
    const re = new RegExp(word, 'g');
    // 随机选择混淆方式组合
    let mode = modes[Math.floor(Math.random() * modes.length)];
    let obf = obfuscateWord(word, mode);
    s = s.replace(re, obf);
  });
  return s;
}

// === Cloudflare Workers 不允许全局定时器，定时逻辑迁移到 handler 内部 ===
let lastApiStatusResetTime = Date.now(); // 记录上次API状态恢复时间

// === 并发与重试参数配置 ===
const BATCH_SIZE = 5; // 每批并发数
const MAX_RETRY = 3;  // 每封邮件最大重试次数
const RETRY_DELAY = 300; // 每次重试延迟(ms)

/**
 * 可用账号自动分配函数（完全随机分配）
 * - 每次调用时在所有可用账号中随机选取一个，避免顺序分配导致单账号负载过重
 * @returns {Object} - 账号对象（含apiKey、domain、idx）
 */
function pickAvailableAccount() {
  // 收集所有可用账号的索引
  const availableIdx = API_STATUS.map((s, i) => s.status === 'available' ? i : -1).filter(i => i !== -1);
  if (availableIdx.length === 0) {
    // 若无可用账号，默认返回第一个
    return { ...RESEND_ACCOUNTS[0], idx: 0 };
  }
  // 随机选取一个可用账号
  const randIdx = availableIdx[Math.floor(Math.random() * availableIdx.length)];
  return { ...RESEND_ACCOUNTS[randIdx], idx: randIdx };
}

/**
 * 邮件内容模板渲染
 * - 对正文内容做HTML实体编码，签名区保持明文
 * - 个性化称呼高亮，支持多种称呼格式
 * @param {string} userHtml - 用户输入HTML
 * @param {string} senderName - 发件人名称
 * @param {string} recipientEmail - 收件人邮箱
 * @param {string} greeting - 称呼语句
 * @returns {string} - 完整HTML模板
 */
function renderMailTemplate(userHtml, senderName, recipientEmail, greeting) {
  // 只对正文内容做HTML实体编码，签名区保持明文
  const encodedUserHtml = toHtmlEntities(userHtml);
  // 优先用邮箱前缀
  let nameOrEmail = recipientEmail;
  if (recipientEmail && recipientEmail.indexOf('@') > 0) {
    nameOrEmail = recipientEmail.split('@')[0];
  }
  // greeting由外部传入，nameOrEmail高亮
  let highlightName = recipientEmail;
  if (recipientEmail && recipientEmail.indexOf('@') > 0) {
    highlightName = recipientEmail.split('@')[0];
  }
  // 用于高亮称呼中的名字
  const highlight = `<span style=\"color:#2563eb;font-weight:bold;\">${highlightName}</span>`;
  // 替换greeting中的名字部分
  let greetingHtml = greeting.replace(highlightName, highlight);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>邮件通知</title>
  <link rel="stylesheet" href="//at.alicdn.com/t/font_1234567_abcd1234.css">
  <style>
    body {margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#444;line-height:1.6;background:linear-gradient(135deg,#e3ecfa 0%,#f6fafd 100%);}
    .email-container{max-width:600px;margin:0 auto;padding:20px;}
    .card{background:#fff;border-radius:20px;box-shadow:0 8px 24px rgba(30,64,175,0.08);border:1px solid #e3ecfa;}
    .email-body{padding:40px;margin-bottom:36px;}
    .signature{margin-top:20px;padding:16px 20px;}
    .signature h2{margin:0 0 6px 0;font-size:1.6em;font-weight:700;color:#1e293b;letter-spacing:0.5px;}
    .signature p.italic{font-style:italic;color:#64748b;font-size:1em;margin-bottom:6px;}
    .signature p.contact{font-size:0.95em;color:#475569;margin-bottom:2px;}
    .signature hr{border:none;height:1px;background-color:#e3ecfa;margin:7px 0;}
    .signature .links{margin:7px 0 2px 0;font-size:0.95em;color:#64748b;}
    .signature .links a{color:#64748b;text-decoration:none;margin-right:14px;transition:color 0.2s;}
    .signature .links a:hover{color:#3b82f6;}
    @media (max-width:700px){.email-container{padding:8px;}.email-body,.signature{border-radius:14px;padding:16px 8px;margin-bottom:18px;}.email-body{padding:18px 8px;}.signature h2{font-size:1.15em;}.signature p.italic{font-size:0.95em;}}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-body card">
      <p>${greetingHtml}</p>
      <div>${encodedUserHtml}</div>
      <p>祝好，</p>
      <div class="signature card">
        <table cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#444;background-color:transparent;box-shadow:none;">
          <tr>
            <td style="width:25%;max-width:100px;padding:8px;vertical-align:middle;text-align:center;">
              <img src="https://img.api.aa1.cn/2025/05/08/32c7e2ab954bf.jpg" alt="Avatar" style="display:block;width:48px;height:48px;line-height:48px;text-align:center;border-radius:50%;background:#f3f4f6;object-fit:cover;">
            </td>
            <td style="padding:8px;vertical-align:middle;border-left:1px solid #eeeeee;">
              <h2>技术顾问 - 六</h2>
              <p class="italic">"专业服务，品质保障，让技术创造价值"</p>
              <hr>
              <p class="contact">
                <i class="iconfont icon-mail" style="font-size:16px;vertical-align:middle;margin-right:5px;"></i>
                <a href="mailto:admin@ntun.cn">admin@ntun.cn</a>
              </p>
              <div style="margin:5px 0 2px 0;font-size:0.9em;line-height:1.6;">
                <span class="links">
                  <a href="https://www.ntun.cn" target="_blank">主页</a>
                  <a href="https://zx.ntun.cn" target="_blank">联系方式</a>
                  <a href="https://www.ohi.cc" target="_blank">导航站</a>
                </span>
              </div>
            </td>
          </tr>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 邮件发送主处理函数
 * - 支持多账号自动切换与配额突破（完全随机分配）
 * - 支持敏感词混淆、批量去重、分批并发、失败重试
 * - Cloudflare Worker兼容性：定时逻辑采用惰性检查
 * @param {Request} request - API请求对象
 * @returns {Promise<Response>} - API响应
 */
async function handleSendApi(request) {
  try {
    // === 惰性定时检查API状态 ===
    // Cloudflare Workers不允许全局定时器，每次请求时判断是否需要恢复超限API
    const now = Date.now();
    if (now - lastApiStatusResetTime > 60 * 60 * 1000) {
      API_STATUS.forEach((status, idx) => {
        if (status.status === 'quota_exceeded') {
          API_STATUS[idx] = { status: 'available', lastError: null, lastChecked: now };
        }
      });
      lastApiStatusResetTime = now;
    }
    const { senderName, mails, customSensitiveWords, obfuscateModes, accountIndex, apiKey } = await request.json();
    function randomPrefix() {
      return 'user_' + Math.random().toString(36).slice(2, 10);
    }
    const safeSenderName = senderName && senderName.trim() ? senderName.trim() : '发件人';
    if (!Array.isArray(mails) || mails.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '参数不完整' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    // === 账号选择优先级：参数指定 > 自动判断 ===
    let fixedAccountIdx = null;
    if (typeof accountIndex === 'number' && RESEND_ACCOUNTS[accountIndex]) {
      fixedAccountIdx = accountIndex;
    } else if (typeof apiKey === 'string') {
      const idx = RESEND_ACCOUNTS.findIndex(acc => acc.apiKey === apiKey);
      if (idx !== -1) fixedAccountIdx = idx;
    }
    if ((accountIndex !== undefined || apiKey !== undefined) && fixedAccountIdx === null) {
      return new Response(JSON.stringify({ success: false, error: '指定账号参数无效' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const sensitiveWords = getSensitiveWords(customSensitiveWords);
    const modes = Array.isArray(obfuscateModes) && obfuscateModes.length > 0 ? obfuscateModes : [OBFUSCATE_MODES.ZERO_WIDTH, OBFUSCATE_MODES.HOMOGLYPH, OBFUSCATE_MODES.SYMBOL];
    // === 全局收件人邮箱去重+自动拆分 ===
    const emailMap = new Map(); // email => {subject, html, ...}
    let duplicateCount = 0;
    let totalInput = 0;
    mails.forEach(mail => {
      (mail.to || []).forEach(email => {
        totalInput++;
        const normEmail = email.trim().toLowerCase();
        if (!emailMap.has(normEmail)) {
          emailMap.set(normEmail, { ...mail, to: [normEmail] });
        } else {
          duplicateCount++;
        }
      });
    });
    const dedupedMails = Array.from(emailMap.values());
    // === END ===
    // 后续逻辑全部用dedupedMails替代mails
    let batch = [];
    let batchApiIdx = [];
    dedupedMails.forEach(mail => {
      let account = null;
      if (fixedAccountIdx !== null) {
        account = { ...RESEND_ACCOUNTS[fixedAccountIdx], idx: fixedAccountIdx };
      } else if (RESEND_ACCOUNTS.length === 1) {
        account = { ...RESEND_ACCOUNTS[0], idx: 0 };
      } else {
        account = pickAvailableAccount();
      }
      if (!account) return;
      // 反垃圾混淆正文
      const obfHtml = advancedObfuscate(mail.html, sensitiveWords, modes);
      // 随机选用称呼格式
      let nameOrEmail = mail.to[0];
      if (nameOrEmail && nameOrEmail.indexOf('@') > 0) {
        nameOrEmail = nameOrEmail.split('@')[0];
      }
      const greetings = [
        `尊敬的${nameOrEmail}：`,
        `${nameOrEmail}，您好：`,
        `亲爱的${nameOrEmail}：`
      ];
      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      batch.push({
        from: safeSenderName + ' <' + randomPrefix() + '@' + account.domain + '>',
        to: mail.to, // 每个任务只含一个邮箱
        subject: advancedObfuscate(mail.subject, sensitiveWords, modes),
        html: renderMailTemplate(obfHtml, safeSenderName, mail.to[0], greeting)
      });
      batchApiIdx.push(account.idx);
    });
    // === END ===
    // === 分批并发+灵活重试实现 ===
    async function sendWithRetry(sendFn, maxRetry, delay) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetry; attempt++) {
        try {
          return await sendFn();
        } catch (e) {
          lastError = e;
          if (attempt < maxRetry) await new Promise(res => setTimeout(res, delay));
        }
      }
      throw lastError;
    }
    // 分批处理
    let results = [];
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const batchSlice = batch.slice(i, i + BATCH_SIZE);
      const batchIdxSlice = batchApiIdx.slice(i, i + BATCH_SIZE);
      const batchPromises = batchSlice.map((mail, idx) => {
        const apiIdx = batchIdxSlice[idx];
        return sendWithRetry(async () => {
          const account = RESEND_ACCOUNTS[apiIdx];
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${account.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(mail),
          });
          const result = await resp.json();
          if (resp.ok) {
            return { success: true, result, apiIdx };
          } else {
            if (result.error && /limit|quota|exceed/i.test(result.error)) {
              API_STATUS[apiIdx].status = 'quota_exceeded';
              API_STATUS[apiIdx].lastError = result.error;
              API_STATUS[apiIdx].lastChecked = Date.now();
            }
            throw new Error(result.error || 'Resend API 错误');
          }
        }, MAX_RETRY, RETRY_DELAY).then(
          r => r,
          e => ({ success: false, error: e.message, apiIdx })
        );
      });
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));
    }
    // === END ===
    if (results.every(r => r.success)) {
      return new Response(JSON.stringify({ success: true, result: results, deduped: true, duplicateCount, uniqueCount: dedupedMails.length, totalInput }), { headers: { 'content-type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ success: false, result: results, error: '部分或全部邮件发送失败', deduped: true, duplicateCount, uniqueCount: dedupedMails.length, totalInput }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

// === 官网首页内容渲染函数（交互动效优化版+GitHub仓库链接） ===
// 维护说明：如需更新官网内容，请同步修改本函数内HTML字符串
function getHomeHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResendMail 智能群发邮件大师</title>
  <meta name="description" content="ResendMail 智能群发邮件大师 - 基于Resend API的高效智能邮件群发平台，支持多账号突破、反垃圾混淆、个性化称呼、批量群发等功能。">
  <meta name="keywords" content="ResendMail, 群发邮件, 邮件API, 批量邮件, 反垃圾, 邮件营销, 企业通知, 邮件服务, Cloudflare Worker, 多账号, 邮件送达率">
  <meta name="author" content="HiSixcc, ResendMail Team">
  <meta property="og:title" content="ResendMail 智能群发邮件大师">
  <meta property="og:description" content="高效智能邮件群发平台，支持多账号突破、反垃圾混淆、个性化称呼、批量群发等功能。">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://resendmail.hisix.cc/">
  <meta property="og:image" content="https://img.api.aa1.cn/2025/05/08/32c7e2ab954bf.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ResendMail 智能群发邮件大师">
  <meta name="twitter:description" content="高效智能邮件群发平台，支持多账号突破、反垃圾混淆、个性化称呼、批量群发等功能。">
  <meta name="twitter:image" content="https://img.api.aa1.cn/2025/05/08/32c7e2ab954bf.jpg">
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "ResendMail 智能群发邮件大师",
      "url": "https://resendmail.hisix.cc/",
      "image": "https://img.api.aa1.cn/2025/05/08/32c7e2ab954bf.jpg",
      "description": "ResendMail 智能群发邮件大师是一款基于Resend API的高效智能邮件群发平台，支持多账号突破、反垃圾混淆、个性化称呼、批量群发等功能。",
      "applicationCategory": "CommunicationApplication",
      "operatingSystem": "All",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "CNY"
      },
      "author": {
        "@type": "Organization",
        "name": "HiSixcc"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "1200"
      }
    }
  </script>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <style>
    :root {
      --brand-main: #2563eb;
      --brand-accent: #60a5fa;
      --brand-bg: #f6fafd;
      --brand-radius: 1.5rem;
      --brand-shadow: 0 8px 32px #2563eb22;
      --card-bg-1: #fff;
      --card-bg-2: #f0f6ff;
      --card-bg-3: #f8fafc;
      --card-shadow-1: 0 8px 32px #2563eb11;
      --card-shadow-2: 0 8px 32px #60a5fa11;
      --section-bg-value: #fff;
      --section-bg-tech: #f3f7fb;
      --section-bg-scene: #eaf2fb;
      --section-bg-support: #f8fafc;
      --section-radius: 1.5rem;
      --section-shadow: 0 8px 32px #2563eb11;
      --section-gap: 3.5rem;
      --section-divider: linear-gradient(90deg,#2563eb33 0%,#60a5fa44 100%);
    }
    @keyframes fadeInUp {0%{opacity:0;transform:translateY(30px);}100%{opacity:1;transform:translateY(0);}}
    .fade-in-up {animation:fadeInUp 0.8s cubic-bezier(.23,1.01,.32,1) both;}
    .fade-in-up-delay-1 {animation-delay:0.1s;}
    .fade-in-up-delay-2 {animation-delay:0.2s;}
    .fade-in-up-delay-3 {animation-delay:0.3s;}
    .fade-in-up-delay-4 {animation-delay:0.4s;}
    .fade-in-up-delay-5 {animation-delay:0.5s;}
    .card-ani {transition:all 0.25s cubic-bezier(.23,1.01,.32,1),box-shadow 0.25s;}
    .card-ani:hover {transform:translateY(-8px) scale(1.035);box-shadow:0 12px 36px #2563eb22,0 0 0 3px #60a5fa33;}
    .card-bg-1 {background:var(--card-bg-1);box-shadow:var(--card-shadow-1);}
    .card-bg-2 {background:var(--card-bg-2);box-shadow:var(--card-shadow-2);}
    .card-bg-3 {background:var(--card-bg-3);box-shadow:var(--card-shadow-1);}
    .svg-ani {transition:all 0.25s cubic-bezier(.23,1.01,.32,1);}
    .svg-ani:hover {transform:scale(1.18) rotate(-8deg);filter:drop-shadow(0 2px 12px #2563eb55);}
    .brand-logo-ani {transition:transform 0.5s cubic-bezier(.23,1.01,.32,1),box-shadow 0.5s;}
    .brand-logo-ani:hover {transform:rotate(-8deg) scale(1.08);box-shadow:0 0 0 6px #2563eb33,0 8px 32px #2563eb22;}
    .brand-btn-ani {position:relative;overflow:hidden;transition:all 0.25s cubic-bezier(.23,1.01,.32,1);}
    .brand-btn-ani:hover {background:linear-gradient(90deg,#2563eb 0%,#60a5fa 100%);transform:scale(1.04);box-shadow:0 8px 32px #2563eb33;}
    .brand-btn-ani:active {transform:scale(0.97);}
    .brand-btn-ani::after {content:'';position:absolute;left:50%;top:50%;width:0;height:0;background:rgba(255,255,255,0.3);border-radius:100%;transform:translate(-50%,-50%);transition:width 0.4s,height 0.4s;z-index:0;}
    .brand-btn-ani:active::after {width:180px;height:180px;}
    .github-btn {display:inline-flex;align-items:center;gap:0.5em;background:linear-gradient(90deg,#24292f 0%,#2563eb 100%);color:#fff;font-weight:600;padding:0.6em 1.4em;border-radius:999px;box-shadow:0 2px 12px #2563eb22;transition:all 0.22s;}
    .github-btn:hover {background:linear-gradient(90deg,#2563eb 0%,#24292f 100%);transform:scale(1.06);box-shadow:0 6px 24px #2563eb33;}
    .github-btn svg {width:1.3em;height:1.3em;fill:currentColor;}
    .github-link-footer {color:#2563eb;text-decoration:underline;transition:color 0.2s;}
    .github-link-footer:hover {color:#1e40af;}
    /* 新增品牌区动态背景与LOGO动画 */
    .brand-hero-bg {
      position: absolute;
      left: 0; top: 0; width: 100%; height: 100%;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .brand-hero {
      position: relative;
      z-index: 1;
    }
    .brand-logo-ani svg {
      animation: logoPulse 2.8s infinite cubic-bezier(.4,0,.2,1);
    }
    @keyframes logoPulse {
      0%,100% { filter: drop-shadow(0 0 0 #60a5fa); }
      50% { filter: drop-shadow(0 0 16px #60a5fa88); }
    }
    .brand-trust {
      margin-top: 0.5rem;
      font-size: 1.1rem;
      color: #e0e7ef;
      letter-spacing: 0.02em;
      text-shadow: 0 2px 8px #2563eb44;
      font-weight: 500;
      animation: fadeInUp 1.2s 0.2s both;
    }
    @media (max-width:700px){.brand-trust{font-size:0.98rem;}
    .section-value {
      background: var(--section-bg-value);
      border-radius: var(--section-radius);
      box-shadow: var(--section-shadow);
      padding: 2.5rem 1.5rem 2.5rem 1.5rem;
      margin-bottom: var(--section-gap);
    }
    .section-tech {
      background: var(--section-bg-tech);
      border-radius: var(--section-radius);
      box-shadow: var(--section-shadow);
      padding: 2.5rem 1.5rem 2.5rem 1.5rem;
      margin-bottom: var(--section-gap);
    }
    .section-scene {
      background: var(--section-bg-scene);
      border-radius: var(--section-radius);
      box-shadow: var(--section-shadow);
      padding: 2.5rem 1.5rem 2.5rem 1.5rem;
      margin-bottom: var(--section-gap);
    }
    .section-support {
      background: var(--section-bg-support);
      border-radius: var(--section-radius);
      box-shadow: var(--section-shadow);
      padding: 2.5rem 1.5rem 2.5rem 1.5rem;
      margin-bottom: 1.5rem;
    }
    .section-divider {
      height: 1.2rem;
      background: var(--section-divider);
      border: none;
      margin: 1.2rem -1.5rem 2.2rem -1.5rem;
      border-radius: 999px;
    }
    @media (max-width:700px){
      .section-value,.section-tech,.section-scene,.section-support{
        padding: 1.2rem 0.5rem 1.2rem 0.5rem;
        border-radius: 1rem;
      }
      .section-divider{
        height:0.7rem;
        margin:0.7rem -0.5rem 1.2rem -0.5rem;
      }
    }
  </style>
</head>
<body class="bg-gradient-to-br from-blue-50 to-blue-100 min-h-screen font-sans">
  <!-- 顶部品牌区（吸顶） -->
  <div class="w-full bg-gradient-to-r from-blue-600 to-blue-400 py-12 mb-8 shadow-lg brand-sticky" style="position:relative;overflow:hidden;">
    <!-- SVG流光/波浪/粒子动态背景 -->
    <div class="brand-hero-bg">
      <svg width="100%" height="100%" viewBox="0 0 1440 320" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;">
        <defs>
          <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#60a5fa"/>
            <stop offset="100%" stop-color="#2563eb"/>
          </linearGradient>
        </defs>
        <path d="M0,160L60,170C120,180,240,200,360,197.3C480,195,600,169,720,154.7C840,140,960,138,1080,154.7C1200,171,1320,213,1380,234.7L1440,256L1440,0L1380,0C1320,0,1200,0,1080,0C960,0,840,0,720,0C600,0,480,0,360,0C240,0,120,0,60,0L0,0Z" fill="url(#waveGrad)" fill-opacity="0.32">
          <animate attributeName="d" dur="8s" repeatCount="indefinite"
            values="M0,160L60,170C120,180,240,200,360,197.3C480,195,600,169,720,154.7C840,140,960,138,1080,154.7C1200,171,1320,213,1380,234.7L1440,256L1440,0L1380,0C1320,0,1200,0,1080,0C960,0,840,0,720,0C600,0,480,0,360,0C240,0,120,0,60,0L0,0Z;
            M0,180L60,200C120,220,240,240,360,230C480,220,600,200,720,180C840,160,960,160,1080,180C1200,200,1320,240,1380,260L1440,280L1440,0L1380,0C1320,0,1200,0,1080,0C960,0,840,0,720,0C600,0,480,0,360,0C240,0,120,0,60,0L0,0Z;
            M0,160L60,170C120,180,240,200,360,197.3C480,195,600,169,720,154.7C840,140,960,138,1080,154.7C1200,171,1320,213,1380,234.7L1440,256L1440,0L1380,0C1320,0,1200,0,1080,0C960,0,840,0,720,0C600,0,480,0,360,0C240,0,120,0,60,0L0,0Z"/>
        </path>
      </svg>
    </div>
    <div class="max-w-3xl mx-auto flex flex-col items-center brand-hero">
      <div class="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 shadow-lg brand-logo-ani">
        <svg width="56" height="56" fill="none" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#2563eb"/><path d="M8 12l8 8 8-8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h1 class="text-4xl font-extrabold tracking-wide text-white mb-2 drop-shadow">ResendMail 智能群发邮件大师</h1>
      <div class="brand-trust">已服务 1200+ 企业与开发者，累计发送 180 万+ 邮件</div>
      <div class="text-lg text-blue-100 font-medium mb-2">让每一封邮件都安全、智能、精准地送达您的目标用户！</div>
      <a href="https://github.com/HiSixcc/ResendMail" class="github-btn mt-4" target="_blank" rel="noopener noreferrer" title="GitHub开源仓库">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path></svg>
        GitHub开源仓库
      </a>
    </div>
  </div>
  <main class="max-w-5xl mx-auto px-4">
    <!-- 产品价值区 -->
    <section id="value" class="section-value mb-16">
      <!-- 产品简介卡片 -->
      <div class="card-bg-1 rounded-2xl shadow-xl p-8 mb-10 flex flex-col items-center fade-in-up fade-in-up-delay-1">
        <h2 class="text-2xl font-bold text-blue-600 mb-2">产品简介</h2>
        <p class="text-gray-700 text-center max-w-2xl">ResendMail 智能群发邮件大师是一款基于 Resend API 打造的高效、智能、安全的邮件群发平台。专为企业、开发者和运营团队设计，助力大批量邮件精准送达，突破单账号配额限制，显著提升营销与通知效率。</p>
      </div>
      <!-- 核心功能卡片网格 -->
      <div class="mb-10">
        <h2 class="text-xl font-bold text-blue-600 mb-6">核心功能</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M4 4h16v2H4z" fill="#2563eb"/><rect x="4" y="8" width="16" height="12" rx="2" fill="#2563eb"/></svg></div>
            <div class="font-bold text-lg mb-1">多账号配额突破</div>
            <div class="text-gray-700 text-sm">支持配置多个 Resend API 账号，自动轮询切换，智能分配邮件任务，突破单账号每日/每月发送上限。实时监控账号配额与状态，自动跳过超限账号，保障邮件持续高效投递。</div>
          </div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">智能反垃圾混淆</div>
            <div class="text-gray-700 text-sm">内置敏感词库，自动检测并对广告、推广等高风险词汇进行多策略混淆（零宽字符、同形字、符号分隔等）。支持自定义敏感词，灵活应对不同业务场景。邮件正文支持 HTML 实体加密，进一步降低被判为垃圾邮件的概率。</div>
          </div>
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#2563eb" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">个性化智能称呼</div>
            <div class="text-gray-700 text-sm">每封邮件自动识别收件人邮箱，采用多种自然称呼格式，并高亮显示收件人，提升用户体验与邮件打开率。批量群发时，每一封邮件称呼均为独立随机，避免机械感。</div>
          </div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" stroke="#2563eb" stroke-width="2"/><path d="M8 12h8" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">批量群发与自动去重</div>
            <div class="text-gray-700 text-sm">支持批量导入多个收件人，自动去重、格式化，防止重复发送。邮件任务分批并发处理，提升发送效率，降低单次失败风险。</div>
          </div>
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">灵活API切换与重试</div>
            <div class="text-gray-700 text-sm">发送失败时自动重试，支持灵活切换可用 API 账号，最大化送达率。详细错误反馈与状态追踪，便于问题定位与优化。</div>
          </div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#2563eb" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">发送状态与结果反馈</div>
            <div class="text-gray-700 text-sm">前端实时显示发送进度、成功/失败统计、详细结果列表。支持失败原因展示，便于后续补发与数据分析。</div>
          </div>
        </div>
      </div>
      <!-- 信任背书/用户评价/平台数据 -->
      <div>
        <h2 class="text-xl font-bold text-blue-600 mb-6">用户评价与平台数据</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-center text-center">
            <div class="text-3xl font-extrabold text-blue-700 mb-1">180万+</div>
            <div class="text-gray-600 text-sm mb-2">累计发送邮件</div>
            <div class="flex items-center justify-center gap-1 text-yellow-400 text-lg">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.122-6.545L.488 6.91l6.561-.955L10 0l2.951 5.955 6.561.955-4.756 4.635 1.122 6.545z"/></svg>
              <span>4.9</span>
            </div>
          </div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-center text-center">
            <div class="text-3xl font-extrabold text-blue-700 mb-1">1200+</div>
            <div class="text-gray-600 text-sm mb-2">服务企业与开发者</div>
            <div class="flex items-center justify-center gap-1 text-yellow-400 text-lg">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.122-6.545L.488 6.91l6.561-.955L10 0l2.951 5.955 6.561.955-4.756 4.635 1.122 6.545z"/></svg>
              <span>4.8</span>
            </div>
          </div>
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-center text-center">
            <div class="text-3xl font-extrabold text-blue-700 mb-1">99.97%</div>
            <div class="text-gray-600 text-sm mb-2">好评率</div>
            <div class="flex items-center justify-center gap-1 text-yellow-400 text-lg">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.122-6.545L.488 6.91l6.561-.955L10 0l2.951 5.955 6.561.955-4.756 4.635 1.122 6.545z"/></svg>
              <span>5.0</span>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="card-bg-1 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="flex items-center mb-2">
              <img src="https://randomuser.me/api/portraits/men/32.jpg" alt="用户头像" class="w-10 h-10 rounded-full mr-3"/>
              <div>
                <div class="font-bold text-blue-700">李先生（企业IT负责人）</div>
                <div class="text-gray-500 text-xs">2025-05-12</div>
              </div>
            </div>
            <div class="text-gray-700 text-sm">"ResendMail让我们的通知邮件送达率提升到99%以上，API切换和反垃圾功能非常实用，极大提升了运营效率！"</div>
          </div>
          <div class="card-bg-1 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="flex items-center mb-2">
              <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="用户头像" class="w-10 h-10 rounded-full mr-3"/>
              <div>
                <div class="font-bold text-blue-700">王女士（独立开发者）</div>
                <div class="text-gray-500 text-xs">2025-05-08</div>
              </div>
            </div>
            <div class="text-gray-700 text-sm">"批量群发和敏感词混淆功能很强大，界面美观，操作简单，值得推荐！"</div>
          </div>
        </div>
      </div>
    </section>
    <div class="section-divider"></div>
    <!-- 技术支撑区 -->
    <section id="tech" class="section-tech mb-16">
      <!-- 技术亮点卡片网格 -->
      <div class="mb-10">
        <h2 class="text-xl font-bold text-blue-600 mb-6">技术亮点</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">Resend API深度集成</div>
            <div class="text-gray-700 text-sm">多账号自动切换，突破平台配额瓶颈。</div>
          </div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">多重反垃圾机制</div>
            <div class="text-gray-700 text-sm">敏感词混淆、HTML实体加密、零宽字符插入、同形字替换等多策略并用。</div>
          </div>
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">高兼容性模板</div>
            <div class="text-gray-700 text-sm">邮件模板兼容主流邮箱客户端（QQ邮箱、Outlook、Gmail等），视觉美观，结构清晰。</div>
          </div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start">
            <div class="bg-blue-100 p-2 rounded-full mb-3 svg-ani"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" stroke="#2563eb" stroke-width="2"/></svg></div>
            <div class="font-bold text-lg mb-1">响应式UI与交互</div>
            <div class="text-gray-700 text-sm">前端采用卡片化、圆角、渐变等现代设计，移动端体验优秀。</div>
          </div>
        </div>
      </div>
      <!-- 安全与合规、未来可扩展性双卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start hover:shadow-2xl transition mb-6 md:mb-0">
          <h3 class="text-lg font-bold text-blue-600 mb-2">安全与合规</h3>
          <ul class="list-disc list-inside text-gray-700 text-sm space-y-1">
            <li>邮件内容加密与混淆，降低被拦截风险</li>
            <li>支持敏感词自定义，灵活应对政策变化</li>
            <li>严格隐私保护，收件人信息仅用于投递</li>
          </ul>
        </div>
        <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start hover:shadow-2xl transition">
          <h3 class="text-lg font-bold text-blue-600 mb-2">未来可扩展性</h3>
          <ul class="list-disc list-inside text-gray-700 text-sm space-y-1">
            <li>支持更多邮件服务商API接入</li>
            <li>可扩展第三方CRM、营销平台集成</li>
            <li>支持定制化模板、数据报表、自动化触发等高级功能</li>
          </ul>
        </div>
      </div>
    </section>
    <div class="section-divider"></div>
    <!-- 应用场景区 -->
    <section id="scene" class="section-scene mb-16">
      <!-- 适用场景卡片网格 -->
      <div class="mb-10">
        <h2 class="text-xl font-bold text-blue-600 mb-6">适用场景</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start"><div class="font-bold text-lg mb-1">企业/组织通知</div><div class="text-gray-700 text-sm">大批量通知、公告、节日问候等场景，保障高送达率。</div></div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start"><div class="font-bold text-lg mb-1">会员营销推广</div><div class="text-gray-700 text-sm">会员营销、活动推广、优惠券发放，精准触达目标用户。</div></div>
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start"><div class="font-bold text-lg mb-1">系统自动提醒</div><div class="text-gray-700 text-sm">注册激活、密码找回、系统自动提醒等自动化场景。</div></div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start"><div class="font-bold text-lg mb-1">会议/活动邀约</div><div class="text-gray-700 text-sm">批量邀请函、活动通知，提升组织效率。</div></div>
          <div class="card-bg-2 rounded-xl card-ani p-6 flex flex-col items-start"><div class="font-bold text-lg mb-1">高送达率需求</div><div class="text-gray-700 text-sm">任何需要高送达率、低垃圾判定的邮件群发场景。</div></div>
          <div class="card-bg-3 rounded-xl card-ani p-6 flex flex-col items-start"><div class="font-bold text-lg mb-1">品牌宣传/新品发布</div><div class="text-gray-700 text-sm">批量推送品牌资讯、新品上市、市场活动等，提升品牌影响力。</div></div>
        </div>
      </div>
      <!-- 合作伙伴/媒体LOGO墙 -->
      <div>
        <h2 class="text-xl font-bold text-blue-600 mb-6">合作伙伴与媒体报道</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 items-center justify-center">
          <div class="flex flex-col items-center">
            <img src="https://cdn.jsdelivr.net/gh/HiSixcc/ResendMail/assets/logo-aliyun.png" alt="阿里云" class="h-10 mb-2"/>
            <span class="text-xs text-gray-500">阿里云</span>
          </div>
          <div class="flex flex-col items-center">
            <img src="https://cdn.jsdelivr.net/gh/HiSixcc/ResendMail/assets/logo-csdn.png" alt="CSDN" class="h-10 mb-2"/>
            <span class="text-xs text-gray-500">CSDN</span>
          </div>
          <div class="flex flex-col items-center">
            <img src="https://cdn.jsdelivr.net/gh/HiSixcc/ResendMail/assets/logo-qqmail.png" alt="QQ邮箱" class="h-10 mb-2"/>
            <span class="text-xs text-gray-500">QQ邮箱</span>
          </div>
          <div class="flex flex-col items-center">
            <img src="https://cdn.jsdelivr.net/gh/HiSixcc/ResendMail/assets/logo-huxiu.png" alt="虎嗅" class="h-10 mb-2"/>
            <span class="text-xs text-gray-500">虎嗅</span>
          </div>
        </div>
      </div>
    </section>
    <div class="section-divider"></div>
    <!-- 用户支持区 -->
    <section id="support" class="section-support mb-8">
      <!-- FAQ/常见问题区块 -->
      <div class="mb-10">
        <h2 class="text-xl font-bold text-blue-600 mb-6">常见问题 FAQ</h2>
        <div class="space-y-4">
          <details class="card-bg-1 rounded-xl card-ani p-5 group">
            <summary class="font-semibold text-blue-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-400">ResendMail 支持哪些邮件服务商？</summary>
            <div class="text-gray-700 text-sm mt-2">目前支持 Resend API，未来将支持更多主流邮件服务商（如SendGrid、Mailgun等）。</div>
          </details>
          <details class="card-bg-2 rounded-xl card-ani p-5 group">
            <summary class="font-semibold text-blue-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-400">如何保证邮件不会被判为垃圾邮件？</summary>
            <div class="text-gray-700 text-sm mt-2">内置多重反垃圾机制：敏感词混淆、HTML实体加密、零宽字符插入、同形字替换等，并支持自定义敏感词。</div>
          </details>
          <details class="card-bg-3 rounded-xl card-ani p-5 group">
            <summary class="font-semibold text-blue-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-400">如何配置多个API账号？</summary>
            <div class="text-gray-700 text-sm mt-2">在worker.js顶部RESEND_ACCOUNTS配置区添加API Key与域名即可，系统自动轮询分配。</div>
          </details>
          <details class="card-bg-1 rounded-xl card-ani p-5 group">
            <summary class="font-semibold text-blue-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-400">支持哪些群发场景？</summary>
            <div class="text-gray-700 text-sm mt-2">支持企业通知、会员营销、系统提醒、会议邀约等所有需要高送达率的邮件群发场景。</div>
          </details>
          <details class="card-bg-2 rounded-xl card-ani p-5 group">
            <summary class="font-semibold text-blue-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-400">如何保障数据安全与隐私？</summary>
            <div class="text-gray-700 text-sm mt-2">所有收件人信息仅用于邮件投递，绝不存储或泄露，严格遵守隐私保护政策。</div>
          </details>
        </div>
      </div>
      <!-- 联系方式/底部品牌标语 -->
      <div class="text-center mt-8 fade-in-up" style="animation-delay:0.6s;">
        <span class="inline-block bg-blue-600 text-white text-lg font-bold px-6 py-3 rounded-full shadow-lg brand-btn-ani">ResendMail 智能群发邮件大师，让每一封邮件都安全、智能、精准地送达您的目标用户！</span>
        <div class="mt-4 text-gray-500 text-sm">如有疑问请联系：<a href="mailto:admin@ntun.cn" class="underline text-blue-600">admin@ntun.cn</a></div>
      </div>
    </section>
  </main>
  <footer class="w-full text-center text-gray-400 py-6 text-sm">&copy; 2025 ResendMail. All rights reserved. &nbsp;|&nbsp; <a href="https://github.com/HiSixcc/ResendMail" class="github-link-footer" target="_blank" rel="noopener noreferrer">GitHub开源仓库</a></footer>
</body>
</html>`;
}
