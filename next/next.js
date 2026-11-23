// Update this session with one or two talks for the next display.
const session = {
  date: 'Monday 23 November',
  room: 'Council Room',
  talks: [{
    time: '14:00',
    title: 'Soft Specialists: Mean-Field Langevin Dynamics and the Emergence of Diversity in LLM Post-Training',
    speaker: 'Andrew Duncan',
    affiliation: 'Imperial College London'
  }, {
    time: '14:50',
    title: 'Convergence rates for Wasserstein gradient flows of free energies and associated particle systems',
    speaker: 'Pierre Monmarché',
    affiliation: 'Université Gustave Eiffel'
  }]
};

const display = document.querySelector('.display');
const workshop = document.querySelector('.workshop-scene');
const next = document.querySelector('.next-scene');
const talkList = document.getElementById('talk-list');
const workshopButton = document.getElementById('show-workshop');
const nextButton = document.getElementById('show-next');
const pauseButton = document.getElementById('pause');
const progress = document.getElementById('progress');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const workshopDuration = 10000;
const nextDuration = 20000;
const cycleDuration = workshopDuration + nextDuration;
let elapsed = 0;
let previousFrame = null;
let paused = motionPreference.matches;

if (session.talks.length < 1 || session.talks.length > 2) {
  throw new Error('The next session must contain one or two talks.');
}
document.querySelector('.session-place').textContent = `${session.date} · ${session.room}`;
talkList.classList.toggle('two-talks', session.talks.length === 2);
display.classList.toggle('two-talk-session', session.talks.length === 2);
for (const talk of session.talks) {
  const article = document.createElement('article');
  article.className = 'talk';
  const time = document.createElement('time');
  time.className = 'talk-time';
  time.textContent = talk.time;
  const details = document.createElement('div');
  for (const [tag, className, text] of [
    ['h2', '', talk.title],
    ['p', 'speaker', talk.speaker],
    ['p', 'affiliation', talk.affiliation]
  ]) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    details.append(element);
  }
  article.append(time, details);
  talkList.append(article);
}

function showView(view) {
  const isNext = view === 'next';
  display.dataset.view = view;
  workshop.setAttribute('aria-hidden', String(isNext));
  workshop.inert = isNext;
  next.setAttribute('aria-hidden', String(!isNext));
  next.inert = !isNext;
  workshopButton.setAttribute('aria-pressed', String(!isNext));
  nextButton.setAttribute('aria-pressed', String(isNext));
}

function updatePlayback() {
  pauseButton.textContent = paused ? 'Play ▷' : 'Pause Ⅱ';
  pauseButton.setAttribute('aria-label', paused ? 'Play automatic transitions' : 'Pause automatic transitions');
}

function selectView(view) {
  elapsed = view === 'next' ? workshopDuration : 0;
  previousFrame = null;
  showView(view);
}

workshopButton.addEventListener('click', () => selectView('workshop'));
nextButton.addEventListener('click', () => selectView('next'));
pauseButton.addEventListener('click', () => {
  paused = !paused;
  previousFrame = null;
  updatePlayback();
});
document.addEventListener('keydown', event => {
  if (event.target.closest('button, a, input, textarea, select')) return;
  if (event.key === 'ArrowRight') selectView('next');
  if (event.key === 'ArrowLeft') selectView('workshop');
  if (event.code === 'Space') {
    event.preventDefault();
    pauseButton.click();
  }
});
document.addEventListener('visibilitychange', () => { previousFrame = null; });
motionPreference.addEventListener('change', event => {
  if (event.matches) {
    paused = true;
    updatePlayback();
  }
});

function tick(timestamp) {
  if (previousFrame !== null && !paused && !document.hidden) {
    elapsed = (elapsed + Math.min(timestamp - previousFrame, 100)) % cycleDuration;
  }
  previousFrame = timestamp;
  const view = elapsed < workshopDuration ? 'workshop' : 'next';
  if (display.dataset.view !== view) showView(view);
  const fraction = view === 'workshop' ? elapsed / workshopDuration : (elapsed - workshopDuration) / nextDuration;
  progress.style.transform = `scaleX(${fraction})`;
  requestAnimationFrame(tick);
}
showView('workshop');
updatePlayback();
requestAnimationFrame(tick);
