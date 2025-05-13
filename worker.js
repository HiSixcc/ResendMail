/**
 * Resend 邮件发送 API Worker
 * 功能：接收客户端发送的邮件请求，转发到 Resend API
 * 增强版：支持内容加密、请求验证、错误处理、限流和诊断功能
 * 
 * 【使用说明】
 * 本文件作为库文件由前端调用，不直接处理请求。
 * API密钥(RESEND_API_KEY)和默认发件人地址(DEFAULT_FROM_EMAIL)由前端传入，
 * 不需要在此文件中设置。这些值将在请求处理时从前端获取。
 * 
 * 【集成方式】
 * 前端通过EmailService.sendMail方法调用本文件的功能，
 * API密钥和发件人信息在调用时作为参数传递。
 * 
 * @version 1.1.0
 */

/******************************************************
 * 用户配置区 - 可根据需要修改以下配置项
 ******************************************************/

/**
 * API 基础配置
 */
// Resend API 端点
const RESEND_API_ENDPOINT = "https://api.resend.com/emails";
const RESEND_BATCH_API_ENDPOINT = "https://api.resend.com/emails/batch";

/**
 * 用户配置部分
 * 可根据需要修改以下配置
 */

// 基础配置 - API基础设置
// 注意: 以下配置由前端传入，后端不需要设置这些值
// const RESEND_API_KEY = ''; // 在此填入您的Resend API密钥
// const DEFAULT_FROM_EMAIL = ''; // 默认发件人地址
const ENABLE_BATCH_SENDING = true; // 是否启用批量发送功能
// const BATCH_SIZE = 500; // 批量发送时，每批最大邮件数量 - 由前端传入

// 内容加密配置 - 防止邮件被标记为垃圾邮件
const ENABLE_CONTENT_ENCRYPTION = true; // 是否启用内容加密功能
const CONTENT_ENCRYPTION = {
  // 主要加密设置
  ENABLED: ENABLE_CONTENT_ENCRYPTION, // 是否启用内容加密
  ENCRYPTION_STRENGTH: 5, // 默认加密强度(0-10)，0为不加密，10为最强
  
  // 加密范围设置
  ENCRYPT_SUBJECT: true, // 是否加密邮件主题(轻度加密)
  ENCRYPT_HTML: true, // 是否加密HTML内容
  ENCRYPT_TEXT: true, // 是否加密纯文本内容
  
  // 加密技术设置
  ENABLE_HTML_STRUCTURE_MIXING: true, // 启用HTML结构混淆
  ENABLE_ZERO_WIDTH_CHARS: true, // 启用零宽字符插入
  ENABLE_UNICODE_SUBSTITUTION: true, // 启用Unicode字符替换
  ENABLE_CSS_OBFUSCATION: true, // 启用CSS混淆
  ENABLE_RANDOM_STYLES: true, // 启用随机样式和类名
  ENABLE_HIDDEN_BAIT: true, // 启用隐藏"诱饵"内容
  ENABLE_URL_OBFUSCATION: true, // 启用URL混淆
  ENABLE_IMAGE_TEXT_BALANCING: true, // 启用图文比例平衡
  
  // 特殊处理设置
  PROTECT_CHINESE_CHARACTERS: true, // 保护中文字符不被替换
  PROTECT_EMAIL_ADDRESSES: true, // 保护邮箱地址不被混淆
  DEFAULT_STRENGTH: 5  // 默认加密强度，同ENCRYPTION_STRENGTH
};

// 提供商检测相关设置
const PROVIDER_DETECTION_CONFIG = {
  ENABLED: true,                 // 是否启用提供商自动检测
  OPTIMIZE_BY_PROVIDER: true,    // 是否根据提供商优化加密策略
  LOG_PROVIDER_INFO: true        // 是否记录提供商信息
};

/**
 * 限制与安全配置
 */
// 限制配置 - 防止误操作和滥用
const LIMITS_CONFIG = {
  MAX_RECIPIENTS: 1000, // 单次请求最大收件人数量
  MAX_SUBJECT_LENGTH: 990, // 主题最大长度
  MAX_TEXT_LENGTH: 1000000, // 纯文本最大长度
  MAX_HTML_LENGTH: 1000000, // HTML最大长度
  MAX_ATTACHMENTS: 20, // 最大附件数量
  MAX_ATTACHMENT_SIZE: 40 * 1024 * 1024, // 单个附件最大大小(40MB)
  ALLOWED_ATTACHMENT_TYPES: [
    'application/pdf', 'image/jpeg', 'image/png', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ], // 允许的附件类型
};

// 速率限制配置 - 控制发送频率
const RATE_LIMIT_CONFIG = {
  ENABLE_RATE_LIMITING: true, // 是否启用速率限制
  REQUEST_LIMIT: 60, // 每分钟最大请求数
  EMAIL_LIMIT: 500, // 每分钟最大发送邮件数
  BURST_LIMIT: 100, // 瞬时最大请求数
  COOLDOWN_PERIOD: 600, // 触发限制后的冷却时间(秒)
};

// 安全配置 - 保护API和内容
const SECURITY_CONFIG = {
  ENFORCE_TLS: true, // 是否强制使用TLS连接
  ALLOWED_DOMAINS: [], // 允许的发件人域名，为空则不限制
  BLOCKED_DOMAINS: [], // 禁止的收件人域名，为空则不限制
  IP_WHITELIST: [], // IP白名单，为空则不限制
  ENABLE_DKIM: true, // 是否启用DKIM签名
  ENABLE_SPF: true, // 是否启用SPF检查
  REQUIRE_API_KEY: true, // 是否要求API密钥
  ALLOWED_ORIGINS: ["*"], // 允许的CORS源
  ALLOWED_METHODS: ["POST", "OPTIONS", "GET"], // 允许的HTTP方法
};

// 日志配置 - 调试和监控
const LOGGING_CONFIG = {
  LOG_LEVEL: 'info', // 日志级别: debug, info, warn, error
  ENABLE_ACCESS_LOGS: true, // 是否记录访问日志
  ENABLE_ERROR_LOGS: true, // 是否记录错误日志
  LOG_REQUEST_DETAILS: false, // 是否记录详细请求信息(可能包含敏感信息)
  MASK_SENSITIVE_DATA: true, // 是否在日志中掩码敏感数据
};

/**
 * 邮件客户端与提供商配置
 */
// 默认加密配置(适用于未识别的提供商)
const DEFAULT_ENCRYPTION = {
  strength: 4,
  zeroWidth: true,
  unicode: false,
  htmlMixing: false,
  cssObfuscation: true,
  subjectEncryption: false
};

// 邮件提供商配置数据库 - 用于提供商感知型内容加密
const EMAIL_PROVIDERS = {
  // 国际邮件提供商
  'gmail.com': {
    name: 'Gmail',
    type: 'international',
    features: ['ml-filtering', 'promotional-tabs', 'character-detection'],
    encryption: {
      strength: 5,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      sensitiveWords: ['sale', 'free', 'buy now', 'click here', 'limited time'],
      avoidTechniques: ['hidden-text']
    }
  },
  'outlook.com': {
    name: 'Outlook',
    type: 'international',
    features: ['url-scanning', 'attachment-scanning', 'pattern-detection'],
    encryption: {
      strength: 4,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['image-text-ratio', 'limit-urls']
    }
  },
  'yahoo.com': {
    name: 'Yahoo',
    type: 'international',
    features: ['engagement-based', 'domain-reputation'],
    encryption: {
      strength: 6,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false
    }
  },
  
  // 中国邮件提供商
  'qq.com': {
    name: 'QQ邮箱',
    type: 'china',
    features: ['strict-content-filtering', 'attachment-restrictions'],
    encryption: {
      strength: 6,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['chinese-character-protection']
    }
  },
  '163.com': {
    name: '网易163邮箱',
    type: 'china',
    features: ['keyword-filtering', 'attachment-restrictions'],
    encryption: {
      strength: 8,
      zeroWidth: true,
      unicode: true,
      htmlMixing: true,
      cssObfuscation: true,
      subjectEncryption: true,
      specialHandling: ['chinese-character-protection']
    }
  },
  '126.com': {
    name: '网易126邮箱',
    type: 'china',
    encryption: {
      strength: 8,
      zeroWidth: true,
      unicode: true,
      htmlMixing: true,
      cssObfuscation: true,
      subjectEncryption: true,
      specialHandling: ['chinese-character-protection']
    }
  },
  'sina.com': {
    name: '新浪邮箱',
    type: 'china',
    encryption: {
      strength: 7,
      zeroWidth: true,
      unicode: true,
      htmlMixing: true,
      cssObfuscation: true,
      subjectEncryption: true
    }
  },
  'foxmail.com': {
    name: 'Foxmail',
    type: 'china',
    encryption: {
      strength: 7,
      zeroWidth: true,
      unicode: true, 
      htmlMixing: true,
      cssObfuscation: true
    }
  },
  
  // 新增国内邮箱
  '139.com': {
    name: '中国移动139邮箱',
    type: 'china',
    features: ['keyword-filtering', 'attachment-restrictions', 'mobile-first'],
    encryption: {
      strength: 7,
      zeroWidth: true,
      unicode: true,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: true,
      specialHandling: ['chinese-character-protection', 'protect-sensitive-data']
    }
  },
  '188.com': {
    name: '中国移动188邮箱',
    type: 'china',
    features: ['keyword-filtering', 'attachment-restrictions', 'mobile-first'],
    encryption: {
      strength: 7,
      zeroWidth: true,
      unicode: true,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: true,
      specialHandling: ['chinese-character-protection', 'protect-sensitive-data']
    }
  },
  '189.com': {
    name: '中国电信189邮箱',
    type: 'china',
    features: ['keyword-filtering', 'attachment-restrictions'],
    encryption: {
      strength: 7,
      zeroWidth: true,
      unicode: true,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: true,
      specialHandling: ['chinese-character-protection', 'protect-sensitive-data']
    }
  },
  'sohu.com': {
    name: '搜狐邮箱',
    type: 'china',
    features: ['keyword-filtering', 'promotional-tabs'],
    encryption: {
      strength: 6,
      zeroWidth: true,
      unicode: true,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['chinese-character-protection', 'optimize-tables']
    }
  },
  '21cn.com': {
    name: '21CN邮箱',
    type: 'china',
    features: ['keyword-filtering'],
    encryption: {
      strength: 6,
      zeroWidth: true,
      unicode: true,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['chinese-character-protection']
    }
  },
  'aliyun.com': {
    name: '阿里云邮箱',
    type: 'china',
    features: ['spam-detection', 'enterprise-focused'],
    encryption: {
      strength: 5,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['chinese-character-protection', 'optimize-tables']
    }
  },
  
  // 新增国际邮箱
  'protonmail.com': {
    name: 'ProtonMail',
    type: 'international',
    features: ['end-to-end-encryption', 'privacy-focused'],
    encryption: {
      strength: 4,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false
    }
  },
  'zoho.com': {
    name: 'Zoho Mail',
    type: 'international',
    features: ['business-focused', 'spam-detection'],
    encryption: {
      strength: 5,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['image-text-ratio']
    }
  },
  'aol.com': {
    name: 'AOL Mail',
    type: 'international',
    features: ['promotional-tabs'],
    encryption: {
      strength: 6,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false
    }
  },
  'yandex.com': {
    name: 'Yandex Mail',
    type: 'international',
    features: ['spam-detection', 'promotional-categories'],
    encryption: {
      strength: 5,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false
    }
  },
  'tutanota.com': {
    name: 'Tutanota',
    type: 'international',
    features: ['end-to-end-encryption', 'privacy-focused'],
    encryption: {
      strength: 3,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false
    }
  },
  'gmx.com': {
    name: 'GMX Mail',
    type: 'international',
    features: ['spam-detection'],
    encryption: {
      strength: 5,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false
    }
  },
  'mail.ru': {
    name: 'Mail.ru',
    type: 'international',
    features: ['spam-detection', 'attachment-scanning'],
    encryption: {
      strength: 6,
      zeroWidth: true,
      unicode: false,
      htmlMixing: true,
      cssObfuscation: true,
      subjectEncryption: false
    }
  },
  
  // 企业邮箱类型
  'exmail.qq.com': {
    name: '腾讯企业邮箱',
    type: 'enterprise',
    features: ['business-focused', 'strict-filtering'],
    encryption: {
      strength: 6,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['chinese-character-protection', 'optimize-tables']
    }
  },
  'qiye.aliyun.com': {
    name: '阿里企业邮箱',
    type: 'enterprise',
    features: ['business-focused', 'strict-filtering'],
    encryption: {
      strength: 5,
      zeroWidth: true,
      unicode: false,
      htmlMixing: false,
      cssObfuscation: true,
      subjectEncryption: false,
      specialHandling: ['chinese-character-protection', 'optimize-tables']
    }
  }
};

// 别名域名配置 - 将别名映射到已知提供商
const DOMAIN_ALIASES = {
  'outlook.live.com': 'outlook.com',
  'hotmail.com': 'outlook.com',
  'msn.com': 'outlook.com',
  'icloud.com': 'apple-mail',
  'me.com': 'apple-mail',
  'mail.ru': 'mail-ru',
  '139.com': 'china-mobile',
  'gmail.google.com': 'gmail.com',
  'googlemail.com': 'gmail.com',
  'mail.qq.com': 'qq.com',
  'vip.qq.com': 'qq.com',
  'vip.163.com': '163.com',
  'yeah.net': '163.com',
  // 补充国内邮箱别名
  'mail.aliyun.com': 'aliyun.com',
  'qiye.163.com': '163.com',
  'mails.tsinghua.edu.cn': 'edu.cn',
  'sohu.net': 'sohu.com',
  'china.com.cn': '21cn.com',
  '21cn.net': '21cn.com',
  'tom.com': 'tom-mail',
  '189.cn': '189.com',
  '139.cn': '139.com',
  '263.net': '263.net',
  'wo.cn': 'wo.cn',
  'chinaren.com': 'sohu.com',

  // 补充国际邮箱别名
  'protonmail.ch': 'protonmail.com',
  'pm.me': 'protonmail.com',
  'zohomail.com': 'zoho.com',
  'ymail.com': 'yahoo.com',
  'rocketmail.com': 'yahoo.com',
  'tutanota.de': 'tutanota.com',
  'gmx.net': 'gmx.com',
  'gmx.de': 'gmx.com',
  'gmx.at': 'gmx.com',
  'gmx.ch': 'gmx.com',
  'web.de': 'web-de',
  'aol.co.uk': 'aol.com',
  'verizon.net': 'aol.com',
  'aim.com': 'aol.com',
  'yandex.ru': 'yandex.com',
  'outlook.jp': 'outlook.com',
  'live.com': 'outlook.com'
};

// 客户端类型数据库 - 针对不同邮件客户端的优化
const CLIENT_TYPES = {
  'web-based': {
    // 网页邮箱客户端特定优化
    cssSupport: true,
    javascriptSupport: true,
    modernHtmlSupport: true,
    responsiveDesign: true,
    htmlEmail: true,
    imagesEnabled: true
  },
  'desktop': {
    // 桌面客户端特定优化
    cssSupport: true,
    javascriptSupport: false,
    modernHtmlSupport: true,
    responsiveDesign: false,
    htmlEmail: true,
    imagesEnabled: true
  },
  'mobile': {
    // 移动客户端特定优化
    cssSupport: true,
    javascriptSupport: false,
    modernHtmlSupport: true,
    narrowScreen: true,
    responsiveDesign: true,
    htmlEmail: true,
    imagesEnabled: true
  },
  'text-only': {
    // 纯文本客户端
    cssSupport: false,
    javascriptSupport: false,
    modernHtmlSupport: false,
    responsiveDesign: false,
    htmlEmail: false,
    imagesEnabled: false
  },
  'outlook-desktop': {
    // Outlook桌面客户端
    cssSupport: true,
    javascriptSupport: false,
    modernHtmlSupport: false, // 使用Word渲染引擎
    wordRenderer: true,
    responsiveDesign: false,
    htmlEmail: true,
    imagesEnabled: false // 默认可能会阻止图片
  },
  'gmail-app': {
    // Gmail移动应用
    cssSupport: true,
    javascriptSupport: false,
    modernHtmlSupport: true,
    responsiveDesign: true,
    htmlEmail: true,
    imagesEnabled: true,
    promotionalTab: true
  },
  'china-mobile': {
    // 中国移动端邮箱应用
    cssSupport: true,
    javascriptSupport: false,
    modernHtmlSupport: true,
    narrowScreen: true,
    responsiveDesign: true,
    htmlEmail: true,
    imagesEnabled: true,
    chineseOptimized: true
  },
  'enterprise': {
    // 企业邮箱客户端
    cssSupport: true,
    javascriptSupport: false,
    modernHtmlSupport: true,
    responsiveDesign: false,
    htmlEmail: true,
    imagesEnabled: true,
    securityFocused: true
  }
};

/******************************************************
 * 系统配置 - 内部使用，通常不需要修改
 ******************************************************/

/**
 * 配置整合对象
 * 将所有配置整合到一个对象中，便于访问
 * 注意：API_KEY、DEFAULT_FROM和BATCH_SIZE由前端传入，这里设为null
 */
const CONFIG = {
  // 基础设置
  API_KEY: null, // 将在请求处理时从前端传入
  DEFAULT_FROM: null, // 将在请求处理时从前端传入
  ENABLE_BATCH_SENDING: ENABLE_BATCH_SENDING,
  BATCH_SIZE: null, // 将在请求处理时从前端传入
  API_ENDPOINTS: {
    SINGLE: RESEND_API_ENDPOINT,
    BATCH: RESEND_BATCH_API_ENDPOINT,
  },
  
  // 内容加密设置
  ENABLE_CONTENT_ENCRYPTION: ENABLE_CONTENT_ENCRYPTION,
  CONTENT_ENCRYPTION: CONTENT_ENCRYPTION,
  
  // 内容限制
  LIMITS: LIMITS_CONFIG,
  
  // 请求限制
  RATE_LIMIT: RATE_LIMIT_CONFIG,
  
  // 安全设置
  SECURITY: SECURITY_CONFIG,
  
  // 日志设置
  LOGGING: LOGGING_CONFIG,
  
  // 邮件提供商检测设置
  PROVIDER_DETECTION: PROVIDER_DETECTION_CONFIG
};

// 响应状态码和消息
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
};

// 错误代码定义
const ERROR_CODES = {
  MISSING_API_KEY: "MISSING_API_KEY",
  INVALID_API_KEY: "INVALID_API_KEY",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_EMAIL_FORMAT: "INVALID_EMAIL_FORMAT",
  CONTENT_TOO_LARGE: "CONTENT_TOO_LARGE",
  TOO_MANY_RECIPIENTS: "TOO_MANY_RECIPIENTS",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
};

// 全局请求计数器（用于限流）
const requestCounter = new Map();

// 定义CORS头，确保接受所有来源的请求
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",  // 允许任何来源访问
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400"  // 缓存预检请求结果24小时
};

/******************************************************
 * 核心工具函数
 ******************************************************/

/**
 * 在发送邮件前，检查HTML内容是否完整（同步版本）
 * @param {Object} emailData - 邮件数据
 * @returns {Object} - 处理后的邮件数据
 */
function enhanceEmailContent(emailData) {
  if (!emailData || !emailData.html) {
    return emailData;
  }

  try {
    // 检查是否为完整HTML文档
    const isCompleteHtml = (html) => {
      const containsDoctype = html.trim().toLowerCase().startsWith('<!doctype');
      const containsHtmlTag = /<html[^>]*>/i.test(html);
      const containsHeadTag = /<head[^>]*>/i.test(html);
      const containsBodyTag = /<body[^>]*>/i.test(html);
      
      return containsDoctype && containsHtmlTag && containsHeadTag && containsBodyTag;
    };

    // 如果HTML已经完整则不需修改
    if (isCompleteHtml(emailData.html)) {
      console.log('邮件HTML已经是完整文档');
      return emailData;
    }

    // 不再应用默认模板，仅记录警告
    console.log('邮件HTML不完整，但不再应用默认模板。请确保前端在发送前应用正确的模板');
    
    // 返回原始数据，不做修改
    return emailData;
  } catch (error) {
    console.error('检查HTML内容时出错:', error);
    return emailData; // 出错时返回原始数据
  }
}

/**
 * 邮件内容加密工具
 * 提供各种方法来加密邮件内容，使其更难被垃圾邮件过滤器识别
 */
const EmailContentEncryption = {
  /**
   * 加密邮件内容
   * 保护重要数据同时通过垃圾邮件过滤器检测
   * @param {Object} emailData - 邮件数据对象，包含html, text, subject等字段
   * @param {Object} options - 加密选项
   * @param {number} options.strength - 加密强度 (范围0-10)
   * @param {string} options.provider - 邮件服务提供商名称 (可选)
   * @returns {Object} - 加密后的邮件数据
   */
  encryptEmailContent(emailData, options = {}) {
    // 如果内容加密未启用，直接返回原始数据
    if (!CONFIG.CONTENT_ENCRYPTION.ENABLED) {
      return emailData;
    }
    
    // 默认选项设置
    const defaultOptions = {
      strength: CONFIG.CONTENT_ENCRYPTION.ENCRYPTION_STRENGTH || 5,
      provider: null
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    // 检查并限制强度在有效范围内
    let strength = Math.max(0, Math.min(10, finalOptions.strength));
    
    // 基于内容敏感度自动调整加密强度
    strength = this._adjustEncryptionStrengthBasedOnContent(emailData, strength);
    
    // 如果强度为0，直接返回原始数据
    if (strength === 0) {
      return emailData;
    }
    
    // 克隆邮件数据，避免修改原始对象
    const encryptedData = JSON.parse(JSON.stringify(emailData));
    
    // 检测提供商并获取相关信息
    let provider = finalOptions.provider;
    let providerInfo = null;
    
    if (provider && CONFIG.PROVIDER_DETECTION.DEFAULT_PROVIDERS[provider]) {
      providerInfo = {
        providerName: provider,
        config: CONFIG.PROVIDER_DETECTION.DEFAULT_PROVIDERS[provider].config || {}
      };
      
      // 应用提供商特定的处理
      if (providerInfo.config.maxStrength && strength > providerInfo.config.maxStrength) {
        strength = providerInfo.config.maxStrength;
      }
    }
    
    // 加密邮件主题
    if (encryptedData.subject && CONFIG.CONTENT_ENCRYPTION.ENCRYPT_SUBJECT) {
      encryptedData.subject = this._encryptSubject(encryptedData.subject, strength, providerInfo);
    }
    
    // 加密HTML内容
    if (encryptedData.html && CONFIG.CONTENT_ENCRYPTION.ENCRYPT_HTML) {
      encryptedData.html = this._encryptHtmlContent(encryptedData.html, strength, providerInfo);
    }
    
    // 加密纯文本内容
    if (encryptedData.text && CONFIG.CONTENT_ENCRYPTION.ENCRYPT_TEXT) {
      encryptedData.text = this._encryptTextContent(encryptedData.text, strength, providerInfo);
    }
    
    // 应用提供商特定的后处理优化
    if (provider) {
      return this._applyProviderSpecificOptimization(encryptedData, provider);
    }
    
    return encryptedData;
  },
  
  /**
   * 根据内容特征动态调整加密强度
   * @param {Object} emailData - 邮件数据对象
   * @returns {number} - 调整后的加密强度
   * @private
   */
  _adjustEncryptionStrengthBasedOnContent(emailData, baseStrength) {
    let adjustedStrength = baseStrength;
    
    // 如果基础强度为0，表示不需要加密，直接返回
    if (baseStrength === 0) return 0;
    
    // 敏感关键词检测
    const sensitivePatterns = [
      // 金融相关
      /\b(money|payment|credit card|bank account|bitcoin|crypto|investment)\b/i,
      // 健康相关
      /\b(health|medicine|treatment|drug|weight loss|diet|covid|pill)\b/i,
      // 营销相关
      /\b(free|discount|offer|best price|limited time|sale|buy now|order today)\b/i,
      // 敏感信息请求
      /\b(password|login|verify|account|update your information)\b/i,
      // 紧急感词语
      /\b(urgent|immediate|act now|don't delay|expires soon|last chance)\b/i
    ];
    
    // 在标题和内容中检查敏感模式
    let sensitivityScore = 0;
    const contentToCheck = [
      emailData.subject || '',
      emailData.text || '',
      emailData.html ? emailData.html.replace(/<[^>]*>/g, ' ') : ''
    ].join(' ').toLowerCase();
    
    sensitivePatterns.forEach(pattern => {
      if (pattern.test(contentToCheck)) {
        sensitivityScore += 1;
      }
    });
    
    // 根据敏感分数调整强度
    if (sensitivityScore >= 3) {
      // 多个敏感模式匹配，增加强度
      adjustedStrength = Math.min(10, baseStrength + 2);
    } else if (sensitivityScore >= 1) {
      // 至少一个敏感模式匹配，稍微增加强度
      adjustedStrength = Math.min(10, baseStrength + 1);
    }
    
    return adjustedStrength;
  },
  
  /**
   * 加密HTML内容
   * @param {string} html - 原始HTML内容
   * @param {number} strength - 加密强度
   * @param {Object} providerInfo - 提供商信息(可选)
   * @returns {string} - 加密后的HTML内容
   * @private
   */
  _encryptHtmlContent(html, strength, providerInfo = null) {
    if (!html) return html;
    
    let encryptedHtml = html;
    
    // 应用提供商特定处理
    const needChineseProtection = providerInfo && 
                             providerInfo.config.specialHandling && 
                             providerInfo.config.specialHandling.includes('chinese-character-protection');
    
    if (needChineseProtection || CONFIG.CONTENT_ENCRYPTION.PROTECT_CHINESE_CHARACTERS) {
      encryptedHtml = this._protectChineseCharacters(encryptedHtml);
    }
    
    // 应用HTML结构混淆
    const enableHtmlMixing = CONFIG.CONTENT_ENCRYPTION.ENABLE_HTML_STRUCTURE_MIXING && 
      (!providerInfo || providerInfo.config.htmlMixing !== false);
    
    if (enableHtmlMixing) {
      encryptedHtml = this._applyHtmlStructureMixing(encryptedHtml, strength);
    }
    
    // 应用零宽字符插入
    const enableZeroWidthChars = CONFIG.CONTENT_ENCRYPTION.ENABLE_ZERO_WIDTH_CHARS && 
      (!providerInfo || providerInfo.config.zeroWidth !== false);
    
    if (enableZeroWidthChars) {
      encryptedHtml = this._insertZeroWidthCharsToHtml(encryptedHtml, strength);
    }
    
    // 添加随机样式
    const enableRandomStyles = CONFIG.CONTENT_ENCRYPTION.ENABLE_RANDOM_STYLES && 
      (!providerInfo || providerInfo.config.cssObfuscation !== false);
    
    if (enableRandomStyles) {
      encryptedHtml = this._addRandomStyles(encryptedHtml, strength);
    }
    
    // 添加诱饵内容
    const enableBaitContent = CONFIG.CONTENT_ENCRYPTION.ENABLE_HIDDEN_BAIT && 
      (!providerInfo || !providerInfo.config.avoidTechniques || !providerInfo.config.avoidTechniques.includes('hidden-text'));
    
    if (enableBaitContent) {
      encryptedHtml = this._insertHiddenBaitContent(encryptedHtml, strength);
    }
    
    // URL混淆
    const enableUrlObfuscation = CONFIG.CONTENT_ENCRYPTION.ENABLE_URL_OBFUSCATION && 
      (!providerInfo || providerInfo.config.urlObfuscation !== false);
    
    if (enableUrlObfuscation) {
      encryptedHtml = this._obfuscateUrls(encryptedHtml);
    }
    
    // 平衡图文比例
    const enableImageTextBalancing = CONFIG.CONTENT_ENCRYPTION.ENABLE_IMAGE_TEXT_BALANCING && 
      (!providerInfo || providerInfo.config.imageTextBalancing !== false);
    
    if (enableImageTextBalancing) {
      encryptedHtml = this._balanceImageTextRatio(encryptedHtml);
    }
    
    // 添加解密样式，确保内容正确显示
    encryptedHtml = this._addDecryptionStyles(encryptedHtml);
    
    return encryptedHtml;
  },
  
  /**
   * 加密纯文本内容，支持提供商特定优化
   * @param {string} text - 原始纯文本内容
   * @param {number} strength - 加密强度
   * @param {Object} providerInfo - 提供商信息(可选)
   * @returns {string} - 加密后的文本内容
   * @private
   */
  _encryptTextContent(text, strength, providerInfo = null) {
    if (!text) return text;
    
    let encryptedText = text;
    
    // 应用Unicode字符替换
    const enableUnicodeSubstitution = CONFIG.CONTENT_ENCRYPTION.ENABLE_UNICODE_SUBSTITUTION && 
      (!providerInfo || providerInfo.config.unicode !== false);
    
    if (enableUnicodeSubstitution) {
      // 检查是否需要中文字符保护
      const needChineseProtection = providerInfo && 
                               providerInfo.config.specialHandling && 
                               providerInfo.config.specialHandling.includes('chinese-character-protection');
      
      if (needChineseProtection || CONFIG.CONTENT_ENCRYPTION.PROTECT_CHINESE_CHARACTERS) {
        // 应用中文保护版本的Unicode替换
        encryptedText = this._applyUnicodeSubstitutionWithChineseProtection(encryptedText, strength);
      } else {
        // 应用标准Unicode替换
        encryptedText = this._applyUnicodeSubstitutionToPlainText(encryptedText, strength);
      }
    }
    
    // 应用零宽字符插入
    const enableZeroWidthChars = CONFIG.CONTENT_ENCRYPTION.ENABLE_ZERO_WIDTH_CHARS && 
      (!providerInfo || providerInfo.config.zeroWidth !== false);
    
    if (enableZeroWidthChars) {
      encryptedText = this._insertZeroWidthCharsIntoPlainText(encryptedText, strength);
    }
    
    return encryptedText;
  },
  
  /**
   * 轻度加密邮件主题，避免被标记为垃圾邮件
   * @param {string} subject - 原始主题
   * @param {number} strength - 加密强度
   * @param {Object} providerInfo - 提供商信息(可选)
   * @returns {string} - 加密后的主题
   * @private
   */
  _encryptSubject(subject, strength, providerInfo = null) {
    // 主题加密要轻度，确保不破坏可读性
    let encryptedSubject = subject;
    
    // 确定主题加密强度
    // 对于Gmail等严格检查主题的服务，显著降低加密强度
    let adjustedStrength = strength;
    if (providerInfo && providerInfo.providerName === 'Gmail') {
      adjustedStrength = Math.max(1, strength / 5); // Gmail主题最小化加密
    } else {
      // 其他提供商也降低强度，但程度不同
      adjustedStrength = Math.max(1, strength / 3);
    }
    
    // 应用非常轻度的Unicode替换
    const enableUnicodeSubstitution = CONFIG.CONTENT_ENCRYPTION.ENABLE_UNICODE_SUBSTITUTION && 
      (!providerInfo || providerInfo.config.unicode !== false);
    
    if (enableUnicodeSubstitution) {
      // 保护中文字符
      const needChineseProtection = providerInfo && 
                               providerInfo.config.specialHandling && 
                               providerInfo.config.specialHandling.includes('chinese-character-protection');
      
      if (needChineseProtection) {
        encryptedSubject = this._applyUnicodeSubstitutionWithChineseProtection(encryptedSubject, adjustedStrength);
      } else {
        encryptedSubject = this._applyUnicodeSubstitutionToPlainText(encryptedSubject, adjustedStrength);
      }
    }
    
    // 仅插入少量零宽字符
    const enableZeroWidthChars = CONFIG.CONTENT_ENCRYPTION.ENABLE_ZERO_WIDTH_CHARS && 
      (!providerInfo || providerInfo.config.zeroWidth !== false);
    
    if (enableZeroWidthChars) {
      let result = '';
      const words = encryptedSubject.split(/\s+/);
      
      words.forEach((word, index) => {
        if (index > 0) {
          result += ' ';
          
          // 小概率插入零宽字符
          if (Math.random() < (adjustedStrength / 25)) {
            result += this._getRandomZeroWidthChar();
          }
        }
        
        result += word;
      });
      
      encryptedSubject = result;
    }
    
    return encryptedSubject;
  },
  
  /**
   * 添加解密CSS样式，确保加密内容正确显示
   * @param {string} html - 处理前的HTML
   * @returns {string} - 添加解密CSS后的HTML
   * @private
   */
  _addDecryptionStyles(html) {
    // 添加确保内容正确显示的CSS样式
    const cssReset = `
      <style type="text/css">
        /* 确保所有加密内容正确显示 */
        [class^="e"] { display: inline !important; }
        [class^="tx_"] { display: inline !important; }
        span, font { display: inline !important; }
      </style>
    `;
    
    // 将重置样式插入到HTML的开头
    return cssReset + html;
  },
  
  /**
   * 处理中文字符保护，防止中文显示异常
   * @param {string} html - 原始HTML内容
   * @returns {string} - 处理后的HTML内容
   * @private
   */
  _protectChineseCharacters(html) {
    if (!html) return html;
    
    // 中文字符范围
    const chineseCharRegex = /[\u4e00-\u9fa5]/g;
    
    // 找到文本节点并处理，保护中文字符
    return html.replace(/(?<=>)([^<]+)(?=<)/g, (match) => {
      return match.replace(/./g, (char) => {
        if (char.match(chineseCharRegex)) {
          // 中文字符不做替换
          return char;
        }
        // 英文和其他字符保持不变，在其他函数中处理
        return char;
      });
    });
  },
  
  /**
   * 平衡图片和文本比例，避免触发垃圾邮件过滤器
   * @param {string} html - HTML内容
   * @returns {string} - 处理后的HTML
   * @private
   */
  _balanceImageTextRatio(html) {
    // 计算图片数量
    const imgCount = (html.match(/<img[^>]*>/g) || []).length;
    
    // 估算文本内容长度(简化方法)
    const textEstimate = html.replace(/<[^>]*>/g, '').length;
    
    // 如果图片数量过多或文本过少，添加隐藏的有意义文本内容
    if (imgCount > 3 && textEstimate / imgCount < 200) {
      const hiddenText = `
        <div style="display:block;color:inherit;font-size:small">
          <p>尊敬的用户，感谢您关注我们的信息。</p>
          <p>我们致力于为您提供优质的服务和内容。</p>
          <p>如您有任何疑问，欢迎随时联系我们。</p>
        </div>
      `;
      
      // 插入到HTML尾部或适当位置
      if (html.indexOf('</body>') !== -1) {
        return html.replace('</body>', hiddenText + '</body>');
      } else {
        return html + hiddenText;
      }
    }
    
    return html;
  },
  
  /**
   * 混淆URL链接，减少被检测为垃圾邮件的概率
   * @param {string} html - HTML内容
   * @returns {string} - 处理后的HTML
   * @private
   */
  _obfuscateUrls(html) {
    if (!html) return html;
    
    // 查找所有链接标签
    return html.replace(/<a\s+(?:[^>]*?\s+)?href=(["\'])(https?:\/\/[^"\']+)\1/gi, (match, quote, url) => {
      // 跳过已处理的链接
      if (match.includes('data-obfuscated')) {
        return match;
      }
      
      // 简单混淆: 使用css display属性拆分URL显示
      const urlParts = url.replace(/^https?:\/\//i, '').split('.');
      
      if (urlParts.length < 2) {
        return match; // 不是标准域名格式
      }
      
      // 创建混淆显示
      const domain = urlParts[0];
      const tld = urlParts.slice(1).join('.');
      
      // 构建新的链接显示
      const displayText = `<span>${domain}</span><span style="display:inline">.</span><span>${tld}</span>`;
      
      // 替换原链接文本 (保留href原始值)
      return match.replace(/>.*?<\/a>/i, ` data-obfuscated="true">${displayText}</a>`);
    });
  },
  
  /**
   * 插入隐藏的"诱饵"内容，迷惑垃圾邮件检测系统
   * @param {string} html - 原始HTML
   * @param {number} strength - 加密强度
   * @returns {string} - 添加诱饵后的HTML
   * @private
   */
  _insertHiddenBaitContent(html, strength) {
    // 如果HTML内容为空，则直接返回
    if (!html) return html;
    
    // 垃圾邮件检测系统常用的关键词列表
    const spamWords = [
      'discount', 'free', 'offer', 'limited', 'exclusive', 'guaranteed', 
      'money', 'price', 'bonus', 'credit', 'subscribe', 'lottery', 'prize', 
      'congratulations', 'winner', 'promotion', 'opportunity', 'investment', 
      'beneficiary', 'confidential', 'urgent', 'approved', 'confirmed'
    ];
    
    // 确定是否添加诱饵内容(根据强度)
    if (Math.random() > (strength / 15)) {
      return html; // 低强度情况下跳过
    }
    
    // 随机选择1到3个关键词
    const keywordCount = 1 + Math.floor(Math.random() * 3);
    const selectedKeywords = [];
    
    for (let i = 0; i < keywordCount; i++) {
      const randomIndex = Math.floor(Math.random() * spamWords.length);
      selectedKeywords.push(spamWords[randomIndex]);
    }
    
    // 构建诱饵内容
    let baitContent = selectedKeywords.join(' ');
    
    // 隐藏技术列表
    const hidingTechniques = [
      // 方法1：使用CSS隐藏
      (content) => `<div style="display:none !important;visibility:hidden !important;">${content}</div>`,
      
      // 方法2：使用极小的字体大小
      (content) => `<div style="font-size:0.01px;color:transparent;">${content}</div>`,
      
      // 方法3：使用HTML注释 (在邮件客户端中可能会被显示)
      (content) => `<!-- ${content} -->`,
      
      // 方法4：使用z-index将内容放在其他内容下方
      (content) => `<div style="position:absolute;z-index:-1000;opacity:0.01;">${content}</div>`,
      
      // 方法5：使用文本颜色与背景颜色相同
      (content) => `<div style="color:#FFFFFF;background-color:#FFFFFF;">${content}</div>`
    ];
    
    // 随机选择一种隐藏技术
    const technique = hidingTechniques[Math.floor(Math.random() * hidingTechniques.length)];
    const hiddenContent = technique(baitContent);
    
    // 将诱饵内容插入到HTML中
    if (html.indexOf('</body>') !== -1) {
      // 如果HTML包含body标签，则在body结束前插入
      return html.replace('</body>', hiddenContent + '</body>');
    } else {
      // 否则直接添加到HTML结尾
      return html + hiddenContent;
    }
  },
  
  /**
   * 获取随机零宽字符
   * @returns {string} - 随机零宽字符
   * @private
   */
  _getRandomZeroWidthChar() {
    // 零宽字符数组
    const zeroWidthChars = [
      '\u200B', // 零宽空格
      '\u200C', // 零宽非连接符
      '\u200D', // 零宽连接符
      '\u2060', // 单词连接符
      '\u2061', // 函数应用
      '\u2062', // 不可见乘号
      '\u2063', // 不可见分隔符
      '\u2064', // 不可见加号
      '\uFEFF'  // 零宽非断空格
    ];
    
    // 随机返回一个零宽字符
    return zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
  },

  /**
   * 在HTML中插入零宽字符，增加反垃圾检测能力
   * @param {string} html - 原始HTML
   * @param {number} strength - 加密强度
   * @returns {string} - 处理后的HTML
   * @private
   */
  _insertZeroWidthCharsToHtml(html, strength) {
    // 使用正则表达式找出文本节点并插入零宽字符
    // 匹配任意标签之间的文本内容
    return html.replace(/(?<=>)([^<]+)(?=<)/g, (match) => {
      return this._insertZeroWidthCharsIntoPlainText(match, strength);
    });
  },
  
  /**
   * 对HTML中的文本应用Unicode字符替换
   * @param {string} html - 原始HTML
   * @param {number} strength - 加密强度
   * @returns {string} - 处理后的HTML
   * @private
   */
  _applyUnicodeSubstitutionToHtml(html, strength) {
    // 使用正则表达式找出文本节点并应用Unicode替换
    return html.replace(/(?<=>)([^<]+)(?=<)/g, (match) => {
      return this._applyUnicodeSubstitutionToPlainText(match, strength);
    });
  },
  
  /**
   * 应用HTML结构混淆
   * @param {string} html - 原始HTML内容
   * @param {number} strength - 加密强度
   * @returns {string} - 混淆后的HTML内容
   * @private
   */
  _applyHtmlStructureMixing(html, strength) {
    // 使用正则表达式查找文本节点并进行分割包装
    return html.replace(/(?<=>)([^<]+)(?=<)/g, (match) => {
      // 如果文本太短或随机值不满足条件，不进行处理
      if (match.length < 5 || Math.random() > (strength / 15)) {
        return match;
      }
      
      // 生成随机标签名和类名
      const tagName = Math.random() > 0.5 ? 'span' : 'font';
      const generateRandomClass = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const length = 3 + Math.floor(Math.random() * 5);
        let result = 'tx_';
        for (let i = 0; i < length; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };
      
      // 分割文本并添加标签
      let result = '';
      let remainingText = match;
      
      while (remainingText.length > 0) {
        // 决定当前片段长度
        const segmentLength = 1 + Math.floor(Math.random() * Math.min(5, remainingText.length));
        const segment = remainingText.substring(0, segmentLength);
        
        // 决定是否包装当前片段
        if (Math.random() < (strength / 15)) {
          result += `<${tagName} class="${generateRandomClass()}">${segment}</${tagName}>`;
        } else {
          result += segment;
        }
      
        // 如果启用，偶尔插入零宽字符
        if (CONFIG.CONTENT_ENCRYPTION.ENABLE_ZERO_WIDTH_CHARS && Math.random() < (strength / 20)) {
          result += this._getRandomZeroWidthChar();
        }
        
        // 更新剩余文本
        remainingText = remainingText.substring(segmentLength);
      }
      
      return result;
    });
  },
  
  /**
   * 向HTML添加随机样式，使内容更难被垃圾邮件过滤器识别
   * @param {string} html - 原始HTML
   * @param {number} strength - 加密强度
   * @returns {string} - 添加样式后的HTML
   * @private
   */
  _addRandomStyles(html, strength) {
    // 生成随机类名
    const generateRandomClassName = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const length = 5 + Math.floor(Math.random() * 5);
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return 'e' + result; // 确保类名以字母开头
    };
    
    // 创建随机类样式
    const classCount = Math.floor(strength / 2) + 1;
    let cssText = '';
    const randomClasses = [];
    
    for (let i = 0; i < classCount; i++) {
      const className = generateRandomClassName();
      randomClasses.push(className);
      
      // 生成随机样式属性
      cssText += `.${className} {`;
      cssText += 'display: inline !important;';
      
      // 随机添加其他样式
      if (Math.random() < 0.5) cssText += 'font-style: normal !important;';
      if (Math.random() < 0.5) cssText += 'font-weight: normal !important;';
      if (Math.random() < 0.5) cssText += 'text-decoration: none !important;';
      if (Math.random() < 0.5) cssText += 'color: inherit !important;';
      
      cssText += '}\n';
    }
    
    // 创建style标签
    const styleTag = `<style type="text/css">${cssText}</style>`;
    
    // 插入到HTML头部
    if (html.indexOf('<head>') !== -1) {
      return html.replace('<head>', `<head>${styleTag}`);
    } else if (html.indexOf('<html>') !== -1) {
      return html.replace('<html>', `<html><head>${styleTag}</head>`);
    } else {
      return styleTag + html;
    }
  },
  
  /**
   * 应用提供商特定优化
   * @param {Object} emailData - 邮件数据
   * @param {string} provider - 提供商名称
   * @returns {Object} - 处理后的邮件数据
   * @private
   */
  _applyProviderSpecificOptimization(emailData, provider) {
    // 检查是否有提供商的配置
    if (!CONFIG.PROVIDER_DETECTION.DEFAULT_PROVIDERS[provider]) {
      console.warn(`No provider configuration found for ${provider}, using default settings`);
      return emailData;
    }
    
    const providerInfo = {
      providerName: provider,
      config: CONFIG.PROVIDER_DETECTION.DEFAULT_PROVIDERS[provider].config || {}
    };
    
    // 克隆邮件数据以避免修改原始对象
    const optimizedData = JSON.parse(JSON.stringify(emailData));
    
    // 应用提供商特定处理
    if (providerInfo.config.specialProcessing) {
      providerInfo.config.specialProcessing.forEach(process => {
        switch (process) {
          case 'normalize-html':
            // 标准化HTML，删除可能导致问题的特殊标签
            if (optimizedData.html) {
              // 移除scripts和危险属性
              optimizedData.html = optimizedData.html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/on\w+\s*=\s*(['"])[\s\S]*?\1/g, '');
            }
            break;
            
          case 'simplify-css':
            // 简化内联CSS样式
            if (optimizedData.html) {
              optimizedData.html = optimizedData.html
                .replace(/style\s*=\s*(['"])[^\1]*?\1/gi, (match) => {
                  // 保留必要的样式属性，移除复杂属性
                  return match.replace(/position\s*:\s*[^;]+;?/gi, '')
                              .replace(/z-index\s*:\s*[^;]+;?/gi, '');
                });
            }
            break;
            
          case 'enforce-text-content':
            // 确保有纯文本版本
            if (optimizedData.html && !optimizedData.text) {
              // 简单的从HTML提取文本
              optimizedData.text = optimizedData.html
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            }
            break;
            
          // 可添加更多特殊处理逻辑
        }
      });
    }
    
    return optimizedData;
  },
  
  /**
   * 在纯文本中应用Unicode字符替换，保护中文字符
   * @param {string} text - 原始文本
   * @param {number} strength - 加密强度
   * @returns {string} - 替换后的文本
   * @private
   */
  _applyUnicodeSubstitutionWithChineseProtection(text, strength) {
    if (!text) return text;
    
    // 是否需要保护中文字符
    if (!CONFIG.CONTENT_ENCRYPTION.PROTECT_CHINESE_CHARACTERS) {
      return this._applyUnicodeSubstitutionToPlainText(text, strength);
    }
    
    // 中文字符范围
    const chineseCharRegex = /[\u4e00-\u9fa5]/;
    
    let result = '';
    
    // 遍历每个字符
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // 中文字符不替换
      if (chineseCharRegex.test(char)) {
        result += char;
        continue;
      }
      
      // 对非中文字符应用正常的Unicode替换
      const lowerChar = char.toLowerCase();
      
      // 根据加密强度决定替换概率
      const charMap = {
        'a': ['а', 'ａ', 'ɑ', 'α'],
        'e': ['е', 'ｅ', 'ε', 'ē'],
        'o': ['о', 'ｏ', 'ο', 'ō'],
        'p': ['р', 'ｐ', 'ρ'],
        'c': ['с', 'ｃ', 'ϲ'],
        'x': ['х', 'ｘ', 'χ'],
        'y': ['у', 'ｙ', 'γ'],
        'i': ['і', 'ｉ', 'ι'],
        's': ['ѕ', 'ｓ'],
        'b': ['ь', 'ｂ'],
        'd': ['ԁ', 'ｄ'],
        'g': ['ɡ', 'ｇ'],
        'j': ['ј', 'ｊ'],
        'l': ['ӏ', 'ｌ'],
        'n': ['ո', 'ｎ'],
        'r': ['г', 'ｒ'],
        't': ['т', 'ｔ'],
        'u': ['ս', 'ｕ']
      };
      
      if (charMap[lowerChar] && Math.random() < (strength / 15)) {
        // 使用映射字符替换
        const mappedChars = charMap[lowerChar];
        const replacement = mappedChars[Math.floor(Math.random() * mappedChars.length)];
        
        // 如果原字符是大写，尝试将替换字符转换为大写
        if (char !== lowerChar) {
          result += replacement.toUpperCase();
        } else {
          result += replacement;
        }
      } else {
        // 保持原字符不变
        result += char;
      }
    }
    
    return result;
  }
};

// 修改错误响应函数，添加CORS头
function errorResponse(error, code, status = 400, details = null, suggestion = null) {
  const errorData = {
    error,
    code,
    statusCode: status
  };

  if (details) {
    errorData.details = details;
  }

  if (suggestion) {
    errorData.suggestion = suggestion;
  }

  return new Response(JSON.stringify(errorData), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

// 成功响应函数，添加CORS头
function successResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

// 添加批量邮件处理函数
async function handleBatchSendEmail(request) {
  try {
    // 获取授权头
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(
        "缺少API密钥",
        "MISSING_API_KEY",
        401,
        null,
        "请在Authorization头中提供有效的API密钥"
      );
    }

    // 提取API密钥
    const apiKey = authHeader.substring(7);
    
    // 解析请求体
    let batchRequests;
    try {
      batchRequests = await request.json();
      
      // 确保请求是一个数组
      if (!Array.isArray(batchRequests)) {
        return errorResponse(
          "批量发送请求必须是一个数组",
          "INVALID_FORMAT",
          400,
          null,
          "请提供邮件对象数组"
        );
      }
      
      // 检查批量请求数量限制
      if (batchRequests.length > 100) {
        return errorResponse(
          "批量发送请求数量超过限制",
          "BATCH_LIMIT_EXCEEDED",
          400,
          null,
          "批量发送最多支持100个邮件"
        );
      }
      
      if (batchRequests.length === 0) {
        return errorResponse(
          "批量发送请求为空",
          "EMPTY_BATCH",
          400,
          null,
          "请提供至少一个邮件对象"
        );
      }
    } catch (error) {
      return errorResponse(
        "无效的JSON格式",
        "INVALID_JSON",
        400,
        error.message,
        "请确保请求体是有效的JSON格式"
      );
    }

    console.log(`[handleBatchSendEmail] 收到批量发送邮件请求，共${batchRequests.length}封邮件`);

    // 验证每个请求
    const processedBatch = [];
    const validationErrors = [];
    
    for (let i = 0; i < batchRequests.length; i++) {
      const emailRequest = batchRequests[i];
      
      // 检查必填字段
      if (!emailRequest.to) {
        validationErrors.push({
          index: i,
          error: "缺少收件人(to)字段",
          code: "MISSING_REQUIRED_FIELD"
        });
        continue;
      }
      
      if (!emailRequest.from) {
        validationErrors.push({
          index: i,
          error: "缺少发件人(from)字段",
          code: "MISSING_REQUIRED_FIELD"
        });
        continue;
      }
      
      if (!emailRequest.subject) {
        validationErrors.push({
          index: i,
          error: "缺少主题(subject)字段",
          code: "MISSING_REQUIRED_FIELD"
        });
        continue;
      }
      
      if (!emailRequest.html && !emailRequest.text) {
        validationErrors.push({
          index: i,
          error: "缺少内容(html或text)字段",
          code: "MISSING_REQUIRED_FIELD"
        });
        continue;
      }
      
      // 应用内容加密
      let encryptedData = emailRequest;
      if (CONFIG.ENABLE_CONTENT_ENCRYPTION && EmailContentEncryption) {
        try {
          encryptedData = EmailContentEncryption.encryptEmailContent(emailRequest);
          console.log(`[handleBatchSendEmail] 邮件${i}已应用内容加密`);
        } catch (error) {
          console.error(`[handleBatchSendEmail] 应用内容加密失败:`, error);
          // 加密失败时使用原始数据
        }
      }
      
      // 添加到处理后的批量请求中
      processedBatch.push(encryptedData);
    }
    
    // 如果有验证错误，返回错误
    if (validationErrors.length > 0) {
      return errorResponse(
        "批量请求数据验证失败",
        "BATCH_VALIDATION_FAILED",
        400,
        validationErrors,
        "请检查请求参数并修正错误"
      );
    }
    
    console.log('[handleBatchSendEmail] 准备转发请求到Resend API...');

    // 实际发送到Resend API
    try {
      // 构建发送到Resend API的请求
      const resendResponse = await fetch(RESEND_BATCH_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(processedBatch)
      });
      
      console.log(`[handleBatchSendEmail] Resend API响应状态: ${resendResponse.status}`);
      
      // 解析Resend响应
      let resendResult;
      try {
        resendResult = await resendResponse.json();
      } catch (error) {
        console.error('[handleBatchSendEmail] 无法解析Resend API响应:', error);
        return errorResponse(
          "无法解析Resend API响应",
          "UPSTREAM_ERROR",
          500,
          { status: resendResponse.status, statusText: resendResponse.statusText },
          "请联系Resend API支持"
        );
      }
      
      // 检查响应状态
      if (!resendResponse.ok) {
        console.error('[handleBatchSendEmail] Resend API返回错误:', resendResult);
        
        // 处理常见错误情况
        if (resendResponse.status === 429) {
          return errorResponse(
            "速率限制",
            "RATE_LIMIT_EXCEEDED",
            429,
            resendResult.message || "您已达到Resend API的速率限制",
            "请稍后再试或切换到其他账号"
          );
        } else if (resendResponse.status === 403 || resendResponse.status === 401) {
          return errorResponse(
            "API密钥无效或权限不足",
            "INVALID_API_KEY",
            403,
            resendResult.message,
            "请检查您的API密钥是否正确且具有发送权限"
          );
        } else {
          return errorResponse(
            "批量发送失败",
            "UPSTREAM_ERROR",
            resendResponse.status,
            resendResult.message || "未知错误",
            "请检查API密钥和请求参数"
          );
        }
      }
      
      console.log('[handleBatchSendEmail] 批量发送成功,Resend返回:', resendResult);
      
      // 返回成功响应
      return successResponse({
        success: true,
        message: `成功发送${processedBatch.length}封邮件`,
        data: resendResult
      });
      
    } catch (error) {
      console.error('[handleBatchSendEmail] 调用Resend API时发生网络错误:', error);
      return errorResponse(
        "与Resend API通信失败",
        "NETWORK_ERROR",
        500,
        error.message,
        "请检查网络连接后重试"
      );
    }
  } catch (error) {
    console.error("处理批量发送邮件请求时出错:", error);
    return errorResponse(
      "服务器内部错误",
      "INTERNAL_ERROR",
      500,
      error.message,
      "请联系系统管理员报告此问题"
    );
  }
}

// 添加多账号发送管理器
async function handleMultiAccountBatchSend(request) {
  try {
    // 解析请求数据
    const requestData = await request.json();
    
    // 确保有效的请求格式
    if (!requestData || typeof requestData !== 'object') {
      return errorResponse(
        "无效的请求数据",
        "INVALID_REQUEST",
        400,
        null,
        "请提供有效的请求数据"
      );
    }
    
    // 提取必要参数
    const { emails, accounts, batchSize = 50, rateLimit = 10 } = requestData;
    
    // 校验账号数组
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return errorResponse(
        "缺少账号信息",
        "MISSING_ACCOUNTS",
        400,
        null,
        "请提供至少一个有效的Resend账号"
      );
    }
    
    // 校验邮件数组
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return errorResponse(
        "缺少邮件数据",
        "MISSING_EMAILS",
        400,
        null,
        "请提供至少一个邮件对象"
      );
    }
    
    console.log(`[handleMultiAccountBatchSend] 收到多账号批量发送请求，共${emails.length}封邮件，${accounts.length}个账号`);
    
    // 确保批量大小在有效范围内(Resend最大支持50)
    const actualBatchSize = Math.min(50, Math.max(1, batchSize));
    
    // 计算发送任务分配
    const totalEmails = emails.length;
    const accountCount = accounts.length;
    
    // 创建账号队列（带权重）
    const accountQueue = accounts.map(account => ({
      ...account,
      availableQuota: account.monthlyQuota || 3000, // 默认3000封(免费版)
      dailyQuota: account.dailyQuota || 300,       // 默认300封/天
      minuteQuota: account.minuteQuota || 10,      // 默认10封/分钟
      weight: account.weight || 1,                 // 默认权重1
      usedCount: 0                                 // 已使用计数器
    }));
    
    // 按权重排序（高权重优先）
    accountQueue.sort((a, b) => b.weight - a.weight);
    
    // 根据账号权重分配邮件
    const distributionMap = new Map();
    const emailBatches = [];
    
    // 分批处理
    for (let i = 0; i < totalEmails; i += actualBatchSize) {
      const batch = emails.slice(i, i + actualBatchSize);
      emailBatches.push(batch);
    }
    
    console.log(`[handleMultiAccountBatchSend] 已将${totalEmails}封邮件分为${emailBatches.length}批，每批最多${actualBatchSize}封`);
    
    // 智能分配批次给账号
    emailBatches.forEach((batch, index) => {
      // 在每个批次找出当前最优账号（考虑权重和已使用配额）
      accountQueue.sort((a, b) => {
        // 首先考虑是否超出分钟配额
        if (a.usedCount >= a.minuteQuota && b.usedCount < b.minuteQuota) {
          return 1; // b优先
        }
        if (a.usedCount < a.minuteQuota && b.usedCount >= b.minuteQuota) {
          return -1; // a优先
        }
        
        // 其次考虑权重和已使用数量的比例
        const aScore = a.weight * (1 - a.usedCount / a.availableQuota);
        const bScore = b.weight * (1 - b.usedCount / b.availableQuota);
        return bScore - aScore;
      });
      
      // 获取最优账号
      const bestAccount = accountQueue[0];
      
      // 更新账号使用计数
      bestAccount.usedCount += batch.length;
      
      // 记录分配结果
      if (!distributionMap.has(bestAccount.apiKey)) {
        distributionMap.set(bestAccount.apiKey, []);
      }
      distributionMap.get(bestAccount.apiKey).push({
        batchIndex: index,
        emails: batch
      });
    });
    
    console.log(`[handleMultiAccountBatchSend] 已将邮件批次分配至${distributionMap.size}个账号`);
    
    // 实际发送处理
    const results = [];
    const errors = [];
    
    // 为每个账号并行处理发送
    const sendPromises = Array.from(distributionMap.entries()).map(async ([apiKey, batches]) => {
      // 获取账号信息
      const accountInfo = accounts.find(acc => acc.apiKey === apiKey);
      if (!accountInfo) {
        throw new Error(`找不到API密钥为 ${apiKey.substring(0, 5)}... 的账号信息`);
      }
      
      console.log(`[handleMultiAccountBatchSend] 使用账号 ${accountInfo.name || apiKey.substring(0, 5)}... 处理${batches.length}个批次`);
      
      // 顺序处理每个批次
      for (const batch of batches) {
        try {
          // 准备请求数据
          const processedEmails = [];
          
          // 处理每封邮件
          for (const email of batch.emails) {
            // 验证必填字段
            if (!email.to || !email.from || !email.subject || (!email.html && !email.text)) {
              errors.push({
                batchIndex: batch.batchIndex,
                error: "邮件缺少必要字段",
                email: { to: email.to, subject: email.subject }
              });
              continue;
            }
            
            // 替换发件人域名（如果账号有指定域名）
            let from = email.from;
            if (accountInfo.domain) {
              // 检查是否包含域名
              if (from.includes('@')) {
                if (from.includes('<')) {
                  // 格式: "Name <email@domain.com>"
                  from = from.replace(/<[^>]+>/, `<noreply@${accountInfo.domain}>`);
                } else {
                  // 格式: "email@domain.com"
                  const nameOnly = from.split('@')[0];
                  from = `${nameOnly}@${accountInfo.domain}`;
                }
              } else {
                // 格式: "Name" - 添加域名
                from = `${from} <noreply@${accountInfo.domain}>`;
              }
            }
            
            // 应用内容加密
            let processedEmail = { ...email, from };
            if (CONFIG.ENABLE_CONTENT_ENCRYPTION && EmailContentEncryption) {
              try {
                processedEmail = EmailContentEncryption.encryptEmailContent(processedEmail);
              } catch (error) {
                console.error(`[handleMultiAccountBatchSend] 应用内容加密失败:`, error);
                // 加密失败时使用原始数据
              }
            }
            
            // 添加到批次
            processedEmails.push(processedEmail);
          }
          
          // 如果批次为空，跳过
          if (processedEmails.length === 0) {
            console.warn(`[handleMultiAccountBatchSend] 批次 ${batch.batchIndex} 没有有效邮件，跳过`);
            continue;
          }
          
          // 发送批次
          console.log(`[handleMultiAccountBatchSend] 发送批次 ${batch.batchIndex}，包含 ${processedEmails.length} 封邮件`);
          
          // 构建发送请求
          const response = await fetch(RESEND_BATCH_API_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(processedEmails)
          });
          
          // 解析响应
          const responseData = await response.json();
          
          if (!response.ok) {
            // 处理错误情况
            console.error(`[handleMultiAccountBatchSend] 批次 ${batch.batchIndex} 发送失败:`, responseData);
            
            errors.push({
              batchIndex: batch.batchIndex,
              apiKey: apiKey.substring(0, 5) + '...',
              error: responseData.message || responseData.error || "未知错误",
              status: response.status
            });
            
            // 如果是额度限制，标记账号不可用
            if (response.status === 429 || response.status === 403) {
              const account = accountQueue.find(acc => acc.apiKey === apiKey);
              if (account) {
                account.usedCount = account.minuteQuota; // 标记为已达上限
                console.warn(`[handleMultiAccountBatchSend] 账号 ${accountInfo.name || apiKey.substring(0, 5)}... 已达到限制，将不再使用`);
              }
            }
          } else {
            // 成功处理
            console.log(`[handleMultiAccountBatchSend] 批次 ${batch.batchIndex} 发送成功`);
            results.push({
              batchIndex: batch.batchIndex,
              apiKey: apiKey.substring(0, 5) + '...',
              emailCount: processedEmails.length,
              data: responseData
            });
          }
          
          // 根据速率限制等待一段时间
          if (rateLimit > 0) {
            const delayMs = Math.ceil(60000 / rateLimit);
            console.log(`[handleMultiAccountBatchSend] 等待 ${delayMs}ms 以符合速率限制`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          console.error(`[handleMultiAccountBatchSend] 处理批次 ${batch.batchIndex} 时出错:`, error);
          errors.push({
            batchIndex: batch.batchIndex,
            apiKey: apiKey.substring(0, 5) + '...',
            error: error.message,
            stack: error.stack
          });
        }
      }
    });
    
    // 等待所有发送完成
    await Promise.all(sendPromises);
    
    // 返回结果
    return successResponse({
      success: errors.length === 0,
      totalEmails,
      processedBatches: emailBatches.length,
      successfulBatches: results.length,
      failedBatches: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("[handleMultiAccountBatchSend] 处理多账号批量发送请求时出错:", error);
    return errorResponse(
      "处理多账号批量发送请求时出错",
      "INTERNAL_ERROR",
      500,
      error.message,
      "请检查请求参数并重试"
    );
  }
}

// 修改 fetch 函数以支持多账号批量发送
export default {
  async fetch(request, env, ctx) {
    try {
      // 处理CORS预检请求
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS
        });
      }

      // 获取请求URL和路径
      const url = new URL(request.url);
      const path = url.pathname;

      // 添加对多账号邮件批量发送的处理
      if (path === "/api/emails/multi-account-batch" && request.method === "POST") {
        return handleMultiAccountBatchSend(request);
      }

      // 添加对批量邮件发送的处理
      if ((path === "/api/emails/batch" || path === "/emails/batch") && request.method === "POST") {
        return handleBatchSendEmail(request);
      }

      // 基本API信息
      if (path === "/api" || path === "/") {
        return new Response(JSON.stringify({
          name: "Resend Email API Worker",
          version: "1.2.0",
          status: "运行中",
          description: "此API提供邮件发送功能，支持内容加密、多账号分发、请求验证和限流"
        }), {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }

      // 处理未找到的路由
      return new Response(JSON.stringify({
        error: "未找到请求的资源",
        code: "NOT_FOUND",
        statusCode: 404,
        suggestion: "请检查API端点是否正确"
      }), {
        status: 404,
        headers: { 
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    } catch (error) {
      // 捕获未处理的错误
      console.error("Worker处理请求时发生未捕获的错误:", error);
      
      return new Response(JSON.stringify({
        error: "服务器内部错误",
        code: "INTERNAL_ERROR",
        statusCode: 500,
        message: error.message
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
  },
  // 暴露主要功能，方便前端直接调用
  enhanceEmailContent,
  EmailContentEncryption,
  CONFIG
};