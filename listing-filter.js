/* ==========================================================================
   榜单（listing）筛选：层级标签树 + 评分。
   - 只在本页含 [data-listing]（榜单页）时生效，脚本由榜单渲染器按需引入。
   - 标签按 `-` 分层渲染成目录树（PL → PL-FM → PL-FM-CSL → PL-FM-CSL-Iris）：
     每一项前面有复选框，勾上层会把下层全部勾上，取消上层会把下层全部取消；
     下层只勾了一部分时，上层显示半选（mixed）。
   - 内部只维护「已勾选的标签」这一个集合，级联与半选都是它推出来的。
   - 有子节点的行可以折叠；每个 [data-listing] 独立初始化，同页多个榜单互不干扰；
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

    /* ---- 状态：已勾选的标签 + 折叠的行 ---- */
    var checked = {};   // 标签 -> true
    var collapsed = {}; // 路径 -> true
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

    var ratingChips = [];
    function makeRatingChip(value, count) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip';
      chip.setAttribute('data-filter-kind', 'rating');
      chip.setAttribute('data-filter-value', value);
      chip.setAttribute('aria-pressed', 'false');
      chip.appendChild(document.createTextNode(value + ' '));
      var num = document.createElement('span');
      num.className = 'filter-chip-count';
      num.textContent = String(count);
      chip.appendChild(num);
      chip.addEventListener('click', function () {
        var on = !chip.classList.contains('is-active');
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        apply();
      });
      ratingChips.push(chip);
      return chip;
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

        var caret = document.createElement('button');
        caret.type = 'button';
        caret.className = 'tag-caret' + (node.hasChildren ? '' : ' is-leaf');
        caret.setAttribute('aria-expanded', 'true');
        caret.textContent = node.hasChildren ? '▾' : '·';
        caret.addEventListener('click', function () {
          if (!node.hasChildren) return;
          if (collapsed[node.path]) delete collapsed[node.path];
          else collapsed[node.path] = true;
          caret.textContent = collapsed[node.path] ? '▸' : '▾';
          caret.setAttribute('aria-expanded', collapsed[node.path] ? 'false' : 'true');
          renderTree();
        });

        var check = document.createElement('button');
        check.type = 'button';
        check.className = 'tag-check';
        check.setAttribute('role', 'checkbox');
        check.setAttribute('data-filter-value', node.path);
        var box_ = document.createElement('span');
        box_.className = 'tag-check-box';
        var mark = document.createElement('span');
        mark.className = 'tag-check-mark';
        box_.appendChild(mark);
        var label = document.createElement('span');
        label.className = 'tag-tree-label';
        label.textContent = node.name;
        var count = document.createElement('span');
        count.className = 'tag-tree-count';
        count.textContent = String(node.count);
        check.appendChild(box_);
        check.appendChild(label);
        check.appendChild(count);
        var full = node.path + (tagLabels[node.path] && tagLabels[node.path] !== node.path ? ' · ' + tagLabels[node.path] : '');
        check.title = full;
        check.addEventListener('click', function () {
          toggleNode(node);
          refresh();
        });

        row.appendChild(caret);
        row.appendChild(check);
        treeHtml.appendChild(row);
        rows[node.path] = { row: row, check: check, mark: mark, caret: caret };
      });
      addGroup('标签', treeHtml);
    }
    if (ratingValues.length) {
      var ratingWrap = document.createElement('span');
      ratingWrap.className = 'listing-filter-ratings';
      ratingValues.forEach(function (rating) {
        ratingWrap.appendChild(makeRatingChip(rating, ratingCounts[rating]));
      });
      addGroup('评分', ratingWrap);
    }

    var actions = document.createElement('div');
    actions.className = 'listing-filter-group';
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'filter-chip filter-reset';
    reset.textContent = '清除筛选';
    reset.hidden = true;
    reset.addEventListener('click', function () {
      tagNodes.forEach(function (node) {
        node.tokens.forEach(function (t) { delete checked[t]; });
      });
      ratingChips.forEach(function (chip) {
        chip.classList.remove('is-active');
        chip.setAttribute('aria-pressed', 'false');
      });
      refresh();
    });
    actions.appendChild(reset);
    box.appendChild(actions);

    var empty = document.createElement('p');
    empty.className = 'empty listing-filter-empty';
    empty.textContent = '没有符合条件的条目。';
    empty.hidden = true;
    root.appendChild(empty);

    /* ---- 应用筛选 ---- */
    function apply() {
      var tagActive = Object.keys(checked).length > 0;
      var ratings = ratingChips
        .filter(function (chip) { return chip.classList.contains('is-active'); })
        .map(function (chip) { return chip.getAttribute('data-filter-value'); });
      var active = tagActive || ratings.length > 0;
      var shown = 0;
      items.forEach(function (item) {
        var ok = !tagActive || tagsOf(item).some(function (t) { return checked[t]; });
        if (ok && ratings.length) ok = ratings.indexOf(ratingOf(item)) >= 0;
        item.hidden = !ok;
        if (ok) shown++;
      });
      empty.hidden = shown > 0;
      status.textContent = active ? '显示 ' + shown + ' / ' + total + ' 条' : '共 ' + total + ' 条';
      reset.hidden = !active;
      box.hidden = false;
    }

    function refresh() {
      tagNodes.forEach(function (node) {
        var state = stateOf(node);
        var row = rows[node.path];
        row.check.setAttribute('aria-checked', state);
        row.mark.textContent = state === 'mixed' ? '–' : '✓';
      });
      apply();
    }

    refresh();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-listing]'), initListing);
})();
