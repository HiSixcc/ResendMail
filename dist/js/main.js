/**
 * ResendMail 智能群发邮件系统 - 主脚本
 * 处理主界面逻辑、导航和全局功能
 */

// ResendMail 智能群发邮件系统版本信息
const APP_VERSION = "1.5.0";

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('ResendMail应用初始化...');
    
    // 清除旧的历史记录数据
    try {
        localStorage.removeItem('emailHistory');
        console.log('已清除旧的历史记录数据');
    } catch (e) {
        console.error('清除历史记录数据时出错:', e);
    }
    
    // 初始化事件监听器
    initEventListeners();
    
    // 初始化全局对象
    initGlobalObjects();
    
    // 添加调试工具
    initDebugTools();
});

/**
 * 初始化全局对象
 */
function initGlobalObjects() {
    // 全局UI状态
    window.UIState = {
        isLoading: false,
        currentPage: 'home',
        
        // 设置加载状态
        setLoading(state) {
            this.isLoading = state;
            const loadingElement = document.getElementById('loading');
            
            if (loadingElement) {
                loadingElement.style.display = state ? 'flex' : 'none';
            }
        },
        
        // 更新当前页面状态
        setCurrentPage(pageName) {
            this.currentPage = pageName;
            
            // 更新导航栏状态
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            
            const activeLink = document.querySelector(`.nav-link[data-page="${pageName}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }
        }
    };
    
    // 页面加载完成回调函数，用于iframe通信
    window.pageLoaded = function(page) {
        console.log(`iframe页面已加载: ${page}`);
    };
    
    // 邮件服务API基础URL
    const API_BASE_URL = 'https://api-mail.ohi.cc';
    
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
         * 智能发送邮件 - 自动判断使用单独发送或批量发送
         * @param {Object|Array} emailData - 单个邮件数据对象或邮件数据数组
         * @returns {Promise} - 发送结果的Promise
         */
        async sendMail(emailData) {
            console.log('调用sendMail方法:', emailData);
            
            // 检查输入是否为数组
            if (Array.isArray(emailData)) {
                // 如果是空数组
                if (emailData.length === 0) {
                    console.error('邮件数据为空数组');
                    return {
                        success: false,
                        error: '邮件数据为空'
                    };
                }
                
                console.log(`检测到邮件数组(${emailData.length}个)，使用批量发送模式`);
                
                // 增强每个邮件的HTML内容，确保是完整的HTML文档
                try {
                    const processedEmailData = await Promise.all(
                        emailData.map(async (email) => {
                            // 如果有workers.js中定义的enhanceEmailContent函数，则使用它
                            if (typeof enhanceEmailContent === 'function') {
                                return await enhanceEmailContent(email);
                            }
                            // 否则原样返回
                            return email;
                        })
                    );
                    return this.sendBatchEmails(processedEmailData);
                } catch (error) {
                    console.warn('增强邮件HTML内容时出错，使用原始内容:', error);
                    return this.sendBatchEmails(emailData);
                }
            } else if (emailData && typeof emailData === 'object') {
                // 单个对象也转为数组，使用批量发送
                console.log('检测到单个邮件对象，转为数组使用批量发送模式');
                
                // 增强邮件的HTML内容，确保是完整的HTML文档
                try {
                    let processedEmail = emailData;
                    // 如果有workers.js中定义的enhanceEmailContent函数，则使用它
                    if (typeof enhanceEmailContent === 'function') {
                        processedEmail = await enhanceEmailContent(emailData);
                    }
                    return this.sendBatchEmails([processedEmail]);
                } catch (error) {
                    console.warn('增强邮件HTML内容时出错，使用原始内容:', error);
                    return this.sendBatchEmails([emailData]);
                }
            } else {
                // 无效输入
                console.error('无效的邮件数据格式:', emailData);
                return {
                    success: false,
                    error: '无效的邮件数据格式'
                };
            }
        },
        
        /**
         * 发送邮件
         * @param {Object} emailData - 邮件数据
         * @returns {Promise} - 发送结果的Promise
         */
        async sendEmail(emailData) {
            console.log('[EmailService.sendEmail] Received emailData:', JSON.stringify(emailData));
            console.log('[EmailService.sendEmail] emailData.from Value:', emailData ? emailData.from : 'emailData is null/undefined');
            console.log('[EmailService.sendEmail] emailData.from Type:', emailData ? typeof emailData.from : 'emailData is null/undefined');
            console.log('开始发送单个邮件:', emailData);
            try {
                // 安全检查确保emailData是一个有效对象
                if (!emailData || typeof emailData !== 'object') {
                    throw new Error('无效的邮件数据：需要一个对象');
                }

                // 如果to不是数组，创建一个数组
                if (!Array.isArray(emailData.to)) {
                    // 这段逻辑可能需要调整，因为我们下面会强制只取第一个
                    // throw new Error('收件人格式错误：应为字符串或数组'); 
                }

                let finalTo = [];
                if (Array.isArray(emailData.to) && emailData.to.length > 0) {
                    finalTo = [emailData.to[0]]; // 只取第一个
                    if (emailData.to.length > 1) {
                        console.warn('[EmailService.sendEmail] Multiple "to" addresses provided in single email mode. Sending only to the first address:', finalTo[0]);
                        // Optionally, you could use window.parent.showNotification to inform the user
                    }
                } else if (typeof emailData.to === 'string' && emailData.to.trim() !== '') { 
                    finalTo = [emailData.to.trim()];
                } else {
                    // 如果经过前面的检查，to 仍然无效或为空，则抛出错误
                    console.error('[EmailService.sendEmail] Invalid or empty "to" field after initial checks.', emailData.to);
                    throw new Error('无效或空的收件人地址。');
                }

                // 获取API设置
                const apiSettings = this.getApiSettings();
                if (!apiSettings || !apiSettings.apiKey) {
                    console.error('未配置API密钥');
                    throw new Error('未配置API密钥');
                }
                
                // 设置加载状态
                if (window.UIState) window.UIState.setLoading(true);
                
                // 准备请求数据 - 创建一个新对象而不是修改原始对象
                const requestData = {
                    to: finalTo,
                    subject: emailData.subject || '无主题',
                    html: emailData.html || '<p>无内容</p>',
                    text: emailData.text || this.convertHtmlToText(emailData.html || '<p>无内容</p>')
                };
                
                // 安全地处理发件人信息
                let fromName = '系统通知'; // 默认发件人名称
                if (emailData.from) {
                    // 检查是否已经是完整的邮件地址格式
                    if (emailData.from && typeof emailData.from === 'string' && emailData.from.includes('@')) {
                        requestData.from = emailData.from;
                    } else {
                        fromName = emailData.from;
                    }
                }
                
                // 从API设置中获取发件人域名并构建发件人地址
                if (apiSettings.domain && !requestData.from) {
                    // 使用生成的自然用户名替代固定的noreply前缀
                    const defaultUsername = this.generateNaturalUsername();
                    requestData.from = `${fromName} <${defaultUsername}@${apiSettings.domain}>`;
                } else if (!requestData.from) {
                    throw new Error('缺少发件人域名配置，请在设置中配置域名');
                }
                
                // 应用随机前缀
                requestData.from = this.applyRandomPrefix(requestData.from);
                
                console.log('准备发送请求:', requestData);
                
                // 发送请求 - 使用/email端点
                const response = await fetch(`${API_BASE_URL}/email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings.apiKey}`
                    },
                    body: JSON.stringify(requestData)
                });
                
                // 解析响应
                const result = await response.json();
                console.log('服务器响应:', result);
                
                // 检查响应状态
                if (!response.ok) {
                    console.error('服务器返回错误:', response.status, result);
                    throw new Error(result.message || '发送邮件失败');
                }
                
                console.log('邮件发送成功.');
                return {
                    success: true,
                    data: result
                };
            } catch (error) {
                console.error('发送邮件时出错:', error);
                return {
                    success: false,
                    error: error.message
                };
            } finally {
                // 重置加载状态
                if (window.UIState) window.UIState.setLoading(false);
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
                
                if (emailsData.length > 100) {
                    throw new Error('单次批量发送最多支持100封邮件');
                }

                // 获取API设置
                const apiSettings = this.getApiSettings();
                if (!apiSettings || !apiSettings.apiKey) {
                    throw new Error('未配置API密钥');
                }
                
                // 设置加载状态
                if (window.UIState) window.UIState.setLoading(true);
                
                // 处理每个邮件的发件人信息
                const processedEmails = emailsData.map((emailData, index) => {
                    console.log(`[EmailService.sendBatchEmails] Processing item ${index}:`, JSON.stringify(emailData));
                    console.log(`[EmailService.sendBatchEmails] Item ${index} emailData.from Value:`, emailData ? emailData.from : 'emailData is null/undefined');
                    console.log(`[EmailService.sendBatchEmails] Item ${index} emailData.from Type:`, emailData ? typeof emailData.from : 'emailData is null/undefined');
                    // 确保每个邮件数据都是对象
                    if (!emailData || typeof emailData !== 'object') {
                        throw new Error(`第${index+1}个邮件格式无效`);
                    }
                    
                    // 确保to字段存在
                    if (!emailData.to) {
                        throw new Error(`第${index+1}个邮件缺少收件人地址`);
                    }
                    
                    // 创建新对象以确保不修改原始数据
                    const processedData = {
                        to: typeof emailData.to === 'string' ? [emailData.to] : Array.isArray(emailData.to) ? emailData.to : [String(emailData.to)],
                        subject: emailData.subject || '无主题',
                        html: emailData.html || '<p>无内容</p>'
                    };
                    
                    // 添加文本版本
                    processedData.text = emailData.text || this.convertHtmlToText(processedData.html);
                    
                    // 处理发件人信息
                    let fromName = '系统通知'; // 默认发件人名称
                    if (emailData.from) {
                        // 检查是否已经是完整的邮件地址格式
                        if (emailData.from && typeof emailData.from === 'string' && emailData.from.includes('@')) {
                            processedData.from = emailData.from;
                        } else {
                            fromName = emailData.from;
                        }
                    }
                    
                    // 从API设置中获取发件人域名并构建发件人地址
                    if (apiSettings.domain && !processedData.from) {
                        // 使用生成的自然用户名替代固定的noreply前缀
                        const defaultUsername = this.generateNaturalUsername();
                        processedData.from = `${fromName} <${defaultUsername}@${apiSettings.domain}>`;
                    } else if (!processedData.from) {
                        throw new Error('缺少发件人域名配置，请在设置中配置域名');
                    }
                    
                    // 应用随机前缀
                    processedData.from = this.applyRandomPrefix(processedData.from);
                    
                    return processedData;
                });
                
                // 发送请求
                const response = await fetch(`${API_BASE_URL}/emails/batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings.apiKey}`
                    },
                    body: JSON.stringify(processedEmails)
                });
                
                // 解析响应
                const result = await response.json();
                
                // 检查响应状态
                if (!response.ok) {
                    throw new Error(result.message || '批量发送邮件失败');
                }
                
                return {
                    success: true,
                    data: result
                };
            } catch (error) {
                console.error('批量发送邮件时出错:', error);
                return {
                    success: false,
                    error: error.message
                };
            } finally {
                // 重置加载状态
                if (window.UIState) window.UIState.setLoading(false);
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
                
                // 生成自然的用户名
                const randomUsername = this.generateNaturalUsername();
                
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
                    const newFrom = `${name} <${randomUsername}@${domain}>`;
                    console.log('应用随机前缀后的地址(情况1):', newFrom);
                    return newFrom;
                }
                
                // 情况2: 纯邮箱地址 "email@domain.com" 形式
                if (from.includes('@') && !from.includes('<')) {
                    const [username, domain] = from.split('@');
                    const newFrom = `${randomUsername}@${domain}`;
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
         * 将HTML转换为纯文本
         * @param {string} html - HTML内容
         * @returns {string} - 纯文本内容
         */
        convertHtmlToText(html) {
            // 简单的HTML转文本
            const temp = document.createElement('div');
            temp.innerHTML = html;
            return temp.textContent || temp.innerText || '';
        },
        
        /**
         * 生成自然的用户名，避免垃圾邮件检测
         * @returns {string} - 自然的用户名
         */
        generateNaturalUsername() {
            // 常见名字
            const commonNames = [
                'alex', 'sam', 'jordan', 'casey', 'taylor', 'morgan', 'jamie', 
                'riley', 'quinn', 'avery', 'blake', 'charlie', 'skyler', 'cameron',
                'jessie', 'peyton', 'kerry', 'stacy', 'shawn', 'tracy', 'lee', 
                'robin', 'jade', 'bailey', 'harper', 'kelly', 'james', 'john', 
                'mary', 'robert', 'emma', 'olivia', 'noah', 'davis', 'logan',
                'wei', 'liu', 'chen', 'zhao', 'jin', 'fang', 'ming', 'yang'
            ];
            
            // 常见单词
            const commonWords = [
                'mail', 'info', 'contact', 'support', 'service', 'help', 'admin',
                'team', 'news', 'office', 'hello', 'work', 'job', 'career', 'event', 
                'cloud', 'tech', 'market', 'sales', 'finance', 'data', 'media',
                'web', 'net', 'system', 'app', 'dev', 'soft', 'pro', 'smart',
                'active', 'direct', 'fast', 'eagle', 'lion', 'tiger', 'panda'
            ];
            
            // 常见形容词
            const adjectives = [
                'happy', 'smart', 'good', 'great', 'best', 'nice', 'cool', 
                'top', 'pro', 'quick', 'fast', 'easy', 'new', 'prime', 'simple',
                'first', 'fine', 'main', 'bold', 'bright', 'fresh'
            ];
            
            // 选择一个随机的格式模板
            const templates = [
                // 名字 + 数字 (例如 alex123)
                () => {
                    const name = this.getRandomItem(commonNames);
                    const number = Math.floor(Math.random() * 999) + 1;
                    return `${name}${number}`;
                },
                
                // 名字 + 单词 (例如 alexmail)
                () => {
                    const name = this.getRandomItem(commonNames);
                    const word = this.getRandomItem(commonWords);
                    return `${name}${word}`;
                },
                
                // 名字.单词 (例如 alex.mail)
                () => {
                    const name = this.getRandomItem(commonNames);
                    const word = this.getRandomItem(commonWords);
                    return `${name}.${word}`;
                },
                
                // 单词 + 年份 (例如 mail2023)
                () => {
                    const word = this.getRandomItem(commonWords);
                    // 生成一个合理的4位数年份 (2010-2023)
                    const year = 2010 + Math.floor(Math.random() * 14);
                    return `${word}${year}`;
                },
                
                // 形容词 + 单词 (例如 happymail)
                () => {
                    const adj = this.getRandomItem(adjectives);
                    const word = this.getRandomItem(commonWords);
                    return `${adj}${word}`;
                },
                
                // 名字 + 下划线 + 数字 (例如 alex_123)
                () => {
                    const name = this.getRandomItem(commonNames);
                    const number = Math.floor(Math.random() * 999) + 1;
                    return `${name}_${number}`;
                },
                
                // 形容词 + 名字 (例如 happyalex)
                () => {
                    const adj = this.getRandomItem(adjectives);
                    const name = this.getRandomItem(commonNames);
                    return `${adj}${name}`;
                }
            ];
            
            // 随机选择一个模板并生成用户名
            const templateFn = this.getRandomItem(templates);
            return templateFn();
        },
        
        /**
         * 从数组中获取随机项
         * @param {Array} array - 待选择的数组
         * @returns {*} - 随机选择的项
         */
        getRandomItem(array) {
            return array[Math.floor(Math.random() * array.length)];
        }
    };
    
    // 显示消息通知的全局方法
    window.showNotification = function(message, type = 'info', duration = 3000) {
        // 检查是否已有通知容器
        let notificationContainer = document.getElementById('notification-container');
        
        // 如果没有通知容器，创建一个
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.style.position = 'fixed';
            notificationContainer.style.top = '70px';
            notificationContainer.style.right = '20px';
            notificationContainer.style.zIndex = '9999';
            document.body.appendChild(notificationContainer);
        }
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = message;
        
        // 设置样式
        notification.style.padding = '12px 20px';
        notification.style.marginBottom = '10px';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-10px)';
        notification.style.transition = 'all 0.3s ease';
        
        // 只使用CSS类中定义的背景色，不再手动设置颜色
        notification.style.color = 'white';
        
        // 添加关闭按钮
        const closeButton = document.createElement('span');
        closeButton.innerHTML = '&times;';
        closeButton.style.float = 'right';
        closeButton.style.marginLeft = '15px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.fontWeight = 'bold';
        closeButton.onclick = function() {
            closeNotification();
        };
        notification.insertBefore(closeButton, notification.firstChild);
        
        // 添加通知到容器
        notificationContainer.appendChild(notification);
        
        // 显示通知 (使用setTimeout使过渡效果生效)
        setTimeout(function() {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);
        
        // 设置自动关闭
        const autoClose = setTimeout(closeNotification, duration);
        
        // 关闭通知的函数
        function closeNotification() {
            clearTimeout(autoClose);
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
            
            // 动画完成后移除元素
            setTimeout(function() {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                
                // 如果容器为空，也移除容器
                if (notificationContainer.children.length === 0) {
                    notificationContainer.parentNode.removeChild(notificationContainer);
                }
            }, 300);
        }
    };
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 在窗口大小变化时调整布局
    window.addEventListener('resize', adjustLayout);
    
    // 初始调整一次布局
    adjustLayout();
}

/**
 * 根据窗口大小调整布局
 */
function adjustLayout() {
    const isMobile = window.innerWidth <= 768;
    
    // 获取元素
    const navLinks = document.querySelector('.nav-links');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const sidebar = document.getElementById('sidebar');
    const sendFrame = document.getElementById('sendFrame');
    
    // 设置iframe高度为窗口高度减去顶部区域
    if (sendFrame) {
        const topBarHeight = document.querySelector('.navbar') ? document.querySelector('.navbar').offsetHeight : 0;
        const windowHeight = window.innerHeight;
        sendFrame.style.height = `${windowHeight - topBarHeight - 20}px`;
    }
    
    // 如果元素不存在，可能在iframe内部，直接返回
    if (!navLinks || !hamburgerMenu || !sidebar) return;
    
    // 适配移动视图
    if (isMobile) {
        navLinks.style.display = 'none';
        hamburgerMenu.style.display = 'block';
    } else {
        navLinks.style.display = 'flex';
        hamburgerMenu.style.display = 'none';
        
        // 确保侧边栏在桌面视图下关闭
        sidebar.classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // 通知每个iframe内页面的调整布局（如果有这个函数）
    try {
        if (sendFrame && sendFrame.contentWindow && sendFrame.contentWindow.adjustLayout) {
            sendFrame.contentWindow.adjustLayout(isMobile);
        }
    } catch (error) {
        console.warn('无法调用iframe内的adjustLayout方法:', error);
    }
}

/**
 * 初始化调试工具
 */
function initDebugTools() {
    // 添加全局调试工具
    window.DebugTools = {
        // 查看localStorage中的所有数据
        showLocalStorage() {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                try {
                    // 尝试解析JSON
                    data[key] = JSON.parse(localStorage.getItem(key));
                } catch (e) {
                    // 如果不是JSON，直接存储字符串
                    data[key] = localStorage.getItem(key);
                }
            }
            console.log('localStorage内容:');
            console.table(data);
            return data;
        }
    };
    
    console.log('调试工具已初始化，可使用 window.DebugTools 查看');
} 