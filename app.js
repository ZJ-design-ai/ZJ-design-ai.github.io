const PAPERS = {
  rad: {
    key: "rad",
    title: "辐射安全管理",
    tag: "A",
    data: window.RAD_QUESTIONS,
    chapters: ["全部", "基础", "法规"],
  },
  bank: {
    key: "bank",
    title: "图片题",
    tag: "B",
    data: window.BANK_QUESTIONS,
    chapters: null,
  },
};

const WRONG_KEY = "radquiz_wrong_v1";
const ALL_QUESTIONS = [...window.RAD_QUESTIONS, ...window.BANK_QUESTIONS];
const QUESTION_MAP = new Map(ALL_QUESTIONS.map((q) => [qid(q), q]));

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let state = {
  paper: "rad",
  chapter: "全部",
  mode: "order",
  list: [],
  index: 0,
  selected: [],
  confirmed: false,
  correct: 0,
  wrongRun: [],
  startTime: 0,
  elapsed: 0,
  examAnswers: [],
  examSeconds: 0,
  examTimer: null,
  lastSetup: null,
};

function qid(q) {
  return `${q.part}-${q.num}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadWrong() {
  try {
    return JSON.parse(localStorage.getItem(WRONG_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function saveWrong(ids) {
  localStorage.setItem(WRONG_KEY, JSON.stringify(ids));
}

function addWrong(q) {
  const ids = loadWrong();
  if (!ids.includes(qid(q))) {
    ids.push(qid(q));
    saveWrong(ids);
  }
  updateWrongBadge();
}

function clearWrong() {
  saveWrong([]);
  updateWrongBadge();
  renderWrongPanel();
}

function updateWrongBadge() {
  const count = loadWrong().length;
  $("#wrongBadge").textContent = count;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sameAnswer(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

function modeName(mode) {
  return { order: "顺序练习", random: "随机练习", exam: "模拟考试", wrong: "错题重练" }[
    mode
  ];
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => node.classList.remove("show"), 1800);
}

function showView(name) {
  $("#homeView").classList.toggle("hidden", name !== "home");
  $("#quizView").classList.toggle("hidden", name !== "quiz");
  $("#resultView").classList.toggle("hidden", name !== "result");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  renderPaperList();
  renderChapterRow();
  renderWrongPanel();
  updateWrongBadge();
  const all = ALL_QUESTIONS;
  $("#homeTotal").textContent = all.length;
  $("#homeSingle").textContent = all.filter((q) => q.kind === "single").length;
  $("#homeMulti").textContent = all.filter((q) => q.kind === "multi").length;
}

function renderPaperList() {
  $("#paperList").innerHTML = Object.values(PAPERS)
    .map(
      (paper) => `
      <article class="paper-card ${state.paper === paper.key ? "selected" : ""}" data-paper="${paper.key}">
        <div class="paper-head">
          <span class="paper-tag">${paper.tag}</span>
          <div><h2>${paper.title}</h2><p>${paper.chapters ? "基础 + 法规" : "看图选择题"}</p></div>
          <span class="paper-count">${paper.data.length} 题</span>
        </div>
        <div class="mode-grid">
          <button class="mode-btn" data-mode="order" data-paper="${paper.key}">
            <svg><use href="#icon-book"></use></svg><span>顺序练习</span>
          </button>
          <button class="mode-btn" data-mode="random" data-paper="${paper.key}">
            <svg><use href="#icon-shuffle"></use></svg><span>随机练习</span>
          </button>
          <button class="mode-btn" data-mode="exam" data-paper="${paper.key}">
            <svg><use href="#icon-clock"></use></svg><span>模拟考试</span>
          </button>
        </div>
      </article>`
    )
    .join("");

  $$(".paper-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".mode-btn")) return;
      state.paper = card.dataset.paper;
      state.chapter = "全部";
      renderPaperList();
      renderChapterRow();
    });
  });

  $$(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.paper = btn.dataset.paper;
      state.chapter = "全部";
      renderPaperList();
      renderChapterRow();
      startSession(btn.dataset.mode);
    });
  });
}

function renderChapterRow() {
  const paper = PAPERS[state.paper];
  const wrap = $("#chapterWrap");
  if (!paper.chapters) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  $("#chapterRow").innerHTML = paper.chapters
    .map(
      (c) =>
        `<button class="chapter-btn ${state.chapter === c ? "active" : ""}" data-chapter="${c}">${c}</button>`
    )
    .join("");
  $$(".chapter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.chapter = btn.dataset.chapter;
      renderChapterRow();
    });
  });
}

function renderWrongPanel() {
  const count = loadWrong().length;
  $("#wrongPanelCount").textContent = `${count} 题`;
  $("#startWrongBtn").disabled = count === 0;
}

function startSession(mode) {
  const paper = PAPERS[state.paper];
  let list = paper.data.filter(
    (q) => state.chapter === "全部" || q.part === state.chapter
  );
  if (mode === "random") {
    list = shuffle(list);
  } else if (mode === "exam") {
    list = shuffle(list).slice(0, Math.min(20, list.length));
  }
  state.lastSetup = { mode, paper: state.paper, chapter: state.chapter };
  beginSession({ mode, list });
}

function startWrongReview() {
  const ids = loadWrong();
  if (!ids.length) {
    toast("错题本是空的");
    return;
  }
  const list = ids.map((id) => QUESTION_MAP.get(id)).filter(Boolean);
  beginSession({ mode: "wrong", list });
}

function beginSession({ mode, list }) {
  stopExamTimer();
  state.mode = mode;
  state.list = list;
  state.index = 0;
  state.selected = [];
  state.confirmed = false;
  state.correct = 0;
  state.wrongRun = [];
  state.startTime = Date.now();
  state.elapsed = 0;
  state.examAnswers = mode === "exam" ? list.map(() => []) : [];
  showView("quiz");
  if (mode === "exam") {
    startExamTimer();
  }
  renderQuestion();
}

function renderQuestion() {
  const q = state.list[state.index];
  const total = state.list.length;
  $("#quizCount").textContent = `${state.index + 1} / ${total}`;
  $("#progressFill").style.width = `${((state.index + 1) / total) * 100}%`;
  $("#questionNo").textContent = q.num;
  $("#questionStem").textContent = q.stem;
  $("#quizPaperTag").textContent =
    q.part === "图片题" ? "图片题库" : "辐射安全管理";
  $("#quizPartTag").textContent = q.part === "图片题" ? "看图" : q.part;
  $("#quizTypeTag").textContent = q.kind === "multi" ? "多选题" : "单选题";
  $("#quizModeTag").textContent = modeName(state.mode);
  renderFigures(q);
  renderOptions(q);
  renderActionButtons();
  $("#answerStrip").classList.add("hidden");
}

function renderFigures(q) {
  const files = q.image_files || [];
  $("#questionFigures").innerHTML = files.length
    ? files
        .map((f) => `<figure><img src="${f}" alt="题目配图"></figure>`)
        .join("")
    : "";
}

function renderOptions(q) {
  const isExam = state.mode === "exam";
  const current = isExam ? state.examAnswers[state.index] : state.selected;
  $("#optionList").innerHTML = q.options
    .map((opt, i) => {
      const selected = current.includes(i);
      let cls = "option" + (selected ? " selected" : "");
      let disabled = "";
      if (!isExam && state.confirmed) {
        if (q.answer.includes(i)) cls += " correct";
        else if (selected) cls += " wrong";
        disabled = "disabled";
      }
      const media = opt.image
        ? `<img class="opt-img" src="${opt.image}" alt="选项${opt.letter}">`
        : "";
      const text = opt.text
        ? `<span class="opt-text">${escapeHtml(opt.text)}</span>`
        : "";
      return `<button class="${cls}" data-i="${i}" ${disabled}>
        <span class="opt-letter">${opt.letter}</span>
        ${media}${text}
      </button>`;
    })
    .join("");
}

function selectOption(i) {
  const q = state.list[state.index];
  if (state.mode === "exam") {
    const arr = [...(state.examAnswers[state.index] || [])];
    if (q.kind === "multi") {
      const pos = arr.indexOf(i);
      if (pos >= 0) arr.splice(pos, 1);
      else arr.push(i);
    } else {
      arr.splice(0, arr.length, i);
    }
    state.examAnswers[state.index] = arr;
    renderOptions(q);
    renderActionButtons();
    return;
  }
  if (state.confirmed) return;
  if (q.kind === "multi") {
    const pos = state.selected.indexOf(i);
    if (pos >= 0) state.selected.splice(pos, 1);
    else state.selected.push(i);
  } else {
    state.selected = [i];
  }
  renderOptions(q);
  renderActionButtons();
}

function confirmAnswer() {
  const q = state.list[state.index];
  if (!state.selected.length) {
    toast("请先选择答案");
    return;
  }
  const ok = sameAnswer(state.selected, q.answer);
  state.confirmed = true;
  if (ok) {
    state.correct++;
  } else {
    state.wrongRun.push(q);
    addWrong(q);
  }
  renderOptions(q);
  const strip = $("#answerStrip");
  const result = $("#answerResult");
  result.textContent = ok ? "回答正确" : "回答错误";
  result.className = "answer-result " + (ok ? "ok" : "no");
  $("#answerText").textContent = `正确答案：${q.answer
    .map((i) => q.options[i].letter)
    .join("、")}`;
  strip.classList.remove("hidden");
  renderActionButtons();
}

function nextQuestion() {
  if (state.mode === "exam") {
    if (state.index < state.list.length - 1) {
      state.index++;
      renderQuestion();
    } else {
      submitExam();
    }
    return;
  }
  if (state.index < state.list.length - 1) {
    state.index++;
    state.selected = [];
    state.confirmed = false;
    renderQuestion();
  } else {
    showResult(state.correct, state.wrongRun);
  }
}

function prevQuestion() {
  if (state.mode !== "exam" || state.index === 0) return;
  state.index--;
  renderQuestion();
}

function submitExam() {
  stopExamTimer();
  state.elapsed = Math.round((Date.now() - state.startTime) / 1000);
  let correct = 0;
  const wrong = [];
  state.list.forEach((q, i) => {
    if (sameAnswer(state.examAnswers[i] || [], q.answer)) {
      correct++;
    } else {
      wrong.push(q);
      addWrong(q);
    }
  });
  showResult(correct, wrong, true);
}

function renderActionButtons() {
  const isExam = state.mode === "exam";
  const isLast = state.index === state.list.length - 1;
  $("#prevBtn").classList.toggle(
    "hidden",
    isExam ? state.index === 0 : state.index === 0 || state.confirmed
  );
  $("#confirmBtn").classList.toggle(
    "hidden",
    isExam || state.confirmed || !state.selected.length
  );
  $("#nextBtn").classList.toggle(
    "hidden",
    isExam ? false : !state.confirmed
  );
  $("#submitBtn").classList.toggle("hidden", !isExam);
  const nextLabel = $("#nextBtn").querySelector("span");
  if (!isExam && isLast) {
    nextLabel.textContent = "查看成绩";
  } else {
    nextLabel.textContent = "下一题";
  }
}

function showResult(correct, wrong, isExam = false) {
  stopExamTimer();
  const total = state.list.length;
  const percent = Math.round((correct / total) * 100);
  const elapsed = isExam
    ? state.elapsed
    : Math.round((Date.now() - state.startTime) / 1000);
  $("#resultLabel").textContent = isExam ? "模拟考试" : "练习完成";
  $("#resultTitle").textContent = isExam ? "考试成绩单" : "练习成绩单";
  $("#scoreRing").style.setProperty("--score", percent);
  $("#scorePercent").textContent = `${percent}%`;
  $("#scoreCorrect").textContent = correct;
  $("#scoreWrong").textContent = wrong.length;
  $("#scoreTotal").textContent = total;
  $("#scoreTime").textContent = formatTime(elapsed);
  $("#resultWrongWrap").classList.toggle("hidden", wrong.length === 0);
  $("#resultWrongCount").textContent = `${wrong.length} 题`;
  $("#wrongList").innerHTML = wrong
    .map(
      (q) => `
      <button class="wrong-item" data-qid="${qid(q)}">
        <span class="wrong-no">${q.part === "图片题" ? "图" : q.part} ${q.num}</span>
        <span class="wrong-stem">${escapeHtml(q.stem)}</span>
        <svg><use href="#icon-arrow"></use></svg>
      </button>`
    )
    .join("");
  $$("#wrongList .wrong-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = QUESTION_MAP.get(btn.dataset.qid);
      if (q) beginSession({ mode: "order", list: [q] });
    });
  });
  showView("result");
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startExamTimer() {
  state.examSeconds = 20 * 60;
  renderClock();
  $("#examClock").classList.remove("hidden");
  state.examTimer = setInterval(() => {
    state.examSeconds--;
    if (state.examSeconds <= 0) {
      renderClock();
      submitExam();
      return;
    }
    renderClock();
  }, 1000);
}

function renderClock() {
  $("#examClockText").textContent = formatTime(state.examSeconds);
}

function stopExamTimer() {
  if (state.examTimer) {
    clearInterval(state.examTimer);
    state.examTimer = null;
  }
  $("#examClock").classList.add("hidden");
}

function retrySession() {
  if (state.mode === "wrong") {
    startWrongReview();
  } else if (state.mode === "exam" && state.lastSetup) {
    state.paper = state.lastSetup.paper;
    state.chapter = state.lastSetup.chapter;
    startSession("exam");
  } else if (state.lastSetup) {
    state.paper = state.lastSetup.paper;
    state.chapter = state.lastSetup.chapter;
    startSession(state.lastSetup.mode);
  } else {
    startSession("order");
  }
}

$("#optionList").addEventListener("click", (e) => {
  const btn = e.target.closest(".option");
  if (!btn) return;
  selectOption(Number(btn.dataset.i));
});

$("#confirmBtn").addEventListener("click", confirmAnswer);
$("#nextBtn").addEventListener("click", nextQuestion);
$("#prevBtn").addEventListener("click", prevQuestion);
$("#submitBtn").addEventListener("click", submitExam);
$("#retryBtn").addEventListener("click", retrySession);
$("#homeBtn").addEventListener("click", () => {
  stopExamTimer();
  showView("home");
  renderHome();
});
$("#homeLink").addEventListener("click", (e) => {
  e.preventDefault();
  stopExamTimer();
  showView("home");
  renderHome();
});
$("#startWrongBtn").addEventListener("click", startWrongReview);
$("#clearWrongBtn").addEventListener("click", () => {
  clearWrong();
  toast("错题本已清空");
});
$("#wrongBookBtn").addEventListener("click", () => {
  stopExamTimer();
  showView("home");
  renderHome();
  document.querySelector("#wrongPanel").scrollIntoView({ behavior: "smooth" });
});

renderHome();
