/**
 * 增强版邮件随机化模块
 * 用于在保持视觉一致的情况下，使每封邮件在技术层面上有所不同，避免被识别为垃圾邮件
 */

// 配置选项
const DEFAULT_CONFIG = {
  // 零宽字符随机化
  zeroWidthRandomization: {
    enabled: true,
    strength: 5, // 1-10
    wordGapProbabilityRange: [0.1, 0.5], // 词间隙插入概率范围
    inWordProbabilityRange: [0.05, 0.2], // 词内插入概率范围
    maxSequenceLength: 3 // 最大零宽字符序列长度
  },
  
  // HTML属性随机化
  htmlAttributeRandomization: {
    enabled: true,
    strength: 5, // 1-10
    dataAttributesCount: 3, // 添加的data属性数量
    randomClassesCount: 2, // 添加的随机类数量
    commentProbability: 0.3 // 添加随机注释的概率
  },
  
  // CSS类名随机化
  cssClassRandomization: {
    enabled: true,
    strength: 5, // 1-10
    prefixPool: ['e', 'x', 's', 'a', 'r', 'v', 'm', 'k'], // 类名前缀池
    minLength: 5, // 最小类名长度
    maxLength: 12, // 最大类名长度
    preserveOriginal: true,
    prefix: 'gr'
  },
  
  // 元数据随机化
  metadataRandomization: {
    enabled: true,
    addRandomMetadataTags: true,
    randomizeTimestamps: true,
    addRenderingHints: true,
    randomizeContentId: true,
    randomizeMessageId: true
  }
};

/**
 * 随机化预设配置
 */
const RANDOMIZATION_PRESETS = {
  /**
   * 默认预设
   */
  default: DEFAULT_CONFIG,
  
  /**
   * Gmail预设 - 针对Gmail邮件客户端优化
   */
  gmail: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 6,
      wordGapProbabilityRange: [0.2, 0.6],
      inWordProbabilityRange: [0.1, 0.3],
      maxSequenceLength: 3
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 7,
      dataAttributesCount: 4,
      randomClassesCount: 3,
      commentProbability: 0.4
    },
    cssClassRandomization: {
      enabled: true,
      strength: 5,
      preserveOriginal: true,
      prefix: 'gr'
    },
    metadataRandomization: {
      enabled: true,
      strength: 4,
      randomizeContentId: true,
      randomizeMessageId: true
    }
  },
  
  /**
   * Outlook预设 - 针对Outlook邮件客户端优化
   */
  outlook: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 4, // Outlook对零宽字符较敏感，较低强度
      wordGapProbabilityRange: [0.1, 0.4],
      inWordProbabilityRange: [0.05, 0.15],
      maxSequenceLength: 2
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 8, // Outlook对HTML属性不太敏感
      dataAttributesCount: 5,
      randomClassesCount: 4,
      commentProbability: 0.6
    },
    cssClassRandomization: {
      enabled: true,
      strength: 6,
      preserveOriginal: true,
      prefix: 'or'
    },
    metadataRandomization: {
      enabled: true,
      strength: 5,
      randomizeContentId: true,
      randomizeMessageId: true
    }
  },
  
  /**
   * 轻量级预设 - 最小的随机化，确保最大兼容性
   */
  light: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 3,
      wordGapProbabilityRange: [0.05, 0.2],
      inWordProbabilityRange: [0.01, 0.1],
      maxSequenceLength: 1
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 4,
      dataAttributesCount: 2,
      randomClassesCount: 1,
      commentProbability: 0.2
    },
    cssClassRandomization: {
      enabled: false
    },
    metadataRandomization: {
      enabled: true,
      strength: 3,
      randomizeContentId: true,
      randomizeMessageId: false
    }
  },
  
  /**
   * 强力预设 - 最大随机化，可能影响某些客户端的兼容性
   */
  aggressive: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 9,
      wordGapProbabilityRange: [0.5, 0.9],
      inWordProbabilityRange: [0.3, 0.6],
      maxSequenceLength: 5
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 9,
      dataAttributesCount: 7,
      randomClassesCount: 5,
      commentProbability: 0.8
    },
    cssClassRandomization: {
      enabled: true,
      strength: 8,
      preserveOriginal: false,
      prefix: 'ag'
    },
    metadataRandomization: {
      enabled: true,
      strength: 9,
      randomizeContentId: true,
      randomizeMessageId: true
    }
  },
  
  /**
   * 抗混淆模板预设 - 针对抗混淆模板优化
   * 这种预设的重点是在保持模板抗混淆特性的同时，增加足够的随机性
   */
  antiObfuscation: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 7, // 增强的强度
      wordGapProbabilityRange: [0.3, 0.7], // 在单词间更频繁地插入
      inWordProbabilityRange: [0.1, 0.3], // 较少在单词内插入，避免破坏可读性
      maxSequenceLength: 2 // 较短的序列，减少干扰
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 8, // 增强属性随机化
      dataAttributesCount: 5, // 更多的data属性
      randomClassesCount: 3, // 适中数量的随机类
      commentProbability: 0.5 // 中等概率添加注释
    },
    cssClassRandomization: {
      enabled: false // 禁用CSS类名随机化，因为抗混淆模板已经有良好的CSS结构
    },
    metadataRandomization: {
      enabled: true,
      strength: 6,
      randomizeContentId: true,
      randomizeMessageId: true
    }
  }
};

/**
 * 随机化工具类
 */
const RandomizationUtils = {
  /**
   * 生成随机字符串
   * @param {number} length - 长度
   * @param {string} charset - 字符集
   * @returns {string} - 随机字符串
   */
  generateRandomString(length, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  },
  
  /**
   * 根据范围生成随机数
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} - 随机数
   */
  getRandomNumber(min, max) {
    return min + Math.random() * (max - min);
  },
  
  /**
   * 从数组中随机选择一个元素
   * @param {Array} array - 数组
   * @returns {*} - 随机选择的元素
   */
  getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  },
  
  /**
   * 生成唯一ID
   * @returns {string} - 唯一ID
   */
  generateUniqueId() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  },
  
  /**
   * 获取随机零宽字符
   * @returns {string} - 零宽字符
   */
  getRandomZeroWidthChar() {
    // 零宽字符集合
    const zeroWidthChars = [
      '\u200B', // 零宽空格
      '\u200C', // 零宽不连字
      '\u200D', // 零宽连字
      '\u2060', // 单词连接符
      '\u200E', // 从左到右标记
      '\u200F'  // 从右到左标记
    ];
    
    return this.getRandomElement(zeroWidthChars);
  },
  
  /**
   * 获取随机零宽字符序列
   * @param {number} length - 序列长度
   * @returns {string} - 零宽字符序列
   */
  getRandomZeroWidthSequence(length = 1) {
    let sequence = '';
    for (let i = 0; i < length; i++) {
      sequence += this.getRandomZeroWidthChar();
    }
    return sequence;
  }
};

/**
 * 零宽字符随机化器
 */
const ZeroWidthRandomizer = {
  /**
   * 在文本中插入零宽字符
   * @param {string} text - 原始文本
   * @param {Object} config - 配置
   * @returns {string} - 处理后的文本
   */
  randomizeText(text, config = DEFAULT_CONFIG.zeroWidthRandomization) {
    if (!text || !config.enabled) return text;
    
    const words = text.split(/\s+/);
    let result = '';
    
    // 为当前文本生成随机模式种子
    const patternSeed = Math.random();
    
    // 决定该文本的零宽字符插入偏好
    const preferences = {
      // 单词间隔处插入概率
      wordGapProbability: RandomizationUtils.getRandomNumber(
        config.wordGapProbabilityRange[0], 
        config.wordGapProbabilityRange[1]
      ),
      // 单词内插入概率
      inWordProbability: RandomizationUtils.getRandomNumber(
        config.inWordProbabilityRange[0], 
        config.inWordProbabilityRange[1]
      ),
      // 序列长度变化
      maxSequenceLength: config.maxSequenceLength || 3,
      // 偏好短词还是长词 (0: 无偏好, 1: 短词, 2: 长词)
      wordLengthPreference: Math.floor(patternSeed * 3)
    };
    
    // 在单词间插入零宽字符
    words.forEach((word, index) => {
      if (index > 0) {
        // 添加空格
        result += ' ';
        
        // 根据模式种子和加密强度决定是否在这个间隙插入零宽字符
        const insertHere = Math.random() < (preferences.wordGapProbability * (config.strength / 10));
        if (insertHere) {
          const sequenceLength = 1 + Math.floor(Math.random() * (preferences.maxSequenceLength - 1));
          result += RandomizationUtils.getRandomZeroWidthSequence(sequenceLength);
        }
      }
      
      // 检查是否应该在单词内部插入零宽字符
      if (word.length > 3) {
        let shouldInsertInWord = false;
        
        // 根据单词长度偏好确定是否插入
        switch (preferences.wordLengthPreference) {
          case 0: // 无偏好
            shouldInsertInWord = Math.random() < (preferences.inWordProbability * (config.strength / 10));
            break;
          case 1: // 偏好短词
            shouldInsertInWord = Math.random() < (preferences.inWordProbability * (config.strength / 10) * (1 - word.length/20));
            break;
          case 2: // 偏好长词
            shouldInsertInWord = Math.random() < (preferences.inWordProbability * (config.strength / 10) * (word.length/10));
            break;
        }
        
        if (shouldInsertInWord) {
          // 在单词中间位置插入
          const position = Math.floor(1 + Math.random() * (word.length - 2));
          word = word.substring(0, position) + 
                RandomizationUtils.getRandomZeroWidthChar() + 
                word.substring(position);
        }
      }
      
      result += word;
    });
    
    return result;
  },
  
  /**
   * 在HTML中插入零宽字符
   * @param {string} html - 原始HTML
   * @param {Object} config - 配置
   * @param {Object} templateInfo - 模板信息（可选）
   * @returns {string} - 处理后的HTML
   */
  randomizeHtml(html, config = DEFAULT_CONFIG.zeroWidthRandomization, templateInfo = null) {
    if (!html || !config.enabled) return html;
    
    // 生成此邮件的随机种子，确保整封邮件使用一致的模式
    const emailSeed = Math.random();
    
    // 使用模板信息调整处理
    const isAntiObfuscation = templateInfo && templateInfo.type === 'anti-obfuscation';
    const hasZeroWidthFix = templateInfo && templateInfo.features && templateInfo.features.includes('zero-width-fix');
    
    // 如果是抗混淆模板且有零宽字符修复
    if (isAntiObfuscation && hasZeroWidthFix) {
      // 使用更智能的零宽字符插入策略 - 主要针对JavaScript不太容易修复的区域
      return this._smartInsertIntoHtml(html, config, emailSeed);
    }
    
    // 标准处理
    return html.replace(/(?<=>)([^<]+)(?=<)/g, (match) => {
      // 根据当前文本的长度调整插入概率
      const textLengthFactor = Math.min(1, match.length / 100);
      const effectiveStrength = config.strength * (0.5 + (textLengthFactor * 0.5));
      
      // 根据emailSeed调整此处理过程，使得整封邮件保持一致的处理模式
      const adjustedStrength = effectiveStrength * (0.8 + (emailSeed * 0.4)); // 0.8-1.2倍变化
      
      // 创建临时配置
      const tempConfig = {...config, strength: adjustedStrength};
      
      return this.randomizeText(match, tempConfig);
    });
  },
  
  /**
   * 针对抗混淆模板的智能零宽字符插入
   * @private
   * @param {string} html - 原始HTML
   * @param {Object} config - 配置
   * @param {number} emailSeed - 邮件种子
   * @returns {string} - 处理后的HTML
   */
  _smartInsertIntoHtml(html, config, emailSeed) {
    // 注意：在Node环境中不能直接使用DOM，我们使用正则表达式
    
    // 1. 避开fixZeroWidthIssues函数处理的标签
    const avoidTargets = ['p', 'h1', 'h2', 'h3', 'span', 'a', 'div'];
    const avoidTargetPattern = new RegExp(`<(${avoidTargets.join('|')})([^>]*)>([^<]+)<`, 'gi');
    
    // 2. 优先处理不在上述标签中的文本
    let processedHtml = html.replace(/(?<=>)([^<]+)(?=<)/g, (match, text, index) => {
      // 检查当前文本是否在需要避开的标签内
      const beforeText = html.substring(0, index);
      let shouldProcess = true;
      
      // 简单检查前面的标签是否是需要避开的
      for (const target of avoidTargets) {
        const lastOpenTag = beforeText.lastIndexOf(`<${target}`);
        const lastCloseTag = beforeText.lastIndexOf(`</${target}`);
        
        if (lastOpenTag > lastCloseTag) {
          shouldProcess = false;
          break;
        }
      }
      
      // 如果不在需要避开的标签中，使用增强的随机化
      if (shouldProcess && text.trim().length > 0) {
        // 增强的配置
        const enhancedConfig = {
          ...config,
          strength: Math.min(config.strength * 1.5, 10),
          wordGapProbabilityRange: [
            Math.min(config.wordGapProbabilityRange[0] * 1.5, 0.9),
            Math.min(config.wordGapProbabilityRange[1] * 1.5, 0.95)
          ],
          inWordProbabilityRange: [
            Math.min(config.inWordProbabilityRange[0] * 1.5, 0.4),
            Math.min(config.inWordProbabilityRange[1] * 1.5, 0.6)
          ]
        };
        
        return this.randomizeText(text, enhancedConfig);
      }
      
      // 对于需要避开的标签内的文本，使用轻度随机化
      if (text.trim().length > 0) {
        const lightConfig = {
          ...config,
          strength: Math.max(config.strength * 0.6, 1),
          wordGapProbabilityRange: [
            config.wordGapProbabilityRange[0] * 0.5,
            config.wordGapProbabilityRange[1] * 0.5
          ],
          inWordProbabilityRange: [
            config.inWordProbabilityRange[0] * 0.3,
            config.inWordProbabilityRange[1] * 0.3
          ]
        };
        
        return this.randomizeText(text, lightConfig);
      }
      
      return text;
    });
    
    return processedHtml;
  }
};

/**
 * HTML属性随机化器
 */
const HtmlAttributeRandomizer = {
  /**
   * 随机化HTML属性
   * @param {string} html - 原始HTML
   * @param {Object} config - 配置
   * @param {Object} templateInfo - 模板信息（可选）
   * @returns {string} - 处理后的HTML
   */
  randomizeHtmlAttributes(html, config = DEFAULT_CONFIG.htmlAttributeRandomization, templateInfo = null) {
    if (!html || !config.enabled) return html;
    
    const isAntiObfuscation = templateInfo && templateInfo.type === 'anti-obfuscation';
    const hasRedundantSelectors = templateInfo && templateInfo.features && 
                              templateInfo.features.includes('redundant-selectors');
    
    // 生成针对此邮件唯一的属性名称
    const uniquePrefix = RandomizationUtils.generateRandomString(3).toLowerCase();
    
    let processedHtml = html;
    
    // 如果是抗混淆模板且有冗余选择器
    if (isAntiObfuscation && hasRedundantSelectors) {
      // 使用更高级的属性随机化策略
      processedHtml = this._advancedRandomizeAttributes(processedHtml, config, uniquePrefix);
    } else {
      // 标准属性随机化
      processedHtml = this._standardRandomizeAttributes(processedHtml, config, uniquePrefix);
    }
    
    // 添加随机注释
    if (Math.random() < config.commentProbability) {
      processedHtml = this._addRandomComments(processedHtml, config.strength);
    }
    
    return processedHtml;
  },
  
  /**
   * 标准HTML属性随机化
   * @private
   * @param {string} html - 原始HTML
   * @param {Object} config - 配置
   * @param {string} uniquePrefix - 唯一前缀
   * @returns {string} - 处理后的HTML
   */
  _standardRandomizeAttributes(html, config, uniquePrefix) {
    // 1. 添加随机data属性
    let processedHtml = html;
    const dataAttrCount = config.dataAttributesCount || 3;
    
    // 给HTML元素添加随机data属性
    processedHtml = processedHtml.replace(/<([a-z][a-z0-9]*)((?:\s+[^>]*?)?)>/gi, (match, tag, attributes) => {
      // 跳过某些不应该修改的标签
      if (['html', 'head', 'meta', 'link', 'script', 'style'].includes(tag.toLowerCase())) {
        return match;
      }
      
      // 添加随机data属性
      let newAttributes = attributes || '';
      const attrCount = Math.max(1, Math.floor(Math.random() * dataAttrCount));
      
      for (let i = 0; i < attrCount; i++) {
        const attrName = `data-${uniquePrefix}-${RandomizationUtils.generateRandomString(5).toLowerCase()}`;
        const attrValue = RandomizationUtils.generateRandomString(8);
        newAttributes += ` ${attrName}="${attrValue}"`;
      }
      
      return `<${tag}${newAttributes}>`;
    });
    
    // 2. 添加随机类
    const classCount = config.randomClassesCount || 2;
    
    // 给特定元素添加随机类
    processedHtml = processedHtml.replace(/<(div|span|p|section|article|header|footer|nav)((?:\s+[^>]*?)?)>/gi, 
      (match, tag, attributes) => {
        // 检查是否已经有class属性
        if (attributes.includes('class=')) {
          // 在现有class中添加随机类
          return match.replace(/class=["']([^"']*)["']/i, (classMatch, classValue) => {
            const randomClasses = [];
            const count = Math.max(1, Math.floor(Math.random() * classCount));
            
            for (let i = 0; i < count; i++) {
              randomClasses.push(`${uniquePrefix}-${RandomizationUtils.generateRandomString(6).toLowerCase()}`);
            }
            
            return `class="${classValue} ${randomClasses.join(' ')}"`;
          });
        } else {
          // 添加新的class属性
          const randomClasses = [];
          const count = Math.max(1, Math.floor(Math.random() * classCount));
          
          for (let i = 0; i < count; i++) {
            randomClasses.push(`${uniquePrefix}-${RandomizationUtils.generateRandomString(6).toLowerCase()}`);
          }
          
          return `<${tag}${attributes} class="${randomClasses.join(' ')}">`;
        }
      }
    );
    
    return processedHtml;
  },
  
  /**
   * 高级HTML属性随机化，专为抗混淆模板设计
   * @private
   * @param {string} html - 原始HTML
   * @param {Object} config - 配置
   * @param {string} uniquePrefix - 唯一前缀
   * @returns {string} - 处理后的HTML
   */
  _advancedRandomizeAttributes(html, config, uniquePrefix) {
    let processedHtml = html;
    
    // 1. 寻找并增强已有data属性
    processedHtml = processedHtml.replace(/data-([a-z0-9-]+)=["']([^"']*)["']/gi, (match, attrName, attrValue) => {
      // 保留原有属性，但增加一个相似的
      const newAttrName = `data-${uniquePrefix}-${attrName}`;
      const newAttrValue = `${attrValue}-${RandomizationUtils.generateRandomString(5)}`;
      
      return `${match} ${newAttrName}="${newAttrValue}"`;
    });
    
    // 2. 添加随机属性到未使用data属性的元素
    const dataAttrCount = config.dataAttributesCount || 3;
    
    processedHtml = processedHtml.replace(/<([a-z][a-z0-9]*)((?:\s+[^>]*?)?)>/gi, (match, tag, attributes) => {
      // 跳过某些不应该修改的标签
      if (['html', 'head', 'meta', 'link', 'script', 'style'].includes(tag.toLowerCase())) {
        return match;
      }
      
      // 如果还没有data属性
      if (!attributes.includes('data-')) {
        // 添加随机data属性
        let newAttributes = attributes || '';
        const attrCount = Math.max(1, Math.floor(Math.random() * dataAttrCount));
        
        for (let i = 0; i < attrCount; i++) {
          const attrName = `data-${uniquePrefix}-${RandomizationUtils.generateRandomString(5).toLowerCase()}`;
          const attrValue = RandomizationUtils.generateRandomString(8);
          newAttributes += ` ${attrName}="${attrValue}"`;
        }
        
        return `<${tag}${newAttributes}>`;
      }
      
      return match;
    });
    
    // 3. 给元素添加aria属性，这些不会影响视觉效果
    processedHtml = processedHtml.replace(/<(div|span|button|a|section|article)((?:\s+[^>]*?)?)>/gi, 
      (match, tag, attributes) => {
        // 随机决定是否添加aria属性
        if (Math.random() < 0.3) {
          const ariaAttributes = [
            `aria-label="${RandomizationUtils.generateRandomString(8)}"`,
            `aria-describedby="${uniquePrefix}-desc-${RandomizationUtils.generateRandomString(5)}"`,
            `aria-hidden="${Math.random() > 0.5 ? 'true' : 'false'}"`,
            `aria-role="presentation"`,
            `role="presentation"`
          ];
          
          // 随机选择1-2个aria属性
          const selectedAttrs = [];
          const count = 1 + Math.floor(Math.random() * 2);
          
          for (let i = 0; i < count; i++) {
            const idx = Math.floor(Math.random() * ariaAttributes.length);
            selectedAttrs.push(ariaAttributes[idx]);
            ariaAttributes.splice(idx, 1);
            
            if (ariaAttributes.length === 0) break;
          }
          
          return `<${tag}${attributes} ${selectedAttrs.join(' ')}>`;
        }
        
        return match;
      }
    );
    
    return processedHtml;
  },
  
  /**
   * 添加随机HTML注释
   * @private
   * @param {string} html - 原始HTML
   * @param {number} strength - 强度
   * @returns {string} - 处理后的HTML
   */
  _addRandomComments(html, strength) {
    // 生成随机注释内容
    const getRandomComment = () => {
      const comments = [
        " Generated section ",
        " Container element ",
        " Layout block ",
        " Template part ",
        " Dynamic content ",
        " Section end ",
        " Module start ",
        " UI component ",
        " Auto-generated "
      ];
      
      return `<!-- ${comments[Math.floor(Math.random() * comments.length)]}${RandomizationUtils.generateRandomString(5)} -->`;
    };
    
    // 计算应该添加的注释数量
    const commentCount = Math.floor(strength / 2) + 1;
    
    // 查找适合插入注释的位置（标签结束之后）
    const tagEndPositions = [];
    const regex = />/g;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
      // 只在一些标签后添加注释
      const beforeTag = html.substring(Math.max(0, match.index - 15), match.index);
      if (beforeTag.match(/<(div|section|article|header|footer|p)[ >]/i)) {
        tagEndPositions.push(match.index + 1);
      }
    }
    
    // 随机选择位置插入注释
    let result = html;
    let insertedCount = 0;
    let positionIndexes = [...Array(tagEndPositions.length).keys()];
    
    // 打乱位置索引
    positionIndexes.sort(() => Math.random() - 0.5);
    
    // 选择一些位置插入注释
    for (let i = 0; i < Math.min(commentCount, positionIndexes.length); i++) {
      const posIndex = positionIndexes[i];
      const position = tagEndPositions[posIndex];
      
      // 计算因为之前插入的注释导致的偏移
      const offset = insertedCount * 30; // 假设每个注释平均长度30
      
      // 插入注释
      const comment = getRandomComment();
      result = result.slice(0, position + offset) + comment + result.slice(position + offset);
      
      insertedCount++;
    }
    
    return result;
  }
};

/**
 * CSS类名随机化器
 */
const CssClassRandomizer = {
  /**
   * 随机化HTML中的类名
   * @param {string} html - 原始HTML
   * @param {Object} config - 配置
   * @returns {string} - 处理后的HTML
   */
  randomizeClassNames(html, config = DEFAULT_CONFIG.cssClassRandomization) {
    if (!html || !config.enabled) return html;
    
    // 生成唯一前缀
    const prefix = config.prefix || 'r';
    const uniquePrefix = `${prefix}-${RandomizationUtils.generateRandomString(3).toLowerCase()}`;
    
    // 提取所有CSS类选择器
    let updatedHtml = html;
    const classRegex = /class=["']([^"']*)["']/g;
    
    // 提取并转换类名
    updatedHtml = updatedHtml.replace(classRegex, (match, classNames) => {
      // 拆分多个类名
      const classes = classNames.split(/\s+/).filter(c => c);
      
      // 创建新的类名集合
      let newClasses = config.preserveOriginal ? [...classes] : [];
      
      // 添加随机类名
      const randomClassCount = Math.max(1, Math.floor(Math.random() * (config.strength / 2)));
      
      for (let i = 0; i < randomClassCount; i++) {
        newClasses.push(`${uniquePrefix}-${RandomizationUtils.generateRandomString(5)}`);
      }
      
      return `class="${newClasses.join(' ')}"`;
    });
    
    // 处理<style>标签内的CSS
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    
    updatedHtml = updatedHtml.replace(styleRegex, (match, styleContent) => {
      if (!config.preserveOriginal) {
        // 如果不保留原始类名，不处理样式内容
        return match;
      }
      
      // 将唯一前缀添加到CSS选择器中
      const updatedStyleContent = styleContent.replace(/\.([\w-]+)/g, (match, className) => {
        if (Math.random() < 0.5) {
          return match; // 50%概率保持不变
        }
        return `.${className}, .${uniquePrefix}-${className}`;
      });
      
      return `<style>${updatedStyleContent}</style>`;
    });
    
    return updatedHtml;
  }
};

/**
 * 元数据随机化器
 */
const MetadataRandomizer = {
  /**
   * 随机化HTML元数据
   * @param {string} html - 原始HTML
   * @param {Object} config - 配置
   * @returns {string} - 处理后的HTML
   */
  randomizeMetadata(html, config = DEFAULT_CONFIG.metadataRandomization) {
    if (!html || !config.enabled) return html;
    
    let updatedHtml = html;
    
    // 随机化Content-ID
    if (config.randomizeContentId) {
      const contentIdRegex = /Content-ID:\s*<([^>]+)>/g;
      updatedHtml = updatedHtml.replace(contentIdRegex, (match, contentId) => {
        const parts = contentId.split('@');
        if (parts.length === 2) {
          const randomId = `${parts[0]}-${RandomizationUtils.generateRandomString(6)}@${parts[1]}`;
          return `Content-ID: <${randomId}>`;
        }
        return match;
      });
    }
    
    // 随机化Message-ID
    if (config.randomizeMessageId) {
      const messageIdRegex = /Message-ID:\s*<([^>]+)>/g;
      updatedHtml = updatedHtml.replace(messageIdRegex, (match, messageId) => {
        const parts = messageId.split('@');
        if (parts.length === 2) {
          const randomId = `${parts[0]}-${RandomizationUtils.generateRandomString(6)}@${parts[1]}`;
          return `Message-ID: <${randomId}>`;
        }
        return match;
      });
    }
    
    // 添加随机元数据
    if (Math.random() < (config.strength / 10)) {
      const randomMetaTags = [
        `<meta name="x-timestamp" content="${Date.now()}">`,
        `<meta name="x-mailer-version" content="1.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 100)}">`,
        `<meta name="x-generator" content="EmailGen/${RandomizationUtils.generateRandomString(6)}">`,
        `<meta name="x-instance" content="${RandomizationUtils.generateUniqueId()}">`
      ];
      
      // 随机选择1-2个添加
      const selectedTags = [];
      const count = 1 + Math.floor(Math.random() * Math.min(2, randomMetaTags.length));
      
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * randomMetaTags.length);
        selectedTags.push(randomMetaTags[idx]);
        randomMetaTags.splice(idx, 1);
        
        if (randomMetaTags.length === 0) break;
      }
      
      // 在</head>前添加
      updatedHtml = updatedHtml.replace('</head>', `${selectedTags.join('\n')}\n</head>`);
    }
    
    return updatedHtml;
  }
};

/**
 * 增强版邮件随机化器
 */
const EnhancedEmailRandomizer = {
  /**
   * 随机化HTML电子邮件
   * @param {string} emailHtml - 原始HTML电子邮件内容
   * @param {Object} config - 随机化配置
   * @returns {string} - 随机化后的HTML
   */
  randomizeEmailHtml(emailHtml, config = {}) {
    // 合并默认配置和用户配置
    const finalConfig = {
      ...DEFAULT_CONFIG,
      ...config
    };

    // 检测模板类型和特性
    const templateInfo = TemplateDetector.detectTemplateType(emailHtml);
    
    // 基于模板类型调整配置
    const adjustedConfig = TemplateDetector.adjustConfigForTemplate(finalConfig, templateInfo);
    
    let randomizedHtml = emailHtml;
    
    // 1. 零宽字符随机化
    if (adjustedConfig.zeroWidthRandomization.enabled) {
      randomizedHtml = ZeroWidthRandomizer.randomizeHtml(
        randomizedHtml, 
        adjustedConfig.zeroWidthRandomization,
        templateInfo
      );
    }
    
    // 2. HTML属性随机化
    if (adjustedConfig.htmlAttributeRandomization.enabled) {
      randomizedHtml = HtmlAttributeRandomizer.randomizeHtmlAttributes(
        randomizedHtml, 
        adjustedConfig.htmlAttributeRandomization,
        templateInfo
      );
    }
    
    // 3. CSS类名随机化
    if (adjustedConfig.cssClassRandomization.enabled) {
      randomizedHtml = CssClassRandomizer.randomizeClassNames(
        randomizedHtml, 
        adjustedConfig.cssClassRandomization
      );
    }
    
    // 4. 元数据随机化
    if (adjustedConfig.metadataRandomization.enabled) {
      randomizedHtml = MetadataRandomizer.randomizeMetadata(
        randomizedHtml, 
        adjustedConfig.metadataRandomization
      );
    }
    
    // 如果检测到抗混淆模板，添加特定随机化日志，帮助跟踪
    if (templateInfo && templateInfo.type === 'anti-obfuscation') {
      // 在HTML结尾添加不可见注释，记录模板类型和应用的随机化
      const features = templateInfo.features ? templateInfo.features.join(',') : 'none';
      const randomizationLog = `<!-- template:${templateInfo.type} features:${features} -->`;
      
      // 在结束body标签前添加注释
      randomizedHtml = randomizedHtml.replace('</body>', `${randomizationLog}\n</body>`);
    }
    
    return randomizedHtml;
  },
  
  /**
   * 随机化纯文本电子邮件
   * @param {string} emailText - 原始纯文本电子邮件内容
   * @param {Object} config - 随机化配置
   * @returns {string} - 随机化后的文本
   */
  randomizeEmailText(emailText, config = {}) {
    const finalConfig = {
      ...DEFAULT_CONFIG,
      ...config
    };
    
    let randomizedText = emailText;
    
    // 只对纯文本应用零宽字符随机化
    if (finalConfig.zeroWidthRandomization.enabled) {
      randomizedText = ZeroWidthRandomizer.randomizeText(
        randomizedText, 
        finalConfig.zeroWidthRandomization
      );
    }
    
    return randomizedText;
  },
  
  /**
   * 获取随机配置预设
   * @param {string} presetName - 预设名称
   * @returns {Object} - 预设配置
   */
  getPreset(presetName) {
    // 检查预设是否存在
    if (!RANDOMIZATION_PRESETS[presetName]) {
      console.warn(`预设 "${presetName}" 不存在，使用默认预设。`);
      return RANDOMIZATION_PRESETS.default;
    }
    return RANDOMIZATION_PRESETS[presetName];
  },
  
  /**
   * 融合两个预设
   * @param {string|Object} basePreset - 基础预设名称或配置对象
   * @param {string|Object} overridePreset - 覆盖预设名称或配置对象
   * @returns {Object} - 融合后的配置
   */
  mergePresets(basePreset, overridePreset) {
    // 获取基础预设配置
    const baseConfig = typeof basePreset === 'string' 
      ? this.getPreset(basePreset) 
      : basePreset;
    
    // 获取覆盖预设配置
    const overrideConfig = typeof overridePreset === 'string'
      ? this.getPreset(overridePreset)
      : overridePreset;
    
    // 深度合并配置
    return {
      ...JSON.parse(JSON.stringify(baseConfig)),
      ...JSON.parse(JSON.stringify(overrideConfig))
    };
  }
};

// 导出模块
module.exports = EnhancedEmailRandomizer; 