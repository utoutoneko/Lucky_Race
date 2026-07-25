/* ==========================================================
   Lucky Race — script.js
   8種のゲーム + STORYモード + STAGEプリセット + ローカル記録(スコア = 確率×到達回数)
   ========================================================== */

(() => {
  "use strict";

  /* ---------------- storage helpers ---------------- */
  const LS = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    }
  };

  const RECORDS_KEY = "luckyrace_records_v2";
  const STORY_KEY = "luckyrace_story_progress_v1";
  const currentKey = (game, param) => `luckyrace_current_${game}_${param}`;
  const bestKey = (game, param) => `luckyrace_best_${game}_${param}`;

  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  /* ---------------- game data ---------------- */

  const DICE_FACES = [2, 4, 6, 8, 10, 12, 20, 50, 100];
  const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣", "🍀", "🍉", "🍇", "🍑", "🥝", "🍊"];
  const CARD_GLYPHS = ["♠A", "♥K", "♦Q", "♣J", "♠10", "♥9", "♦8", "♣7", "♠6", "♥5"];
  const HANDS = ["✊", "✋", "✌️"];

  // real-world reference odds (日本の主要な数字選択式宝くじ・公表値をもとにした概算)
  const LOTTERY_PRESETS = [
    { label: "ナンバーズ4(ストレート)", denom: 10000 },
    { label: "ミニロト 1等", denom: 169911 },
    { label: "ロト6 1等", denom: 6096454 },
    { label: "ロト7 1等", denom: 10295472 },
    { label: "年末ジャンボ 1等", denom: 20000000 }
  ];

  function genSecret(digits) {
    let s = "";
    for (let i = 0; i < digits; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function formatOdds(p) {
    const pct = p * 100;
    if (pct >= 1) return `${pct.toFixed(pct % 1 === 0 ? 0 : 2)}%`;
    return `${pct.toPrecision(2)}%`;
  }
  function formatFraction(p) {
    const denom = Math.round(1 / p);
    return `1 / ${denom.toLocaleString("ja-JP")}`;
  }
  function formatScore(score) {
    if (score >= 1) return score.toFixed(2);
    if (score >= 0.001) return score.toFixed(4);
    return score.toExponential(2);
  }

  /* ---------------- game definitions ---------------- */

  const GAMES = {
    coin: {
      label: "メダル", short: "MEDAL",
      min: 1, max: 10, step: 1, default: 3,
      valueLabel: v => `${v}枚`,
      subLabel: v => `メダル${v}枚を投げて、全部同じ面が出るまで`,
      probability: v => Math.pow(0.5, v),
      renderControls(v) {
        return controlRow("投げる枚数", v, this.min, this.max, this.step, this.valueLabel(v));
      },
      renderScene(v) {
        let html = `<div class="stage-scene" id="scene">`;
        for (let i = 0; i < v; i++) html += `<div class="coin" data-i="${i}">表</div>`;
        html += `</div>`;
        return html;
      },
      peek() { return Math.random() < 0.5 ? "表" : "裏"; },
      async animate(v, win) {
        const coins = document.querySelectorAll("#scene .coin");
        coins.forEach(c => c.classList.add("is-flipping"));
        await wait(550);
        coins.forEach(c => {
          c.classList.remove("is-flipping");
          c.textContent = win ? "表" : (Math.random() < 0.5 ? "表" : "裏");
        });
      }
    },

    dice: {
      label: "サイコロ", short: "DICE",
      min: 0, max: DICE_FACES.length - 1, step: 1, default: 2,
      valueLabel: idx => `${DICE_FACES[idx]}面`,
      subLabel: idx => `${DICE_FACES[idx]}面ダイスを振って、出目「1」を狙う`,
      probability: idx => 1 / DICE_FACES[idx],
      renderControls(v) {
        return controlRow("ダイスの面数", v, this.min, this.max, this.step, this.valueLabel(v));
      },
      renderScene() {
        return `<div class="stage-scene" id="scene"><div class="die" id="die">?</div></div>`;
      },
      peek(v) { return String(1 + Math.floor(Math.random() * DICE_FACES[v])); },
      async animate(v, win) {
        const die = document.getElementById("die");
        const faces = DICE_FACES[v];
        die.classList.add("is-rolling");
        const spin = setInterval(() => { die.textContent = String(1 + Math.floor(Math.random() * faces)); }, 45);
        await wait(560);
        clearInterval(spin);
        die.classList.remove("is-rolling");
        die.textContent = win ? "1" : String(2 + Math.floor(Math.random() * (faces - 1)));
      }
    },

    slot: {
      label: "スロット", short: "SLOT",
      min: 2, max: 12, step: 1, default: 5,
      valueLabel: v => `${v}種類`,
      subLabel: v => `絵柄${v}種類のリールが3つとも一致するまで`,
      probability: v => 1 / (v * v),
      renderControls(v) {
        return controlRow("絵柄の種類数", v, this.min, this.max, this.step, this.valueLabel(v));
      },
      renderScene(v) {
        return `<div class="stage-scene"><div class="slot-machine" id="scene">
          <div class="reel"><span class="reel-symbol">${SLOT_SYMBOLS[0]}</span></div>
          <div class="reel"><span class="reel-symbol">${SLOT_SYMBOLS[0]}</span></div>
          <div class="reel"><span class="reel-symbol">${SLOT_SYMBOLS[0]}</span></div>
        </div></div>`;
      },
      peek(v) { return SLOT_SYMBOLS[Math.floor(Math.random() * v)]; },
      async animate(v, win) {
        const reels = document.querySelectorAll("#scene .reel");
        const pool = SLOT_SYMBOLS.slice(0, v);
        reels.forEach(r => r.classList.add("is-spinning"));
        const timers = Array.from(reels).map(r => setInterval(() => {
          r.querySelector(".reel-symbol").textContent = pool[Math.floor(Math.random() * pool.length)];
        }, 55));
        await wait(750);
        timers.forEach(t => clearInterval(t));
        reels.forEach(r => r.classList.remove("is-spinning"));
        if (win) {
          const sym = pool[Math.floor(Math.random() * pool.length)];
          reels.forEach(r => r.querySelector(".reel-symbol").textContent = sym);
        } else {
          let vals;
          do { vals = Array.from(reels).map(() => pool[Math.floor(Math.random() * pool.length)]); }
          while (vals.every(x => x === vals[0]));
          reels.forEach((r, i) => r.querySelector(".reel-symbol").textContent = vals[i]);
        }
      }
    },

    password: {
      label: "数字パスワード", short: "DIGIT LOCK",
      min: 1, max: 6, step: 1, default: 3,
      valueLabel: v => `${v}桁`,
      subLabel: v => `${v}桁の暗証番号(0〜9)を、ランダムな入力で的中させる`,
      probability: v => Math.pow(0.1, v),
      renderControls(v) {
        return controlRow("桁数", v, this.min, this.max, this.step, this.valueLabel(v));
      },
      renderScene(v) {
        let html = `<div class="stage-scene"><div class="pass-lock" id="scene">`;
        for (let i = 0; i < v; i++) html += `<div class="pass-digit" data-i="${i}">0</div>`;
        html += `</div></div>`;
        return html;
      },
      peek(v) { let s = ""; for (let i = 0; i < v; i++) s += Math.floor(Math.random() * 10); return s; },
      async animate(v, win) {
        const digits = document.querySelectorAll("#scene .pass-digit");
        digits.forEach(d => d.classList.add("is-cycling"));
        const timers = Array.from(digits).map(d => setInterval(() => { d.textContent = Math.floor(Math.random() * 10); }, 40));
        await wait(500);
        timers.forEach(t => clearInterval(t));
        digits.forEach(d => d.classList.remove("is-cycling"));
        if (win) {
          const target = genSecret(v);
          [...target].forEach((ch, i) => { digits[i].textContent = ch; });
        } else {
          digits.forEach(d => d.textContent = Math.floor(Math.random() * 10));
        }
      }
    },

    card: {
      label: "トランプ", short: "CARD",
      min: 1, max: 26, step: 1, default: 4,
      valueLabel: v => `${v}枚/52枚`,
      subLabel: v => `52枚のデッキから引いて、${v}枚ある当たり札のどれかを引くまで`,
      probability: v => v / 52,
      renderControls(v) {
        return controlRow("当たり札の枚数", v, this.min, this.max, this.step, this.valueLabel(v));
      },
      renderScene() {
        return `<div class="stage-scene" id="scene"><div class="card-tile" id="cardtile">🂠</div></div>`;
      },
      peek() { return CARD_GLYPHS[Math.floor(Math.random() * CARD_GLYPHS.length)]; },
      async animate(v, win) {
        const tile = document.getElementById("cardtile");
        tile.classList.add("is-flipping");
        const t = setInterval(() => { tile.textContent = CARD_GLYPHS[Math.floor(Math.random() * CARD_GLYPHS.length)]; }, 55);
        await wait(520);
        clearInterval(t);
        tile.classList.remove("is-flipping");
        if (win) { tile.textContent = "★HIT★"; tile.classList.add("is-hit"); }
        else { tile.textContent = CARD_GLYPHS[Math.floor(Math.random() * CARD_GLYPHS.length)]; tile.classList.remove("is-hit"); }
      }
    },

    janken: {
      label: "じゃんけん", short: "WIN STREAK",
      min: 1, max: 8, step: 1, default: 2,
      valueLabel: v => `${v}連勝`,
      subLabel: v => `じゃんけんに${v}回連続で勝つまで(1回の勝率は1/3)`,
      probability: v => Math.pow(1 / 3, v),
      renderControls(v) {
        return controlRow("目標連勝数", v, this.min, this.max, this.step, this.valueLabel(v));
      },
      renderScene() {
        return `<div class="stage-scene" id="scene"><div class="hand-tile" id="handtile">✊</div></div>`;
      },
      peek() { return HANDS[Math.floor(Math.random() * 3)]; },
      async animate(v, win) {
        const tile = document.getElementById("handtile");
        tile.classList.add("is-flipping");
        const t = setInterval(() => { tile.textContent = HANDS[Math.floor(Math.random() * 3)]; }, 55);
        await wait(520);
        clearInterval(t);
        tile.classList.remove("is-flipping");
        tile.textContent = win ? "🏆" : HANDS[Math.floor(Math.random() * 3)];
        tile.classList.toggle("is-hit", win);
      }
    },

    roulette: {
      label: "ルーレット", short: "ROULETTE",
      min: 1, max: 36, step: 1, default: 3,
      valueLabel: v => `${v}点賭け`,
      subLabel: v => `ヨーロピアンルーレット(0〜36の37分の1)で、選んだ${v}個の数字のどれかに当たるまで`,
      probability: v => v / 37,
      renderControls(v) {
        return controlRow("賭ける数字の数", v, this.min, this.max, this.step, this.valueLabel(v));
      },
      renderScene() {
        return `<div class="stage-scene" id="scene"><div class="wheel-tile" id="wheeltile">?</div></div>`;
      },
      peek() { return String(Math.floor(Math.random() * 37)); },
      async animate(v, win) {
        const tile = document.getElementById("wheeltile");
        tile.classList.add("is-spinning-wheel");
        const t = setInterval(() => { tile.textContent = Math.floor(Math.random() * 37); }, 45);
        await wait(650);
        clearInterval(t);
        tile.classList.remove("is-spinning-wheel");
        if (win) { tile.textContent = "WIN"; tile.classList.add("is-hit"); }
        else { tile.textContent = String(Math.floor(Math.random() * 37)); tile.classList.remove("is-hit"); }
      }
    },

    lottery: {
      label: "宝くじ", short: "REAL ODDS",
      min: 0, max: LOTTERY_PRESETS.length - 1, step: 1, default: 0,
      valueLabel: idx => LOTTERY_PRESETS[idx].label,
      subLabel: idx => `現実の宝くじ「${LOTTERY_PRESETS[idx].label}」と同じ、1/${LOTTERY_PRESETS[idx].denom.toLocaleString("ja-JP")}の確率に挑む`,
      probability: idx => 1 / LOTTERY_PRESETS[idx].denom,
      renderControls(v) {
        const options = LOTTERY_PRESETS.map((p, i) =>
          `<option value="${i}" ${i === v ? "selected" : ""}>${p.label} (1/${p.denom.toLocaleString("ja-JP")})</option>`
        ).join("");
        return `<div class="param-row"><label for="param-slider">くじの種類</label>
          <select id="param-slider" class="param-select">${options}</select></div>`;
      },
      renderScene() {
        return `<div class="stage-scene" id="scene"><div class="ticket-tile" id="tickettile">🎫 ????</div></div>`;
      },
      peek() { return "🎫 " + String(Math.floor(Math.random() * 10000)).padStart(4, "0"); },
      async animate(v, win) {
        const tile = document.getElementById("tickettile");
        tile.classList.add("is-shimmer");
        const t = setInterval(() => { tile.textContent = "🎫 " + String(Math.floor(Math.random() * 10000)).padStart(4, "0"); }, 50);
        await wait(700);
        clearInterval(t);
        tile.classList.remove("is-shimmer");
        if (win) { tile.textContent = "🎉 当選 🎉"; tile.classList.add("is-hit"); }
        else { tile.textContent = "🎫 ハズレ"; tile.classList.remove("is-hit"); }
      }
    }
  };

  function controlRow(labelText, v, min, max, step, valueText) {
    return `
      <div class="param-row">
        <label for="param-slider">${labelText}</label>
        <input type="range" id="param-slider" class="param-slider" min="${min}" max="${max}" step="${step}" value="${v}">
        <span class="param-value" id="param-value">${valueText}</span>
      </div>`;
  }

  /* ---------------- STORY MODE ---------------- */

  const STORY_CHAPTERS = [
    { title: "序章:最初のコイン", flavor: "運命はいつも、単純な二択から始まる。裏か、表か。", game: "coin", param: 1 },
    { title: "第一章:三すくみの誓い", flavor: "じゃんけんの奥には、太古からの均衡がある。まずは一勝を掴め。", game: "janken", param: 1 },
    { title: "第二章:四枚の絵札", flavor: "スロットの絵柄が、静かに揃う瞬間を待て。", game: "slot", param: 2 },
    { title: "第三章:トランプの十二枚", flavor: "52枚の中の12枚。悪くない賭けだ。", game: "card", param: 12 },
    { title: "第四章:六面の運命", flavor: "サイコロは嘘をつかない。ただ、待たせるだけだ。", game: "dice", param: DICE_FACES.indexOf(6) },
    { title: "第五章:十分の一の扉", flavor: "扉の向こうに何があるかは、十回に一回しかわからない。", game: "dice", param: DICE_FACES.indexOf(10) },
    { title: "第六章:絵柄六種の罠", flavor: "種類が増えるほど、揃う奇跡は遠くなる。", game: "slot", param: 4 },
    { title: "第七章:ルーレットの一点賭け", flavor: "37分の1に、全てを賭ける夜。", game: "roulette", param: 1 },
    { title: "第八章:百人に一人", flavor: "2桁のパスワード。当てられるのは、百人に一人。", game: "password", param: 2 },
    { title: "第九章:千に一つの覚悟", flavor: "3桁の数字が並ぶ確率は、もはや偶然と呼べない。", game: "password", param: 3 },
    { title: "第十章:万分の一のナンバーズ", flavor: "現実の宝くじ「ナンバーズ4」のストレートと同じ、1万分の1に挑む。", game: "lottery", param: 0 },
    { title: "最終章:六百万分の一、運の果てへ", flavor: "現実の宝くじ「ロト6」1等と同じ確率。ここが、Lucky Raceの終着点。", game: "lottery", param: 2 }
  ];

  function getStoryProgress() { return LS.get(STORY_KEY, 0); }
  function setStoryProgress(n) { LS.set(STORY_KEY, n); }

  /* ---------------- STAGE presets ---------------- */

  function dailyPick() {
    const today = new Date();
    const seed = today.getFullYear() * 372 + (today.getMonth() + 1) * 31 + today.getDate();
    const digits = 2 + (seed % 4);
    return { game: "password", v: digits, label: `本日の運試し — 数字パスワード ${digits}桁` };
  }

  const STAGES = [
    {
      name: "STAGE 01 — Basic Luck", tags: ["50%", "10%", "1%"],
      desc: "確率レースの入り口。まずは体で確率の重みを覚える。",
      picks: [
        { game: "coin", v: 1, label: "メダル 1枚 (50%)" },
        { game: "dice", v: DICE_FACES.indexOf(10), label: "サイコロ 10面 (10%)" },
        { game: "dice", v: DICE_FACES.indexOf(100), label: "サイコロ 100面 (1%)" }
      ]
    },
    {
      name: "STAGE 02 — Deep Luck", tags: ["5%", "1%", "0.1%"],
      desc: "少しずつ本気を出すゾーン。オート回転が欲しくなる頃合い。",
      picks: [
        { game: "slot", v: 4, label: "スロット 4種 (6.25%≈5%)" },
        { game: "password", v: 2, label: "数字パスワード 2桁 (1%)" },
        { game: "password", v: 3, label: "数字パスワード 3桁 (0.1%)" }
      ]
    },
    {
      name: "STAGE 03 — Hell Luck", tags: ["0.1%", "0.01%", "0.001%"],
      desc: "覚悟が要る確率帯。オート回転・高速設定を推奨。",
      picks: [
        { game: "coin", v: 10, label: "メダル 10枚 (0.098%≈0.1%)" },
        { game: "password", v: 4, label: "数字パスワード 4桁 (0.01%)" },
        { game: "slot", v: 12, label: "スロット 12種 (0.0069%)" }
      ]
    },
    {
      name: "STAGE 04 — Daily Luck", tags: ["毎日変動"],
      desc: "今日の日付から確率が決まる、その日限りの一本勝負。",
      picks: [dailyPick()]
    },
    {
      name: "STAGE 05 — Jackpot Luck", tags: ["現実の確率"],
      desc: "実在する宝くじの当選確率を、そのまま体験する現実参照ステージ。",
      picks: [
        { game: "lottery", v: 0, label: "ナンバーズ4 (1/10,000)" },
        { game: "lottery", v: 1, label: "ミニロト1等 (1/169,911)" },
        { game: "lottery", v: 2, label: "ロト6 1等 (1/6,096,454)" },
        { game: "lottery", v: 3, label: "ロト7 1等 (1/10,295,472)" },
        { game: "lottery", v: 4, label: "年末ジャンボ1等 (約1/20,000,000)" }
      ]
    }
  ];

  /* ---------------- state ---------------- */

  const state = {
    game: "coin",
    param: { coin: GAMES.coin.default, dice: GAMES.dice.default, slot: GAMES.slot.default, password: GAMES.password.default,
             card: GAMES.card.default, janken: GAMES.janken.default, roulette: GAMES.roulette.default, lottery: GAMES.lottery.default },
    attempts: 0,
    auto: false,
    autoSpeed: 2,
    busy: false,
    story: { active: null }
  };

  /* ---------------- DOM refs ---------------- */

  const $ = sel => document.querySelector(sel);
  const gameStageEl = $("#game-stage");
  const attemptCountEl = $("#attempt-count");
  const currentOddsEl = $("#current-odds");
  const bestCountEl = $("#best-count");
  const runnerEl = $("#runner");
  const burstEl = $("#track-burst");
  const resultBanner = $("#result-banner");
  const btnDraw = $("#btn-draw");
  const btnAuto = $("#btn-auto");
  const btnReset = $("#btn-reset");
  const autoSpeedInput = $("#auto-speed");
  const autoSpeedLabel = $("#auto-speed-label");
  const livePeek = $("#live-peek");
  const liveSymbol = $("#live-symbol");

  const SPEED_LABELS = { 1: "低速", 2: "標準", 3: "高速", 4: "瞬間" };
  // 速度ごとの「完了までの目標フレーム数」。probabilityがどれほど小さくても
  // 待ち時間が青天井にならないよう、毎フレーム必ず表示を更新しながらバッチ数を調整する。
  const TARGET_FRAMES = { 1: 2700, 2: 900, 3: 300, 4: 90 };

  function computeBatch(expected, speed) {
    return Math.max(1, Math.round(expected / TARGET_FRAMES[speed]));
  }

  /* ---------------- config key / persistence ---------------- */

  function probabilityOf(game, param) { return GAMES[game].probability(param); }
  function loadAttempts(game, param) { return LS.get(currentKey(game, param), 0); }
  function saveAttempts(game, param, n) { LS.set(currentKey(game, param), n); }
  function loadBest(game, param) { return LS.get(bestKey(game, param), null); }
  function saveBest(game, param, n) { LS.set(bestKey(game, param), n); }

  /* ---------------- rendering: game stage ---------------- */

  function renderGameStage() {
    const game = state.game;
    const def = GAMES[game];
    const v = state.param[game];
    const p = probabilityOf(game, v);

    const storyBanner = state.story.active !== null ? `
      <div class="story-ribbon">
        <span class="story-ribbon-label">STORY ${String(state.story.active + 1).padStart(2, "0")}</span>
        <span class="story-ribbon-title">${STORY_CHAPTERS[state.story.active].title}</span>
        <button class="btn btn-ghost btn-small" id="btn-exit-story">ストーリーを抜ける</button>
      </div>` : "";

    gameStageEl.innerHTML = `
      ${storyBanner}
      <div class="stage-head">
        <div>
          <p class="stage-title">${def.label}</p>
          <p class="stage-sub" id="stage-sub">${def.subLabel(v)}</p>
        </div>
      </div>
      ${def.renderControls(v)}
      ${def.renderScene(v)}
      <div class="alt-row" id="alt-row"></div>
    `;

    $("#btn-exit-story")?.addEventListener("click", () => {
      state.story.active = null;
      renderGameStage();
    });

    renderAlternatives(game, p);
    bindParamControl(def, game);

    state.attempts = loadAttempts(game, v);
    refreshReadout();
    resetTrack();
    livePeek.hidden = true;
  }

  function bindParamControl(def, game) {
    const ctrl = $("#param-slider");
    const handler = () => {
      const val = Number(ctrl.value);
      state.param[game] = val;
      $("#param-value").textContent = def.valueLabel(val);
      $("#stage-sub").textContent = def.subLabel(val);
      gameStageEl.querySelector(".stage-scene")?.remove();
      $("#alt-row").insertAdjacentHTML("beforebegin", def.renderScene(val));
      state.attempts = loadAttempts(game, val);
      refreshReadout();
      renderAlternatives(game, probabilityOf(game, val));
      resetTrack();
    };
    ctrl.addEventListener("input", handler);
    ctrl.addEventListener("change", handler);
  }

  function renderAlternatives(game, p) {
    const altRow = $("#alt-row");
    if (!altRow) return;
    const matches = [];
    Object.keys(GAMES).forEach(g => {
      if (g === game) return;
      const def = GAMES[g];
      for (let v = def.min; v <= def.max; v += def.step) {
        const pp = def.probability(v);
        const ratio = pp / p;
        if (ratio > 0.85 && ratio < 1.18) {
          matches.push({ game: g, v, label: `${def.label} ${def.valueLabel(v)}` });
          break;
        }
      }
    });
    if (matches.length === 0) { altRow.innerHTML = ""; return; }
    altRow.innerHTML = `<span class="alt-label">同じ確率で遊べる:</span>` +
      matches.slice(0, 4).map(m => `<button class="alt-chip" data-game="${m.game}" data-v="${m.v}">${m.label}</button>`).join("");
    altRow.querySelectorAll(".alt-chip").forEach(chip => {
      chip.addEventListener("click", () => selectGame(chip.dataset.game, Number(chip.dataset.v)));
    });
  }

  function refreshReadout() {
    const game = state.game, v = state.param[game];
    const p = probabilityOf(game, v);
    attemptCountEl.textContent = state.attempts.toLocaleString("ja-JP");
    currentOddsEl.textContent = `${formatFraction(p)} (${formatOdds(p)})`;
    const best = loadBest(game, v);
    bestCountEl.textContent = best ? best.toLocaleString("ja-JP") : "—";
  }

  function bump(el) { el.classList.remove("is-bump"); void el.offsetWidth; el.classList.add("is-bump"); }

  /* ---------------- track visualization ---------------- */

  function resetTrack() {
    runnerEl.style.left = "2%";
    runnerEl.classList.remove("is-rolling");
  }

  function updateTrackProgress() {
    const game = state.game, v = state.param[game];
    const p = probabilityOf(game, v);
    const expected = 1 / p;
    const progress = Math.min(0.9, 1 - Math.exp(-state.attempts / expected));
    runnerEl.style.left = `${2 + progress * 88}%`;
  }

  function burstAtFinish() {
    for (let i = 0; i < 22; i++) {
      const s = document.createElement("div");
      s.className = "spark";
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      s.style.left = runnerEl.style.left;
      s.style.top = "50%";
      burstEl.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  }

  /* ---------------- story helpers ---------------- */

  function handleStoryWinCheck(game, v) {
    if (state.story.active === null) return null;
    const chapterIdx = state.story.active;
    const c = STORY_CHAPTERS[chapterIdx];
    if (c.game !== game || c.param !== v) return null;
    const progress = getStoryProgress();
    if (chapterIdx !== progress) return null;
    setStoryProgress(progress + 1);
    state.story.active = null;
    const next = STORY_CHAPTERS[progress + 1] || null;
    return { clearedTitle: c.title, next, nextIdx: progress + 1 };
  }

  /* ---------------- draw logic ---------------- */

  async function drawOnce() {
    const game = state.game, v = state.param[game];
    const def = GAMES[game];
    const p = probabilityOf(game, v);

    state.attempts += 1;
    const win = Math.random() < p;

    await def.animate(v, win);

    saveAttempts(game, v, win ? 0 : state.attempts);
    bump(attemptCountEl);
    attemptCountEl.textContent = state.attempts.toLocaleString("ja-JP");
    updateTrackProgress();

    if (win) {
      runnerEl.style.left = "90%";
      burstAtFinish();
      const best = loadBest(game, v);
      const isNewBest = !best || state.attempts < best;
      if (isNewBest) saveBest(game, v, state.attempts);
      pushRecord(game, v, p, state.attempts);
      const storyResult = handleStoryWinCheck(game, v);
      showResult(true, state.attempts, isNewBest, storyResult);
      state.attempts = 0;
      refreshReadout();
      setTimeout(() => {
        resetTrack();
        if (storyResult) renderGameStage();
      }, 700);
      return true;
    } else {
      showResult(false, state.attempts, false, null);
      return false;
    }
  }

  function showResult(win, attempts, isNewBest, storyResult) {
    resultBanner.classList.remove("win", "lose", "show");
    void resultBanner.offsetWidth;
    resultBanner.classList.add("show", win ? "win" : "lose");

    if (win) {
      const def = GAMES[state.game];
      const v = state.param[state.game];
      const p = probabilityOf(state.game, v);
      const shareText = `Lucky Race — ${def.label}(${def.valueLabel(v)} / ${formatOdds(p)})を${attempts.toLocaleString("ja-JP")}回で引いた${isNewBest ? "🏆自己ベスト更新！" : ""}`;
      let html = `🎉 的中！ ${attempts.toLocaleString("ja-JP")}回で成功しました。${isNewBest ? "<strong>自己ベスト更新！</strong>" : ""}
        <button class="btn btn-ghost btn-small" id="btn-copy-result">結果をコピー</button>`;
      if (storyResult) {
        html += `<div class="story-clear">📖 「${storyResult.clearedTitle}」クリア！` +
          (storyResult.next
            ? ` 次は「${storyResult.next.title}」が解放されました。<button class="btn btn-secondary btn-small" id="btn-next-chapter">次の章へ</button>`
            : ` おめでとうございます、Lucky Raceを完全制覇しました。`) +
          `</div>`;
      }
      resultBanner.innerHTML = html;
      $("#btn-copy-result")?.addEventListener("click", () => {
        navigator.clipboard?.writeText(shareText).then(() => {
          const b = $("#btn-copy-result"); if (b) b.textContent = "コピーしました";
        }).catch(() => {});
      });
      if (storyResult && storyResult.next) {
        $("#btn-next-chapter")?.addEventListener("click", () => startStoryChapter(storyResult.nextIdx));
      }
    } else {
      resultBanner.textContent = `外れ… 現在 ${attempts.toLocaleString("ja-JP")} 回目。あと1回で出るかもしれません。`;
    }
  }

  function pushRecord(game, param, probability, attempts) {
    const score = probability * attempts;
    const list = LS.get(RECORDS_KEY, []);
    list.unshift({
      game, param,
      gameLabel: GAMES[game].label,
      paramLabel: GAMES[game].valueLabel(param),
      probability, attempts, score,
      date: new Date().toISOString()
    });
    if (list.length > 300) list.length = 300;
    LS.set(RECORDS_KEY, list);
  }

  /* ---------------- manual draw button ---------------- */

  btnDraw.addEventListener("click", async () => {
    if (state.busy || state.auto) return;
    state.busy = true;
    btnDraw.disabled = true;
    await drawOnce();
    btnDraw.disabled = false;
    state.busy = false;
  });

  btnReset.addEventListener("click", () => {
    const game = state.game, v = state.param[game];
    state.attempts = 0;
    saveAttempts(game, v, 0);
    refreshReadout();
    resetTrack();
    resultBanner.classList.remove("show", "win", "lose");
  });

  /* ---------------- auto play (no-skip: 毎フレーム表示を更新し、当たったら即停止) ---------------- */

  let autoRafId = null;

  function startAuto() {
    state.auto = true;
    btnAuto.classList.add("is-active");
    btnAuto.querySelector(".btn-label").textContent = "オート停止 ■";
    btnDraw.disabled = true;
    livePeek.hidden = false;
    autoStep();
  }

  function stopAuto() {
    state.auto = false;
    btnAuto.classList.remove("is-active");
    btnAuto.querySelector(".btn-label").textContent = "オート回転 ▶";
    btnDraw.disabled = false;
    runnerEl.classList.remove("is-rolling");
    livePeek.hidden = true;
    if (autoRafId) cancelAnimationFrame(autoRafId);
    autoRafId = null;
  }

  function autoStep() {
    if (!state.auto) return;
    const game = state.game, v = state.param[game];
    const def = GAMES[game];
    const p = probabilityOf(game, v);
    const expected = 1 / p;
    const batch = computeBatch(expected, state.autoSpeed);

    let winFound = false;
    for (let i = 0; i < batch; i++) {
      state.attempts += 1;
      if (Math.random() < p) { winFound = true; break; }
    }

    // 毎フレーム必ず更新する(スロットリングしない = 「スキップしない」体感)
    attemptCountEl.textContent = state.attempts.toLocaleString("ja-JP");
    updateTrackProgress();
    liveSymbol.textContent = def.peek(v);
    runnerEl.classList.add("is-rolling");

    if (winFound) {
      saveAttempts(game, v, 0);
      const best = loadBest(game, v);
      const isNewBest = !best || state.attempts < best;
      if (isNewBest) saveBest(game, v, state.attempts);
      pushRecord(game, v, p, state.attempts);
      const storyResult = handleStoryWinCheck(game, v);

      runnerEl.classList.remove("is-rolling");
      runnerEl.style.left = "90%";
      burstAtFinish();

      def.animate(v, true).then(() => {
        showResult(true, state.attempts, isNewBest, storyResult);
        state.attempts = 0;
        refreshReadout();
        resetTrack();
        if (storyResult) renderGameStage();
        stopAuto(); // 当たったら自動で停止する
      });
      return;
    }

    saveAttempts(game, v, state.attempts);
    autoRafId = requestAnimationFrame(autoStep);
  }

  btnAuto.addEventListener("click", () => { state.auto ? stopAuto() : startAuto(); });

  autoSpeedInput.addEventListener("input", () => {
    state.autoSpeed = Number(autoSpeedInput.value);
    autoSpeedLabel.textContent = SPEED_LABELS[state.autoSpeed];
  });
  autoSpeedLabel.textContent = SPEED_LABELS[state.autoSpeed];

  /* ---------------- game selection ---------------- */

  function selectGame(game, param, fromStory = false) {
    stopAuto();
    if (!fromStory) state.story.active = null;
    state.game = game;
    if (param !== undefined) state.param[game] = param;
    document.querySelectorAll(".game-card").forEach(c => {
      const active = c.dataset.game === game;
      c.classList.toggle("is-active", active);
      c.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderGameStage();
    switchView("play");
  }

  document.querySelectorAll(".game-card").forEach(card => {
    card.addEventListener("click", () => selectGame(card.dataset.game));
  });

  function startStoryChapter(idx) {
    const c = STORY_CHAPTERS[idx];
    state.story.active = idx;
    selectGame(c.game, c.param, true);
  }

  /* ---------------- main nav / view switching ---------------- */

  function switchView(view) {
    document.querySelectorAll(".nav-btn").forEach(b => {
      const active = b.dataset.view === view;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach(v => v.classList.remove("is-active"));
    document.getElementById(`view-${view}`).classList.add("is-active");
    if (view === "ranking") renderRanking();
    if (view === "story") renderStoryView();
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => { stopAuto(); switchView(btn.dataset.view); });
  });

  /* ---------------- STAGE view ---------------- */

  function renderStages() {
    const grid = $("#stage-grid");
    grid.innerHTML = STAGES.map((s, idx) => `
      <div class="stage-card" data-index="${String(idx + 1).padStart(2, "0")}">
        <h3>${s.name}</h3>
        <p>${s.desc}</p>
        <div class="stage-tags">${s.tags.map(t => `<span class="stage-tag">${t}</span>`).join("")}</div>
        <div class="stage-picks">
          ${s.picks.map((p, pi) => `<button class="btn btn-secondary btn-small stage-pick" data-idx="${idx}" data-pi="${pi}" style="margin:4px 6px 0 0;">${p.label}</button>`).join("")}
        </div>
      </div>
    `).join("");

    grid.querySelectorAll(".stage-pick").forEach(btn => {
      btn.addEventListener("click", () => {
        const s = STAGES[Number(btn.dataset.idx)];
        const pick = s.picks[Number(btn.dataset.pi)];
        selectGame(pick.game, pick.v);
      });
    });
  }

  /* ---------------- STORY view ---------------- */

  function renderStoryView() {
    const progress = getStoryProgress();
    const grid = $("#story-grid");
    grid.innerHTML = STORY_CHAPTERS.map((c, i) => {
      const cleared = i < progress;
      const unlocked = i <= progress;
      const def = GAMES[c.game];
      const p = def.probability(c.param);
      return `
        <div class="story-card ${cleared ? "is-cleared" : ""} ${!unlocked ? "is-locked" : ""}">
          <span class="story-index">CHAPTER ${String(i + 1).padStart(2, "0")}</span>
          <h3>${unlocked ? c.title : "??? — 未解放の章"}</h3>
          <p class="story-flavor">${unlocked ? c.flavor : "前の章をクリアすると、ここに物語が現れる。"}</p>
          ${unlocked ? `<div class="story-meta"><span class="stage-tag">${def.label}</span><span class="stage-tag">${formatOdds(p)}</span></div>` : ""}
          ${unlocked
            ? `<button class="btn btn-secondary btn-small story-play" data-idx="${i}">${cleared ? "再挑戦する" : "挑戦する"}</button>`
            : `<span class="story-lock">🔒 未解放</span>`}
        </div>`;
    }).join("");

    grid.querySelectorAll(".story-play").forEach(btn => {
      btn.addEventListener("click", () => startStoryChapter(Number(btn.dataset.idx)));
    });
  }

  /* ---------------- RANKING ---------------- */

  const rankingFilter = $("#ranking-filter");
  const rankingSort = $("#ranking-sort");
  const rankingBody = $("#ranking-body");
  const rankingTable = $("#ranking-table");
  const rankingEmpty = $("#ranking-empty");

  function renderRanking() {
    let list = LS.get(RECORDS_KEY, []);
    const filter = rankingFilter.value;
    if (filter !== "all") list = list.filter(r => r.game === filter);

    list = rankingSort.value === "score"
      ? [...list].sort((a, b) => a.score - b.score)
      : [...list].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (list.length === 0) {
      rankingTable.classList.add("hide");
      rankingEmpty.classList.add("show");
      return;
    }
    rankingTable.classList.remove("hide");
    rankingEmpty.classList.remove("show");

    rankingBody.innerHTML = list.slice(0, 100).map((r, i) => `
      <tr>
        <td class="rank-num">${i + 1}</td>
        <td>${r.gameLabel}</td>
        <td>${r.paramLabel}</td>
        <td class="mono">${formatOdds(r.probability)}</td>
        <td class="rank-count mono">${r.attempts.toLocaleString("ja-JP")}</td>
        <td class="mono score-cell">${formatScore(r.score)}</td>
        <td class="mono">${new Date(r.date).toLocaleDateString("ja-JP")}</td>
      </tr>
    `).join("");
  }

  rankingFilter.addEventListener("change", renderRanking);
  rankingSort.addEventListener("change", renderRanking);
  $("#btn-clear-ranking").addEventListener("click", () => {
    if (confirm("すべての記録を消去します。よろしいですか？")) {
      LS.set(RECORDS_KEY, []);
      renderRanking();
    }
  });

  /* ---------------- init ---------------- */

  document.getElementById("year").textContent = new Date().getFullYear();
  renderStages();
  renderGameStage();
  switchView("play");

})();
