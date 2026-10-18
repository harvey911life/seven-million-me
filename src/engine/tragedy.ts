// 第 11 章 11.9 悲劇事件（低機率）：父母重病、家中生意倒閉、兄弟姊妹患重病、子女患重病、火災或颱風損毀
// 每年最多 1 件、一生累計 2 件後 ×0.5、3 件後 ×0.25（events.ts 用 randTrag 計）；父母按生命表離世唔受此限（family.ts）
import type { Game } from './game';
import { mkCard, type EventDef } from './cards';
import { streamRng } from './rng';
import { fmtMoney } from './util';
import { tragedyHit } from './yearly';

const SELF_EMPLOYED = ['公司老闆', '的士司機', '裝修師傅', '物業經紀', '保險顧問'];

function famCut(g: Game, k: number) {
  for (const p of g.s.parents) if (p.alive && p.working) p.income *= k;
}

export const TRAGEDY_EVENTS: EventDef[] = [
  { // 父母其中一方患上重病
    id: 'T-PARENT-SICK', pri: 650, ages: [6, 22], tragedy: true, cat: '悲劇',
    when: (g) => {
      const s = g.s;
      if (s.everEmployed) return 0;
      return s.parents.filter((p) => p.alive).reduce((a, p) => a + (p.age >= 60 ? 0.015 : p.age >= 50 ? 0.009 : p.age >= 40 ? 0.004 : 0.001), 0);
    },
    make: (g) => {
      const s = g.s;
      const alive = s.parents.filter((p) => p.alive);
      const p = alive[Math.floor(streamRng(s.seed, 'psick', s.age)() * alive.length)];
      const who = p.role === '父' ? '阿爸' : '阿媽';
      p.health = Math.max(5, p.health - 30);
      if (p.working) p.income *= 0.4;
      tragedyHit(g, 20);
      g.flag('tragedyYear', s.year);
      const text = `${who}確診重病，要長期治療，屋企收入少咗一大截。`;
      if (s.age < 15) { g.log(text, '悲劇', true); return null; }
      return mkCard('T-PARENT-SICK', `${who}患上重病`, text, [
        { label: '做兼職幫補', note: `每月約 ${fmtMoney(g.p(4000))} 幫補家用；知識 −2` },
        { label: '照讀' },
        { label: '停補習', note: '慳返補習費，成績可能跌' },
      ], (g2, i) => {
        const t = g2.s;
        if (i === 0) { t.flags['familySavings'] = Number(t.flags['familySavings'] ?? 0) + g2.p(4000) * 12; g2.add('K', -2); g2.add('R', 2); return `放學你去便利店返工，${who}話辛苦你。`; }
        if (i === 2) { t.tutoring = 0; return '你同自己講：靠自己都得。'; }
        g2.add('K', 1); return '你決定專心讀書，唔想屋企人擔心。';
      }, { pri: 650, def: 1, auto: 1, agui: 1, cat: '悲劇' });
    },
  },
  { // 家中生意倒閉、父母負債
    id: 'T-FAMBIZ', pri: 640, ages: [6, 22], tragedy: true, cat: '悲劇',
    when: (g) => {
      const s = g.s;
      if (s.everEmployed || !s.parents.some((p) => p.alive && p.working && SELF_EMPLOYED.includes(p.job))) return 0;
      const y = s.year;
      return 0.015 * ([1998, 2003, 2020, 2021, 2022].includes(y) ? 2 : 1);
    },
    make: (g) => {
      const s = g.s;
      famCut(g, 0.5);
      s.flags['familySavings'] = Number(s.flags['familySavings'] ?? 0) * 0.6;
      tragedyHit(g, 10);
      g.flag('tragedyYear', s.year);
      const text = '屋企盤生意捱唔住結業，仲欠咗一筆債，家庭收入少咗一半。';
      if (s.age < 15) { g.log(text, '悲劇', true); return null; }
      return mkCard('T-FAMBIZ', '家中生意倒閉', text, [
        { label: '做兼職幫補', note: `每月約 ${fmtMoney(g.p(4000))} 幫補家用；知識 −2` },
        { label: '照讀' },
        { label: '轉去平啲嘅學校', note: '慳學費同補習費；人際 −3' },
      ], (g2, i) => {
        const t = g2.s;
        if (i === 0) { t.flags['familySavings'] = Number(t.flags['familySavings'] ?? 0) + g2.p(4000) * 12; g2.add('K', -2); g2.add('R', 2); return '你週末去茶餐廳幫手，賺嘅錢全部交俾屋企。'; }
        if (i === 2) { t.tutoring = 0; g2.add('R', -3); return '新學校冇熟人，你要重新識朋友。'; }
        return '你知道屋企辛苦，讀書更加用心。';
      }, { pri: 640, def: 1, auto: 1, agui: 1, cat: '悲劇' });
    },
  },
  { // 兄弟姊妹患重病
    id: 'T-SIB-SICK', pri: 630, ages: [6, 22], tragedy: true, cat: '悲劇',
    when: (g) => (g.s.siblings > 0 ? 0.0005 * g.s.siblings : 0),
    tick: (g) => {
      const s = g.s;
      tragedyHit(g, 20);
      g.flag('tragedyYear', s.year);
      if (s.tutoring === 3) s.tutoring = 1;
      g.log('兄弟姊妹確診重病，屋企人成日喺醫院同屋企兩邊走。', '悲劇', true);
      return '屋企大部分錢同時間都用咗喺醫病，你嘅補習預算減咗一半。';
    },
  },
  { // 子女患重病
    id: 'T-KID-SICK', pri: 650, once: false, cool: 10, tragedy: true, cat: '悲劇',
    when: (g) => 0.0008 * g.s.kids.filter((k) => k.age <= 22 && !k.away && !k.emigrated).length,
    make: (g) => {
      const s = g.s;
      const kids = s.kids.filter((k) => k.age <= 22 && !k.away && !k.emigrated);
      const r = streamRng(s.seed, 'kidsick', s.age);
      const k = kids[Math.floor(r() * kids.length)];
      const pub = g.p(r.uni(20000, 50000));
      const priv = g.p(r.uni(100000, 800000));
      const lost = Math.max(g.monthlyIncome() * 12, g.p(150000));
      const helper = g.p(200000);
      tragedyHit(g, 20);
      g.flag('tragedyYear', s.year);
      return mkCard('T-KID-SICK', `${k.name}患上重病`, `醫生話${k.name}要接受大約一年治療，需要有人長時間照顧。`, [
        { label: '一方停工照顧', note: `公立治療約 ${fmtMoney(pub)}；少一年人工約 ${fmtMoney(lost)}` },
        { label: '請人照顧', note: `公立治療約 ${fmtMoney(pub)}；照顧開支約 ${fmtMoney(helper)}` },
        { label: '用儲蓄搵私家', note: `自付約 ${fmtMoney(priv)}，醫療保險可以幫補` },
      ], (g2, i) => {
        if (i === 0) { const n = g2.spend(pub + lost, '照顧子女'); k.rel = Math.min(100, k.rel + 10); g2.add('R', 2); return `你停咗一年工，日日陪${k.name}覆診${n}。`; }
        if (i === 1) { const n = g2.spend(pub + helper, '照顧子女'); return `你請咗人幫手，自己放工就去醫院${n}。`; }
        const cover = g2.s.ins.med.level ? 0.6 : 0;
        const n = g2.spend(priv * (1 - cover), '私家醫院');
        return `私家醫院唔使等，${k.name}好快開始治療${cover ? '，保險賠咗大部分' : ''}${n}。`;
      }, { pri: 650, def: 0, auto: 0, agui: 1, cat: '悲劇' });
    },
  },
  { // 家中火災或颱風嚴重損毀
    id: 'T-HOME-DMG', pri: 620, once: false, cool: 10, tragedy: true, cat: '悲劇',
    when: (g) => {
      const s = g.s;
      const y = s.year;
      const bigTyphoon = [1983, 2017, 2018].includes(y) || (y > 2026 && streamRng(s.seed, 'supertyphoon', y)() < 0.05);
      const typhoon = 0.0005 * (s.home === 'village' || s.origin.housing === '村屋' ? 4 : 1) * (bigTyphoon ? 10 : 1);
      return 0.0003 + typhoon;
    },
    make: (g) => {
      const s = g.s;
      const r = streamRng(s.seed, 'homedmg', s.age);
      const fire = r() < 0.35;
      const insured = s.prop && s.prop.mortgage > 0; // 有按揭一定有火險，賠結構
      const loss = g.p(r.uni(50000, 500000)) * (insured ? 0.5 : 1);
      tragedyHit(g, 10);
      g.flag('tragedyYear', s.year);
      const what = fire ? '屋企發生火警' : '超強颱風吹爆窗，屋企嚴重水浸';
      if (s.age < 18 || s.status === 'child' || (s.status === 'study' && !s.everEmployed)) {
        const n = g.spend(loss, '屋企維修');
        g.log(`${what}，好多嘢都冇咗，屋企要重新執過${n}。`, '悲劇', true);
        return null;
      }
      const rent = g.p(15000) * 3;
      return mkCard('T-HOME-DMG', fire ? '家中火災' : '颱風嚴重損毀', `${what}，損失大約 ${fmtMoney(loss)}${insured ? '（火險已經賠咗結構部分）' : ''}。`, [
        { label: '用儲蓄重建', money: -loss },
        { label: '搬屋暫住', note: `暫住三個月租金約 ${fmtMoney(rent)}，損失照計 ${fmtMoney(loss)}` },
        { label: '申請援助', note: `一半機會批，批咗自付 ${fmtMoney(loss / 2)}` },
      ], (g2, i) => {
        if (i === 2 && g2.er() < 0.5) { const n = g2.spend(loss / 2, '屋企維修'); return `援助批咗一半，你慢慢將屋企執返好${n}。`; }
        const n = g2.spend(loss + (i === 1 ? rent : 0), '屋企維修');
        if (i === 1) g2.add('J', -2);
        return `${i === 2 ? '援助冇批，' : ''}你一件件將屋企嘢重新買返${n}。`;
      }, { pri: 620, def: 0, auto: 0, agui: 0, cat: '悲劇' });
    },
  },
];
