# 关于 ResendMail 智能群发邮件系统

> 智能邮件营销，重塑触达新境界

## 目录

- [系统概述](#系统概述)
- [核心功能](#核心功能)
- [使用指南](#使用指南)
- [部署指南](#部署指南)
- [前后端对接](#前后端对接)
- [数据与历史记录](#数据与历史记录)
- [开源代码](#开源代码)
- [免责声明](#免责声明)
- [常见问题](#常见问题)
- [技术支持](#技术支持)

## 系统概述

ResendMail 智能群发邮件是基于 Resend API 构建的专业邮件发送系统，针对垃圾邮件检测进行深度优化，通过智能内容加密和发送策略优化，有效提高邮件送达率。

### 主要特点

- **内容加密**：采用多重加密技术躲避垃圾邮件过滤器，自动调整加密强度，提高邮件送达率。
- **提供商感知**：自动识别不同邮箱服务商特点，针对性优化发送策略，确保最佳送达效果。
- **批量发送**：支持大规模批量发送，内置限流和队列管理，自动优化发送流程，提高效率。
- **模板管理**：内置模板系统，支持变量替换和可视化编辑，方便复用和自定义邮件内容。
- **多账号支持**：支持管理多个Resend API账号，智能轮换使用，有效分散发送压力。
- **Resend集成**：无缝集成Resend API功能，发送记录和数据分析通过Resend后台查看。

## 核心功能

> ResendMail 智能群发邮件提供了完整的邮件优化方案，集成了多种技术来提高邮件送达率和用户体验。

### 智能内容加密

系统采用多项技术对邮件内容进行加密处理，降低被垃圾邮件过滤器拦截风险：

- **零宽字符插入**：插入不可见字符，干扰关键词识别
- **HTML结构混淆**：重组HTML结构，避免模式识别
- **CSS混淆**：通过CSS技术隐藏特定内容
- **敏感内容检测**：自动调整加密强度

### 邮件提供商优化

针对不同邮件服务商，自动调整发送策略：

- 支持Gmail、Outlook、Yahoo等国际邮箱
- 针对QQ邮箱、网易邮箱等国内邮箱优化
- 支持企业邮箱服务

### 批量发送与队列

高效批量发送和队列管理：

- 智能批处理，优化批次大小
- 内置限流机制，控制发送频率
- 智能重试和队列优化
- 多账号负载均衡

### 模板系统

强大的模板管理功能：

- 可视化编辑器，无需HTML知识
- 变量替换支持，实现个性化
- 响应式设计，适应不同设备
- 样式内联，提高兼容性

## 使用指南

> **简单易用**：ResendMail 智能群发邮件设计直观，只需简单几步即可开始使用。

### 快速上手

1. **账号设置**
   - 在"设置"中添加您的Resend API Key
   - 设置发送域名和默认发件人

2. **创建模板**
   - 在"发送邮件"界面选择或创建模板
   - 使用编辑器修改内容，可添加变量如{name}
   - 保存模板供多次使用

3. **发送邮件**
   - 设置邮件主题
   - 添加收件人(手动输入或粘贴)
   - 预览内容并发送

4. **查看结果**
   - 实时查看发送进度
   - 登录Resend官方后台查看详细数据

> **重要说明**：系统不存储发送记录，所有历史数据请通过[Resend官方后台](https://resend.com)查看。

### 高级设置

1. **内容加密**
   - 在"设置"中调整加密强度(1-10)
   - 启用/禁用特定加密技术

2. **发送策略**
   - 设置每批次最大发送数量
   - 调整发送间隔和重试策略

> **建议**：首次使用时，先发送测试邮件到自己邮箱，确认内容显示正常后再大规模发送。

## 部署指南

> ResendMail智能群发邮件采用前后端分离架构：**前端**可部署在任何静态托管平台，**后端**只能部署在Cloudflare Workers。

### 前端部署步骤

1. **准备文件**
   - 克隆项目并安装依赖
   - 配置Worker URL
   - 构建静态文件

2. **选择托管平台**
   - 对象存储：OSS、S3、COS等
   - 静态托管：GitHub Pages、Netlify、Vercel等
   - 传统主机：Nginx、Apache等

3. **上传配置**
   - 上传dist目录中的文件
   - 配置域名和HTTPS(推荐)

### Worker部署步骤

> **快速部署提示**：Worker.js的部署非常简单，只需复制代码并粘贴到Cloudflare控制面板中。

#### 简易方法

1. **登录Cloudflare控制面板**
   - 访问[Cloudflare控制面板](https://dash.cloudflare.com)并使用您的账号登录。

2. **创建新Worker**
   - 点击"Workers & Pages"菜单，然后选择"创建应用程序" → "创建Worker"。

3. **粘贴代码**
   - 将`worker.js`文件中的全部代码复制，然后粘贴到Cloudflare编辑器中。

4. **部署并记录地址**
   - 点击"部署"按钮，然后记下生成的Workers URL（例如`https://your-worker.username.workers.dev`）。
   - 此地址将在前端配置中使用。

#### 高级方法

1. **安装Wrangler工具**
   ```
   npm install -g wrangler
   ```

2. **登录Cloudflare账号**
   ```
   wrangler login
   ```

3. **创建配置文件**
   在项目根目录创建`wrangler.toml`文件：
   ```
   name = "resendmail-worker"
   type = "javascript"
   account_id = "your-account-id"
   workers_dev = true
   compatibility_date = "2023-01-01"
   ```

4. **发布Worker**
   ```
   wrangler publish
   ```
   发布成功后，记下生成的URL地址用于前端配置。

> **重要提示**：后端**必须**部署在Cloudflare Workers上，其他平台不兼容。

## 前后端对接

> 前端与后端的对接主要涉及修改API基础URL，确保前端可以正确调用Cloudflare Worker部署的后端服务。

### 步骤1：修改API基础URL

在`js/emailService.js`文件开头修改`API_BASE_URL`常量：

```javascript
// 邮件服务API基础URL
const API_BASE_URL = 'https://your-worker-url.workers.dev';
```

将URL替换为您的Cloudflare Worker部署地址。这是您**后端服务**的访问地址，而非前端地址。

> **最佳实践：** 建议为您的Worker绑定自定义域名（例如api.yourdomain.com），以提高可靠性和专业性，避免直接使用workers.dev域名。具体操作可在Cloudflare控制面板中完成。

### 步骤2：API请求示例（仅供参考）

**提示：**此步骤仅供了解，无需修改代码

系统已内置API请求代码，您只需完成步骤1即可。下面是请求示例（`js/emailService.js`文件中）：

```javascript
const response = await fetch(`${API_BASE_URL}/api/emails/batch`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiSettings.apiKey}`
    },
    body: JSON.stringify(batchRequest)
});
```

### 步骤3：Worker配置（仅供参考）

**提示：**此步骤仅供了解，Worker端已包含所需配置

Worker端已预配置CORS设置，默认支持各种前端来源。如需自定义限制，可参考以下代码：

```javascript
// 允许的前端源列表
const ALLOWED_ORIGINS = [
  'https://your-frontend-domain.com',
  'http://localhost:3000' // 本地开发
];

// 添加CORS头
function addCorsHeaders(response, request) {
  const origin = request.headers.get('Origin');
  
  // 检查请求源是否在允许列表中
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  return response;
}
```

> **简化说明：** 对于大多数用户，只需完成步骤1（修改API基础URL）即可完成前后端对接，其他步骤仅供深入了解系统原理。

> **重要提示：** 修改API基础URL后，需要重新构建并部署前端项目，变更才能生效。

## 数据与历史记录

> **重要说明**：系统不存储历史发送记录，所有发送数据必须通过[Resend官方后台](https://resend.com)查看。

### Resend后台数据
- 发送历史和送达状态
- 打开率和点击率分析
- 错误报告和原因分析

### 本地存储数据
- API配置和邮件模板
- 系统设置和加密参数

## 开源代码

### GitHub仓库
本项目已在GitHub开源：[https://github.com/HiSixcc/ResendMail](https://github.com/HiSixcc/ResendMail)

当前状态：**5** Stars, **1** Fork

开源许可：MIT License

## 免责声明

> **重要声明**：尽管系统采用了多种内容加密和混淆技术，但无法保证100%避免被邮件服务商的垃圾邮件过滤器拦截或屏蔽。邮件送达率受多种因素影响，包括但不限于：邮件内容、发送历史、收件人互动、发送域名信誉等。

请遵守邮件营销的相关法规和最佳实践，避免发送可能被视为垃圾邮件的内容。系统设计旨在提高合法邮件的送达率，而非规避垃圾邮件检测系统。

## 常见问题

### 系统主要优势是什么？
- **智能内容加密**：提高邮件送达率
- **提供商感知**：针对性优化策略
- **批量发送**：高效队列和节流管理
- **模板系统**：变量替换和个性化

### 系统对部署环境有什么要求？
- **前端**：任何静态托管平台均可
- **后端**：*必须*是Cloudflare Workers
- 需要有效的Resend API Key

### 系统支持查看历史记录吗？
系统本身不存储历史发送记录，这样可以：
- 减少敏感数据存储风险
- 确保数据一致性和准确性

所有发送历史和分析报告请通过[Resend官方后台](https://resend.com)查看。

### 内容加密如何提高送达率？
系统采用多种技术避开垃圾邮件过滤：
- 零宽字符插入干扰关键词匹配
- HTML结构和CSS混淆避免模式识别
- 链接URL混淆避免直接拦截

### 如何添加收件人列表？
当前系统提供以下添加收件人的方式：
- **手动输入**：在收件人文本框中直接输入邮箱地址
- **批量粘贴**：支持粘贴多种格式的邮箱列表（逗号、分号、空格或换行分隔）

**注意**：当前版本暂不支持通过上传CSV或Excel文件导入收件人，此功能将在后续版本中添加。

### 如何避免超出API限制？
- 系统自动节流控制发送速度
- 大批量任务分解为小批次处理
- 支持多账号轮换和负载均衡

## 技术支持

### 邮件支持
[admin@ntun.cn](mailto:admin@ntun.cn)

### 问题反馈
[GitHub Issues](https://github.com/HiSixcc/ResendMail/issues) 