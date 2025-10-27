(() => {
  const SIDEBAR_ID = 'ozon-helper-sidebar';
  const STORAGE_KEY = 'collectionSettings';
  const state = {
    isCollecting: false,
    collectedProducts: [],
    desiredCount: 0,
    targetUrl: ''
  };

  const dom = {
    sidebar: null,
    linkInput: null,
    countInput: null,
    startButton: null,
    progress: null,
    counter: null,
    status: null
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    if (!document.body) {
      return;
    }

    if (document.getElementById(SIDEBAR_ID)) {
      return;
    }

    createSidebar();
    cacheDom();

    const saved = await loadSettings();
    const initialUrl = saved.targetUrl || window.location.href;
    const savedDesired = Number.parseInt(saved.desiredCount, 10);
    const initialCount = Number.isFinite(savedDesired) && savedDesired > 0 ? savedDesired : 50;

    dom.linkInput.value = initialUrl;
    dom.countInput.value = initialCount;

    state.targetUrl = dom.linkInput.value.trim();
    state.desiredCount = initialCount;

    setProgress(0, state.desiredCount);
    setCounter(0, state.desiredCount);
    updateStatus('等待操作...', 'info');

    dom.startButton.addEventListener('click', handleStartClick);

    if (saved.collecting && saved.targetUrl) {
      if (isSameUrl(window.location.href, saved.targetUrl)) {
        await runCollection(
          {
            targetUrl: saved.targetUrl,
            desiredCount: saved.desiredCount || initialCount
          },
          { resume: true }
        );
      } else {
        updateStatus('等待跳转到目标页面...', 'warning');
      }
    }
  }

  function createSidebar() {
    const sidebar = document.createElement('aside');
    sidebar.id = SIDEBAR_ID;
    sidebar.innerHTML = `
      <div class="ozon-helper-header">Ozon选品助手</div>
      <div class="ozon-helper-body">
        <label>
          <span>采集链接</span>
          <input type="text" id="ozon-helper-url-input" placeholder="https://www.ozon.ru/..." />
        </label>
        <label>
          <span>采集数量</span>
          <input type="number" id="ozon-helper-amount-input" min="1" max="5000" value="50" />
        </label>
        <button id="ozon-helper-start-btn">开始采集</button>
        <div class="ozon-helper-progress-wrapper">
          <progress id="ozon-helper-progress" value="0" max="100"></progress>
          <span id="ozon-helper-counter">已采集 0 / 0</span>
        </div>
        <div id="ozon-helper-status" class="info">等待操作...</div>
      </div>
    `;
    document.body.appendChild(sidebar);
  }

  function cacheDom() {
    dom.sidebar = document.getElementById(SIDEBAR_ID);
    dom.linkInput = document.getElementById('ozon-helper-url-input');
    dom.countInput = document.getElementById('ozon-helper-amount-input');
    dom.startButton = document.getElementById('ozon-helper-start-btn');
    dom.progress = document.getElementById('ozon-helper-progress');
    dom.counter = document.getElementById('ozon-helper-counter');
    dom.status = document.getElementById('ozon-helper-status');
  }

  async function handleStartClick(event) {
    event.preventDefault();
    if (state.isCollecting) {
      return;
    }

    const rawUrl = (dom.linkInput.value || '').trim();
    const countValue = Number.parseInt(dom.countInput.value, 10);

    if (!rawUrl) {
      updateStatus('请输入需要采集的链接', 'error');
      return;
    }

    const urlObject = toValidUrl(rawUrl);
    if (!urlObject) {
      updateStatus('请输入有效的链接地址', 'error');
      return;
    }

    if (!urlObject.hostname.endsWith('ozon.ru')) {
      updateStatus('目前仅支持Ozon站点的链接，请检查输入', 'error');
      return;
    }

    if (!Number.isFinite(countValue) || countValue <= 0) {
      updateStatus('请输入有效的采集数量', 'error');
      return;
    }

    const desiredCount = Math.min(Math.max(countValue, 1), 5000);

    state.targetUrl = urlObject.toString();
    state.desiredCount = desiredCount;

    dom.linkInput.value = state.targetUrl;
    dom.countInput.value = desiredCount;

    await saveSettings({
      targetUrl: state.targetUrl,
      desiredCount: state.desiredCount,
      collecting: true
    });

    if (!isSameUrl(window.location.href, state.targetUrl)) {
      toggleCollectingUI(true);
      setProgress(0, state.desiredCount);
      setCounter(0, state.desiredCount);
      updateStatus('即将跳转到目标页面...', 'info');
      setTimeout(() => {
        window.location.href = state.targetUrl;
      }, 200);
      return;
    }

    await runCollection(
      {
        targetUrl: state.targetUrl,
        desiredCount: state.desiredCount
      },
      { resume: false }
    );
  }

  async function runCollection(settings, options = {}) {
    if (state.isCollecting) {
      return;
    }

    state.isCollecting = true;
    toggleCollectingUI(true);
    setProgress(0, settings.desiredCount);
    setCounter(0, settings.desiredCount);
    updateStatus(options.resume ? '继续采集商品...' : '开始采集商品...', 'info');

    try {
      window.scrollTo({ top: 0 });
    } catch (error) {
      window.scrollTo(0, 0);
    }

    try {
      const products = await collectProducts(settings.desiredCount);
      state.collectedProducts = products;

      if (products.length >= settings.desiredCount) {
        updateStatus(`采集完成：共 ${products.length} 个商品`, 'success');
        setProgress(products.length, settings.desiredCount);
      } else {
        updateStatus(`仅采集到 ${products.length} 个商品，未达到设定数量`, 'warning');
        setProgress(products.length, settings.desiredCount);
      }

      console.log('采集到的商品：', products);
    } catch (error) {
      console.error('采集失败:', error);
      updateStatus(`采集失败：${error.message}`, 'error');
    } finally {
      state.isCollecting = false;
      toggleCollectingUI(false);
      await saveSettings({
        targetUrl: settings.targetUrl,
        desiredCount: settings.desiredCount,
        collecting: false
      });
    }
  }

  async function collectProducts(desiredCount) {
    const collected = new Map();
    let attempts = 0;
    let stagnation = 0;
    const maxAttempts = Math.min(Math.max(80, desiredCount * 2), 600);
    const maxStagnation = 20;

    await wait(400);

    while (attempts < maxAttempts && collected.size < desiredCount) {
      const before = collected.size;
      collectFromCards(collected);
      const after = collected.size;

      setCounter(after, desiredCount);
      setProgress(after, desiredCount);

      if (after >= desiredCount) {
        break;
      }

      stagnation = after === before ? stagnation + 1 : 0;
      if (stagnation >= maxStagnation) {
        console.debug('滚动多次后未发现新商品，停止继续滚动');
        break;
      }

      await scrollForMore();
      attempts += 1;
    }

    if (collected.size === 0) {
      throw new Error('页面上没有找到商品，请确认链接是否正确');
    }

    return Array.from(collected.values()).slice(0, desiredCount);
  }

  function collectFromCards(collection) {
    const seenNodes = new Set();
    const selectors = [
      '[data-widget="megaPaginator"] .tile',
      '[data-widget^="searchResults"] .tile',
      '.widget-search-result .tile',
      '.tile'
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((card) => {
        if (seenNodes.has(card)) {
          return;
        }
        seenNodes.add(card);

        const data = extractProductData(card, collection.size + seenNodes.size);
        if (!data) {
          return;
        }

        const key = data.sku || data.url || `index-${collection.size + seenNodes.size}`;
        if (!collection.has(key)) {
          collection.set(key, data);
        }
      });
    });
  }

  function extractProductData(card, fallbackIndex) {
    try {
      const linkEl = card.querySelector('a[href]');
      const url = linkEl ? linkEl.href : window.location.href;

      let sku = card.dataset?.sku || card.getAttribute('data-sku');
      if (!sku && linkEl) {
        const skuMatch = linkEl.href.match(/(?:\/|sku=)(\d{5,})/);
        if (skuMatch) {
          sku = skuMatch[1];
        }
      }

      const nameSelectors = [
        '.tile-title',
        '.title',
        '.tile-name',
        '[data-widget="webProductHeading"] span',
        'a span',
        'h2',
        'h3'
      ];

      let name = '';
      for (const selector of nameSelectors) {
        const titleEl = card.querySelector(selector);
        if (titleEl && titleEl.textContent.trim()) {
          name = titleEl.textContent.trim();
          break;
        }
      }
      if (!name) {
        name = '未知商品';
      }

      const price = extractPrice(card);

      return {
        sku: sku || `未知SKU_${fallbackIndex}`,
        name,
        price,
        url
      };
    } catch (error) {
      console.error('解析商品信息失败:', error);
      return null;
    }
  }

  function extractPrice(card) {
    const priceSelectors = [
      '[data-widget="webPrice"]',
      '[data-widget="price"]',
      '.tile-price',
      '.price',
      '.widget-price',
      '[class*="price"]'
    ];

    for (const selector of priceSelectors) {
      const el = card.querySelector(selector);
      if (el) {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (text) {
          return text;
        }
      }
    }

    const textContent = card.textContent || '';
    const match = textContent.match(/\d[\d\s\u00A0]*\s?₽/);
    if (match) {
      return match[0].replace(/\s+/g, ' ').trim();
    }

    return '价格未知';
  }

  async function scrollForMore() {
    const previousScroll = window.scrollY;
    const previousHeight = document.documentElement.scrollHeight;

    window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' });
    await wait(1100);

    const reachedBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 20;
    if (reachedBottom) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      await wait(1200);
    }

    const heightChanged = document.documentElement.scrollHeight > previousHeight || window.scrollY > previousScroll;
    if (!heightChanged) {
      await wait(600);
    }
  }

  function toggleCollectingUI(collecting) {
    if (dom.startButton) {
      dom.startButton.disabled = collecting;
      dom.startButton.textContent = collecting ? '采集中...' : '开始采集';
    }

    if (dom.linkInput) {
      dom.linkInput.disabled = collecting;
    }

    if (dom.countInput) {
      dom.countInput.disabled = collecting;
    }
  }

  function updateStatus(message, type = 'info') {
    if (!dom.status) {
      return;
    }
    dom.status.textContent = message;
    dom.status.classList.remove('info', 'warning', 'error', 'success');
    if (type) {
      dom.status.classList.add(type);
    }
  }

  function setProgress(collected, desired) {
    if (!dom.progress) {
      return;
    }
    const percent = desired > 0 ? Math.min(100, Math.round((collected / desired) * 100)) : 0;
    dom.progress.value = percent;
  }

  function setCounter(collected, desired) {
    if (!dom.counter) {
      return;
    }
    if (desired > 0) {
      dom.counter.textContent = `已采集 ${Math.min(collected, desired)} / ${desired}`;
    } else {
      dom.counter.textContent = `已采集 ${collected} 个商品`;
    }
  }

  function toValidUrl(value) {
    try {
      return new URL(value, window.location.href);
    } catch (error) {
      return null;
    }
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = '';
      if (url.pathname !== '/') {
        url.pathname = url.pathname.replace(/\/+$/, '');
        if (!url.pathname) {
          url.pathname = '/';
        }
      }
      return url.toString();
    } catch (error) {
      return value;
    }
  }

  function isSameUrl(a, b) {
    return normalizeUrl(a) === normalizeUrl(b);
  }

  function wait(duration) {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          resolve(result[STORAGE_KEY] || {});
        });
      } catch (error) {
        console.error('读取存储失败:', error);
        resolve({});
      }
    });
  }

  function saveSettings(settings) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: settings }, resolve);
      } catch (error) {
        console.error('保存存储失败:', error);
        resolve();
      }
    });
  }
})();
