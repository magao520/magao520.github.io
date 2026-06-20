// ============================================================
// 废土交易所 - 生存物资赌场 v7
// 新增：音效系统、玩法说明、骰子猜大小、牌型提示
// 20轮审查修复：内存泄漏、XSS、状态同步、空安全等
// ============================================================
'use strict';

const MQTT_BROKER='wss://broker.emqx.io:8084/mqtt';
const TOPIC_LOBBY='wl_lobby_v6';
const TOPIC_ROOMS='wl_rooms_v6/#';
const TOPIC_ROOM_PREFIX='wl_rooms_v6';
const TOPIC_PRESENCE='wl_presence_v6';

const G = {
  user:null, chips:50,
  isHost:false, roomCode:null, gameType:null,
  players:[], deck:[], pot:0, currentBet:0,
  myTurn:false, gameOver:false, logs:[],
  roomPeers:[], createGameType:'zjh',
  candleTimer:null, candleTime:0, candleMax:180,
  inGame:false,
  mqtt:null, mqttConnected:false,
  knownRooms:{},
  heartbeatTimer:null,
  myId:null,
  turnIndex:0, playerOrder:[],
  roundCount:0,
  resultShown:false,
  // 在线幸存者
  onlineUsers:{}, // {id: {name, ts, roomCode}}
  presenceTimer:null,
  diceState:{dice:[null,null,null],sum:0,phase:'bet'}
};

const SUITS=['♠','♥','♣','♦'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
const Sound={
  _ctx:null,_enabled:true,
  _init(){if(this._ctx)return;try{this._ctx=new(window.AudioContext||window.webkitAudioContext)();if(this._ctx.state==='suspended')this._ctx.resume()}catch(e){this._enabled=false}},
  _p(f,d,t='square',g=0.08,delay=0){
    if(!this._enabled)return;this._init();
    const now=this._ctx.currentTime+delay;
    const o=this._ctx.createOscillator(),v=this._ctx.createGain();
    o.type=t;o.frequency.value=f;v.gain.value=g;
    o.connect(v);v.connect(this._ctx.destination);
    v.gain.exponentialRampToValueAtTime(0.001,now+0.15);
    o.start(now);o.stop(now+0.15);
  },
  deal(){this._p(800,0.06,'square',0.05);setTimeout(()=>this._p(1000,0.06,'square',0.05),60)},
  chip(){this._p(600,0.05,'sine',0.08);setTimeout(()=>this._p(900,0.05,'sine',0.08),50)},
  win(){this._p(523,.12,'sine',0.08);setTimeout(()=>this._p(659,.12,'sine',0.08),120);setTimeout(()=>this._p(784,.2,'sine',0.08),240)},
  lose(){this._p(400,.15,'sine',0.06);setTimeout(()=>this._p(300,.25,'sine',0.06),150)},
  click(){this._p(1200,0.03,'square',0.03)},
  dice(){for(let i=0;i<5;i++)setTimeout(()=>this._p(200+Math.random()*200,0.04,'triangle',0.04),i*40)},
  fold(){this._p(200,.15,'sawtooth',0.04)},
  toggle(){this._enabled=!this._enabled;if(this._enabled)this.chip();else this.fold();return this._enabled}
};
function toggleSound(){
  const on=Sound.toggle();
  const el=document.getElementById('sound-toggle');
  if(el){el.textContent=on?'🔊':'🔇';el.classList.toggle('muted',!on)}
}
const MAX_ROUNDS=20;
const MAX_SEATS=3;

function $(id){return document.getElementById(id)}
function genId(){return Math.random().toString(36).substr(2,10)}
function genCode(){return Math.random().toString(36).substring(2,8).toUpperCase()}

// ==================== 存储 ====================
function load(){try{const s=localStorage.getItem('wl_user');if(s){const d=JSON.parse(s);G.user=d.n;G.chips=d.c||50;return true}}catch(e){}return false}
function save(){if(G.user)try{localStorage.setItem('wl_user',JSON.stringify({n:G.user,c:G.chips}))}catch(e){}}

// ==================== 牌 ====================
function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({s,r,v:RV[r],red:s==='♥'||s==='♦'});return shuffle(d)}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function cardHTML(c,hidden){if(hidden)return'<div class="card-back"></div>';return`<div class="card ${c.red?'red':'black'}"><div class="card-rank">${c.r}</div><div class="card-suit">${c.s}</div></div>`}
function cloneCard(c){return{s:c.s,r:c.r,v:c.v,red:c.red}}
function cloneCards(a){return a.map(cloneCard)}

// ==================== UI ====================
function showScreen(n){
  const a=$('auth-screen'),m=$('main-screen'),g=$('game-screen');
  if(a)a.style.display=n==='auth'?'flex':'none';
  if(m)m.style.display=n==='main'?'block':'none';
  if(g)g.style.display=n==='game'?'block':'none';
}
function updateChips(){
  if(G.inGame){const me=G.players.find(p=>p.isMe);if(me&&me.chips!==undefined)G.chips=me.chips}
  const uc=$('user-chips'),gc=$('game-chips');
  if(uc)uc.textContent=G.chips;
  if(gc)gc.textContent=G.chips;
  save();
}
function log(m,t=''){
  G.logs.push({m,t});
  if(G.logs.length>50){G.logs.shift();const p=$('game-log');if(p){const f=p.querySelector('.log-entry');if(f)f.remove()}}
  const p=$('game-log');
  if(!p)return;
  const e=document.createElement('div');
  e.className='log-entry '+(t||'');
  e.textContent=m;
  p.appendChild(e);
  p.scrollTop=p.scrollHeight;
}
function clearLog(){G.logs=[];const p=$('game-log');if(p)p.innerHTML=''}
function showModal(t,m,w){
  const mt=$('modal-title'),txt=$('modal-text'),rm=$('result-modal');
  if(mt){mt.textContent=t;mt.className='modal-title '+(w?'win':'lose')}
  if(txt)txt.textContent=m;
  if(rm)rm.classList.add('open');
}
function closeModal(){
  const rm=$('result-modal');
  if(rm)rm.classList.remove('open');
  if(G.gameOver){
    G.inGame=false;G.gameOver=false;G.resultShown=false;
    G.myTurn=false;
  }
  if(G.roomCode){
    showScreen('main');
    showWaitPanel(G.isHost);
  }else{
    showScreen('main');
    renderLobby();
  }
}
function toast(msg){
  const existing=document.querySelectorAll('.toast');
  if(existing.length>=3)existing[0].remove();
  const t=document.createElement('div');
  t.className='toast';
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{if(t.parentNode)t.remove()},3500);
}
function escHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

// ==================== 在线幸存者列表 ====================
function publishPresence(){
  if(!G.mqtt||!G.mqttConnected||!G.myId)return;
  const msg={id:G.myId,name:G.user,ts:Date.now(),room:G.roomCode||null};
  G.mqtt.publish(TOPIC_PRESENCE,JSON.stringify(msg),{qos:0,retain:false});
}

function handlePresenceMsg(msg){
  if(!msg||!msg.id||msg.id===G.myId)return;
  if(Date.now()-msg.ts>45000)return; // 45秒超时
  G.onlineUsers[msg.id]={name:msg.name,ts:msg.ts,room:msg.room};
  renderOnlineList();
}

function renderOnlineList(){
  const el=$('online-list');if(!el)return;
  const now=Date.now();
  // 清理过期
  for(const id in G.onlineUsers){if(now-G.onlineUsers[id].ts>45000)delete G.onlineUsers[id]}
  const users=Object.values(G.onlineUsers).sort((a,b)=>b.ts-a.ts);
  if(users.length===0){
    el.innerHTML='<div class="online-empty">暂无其他幸存者信号</div>';
    return;
  }
  el.innerHTML=users.map(u=>{
    const ago=Math.floor((now-u.ts)/1000);
    let timeStr;
    if(ago<5)timeStr='<span class="online-now">在线</span>';
    else if(ago<60)timeStr=`${ago}秒前`;
    else if(ago<3600)timeStr=`${Math.floor(ago/60)}分钟前`;
    else timeStr=`${Math.floor(ago/3600)}小时前`;
    const roomStr=u.room?`<span class="online-room">在${escHTML(u.room)}号桌</span>`:'<span class="online-room idle">在大厅闲逛</span>';
    return`<div class="online-item"><div class="online-avatar">${escHTML(u.name.charAt(0))}</div><div class="online-info"><div class="online-name">${escHTML(u.name)}</div><div class="online-detail">${roomStr} · ${timeStr}</div></div></div>`;
  }).join('');
}

// ==================== 登录 ====================
$('auth-btn').onclick=()=>{
  const n=$('auth-name').value.trim();
  const hint=$('auth-hint');
  if(!n){if(hint){hint.textContent='代号不能为空';hint.style.color='var(--accent)'}return}
  if(n.length>12){if(hint){hint.textContent='代号最多12个字符';hint.style.color='var(--accent)'}return}
  G.user=n;
  if(!load())G.chips=50;
  G.myId=genId();
  save();
  const un=$('user-name');
  if(un)un.textContent=n;
  updateChips();
  showScreen('main');
  initMQTT();
};

$('auth-name').onkeydown=(e)=>{if(e.key==='Enter')$('auth-btn').click()};

function logout(){
  cleanupAll();
  G.user=null;
  G.onlineUsers={};
  try{localStorage.removeItem('wl_user')}catch(e){}
  showScreen('auth');
}

// 自动登录
if(load()){
  G.myId=genId();
  const un=$('user-name');
  if(un)un.textContent=G.user;
  updateChips();
  showScreen('main');
  initMQTT();
}

// ==================== MQTT ====================
function initMQTT(){
  if(G.mqtt)return;
  try{
    G.mqtt=mqtt.connect(MQTT_BROKER,{
      clientId:'wl_'+(G.myId||genId()),
      clean:true,connectTimeout:10000,reconnectPeriod:3000,
      keepalive:60
    });
    G.mqtt.on('connect',()=>{
      G.mqttConnected=true;
      console.log('[MQTT] connected');
      const od=$('online-dot'),cs=$('conn-status');
      if(od)od.classList.remove('off');
      if(cs){cs.textContent='信号正常';cs.style.color='var(--green)'}
      G.mqtt.subscribe(TOPIC_LOBBY,{qos:0});
      G.mqtt.subscribe(TOPIC_ROOMS,{qos:0});
      G.mqtt.subscribe(TOPIC_PRESENCE,{qos:0});
      // 重连后重新订阅房间
      if(G.roomCode){
        G.mqtt.subscribe(roomTopic(G.roomCode),{qos:0});
        if(G.isHost)publishRoomInfo();
      }
      // 上线广播
      publishPresence();
      startPresence();
    });
    G.mqtt.on('message',(topic,payload)=>{
      try{
        const raw=payload.toString();
        if(!raw)return;
        const msg=JSON.parse(raw);
        if(topic===TOPIC_LOBBY){
          handleLobbyMsg(msg);
        }else if(topic===TOPIC_PRESENCE){
          handlePresenceMsg(msg);
        }else if(topic.startsWith(TOPIC_ROOM_PREFIX+'_chat/')){
          handleRoomMsg(msg);
        }else if(topic.startsWith(TOPIC_ROOM_PREFIX+'/')&&!topic.includes('_chat')){
          const code=topic.split('/').pop();
          handleRoomListMsg(code,msg);
        }
      }catch(e){console.warn('[MQTT] msg error:',e)}
    });
    G.mqtt.on('error',(err)=>{console.warn('[MQTT] error:',err.message);G.mqttConnected=false;
      const od=$('online-dot'),cs=$('conn-status');
      if(od)od.classList.add('off');
      if(cs){cs.textContent='信号异常';cs.style.color='var(--accent)'}
    });
    G.mqtt.on('reconnect',()=>{console.log('[MQTT] reconnecting...')});
    G.mqtt.on('close',()=>{
      G.mqttConnected=false;
      const od=$('online-dot'),cs=$('conn-status');
      if(od)od.classList.add('off');
      if(cs){cs.textContent='信号断开';cs.style.color='var(--accent)'}
    });
  }catch(e){console.warn('MQTT init failed:',e)}
}

function roomTopic(code){return TOPIC_ROOM_PREFIX+'_chat/'+code}

function publishRoomInfo(){
  if(!G.mqtt||!G.mqttConnected||!G.roomCode)return;
  const msg={code:G.roomCode,hostName:G.user,game:G.gameType,players:G.roomPeers.length,ts:Date.now(),hostId:G.myId};
  G.mqtt.publish(TOPIC_ROOM_PREFIX+'/'+G.roomCode,JSON.stringify(msg),{qos:0,retain:true});
}

function clearRoomInfo(){
  if(!G.mqtt||!G.mqttConnected||!G.roomCode)return;
  G.mqtt.publish(TOPIC_ROOM_PREFIX+'/'+G.roomCode,'',{qos:0,retain:true});
}

function publishLobby(action){
  if(!G.mqtt||!G.mqttConnected)return;
  const msg={action,code:G.roomCode,hostName:G.user,game:G.gameType,players:G.roomPeers.length,ts:Date.now(),hostId:G.myId};
  G.mqtt.publish(TOPIC_LOBBY,JSON.stringify(msg),{qos:0});
}

function publishRoom(msg){
  if(!G.mqtt||!G.mqttConnected||!G.roomCode)return;
  msg._from=G.myId;
  msg._fromName=G.user;
  G.mqtt.publish(roomTopic(G.roomCode),JSON.stringify(msg),{qos:0});
}

// ==================== 在线心跳 ====================
function startPresence(){
  stopPresence();
  G.presenceTimer=setInterval(()=>{
    publishPresence();
    // 清理过期在线用户
    const now=Date.now();let changed=false;
    for(const id in G.onlineUsers){if(now-G.onlineUsers[id].ts>45000){delete G.onlineUsers[id];changed=true}}
    if(changed)renderOnlineList();
  },10000);
}
function stopPresence(){if(G.presenceTimer){clearInterval(G.presenceTimer);G.presenceTimer=null}}

// ==================== 房间列表 ====================
function handleRoomListMsg(code,msg){
  if(!msg||!msg.code)return;
  if(msg.hostId===G.myId)return;
  if(msg.ts&&Date.now()-msg.ts>60000)return;
  G.knownRooms[msg.code]={name:msg.hostName,game:msg.game,players:msg.players||1,ts:msg.ts||Date.now()};
  renderLobby();
}

// ==================== 大厅事件 ====================
function handleLobbyMsg(msg){
  if(msg.hostId===G.myId)return;
  if(msg.ts&&Date.now()-msg.ts>30000)return;
  switch(msg.action){
    case 'create':
      G.knownRooms[msg.code]={name:msg.hostName,game:msg.game,players:msg.players||1,ts:msg.ts||Date.now()};
      renderLobby();
      break;
    case 'update':
      if(G.knownRooms[msg.code]){
        G.knownRooms[msg.code].players=msg.players;
        G.knownRooms[msg.code].ts=msg.ts||Date.now();
      }
      renderLobby();
      break;
    case 'close':
      delete G.knownRooms[msg.code];
      renderLobby();
      break;
  }
}

// ==================== 房间消息 ====================
function handleRoomMsg(msg){
  if(msg._from===G.myId)return;
  console.log('[RoomMsg]',msg.type);
  switch(msg.type){
    case 'join':
      if(!G.isHost)return;
      if(G.roomPeers.find(p=>p.id===msg.playerId))return;
      if(G.roomPeers.length>=MAX_SEATS){
        publishRoom({type:'full',targetId:msg.playerId});
        return;
      }
      G.roomPeers.push({id:msg.playerId,name:msg.playerName});
      updateWaitPlayers();
      publishRoomInfo();
      publishLobby('update');
      publishPresence(); // 更新在线状态
      publishRoom({type:'welcome',targetId:msg.playerId,
        players:G.roomPeers.filter(p=>p.id!==G.myId).map(p=>({id:p.id,name:p.name})),
        hostName:G.user,game:G.gameType,roomCode:G.roomCode,
        inGame:G.inGame,
        gameState:G.inGame?serializeGameState():null
      });
      toast(msg.playerName+' 到达了牌桌');
      break;

    case 'full':
      if(msg.targetId===G.myId){
        const code=G.roomCode;
        G.roomCode=null;G.isHost=false;
        try{G.mqtt.unsubscribe(roomTopic(code))}catch(e){}
        renderLobby();
        toast('牌桌已满');
      }
      break;

    case 'welcome':
      if(msg.targetId!==G.myId)return;
      G.isHost=false;G.gameType=msg.game;G.roomCode=msg.roomCode;
      G.roomPeers=[{id:'host',name:msg.hostName}];
      for(const p of msg.players){if(p.id!=='host')G.roomPeers.push({id:p.id,name:p.name})}
      if(msg.inGame&&msg.gameState){
        deserializeGameState(msg.gameState);
        showScreen('game');
        $('game-title').textContent=G.gameType==='zjh'?'物资炸金花':(G.gameType==='bj'?'物资二十一点':'骰子猜大小');
        renderTable();
      }else{
        showScreen('main');
        showWaitPanel(false);
      }
      publishPresence(); // 更新在线状态（在房间中）
      toast('已到达牌桌');
      break;

    case 'leave':
      if(!G.isHost)return;
      G.roomPeers=G.roomPeers.filter(p=>p.id!==msg.playerId);
      updateWaitPlayers();
      publishRoomInfo();
      publishLobby('update');
      toast(msg.playerName+' 离开了牌桌');
      break;

    case 'start-game':
      G.gameType=msg.game;G.inGame=true;G.gameOver=false;G.myTurn=false;G.resultShown=false;
      G.deck=msg.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
      G.players=msg.players.map(p=>({...p,cards:p.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),isMe:p.id===G.myId}));
      G.pot=msg.pot;G.currentBet=msg.currentBet;
      G.playerOrder=msg.playerOrder||G.players.map(p=>p.id);
      G.turnIndex=msg.turnIndex||0;
      G.roundCount=0;
      G.diceState=msg.diceState||{dice:[null,null,null],sum:0,phase:'bet'};
      checkMyTurn();
      showScreen('game');
      $('game-title').textContent=msg.game==='zjh'?'物资炸金花':(msg.game==='bj'?'物资二十一点':'骰子猜大小');
      clearLog();log('=== 牌局开始，物资已入底池 ===','system');Sound.deal();
      startCandle();renderTable();
      break;

    case 'action':
      handleRemoteAction(msg);
      break;

    case 'turn':
      G.turnIndex=msg.turnIndex;
      G.playerOrder=msg.playerOrder;
      checkMyTurn();
      renderTable();
      break;

    case 'result':{
      if(G.resultShown)return;
      if(!G.roomCode)return;
      G.resultShown=true;
      G.gameOver=true;stopCandle();
      const isMe=msg.winnerId===G.myId;
      const isRefund=msg.winnerId===null;
      const title=isRefund?'底池退还':(isMe?'物资归你':'物资被收走');
      showModal(title,msg.text,isMe||isRefund);
      if(msg.players){
        for(const rp of msg.players){
          const lp=G.players.find(p=>p.id===rp.id);
          if(lp)lp.chips=rp.chips;
        }
      }
      if(msg.diceResult){
        G.diceState={dice:msg.diceResult.dice,sum:msg.diceResult.sum,phase:'result'};
      }
      G.inGame=true;
      renderTable();
      break;
    }

    case 'game-leave':{
      if(!G.isHost)return;
      const leaving=G.players.find(p=>p.id===msg.playerId);
      if(leaving){
        leaving.folded=true;
        log(leaving.name+' 撤离了牌桌','system');
        if(G.gameType==='zjh')checkZJHEnd();
        else if(G.gameType==='bj')checkBJEnd();
        else if(G.gameType==='dice')checkDiceEnd();
      }
      break;
    }
  }
}

function serializeGameState(){
  return{
    gameType:G.gameType,deck:G.deck,pot:G.pot,currentBet:G.currentBet,
    players:G.players.map(p=>({id:p.id,name:p.name,cards:p.cards,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,stood:p.stood,choice:p.choice})),
    playerOrder:G.playerOrder,turnIndex:G.turnIndex,gameOver:G.gameOver,roundCount:G.roundCount,diceState:G.diceState
  };
}

function deserializeGameState(state){
  G.gameType=state.gameType;
  G.deck=state.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
  G.pot=state.pot;G.currentBet=state.currentBet;
  G.players=state.players.map(p=>({...p,cards:p.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),isMe:p.id===G.myId}));
  G.playerOrder=state.playerOrder;G.turnIndex=state.turnIndex;G.gameOver=state.gameOver;
  G.roundCount=state.roundCount||0;
  G.diceState=state.diceState||{dice:[null,null,null],sum:0,phase:'bet'};
  G.inGame=true;
  checkMyTurn();
}

// ==================== 心跳 ====================
function startHeartbeat(){
  stopHeartbeat();
  G.heartbeatTimer=setInterval(()=>{
    if(G.roomCode&&G.isHost&&G.mqttConnected){
      publishRoomInfo();
      publishLobby('update');
    }
    const now=Date.now();let changed=false;
    for(const code in G.knownRooms){if(now-G.knownRooms[code].ts>30000){delete G.knownRooms[code];changed=true}}
    if(changed)renderLobby();
  },5000);
}
function stopHeartbeat(){if(G.heartbeatTimer){clearInterval(G.heartbeatTimer);G.heartbeatTimer=null}}

// ==================== 蜡烛 ====================
function startCandle(){
  stopCandle();G.candleTime=G.candleMax;updateCandleUI();
  G.candleTimer=setInterval(()=>{
    G.candleTime--;updateCandleUI();
    if(G.candleTime<=0){
      stopCandle();
      if(!G.gameOver){G.gameOver=true;log('蜡烛烧尽！强制结算！','system');if(G.isHost)hostForceSettle()}
    }
  },1000);
}
function stopCandle(){if(G.candleTimer){clearInterval(G.candleTimer);G.candleTimer=null}}
function updateCandleUI(){
  const pct=Math.max(0,(G.candleTime/G.candleMax)*100);
  const fill=$('candle-fill');if(fill)fill.style.width=pct+'%';
  const m=Math.floor(G.candleTime/60),s=G.candleTime%60;
  const label=$('candle-label');if(label)label.textContent=`蜡烛剩余 ${m}:${s.toString().padStart(2,'0')}`;
}

function hostForceSettle(){
  if(G.gameType==='dice'){forceSettleDice();return}
  const active=G.players.filter(p=>!p.folded&&!p.busted);
  if(active.length===0){
    const share=Math.floor(G.pot/G.players.length);
    G.players.forEach(p=>p.chips+=share);
    G.pot=0;
    publishRoom({type:'result',text:'蜡烛烧尽！所有幸存者平分底池',winnerId:null,
      players:G.players.map(p=>({id:p.id,chips:p.chips}))});
    showModal('蜡烛烧尽','底池物资已平分退还',false);
    return;
  }
  let best=active[0];
  if(G.gameType==='zjh'){for(let i=1;i<active.length;i++){if(evalZJH(active[i].cards).val>evalZJH(best.cards).val)best=active[i]}}
  else{for(let i=1;i<active.length;i++){if(bjValue(active[i].cards)>bjValue(best.cards))best=active[i]}}
  best.chips+=G.pot;
  const isMe=best.isMe;
  publishRoom({type:'result',text:`蜡烛烧尽！${best.name} 获得底池 ${G.pot} 单位`,winnerId:best.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});
  showModal('蜡烛烧尽',isMe?`你获得底池 ${G.pot} 单位`:`${best.name} 获得底池 ${G.pot} 单位`,isMe);
  renderTable();
}

function forceSettleDice(){
  const unchosen=G.players.filter(p=>!p.choice);
  if(unchosen.length>0){
    // 未选择的玩家输掉注金，底池分给已选择玩家
    const choosers=G.players.filter(p=>p.choice);
    if(choosers.length>0){
      const sharePayout=Math.floor(G.pot/choosers.length);
      for(const p of choosers)p.chips+=sharePayout;
    }
    G.pot=0;
  }else{
    // 所有人都选了，正常结算
    checkDiceEnd();
    return;
  }
  G.gameOver=true;stopCandle();Sound.lose();
  publishRoom({type:'result',text:'蜡烛烧尽！未选择大小的人输掉注金',winnerId:null,
    players:G.players.map(p=>({id:p.id,chips:p.chips}))});
  showModal('蜡烛烧尽','未选择大小的幸存者输掉注金',false);
  renderTable();
}

// ==================== 大厅渲染 ====================
let _lobbyTimer=null;
function renderLobby(){
  if(_lobbyTimer)return;
  _lobbyTimer=setTimeout(()=>{_lobbyTimer=null;_renderLobby()},100);
}
function _renderLobby(){
  const grid=$('tables-grid');if(!grid)return;
  const rooms={};
  for(const code in G.knownRooms){
    const r=G.knownRooms[code];
    if(Date.now()-r.ts>30000){delete G.knownRooms[code];continue}
    rooms[code]=r;
  }
  if(G.isHost&&G.roomCode){
    rooms[G.roomCode]={name:G.user,game:G.gameType,players:G.roomPeers.length,ts:Date.now(),isMine:true};
  }
  const codes=Object.keys(rooms);
  if(codes.length===0){
    grid.innerHTML=`<div class="empty-lobby"><div class="icon">🏚️</div><p>仓储区还没有牌桌</p><p style="font-size:11px">点击"搭新桌"开始，等其他人来</p></div>`;
    return;
  }
  grid.innerHTML=codes.map(code=>{const r=rooms[code];return renderTableCard(code,r.game,r.name,r.players,MAX_SEATS,!!r.isMine)}).join('');
}

function renderTableCard(code,gameType,hostName,playerCount,maxSeats,isMyTable){
  const safeCode=code.replace(/[^A-Z0-9]/g,'');
  const displayCode=escHTML(safeCode);
  const label=gameType==='zjh'?'物资炸金花':(gameType==='bj'?'物资二十一点':'骰子猜大小');
  const icon=gameType==='zjh'?'🥫':(gameType==='bj'?'⛽':'🎲');
  const tier=gameType==='zjh'?'低端局 · 罐头级':(gameType==='bj'?'中端局 · 汽油级':'最低端局 · 火柴级');
  let seats='';const count=Math.min(playerCount,maxSeats);
  for(let i=0;i<maxSeats;i++){
    if(i===0)seats+=`<div class="seat occupied"><div class="seat-dot"></div>${escHTML(hostName)}(搭桌人)</div>`;
    else if(i<count)seats+=`<div class="seat occupied"><div class="seat-dot"></div>幸存者</div>`;
    else seats+=`<div class="seat empty"><div class="seat-dot"></div>空位</div>`;
  }
  const statusClass=count>=2?'playing':'waiting';
  const statusText=count>=maxSeats?'已满':count>=2?'可开局':'等待中';
  const clickHandler=isMyTable?'showWaitPanel(true)':`joinTableByCode('${safeCode}')`;
  return `<div class="table-card ${count>=maxSeats?'full':''}" onclick="${clickHandler}"><div class="table-visual"><div class="candle-glow"></div><div class="seats">${seats}</div></div><div class="table-info"><div class="table-name"><span>${icon} ${displayCode}号桌</span><span class="table-status ${statusClass}">${statusText}</span></div><div class="table-game">${label} · ${tier}</div><div class="table-meta"><div class="table-players">${count}/${maxSeats} 人</div></div></div></div>`;
}

// ==================== 创建牌桌 ====================
function showCreateModal(){const m=$('create-modal');if(m)m.classList.add('open')}
function hideCreateModal(){const m=$('create-modal');if(m)m.classList.remove('open')}
function selectGame(type,el){G.createGameType=type;document.querySelectorAll('.game-opt').forEach(e=>e.classList.remove('selected'));if(el)el.classList.add('selected')}
function doCreateTable(){hideCreateModal();createRoom(G.createGameType)}

function createRoom(gameType){
  if(G.roomCode)cleanupRoom();
  G.gameType=gameType;G.isHost=true;G.roomCode=genCode();
  G.roomPeers=[{id:G.myId,name:G.user}];
  if(G.mqtt&&G.mqttConnected)G.mqtt.subscribe(roomTopic(G.roomCode),{qos:0});
  publishRoomInfo();
  publishLobby('create');
  publishPresence();
  startHeartbeat();
  showScreen('main');
  showWaitPanel(true);renderLobby();
  toast('牌桌已搭好！等待其他幸存者');
}

// ==================== 等待面板 ====================
function showWaitPanel(isHost){
  const wp=$('wait-panel'),wt=$('wait-title');
  if(wp)wp.style.display='block';
  if(wt)wt.textContent=isHost?'你的牌桌':'已到达牌桌';
  updateWaitPlayers();
  const sb=$('start-btn'),cb=$('close-btn');
  if(isHost){
    if(sb){sb.style.display='inline-block';sb.disabled=G.roomPeers.length<2;sb.textContent=G.roomPeers.length>=2?`开局 (${G.roomPeers.length}人)`:'等待幸存者... (至少2人)';}
    if(cb){cb.textContent='撤掉牌桌';cb.onclick=()=>closeRoom();}
  }else{
    if(sb)sb.style.display='none';
    if(cb){cb.textContent='离开牌桌';cb.onclick=()=>leaveRoom();}
  }
}

function updateWaitPlayers(){
  const el=$('wait-players');if(!el)return;
  el.innerHTML=G.roomPeers.map(p=>{
    const isHostPlayer=(G.isHost&&p.id===G.myId)||(!G.isHost&&p.id==='host');
    const isMe=p.id===G.myId;
    return`<div class="wait-player"><div class="dot"></div><div class="name">${escHTML(p.name)}${isHostPlayer?' (搭桌人)':''}</div><div class="tag">${isMe?'已连接':'已到达'}</div></div>`;
  }).join('');
  if(G.isHost){
    const c=G.roomPeers.length;
    const sb=$('start-btn');
    if(sb){sb.disabled=c<2;sb.textContent=c>=2?`开局 (${c}人)`:'等待幸存者... (至少2人)';}
  }
  renderLobby();
}

// ==================== 加入牌桌 ====================
function joinTableByCode(code){
  if(G.inGame){toast('你正在牌局中，先撤离');return}
  if(G.isHost&&G.roomCode===code){showScreen('main');showWaitPanel(true);return}
  if(G.roomCode&&!G.isHost){toast('你已在某张牌桌上');return}
  if(G.roomCode)cleanupRoom();
  G.roomCode=code;G.isHost=false;
  toast('正在前往'+code+'号桌...');
  if(G.mqtt&&G.mqttConnected){
    // 先订阅，订阅成功后再发送join
    G.mqtt.subscribe(roomTopic(code),{qos:0},(err)=>{
      if(err){
        toast('无法连接到该牌桌');
        G.roomCode=null;
        return;
      }
      publishRoom({type:'join',playerId:G.myId,playerName:G.user});
      toast('已连接到'+code+'号桌，等待搭桌人响应...');
    });
  }else{
    toast('信号未就绪，请稍后重试');
    G.roomCode=null;
  }
}

// ==================== 离开/关闭 ====================
function leaveRoom(){
  if(!G.roomCode)return;
  publishRoom({type:'leave',playerId:G.myId,playerName:G.user});
  if(G.mqtt&&G.mqttConnected){
    try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}
  }
  G.roomPeers=[];G.roomCode=null;G.isHost=false;
  G.inGame=false;G.gameOver=false;G.myTurn=false;G.resultShown=false;
  stopCandle();stopHeartbeat();
  $('wait-panel').style.display='none';
  showScreen('main');
  publishPresence();
  renderLobby();
  toast('已离开牌桌');
}

function closeRoom(){
  $('wait-panel').style.display='none';
  cleanupRoom();
  showScreen('main');
  renderLobby();
}

function cleanupRoom(){
  stopHeartbeat();
  if(G.roomCode){
    publishLobby('close');
    clearRoomInfo();
    publishRoom({type:'leave',playerId:G.myId,playerName:G.user});
    if(G.mqtt&&G.mqttConnected){
      try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}
    }
    delete G.knownRooms[G.roomCode];
  }
  G.roomPeers=[];G.roomCode=null;G.isHost=false;
  G.inGame=false;G.gameOver=false;G.myTurn=false;G.resultShown=false;
  stopCandle();
  publishPresence();
}

function cleanupAll(){
  cleanupRoom();
  stopPresence();
  if(G._roomCleanupTimer){clearInterval(G._roomCleanupTimer);G._roomCleanupTimer=null}
  if(G.mqtt){try{G.mqtt.end(true)}catch(e){}G.mqtt=null}
  G.mqttConnected=false;
}

// ==================== 开始游戏 ====================
function hostStartGame(){
  if(!G.isHost||G.roomPeers.length<2)return;
  if(!G.mqttConnected){toast('信号断开，无法开局');return}
  const deck=makeDeck();const players=[];
  G.playerOrder=G.roomPeers.map(p=>p.id);

  if(G.gameType==='zjh'){
    for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,cards:[deck.pop(),deck.pop(),deck.pop()],chips:50,bet:5,folded:false,seen:false,isMe:false});
    G.pot=players.length*5;G.currentBet=5;
  }else if(G.gameType==='bj'){
    for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,cards:[deck.pop(),deck.pop()],chips:50,bet:10,busted:false,stood:false,isMe:false});
    G.pot=players.length*10;G.currentBet=10;
    for(const p of players){
      if(bjValue(p.cards)===21){
        p.stood=true;
        log(p.name+' 天然21点！','system');
      }
    }
  }else if(G.gameType==='dice'){
    for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,chips:50,bet:5,folded:false,choice:null,isMe:false});
    G.pot=players.length*5;G.currentBet=5;
    G.diceState={dice:[null,null,null],sum:0,phase:'bet'};
  }
  G.players=players;G.gameOver=false;G.inGame=true;G.turnIndex=0;G.roundCount=0;G.resultShown=false;

  const gameMsg={
    type:'start-game',game:G.gameType,
    deck:deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),
    players:players.map(pl=>({id:pl.id,name:pl.name,cards:pl.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),chips:pl.chips,bet:pl.bet,folded:pl.folded,seen:pl.seen,busted:pl.busted,stood:pl.stood,choice:pl.choice})),
    pot:G.pot,currentBet:G.currentBet,
    playerOrder:G.playerOrder,turnIndex:0,diceState:G.diceState
  };
  publishRoom(gameMsg);

  G.players.forEach(pl=>{pl.isMe=pl.id===G.myId});
  checkMyTurn();
  $('wait-panel').style.display='none';
  showScreen('game');
  $('game-title').textContent=G.gameType==='zjh'?'物资炸金花':(G.gameType==='bj'?'物资二十一点':'骰子猜大小');
  clearLog();log('=== 牌局开始，物资已入底池 ===','system');Sound.deal();
  startCandle();renderTable();
  publishPresence();

  if(G.gameType==='bj')checkBJEnd();
}

// ==================== 轮次 ====================
function checkMyTurn(){
  if(G.gameOver)return;
  if(G.gameType==='zjh'){
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.folded){
      const currentId=G.playerOrder[G.turnIndex%G.playerOrder.length];
      G.myTurn=(me.id===currentId);
    }else G.myTurn=false;
  }else if(G.gameType==='bj'){
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.busted&&!me.stood)G.myTurn=true;else G.myTurn=false;
  }else if(G.gameType==='dice'){
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.folded)G.myTurn=true;else G.myTurn=false;
  }
}

// ==================== 渲染 ====================
function renderTable(){if(!G.players||!G.players.length)return;if(G.gameType==='zjh')renderZJH();else if(G.gameType==='bj')renderBJ();else if(G.gameType==='dice')renderDice();updateChips()}

function setActionBar(h){
  const ab=$('action-bar');
  if(ab)ab.innerHTML=h;
}
function renderZJH(){
  const me=G.players.find(p=>p.isMe);if(!me)return;
  const others=G.players.filter(p=>!p.isMe);
  $('p0-cards').innerHTML=me.seen?me.cards.map(c=>cardHTML(c)).join(''):me.cards.map(()=>cardHTML(null,true)).join('');
  $('p0-hand').textContent=me.seen?evalZJH(me.cards).name:'未看牌';
  $('p0-name').innerHTML=`${escHTML(me.name)} <span style="color:var(--gold)">${me.chips}单位</span>`;
  $('p0-name').className='player-name'+(G.myTurn?' active':'');
  for(let i=0;i<2;i++){
    const p=others[i];
    if(!p){$('p'+(i+1)+'-name').textContent='空位';$('p'+(i+1)+'-cards').innerHTML='';$('p'+(i+1)+'-hand').textContent='';continue}
    const show=p.folded||G.gameOver;
    $('p'+(i+1)+'-cards').innerHTML=show?p.cards.map(c=>cardHTML(c)).join(''):p.cards.map(()=>cardHTML(null,true)).join('');
    $('p'+(i+1)+'-hand').textContent=show?evalZJH(p.cards).name:'';
    $('p'+(i+1)+'-name').textContent=`${escHTML(p.name)} ${p.folded?'(弃牌)':''}`;
  }
  const pa=$('pot-amount');
  if(pa)pa.textContent=G.pot+'单位';
  const hintEl=document.getElementById('rank-hint');
  if(!hintEl&&!G.gameOver){
    const h=document.createElement('div');
    h.id='rank-hint';
    h.style.cssText='font-size:9px;color:var(--dim);text-align:center;margin-top:4px;letter-spacing:1px';
    h.textContent='豹子 > 同花顺 > 同花 > 顺子 > 对子 > 散牌';
    const pa=document.querySelector('.pot-area');
    if(pa)pa.after(h);
  }
  if(G.myTurn&&!G.gameOver){
    setActionBar(`
      <button class="action-btn danger" onclick="doAction('fold')">弃牌</button>
      ${me.seen?'':`<button class="action-btn" onclick="doAction('look')">看牌</button>`}
      <button class="action-btn warning" onclick="doAction('call')">跟注 ${G.currentBet}</button>
      <button class="action-btn primary" onclick="doAction('raise')">加注</button>`);
  }else if(G.gameOver){
    setActionBar(`<button class="action-btn primary" onclick="closeModal()">返回等待面板</button>`);
  }else{
    setActionBar(`<div style="color:var(--dim);font-size:12px">等待其他幸存者...</div>`);
  }
}

function renderBJ(){
  const me=G.players.find(p=>p.isMe);if(!me)return;
  const others=G.players.filter(p=>!p.isMe);
  $('p0-cards').innerHTML=me.cards.map(c=>cardHTML(c)).join('');
  $('p0-hand').textContent=`点数: ${bjValue(me.cards)}`;
  $('p0-name').innerHTML=`${escHTML(me.name)} <span style="color:var(--gold)">${me.chips}单位</span>`;
  $('p0-name').className='player-name'+(G.myTurn?' active':'');
  for(let i=0;i<2;i++){
    const p=others[i];
    if(!p){$('p'+(i+1)+'-name').textContent='空位';$('p'+(i+1)+'-cards').innerHTML='';$('p'+(i+1)+'-hand').textContent='';continue}
    const show=G.gameOver;
    $('p'+(i+1)+'-cards').innerHTML=show?p.cards.map(c=>cardHTML(c)).join(''):p.cards.map(()=>cardHTML(null,true)).join('');
    $('p'+(i+1)+'-hand').textContent=show?`点数: ${bjValue(p.cards)}`:'';
    $('p'+(i+1)+'-name').textContent=escHTML(p.name)+(p.busted?' (爆牌)':p.stood?' (停牌)':'');
  }
  const pa=$('pot-amount');
  if(pa)pa.textContent=G.pot+'单位';
  const bjHint=document.getElementById('bj-hint');
  if(!bjHint&&!G.gameOver){
    const h=document.createElement('div');
    h.id='bj-hint';
    h.style.cssText='font-size:9px;color:var(--dim);text-align:center;margin-top:4px;letter-spacing:1px';
    h.textContent='尽量接近21点，超过则爆牌';
    const pa=document.querySelector('.pot-area');
    if(pa)pa.after(h);
  }
  if(G.myTurn&&!G.gameOver&&!me.busted){
    setActionBar(`
      <button class="action-btn success" onclick="doAction('hit')">要牌</button>
      <button class="action-btn" onclick="doAction('stand')">停牌</button>`);
  }else if(G.gameOver){
    setActionBar(`<button class="action-btn primary" onclick="closeModal()">返回等待面板</button>`);
  }else{
    const statusText=me&&me.busted?'爆牌了':me&&me.stood?'已停牌':'等待其他幸存者...';
    setActionBar(`<div style="color:var(--dim);font-size:12px">${statusText}</div>`);
  }
}

// ==================== 牌型 ====================
function evalZJH(cards){
  const sorted=[...cards].sort((a,b)=>b.v-a.v);
  const[c1,c2,c3]=sorted;
  const flush=c1.s===c2.s&&c2.s===c3.s;
  const isA23=(c1.v===14&&c2.v===3&&c3.v===2);
  const straight=(c1.v===c2.v+1&&c2.v===c3.v+1)||isA23;
  const three=c1.v===c2.v&&c2.v===c3.v;
  const pair=c1.v===c2.v||c2.v===c3.v||c1.v===c3.v;
  if(three)return{type:6,name:'豹子',val:c1.v*1e6};
  if(flush&&straight)return{type:5,name:'同花顺',val:isA23?3e5:c1.v*1e5+c2.v*1e3+c3.v};
  if(flush)return{type:4,name:'同花',val:c1.v*1e4+c2.v*100+c3.v};
  if(straight)return{type:3,name:'顺子',val:isA23?3e4:c1.v*1e4+c2.v*100+c3.v};
  if(pair){const pv=c1.v===c2.v?c1.v:c3.v;const k=c1.v===c2.v?c3.v:c1.v;return{type:2,name:'对子',val:pv*1e4+k}}
  return{type:1,name:'散牌',val:c1.v*1e4+c2.v*100+c3.v};
}

function bjValue(cards){
  let t=0,a=0;
  for(const c of cards){if(c.r==='A'){a++;t+=11}else if('JQK'.includes(c.r))t+=10;else t+=c.v}
  while(t>21&&a>0){t-=10;a--}return t;
}

const GAME_RULES={
  zjh:{
    name:'物资炸金花',
    desc:'每人发3张牌，通过比牌型大小决定胜负。每局开始每人自动下注5单位。',
    tip:'豹子 > 同花顺 > 同花 > 顺子 > 对子 > 散牌',
    ranks:[
      {name:'豹子',desc:'三张相同点数，AAA最大',eg:'♥A ♠A ♦A'},
      {name:'同花顺',desc:'同花色连续点数，AKQ最大，A23最小',eg:'♥A ♥K ♥Q'},
      {name:'同花',desc:'同花色但点数不连续',eg:'♠A ♠J ♠5'},
      {name:'顺子',desc:'不同花色连续点数，A23为最小',eg:'♠A ♥2 ♦3'},
      {name:'对子',desc:'两张相同点数',eg:'♣K ♥K ♠7'},
      {name:'散牌',desc:'无组合，按最大单张比',eg:'♥A ♠Q ♦9'}
    ]
  },
  bj:{
    name:'物资二十一点',
    desc:'争取手牌点数尽量接近21点但不超过。J/Q/K算10点，A可算1或11点。每局开始每人自动下注10单位。',
    tip:'尽量接近21点，超过则爆牌出局！'
  },
  dice:{
    name:'骰子猜大小',
    desc:'每人每局自动下注5单位。三颗骰子点数之和：4-10为"小"，11-17为"大"。猜对赢2倍注金，猜错输掉。围骰（三个相同）庄家通吃。',
    tip:'4-10为小 ✦ 11-17为大 ✦ 围骰庄家通吃'
  }
};
function showRules(t){
  const type=t||G.gameType;const r=GAME_RULES[type];
  if(!r)return;
  let html='<div class="rules-tip">'+r.tip+'</div>';
  html+='<p style="margin-bottom:12px;color:var(--dim);font-size:12px">'+r.desc+'</p>';
  if(r.ranks){
    html+='<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px"><div style="font-size:11px;color:var(--dim);margin-bottom:8px;letter-spacing:1px">— 牌型从大到小 —</div>';
    for(const rank of r.ranks){
      html+='<div class="rank-row"><span class="rank-name">'+rank.name+'</span><span class="rank-desc">'+rank.desc+'</span></div>';
    }
    html+='</div>';
  }
  const rc=document.getElementById('rules-content');
  if(rc)rc.innerHTML=html;
  const rm=document.getElementById('rules-modal');
  if(rm)rm.classList.add('open');
}
function closeRules(){const rm=document.getElementById('rules-modal');if(rm)rm.classList.remove('open')}

function rollDice(){const d=[ran(1,6),ran(1,6),ran(1,6)];return{dice:d,sum:d[0]+d[1]+d[2]}}
function ran(a,b){return Math.floor(Math.random()*(b-a+1))+a}

function renderDice(){
  const me=G.players.find(p=>p.isMe);if(!me)return;
  const others=G.players.filter(p=>!p.isMe);
  $('p0-cards').innerHTML=me.choice?`<div style="font-size:36px;padding:10px">${me.choice==='big'?'🔴':'🔵'}</div>`:`<div style="font-size:36px;padding:10px;opacity:.3">❓</div>`;
  $('p0-hand').textContent=me.choice?(me.choice==='big'?'选大':'选小'):'未选择';
  $('p0-name').innerHTML=`${escHTML(me.name)} <span style="color:var(--gold)">${me.chips}单位</span>`;
  $('p0-name').className='player-name'+(G.myTurn?' active':'');
  for(let i=0;i<2;i++){
    const p=others[i];
    if(!p){$('p'+(i+1)+'-name').textContent='空位';$('p'+(i+1)+'-cards').innerHTML='';$('p'+(i+1)+'-hand').textContent='';continue}
    $('p'+(i+1)+'-cards').innerHTML=p.choice?`<div style="font-size:36px;padding:10px">${p.choice==='big'?'🔴':'🔵'}</div>`:`<div style="font-size:36px;padding:10px;opacity:.3">⏳</div>`;
    $('p'+(i+1)+'-hand').textContent=p.choice?`${p.choice==='big'?'选大':'选小'}`:'思考中';
    $('p'+(i+1)+'-name').textContent=escHTML(p.name)+(p.folded?' (已结算)':'');
    $('p'+(i+1)+'-name').className='player-name';
  }
  const diceEl=$('pot-amount');
  if(G.diceState.phase==='reveal'||G.diceState.phase==='result'||G.gameOver){
    const isBig=G.diceState.sum>=11;
    const pl=document.querySelector('.pot-label');
    if(pl)pl.textContent='骰子结果';
    const dArea=document.querySelector('.pot-area');
    if(dArea){
      const dHTML=dArea.querySelector('.dice-area');
      if(dHTML)dHTML.innerHTML=G.diceState.dice.map(d=>`<div class="dice-die">${d}</div>`).join('');
      else{
        const da=document.createElement('div');da.className='dice-area';
        da.innerHTML=G.diceState.dice.map(d=>`<div class="dice-die">${d}</div>`).join('');
        dArea.insertBefore(da,diceEl);
      }
    }
    diceEl.innerHTML=`<span style="font-size:14px;color:${isBig?'var(--accent)':'var(--green)'}">总和 ${G.diceState.sum} — ${isBig?'大':'小'}</span> <span style="font-size:18px;color:var(--gold)">| 底池 ${G.pot}单位</span>`;
  }else{
    const pl=document.querySelector('.pot-label');
    if(pl)pl.textContent='等待下注...';
    const dArea=document.querySelector('.pot-area');
    if(dArea){
      const oldDa=dArea.querySelector('.dice-area');
      if(oldDa)oldDa.innerHTML='<span style="font-size:40px;opacity:.3">🎲 🎲 🎲</span>';
      else{const da=document.createElement('div');da.className='dice-area';da.innerHTML='<span style="font-size:40px;opacity:.3">🎲 🎲 🎲</span>';dArea.insertBefore(da,diceEl)}
    }
    diceEl.innerHTML=`<span style="font-size:20px;color:var(--gold)">底池 ${G.pot} 单位</span>`;
  }
  if(!G.gameOver&&G.diceState.phase==='bet'&&!me.choice&&!me.folded){
    setActionBar(`<button class="action-btn success" onclick="doAction('big')">🔴 大 (11-17)</button><button class="action-btn primary" onclick="doAction('small')">🔵 小 (4-10)</button>`);
  }else if(G.gameOver){
    setActionBar(`<button class="action-btn primary" onclick="closeModal()">继续</button>`);
  }else{
    setActionBar(`<div style="color:var(--dim);font-size:12px">${me.folded?'已选择':'等待其他幸存者...'}</div>`);
  }
}

function doDiceAction(me,action){
  me.choice=action;me.folded=true;
  Sound.click();
  log(`${me.name} ${action==='big'?'选大':'选小'}`);
  G.myTurn=false;
  if(G.isHost)checkDiceEnd();
  return true;
}

function checkDiceEnd(){
  if(G.gameOver)return;
  const allChose=G.players.every(p=>p.folded);
  if(!allChose)return;
  const result=rollDice();
  Sound.dice();
  G.diceState={dice:result.dice,sum:result.sum,phase:'reveal'};
  const isBig=result.sum>=11;
  const isTrips=result.dice[0]===result.dice[1]&&result.dice[1]===result.dice[2];
  let resultText=`骰子 ${result.dice.join('-')} 总和${result.sum} ${isBig?'大':'小'}`;
  let winners=[];
  if(isTrips){
    const share=Math.floor(G.pot/G.players.length);
    for(const p of G.players)p.chips+=share;
    G.pot=0;G.gameOver=true;
    resultText+=' 围骰！底池退还！';
    log(resultText,'system');
    publishRoom({type:'result',text:resultText,winnerId:null,players:G.players.map(p=>({id:p.id,chips:p.chips})),diceResult:{dice:result.dice,sum:result.sum,isBig,isTrips}});
    for(const p of G.players)Sound.lose();
    renderTable();
    return;
  }
  winners=G.players.filter(p=>(p.choice==='big'&&isBig)||(p.choice==='small'&&!isBig));
  const wCount=winners.length;
  if(wCount>0){
    const sharePayout=Math.min(G.currentBet*2,G.pot/wCount);
    for(const w of winners)w.chips+=sharePayout;
    resultText+=` ${wCount}人猜对，各得${sharePayout}单位`;
  }else{
    // 无人猜对，退还底池
    const share=Math.floor(G.pot/G.players.length);
    for(const p of G.players)p.chips+=share;
    resultText+=' 无人猜对，底池退还';
  }
  G.pot=0;G.gameOver=true;
  log(resultText,'system');
  const myWin=winners.some(p=>p.isMe);
  publishRoom({type:'result',text:resultText,winnerId:myWin?G.myId:null,players:G.players.map(p=>({id:p.id,chips:p.chips})),diceResult:{dice:result.dice,sum:result.sum,isBig,isTrips}});
  if(myWin)Sound.win();else Sound.lose();
  renderTable();
}

// ==================== 操作 ====================
function doAction(action){
  const me=G.players.find(p=>p.isMe);if(!me||!G.myTurn||G.gameOver)return;
  let shouldBroadcast=true;
  if(G.gameType==='zjh')shouldBroadcast=doZJHAction(me,action);
  else if(G.gameType==='bj')doBJAction(me,action);
  else if(G.gameType==='dice')shouldBroadcast=doDiceAction(me,action);
  if(shouldBroadcast){
    publishRoom({type:'action',playerId:me.id,action,
      data:{cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,stood:p.stood,choice:p.choice,
        myCards:p.id===me.id?p.cards:null})),pot:G.pot,currentBet:G.currentBet,gameOver:G.gameOver,
        deck:G.gameType==='bj'?G.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})):undefined}
    });
  }
  renderTable();
  if(G.isHost&&G.gameType==='bj'&&!G.gameOver)checkBJEnd();
}

function doZJHAction(me,action){
  switch(action){
    case 'fold':
      me.folded=true;G.myTurn=false;
      log(`${me.name} 弃牌`);Sound.fold();
      checkZJHEnd();
      return true;
    case 'look':
      me.seen=true;
      log(`${me.name} 看了牌`);
      return false;
    case 'call':
      if(!me.seen)me.seen=true;
      me.chips-=G.currentBet;me.bet+=G.currentBet;G.pot+=G.currentBet;
      G.myTurn=false;
      log(`${me.name} 跟注 ${G.currentBet}单位`);Sound.chip();
      advanceTurn();
      checkZJHEnd();
      return true;
    case 'raise':
      if(me.chips<=0){log('没有物资可以加注','system');return false}
      const amt=Math.min(me.chips,G.currentBet*2);
      if(!me.seen)me.seen=true;
      me.chips-=amt;me.bet+=amt;G.pot+=amt;G.currentBet=amt;
      G.myTurn=false;
      log(`${me.name} 加注到 ${amt}单位`);Sound.chip();
      advanceTurn();
      checkZJHEnd();
      return true;
  }
  return true;
}

function advanceTurn(){
  G.turnIndex++;
  G.roundCount++;
  publishRoom({type:'turn',turnIndex:G.turnIndex,playerOrder:G.playerOrder});
}

function checkZJHEnd(){
  const active=G.players.filter(p=>!p.folded);
  if(active.length===0){
    const share=Math.floor(G.pot/G.players.length);
    G.players.forEach(p=>p.chips+=share);
    G.pot=0;G.gameOver=true;stopCandle();
    publishRoom({type:'result',text:'所有幸存者弃牌，底池退还',winnerId:null,
      players:G.players.map(p=>({id:p.id,chips:p.chips}))});
    showModal('底池退还','所有幸存者弃牌，物资已退还',false);
    return;
  }
  if(active.length===1){
    const winner=active[0];
    winner.chips+=G.pot;G.gameOver=true;stopCandle();Sound.win();
    const isMe=winner.isMe;
    publishRoom({type:'result',text:`${winner.name} 赢得了 ${G.pot} 单位物资`,winnerId:winner.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});
    showModal(isMe?'物资归你':'物资被收走',isMe?`你赢得了底池 ${G.pot} 单位物资`:`${winner.name} 赢得了 ${G.pot} 单位物资`,isMe);
    return;
  }
  if(G.roundCount>=MAX_ROUNDS){
    G.gameOver=true;stopCandle();Sound.win();
    let best=active[0];
    for(let i=1;i<active.length;i++){if(evalZJH(active[i].cards).val>evalZJH(best.cards).val)best=active[i]}
    best.chips+=G.pot;
    const isMe=best.isMe;
    publishRoom({type:'result',text:`轮次耗尽！${best.name} 以${evalZJH(best.cards).name}获胜，获得 ${G.pot} 单位`,winnerId:best.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});
    showModal(isMe?'物资归你':'物资被收走',isMe?`你以${evalZJH(best.cards).name}获胜，获得 ${G.pot} 单位`:`${best.name} 以${evalZJH(best.cards).name}获胜`,isMe);
  }
}

function doBJAction(me,action){
  switch(action){
    case 'hit':
      me.cards.push(G.deck.pop());Sound.deal();
      log(`${me.name} 要牌，点数 ${bjValue(me.cards)}`);
      if(bjValue(me.cards)>21){
        me.busted=true;me.stood=true;G.myTurn=false;
        log(`${me.name} 爆牌！`);
      }
      break;
    case 'stand':
      me.stood=true;G.myTurn=false;
      log(`${me.name} 停牌，点数 ${bjValue(me.cards)}`);
      break;
  }
}

function checkBJEnd(){
  if(G.gameOver)return;
  const allActed=G.players.every(p=>p.busted||p.stood);
  if(!allActed)return;
  const active=G.players.filter(p=>!p.busted);
  if(active.length===0){
    const share=Math.floor(G.pot/G.players.length);
    G.players.forEach(p=>p.chips+=share);
    G.pot=0;G.gameOver=true;stopCandle();
    publishRoom({type:'result',text:'所有幸存者爆牌，底池退还',winnerId:null,
      players:G.players.map(p=>({id:p.id,chips:p.chips}))});
    showModal('底池退还','所有幸存者爆牌，物资已退还',false);
    return;
  }
  let best=active[0];
  for(let i=1;i<active.length;i++){
    if(bjValue(active[i].cards)<=21&&bjValue(active[i].cards)>bjValue(best.cards))best=active[i];
  }
  best.chips+=G.pot;G.gameOver=true;stopCandle();Sound.win();
  const isMe=best.isMe;
  publishRoom({type:'result',text:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,winnerId:best.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});
  showModal(isMe?'物资归你':'物资被收走',isMe?`你以 ${bjValue(best.cards)} 点获胜，获得 ${G.pot} 单位`:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,isMe);
}

function handleRemoteAction(d){
  const{playerId,action,data}=d;
  if(data){
    G.pot=data.pot;G.currentBet=data.currentBet;
    if(data.gameOver)G.gameOver=true;
    for(const rp of data.cards){
      const lp=G.players.find(p=>p.id===rp.id);
      if(lp){
        lp.chips=rp.chips;lp.bet=rp.bet;lp.folded=rp.folded;lp.seen=rp.seen;lp.busted=rp.busted;lp.stood=rp.stood||false;lp.choice=rp.choice;
        if(rp.myCards){
          lp.cards=rp.myCards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
        }
      }
    }
    if(data.deck){
      G.deck=data.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
    }
  }
  const rp=G.players.find(p=>p.id===playerId);
  if(rp){
    const n={fold:'弃牌',look:'看牌',call:'跟注',raise:'加注',hit:'要牌',stand:'停牌',big:'选大',small:'选小'};
    log(`${rp.name} ${n[action]||action}`);
  }
  checkMyTurn();
  if(G.myTurn&&!G.gameOver)log('轮到你操作','system');
  if(G.isHost&&G.gameType==='bj'&&!G.gameOver)checkBJEnd();
  renderTable();
}

function leaveGame(){
  if(!G.inGame)return;
  G.gameOver=true;G.myTurn=false;
  const me=G.players.find(p=>p.isMe);
  if(me){
    me.folded=true;me.stood=true;
    publishRoom({type:'game-leave',playerId:me.id,playerName:me.name});
    publishRoom({type:'action',playerId:me.id,action:'fold',data:{
      cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,stood:p.stood})),
      pot:G.pot,currentBet:G.currentBet,gameOver:false
    }});
  }
  publishRoom({type:'leave',playerId:G.myId,playerName:G.user});
  if(G.mqtt&&G.mqttConnected){
    try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}
  }
  G.inGame=false;G.resultShown=false;
  G.roomPeers=[];G.roomCode=null;G.isHost=false;
  stopCandle();stopHeartbeat();
  $('wait-panel').style.display='none';
  showScreen('main');
  publishPresence();
  renderLobby();
  toast('已撤离牌桌');
}

// ==================== 初始化 ====================
renderLobby();
renderOnlineList();
G._roomCleanupTimer=setInterval(()=>{
  const now=Date.now();let changed=false;
  for(const code in G.knownRooms){if(now-G.knownRooms[code].ts>30000){delete G.knownRooms[code];changed=true}}
  if(changed)renderLobby();
},10000);

// 音效初始化
const st=document.getElementById('sound-toggle');
if(st)st.onclick=toggleSound;
