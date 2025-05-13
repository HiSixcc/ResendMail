/**
 * 路由管理器 - 负责处理页面导航和URL哈希管理
 */
class Router {
    constructor() {
        // 页面映射表，将路由名称映射到对应的页面URL
        this.pages = {
            'home': 'pages/home.html',
            'send': 'pages/send.html',
            'history': 'pages/history.html',
            'settings': 'pages/settings.html'
        };
        
        // 默认页面
        this.defaultPage = 'home';
        
        // 初始化
        this.init();
    }
    
    /**
     * 初始化路由
     */
    init() {
        // 监听哈希变化事件
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1); // 去掉#号
            if (hash && this.pages[hash]) {
                this.navigateTo(hash, false); // 不更新哈希，因为已经通过hashchange触发
            }
        });
        
        // 处理初始哈希
        const initialHash = window.location.hash.substring(1);
        if (initialHash && this.pages[initialHash]) {
            // 延迟执行，确保DOM已经完全加载
            setTimeout(() => {
                this.navigateTo(initialHash, false);
                // 更新导航栏激活状态
                document.querySelectorAll('.nav-link').forEach(link => {
                    link.classList.remove('active');
                });
                document.querySelector(`.nav-link[href="#${initialHash}"]`)?.classList.add('active');
            }, 100);
        }
    }
    
    /**
     * 导航到指定页面
     * @param {string} pageName - 页面名称，必须在this.pages中定义
     * @param {boolean} updateHash - 是否更新URL哈希值，默认为true
     * @returns {boolean} - 导航是否成功
     */
    navigateTo(pageName, updateHash = true) {
        // 验证页面是否存在
        if (!this.pages[pageName]) {
            console.error(`未找到页面: ${pageName}`);
            return false;
        }
        
        // 获取iframe元素
        const contentFrame = document.getElementById('contentFrame');
        if (!contentFrame) {
            console.error('未找到内容框架元素!');
            return false;
        }
        
        // 显示加载状态
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'flex';
        }
        
        // 设置iframe源URL
        contentFrame.src = this.pages[pageName];
        
        // 监听iframe加载完成事件
        contentFrame.onload = () => {
            // 隐藏加载状态
            if (loading) {
                loading.style.display = 'none';
            }
        };
        
        // 更新URL哈希（如果需要）
        if (updateHash) {
            window.location.hash = pageName;
        }
        
        return true;
    }
}

// 创建路由实例
const router = new Router(); 