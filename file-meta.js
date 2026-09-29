'use strict';

(() => {
  const isDivider = (line) => line.trim() === '---';

  // Slidev 的分隔符既用于全局 headmatter，也用于每页可选的 frontmatter。
  // 这里跳过这些 YAML 边界，只统计真正开始的新页面。
  function countSlidevPages(source) {
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
    const nextDivider = (from) => {
      for (let i = from; i < lines.length; i += 1) if (isDivider(lines[i])) return i;
      return -1;
    };
    const hasContent = (from) => lines.slice(from).some((line) => line.trim() && !line.trim().startsWith('<!--'));
    const looksLikeFrontmatter = (from, to) => {
      const first = lines.slice(from, to)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));
      return !!first && /^[A-Za-z_][\w-]*\s*:/.test(first);
    };

    let cursor = lines.findIndex((line) => line.trim() !== '');
    if (cursor < 0) return 0;

    // 第一对 --- 是整套幻灯的全局 headmatter，不是一页。
    if (isDivider(lines[cursor])) {
      const headmatterEnd = nextDivider(cursor + 1);
      if (headmatterEnd >= 0) cursor = headmatterEnd + 1;
    }

    let count = hasContent(cursor) ? 1 : 0;
    while (cursor < lines.length) {
      const divider = nextDivider(cursor);
      if (divider < 0) break;
      count += 1;

      const possibleFrontmatterEnd = nextDivider(divider + 1);
      if (
        possibleFrontmatterEnd >= 0 &&
        looksLikeFrontmatter(divider + 1, possibleFrontmatterEnd)
      ) {
        cursor = possibleFrontmatterEnd + 1;
      } else {
        cursor = divider + 1;
      }
    }
    return count;
  }

  // 保留纯函数导出，便于构建前用真实远端 Markdown 做回归检查。
  if (typeof module !== 'undefined' && module.exports) module.exports = { countSlidevPages };
  if (typeof document === 'undefined') return;

  const counters = [...document.querySelectorAll('[data-slide-source]')];
  if (!counters.length) return;

  const CACHE_KEY = 'lwlaymh-slide-page-counts-v1';
  const CACHE_TTL = 60 * 60 * 1000;
  let pageCache = {};
  try {
    pageCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
  } catch (error) {
    pageCache = {};
  }

  const showCount = (node, pages) => {
    node.textContent = `${pages} 页`;
    node.classList.remove('is-loading', 'is-unavailable');
  };

  const saveCache = () => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(pageCache)); } catch (error) { /* 无存储权限时静默退化 */ }
  };

  async function updateCounter(node) {
    const source = node.dataset.slideSource;
    if (!source) return;
    try {
      const response = await fetch(source, { cache: 'default', mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const pages = countSlidevPages(await response.text());
      if (!Number.isFinite(pages) || pages < 1) throw new Error('invalid page count');
      pageCache[source] = { pages, checkedAt: Date.now() };
      saveCache();
      showCount(node, pages);
    } catch (error) {
      const cached = pageCache[source];
      if (cached && Number.isFinite(cached.pages)) showCount(node, cached.pages);
      else {
        node.textContent = '页数暂不可用';
        node.classList.add('is-unavailable');
      }
    }
  }

  const staleCounters = counters.filter((node) => {
    const cached = pageCache[node.dataset.slideSource];
    if (cached && Number.isFinite(cached.pages)) showCount(node, cached.pages);
    else node.classList.add('is-loading');
    return !cached || !Number.isFinite(cached.pages) ||
      !Number.isFinite(cached.checkedAt) || Date.now() - cached.checkedAt >= CACHE_TTL;
  });
  if (!staleCounters.length) return;

  const updateAll = () => Promise.allSettled(staleCounters.map(updateCounter));
  if ('requestIdleCallback' in window) window.requestIdleCallback(updateAll, { timeout: 1800 });
  else window.setTimeout(updateAll, 0);
})();
