// Global App State & Account Pool Auto-Switching Engine
let currentTab = 'overview';
let systemStats = {};
let channelsData = [];
let tokensData = [];
let mappingsData = [];
let logsData = [];
let accountsData = [];
let jwtToken = localStorage.getItem('nexus_admin_jwt') || '';

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  checkAuthAndInit();

  document.getElementById('btn-refresh')?.addEventListener('click', loadData);
});

function checkAuthAndInit() {
  if (jwtToken) {
    document.getElementById('login-modal').classList.remove('open');
    document.getElementById('admin-app-layout').style.display = 'flex';
    loadData();
    setInterval(loadData, 5000);
  } else {
    document.getElementById('login-modal').classList.add('open');
    document.getElementById('admin-app-layout').style.display = 'none';
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const password = document.getElementById('admin-password-input').value;
  const errDiv = document.getElementById('login-error');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.success && data.token) {
      jwtToken = data.token;
      localStorage.setItem('nexus_admin_jwt', jwtToken);
      errDiv.style.display = 'none';
      checkAuthAndInit();
    } else {
      errDiv.textContent = data.error || '비밀번호가 올바르지 않습니다.';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.textContent = '로그인 에러: ' + err.message;
    errDiv.style.display = 'block';
  }
}

function handleAdminLogout() {
  jwtToken = '';
  localStorage.removeItem('nexus_admin_jwt');
  checkAuthAndInit();
}

function fetchAdmin(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['authorization'] = `Bearer ${jwtToken}`;
  return fetch(url, options).then(res => {
    if (res.status === 401) {
      handleAdminLogout();
      throw new Error('인증 세션이 만료되었습니다. 다시 로그인해주세요.');
    }
    return res;
  });
}

// Setup Navigation Tabs
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (tab !== 'accounts') {
        switchTab(tab);
      }
    });
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${tabName}`);
  });

  const titles = {
    overview: { title: '대시보드 개요', sub: '실시간 게이트웨이 트래픽 및 시스템 상태를 모니터링합니다.' },
    channels: { title: '업스트림 채널 관리', sub: '상위 AI API 서버 및 키 풀을 구성합니다.' },
    tokens: { title: '클라이언트 API 토큰 발급', sub: '사용자 및 애플리케이션에 할당할 API Key를 관리합니다.' },
    mappings: { title: '모델 리매핑 설정', sub: '요청 모델명을 업스트림 호환 모델명으로 매핑합니다.' },
    logs: { title: '실시간 요청 로그', sub: '모든 게이트웨이 요청의 입출력 토큰 및 상태를 확인합니다.' }
  };

  if (titles[tabName]) {
    document.getElementById('page-title').textContent = titles[tabName].title;
    document.getElementById('page-subtitle').textContent = titles[tabName].sub;
  }
}

// Load All Data
async function loadData() {
  if (!jwtToken) return;

  try {
    const [statsRes, channelsRes, tokensRes, mappingsRes, logsRes, accountsRes] = await Promise.all([
      fetchAdmin('/api/admin/stats').then(r => r.json()),
      fetchAdmin('/api/admin/channels').then(r => r.json()),
      fetchAdmin('/api/admin/tokens').then(r => r.json()),
      fetchAdmin('/api/admin/mappings').then(r => r.json()),
      fetchAdmin('/api/admin/logs').then(r => r.json()),
      fetchAdmin('/api/admin/accounts').then(r => r.json())
    ]);

    systemStats = statsRes;
    channelsData = channelsRes;
    tokensData = tokensRes;
    mappingsData = mappingsRes;
    logsData = logsRes;
    accountsData = accountsRes;

    renderOverview();
    renderChannels();
    renderTokens();
    renderMappings();
    renderLogs();
    renderAdminAccountTable(accountsData);
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

// Render Overview
function renderOverview() {
  document.getElementById('stat-total-requests').textContent = systemStats.totalRequests || 0;
  document.getElementById('stat-total-tokens').textContent = (systemStats.totalTokens || 0).toLocaleString();
  
  const total = systemStats.totalRequests || 0;
  const success = systemStats.successRequests || 0;
  const rate = total > 0 ? Math.round((success / total) * 100) + '%' : '100%';
  document.getElementById('stat-success-rate').textContent = rate;
  document.getElementById('stat-active-tokens').textContent = systemStats.activeTokens || 0;

  document.getElementById('badge-channels').textContent = channelsData.filter(c => c.enabled).length;
  document.getElementById('badge-tokens').textContent = tokensData.filter(t => t.enabled).length;

  const tbody = document.getElementById('overview-logs-body');
  if (logsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">최근 요청 기록이 없습니다.</td></tr>`;
    return;
  }

  const recent = logsData.slice(0, 5);
  tbody.innerHTML = recent.map(log => `
    <tr>
      <td>${new Date(log.timestamp).toLocaleString()}</td>
      <td><code>${log.path}</code></td>
      <td><span class="badge-purple">${log.model || 'claude-sonnet-5'}</span></td>
      <td>${log.status >= 200 && log.status < 300 ? '<span class="badge-emerald">200 OK</span>' : `<span class="badge-rose">${log.status}</span>`}</td>
      <td>${(log.totalTokens || 0).toLocaleString()} tokens</td>
      <td>${log.durationMs || 0} ms</td>
    </tr>
  `).join('');
}

// Render Admin Account Overview Table
function renderAdminAccountTable(accounts) {
  const tbody = document.getElementById('admin-account-pool-table');
  if (!tbody || !Array.isArray(accounts)) return;

  tbody.innerHTML = accounts.map(acc => `
    <tr>
      <td>
        <strong>${acc.name}</strong>
        ${acc.isCurrent ? '<span class="badge-using" style="margin-left:6px;">사용 중</span>' : ''}
        ${acc.isPro ? '<span class="badge-pro" style="margin-left:4px;">Pro</span>' : ''}
      </td>
      <td>
        <span class="${acc.isCurrent ? 'badge-emerald' : 'badge-purple'}">
          ${acc.isCurrent ? '사용 중 (Active)' : '대기 중 (Standby)'}
        </span>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="progress-track" style="width:100px;">
            <div class="progress-fill-5h" style="width:${acc.fiveHourPercent}%;"></div>
          </div>
          <span style="font-weight:700;color:#e07038;font-size:0.85rem;">${acc.fiveHourPercent}%</span>
          <span style="font-size:0.75rem;color:var(--text-muted);">${acc.fiveHourResetTime}</span>
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="progress-track" style="width:100px;">
            <div class="progress-fill-weekly" style="width:${acc.weeklyPercent}%;"></div>
          </div>
          <span style="font-weight:700;color:#e07038;font-size:0.85rem;">${acc.weeklyPercent}%</span>
          <span style="font-size:0.75rem;color:var(--text-muted);">${acc.weeklyResetTime}</span>
        </div>
      </td>
    </tr>
  `).join('');
}

// Open Exact Account Management Modal in Admin Console (Matching Screenshot)
function openAccountModalAdmin() {
  const overlay = document.getElementById('admin-account-modal-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    renderAdminModalCards(accountsData);
  }
}

function closeAccountModalAdmin() {
  const overlay = document.getElementById('admin-account-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function renderAdminModalCards(accounts) {
  const container = document.getElementById('admin-modal-account-list');
  if (!container || !Array.isArray(accounts)) return;

  container.innerHTML = accounts.map(acc => {
    const isCurrent = acc.isCurrent === true;
    const maskedKey = acc.apiKey ? (acc.apiKey.substring(0, 8) + '****************') : 'sk-ant-api01-****************';

    return `
      <div class="acc-card ${isCurrent ? 'active' : ''}">
        <div class="acc-card-top">
          <span class="acc-name">${acc.name}</span>
          ${isCurrent ? '<span class="badge-using">사용 중</span>' : ''}
          ${acc.isPro !== false ? '<span class="badge-pro">Pro</span>' : ''}
        </div>
        <div class="acc-key-info">
          ${maskedKey} · ${acc.autoRefresh !== false ? '자동 갱신' : '수동'}
        </div>

        <div class="acc-quota-row">
          <span class="acc-quota-label">5시간</span>
          <div class="progress-track">
            <div class="progress-fill-5h" style="width:${acc.fiveHourPercent || 0}%;"></div>
          </div>
          <span class="acc-quota-percent">${acc.fiveHourPercent || 0}%</span>
          <span class="acc-quota-time">${acc.fiveHourResetTime || '2시간 45분'}</span>
        </div>

        <div class="acc-quota-row">
          <span class="acc-quota-label">주간</span>
          <div class="progress-track">
            <div class="progress-fill-weekly" style="width:${acc.weeklyPercent || 0}%;"></div>
          </div>
          <span class="acc-quota-percent">${acc.weeklyPercent || 0}%</span>
          <span class="acc-quota-time">${acc.weeklyResetTime || '9시간 35분'}</span>
        </div>

        <div class="acc-actions">
          ${!isCurrent ? `<button class="btn-acc-action" onclick="switchAccountAdmin('${acc.id}')">전환</button>` : ''}
          <button class="btn-acc-action" onclick="alert('한도 설정: 5시간 윈도우 100% 도달 시 자동 갈아타기가 구동됩니다.')">한도</button>
          <button class="btn-acc-action" onclick="editAccountNameAdmin('${acc.id}')">이름</button>
          <button class="btn-acc-action" style="color:#ef4444;" onclick="deleteAccountAdmin('${acc.id}')">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

async function switchAccountAdmin(id) {
  try {
    const res = await fetchAdmin(`/api/admin/accounts/switch/${id}`, { method: 'POST' });
    if (res.ok) {
      loadData();
      closeAccountModalAdmin();
    }
  } catch (e) {
    alert('계정 전환 실패: ' + e.message);
  }
}

async function addNewAccountAdmin() {
  const name = prompt('새 Pro 계정 식별 이메일/이름을 입력하세요 (예: user2@gmail.com):');
  if (!name) return;
  const apiKey = prompt('API Key를 입력하세요 (예: sk-ant-api01-... 또는 sk-...):');
  if (!apiKey) return;

  try {
    const res = await fetchAdmin('/api/admin/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, apiKey, isPro: true })
    });
    if (res.ok) {
      alert('🔑 새 Pro 계정이 성공적으로 등록되었습니다!');
      loadData();
    }
  } catch (e) {
    alert('계정 추가 실패: ' + e.message);
  }
}

async function deleteAccountAdmin(id) {
  if (!confirm('이 계정을 삭제하시겠습니까?')) return;
  try {
    await fetchAdmin(`/api/admin/accounts/${id}`, { method: 'DELETE' });
    loadData();
  } catch (e) {
    alert('계정 삭제 실패: ' + e.message);
  }
}

function editAccountNameAdmin(id) {
  const newName = prompt('새 계정 이름을 입력하세요:');
  if (!newName) return;
  const acc = accountsData.find(a => a.id === id);
  if (acc) {
    acc.name = newName;
    renderAdminModalCards(accountsData);
  }
}

// Render Channels Table
function renderChannels() {
  const tbody = document.getElementById('channels-table-body');
  if (channelsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">등록된 업스트림 채널이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = channelsData.map(ch => {
    const modelsList = ch.models || ['*'];
    const modelPillsHtml = `<div class="model-pills">${modelsList.map(m => `<span class="model-pill">${m}</span>`).join('')}</div>`;
    const maskedKey = ch.apiKey ? `${ch.apiKey.substr(0, 6)}...${ch.apiKey.substr(-4)}` : 'sk-...';
    const channelNameDisplay = ch.name.includes('SeekAI') ? 'Mikoran Core Relay' : ch.name;

    return `
      <tr>
        <td>
          <div style="display:inline-flex;align-items:center;gap:6px;font-weight:700;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            <span>${channelNameDisplay}</span>
          </div>
        </td>
        <td><span class="badge-purple">${ch.type}</span></td>
        <td><code>${ch.baseUrl}</code></td>
        <td><code>${maskedKey}</code></td>
        <td class="cell-wrap">${modelPillsHtml}</td>
        <td><span class="text-muted" style="font-weight:600;">${ch.successCount || 0} S / ${ch.errorCount || 0} E</span></td>
        <td>${ch.enabled ? '<span class="badge-emerald">활성화</span>' : '<span class="badge-rose">비활성화</span>'}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-secondary btn-sm" onclick="toggleChannel('${ch.id}', ${!ch.enabled})">
              ${ch.enabled ? '비활성화' : '활성화'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteChannel('${ch.id}')">삭제</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Tokens Table
function renderTokens() {
  const tbody = document.getElementById('tokens-table-body');
  if (tokensData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">발급된 API 토큰이 없습니다.</td></tr>`;
    return;
  }

  const sortedTokens = [...tokensData].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  const currentGatewayUrl = window.location.origin;

  tbody.innerHTML = sortedTokens.map(tok => {
    const psCmd = `[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', '${currentGatewayUrl}', 'User')\n[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', '${tok.key}', 'User')`;

    return `
      <tr>
        <td><strong>${tok.name}</strong></td>
        <td>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div>
              <code>${tok.key}</code>
              <button class="btn-copy" onclick="copyText('${tok.key}')">키 복사</button>
              <button class="btn-copy" onclick="copyText('${currentGatewayUrl}')">URL 복사</button>
            </div>
          </div>
        </td>
        <td>
          ${tok.quota === -1 
            ? `<span class="badge-emerald">무제한 (${(tok.usedQuota || 0).toLocaleString()} tokens)</span>` 
            : `${(tok.usedQuota || 0).toLocaleString()} / ${tok.quota.toLocaleString()} tokens`}
        </td>
        <td>${tok.createdAt ? new Date(tok.createdAt).toLocaleString() : '-'}</td>
        <td>${tok.enabled ? '<span class="badge-emerald">정상</span>' : '<span class="badge-rose">차단됨</span>'}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-secondary btn-sm" onclick="copyText(\`${psCmd}\`)" title="Claude Code 연동 명령어 복사">1클릭 설정코드</button>
            <button class="btn btn-danger btn-sm" onclick="deleteToken('${tok.id}')">삭제</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Model Mappings Form
function renderMappings() {
  const container = document.getElementById('mappings-container');
  if (mappingsData.length === 0) {
    mappingsData = [{ from: 'claude-3-7-sonnet', to: 'claude-sonnet-5' }];
  }

  container.innerHTML = mappingsData.map((m, idx) => `
    <div class="mapping-row" id="mapping-row-${idx}">
      <input type="text" value="${m.from}" placeholder="클라이언트 요청 모델 (예: claude-3-7-sonnet)" class="map-from">
      <span style="color:var(--accent-purple);font-weight:bold;">➔</span>
      <input type="text" value="${m.to}" placeholder="업스트림 매핑 모델 (예: claude-sonnet-5)" class="map-to">
      <button type="button" class="btn btn-danger btn-sm" onclick="removeMappingRow(${idx})">삭제</button>
    </div>
  `).join('');
}

function addMappingRow() {
  mappingsData.push({ from: '', to: '' });
  renderMappings();
}

function removeMappingRow(idx) {
  mappingsData.splice(idx, 1);
  renderMappings();
}

async function saveMappings(e) {
  e.preventDefault();
  const rows = document.querySelectorAll('.mapping-row');
  const newMappings = [];
  rows.forEach(row => {
    const from = row.querySelector('.map-from').value.trim();
    const to = row.querySelector('.map-to').value.trim();
    if (from && to) {
      newMappings.push({ from, to });
    }
  });

  const res = await fetchAdmin('/api/admin/mappings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mappings: newMappings })
  });

  if (res.ok) {
    alert('모델 매핑 설정이 저장되었습니다.');
    loadData();
  }
}

// Render Logs
function renderLogs() {
  const tbody = document.getElementById('full-logs-table-body');
  if (logsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">기록된 요청 로그가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = logsData.map(log => {
    let channelName = log.channelName || 'Mikoran Core Relay';
    if (channelName.includes('SeekAI')) {
      channelName = 'Mikoran Core Relay';
    }

    const channelBadgeHtml = `
      <span class="badge-cyan" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;font-size:0.75rem;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
        <span>${channelName}</span>
      </span>
    `;

    return `
      <tr>
        <td>${new Date(log.timestamp).toLocaleString()}</td>
        <td><code>${log.method} ${log.path}</code></td>
        <td>
          <span class="badge-purple">${log.model || 'default'}</span>
          ${log.mappedModel ? `<span style="color:var(--text-muted);">➔</span> <span class="badge-emerald">${log.mappedModel}</span>` : ''}
        </td>
        <td>${channelBadgeHtml}</td>
        <td>${log.status >= 200 && log.status < 300 ? '<span class="badge-emerald">200 OK</span>' : `<span class="badge-rose">${log.status}</span>`}</td>
        <td>${log.inputTokens || 0} / ${log.outputTokens || 0} (${log.totalTokens || 0})</td>
        <td>${log.durationMs || 0} ms</td>
      </tr>
    `;
  }).join('');
}

// Modals Handler
function openChannelModal() {
  document.getElementById('channel-id').value = '';
  document.getElementById('channel-name').value = '';
  document.getElementById('channel-base-url').value = '';
  document.getElementById('channel-api-key').value = '';
  document.getElementById('channel-models').value = 'claude-sonnet-5, claude-opus-5, *';
  document.getElementById('modal-channel').classList.add('open');
}

function openTokenModal() {
  document.getElementById('token-name').value = '';
  document.getElementById('token-key').value = '';
  document.getElementById('token-quota-type').value = '-1';
  toggleQuotaInput();
  document.getElementById('modal-token').classList.add('open');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
}

function toggleQuotaInput() {
  const val = document.getElementById('token-quota-type').value;
  document.getElementById('quota-input-group').style.display = val === 'custom' ? 'block' : 'none';
}

async function handleChannelSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('channel-name').value;
  const type = document.getElementById('channel-type').value;
  const baseUrl = document.getElementById('channel-base-url').value;
  const apiKey = document.getElementById('channel-api-key').value;
  const models = document.getElementById('channel-models').value;

  const res = await fetchAdmin('/api/admin/channels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, type, baseUrl, apiKey, models })
  });

  if (res.ok) {
    closeModal('modal-channel');
    loadData();
  }
}

async function toggleChannel(id, enabled) {
  await fetchAdmin(`/api/admin/channels/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  loadData();
}

async function deleteChannel(id) {
  if (confirm('해당 채널을 삭제하시겠습니까?')) {
    await fetchAdmin(`/api/admin/channels/${id}`, { method: 'DELETE' });
    loadData();
  }
}

async function handleTokenSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('token-name').value;
  const key = document.getElementById('token-key').value;
  const quotaType = document.getElementById('token-quota-type').value;
  const customQuota = document.getElementById('token-quota').value;
  const quota = quotaType === '-1' ? -1 : Number(customQuota || 1000000);

  const res = await fetchAdmin('/api/admin/tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, key, quota })
  });

  if (res.ok) {
    closeModal('modal-token');
    loadData();
  }
}

async function deleteToken(id) {
  if (confirm('해당 API 토큰을 삭제하시겠습니까?')) {
    await fetchAdmin(`/api/admin/tokens/${id}`, { method: 'DELETE' });
    loadData();
  }
}

function copyCode(id) {
  const code = document.getElementById(id).innerText;
  navigator.clipboard.writeText(code);
  alert('코드가 클립보드에 복사되었습니다.');
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  alert('클립보드에 복사되었습니다: ' + text);
}
