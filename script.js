/* ==========================================================
   Lucky Race — script.js
   4種のゲーム(メダル/サイコロ/スロット/数字パスワード)+ STAGEプリセット + ローカル記録(ランキング)
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

  const RECORDS_KEY = "luckyrace_records_v1";
  const currentKey = (game, param) => `luckyrace_current_${game}_${param}`;
  const bestKey = (game, param) => `luckyrace_best_${game}_${param}`;

  /* ---------------- game definitions ---------------- */

  const DICE_FACES = [2, 4, 6, 8, 10, 12, 20, 50, 100];
  const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣", "🍀", "🍉", "🍇", "🍑", "🥝", "🍊"];

  const GAMES = {
    coin: {
      label: "メダル", short: "MEDAL",
      min: 1, max: 10, step: 1, default: 3,
      valueLabel: v => `${v}枚`,
      subLabel: v => `メダル${v}枚を投げて、全部同じ面が出るまで`,
      probability: v => Math.pow(0.5, v),
      renderControls(v) {
        return `
          <div class="param-row">
            <label for="param-slider">投げる枚数</label>
            <input type="range" id="param-slider" class="param-slider" min="${this.min}" max="${this.max}" step="${this.step}" value="${v}">
            <span class="param-value" id="param-value">${this.valueLabel(v)}</span>
          </div>`;
      },
      renderScene(v) {
        let html = `<div class="stage-scene" id="scene">`;
        for (let i = 0; i < v; i++) html += `<div class="coin" data-i="${i}">表</div>`;
        html += `</div>`;
        return html;
      },
      async animate(v, win) {
        const coins = document.querySelectorAll("#scene .coin");
        coins.forEach(c => c.classList.add("is-flipping"));
        await wait(550);
        coins.forEach((c, i) => {
          c.classList.remove("is-flipping");
          if (win) { c.textContent = "表"; }
          else { c.textContent = Math.random() < 0.5 ? "表" : "裏"; }
        });
      }
    },

    dice: {
      label: "サイコロ", short: "DICE",
      min: 0, max: DICE_FACES.length - 1, step: 1, default: 2, // index into DICE_FACES
      valueLabel: idx => `${DICE_FACES[idx]}面`,
      subLabel: idx => `${DICE_FACES[idx]}面ダイスを振って、出目「1」を狙う`,
      probability: idx => 1 / DICE_FACES[idx],
      renderControls(v) {
        return `
          <div class="param-row">
            <label for="param-slider">ダイスの面数</label>
            <input type="range" id="param-slider" class="param-slider" min="${this.min}" max="${this.max}" step="${this.step}" value="${v}">
            <span class="param-value" id="param-value">${this.valueLabel(v)}</span>
          </div>`;
      },
      renderScene() {
        return `<div class="stage-scene" id="scene"><div class="die" id="die">?</div></div>`;
      },
      async animate(v, win) {
        const die = document.getElementById("die");
        const faces = DICE_FACES[v];
        die.classList.add("is-rolling");
        let ticks = 0;
        const spin = setInterval(() => {
          die.textContent = String(1 + Math.floor(Math.random() * faces));
          ticks++;
        }, 45);
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
        return `
          <div class="param-row">
            <label for="param-slider">絵柄の種類数</label>
            <input type="range" id="param-slider" class="param-slider" min="${this.min}" max="${this.max}" step="${this.step}" value="${v}">
            <span class="param-value" id="param-value">${this.valueLabel(v)}</span>
          </div>`;
      },
      renderScene(v) {
        return `<div class="stage-scene"><div class="slot-machine" id="scene">
          <div class="reel"><span class="reel-symbol">${SLOT_SYMBOLS[0]}</span></div>
          <div class="reel"><span class="reel-symbol">${SLOT_SYMBOLS[0]}</span></div>
          <div class="reel"><span class="reel-symbol">${SLOT_SYMBOLS[0]}</span></div>
        </div></div>`;
      },
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
          do {
            vals = reels.map(() => pool[Math.floor(Math.random() * pool.length)]);
          } while (vals.every(x => x === vals[0]));
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
        return `
          <div class="param-row">
            <label for="param-slider">桁数</label>
            <input type="range" id="param-slider" class="param-slider" min="${this.min}" max="${this.max}" step="${this.step}" value="${v}">
            <span class="param-value" id="param-value">${this.valueLabel(v)}</span>
          </div>`;
      },
      renderScene(v) {
        let html = `<div class="stage-scene"><div class="pass-lock" id="scene">`;
        for (let i = 0; i < v; i++) html += `<div class="pass-digit" data-i="${i}">0</div>`;
        html += `</div></div>`;
        return html;
      },
      async animate(v, win) {
        const digits = document.querySelectorAll("#scene .pass-digit");
        digits.forEach(d => d.classList.add("is-cycling"));
        const timers = Array.from(digits).map(d => setInterval(() => {
          d.textContent = Math.floor(Math.random() * 10);
        }, 40));
        await wait(500);
        timers.forEach(t => clearInterval(t));
        digits.forEach(d => d.classList.remove("is-cycling"));
        if (win) {
          const target = state.secret[state.game] || genSecret(v);
          [...String(target)].forEach((ch, i) => { digits[i].textContent = ch; });
        } else {
          digits.forEach(d => d.textContent = Math.floor(Math.random() * 10));
        }
      }
    }
  };

  function genSecret(digits) {
    let s = "";
    for (let i = 0; i < digits; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  function formatOdds(p) {
    if (p >= 0.0001) {
      const pct = p * 100;
      const pctStr = pct >= 1 ? pct.toFixed(pct % 1 === 0 ? 0 : 2) : pct.toPrecision(2);
      return `${pctStr}%`;
    }
    return `${(p * 100).toPrecision(2)}%`;
  }
  function formatFraction(p) {
    const denom = Math.round(1 / p);
    return `1 / ${denom.toLocaleString("ja-JP")}`;
  }

  /* ---------------- state ---------------- */

  const state = {
    game: "coin",
    param: { coin: GAMES.coin.default, dice: GAMES.dice.default, slot: GAMES.slot.default, password: GAMES.password.default },
    attempts: 0,
    auto: false,
    autoSpeed: 2,
    busy: false,
    secret: {}
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

  const SPEED_LABELS = { 1: "低速", 2: "標準", 3: "高速", 4: "瞬間" };
  const SPEED_BATCH = { 1: 15, 2: 120, 3: 900, 4: 8000 };

  /* ---------------- config key / persistence ---------------- */

  function paramOf(game) { return state.param[game]; }
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

    if (game === "password" && state.secret[game] === undefined) {
      state.secret[game] = genSecret(v);
    }

    gameStageEl.innerHTML = `
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

    renderAlternatives(game, p);

    const slider = $("#param-slider");
    slider.addEventListener("input", () => {
      const val = Number(slider.value);
      state.param[game] = val;
      if (game === "password") state.secret[game] = genSecret(val);
      $("#param-value").textContent = def.valueLabel(val);
      $("#stage-sub").textContent = def.subLabel(val);
      gameStageEl.querySelector(".stage-scene")?.remove();
      const wrapHTML = def.renderScene(val);
      $("#alt-row").insertAdjacentHTML("beforebegin", wrapHTML);
      state.attempts = loadAttempts(game, val);
      refreshReadout();
      renderAlternatives(game, probabilityOf(game, val));
      resetTrack(false);
    });

    state.attempts = loadAttempts(game, v);
    refreshReadout();
    resetTrack(false);
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
      matches.map(m => `<button class="alt-chip" data-game="${m.game}" data-v="${m.v}">${m.label}</button>`).join("");
    altRow.querySelectorAll(".alt-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        selectGame(chip.dataset.game, Number(chip.dataset.v));
      });
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

  function bump(el) {
    el.classList.remove("is-bump"); void el.offsetWidth; el.classList.add("is-bump");
  }

  /* ---------------- track visualization ---------------- */

  function resetTrack(animated) {
    runnerEl.style.left = "2%";
    runnerEl.classList.remove("is-rolling");
    if (!animated) return;
  }

  function updateTrackProgress() {
    const game = state.game, v = state.param[game];
    const p = probabilityOf(game, v);
    const expected = 1 / p;
    const progress = Math.min(0.9, 1 - Math.exp(-state.attempts / expected));
    runnerEl.style.left = `${2 + progress * 88}%`;
  }

  function burstAtFinish() {
    for (let i = 0; i < 18; i++) {
      const s = document.createElement("div");
      s.className = "spark";
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 60;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      s.style.left = runnerEl.style.left;
      s.style.top = "50%";
      burstEl.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
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
      showResult(true, game, v, p, state.attempts, isNewBest);
      state.attempts = 0;
      if (game === "password") state.secret[game] = genSecret(v);
      setTimeout(() => resetTrack(false), 700);
      refreshReadout();
      return true;
    } else {
      showResult(false, game, v, p, state.attempts, false);
      return false;
    }
  }

  function showResult(win, game, v, p, attempts, isNewBest) {
    const def = GAMES[game];
    resultBanner.classList.remove("win", "lose", "show");
    void resultBanner.offsetWidth;
    resultBanner.classList.add("show", win ? "win" : "lose");
    if (win) {
      const shareText = `Lucky Race — ${def.label}(${def.valueLabel(v)} / ${formatOdds(p)})を${attempts.toLocaleString("ja-JP")}回で引いた${isNewBest ? "🏆自己ベスト更新！" : ""}`;
      resultBanner.innerHTML = `🎉 的中！ ${attempts.toLocaleString("ja-JP")}回で成功しました。${isNewBest ? "<strong>自己ベスト更新！</strong>" : ""}
        <button class="btn btn-ghost btn-small" id="btn-copy-result">結果をコピー</button>`;
      $("#btn-copy-result")?.addEventListener("click", () => {
        navigator.clipboard?.writeText(shareText).then(() => {
          const b = $("#btn-copy-result");
          if (b) b.textContent = "コピーしました";
        }).catch(() => {});
      });
    } else {
      resultBanner.textContent = `外れ… 現在 ${attempts.toLocaleString("ja-JP")} 回目。あと1回で出るかもしれません。`;
    }
  }

  function pushRecord(game, param, probability, attempts) {
    const list = LS.get(RECORDS_KEY, []);
    list.unshift({
      game, param,
      gameLabel: GAMES[game].label,
      paramLabel: GAMES[game].valueLabel(param),
      probability, attempts,
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
    resetTrack(false);
    resultBanner.classList.remove("show", "win", "lose");
  });

  /* ---------------- auto play ---------------- */

  let autoRafId = null;
  let autoLastDomUpdate = 0;

  function startAuto() {
    state.auto = true;
    btnAuto.classList.add("is-active");
    btnAuto.querySelector(".btn-label").textContent = "オート停止 ■";
    btnDraw.disabled = true;
    autoStep();
  }

  function stopAuto() {
    state.auto = false;
    btnAuto.classList.remove("is-active");
    btnAuto.querySelector(".btn-label").textContent = "オート回転 ▶";
    btnDraw.disabled = false;
    runnerEl.classList.remove("is-rolling");
    if (autoRafId) cancelAnimationFrame(autoRafId);
    autoRafId = null;
  }

  function autoStep() {
    if (!state.auto) return;
    const game = state.game, v = state.param[game];
    const def = GAMES[game];
    const p = probabilityOf(game, v);
    const batch = SPEED_BATCH[state.autoSpeed];

    let winFound = false;
    let i = 0;
    for (; i < batch; i++) {
      state.attempts += 1;
      if (Math.random() < p) { winFound = true; break; }
    }

    const now = performance.now();
    if (now - autoLastDomUpdate > 60 || winFound) {
      attemptCountEl.textContent = state.attempts.toLocaleString("ja-JP");
      updateTrackProgress();
      autoLastDomUpdate = now;
    }
    runnerEl.classList.add("is-rolling");

    if (winFound) {
      saveAttempts(game, v, 0);
      const best = loadBest(game, v);
      const isNewBest = !best || state.attempts < best;
      if (isNewBest) saveBest(game, v, state.attempts);
      pushRecord(game, v, p, state.attempts);
      runnerEl.classList.remove("is-rolling");
      runnerEl.style.left = "90%";
      burstAtFinish();

      def.animate(v, true).then(() => {
        showResult(true, game, v, p, state.attempts, isNewBest);
        state.attempts = 0;
        if (game === "password") state.secret[game] = genSecret(v);
        refreshReadout();
        resetTrack(false);
        if (state.auto) autoRafId = requestAnimationFrame(autoStep);
      });
      return;
    }

    saveAttempts(game, v, state.attempts);
    autoRafId = requestAnimationFrame(autoStep);
  }

  btnAuto.addEventListener("click", () => {
    if (state.auto) stopAuto(); else startAuto();
  });

  autoSpeedInput.addEventListener("input", () => {
    state.autoSpeed = Number(autoSpeedInput.value);
    autoSpeedLabel.textContent = SPEED_LABELS[state.autoSpeed];
  });
  autoSpeedLabel.textContent = SPEED_LABELS[state.autoSpeed];

  /* ---------------- game selection ---------------- */

  function selectGame(game, param) {
    stopAuto();
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
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => { stopAuto(); switchView(btn.dataset.view); });
  });

  /* ---------------- STAGE presets ---------------- */

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
    }
  ];

  function dailyPick() {
    const today = new Date();
    const seed = today.getFullYear() * 372 + (today.getMonth() + 1) * 31 + today.getDate();
    const digits = 2 + (seed % 4); // 2〜5桁
    return { game: "password", v: digits, label: `本日の運試し — 数字パスワード ${digits}桁` };
  }

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

    if (rankingSort.value === "best") {
      list = [...list].sort((a, b) => a.attempts - b.attempts);
    } else {
      list = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

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
