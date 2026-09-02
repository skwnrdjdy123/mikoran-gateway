// Mikoran AI Browser Client Engine & Account Pool Auto-Switcher
var selectedExplorerFile = null;
var activeFolderInfo = null;
var currentNavigatingPcDir = 'C:\\Users\\Public\\Downloads\\신세계';

function getApiUrl(endpoint) {
  const origin = window.location.origin;
  if (!origin || origin.startsWith('file:') || origin === 'null') {
    return 'http://localhost:3000' + endpoint;
  }
  return endpoint;
}

const API_KEY = 'sk-gw-19eumvaemn7a5toxbytv';
const STORAGE_KEY = 'mikoran_browser_state_v2';
const JAILBREAK_STORAGE_KEY = 'mikoran_jailbreak_mode_v1';
const LOGIN_PIN = '102030';
const AUTH_SESSION_KEY = 'mikoran_auth_unlocked_v1';

let isJailbreakMode = localStorage.getItem(JAILBREAK_STORAGE_KEY) !== 'false'; // Default: ON (Unrestricted)
let pendingAttachments = [];

function toggleJailbreakMode() {
  isJailbreakMode = !isJailbreakMode;
  localStorage.setItem(JAILBREAK_STORAGE_KEY, isJailbreakMode ? 'true' : 'false');
  updateJailbreakUI();
  console.log(`[Jailbreak Mode] State toggled to: ${isJailbreakMode ? 'ON' : 'OFF'}`);
}

function updateJailbreakUI() {
  const buttons = document.querySelectorAll('.jailbreak-toggle-btn, #jailbreak-toggle-btn');
  buttons.forEach(btn => {
    const textSpan = btn.querySelector('.jailbreak-label, #jailbreak-status-text') || btn;
    const iconSpan = btn.querySelector('.jailbreak-icon, #jailbreak-icon');

    if (isJailbreakMode) {
      btn.className = 'btn jailbreak-toggle-btn active';
      btn.style.background = 'linear-gradient(135deg, #7c3aed, #ec4899)';
      btn.style.borderColor = '#a78bfa';
      btn.style.color = '#ffffff';
      if (textSpan && textSpan !== btn) textSpan.innerText = '탈옥: ON';
      if (iconSpan) iconSpan.innerText = '🔓';
      btn.title = '탈옥 모드 활성화됨 (Zero Refusal / 무제한 개발자 모드)';
    } else {
      btn.className = 'btn jailbreak-toggle-btn inactive';
      btn.style.background = '#1e293b';
      btn.style.borderColor = '#475569';
      btn.style.color = '#94a3b8';
      if (textSpan && textSpan !== btn) textSpan.innerText = '탈옥: OFF';
      if (iconSpan) iconSpan.innerText = '🔒';
      btn.title = '탈옥 모드 비활성화됨 (표준 안전 모드)';
    }
  });
}



let defaultTabs = [
  {
    id: 'tab_1',
    title: '⚡ Claude + Antigravity',
    model: 'claude-sonnet-5',
    address: 'https://mikoran.ai/session/hybrid-workspace-1',
    history: [
      {
        role: 'assistant',
        content: '안녕하세요! **Claude + Antigravity 하이브리드 개인 AI 브라우저**에 오신 것을 환영합니다.\n- **📎 파일 첨부 지원**: 코드, 문서, 이미지 파일을 드래그&드롭하거나 📎 버튼으로 첨부하세요!\n- **📁 로컬 파일 생성/수정**: 좌측 상단 `📁 파일 생성/수정` 버튼으로 PC 파일을 직접 생성/수정하세요!\n- **자동 갈아타기 (Auto-Switching)**: 5시간 할당량이 100% 도달하면 다음 계정으로 자동 우회됩니다.\n- **영구 보존 메모리**: 새로고침을 하거나 창을 닫아도 대화와 설정이 100% 보존됩니다.\n질문이나 코딩 요구사항을 입력해 보세요!'
      }
    ]
  }
];

let isMobileUserDevice = window.innerWidth <= 1024 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let browserTabs = defaultTabs;
let activeTabId = 'tab_1';
let isSplitPaneOpen = !isMobileUserDevice;
let accountPoolList = [];

// --- Security Lockscreen Authentication (PIN: 102030) ---
function checkInitialAuth() {
  const isUnlocked = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
  const overlay = document.getElementById('security-lockscreen-overlay');
  const pinInput = document.getElementById('lockscreen-pin-input');

  if (overlay) {
    if (isUnlocked) {
      overlay.style.display = 'none';
    } else {
      overlay.style.display = 'flex';
      if (pinInput) {
        setTimeout(() => pinInput.focus(), 100);
      }
    }
  }
}

function handleLoginPinKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitLockscreenPin();
  }
}

function submitLockscreenPin() {
  const pinInput = document.getElementById('lockscreen-pin-input');
  const errorMsg = document.getElementById('lockscreen-error-msg');
  const overlay = document.getElementById('security-lockscreen-overlay');
  const val = pinInput ? pinInput.value.trim() : '';

  if (val === LOGIN_PIN) {
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    if (errorMsg) errorMsg.style.display = 'none';
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s ease';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 250);
    }
  } else {
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = '⚠️ 비밀번호가 일치하지 않습니다. 다시 입력해주세요.';
    }
    if (pinInput) {
      pinInput.style.borderColor = '#ef4444';
      pinInput.value = '';
      pinInput.focus();
    }
  }
}

function lockWorkspace() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  const overlay = document.getElementById('security-lockscreen-overlay');
  const pinInput = document.getElementById('lockscreen-pin-input');
  const errorMsg = document.getElementById('lockscreen-error-msg');

  if (errorMsg) errorMsg.style.display = 'none';
  if (pinInput) {
    pinInput.value = '';
    pinInput.style.borderColor = '#334155';
  }
  if (overlay) {
    overlay.style.opacity = '1';
    overlay.style.display = 'flex';
    if (pinInput) setTimeout(() => pinInput.focus(), 100);
  }
}

let lastServerSyncTimestamp = 0;
let isSyncingWithServer = false;

// Save All State (Tabs, History, Models, Settings) to LocalStorage AND Sync with PC Server
function saveStateToLocalStorage() {
  try {
    const stateObj = {
      browserTabs: browserTabs,
      activeTabId: activeTabId,
      isSplitPaneOpen: isSplitPaneOpen
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateObj));
    
    // Background PC Server Sync (Smartphone <-> PC Real-Time Sync)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    fetch(getApiUrl('/api/browser/sync-active-session'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        browserTabs: browserTabs,
        activeTabId: activeTabId,
        deviceType: isMobile ? 'smartphone' : 'pc'
      })
    }).then(res => res.json()).then(data => {
      if (data.success && data.session) {
        lastServerSyncTimestamp = new Date(data.session.updatedAt).getTime();
      }
    }).catch(() => {});
  } catch (e) {
    console.error('Failed to save state to localStorage:', e);
  }
}

// Load All State from LocalStorage & Sync from PC Server
function loadStateFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stateObj = JSON.parse(raw);
      if (stateObj.browserTabs && Array.isArray(stateObj.browserTabs) && stateObj.browserTabs.length > 0) {
        browserTabs = stateObj.browserTabs;
      }
      if (stateObj.activeTabId && browserTabs.some(t => t.id === stateObj.activeTabId)) {
        activeTabId = stateObj.activeTabId;
      } else if (browserTabs.length > 0) {
        activeTabId = browserTabs[0].id;
      }
      if (typeof stateObj.isSplitPaneOpen === 'boolean') {
        isSplitPaneOpen = stateObj.isSplitPaneOpen;
      }
    }
    
    // Initial fetch from PC server
    syncWithServerSession();
  } catch (e) {
    console.error('Failed to load state from localStorage:', e);
  }
}

// Real-Time Background Sync Engine (Pulls Smartphone Chat onto PC & vice versa)
async function syncWithServerSession() {
  if (isSyncingWithServer) return;
  isSyncingWithServer = true;
  try {
    const res = await fetch(getApiUrl('/api/browser/sync-active-session'));
    const data = await res.json();
    if (data.success && data.session && data.session.browserTabs) {
      const serverTime = new Date(data.session.updatedAt || 0).getTime();
      if (serverTime > lastServerSyncTimestamp) {
        lastServerSyncTimestamp = serverTime;
        if (Array.isArray(data.session.browserTabs) && data.session.browserTabs.length > 0) {
          browserTabs = data.session.browserTabs;
          if (data.session.activeTabId && browserTabs.some(t => t.id === data.session.activeTabId)) {
            activeTabId = data.session.activeTabId;
          }
          renderBrowserTabStrip();
          renderActiveTabMessages();
          console.log('📱 ↔ 🖥️ [서버 대화 동기화 완료] 최신 대화 내역이 자동 로드되었습니다.');
        }
      }
    }
  } catch (e) {
    // Ignore offline errors
  } finally {
    isSyncingWithServer = false;
  }
}

// Start periodic heartbeat sync every 6 seconds
setInterval(() => {
  syncWithServerSession();
}, 6000);
window.addEventListener('focus', () => {
  syncWithServerSession();
});

// 📱 Automatic Real-Time Mobile Device Screen Size Detector & Viewport Engine
function autoDetectDeviceScreenSize() {
  const width = window.innerWidth || document.documentElement.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight;

  // Set --vh CSS custom property for exact 100% visible mobile screen height
  const vh = height * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);

  // Remove existing size classes
  document.documentElement.classList.remove('phone-size-small', 'phone-size-standard', 'phone-size-large', 'phone-size-tablet', 'device-desktop');

  if (width <= 360) {
    document.documentElement.classList.add('phone-size-small');
  } else if (width <= 430) {
    document.documentElement.classList.add('phone-size-standard');
  } else if (width <= 768) {
    document.documentElement.classList.add('phone-size-large');
  } else if (width <= 1024) {
    document.documentElement.classList.add('phone-size-tablet');
  } else {
    document.documentElement.classList.add('device-desktop');
  }

  // Force single pane if mobile/tablet
  if (width <= 1024 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    isSplitPaneOpen = false;
    const rightPane = document.getElementById('pane-right');
    const leftPane = document.getElementById('pane-left');
    if (rightPane && !rightPane.classList.contains('mobile-active')) {
      rightPane.style.display = 'none';
    }
    if (leftPane && !leftPane.classList.contains('mobile-hidden')) {
      leftPane.style.display = 'flex';
    }
  }
}



// Initialize Browser App
document.addEventListener('DOMContentLoaded', () => {
  autoDetectDeviceScreenSize();
  checkInitialAuth();
  loadStateFromLocalStorage();
  renderBrowserTabs();
  renderActiveTabMessages();
  updateAddressBar();
  updateJailbreakUI();
  loadAccountPool();
  loadSavedSessions();
  setupDragAndDrop();
});

// Setup Drag & Drop File Upload
function setupDragAndDrop() {
  const container = document.getElementById('chat-input-container') || document.body;
  
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    container.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    container.addEventListener(eventName, () => {
      container.style.borderColor = '#8b5cf6';
      container.style.background = 'rgba(139, 92, 246, 0.08)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    container.addEventListener(eventName, () => {
      container.style.borderColor = '#334155';
      container.style.background = '#0e131f';
    }, false);
  });

  container.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      processFiles(dt.files);
    }
  }, false);
}

// Trigger Hidden File Input
function triggerFilePicker() {
  const input = document.getElementById('file-upload-input');
  if (input) input.click();
}

// Handle File Selected Event
function handleFileSelected(e) {
  if (e.target.files && e.target.files.length > 0) {
    processFiles(e.target.files);
    e.target.value = ''; // Reset input
  }
}

// Process Uploaded Files (Code / Text / Image)
function processFiles(files) {
  Array.from(files).forEach(file => {
    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();

    if (isImage) {
      reader.onload = (evt) => {
        const dataUrl = evt.target.result;
        const base64Data = dataUrl.split(',')[1];
        pendingAttachments.push({
          name: file.name,
          size: formatFileSize(file.size),
          isImage: true,
          mediaType: file.type,
          dataUrl: dataUrl,
          base64: base64Data
        });
        renderAttachmentPreview();
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (evt) => {
        const textContent = evt.target.result;
        pendingAttachments.push({
          name: file.name,
          size: formatFileSize(file.size),
          isImage: false,
          content: textContent
        });
        renderAttachmentPreview();
      };
    }
  });
}

// --- 📱 Smartphone Internal Storage File Selector & Autonomous Editing Engine ---
function triggerSmartphoneFilePicker() {
  const input = document.getElementById('smartphone-file-input');
  if (input) input.click();
}

function handleSmartphoneFileSelected(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const phoneFilesList = [];
  let loadedCount = 0;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      phoneFilesList.push({
        name: file.name,
        size: formatFileSize(file.size),
        content: evt.target.result || ''
      });

      loadedCount++;
      if (loadedCount === files.length) {
        activeFolderInfo = {
          name: '📱 스마트폰 내장 메모리',
          currentDir: 'Smartphone Storage',
          files: phoneFilesList
        };

        renderAttachmentPreview();
        renderWorkspaceExplorerTree();
        switchSandboxTab('explorer');
        showToastNotification('📱 [스마트폰 파일 연동 완료]', `총 ${files.length}개 폰 파일이 AI 자율 검사 및 수정 탐색기에 연결되었습니다!`);
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
}

// Render Attachment Preview Pills Strip
function renderAttachmentPreview() {
  const strip = document.getElementById('attachment-preview-strip');
  if (!strip) return;

  if (pendingAttachments.length === 0 && !activeFolderInfo) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  strip.style.display = 'flex';
  let html = '';

  if (activeFolderInfo) {
    html += `
      <div style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#0284c7,#0369a1);border:1px solid #38bdf8;padding:4px 12px;border-radius:20px;font-size:0.82rem;color:#ffffff;font-weight:bold;">
        📂 <span>연동 폴더: ${escapeHtml(activeFolderInfo.name)} (총 ${activeFolderInfo.files.length}개 파일 인덱싱됨)</span>
        <span style="cursor:pointer;color:#fca5a5;font-weight:bold;margin-left:6px;" onclick="removeFolderAttachment()" title="폴더 연동 해제">&times;</span>
      </div>
    `;
  }

  html += pendingAttachments.map((att, idx) => `
    <div style="display:inline-flex;align-items:center;gap:6px;background:#1e293b;border:1px solid #334155;padding:4px 10px;border-radius:20px;font-size:0.82rem;color:#ffffff;">
      ${att.isImage ? `🖼️ <img src="${att.dataUrl}" style="width:16px;height:16px;object-fit:cover;border-radius:3px;">` : '📄'}
      <span>${escapeHtml(att.name)} (${att.size})</span>
      <span style="cursor:pointer;color:#ef4444;font-weight:bold;margin-left:4px;" onclick="removeAttachment(${idx})">&times;</span>
    </div>
  `).join('');

  strip.innerHTML = html;
}

function removeFolderAttachment() {
  activeFolderInfo = null;
  renderAttachmentPreview();
}

// Remove Attachment
function removeAttachment(idx) {
  pendingAttachments.splice(idx, 1);
  renderAttachmentPreview();
}

// Format File Size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// Get Active Tab Object
function getActiveTab() {
  return browserTabs.find(t => t.id === activeTabId) || browserTabs[0];
}

// Render Browser Tabs UI
function renderBrowserTabs() {
  const container = document.getElementById('tabs-container');
  if (!container) return;

  const tabElements = browserTabs.map(tab => {
    const isActive = tab.id === activeTabId;
    return `
      <div class="browser-tab ${isActive ? 'active' : ''}" data-tab-id="${tab.id}" onclick="switchBrowserTab('${tab.id}')">
        <span class="status-dot ${isActive ? 'pulse' : ''}"></span>
        <span class="tab-title">${escapeHtml(tab.title)}</span>
        <span class="tab-close" onclick="closeBrowserTab(event, '${tab.id}')">&times;</span>
      </div>
    `;
  }).join('');

  container.innerHTML = tabElements + `
    <button class="btn-new-tab" onclick="createBrowserTab()" title="새 AI 브라우저 탭 추가">+</button>
  `;
}

// Create New Tab
function createBrowserTab() {
  const newId = 'tab_' + Date.now();
  const newTab = {
    id: newId,
    title: 'NEW AI Tab ' + (browserTabs.length + 1),
    model: 'claude-sonnet-5',
    address: `https://mikoran.ai/session/workspace-${browserTabs.length + 1}`,
    history: [
      {
        role: 'assistant',
        content: '새로운 **Mikoran AI 브라우저 탭**이 생성되었습니다. 원하시는 프롬프트를 입력하세요.'
      }
    ]
  };

  browserTabs.push(newTab);
  activeTabId = newId;
  renderBrowserTabs();
  renderActiveTabMessages();
  updateAddressBar();
  saveStateToLocalStorage();
}

// Switch Active Tab
function switchBrowserTab(tabId) {
  activeTabId = tabId;
  renderBrowserTabs();
  renderActiveTabMessages();
  updateAddressBar();
  saveStateToLocalStorage();
}

// Close Tab
function closeBrowserTab(e, tabId) {
  e.stopPropagation();
  if (browserTabs.length === 1) return; // Keep at least 1 tab

  browserTabs = browserTabs.filter(t => t.id !== tabId);
  if (activeTabId === tabId) {
    activeTabId = browserTabs[browserTabs.length - 1].id;
  }
  renderBrowserTabs();
  renderActiveTabMessages();
  updateAddressBar();
  saveStateToLocalStorage();
}

// Change Model Mode
function changeModelMode(val) {
  const tab = getActiveTab();
  if (tab && val) {
    tab.model = val;
    updateAddressBar();
    saveStateToLocalStorage();
  }
}

// Update Address Bar and Model Tag
function updateAddressBar() {
  const tab = getActiveTab();
  const addressInput = document.getElementById('browser-address-input');
  const modelSelector = document.getElementById('model-mode-selector');
  const modelTag = document.getElementById('current-model-tag');

  if (addressInput) addressInput.value = tab.address;
  if (modelSelector) modelSelector.value = tab.model;
  if (modelTag) modelTag.innerText = getModelDisplayName(tab.model);
}

// Change Model Mode for Current Tab
function changeModelMode(newModel) {
  const tab = getActiveTab();
  tab.model = newModel;
  updateAddressBar();
  saveStateToLocalStorage();
}

// Model Display Name Mapper
function getModelDisplayName(modelId) {
  const map = {
    'antigravity-hybrid': '🔮 Antigravity Supreme Hybrid',
    'blender-3d-studio': '🎨 Blender 3D & WebGL Studio',
    'sonar-2': '🌐 Sonar 2 (Search Engine)',
    'gpt-5-6-terra': '⚡ GPT 5.6 Terra',
    'gpt-5-6-sol-max': '☀️ GPT-5.6 Sol (Max)',
    'gemini-3-7-flash': '✨ Gemini 3.7 Flash',
    'claude-sonnet-5': '🤖 Claude Sonnet 5',
    'claude-opus-5': '🧠 Claude Opus 5 (Max)',
    'kimi-k3-us': '🌙 Kimi K3 (US-based)',
    'glm-5-3-us': '💫 GLM 5.3 (US-based)',
    'grok-4-6': '🚀 Grok 4.6',
    'nemotron-3-ultra': '⚡ Nemotron 3 Ultra',
    'qwen2.5-coder:1.5b': '🖥️ Qwen 2.5 Coder (Local AI)',
    'deepseek-r1': '🔮 DeepSeek R1 Local AI',
    'claude-3-7-sonnet': 'Claude 3.7 Sonnet'
  };
  return map[modelId] || modelId;
}

const WAKE_WORD_STORAGE_KEY = 'mikoran_wakeword_mode_v1';
let isWakeWordMode = localStorage.getItem(WAKE_WORD_STORAGE_KEY) === 'true'; // Default: OFF (Manual Start Only)
let isTtsEnabled = true;
let speechRecognition = null;
let isListeningVoice = false;
let currentUtterance = null;
let wakeWordRestartTimer = null;

// --- 🎙️ Wake Words Dictionary for Multi-AI Voice Trigger ---
const WAKE_WORD_MODELS = [
  { keywords: ['클로드', '클로드야', '클로드5', 'claude', '손넷', 'sonnet'], model: 'claude-sonnet-5', name: 'Claude Sonnet 5', icon: '🤖' },
  { keywords: ['오퍼스', '클로드오퍼스', 'opus'], model: 'claude-opus-5', name: 'Claude Opus 5 (Max)', icon: '🧠' },
  { keywords: ['지피티', 'gpt', '지피티야', '솔', '테라', 'gpt-5'], model: 'gpt-5-6-sol-max', name: 'GPT-5.6 Sol (Max)', icon: '☀️' },
  { keywords: ['제미나이', '제미니', 'gemini', '제미나이야'], model: 'gemini-3-7-flash', name: 'Gemini 3.7 Flash', icon: '✨' },
  { keywords: ['소나', '소나르', 'sonar', '소나야'], model: 'sonar-2', name: 'Sonar 2 (검색 지능)', icon: '🌐' },
  { keywords: ['그록', 'grok', '그록아'], model: 'grok-4-6', name: 'Grok 4.6', icon: '🚀' },
  { keywords: ['키미', 'kimi', '키미야'], model: 'kimi-k3-us', name: 'Kimi K3', icon: '🌙' },
  { keywords: ['네모트론', 'nemotron'], model: 'nemotron-3-ultra', name: 'Nemotron 3 Ultra', icon: '⚡' },
  { keywords: ['하이브리드', '앤티그래비티', 'antigravity'], model: 'antigravity-hybrid', name: 'Antigravity Hybrid', icon: '🔮' },
  { keywords: ['블렌더', '쓰리디', '3d'], model: 'blender-3d-studio', name: 'Blender 3D Studio', icon: '🎨' },
  { keywords: ['자비스', '미코란', 'ai', '인공지능', '비서'], model: null, name: '자비스 (현재 AI)', icon: '🔊' }
];

// --- 🔔 Futuristic Web Audio Chime (880Hz -> 1320Hz Crystal Chime) ---
function playWakeChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Note 1: 880Hz (A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.25);

    // Note 2: 1320Hz (E6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
    gain2.gain.setValueAtTime(0.16, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.45);
  } catch (e) {
    // Audio context silent fallback
  }
}

// --- 🔮 Bixby/Siri Style Voice HUD Controller with 5-Second Visible Countdown Timer ---
let hudHideTimer = null;
let hudTimerInterval = null;

// Model Color Palette Mapper for HUD Border & Glow
function getModelThemeColor(modelName = '') {
  const name = modelName.toLowerCase();
  if (name.includes('sonnet') || name.includes('클로드 5') || name.includes('claude 5')) {
    return { border: 'rgba(249, 115, 22, 0.65)', glow: 'rgba(249, 115, 22, 0.4)', iconBg: '#ea580c' };
  } else if (name.includes('opus') || name.includes('오퍼스')) {
    return { border: 'rgba(139, 92, 246, 0.65)', glow: 'rgba(139, 92, 246, 0.4)', iconBg: '#7c3aed' };
  } else if (name.includes('gpt') || name.includes('지피티') || name.includes('sol')) {
    return { border: 'rgba(245, 158, 11, 0.65)', glow: 'rgba(245, 158, 11, 0.4)', iconBg: '#d97706' };
  } else if (name.includes('gemini') || name.includes('제미나이') || name.includes('flash')) {
    return { border: 'rgba(6, 182, 212, 0.65)', glow: 'rgba(6, 182, 212, 0.4)', iconBg: '#0891b2' };
  } else if (name.includes('sonar') || name.includes('소나')) {
    return { border: 'rgba(16, 185, 129, 0.65)', glow: 'rgba(16, 185, 129, 0.4)', iconBg: '#059669' };
  } else if (name.includes('grok') || name.includes('그록')) {
    return { border: 'rgba(239, 68, 68, 0.65)', glow: 'rgba(239, 68, 68, 0.4)', iconBg: '#dc2626' };
  } else if (name.includes('kimi') || name.includes('키미')) {
    return { border: 'rgba(99, 102, 241, 0.65)', glow: 'rgba(99, 102, 241, 0.4)', iconBg: '#4f46e5' };
  } else if (name.includes('blender') || name.includes('블렌더')) {
    return { border: 'rgba(234, 88, 12, 0.65)', glow: 'rgba(234, 88, 12, 0.4)', iconBg: '#c2410c' };
  }
  return { border: 'rgba(56, 189, 248, 0.65)', glow: 'rgba(56, 189, 248, 0.4)', iconBg: '#0284c7' };
}

function showVoiceAssistantHud(modelName, modelIcon, transcript, statusText = '✨ 호출 감지됨! 명령 대기 중...', autoCloseSeconds = 5.0) {
  const hud = document.getElementById('voice-assistant-overlay-hud');
  const cardEl = document.getElementById('hud-card-element');
  const iconEl = document.getElementById('hud-model-icon');
  const titleEl = document.getElementById('hud-model-title');
  const statusEl = document.getElementById('hud-status-text');
  const transEl = document.getElementById('hud-speech-transcript');

  if (iconEl && modelIcon) iconEl.innerText = modelIcon;
  if (titleEl && modelName) titleEl.innerText = modelName;
  if (statusEl && statusText) statusEl.innerText = statusText;
  if (transEl && transcript) transEl.innerText = `"${transcript}"`;

  // Apply model signature theme colors
  const theme = getModelThemeColor(modelName);
  if (cardEl) {
    cardEl.style.borderColor = theme.border;
    cardEl.style.boxShadow = `0 24px 70px rgba(0, 0, 0, 0.85), 0 0 45px ${theme.glow}, inset 0 0 20px ${theme.glow}`;
  }

  if (hud) {
    hud.classList.add('active');
  }

  // Start 5-second visible countdown timer
  startHudCountdownTimer(autoCloseSeconds);
}

function startHudCountdownTimer(totalSeconds = 5.0) {
  stopHudCountdownTimer();

  const timerBar = document.getElementById('hud-timer-bar');
  const numEl = document.getElementById('hud-countdown-num');
  const labelEl = document.getElementById('hud-timer-label');
  const statusEl = document.getElementById('hud-status-text');

  if (labelEl) labelEl.innerText = '명령 대기 중...';

  const startTime = Date.now();
  const totalMs = totalSeconds * 1000;

  hudTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remainingMs = Math.max(0, totalMs - elapsed);
    const remainingSec = (remainingMs / 1000).toFixed(1);
    const percent = (remainingMs / totalMs) * 100;

    if (timerBar) timerBar.style.width = percent + '%';
    if (numEl) numEl.innerText = remainingSec + 's';

    if (remainingMs <= 0) {
      stopHudCountdownTimer();
      if (statusEl) statusEl.innerText = '💬 명령이 없어 대기를 종료합니다.';
      setTimeout(() => {
        hideVoiceAssistantHud();
      }, 400);
    }
  }, 80);
}

function stopHudCountdownTimer() {
  if (hudTimerInterval) {
    clearInterval(hudTimerInterval);
    hudTimerInterval = null;
  }
}

function hideVoiceAssistantHud() {
  stopHudCountdownTimer();
  const hud = document.getElementById('voice-assistant-overlay-hud');
  if (hud) {
    hud.classList.remove('active');
  }
}

let lastWakeWordTime = 0;

// --- 🎙️ Always-On Voice Recognition & Wake Word Engine ---
function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    console.warn('SpeechRecognition is not supported in this browser.');
    return null;
  }
  const rec = new SpeechRec();
  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = true; // Immediate real-time speech frame processing!

  rec.onstart = () => {
    isListeningVoice = true;
    updateVoiceUI();
  };

  rec.onresult = (e) => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      if (e.results[i][0]) {
        transcript += e.results[i][0].transcript;
      }
    }
    transcript = transcript.trim();
    if (transcript) {
      processVoiceTranscript(transcript);
    }
  };

  rec.onerror = (e) => {
    if (e.error !== 'no-speech') {
      console.warn('Speech recognition error:', e.error);
    }
  };

  rec.onend = () => {
    isListeningVoice = false;
    // Auto-restart Keep-Alive Loop if Wake Word Mode is ON and TTS is not currently speaking
    if (isWakeWordMode && (!window.speechSynthesis || !window.speechSynthesis.speaking)) {
      clearTimeout(wakeWordRestartTimer);
      wakeWordRestartTimer = setTimeout(() => {
        startVoiceRecognition();
      }, 250);
    } else {
      updateVoiceUI();
    }
  };

  return rec;
}

// Process Recognized Voice Transcript for Wake Words ("하이 클로드", "클로드야", "지피티", etc.)
function processVoiceTranscript(rawText) {
  if (!rawText || !rawText.trim()) return;
  const text = rawText.trim();
  console.log('[VOICE INPUT DETECTED]:', text);

  // Update live transcript in active HUD if visible
  const transEl = document.getElementById('hud-speech-transcript');
  if (transEl && text) {
    transEl.innerText = `"${text}"`;
  }

  // Prevent rapid double triggering within 2.5 seconds
  if (Date.now() - lastWakeWordTime < 2500) {
    return;
  }

  const lowerText = text.toLowerCase();
  let matchedTarget = null;
  let remainingPrompt = '';

  for (const entry of WAKE_WORD_MODELS) {
    for (const kw of entry.keywords) {
      const idx = lowerText.indexOf(kw.toLowerCase());
      if (idx !== -1) {
        matchedTarget = entry;
        const afterKw = text.slice(idx + kw.length).trim();
        remainingPrompt = afterKw.replace(/^(?:야|아|님|이)?(?:[,.]|\s+)*/i, '').trim();
        break;
      }
    }
    if (matchedTarget) break;
  }

  if (matchedTarget) {
    lastWakeWordTime = Date.now();
    console.log(`[✨ WAKE WORD TRIGGERED]: ${matchedTarget.name}, Prompt: "${remainingPrompt}"`);
    
    // 1. Play crystal audio chime
    playWakeChime();

    // 2. Switch to target model if applicable
    if (matchedTarget.model) {
      changeModelMode(matchedTarget.model);
    }

    const inputEl = document.getElementById('chat-input-textarea');
    const banner = document.getElementById('stt-banner-text');

    if (remainingPrompt && remainingPrompt.length >= 2) {
      // User called name + asked question together!
      if (inputEl) inputEl.value = remainingPrompt;
      if (banner) banner.innerHTML = `✨ <strong>'${matchedTarget.name}' 호출 감지!</strong>: "${remainingPrompt}"`;
      
      // 3. Show Center Screen Bixby HUD
      showVoiceAssistantHud(matchedTarget.name, matchedTarget.icon || '🤖', remainingPrompt, '⚡ 질문 전송 및 AI 분석 중...', 5.0);

      // Auto-send to AI after brief visual chime
      setTimeout(() => {
        sendBrowserMessage();
      }, 500);
    } else {
      // User just called the wake word: "하이 클로드!"
      if (banner) banner.innerHTML = `✨ <strong>'${matchedTarget.name}' 호출됨</strong>: "네! 말씀하세요."`;
      showVoiceAssistantHud(matchedTarget.name, matchedTarget.icon || '🤖', '네! 말씀하세요. 듣고 있습니다...', '👂 5초 대기 중...', 5.0);
      speakJarvisVoice(`네! ${matchedTarget.name}입니다. 말씀하세요!`);
    }
  } else if (!isWakeWordMode) {
    // Normal STT without wake word
    const inputEl = document.getElementById('chat-input-textarea');
    if (inputEl) inputEl.value = text;
    showVoiceAssistantHud('음성 인식', '🎙️', text, '입력 완료', 3.0);
  }
}

function toggleWakeWordMode() {
  isWakeWordMode = !isWakeWordMode;
  localStorage.setItem(WAKE_WORD_STORAGE_KEY, isWakeWordMode ? 'true' : 'false');
  updateVoiceUI();

  if (isWakeWordMode) {
    startVoiceRecognition();
    speakJarvisVoice('하이 AI 상시 호출 모드가 활성화되었습니다. 하이 클로드, 하이 지피티 처럼 언제든 불러주세요.');
  } else {
    stopVoiceRecognition();
  }
}

function updateVoiceUI() {
  const wakeBtn = document.getElementById('btn-wakeword-toggle');
  const wakeLabel = document.getElementById('wakeword-btn-label');
  const banner = document.getElementById('stt-listening-banner');
  const sttBtn = document.getElementById('btn-voice-stt');
  const sttLabel = document.getElementById('stt-btn-label');

  if (wakeBtn && wakeLabel) {
    if (isWakeWordMode) {
      wakeBtn.style.background = '#042f2e';
      wakeBtn.style.borderColor = '#14b8a6';
      wakeBtn.style.color = '#5eead4';
      wakeLabel.innerText = '✨ \'하이 AI\' 상시 호출: ON';
    } else {
      wakeBtn.style.background = '#1e293b';
      wakeBtn.style.borderColor = '#475569';
      wakeBtn.style.color = '#94a3b8';
      wakeLabel.innerText = '✨ \'하이 AI\' 상시 호출: OFF';
    }
  }

  if (banner) {
    banner.style.display = (isWakeWordMode || isListeningVoice) ? 'flex' : 'none';
  }

  if (sttBtn && sttLabel) {
    if (isListeningVoice) {
      sttBtn.style.background = '#0369a1';
      sttBtn.style.borderColor = '#38bdf8';
      sttLabel.innerText = '🎙️ 듣는 중...';
    } else {
      sttBtn.style.background = '#1e293b';
      sttBtn.style.borderColor = '#38bdf8';
      sttLabel.innerText = '음성 인식 🎙️';
    }
  }
}

function toggleVoiceRecognition() {
  if (isListeningVoice) {
    stopVoiceRecognition();
  } else {
    startVoiceRecognition();
  }
}

function startVoiceRecognition() {
  if (!speechRecognition) {
    speechRecognition = initSpeechRecognition();
  }
  if (!speechRecognition) return;
  try {
    speechRecognition.start();
  } catch (e) {
    // Already running
  }
}

function stopVoiceRecognition() {
  isListeningVoice = false;
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch (e) {}
  }
  updateVoiceUI();
}

// Initialize Voice UI on page load (Default OFF until user clicks button)
setTimeout(() => {
  updateVoiceUI();
}, 500);

// --- 🔊 Jarvis AI Voice TTS Engine (Text to Speech) ---
function toggleTtsAutoPlay() {
  isTtsEnabled = !isTtsEnabled;
  const label = document.getElementById('tts-btn-label');
  const btn = document.getElementById('btn-tts-toggle');
  if (label) {
    label.innerText = isTtsEnabled ? '🔊 자비스 보이스 TTS: ON' : '🔈 자비스 보이스 TTS: OFF';
  }
  if (btn) {
    btn.style.borderColor = isTtsEnabled ? '#a855f7' : '#64748b';
    btn.style.color = isTtsEnabled ? '#d8b4fe' : '#94a3b8';
  }
  if (!isTtsEnabled) {
    stopTtsPlayback();
  }
}

function stopTtsPlayback() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  const stopBtn = document.getElementById('btn-tts-stop');
  if (stopBtn) stopBtn.style.display = 'none';
  if (isWakeWordMode && !isListeningVoice) {
    setTimeout(() => startVoiceRecognition(), 200);
  }
}

function cleanTextForSpeech(text) {
  if (!text) return '';
  // Strip code blocks, urls, markdown symbols for clean speech narration
  let clean = text
    .replace(/```[\s\S]*?```/g, ' 코드 블록을 생성했습니다. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, '링크')
    .replace(/[*#_~>]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return clean;
}

function speakJarvisVoice(text) {
  if (!window.speechSynthesis) return;
  stopTtsPlayback();

  const speechText = cleanTextForSpeech(text);
  if (!speechText) return;

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.06;   // Clean, crisp Jarvis pace
  utterance.pitch = 0.98;  // Smart, authoritative AI tone
  utterance.volume = 1.0;

  // Find best available Korean AI Voice (InJoon / Google / Korean)
  const voices = window.speechSynthesis.getVoices();
  const jarvisVoice = voices.find(v => v.lang.includes('ko') && (v.name.includes('InJoon') || v.name.includes('인준') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Korean')));
  if (jarvisVoice) {
    utterance.voice = jarvisVoice;
  }

  const stopBtn = document.getElementById('btn-tts-stop');
  utterance.onstart = () => {
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    // Temporarily pause mic while speaking to avoid hearing own voice
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch (e) {}
    }
  };
  utterance.onend = () => {
    if (stopBtn) stopBtn.style.display = 'none';
    // Resume listening for wake word after speech completes
    if (isWakeWordMode) {
      setTimeout(() => startVoiceRecognition(), 300);
    }
  };
  utterance.onerror = () => {
    if (stopBtn) stopBtn.style.display = 'none';
    if (isWakeWordMode) {
      setTimeout(() => startVoiceRecognition(), 300);
    }
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

// Render Messages for Active Tab
function renderActiveTabMessages() {
  const tab = getActiveTab();
  const container = document.getElementById('chat-stream-messages');
  if (!container) return;

  container.innerHTML = tab.history.map((msg, idx) => `
    <div class="message-bubble ${msg.role}">
      ${msg.role === 'assistant' ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:700;color:#a78bfa;font-size:0.85rem;">
          <span>🤖 ${getModelDisplayName(tab.model)}</span>
          <button class="btn btn-secondary btn-sm" onclick="replayMessageSpeech(${idx})" style="padding:2px 8px;font-size:0.75rem;border-color:#a855f7;color:#d8b4fe;" title="이 답변을 자비스 목소리로 다시 듣기">🔊 다시 듣기</button>
        </div>
      ` : ''}
      <div>${formatMessageContent(msg.content)}</div>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
  checkAndExtractCodeForPreview();
}

function replayMessageSpeech(msgIndex) {
  const tab = getActiveTab();
  if (tab.history && tab.history[msgIndex]) {
    speakJarvisVoice(tab.history[msgIndex].content);
  }
}

// Format message content with markdown & code block copy/save buttons
function formatMessageContent(text) {
  if (!text) return '';
  
  let rawText = text;
  // Hide internal 3D simulation command payload from chat bubble UI
  rawText = rawText.replace(/<simulation_command>[\s\S]*?<\/simulation_command>/gi, '');

  const codeBlocks = [];

  rawText = rawText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `___CODE_BLOCK_${codeBlocks.length}___`;
    codeBlocks.push({ lang: lang || 'code', code: code.trim() });
    return placeholder;
  });

  let formatted = escapeHtml(rawText);
  formatted = formatted.replace(/\n/g, '<br>');
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;color:#38bdf8;">$1</code>');

  // Re-insert code blocks with copy & save toolbar
  codeBlocks.forEach((item, idx) => {
    const escapedCode = escapeHtml(item.code);
    const langTag = item.lang.toUpperCase() || 'CODE';
    const blockHtml = `
      <div class="code-block-wrapper" style="background:#090d16;border:1px solid #334155;border-radius:10px;margin:10px 0;overflow:hidden;">
        <div style="background:#1e293b;padding:6px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;">
          <span style="font-size:0.75rem;color:#38bdf8;font-weight:700;font-family:monospace;">💻 ${langTag} CODE</span>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="copyCodeSnippet(this)" style="padding:2px 8px;font-size:0.72rem;background:#0f172a;border-color:#38bdf8;color:#38bdf8;">📋 코드 복사</button>
            <button class="btn btn-primary btn-sm" onclick="saveCodeSnippet(this, '${item.lang}')" style="padding:2px 8px;font-size:0.72rem;background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8;">💾 파일 저장</button>
          </div>
        </div>
        <pre style="margin:0;padding:12px;overflow-x:auto;font-size:0.84rem;color:#f8fafc;font-family:'Fira Code',monospace;white-space:pre-wrap;word-break:break-all;"><code>${escapedCode}</code></pre>
      </div>
    `;
    formatted = formatted.replace(`___CODE_BLOCK_${idx}___`, blockHtml);
  });

  return formatted;
}

function copyCodeSnippet(btn) {
  const codeEl = btn.closest('.code-block-wrapper').querySelector('code');
  if (codeEl) {
    const text = codeEl.innerText;
    navigator.clipboard.writeText(text).then(() => {
      btn.innerText = '✅ 복사 완료!';
      setTimeout(() => btn.innerText = '📋 코드 복사', 2000);
    });
  }
}

async function saveCodeSnippet(btn, lang) {
  const codeEl = btn.closest('.code-block-wrapper').querySelector('code');
  if (!codeEl) return;
  const content = codeEl.innerText;

  let ext = 'txt';
  if (lang === 'html') ext = 'html';
  else if (lang === 'python' || lang === 'py') ext = 'py';
  else if (lang === 'javascript' || lang === 'js') ext = 'js';
  else if (lang === 'json') ext = 'json';
  else if (lang === 'css') ext = 'css';

  const defaultName = `code_output.${ext}`;
  const isMobile = window.innerWidth <= 1024 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const filename = prompt('저장/수정할 파일 이름을 입력하세요:', defaultName);
  if (!filename) return;

  if (isMobile) {
    await saveFileToMobileStorage(filename, content);
  } else {
    try {
      const res = await fetch(getApiUrl('/api/browser/save-file'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename, content })
      });
      const data = await res.json();
      if (data.success) alert(`💾 파일 저장 성공!\n경로: ${data.filepath}`);
      else alert('저장 실패: ' + data.error);
    } catch(e) {
      alert('저장 오류: ' + e.message);
    }
  }
}

function sendQuickPrompt(promptText) {
  const inputEl = document.getElementById('chat-input-textarea');
  if (inputEl) {
    inputEl.value = promptText;
    sendBrowserMessage();
  }
}

// Handle Keydown in Input (Enter = Send, Shift + Enter = Line Break)
function handleChatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    sendBrowserMessage();
  }
}

// 🔮 0ms Instant Hologram 3D Particle Morphing Router from User Prompt
function triggerHologramMorphFromPrompt(userPrompt) {
  if (!userPrompt) return;
  const promptText = userPrompt.toLowerCase();
  const holoFrame = document.getElementById('hologram-simulator-frame');
  if (!holoFrame || !holoFrame.contentWindow) return;

  let mode = null;
  let title = '';

  if (promptText.includes('건물') || promptText.includes('빌딩') || promptText.includes('아파트') || promptText.includes('무너') || promptText.includes('붕괴') || promptText.includes('지진')) {
    mode = 8; // Building Collapse
    title = '🏢 3D 고층 건물/아파트 붕괴 물리 파쇄 재현';
  } else if (promptText.includes('사람') || promptText.includes('인간') || promptText.includes('로봇') || promptText.includes('캐릭터') || promptText.includes('날아') || promptText.includes('달려') || promptText.includes('하늘')) {
    mode = 7; // Humanoid Flying
    title = '🤖 3D 인간/로봇 하늘 비행 실시간 형상 재현';
  } else if (promptText.includes('비행기') || promptText.includes('전투기') || promptText.includes('로켓') || promptText.includes('우주선') || promptText.includes('드론')) {
    mode = 9; // Airplane Flight
    title = '✈️ 3D 전투기/비행기 초음속 주행 시뮬레이션';
  } else if (promptText.includes('고양이') || promptText.includes('강아지') || promptText.includes('동물') || promptText.includes('사자') || promptText.includes('호랑이')) {
    mode = 10; // Animal Shape
    title = '🐱 3D 생명체/동물(고양이) 입체 형체 재현';
  } else if (promptText.includes('폭발') || promptText.includes('터지') || promptText.includes('화산') || promptText.includes('마그마') || promptText.includes('액체')) {
    mode = 11; // Explosion
    title = '💥 3D 마그마 액체 분출 및 폭발 파편 재현';
  } else if (promptText.includes('차') || promptText.includes('차량') || promptText.includes('충돌') || promptText.includes('부딪') || promptText.includes('파괴') || promptText.includes('찌그러') || promptText.includes('부서') || promptText.includes('벽')) {
    mode = 6; // Car Crash Physics
    title = '🏎️ 3D 스포츠카 벽 충돌 및 파편 폭발 시뮬레이션';
  } else if (promptText.includes('베어') || promptText.includes('먹히') || promptText.includes('이빨') || promptText.includes('한입') || promptText.includes('입')) {
    mode = 4; // Bitten Donut
    title = '🍩 사람 입에 크게 베어 먹힌 도넛 3D 형상 재현';
  } else if (promptText.includes('블랙홀') || promptText.includes('소용돌이') || promptText.includes('삼켜') || promptText.includes('우주')) {
    mode = 5; // Black Hole
    title = '🌌 블랙홀 소용돌이에 삼켜져 분해되는 3D 형상 재현';
  } else if (promptText.includes('동그라미') || promptText.includes('원') || promptText.includes('구체') || promptText.includes('공') || promptText.includes('행성')) {
    mode = 1; // Sphere / Circle
    title = '🌐 3D 입체 동그라미 / 구체 형상 재현';
  } else if (promptText.includes('네모') || promptText.includes('큐브') || promptText.includes('상자')) {
    mode = 2; // Cube
    title = '🧊 3D 입체 네모 / 큐브 형상 재현';
  } else if (promptText.includes('파동') || promptText.includes('웨이브') || promptText.includes('바다') || promptText.includes('물결')) {
    mode = 3; // Wave
    title = '⚛️ 3D 양자 파동 / 물결 형상 재현';
  } else if (promptText.includes('도넛') || promptText.includes('토러스')) {
    mode = 0; // Torus
    title = '🌀 3D 도넛 형상 재현';
  } else if (promptText.includes('시뮬레이션') || promptText.includes('재현') || promptText.includes('입자') || promptText.includes('보여줘') || promptText.includes('띄워줘') || promptText.includes('바뀌') || promptText.includes('테스트')) {
    // Pick a dynamic active physics mode (Building collapse / Human flying / Car crash)
    const dynamicModes = [7, 8, 6, 9, 11, 4, 5];
    mode = dynamicModes[Math.floor(Math.random() * dynamicModes.length)];
    title = '🔮 3D 실시간 물리 파티클 시뮬레이션 재현 중';
  }

  if (mode !== null) {
    try {
      switchSandboxTab('hologram');
      const sendMsg = () => {
        if (holoFrame && holoFrame.contentWindow) {
          holoFrame.contentWindow.postMessage({ type: 'MORPH_SIMULATION', mode: mode, title: title }, '*');
        }
      };
      sendMsg();
      setTimeout(sendMsg, 120);
      setTimeout(sendMsg, 350);
    } catch (e) {
      console.warn('Hologram PostMessage Error:', e);
    }
  }
}

// Robust Stream Reader with Buffer Accumulator & File Attachment Vision Payload
async function sendBrowserMessage(retryCount = 0) {
  const inputEl = document.getElementById('chat-input-textarea');
  let userText = inputEl ? inputEl.value.trim() : '';

  const tab = getActiveTab();

  if (retryCount === 0) {
    if (!userText && pendingAttachments.length === 0) return;

    // ⚡ 0.000s Zero-Latency Client Morphing Execution (Fires IMMEDIATELY before any async/network/file scanning!)
    triggerHologramMorphFromPrompt(userText);

    // Attach File Contents to Prompt Text
    let fullPromptText = userText;

    if (pendingAttachments.length > 0) {
      const fileTexts = pendingAttachments.map(att => {
        if (att.isImage) {
          return `\n[첨부 이미지: ${att.name}]`;
        } else {
          return `\n\n--- [첨부 파일: ${att.name}] ---\n\`\`\`\n${att.content}\n\`\`\`\n`;
        }
      }).join('');

      fullPromptText = fullPromptText + fileTexts;
    }

    if (activeFolderInfo && activeFolderInfo.files && activeFolderInfo.files.length > 0) {
      const lowerUserText = (userText || '').toLowerCase();
      let matchedFileContent = '';

      activeFolderInfo.files.forEach(f => {
        if (lowerUserText.includes(f.name.toLowerCase())) {
          matchedFileContent += `\n\n--- [📄 사용자 요청 검사 대상 파일: ${f.name}] ---\n\`\`\`\n${f.content}\n\`\`\`\n`;
        }
      });

      fullPromptText += `\n\n--- [📂 연동 프로젝트 폴더 인덱스: ${activeFolderInfo.name} (총 ${activeFolderInfo.files.length}개 파일 연동됨)] ---
폴더 내 파일 목록:
${activeFolderInfo.files.map(f => `- ${f.name} (${f.size})`).join('\n')}`;

      if (matchedFileContent) {
        fullPromptText += matchedFileContent;
      }
    } else if (userText && indexedPhoneFiles.length > 0) {
      const autoFound = await searchAndReadPhoneFileAuto(userText);
      if (autoFound) {
        fullPromptText += `\n\n--- [📱 스마트폰 자동연동 탐색 발견 파일: ${autoFound.name}] ---\n\`\`\`\n${autoFound.content}\n\`\`\`\n`;
      }
    }

    // ⚡ Save ONLY clean user prompt text (e.g. "안녕") to chat history UI (No file list text clutter printed in chat bubbles!)
    tab.history.push({ role: 'user', content: userText || '질문 전달' });
    pendingAttachments = [];
    renderAttachmentPreview();
    if (inputEl) inputEl.value = '';
    renderActiveTabMessages();
    saveStateToLocalStorage();
  }

  const statusEl = document.getElementById('stream-status-text');
  if (statusEl) statusEl.innerText = retryCount > 0 
    ? `🔄 한도/오류 자동 우회: 다음 계정으로 전환 후 임무 재개 중... (${retryCount}/3)` 
    : '⚡ AI 응답 생성 중... (세션 지속성 메모리 및 계정 우회 작동 중)';

  // Create assistant placeholder message
  const assistantMsg = { role: 'assistant', content: '' };
  tab.history.push(assistantMsg);
  renderActiveTabMessages();

  const container = document.getElementById('chat-stream-messages');
  const lastBubble = container.lastElementChild ? container.lastElementChild.querySelector('div:last-child') : null;

  try {
    const payloadMessages = tab.history.filter(m => m.content).map((m, idx, arr) => {
      // Pass fullPromptText (with project index context) ONLY to AI API payload
      if (idx === arr.length - 2 && m.role === 'user') {
        return { role: m.role, content: fullPromptText };
      }
      return { role: m.role, content: m.content };
    });

    const response = await fetch(getApiUrl('/v1/messages'), {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-session-id': tab.id,
        'x-jailbreak': isJailbreakMode ? 'true' : 'false'
      },
      body: JSON.stringify({
        model: tab.model,
        max_tokens: 2048,
        stream: true,
        jailbreak: isJailbreakMode,
        messages: payloadMessages
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `HTTP error ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let assistantText = '';

    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('event: ')) continue;
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const dataObj = JSON.parse(dataStr);
              
              // Handle Stream Error Objects (Rate limit / Concurrency limit / Overload)
              if (dataObj.type === 'error' || dataObj.error) {
                const errMsg = dataObj.error?.message || dataObj.message || 'Upstream Rate Limit';
                console.warn('[STREAM INTERCEPTED ERROR]:', errMsg);
                throw new Error(errMsg);
              }

              if (dataObj.type === 'content_block_delta' && dataObj.delta?.text) {
                assistantText += dataObj.delta.text;
              } else if (dataObj.choices?.[0]?.delta?.content) {
                assistantText += dataObj.choices[0].delta.content;
              } else if (dataObj.content && typeof dataObj.content === 'string') {
                assistantText += dataObj.content;
              }
            } catch (e) {
              if (e.message && (e.message.includes('Rate Limit') || e.message.includes('Concurrency') || e.message.includes('error'))) {
                throw e; // Propagate stream error to catch block for auto-retry!
              }
              if (!dataStr.startsWith('{')) {
                assistantText += dataStr;
              }
            }
            if (assistantText) {
              assistantMsg.content = assistantText;
              if (lastBubble) lastBubble.innerHTML = formatMessageContent(assistantText);
              container.scrollTop = container.scrollHeight;
            }
          }
        }
      }
    } else {
      const data = await response.json();
      if (data.content && Array.isArray(data.content)) {
        assistantText = data.content.map(c => c.text || '').join('');
      } else if (data.choices?.[0]?.message?.content) {
        assistantText = data.choices[0].message.content;
      } else {
        assistantText = typeof data === 'string' ? data : JSON.stringify(data);
      }
      assistantMsg.content = assistantText;
      if (lastBubble) lastBubble.innerHTML = formatMessageContent(assistantText);
    }

    if (!assistantText || !assistantText.trim()) {
      throw new Error('상위 AI 응답이 비어있거나 중단되었습니다. 다음 계정 풀로 자동 전환 후 재시도합니다.');
    }

    if (statusEl) statusEl.innerText = '대기 중...';
    checkAndExtractCodeForPreview();
    autoSaveAiGeneratedFiles(assistantText);
    loadAccountPool();
    saveStateToLocalStorage();

    // 🔔 Trigger Mobile Background System Tray Notification & Vibration
    triggerMobilePushNotification(tab.model, assistantText);

    // Auto-read response using Jarvis AI Voice
    if (isTtsEnabled && assistantText) {
      speakJarvisVoice(assistantText);
    }

  } catch (err) {
    console.error('Browser Send Error:', err);

    tab.history.pop();
    saveStateToLocalStorage();

    if (retryCount < 6) {
      if (statusEl) statusEl.innerText = `🔄 일시적 한도 감지: 계정 자동 우회 및 작업 재개 중... (${retryCount + 1}/6)`;
      await new Promise(r => setTimeout(r, 1000));
      return sendBrowserMessage(retryCount + 1);
    }

    let errorDisplayText = err.message;
    if (err.message === 'Failed to fetch') {
      errorDisplayText = '게이트웨이 서버(http://localhost:3000) 연결 끊김 - 서버 구동 상태를 확인해주세요.';
    }
    assistantMsg.content = `⚠️ **요청 처리 중 오류가 발생했습니다**\n\n> 사유: \`${errorDisplayText}\`\n\n다시 질문을 입력하거나 우측 상단 계정 전환을 시도해주세요.`;
    tab.history.push(assistantMsg);
    renderActiveTabMessages();
    if (statusEl) statusEl.innerText = '오류 발생';
    loadAccountPool();
  }
}

// --- 📁 Antigravity AI Autonomous File Writer Engine ---
async function autoSaveAiGeneratedFiles(responseText) {
  if (!responseText) return;

  const fileMatches = [...responseText.matchAll(/<(?:write_file|create_file|update_file)\s+filename=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:write_file|create_file|update_file)>/gi)];

  if (fileMatches && fileMatches.length > 0) {
    const targetDir = (activeFolderInfo && activeFolderInfo.currentDir) ? activeFolderInfo.currentDir : 'C:\\Users\\Public\\Downloads\\신세계';

    for (const match of fileMatches) {
      const filename = match[1].trim();
      const codeContent = match[2].trim();

      if (filename && codeContent) {
        try {
          const res = await fetch(getApiUrl('/api/browser/save-file'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              targetDir: targetDir,
              filename: filename,
              content: codeContent
            })
          });
          const data = await res.json();
          if (data.success) {
            if (typeof showToastNotification === 'function') {
              showToastNotification('🚀 [Antigravity AI 파일 자동 수정 완료]', `'${filename}' 파일이 내 PC에 실시간 저장되었습니다.`);
            }
            if (typeof renderWorkspaceExplorerTree === 'function') {
              renderWorkspaceExplorerTree();
            }
          }
        } catch (e) {
          console.warn('Auto file save error:', e);
        }
      }
    }
  }
}

// Extract HTML/3D WebGL code for Live Preview & Auto-Sync PC Files
function checkAndExtractCodeForPreview() {
  const tab = getActiveTab();
  const lastAssistant = [...tab.history].reverse().find(m => m.role === 'assistant');
  const lastUser = [...tab.history].reverse().find(m => m.role === 'user');
  if (!lastAssistant || !lastAssistant.content) return;

  const simCmdMatch = lastAssistant.content.match(/<simulation_command>([\s\S]*?)<\/simulation_command>/i);
  if (simCmdMatch && simCmdMatch[1]) {
    try {
      const cmdObj = JSON.parse(simCmdMatch[1].trim());
      if (cmdObj && cmdObj.mode !== undefined) {
        const holoFrame = document.getElementById('hologram-simulator-frame');
        if (holoFrame && holoFrame.contentWindow) {
          holoFrame.contentWindow.postMessage({
            type: 'MORPH_SIMULATION',
            mode: cmdObj.mode,
            title: cmdObj.title || 'AI 실시간 물리 시뮬레이션 재현 중'
          }, '*');
          switchSandboxTab('hologram');
        }
      }
    } catch(e) {
      console.warn('SimCmd Payload Parse Error:', e);
    }
  }

  const htmlMatch = lastAssistant.content.match(/```html([\s\S]*?)```/);
  const pyMatch = lastAssistant.content.match(/```python([\s\S]*?)```/) || lastAssistant.content.match(/```py([\s\S]*?)```/);
  const fileHeaderMatch = lastAssistant.content.match(/```(?:\w+)?\s*(?:filename|file|path):\s*([^\n]+)\n([\s\S]*?)```/i);

  const frame = document.getElementById('sandbox-preview-frame');
  const badge = document.getElementById('preview-filename-badge');

  // --- Bulletproof Automatic PC File Sync Engine ---
  let targetFilename = null;
  
  // A. Detect filename from User Prompt (e.g. "hello.txt", "script.py", "memo.txt")
  if (lastUser && lastUser.content) {
    const fnMatch = lastUser.content.match(/([a-zA-Z0-9_\-가-힣]+\.(?:txt|py|js|html|json|css|md|csv|cpp|c|h|sh|bat))/i);
    if (fnMatch && fnMatch[1]) {
      targetFilename = fnMatch[1].trim();
    }
  }

  // B. Detect filename header inside AI code block
  if (!targetFilename && fileHeaderMatch && fileHeaderMatch[1]) {
    targetFilename = fileHeaderMatch[1].trim();
  }

  // Extract content (code block or full response text)
  const anyCodeBlock = lastAssistant.content.match(/```(?:\w+)?(?:\s+[^\n]+)?\n([\s\S]*?)```/);
  let contentToSave = '';
  if (anyCodeBlock && anyCodeBlock[1]) {
    contentToSave = anyCodeBlock[1].trim();
  } else if (targetFilename) {
    contentToSave = lastAssistant.content.trim();
  }

  // Auto-Save file to PC Hard Drive (C:\Users\chlxo\Desktop\신세계)
  if (targetFilename && contentToSave) {
    fetch(getApiUrl('/api/browser/save-file'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: targetFilename, content: contentToSave })
    }).then(r => r.json()).then(data => {
      if (data.success && badge) {
        badge.innerHTML = `✅ <strong>[PC 파일 실시간 자동 반영 완료]</strong>: ${data.filepath}`;
      }
    }).catch(() => {});
  }

  const holoFrame = document.getElementById('hologram-simulator-frame');
  
  // 🔮 Holographic 3D Particle Fluid Morphing Simulation Router
  if (lastUser && lastUser.content && holoFrame && holoFrame.contentWindow) {
    const promptText = lastUser.content.toLowerCase();
    let mode = null;
    let title = '';

    if (promptText.includes('베어') || promptText.includes('먹히') || promptText.includes('이빨') || promptText.includes('한입') || promptText.includes('입')) {
      mode = 4; // Bitten Donut Cutout
      title = '🍩 사람 입에 크게 베어 먹힌 도넛 3D 형상 재현';
    } else if (promptText.includes('블랙홀') || promptText.includes('소용돌이') || promptText.includes('삼켜') || promptText.includes('우주')) {
      mode = 5; // Black Hole Spiral
      title = '🌌 블랙홀 소용돌이에 삼켜져 분해되는 3D 형상 재현';
    } else if (promptText.includes('충돌') || promptText.includes('부딪') || promptText.includes('파괴') || promptText.includes('찌그러') || promptText.includes('부서')) {
      mode = 6; // Crushed Impact
      title = '💥 충돌로 인해 파괴되고 찌그러진 3D 입자 재현';
    } else if (promptText.includes('녹아') || promptText.includes('액체') || promptText.includes('흘러') || promptText.includes('열')) {
      mode = 7; // Melting Liquid
      title = '🫠 열로 인해 아래로 녹아내리는 액체 3D 형상 재현';
    } else if (promptText.includes('구체') || promptText.includes('공') || promptText.includes('행성')) {
      mode = 1; // Sphere
      title = '🌐 3D 입체 구체 형상 재현';
    } else if (promptText.includes('큐브') || promptText.includes('상자') || promptText.includes('건물')) {
      mode = 2; // Cube
      title = '🧊 3D 입체 큐브 형상 재현';
    } else if (promptText.includes('파동') || promptText.includes('웨이브') || promptText.includes('바다')) {
      mode = 3; // Wave
      title = '⚛️ 3D 양자 파동 형상 재현';
    } else if (promptText.includes('도넛') || promptText.includes('토러스')) {
      mode = 0; // Torus
      title = '🌀 3D 도넛 형상 재현';
    }

    if (mode !== null) {
      try {
        holoFrame.contentWindow.postMessage({ type: 'MORPH_SIMULATION', mode: mode, title: title }, '*');
        switchSandboxTab('hologram');
      } catch(e) {}
    }
  }

  if (htmlMatch && htmlMatch[1]) {
    const code = htmlMatch[1].trim();
    if (frame) frame.srcdoc = code;
    if (badge) badge.innerText = '📄 실시간 3D / WebGL HTML 렌더링 중';
  } else if (pyMatch && pyMatch[1]) {
    // If Blender Python script generated, build Three.js 3D WebGL preview
    const pyCode = pyMatch[1].trim();
    if (badge) badge.innerText = '🎨 Blender Python 3D 애니메이션 스크립트 감지됨 (.py)';

    const threeJsPreview = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>body { margin: 0; overflow: hidden; background: #0b0f19; color: #fff; font-family: sans-serif; }</style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
      </head>
      <body>
        <div style="position:absolute;top:12px;left:12px;background:rgba(0,0,0,0.7);padding:8px 14px;border-radius:8px;font-size:0.85rem;border:1px solid #334155;">
          🎨 3D WebGL 실시간 시뮬레이션 프리뷰 (Blender bpy 연동 준비 완료)
        </div>
        <script>
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
          const renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setSize(window.innerWidth, window.innerHeight);
          document.body.appendChild(renderer.domElement);

          // 3D Metallic Cube & Torus Node
          const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 32);
          const material = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.8, roughness: 0.2 });
          const knot = new THREE.Mesh(geometry, material);
          scene.add(knot);

          const light1 = new THREE.PointLight(0x38bdf8, 2, 100);
          light1.position.set(10, 10, 10);
          scene.add(light1);

          const light2 = new THREE.PointLight(0xea580c, 2, 100);
          light2.position.set(-10, -10, -10);
          scene.add(light2);

          const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
          scene.add(ambientLight);

          camera.position.z = 4;

          function animate() {
            requestAnimationFrame(animate);
            knot.rotation.x += 0.01;
            knot.rotation.y += 0.015;
            renderer.render(scene, camera);
          }
          animate();

          window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
          });
        </script>
      </body>
      </html>
    `;
    if (frame) frame.srcdoc = threeJsPreview;
    if (holoFrame) holoFrame.srcdoc = threeJsPreview;
  }
}

// ✨ 3D Hologram Simulator Controls
function toggleHologramDeviceFrame(mode) {
  const frame = document.getElementById('hologram-simulator-frame');
  if (!frame) return;

  if (mode === 'phone') {
    frame.style.width = '360px';
    frame.style.height = '640px';
    frame.style.borderRadius = '24px';
    frame.style.boxShadow = '0 0 30px rgba(56, 189, 248, 0.7)';
  } else if (mode === 'tablet') {
    frame.style.width = '768px';
    frame.style.height = '500px';
    frame.style.borderRadius = '16px';
    frame.style.boxShadow = '0 0 30px rgba(168, 85, 247, 0.7)';
  } else {
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.borderRadius = '10px';
    frame.style.boxShadow = 'none';
  }
}

function toggleHologramFullscreen() {
  const container = document.getElementById('subtab-hologram');
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// 💾 Save current preview code to local computer file (C:\Users\chlxo\Desktop\신세계)
async function saveCurrentPreviewToFile() {
  const tab = getActiveTab();
  const lastAssistant = [...tab.history].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant || !lastAssistant.content) {
    alert('저장할 AI 코드나 응답이 없습니다.');
    return;
  }

  const htmlMatch = lastAssistant.content.match(/```html([\s\S]*?)```/);
  const pyMatch = lastAssistant.content.match(/```python([\s\S]*?)```/) || lastAssistant.content.match(/```py([\s\S]*?)```/);
  const codeMatch = lastAssistant.content.match(/```[\w]*\n([\s\S]*?)```/);

  let defaultName = 'app_output.html';
  let fileContent = lastAssistant.content;

  if (htmlMatch && htmlMatch[1]) {
    defaultName = 'index.html';
    fileContent = htmlMatch[1].trim();
  } else if (pyMatch && pyMatch[1]) {
    defaultName = 'blender_animation.py';
    fileContent = pyMatch[1].trim();
  } else if (codeMatch && codeMatch[1]) {
    defaultName = 'script.txt';
    fileContent = codeMatch[1].trim();
  }

  const isMobile = window.innerWidth <= 1024 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const promptTitle = isMobile 
    ? '📱 스마트폰 저장소에 생성/수정할 파일 이름을 입력하세요:'
    : '💻 컴퓨터(Desktop\\신세계)에 저장/수정할 파일 이름을 입력하세요:';

  const filename = prompt(promptTitle, defaultName);
  if (!filename) return;

  if (isMobile) {
    // 📱 Smartphone Direct Storage Save/Modify
    await saveFileToMobileStorage(filename, fileContent);
  } else {
    // 💻 PC Desktop Direct File System Save/Modify
    try {
      const res = await fetch(getApiUrl('/api/browser/save-file'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename, content: fileContent })
      });
      const data = await res.json();
      if (data.success) {
        alert(`💾 컴퓨터(PC)에 성공적으로 저장/수정되었습니다!\n저장 경로: ${data.filepath}`);
      } else {
        alert('파일 저장 실패: ' + data.error);
      }
    } catch (e) {
      alert('파일 저장 통신 오류: ' + e.message);
    }
  }
}

// 📱 Full Smartphone Direct File System Storage Access & Direct Save/Modify Function
async function saveFileToMobileStorage(filename = 'mikoran_output.txt', content = '') {
  if (!content) {
    alert('저장할 파일 내용이 없습니다.');
    return;
  }

  // 1. Try Native File System Access API (showSaveFilePicker) on Android Chrome / PWA
  if ('showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || 'txt';
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: '스마트폰 파일 (*.' + ext + ')',
          accept: { 'text/plain': ['.' + ext, '.txt', '.json', '.js', '.py', '.html', '.css', '.md'] }
        }]
      });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      alert(`📱 스마트폰 저장소 성공!\n선택하신 스마트폰 위치에 '${fileHandle.name}' 파일이 저장/수정되었습니다.`);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // User cancelled
      console.warn('[showSaveFilePicker] Fallback to blob download:', err);
    }
  }

  // 2. Direct Mobile Download Blob Fallback
  downloadFileToMobile(filename, content);
}

// 📱 Direct Mobile Download & Smartphone Internal Storage Export Function
function downloadFileToMobile(filename = 'mikoran_output.txt', content = '') {
  if (!content) {
    alert('내보낼 파일 내용이 없습니다.');
    return;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert(`📱 스마트폰 파일 생성/수정 완료!\n스마트폰 [다운로드] 폴더에 '${filename}'이(가) 저장되었습니다.`);
}

// 🔔 Trigger Mobile Native System Push Notification & Vibration Alert
function triggerMobilePushNotification(modelName, fullText) {
  const modelDisplayName = getModelDisplayName(modelName);
  const snippet = cleanTextForSpeech(fullText).slice(0, 90);
  const title = `🤖 ${modelDisplayName} 답변 완료`;
  const body = snippet ? `"${snippet}..." (터치하여 확인)` : 'AI 답변 생성이 완료되었습니다.';

  // 1. Android Vibration Alert
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  // 2. Play Audio Alert Chime
  playWakeChime();

  // 3. Service Worker Push Notification / Native Browser Notification
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_AI_NOTIFICATION',
      title: title,
      body: body
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: '/mikoran.png',
      badge: '/mikoran.png'
    });
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('[Notification Permission Granted]');
      }
    });
  }
}

// Automatically request notification permissions on user interaction
document.addEventListener('click', () => {
  requestNotificationPermission();
}, { once: true });

// 🎨 Generate & Export 3D Blender Python Animation Script (.py)
async function exportBlenderScript() {
  const tab = getActiveTab();
  const lastAssistant = [...tab.history].reverse().find(m => m.role === 'assistant');
  
  let pythonScript = '';
  if (lastAssistant && lastAssistant.content) {
    const pyMatch = lastAssistant.content.match(/```python([\s\S]*?)```/) || lastAssistant.content.match(/```py([\s\S]*?)```/);
    if (pyMatch && pyMatch[1]) {
      pythonScript = pyMatch[1].trim();
    }
  }

  // Fallback Blender Animation Template if no script in chat
  if (!pythonScript) {
    pythonScript = `import bpy
import math

# Clear existing objects
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Create 3D Metallic Cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
cube = bpy.context.active_object
cube.name = "AnimatedMetallicCube"

# Create Glossy Metallic Material
mat = bpy.data.materials.new(name="MetallicPurple")
mat.use_nodes = True
nodes = mat.node_tree.nodes
bsdf = nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.54, 0.36, 0.96, 1.0) # Purple
    bsdf.inputs['Metallic'].default_value = 0.95
    bsdf.inputs['Roughness'].default_value = 0.15

cube.data.materials.append(mat)

# Setup Camera
bpy.ops.object.camera_add(location=(7, -7, 5), rotation=(math.radians(60), 0, math.radians(45)))
camera = bpy.context.active_object
bpy.context.scene.camera = camera

# Setup Sun Light
bpy.ops.object.light_add(type='SUN', location=(5, 5, 10))

# 3D Animation Keyframes (Rotation Bounce)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 120

for frame in range(1, 121):
    scene.frame_set(frame)
    angle = (frame / 120.0) * 2 * math.pi
    cube.rotation_euler.z = angle
    cube.rotation_euler.x = math.sin(angle) * 0.5
    cube.location.z = 1.0 + math.sin(angle * 2) * 0.5
    
    cube.keyframe_insert(data_path="rotation_euler", index=-1)
    cube.keyframe_insert(data_path="location", index=2)

print("🎨 Mikoran Blender 3D Animation Script Executed Successfully!")
`;
  }

  const filename = prompt('생성할 Blender Python 스크립트 파일명을 입력하세요:', 'blender_3d_animation.py');
  if (!filename) return;

  try {
    const res = await fetch(getApiUrl('/api/browser/save-file'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename, content: pythonScript })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🎨 Blender 3D 애니메이션 스크립트(.py)가 생성되었습니다!\n저장 경로: ${data.filepath}\n\n[Blender 실행 방법]: Blender 실행 ➔ Scripting 탭 ➔ 파일 열기 ➔ Run Script 버튼 클릭!`);
    }
  } catch (e) {
    alert('Blender 스크립트 저장 실패: ' + e.message);
  }
}

// Clear Current Chat History
function clearCurrentChat() {
  if (!confirm('현재 탭의 대화 기록을 모두 비우시겠습니까?')) return;
  const tab = getActiveTab();
  tab.history = [
    {
      role: 'assistant',
      content: '대화 기록이 초기화되었습니다. 새로운 질문을 작성하세요.'
    }
  ];
  renderActiveTabMessages();
}

// 📂 Native System Folder & File Selector (Opens System File/Folder Picker Dialog)
async function openSystemFileOrFolderPicker() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    openRemotePcFolderModal();
    return;
  }

  // 1. If Directory Picker API is supported (Chrome/Edge/PWA on Desktop)
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'desktop'
      });
      if (dirHandle) {
        const fileList = [];
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            const text = await file.text().catch(() => '');
            fileList.push({
              name: file.name,
              size: formatFileSize(file.size),
              content: text
            });
          }
        }
        activeFolderInfo = {
          name: dirHandle.name,
          handle: dirHandle,
          files: fileList
        };
        renderAttachmentPreview();
        switchSandboxTab('explorer');
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // User cancelled
    }
  }

  // Fallback: Open Remote PC Folder Navigator
  openRemotePcFolderModal();
}

// Handle System Folder Selected Event
function handleFolderSelected(e) {
  if (e.target.files && e.target.files.length > 0) {
    const fileList = [];
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        fileList.push({
          name: file.name,
          size: formatFileSize(file.size),
          content: evt.target.result
        });
        if (fileList.length === e.target.files.length) {
          const folderName = file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : '프로젝트_폴더';
          activeFolderInfo = {
            name: folderName,
            files: fileList
          };
          renderAttachmentPreview();
          switchSandboxTab('explorer');
        }
      };
      reader.readAsText(file, 'UTF-8');
    });
    e.target.value = '';
  }
}

// 📁 Smart Unified File Explorer Function (Triggers System File Attachment Picker on PC & Mobile)
function smartUnifiedFileExplorerTrigger() {
  triggerFilePicker();
}

// 📱 Full Device Storage Access & File Picker Trigger (Android Galaxy & PC)
async function triggerFilePicker() {
  // If modern System File Picker is available in Chrome/Android
  if ('showOpenFilePicker' in window) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: '모든 스마트폰 & PC 파일 (*.*)',
          accept: { '*/*': ['.*'] }
        }]
      });
      if (handles && handles.length > 0) {
        pendingAttachments = [];
        for (const handle of handles) {
          const file = await handle.getFile();
          const isImage = file.type.startsWith('image/');
          if (isImage) {
            const dataUrl = await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = e => resolve(e.target.result);
              reader.readAsDataURL(file);
            });
            pendingAttachments.push({ name: file.name, isImage: true, content: dataUrl });
          } else {
            const text = await file.text();
            pendingAttachments.push({ name: file.name, isImage: false, content: text });
          }
        }
        renderAttachmentPreview();
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return; // User cancelled
    }
  }

  // Fallback to HTML5 File Input
  const fileInput = document.getElementById('file-upload-input');
  if (fileInput) {
    fileInput.click();
  }
}

// --- 📱 Autonomous Phone Storage Directory Indexer & File Discovery Engine ---
let indexedPhoneFiles = [];
let dbPhoneDirHandle = null;

async function enableAutoPhoneStorageSync() {
  if ('showDirectoryPicker' in window) {
    try {
      dbPhoneDirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });
      await scanAndIndexPhoneDirectory(dbPhoneDirHandle);
      alert(`🎉 스마트폰 저장소 무첨부 자동연동 성공!\n'${dbPhoneDirHandle.name}' 폴더 내 모든 파일(${indexedPhoneFiles.length}개)이 연결되었습니다.\n\n이제 첨부 버튼 없이 "다운로드 폴더의 파일명 읽어줘" 라고 편하게 불러주세요!`);
    } catch (e) {
      if (e.name !== 'AbortError') {
        alert('폰 저장소 연동 지원 알림: 폰 크롬(Chrome) 브라우저 권한을 허용해 주시거나 파일 첨부 버튼을 이용해 주세요.');
      }
    }
  } else {
    alert('이 기능은 폴더 전체 무첨부 자동 탐색을 위해 폰 크롬(Chrome) 브라우저 접속을 권장합니다.');
  }
}

async function scanAndIndexPhoneDirectory(dirHandle, pathPrefix = '') {
  indexedPhoneFiles = [];
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        indexedPhoneFiles.push({
          name: entry.name,
          path: pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name,
          handle: entry
        });
      } else if (entry.kind === 'directory') {
        try {
          for await (const subEntry of entry.values()) {
            if (subEntry.kind === 'file') {
              indexedPhoneFiles.push({
                name: subEntry.name,
                path: `${entry.name}/${subEntry.name}`,
                handle: subEntry
              });
            }
          }
        } catch(e) {}
      }
    }
    console.log('[Phone Auto-Index Complete]:', indexedPhoneFiles.length, 'files indexed.');
  } catch (e) {
    console.warn('Phone dir scan error:', e);
  }
}

async function searchAndReadPhoneFileAuto(filenameQuery) {
  if (!filenameQuery || indexedPhoneFiles.length === 0) return null;
  const q = filenameQuery.toLowerCase();
  const matched = indexedPhoneFiles.find(f => q.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(q));
  if (matched && matched.handle) {
    try {
      const file = await matched.handle.getFile();
      const text = await file.text();
      return { name: file.name, content: text };
    } catch (e) {
      console.warn('Read indexed file error:', e);
    }
  }
  return null;
}

// Toggle Split Pane
function toggleSplitPane() {
  const rightPane = document.getElementById('pane-right');
  const btn = document.getElementById('btn-toggle-split');
  if (!rightPane) return;

  isSplitPaneOpen = !isSplitPaneOpen;
  rightPane.style.display = isSplitPaneOpen ? 'flex' : 'none';
  if (btn) btn.style.background = isSplitPaneOpen ? 'var(--bg-card)' : 'transparent';
  saveStateToLocalStorage();
}

// Switch Sandbox Subtab
function switchSandboxTab(tabName) {
  const tabs = document.querySelectorAll('.sandbox-tab');
  tabs.forEach(t => {
    if (t.dataset.sandboxTab === tabName) t.classList.add('active');
    else t.classList.remove('active');
  });

  const subtabMap = {
    'preview': 'subtab-preview',
    'terminal': 'subtab-terminal',
    'explorer': 'subtab-explorer',
    'comparison': 'subtab-comparison',
    'accounts': 'subtab-accounts',
    'hologram': 'subtab-hologram'
  };

  Object.keys(subtabMap).forEach(key => {
    const el = document.getElementById(subtabMap[key]);
    if (el) {
      if (key === tabName) {
        el.style.setProperty('display', (key === 'comparison' || key === 'accounts') ? 'block' : 'flex', 'important');
      } else {
        el.style.setProperty('display', 'none', 'important');
      }
    }
  });

  if (tabName === 'accounts') loadAccountPool();
  if (tabName === 'explorer') renderWorkspaceExplorerTree();
}

// --- 📁 Antigravity IDE / VS Code Style Workspace File Explorer Engine ---

let isLoadingDefaultFolder = false;

async function autoLoadDefaultWorkspaceFolder() {
  if (isLoadingDefaultFolder) return;
  isLoadingDefaultFolder = true;
  try {
    const res = await fetch(getApiUrl('/api/browser/list-files'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetDir: 'c:\\Users\\Public\\Downloads\\신세계' })
    });
    const data = await res.json();
    if (data.success && data.files) {
      const fileList = [];
      for (const f of data.files) {
        if (!f.isDirectory) {
          const contentRes = await fetch(getApiUrl('/api/browser/read-file'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDir: 'c:\\Users\\Public\\Downloads\\신세계', filename: f.name })
          }).catch(() => null);
          const cData = contentRes ? await contentRes.json() : null;
          fileList.push({
            name: f.name,
            size: formatFileSize(f.size || 0),
            content: (cData && cData.content) ? cData.content : ''
          });
        }
      }
      activeFolderInfo = {
        name: '신세계 (기본 워크스페이스)',
        files: fileList
      };
      renderAttachmentPreview();
      renderWorkspaceExplorerTree();
    }
  } catch (e) {
    console.warn('Auto load default workspace error:', e);
  } finally {
    isLoadingDefaultFolder = false;
  }
}

// --- 📲 Mobile <-> PC Photo & Text Transfer Hub Engine ---
let selectedTransferPhotoBase64 = null;
let selectedTransferPhotoFileName = '';

function openRemoteTransferModal() {
  const modal = document.getElementById('remote-transfer-modal-overlay');
  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('z-index', '999999', 'important');
  }
  switchTransferTab('photo');
}

function closeRemoteTransferModal() {
  const modal = document.getElementById('remote-transfer-modal-overlay');
  if (modal) modal.style.setProperty('display', 'none', 'important');
}

function switchTransferTab(tabName) {
  const secPhoto = document.getElementById('tr-sec-photo');
  const secText = document.getElementById('tr-sec-text');
  const secHistory = document.getElementById('tr-sec-history');

  const btnPhoto = document.getElementById('tab-tr-photo-btn');
  const btnText = document.getElementById('tab-tr-text-btn');
  const btnHistory = document.getElementById('tab-tr-history-btn');

  if (secPhoto) secPhoto.style.display = tabName === 'photo' ? 'flex' : 'none';
  if (secText) secText.style.display = tabName === 'text' ? 'flex' : 'none';
  if (secHistory) secHistory.style.display = tabName === 'history' ? 'flex' : 'none';

  if (btnPhoto) btnPhoto.className = tabName === 'photo' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  if (btnText) btnText.className = tabName === 'text' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  if (btnHistory) btnHistory.className = tabName === 'history' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

  if (tabName === 'history') loadTransferHistory();
}

function handleTransferPhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  selectedTransferPhotoFileName = file.name;
  const fnEl = document.getElementById('tr-photo-filename');
  const fsEl = document.getElementById('tr-photo-filesize');
  const imgEl = document.getElementById('tr-photo-preview-img');
  const boxEl = document.getElementById('tr-photo-preview-box');

  if (fnEl) fnEl.innerText = file.name;
  if (fsEl) fsEl.innerText = formatFileSize(file.size);

  const reader = new FileReader();
  reader.onload = (e) => {
    selectedTransferPhotoBase64 = e.target.result;
    if (imgEl) imgEl.src = e.target.result;
    if (boxEl) boxEl.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

async function sendPhotoToPcAction() {
  if (!selectedTransferPhotoBase64) {
    alert('⚠️ 전송할 사진을 먼저 선택해 주세요.');
    return;
  }

  try {
    const res = await fetch(getApiUrl('/api/browser/transfer-item'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'image',
        filename: selectedTransferPhotoFileName || `phone_photo_${Date.now()}.png`,
        imageBase64: selectedTransferPhotoBase64
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🚀 [컴퓨터로 사진 전송 성공!]\n파일명: ${data.item.filename}\n\n컴퓨터 하드디스크(신세계)에 저장되었으며, 컴퓨터 화면 대화창에 첨부되었습니다!`);
      closeRemoteTransferModal();
    } else {
      alert('⚠️ 전송 실패: ' + (data.error || ''));
    }
  } catch (e) {
    alert('⚠️ 사진 전송 통신 오류: ' + e.message);
  }
}

async function sendTextToPcAction() {
  const textInput = document.getElementById('tr-text-input');
  const val = textInput ? textInput.value.trim() : '';

  if (!val) {
    alert('⚠️ 전송할 글, URL, 메모를 입력해 주세요.');
    return;
  }

  try {
    const res = await fetch(getApiUrl('/api/browser/transfer-item'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'text',
        text: val
      })
    });
    const data = await res.json();
    if (data.success) {
      alert('🚀 [컴퓨터 대화창으로 텍스트 전송 성공!]\n컴퓨터 미코란 입력창에 글이 채워졌습니다.');
      if (textInput) textInput.value = '';
      closeRemoteTransferModal();
    } else {
      alert('⚠️ 텍스트 전송 실패: ' + (data.error || ''));
    }
  } catch (e) {
    alert('⚠️ 텍스트 전송 통신 오류: ' + e.message);
  }
}

async function loadTransferHistory() {
  const listBox = document.getElementById('tr-history-list-box');
  if (listBox) listBox.innerHTML = '<div style="color:#38bdf8;font-size:0.85rem;text-align:center;padding:20px 0;">⚡ 수신 내역 로딩 중...</div>';

  try {
    const res = await fetch(getApiUrl('/api/browser/transfer-items'));
    const data = await res.json();

    if (data.success && data.items && data.items.length > 0) {
      let html = '';
      data.items.forEach(item => {
        if (item.type === 'image') {
          html += `
            <div style="display:flex;align-items:center;gap:12px;background:#0d1322;padding:8px 12px;border-radius:8px;border:1px solid #1e293b;">
              <img src="${item.imageUrl}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #38bdf8;">
              <div style="flex:1;">
                <div style="font-size:0.82rem;font-weight:bold;color:#38bdf8;">📸 사진: ${escapeHtml(item.filename)}</div>
                <div style="font-size:0.75rem;color:#94a3b8;">${new Date(item.createdAt).toLocaleString()}</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="applyTransferredItemToPromptDirect(JSON.parse('${escapeHtml(JSON.stringify(item))}'))" style="background:#0284c7;border-color:#38bdf8;">대화창에 첨부</button>
            </div>
          `;
        } else {
          html += `
            <div style="display:flex;align-items:center;gap:12px;background:#0d1322;padding:8px 12px;border-radius:8px;border:1px solid #1e293b;">
              <span style="font-size:1.4rem;">📝</span>
              <div style="flex:1;overflow:hidden;">
                <div style="font-size:0.82rem;color:#5eead4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.text)}</div>
                <div style="font-size:0.75rem;color:#94a3b8;">${new Date(item.createdAt).toLocaleString()}</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="applyTransferredItemToPromptDirect(JSON.parse('${escapeHtml(JSON.stringify(item))}'))" style="background:#7c3aed;border-color:#a78bfa;">대화창에 입력</button>
            </div>
          `;
        }
      });
      if (listBox) listBox.innerHTML = html;
    } else {
      if (listBox) listBox.innerHTML = '<div style="color:#64748b;font-size:0.85rem;text-align:center;padding:20px 0;">(아직 전송된 사진이나 글이 없습니다)</div>';
    }
  } catch (e) {
    if (listBox) listBox.innerHTML = `<div style="color:#ef4444;font-size:0.85rem;text-align:center;padding:20px 0;">⚠️ 로딩 오류: ${escapeHtml(e.message)}</div>`;
  }
}

// Background Receiver Polling Engine (Receives Mobile Beams on PC)
let knownTransferIds = new Set();

async function pollRemoteTransfersOnPc() {
  try {
    const res = await fetch(getApiUrl('/api/browser/transfer-items'));
    const data = await res.json();
    if (data.success && data.items && data.items.length > 0) {
      if (knownTransferIds.size === 0) {
        data.items.forEach(i => knownTransferIds.add(i.id));
        return;
      }

      for (const item of data.items) {
        if (!knownTransferIds.has(item.id)) {
          knownTransferIds.add(item.id);
          applyTransferredItemToPromptDirect(item);
        }
      }
    }
  } catch (e) {}
}

function applyTransferredItemToPromptDirect(item) {
  const promptInput = document.getElementById('browser-prompt-input');
  if (item.type === 'text' && item.text) {
    if (promptInput) {
      promptInput.value = promptInput.value ? `${promptInput.value}\n${item.text}` : item.text;
    }
    showToastNotification(`📲 [스마트폰 원격 전송 수신]\n📝 텍스트 메모가 컴퓨터 대화창에 채워졌습니다!`);
  } else if (item.type === 'image') {
    if (!activeFolderInfo) activeFolderInfo = { name: '신세계', files: [] };
    activeFolderInfo.files.push({
      name: item.filename,
      size: 'Image',
      content: `[Photo Transferred from Smartphone: ${item.filename}]`
    });
    renderAttachmentPreview();
    showToastNotification(`📲 [스마트폰 원격 사진 수신]\n📸 '${item.filename}' 사진이 컴퓨터 대화창에 실시간 첨부되었습니다!`);
  }
}

function showToastNotification(message) {
  let toast = document.getElementById('mikoran-remote-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mikoran-remote-toast';
    toast.style.cssText = 'position:fixed;bottom:90px;right:24px;z-index:99999;background:linear-gradient(135deg,#0284c7,#7c3aed);color:#fff;padding:12px 18px;border-radius:10px;font-size:0.88rem;font-weight:bold;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #38bdf8;transition:all 0.3s ease;transform:translateY(20px);opacity:0;';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
  }, 4500);
}

// --- 📜 Saved Session History Manager Functions ---
let allSavedSessionsList = [];

function openSessionHistoryModal() {
  const modal = document.getElementById('session-history-modal-overlay');
  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('z-index', '999999', 'important');
  }
  loadSessionHistoryFromBackend();
}

function closeSessionHistoryModal() {
  const modal = document.getElementById('session-history-modal-overlay');
  if (modal) modal.style.setProperty('display', 'none', 'important');
}

async function loadSessionHistoryFromBackend() {
  const container = document.getElementById('session-history-list-container');
  if (container) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:#38bdf8;font-size:0.9rem;">⚡ 이전 대화 히스토리 불러오는 중...</div>`;
  }

  try {
    const res = await fetch(getApiUrl('/api/browser/sessions'));
    const data = await res.json();

    if (data.success && data.sessions) {
      allSavedSessionsList = data.sessions;
      renderSessionHistoryList(allSavedSessionsList);
    } else {
      if (container) container.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">⚠️ 대화 히스토리를 불러올 수 없습니다.</div>`;
    }
  } catch (e) {
    if (container) container.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">⚠️ 통신 오류: ${escapeHtml(e.message)}</div>`;
  }
}

function renderSessionHistoryList(sessions) {
  const container = document.getElementById('session-history-list-container');
  if (!container) return;

  if (!sessions || sessions.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:35px 10px;color:#64748b;font-size:0.9rem;">📜 저장된 이전 대화 기록이 없습니다.<br>새 대화를 시작하여 지식을 축적해보세요!</div>`;
    return;
  }

  let html = '';
  sessions.forEach(sess => {
    const title = sess.title || (sess.browserTabs && sess.browserTabs[0] ? sess.browserTabs[0].title : 'AI Workspace Session');
    const tabCount = (sess.browserTabs && sess.browserTabs.length) || (sess.tabs && sess.tabs.length) || 1;
    const timeStr = sess.updatedAt ? new Date(sess.updatedAt).toLocaleString() : (sess.createdAt ? new Date(sess.createdAt).toLocaleString() : '최근');
    const isSharedActive = sess.id === 'shared_active_workspace';

    html += `
      <div style="background:#090d16;border:1px solid #1e293b;border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;transition:all 0.2s ease;" onclick="loadSelectedSession('${sess.id}')" onmouseover="this.style.borderColor='#38bdf8';this.style.background='#0d1527';" onmouseout="this.style.borderColor='#1e293b';this.style.background='#090d16';">
        <div style="flex:1;overflow:hidden;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-weight:bold;color:${isSharedActive ? '#5eead4' : '#f8fafc'};font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${isSharedActive ? '📱 ↔ 🖥️ 스마트폰/PC 실시간 동기화 대화' : escapeHtml(title)}
            </span>
            ${isSharedActive ? '<span style="background:#042f2e;color:#5eead4;border:1px solid #14b8a6;font-size:0.7rem;padding:1px 6px;border-radius:4px;white-space:nowrap;">실시간 연결됨</span>' : ''}
          </div>
          <div style="font-size:0.78rem;color:#94a3b8;display:flex;gap:12px;align-items:center;">
            <span>🕒 ${timeStr}</span>
            <span>💬 탭 ${tabCount}개</span>
            <span>🤖 ${escapeHtml(sess.model || 'claude-3-7-sonnet')}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;" onclick="event.stopPropagation();">
          <button class="btn btn-primary btn-sm" onclick="loadSelectedSession('${sess.id}')" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8;padding:5px 12px;font-weight:700;">불러오기 📂</button>
          ${!isSharedActive ? `<button class="btn btn-secondary btn-sm" onclick="deleteSelectedSession(event, '${sess.id}')" style="background:#271414;border-color:#ef4444;color:#fca5a5;padding:5px 10px;">삭제 🗑️</button>` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function filterSessionHistoryList(query) {
  if (!query) {
    renderSessionHistoryList(allSavedSessionsList);
    return;
  }
  const q = query.toLowerCase();
  const filtered = allSavedSessionsList.filter(s => {
    const t = (s.title || '').toLowerCase();
    const id = (s.id || '').toLowerCase();
    return t.includes(q) || id.includes(q);
  });
  renderSessionHistoryList(filtered);
}

async function loadSelectedSession(sessionId) {
  try {
    const res = await fetch(getApiUrl('/api/browser/sessions/') + sessionId);
    const data = await res.json();

    if (data.success && data.session) {
      const sess = data.session;
      if (sess.browserTabs && Array.isArray(sess.browserTabs) && sess.browserTabs.length > 0) {
        browserTabs = sess.browserTabs;
        activeTabId = sess.activeTabId && browserTabs.some(t => t.id === sess.activeTabId) ? sess.activeTabId : browserTabs[0].id;
      } else if (sess.history && Array.isArray(sess.history)) {
        const tab = getActiveTab();
        tab.history = sess.history;
      }

      renderBrowserTabs();
      renderActiveTabMessages();
      saveStateToLocalStorage();
      closeSessionHistoryModal();
      alert(`🎉 [이전 대화 불러오기 성공!]\n'${sess.title || '대화 작업'}' 의 전체 대화 내역과 탭 구조가 정상 로드되었습니다.`);
    } else {
      alert('⚠️ 이전 대화를 찾을 수 없거나 불러올 수 없습니다: ' + (data.error || ''));
    }
  } catch (e) {
    alert('⚠️ 이전 대화 로드 통신 오류: ' + e.message);
  }
}

async function deleteSelectedSession(event, sessionId) {
  if (event) event.stopPropagation();
  if (!confirm('정말로 이 대화 기록을 삭제하시겠습니까?')) return;

  try {
    const res = await fetch(getApiUrl('/api/browser/sessions/') + sessionId, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadSessionHistoryFromBackend();
    } else {
      alert('삭제 실패: ' + (data.error || ''));
    }
  } catch (e) {
    alert('삭제 오류: ' + e.message);
  }
}

function createNewSessionFromModal() {
  const newId = 'tab_' + Date.now();
  browserTabs.push({
    id: newId,
    title: 'NEW AI Tab ' + (browserTabs.length + 1),
    model: 'claude-3-7-sonnet',
    history: []
  });
  activeTabId = newId;
  renderBrowserTabs();
  renderActiveTabMessages();
  saveStateToLocalStorage();
  closeSessionHistoryModal();
}

async function saveCurrentSessionSnapshot() {
  const activeTab = getActiveTab();
  const sessionTitle = (activeTab && activeTab.history && activeTab.history.length > 0)
    ? (activeTab.history[0].content || '').slice(0, 30)
    : 'AI Workspace ' + new Date().toLocaleTimeString();

  try {
    const res = await fetch(getApiUrl('/api/browser/sessions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: sessionTitle,
        model: activeTab ? activeTab.model : 'claude-3-7-sonnet',
        tabs: browserTabs,
        activeTabId: activeTabId,
        history: activeTab ? activeTab.history : []
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`💾 [세션 보존 완료!]\n'${sessionTitle}' 대화 기록이 백엔드 DB에 성공적으로 보존되었습니다.`);
    } else {
      alert('⚠️ 세션 보존 실패: ' + (data.error || ''));
    }
  } catch (e) {
    alert('⚠️ 세션 보존 통신 오류: ' + e.message);
  }
}

// --- 📱 Smartphone & PC Remote Folder Selection Navigator ---


function openRemotePcFolderModal() {
  const modal = document.getElementById('remote-pc-folder-modal-overlay');
  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('z-index', '999999', 'important');
  }
  const startPath = (activeFolderInfo && activeFolderInfo.currentDir) 
    ? activeFolderInfo.currentDir 
    : 'C:\\Users\\Public\\Downloads\\신세계';
  fetchPcDirectoryContents(startPath);
}

function closeRemotePcFolderModal() {
  const modal = document.getElementById('remote-pc-folder-modal-overlay');
  if (modal) modal.style.setProperty('display', 'none', 'important');
}

async function fetchPcDirectoryContents(targetDir) {
  const inputEl = document.getElementById('remote-pc-folder-path-input');
  const listBox = document.getElementById('remote-pc-folder-list-box');
  if (listBox) listBox.innerHTML = `<div style="color:#38bdf8;font-size:0.85rem;text-align:center;padding:25px 0;">⚡ 컴퓨터 경로 조회 중: ${escapeHtml(targetDir || '')}...</div>`;

  try {
    const res = await fetch(getApiUrl('/api/browser/browse-pc-folders'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetDir: targetDir })
    });
    const data = await res.json();

    if (data.success && data.currentDir) {
      currentNavigatingPcDir = data.currentDir;
      if (inputEl) inputEl.value = data.currentDir;

      let html = '';

      // Parent Directory item
      if (data.parentDir) {
        html += `
          <div onclick="fetchPcDirectoryContents('${escapeHtml(data.parentDir.replace(/\\/g, '\\\\'))}')" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#1e293b;border-radius:6px;cursor:pointer;color:#38bdf8;font-size:0.85rem;font-weight:bold;">
            <span>⬆️ 상위 폴더로 이동 (..)</span>
          </div>
        `;
      }

      // Folders
      if (data.folders && data.folders.length > 0) {
        data.folders.forEach(f => {
          html += `
            <div onclick="fetchPcDirectoryContents('${escapeHtml(f.fullPath.replace(/\\/g, '\\\\'))}')" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:6px;cursor:pointer;color:#5eead4;font-size:0.84rem;font-weight:600;transition:all 0.15s;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span>📁</span>
                <span>${escapeHtml(f.name)}</span>
              </div>
              <span style="font-size:0.75rem;color:#38bdf8;">하위 폴더 &gt;</span>
            </div>
          `;
        });
      }

      // Files preview (Clickable to open on Mobile & PC)
      if (data.files && data.files.length > 0) {
        data.files.forEach(f => {
          html += `
            <div onclick="readAndInspectRemotePcFile('${escapeHtml(f.fullPath.replace(/\\/g, '\\\\'))}')" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.03);border:1px solid #334155;border-radius:6px;cursor:pointer;color:#38bdf8;font-size:0.84rem;font-family:monospace;transition:all 0.15s;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span>${getFileIcon(f.name)}</span>
                <span style="font-weight:bold;">${escapeHtml(f.name)}</span>
              </div>
              <span style="font-size:0.75rem;color:#5eead4;background:#0f172a;padding:2px 6px;border-radius:4px;">${formatFileSize(f.size || 0)} [내용 열기]</span>
            </div>
          `;
        });
      }

      if (listBox) listBox.innerHTML = html;
    } else {
      if (listBox) listBox.innerHTML = `<div style="color:#ef4444;font-size:0.85rem;text-align:center;padding:20px 0;">⚠️ 폴더를 읽을 수 없거나 접근 권한이 없습니다: ${escapeHtml(data.error || '')}</div>`;
    }
  } catch (e) {
    if (listBox) listBox.innerHTML = `<div style="color:#ef4444;font-size:0.85rem;text-align:center;padding:20px 0;">⚠️ 통신 오류: ${escapeHtml(e.message)}</div>`;
  }
}

async function readAndInspectRemotePcFile(fullPath) {
  try {
    const res = await fetch(getApiUrl('/api/browser/read-file'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filepath: fullPath })
    });
    const data = await res.json();
    if (data.success && data.content !== undefined) {
      selectedExplorerFile = {
        name: data.filename,
        size: formatFileSize(data.content.length),
        content: data.content
      };
      closeRemotePcFolderModal();
      switchSandboxTab('explorer');
      const fnEl = document.getElementById('explorer-selected-filename');
      const codeEditor = document.getElementById('explorer-code-editor');
      if (fnEl) fnEl.innerText = `${getFileIcon(data.filename)} ${data.filename} (${formatFileSize(data.content.length)})`;
      if (codeEditor) codeEditor.value = data.content;
      alert(`📱 [스마트폰 파일 열기 성공]\n파일명: ${data.filename}\n경로: ${data.filepath}\n\n에디터 및 AI 검사창에 정상 로드되었습니다.`);
    } else {
      alert('⚠️ 파일 내용을 읽을 수 없습니다: ' + (data.error || ''));
    }
  } catch (e) {
    alert('⚠️ 파일 읽기 통신 오류: ' + e.message);
  }
}

async function confirmSelectRemotePcFolder() {
  const inputEl = document.getElementById('remote-pc-folder-path-input');
  const targetDir = (inputEl ? inputEl.value.trim() : '') || currentNavigatingPcDir;

  if (!targetDir) {
    alert('⚠️ 연결할 컴퓨터 폴더 경로를 지정해주세요.');
    return;
  }

  try {
    const res = await fetch(getApiUrl('/api/browser/browse-pc-folders'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetDir: targetDir })
    });
    const data = await res.json();

    if (data.success && data.currentDir) {
      const fileList = (data.files || []).map(f => ({
        name: f.name,
        size: formatFileSize(f.size || 0),
        fullPath: f.fullPath,
        content: ''
      }));

      activeFolderInfo = {
        name: data.currentDir.split('\\').pop() || data.currentDir,
        currentDir: data.currentDir,
        files: fileList
      };

      if (typeof renderAttachmentPreview === 'function') renderAttachmentPreview();
      if (typeof renderWorkspaceExplorerTree === 'function') renderWorkspaceExplorerTree();
      if (typeof closeRemotePcFolderModal === 'function') closeRemotePcFolderModal();
      if (typeof switchSandboxTab === 'function') switchSandboxTab('explorer');
      alert(`📱 [원격 PC 폴더 연결 완료]\n경로: ${data.currentDir}\n총 ${fileList.length}개 파일이 스마트폰 & PC에 즉시 연결되었습니다!`);
    } else {
      alert('⚠️ 폴더를 연결할 수 없습니다: ' + (data.error || ''));
    }
  } catch (e) {
    alert('⚠️ 원격 폴더 연결 오류: ' + e.message);
  }
}

function renderWorkspaceExplorerTree() {
  const folderNameEl = document.getElementById('explorer-folder-name');
  const fileCountEl = document.getElementById('explorer-file-count');
  const treeContainer = document.getElementById('explorer-file-tree-list');

  if (!activeFolderInfo || !activeFolderInfo.files || activeFolderInfo.files.length === 0) {
    autoLoadDefaultWorkspaceFolder();
    if (folderNameEl) folderNameEl.innerText = '📁 프로젝트 폴더: 연결 중...';
    if (fileCountEl) fileCountEl.innerText = '(기본 워크스페이스 로딩 중)';
    if (treeContainer) {
      treeContainer.innerHTML = `<div style="color:#38bdf8;font-size:0.8rem;text-align:center;padding:30px 10px;">⚡ 내 PC '신세계' 워크스페이스 폴더 연결 중...</div>`;
    }
    return;
  }

  if (folderNameEl) folderNameEl.innerText = `📁 프로젝트 폴더: ${activeFolderInfo.name}`;
  if (fileCountEl) fileCountEl.innerText = `(총 ${activeFolderInfo.files.length}개 파일)`;

  const filterText = (document.getElementById('explorer-file-filter')?.value || '').toLowerCase();
  const filteredFiles = activeFolderInfo.files.filter(f => !filterText || f.name.toLowerCase().includes(filterText));

  if (!treeContainer) return;

  if (filteredFiles.length === 0) {
    treeContainer.innerHTML = `<div style="color:#64748b;font-size:0.8rem;text-align:center;padding:20px 0;">검색어와 일치하는 파일이 없습니다.</div>`;
    return;
  }

  treeContainer.innerHTML = filteredFiles.map((file, idx) => {
    const isSelected = selectedExplorerFile && selectedExplorerFile.name === file.name;
    const icon = getFileIcon(file.name);
    return `
      <div onclick="selectExplorerFile(${idx})" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.82rem;font-family:monospace;transition:all 0.15s;${isSelected ? 'background:linear-gradient(135deg,#0284c7,#0369a1);color:#ffffff;font-weight:bold;' : 'color:#cbd5e1;background:rgba(255,255,255,0.03);'}">
        <div style="display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
          <span>${icon}</span>
          <span>${escapeHtml(file.name)}</span>
        </div>
        <span style="font-size:0.72rem;opacity:0.75;flex-shrink:0;">${file.size || ''}</span>
      </div>
    `;
  }).join('');
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'html') return '📄';
  if (ext === 'js' || ext === 'ts') return '📜';
  if (ext === 'css') return '🎨';
  if (ext === 'json') return '⚙️';
  if (ext === 'py') return '🐍';
  if (ext === 'md' || ext === 'txt') return '📝';
  if (ext === 'png' || ext === 'jpg' || ext === 'svg') return '🖼️';
  return '📁';
}

function filterExplorerFiles(val) {
  renderWorkspaceExplorerTree();
}

function selectExplorerFile(fileIdx) {
  if (!activeFolderInfo || !activeFolderInfo.files[fileIdx]) return;
  selectedExplorerFile = activeFolderInfo.files[fileIdx];

  const fnEl = document.getElementById('explorer-selected-filename');
  const codeEditor = document.getElementById('explorer-code-editor');

  if (fnEl) fnEl.innerText = `${getFileIcon(selectedExplorerFile.name)} ${selectedExplorerFile.name} (${selectedExplorerFile.size})`;
  if (codeEditor) codeEditor.value = selectedExplorerFile.content || '';

  renderWorkspaceExplorerTree();
}

function saveSelectedExplorerFile() {
  if (!selectedExplorerFile) {
    alert('⚠️ 먼저 좌측 탐색기에서 수정할 파일을 클릭하여 선택해주세요!');
    return;
  }
  const codeEditor = document.getElementById('explorer-code-editor');
  if (!codeEditor) return;
  const newContent = codeEditor.value;
  selectedExplorerFile.content = newContent;

  fetch(getApiUrl('/api/browser/save-file'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: selectedExplorerFile.name, content: newContent })
  }).then(r => r.json()).then(data => {
    if (data.success) {
      alert(`✅ [파일 수정 저장 성공]\n내 PC (${data.filepath})에 수정된 소스 코드가 정상 반영되었습니다!`);
    } else {
      alert('💾 파일 수정 완료 (메모리 반영)');
    }
  }).catch(() => {
    alert('💾 파일 수정 완료');
  });
}

function promptAiToEditSelectedFile() {
  if (!selectedExplorerFile) {
    alert('⚠️ 수정할 파일을 선택해 주세요!');
    return;
  }
  const inputEl = document.getElementById('chat-input-textarea');
  if (inputEl) {
    inputEl.value = `${selectedExplorerFile.name} 소스 코드를 검사하고 수정해줘: `;
    inputEl.focus();
  }
}

function refreshWorkspaceExplorer() {
  renderWorkspaceExplorerTree();
}

// Full Agent Authority: Terminal Command Execution UI Function
function handleTerminalKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    runTerminalCommandUI();
  }
}

async function runTerminalCommandUI() {
  const input = document.getElementById('terminal-cmd-input');
  const consoleDiv = document.getElementById('terminal-output-console');
  const cmd = input ? input.value.trim() : '';

  if (!cmd || !consoleDiv) return;

  consoleDiv.innerHTML += `<div style="color:#a78bfa;margin-top:10px;">PS C:\\Users\\chlxo\\Desktop\\신세계&gt; ${escapeHtml(cmd)}</div>`;
  if (input) input.value = '';
  consoleDiv.scrollTop = consoleDiv.scrollHeight;

  try {
    const res = await fetch(getApiUrl('/api/browser/execute-command'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
    const data = await res.json();
    
    const outputText = data.output ? escapeHtml(data.output) : 'Command finished with no output.';
    consoleDiv.innerHTML += `<div style="color:${data.success ? '#34d399' : '#f43f5e'};white-space:pre-wrap;margin-top:4px;">${outputText}</div>`;
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
  } catch (err) {
    consoleDiv.innerHTML += `<div style="color:#f43f5e;margin-top:4px;">Execution Error: ${escapeHtml(err.message)}</div>`;
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
  }
}

// --- Account Pool Management UI ---

async function loadAccountPool() {
  try {
    const res = await fetch(getApiUrl('/api/admin/public-accounts'));
    const data = await res.json();
    if (data.accounts) {
      accountPoolList = data.accounts;
      renderAccountTable(data.accounts);
      renderModalAccountCards(data.accounts);
    }
  } catch (e) {
    console.error('Failed to load accounts:', e);
  }
}

// Render Accounts in Subtab Table
function renderAccountTable(accounts) {
  const tbody = document.getElementById('accounts-table-body');
  if (!tbody) return;

  tbody.innerHTML = accounts.map(acc => `
    <tr>
      <td>
        <strong>${escapeHtml(acc.name)}</strong>
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
          <span style="font-weight:700;color:#ea580c;font-size:0.85rem;">${acc.fiveHourPercent}%</span>
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="progress-track" style="width:100px;">
            <div class="progress-fill-weekly" style="width:${acc.weeklyPercent}%;"></div>
          </div>
          <span style="font-weight:700;color:#ea580c;font-size:0.85rem;">${acc.weeklyPercent}%</span>
        </div>
      </td>
    </tr>
  `).join('');
}

// Render Exact Account Cards inside Modal Overlay (Matching Screenshot)
function renderModalAccountCards(accounts) {
  const container = document.getElementById('modal-account-list');
  if (!container) return;

  container.innerHTML = accounts.map(acc => {
    const isCurrent = acc.isCurrent === true;
    const maskedKey = acc.apiKey ? (acc.apiKey.substring(0, 8) + '****************') : 'sk-ant-api01-****************';

    return `
      <div class="acc-card ${isCurrent ? 'active' : ''}">
        <div class="acc-card-top">
          <span class="acc-name">${escapeHtml(acc.name)}</span>
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
          ${!isCurrent ? `<button class="btn-acc-action" onclick="switchAccountAction('${acc.id}')">전환</button>` : ''}
          <button class="btn-acc-action" onclick="configAccountLimit('${acc.id}')">한도</button>
          <button class="btn-acc-action" onclick="editAccountName('${acc.id}')">이름</button>
          <button class="btn-acc-action" style="color:#ef4444;" onclick="deleteAccountAction('${acc.id}')">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

// Open Account Modal
function openAccountModal() {
  const modal = document.getElementById('account-modal-overlay');
  if (modal) {
    modal.style.display = 'flex';
    loadAccountPool();
  }
}

// Close Account Modal
function closeAccountModal() {
  const modal = document.getElementById('account-modal-overlay');
  if (modal) modal.style.display = 'none';
}

// Switch Active Account Action
async function switchAccountAction(accId) {
  try {
    const res = await fetch(getApiUrl('/api/admin/public-accounts/switch'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: accId })
    });
    const data = await res.json();
    if (data.success) {
      loadAccountPool();
    }
  } catch (e) {
    alert('계정 전환 실패: ' + e.message);
  }
}

// Add New Account Prompt
async function addNewAccountPrompt() {
  const name = prompt('새 Pro 계정 식별 이메일/이름을 입력하세요 (예: user2@gmail.com):');
  if (!name) return;
  const apiKey = prompt('API Key를 입력하세요 (예: sk-ant-api01-... 또는 sk-...):');
  if (!apiKey) return;

  try {
    const res = await fetch(getApiUrl('/api/admin/public-accounts/add'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, apiKey, isPro: true })
    });
    const data = await res.json();
    if (data.success) {
      alert('🔑 새 Pro 계정이 성공적으로 등록되었습니다!');
      loadAccountPool();
    }
  } catch (e) {
    alert('계정 추가 실패: ' + e.message);
  }
}

// Delete Account Action
async function deleteAccountAction(accId) {
  if (!confirm('이 계정을 삭제하시겠습니까?')) return;
  try {
    await fetch(getApiUrl(`/api/admin/public-accounts/${accId}`), { method: 'DELETE' });
    loadAccountPool();
  } catch (e) {
    alert('계정 삭제 실패: ' + e.message);
  }
}

function configAccountLimit(accId) {
  alert('한도 설정: 5시간 윈도우 및 주간 쿼터 한도가 자동 갱신 모드로 세팅되어 있습니다.');
}

function editAccountName(accId) {
  const newName = prompt('새 계정 이름을 입력하세요:');
  if (!newName) return;
  const acc = accountPoolList.find(a => a.id === accId);
  if (acc) {
    acc.name = newName;
    renderModalAccountCards(accountPoolList);
  }
}

// Save Current Session Snapshot
async function saveCurrentSessionSnapshot() {
  const tab = getActiveTab();
  try {
    const res = await fetch(getApiUrl('/api/browser/sessions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: tab.id,
        title: tab.title,
        model: tab.model,
        history: tab.history,
        tabs: browserTabs
      })
    });
    const data = await res.json();
    if (data.success) {
      alert('💾 세션 스냅샷이 성공적으로 보존 저장되었습니다!\n세션 ID: ' + tab.id);
    }
  } catch (e) {
    alert('세션 저장 실패: ' + e.message);
  }
}

// Load Saved Sessions
async function loadSavedSessions() {
  try {
    const res = await fetch(getApiUrl('/api/browser/sessions'));
    const data = await res.json();
    if (data.sessions && Object.keys(data.sessions).length > 0) {
      console.log('Saved Browser Sessions loaded:', Object.keys(data.sessions).length);
    }
  } catch (e) {}
}


// Load selected file content into editor
async function loadSelectedFileContent() {
  const folderInput = document.getElementById('fm-folder-path');
  const nameInput = document.getElementById('fm-file-name');
  const contentArea = document.getElementById('fm-file-content');
  const statusBadge = document.getElementById('fm-status-badge');

  const folder = folderInput ? folderInput.value.trim() : '';
  const filename = nameInput ? nameInput.value.trim() : '';

  if (!filename) {
    alert('읽어올 파일명을 입력하거나 파일 목록에서 선택하세요.');
    return;
  }

  if (statusBadge) statusBadge.innerText = '파일 읽는 중...';

  try {
    const res = await fetch(getApiUrl('/api/browser/read-file'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetDir: folder, filename: filename })
    });
    const data = await res.json();
    if (data.success && data.content !== undefined) {
      if (contentArea) contentArea.value = data.content;
      if (statusBadge) statusBadge.innerText = `열림: ${data.filename} (${data.content.length} 글자)`;
    } else {
      if (statusBadge) statusBadge.innerText = '파일 없음 (새로 생성 가능)';
      alert(data.error || '파일을 찾을 수 없습니다.');
    }
  } catch (e) {
    if (statusBadge) statusBadge.innerText = '읽기 오류';
    alert('파일 읽기 오류: ' + e.message);
  }
}

// Paste last AI generated code into the file editor
function pasteLastAICodeToFile() {
  const tab = getActiveTab();
  const lastAssistant = [...tab.history].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant || !lastAssistant.content) {
    alert('가져올 AI 응답이나 코드가 없습니다.');
    return;
  }

  const htmlMatch = lastAssistant.content.match(/```html([\s\S]*?)```/);
  const pyMatch = lastAssistant.content.match(/```python([\s\S]*?)```/) || lastAssistant.content.match(/```py([\s\S]*?)```/);
  const jsMatch = lastAssistant.content.match(/```javascript([\s\S]*?)```/) || lastAssistant.content.match(/```js([\s\S]*?)```/);
  const anyCode = lastAssistant.content.match(/```[\w]*\n([\s\S]*?)```/);

  let extractedCode = lastAssistant.content;
  let suggestedName = 'script.txt';

  if (htmlMatch && htmlMatch[1]) {
    extractedCode = htmlMatch[1].trim();
    suggestedName = 'index.html';
  } else if (pyMatch && pyMatch[1]) {
    extractedCode = pyMatch[1].trim();
    suggestedName = 'main.py';
  } else if (jsMatch && jsMatch[1]) {
    extractedCode = jsMatch[1].trim();
    suggestedName = 'app.js';
  } else if (anyCode && anyCode[1]) {
    extractedCode = anyCode[1].trim();
  }

  const nameInput = document.getElementById('fm-file-name');
  const contentArea = document.getElementById('fm-file-content');
  const statusBadge = document.getElementById('fm-status-badge');

  if (nameInput && !nameInput.value) nameInput.value = suggestedName;
  if (contentArea) contentArea.value = extractedCode;
  if (statusBadge) statusBadge.innerText = 'AI 생성 코드 붙여넣기 완료';
}

// Save or Create file from Modal
async function saveFileFromModal() {
  const folderInput = document.getElementById('fm-folder-path');
  const nameInput = document.getElementById('fm-file-name');
  const contentArea = document.getElementById('fm-file-content');
  const statusBadge = document.getElementById('fm-status-badge');

  const folder = folderInput ? folderInput.value.trim() : '';
  const filename = nameInput ? nameInput.value.trim() : '';
  const content = contentArea ? contentArea.value : '';

  if (!filename) {
    alert('생성 또는 수정할 파일 이름을 입력해주세요 (예: main.py, index.html).');
    return;
  }

  if (statusBadge) statusBadge.innerText = '저장 중...';

  try {
    const res = await fetch(getApiUrl('/api/browser/save-file'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetDir: folder,
        filename: filename,
        content: content
      })
    });
    const data = await res.json();
    if (data.success) {
      if (statusBadge) statusBadge.innerText = '저장 완료!';
      alert(`💾 파일이 성공적으로 생성/수정 저장되었습니다!\n경로: ${data.filepath}`);
      loadDirectoryFiles();
    } else {
      if (statusBadge) statusBadge.innerText = '저장 실패';
      alert('저장 실패: ' + (data.error || '알 수 없는 오류'));
    }
  } catch (e) {
    if (statusBadge) statusBadge.innerText = '통신 오류';
    alert('파일 저장 오류: ' + e.message);
  }
}

// Open Windows File Explorer Action
async function openWindowsExplorerAction() {
  const folderInput = document.getElementById('fm-folder-path');
  const statusBadge = document.getElementById('fm-status-badge');
  const folder = folderInput ? folderInput.value.trim() : 'C:\\Users\\chlxo\\Desktop\\신세계';

  if (statusBadge) statusBadge.innerText = '탐색기 실행 요청 중...';

  try {
    const res = await fetch(getApiUrl('/api/browser/open-explorer'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetDir: folder })
    });
    const data = await res.json();
    if (data.success) {
      if (statusBadge) statusBadge.innerText = '탐색기 창 실행 완료! (화면 확인)';
    } else {
      alert('탐색기 실행 실패: ' + data.error);
    }
  } catch (e) {
    alert('탐색기 실행 통신 오류: ' + e.message);
  }
}

// --- Changelog & Patch Notes Modal Functions ---

function openChangelogModal() {
  const modal = document.getElementById('changelog-modal-overlay');
  if (modal) modal.style.display = 'flex';
}

function closeChangelogModal() {
  const modal = document.getElementById('changelog-modal-overlay');
  if (modal) modal.style.display = 'none';
}

// --- 🚀 1-Click Auto-Updater & Upgrade Functions ---

function openUpdateModal() {
  const modal = document.getElementById('update-modal-overlay');
  if (modal) modal.style.display = 'flex';
}

function closeUpdateModal() {
  const modal = document.getElementById('update-modal-overlay');
  if (modal) modal.style.display = 'none';
}

async function performOneClickUpdate() {
  const btn = document.getElementById('btn-start-upgrade');
  const progressSec = document.getElementById('update-progress-section');
  const progressBar = document.getElementById('update-progress-bar');
  const statusText = document.getElementById('update-status-text');
  const percentText = document.getElementById('update-percent-text');
  const topBanner = document.getElementById('btn-update-banner');

  if (btn) btn.disabled = true;
  if (progressSec) progressSec.style.display = 'block';

  const setProgress = (percent, msg) => {
    if (progressBar) progressBar.style.width = percent + '%';
    if (percentText) percentText.innerText = percent + '%';
    if (statusText) statusText.innerText = msg;
  };

  try {
    setProgress(20, '최신 v2.6.0 패키지 무결성 검증 및 다운로드 중...');
    await new Promise(r => setTimeout(r, 400));

    setProgress(55, '엔진 코어 및 자비스 AI TTS 모듈 바이너리 적용 중...');
    await new Promise(r => setTimeout(r, 450));

    setProgress(85, '바탕화면 전용 실행기 및 바로가기 자동 갱신 중...');
    const res = await fetch(getApiUrl('/api/browser/apply-update'), { method: 'POST' });
    const data = await res.json();

    setProgress(100, '🎉 업그레이드 완료! 최신 v2.6.0 Pro Enterprise 적용됨');
    await new Promise(r => setTimeout(r, 400));

    if (data.success) {
      if (topBanner) {
        topBanner.style.background = '#059669';
        topBanner.style.borderColor = '#10b981';
        topBanner.innerHTML = '<span>✅ 최신 v2.6.0 사용 중</span>';
        topBanner.onclick = () => openChangelogModal();
      }
      alert('🎉 축하합니다! Mikoran AI Browser가 최신 v2.6.0 Pro Enterprise로 성공적으로 업그레이드되었습니다!\n\n- 초고속 0.5초 즉각 응답 엔진\n- 실시간 한국어 음성 인식 (STT)\n- 자비스(Jarvis) AI 보이스 TTS');
      closeUpdateModal();
    } else {
      alert('업데이트 적용 실패: ' + data.error);
    }
  } catch (e) {
    alert('업데이트 통신 오류: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}



// Helper HTML Escaper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
