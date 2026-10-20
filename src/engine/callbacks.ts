// v1.6（用家揀）：後果回馬槍：早年嘅決定，幾十年後先有結果；人生紀錄標明「當年嘅決定」
import type { Game } from './game';
import { fmtMoney } from './util';
import type { EventDef } from './cards';

const TAG = '【當年嘅決定】';
const working = (g: Game) => g.s.status === 'work' && !!g.s.job;
function story(g: Game, text: string) {
  g.log(TAG + text, '人生抉擇', true);
  return TAG + text;
}

export const CALLBACK_EVENTS: EventDef[] = [
  { // 借錢俾朋友冇還 → 十幾廿年後佢發達還十倍
    id: 'CB-LOAN', pri: 360, cat: '人生抉擇',
    when: (g) => {
      const a = Number(g.s.flags['loanLostAge'] ?? 0);
      return a && g.s.age - a >= 15 && g.s.age - a <= 35 ? 0.04 : 0;
    },
    tick: (g) => {
      const s = g.s;
      const yrs = s.age - Number(s.flags['loanLostAge']);
      const back = Math.round(Math.min(Number(s.flags['loanLost']) * 10, 1_000_000) * g.P);
      g.gain(back); g.add('J', 5); g.add('R', 3);
      delete s.flags['loanLost']; delete s.flags['loanLostAge'];
      return story(g, `${yrs} 年前借錢冇還嘅舊同學突然搵你：佢做生意發咗達，還返你 ${fmtMoney(back)}，仲話「多謝你當年信我」。`);
    },
  },
  { // 讀書勤力 → 舊同學介紹好工
    id: 'CB-STUDY', pri: 355, ages: [30, 45], cat: '人生抉擇',
    when: (g) => (working(g) && ((g.s.focusYears['發奮圖強'] ?? 0) >= 3 || (g.s.examCorrect ?? 0) >= 6) ? 0.04 : 0),
    tick: (g) => {
      const j = g.s.job!;
      j.salary = Math.round(j.salary * 1.15);
      g.add('J', 3); g.add('R', 2);
      return story(g, '中學同你一齊溫書嘅舊同學而家做咗主管，介紹你去佢公司，人工加咗 15%。');
    },
  },
  { // 中五暑期工 → 舊主管變客戶
    id: 'CB-SUMMER', pri: 350, ages: [23, 35], cat: '人生抉擇',
    when: (g) => (working(g) && g.s.flags['summerJob'] ? 0.03 : 0),
    tick: (g) => {
      const j = g.s.job!;
      j.salary = Math.round(j.salary * 1.05);
      g.add('J', 2); g.add('R', 2);
      return story(g, '開會嗰陣，客戶老闆原來係你中五暑期工嘅主管：「你係當年最勤力嗰個！」張單即刻簽，老細仲加咗你人工。');
    },
  },
  { // 交流團 → 外國朋友來港
    id: 'CB-EXCH', pri: 345, ages: [25, 40], cat: '人生抉擇',
    when: (g) => (g.s.flags['exchange'] ? 0.03 : 0),
    tick: (g) => {
      g.add('R', 3); g.add('J', 2);
      return story(g, '中學交流團識嘅首爾朋友嚟香港旅行，你帶佢去食煲仔飯，兩個人傾到凌晨。');
    },
  },
  { // 初戀 / 做朋友 → 同學會重逢
    id: 'CB-LOVE', pri: 340, ages: [40, 60], cat: '人生抉擇',
    when: (g) => (g.s.flags['teenLove'] || g.s.flags['teenFriend'] ? 0.03 : 0),
    tick: (g) => {
      const s = g.s;
      g.add('J', 3); g.add('R', 2);
      const who = s.flags['teenLove'] ? '當年一齊行去巴士站嘅初戀' : '當年遞信俾你嘅同學';
      return story(g, s.married ? `同學會見返${who}，大家都有自己頭家，笑住講起中學嘅事。` : `同學會見返${who}，大家交換咗電話，話遲啲飲茶。`);
    },
  },
  { // 年少唔食煙 / 早戒煙 → 晚年肺功能好
    id: 'CB-LUNG', pri: 335, ages: [60, 70], cat: '健康',
    when: (g) => (!g.s.smoker && (g.s.flags['noSmoke'] !== undefined || g.s.flags['quitYoung'] !== undefined) ? 0.15 : 0),
    tick: (g) => {
      const s = g.s;
      g.add('H', 4, '肺功能好');
      const a = Number(s.flags['noSmoke'] ?? s.flags['quitYoung']);
      const why = s.flags['noSmoke'] !== undefined ? `${a} 歲嗰年拒絕咗朋友遞嘅煙` : `${a} 歲嗰年戒咗煙`;
      return story(g, `身體檢查報告話你肺功能好過同齡人。醫生問你點做到，你諗起${why}。`);
    },
  },
];
