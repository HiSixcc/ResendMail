# ResendMail 智能群发邮件大师（Cloudflare Worker 免费版）

## 产品简介

ResendMail 智能群发邮件大师是一款基于 Resend API 打造的高效、智能、安全的邮件群发平台。支持多账号突破配额、反垃圾混淆、个性化称呼、批量群发、失败重试等功能，专为企业、开发者和运营团队设计，助力大批量邮件精准送达，显著提升营销与通知效率。  
本项目100%兼容 Cloudflare Worker 云端环境，官网与发件功能分离，前端UI美观现代，移动端体验优秀。

---

## 主要特性

- **多账号配额突破**：支持配置多个 Resend API 账号，自动轮询切换，智能分配邮件任务，突破单账号每日/每月发送上限。
- **智能反垃圾混淆**：内置敏感词库，自动检测并对高风险词汇进行多策略混淆（零宽字符、同形字、符号分隔等），支持自定义敏感词。
- **个性化智能称呼**：每封邮件自动识别收件人邮箱，采用多种自然称呼格式并高亮显示收件人，提升用户体验与打开率。
- **批量群发与自动去重**：支持批量导入多个收件人，自动去重、格式化，防止重复发送，分批并发处理，提升效率。
- **灵活API切换与重试**：发送失败时自动重试，支持灵活切换可用 API 账号，最大化送达率。
- **发送状态与结果反馈**：前端实时显示发送进度、成功/失败统计、详细结果列表，支持失败原因展示。
- **响应式UI与交互**：前端采用卡片化、圆角、渐变等现代设计，移动端体验优秀。
- **安全与合规**：邮件内容加密与混淆，严格隐私保护，收件人信息仅用于投递。
- **开箱即用**：无需依赖外部存储，所有内容内嵌，Cloudflare Worker一键部署。

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/HiSixcc/ResendMail.git
cd ResendMail
```

### 2. 配置 Resend API 账号

编辑 `worker.js` 顶部的 `RESEND_ACCOUNTS` 数组，添加你的 Resend API Key 与绑定域名：

```js
const RESEND_ACCOUNTS = [
  { apiKey: 're_xxx', domain: 'yourdomain.com' },
  // 可添加多个账号
];
```

### 3. 配置可访问Token（可选）

编辑 `ALLOWED_TOKENS` 数组，设置允许访问发件页面的token：

```js
const ALLOWED_TOKENS = ['auto', 'test', 'yourtoken'];
```

### 4. 部署到 Cloudflare Worker

- 登录 Cloudflare，创建新的 Worker 服务。
- 复制 `worker.js` 全部内容粘贴到 Worker 编辑器，保存并部署。
- 访问 `https://your-worker-url/` 查看官网首页，访问 `https://your-worker-url/yourtoken` 进入发件页面。

---

## 目录结构

```
worker.js         # Cloudflare Worker 主程序（官网+发件+API）
README.md         # 项目说明文档
```

---

## API 说明

### 批量发件接口

- **POST** `/api/send`
- **请求体**（JSON）：

```json
{
  "senderName": "发件人名称",
  "mails": [
    {
      "to": ["foo@example.com", "bar@example.com"],
      "subject": "主题",
      "html": "<h1>内容</h1>"
    }
  ]
}
```

- **返回体**（JSON）：

```json
{
  "success": true,
  "result": [ ... ],
  "deduped": true,
  "duplicateCount": 0,
  "uniqueCount": 2,
  "totalInput": 2
}
```

---

## 前端使用说明

- 访问 `/yourtoken` 进入发件页面，支持批量添加邮件项、粘贴多收件人、实时进度与结果反馈。
- 支持移动端自适应，所有操作均为前端直连API，无需后端存储。
- 官网首页 `/` 展示品牌介绍、功能、技术亮点、场景、LOGO墙、FAQ等，支持SEO与结构化数据。

---

## 常见问题 FAQ

- **Q: 支持哪些邮件服务商？**  
  A: 目前支持 Resend API，未来将支持更多主流邮件服务商（如SendGrid、Mailgun等）。

- **Q: 如何保证邮件不会被判为垃圾邮件？**  
  A: 内置多重反垃圾机制，支持敏感词混淆、HTML实体加密、零宽字符插入、同形字替换等，并支持自定义敏感词。

- **Q: 如何配置多个API账号？**  
  A: 在 `RESEND_ACCOUNTS` 配置区添加API Key与域名即可，系统自动轮询分配。

- **Q: 支持哪些群发场景？**  
  A: 支持企业通知、会员营销、系统提醒、会议邀约等所有需要高送达率的邮件群发场景。

- **Q: 如何保障数据安全与隐私？**  
  A: 所有收件人信息仅用于邮件投递，绝不存储或泄露，严格遵守隐私保护政策。

---

## 贡献与反馈

欢迎提交 Issue、PR 或建议！如需定制化开发、企业部署、品牌定制等服务，请联系：  
**邮箱**：admin@ntun.cn

---

## 许可证

本项目采用 MIT License 开源，欢迎自由使用与二次开发。

---

**ResendMail 智能群发邮件大师**，让每一封邮件都安全、智能、精准地送达您的目标用户！