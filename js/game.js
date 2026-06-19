// ============================================================
// 末日赌场 - 废土娱乐系统
// 炸金花 + 二十一点
// ============================================================
'use strict';

// ==================== 全局状态 ====================
const state = {
  user: null,
  chips: 10000,
  currentGame: null,
  gameData: null,
  isPlayerTurn: false,
  players: [],
  deck: [],
  pot: 0,
  currentBet: 0,
  round: 0,
  logs: [],
  gameOver: false
};

// ==================== 本地存储 ====================
function loadUser() {
  const saved = localStorage.getItem('wasteland_user');
  if (saved) {
    const data = JSON.parse(saved);
    state.user = data.name;
    state.chips = data.chips || 10000;
    return true;
  }
  return false;
}

function saveUser() {
  if (state.user) {
    localStorage.setItem('wasteland_user', JSON.stringify({
      name: state.user,
      chips: state.chips
    }));
  }
}

// ==================== 扑克牌系统 ====================
const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: RANK_VALUES[rank], red: suit === '♥' || suit === '♦' });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCard() {
  return state.deck.pop();
}

function cardHTML(card, hidden = false) {
  if (hidden) return '<div class="card-back"></div>';
  const color = card.red ? 'red' : 'black';
  return `<div class="card ${color}"><div class="card-rank">${card.rank}</div><div class="card-suit">${card.suit}</div></div>`;
}

// ==================== UI工具 ====================
function $(id) { return document.getElementById(id); }

function showScreen(name) {
  $('auth-screen').style.display = name === 'auth' ? 'flex' : 'none';
  $('main-screen').style.display = name === 'main' ? 'block' : 'none';
  $('game-screen').style.display = name === 'game' ? 'block' : 'none';
}

function updateChips() {
  $('user-chips').textContent = state.chips.toLocaleString();
  $('game-chips').textContent = state.chips.toLocaleString();
  saveUser();
}

function log(msg, type = '') {
  state.logs.push({ msg, type });
  if (state.logs.length > 50) state.logs.shift();
  const panel = $('game-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = msg;
  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;
}

function clearLog() {
  state.logs = [];
  $('game-log').innerHTML = '';
}

function showModal(title, text, isWin) {
  $('modal-title').textContent = title;
  $('modal-title').className = 'modal-title ' + (isWin ? 'win' : 'lose');
  $('modal-text').textContent = text;
  $('result-modal').classList.add('open');
}

function closeModal() {
  $('result-modal').classList.remove('open');
  if (state.currentGame) {
    if (state.currentGame === 'zjh') startZJH();
    else startBJ();
  }
}

// ==================== 登录系统 ====================
$('auth-btn').onclick = () => {
  const name = $('auth-username').value.trim();
  const pass = $('auth-password').value.trim();
  if (!name) { $('auth-hint').textContent = '请输入用户名'; return; }
  if (!pass) { $('auth-hint').textContent = '请输入密码'; return; }
  state.user = name;
  if (!loadUser()) state.chips = 10000;
  saveUser();
  $('user-name').textContent = name;
  updateChips();
  showScreen('main');
};

function logout() {
  state.user = null;
  localStorage.removeItem('wasteland_user');
  showScreen('auth');
}

// 自动登录
if (loadUser()) {
  $('user-name').textContent = state.user;
  updateChips();
  showScreen('main');
}

// ==================== 游戏大厅 ====================
function startGame(type) {
  state.currentGame = type;
  state.gameOver = false;
  clearLog();
  showScreen('game');
  $('game-title').textContent = type === 'zjh' ? '炸金花' : '二十一点';
  if (type === 'zjh') startZJH();
  else startBJ();
}

function backToLobby() {
  state.currentGame = null;
  state.gameData = null;
  showScreen('main');
  updateChips();
}

// ==================== 炸金花 ====================
// 牌型: 豹子(6) > 同花顺(5) > 同花(4) > 顺子(3) > 对子(2) > 单张(1)

function evaluateZJH(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const [c1, c2, c3] = sorted;
  const isFlush = c1.suit === c2.suit && c2.suit === c3.suit;
  const isStraight = c1.value === c2.value + 1 && c2.value === c3.value + 1;
  const isThree = c1.value === c2.value && c2.value === c3.value;
  const isPair = c1.value === c2.value || c2.value === c3.value || c1.value === c3.value;

  if (isThree) return { type: 6, name: '豹子', value: c1.value * 1000000 };
  if (isFlush && isStraight) return { type: 5, name: '同花顺', value: c1.value * 100000 + c2.value * 1000 + c3.value };
  if (isFlush) return { type: 4, name: '同花', value: c1.value * 10000 + c2.value * 100 + c3.value };
  if (isStraight) return { type: 3, name: '顺子', value: c1.value * 10000 + c2.value * 100 + c3.value };
  if (isPair) {
    const pairVal = c1.value === c2.value ? c1.value : c3.value;
    const kicker = c1.value === c2.value ? c3.value : c1.value;
    return { type: 2, name: '对子', value: pairVal * 10000 + kicker };
  }
  return { type: 1, name: '单张', value: c1.value * 10000 + c2.value * 100 + c3.value };
}

function compareZJH(cardsA, cardsB) {
  const evalA = evaluateZJH(cardsA);
  const evalB = evaluateZJH(cardsB);
  if (evalA.type !== evalB.type) return evalA.type - evalB.type;
  return evalA.value - evalB.value;
}

function startZJH() {
  state.deck = createDeck();
  state.pot = 0;
  state.currentBet = 100;
  state.round = 0;
  state.gameOver = false;

  state.players = [
    { id: 'player', name: state.user || '你', cards: [], chips: state.chips, bet: 0, folded: false, seen: false, ai: false },
    { id: 'ai1', name: 'AI-掠夺者', cards: [], chips: 10000, bet: 0, folded: false, seen: false, ai: true },
    { id: 'ai2', name: 'AI-拾荒者', cards: [], chips: 10000, bet: 0, folded: false, seen: false, ai: true }
  ];

  // 发牌
  for (let i = 0; i < 3; i++) {
    for (const p of state.players) {
      p.cards.push(drawCard());
    }
  }

  // 底注
  for (const p of state.players) {
    const ante = 100;
    p.chips -= ante;
    p.bet = ante;
    state.pot += ante;
  }

  state.gameData = { type: 'zjh' };
  renderZJH();
  log('=== 炸金花开局 ===', 'system');
  log('每人底注 100', 'system');
  setPlayerTurn(true);
}

function renderZJH() {
  const player = state.players[0];
  const ai1 = state.players[1];
  const ai2 = state.players[2];

  // 玩家牌
  const playerCards = player.seen
    ? player.cards.map(c => cardHTML(c)).join('')
    : player.cards.map(() => cardHTML(null, true)).join('');
  $('player-cards').innerHTML = playerCards;
  $('player-hand').textContent = player.seen ? evaluateZJH(player.cards).name : '未看牌';
  $('player-name').innerHTML = `${player.name} <span style="color:var(--gold)">${player.chips}</span>`;

  // AI1牌
  const ai1Cards = (ai1.folded || state.gameOver)
    ? ai1.cards.map(c => cardHTML(c)).join('')
    : ai1.cards.map(() => cardHTML(null, true)).join('');
  $('ai1-cards').innerHTML = ai1Cards;
  $('ai1-hand').textContent = (ai1.folded || state.gameOver) ? evaluateZJH(ai1.cards).name : '';
  $('ai1-name').textContent = `${ai1.name} ${ai1.folded ? '(已弃牌)' : ai1.chips}`;

  // AI2牌
  const ai2Cards = (ai2.folded || state.gameOver)
    ? ai2.cards.map(c => cardHTML(c)).join('')
    : ai2.cards.map(() => cardHTML(null, true)).join('');
  $('ai2-cards').innerHTML = ai2Cards;
  $('ai2-hand').textContent = (ai2.folded || state.gameOver) ? evaluateZJH(ai2.cards).name : '';
  $('ai2-name').textContent = `${ai2.name} ${ai2.folded ? '(已弃牌)' : ai2.chips}`;

  $('pot-amount').textContent = state.pot.toLocaleString();
  updateChips();
}

function setPlayerTurn(active) {
  state.isPlayerTurn = active;
  const btns = document.querySelectorAll('#action-bar .action-btn');
  btns.forEach(b => b.disabled = !active);

  if (active) {
    $('player-name').classList.add('active');
    $('ai1-name').classList.remove('active');
    $('ai2-name').classList.remove('active');
  }
}

function gameAction(action) {
  if (!state.isPlayerTurn || state.gameOver) return;
  const player = state.players[0];

  switch (action) {
    case 'fold':
      player.folded = true;
      log(`${player.name} 弃牌`);
      setPlayerTurn(false);
      checkZJHEnd();
      break;

    case 'check':
      if (!player.seen) {
        player.seen = true;
        log(`${player.name} 看牌`);
        renderZJH();
      }
      break;

    case 'call':
      if (!player.seen) {
        player.seen = true;
        log(`${player.name} 看牌后跟注 ${state.currentBet}`);
      } else {
        log(`${player.name} 跟注 ${state.currentBet}`);
      }
      const callAmount = state.currentBet;
      player.chips -= callAmount;
      player.bet += callAmount;
      state.pot += callAmount;
      state.chips = player.chips;
      setPlayerTurn(false);
      checkZJHEnd();
      break;

    case 'raise':
      $('bet-control').style.display = 'flex';
      const slider = $('bet-slider');
      slider.max = Math.min(player.chips, 5000);
      slider.value = state.currentBet * 2;
      $('bet-display').textContent = slider.value;
      slider.oninput = () => { $('bet-display').textContent = slider.value; };
      // 临时替换按钮行为
      $('btn-raise').onclick = () => {
        const raiseAmount = parseInt(slider.value);
        if (!player.seen) player.seen = true;
        player.chips -= raiseAmount;
        player.bet += raiseAmount;
        state.pot += raiseAmount;
        state.currentBet = raiseAmount;
        state.chips = player.chips;
        log(`${player.name} 加注到 ${raiseAmount}`);
        $('bet-control').style.display = 'none';
        $('btn-raise').onclick = () => gameAction('raise');
        renderZJH();
        setPlayerTurn(false);
        checkZJHEnd();
      };
      return;

    case 'allin':
      const allInAmount = player.chips;
      if (!player.seen) player.seen = true;
      player.chips = 0;
      player.bet += allInAmount;
      state.pot += allInAmount;
      state.currentBet = Math.max(state.currentBet, allInAmount);
      state.chips = 0;
      log(`${player.name} ALL IN ${allInAmount}！`);
      renderZJH();
      setPlayerTurn(false);
      checkZJHEnd();
      break;
  }

  renderZJH();
}

function checkZJHEnd() {
  const activePlayers = state.players.filter(p => !p.folded);
  if (activePlayers.length === 1) {
    // 只剩一人，直接获胜
    const winner = activePlayers[0];
    winner.chips += state.pot;
    if (winner.id === 'player') {
      state.chips = winner.chips;
      showModal('胜利！', `其他玩家都弃牌了，你赢得 ${state.pot} 筹码`, true);
    } else {
      showModal('失败', `${winner.name} 获胜，赢得 ${state.pot} 筹码`, false);
    }
    state.gameOver = true;
    renderZJH();
    return;
  }

  // AI回合
  setTimeout(() => aiTurnZJH(1), 800);
}

function aiTurnZJH(aiIndex) {
  if (state.gameOver) return;
  const ai = state.players[aiIndex];
  if (ai.folded) {
    if (aiIndex < 2) setTimeout(() => aiTurnZJH(aiIndex + 1), 600);
    else endZJHRound();
    return;
  }

  // AI决策
  const evalResult = evaluateZJH(ai.cards);
  const strength = evalResult.type;
  const seen = Math.random() > 0.3;
  if (seen && !ai.seen) ai.seen = true;

  // 根据牌力决策
  let action;
  if (strength >= 5) {
    // 强牌：加注或All In
    action = ai.chips > 2000 ? 'raise' : 'allin';
  } else if (strength >= 3) {
    // 中等：跟注或加注
    action = Math.random() > 0.5 ? 'call' : 'raise';
  } else if (strength >= 2) {
    // 弱对子：跟注或弃牌
    action = Math.random() > 0.4 ? 'call' : 'fold';
  } else {
    // 单张：大概率弃牌
    action = Math.random() > 0.7 ? 'call' : 'fold';
  }

  // 如果筹码不够，只能弃牌或All In
  if (ai.chips < state.currentBet) {
    action = strength >= 4 ? 'allin' : 'fold';
  }

  switch (action) {
    case 'fold':
      ai.folded = true;
      log(`${ai.name} 弃牌`);
      break;
    case 'call':
      const callAmt = state.currentBet;
      ai.chips -= callAmt;
      ai.bet += callAmt;
      state.pot += callAmt;
      log(`${ai.name} ${ai.seen ? '看牌后' : ''}跟注 ${callAmt}`);
      break;
    case 'raise':
      const raiseAmt = Math.min(ai.chips, state.currentBet * 2 + Math.floor(Math.random() * 500));
      ai.chips -= raiseAmt;
      ai.bet += raiseAmt;
      state.pot += raiseAmt;
      state.currentBet = raiseAmt;
      log(`${ai.name} 加注到 ${raiseAmt}`);
      break;
    case 'allin':
      const allAmt = ai.chips;
      ai.chips = 0;
      ai.bet += allAmt;
      state.pot += allAmt;
      state.currentBet = Math.max(state.currentBet, allAmt);
      log(`${ai.name} ALL IN ${allAmt}！`);
      break;
  }

  renderZJH();

  // 检查是否只剩一人
  const active = state.players.filter(p => !p.folded);
  if (active.length === 1) {
    const winner = active[0];
    winner.chips += state.pot;
    if (winner.id === 'player') {
      state.chips = winner.chips;
      showModal('胜利！', `其他玩家都弃牌了，你赢得 ${state.pot} 筹码`, true);
    } else {
      showModal('失败', `${winner.name} 获胜，赢得 ${state.pot} 筹码`, false);
    }
    state.gameOver = true;
    renderZJH();
    return;
  }

  if (aiIndex < 2) {
    setTimeout(() => aiTurnZJH(aiIndex + 1), 600);
  } else {
    endZJHRound();
  }
}

function endZJHRound() {
  state.round++;
  if (state.round >= 5) {
    // 比牌
    showdownZJH();
  } else {
    // 继续下一轮，玩家回合
    const player = state.players[0];
    if (!player.folded) {
      setPlayerTurn(true);
      log(`=== 第 ${state.round + 1} 轮 ===`, 'system');
    } else {
      // 玩家已弃牌，AI之间比牌
      showdownZJH();
    }
  }
}

function showdownZJH() {
  const active = state.players.filter(p => !p.folded);
  if (active.length === 0) return;

  let winner = active[0];
  for (let i = 1; i < active.length; i++) {
    if (compareZJH(active[i].cards, winner.cards) > 0) {
      winner = active[i];
    }
  }

  winner.chips += state.pot;
  const evalW = evaluateZJH(winner.cards);

  if (winner.id === 'player') {
    state.chips = winner.chips;
    showModal('胜利！', `你的${evalW.name}获胜！赢得 ${state.pot} 筹码`, true);
  } else {
    // 显示玩家牌和结果
    state.players[0].seen = true;
    renderZJH();
    const evalP = evaluateZJH(state.players[0].cards);
    showModal('失败', `${winner.name} 的${evalW.name}击败了你的${evalP.name}`, false);
  }

  state.gameOver = true;
  renderZJH();
}

// ==================== 二十一点 ====================
function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (['J', 'Q', 'K'].includes(c.rank)) total += 10;
    else total += c.value;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function startBJ() {
  state.deck = createDeck();
  state.pot = 0;
  state.gameOver = false;

  state.players = [
    { id: 'player', name: state.user || '你', cards: [], chips: state.chips, bet: 0, busted: false, ai: false },
    { id: 'dealer', name: '庄家', cards: [], chips: 999999, bet: 0, busted: false, ai: true }
  ];

  // 下注
  const bet = 500;
  state.players[0].chips -= bet;
  state.players[0].bet = bet;
  state.pot = bet;
  state.chips = state.players[0].chips;

  // 发牌
  for (let i = 0; i < 2; i++) {
    state.players[0].cards.push(drawCard());
    state.players[1].cards.push(drawCard());
  }

  state.gameData = { type: 'bj', playerDone: false };
  renderBJ();
  log('=== 二十一点开局 ===', 'system');
  log(`下注 ${bet}`, 'system');
  setPlayerTurn(true);

  // 检查黑杰克
  if (handValue(state.players[0].cards) === 21) {
    log('黑杰克！', 'win');
    setTimeout(() => dealerTurnBJ(), 500);
  }
}

function renderBJ() {
  const player = state.players[0];
  const dealer = state.players[1];

  // 玩家牌
  $('player-cards').innerHTML = player.cards.map(c => cardHTML(c)).join('');
  $('player-hand').textContent = `点数: ${handValue(player.cards)}`;
  $('player-name').innerHTML = `${player.name} <span style="color:var(--gold)">${player.chips}</span>`;

  // 庄家牌 (第一张暗牌)
  if (!state.gameData.playerDone && !state.gameOver) {
    const dealerCards = [cardHTML(null, true), cardHTML(dealer.cards[1])].join('');
    $('ai1-cards').innerHTML = dealerCards;
    $('ai1-hand').textContent = '';
  } else {
    $('ai1-cards').innerHTML = dealer.cards.map(c => cardHTML(c)).join('');
    $('ai1-hand').textContent = `点数: ${handValue(dealer.cards)}`;
  }
  $('ai1-name').textContent = dealer.name;

  // 隐藏AI2
  $('ai2-area').style.display = 'none';
  $('ai2-cards').innerHTML = '';
  $('ai2-hand').textContent = '';

  $('pot-amount').textContent = state.pot.toLocaleString();
  updateChips();
}

function gameActionBJ(action) {
  if (!state.isPlayerTurn || state.gameOver) return;
  const player = state.players[0];

  switch (action) {
    case 'hit':
      player.cards.push(drawCard());
      const val = handValue(player.cards);
      log(`${player.name} 要牌，点数 ${val}`);
      renderBJ();
      if (val > 21) {
        player.busted = true;
        log(`${player.name} 爆牌！`, 'lose');
        state.gameData.playerDone = true;
        setPlayerTurn(false);
        setTimeout(() => dealerTurnBJ(), 800);
      }
      break;

    case 'stand':
      log(`${player.name} 停牌`);
      state.gameData.playerDone = true;
      setPlayerTurn(false);
      setTimeout(() => dealerTurnBJ(), 800);
      break;

    case 'double':
      if (player.cards.length === 2 && player.chips >= player.bet) {
        player.chips -= player.bet;
        player.bet *= 2;
        state.pot = player.bet;
        state.chips = player.chips;
        player.cards.push(drawCard());
        const v = handValue(player.cards);
        log(`${player.name} 双倍下注，要牌后点数 ${v}`);
        renderBJ();
        if (v > 21) {
          player.busted = true;
          log(`${player.name} 爆牌！`, 'lose');
        }
        state.gameData.playerDone = true;
        setPlayerTurn(false);
        setTimeout(() => dealerTurnBJ(), 800);
      }
      break;
  }
}

function dealerTurnBJ() {
  const dealer = state.players[1];
  const player = state.players[0];

  // 显示庄家暗牌
  renderBJ();
  log('庄家亮牌...');

  function dealerHit() {
    const val = handValue(dealer.cards);
    if (val < 17) {
      setTimeout(() => {
        dealer.cards.push(drawCard());
        const newVal = handValue(dealer.cards);
        log(`庄家要牌，点数 ${newVal}`);
        renderBJ();
        if (newVal > 21) {
          dealer.busted = true;
          log('庄家爆牌！', 'win');
          endBJ();
        } else {
          dealerHit();
        }
      }, 600);
    } else {
      log(`庄家停牌，点数 ${val}`);
      endBJ();
    }
  }

  setTimeout(dealerHit, 800);
}

function endBJ() {
  const player = state.players[0];
  const dealer = state.players[1];
  const pVal = handValue(player.cards);
  const dVal = handValue(dealer.cards);

  let win = false;
  let msg = '';

  if (player.busted) {
    msg = `你爆牌了(${pVal})，输掉 ${player.bet} 筹码`;
    win = false;
  } else if (dealer.busted) {
    const winAmount = player.bet * 2;
    player.chips += winAmount;
    state.chips = player.chips;
    msg = `庄家爆牌！你赢得 ${winAmount} 筹码`;
    win = true;
  } else if (pVal > dVal) {
    const winAmount = player.bet * 2;
    player.chips += winAmount;
    state.chips = player.chips;
    msg = `你 ${pVal} 点 > 庄家 ${dVal} 点，赢得 ${winAmount} 筹码`;
    win = true;
  } else if (pVal < dVal) {
    msg = `你 ${pVal} 点 < 庄家 ${dVal} 点，输掉 ${player.bet} 筹码`;
    win = false;
  } else {
    // 平局，退还赌注
    player.chips += player.bet;
    state.chips = player.chips;
    msg = `平局 ${pVal} 点，退还赌注`;
    win = false; // 不算赢也不算输
    showModal('平局', msg, false);
    state.gameOver = true;
    renderBJ();
    return;
  }

  showModal(win ? '胜利！' : '失败', msg, win);
  state.gameOver = true;
  renderBJ();
}

// ==================== 操作路由 ====================
function gameAction(action) {
  if (state.currentGame === 'zjh') {
    gameActionZJH(action);
  } else if (state.currentGame === 'bj') {
    gameActionBJ(action);
  }
}

function gameActionZJH(action) {
  if (!state.isPlayerTurn || state.gameOver) return;
  const player = state.players[0];

  switch (action) {
    case 'fold':
      player.folded = true;
      log(`${player.name} 弃牌`);
      setPlayerTurn(false);
      checkZJHEnd();
      break;

    case 'check':
      if (!player.seen) {
        player.seen = true;
        log(`${player.name} 看牌`);
        renderZJH();
      }
      break;

    case 'call':
      if (!player.seen) {
        player.seen = true;
        log(`${player.name} 看牌后跟注 ${state.currentBet}`);
      } else {
        log(`${player.name} 跟注 ${state.currentBet}`);
      }
      const callAmount = state.currentBet;
      player.chips -= callAmount;
      player.bet += callAmount;
      state.pot += callAmount;
      state.chips = player.chips;
      setPlayerTurn(false);
      checkZJHEnd();
      break;

    case 'raise':
      $('bet-control').style.display = 'flex';
      const slider = $('bet-slider');
      slider.max = Math.min(player.chips, 5000);
      slider.value = state.currentBet * 2;
      $('bet-display').textContent = slider.value;
      slider.oninput = () => { $('bet-display').textContent = slider.value; };
      // 点击加注按钮确认
      const confirmRaise = () => {
        const raiseAmount = parseInt(slider.value);
        if (!player.seen) player.seen = true;
        player.chips -= raiseAmount;
        player.bet += raiseAmount;
        state.pot += raiseAmount;
        state.currentBet = raiseAmount;
        state.chips = player.chips;
        log(`${player.name} 加注到 ${raiseAmount}`);
        $('bet-control').style.display = 'none';
        renderZJH();
        setPlayerTurn(false);
        checkZJHEnd();
      };
      // 临时绑定
      $('btn-raise').onclick = confirmRaise;
      return;

    case 'allin':
      const allInAmount = player.chips;
      if (!player.seen) player.seen = true;
      player.chips = 0;
      player.bet += allInAmount;
      state.pot += allInAmount;
      state.currentBet = Math.max(state.currentBet, allInAmount);
      state.chips = 0;
      log(`${player.name} ALL IN ${allInAmount}！`);
      renderZJH();
      setPlayerTurn(false);
      checkZJHEnd();
      break;
  }

  renderZJH();
}

// 二十一点操作按钮绑定
function setupBJButtons() {
  $('btn-fold').textContent = '停牌';
  $('btn-fold').onclick = () => gameActionBJ('stand');
  $('btn-check').textContent = '要牌';
  $('btn-check').onclick = () => gameActionBJ('hit');
  $('btn-call').textContent = '双倍';
  $('btn-call').onclick = () => gameActionBJ('double');
  $('btn-raise').style.display = 'none';
  $('btn-allin').style.display = 'none';
  $('bet-control').style.display = 'none';
}

// 炸金花操作按钮绑定
function setupZJHButtons() {
  $('btn-fold').textContent = '弃牌';
  $('btn-fold').onclick = () => gameAction('fold');
  $('btn-check').textContent = '看牌';
  $('btn-check').onclick = () => gameAction('check');
  $('btn-call').textContent = '跟注';
  $('btn-call').onclick = () => gameAction('call');
  $('btn-raise').style.display = 'inline-block';
  $('btn-raise').textContent = '加注';
  $('btn-raise').onclick = () => gameAction('raise');
  $('btn-allin').style.display = 'inline-block';
  $('btn-allin').textContent = 'All In';
  $('btn-allin').onclick = () => gameAction('allin');
}

// 覆盖startGame来设置按钮
const originalStartGame = startGame;
startGame = function(type) {
  state.currentGame = type;
  state.gameOver = false;
  clearLog();
  showScreen('game');
  $('game-title').textContent = type === 'zjh' ? '炸金花' : '二十一点';
  $('ai2-area').style.display = 'block';

  if (type === 'zjh') {
    setupZJHButtons();
    startZJH();
  } else {
    setupBJButtons();
    startBJ();
  }
};

// ==================== 排行榜 ====================
function updateLeaderboard() {
  const tbody = $('lb-body');
  const entries = [
    { name: '废土之王', chips: 99999 },
    { name: '幸运儿', chips: 88888 },
    { name: '赌神', chips: 77777 }
  ];
  if (state.user && state.chips > 0) {
    entries.push({ name: state.user, chips: state.chips });
    entries.sort((a, b) => b.chips - a.chips);
  }
  tbody.innerHTML = entries.slice(0, 5).map((e, i) =>
    `<tr><td class="lb-rank">${i + 1}</td><td>${e.name}</td><td style="color:var(--gold)">${e.chips.toLocaleString()}</td></tr>`
  ).join('');
}

// 定期更新排行榜
setInterval(updateLeaderboard, 5000);
updateLeaderboard();
