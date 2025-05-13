/**
 * UI控制器
 * 负责管理页面UI交互和状态
 */

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
        
        const activeLink = document.querySelector(`.nav-link[href="#${pageName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }
};

/**
 * 显示消息通知
 * @param {string} message - 要显示的消息
 * @param {string} type - 消息类型 (success, error, warning, info)
 * @param {number} duration - 消息显示时长(毫秒)
 */
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
    
    // 根据类型设置背景色
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.backgroundColor = '#F44336';
            notification.style.color = 'white';
            break;
        case 'warning':
            notification.style.backgroundColor = '#FF9800';
            notification.style.color = 'white';
            break;
        case 'info':
        default:
            notification.style.backgroundColor = '#2196F3';
            notification.style.color = 'white';
            break;
    }
    
    // 添加到容器
    notificationContainer.appendChild(notification);
    
    // 显示通知
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // 自动关闭通知
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-10px)';
        
        // 移除元素
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
} 