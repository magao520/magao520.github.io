// ============================================================
// 废土交易所 - 生存物资赌场 v9.5
// 修复：Lobby TDZ崩溃、Canvas尺寸、画面提亮、暗角减弱
// ============================================================
'use strict';

const MQTT_BROKER='wss://broker.emqx.io:8084/mqtt';
const TOPIC_LOBBY='wl_lobby_v6';
const TOPIC_ROOMS='wl_rooms_v6/#';
const TOPIC_ROOM_PREFIX='wl_rooms_v6';
const TOPIC_PRESENCE='wl_presence_v6';
const TOPIC_CHAT='wl_chat_v6';

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
  msgSeq:0,
  // 在线幸存者
  onlineUsers:{}, // {id: {name, ts, roomCode}}
  presenceTimer:null,
  diceState:{dice:[null,null,null],sum:0,phase:'bet'}
};

const SUITS=['♠','♥','♣','♦'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
const Sound={
  _ctx:null,_enabled:true,_bgmOsc:null,_bgmGain:null,
  _init(){if(this._ctx)return;try{this._ctx=new(window.AudioContext||window.webkitAudioContext)();if(this._ctx.state==='suspended')this._ctx.resume()}catch(e){this._enabled=false}},
  _p(f,t='square',g=0.08,delay=0){
    if(!this._enabled)return;this._init();
    const now=this._ctx.currentTime+delay;
    const o=this._ctx.createOscillator(),v=this._ctx.createGain();
    o.type=t;o.frequency.value=f;v.gain.value=g;
    o.connect(v);v.connect(this._ctx.destination);
    v.gain.exponentialRampToValueAtTime(0.001,now+0.15);
    o.start(now);o.stop(now+0.15);
  },
  deal(){this._p(800,'square',0.05);setTimeout(()=>this._p(1000,'square',0.05),60)},
  chip(){this._p(600,'sine',0.08);setTimeout(()=>this._p(900,'sine',0.08),50)},
  win(){this._p(523,'sine',0.08);setTimeout(()=>this._p(659,'sine',0.08),120);setTimeout(()=>this._p(784,'sine',0.08),240);flashScreen('var(--green)')},
  lose(){this._p(400,'sine',0.06);setTimeout(()=>this._p(300,'sine',0.06),150);flashScreen('var(--accent)')},
  click(){this._p(1200,'square',0.03)},
  dice(){for(let i=0;i<5;i++)setTimeout(()=>this._p(200+Math.random()*200,'triangle',0.04),i*40)},
  fold(){this._p(200,'sawtooth',0.04)},
  toggle(){this._enabled=!this._enabled;if(this._enabled){this.chip();this.startBGM()}else{this.fold();this.stopBGM()}return this._enabled},
  startBGM(){
    if(!this._enabled)return;this._init();
    if(this._bgmOsc)return;
    const ctx=this._ctx;
    this._bgmGain=ctx.createGain();this._bgmGain.gain.value=0.015;
    this._bgmGain.connect(ctx.destination);
    this._bgmOsc=ctx.createOscillator();this._bgmOsc.type='sine';this._bgmOsc.frequency.value=80;
    this._bgmOsc.connect(this._bgmGain);
    this._bgmOsc.start();
    // 风声LFO
    const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=0.2;
    const lfoGain=ctx.createGain();lfoGain.gain.value=30;
    lfo.connect(lfoGain);lfoGain.connect(this._bgmOsc.frequency);
    lfo.start();
    this._bgmLfo=lfo;this._bgmLfoGain=lfoGain;
  },
  stopBGM(){if(this._bgmOsc){try{this._bgmOsc.stop()}catch(e){}this._bgmOsc=null}if(this._bgmLfo){try{this._bgmLfo.stop()}catch(e){}this._bgmLfo=null}if(this._bgmGain){try{this._bgmGain.disconnect()}catch(e){}this._bgmGain=null}},
  step(){this._p(80,'sine',0.02)},
  join(){this._p(440,'sine',0.05);setTimeout(()=>this._p(550,'sine',0.05),100)},
  chat(){this._p(880,'sine',0.03)}
};
function toggleSound(){
  const on=Sound.toggle();
  const el=document.getElementById('sound-toggle');
  if(el){el.textContent=on?'🔊':'🔇';el.classList.toggle('muted',!on)}
  const se=document.getElementById('settings-sound');
  if(se)se.textContent=on?'开启':'关闭';
}
function toggleBGM(){
  if(Sound._bgmOsc){Sound.stopBGM();}else{Sound.startBGM();}
  const be=document.getElementById('settings-bgm');
  if(be)be.textContent=Sound._bgmOsc?'开启':'关闭';
}
function showSettings(){
  const m=$('settings-modal');if(m)m.classList.add('open');
  const se=$('settings-sound');if(se)se.textContent=Sound._enabled?'开启':'关闭';
  const be=$('settings-bgm');if(be)be.textContent=Sound._bgmOsc?'开启':'关闭';
}
function closeSettings(){const m=$('settings-modal');if(m)m.classList.remove('open');}
function showCharSelect(){
  const m=$('char-modal');if(m)m.classList.add('open');
  const c=$('char-selector-modal');if(!c)return;
  let html='';
  for(let i=0;i<CHARACTERS.length;i++){
    const ch=CHARACTERS[i];
    html+=`<div class="char-opt ${i===selectedChar?'selected':''}" onclick="selectCharModal(${i})" style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid ${i===selectedChar?'var(--gold)':'var(--border)'};border-radius:4px;cursor:pointer;text-align:center;min-width:60px"><div style="font-size:24px">${ch.emoji}</div><div style="font-size:10px">${ch.name}</div></div>`;
  }
  c.innerHTML=html;
}
function selectCharModal(idx){
  selectedChar=idx;
  const emoji=CHARACTERS[idx]?.emoji||'🐦';
  if(typeof Lobby!=='undefined'&&Lobby.me)Lobby.me.emoji=emoji;
  save();
  renderCharSelector();
  showCharSelect();
  publishPresence();
}
function closeCharSelect(){const m=$('char-modal');if(m)m.classList.remove('open');}
const MAX_ROUNDS=20;
const MAX_SEATS=3;
const CHARACTERS=[
  {emoji:'🐦',name:'灰鸽',desc:'废土信使'},
  {emoji:'🐱',name:'野猫',desc:'夜行猎手'},
  {emoji:'🐕',name:'流浪狗',desc:'忠诚伙伴'},
  {emoji:'🦊',name:'赤狐',desc:'狡黠商人'},
  {emoji:'🐀',name:'巨鼠',desc:'下水道王'},
  {emoji:'🦎',name:'壁虎',desc:'攀爬专家'}
];
let selectedChar=0;
let _savedPos=null;

function $(id){return document.getElementById(id)}
function genId(){return Math.random().toString(36).substr(2,10)}
function genCode(){return Math.random().toString(36).substring(2,8).toUpperCase()}

function resetGameState(){
  G.players=[];G.deck=[];G.pot=0;G.currentBet=0;
  G.myTurn=false;G.gameOver=false;G.logs=[];
  G.turnIndex=0;G.playerOrder=[];G.roundCount=0;G.resultShown=false;
  G.diceState={dice:[null,null,null],sum:0,phase:'bet'};
  _lastRenderHash='';
  _zjhCache.clear();
  clearLog();
}

// ==================== 存储 ====================
function load(){try{const s=localStorage.getItem('wl_user');if(s){const d=JSON.parse(s);G.user=d.n;G.chips=d.c||50;if(d.s!==undefined)selectedChar=d.s;if(d.px!==undefined&&d.py!==undefined){_savedPos={x:d.px,y:d.py}}return true}}catch(e){}return false}
function save(){if(G.user)try{const px=typeof Lobby!=='undefined'&&Lobby.me?Lobby.me.x:0;const py=typeof Lobby!=='undefined'&&Lobby.me?Lobby.me.y:0;localStorage.setItem('wl_user',JSON.stringify({n:G.user,c:G.chips,s:selectedChar,px,py}))}catch(e){}}
function loadQuest(){try{const s=localStorage.getItem('wl_quest');if(s)return JSON.parse(s)}catch(e){}return {date:'',progress:0,claimed:false}}
function saveQuest(q){try{localStorage.setItem('wl_quest',JSON.stringify(q))}catch(e){}}
function checkQuest(){
  const q=loadQuest();const d=new Date();const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if(q.date!==today){q.date=today;q.progress=0;q.claimed=false;saveQuest(q);}
  return q;
}
function updateQuestPanel(){
  const q=checkQuest();const el=$('quest-panel');if(!el)return;
  const pct=(q.progress/3)*100;
  const winner=getTodayWinner();
  el.innerHTML=`<div style="font-size:11px;color:var(--gold);margin-bottom:4px">今日任务：参与3局游戏</div><div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--green);transition:width .3s"></div></div><div style="font-size:10px;color:var(--dim);margin-top:3px">${q.progress}/3 ${q.claimed?'已领取':'进行中'}</div>${winner?`<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:4px;font-size:10px;color:var(--gold)">今日赢家: ${winner.emoji} ${escHTML(winner.name)} (${winner.chips}单位)</div>`:''}`;
}
function getTodayWinner(){
  const now=Date.now();
  let best=null;
  for(const id in G.onlineUsers){
    const u=G.onlineUsers[id];
    if(now-u.ts<45000&&(!best||u.chips>best.chips))best=u;
  }
  return best;
}
function completeGameQuest(){
  const q=checkQuest();
  if(q.progress<3){q.progress++;saveQuest(q);updateQuestPanel();}
  if(q.progress>=3&&!q.claimed){q.claimed=true;G.chips+=10;saveQuest(q);save();updateChips();toast('任务完成！获得10单位物资');}
}
function checkRelief(){
  const d=new Date();
  const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  try{
    const s=localStorage.getItem('wl_relief');
    const data=s?JSON.parse(s):{date:'',claimed:false};
    if(data.date!==today&&G.chips<10){
      G.chips+=20;save();
      localStorage.setItem('wl_relief',JSON.stringify({date:today,claimed:true}));
      toast('每日救济金：获得20单位物资');updateChips();
    }
  }catch(e){}
}
function loadAchievements(){try{const s=localStorage.getItem('wl_achievements');return s?JSON.parse(s):{}}catch(e){return {}}}
function saveAchievements(a){try{localStorage.setItem('wl_achievements',JSON.stringify(a))}catch(e){}}
function checkAchievement(key,name,desc){
  const a=loadAchievements();if(a[key])return;
  a[key]=Date.now();saveAchievements(a);
  toast(`成就解锁：${name}`);
  Sound.win();
}
function checkHighRoller(){if(G.currentBet>=50)checkAchievement('highRoller','大赌客','单次下注50+');}
function checkFirstWin(){checkAchievement('firstWin','初战告捷','获得第一场胜利');}
function checkLuckyStreak(){
  try{const s=localStorage.getItem('wl_streak');const streak=s?parseInt(s):0;if(streak>=3)checkAchievement('luckyStreak','好运连连','连胜3场');}catch(e){}
}
function updateStreak(won){
  try{let streak=parseInt(localStorage.getItem('wl_streak')||'0');streak=won?streak+1:0;localStorage.setItem('wl_streak',String(streak));if(won)checkLuckyStreak();}catch(e){}
}
function loadStats(){try{const s=localStorage.getItem('wl_stats');return s?JSON.parse(s):{games:0,wins:0,zjh:0,bj:0,dice:0}}catch(e){return {games:0,wins:0,zjh:0,bj:0,dice:0}}}
function saveStats(st){try{localStorage.setItem('wl_stats',JSON.stringify(st))}catch(e){}}
function updateStats(gameType,won){
  const st=loadStats();st.games++;if(won)st.wins++;
  if(gameType==='zjh')st.zjh++;else if(gameType==='bj')st.bj++;else if(gameType==='dice')st.dice++;
  saveStats(st);
}
function showStatsPanel(){
  const st=loadStats();
  const winRate=st.games>0?Math.round(st.wins/st.games*100):0;
  const fav=st.zjh>st.bj&&st.zjh>st.dice?'炸金花':(st.bj>st.dice?'二十一点':'骰子');
  const div=document.createElement('div');div.className='modal-overlay';div.id='stats-modal';
  div.innerHTML=`<div class="modal" style="max-width:300px;text-align:left"><h3 style="text-align:center">数据统计</h3><div style="font-size:13px;line-height:1.8"><div>总场次：${st.games}</div><div>胜场：${st.wins}</div><div>胜率：${winRate}%</div><div>最爱游戏：${fav}</div><div>炸金花：${st.zjh}场</div><div>二十一点：${st.bj}场</div><div>骰子：${st.dice}场</div></div><div style="text-align:center;margin-top:12px"><button class="modal-btn btn-press" onclick="document.getElementById('stats-modal').remove()">关闭</button></div></div>`;
  document.body.appendChild(div);
}
function loadFavorites(){try{const s=localStorage.getItem('wl_favorites');return s?JSON.parse(s):[]}catch(e){return []}}
function saveFavorites(f){try{localStorage.setItem('wl_favorites',JSON.stringify(f))}catch(e){}}
function addFavorite(id,name,emoji){
  const f=loadFavorites();if(!f.find(x=>x.id===id)){f.push({id,name,emoji,ts:Date.now()});saveFavorites(f);toast(`已收藏 ${name}`);}
}
function renderFavorites(){
  const f=loadFavorites();const el=$('fav-list');if(!el)return;
  if(f.length===0){el.innerHTML='<div style="font-size:11px;color:var(--dim)">暂无收藏</div>';return;}
  el.innerHTML=f.map(u=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0"><span>${u.emoji||'🐦'}</span><span style="font-size:12px">${escHTML(u.name)}</span></div>`).join('');
}

// ==================== 牌 ====================
function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({s,r,v:RV[r],red:s==='♥'||s==='♦'});return shuffle(d)}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function cardHTML(c,hidden){if(hidden)return'<div class="card-back"></div>';return`<div class="card ${c.red?'red':'black'}"><div class="card-rank">${c.r}</div><div class="card-suit">${c.s}</div></div>`}
function cloneCard(c){return{s:c.s,r:c.r,v:c.v,red:c.red}}
function cloneCards(a){return a.map(cloneCard)}

// ==================== UI ====================
function hideLoading(){
  const lo=$('loading-overlay');
  if(lo){lo.style.opacity='0';setTimeout(()=>{lo.style.display='none'},500)}
}
function showLoading(){
  const l=$('loading');if(l){l.style.display='block';l.style.opacity='1'}
  const tips=['靠近桌子按E加入游戏','按住Shift可以冲刺移动','按Enter键打开聊天','按Q键打开表情轮盘','收集废金属可以获得额外奖励'];
  const tip=$('loading-tip');if(tip)tip.textContent='提示：'+tips[Math.floor(Math.random()*tips.length)];
}
function showScreen(n){
  hideLoading();
  const a=$('auth-screen'),m=$('main-screen'),g=$('game-screen');
  if(a)a.style.display=n==='auth'?'flex':'none';
  if(m)m.style.display=n==='main'?'block':'none';
  if(g)g.style.display=n==='game'?'block':'none';
  // 屏幕转场淡入
  const active=n==='auth'?a:(n==='main'?m:g);
  if(active){active.style.opacity='0';active.style.transition='opacity .3s';requestAnimationFrame(()=>{active.style.opacity='1'})}
  // 启动/停止大厅
  try{if(n==='main'){Lobby.show()}else{Lobby.hide()}}catch(e){}
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
  const mt=$('modal-title'),txt=$('modal-text'),rm=$('result-modal'),av=$('modal-avatar'),mc=$('modal-chips');
  if(mt){mt.textContent=t;mt.className='modal-title '+(w?'win':'lose')}
  if(txt)txt.textContent=m;
  if(av){av.textContent=CHARACTERS[selectedChar]?.emoji||'🎲';}
  if(mc){mc.style.display='block';mc.textContent=w?'+10单位物资':'-10单位物资';mc.style.color=w?'var(--green)':'var(--accent)';}
  if(rm)rm.classList.add('open');
  if(w){startConfetti();checkFirstWin();}else{startScreenShake();}
  updateStreak(w);
  updateStats(G.gameType||'zjh',w);
}
function showEmoteWheel(){
  const existing=$('emote-wheel');if(existing)return;
  const div=document.createElement('div');div.id='emote-wheel';
  div.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:100;display:flex;gap:8px;background:rgba(0,0,0,.8);border:1px solid var(--gold);padding:8px 12px;border-radius:8px';
  const emotes=[{e:'👋',n:'挥手'},{e:'💃',n:'跳舞'},{e:'🧘',n:'坐下'},{e:'😂',n:'大笑'},{e:'👍',n:'点赞'}];
  div.innerHTML=emotes.map(em=>`<button onclick="sendEmote('${em.e}')" style="background:transparent;border:1px solid var(--border);border-radius:4px;padding:6px 10px;color:var(--text);font-size:18px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px"><span>${em.e}</span><span style="font-size:9px;color:var(--dim)">${em.n}</span></button>`).join('');
  document.body.appendChild(div);
  setTimeout(()=>{if($('emote-wheel'))closeEmoteWheel();},5000);
}
function closeEmoteWheel(){const e=$('emote-wheel');if(e)e.remove();}
function sendEmote(emoji){
  closeEmoteWheel();
  Lobby.me.reaction=emoji;Lobby.me.reactionTime=Date.now();
  if(G.mqtt&&G.mqttConnected){
    G.mqtt.publish(TOPIC_CHAT,JSON.stringify({id:G.myId,name:G.user,text:emoji,emoji:CHARACTERS[selectedChar]?.emoji||'🐦',ts:Date.now(),isEmote:true}),{qos:0});
  }
  Sound.click();
}

function closeModal(){
  const rm=$('result-modal');
  if(rm)rm.classList.remove('open');
  stopConfetti();stopScreenShake();
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
let _confettiParticles=[],_confettiTimer=null,_shakeTimer=null;
function startConfetti(){
  stopConfetti();
  _confettiParticles=[];
  for(let i=0;i<60;i++){
    _confettiParticles.push({x:Math.random()*window.innerWidth,y:-Math.random()*200,vx:(Math.random()-.5)*4,vy:Math.random()*3+2,color:['#b8960f','#c4463a','#5a8a3c','#d4c8a8'][Math.floor(Math.random()*4)],rot:Math.random()*360,rotSpeed:(Math.random()-.5)*10,size:Math.random()*6+4});
  }
  const c=document.createElement('canvas');c.id='confetti-canvas';c.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:9999';document.body.appendChild(c);
  const ctx=c.getContext('2d');c.width=window.innerWidth;c.height=window.innerHeight;
  _confettiTimer=setInterval(()=>{
    ctx.clearRect(0,0,c.width,c.height);
    for(const p of _confettiParticles){
      p.x+=p.vx;p.y+=p.vy;p.rot+=p.rotSpeed;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
      ctx.restore();
      if(p.y>c.height+20)p.y=-20;
    }
  },30);
}
function stopConfetti(){if(_confettiTimer){clearInterval(_confettiTimer);_confettiTimer=null}const c=$('confetti-canvas');if(c)c.remove();_confettiParticles=[];}
function startScreenShake(){
  if(_shakeTimer)return;
  let elapsed=0;
  _shakeTimer=setInterval(()=>{
    elapsed+=50;
    const intensity=Math.max(0,5-elapsed/400);
    const dx=(Math.random()-.5)*intensity*2;
    const dy=(Math.random()-.5)*intensity*2;
    document.body.style.transform=`translate(${dx}px,${dy}px)`;
    if(elapsed>2000){stopScreenShake();}
  },50);
}
function stopScreenShake(){if(_shakeTimer){clearInterval(_shakeTimer);_shakeTimer=null}document.body.style.transform='';}
function toast(msg){
  const existing=document.querySelectorAll('.toast');
  if(existing.length>=3)existing[0].remove();
  const t=document.createElement('div');
  t.className='toast';
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{if(t.parentNode)t.remove()},3500);
}
function flashScreen(color='var(--gold)'){
  const f=document.createElement('div');
  f.style.cssText=`position:fixed;inset:0;background:${color};opacity:.1;pointer-events:none;z-index:5000;transition:opacity .3s`;
  document.body.appendChild(f);
  requestAnimationFrame(()=>{f.style.opacity='0';setTimeout(()=>f.remove(),300)});
}
function escHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

// ==================== 在线幸存者列表 ====================
function publishPresence(){
  if(!G.mqtt||!G.mqttConnected||!G.myId)return;
  const msg={type:'presence',id:G.myId,name:G.user||'幸存者',ts:Date.now(),roomCode:G.roomCode||null,emoji:CHARACTERS[selectedChar]?.emoji||'🐦',chips:G.chips};
  G.mqtt.publish(TOPIC_PRESENCE,JSON.stringify(msg),{qos:0,retain:false});
}

function handlePresenceMsg(msg){
  if(!msg||!msg.id||msg.id===G.myId)return;
  if(Date.now()-msg.ts>45000)return; // 45秒超时
  G.onlineUsers[msg.id]={name:msg.name,ts:msg.ts,room:msg.roomCode||msg.room||null,emoji:msg.emoji||'🐦',chips:msg.chips||0};
  renderOnlineList();
}

function handleChatMsg(msg){
  if(!msg||!msg.id||msg.id===G.myId)return;
  if(Date.now()-msg.ts>10000)return;
  showChatBubble(msg.id,msg.name,msg.text,msg.emoji);
  Sound.chat();
}

function showChatBubble(id,name,text,emoji){
  if(!Lobby||!Lobby.others)return;
  const p=Lobby.others.get(id);
  if(!p)return;
  p.chatBubble={text,name,emoji,ts:Date.now()};
}

function toggleChat(){
  const bar=$('chat-bar');
  if(!bar)return;
  const isHidden=bar.style.display==='none'||!bar.style.display;
  bar.style.display=isHidden?'flex':'none';
  if(isHidden){$('chat-input').focus();Sound.click();}
}

function sendChat(){
  const input=$('chat-input');
  if(!input)return;
  const text=input.value.trim();
  if(!text)return;
  if(!G.mqtt||!G.mqttConnected){toast('信号未连接');return;}
  const msg={id:G.myId,name:G.user,text,emoji:CHARACTERS[selectedChar]?.emoji||'🐦',ts:Date.now()};
  G.mqtt.publish(TOPIC_CHAT,JSON.stringify(msg),{qos:0});
  input.value='';
  showChatBubble(G.myId,G.user,text,msg.emoji);
  Sound.click();
}

let _onlineListTimer=null;
function renderOnlineList(){
  if(_onlineListTimer)return;
  _onlineListTimer=setTimeout(()=>{_onlineListTimer=null;_renderOnlineList()},200);
}
function _renderOnlineList(){
  const el=$('online-list');if(!el)return;
  const now=Date.now();
  // 清理过期
  for(const id in G.onlineUsers){if(now-G.onlineUsers[id].ts>45000)delete G.onlineUsers[id]}
  const users=Object.values(G.onlineUsers).sort((a,b)=>b.ts-a.ts);
  if(users.length===0){
    el.innerHTML='<div class="online-empty">暂无其他幸存者信号</div>';
    renderFavorites();return;
  }
  el.innerHTML=users.map(u=>{
    const ago=Math.floor((now-u.ts)/1000);
    let timeStr;
    if(ago<5)timeStr='<span class="online-now">在线</span>';
    else if(ago<60)timeStr=`${ago}秒前`;
    else if(ago<3600)timeStr=`${Math.floor(ago/60)}分钟前`;
    else timeStr=`${Math.floor(ago/3600)}小时前`;
    const roomStr=u.room?`<span class="online-room">在${escHTML(u.room)}号桌</span>`:'<span class="online-room idle">在大厅闲逛</span>';
    const emoji=u.emoji||'🐦';
    return`<div class="online-item" onclick="addFavorite('${u.id}','${escHTML(u.name)}','${emoji}')" style="cursor:pointer" title="点击收藏"><div class="online-avatar">${emoji}</div><div class="online-info"><div class="online-name">${escHTML(u.name)}</div><div class="online-detail">${roomStr} · ${timeStr}</div></div></div>`;
  }).join('');
  renderFavorites();
}

// ==================== 登录 ====================
let _nameDebounceTimer=null;
function validateNameInput(){
  const an=$('auth-name');if(!an)return false;
  const n=an.value.trim();
  const hint=$('auth-hint');
  if(!n){if(hint){hint.textContent='代号不能为空';hint.style.color='var(--accent)'}return false}
  if(n.length>12){if(hint){hint.textContent='代号最多12个字符';hint.style.color='var(--accent)'}return false}
  if(hint){hint.textContent='';}
  return true;
}
function renderCharSelector(){
  const container=$('char-selector');
  if(!container)return;
  let html='';
  for(let i=0;i<CHARACTERS.length;i++){
    const c=CHARACTERS[i];
    const sel=i===selectedChar?'selected':'';
    html+=`<div class="char-opt ${sel}" onclick="selectChar(${i})" data-index="${i}"><div class="char-emoji">${c.emoji}</div><div class="char-name">${c.name}</div><div class="char-desc">${c.desc}</div></div>`;
  }
  container.innerHTML=html;
}
function selectChar(idx){
  selectedChar=idx;
  renderCharSelector();
  const c=CHARACTERS[idx];
  if(Lobby.me)Lobby.me.emoji=c.emoji;
  if(G.mqttConnected)publishPresence();
}
const _authName=$('auth-name');if(_authName){
  _authName.oninput=()=>{
    if(_nameDebounceTimer)clearTimeout(_nameDebounceTimer);
    _nameDebounceTimer=setTimeout(validateNameInput,150);
  };
  _authName.onkeydown=(e)=>{if(e.key==='Enter'){const ab=$('auth-btn');if(ab)ab.click()}};
}
const _authBtn=$('auth-btn');if(_authBtn){
  _authBtn.onclick=()=>{
    if(!validateNameInput())return;
    const n=$('auth-name').value.trim();
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
}

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
}else{
  hideLoading();
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
      G.mqtt.subscribe(TOPIC_CHAT,{qos:0});
      subscribeLobbyPos();
      // 重连后重新订阅房间
      if(G.roomCode){
        G.mqtt.subscribe(roomTopic(G.roomCode),{qos:0});
        if(G.isHost)publishRoomInfo();
      }
      // 上线广播
      publishPresence();
      startPresence();
      // 启动BGM
      Sound.startBGM();
      // 检查救济金
      checkRelief();
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
        }else if(topic.startsWith('wl_pos_v6/')){
          const fromId=topic.split('/')[1];
          if(fromId!==G.myId)try{Lobby.handlePos(msg,fromId)}catch(e){}
        }else if(topic===TOPIC_CHAT){
          handleChatMsg(msg);
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
  let out;
  try{out=JSON.parse(JSON.stringify(msg))}catch(e){out={...msg}}
  out._from=G.myId;out._fromName=G.user;out._seq=++G.msgSeq;
  try{G.mqtt.publish(roomTopic(G.roomCode),JSON.stringify(out),{qos:0})}catch(e){console.warn('[publishRoom] failed',e)}
}

// ==================== 在线心跳 ====================
function startPresence(){
  stopPresence();
  G.presenceTimer=setInterval(()=>{
    if(document.hidden)return;
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
      resetGameState();
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
    playerOrder:G.playerOrder,turnIndex:G.turnIndex,gameOver:G.gameOver,roundCount:G.roundCount,
    diceState:{dice:[...G.diceState.dice],sum:G.diceState.sum,phase:G.diceState.phase}
  };
}

function deserializeGameState(state){
  if(!state||!state.players||!state.players.length){G.inGame=false;return}
  G.gameType=state.gameType;
  G.deck=(state.deck||[]).map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));
  G.pot=state.pot||0;G.currentBet=state.currentBet||0;
  G.players=state.players.map(p=>({...p,cards:(p.cards||[]).map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),isMe:p.id===G.myId}));
  G.playerOrder=state.playerOrder||[];G.turnIndex=state.turnIndex||0;G.gameOver=!!state.gameOver;
  G.roundCount=state.roundCount||0;
  G.diceState=state.diceState?{dice:[...state.diceState.dice],sum:state.diceState.sum,phase:state.diceState.phase}:{dice:[null,null,null],sum:0,phase:'bet'};
  _lastRenderHash='';
  G.inGame=!G.gameOver;
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
  if(G.pot<=0){
    G.gameOver=true;stopCandle();
    publishRoom({type:'result',text:'蜡烛烧尽！底池为空，无人获胜',winnerId:null,
      players:G.players.map(p=>({id:p.id,chips:p.chips}))});
    showModal('蜡烛烧尽','底池为空，无人获胜',false);
    renderTable();
    return;
  }
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
    const emoji=p.emoji||CHARACTERS[selectedChar]?.emoji||'🐦';
    return`<div class="wait-player"><div class="dot"></div><div class="name">${emoji} ${escHTML(p.name)}${isHostPlayer?' (搭桌人)':''}</div><div class="tag">${isMe?'已连接':'已到达'}</div></div>`;
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
  const wp=$('wait-panel');if(wp)wp.style.display='none';
  showScreen('main');
  publishPresence();
  renderLobby();
  toast('已离开牌桌');
}

function closeRoom(){
  const wp=$('wait-panel');if(wp)wp.style.display='none';
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
  if(Lobby.animId){Lobby.stop();}
  if(G.mqtt){try{G.mqtt.end(true)}catch(e){}G.mqtt=null}
  G.mqttConnected=false;
}

// ==================== 开始游戏 ====================
function hostStartGame(){
  resetGameState();
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
  const wp=$('wait-panel');if(wp)wp.style.display='none';
  showScreen('game');
  const gt=$('game-title');if(gt)gt.textContent=G.gameType==='zjh'?'物资炸金花':(G.gameType==='bj'?'物资二十一点':'骰子猜大小');
  clearLog();log('=== 牌局开始，物资已入底池 ===','system');Sound.deal();
  startCandle();renderTable();
  publishPresence();
  completeGameQuest();

  if(G.gameType==='bj')checkBJEnd();
}

// ==================== 轮次 ====================
function checkMyTurn(){
  if(G.gameOver||!G.players||!G.players.length){G.myTurn=false;return}
  const me=G.players.find(p=>p.isMe);
  if(!me){G.myTurn=false;return}
  if(!G.playerOrder||!G.playerOrder.length){G.myTurn=false;return}
  if(G.gameType==='zjh'){
    if(me.folded){G.myTurn=false;return}
    const currentId=G.playerOrder[G.turnIndex%G.playerOrder.length];
    G.myTurn=(me.id===currentId);
  }else if(G.gameType==='bj'){
    // BJ: sequential turns like ZJH
    if(me.busted||me.stood){G.myTurn=false;return}
    const currentId=G.playerOrder[G.turnIndex%G.playerOrder.length];
    G.myTurn=(me.id===currentId);
  }else if(G.gameType==='dice'){
    if(me.folded){G.myTurn=false;return}
    G.myTurn=true;
  }
}

// ==================== 渲染 ====================
let _lastRenderHash='';
function shouldRender(){
  const h=JSON.stringify({gt:G.gameType,p:G.players.map(p=>({id:p.id,c:p.cards.length,f:p.folded,s:p.seen,b:p.busted,st:p.stood,ch:p.choice})),pot:G.pot,mt:G.myTurn,go:G.gameOver,ds:G.diceState});
  if(h===_lastRenderHash)return false;
  _lastRenderHash=h;return true;
}
function renderTable(){if(!G.players||!G.players.length||!shouldRender())return;if(G.gameType==='zjh')renderZJH();else if(G.gameType==='bj')renderBJ();else if(G.gameType==='dice')renderDice();updateChips()}

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
const _zjhCache=new Map();
function evalZJH(cards){
  if(!cards||cards.length!==3)return{type:0,name:'无效',val:0};
  const key=cards.map(c=>c.s+c.r).sort().join('');
  if(_zjhCache.has(key))return _zjhCache.get(key);
  const sorted=[...cards].sort((a,b)=>b.v-a.v);
  const[c1,c2,c3]=sorted;
  const flush=c1.s===c2.s&&c2.s===c3.s;
  const isA23=(c1.v===14&&c2.v===3&&c3.v===2);
  const straight=(c1.v===c2.v+1&&c2.v===c3.v+1)||isA23;
  const three=c1.v===c2.v&&c2.v===c3.v;
  const pair=c1.v===c2.v||c2.v===c3.v||c1.v===c3.v;
  let result;
  if(three)result={type:6,name:'豹子',val:c1.v*1e6};
  else if(flush&&straight)result={type:5,name:'同花顺',val:isA23?3e5:c1.v*1e5+c2.v*1e3+c3.v};
  else if(flush)result={type:4,name:'同花',val:c1.v*1e4+c2.v*100+c3.v};
  else if(straight)result={type:3,name:'顺子',val:isA23?3e4:c1.v*1e4+c2.v*100+c3.v};
  else if(pair){const pv=c1.v===c2.v?c1.v:c3.v;const k=c1.v===c2.v?c3.v:c1.v;result={type:2,name:'对子',val:pv*1e4+k}}
  else result={type:1,name:'散牌',val:c1.v*1e4+c2.v*100+c3.v};
  if(_zjhCache.size>200)_zjhCache.clear();
  _zjhCache.set(key,result);
  return result;
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
  const allChose=G.players.every(p=>p.choice!==null&&p.choice!==undefined);
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
  const winnerId=winners.length>0?winners[0].id:null;
  publishRoom({type:'result',text:resultText,winnerId:winnerId,players:G.players.map(p=>({id:p.id,chips:p.chips})),diceResult:{dice:result.dice,sum:result.sum,isBig,isTrips}});
  const myWin=winners.some(p=>p.isMe);
  if(myWin)Sound.win();else Sound.lose();
  renderTable();
}

// ==================== 操作 ====================
function doAction(action){
  const me=G.players.find(p=>p.isMe);if(!me||!G.myTurn||G.gameOver)return;
  let shouldBroadcast=true;
  if(G.gameType==='zjh')shouldBroadcast=doZJHAction(me,action);
  else if(G.gameType==='bj'){doBJAction(me,action);shouldBroadcast=true;}
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
      checkHighRoller();
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
      checkHighRoller();
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
      if(!G.deck||!G.deck.length){log('牌堆已空','system');break;}
      me.cards.push(G.deck.pop());Sound.deal();
      log(`${me.name} 要牌，点数 ${bjValue(me.cards)}`);
      if(bjValue(me.cards)>21){
        me.busted=true;me.stood=true;G.myTurn=false;
        log(`${me.name} 爆牌！`);
        advanceTurn();
      }
      break;
    case 'stand':
      me.stood=true;G.myTurn=false;
      log(`${me.name} 停牌，点数 ${bjValue(me.cards)}`);
      advanceTurn();
      break;
  }
}

function checkBJEnd(){
  if(G.gameOver)return;
  if(G.isHost){
    let safety=0;
    const orderLen=G.playerOrder.length;
    while(safety < orderLen){
      const currentId=G.playerOrder[G.turnIndex%orderLen];
      const p=G.players.find(pl=>pl.id===currentId);
      if(!p){G.turnIndex++;safety++;continue}
      if(p.busted||p.stood){
        G.turnIndex++;
        safety++;
      }else break;
    }
    if(safety>0&&safety<orderLen){
      publishRoom({type:'turn',turnIndex:G.turnIndex,playerOrder:G.playerOrder});
    }
  }
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
  if(d._from&&d._from===G.myId&&d._seq&&d._seq<G.msgSeq){console.warn('[Stale] ignoring old msg',d._seq);return}
  if(d._seq&&d._from===G.myId)G.msgSeq=Math.max(G.msgSeq,d._seq);
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
      cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,stood:p.stood,choice:p.choice})),
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
  const wp=$('wait-panel');if(wp)wp.style.display='none';
  showScreen('main');
  publishPresence();
  renderLobby();
  toast('已撤离牌桌');
}

// ==================== 初始化 ====================
function initApp(){
  renderLobby();
  renderOnlineList();
  renderCharSelector();
  if(!G._roomCleanupTimer){
    G._roomCleanupTimer=setInterval(()=>{
      const now=Date.now();let changed=false;
      for(const code in G.knownRooms){if(now-G.knownRooms[code].ts>30000){delete G.knownRooms[code];changed=true}}
      if(changed)renderLobby();
    },10000);
  }
  // 音效初始化
  const st=document.getElementById('sound-toggle');
  if(st)st.onclick=toggleSound;
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initApp);
}else{
  initApp();
}
// 延迟启动大厅（如果已经在main-screen但Lobby还没初始化）
setTimeout(()=>{
  try{
    const m=$('main-screen');
    if(m&&m.style.display!=='none'&&Lobby&&!Lobby.animId){
      Lobby.show();
    }
  }catch(e){}
},100);

// ==================== 2D 大厅系统 ====================
const Lobby={
  canvas:null,ctx:null,w:0,h:0,
  me:{x:400,y:300,tx:400,ty:300,moving:false,emoji:'🐦',name:''},
  others:new Map(), // id -> {x,y,emoji,name,lastSeen}
  tables:[
    {x:400,y:350,code:'',game:'zjh',label:'🥫 炸金花',players:0,max:3,host:''},
    {x:1000,y:300,code:'',game:'bj',label:'⛽ 二十一点',players:0,max:3,host:''},
    {x:700,y:900,code:'',game:'dice',label:'🎲 骰子',players:0,max:3,host:''},
    {x:1400,y:600,code:'',game:'zjh',label:'🥫 炸金花 II',players:0,max:3,host:''},
    {x:300,y:1100,code:'',game:'bj',label:'⛽ 二十一点 II',players:0,max:3,host:''},
    {x:1200,y:1200,code:'',game:'dice',label:'🎲 骰子 II',players:0,max:3,host:''}
  ],
  keys:{},
  joystick:{active:false,cx:0,cy:0,dx:0,dy:0,touchId:null},
  particles:[],
  time:0,
  lastDir:{x:0,y:1},
  floorCache:null,
  fountainParticles:[],
  lootCrates:[],
  fountainTime:0,
  scraps:[],
  scrapCount:0,
  floorCacheW:0,
  floorCacheH:0,
  dirty:true,
  welcomeTime:0,
  walkParticles:[],
  animId:null,
  lastBroadcast:0,
  camera:{x:0,y:0},
  mapW:2000,mapH:1500,
  dayNightAlpha:0,
  dustStorm:0,
  
  init(){
    if(this.animId)return true; // 已经初始化
    this.canvas=$('lobby-canvas');
    if(!this.canvas)return false;
    this.ctx=this.canvas.getContext('2d');
    this.resize();
    this.me.name=G.user||'幸存者';
    this.me.emoji=CHARACTERS[selectedChar]?.emoji||'🐦';
    if(_savedPos){this.me.x=_savedPos.x;this.me.y=_savedPos.y;_savedPos=null}
    this.time=0;
    this.welcomeTime=3;
    this.fountainTime=0;
    updateQuestPanel();
    // 新手引导
    if(!localStorage.getItem('wl_tutorial')){
      setTimeout(()=>this.showTutorial(),2000);
    }
    // 初始化喷泉粒子
    this.fountainParticles=[];
    for(let i=0;i<30;i++){
      this.fountainParticles.push({x:this.mapW/2,y:this.mapH/2,vx:(Math.random()-.5)*1.5,vy:-Math.random()*2-1,life:Math.random()*2,maxLife:2+Math.random()});
    }
    // 初始化随机宝箱
    this.lootCrates=[];
    const cratePositions=[[250,250],[1700,1200],[300,1200],[1600,300],[900,600]];
    for(const[posX,posY]of cratePositions){
      this.lootCrates.push({x:posX,y:posY,opened:false,sparkleTime:Math.random()*Math.PI*2});
    }
    // 初始化废金属收集品
    this.scraps=[];
    for(let i=0;i<15;i++){
      this.scraps.push({x:50+Math.random()*(this.mapW-100),y:50+Math.random()*(this.mapH-100),collected:false,rot:Math.random()*Math.PI*2});
    }
    this.scrapCount=0;
    this.bindInput();
    bindLobbyCanvasClick();
    this.startLoop();
    return true;
  },
  
  resize(){
    if(!this.canvas||!this.canvas.parentElement)return;
    const rect=this.canvas.parentElement.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    this.canvas.width=rect.width*dpr;this.canvas.height=rect.height*dpr;
    this.canvas.style.width=rect.width+'px';this.canvas.style.height=rect.height+'px';
    this.ctx=this.canvas.getContext('2d');
    this.ctx.scale(dpr,dpr);
    this.w=rect.width;this.h=rect.height;
    this.floorCache=null;this.dirty=true;
    this.particles=[];
    // 确保玩家在地图边界内
    this.me.x=Math.max(30,Math.min(this.mapW-30,this.me.x));
    this.me.y=Math.max(30,Math.min(this.mapH-30,this.me.y));
  },
  
  bindInput(){
    const c=this.canvas;
    // 窗口大小变化
    this._onResize=()=>this.resize();
    window.addEventListener('resize',this._onResize);
    // 键盘
    this._onKeyDown=e=>{
      this.keys[e.key.toLowerCase()]=true;
      if(e.key==='Enter'){const bar=$('chat-bar');if(bar&&bar.style.display!=='none'){sendChat();e.preventDefault();}else{toggleChat();e.preventDefault();}}
      if(e.key==='Escape'){const bar=$('chat-bar');if(bar)bar.style.display='none';closeEmoteWheel();}
      if(e.key.toLowerCase()==='q'){showEmoteWheel();}
    };
    this._onKeyUp=e=>{this.keys[e.key.toLowerCase()]=false;};
    window.addEventListener('keydown',this._onKeyDown);
    window.addEventListener('keyup',this._onKeyUp);
    // Shift冲刺提示
    this._sprintHintTimer=setTimeout(()=>{if(this.keys['shift']===undefined)toast('按住 Shift 冲刺移动')},15000);
    // 触摸摇杆（跟随触摸位置）
    this._onTouchStart=e=>{
      e.preventDefault();
      if(this.joystick.active)return;
      this._ignoreNextClick=true;
      const rect=c.getBoundingClientRect();
      const t=e.changedTouches[0];
      this.joystick.active=true;
      this.joystick.touchId=t.identifier;
      this.joystick.cx=t.clientX-rect.left;
      this.joystick.cy=t.clientY-rect.top;
      this.joystick.dx=0;
      this.joystick.dy=0;
      this.joystick.opacity=1;
    };
    this._onTouchMove=e=>{
      e.preventDefault();
      for(const t of e.changedTouches){
        if(t.identifier===this.joystick.touchId){
          const rect=c.getBoundingClientRect();
          const tx=t.clientX-rect.left;
          const ty=t.clientY-rect.top;
          let ddx=tx-this.joystick.cx;
          let ddy=ty-this.joystick.cy;
          const dist=Math.sqrt(ddx*ddx+ddy*ddy);
          if(dist>40){ddx=(ddx/dist)*40;ddy=(ddy/dist)*40}
          this.joystick.dx=ddx/40;
          this.joystick.dy=ddy/40;
          this.joystick.opacity=1;
        }
      }
    };
    this._onTouchEnd=e=>{
      for(const t of e.changedTouches){
        if(t.identifier===this.joystick.touchId){
          this.joystick.active=false;
          this.joystick.dx=0;
          this.joystick.dy=0;
          this.joystick.touchId=null;
          this.joystick.opacity=0.4;
        }
      }
    };
    c.addEventListener('touchstart',this._onTouchStart,{passive:false});
    c.addEventListener('touchmove',this._onTouchMove,{passive:false});
    c.addEventListener('touchend',this._onTouchEnd);
    c.addEventListener('touchcancel',this._onTouchEnd);
  },
  
  update(dt){
    const baseSpeed=280; // px per second
    const sprintSpeed=450;
    let dx=0,dy=0;
    if(this.keys['w']||this.keys['arrowup'])dy=-1;
    if(this.keys['s']||this.keys['arrowdown'])dy=1;
    if(this.keys['a']||this.keys['arrowleft'])dx=-1;
    if(this.keys['d']||this.keys['arrowright'])dx=1;

    // 冲刺：按住Shift或双击方向键
    let isSprinting=false;
    if(this.keys['shift']){isSprinting=true;}
    // 摇杆冲刺：摇杆推到边缘
    if(this.joystick.active){
      const jLen=Math.sqrt(this.joystick.dx*this.joystick.dx+this.joystick.dy*this.joystick.dy);
      if(jLen>0.9)isSprinting=true;
    }
    const speed=isSprinting?sprintSpeed:baseSpeed;

    if(dx!==0||dy!==0){
      const len=Math.sqrt(dx*dx+dy*dy);
      dx/=len;dy/=len;
      this.lastDir.x=dx;this.lastDir.y=dy;
      this.me.x+=dx*speed*dt;this.me.y+=dy*speed*dt;
      this.me.moving=false;
    }else if(this.joystick.active&&(this.joystick.dx!==0||this.joystick.dy!==0)){
      this.lastDir.x=this.joystick.dx;this.lastDir.y=this.joystick.dy;
      this.me.x+=this.joystick.dx*speed*dt;
      this.me.y+=this.joystick.dy*speed*dt;
      this.me.moving=false;
    }else if(this.me.moving){
      const tx=this.me.tx,ty=this.me.ty;
      const ddx=tx-this.me.x,ddy=ty-this.me.y;
      const dist=Math.sqrt(ddx*ddx+ddy*ddy);
      if(dist<5){this.me.moving=false}
      else{const mx=(ddx/dist)*speed*dt,my=(ddy/dist)*speed*dt;this.me.x+=mx;this.me.y+=my}
    }

    // 边界限制
    this.me.x=Math.max(16,Math.min(this.mapW-16,this.me.x));
    this.me.y=Math.max(16,Math.min(this.mapH-16,this.me.y));
    // 边界警告
    const edgeDist=Math.min(this.me.x,this.me.y,this.mapW-this.me.x,this.mapH-this.me.y);
    if(edgeDist<50){
      const bw=$('boundary-warning');
      if(bw)bw.style.display='block';
    }else{
      const bw=$('boundary-warning');
      if(bw)bw.style.display='none';
    }
    
    // 检查桌子交互
    this.checkTableInteraction();
    
    // 广播位置 (每 100ms)
    const now=Date.now();
    if(now-this.lastBroadcast>100){
      this.lastBroadcast=now;
      this.broadcastPos();
    }
    
    // 清理过期其他玩家
    for(const[id,p]of this.others){
      if(now-p.lastSeen>10000)this.others.delete(id);
    }
    // 平滑插值其他玩家位置
    for(const[id,p]of this.others){
      if(p.tx!==undefined){
        p.x+=(p.tx-p.x)*0.15;
        p.y+=(p.ty-p.y)*0.15;
      }
      if(p.fadeIn<1)p.fadeIn=Math.min(1,p.fadeIn+0.05);
      if(p.scale<1)p.scale=Math.min(1,p.scale+0.04);
      if(p.reaction&&now-p.reactionTime>2000)p.reaction=null;
      // 更新入场粒子
      if(p.warpParticles){
        for(let i=p.warpParticles.length-1;i>=0;i--){
          const wp=p.warpParticles[i];
          wp.x+=wp.vx;wp.y+=wp.vy;wp.life-=dt*2;
          if(wp.life<=0)p.warpParticles.splice(i,1);
        }
      }
    }
    // 行走粒子
    const isMovingNow=dx!==0||dy!==0||this.joystick.active;
    if(isMovingNow&&Math.random()<.3){
      this.walkParticles.push({x:this.me.x+(Math.random()-.5)*6,y:this.me.y+10,vy:-Math.random()*.5-.2,life:1});
      if(Math.random()<.08)Sound.step();
    }
    for(let i=this.walkParticles.length-1;i>=0;i--){
      const wp=this.walkParticles[i];
      wp.y+=wp.vy*dt*60;wp.life-=dt*1.8;
      if(wp.life<=0)this.walkParticles.splice(i,1);
    }
    if(this.walkParticles.length>50)this.walkParticles.length=50;
    // 喷泉粒子更新
    this.fountainTime+=dt;
    for(const fp of this.fountainParticles){
      fp.x+=fp.vx;fp.y+=fp.vy;fp.vy+=0.04;
      fp.life+=dt;
      if(fp.life>fp.maxLife||fp.y>this.mapH/2+20){
        fp.x=this.mapW/2;fp.y=this.mapH/2;fp.vx=(Math.random()-.5)*1.5;fp.vy=-Math.random()*2-1;fp.life=0;
      }
    }
    // 宝箱闪光
    for(const crate of this.lootCrates){
      crate.sparkleTime+=dt*3;
    }
    // 废金属收集检测
    for(const scrap of this.scraps){
      if(scrap.collected)continue;
      const sdx=this.me.x-scrap.x,sdy=this.me.y-scrap.y;
      if(Math.sqrt(sdx*sdx+sdy*sdy)<20){
        scrap.collected=true;this.scrapCount++;
        Sound.chip();toast(`收集废金属 +1 (${this.scrapCount})`);
      }
    }
  },
  
  checkTableInteraction(){
    const hint=$('interact-hint');
    let nearTable=null;
    for(const t of this.tables){
      const dx=t.x-this.me.x,dy=t.y-this.me.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<60){nearTable=t;break}
    }
    if(nearTable){
      const isMobile=('ontouchstart' in window)||this.w<640;
      const status=nearTable.players>=nearTable.max?' (满员)':nearTable.code?` (${nearTable.players}/${nearTable.max})`:' (空桌)';
      const actionText=isMobile?'点击加入':'按 E 或点击加入';
      hint.textContent=`${nearTable.label}${status} — ${actionText}`;
      hint.style.display='block';
      hint.style.fontSize=isMobile?'16px':'13px';
      // 脉冲动画
      const pulse=0.7+Math.sin(this.time*4)*.3;
      hint.style.opacity=pulse;
      if(this.keys['e']){this.keys['e']=false;this.joinTable(nearTable)}
    }else{
      hint.style.display='none';
    }
  },
  
  joinTable(table){
    if(table.players>=table.max){toast('这桌满了');return}
    if(table.code){Sound.join();doJoinTable(table.code)}
    else{toast('空桌子，先搭一个吧');showCreateModal()}
  },
  
  broadcastPos(){
    if(!G.mqtt||!G.mqttConnected)return;
    const msg={type:'pos',x:Math.round(this.me.x),y:Math.round(this.me.y),name:G.user,emoji:this.me.emoji};
    G.mqtt.publish(`wl_pos_v6/${G.myId}`,JSON.stringify(msg),{qos:0});
  },
  
  handlePos(msg,fromId){
    if(fromId===G.myId)return;
    let mx=typeof msg.x==='number'&&!isNaN(msg.x)?msg.x:0;
    let my=typeof msg.y==='number'&&!isNaN(msg.y)?msg.y:0;
    mx=Math.max(0,Math.min(this.mapW,mx));
    my=Math.max(0,Math.min(this.mapH,my));
    const existing=this.others.get(fromId);
    if(existing){
      existing.tx=mx;existing.ty=my;
      existing.emoji=msg.emoji||'🐦';existing.name=msg.name||'幸存者';
      existing.lastSeen=Date.now();
    }else{
      this.others.set(fromId,{x:mx,y:my,tx:mx,ty:my,emoji:msg.emoji||'🐦',name:msg.name||'幸存者',lastSeen:Date.now(),fadeIn:0,scale:0,reaction:null,reactionTime:0,warpParticles:[]});
      // 入场粒子爆发
      for(let i=0;i<12;i++){
        const p=this.others.get(fromId);
        if(p)p.warpParticles.push({x:mx,y:my,vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*3,life:1});
      }
    }
  },
  
  updateTablesFromState(){
    // 从 G.knownRooms 同步桌子状态（不依赖隐藏的DOM）
    this.tables.forEach(t=>{t.code='';t.players=0;t.host=''});
    const usedIdx=new Set();
    for(const code in G.knownRooms){
      const r=G.knownRooms[code];
      if(Date.now()-r.ts>30000)continue;
      const idx=this.tables.findIndex((x,i)=>x.game===r.game&&x.code===''&&!usedIdx.has(i));
      if(idx!==-1){usedIdx.add(idx);const t=this.tables[idx];t.code=code;t.players=r.players||1;t.max=MAX_SEATS;t.host=r.name||''}
    }
    // 自己的桌子
    if(G.isHost&&G.roomCode){
      const idx=this.tables.findIndex((x,i)=>x.game===G.gameType&&!usedIdx.has(i));
      if(idx!==-1){usedIdx.add(idx);const t=this.tables[idx];t.code=G.roomCode;t.players=G.roomPeers.length;t.max=MAX_SEATS;t.host=G.user}
    }
  },
  
  draw(){
    const ctx=this.ctx;
    if(!ctx)return;
    // 保护性检查：确保Canvas尺寸正确
    const parentW=this.canvas.parentElement?.offsetWidth||800;
    const parentH=this.canvas.parentElement?.offsetHeight||600;
    if(this.canvas.width<100||this.canvas.height<100){
      this.resize();
    }
    const isMobile=this.w<640;
    // 更新相机跟随玩家
    this.camera.x=this.me.x-this.w/2;
    this.camera.y=this.me.y-this.h/2;
    this.camera.x=Math.max(0,Math.min(this.mapW-this.w,this.camera.x));
    this.camera.y=Math.max(0,Math.min(this.mapH-this.h,this.camera.y));

    // 保存上下文并应用相机偏移
    ctx.save();
    ctx.translate(-this.camera.x,-this.camera.y);

    // 初始化粒子
    const maxParticles=isMobile?10:20;
    if(this.particles.length===0){
      for(let i=0;i<maxParticles;i++){
        this.particles.push({x:Math.random()*this.mapW,y:Math.random()*this.mapH,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*2+.5,a:Math.random()*.3+.1});
      }
    }else if(this.particles.length>maxParticles){
      this.particles.length=maxParticles;
    }
    // 缓存地板（使用地图尺寸，与地图坐标系一致）
    if(!this.floorCache||this.floorCacheW!==this.mapW||this.floorCacheH!==this.mapH){
      this.floorCache=document.createElement('canvas');
      this.floorCache.width=Math.round(this.mapW);
      this.floorCache.height=Math.round(this.mapH);
      this.floorCacheW=this.mapW;this.floorCacheH=this.mapH;
      const fc=this.floorCache.getContext('2d');
      const tileSize=40;
      for(let tx=0;tx<this.mapW;tx+=tileSize){
        for(let ty=0;ty<this.mapH;ty+=tileSize){
          const dark=((tx/tileSize+ty/tileSize)%2===0);
          fc.fillStyle=dark?'#2a2418':'#302a1e';
          fc.fillRect(tx,ty,tileSize,tileSize);
          fc.strokeStyle='rgba(60,50,30,.2)';
          fc.lineWidth=1;
          fc.strokeRect(tx,ty,tileSize,tileSize);
        }
      }
      // 墙壁砖块
      const wallW=20;
      fc.fillStyle='#3a3020';
      fc.fillRect(0,0,this.mapW,wallW);fc.fillRect(0,this.mapH-wallW,this.mapW,wallW);
      fc.fillRect(0,0,wallW,this.mapH);fc.fillRect(this.mapW-wallW,0,wallW,this.mapH);
      fc.strokeStyle='rgba(80,70,50,.5)';fc.lineWidth=1;
      for(let bx=0;bx<this.mapW;bx+=20){
        const row=Math.floor(bx/20);
        const off=(row%2)*10;
        for(let by=0;by<wallW;by+=10){
          fc.strokeRect(bx+off,by,20,10);
          fc.strokeRect(bx+off,this.mapH-wallW+by,20,10);
        }
        for(let by=wallW;by<this.mapH-wallW;by+=20){
          fc.strokeRect(0,by,wallW,10);
          fc.strokeRect(this.mapW-wallW,by,wallW,10);
        }
      }
      // 可见边界线
      fc.strokeStyle='rgba(196,70,58,.6)';fc.lineWidth=2;
      fc.strokeRect(0,0,this.mapW,this.mapH);
      // 装饰也缓存
      this._drawDecorOn(fc,this.mapW,this.mapH);
      this.dirty=false;
    }
    // 绘制缓存地板（使用相机裁剪区域）
    ctx.drawImage(this.floorCache,this.camera.x,this.camera.y,this.w,this.h,0,0,this.w,this.h);
    // 画桌子（动态，不缓存）
    for(const t of this.tables){
      this.drawTable(t);
    }
    // JOIN 按钮覆盖层（靠近桌子时）- 修复：使用屏幕坐标而非世界坐标绘制UI元素
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0); // 重置变换为屏幕坐标系
    for(const t of this.tables){
      const dx=t.x-this.me.x,dy=t.y-this.me.y;
      if(Math.sqrt(dx*dx+dy*dy)<60){
        // 将世界坐标转换为屏幕坐标
        const screenX=t.x-this.camera.x;
        const screenY=t.y-this.camera.y;
        const bx=screenX-20,by=screenY+30;
        ctx.fillStyle='rgba(184,150,15,.85)';
        ctx.fillRect(bx,by,40,18);
        ctx.strokeStyle='#b8960f';ctx.lineWidth=1;ctx.strokeRect(bx,by,40,18);
        ctx.fillStyle='#1a1610';ctx.font='bold 10px sans-serif';ctx.textAlign='center';
        ctx.fillText('JOIN',screenX,by+13);
      }
    }
    ctx.restore();
    // 画其他玩家
    for(const[id,p]of this.others){
      const alpha=p.fadeIn!==undefined?p.fadeIn:1;
      const scale=p.scale!==undefined?p.scale:1;
      ctx.globalAlpha=alpha;
      // 入场粒子
      if(p.warpParticles&&p.warpParticles.length>0){
        for(const wp of p.warpParticles){
          ctx.beginPath();ctx.arc(wp.x,wp.y,2*wp.life,0,Math.PI*2);
          ctx.fillStyle=`rgba(184,150,15,${wp.life})`;ctx.fill();
        }
      }
      // 其他玩家行走动画
      const ox=p.tx!==undefined?p.x:0;
      const oy=p.tx!==undefined?p.y:0;
      const prevX=p._prevX||ox;
      const prevY=p._prevY||oy;
      const isMovingOther=Math.abs(ox-prevX)>0.5||Math.abs(oy-prevY)>0.5;
      const bobOther=isMovingOther?Math.sin(this.time*10)*2:0;
      ctx.save();
      ctx.translate(p.x,p.y+bobOther);
      ctx.scale(scale,scale);
      ctx.translate(-p.x,-(p.y+bobOther));
      this.drawPlayer(Math.round(p.x),Math.round(p.y+bobOther),p.emoji,p.name,false);
      ctx.restore();
      // 反应表情
      if(p.reaction){
        ctx.font='14px sans-serif';ctx.textAlign='center';
        ctx.fillText(p.reaction,Math.round(p.x),Math.round(p.y)-30);
      }
      // 聊天气泡
      if(p.chatBubble&&Date.now()-p.chatBubble.ts<3000){
        const bx=p.x,by=p.y-40;
        const btext=p.chatBubble.text;
        ctx.font='11px sans-serif';const tw=ctx.measureText(btext).width;
        ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(bx-tw/2-6,by-12,tw+12,20);
        ctx.strokeStyle='rgba(184,150,15,.4)';ctx.lineWidth=1;ctx.strokeRect(bx-tw/2-6,by-12,tw+12,20);
        ctx.fillStyle='#d4c8a8';ctx.textAlign='center';ctx.fillText(btext,bx,by+2);
      }else if(p.chatBubble&&Date.now()-p.chatBubble.ts>=3000){
        p.chatBubble=null;
      }
      p._prevX=ox;p._prevY=oy;
      ctx.globalAlpha=1;
    }
    // 画自己
    this.drawPlayer(Math.round(this.me.x),Math.round(this.me.y),this.me.emoji,this.me.name,true);
    // 行走粒子（灰尘）
    for(const wp of this.walkParticles){
      ctx.beginPath();ctx.arc(Math.round(wp.x),Math.round(wp.y),2*wp.life,0,Math.PI*2);
      ctx.fillStyle=`rgba(180,160,120,${wp.life*0.4})`;ctx.fill();
    }
    // 欢迎消息
    if(this.time<this.welcomeTime){
      const alpha=Math.min(1,(this.welcomeTime-this.time)/1);
      ctx.globalAlpha=alpha;
      ctx.fillStyle='#b8960f';ctx.font='bold 22px "Noto Sans SC",sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('欢迎来到废土交易所',this.w/2,this.h/2-20);
      ctx.font='13px "Noto Sans SC",sans-serif';ctx.fillStyle='#7a7060';
      ctx.fillText('WASD移动 | 走近桌子加入',this.w/2,this.h/2+10);
      ctx.globalAlpha=1;
    }
    // 粒子（灰尘）
    for(const p of this.particles){
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0)p.x=this.mapW;if(p.x>this.mapW)p.x=0;
      if(p.y<0)p.y=this.mapH;if(p.y>this.mapH)p.y=0;
      ctx.beginPath();ctx.arc(Math.round(p.x),Math.round(p.y),p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(200,180,140,${p.a})`;ctx.fill();
    }
    // 画喷泉/篝火
    this.drawFountain();
    // 画宝箱
    this.drawLootCrates();
    // 画废金属
    this.drawScraps();
    // 画桌子标签（在所有元素之上，带阴影）
    for(const t of this.tables){
      const isFull=t.code&&t.players>=t.max;
      const tx=t.x,ty=t.y+36/2+28;
      ctx.save();
      ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=4;ctx.shadowOffsetX=0;ctx.shadowOffsetY=1;
      ctx.fillStyle=isFull?'#c4463a':'#b8960f';ctx.font='11px "Noto Sans SC",sans-serif';
      ctx.textAlign='center';ctx.fillText(t.label,tx,ty);
      ctx.shadowBlur=0;
      ctx.fillStyle='#7a7060';ctx.font='10px sans-serif';
      ctx.fillText(t.code?`${t.players}/${t.max}`:'空桌',tx,ty+12);
      ctx.restore();
    }
    // 玩家周围光源（手电筒/火把效果）
    const pl=ctx.createRadialGradient(this.me.x,this.me.y,10,this.me.x,this.me.y,120);
    pl.addColorStop(0,'rgba(255,200,100,.08)');pl.addColorStop(1,'transparent');
    ctx.fillStyle=pl;ctx.fillRect(this.me.x-120,this.me.y-120,240,240);
    // 日夜循环（基于真实时间）
    const hour=new Date().getHours();
    const isNight=hour<6||hour>20;
    this.dayNightAlpha+=(isNight?0.35:0-this.dayNightAlpha)*0.01;
    if(this.dayNightAlpha>0.01){
      ctx.fillStyle=`rgba(10,10,30,${this.dayNightAlpha})`;
      ctx.fillRect(this.camera.x,this.camera.y,this.w,this.h);
    }
    // 沙尘暴效果
    this.dustStorm+=0.002;
    const dustIntensity=Math.max(0,Math.sin(this.dustStorm)*0.15);
    if(dustIntensity>0.01){
      ctx.fillStyle=`rgba(180,160,100,${dustIntensity})`;
      ctx.fillRect(this.camera.x,this.camera.y,this.w,this.h);
    }
    // 暗角效果（减弱）
    const vg=ctx.createRadialGradient(this.me.x,this.me.y,Math.min(this.w,this.h)*.3,this.me.x,this.me.y,Math.max(this.w,this.h)*.8);
    vg.addColorStop(0,'transparent');vg.addColorStop(1,'rgba(0,0,0,.2)');
    ctx.fillStyle=vg;ctx.fillRect(this.camera.x,this.camera.y,this.w,this.h);
    ctx.restore();
    // 小地图（在屏幕空间绘制）
    this.drawMinimap();
    // 画摇杆
    this.drawJoystick();
  },
  
  drawMinimap(){
    const ctx=this.ctx;
    const mw=150,mh=100;
    const mx=this.w-mw-12,my=12;
    const sx=mw/this.mapW,sy=mh/this.mapH;
    // 背景
    ctx.fillStyle='rgba(0,0,0,.6)';
    ctx.fillRect(mx,my,mw,mh);
    ctx.strokeStyle='rgba(184,150,15,.4)';ctx.lineWidth=1;
    ctx.strokeRect(mx,my,mw,mh);
    // 桌子
    for(const t of this.tables){
      const tx=mx+t.x*sx,ty=my+t.y*sy;
      ctx.fillStyle=t.code?'#5a8a3c':'#7a7060';
      ctx.fillRect(tx-3,ty-2,6,4);
    }
    // 其他玩家
    for(const[id,p]of this.others){
      ctx.fillStyle='#d4c8a8';
      ctx.fillRect(mx+p.x*sx-1.5,my+p.y*sy-1.5,3,3);
    }
    // 自己
    ctx.fillStyle='#c4463a';
    ctx.fillRect(mx+this.me.x*sx-2,my+this.me.y*sy-2,4,4);
    // 玩家名字标签
    ctx.fillStyle='#c4463a';ctx.font='bold 9px sans-serif';ctx.textAlign='left';
    ctx.fillText(this.me.name||'我',mx+4,my+mh-6);
    // 相机视口矩形
    ctx.strokeStyle='rgba(196,70,58,.5)';ctx.lineWidth=1;
    const vx=mx+this.camera.x*sx,vy=my+this.camera.y*sy,vw=this.w*sx,vh=this.h*sy;
    ctx.strokeRect(vx,vy,vw,vh);
  },

  drawFountain(){
    const ctx=this.ctx;
    const fx=this.mapW/2,fy=this.mapH/2;
    // 底座
    ctx.fillStyle='#5a4a30';ctx.beginPath();ctx.ellipse(fx,fy+8,20,6,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#7a6a4a';ctx.stroke();
    // 火焰/水粒子
    for(const fp of this.fountainParticles){
      const alpha=1-(fp.life/fp.maxLife);
      ctx.beginPath();ctx.arc(fp.x,fp.y,2+alpha*2,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,${180+Math.floor(alpha*75)},60,${alpha*0.8})`;ctx.fill();
    }
    // 中心发光
    const glow=ctx.createRadialGradient(fx,fy,2,fx,fy,25);
    glow.addColorStop(0,'rgba(255,200,60,.3)');glow.addColorStop(1,'transparent');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(fx,fy,25,0,Math.PI*2);ctx.fill();
  },

  drawLootCrates(){
    const ctx=this.ctx;
    for(const crate of this.lootCrates){
      const cx=crate.x,cy=crate.y;
      // 箱子
      ctx.fillStyle='#6a5a3a';ctx.fillRect(cx-10,cy-8,20,16);ctx.strokeStyle='#8a7a5a';ctx.lineWidth=1;ctx.strokeRect(cx-10,cy-8,20,16);
      ctx.fillStyle='#4a3a20';ctx.fillRect(cx-2,cy-8,4,16);
      // 闪光
      const sparkle=Math.sin(crate.sparkleTime);
      if(sparkle>0.5){
        ctx.fillStyle=`rgba(255,220,100,${(sparkle-0.5)*1.5})`;ctx.font='12px sans-serif';ctx.textAlign='center';
        ctx.fillText('✨',cx,cy-14);
      }
    }
  },

  drawScraps(){
    const ctx=this.ctx;
    for(const scrap of this.scraps){
      if(scrap.collected)continue;
      const sx=scrap.x,sy=scrap.y;
      ctx.save();ctx.translate(sx,sy);ctx.rotate(scrap.rot);
      ctx.fillStyle='#8a7a5a';ctx.fillRect(-4,-3,8,6);
      ctx.fillStyle='#6a5a3a';ctx.fillRect(-2,-5,4,2);ctx.fillRect(-2,3,4,2);
      ctx.restore();
      // 微光
      const glow=Math.sin(this.time*3+scrap.rot)*0.3+0.3;
      ctx.fillStyle=`rgba(184,150,15,${glow})`;ctx.font='8px sans-serif';ctx.textAlign='center';
      ctx.fillText('⚙',sx,sy-8);
    }
  },

  drawJoystick(){
    if(!this.joystick.active&&this.joystick.opacity<=0)return;
    const ctx=this.ctx;
    const cx=this.joystick.cx,cy=this.joystick.cy;
    const op=this.joystick.opacity||0.6;
    // 外圈（渐变）
    ctx.beginPath();ctx.arc(cx,cy,40,0,Math.PI*2);
    const og=ctx.createRadialGradient(cx,cy,10,cx,cy,40);
    og.addColorStop(0,`rgba(255,255,255,${0.15*op})`);og.addColorStop(1,`rgba(255,255,255,${0.05*op})`);
    ctx.fillStyle=og;ctx.fill();
    ctx.strokeStyle=`rgba(255,255,255,${0.2*op})`;ctx.lineWidth=2;ctx.stroke();
    // 内圈（渐变金色）
    const ix=cx+this.joystick.dx*40;
    const iy=cy+this.joystick.dy*40;
    ctx.beginPath();ctx.arc(ix,iy,16,0,Math.PI*2);
    const ig=ctx.createRadialGradient(ix-3,iy-3,2,ix,iy,16);
    ig.addColorStop(0,`rgba(212,168,32,${op})`);ig.addColorStop(1,`rgba(138,106,8,${op})`);
    ctx.fillStyle=ig;ctx.fill();
    ctx.strokeStyle=`rgba(255,255,255,${0.25*op})`;ctx.lineWidth=1;ctx.stroke();
    // 淡出
    if(!this.joystick.active&&op>0){
      this.joystick.opacity=Math.max(0,op-0.02);
    }
  },

  drawTable(t){
    const ctx=this.ctx;
    const x=t.x,y=t.y;
    const isFull=t.code&&t.players>=t.max;
    // 桌子光晕
    const glow=ctx.createRadialGradient(x,y,10,x,y,60);
    glow.addColorStop(0,isFull?'rgba(196,70,58,.15)':'rgba(184,150,15,.12)');glow.addColorStop(1,'transparent');
    ctx.fillStyle=glow;ctx.fillRect(x-60,y-60,120,120);
    // 桌子（矩形）
    const tw=56,th=36;
    ctx.fillStyle=isFull?'rgba(196,70,58,.25)':(t.code?'rgba(90,138,60,.25)':'rgba(60,50,40,.5)');
    ctx.fillRect(x-tw/2,y-th/2,tw,th);
    ctx.strokeStyle=isFull?'#c4463a':(t.code?'#5a8a3c':'#7a7060');
    ctx.lineWidth=2;ctx.strokeRect(x-tw/2,y-th/2,tw,th);
    // 木纹
    ctx.strokeStyle='rgba(120,100,60,.15)';ctx.lineWidth=1;
    for(let i=0;i<3;i++){
      ctx.beginPath();ctx.moveTo(x-tw/2+8,y-th/2+8+i*10);ctx.lineTo(x+tw/2-8,y-th/2+8+i*10);ctx.stroke();
    }
    // 椅子
    const chairColor='rgba(80,65,45,.6)';
    ctx.fillStyle=chairColor;
    ctx.fillRect(x-tw/2-10,y-6,10,12); // 左
    ctx.fillRect(x+tw/2,y-6,10,12);   // 右
    ctx.fillRect(x-6,y-th/2-10,12,10); // 上
    ctx.fillRect(x-6,y+th/2,12,10);   // 下
    // 蜡烛
    ctx.fillStyle='#ffcc44';
    ctx.beginPath();ctx.arc(x+20,y-20,4,0,Math.PI*2);ctx.fill();
    ctx.shadowColor='rgba(255,180,60,.5)';ctx.shadowBlur=15;
    ctx.fill();ctx.shadowBlur=0;
    // 满员红色X覆盖
    if(isFull){
      ctx.strokeStyle='rgba(196,70,58,.6)';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(x-tw/2+6,y-th/2+6);ctx.lineTo(x+tw/2-6,y+th/2-6);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+tw/2-6,y-th/2+6);ctx.lineTo(x-tw/2+6,y+th/2-6);ctx.stroke();
      ctx.fillStyle='#c4463a';ctx.font='bold 10px sans-serif';ctx.textAlign='center';
      ctx.fillText('FULL',x,y+4);
    }
    // 标签
    ctx.fillStyle=isFull?'#c4463a':'#b8960f';ctx.font='11px "Noto Sans SC",sans-serif';
    ctx.textAlign='center';ctx.fillText(t.label,x,y+th/2+16);
    ctx.fillStyle='#7a7060';ctx.font='10px sans-serif';
    ctx.fillText(t.code?`${t.players}/${t.max}`:'空桌',x,y+th/2+28);
  },

  _drawDecorOn(ctx,w,h){
    // 左上角桶
    ctx.fillStyle='#4a3a20';
    ctx.fillRect(35,35,18,24);ctx.strokeStyle='#6a5a3a';ctx.lineWidth=1;ctx.strokeRect(35,35,18,24);
    ctx.strokeStyle='#8a7a5a';ctx.beginPath();ctx.moveTo(35,42);ctx.lineTo(53,42);ctx.stroke();
    ctx.beginPath();ctx.moveTo(35,50);ctx.lineTo(53,50);ctx.stroke();
    // 右上角箱子
    ctx.fillStyle='#5a4a30';
    ctx.fillRect(w-55,35,22,18);ctx.strokeStyle='#7a6a4a';ctx.lineWidth=1;ctx.strokeRect(w-55,35,22,18);
    ctx.beginPath();ctx.moveTo(w-55,44);ctx.lineTo(w-33,44);ctx.stroke();
    // 左下角箱子
    ctx.fillStyle='#4a3a25';
    ctx.fillRect(35,h-55,20,20);ctx.strokeStyle='#6a5a3a';ctx.lineWidth=1;ctx.strokeRect(35,h-55,20,20);
    // 右下角桶
    ctx.fillStyle='#3a2a18';
    ctx.fillRect(w-50,h-58,16,26);ctx.strokeStyle='#5a4a3a';ctx.lineWidth=1;ctx.strokeRect(w-50,h-58,16,26);
    // 地图中间区域装饰
    ctx.fillStyle='#4a3a20';
    ctx.fillRect(300,300,20,28);ctx.strokeStyle='#6a5a3a';ctx.strokeRect(300,300,20,28);
    ctx.fillStyle='#5a4a30';
    ctx.fillRect(w-300,h-300,24,20);ctx.strokeStyle='#7a6a4a';ctx.strokeRect(w-300,h-300,24,20);
    ctx.fillStyle='#3a2a18';
    ctx.fillRect(w-300,300,18,22);ctx.strokeStyle='#5a4a3a';ctx.strokeRect(w-300,300,18,22);
    ctx.fillStyle='#4a3a25';
    ctx.fillRect(300,h-300,22,22);ctx.strokeStyle='#6a5a3a';ctx.strokeRect(300,h-300,22,22);
    // 中心区域桶
    ctx.fillStyle='#4a3a20';
    ctx.fillRect(w/2-40,h/2-30,18,24);ctx.strokeStyle='#6a5a3a';ctx.strokeRect(w/2-40,h/2-30,18,24);
    ctx.fillStyle='#5a4a30';
    ctx.fillRect(w/2+30,h/2+20,20,18);ctx.strokeStyle='#7a6a4a';ctx.strokeRect(w/2+30,h/2+20,20,18);
    // 废墟1 - 左上角废弃车辆
    ctx.fillStyle='#2a2a2a';ctx.fillRect(120,80,70,35);ctx.strokeStyle='#444';ctx.lineWidth=1;ctx.strokeRect(120,80,70,35);
    ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(140,115,8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(170,115,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#333';ctx.fillRect(125,85,60,20);ctx.fillStyle='#c4463a';ctx.font='10px sans-serif';ctx.fillText('🚗',155,100);
    // 废墟2 - 右上角倒塌建筑
    ctx.fillStyle='#3a3020';ctx.beginPath();ctx.moveTo(w-150,60);ctx.lineTo(w-80,60);ctx.lineTo(w-90,130);ctx.lineTo(w-160,120);ctx.closePath();ctx.fill();ctx.strokeStyle='#5a4a30';ctx.stroke();
    ctx.fillStyle='#2a2010';ctx.fillRect(w-140,70,15,20);ctx.fillRect(w-110,75,15,18);
    // 废墟3 - 左下角废弃油桶堆
    ctx.fillStyle='#3a2a18';ctx.fillRect(90,h-140,22,28);ctx.strokeStyle='#5a4a3a';ctx.strokeRect(90,h-140,22,28);
    ctx.fillStyle='#4a3a20';ctx.fillRect(118,h-135,20,24);ctx.strokeStyle='#6a5a3a';ctx.strokeRect(118,h-135,20,24);
    ctx.fillStyle='#2a1a0a';ctx.fillRect(108,h-150,18,22);ctx.strokeStyle='#4a3a2a';ctx.strokeRect(108,h-150,18,22);
    // 废墟4 - 右下角废弃帐篷
    ctx.fillStyle='#4a3a25';ctx.beginPath();ctx.moveTo(w-120,h-140);ctx.lineTo(w-60,h-140);ctx.lineTo(w-90,h-190);ctx.closePath();ctx.fill();ctx.strokeStyle='#6a5a3a';ctx.stroke();
    ctx.fillStyle='#2a2010';ctx.fillRect(w-100,h-140,4,25);ctx.fillRect(w-80,h-140,4,25);
  },
  
  drawPlayer(x,y,emoji,name,isMe){
    const ctx=this.ctx;
    const moving=isMe&&(this.keys['w']||this.keys['s']||this.keys['a']||this.keys['d']||this.keys['arrowup']||this.keys['arrowdown']||this.keys['arrowleft']||this.keys['arrowright']||this.joystick.active||this.me.moving);
    // 行走弹跳
    const bob=moving?Math.sin(this.time*10)*3:0;
    const py=y+bob;
    // 阴影（椭圆，随弹跳缩放）
    const shadowScale=moving?1-Math.abs(Math.sin(this.time*10))*.2:1;
    ctx.fillStyle='rgba(0,0,0,.25)';
    ctx.beginPath();ctx.ellipse(x,y+14,10*shadowScale,4*shadowScale,0,0,Math.PI*2);ctx.fill();
    // 玩家
    ctx.font='20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(emoji,x,py);
    // 方向指示三角
    if(isMe){
      const angle=Math.atan2(this.lastDir.y,this.lastDir.x);
      const tx=x+Math.cos(angle)*18;
      const ty=py+Math.sin(angle)*18;
      ctx.save();ctx.translate(tx,ty);ctx.rotate(angle);
      ctx.fillStyle='rgba(196,70,58,.7)';
      ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-3,-4);ctx.lineTo(-3,4);ctx.closePath();ctx.fill();
      ctx.restore();
    }
    // 名字截断
    ctx.font=isMe?'bold 10px sans-serif':'10px sans-serif';
    let displayName=name;
    const maxNameW=80;
    let nameW=ctx.measureText(displayName).width;
    while(nameW>maxNameW&&displayName.length>1){displayName=displayName.slice(0,-1)+'...';nameW=ctx.measureText(displayName).width;}
    ctx.fillStyle='rgba(0,0,0,.55)';
    ctx.fillRect(x-nameW/2-3,y-28,nameW+6,14);
    // 名字
    ctx.fillStyle=isMe?'#c4463a':'#7a7060';
    ctx.textAlign='center';ctx.fillText(displayName,x,y-18);
    // 自己标识
    if(isMe){
      ctx.strokeStyle='#c4463a';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(x,py,14,0,Math.PI*2);ctx.stroke();
    }
    // 靠近桌子时显示聊天气泡图标
    if(isMe){
      for(const t of this.tables){
        const ddx=t.x-x,ddy=t.y-y;
        if(Math.sqrt(ddx*ddx+ddy*ddy)<60){
          ctx.font='12px sans-serif';
          ctx.fillText('💬',x,py-26);
          break;
        }
      }
    }
  },
  
  startLoop(){
    let last=performance.now();
    let skipped=0;
    const loop=(now)=>{
      if(document.hidden){this.animId=requestAnimationFrame(loop);return}
      let dt=(now-last)/1000;last=now;
      if(dt>0.1){dt=0.016;skipped++;if(skipped>5)skipped=0;} // 跳帧保护
      this.time+=dt;
      this.update(dt);this.draw();
      this.animId=requestAnimationFrame(loop);
    };
    this.animId=requestAnimationFrame(loop);
  },
  
  stop(){if(this.animId){cancelAnimationFrame(this.animId);this.animId=null}
    if(this._onResize){window.removeEventListener('resize',this._onResize);this._onResize=null}
    if(this._onKeyDown){window.removeEventListener('keydown',this._onKeyDown);this._onKeyDown=null}
    if(this._onKeyUp){window.removeEventListener('keyup',this._onKeyUp);this._onKeyUp=null}
    if(this._onTouchStart&&this.canvas){this.canvas.removeEventListener('touchstart',this._onTouchStart);this.canvas.removeEventListener('touchmove',this._onTouchMove);this.canvas.removeEventListener('touchend',this._onTouchEnd);this.canvas.removeEventListener('touchcancel',this._onTouchEnd);this._onTouchStart=null;this._onTouchMove=null;this._onTouchEnd=null}
    if(this._sprintHintTimer){clearTimeout(this._sprintHintTimer);this._sprintHintTimer=null}
  },

  showTutorial(){
    const steps=[
      {text:'WASD或方向键移动角色',x:this.w/2,y:this.h/2+60},
      {text:'走近桌子按E或点击加入',x:this.w/2,y:this.h/2+60},
      {text:'点击右上角搭新桌创建房间',x:this.w/2,y:80},
      {text:'Enter键打开聊天',x:this.w/2,y:this.h-80}
    ];
    let idx=0;
    const showNext=()=>{
      if(idx>=steps.length){localStorage.setItem('wl_tutorial','1');return;}
      const s=steps[idx];
      const div=document.createElement('div');
      div.className='tutorial-overlay';
      div.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px';
      div.innerHTML=`<div style="background:var(--panel);border:1px solid var(--gold);padding:20px 28px;border-radius:4px;text-align:center;max-width:300px"><div style="font-size:14px;color:var(--text);margin-bottom:12px">${s.text}</div><button style="background:var(--gold);border:none;color:#1a1610;padding:8px 20px;border-radius:2px;font-size:12px;font-weight:700;cursor:pointer">下一步 (${idx+1}/${steps.length})</button></div>`;
      document.body.appendChild(div);
      div.querySelector('button').onclick=()=>{div.remove();idx++;showNext();};
    };
    showNext();
  },
  
  show(){this.init();if(!this.animId)this.startLoop();},
  hide(){this.stop()}
};

// 重写 renderLobby 以支持2D大厅
const _origRenderLobby=renderLobby;
renderLobby=function(){
  _origRenderLobby();
  Lobby.updateTablesFromState();
};

// 位置消息订阅
function subscribeLobbyPos(){
  if(!G.mqtt)return;
  G.mqtt.subscribe('wl_pos_v6/+',{qos:0},(err)=>{
    if(err)console.warn('[Lobby] pos sub failed',err);
  });
}

// 在 MQTT connect 回调中订阅位置 (直接修改现有的 connect 回调)
// 位置消息已在 MQTT on('message') 中直接处理

// 在 showScreen main 时启动大厅
// showScreen 已内联处理 Lobby 启动/停止

// 点击画布上的桌子触发加入 (在 Lobby.init 中绑定)
function bindLobbyCanvasClick(){
  const c=$('lobby-canvas');
  if(!c)return;
  c.addEventListener('click',e=>{
    // 忽略由触摸摇杆触发的合成点击事件
    if(Lobby._ignoreNextClick){Lobby._ignoreNextClick=false;return;}
    // 如果正在显示交互提示，说明已经走近桌子，不重复处理
    const hint=$('interact-hint');
    if(hint&&window.getComputedStyle(hint).display!=='none')return;
    const rect=c.getBoundingClientRect();
    const cx=e.clientX-rect.left+Lobby.camera.x;
    const cy=e.clientY-rect.top+Lobby.camera.y;
    for(const t of Lobby.tables){
      const dx=t.x-cx,dy=t.y-cy;
      if(Math.sqrt(dx*dx+dy*dy)<35){
        Lobby.joinTable(t);break;
      }
    }
  });
}
