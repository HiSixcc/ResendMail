/**
 * 应用程序入口文件
 * 负责初始化所有组件和监听DOM加载完成事件
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('应用程序初始化...');
    
    // 确保路由器正确初始化
    // 注意：router已在router.js中初始化，这里无需再次初始化
    
    // 初始化时添加事件监听器
    initEventListeners();
});

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 为导航链接添加事件监听（如果需要额外的处理逻辑）
    // 注意：主要的导航事件已在HTML中通过onclick处理
    
    // 在窗口大小变化时调整布局
    window.addEventListener('resize', adjustLayout);
    
    // 初始调整一次布局
    adjustLayout();
}

/**
 * 调整布局以适应不同屏幕尺寸
 */
function adjustLayout() {
    const iframe = document.getElementById('contentFrame');
    const navbar = document.querySelector('.navbar');
    
    if (iframe && navbar) {
        // 确保iframe高度正确，避免出现多余的滚动条
        // 这里不需要明确设置高度，因为我们使用了flex布局
        // iframe.style.height = `${window.innerHeight - navbar.offsetHeight}px`;
    }
} 