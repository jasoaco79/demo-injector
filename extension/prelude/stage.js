function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => resolve(state || {}));
  });
}

function setLaunchMode(mode) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      const nextState = { ...(state || {}), launchMode: mode };
      chrome.runtime.sendMessage({ type: 'SET_STATE', state: nextState }, () => resolve(nextState));
    });
  });
}

async function launchCentral() {
  await setLaunchMode('direct');
  const targetUrl = 'https://central.sophos.com/manage/dashboard';
  chrome.tabs.query({ url: 'https://central.sophos.com/*' }, (tabs) => {
    if (tabs && tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true, url: targetUrl });
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
    window.close();
  });
}

let currentSlide = 0;
let timerTick = null;
let opStart = Date.now();

function goToSlide(n) {
  currentSlide = Math.max(0, Math.min(2, n));
  document.getElementById('slides-track').style.transform = `translateX(-${currentSlide * 100}vw)`;
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === currentSlide));
  document.getElementById('nav-prev').classList.toggle('disabled', currentSlide === 0);
  document.getElementById('nav-next').classList.toggle('disabled', currentSlide === 2);
}

function navigate(dir) { goToSlide(currentSlide + dir); }

function startTimer() {
  timerTick = setInterval(() => {
    const s = Math.floor((Date.now() - opStart) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    document.getElementById('op-timer').textContent = `${hh}:${mm}:${ss}`;
  }, 1000);
}

const MILESTONES = {
  'T1486': { icon: '🔥', label: 'FILES TARGETED FOR ENCRYPTION', color: '#ff6900', bg: 'rgba(255,105,0,0.10)' },
  'T1490': { icon: '🧨', label: 'RECOVERY MECHANISMS TARGETED', color: '#ff4444', bg: 'rgba(255,68,68,0.10)' },
  'T1059': { icon: '⚡', label: 'MALICIOUS CODE EXECUTION', color: '#00A8E0', bg: 'rgba(0,168,224,0.10)' },
  'T1204': { icon: '📎', label: 'USER EXECUTED MALICIOUS FILE', color: '#00A8E0', bg: 'rgba(0,168,224,0.10)' }
};

function getMilestone(id) {
  if (!id) return null;
  const root = id.split('.')[0];
  return MILESTONES[root] || null;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
}

function buildAttackFeed(scenario) {
  const steps = [];
  const prelude = scenario.prelude || {};
  const mitre = prelude.mitreTechniques || [];
  const alerts = scenario.alerts?.items || [];
  const detections = scenario.detections?.items || [];

  if (prelude.slides?.length) {
    prelude.slides.forEach((slide, idx) => {
      const mt = mitre[idx] || mitre[0] || null;
      steps.push({
        type: 'slide',
        title: slide.title,
        body: slide.body,
        technique: mt
      });
    });
  }

  detections.slice(0, 2).forEach((d) => {
    const mt = d.mitreAttacks?.[0]?.tactic?.techniques?.[0] || null;
    steps.push({
      type: 'detection',
      title: d.ruleDescription || d.caseDescription || d.attackType || 'Detection',
      body: d.rawData?.cmdline || d.device?.hostname || '',
      technique: mt
    });
  });

  alerts.slice(0, 2).forEach((a) => {
    steps.push({
      type: 'alert',
      title: a.description || a.type || 'Alert',
      body: a.info || a.location || '',
      technique: null
    });
  });

  return steps.slice(0, 6);
}

function renderFeed(scenario) {
  const container = document.getElementById('feed-full');
  const compact = document.getElementById('feed-compact');
  const items = buildAttackFeed(scenario);
  const prelude = scenario.prelude || {};

  document.getElementById('feed-hero-title').textContent = prelude.title || scenario.name || 'Threat storyline';
  document.getElementById('feed-hero-copy').textContent = prelude.subtitle || scenario.description || 'Threat context before the Sophos Central walkthrough.';

  const feedHtml = items.map((item) => {
    const m = getMilestone(item.technique?.id);
    if (m) {
      return `<div class="feed-impact" style="border-color:${m.color}; background:${m.bg}">
        <span class="fi-icon">${m.icon}</span>
        <div>
          <div class="fi-label" style="color:${m.color}">${escapeHtml(m.label)}</div>
          <div class="fi-tech">${escapeHtml(item.technique?.id || '')}${item.technique?.name ? ' — ' + escapeHtml(item.technique.name) : ''}</div>
        </div>
      </div>`;
    }
    return `<div class="feed-item">
      <div class="feed-chip chip-complete">COMPLETE</div>
      <div class="feed-info">
        <div class="feed-tactic">${escapeHtml(item.type)}</div>
        <div class="feed-name">${escapeHtml(item.title)}</div>
        <div class="feed-tech">${escapeHtml(item.body)}</div>
      </div>
    </div>`;
  }).join('');

  const hero = container.querySelector('.feed-hero')?.outerHTML || '';
  container.innerHTML = hero + feedHtml;

  compact.innerHTML = items.map((item) => `<div class="feed-item-sm">
      <div class="feed-name-sm">${escapeHtml(item.title)}</div>
      <div class="feed-tactic-sm">${escapeHtml(item.type)}</div>
    </div>`).join('');
}

function renderBriefing(scenario) {
  const prelude = scenario.prelude || {};
  document.getElementById('scenario-name').textContent = scenario.name || 'Scenario';
  document.getElementById('brief-eyebrow').textContent = prelude.threatFamily || 'Threat Briefing';
  document.getElementById('brief-title').textContent = prelude.title || scenario.name || 'Threat Briefing';
  document.getElementById('brief-subtitle').textContent = prelude.subtitle || scenario.description || '';

  const storySteps = document.getElementById('story-steps');
  storySteps.innerHTML = (prelude.slides || []).map((slide) => `
    <div class="story-step">
      <h3>${escapeHtml(slide.title || '')}</h3>
      <p>${escapeHtml(slide.body || '')}</p>
    </div>
  `).join('');

  const proofPoints = document.getElementById('proof-points');
  const points = prelude.expectedDetections || [];
  proofPoints.innerHTML = points.map((p) => `<div class="impact-item">${escapeHtml(p)}</div>`).join('');

  const mitrePills = document.getElementById('mitre-pills');
  mitrePills.innerHTML = (prelude.mitreTechniques || []).map((m) => `<div class="pill">${escapeHtml(m.id)} — ${escapeHtml(m.name)}</div>`).join('');

  document.getElementById('transition-headline').textContent = `Show ${scenario.customer?.name || 'the customer'} how this appears in Central`;
  document.getElementById('transition-copy').textContent = 'You now move from the threat narrative into operational proof: alerts, cases, detections, threat graphs, and response flow inside the injected Sophos Central experience.';
  document.getElementById('transition-line').textContent = prelude.transitionLine || 'Now let’s pivot into Sophos Central and show exactly how your team would see, investigate, and respond to this incident.';
  document.getElementById('expected-points').innerHTML = points.map((p) => `<div class="proof-item">${escapeHtml(p)}</div>`).join('');
}

(async function init() {
  const state = await getState();
  const scenario = state?.scenarioData || {};
  const mode = state?.launchMode || 'direct';
  if (mode === 'direct') {
    launchCentral();
    return;
  }
  if (!scenario?.prelude?.enabled) {
    launchCentral();
    return;
  }

  renderFeed(scenario);
  renderBriefing(scenario);
  startTimer();

  document.getElementById('nav-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('nav-next').addEventListener('click', () => navigate(1));
  document.querySelectorAll('.dot').forEach((d, i) => d.addEventListener('click', () => goToSlide(i)));
  document.getElementById('launchBtn').addEventListener('click', launchCentral);
  document.getElementById('restartBtn').addEventListener('click', () => goToSlide(1));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') navigate(1);
    else if (e.key === 'ArrowLeft') navigate(-1);
    else if (e.key === 'Escape') window.close();
  });
})();
