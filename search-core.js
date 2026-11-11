/* Shared by the browser and search regression tests. */
(function (root) {
  'use strict';
  function prepare(posts) {
    return posts.map(function (post) {
      return { post: post, title: post.title.toLowerCase(),
        category: (post.category || '').toLowerCase(),
        text: (post.text || '').toLowerCase() };
    });
  }
  function find(index, query, limit) {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    return index.map(function (item, order) {
      var post = item.post;
      var titleAt = item.title.indexOf(q);
      var categoryAt = item.category.indexOf(q);
      var textAt = item.text.indexOf(q);
      var score = titleAt >= 0 ? (item.title === q ? 14000 : titleAt === 0 ? 12000 : 10000) : 0;
      if (categoryAt >= 0) score += 3000;
      if (textAt >= 0) score += 500;
      var section = textAt >= 0 && titleAt < 0
        ? (post.sections || []).find(function (s) { return s.start <= textAt && s.end > textAt; }) : null;
      var start = Math.max(section ? section.start : 0, textAt - 55);
      var end = Math.min((post.text || '').length, Math.max(start + 160, textAt + q.length + 35));
      return { post: post, score: score, order: order,
        url: post.url + (section && section.id ? '#' + encodeURIComponent(section.id) : ''),
        section: section ? section.title : '',
        snippet: textAt >= 0 ? (start ? '…' : '') + post.text.slice(start, end) + (end < post.text.length ? '…' : '') : post.excerpt || '' };
    }).filter(function (hit) { return hit.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.order - b.order; })
      .slice(0, limit || 12);
  }
  var api = { prepare: prepare, find: find };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BlogSearch = api;
})(typeof window === 'object' ? window : globalThis);
