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

const WRONG_KEY_BASE = "radquiz_wrong_v1";
const PROGRESS_KEY_BASE = "radquiz_progress_v2";
const SESSIONS_KEY_BASE = "radquiz_sessions_v2";
const USERS_KEY = "radquiz_users_v1";
const CURRENT_USER_KEY = "radquiz_current_user_v1";
const GUEST_NAME = "游客";
const ALL_QUESTIONS = [...window.RAD_QUESTIONS, ...window.BANK_QUESTIONS];
const QUESTION_MAP = new Map(ALL_QUESTIONS.map((q) => [qid(q), q]));

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let authMode = "login";
let currentUserName = localStorage.getItem(CURRENT_USER_KEY) || GUEST_NAME;

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
  sessionPaper: "辐射安全管理",
  sessionChapter: "全部",
};

function qid(q) {
  return `${q.part}-${q.num}`;
}

function accountKey(name) {
  return encodeURIComponent(name);
}

function wrongKey() {
  return `${WRONG_KEY_BASE}_${accountKey(currentUserName)}`;
}

function progressKey() {
  return `${PROGRESS_KEY_BASE}_${accountKey(currentUserName)}`;
}

function sessionsKey() {
  return `${SESSIONS_KEY_BASE}_${accountKey(currentUserName)}`;
}

async function digest(text) {
  if (window.crypto && crypto.subtle) {
    const data = new TextEncoder().encode(`radquiz:${text}`);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return String(hash);
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
    return JSON.parse(localStorage.getItem(wrongKey())) || [];
  } catch (err) {
    return [];
  }
}

function saveWrong(ids) {
  localStorage.setItem(wrongKey(), JSON.stringify(ids));
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

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressKey())) || {};
  } catch (err) {
    return {};
  }
}

function saveProgress(map) {
  localStorage.setItem(progressKey(), JSON.stringify(map));
}

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(sessionsKey())) || [];
  } catch (err) {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(sessionsKey(), JSON.stringify(sessions));
}

function recordAnswer(q, ok) {
  const map = loadProgress();
  const id = qid(q);
  const entry = map[id] || { attempts: 0, correct: 0, wrong: 0, lastTs: 0 };
  entry.attempts++;
  if (ok) entry.correct++;
  else entry.wrong++;
  entry.lastTs = Date.now();
  map[id] = entry;
  saveProgress(map);
}

function recordSession({ mode, paper, chapter, total, correct, wrong, duration }) {
  const sessions = loadSessions();
  sessions.unshift({
    mode,
    paper,
    chapter,
    total,
    correct,
    wrong,
    duration,
    ts: Date.now(),
  });
  saveSessions(sessions.slice(0, 30));
}

function isToday(ts) {
  const date = new Date(ts);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setCurrentUser(name) {
  currentUserName = name;
  if (name === GUEST_NAME) {
    localStorage.removeItem(CURRENT_USER_KEY);
  } else {
    localStorage.setItem(CURRENT_USER_KEY, name);
  }
  renderAuthState();
}

function renderAuthState() {
  const label = $("#userName");
  if (label) {
    label.textContent = currentUserName === GUEST_NAME ? "登录账号" : currentUserName;
  }
  const userBtn = $("#userBtn");
  if (userBtn) {
    userBtn.classList.toggle("logged", currentUserName !== GUEST_NAME);
  }
}

function openAuth(mode = "login") {
  authMode = mode;
  $("#authTitle").textContent = mode === "login" ? "登录账号" : "创建账号";
  $("#authSubmit").textContent = mode === "login" ? "登录" : "创建并登录";
  $("#authSwitch").textContent =
    mode === "login" ? "还没有账号？创建一个" : "已有账号？直接登录";
  $("#authModal").classList.remove("hidden");
  $("#authName").focus();
}

function closeAuth() {
  $("#authModal").classList.add("hidden");
}

async function submitAuth() {
  const name = $("#authName").value.trim();
  const pass = $("#authPass").value;
  if (!name || !pass) {
    toast("请填写昵称和密码");
    return;
  }
  const users = loadUsers();
  const hash = await digest(pass);
  if (authMode === "login") {
    if (!users[name] || users[name].hash !== hash) {
      toast("昵称或密码不正确");
      return;
    }
  } else {
    if (users[name]) {
      toast("这个昵称已经存在");
      return;
    }
    users[name] = { hash, createdAt: Date.now() };
    saveUsers(users);
  }
  setCurrentUser(name);
  $("#authPass").value = "";
  closeAuth();
  stopExamTimer();
  showView("home");
  renderHome();
  toast(authMode === "login" ? "登录成功" : "账号创建成功");
}

function logout() {
  setCurrentUser(GUEST_NAME);
  stopExamTimer();
  showView("home");
  renderHome();
  toast("已退出账号");
}

function clearHistory() {
  if (!confirm("确定清空这个账号的全部做题记录吗？")) return;
  localStorage.removeItem(progressKey());
  localStorage.removeItem(sessionsKey());
  renderHome();
  toast("做题记录已清空");
}

function renderProgress() {
  const map = loadProgress();
  const entries = Object.entries(map)
    .map(([id, e]) => ({ id, ...e }))
    .filter((e) => e.attempts > 0);
  const answered = entries.length;
  const attempts = entries.reduce((sum, e) => sum + e.attempts, 0);
  const correct = entries.reduce((sum, e) => sum + e.correct, 0);
  const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;
  const today = entries
    .filter((e) => isToday(e.lastTs))
    .reduce((sum, e) => sum + e.attempts, 0);

  $("#historyAnswered").textContent = answered;
  $("#historyCorrect").textContent = correct;
  $("#historyAccuracy").textContent = `${accuracy}%`;
  $("#historyToday").textContent = today;

  const papers = [
    { id: "rad", title: "辐射安全管理", total: window.RAD_QUESTIONS.length },
    { id: "bank", title: "图片题", total: window.BANK_QUESTIONS.length },
  ];
  $("#progressBars").innerHTML = papers
    .map((paper) => {
      const done = entries.filter((e) =>
        paper.id === "bank" ? e.id.startsWith("图片题") : !e.id.startsWith("图片题")
      ).length;
      const percent = Math.round((done / paper.total) * 100);
      return `
        <div class="progress-bar-row">
          <div class="progress-bar-label"><span>${paper.title}</span><strong>${done} / ${paper.total}</strong></div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        </div>`;
    })
    .join("");

  const sessions = loadSessions();
  const wrap = $("#sessionListWrap");
  if (!sessions.length) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  $("#sessionList").innerHTML = sessions
    .map(
      (s) => `
      <div class="session-item">
        <div class="session-main">
          <strong>${escapeHtml(s.paper)} · ${escapeHtml(s.chapter)}</strong>
          <span>${escapeHtml(modeName(s.mode))} · ${formatDateTime(s.ts)}</span>
        </div>
        <div class="session-score">${s.correct} / ${s.total} · ${formatTime(s.duration)}</div>
      </div>`
    )
    .join("");
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
  renderProgress();
  renderAuthState();
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
  state.sessionPaper =
    mode === "wrong" ? "错题本" : PAPERS[state.paper] ? PAPERS[state.paper].title : "辐射安全管理";
  state.sessionChapter = mode === "wrong" ? "错题" : state.chapter || "全部";
  showView("quiz");
  if (mode === "exam") {
    startExamTimer();
  }
  renderQuestion();
}

function renderQuestion() {
  const q = state.list[state.index];
  if (state.mode === "wrong") {
    state.confirmed = true;
  }
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
  if (state.mode === "wrong") {
    showReviewExplanation(q);
  }
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

function lettersFor(q, indices) {
  return indices.map((i) => q.options[i].letter).join("、");
}

function realExplanation(q) {
  const table =
    q.part === "图片题"
      ? window.BANK_EXPLAINS || {}
      : window.RAD_EXPLAINS || {};
  return table[qid(q)] || null;
}

function cleanExplainText(text) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExplanation(q, selected, ok) {
  if (q.explain) return q.explain;
  const info = realExplanation(q);
  let text = "";
  if (info && info.point) {
    text += `考点：${cleanExplainText(info.point)}。`;
  }
  if (info && info.explain) {
    text += `解析：${cleanExplainText(info.explain)}`;
  }
  if (info && info.point && !info.explain) {
    text += `本题考查“${cleanExplainText(info.point)}”。正确答案是 ${lettersFor(
      q,
      q.answer
    )}，请结合教材和法规记忆该考点。`;
  }
  if (!text) {
    const correct = lettersFor(q, q.answer);
    const correctText = q.answer
      .map((i) => q.options[i].text)
      .filter(Boolean)
      .join("；");
    text = `正确答案为 ${correct}`;
    if (correctText) {
      text += `，即“${correctText}”。本题围绕该知识点设置，答题时注意区分相近选项。`;
    } else {
      text += `。本题为图片题，请对照正确选项图片理解考点。`;
    }
  }
  if (!ok && selected.length) {
    text += ` 你选择的是 ${lettersFor(q, selected)}，正确答案是 ${lettersFor(
      q,
      q.answer
    )}，请重点对照正确答案复习。`;
  }
  return text;
}

function renderExplanation(q, selected, ok) {
  const info = realExplanation(q);
  const node = $("#answerExplain");
  const correct = lettersFor(q, q.answer);
  const chosen = selected.length ? lettersFor(q, selected) : "";
  const hint = ok
    ? `回答正确，正确答案：${correct}。`
    : chosen
    ? `你选择的是 ${chosen}，正确答案：${correct}。`
    : `正确答案：${correct}。`;
  if (info && (info.point || info.explain)) {
    const pointHtml = info.point
      ? `<div class="explain-point"><strong>考点</strong><p>${escapeHtml(
          cleanExplainText(info.point)
        )}</p></div>`
      : "";
    const explainHtml = info.explain
      ? `<strong>解析</strong><p>${escapeHtml(
          cleanExplainText(info.explain)
        )}</p>`
      : info.point
      ? `<strong>解析</strong><p>${escapeHtml(
          `正确答案是 ${lettersFor(
            q,
            q.answer
          )}。本题考查“${cleanExplainText(
            info.point
          )}”，请结合教材和法规记忆该考点。`
        )}</p>`
      : "";
    node.innerHTML = `${pointHtml}${explainHtml}<p class="explain-hint">${escapeHtml(
      hint
    )}</p>`;
  } else {
    node.innerHTML = `<strong>解析</strong><p>${escapeHtml(
      buildExplanation(q, selected, ok)
    )}</p>`;
  }
}

function showReviewExplanation(q) {
  const strip = $("#answerStrip");
  const result = $("#answerResult");
  result.textContent = "错题讲解";
  result.className = "answer-result no";
  $("#answerText").textContent = `正确答案：${lettersFor(q, q.answer)}`;
  renderExplanation(q, [], false);
  strip.classList.remove("hidden");
}

function confirmAnswer() {
  const q = state.list[state.index];
  if (!state.selected.length) {
    toast("请先选择答案");
    return;
  }
  const selected = [...state.selected];
  const ok = sameAnswer(selected, q.answer);
  state.confirmed = true;
  recordAnswer(q, ok);
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
  $("#answerText").textContent = `正确答案：${lettersFor(q, q.answer)}`;
  renderExplanation(q, selected, ok);
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
    const ok = sameAnswer(state.examAnswers[i] || [], q.answer);
    recordAnswer(q, ok);
    if (ok) {
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
  recordSession({
    mode: state.mode,
    paper: state.sessionPaper,
    chapter: state.sessionChapter,
    total,
    correct,
    wrong: wrong.length,
    duration: elapsed,
  });
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
      if (q) beginSession({ mode: "wrong", list: [q] });
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

$("#userBtn").addEventListener("click", () => {
  if (currentUserName !== GUEST_NAME) {
    if (confirm("退出当前账号吗？")) logout();
  } else {
    openAuth("login");
  }
});
$("#authClose").addEventListener("click", closeAuth);
$("#authModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeAuth();
});
$("#authSwitch").addEventListener("click", () => {
  openAuth(authMode === "login" ? "register" : "login");
});
$("#authSubmit").addEventListener("click", submitAuth);
$("#authPass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitAuth();
});
$("#clearHistoryBtn").addEventListener("click", clearHistory);

renderHome();
