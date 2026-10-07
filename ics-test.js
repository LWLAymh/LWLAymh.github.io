(function () {
  'use strict';

  const app = document.getElementById('ics-app');
  if (!app) return;

  const $ = (id) => document.getElementById(id);
  const ui = {
    setup: $('ics-setup'), modules: $('ics-modules'), bankSummary: $('ics-bank-summary'),
    selectToggle: $('ics-select-toggle'), count: $('ics-count'), examType: $('ics-exam-type'),
    start: $('ics-start'), setupError: $('ics-setup-error'), quiz: $('ics-quiz'),
    abandon: $('ics-abandon'), progressText: $('ics-progress-text'), scoreText: $('ics-score-text'),
    progressBar: $('ics-progress-bar'), questionMeta: $('ics-question-meta'),
    questionTitle: $('ics-question-title'), questionContent: $('ics-question-content'),
    answerForm: $('ics-answer-form'), answer: $('ics-answer'), submit: $('ics-submit'),
    feedback: $('ics-feedback'), verdict: $('ics-verdict'), reference: $('ics-reference'),
    selfGrade: $('ics-self-grade'), next: $('ics-next'), result: $('ics-result'),
    finalScore: $('ics-final-score'), finalSummary: $('ics-final-summary'), retry: $('ics-retry'),
    reviewToggle: $('ics-review-toggle'), reviewList: $('ics-review-list'),
  };

  const state = { catalog: null, questions: [], index: 0, score: 0, records: [], answerBlocks: new Map() };
  const md = window.markdownit ? window.markdownit({ html: false, linkify: true, breaks: false }) : null;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cleanMarkdown(source) {
    return String(source || '')
      .replace(/<!--\s*=+\s*page\s+\d+\s*=+\s*-->/gi, '')
      .replace(/^\s*\d+\s*$(?=\s*\n)/gm, '');
  }

  function renderMarkdown(source) {
    const clean = cleanMarkdown(source);
    return md ? md.render(clean) : '<pre>' + escapeHtml(clean) + '</pre>';
  }

  function typeset(element) {
    if (!window.MathJax || !window.MathJax.typesetPromise) return;
    if (window.MathJax.typesetClear) window.MathJax.typesetClear([element]);
    window.MathJax.typesetPromise([element]).catch(function () {});
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error('读取失败（HTTP ' + response.status + '）');
    return response.json();
  }

  function splitAnswer(content) {
    let prompt = String(content || '');
    const answers = [];

    prompt = prompt.replace(/\*\*(?:参考)?答案\s*[:：]\s*([^*\n]+?)\*\*/gi, function (_, answer) {
      answers.push('答案：' + answer.trim());
      return '';
    });

    const marker = /(?:^|\n)\s*(?:\*\*)?(?:参考)?答案\s*[:：]\s*/im.exec(prompt);
    if (marker) {
      const start = marker.index + (prompt[marker.index] === '\n' ? 1 : 0);
      answers.push(prompt.slice(start).trim());
      prompt = prompt.slice(0, marker.index).trim();
    }

    return { prompt: prompt.trim(), answer: answers.join('\n\n').trim() };
  }

  function prepareQuestion(raw, module) {
    const split = splitAnswer(raw.content);
    // 只纳入能够从正文可靠拆出答案的题。relatedBlockIds 指向的往往是整份试卷
    // 的答案块，不保证与单题精确对应；使用它自动组卷会造成泄题或误判。
    if (!raw.answer || !raw.answer.inline || !split.answer) return null;
    if (/(?:参考)?答案\s*[:：]/.test(split.prompt)) return null;
    return Object.assign({}, raw, {
      moduleTitle: module.title,
      prompt: split.prompt,
      directAnswer: split.answer,
      relatedBlockIds: [],
    });
  }

  function simpleExpected(answer) {
    const text = String(answer || '').replace(/\*+/g, '').trim();
    let match = text.match(/(?:答案|答)\s*[:：]\s*(?:选|为)?\s*([A-H](?:\s*(?:[、,，/&+]|和|及)\s*[A-H])*)/i);
    if (!match) match = text.match(/^\s*(?:选)?\s*([A-H](?:\s*(?:[、,，/&+]|和|及)\s*[A-H])*)\s*[。.!！]?\s*$/i);
    if (match) return { kind: 'choice', value: match[1].toUpperCase().match(/[A-H]/g).sort().join('') };
    match = text.match(/(?:答案|答)\s*[:：]\s*(正确|错误|对|错|是|否|√|×)/);
    if (match) return { kind: 'boolean', value: normalizeBoolean(match[1]) };
    return null;
  }

  function normalizeBoolean(value) {
    const s = String(value).trim();
    if (/^(正确|对|是|√)$/.test(s)) return 'true';
    if (/^(错误|错|否|×)$/.test(s)) return 'false';
    return '';
  }

  function autoGrade(userAnswer, expected) {
    if (!expected) return null;
    if (expected.kind === 'boolean') return normalizeBoolean(userAnswer) === expected.value;
    const match = String(userAnswer).match(/^\s*(?:答案)?\s*[:：]?\s*(?:选)?\s*([A-H](?:\s*(?:[、,，/&+]|和|及)\s*[A-H])*)\s*[。.!！]?\s*$/i);
    if (!match) return false;
    return match[1].toUpperCase().match(/[A-H]/g).sort().join('') === expected.value;
  }

  function secureShuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const j = random[0] % (i + 1);
      const temp = out[i]; out[i] = out[j]; out[j] = temp;
    }
    return out;
  }

  function selectedModuleIds() {
    return Array.from(ui.modules.querySelectorAll('input:checked')).map(function (input) { return input.value; });
  }

  function updateSelectToggle() {
    const boxes = Array.from(ui.modules.querySelectorAll('input'));
    ui.selectToggle.textContent = boxes.length && boxes.every(function (box) { return box.checked; }) ? '取消全选' : '全选';
  }

  function showSetupError(message) {
    ui.setupError.textContent = message;
    ui.setupError.hidden = !message;
  }

  async function init() {
    try {
      state.catalog = await fetchJson(app.dataset.catalog);
      ui.bankSummary.textContent = state.catalog.stats.questions + ' 道历年题 · ' + state.catalog.modules.length + ' 个知识模块';
      ui.modules.innerHTML = state.catalog.modules.map(function (module) {
        return '<label class="ics-module-card"><input type="checkbox" value="' + escapeHtml(module.id) + '" checked>' +
          '<span><strong>' + module.number + '. ' + escapeHtml(module.title) + '</strong>' +
          '<small>' + escapeHtml(module.name) + ' · ' + module.questionCount + ' 题</small></span></label>';
      }).join('');
      (state.catalog.filters.examTypes || []).forEach(function (type) {
        const option = document.createElement('option'); option.value = type; option.textContent = type; ui.examType.appendChild(option);
      });
      ui.start.disabled = false;
      updateSelectToggle();
    } catch (error) {
      ui.bankSummary.textContent = '题库暂时无法读取';
      showSetupError(error.message + '。请确认站点已通过本地服务器访问，并且 /web-data/catalog.json 存在。');
    }
  }

  async function startQuiz() {
    const ids = selectedModuleIds();
    if (!ids.length) { showSetupError('请至少选择一个知识模块。'); return; }
    showSetupError('');
    ui.start.disabled = true; ui.start.textContent = '正在抽题…';
    try {
      const modules = state.catalog.modules.filter(function (module) { return ids.includes(module.id); });
      const payloads = await Promise.all(modules.map(function (module) {
        return fetchJson('/web-data/' + module.questionFile).then(function (data) { return { module: module, questions: data.questions || [] }; });
      }));
      const examType = ui.examType.value;
      let pool = [];
      payloads.forEach(function (payload) {
        payload.questions.forEach(function (raw) {
          if (examType && raw.examType !== examType) return;
          const prepared = prepareQuestion(raw, payload.module);
          if (prepared) pool.push(prepared);
        });
      });
      if (!pool.length) throw new Error('当前筛选条件下没有带答案或解析的题目');

      const count = Math.min(Number(ui.count.value), pool.length);
      state.questions = secureShuffle(pool).slice(0, count);
      state.index = 0; state.score = 0; state.records = []; state.answerBlocks = new Map();

      ui.setup.hidden = true; ui.result.hidden = true; ui.quiz.hidden = false;
      renderQuestion();
    } catch (error) {
      showSetupError(error.message);
    } finally {
      ui.start.disabled = false; ui.start.textContent = '开始测试';
    }
  }

  function renderQuestion() {
    const q = state.questions[state.index];
    const number = state.index + 1;
    ui.progressText.textContent = '第 ' + number + ' / ' + state.questions.length + ' 题';
    ui.scoreText.textContent = '当前 ' + state.score + ' 分';
    ui.progressBar.style.width = ((state.index / state.questions.length) * 100) + '%';
    ui.questionMeta.innerHTML = [q.moduleTitle, q.year, q.examType, q.exam]
      .filter(Boolean).map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('');
    ui.questionTitle.textContent = q.questionNo || q.summary || '题目 ' + number;
    ui.questionContent.innerHTML = renderMarkdown(q.prompt);
    ui.answer.value = ''; ui.answer.disabled = false; ui.submit.disabled = false;
    ui.answerForm.hidden = false; ui.feedback.hidden = true; ui.selfGrade.hidden = true; ui.next.hidden = true;
    ui.verdict.className = 'ics-verdict'; ui.reference.innerHTML = '';
    ui.answer.focus({ preventScroll: true });
    typeset(ui.questionContent);
    window.scrollTo({ top: ui.quiz.offsetTop - 90, behavior: 'smooth' });
  }

  function referenceFor(q) {
    const chunks = [];
    if (q.directAnswer) chunks.push(q.directAnswer);
    q.relatedBlockIds.forEach(function (id) {
      const block = state.answerBlocks.get(id);
      if (block) chunks.push((block.label ? '### ' + block.label + '\n\n' : '') + block.content);
    });
    return chunks.join('\n\n---\n\n') || '这道题暂无可展示的参考答案。';
  }

  function recordGrade(points, mode) {
    const q = state.questions[state.index];
    state.score += points;
    state.records.push({ question: q, answer: ui.answer.value.trim(), points: points, mode: mode });
    ui.scoreText.textContent = '当前 ' + state.score + ' 分';
    ui.selfGrade.hidden = true;
    ui.next.hidden = false;
    ui.next.textContent = state.index === state.questions.length - 1 ? '查看成绩' : '下一题';
  }

  function submitAnswer(event) {
    event.preventDefault();
    if (!ui.answer.value.trim()) { ui.answer.focus(); return; }
    const q = state.questions[state.index];
    const expected = simpleExpected(q.directAnswer);
    const result = autoGrade(ui.answer.value, expected);
    ui.answer.disabled = true; ui.submit.disabled = true; ui.feedback.hidden = false;
    ui.reference.innerHTML = renderMarkdown(referenceFor(q));
    typeset(ui.reference);

    if (result === true) {
      ui.verdict.className = 'ics-verdict correct'; ui.verdict.textContent = '回答正确，得 1 分。';
      recordGrade(1, 'auto');
    } else if (result === false) {
      ui.verdict.className = 'ics-verdict incorrect'; ui.verdict.textContent = '答案不一致，本题暂得 0 分。';
      recordGrade(0, 'auto');
    } else {
      ui.verdict.textContent = '综合题已显示参考内容，请根据关键点完成自评。';
      ui.selfGrade.hidden = false;
    }
  }

  function finishQuiz() {
    ui.quiz.hidden = true; ui.result.hidden = false;
    const total = state.questions.length;
    const percent = Math.round((state.score / total) * 100);
    ui.finalScore.textContent = percent + '%';
    ui.finalSummary.textContent = '共 ' + total + ' 题，得到 ' + state.score + ' / ' + total + ' 分。';
    ui.reviewList.hidden = true; ui.reviewToggle.textContent = '查看答题记录';
    ui.reviewList.innerHTML = state.records.map(function (record, index) {
      return '<div class="ics-review-item"><span class="ics-review-score">' + record.points + ' 分</span>' +
        '<strong>' + (index + 1) + '. ' + escapeHtml(record.question.summary || record.question.questionNo) + '</strong>' +
        '<p>你的回答：' + escapeHtml(record.answer) + '</p></div>';
    }).join('');
    window.scrollTo({ top: ui.result.offsetTop - 90, behavior: 'smooth' });
  }

  function resetToSetup() {
    ui.quiz.hidden = true; ui.result.hidden = true; ui.setup.hidden = false;
    showSetupError('');
    window.scrollTo({ top: ui.setup.offsetTop - 90, behavior: 'smooth' });
  }

  ui.modules.addEventListener('change', updateSelectToggle);
  ui.selectToggle.addEventListener('click', function () {
    const boxes = Array.from(ui.modules.querySelectorAll('input'));
    const allSelected = boxes.length && boxes.every(function (box) { return box.checked; });
    boxes.forEach(function (box) { box.checked = !allSelected; }); updateSelectToggle();
  });
  ui.start.addEventListener('click', startQuiz);
  ui.answerForm.addEventListener('submit', submitAnswer);
  ui.selfGrade.addEventListener('click', function (event) {
    const button = event.target.closest('[data-grade]');
    if (!button) return;
    const points = Number(button.dataset.grade);
    ui.verdict.className = 'ics-verdict ' + (points === 1 ? 'correct' : points === 0 ? 'incorrect' : '');
    ui.verdict.textContent = '已自评：本题 ' + points + ' 分。';
    recordGrade(points, 'self');
  });
  ui.next.addEventListener('click', function () {
    if (state.index >= state.questions.length - 1) finishQuiz();
    else { state.index += 1; renderQuestion(); }
  });
  ui.abandon.addEventListener('click', resetToSetup);
  ui.retry.addEventListener('click', resetToSetup);
  ui.reviewToggle.addEventListener('click', function () {
    ui.reviewList.hidden = !ui.reviewList.hidden;
    ui.reviewToggle.textContent = ui.reviewList.hidden ? '查看答题记录' : '收起答题记录';
  });

  init();
}());
