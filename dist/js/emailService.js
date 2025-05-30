/**
 * 邮件服务
 * 负责处理邮件发送和历史记录等功能
 */

// 邮件服务API基础URL
const API_BASE_URL = 'https://api-mail.ohi.cc';  // 去掉末尾的斜杠

// 邮件服务配置常量
const CONFIG = {
    MAX_HTML_SIZE: 100 * 1024, // HTML内容最大大小（字节）：100KB
    MAX_RECIPIENTS: 50,        // 最大收件人数量
    MAX_RETRIES: 3,            // 最大重试次数
    RETRY_DELAY: 1000,         // 重试基础延迟（毫秒）
    REQUEST_TIMEOUT: 15000,    // 请求超时时间（毫秒）
    MAX_SUBJECT_LENGTH: 255,   // 主题最大长度
    MAX_FROM_LENGTH: 100,      // 发件人最大长度
    WORKER_SAFE_TAGS: [        // Worker安全处理的HTML标签
        'a', 'b', 'br', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'i', 'img', 'li', 'ol', 'p', 'span', 'strong', 'table',
        'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
    ]
};

// 邮件服务对象 - 定义为全局对象，确保iframe可以访问
window.EmailService = {
    /**
     * 获取当前设置中的API密钥
     * @returns {Object} 包含apiKey和fromDomain的对象
     */
    getApiSettings() {
        try {
            // 从本地存储获取账号信息
            const accounts = JSON.parse(localStorage.getItem('resendAccounts') || '[]');
            
            // 获取当前活跃账号索引
            const activeIndex = parseInt(localStorage.getItem('activeAccountIndex') || '0');
            
            // 如果有账号，返回当前活跃账号
            if (accounts.length > 0) {
                // 确保索引在有效范围内
                const index = activeIndex >= 0 && activeIndex < accounts.length ? activeIndex : 0;
                return accounts[index];
            }
            
            return null;
        } catch (error) {
            console.error('获取API设置时出错:', error);
            return null;
        }
    },
    
    /**
     * 设置下一个活跃账号（用于轮询）
     */
    setNextActiveAccount() {
        try {
            const accounts = JSON.parse(localStorage.getItem('resendAccounts') || '[]');
            if (accounts.length <= 1) return; // 只有一个或没有账号，不需要轮询
            
            const currentIndex = parseInt(localStorage.getItem('activeAccountIndex') || '0');
            const nextIndex = (currentIndex + 1) % accounts.length;
            
            localStorage.setItem('activeAccountIndex', nextIndex.toString());
            console.log(`切换到下一个账号，索引: ${nextIndex}`);
        } catch (error) {
            console.error('设置下一个活跃账号时出错:', error);
        }
    },
    
    /**
     * 验证邮件请求数据
     * @param {Object} emailData - 邮件数据对象
     * @returns {Object} - 包含验证结果和错误信息的对象
     */
    validateEmailRequest(emailData) {
        const validationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };
        
        // 验证收件人
        if (!emailData.to || emailData.to.length === 0) {
            validationResult.isValid = false;
            validationResult.errors.push('收件人不能为空');
        } else if (emailData.to.length > CONFIG.MAX_RECIPIENTS) {
            validationResult.warnings.push(`收件人数量超过最大限制 (${CONFIG.MAX_RECIPIENTS})，将截取前${CONFIG.MAX_RECIPIENTS}个`);
        }
        
        // 验证主题
        if (!emailData.subject) {
            validationResult.isValid = false;
            validationResult.errors.push('邮件主题不能为空');
        } else if (emailData.subject.length > CONFIG.MAX_SUBJECT_LENGTH) {
            validationResult.warnings.push(`主题长度超过最大限制 (${CONFIG.MAX_SUBJECT_LENGTH})，将自动截断`);
        }
        
        // 验证内容
        if ((!emailData.html || emailData.html === '') && (!emailData.text || emailData.text === '')) {
            validationResult.isValid = false;
            validationResult.errors.push('邮件内容不能为空');
        }
        
        // 验证HTML大小
        if (emailData.html) {
            const htmlSize = new Blob([emailData.html]).size;
            if (htmlSize > CONFIG.MAX_HTML_SIZE) {
                validationResult.warnings.push(`HTML内容大小 (${Math.round(htmlSize/1024)}KB) 超过推荐值 (${CONFIG.MAX_HTML_SIZE/1024}KB)，可能会影响发送`);
            }
        }
        
        return validationResult;
    },
    
    /**
     * 预处理邮件请求数据
     * @param {Object} emailData - 原始邮件数据对象
     * @param {Object} validationResult - 验证结果对象
     * @returns {Object} - 处理后的邮件数据对象
     */
    preprocessEmailRequest(emailData, validationResult) {
        const processedData = { ...emailData };
        
        // 处理收件人数量限制
        if (processedData.to && processedData.to.length > CONFIG.MAX_RECIPIENTS) {
            processedData.to = processedData.to.slice(0, CONFIG.MAX_RECIPIENTS);
            console.warn(`收件人数量已截取至${CONFIG.MAX_RECIPIENTS}个`);
        }
        
        // 处理主题长度限制
        if (processedData.subject && processedData.subject.length > CONFIG.MAX_SUBJECT_LENGTH) {
            processedData.subject = processedData.subject.substring(0, CONFIG.MAX_SUBJECT_LENGTH);
            console.warn(`主题长度已截取至${CONFIG.MAX_SUBJECT_LENGTH}个字符`);
        }
        
        // 处理发件人格式
        if (processedData.from && processedData.from.length > CONFIG.MAX_FROM_LENGTH) {
            processedData.from = processedData.from.substring(0, CONFIG.MAX_FROM_LENGTH);
            console.warn(`发件人长度已截取至${CONFIG.MAX_FROM_LENGTH}个字符`);
        }
        
        // 处理HTML内容
        if (processedData.html) {
            processedData.html = this.sanitizeHtmlContent(processedData.html);
        }
        
        return processedData;
    },
    
    /**
     * 净化HTML内容，提高与Worker的兼容性
     * @param {string} html - 原始HTML内容
     * @returns {string} - 处理后的HTML内容
     */
    sanitizeHtmlContent(html) {
        // 基本的HTML内容清理，确保与Worker兼容
        try {
            // 简单实现：移除可能导致问题的script标签
            let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            
            // 移除样式表，替换为内联样式（可选，取决于需求）
            // sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
            
            // 确保图片使用https资源
            sanitized = sanitized.replace(/(<img[^>]+src=["'])http:\/\//gi, '$1https://');
            
            // 更多清理逻辑可根据需要添加...
            
            return sanitized;
        } catch (error) {
            console.error('HTML内容清理出错:', error);
            // 如果处理出错，返回原内容
            return html;
        }
    },
    
    /**
     * 处理大型内容，如果需要可进行压缩或分块
     * @param {string} content - 原始内容
     * @param {string} type - 内容类型 ('html' 或 'text')
     * @returns {string} - 处理后的内容
     */
    handleLargeContent(content, type) {
        if (!content) return content;
        
        const contentSize = new Blob([content]).size;
        console.log(`${type}内容大小: ${Math.round(contentSize/1024)}KB`);
        
        // 如果是HTML内容且超过最大大小，进行处理
        if (type === 'html' && contentSize > CONFIG.MAX_HTML_SIZE) {
            // 这里可以实现压缩或其他处理逻辑
            // 当前简单实现：移除注释，压缩空白等
            let processed = content
                .replace(/<!--[\s\S]*?-->/g, '') // 移除HTML注释
                .replace(/\s{2,}/g, ' ');        // 压缩多余空白
            
            const newSize = new Blob([processed]).size;
            console.log(`处理后${type}内容大小: ${Math.round(newSize/1024)}KB`);
            
            return processed;
        }
        
        return content;
    },
    
    /**
     * 智能重试机制，带指数退避
     * @param {Function} requestFn - 请求函数，返回Promise
     * @param {Object} options - 重试选项
     * @returns {Promise} - 请求结果Promise
     */
    async retryWithBackoff(requestFn, options = {}) {
        const maxRetries = options.maxRetries || CONFIG.MAX_RETRIES;
        const initialDelay = options.initialDelay || CONFIG.RETRY_DELAY;
        
        let retries = 0;
        let lastError = null;
        
        // 添加超时支持
        const timeoutPromise = (ms) => new Promise((_, reject) => 
            setTimeout(() => reject(new Error('请求超时')), ms));
            
        while (retries <= maxRetries) {
            try {
                // 使用Promise.race实现超时
                return await Promise.race([
                    requestFn(),
                    timeoutPromise(CONFIG.REQUEST_TIMEOUT)
                ]);
            } catch (error) {
                lastError = error;
                
                // 判断是否是可重试的错误
                if (!this.isRetryableError(error) || retries >= maxRetries) {
                    break;
                }
                
                // 计算指数退避时间
                const delay = initialDelay * Math.pow(2, retries);
                console.log(`请求失败，${delay}毫秒后重试 (${retries + 1}/${maxRetries})`, error);
                
                // 等待退避时间
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // 增加重试计数
                retries++;
            }
        }
        
        // 如果所有重试都失败，抛出最后一个错误
        throw lastError;
    },
    
    /**
     * 判断错误是否可重试
     * @param {Error} error - 错误对象
     * @returns {boolean} - 是否可重试
     */
    isRetryableError(error) {
        // 网络错误通常可以重试
        if (error instanceof TypeError && error.message.includes('网络')) {
            return true;
        }
        
        // 请求超时可以重试
        if (error.message.includes('超时')) {
            return true;
        }
        
        // 服务器错误(5xx)可以重试
        if (error.status >= 500 && error.status < 600) {
            return true;
        }
        
        // 特定API错误可以重试，例如速率限制
        if (error.message && (
            error.message.includes('速率限制') || 
            error.message.includes('请求过多') ||
            error.message.includes('服务暂时不可用')
        )) {
            return true;
        }
        
        // 其他错误通常不重试
        return false;
    },
    
    /**
     * 详细解析API错误响应
     * @param {Object} response - 响应对象
     * @returns {Object} - 解析后的错误信息
     */
    async parseErrorResponse(response) {
        try {
            const error = {
                status: response.status,
                statusText: response.statusText,
                details: null
            };
            
            // 尝试解析JSON响应
            if (response.headers.get('Content-Type')?.includes('application/json')) {
                const data = await response.json();
                error.details = data;
                
                // 提取错误信息
                if (data.error) {
                    error.message = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                } else if (data.message) {
                    error.message = data.message;
                } else if (data.details) {
                    error.message = data.details;
                }
            } else {
                // 尝试解析文本响应
                const text = await response.text();
                error.details = text;
                error.message = `HTTP错误 ${response.status}: ${text}`;
            }
            
            return error;
        } catch (e) {
            // 如果解析失败，返回基本错误信息
            return {
                status: response.status,
                statusText: response.statusText,
                message: `HTTP错误 ${response.status}`,
                details: null
            };
        }
    },
    
    /**
     * 发送邮件（通过批量API）
     * @param {Object} emailData - 邮件数据对象
     * @returns {Promise<Object>} - 包含结果的Promise
     */
    async sendEmail(emailData) {
        try {
            // 显示加载状态
            UIState.setLoading(true);
            
            // 获取API设置
            const apiSettings = this.getApiSettings();
            if (!apiSettings || !apiSettings.apiKey) {
                throw new Error('未设置API密钥，请在设置页面配置您的Resend API Key');
            }
            
            // 验证邮件请求数据
            const validationResult = this.validateEmailRequest(emailData);
            if (!validationResult.isValid) {
                throw new Error('邮件数据验证失败: ' + validationResult.errors.join(', '));
            }
            
            // 如果有警告，记录日志
            if (validationResult.warnings.length > 0) {
                console.warn('邮件数据警告:', validationResult.warnings);
            }
            
            // 预处理邮件数据
            const processedData = this.preprocessEmailRequest(emailData, validationResult);
            
            // 准备发件人地址
            let from = processedData.from;
            if (!from) {
                from = '系统通知';
            }
            
            // 如果设置了域名并且发件人中没有包含邮箱地址，则添加默认邮箱
            if (apiSettings.domain && !from.includes('@') && !from.includes('<')) {
                from = `${from} <noreply@${apiSettings.domain}>`;
            } else if (!from.includes('@') && !from.includes('<')) {
                // 如果没有设置域名，使用一个默认值（实际上API会拒绝这种请求）
                from = `${from} <noreply@example.com>`;
            }
            
            // 应用随机前缀（如果设置启用）
            from = this.applyRandomPrefix(from);
            
            // 处理大型HTML内容
            const processedHtml = processedData.html ? 
                this.handleLargeContent(processedData.html, 'html') : undefined;
            
            // 准备API请求数据 - 转为批量请求格式（数组包含单个邮件）
            const batchRequest = [{
                from: from,
                to: processedData.to,
                subject: processedData.subject,
                html: processedHtml || undefined,
                text: processedData.text || undefined
            }];
            
            console.log('发送邮件请求 (通过批量API):', batchRequest);
            
            // 使用重试机制发送API请求
            const makeRequest = async () => {
                const response = await fetch(`${API_BASE_URL}/api/emails/batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings.apiKey}`
                    },
                    body: JSON.stringify(batchRequest)
                });
                
                // 检查HTTP状态
                if (!response.ok) {
                    const error = await this.parseErrorResponse(response);
                    throw new Error(error.message || `请求失败，HTTP状态码: ${response.status}`);
                }
                
                // 解析响应
                return await response.json();
            };
            
            // 使用重试机制发送请求
            const result = await this.retryWithBackoff(makeRequest);
            
            // API返回错误
            if (!result.success) {
                // 检查是否是超出限制的错误，如果是，则切换到下一个账号重试
                if (
                    result.error === '速率限制' || 
                    result.error === '月度配额超限' ||
                    (result.details && (
                        result.details.includes('速率限制') || 
                        result.details.includes('配额') || 
                        result.details.includes('切换到其他账号')
                    ))
                ) {
                    console.warn('当前账号达到限制，尝试切换到下一个账号:', result.details);
                    this.setNextActiveAccount();
                    
                    // 使用新的活跃账号重试一次
                    const newApiSettings = this.getApiSettings();
                    if (newApiSettings && newApiSettings.apiKey && newApiSettings.apiKey !== apiSettings.apiKey) {
                        console.log('使用新账号重试发送邮件');
                        UIState.setLoading(false); // 先重置加载状态
                        return this.sendEmail(processedData); // 重试时使用处理后的数据
                    }
                }
                
                throw new Error(result.details || result.error || '邮件发送失败');
            }
            
            // 批量发送API会返回一个数组，我们只需要第一个结果
            const emailResult = Array.isArray(result.data) && result.data.length > 0 ? 
                result.data[0] : { id: `msg_${Date.now()}` };
                
            // 隐藏加载状态
            UIState.setLoading(false);
            
            return { success: true, data: emailResult };
        } catch (error) {
            // 隐藏加载状态
            UIState.setLoading(false);
            
            console.error('发送邮件时出错:', error);
            
            // 重新抛出，保留原始错误信息
            throw error;
        }
    },
    
    /**
     * 生成带有随机前缀的发件人邮箱地址
     * @param {string} from - 原始发件人地址
     * @returns {string} - 处理后的发件人地址
     */
    applyRandomPrefix(from) {
        try {
            // 检查设置中是否启用了随机前缀
            const settings = JSON.parse(localStorage.getItem('emailSettings') || '{}');
            if (!settings.enableRandomPrefix) {
                console.log('随机前缀功能未启用，使用原始发件人地址:', from);
                return from; // 如果未启用，直接返回原始地址
            }
            
            console.log('应用随机前缀，原始发件人地址:', from);
            
            // 生成随机字符串
            const randomChars = Math.random().toString(36).substring(2, 8);
            
            // 处理不同形式的发件人地址
            // 情况1: "名称 <email@domain.com>" 形式
            const nameEmailRegex = /^(.+)\s+<([^>]+)>$/;
            const nameEmailMatch = from.match(nameEmailRegex);
            
            if (nameEmailMatch) {
                const name = nameEmailMatch[1];
                const email = nameEmailMatch[2];
                // 分离邮箱的用户名和域名部分
                const [username, domain] = email.split('@');
                // 构造新的邮箱地址
                const newFrom = `${name} <random-${randomChars}-${username}@${domain}>`;
                console.log('应用随机前缀后的地址(情况1):', newFrom);
                return newFrom;
            }
            
            // 情况2: 纯邮箱地址 "email@domain.com" 形式
            if (from.includes('@') && !from.includes('<')) {
                const [username, domain] = from.split('@');
                const newFrom = `random-${randomChars}-${username}@${domain}`;
                console.log('应用随机前缀后的地址(情况2):', newFrom);
                return newFrom;
            }
            
            // 情况3: 其他情况，无法处理，返回原始地址
            console.log('无法应用随机前缀，使用原始地址:', from);
            return from;
        } catch (error) {
            console.error('应用随机前缀时出错:', error);
            return from; // 出错时返回原始地址
        }
    },
    
    /**
     * 解析和格式化收件人列表
     * @param {string} recipientsStr - 收件人字符串，可能包含多种分隔符
     * @returns {Array} - 格式化后的收件人列表
     */
    parseRecipients(recipientsStr) {
        if (!recipientsStr) return [];
        
        // 替换多种分隔符为统一的逗号，支持的分隔符：逗号、分号、空格、换行
        const normalized = recipientsStr
            .replace(/[\n;]/g, ',') // 替换换行和分号为逗号
            .replace(/\s+,/g, ',')  // 去除逗号前的空格
            .replace(/,\s+/g, ','); // 去除逗号后的空格
        
        // 分割字符串并去除空项
        const recipients = normalized.split(',')
            .map(item => item.trim())
            .filter(item => item);
        
        // 去重
        return [...new Set(recipients)];
    },
    
    /**
     * 智能发送邮件 - 自动选择单账号或多账号模式
     * @param {Object} emailData - 邮件数据对象
     * @param {Object} options - 发送选项
     * @returns {Promise<Object>} - 发送结果
     */
    async smartSendEmail(emailData, options = {}) {
        try {
            // 获取所有可用账号
            const accounts = this.getAllAccounts();
            const accountCount = accounts.length;
            
            // 获取收件人数量
            let recipientCount = 0;
            if (typeof emailData.to === 'string') {
                recipientCount = this.parseRecipients(emailData.to).length;
            } else if (Array.isArray(emailData.to)) {
                recipientCount = emailData.to.length;
            } else if (emailData.to) {
                recipientCount = 1;
            }
            
            console.log(`[smartSendEmail] 检测到${accountCount}个账号，${recipientCount}个收件人`);
            
            // 决定使用哪种发送方式
            // 情况1: 无可用账号 - 抛出错误
            if (accountCount === 0) {
                throw new Error('未配置任何Resend账号，请先在设置页面添加账号');
            }
            
            // 情况2: 单个账号且收件人数量较少 - 使用单账号发送
            if (accountCount === 1 && recipientCount <= 10) {
                console.log('[smartSendEmail] 使用单账号发送模式');
                return await this.sendEmail(emailData);
            }
            
            // 情况3: 多个账号或收件人数量多 - 使用多账号批量发送
            console.log('[smartSendEmail] 使用多账号智能发送模式');
            
            const {
                batchSize = 50,
                rateLimit = 10,
                enableRandomPrefix = true
            } = options;
            
            return await this.sendMultiAccountBatchEmails([emailData], {
                batchSize,
                rateLimit,
                enableRandomPrefix
            });
        } catch (error) {
            console.error('[smartSendEmail] 发送失败:', error);
            throw error;
        }
    },
    
    /**
     * 批量发送邮件
     * @param {Array} emailsData - 邮件数据数组
     * @returns {Promise} - 发送结果的Promise
     */
    async sendBatchEmails(emailsData) {
        try {
            // 检查数组类型
            if (!emailsData || !Array.isArray(emailsData)) {
                throw new Error('批量发送邮件的数据必须是数组');
            }
            
            // 检查数组长度
            if (emailsData.length === 0) {
                throw new Error('批量发送邮件的数据不能为空');
            }
            
            // 获取API设置
            const apiSettings = this.getApiSettings();
            if (!apiSettings || !apiSettings.apiKey) {
                throw new Error('未配置API密钥');
            }
            
            // 设置加载状态
            if (window.UIState) window.UIState.setLoading(true);
            
            // 处理每个邮件的发件人信息和内容，确保每封邮件只有一个收件人
            let processedEmails = [];
            
            // 遍历原始邮件数据
            emailsData.forEach((emailData, index) => {
                console.log(`[EmailService.sendBatchEmails] Processing item ${index}:`, JSON.stringify(emailData));
                
                // 确保每个邮件数据都是对象
                if (!emailData || typeof emailData !== 'object') {
                    throw new Error(`第${index+1}个邮件格式无效`);
                }

                // 准备发件人地址
                let from = emailData.from;
                if (!from) {
                    from = '系统通知';
                }
                
                // 如果设置了域名并且发件人中没有包含邮箱地址，则添加默认邮箱
                if (apiSettings.domain && !from.includes('@') && !from.includes('<')) {
                    from = `${from} <noreply@${apiSettings.domain}>`;
                } else if (!from.includes('@') && !from.includes('<')) {
                    // 如果没有设置域名，使用一个默认值（实际上API会拒绝这种请求）
                    from = `${from} <noreply@example.com>`;
                }
                
                // 应用随机前缀（如果设置启用）
                from = this.applyRandomPrefix(from);
                
                // 处理HTML内容
                const processedHtml = emailData.html ? 
                    this.handleLargeContent(emailData.html, 'html') : undefined;
                
                // 处理收件人 - 确保每个收件人都是单独的邮件对象
                let recipients = [];
                
                // 规范化收件人为数组
                if (typeof emailData.to === 'string') {
                    // 如果是字符串，直接添加为单个元素数组
                    recipients = [emailData.to.trim()];
                } else if (Array.isArray(emailData.to)) {
                    // 如果是数组，过滤空值并去重
                    recipients = [...new Set(emailData.to.filter(r => r && r.trim()).map(r => r.trim()))];
                } else if (emailData.to) {
                    // 如果是其他类型但非空，转为字符串
                    recipients = [String(emailData.to).trim()];
                } else {
                    // 如果为空，抛出错误
                    throw new Error(`第${index+1}个邮件没有有效的收件人`);
                }
                
                // 如果没有收件人，跳过这封邮件
                if (recipients.length === 0) {
                    console.warn(`跳过第${index+1}个邮件，因为没有有效的收件人`);
                    return; // continue到下一个循环
                }
                
                // 为每个收件人创建单独的邮件对象
                recipients.forEach(recipient => {
                    processedEmails.push({
                        from: from,
                        to: recipient, // 单个收件人
                        subject: emailData.subject || '无主题',
                        html: processedHtml || undefined,
                        text: emailData.text || undefined
                    });
                });
            });
            
            // 检查批量发送限制
            if (processedEmails.length > 100) {
                console.warn(`拆分后的邮件数量(${processedEmails.length})超过批量发送上限(100)，将自动截取前100个`);
                processedEmails = processedEmails.slice(0, 100);
            }
            
            console.log(`准备发送批量邮件批次，共${processedEmails.length}封邮件`);
            
            // 使用重试机制发送API请求
            const makeRequest = async () => {
                const response = await fetch(`${API_BASE_URL}/api/emails/batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings.apiKey}`
                    },
                    body: JSON.stringify(processedEmails)
                });
                
                // 检查HTTP状态
                if (!response.ok) {
                    const error = await this.parseErrorResponse(response);
                    throw new Error(error.message || `请求失败，HTTP状态码: ${response.status}`);
                }
                
                // 解析响应
                return await response.json();
            };
            
            // 使用重试机制发送请求
            const result = await this.retryWithBackoff(makeRequest);
            
            // API返回错误
            if (!result.success) {
                // 检查是否是超出限制的错误，如果是，则切换到下一个账号重试
                if (
                    result.error === '速率限制' || 
                    result.error === '月度配额超限' ||
                    (result.details && (
                        result.details.includes('速率限制') || 
                        result.details.includes('配额') || 
                        result.details.includes('切换到其他账号')
                    ))
                ) {
                    console.warn('当前账号达到限制，尝试切换到下一个账号:', result.details);
                    this.setNextActiveAccount();
                    
                    // 使用新的活跃账号重试一次
                    const newApiSettings = this.getApiSettings();
                    if (newApiSettings && newApiSettings.apiKey && newApiSettings.apiKey !== apiSettings.apiKey) {
                        console.log('使用新账号重试发送批量邮件');
                        UIState.setLoading(false); // 先重置加载状态
                        return this.sendBatchEmails(emailsData); // 重试
                    }
                }
                
                throw new Error(result.details || result.error || '批量邮件发送失败');
            }
            
            // 保存到历史记录
            if (Array.isArray(result.data)) {
                // 将每封邮件的结果存入历史记录
                for (let i = 0; i < result.data.length && i < processedEmails.length; i++) {
                    const emailResult = result.data[i];
                    const processedEmail = processedEmails[i];
                    
                    // 存储到历史记录
                    const messageId = emailResult.id || `msg_batch_${Date.now()}_${i}`;
                    this.saveEmailToHistory({
                        ...processedEmail, // 包含处理后的发件人等信息
                        id: messageId,
                        sentAt: new Date().toISOString(),
                        status: 'sent',
                        result: emailResult
                    });
                }
            }
            
            // 隐藏加载状态
            UIState.setLoading(false);
            
            // 返回成功结果，包含消息ID列表
            return { 
                success: true, 
                data: result.data,
                ids: result.data ? result.data.map(item => item.id) : []
            };
        } catch (error) {
            // 隐藏加载状态
            UIState.setLoading(false);
            
            console.error('发送批量邮件时出错:', error);
            
            // 记录失败
            emailsData.forEach((emailData, index) => {
                this.saveEmailToHistory({
                    ...emailData,
                    id: `failed_batch_${Date.now()}_${index}`,
                    sentAt: new Date().toISOString(),
                    status: 'failed',
                    error: error.message,
                    errorDetails: error.stack || null
                });
            });
            
            // 返回错误
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    /**
     * 获取所有已配置的账号列表
     * @returns {Array} - 包含所有已配置账号的数组
     */
    getAllAccounts() {
        try {
            // 从本地存储获取账号信息
            const accounts = JSON.parse(localStorage.getItem('resendAccounts') || '[]');
            return accounts;
        } catch (error) {
            console.error('获取所有账号时出错:', error);
            return [];
        }
    },
    
    /**
     * 使用多账号批量发送邮件
     * 智能分配邮件到多个账号，处理配额和速率限制
     * @param {Array} emailsData - 邮件数据数组
     * @param {Object} options - 发送选项
     * @returns {Promise} - 发送结果的Promise
     */
    async sendMultiAccountBatchEmails(emailsData, options = {}) {
        try {
            // 检查数组类型
            if (!emailsData || !Array.isArray(emailsData)) {
                throw new Error('批量发送邮件的数据必须是数组');
            }
            
            // 检查数组长度
            if (emailsData.length === 0) {
                throw new Error('批量发送邮件的数据不能为空');
            }
            
            // 获取所有可用账号
            const allAccounts = this.getAllAccounts();
            if (!allAccounts || allAccounts.length === 0) {
                throw new Error('未配置任何账号，请先添加Resend API账号');
            }
            
            console.log(`[EmailService.sendMultiAccountBatchEmails] 准备使用${allAccounts.length}个账号发送${emailsData.length}封邮件`);
            
            // 设置加载状态
            if (window.UIState) window.UIState.setLoading(true);
            
            // 处理选项参数
            const {
                batchSize = 50,               // 每批次最大发送数量
                rateLimit = 10,               // 每分钟最大发送邮件数
                enableRandomPrefix = true,    // 是否启用随机前缀
                preferredDomain = null,       // 首选发件人域名
                timeout = 60000,              // 请求超时时间(毫秒)
                enableParallel = true         // 是否启用并行发送
            } = options;
            
            // 处理每个邮件的发件人信息和内容
            let processedEmails = [];
            
            // 遍历原始邮件数据
            emailsData.forEach((emailData, index) => {
                console.log(`[EmailService.sendMultiAccountBatchEmails] 处理第${index+1}封邮件`);
                
                // 确保每个邮件数据都是对象
                if (!emailData || typeof emailData !== 'object') {
                    throw new Error(`第${index+1}个邮件格式无效`);
                }

                // 准备发件人地址
                let from = emailData.from;
                if (!from) {
                    from = '系统通知';
                }
                
                // 处理发件人地址
                if (preferredDomain && !from.includes('@') && !from.includes('<')) {
                    from = `${from} <noreply@${preferredDomain}>`;
                } else if (!from.includes('@') && !from.includes('<')) {
                    // 如果没有首选域名，使用第一个账号的域名（如果有）
                    const firstAccountWithDomain = allAccounts.find(acc => acc.domain);
                    if (firstAccountWithDomain && firstAccountWithDomain.domain) {
                        from = `${from} <noreply@${firstAccountWithDomain.domain}>`;
                    } else {
                        // 如果所有账号都没有域名，使用一个默认值
                        from = `${from} <noreply@example.com>`;
                    }
                }
                
                // 应用随机前缀（如果启用）
                if (enableRandomPrefix) {
                    from = this.applyRandomPrefix(from);
                }
                
                // 处理HTML内容
                const processedHtml = emailData.html ? 
                    this.handleLargeContent(emailData.html, 'html') : undefined;
                
                // 处理收件人 - 准备单独的邮件对象
                let recipients = [];
                
                // 规范化收件人为数组
                if (typeof emailData.to === 'string') {
                    // 如果是字符串，进行解析
                    recipients = this.parseRecipients(emailData.to);
                } else if (Array.isArray(emailData.to)) {
                    // 如果是数组，过滤空值并去重
                    recipients = [...new Set(emailData.to.filter(r => r && r.trim()).map(r => r.trim()))];
                } else if (emailData.to) {
                    // 如果是其他类型但非空，转为字符串
                    recipients = [String(emailData.to).trim()];
                } else {
                    // 如果为空，跳过
                    console.warn(`跳过第${index+1}个邮件，因为没有有效的收件人`);
                    return; // continue到下一个循环
                }
                
                // 处理抄送和密送收件人
                const cc = emailData.cc ? (Array.isArray(emailData.cc) ? emailData.cc : this.parseRecipients(emailData.cc)) : [];
                const bcc = emailData.bcc ? (Array.isArray(emailData.bcc) ? emailData.bcc : this.parseRecipients(emailData.bcc)) : [];
                
                // 为每个收件人创建单独的邮件对象
                recipients.forEach(recipient => {
                    processedEmails.push({
                        from: from,
                        to: recipient, // 单个收件人
                        cc: cc,
                        bcc: bcc,
                        subject: emailData.subject || '无主题',
                        html: processedHtml || undefined,
                        text: emailData.text || undefined,
                        replyTo: emailData.replyTo || undefined,
                        attachments: emailData.attachments || undefined
                    });
                });
            });
            
            console.log(`[EmailService.sendMultiAccountBatchEmails] 拆分后共有${processedEmails.length}封邮件`);
            
            // 准备提交到worker的数据
            const multiAccountData = {
                emails: processedEmails,
                accounts: allAccounts.map(account => ({
                    apiKey: account.apiKey,
                    domain: account.domain,
                    name: account.name || '未命名账号',
                    weight: account.weight || 1,  // 使用权重，默认为1
                    monthlyQuota: account.monthlyQuota || 3000,  // 使用月度配额，默认为3000
                    dailyQuota: account.dailyQuota || 300,       // 使用日配额，默认为300
                    minuteQuota: account.minuteQuota || 10       // 使用分钟配额，默认为10
                })),
                batchSize,
                rateLimit,
                enableParallel
            };
            
            // 使用重试机制发送API请求
            const makeRequest = async () => {
                // 创建AbortController用于超时控制
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                try {
                    const response = await fetch(`${API_BASE_URL}/api/emails/multi-account-batch`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(multiAccountData),
                        signal: controller.signal
                    });
                    
                    // 清除超时
                    clearTimeout(timeoutId);
                    
                    // 检查HTTP状态
                    if (!response.ok) {
                        const error = await this.parseErrorResponse(response);
                        throw new Error(error.message || `请求失败，HTTP状态码: ${response.status}`);
                    }
                    
                    // 解析响应
                    return await response.json();
                } catch (error) {
                    // 检查是否是超时错误
                    if (error.name === 'AbortError') {
                        throw new Error('请求超时，请检查网络连接或稍后重试');
                    }
                    throw error;
                } finally {
                    clearTimeout(timeoutId);
                }
            };
            
            // 使用重试机制发送请求
            const result = await this.retryWithBackoff(makeRequest, {
                maxRetries: 2,
                initialDelay: 2000
            });
            
            // API返回错误
            if (!result.success) {
                throw new Error(result.error || '邮件发送失败');
            }
            
            // 保存到历史记录
            if (result.results && Array.isArray(result.results)) {
                // 提取所有成功发送的邮件ID
                const sentEmailIds = [];
                result.results.forEach(batchResult => {
                    if (batchResult.data && Array.isArray(batchResult.data.ids)) {
                        sentEmailIds.push(...batchResult.data.ids);
                    }
                });
                
                // 将发送结果存入历史记录
                const now = new Date().toISOString();
                for (let i = 0; i < Math.min(processedEmails.length, sentEmailIds.length); i++) {
                    const email = processedEmails[i];
                    const messageId = sentEmailIds[i] || `msg_${Date.now()}_${i}`;
                    
                    this.saveEmailToHistory({
                        ...email,
                        id: messageId,
                        sentAt: now,
                        status: 'sent',
                        multiAccount: true
                    });
                }
            }
            
            // 隐藏加载状态
            if (window.UIState) window.UIState.setLoading(false);
            
            // 返回成功结果
            return { 
                success: true, 
                totalSent: result.successfulBatches || 0,
                totalFailed: result.failedBatches || 0,
                totalEmails: result.totalEmails || 0,
                details: result
            };
        } catch (error) {
            // 隐藏加载状态
            if (window.UIState) window.UIState.setLoading(false);
            
            console.error('多账号批量发送邮件时出错:', error);
            
            // 记录失败
            const errorMessage = error.message || '未知错误';
            const now = new Date().toISOString();
            
            emailsData.forEach((emailData, index) => {
                this.saveEmailToHistory({
                    ...emailData,
                    id: `failed_multi_${Date.now()}_${index}`,
                    sentAt: now,
                    status: 'failed',
                    error: errorMessage,
                    errorDetails: error.stack || null,
                    multiAccount: true
                });
            });
            
            // 返回错误
            return {
                success: false,
                error: errorMessage,
                errorDetails: error.stack
            };
        }
    }
}; 
