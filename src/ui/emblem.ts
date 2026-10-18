// 成就顯示圖：每個成就一個像素徽章（圖案 + 主色），底色跟類別，外框跟稀有度
import { ACH_BY_ID } from '../engine/achievements';
import RARITY from '../data/ach_rarity.json';
import { h } from './dom';

// 12×12 左右嘅像素圖案；a = 成就主色，b = 主色淺色，其他字母係固定顏色，. = 透明
const G: Record<string, string[]> = {
  house: ['.....kk.....', '....kaak....', '...kaaaak...', '..kaaaaaak..', '.kaaaaaaaak.', 'kkkkkkkkkkkk', '.kwwwwwwwwk.', '.kwkkwwkkwk.', '.kwkuwwkuwk.', '.kwwwwnnwwk.', '.kwwwwnnwwk.', '.kkkkkkkkkk.'],
  door: ['.kkkkkkkk.', '.kaaaaaak.', '.kakkkkak.', '.kakwwkak.', '.kakkkkak.', '.kaaaaaak.', '.kaaaayak.', '.kaaaaaak.', '.kaaaaaak.', 'kkkkkkkkkk'],
  housekey: ['.....kk......', '....kaak.....', '...kaaaak....', '..kaaaaaak...', '.kkkkkkkkkk..', '.kwwwwwwwwk..', '.kwkkwwwwwk..', '.kwkuwkkkkkkk', '.kwwwwkyyyyyk', '.kwwwwkkkykyk', '.kkkkkk..k.k.'],
  spoon: ['...kkkk...', '..kyyyyk..', '..kywyyk..', '..kyyyyk..', '...kyyk...', '....kk....', '...kyk....', '...kyk....', '...kyk....', '...kyk....', '...kyk....', '...kkk....'],
  bottle: ['....kkkk....', '....kaak....', '...kkkkkk...', '...kwwwwk...', '...kwbwwk...', '...kwwwwk...', '...kbbbbk...', '...kbbbbk...', '...kbbbbk...', '...kbbbbk...', '...kkkkkk...'],
  firework: ['.....y.....', '..y..y..y..', '...y.y.y...', '....yyy....', 'yyyyyryyyyy', '....yyy....', '...y.y.y...', '..y..y..y..', '.....y.....', '.r.......r.', 'rrr.....rrr', '.r.......r.'],
  plane: ['.....kk.....', '....kaak....', '....kaak....', '...kkaakk...', '.kkaaaaaakk.', 'kaaaaaaaaaak', 'kkkkkaakkkkk', '....kaak....', '...kaaaak...', '...kkkkkk...'],
  suitcase: ['....kkkk....', '....k..k....', '.kkkkkkkkkk.', '.kaaaaaaaak.', '.kaybaabyak.', '.kaaaaaaaak.', '.kkkkkkkkkk.', '.kaaaaaaaak.', '.kaaaaaaaak.', '.kkkkkkkkkk.', '..k......k..'],
  globe: ['...kkkkk...', '..kuugguuk.', '.kuggguuuk.', 'kuuggguuuuk', 'kuuuguuuggk', 'kuuuuuuggguk', 'kguuuuuuguk', '.kgguuuuuk.', '..kuuuuuk..', '...kkkkk...'],
  pencil: ['.........kk.', '........krrk', '.......kyyk.', '......kyyk..', '.....kyyk...', '....kyyk....', '...kyyk.....', '..kyyk......', '.ksnk.......', '.kkk........', 'kk..........'],
  crown: ['.y...y...y.', 'kyk.kyk.kyk', 'kyykyyykyyk', 'kyyyyyyyyyk', 'kyyryyyryyk', 'kyyyyyyyyyk', 'kkkkkkkkkkk'],
  target: ['...kkkkk...', '..krrrrrk..', '.krrwwwrrk.', 'krrwrrrwrrk', 'krwrrkrrwrk', 'krwrkykrwrk', 'krwrrkrrwrk', 'krrwrrrwrrk', '.krrwwwrrk.', '..krrrrrk..', '...kkkkk...'],
  cap: ['.....kk.....', '...kkaakk...', '.kkaaaaaakk.', 'kaaaaaaaaaak', '.kkaaaaaakky', '...kkaakk.y.', '...kaaaak.y.', '...kaaaak.yy', '....kkkk....'],
  book: ['.kkkkk.kkkkk.', 'kwwwwwkwwwwwk', 'kwdddwkwdddwk', 'kwwwwwkwwwwwk', 'kwdddwkwdddwk', 'kwwwwwkwwwwwk', 'kwdddwkwdddwk', 'kaaaaakaaaaak', '.kkkkkkkkkkk.'],
  glasses: ['............', 'kkkkk..kkkkk', 'kuuuk..kuuuk', 'kuwukkkkuwuk', 'kuuuk..kuuuk', 'kkkkk..kkkkk'],
  packet: ['kkkkkkkkkk', 'krrrrrrrrk', 'kryyrryyrk', 'krrrrrrrrk', 'krrryyrrrk', 'krrykkyrrk', 'krrryyrrrk', 'krrrrrrrrk', 'krrrrrrrrk', 'kkkkkkkkkk'],
  briefcase: ['....kkkk....', '...kk..kk...', 'kkkkkkkkkkkk', 'kaaaaaaaaaak', 'kaaaaaaaaaak', 'kkkkkyykkkkk', 'kaaaayyaaaak', 'kaaaaaaaaaak', 'kkkkkkkkkkkk'],
  train: ['..kkkkkkkk..', '.kaaaaaaaak.', '.kwwwkkwwwk.', '.kwwwkkwwwk.', '.kaaaaaaaak.', '.kayaaaayak.', '.kaaaaaaaak.', '..kkkkkkkk..', '..k.k..k.k..', '.kk......kk.'],
  umbrella: ['.....k.....', '...kkakk...', '..kaaaaak..', '.kaaaaaaak.', 'kaaaaaaaaak', 'kkkkkkkkkkk', '.....k.....', '.....k.....', '.....k.....', '.....k..k..', '......kk...'],
  piggy: ['........kk..', '..kkkkkkkk..', '.kppppppppk.', 'kppppkkppppk', 'kpkppppppppk', 'kppppppppppk', 'kppppppppppk', '.kppppppppk.', '..kpk..kpk..', '..kk....kk..'],
  bag: ['....kkkk....', '.....kk.....', '....kkkk....', '...knnnnk...', '..knnyynnk..', '.knnynnnnnk.', '.knnnyynnnk.', '.knnnnnynnk.', '.knnyyynnnk.', '..knnnnnnk..', '...kkkkkk...'],
  coins: ['...kkkkk...', '..kyyyyyk..', '..kkkkkkk..', '..kyyyyyk..', '.kkkkkkkkk.', '.kyyyyyyyk.', '.kkkkkkkkk.', 'kyyyyyyyyyk', 'kkkkkkkkkkk', 'kyyyyyyyyyk', 'kkkkkkkkkkk'],
  tree: ['...kkkkk...', '..kgggggk..', '.kgggyggggk', '.kggggggyk.', '.kgyggggggk', '..kgggggk..', '...kknkk...', '....knk....', '....knk....', '..kkkkkkk..'],
  bowl: ['..w.w.w....', '.wwwwwww...', 'wwwwwwwww..', 'kkkkkkkkkk.', 'kaaaaaaaak.', '.kaaaaaak..', '..kaaaak...', '...kkkk....'],
  beach: ['....y.y.....', '..y.yyy.y...', '...yyyyy....', '..yyyyyyy...', '...yyyyy....', '..y.yyy.y...', '....y.y.....', 'uuuuuuuuuuuu', 'uwuuuuuwuuuu', 'oooooooooooo'],
  card: ['kkkkkkkkkkkk', 'kaaaaaaaaaak', 'kkkkkkkkkkkk', 'kaaaaaaaaaak', 'kayyaaaaaaak', 'kayyaaaaaaak', 'kaaaaawwwwak', 'kkkkkkkkkkkk'],
  arrow: ['.....kk.....', '....kaak....', '...kaaaak...', '..kaaaaaak..', '.kkkkaakkkk.', '....kaak....', '....kaak....', '....kaak....', '....kaak....', '....kkkk....'],
  hook: ['.....kk.....', '.....kd.....', '.....kd.....', '.....kd.....', '.....kd.....', '.k...kd.....', '.dk..kd.....', '.dk..kd.....', '..dkkdk.....', '...ddd......'],
  lock: ['...kkkkk...', '..kk...kk..', '..k.....k..', '.kkkkkkkkk.', '.kyyyyyyyk.', '.kyyykyyyk.', '.kyyykyyyk.', '.kyyyyyyyk.', '.kkkkkkkkk.'],
  shield: ['.kkkkkkkkk.', 'kaaaaaaaaak', 'kaabaaaaaak', 'kabaaaaaaak', 'kaaaaaaaaak', '.kaaaaaaak.', '.kaaaaaaak.', '..kaaaaak..', '...kaaak...', '....kkk....'],
  shieldok: ['.kkkkkkkkk.', 'kaaaaaaaaak', 'kaaaaaaawak', 'kaaaaaawaak', 'kawaaawaaak', '.kawawaaak.', '.kaawaaaak.', '..kaaaaak..', '...kaaak...', '....kkk....'],
  shop: ['kkkkkkkkkkkk', 'krwrwrwrwrwk', 'krwrwrwrwrwk', '.kkkkkkkkkk.', '.kaaaaaaaak.', '.kwwkaakwwk.', '.kwwkaakwwk.', '.kaaaaaaaak.', '.kaakkkkaak.', '.kaakyykaak.', '.kaakyykaak.', 'kkkkkkkkkkkk'],
  clock: ['...kkkkk...', '..kwwwwwk..', '.kwwwkwwwk.', 'kwwwwkwwwwk', 'kwwwwkwwwwk', 'kwwwwkkkwwk', 'kwwwwwwwwwk', '.kwwwwwwwk.', '..kwwwwwk..', '...kkkkk...'],
  dove: ['......kk....', '.....kwwk...', '..kk.kwwkk..', '.kwwkkwwwwk.', 'kwwwwwwwwwyk', '.kwwwwwwwkk.', '..kkwwwwk...', '....kkkk....'],
  cross: ['kk......kk', 'krk....krk', '.krk..krk.', '..krkkrk..', '...krrk...', '...krrk...', '..krkkrk..', '.krk..krk.', 'krk....krk', 'kk......kk'],
  heart: ['.kkk...kkk.', 'krrrk.krrrk', 'krwrrkrrrrk', 'krrrrrrrrrk', 'krrrrrrrrrk', '.krrrrrrrk.', '..krrrrrk..', '...krrrk...', '....krk....', '.....k.....'],
  family: ['.kk......kk.', 'kssk....kssk', 'kssk.kk.kssk', '.kk.kssk.kk.', 'kuuk.kk.kppk', 'kuukkggkkppk', 'kuukkggkkppk', 'kuuk.kk.kppk', '.kk......kk.'],
  ribbon: ['...kkkk...', '..kppppk..', '..kpkkpk..', '..kpkkpk..', '...kppk...', '...kppk...', '..kpkkpk..', '.kpk..kpk.', '.kk....kk.'],
  cake: ['..y..y..y..', '..k..k..k..', '.kkkkkkkkk.', '.kwwwwwwwk.', '.kpwpwpwpk.', '.kpppppppk.', 'kkkkkkkkkkk', 'knnnnnnnnnk', 'kkkkkkkkkkk'],
  lily: ['...kk.kk...', '..kwwkwwk..', '..kwwkwwk..', 'kkkkyyykkkk', 'kwwwyyywwwk', '.kkkyyykkk.', '..kwwkwwk..', '..kwwkwwk..', '...kkgkk...', '.....g.....', '.....g.....'],
  cup: ['...w..w....', '....w..w...', '...w..w....', '.kkkkkkkk..', '.kwwwwwwkkk', '.kwnnnnwk.k', '.kwwwwwwkkk', '..kwwwwk...', '.kkkkkkkk..'],
  teapot: ['.....kk.....', '....kkkk....', '..kkaaaakk..', 'k.kaaaaaak..', 'kkaaabaaaakk', '.kaaaaaaaak.k', '.kaaaaaaaakk', '..kaaaaaak..', '...kkkkkk...'],
  star: ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '..kyykkyyk..', '.kyyk..kyyk.', '.kkk....kkk.'],
  trophy: ['kkkkkkkkkk', 'kyyyyyyyyk', 'kykyyyykyk', 'kykyyyykyk', '.kyyyyyyk.', '..kyyyyk..', '...kyyk...', '....kk....', '...kyyk...', '..kkkkkk..'],
  ball: ['...kkkk...', '.kkaaaakk.', '.kawwwwak.', 'kawwkkwwak', 'kawwwkwwak', 'kawwwkwwak', '.kawkkkak.', '.kkaaaakk.', '...kkkk...'],
  ticket: ['kkkkkkkkkkkk', 'kaaaaakaaaak', '.kayyakawwk.', '.kaaaakaaak.', 'kaaaaakaaaak', 'kkkkkkkkkkkk'],
  nugget: ['...kkkk.....', '..kyyyyk....', '.kyywyyykk..', 'kyyyyyyyyyk.', 'kyyyyynyyyk.', '.kkyyyyyyk..', '...kkkkkk...'],
  hourglass: ['kkkkkkkkk', '.kyyyyyk.', '..kyyyk..', '...kyk...', '...kwk...', '..kwywk..', '.kwyyywk.', 'kkkkkkkkk'],
  cat: ['.k.....k...', 'kak...kak..', 'kaakkkaak..', 'kaaaaaaak..', 'kawkaakwk..', 'kaaapaaak..', '.kaaaaak..k', '.kaaaaaak.k', 'kaaaaaaaakk', 'kkkkkkkkkk.'],
  helmet: ['...kkkkk...', '..kwwwwwk..', '.kwkkkkkwk.', 'kwkuuuuukwk', 'kwkuuwuukwk', 'kwkuuuuukwk', '.kwkkkkkwk.', '.kwwwwwwwk.', 'kkkkkkkkkkk'],
  rocket: ['.....kk.....', '....kwwk....', '...kwwwwk...', '...kwuuwk...', '...kwuuwk...', '...kwwwwk...', '..kkwwwwkk..', '.krkwwwwkrk.', '.kk.kkkk.kk.', '....kyyk....', '.....yy.....'],
  meteor: ['.........y.', '........y..', '..kkk..y...', '.kooook....', 'kooyyook...', 'koyyyyok...', 'koyyyyok...', 'kooyyook...', '.kooook....', '..kkkk.....'],
  scroll: ['.kkkkkkkkk.', 'kwkwwwwwwwk', '.kwddddwwk.', '.kwwwwwwwk.', '.kwddddwwk.', '.kwwwwwwwk.', '.kwddwrrwk.', 'kwwwwwrrkwk', '.kkkkkkkkk.'],
  camera: ['..kkk......', 'kkkkkkkkkkk', 'kaaaaaaaaak', 'kaakkkkaayk', 'kaakuukaaak', 'kaakuukaaak', 'kaakkkkaaak', 'kaaaaaaaaak', 'kkkkkkkkkkk'],
  chest: ['.kkkkkkkkkk.', 'knnnnnnnnnnk', 'knnnnnnnnnnk', 'kkkkkyykkkkk', 'knnnnyynnnnk', 'knnnnnnnnnnk', 'knnnnnnnnnnk', 'kkkkkkkkkkkk'],
  duck: ['...kkk.....', '..kyyyk....', '..kykyyoo..', '..kyyykkk..', '.kkyyyk....', 'kyyyyyyykk.', 'kyyyyyyyyyk', 'kyywyyyyyyk', '.kyyyyyyyk.', '..kkkkkkk..'],
  candle: ['....o.....', '...oyk....', '....k.....', '..kkkkk...', '..kwwwk...', '..kwwwk...', '..kwwwk...', '..kwwwk...', '.kkkkkkk..'],
  robot: ['.....k.....', '.....y.....', '.kkkkkkkkk.', '.kdddddddk.', '.kdukdkudk.', '.kdddddddk.', '.kddkkkddk.', '.kkkkkkkkk.', 'kdkdddddkdk', 'kkkdddddkkk', '...kk.kk...'],
  ufo: ['....kkk.....', '...kuuuk....', '..kuwuuuk...', '.kkkkkkkkk..', 'kddddddddddk', '.kdydydydk..', '..kkkkkkk...', '...y...y....', '..y.....y...'],
  planet: ['....kkkk....', '..kkrrrrkk..', '.krrorrrrrk.', 'kkkkkkkkkkkk', 'krrrrrorrrrk', 'kkkkkkkkkkkk', '.krrrrrrrrk.', '..kkrrrrkk..', '....kkkk....'],
  letter: ['kkkkkkkkkkkk', 'kwkwwwwwwkwk', 'kwwkwwwwkwwk', 'kwwwkrrkwwwk', 'kwwwrrrrwwwk', 'kwwwwrrwwwwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk'],
  ring: ['....kkk.....', '...kuwuk....', '....kuk.....', '...kyyyk....', '..ky...yk...', '.ky.....yk..', '.ky.....yk..', '.ky.....yk..', '..ky...yk...', '...kyyyk....'],
  pram: ['..kkkk......', '.kaaaak.....', 'kaaaaaakkkkk', 'kaaaaaaaaaak', 'kabaaaaaaaak', '.kaaaaaaaak.', '..kkkkkkkk..', '..k......k..', '.kdk....kdk.', '..k......k..'],
  twins: ['.aa....aa.', '.kk....kk.', 'kkkk..kkkk', 'kwwk..kwwk', 'kbwk..kbwk', 'kwwk..kwwk', 'kbbk..kbbk', 'kbbk..kbbk', 'kkkk..kkkk'],
  cane: ['..kkkk.....', '.kaaaak....', '.ka..kak...', '..k..kak...', '.....kak.r.', '.....kakrrr', '.....kak.r.', '.....kak...', '.....kak...', '.....kkk...'],
  tower: ['.kkkkkkkkk.', '.kaaaaaaak.', '.kawawawak.', '.kaaaaaaak.', '.kawawawak.', '.kaaaaaaak.', '.kawawawak.', '.kaaaaaaak.', '.kawawawak.', '.kaakkkaak.', 'kkkkkkkkkkk'],
  quill: ['.........kk', '........kwk', '.......kwwk', '......kwwk.', '.....kwwk..', '....kwwk...', '...kwwk....', '..kkkk.....', '.kk........', 'kkkkkkk....'],
  alien: ['...kkkkk...', '..kaaaaak..', '.kaaaaaaak.', 'kaaaaaaaaak', 'kakkaaakkak', 'kakwaaakwak', 'kaaaaaaaaak', '.kaaakaaak.', '..kaaaaak..', '...kkkkk...'],
  zombie: ['..k.k.k....', '.kakakak...', '.kakakak.k.', '.kaaaaakak.', '.kaaaaaaak.', '..kaaaaak..', '...kaaak...', '...kaaak...', 'nnnkaaaknnn', 'nnnnnnnnnnn'],
  rewind: ['.....k....k', '....kk...kk', '...kak..kak', '..kaak.kaak', '.kaaakkaaak', '..kaak.kaak', '...kak..kak', '....kk...kk', '.....k....k'],
  hat: ['............', '....kkkk....', '...kaaaak...', '...kaaaak...', '...kaaaak...', '...kbbbbk...', 'kkkkkkkkkkkk', 'kaaaaaaaaaak', '.kkkkkkkkkk.'],
  catbig: ['k........k..', 'kak....kak..', 'kaakkkkaak..', 'kaaaaaaaak..', 'kawkaaakwk..', 'kaaaapaaak.k', 'kaaaaaaaak.k', 'kaaaaaaaaakk', 'kaaaaaaaaak.', 'kkkkkkkkkk..'],
  catsay: ['......kkkkk.', '.....kwwwwwk', '.....kwdwdwk', '.k...kkwkkk.', 'kak.kak.k...', 'kaakkaak....', 'kaaaaaak....', 'kwkaakwk....', 'kaapaaak....', '.kkkkkk.....'],
  rainbow: ['...rrrrrr...', '..rooooooor.', '.royyyyyyor.', 'roygggggyor.', 'roygw..wgyor', 'royg....gyor', 'roy......yor'],
};

// 成就 → [圖案, 主色]
const MAP: Record<string, [string, string]> = {
  born_public: ['house', '#5aa9e6'], born_subdivided: ['door', '#c98a5a'], golden_spoon: ['spoon', '#f2c14e'], born_orphanage: ['bottle', '#f29bb5'],
  born_1997: ['firework', '#d6455d'], born_new_immigrant: ['suitcase', '#e07b39'],
  quiz_king: ['pencil', '#f2c14e'], exam_top: ['crown', '#f2c14e'], one_mark_short: ['target', '#d6455d'], overseas_grad: ['globe', '#5aa9e6'],
  grassroots_grad: ['cap', '#2f3b52'], self_made: ['book', '#12706a'], lifelong_learner: ['glasses', '#5aa9e6'],
  first_salary: ['packet', '#d6455d'], million_salary: ['briefcase', '#6b4a32'], expat: ['plane', '#5aa9e6'], gba_5y: ['train', '#d6455d'], layoff_ready: ['umbrella', '#12706a'],
  first_100k: ['piggy', '#f29bb5'], millionaire: ['bag', '#9b6a43'], ten_million: ['coins', '#f2c14e'], first_home: ['housekey', '#e07b39'], mortgage_free: ['house', '#4caf6d'],
  compound_miracle: ['tree', '#4caf6d'], enough_forever: ['bowl', '#d6455d'], early_retire: ['beach', '#f2c14e'], card_slave: ['card', '#5c6bc0'], comeback: ['arrow', '#4caf6d'],
  scammed: ['hook', '#7d8696'], miser: ['lock', '#f2c14e'],
  full_armor: ['shield', '#5c6bc0'], premium_paid_off: ['shieldok', '#12706a'], peace_whole_life: ['dove', '#ffffff'], buy_early: ['clock', '#ffffff'], uninsurable: ['cross', '#d6455d'],
  family_at_ease: ['family', '#ffffff'], cancer_survivor: ['ribbon', '#f29bb5'],
  centenarian: ['cake', '#f29bb5'], died_young: ['lily', '#ffffff'], happy_family: ['heart', '#d6455d'], happy_single: ['cup', '#9b6a43'], filial: ['teapot', '#12706a'],
  emigrate: ['plane', '#8e1f3f'], return_hk: ['suitcase', '#12706a'], pentagon: ['star', '#f2c14e'], beat_agui: ['trophy', '#f2c14e'],
  jackpot: ['ball', '#d6455d'], lottery_vs_fund: ['ticket', '#4caf6d'], against_fate: ['rocket', '#d6455d'], gold_rush: ['nugget', '#f2c14e'], future_tip: ['hourglass', '#f2c14e'],
  biz_start: ['shop', '#4caf6d'], biz_exit: ['coins', '#f2c14e'], history_rewrite: ['hourglass', '#8e4fd6'],
  cat_boss: ['cat', '#f08a3c'], lion_rock_astronaut: ['helmet', '#ffffff'], meteor: ['meteor', '#f08a3c'], will_matters: ['scroll', '#ffffff'], lookalike: ['camera', '#2f3b52'],
  first_love: ['letter', '#d6455d'], married: ['ring', '#f2c14e'], parent: ['pram', '#5aa9e6'], twins: ['twins', '#f29bb5'], grandparent: ['cane', '#9b6a43'],
  public_housing: ['tower', '#e07b39'], will: ['quill', '#2f3b52'],
  green_hat: ['hat', '#4caf6d'], giant_cat: ['catbig', '#f08a3c'], talking_cat: ['catsay', '#d9d4c7'],
  earth_defense: ['alien', '#4caf6d'], zombie_survivor: ['zombie', '#8fbf6a'], redo_10y: ['rewind', '#8e4fd6'],
  treasure: ['chest', '#9b6a43'], duck_effect: ['duck', '#f2c14e'], blackout: ['candle', '#ffffff'], robot_gift: ['robot', '#7d8696'], rooftop_ufo: ['ufo', '#7d8696'], mars_scam: ['planet', '#d6455d'],
};

const FIXED: Record<string, string> = { k: '#26262e', w: '#fbfbf7', y: '#f2c14e', r: '#d6455d', g: '#4caf6d', n: '#9b6a43', s: '#f3c9a4', d: '#7d8696', p: '#f29bb5', u: '#5aa9e6', o: '#f08a3c' };
const CAT_BG: Record<string, [string, string]> = {
  出身: ['#f6e3cf', '#ecd0b3'], 學業: ['#dce9fb', '#c4d9f5'], 事業: ['#dcefe3', '#c3e2cf'], 理財: ['#fbedc8', '#f5dda0'],
  保障: ['#d8efed', '#bfe3df'], 人生: ['#f9dfe8', '#f1c6d6'], 特殊: ['#e6ddfa', '#d2c3f5'],
};

export type Tier = { name: string; frame: string; glow: boolean };
const RATES = RARITY as Record<string, number>;
export const rarityOf = (id: string) => RATES[id] ?? 0.0005;
export function tierOf(id: string): Tier {
  const r = rarityOf(id);
  if (r < 0.01) return { name: '傳說', frame: '#8e4fd6', glow: true };
  if (r < 0.05) return { name: '稀有', frame: '#e0ac2b', glow: true };
  if (r < 0.2) return { name: '少見', frame: '#9aa7b4', glow: false };
  return { name: '常見', frame: '#c08a5a', glow: false };
}
export const rateText = (id: string) => { const r = rarityOf(id) * 100; return r < 0.1 ? '少於 0.1%' : r < 1 ? `${r.toFixed(1)}%` : `${Math.round(r)}%`; };

function lighten(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 32×32 像素徽章；locked = 未解鎖剪影 */
export function emblem(id: string, cssSize = 48, locked = false): HTMLCanvasElement {
  const S = 32;
  const cv = h('canvas', { class: 'emblem', width: S, height: S, 'aria-hidden': 'true' });
  cv.style.width = cv.style.height = `${cssSize}px`;
  const c = cv.getContext('2d')!;
  const a = ACH_BY_ID[id];
  const [gname, main] = MAP[id] ?? ['star', '#f2c14e'];
  const tier = tierOf(id);
  const [bg1, bg2] = CAT_BG[a?.cat ?? '特殊'] ?? CAT_BG['特殊'];
  const px = (x: number, y: number, w: number, hh: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, hh); };
  // 圓角方形外框（像素階梯）
  const rr = (inset: number, col: string) => {
    const lo = inset, hi = S - inset;
    px(lo + 2, lo, hi - lo - 4, hi - lo, col);
    px(lo, lo + 2, hi - lo, hi - lo - 4, col);
    px(lo + 1, lo + 1, hi - lo - 2, hi - lo - 2, col);
  };
  rr(0, locked ? '#b9c0c6' : tier.frame);
  rr(2, locked ? '#e3e7ea' : bg1);
  if (!locked) {
    // 斜紋底
    c.fillStyle = bg2;
    for (let i = -S; i < S; i += 6) for (let y = 3; y < S - 3; y++) { const x = i + y; if (x > 2 && x < S - 3 && (x + y) % 6 < 2) c.fillRect(x, y, 1, 1); }
    if (tier.glow) {
      // 放射光
      c.fillStyle = 'rgba(255,255,255,.55)';
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) for (let k = 4; k < 13; k++) c.fillRect(16 + dx * k, 16 + dy * k, 1, 1);
    }
  }
  const rows = G[gname] ?? G.star;
  const gw = Math.max(...rows.map((r) => r.length)), gh = rows.length;
  const sc = Math.max(1, Math.floor(26 / Math.max(gw, gh)));
  const ox = Math.floor((S - gw * sc) / 2), oy = Math.floor((S - gh * sc) / 2);
  const light = lighten(main, 0.5);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    const col = locked ? (ch === 'k' ? '#9aa3ab' : '#c9d0d5') : ch === 'a' ? main : ch === 'b' ? light : FIXED[ch] ?? main;
    px(ox + x * sc, oy + y * sc, sc, sc, col);
  }));
  if (!locked && tier.name === '傳說') {
    // 四角閃光
    for (const [x, y] of [[4, 4], [27, 4], [4, 27], [27, 27]]) { px(x, y - 1, 1, 3, '#fff'); px(x - 1, y, 3, 1, '#fff'); }
  }
  return cv;
}

export const EMBLEM_IDS = Object.keys(MAP);

/** 成就解鎖彈出：徽章大圖 + 名稱 + 稀有度 */
export function achToast(id: string, ms = 3800) {
  const a = ACH_BY_ID[id];
  if (!a) return;
  let host = document.getElementById('toasts');
  if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
  const tier = tierOf(id);
  // 彩紙爆開：粒數同稀有度掛鈎
  const n = tier.name === '傳說' ? 22 : tier.name === '稀有' ? 16 : 10;
  const cols = ['#e0ac2b', '#e1765a', '#2f8f7a', '#4c7bd9', '#8e4fd6', '#d94c8a'];
  const burst = h('span', { class: 'burst', 'aria-hidden': 'true' },
    Array.from({ length: n }, (_, i) => {
      const ang = (i / n) * 360 + (i % 3) * 9, dist = 46 + (i % 4) * 14;
      return h('i', { style: `--a:${ang}deg;--d:${dist}px;background:${cols[i % cols.length]};animation-delay:${(i % 5) * 0.02}s` });
    }));
  const el = h('div', { class: `achpop t-${tier.name}`, role: 'status' }, h('i', { class: 'ap-new', 'aria-hidden': 'true' }, 'NEW'), h('span', { class: 'ap-e' }, burst, emblem(id, 72)),
    h('div', { class: 'ap-t' }, h('small', null, `🏆 全新成就・${tier.name}`), h('b', null, a.name), h('span', null, a.desc)));
  // v1.1：全新成就加全畫面閃光同光芒，更加明顯
  const flash = h('div', { class: `achflash t-${tier.name}`, 'aria-hidden': 'true' }, h('span', { class: 'rays' }));
  document.body.append(flash);
  setTimeout(() => flash.remove(), 1600);
  if (navigator.vibrate) try { navigator.vibrate(tier.name === '傳說' ? [60, 40, 120] : 60); } catch { /* 忽略 */ }
  while (host.children.length >= 2) host.firstElementChild!.remove();
  host.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}
