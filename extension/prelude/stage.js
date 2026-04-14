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

function goToSlide(n) {
  currentSlide = Math.max(0, Math.min(2, n));
  document.getElementById('slides-track').style.transform = `translateX(-${currentSlide * 100}vw)`;
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === currentSlide));
  document.getElementById('nav-prev').classList.toggle('disabled', currentSlide === 0);
  document.getElementById('nav-next').classList.toggle('disabled', currentSlide === 2);
}

function navigate(dir) {
  goToSlide(currentSlide + dir);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
}

function renderTemplate(value, customerName) {
  return String(value || '').replace(/\{\{\s*customerName\s*\}\}/g, customerName || 'the customer');
}

function renderTimeline(scenario) {
  const prelude = scenario.prelude || {};
  const customerName = scenario.customer?.name || 'the customer';

  document.getElementById('feed-hero-title').textContent = renderTemplate(prelude.title || scenario.name || 'Threat storyline', customerName);
  document.getElementById('feed-hero-copy').textContent = renderTemplate(prelude.subtitle || scenario.description || 'Threat context before the Sophos Central walkthrough.', customerName);

  const impactStrip = document.getElementById('impact-strip');
  impactStrip.innerHTML = [
    {
      title: 'What’s at Stake',
      body: `A single endpoint event can quickly become a broader business risk for ${customerName}.`
    },
    {
      title: 'Business Risk',
      body: 'If left unchecked, this kind of attack can escalate into disruption, downtime, and executive visibility.'
    },
    {
      title: 'What Happens Next',
      body: 'We’ll move from the story into Sophos Central to show how the team would see, investigate, and respond.'
    }
  ].map((item) => `
    <div class="impact-box">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
    </div>
  `).join('');

  const milestoneMap = new Map((prelude.milestones || []).map((m) => [m.id, m.label]));
  const mitreItems = prelude.mitreTechniques || [];
  const slideItems = prelude.slides || [];
  const timeline = [
    {
      time: '08:14',
      title: milestoneMap.get(mitreItems[0]?.id) || slideItems[0]?.title || `Initial compromise at ${customerName}`,
      detail: slideItems[0]?.body || `A user opens a convincing business file and triggers a ransomware chain on DESKTOP-FIN042.`
    },
    {
      time: '08:16',
      title: 'Malicious file launches',
      detail: 'The endpoint begins executing attacker-controlled code and the incident starts to unfold.'
    },
    {
      time: '08:19',
      title: milestoneMap.get(mitreItems[1]?.id) || 'Recovery mechanisms targeted',
      detail: slideItems[1]?.body || 'Shadow copies are targeted and the conditions for business disruption begin to form.'
    },
    {
      time: '08:22',
      title: 'Encryption attempt begins',
      detail: 'Behavior consistent with ransomware execution appears and the risk of broad impact becomes immediate.'
    },
    {
      time: '08:24',
      title: milestoneMap.get(mitreItems[3]?.id) || slideItems[2]?.title || 'Sophos changes the outcome',
      detail: slideItems[2]?.body || `Sophos detects the malicious activity, blocks encryption behavior, and gives ${customerName} a response path inside Central.`
    }
  ];

  const timelineList = document.getElementById('timeline-list');
  timelineList.innerHTML = timeline.map((item) => `
    <div class="timeline-step">
      <div class="timeline-time">${escapeHtml(item.time || '')}</div>
      <div class="timeline-marker"></div>
      <div class="timeline-card">
        <div class="timeline-title">${escapeHtml(renderTemplate(item.title || '', customerName))}</div>
        <div class="timeline-detail">${escapeHtml(renderTemplate(item.detail || '', customerName))}</div>
      </div>
    </div>
  `).join('');
}

function renderBriefing(scenario) {
  const prelude = scenario.prelude || {};
  const industry = scenario.customer?.industry || 'general';
  const points = prelude.expectedDetections || [];
  const presenterPoints = prelude.talkingPoints || [];
  const industryPoints = prelude.industryTalkingPoints?.[industry] || [];
  const customerName = scenario.customer?.name || 'the customer';

  document.getElementById('scenario-name').textContent = scenario.name || 'Scenario';
  document.getElementById('brief-eyebrow').textContent = renderTemplate(prelude.threatFamily || 'Threat Briefing', customerName);
  document.getElementById('brief-title').textContent = renderTemplate(prelude.title || scenario.name || 'Threat Briefing', customerName);
  document.getElementById('brief-subtitle').textContent = renderTemplate(prelude.subtitle || scenario.description || '', customerName);

  document.getElementById('story-steps').innerHTML = (prelude.slides || []).slice(0, 3).map((slide) => `
    <div class="story-step">
      <h3>${escapeHtml(renderTemplate(slide.title || '', customerName))}</h3>
      <p>${escapeHtml(renderTemplate(slide.body || '', customerName))}</p>
    </div>
  `).join('');

  document.getElementById('proof-points').innerHTML = [...presenterPoints, ...industryPoints, ...points].slice(0, 4).map((p) => `
    <div class="bullet">${escapeHtml(renderTemplate(p, customerName))}</div>
  `).join('');

  document.getElementById('mitre-pills').innerHTML = (prelude.mitreTechniques || []).slice(0, 4).map((m) => `
    <div class="pill"><strong>${escapeHtml(m.id)}</strong><br>${escapeHtml(m.name)}</div>
  `).join('');
}

function renderTransition(scenario) {
  const prelude = scenario.prelude || {};
  const customerName = scenario.customer?.name || 'the customer';
  const points = prelude.expectedDetections || [];
  const customerValue = [
    `Faster clarity for ${customerName} when the incident begins to unfold.`,
    'Clearer prioritization by turning scattered signals into a coherent incident story.',
    'Quicker response decisions before technical impact becomes business impact.'
  ];

  document.getElementById('transition-headline').textContent = 'What your team would see in Sophos Central';
  document.getElementById('transition-copy').textContent = 'This is where the incident becomes clear: the alert, the investigation context, the detections, and the response story your team would act on.';
  document.getElementById('transition-line').textContent = renderTemplate(prelude.transitionLine || 'Now let’s move into Sophos Central and show how this incident becomes visible to your team in real time.', customerName);

  document.getElementById('expected-points').innerHTML = points.slice(0, 4).map((p) => `
    <div class="bullet">${escapeHtml(renderTemplate(p, customerName))}</div>
  `).join('');

  document.getElementById('customer-value').innerHTML = customerValue.map((p) => `
    <div class="click-item">${escapeHtml(p)}</div>
  `).join('');
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

  renderTimeline(scenario);
  renderBriefing(scenario);
  renderTransition(scenario);

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
