/*
============================================================
ResendMail 智能批量邮件服务主程序
ResendMail Bulk Email Service (Cloudflare Worker Edition)

Copyright (C) 2025 hisix & ResendMail
Author: 六 开发团队
项目主页: https://email.ohi.cc
联系方式: admin@ntun.cn

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
============================================================
*/

// =============================================
// ResendMail 智能批量邮件服务主程序
// ResendMail Bulk Email Service (Multi-Account, Anti-Spam, Cloudflare Worker Compatible)
//
// 功能概述：
// - 支持Resend多账号自动轮询与配额突破
// - 邮件内容智能反垃圾混淆（敏感词、零宽字符、同形字等）
// - 官网与发件功能分离，兼容Cloudflare Worker无文件系统环境
// - 支持批量群发、自动去重、状态反馈、API重试
//
// Usage: Cloudflare Worker部署，根路径/为官网，/token为发件入口
// =============================================

// === 多账号API密钥与域名配置区 ===
// Resend API账号池，支持自动轮询与配额突破
const RESEND_ACCOUNTS = [
  { apiKey: 're_3keTVn1E_MZTwQC8cNkQYUQB5zYGuSDFU', domain: 'mail.ohi.cc' },
  { apiKey: 're_5LMeGvDe_E5kL3ZAfrhMAxV73LjBeQQS5', domain: 'mail.hisix.cc' },
  { apiKey: 're_8AbMuFAa_P1nUr4JR7zemRyWGb9zby4TH', domain: 'mail.txla.cn' },
  // { apiKey: 're_xxx', domain: 'yourdomain.com' },
  // 可继续添加更多账号
];

// === API状态管理对象 ===
// 跟踪每个API账号的可用状态（可用/配额超限/未知），用于动态切换
const API_STATUS = RESEND_ACCOUNTS.map(() => ({ status: 'available', lastError: null, lastChecked: Date.now() }));
// status: 'available' | 'quota_exceeded' | 'unknown'

// === 敏感词与反垃圾配置 ===
// 邮件内容如包含这些词，将自动混淆，降低被判为垃圾邮件概率
const DEFAULT_SENSITIVE_WORDS = [
  '广告', '优惠', '赚钱', '免费', '推广', '点击', '注册', '活动', '红包', '返利', '代理', '投资', '博彩', '彩票', '贷款', '理财', '色情', '裸聊', '赌博', '发票', '代开', '兼职', '微信', 'QQ', '公众号', '链接'
// ...可继续扩展
];

// === 同形/同音字映射表 ===
// 用于敏感词混淆，提升反垃圾能力
const HOMOGLYPHS = {
  '赚': ['賺'], '钱': ['錢'], '广': ['廣'], '告': ['吿'], '优': ['優'], '惠': ['惠'],
  '推': ['推'], '荐': ['薦'], '活': ['活'], '动': ['動'], '免': ['免'], '费': ['費'],
  // ...可继续扩展
};

// === 访问安全认证配置 ===
// 只有访问 /token 且token一致才可访问发件页面
const ACCESS_TOKEN = 'hisix'; // 可自定义为任意字符串

// === Cloudflare Worker 入口 ===
// 全局HTTP请求处理，路由分发官网/发件/接口/404
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// === 官网首页HTML常量 ===
// 彻底移除fs依赖，100%兼容Cloudflare Worker
const HOMEPAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResendMail 智能群发邮件大师</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <meta name="description" content="ResendMail 智能群发邮件大师 - 基于Resend API的高效智能邮件群发平台，支持多账号突破、反垃圾混淆、个性化称呼、批量群发等功能。">
</head>
<body class="bg-gradient-to-br from-blue-50 to-blue-100 min-h-screen font-sans">
  <!-- 顶部品牌大卡片 -->
  <div class="w-full bg-gradient-to-r from-blue-600 to-blue-400 py-12 mb-8 shadow-lg">
    <div class="max-w-3xl mx-auto flex flex-col items-center">
      <div class="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 shadow-lg">
        <svg width="56" height="56" fill="none" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#2563eb"/><path d="M8 12l8 8 8-8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h1 class="text-4xl font-extrabold tracking-wide text-white mb-2 drop-shadow">ResendMail 智能群发邮件大师</h1>
      <div class="text-lg text-blue-100 font-medium mb-2">让每一封邮件都安全、智能、精准地送达您的目标用户！</div>
    </div>
  </div>
  <main class="max-w-5xl mx-auto px-4">
    <!-- 产品简介卡片 -->
    <div class="bg-white/90 rounded-2xl shadow-xl p-8 mb-10 flex flex-col items-center">
      <h2 class="text-2xl font-bold text-blue-600 mb-2">产品简介</h2>
      <p class="text-gray-700 text-center max-w-2xl">ResendMail 智能群发邮件大师是一款基于 Resend API 打造的高效、智能、安全的邮件群发平台。专为企业、开发者和运营团队设计，助力大批量邮件精准送达，突破单账号配额限制，显著提升营销与通知效率。</p>
    </div>
    <!-- 核心功能卡片网格 -->
    <section class="mb-12">
      <h2 class="text-xl font-bold text-blue-600 mb-6">核心功能</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M4 4h16v2H4z" fill="#2563eb"/><rect x="4" y="8" width="16" height="12" rx="2" fill="#2563eb"/></svg></div>
          <div class="font-bold text-lg mb-1">多账号配额突破</div>
          <div class="text-gray-700 text-sm">支持配置多个 Resend API 账号，自动轮询切换，智能分配邮件任务，突破单账号每日/每月发送上限。实时监控账号配额与状态，自动跳过超限账号，保障邮件持续高效投递。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">智能反垃圾混淆</div>
          <div class="text-gray-700 text-sm">内置敏感词库，自动检测并对广告、推广等高风险词汇进行多策略混淆（零宽字符、同形字、符号分隔等）。支持自定义敏感词，灵活应对不同业务场景。邮件正文支持 HTML 实体加密，进一步降低被判为垃圾邮件的概率。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#2563eb" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">个性化智能称呼</div>
          <div class="text-gray-700 text-sm">每封邮件自动识别收件人邮箱，采用多种自然称呼格式，并高亮显示收件人，提升用户体验与邮件打开率。批量群发时，每一封邮件称呼均为独立随机，避免机械感。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" stroke="#2563eb" stroke-width="2"/><path d="M8 12h8" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">批量群发与自动去重</div>
          <div class="text-gray-700 text-sm">支持批量导入多个收件人，自动去重、格式化，防止重复发送。邮件任务分批并发处理，提升发送效率，降低单次失败风险。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">灵活API切换与重试</div>
          <div class="text-gray-700 text-sm">发送失败时自动重试，支持灵活切换可用 API 账号，最大化送达率。详细错误反馈与状态追踪，便于问题定位与优化。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#2563eb" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">发送状态与结果反馈</div>
          <div class="text-gray-700 text-sm">前端实时显示发送进度、成功/失败统计、详细结果列表。支持失败原因展示，便于后续补发与数据分析。</div>
        </div>
      </div>
    </section>
    <!-- 技术亮点卡片网格 -->
    <section class="mb-12">
      <h2 class="text-xl font-bold text-blue-600 mb-6">技术亮点</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">Resend API深度集成</div>
          <div class="text-gray-700 text-sm">多账号自动切换，突破平台配额瓶颈。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">多重反垃圾机制</div>
          <div class="text-gray-700 text-sm">敏感词混淆、HTML实体加密、零宽字符插入、同形字替换等多策略并用。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">高兼容性模板</div>
          <div class="text-gray-700 text-sm">邮件模板兼容主流邮箱客户端（QQ邮箱、Outlook、Gmail等），视觉美观，结构清晰。</div>
        </div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
          <div class="bg-blue-100 p-2 rounded-full mb-3"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" stroke="#2563eb" stroke-width="2"/></svg></div>
          <div class="font-bold text-lg mb-1">响应式UI与交互</div>
          <div class="text-gray-700 text-sm">前端采用卡片化、圆角、渐变等现代设计，移动端体验优秀。</div>
        </div>
      </div>
    </section>
    <!-- 适用场景卡片分组 -->
    <section class="mb-12">
      <h2 class="text-xl font-bold text-blue-600 mb-6">适用场景</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition"><div class="font-bold text-lg mb-1">企业/组织通知</div><div class="text-gray-700 text-sm">大批量通知、公告、节日问候等场景，保障高送达率。</div></div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition"><div class="font-bold text-lg mb-1">会员营销推广</div><div class="text-gray-700 text-sm">会员营销、活动推广、优惠券发放，精准触达目标用户。</div></div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition"><div class="font-bold text-lg mb-1">系统自动提醒</div><div class="text-gray-700 text-sm">注册激活、密码找回、系统自动提醒等自动化场景。</div></div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition"><div class="font-bold text-lg mb-1">会议/活动邀约</div><div class="text-gray-700 text-sm">批量邀请函、活动通知，提升组织效率。</div></div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition"><div class="font-bold text-lg mb-1">高送达率需求</div><div class="text-gray-700 text-sm">任何需要高送达率、低垃圾判定的邮件群发场景。</div></div>
        <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition"><div class="font-bold text-lg mb-1">品牌宣传/新品发布</div><div class="text-gray-700 text-sm">批量推送品牌资讯、新品上市、市场活动等，提升品牌影响力。</div></div>
      </div>
    </section>
    <!-- 安全与合规、未来可扩展性卡片分组 -->
    <section class="mb-12 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition mb-6 md:mb-0">
        <h3 class="text-lg font-bold text-blue-600 mb-2">安全与合规</h3>
        <ul class="list-disc list-inside text-gray-700 text-sm space-y-1">
          <li>邮件内容加密与混淆，降低被拦截风险</li>
          <li>支持敏感词自定义，灵活应对政策变化</li>
          <li>严格隐私保护，收件人信息仅用于投递</li>
        </ul>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 flex flex-col items-start hover:shadow-2xl transition">
        <h3 class="text-lg font-bold text-blue-600 mb-2">未来可扩展性</h3>
        <ul class="list-disc list-inside text-gray-700 text-sm space-y-1">
          <li>支持更多邮件服务商API接入</li>
          <li>可扩展第三方CRM、营销平台集成</li>
          <li>支持定制化模板、数据报表、自动化触发等高级功能</li>
        </ul>
      </div>
    </section>
    <div class="text-center mt-8">
      <span class="inline-block bg-blue-600 text-white text-lg font-bold px-6 py-3 rounded-full shadow-lg">ResendMail 智能群发邮件大师，让每一封邮件都安全、智能、精准地送达您的目标用户！</span>
    </div>
  </main>
  <footer class="w-full text-center text-gray-400 py-6 text-sm">&copy; 2024 ResendMail. All rights reserved.</footer>
</body>
</html>`;

/**
 * handleRequest - 全局请求处理器
 * @param {Request} request - HTTP请求对象
 * @returns {Promise<Response>} - HTTP响应
 *
 * - GET /         : 返回官网首页
 * - GET /token    : 返回发件页面
 * - POST /api/send: 批量发件API
 * - 其他           : 404
 */
async function handleRequest(request) {
  const { pathname } = new URL(request.url);
  // 官网首页
  if (request.method === 'GET' && pathname === '/') {
    return new Response(HOMEPAGE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  // 发件页面
  const tokenMatch = pathname.match(/^\/(\w+)$/);
  if (request.method === 'GET' && tokenMatch && tokenMatch[1] === ACCESS_TOKEN) {
    return new Response(getHtml(tokenMatch[1]), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  // 批量发件API
  if (request.method === 'POST' && pathname === '/api/send') {
    return await handleSendApi(request);
  }
  // 404
  return new Response('Not found', { status: 404 });
}

/**
 * getHtml - 生成发件页面HTML
 * @param {string} token - 访问token
 * @returns {string} - HTML字符串
 */
function getHtml(token) {
  return '<!DOCTYPE html>'
    + '<html lang=\"zh-CN\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>ResendMail 智能群发邮件</title>\n  <link href=\"https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css\" rel=\"stylesheet\">\n</head>\n<body class="bg-gray-50 min-h-screen">'
    + '  <div class="w-full max-w-lg bg-gradient-to-br from-blue-50 to-blue-100 p-8 rounded-2xl shadow-xl mx-auto my-8">'
    + '    <div class="flex flex-col items-center mb-4">'
    + '      <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2 shadow-md">'
    + '        <svg width="32" height="32" fill="none" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#2563eb"/><path d="M8 12l8 8 8-8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    + '      </div>'
    + '      <h1 class="text-3xl font-extrabold tracking-wide text-blue-600 mb-2">ResendMail 智能群发邮件</h1>'
    + '    </div>'
    + '    <form id="mailForm" class="space-y-4 font-sans">'
    + '      <div class="border-b border-gray-200 pb-4 mb-4">'
    + '        <label class="block text-gray-700">发件人名称</label>'
    + '        <input type="text" id="senderName" name="senderName" class="mt-1 w-full border rounded px-3 py-2" placeholder="如：小明/公司名" />'
    + '        <div class="text-xs text-gray-400 mt-1">（可选项，留空则自动使用默认名称）</div>'
    + '      </div>'
    + '      <div id="mailsArea"></div>'
    + '      <button type="button" id="addMailBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold mr-2 hover:bg-blue-700 transition duration-150">添加邮件项</button>'
    + '      <button type="button" id="sendBatchBtn" class="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-600 transition duration-150">批量发送</button>'
    + '    </form>'
    + '    <div id="result" class="mt-6"></div>'
    + '  </div>'
    + '  <script>'
    + 'window.mailIdx = 0;'
    + 'window.createMailItem = function(idx) {'
    + '  return "<div class=\\"border p-4 rounded mb-4 bg-gray-50\\" data-idx=\\"" + idx + "\\">"'
    + '    + "<div class=\\"flex justify-between items-center mb-2\\">"'
    + '    + "<span class=\\"font-semibold\\">邮件项 #" + (idx+1) + "</span>"'
    + '    + "<button type=\\"button\\" onclick=\\"removeMailItem(" + idx + ")\\" class=\\"bg-red-50 text-red-500 rounded px-2 py-1 ml-2 hover:bg-red-100 transition duration-150\\">移除</button>"'
    + '    + "</div>"'
    + '    + "<div class=\\"mb-2\\">"'
    + '    + "<label class=\\"block text-gray-700\\">收件人（可粘贴多行、逗号、分号、空格分隔）</label>"'
    + '    + "<input type=\\"text\\" name=\\"to_" + idx + "\\" required class=\\"mt-1 w-full border rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition duration-150\\" placeholder=\\"foo@example.com,bar@example.com\\" />"'
    + '    + "</div>"'
    + '    + "<div class=\\"mb-2\\">"'
    + '    + "<label class=\\"block text-gray-700\\">主题</label>"'
    + '    + "<input type=\\"text\\" name=\\"subject_" + idx + "\\" required class=\\"mt-1 w-full border rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition duration-150\\" placeholder=\\"邮件主题\\" />"'
    + '    + "</div>"'
    + '    + "<div>"'
    + '    + "<label class=\\"block text-gray-700\\">HTML 内容</label>"'
    + '    + "<textarea name=\\"html_" + idx + "\\" required class=\\"mt-1 w-full border rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition duration-150\\" rows=\\"4\\" placeholder=\\"<h1>内容</h1>\\"></textarea>"'
    + '    + "</div>"'
    + '    + "</div>";'
    + '};'
    + 'window.addMailItem = function() {'
    + '  var area = document.getElementById("mailsArea");'
    + '  area.insertAdjacentHTML("beforeend", window.createMailItem(window.mailIdx));'
    + '  window.mailIdx++;'
    + '};'
    + 'window.removeMailItem = function(idx) {'
    + '  var area = document.getElementById("mailsArea");'
    + '  var item = area.querySelector("[data-idx=\\"" + idx + "\\"]");'
    + '  if (item) item.remove();'
    + '};'
    + 'window.addEventListener("DOMContentLoaded", function() {'
    + '  document.getElementById("addMailBtn").onclick = window.addMailItem;'
    + '  if (window.mailIdx === 0) window.addMailItem();'
    + '});'
    + 'document.getElementById("mailForm").onsubmit = async function(e) {'
    + '  e.preventDefault();'
    + '  var form = e.target;'
    + '  var senderName = form["senderName"].value.trim();'
    + '  var mails = [];' 
    + '  for (var i = 0; i < window.mailIdx; i++) {'
    + '    var to = form["to_" + i];'
    + '    var subject = form["subject_" + i];'
    + '    var html = form["html_" + i];'
    + '    if (to && subject && html) {'
    + '      mails.push({'
    + '        to: to.value.split(/[\s,;]+/).map(function(s){return s.trim();}).filter(Boolean),'
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
    + '};'
    + 'window.__TOKEN__ = ' + JSON.stringify(token || "") + ';'
    + 'console.log("Token:", window.__TOKEN__);'
    + 'if(typeof window.addMailItem==="function"&&window.mailIdx===0)window.addMailItem();'
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

// === 可用账号自动分配函数 ===
function pickAvailableAccount() {
  for (let i = 0; i < API_STATUS.length; i++) {
    if (API_STATUS[i].status === 'available') {
      return { ...RESEND_ACCOUNTS[i], idx: i };
    }
  }
  // 若无可用账号，默认返回第一个
  return { ...RESEND_ACCOUNTS[0], idx: 0 };
}

// === 邮件内容模板渲染 ===
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
                  <a href="https://zx.ntun.cn" target="_blank">微信</a>
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
 * - 支持多账号自动切换与配额突破
 * - 支持敏感词混淆
 * - 支持单账号/多账号/参数指定账号
 * - Cloudflare Workers兼容性：定时逻辑采用惰性检查
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
