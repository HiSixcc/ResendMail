/**
 * 邮件随机化集成模块
 * 用于将增强版随机化功能集成到现有的Resend邮件系统中
 */

const { 
  EnhancedEmailRandomizer,
  TemplateDetector,
  RANDOMIZATION_PRESETS 
} = require('./enhanced-email-randomization');

/**
 * 增强版邮件随机化中间件
 * 在发送邮件前应用随机化处理，使得每封邮件在保持视觉一致的同时有不同的技术特征
 */
function applyEmailRandomization(emailData, options = {}) {
  // 合并用户选项与默认配置
  const config = {
    ...EnhancedEmailRandomizer.DEFAULT_CONFIG,
    ...options
  };
  
  // 应用邮件随机化
  return EnhancedEmailRandomizer.randomizeEmail(emailData, config);
}

/**
 * 增强Resend Worker以添加邮件随机化功能
 * @param {Object} worker - Resend Worker实例
 * @param {Object} [options] - 配置选项
 * @param {string|Object} [options.preset='default'] - 使用的随机化预设或自定义配置
 * @param {boolean} [options.detectTemplate=true] - 是否自动检测模板类型
 * @param {boolean} [options.randomizeAll=true] - 是否对所有邮件应用随机化
 * @param {function} [options.shouldRandomize] - 自定义函数决定是否对特定邮件随机化
 * @returns {Object} - 增强后的Worker实例
 */
function enhanceResendWorker(worker, options = {}) {
  if (!worker) {
    console.error('无效的Worker实例');
    return worker;
  }
  
  // 合并默认选项和用户选项
  const config = {
    preset: 'default',
    detectTemplate: true,
    randomizeAll: true,
    shouldRandomize: null,
    ...options
  };
  
  // 保存原始validateAndPreprocessEmail函数
  const originalValidateAndPreprocessEmail = worker.validateAndPreprocessEmail;
  
  // 增强validateAndPreprocessEmail函数，添加随机化功能
  worker.validateAndPreprocessEmail = function(postData) {
    // 应用原始验证和预处理
    const result = originalValidateAndPreprocessEmail.call(this, postData);
    
    // 如果验证失败，直接返回结果
    if (result.error) {
      return result;
    }
    
    // 检查是否应该对此邮件应用随机化
    let shouldRandomizeThisEmail = config.randomizeAll;
    
    // 如果提供了自定义函数，使用它决定是否随机化
    if (typeof config.shouldRandomize === 'function') {
      shouldRandomizeThisEmail = config.shouldRandomize(postData, result);
    }
    
    // 如果不需要随机化，直接返回结果
    if (!shouldRandomizeThisEmail) {
      return result;
    }
    
    try {
      // 获取随机化配置
      let randomizationConfig;
      
      if (typeof config.preset === 'string') {
        randomizationConfig = EnhancedEmailRandomizer.getPreset(config.preset);
      } else {
        randomizationConfig = config.preset;
      }
      
      const processedData = { ...result.processedData };
      
      // HTML内容随机化
      if (processedData.html) {
        // 检测模板类型并调整配置
        if (config.detectTemplate) {
          const templateInfo = TemplateDetector.detectTemplateType(processedData.html);
          
          // 如果检测到抗混淆模板，使用专用预设
          if (templateInfo && templateInfo.type === 'anti-obfuscation') {
            randomizationConfig = EnhancedEmailRandomizer.mergePresets(
              randomizationConfig,
              RANDOMIZATION_PRESETS.antiObfuscation
            );
            
            // 记录模板类型检测
            console.log(`[Email Randomizer] 检测到抗混淆模板，使用优化配置`);
          }
        }
        
        processedData.html = EnhancedEmailRandomizer.randomizeEmailHtml(
          processedData.html,
          randomizationConfig
        );
      }
      
      // 纯文本内容随机化
      if (processedData.text) {
        processedData.text = EnhancedEmailRandomizer.randomizeEmailText(
          processedData.text,
          randomizationConfig
        );
      }
      
      // 返回处理后的结果
      return {
        ...result,
        processedData
      };
    } catch (error) {
      console.error('[Email Randomizer] 随机化处理失败:', error);
      // 出错时返回原始结果
      return result;
    }
  };
  
  // 添加用于获取当前配置的函数
  worker.getRandomizationConfig = function() {
    return { ...config };
  };
  
  // 添加用于动态修改配置的函数
  worker.setRandomizationConfig = function(newOptions = {}) {
    Object.assign(config, newOptions);
    return { ...config };
  };
  
  return worker;
}

/**
 * 为单个邮件应用随机化
 * @param {Object} emailData - 邮件数据
 * @param {Object} options - 随机化选项
 * @returns {Object} - 随机化后的邮件数据
 */
function randomizeSingleEmail(emailData, options = {}) {
  return applyEmailRandomization(emailData, options);
}

/**
 * 为批量邮件应用随机化
 * @param {Array} emailsArray - 邮件数组
 * @param {Object} options - 随机化选项
 * @returns {Array} - 随机化后的邮件数组
 */
function randomizeBatchEmails(emailsArray, options = {}) {
  if (!Array.isArray(emailsArray)) {
    return emailsArray;
  }
  
  return emailsArray.map(emailData => applyEmailRandomization(emailData, options));
}

/**
 * 测试随机化结果
 * @param {Object} emailData - 邮件数据
 * @param {number} count - 要生成的随机版本数量
 * @param {Object} options - 随机化选项
 * @returns {Array} - 多个随机化版本的数组
 */
function testRandomization(emailData, count = 5, options = {}) {
  const results = [];
  
  for (let i = 0; i < count; i++) {
    results.push(applyEmailRandomization(emailData, options));
  }
  
  return results;
}

/**
 * 配置助手 - 创建常用的预设配置
 */
const ConfigPresets = {
  // 最小化随机化，适用于对垃圾邮件过滤不太严格的情况
  minimal: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 3
    },
    htmlAttributeRandomization: {
      enabled: false
    },
    cssClassRandomization: {
      enabled: false
    },
    metadataRandomization: {
      enabled: true,
      addRandomMetadataTags: false,
      randomizeTimestamps: true,
      addRenderingHints: false
    }
  },
  
  // 标准随机化，适用于大多数情况
  standard: EnhancedEmailRandomizer.DEFAULT_CONFIG,
  
  // 最大随机化，适用于非常严格的垃圾邮件过滤器
  aggressive: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 8,
      wordGapProbabilityRange: [0.3, 0.7],
      inWordProbabilityRange: [0.1, 0.3],
      maxSequenceLength: 4
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 8,
      dataAttributesCount: 5,
      randomClassesCount: 4,
      commentProbability: 0.5
    },
    cssClassRandomization: {
      enabled: true,
      strength: 8
    },
    metadataRandomization: {
      enabled: true,
      addRandomMetadataTags: true,
      randomizeTimestamps: true,
      addRenderingHints: true
    }
  },
  
  // 针对中国邮件服务商的优化配置
  chinaOptimized: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 6,
      wordGapProbabilityRange: [0.2, 0.6],
      inWordProbabilityRange: [0.05, 0.2],
      maxSequenceLength: 3
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 6,
      dataAttributesCount: 4,
      randomClassesCount: 3,
      commentProbability: 0.4
    },
    cssClassRandomization: {
      enabled: true,
      strength: 6
    },
    metadataRandomization: {
      enabled: true,
      addRandomMetadataTags: true,
      randomizeTimestamps: true,
      addRenderingHints: true
    }
  },
  
  // 针对Gmail的优化配置
  gmailOptimized: {
    zeroWidthRandomization: {
      enabled: true,
      strength: 5,
      wordGapProbabilityRange: [0.1, 0.5],
      inWordProbabilityRange: [0.05, 0.15],
      maxSequenceLength: 2
    },
    htmlAttributeRandomization: {
      enabled: true,
      strength: 4,
      dataAttributesCount: 2,
      randomClassesCount: 2,
      commentProbability: 0.3
    },
    cssClassRandomization: {
      enabled: true,
      strength: 4
    },
    metadataRandomization: {
      enabled: true,
      addRandomMetadataTags: true,
      randomizeTimestamps: true,
      addRenderingHints: false
    }
  }
};

// 导出模块
module.exports = {
  applyEmailRandomization,
  enhanceResendWorker,
  randomizeSingleEmail,
  randomizeBatchEmails,
  testRandomization,
  ConfigPresets,
  EnhancedEmailRandomizer,
  TemplateDetector,
  RANDOMIZATION_PRESETS
}; 