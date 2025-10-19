// 店铺页面检测
if (window.location.href.includes('/seller/')) {
  console.log('检测到Ozon卖家店铺页面');
  showControlPanel();
}

// 显示控制面板
function showControlPanel() {
  const panel = document.createElement('div');
  panel.id = 'ozon-helper-panel';
  panel.innerHTML = `
    <h3>Ozon选品控制台</h3>
    <div class="progress">
      <progress value="0" max="100"></progress>
      <span class="status">等待开始...</span>
    </div>
  `;
  document.body.prepend(panel);
}

// 监听开始分析消息
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "start-analysis") {
    startAnalysis(request.settings);
  }
  return true;
});

// 主分析函数
async function startAnalysis(settings) {
  console.log('开始分析，设置:', settings);
  updateStatus('正在采集商品列表...');
  
  try {
    const products = await getAllProducts();
    updateStatus(`成功采集 ${products.length} 个商品`);
    
    // 这里后续会添加数据分析代码
    console.log('采集到的商品:', products);
    
  } catch (error) {
    console.error('分析失败:', error);
    updateStatus('分析失败: ' + error.message);
  }
}

// 更新状态显示
function updateStatus(message) {
  const statusEl = document.querySelector('#ozon-helper-panel .status');
  if (statusEl) statusEl.textContent = message;
}

// 获取所有商品
async function getAllProducts() {
  const products = [];
  console.log('开始采集商品数据...');
  updateStatus('正在滚动加载商品...');
  
  // 自动滚动页面
  await autoScrollPage();
  
  // 获取商品元素 - 注意选择器可能需要调整
  const cards = document.querySelectorAll('.tile');
  console.log(`找到 ${cards.length} 个商品卡片`);
  
  // 提取每个商品信息
  cards.forEach((card, index) => {
    try {
      products.push({
        sku: card.dataset.sku || `未知SKU_${index}`,
        name: card.querySelector('.title')?.innerText || '未知商品',
        price: card.querySelector('.price')?.innerText || '0₽',
        url: card.querySelector('a')?.href || window.location.href,
      });
    } catch (error) {
      console.error(`解析第 ${index} 个商品失败:`, error);
    }
  });
  
  return products;
}

// 自动滚动页面加载所有商品
async function autoScrollPage() {
  return new Promise((resolve) => {
    let scrollHeight = 0;
    const scrollStep = 500; // 每次滚动500像素
    let scrollAttempts = 0;
    const maxAttempts = 50; // 最多尝试50次
    
    console.log('开始自动滚动...');
    
    const scrollInterval = setInterval(() => {
      // 滚动页面
      window.scrollBy(0, scrollStep);
      scrollHeight += scrollStep;
      scrollAttempts++;
      
      // 更新进度显示
      const progress = Math.min(100, Math.floor((scrollHeight / document.body.scrollHeight) * 100));
      document.querySelector('#ozon-helper-panel progress').value = progress;
      
      // 停止条件
      if (scrollAttempts >= maxAttempts || scrollHeight >= document.body.scrollHeight) {
        clearInterval(scrollInterval);
        console.log('滚动完成，最终位置:', scrollHeight);
        setTimeout(resolve, 3000); // 等待3秒让最后商品加载
      }
    }, 1000); // 每秒滚动一次
  });
}
