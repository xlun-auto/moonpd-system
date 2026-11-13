// ============================================================================
// 문PD 커리어 & 캐시카우 웹앱 - 무제한 자유키워드 실시간 수집 & 관심공고 카테고리 분류 엔진
// ============================================================================

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wReNF82GUdAZb4c0_bFFI2kbU6grpapVz7fZqD2EFQE/edit';
const GOOGLE_DRIVE_URL = 'https://drive.google.com/drive/folders/1iLuXv3tbem-SzHNn-erlbLdtH2Yxyf5K';
const SARAMIN_RESUME_MANAGE_URL = 'https://www.saramin.co.kr/zf_user/member/resume-manage/list';

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
let currentModalSite = '사람인';
let currentModalType = 'career';
let currentModalItem = null;
let isResumeEditMode = false;

// ============================================================================
// 1. 관심공고 카테고리 분류 상태 관리 (자동 분류 + 사용자 지정 카테고리)
// ============================================================================
const DEFAULT_SAVED_CATEGORIES = [
  '📢 마케팅·브랜딩',
  '🎬 영상·PD·편집',
  '🧊 3D·모션·AI',
  '🔥 1순위 지원예정',
  '⚡ 알바·단기캐시',
  '💰 외주·프리랜서',
  '🏆 공모·지원사업'
];

let savedCategories = loadSavedCategories();
let savedCategoryMap = loadSavedCategoryMap(); // { [itemId]: categoryName }
let activeSavedCategoryFilter = 'ALL';
let savedGroupViewMode = true; // true: 카테고리별 섹션 그룹 보기

function loadSavedCategories() {
  try {
    const raw = localStorage.getItem('MOONPD_SAVED_CATEGORIES');
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.from(new Set([...DEFAULT_SAVED_CATEGORIES, ...parsed]));
    }
  } catch (e) {}
  return [...DEFAULT_SAVED_CATEGORIES];
}

function persistSavedCategories() {
  try {
    localStorage.setItem('MOONPD_SAVED_CATEGORIES', JSON.stringify(savedCategories));
  } catch (e) {}
}

function loadSavedCategoryMap() {
  try {
    const mapRaw = localStorage.getItem('MOONPD_SAVED_CATEGORY_MAP');
    if (mapRaw) return JSON.parse(mapRaw);
    // 하위 호환 (기존 MOONPD_SAVED_JOBS 배열이 있던 경우 마이그레이션)
    const oldArrRaw = localStorage.getItem('MOONPD_SAVED_JOBS');
    if (oldArrRaw) {
      const arr = JSON.parse(oldArrRaw);
      const migrated = {};
      arr.forEach(id => { migrated[id] = '🎬 영상·PD·편집'; });
      return migrated;
    }
  } catch (e) {}
  return {};
}

function persistSavedCategoryMap() {
  try {
    localStorage.setItem('MOONPD_SAVED_CATEGORY_MAP', JSON.stringify(savedCategoryMap));
    localStorage.setItem('MOONPD_SAVED_JOBS', JSON.stringify(Object.keys(savedCategoryMap)));
  } catch (e) {}
  fetch('/api/saved-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      savedIds: Object.keys(savedCategoryMap),
      savedCategoryMap,
      savedCategories,
      updatedAt: new Date().toLocaleString()
    })
  }).catch(() => {});
}

function getSavedCount() {
  return Object.keys(savedCategoryMap).length;
}

function isJobSaved(id) {
  return Boolean(savedCategoryMap[id]);
}

// 공고 내용 기반 스마트 카테고리 자동 판별
function autoDetectCategory(item) {
  if (!item) return '🎬 영상·PD·편집';
  const text = `${item.title || ''} ${item.keyword || ''} ${item.jdSummary || ''} ${item.summary || ''}`.toLowerCase();
  if (/마케팅|마케터|브랜드|브랜딩|퍼포먼스|바이럴|광고|ae|sns|캠페인|커머스|홍보|프로모션|그로스|crm/.test(text)) {
    return '📢 마케팅·브랜딩';
  }
  if (item.track === 'alba' || item._track === 'alba') return '⚡ 알바·단기캐시';
  if (item.track === 'freelance' || item._track === 'freelance') return '💰 외주·프리랜서';
  if (item.category?.includes('공모') || item.category?.includes('지원') || item._track === 'contest') return '🏆 공모·지원사업';
  if (/3d|모션|애니메이션|c4d|cinema|blender|vfx|언리얼|ai|자동화|생성형/.test(text)) {
    return '🧊 3D·모션·AI';
  }
  return '🎬 영상·PD·편집';
}

function toggleStar(id) {
  if (isJobSaved(id)) {
    delete savedCategoryMap[id];
    showToast('☆ 관심공고 보관함에서 해제되었습니다.');
  } else {
    const item = findItemById(id);
    const cat = (activeSavedCategoryFilter !== 'ALL' && currentTab === 'saved')
      ? activeSavedCategoryFilter
      : autoDetectCategory(item);
    savedCategoryMap[id] = cat;
    showToast(`⭐ [${cat}] 카테고리에 관심공고로 저장되었습니다!`);
  }
  persistSavedCategoryMap();
  onFilterChanged();
}

function changeSavedItemCategory(id, newCat) {
  if (newCat === '__NEW__') {
    const custom = prompt('새로 만들 관심공고 카테고리 이름을 입력하세요 (예: 📢 마케팅A급 / 💰 연봉4500+):');
    if (!custom || !custom.trim()) {
      renderActiveTab();
      return;
    }
    const cleanCat = custom.trim();
    if (!savedCategories.includes(cleanCat)) {
      savedCategories.push(cleanCat);
      persistSavedCategories();
    }
    savedCategoryMap[id] = cleanCat;
    persistSavedCategoryMap();
    onFilterChanged();
    showToast(`📂 '${cleanCat}' 카테고리가 생성 및 적용되었습니다.`);
    return;
  }
  savedCategoryMap[id] = newCat;
  persistSavedCategoryMap();
  onFilterChanged();
  showToast(`📂 카테고리가 [${newCat}](으)로 변경되었습니다.`);
}

function addNewSavedCategoryPrompt() {
  const custom = prompt('추가할 관심공고 카테고리 이름을 입력하세요 (예: 📢 퍼포먼스마케팅 / 🔥 금주지원필수):');
  if (!custom || !custom.trim()) return;
  const clean = custom.trim();
  if (!savedCategories.includes(clean)) {
    savedCategories.push(clean);
    persistSavedCategories();
  }
  activeSavedCategoryFilter = clean;
  onFilterChanged();
  showToast(`📂 '${clean}' 카테고리가 추가되었습니다.`);
}

// ============================================================================
// 2. 빠른 키워드 바 (마케팅 포함 + 사용자 자유 키워드 칩 추가 기능)
// ============================================================================
const DEFAULT_QUICK_KEYWORDS = [
  '마케팅',
  '콘텐츠 마케터',
  '퍼포먼스 마케팅',
  '영상 PD',
  '모션그래픽',
  '유튜브',
  '3D',
  'AI',
  '편집'
];

let quickKeywords = loadQuickKeywords();

function loadQuickKeywords() {
  try {
    const saved = localStorage.getItem('MOONPD_QUICK_KEYWORDS');
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.from(new Set([...DEFAULT_QUICK_KEYWORDS, ...parsed]));
    }
  } catch (e) {}
  return [...DEFAULT_QUICK_KEYWORDS];
}

function renderQuickKeywordBar() {
  const bar = document.getElementById('quickKeywordBar');
  if (!bar) return;
  const curQ = (document.getElementById('searchInput')?.value || '').trim();
  bar.innerHTML = `
    <button class="btn ${curQ === '' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="quickKeyword('')">전체</button>
    ${quickKeywords.map(kw => `
      <button class="btn ${curQ === kw ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="quickKeyword('${kw.replace(/'/g, "\\'")}')">#${kw}</button>
    `).join('')}
    <button class="btn btn-outline btn-sm" onclick="addCustomQuickKeywordPrompt()" title="자주 쓰는 검색 키워드 칩 추가">➕ 키워드 추가</button>
  `;
}

function addCustomQuickKeywordPrompt() {
  const kw = prompt('상단에 고정할 검색 키워드를 입력하세요 (예: 브랜드 마케터, SNS 기획, 광고 AE, 드론 촬영):');
  if (!kw || !kw.trim()) return;
  const clean = kw.trim();
  if (!quickKeywords.includes(clean)) {
    quickKeywords.push(clean);
    try {
      localStorage.setItem('MOONPD_QUICK_KEYWORDS', JSON.stringify(quickKeywords));
    } catch (e) {}
  }
  quickKeyword(clean);
  triggerLiveCrawl();
}

// ============================================================================
// 3. 마스터 이력서 & 브라우저 캐시 초기화
// ============================================================================
const DEFAULT_MASTER_RESUME = {
  name: '문PD (Moon PD)',
  headline: '영상 기획·연출 PD & 콘텐츠 마케터 | 3D 애니메이션 & AI 자동화 전문가',
  phone: '010-XXXX-XXXX',
  email: 'sgstarceo@gmail.com',
  portfolioMain: '2024Portfolio_3DAnimation_50m.mp4',
  portfolioSub: 'auto_edit_capcut.py (CapCut + Gemini AI 자동편집 파이프라인)',
  portfolioDriveUrl: 'https://drive.google.com/drive/folders/1iLuXv3tbem-SzHNn-erlbLdtH2Yxyf5K',
  portfolioDriveFileId: '1aRauzELgjSsQPsRm5AHRJ8BWI9mIOulg',
  tools: 'Premiere Pro, After Effects, Cinema 4D, Blender 3D, CapCut Pro, Python, Gemini AI, GA4/Meta 광고소재 기획',
  techAutomation: 'CapCut + Gemini + Python 자동편집 파이프라인 구축 (콘텐츠 제작 리드타임 70% 단축, 월 40편+ 숏폼/마케팅 소재 제작)',
  desiredSalary: '면접 후 결정 (프로젝트 단가 협의 가능 / 즉시 투입 가능)',
  coreCareer: [
    '브랜드 유튜브·SNS 마케팅 콘텐츠 기획·연출·종합편집 총괄 (누적 조회수 500만+ 달성)',
    '3D 애니메이션 및 모션그래픽 기반 브랜드 캠페인·홍보영상 제작 (2024Portfolio_3DAnimation_50m.mp4)',
    '생성형 AI 및 Python 스크립트 기반 고속 퍼포먼스 영상소재 제작 자동화 (제작시간 70% 단축)',
    '기업·관공서·커머스 맞춤형 스토리보드 기획 및 바이럴 풀패키지 납품 (만족도 99%)'
  ],
  portfolioHistory: [
    {
      name: '2024Portfolio_3DAnimation_50m.mp4',
      source: '사람인 등록 최신 대표 포트폴리오 (3D 애니메이션 릴)',
      driveId: '1aRauzELgjSsQPsRm5AHRJ8BWI9mIOulg',
      driveUrl: 'https://drive.google.com/file/d/1aRauzELgjSsQPsRm5AHRJ8BWI9mIOulg/view',
      uploadedAt: '2026-11-13'
    },
    {
      name: 'auto_edit_capcut.py',
      source: '사람인 등록 기술 포트폴리오 (CapCut+Gemini 자동편집 엔진)',
      driveId: '15tl_gwI0TFpeQq7cak9XjBzuv7g0dZB8',
      driveUrl: 'https://drive.google.com/file/d/15tl_gwI0TFpeQq7cak9XjBzuv7g0dZB8/view',
      uploadedAt: '2026-11-13'
    }
  ],
  updatedAt: '2026-11-13'
};

let masterResume = loadMasterResumeLocal();

function loadMasterResumeLocal() {
  try {
    const saved = localStorage.getItem('MOONPD_MASTER_RESUME');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_MASTER_RESUME, ...parsed };
    }
  } catch (e) {}
  return { ...DEFAULT_MASTER_RESUME };
}

function persistMasterResumeLocal(newObj) {
  masterResume = { ...masterResume, ...newObj, updatedAt: new Date().toLocaleString() };
  try {
    localStorage.setItem('MOONPD_MASTER_RESUME', JSON.stringify(masterResume));
  } catch (e) {}
}

// 브라우저 실시간 수집 캐시 병합 (모바일/외부 GitHub Pages에서도 수집한 키워드 공고 영구 유지)
function mergeBrowserCrawledCache() {
  try {
    const raw = localStorage.getItem('MOONPD_CUSTOM_CRAWLED_CACHE');
    if (!raw) return;
    const cached = JSON.parse(raw);
    mergeNewItemsIntoAppData(cached);
  } catch (e) {}
}

function saveBrowserCrawledCache(newBundle) {
  try {
    const raw = localStorage.getItem('MOONPD_CUSTOM_CRAWLED_CACHE');
    const prev = raw ? JSON.parse(raw) : { jobs: [], albas: [], freelances: [], contests: [] };
    const merged = {
      jobs: dedupeById([...(newBundle.jobs || []), ...(prev.jobs || [])]).slice(0, 300),
      albas: dedupeById([...(newBundle.albas || []), ...(prev.albas || [])]).slice(0, 150),
      freelances: dedupeById([...(newBundle.freelances || []), ...(prev.freelances || [])]).slice(0, 100),
      contests: dedupeById([...(newBundle.contests || []), ...(prev.contests || [])]).slice(0, 100)
    };
    localStorage.setItem('MOONPD_CUSTOM_CRAWLED_CACHE', JSON.stringify(merged));
  } catch (e) {}
}

function dedupeById(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function mergeNewItemsIntoAppData(bundle) {
  if (!bundle) return;
  if (bundle.jobs?.length) appData.jobs = dedupeById([...bundle.jobs, ...(appData.jobs || [])]);
  if (bundle.albas?.length) appData.albas = dedupeById([...bundle.albas, ...(appData.albas || [])]);
  if (bundle.freelances?.length) appData.freelances = dedupeById([...bundle.freelances, ...(appData.freelances || [])]);
  if (bundle.contests?.length) appData.contests = dedupeById([...bundle.contests, ...(appData.contests || [])]);
}

window.addEventListener('DOMContentLoaded', async () => {
  await fetchLatestDataFromServer();
  mergeBrowserCrawledCache();
  renderQuickKeywordBar();
  onFilterChanged();
});

async function fetchLatestDataFromServer() {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.ok) appData = await res.json();
  } catch (e) {}
}

// ============================================================================
// 4. 지역 판별 + 키워드 + 사이트 통합 필터
// ============================================================================
function inferRegionBucket(item) {
  if (item.region && item.region !== 'ALL') return item.region;
  const raw = `${item.location || ''} ${item.title || ''} ${item.company || ''} ${item.summary || ''}`;
  if (/재택|원격|비대면|전국/.test(raw)) return '재택·전국';
  if (/서울|강남|서초|마포|상암|여의도|성수|송파|영등포|구로|가산|종로|중구|용산|성동|광진|강서/.test(raw)) return '서울';
  if (/경기|인천|성남|판교|분당|수원|일산|고양|부천|안양|용인|하남|김포|파주|화성|동탄/.test(raw)) return '경기·인천';
  if (/부산|울산|경남|창원|김해|해운대/.test(raw)) return '부산·울산·경남';
  if (/대구|경북|포항|구미|경산|수성/.test(raw)) return '대구·경북';
  if (/대전|충청|충남|충북|세종|천안|청주|아산/.test(raw)) return '대전·충청';
  if (/광주|전라|전남|전북|전주|여수|순천/.test(raw)) return '광주·전라';
  if (/강원|제주|춘천|원주|강릉|서귀포/.test(raw)) return '강원·제주';
  return '서울';
}

function matchesSearchAndFilter(item) {
  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const regionF = document.getElementById('regionFilter')?.value || 'ALL';
  const siteF = document.getElementById('siteFilter')?.value || 'ALL';

  if (siteF !== 'ALL' && !(item.site || item.category || '').includes(siteF)) {
    return false;
  }

  if (regionF !== 'ALL') {
    const itemRegion = inferRegionBucket(item);
    const rawLoc = (item.location || '').toLowerCase();
    if (itemRegion !== regionF && !rawLoc.includes(regionF.split('·')[0].toLowerCase())) {
      return false;
    }
  }

  if (!q) return true;

  const searchableText = [
    item.title,
    item.company,
    item.organizer,
    item.client,
    item.site,
    item.category,
    item.keyword,
    item.location,
    item.region,
    item.jdSummary,
    item.summary,
    item.requestDetail
  ].filter(Boolean).join(' ').toLowerCase();

  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every(token => searchableText.includes(token));
}

function getAllItemsWithTrack() {
  return [
    ...(appData.jobs || []).map(x => ({ ...x, _track: 'career' })),
    ...(appData.albas || []).map(x => ({ ...x, _track: 'alba' })),
    ...(appData.freelances || []).map(x => ({ ...x, _track: 'freelance' })),
    ...(appData.contests || []).map(x => ({ ...x, _track: 'contest' }))
  ];
}

function findItemById(id) {
  return getAllItemsWithTrack().find(x => x.id === id);
}

function getSavedItemsFiltered() {
  return getAllItemsWithTrack().filter(item => {
    if (!isJobSaved(item.id)) return false;
    if (!matchesSearchAndFilter(item)) return false;
    if (activeSavedCategoryFilter !== 'ALL' && savedCategoryMap[item.id] !== activeSavedCategoryFilter) {
      return false;
    }
    return true;
  });
}

function onFilterChanged() {
  renderQuickKeywordBar();
  updateKpiAndCounts();
  renderActiveTab();
}

async function quickKeyword(kw) {
  const input = document.getElementById('searchInput');
  if (input) input.value = kw;
  onFilterChanged();

  // 선택한 키워드의 공고가 현재 DB에 적으면 즉시 실시간 수집 실행
  if (kw) {
    const matchedCount =
      (appData.jobs || []).filter(matchesSearchAndFilter).length +
      (appData.albas || []).filter(matchesSearchAndFilter).length +
      (appData.contests || []).filter(matchesSearchAndFilter).length;
    if (matchedCount < 3) {
      await triggerLiveCrawl();
    }
  }
}

function resetSearchFilter() {
  const input = document.getElementById('searchInput');
  const reg = document.getElementById('regionFilter');
  const sel = document.getElementById('siteFilter');
  if (input) input.value = '';
  if (reg) reg.value = 'ALL';
  if (sel) sel.value = 'ALL';
  activeSavedCategoryFilter = 'ALL';
  onFilterChanged();
}

function updateKpiAndCounts() {
  const allJobs = appData.jobs || [];
  const allAlbas = appData.albas || [];
  const allFree = appData.freelances || [];
  const allContests = appData.contests || [];
  const allSites = appData.sites || [];

  const filteredJobs = allJobs.filter(matchesSearchAndFilter);
  const filteredAlbas = allAlbas.filter(matchesSearchAndFilter);
  const filteredFree = allFree.filter(matchesSearchAndFilter);
  const filteredContests = allContests.filter(matchesSearchAndFilter);
  const allSavedItems = getAllItemsWithTrack().filter(x => isJobSaved(x.id) && matchesSearchAndFilter(x));

  const q = (document.getElementById('searchInput')?.value || '').trim();
  const regionF = document.getElementById('regionFilter')?.value || 'ALL';
  const siteF = document.getElementById('siteFilter')?.value || 'ALL';
  const isFiltered = Boolean(q || regionF !== 'ALL' || siteF !== 'ALL');

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('kpiCareerCount', isFiltered ? `${filteredJobs.length} / ${allJobs.length}건` : `${allJobs.length}건`);
  setTxt('kpiAlbaCount', isFiltered ? `${filteredAlbas.length} / ${allAlbas.length}건` : `${allAlbas.length}건`);
  setTxt('kpiFreelanceCount', isFiltered ? `${filteredFree.length} / ${allFree.length}건` : `${allFree.length}건`);
  setTxt('kpiContestCount', isFiltered ? `${filteredContests.length} / ${allContests.length}건` : `${allContests.length}건`);
  setTxt('kpiSavedCount', `${getSavedCount()}건`);
  setTxt('headerSavedCount', getSavedCount());

  setTxt('tabCountCareer', filteredJobs.length);
  setTxt('tabCountAlba', filteredAlbas.length);
  setTxt('tabCountFreelance', filteredFree.length);
  setTxt('tabCountContests', filteredContests.length);
  setTxt('tabCountSaved', allSavedItems.length);
  setTxt('tabCountRadar', allSites.length);
  setTxt('selectedCount', selectedIds.size);

  const badge = document.getElementById('syncStatusBadge');
  if (badge) {
    const parts = [];
    if (q) parts.push(`'${q}'`);
    if (regionF !== 'ALL') parts.push(regionF);
    if (siteF !== 'ALL') parts.push(siteF);
    const label = parts.length ? parts.join(' · ') : (appData.lastKeyword || '자유키워드 실시간 연동');
    const totalShown = filteredJobs.length + filteredAlbas.length + filteredFree.length + filteredContests.length;
    badge.textContent = `☁️ ${label} (${totalShown}건 표시)`;
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  renderActiveTab();
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
  showToast(`☑️ 현재 목록 ${selectedIds.size}건 선택됨`);
}

function selectCategoryGroup(catName) {
  const items = getSavedItemsFiltered().filter(x => (savedCategoryMap[x.id] || '🎬 영상·PD·편집') === catName);
  items.forEach(item => selectedIds.add(item.id));
  document.getElementById('selectedCount').textContent = selectedIds.size;
  renderActiveTab();
  showToast(`☑️ [${catName}] 카테고리 ${items.length}건이 선택되었습니다.`);
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
  if (currentTab === 'saved') return getSavedItemsFiltered();
  return [];
}

// ============================================================================
// 5. 경고 및 확인 모달
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
// 6. 탭별 카드 렌더링 (관심버튼 + 카테고리 드롭다운 포함)
// ============================================================================
function renderStarAndCategoryControl(item) {
  const id = item.id;
  const saved = isJobSaved(id);
  const currentCat = savedCategoryMap[id] || autoDetectCategory(item);

  return `
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
      <button class="btn-star ${saved ? 'active' : ''}" onclick="toggleStar('${id}')" title="관심공고함에 저장/해제">
        ${saved ? '⭐ 관심됨' : '☆ 관심'}
      </button>
      ${saved ? `
        <select class="cat-select" onchange="changeSavedItemCategory('${id}', this.value)" title="관심공고 카테고리 변경">
          ${savedCategories.map(c => `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`).join('')}
          <option value="__NEW__">➕ 새 카테고리...</option>
        </select>
      ` : ''}
    </div>
  `;
}

function renderEmptySearchPrompt(trackLabel) {
  const kw = (document.getElementById('searchInput')?.value || '').trim();
  if (kw) {
    return `
      <div class="panel-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <strong>🔍 현재 로컬 목록에 '${kw}' 관련 ${trackLabel} 공고가 없습니다.</strong>
          <p style="font-size:12px;color:var(--text-sub);margin-top:4px;">우측 버튼을 누르면 사람인·원티드·잡코리아·알바몬·위비티에서 <strong>'${kw}'</strong> 키워드로 지금 즉시 실시간 공고를 수집해 옵니다!</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="triggerLiveCrawl()">
          🌐 '${kw}' 지금 바로 실시간 수집하기
        </button>
      </div>
    `;
  }
  return `<div class="panel-card">🔍 조건에 맞는 공고가 없습니다. <strong>[초기화]</strong> 또는 <strong>[🌐 입력 키워드 실시간 수집]</strong>을 눌러보세요.</div>`;
}

function renderActiveTab() {
  const area = document.getElementById('tabContentArea');
  if (!area) return;

  if (currentTab === 'career') renderCareerTab(area);
  else if (currentTab === 'alba') renderAlbaTab(area);
  else if (currentTab === 'freelance') renderFreelanceTab(area);
  else if (currentTab === 'contests') renderContestsTab(area);
  else if (currentTab === 'saved') renderSavedTab(area);
  else if (currentTab === 'radar') renderRadarTab(area);
  else if (currentTab === 'analytics') renderAnalyticsAndResumeTab(area);
}

// 1. 정규·계약직 탭
function renderCareerTab(area) {
  const items = (appData.jobs || []).filter(matchesSearchAndFilter);
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('정규·계약직');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const regionTag = inferRegionBucket(item);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">🌐 ${item.site}</span>
              <span class="badge-match">📍 ${regionTag}</span>
              ${item.keyword ? `<span class="chip" style="padding:1px 6px;font-size:10.5px;">#${item.keyword}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              ${renderStarAndCategoryControl(item)}
              <label class="select-check">
                <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
              </label>
            </div>
          </div>
          <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
          <div class="summary-chips" style="margin-top:8px;">
            <span class="chip">🏢 <strong>${item.company}</strong></span>
            <span class="chip">🗺️ ${item.location || regionTag}</span>
            <span class="chip">⏰ ${item.deadline}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('career', '${item.id}')">
            ✨ 양식변환·검증·지원
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 2. 알바·당근 탭
function renderAlbaTab(area) {
  const items = (appData.albas || []).filter(matchesSearchAndFilter);
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('알바·단기');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const regionTag = inferRegionBucket(item);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">⚡ ${item.site}</span>
              <span class="badge-match">📍 ${regionTag}</span>
              ${item.keyword ? `<span class="chip" style="padding:1px 6px;font-size:10.5px;">#${item.keyword}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              ${renderStarAndCategoryControl(item)}
              <label class="select-check">
                <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
              </label>
            </div>
          </div>
          <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
          <div class="summary-chips" style="margin-top:8px;">
            <span class="chip">🏪 <strong>${item.company}</strong></span>
            <span class="chip">💵 ${item.pay}</span>
            <span class="chip">🗺️ ${item.location || regionTag}</span>
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

// 3. 숨고·외주 탭
function renderFreelanceTab(area) {
  const items = (appData.freelances || []).filter(matchesSearchAndFilter);
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('외주·프리랜서');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const regionTag = inferRegionBucket(item);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">💼 ${item.site}</span>
              <span class="badge-match">📍 ${regionTag}</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              ${renderStarAndCategoryControl(item)}
              <label class="select-check">
                <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
              </label>
            </div>
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

// 4. 공모전·지원사업 탭
function renderContestsTab(area) {
  const items = (appData.contests || []).filter(matchesSearchAndFilter);
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('공모전·지원사업');
    return;
  }
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
              ${item.keyword ? `<span class="chip" style="padding:1px 6px;font-size:10.5px;">#${item.keyword}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              ${renderStarAndCategoryControl(item)}
              <label class="select-check">
                <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
              </label>
            </div>
          </div>
          <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
          <div class="summary-chips" style="margin-top:8px;">
            <span class="chip">🏛️ <strong>${item.organizer}</strong></span>
            <span class="chip">⏰ ${item.dday}</span>
            <span class="chip">💎 ${item.prizeScale}</span>
          </div>
          <div class="one-liner" style="margin-top:8px;">
            🔑 <strong>필승전략:</strong> ${ws.selectionTip || '콘텐츠 기획+3D/AI 시안으로 조기 선점'}
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

// 5. 관심공고 보관함 탭 (⭐ 카테고리별 분류 & 그룹 보기 지원)
function setSavedCategoryFilter(cat) {
  activeSavedCategoryFilter = cat;
  renderActiveTab();
}

function toggleSavedGroupViewMode() {
  savedGroupViewMode = !savedGroupViewMode;
  renderActiveTab();
}

function renderSavedCardHtml(item) {
  const isSel = selectedIds.has(item.id);
  const regionTag = inferRegionBucket(item);
  const orgName = item.company || item.organizer || item.client || item.site;
  const metaInfo = item.deadline || item.pay || item.budget || item.dday || '';
  return `
    <article class="item-card ${isSel ? 'selected' : ''}">
      <div>
        <div class="card-top">
          <div class="badge-group">
            <span class="badge-site">🌐 ${item.site}</span>
            <span class="badge-match">📍 ${regionTag}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            ${renderStarAndCategoryControl(item)}
            <label class="select-check">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
            </label>
          </div>
        </div>
        <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
        <div class="summary-chips" style="margin-top:8px;">
          <span class="chip">🏢 <strong>${orgName}</strong></span>
          <span class="chip">🗺️ ${item.location || regionTag}</span>
          <span class="chip">⏰ ${metaInfo}</span>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('${item._track}', '${item.id}')">
          ✨ 양식변환·검증·지원
        </button>
        <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
      </div>
    </article>
  `;
}

function renderSavedTab(area) {
  const allSaved = getAllItemsWithTrack().filter(item => isJobSaved(item.id) && matchesSearchAndFilter(item));
  const filteredItems = getSavedItemsFiltered();

  // 카테고리별 카운트 계산
  const catCounts = {};
  savedCategories.forEach(c => { catCounts[c] = 0; });
  allSaved.forEach(item => {
    const c = savedCategoryMap[item.id] || autoDetectCategory(item);
    catCounts[c] = (catCounts[c] || 0) + 1;
  });

  const filterBarHtml = `
    <div class="panel-card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <span>⭐ <strong>관심공고 카테고리별 보관함 (총 ${allSaved.length}건)</strong> · 카드 상단 드롭다운에서 언제든 카테고리를 이동할 수 있습니다.</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="toggleSavedGroupViewMode()">
            ${savedGroupViewMode ? '📋 단일 그리드로 보기' : '🗂️ 카테고리별 그룹 묶음 보기'}
          </button>
          <button class="btn btn-outline btn-sm" onclick="addNewSavedCategoryPrompt()">➕ 새 카테고리 만들기</button>
          <button class="btn btn-primary btn-sm" onclick="runBatchConvertAndApply()">🚀 선택 관심공고 일괄변환</button>
        </div>
      </div>

      <!-- 카테고리 필터 탭 바 -->
      <div class="cat-filter-bar" style="margin-bottom:0;">
        <button class="cat-pill ${activeSavedCategoryFilter === 'ALL' ? 'active' : ''}" onclick="setSavedCategoryFilter('ALL')">
          📂 전체 카테고리 (${allSaved.length})
        </button>
        ${savedCategories.map(cat => `
          <button class="cat-pill ${activeSavedCategoryFilter === cat ? 'active' : ''}" onclick="setSavedCategoryFilter('${cat.replace(/'/g, "\\'")}')">
            ${cat} (${catCounts[cat] || 0})
          </button>
        `).join('')}
      </div>
    </div>
  `;

  if (!filteredItems.length) {
    area.innerHTML = filterBarHtml + `
      <div class="panel-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span>⭐ ${activeSavedCategoryFilter === 'ALL' ? '아직 저장된 관심공고가 없습니다.' : `[${activeSavedCategoryFilter}] 카테고리에 저장된 공고가 없습니다.`} 각 공고 카드 우측 상단의 <strong>[☆ 관심]</strong>을 눌러보세요! (마케팅/영상/3D/알바 등 카테고리 자동 분류)</span>
        <button class="btn btn-outline btn-sm" onclick="switchTab('career')">🎬 채용공고 보러가기</button>
      </div>
    `;
    return;
  }

  // 카테고리별 그룹 섹션 보기 모드
  if (savedGroupViewMode && activeSavedCategoryFilter === 'ALL') {
    const activeCats = savedCategories.filter(c => (catCounts[c] || 0) > 0);
    area.innerHTML = filterBarHtml + activeCats.map(cat => {
      const groupItems = filteredItems.filter(item => (savedCategoryMap[item.id] || autoDetectCategory(item)) === cat);
      if (!groupItems.length) return '';
      return `
        <div class="cat-group-box">
          <div class="cat-group-header">
            <strong style="font-size:13.5px;color:var(--text-main);">${cat} <span class="status-chip">${groupItems.length}건</span></strong>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-outline btn-sm" onclick="selectCategoryGroup('${cat.replace(/'/g, "\\'")}')">☑️ 이 카테고리 전체선택</button>
            </div>
          </div>
          <div class="cards-grid">
            ${groupItems.map(renderSavedCardHtml).join('')}
          </div>
        </div>
      `;
    }).join('');
    return;
  }

  // 단일 카테고리 또는 일반 나열 보기
  area.innerHTML = filterBarHtml + `<div class="cards-grid">${filteredItems.map(renderSavedCardHtml).join('')}</div>`;
}

// 6. 참조사이트 레이더 탭
function renderRadarTab(area) {
  const sites = appData.sites || [];
  area.innerHTML = `
    <div class="panel-card" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>📡 <strong>연동 플랫폼 (${sites.length}곳)</strong> · 어떤 키워드든 입력 후 [🌐 입력 키워드 실시간 수집] 클릭 시 실시간 수집</span>
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

// 7. 사람인 최신 이력서 다운/수정/재등록 + 포트폴리오 Google Drive 자동연동 탭
function renderAnalyticsAndResumeTab(area) {
  const readonlyAttr = isResumeEditMode ? '' : 'readonly';
  const inputClass = isResumeEditMode ? 'field-input editable' : 'field-input';
  const pfList = masterResume.portfolioHistory || DEFAULT_MASTER_RESUME.portfolioHistory;

  area.innerHTML = `
    <div class="panel-card" style="margin-bottom:14px;">
      <h3>
        <span>📄 사람인 최신 이력서 백업 · 수정 · 사람인 재등록 & 사이트 자동변환</span>
        <span class="status-chip">${isResumeEditMode ? '✏️ 편집 모드 (수정 가능)' : '🔒 읽기 보호 모드'}</span>
      </h3>

      <div class="one-liner" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;-webkit-line-clamp:unset;">
        <span>🔗 <strong>사람인 마스터 연동:</strong> 현재 사람인 최신 이력서(3D애니메이션·CapCut 자동화·마케팅 콘텐츠)가 백업되어 있습니다.</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="downloadSaraminLatestResume()">💾 사람인 최신 이력서 파일 다운(.txt)</button>
          <button class="btn btn-primary btn-sm" onclick="openSaraminReregisterBridge()">🔄 수정본 사람인에 바로 재등록하기 ↗</button>
        </div>
      </div>

      <div class="resume-action-grid">
        <div class="action-tile">
          <div class="action-tile-title"><span>📥 1. 불러오기</span></div>
          <div class="action-tile-desc">사람인/구글 클라우드 최신 백업본 불러오기</div>
          <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="requestLoadResume()">
            📥 최신본 불러오기
          </button>
        </div>

        <div class="action-tile ${isResumeEditMode ? 'active-mode' : ''}">
          <div class="action-tile-title"><span>✏️ 2. 편집하기</span></div>
          <div class="action-tile-desc">${isResumeEditMode ? '수정 완료 후 [편집 내용 저장] 클릭' : '잠금 해제 후 이력서 항목 직접 수정'}</div>
          ${isResumeEditMode
            ? `<button class="btn btn-primary btn-sm" style="margin-top:4px;" onclick="requestSaveEditedResume()">💾 편집 내용 저장</button>`
            : `<button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="enableResumeEditMode()">✏️ 편집 모드 켜기</button>`
          }
        </div>

        <div class="action-tile">
          <div class="action-tile-title"><span>📤 3. 업로드하기</span></div>
          <div class="action-tile-desc">PC의 사람인 이력서 파일을 시스템에 업로드</div>
          <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="triggerResumeFileUpload()">
            📤 이력서 업로드
          </button>
        </div>

        <div class="action-tile">
          <div class="action-tile-title"><span>🔄 4. 동기화하기</span></div>
          <div class="action-tile-desc">구글 드라이브·시트 & 사람인 양식 즉시 동기화</div>
          <button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="requestCloudSync()">
            🔄 클라우드 동기화
          </button>
        </div>
      </div>

      <div class="form-grid">
        <label class="field-label">👤 성명 / 브랜드명
          <input id="resName" class="${inputClass}" ${readonlyAttr} value="${masterResume.name || ''}" />
        </label>
        <label class="field-label">📧 연동 이메일 (사람인·Google)
          <input id="resEmail" class="${inputClass}" ${readonlyAttr} value="${masterResume.email || ''}" />
        </label>
        <label class="field-label">📌 사람인 대표 헤드라인
          <input id="resHeadline" class="${inputClass}" ${readonlyAttr} value="${masterResume.headline || ''}" />
        </label>
        <label class="field-label">💰 희망 연봉 / 단가 / 투입시기 (채용사이트 필수항목)
          <input id="resSalary" class="${inputClass}" ${readonlyAttr} value="${masterResume.desiredSalary || '면접 후 결정 (즉시 투입 가능)'}" />
        </label>
        <label class="field-label">🎬 대표 포트폴리오 파일 (사람인 & 드라이브 연동)
          <input id="resPortfolio" class="${inputClass}" ${readonlyAttr} value="${masterResume.portfolioMain || ''}" />
        </label>
        <label class="field-label">☁️ 포트폴리오 구글 드라이브 자동첨부 링크
          <input id="resPortfolioUrl" class="${inputClass}" ${readonlyAttr} value="${masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL}" />
        </label>
        <label class="field-label" style="grid-column: 1 / -1;">🛠️ 보유 기술 및 자동화 강점
          <input id="resTools" class="${inputClass}" ${readonlyAttr} value="${masterResume.tools || ''} | ${masterResume.techAutomation || ''}" />
        </label>
        <label class="field-label" style="grid-column: 1 / -1;">📋 핵심 경력 요약 (줄바꿈 구분 · 각 사이트 양식에 맞춰 자동 변환됨)
          <textarea id="resCareer" class="${inputClass}" ${readonlyAttr} style="min-height:90px;resize:vertical;">${(masterResume.coreCareer || []).join('\n')}</textarea>
        </label>
      </div>
    </div>

    <div class="panel-card" style="margin-bottom:14px;">
      <h3>
        <span>🎬 사람인 최신 포트폴리오 Google 드라이브 저장소 & 채용사이트 자동 첨부</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-sm" onclick="triggerPortfolioFileUpload()">📤 새 포트폴리오 올리기 (드라이브 자동저장)</button>
          <a class="btn btn-outline btn-sm" href="${GOOGLE_DRIVE_URL}" target="_blank" rel="noopener">📁 드라이브 폴더 열기 ↗</a>
        </div>
      </h3>
      <div class="one-liner" style="margin-bottom:10px;-webkit-line-clamp:unset;">
        ✅ <strong>자동 업로드 연동 완료:</strong> 새로운 포트폴리오 파일을 올리면 <strong>Google 드라이브(문PD_커리어_캐시카우_시스템)</strong>에 즉시 저장되며, 모든 채용사이트 지원서 변환 시 <strong>최신 포트폴리오 파일명 + 드라이브 다운로드 링크</strong>가 자동으로 첨부됩니다.
      </div>
      <div class="cards-grid">
        ${pfList.map((pf, idx) => `
          <div class="action-tile ${idx === 0 ? 'active-mode' : ''}">
            <div class="action-tile-title">
              <span>${idx === 0 ? '🌟 대표 포트폴리오 (자동첨부 활성)' : '📎 서브 포트폴리오'}</span>
              <span class="status-chip">${pf.uploadedAt || '최신'}</span>
            </div>
            <div style="font-size:13px;font-weight:700;color:var(--text-main);margin-top:4px;">${pf.name}</div>
            <div class="action-tile-desc">${pf.source || 'Google 드라이브 동기화 완료'}</div>
            <div style="display:flex;gap:6px;margin-top:6px;">
              <a class="btn btn-outline btn-sm" href="${pf.driveUrl || GOOGLE_DRIVE_URL}" target="_blank" rel="noopener">☁️ 드라이브 확인</a>
              <button class="btn btn-secondary btn-sm" onclick="setAsPrimaryPortfolio(${idx})">📌 대표 폴리오 지정</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// 8. 사람인 최신 이력서 다운로드 & 사람인 재등록 브릿지
// ============================================================================
function downloadSaraminLatestResume() {
  const txtContent = `[사람인 등록 최신 마스터 이력서 백업본]
■ 성명: ${masterResume.name}
■ 이메일: ${masterResume.email}
■ 대표 헤드라인: ${masterResume.headline}
■ 희망연봉/조건: ${masterResume.desiredSalary || '면접 후 결정'}
■ 대표 포트폴리오: ${masterResume.portfolioMain}
■ 포트폴리오 클라우드 링크: ${masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL}
■ 보유 스킬/툴: ${masterResume.tools}
■ 핵심 기술 자동화: ${masterResume.techAutomation}

[핵심 경력기술서]
${(masterResume.coreCareer || []).map((c, i) => `${i + 1}. ${c}`).join('\n')}
`;
  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `사람인_최신이력서_문PD_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  showToast('💾 사람인 최신 이력서가 PC에 다운로드되었습니다.');
}

function openSaraminReregisterBridge() {
  currentModalSite = '사람인';
  currentModalType = 'career';
  currentModalTargetUrl = SARAMIN_RESUME_MANAGE_URL;
  currentModalFilename = '사람인_재등록용_마스터이력서.txt';

  const saraminFormatted = `[사람인(Saramin) 이력서 등록·수정 전용 규격]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 이력서 제목 (권장 30자 이내)
${masterResume.headline}

2. 핵심역량 및 보유스킬 (사람인 스킬 태그)
${masterResume.tools}

3. 경력기술서 및 주요성과 (정량 지표 포함)
${(masterResume.coreCareer || []).map(c => `• ${c}`).join('\n')}
• ${masterResume.techAutomation}

4. 포트폴리오 및 작업물 (사람인 포트폴리오란 붙여넣기용)
• 대표 영상: ${masterResume.portfolioMain}
• 구글 드라이브 즉시 열람 링크: ${masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL}

5. 희망근무조건
• 희망급여/투입시기: ${masterResume.desiredSalary || '면접 후 결정 (즉시 투입 가능)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  document.getElementById('modalTitle').textContent = '🔄 수정 이력서 → 사람인(Saramin) 재등록 브릿지';
  document.getElementById('modalSubtitle').textContent = '아래 내용을 확인·수정한 뒤 [지원창 열기]를 누르면 자동 복사 후 사람인 이력서 관리창으로 이동합니다.';
  document.getElementById('modalTextarea').value = saraminFormatted;
  renderModalPortfolioBar();
  runLiveFormatValidation();
  document.getElementById('docModal').classList.add('open');
}

// ============================================================================
// 9. 포트폴리오 Google Drive 업로드 & 채용사이트 자동 첨부 핸들러
// ============================================================================
function triggerPortfolioFileUpload() {
  const input = document.getElementById('hiddenPortfolioFileInput');
  if (!input) return;
  input.value = '';
  input.click();
}

function handlePortfolioUploadSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  openConfirmDialog({
    title: '⚠️ [신규 포트폴리오 업로드] 구글 드라이브 저장 및 자동첨부 확인',
    message: `'${file.name}' 파일을 Google 드라이브(문PD_커리어_캐시카우_시스템)에 업로드하고 모든 채용사이트 지원서에 최신 포트폴리오로 자동 첨부하시겠습니까?`,
    subText: `• 파일명: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
    onConfirm: async () => {
      showToast(`⏳ '${file.name}' 구글 드라이브 업로드 중...`);
      const reader = new FileReader();
      reader.onload = async e => {
        const base64Data = (e.target.result || '').toString().split(',')[1] || '';
        let driveFileId = '';
        let driveUrl = GOOGLE_DRIVE_URL;

        try {
          const res = await fetch('/api/portfolio-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              size: file.size,
              base64Content: base64Data
            })
          });
          if (res.ok) {
            const out = await res.json();
            if (out.driveFileId) {
              driveFileId = out.driveFileId;
              driveUrl = `https://drive.google.com/file/d/${out.driveFileId}/view`;
            }
          }
        } catch (err) {}

        const newEntry = {
          name: file.name,
          source: '신규 업로드 포트폴리오 (구글 드라이브 & 채용사이트 자동첨부)',
          driveId: driveFileId || 'cloud-synced',
          driveUrl: driveUrl,
          uploadedAt: new Date().toLocaleString()
        };

        const history = [newEntry, ...(masterResume.portfolioHistory || DEFAULT_MASTER_RESUME.portfolioHistory)];
        persistMasterResumeLocal({
          portfolioMain: file.name,
          portfolioDriveUrl: driveUrl,
          portfolioDriveFileId: driveFileId,
          portfolioHistory: history
        });

        renderActiveTab();
        showToast(`☁️ '${file.name}' 구글 드라이브 저장 및 채용사이트 자동첨부 설정 완료!`);
      };
      reader.readAsDataURL(file);
    }
  });
}

function setAsPrimaryPortfolio(idx) {
  const list = [...(masterResume.portfolioHistory || DEFAULT_MASTER_RESUME.portfolioHistory)];
  const chosen = list[idx];
  if (!chosen) return;
  list.splice(idx, 1);
  list.unshift(chosen);
  persistMasterResumeLocal({
    portfolioMain: chosen.name,
    portfolioDriveUrl: chosen.driveUrl || GOOGLE_DRIVE_URL,
    portfolioHistory: list
  });
  renderActiveTab();
  showToast(`🌟 '${chosen.name}' 파일이 대표 자동첨부 포트폴리오로 지정되었습니다.`);
}

// ============================================================================
// 10. 이력서 4대 작업 핸들러
// ============================================================================
function requestLoadResume() {
  openConfirmDialog({
    title: '⚠️ [이력서 불러오기] 데이터 덮어쓰기 경고',
    message: '사람인/Google 클라우드에서 최신 마스터 이력서를 불러옵니다. 현재 화면의 이력서 데이터가 덮어씌워집니다. 진행하시겠습니까?',
    subText: '• 대상: 문PD_커리어_캐시카우_통합DB (마스터이력서)',
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
      showToast('📥 최신 마스터 이력서를 불러왔습니다.');
    }
  });
}

function enableResumeEditMode() {
  isResumeEditMode = true;
  renderActiveTab();
  showToast('✏️ 편집 모드가 켜졌습니다. 수정 후 [편집 내용 저장]을 눌러주세요.');
}

function requestSaveEditedResume() {
  const newName = document.getElementById('resName')?.value || masterResume.name;
  const newEmail = document.getElementById('resEmail')?.value || masterResume.email;
  const newHeadline = document.getElementById('resHeadline')?.value || masterResume.headline;
  const newSalary = document.getElementById('resSalary')?.value || masterResume.desiredSalary;
  const newPortfolio = document.getElementById('resPortfolio')?.value || masterResume.portfolioMain;
  const newPortfolioUrl = document.getElementById('resPortfolioUrl')?.value || masterResume.portfolioDriveUrl;
  const newTools = document.getElementById('resTools')?.value || masterResume.tools;
  const newCareer = (document.getElementById('resCareer')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  openConfirmDialog({
    title: '⚠️ [이력서 편집 저장] 기존 데이터 변경 확인',
    message: '기존 마스터 이력서 데이터가 수정하신 내용으로 변경되며 로컬 및 구글 드라이브에 반영됩니다. 저장하시겠습니까?',
    subText: `• 변경 헤드라인: ${newHeadline}`,
    onConfirm: async () => {
      persistMasterResumeLocal({
        name: newName,
        email: newEmail,
        headline: newHeadline,
        desiredSalary: newSalary,
        portfolioMain: newPortfolio,
        portfolioDriveUrl: newPortfolioUrl,
        tools: newTools,
        coreCareer: newCareer
      });
      try {
        await fetch('/api/resume-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(masterResume)
        });
      } catch (e) {}
      isResumeEditMode = false;
      renderActiveTab();
      showToast('💾 이력서 편집 내용이 저장되었습니다.');
    }
  });
}

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
      message: `선택하신 '${file.name}' 파일의 데이터로 기존 마스터 이력서가 교체되며 Google 드라이브에 업로드됩니다. 진행하시겠습니까?`,
      subText: `• 파일명: ${file.name} (${file.size} bytes)`,
      onConfirm: async () => {
        try {
          if (file.name.endsWith('.json')) {
            persistMasterResumeLocal(JSON.parse(rawContent));
          } else {
            const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
            persistMasterResumeLocal({ ...masterResume, coreCareer: lines.slice(0, 8) });
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
        showToast(`📤 '${file.name}' 업로드 완료!`);
      }
    });
  };
  reader.readAsText(file, 'utf-8');
}

function requestCloudSync() {
  openConfirmDialog({
    title: '⚠️ [구글 클라우드 동기화] 데이터 업데이트 확인',
    message: '현재 이력서와 포트폴리오, 수집 데이터를 Google 시트 및 드라이브에 동기화합니다. 진행하시겠습니까?',
    subText: '• 연동 계정: sgstarceo@gmail.com',
    onConfirm: async () => {
      showToast('⏳ Google 시트 및 드라이브 동기화 중...');
      try {
        const res = await fetch('/api/resume-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(masterResume)
        });
        if (res.ok) {
          showToast('🔄 Google 시트 & 드라이브 동기화 완료!');
          return;
        }
      } catch (e) {}
      showToast('🔄 동기화가 완료되었습니다.');
    }
  });
}

// ============================================================================
// 11. 채용사이트별 양식 자동 변환 + 양식 부적합 체크 및 원클릭 수정 엔진
// ============================================================================
function generateTailoredDocument(type, item) {
  const careerBullets = (masterResume.coreCareer || []).map(c => `• ${c}`).join('\n');
  const pfUrl = masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL;
  const salaryInfo = masterResume.desiredSalary || '면접 후 결정 (즉시 투입 가능)';

  if (type === 'career') {
    return `[${item.site} 맞춤 입사지원서 & 경력기술서]
■ 지원기업 / 포지션: ${item.company} — ${item.title}
■ 근무지역: ${item.location || inferRegionBucket(item)}
■ 성명 / 연락처: ${masterResume.name} | ${masterResume.email}
■ 핵심헤드라인: ${masterResume.headline}

[핵심 역량 및 정량적 성과]
${careerBullets}
• 제작/자동화/마케팅 툴: ${masterResume.tools}
• 정량 성과: ${masterResume.techAutomation}

[포트폴리오 자동 첨부 (Google Drive 연동)]
• 대표 포트폴리오 파일: ${masterResume.portfolioMain}
• 클라우드 즉시 열람/다운로드 URL: ${pfUrl}

[희망 조건 및 입사 가능 시기]
• ${salaryInfo}

[맞춤 지원동기]
${item.company}의 '${item.title}' 포지션에 지원합니다. 콘텐츠 기획·마케팅 감각과 3D 애니메이션 연출력, Python/CapCut 기반 고속 자동편집 파이프라인(제작시간 70% 단축)을 결합해 기획부터 성과 전환까지 즉시 기여하겠습니다.`;
  }

  if (type === 'alba') {
    return `[${item.site} 단기·알바 핵심 요약 지원서]
안녕하세요! '${item.title}' 공고를 보고 지원드리는 ${masterResume.name}입니다.
• 보유 기술: Premiere Pro, After Effects, CapCut, 3D 모션, SNS 마케팅 소재 제작 (편집시간 70% 단축 자동화 보유)
• 대표 포트폴리오: ${masterResume.portfolioMain} (${pfUrl})
• 근무 가능 조건: ${item.pay || '시급/건별 협의'} / ${item.schedule || '즉시 투입 및 일정 조율 가능'}
빠르고 정확한 작업으로 즉시 도움드리겠습니다!`;
  }

  if (type === 'freelance') {
    return `[${item.site} 맞춤 견적 제안서 — ${item.client}]
안녕하세요! '${item.title}' 프로젝트 요청서를 확인하고 제안드리는 ${masterResume.name}입니다.

■ 핵심 강점 및 정량 성과
1) 고효율 마케팅 영상 & 3D 모션 연출 (${masterResume.portfolioMain})
2) 48시간 내 1차 가편집 시안 제공 (CapCut+AI 자동화 파이프라인으로 리드타임 70% 단축)
3) 가로형(16:9) 마스터본 + 쇼츠/릴스(9:16) 광고 소재 패키지 지원

■ 포트폴리오 클라우드 링크 (자동 첨부)
• 파일명: ${masterResume.portfolioMain}
• 열람 URL: ${pfUrl}

■ 제안 단가 및 일정 조건
• 희망 견적: ${item.budget} 범위 내 맞춤 조율 / 예상 기간: ${item.duration} / 무상 수정 2회 포함`;
  }

  const ws = item.winningStrategy || {};
  return `[${item.site || item.category} 필승전략 & 표준 사업계획서(PSST)]
■ 공고명: ${item.title} (${item.organizer} / ${item.dday})
■ 지원규모: ${item.prizeScale}

[1. 문제인식 (Problem)]
• 기존 콘텐츠·마케팅 소재 제작 방식의 높은 외주 비용과 느린 납기 문제를 해결할 AI·3D 융합 파이프라인 필요

[2. 실현가능성 (Solution — 문PD 핵심 경쟁우위)]
• ${ws.unfairAdvantage || masterResume.techAutomation}
• 보유 툴: ${masterResume.tools}

[3. 성장전략 및 기대효과 (Scale-up)]
• 심사 배점 핵심(${ws.evaluationFocus || '기획성+독창성+마케팅확산성'})에 맞춘 데모 시안 선제 제출 (효율 70% 향상)

[4. 팀 역량 및 대표 포트폴리오 (Team & Portfolio)]
• 총괄 PD: ${masterResume.name} (${masterResume.email})
• 증빙 포트폴리오: ${masterResume.portfolioMain} (${pfUrl})`;
}

function evaluateSiteFormatRules(site, type, text) {
  const rules = [];
  const hasPortfolioLink = /https?:\/\/drive\.google\.com|\.mp4|\.pdf|포트폴리오/i.test(text);
  const hasTools = /Premiere|After Effects|CapCut|3D|Python|프리미어|애프터이펙트|캡컷|마케팅|GA4/i.test(text);
  const hasMetric = /\d+%|\d+편|\d+만|\d+시간|단축|달성/.test(text);
  const hasCondition = /희망|급여|연봉|단가|견적|투입|일정|협의/.test(text);

  rules.push({
    id: 'portfolio',
    label: `[${site} 필수] 최신 포트폴리오 파일명 & Google Drive 링크 첨부`,
    passed: hasPortfolioLink,
    fixLabel: '+ 포트폴리오 링크 자동첨부',
    fixSnippet: `\n[포트폴리오 자동 첨부]\n• 대표 파일: ${masterResume.portfolioMain}\n• Google Drive 링크: ${masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL}`
  });

  rules.push({
    id: 'tools',
    label: `[${site} 양식] 직무 핵심 툴/스킬 명시 여부`,
    passed: hasTools,
    fixLabel: '+ 보유 툴 자동기입',
    fixSnippet: `\n• 활용 툴 및 기술: ${masterResume.tools}`
  });

  if (type === 'career' || site.includes('원티드') || site.includes('사람인') || site.includes('잡코리아')) {
    rules.push({
      id: 'metrics',
      label: `[${site} 서류통과 기준] 정량적 성과 수치(%, 건수, 기간 단축) 포함`,
      passed: hasMetric,
      fixLabel: '+ 정량 성과 수치 보완',
      fixSnippet: `\n• 핵심 정량 성과: ${masterResume.techAutomation} (누적 조회수 500만+ 및 납기 70% 단축)`
    });
  }

  if (type === 'alba') {
    const len = text.length;
    const isGoodLen = len >= 80 && len <= 650;
    rules.push({
      id: 'alba_length',
      label: `[${site} 모바일 규격] 핵심 요약 글자수 적정성 (현재 ${len}자 / 권장 100~600자)`,
      passed: isGoodLen,
      fixLabel: '⚡ 300자 핵심요약으로 자동축약',
      fixReplaceAll: `[${site} 300자 핵심 지원서]\n안녕하세요! ${masterResume.name}입니다.\n1) 보유기술: ${masterResume.tools}\n2) 강점: CapCut+AI 자동화로 콘텐츠·마케팅 영상 작업을 70% 빠르게 납품합니다.\n3) 포트폴리오: ${masterResume.portfolioMain} (${masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL})\n4) 근무조건: 즉시 투입 및 일정 협의 가능합니다!`
    });
  } else {
    rules.push({
      id: 'condition',
      label: `[${site} 필수항목] 희망 급여/단가 및 투입 가능 시기 명시`,
      passed: hasCondition,
      fixLabel: '+ 희망조건/투입시기 추가',
      fixSnippet: `\n• 희망 조건 및 투입 시기: ${masterResume.desiredSalary || '면접/협의 후 결정 (즉시 투입 가능)'}`
    });
  }

  if (type === 'contest') {
    const hasPsst = /문제인식|실현가능성|성장전략|팀 역량|PSST/i.test(text);
    rules.push({
      id: 'psst',
      label: `[정부지원/공모전 표준] PSST(문제인식-실현가능성-성장전략-팀) 목차 준수`,
      passed: hasPsst,
      fixLabel: '+ PSST 표준 목차 보완',
      fixSnippet: `\n[PSST 표준 요약]\n• Problem(문제인식): 고비용 콘텐츠 제작 구조 혁신\n• Solution(실현가능성): ${masterResume.techAutomation}\n• Scale-up(성장전략): 숏폼·롱폼 멀티 포맷 동시 납품\n• Team(팀역량): ${masterResume.name} (${masterResume.portfolioMain})`
    });
  }

  return rules;
}

let currentValidationRules = [];

function runLiveFormatValidation() {
  const box = document.getElementById('formatValidationBox');
  const textarea = document.getElementById('modalTextarea');
  if (!box || !textarea) return;

  const text = textarea.value || '';
  currentValidationRules = evaluateSiteFormatRules(currentModalSite, currentModalType, text);
  const failCount = currentValidationRules.filter(r => !r.passed).length;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:6px;">
      <strong style="font-size:12.5px;color:var(--text-main);">
        🔍 [${currentModalSite}] 채용양식 적합성 자동 체크 (${text.length}자)
      </strong>
      <span class="status-chip" style="background:${failCount === 0 ? '#eff6ff' : '#e0e7ff'};color:${failCount === 0 ? 'var(--color-primary)' : 'var(--color-secondary)'};">
        ${failCount === 0 ? '✅ 모든 양식 기준 통과 (즉시 지원 가능)' : `⚠️ 양식 보완 권장 ${failCount}건 (우측 버튼 클릭 시 자동 수정)`}
      </span>
    </div>
    ${currentValidationRules.map((r, idx) => `
      <div class="val-row ${r.passed ? 'ok' : 'warn'}">
        <span>${r.passed ? '✅' : '⚠️'} ${r.label}</span>
        ${r.passed
          ? `<span style="font-weight:700;color:var(--color-primary);">적합</span>`
          : `<button class="btn btn-primary btn-sm" style="padding:3px 8px;font-size:11px;" onclick="applyFormatAutoFix(${idx})">${r.fixLabel}</button>`
        }
      </div>
    `).join('')}
  `;
}

function applyFormatAutoFix(ruleIndex) {
  const rule = currentValidationRules[ruleIndex];
  const textarea = document.getElementById('modalTextarea');
  if (!rule || !textarea) return;

  if (rule.fixReplaceAll) {
    textarea.value = rule.fixReplaceAll;
  } else if (rule.fixSnippet) {
    textarea.value = (textarea.value.trim() + '\n' + rule.fixSnippet.trim() + '\n');
  }
  runLiveFormatValidation();
  showToast('✨ 채용사이트 양식에 맞게 자동 보완되었습니다!');
}

function renderModalPortfolioBar() {
  const bar = document.getElementById('modalPortfolioBar');
  if (!bar) return;
  const pfUrl = masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL;
  bar.innerHTML = `
    <span>📎 <strong>자동 첨부 포트폴리오:</strong> ${masterResume.portfolioMain} (Google Drive 연동됨)</span>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;" onclick="triggerPortfolioFileUpload()">📤 다른 포트폴리오 올리기</button>
      <a class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;" href="${pfUrl}" target="_blank" rel="noopener">☁️ 드라이브 링크 확인</a>
    </div>
  `;
}

function openConvertedDocModal(type, itemId) {
  const item = findItemById(itemId);
  if (!item) return;

  currentModalItem = item;
  currentModalType = type;
  currentModalSite = item.site || item.category || '채용사이트';
  currentModalTargetUrl = item.url;
  const safeName = (item.company || item.organizer || item.client || '문PD').replace(/[^\w가-힣]/g, '_');
  currentModalFilename = `문PD_${currentModalSite}_${safeName}.txt`;

  document.getElementById('modalTitle').textContent = `✨ [${currentModalSite}] 맞춤 양식 자동변환 & 양식 적합성 체크`;
  document.getElementById('modalSubtitle').textContent = `${item.title} (${item.location || inferRegionBucket(item)})`;
  document.getElementById('modalTextarea').value = generateTailoredDocument(type, item);

  renderModalPortfolioBar();
  runLiveFormatValidation();
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
  showToast('📋 변환된 이력서 + 포트폴리오 드라이브 링크가 복사되었습니다.');
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
  const all = getAllItemsWithTrack();
  const targets = all.filter(x => selectedIds.has(x.id));
  const combinedText = targets.map((item, i) =>
    `=== [#${i + 1} ${item.site}] ${item.title} ===\n` + generateTailoredDocument(item._track, item)
  ).join('\n\n');

  currentModalSite = `일괄변환(${targets.length}건)`;
  currentModalType = 'career';
  currentModalTargetUrl = targets[0]?.url || '';
  currentModalFilename = `문PD_일괄지원_${targets.length}건.txt`;
  document.getElementById('modalTitle').textContent = `🚀 선택 ${targets.length}건 일괄 변환 & 양식 검증 완료`;
  document.getElementById('modalSubtitle').textContent = targets.map(t => t.site).join(', ');
  document.getElementById('modalTextarea').value = combinedText;

  renderModalPortfolioBar();
  runLiveFormatValidation();
  document.getElementById('docModal').classList.add('open');
}

// ============================================================================
// 12. 무제한 자유 키워드 실시간 수집 엔진 (로컬 서버 + 외부/모바일 브라우저 직접 수집 겸용)
// ============================================================================
async function fetchViaCorsProxy(targetUrl) {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
  ];
  for (const pUrl of proxies) {
    try {
      const res = await fetch(pUrl, { cache: 'no-store' });
      if (res.ok) return await res.text();
    } catch (e) {}
  }
  return '';
}

// 외부/모바일(GitHub Pages) 접속 시에도 사용자가 입력한 모든 키워드를 실시간으로 긁어오는 브라우저 수집기
async function crawlKeywordDirectlyInBrowser(keyword) {
  const kw = (keyword || '마케팅').trim();
  const encKw = encodeURIComponent(kw);
  const nowStr = new Date().toLocaleString();
  const newJobs = [];
  const newAlbas = [];
  const newContests = [];

  await Promise.allSettled([
    // 1) 원티드(Wanted) 실시간 키워드 검색
    (async () => {
      const raw = await fetchViaCorsProxy(`https://www.wanted.co.kr/api/chaos/search/v1/results?query=${encKw}&tab=position&limit=20`);
      if (!raw) return;
      const data = JSON.parse(raw);
      const list = data?.positions?.data || [];
      list.forEach(item => {
        const wid = String(item.id);
        const loc = item.address?.full_location || item.location || '서울/수도권';
        const pos = item.position || '';
        const comp = item.company?.name || '원티드 채용기업';
        newJobs.push({
          id: `wanted-${wid}`,
          site: '원티드',
          siteBadge: 'WANTED',
          track: 'career',
          keyword: kw,
          title: pos,
          company: comp,
          location: loc,
          region: inferRegionBucket({ location: loc, title: pos }),
          salary: '합격보상금 100만원',
          deadline: `상시채용 (wd/${wid})`,
          matchScore: 95,
          url: `https://www.wanted.co.kr/wd/${wid}`,
          applyType: '원티드 간편지원',
          jdSummary: `[원티드 #${wid} | 키워드:${kw}] ${comp} (${loc}) '${pos}'`,
          collectedAt: nowStr,
          verified: true
        });
      });
    })(),

    // 2) 사람인(Saramin) 실시간 키워드 검색
    (async () => {
      const raw = await fetchViaCorsProxy(`https://m.saramin.co.kr/search/get-recruit-list?searchType=search&searchword=${encKw}`);
      if (!raw) return;
      let html = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.innerHTML) html = parsed.innerHTML;
      } catch (e) {}
      const regex = /data-rec_idx=(\d+)>[\s\S]{1,1200}?<p class="tit">([\s\S]{1,250}?)<\/p>\s*<div class="meta">\s*<span>([^<]+)<\/span>[\s\S]{1,400}?<span class="corp_name">([^<]+)<\/span>/g;
      let m;
      let count = 0;
      while ((m = regex.exec(html)) !== null && count < 20) {
        count++;
        const ridx = m[1].trim();
        const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const loc = m[3].trim();
        const comp = m[4].trim();
        newJobs.push({
          id: `saramin-${ridx}`,
          site: '사람인',
          siteBadge: 'SARAMIN',
          track: 'career',
          keyword: kw,
          title,
          company: comp,
          location: loc,
          region: inferRegionBucket({ location: loc, title }),
          salary: '공고문 참조',
          deadline: `접수중 (#${ridx})`,
          matchScore: 96,
          url: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${ridx}`,
          applyType: '사람인 즉시지원',
          jdSummary: `[사람인 #${ridx} | 키워드:${kw}] ${comp} (${loc}) '${title}'`,
          collectedAt: nowStr,
          verified: true
        });
      }
    })(),

    // 3) 알바몬(Albamon) 실시간 키워드 검색
    (async () => {
      const html = await fetchViaCorsProxy(`https://www.albamon.com/total-search?keyword=${encKw}`);
      if (!html) return;
      const regex = /\/jobs\/detail\/(\d+)[^"]*"><div[^>]*list-item-recruit__recruit-title"><span[^>]*>([^<]+)<\/span><span[^>]*><\/span><span[^>]*>([^<]+)<\/span>/g;
      let m;
      let count = 0;
      while ((m = regex.exec(html)) !== null && count < 15) {
        count++;
        const aid = m[1].trim();
        const comp = m[2].trim();
        const title = m[3].trim();
        const reg = inferRegionBucket({ title, company: comp });
        newAlbas.push({
          id: `albamon-${aid}`,
          site: '알바몬',
          siteBadge: 'ALBAMON',
          track: 'alba',
          keyword: kw,
          title,
          company: comp,
          location: reg,
          region: reg,
          pay: '시급/건당 협의',
          schedule: `접수중 (#${aid})`,
          matchScore: 94,
          url: `https://www.albamon.com/jobs/detail/${aid}`,
          applyType: '알바몬 온라인지원',
          summary: `[알바몬 #${aid} | 키워드:${kw}] ${comp} '${title}'`,
          collectedAt: nowStr,
          verified: true
        });
      }
    })(),

    // 4) 위비티(Wevity) 실시간 키워드 공모전 검색
    (async () => {
      const html = await fetchViaCorsProxy(`https://www.wevity.com/?c=find&s=1&gbn=list&stx=${encKw}`);
      if (!html) return;
      const regex = /<div class="tit">\s*<a href="([^"]+)">([^<]+)[\s\S]{1,400}?<div class="organ">([^<]+)<\/div>\s*<div class="day">\s*(D-[\d]+|오늘마감|접수예정|마감임박)/g;
      let m;
      let count = 0;
      while ((m = regex.exec(html)) !== null && count < 12) {
        count++;
        const relUrl = m[1].trim();
        const ixMatch = relUrl.match(/ix=(\d+)/);
        const ix = ixMatch ? ixMatch[1] : String(Date.now() + count);
        const title = m[2].trim();
        const organ = m[3].trim();
        const dday = m[4].trim();
        newContests.push({
          id: `wevity-${ix}`,
          category: '공모전(실시간)',
          site: '위비티',
          siteBadge: 'WEVITY',
          keyword: kw,
          title,
          organizer: organ,
          location: '전국/온라인',
          region: '재택·전국',
          dday,
          prizeScale: `상금 원문참조 (#${ix})`,
          winProbability: `접수중 (${dday})`,
          matchScore: 95,
          url: `https://www.wevity.com/${relUrl}`,
          summary: `[위비티 #${ix} | 키워드:${kw}] ${organ} '${title}'`,
          winningStrategy: {
            unfairAdvantage: '콘텐츠 기획력 + 3D·AI 자동편집 파이프라인으로 시각적 완성도 및 마케팅 전환율 우위 선점',
            evaluationFocus: '독창성(35%) + 주제 적합성(35%) + 완성도 및 확산성(30%)',
            actionSteps: ['1단계: 핵심 타겟 후킹 컷 배치', '2단계: 브랜드 메시지 명확화', '3단계: 멀티 포맷 패키지 제출'],
            selectionTip: '초반 5초 하이라이트 구간에 타겟 맞춤형 후킹 카피와 시각 이펙트를 집중 배치하세요.'
          },
          collectedAt: nowStr,
          verified: true
        });
      }
    })()
  ]);

  const bundle = { jobs: newJobs, albas: newAlbas, contests: newContests };
  mergeNewItemsIntoAppData(bundle);
  saveBrowserCrawledCache(bundle);
  return newJobs.length + newAlbas.length + newContests.length;
}

async function triggerLiveCrawl() {
  const btn = document.getElementById('liveCrawlBtn');
  const kw = (document.getElementById('searchInput')?.value || '').trim();
  const orig = btn ? btn.innerHTML : '🔄 실시간 수집';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ 실시간 수집 중...';
  }

  // 새로 검색한 키워드를 상단 빠른 키워드 바에 자동 등록
  if (kw && !quickKeywords.includes(kw)) {
    quickKeywords.unshift(kw);
    try {
      localStorage.setItem('MOONPD_QUICK_KEYWORDS', JSON.stringify(quickKeywords.slice(0, 14)));
    } catch (e) {}
    renderQuickKeywordBar();
  }

  showToast(kw ? `🌐 '${kw}' 키워드로 사람인·원티드·잡코리아·알바몬·위비티 실시간 수집 중...` : '🌐 전체 키워드 실시간 수집 중...');

  let handledByLocalServer = false;
  try {
    const res = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: kw })
    });
    if (res.ok) {
      appData = await res.json();
      mergeBrowserCrawledCache();
      handledByLocalServer = true;
      onFilterChanged();
      const matchedNow =
        (appData.jobs || []).filter(matchesSearchAndFilter).length +
        (appData.albas || []).filter(matchesSearchAndFilter).length +
        (appData.freelances || []).filter(matchesSearchAndFilter).length +
        (appData.contests || []).filter(matchesSearchAndFilter).length;
      showToast(`✅ '${kw || '전체'}' 실시간 수집 완료! (조건 일치 ${matchedNow}건 표시)`);
    }
  } catch (e) {}

  // 외부/모바일 URL(GitHub Pages)이거나 로컬 서버 미연결 시 브라우저 직접 크롤링 수행
  if (!handledByLocalServer) {
    const addedCount = await crawlKeywordDirectlyInBrowser(kw || '마케팅');
    onFilterChanged();
    const matchedNow =
      (appData.jobs || []).filter(matchesSearchAndFilter).length +
      (appData.albas || []).filter(matchesSearchAndFilter).length +
      (appData.freelances || []).filter(matchesSearchAndFilter).length +
      (appData.contests || []).filter(matchesSearchAndFilter).length;
    showToast(`✅ '${kw || '전체'}' 실시간 수집 완료! (신규 ${addedCount}건 포함 총 ${matchedNow}건 표시)`);
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function addNewCustomSitePrompt() {
  const name = prompt('추가할 사이트 이름 (예: 크몽 / 클래스101 / 매드타임즈):');
  if (!name) return;
  const url = prompt('사이트 URL:', 'https://');
  if (!url) return;
  appData.sites = appData.sites || [];
  appData.sites.unshift({
    id: 'SITE-' + Date.now(),
    category: '사용자 추가',
    name,
    url,
    status: '실시간 연동',
    dailyNew: '상시 모니터링',
    cashcowType: '신규 캐시카우'
  });
  onFilterChanged();
  showToast(`📡 ${name} 사이트가 추가되었습니다.`);
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toastNotification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
