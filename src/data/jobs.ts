// 第 7 章 7.2.2 職業表（44 個，2026 港元，估算）
export type Edu = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 小學 / 初中 / 中學 / 職業 / 副學位 / 學士 / 碩士
export const EDU_NAME = ['小學或以下', '初中', '中學', '職業', '副學位', '學士', '碩士'];

export type Major = '醫科' | '法律' | '護理' | '工程' | '商科' | '教育' | '社科' | '藥劑';
export type Track = '工程' | '設計' | '資訊科技' | '醫護輔助' | '酒店' | '商業' | '社會科學' | '理學' | '電機' | '廚藝' | '美容' | '汽車維修' | '建造' | '一般';

export interface Job {
  id: string; name: string; cat: string;
  minEdu: Edu; majors?: Major[]; tracks?: Track[]; // 對口要求（任何一個符合）
  start: number; median: number; top: number; raise: [number, number];
  cjob: number; ai: number; hours: number; bhire: number; promo: number;
  minK?: number; minH?: number; minAge?: number; maxAgeEntry?: number; needIP?: number;
  commission?: boolean; civil?: boolean; promoteOnly?: boolean;
}

const AI = { 低: 0.1, 中: 0.35, 高: 0.7, 極高: 1.0 };

export const JOBS: Job[] = [
  { id: 'J01', name: '部門經理（企業）', cat: '經理及行政級', minEdu: 5, start: 40000, median: 58000, top: 130000, raise: [0.01, 0.04], cjob: 0.9, ai: AI.中, hours: -1, bhire: 0.35, promo: 0.08, promoteOnly: true },
  { id: 'J02', name: '銀行分行經理', cat: '經理及行政級', minEdu: 5, start: 42000, median: 62000, top: 110000, raise: [0.01, 0.03], cjob: 1.0, ai: AI.中, hours: -1, bhire: 0.3, promo: 0.08, promoteOnly: true },
  { id: 'J03', name: '餐廳經理', cat: '經理及行政級', minEdu: 2, start: 22000, median: 32000, top: 50000, raise: [0.005, 0.025], cjob: 1.4, ai: AI.低, hours: -1.5, bhire: 0.45, promo: 0.1 },
  { id: 'J04', name: '政務主任', cat: '經理及行政級', minEdu: 5, start: 60000, median: 105000, top: 220000, raise: [0.02, 0.05], cjob: 0.2, ai: AI.低, hours: -1, bhire: 0.08, promo: 0.1, minK: 75, civil: true },
  { id: 'J05', name: '醫生', cat: '專業人員', minEdu: 5, majors: ['醫科'], start: 78000, median: 150000, top: 350000, raise: [0.03, 0.06], cjob: 0.2, ai: AI.低, hours: -1.5, bhire: 0.9, promo: 0.12 },
  { id: 'J06', name: '律師', cat: '專業人員', minEdu: 5, majors: ['法律'], start: 28000, median: 75000, top: 250000, raise: [0.03, 0.07], cjob: 0.6, ai: AI.中, hours: -1.5, bhire: 0.55, promo: 0.12 },
  { id: 'J07', name: '會計師', cat: '專業人員', minEdu: 5, majors: ['商科'], start: 20000, median: 45000, top: 120000, raise: [0.02, 0.05], cjob: 0.7, ai: AI.高, hours: -1, bhire: 0.65, promo: 0.14 },
  { id: 'J08', name: '工程師', cat: '專業人員', minEdu: 5, majors: ['工程'], start: 22000, median: 45000, top: 95000, raise: [0.015, 0.04], cjob: 0.8, ai: AI.低, hours: -0.5, bhire: 0.6, promo: 0.12 },
  { id: 'J09', name: '中學教師', cat: '專業人員', minEdu: 5, majors: ['教育'], start: 34000, median: 60000, top: 95000, raise: [0.015, 0.04], cjob: 0.4, ai: AI.低, hours: -1, bhire: 0.55, promo: 0.06, civil: true },
  { id: 'J10', name: '小學教師', cat: '專業人員', minEdu: 5, majors: ['教育'], start: 32000, median: 52000, top: 85000, raise: [0.015, 0.035], cjob: 0.5, ai: AI.低, hours: -1, bhire: 0.5, promo: 0.06, civil: true },
  { id: 'J11', name: '軟件工程師', cat: '專業人員', minEdu: 4, majors: ['工程'], tracks: ['資訊科技'], start: 22000, median: 42000, top: 100000, raise: [0.02, 0.05], cjob: 1.0, ai: AI.高, hours: -1, bhire: 0.6, promo: 0.14 },
  { id: 'J12', name: '藥劑師', cat: '專業人員', minEdu: 5, majors: ['藥劑'], start: 38000, median: 52000, top: 80000, raise: [0.01, 0.03], cjob: 0.4, ai: AI.中, hours: -0.5, bhire: 0.7, promo: 0.08 },
  { id: 'J13', name: '測量師 / 建築師', cat: '專業人員', minEdu: 5, majors: ['工程'], start: 21000, median: 50000, top: 110000, raise: [0.015, 0.04], cjob: 1.0, ai: AI.低, hours: -1, bhire: 0.55, promo: 0.12 },
  { id: 'J14', name: '金融分析師', cat: '專業人員', minEdu: 5, majors: ['商科'], start: 35000, median: 70000, top: 300000, raise: [0.03, 0.08], cjob: 1.6, ai: AI.中, hours: -2, bhire: 0.25, promo: 0.15, minK: 75 },
  { id: 'J15', name: '數據分析師', cat: '專業人員', minEdu: 5, start: 23000, median: 40000, top: 85000, raise: [0.02, 0.05], cjob: 0.9, ai: AI.中, hours: -0.5, bhire: 0.55, promo: 0.14 },
  { id: 'J16', name: '註冊護士', cat: '輔助專業人員', minEdu: 5, majors: ['護理'], start: 32000, median: 45000, top: 75000, raise: [0.015, 0.035], cjob: 0.3, ai: AI.低, hours: -1.5, bhire: 0.85, promo: 0.08, civil: true },
  { id: 'J17', name: '社工', cat: '輔助專業人員', minEdu: 5, majors: ['社科'], start: 24000, median: 36000, top: 60000, raise: [0.01, 0.03], cjob: 0.5, ai: AI.低, hours: -1, bhire: 0.6, promo: 0.08 },
  { id: 'J18', name: '物業經紀', cat: '輔助專業人員', minEdu: 2, start: 14000, median: 25000, top: 80000, raise: [-0.05, 0.1], cjob: 1.8, ai: AI.中, hours: -1, bhire: 0.7, promo: 0.12, minK: 35, commission: true },
  { id: 'J19', name: '理財顧問', cat: '輔助專業人員', minEdu: 2, start: 13000, median: 30000, top: 150000, raise: [-0.05, 0.12], cjob: 1.5, ai: AI.中, hours: -1, bhire: 0.75, promo: 0.12, minK: 40, commission: true },
  { id: 'J20', name: '警員 / 消防員', cat: '輔助專業人員', minEdu: 2, start: 28000, median: 38000, top: 55000, raise: [0.01, 0.03], cjob: 0.1, ai: AI.低, hours: -1.5, bhire: 0.4, promo: 0.06, minH: 50, civil: true },
  { id: 'J21', name: '督察（紀律部隊）', cat: '輔助專業人員', minEdu: 5, start: 52000, median: 75000, top: 120000, raise: [0.02, 0.04], cjob: 0.1, ai: AI.低, hours: -1.5, bhire: 0.12, promo: 0.08, minH: 55, civil: true },
  { id: 'J22', name: '設計師', cat: '輔助專業人員', minEdu: 4, tracks: ['設計'], majors: ['社科'], start: 15000, median: 25000, top: 60000, raise: [0.01, 0.04], cjob: 1.2, ai: AI.高, hours: -1, bhire: 0.5, promo: 0.1 },
  { id: 'J23', name: '機艙服務員', cat: '輔助專業人員', minEdu: 2, start: 20000, median: 28000, top: 45000, raise: [0.01, 0.03], cjob: 1.5, ai: AI.低, hours: -1, bhire: 0.3, promo: 0.08, minK: 55, minH: 60, maxAgeEntry: 34 },
  { id: 'J24', name: '廚師', cat: '工藝及機器操作', minEdu: 3, tracks: ['廚藝'], start: 15000, median: 22000, top: 60000, raise: [0.01, 0.04], cjob: 1.4, ai: AI.低, hours: -1.5, bhire: 0.65, promo: 0.1 },
  { id: 'J25', name: '文員', cat: '文書支援', minEdu: 2, start: 14500, median: 19000, top: 28000, raise: [0, 0.02], cjob: 1.0, ai: AI.極高, hours: 0, bhire: 0.7, promo: 0.07 },
  { id: 'J26', name: '會計文員', cat: '文書支援', minEdu: 2, start: 15000, median: 20000, top: 30000, raise: [0, 0.02], cjob: 1.0, ai: AI.極高, hours: 0, bhire: 0.65, promo: 0.07 },
  { id: 'J27', name: '客戶服務主任', cat: '文書支援', minEdu: 2, start: 14000, median: 17500, top: 25000, raise: [0, 0.015], cjob: 1.2, ai: AI.極高, hours: -0.5, bhire: 0.75, promo: 0.06 },
  { id: 'J28', name: '銀行櫃位職員', cat: '文書支援', minEdu: 2, start: 16000, median: 21000, top: 30000, raise: [0, 0.02], cjob: 1.1, ai: AI.高, hours: 0, bhire: 0.55, promo: 0.08 },
  { id: 'J29', name: '茶餐廳樓面', cat: '服務及銷售', minEdu: 0, start: 14000, median: 16200, top: 21000, raise: [0, 0.015], cjob: 1.6, ai: AI.中, hours: -1, bhire: 0.85, promo: 0.06 },
  { id: 'J30', name: '零售售貨員', cat: '服務及銷售', minEdu: 0, start: 13500, median: 15400, top: 22000, raise: [0, 0.015], cjob: 1.7, ai: AI.中, hours: -0.5, bhire: 0.85, promo: 0.06 },
  { id: 'J31', name: '保安員', cat: '服務及銷售', minEdu: 0, start: 14000, median: 16500, top: 20000, raise: [0, 0.01], cjob: 0.8, ai: AI.中, hours: -1.5, bhire: 0.9, promo: 0.04 },
  { id: 'J32', name: '美容師', cat: '服務及銷售', minEdu: 0, start: 14000, median: 18000, top: 35000, raise: [0.005, 0.03], cjob: 1.3, ai: AI.低, hours: -0.5, bhire: 0.7, promo: 0.08 },
  { id: 'J33', name: '安老院護理員', cat: '服務及銷售', minEdu: 0, start: 16000, median: 19000, top: 24000, raise: [0.005, 0.02], cjob: 0.6, ai: AI.低, hours: -1.5, bhire: 0.85, promo: 0.05 },
  { id: 'J34', name: '電工', cat: '工藝及機器操作', minEdu: 3, tracks: ['電機'], start: 16000, median: 28000, top: 45000, raise: [0.01, 0.04], cjob: 1.2, ai: AI.低, hours: -1, bhire: 0.7, promo: 0.1 },
  { id: 'J35', name: '裝修師傅', cat: '工藝及機器操作', minEdu: 0, start: 15000, median: 26000, top: 45000, raise: [0.01, 0.04], cjob: 1.6, ai: AI.低, hours: -1.5, bhire: 0.75, promo: 0.1 },
  { id: 'J36', name: '紮鐵工', cat: '工藝及機器操作', minEdu: 0, start: 18000, median: 32000, top: 50000, raise: [0.01, 0.04], cjob: 1.9, ai: AI.低, hours: -2, bhire: 0.7, promo: 0.08, minH: 50 },
  { id: 'J37', name: '的士司機', cat: '工藝及機器操作', minEdu: 0, start: 15000, median: 18000, top: 24000, raise: [0, 0.01], cjob: 1.0, ai: AI.高, hours: -1, bhire: 0.8, promo: 0, minAge: 21 },
  { id: 'J38', name: '巴士司機', cat: '工藝及機器操作', minEdu: 0, start: 19000, median: 22000, top: 28000, raise: [0.005, 0.02], cjob: 0.6, ai: AI.中, hours: -1, bhire: 0.6, promo: 0.04, minAge: 21 },
  { id: 'J39', name: '貨車司機', cat: '工藝及機器操作', minEdu: 0, start: 17000, median: 22000, top: 30000, raise: [0.005, 0.02], cjob: 1.1, ai: AI.中, hours: -1, bhire: 0.75, promo: 0.04 },
  { id: 'J40', name: '清潔工', cat: '非技術工人', minEdu: 0, start: 12000, median: 13800, top: 16000, raise: [0, 0.01], cjob: 0.7, ai: AI.低, hours: -1, bhire: 0.95, promo: 0.03 },
  { id: 'J41', name: '外賣員 / 速遞員', cat: '非技術工人', minEdu: 0, start: 14000, median: 17000, top: 25000, raise: [-0.02, 0.02], cjob: 1.3, ai: AI.中, hours: -1.5, bhire: 0.9, promo: 0.02 },
  { id: 'J42', name: '搬運工', cat: '非技術工人', minEdu: 0, start: 14000, median: 16500, top: 22000, raise: [0, 0.01], cjob: 1.3, ai: AI.中, hours: -2, bhire: 0.85, promo: 0.03, minH: 40 },
  { id: 'J43', name: '廚房雜工', cat: '非技術工人', minEdu: 0, start: 13000, median: 15200, top: 18000, raise: [0, 0.01], cjob: 1.5, ai: AI.中, hours: -1, bhire: 0.9, promo: 0.05 },
  { id: 'J44', name: '網上創作人', cat: '其他', minEdu: 0, start: 8000, median: 15000, top: 150000, raise: [-0.1, 0.2], cjob: 2.0, ai: AI.高, hours: -0.5, bhire: 0.6, promo: 0, needIP: 3, commission: true },
];

export const JOB_BY_ID: Record<string, Job> = Object.fromEntries(JOBS.map((j) => [j.id, j]));

export const LEVEL_NAME = ['', '初級', '資深', '主管', '經理'];
export const capOf = (j: Job, level: number) =>
  level === 1 ? j.median * 0.85 : level === 2 ? j.median * 1.15 : level === 3 ? (j.median + j.top) / 2 : j.top;

// 年代替換名稱（7.2.4）
export function jobDisplayName(j: Job, year: number): string {
  if (j.id === 'J11' && year < 1995) return '電腦程序員';
  if (j.id === 'J15' && year < 2012) return '市場研究員';
  if (j.id === 'J41' && year < 2015) return '送貨員';
  if (j.id === 'J44' && year < 2008) return '自由工作者';
  return j.name;
}

// 行業時代係數 E_ind（7.5.2）
export function industryFactor(id: string, y: number): number {
  if ((y === 1997 || y === 1998) && ['J13', 'J18', 'J35', 'J36'].includes(id)) return 2;
  if (y === 2003 && ['J23', 'J29', 'J30', 'J32', 'J43', 'J03'].includes(id)) return 2.5;
  if ((y === 2008 || y === 2009) && ['J14', 'J02', 'J07', 'J15'].includes(id)) return 2.5;
  if (y >= 2020 && y <= 2022) {
    if (id === 'J23') return 5;
    if (['J29', 'J43', 'J03'].includes(id)) return 3;
    if (id === 'J32') return 2.5;
    if (id === 'J30') return 2;
  }
  if (y >= 2023 && ['J29', 'J30', 'J03'].includes(id)) return 1.3;
  return 1;
}
