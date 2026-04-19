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
let win11SimTimers = [];
let win11SimDone = false;

// ─── Windows 11 Clock ────────────────────────────────────────────────
function updateWin11Clock() {
  const now = new Date();
  const timeEl = document.getElementById('w11-time');
  const dateEl = document.getElementById('w11-date');
  if (!timeEl || !dateEl) return;
  const h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  timeEl.textContent = `${h12}:${m} ${ampm}`;
  const mo = now.getMonth() + 1;
  const d = now.getDate();
  const y = now.getFullYear();
  dateEl.textContent = `${mo}/${d}/${y}`;
}

// ─── Win11 Akira Simulation ──────────────────────────────────────────
const WIN11_FILES = ['wf-1','wf-2','wf-3','wf-4','wf-5','wf-6','wf-7','wf-8'];

function encryptFile(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const base = el.dataset.base || '';
  const ext  = el.dataset.ext  || '';
  el.classList.add('w11-encrypting');
  setTimeout(() => {
    el.classList.remove('w11-encrypting');
    el.classList.add('w11-encrypted');
    const label = el.querySelector('.w11-file-label');
    if (label) label.textContent = `${base}.${ext}.akira`;
    const icon = el.querySelector('.w11-file-icon');
    if (icon) icon.style.filter = 'grayscale(1) opacity(0.5)';
  }, 380);
}

function startWin11Sim() {
  if (win11SimDone) return;
  clearWin11Timers();
  updateWin11Clock();

  const schedule = (fn, ms) => {
    const t = setTimeout(fn, ms);
    win11SimTimers.push(t);
    return t;
  };

  // Encrypt files one by one — staggered 700ms apart
  WIN11_FILES.forEach((id, i) => {
    schedule(() => encryptFile(id), 800 + i * 700);
  });

  // Update status bar as files encrypt
  schedule(() => {
    const st = document.getElementById('w11-status-count');
    if (st) st.textContent = 'Encrypting files…';
  }, 800);

  // akira_readme.txt appears after last file
  const readmeTime = 800 + WIN11_FILES.length * 700 + 200;
  schedule(() => {
    const rm = document.getElementById('wf-readme');
    if (rm) {
      rm.style.display = 'flex';
      rm.classList.add('w11-selected');
    }
    const st = document.getElementById('w11-status-count');
    if (st) st.textContent = '9 items | akira_readme.txt selected';
    const sel = document.getElementById('w11-status-sel');
    if (sel) sel.textContent = '1 item selected';
  }, readmeTime);

  // Windows Security toast
  schedule(() => {
    const toast = document.getElementById('w11-toast');
    if (toast) toast.classList.add('w11-visible');
    const warn = document.getElementById('w11-tb-warning');
    if (warn) warn.classList.add('w11-visible');
  }, readmeTime + 600);

  // Toast dismiss handler
  const dismissBtn = document.getElementById('w11-toast-dismiss');
  if (dismissBtn) {
    dismissBtn.onclick = () => {
      const toast = document.getElementById('w11-toast');
      if (toast) toast.classList.remove('w11-visible');
    };
  }

  // Notepad slides in with ransom note
  schedule(() => {
    const np = document.getElementById('w11-notepad');
    if (np) np.classList.add('w11-visible');
    const nptb = document.getElementById('w11-taskbtn-notepad');
    if (nptb) nptb.style.display = 'flex';
  }, readmeTime + 1400);

  // Akira dark web portal appears — the killer moment
  schedule(() => {
    const portal = document.getElementById('w11-akira-portal');
    if (portal) portal.classList.add('w11-visible');
    const ptb = document.getElementById('w11-taskbtn-portal');
    if (ptb) ptb.style.display = 'flex';
    // Type "help" into the terminal prompt
    typeAkiraCmd('help');
  }, readmeTime + 2800);

  schedule(() => { win11SimDone = true; }, readmeTime + 4000);
}

function resetWin11Sim() {
  clearWin11Timers();
  win11SimDone = false;

  WIN11_FILES.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('w11-encrypting', 'w11-encrypted', 'w11-selected');
    const label = el.querySelector('.w11-file-label');
    if (label) {
      const base = el.dataset.base || '';
      const ext  = el.dataset.ext  || '';
      label.textContent = `${base}.${ext}`;
    }
    const icon = el.querySelector('.w11-file-icon');
    if (icon) icon.style.filter = '';
  });

  const rm = document.getElementById('wf-readme');
  if (rm) { rm.style.display = 'none'; rm.classList.remove('w11-selected'); }

  const toast = document.getElementById('w11-toast');
  if (toast) toast.classList.remove('w11-visible');

  const warn = document.getElementById('w11-tb-warning');
  if (warn) warn.classList.remove('w11-visible');

  const np = document.getElementById('w11-notepad');
  if (np) np.classList.remove('w11-visible');

  const nptb = document.getElementById('w11-taskbtn-notepad');
  if (nptb) nptb.style.display = 'none';

  const portal = document.getElementById('w11-akira-portal');
  if (portal) portal.classList.remove('w11-visible');
  const ptb = document.getElementById('w11-taskbtn-portal');
  if (ptb) ptb.style.display = 'none';
  const typedCmd = document.getElementById('akira-typed-cmd');
  if (typedCmd) typedCmd.textContent = '';
  const helpOut = document.getElementById('akira-help-output');
  if (helpOut) helpOut.style.display = 'none';

  const st = document.getElementById('w11-status-count');
  if (st) st.textContent = '8 items';
  const sel = document.getElementById('w11-status-sel');
  if (sel) sel.textContent = '';
}

function typeAkiraCmd(cmd) {
  const el = document.getElementById('akira-typed-cmd');
  const output = document.getElementById('akira-help-output');
  if (!el) return;
  let i = 0;
  el.textContent = '';
  const interval = setInterval(() => {
    if (i < cmd.length) {
      el.textContent += cmd[i++];
    } else {
      clearInterval(interval);
      setTimeout(() => {
        if (output) output.style.display = 'block';
        el.textContent = '';
      }, 400);
    }
  }, 80);
  win11SimTimers.push(interval);
}

function clearWin11Timers() {
  win11SimTimers.forEach(id => { clearTimeout(id); clearInterval(id); });
  win11SimTimers = [];
}

// ─── Phase Navigator ─────────────────────────────────────────────
let currentPhase = 0;
let phaseTimers = [];

function clearPhaseTimers() {
  phaseTimers.forEach(id => { clearTimeout(id); clearInterval(id); });
  phaseTimers = [];
}

function schedulePhase(fn, ms) {
  const t = setTimeout(fn, ms);
  phaseTimers.push(t);
  return t;
}

function setPhaseStatus(text) {
  const el = document.getElementById('phase-status-text');
  if (el) el.textContent = text;
}

function setPhasePlayBtn(playing) {
  const btn = document.getElementById('phase-play-btn');
  if (btn) btn.classList.toggle('playing', playing);
}

function selectPhase(n) {
  currentPhase = n;
  clearPhaseTimers();

  document.querySelectorAll('.phase-item').forEach((el, i) => {
    el.classList.toggle('active', i === n);
    el.classList.toggle('completed', i < n);
  });
  document.querySelectorAll('.phase-connector').forEach((el, i) => {
    el.classList.toggle('done', i < n);
  });
  document.querySelectorAll('.w11-scene').forEach((el, i) => {
    el.classList.toggle('w11-scene-active', i === n);
  });

  const labels = ['▶  Play Day 1', '▶  Play Days 2–8', '▶  Play Day 9'];
  const labelEl = document.getElementById('phase-play-label');
  if (labelEl) labelEl.textContent = labels[n];

  setPhasePlayBtn(false);
  setPhaseStatus('Ready — click Play to begin');

  if (n === 0) resetPhase0();
  else if (n === 1) resetPhase1();
  else { resetWin11Sim(); win11SimDone = false; }
}

function playCurrentPhase() {
  if (currentPhase === 0) playPhase0();
  else if (currentPhase === 1) playPhase1();
  else startWin11Sim();
}

// ─── Phase 0: Day 1 — Initial Access ─────────────────────────────
function resetPhase0() {
  const dot = document.getElementById('vpn-status-dot');
  const txt = document.getElementById('vpn-status-text');
  const row = document.getElementById('vpn-user-row');
  if (dot) dot.style.background = '#ffb300';
  if (txt) { txt.textContent = 'Connecting…'; txt.style.color = '#555'; }
  if (row) row.style.display = 'none';

  const ev = document.getElementById('w11-eventviewer-win');
  if (ev) ev.style.opacity = '0';
  const evSusp = document.getElementById('ev-suspicious');
  if (evSusp) evSusp.style.display = 'none';
  const evDetail = document.getElementById('ev-detail');
  if (evDetail) evDetail.style.display = 'none';

  const toast = document.getElementById('w11-toast-d1');
  if (toast) toast.classList.remove('w11-visible');
  const evTb = document.getElementById('w11-d1-ev-taskbtn');
  if (evTb) evTb.style.display = 'none';
  const warn = document.getElementById('w11-d1-warn');
  if (warn) warn.classList.remove('w11-visible');
}

function playPhase0() {
  resetPhase0();
  setPhasePlayBtn(true);
  setPhaseStatus('Day 1: Attacker connecting via compromised VPN…');

  schedulePhase(() => {
    const dot = document.getElementById('vpn-status-dot');
    const txt = document.getElementById('vpn-status-text');
    const row = document.getElementById('vpn-user-row');
    if (dot) dot.style.background = '#22c55e';
    if (txt) { txt.textContent = 'Connected'; txt.style.color = '#15803d'; }
    if (row) row.style.display = 'block';
    setPhaseStatus('Connected — source IP: 185.220.101.47 (Tor exit node)');
  }, 1200);

  schedulePhase(() => {
    const ev = document.getElementById('w11-eventviewer-win');
    if (ev) ev.style.opacity = '1';
    const evTb = document.getElementById('w11-d1-ev-taskbtn');
    if (evTb) evTb.style.display = 'flex';
    setPhaseStatus('Event Viewer — anomalous Event ID 4624 detected');
  }, 2600);

  schedulePhase(() => {
    const evSusp = document.getElementById('ev-suspicious');
    if (evSusp) evSusp.style.display = 'grid';
    const evDetail = document.getElementById('ev-detail');
    if (evDetail) evDetail.style.display = 'block';
  }, 4000);

  schedulePhase(() => {
    const toast = document.getElementById('w11-toast-d1');
    if (toast) toast.classList.add('w11-visible');
    const warn = document.getElementById('w11-d1-warn');
    if (warn) warn.classList.add('w11-visible');
    setPhaseStatus('⚠ 8 accounts silently compromised via CVE-2020-3259');
    setPhasePlayBtn(false);
  }, 5200);
}

// ─── Phase 1: Days 2–8 — Silent Collection ────────────────────────
function resetPhase1() {
  ['tm-anydesk','tm-svchost','tm-winscp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const cmd = document.getElementById('w11-cmd-win');
  if (cmd) cmd.style.opacity = '0';
  const cmdLine1 = document.getElementById('cmd-line1');
  if (cmdLine1) cmdLine1.textContent = '';
  const cmdOut = document.getElementById('cmd-output');
  if (cmdOut) cmdOut.style.display = 'none';
  const cmdLine2 = document.getElementById('cmd-line2');
  if (cmdLine2) cmdLine2.textContent = '';

  const winscp = document.getElementById('w11-winscp-win');
  if (winscp) winscp.style.opacity = '0';
  const prog = document.getElementById('winscp-progress');
  if (prog) prog.style.width = '0%';
  const xferred = document.getElementById('winscp-transferred');
  if (xferred) xferred.textContent = '0 GB of 47.3 GB';

  const cmdTb = document.getElementById('w11-d2-cmd-taskbtn');
  if (cmdTb) cmdTb.style.display = 'none';
  const winscpTb = document.getElementById('w11-d2-winscp-taskbtn');
  if (winscpTb) winscpTb.style.display = 'none';
}

function typePhaseCmd(elId, text, onDone) {
  const el = document.getElementById(elId);
  if (!el) { if (onDone) onDone(); return; }
  el.textContent = '';
  let i = 0;
  const iv = setInterval(() => {
    if (i < text.length) {
      el.textContent += text[i++];
    } else {
      clearInterval(iv);
      if (onDone) onDone();
    }
  }, 55);
  phaseTimers.push(iv);
}

function animateWinSCP() {
  let pct = 0;
  const prog = document.getElementById('winscp-progress');
  const xferred = document.getElementById('winscp-transferred');
  const iv = setInterval(() => {
    pct = Math.min(pct + 1.4, 100);
    if (prog) prog.style.width = pct + '%';
    if (xferred) xferred.textContent = `${(pct / 100 * 47.3).toFixed(1)} GB of 47.3 GB`;
    if (pct >= 100) clearInterval(iv);
  }, 220);
  phaseTimers.push(iv);
}

function playPhase1() {
  resetPhase1();
  setPhasePlayBtn(true);
  setPhaseStatus('Days 2–8: Lateral movement via RDP…');

  // AnyDesk C2 appears
  schedulePhase(() => {
    const ad = document.getElementById('tm-anydesk');
    if (ad) ad.style.display = 'grid';
    setPhaseStatus('AnyDesk.exe — C2 channel established, remote control active');
  }, 1000);

  // CMD / Mimikatz fades in
  schedulePhase(() => {
    const cmd = document.getElementById('w11-cmd-win');
    if (cmd) cmd.style.opacity = '1';
    const cmdTb = document.getElementById('w11-d2-cmd-taskbtn');
    if (cmdTb) cmdTb.style.display = 'flex';
    setPhaseStatus('Mimikatz — dumping LSASS credentials from memory…');
    schedulePhase(() => {
      typePhaseCmd('cmd-line1', 'C:\\> mimikatz.exe', () => {
        schedulePhase(() => {
          const out = document.getElementById('cmd-output');
          if (out) out.style.display = 'block';
          schedulePhase(() => {
            const sv = document.getElementById('tm-svchost');
            if (sv) sv.style.display = 'grid';
          }, 600);
          schedulePhase(() => {
            typePhaseCmd('cmd-line2', 'C:\\> winscp.exe /script=exfil.txt', null);
          }, 1400);
        }, 800);
      });
    }, 300);
  }, 2400);

  // WinSCP transfer starts
  schedulePhase(() => {
    const winscp = document.getElementById('w11-winscp-win');
    if (winscp) winscp.style.opacity = '1';
    const winscpTb = document.getElementById('w11-d2-winscp-taskbtn');
    if (winscpTb) winscpTb.style.display = 'flex';
    const tmWinscp = document.getElementById('tm-winscp');
    if (tmWinscp) tmWinscp.style.display = 'grid';
    setPhaseStatus('WinSCP — exfiltrating 47.3 GB to Tor exit node…');
    animateWinSCP();
  }, 4800);

  // Complete
  schedulePhase(() => {
    setPhaseStatus('✓ 47.3 GB exfiltrated — attacker ready to deploy ransomware');
    setPhasePlayBtn(false);
  }, 8200);
}

function goToSlide(n) {
  const prev = currentSlide;
  currentSlide = Math.max(0, Math.min(2, n));
  document.getElementById('slides-track').style.transform = `translateX(-${currentSlide * 100}vw)`;
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === currentSlide));
  document.getElementById('nav-prev').classList.toggle('disabled', currentSlide === 0);
  document.getElementById('nav-next').classList.toggle('disabled', currentSlide === 2);

  if (currentSlide === 2) {
    // Initialize phase navigator at Day 1
    selectPhase(0);
  } else if (prev === 2) {
    clearPhaseTimers();
    resetWin11Sim();
  }
}

function navigate(dir) { goToSlide(currentSlide + dir); }

function startTimer() {
  updateWin11Clock();
  setInterval(updateWin11Clock, 30000); // update Win11 clock every 30s
  timerTick = setInterval(() => {
    const s = Math.floor((Date.now() - opStart) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    document.getElementById('op-timer').textContent = `${hh}:${mm}:${ss}`;
  }, 1000);
}

const MILESTONES = {
  'T1133': { icon: '🔑', label: 'VPN ACCESS COMPROMISED',          color: '#ff4444', bg: 'rgba(255,68,68,0.10)' },
  'T1078': { icon: '👤', label: 'VALID CREDENTIALS ABUSED',         color: '#ff4444', bg: 'rgba(255,68,68,0.10)' },
  'T1003': { icon: '🔓', label: 'CREDENTIALS DUMPED FROM LSASS',    color: '#ff4444', bg: 'rgba(255,68,68,0.10)' },
  'T1021': { icon: '🖥️',  label: 'LATERAL MOVEMENT VIA RDP',        color: '#ffb300', bg: 'rgba(255,179,0,0.10)' },
  'T1219': { icon: '📡', label: 'ANYDESK C2 CHANNEL ESTABLISHED',   color: '#ffb300', bg: 'rgba(255,179,0,0.10)' },
  'T1048': { icon: '📤', label: 'DATA EXFILTRATED VIA SFTP',        color: '#ff6900', bg: 'rgba(255,105,0,0.10)' },
  'T1053': { icon: '📌', label: 'PERSISTENCE ESTABLISHED',          color: '#ffb300', bg: 'rgba(255,179,0,0.10)' },
  'T1059': { icon: '⚡', label: 'POWERSHELL EXECUTION',             color: '#00A8E0', bg: 'rgba(0,168,224,0.10)' },
  'T1562': { icon: '🛡️',  label: 'WINDOWS DEFENDER DISABLED',       color: '#ffb300', bg: 'rgba(255,179,0,0.10)' },
  'T1070': { icon: '⚠️', label: 'FORENSIC EVIDENCE WIPED',          color: '#ffb300', bg: 'rgba(255,179,0,0.10)' },
  'T1204': { icon: '📎', label: 'USER EXECUTED MALICIOUS FILE',      color: '#00A8E0', bg: 'rgba(0,168,224,0.10)' },
  'T1490': { icon: '🧨', label: 'SHADOW COPIES DELETED',            color: '#ff4444', bg: 'rgba(255,68,68,0.10)' },
  'T1486': { icon: '🔥', label: 'AKIRA ENCRYPTION DEPLOYED',        color: '#ff6900', bg: 'rgba(255,105,0,0.10)' },
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

  if (compact) compact.innerHTML = items.map((item) => `<div class="feed-item-sm">
      <div class="feed-name-sm">${escapeHtml(item.title)}</div>
      <div class="feed-tactic-sm">${escapeHtml(item.type)}</div>
    </div>`).join('');
}

function renderBriefing(scenario) {
  const prelude = scenario.prelude || {};
  const customerName = scenario.customer?.name || 'the customer';
  const industry = scenario.customer?.industry || 'general';
  const industryPoints = prelude.industryTalkingPoints?.[industry] || [];
  const points = prelude.expectedDetections || [];
  const presenterPoints = prelude.talkingPoints || [];
  const milestoneItems = prelude.milestones || [];
  const clickPath = prelude.clickPath || [
    'Open the high-priority alert and frame why it matters immediately.',
    'Move into the investigation/case view to show correlated context.',
    'Show detections and threat activity to prove the chain, then close on response actions.'
  ];

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
  proofPoints.innerHTML = [...points, ...presenterPoints, ...industryPoints].map((p) => `<div class="impact-item">${escapeHtml(p)}</div>`).join('');

  const milestoneGrid = document.getElementById('milestone-grid');
  milestoneGrid.innerHTML = milestoneItems.map((m) => {
    const meta = getMilestone(m.id) || { icon: '◆', label: m.label || 'Milestone', color: '#00A8E0' };
    return `<div class="milestone-card">
      <div class="milestone-top">
        <span class="milestone-icon">${escapeHtml(meta.icon)}</span>
        <span class="milestone-label" style="color:${meta.color}">${escapeHtml(m.label || meta.label)}</span>
      </div>
      <div class="milestone-tech">${escapeHtml(m.id || '')}</div>
    </div>`;
  }).join('');

  const mitrePills = document.getElementById('mitre-pills');
  mitrePills.innerHTML = (prelude.mitreTechniques || []).map((m) => `<div class="pill">${escapeHtml(m.id)} — ${escapeHtml(m.name)}</div>`).join('');

  document.getElementById('transition-headline').textContent = `Show ${customerName} what this looks like in Sophos Central`;
  document.getElementById('transition-copy').textContent = `You now move from the attack narrative into live operational proof for ${customerName}: the rendered alerts, case context, detections, threat storyline, and response path that appear directly inside the injected Sophos Central experience.`;
  document.getElementById('transition-line').textContent = prelude.transitionLine || 'Now let’s pivot into Sophos Central and show exactly how your team would see, investigate, and respond to this incident.';
  document.getElementById('expected-points').innerHTML = points.map((p) => `<div class="proof-item">${escapeHtml(p)}</div>`).join('');
  document.getElementById('click-path').innerHTML = clickPath.map((p) => `<div class="proof-item">${escapeHtml(p)}</div>`).join('');
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

// ─── Static UI Wiring (runs immediately, not inside async init) ──────
// These must be outside the async IIFE so chrome.runtime timing cannot
// prevent them from being registered.
(function wireUI() {
  function on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // Briefing slide nav
  on('briefing-next', () => navigate(1));
  on('briefing-prev', () => navigate(-1));

  // Phase navigator
  on('phase-btn-0', () => selectPhase(0));
  on('phase-btn-1', () => selectPhase(1));
  on('phase-btn-2', () => selectPhase(2));
  on('phase-play-btn', playCurrentPhase);

  // Scene CTA buttons
  on('scene0-next', () => selectPhase(1));
  on('scene1-prev', () => selectPhase(0));
  on('scene1-next', () => selectPhase(2));

  // Guide Mode toggle
  on('guide-mode-btn', () => {
    document.body.classList.toggle('guide-mode');
    const btn = document.getElementById('guide-mode-btn');
    if (btn) btn.classList.toggle('active');
  });

  // Toast dismiss (Day 1)
  on('w11-toast-d1-dismiss', () => {
    const t = document.getElementById('w11-toast-d1');
    if (t) t.classList.remove('w11-visible');
  });

  // Init phase navigator label
  const labelEl = document.getElementById('phase-play-label');
  if (labelEl) labelEl.textContent = '▶  Play Day 1';
})();
