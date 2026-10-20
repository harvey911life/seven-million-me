# 七百萬分之我：交接文件

> 寫俾接手嘅人或者 AI。2026-10-20 更新，對應版本 **v1.7**。
> 作者／擁有人：Harvey Wong（IG @life_balance_adventure）。
> 程式碼同設計由 Claude（Anthropic）協助製作，所有決定都係 Harvey 拍板。

---

## 1. 呢個係乜

一個香港人生模擬網頁遊戲（「香港人Soci Game」）。玩家由出世玩到離世，每年揀抉擇卡，影響健康、快樂、知識、人際同財務，最後睇結局計分同「平行人生」比較。設計目的係用遊戲帶出理財同保障規劃嘅重要性，但**唔推銷任何產品**。

- 玩法概念受 8,000,000,000 分之一（1in8b.life）啟發，但所有程式、美術、內容都係自己寫，冇抄佢嘅程式碼。
- 一個 HTML 檔就係成個遊戲（所有 JS、CSS、圖都打包入去），冇伺服器、冇登入、唔收集資料，進度存喺玩家瀏覽器嘅 localStorage。

## 2. 檔案喺邊

| 嘢 | 位置 |
|---|---|
| 原始碼 | 呢個資料夾（GitHub：`github.com/harvey911life/seven-million-me`，分支 `claude/game-v0`）|
| 設計文件（GDD）| `docs/gdd/七百萬分之我_GDD_完整版.md`（分章版本喺同一資料夾）|
| 題庫 | `docs/question-bank/`（xlsx 同 JSON；遊戲用嘅已經轉入 `src/data/questions*.json`）|
| 法例檢查 | `docs/法例檢查.md` |
| 公開版網址 | 用 Netlify 寄存（Harvey 自己用拖檔方式上載）|

## 3. 環境同指令

需要 Node 20 或以上（開發時用 Node 22）同 Python 3。

```bash
npm ci                 # 裝套件（只有 typescript、vite、vite-plugin-singlefile）
npm run dev            # 本機開發，瀏覽器開 http://localhost:5173
npm run build          # 型別檢查 + 打包 → dist/index.html（單一檔案）
npm run sim -- 1000 auto   # 無畫面模擬 1000 局；模式 auto / def / agui；一定要見到「錯誤 0」
npm run release        # build 之後生成兩個出街檔（見下面）
```

`npm run release` 會整：
- `release/public/index.html`：**公開版**，有分享預覽（og:title 等）。上載去 Netlify 嘅就係呢個。
- `release/friends/index.html`：朋友試玩版，加咗 `noindex`，唔俾搜尋器收錄。

`dist/page.html` 係俾 Claude Artifact 用嘅格式，其他平台唔使理。

### 上載去 Netlify
1. `npm run release`
2. 登入 Netlify → 個 site → **Deploys** 頁
3. 將 `release/public/` 成個資料夾（或者入面嘅 `index.html`）拖入去
4. 等一兩分鐘就上線

## 4. 程式架構

```
src/
  main.ts            入口：標題頁 → 免責聲明 → 設定 → 出身卡 → 遊戲 → 結局；VERSION 喺度
  engine/            純邏輯，唔掂 DOM，可以喺 Node 跑（sim 就係咁用）
    game.ts          Game class：狀態 s + 每年流程 startYear() / choose() / endYear()
    state.ts         State 型別（H 健康 J 快樂 K 知識 R 人際，F 財務健康，0–100）
    rng.ts           決定性隨機數：streamRng(seed, 名, key) 冇狀態，同 seed 必定同結果
    cards.ts         Card（抉擇卡）同 EventDef（事件定義）格式；mkCard()
    events.ts        抽事件演算法 + 一般事件 + 騙局 + 時代事件 + 天馬行空；ALL_EVENTS 喺度合併
    origin.ts        出身抽籤（地區、屋企、父母職業、名）
    education.ts     讀書、公開試出路、揀學系、碩士
    quiz.ts          突擊測驗同公開試（入大學機率喺 pUni / C_UNI）
    career.ts        搵工、加薪、升職、裁員、退休
    finance.ts       收支、投資、強積金、保險、寵物
    family.ts        父母、拍拖、結婚、生仔、子女、住屋、移民
    health.ts        疾病、意外、死亡判定
    hk.ts            香港日常事件（高空墮物、滲水、野豬、專科排期、搶飛、收樓執漏）
    midlife.ts       中年／晚年抉擇
    callbacks.ts     後果回馬槍（早年決定幾十年後先有結果）
    wishes.ts        18 歲心願清單
    tragedy.ts biz.ts rental.ts history.ts market.ts yearly.ts
    achievements.ts  成就清單同每年檢查
    ending.ts        結局計分（十項）、退休成績表、蜘蛛網圖
    agui.ts          「某某人」（有規劃嘅對照人物）同自動揀；playHeadless() 無畫面跑完一生
    parallel.ts      平行人生（同日出世嘅另外四個人）
    save.ts          存檔／讀檔
  ui/
    play.ts          主遊戲畫面（直向單手）
    ending.ts        結局各頁；SHOW_BOARD 開關排行榜
    scene.ts         160×64 像素場景同公仔
    emblem.ts        成就徽章；shareimg.ts 分享圖（1080×1350 PNG）
    store.ts         localStorage（key 前綴 7m:）
    style.css
  data/              職業表、經濟數據、出身表、題庫、成就稀有度
scripts/
  sim.ts             模擬統計；package.py 打包；make-release.py 出街檔；ach-rarity.ts 重算成就稀有度
```

### 每年流程（game.ts `startYear`）
① 歲數 +1 → ② 收支結算（事業、家庭、寵物）→ ③ 人生焦點同花錢面板效果 → ④ 自然變化 → ⑤ 抽事件（排隊做卡）→ 玩家逐張揀 → `endYear()` 計死亡、存紀錄、自動存檔。

### 加新事件
喺相關檔案加一個 `EventDef`：`{ id, pri, ages, once, cool, when: (g) => 今年機率, make: (g) => mkCard(...) }`，再確保佢喺 `events.ts` 嘅 `ALL_EVENTS` 入面。
- 非固定事件機率上限 0.95，而且同每年卡數上限競爭；一定要出嘅（例如公開試）要設 `fixed: true`。
- `mkCard` 每張卡最多 4 個選項。涉及錢嘅選項要用 `fmtMoney(g.p(金額))` 顯示（`g.p` 會按年份通脹調整，金額以 2026 港元寫）。
- 隨機一律用 `streamRng(s.seed, '事件名', key)` 或 `g.er()`，唔好用 `Math.random()`，否則存檔讀返會唔同。
- 加完跑 `npm run sim -- 1000 auto`、`def`、`agui` 確認錯誤 0，可以喺 `.sim/` 寫臨時統計腳本。

## 5. 必須遵守嘅規則（Harvey 定落）

**法律同品牌**
- 唔可以出現任何保險公司或者金融產品名。
- 改咗名嘅嘢唔可以用返原名：七百萬分之我（唔係 700萬分之一）、六星彩（六合彩）、保幼局（保良局）、公開試（DSE）、巨型充氣鴨仔（黃鴨）、獅子山上（獅子山下）。
- 保留免責字眼「內容為模擬，不構成投資建議」同完整免責聲明。
- 「點擊查詢更多」只顯示 IG @life_balance_adventure，冇電話；遊戲唔收集任何玩家資料。
- 唔好抄 1in8b.life 嘅程式碼。

**玩法**
- 每張卡最多 4 個選項。
- 投資／強積金設定只可以喺「理財」頁改。
- 角色名出世時隨機，唔可以改。
- 唔可以暗中提高財務損失事件嘅機率。專科排期揀公立或深圳有隱藏死亡風險（用家要求），卡上註明「可能延誤治療」。
- 天馬行空（離奇事件）全部加埋一生約 5%（`P_TIANMA_YEAR`），每局最多一次；隱藏結局只俾模糊提示，抽中機會一樣。
- 新年利是：兩成父母會收起永遠唔還（唔好改返）。
- 50 歲或以上唔會再問生唔生仔；45–49 歲每年 40%。
- 移民或者搬去大灣區唔會扣快樂。
- 另一半一定係異性（`makePartner`）。
- 公開試：8 題全對必入大學；第一次考大約 4 題 8%、5 題 22%、6 題 34%、7 題 62%。醫科、法律、藥劑要 8 題全對先揀得，7 題一半機會，6 題或以下唔得。
- 1% 貓叫「楊桃」，白底啡花，一定會變巨型貓。
- 排行榜（結局入暱稱同標題頁按鈕）暫時隱藏：`src/ui/ending.ts` 嘅 `SHOW_BOARD = false`，改 true 就返嚟。

**工作方式**
- 簡單改動唔使跑大量模擬，除非 Harvey 要求；改機率或者平衡就要跑。
- 每次出新版本：改 `main.ts` 嘅 `VERSION`，`npm run release`，再上載 `release/public/`。

## 6. 版本紀錄

| 版本 | 日期 | 重點 |
|---|---|---|
| v0.1–v0.5 | 10-18 | 可玩版本、直向單手介面、出身卡、測驗、寵物、救亡卡、評級、成就徽章 |
| v0.6–v0.9 | 10-18 | 人工調整、創業、破產結局、歷史改寫、平行人生、分享圖、利是、天馬行空結局、碩士同出國 |
| v1.0–v1.2 | 10-18 | 收租物業、自動答題、彩蛋貓、中晚年抉擇、某某人加強 |
| v1.3–v1.4 | 10-19 | 選項標價、20 倍速、自動答題要先自己考 6 題 |
| v1.5 | 10-19 | 自動存檔同「繼續上一局」 |
| v1.6 | 10-20 | 香港日常事件、18 歲心願清單、後果回馬槍 |
| v1.7 | 10-20 | 公開試入大學計法、專業學系限制、標題頁 IG 連結、隱藏排行榜 |

## 7. 未做／擱置嘅想法

Harvey 曾經考慮但未揀做：朋友挑戰連結、每日出身、報紙頭版、天生性格、小遊戲、「如果當年」重播、下一代繼承、出身稀有度、時間囊、香港節慶日常、伺服器排行榜、維港實景相（等授權）。

## 8. 交俾另一個 AI 嘅建議開場白

> 呢個係我嘅香港人生模擬網頁遊戲「七百萬分之我」，原始碼喺附件。請先讀 `HANDOFF.md`，特別係第 5 節嘅規則，全部要遵守。改完要跑 `npm run build` 同 `npm run sim -- 1000 auto` 確認冇錯誤，再用 `npm run release` 出 `release/public/index.html` 俾我上載 Netlify。
