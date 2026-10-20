// v1.6（用家揀）：香港人生常見嘅意外同經歷
import type { Game } from './game';
import { fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, type EventDef } from './cards';

const afford = (g: Game, amt: number) => (g.liquid >= amt ? undefined : '手頭冇咁多錢');
// 野豬出沒：新界各區同港島南區
const BOAR_DISTRICTS = ['屯門區', '元朗區', '北區', '大埔區', '沙田區', '西貢區', '荃灣區', '葵青區', '離島區', '南區'];
const inHK = (g: Game) => !g.s.emigrated && !g.s.gba;

export const HK_EVENTS: EventDef[] = [
  { // 高空墮物
    id: 'HK-FALL', pri: 330, ages: [18, 90], once: false, cool: 20, cat: '生活日常',
    when: (g) => (inHK(g) ? 0.006 : 0), // 抽中後仍要爭每年張數上限，實際一生約 15%
    make: (g) => {
      const r = streamRng(g.s.seed, 'hkfall', g.s.age);
      const doc = g.p(r.uni(2000, 8000));
      const hurt = r.int(3, 8);
      return mkCard('HK-FALL', '高空墮物', '行過舊樓街，樓上突然跌咗個花盆落嚟，擦傷咗你膊頭。', [
        { label: '睇醫生算數', money: -doc, fx: { H: -hurt, J: -2 } },
        { label: '追究業主', money: -(doc + g.p(5000)), note: `睇醫生加調解費；一半機會賠返 ${fmtMoney(g.p(20000))}`, fx: { H: -hurt, J: -2 } },
      ], (g2, i) => {
        g2.add('H', -hurt, '高空墮物'); g2.add('J', -2);
        g2.spend(doc, '睇醫生');
        if (i === 0) return '醫生幫你包紮好，你之後行街都會望吓上面。';
        g2.spend(g2.p(5000), '調解');
        if (r() < 0.5) { g2.gain(g2.p(20000)); return `調解成功，業主賠咗 ${fmtMoney(g2.p(20000))} 俾你。`; }
        return '搵唔到係邊個單位跌落嚟，調解費白交。';
      }, { pri: 330, def: 0, auto: 0, agui: 0, cat: '生活日常', scene: 'street' });
    },
  },
  { // 樓上滲水
    id: 'HK-LEAK', pri: 320, ages: [22, 100], once: false, cool: 6, cat: '生活日常',
    when: (g) => {
      const s = g.s;
      if (!inHK(g) || s.flags['leakUntil'] || !['own', 'rent', 'public', 'subdiv', 'share', 'village'].includes(s.home)) return 0;
      // 樓齡 30 年以上：劏房、公屋、村屋當舊樓；自住樓每個人生固定一半機會係舊樓
      const old = ['subdiv', 'public', 'village'].includes(s.home) || (s.home === 'own' && streamRng(s.seed, 'oldbldg')() < 0.5);
      return old ? 0.04 : 0.02;
    },
    make: (g) => {
      const s = g.s;
      const r = streamRng(s.seed, 'hkleak', s.age);
      const fix = g.p(r.uni(15000, 40000));
      const owner = s.home === 'own';
      return mkCard('HK-LEAK', '樓上滲水', '浴室天花開始發霉滴水，樓上住戶話唔關佢事。', owner ? [
        { label: '自己出錢整', money: -fix, note: '即刻搞掂', fx: { J: -3 } },
        { label: '搵聯合辦事處', note: '唔使錢，但要等 1–2 年；期間每年快樂 −2、健康 −1', fx: { J: -3 } },
      ] : [
        { label: '搵業主處理', note: '唔使錢', fx: { J: -3 } },
        { label: '自己出錢整', money: -fix, note: '唔想等業主', fx: { J: -3 } },
      ], (g2, i) => {
        g2.add('J', -3, '滲水');
        const self = owner ? i === 0 : i === 1;
        if (self) { g2.spend(fix, '整滲水'); return '師傅開咗個天花窿，搵到漏水位，終於唔再滴。'; }
        if (!owner) return '業主嗌咗師傅嚟睇，拖咗兩個月終於整好。';
        g2.flag('leakUntil', s.year + r.int(1, 2));
        return '你填咗表格，職員話要排期做色水測試。';
      }, { pri: 320, def: owner ? 1 : 0, auto: owner ? 0 : 0, agui: 0, cat: '生活日常', scene: 'home' });
    },
  },
  { // 等聯合辦事處期間
    id: 'HK-LEAK-WAIT', pri: 319, once: false, fixed: true, cat: '生活日常',
    when: (g) => (g.s.flags['leakUntil'] ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      if (s.year > Number(s.flags['leakUntil'])) {
        delete s.flags['leakUntil'];
        g.add('J', 2);
        return '聯合辦事處終於搵到滲水源頭，樓上要負責維修，天花唔再滴水。';
      }
      g.add('J', -2, '等整滲水'); g.add('H', -1, '屋企發霉');
      return '天花仲係滴緊水，浴室成陣霉味，你繼續等聯合辦事處。';
    },
  },
  { // 野豬
    id: 'HK-BOAR', pri: 310, ages: [10, 100], once: false, cool: 15, cat: '生活日常',
    when: (g) => (inHK(g) && BOAR_DISTRICTS.includes(g.s.origin.district) ? 0.003 : 0),
    tick: (g) => {
      const s = g.s;
      if (s.flags['car']) {
        const c = g.p(streamRng(s.seed, 'boar', s.age).uni(8000, 25000));
        const t = g.spend(c, '修車');
        g.add('J', -2, '野豬撞車');
        g.log(`夜晚揸車返屋企，一隻野豬衝出馬路撞凹咗車頭，修車使咗 ${fmtMoney(c)}。`, '生活日常', true);
        return `🐗 野豬撞車，修車 ${fmtMoney(c)}${t}。`;
      }
      g.add('J', 1); g.ach('wild_boar');
      g.log('一隻野豬夜晚走入你屋企樓下翻垃圾，仲同你對望咗十秒先走。', '生活日常', true);
      return '🐗 一隻野豬喺樓下翻垃圾，同你對望咗十秒。';
    },
  },
  { // 公立專科排期
    id: 'HK-SPEC', pri: 420, ages: [40, 100], once: false, cool: 8, cat: '健康',
    when: (g) => (g.s.emigrated ? 0 : g.s.age >= 60 ? 0.04 : 0.02),
    make: (g) => {
      const s = g.s;
      const r = streamRng(s.seed, 'hkspec', s.age);
      const priv = g.p(r.uni(15000, 60000));
      const sz = g.p(r.uni(5000, 20000));
      return mkCard('HK-SPEC', '專科排期', '普通科醫生寫咗轉介信，但公立專科門診話要排兩年先睇到。', [
        { label: '排公立', money: -Math.round(g.p(135)), note: '可能延誤治療', fx: { H: -3 } },
        { label: '睇私家', money: -priv, fx: { H: 2 }, disabled: afford(g, priv) },
        { label: '去深圳睇', money: -sz, note: '要搭車過關；可能延誤治療', fx: { H: -1 }, disabled: afford(g, sz) },
      ], (g2, i) => {
        const s2 = g2.s;
        // 用家指定：排公立同去深圳，暗地裏當年同下一年死亡機率加少少（細字已寫「可能延誤治療」）
        if (i === 0) {
          g2.spend(g2.p(135), '專科');
          g2.add('H', -3, '排期等睇醫生');
          g2.flag('specRiskQ', 0.003); g2.flag('specRiskTo', s2.year + 1);
          return '你將排期紙貼喺雪櫃，等兩年後嘅覆診日。';
        }
        if (i === 1) { g2.spend(priv, '私家專科'); g2.add('H', 2); return '一個星期內做完檢查，醫生話及早處理問題唔大。'; }
        g2.spend(sz, '深圳睇醫生'); g2.add('H', -1);
        g2.flag('specRiskQ', 0.0015); g2.flag('specRiskTo', s2.year + 1);
        return '你一早過關，排咗半日終於見到醫生。';
      }, { pri: 420, def: 0, auto: g.liquid > priv * 3 ? 1 : 0, agui: g.liquid > priv * 2 ? 1 : 0, cat: '健康', scene: 'hospital' });
    },
  },
  { // 演唱會搶飛
    id: 'HK-TIX', pri: 300, ages: [15, 45], once: false, cool: 3, cat: '生活日常',
    when: (g) => (inHK(g) ? 0.06 : 0),
    make: (g) => {
      const s = g.s;
      const minor = s.age < 18;
      const cost = Math.round(g.p(6000));
      const can = minor ? (s.piggy >= cost ? undefined : '利是錢唔夠') : afford(g, cost);
      return mkCard('HK-TIX', '演唱會搶飛', '你最鍾意嘅歌手開演唱會，網上排隊排咗三個鐘，一入去就話售罄。', [
        { label: '唔睇喇', fx: { J: -2 } },
        { label: '喺屋企睇直播' },
        { label: '買炒飛', money: -cost, note: `兩張原價三倍${minor ? '，用自己利是錢' : ''}；有機會買到假飛`, disabled: can },
      ], (g2, i) => {
        const s2 = g2.s;
        if (i === 0) { g2.add('J', -2, '搶唔到飛'); return '你喺 IG 睇住朋友打卡，有啲唔開心。'; }
        if (i === 1) return '你同屋企人一齊喺梳化跟住唱。';
        if (minor) s2.piggy -= cost; else g2.spend(cost, '炒飛');
        if (streamRng(s2.seed, 'hktix', s2.age)() < 0.1) { g2.add('J', -5, '買到假飛'); return '入場嗰陣先發現係假飛，錢冇咗，騷又睇唔到。'; }
        g2.add('J', 4, '睇演唱會'); return '你喺場館入面叫到聲沙，覺得值回票價。';
      }, { pri: 300, def: 1, auto: 1, agui: 1, cat: '生活日常' });
    },
  },
  { // 收樓執漏
    id: 'HK-DEFECT', pri: 400, once: false, fixed: true, cat: '生活日常',
    when: (g) => {
      const p = g.s.prop;
      if (!p || g.s.flags['defectChk' + p.boughtYear] || g.s.year - p.boughtYear < 1 || g.s.year - p.boughtYear > 3) return 0;
      // 每次買樓預先抽一次：20% 有執漏問題（收樓嗰年或者之後一兩年先出，避免俾其他卡擠走）
      return streamRng(g.s.seed, 'defect', p.boughtYear)() < 0.2 ? 1 : 0;
    },
    make: (g) => {
      const s = g.s;
      const r = streamRng(s.seed, 'hkdefect', s.age);
      const pro = g.p(r.uni(5000, 8000));
      const by = s.prop!.boughtYear;
      return mkCard('HK-DEFECT', '收樓執漏', '收樓嗰日，你發現牆身有裂紋，窗邊仲有水漬。', [
        { label: '自己驗樓', note: '唔使錢，大約六成問題執得好' },
        { label: '請專業驗樓', money: -pro, note: '大約九成五問題執得好', disabled: afford(g, pro) },
        { label: '唔理佢', note: '之後 5 年每年有機會要自己出錢維修' },
      ], (g2, i) => {
        const s2 = g2.s;
        g2.flag('defectChk' + by);
        if (i === 1) g2.spend(pro, '驗樓');
        const ok = i < 2 && r() < (i === 0 ? 0.6 : 0.95);
        if (ok) return i === 0 ? '你拎住手電筒同水平尺逐間房睇，發展商執好咗大部分問題。' : '驗樓師列咗三版問題清單，發展商全部執好。';
        g2.flag('defectUntil', s2.year + 5);
        return i === 2 ? '你覺得問題唔大，照搬入去住。' : '有幾個位執得唔好，你唯有先搬入去住。';
      }, { pri: 400, def: 2, auto: 1, agui: 1, cat: '生活日常', scene: 'home' });
    },
  },
  { // 執漏唔好，之後要維修
    id: 'HK-DEFECT-FIX', pri: 390, once: false, cat: '財務衝擊',
    when: (g) => (Number(g.s.flags['defectUntil'] ?? 0) >= g.s.year && g.s.home === 'own' ? 0.3 : 0),
    tick: (g) => {
      const c = g.p(streamRng(g.s.seed, 'defectfix', g.s.age).uni(10000, 30000));
      const t = g.spend(c, '維修');
      g.add('J', -1);
      return `新樓窗邊又滲水，請師傅執使咗 ${fmtMoney(c)}${t}。`;
    },
  },
];
