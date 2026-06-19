// ============================================================
// 末日赌场 - PeerJS 真人联机娱乐系统
// 炸金花 + 二十一点
// ============================================================
'use strict';

// ==================== 全局 ====================
const G = {
  user: null, chips: 10000,
  peer: null, conn: null, connections: new Map(),
  isHost: false, roomCode: null, gameType: null,
  players: [], deck: [], pot: 0, currentBet: 0,
  myTurn: false, gameOver: false, logs: [],
  roomPeers: [] // {id, name, conn}
};

const SUITS = ['♠','♥','♣','♦'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};

function $(id){return document.getElementById(id)}

// ==================== 存储 ====================
function load(){const s=localStorage.getItem('wl_user');if(s){const d=JSON.parse(s);G.user=d.n;G.chips=d.c||10000;return true}return false}
function save(){if(G.user)localStorage.setItem('wl_user',JSON.stringify({n:G.user,c:G.chips}))}

// ==================== 牌 ====================
function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({s,r,v:RV[r],red:s==='♥'||s==='♦'});return shuffle(d)}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function cardHTML(c,hidden){if(hidden)return'<div class="card-back"></div>';return`<div class="card ${c.red?'red':'black'}"><div class="card-rank">${c.r}</div><div class="card-suit">${c.s}</div></div>`}

// ==================== UI ====================
function showScreen(n){$('auth-screen').style.display=n==='auth'?'flex':'none';$('main-screen').style.display=n==='main'?'block':'none';$('game-screen').style.display=n==='game'?'block':'none'}
function updateChips(){$('user-chips').textContent=G.chips.toLocaleString();$('game-chips').textContent=G.chips.toLocaleString();save()}
function log(m,t=''){G.logs.push({m,t});if(G.logs.length>50)G.logs.shift();const p=$('game-log'),e=document.createElement('div');e.className='log-entry '+t;e.textContent=m;p.appendChild(e);p.scrollTop=p.scrollHeight}
function clearLog(){G.logs=[];$('game-log').innerHTML=''}
function showModal(t,m,w){$('modal-title').textContent=t;$('modal-title').className='modal-title '+(w?'win':'lose');$('modal-text').textContent=m;$('result-modal').classList.add('open')}
function closeModal(){$('result-modal').classList.remove('open')}

// ==================== 登录 ====================
$('auth-btn').onclick=()=>{
  const n=$('auth-name').value.trim();
  if(!n){$('auth-hint').textContent='请输入昵称';return}
  G.user=n;if(!load())G.chips=10000;
  save();$('user-name').textContent=n;updateChips();
  showScreen('main');initPeer();
};
function logout(){G.user=null;localStorage.removeItem('wl_user');if(G.peer)G.peer.destroy();showScreen('auth')}
if(load()){$('user-name').textContent=G.user;updateChips();showScreen('main');initPeer()}

// ==================== PeerJS 联机 ====================
function genCode(){return Math.random().toString(36).substring(2,8).toUpperCase()}

function initPeer(){
  if(G.peer)return;
  G.peer=new Peer();
  G.peer.on('open',id=>{
    $('online-dot').classList.remove('off');
    $('conn-status').textContent='在线';
    $('conn-status').style.color='var(--green)';
  });
  G.peer.on('error',err=>{
    console.warn('Peer error:',err);
    if(err.type==='unavailable-id'){
      // ID冲突，重新创建
      G.peer.destroy();
      G.peer=new Peer();
      setupPeerHandlers();
    }
  });
  G.peer.on('connection',conn=>{
    handleConnection(conn);
  });
}

function setupPeerHandlers(){
  G.peer.on('open',()=>{$('online-dot').classList.remove('off');$('conn-status').textContent='在线';$('conn-status').style.color='var(--green)'});
  G.peer.on('connection',conn=>handleConnection(conn));
}

function handleConnection(conn){
  conn.on('open',()=>{
    conn.on('data',d=>handleMsg(d,conn));
    conn.on('close',()=>{G.roomPeers=G.roomPeers.filter(p=>p.conn!==conn);updateRoomPlayers()});
  });
}

function send(data){if(G.conn&&G.conn.open)G.conn.send(data)}
function broadcast(data){
  if(G.isHost){for(const p of G.roomPeers)if(p.conn.open)p.conn.send(data)}
  else if(G.conn&&G.conn.open)G.conn.send(data);
}

function handleMsg(d,fromConn){
  switch(d.type){
    case 'join':{
      G.roomPeers.push({id:fromConn.peer,name:d.name,conn:fromConn});
      updateRoomPlayers();
      fromConn.send({type:'welcome',players:G.roomPeers.map(p=>({id:p.id,name:p.name})),hostName:G.user});
      break;
    }
    case 'welcome':{
      G.isHost=false;
      G.roomPeers=[{id:'host',name:d.hostName,conn:G.conn}];
      for(const p of d.players)G.roomPeers.push(p);
      updateRoomPlayers();
      $('join-status').textContent='已加入房间！等待房主开始...';
      $('join-status').className='status-text ok';
      break;
    }
    case 'player-joined':{
      G.roomPeers.push({id:d.id,name:d.name,conn:null});
      updateRoomPlayers();
      break;
    }
    case 'start-game':{
      G.gameType=d.game;
      G.deck=d.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
      G.players=d.players;
      G.pot=d.pot;
      G.currentBet=d.currentBet;
      showScreen('game');
      $('game-title').textContent=d.game==='zjh'?'炸金花':'二十一点';
      clearLog();log('=== 游戏开始 ===','system');
      renderTable();
      break;
    }
    case 'action':{handleRemoteAction(d);break}
    case 'result':{showModal(d.title,d.text,d.win);G.gameOver=true;break}
    case 'chat':{log(`${d.name}: ${d.text}`);break}
  }
}

// ==================== 房间系统 ====================
function openRoom(gameType){
  G.gameType=gameType;
  $('room-panel').style.display='block';
  $('room-title').textContent='创建或加入房间';
  $('room-create-area').style.display='block';
  $('room-join-area').style.display='block';
  $('room-code').textContent='----';
  $('room-players').innerHTML='';
  $('start-btn').disabled=true;
  $('start-btn').textContent='等待玩家加入...';
  $('join-status').textContent='';
}

function createRoom(){
  G.isHost=true;
  G.roomCode=genCode();
  const peerId='wl-'+G.roomCode.toLowerCase()+'-host';
  
  // 用固定ID重新创建Peer
  if(G.peer)G.peer.destroy();
  G.peer=new Peer(peerId);
  G.peer.on('open',()=>{
    $('online-dot').classList.remove('off');
    $('conn-status').textContent='在线 · 房主';
    $('conn-status').style.color='var(--green)';
    $('room-code').textContent=G.roomCode;
    G.roomPeers=[{id:'host',name:G.user,conn:null}];
    updateRoomPlayers();
  });
  G.peer.on('error',err=>{
    if(err.type==='unavailable-id'){
      $('join-status').textContent='房间码冲突，请重试';
      $('join-status').className='status-text error';
    }
  });
  G.peer.on('connection',conn=>{
    handleConnection(conn);
  });
  
  $('room-create-area').style.display='block';
  $('room-join-area').style.display='none';
}

function joinRoom(){
  const code=$('join-code').value.trim().toUpperCase();
  if(code.length<4){$('join-status').textContent='请输入有效的房间码';$('join-status').className='status-text error';return}
  
  $('join-status').textContent='正在连接...';
  $('join-status').className='status-text';
  
  const hostId='wl-'+code.toLowerCase()+'-host';
  G.conn=G.peer.connect(hostId);
  
  G.conn.on('open',()=>{
    G.conn.send({type:'join',name:G.user});
  });
  
  G.conn.on('data',d=>handleMsg(d,G.conn));
  
  G.conn.on('error',err=>{
    if(err.type==='peer-unavailable'){
      $('join-status').textContent='房间不存在或已关闭';
      $('join-status').className='status-text error';
    }else{
      $('join-status').textContent='连接失败';
      $('join-status').className='status-text error';
    }
  });
}

function copyCode(){
  if(G.roomCode){
    navigator.clipboard.writeText(G.roomCode).then(()=>{
      $('room-hint').textContent='已复制！发给好友让他们加入';
      setTimeout(()=>{$('room-hint').textContent='点击房间码复制，发给好友加入'},2000);
    }).catch(()=>{});
  }else{
    createRoom();
  }
}

function updateRoomPlayers(){
  const el=$('room-players');
  el.innerHTML=G.roomPeers.map((p,i)=>`
    <div class="room-player">
      <div class="dot ${p.id==='host'?'':'waiting'}"></div>
      <div class="name">${p.name}${p.id==='host'?' (房主)':''}</div>
      <div class="tag">${p.id==='host'?'已连接':'已加入'}</div>
    </div>
  `).join('');
  
  // 房主可以开始
  if(G.isHost){
    const count=G.roomPeers.length;
    const min=G.gameType==='zjh'?2:2;
    $('start-btn').disabled=count<min;
    $('start-btn').textContent=count>=min?`开始游戏 (${count}人)`:`等待玩家加入... (至少${min}人)`;
  }
}

function closeRoom(){
  $('room-panel').style.display='none';
  // 清理连接
  for(const p of G.roomPeers){
    if(p.conn&&p.conn.open)p.conn.close();
  }
  G.roomPeers=[];
  G.conn=null;
  G.roomCode=null;
  G.isHost=false;
}

function hostStartGame(){
  if(!G.isHost||G.roomPeers.length<2)return;
  
  const deck=makeDeck();
  const players=[];
  
  if(G.gameType==='zjh'){
    // 炸金花：每人3张
    for(let i=0;i<G.roomPeers.length;i++){
      players.push({
        id:G.roomPeers[i].id,
        name:G.roomPeers[i].name,
        cards:[deck.pop(),deck.pop(),deck.pop()],
        chips:10000,
        bet:100,
        folded:false,
        seen:false,
        isMe:G.roomPeers[i].id==='host'
      });
    }
    G.pot=players.length*100;
    G.currentBet=100;
  }else{
    // 二十一点
    for(let i=0;i<G.roomPeers.length;i++){
      players.push({
        id:G.roomPeers[i].id,
        name:G.roomPeers[i].name,
        cards:[deck.pop(),deck.pop()],
        chips:10000,
        bet:500,
        busted:false,
        isMe:G.roomPeers[i].id==='host'
      });
    }
    G.pot=players.length*500;
    G.currentBet=500;
  }
  
  G.players=players;
  G.gameOver=false;
  
  // 通知所有玩家
  const msg={
    type:'start-game',
    game:G.gameType,
    deck:deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),
    players:players.map(p=>({id:p.id,name:p.name,cards:p.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),chips:p.chips,bet:p.bet,folded:p.folded||false,seen:p.seen||false,busted:p.busted||false,isMe:p.id===G.roomPeers.find(rp=>rp.id==='host')?.id})),
    pot:G.pot,
    currentBet:G.currentBet
  };
  
  for(const p of G.roomPeers){
    if(p.conn&&p.conn.open){
      // 为每个玩家标记isMe
      const data=JSON.parse(JSON.stringify(msg));
      data.players.forEach(pl=>{pl.isMe=pl.id===p.id});
      p.conn.send(data);
    }
  }
  
  // 房主也进入游戏
  showScreen('game');
  $('game-title').textContent=G.gameType==='zjh'?'炸金花':'二十一点';
  clearLog();
  log('=== 游戏开始 ===','system');
  renderTable();
  
  // 炸金花：从第一个人开始
  if(G.gameType==='zjh'){
    G.myTurn=true;
    log('轮到你操作','system');
  }
}

// ==================== 渲染 ====================
function renderTable(){
  if(G.gameType==='zjh')renderZJH();
  else renderBJ();
  updateChips();
}

function renderZJH(){
  // 找到自己
  const me=G.players.find(p=>p.isMe);
  const others=G.players.filter(p=>!p.isMe);
  
  // 玩家
  const p0cards=me.seen?me.cards.map(c=>cardHTML(c)).join(''):me.cards.map(()=>cardHTML(null,true)).join('');
  $('p0-cards').innerHTML=p0cards;
  $('p0-hand').textContent=me.seen?evalZJH(me.cards).name:'未看牌';
  $('p0-name').innerHTML=`${me.name} <span style="color:var(--gold)">${me.chips}</span>`;
  $('p0-name').className='player-name'+(G.myTurn?' active':'');
  
  // 其他玩家
  for(let i=0;i<2;i++){
    const p=others[i];
    if(!p){
      $('p'+(i+1)+'-name').textContent='(空位)';
      $('p'+(i+1)+'-cards').innerHTML='';
      $('p'+(i+1)+'-hand').textContent='';
      continue;
    }
    const showCards=p.folded||G.gameOver;
    const cards=showCards?p.cards.map(c=>cardHTML(c)).join(''):p.cards.map(()=>cardHTML(null,true)).join('');
    $('p'+(i+1)+'-cards').innerHTML=cards;
    $('p'+(i+1)+'-hand').textContent=showCards?evalZJH(p.cards).name:'';
    $('p'+(i+1)+'-name').textContent=`${p.name} ${p.folded?'(弃牌)':''}`;
  }
  
  $('pot-amount').textContent=G.pot.toLocaleString();
  
  // 按钮
  if(G.myTurn&&!G.gameOver){
    $('action-bar').innerHTML=`
      <button class="action-btn" onclick="doAction('fold')">弃牌</button>
      <button class="action-btn" onclick="doAction('look')">看牌</button>
      <button class="action-btn warning" onclick="doAction('call')">跟注 ${G.currentBet}</button>
      <button class="action-btn primary" onclick="doAction('raise')">加注</button>
    `;
  }else{
    $('action-bar').innerHTML=`<div style="color:var(--dim);font-size:13px">${G.gameOver?'游戏结束':'等待其他玩家...'}</div>`;
  }
}

function renderBJ(){
  const me=G.players.find(p=>p.isMe);
  const others=G.players.filter(p=>!p.isMe);
  
  $('p0-cards').innerHTML=me.cards.map(c=>cardHTML(c)).join('');
  $('p0-hand').textContent=`点数: ${bjValue(me.cards)}`;
  $('p0-name').innerHTML=`${me.name} <span style="color:var(--gold)">${me.chips}</span>`;
  $('p0-name').className='player-name'+(G.myTurn?' active':'');
  
  for(let i=0;i<2;i++){
    const p=others[i];
    if(!p){$('p'+(i+1)+'-name').textContent='(空位)';$('p'+(i+1)+'-cards').innerHTML='';$('p'+(i+1)+'-hand').textContent='';continue}
    const show=G.gameOver;
    $('p'+(i+1)+'-cards').innerHTML=show?p.cards.map(c=>cardHTML(c)).join(''):p.cards.map(()=>cardHTML(null,true)).join('');
    $('p'+(i+1)+'-hand').textContent=show?`点数: ${bjValue(p.cards)}`:'';
    $('p'+(i+1)+'-name').textContent=p.name;
  }
  
  $('pot-amount').textContent=G.pot.toLocaleString();
  
  if(G.myTurn&&!G.gameOver&&!me.busted){
    $('action-bar').innerHTML=`
      <button class="action-btn success" onclick="doAction('hit')">要牌</button>
      <button class="action-btn" onclick="doAction('stand')">停牌</button>
    `;
  }else{
    $('action-bar').innerHTML=`<div style="color:var(--dim);font-size:13px">${G.gameOver?'游戏结束':me.busted?'你爆牌了':'等待其他玩家...'}</div>`;
  }
}

// ==================== 炸金花逻辑 ====================
function evalZJH(cards){
  const sorted=[...cards].sort((a,b)=>b.v-a.v);
  const[c1,c2,c3]=sorted;
  const flush=c1.s===c2.s&&c2.s===c3.s;
  const straight=c1.v===c2.v+1&&c2.v===c3.v+1;
  const three=c1.v===c2.v&&c2.v===c3.v;
  const pair=c1.v===c2.v||c2.v===c3.v||c1.v===c3.v;
  if(three)return{type:6,name:'豹子',val:c1.v*1e6};
  if(flush&&straight)return{type:5,name:'同花顺',val:c1.v*1e5+c2.v*1e3+c3.v};
  if(flush)return{type:4,name:'同花',val:c1.v*1e4+c2.v*100+c3.v};
  if(straight)return{type:3,name:'顺子',val:c1.v*1e4+c2.v*100+c3.v};
  if(pair){const pv=c1.v===c2.v?c1.v:c3.v;const k=c1.v===c2.v?c3.v:c1.v;return{type:2,name:'对子',val:pv*1e4+k}}
  return{type:1,name:'散牌',val:c1.v*1e4+c2.v*100+c3.v};
}

function cmpZJH(a,b){const ea=evalZJH(a),eb=evalZJH(b);return ea.type!==eb.type?ea.type-eb.type:ea.val-eb.val}

// ==================== 二十一点逻辑 ====================
function bjValue(cards){
  let t=0,a=0;
  for(const c of cards){if(c.r==='A'){a++;t+=11}else if('JQK'.includes(c.r))t+=10;else t+=c.v}
  while(t>21&&a>0){t-=10;a--}
  return t;
}

// ==================== 玩家操作 ====================
function doAction(action){
  const me=G.players.find(p=>p.isMe);
  if(!me||!G.myTurn||G.gameOver)return;
  
  if(G.gameType==='zjh'){
    doZJHAction(me,action);
  }else{
    doBJAction(me,action);
  }
  
  broadcast({type:'action',playerId:me.id,action,data:{cards:G.players.map(p=>({id:p.id,cards:p.cards,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted})),pot:G.pot,currentBet:G.currentBet,gameOver:G.gameOver,result:G.lastResult||null}});
  renderTable();
}

function doZJHAction(me,action){
  switch(action){
    case 'fold':
      me.folded=true;G.myTurn=false;
      log(`${me.name} 弃牌`);
      checkZJHEnd();
      break;
    case 'look':
      me.seen=true;
      log(`${me.name} 看牌`);
      break;
    case 'call':
      if(!me.seen)me.seen=true;
      me.chips-=G.currentBet;me.bet+=G.currentBet;G.pot+=G.currentBet;
      G.myTurn=false;
      log(`${me.name} 跟注 ${G.currentBet}`);
      checkZJHEnd();
      break;
    case 'raise':
      const amt=Math.min(me.chips,G.currentBet*2);
      if(!me.seen)me.seen=true;
      me.chips-=amt;me.bet+=amt;G.pot+=amt;G.currentBet=amt;
      G.myTurn=false;
      log(`${me.name} 加注到 ${amt}`);
      checkZJHEnd();
      break;
  }
}

function checkZJHEnd(){
  const active=G.players.filter(p=>!p.folded);
  if(active.length<=1){
    const winner=active[0]||G.players[0];
    winner.chips+=G.pot;
    G.gameOver=true;
    G.lastResult={winner:winner.name,amount:G.pot};
    const isMe=winner.isMe;
    showModal(isMe?'胜利！':'失败',isMe?`你赢得了 ${G.pot} 筹码`:`${winner.name} 赢得了 ${G.pot} 筹码`,isMe);
    broadcast({type:'result',title:isMe?'胜利！':'失败',text:isMe?`你赢得了 ${G.pot} 筹码`:`${winner.name} 赢得了 ${G.pot} 筹码`,win:isMe});
  }else{
    // 下一轮：让下一个未弃牌的玩家操作
    const idx=G.players.indexOf(active[0]);
    const next=active[(active.indexOf(G.players.find(p=>p.isMe))+1)%active.length];
    // 简化：轮流操作
    setTimeout(()=>{
      const myIdx=active.findIndex(p=>p.isMe);
      if(myIdx>=0){
        G.myTurn=true;
        log('轮到你操作','system');
        renderTable();
      }
    },500);
  }
}

function doBJAction(me,action){
  switch(action){
    case 'hit':
      me.cards.push(G.deck.pop());
      log(`${me.name} 要牌，点数 ${bjValue(me.cards)}`);
      if(bjValue(me.cards)>21){
        me.busted=true;G.myTurn=false;
        log(`${me.name} 爆牌！`);
        checkBJEnd();
      }
      break;
    case 'stand':
      G.myTurn=false;
      log(`${me.name} 停牌，点数 ${bjValue(me.cards)}`);
      checkBJEnd();
      break;
  }
}

function checkBJEnd(){
  const allDone=G.players.every(p=>p.busted||!G.myTurn===false);
  // 简化：所有人停牌后比牌
  const allStand=G.players.filter(p=>!p.isMe).every(p=>p.busted||bjValue(p.cards)>=17);
  const me=G.players.find(p=>p.isMe);
  if((me.busted||bjValue(me.cards)>=17)&&allStand){
    // 比牌
    const active=G.players.filter(p=>!p.busted);
    let best=active[0];
    for(let i=1;i<active.length;i++){
      if(bjValue(active[i].cards)>bjValue(best.cards))best=active[i];
    }
    best.chips+=G.pot;
    G.gameOver=true;
    G.lastResult={winner:best.name,amount:G.pot};
    const isMe=best.isMe;
    showModal(isMe?'胜利！':'失败',isMe?`你以 ${bjValue(best.cards)} 点获胜！`:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,isMe);
    broadcast({type:'result',title:isMe?'胜利！':'失败',text:isMe?`你以 ${bjValue(best.cards)} 点获胜！`:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,win:isMe});
  }
}

// ==================== 远程操作处理 ====================
function handleRemoteAction(d){
  const{playerId,action,data}=d;
  if(data){
    // 同步状态
    G.pot=data.pot;
    G.currentBet=data.currentBet;
    G.gameOver=data.gameOver||false;
    for(const rp of data.cards){
      const lp=G.players.find(p=>p.id===rp.id);
      if(lp){lp.chips=rp.chips;lp.bet=rp.bet;lp.folded=rp.folded;lp.seen=rp.seen;lp.busted=rp.busted}
    }
  }
  const remotePlayer=G.players.find(p=>p.id===playerId);
  if(remotePlayer){
    const actionNames={fold:'弃牌',look:'看牌',call:'跟注',raise:'加注',hit:'要牌',stand:'停牌'};
    log(`${remotePlayer.name} ${actionNames[action]||action}`);
  }
  if(!G.gameOver){
    // 轮到我
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.folded&&!me.busted){
      G.myTurn=true;
      log('轮到你操作','system');
    }
  }
  renderTable();
}

// ==================== 退出游戏 ====================
function leaveGame(){
  G.gameOver=true;G.myTurn=false;
  broadcast({type:'action',playerId:G.players.find(p=>p.isMe)?.id,action:'fold',data:{gameOver:true}});
  showScreen('main');
  closeRoom();
}

// ==================== 房间码点击创建 ====================
$('room-code').addEventListener('click',()=>{
  if($('room-code').textContent==='----')createRoom();
});
