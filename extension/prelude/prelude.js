async function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => resolve(state || {}));
  });
}

async function launchCentral() {
  const targetUrl = 'https://central.sophos.com/manage/dashboard';
  chrome.tabs.query({ url: 'https://central.sophos.com/*' }, (tabs) => {
    if (tabs && tabs.length) {
      const tab = tabs[0];
      chrome.tabs.update(tab.id, { active: true, url: targetUrl });
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
    window.close();
  });
}

function renderPrelude(prelude, scenario) {
  document.getElementById('eyebrow').textContent = prelude.threatFamily || 'Threat Prelude';
  document.getElementById('title').textContent = prelude.title || scenario.name || 'Scenario Prelude';
  document.getElementById('subtitle').textContent = prelude.subtitle || scenario.description || '';
  document.getElementById('continueBtn').textContent = prelude.ctaLabel || 'Open Sophos Central Demo';

  const slides = document.getElementById('slides');
  slides.innerHTML = '';
  (prelude.slides || []).forEach((slide) => {
    const div = document.createElement('div');
    div.className = 'slide';
    div.innerHTML = `<div class="slide-title">${slide.title || ''}</div><div class="muted">${slide.body || ''}</div>`;
    slides.appendChild(div);
  });

  const detections = document.getElementById('detections');
  detections.innerHTML = '';
  (prelude.expectedDetections || []).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    detections.appendChild(li);
  });

  const mitre = document.getElementById('mitre');
  mitre.innerHTML = '';
  (prelude.mitreTechniques || []).forEach((item) => {
    const div = document.createElement('div');
    div.className = 'pill';
    div.textContent = `${item.id} — ${item.name}`;
    mitre.appendChild(div);
  });

  if (prelude.videoUrl) {
    const wrap = document.getElementById('videoWrap');
    const video = document.getElementById('video');
    wrap.style.display = 'block';
    video.src = prelude.videoUrl;
    if (prelude.posterUrl) video.poster = prelude.posterUrl;
    if (prelude.autoLaunch) {
      video.addEventListener('ended', () => launchCentral(), { once: true });
    }
  }
}

(async function init() {
  const state = await getState();
  const scenario = state?.scenarioData || {};
  const prelude = scenario?.prelude;

  if (!prelude?.enabled) {
    launchCentral();
    return;
  }

  renderPrelude(prelude, scenario);

  document.getElementById('continueBtn').addEventListener('click', launchCentral);
  document.getElementById('skipBtn').addEventListener('click', launchCentral);
})();
