// ============================================================
// 废土交易所 - 生存物资赌场
// MQTT房间发现 + PeerJS联机 + 蜡烛计时
// ============================================================
'use strict';

const G = {
  user:null, chips:50,
  peer:null, conn:null,
  isHost:false, roomCode:null, gameType:null,
  players:[], deck:[], pot:0, currentBet:0,
  myTurn:false, gameOver:false, logs:[],
  roomPeers:[], createGameType:'zjh',
  candleTimer:null, candleTime:0, candleMax:180,
  hostPeerId:null, inGame:false,
  // MQTT房间发现
  mqtt:null, mqttConnected:false,
  knownRooms:{},
  heartbeatTimer:null,
  // 轮次控制
  turnIndex:0, playerOrder:[]
};

const SUITS=['♠','♥','♣','♦'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};

function $(id){return document.getElementById(id)}

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

// ==================== 登录 ====================
$('auth-btn').onclick=()=>{
  const n=$('auth-name').value.trim();
  if(!n){$('auth-hint').textContent='代号不能为空';return}
  G.user=n;if(!load())G.chips=50;
  save();$('user-name').textContent=n;updateChips();
  showScreen('main');initPeer();initMQTT();
};
function logout(){
  cleanupAll();
  G.user=null;localStorage.removeItem('wl_user');
  showScreen('auth');
}
if(load()){$('user-name').textContent=G.user;updateChips();showScreen('main');initPeer();initMQTT()}

// ==================== MQTT 房间发现 ====================
function initMQTT(){
  if(G.mqtt)return;
  try{
    G.mqtt=mqtt.connect('wss://broker.hivemq.com:8884/mqtt',{
      clientId:'wl_'+Math.random().toString(36).substr(2,8),
      clean:true,connectTimeout:8000,reconnectPeriod:3000,
      keepalive:30
    });
    G.mqtt.on('connect',()=>{
      G.mqttConnected=true;
      console.log('[MQTT] connected');
      G.mqtt.subscribe('wasteland_exchange/rooms',{qos:0});
      // MQTT重连/首次连接后，补发房间信息
      if(G.roomCode&&G.isHost){
        publishRoom('create',{players:G.roomPeers.length});
      }
    });
    G.mqtt.on('message',(topic,payload)=>{
      try{
        const msg=JSON.parse(payload.toString());
        if(topic==='wasteland_exchange/rooms')handleRoomMessage(msg);
      }catch(e){}
    });
    G.mqtt.on('error',(err)=>{console.warn('[MQTT] error:',err);G.mqttConnected=false});
    G.mqtt.on('reconnect',()=>{console.log('[MQTT] reconnecting...')});
    G.mqtt.on('close',()=>{G.mqttConnected=false});
  }catch(e){console.warn('MQTT init failed:',e)}
}

function handleRoomMessage(msg){
  // 忽略自己发的消息
  if(G.isHost&&msg.code===G.roomCode)return;
  switch(msg.action){
    case 'create':
      G.knownRooms[msg.code]={name:msg.hostName,game:msg.game,players:msg.players||1,ts:Date.now()};
      renderLobby();
      break;
    case 'update':
      if(G.knownRooms[msg.code]){
        G.knownRooms[msg.code].players=msg.players;
        G.knownRooms[msg.code].ts=Date.now();
      }
      renderLobby();
      break;
    case 'close':
      delete G.knownRooms[msg.code];
      renderLobby();
      break;
  }
}

function publishRoom(action,extra){
  if(!G.mqtt)return;
  if(!G.mqttConnected)return; // MQTT没连上时静默跳过，connect回调会补发
  const msg={action,code:G.roomCode,hostName:G.user,game:G.gameType,...extra};
  G.mqtt.publish('wasteland_exchange/rooms',JSON.stringify(msg),{qos:0});
}

function startHeartbeat(){
  stopHeartbeat();
  G.heartbeatTimer=setInterval(()=>{
    if(G.roomCode&&G.isHost){
      publishRoom('update',{players:G.roomPeers.length});
      // 清理过期房间
      const now=Date.now();
      for(const code in G.knownRooms){
        if(now-G.knownRooms[code].ts>30000)delete G.knownRooms[code];
      }
      renderLobby();
    }
  },8000);
}

function stopHeartbeat(){if(G.heartbeatTimer){clearInterval(G.heartbeatTimer);G.heartbeatTimer=null}}

function unregisterRoom(){
  stopHeartbeat();
  if(G.roomCode){
    publishRoom('close',{});
    delete G.knownRooms[G.roomCode];
  }
}

// ==================== PeerJS ====================
function genCode(){return Math.random().toString(36).substring(2,8).toUpperCase()}

function initPeer(){
  if(G.peer&&G.peer.open)return;
  if(G.peer){try{G.peer.destroy()}catch(e){}G.peer=null}
  G.peer=new Peer();
  G.peer.on('open',(id)=>{
    console.log('[Peer] open, id:',id);
    $('online-dot').classList.remove('off');
    $('conn-status').textContent='信号正常';
    $('conn-status').style.color='var(--green)';
  });
  G.peer.on('error',err=>{
    console.warn('[Peer] error:',err.type,err);
    if(err.type==='unavailable-id'){
      // ID冲突，重新生成随机ID
      try{G.peer.destroy()}catch(e){}
      G.peer=new Peer();
      setupPeerHandlers();
    }
    if(err.type==='peer-unavailable')toast('牌桌不存在或已撤掉');
    if(err.type==='network')toast('网络连接异常');
    if(err.type==='server-error')toast('信令服务器异常');
    if(err.type==='socket-error'||err.type==='socket-closed')toast('连接中断');
  });
  G.peer.on('disconnected',()=>{
    console.warn('[Peer] disconnected from signaling server');
    $('online-dot').classList.add('off');
    $('conn-status').textContent='信号断开';
    $('conn-status').style.color='var(--accent)';
    // 尝试重连信令服务器（不影响已建立的WebRTC连接）
    if(G.peer&&!G.peer.destroyed)G.peer.reconnect();
  });
  G.peer.on('connection',conn=>handleConnection(conn));
}

function setupPeerHandlers(){
  G.peer.on('open',()=>{
    $('online-dot').classList.remove('off');
    $('conn-status').textContent='信号正常';
    $('conn-status').style.color='var(--green)';
  });
  G.peer.on('connection',conn=>handleConnection(conn));
}

function handleConnection(conn){
  console.log('[Conn] incoming from:',conn.peer);
  conn.on('open',()=>{
    console.log('[Conn] open with:',conn.peer);
  });
  conn.on('data',d=>handleMsg(d,conn));
  conn.on('close',()=>{
    console.log('[Conn] closed with:',conn.peer);
    G.roomPeers=G.roomPeers.filter(p=>p.conn!==conn);
    updateWaitPlayers();
    if(G.isHost)publishRoom('update',{players:G.roomPeers.length});
  });
  conn.on('error',err=>{
    console.warn('[Conn] error:',err);
  });
}

function broadcast(data,excludeConn){
  if(G.isHost){
    for(const p of G.roomPeers){
      if(p.conn&&p.conn.open&&p.conn!==excludeConn)p.conn.send(data);
    }
  }else if(G.conn&&G.conn.open){
    G.conn.send(data);
  }
}

function handleMsg(d,fromConn){
  console.log('[Msg]',d.type,d);
  switch(d.type){
    case 'join':{
      // 主机收到客人加入请求
      if(G.roomPeers.find(p=>p.id===fromConn.peer))return; // 已在房间
      G.roomPeers.push({id:fromConn.peer,name:d.name,conn:fromConn});
      updateWaitPlayers();
      publishRoom('update',{players:G.roomPeers.length});
      // 发送欢迎消息，包含所有玩家列表（不含conn，因为是序列化数据）
      const playerList=G.roomPeers.map(p=>({id:p.id,name:p.name}));
      fromConn.send({type:'welcome',players:playerList,hostName:G.user,game:G.gameType,roomCode:G.roomCode});
      toast(d.name+' 到达了牌桌');
      break;
    }
    case 'welcome':{
      // 客人收到主机的欢迎消息
      G.isHost=false;G.gameType=d.game;G.roomCode=d.roomCode;
      // 构建roomPeers列表
      G.roomPeers=[{id:'host',name:d.hostName,conn:G.conn}];
      for(const p of d.players){
        if(p.id!=='host')G.roomPeers.push({id:p.id,name:p.name,conn:null});
      }
      showWaitPanel(false);
      toast('已到达牌桌，等待搭桌人开始...');
      break;
    }
    case 'start-game':{
      // 收到主机发来的游戏开始消息
      G.gameType=d.game;G.inGame=true;G.gameOver=false;G.myTurn=false;
      G.deck=d.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
      G.players=d.players.map(p=>({...p,cards:p.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}))}));
      G.pot=d.pot;G.currentBet=d.currentBet;
      G.playerOrder=d.playerOrder||G.players.map(p=>p.id);
      G.turnIndex=d.turnIndex||0;
      // 检查是否轮到自己
      checkMyTurn();
      showScreen('game');
      $('game-title').textContent=d.game==='zjh'?'物资炸金花':'物资二十一点';
      clearLog();log('=== 牌局开始，物资已入底池 ===','system');
      startCandle();renderTable();
      break;
    }
    case 'action':{handleRemoteAction(d);break}
    case 'turn':{
      // 主机通知轮到谁了
      G.turnIndex=d.turnIndex;
      G.playerOrder=d.playerOrder;
      checkMyTurn();
      renderTable();
      break;
    }
    case 'result':{
      showModal(d.title,d.text,d.win);
      G.gameOver=true;stopCandle();
      // 同步最终状态
      if(d.players){
        for(const rp of d.players){
          const lp=G.players.find(p=>p.id===rp.id);
          if(lp)lp.chips=rp.chips;
        }
      }
      renderTable();
      break;
    }
  }
}

function checkMyTurn(){
  if(G.gameOver)return;
  if(G.gameType==='zjh'){
    // 炸金花：按顺序轮流
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.folded){
      const currentId=G.playerOrder[G.turnIndex%G.playerOrder.length];
      G.myTurn=(me.id===currentId);
    }else{
      G.myTurn=false;
    }
  }else{
    // 二十一点：所有人同时操作，只要自己没爆牌就轮到自己
    const me=G.players.find(p=>p.isMe);
    if(me&&!me.busted)G.myTurn=true;
    else G.myTurn=false;
  }
}

// ==================== 蜡烛计时 ====================
function startCandle(){
  stopCandle();G.candleTime=G.candleMax;updateCandleUI();
  G.candleTimer=setInterval(()=>{
    G.candleTime--;updateCandleUI();
    if(G.candleTime<=0){
      stopCandle();
      if(!G.gameOver){
        G.gameOver=true;log('蜡烛烧尽！强制结算！','system');
        if(G.isHost)hostForceSettle();
      }
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
  // 找最优玩家
  let best=active[0];
  if(G.gameType==='zjh'){
    for(let i=1;i<active.length;i++){
      if(evalZJH(active[i].cards).val>evalZJH(best.cards).val)best=active[i];
    }
  }else{
    for(let i=1;i<active.length;i++){
      if(bjValue(active[i].cards)>bjValue(best.cards))best=active[i];
    }
  }
  best.chips+=G.pot;
  const result={
    type:'result',
    title:'蜡烛烧尽',
    text:`强制结算！${best.name} 获得底池 ${G.pot} 单位`,
    win:best.isMe,
    players:G.players.map(p=>({id:p.id,chips:p.chips}))
  };
  // 通知所有客人
  for(const p of G.roomPeers){
    if(p.conn&&p.conn.open){
      const r={...result};
      r.win=(p.id===best.id);
      p.conn.send(r);
    }
  }
  // 主机自己也显示
  showModal('蜡烛烧尽',best.isMe?`强制结算！你获得底池 ${G.pot} 单位`:`强制结算！${best.name} 获得底池 ${G.pot} 单位`,best.isMe);
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
  // 自己的房间始终显示
  if(G.isHost&&G.roomCode){
    rooms[G.roomCode]={name:G.user,game:G.gameType,players:G.roomPeers.length,ts:Date.now(),isMine:true};
  }

  const codes=Object.keys(rooms);
  if(codes.length===0){
    grid.innerHTML=`
      <div class="empty-lobby">
        <div class="icon">🏚️</div>
        <p>仓储区还没有牌桌</p>
        <p style="font-size:11px">点击"搭新桌"开始，等其他人来</p>
      </div>`;
    return;
  }

  grid.innerHTML=codes.map(code=>{
    const r=rooms[code];
    return renderTableCard(code,r.game,r.name,r.players,3,!!r.isMine);
  }).join('');
}

function renderTableCard(code,gameType,hostName,playerCount,maxSeats,isMyTable){
  const label=gameType==='zjh'?'物资炸金花':'物资二十一点';
  const icon=gameType==='zjh'?'🥫':'⛽';
  const tier=gameType==='zjh'?'低端局 · 罐头级':'中端局 · 汽油级';
  let seats='';
  const count=Math.min(playerCount,maxSeats);
  for(let i=0;i<maxSeats;i++){
    if(i===0)seats+=`<div class="seat occupied"><div class="seat-dot"></div>${escHTML(hostName)}(搭桌人)</div>`;
    else if(i<count)seats+=`<div class="seat occupied"><div class="seat-dot"></div>幸存者</div>`;
    else seats+=`<div class="seat empty"><div class="seat-dot"></div>空位</div>`;
  }
  const statusClass=count>=2?'playing':'waiting';
  const statusText=count>=2?'可开局':'等待中';
  const clickHandler=isMyTable?'showWaitPanel(true)':`joinTableByCode('${code}')`;
  return `
    <div class="table-card" onclick="${clickHandler}">
      <div class="table-visual">
        <div class="candle-glow"></div>
        <div class="seats">${seats}</div>
      </div>
      <div class="table-info">
        <div class="table-name"><span>${icon} ${code}号桌</span><span class="table-status ${statusClass}">${statusText}</span></div>
        <div class="table-game">${label} · ${tier}</div>
        <div class="table-meta"><div class="table-players">${count}/${maxSeats} 人</div></div>
      </div>
    </div>`;
}

function escHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ==================== 创建牌桌 ====================
function showCreateModal(){$('create-modal').classList.add('open')}
function hideCreateModal(){$('create-modal').classList.remove('open')}
function selectGame(type,el){G.createGameType=type;document.querySelectorAll('.game-opt').forEach(e=>e.classList.remove('selected'));el.classList.add('selected')}
function doCreateTable(){hideCreateModal();createRoom(G.createGameType)}

function createRoom(gameType){
  // 如果已有房间，先清理
  if(G.roomCode)cleanupRoom();
  if(G.conn){try{G.conn.close()}catch(e){}G.conn=null}

  G.gameType=gameType;G.isHost=true;G.roomCode=genCode();
  G.hostPeerId='wl-'+G.roomCode.toLowerCase()+'-host';

  // 销毁旧peer，创建带指定ID的新peer
  if(G.peer){try{G.peer.destroy()}catch(e){}G.peer=null}
  G.peer=new Peer(G.hostPeerId);
  G.peer.on('open',()=>{
    console.log('[Host] peer open, id:',G.hostPeerId);
    $('online-dot').classList.remove('off');
    $('conn-status').textContent='在线 · 搭桌人';
    $('conn-status').style.color='var(--green)';
    G.roomPeers=[{id:'host',name:G.user,conn:null}];
    publishRoom('create',{players:1});
    startHeartbeat();
    showWaitPanel(true);renderLobby();
    toast('牌桌已搭好！等待其他幸存者');
  });
  G.peer.on('error',err=>{
    console.warn('[Host] peer error:',err.type,err);
    if(err.type==='unavailable-id'){
      toast('桌号冲突，重新搭');
      G.roomCode=null;G.hostPeerId=null;
      try{G.peer.destroy()}catch(e){}
      G.peer=new Peer();setupPeerHandlers();
    }else{
      toast('搭桌出错: '+err.type);
    }
  });
  G.peer.on('connection',conn=>handleConnection(conn));
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
  el.innerHTML=G.roomPeers.map(p=>`
    <div class="wait-player"><div class="dot"></div><div class="name">${escHTML(p.name)}${p.id==='host'?' (搭桌人)':''}</div><div class="tag">${p.id==='host'?'已连接':'已到达'}</div></div>
  `).join('');
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
  if(G.conn&&G.conn.open){toast('你已在某张牌桌上');return}
  // 清理旧连接
  if(G.conn){try{G.conn.close()}catch(e){}G.conn=null}
  G.roomCode=null;
  toast('正在前往'+code+'号桌...');
  doJoin(code);
}

function doJoin(code){
  if(!G.peer||!G.peer.open){
    if(G.peer){try{G.peer.destroy()}catch(e){}G.peer=null}
    initPeer();
    let attempts=0;
    const w=setInterval(()=>{
      attempts++;
      if(G.peer&&G.peer.open){
        clearInterval(w);
        connectToHost(code);
      }else if(attempts>50){
        clearInterval(w);
        toast('信号超时，刷新页面重试');
      }
    },300);
  }else{connectToHost(code)}
}

function connectToHost(code){
  const hostId='wl-'+code.toLowerCase()+'-host';
  console.log('[Join] connecting to host:',hostId);
  const conn=G.peer.connect(hostId,{reliable:true});
  if(!conn){toast('连接失败');return}
  G.conn=conn;
  let connected=false;

  conn.on('open',()=>{
    connected=true;
    console.log('[Join] connection open, sending join...');
    conn.send({type:'join',name:G.user});
    toast('已连接到'+code+'号桌');
  });
  conn.on('data',d=>handleMsg(d,conn));
  conn.on('close',()=>{
    console.log('[Join] connection closed');
    if(!G.inGame){
      G.conn=null;G.roomCode=null;
      toast('与牌桌断开连接');
      renderLobby();
    }
  });
  conn.on('error',err=>{
    console.warn('[Join] connection error:',err);
    if(!connected)toast('连接失败，牌桌可能不存在');
  });
  setTimeout(()=>{
    if(!connected){
      toast('连接超时，牌桌可能不存在');
      try{conn.close()}catch(e){}
      G.conn=null;
    }
  },10000);
}

// ==================== 关闭/清理房间 ====================
function closeRoom(){
  $('wait-panel').style.display='none';
  cleanupRoom();
  // 重建普通peer
  if(G.peer){try{G.peer.destroy()}catch(e){}G.peer=null}
  initPeer();
  renderLobby();
}

function cleanupRoom(){
  unregisterRoom();
  for(const p of G.roomPeers){if(p.conn&&p.conn.open)try{p.conn.close()}catch(e){}}
  G.roomPeers=[];G.conn=null;G.roomCode=null;G.isHost=false;G.hostPeerId=null;
  G.inGame=false;G.gameOver=false;G.myTurn=false;
  stopCandle();
}

function cleanupAll(){
  cleanupRoom();
  if(G.peer){try{G.peer.destroy()}catch(e){}G.peer=null}
  G.mqttConnected=false;
}

// ==================== 开始游戏 ====================
function hostStartGame(){
  if(!G.isHost||G.roomPeers.length<2)return;
  const deck=makeDeck();
  const players=[];
  G.playerOrder=G.roomPeers.map(p=>p.id);

  if(G.gameType==='zjh'){
    for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,cards:[deck.pop(),deck.pop(),deck.pop()],chips:50,bet:5,folded:false,seen:false,isMe:false});
    G.pot=players.length*5;G.currentBet=5;
  }else{
    for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,cards:[deck.pop(),deck.pop()],chips:50,bet:10,busted:false,isMe:false});
    G.pot=players.length*10;G.currentBet=10;
  }
  G.players=players;G.gameOver=false;G.inGame=true;G.turnIndex=0;

  // 给每个客人发送游戏数据（标记isMe）
  for(const p of G.roomPeers){
    if(p.conn&&p.conn.open){
      const data={
        type:'start-game',
        game:G.gameType,
        deck:deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),
        players:players.map(pl=>({
          id:pl.id,name:pl.name,
          cards:pl.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),
          chips:pl.chips,bet:pl.bet,
          folded:pl.folded,seen:pl.seen,busted:pl.busted,
          isMe:pl.id===p.id
        })),
        pot:G.pot,currentBet:G.currentBet,
        playerOrder:G.playerOrder,turnIndex:0
      };
      p.conn.send(data);
    }
  }

  // 主机自己标记isMe
  G.players.forEach(pl=>{pl.isMe=pl.id==='host'});
  checkMyTurn();

  $('wait-panel').style.display='none';
  showScreen('game');
  $('game-title').textContent=G.gameType==='zjh'?'物资炸金花':'物资二十一点';
  clearLog();log('=== 牌局开始，物资已入底池 ===','system');
  startCandle();renderTable();
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
    $('action-bar').innerHTML=`
      <button class="action-btn danger" onclick="doAction('fold')">弃牌</button>
      <button class="action-btn" onclick="doAction('look')">看牌</button>
      <button class="action-btn warning" onclick="doAction('call')">跟注 ${G.currentBet}</button>
      <button class="action-btn primary" onclick="doAction('raise')">加注</button>`;
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
    $('action-bar').innerHTML=`
      <button class="action-btn success" onclick="doAction('hit')">要牌</button>
      <button class="action-btn" onclick="doAction('stand')">停牌</button>`;
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
  const me=G.players.find(p=>p.isMe);
  if(!me||!G.myTurn||G.gameOver)return;

  if(G.gameType==='zjh')doZJHAction(me,action);
  else doBJAction(me,action);

  // 广播操作（不发送牌面数据，只发状态变化）
  const syncData={
    cards:G.players.map(p=>({
      id:p.id,chips:p.chips,bet:p.bet,
      folded:p.folded,seen:p.seen,busted:p.busted
    })),
    pot:G.pot,currentBet:G.currentBet,gameOver:G.gameOver
  };
  broadcast({type:'action',playerId:me.id,action,data:syncData});
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
      log(`${me.name} 看了牌`);
      // 看牌不结束回合
      break;
    case 'call':
      if(!me.seen)me.seen=true;
      me.chips-=G.currentBet;me.bet+=G.currentBet;G.pot+=G.currentBet;
      G.myTurn=false;
      log(`${me.name} 跟注 ${G.currentBet}单位`);
      advanceTurn();
      checkZJHEnd();
      break;
    case 'raise':
      const amt=Math.min(me.chips,G.currentBet*2);
      if(!me.seen)me.seen=true;
      me.chips-=amt;me.bet+=amt;G.pot+=amt;G.currentBet=amt;
      G.myTurn=false;
      log(`${me.name} 加注到 ${amt}单位`);
      advanceTurn();
      checkZJHEnd();
      break;
  }
}

function advanceTurn(){
  // 推进轮次索引
  G.turnIndex++;
  // 广播轮次变化
  broadcast({type:'turn',turnIndex:G.turnIndex,playerOrder:G.playerOrder});
}

function checkZJHEnd(){
  const active=G.players.filter(p=>!p.folded);
  if(active.length<=1){
    const winner=active[0]||G.players[0];
    winner.chips+=G.pot;G.gameOver=true;stopCandle();
    const isMe=winner.isMe;
    // 通知所有玩家结果
    const result={
      type:'result',
      title:isMe?'物资归你':'物资被收走',
      text:isMe?`你赢得了底池 ${G.pot} 单位物资`:`${winner.name} 赢得了 ${G.pot} 单位物资`,
      win:isMe,
      players:G.players.map(p=>({id:p.id,chips:p.chips}))
    };
    broadcast(result);
    showModal(result.title,result.text,isMe);
  }
  // 如果没结束，由turn消息触发下一个玩家的myTurn
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
      // 没爆牌的话继续轮到自己
      break;
    case 'stand':
      G.myTurn=false;
      log(`${me.name} 停牌，点数 ${bjValue(me.cards)}`);
      checkBJEnd();
      break;
  }
}

function checkBJEnd(){
  // 检查是否所有人都操作完毕
  const allDone=G.players.every(p=>p.busted||bjValue(p.cards)>=17||p.folded);
  if(!allDone)return;

  const active=G.players.filter(p=>!p.busted&&!p.folded);
  if(active.length===0)return;

  let best=active[0];
  for(let i=1;i<active.length;i++){
    if(bjValue(active[i].cards)>bjValue(best.cards))best=active[i];
  }
  best.chips+=G.pot;G.gameOver=true;stopCandle();
  const isMe=best.isMe;
  const result={
    type:'result',
    title:isMe?'物资归你':'物资被收走',
    text:isMe?`你以 ${bjValue(best.cards)} 点获胜，获得 ${G.pot} 单位`:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,
    win:isMe,
    players:G.players.map(p=>({id:p.id,chips:p.chips}))
  };
  broadcast(result);
  showModal(result.title,result.text,isMe);
}

function handleRemoteAction(d){
  const{playerId,action,data}=d;
  // 同步游戏状态
  if(data){
    G.pot=data.pot;G.currentBet=data.currentBet;
    G.gameOver=data.gameOver||false;
    for(const rp of data.cards){
      const lp=G.players.find(p=>p.id===rp.id);
      if(lp){lp.chips=rp.chips;lp.bet=rp.bet;lp.folded=rp.folded;lp.seen=rp.seen;lp.busted=rp.busted}
    }
  }
  // 显示日志
  const rp=G.players.find(p=>p.id===playerId);
  if(rp){
    const n={fold:'弃牌',look:'看牌',call:'跟注',raise:'加注',hit:'要牌',stand:'停牌'};
    log(`${rp.name} ${n[action]||action}`);
  }
  // 检查是否轮到自己
  checkMyTurn();
  if(G.myTurn&&!G.gameOver)log('轮到你操作','system');
  renderTable();
}

function leaveGame(){
  if(!G.inGame)return;
  G.gameOver=true;G.myTurn=false;G.inGame=false;stopCandle();
  // 通知其他人自己弃牌/离开
  const me=G.players.find(p=>p.isMe);
  if(me){
    me.folded=true;
    broadcast({type:'action',playerId:me.id,action:'fold',data:{
      cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted})),
      pot:G.pot,currentBet:G.currentBet,gameOver:false
    }});
  }
  // 回到大厅，但保留连接（可以继续在房间里等下一局）
  showScreen('main');
  $('wait-panel').style.display='none';
  renderLobby();
}

// ==================== 初始化 ====================
renderLobby();
setInterval(()=>{
  const now=Date.now();
  let changed=false;
  for(const code in G.knownRooms){
    if(now-G.knownRooms[code].ts>30000){delete G.knownRooms[code];changed=true}
  }
  if(changed)renderLobby();
},5000);
