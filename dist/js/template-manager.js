/**
 * 模板管理工具类 - 负责加载、缓存和管理HTML邮件模板
 */
class TemplateManager {
    constructor() {
        this.templates = [];
        this.initialized = false;
        this.templateCache = new Map(); // 缓存已加载的模板内容
        this.defaultTemplateId = 'full-template'; // 默认模板ID
        this.onTemplatesLoadedCallbacks = [];
    }

    /**
     * 初始化模板管理器
     * @returns {Promise<boolean>} 初始化是否成功
     */
    async initialize() {
        if (this.initialized) return true;
        
        try {
            // 加载模板索引
            const indexResponse = await fetch('/templates/index.json');
            if (!indexResponse.ok) {
                console.error('模板索引加载失败:', indexResponse.statusText);
                return false;
            }
            
            const indexData = await indexResponse.json();
            this.templates = indexData.templates || [];
            
            // 预加载默认模板
            if (this.templates.length > 0) {
                const defaultTemplate = this.templates.find(t => t.id === this.defaultTemplateId) || this.templates[0];
                await this.loadTemplate(defaultTemplate.id);
            }
            
            this.initialized = true;
            
            // 触发模板加载完成回调
            this.onTemplatesLoadedCallbacks.forEach(callback => callback(this.templates));
            
            return true;
        } catch (error) {
            console.error('模板管理器初始化失败:', error);
            return false;
        }
    }

    /**
     * 注册模板加载完成回调函数
     * @param {Function} callback 回调函数
     */
    onTemplatesLoaded(callback) {
        if (typeof callback !== 'function') return;
        
        if (this.initialized && this.templates.length > 0) {
            // 如果已经初始化完成，直接调用回调
            callback(this.templates);
        } else {
            // 否则添加到回调列表
            this.onTemplatesLoadedCallbacks.push(callback);
        }
    }

    /**
     * 加载指定ID的模板
     * @param {string} templateId 模板ID
     * @returns {Promise<string>} 模板HTML内容
     */
    async loadTemplate(templateId) {
        try {
            if (!this.templates || !this.templates[templateId]) {
                console.error(`Template not found: ${templateId}`);
                return null;
            }

            const templateInfo = this.templates[templateId];
            let templateUrl = templateInfo.path;

            // 确保URL是相对于当前页面的
            if (!templateUrl.startsWith('http') && !templateUrl.startsWith('/')) {
                templateUrl = `../${templateUrl}`;
            }

            const response = await fetch(templateUrl);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${response.statusText}`);
            }

            let templateContent = await response.text();
            
            // 使用replaceDynamicContent方法替换动态内容
            templateContent = this.replaceDynamicContent(templateContent);
            
            return {
                html: templateContent,
                contentSelector: templateInfo.contentSelector
            };
        } catch (error) {
            console.error('Error loading template:', error);
            return null;
        }
    }

    /**
     * 获取所有可用模板的列表
     * @returns {Array} 模板列表
     */
    getTemplateList() {
        return [...this.templates];
    }

    /**
     * 获取模板的内容区域选择器
     * @param {string} templateId 模板ID
     * @returns {string|null} 内容区域的CSS选择器
     */
    getContentSelector(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        return template ? template.contentSelector : null;
    }

    /**
     * 将用户内容注入到模板中
     * @param {string} templateHTML 模板HTML
     * @param {string} userContent 用户内容
     * @param {string} contentSelector 内容区域选择器
     * @returns {string} 注入用户内容后的完整HTML
     */
    injectContent(templateHTML, userContent, contentSelector) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateHTML, 'text/html');
            
            // 查找内容区域
            const contentArea = contentSelector.startsWith('#') 
                ? doc.getElementById(contentSelector.substring(1))
                : doc.querySelector(contentSelector);
            
            if (!contentArea) {
                console.warn(`未找到内容区域: ${contentSelector}`);
                return templateHTML;
            }
            
            // 检查并清理用户内容中可能存在的重复模板
            const cleanedContent = this.cleanDuplicateContent(userContent);
            
            // 注入用户内容
            contentArea.innerHTML = cleanedContent;
            
            return doc.documentElement.outerHTML;
        } catch (error) {
            console.error('注入内容失败:', error);
            return templateHTML;
        }
    }

    /**
     * 清理HTML中可能存在的重复模板内容
     * @param {string} html HTML内容
     * @returns {string} 清理后的HTML内容
     */
    cleanDuplicateContent(html) {
        try {
            // 如果HTML为空，直接返回
            if (!html || typeof html !== 'string') {
                return html;
            }
            
            // 检测常见的重复标记
            const duplicatePatterns = [
                // 检测重复的ResendMail标题
                /<h2[^>]*>ResendMail\s+邮件通知<\/h2>/gi,
                // 检测重复的页脚内容
                /<div[^>]*class=["']footer["'][^>]*>[\s\S]*?ResendMail[\s\S]*?<\/div>/gi,
                // 检测重复的样式声明
                /<style[^>]*>[\s\S]*?<\/style>/gi,
                // 检测重复的HTML声明和头部
                /<html[^>]*>[\s\S]*?<body/gi,
                // 检测重复的正文结构
                /<body[^>]*>[\s\S]*?<div[^>]*class=["']content["']/gi,
                // 检测重复的模板元数据
                /<meta\s+name=["']template-[^>]*>/gi
            ];
            
            // 检测是否包含HTML结构
            const hasHtmlStructure = /<html|<body|<head|<!doctype/i.test(html);
            
            // 如果是完整的HTML文档或疑似包含重复内容
            if (hasHtmlStructure) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // 查找内容区域
                const contentElements = [
                    doc.querySelector('.content'),
                    doc.querySelector('#user-content'),
                    doc.querySelector('.user-content-area')
                ].filter(el => el); // 过滤出非null的元素
                
                if (contentElements.length > 0) {
                    // 使用第一个找到的内容元素
                    return contentElements[0].innerHTML;
                }
                
                // 如果找不到明确的内容区域，但确实是一个HTML文档，尝试提取body内容
                if (doc.body) {
                    console.log('检测到可能的重复模板，提取body内容');
                    return doc.body.innerHTML;
                }
            }
            
            // 检查是否有明显的重复模板标记
            let hasDuplicateMarkers = false;
            for (const pattern of duplicatePatterns) {
                const matches = html.match(pattern);
                if (matches && matches.length > 1) {
                    hasDuplicateMarkers = true;
                    console.log(`检测到重复模板标记: ${pattern.toString()}, 匹配数: ${matches.length}`);
                    break;
                }
            }
            
            // 如果检测到重复标记，提取有效内容
            if (hasDuplicateMarkers) {
                console.log('检测到重复模板标记，尝试提取有效内容');
                
                // 创建一个新的HTML文档
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // 删除所有的style标签和页脚
                doc.querySelectorAll('style, .footer, head, .header').forEach(el => {
                    try { el.parentNode.removeChild(el); } catch (e) {}
                });
                
                // 提取所有文本段落和重要内容
                const contentElements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, div:not(.header):not(.footer)');
                
                if (contentElements.length > 0) {
                    const tempContainer = document.createElement('div');
                    contentElements.forEach(el => {
                        // 避免添加空元素或只包含空白的元素
                        if (el.textContent.trim()) {
                            tempContainer.appendChild(el.cloneNode(true));
                        }
                    });
                    return tempContainer.innerHTML;
                }
            }
            
            // 如果没有检测到明显的HTML结构或重复标记，返回原始内容
            return html;
        } catch (error) {
            console.error('清理重复内容时出错:', error);
            return html; // 出错时返回原始内容
        }
    }

    /**
     * 从模板中提取用户内容
     * @param {string} templateHTML 模板HTML
     * @param {string} contentSelector 内容区域选择器
     * @returns {string} 提取的用户内容
     */
    extractContent(templateHTML, contentSelector) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateHTML, 'text/html');
            
            // 查找内容区域
            const contentArea = contentSelector.startsWith('#') 
                ? doc.getElementById(contentSelector.substring(1))
                : doc.querySelector(contentSelector);
            
            if (!contentArea) {
                console.warn(`未找到内容区域: ${contentSelector}`);
                return '';
            }
            
            return contentArea.innerHTML;
        } catch (error) {
            console.error('提取内容失败:', error);
            return '';
        }
    }
    
    /**
     * 对HTML内容进行内联样式处理，提高邮件客户端兼容性
     * 
     * 注意：由于浏览器环境的限制，此处仅进行基本处理
     * 更完善的内联处理应在ResendMail 智能群发邮件系统的后端完成
     */
    inlineStyles(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 查找所有样式标签
            const styleElements = doc.querySelectorAll('style');
            const styleRules = [];
            
            // 提取所有CSS规则
            styleElements.forEach(style => {
                try {
                    const cssText = style.textContent;
                    if (cssText) {
                        // 简单解析CSS规则（这只是一个基本实现，不处理所有CSS规则）
                        const rules = this.parseCssRules(cssText);
                        styleRules.push(...rules);
                    }
                } catch (e) {
                    console.warn('解析样式标签失败:', e);
                }
            });
            
            // 应用样式规则到元素
            if (styleRules.length > 0) {
                this.applyStylesToElements(doc, styleRules);
            }
            
            // 如果需要，可以从HTML中删除原始样式标签
            // styleElements.forEach(style => style.parentNode.removeChild(style));
            
            return doc.documentElement.outerHTML;
        } catch (error) {
            console.error('内联CSS样式时出错:', error);
            return html; // 返回原始HTML
        }
    }
    
    /**
     * 解析CSS规则
     * @param {string} cssText CSS文本
     * @returns {Array} 解析后的CSS规则数组
     */
    parseCssRules(cssText) {
        try {
            const rules = [];
            // 移除注释
            cssText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
            
            // 分割规则块 - 这里使用一个简化的方法，可能不适用于所有CSS规则
            const ruleBlocks = cssText.split('}');
            
            ruleBlocks.forEach(block => {
                const parts = block.split('{');
                if (parts.length === 2) {
                    const selectors = parts[0].trim();
                    const declarations = parts[1].trim();
                    
                    if (selectors && declarations) {
                        // 对选择器分组
                        selectors.split(',').forEach(selector => {
                            selector = selector.trim();
                            // 忽略无效选择器和伪类/伪元素
                            if (selector && !selector.includes(':')) {
                                rules.push({
                                    selector: selector,
                                    declarations: declarations
                                });
                            }
                        });
                    }
                }
            });
            
            return rules;
        } catch (error) {
            console.error('解析CSS规则时出错:', error);
            return [];
        }
    }
    
    /**
     * 将样式应用到元素
     * @param {Document} doc DOM文档
     * @param {Array} rules CSS规则数组
     */
    applyStylesToElements(doc, rules) {
        rules.forEach(rule => {
            try {
                // 尝试查找匹配选择器的元素
                const elements = doc.querySelectorAll(rule.selector);
                if (elements.length > 0) {
                    // 解析声明
                    const declarations = {};
                    rule.declarations.split(';').forEach(declaration => {
                        const parts = declaration.split(':');
                        if (parts.length === 2) {
                            const property = parts[0].trim();
                            const value = parts[1].trim();
                            if (property && value) {
                                declarations[property] = value;
                            }
                        }
                    });
                    
                    // 应用样式到元素
                    elements.forEach(element => {
                        const currentStyle = element.getAttribute('style') || '';
                        let newStyle = currentStyle;
                        
                        // 添加新的样式属性
                        Object.keys(declarations).forEach(property => {
                            const value = declarations[property];
                            
                            // 检查当前样式是否已包含此属性
                            const regex = new RegExp(`${property}\\s*:`, 'i');
                            if (regex.test(currentStyle)) {
                                // 这里选择不覆盖行内样式，因为它们通常具有更高的优先级
                                // 如果需要覆盖，可以使用正则表达式替换
                            } else {
                                // 添加新样式
                                newStyle += `${newStyle ? '; ' : ''}${property}: ${value}`;
                            }
                        });
                        
                        // 设置更新后的样式
                        if (newStyle !== currentStyle) {
                            element.setAttribute('style', newStyle);
                        }
                    });
                }
            } catch (e) {
                console.warn(`应用样式规则 "${rule.selector}" 失败:`, e);
            }
        });
    }
    
    /**
     * 格式化HTML，用于编辑器显示
     * @param {string} html HTML内容
     * @returns {string} 格式化后的HTML
     */
    formatHtml(html) {
        // 首先清理可能的重复内容
        html = this.cleanDuplicateContent(html);
        
        try {
            // 基本缩进逻辑
            let formatted = '';
            let indent = 0;
            
            // 预处理处理HTML，替换<tag>为\n<tag>\n，</tag>为\n</tag>\n
            html = html.replace(/(<\/?[^>]+>)/g, '\n$1\n');
            
            // 按行处理
            const lines = html.split('\n').filter(line => line.trim() !== '');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // 缩减缩进的标签
                if (line.match(/<\/([^>]+)>/) && !line.match(/<([^>]+)>.*<\/([^>]+)>/)) {
                    indent--;
                }
                
                // 添加缩进
                if (indent < 0) indent = 0;
                formatted += ' '.repeat(indent * 2) + line + '\n';
                
                // 增加缩进的标签
                if (line.match(/<([^\/][^>]*)>/) && 
                    !line.match(/<([^>]+)>.*<\/([^>]+)>/) && 
                    !line.match(/<(br|hr|img|input|link|meta|source)([^>]*)>/i)) {
                    indent++;
                }
            }
            
            return formatted.trim();
        } catch (error) {
            console.error('格式化HTML失败:', error);
            return html; // 如果格式化失败，返回原始HTML
        }
    }

    // 替换动态内容
    replaceDynamicContent(templateContent) {
        let processedContent = templateContent;
    
        // 替换日期和年份
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
    
        // 生成或使用邮件ID
        const generateEmailId = () => {
            const datePart = currentDate.getFullYear().toString().substr(2) + 
                           ('0' + (currentDate.getMonth() + 1)).slice(-2) + 
                           ('0' + currentDate.getDate()).slice(-2);
            const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            return datePart + randomPart;
        };
        
        const emailId = this.emailId || generateEmailId();
    
        // 替换所有占位符
        processedContent = processedContent
            .replace(/{{CURRENT_YEAR}}/g, currentYear)
            .replace(/{{CURRENT_DATE}}/g, currentDate.toLocaleDateString())
            .replace(/{{EMAIL_ID_PLACEHOLDER}}/g, emailId);
    
        return processedContent;
    }
}

// 创建全局单例实例
window.templateManager = new TemplateManager(); 