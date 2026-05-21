/* =============================================================
   KOR TRIVIA CHALLENGE 2025 — trivia.js
   All game logic, audio, fireworks, timer, settings, score tracker
   ============================================================= */

/* ── Config / State ─────────────────────────────────────────── */
const SHEET_ID = '1fpwO6svgiPJgPLXCc9fzzfJ_SXF2ij5bsuEbEaa81Eo';
const GID      = '627945407';

let triviaQuestions       = [];
let decoyAnswers          = [];
let currentQuestionIndex  = 0;
let timerInterval         = null;
let TIME_PER_QUESTION     = 30;
let SCORE_POINTS          = 100;
let timeRemaining         = TIME_PER_QUESTION;
let isPaused              = false;
let isMultipleChoiceEnabled = true;
let correctMcAnswer       = null;
let fireworksEnabled      = true;
let fireworksIntervalId   = null;
let players               = [];
let nextPlayerId          = 1;
let masterAudioCtx        = null;
let scheduledMelodyTimers = [];
let msInterval            = null;
let lastUpdate            = null;
let gamePaused            = false;

/* ── Idle Timeout (15 min) ───────────────────────────────────── */
let idleTimer     = null;
let idleTriggered = false;
const IDLE_LIMIT  = 15 * 60 * 1000;

function resetIdleTimer() {
  if (idleTriggered) resumeFromIdle();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(triggerIdleShutdown, IDLE_LIMIT);
}

function triggerIdleShutdown() {
  console.warn('IDLE LIMIT REACHED — Stopping activity.');
  idleTriggered = true;
  stopWelcomeFireworks();
  stopAllSounds();
  try { pauseGame(); } catch(e) {}
}

function resumeFromIdle() {
  console.warn('Resuming after idle timeout.');
  idleTriggered = false;
  const pauseMenuModal = document.getElementById('pauseMenuModal');
  if (pauseMenuModal) pauseMenuModal.classList.add('hidden');
  try { resumeGame(); } catch(e) {}
  const welcomeScreen = document.getElementById('welcomeScreen');
  if (!welcomeScreen.classList.contains('hidden')) {
    try { startWelcomeFireworks(); } catch(e) {}
  }
}

const activityEvents = ['mousemove','mousedown','keydown','touchstart','touchmove','click'];
activityEvents.forEach(evt => document.addEventListener(evt, resetIdleTimer, { passive: true }));
resetIdleTimer();

/* ── DOM References ──────────────────────────────────────────── */
const welcomeScreen          = document.getElementById('welcomeScreen');
const gameContent            = document.getElementById('gameContent');
const startGameButton        = document.getElementById('startGameButton');
const initAudioButton        = document.getElementById('initAudioButton');
const questionScreen         = document.getElementById('questionScreen');
const answerScreen           = document.getElementById('answerScreen');
const answerStatusText       = document.getElementById('answerStatusText');
const timerDisplay           = document.getElementById('timerDisplay');
const timerContainer         = document.getElementById('timerContainer');
const questionNumber         = document.getElementById('questionNumber');
const questionText           = document.getElementById('questionText');
const answerText             = document.getElementById('answerText');
const nextQuestionButton     = document.getElementById('nextQuestionButton');
const restartCurrentButton   = document.getElementById('restartCurrentButton');
const skipFromAnswerButton   = document.getElementById('skipFromAnswerButton');
const reviewQuestionButton   = document.getElementById('reviewQuestionButton');
const finalScreen            = document.getElementById('finalScreen');
const restartGameButton      = document.getElementById('restartGameButton');
const hintButton             = document.getElementById('hintButton');
const hintText               = document.getElementById('hintText');
const revealAnswerButton     = document.getElementById('revealAnswerButton');
const skipButton             = document.getElementById('skipButton');
const pauseButton            = document.getElementById('pauseButton');
const settingsButton         = document.getElementById('settingsButton');
const settingsModal          = document.getElementById('settingsModal');
const closeSettings          = document.getElementById('closeSettings');
const saveSettings           = document.getElementById('saveSettings');
const timeInput              = document.getElementById('timeInput');
const scorePointsInput       = document.getElementById('scorePointsInput');
const darkModeToggle         = document.getElementById('darkModeToggle');
const multiChoiceToggle      = document.getElementById('multiChoiceToggle');
const hideScoreTrackerToggle = document.getElementById('hideScoreTrackerToggle');
const mcOptionsContainer     = document.getElementById('mcOptionsContainer');
const scorePanel             = document.getElementById('scorePanel');
const addPlayerButton        = document.getElementById('addPlayerButton');
const playerListContainer    = document.getElementById('playerListContainer');
const scoreIncrementInput    = document.getElementById('scoreIncrementInput');
const pauseMenuModal         = document.getElementById('pauseMenuModal');
const resumeButton           = document.getElementById('resumeButton');
const restartFromPauseButton = document.getElementById('restartFromPauseButton');
const settingsFromPauseButton= document.getElementById('settingsFromPauseButton');
const hintScreen             = document.getElementById('hintScreen');
const hintBox                = document.getElementById('hintBox');
const hintTextOverlay        = document.getElementById('hintTextOverlay');
const hintCloseBtn           = document.getElementById('hintCloseBtn');

/* ── Audio: MP3 Sounds ───────────────────────────────────────── */
const sndWarning20 = new Audio('sounds/Beep1.mp3');
const sndWarning5  = new Audio('sounds/buzzer.mp3');
const sndLose      = new Audio('sounds/lose.mp3');
const sndWin       = new Audio('sounds/Win.mp3');
const sndGameOver  = new Audio('sounds/GameOver.mp3');
[sndWarning20, sndWarning5, sndLose, sndWin, sndGameOver].forEach(a => {
  a.preload = 'auto';
  a.volume  = 1.0;
});

function playSfx(audioEl) {
  try {
    // Resume Web Audio context in case it was suspended (doesn't affect <Audio> elements,
    // but keeps masterAudioCtx alive for tone-based calls that follow)
    ensureAudioResumed();
    audioEl.pause();
    audioEl.currentTime = 0;
    const p = audioEl.play();
    if (p?.catch) p.catch(() => {});
  } catch(e) {}
}

function stopMp3Sounds() {
  [sndWarning20, sndWarning5, sndLose, sndWin, sndGameOver].forEach(a => {
    try { a.pause(); a.currentTime = 0; } catch(e) {}
  });
}

function stopAllSounds() {
  try { stopMp3Sounds(); } catch(e) {}
  // Cancel all scheduled melody/tone timers
  if (scheduledMelodyTimers.length > 0) {
    scheduledMelodyTimers.forEach(id => clearTimeout(id));
    scheduledMelodyTimers = [];
  }
  // Suspend (NOT close) the Web Audio context so it can be resumed instantly
  if (!masterAudioCtx) return;
  try {
    if (masterAudioCtx.state === 'running') {
      masterAudioCtx.suspend().catch(() => {});
    }
  } catch(e) {}
}

// Resume the audio context when we need playback (timer start, sfx, etc.)
function ensureAudioResumed() {
  if (!masterAudioCtx) return;
  try {
    if (masterAudioCtx.state === 'suspended') {
      masterAudioCtx.resume().catch(() => {});
    }
  } catch(e) {}
}

/* ── Audio: Web Audio API ────────────────────────────────────── */
function initializeAudio() {
  if (!masterAudioCtx) {
    masterAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const osc  = masterAudioCtx.createOscillator();
  const gain = masterAudioCtx.createGain();
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(masterAudioCtx.destination);
  osc.start();
  osc.stop(masterAudioCtx.currentTime + 0.05);
  console.log('Audio initialized');
}

function playTone(freq = 440, duration = 200, type = 'square') {
  if (!masterAudioCtx) return;
  ensureAudioResumed();
  const osc  = masterAudioCtx.createOscillator();
  const gain = masterAudioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, masterAudioCtx.currentTime);
  gain.gain.setValueAtTime(0.25, masterAudioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, masterAudioCtx.currentTime + duration / 1000);
  osc.connect(gain);
  gain.connect(masterAudioCtx.destination);
  osc.start();
  osc.stop(masterAudioCtx.currentTime + duration / 1000);
}

function playMelody(sequence) {
  let delay = 0;
  for (const note of sequence) {
    const timerId = setTimeout(() => {
      if (!masterAudioCtx || masterAudioCtx.state !== 'running') return;
      if (note.freq > 0) playTone(note.freq, note.duration, note.type || 'square');
    }, delay);
    scheduledMelodyTimers.push(timerId);
    delay += note.duration;
  }
}

/* ── Sound Effect Wrappers ───────────────────────────────────── */
function playWarning20()  { playSfx(sndWarning20); }
function playWarning5()   { playSfx(sndWarning5); }
function playWrongSound() { playSfx(sndLose); }
function playVictorySound(){ playSfx(sndWin); }
function playDeathSound() { playSfx(sndLose); }

/* ── Fireworks ───────────────────────────────────────────────── */
function launchFireworks() {
  for (let i = 0; i < 5; i++) {
    confetti({
      particleCount: 200,
      spread: 60,
      origin: { x: Math.random(), y: Math.random() },
      shapes: ['circle'],
      gravity: 0.3,
      scalar: 0.5,
      colors: ['#ff5733','#ffbd33','#ff033e','#a834eb','#00ffff'],
      ticks: 250,
      angle: Math.random() * 360,
    });
  }
}

function startContinuousFireworks() {
  if (fireworksIntervalId) return;
  fireworksIntervalId = setInterval(() => {
    if (!fireworksEnabled) return;
    for (let i = 0; i < 3; i++) {
      confetti({
        particleCount: 200,
        spread: 60,
        origin: { x: Math.random(), y: Math.random() },
        shapes: ['circle'],
        gravity: 0.3,
        scalar: 0.5,
        colors: ['#ff5733','#ffbd33','#ff033e','#a834eb','#00ffff'],
        ticks: 250,
        angle: Math.random() * 360,
      });
    }
  }, 3000);
}

function stopContinuousFireworks() {
  if (fireworksIntervalId) {
    clearInterval(fireworksIntervalId);
    fireworksIntervalId = null;
  }
}

function stopWelcomeFireworks()  { stopContinuousFireworks(); }
function startWelcomeFireworks() { if (fireworksEnabled) startContinuousFireworks(); }

function toggleFireworks(enabled) {
  fireworksEnabled = Boolean(enabled);
  fireworksEnabled ? startContinuousFireworks() : stopContinuousFireworks();
}

window.addEventListener('load', () => {
  const stored = localStorage.getItem('fireworksEnabled');
  fireworksEnabled = stored === null ? true : stored === 'enabled';
  fireworksEnabled ? startContinuousFireworks() : stopContinuousFireworks();
});

/* ── Helper Utilities ────────────────────────────────────────── */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getDecoyAnswers(correctAnswer, allAnswers) {
  const decoys = new Set();
  const numAnswer = parseFloat(correctAnswer);
  if (!isNaN(numAnswer)) {
    decoys.add(String(numAnswer + 1));
    decoys.add(String(Math.max(0, numAnswer - 1)));
    decoys.add(String(numAnswer * 2));
  }
  const filtered = allAnswers.filter(a => a !== correctAnswer);
  while (decoys.size < 3) {
    if (!filtered.length) break;
    const idx = Math.floor(Math.random() * filtered.length);
    const decoy = filtered[idx];
    if (!decoys.has(decoy) && decoy !== correctAnswer) decoys.add(decoy);
    filtered.splice(idx, 1);
  }
  return Array.from(decoys).slice(0, 3);
}

function displayStatus(message, colorClass = 'text-gray-600') {
  document.getElementById('timerContainer').classList.remove('hidden');
  questionText.textContent = message;
  questionText.className = `text-3xl font-bold ${colorClass} mb-6 text-center`;
  questionScreen.classList.remove('hidden');
}

function applyDarkMode(enabled) {
  document.body.classList.toggle('dark', enabled);
}

function applyScoreTrackerVisibility(isHidden) {
  scorePanel.classList.toggle('hidden', isHidden);
  document.body.classList.toggle('fullscreen-mode', isHidden);
  document.documentElement.classList.toggle('fullscreen-mode', isHidden);
  // On mobile fullscreen, lock viewport scroll
  document.documentElement.style.overflow = isHidden ? 'hidden' : '';
  document.body.style.overflow = isHidden ? 'hidden' : '';
}

function enableAllOptions() {
  document.querySelectorAll('.option-button').forEach(btn => {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  });
}

/* ── Hint Overlay ────────────────────────────────────────────── */
function hideHint() {
  hintScreen.classList.remove('active');
  hintBox.classList.remove('active');
  setTimeout(() => {
    hintScreen.classList.add('hidden');
    hintButton.disabled = false;
  }, 260);
}

hintCloseBtn.addEventListener('click', hideHint);
hintScreen.addEventListener('click', e => { if (e.target === hintScreen) hideHint(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && hintScreen.classList.contains('active')) hideHint();
});

/* ── Google Sheets Data ──────────────────────────────────────── */
function initGoogle() {
  google.charts.load('current', { packages: ['corechart'] });
  google.charts.setOnLoadCallback(fetchTriviaData);
}

function fetchTriviaData() {
  displayStatus('Fetching trivia questions...', 'text-indigo-600');
  const QUERY    = 'select A,B,C,D';
  const DATA_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID}&tqx=out:json&tq=` + encodeURIComponent(QUERY);
  const query    = new google.visualization.Query(DATA_URL);
  query.send(handleQueryResponse);
}

function handleQueryResponse(response) {
  if (response.isError()) {
    console.error('Query error: ' + response.getMessage());
    displayStatus(`Data fetch failed: ${response.getMessage()}. Check SHEET_ID and sharing settings.`, 'text-red-700');
    startGameButton.disabled = true;
    return;
  }
  const dt = response.getDataTable();
  triviaQuestions = [];
  decoyAnswers    = [];
  for (let i = 0; i < dt.getNumberOfRows(); i++) {
    const question        = dt.getValue(i, 0);
    const answer          = dt.getValue(i, 1);
    const hint            = dt.getValue(i, 2);
    const nearCorrectDummy= dt.getValue(i, 3);
    if (question && answer) {
      triviaQuestions.push({ question, answer, hint, nearCorrectDummy });
      decoyAnswers.push(answer);
    }
  }
  shuffleArray(triviaQuestions);
  if (triviaQuestions.length > 0) {
    displayStatus(`Loaded ${triviaQuestions.length} questions. Ready to start!`, 'text-green-600');
    startGameButton.disabled = false;
  } else {
    displayStatus('No valid questions found. Check columns A and B.', 'text-red-700');
  }
}

/* ── Game Flow ───────────────────────────────────────────────── */
function startGame() {
  TIME_PER_QUESTION     = parseInt(localStorage.getItem('timeInput')) || 30;
  SCORE_POINTS          = parseInt(localStorage.getItem('scorePointsInput')) || 100;
  isMultipleChoiceEnabled = localStorage.getItem('multiChoiceMode') === 'enabled';
  timeRemaining         = TIME_PER_QUESTION;
  currentQuestionIndex  = 0;
  welcomeScreen.classList.add('hidden');
  gameContent.classList.remove('hidden');
  finalScreen.classList.add('hidden');
  showQuestion(currentQuestionIndex);
}

function showQuestion(index) {
  stopAllSounds();
  if (!triviaQuestions.length) return;
  clearInterval(timerInterval);
  answerText.classList.remove('big-answer');
  document.getElementById('timerContainer').classList.remove('hidden');

  if (window._returningFromReview) {
    isPaused = true;
    window._returningFromReview = false;
  } else {
    isPaused = false;
  }

  timeRemaining = TIME_PER_QUESTION;

  timerContainer.classList.remove('bg-red-500','bg-yellow-200','bg-green-500');
  timerContainer.classList.add('bg-gray-100');
  timerDisplay.style.color = '';
  timerDisplay.classList.remove('flashing-red','fall-zoom');
  timerDisplay.style.transform = '';

  answerScreen.classList.add('hidden');
  questionScreen.classList.remove('hidden');
  questionScreen.classList.replace('border-red-600','border-indigo-600');
  questionScreen.classList.remove('opacity-50','pointer-events-none');

  const currentQ = triviaQuestions[index];
  questionNumber.textContent = `Question #${index + 1}`;
  questionText.textContent   = currentQ.question;
  hintButton.textContent     = 'Show Hint (H)';
  revealAnswerButton.textContent = 'Reveal Answer (R)';
  pauseButton.textContent    = 'Pause ⏸';

  hintText.classList.add('opacity-0');
  if (currentQ.hint) {
    hintText.textContent = currentQ.hint;
    hintButton.disabled  = false;
  } else {
    hintButton.disabled  = true;
    hintText.textContent = '';
  }

  // Multiple Choice
  mcOptionsContainer.innerHTML = '';
  if (isMultipleChoiceEnabled) {
    correctMcAnswer = currentQ.answer;
    let allOptions  = [currentQ.answer];

    if (currentQ.nearCorrectDummy && currentQ.nearCorrectDummy !== currentQ.answer) {
      allOptions.push(currentQ.nearCorrectDummy);
    }
    const decoys = getDecoyAnswers(currentQ.answer, decoyAnswers);
    for (const d of decoys) {
      if (!allOptions.includes(d) && allOptions.length < 4) allOptions.push(d);
    }
    shuffleArray(allOptions);
    allOptions.forEach((option, idx) => {
      const btn     = document.createElement('button');
      btn.id        = `mc-option-${String.fromCharCode(65 + idx)}`;
      btn.dataset.answer = option;
      btn.textContent    = `${String.fromCharCode(65 + idx)}. ${option}`;
      btn.className = 'mc-button option-button bg-white text-gray-800 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition duration-150 shadow-md text-left';
      btn.onclick   = handleMultiChoiceClick;
      mcOptionsContainer.appendChild(btn);
    });
  }

  revealAnswerButton.disabled = false;
  skipButton.disabled         = false;
  startTimer();
}

function handleMultiChoiceClick(event) {
  const selectedButton = event.target;
  const selectedAnswer = selectedButton.dataset.answer;
  const isCorrect      = selectedAnswer === correctMcAnswer;

  // Give all buttons a neutral dim state first (prevents black/transparent fallback)
  document.querySelectorAll('.mc-button').forEach(btn => {
    btn.classList.remove('bg-white', 'hover:bg-gray-100', 'text-gray-800');
    btn.classList.add('bg-slate-600', 'text-white');
  });

  // Apply color feedback to the selected button
  selectedButton.classList.remove('bg-slate-600');
  selectedButton.classList.add(isCorrect ? 'bg-green-500' : 'bg-red-500', 'text-white');

  if (isCorrect) {
    document.querySelectorAll('.mc-button').forEach(btn => {
      btn.disabled = true;
      // Also highlight the correct answer if it wasn't the one clicked
      if (btn.dataset.answer === correctMcAnswer && btn !== selectedButton) {
        btn.classList.remove('bg-slate-600');
        btn.classList.add('bg-green-500', 'text-white');
      }
    });
    clearInterval(timerInterval);
    questionScreen.classList.add('opacity-50', 'pointer-events-none');
    showAnswer(true, SCORE_POINTS, 'answered');
  } else {
    selectedButton.disabled = true;
    try { playWrongSound(); } catch(e) {}
  }
}

function nextQuestion() {
  currentQuestionIndex++;
  if (currentQuestionIndex < triviaQuestions.length) {
    showQuestion(currentQuestionIndex);
  } else {
    endGame();
  }
}

function endGame() {
  clearInterval(timerInterval);
  gameContent.classList.add('hidden');
  finalScreen.classList.remove('hidden');
  hintButton.disabled         = true;
  revealAnswerButton.disabled = true;
  skipButton.disabled         = true;
  document.getElementById('timerContainer').classList.remove('hidden');
}

function skipQuestion() {
  if (isPaused) return;
  clearInterval(timerInterval);
  nextQuestion();
}

function handleTimeUp() {
  stopAllSounds();
  document.querySelectorAll('.mc-button').forEach(btn => btn.disabled = true);
  questionScreen.classList.add('opacity-50','pointer-events-none');
  clearInterval(timerInterval);
  timerDisplay.textContent = '0';
  timerContainer.classList.remove('bg-yellow-200');
  timerContainer.classList.add('bg-red-500');
  cancelAnimationFrame(msInterval);
  document.getElementById('msDisplay').textContent = '000';
  timerDisplay.classList.remove('fall-zoom');
  showAnswer(false, 0, 'timeup');
}

function restartCurrentQuestion() {
  answerScreen.classList.remove('bg-gray-700');
  nextQuestionButton.classList.remove('hidden');
  restartCurrentButton.classList.add('hidden');
  skipFromAnswerButton.classList.add('hidden');
  answerStatusText.textContent = 'The Correct Answer Is:';
  showQuestion(currentQuestionIndex);
}

function skipFromTimeUp() {
  answerScreen.classList.remove('bg-gray-700');
  nextQuestionButton.classList.remove('hidden');
  restartCurrentButton.classList.add('hidden');
  skipFromAnswerButton.classList.add('hidden');
  answerStatusText.textContent = 'The Correct Answer Is:';
  nextQuestion();
}

function showAnswer(isCorrect, scoreChange, state = 'revealed') {
  stopMilliseconds();
  reviewQuestionButton.classList.add('hidden');
  stopAllSounds();
  clearInterval(timerInterval);
  questionScreen.classList.add('hidden');
  answerScreen.classList.remove('hidden');
  const currentQ = triviaQuestions[currentQuestionIndex];
  answerScreen.classList.remove('bg-red-500','bg-green-500','bg-gray-700','bg-gray-500');

  if (state === 'timeup') {
    answerScreen.classList.add('bg-gray-700');
    answerStatusText.textContent = "Time's Up!";
    answerText.textContent       = '';
    nextQuestionButton.classList.add('hidden');
    restartCurrentButton.classList.remove('hidden');
    skipFromAnswerButton.classList.remove('hidden');
    reviewQuestionButton.classList.remove('hidden');
    try { playDeathSound(); } catch(e) {}

  } else if (state === 'skipped' || state === 'revealed') {
    answerScreen.classList.add('bg-gray-500');
    answerStatusText.textContent = state === 'skipped' ? 'Question Skipped! The Answer Was:' : 'The Answer Was:';
    answerText.textContent       = currentQ ? currentQ.answer : '';
    answerText.classList.add('big-answer');
    nextQuestionButton.classList.remove('hidden');
    restartCurrentButton.classList.add('hidden');
    skipFromAnswerButton.classList.add('hidden');

  } else if (state === 'answered') {
    document.getElementById('timerContainer').classList.add('hidden');
    answerScreen.classList.add(isCorrect ? 'bg-green-500' : 'bg-red-500');
    answerStatusText.textContent = isCorrect ? 'Correct! The Answer Is:' : 'Incorrect! The Answer Was:';
    answerText.textContent       = currentQ ? currentQ.answer : '';
    answerText.classList.add('big-answer');
    if (isCorrect) {
      try { playVictorySound(); } catch(e) {}
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      launchFireworks();
    } else {
      try { playWrongSound(); } catch(e) {}
    }
    nextQuestionButton.classList.remove('hidden');
    restartCurrentButton.classList.add('hidden');
    skipFromAnswerButton.classList.add('hidden');
  }
  setTimeout(() => nextQuestionButton.focus(), 100);
}

/* ── Timer ───────────────────────────────────────────────────── */
function startTimer() {
  ensureAudioResumed();
  updateTimerDisplay();
  lastUpdate    = performance.now();
  timerInterval = setInterval(() => {
    if (isPaused) return;
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) handleTimeUp();
  }, 1000);
  msInterval = requestAnimationFrame(updateMilliseconds);
}

function updateMilliseconds(timestamp) {
  if (isPaused || timeRemaining <= 0) {
    document.getElementById('msDisplay').textContent = '000';
    return;
  }
  const diff = timestamp - lastUpdate;
  const ms   = 1000 - (diff % 1000);
  document.getElementById('msDisplay').textContent = ms.toFixed(0).padStart(3,'0');
  msInterval = requestAnimationFrame(updateMilliseconds);
}

function stopMilliseconds() {
  try { cancelAnimationFrame(msInterval); } catch(e) {}
  const msDisplay = document.getElementById('msDisplay');
  if (msDisplay) msDisplay.textContent = '000';
}

function updateTimerDisplay() {
  timerDisplay.textContent = timeRemaining;
  timerContainer.classList.remove('bg-yellow-200','bg-red-500','bg-gray-100');
  timerDisplay.classList.remove('flashing-red');

  if (timeRemaining <= 20 && timeRemaining > 5) {
    timerContainer.classList.add('bg-yellow-200');
    try { playWarning20(); } catch(e) {}
  } else if (timeRemaining <= 5 && timeRemaining > 0) {
    timerContainer.classList.add('bg-red-500');
    timerDisplay.classList.add('flashing-red');
    timerDisplay.classList.remove('fall-zoom');
    void timerDisplay.offsetWidth;
    timerDisplay.classList.add('fall-zoom');
    try { playWarning5(); } catch(e) {}
  } else if (timeRemaining <= 0) {
    timerDisplay.classList.remove('fall-zoom');
  } else {
    timerContainer.classList.add('bg-gray-100');
  }
}

function togglePause() {
  if (gameContent.classList.contains('hidden')) return;
  isPaused = !isPaused;
  if (isPaused) {
    clearInterval(timerInterval);
    pauseButton.textContent = 'Resume ▶';
    if (masterAudioCtx?.state === 'running') masterAudioCtx.suspend();
    pauseMenuModal.classList.remove('hidden');
  } else {
    pauseButton.textContent = 'Pause ⏸';
    pauseMenuModal.classList.add('hidden');
    if (masterAudioCtx?.state === 'suspended') masterAudioCtx.resume();
    startTimer();
  }
}

function pauseGame() {
  gamePaused = true;
  try { clearInterval(timerInterval); } catch(e) {}
  try { if (masterAudioCtx?.state === 'running') masterAudioCtx.suspend(); } catch(e) {}
  try { stopAllSounds(); } catch(e) {}
  pauseMenuModal?.classList.remove('hidden');
  if (!isPaused) togglePause();
}

function resumeGame() {
  if (isPaused) togglePause();
}

/* ── Settings ────────────────────────────────────────────────── */
function updateToggleDot(toggle) {
  if (!toggle) return;
  const dot = toggle.parentElement.querySelector('.dot');
  if (!dot) return;
  dot.classList.toggle('translate-x-6', toggle.checked);
}

function openSettingsModal() {
  const fireworksToggle = document.getElementById('fireworksToggle');
  if (!gameContent.classList.contains('hidden')) {
    isPaused = true;
    clearInterval(timerInterval);
  }
  timeInput.value              = TIME_PER_QUESTION;
  scorePointsInput.value       = SCORE_POINTS;
  darkModeToggle.checked       = localStorage.getItem('darkMode') === 'enabled';
  multiChoiceToggle.checked    = localStorage.getItem('multiChoiceMode') === 'enabled';
  hideScoreTrackerToggle.checked = localStorage.getItem('hideScoreTracker') === 'enabled';
  updateToggleDot(darkModeToggle);
  updateToggleDot(multiChoiceToggle);
  updateToggleDot(hideScoreTrackerToggle);

  fireworksToggle.addEventListener('change', function() {
    localStorage.setItem('fireworksEnabled', this.checked ? 'enabled' : 'disabled');
    updateToggleDot(this);
    toggleFireworks(this.checked);
  });

  const savedFireworks = localStorage.getItem('fireworksEnabled');
  fireworksToggle.checked = savedFireworks === 'enabled';
  updateToggleDot(fireworksToggle);

  settingsModal.classList.remove('hidden');
  if (masterAudioCtx?.state === 'running') masterAudioCtx.suspend();
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
  if (pauseMenuModal.classList.contains('hidden') && !gameContent.classList.contains('hidden')) {
    isPaused = false;
    startTimer();
  }
  if (masterAudioCtx?.state === 'suspended') masterAudioCtx.resume();
}

function saveSettingsAndClose() {
  const newTime     = parseInt(timeInput.value);
  const newScore    = parseInt(scorePointsInput.value);
  const darkEnabled = darkModeToggle.checked;
  const mcEnabled   = multiChoiceToggle.checked;
  const hideTracker = hideScoreTrackerToggle.checked;

  if (newTime >= 5 && newTime <= 120 && newScore >= 1) {
    TIME_PER_QUESTION       = newTime;
    SCORE_POINTS            = newScore;
    isMultipleChoiceEnabled = mcEnabled;
    localStorage.setItem('timeInput', newTime);
    localStorage.setItem('scorePointsInput', newScore);
    localStorage.setItem('darkMode', darkEnabled ? 'enabled' : 'disabled');
    localStorage.setItem('multiChoiceMode', mcEnabled ? 'enabled' : 'disabled');
    localStorage.setItem('hideScoreTracker', hideTracker ? 'enabled' : 'disabled');
    applyDarkMode(darkEnabled);
    applyScoreTrackerVisibility(hideTracker);
    settingsModal.classList.add('hidden');
    clearInterval(timerInterval);
    welcomeScreen.classList.add('hidden');
    finalScreen.classList.add('hidden');
    gameContent.classList.remove('hidden');
    currentQuestionIndex = 0;
    timeRemaining        = TIME_PER_QUESTION;
    showQuestion(currentQuestionIndex);
    applyScoreTrackerVisibility(hideTracker);
  } else {
    alert('Please enter valid numbers: time 5–120 seconds, score 1+.');
  }
}

/* ── Score Tracker ───────────────────────────────────────────── */
function initializeScoreTracker() {
  const saved = JSON.parse(localStorage.getItem('triviaPlayers'));
  if (saved?.length > 0) {
    players      = saved;
    nextPlayerId = players.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  } else {
    addPlayer('Player 1');
  }
  renderPlayerList();
}

function savePlayers() {
  localStorage.setItem('triviaPlayers', JSON.stringify(players));
}

function addPlayer(name = `Player ${nextPlayerId}`) {
  players.push({ id: nextPlayerId++, name, score: 0 });
  savePlayers();
  renderPlayerList();
}

function removePlayer(id) {
  players = players.filter(p => p.id !== id);
  savePlayers();
  renderPlayerList();
}

function changeScore(id, amount) {
  const player = players.find(p => p.id === id);
  if (player) {
    player.score = Math.max(0, player.score + amount);
    savePlayers();
    renderPlayerList();
  }
}

function renderPlayerList() {
  playerListContainer.innerHTML = '';
  players.sort((a, b) => b.score - a.score);
  players.forEach((player, index) => {
    const playerDiv  = document.createElement('div');
    playerDiv.className = 'flex items-center p-3 border-b border-gray-200 dark:border-gray-700';

    const rankSpan   = document.createElement('span');
    rankSpan.className = `text-xl font-bold w-8 text-center ${index === 0 ? 'text-yellow-600' : 'text-gray-500'}`;
    rankSpan.textContent = index === 0 ? '👑' : `#${index + 1}`;
    playerDiv.appendChild(rankSpan);

    const infoDiv    = document.createElement('div');
    infoDiv.className = 'flex-1 min-w-0';

    const nameInput  = document.createElement('input');
    nameInput.type   = 'text';
    nameInput.value  = player.name;
    nameInput.className = 'w-full text-lg font-semibold border-b border-transparent focus:border-indigo-500 bg-transparent';
    nameInput.onchange = e => { player.name = e.target.value || `Player ${player.id}`; savePlayers(); };
    infoDiv.appendChild(nameInput);

    const scoreSpan  = document.createElement('span');
    scoreSpan.className = 'text-2xl font-bold text-indigo-600';
    scoreSpan.textContent = player.score;
    infoDiv.appendChild(scoreSpan);
    playerDiv.appendChild(infoDiv);

    const btnGroup   = document.createElement('div');
    btnGroup.className = 'flex flex-col ml-3 space-y-1';
    const inc        = parseInt(scoreIncrementInput.value) || 1;

    const plusBtn    = document.createElement('button');
    plusBtn.textContent = '+';
    plusBtn.className   = 'w-8 h-8 bg-green-500 text-white rounded-full hover:bg-green-600 transition font-bold text-sm';
    plusBtn.onclick     = () => changeScore(player.id, inc);
    btnGroup.appendChild(plusBtn);

    const minusBtn   = document.createElement('button');
    minusBtn.textContent = '-';
    minusBtn.className   = 'w-8 h-8 bg-red-500 text-white rounded-full hover:bg-red-600 transition font-bold text-sm';
    minusBtn.onclick     = () => changeScore(player.id, -inc);
    btnGroup.appendChild(minusBtn);

    const delBtn     = document.createElement('button');
    delBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3"></path></svg>';
    delBtn.className = 'w-8 h-8 mt-1 text-gray-400 hover:text-red-500 transition flex items-center justify-center';
    delBtn.onclick   = () => { if (confirm(`Remove ${player.name}?`)) removePlayer(player.id); };
    btnGroup.appendChild(delBtn);

    playerDiv.appendChild(btnGroup);
    playerListContainer.appendChild(playerDiv);
  });
}

/* ── Event Listeners ─────────────────────────────────────────── */
initAudioButton.addEventListener('click', () => {
  initializeAudio();
  initAudioButton.textContent = 'Sound Ready!';
  initAudioButton.disabled    = true;
  startGameButton.classList.remove('hidden');
});

startGameButton.addEventListener('click', startGame);

nextQuestionButton.addEventListener('click', () => { stopAllSounds(); nextQuestion(); });

reviewQuestionButton.addEventListener('click', () => {
  stopAllSounds();
  clearInterval(timerInterval);
  answerScreen.classList.add('hidden');
  questionScreen.classList.remove('hidden','opacity-50','pointer-events-none');
  const currentQ = triviaQuestions[currentQuestionIndex];
  mcOptionsContainer.innerHTML = '';
  correctMcAnswer = currentQ.answer;
  let allOptions  = [currentQ.answer];
  if (currentQ.nearCorrectDummy && currentQ.nearCorrectDummy !== currentQ.answer) {
    allOptions.push(currentQ.nearCorrectDummy);
  }
  const decoys = getDecoyAnswers(currentQ.answer, decoyAnswers);
  for (const d of decoys) {
    if (!allOptions.includes(d) && allOptions.length < 4) allOptions.push(d);
  }
  shuffleArray(allOptions);
  allOptions.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.id    = `mc-option-${String.fromCharCode(65 + i)}`;
    btn.dataset.answer = opt;
    btn.textContent    = `${String.fromCharCode(65 + i)}. ${opt}`;
    btn.className = 'mc-button option-button bg-white text-gray-800 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition duration-150 shadow-md text-left';
    btn.onclick   = handleMultiChoiceClick;
    mcOptionsContainer.appendChild(btn);
  });
  hintButton.disabled         = false;
  revealAnswerButton.disabled = false;
  skipButton.disabled         = false;
  isPaused    = true;
  timeRemaining = 0;
  updateTimerDisplay();
  reviewQuestionButton.classList.add('hidden');
});

restartGameButton.addEventListener('click', startGame);

hintButton.addEventListener('click', () => {
  const overlayText = (hintText?.textContent?.trim()) || 'No hint available.';
  hintTextOverlay.textContent = overlayText;
  hintScreen.classList.remove('hidden');
  setTimeout(() => {
    hintScreen.classList.add('active');
    hintBox.classList.add('active');
  }, 20);
  hintButton.disabled = true;
  setTimeout(hideHint, 15000);
});

revealAnswerButton.addEventListener('click', () => {
  stopAllSounds();
  clearInterval(timerInterval);
  showAnswer(false, 0, 'revealed');
});

skipButton.addEventListener('click', () => { stopAllSounds(); skipQuestion(); });
pauseButton.addEventListener('click', togglePause);
resumeButton.addEventListener('click', togglePause);
restartFromPauseButton.addEventListener('click', () => { pauseMenuModal.classList.add('hidden'); startGame(); });
settingsFromPauseButton.addEventListener('click', () => { pauseMenuModal.classList.add('hidden'); openSettingsModal(); });
settingsButton.addEventListener('click', openSettingsModal);
closeSettings.addEventListener('click', closeSettingsModal);
saveSettings.addEventListener('click', saveSettingsAndClose);
restartCurrentButton.addEventListener('click', restartCurrentQuestion);
skipFromAnswerButton.addEventListener('click', skipFromTimeUp);
addPlayerButton.addEventListener('click', () => addPlayer());

darkModeToggle.addEventListener('change', function() {
  localStorage.setItem('darkMode', this.checked ? 'enabled' : 'disabled');
  applyDarkMode(this.checked);
  updateToggleDot(this);
});

multiChoiceToggle.addEventListener('change', function() {
  localStorage.setItem('multiChoiceMode', this.checked ? 'enabled' : 'disabled');
  updateToggleDot(this);
});

hideScoreTrackerToggle.addEventListener('change', function() {
  localStorage.setItem('hideScoreTracker', this.checked ? 'enabled' : 'disabled');
  applyScoreTrackerVisibility(this.checked);
  updateToggleDot(this);
});

document.addEventListener('keydown', e => {
  if (!settingsModal.classList.contains('hidden') || !pauseMenuModal.classList.contains('hidden')) return;
  if (gameContent.classList.contains('hidden')) return;

  if (e.key === ' ' && !e.target.closest('button, input')) {
    e.preventDefault();
    togglePause();
  }
  if (!answerScreen.classList.contains('hidden')) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!restartCurrentButton.classList.contains('hidden')) restartCurrentButton.click();
      else if (!skipFromAnswerButton.classList.contains('hidden')) skipFromAnswerButton.click();
      else if (!nextQuestionButton.classList.contains('hidden')) nextQuestionButton.click();
    } else if (e.key.toUpperCase() === 'R' && !restartCurrentButton.classList.contains('hidden')) {
      restartCurrentButton.click();
    } else if (e.key.toUpperCase() === 'S' && !skipFromAnswerButton.classList.contains('hidden')) {
      skipFromAnswerButton.click();
    }
  } else if (!questionScreen.classList.contains('hidden') && !isPaused) {
    if (e.key.toUpperCase() === 'H' && !hintButton.disabled) hintButton.click();
    else if (e.key.toUpperCase() === 'R' && !revealAnswerButton.disabled) revealAnswerButton.click();
    else if (e.key.toUpperCase() === 'S' && !skipButton.disabled) skipButton.click();
    else if (isMultipleChoiceEnabled) {
      const key = e.key.toUpperCase();
      if (key >= 'A' && key <= 'D') {
        const mc = document.getElementById(`mc-option-${key}`);
        if (mc && !mc.disabled) mc.click();
      }
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

/* ── Initialization ──────────────────────────────────────────── */
initGoogle();

const savedMode    = localStorage.getItem('darkMode');
const prefersDark  = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const darkEnabled  = savedMode === 'enabled' || (savedMode === null && prefersDark);
darkModeToggle.checked = darkEnabled;
applyDarkMode(darkEnabled);
updateToggleDot(darkModeToggle);

const savedMC = localStorage.getItem('multiChoiceMode');
multiChoiceToggle.checked  = savedMC === 'enabled';
isMultipleChoiceEnabled    = savedMC === 'enabled';
updateToggleDot(multiChoiceToggle);

const savedHide = localStorage.getItem('hideScoreTracker');
hideScoreTrackerToggle.checked = savedHide === 'enabled';
applyScoreTrackerVisibility(savedHide === 'enabled');
updateToggleDot(hideScoreTrackerToggle);

timeInput.value       = localStorage.getItem('timeInput') || 30;
scorePointsInput.value= localStorage.getItem('scorePointsInput') || 100;
TIME_PER_QUESTION     = parseInt(timeInput.value);
SCORE_POINTS          = parseInt(scorePointsInput.value);

initializeScoreTracker();
