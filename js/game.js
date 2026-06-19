// ============================================================
// 废土交易所 - 生存物资赌场
// 纯MQTT架构：EMQX公共broker + 实时房间发现 + 游戏同步
// ============================================================
'use strict';

const MQTT_BROKER='wss://broker.emqx.io:8084/mqtt';
const TOPIC_LOBBY='wl_lobby_v3';      // 大厅事件通知（create/update/close）
const TOPIC_ROOMS='wl_rooms_v3/#';   // 房间列表（retained message，每个房间一条）
const TOPIC_ROOM_PREFIX='wl_rooms_v3';

const G = {
  user:null, chips:50,
  isHost:false, roomCode:null, gameType:null,
  players:[], deck:[], pot:0, currentBet:0,
  myTurn:false, gameOver:false, logs:[],
  roomPeers:[], createGameType:'zjh',
  candleTimer:null, candleTime:0, candleMax:180,
  inGame:false,
  // MQTT
  mqtt:null, mqttConnected:false,
  knownRooms:{},
  heartbeatTimer:null,
  myId:null, // 当前客户端唯一ID
  // 轮次控制
  turnIndex:0, playerOrder:[]
};

const SUITS=['♠','♥','♣','♦'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};

function $(id){return document.getElementById(id)}
function genId(){return Math.random().toString(36).substr(2,10)}
function genCode(){return Math.random().toString(36).substring(2,8).toUpperCase()}

// ==================== 存储 ====================
function load(){const s=localStorage.getItem('wl_user');if(s){const d=JSON.parse(s);G.user=d.n;G.chips=d.c||50;return true}return false}
function save(){if(G.user)localStorage.setItem('wl_user',JSON.stringify({n:G.user,c:G.chips}))}

// ==================== 牌 ====================
function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({s,r,v:RV[r],red:s==='♥'||s==='♦'});return shuffle(d)}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function cardHTML(c,hidden){if(hidden)return'<div class="card-back"></div>';return`<div class="card ${c.red?'red':'black'}"><div class="card-rank">${c.r}</div><div class="card-suit">${c.s}</div></div>`}

// ==================== UI ====================
function showScreen(n){$('auth-screen').style.display=n==='auth'?'flex':'none';$('main-screen').style.display=n==='main'?'block':'none';$('game-screen').style.display=n==='game'?'block':'none'}
function updateChips(){$('user-chips').textContent=G.chips;$('game-chips').textContent=G.chips;save()}
function log(m,t=''){G.logs.push({m,t});if(G.logs.length>50)G.logs.shift();const p=$('game-log'),e=document.createElement('div');e.className='log-entry '+t;e.textContent=m;p.appendChild(e);p.scrollTop=p.scrollHeight}
function clearLog(){G.logs=[];$('game-log').innerHTML=''}
function showModal(t,m,w){$('modal-title').textContent=t;$('modal-title').className='modal-title '+(w?'win':'lose');$('modal-text').textContent=m;$('result-modal').classList.add('open')}
function closeModal(){$('result-modal').classList.remove('open')}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000)}
function escHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ==================== 登录 ====================
$('auth-btn').onclick=()=>{
  const n=$('auth-name').value.trim();
  if(!n){$('auth-hint').textContent='代号不能为空';return}
  G.user=n;if(!load())G.chips=50;
  G.myId=genId();
  save();$('user-name').textContent=n;updateChips();
  showScreen('main');initMQTT();
};
function logout(){
  cleanupAll();
  G.user=null;localStorage.removeItem('wl_user');
  showScreen('auth');
}
if(load()){G.myId=genId();$('user-name').textContent=G.user;updateChips();showScreen('main');initMQTT()}

// ==================== MQTT ====================
function initMQTT(){
  if(G.mqtt)return;
  try{
    G.mqtt=mqtt.connect(MQTT_BROKER,{
      clientId:'wl_'+G.myId||genId(),
      clean:true,connectTimeout:10000,reconnectPeriod:3000,
      keepalive:60
    });
    G.mqtt.on('connect',()=>{
      G.mqttConnected=true;
      console.log('[MQTT] connected');
      $('online-dot').classList.remove('off');
      $('conn-status').textContent='信号正常';
      $('conn-status').style.color='var(--green)';
      // 订阅大厅事件频道 + 所有房间列表（retained）
      G.mqtt.subscribe(TOPIC_LOBBY,{qos:0});
      G.mqtt.subscribe(TOPIC_ROOMS,{qos:0});
      // 如果在房间里，重新订阅房间聊天频道
      if(G.roomCode){
        G.mqtt.subscribe(roomTopic(G.roomCode),{qos:0});
        // 如果是主机，补发房间信息
        if(G.isHost)publishRoomInfo();
      }
    });
    G.mqtt.on('message',(topic,payload)=>{
      try{
        const msg=JSON.parse(payload.toString());
        if(topic===TOPIC_LOBBY){
          handleLobbyMsg(msg);
        }else if(topic.startsWith(TOPIC_ROOM_PREFIX+'/')){
          // 房间 retained message
          const code=topic.split('/').pop();
          handleRoomListMsg(code,msg);
        }else if(topic===roomTopic(G.roomCode)){
          handleRoomMsg(msg);
        }else if(topic.startsWith(TOPIC_ROOM_PREFIX+'_chat/')){
          handleRoomMsg(msg);
        }
      }catch(e){console.warn('[MQTT] parse error:',e)}
    });
    G.mqtt.on('error',(err)=>{console.warn('[MQTT] error:',err.message);G.mqttConnected=false});
    G.mqtt.on('reconnect',()=>{console.log('[MQTT] reconnecting...')});
    G.mqtt.on('close',()=>{
      G.mqttConnected=false;
      $('online-dot').classList.add('off');
      $('conn-status').textContent='信号断开';
      $('conn-status').style.color='var(--accent)';
    });
  }catch(e){console.warn('MQTT init failed:',e)}
}

function roomTopic(code){return TOPIC_ROOM_PREFIX+'_chat/'+code}

// 发布房间信息（retained message，新订阅者能立即收到）
function publishRoomInfo(){
  if(!G.mqtt||!G.mqttConnected||!G.roomCode)return;
  const msg={code:G.roomCode,hostName:G.user,game:G.gameType,players:G.roomPeers.length,ts:Date.now(),hostId:G.myId};
  G.mqtt.publish(TOPIC_ROOM_PREFIX+'/'+G.roomCode,JSON.stringify(msg),{qos:0,retain:true});
}

// 清除房间的 retained message
function clearRoomInfo(){
  if(!G.mqtt||!G.mqttConnected||!G.roomCode)return;
  // 发布空 retained message 来清除
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

// ==================== 房间列表（retained message） ====================
function handleRoomListMsg(code,msg){
  if(!msg||!msg.code)return; // 空消息 = 被清除
  if(msg.hostId===G.myId)return; // 忽略自己的
  if(msg.ts&&Date.now()-msg.ts>60000)return; // 60秒过期
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
  if(msg._from===G.myId)return; // 忽略自己发的消息
  console.log('[RoomMsg]',msg.type,msg);
  switch(msg.type){
    case 'join':
      // 主机收到客人加入
      if(!G.isHost)return;
      if(G.roomPeers.find(p=>p.id===msg.playerId))return;
      G.roomPeers.push({id:msg.playerId,name:msg.playerName});
      updateWaitPlayers();
      publishLobby('update');
      // 发送欢迎消息（包含完整玩家列表+当前游戏状态）
      publishRoom({type:'welcome',targetId:msg.playerId,
        players:G.roomPeers.filter(p=>p.id!==G.myId).map(p=>({id:p.id,name:p.name})),
        hostName:G.user,game:G.gameType,roomCode:G.roomCode,
        inGame:G.inGame,
        gameState:G.inGame?serializeGameState():null
      });
      toast(msg.playerName+' 到达了牌桌');
      break;

    case 'welcome':
      // 客人收到主机欢迎
      if(msg.targetId!==G.myId)return;
      G.isHost=false;G.gameType=msg.game;G.roomCode=msg.roomCode;
      G.roomPeers=[{id:'host',name:msg.hostName}];
      for(const p of msg.players){if(p.id!=='host')G.roomPeers.push({id:p.id,name:p.name})}
      if(msg.inGame&&msg.gameState){
        // 房间已经在游戏中，同步状态
        deserializeGameState(msg.gameState);
        showScreen('game');
        $('game-title').textContent=G.gameType==='zjh'?'物资炸金花':'物资二十一点';
        renderTable();
      }else{
        showWaitPanel(false);
      }
      toast('已到达牌桌');
      break;

    case 'start-game':
      G.gameType=msg.game;G.inGame=true;G.gameOver=false;G.myTurn=false;
      G.deck=msg.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
      G.players=msg.players.map(p=>({...p,cards:p.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),isMe:p.id===G.myId}));
      G.pot=msg.pot;G.currentBet=msg.currentBet;
      G.playerOrder=msg.playerOrder||G.players.map(p=>p.id);
      G.turnIndex=msg.turnIndex||0;
      checkMyTurn();
      showScreen('game');
      $('game-title').textContent=msg.game==='zjh'?'物资炸金花':'物资二十一点';
      clearLog();log('=== 牌局开始，物资已入底池 ===','system');
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

    case 'result':
      showModal(msg.title,msg.text,msg.win);
      G.gameOver=true;stopCandle();
      if(msg.players){for(const rp of msg.players){const lp=G.players.find(p=>p.id===rp.id);if(lp)lp.chips=rp.chips}}
      renderTable();
      break;
  }
}

function serializeGameState(){
  return{
    gameType:G.gameType,deck:G.deck,pot:G.pot,currentBet:G.currentBet,
    players:G.players.map(p=>({id:p.id,name:p.name,cards:p.cards,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,isMe:p.id===G.myId})),
    playerOrder:G.playerOrder,turnIndex:G.turnIndex,gameOver:G.gameOver
  };
}

function deserializeGameState(state){
  G.gameType=state.gameType;
  G.deck=state.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
  G.pot=state.pot;G.currentBet=state.currentBet;
  G.players=state.players.map(p=>({...p,cards:p.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),isMe:p.id===G.myId}));
  G.playerOrder=state.playerOrder;G.turnIndex=state.turnIndex;G.gameOver=state.gameOver;
  G.inGame=true;
  checkMyTurn();
}

// ==================== 心跳 ====================
function startHeartbeat(){
  stopHeartbeat();
  G.heartbeatTimer=setInterval(()=>{
    if(G.roomCode&&G.isHost){
      publishRoomInfo(); // 更新 retained message
      publishLobby('update');
      // 清理过期房间
      const now=Date.now();
      for(const code in G.knownRooms){if(now-G.knownRooms[code].ts>60000)delete G.knownRooms[code]}
      renderLobby();
    }
  },8000);
}
function stopHeartbeat(){if(G.heartbeatTimer){clearInterval(G.heartbeatTimer);G.heartbeatTimer=null}}

// ==================== 蜡烛计时 ====================
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
  const active=G.players.filter(p=>!p.folded&&!p.busted);
  if(active.length===0)return;
  let best=active[0];
  if(G.gameType==='zjh'){for(let i=1;i<active.length;i++){if(evalZJH(active[i].cards).val>evalZJH(best.cards).val)best=active[i]}}
  else{for(let i=1;i<active.length;i++){if(bjValue(active[i].cards)>bjValue(best.cards))best=active[i]}}
  best.chips+=G.pot;
  const isMe=best.isMe;
  publishRoom({type:'result',title:'蜡烛烧尽',text:`强制结算！${best.name} 获得底池 ${G.pot} 单位`,win:isMe,players:G.players.map(p=>({id:p.id,chips:p.chips}))});
  showModal('蜡烛烧尽',isMe?`强制结算！你获得底池 ${G.pot} 单位`:`强制结算！${best.name} 获得底池 ${G.pot} 单位`,isMe);
  renderTable();
}

// ==================== 大厅渲染 ====================
function renderLobby(){
  const grid=$('tables-grid');
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
  grid.innerHTML=codes.map(code=>{const r=rooms[code];return renderTableCard(code,r.game,r.name,r.players,3,!!r.isMine)}).join('');
}

function renderTableCard(code,gameType,hostName,playerCount,maxSeats,isMyTable){
  const label=gameType==='zjh'?'物资炸金花':'物资二十一点';
  const icon=gameType==='zjh'?'🥫':'⛽';
  const tier=gameType==='zjh'?'低端局 · 罐头级':'中端局 · 汽油级';
  let seats='';const count=Math.min(playerCount,maxSeats);
  for(let i=0;i<maxSeats;i++){
    if(i===0)seats+=`<div class="seat occupied"><div class="seat-dot"></div>${escHTML(hostName)}(搭桌人)</div>`;
    else if(i<count)seats+=`<div class="seat occupied"><div class="seat-dot"></div>幸存者</div>`;
    else seats+=`<div class="seat empty"><div class="seat-dot"></div>空位</div>`;
  }
  const statusClass=count>=2?'playing':'waiting';
  const statusText=count>=2?'可开局':'等待中';
  const clickHandler=isMyTable?'showWaitPanel(true)':`joinTableByCode('${code}')`;
  return `<div class="table-card" onclick="${clickHandler}"><div class="table-visual"><div class="candle-glow"></div><div class="seats">${seats}</div></div><div class="table-info"><div class="table-name"><span>${icon} ${code}号桌</span><span class="table-status ${statusClass}">${statusText}</span></div><div class="table-game">${label} · ${tier}</div><div class="table-meta"><div class="table-players">${count}/${maxSeats} 人</div></div></div></div>`;
}

// ==================== 创建牌桌 ====================
function showCreateModal(){$('create-modal').classList.add('open')}
function hideCreateModal(){$('create-modal').classList.remove('open')}
function selectGame(type,el){G.createGameType=type;document.querySelectorAll('.game-opt').forEach(e=>e.classList.remove('selected'));el.classList.add('selected')}
function doCreateTable(){hideCreateModal();createRoom(G.createGameType)}

function createRoom(gameType){
  if(G.roomCode)cleanupRoom();
  G.gameType=gameType;G.isHost=true;G.roomCode=genCode();
  G.roomPeers=[{id:G.myId,name:G.user}];
  // 订阅房间聊天频道
  if(G.mqtt&&G.mqttConnected)G.mqtt.subscribe(roomTopic(G.roomCode),{qos:0});
  // 发布房间 retained message + 大厅通知
  publishRoomInfo();
  publishLobby('create');
  startHeartbeat();
  showWaitPanel(true);renderLobby();
  toast('牌桌已搭好！等待其他幸存者');
}

// ==================== 等待面板 ====================
function showWaitPanel(isHost){
  $('wait-panel').style.display='block';
  $('wait-title').textContent=isHost?'你的牌桌':'已到达牌桌';
  updateWaitPlayers();
  if(isHost){
    $('start-btn').style.display='inline-block';
    $('start-btn').disabled=G.roomPeers.length<2;
    $('start-btn').textContent=G.roomPeers.length>=2?`开局 (${G.roomPeers.length}人)`:'等待幸存者... (至少2人)';
  }else{
    $('start-btn').style.display='none';
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
    $('start-btn').disabled=c<2;
    $('start-btn').textContent=c>=2?`开局 (${c}人)`:'等待幸存者... (至少2人)';
  }
  renderLobby();
}

// ==================== 加入牌桌 ====================
function joinTableByCode(code){
  if(G.inGame){toast('你正在牌局中，先撤离');return}
  if(G.isHost&&G.roomCode===code){showWaitPanel(true);return}
  if(G.roomCode&&!G.isHost){toast('你已在某张牌桌上');return}
  // 清理旧房间
  if(G.roomCode)cleanupRoom();
  G.roomCode=code;G.isHost=false;
  toast('正在前往'+code+'号桌...');
  // 订阅房间频道
  if(G.mqtt&&G.mqttConnected){
    G.mqtt.subscribe(roomTopic(code),{qos:0},()=>{
      // 订阅成功后发送加入消息
      publishRoom({type:'join',playerId:G.myId,playerName:G.user});
      toast('已连接到'+code+'号桌');
    });
  }else{
    toast('信号未就绪，请稍后重试');
    G.roomCode=null;
  }
}

// ==================== 关闭/清理 ====================
function closeRoom(){
  $('wait-panel').style.display='none';
  cleanupRoom();
  renderLobby();
}

function cleanupRoom(){
  stopHeartbeat();
  if(G.roomCode){
    publishLobby('close');
    clearRoomInfo(); // 清除 retained message
    publishRoom({type:'leave',playerId:G.myId,playerName:G.user});
    // 取消订阅房间频道
    if(G.mqtt&&G.mqttConnected){
      try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}
    }
    delete G.knownRooms[G.roomCode];
  }
  G.roomPeers=[];G.roomCode=null;G.isHost=false;
  G.inGame=false;G.gameOver=false;G.myTurn=false;
  stopCandle();
}

function cleanupAll(){
  cleanupRoom();
  if(G.mqtt){try{G.mqtt.end()}catch(e){}G.mqtt=null}
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
  }else{
    for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,cards:[deck.pop(),deck.pop()],chips:50,bet:10,busted:false,isMe:false});
    G.pot=players.length*10;G.currentBet=10;
  }
  G.players=players;G.gameOver=false;G.inGame=true;G.turnIndex=0;

  // 广播游戏开始（所有人收到相同的消息，客户端自行判断isMe）
  const gameMsg={
    type:'start-game',game:G.gameType,
    deck:deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),
    players:players.map(pl=>({id:pl.id,name:pl.name,cards:pl.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),chips:pl.chips,bet:pl.bet,folded:pl.folded,seen:pl.seen,busted:pl.busted})),
    pot:G.pot,currentBet:G.currentBet,
    playerOrder:G.playerOrder,turnIndex:0
  };
  publishRoom(gameMsg);

  // 主机自己标记isMe
  G.players.forEach(pl=>{pl.isMe=pl.id===G.myId});
  checkMyTurn();
  $('wait-panel').style.display='none';
  showScreen('game');
  $('game-title').textContent=G.gameType==='zjh'?'物资炸金花':'物资二十一点';
  clearLog();log('=== 牌局开始，物资已入底池 ===','system');
  startCandle();renderTable();
}

// ==================== 轮次检查 ====================
function checkMyTurn(){
  if(G.gameOver)return;
  if(G.gameType==='zjh'){
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.folded){const currentId=G.playerOrder[G.turnIndex%G.playerOrder.length];G.myTurn=(me.id===currentId)}
    else G.myTurn=false;
  }else{
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.busted)G.myTurn=true;else G.myTurn=false;
  }
}

// ==================== 渲染 ====================
function renderTable(){if(G.gameType==='zjh')renderZJH();else renderBJ();updateChips()}

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
  $('pot-amount').textContent=G.pot+'单位';
  if(G.myTurn&&!G.gameOver){
    $('action-bar').innerHTML=`<button class="action-btn danger" onclick="doAction('fold')">弃牌</button><button class="action-btn" onclick="doAction('look')">看牌</button><button class="action-btn warning" onclick="doAction('call')">跟注 ${G.currentBet}</button><button class="action-btn primary" onclick="doAction('raise')">加注</button>`;
  }else{$('action-bar').innerHTML=`<div style="color:var(--dim);font-size:12px">${G.gameOver?'牌局结束':'等待其他幸存者...'}</div>`}
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
    $('p'+(i+1)+'-name').textContent=escHTML(p.name);
  }
  $('pot-amount').textContent=G.pot+'单位';
  if(G.myTurn&&!G.gameOver&&!me.busted){
    $('action-bar').innerHTML=`<button class="action-btn success" onclick="doAction('hit')">要牌</button><button class="action-btn" onclick="doAction('stand')">停牌</button>`;
  }else{$('action-bar').innerHTML=`<div style="color:var(--dim);font-size:12px">${G.gameOver?'牌局结束':me&&me.busted?'爆牌了':'等待其他幸存者...'}</div>`}
}

// ==================== 牌型判定 ====================
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

function bjValue(cards){
  let t=0,a=0;
  for(const c of cards){if(c.r==='A'){a++;t+=11}else if('JQK'.includes(c.r))t+=10;else t+=c.v}
  while(t>21&&a>0){t-=10;a--}return t;
}

// ==================== 操作 ====================
function doAction(action){
  const me=G.players.find(p=>p.isMe);if(!me||!G.myTurn||G.gameOver)return;
  if(G.gameType==='zjh')doZJHAction(me,action);else doBJAction(me,action);
  // 广播操作（不发送牌面数据）
  publishRoom({type:'action',playerId:me.id,action,
    data:{cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted})),pot:G.pot,currentBet:G.currentBet,gameOver:G.gameOver}
  });
  renderTable();
}

function doZJHAction(me,action){
  switch(action){
    case 'fold':me.folded=true;G.myTurn=false;log(`${me.name} 弃牌`);checkZJHEnd();break;
    case 'look':me.seen=true;log(`${me.name} 看了牌`);break;
    case 'call':if(!me.seen)me.seen=true;me.chips-=G.currentBet;me.bet+=G.currentBet;G.pot+=G.currentBet;G.myTurn=false;log(`${me.name} 跟注 ${G.currentBet}单位`);advanceTurn();checkZJHEnd();break;
    case 'raise':const amt=Math.min(me.chips,G.currentBet*2);if(!me.seen)me.seen=true;me.chips-=amt;me.bet+=amt;G.pot+=amt;G.currentBet=amt;G.myTurn=false;log(`${me.name} 加注到 ${amt}单位`);advanceTurn();checkZJHEnd();break;
  }
}

function advanceTurn(){
  G.turnIndex++;
  publishRoom({type:'turn',turnIndex:G.turnIndex,playerOrder:G.playerOrder});
}

function checkZJHEnd(){
  const active=G.players.filter(p=>!p.folded);
  if(active.length<=1){
    const winner=active[0]||G.players[0];winner.chips+=G.pot;G.gameOver=true;stopCandle();
    const isMe=winner.isMe;
    publishRoom({type:'result',title:isMe?'物资归你':'物资被收走',text:isMe?`你赢得了底池 ${G.pot} 单位物资`:`${winner.name} 赢得了 ${G.pot} 单位物资`,win:isMe,players:G.players.map(p=>({id:p.id,chips:p.chips}))});
    showModal(isMe?'物资归你':'物资被收走',isMe?`你赢得了底池 ${G.pot} 单位物资`:`${winner.name} 赢得了 ${G.pot} 单位物资`,isMe);
  }
}

function doBJAction(me,action){
  switch(action){
    case 'hit':me.cards.push(G.deck.pop());log(`${me.name} 要牌，点数 ${bjValue(me.cards)}`);if(bjValue(me.cards)>21){me.busted=true;G.myTurn=false;log(`${me.name} 爆牌！`);checkBJEnd()}break;
    case 'stand':G.myTurn=false;log(`${me.name} 停牌，点数 ${bjValue(me.cards)}`);checkBJEnd();break;
  }
}

function checkBJEnd(){
  const allDone=G.players.every(p=>p.busted||bjValue(p.cards)>=17||p.folded);
  if(!allDone)return;
  const active=G.players.filter(p=>!p.busted&&!p.folded);
  if(active.length===0)return;
  let best=active[0];
  for(let i=1;i<active.length;i++){if(bjValue(active[i].cards)>bjValue(best.cards))best=active[i]}
  best.chips+=G.pot;G.gameOver=true;stopCandle();
  const isMe=best.isMe;
  publishRoom({type:'result',title:isMe?'物资归你':'物资被收走',text:isMe?`你以 ${bjValue(best.cards)} 点获胜，获得 ${G.pot} 单位`:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,win:isMe,players:G.players.map(p=>({id:p.id,chips:p.chips}))});
  showModal(isMe?'物资归你':'物资被收走',isMe?`你以 ${bjValue(best.cards)} 点获胜，获得 ${G.pot} 单位`:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,isMe);
}

function handleRemoteAction(d){
  const{playerId,action,data}=d;
  if(data){
    G.pot=data.pot;G.currentBet=data.currentBet;G.gameOver=data.gameOver||false;
    for(const rp of data.cards){const lp=G.players.find(p=>p.id===rp.id);if(lp){lp.chips=rp.chips;lp.bet=rp.bet;lp.folded=rp.folded;lp.seen=rp.seen;lp.busted=rp.busted}}
  }
  const rp=G.players.find(p=>p.id===playerId);
  if(rp){const n={fold:'弃牌',look:'看牌',call:'跟注',raise:'加注',hit:'要牌',stand:'停牌'};log(`${rp.name} ${n[action]||action}`)}
  checkMyTurn();
  if(G.myTurn&&!G.gameOver)log('轮到你操作','system');
  renderTable();
}

function leaveGame(){
  if(!G.inGame)return;
  G.gameOver=true;G.myTurn=false;G.inGame=false;stopCandle();
  const me=G.players.find(p=>p.isMe);
  if(me){
    me.folded=true;
    publishRoom({type:'action',playerId:me.id,action:'fold',data:{cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted})),pot:G.pot,currentBet:G.currentBet,gameOver:false}});
  }
  showScreen('main');
  $('wait-panel').style.display='none';
  renderLobby();
}

// ==================== 初始化 ====================
renderLobby();
setInterval(()=>{
  const now=Date.now();let changed=false;
  for(const code in G.knownRooms){if(now-G.knownRooms[code].ts>30000){delete G.knownRooms[code];changed=true}}
  if(changed)renderLobby();
},5000);
