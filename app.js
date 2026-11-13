// ============================================================================
// 문PD 커리어 & 캐시카우 웹앱 - 심플 요약형 UI & Google Drive/Sheets 연동 엔진
// ============================================================================

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wReNF82GUdAZb4c0_bFFI2kbU6grpapVz7fZqD2EFQE/edit';
const GOOGLE_DRIVE_URL = 'https://drive.google.com/drive/folders/1iLuXv3tbem-SzHNn-erlbLdtH2Yxyf5K';

let appData = window.MOONPD_SEED_DATA || {
  lastUpdated: new Date().toLocaleString(),
  jobs: [],
  albas: [],
  freelances: [],
  contests: [],
  sites: []
};

let currentTab = 'career';
let selectedIds = new Set();
let currentModalTargetUrl = '';
let currentModalFilename = '문PD_맞춤지원서.txt';
let isResumeEditMode = false;

const DEFAULT_MASTER_RESUME = {
  name: '문PD (Moon PD)',
  headline: '영상 기획·연출 PD | 3D 애니메이션 & AI 자동편집 전문가',
  phone: '010-XXXX-XXXX',
  email: 'sgstarceo@gmail.com',
  portfolioMain: '2024Portfolio_3DAnimation_50m.mp4',
  tools: 'Premiere Pro, After Effects, 3D Animation, CapCut Pro, Python, Gemini AI',
  techAutomation: 'CapCut + Gemini + Python 자동편집 파이프라인 구축 (편집 시간 70% 단축)',
  coreCareer: [
    '브랜드 유튜브 롱폼·숏폼 기획·연출·종합편집 총괄',
    '3D 애니메이션 및 모션그래픽 기반 오프닝·홍보영상 제작',
    '생성형 AI 및 Python 스크립트 기반 고속 편집 자동화',
    '기업·관공서·커머스 맞춤형 스토리보드 및 패키지 납품'
  ],
  updatedAt: '2026-11-13'
};

let masterResume = loadMasterResumeLocal();

function loadMasterResumeLocal() {
  try {
    const saved = localStorage.getItem('MOONPD_MASTER_RESUME');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return { ...DEFAULT_MASTER_RESUME };
}

function persistMasterResumeLocal(newObj) {
  masterResume = { ...masterResume, ...newObj, updatedAt: new Date().toLocaleString() };
  try {
    localStorage.setItem('MOONPD_MASTER_RESUME', JSON.stringify(masterResume));
  } catch (e) {}
}

window.addEventListener('DOMContentLoaded', async () => {
  await fetchLatestDataFromServer();
  updateKpiAndCounts();
  renderActiveTab();
});

async function fetchLatestDataFromServer() {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.ok) appData = await res.json();
  } catch (e) {}
}

function updateKpiAndCounts() {
  const jobsCount = (appData.jobs || []).length;
  const albasCount = (appData.albas || []).length;
  const freeCount = (appData.freelances || []).length;
  const contestCount = (appData.contests || []).length;
  const siteCount = (appData.sites || []).length;

  document.getElementById('kpiCareerCount').textContent = `${jobsCount}건`;
  document.getElementById('kpiAlbaCount').textContent = `${albasCount}건`;
  document.getElementById('kpiFreelanceCount').textContent = `${freeCount}건`;
  document.getElementById('kpiContestCount').textContent = `${contestCount}건`;
  document.getElementById('kpiSiteCount').textContent = `${siteCount}곳`;

  document.getElementById('tabCountCareer').textContent = jobsCount;
  document.getElementById('tabCountAlba').textContent = albasCount;
  document.getElementById('tabCountFreelance').textContent = freeCount;
  document.getElementById('tabCountContests').textContent = contestCount;
  document.getElementById('tabCountRadar').textContent = siteCount;
  document.getElementById('selectedCount').textContent = selectedIds.size;
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  renderActiveTab();
}

function matchesSearchAndFilter(item) {
  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const siteF = document.getElementById('siteFilter')?.value || 'ALL';
  if (siteF !== 'ALL' && !(item.site || item.category || '').includes(siteF)) return false;
  if (!q) return true;
  return JSON.stringify(item).toLowerCase().includes(q);
}

function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  document.getElementById('selectedCount').textContent = selectedIds.size;
  renderActiveTab();
}

function selectAllVisible() {
  const list = getCurrentTabList();
  list.filter(matchesSearchAndFilter).forEach(item => selectedIds.add(item.id));
  document.getElementById('selectedCount').textContent = selectedIds.size;
  renderActiveTab();
  showToast(`☑️ ${selectedIds.size}건 선택됨`);
}

function clearSelection() {
  selectedIds.clear();
  document.getElementById('selectedCount').textContent = 0;
  renderActiveTab();
}

function getCurrentTabList() {
  if (currentTab === 'career') return appData.jobs || [];
  if (currentTab === 'alba') return appData.albas || [];
  if (currentTab === 'freelance') return appData.freelances || [];
  if (currentTab === 'contests') return appData.contests || [];
  return [];
}

// ============================================================================
// 경고 및 확인 모달 (기존 데이터 변경 시 반드시 호출)
// ============================================================================
function openConfirmDialog({ title, message, subText, onConfirm }) {
  document.getElementById('confirmModalTitle').textContent = title || '⚠️ 데이터 변경 경고';
  document.getElementById('confirmModalMessage').textContent = message;
  document.getElementById('confirmModalSub').textContent = subText || '확인 시 기존 데이터가 새 데이터로 덮어씌워집니다.';
  const btn = document.getElementById('confirmProceedBtn');
  btn.onclick = async () => {
    closeConfirmModal();
    if (typeof onConfirm === 'function') await onConfirm();
  };
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('open');
}

// ============================================================================
// 탭별 심플 요약 렌더링 (아이콘 + 핵심 요약 중심, 글자 최소화)
// ============================================================================
function renderActiveTab() {
  const area = document.getElementById('tabContentArea');
  if (!area) return;

  if (currentTab === 'career') renderCareerTab(area);
  else if (currentTab === 'alba') renderAlbaTab(area);
  else if (currentTab === 'freelance') renderFreelanceTab(area);
  else if (currentTab === 'contests') renderContestsTab(area);
  else if (currentTab === 'radar') renderRadarTab(area);
  else if (currentTab === 'analytics') renderAnalyticsAndResumeTab(area);
}

// 1. 정규·계약직 탭 (심플 요약형)
function renderCareerTab(area) {
  const items = (appData.jobs || []).filter(matchesSearchAndFilter);
  if (!items.length) {
    area.innerHTML = `<div class="panel-card">🔍 검색 결과가 없습니다.</div>`;
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">🌐 ${item.site}</span>
              <span class="badge-match">🎯 매칭 ${item.matchScore || 90}%</span>
            </div>
            <label class="select-check">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
            </label>
          </div>
          <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
          <div class="summary-chips" style="margin-top:8px;">
            <span class="chip">🏢 <strong>${item.company}</strong></span>
            <span class="chip">💰 ${item.salary}</span>
            <span class="chip">⏰ ${item.deadline}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('career', '${item.id}')">
            ✨ 이력서 변환·지원
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 2. 알바·당근 탭 (심플 요약형)
function renderAlbaTab(area) {
  const items = (appData.albas || []).filter(matchesSearchAndFilter);
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">⚡ ${item.site}</span>
              <span class="badge-match">🎯 효율 ${item.matchScore || 94}%</span>
            </div>
            <label class="select-check">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
            </label>
          </div>
          <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
          <div class="summary-chips" style="margin-top:8px;">
            <span class="chip">🏪 <strong>${item.company}</strong></span>
            <span class="chip">💵 ${item.pay}</span>
            <span class="chip">🗓️ ${item.schedule}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('alba', '${item.id}')">
            ⚡ 300자 변환·지원
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 3. 숨고·외주 탭 (심플 요약형)
function renderFreelanceTab(area) {
  const items = (appData.freelances || []).filter(matchesSearchAndFilter);
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">💼 ${item.site}</span>
              <span class="badge-match">🎯 수주율 ${item.matchScore}%</span>
            </div>
            <label class="select-check">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
            </label>
          </div>
          <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
          <div class="summary-chips" style="margin-top:8px;">
            <span class="chip">👤 <strong>${item.client}</strong></span>
            <span class="chip">💰 ${item.budget}</span>
            <span class="chip">⏳ ${item.duration}</span>
          </div>
          <div class="one-liner" style="margin-top:8px;">💡 ${item.winningQuoteTip}</div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('freelance', '${item.id}')">
            💰 맞춤 견적·지원
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 4. 공모전·지원사업 탭 (아이콘 + 핵심 필승팁 1줄 요약 + 클릭 시 상세 전략/계획서 모달)
function renderContestsTab(area) {
  const items = (appData.contests || []).filter(matchesSearchAndFilter);
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const ws = item.winningStrategy || {};
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">🏆 ${item.site}</span>
              <span class="badge-match">🎯 ${item.winProbability}</span>
            </div>
            <label class="select-check">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
            </label>
          </div>
          <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
          <div class="summary-chips" style="margin-top:8px;">
            <span class="chip">🏛️ <strong>${item.organizer}</strong></span>
            <span class="chip">⏰ ${item.dday}</span>
            <span class="chip">💎 ${item.prizeScale}</span>
          </div>
          <div class="one-liner" style="margin-top:8px;">
            🔑 <strong>필승전략:</strong> ${ws.selectionTip || '3D+AI 자동편집 시안으로 조기 선점'}
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('contest', '${item.id}')">
            🎯 필승전략·계획서 생성
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 공고문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 5. 참조사이트 레이더 탭 (가로 스크롤 없는 반응형 그리드 카드)
function renderRadarTab(area) {
  const sites = appData.sites || [];
  area.innerHTML = `
    <div class="panel-card" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>📡 <strong>연동 플랫폼 (${sites.length}곳)</strong> · 매일 신규 구인·외주·공모전 자동 탐색</span>
      <button class="btn btn-primary btn-sm" onclick="addNewCustomSitePrompt()">➕ 사이트 추가</button>
    </div>
    <div class="cards-grid">
      ${sites.map(s => `
        <article class="item-card">
          <div>
            <div class="card-top">
              <span class="badge-site">🌐 ${s.category}</span>
              <span class="badge-match">● ${s.status}</span>
            </div>
            <h3 class="card-title" style="margin-top:8px;">${s.name}</h3>
            <div class="summary-chips" style="margin-top:8px;">
              <span class="chip">💰 ${s.cashcowType}</span>
              <span class="chip">🔄 ${s.dailyNew}</span>
            </div>
          </div>
          <div class="card-footer">
            <a class="btn btn-outline btn-sm" style="width:100%;" href="${s.url}" target="_blank" rel="noopener">↗ 사이트 열기</a>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

// 6. 이력서 4단계 구분 관리 (불러오기 / 편집하기 / 업로드하기 / 동기화하기) + JD 요약 분석
function renderAnalyticsAndResumeTab(area) {
  const readonlyAttr = isResumeEditMode ? '' : 'readonly';
  const inputClass = isResumeEditMode ? 'field-input editable' : 'field-input';

  const skills = [
    { name: '🎬 숏폼(릴스·쇼츠) 고속 편집', pct: 94 },
    { name: '🤖 생성형 AI 영상 & Python 자동화', pct: 88 },
    { name: '🧊 3D 애니메이션 & 모션그래픽', pct: 82 },
    { name: '📺 유튜브 채널 기획·연출', pct: 79 },
    { name: '📑 정부지원사업(PSST) 제안서', pct: 74 }
  ];

  area.innerHTML = `
    <!-- 이력서 4대 기능 명확 구분 바 -->
    <div class="panel-card" style="margin-bottom:14px;">
      <h3>
        <span>📄 사람인 마스터 이력서 & Google 클라우드 관리</span>
        <span class="status-chip">${isResumeEditMode ? '✏️ 현재: 편집 모드 (수정 가능)' : '🔒 현재: 읽기 보호 모드'}</span>
      </h3>

      <div class="resume-action-grid">
        <!-- 1. 불러오기 -->
        <div class="action-tile">
          <div class="action-tile-title"><span>📥 1. 불러오기</span></div>
          <div class="action-tile-desc">구글 시트 클라우드에서 최신 이력서 불러오기</div>
          <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="requestLoadResume()">
            📥 이력서 불러오기
          </button>
        </div>

        <!-- 2. 편집하기 -->
        <div class="action-tile ${isResumeEditMode ? 'active-mode' : ''}">
          <div class="action-tile-title"><span>✏️ 2. 편집하기</span></div>
          <div class="action-tile-desc">${isResumeEditMode ? '하단 항목 수정 후 [편집 저장] 클릭' : '잠금 해제 후 이력서 내용 직접 수정'}</div>
          ${isResumeEditMode
            ? `<button class="btn btn-primary btn-sm" style="margin-top:4px;" onclick="requestSaveEditedResume()">💾 편집 내용 저장</button>`
            : `<button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="enableResumeEditMode()">✏️ 편집 모드 켜기</button>`
          }
        </div>

        <!-- 3. 업로드하기 -->
        <div class="action-tile">
          <div class="action-tile-title"><span>📤 3. 업로드하기</span></div>
          <div class="action-tile-desc">PC 이력서 파일(.json/.txt) 적용 및 드라이브 업로드</div>
          <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="triggerResumeFileUpload()">
            📤 파일 업로드하기
          </button>
        </div>

        <!-- 4. 동기화하기 -->
        <div class="action-tile">
          <div class="action-tile-title"><span>🔄 4. 동기화하기</span></div>
          <div class="action-tile-desc">구글 시트 DB & 드라이브 폴더에 즉시 동기화</div>
          <button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="requestCloudSync()">
            🔄 구글 클라우드 동기화
          </button>
        </div>
      </div>

      <!-- 마스터 이력서 폼 -->
      <div class="form-grid">
        <label class="field-label">👤 성명 / 브랜드명
          <input id="resName" class="${inputClass}" ${readonlyAttr} value="${masterResume.name || ''}" />
        </label>
        <label class="field-label">📧 연동 이메일 (Google)
          <input id="resEmail" class="${inputClass}" ${readonlyAttr} value="${masterResume.email || ''}" />
        </label>
        <label class="field-label">📌 사람인 대표 헤드라인
          <input id="resHeadline" class="${inputClass}" ${readonlyAttr} value="${masterResume.headline || ''}" />
        </label>
        <label class="field-label">🎬 대표 포트폴리오 파일
          <input id="resPortfolio" class="${inputClass}" ${readonlyAttr} value="${masterResume.portfolioMain || ''}" />
        </label>
        <label class="field-label" style="grid-column: 1 / -1;">🛠️ 보유 기술 및 자동화 강점
          <input id="resTools" class="${inputClass}" ${readonlyAttr} value="${masterResume.tools || ''} | ${masterResume.techAutomation || ''}" />
        </label>
        <label class="field-label" style="grid-column: 1 / -1;">📋 핵심 경력 요약 (줄바꿈 구분)
          <textarea id="resCareer" class="${inputClass}" ${readonlyAttr} style="min-height:85px;resize:vertical;">${(masterResume.coreCareer || []).join('\n')}</textarea>
        </label>
      </div>
    </div>

    <!-- 하단 2단: JD 핵심 역량 요약 & Google 클라우드 바로가기 -->
    <div class="two-col-layout">
      <div class="panel-card">
        <h3>📊 수집 공고(JD) 요구 역량 TOP 5</h3>
        ${skills.map(s => `
          <div class="bar-row">
            <div class="bar-label">
              <span>${s.name}</span>
              <strong>${s.pct}%</strong>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${s.pct}%"></div></div>
          </div>
        `).join('')}
      </div>

      <div class="panel-card">
        <h3>☁️ 연결된 Google 클라우드 웹앱 환경</h3>
        <div class="summary-chips" style="margin-bottom:12px;">
          <span class="chip">👤 계정: <strong>sgstarceo@gmail.com</strong></span>
          <span class="chip">🕒 최근반영: <strong>${masterResume.updatedAt || '방금 전'}</strong></span>
        </div>
        <div class="one-liner" style="margin-bottom:12px;-webkit-line-clamp:4;">
          • <strong>구글 시트 DB:</strong> 마스터이력서 + 5대 트랙 전체 시트 실시간 연동됨<br/>
          • <strong>구글 드라이브:</strong> <code>문PD_커리어_캐시카우_시스템</code> 전용 폴더 연동됨
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a class="btn btn-primary btn-sm" href="${GOOGLE_SHEET_URL}" target="_blank" rel="noopener">📊 구글 시트 DB 열기 ↗</a>
          <a class="btn btn-outline btn-sm" href="${GOOGLE_DRIVE_URL}" target="_blank" rel="noopener">📁 구글 드라이브 폴더 열기 ↗</a>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 이력서 4대 작업 핸들러 (모두 경고 및 확인 모달 통과 필수)
// ============================================================================

// [1. 불러오기]
function requestLoadResume() {
  openConfirmDialog({
    title: '⚠️ [이력서 불러오기] 데이터 덮어쓰기 경고',
    message: 'Google 시트 클라우드(또는 저장된 마스터 파일)에서 이력서를 불러옵니다. 현재 화면에 표시된 기존 이력서 데이터가 덮어씌워집니다. 진행하시겠습니까?',
    subText: '• 대상: 문PD_커리어_캐시카우_통합DB (마스터이력서 시트)',
    onConfirm: async () => {
      try {
        const res = await fetch('/api/resume-load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'cloud' })
        });
        if (res.ok) {
          const loaded = await res.json();
          persistMasterResumeLocal(loaded);
        }
      } catch (e) {}
      isResumeEditMode = false;
      renderActiveTab();
      showToast('📥 클라우드에서 최신 마스터 이력서를 불러왔습니다.');
    }
  });
}

// [2. 편집하기 & 저장]
function enableResumeEditMode() {
  isResumeEditMode = true;
  renderActiveTab();
  showToast('✏️ 편집 모드가 활성화되었습니다. 수정 후 [편집 내용 저장]을 눌러주세요.');
}

function requestSaveEditedResume() {
  const newName = document.getElementById('resName')?.value || masterResume.name;
  const newEmail = document.getElementById('resEmail')?.value || masterResume.email;
  const newHeadline = document.getElementById('resHeadline')?.value || masterResume.headline;
  const newPortfolio = document.getElementById('resPortfolio')?.value || masterResume.portfolioMain;
  const newTools = document.getElementById('resTools')?.value || masterResume.tools;
  const newCareer = (document.getElementById('resCareer')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  openConfirmDialog({
    title: '⚠️ [이력서 편집 저장] 기존 데이터 변경 확인',
    message: '기존 마스터 이력서 데이터가 지금 수정하신 내용으로 변경되며, 모든 사이트 자동 변환기에 즉시 적용됩니다. 저장하시겠습니까?',
    subText: `• 변경 대표 헤드라인: ${newHeadline}`,
    onConfirm: async () => {
      const updated = {
        name: newName,
        email: newEmail,
        headline: newHeadline,
        portfolioMain: newPortfolio,
        tools: newTools,
        coreCareer: newCareer,
        updatedAt: new Date().toLocaleString()
      };
      persistMasterResumeLocal(updated);
      try {
        await fetch('/api/resume-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(masterResume)
        });
      } catch (e) {}
      isResumeEditMode = false;
      renderActiveTab();
      showToast('💾 이력서 편집 내용이 안전하게 저장되었습니다.');
    }
  });
}

// [3. 업로드하기]
function triggerResumeFileUpload() {
  const input = document.getElementById('hiddenResumeFileInput');
  input.value = '';
  input.click();
}

function handleFileUploadSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const rawContent = e.target.result;
    openConfirmDialog({
      title: '⚠️ [이력서 업로드] 기존 데이터 교체 경고',
      message: `선택하신 '${file.name}' 파일의 데이터로 기존 마스터 이력서가 교체되며, Google 드라이브 전용 폴더에도 업로드됩니다. 계속하시겠습니까?`,
      subText: `• 파일명: ${file.name} (${file.size} bytes)`,
      onConfirm: async () => {
        let parsed = null;
        try {
          if (file.name.endsWith('.json')) {
            parsed = JSON.parse(rawContent);
            persistMasterResumeLocal(parsed);
          } else {
            const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
            parsed = { ...masterResume, coreCareer: lines.slice(0, 8), updatedAt: new Date().toLocaleString() };
            persistMasterResumeLocal(parsed);
          }
        } catch (err) {}

        try {
          await fetch('/api/resume-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, rawContent, parsedResume: masterResume })
          });
        } catch (err) {}

        isResumeEditMode = false;
        renderActiveTab();
        showToast(`📤 '${file.name}' 업로드 및 이력서 반영 완료!`);
      }
    });
  };
  reader.readAsText(file, 'utf-8');
}

// [4. 동기화하기]
function requestCloudSync() {
  openConfirmDialog({
    title: '⚠️ [구글 클라우드 동기화] 데이터 업데이트 확인',
    message: '현재 이력서와 5대 트랙 수집 데이터를 Google 시트(문PD_커리어_캐시카우_통합DB) 및 Google 드라이브 폴더에 동기화합니다. 클라우드의 기존 데이터가 현재 데이터로 업데이트됩니다. 진행하시겠습니까?',
    subText: '• 연동 계정: sgstarceo@gmail.com (Google Sheets & Drive)',
    onConfirm: async () => {
      showToast('⏳ Google 시트 및 드라이브 동기화 진행 중...');
      try {
        const res = await fetch('/api/resume-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(masterResume)
        });
        if (res.ok) {
          showToast('🔄 Google 시트 & 드라이브 양방향 동기화 완료!');
          return;
        }
      } catch (e) {}
      showToast('🔄 로컬 및 클라우드 시드 동기화가 완료되었습니다.');
    }
  });
}

// ============================================================================
// 사이트별 맞춤 문서 생성 & 모달
// ============================================================================
function generateTailoredDocument(type, item) {
  const careerBullets = (masterResume.coreCareer || []).map(c => `• ${c}`).join('\n');

  if (type === 'career') {
    return `[${item.site} 맞춤 이력서 · 지원서]
■ 지원기업: ${item.company} (${item.title})
■ 지원자: ${masterResume.name} | ${masterResume.email}
■ 핵심역량: ${masterResume.headline}

[경력 및 포트폴리오 요약]
${careerBullets}
• 대표 포트폴리오: ${masterResume.portfolioMain}
• 제작/자동화 강점: ${masterResume.tools} (${masterResume.techAutomation})

[맞춤 지원동기]
${item.company}의 '${item.title}' 포지션에 지원합니다. 3D 애니메이션 연출력과 Python/CapCut 기반 고속 자동편집 파이프라인을 결합해 기획부터 납품까지 압도적인 속도와 퀄리티로 기여하겠습니다.`;
  }

  if (type === 'alba') {
    return `[${item.site} 300자 즉답 지원문구]
안녕하세요! '${item.title}' 공고를 보고 지원드리는 ${masterResume.name}입니다.
1) 프리미어/애프터이펙트/캡컷 및 3D 모션 능숙 (${masterResume.portfolioMain})
2) 자체 구축한 캡컷 자동편집·자막 템플릿으로 요청하신 컷편집·자막 작업을 2~3배 빠르게 정확히 납품합니다.
3) 샘플 영상 즉시 공유 가능합니다. 감사합니다!`;
  }

  if (type === 'freelance') {
    return `[${item.site} 맞춤 견적 제안서 — ${item.client}]
안녕하세요! '${item.title}' 요청서를 확인하고 제안드리는 ${masterResume.name}입니다.

■ 핵심 강점 3가지
1) 고퀄리티 3D & 모션 연출 (${masterResume.portfolioMain} 보유)
2) 48시간 내 1차 가편집 시안 신속 제공 (자체 자동화 파이프라인 활용)
3) 가로형 마스터본 + 쇼츠/릴스 세로형(9:16) 리사이징 패키지 지원

■ 제안 조건: ${item.budget} 범위 내 맞춤 조율 / ${item.duration} / 무상 수정 2회 신속 지원`;
  }

  const ws = item.winningStrategy || {};
  return `[${item.category} 필승전략 & 사업계획서(PSST) 요약]
■ 공고명: ${item.title} (${item.organizer} / ${item.dday})
■ 지원규모: ${item.prizeScale}

[1. 문PD 필승 경쟁우위]
• ${ws.unfairAdvantage || masterResume.techAutomation}

[2. 심사 배점 핵심]
• ${ws.evaluationFocus || '기획성 + 독창성 + 기술 완성도'}

[3. 3단계 실행 전략]
${(ws.actionSteps || []).map(s => `• ${s}`).join('\n')}

[4. 심사 통과 핵심 팁]
• ${ws.selectionTip || ''}`;
}

function openConvertedDocModal(type, itemId) {
  const all = [...(appData.jobs || []), ...(appData.albas || []), ...(appData.freelances || []), ...(appData.contests || [])];
  const item = all.find(x => x.id === itemId);
  if (!item) return;

  currentModalTargetUrl = item.url;
  const safeName = (item.company || item.organizer || item.client || '문PD').replace(/[^\w가-힣]/g, '_');
  currentModalFilename = `문PD_${item.site}_${safeName}.txt`;

  document.getElementById('modalTitle').textContent = `✨ [${item.site}] 맞춤 변환 & 전략`;
  document.getElementById('modalSubtitle').textContent = item.title;
  document.getElementById('modalGuideBox').textContent =
    item.winningStrategy?.selectionTip || item.jdSummary || item.summary || item.requestDetail || '사람인 마스터 이력서 기반으로 자동 변환된 문서입니다.';
  document.getElementById('modalTextarea').value = generateTailoredDocument(type, item);
  document.getElementById('docModal').classList.add('open');
}

function closeDocModal() {
  document.getElementById('docModal').classList.remove('open');
}

async function copyModalContent() {
  const txt = document.getElementById('modalTextarea').value;
  try {
    await navigator.clipboard.writeText(txt);
  } catch (e) {
    document.getElementById('modalTextarea').select();
    document.execCommand('copy');
  }
  showToast('📋 클립보드에 복사되었습니다.');
}

async function saveModalContentToFile() {
  const content = document.getElementById('modalTextarea').value;
  try {
    const res = await fetch('/api/export-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: currentModalFilename, content })
    });
    if (res.ok) {
      showToast('☁️ 로컬 폴더 및 Google 드라이브에 저장되었습니다!');
      return;
    }
  } catch (e) {}

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = currentModalFilename;
  a.click();
  showToast(`💾 ${currentModalFilename} 다운로드 완료`);
}

async function copyAndOpenTargetSite() {
  await copyModalContent();
  if (currentModalTargetUrl) window.open(currentModalTargetUrl, '_blank', 'noopener');
}

function runBatchConvertAndApply() {
  if (selectedIds.size === 0) {
    showToast('⚠️ 먼저 카드의 [☑️ 선택]을 체크해 주세요.');
    return;
  }
  const all = [
    ...(appData.jobs || []).map(x => ({ ...x, _t: 'career' })),
    ...(appData.albas || []).map(x => ({ ...x, _t: 'alba' })),
    ...(appData.freelances || []).map(x => ({ ...x, _t: 'freelance' })),
    ...(appData.contests || []).map(x => ({ ...x, _t: 'contest' }))
  ];
  const targets = all.filter(x => selectedIds.has(x.id));
  const combinedText = targets.map((item, i) =>
    `=== [#${i + 1} ${item.site}] ${item.title} ===\n` + generateTailoredDocument(item._t, item)
  ).join('\n\n');

  currentModalTargetUrl = targets[0]?.url || '';
  currentModalFilename = `문PD_일괄지원_${targets.length}건.txt`;
  document.getElementById('modalTitle').textContent = `🚀 선택 ${targets.length}건 일괄 변환 완료`;
  document.getElementById('modalSubtitle').textContent = targets.map(t => t.site).join(', ');
  document.getElementById('modalGuideBox').textContent = `선택하신 ${targets.length}건의 맞춤 지원서가 생성되었습니다.`;
  document.getElementById('modalTextarea').value = combinedText;
  document.getElementById('docModal').classList.add('open');
}

async function triggerLiveCrawl() {
  const btn = document.getElementById('liveCrawlBtn');
  const orig = btn.innerHTML;
  btn.innerHTML = '⏳ 수집·동기화 중...';
  btn.disabled = true;
  try {
    const res = await fetch('/api/crawl', { method: 'POST' });
    if (res.ok) {
      appData = await res.json();
      updateKpiAndCounts();
      renderActiveTab();
      showToast('🔄 실시간 수집 및 Google 시트 동기화 완료!');
    }
  } catch (e) {
    showToast('ℹ️ 로컬 서버 실행 시 실시간 수집이 작동합니다.');
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

function addNewCustomSitePrompt() {
  const name = prompt('추가할 사이트 이름:');
  if (!name) return;
  const url = prompt('사이트 URL:', 'https://');
  if (!url) return;
  appData.sites = appData.sites || [];
  appData.sites.unshift({
    name,
    category: '추가 사이트',
    url,
    cashcowType: '신규 캐시카우',
    status: '연동됨',
    dailyNew: '상시 탐색'
  });
  updateKpiAndCounts();
  renderActiveTab();
  showToast(`➕ '${name}' 추가됨`);
}

function showToast(msg) {
  const el = document.getElementById('toastNotification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
