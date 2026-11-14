// ============================================================================
// 문PD 커리어 · 캐시카우 통합 시스템 - 프론트엔드 엔진
// ============================================================================

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wReNF82GUdAZb4c0_bFFI2kbU6grpapVz7fZqD2EFQE/edit';
const GOOGLE_DRIVE_URL = 'https://drive.google.com/drive/folders/1iLuXv3tbem-SzHNn-erlbLdtH2Yxyf5K';
const SARAMIN_RESUME_MANAGE_URL = 'https://www.saramin.co.kr/zf_user/member/resume-manage/list';
const IS_LOCAL_SERVER = location.protocol !== 'file:' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

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
let highProbOnly = false;
let currentModalTargetUrl = '';
let currentModalFilename = '문PD_맞춤지원서.txt';
let currentModalSite = '사람인';
let currentModalType = 'career';
let currentModalItem = null;
let isResumeEditMode = false;

// 메모이제이션 캐시 (데이터/상태 변경 시 invalidateCaches()로 초기화)
let cachedAllItems = null;
const scheduleMetaCache = new Map();
const fitAnalysisCache = new Map();

function invalidateCaches() {
  cachedAllItems = null;
  scheduleMetaCache.clear();
  fitAnalysisCache.clear();
}

// ============================================================================
// 0. 보안 & Lucide SVG 아이콘 헬퍼 (1.5px stroke, currentColor)
// ============================================================================
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const s = String(url ?? '').trim();
  if (/^https?:\/\//i.test(s)) return escapeHtml(s);
  return '#';
}

function stripLeadingEmoji(str) {
  return String(str ?? '').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\s]+/u, '').trim() || String(str ?? '');
}

const LUCIDE_PATHS = {
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  starFilled: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>',
  key: '<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
};

function icon(name, size = 14) {
  const path = LUCIDE_PATHS[name] || '';
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// ============================================================================
// 1. 관심공고 카테고리 분류 & 수동 마감 체크 상태 관리
// ============================================================================
const DEFAULT_SAVED_CATEGORIES = [
  '마케팅·브랜딩',
  '영상·PD·편집',
  '3D·모션·AI',
  '1순위 지원예정',
  '알바·단기캐시',
  '외주·프리랜서',
  '공모·지원사업'
];

let savedCategories = loadSavedCategories();
let savedCategoryMap = loadSavedCategoryMap();
let manualExpiredSet = loadManualExpiredSet();
let activeSavedCategoryFilter = 'ALL';
let savedGroupViewMode = true;

function loadSavedCategories() {
  try {
    const raw = localStorage.getItem('MOONPD_SAVED_CATEGORIES');
    if (raw) {
      const parsed = JSON.parse(raw).map(stripLeadingEmoji);
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
    if (mapRaw) {
      const parsed = JSON.parse(mapRaw);
      const cleaned = {};
      Object.keys(parsed).forEach(k => { cleaned[k] = stripLeadingEmoji(parsed[k]); });
      return cleaned;
    }
    const oldArrRaw = localStorage.getItem('MOONPD_SAVED_JOBS');
    if (oldArrRaw) {
      const arr = JSON.parse(oldArrRaw);
      const migrated = {};
      arr.forEach(id => { migrated[id] = '영상·PD·편집'; });
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
    showToast('해당 공고의 마감 상태가 해제되어 활성 공고로 복원되었습니다.');
  } else {
    manualExpiredSet.add(id);
    showToast('해당 공고가 마감 처리되었습니다. (일반 탭 숨김, 관심공고함 유지)');
  }
  scheduleMetaCache.clear();
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
  showToast(`마감·기간경과된 관심공고 ${removed}건을 정리했습니다.`);
}

function persistSavedCategoryMap() {
  try {
    localStorage.setItem('MOONPD_SAVED_CATEGORY_MAP', JSON.stringify(savedCategoryMap));
    localStorage.setItem('MOONPD_SAVED_JOBS', JSON.stringify(Object.keys(savedCategoryMap)));
  } catch (e) {}
  if (IS_LOCAL_SERVER) {
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
}

function getSavedCount() {
  return Object.keys(savedCategoryMap).length;
}

function isJobSaved(id) {
  return Boolean(savedCategoryMap[id]);
}

function autoDetectCategory(item) {
  if (!item) return '영상·PD·편집';
  const text = `${item.title || ''} ${item.keyword || ''} ${item.jdSummary || ''} ${item.summary || ''}`.toLowerCase();
  if (/마케팅|마케터|브랜드|브랜딩|퍼포먼스|바이럴|광고|ae|sns|캠페인|커머스|홍보|프로모션|그로스|crm/.test(text)) {
    return '마케팅·브랜딩';
  }
  if (item.track === 'alba' || item._track === 'alba') return '알바·단기캐시';
  if (item.track === 'freelance' || item._track === 'freelance') return '외주·프리랜서';
  if (item.category?.includes('공모') || item.category?.includes('지원') || item._track === 'contest') return '공모·지원사업';
  if (/3d|모션|애니메이션|c4d|cinema|blender|vfx|언리얼|ai|자동화|생성형/.test(text)) {
    return '3D·모션·AI';
  }
  return '영상·PD·편집';
}

function toggleStar(id) {
  if (isJobSaved(id)) {
    delete savedCategoryMap[id];
    showToast('관심공고 보관함에서 해제되었습니다.');
  } else {
    const item = findItemById(id);
    const cat = (activeSavedCategoryFilter !== 'ALL' && currentTab === 'saved')
      ? activeSavedCategoryFilter
      : autoDetectCategory(item);
    savedCategoryMap[id] = cat;
    showToast(`[${cat}] 카테고리에 관심공고로 저장되었습니다.`);
  }
  persistSavedCategoryMap();
  onFilterChanged();
}

function changeSavedItemCategory(id, newCat) {
  if (newCat === '__NEW__') {
    openInputDialog({
      title: '새 관심공고 카테고리',
      message: '새로 만들 관심공고 카테고리 이름을 입력하세요.',
      placeholder: '예: 마케팅 A급, 연봉 4500+',
      onSubmit: (custom) => {
        const cleanCat = stripLeadingEmoji(custom.trim());
        if (!cleanCat) {
          renderActiveTab();
          return;
        }
        if (!savedCategories.includes(cleanCat)) {
          savedCategories.push(cleanCat);
          persistSavedCategories();
        }
        savedCategoryMap[id] = cleanCat;
        persistSavedCategoryMap();
        onFilterChanged();
        showToast(`'${cleanCat}' 카테고리가 생성 및 적용되었습니다.`);
      },
      onCancel: () => renderActiveTab()
    });
    return;
  }
  savedCategoryMap[id] = newCat;
  persistSavedCategoryMap();
  onFilterChanged();
  showToast(`카테고리가 [${newCat}](으)로 변경되었습니다.`);
}

function addNewSavedCategoryPrompt() {
  openInputDialog({
    title: '새 관심공고 카테고리 추가',
    message: '추가할 관심공고 카테고리 이름을 입력하세요.',
    placeholder: '예: 퍼포먼스 마케팅, 금주 지원 필수',
    onSubmit: (custom) => {
      const clean = stripLeadingEmoji(custom.trim());
      if (!clean) return;
      if (!savedCategories.includes(clean)) {
        savedCategories.push(clean);
        persistSavedCategories();
      }
      activeSavedCategoryFilter = clean;
      onFilterChanged();
      showToast(`'${clean}' 카테고리가 추가되었습니다.`);
    }
  });
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
  if (item.id && scheduleMetaCache.has(item.id)) {
    return scheduleMetaCache.get(item.id);
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

  if (item.deadlineDate && item.deadlineDate !== '2099-12-31') {
    const due = new Date(item.deadlineDate + 'T00:00:00');
    if (!isNaN(due.getTime())) {
      const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      dDaySort = diffDays;
      if (diffDays < 0) {
        isExpired = true;
        dDayText = `마감 (D+${Math.abs(diffDays)})`;
      } else if (diffDays === 0) {
        dDayText = '오늘마감 (D-Day)';
      } else {
        dDayText = `D-${diffDays}`;
      }
    }
  } else {
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
        dDayText = `마감 (${mm}.${dd})`;
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
    dDayText = '마감·기간경과';
  }

  if (!applyPeriod) {
    const regShort = item.registeredDate ? item.registeredDate.slice(5).replace('-', '.') : '최신';
    if (dDaySort >= 300 && !isExpired) {
      applyPeriod = `${regShort} 등록 · 상시채용`;
    } else if (item.deadlineDate && item.deadlineDate !== '2099-12-31') {
      const dueShort = item.deadlineDate.slice(5).replace('-', '.');
      applyPeriod = `${regShort} ~ ${dueShort} (${dDayText})`;
    } else {
      applyPeriod = `${regShort} 등록 · ${dDayText}`;
    }
  } else if (isExpired && !applyPeriod.includes('마감')) {
    applyPeriod = `${applyPeriod} (마감)`;
  }

  const result = { applyPeriod, dDayText, dDaySort, regSort, isExpired };
  if (item.id) scheduleMetaCache.set(item.id, result);
  return result;
}

// ============================================================================
// 3. 문PD 커리어 · 캐시카우 핵심 엔진: 공고 분석 · 장단점 비교 · 채용확률
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
  if (item.id && fitAnalysisCache.has(item.id)) {
    return fitAnalysisCache.get(item.id);
  }

  const text = `${item.title || ''} ${item.keyword || ''} ${item.jdSummary || ''} ${item.summary || ''} ${item.requestDetail || ''}`.toLowerCase();

  let score = 82;
  const strengths = [];
  const gaps = [];
  let skillToPolish = '';
  let fixPatchText = '';

  if (/영상|pd|피디|편집|유튜브|숏폼|릴스|쇼츠|크리에이터|콘텐츠|촬영|연출/.test(text)) {
    score += 7;
    strengths.push('유튜브·숏폼 기획/연출 및 CapCut+Python 자동편집(속도 70% 단축)');
  }

  if (/3d|모션|애니메이션|애프터이펙트|after|c4d|cinema|blender|vfx|ai|생성형/.test(text)) {
    score += 6;
    strengths.push('실무 3D 애니메이션 포폴(50m.mp4) 및 생성형 AI 파이프라인 직결');
  }

  if (/마케팅|마케터|퍼포먼스|브랜드|브랜딩|바이럴|광고|ae|sns|커머스|상세페이지|홍보|그로스|로아스|roas/.test(text)) {
    if (/퍼포먼스|그로스|데이터|ga4|roas|매체|메타|구글|crm/.test(text)) {
      score = Math.min(score, 80);
      strengths.push('광고 소재(숏폼·영상) 자체 고속 제작으로 소재 피로도 즉시 해결');
      gaps.push('퍼포먼스 매체 운영 지표(ROAS·CTR·CVR·GA4) 정량 데이터 제시 보완 필요');
      skillToPolish = 'Meta/Google Ads 광고 관리자 데이터 분석 및 ROAS 기반 후킹 카피라이팅';
      fixPatchText = '• [마케팅 데이터 역량 보강] A/B 테스트용 숏폼 광고소재 주 15편+ 고속 제작 및 CTR(클릭률)·ROAS(광고수익률) 데이터 기반 소재 최적화 수행';
    } else {
      score = Math.max(score, 87);
      strengths.push('기획+영상+3D를 직접 제작하는 올라운더 콘텐츠 마케터 경쟁력');
      gaps.push('캠페인 전환율(CVR) 및 팔로워·도달률 성장 수치 구체화 권장');
      skillToPolish = '브랜드 캠페인 스토리텔링 및 인스타그램/유튜브 알고리즘 그로스 지표 설계';
      fixPatchText = '• [브랜드·콘텐츠 마케팅 성과] 타겟 페르소나 맞춤형 숏폼·브랜드 필름 기획으로 오가닉 도달률 300% 상승 및 전환 퍼널 구축';
    }
  }

  if (!gaps.length && /언리얼|unreal|옥테인|octane|maya|마야|후디니|합성|vfx/.test(text)) {
    score = 84;
    gaps.push('리얼타임 렌더러(Unreal/Octane) 및 고급 VFX 합성 파이프라인 키워드 보강');
    skillToPolish = 'Cinema 4D Octane 렌더 및 Unreal Engine 5 리얼타임 버추얼 프로덕션';
    fixPatchText = '• [3D·렌더링 파이프라인] 3D 애니메이션 에셋 제작부터 라이팅·렌더링·After Effects 후반 합성까지 통합 워크플로우 보유';
  }

  if (item._track === 'contest' || item.category?.includes('공모') || item.category?.includes('지원')) {
    score = 91;
    strengths.push('AI+Python 영상 자동화 실증 스크립트 보유로 심사 기술성·독창성 가점');
    gaps.push('심사위원용 정량적 기대효과(매출·확산·고용 효과) 수치 테이블 보강');
    skillToPolish = '정부지원사업 PSST 비즈니스 모델(B2B SaaS/구독형 제작) 수익화 지표 설계';
    fixPatchText = '• [정량적 기대효과] 자체 AI·3D 파이프라인을 통해 제작 단가 50% 절감 및 납기 70% 단축 실증 완료';
  }

  if (item._track === 'freelance' || item._track === 'alba' || item.track === 'alba') {
    score = Math.max(score, 93);
    if (!strengths.length) strengths.push('즉시 투입 가능한 프리미어·애프터이펙트·캡컷 숙련도 및 빠른 납기');
    if (!gaps.length) gaps.push('클라이언트 업종별 레퍼런스 링크 1~2개 첫 문단 선제 제시 필요');
    if (!skillToPolish) skillToPolish = '업종별(뷰티·커머스·IT·관공서) 15초 하이라이트 릴 모듈화 패키징';
    if (!fixPatchText) fixPatchText = '• [신속 납품 보장] 요청하신 레퍼런스 톤앤매너에 맞춰 48시간 내 1차 시안 공유 및 무상 수정 지원';
  }

  if (!strengths.length) {
    strengths.push('기획·연출·3D·AI 자동편집을 겸비한 멀티 플레이어 역량');
  }
  if (!gaps.length) {
    gaps.push('해당 기업의 최근 주력 상품/채널 톤앤매너 분석 한 줄 추가 시 완성도 상승');
  }
  if (!skillToPolish) {
    skillToPolish = '생성형 AI 비디오(Runway/Kling) + 3D 모션 결합 하이브리드 연출 고도화';
  }
  if (!fixPatchText) {
    fixPatchText = '• [차별화 경쟁력] 3D 애니메이션 연출력과 AI·Python 자동편집(제작시간 70% 단축)으로 고품질 콘텐츠를 압도적 속도로 제작합니다.';
  }

  const hireProb = Math.min(97, Math.max(74, score));
  const boostedProb = Math.min(99, hireProb + (hireProb < 85 ? 12 : 5));

  const res = {
    hireProb,
    boostedProb,
    strengthPoint: strengths[0],
    weaknessPoint: gaps[0],
    skillToPolish,
    fixPatchText
  };
  if (item.id) fitAnalysisCache.set(item.id, res);
  return res;
}

// ============================================================================
// 4. 빠른 키워드 바
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
    <button type="button" class="btn ${curQ === '' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="quickKeyword('')">전체</button>
    ${quickKeywords.map(kw => {
      const safeAttr = escapeHtml(kw).replace(/&#39;/g, "\\'");
      return `<button type="button" class="btn ${curQ === kw ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="quickKeyword('${safeAttr}')">${escapeHtml(kw)}</button>`;
    }).join('')}
    <button type="button" class="btn btn-outline btn-sm" onclick="addCustomQuickKeywordPrompt()" title="자주 쓰는 검색 키워드 칩 추가">${icon('plus', 13)} 키워드</button>
  `;
}

function addCustomQuickKeywordPrompt() {
  openInputDialog({
    title: '검색 키워드 추가',
    message: '상단에 고정할 검색 키워드를 입력하세요.',
    placeholder: '예: 브랜드 마케터, SNS 기획, 광고 AE, 드론 촬영',
    onSubmit: (kw) => {
      const clean = kw.trim();
      if (!clean) return;
      if (!quickKeywords.includes(clean)) {
        quickKeywords.push(clean);
        try {
          localStorage.setItem('MOONPD_QUICK_KEYWORDS', JSON.stringify(quickKeywords));
        } catch (e) {}
      }
      quickKeyword(clean);
      triggerLiveCrawl();
    }
  });
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
  invalidateCaches();
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
  invalidateCaches();
}

function initCosmosBackground() {
  const canvas = document.getElementById('cosmosCanvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = null;
  let lastTs = 0;
  let nextMeteorAt = 2400 + Math.random() * 3200;

  let targetMouseX = 0;
  let targetMouseY = 0;
  let mouseX = 0;
  let mouseY = 0;

  const starColors = ['#ffffff', '#bae6fd', '#e0e7ff', '#fef3c7'];
  const layerConfigs = [
    { count: 70, rMin: 0.5, rMax: 1.0, speed: 0.0022, parallax: 6, alphaMin: 0.28, alphaMax: 0.62 },
    { count: 48, rMin: 0.9, rMax: 1.5, speed: 0.0045, parallax: 14, alphaMin: 0.45, alphaMax: 0.82 },
    { count: 22, rMin: 1.3, rMax: 2.1, speed: 0.0080, parallax: 24, alphaMin: 0.65, alphaMax: 0.96 }
  ];

  const stars = [];
  layerConfigs.forEach((cfg, layerIdx) => {
    for (let i = 0; i < cfg.count; i++) {
      stars.push({
        layer: layerIdx,
        x: Math.random(),
        y: Math.random(),
        r: cfg.rMin + Math.random() * (cfg.rMax - cfg.rMin),
        baseAlpha: cfg.alphaMin + Math.random() * (cfg.alphaMax - cfg.alphaMin),
        twinkleSpeed: 0.6 + Math.random() * 1.6,
        twinklePhase: Math.random() * Math.PI * 2,
        speed: cfg.speed * (0.8 + Math.random() * 0.4),
        parallax: cfg.parallax,
        color: starColors[Math.floor(Math.random() * starColors.length)],
        glint: layerIdx === 2 && i % 4 === 0
      });
    }
  });

  const nebulae = [
    { bx: 0.16, by: 0.18, rScale: 0.46, color: 'rgba(37, 99, 235, 0.22)', dx: 0.04, dy: 0.03, freq: 0.00011, phase: 0.2 },
    { bx: 0.82, by: 0.24, rScale: 0.40, color: 'rgba(14, 165, 233, 0.16)', dx: 0.05, dy: 0.035, freq: 0.00009, phase: 2.1 },
    { bx: 0.64, by: 0.80, rScale: 0.48, color: 'rgba(99, 102, 241, 0.16)', dx: 0.045, dy: 0.03, freq: 0.00010, phase: 4.0 }
  ];

  const meteors = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth || document.documentElement.clientWidth || 1280;
    height = window.innerHeight || document.documentElement.clientHeight || 800;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnMeteor() {
    const startX = width * (0.15 + Math.random() * 0.75);
    const startY = height * (0.04 + Math.random() * 0.30);
    const angle = (Math.PI / 180) * (24 + Math.random() * 18);
    const speed = 520 + Math.random() * 260;
    meteors.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: 95 + Math.random() * 65,
      life: 0,
      maxLife: 0.75 + Math.random() * 0.35
    });
  }

  function drawFrame(now, dt) {
    ctx.clearRect(0, 0, width, height);

    mouseX += (targetMouseX - mouseX) * Math.min(1, dt * 4.5);
    mouseY += (targetMouseY - mouseY) * Math.min(1, dt * 4.5);

    // 1. Drifting Nebula Clouds
    for (const neb of nebulae) {
      const cx = (neb.bx + Math.sin(now * neb.freq + neb.phase) * neb.dx) * width - mouseX * 10;
      const cy = (neb.by + Math.cos(now * neb.freq * 0.85 + neb.phase) * neb.dy) * height - mouseY * 10;
      const rad = Math.max(width, height) * neb.rScale;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, neb.color);
      grad.addColorStop(0.55, neb.color.replace(/[\d.]+\)$/, '0.05)'));
      grad.addColorStop(1, 'rgba(4, 7, 20, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Parallax Starfield
    const sec = now * 0.001;
    for (const s of stars) {
      if (!prefersReducedMotion) {
        s.x -= s.speed * dt * 0.45;
        s.y += s.speed * dt * 0.14;
        if (s.x < -0.02) s.x += 1.04;
        if (s.y > 1.02) s.y -= 1.04;
      }

      const px = s.x * width - mouseX * s.parallax;
      const py = s.y * height - mouseY * s.parallax;
      const twinkle = prefersReducedMotion ? 1 : (0.68 + 0.32 * Math.sin(sec * s.twinkleSpeed + s.twinklePhase));
      ctx.globalAlpha = Math.max(0.1, Math.min(1, s.baseAlpha * twinkle));
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();

      if (s.glint) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.7;
        ctx.globalAlpha *= 0.65;
        const arm = s.r * 3.2;
        ctx.beginPath();
        ctx.moveTo(px - arm, py);
        ctx.lineTo(px + arm, py);
        ctx.moveTo(px, py - arm);
        ctx.lineTo(px, py + arm);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 3. Occasional Shooting Stars
    if (!prefersReducedMotion) {
      if (now >= nextMeteorAt) {
        spawnMeteor();
        nextMeteorAt = now + 3500 + Math.random() * 3500;
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        if (m.life >= m.maxLife) {
          meteors.splice(i, 1);
          continue;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;

        const progress = m.life / m.maxLife;
        const alpha = Math.sin(progress * Math.PI);
        const speedMag = Math.hypot(m.vx, m.vy) || 1;
        const tailX = m.x - (m.vx / speedMag) * m.len;
        const tailY = m.y - (m.vy / speedMag) * m.len;

        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, 'rgba(186, 230, 253, 0)');
        grad.addColorStop(0.7, `rgba(125, 211, 252, ${(0.45 * alpha).toFixed(3)})`);
        grad.addColorStop(1, `rgba(255, 255, 255, ${(0.95 * alpha).toFixed(3)})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 255, 255, ${(0.95 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function loop(ts) {
    if (document.hidden) {
      rafId = null;
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;
    drawFrame(ts, dt);
    rafId = requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener('resize', () => {
    resize();
    if (prefersReducedMotion) drawFrame(performance.now(), 0.016);
  }, { passive: true });

  if (prefersReducedMotion) {
    drawFrame(performance.now(), 0.016);
    return;
  }

  window.addEventListener('mousemove', (e) => {
    if (!width || !height) return;
    targetMouseX = (e.clientX / width - 0.5) * 2;
    targetMouseY = (e.clientY / height - 0.5) * 2;
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    targetMouseX = 0;
    targetMouseY = 0;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else if (!rafId) {
      lastTs = 0;
      rafId = requestAnimationFrame(loop);
    }
  });

  rafId = requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', async () => {
  initCosmosBackground();
  await Promise.all([fetchLatestDataFromServer(), refreshAiCareerDataFromServer()]);
  mergeBrowserCrawledCache();
  populateSiteFilterOptions();
  renderQuickKeywordBar();
  onFilterChanged();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDocModal();
    closeConfirmModal();
  }
});

async function fetchLatestDataFromServer() {
  if (!IS_LOCAL_SERVER) return;
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.ok) {
      appData = await res.json();
      invalidateCaches();
    }
  } catch (e) {}
}

function populateSiteFilterOptions() {
  const sel = document.getElementById('siteFilter');
  if (!sel) return;
  const prevVal = sel.value || 'ALL';
  const siteSet = new Set();
  getAllItemsWithTrack().forEach(it => {
    if (it.site) siteSet.add(it.site);
  });
  (appData.sites || []).forEach(s => {
    if (s.name) siteSet.add(s.name);
  });
  const sorted = Array.from(siteSet).sort((a, b) => a.localeCompare(b, 'ko'));
  sel.innerHTML = `<option value="ALL">전체 사이트 (${sorted.length})</option>` +
    sorted.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if (prevVal !== 'ALL' && sorted.includes(prevVal)) {
    sel.value = prevVal;
  } else {
    sel.value = 'ALL';
  }
}

// ============================================================================
// 6. 지역 판별 + 키워드 + 사이트 + 고확률 + 마감자동숨김 + 정렬 통합 파이프라인
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

function matchesSearchAndFilter(item, includeExpired = false) {
  if (!includeExpired) {
    const sched = getScheduleMeta(item);
    if (sched.isExpired) return false;
  }

  if (highProbOnly) {
    const fit = analyzePostingForMoonPD(item);
    if (fit.hireProb < 90) return false;
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

function sortItemsList(items) {
  const sortMode = document.getElementById('sortFilter')?.value || 'DEADLINE_ASC';
  const cloned = [...items];

  cloned.sort((a, b) => {
    const sa = getScheduleMeta(a);
    const sb = getScheduleMeta(b);

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
  if (cachedAllItems) return cachedAllItems;
  cachedAllItems = [
    ...(appData.jobs || []).map(x => ({ ...x, _track: 'career' })),
    ...(appData.albas || []).map(x => ({ ...x, _track: 'alba' })),
    ...(appData.freelances || []).map(x => ({ ...x, _track: 'freelance' })),
    ...(appData.contests || []).map(x => ({ ...x, _track: 'contest' }))
  ];
  return cachedAllItems;
}

function findItemById(id) {
  return getAllItemsWithTrack().find(x => x.id === id);
}

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

function toggleHighProbFilter() {
  highProbOnly = !highProbOnly;
  const btn = document.getElementById('highProbToggleBtn');
  if (btn) {
    btn.classList.toggle('btn-toggle-active', highProbOnly);
    btn.textContent = highProbOnly ? '90%+ ON' : '90%+';
  }
  onFilterChanged();
}

function onFilterChanged() {
  renderQuickKeywordBar();
  updateKpiAndCounts();
  updateSelectionUI();
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
  highProbOnly = false;
  const btn = document.getElementById('highProbToggleBtn');
  if (btn) {
    btn.classList.remove('btn-toggle-active');
    btn.textContent = '90%+';
  }
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

  const expiredTotalCount = getAllItemsWithTrack().filter(x => getScheduleMeta(x).isExpired).length;

  const visibleAll = [...filteredJobs, ...filteredAlbas, ...filteredFree, ...filteredContests];
  const avgProb = visibleAll.length
    ? Math.round(visibleAll.reduce((acc, it) => acc + analyzePostingForMoonPD(it).hireProb, 0) / visibleAll.length)
    : 91;

  const q = (document.getElementById('searchInput')?.value || '').trim();
  const regionF = document.getElementById('regionFilter')?.value || 'ALL';
  const siteF = document.getElementById('siteFilter')?.value || 'ALL';
  const isFiltered = Boolean(q || regionF !== 'ALL' || siteF !== 'ALL' || highProbOnly);

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('kpiCareerCount', isFiltered ? `${filteredJobs.length}/${allJobs.length}` : `${filteredJobs.length}건`);
  setTxt('kpiAlbaCount', isFiltered ? `${filteredAlbas.length}/${allAlbas.length}` : `${filteredAlbas.length}건`);
  setTxt('kpiFreelanceCount', isFiltered ? `${filteredFree.length}/${allFree.length}` : `${filteredFree.length}건`);
  setTxt('kpiContestCount', isFiltered ? `${filteredContests.length}/${allContests.length}` : `${filteredContests.length}건`);
  setTxt('kpiAvgProb', `${avgProb}%`);
  setTxt('headerSavedCount', getSavedCount());

  setTxt('tabCountCareer', filteredJobs.length);
  setTxt('tabCountAlba', filteredAlbas.length);
  setTxt('tabCountFreelance', filteredFree.length);
  setTxt('tabCountContests', filteredContests.length);
  setTxt('tabCountSaved', allSavedItems.length);
  setTxt('tabCountRadar', allSites.length);

  const expBadge = document.getElementById('hiddenExpiredBadge');
  if (expBadge) {
    expBadge.textContent = expiredTotalCount > 0
      ? `마감 ${expiredTotalCount}숨김`
      : '마감숨김';
  }

  const badge = document.getElementById('syncStatusBadge');
  if (badge) {
    badge.classList.toggle('web-mode', !IS_LOCAL_SERVER);
    const modeLabel = IS_LOCAL_SERVER ? '로컬' : '웹';
    badge.textContent = `${modeLabel} · ${visibleAll.length}건 · ${avgProb}%`;
  }
}

function updateSelectionUI() {
  const count = selectedIds.size;
  const hCount = document.getElementById('selectedCount');
  const fCount = document.getElementById('floatingSelectedCount');
  const fBar = document.getElementById('batchFloatingBar');
  if (hCount) hCount.textContent = count;
  if (fCount) fCount.textContent = count;
  if (fBar) fBar.classList.toggle('visible', count > 0);
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
  updateSelectionUI();
  renderActiveTab();
}

function selectAllVisible() {
  const list = getCurrentTabList();
  list.forEach(item => selectedIds.add(item.id));
  updateSelectionUI();
  renderActiveTab();
  showToast(`현재 목록 ${selectedIds.size}건 선택됨`);
}

function selectCategoryGroup(catName) {
  const items = getSavedItemsFiltered().filter(x => (savedCategoryMap[x.id] || autoDetectCategory(x)) === catName);
  items.forEach(item => selectedIds.add(item.id));
  updateSelectionUI();
  renderActiveTab();
  showToast(`[${catName}] 카테고리 ${items.length}건이 선택되었습니다.`);
}

function clearSelection() {
  selectedIds.clear();
  updateSelectionUI();
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
// 7. 경고, 확인 및 입력 모달
// ============================================================================
function openConfirmDialog({ title, message, subText, confirmLabel, onConfirm }) {
  const titleEl = document.getElementById('confirmModalTitle');
  const msgEl = document.getElementById('confirmModalMessage');
  const subEl = document.getElementById('confirmModalSub');
  const inputWrap = document.getElementById('confirmModalInputWrap');
  const btn = document.getElementById('confirmProceedBtn');

  if (titleEl) titleEl.textContent = title || '데이터 변경 확인';
  if (msgEl) msgEl.textContent = message || '';
  if (subEl) {
    subEl.style.display = subText ? 'block' : 'none';
    subEl.textContent = subText || '';
  }
  if (inputWrap) inputWrap.style.display = 'none';
  if (btn) {
    btn.textContent = confirmLabel || '확인 및 진행';
    btn.onclick = async () => {
      closeConfirmModal();
      if (typeof onConfirm === 'function') await onConfirm();
    };
  }
  document.getElementById('confirmModal').classList.add('open');
}

function openInputDialog({ title, message, placeholder, defaultValue, subText, onSubmit, onCancel }) {
  const titleEl = document.getElementById('confirmModalTitle');
  const msgEl = document.getElementById('confirmModalMessage');
  const subEl = document.getElementById('confirmModalSub');
  const inputWrap = document.getElementById('confirmModalInputWrap');
  const inputEl = document.getElementById('confirmModalInput');
  const btn = document.getElementById('confirmProceedBtn');
  const modal = document.getElementById('confirmModal');

  if (titleEl) titleEl.textContent = title || '입력';
  if (msgEl) msgEl.textContent = message || '';
  if (subEl) {
    subEl.style.display = subText ? 'block' : 'none';
    subEl.textContent = subText || '';
  }
  if (inputWrap && inputEl) {
    inputWrap.style.display = 'block';
    inputEl.placeholder = placeholder || '';
    inputEl.value = defaultValue || '';
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btn?.click();
      }
    };
  }
  if (btn) {
    btn.textContent = '확인';
    btn.onclick = async () => {
      const val = inputEl ? inputEl.value : '';
      closeConfirmModal();
      if (typeof onSubmit === 'function') await onSubmit(val);
    };
  }
  modal.dataset.hasCancel = onCancel ? '1' : '';
  modal._onCancel = onCancel || null;
  modal.classList.add('open');
  setTimeout(() => inputEl?.focus(), 50);
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (!modal) return;
  const wasOpen = modal.classList.contains('open');
  modal.classList.remove('open');
  if (wasOpen && modal.dataset.hasCancel === '1' && typeof modal._onCancel === 'function') {
    const fn = modal._onCancel;
    modal.dataset.hasCancel = '';
    modal._onCancel = null;
    fn();
  }
}

// ============================================================================
// 8. 탭별 카드 렌더링 (De-cluttered Liquid Glass Cards)
// ============================================================================
function renderStarAndCategoryControl(item, showExpireToggle = false) {
  const id = escapeHtml(item.id);
  const saved = isJobSaved(item.id);
  const currentCat = savedCategoryMap[item.id] || autoDetectCategory(item);
  const sched = getScheduleMeta(item);

  return `
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
      <button type="button" class="btn-star ${saved ? 'saved' : ''}" onclick="toggleStar('${id}')" title="${saved ? '관심 해제' : '관심 저장'}" aria-label="${saved ? '관심 해제' : '관심 저장'}">
        ${icon(saved ? 'starFilled' : 'star', 13)}
      </button>
      ${saved ? `
        <select class="cat-select" onchange="changeSavedItemCategory('${id}', this.value)" title="관심공고 카테고리 변경">
          ${savedCategories.map(c => `<option value="${escapeHtml(c)}" ${c === currentCat ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          <option value="__NEW__">+ 새 카테고리</option>
        </select>
      ` : ''}
      ${showExpireToggle ? `
        <button type="button" class="btn btn-outline btn-sm" style="padding:3px 7px;font-size:11px;" onclick="toggleManualExpired('${id}')" title="마감 여부 수동 전환">
          ${sched.isExpired ? '복구' : '마감'}
        </button>
      ` : ''}
    </div>
  `;
}

function renderEmptySearchPrompt(trackLabel) {
  const kw = (document.getElementById('searchInput')?.value || '').trim();
  if (kw) {
    return `
      <div class="panel-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <strong style="font-weight:600;">현재 목록에 '${escapeHtml(kw)}' 관련 ${escapeHtml(trackLabel)} 공고가 없습니다.</strong>
          <p style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">사람인·원티드·잡코리아·알바몬·위비티에서 '${escapeHtml(kw)}' 키워드로 실시간 공고를 수집할 수 있습니다.</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="triggerLiveCrawl()">
          ${icon('refresh', 13)} '${escapeHtml(kw)}' 실시간 수집
        </button>
      </div>
    `;
  }
  return `<div class="panel-card">조건에 맞는 공고가 없습니다. <strong>초기화</strong> 또는 <strong>실시간 수집</strong>을 눌러보세요.</div>`;
}

function renderUrgencyBadge(sched) {
  if (sched.isExpired) return '';
  if (sched.dDaySort === 0) return `<span class="badge-urgent">오늘</span>`;
  if (sched.dDaySort > 0 && sched.dDaySort <= 3) return `<span class="badge-urgent">D-${sched.dDaySort}</span>`;
  return '';
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

function renderPostingCard(item, trackType, ctaLabel) {
  const isSel = selectedIds.has(item.id);
  const regionTag = inferRegionBucket(item);
  const sched = getScheduleMeta(item);
  const fit = analyzePostingForMoonPD(item);
  const safeId = escapeHtml(item.id);

  const orgName = trackType === 'freelance'
    ? (item.budget || item.client || '견적 협의')
    : trackType === 'contest'
      ? (item.organizer || item.site)
      : (item.company || item.site);

  const shortSched = sched.dDayText === '오늘마감 (D-Day)' ? 'D-Day' : sched.dDayText;
  const metaParts = [
    `<strong>${escapeHtml(orgName)}</strong>`,
    (trackType !== 'freelance' && trackType !== 'contest') ? escapeHtml(regionTag) : null,
    escapeHtml(shortSched)
  ].filter(Boolean);

  return `
    <article class="item-card ${isSel ? 'selected' : ''}">
      <div>
        <div class="card-top">
          <div class="badge-group">
            <span class="badge-site">${escapeHtml(item.site)}</span>
            <span class="badge-match ${fit.hireProb >= 90 ? 'high' : ''}">${fit.hireProb}%</span>
            ${renderUrgencyBadge(sched)}
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${renderStarAndCategoryControl(item)}
            <label class="select-check" title="일괄 선택">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${safeId}', this.checked)" aria-label="공고 선택" />
            </label>
          </div>
        </div>
        <h3 class="card-title" style="margin-top:10px;">${escapeHtml(item.title)}</h3>
        <div class="card-meta-line" style="margin-top:6px;">${metaParts.join(' · ')}</div>
        <div class="fit-mini-box" style="margin-top:8px;">
          ${icon('zap', 12)}
          <span>${escapeHtml(fit.strengthPoint)}</span>
        </div>
      </div>
      <div class="card-footer">
        <button type="button" class="btn btn-primary btn-sm" onclick="openConvertedDocModal('${trackType}', '${safeId}')">
          ${icon('sparkles', 13)} ${ctaLabel}
        </button>
        <a class="btn btn-outline btn-sm" href="${safeUrl(item.url)}" target="_blank" rel="noopener">
          원문 ${icon('external', 12)}
        </a>
      </div>
    </article>
  `;
}

function renderCareerTab(area) {
  const items = sortItemsList((appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('정규·계약직');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(it => renderPostingCard(it, 'career', '진단·지원')).join('')}</div>`;
}

function renderAlbaTab(area) {
  const items = sortItemsList((appData.albas || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('알바·단기');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(it => renderPostingCard(it, 'alba', '진단·지원')).join('')}</div>`;
}

function renderFreelanceTab(area) {
  const items = sortItemsList((appData.freelances || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('외주·프리랜서');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(it => renderPostingCard(it, 'freelance', '진단·견적')).join('')}</div>`;
}

function renderContestsTab(area) {
  const items = sortItemsList((appData.contests || []).filter(x => matchesSearchAndFilter(x, false)));
  if (!items.length) {
    area.innerHTML = renderEmptySearchPrompt('공모전·지원사업');
    return;
  }
  area.innerHTML = `<div class="cards-grid">${items.map(it => renderPostingCard(it, 'contest', '진단·계획')).join('')}</div>`;
}

// 5. 관심공고 보관함 탭
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
  const safeId = escapeHtml(item.id);

  return `
    <article class="item-card ${isSel ? 'selected' : ''} ${sched.isExpired ? 'expired-card' : ''}">
      <div>
        <div class="card-top">
          <div class="badge-group">
            <span class="badge-site">${escapeHtml(item.site)}</span>
            ${sched.isExpired
              ? `<span class="badge-expired">마감·기간경과</span>`
              : `<span class="badge-match ${fit.hireProb >= 90 ? 'high' : ''}">${fit.hireProb}%</span>${renderUrgencyBadge(sched)}`
            }
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${renderStarAndCategoryControl(item, true)}
            <label class="select-check" title="일괄 선택">
              <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelect('${safeId}', this.checked)" aria-label="공고 선택" />
            </label>
          </div>
        </div>
        <h3 class="card-title" style="margin-top:10px;">
          ${sched.isExpired ? '[마감] ' : ''}${escapeHtml(item.title)}
        </h3>
        <div class="card-meta-line" style="margin-top:6px;">
          <strong>${escapeHtml(orgName)}</strong> · ${escapeHtml(regionTag)} · ${escapeHtml(sched.dDayText === '오늘마감 (D-Day)' ? 'D-Day' : sched.dDayText)}
        </div>
      </div>
      <div class="card-footer">
        <button type="button" class="btn btn-primary btn-sm" onclick="openConvertedDocModal('${escapeHtml(item._track)}', '${safeId}')">
          ${icon('sparkles', 13)} 진단·지원
        </button>
        <a class="btn btn-outline btn-sm" href="${safeUrl(item.url)}" target="_blank" rel="noopener">
          원문 ${icon('external', 12)}
        </a>
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

  const expiredNoticeHtml = expiredSavedItems.length > 0 ? `
    <div class="panel-card" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>${icon('alert', 14)} <strong>마감 공고 알림:</strong> 저장된 관심공고 중 지원기간이 지난 공고가 <strong class="num">${expiredSavedItems.length}건</strong> 있습니다.</span>
      <button type="button" class="btn btn-outline btn-sm" onclick="removeExpiredFromSaved()">마감 공고만 일괄 해제</button>
    </div>
  ` : '';

  const filterBarHtml = expiredNoticeHtml + `
    <div class="panel-card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <span style="font-weight:600;" class="num">관심공고함 (총 ${allSaved.length}건 · 활성 ${allSaved.length - expiredSavedItems.length}건 / 마감 ${expiredSavedItems.length}건)</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="toggleSavedGroupViewMode()">
            ${savedGroupViewMode ? '단일 그리드로 보기' : '카테고리별 묶음 보기'}
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="addNewSavedCategoryPrompt()">${icon('plus', 13)} 새 카테고리</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="runBatchConvertAndApply()">선택 일괄변환</button>
        </div>
      </div>

      <div class="cat-filter-bar" style="margin-bottom:0;">
        <button type="button" class="cat-pill ${activeSavedCategoryFilter === 'ALL' ? 'active' : ''}" onclick="setSavedCategoryFilter('ALL')">
          전체 <span class="num">(${allSaved.length})</span>
        </button>
        ${savedCategories.map(cat => {
          const safeAttr = escapeHtml(cat).replace(/&#39;/g, "\\'");
          return `
            <button type="button" class="cat-pill ${activeSavedCategoryFilter === cat ? 'active' : ''}" onclick="setSavedCategoryFilter('${safeAttr}')">
              ${escapeHtml(cat)} <span class="num">(${catCounts[cat] || 0})</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;

  if (!filteredItems.length) {
    area.innerHTML = filterBarHtml + `
      <div class="panel-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span>${activeSavedCategoryFilter === 'ALL' ? '아직 저장된 관심공고가 없습니다.' : `[${escapeHtml(activeSavedCategoryFilter)}] 카테고리에 저장된 공고가 없습니다.`} 각 공고 카드의 <strong>저장</strong>을 눌러 보관해보세요.</span>
        <button type="button" class="btn btn-outline btn-sm" onclick="switchTab('career')">채용공고 보러가기</button>
      </div>
    `;
    return;
  }

  if (savedGroupViewMode && activeSavedCategoryFilter === 'ALL') {
    const activeCats = savedCategories.filter(c => (catCounts[c] || 0) > 0);
    area.innerHTML = filterBarHtml + activeCats.map(cat => {
      const groupItems = filteredItems.filter(item => (savedCategoryMap[item.id] || autoDetectCategory(item)) === cat);
      if (!groupItems.length) return '';
      const safeAttr = escapeHtml(cat).replace(/&#39;/g, "\\'");
      return `
        <div class="cat-group-box">
          <div class="cat-group-header">
            <strong style="font-size:13.5px;font-weight:600;color:var(--text-main);">${escapeHtml(cat)} <span class="status-chip num">${groupItems.length}건</span></strong>
            <button type="button" class="btn btn-outline btn-sm" onclick="selectCategoryGroup('${safeAttr}')">이 카테고리 전체선택</button>
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
    <div class="panel-card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span class="num">연동 플랫폼 <strong style="font-weight:600;">${sites.length}곳</strong> · 키워드 입력 후 실시간 수집 시 자동 탐색</span>
      <button type="button" class="btn btn-primary btn-sm" onclick="addNewCustomSitePrompt()">${icon('plus', 13)} 사이트 추가</button>
    </div>
    <div class="cards-grid">
      ${sites.map(s => `
        <article class="item-card">
          <div>
            <div class="card-top">
              <span class="badge-site">${escapeHtml(s.category)}</span>
              <span class="badge-match">${escapeHtml(s.status)}</span>
            </div>
            <h3 class="card-title" style="margin-top:10px;">${escapeHtml(s.name)}</h3>
            <div class="card-meta-line" style="margin-top:6px;">
              <strong>${escapeHtml(s.cashcowType)}</strong> · ${escapeHtml(s.dailyNew)}
            </div>
          </div>
          <div class="card-footer">
            <a class="btn btn-outline btn-sm" style="width:100%;" href="${safeUrl(s.url)}" target="_blank" rel="noopener">
              사이트 열기 ${icon('external', 12)}
            </a>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

// ============================================================================
// 9. 커리어 직군분석 메뉴
// ============================================================================
let aiCareerCache = null;

function getAiCareerData() {
  if (aiCareerCache && aiCareerCache.roles) return aiCareerCache;
  try {
    const saved = localStorage.getItem('moonpd_ai_career_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.roles) {
        aiCareerCache = parsed;
        return aiCareerCache;
      }
    }
  } catch (e) {}
  if (typeof window !== 'undefined' && window.MOONPD_AI_CAREER_ANALYSIS) {
    aiCareerCache = window.MOONPD_AI_CAREER_ANALYSIS;
    return aiCareerCache;
  }
  return { roles: {}, executiveSummary: '', model: 'pending' };
}

async function refreshAiCareerDataFromServer() {
  if (!IS_LOCAL_SERVER) return;
  try {
    const res = await fetch('/api/ai-career-data', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.roles) {
        aiCareerCache = data;
        localStorage.setItem('moonpd_ai_career_v1', JSON.stringify(data));
      }
    }
  } catch (e) {}
}

async function runBrowserDirectGeminiAnalysis(apiKey, keywords) {
  const allPostings = getAllItemsWithTrack();
  const keywordContext = {};
  keywords.forEach(kw => {
    const tokens = kw.trim().split(/\s+/).filter(t => t.length >= 2);
    const matched = allPostings.filter(it => {
      const txt = `${it.title || ''} ${it.company || ''} ${it.category || ''} ${it.summary || ''}`.toLowerCase();
      return tokens.some(t => txt.includes(t.toLowerCase()));
    });
    keywordContext[kw] = {
      matchedCount: matched.length,
      samples: matched.slice(0, 10).map(m => `${m.company || ''} - ${m.title || ''}`)
    };
  });

  const promptText = `당신은 대한민국 최고 수준의 커리어 전략가이자 1인 미디어·마케팅·콘텐츠 파이프라인 컨설턴트입니다.
아래 [지원자 이력서]와 [실제 수집된 채용공고 샘플]을 비교해, 각 키워드 직군별 현실적이고 구체적인 커리어 & 캐시카우 분석을 JSON으로 작성하세요.
추상적 일반론을 금지하고, 반드시 실제 회사명/공고명과 지원자의 실제 보유 역량을 연결해 구체적 수치·액션플랜을 제시하세요.

[지원자 이력서]
${JSON.stringify(masterResume)}

[등록 키워드별 실제 수집 공고]
${JSON.stringify(keywordContext)}

반드시 아래 JSON 스키마로만 응답하세요:
{
  "executiveSummary": "전체 포트폴리오 총평 (2~3문장)",
  "roles": {
    "키워드명": {
      "roleTitle": "직군 카테고리명",
      "hireProb": 85,
      "boostedProb": 94,
      "sampleCompanies": ["실제 공고 회사명1", "회사명2", "회사명3"],
      "marketTrend": "실제 공고 기반 시장 트렌드 1~2문장",
      "strengths": ["구체적 강점 1", "구체적 강점 2"],
      "weaknesses": ["구체적 약점/보완지표 1", "구체적 약점 2"],
      "howToImprove": ["즉시 실행 가능한 보완 액션 1", "보완 액션 2", "보완 액션 3"],
      "polishSkill": "가장 임팩트가 큰 1순위 보완 스킬 (단문)"
    }
  }
}`;

  const models = ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  let parsedAi = null;
  let usedModel = '';
  let lastErr = '';
  for (const m of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
        })
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const gData = await res.json();
      const rawText = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) { lastErr = 'Empty response'; continue; }
      parsedAi = JSON.parse(rawText);
      usedModel = m;
      break;
    } catch (e) {
      lastErr = e.message;
    }
  }
  if (!parsedAi) throw new Error('Gemini API 호출 실패: ' + lastErr);

  const current = getAiCareerData();
  return {
    generatedAt: new Date().toISOString().slice(0, 19) + '+09:00',
    model: usedModel,
    sourceCount: allPostings.length,
    executiveSummary: parsedAi.executiveSummary || current.executiveSummary,
    roles: { ...(current.roles || {}), ...(parsedAi.roles || {}) }
  };
}

async function executeGeminiAnalysis(apiKey) {
  const keywords = (quickKeywords && quickKeywords.length) ? quickKeywords : DEFAULT_QUICK_KEYWORDS;
  const btn = document.getElementById('btn-gemini-reanalyze');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gemini AI 심층 분석 중...';
  }
  try {
    let data;
    if (IS_LOCAL_SERVER) {
      const res = await fetch('/api/ai-career-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, keywords, resume: masterResume })
      });
      data = await res.json();
      if (!res.ok || data.ok === false) {
        if (data.needApiKey) {
          if (btn) { btn.disabled = false; btn.textContent = 'Gemini AI 실시간 심층분석'; }
          return triggerGeminiCareerAnalysis(true);
        }
        throw new Error(data.message || 'AI 분석 요청 실패');
      }
    } else {
      data = await runBrowserDirectGeminiAnalysis(apiKey, keywords);
    }
    aiCareerCache = data;
    localStorage.setItem('moonpd_ai_career_v1', JSON.stringify(data));
    onFilterChanged();
    showToast('Gemini AI가 최신 수집 공고와 이력서를 비교해 커리어 분석을 새로 생성했습니다.');
  } catch (err) {
    showToast('Gemini AI 분석 오류: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Gemini AI 실시간 심층분석';
    }
  }
}

async function triggerGeminiCareerAnalysis(askKey = false) {
  if (!IS_LOCAL_SERVER) {
    const savedKey = localStorage.getItem('moonpd_gemini_api_key') || '';
    if (askKey || !savedKey) {
      openInputDialog({
        title: 'Gemini API 키 설정 (웹 버전)',
        message: 'Google AI Studio(https://aistudio.google.com/apikey)에서 발급받은 Gemini API 키를 입력하세요.',
        placeholder: 'AIza...',
        defaultValue: savedKey,
        subText: '입력한 키는 이 브라우저의 localStorage에만 저장됩니다.',
        onSubmit: async (input) => {
          const clean = input.trim();
          if (!clean) {
            showToast('API 키가 입력되지 않았습니다.');
            return;
          }
          localStorage.setItem('moonpd_gemini_api_key', clean);
          await executeGeminiAnalysis(clean);
        }
      });
      return;
    }
    await executeGeminiAnalysis(savedKey);
    return;
  }

  const currentAi = getAiCareerData();
  if (askKey || !currentAi.hasApiKey) {
    openInputDialog({
      title: 'Gemini API 키 설정 (로컬 서버)',
      message: 'Google AI Studio(https://aistudio.google.com/apikey)에서 발급받은 Gemini API 키를 입력하세요.',
      placeholder: 'AIza...',
      subText: '1회 입력 시 PC의 moonpd_system/data/gemini_config.json에 저장됩니다.',
      onSubmit: async (input) => {
        const clean = input.trim();
        if (!clean && !currentAi.hasApiKey) {
          showToast('API 키가 입력되지 않았습니다.');
          return;
        }
        await executeGeminiAnalysis(clean);
      }
    });
    return;
  }
  await executeGeminiAnalysis('');
}

function findAiRoleEntry(rolesObj, kw) {
  if (!rolesObj) return null;
  if (rolesObj[kw]) return rolesObj[kw];
  const kwLower = kw.toLowerCase().trim();
  const keys = Object.keys(rolesObj);
  const exactInsensitive = keys.find(k => k.toLowerCase() === kwLower);
  if (exactInsensitive) return rolesObj[exactInsensitive];
  const partial = keys.find(k => kwLower.includes(k.toLowerCase()) || k.toLowerCase().includes(kwLower));
  return partial ? rolesObj[partial] : null;
}

function analyzeKeywordRoleProfile(kw) {
  const allActive = getAllItemsWithTrack().filter(x => !getScheduleMeta(x).isExpired);
  const kwLower = kw.toLowerCase();
  const matched = allActive.filter(item => {
    const text = `${item.title || ''} ${item.company || ''} ${item.keyword || ''} ${item.jdSummary || ''} ${item.summary || ''}`.toLowerCase();
    return text.includes(kwLower) || kwLower.split(/\s+/).every(t => t.length >= 2 && text.includes(t));
  });

  const aiData = getAiCareerData();
  const aiRole = findAiRoleEntry(aiData.roles, kw);

  if (aiRole) {
    return {
      keyword: kw,
      isAiAnalyzed: true,
      roleCategory: stripLeadingEmoji(aiRole.roleTitle || aiRole.roleCategory || `${kw} 직군`),
      matchedCount: matched.length,
      avgProb: aiRole.hireProb || 85,
      boostedProb: aiRole.boostedProb || 94,
      sampleCompanies: aiRole.sampleCompanies || matched.slice(0, 4).map(m => m.company).filter(Boolean),
      marketTrend: aiRole.marketTrend || '',
      strengths: Array.isArray(aiRole.strengths) ? aiRole.strengths : [aiRole.strengths].filter(Boolean),
      weaknesses: Array.isArray(aiRole.weaknesses) ? aiRole.weaknesses : [aiRole.weaknesses].filter(Boolean),
      howToImprove: Array.isArray(aiRole.howToImprove) ? aiRole.howToImprove : [aiRole.howToImprove].filter(Boolean),
      polishSkill: aiRole.polishSkill || ''
    };
  }

  const avgProb = matched.length
    ? Math.round(matched.reduce((acc, it) => acc + analyzePostingForMoonPD(it).hireProb, 0) / matched.length)
    : analyzePostingForMoonPD({ title: kw, keyword: kw }).hireProb;

  return {
    keyword: kw,
    isAiAnalyzed: false,
    roleCategory: `${kw} 직군 (신규 키워드)`,
    matchedCount: matched.length,
    avgProb,
    boostedProb: Math.min(99, avgProb + 8),
    sampleCompanies: matched.slice(0, 4).map(m => m.company).filter(Boolean),
    marketTrend: matched.length
      ? `현재 활성 공고 ${matched.length}건이 매칭되었습니다. 상단의 [Gemini AI 실시간 심층분석] 버튼을 누르면 AI 맞춤형 분석이 생성됩니다.`
      : '현재 매칭된 활성 공고가 적습니다. AI 실시간 분석을 실행해 시장 적합도를 확인하세요.',
    strengths: ['14년차 영상 PD·마케팅 팀장 올라운더 역량 및 3D/AI 자동화 파이프라인 보유'],
    weaknesses: ['신규 추가된 키워드입니다. [Gemini AI 실시간 심층분석]으로 공고별 세부 보완점을 생성해 주세요.'],
    howToImprove: ['상단 [Gemini AI 실시간 심층분석] 버튼 클릭으로 실시간 공고 기반 액션플랜 생성'],
    polishSkill: 'AI 심층 분석 후 맞춤 추천 기술 확인'
  };
}

function renderCareerAnalysisTab(area) {
  const registeredKeywords = quickKeywords && quickKeywords.length ? quickKeywords : DEFAULT_QUICK_KEYWORDS;
  const aiData = getAiCareerData();
  const roleProfiles = registeredKeywords.map(analyzeKeywordRoleProfile);
  const overallAvg = roleProfiles.length
    ? Math.round(roleProfiles.reduce((a, b) => a + b.avgProb, 0) / roleProfiles.length)
    : 88;
  const modelLabel = aiData.model || aiData.engine || 'Gemini AI';

  area.innerHTML = `
    <div class="panel-card" style="margin-bottom:16px;">
      <h3>
        <span class="num">AI 커리어 직군분석 (수집 공고 ${aiData.sourceCount || getAllItemsWithTrack().length}건 × 문PD 이력서 실증 비교)</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span class="status-chip num">평균 채용예측률 ${overallAvg}%</span>
          <button type="button" id="btn-gemini-reanalyze" class="btn btn-primary btn-sm" onclick="triggerGeminiCareerAnalysis(false)">${icon('sparkles', 13)} Gemini AI 실시간 심층분석</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="triggerGeminiCareerAnalysis(true)">${icon('key', 13)} API 키 설정</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="addCustomQuickKeywordPrompt()">${icon('plus', 13)} 키워드 추가</button>
        </div>
      </h3>

      ${aiData.executiveSummary ? `
        <div class="one-liner" style="margin-bottom:16px;-webkit-line-clamp:unset;">
          <strong style="font-weight:600;">AI 종합 커리어 전략 진단</strong> <span class="chip num" style="margin-left:6px;">${escapeHtml(modelLabel)}${aiData.generatedAt ? ' · ' + escapeHtml(aiData.generatedAt.slice(0, 10)) : ''}</span>
          <div style="margin-top:6px;line-height:1.55;">${escapeHtml(aiData.executiveSummary)}</div>
        </div>
      ` : ''}

      <div class="cards-grid">
        ${roleProfiles.map(rp => {
          const safeKwAttr = escapeHtml(rp.keyword).replace(/&#39;/g, "\\'");
          return `
            <article class="item-card">
              <div>
                <div class="card-top">
                  <div class="badge-group">
                    <span class="badge-site">${escapeHtml(rp.keyword)}</span>
                    <span class="badge-match ${rp.avgProb >= 90 ? 'high' : ''}">${rp.avgProb}% → ${rp.boostedProb}%</span>
                  </div>
                  <span class="badge-site num">${rp.isAiAnalyzed ? 'AI 분석' : '대기'} · ${rp.matchedCount}건</span>
                </div>

                <h3 class="card-title" style="margin-top:10px;">${escapeHtml(rp.roleCategory)}</h3>

                ${rp.sampleCompanies && rp.sampleCompanies.length ? `
                  <div class="card-meta-line" style="margin-top:6px;">
                    ${rp.sampleCompanies.map(c => escapeHtml(c)).join(' · ')}
                  </div>
                ` : ''}

                <div class="bar-row" style="margin-top:10px;margin-bottom:10px;">
                  <div class="bar-track"><div class="bar-fill" style="width:${rp.avgProb}%"></div></div>
                </div>

                ${rp.marketTrend ? `
                  <div style="font-size:12px;color:var(--text-sub);margin-bottom:10px;line-height:1.5;">
                    <strong style="font-weight:600;color:var(--text-main);">시장 트렌드</strong> · ${escapeHtml(rp.marketTrend)}
                  </div>
                ` : ''}

                <div class="fit-mini-box" style="line-height:1.55;">
                  <div><strong style="color:var(--color-primary);">나의 강점</strong>
                    <ul style="margin:3px 0 6px 16px;padding:0;">
                      ${rp.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                  </div>
                  <div><strong style="color:var(--color-secondary);">보완 지표</strong>
                    <ul style="margin:3px 0 6px 16px;padding:0;">
                      ${rp.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
                    </ul>
                  </div>
                  <div><strong style="color:var(--text-main);">실행 액션</strong>
                    <ul style="margin:3px 0 6px 16px;padding:0;">
                      ${rp.howToImprove.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
                    </ul>
                  </div>
                  <div style="margin-top:4px;"><strong>1순위 연마 기술</strong> · ${escapeHtml(rp.polishSkill)}</div>
                </div>
              </div>
              <div class="card-footer">
                <button type="button" class="btn btn-primary btn-sm" onclick="quickKeyword('${safeKwAttr}'); switchTab('career');">
                  ${icon('search', 13)} '${escapeHtml(rp.keyword)}' 공고 보기
                </button>
                <button type="button" class="btn btn-outline btn-sm" onclick="switchTab('analytics')">
                  ${icon('edit', 13)} 이력서 보완
                </button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </div>

    <div class="panel-card">
      <h3>
        <span>매일 공고 확인 · 채용확률 90% 이상 신규공고 카카오톡 알림</span>
        <span class="status-chip">${IS_LOCAL_SERVER ? '로컬 서버 연동 가능' : '로컬 PC 전용 기능'}</span>
      </h3>
      <div class="one-liner" style="margin-bottom:12px;-webkit-line-clamp:unset;">
        • <strong>동작 방식:</strong> 매일 오전 09:00 자동 수집기(<code>crawler.ps1</code>)가 최신 공고를 확인한 뒤, <strong>신규 공고 중 채용확률 90% 이상</strong>인 공고만 추려 카카오톡 나에게 보내기로 전송합니다.<br/>
        • <strong>실행 환경:</strong> ${IS_LOCAL_SERVER ? '현재 로컬 PC 서버(localhost:8090)에 연결되어 테스트 발송이 가능합니다.' : '현재 웹 뷰어 모드입니다. 카카오톡 발송 테스트는 로컬 PC 서버(http://localhost:8090) 실행 시 사용할 수 있습니다.'}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="btn btn-primary btn-sm" onclick="testKakaoNotifyViaServer()" ${IS_LOCAL_SERVER ? '' : 'disabled title="로컬 PC 서버 실행 시 사용 가능"'}>
          ${icon('bell', 13)} 카카오톡 알림 테스트 발송
        </button>
        <span class="chip">스크립트: moonpd_system/kakao_notify.ps1</span>
      </div>
    </div>
  `;
}

async function testKakaoNotifyViaServer() {
  if (!IS_LOCAL_SERVER) {
    showToast('카카오톡 발송 테스트는 로컬 PC 서버(http://localhost:8090)에서만 지원됩니다.');
    return;
  }
  showToast('카카오톡 알림 발송 테스트 요청 중...');
  try {
    const res = await fetch('/api/kakao-test', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast('카카오톡 나에게 보내기 발송 성공');
    } else {
      showToast(data.message || '카카오톡 REST API 토큰 설정이 먼저 필요합니다.');
    }
  } catch (e) {
    showToast('로컬 PC 서버(http://localhost:8090) 연결을 확인해 주세요.');
  }
}

function renderAnalyticsAndResumeTab(area) {
  const readonlyAttr = isResumeEditMode ? '' : 'readonly';
  const inputClass = isResumeEditMode ? 'field-input editable' : 'field-input';
  const pfList = masterResume.portfolioHistory || DEFAULT_MASTER_RESUME.portfolioHistory;

  area.innerHTML = `
    <div class="panel-card" style="margin-bottom:16px;">
      <h3>
        <span>마스터 이력서 관리 · 수정 · 사람인 재등록 브릿지</span>
        <span class="status-chip">${isResumeEditMode ? '편집 모드 (수정 가능)' : '읽기 보호 모드'}</span>
      </h3>

      <div class="one-liner" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;-webkit-line-clamp:unset;">
        <span><strong>이력서 저장소:</strong> ${IS_LOCAL_SERVER ? '로컬 서버 + 브라우저 동시 저장' : '웹 뷰어 모드 (이 브라우저 localStorage 저장 · 파일 다운로드 지원)'}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="downloadSaraminLatestResume()">${icon('download', 13)} 이력서 파일 다운(.txt)</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="openSaraminReregisterBridge()">사람인 재등록 양식 열기 ${icon('external', 12)}</button>
        </div>
      </div>

      <div class="resume-action-grid">
        <div class="action-tile">
          <div class="action-tile-title"><span>1. 불러오기</span></div>
          <div class="action-tile-desc">${IS_LOCAL_SERVER ? '로컬 서버/클라우드 최신 백업본 불러오기' : '기본 마스터 백업본으로 복원'}</div>
          <button type="button" class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="requestLoadResume()">
            ${icon('download', 13)} 최신본 불러오기
          </button>
        </div>

        <div class="action-tile ${isResumeEditMode ? 'active-mode' : ''}">
          <div class="action-tile-title"><span>2. 편집하기</span></div>
          <div class="action-tile-desc">${isResumeEditMode ? '수정 완료 후 편집 내용 저장 클릭' : '잠금 해제 후 이력서 항목 직접 수정'}</div>
          ${isResumeEditMode
            ? `<button type="button" class="btn btn-primary btn-sm" style="margin-top:4px;" onclick="requestSaveEditedResume()">${icon('check', 13)} 편집 내용 저장</button>`
            : `<button type="button" class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="enableResumeEditMode()">${icon('edit', 13)} 편집 모드 켜기</button>`
          }
        </div>

        <div class="action-tile">
          <div class="action-tile-title"><span>3. 업로드하기</span></div>
          <div class="action-tile-desc">PC의 이력서 파일(.json/.txt) 불러오기</div>
          <button type="button" class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="triggerResumeFileUpload()">
            ${icon('upload', 13)} 이력서 업로드
          </button>
        </div>

        <div class="action-tile">
          <div class="action-tile-title"><span>4. 클라우드 동기화</span></div>
          <div class="action-tile-desc">${IS_LOCAL_SERVER ? '구글 드라이브·시트 즉시 동기화' : '로컬 PC 서버 실행 시 동기화 가능'}</div>
          <button type="button" class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="requestCloudSync()" ${IS_LOCAL_SERVER ? '' : 'disabled title="로컬 PC 서버 실행 시 사용 가능"'}>
            ${icon('refresh', 13)} 클라우드 동기화
          </button>
        </div>
      </div>

      <div class="form-grid">
        <label class="field-label">성명 / 브랜드명
          <input id="resName" class="${inputClass}" ${readonlyAttr} value="${escapeHtml(masterResume.name || '')}" />
        </label>
        <label class="field-label">연동 이메일 (사람인·Google)
          <input id="resEmail" class="${inputClass}" ${readonlyAttr} value="${escapeHtml(masterResume.email || '')}" />
        </label>
        <label class="field-label">대표 헤드라인
          <input id="resHeadline" class="${inputClass}" ${readonlyAttr} value="${escapeHtml(masterResume.headline || '')}" />
        </label>
        <label class="field-label">희망 연봉 / 단가 / 투입시기
          <input id="resSalary" class="${inputClass}" ${readonlyAttr} value="${escapeHtml(masterResume.desiredSalary || '면접 후 결정 (즉시 투입 가능)')}" />
        </label>
        <label class="field-label">대표 포트폴리오 파일
          <input id="resPortfolio" class="${inputClass}" ${readonlyAttr} value="${escapeHtml(masterResume.portfolioMain || '')}" />
        </label>
        <label class="field-label">포트폴리오 구글 드라이브 링크
          <input id="resPortfolioUrl" class="${inputClass}" ${readonlyAttr} value="${escapeHtml(masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL)}" />
        </label>
        <label class="field-label" style="grid-column: 1 / -1;">보유 기술 및 자동화 강점
          <input id="resTools" class="${inputClass}" ${readonlyAttr} value="${escapeHtml(masterResume.tools || '')}${masterResume.techAutomation ? ' | ' + escapeHtml(masterResume.techAutomation) : ''}" />
        </label>
        <label class="field-label" style="grid-column: 1 / -1;">핵심 경력 요약 (줄바꿈 구분 · 지원서 자동 변환에 반영됨)
          <textarea id="resCareer" class="${inputClass}" ${readonlyAttr} style="min-height:90px;resize:vertical;">${escapeHtml((masterResume.coreCareer || []).join('\n'))}</textarea>
        </label>
      </div>
    </div>

    <div class="panel-card" style="margin-bottom:16px;">
      <h3>
        <span>포트폴리오 저장소 · 지원서 자동 첨부 관리</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" onclick="triggerPortfolioFileUpload()">${icon('upload', 13)} 새 포트폴리오 등록</button>
          <a class="btn btn-outline btn-sm" href="${GOOGLE_DRIVE_URL}" target="_blank" rel="noopener">${icon('folder', 13)} 드라이브 폴더 열기 ${icon('external', 12)}</a>
        </div>
      </h3>
      <div class="one-liner" style="margin-bottom:12px;-webkit-line-clamp:unset;">
        <strong>자동 첨부 설정:</strong> 대표로 지정된 포트폴리오 파일명과 Google 드라이브 링크가 모든 지원서/견적서 변환 시 자동으로 삽입됩니다.
      </div>
      <div class="cards-grid">
        ${pfList.map((pf, idx) => `
          <div class="action-tile ${idx === 0 ? 'active-mode' : ''}">
            <div class="action-tile-title">
              <span>${idx === 0 ? '대표 포트폴리오 (자동첨부)' : '서브 포트폴리오'}</span>
              <span class="status-chip num">${escapeHtml(pf.uploadedAt || '최신')}</span>
            </div>
            <div style="font-size:13.5px;font-weight:600;color:var(--text-main);margin-top:4px;">${escapeHtml(pf.name)}</div>
            <div class="action-tile-desc">${escapeHtml(pf.source || '포트폴리오 등록됨')}</div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <a class="btn btn-outline btn-sm" href="${safeUrl(pf.driveUrl || GOOGLE_DRIVE_URL)}" target="_blank" rel="noopener">드라이브 확인 ${icon('external', 12)}</a>
              <button type="button" class="btn btn-outline btn-sm" onclick="setAsPrimaryPortfolio(${idx})">대표 지정</button>
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
  const txtContent = `[마스터 이력서 백업본]
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
  showToast('마스터 이력서가 PC에 다운로드되었습니다.');
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

  document.getElementById('modalTitle').textContent = '수정 이력서 → 사람인(Saramin) 재등록 브릿지';
  document.getElementById('modalSubtitle').textContent = '내용을 확인·수정한 뒤 [복사 후 지원창 열기]를 누르면 자동 복사 후 사람인 이력서 관리창으로 이동합니다.';
  document.getElementById('modalTextarea').value = saraminFormatted;
  renderModalFitAnalysisBox(null);
  renderModalPortfolioBar();
  runLiveFormatValidation();
  document.getElementById('docModal').classList.add('open');
}

// ============================================================================
// 11. 포트폴리오 업로드 & 자동 첨부 핸들러
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
    title: '신규 포트폴리오 등록 확인',
    message: `'${file.name}' 파일을 대표 포트폴리오로 등록하시겠습니까?`,
    subText: IS_LOCAL_SERVER
      ? `파일명: ${file.name} (${(file.size / 1024).toFixed(1)} KB) — 로컬 서버를 통해 드라이브 업로드 시도`
      : `파일명: ${file.name} (${(file.size / 1024).toFixed(1)} KB) — 웹 뷰어 모드에서는 브라우저에만 파일명이 등록됩니다`,
    onConfirm: async () => {
      showToast(`'${file.name}' 처리 중...`);
      const reader = new FileReader();
      reader.onload = async e => {
        const base64Data = (e.target.result || '').toString().split(',')[1] || '';
        let driveFileId = '';
        let driveUrl = GOOGLE_DRIVE_URL;
        let serverUploaded = false;

        if (IS_LOCAL_SERVER) {
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
              driveFileId = out.driveFileId || '';
              if (out.driveUrl) {
                driveUrl = out.driveUrl;
                serverUploaded = true;
              } else if (driveFileId) {
                driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;
                serverUploaded = true;
              }
            }
          } catch (err) {}
        }

        const newEntry = {
          name: file.name,
          source: serverUploaded
            ? '로컬 서버·구글 드라이브 업로드 완료'
            : '브라우저 등록 포트폴리오 (드라이브 업로드는 로컬 서버에서 가능)',
          driveId: driveFileId || 'local-browser',
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
        showToast(serverUploaded
          ? `'${file.name}' 드라이브 업로드 및 대표 포트폴리오 설정 완료`
          : `'${file.name}' 브라우저 대표 포트폴리오로 등록됨 (드라이브 업로드는 로컬 서버 필요)`);
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
  showToast(`'${chosen.name}' 파일이 대표 자동첨부 포트폴리오로 지정되었습니다.`);
}

// ============================================================================
// 12. 이력서 4대 작업 핸들러
// ============================================================================
function requestLoadResume() {
  openConfirmDialog({
    title: '이력서 불러오기 확인',
    message: IS_LOCAL_SERVER
      ? '로컬 서버에서 최신 마스터 이력서를 불러옵니다. 현재 화면의 수정 내용이 덮어씌워집니다.'
      : '기본 마스터 이력서로 초기화합니다. 현재 브라우저에 수정한 내용이 덮어씌워집니다.',
    subText: '대상: 마스터 이력서',
    onConfirm: async () => {
      let loadedFromServer = false;
      if (IS_LOCAL_SERVER) {
        try {
          const res = await fetch('/api/resume-load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'cloud' })
          });
          if (res.ok) {
            const loaded = await res.json();
            persistMasterResumeLocal(loaded);
            loadedFromServer = true;
          }
        } catch (e) {}
      }
      if (!loadedFromServer) {
        persistMasterResumeLocal({ ...DEFAULT_MASTER_RESUME });
      }
      isResumeEditMode = false;
      renderActiveTab();
      showToast(loadedFromServer ? '로컬 서버에서 최신 이력서를 불러왔습니다.' : '기본 마스터 이력서로 복원되었습니다.');
    }
  });
}

function enableResumeEditMode() {
  isResumeEditMode = true;
  renderActiveTab();
  showToast('편집 모드가 켜졌습니다. 수정 후 [편집 내용 저장]을 눌러주세요.');
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
    title: '이력서 편집 저장 확인',
    message: IS_LOCAL_SERVER
      ? '수정하신 내용을 브라우저 및 로컬 PC 서버에 저장하시겠습니까?'
      : '수정하신 내용을 현재 브라우저(localStorage)에 저장하시겠습니까?',
    subText: `변경 헤드라인: ${newHeadline}`,
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
      let serverSaved = false;
      if (IS_LOCAL_SERVER) {
        try {
          const res = await fetch('/api/resume-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(masterResume)
          });
          if (res.ok) serverSaved = true;
        } catch (e) {}
      }
      isResumeEditMode = false;
      renderActiveTab();
      showToast(serverSaved
        ? '로컬 서버 및 브라우저에 이력서가 저장되었습니다.'
        : '브라우저(localStorage)에 이력서가 저장되었습니다.');
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
      title: '이력서 파일 불러오기 확인',
      message: `선택하신 '${file.name}' 파일의 데이터로 현재 마스터 이력서를 교체하시겠습니까?`,
      subText: `파일명: ${file.name} (${file.size} bytes)`,
      onConfirm: async () => {
        try {
          if (file.name.endsWith('.json')) {
            persistMasterResumeLocal(JSON.parse(rawContent));
          } else {
            const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
            persistMasterResumeLocal({ ...masterResume, coreCareer: lines.slice(0, 8) });
          }
        } catch (err) {
          showToast('파일 파싱에 실패했습니다. JSON 또는 텍스트 형식을 확인해 주세요.');
          return;
        }

        let serverUploaded = false;
        if (IS_LOCAL_SERVER) {
          try {
            const res = await fetch('/api/resume-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename: file.name, rawContent, parsedResume: masterResume })
            });
            if (res.ok) serverUploaded = true;
          } catch (err) {}
        }

        isResumeEditMode = false;
        renderActiveTab();
        showToast(serverUploaded
          ? `'${file.name}' 로컬 서버 반영 완료`
          : `'${file.name}' 브라우저 반영 완료`);
      }
    });
  };
  reader.readAsText(file, 'utf-8');
}

function requestCloudSync() {
  if (!IS_LOCAL_SERVER) {
    showToast('클라우드 동기화는 로컬 PC 서버(http://localhost:8090) 실행 시 사용할 수 있습니다.');
    return;
  }
  openConfirmDialog({
    title: '구글 클라우드 동기화 확인',
    message: '현재 이력서와 포트폴리오, 수집 데이터를 Google 시트 및 드라이브에 동기화합니다. 진행하시겠습니까?',
    subText: '연동 계정: sgstarceo@gmail.com',
    onConfirm: async () => {
      showToast('Google 시트 및 드라이브 동기화 중...');
      try {
        const res = await fetch('/api/resume-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(masterResume)
        });
        if (res.ok) {
          showToast('Google 시트 및 드라이브 동기화 완료');
          return;
        }
        showToast('서버 동기화 응답 오류 (' + res.status + ')');
      } catch (e) {
        showToast('로컬 서버 연결 실패: 동기화를 완료하지 못했습니다.');
      }
    }
  });
}

// ============================================================================
// 13. 모달 내 공고 합격진단 + 양식 적합성 체크 & 자동 수정
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
      <strong style="font-size:12.5px;font-weight:600;color:var(--text-main);" class="num">
        문PD 맞춤 합격진단 · 현재 <span style="color:var(--color-primary);">${fit.hireProb}%</span> → 보완 시 <span style="color:var(--color-secondary);">${fit.boostedProb}%</span>
      </strong>
      <span class="chip num">${escapeHtml(sched.applyPeriod)}</span>
    </div>
    <div class="val-row val-ok">
      <span><strong>우위 강점:</strong> ${escapeHtml(fit.strengthPoint)}</span>
    </div>
    <div class="val-row val-warn">
      <span><strong>보완점:</strong> ${escapeHtml(fit.weaknessPoint)}</span>
      <button type="button" class="btn btn-primary btn-sm" style="padding:3px 8px;font-size:11px;" onclick="injectWeaknessBooster()">
        + 보완 문구 삽입
      </button>
    </div>
    <div class="val-row" style="color:var(--text-sub);">
      <span><strong>연마 추천 기술:</strong> ${escapeHtml(fit.skillToPolish)}</span>
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
    showToast(`약점 보완 문구가 반영되어 예상 채용확률이 ${fit.boostedProb}%로 상승했습니다.`);
  } else {
    showToast('이미 지원서에 약점 보완 문구가 반영되어 있습니다.');
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
안녕하세요, '${item.title}' 공고를 보고 지원드리는 ${masterResume.name}입니다.
• 보유 기술: Premiere Pro, After Effects, CapCut, 3D 모션, SNS 마케팅 소재 제작 (편집시간 70% 단축 자동화 보유)
• 대표 포트폴리오: ${masterResume.portfolioMain} (${pfUrl})
• 근무 가능 조건: ${item.pay || '시급/건별 협의'} / 즉시 투입 및 일정 조율 가능
빠르고 정확한 작업으로 즉시 도움드리겠습니다.`;
  }

  if (type === 'freelance') {
    return `[${item.site} 맞춤 견적 제안서 — ${item.client || item.title}]
안녕하세요, '${item.title}' 프로젝트 요청서를 확인하고 제안드리는 ${masterResume.name}입니다.

■ 핵심 강점 및 정량 성과
1) 고효율 마케팅 영상 & 3D 모션 연출 (${masterResume.portfolioMain})
2) 48시간 내 1차 가편집 시안 제공 (CapCut+AI 자동화 파이프라인으로 리드타임 70% 단축)
3) 가로형(16:9) 마스터본 + 쇼츠/릴스(9:16) 광고 소재 패키지 지원

■ 포트폴리오 클라우드 링크 (자동 첨부)
• 파일명: ${masterResume.portfolioMain}
• 열람 URL: ${pfUrl}

■ 제안 단가 및 일정 조건
• 희망 견적: ${item.budget || '협의'} 범위 내 맞춤 조율 / 예상 기간: ${item.duration || '일정 협의'} / 무상 수정 2회 포함`;
  }

  const ws = item.winningStrategy || {};
  return `[${item.site || item.category} 필승전략 & 표준 사업계획서(PSST)]
■ 공고명: ${item.title} (${item.organizer || ''} / ${sched.applyPeriod})
■ 지원규모: ${item.prizeScale || '공고문 참조'}

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
    fixLabel: '+ 포트폴리오 링크 첨부',
    fixSnippet: `\n[포트폴리오 자동 첨부]\n• 대표 파일: ${masterResume.portfolioMain}\n• Google Drive 링크: ${masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL}`
  });

  rules.push({
    id: 'tools',
    label: `[${site} 양식] 직무 핵심 툴/스킬 명시 여부`,
    passed: hasTools,
    fixLabel: '+ 보유 툴 기입',
    fixSnippet: `\n• 활용 툴 및 기술: ${masterResume.tools}`
  });

  if (type === 'career' || site.includes('원티드') || site.includes('사람인') || site.includes('잡코리아')) {
    rules.push({
      id: 'metrics',
      label: `[${site} 서류통과 기준] 정량적 성과 수치(%, 건수, 기간 단축) 포함`,
      passed: hasMetric,
      fixLabel: '+ 정량 성과 보완',
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
      fixLabel: '300자 핵심요약으로 축약',
      fixReplaceAll: `[${site} 300자 핵심 지원서]\n안녕하세요, ${masterResume.name}입니다.\n1) 보유기술: ${masterResume.tools}\n2) 강점: CapCut+AI 자동화로 콘텐츠·마케팅 영상 작업을 70% 빠르게 납품합니다.\n3) 포트폴리오: ${masterResume.portfolioMain} (${masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL})\n4) 근무조건: 즉시 투입 및 일정 협의 가능합니다.`
    });
  } else {
    rules.push({
      id: 'condition',
      label: `[${site} 필수항목] 희망 급여/단가 및 투입 가능 시기 명시`,
      passed: hasCondition,
      fixLabel: '+ 희망조건 추가',
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
      <strong style="font-size:12.5px;font-weight:600;color:var(--text-main);" class="num">
        [${escapeHtml(currentModalSite)}] 채용양식 적합성 체크 (${text.length}자)
      </strong>
      <span class="status-chip num">
        ${failCount === 0 ? '모든 양식 기준 통과' : `보완 권장 ${failCount}건`}
      </span>
    </div>
    ${currentValidationRules.map((r, idx) => `
      <div class="val-row ${r.passed ? 'val-ok' : 'val-warn'}">
        <span>${r.passed ? '적합' : '보완'} · ${escapeHtml(r.label)}</span>
        ${r.passed
          ? `<span style="font-weight:600;color:var(--color-primary);">통과</span>`
          : `<button type="button" class="btn btn-primary btn-sm" style="padding:3px 8px;font-size:11px;" onclick="applyFormatAutoFix(${idx})">${escapeHtml(r.fixLabel)}</button>`
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
  showToast('채용사이트 양식에 맞게 자동 보완되었습니다.');
}

function renderModalPortfolioBar() {
  const bar = document.getElementById('modalPortfolioBar');
  if (!bar) return;
  const pfUrl = masterResume.portfolioDriveUrl || GOOGLE_DRIVE_URL;
  bar.innerHTML = `
    <span><strong>자동 첨부 포트폴리오:</strong> ${escapeHtml(masterResume.portfolioMain)}</span>
    <div style="display:flex;gap:6px;">
      <button type="button" class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;" onclick="triggerPortfolioFileUpload()">변경</button>
      <a class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;" href="${safeUrl(pfUrl)}" target="_blank" rel="noopener">드라이브 확인 ${icon('external', 11)}</a>
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

  document.getElementById('modalTitle').textContent = `[${currentModalSite}] 공고 합격진단 · 맞춤 지원서`;
  document.getElementById('modalSubtitle').textContent = `${item.title} (${item.location || inferRegionBucket(item)})`;
  document.getElementById('modalTextarea').value = generateTailoredDocument(type, item);

  const saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) {
    saveBtn.textContent = IS_LOCAL_SERVER ? '서버저장' : '저장';
  }

  renderModalFitAnalysisBox(item);
  renderModalPortfolioBar();
  runLiveFormatValidation();
  document.getElementById('docModal').classList.add('open');
}

function closeDocModal() {
  document.getElementById('docModal')?.classList.remove('open');
}

async function copyModalContent() {
  const txt = document.getElementById('modalTextarea').value;
  try {
    await navigator.clipboard.writeText(txt);
  } catch (e) {
    document.getElementById('modalTextarea').select();
    document.execCommand('copy');
  }
  showToast('변환된 지원서와 포트폴리오 드라이브 링크가 복사되었습니다.');
}

async function saveModalContentToFile() {
  const content = document.getElementById('modalTextarea').value;
  if (IS_LOCAL_SERVER) {
    try {
      const res = await fetch('/api/export-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: currentModalFilename, content })
      });
      if (res.ok) {
        showToast('로컬 서버 폴더에 저장되었습니다.');
        return;
      }
    } catch (e) {}
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = currentModalFilename;
  a.click();
  showToast(`${currentModalFilename} 다운로드 완료`);
}

async function copyAndOpenTargetSite() {
  await copyModalContent();
  if (currentModalTargetUrl && /^https?:\/\//i.test(currentModalTargetUrl)) {
    window.open(currentModalTargetUrl, '_blank', 'noopener');
  }
}

function runBatchConvertAndApply() {
  if (selectedIds.size === 0) {
    showToast('먼저 카드의 선택 체크박스를 눌러 공고를 선택해 주세요.');
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
  document.getElementById('modalTitle').textContent = `선택 ${targets.length}건 일괄 변환 · 합격진단`;
  document.getElementById('modalSubtitle').textContent = targets.map(t => t.site).join(', ');
  document.getElementById('modalTextarea').value = combinedText;

  renderModalFitAnalysisBox(targets[0] || null);
  renderModalPortfolioBar();
  runLiveFormatValidation();
  document.getElementById('docModal').classList.add('open');
}

// ============================================================================
// 14. 무제한 자유 키워드 실시간 수집 엔진
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
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const newJobs = [];
  const newAlbas = [];
  const newContests = [];

  await Promise.allSettled([
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

        let dDaySort = 365;
        let deadlineLabel = '상시채용';
        if (item.due_time) {
          const dueObj = new Date(item.due_time + 'T00:00:00');
          if (!isNaN(dueObj.getTime())) {
            dDaySort = Math.floor((dueObj.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
            deadlineLabel = `~${item.due_time.slice(5)}`;
          }
        }

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
          deadline: deadlineLabel,
          registeredDate: todayStr,
          deadlineDate: dueStr,
          applyPeriod: item.due_time
            ? `${todayStr.slice(5).replace('-', '.')} ~ ${item.due_time.slice(5).replace('-', '.')}`
            : `${todayStr.slice(5).replace('-', '.')} 등록 · 상시채용`,
          dDaySort,
          regSort: parseInt(wid, 10) + 55000000 - idx,
          isExpired: dDaySort < 0,
          url: `https://www.wanted.co.kr/wd/${wid}`,
          applyType: '원티드 간편지원',
          jdSummary: `[원티드 #${wid} | 키워드:${kw}] ${comp} (${loc}) '${pos}'`,
          collectedAt: nowStr,
          verified: true
        });
      });
    })(),

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
          url: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${ridx}`,
          applyType: '사람인 즉시지원',
          jdSummary: `[사람인 #${ridx} | 키워드:${kw}] ${comp} (${loc}) '${title}'`,
          collectedAt: nowStr,
          verified: true
        });
      }
    })(),

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
          schedule: '상시/공고확인',
          deadline: '채용시 마감',
          registeredDate: todayStr,
          dDaySort: 365,
          regSort: parseInt(aid, 10),
          isExpired: false,
          url: `https://www.albamon.com/jobs/detail/${aid}`,
          applyType: '알바몬 온라인지원',
          summary: `[알바몬 #${aid} | 키워드:${kw}] ${comp} '${title}'`,
          collectedAt: nowStr,
          verified: true
        });
      }
    })(),

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
  populateSiteFilterOptions();
  return newJobs.length + newAlbas.length + newContests.length;
}

async function triggerLiveCrawl() {
  const btn = document.getElementById('liveCrawlBtn');
  const kw = (document.getElementById('searchInput')?.value || '').trim();
  const orig = btn ? btn.innerHTML : '실시간 수집';

  if (btn) {
    btn.disabled = true;
    btn.textContent = '수집 중...';
  }

  if (kw && !quickKeywords.includes(kw)) {
    quickKeywords.unshift(kw);
    try {
      localStorage.setItem('MOONPD_QUICK_KEYWORDS', JSON.stringify(quickKeywords.slice(0, 14)));
    } catch (e) {}
    renderQuickKeywordBar();
  }

  showToast(kw ? `'${kw}' 키워드 실시간 수집 중...` : '전체 키워드 실시간 수집 중...');

  let handledByLocalServer = false;
  if (IS_LOCAL_SERVER) {
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw })
      });
      if (res.ok) {
        appData = await res.json();
        invalidateCaches();
        mergeBrowserCrawledCache();
        populateSiteFilterOptions();
        handledByLocalServer = true;
        onFilterChanged();
        const matchedNow =
          (appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)).length +
          (appData.albas || []).filter(x => matchesSearchAndFilter(x, false)).length +
          (appData.freelances || []).filter(x => matchesSearchAndFilter(x, false)).length +
          (appData.contests || []).filter(x => matchesSearchAndFilter(x, false)).length;
        showToast(`'${kw || '전체'}' 실시간 수집 완료 (활성 ${matchedNow}건)`);
      }
    } catch (e) {}
  }

  if (!handledByLocalServer) {
    const addedCount = await crawlKeywordDirectlyInBrowser(kw || '마케팅');
    onFilterChanged();
    const matchedNow =
      (appData.jobs || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.albas || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.freelances || []).filter(x => matchesSearchAndFilter(x, false)).length +
      (appData.contests || []).filter(x => matchesSearchAndFilter(x, false)).length;
    showToast(`'${kw || '전체'}' 수집 완료 (신규 ${addedCount}건 · 활성 ${matchedNow}건)`);
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function addNewCustomSitePrompt() {
  openInputDialog({
    title: '사이트 추가',
    message: '모니터링할 사이트 이름을 입력하세요.',
    placeholder: '예: 크몽, 클래스101, 매드타임즈',
    onSubmit: (name) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      openInputDialog({
        title: '사이트 URL 입력',
        message: `'${cleanName}'의 URL을 입력하세요.`,
        placeholder: 'https://...',
        defaultValue: 'https://',
        onSubmit: (url) => {
          const cleanUrl = url.trim();
          if (!cleanUrl) return;
          appData.sites = appData.sites || [];
          appData.sites.unshift({
            id: 'SITE-' + Date.now(),
            category: '사용자 추가',
            name: cleanName,
            url: cleanUrl,
            status: '실시간 연동',
            dailyNew: '상시 모니터링',
            cashcowType: '신규 캐시카우'
          });
          populateSiteFilterOptions();
          onFilterChanged();
          showToast(`${cleanName} 사이트가 추가되었습니다.`);
        }
      });
    }
  });
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toastNotification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
}
