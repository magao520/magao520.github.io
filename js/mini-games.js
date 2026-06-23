// ============================================================
// 废土交易所 - 独立小游戏模块 v1.0
// 包含: 骰子游戏、炸金花、21点、德州扑克
// ============================================================

'use strict';

// ==================== 常量定义 ====================
const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RV = {'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14};

// ==================== 音效系统 ====================
const MiniSound = {
  _ctx: null,
  _enabled: true,
  _sfxGain: null,
  _init() {
    if (this._ctx) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume();
      this._sfxGain = this._ctx.createGain();
      this._sfxGain.gain.value = 0.5;
      this._sfxGain.connect(this._ctx.destination);
    } catch (e) {
      this._enabled = false;
    }
  },
  _p(f, t = 'square', g = 0.08, delay = 0, dur = 0.15) {
    if (!this._enabled) return;
    this._init();
    const now = this._ctx.currentTime + delay;
    const o = this._ctx.createOscillator(), v = this._ctx.createGain();
    o.type = t; o.frequency.value = f; v.gain.value = g;
    o.connect(v); v.connect(this._sfxGain || this._ctx.destination);
    v.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.start(now); o.stop(now + dur);
  },
  deal() { this._p(800, 'square', 0.05, 0, 0.1); setTimeout(() => this._p(1000, 'square', 0.05, 0, 0.1), 60); },
  chip() { this._p(600, 'sine', 0.08); setTimeout(() => this._p(900, 'sine', 0.08), 50); },
  win() { this._p(523, 'sine', 0.08); setTimeout(() => this._p(659, 'sine', 0.08), 120); setTimeout(() => this._p(784, 'sine', 0.08), 240); },
  lose() { this._p(400, 'sine', 0.06); setTimeout(() => this._p(300, 'sine', 0.06), 150); },
  click() { this._p(1200, 'square', 0.03, 0, 0.08); },
  dice() { for (let i = 0; i < 5; i++) setTimeout(() => this._p(200 + Math.random() * 200, 'triangle', 0.04), i * 40); },
  fold() { this._p(200, 'sawtooth', 0.04); },
  cardSlide() { this._p(400, 'triangle', 0.04, 0, 0.1); setTimeout(() => this._p(600, 'triangle', 0.03, 0.05, 0.1), 80); },
  shuffle() { for (let i = 0; i < 8; i++) setTimeout(() => this._p(300 + Math.random() * 200, 'triangle', 0.03), i * 50); },
  reveal() { this._p(880, 'sine', 0.1, 0, 0.2); setTimeout(() => this._p(1100, 'sine', 0.08, 0.1, 0.15), 100); },
  bet() { this._p(440, 'square', 0.06); setTimeout(() => this._p(550, 'square', 0.05), 80); },
  allin() { for (let i = 0; i < 5; i++) setTimeout(() => this._p(200 + i * 100, 'sawtooth', 0.04), i * 30); }
};

// ==================== 牌堆工具 ====================
function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ s, r, v: RV[r], red: s === '♥' || s === '♦' });
  return shuffle(d);
}
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function cardHTML(c, hidden) {
  if (hidden || !c) return '<div class="mg-card mg-card-back"></div>';
  return `<div class="mg-card ${c.red ? 'mg-red' : 'mg-black'}"><div class="mg-card-rank">${c.r}</div><div class="mg-card-suit">${c.s}</div></div>`;
}

// ==================== 骰子游戏类 ====================
class DiceGame {
  constructor() {
    this.name = '骰子游戏';
    this.type = 'dice';
    this.chips = typeof G !== 'undefined' ? G.chips : 50;
    this.pot = 0;
    this.betAmount = 5;
    this.dice = [null, null, null];
    this.playerChoice = null;
    this.history = this.loadHistory();
    this.phase = 'bet'; // bet, rolling, result
    this.jackpot = 0;
    this.jackpotStreak = 0;
    this.animating = false;
    this.animationFrame = 0;
  }

  loadHistory() {
    try {
      const s = localStorage.getItem('mg_dice_history');
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }
  saveHistory() {
    try { localStorage.setItem('mg_dice_history', JSON.stringify(this.history.slice(-50))); } catch (e) {}
  }

  createPanel() {
    const html = `
      <div class="mg-panel" id="mg-dice-panel">
        <div class="mg-header">
          <h3>骰子猜大小</h3>
          <div class="mg-chips-display">筹码: <span id="dice-chips">${this.chips}</span></div>
        </div>
        <div class="mg-game-area">
          <div class="mg-dice-container" id="dice-dice-container">
            <div class="mg-die" id="die-0">?</div>
            <div class="mg-die" id="die-1">?</div>
            <div class="mg-die" id="die-2">?</div>
          </div>
          <div class="mg-result-display" id="dice-result"></div>
        </div>
        <div class="mg-bet-area">
          <div class="mg-bet-input">
            <label>投注金额:</label>
            <input type="number" id="dice-bet-input" value="5" min="1" max="${this.chips}">
          </div>
          <div class="mg-choice-buttons">
            <button class="mg-btn mg-btn-big" onclick="diceGame.bet('big')">大 (11-17)</button>
            <button class="mg-btn mg-btn-small" onclick="diceGame.bet('small')">小 (4-10)</button>
          </div>
        </div>
        <div class="mg-info-bar">
          <div class="mg-jackpot">围骰奖池: <span id="dice-jackpot">${this.jackpot}</span></div>
          <div class="mg-streak">连胜: <span id="dice-streak">${this.jackpotStreak}</span></div>
        </div>
        <div class="mg-history">
          <h4>历史记录</h4>
          <div class="mg-history-list" id="dice-history"></div>
        </div>
        <div class="mg-rules">
          <p>规则: 4-10为小, 11-17为大, 围骰(三个相同)庄家通吃</p>
        </div>
      </div>
    `;
    this.renderHistory();
    return html;
  }

  renderHistory() {
    const el = document.getElementById('dice-history');
    if (!el) return;
    const last10 = this.history.slice(-10).reverse();
    el.innerHTML = last10.map(h => {
      const isBig = h.sum >= 11;
      const isTrips = h.isTrips;
      let cls = 'mg-history-item';
      if (isTrips) cls += ' mg-trips';
      else if (h.win) cls += h.choice === 'big' ? ' mg-win-big' : ' mg-win-small';
      else cls += ' mg-lose';
      return `<div class="${cls}">${h.dice.join('-')} = ${h.sum} ${isBig ? '大' : '小'}${isTrips ? ' 围骰' : ''}</div>`;
    }).join('');
  }

  bet(choice) {
    if (this.phase !== 'bet' || this.animating) return;
    const input = document.getElementById('dice-bet-input');
    const amount = parseInt(input?.value) || 5;
    if (amount > this.chips || amount <= 0) { toast('筹码不足'); return; }
    MiniSound.bet();
    this.chips -= amount;
    this.pot += amount;
    this.playerChoice = choice;
    this.phase = 'rolling';
    this.updateChips();
    this.rollDice();
  }

  rollDice() {
    this.animating = true;
    MiniSound.dice();
    let rolls = 0;
    const maxRolls = 20;
    const rollInterval = setInterval(() => {
      this.dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
      this.updateDiceDisplay(true);
      rolls++;
      if (rolls >= maxRolls) {
        clearInterval(rollInterval);
        this.animating = false;
        this.phase = 'result';
        this.showResult();
      }
    }, 80);
  }

  updateDiceDisplay(animating = false) {
    for (let i = 0; i < 3; i++) {
      const el = document.getElementById(`die-${i}`);
      if (el) {
        el.textContent = animating ? this.dice[i] : (this.dice[i] || '?');
        el.classList.toggle('rolling', animating);
      }
    }
  }

  showResult() {
    const sum = this.dice[0] + this.dice[1] + this.dice[2];
    const isBig = sum >= 11;
    const isTrips = this.dice[0] === this.dice[1] && this.dice[1] === this.dice[2];
    const win = (this.playerChoice === 'big' && isBig) || (this.playerChoice === 'small' && !isBig);
    const resultEl = document.getElementById('dice-result');
    if (resultEl) {
      let html = `总和: <strong>${sum}</strong> = <strong>${isBig ? '大' : '小'}</strong>`;
      if (isTrips) html += ' <span class="mg-trips-text">围骰!</span>';
      html += `<br>${win ? '你赢了!' : '你输了'}`;
      if (win && !isTrips) html += ` +${this.pot}`;
      resultEl.innerHTML = html;
      resultEl.className = 'mg-result-display ' + (win ? 'mg-win' : 'mg-lose');
    }
    if (win) {
      MiniSound.win();
      this.chips += this.pot * 2;
      this.jackpotStreak++;
    } else {
      MiniSound.lose();
      this.jackpotStreak = 0;
      this.jackpot += Math.floor(this.pot * 0.1);
    }
    this.history.push({ dice: [...this.dice], sum, isBig, isTrips, win, choice: this.playerChoice });
    this.saveHistory();
    this.updateChips();
    this.phase = 'bet';
    this.pot = 0;
    this.playerChoice = null;
    this.renderHistory();
  }

  updateChips() {
    const el = document.getElementById('dice-chips');
    if (el) el.textContent = this.chips;
    if (typeof G !== 'undefined') G.chips = this.chips;
  }
}

// ==================== 炸金花游戏类 ====================
class ZJHGame {
  constructor() {
    this.name = '炸金花';
    this.type = 'zjh';
    this.chips = typeof G !== 'undefined' ? G.chips : 50;
    this.pot = 0;
    this.deck = [];
    this.playerCards = [];
    this.dealerCards = [];
    this.playerSeen = false;
    this.phase = 'bet'; // bet, play, compare, result
    this.currentBet = 0;
    this.minBet = 5;
    this.playerBet = 0;
    this.dealerBet = 0;
    this.raiseAmount = 10;
    this.history = this.loadHistory();
    this.wins = 0;
    this.losses = 0;
  }

  loadHistory() {
    try {
      const s = localStorage.getItem('mg_zjh_history');
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }
  saveHistory() {
    try { localStorage.setItem('mg_zjh_history', JSON.stringify(this.history.slice(-50))); } catch (e) {}
  }

  evalCards(cards) {
    if (!cards || cards.length !== 3) return { type: 0, name: '无效', val: 0 };
    const sorted = [...cards].sort((a, b) => b.v - a.v);
    const [c1, c2, c3] = sorted;
    const flush = c1.s === c2.s && c2.s === c3.s;
    const isA23 = c1.v === 14 && c2.v === 3 && c3.v === 2;
    const straight = (c1.v === c2.v + 1 && c2.v === c3.v + 1) || isA23;
    const three = c1.v === c2.v && c2.v === c3.v;
    const pair = c1.v === c2.v || c2.v === c3.v || c1.v === c3.v;
    if (three) return { type: 6, name: '豹子', val: c1.v * 1e6 };
    if (flush && straight) return { type: 5, name: '同花顺', val: isA23 ? 3e5 : c1.v * 1e5 + c2.v * 1e3 + c3.v };
    if (flush) return { type: 4, name: '同花', val: c1.v * 1e4 + c2.v * 100 + c3.v };
    if (straight) return { type: 3, name: '顺子', val: isA23 ? 3e4 : c1.v * 1e4 + c2.v * 100 + c3.v };
    if (pair) {
      const pv = c1.v === c2.v ? c1.v : c3.v;
      const k = c1.v === c2.v ? c3.v : c1.v;
      return { type: 2, name: '对子', val: pv * 1e4 + k };
    }
    return { type: 1, name: '散牌', val: c1.v * 1e4 + c2.v * 100 + c3.v };
  }

  createPanel() {
    const html = `
      <div class="mg-panel" id="mg-zjh-panel">
        <div class="mg-header">
          <h3>炸金花</h3>
          <div class="mg-chips-display">筹码: <span id="zjh-chips">${this.chips}</span></div>
        </div>
        <div class="mg-game-area mg-zjh-area">
          <div class="mg-hand mg-dealer-hand">
            <div class="mg-hand-label">对手</div>
            <div class="mg-cards" id="zjh-dealer-cards">
              ${cardHTML(null, true)} ${cardHTML(null, true)} ${cardHTML(null, true)}
            </div>
            <div class="mg-hand-info" id="zjh-dealer-info"></div>
          </div>
          <div class="mg-pot-area">
            <div class="mg-pot">底池: <span id="zjh-pot">0</span></div>
          </div>
          <div class="mg-hand mg-player-hand">
            <div class="mg-hand-label">你</div>
            <div class="mg-cards" id="zjh-player-cards">
              ${cardHTML(null, true)} ${cardHTML(null, true)} ${cardHTML(null, true)}
            </div>
            <div class="mg-hand-info" id="zjh-player-info">未看牌</div>
          </div>
        </div>
        <div class="mg-action-bar" id="zjh-actions">
          <button class="mg-btn mg-btn-primary" onclick="zjhGame.start()">开始发牌</button>
        </div>
        <div class="mg-stats">
          <span>胜: <span id="zjh-wins">${this.wins}</span></span>
          <span>负: <span id="zjh-losses">${this.losses}</span></span>
        </div>
        <div class="mg-history">
          <h4>历史记录</h4>
          <div class="mg-history-list" id="zjh-history"></div>
        </div>
        <div class="mg-rules">
          <p>豹子 > 同花顺 > 同花 > 顺子 > 对子 > 散牌</p>
        </div>
      </div>
    `;
    this.renderHistory();
    return html;
  }

  renderHistory() {
    const el = document.getElementById('zjh-history');
    if (!el) return;
    const last10 = this.history.slice(-10).reverse();
    el.innerHTML = last10.map(h => {
      const cls = h.win ? 'mg-win' : 'mg-lose';
      return `<div class="mg-history-item ${cls}">${h.myType} vs ${h.dealerType} - ${h.win ? '胜' : '负'}</div>`;
    }).join('');
  }

  start() {
    if (this.phase !== 'bet') return;
    MiniSound.shuffle();
    this.deck = makeDeck();
    this.playerCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
    this.dealerCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
    this.playerSeen = false;
    this.currentBet = this.minBet;
    this.playerBet = this.minBet;
    this.dealerBet = this.minBet;
    if (this.chips < this.minBet) { toast('筹码不足'); return; }
    this.chips -= this.minBet;
    this.pot = this.minBet * 2;
    this.phase = 'play';
    this.animateDeal();
  }

  animateDeal() {
    let dealIndex = 0;
    const dealCard = () => {
      if (dealIndex < 3) {
        this.updateCardsDisplay(dealIndex);
        MiniSound.deal();
        dealIndex++;
        setTimeout(dealCard, 200);
      } else {
        this.showPlayActions();
      }
    };
    dealCard();
  }

  updateCardsDisplay(revealIndex = -1) {
    const playerEl = document.getElementById('zjh-player-cards');
    const dealerEl = document.getElementById('zjh-dealer-cards');
    if (playerEl) {
      playerEl.innerHTML = this.playerCards.map((c, i) => {
        if (i <= revealIndex || this.playerSeen) return cardHTML(c);
        return cardHTML(null, true);
      }).join('');
    }
    if (dealerEl) {
      dealerEl.innerHTML = this.dealerCards.map((c, i) => {
        if (i <= revealIndex) return cardHTML(c);
        return cardHTML(null, true);
      }).join('');
    }
  }

  showPlayActions() {
    const actionsEl = document.getElementById('zjh-actions');
    if (!actionsEl) return;
    actionsEl.innerHTML = `
      <button class="mg-btn" onclick="zjhGame.look()">看牌</button>
      <button class="mg-btn mg-btn-call" onclick="zjhGame.call()">跟注 ${this.currentBet}</button>
      <button class="mg-btn mg-btn-raise" onclick="zjhGame.raise()">加注</button>
      <button class="mg-btn mg-btn-fold" onclick="zjhGame.fold()">弃牌</button>
      <button class="mg-btn mg-btn-allin" onclick="zjhGame.allin()">梭哈</button>
    `;
  }

  look() {
    if (this.playerSeen) return;
    MiniSound.cardSlide();
    this.playerSeen = true;
    this.updateCardsDisplay();
    const playerInfo = document.getElementById('zjh-player-info');
    const myType = this.evalCards(this.playerCards);
    if (playerInfo) playerInfo.textContent = myType.name;
    this.showPlayActions();
  }

  call() {
    if (this.chips < this.currentBet) { toast('筹码不足'); return; }
    MiniSound.chip();
    this.chips -= this.currentBet;
    this.pot += this.currentBet;
    this.playerBet += this.currentBet;
    this.dealerAI();
  }

  raise() {
    const raiseAmt = Math.min(this.chips, this.currentBet * 2);
    if (raiseAmt < this.currentBet * 2) { toast('筹码不足'); return; }
    MiniSound.bet();
    this.chips -= raiseAmt;
    this.pot += raiseAmt;
    this.playerBet += raiseAmt;
    this.currentBet = raiseAmt;
    this.dealerAI();
  }

  fold() {
    MiniSound.fold();
    this.phase = 'result';
    const myType = this.evalCards(this.playerCards);
    this.history.push({ myType: myType.name, dealerType: '未知', win: false });
    this.saveHistory();
    this.wins++;
    this.losses++;
    this.showResult(false, '你弃牌了');
  }

  allin() {
    MiniSound.allin();
    const allInAmt = this.chips;
    this.chips = 0;
    this.pot += allInAmt;
    this.playerBet += allInAmt;
    this.dealerAI();
  }

  dealerAI() {
    const dealerType = this.evalCards(this.dealerCards);
    const playerType = this.evalCards(this.playerCards);
    // 简单AI: 有一定概率跟注或加注
    let dealerAction = 'call';
    const rand = Math.random();
    if (dealerType.type >= 4 && rand < 0.7) dealerAction = 'raise';
    else if (dealerType.type >= 2 && rand < 0.5) dealerAction = 'call';
    else if (rand < 0.3) dealerAction = 'raise';
    else if (rand < 0.4) dealerAction = 'fold';
    if (dealerAction === 'raise' && this.chips >= this.currentBet * 2) {
      // Dealer raises (simplified - just proceed to compare)
    }
    this.compare();
  }

  compare() {
    this.phase = 'compare';
    MiniSound.reveal();
    // Reveal dealer's cards
    const dealerEl = document.getElementById('zjh-dealer-cards');
    if (dealerEl) dealerEl.innerHTML = this.dealerCards.map(c => cardHTML(c)).join('');
    const myType = this.evalCards(this.playerCards);
    const dealerType = this.evalCards(this.dealerCards);
    const playerInfo = document.getElementById('zjh-player-info');
    const dealerInfo = document.getElementById('zjh-dealer-info');
    if (playerInfo) playerInfo.textContent = myType.name;
    if (dealerInfo) dealerInfo.textContent = dealerType.name;
    setTimeout(() => {
      const win = myType.val > dealerType.val;
      this.phase = 'result';
      this.history.push({ myType: myType.name, dealerType: dealerType.name, win });
      this.saveHistory();
      if (win) {
        this.wins++;
        this.chips += this.pot;
        this.showResult(true, `${myType.name} > ${dealerType.name}`);
      } else {
        this.losses++;
        this.showResult(false, `${myType.name} < ${dealerType.name}`);
      }
    }, 1000);
  }

  showResult(win, reason) {
    const actionsEl = document.getElementById('zjh-actions');
    if (actionsEl) {
      actionsEl.innerHTML = `
        <div class="mg-result-banner ${win ? 'mg-win' : 'mg-lose'}">
          <strong>${win ? '你赢了!' : '你输了'}</strong><br>
          <small>${reason}</small><br>
          <small>${win ? '+' + this.pot : ''} 筹码</small>
        </div>
        <button class="mg-btn mg-btn-primary" onclick="zjhGame.reset()">再来一局</button>
      `;
    }
    this.updateChips();
    this.updateStats();
    this.renderHistory();
  }

  reset() {
    this.phase = 'bet';
    this.pot = 0;
    this.currentBet = 0;
    this.playerBet = 0;
    this.dealerBet = 0;
    this.playerCards = [];
    this.dealerCards = [];
    this.playerSeen = false;
    const playerEl = document.getElementById('zjh-player-cards');
    const dealerEl = document.getElementById('zjh-dealer-cards');
    const playerInfo = document.getElementById('zjh-player-info');
    const dealerInfo = document.getElementById('zjh-dealer-info');
    const resultEl = document.getElementById('zjh-result');
    if (playerEl) playerEl.innerHTML = cardHTML(null, true) + ' ' + cardHTML(null, true) + ' ' + cardHTML(null, true);
    if (dealerEl) dealerEl.innerHTML = cardHTML(null, true) + ' ' + cardHTML(null, true) + ' ' + cardHTML(null, true);
    if (playerInfo) playerInfo.textContent = '未看牌';
    if (dealerInfo) dealerInfo.textContent = '';
    this.showPlayActions();
    const actionsEl = document.getElementById('zjh-actions');
    if (actionsEl) actionsEl.innerHTML = '<button class="mg-btn mg-btn-primary" onclick="zjhGame.start()">开始发牌</button>';
  }

  updateChips() {
    const el = document.getElementById('zjh-chips');
    if (el) el.textContent = this.chips;
    if (typeof G !== 'undefined') G.chips = this.chips;
  }

  updateStats() {
    const winsEl = document.getElementById('zjh-wins');
    const lossesEl = document.getElementById('zjh-losses');
    if (winsEl) winsEl.textContent = this.wins;
    if (lossesEl) lossesEl.textContent = this.losses;
  }
}

// ==================== 21点游戏类 ====================
class Blackjack {
  constructor() {
    this.name = '21点';
    this.type = 'blackjack';
    this.chips = typeof G !== 'undefined' ? G.chips : 50;
    this.pot = 0;
    this.deck = [];
    this.playerCards = [];
    this.dealerCards = [];
    this.playerValue = 0;
    this.dealerValue = 0;
    this.phase = 'bet'; // bet, player, dealer, result
    this.minBet = 10;
    this.playerStood = false;
    this.playerBusted = false;
    this.dealerStood = false;
    this.history = this.loadHistory();
    this.wins = 0;
    this.losses = 0;
    this.pushes = 0;
  }

  loadHistory() {
    try {
      const s = localStorage.getItem('mg_bj_history');
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }
  saveHistory() {
    try { localStorage.setItem('mg_bj_history', JSON.stringify(this.history.slice(-50))); } catch (e) {}
  }

  calcValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (c.r === 'A') { aces++; total += 11; }
      else if ('JQK'.includes(c.r)) total += 10;
      else total += c.v;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  createPanel() {
    const html = `
      <div class="mg-panel" id="mg-bj-panel">
        <div class="mg-header">
          <h3>21点</h3>
          <div class="mg-chips-display">筹码: <span id="bj-chips">${this.chips}</span></div>
        </div>
        <div class="mg-game-area mg-bj-area">
          <div class="mg-hand mg-dealer-hand">
            <div class="mg-hand-label">庄家 <span id="bj-dealer-value"></span></div>
            <div class="mg-cards" id="bj-dealer-cards"></div>
          </div>
          <div class="mg-pot-area">
            <div class="mg-pot">底池: <span id="bj-pot">0</span></div>
          </div>
          <div class="mg-hand mg-player-hand">
            <div class="mg-hand-label">你 <span id="bj-player-value"></span></div>
            <div class="mg-cards" id="bj-player-cards"></div>
          </div>
        </div>
        <div class="mg-action-bar" id="bj-actions">
          <div class="mg-bet-input">
            <label>投注:</label>
            <input type="number" id="bj-bet-input" value="10" min="10" max="${this.chips}">
          </div>
          <button class="mg-btn mg-btn-primary" onclick="blackjack.start()">开始</button>
        </div>
        <div class="mg-stats">
          <span>胜: <span id="bj-wins">${this.wins}</span></span>
          <span>负: <span id="bj-losses">${this.losses}</span></span>
          <span>平: <span id="bj-pushes">${this.pushes}</span></span>
        </div>
        <div class="mg-history">
          <h4>历史记录</h4>
          <div class="mg-history-list" id="bj-history"></div>
        </div>
        <div class="mg-rules">
          <p>尽量接近21点, 超过21点爆牌, 庄家必须17点以上停牌</p>
        </div>
      </div>
    `;
    this.renderHistory();
    return html;
  }

  renderHistory() {
    const el = document.getElementById('bj-history');
    if (!el) return;
    const last10 = this.history.slice(-10).reverse();
    el.innerHTML = last10.map(h => {
      let cls = 'mg-history-item';
      if (h.result === 'win') cls += ' mg-win';
      else if (h.result === 'lose') cls += ' mg-lose';
      else cls += ' mg-push';
      return `<div class="${cls}">你:${h.playerVal} 庄:${h.dealerVal} - ${h.result === 'win' ? '胜' : h.result === 'lose' ? '负' : '平'}</div>`;
    }).join('');
  }

  start() {
    if (this.phase !== 'bet') return;
    const input = document.getElementById('bj-bet-input');
    const bet = parseInt(input?.value) || this.minBet;
    if (bet > this.chips || bet < this.minBet) { toast('筹码不足或低于最小投注'); return; }
    MiniSound.shuffle();
    this.chips -= bet;
    this.pot = bet * 2;
    this.deck = makeDeck();
    this.playerCards = [this.deck.pop(), this.deck.pop()];
    this.dealerCards = [this.deck.pop(), this.deck.pop()];
    this.playerStood = false;
    this.playerBusted = false;
    this.dealerStood = false;
    this.phase = 'player';
    this.updateDisplay();
    this.showPlayerActions();
    this.updateChips();
    // Check for natural blackjack
    if (this.calcValue(this.playerCards) === 21) {
      setTimeout(() => this.dealerPlay(), 500);
    }
  }

  updateDisplay() {
    this.playerValue = this.calcValue(this.playerCards);
    this.dealerValue = this.calcValue(this.dealerCards);
    const playerCardsEl = document.getElementById('bj-player-cards');
    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    const playerValueEl = document.getElementById('bj-player-value');
    const dealerValueEl = document.getElementById('bj-dealer-value');
    const potEl = document.getElementById('bj-pot');
    if (playerCardsEl) playerCardsEl.innerHTML = this.playerCards.map(c => cardHTML(c)).join('');
    if (dealerCardsEl) dealerCardsEl.innerHTML = this.dealerCards.map((c, i) => {
      return i === 0 ? cardHTML(c) : cardHTML(null, true);
    }).join('');
    if (playerValueEl) playerValueEl.textContent = `(${this.playerValue})`;
    if (dealerValueEl) dealerValueEl.textContent = `(${this.dealerCards[0] ? this.dealerCards[0].v + (this.dealerCards[0].r === 'A' ? '/11' : '') : ''})`;
    if (potEl) potEl.textContent = this.pot;
  }

  showPlayerActions() {
    const actionsEl = document.getElementById('bj-actions');
    if (!actionsEl) return;
    if (this.playerBusted || this.playerStood) return;
    const canDouble = this.playerCards.length === 2 && this.chips >= this.minBet;
    let html = '';
    if (canDouble) html += `<button class="mg-btn mg-btn-double" onclick="blackjack.double()">双倍</button>`;
    html += `<button class="mg-btn" onclick="blackjack.hit()">要牌</button>`;
    html += `<button class="mg-btn" onclick="blackjack.stand()">停牌</button>`;
    actionsEl.innerHTML = html;
  }

  hit() {
    if (this.phase !== 'player' || this.playerStood || this.playerBusted) return;
    MiniSound.deal();
    this.playerCards.push(this.deck.pop());
    this.playerValue = this.calcValue(this.playerCards);
    this.updateDisplay();
    if (this.playerValue > 21) {
      this.playerBusted = true;
      setTimeout(() => this.dealerPlay(), 500);
    } else if (this.playerValue === 21) {
      this.stand();
    } else {
      this.showPlayerActions();
    }
  }

  stand() {
    if (this.phase !== 'player') return;
    MiniSound.click();
    this.playerStood = true;
    this.dealerPlay();
  }

  double() {
    if (this.playerCards.length !== 2 || this.chips < this.minBet) return;
    MiniSound.chip();
    this.chips -= this.minBet;
    this.pot += this.minBet;
    MiniSound.deal();
    this.playerCards.push(this.deck.pop());
    this.playerValue = this.calcValue(this.playerCards);
    this.updateDisplay();
    this.playerStood = true;
    this.updateChips();
    if (this.playerValue > 21) {
      this.playerBusted = true;
    }
    setTimeout(() => this.dealerPlay(), 500);
  }

  dealerPlay() {
    this.phase = 'dealer';
    // Reveal dealer's hidden card
    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    if (dealerCardsEl) dealerCardsEl.innerHTML = this.dealerCards.map(c => cardHTML(c)).join('');
    this.dealerValue = this.calcValue(this.dealerCards);
    const dealerValueEl = document.getElementById('bj-dealer-value');
    if (dealerValueEl) dealerValueEl.textContent = `(${this.dealerValue})`;
    // Dealer draws until 17+
    const dealerDraw = () => {
      if (this.dealerValue < 17) {
        MiniSound.deal();
        this.dealerCards.push(this.deck.pop());
        this.dealerValue = this.calcValue(this.dealerCards);
        if (dealerCardsEl) dealerCardsEl.innerHTML = this.dealerCards.map(c => cardHTML(c)).join('');
        if (dealerValueEl) dealerValueEl.textContent = `(${this.dealerValue})`;
        setTimeout(dealerDraw, 600);
      } else {
        this.finish();
      }
    };
    setTimeout(dealerDraw, 600);
  }

  finish() {
    this.phase = 'result';
    let result, reason;
    if (this.playerBusted) {
      result = 'lose';
      reason = '你爆牌了!';
    } else if (this.dealerValue > 21) {
      result = 'win';
      reason = '庄家爆牌了!';
      this.chips += this.pot;
    } else if (this.playerValue > this.dealerValue) {
      result = 'win';
      reason = `${this.playerValue} > ${this.dealerValue}`;
      this.chips += this.pot;
    } else if (this.playerValue < this.dealerValue) {
      result = 'lose';
      reason = `${this.playerValue} < ${this.dealerValue}`;
    } else {
      result = 'push';
      reason = `${this.playerValue} = ${this.dealerValue}`;
      this.chips += this.minBet; // Return bet
    }
    if (result === 'win') { this.wins++; MiniSound.win(); }
    else if (result === 'lose') { this.losses++; MiniSound.lose(); }
    else { this.pushes++; }
    this.history.push({ playerVal: this.playerValue, dealerVal: this.dealerValue, result });
    this.saveHistory();
    this.showResult(result, reason);
    this.updateStats();
    this.updateChips();
    this.renderHistory();
  }

  showResult(result, reason) {
    const actionsEl = document.getElementById('bj-actions');
    if (!actionsEl) return;
    const cls = result === 'win' ? 'mg-win' : result === 'lose' ? 'mg-lose' : 'mg-push';
    const text = result === 'win' ? '你赢了!' : result === 'lose' ? '你输了' : '平局';
    const winAmount = result === 'win' ? this.pot : 0;
    actionsEl.innerHTML = `
      <div class="mg-result-banner ${cls}">
        <strong>${text}</strong><br>
        <small>${reason}</small>
        ${winAmount > 0 ? `<br><small>+${winAmount}筹码</small>` : ''}
      </div>
      <button class="mg-btn mg-btn-primary" onclick="blackjack.reset()">再来一局</button>
    `;
  }

  reset() {
    this.phase = 'bet';
    this.pot = 0;
    this.playerCards = [];
    this.dealerCards = [];
    this.playerValue = 0;
    this.dealerValue = 0;
    this.playerStood = false;
    this.playerBusted = false;
    this.dealerStood = false;
    const playerCardsEl = document.getElementById('bj-player-cards');
    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    const playerValueEl = document.getElementById('bj-player-value');
    const dealerValueEl = document.getElementById('bj-dealer-value');
    if (playerCardsEl) playerCardsEl.innerHTML = '';
    if (dealerCardsEl) dealerCardsEl.innerHTML = '';
    if (playerValueEl) playerValueEl.textContent = '';
    if (dealerValueEl) dealerValueEl.textContent = '';
    const actionsEl = document.getElementById('bj-actions');
    if (actionsEl) actionsEl.innerHTML = `
      <div class="mg-bet-input">
        <label>投注:</label>
        <input type="number" id="bj-bet-input" value="10" min="10" max="${this.chips}">
      </div>
      <button class="mg-btn mg-btn-primary" onclick="blackjack.start()">开始</button>
    `;
  }

  updateChips() {
    const el = document.getElementById('bj-chips');
    if (el) el.textContent = this.chips;
    if (typeof G !== 'undefined') G.chips = this.chips;
  }

  updateStats() {
    const winsEl = document.getElementById('bj-wins');
    const lossesEl = document.getElementById('bj-losses');
    const pushesEl = document.getElementById('bj-pushes');
    if (winsEl) winsEl.textContent = this.wins;
    if (lossesEl) lossesEl.textContent = this.losses;
    if (pushesEl) pushesEl.textContent = this.pushes;
  }
}

// ==================== 德州扑克游戏类 ====================
class TexasHoldem {
  constructor() {
    this.name = '德州扑克';
    this.type = 'texas';
    this.chips = typeof G !== 'undefined' ? G.chips : 50;
    this.pot = 0;
    this.deck = [];
    this.playerHoleCards = [];
    this.dealerHoleCards = [];
    this.communityCards = [];
    this.phase = 'hole'; // hole, flop, turn, river, showdown
    this.street = 'preflop'; // preflop, flop, turn, river, showdown
    this.playerBet = 0;
    this.dealerBet = 0;
    this.currentBet = 0;
    this.minBet = 5;
    this.playerChips = 0;
    this.dealerChips = 0;
    this.phaseState = 'bet'; // bet, action, result
    this.history = this.loadHistory();
    this.wins = 0;
    this.losses = 0;
    this.allIn = false;
  }

  loadHistory() {
    try {
      const s = localStorage.getItem('mg_th_history');
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }
  saveHistory() {
    try { localStorage.setItem('mg_th_history', JSON.stringify(this.history.slice(-50))); } catch (e) {}
  }

  createPanel() {
    const html = `
      <div class="mg-panel" id="mg-th-panel">
        <div class="mg-header">
          <h3>德州扑克</h3>
          <div class="mg-chips-display">筹码: <span id="th-chips">${this.chips}</span></div>
        </div>
        <div class="mg-game-area mg-th-area">
          <div class="mg-community">
            <div class="mg-community-label">公共牌</div>
            <div class="mg-cards" id="th-community-cards"></div>
          </div>
          <div class="mg-pot-area">
            <div class="mg-pot">底池: <span id="th-pot">0</span></div>
            <div class="mg-street">阶段: <span id="th-street">底牌</span></div>
          </div>
          <div class="mg-hands-row">
            <div class="mg-hand">
              <div class="mg-hand-label">对手 <span id="th-dealer-val"></span></div>
              <div class="mg-cards" id="th-dealer-cards">${cardHTML(null, true)} ${cardHTML(null, true)}</div>
            </div>
            <div class="mg-hand">
              <div class="mg-hand-label">你 <span id="th-player-val"></span></div>
              <div class="mg-cards" id="th-player-cards"></div>
            </div>
          </div>
        </div>
        <div class="mg-action-bar" id="th-actions">
          <button class="mg-btn mg-btn-primary" onclick="texasHoldem.start()">开始游戏</button>
        </div>
        <div class="mg-bet-display">
          <span>你已下注: <span id="th-player-bet">0</span></span>
          <span>对手已下注: <span id="th-dealer-bet">0</span></span>
        </div>
        <div class="mg-stats">
          <span>胜: <span id="th-wins">${this.wins}</span></span>
          <span>负: <span id="th-losses">${this.losses}</span></span>
        </div>
        <div class="mg-history">
          <h4>历史记录</h4>
          <div class="mg-history-list" id="th-history"></div>
        </div>
        <div class="mg-rules">
          <p>皇家同花顺 > 同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 对子 > 高牌</p>
        </div>
      </div>
    `;
    this.renderHistory();
    return html;
  }

  renderHistory() {
    const el = document.getElementById('th-history');
    if (!el) return;
    const last10 = this.history.slice(-10).reverse();
    el.innerHTML = last10.map(h => {
      const cls = h.win ? 'mg-win' : 'mg-lose';
      return `<div class="mg-history-item ${cls}">${h.myHand} vs ${h.dealerHand} - ${h.win ? '胜' : '负'}</div>`;
    }).join('');
  }

  start() {
    if (this.phaseState !== 'bet' && this.phaseState !== 'result') return;
    MiniSound.shuffle();
    this.deck = makeDeck();
    this.playerHoleCards = [this.deck.pop(), this.deck.pop()];
    this.dealerHoleCards = [this.deck.pop(), this.deck.pop()];
    this.communityCards = [];
    this.pot = 0;
    this.playerBet = 0;
    this.dealerBet = 0;
    this.currentBet = this.minBet;
    this.playerChips = Math.floor(this.chips / 2);
    this.dealerChips = this.chips - this.playerChips;
    this.chips = this.playerChips;
    this.street = 'preflop';
    this.phaseState = 'action';
    this.allIn = false;
    this.animateDeal();
  }

  animateDeal() {
    MiniSound.deal();
    const playerCardsEl = document.getElementById('th-player-cards');
    const dealerCardsEl = document.getElementById('th-dealer-cards');
    if (playerCardsEl) playerCardsEl.innerHTML = this.playerHoleCards.map(c => cardHTML(c)).join('');
    if (dealerCardsEl) dealerCardsEl.innerHTML = cardHTML(null, true) + ' ' + cardHTML(null, true);
    const streetEl = document.getElementById('th-street');
    if (streetEl) streetEl.textContent = '底牌';
    this.showActions();
    this.updateDisplay();
  }

  updateDisplay() {
    const communityEl = document.getElementById('th-community-cards');
    const potEl = document.getElementById('th-pot');
    const playerBetEl = document.getElementById('th-player-bet');
    const dealerBetEl = document.getElementById('th-dealer-bet');
    const playerValEl = document.getElementById('th-player-val');
    const dealerValEl = document.getElementById('th-dealer-val');
    if (communityEl) {
      communityEl.innerHTML = this.communityCards.map(c => cardHTML(c)).join('') || '<span class="mg-placeholder">等待发牌</span>';
    }
    if (potEl) potEl.textContent = this.pot;
    if (playerBetEl) playerBetEl.textContent = this.playerBet;
    if (dealerBetEl) dealerBetEl.textContent = this.dealerBet;
    if (this.street !== 'preflop') {
      const playerBest = this.getBestHand([...this.playerHoleCards, ...this.communityCards]);
      const dealerBest = this.getBestHand([...this.dealerHoleCards, ...this.communityCards]);
      if (playerValEl) playerValEl.textContent = `(${playerBest.name})`;
      if (dealerValEl) dealerValEl.textContent = `(${dealerBest.name})`;
    }
  }

  getBestHand(cards) {
    if (cards.length < 5) return { name: '无效', val: 0 };
    const combinations = this.getCombinations(cards, 5);
    let best = { name: '高牌', val: 0 };
    for (const combo of combinations) {
      const evalResult = this.evalFiveCards(combo);
      if (evalResult.val > best.val) best = evalResult;
    }
    return best;
  }

  getCombinations(arr, size) {
    if (size === 1) return arr.map(el => [el]);
    const result = [];
    for (let i = 0; i <= arr.length - size; i++) {
      const head = arr[i];
      const tailCombos = this.getCombinations(arr.slice(i + 1), size - 1);
      for (const combo of tailCombos) result.push([head, ...combo]);
    }
    return result;
  }

  evalFiveCards(cards) {
    const sorted = [...cards].sort((a, b) => b.v - a.v);
    const values = sorted.map(c => c.v);
    const suits = sorted.map(c => c.s);
    const flush = suits.every(s => s === suits[0]);
    const isStraight = this.checkStraight(values);
    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const countValues = Object.values(counts).sort((a, b) => b - a);
    if (flush && isStraight && values[0] === 14 && values[1] === 13) return { name: '皇家同花顺', val: 9000000 };
    if (flush && isStraight) return { name: '同花顺', val: 8000000 + values[0] };
    if (countValues[0] === 4) return { name: '四条', val: 7000000 + values.find(v => counts[v] === 4) * 1000 + values.find(v => counts[v] === 1) };
    if (countValues[0] === 3 && countValues[1] === 2) return { name: '葫芦', val: 6000000 + values.find(v => counts[v] === 3) * 1000 + values.find(v => counts[v] === 2) };
    if (flush) return { name: '同花', val: 5000000 + values[0] * 10000 + values[1] * 1000 + values[2] * 100 + values[3] * 10 + values[4] };
    if (isStraight) return { name: '顺子', val: 4000000 + values[0] };
    if (countValues[0] === 3) return { name: '三条', val: 3000000 + values.find(v => counts[v] === 3) * 10000 + values.filter(v => counts[v] === 1).sort((a, b) => b - a).reduce((acc, v, i) => acc + v * Math.pow(14, 2 - i), 0) };
    if (countValues[0] === 2 && countValues[1] === 2) {
      const pairs = values.filter(v => counts[v] === 2).sort((a, b) => b - a);
      const kickers = values.filter(v => counts[v] === 1);
      return { name: '两对', val: 2000000 + pairs[0] * 10000 + pairs[1] * 1000 + kickers[0] };
    }
    if (countValues[0] === 2) {
      const pair = values.find(v => counts[v] === 2);
      const kickers = values.filter(v => counts[v] === 1).sort((a, b) => b - a);
      return { name: '对子', val: 1000000 + pair * 100000 + kickers[0] * 10000 + kickers[1] * 100 + kickers[2] };
    }
    return { name: '高牌', val: values[0] * 100000 + values[1] * 10000 + values[2] * 1000 + values[3] * 100 + values[4] };
  }

  checkStraight(values) {
    const unique = [...new Set(values)].sort((a, b) => b - a);
    if (unique.length < 5) return false;
    // A-2-3-4-5 straight
    if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) return true;
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) return true;
    }
    return false;
  }

  showActions() {
    const actionsEl = document.getElementById('th-actions');
    if (!actionsEl) return;
    const toCall = this.currentBet - this.playerBet;
    const canBet = this.playerChips > 0;
    let html = '';
    if (toCall > 0 && canBet) html += `<button class="mg-btn mg-btn-call" onclick="texasHoldem.call()">跟注 ${toCall}</button>`;
    if (this.playerChips > toCall && this.street !== 'river') {
      html += `<button class="mg-btn mg-btn-raise" onclick="texasHoldem.raise()">加注</button>`;
    }
    if (this.playerChips > 0) html += `<button class="mg-btn mg-btn-allin" onclick="texasHoldem.allin()">全下</button>`;
    html += `<button class="mg-btn" onclick="texasHoldem.check()">过牌</button>`;
    html += `<button class="mg-btn mg-btn-fold" onclick="texasHoldem.fold()">弃牌</button>`;
    actionsEl.innerHTML = html;
  }

  call() {
    const toCall = this.currentBet - this.playerBet;
    if (toCall > this.playerChips) {
      toast('筹码不足');
      return;
    }
    MiniSound.chip();
    this.playerChips -= toCall;
    this.playerBet += toCall;
    this.pot += toCall;
    this.nextStreet();
    this.updateDisplay();
  }

  raise() {
    const raiseAmount = Math.min(this.currentBet * 2, this.playerChips);
    if (raiseAmount <= 0) return;
    MiniSound.bet();
    this.currentBet = this.playerBet + raiseAmount;
    this.playerChips -= raiseAmount;
    this.playerBet += raiseAmount;
    this.pot += raiseAmount;
    this.dealerAI();
    this.updateDisplay();
  }

  allin() {
    MiniSound.allin();
    const allInAmount = this.playerChips;
    this.playerChips = 0;
    this.allIn = true;
    if (allInAmount > this.currentBet - this.playerBet) {
      this.pot += allInAmount - (this.currentBet - this.playerBet);
      this.currentBet = this.playerBet + allInAmount;
    }
    this.playerBet += allInAmount;
    this.dealerAI();
    this.updateDisplay();
  }

  check() {
    MiniSound.click();
    if (this.currentBet === this.playerBet) {
      this.nextStreet();
    } else {
      this.fold();
    }
  }

  fold() {
    MiniSound.fold();
    this.phaseState = 'result';
    this.losses++;
    this.history.push({ myHand: '弃牌', dealerHand: '胜', win: false });
    this.saveHistory();
    this.showResult(false, '你弃牌了');
    this.chips += this.playerChips;
    this.updateStats();
    this.renderHistory();
  }

  dealerAI() {
    // Simple AI: 50% chance to call, 30% raise, 20% fold
    const toCall = this.currentBet - this.dealerBet;
    const rand = Math.random();
    if (rand < 0.2) {
      // Fold
      return;
    } else if (rand < 0.5 && toCall <= this.dealerChips) {
      // Call
      MiniSound.chip();
      this.dealerChips -= toCall;
      this.dealerBet += toCall;
      this.pot += toCall;
    } else if (rand < 0.8 && this.dealerChips > toCall * 2) {
      // Raise
      const raise = Math.min(toCall * 2, this.dealerChips);
      MiniSound.bet();
      this.currentBet = this.dealerBet + raise;
      this.dealerChips -= raise;
      this.dealerBet += raise;
      this.pot += raise;
    } else if (toCall <= this.dealerChips) {
      // Call
      MiniSound.chip();
      this.dealerChips -= toCall;
      this.dealerBet += toCall;
      this.pot += toCall;
    }
    this.updateDisplay();
  }

  nextStreet() {
    const streetEl = document.getElementById('th-street');
    switch (this.street) {
      case 'preflop':
        this.street = 'flop';
        this.communityCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
        if (streetEl) streetEl.textContent = '翻牌';
        MiniSound.deal();
        break;
      case 'flop':
        this.street = 'turn';
        this.communityCards.push(this.deck.pop());
        if (streetEl) streetEl.textContent = '转牌';
        MiniSound.deal();
        break;
      case 'turn':
        this.street = 'river';
        this.communityCards.push(this.deck.pop());
        if (streetEl) streetEl.textContent = '河牌';
        MiniSound.deal();
        break;
      case 'river':
        this.showdown();
        return;
    }
    this.currentBet = Math.max(this.currentBet, this.playerBet, this.dealerBet);
    this.playerBet = 0;
    this.dealerBet = 0;
    this.showActions();
    this.updateDisplay();
  }

  showdown() {
    this.phaseState = 'result';
    MiniSound.reveal();
    const dealerCardsEl = document.getElementById('th-dealer-cards');
    if (dealerCardsEl) dealerCardsEl.innerHTML = this.dealerHoleCards.map(c => cardHTML(c)).join('');
    const playerBest = this.getBestHand([...this.playerHoleCards, ...this.communityCards]);
    const dealerBest = this.getBestHand([...this.dealerHoleCards, ...this.communityCards]);
    const playerValEl = document.getElementById('th-player-val');
    const dealerValEl = document.getElementById('th-dealer-val');
    if (playerValEl) playerValEl.textContent = `(${playerBest.name})`;
    if (dealerValEl) dealerValEl.textContent = `(${dealerBest.name})`;
    setTimeout(() => {
      const win = playerBest.val > dealerBest.val;
      if (win) {
        this.wins++;
        this.chips += this.playerChips + this.pot;
        this.showResult(true, `${playerBest.name} > ${dealerBest.name}`);
      } else if (playerBest.val < dealerBest.val) {
        this.losses++;
        this.showResult(false, `${playerBest.name} < ${dealerBest.name}`);
      } else {
        this.chips += this.playerChips + Math.floor(this.pot / 2);
        this.showResult(true, `${playerBest.name} = ${dealerBest.name} (平分)`);
        this.wins++;
      }
      this.history.push({ myHand: playerBest.name, dealerHand: dealerBest.name, win: playerBest.val >= dealerBest.val });
      this.saveHistory();
      this.updateStats();
      this.updateChips();
      this.renderHistory();
    }, 1000);
  }

  showResult(win, reason) {
    const actionsEl = document.getElementById('th-actions');
    if (!actionsEl) return;
    const cls = win ? 'mg-win' : 'mg-lose';
    const text = win ? '你赢了!' : '你输了';
    const winAmount = win ? this.pot : 0;
    actionsEl.innerHTML = `
      <div class="mg-result-banner ${cls}">
        <strong>${text}</strong><br>
        <small>${reason}</small>
        ${winAmount > 0 ? `<br><small>+${winAmount}筹码</small>` : ''}
      </div>
      <button class="mg-btn mg-btn-primary" onclick="texasHoldem.reset()">再来一局</button>
    `;
  }

  reset() {
    this.phaseState = 'bet';
    this.pot = 0;
    this.playerBet = 0;
    this.dealerBet = 0;
    this.currentBet = this.minBet;
    this.playerHoleCards = [];
    this.dealerHoleCards = [];
    this.communityCards = [];
    this.street = 'preflop';
    this.allIn = false;
    const playerCardsEl = document.getElementById('th-player-cards');
    const dealerCardsEl = document.getElementById('th-dealer-cards');
    const communityEl = document.getElementById('th-community-cards');
    const playerValEl = document.getElementById('th-player-val');
    const dealerValEl = document.getElementById('th-dealer-val');
    const streetEl = document.getElementById('th-street');
    if (playerCardsEl) playerCardsEl.innerHTML = '';
    if (dealerCardsEl) dealerCardsEl.innerHTML = cardHTML(null, true) + ' ' + cardHTML(null, true);
    if (communityEl) communityEl.innerHTML = '';
    if (playerValEl) playerValEl.textContent = '';
    if (dealerValEl) dealerValEl.textContent = '';
    if (streetEl) streetEl.textContent = '底牌';
    const actionsEl = document.getElementById('th-actions');
    if (actionsEl) actionsEl.innerHTML = '<button class="mg-btn mg-btn-primary" onclick="texasHoldem.start()">开始游戏</button>';
    this.updateDisplay();
  }

  updateChips() {
    const el = document.getElementById('th-chips');
    if (el) el.textContent = this.chips;
    if (typeof G !== 'undefined') G.chips = this.chips;
  }

  updateStats() {
    const winsEl = document.getElementById('th-wins');
    const lossesEl = document.getElementById('th-losses');
    if (winsEl) winsEl.textContent = this.wins;
    if (lossesEl) lossesEl.textContent = this.losses;
  }
}

// ==================== 小游戏管理器 ====================
const MiniGames = {
  diceGame: null,
  zjhGame: null,
  blackjack: null,
  texasHoldem: null,
  currentGame: null,

  init() {
    this.diceGame = new DiceGame();
    this.zjhGame = new ZJHGame();
    this.blackjack = new Blackjack();
    this.texasHoldem = new TexasHoldem();
  },

  showGame(type) {
    this.init();
    let panel, gameName;
    switch (type) {
      case 'dice':
        panel = this.diceGame.createPanel();
        gameName = '骰子游戏';
        this.currentGame = this.diceGame;
        break;
      case 'zjh':
        panel = this.zjhGame.createPanel();
        gameName = '炸金花';
        this.currentGame = this.zjhGame;
        break;
      case 'blackjack':
        panel = this.blackjack.createPanel();
        gameName = '21点';
        this.currentGame = this.blackjack;
        break;
      case 'texas':
        panel = this.texasHoldem.createPanel();
        gameName = '德州扑克';
        this.currentGame = this.texasHoldem;
        break;
      default:
        return;
    }
    this.showPanel(panel, gameName);
  },

  showPanel(content, title) {
    // Close existing panel
    const existing = document.getElementById('mg-container');
    if (existing) existing.remove();
    const container = document.createElement('div');
    container.id = 'mg-container';
    container.innerHTML = `
      <div class="mg-overlay" onclick="MiniGames.close()"></div>
      <div class="mg-modal">
        <button class="mg-close" onclick="MiniGames.close()">&times;</button>
        ${content}
      </div>
    `;
    document.body.appendChild(container);
    MiniSound.click();
  },

  close() {
    const container = document.getElementById('mg-container');
    if (container) {
      container.remove();
      // Sync chips back to main game
      if (this.currentGame && typeof G !== 'undefined') {
        G.chips = this.currentGame.chips;
        if (typeof updateChips === 'function') updateChips();
      }
    }
    MiniSound.click();
  },

  // Quick play functions
  quickDice() {
    this.init();
    const panel = this.diceGame.createPanel();
    this.currentGame = this.diceGame;
    this.showPanel(panel, '骰子游戏');
  },

  quickZJH() {
    this.init();
    const panel = this.zjhGame.createPanel();
    this.currentGame = this.zjhGame;
    this.showPanel(panel, '炸金花');
  },

  quickBlackjack() {
    this.init();
    const panel = this.blackjack.createPanel();
    this.currentGame = this.blackjack;
    this.showPanel(panel, '21点');
  },

  quickTexas() {
    this.init();
    const panel = this.texasHoldem.createPanel();
    this.currentGame = this.texasHoldem;
    this.showPanel(panel, '德州扑克');
  }
};

// ==================== CSS样式 ====================
const miniGamesCSS = `
<style>
/* 小游戏样式 */
.mg-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 9998;
}
.mg-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 2px solid #b8960f;
  border-radius: 12px;
  padding: 20px;
  max-width: 480px;
  width: 95%;
  max-height: 90vh;
  overflow-y: auto;
  z-index: 9999;
  box-shadow: 0 0 30px rgba(184, 150, 15, 0.3);
}
.mg-close {
  position: absolute;
  top: 10px;
  right: 15px;
  background: none;
  border: none;
  color: #d4c8a8;
  font-size: 28px;
  cursor: pointer;
  line-height: 1;
}
.mg-close:hover { color: #b8960f; }
.mg-panel h3 {
  text-align: center;
  color: #b8960f;
  margin: 0 0 15px 0;
  font-size: 20px;
}
.mg-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(184, 150, 15, 0.3);
}
.mg-chips-display {
  color: #5a8a3c;
  font-weight: bold;
}
.mg-chips-display span { color: #b8960f; }

/* 骰子样式 */
.mg-dice-container {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin: 15px 0;
}
.mg-die {
  width: 60px;
  height: 60px;
  background: linear-gradient(145deg, #2a2a4e, #1a1a3e);
  border: 2px solid #b8960f;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: bold;
  color: #d4c8a8;
  box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}
.mg-die.rolling {
  animation: mg-shake 0.1s infinite;
}
@keyframes mg-shake {
  0%, 100% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
}
.mg-result-display {
  text-align: center;
  padding: 10px;
  margin: 10px 0;
  border-radius: 8px;
  font-size: 16px;
  background: rgba(0,0,0,0.3);
}
.mg-result-display.mg-win { background: rgba(90, 138, 60, 0.3); color: #5a8a3c; }
.mg-result-display.mg-lose { background: rgba(196, 70, 58, 0.3); color: #c4463a; }
.mg-trips-text { color: #b8960f; font-weight: bold; }
.mg-bet-area {
  margin: 15px 0;
}
.mg-bet-input {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.mg-bet-input input {
  flex: 1;
  padding: 8px;
  background: rgba(0,0,0,0.3);
  border: 1px solid #b8960f;
  border-radius: 4px;
  color: #d4c8a8;
  text-align: center;
}
.mg-choice-buttons {
  display: flex;
  gap: 10px;
}
.mg-btn {
  padding: 10px 20px;
  border: 1px solid #b8960f;
  border-radius: 6px;
  background: rgba(184, 150, 15, 0.2);
  color: #d4c8a8;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}
.mg-btn:hover {
  background: rgba(184, 150, 15, 0.4);
  transform: translateY(-2px);
}
.mg-btn:active { transform: translateY(0); }
.mg-btn-big { background: rgba(196, 70, 58, 0.3); border-color: #c4463a; }
.mg-btn-big:hover { background: rgba(196, 70, 58, 0.5); }
.mg-btn-small { background: rgba(90, 138, 60, 0.3); border-color: #5a8a3c; }
.mg-btn-small:hover { background: rgba(90, 138, 60, 0.5); }
.mg-btn-primary { background: rgba(184, 150, 15, 0.4); }
.mg-btn-call { background: rgba(90, 138, 60, 0.3); }
.mg-btn-raise { background: rgba(184, 150, 15, 0.5); }
.mg-btn-fold { background: rgba(196, 70, 58, 0.3); }
.mg-btn-allin { background: rgba(255, 100, 50, 0.3); border-color: #ff6432; }
.mg-btn-double { background: rgba(100, 100, 200, 0.3); }
.mg-info-bar {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
  margin: 10px 0;
  font-size: 12px;
  color: #888;
}
.mg-jackpot { color: #b8960f; }
.mg-streak { color: #5a8a3c; }

/* 牌样式 */
.mg-cards {
  display: flex;
  gap: 5px;
  justify-content: center;
  flex-wrap: wrap;
}
.mg-card {
  width: 50px;
  height: 70px;
  background: linear-gradient(145deg, #f5f5f5, #e0e0e0);
  border: 1px solid #333;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
  animation: mg-deal 0.3s ease-out;
}
@keyframes mg-deal {
  from { transform: translateY(-30px) rotate(10deg); opacity: 0; }
  to { transform: translateY(0) rotate(0); opacity: 1; }
}
.mg-card-back {
  background: linear-gradient(145deg, #1a3a5c, #0d2240);
  border: 2px solid #b8960f;
  background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(184, 150, 15, 0.1) 5px, rgba(184, 150, 15, 0.1) 10px);
}
.mg-card-rank {
  font-size: 18px;
  font-weight: bold;
  line-height: 1;
}
.mg-card-suit {
  font-size: 24px;
  line-height: 1;
}
.mg-red .mg-card-rank, .mg-red .mg-card-suit { color: #c4463a; }
.mg-black .mg-card-rank, .mg-black .mg-card-suit { color: #1a1a2e; }
.mg-placeholder { color: #555; font-style: italic; }

/* 游戏区域 */
.mg-game-area {
  margin: 15px 0;
}
.mg-hand {
  text-align: center;
  padding: 10px;
}
.mg-hand-label {
  font-size: 12px;
  color: #888;
  margin-bottom: 5px;
}
.mg-hand-info {
  font-size: 11px;
  color: #b8960f;
  margin-top: 5px;
  min-height: 16px;
}
.mg-pot-area {
  text-align: center;
  padding: 10px;
  background: rgba(184, 150, 15, 0.1);
  border-radius: 8px;
  margin: 10px 0;
}
.mg-pot {
  font-size: 18px;
  color: #b8960f;
  font-weight: bold;
}
.mg-street {
  font-size: 12px;
  color: #888;
  margin-top: 5px;
}

/* 21点/德州扑克特定 */
.mg-bj-area, .mg-zjh-area, .mg-th-area {
  background: rgba(0,0,0,0.2);
  border-radius: 8px;
  padding: 10px;
}
.mg-community {
  text-align: center;
  padding: 10px;
  border-bottom: 1px dashed rgba(184, 150, 15, 0.3);
  margin-bottom: 10px;
}
.mg-community-label {
  font-size: 11px;
  color: #888;
  margin-bottom: 5px;
}
.mg-hands-row {
  display: flex;
  justify-content: space-around;
}
.mg-action-bar {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin: 15px 0;
}
.mg-result-banner {
  text-align: center;
  padding: 15px;
  border-radius: 8px;
  margin: 10px 0;
  animation: mg-pop 0.3s ease-out;
}
@keyframes mg-pop {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.mg-result-banner.mg-win { background: rgba(90, 138, 60, 0.3); color: #5a8a3c; }
.mg-result-banner.mg-lose { background: rgba(196, 70, 58, 0.3); color: #c4463a; }
.mg-result-banner.mg-push { background: rgba(184, 150, 15, 0.3); color: #b8960f; }
.mg-stats {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
  margin: 10px 0;
  font-size: 12px;
}
.mg-stats span { color: #888; }
.mg-stats span span { color: #d4c8a8; font-weight: bold; }
.mg-bet-display {
  display: flex;
  justify-content: space-around;
  font-size: 12px;
  color: #888;
  margin: 5px 0;
}

/* 历史记录 */
.mg-history {
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px solid rgba(184, 150, 15, 0.3);
}
.mg-history h4 {
  font-size: 14px;
  color: #888;
  margin: 0 0 8px 0;
}
.mg-history-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 80px;
  overflow-y: auto;
}
.mg-history-item {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  background: rgba(0,0,0,0.2);
}
.mg-history-item.mg-win { background: rgba(90, 138, 60, 0.3); color: #5a8a3c; }
.mg-history-item.mg-lose { background: rgba(196, 70, 58, 0.3); color: #c4463a; }
.mg-history-item.mg-trips { background: rgba(184, 150, 15, 0.5); color: #b8960f; }
.mg-history-item.mg-win-big { background: rgba(196, 70, 58, 0.3); color: #c4463a; }
.mg-history-item.mg-win-small { background: rgba(90, 138, 60, 0.3); color: #5a8a3c; }
.mg-history-item.mg-push { background: rgba(184, 150, 15, 0.3); color: #b8960f; }

/* 规则 */
.mg-rules {
  margin-top: 10px;
  padding: 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
}
.mg-rules p {
  font-size: 11px;
  color: #666;
  margin: 0;
  text-align: center;
}
</style>
`;

// Inject CSS
document.head.insertAdjacentHTML('beforeend', miniGamesCSS);

// Initialize
MiniGames.init();
