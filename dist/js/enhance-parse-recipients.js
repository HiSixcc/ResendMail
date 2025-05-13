function parseRecipients(recipientsStr) {
    console.log('执行parseRecipients函数, 输入:', typeof recipientsStr, `"${recipientsStr}"`);
    const recipients = new Set(); // 使用Set自动处理重复邮件

    if (typeof recipientsStr !== 'string' || recipientsStr.trim() === '') {
        console.warn('parseRecipients: 输入不是有效字符串或为空');
        const result = Array.from(recipients);
        console.log('解析完成 (输入无效或为空), 共找到' + result.length + '个有效收件人:', result);
        return result;
    }

    // 预处理输入字符串，替换多种分隔符为统一的逗号
    let normalizedStr = recipientsStr
        .replace(/[\n\t;]/g, ',') // 替换换行、制表符和分号为逗号
        .replace(/\s+,/g, ',')    // 去除逗号前的空格
        .replace(/,\s+/g, ',')    // 去除逗号后的空格
        .replace(/,+/g, ',');     // 合并连续的逗号

    // 1. 处理常见形式的邮箱地址，如 email@example.com
    const simpleEmailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = normalizedStr.match(simpleEmailRegex);

    if (matches) {
        console.log('通过Regex初步匹配到的内容:', matches);
        for (const match of matches) {
            const email = match.trim().toLowerCase();
            if (email.includes('@') && email.length >= 3) {
                recipients.add(email);
                console.log(`添加邮箱到Set: ${email}`);
            } else {
                console.warn(`丢弃一个无效的匹配: ${email}`);
            }
        }
    } else {
        console.log('没有在输入字符串中匹配到任何邮件模式。');
    }

    // 2. 如果没有找到邮箱或找到的数量很少，尝试按逗号分隔再处理
    if (recipients.size === 0 && normalizedStr.includes(',')) {
        console.log('尝试按逗号分隔再次处理');
        const parts = normalizedStr.split(',');
        for (const part of parts) {
            const trimmed = part.trim();
            // 简单判断是否可能是邮箱
            if (trimmed.includes('@')) {
                // 再次匹配
                const match = trimmed.match(simpleEmailRegex);
                if (match && match.length > 0) {
                    const email = match[0].toLowerCase();
                    recipients.add(email);
                    console.log(`通过分隔处理添加邮箱: ${email}`);
                }
            }
        }
    }

    const result = Array.from(recipients);
    console.log('解析完成, 共找到' + result.length + '个有效收件人:', result);
    return result;
} 