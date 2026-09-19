/* ==========================================================================
   榜单（listing）筛选：层级标签树 + 评分。
   - 只在本页含 [data-listing]（榜单页）时生效，脚本由榜单渲染器按需引入。
   - 标签按 `-` 分层渲染成目录树（PL → PL-FM → PL-FM-CSL → PL-FM-CSL-Iris），
     每一项前面有复选框，勾上层会把下层全部勾上，取消上层会把下层全部取消；
     下层只勾了一部分时上层显示半选（mixed）。父级可折叠，默认全部折叠。
   - 默认「全部勾上」= 没有筛选，页面就是全部条目；取消任何一项才开始筛。
     底部两个按钮：「全选」恢复默认（全部勾上），「全部取消」清空所有勾选；
     当前状态下没有意义的那一个会自动禁用。
   - 没有打标签 / 没写评分的条目不受对应筛选影响，始终显示。
   - 每个 [data-listing] 独立初始化，同页多个榜单互不干扰；
     同一容器被重复初始化（同一脚本被引入多次）会直接跳过。
   - 按钮从条目的 data-tags / data-rating 现场汇总，静态 HTML 里没有筛选文案。
   ========================================================================== */
(function () {
  'use strict';

  var RATING_ORDER = ['awesome', 'normal', 'poor', 'reading'];
  var TAG_SEP = '-';

  /** tag 是否落在 node 这棵子树里（node 自己也算）。 */
  function inSubtree(tag, node) {
    return tag === node || tag.indexOf(node + TAG_SEP) === 0;
  }

  function initListing(root) {
    if (root.getAttribute('data-listing-ready')) return; // 同一脚本被引入多次时只初始化一次
    var box = root.querySelector('[data-listing-filter]');
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-listing-item]'));
    if (!box || !items.length) return;
    root.setAttribute('data-listing-ready', '1');

    var total = items.length;

    /* ---- 汇总筛选项 ---- */
    function tagsOf(item) {
      var raw = item.getAttribute('data-tags');
      return raw ? raw.split('|') : [];
    }
    function ratingOf(item) {
      return item.getAttribute('data-rating') || '';
    }

    var tagCounts = {};
    var ratingCounts = {};
    items.forEach(function (item) {
      tagsOf(item).forEach(function (tag) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
      var rating = ratingOf(item);
      if (rating) ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;
    });

    var allTags = Object.keys(tagCounts);
    var ratingValues = Object.keys(ratingCounts).sort(function (a, b) {
      var ia = RATING_ORDER.indexOf(a);
      var ib = RATING_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

    /* 既没有标签也没有评分就没有可筛的东西，保持隐藏（不改变页面） */
    if (!allTags.length && !ratingValues.length) return;

    /* ---- 标签层级树：PL → PL-FM → PL-FM-CSL，父节点也是一个可勾选的项 ---- */
    var tagRoot = { path: '', children: {}, count: 0 };
    allTags.forEach(function (tag) {
      var node = tagRoot;
      var path = '';
      tag.split(TAG_SEP).forEach(function (part, i) {
        path = i ? path + TAG_SEP + part : part;
        if (!node.children[part]) node.children[part] = { path: path, name: part, children: {}, count: 0 };
        node = node.children[part];
      });
    });
    // 每个节点的 count = 子树内的条目数（同一条目在同一子树里只算一次）
    items.forEach(function (item) {
      var seen = {};
      tagsOf(item).forEach(function (tag) {
        var node = tagRoot;
        var path = '';
        tag.split(TAG_SEP).forEach(function (part, i) {
          path = i ? path + TAG_SEP + part : part;
          node = node.children[part];
          if (!node || seen[path]) return;
          seen[path] = 1;
          node.count++;
        });
      });
    });
    var tagNodes = [];
    (function flatten(node, depth, ancestors) {
      Object.keys(node.children).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (key) {
        var child = node.children[key];
        tagNodes.push({
          path: child.path,
          name: child.name,
          depth: depth,
          count: child.count,
          ancestors: ancestors,
          hasChildren: Object.keys(child.children).length > 0,
          // 这个节点代表的所有标签（自己 + 全部后代）
          tokens: allTags.filter(function (t) { return inSubtree(t, child.path); }),
        });
        flatten(child, depth + 1, ancestors.concat(child.path));
      });
    })(tagRoot, 0, []);

    /* 条目上已经渲染了 .tag-chip（title 里是标签全称），直接借来当提示 */
    var tagLabels = {};
    items.forEach(function (item) {
      Array.prototype.forEach.call(item.querySelectorAll('.tag-chip'), function (chip) {
        var text = (chip.textContent || '').trim();
        var label = chip.getAttribute('title');
        if (text && label) tagLabels[text] = label;
      });
    });

    /* ---- 状态：默认全选 + 目录树默认折叠 ---- */
    var checked = {};   // 标签 -> true（默认全部勾上）
    allTags.forEach(function (tag) { checked[tag] = true; });
    var ratingOn = {};  // 评分 -> true（默认全部勾上）
    ratingValues.forEach(function (rating) { ratingOn[rating] = true; });
    var collapsed = {}; // 路径 -> true（默认有子节点的都折叠）
    var rows = {};      // 路径 -> { row, check, mark, caret }

    function stateOf(node) {
      var inside = 0;
      node.tokens.forEach(function (t) { if (checked[t]) inside++; });
      if (!inside) return 'unchecked';
      return inside === node.tokens.length ? 'checked' : 'mixed';
    }

    function toggleNode(node) {
      var on = stateOf(node) !== 'checked';
      node.tokens.forEach(function (t) {
        if (on) checked[t] = true;
        else delete checked[t];
      });
    }

    function tagsUnfiltered() {
      return allTags.every(function (t) { return checked[t]; });
    }
    function ratingsUnfiltered() {
      return ratingValues.every(function (r) { return ratingOn[r]; });
    }

    /* ---- 搭界面 ---- */
    var head = document.createElement('div');
    head.className = 'listing-filter-head';
    var title = document.createElement('span');
    title.className = 'listing-filter-title';
    title.textContent = '筛选';
    var status = document.createElement('span');
    status.className = 'listing-filter-status';
    head.appendChild(title);
    head.appendChild(status);
    box.appendChild(head);

    function addGroup(label, content) {
      if (!content) return null;
      var group = document.createElement('div');
      group.className = 'listing-filter-group';
      var name = document.createElement('span');
      name.className = 'listing-filter-label';
      name.textContent = label;
      group.appendChild(name);
      group.appendChild(content);
      box.appendChild(group);
      return group;
    }

    /** 复选框行：目录树的节点与评分都用它，交互和样式保持一致。 */
    function makeCheck(kind, value, labelText, count) {
      var check = document.createElement('button');
      check.type = 'button';
      check.className = 'tag-check' + (kind === 'rating' ? ' rating-check' : '');
      check.setAttribute('role', 'checkbox');
      check.setAttribute('data-filter-kind', kind);
      check.setAttribute('data-filter-value', value);
      var boxEl = document.createElement('span');
      boxEl.className = 'tag-check-box';
      var mark = document.createElement('span');
      mark.className = 'tag-check-mark';
      boxEl.appendChild(mark);
      var label = document.createElement('span');
      label.className = 'tag-check-label';
      label.textContent = labelText;
      var num = document.createElement('span');
      num.className = 'tag-check-count';
      num.textContent = String(count);
      check.appendChild(boxEl);
      check.appendChild(label);
      check.appendChild(num);
      check.listeners = { mark: mark, label: label, count: num };
      return check;
    }

    var ratingChecks = ratingValues.map(function (rating) {
      var check = makeCheck('rating', rating, rating, ratingCounts[rating]);
      check.title = rating;
      check.addEventListener('click', function () {
        var on = check.getAttribute('aria-checked') !== 'true';
        ratingOn[rating] = on;
        if (!on) delete ratingOn[rating];
        refresh();
      });
      return check;
    });
    if (ratingChecks.length) {
      var ratingWrap = document.createElement('div');
      ratingWrap.className = 'listing-filter-ratings';
      ratingChecks.forEach(function (check) { ratingWrap.appendChild(check); });
      addGroup('评分', ratingWrap);
    }

    var treeHtml = null;
    if (tagNodes.length) {
      treeHtml = document.createElement('div');
      treeHtml.className = 'tag-tree';

      function renderTree() {
        tagNodes.forEach(function (node) {
          var row = rows[node.path];
          if (!row) return;
          row.row.hidden = node.ancestors.some(function (p) { return collapsed[p]; });
        });
      }

      tagNodes.forEach(function (node) {
        var row = document.createElement('div');
        row.className = 'tag-tree-node' + (node.depth ? ' depth-' + Math.min(node.depth, 4) : '');

        if (node.hasChildren) collapsed[node.path] = true; // 默认折叠

        var caret = document.createElement('button');
        caret.type = 'button';
        caret.className = 'tag-caret' + (node.hasChildren ? '' : ' is-leaf');
        caret.setAttribute('aria-expanded', collapsed[node.path] ? 'false' : 'true');
        caret.textContent = node.hasChildren ? (collapsed[node.path] ? '▸' : '▾') : '·';
        caret.addEventListener('click', function () {
          if (!node.hasChildren) return;
          if (collapsed[node.path]) delete collapsed[node.path];
          else collapsed[node.path] = true;
          caret.textContent = collapsed[node.path] ? '▸' : '▾';
          caret.setAttribute('aria-expanded', collapsed[node.path] ? 'false' : 'true');
          renderTree();
        });

        var check = makeCheck('tag', node.path, node.name, node.count);
        var label = tagLabels[node.path];
        check.title = node.path + (label && label !== node.path ? ' · ' + label : '');
        check.addEventListener('click', function () {
          toggleNode(node);
          refresh();
        });

        row.appendChild(caret);
        row.appendChild(check);
        treeHtml.appendChild(row);
        rows[node.path] = { row: row, check: check, mark: check.listeners.mark, caret: caret };
      });
      addGroup('标签', treeHtml);
      renderTree(); // 默认折叠：先把各父级的后代行收起来
    }

    var actions = document.createElement('div');
    actions.className = 'listing-filter-group';
    var selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'filter-chip filter-select-all';
    selectAll.textContent = '全选';
    selectAll.addEventListener('click', function () {
      allTags.forEach(function (t) { checked[t] = true; });
      ratingValues.forEach(function (rating) { ratingOn[rating] = true; });
      refresh();
    });

    var clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'filter-chip filter-reset';
    clearAll.textContent = '全部取消';
    clearAll.addEventListener('click', function () {
      allTags.forEach(function (t) { delete checked[t]; });
      ratingValues.forEach(function (rating) { delete ratingOn[rating]; });
      refresh();
    });

    actions.appendChild(selectAll);
    actions.appendChild(clearAll);
    box.appendChild(actions);

    var empty = document.createElement('p');
    empty.className = 'empty listing-filter-empty';
    empty.textContent = '没有符合条件的条目。';
    empty.hidden = true;
    root.appendChild(empty);

    /* ---- 应用筛选 ---- */
    function apply() {
      var tagFiltered = !tagsUnfiltered();
      var ratingFiltered = !ratingsUnfiltered();
      var active = tagFiltered || ratingFiltered;
      var shown = 0;
      items.forEach(function (item) {
        var tags = tagsOf(item);
        var rating = ratingOf(item);
        // 没打标签 / 没写评分的条目不受对应筛选影响
        var ok = !(tagFiltered && tags.length) || tags.some(function (t) { return checked[t]; });
        if (ok && ratingFiltered && rating) ok = !!ratingOn[rating];
        item.hidden = !ok;
        if (ok) shown++;
      });
      empty.hidden = shown > 0;
      status.textContent = active ? '显示 ' + shown + ' / ' + total + ' 条' : '共 ' + total + ' 条';
      // 没有筛选 = 全部勾上 ->「全选」无事可做；一项都没勾 ->「全部取消」无事可做
      var anyOn = allTags.some(function (t) { return checked[t]; })
        || ratingValues.some(function (rating) { return ratingOn[rating]; });
      selectAll.disabled = !active;
      clearAll.disabled = !anyOn;
      box.hidden = false;
    }

    function refresh() {
      tagNodes.forEach(function (node) {
        var state = stateOf(node);
        var row = rows[node.path];
        // aria-checked 只接受 "true" / "false" / "mixed"
        row.check.setAttribute('aria-checked', state === 'checked' ? 'true' : state === 'mixed' ? 'mixed' : 'false');
        row.mark.textContent = state === 'mixed' ? '–' : '✓';
      });
      ratingChecks.forEach(function (check) {
        var on = !!ratingOn[check.getAttribute('data-filter-value')];
        check.setAttribute('aria-checked', on ? 'true' : 'false');
        check.listeners.mark.textContent = '✓';
      });
      apply();
    }

    refresh();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-listing]'), initListing);
})();
