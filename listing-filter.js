/* ==========================================================================
   榜单（listing）筛选：按层级标签 / 评分筛选条目。
   - 只在本页含 [data-listing]（榜单页）时生效，脚本由榜单渲染器按需引入。
   - 标签是 `-` 分隔的层级链（PL → PL-FM → PL-FM-CSL → PL-FM-CSL-Iris）：
     每一级都会生成一个按钮，点大标签命中整条子树，点小标签只看那一片；
     父级前缀淡显 + 缩进，层级一眼可见。
   - 每个 [data-listing] 独立初始化，所以同一页放多个榜单也互不干扰；
     同一容器被重复初始化（同一脚本被引入多次）会直接跳过。
   - 按钮从条目的 data-tags / data-rating 现场汇总，静态 HTML 里没有筛选文案。
   - 标签同类多选是「或」（互不为祖先/后代），标签与评分之间是「与」；再点一次取消。
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

    /* ---- 汇总筛选项（值 -> 条目数）---- */
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

    var ratingValues = Object.keys(ratingCounts).sort(function (a, b) {
      var ia = RATING_ORDER.indexOf(a);
      var ib = RATING_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

    /* 既没有标签也没有评分就没有可筛的东西，保持隐藏（不改变页面） */
    if (!Object.keys(tagCounts).length && !ratingValues.length) return;

    /* ---- 标签层级树：PL → PL-FM → PL-FM-CSL，父节点也成为一个按钮 ---- */
    var tagRoot = { path: '', name: '', children: {}, count: 0 };
    Object.keys(tagCounts).forEach(function (tag) {
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
    (function flatten(node, depth) {
      Object.keys(node.children).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (key) {
        var child = node.children[key];
        tagNodes.push({ path: child.path, name: child.name, depth: depth, count: child.count });
        flatten(child, depth + 1);
      });
    })(tagRoot, 0);

    /* 条目上已经渲染了 .tag-chip（title 里是标签全称），直接借来当提示 */
    var tagLabels = {};
    items.forEach(function (item) {
      Array.prototype.forEach.call(item.querySelectorAll('.tag-chip'), function (chip) {
        var text = (chip.textContent || '').trim();
        var label = chip.getAttribute('title');
        if (text && label) tagLabels[text] = label;
      });
    });

    /* ---- 搭界面 ---- */
    function makeChip(kind, value, count, prefixText) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip';
      chip.setAttribute('data-filter-kind', kind);
      chip.setAttribute('data-filter-value', value);
      chip.setAttribute('aria-pressed', 'false');
      if (prefixText) {
        var prefix = document.createElement('span');
        prefix.className = 'filter-chip-prefix';
        prefix.textContent = prefixText;
        chip.appendChild(prefix);
      }
      chip.appendChild(document.createTextNode(value.slice(prefixText ? prefixText.length : 0) + ' '));
      var num = document.createElement('span');
      num.className = 'filter-chip-count';
      num.textContent = String(count);
      chip.appendChild(num);
      return chip;
    }

    var chips = [];
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

    function addGroup(label, groupChips) {
      if (!groupChips.length) return;
      var group = document.createElement('div');
      group.className = 'listing-filter-group';
      var name = document.createElement('span');
      name.className = 'listing-filter-label';
      name.textContent = label;
      group.appendChild(name);
      groupChips.forEach(function (chip) {
        chips.push(chip);
        group.appendChild(chip);
      });
      box.appendChild(group);
    }

    addGroup('标签', tagNodes.map(function (node) {
      var prefix = node.path.slice(0, node.path.length - node.name.length);
      var chip = makeChip('tag', node.path, node.count, prefix);
      if (node.depth) chip.classList.add('depth-' + Math.min(node.depth, 4));
      var label = tagLabels[node.path];
      chip.title = node.path + (label && label !== node.path ? ' · ' + label : '');
      return chip;
    }));
    addGroup('评分', ratingValues.map(function (rating) {
      return makeChip('rating', rating, ratingCounts[rating]);
    }));

    var actions = document.createElement('div');
    actions.className = 'listing-filter-group';
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'filter-chip filter-reset';
    reset.textContent = '清除筛选';
    reset.hidden = true;
    actions.appendChild(reset);
    box.appendChild(actions);

    var empty = document.createElement('p');
    empty.className = 'empty listing-filter-empty';
    empty.textContent = '没有符合条件的条目。';
    empty.hidden = true;
    root.appendChild(empty);

    /* ---- 筛选 ---- */
    function setActive(chip, on) {
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    /** 同一条层级链上只保留一个选择：点 PL-FM 就自动放下 PL 与 PL-FM-CSL。 */
    function clearRelatedTags(chip) {
      var value = chip.getAttribute('data-filter-value');
      chips.forEach(function (other) {
        if (other === chip || other.getAttribute('data-filter-kind') !== 'tag') return;
        var v = other.getAttribute('data-filter-value');
        if (inSubtree(value, v) || inSubtree(v, value)) setActive(other, false);
      });
    }

    function selection() {
      var picked = {};
      chips.forEach(function (chip) {
        if (!chip.classList.contains('is-active')) return;
        var kind = chip.getAttribute('data-filter-kind');
        (picked[kind] || (picked[kind] = [])).push(chip.getAttribute('data-filter-value'));
      });
      return picked;
    }

    function tagHit(tags, picked) {
      return picked.some(function (value) {
        return tags.some(function (tag) {
          return inSubtree(tag, value);
        });
      });
    }

    function matches(item, picked) {
      return Object.keys(picked).every(function (kind) {
        if (kind === 'rating') return picked.rating.indexOf(ratingOf(item)) >= 0;
        return tagHit(tagsOf(item), picked[kind]);
      });
    }

    function apply() {
      var picked = selection();
      var active = Object.keys(picked).length > 0;
      var shown = 0;
      items.forEach(function (item) {
        var ok = matches(item, picked);
        item.hidden = !ok;
        if (ok) shown++;
      });
      empty.hidden = shown > 0;
      status.textContent = active ? '显示 ' + shown + ' / ' + total + ' 条' : '共 ' + total + ' 条';
      reset.hidden = !active;
      box.hidden = false;
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var on = !chip.classList.contains('is-active');
        setActive(chip, on);
        if (on && chip.getAttribute('data-filter-kind') === 'tag') clearRelatedTags(chip);
        apply();
      });
    });

    reset.addEventListener('click', function () {
      chips.forEach(function (chip) { setActive(chip, false); });
      apply();
    });

    apply();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-listing]'), initListing);
})();
