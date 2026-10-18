import type { Origin } from './origin';
import type { Edu, Major, Track } from '../data/jobs';

export type StatKey = 'H' | 'J' | 'K' | 'R';
export type Cat = '人生抉擇' | '生活日常' | '財務衝擊' | '時代事件' | '國際都會' | '悲劇' | '生活陷阱' | '政策衍生' | '天馬行空' | '健康';
export type InsKind = 'med' | 'ci' | 'acc' | 'life';
export const INS_NAME: Record<InsKind, string> = { med: '醫療', ci: '危疾', acc: '意外', life: '人壽' };

export interface Insurance { level: 0 | 1 | 2; a0: number; s0: number; p0: number; age0: number }
export interface SavingsPlan { start: number; annual: number; paid: number; years: number; ng: number }
export interface Disease {
  kind: 'cancer' | 'stroke' | 'heart' | 'kidney' | 'threeHigh' | 'dementia';
  stage: number; years: number; d: number; status: 'treating' | 'remission' | 'chronic'; treat: 'public' | 'private' | 'none';
}
export interface Kid {
  name: string; age: number; acad: number; rel: number; school: 0 | 1 | 2; overseas?: boolean; married?: boolean;
  loan?: { left: number; per: number; stopAt: number; year: number };
  path?: '大學' | '副學位' | '就業' | '出國'; job?: boolean; away?: boolean; emigrated?: boolean; grandkids?: number; schoolAsked?: number;
}
export interface Partner {
  name: string; age: number; job: string; income: number; rel: number; traits: string[]; health: number; alive: boolean;
  sex: 'M' | 'F'; ins: 0 | 1 | 2; smoker: boolean; debt: number; origin: '本地' | '內地' | '外國'; ill?: number; remarry?: boolean;
}
export interface Parent { role: '父' | '母'; age: number; alive: boolean; working: boolean; income: number; health: number; needsCare: boolean; job: string }
export interface Property { kind: string; price0: number; hpi0: number; mortgage: number; rate: number; monthsLeft: number; pmt: number; first: boolean; ltv: number; passedStress: boolean; boughtYear: number }

export interface JobState {
  id: string; level: number; salary: number; years: number; levelYears: number;
  firstType?: 'hard' | 'promo' | 'ontime'; firstYears: number; hopCool: number; promoBoost: number; promoBoostYears: number;
}

export interface LogEntry { age: number; year: number; text: string; cat?: Cat; star?: boolean; big?: boolean }
export interface HistRow { age: number; year: number; H: number; J: number; K: number; R: number; F: number; net: number; income: number; P: number }

export interface State {
  seed: number; name: string; gender: 'M' | 'F'; birthYear: number; origin: Origin;
  age: number; year: number; alive: boolean; deathCause?: string; deathKind?: 'normal' | 'minor' | 'apocalypse';
  H: number; J: number; K: number; R: number; F: number;
  fParts: { E: number; T: number; P: number; D: number; L: number; m: number; r: number; gap: number; untilAge: number };
  FL: number; IP: number; CP: number; GP: number; GR: number; HB: number;
  focus: string | null; focusStage: string; focusYears: Record<string, number>;
  panel: string[]; panelStreak: Record<string, number>; panelCool: Record<string, number>; travelPick: '本地遊' | '日本'; givePick: '捐款' | '義工';

  // 教育
  edu: Edu; major?: Major; track?: Track; overseas: boolean; stream?: '理科' | '商科' | '文科'; band?: number;
  study: { kind: string; left: number; fee: number; years: number } | null;
  tutoring: 0 | 1 | 2 | 3; // 0 冇 / 1 補習社 / 2 自修 / 3 私補
  hobbyClass: 0 | 1 | 2; // 0 冇 / 1 運動 / 2 音樂
  quizAges: number[]; quizCorrect: number; quizTotal: number; quizTimeouts: number; quizPerfectAll: boolean; seenQ: string[];
  examCorrect: number | null; examTries: number; examResult?: string; examR?: number;
  piggy: number; piggyMode: 0 | 1 | 2; // 利是：0 全儲 / 1 一半 / 2 使晒
  movedSchoolNet: boolean;

  // 錢
  cash: number; deposit: number; index: number; stock: number; crypto: number; plans: SavingsPlan[];
  mpf: number; mpfFund: '保守' | '均衡' | '增長' | '預設'; mpfMode: 'none' | 'lump' | 'phased' | 'annuity'; annuity: number;
  card: number; finco: number; studentLoan: { bal: number; mode: 'fast' | 'min' | 'defer'; deferLeft: number } | null; privateLoan: number;
  investRatio: number; alloc: { deposit: number; plan: number; index: number; stock: number; crypto: number };
  emergTarget: 0 | 3 | 6; lottery: 0 | 1 | 2; lotterySpent: number; lotteryWon: number; lotteryTickets: number;
  ins: Record<InsKind, Insurance>; claims: number; claimTotal: number; insuredYears: number;
  taxDue: number; lastTaxable: number;
  scamWatch: { amount: number; boomYear: number; isScam: boolean } | null;

  // 住屋
  home: 'parents' | 'share' | 'rent' | 'public' | 'subdiv' | 'own' | 'village' | 'institution';
  rentBase: number; // 2026 價每月
  prop: Property | null; publicWait: number | null; saveForHome: boolean; gba: boolean; reverseMortgage: number;

  // 事業
  status: 'child' | 'study' | 'work' | 'unemp' | 'retired';
  job: JobState | null; unempYears: number; yearsWorked: number; catExp: Record<string, number>;
  lastSalary: number; retirePlan: 60 | 65 | 99; retiredAt: number | null; partTime: number;
  incomeHist: number[]; earnReal: number; maxIncomeReal: number; homeContrib: number; everEmployed: boolean;
  expatLeft: number; aiSkill: boolean; overtime: boolean;

  // 家庭
  partner: Partner | null; married: boolean; marriedAt: number | null; datingYears: number; proposeAt: number; proposeTries: number;
  divorces: number; widowed: boolean; kids: Kid[]; babyPlan: 'yes' | 'no' | 'later' | null; babyAskAge: number; childcare: 'helper' | 'parents' | 'quit' | null;
  parents: Parent[]; support: 'money' | 'live' | 'home' | null; supportedAtDeath: number; parentsDeadBefore18: number;
  siblings: number;

  // 健康
  diseases: Disease[]; mental: { years: number; treat: 'public' | 'private' | 'none' } | null; smoker: boolean; checkupUntil: number;
  disabled: boolean; earlyDetect: boolean;

  // 其他
  flags: Record<string, number | boolean | string>;
  cool: Record<string, number>; once: string[]; tragedies: number; childAdversity: number;
  will: boolean; epa: boolean; emigrated: boolean;
  log: LogEntry[]; hist: HistRow[]; ach: string[]; achNew: string[];
  wonder: string | null; pendingFixed: string[];
  pAvg: { P: number[]; E: number[] }; netMinEver: number;
}
