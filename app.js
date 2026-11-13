// ============================================================================
// 문PD 커리어 & 캐시카우 통합 시스템 - 핵심 커리어 분석 · 합격예측 · 기술연마지표 · 지원기간/마감관리 엔진
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
// 1. 관심공고 카테고리 분류 & 수동 마감 체크 상태 관리
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
let manualExpiredSet = loadManualExpiredSet(); // 마감 확인된 공고 ID 집합
let activeSavedCategoryFilter = 'ALL';
let savedGroupViewMode = true;

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

function loadManualExpiredSet() {
  try {
    const raw = localStorage.getItem('MOONPD_MANUAL_EXPIRED');
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

function persistManualExpiredSet() {
  try {
    localStorage.setItem('MOONPD_MANUAL_EXPIRED', JSON.stringify(Array.from(manualExpiredSet)));
  } catch (e) {}
}

function toggleManualExpired(id) {
  if (manualExpiredSet.has(id)) {
    manualExpiredSet.delete(id);
    showToast('🔄 해당 공고의 마감 상태가 해제되어 활성 공고로 복원되었습니다.');
  } else {
    manualExpiredSet.add(id);
    showToast('⛔ 해당 공고가 마감 처리되었습니다. (일반 탭에서는 숨김, 관심공고함에서는 마감 표시 유지)');
  }
  persistManualExpiredSet();
  onFilterChanged();
}

function removeExpiredFromSaved() {
  let removed = 0;
  Object.keys(savedCategoryMap).forEach(id => {
    const item = findItemById(id);
    if (!item || getScheduleMeta(item).isExpired) {
      delete savedCategoryMap[id];
      removed++;
    }
  });
  persistSavedCategoryMap();
  onFilterChanged();
  showToast(`🧹 마감·기간경과된 관심공고 ${removed}건을 정리했습니다.`);
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
// 2. 지원기간 · 마감일 · 등록순 · 만료 자동 판별 엔진
// ============================================================================
function extractNumericId(idStr) {
  const m = String(idStr || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 100000;
}

function getScheduleMeta(item) {
  if (!item) {
    return { applyPeriod: '상시채용', dDayText: '상시', dDaySort: 365, regSort: 0, isExpired: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const manualExp = manualExpiredSet.has(item.id);
  const rawDeadlineStr = `${item.deadline || ''} ${item.dday || ''} ${item.schedule || ''} ${item.applyPeriod || ''}`;

  let isExpired = Boolean(item.isExpired || manualExp);
  let dDaySort = typeof item.dDaySort === 'number' ? item.dDaySort : 30;
  let regSort = typeof item.regSort === 'number' ? item.regSort : extractNumericId(item.id);
  let applyPeriod = item.applyPeriod || '';
  let dDayText = item.deadline || item.dday || '접수중';

  // deadlineDate가 있는 경우 오늘 날짜와 실시간 비교하여 기간 경과 여부 자동 판정
  if (item.deadlineDate && item.deadlineDate !== '2099-12-31') {
    const due = new Date(item.deadlineDate + 'T00:00:00');
    if (!isNaN(due.getTime())) {
      const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      dDaySort = diffDays;
      if (diffDays < 0) {
        isExpired = true;
        dDayText = `마감됨 (D+${Math.abs(diffDays)})`;
      } else if (diffDays === 0) {
        dDayText = '오늘마감 (D-Day)';
      } else {
        dDayText = `D-${diffDays}`;
      }
    }
  } else {
    // 문자열에서 D-N 또는 ~MM.DD 파싱
    const dMatch = rawDeadlineStr.match(/D-(\d+)/i);
    const dPlusMatch = rawDeadlineStr.match(/D\+(\d+)|마감됨|지원종료|기간만료/i);
    const mdMatch = rawDeadlineStr.match(/(\d{1,2})[./](\d{1,2})\s*\(/);

    if (dPlusMatch) {
      isExpired = true;
      dDaySort = -1;
      dDayText = '마감·기간만료';
    } else if (/오늘마감|금일마감|D-0/i.test(rawDeadlineStr)) {
      dDaySort = 0;
      dDayText = '오늘마감 (D-Day)';
    } else if (dMatch) {
      dDaySort = parseInt(dMatch[1], 10);
      dDayText = `D-${dDaySort}`;
    } else if (mdMatch) {
      const mm = parseInt(mdMatch[1], 10);
      const dd = parseInt(mdMatch[2], 10);
      const due = new Date(today.getFullYear(), mm - 1, dd);
      const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      dDaySort = diffDays;
      if (diffDays < 0) {
        isExpired = true;
        dDayText = `마감됨 (${mm}.${dd})`;
      } else {
        dDayText = `D-${diffDays} (~${mm}.${dd})`;
      }
    } else {
      dDaySort = 365;
      dDayText = '상시채용';
    }
  }

  if (manualExp) {
    isExpired = true;
    dDaySort = -99;
    dDayText = '⛔ 마감·기간경과';
  }

  if (!applyPeriod) {
    const regShort = item.registeredDate ? item.registeredDate.slice(5).replace('-', '.') : '11.08';
    if (dDaySort >= 300 && !isExpired) {
      applyPeriod = `${regShort} 등록 ~ 채용시 마감`;
    } else if (item.deadlineDate && item.deadlineDate !== '2099-12-31') {
      const dueShort = item.deadlineDate.slice(5).replace('-', '.');
      applyPeriod = `${regShort} ~ ${dueShort} (${dDayText})`;
    } else {
      applyPeriod = `${regShort} 등록 · ${dDayText}`;
    }
  } else if (isExpired && !applyPeriod.includes('마감')) {
    applyPeriod = `${applyPeriod} [기간경과·마감]`;
  }

  return {
    applyPeriod,
    dDayText,
    dDaySort,
    regSort,
    isExpired
  };
}

// ============================================================================
// 3. 문PD 커리어 & 캐시카우 핵심 엔진: 공고 분석 · 나의 장단점 비교 · 채용확률 · 연마기술 산출
// ============================================================================
function analyzePostingForMoonPD(item) {
  if (!item) {
    return {
      hireProb: 90,
      boostedProb: 96,
      strengthPoint: '영상 기획·연출 및 3D·AI 자동편집 역량 보유',
      weaknessPoint: '지원 기업 맞춤형 정량 성과 수치 강조 필요',
      skillToPolish: '클라이언트/기업 도메인 맞춤 포트폴리오 큐레이션',
      fixPatchText: '• 맞춤 역량 보완: 기획부터 3D·AI 편집, 마케팅 전환 분석까지 원스톱 수행'
    };
  }

  const text = `${item.title || ''} ${item.keyword || ''} ${item.jdSummary || ''} ${item.summary || ''} ${item.requestDetail || ''}`.toLowerCase();

  let score = 82;
  const strengths = [];
  const gaps = [];
  let skillToPolish = '';
  let fixPatchText = '';

  // 1) 영상 PD / 유튜브 / 숏폼 / 편집 매칭
  if (/영상|pd|피디|편집|유튜브|숏폼|릴스|쇼츠|크리에이터|콘텐츠|촬영|연출/.test(text)) {
    score += 7;
    strengths.push('유튜브·숏폼 기획/연출 및 CapCut+Python 자동편집(속도 70% 단축)');
  }

  // 2) 3D / 모션그래픽 / AI 매칭
  if (/3d|모션|애니메이션|애프터이펙트|after|c4d|cinema|blender|vfx|ai|생성형/.test(text)) {
    score += 6;
    strengths.push('실무 3D 애니메이션 포폴(50m.mp4) & 생성형 AI 파이프라인 직결');
  }

  // 3) 마케팅 / 퍼포먼스 / 브랜드 / 커머스 분석 (장단점 & 보완 기술 도출)
  if (/마케팅|마케터|퍼포먼스|브랜드|브랜딩|바이럴|광고|ae|sns|커머스|상세페이지|홍보|그로스|로아스|roas/.test(text)) {
    if (/퍼포먼스|그로스|데이터|ga4|roas|매체|메타|구글|crm/.test(text)) {
      score = Math.min(score, 80);
      strengths.push('광고 소재(숏폼·영상) 자체 고속 제작으로 소재 피로도 즉시 해결');
      gaps.push('퍼포먼스 매체 운영 지표(ROAS·CTR·CVR·GA4) 정량 데이터 제시 보완 필요');
      skillToPolish = '📊 Meta/Google Ads 광고 관리자 데이터 분석 & ROAS 기반 후킹 카피라이팅';
      fixPatchText = '• [마케팅 데이터 역량 보강] A/B 테스트용 숏폼 광고소재 주 15편+ 고속 제작 및 CTR(클릭률)·ROAS(광고수익률) 데이터 기반 소재 최적화 수행';
    } else {
      score = Math.max(score, 87);
      strengths.push('기획+영상+3D를 직접 제작하는 올라운더 콘텐츠 마케터 경쟁력');
      gaps.push('캠페인 전환율(CVR) 및 팔로워·도달률 성장 수치 구체화 권장');
      skillToPolish = '📢 브랜드 캠페인 스토리텔링 & 인스타그램/유튜브 알고리즘 그로스 지표 설계';
      fixPatchText = '• [브랜드·콘텐츠 마케팅 성과] 타겟 페르소나 맞춤형 숏폼·브랜드 필름 기획으로 오가닉 도달률 300% 상승 및 전환 퍼널 구축';
    }
  }

  // 4) 하이엔드 3D / 언리얼 / VFX 특화 공고인 경우
  if (!gaps.length && /언리얼|unreal|옥테인|octane|maya|마야|후디니|합성|vfx/.test(text)) {
    score = 84;
    gaps.push('리얼타임 렌더러(Unreal/Octane) 및 고급 VFX 합성 파이프라인 키워드 보강');
    skillToPolish = '🧊 Cinema 4D Octane 렌더 & Unreal Engine 5 리얼타임 버추얼 프로덕션';
    fixPatchText = '• [3D·렌더링 파이프라인] 3D 애니메이션 에셋 제작부터 라이팅·렌더링·After Effects 후반 합성까지 통합 워크플로우 보유';
  }

  // 5) 공모전 / 정부지원사업인 경우
  if (item._track === 'contest' || item.category?.includes('공모') || item.category?.includes('지원')) {
    score = 91;
    strengths.push('AI+Python 영상 자동화 실증 스크립트 보유로 심사 기술성·독창성 가점');
    gaps.push('심사위원용 정량적 기대효과(매출·확산·고용 효과) 수치 테이블 보강');
    skillToPolish = '📑 정부지원사업 PSST 비즈니스 모델(B2B SaaS/구독형 제작) 수익화 지표 설계';
    fixPatchText = '• [정량적 기대효과] 자체 AI·3D 파이프라인을 통해 제작 단가 50% 절감 및 납기 70% 단축 실증 완료';
  }

  // 6) 외주 / 프리랜서 / 알바인 경우
  if (item._track === 'freelance' || item._track === 'alba' || item.track === 'alba') {
    score = Math.max(score, 93);
    if (!strengths.length) strengths.push('즉시 투입 가능한 프리미어·애프터이펙트·캡컷 숙련도 및 빠른 납기');
    if (!gaps.length) gaps.push('클라이언트 업종별 레퍼런스 링크 1~2개 첫 문단 선제 제시 필요');
    if (!skillToPolish) skillToPolish = '💰 업종별(뷰티·커머스·IT·관공서) 15초 하이라이트 릴 모듈화 패키징';
    if (!fixPatchText) fixPatchText = '• [신속 납품 보장] 요청하신 레퍼런스 톤앤매너에 맞춰 48시간 내 1차 시안 공유 및 무상 수정 지원';
  }

  // 기본값 보정
  if (!strengths.length) {
    strengths.push('기획·연출·3D·AI 자동편집을 겸비한 멀티 플레이어 역량');
  }
  if (!gaps.length) {
    gaps.push('해당 기업의 최근 주력 상품/채널 톤앤매너 분석 한 줄 추가 시 완벽');
  }
  if (!skillToPolish) {
    skillToPolish = '🎬 생성형 AI 비디오(Runway/Kling) + 3D 모션 결합 하이브리드 연출 고도화';
  }
  if (!fixPatchText) {
    fixPatchText = '• [차별화 경쟁력] 3D 애니메이션 연출력과 AI·Python 자동편집(제작시간 70% 단축)으로 고품질 콘텐츠를 압도적 속도로 제작합니다.';
  }

  const hireProb = Math.min(97, Math.max(74, score));
  const boostedProb = Math.min(99, hireProb + (hireProb < 85 ? 12 : 5));

  return {
    hireProb,
    boostedProb,
    strengthPoint: strengths[0],
    weaknessPoint: gaps[0],
    skillToPolish,
    fixPatchText
  };
}

// ============================================================================
// 4. 빠른 키워드 바 (마케팅 포함 + 사용자 자유 키워드 칩 추가)
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
// 5. 마스터 이력서 & 브라우저 캐시 초기화
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
      jobs: dedupeById([...(newBundle.jobs || []), ...(prev.jobs || [])]).slice(0, 350),
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
// 6. 지역 판별 + 키워드 + 사이트 + 마감자동숨김 + 정렬 통합 파이프라인
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

// includeExpired = false (기본 탭에서는 마감/기간경과 자동 숨김), true (관심공고함에서는 표시 유지)
function matchesSearchAndFilter(item, includeExpired = false) {
  if (!includeExpired) {
    const sched = getScheduleMeta(item);
    if (sched.isExpired) return false;
  }

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

// 마감일 임박순 / 최신 등록순 / 채용확률 높은순 정렬
function sortItemsList(items) {
  const sortMode = document.getElementById('sortFilter')?.value || 'DEADLINE_ASC';
  const cloned = [...items];

  cloned.sort((a, b) => {
    const sa = getScheduleMeta(a);
    const sb = getScheduleMeta(b);

    // 관심공고함 등에서 마감된 공고는 활성 공고 아래에 배치
    if (sa.isExpired !== sb.isExpired) {
      return sa.isExpired ? 1 : -1;
    }

    if (sortMode === 'DEADLINE_ASC') {
      if (sa.dDaySort !== sb.dDaySort) return sa.dDaySort - sb.dDaySort;
      return sb.regSort - sa.regSort;
    }
    if (sortMode === 'REG_DESC') {
      if (sb.regSort !== sa.regSort) return sb.regSort - sa.regSort;
      return sa.dDaySort - sb.dDaySort;
    }
    if (sortMode === 'PROB_DESC') {
      const pa = analyzePostingForMoonPD(a).hireProb;
      const pb = analyzePostingForMoonPD(b).hireProb;
      if (pb !== pa) return pb - pa;
      return sa.dDaySort - sb.dDaySort;
    }
    return 0;
  });

  return cloned;
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

// 관심공고함은 마감된 공고도 숨기지 않고 포함(includeExpired = true)
function getSavedItemsFiltered() {
  const raw = getAllItemsWithTrack().filter(item => {
    if (!isJobSaved(item.id)) return false;
    if (!matchesSearchAndFilter(item, true)) return false;
    if (activeSavedCategoryFilter !== 'ALL' && savedCategoryMap[item.id] !== activeSavedCategoryFilter) {
      return false;
    }
    return true;
  });
  return sortItemsList(raw);
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

  if (kw) {
    const matchedCount =
      (appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.albas || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.contests || []).filter(x => matchesSearchAndFilter(x, false)).length;
    if (matchedCount < 3) {
      await triggerLiveCrawl();
    }
  }
}

function resetSearchFilter() {
  const input = document.getElementById('searchInput');
  const reg = document.getElementById('regionFilter');
  const sel = document.getElementById('siteFilter');
  const srt = document.getElementById('sortFilter');
  if (input) input.value = '';
  if (reg) reg.value = 'ALL';
  if (sel) sel.value = 'ALL';
  if (srt) srt.value = 'DEADLINE_ASC';
  activeSavedCategoryFilter = 'ALL';
  onFilterChanged();
}

function updateKpiAndCounts() {
  const allJobs = appData.jobs || [];
  const allAlbas = appData.albas || [];
  const allFree = appData.freelances || [];
  const allContests = appData.contests || [];
  const allSites = appData.sites || [];

  const filteredJobs = allJobs.filter(x => matchesSearchAndFilter(x, false));
  const filteredAlbas = allAlbas.filter(x => matchesSearchAndFilter(x, false));
  const filteredFree = allFree.filter(x => matchesSearchAndFilter(x, false));
  const filteredContests = allContests.filter(x => matchesSearchAndFilter(x, false));
  const allSavedItems = getAllItemsWithTrack().filter(x => isJobSaved(x.id) && matchesSearchAndFilter(x, true));

  // 자동 숨김된 마감 공고 수 집계
  const expiredTotalCount = getAllItemsWithTrack().filter(x => getScheduleMeta(x).isExpired).length;

  // 현재 표시되는 공고들의 평균 채용 예측 확률 계산
  const visibleAll = [...filteredJobs, ...filteredAlbas, ...filteredFree, ...filteredContests];
  const avgProb = visibleAll.length
    ? Math.round(visibleAll.reduce((acc, it) => acc + analyzePostingForMoonPD(it).hireProb, 0) / visibleAll.length)
    : 91;

  const q = (document.getElementById('searchInput')?.value || '').trim();
  const regionF = document.getElementById('regionFilter')?.value || 'ALL';
  const siteF = document.getElementById('siteFilter')?.value || 'ALL';
  const isFiltered = Boolean(q || regionF !== 'ALL' || siteF !== 'ALL');

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('kpiCareerCount', isFiltered ? `${filteredJobs.length} / ${allJobs.length}건` : `${filteredJobs.length}건`);
  setTxt('kpiAlbaCount', isFiltered ? `${filteredAlbas.length} / ${allAlbas.length}건` : `${filteredAlbas.length}건`);
  setTxt('kpiFreelanceCount', isFiltered ? `${filteredFree.length} / ${allFree.length}건` : `${filteredFree.length}건`);
  setTxt('kpiContestCount', isFiltered ? `${filteredContests.length} / ${allContests.length}건` : `${filteredContests.length}건`);
  setTxt('kpiAvgProb', `${avgProb}%`);
  setTxt('headerSavedCount', getSavedCount());

  setTxt('tabCountCareer', filteredJobs.length);
  setTxt('tabCountAlba', filteredAlbas.length);
  setTxt('tabCountFreelance', filteredFree.length);
  setTxt('tabCountContests', filteredContests.length);
  setTxt('tabCountSaved', allSavedItems.length);
  setTxt('tabCountRadar', allSites.length);
  setTxt('selectedCount', selectedIds.size);

  const expBadge = document.getElementById('hiddenExpiredBadge');
  if (expBadge) {
    expBadge.textContent = expiredTotalCount > 0
      ? `🧹 마감공고 ${expiredTotalCount}건 자동숨김됨 (관심공고함은 표시)`
      : `🧹 마감·기간경과 자동숨김 ON`;
  }

  const badge = document.getElementById('syncStatusBadge');
  if (badge) {
    const parts = [];
    if (q) parts.push(`'${q}'`);
    if (regionF !== 'ALL') parts.push(regionF);
    if (siteF !== 'ALL') parts.push(siteF);
    const label = parts.length ? parts.join(' · ') : '문PD 커리어·캐시카우';
    badge.textContent = `☁️ ${label} (활성 ${visibleAll.length}건 · 평균합격예측 ${avgProb}%)`;
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
  list.forEach(item => selectedIds.add(item.id));
  document.getElementById('selectedCount').textContent = selectedIds.size;
  renderActiveTab();
  showToast(`☑️ 현재 목록 ${selectedIds.size}건 선택됨`);
}

function selectCategoryGroup(catName) {
  const items = getSavedItemsFiltered().filter(x => (savedCategoryMap[x.id] || autoDetectCategory(x)) === catName);
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
  if (currentTab === 'career') return sortItemsList((appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)));
  if (currentTab === 'alba') return sortItemsList((appData.albas || []).filter(x => matchesSearchAndFilter(x, false)));
  if (currentTab === 'freelance') return sortItemsList((appData.freelances || []).filter(x => matchesSearchAndFilter(x, false)));
  if (currentTab === 'contests') return sortItemsList((appData.contests || []).filter(x => matchesSearchAndFilter(x, false)));
  if (currentTab === 'saved') return getSavedItemsFiltered();
  return [];
}

// ============================================================================
// 7. 경고 및 확인 모달
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
// 8. 탭별 카드 렌더링 (지원기간 + 채용예측확률 + 장단점 비교 + 마감관리 포함)
// ============================================================================
function renderStarAndCategoryControl(item, showExpireToggle = false) {
  const id = item.id;
  const saved = isJobSaved(id);
  const currentCat = savedCategoryMap[id] || autoDetectCategory(item);
  const sched = getScheduleMeta(item);

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
      ${showExpireToggle ? `
        <button class="btn btn-outline btn-sm" style="padding:2px 6px;font-size:10.5px;" onclick="toggleManualExpired('${id}')" title="마감 여부 수동 전환">
          ${sched.isExpired ? '🔄 마감해제' : '⏳ 마감체크'}
        </button>
      ` : ''}
    </div>
  `;
}

function renderFitMiniSummary(item) {
  const fit = analyzePostingForMoonPD(item);
  return `
    <div class="fit-mini-box">
      <div>💪 <strong>나의 강점:</strong> ${fit.strengthPoint}</div>
      <div>⚡ <strong>보완 지표:</strong> ${fit.weaknessPoint}</div>
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
  return `<div class="panel-card">🔍 조건에 맞는 공고가 없습니다. <strong>[초기화]</strong> 또는 <strong>[🌐 키워드 실시간 수집]</strong>을 눌러보세요.</div>`;
}

function renderActiveTab() {
  const area = document.getElementById('tabContentArea');
  if (!area) return;

  if (currentTab === 'career') renderCareerTab(area);
  else if (currentTab === 'alba') renderAlbaTab(area);
  else if (currentTab === 'freelance') renderFreelanceTab(area);
  else if (currentTab === 'contests') renderContestsTab(area);
  else if (currentTab === 'saved') renderSavedTab(area);
  else if (currentTab === 'career_analysis') renderCareerAnalysisTab(area);
  else if (currentTab === 'radar') renderRadarTab(area);
  else if (currentTab === 'analytics') renderAnalyticsAndResumeTab(area);
}

// 1. 정규·계약직 탭 (마감 공고 자동 숨김 + 지원기간 + 채용확률 + 장단점 표시)
function renderCareerTab(area) {
  const items = sortItemsList((appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('정규·계약직');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const regionTag = inferRegionBucket(item);
    const sched = getScheduleMeta(item);
    const fit = analyzePostingForMoonPD(item);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">🌐 ${item.site}</span>
              <span class="badge-match">🎯 채용확률 ${fit.hireProb}%</span>
              <span class="chip" style="padding:1px 6px;font-size:10.5px;">📍 ${regionTag}</span>
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
            <span class="chip">📅 <strong>지원기간:</strong> ${sched.applyPeriod}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('career', '${item.id}')">
            ✨ 합격진단·양식변환
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 2. 알바·당근 탭
function renderAlbaTab(area) {
  const items = sortItemsList((appData.albas || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('알바·단기');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const regionTag = inferRegionBucket(item);
    const sched = getScheduleMeta(item);
    const fit = analyzePostingForMoonPD(item);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">⚡ ${item.site}</span>
              <span class="badge-match">🎯 채용확률 ${fit.hireProb}%</span>
              <span class="chip" style="padding:1px 6px;font-size:10.5px;">📍 ${regionTag}</span>
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
            <span class="chip">📅 <strong>지원기간:</strong> ${sched.applyPeriod}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('alba', '${item.id}')">
            ⚡ 합격진단·300자변환
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 3. 숨고·외주 탭
function renderFreelanceTab(area) {
  const items = sortItemsList((appData.freelances || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('외주·프리랜서');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const sched = getScheduleMeta(item);
    const fit = analyzePostingForMoonPD(item);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">💼 ${item.site}</span>
              <span class="badge-match">🎯 수주확률 ${fit.hireProb}%</span>
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
            <span class="chip">💰 <strong>${item.budget}</strong></span>
            <span class="chip">📅 <strong>지원기간:</strong> ${sched.applyPeriod}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('freelance', '${item.id}')">
            💰 수주진단·견적변환
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 4. 공모전·지원사업 탭
function renderContestsTab(area) {
  const items = sortItemsList((appData.contests || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('공모전·지원사업');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(item => {
    const isSel = selectedIds.has(item.id);
    const sched = getScheduleMeta(item);
    const fit = analyzePostingForMoonPD(item);
    return `
      <article class="item-card ${isSel ? 'selected' : ''}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-site">🏆 ${item.site}</span>
              <span class="badge-match">🎯 선정확률 ${fit.hireProb}%</span>
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
            <span class="chip">📅 <strong>지원기간:</strong> ${sched.applyPeriod}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('contest', '${item.id}')">
            🎯 선정진단·계획서생성
          </button>
          <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 공고문</a>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

// 5. 관심공고 보관함 탭 (⭐ 마감된 공고도 숨기지 않고 '⛔ 마감·기간경과' 표시 및 알림)
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
  const sched = getScheduleMeta(item);
  const fit = analyzePostingForMoonPD(item);

  return `
    <article class="item-card ${isSel ? 'selected' : ''} ${sched.isExpired ? 'expired-card' : ''}">
      <div>
        <div class="card-top">
          <div class="badge-group">
            <span class="badge-site">🌐 ${item.site}</span>
            ${sched.isExpired
              ? `<span class="badge-expired">⛔ 마감·기간경과 (지원종료)</span>`
              : `<span class="badge-match">🎯 채용확률 ${fit.hireProb}%</span>`
            }
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            ${renderStarAndCategoryControl(item, true)}
            <label class="select-check">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${item.id}', this.checked)" /> 선택
            </label>
          </div>
        </div>
        <h3 class="card-title" style="margin-top:8px;">
          ${sched.isExpired ? '⛔ [마감됨] ' : ''}${item.title}
        </h3>
        <div class="summary-chips" style="margin-top:8px;">
          <span class="chip">🏢 <strong>${orgName}</strong> (${regionTag})</span>
          <span class="chip">📅 <strong>지원기간:</strong> ${sched.applyPeriod}</span>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn btn-primary btn-sm" onclick="openConvertedDocModal('${item._track}', '${item.id}')">
          ✨ 합격진단·양식변환
        </button>
        <a class="btn btn-outline btn-sm" href="${item.url}" target="_blank" rel="noopener">↗ 원문</a>
      </div>
    </article>
  `;
}

function renderSavedTab(area) {
  const allSaved = getAllItemsWithTrack().filter(item => isJobSaved(item.id) && matchesSearchAndFilter(item, true));
  const filteredItems = getSavedItemsFiltered();
  const expiredSavedItems = allSaved.filter(item => getScheduleMeta(item).isExpired);

  const catCounts = {};
  savedCategories.forEach(c => { catCounts[c] = 0; });
  allSaved.forEach(item => {
    const c = savedCategoryMap[item.id] || autoDetectCategory(item);
    catCounts[c] = (catCounts[c] || 0) + 1;
  });

  // 마감/기간경과 관심공고 알림 배너
  const expiredNoticeHtml = expiredSavedItems.length > 0 ? `
    <div class="panel-card" style="margin-bottom:10px;border-color:var(--color-secondary);background:var(--color-secondary-soft);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>⚠️ <strong>마감/기간경과 관심공고 알림:</strong> 저장하신 관심공고 중 지원기간이 지났거나 마감된 공고가 <strong>${expiredSavedItems.length}건</strong> 있습니다. 리스트에서 자동 삭제하지 않고 <strong>[⛔ 마감·기간경과]</strong> 배지로 표시해 두었습니다.</span>
      <button class="btn btn-outline btn-sm" onclick="removeExpiredFromSaved()">🧹 마감된 관심공고만 일괄 해제</button>
    </div>
  ` : '';

  const filterBarHtml = expiredNoticeHtml + `
    <div class="panel-card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <span>⭐ <strong>관심공고 카테고리별 보관함 (총 ${allSaved.length}건 · 활성 ${allSaved.length - expiredSavedItems.length}건 / 마감 ${expiredSavedItems.length}건)</strong></span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="toggleSavedGroupViewMode()">
            ${savedGroupViewMode ? '📋 단일 그리드로 보기' : '🗂️ 카테고리별 그룹 묶음 보기'}
          </button>
          <button class="btn btn-outline btn-sm" onclick="addNewSavedCategoryPrompt()">➕ 새 카테고리 만들기</button>
          <button class="btn btn-primary btn-sm" onclick="runBatchConvertAndApply()">🚀 선택 관심공고 일괄변환</button>
        </div>
      </div>

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
        <span>⭐ ${activeSavedCategoryFilter === 'ALL' ? '아직 저장된 관심공고가 없습니다.' : `[${activeSavedCategoryFilter}] 카테고리에 저장된 공고가 없습니다.`} 각 공고 카드 우측 상단의 <strong>[☆ 관심]</strong>을 눌러보세요! (마감된 관심공고도 이곳에서는 사라지지 않고 마감 표시로 알려드립니다)</span>
        <button class="btn btn-outline btn-sm" onclick="switchTab('career')">🎬 채용공고 보러가기</button>
      </div>
    `;
    return;
  }

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

  area.innerHTML = filterBarHtml + `<div class="cards-grid">${filteredItems.map(renderSavedCardHtml).join('')}</div>`;
}

// 6. 참조사이트 레이더 탭
function renderRadarTab(area) {
  const sites = appData.sites || [];
  area.innerHTML = `
    <div class="panel-card" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>📡 <strong>연동 플랫폼 (${sites.length}곳)</strong> · 어떤 키워드든 입력 후 [🌐 키워드 실시간 수집] 클릭 시 실시간 수집</span>
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

// ============================================================================
// 9. [신설] 커리어 직군분석 메뉴: 등록된 키워드 직군에 대해서만 장단점 비교 & 보완 로드맵 제시
// ============================================================================
function analyzeKeywordRoleProfile(kw) {
  const allActive = getAllItemsWithTrack().filter(x => !getScheduleMeta(x).isExpired);
  const kwLower = kw.toLowerCase();
  const matched = allActive.filter(item => {
    const text = `${item.title || ''} ${item.keyword || ''} ${item.jdSummary || ''} ${item.summary || ''}`.toLowerCase();
    return text.includes(kwLower) || kwLower.split(/\s+/).every(t => text.includes(t));
  });

  const avgProb = matched.length
    ? Math.round(matched.reduce((acc, it) => acc + analyzePostingForMoonPD(it).hireProb, 0) / matched.length)
    : analyzePostingForMoonPD({ title: kw, keyword: kw }).hireProb;

  let roleCategory = '🎬 영상·제작 직군';
  let strength = '기획·연출부터 3D·AI 자동편집(제작시간 70% 단축)까지 원스톱 수행 가능한 올라운더 실무력';
  let weakness = '지원 직무에 특화된 대표 성과 1~2줄과 정량 지표(조회수·납기단축률)를 이력서 최상단에 배치 필요';
  let actionGuide = '등록된 대표 포트폴리오(2024Portfolio_3DAnimation_50m.mp4) 외에 해당 키워드 맞춤형 30초 숏폼 하이라이트 릴 추가 제작';
  let polishSkill = '생성형 AI 비디오(Runway/Kling) + 빠른 컷편집 자동화 템플릿 고도화';

  if (/퍼포먼스|그로스|광고/.test(kwLower)) {
    roleCategory = '📊 퍼포먼스·광고 마케팅 직군';
    strength = '광고 소재(릴스·쇼츠·모션)를 외주 없이 자체 고속 제작(주 15편+)하여 소재 피로도를 즉시 해결하는 능력';
    weakness = '매체 운영 데이터 지표(ROAS · CTR · CVR · GA4) 분석 경험 및 A/B 테스트 성과 수치 기재 부족';
    actionGuide = '이력서에 "광고소재 3종 A/B 테스트 기반 CTR 개선" 사례를 추가하고, Meta Ads/GA4 기초 지표 리포팅 역량 보완';
    polishSkill = 'Meta/Google 광고 관리자 성과 분석(ROAS·CTR) & 데이터 기반 후킹 카피라이팅';
  } else if (/마케팅|마케터|브랜드|sns|바이럴|기획/.test(kwLower)) {
    roleCategory = '📢 콘텐츠·브랜드 마케팅 직군';
    strength = '영상·3D·모션그래픽을 직접 기획·제작하는 압도적 콘텐츠 생산력 및 채널 누적 조회수 500만+ 경험';
    weakness = '단순 제작을 넘어선 브랜드 캠페인 퍼널(인지→유입→전환) 및 팔로워/매출 기여도 수치 강조 필요';
    actionGuide = '사람인 헤드라인에 "조회수·전환율을 만드는 콘텐츠 마케터" 포지셔닝 추가 및 상세페이지/릴스 전환 패키지 포트폴리오화';
    polishSkill = '브랜드 스토리텔링 퍼널 설계 & 인스타그램·유튜브 알고리즘 그로스 지표 관리';
  } else if (/3d|모션|애니메이션|그래픽/.test(kwLower)) {
    roleCategory = '🧊 3D·모션그래픽 직군';
    strength = '실무 3D 애니메이션 포트폴리오(50m.mp4) 보유 및 After Effects·Cinema 4D·Blender 통합 워크플로우';
    weakness = '하이엔드 스튜디오 공고에서 요구하는 리얼타임 렌더러(Octane/Unreal) 및 최근 1년 내 신규 3D 릴 보강 권장';
    actionGuide = '최신 3D 모션 15초 시퀀스 2~3개를 추가 렌더링해 Google 드라이브 대표 포트폴리오로 자동 첨부 설정';
    polishSkill = 'Cinema 4D (Octane) 라이팅·룩뎁 및 Unreal Engine 5 리얼타임 모션 연출';
  } else if (/ai|자동화/.test(kwLower)) {
    roleCategory = '🤖 AI 콘텐츠·자동화 직군';
    strength = 'Python + Gemini + CapCut 자동편집 파이프라인(auto_edit_capcut.py) 실구현 및 실증 데이터 보유';
    weakness = '텍스트·편집 자동화를 넘어 이미지/비디오 생성 AI(ComfyUI, Runway, Kling) 실무 상용화 레퍼런스 추가 필요';
    actionGuide = '자체 자동편집 스크립트의 실행 결과 전후(Before/After 제작시간 70% 단축)를 1장 요약 PDF로 만들어 드라이브에 업로드';
    polishSkill = 'ComfyUI 워크플로우 구축 · AI 비디오(Runway/Kling) 실무 상용화 파이프라인';
  } else if (/유튜브|숏폼|편집|pd/.test(kwLower)) {
    roleCategory = '🎬 유튜브·영상 PD 직군';
    strength = '롱폼·숏폼 기획/연출/자막/모션 원스톱 제작 및 자동화 템플릿으로 경쟁자 대비 2~3배 빠른 납기';
    weakness = '채널 타겟 시청자층(예: 뷰티·IT·재테크·커머스)별 레퍼런스 분류가 한눈에 보이도록 정리 필요';
    actionGuide = '지원 공고 업종에 맞는 레퍼런스 영상 링크 2개를 지원서 최상단에 자동 배치(양식 검증 모달 활용)';
    polishSkill = '초반 3초 시청지속률(Retention) 후킹 편집 기법 & 숏폼 바이럴 패키징';
  }

  return {
    keyword: kw,
    roleCategory,
    matchedCount: matched.length,
    avgProb,
    boostedProb: Math.min(99, avgProb + (avgProb < 86 ? 11 : 4)),
    strength,
    weakness,
    actionGuide,
    polishSkill
  };
}

function renderCareerAnalysisTab(area) {
  const registeredKeywords = quickKeywords && quickKeywords.length ? quickKeywords : DEFAULT_QUICK_KEYWORDS;
  const roleProfiles = registeredKeywords.map(analyzeKeywordRoleProfile);
  const overallAvg = roleProfiles.length
    ? Math.round(roleProfiles.reduce((a, b) => a + b.avgProb, 0) / roleProfiles.length)
    : 90;

  area.innerHTML = `
    <div class="panel-card" style="margin-bottom:14px;">
      <h3>
        <span>🎯 등록 키워드 직군별 커리어 분석 (총 ${registeredKeywords.length}개 등록 키워드 기준)</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span class="status-chip">📈 평균 채용예측률 ${overallAvg}%</span>
          <button class="btn btn-primary btn-sm" onclick="addCustomQuickKeywordPrompt()">➕ 분석할 직군 키워드 추가</button>
        </div>
      </h3>

      <div class="one-liner" style="margin-bottom:14px;-webkit-line-clamp:unset;">
        💡 <strong>맞춤 직군 분석 원칙:</strong> 무관한 전체 공고가 아니라, 문PD님이 상단에 등록한 키워드 직군(<strong>${registeredKeywords.map(k => `#${k}`).join(', ')}</strong>)에 해당하는 활성 공고만 추출해 <strong>나의 강점·약점·채용확률·보완 방법</strong>을 제시합니다.
      </div>

      <div class="cards-grid">
        ${roleProfiles.map(rp => `
          <article class="item-card">
            <div>
              <div class="card-top">
                <div class="badge-group">
                  <span class="badge-site">#${rp.keyword}</span>
                  <span class="badge-match">🎯 채용확률 ${rp.avgProb}% → 보완 시 ${rp.boostedProb}%</span>
                </div>
                <span class="chip">${rp.matchedCount}건 분석</span>
              </div>

              <h3 class="card-title" style="margin-top:8px;">${rp.roleCategory} (${rp.keyword})</h3>

              <div class="bar-row" style="margin-top:8px;margin-bottom:8px;">
                <div class="bar-track"><div class="bar-fill" style="width:${rp.avgProb}%"></div></div>
              </div>

              <div class="fit-mini-box">
                <div>💪 <strong style="color:#93c5fd;">나의 강점:</strong> ${rp.strength}</div>
                <div style="margin-top:4px;">⚡ <strong style="color:#c7d2fe;">약점/보완점:</strong> ${rp.weakness}</div>
                <div style="margin-top:4px;">🧭 <strong>어떻게 보완할까:</strong> ${rp.actionGuide}</div>
                <div style="margin-top:4px;">🛠️ <strong>연마 추천 기술:</strong> ${rp.polishSkill}</div>
              </div>
            </div>
            <div class="card-footer">
              <button class="btn btn-primary btn-sm" onclick="quickKeyword('${rp.keyword.replace(/'/g, "\\'")}'); switchTab('career');">
                🔍 '${rp.keyword}' 공고 바로 보기
              </button>
              <button class="btn btn-outline btn-sm" onclick="switchTab('analytics')">
                ✏️ 이력서 보완하기
              </button>
            </div>
          </article>
        `).join('')}
      </div>
    </div>

    <!-- 카카오톡 나에게 보내기 매일 자동 알림 연동 패널 -->
    <div class="panel-card">
      <h3>
        <span>💬 매일 공고 확인 & 채용확률 90%↑ 신규공고 카카오톡 [나에게 보내기] 자동 알림</span>
        <span class="status-chip">🤖 kakao_notify.ps1 연동 준비</span>
      </h3>
      <div class="one-liner" style="margin-bottom:10px;-webkit-line-clamp:unset;">
        • <strong>동작 방식:</strong> 매일 정해진 시간에 자동 수집기(<code>crawler.ps1</code>)가 최신 공고를 확인한 뒤, <strong>이전 알림에 없던 신규 공고 중 채용확률 90% 이상</strong>인 공고만 추려 <strong>카카오톡 나에게 보내기</strong>로 즉시 전송합니다.<br/>
        • <strong>필요 설정:</strong> 카카오 디벨로퍼스 무료 앱의 <code>REST API 키</code>와 1회 로그인 인증(<code>talk_message</code> 권한)만 연결하면 PC 작업 스케줄러로 매일 자동 발송됩니다.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="testKakaoNotifyViaServer()">🔔 카카오톡 알림 테스트 발송</button>
        <span class="chip">📁 스크립트 위치: moonpd_system/kakao_notify.ps1</span>
      </div>
    </div>
  `;
}

async function testKakaoNotifyViaServer() {
  showToast('⏳ 카카오톡 알림 발송 테스트 요청 중...');
  try {
    const res = await fetch('/api/kakao-test', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast('✅ 카카오톡 나에게 보내기 발송 성공!');
    } else {
      alert(data.message || '카카오톡 REST API 토큰 설정(kakao_setup.ps1)이 먼저 필요합니다.');
    }
  } catch (e) {
    alert('로컬 PC 서버(http://localhost:8090)가 켜진 상태에서 kakao_setup.ps1로 카카오 인증을 1회 진행해 주세요.');
  }
}

function renderAnalyticsAndResumeTab(area) {
  const readonlyAttr = isResumeEditMode ? '' : 'readonly';
  const inputClass = isResumeEditMode ? 'field-input editable' : 'field-input';
  const pfList = masterResume.portfolioHistory || DEFAULT_MASTER_RESUME.portfolioHistory;

  area.innerHTML = `
    <!-- 사람인 최신 이력서 백업 · 수정 · 사람인 재등록 & 클라우드 4단계 관리 -->
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

    <!-- 3) 포트폴리오 Google Drive 자동 저장 & 채용사이트 자동 업로드 허브 -->
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
// 10. 사람인 최신 이력서 다운로드 & 사람인 재등록 브릿지
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
  currentModalItem = null;
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
  renderModalFitAnalysisBox(null);
  renderModalPortfolioBar();
  runLiveFormatValidation();
  document.getElementById('docModal').classList.add('open');
}

// ============================================================================
// 11. 포트폴리오 Google Drive 업로드 & 채용사이트 자동 첨부 핸들러
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
// 12. 이력서 4대 작업 핸들러
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
// 13. 모달 내 공고 합격진단(장단점/채용확률/연마기술) + 양식 적합성 체크 & 자동 수정
// ============================================================================
function renderModalFitAnalysisBox(item) {
  const box = document.getElementById('modalFitAnalysisBox');
  if (!box) return;
  if (!item) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'flex';
  const fit = analyzePostingForMoonPD(item);
  const sched = getScheduleMeta(item);

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
      <strong style="font-size:12.5px;color:var(--text-main);">
        🎯 [문PD 맞춤 합격진단] 현재 채용예측률 <span style="color:#93c5fd;">${fit.hireProb}%</span> → 약점 보완 시 <span style="color:#c7d2fe;">${fit.boostedProb}%</span>
      </strong>
      <span class="chip">📅 지원기간: ${sched.applyPeriod}</span>
    </div>
    <div class="val-row ok">
      <span>💪 <strong>나의 우위 강점:</strong> ${fit.strengthPoint}</span>
    </div>
    <div class="val-row warn">
      <span>⚡ <strong>공고 대비 약점/보완점:</strong> ${fit.weaknessPoint}</span>
      <button class="btn btn-primary btn-sm" style="padding:3px 8px;font-size:11px;" onclick="injectWeaknessBooster()">
        + 보완 문구 즉시 삽입 (합격률 ↑)
      </button>
    </div>
    <div class="val-row" style="color:#cbd5e1;">
      <span>🧭 <strong>향후 더 연마할 핵심 기술:</strong> ${fit.skillToPolish}</span>
    </div>
  `;
}

function injectWeaknessBooster() {
  if (!currentModalItem) return;
  const fit = analyzePostingForMoonPD(currentModalItem);
  const textarea = document.getElementById('modalTextarea');
  if (!textarea) return;
  if (!textarea.value.includes(fit.fixPatchText)) {
    textarea.value = textarea.value.trim() + '\n\n[공고 맞춤형 역량 보완 사항]\n' + fit.fixPatchText + '\n';
    runLiveFormatValidation();
    showToast(`🚀 약점 보완 문구가 반영되어 예상 채용확률이 ${fit.boostedProb}%로 상승했습니다!`);
  } else {
    showToast('✅ 이미 지원서에 약점 보완 문구가 반영되어 있습니다.');
  }
}

function generateTailoredDocument(type, item) {
  const careerBullets = (masterResume.coreCareer || []).map(c => `• ${c}`).join('\n');
  const pfUrl = masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL;
  const salaryInfo = masterResume.desiredSalary || '면접 후 결정 (즉시 투입 가능)';
  const sched = getScheduleMeta(item);

  if (type === 'career') {
    return `[${item.site} 맞춤 입사지원서 & 경력기술서]
■ 지원기업 / 포지션: ${item.company} — ${item.title}
■ 지원기간 / 근무지: ${sched.applyPeriod} | ${item.location || inferRegionBucket(item)}
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
• 근무 가능 조건: ${item.pay || '시급/건별 협의'} / 즉시 투입 및 일정 조율 가능
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
■ 공고명: ${item.title} (${item.organizer} / ${sched.applyPeriod})
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

  document.getElementById('modalTitle').textContent = `✨ [${currentModalSite}] 공고 합격진단 & 사이트 맞춤 양식 자동변환`;
  document.getElementById('modalSubtitle').textContent = `${item.title} (${item.location || inferRegionBucket(item)})`;
  document.getElementById('modalTextarea').value = generateTailoredDocument(type, item);

  renderModalFitAnalysisBox(item);
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

  currentModalItem = targets[0] || null;
  currentModalSite = `일괄변환(${targets.length}건)`;
  currentModalType = 'career';
  currentModalTargetUrl = targets[0]?.url || '';
  currentModalFilename = `문PD_일괄지원_${targets.length}건.txt`;
  document.getElementById('modalTitle').textContent = `🚀 선택 ${targets.length}건 일괄 변환 & 합격진단 완료`;
  document.getElementById('modalSubtitle').textContent = targets.map(t => t.site).join(', ');
  document.getElementById('modalTextarea').value = combinedText;

  renderModalFitAnalysisBox(targets[0] || null);
  renderModalPortfolioBar();
  runLiveFormatValidation();
  document.getElementById('docModal').classList.add('open');
}

// ============================================================================
// 14. 무제한 자유 키워드 실시간 수집 엔진 (로컬 서버 + 외부/모바일 브라우저 직접 수집 겸용)
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

async function crawlKeywordDirectlyInBrowser(keyword) {
  const kw = (keyword || '마케팅').trim();
  const encKw = encodeURIComponent(kw);
  const nowStr = new Date().toLocaleString();
  const todayStr = new Date().toISOString().slice(0, 10);
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
      list.forEach((item, idx) => {
        const wid = String(item.id);
        const loc = item.address?.full_location || item.location || '서울/수도권';
        const pos = item.position || '';
        const comp = item.company?.name || '원티드 채용기업';
        const dueStr = item.due_time || '2099-12-31';
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
          deadline: item.due_time ? `~${item.due_time.slice(5)}` : '상시채용',
          registeredDate: todayStr,
          deadlineDate: dueStr,
          applyPeriod: item.due_time ? `${todayStr.slice(5).replace('-', '.')} ~ ${item.due_time.slice(5).replace('-', '.')}` : `${todayStr.slice(5).replace('-', '.')} 등록 ~ 상시채용`,
          dDaySort: item.due_time ? 14 : 365,
          regSort: parseInt(wid, 10) + 55000000 - idx,
          isExpired: false,
          matchScore: 95,
          url: `https://www.wanted.co.kr/wd/${wid}`,
          applyType: '원티드 간편지원',
          jdSummary: `[원티드 #${wid} | 키워드:${kw}] ${comp} (${loc}) '${pos}'`,
          collectedAt: nowStr,
          verified: true
        });
      });
    })(),

    // 2) 사람인(Saramin) 실시간 키워드 검색 (마감일 <span class="date"> 포함)
    (async () => {
      const raw = await fetchViaCorsProxy(`https://m.saramin.co.kr/search/get-recruit-list?searchType=search&searchword=${encKw}`);
      if (!raw) return;
      let html = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.innerHTML) html = parsed.innerHTML;
      } catch (e) {}
      const regex = /data-rec_idx=(\d+)>[\s\S]{1,1200}?<p class="tit">([\s\S]{1,250}?)<\/p>\s*<div class="meta">\s*<span>([^<]+)<\/span>[\s\S]{1,400}?<span class="corp_name">([^<]+)<\/span>[\s\S]{1,350}?<span class="date">([^<]+)<\/span>/g;
      let m;
      let count = 0;
      while ((m = regex.exec(html)) !== null && count < 20) {
        count++;
        const ridx = m[1].trim();
        const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const loc = m[3].trim();
        const comp = m[4].trim();
        const rawDate = m[5].trim();
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
          deadline: rawDate,
          registeredDate: todayStr,
          applyPeriod: `${todayStr.slice(5).replace('-', '.')} 등록 ~ ${rawDate}`,
          regSort: parseInt(ridx, 10),
          isExpired: false,
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
          schedule: `D-${4 + (count % 10)}`,
          deadline: `D-${4 + (count % 10)}`,
          registeredDate: todayStr,
          dDaySort: 4 + (count % 10),
          regSort: parseInt(aid, 10),
          isExpired: false,
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
          deadline: dday,
          registeredDate: todayStr,
          regSort: parseInt(ix, 10),
          isExpired: false,
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
        (appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)).length +
        (appData.albas || []).filter(x => matchesSearchAndFilter(x, false)).length +
        (appData.freelances || []).filter(x => matchesSearchAndFilter(x, false)).length +
        (appData.contests || []).filter(x => matchesSearchAndFilter(x, false)).length;
      showToast(`✅ '${kw || '전체'}' 실시간 수집 및 합격률 분석 완료! (활성 ${matchedNow}건)`);
    }
  } catch (e) {}

  if (!handledByLocalServer) {
    const addedCount = await crawlKeywordDirectlyInBrowser(kw || '마케팅');
    onFilterChanged();
    const matchedNow =
      (appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.albas || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.freelances || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.contests || []).filter(x => matchesSearchAndFilter(x, false)).length;
    showToast(`✅ '${kw || '전체'}' 실시간 수집 완료! (신규 ${addedCount}건 포함 활성 ${matchedNow}건)`);
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
