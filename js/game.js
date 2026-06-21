// ============================================================
// 废土交易所 - 生存物资赌场 v13.0
// 全面升级：大幅增强所有升华效果可见性
// ============================================================
'use strict';
if(!CanvasRenderingContext2D.prototype.roundRect){CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){if(typeof r==='number')r=[r,r,r,r];if(!Array.isArray(r))r=[0,0,0,0];const[tl,tr,br,bl]=r.map(v=>Math.min(v,Math.min(w,h)/2));this.moveTo(x+tl,y);this.lineTo(x+w-tr,y);this.quadraticCurveTo(x+w,y,x+w,y+tr);this.lineTo(x+w,y+h-br);this.quadraticCurveTo(x+w,y+h,x+w-br,y+h);this.lineTo(x+bl,y+h);this.quadraticCurveTo(x,y+h,x,y+h-bl);this.lineTo(x,y+tl);this.quadraticCurveTo(x,y,x+tl,y);this.closePath();return this}}

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
  onlineUsers:{},
  presenceTimer:null,
  diceState:{dice:[null,null,null],sum:0,phase:'bet'},
  level:1, exp:0,
  stats:{luck:10, charm:10, agility:10},
  skinIndex:0,
  weather:{type:'clear', intensity:0, timer:0, nextChange:0},
  tempLuckBonus:0,
  diceJackpot:0, diceJackpotStreak:0,
  spectators:[],
  isSpectator:false,
  inventory:[],
  tradeState:null,
  auctionPanelOpen:false
};

const SUITS=['♠','♥','♣','♦'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};

// ==================== 音效系统 (升华24 多层环境音效) ====================
const Sound={
  _ctx:null,_enabled:true,_bgmOsc:null,_bgmGain:null,_sfxGain:null,_ambientGain:null,_bgmType:'lobby',
  _init(){if(this._ctx)return;try{this._ctx=new(window.AudioContext||window.webkitAudioContext)();if(this._ctx.state==='suspended')this._ctx.resume();this._sfxGain=this._ctx.createGain();this._sfxGain.gain.value=0.6;this._sfxGain.connect(this._ctx.destination);this._ambientGain=this._ctx.createGain();this._ambientGain.gain.value=0.08;this._ambientGain.connect(this._ctx.destination);this._bgmGain=this._ctx.createGain();this._bgmGain.gain.value=0.012;this._bgmGain.connect(this._ctx.destination)}catch(e){this._enabled=false}},
  _p(f,t='square',g=0.08,delay=0,dur=0.15){
    if(!this._enabled)return;this._init();
    const now=this._ctx.currentTime+delay;
    const o=this._ctx.createOscillator(),v=this._ctx.createGain();
    o.type=t;o.frequency.value=f;v.gain.value=g;
    o.connect(v);v.connect(this._sfxGain||this._ctx.destination);
    v.gain.exponentialRampToValueAtTime(0.001,now+dur);
    o.start(now);o.stop(now+dur);
  },
  deal(){this._p(800,'square',0.05,0,0.1);setTimeout(()=>this._p(1000,'square',0.05,0,0.1),60)},
  chip(){this._p(600,'sine',0.08);setTimeout(()=>this._p(900,'sine',0.08),50)},
  win(){this._p(523,'sine',0.08);setTimeout(()=>this._p(659,'sine',0.08),120);setTimeout(()=>this._p(784,'sine',0.08),240);flashScreen('var(--green)')},
  lose(){this._p(400,'sine',0.06);setTimeout(()=>this._p(300,'sine',0.06),150);flashScreen('var(--accent)')},
  click(){this._p(1200,'square',0.03,0,0.08)},
  dice(){for(let i=0;i<5;i++)setTimeout(()=>this._p(200+Math.random()*200,'triangle',0.04),i*40)},
  fold(){this._p(200,'sawtooth',0.04)},
  step(){const s=80+Math.random()*40;this._p(s,'sine',0.02,0,0.08)},
  join(){this._p(440,'sine',0.05);setTimeout(()=>this._p(550,'sine',0.05),100)},
  chat(){this._p(880,'sine',0.03)},
  cardSlide(){this._p(400,'triangle',0.04,0,0.1);setTimeout(()=>this._p(600,'triangle',0.03,0.05,0.1),80)},
  uiHover(){this._p(1500,'sine',0.015,0,0.05)},
  chipMetal(){this._p(800,'square',0.05,0,0.06);setTimeout(()=>this._p(1200,'sine',0.04,0.02,0.08),40);setTimeout(()=>this._p(600,'triangle',0.03,0.04,0.06),80)},
  diceRoll(){for(let i=0;i<6;i++)setTimeout(()=>this._p(150+Math.random()*300,'sawtooth',0.03,0,0.05),i*30)},
  toggle(){this._enabled=!this._enabled;if(this._enabled){this.chip();this.startBGM()}else{this.fold();this.stopBGM();this.stopAmbient();this.stopRoomBGM()}return this._enabled},
  // 环境音效
  startAmbient(weatherType){
    if(!this._enabled)return;this._init();this.stopAmbient();
    const ctx=this._ctx;
    if(weatherType==='clear'){
      const bufferSize=2*ctx.sampleRate;const noiseBuffer=ctx.createBuffer(1,bufferSize,ctx.sampleRate);const output=noiseBuffer.getChannelData(0);for(let i=0;i<bufferSize;i++)output[i]=Math.random()*2-1;
      const whiteNoise=ctx.createBufferSource();whiteNoise.buffer=noiseBuffer;whiteNoise.loop=true;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=400;
      whiteNoise.connect(filter);filter.connect(this._ambientGain);
      whiteNoise.start();this._ambientNode=whiteNoise;this._ambientFilter=filter;
    }else if(weatherType==='sandstorm'){
      const bufferSize=2*ctx.sampleRate;const noiseBuffer=ctx.createBuffer(1,bufferSize,ctx.sampleRate);const output=noiseBuffer.getChannelData(0);for(let i=0;i<bufferSize;i++)output[i]=Math.random()*2-1;
      const whiteNoise=ctx.createBufferSource();whiteNoise.buffer=noiseBuffer;whiteNoise.loop=true;
      const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=800;
      const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=2;
      const lfoGain=ctx.createGain();lfoGain.gain.value=200;
      lfo.connect(lfoGain);lfoGain.connect(filter.frequency);
      whiteNoise.connect(filter);filter.connect(this._ambientGain);
      whiteNoise.start();lfo.start();this._ambientNode=whiteNoise;this._ambientFilter=filter;this._ambientLfo=lfo;this._ambientLfoGain=lfoGain;
    }else if(weatherType==='rad rain'){
      const bufferSize=2*ctx.sampleRate;const noiseBuffer=ctx.createBuffer(1,bufferSize,ctx.sampleRate);const output=noiseBuffer.getChannelData(0);for(let i=0;i<bufferSize;i++)output[i]=Math.random()*2-1;
      const whiteNoise=ctx.createBufferSource();whiteNoise.buffer=noiseBuffer;whiteNoise.loop=true;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1200;
      whiteNoise.connect(filter);filter.connect(this._ambientGain);
      whiteNoise.start();this._ambientNode=whiteNoise;this._ambientFilter=filter;
      this._rainPulse=setInterval(()=>{if(!this._enabled)return;this._p(2000+Math.random()*2000,'sine',0.015,0,0.03)},200+Math.random()*300);
    }else if(weatherType==='fog'){
      const osc=ctx.createOscillator();osc.type='sine';osc.frequency.value=50;
      const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=0.1;
      const lfoGain=ctx.createGain();lfoGain.gain.value=5;
      lfo.connect(lfoGain);lfoGain.connect(osc.frequency);
      osc.connect(this._ambientGain);
      osc.start();lfo.start();this._ambientNode=osc;this._ambientLfo=lfo;this._ambientLfoGain=lfoGain;
    }
  },
  stopAmbient(){
    if(this._ambientNode){try{this._ambientNode.stop()}catch(e){}this._ambientNode=null}
    if(this._ambientFilter){try{this._ambientFilter.disconnect()}catch(e){}this._ambientFilter=null}
    if(this._ambientLfo){try{this._ambientLfo.stop()}catch(e){}this._ambientLfo=null}
    if(this._ambientLfoGain){try{this._ambientLfoGain.disconnect()}catch(e){}this._ambientLfoGain=null}
    if(this._rainPulse){clearInterval(this._rainPulse);this._rainPulse=null}
  },
  // 牌桌BGM
  startRoomBGM(gameType){
    if(!this._enabled)return;this._init();this.stopRoomBGM();this._bgmType=gameType;
    const ctx=this._ctx;
    if(gameType==='zjh'){
      const osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.value=55;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=200;
      const lfo=ctx.createOscillator();lfo.type='square';lfo.frequency.value=1.2;
      const lfoGain=ctx.createGain();lfoGain.gain.value=100;
      lfo.connect(lfoGain);lfoGain.connect(filter.frequency);
      osc.connect(filter);filter.connect(this._bgmGain);
      osc.start();lfo.start();this._roomBgmOsc=osc;this._roomBgmFilter=filter;this._roomBgmLfo=lfo;this._roomBgmLfoGain=lfoGain;
      this._roomBgmInterval=setInterval(()=>{if(!this._enabled||this._bgmType!=='zjh')return;if(Math.random()<0.3)this._p(880+Math.random()*440,'sine',0.03,0,0.08)},4000);
    }else if(gameType==='bj'){
      const notes=[261,311,349,392,440,523];let idx=0;
      const playSwing=()=>{if(!this._enabled||this._bgmType!=='bj')return;const f=notes[idx%notes.length];this._p(f,'sine',0.025,0,0.25);idx++;};
      this._roomBgmInterval=setInterval(playSwing,600);
      const bass=ctx.createOscillator();bass.type='triangle';bass.frequency.value=65;
      bass.connect(this._bgmGain);bass.start();this._roomBgmOsc=bass;
    }else if(gameType==='dice'){
      const beat=ctx.createOscillator();beat.type='square';beat.frequency.value=80;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=300;
      beat.connect(filter);filter.connect(this._bgmGain);
      beat.start();this._roomBgmOsc=beat;this._roomBgmFilter=filter;
      this._roomBgmInterval=setInterval(()=>{if(!this._enabled||this._bgmType!=='dice')return;this._p(1200+Math.random()*600,'sine',0.02,0,0.06);},800+Math.random()*400);
    }
  },
  stopRoomBGM(){
    if(this._roomBgmOsc){try{this._roomBgmOsc.stop()}catch(e){}this._roomBgmOsc=null}
    if(this._roomBgmFilter){try{this._roomBgmFilter.disconnect()}catch(e){}this._roomBgmFilter=null}
    if(this._roomBgmLfo){try{this._roomBgmLfo.stop()}catch(e){}this._roomBgmLfo=null}
    if(this._roomBgmLfoGain){try{this._roomBgmLfoGain.disconnect()}catch(e){}this._roomBgmLfoGain=null}
    if(this._roomBgmInterval){clearInterval(this._roomBgmInterval);this._roomBgmInterval=null}
    this._bgmType='lobby';
  },
  startBGM(){
    if(!this._enabled)return;this._init();
    if(this._bgmOsc)return;
    const ctx=this._ctx;
    this._bgmGain.gain.value=0.012;
    this._bgmOsc=ctx.createOscillator();this._bgmOsc.type='sine';this._bgmOsc.frequency.value=80;
    this._bgmOsc.connect(this._bgmGain);
    this._bgmOsc.start();
    const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=0.2;
    const lfoGain=ctx.createGain();lfoGain.gain.value=30;
    lfo.connect(lfoGain);lfoGain.connect(this._bgmOsc.frequency);
    lfo.start();
    this._bgmLfo=lfo;this._bgmLfoGain=lfoGain;
  },
  stopBGM(){if(this._bgmOsc){try{this._bgmOsc.stop()}catch(e){}this._bgmOsc=null}if(this._bgmLfo){try{this._bgmLfo.stop()}catch(e){}this._bgmLfo=null}if(this._bgmGain){try{this._bgmGain.disconnect()}catch(e){}this._bgmGain=null}}
};

function toggleSound(){
  const on=Sound.toggle();
  const el=document.getElementById('sound-toggle');
  if(el){el.textContent=on?'🔊':'🔇';el.classList.toggle('muted',!on)}
  const se=document.getElementById('settings-sound');
  if(se)se.textContent=on?'开启':'关闭';
}
function toggleBGM(){
  if(Sound._bgmOsc){Sound.stopBGM()}else{Sound.startBGM()}
  const be=document.getElementById('settings-bgm');
  if(be)be.textContent=Sound._bgmOsc?'开启':'关闭';
}
function showSettings(){
  const m=$('settings-modal');if(m)m.classList.add('open');
  const se=$('settings-sound');if(se)se.textContent=Sound._enabled?'开启':'关闭';
  const be=$('settings-bgm');if(be)be.textContent=Sound._bgmOsc?'开启':'关闭';
  const st=$('settings-stats');if(st)st.innerHTML=`幸运 ${G.stats.luck} | 魅力 ${G.stats.charm} | 敏捷 ${G.stats.agility}`;
  const lv=$('settings-level');if(lv)lv.textContent=`Lv.${G.level} ${getLevelTitle(G.level)} (${G.exp}/${expToNext(G.level)} 经验)`;
  const sk=$('settings-skills');if(sk){const ch=CHARACTERS[selectedChar];let skHtml='';if(ch&&ch.skills){for(const s of ch.skills){skHtml+=`<div style="font-size:11px;color:${s.unlocked?'var(--green)':'var(--dim)'};margin:2px 0">${s.unlocked?'✓':'🔒'} ${s.name}: ${s.desc}</div>`}}sk.innerHTML=skHtml||'<div style="font-size:11px;color:var(--dim)">无技能</div>';}
  updateFriendCountUI();updateGuildUI();
}
function closeSettings(){const m=$('settings-modal');if(m)m.classList.remove('open')}
function showCharSelect(){
  const m=$('char-modal');if(m)m.classList.add('open');
  const c=$('char-selector-modal');if(!c)return;
  let html='';
  for(let i=0;i<CHARACTERS.length;i++){
    const ch=CHARACTERS[i];
    html+=`<div class="char-opt ${i===selectedChar?'selected':''}" onclick="selectCharModal(${i})" style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid ${i===selectedChar?'var(--gold)':'var(--border)'};border-radius:4px;cursor:pointer;text-align:center;min-width:60px"><div style="font-size:24px">${ch.emoji}</div><div style="font-size:10px">${ch.name}</div><div style="font-size:9px;color:var(--dim);margin-top:4px">${ch.desc}</div>${renderSkinChoices(i)}</div>`;
  }
  c.innerHTML=html;
}
function renderSkinChoices(charIdx){
  const ch=CHARACTERS[charIdx];if(!ch||!ch.skins)return '';
  let html='<div style="display:flex;gap:4px;justify-content:center;margin-top:6px">';
  for(let i=0;i<ch.skins.length;i++){
    const unlocked=i===0||(i===1&&G.level>=5)||(i===2&&G.level>=15);
    const isSelected=i===G.skinIndex&&charIdx===selectedChar;
    html+=`<div onclick="event.stopPropagation();selectSkin(${charIdx},${i})" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid ${isSelected?'var(--gold)':'var(--border)'};background:${unlocked?'rgba(255,255,255,.03)':'rgba(0,0,0,.3)'};cursor:${unlocked?'pointer':'not-allowed'};font-size:16px;opacity:${unlocked?1:0.4}" title="${unlocked?ch.skins[i]:'Lv.'+(i===1?5:15)+'解锁'}">${ch.skins[i]}</div>`;
  }
  html+='</div>';return html;
}
function selectSkin(charIdx,skinIdx){
  const ch=CHARACTERS[charIdx];if(!ch||!ch.skins)return;
  const unlocked=skinIdx===0||(skinIdx===1&&G.level>=5)||(skinIdx===2&&G.level>=15);
  if(!unlocked){toast('等级不足，无法解锁该皮肤');return}
  selectedChar=charIdx;G.skinIndex=skinIdx;
  const emoji=ch.skins[skinIdx];
  if(typeof Lobby!=='undefined'&&Lobby.me)Lobby.me.emoji=emoji;
  save();renderCharSelector();showCharSelect();publishPresence();
}
function selectCharModal(idx){
  selectedChar=idx;
  const ch=CHARACTERS[idx];
  const emoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🐦';
  if(typeof Lobby!=='undefined'&&Lobby.me)Lobby.me.emoji=emoji;
  save();
  renderCharSelector();
  showCharSelect();
  publishPresence();
}
function closeCharSelect(){const m=$('char-modal');if(m)m.classList.remove('open')}
const MAX_ROUNDS=20;
const MAX_SEATS=3;
const LEVEL_TITLES=['拾荒者','流浪者','交易者','精明商人','黑市中介','物资大亨','废土领主','交易所之王'];
const CHARACTERS=[
  {emoji:'🐦',name:'灰鸽',desc:'废土信使',skins:['🐦','🕊️','🦅'],skills:[{name:'信使直觉',desc:'看牌时10%概率看到对手一张牌',unlocked:false,effect:'peek10'},{name:'顺风耳',desc:'大厅中听到更远处的聊天',unlocked:false,effect:'farChat'}]},
  {emoji:'🐱',name:'野猫',desc:'夜行猎手',skins:['🐱','🐯','🦁'],skills:[{name:'夜行',desc:'夜晚移动速度+20%',unlocked:false,effect:'nightSpeed'},{name:'敏锐',desc:'骰子猜大小时有5%额外胜率',unlocked:false,effect:'diceBonus'}]},
  {emoji:'🐕',name:'流浪狗',desc:'忠诚伙伴',skins:['🐕','🐩','🐺'],skills:[{name:'忠诚',desc:'队友获胜时自己获得10%奖励',unlocked:false,effect:'teamReward'},{name:'嗅觉',desc:'更容易找到废金属',unlocked:false,effect:'findScrap'}]},
  {emoji:'🦊',name:'赤狐',desc:'狡黠商人',skins:['🦊','🐺','🦁'],skills:[{name:'狡黠',desc:'诈唬成功率+15%',unlocked:false,effect:'bluff15'},{name:'商人',desc:'交易税降低5%',unlocked:false,effect:'taxCut'}]},
  {emoji:'🐀',name:'巨鼠',desc:'下水道王',skins:['🐀','🐁','🦫'],skills:[{name:'囤积',desc:'初始物资+20',unlocked:false,effect:'hoard20'},{name:'挖掘',desc:'废金属价值翻倍',unlocked:false,effect:'scrapValue'}]},
  {emoji:'🦎',name:'壁虎',desc:'攀爬专家',skins:['🦎','🐊','🐉'],skills:[{name:'攀爬',desc:'可穿过某些障碍物',unlocked:false,effect:'climb'},{name:'再生',desc:'每局游戏恢复5物资',unlocked:false,effect:'regen5'}]}
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
  G.spectators=[];
  _lastRenderHash='';
  _zjhCache.clear();
  clearLog();
}

// ==================== 存储 ====================
function load(){try{const s=localStorage.getItem('wl_user');if(s){const d=JSON.parse(s);G.user=d.n;G.chips=d.c||50;if(d.s!==undefined)selectedChar=d.s;if(d.px!==undefined&&d.py!==undefined){_savedPos={x:d.px,y:d.py}}if(d.l!==undefined)G.level=d.l;if(d.e!==undefined)G.exp=d.e;if(d.st!==undefined)G.stats=d.st;if(d.sk!==undefined)G.skinIndex=d.sk;return true}}catch(e){}return false}
function save(){if(G.user)try{const px=typeof Lobby!=='undefined'&&Lobby.me?Lobby.me.x:0;const py=typeof Lobby!=='undefined'&&Lobby.me?Lobby.me.y:0;localStorage.setItem('wl_user',JSON.stringify({n:G.user,c:G.chips,s:selectedChar,px,py,l:G.level,e:G.exp,st:G.stats,sk:G.skinIndex}));}catch(e){}}
function loadQuest(){try{const s=localStorage.getItem('wl_quest');if(s)return JSON.parse(s)}catch(e){}return {date:'',progress:0,claimed:false}}
function saveQuest(q){try{localStorage.setItem('wl_quest',JSON.stringify(q))}catch(e){}}
function checkQuest(){
  const q=loadQuest();const d=new Date();const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if(q.date!==today){q.date=today;q.progress=0;q.claimed=false;saveQuest(q)}
  return q;
}
function getLevelTitle(lv){const idx=Math.min(Math.max(0,Math.floor((lv-1)/3)),LEVEL_TITLES.length-1);return LEVEL_TITLES[idx]}
function expToNext(lv){return Math.min(lv,20)*100}
function addExp(amount){
  if(G.level>=20)return;
  G.exp+=amount;
  const needed=expToNext(G.level);
  if(G.exp>=needed){G.exp-=needed;G.level++;const title=getLevelTitle(G.level);toast(`升级！你现在是 Lv.${G.level} ${title}`);Sound.win();levelUpStats();}
  updateLevelPanel();save();
}
function levelUpStats(){
  const points=1+Math.floor(Math.random()*3);
  for(let i=0;i<points;i++){const keys=['luck','charm','agility'];const k=keys[Math.floor(Math.random()*keys.length)];G.stats[k]=Math.min(100,G.stats[k]+1)}
}
function updateLevelPanel(){
  const el=$('level-panel');if(!el)return;
  const needed=expToNext(G.level);
  const pct=G.level>=20?100:(G.exp/needed)*100;
  const title=getLevelTitle(G.level);
  el.style.borderColor='rgba(184,150,15,.7)';
  el.style.boxShadow='0 0 12px rgba(184,150,15,.25),inset 0 0 8px rgba(184,150,15,.08)';
  el.innerHTML=`<div style="font-size:20px;color:#b8960f;font-weight:900;margin-bottom:4px;text-shadow:0 0 12px rgba(184,150,15,.5)">Lv.${G.level}</div><div style="font-size:13px;color:#ff9944;margin-bottom:6px;font-weight:bold">${title}</div><div style="height:14px;background:rgba(0,0,0,.5);border-radius:7px;overflow:hidden;border:2px solid rgba(184,150,15,.6);box-shadow:inset 0 1px 3px rgba(0,0,0,.5)"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#5a8a3c,#8a6a0f,#b8960f,#dab820);transition:width .3s;border-radius:7px;box-shadow:0 0 6px rgba(184,150,15,.4)"></div></div><div style="font-size:11px;color:var(--dim);margin-top:4px">${G.level>=20?'已满级':G.exp+'/'+needed+' 经验'}</div><div style="margin-top:6px;border-top:1px solid rgba(184,150,15,.2);padding-top:4px;font-size:10px;color:#b8960f">幸运 ${G.stats.luck} | 魅力 ${G.stats.charm} | 敏捷 ${G.stats.agility}</div>`;
}
function updateQuestPanel(){
  const q=checkQuest();const el=$('quest-panel');if(!el)return;
  const pct=(q.progress/3)*100;
  const winner=getTodayWinner();
  el.style.borderColor='rgba(90,138,60,.6)';
  el.style.boxShadow='0 0 8px rgba(90,138,60,.15)';
  el.innerHTML=`<div style="font-size:13px;color:var(--gold);margin-bottom:4px;font-weight:bold">📋 每日任务</div><div style="font-size:11px;color:#d4c8a8;margin-bottom:6px">参与3局游戏</div><div style="height:10px;background:rgba(0,0,0,.5);border-radius:5px;overflow:hidden;border:1px solid rgba(90,138,60,.4)"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#3a6a2a,#5a8a3c,#7aaa4c);transition:width .3s;border-radius:5px"></div></div><div style="font-size:11px;color:var(--dim);margin-top:4px">${q.progress}/3 ${q.claimed?'✅ 已领取':'进行中'}</div>${q.progress>=3&&!q.claimed?'<div style="margin-top:4px;font-size:10px;color:#ff9944;font-weight:bold">点击领取奖励！</div>':''}${winner?`<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:4px;font-size:10px;color:var(--gold)">今日赢家: ${winner.emoji} ${escHTML(winner.name)} (${winner.chips}单位)</div>`:''}`;
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
  if(q.progress<3){q.progress++;saveQuest(q);updateQuestPanel()}
  if(q.progress>=3&&!q.claimed){q.claimed=true;G.chips+=10;saveQuest(q);save();updateChips();toast('任务完成！获得10单位物资')}
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
      addMail({type:'system',title:'每日救济金',content:'你获得了20单位物资救济金。',from:'系统'});
    }
  }catch(e){}
}

// ==================== 拍卖行系统 (升华21) ====================
const MAX_AUCTION=20;
const AUCTION_DURATION=24*60*60*1000;
function loadAuction(){try{const s=localStorage.getItem('wl_auction');return s?JSON.parse(s):[]}catch(e){return []}}
function saveAuction(list){try{localStorage.setItem('wl_auction',JSON.stringify(list.slice(-MAX_AUCTION)))}catch(e){}}
function cleanupExpiredAuctions(){
  const now=Date.now();
  const list=loadAuction();
  const expired=[];
  const valid=list.filter(a=>{if(a.expiresAt<=now){expired.push(a);return false}return true});
  saveAuction(valid);
  for(const a of expired){addMail({type:'auction',title:'拍卖过期退回',content:`你的 ${a.itemName} x${a.quantity} 拍卖已过期，物品已退回。`,from:'拍卖行'})}
}
function listAuction(item){
  if(!item||!item.itemType||!item.quantity||!item.price)return;
  const list=loadAuction();
  if(list.length>=MAX_AUCTION){toast('拍卖行已满，无法挂售');return}
  const sellerName=G.user||'匿名';
  const entry={id:genId(),sellerId:G.myId,sellerName,itemType:item.itemType,itemName:item.itemName||item.itemType,quantity:item.quantity,price:item.price,priceType:'chips',listedAt:Date.now(),expiresAt:Date.now()+AUCTION_DURATION};
  if(item.itemType==='chips'){if(G.chips<item.quantity){toast('物资不足');return}G.chips-=item.quantity;updateChips();save()}
  else{if(!G.inventory||G.inventory.length===0){toast('背包为空');return}const inv=loadInventory();const idx=inv.findIndex(i=>i.type===item.itemType);if(idx===-1){toast('背包中无此物品');return}inv.splice(idx,1);saveInventory(inv);G.inventory=inv}
  list.push(entry);saveAuction(list);toast('挂售成功！物品已进入拍卖行');Sound.win();
}
function buyAuction(id){
  cleanupExpiredAuctions();
  const list=loadAuction();
  const idx=list.findIndex(a=>a.id===id);
  if(idx===-1){toast('该拍卖已不存在');return}
  const a=list[idx];
  if(a.sellerId===G.myId){toast('不能购买自己的拍卖');return}
  const tax=Math.max(1,Math.floor(a.price*0.1));
  const total=a.price+tax;
  if(G.chips<total){toast('物资不足（含10%拍卖税）');return}
  G.chips-=total;updateChips();save();
  list.splice(idx,1);saveAuction(list);
  if(a.itemType==='chips'){G.chips+=a.quantity;updateChips();save()}
  else{addInventoryItem({type:a.itemType})}
  addMail({type:'auction',title:'拍卖成交',content:`你购买了 ${a.itemName} x${a.quantity}，花费${a.price}单位（税${tax}）。`,from:'拍卖行'});
  if(G.mqtt&&G.mqttConnected){
    G.mqtt.publish(`${TOPIC_WHISPER}/${G.myId}/${a.sellerId}`,JSON.stringify({type:'auction_sold',itemName:a.itemName,quantity:a.quantity,price:a.price,priceType:'chips',tax,ts:Date.now()}),{qos:0});
  }
  toast('购买成功！物品已到账');Sound.win();renderAuctionPanel();
}
function renderAuctionPanel(){
  cleanupExpiredAuctions();
  let modal=$('auction-panel-modal');
  if(!modal){modal=document.createElement('div');modal.className='modal-overlay open';modal.id='auction-panel-modal';document.body.appendChild(modal)}
  const list=loadAuction().slice().reverse();
  let html=`<div class="modal" style="max-width:480px;text-align:left;max-height:75vh;overflow-y:auto"><h3 style="text-align:center">拍卖行 (${list.length}/${MAX_AUCTION})</h3>`;
  html+=`<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">`;
  html+=`<button class="sm-btn" onclick="showListAuctionModal()">+ 挂售物资</button>`;
  html+=`<button class="sm-btn" onclick="document.getElementById('auction-panel-modal').remove();G.auctionPanelOpen=false">关闭</button>`;
  html+=`</div>`;
  if(list.length===0){html+=`<div style="font-size:12px;color:var(--dim);text-align:center;padding:20px">暂无拍卖物品</div>`;}
  else{
    html+=`<div style="display:flex;flex-direction:column;gap:6px;margin:12px 0">`;
    for(const a of list){
      const remain=Math.max(0,a.expiresAt-Date.now());
      const hours=Math.floor(remain/3600000);
      const mins=Math.floor((remain%3600000)/60000);
      const priceLabel=a.priceType==='chips'?'单位':a.priceType==='can'?'罐头':a.priceType==='gas'?'汽油':'火柴';
      const isMine=a.sellerId===G.myId;
      html+=`<div style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:4px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:var(--text)">${escHTML(a.itemName)} x${a.quantity}</span><span style="font-size:10px;color:var(--dim)">${hours}时${mins}分</span></div><div style="font-size:11px;color:var(--dim);margin-top:2px">卖家: ${escHTML(a.sellerName)} | 价格: <span style="color:var(--gold)">${a.price} ${priceLabel}</span> (+10%税)</div>${isMine?'<div style="font-size:10px;color:var(--accent);margin-top:2px">你的拍卖</div>':`<button class="sm-btn" style="margin-top:4px" onclick="buyAuction('${a.id}')">购买</button>`}</div>`;
    }
    html+=`</div>`;
  }
  html+=`</div>`;
  modal.innerHTML=html;modal.classList.add('open');G.auctionPanelOpen=true;
}
function showListAuctionModal(){
  const div=document.createElement('div');div.className='modal-overlay open';div.id='list-auction-modal';
  div.innerHTML=`<div class="modal" style="max-width:360px;text-align:left"><h3 style="text-align:center">挂售物品</h3><div style="display:flex;flex-direction:column;gap:8px;margin:12px 0"><div><div style="font-size:11px;color:var(--dim);margin-bottom:4px">选择物品类型</div><select id="auction-item-type" class="auth-input" style="width:100%"><option value="chips">通用单位 (${G.chips})</option></select></div><div><div style="font-size:11px;color:var(--dim);margin-bottom:4px">数量</div><input id="auction-qty" class="auth-input" type="number" min="1" value="1" style="width:100%"></div><div><div style="font-size:11px;color:var(--dim);margin-bottom:4px">价格（单位）</div><input id="auction-price" class="auth-input" type="number" min="1" value="10" style="width:100%"></div></div><div style="text-align:center"><button class="action-btn primary" onclick="submitListAuction()">确认挂售</button><button class="sm-btn btn-press" onclick="document.getElementById('list-auction-modal').remove()" style="margin-left:8px">取消</button></div></div>`;
  document.body.appendChild(div);
}
function submitListAuction(){
  const type=$('auction-item-type').value;
  const qty=parseInt($('auction-qty').value)||0;
  const price=parseInt($('auction-price').value)||0;
  if(qty<=0||price<=0){toast('数量和价格必须大于0');return}
  const itemNames={chips:'通用单位'};
  listAuction({itemType:type,itemName:itemNames[type]||type,quantity:qty,price});
  const modal=$('list-auction-modal');if(modal)modal.remove();
  renderAuctionPanel();
}

// ==================== 邮件系统 (升华19) ====================
const MAX_MAIL=30;
function loadMail(){try{const s=localStorage.getItem('wl_mail');return s?JSON.parse(s):[]}catch(e){return []}}
function saveMail(list){try{localStorage.setItem('wl_mail',JSON.stringify(list.slice(-MAX_MAIL)))}catch(e){}}
function addMail(mail){
  const list=loadMail();
  mail.id=genId();mail.read=false;mail.ts=mail.ts||Date.now();
  list.push(mail);
  if(list.length>MAX_MAIL){list.splice(0,list.length-MAX_MAIL)}
  saveMail(list);updateMailBadge();
}
function getUnreadMailCount(){return loadMail().filter(m=>!m.read).length}
function updateMailBadge(){
  const badge=$('mail-badge');if(!badge)return;
  const count=getUnreadMailCount();
  badge.textContent=count;badge.style.display=count?'inline-block':'none';
}
function showMailPanel(){
  const div=document.createElement('div');div.className='modal-overlay open';div.id='mail-panel-modal';
  const list=loadMail().slice().reverse();
  let html=`<div class="modal" style="max-width:420px;text-align:left;max-height:75vh;overflow-y:auto"><h3 style="text-align:center">邮件 (${list.length})</h3>`;
  if(list.length===0){html+=`<div style="font-size:12px;color:var(--dim);text-align:center;padding:20px">暂无邮件</div>`;}
  else{
    html+=`<div style="display:flex;flex-direction:column;gap:6px;margin:12px 0">`;
    for(const m of list){
      const unread=!m.read;const dateStr=new Date(m.ts).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      html+=`<div onclick="showMailDetail('${m.id}')" style="padding:8px 10px;background:${unread?'rgba(184,150,15,.08)':'rgba(255,255,255,.03)'};border:1px solid ${unread?'rgba(184,150,15,.3)':'var(--border)'};border-radius:4px;cursor:pointer"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:${unread?'var(--gold)':'var(--text)'};font-weight:${unread?'700':'400'}">${unread?'● ':''}${escHTML(m.title)}</span><span style="font-size:10px;color:var(--dim)">${dateStr}</span></div><div style="font-size:11px;color:var(--dim);margin-top:2px">来自: ${escHTML(m.from||'系统')}</div></div>`;
    }
    html+=`</div>`;
  }
  html+=`<div style="text-align:center"><button class="modal-btn btn-press" onclick="document.getElementById('mail-panel-modal').remove()">关闭</button></div></div>`;
  div.innerHTML=html;document.body.appendChild(div);
}
function showMailDetail(id){
  const list=loadMail();const m=list.find(x=>x.id===id);if(!m)return;m.read=true;saveMail(list);updateMailBadge();
  const div=document.createElement('div');div.className='modal-overlay open';
  const dateStr=new Date(m.ts).toLocaleString('zh-CN');
  let attachmentHtml='';
  if(m.attachment){
    if(m.attachment.chips){attachmentHtml+=`<div style="margin:8px 0;padding:8px;background:rgba(90,138,60,.1);border:1px solid var(--green);border-radius:4px;font-size:12px">附件: ${m.attachment.chips} 单位物资 <button class="sm-btn" onclick="claimMailAttachment('${m.id}')">领取</button></div>`}
    if(m.attachment.can){attachmentHtml+=`<div style="margin:8px 0;padding:8px;background:rgba(90,138,60,.1);border:1px solid var(--green);border-radius:4px;font-size:12px">附件: ${m.attachment.can} 罐头 <button class="sm-btn" onclick="claimMailAttachment('${m.id}')">领取</button></div>`}
    if(m.attachment.gas){attachmentHtml+=`<div style="margin:8px 0;padding:8px;background:rgba(90,138,60,.1);border:1px solid var(--green);border-radius:4px;font-size:12px">附件: ${m.attachment.gas} 汽油 <button class="sm-btn" onclick="claimMailAttachment('${m.id}')">领取</button></div>`}
    if(m.attachment.match){attachmentHtml+=`<div style="margin:8px 0;padding:8px;background:rgba(90,138,60,.1);border:1px solid var(--green);border-radius:4px;font-size:12px">附件: ${m.attachment.match} 火柴 <button class="sm-btn" onclick="claimMailAttachment('${m.id}')">领取</button></div>`}
  }
  div.innerHTML=`<div class="modal" style="max-width:360px;text-align:left"><h3 style="text-align:center">${escHTML(m.title)}</h3><div style="font-size:11px;color:var(--dim);margin-bottom:8px">来自: ${escHTML(m.from||'系统')} · ${dateStr}</div><div style="font-size:13px;line-height:1.6;margin:12px 0">${escHTML(m.content)}</div>${attachmentHtml}<div style="text-align:center;margin-top:12px"><button class="modal-btn btn-press" onclick="this.closest('.modal-overlay').remove();showMailPanel()">返回</button><button class="sm-btn btn-press" onclick="deleteMail('${m.id}');this.closest('.modal-overlay').remove();showMailPanel()" style="color:var(--accent);border-color:var(--accent);margin-left:8px">删除</button></div></div>`;
  document.body.appendChild(div);
}
function claimMailAttachment(id){
  const list=loadMail();const m=list.find(x=>x.id===id);if(!m||!m.attachment)return;
  if(m.attachment.chips){G.chips+=m.attachment.chips;updateChips();save();}
  m.attachment=null;saveMail(list);
  toast('附件已领取');Sound.win();
  const modal=$('mail-panel-modal');if(modal)modal.remove();showMailPanel();
}
function deleteMail(id){
  let list=loadMail();list=list.filter(x=>x.id!==id);saveMail(list);updateMailBadge();
}
function cleanOldMail(){
  const list=loadMail();if(list.length>MAX_MAIL){list.splice(0,list.length-MAX_MAIL);saveMail(list);}
}
function loadAchievements(){try{const s=localStorage.getItem('wl_achievements');return s?JSON.parse(s):{}}catch(e){return {}}}
function saveAchievements(a){try{localStorage.setItem('wl_achievements',JSON.stringify(a))}catch(e){}}
function checkAchievement(key,name,desc){
  const a=loadAchievements();if(a[key])return;
  a[key]=Date.now();saveAchievements(a);
  toast(`成就解锁：${name}`);
  Sound.win();
}
function checkHighRoller(){if(G.currentBet>=50)checkAchievement('highRoller','大赌客','单次下注50+')}
function checkFirstWin(){checkAchievement('firstWin','初战告捷','获得第一场胜利')}
function checkLuckyStreak(){
  try{const s=localStorage.getItem('wl_streak');const streak=s?parseInt(s):0;if(streak>=3)checkAchievement('luckyStreak','好运连连','连胜3场')}catch(e){}
}
function updateStreak(won){
  try{let streak=parseInt(localStorage.getItem('wl_streak')||'0');streak=won?streak+1:0;localStorage.setItem('wl_streak',String(streak));if(won)checkLuckyStreak()}catch(e){}
}
function loadStats(){try{const s=localStorage.getItem('wl_stats');return s?JSON.parse(s):{games:0,wins:0,zjh:0,bj:0,dice:0}}catch(e){return {games:0,wins:0,zjh:0,bj:0,dice:0}}}
function saveStats(st){try{localStorage.setItem('wl_stats',JSON.stringify(st))}catch(e){}}
function updateStats(gameType,won){
  const st=loadStats();st.games++;if(won)st.wins++;
  if(gameType==='zjh')st.zjh++;else if(gameType==='bj')st.bj++;else if(gameType==='dice')st.dice++;
  saveStats(st);
}
function loadReplays(){try{const s=localStorage.getItem('wl_replays');return s?JSON.parse(s):[]}catch(e){return []}}
function saveReplays(replays){try{localStorage.setItem('wl_replays',JSON.stringify(replays.slice(-10)))}catch(e){}}
function addReplay(data){const replays=loadReplays();replays.push(data);saveReplays(replays);}
function showStatsPanel(){
  const st=loadStats();
  const winRate=st.games>0?Math.round(st.wins/st.games*100):0;
  const fav=st.zjh>st.bj&&st.zjh>st.dice?'炸金花':(st.bj>st.dice?'二十一点':'骰子');
  const replays=loadReplays().slice(-5).reverse();
  let replayHtml='';
  if(replays.length>0){
    replayHtml='<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px"><div style="font-size:12px;color:var(--gold);margin-bottom:8px">最近牌局</div>';
    for(const r of replays){
      const dateStr=new Date(r.date).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const gameLabel=r.gameType==='zjh'?'炸金花':r.gameType==='bj'?'二十一点':'骰子';
      const winStr=r.winner?`${r.winner} 获胜`:'平局/退还';
      const actions=r.actions.slice(-2).map(a=>`${a.player}${a.action}`).join('，');
      replayHtml+=`<div style="font-size:11px;color:var(--dim);margin-bottom:6px;padding:4px;background:rgba(255,255,255,.03);border-radius:3px"><div style="color:var(--text)">${dateStr} · ${gameLabel} · ${winStr}</div><div style="font-size:10px;margin-top:2px">${actions||'无关键决策'}</div></div>`;
    }
    replayHtml+='</div>';
  }
  const div=document.createElement('div');div.className='modal-overlay open';div.id='stats-modal';
  div.innerHTML=`<div class="modal" style="max-width:320px;text-align:left;max-height:80vh;overflow-y:auto"><h3 style="text-align:center">数据统计</h3><div style="font-size:13px;line-height:1.8"><div>总场次：${st.games}</div><div>胜场：${st.wins}</div><div>胜率：${winRate}%</div><div>最爱游戏：${fav}</div><div>炸金花：${st.zjh}场</div><div>二十一点：${st.bj}场</div><div>骰子：${st.dice}场</div></div>${replayHtml}<div style="text-align:center;margin-top:12px"><button class="modal-btn btn-press" onclick="document.getElementById('stats-modal').remove()">关闭</button></div></div>`;
  document.body.appendChild(div);
}
// ==================== 好友系统 (升华16) ====================
const MAX_FRIENDS=20;
const TOPIC_WHISPER='wl_whisper_v6';
function loadFriends(){try{const s=localStorage.getItem('wl_friends');return s?JSON.parse(s):[]}catch(e){return []}}
function saveFriends(f){try{localStorage.setItem('wl_friends',JSON.stringify(f))}catch(e){}}
function loadFavorites(){return loadFriends().map(fr=>({id:fr.id,name:fr.name,emoji:fr.emoji,ts:fr.addedAt||Date.now()}))}
function saveFavorites(f){saveFriends(f.map(x=>({id:x.id,name:x.name,emoji:x.emoji,status:'offline',addedAt:x.ts||Date.now(),lastSeen:Date.now()})))}
function addFriend(id,name,emoji){
  const f=loadFriends();if(f.find(x=>x.id===id)){toast('该玩家已是好友');return}
  if(f.length>=MAX_FRIENDS){toast('好友数量已达上限(20人)');return}
  f.push({id,name,emoji,status:'online',roomCode:null,addedAt:Date.now(),lastSeen:Date.now()});
  saveFriends(f);toast(`已添加好友 ${name}`);updateFriendCountUI();renderFriends();
}
function removeFriend(id){
  let f=loadFriends();f=f.filter(x=>x.id!==id);saveFriends(f);renderFriends();updateFriendCountUI();toast('已删除好友');
}
function updateFriendStatus(id,status,roomCode){
  const f=loadFriends();const fr=f.find(x=>x.id===id);if(!fr)return;
  fr.status=status;fr.roomCode=roomCode;fr.lastSeen=Date.now();saveFriends(f);renderFriends();
}
function renderFriends(){
  const f=loadFriends();const el=$('fav-list');if(!el)return;
  if(f.length===0){el.innerHTML='<div style="font-size:11px;color:var(--dim)">暂无好友</div>';return}
  const online=f.filter(x=>x.status==='online'||x.status==='ingame');
  const offline=f.filter(x=>x.status==='offline');
  let html='';
  if(online.length){html+=`<div style="font-size:10px;color:var(--green);margin:4px 0">在线 (${online.length})</div>`;html+=online.map(u=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer" onclick="showFriendMenu('${u.id}','${escHTML(u.name)}','${u.emoji||'🐦'}')" title="点击操作"><span>${u.emoji||'🐦'}</span><span style="font-size:12px">${escHTML(u.name)}</span><span style="font-size:10px;color:var(--green)">●</span></div>`).join('');}
  if(offline.length){html+=`<div style="font-size:10px;color:var(--dim);margin:4px 0">离线 (${offline.length})</div>`;html+=offline.map(u=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer" onclick="showFriendMenu('${u.id}','${escHTML(u.name)}','${u.emoji||'🐦'}')" title="点击操作"><span>${u.emoji||'🐦'}</span><span style="font-size:12px">${escHTML(u.name)}</span><span style="font-size:10px;color:var(--dim)">○</span></div>`).join('');}
  el.innerHTML=html;
}
function updateFriendCountUI(){
  const f=loadFriends();
  const el=$('settings-friends');if(el)el.textContent=`${f.length}/${MAX_FRIENDS}`;
  const badge=$('friend-badge');if(badge){badge.textContent=f.length;badge.style.display=f.length?'inline':'none'}
}
function showFriendMenu(id,name,emoji){
  const div=document.createElement('div');div.className='modal-overlay open';div.id='friend-menu-modal';
  div.innerHTML=`<div class="modal" style="max-width:260px;text-align:center"><h3>${emoji} ${escHTML(name)}</h3><div style="display:flex;flex-direction:column;gap:8px;margin:12px 0"><button class="action-btn" onclick="removeFriend('${id}');document.getElementById('friend-menu-modal').remove()">删除好友</button><button class="action-btn" onclick="sendWhisperTo('${id}');document.getElementById('friend-menu-modal').remove()">发送私聊</button><button class="action-btn" onclick="inviteFriend('${id}');document.getElementById('friend-menu-modal').remove()">邀请组队</button><button class="action-btn" onclick="showFriendProfile('${id}','${escHTML(name)}','${emoji}');document.getElementById('friend-menu-modal').remove()">查看资料</button></div><button class="sm-btn btn-press" onclick="document.getElementById('friend-menu-modal').remove()">取消</button></div>`;
  document.body.appendChild(div);
}
function sendWhisperTo(toId){
  const text=prompt('输入私聊消息:');if(!text||!text.trim())return;
  if(!G.mqtt||!G.mqttConnected){toast('信号未连接');return}
  const ch=CHARACTERS[selectedChar];const emoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🐦';
  const msg={fromId:G.myId,fromName:G.user,text:text.trim(),emoji,ts:Date.now()};
  G.mqtt.publish(`${TOPIC_WHISPER}/${G.myId}/${toId}`,JSON.stringify(msg),{qos:0});
  toast(`私聊已发送`);Sound.click();
}
function inviteFriend(toId){
  if(!G.roomCode){toast('你需要先创建或加入一个房间');return}
  if(!G.mqtt||!G.mqttConnected){toast('信号未连接');return}
  const ch=CHARACTERS[selectedChar];const emoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🐦';
  const msg={type:'invite',fromId:G.myId,fromName:G.user,roomCode:G.roomCode,emoji,ts:Date.now()};
  G.mqtt.publish(`${TOPIC_WHISPER}/${G.myId}/${toId}`,JSON.stringify(msg),{qos:0});
  toast('组队邀请已发送');Sound.click();
}
function showFriendProfile(id,name,emoji){
  const f=loadFriends();const fr=f.find(x=>x.id===id);
  const div=document.createElement('div');div.className='modal-overlay open';
  div.innerHTML=`<div class="modal" style="max-width:260px;text-align:center"><h3>${emoji} ${escHTML(name)}</h3><div style="font-size:12px;color:var(--dim);line-height:1.8;text-align:left;margin:12px 0"><div>ID: ${id.substring(0,8)}...</div><div>状态: ${fr?.status||'未知'}</div><div>添加时间: ${fr?new Date(fr.addedAt).toLocaleDateString('zh-CN'):'-'}</div></div><button class="modal-btn btn-press" onclick="this.closest('.modal-overlay').remove()">关闭</button></div>`;
  document.body.appendChild(div);
}
function handleWhisperMsg(topic,payload){
  try{
    const msg=JSON.parse(payload.toString());
    if(msg.type==='invite'){
      if(confirm(`${msg.fromName||'某人'} 邀请你加入房间 ${msg.roomCode}，是否接受？`)){joinTableByCode(msg.roomCode)}
    }else if(msg.type==='auction_sold'){
      const net=msg.price-(msg.tax||0);
      addMail({type:'auction',title:'拍卖售出',content:`你的 ${msg.itemName} x${msg.quantity} 已被购买，售价${msg.price}单位（扣除税${msg.tax||0}），实得${net}单位已到账。`,from:'拍卖行'});
      G.chips+=net;updateChips();save();
      toast(`拍卖售出：${msg.itemName} x${msg.quantity}`);Sound.win();
    }else{
      toast(`[私聊] ${msg.fromName||'?'}: ${msg.text}`);
      showChatBubble(msg.fromId,msg.fromName||'?',msg.text,msg.emoji);
      Sound.chat();
    }
  }catch(e){}
}
function showFriendPanel(){
  const div=document.createElement('div');div.className='modal-overlay open';div.id='friend-panel-modal';
  div.innerHTML=`<div class="modal" style="max-width:320px;text-align:left;max-height:70vh;overflow-y:auto"><h3 style="text-align:center">好友列表 (${loadFriends().length}/${MAX_FRIENDS})</h3><div id="friend-panel-list" style="margin:12px 0"></div><div style="text-align:center"><button class="modal-btn btn-press" onclick="document.getElementById('friend-panel-modal').remove()">关闭</button></div></div>`;
  document.body.appendChild(div);
  renderFriendPanelList();
}
function renderFriendPanelList(){
  const el=document.getElementById('friend-panel-list');if(!el)return;
  const f=loadFriends();
  if(f.length===0){el.innerHTML='<div style="font-size:12px;color:var(--dim);text-align:center">暂无好友，点击在线列表中的玩家添加</div>';return}
  const online=f.filter(x=>x.status==='online'||x.status==='ingame');
  const offline=f.filter(x=>x.status==='offline');
  let html='';
  if(online.length){html+=`<div style="font-size:11px;color:var(--green);margin:6px 0">在线</div>`;html+=online.map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:6px;background:rgba(255,255,255,.03);border-radius:4px;margin:4px 0"><span>${u.emoji||'🐦'}</span><span style="font-size:12px;flex:1">${escHTML(u.name)}</span><button class="sm-btn" style="padding:3px 8px;font-size:10px" onclick="sendWhisperTo('${u.id}')">私聊</button><button class="sm-btn" style="padding:3px 8px;font-size:10px" onclick="inviteFriend('${u.id}')">邀请</button></div>`).join('');}
  if(offline.length){html+=`<div style="font-size:11px;color:var(--dim);margin:6px 0">离线</div>`;html+=offline.map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:6px;background:rgba(255,255,255,.03);border-radius:4px;margin:4px 0"><span>${u.emoji||'🐦'}</span><span style="font-size:12px;flex:1">${escHTML(u.name)}</span><span style="font-size:10px;color:var(--dim)">离线</span></div>`).join('');}
  el.innerHTML=html;
}
function addFavorite(id,name,emoji){addFriend(id,name,emoji)}
function renderFavorites(){renderFriends()}

// ==================== 公会/阵营系统 (升华17) ====================
const TOPIC_GUILD_CHAT = 'wl_guild_chat_v6';
function loadGuild(){try{const s=localStorage.getItem('wl_guild');return s?JSON.parse(s):null}catch(e){return null}}
function saveGuild(g){try{localStorage.setItem('wl_guild',JSON.stringify(g))}catch(e){}}
function getMyGuild(){const g=loadGuild();if(!g)return null;if(g.members&&g.members.find(m=>m.id===G.myId))return g;return null}
function getGuildTag(){const g=getMyGuild();return g?`[${g.tag}] ` :''}
function createGuild(name,tag){
  if(G.chips<50){toast('创建阵营需要50单位物资');return}
  if(!name||name.length<2||name.length>12){toast('阵营名称2-12字');return}
  if(!tag||tag.length<2||tag.length>4){toast('阵营标签2-4字');return}
  if(getMyGuild()){toast('你已加入阵营');return}
  G.chips-=50;updateChips();save();
  const guild={name,tag,leaderId:G.myId,leaderName:G.user,members:[{id:G.myId,name:G.user,role:'leader',joinedAt:Date.now()}],warehouse:0,createdAt:Date.now()};
  saveGuild(guild);toast(`阵营 [${tag}] ${name} 创建成功！`);updateGuildUI();publishGuildPresence();
}
function joinGuildByCode(code){
  const g=loadGuild();if(!g){toast('阵营不存在');return}
  if(g.tag!==code&&g.name!==code){toast('阵营码错误');return}
  if(getMyGuild()){toast('你已加入阵营');return}
  if(!g.members.find(m=>m.id===G.myId)){g.members.push({id:G.myId,name:G.user,role:'member',joinedAt:Date.now()});saveGuild(g);toast(`加入阵营 [${g.tag}] ${g.name}`);updateGuildUI();publishGuildPresence();}
}
function leaveGuild(){
  let g=loadGuild();if(!g)return;
  if(g.leaderId===G.myId){localStorage.removeItem('wl_guild');toast('阵营已解散');}
  else{g.members=g.members.filter(m=>m.id!==G.myId);saveGuild(g);toast('已退出阵营');}
  updateGuildUI();publishGuildPresence();
}
function donateToGuild(amount){
  const g=getMyGuild();if(!g){toast('未加入阵营');return}
  if(G.chips<amount||amount<=0){toast('物资不足');return}
  G.chips-=amount;g.warehouse=(g.warehouse||0)+amount;saveGuild(g);save();updateChips();toast(`向阵营仓库捐献${amount}单位`);
}
function distributeFromGuild(toId,amount){
  const g=getMyGuild();if(!g){toast('未加入阵营');return}
  if(g.leaderId!==G.myId){toast('只有会长可以分配物资');return}
  if((g.warehouse||0)<amount||amount<=0){toast('仓库物资不足');return}
  g.warehouse-=amount;saveGuild(g);
  addMail({type:'guild',title:'阵营分配',content:`会长分配给你${amount}单位物资`,attachment:{chips:amount},from:'阵营仓库'});
  toast(`已分配${amount}单位给成员`);
}
function getGuildRank(){
  const g=loadGuild();if(!g)return'-';
  const st=loadStats();const totalWins=st.wins||0;
  return `胜场:${totalWins}`;
}
function getGuildBuff(){
  const g=getMyGuild();if(!g)return 0;
  let sameGuildInRoom=0;
  for(const rp of G.roomPeers){if(rp.id===G.myId)continue;const og=loadGuild();if(og&&og.members.find(m=>m.id===rp.id))sameGuildInRoom++}
  return sameGuildInRoom>=2?5:0;
}
function publishGuildPresence(){
  if(!G.mqtt||!G.mqttConnected)return;
  const g=getMyGuild();
  const msg={type:'guild',id:G.myId,guildTag:g?g.tag:null,guildName:g?g.name:null,ts:Date.now()};
  G.mqtt.publish(TOPIC_PRESENCE,JSON.stringify(msg),{qos:0});
}
function handleGuildChatMsg(msg){
  if(!msg||!msg.id||msg.id===G.myId)return;
  const g=getMyGuild();if(!g||!msg.guildTag||msg.guildTag!==g.tag)return;
  log(`[阵营] ${msg.name}: ${msg.text}`,'system');Sound.chat();
}
function sendGuildChat(text){
  const g=getMyGuild();if(!g){toast('未加入阵营');return}
  if(!G.mqtt||!G.mqttConnected){toast('信号未连接');return}
  const msg={id:G.myId,name:G.user,text,guildTag:g.tag,ts:Date.now()};
  G.mqtt.publish(`${TOPIC_GUILD_CHAT}/${g.tag}`,JSON.stringify(msg),{qos:0});
  log(`[阵营] 你: ${text}`,'system');Sound.click();
}
function updateGuildUI(){
  const el=$('settings-guild');if(!el)return;
  const g=getMyGuild();
  if(g){el.innerHTML=`<span style="color:var(--gold)">[${g.tag}] ${g.name}</span> <span style="font-size:10px;color:var(--dim)">(${g.members.length}人)</span>`;}
  else{el.innerHTML='<span style="color:var(--dim)">未加入</span>';}
}
function showGuildPanel(){
  const g=getMyGuild();const div=document.createElement('div');div.className='modal-overlay open';div.id='guild-panel-modal';
  if(!g){
    div.innerHTML=`<div class="modal" style="max-width:320px;text-align:left"><h3 style="text-align:center">阵营</h3><div style="font-size:12px;color:var(--dim);margin:8px 0">创建阵营需要50单位物资</div><div style="display:flex;flex-direction:column;gap:8px;margin:12px 0"><input id="guild-name-input" class="auth-input" placeholder="阵营名称(2-12字)" maxlength="12"><input id="guild-tag-input" class="auth-input" placeholder="阵营标签(2-4字)" maxlength="4"><button class="action-btn primary" onclick="createGuild(document.getElementById('guild-name-input').value.trim(),document.getElementById('guild-tag-input').value.trim());document.getElementById('guild-panel-modal').remove()">创建阵营</button></div><div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px"><div style="font-size:12px;color:var(--dim);margin-bottom:8px">或输入阵营标签加入</div><div style="display:flex;gap:8px"><input id="guild-join-input" class="auth-input" placeholder="阵营标签" maxlength="4"><button class="sm-btn" onclick="joinGuildByCode(document.getElementById('guild-join-input').value.trim());document.getElementById('guild-panel-modal').remove()">加入</button></div></div><div style="text-align:center;margin-top:12px"><button class="modal-btn btn-press" onclick="document.getElementById('guild-panel-modal').remove()">关闭</button></div></div>`;
  }else{
    const isLeader=g.leaderId===G.myId;
    let membersHtml=g.members.map(m=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0"><span style="font-size:12px">${escHTML(m.name)}</span><span style="font-size:10px;color:var(--dim)">${m.role==='leader'?'会长':'成员'}</span></div>`).join('');
    div.innerHTML=`<div class="modal" style="max-width:320px;text-align:left"><h3 style="text-align:center">[${g.tag}] ${g.name}</h3><div style="font-size:12px;color:var(--dim);margin:8px 0">会长: ${escHTML(g.leaderName)} | 成员: ${g.members.length}</div><div style="font-size:12px;color:var(--gold);margin:8px 0">仓库: ${g.warehouse||0} 单位</div><div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px"><div style="font-size:11px;color:var(--dim);margin-bottom:6px">成员列表</div>${membersHtml}</div><div style="display:flex;flex-direction:column;gap:8px;margin:12px 0">${isLeader?`<button class="action-btn" onclick="const amt=parseInt(prompt('分配数量'));if(amt>0)distributeFromGuild('',amt)">分配物资</button>`:''}<button class="action-btn" onclick="const amt=parseInt(prompt('捐献数量'));if(amt>0)donateToGuild(amt)">捐献物资</button><button class="action-btn" onclick="sendGuildChat(prompt('阵营聊天:'));document.getElementById('guild-panel-modal').remove()">阵营聊天</button><button class="action-btn danger" onclick="leaveGuild();document.getElementById('guild-panel-modal').remove()">${isLeader?'解散阵营':'退出阵营'}</button></div><div style="text-align:center"><button class="modal-btn btn-press" onclick="document.getElementById('guild-panel-modal').remove()">关闭</button></div></div>`;
  }
  document.body.appendChild(div);
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
  const l=$('loading-overlay');if(l){l.style.display='block';l.style.opacity='1'}
  const tips=['靠近桌子按E加入游戏','按住Shift可以冲刺移动','按Enter键打开聊天','按Q键打开表情轮盘','收集废金属可以获得额外奖励'];
  const tip=$('loading-tip');if(tip)tip.textContent='提示：'+tips[Math.floor(Math.random()*tips.length)];
}
function showScreen(n){
  hideLoading();
  const a=$('auth-screen'),m=$('main-screen'),g=$('game-screen');
  if(a)a.style.display=n==='auth'?'flex':'none';
  if(m)m.style.display=n==='main'?'block':'none';
  if(g)g.style.display=n==='game'?'block':'none';
  const active=n==='auth'?a:(n==='main'?m:g);
  if(active){active.style.opacity='0';active.style.transition='opacity .3s';requestAnimationFrame(()=>{active.style.opacity='1'})}
  try{if(n==='main'){Lobby.show();Sound.stopRoomBGM();Sound.startAmbient(G.weather.type);}else{Lobby.hide()}}catch(e){}
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
  const p=$('game-log');if(!p)return;
  const e=document.createElement('div');e.className='log-entry '+(t||'');e.textContent=m;
  p.appendChild(e);p.scrollTop=p.scrollHeight;
}
function clearLog(){G.logs=[];const p=$('game-log');if(p)p.innerHTML=''}
function showModal(t,m,w){
  const mt=$('modal-title'),txt=$('modal-text'),rm=$('result-modal'),av=$('modal-avatar'),mc=$('modal-chips');
  if(mt){mt.textContent=t;mt.className='modal-title '+(w?'win':'lose')}
  if(txt)txt.textContent=m;
  const ch=CHARACTERS[selectedChar];const emoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🎲';if(av){av.textContent=emoji}
  if(mc){mc.style.display='block';mc.textContent=w?'+10单位物资':'-10单位物资';mc.style.color=w?'var(--green)':'var(--accent)'}
  if(rm)rm.classList.add('open');
  if(w){startConfetti();checkFirstWin()}else{startScreenShake()}
  const expGain=w?(10+G.level*2):5;addExp(expGain);
  const ch2=CHARACTERS[selectedChar];if(ch2&&ch2.skills&&ch2.skills.find(s=>s.effect==='regen5'&&s.unlocked)){G.chips+=5;toast('壁虎再生：恢复5物资');updateChips();}
  if(!w){const ch3=CHARACTERS[selectedChar];if(ch3&&ch3.skills&&ch3.skills.find(s=>s.effect==='teamReward'&&s.unlocked)){const winner=G.players.find(p=>p.id!==G.myId&&p.chips>50);if(winner){const bonus=Math.floor(G.pot*0.1);if(bonus>0){G.chips+=bonus;toast(`忠诚：队友获胜，你获得${bonus}物资奖励`);updateChips();}}}}
  updateStreak(w);
  updateStats(G.gameType||'zjh',w);
  saveReplayFromGame(w);
}
function saveReplayFromGame(won){
  try{
    const players=G.players.map(p=>({name:p.name,emoji:''}));
    const actions=[];
    for(const logEntry of G.logs){
      const m=logEntry.m;
      if(m.includes('跟注')||m.includes('加注')||m.includes('梭哈')||m.includes('弃牌')||m.includes('要牌')||m.includes('停牌')||m.includes('分牌')||m.includes('双倍')||m.includes('保险')||m.includes('选大')||m.includes('选小')||m.includes('诈唬')||m.includes('看牌')){
        const name=m.split(' ')[0];
        const action=m.includes('跟注')?'跟注':m.includes('加注')?'加注':m.includes('梭哈')?'梭哈':m.includes('弃牌')?'弃牌':m.includes('要牌')?'要牌':m.includes('停牌')?'停牌':m.includes('分牌')?'分牌':m.includes('双倍')?'双倍':m.includes('保险')?'保险':m.includes('选大')?'选大':m.includes('选小')?'选小':m.includes('诈唬')?'诈唬':m.includes('看牌')?'看牌':'操作';
        actions.push({round:0,player:name,action,result:''});
      }
    }
    const winnerName=won?(G.players.find(p=>p.isMe)?.name||'你'):(G.players.find(p=>p.id!==G.myId)?.name||'对手');
    addReplay({date:Date.now(),gameType:G.gameType||'zjh',players,actions,winner:winnerName,pot:G.pot||0});
  }catch(e){console.warn('saveReplay failed',e)}
}
function showEmoteWheel(){
  const existing=$('emote-wheel');if(existing)return;
  const div=document.createElement('div');div.id='emote-wheel';
  div.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:100;display:flex;gap:8px;background:rgba(0,0,0,.8);border:1px solid var(--gold);padding:8px 12px;border-radius:8px';
  const emotes=[{e:'👋',n:'挥手'},{e:'💃',n:'跳舞'},{e:'🧘',n:'坐下'},{e:'😂',n:'大笑'},{e:'👍',n:'点赞'}];
  div.innerHTML=emotes.map(em=>`<button onclick="sendEmote('${em.e}')" style="background:transparent;border:1px solid var(--border);border-radius:4px;padding:6px 10px;color:var(--text);font-size:18px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px"><span>${em.e}</span><span style="font-size:9px;color:var(--dim)">${em.n}</span></button>`).join('');
  document.body.appendChild(div);
  setTimeout(()=>{if($('emote-wheel'))closeEmoteWheel()},5000);
}
function closeEmoteWheel(){const e=$('emote-wheel');if(e)e.remove()}
function sendEmote(emoji){
  closeEmoteWheel();
  Lobby.me.reaction=emoji;Lobby.me.reactionTime=Date.now();
  Lobby.me.animState='interact';Lobby.me.animTimer=0.5;
  if(G.mqtt&&G.mqttConnected){
    const ch=CHARACTERS[selectedChar];const myEmoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🐦';
    G.mqtt.publish(TOPIC_CHAT,JSON.stringify({id:G.myId,name:G.user,text:emoji,emoji:myEmoji,ts:Date.now(),isEmote:true}),{qos:0});
  }
  Sound.click();
}
function sitOnBench(){
  if(!Lobby)return;
  let nearBench=null;let minDist=Infinity;
  for(const b of Lobby.benches){const dx=b.x-Lobby.me.x,dy=b.y-Lobby.me.y;const dist=Math.sqrt(dx*dx+dy*dy);if(dist<40&&dist<minDist){minDist=dist;nearBench=b}}
  if(nearBench){Lobby.me.sitting=true;Lobby.me.moving=false;Lobby.me.emoji='🧘';Lobby.me.x=nearBench.x;Lobby.me.y=nearBench.y;Lobby.broadcastPos();toast('已坐下（按Z键站起）');}
}
function closeModal(){
  const rm=$('result-modal');if(rm)rm.classList.remove('open');
  stopConfetti();stopScreenShake();
  if(G.gameOver){G.inGame=false;G.gameOver=false;G.resultShown=false;G.myTurn=false}
  Sound.stopRoomBGM();Sound.startAmbient(G.weather.type);
  if(G.roomCode){showScreen('main');showWaitPanel(G.isHost)}else{showScreen('main');renderLobby()}
}
let _confettiParticles=[],_confettiTimer=null,_shakeTimer=null;
function startConfetti(){
  stopConfetti();_confettiParticles=[];
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
function stopConfetti(){if(_confettiTimer){clearInterval(_confettiTimer);_confettiTimer=null}const c=$('confetti-canvas');if(c)c.remove();_confettiParticles=[]}
function startScreenShake(){
  if(_shakeTimer)return;
  let elapsed=0;
  _shakeTimer=setInterval(()=>{
    elapsed+=50;
    const intensity=Math.max(0,5-elapsed/400);
    const dx=(Math.random()-.5)*intensity*2;const dy=(Math.random()-.5)*intensity*2;
    document.body.style.transform=`translate(${dx}px,${dy}px)`;
    _tableShakeIntensity=intensity;
    if(elapsed>2000)stopScreenShake();
  },50);
}
function stopScreenShake(){if(_shakeTimer){clearInterval(_shakeTimer);_shakeTimer=null}document.body.style.transform='';_tableShakeIntensity=0;}
let _tableShakeIntensity=0;
function toast(msg){
  const existing=document.querySelectorAll('.toast');
  if(existing.length>=3)existing[0].remove();
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  const count=document.querySelectorAll('.toast').length;
  t.style.bottom=(30+count*45)+'px';
  document.body.appendChild(t);setTimeout(()=>{if(t.parentNode)t.remove()},3500);
}
function flashScreen(color='var(--gold)'){
  const f=document.createElement('div');
  f.style.cssText=`position:fixed;inset:0;background:${color};opacity:.1;pointer-events:none;z-index:5000;transition:opacity .3s`;
  document.body.appendChild(f);
  requestAnimationFrame(()=>{f.style.opacity='0';setTimeout(()=>f.remove(),300)});
}
function escHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

// ==================== 交易系统 (升华18) ====================
const TOPIC_TRADE = 'wl_trade_v6';
function getTradeTaxRate() {
  const ch = CHARACTERS[selectedChar];
  const hasTaxCut = ch && ch.skills && ch.skills.find(s => s.effect === 'taxCut' && s.unlocked);
  return hasTaxCut ? 0 : 0.05;
}
function requestTrade(toId) {
  if (G.inGame || G.roomCode) { toast('游戏房间内无法交易'); return; }
  if (!G.mqtt || !G.mqttConnected) { toast('信号未连接'); return; }
  const ch = CHARACTERS[selectedChar]; const emoji = ch && ch.skins ? ch.skins[G.skinIndex || 0] : ch?.emoji || '🐦';
  const msg = { type: 'request', fromId: G.myId, fromName: G.user, emoji, ts: Date.now() };
  G.mqtt.publish(`${TOPIC_TRADE}/${G.myId}/${toId}`, JSON.stringify(msg), { qos: 0 });
  toast('交易请求已发送，等待对方回应'); Sound.click();
}
function acceptTrade(fromId, fromName, emoji) {
  if (G.inGame || G.roomCode) { toast('游戏房间内无法交易'); return; }
  if (!G.mqtt || !G.mqttConnected) { toast('信号未连接'); return; }
  const ch = CHARACTERS[selectedChar]; const myEmoji = ch && ch.skins ? ch.skins[G.skinIndex || 0] : ch?.emoji || '🐦';
  const msg = { type: 'accept', fromId: G.myId, fromName: G.user, emoji: myEmoji, toId: fromId, ts: Date.now() };
  G.mqtt.publish(`${TOPIC_TRADE}/${G.myId}/${fromId}`, JSON.stringify(msg), { qos: 0 });
  openTradePanel(fromId, fromName, emoji, true);
}
function openTradePanel(peerId, peerName, peerEmoji, isInitiator) {
  G.tradeState = { peerId, peerName, peerEmoji, myOffer: 0, peerOffer: 0, myConfirm: false, peerConfirm: false, isInitiator };
  const div = document.createElement('div'); div.className = 'modal-overlay open'; div.id = 'trade-panel-modal';
  div.innerHTML = `<div class="modal" style="max-width:360px;text-align:center"><h3>交易</h3><div style="display:flex;gap:12px;justify-content:center;margin:12px 0"><div style="text-align:center"><div style="font-size:28px">${peerEmoji || '🐦'}</div><div style="font-size:12px">${escHTML(peerName)}</div><div style="font-size:11px;color:var(--dim)">提供: <span id="trade-peer-offer">0</span></div></div><div style="display:flex;align-items:center;font-size:20px;color:var(--gold)">⇄</div><div style="text-align:center"><div style="font-size:28px">${CHARACTERS[selectedChar]?.emoji || '🐦'}</div><div style="font-size:12px">你</div><div style="font-size:11px;color:var(--dim)">提供: <span id="trade-my-offer">0</span></div></div></div><div style="margin:12px 0"><input id="trade-input" class="auth-input" type="number" placeholder="输入交易数量" min="1" max="${G.chips}" style="text-align:center"><div style="font-size:10px;color:var(--dim);margin-top:4px">税费: ${Math.round(getTradeTaxRate() * 100)}% (最低1)</div></div><div style="display:flex;gap:10px;justify-content:center"><button class="action-btn" id="trade-confirm-btn" onclick="confirmTrade()">确认</button><button class="sm-btn btn-press" onclick="cancelTrade()">取消</button></div><div id="trade-status" style="font-size:11px;color:var(--dim);margin-top:8px">等待双方确认...</div></div>`;
  document.body.appendChild(div);
}
function updateTradeUI() {
  if (!G.tradeState) return;
  const myOfferEl = $('trade-my-offer'); if (myOfferEl) myOfferEl.textContent = G.tradeState.myOffer;
  const peerOfferEl = $('trade-peer-offer'); if (peerOfferEl) peerOfferEl.textContent = G.tradeState.peerOffer;
  const statusEl = $('trade-status'); if (statusEl) {
    if (G.tradeState.myConfirm && G.tradeState.peerConfirm) statusEl.textContent = '交易完成！';
    else if (G.tradeState.myConfirm) statusEl.textContent = '已确认，等待对方...';
    else if (G.tradeState.peerConfirm) statusEl.textContent = '对方已确认';
  }
}
function confirmTrade() {
  if (!G.tradeState) return;
  const input = $('trade-input');
  const amt = input ? parseInt(input.value) || 0 : 0;
  if (amt < 0 || amt > G.chips) { toast('物资不足或数量无效'); return; }
  G.tradeState.myOffer = amt;
  G.tradeState.myConfirm = true;
  updateTradeUI();
  if (!G.mqtt || !G.mqttConnected) return;
  const msg = { type: 'confirm', fromId: G.myId, offer: amt, ts: Date.now() };
  G.mqtt.publish(`${TOPIC_TRADE}/${G.myId}/${G.tradeState.peerId}`, JSON.stringify(msg), { qos: 0 });
  if (G.tradeState.peerConfirm) finalizeTrade();
}
function finalizeTrade() {
  if (!G.tradeState) return;
  const taxRate = getTradeTaxRate();
  const myGive = G.tradeState.myOffer;
  const peerGive = G.tradeState.peerOffer;
  const myTax = taxRate > 0 ? Math.max(1, Math.floor(peerGive * taxRate)) : 0;
  const peerTax = taxRate > 0 ? Math.max(1, Math.floor(myGive * taxRate)) : 0;
  G.chips = G.chips - myGive + (peerGive - myTax);
  updateChips(); save();
  toast(`交易完成！获得${peerGive - myTax}单位 (扣除税费${myTax})`);
  addMail({ type: 'trade', title: '交易完成', content: `你与 ${G.tradeState.peerName} 的交易已完成。你付出${myGive}，获得${peerGive - myTax} (税${myTax})`, from: '交易系统' });
  Sound.win();
  const modal = $('trade-panel-modal'); if (modal) modal.remove();
  G.tradeState = null;
}
function cancelTrade() {
  if (G.tradeState && G.mqtt && G.mqttConnected) {
    const msg = { type: 'cancel', fromId: G.myId, ts: Date.now() };
    G.mqtt.publish(`${TOPIC_TRADE}/${G.myId}/${G.tradeState.peerId}`, JSON.stringify(msg), { qos: 0 });
  }
  const modal = $('trade-panel-modal'); if (modal) modal.remove();
  G.tradeState = null; toast('交易已取消');
}
function handleTradeMsg(topic, payload) {
  try {
    const msg = JSON.parse(payload.toString());
    if (msg.fromId === G.myId) return;
    if (msg.type === 'request') {
      if (G.inGame || G.roomCode) return;
      if (confirm(`${msg.fromName || '某人'} 请求与你交易，是否接受？`)) { acceptTrade(msg.fromId, msg.fromName, msg.emoji); }
    } else if (msg.type === 'accept') {
      openTradePanel(msg.fromId, msg.fromName, msg.emoji, false);
    } else if (msg.type === 'confirm') {
      if (!G.tradeState) return;
      G.tradeState.peerOffer = msg.offer || 0;
      G.tradeState.peerConfirm = true;
      updateTradeUI();
      if (G.tradeState.myConfirm) finalizeTrade();
    } else if (msg.type === 'cancel') {
      const modal = $('trade-panel-modal'); if (modal) modal.remove();
      G.tradeState = null; toast('对方取消了交易');
    }
  } catch (e) { }
}

// ==================== 在线幸存者列表 ====================
function publishPresence(){
  if(!G.mqtt||!G.mqttConnected||!G.myId)return;
  const ch=CHARACTERS[selectedChar];const emoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🐦';
  const msg={type:'presence',id:G.myId,name:G.user||'幸存者',ts:Date.now(),roomCode:G.roomCode||null,emoji:emoji,chips:G.chips};
  G.mqtt.publish(TOPIC_PRESENCE,JSON.stringify(msg),{qos:0,retain:false});
}
function handlePresenceMsg(msg){
  if(!msg||!msg.id||msg.id===G.myId)return;
  if(Date.now()-msg.ts>45000)return;
  if(msg.type==='weather'){if(Lobby)Lobby.handleWeatherMsg(msg);return}
  if(msg.isNPC)return;
  const isNight=Lobby&&Lobby.gameTime!==undefined&&(Lobby.gameTime>=20||Lobby.gameTime<6);
  const isDangerous=isNight&&Math.random()<0.3;
  G.onlineUsers[msg.id]={name:msg.name,ts:msg.ts,room:msg.roomCode||msg.room||null,emoji:msg.emoji||'🐦',chips:msg.chips||0,dangerous:isDangerous};
  const fr=loadFriends().find(x=>x.id===msg.id);
  if(fr){updateFriendStatus(msg.id,msg.roomCode?'ingame':'online',msg.roomCode||null)}
  renderOnlineList();
}
function handleChatMsg(msg){
  if(!msg||!msg.id||msg.id===G.myId)return;
  if(Date.now()-msg.ts>10000)return;
  const chChat=CHARACTERS[selectedChar];const hasFarChat=chChat&&chChat.skills&&chChat.skills.find(s=>s.effect==='farChat'&&s.unlocked);
  const maxDist=hasFarChat?600:300;
  if(Lobby&&Lobby.others&&Lobby.me){
    const p=Lobby.others.get(msg.id);
    if(p){const dx=p.x-Lobby.me.x,dy=p.y-Lobby.me.y;if(Math.sqrt(dx*dx+dy*dy)>maxDist)return;p.reaction='💬';p.reactionTime=Date.now();}
  }
  toast(`${msg.name}: ${msg.text}`);
  Sound.chat();
}
function showChatBubble(id,name,text,emoji){
  if(!Lobby||!Lobby.others)return;
  const p=Lobby.others.get(id);if(!p)return;
  p.chatBubble={text,name,emoji,ts:Date.now()};
}
function toggleChat(){
  const bar=$('chat-bar');if(!bar)return;
  const isHidden=bar.style.display==='none'||!bar.style.display;
  bar.style.display=isHidden?'flex':'none';
  if(isHidden){$('chat-input').focus();Sound.click()}
}
function sendChat(){
  const input=$('chat-input');if(!input)return;
  const text=input.value.trim();if(!text)return;
  if(!G.mqtt||!G.mqttConnected){toast('信号未连接');return}
  const ch=CHARACTERS[selectedChar];const emoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🐦';
  const msg={id:G.myId,name:G.user,text,emoji:emoji,ts:Date.now()};
  try{G.mqtt.publish(TOPIC_CHAT,JSON.stringify(msg),{qos:0});}catch(e){toast('发送失败');return}
  input.value='';
  // 直接显示在自己的消息区域
  toast(`${G.user}: ${text}`);
  Sound.click();
  Lobby.me.reaction='💬';Lobby.me.reactionTime=Date.now();
}
let _onlineListTimer=null;
function renderOnlineList(){
  if(_onlineListTimer)return;
  _onlineListTimer=setTimeout(()=>{_onlineListTimer=null;_renderOnlineList()},200);
}
function _renderOnlineList(){
  const el=$('online-list');if(!el)return;
  const now=Date.now();
  for(const id in G.onlineUsers){if(now-G.onlineUsers[id].ts>45000)delete G.onlineUsers[id]}
  const users=Object.values(G.onlineUsers).sort((a,b)=>b.ts-a.ts);
  if(users.length===0){el.innerHTML='<div class="online-empty">暂无其他幸存者信号</div>';renderFavorites();return}
  el.innerHTML=users.map(u=>{
    const ago=Math.floor((now-u.ts)/1000);
    let timeStr;if(ago<5)timeStr='<span class="online-now">在线</span>';else if(ago<60)timeStr=`${ago}秒前`;else if(ago<3600)timeStr=`${Math.floor(ago/60)}分钟前`;else timeStr=`${Math.floor(ago/3600)}小时前`;
    const roomStr=u.room?`<span class="online-room">在${escHTML(u.room)}号桌</span>`:'<span class="online-room idle">在大厅闲逛</span>';
    const emoji=u.emoji||'🐦';
    const dangerTag=u.dangerous?'<span style="color:var(--accent);margin-left:4px">⚠️</span>':'';
    return`<div class="online-item" onclick="addFavorite('${u.id}','${escHTML(u.name)}','${emoji}')" style="cursor:pointer" title="点击收藏"><div class="online-avatar">${emoji}</div><div class="online-info"><div class="online-name">${escHTML(u.name)}${dangerTag}</div><div class="online-detail">${roomStr} · ${timeStr}</div></div></div>`;
  }).join('');
  renderFavorites();
}

// ==================== 登录 ====================
let _nameDebounceTimer=null;
function validateNameInput(){
  const an=$('auth-name');if(!an)return false;
  const n=an.value.trim();const hint=$('auth-hint');
  if(!n){if(hint){hint.textContent='代号不能为空';hint.style.color='var(--accent)'}return false}
  if(n.length>12){if(hint){hint.textContent='代号最多12个字符';hint.style.color='var(--accent)'}return false}
  if(hint){hint.textContent=''}
  return true;
}
function renderCharSelector(){
  const container=$('char-selector');if(!container)return;
  let html='';
  for(let i=0;i<CHARACTERS.length;i++){
    const c=CHARACTERS[i];const sel=i===selectedChar?'selected':'';
    const emoji=c&&c.skins?c.skins[G.skinIndex||0]:c?.emoji||'🐦';
    html+=`<div class="char-opt ${sel}" onclick="selectChar(${i})" data-index="${i}"><div class="char-emoji">${emoji}</div><div class="char-name">${c.name}</div><div class="char-desc">${c.desc}</div></div>`;
  }
  container.innerHTML=html;
}
function selectChar(idx){
  selectedChar=idx;renderCharSelector();
  const c=CHARACTERS[idx];const emoji=c&&c.skins?c.skins[G.skinIndex||0]:c?.emoji||'🐦';if(Lobby.me)Lobby.me.emoji=emoji;
  if(G.mqttConnected)publishPresence();
}
const _authName=$('auth-name');if(_authName){
  _authName.oninput=()=>{if(_nameDebounceTimer)clearTimeout(_nameDebounceTimer);_nameDebounceTimer=setTimeout(validateNameInput,150)};
  _authName.onkeydown=(e)=>{if(e.key==='Enter'){const ab=$('auth-btn');if(ab)ab.click()}};
}
const _authBtn=$('auth-btn');if(_authBtn){
  _authBtn.onclick=()=>{
    if(!validateNameInput())return;
    const n=$('auth-name').value.trim();G.user=n;
    if(!load()){G.chips=50;G.level=1;G.exp=0;G.stats={luck:10,charm:10,agility:10};G.skinIndex=0}G.myId=genId();save();
    const un=$('user-name');if(un)un.textContent=n;updateChips();showScreen('main');initMQTT();G.inventory=loadInventory();updateMailBadge();updateFriendCountUI();
  };
}
function logout(){cleanupAll();G.user=null;G.onlineUsers={};try{localStorage.removeItem('wl_user')}catch(e){}showScreen('auth')}
if(load()){G.myId=genId();refreshSkills();updateLevelPanel();const un=$('user-name');if(un)un.textContent=G.user;updateChips();showScreen('main');initMQTT();G.inventory=loadInventory();updateMailBadge();updateFriendCountUI();}else{hideLoading()}

// ==================== MQTT ====================
function initMQTT(){
  if(G.mqtt)return;
  try{
    G.mqtt=mqtt.connect(MQTT_BROKER,{clientId:'wl_'+(G.myId||genId()),clean:true,connectTimeout:10000,reconnectPeriod:3000,keepalive:60});
    G.mqtt.on('connect',()=>{
      G.mqttConnected=true;console.log('[MQTT] connected');
      const od=$('online-dot'),cs=$('conn-status');
      if(od)od.classList.remove('off');if(cs){cs.textContent='信号正常';cs.style.color='var(--green)'}
      G.mqtt.subscribe(TOPIC_LOBBY,{qos:0});G.mqtt.subscribe(TOPIC_ROOMS,{qos:0});G.mqtt.subscribe(TOPIC_PRESENCE,{qos:0});G.mqtt.subscribe(TOPIC_CHAT,{qos:0});G.mqtt.subscribe(`${TOPIC_WHISPER}/+/${G.myId}`,{qos:0});G.mqtt.subscribe(`${TOPIC_TRADE}/+/${G.myId}`,{qos:0});const g=getMyGuild();if(g)G.mqtt.subscribe(`${TOPIC_GUILD_CHAT}/${g.tag}`,{qos:0});
      subscribeLobbyPos();
      if(G.roomCode){G.mqtt.subscribe(roomTopic(G.roomCode),{qos:0});if(G.isHost)publishRoomInfo()}
      publishPresence();startPresence();Sound.startBGM();checkRelief();
    });
    G.mqtt.on('message',(topic,payload)=>{
      try{
        const raw=payload.toString();if(!raw)return;
        const msg=JSON.parse(raw);
        if(topic===TOPIC_LOBBY){handleLobbyMsg(msg)}
        else if(topic===TOPIC_PRESENCE){handlePresenceMsg(msg)}
        else if(topic.startsWith(TOPIC_ROOM_PREFIX+'_chat/')){handleRoomMsg(msg)}
        else if(topic.startsWith(TOPIC_ROOM_PREFIX+'/')&&!topic.includes('_chat')){const code=topic.split('/').pop();handleRoomListMsg(code,msg)}
        else if(topic.startsWith('wl_pos_v6/')){const fromId=topic.split('/')[1];if(fromId!==G.myId)try{Lobby.handlePos(msg,fromId)}catch(e){}}
        else if(topic===TOPIC_CHAT){handleChatMsg(msg)}
        else if(topic.startsWith(TOPIC_WHISPER+'/')){handleWhisperMsg(topic,payload)}
        else if(topic.startsWith(TOPIC_TRADE+'/')){handleTradeMsg(topic,payload)}
        else if(topic.startsWith(TOPIC_GUILD_CHAT+'/')){handleGuildChatMsg(msg)}
      }catch(e){console.warn('[MQTT] msg error:',e)}
    });
    G.mqtt.on('error',(err)=>{console.warn('[MQTT] error:',err.message);G.mqttConnected=false;const od=$('online-dot'),cs=$('conn-status');if(od)od.classList.add('off');if(cs){cs.textContent='信号异常';cs.style.color='var(--accent)'}});
    G.mqtt.on('reconnect',()=>{console.log('[MQTT] reconnecting...')});
    G.mqtt.on('close',()=>{G.mqttConnected=false;const od=$('online-dot'),cs=$('conn-status');if(od)od.classList.add('off');if(cs){cs.textContent='信号断开';cs.style.color='var(--accent)'}});
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
  let out;try{out=JSON.parse(JSON.stringify(msg))}catch(e){out={...msg}}
  out._from=G.myId;out._fromName=G.user;out._seq=++G.msgSeq;
  try{G.mqtt.publish(roomTopic(G.roomCode),JSON.stringify(out),{qos:0})}catch(e){console.warn('[publishRoom] failed',e)}
}

// ==================== 在线心跳 ====================
function startPresence(){stopPresence();G.presenceTimer=setInterval(()=>{if(document.hidden)return;publishPresence();const now=Date.now();let changed=false;for(const id in G.onlineUsers){if(now-G.onlineUsers[id].ts>45000){delete G.onlineUsers[id];changed=true}}if(changed)renderOnlineList()},10000)}
function stopPresence(){if(G.presenceTimer){clearInterval(G.presenceTimer);G.presenceTimer=null}}

// ==================== 房间列表 ====================
function handleRoomListMsg(code,msg){if(!msg||!msg.code)return;if(msg.hostId===G.myId)return;if(msg.ts&&Date.now()-msg.ts>60000)return;G.knownRooms[msg.code]={name:msg.hostName,game:msg.game,players:msg.players||1,ts:msg.ts||Date.now()};renderLobby()}

// ==================== 大厅事件 ====================
function handleLobbyMsg(msg){
  if(msg.hostId===G.myId)return;if(msg.ts&&Date.now()-msg.ts>30000)return;
  switch(msg.action){
    case 'create':G.knownRooms[msg.code]={name:msg.hostName,game:msg.game,players:msg.players||1,ts:msg.ts||Date.now()};renderLobby();break;
    case 'update':if(G.knownRooms[msg.code]){G.knownRooms[msg.code].players=msg.players;G.knownRooms[msg.code].ts=msg.ts||Date.now()}renderLobby();break;
    case 'close':delete G.knownRooms[msg.code];renderLobby();break;
  }
}

// ==================== 房间消息 ====================
function handleRoomMsg(msg){
  if(msg._from===G.myId)return;console.log('[RoomMsg]',msg.type);
  switch(msg.type){
    case 'join':
      if(!G.isHost)return;if(G.roomPeers.find(p=>p.id===msg.playerId))return;if(G.roomPeers.length>=MAX_SEATS){publishRoom({type:'full',targetId:msg.playerId});return}
      G.roomPeers.push({id:msg.playerId,name:msg.playerName});updateWaitPlayers();publishRoomInfo();publishLobby('update');publishPresence();
      publishRoom({type:'welcome',targetId:msg.playerId,players:G.roomPeers.filter(p=>p.id!==G.myId).map(p=>({id:p.id,name:p.name})),hostName:G.user,game:G.gameType,roomCode:G.roomCode,inGame:G.inGame,gameState:G.inGame?serializeGameState():null});
      toast(msg.playerName+' 到达了牌桌');break;
    case 'spectate':
      if(!G.isHost)return;if(G.spectators.length>=2){publishRoom({type:'spectate-full',targetId:msg.playerId});return}
      if(!G.spectators.find(s=>s.id===msg.playerId)){G.spectators.push({id:msg.playerId,name:msg.playerName});}
      publishRoom({type:'spectate-welcome',targetId:msg.playerId,players:G.roomPeers.map(p=>({id:p.id,name:p.name})),hostName:G.user,game:G.gameType,roomCode:G.roomCode,inGame:G.inGame,gameState:G.inGame?serializeGameState():null,spectators:G.spectators.filter(s=>s.id!==msg.playerId).map(s=>({id:s.id,name:s.name}))});
      toast(msg.playerName+' 开始观战');break;
    case 'spectate-full':if(msg.targetId===G.myId){toast('观战席已满');G.isSpectator=false;}break;
    case 'spectate-welcome':
      if(msg.targetId!==G.myId)return;G.isHost=false;G.isSpectator=true;G.gameType=msg.game;G.roomCode=msg.roomCode;
      G.roomPeers=[{id:'host',name:msg.hostName}];for(const p of msg.players){if(p.id!=='host')G.roomPeers.push({id:p.id,name:p.name})}
      G.spectators=(msg.spectators||[]).map(s=>({id:s.id,name:s.name}));
      if(msg.inGame&&msg.gameState){deserializeGameState(msg.gameState);showScreen('game');$('game-title').textContent=G.gameType==='zjh'?'物资炸金花':(G.gameType==='bj'?'物资二十一点':'骰子猜大小');renderTable()}else{showScreen('main');showWaitPanel(false)}
      publishPresence();toast('已进入观战模式');break;
    case 'spectate-leave':
      if(!G.isHost)return;G.spectators=G.spectators.filter(s=>s.id!==msg.playerId);break;
    case 'spectate-chat':
      if(!msg.text)return;log(`[观战] ${msg.playerName}: ${msg.text}`,'system');break;
    case 'full':if(msg.targetId===G.myId){const code=G.roomCode;G.roomCode=null;G.isHost=false;try{G.mqtt.unsubscribe(roomTopic(code))}catch(e){}renderLobby();toast('牌桌已满')}break;
    case 'welcome':
      if(msg.targetId!==G.myId)return;G.isHost=false;G.gameType=msg.game;G.roomCode=msg.roomCode;
      G.roomPeers=[{id:'host',name:msg.hostName}];for(const p of msg.players){if(p.id!=='host')G.roomPeers.push({id:p.id,name:p.name})}
      if(msg.inGame&&msg.gameState){deserializeGameState(msg.gameState);showScreen('game');$('game-title').textContent=G.gameType==='zjh'?'物资炸金花':(G.gameType==='bj'?'物资二十一点':'骰子猜大小');renderTable()}else{showScreen('main');showWaitPanel(false)}
      publishPresence();toast('已到达牌桌');break;
    case 'leave':if(!G.isHost)return;G.roomPeers=G.roomPeers.filter(p=>p.id!==msg.playerId);updateWaitPlayers();publishRoomInfo();publishLobby('update');toast(msg.playerName+' 离开了牌桌');break;
    case 'start-game':
      resetGameState();G.gameType=msg.game;G.inGame=true;G.gameOver=false;G.myTurn=false;G.resultShown=false;
      G.deck=msg.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));G.players=msg.players.map(p=>({...p,cards:p.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),isMe:p.id===G.myId,hands:p.hands?p.hands.map(h=>h.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}))):null,currentHand:p.currentHand||0}));
      G.pot=msg.pot;G.currentBet=msg.currentBet;G.playerOrder=msg.playerOrder||G.players.map(p=>p.id);G.turnIndex=msg.turnIndex||0;G.roundCount=0;G.diceState=msg.diceState||{dice:[null,null,null],sum:0,phase:'bet'};G.diceJackpot=msg.diceJackpot||0;G.diceJackpotStreak=msg.diceJackpotStreak||0;
      if(msg.spectators)G.spectators=msg.spectators.map(s=>({id:s.id,name:s.name}));
      checkMyTurn();showScreen('game');$('game-title').textContent=msg.game==='zjh'?'物资炸金花':(msg.game==='bj'?'物资二十一点':'骰子猜大小');
      clearLog();log('=== 牌局开始，物资已入底池 ===','system');Sound.deal();Sound.startRoomBGM(msg.game);startCandle();renderTable();break;
    case 'action':handleRemoteAction(msg);break;
    case 'turn':G.turnIndex=msg.turnIndex;G.playerOrder=msg.playerOrder;checkMyTurn();renderTable();break;
    case 'result':{
      if(G.resultShown)return;if(!G.roomCode)return;G.resultShown=true;G.gameOver=true;stopCandle();
      const isMe=msg.winnerId===G.myId;const isRefund=msg.winnerId===null;
      const title=isRefund?'底池退还':(isMe?'物资归你':'物资被收走');showModal(title,msg.text,isMe||isRefund);
      if(msg.players){for(const rp of msg.players){const lp=G.players.find(p=>p.id===rp.id);if(lp)lp.chips=rp.chips}}
      if(msg.diceResult)G.diceState={dice:msg.diceResult.dice,sum:msg.diceResult.sum,phase:'result'};
      if(msg.diceJackpot!==undefined)G.diceJackpot=msg.diceJackpot;
      if(msg.diceJackpotStreak!==undefined)G.diceJackpotStreak=msg.diceJackpotStreak;
      G.inGame=true;renderTable();break;
    }
    case 'game-leave':{
      if(!G.isHost)return;const leaving=G.players.find(p=>p.id===msg.playerId);if(leaving){leaving.folded=true;log(leaving.name+' 撤离了牌桌','system');if(G.gameType==='zjh')checkZJHEnd();else if(G.gameType==='bj')checkBJEnd();else if(G.gameType==='dice')checkDiceEnd()}break;
    }
  }
}
function serializeGameState(){
  return{gameType:G.gameType,deck:G.deck,pot:G.pot,currentBet:G.currentBet,players:G.players.map(p=>({id:p.id,name:p.name,cards:p.cards,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,stood:p.stood,choice:p.choice,hands:p.hands?p.hands.map(h=>h.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}))):null,currentHand:p.currentHand||0})),playerOrder:G.playerOrder,turnIndex:G.turnIndex,gameOver:G.gameOver,roundCount:G.roundCount,diceState:{dice:[...G.diceState.dice],sum:G.diceState.sum,phase:G.diceState.phase},diceJackpot:G.diceJackpot,diceJackpotStreak:G.diceJackpotStreak,spectators:G.spectators};
}
function deserializeGameState(state){
  if(!state||!state.players||!state.players.length){G.inGame=false;return}
  G.gameType=state.gameType;G.deck=(state.deck||[]).map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}));G.pot=state.pot||0;G.currentBet=state.currentBet||0;
  G.players=state.players.map(p=>({...p,cards:(p.cards||[]).map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),isMe:p.id===G.myId,hands:p.hands?p.hands.map(h=>h.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}))):null,currentHand:p.currentHand||0}));
  G.playerOrder=state.playerOrder||[];G.turnIndex=state.turnIndex||0;G.gameOver=!!state.gameOver;G.roundCount=state.roundCount||0;
  G.diceState=state.diceState?{dice:[...state.diceState.dice],sum:state.diceState.sum,phase:state.diceState.phase}:{dice:[null,null,null],sum:0,phase:'bet'};
  G.diceJackpot=state.diceJackpot||0;G.diceJackpotStreak=state.diceJackpotStreak||0;
  G.spectators=state.spectators||[];
  _lastRenderHash='';G.inGame=!G.gameOver;checkMyTurn();
}

// ==================== 心跳 ====================
function startHeartbeat(){stopHeartbeat();G.heartbeatTimer=setInterval(()=>{if(G.roomCode&&G.isHost&&G.mqttConnected){publishRoomInfo();publishLobby('update')}const now=Date.now();let changed=false;for(const code in G.knownRooms){if(now-G.knownRooms[code].ts>30000){delete G.knownRooms[code];changed=true}}if(changed)renderLobby()},5000)}
function stopHeartbeat(){if(G.heartbeatTimer){clearInterval(G.heartbeatTimer);G.heartbeatTimer=null}}

// ==================== 蜡烛 ====================
function startCandle(){stopCandle();G.candleTime=G.candleMax;updateCandleUI();G.candleTimer=setInterval(()=>{G.candleTime--;updateCandleUI();if(G.candleTime<=0){stopCandle();if(!G.gameOver){G.gameOver=true;log('蜡烛烧尽！强制结算！','system');if(G.isHost)hostForceSettle()}}},1000)}
function stopCandle(){if(G.candleTimer){clearInterval(G.candleTimer);G.candleTimer=null}}
function updateCandleUI(){const pct=Math.max(0,(G.candleTime/G.candleMax)*100);const fill=$('candle-fill');if(fill)fill.style.width=pct+'%';const m=Math.floor(G.candleTime/60),s=G.candleTime%60;const label=$('candle-label');if(label)label.textContent=`蜡烛剩余 ${m}:${s.toString().padStart(2,'0')}`}
function hostForceSettle(){
  if(G.gameType==='dice'){forceSettleDice();return}
  const active=G.players.filter(p=>!p.folded&&!p.busted);
  if(active.length===0){const share=Math.floor(G.pot/G.players.length);G.players.forEach(p=>p.chips+=share);G.pot=0;publishRoom({type:'result',text:'蜡烛烧尽！所有幸存者平分底池',winnerId:null,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal('蜡烛烧尽','底池物资已平分退还',false);return}
  let best=active[0];if(G.gameType==='zjh'){for(let i=1;i<active.length;i++){if(evalZJH(active[i].cards).val>evalZJH(best.cards).val)best=active[i]}}else{for(let i=1;i<active.length;i++){if(bjValue(active[i].cards)>bjValue(best.cards))best=active[i]}}
  best.chips+=G.pot;const isMe=best.isMe;publishRoom({type:'result',text:`蜡烛烧尽！${best.name} 获得底池 ${G.pot} 单位`,winnerId:best.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal('蜡烛烧尽',isMe?`你获得底池 ${G.pot} 单位`:`${best.name} 获得底池 ${G.pot} 单位`,isMe);renderTable();
}
function forceSettleDice(){
  if(G.pot<=0){G.gameOver=true;stopCandle();publishRoom({type:'result',text:'蜡烛烧尽！底池为空，无人获胜',winnerId:null,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal('蜡烛烧尽','底池为空，无人获胜',false);renderTable();return}
  const unchosen=G.players.filter(p=>!p.choice);if(unchosen.length>0){const choosers=G.players.filter(p=>p.choice);if(choosers.length>0){const sharePayout=Math.floor(G.pot/choosers.length);for(const p of choosers)p.chips+=sharePayout}G.pot=0}else{checkDiceEnd();return}
  G.gameOver=true;stopCandle();Sound.lose();publishRoom({type:'result',text:'蜡烛烧尽！未选择大小的人输掉注金',winnerId:null,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal('蜡烛烧尽','未选择大小的幸存者输掉注金',false);renderTable();
}

// ==================== 大厅渲染 ====================
let _lobbyTimer=null;
function renderLobby(){if(_lobbyTimer)return;_lobbyTimer=setTimeout(()=>{_lobbyTimer=null;_renderLobby()},100)}
function _renderLobby(){
  const grid=$('tables-grid');if(!grid)return;
  const rooms={};for(const code in G.knownRooms){const r=G.knownRooms[code];if(Date.now()-r.ts>30000){delete G.knownRooms[code];continue}rooms[code]=r}
  if(G.isHost&&G.roomCode){rooms[G.roomCode]={name:G.user,game:G.gameType,players:G.roomPeers.length,ts:Date.now(),isMine:true}}
  const codes=Object.keys(rooms);if(codes.length===0){grid.innerHTML=`<div class="empty-lobby"><div class="icon">🏚️</div><p>仓储区还没有牌桌</p><p style="font-size:11px">点击"搭新桌"开始，等其他人来</p></div>`;return}
  grid.innerHTML=codes.map(code=>{const r=rooms[code];return renderTableCard(code,r.game,r.name,r.players,MAX_SEATS,!!r.isMine)}).join('');
}
function renderTableCard(code,gameType,hostName,playerCount,maxSeats,isMyTable){
  const safeCode=code.replace(/[^A-Z0-9]/g,'');const displayCode=escHTML(safeCode);
  const label=gameType==='zjh'?'物资炸金花':(gameType==='bj'?'物资二十一点':'骰子猜大小');
  const icon=gameType==='zjh'?'🥫':(gameType==='bj'?'⛽':'🎲');
  const tier=gameType==='zjh'?'低端局 · 罐头级':(gameType==='bj'?'中端局 · 汽油级':'最低端局 · 火柴级');
  let seats='';const count=Math.min(playerCount,maxSeats);
  for(let i=0;i<maxSeats;i++){if(i===0)seats+=`<div class="seat occupied"><div class="seat-dot"></div>${escHTML(hostName)}(搭桌人)</div>`;else if(i<count)seats+=`<div class="seat occupied"><div class="seat-dot"></div>幸存者</div>`;else seats+=`<div class="seat empty"><div class="seat-dot"></div>空位</div>`}
  const statusClass=count>=2?'playing':'waiting';const statusText=count>=maxSeats?'已满':count>=2?'可开局':'等待中';
  const clickHandler=isMyTable?'showWaitPanel(true)':`joinTableByCode('${safeCode}')`;
  return `<div class="table-card ${count>=maxSeats?'full':''}" onclick="${clickHandler}"><div class="table-visual"><div class="candle-glow"></div><div class="seats">${seats}</div></div><div class="table-info"><div class="table-name"><span>${icon} ${displayCode}号桌</span><span class="table-status ${statusClass}">${statusText}</span></div><div class="table-game">${label} · ${tier}</div><div class="table-meta"><div class="table-players">${count}/${maxSeats} 人</div></div></div></div>`;
}

// ==================== 创建牌桌 ====================
function showCreateModal(){const m=$('create-modal');if(m)m.classList.add('open')}
function hideCreateModal(){const m=$('create-modal');if(m)m.classList.remove('open')}
function selectGame(type,el){G.createGameType=type;document.querySelectorAll('.game-opt').forEach(e=>e.classList.remove('selected'));if(el)el.classList.add('selected')}
function doCreateTable(){hideCreateModal();createRoom(G.createGameType)}
function createRoom(gameType){
  if(G.roomCode)cleanupRoom();G.gameType=gameType;G.isHost=true;G.roomCode=genCode();G.roomPeers=[{id:G.myId,name:G.user}];
  if(G.mqtt&&G.mqttConnected)G.mqtt.subscribe(roomTopic(G.roomCode),{qos:0});publishRoomInfo();publishLobby('create');publishPresence();startHeartbeat();showScreen('main');showWaitPanel(true);renderLobby();toast('牌桌已搭好！等待其他幸存者');
}

// ==================== 等待面板 ====================
function showWaitPanel(isHost){
  const wp=$('wait-panel'),wt=$('wait-title');if(wp)wp.style.display='block';if(wt)wt.textContent=isHost?'你的牌桌':'已到达牌桌';updateWaitPlayers();
  const sb=$('start-btn'),cb=$('close-btn');if(isHost){if(sb){sb.style.display='inline-block';sb.disabled=G.roomPeers.length<2;sb.textContent=G.roomPeers.length>=2?`开局 (${G.roomPeers.length}人)`:'等待幸存者... (至少2人)'}if(cb){cb.textContent='撤掉牌桌';cb.onclick=()=>closeRoom()}}else{if(sb)sb.style.display='none';if(cb){cb.textContent='离开牌桌';cb.onclick=()=>leaveRoom()}}
}
function updateWaitPlayers(){
  const el=$('wait-players');if(!el)return;
  el.innerHTML=G.roomPeers.map(p=>{const isHostPlayer=(G.isHost&&p.id===G.myId)||(!G.isHost&&p.id==='host');const isMe=p.id===G.myId;const emoji=p.emoji||CHARACTERS[selectedChar]?.emoji||'🐦';return`<div class="wait-player"><div class="dot"></div><div class="name">${emoji} ${escHTML(p.name)}${isHostPlayer?' (搭桌人)':''}</div><div class="tag">${isMe?'已连接':'已到达'}</div></div>`}).join('');
  if(G.isHost){const c=G.roomPeers.length;const sb=$('start-btn');if(sb){sb.disabled=c<2;sb.textContent=c>=2?`开局 (${c}人)`:'等待幸存者... (至少2人)'}}renderLobby();
}
function refreshSkills(){
  for(const ch of CHARACTERS){if(!ch.skills)continue;ch.skills[0].unlocked=G.level>=5;ch.skills[1].unlocked=G.level>=10;}
}

// ==================== 加入牌桌 ====================
function joinTableByCode(code){
  if(G.inGame){toast('你正在牌局中，先撤离');return}
  if(G.isHost&&G.roomCode===code){showScreen('main');showWaitPanel(true);return}
  if(G.roomCode&&!G.isHost){toast('你已在某张牌桌上');return}
  if(G.roomCode)cleanupRoom();G.roomCode=code;G.isHost=false;G.isSpectator=false;toast('正在前往'+code+'号桌...');
  if(G.mqtt&&G.mqttConnected){G.mqtt.subscribe(roomTopic(code),{qos:0},(err)=>{if(err){toast('无法连接到该牌桌');G.roomCode=null;return}publishRoom({type:'join',playerId:G.myId,playerName:G.user});toast('已连接到'+code+'号桌，等待搭桌人响应...')})}else{toast('信号未就绪，请稍后重试');G.roomCode=null}
}
function spectateTableByCode(code){
  if(G.inGame){toast('你正在牌局中，先撤离');return}
  if(G.roomCode)cleanupRoom();G.roomCode=code;G.isHost=false;G.isSpectator=true;toast('正在前往'+code+'号桌观战...');
  if(G.mqtt&&G.mqttConnected){G.mqtt.subscribe(roomTopic(code),{qos:0},(err)=>{if(err){toast('无法连接到该牌桌');G.roomCode=null;return}publishRoom({type:'spectate',playerId:G.myId,playerName:G.user});toast('已连接到'+code+'号桌，等待观战响应...')})}else{toast('信号未就绪，请稍后重试');G.roomCode=null}
}
function sendSpectatorChat(){
  const input=$('chat-input');if(!input)return;
  const text=input.value.trim();if(!text)return;
  if(!G.mqtt||!G.mqttConnected){toast('信号未连接');return}
  G.mqtt.publish(roomTopic(G.roomCode),JSON.stringify({type:'spectate-chat',playerId:G.myId,playerName:G.user,text}),{qos:0});
  input.value='';
  log(`[观战] 你: ${text}`,'system');
  Sound.click();
}
function leaveSpectate(){
  if(!G.roomCode)return;publishRoom({type:'spectate-leave',playerId:G.myId,playerName:G.user});
  if(G.mqtt&&G.mqttConnected){try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}}
  G.roomPeers=[];G.roomCode=null;G.isHost=false;G.isSpectator=false;G.inGame=false;G.gameOver=false;G.myTurn=false;G.resultShown=false;stopCandle();stopHeartbeat();
  Sound.stopRoomBGM();Sound.startAmbient(G.weather.type);
  const wp=$('wait-panel');if(wp)wp.style.display='none';showScreen('main');publishPresence();renderLobby();toast('已离开观战');
}

// ==================== 离开/关闭 ====================
function leaveRoom(){
  if(!G.roomCode)return;publishRoom({type:'leave',playerId:G.myId,playerName:G.user});
  if(G.mqtt&&G.mqttConnected){try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}}
  G.roomPeers=[];G.roomCode=null;G.isHost=false;G.isSpectator=false;G.inGame=false;G.gameOver=false;G.myTurn=false;G.resultShown=false;stopCandle();stopHeartbeat();
  Sound.stopRoomBGM();Sound.startAmbient(G.weather.type);
  const wp=$('wait-panel');if(wp)wp.style.display='none';showScreen('main');publishPresence();renderLobby();toast('已离开牌桌');
}
function closeRoom(){
  const wp=$('wait-panel');if(wp)wp.style.display='none';cleanupRoom();showScreen('main');renderLobby();
}
function cleanupRoom(){
  stopHeartbeat();if(G.roomCode){publishLobby('close');clearRoomInfo();publishRoom({type:'leave',playerId:G.myId,playerName:G.user});if(G.mqtt&&G.mqttConnected){try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}}delete G.knownRooms[G.roomCode]}
  G.roomPeers=[];G.roomCode=null;G.isHost=false;G.isSpectator=false;G.inGame=false;G.gameOver=false;G.myTurn=false;G.resultShown=false;stopCandle();publishPresence();
}
function cleanupAll(){
  cleanupRoom();stopPresence();
  try{Sound.stopAmbient();Sound.stopBGM();Sound.stopRoomBGM()}catch(e){}
  if(G._roomCleanupTimer){clearInterval(G._roomCleanupTimer);G._roomCleanupTimer=null}
  if(Lobby.animId){Lobby.stop()}if(G.mqtt){try{G.mqtt.end(true)}catch(e){}G.mqtt=null}G.mqttConnected=false;
}

// ==================== 开始游戏 ====================
function hostStartGame(){
  resetGameState();if(!G.isHost||G.roomPeers.length<2)return;if(!G.mqttConnected){toast('信号断开，无法开局');return}
  const deck=makeDeck();const players=[];G.playerOrder=G.roomPeers.map(p=>p.id);
  const chStart=CHARACTERS[selectedChar];const hasHoard=chStart&&chStart.skills&&chStart.skills.find(s=>s.effect==='hoard20'&&s.unlocked);
  const startChips=hasHoard?70:50;
  const guildBuff=getGuildBuff();
  if(guildBuff>0){toast(`阵营buff激活！幸运+${guildBuff}`);G.tempLuckBonus+=guildBuff;}
  if(G.gameType==='zjh'){const table=Lobby&&Lobby.tables.find(t=>t.code===G.roomCode);const regionMult=table&&table.region==='black'?2:1;const baseBet=5*regionMult;for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,cards:[deck.pop(),deck.pop(),deck.pop()],chips:startChips,bet:baseBet,folded:false,seen:false,bluffed:false,darkBet:false,isMe:false});G.pot=players.length*baseBet;G.currentBet=baseBet}
  else if(G.gameType==='bj'){for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,cards:[deck.pop(),deck.pop()],chips:startChips,bet:10,busted:false,stood:false,isMe:false,hands:null,currentHand:0,doubled:false,insured:false});G.pot=players.length*10;G.currentBet=10;for(const p of players){if(bjValue(p.cards)===21){p.stood=true;log(p.name+' 天然21点！','system')}}}
  else if(G.gameType==='dice'){for(const rp of G.roomPeers)players.push({id:rp.id,name:rp.name,chips:startChips,bet:5,folded:false,choice:null,isMe:false});G.pot=players.length*5;G.currentBet=5;G.diceState={dice:[null,null,null],sum:0,phase:'bet'};const jackpotFee=players.length;G.diceJackpot+=jackpotFee;for(const p of players)p.chips-=1;G.pot-=jackpotFee;G.diceJackpotStreak=0;}
  G.players=players;G.gameOver=false;G.inGame=true;G.turnIndex=0;G.roundCount=0;G.resultShown=false;
  const gameMsg={type:'start-game',game:G.gameType,deck:deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),players:players.map(pl=>({id:pl.id,name:pl.name,cards:pl.cards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})),chips:pl.chips,bet:pl.bet,folded:pl.folded,seen:pl.seen,busted:pl.busted,stood:pl.stood,choice:pl.choice,hands:pl.hands,currentHand:pl.currentHand,doubled:pl.doubled,insured:pl.insured})),pot:G.pot,currentBet:G.currentBet,playerOrder:G.playerOrder,turnIndex:0,diceState:G.diceState,diceJackpot:G.diceJackpot,diceJackpotStreak:G.diceJackpotStreak,spectators:G.spectators};
  publishRoom(gameMsg);G.players.forEach(pl=>{pl.isMe=pl.id===G.myId});checkMyTurn();const wp=$('wait-panel');if(wp)wp.style.display='none';showScreen('game');const gt=$('game-title');if(gt)gt.textContent=G.gameType==='zjh'?'物资炸金花':(G.gameType==='bj'?'物资二十一点':'骰子猜大小');clearLog();log('=== 牌局开始，物资已入底池 ===','system');Sound.deal();Sound.startRoomBGM(G.gameType);startCandle();renderTable();publishPresence();completeGameQuest();if(G.gameType==='bj')checkBJEnd();
}

// ==================== 轮次 ====================
function checkMyTurn(){
  if(G.gameOver||!G.players||!G.players.length){G.myTurn=false;return}
  const me=G.players.find(p=>p.isMe);if(!me){G.myTurn=false;return}
  if(!G.playerOrder||!G.playerOrder.length){G.myTurn=false;return}
  if(G.gameType==='zjh'){if(me.folded){G.myTurn=false;return}const currentId=G.playerOrder[G.turnIndex%G.playerOrder.length];G.myTurn=(me.id===currentId)}
  else if(G.gameType==='bj'){
    if(G.isSpectator){G.myTurn=false;return}
    const currentId=G.playerOrder[G.turnIndex%G.playerOrder.length];
    if(me.id!==currentId){G.myTurn=false;return}
    if(me.hands&&me.hands.length>0){
      const hand=me.hands[me.currentHand||0];
      const isBusted=bjValue(hand)>21;
      const isStood=me.stood&&(Array.isArray(me.stood)?me.stood[me.currentHand||0]:me.stood);
      if(isBusted||isStood){G.myTurn=false;advanceTurn();return}
    }else{
      if(me.busted||me.stood){G.myTurn=false;return}
    }
    G.myTurn=true;
  }
  else if(G.gameType==='dice'){if(me.folded){G.myTurn=false;return}G.myTurn=true}
}

// ==================== 渲染 ====================
let _lastRenderHash='';
function shouldRender(){
  const h=JSON.stringify({gt:G.gameType,p:G.players.map(p=>({id:p.id,c:p.cards.length,f:p.folded,s:p.seen,b:p.busted,st:p.stood,ch:p.choice})),pot:G.pot,mt:G.myTurn,go:G.gameOver,ds:G.diceState});
  if(h===_lastRenderHash)return false;_lastRenderHash=h;return true;
}
function renderTable(){if(!G.players||!G.players.length||!shouldRender())return;if(G.gameType==='zjh')renderZJH();else if(G.gameType==='bj')renderBJ();else if(G.gameType==='dice')renderDice();updateChips()}
function setActionBar(h){const ab=$('action-bar');if(ab)ab.innerHTML=h}
function safeSet(id,prop,val){const el=$(id);if(el)el[prop]=val}
function renderZJH(){
  const me=G.players.find(p=>p.isMe);if(!me)return;const others=G.players.filter(p=>!p.isMe);
  const isSpec=G.isSpectator;
  safeSet('p0-cards','innerHTML',me.seen||isSpec?me.cards.map((c,i)=>`<div class="card-deal" style="animation-delay:${i*0.1}s">${cardHTML(c)}</div>`).join(''):me.cards.map(()=>`<div class="card-flip">${cardHTML(null,true)}</div>`).join(''));
  safeSet('p0-hand','textContent',me.seen||isSpec?evalZJH(me.cards).name:(isSpec?'观战模式':'未看牌'));safeSet('p0-name','innerHTML',`${escHTML(me.name)} <span style="color:var(--gold)">${me.chips}单位</span>`);safeSet('p0-name','className','player-name'+(G.myTurn?' active':''));
  for(let i=0;i<2;i++){const p=others[i];if(!p){safeSet('p'+(i+1)+'-name','textContent','空位');safeSet('p'+(i+1)+'-cards','innerHTML','');safeSet('p'+(i+1)+'-hand','textContent','');continue}const show=p.folded||G.gameOver||isSpec;safeSet('p'+(i+1)+'-cards','innerHTML',show?p.cards.map(c=>cardHTML(c)).join(''):p.cards.map(()=>cardHTML(null,true)).join(''));safeSet('p'+(i+1)+'-hand','textContent',show?evalZJH(p.cards).name:'');safeSet('p'+(i+1)+'-name','textContent',`${escHTML(p.name)} ${p.folded?'(弃牌)':''}${p.bluffed?'[诈]':''}${p.darkBet?'[暗]':''}`);safeSet('p'+(i+1)+'-name','className','player-name'+(G.myTurn&&p.id===currentPlayerId()?' active':''))}
  const pa=$('pot-amount');if(pa)pa.innerHTML=_renderPotChips(G.pot);
  if(isSpec){const specHint=document.getElementById('spec-hint');if(!specHint){const h=document.createElement('div');h.id='spec-hint';h.style.cssText='font-size:10px;color:var(--gold);text-align:center;margin-top:4px';h.textContent='[观战模式] 你可以看到所有牌面';const pa=document.querySelector('.pot-area');if(pa)pa.after(h)}}
  const hintEl=document.getElementById('rank-hint');if(!hintEl&&!G.gameOver){const h=document.createElement('div');h.id='rank-hint';h.style.cssText='font-size:9px;color:var(--dim);text-align:center;margin-top:4px;letter-spacing:1px';h.textContent='豹子 > 同花顺 > 同花 > 顺子 > 对子 > 散牌';const pa=document.querySelector('.pot-area');if(pa)pa.after(h)}
  if(isSpec){setActionBar(`<button class="action-btn" onclick="leaveSpectate()">退出观战</button>`);return}
  if(G.myTurn&&!G.gameOver){
    const bluffBtn=!me.seen&&!me.bluffed?`<button class="action-btn" style="background:var(--purple)" onclick="doAction('bluff')">诈唬</button>`:'';
    const allInBtn=`<button class="action-btn danger" onclick="doAction('allin')">梭哈</button>`;
    setActionBar(`<button class="action-btn danger" onclick="doAction('fold')">弃牌</button>${me.seen?'':`<button class="action-btn" onclick="doAction('look')">看牌</button>`}${bluffBtn}<button class="action-btn warning" onclick="doAction('call')">跟注 ${G.currentBet}</button><button class="action-btn primary" onclick="doAction('raise')">加注</button>${allInBtn}`)
  }else if(G.gameOver){setActionBar(`<button class="action-btn primary" onclick="closeModal()">返回等待面板</button>`)}else{setActionBar(`<div style="color:var(--dim);font-size:12px">等待其他幸存者...</div>`)}
}
function currentPlayerId(){if(!G.playerOrder||!G.playerOrder.length)return null;return G.playerOrder[G.turnIndex%G.playerOrder.length];}
function renderBJ(){
  const me=G.players.find(p=>p.isMe);if(!me)return;const others=G.players.filter(p=>!p.isMe);
  const isSpec=G.isSpectator;
  if(me.hands&&me.hands.length>0){
    let myHtml='';for(let hi=0;hi<me.hands.length;hi++){const hand=me.hands[hi];const isActive=hi===(me.currentHand||0);myHtml+=`<div style="display:inline-block;margin:0 8px;padding:4px;border:1px solid ${isActive?'var(--gold)':'transparent'};border-radius:4px"><div style="font-size:10px;color:var(--dim);margin-bottom:2px">手牌${hi+1}${isActive?' (当前)':''}</div>${hand.map((c,i)=>`<div class="card-deal" style="animation-delay:${i*0.08}s">${cardHTML(c)}</div>`).join('')}<div style="font-size:11px;margin-top:2px">点数:${bjValue(hand)}</div></div>`}
    $('p0-cards').innerHTML=myHtml;
    safeSet('p0-hand','textContent',`当前: ${bjValue(activeHand)} 点`);
  }else{
    safeSet('p0-cards','innerHTML',me.cards.map((c,i)=>`<div class="card-deal" style="animation-delay:${i*0.08}s">${cardHTML(c)}</div>`).join(''));safeSet('p0-hand','textContent',`点数: ${bjValue(me.cards)}`);
  }
  safeSet('p0-name','innerHTML',`${escHTML(me.name)} <span style="color:var(--gold)">${me.chips}单位</span>${me.doubled?' [双倍]':''}${me.insured?' [保险]':''}`);safeSet('p0-name','className','player-name'+(G.myTurn?' active':'')+' glow-pulse');
  for(let i=0;i<2;i++){const p=others[i];if(!p){safeSet('p'+(i+1)+'-name','textContent','空位');safeSet('p'+(i+1)+'-cards','innerHTML','');safeSet('p'+(i+1)+'-hand','textContent','');continue}const show=G.gameOver||isSpec;if(p.hands&&p.hands.length>0){let pHtml='';for(let hi=0;hi<p.hands.length;hi++){const hand=p.hands[hi];pHtml+=`<div style="display:inline-block;margin:0 6px;padding:3px;border:1px solid var(--border);border-radius:4px"><div style="font-size:9px;color:var(--dim)">手牌${hi+1}</div>${show?hand.map(c=>cardHTML(c)).join(''):hand.map(()=>cardHTML(null,true)).join('')}<div style="font-size:10px;margin-top:2px">${show?bjValue(hand):'?'}</div></div>`}safeSet('p'+(i+1)+'-cards','innerHTML',pHtml);safeSet('p'+(i+1)+'-hand','textContent',show?`手牌1:${bjValue(p.hands[0])} 手牌2:${bjValue(p.hands[1])}`:'');}else{safeSet('p'+(i+1)+'-cards','innerHTML',show?p.cards.map(c=>cardHTML(c)).join(''):p.cards.map(()=>cardHTML(null,true)).join(''));safeSet('p'+(i+1)+'-hand','textContent',show?`点数: ${bjValue(p.cards)}`:'');}safeSet('p'+(i+1)+'-name','textContent',escHTML(p.name)+(p.busted?' (爆牌)':p.stood?' (停牌)':''));safeSet('p'+(i+1)+'-name','className','player-name'+(G.myTurn&&p.id===currentPlayerId()?' active':''))}
  const pa=$('pot-amount');if(pa)pa.innerHTML=_renderPotChips(G.pot);
  if(isSpec){const specHint=document.getElementById('spec-hint');if(!specHint){const h=document.createElement('div');h.id='spec-hint';h.style.cssText='font-size:10px;color:var(--gold);text-align:center;margin-top:4px';h.textContent='[观战模式] 你可以看到所有牌面';const pa=document.querySelector('.pot-area');if(pa)pa.after(h)}}
  const bjHint=document.getElementById('bj-hint');if(!bjHint&&!G.gameOver){const h=document.createElement('div');h.id='bj-hint';h.style.cssText='font-size:9px;color:var(--dim);text-align:center;margin-top:4px;letter-spacing:1px';h.textContent='尽量接近21点，超过则爆牌';const pa=document.querySelector('.pot-area');if(pa)pa.after(h)}
  if(isSpec){setActionBar(`<button class="action-btn" onclick="leaveSpectate()">退出观战</button>`);return}
  if(G.myTurn&&!G.gameOver){
    const activeCards=me.hands&&me.hands.length>0?me.hands[me.currentHand||0]:me.cards;
    const canSplit=!me.hands&&me.cards.length===2&&me.cards[0].r===me.cards[1].r&&me.chips>=me.bet;
    const canDouble=!me.hands&&me.cards.length===2&&me.chips>=me.bet;
    const canInsure=!me.insured&&others.length>0&&others[0].cards&&others[0].cards.length>0&&others[0].cards[0].r==='A'&&me.chips>=Math.floor(me.bet/2);
    const splitBtn=canSplit?`<button class="action-btn warning" onclick="doAction('split')">分牌</button>`:'';
    const doubleBtn=canDouble?`<button class="action-btn warning" onclick="doAction('double')">双倍</button>`:'';
    const insBtn=canInsure?`<button class="action-btn" onclick="doAction('insure')">保险</button>`:'';
    setActionBar(`${splitBtn}${doubleBtn}${insBtn}<button class="action-btn success" onclick="doAction('hit')">要牌</button><button class="action-btn" onclick="doAction('stand')">停牌</button>`)
  }else if(G.gameOver){setActionBar(`<button class="action-btn primary" onclick="closeModal()">返回等待面板</button>`)}else{const statusText=me&&me.busted?'爆牌了':me&&me.stood?'已停牌':'等待其他幸存者...';setActionBar(`<div style="color:var(--dim);font-size:12px">${statusText}</div>`)}
}

// ==================== 牌型 ====================
const _zjhCache=new Map();
function evalZJH(cards){
  if(!cards||cards.length!==3)return{type:0,name:'无效',val:0};const key=cards.map(c=>c.s+c.r).sort().join('');if(_zjhCache.has(key))return _zjhCache.get(key);
  const sorted=[...cards].sort((a,b)=>b.v-a.v);const[c1,c2,c3]=sorted;const flush=c1.s===c2.s&&c2.s===c3.s;const isA23=(c1.v===14&&c2.v===3&&c3.v===2);const straight=(c1.v===c2.v+1&&c2.v===c3.v+1)||isA23;const three=c1.v===c2.v&&c2.v===c3.v;const pair=c1.v===c2.v||c2.v===c3.v||c1.v===c3.v;let result;
  if(three)result={type:6,name:'豹子',val:c1.v*1e6};
  else if(flush&&straight)result={type:5,name:'同花顺',val:isA23?3e5:c1.v*1e5+c2.v*1e3+c3.v};
  else if(flush)result={type:4,name:'同花',val:c1.v*1e4+c2.v*100+c3.v};
  else if(straight)result={type:3,name:'顺子',val:isA23?3e4:c1.v*1e4+c2.v*100+c3.v};
  else if(pair){const pv=c1.v===c2.v?c1.v:c3.v;const k=c1.v===c2.v?c3.v:c1.v;result={type:2,name:'对子',val:pv*1e4+k}}
  else result={type:1,name:'散牌',val:c1.v*1e4+c2.v*100+c3.v};
  if(_zjhCache.size>200)_zjhCache.clear();_zjhCache.set(key,result);return result;
}
function bjValue(cards){let t=0,a=0;for(const c of cards){if(c.r==='A'){a++;t+=11}else if('JQK'.includes(c.r))t+=10;else t+=c.v}while(t>21&&a>0){t-=10;a--}return t}

const GAME_RULES={
  zjh:{name:'物资炸金花',desc:'每人发3张牌，通过比牌型大小决定胜负。每局开始每人自动下注5单位。',tip:'豹子 > 同花顺 > 同花 > 顺子 > 对子 > 散牌',ranks:[{name:'豹子',desc:'三张相同点数，AAA最大',eg:'♥A ♠A ♦A'},{name:'同花顺',desc:'同花色连续点数，AKQ最大，A23最小',eg:'♥A ♥K ♥Q'},{name:'同花',desc:'同花色但点数不连续',eg:'♠A ♠J ♠5'},{name:'顺子',desc:'不同花色连续点数，A23为最小',eg:'♠A ♥2 ♦3'},{name:'对子',desc:'两张相同点数',eg:'♣K ♥K ♠7'},{name:'散牌',desc:'无组合，按最大单张比',eg:'♥A ♠Q ♦9'}]},
  bj:{name:'物资二十一点',desc:'争取手牌点数尽量接近21点但不超过。J/Q/K算10点，A可算1或11点。每局开始每人自动下注10单位。',tip:'尽量接近21点，超过则爆牌出局！'},
  dice:{name:'骰子猜大小',desc:'每人每局自动下注5单位。三颗骰子点数之和：4-10为"小"，11-17为"大"。猜对赢2倍注金，猜错输掉。围骰（三个相同）庄家通吃。',tip:'4-10为小 ✦ 11-17为大 ✦ 围骰庄家通吃'}
};
function showRules(t){const type=t||G.gameType;const r=GAME_RULES[type];if(!r)return;let html='<div class="rules-tip">'+r.tip+'</div>';html+='<p style="margin-bottom:12px;color:var(--dim);font-size:12px">'+r.desc+'</p>';if(r.ranks){html+='<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px"><div style="font-size:11px;color:var(--dim);margin-bottom:8px;letter-spacing:1px">— 牌型从大到小 —</div>';for(const rank of r.ranks){html+='<div class="rank-row"><span class="rank-name">'+rank.name+'</span><span class="rank-desc">'+rank.desc+'</span></div>'}html+='</div>'}const rc=document.getElementById('rules-content');if(rc)rc.innerHTML=html;const rm=document.getElementById('rules-modal');if(rm)rm.classList.add('open')}
function closeRules(){const rm=document.getElementById('rules-modal');if(rm)rm.classList.remove('open')}
function rollDice(){let d=[ran(1,6),ran(1,6),ran(1,6)];const isTrips=d[0]===d[1]&&d[1]===d[2];if(isTrips&&G.stats.luck>30&&Math.random()<0.15){d=[ran(1,6),ran(1,6),ran(1,6)]}return{dice:d,sum:d[0]+d[1]+d[2]}}
function ran(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function renderDice(){
  const me=G.players.find(p=>p.isMe);if(!me)return;const others=G.players.filter(p=>!p.isMe);
  safeSet('p0-cards','innerHTML',me.choice?`<div style="font-size:36px;padding:10px">${me.choice==='big'?'🔴':'🔵'}</div>`:`<div style="font-size:36px;padding:10px;opacity:.3">❓</div>`);safeSet('p0-hand','textContent',me.choice?(me.choice==='big'?'选大':'选小'):'未选择');safeSet('p0-name','innerHTML',`${escHTML(me.name)} <span style="color:var(--gold)">${me.chips}单位</span>`);safeSet('p0-name','className','player-name'+(G.myTurn?' active':'')+' glow-pulse');
  for(let i=0;i<2;i++){const p=others[i];if(!p){safeSet('p'+(i+1)+'-name','textContent','空位');safeSet('p'+(i+1)+'-cards','innerHTML','');safeSet('p'+(i+1)+'-hand','textContent','');continue}safeSet('p'+(i+1)+'-cards','innerHTML',p.choice?`<div style="font-size:36px;padding:10px">${p.choice==='big'?'🔴':'🔵'}</div>`:`<div style="font-size:36px;padding:10px;opacity:.3">⏳</div>`);safeSet('p'+(i+1)+'-hand','textContent',p.choice?`${p.choice==='big'?'选大':'选小'}`:'思考中');safeSet('p'+(i+1)+'-name','textContent',escHTML(p.name)+(p.folded?' (已结算)':''));safeSet('p'+(i+1)+'-name','className','player-name'+(G.myTurn&&p.id===currentPlayerId()?' active':''))}
  const diceEl=$('pot-amount');if(G.diceState.phase==='reveal'||G.diceState.phase==='result'||G.gameOver){const isBig=G.diceState.sum>=11;const pl=document.querySelector('.pot-label');if(pl)pl.textContent='骰子结果';const dArea=document.querySelector('.pot-area');if(dArea){const dHTML=dArea.querySelector('.dice-area');if(dHTML)dHTML.innerHTML=G.diceState.dice.map((d,i)=>`<div class="dice-die dice-roll" style="animation-delay:${i*0.15}s">${d}</div>`).join('');else{const da=document.createElement('div');da.className='dice-area';da.innerHTML=G.diceState.dice.map((d,i)=>`<div class="dice-die dice-roll" style="animation-delay:${i*0.15}s">${d}</div>`).join('');dArea.insertBefore(da,diceEl)}}diceEl.innerHTML=`<span style="font-size:14px;color:${isBig?'var(--accent)':'var(--green)'}">总和 ${G.diceState.sum} — ${isBig?'大':'小'}</span> <span style="font-size:18px;color:var(--gold)">| 底池 ${_renderPotChips(G.pot)}</span>`}else{const pl=document.querySelector('.pot-label');if(pl)pl.textContent='等待下注...';const dArea=document.querySelector('.pot-area');if(dArea){const oldDa=dArea.querySelector('.dice-area');if(oldDa)oldDa.innerHTML='<span style="font-size:40px;opacity:.3">🎲 🎲 🎲</span>';else{const da=document.createElement('div');da.className='dice-area';da.innerHTML='<span style="font-size:40px;opacity:.3">🎲 🎲 🎲</span>';dArea.insertBefore(da,diceEl)}}diceEl.innerHTML=`<span style="font-size:20px;color:var(--gold)">底池 ${_renderPotChips(G.pot)}</span>`}
  const jpEl=document.getElementById('jackpot-hint');if(!jpEl){const h=document.createElement('div');h.id='jackpot-hint';h.style.cssText='font-size:10px;color:var(--gold);text-align:center;margin-top:4px';h.textContent=`围骰奖池: ${G.diceJackpot}单位 (连${G.diceJackpotStreak}局无围骰)`;const pa=document.querySelector('.pot-area');if(pa)pa.after(h)}else{jpEl.textContent=`围骰奖池: ${G.diceJackpot}单位 (连${G.diceJackpotStreak}局无围骰)`}
  if(G.isSpectator){setActionBar(`<button class="action-btn" onclick="leaveSpectate()">退出观战</button>`);return}
  if(!G.gameOver&&G.diceState.phase==='bet'&&!me.choice&&!me.folded){setActionBar(`<button class="action-btn success" onclick="doAction('big')">🔴 大 (11-17)</button><button class="action-btn primary" onclick="doAction('small')">🔵 小 (4-10)</button>`)}else if(G.gameOver){setActionBar(`<button class="action-btn primary" onclick="closeModal()">继续</button>`)}else{setActionBar(`<div style="color:var(--dim);font-size:12px">${me.folded?'已选择':'等待其他幸存者...'}</div>`)}
}
function doDiceAction(me,action){me.choice=action;me.folded=true;Sound.click();log(`${me.name} ${action==='big'?'选大':'选小'}`);G.myTurn=false;if(G.isHost)checkDiceEnd();return true}
function checkDiceEnd(){
  if(G.gameOver)return;const allChose=G.players.every(p=>p.choice!==null&&p.choice!==undefined);if(!allChose)return;const result=rollDice();Sound.diceRoll();G.diceState={dice:result.dice,sum:result.sum,phase:'reveal'};const isBig=result.sum>=11;const isTrips=result.dice[0]===result.dice[1]&&result.dice[1]===result.dice[2];let resultText=`骰子 ${result.dice.join('-')} 总和${result.sum} ${isBig?'大':'小'}`;let winners=[];
  if(isTrips){
    G.diceJackpotStreak=0;
    const tripWinners=G.players.filter(p=>p.choice!==null);
    if(G.diceJackpot>0&&tripWinners.length>0){const jpShare=Math.floor(G.diceJackpot/tripWinners.length);for(const tw of tripWinners)tw.chips+=jpShare;resultText+=` 围骰！奖池${G.diceJackpot}单位由围骰玩家平分！`;G.diceJackpot=0;}
    else{const share=Math.floor(G.pot/G.players.length);for(const p of G.players)p.chips+=share;G.pot=0;resultText+=' 围骰！底池退还！';}
    G.gameOver=true;log(resultText,'system');publishRoom({type:'result',text:resultText,winnerId:null,players:G.players.map(p=>({id:p.id,chips:p.chips})),diceResult:{dice:result.dice,sum:result.sum,isBig,isTrips},diceJackpot:G.diceJackpot,diceJackpotStreak:G.diceJackpotStreak});for(const p of G.players)Sound.lose();renderTable();return;
  }
  G.diceJackpotStreak++;
  if(G.diceJackpotStreak>=4&&G.diceJackpot>0){
    const jpShare=Math.floor(G.diceJackpot/G.players.length);for(const p of G.players)p.chips+=jpShare;resultText+=` 连续${G.diceJackpotStreak}局无围骰，奖池${G.diceJackpot}单位平分！`;G.diceJackpot=0;G.diceJackpotStreak=0;
  }
  winners=G.players.filter(p=>(p.choice==='big'&&isBig)||(p.choice==='small'&&!isBig));
  const chDice=CHARACTERS[selectedChar];const hasDiceBonus=chDice&&chDice.skills&&chDice.skills.find(s=>s.effect==='diceBonus'&&s.unlocked);
  if(hasDiceBonus&&winners.some(p=>p.isMe)&&Math.random()<0.05){const me=G.players.find(p=>p.isMe);if(me){me.chips+=2;resultText+=' [敏锐]额外奖励+2';}}
  const wCount=winners.length;if(wCount>0){const sharePayout=Math.min(G.currentBet*2,G.pot/wCount);for(const w of winners)w.chips+=sharePayout;resultText+=` ${wCount}人猜对，各得${sharePayout}单位`}else{const share=Math.floor(G.pot/G.players.length);for(const p of G.players)p.chips+=share;resultText+=' 无人猜对，底池退还'}
  G.pot=0;G.gameOver=true;log(resultText,'system');const winnerId=winners.length>0?winners[0].id:null;publishRoom({type:'result',text:resultText,winnerId:winnerId,players:G.players.map(p=>({id:p.id,chips:p.chips})),diceResult:{dice:result.dice,sum:result.sum,isBig,isTrips},diceJackpot:G.diceJackpot,diceJackpotStreak:G.diceJackpotStreak});const myWin=winners.some(p=>p.isMe);if(myWin)Sound.win();else Sound.lose();renderTable();
}

// ==================== 操作 ====================
function doAction(action){
  const me=G.players.find(p=>p.isMe);if(!me||!G.myTurn||G.gameOver)return;let shouldBroadcast=true;
  if(G.gameType==='zjh')shouldBroadcast=doZJHAction(me,action);else if(G.gameType==='bj'){doBJAction(me,action);shouldBroadcast=true}else if(G.gameType==='dice')shouldBroadcast=doDiceAction(me,action);
  if(shouldBroadcast){publishRoom({type:'action',playerId:me.id,action,data:{cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,stood:p.stood,choice:p.choice,myCards:p.id===me.id?p.cards:null})),pot:G.pot,currentBet:G.currentBet,gameOver:G.gameOver,deck:G.gameType==='bj'?G.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})):undefined}})}
  renderTable();if(G.isHost&&G.gameType==='bj'&&!G.gameOver)checkBJEnd();
}
function doZJHAction(me,action){
  switch(action){
    case 'fold':me.folded=true;G.myTurn=false;log(`${me.name} 弃牌`);Sound.fold();checkZJHEnd();return true;
    case 'look':me.seen=true;log(`${me.name} 看了牌`);
      const chLook=CHARACTERS[selectedChar];
      if(chLook&&chLook.skills&&chLook.skills.find(s=>s.effect==='peek10'&&s.unlocked)){const others=G.players.filter(p=>!p.isMe&&!p.folded);if(others.length>0&&Math.random()<0.1){const target=others[Math.floor(Math.random()*others.length)];if(target.cards&&target.cards.length>0){const c=target.cards[Math.floor(Math.random()*target.cards.length)];log(`信使直觉：你瞥见了 ${target.name} 的一张牌 ${c.s}${c.r}`,'system')}}}
      const inv=loadInventory();const hasXray=inv.find(i=>i.type==='xray_glasses');
      if(hasXray){const others=G.players.filter(p=>!p.isMe&&!p.folded);if(others.length>0){const target=others[Math.floor(Math.random()*others.length)];if(target.cards&&target.cards.length>0){const c=target.cards[Math.floor(Math.random()*target.cards.length)];log(`透视眼镜：你看到了 ${target.name} 的一张暗牌 ${c.s}${c.r}`,'system');inv.splice(inv.indexOf(hasXray),1);saveInventory(inv);G.inventory=inv;}}}
      if(G.stats.luck>50&&Math.random()<0.05){const others=G.players.filter(p=>!p.isMe&&!p.folded);if(others.length>0){const target=others[Math.floor(Math.random()*others.length)];if(target.cards&&target.cards.length>0){const c=target.cards[Math.floor(Math.random()*target.cards.length)];log('你似乎感应到了什么...','system');log(`感应：${target.name} 有一张 ${c.s}${c.r}`,'system')}}}
      return false;
    case 'bluff':
      me.bluffed=true;log(`${me.name} 诈唬（假装看牌）`,'system');
      const chBluff=CHARACTERS[selectedChar];const hasBluff15=chBluff&&chBluff.skills&&chBluff.skills.find(s=>s.effect==='bluff15'&&s.unlocked);
      const successRate=hasBluff15?0.65:0.5;
      if(Math.random()<successRate){log('诈唬成功！下次跟注半价','system');me.bluffSuccess=true}else{log('诈唬被识破...','system');me.bluffSuccess=false}
      G.myTurn=false;advanceTurn();checkZJHEnd();return true;
    case 'allin':
      const allAmt=me.chips;me.chips=0;me.bet+=allAmt;G.pot+=allAmt;G.currentBet=allAmt;G.myTurn=false;
      log(`${me.name} 梭哈！押上全部 ${allAmt}单位物资`,'system');Sound.chipMetal();checkHighRoller();advanceTurn();checkZJHEnd();return true;
    case 'call':{
      let callAmt=G.currentBet;
      if(!me.seen){me.darkBet=true;callAmt=Math.ceil(G.currentBet/2);log(`${me.name} 暗注（未看牌跟注半价）`,'system')}
      else if(me.bluffed&&me.bluffSuccess){callAmt=Math.ceil(G.currentBet/2);log(`${me.name} 诈唬成功，跟注半价`,'system');me.bluffSuccess=false}
      else{me.seen=true}
      callAmt=Math.min(callAmt,me.chips);me.chips-=callAmt;me.bet+=callAmt;G.pot+=callAmt;G.myTurn=false;
      log(`${me.name} 跟注 ${callAmt}单位`);Sound.chipMetal();checkHighRoller();advanceTurn();checkZJHEnd();return true;
    }
    case 'raise':if(me.chips<=0){log('没有物资可以加注','system');return false}const maxBet=50+G.stats.charm*2;const amt=Math.min(me.chips,Math.min(G.currentBet*2,maxBet));if(!me.seen)me.seen=true;me.chips-=amt;me.bet+=amt;G.pot+=amt;G.currentBet=amt;G.myTurn=false;log(`${me.name} 加注到 ${amt}单位`);Sound.chipMetal();checkHighRoller();advanceTurn();checkZJHEnd();return true;
  }return true;
}
function advanceTurn(){G.turnIndex++;G.roundCount++;publishRoom({type:'turn',turnIndex:G.turnIndex,playerOrder:G.playerOrder})}
function checkZJHEnd(){
  const active=G.players.filter(p=>!p.folded);if(active.length===0){const share=Math.floor(G.pot/G.players.length);G.players.forEach(p=>p.chips+=share);G.pot=0;G.gameOver=true;stopCandle();publishRoom({type:'result',text:'所有幸存者弃牌，底池退还',winnerId:null,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal('底池退还','所有幸存者弃牌，物资已退还',false);return}
  if(active.length===1){const winner=active[0];winner.chips+=G.pot;G.gameOver=true;stopCandle();Sound.win();const isMe=winner.isMe;publishRoom({type:'result',text:`${winner.name} 赢得了 ${G.pot} 单位物资`,winnerId:winner.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal(isMe?'物资归你':'物资被收走',isMe?`你赢得了底池 ${G.pot} 单位物资`:`${winner.name} 赢得了 ${G.pot} 单位物资`,isMe);return}
  if(G.roundCount>=MAX_ROUNDS){G.gameOver=true;stopCandle();Sound.win();let best=active[0];for(let i=1;i<active.length;i++){if(evalZJH(active[i].cards).val>evalZJH(best.cards).val)best=active[i]}best.chips+=G.pot;const isMe=best.isMe;publishRoom({type:'result',text:`轮次耗尽！${best.name} 以${evalZJH(best.cards).name}获胜，获得 ${G.pot} 单位`,winnerId:best.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal(isMe?'物资归你':'物资被收走',isMe?`你以${evalZJH(best.cards).name}获胜，获得 ${G.pot} 单位`:`${best.name} 以${evalZJH(best.cards).name}获胜`,isMe)}
}
function doBJAction(me,action){
  switch(action){
    case 'hit':{
      if(!G.deck||!G.deck.length){log('牌堆已空','system');break}
      if(me.hands&&me.hands.length>0){
        const hi=me.currentHand||0;const hand=me.hands[hi];hand.push(G.deck.pop());Sound.deal();log(`${me.name} 手牌${hi+1} 要牌，点数 ${bjValue(hand)}`);
        if(bjValue(hand)>21){
          if(!Array.isArray(me.busted))me.busted=[];me.busted[hi]=true;
          log(`${me.name} 手牌${hi+1} 爆牌！`);
          if(hi<me.hands.length-1){me.currentHand=hi+1;log(`${me.name} 切换到手牌${me.currentHand+1}`);}
          else{me.stood=true;G.myTurn=false;advanceTurn()}
        }
      }else{
        me.cards.push(G.deck.pop());Sound.deal();log(`${me.name} 要牌，点数 ${bjValue(me.cards)}`);
        if(bjValue(me.cards)>21){me.busted=true;me.stood=true;G.myTurn=false;log(`${me.name} 爆牌！`);advanceTurn()}
      }
      break;
    }
    case 'stand':{
      if(me.hands&&me.hands.length>0){
        const hi=me.currentHand||0;
        if(!Array.isArray(me.stood))me.stood=[];me.stood[hi]=true;
        log(`${me.name} 手牌${hi+1} 停牌，点数 ${bjValue(me.hands[hi])}`);
        if(hi<me.hands.length-1){me.currentHand=hi+1;log(`${me.name} 切换到手牌${me.currentHand+1}`);}
        else{me.stood=true;G.myTurn=false;advanceTurn()}
      }else{
        me.stood=true;G.myTurn=false;log(`${me.name} 停牌，点数 ${bjValue(me.cards)}`);advanceTurn();
      }
      break;
    }
    case 'split':{
      if(!me.cards||me.cards.length!==2||me.cards[0].r!==me.cards[1].r||me.chips<me.bet)break;
      me.chips-=me.bet;G.pot+=me.bet;me.bet+=me.bet;
      me.hands=[[me.cards[0],G.deck.pop()],[me.cards[1],G.deck.pop()]];me.currentHand=0;me.cards=[];
      Sound.deal();log(`${me.name} 分牌！下注翻倍为${me.bet}`);
      for(let hi=0;hi<me.hands.length;hi++){if(me.hands[hi][0].r==='A'){if(!Array.isArray(me.stood))me.stood=[];me.stood[hi]=true;log(`手牌${hi+1} 是A+A，只能再得一张牌`);}}
      break;
    }
    case 'double':{
      if(!me.cards||me.cards.length!==2||me.chips<me.bet)break;
      me.chips-=me.bet;G.pot+=me.bet;me.bet*=2;me.doubled=true;
      if(!G.deck||!G.deck.length){log('牌堆已空','system');break}
      me.cards.push(G.deck.pop());Sound.deal();log(`${me.name} 双倍下注！只能再要一张牌`);
      me.stood=true;G.myTurn=false;advanceTurn();
      break;
    }
    case 'insure':{
      const dealer=G.players.find(p=>!p.isMe);
      if(!dealer||!dealer.cards||dealer.cards[0].r!=='A'||me.insured||me.chips<Math.floor(me.bet/2))break;
      const insAmt=Math.floor(me.bet/2);me.chips-=insAmt;me.insured=true;
      log(`${me.name} 购买保险 ${insAmt}单位`);Sound.chip();
      break;
    }
  }
}
function checkBJEnd(){
  if(G.gameOver)return;if(G.isHost){let safety=0;const orderLen=G.playerOrder.length;while(safety<orderLen){const currentId=G.playerOrder[G.turnIndex%orderLen];const p=G.players.find(pl=>pl.id===currentId);if(!p){G.turnIndex++;safety++;continue}
      let done=false;
      if(p.hands&&p.hands.length>0){
        const hi=p.currentHand||0;const hand=p.hands[hi];
        const isBusted=p.busted&&(Array.isArray(p.busted)?p.busted[hi]:p.busted);
        const isStood=p.stood&&(Array.isArray(p.stood)?p.stood[hi]:p.stood);
        done=isBusted||isStood;
      }else{done=p.busted||p.stood}
      if(done){G.turnIndex++;safety++}else break}
    if(safety>0&&safety<orderLen){publishRoom({type:'turn',turnIndex:G.turnIndex,playerOrder:G.playerOrder})}}
  const allActed=G.players.every(p=>{
    if(p.hands&&p.hands.length>0){
      for(let hi=0;hi<p.hands.length;hi++){const isBusted=p.busted&&(Array.isArray(p.busted)?p.busted[hi]:p.busted);const isStood=p.stood&&(Array.isArray(p.stood)?p.stood[hi]:p.stood);if(!isBusted&&!isStood)return false}
      return true;
    }
    return p.busted||p.stood;
  });
  if(!allActed)return;
  const active=[];
  for(const p of G.players){
    if(p.hands&&p.hands.length>0){for(const hand of p.hands){if(bjValue(hand)<=21)active.push({...p,cards:hand,isSplit:true})}}
    else if(!p.busted)active.push(p);
  }
  if(active.length===0){const share=Math.floor(G.pot/G.players.length);G.players.forEach(p=>p.chips+=share);G.pot=0;G.gameOver=true;stopCandle();publishRoom({type:'result',text:'所有幸存者爆牌，底池退还',winnerId:null,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal('底池退还','所有幸存者爆牌，物资已退还',false);return}
  let best=active[0];for(let i=1;i<active.length;i++){if(bjValue(active[i].cards)<=21&&bjValue(active[i].cards)>bjValue(best.cards))best=active[i]}best.chips+=G.pot;G.gameOver=true;stopCandle();Sound.win();const isMe=best.isMe;publishRoom({type:'result',text:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,winnerId:best.id,players:G.players.map(p=>({id:p.id,chips:p.chips}))});showModal(isMe?'物资归你':'物资被收走',isMe?`你以 ${bjValue(best.cards)} 点获胜，获得 ${G.pot} 单位`:`${best.name} 以 ${bjValue(best.cards)} 点获胜`,isMe);
}
function handleRemoteAction(d){
  if(d._from&&d._from===G.myId&&d._seq&&d._seq<G.msgSeq){console.warn('[Stale] ignoring old msg',d._seq);return}
  if(d._seq&&d._from===G.myId)G.msgSeq=Math.max(G.msgSeq,d._seq);const{playerId,action,data}=d;
  if(data){G.pot=data.pot;G.currentBet=data.currentBet;if(data.gameOver)G.gameOver=true;for(const rp of data.cards){const lp=G.players.find(p=>p.id===rp.id);if(lp){lp.chips=rp.chips;lp.bet=rp.bet;lp.folded=rp.folded;lp.seen=rp.seen;lp.busted=rp.busted;lp.stood=rp.stood||false;lp.choice=rp.choice;lp.doubled=rp.doubled;lp.insured=rp.insured;lp.currentHand=rp.currentHand||0;if(rp.hands)lp.hands=rp.hands.map(h=>h.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red})));if(rp.myCards)lp.cards=rp.myCards.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}))}}if(data.deck)G.deck=data.deck.map(c=>({s:c.s,r:c.r,v:c.v,red:c.red}))}
  const rp=G.players.find(p=>p.id===playerId);if(rp){const n={fold:'弃牌',look:'看牌',call:'跟注',raise:'加注',hit:'要牌',stand:'停牌',big:'选大',small:'选小',bluff:'诈唬',allin:'梭哈',split:'分牌',double:'双倍',insure:'保险'};log(`${rp.name} ${n[action]||action}`)}checkMyTurn();if(G.myTurn&&!G.gameOver)log('轮到你操作','system');if(G.isHost&&G.gameType==='bj'&&!G.gameOver)checkBJEnd();renderTable();
}
function leaveGame(){
  if(!G.inGame)return;G.gameOver=true;G.myTurn=false;const me=G.players.find(p=>p.isMe);if(me){me.folded=true;me.stood=true;publishRoom({type:'game-leave',playerId:me.id,playerName:me.name});publishRoom({type:'action',playerId:me.id,action:'fold',data:{cards:G.players.map(p=>({id:p.id,chips:p.chips,bet:p.bet,folded:p.folded,seen:p.seen,busted:p.busted,stood:p.stood,choice:p.choice,hands:p.hands,currentHand:p.currentHand})),pot:G.pot,currentBet:G.currentBet,gameOver:false}})}publishRoom({type:'leave',playerId:G.myId,playerName:G.user});if(G.mqtt&&G.mqttConnected){try{G.mqtt.unsubscribe(roomTopic(G.roomCode))}catch(e){}}G.inGame=false;G.resultShown=false;G.roomPeers=[];G.roomCode=null;G.isHost=false;G.isSpectator=false;stopCandle();stopHeartbeat();Sound.stopRoomBGM();Sound.startAmbient(G.weather.type);const wp=$('wait-panel');if(wp)wp.style.display='none';showScreen('main');publishPresence();renderLobby();toast('已撤离牌桌');
}

// ==================== 背包系统 ====================
function loadInventory(){try{const s=localStorage.getItem('wl_inventory');return s?JSON.parse(s):[]}catch(e){return []}}
function saveInventory(inv){try{localStorage.setItem('wl_inventory',JSON.stringify(inv))}catch(e){}}
function addInventoryItem(item){const inv=loadInventory();inv.push({...item,acquiredAt:Date.now()});saveInventory(inv);G.inventory=inv;}
function useInventoryItem(idx){
  const inv=loadInventory();const item=inv[idx];if(!item)return;
  if(item.type==='luck_potion'){G.tempLuckBonus=Math.max(G.tempLuckBonus,20);toast('幸运药水生效！下一局幸运+20');}
  else if(item.type==='xray_glasses'){/* 由炸金花看牌逻辑处理 */toast('透视眼镜已装备（1次）');}
  else if(item.type==='speed_potion'){toast('加速药剂生效！移动速度+50% (5分钟)');}
  else if(item.type==='shield'){/* 由结算逻辑处理 */toast('护盾生效！下一局输时只损失一半');}
  else if(item.type==='rename_card'){const newName=prompt('输入新名称:');if(newName&&newName.trim()){G.user=newName.trim();const un=$('user-name');if(un)un.textContent=G.user;save();toast('改名成功！');}}
  inv.splice(idx,1);saveInventory(inv);G.inventory=inv;
}
function showInventoryPanel(){
  const inv=loadInventory();G.inventory=inv;
  const div=document.createElement('div');div.className='modal-overlay open';div.id='inventory-panel-modal';
  let html=`<div class="modal" style="max-width:360px;text-align:left;max-height:70vh;overflow-y:auto"><h3 style="text-align:center">背包 (${inv.length})</h3>`;
  if(inv.length===0){html+=`<div style="font-size:12px;color:var(--dim);text-align:center;padding:20px">背包为空</div>`;}
  else{
    html+=`<div style="display:flex;flex-direction:column;gap:6px;margin:12px 0">`;
    const itemNames={'luck_potion':'幸运药水','xray_glasses':'透视眼镜','speed_potion':'加速药剂','shield':'护盾','rename_card':'改名卡'};
    const itemIcons={'luck_potion':'🧪','xray_glasses':'👓','speed_potion':'⚡','shield':'🛡️','rename_card':'📝'};
    for(let i=0;i<inv.length;i++){const it=inv[i];const name=itemNames[it.type]||'未知';const icon=itemIcons[it.type]||'📦';html+=`<div style="display:flex;align-items:center;gap:8px;padding:6px;background:rgba(255,255,255,.03);border-radius:4px"><span style="font-size:18px">${icon}</span><span style="font-size:12px;flex:1">${name}</span><button class="sm-btn" style="font-size:10px;padding:3px 8px" onclick="useInventoryItem(${i});document.getElementById('inventory-panel-modal').remove();showInventoryPanel()">使用</button></div>`;}
    html+=`</div>`;
  }
  html+=`<div style="text-align:center"><button class="modal-btn btn-press" onclick="document.getElementById('inventory-panel-modal').remove()">关闭</button></div></div>`;
  div.innerHTML=html;document.body.appendChild(div);
}
function showShopPanel(){
  const div=document.createElement('div');div.className='modal-overlay open';div.id='shop-panel-modal';
  div.innerHTML=`<div class="modal" style="max-width:320px;text-align:center"><h3>🧔 老杰克的商店</h3><div style="font-size:12px;color:var(--dim);margin:8px 0">你拥有 ${G.chips} 单位物资</div><div style="display:flex;flex-direction:column;gap:8px;margin:12px 0"><button class="action-btn success" onclick="buyShopItem('luck_potion',15)">🧪 幸运药水 - 15单位<br><span style="font-size:10px">下一局幸运+20</span></button><button class="action-btn primary" onclick="buyShopItem('xray_glasses',30)">👓 透视眼镜 - 30单位<br><span style="font-size:10px">炸金花看对手一张暗牌(1次)</span></button><button class="action-btn" onclick="buyShopItem('speed_potion',10)">⚡ 加速药剂 - 10单位<br><span style="font-size:10px">大厅移动速度+50%(5分钟)</span></button><button class="action-btn warning" onclick="buyShopItem('shield',20)">🛡️ 护盾 - 20单位<br><span style="font-size:10px">下一局输时只损失一半下注</span></button><button class="action-btn" onclick="buyShopItem('rename_card',50)">📝 改名卡 - 50单位<br><span style="font-size:10px">修改角色名称</span></button></div><div style="text-align:center"><button class="modal-btn btn-press" onclick="document.getElementById('shop-panel-modal').remove()">离开</button></div></div>`;
  document.body.appendChild(div);
}
function buyShopItem(type,cost){
  if(G.chips<cost){toast('物资不足');return}
  G.chips-=cost;updateChips();save();
  addInventoryItem({type});
  toast('购买成功！物品已进入背包');Sound.chip();
  const modal=$('shop-panel-modal');if(modal)modal.remove();
}
function buyBuff(type,amount,cost){
  if(G.chips<cost){toast('物资不足');return}
  G.chips-=cost;updateChips();save();
  if(type==='luck'){G.stats.luck=Math.min(100,G.stats.luck+amount);toast(`幸运值+${amount}！`)}
  else if(type==='speed'){G.stats.agility=Math.min(100,G.stats.agility+amount);toast(`敏捷+${amount}！`)}
  const modal=$('npc-shop-modal');if(modal)modal.remove();
  if(Lobby&&Lobby.npcs)for(const n of Lobby.npcs)n.shopOpen=false;
}

// ==================== 初始化 ====================
function initApp(){renderLobby();renderOnlineList();renderCharSelector();refreshSkills();updateLevelPanel();G.inventory=loadInventory();cleanOldMail();updateMailBadge();updateFriendCountUI();cleanupExpiredAuctions();if(!G._roomCleanupTimer){G._roomCleanupTimer=setInterval(()=>{const now=Date.now();let changed=false;for(const code in G.knownRooms){if(now-G.knownRooms[code].ts>30000){delete G.knownRooms[code];changed=true}}if(changed)renderLobby()},10000)}const st=document.getElementById('sound-toggle');if(st)st.onclick=toggleSound;Sound.startAmbient(G.weather.type);}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initApp)}else{initApp()}
setTimeout(()=>{try{const m=$('main-screen');if(m&&m.style.display!=='none'&&Lobby&&!Lobby.animId){Lobby.show()}}catch(e){}},100);

// ==================== 2D 大厅系统 v10.0 全面升级 ====================
const Lobby={
  canvas:null,ctx:null,w:0,h:0,
  me:{x:400,y:300,tx:400,ty:300,moving:false,emoji:'🐦',name:'',level:1,exp:0,sitting:false,animState:'idle',animTimer:0,faceDir:1},
  gameTime:20,
  dayNightCycle:480,
  others:new Map(),
  tables:[
    {x:200,y:175,code:'',game:'zjh',label:'🥫 炸金花',players:0,max:3,host:'',region:'slum',minBet:5},
    {x:500,y:150,code:'',game:'bj',label:'⛽ 二十一点',players:0,max:3,host:'',region:'black',minBet:20},
    {x:350,y:450,code:'',game:'dice',label:'🎲 骰子',players:0,max:3,host:'',region:'safe',minBet:5},
    {x:700,y:300,code:'',game:'zjh',label:'🥫 炸金花 II',players:0,max:3,host:'',region:'black',minBet:10},
    {x:150,y:550,code:'',game:'bj',label:'⛽ 二十一点 II',players:0,max:3,host:'',region:'slum',minBet:10},
    {x:600,y:600,code:'',game:'dice',label:'🎲 骰子 II',players:0,max:3,host:'',region:'safe',minBet:5}
  ],
  benches:[{x:450,y:300},{x:550,y:400},{x:350,y:350}],
  currentRegion:'',
  keys:{},joystick:{active:false,cx:0,cy:0,dx:0,dy:0,touchId:null,opacity:0},
  particles:[],time:0,lastDir:{x:0,y:1},
  floorCache:null,fountainParticles:[],lootCrates:[],fountainTime:0,scraps:[],scrapCount:0,
  barrels:[],portal:null,portalParticles:[],
  floorCacheW:0,floorCacheH:0,dirty:true,welcomeTime:0,walkParticles:[],animId:null,lastBroadcast:0,
  camera:{x:0,y:0},mapW:1000,mapH:750,dayNightAlpha:0,dustStorm:0,ambientParticles:[],
  _tableGlowGrad:null,_vignetteGrad:null,_floorPattern:null,_brickPattern:null,
  _cachedDecor:null,_lastLightAngle:0,_lightAngle:0,_particlePool:[],_dustParticles:[],
  _hoveredTable:null,_screenShake:0,_transitionAlpha:0,_transitionTarget:0,
  weatherParticles:[],greenTrails:[],lastWeatherCollect:0,_regionFlash:0,_regionFlashColor:'',_regionToastName:'',_regionToastTime:0,
  npcs:[],npcDialogues:['这鬼天气...','有物资吗？','小心那些桌子','废土上别信任何人','听说黑市有好东西','守住你的筹码','辐射雨又来了','那边有废金属'],

  init(){
    if(this.animId)return true;
    this.canvas=$('lobby-canvas');if(!this.canvas)return false;
    this.ctx=this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled=false;
    this.resize();
    this.me.name=G.user||'幸存者';const chInit=CHARACTERS[selectedChar];this.me.emoji=chInit&&chInit.skins?chInit.skins[G.skinIndex||0]:chInit?.emoji||'🐦';this.keys={};
    if(_savedPos){this.me.x=_savedPos.x;this.me.y=_savedPos.y;_savedPos=null}
    this.time=0;this.welcomeTime=2;this.fountainTime=0;updateQuestPanel();
    // 加载角色精灵图
    this.sprites={};
    const loadSprite=(name,src)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>{this.sprites[name]=img;console.log('Loaded:',name,img.width,'x',img.height)};
      img.onerror=()=>{console.warn('Failed:',name)};
      img.src=src;
    };
    loadSprite('tilemap','assets/tilemap.png');
    loadSprite('village_street','assets/tile_village_street.png');
    loadSprite('village_objects','assets/tile_village_objects.png');
    loadSprite('indoors','assets/obj_indoors.png');
    loadSprite('room_tiles','assets/tile_room.png');
    loadSprite('knight','assets/raccoon_sheet.png');
    loadSprite('npcs','assets/npc_sprites.jpg');
    if(!localStorage.getItem('wl_tutorial')){setTimeout(()=>this.showTutorial(),2000)}
    // 移除喷泉粒子（减少光污染）
    this.fountainParticles=[];
    this.lootCrates=[];const cratePositions=[[125,125],[850,600],[150,600],[800,150],[450,300]];for(const[posX,posY]of cratePositions){this.lootCrates.push({x:posX,y:posY,opened:false,cooldown:0,sparkleTime:Math.random()*Math.PI*2,openAnim:0})}
    this.barrels=[];const barrelPositions=[[200,200],[750,550],[300,650],[900,250],[400,350]];for(const[posX,posY]of barrelPositions){this.barrels.push({x:posX,y:posY,state:'idle',vx:0,vy:0,respawnTimer:0,explodeAnim:0})}
    this.portal={x:50,y:375,active:true,respawnTimer:0};
    const chScrap=CHARACTERS[selectedChar];const hasFindScrap=chScrap&&chScrap.skills&&chScrap.skills.find(s=>s.effect==='findScrap'&&s.unlocked);const scrapCountInit=hasFindScrap?20:15;
    this.scraps=[];for(let i=0;i<scrapCountInit;i++){this.scraps.push({x:50+Math.random()*(this.mapW-100),y:50+Math.random()*(this.mapH-100),collected:false,rot:Math.random()*Math.PI*2})}
    this.scrapCount=0;
    // 环境粒子大幅减少
    this.ambientParticles=[];for(let i=0;i<5;i++){this.ambientParticles.push({x:Math.random()*this.mapW,y:Math.random()*this.mapH,vx:(Math.random()-.5)*2,vy:(Math.random()-.5)*1,size:1+Math.random()})}
    this._dustParticles=[];for(let i=0;i<10;i++){this._dustParticles.push({x:Math.random()*this.mapW,y:Math.random()*this.mapH,vx:(Math.random()-.5)*1,vy:(Math.random()-.5)*0.5+0.2,size:0.5+Math.random(),alpha:0.1+Math.random()*0.2})}
    this._particlePool=[];for(let i=0;i<20;i++){this._particlePool.push({x:0,y:0,vx:0,vy:0,life:0,maxLife:1,size:2,color:'#fff',active:false})}
    this._cachedDecor=null;this._lastLightAngle=0;this._lightAngle=0;this._hoveredTable=null;this._screenShake=0;this._transitionAlpha=0;this._transitionTarget=0;
    this.weatherParticles=[];this.greenTrails=[];this.lastWeatherCollect=0;this._regionFlash=0;this._regionFlashColor='';
    this.initWeather();this.initNPCs();
    // 只生成少量极淡环境粒子
    for(let i=0;i<5;i++){
      this.weatherParticles.push({x:Math.random()*this.mapW,y:Math.random()*this.mapH,vx:(Math.random()-.5)*0.3,vy:(Math.random()-.5)*0.3,life:5+Math.random()*3,size:2,color:'rgba(200,200,220,0.02)',type:'fog'});
    }
    this.bindInput();bindLobbyCanvasClick();this.startLoop();return true;
  },

  initNPCs(){
    this.npcs=[
      {id:'npc_merchant',x:600,y:500,emoji:'🧔',name:'老杰克',type:'merchant',state:'wander',stateTimer:5,tx:600,ty:500,dialogueTimer:8,bubble:null,shopOpen:false},
      {id:'npc_beggar',x:1400,y:1000,emoji:'🧟',name:'流浪者',type:'beggar',state:'wander',stateTimer:3,tx:1400,ty:1000,dialogueTimer:6,bubble:null},
      {id:'npc_guard',x:1000,y:300,emoji:'💂',name:'守卫',type:'guard',state:'idle',stateTimer:4,tx:1000,ty:300,dialogueTimer:10,bubble:null,patrolCenter:{x:1000,y:300},patrolRadius:80},
      {id:'npc_wanderer',x:300,y:800,emoji:'🧔',name:'拾荒者',type:'merchant',state:'wander',stateTimer:4,tx:300,ty:800,dialogueTimer:7,bubble:null,shopOpen:false}
    ];
  },
  updateNPCs(dt){
    for(const npc of this.npcs){
      npc.stateTimer-=dt;npc.dialogueTimer-=dt;
      if(npc.dialogueTimer<=0){npc.dialogueTimer=3+Math.random()*6;npc.bubble={text:this.npcDialogues[Math.floor(Math.random()*this.npcDialogues.length)],ts:Date.now()}}
      if(npc.bubble&&Date.now()-npc.bubble.ts>5000)npc.bubble=null;
      const dx=this.me.x-npc.x,dy=this.me.y-npc.y;const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<40&&npc.state!=='interact'){npc.state='interact';npc.stateTimer=5;}
      else if(npc.state==='interact'&&dist>60){npc.state='wander';npc.stateTimer=3;npc.shopOpen=false;}
      if(npc.stateTimer<=0){if(npc.state==='wander'){npc.state='idle';npc.stateTimer=2+Math.random()*3}else{npc.state='wander';npc.stateTimer=3+Math.random()*4;npc.tx=npc.x+(Math.random()-.5)*200;npc.ty=npc.y+(Math.random()-.5)*200;npc.tx=Math.max(30,Math.min(this.mapW-30,npc.tx));npc.ty=Math.max(30,Math.min(this.mapH-30,npc.ty))}}
      if(npc.state==='wander'){const ddx=npc.tx-npc.x,ddy=npc.ty-npc.y;const d=Math.sqrt(ddx*ddx+ddy*ddy);if(d>5){npc.x+=(ddx/d)*40*dt;npc.y+=(ddy/d)*40*dt}else{npc.state='idle';npc.stateTimer=1+Math.random()*2}}
      if(npc.type==='guard'){const pc=npc.patrolCenter;const gdx=pc.x-npc.x,gdy=pc.y-npc.y;if(Math.sqrt(gdx*gdx+gdy*gdy)>npc.patrolRadius){npc.tx=pc.x+(Math.random()-.5)*npc.patrolRadius;npc.ty=pc.y+(Math.random()-.5)*npc.patrolRadius;npc.state='wander'}}
    }
  },
  drawNPCs(ctx){
    const sprite=Lobby.sprites['npcs'];
    for(const npc of this.npcs){
      let alpha=1;
      if(G.weather.type==='fog'){
        const ddx=npc.x-this.me.x,ddy=npc.y-this.me.y;
        const d=Math.sqrt(ddx*ddx+ddy*ddy);
        if(d>300)alpha=Math.max(0.1,1-(d-300)/400);
      }
      ctx.globalAlpha=alpha;
      const px=Math.floor(npc.x),py=Math.floor(npc.y);

      if(sprite&&sprite.complete&&sprite.width>64){
        // AI生成的NPC精灵图，8个NPC水平排列
        const npcCount=Math.min(8,Math.floor(sprite.width/64));
        const npcIdx=(npc.idx||0)%npcCount;
        const cellW=Math.floor(sprite.width/npcCount);
        const cellH=sprite.height;
        const sx=npcIdx*cellW;

        // idle动画：微小呼吸
        const breathe=Math.floor(this.time*2)%2;
        const sy=breathe*0; // 如果没有多行，用同一行

        ctx.drawImage(sprite,sx,sy,cellW,cellH,px-16,py-16,32,32);
      }else{
        _drawNPCFallback(ctx,px,py,npc);
      }

      // 名字标签
      ctx.fillStyle='rgba(0,0,0,0.7)';
      const name=npc.name||'NPC';
      ctx.font='9px monospace';
      const nw=Math.min(ctx.measureText(name).width,60);
      ctx.fillRect(px-nw/2-4,py-30,nw+8,12);
      ctx.fillStyle='#b8960f';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(name,px,py-24);

      // 对话气泡
      if(npc.bubble){
        const age=(Date.now()-npc.bubble.ts)/5000;
        const ba=Math.max(0,1-age);
        if(ba>0){
          ctx.fillStyle=`rgba(0,0,0,${ba*0.7})`;
          ctx.fillRect(px-40,py-50,80,14);
          ctx.fillStyle=`rgba(212,200,160,${ba})`;
          ctx.font='9px monospace';
          ctx.textAlign='center';
          ctx.textBaseline='middle';
          ctx.fillText(npc.bubble.text.substring(0,12),px,py-43);
        }
      }
      ctx.globalAlpha=1;
    }
  },
  checkNPCInteraction(){
    for(const npc of this.npcs){
      const dx=this.me.x-npc.x,dy=this.me.y-npc.y;if(Math.sqrt(dx*dx+dy*dy)<40){
        const hint=$('interact-hint');
        if(npc.type==='merchant'){hint.textContent='按 E 交易';hint.style.display='block';if(this.keys['e']){this.keys['e']=false;this.openNPCShop(npc)}}
        else if(npc.type==='beggar'){hint.textContent='按 E 给物资';hint.style.display='block';if(this.keys['e']){this.keys['e']=false;this.giveToBeggar(npc)}}
        else if(npc.type==='guard'){hint.textContent='守卫正在巡逻';hint.style.display='block';}
        return true;
      }
    }
    return false;
  },
  openNPCShop(npc){
    if(npc.shopOpen)return;npc.shopOpen=true;
    showShopPanel();
  },
  giveToBeggar(npc){
    if(G.chips<5){toast('物资不足，无法施舍');return}
    G.chips-=5;updateChips();save();
    G.tempLuckBonus=Math.max(G.tempLuckBonus,10);
    npc.bubble={text:'谢谢你，好心人！',ts:Date.now()};
    toast('给流浪者5单位物资，幸运值临时+10');Sound.win();
  },

  initWeather(){
    G.weather={type:'clear',intensity:0,timer:0,nextChange:Date.now()+this.randomWeatherInterval()};
    G.tempLuckBonus=0;
  },
  randomWeatherInterval(){return(3+Math.random()*2)*60*1000},
  getWeatherName(type){const names={clear:'晴朗',fog:'浓雾'};return names[type]||type},
  getWeatherIcon(type){const icons={clear:'☀️',fog:'🌫️'};return icons[type]||'🌤️'},
  updateWeather(dt){
    const now=Date.now();
    if(now>=G.weather.nextChange){
      const types=['clear','clear','clear','fog'];
      const oldType=G.weather.type;
      G.weather.type=types[Math.floor(Math.random()*types.length)];
      G.weather.intensity=0.5+Math.random()*0.5;
      G.weather.timer=0;
      G.weather.nextChange=now+this.randomWeatherInterval();
      if(G.weather.type==='clear'){G.tempLuckBonus=5;toast('天气变晴朗！幸运值临时+5%')}else{G.tempLuckBonus=0}
      if(oldType!==G.weather.type){
        toast(`天气变为${this.getWeatherName(G.weather.type)} ${this.getWeatherIcon(G.weather.type)}`);
        this.broadcastWeather();
        Sound.startAmbient(G.weather.type);
      }
    }
    G.weather.timer+=dt;
    // 极少量雾粒子
    if(G.weather.type==='fog'){
      if(Math.random()<0.02){
        this.weatherParticles.push({x:Math.random()*this.mapW,y:Math.random()*this.mapH,vx:(Math.random()-.5)*0.2,vy:(Math.random()-.5)*0.2,life:5+Math.random()*3,size:2,color:'rgba(200,200,220,0.02)',type:'fog'});
      }
    }
    for(let i=this.weatherParticles.length-1;i>=0;i--){
      const p=this.weatherParticles[i];p.x+=p.vx*dt*60;p.y+=p.vy*dt*60;p.life-=dt;
      if(p.life<=0||p.x>this.mapW+50||p.y>this.mapH+50)this.weatherParticles.splice(i,1);
    }
    if(this.weatherParticles.length>5)this.weatherParticles.length=5;
  },
  broadcastWeather(){
    if(!G.mqtt||!G.mqttConnected)return;
    G.mqtt.publish(TOPIC_PRESENCE,JSON.stringify({type:'weather',weatherType:G.weather.type,intensity:G.weather.intensity,ts:Date.now(),id:G.myId}),{qos:0});
  },
  handleWeatherMsg(msg){
    if(!msg||msg.type!=='weather'||msg.id===G.myId)return;
    if(msg.weatherType&&msg.ts&&Date.now()-msg.ts<60000){
      G.weather.type=msg.weatherType;G.weather.intensity=msg.intensity||0.5;
    }
  },

  resize(){
    if(!this.canvas||!this.canvas.parentElement)return;
    const rect=this.canvas.parentElement.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    this.canvas.width=rect.width*dpr;this.canvas.height=rect.height*dpr;
    this.canvas.style.width=rect.width+'px';this.canvas.style.height=rect.height+'px';
    this.ctx=this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled=false;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.w=rect.width;this.h=rect.height;
    this.floorCache=null;this.dirty=true;this._cachedDecor=null;this._vignetteGrad=null;
    this.particles=[];this.me.x=Math.max(30,Math.min(this.mapW-30,this.me.x));this.me.y=Math.max(30,Math.min(this.mapH-30,this.me.y));
  },

  bindInput(){
    const c=this.canvas;this._onResize=()=>this.resize();window.addEventListener('resize',this._onResize);
    this._onKeyDown=e=>{if(G.inGame&&G.gameType){return}this.keys[e.key.toLowerCase()]=true;if(e.key==='Enter'){const bar=$('chat-bar');if(bar&&bar.style.display!=='none'){sendChat();e.preventDefault()}else{toggleChat();e.preventDefault()}}if(e.key==='Escape'){const modals=document.querySelectorAll('.modal-overlay.open');if(modals.length>0){modals[modals.length-1].remove();return}const bar=$('chat-bar');if(bar)bar.style.display='none';closeEmoteWheel()}if(e.key.toLowerCase()==='q'){showEmoteWheel()}if(e.key.toLowerCase()==='z'){this.me.sitting=!this.me.sitting;this.me.moving=false;if(this.me.sitting){this.me.emoji='🧘'}else{const ch=CHARACTERS[selectedChar];this.me.emoji=ch&&ch.skins?ch.skins[G.skinIndex||0]:ch?.emoji||'🐦'}this.broadcastPos()}};
    this._onKeyUp=e=>{this.keys[e.key.toLowerCase()]=false};
    window.addEventListener('keydown',this._onKeyDown);window.addEventListener('keyup',this._onKeyUp);
    this._sprintHintTimer=setTimeout(()=>{if(this.keys['shift']===undefined)toast('按住 Shift 冲刺移动')},15000);
    this._onTouchStart=e=>{
      const rect=c.getBoundingClientRect();
      const t=e.changedTouches[0];
      const tx=t.clientX-rect.left;
      const ty=t.clientY-rect.top;
      // 摇杆区域：左下45%宽度，下半屏
      if(tx<rect.width*0.45&&ty>rect.height*0.5){
        e.preventDefault();
        if(this.joystick.active)return;
        this._ignoreNextClick=true;
        this.joystick.active=true;
        this.joystick.touchId=t.identifier;
        this.joystick.cx=tx;
        this.joystick.cy=ty;
        this.joystick.dx=0;
        this.joystick.dy=0;
        this.joystick.opacity=1;
      }
      // 非摇杆区域不阻止默认行为，允许 click 事件正常触发
    };
    this._onTouchMove=e=>{if(this.joystick.active){e.preventDefault();for(const t of e.changedTouches){if(t.identifier===this.joystick.touchId){const rect=c.getBoundingClientRect();const tx=t.clientX-rect.left;const ty=t.clientY-rect.top;let ddx=tx-this.joystick.cx;let ddy=ty-this.joystick.cy;const dist=Math.sqrt(ddx*ddx+ddy*ddy);if(dist>40){ddx=(ddx/dist)*40;ddy=(ddy/dist)*40}this.joystick.dx=ddx/40;this.joystick.dy=ddy/40;this.joystick.opacity=1}}}};
    this._onTouchEnd=e=>{for(const t of e.changedTouches){if(t.identifier===this.joystick.touchId){this.joystick.active=false;this.joystick.dx=0;this.joystick.dy=0;this.joystick.touchId=null;this.joystick.opacity=0.4}}};
    c.addEventListener('touchstart',this._onTouchStart,{passive:false});c.addEventListener('touchmove',this._onTouchMove,{passive:false});c.addEventListener('touchend',this._onTouchEnd);c.addEventListener('touchcancel',this._onTouchEnd);
  },

  update(dt){
    this.dayNightCycle+=dt*0.5;
    this.gameTime=(this.dayNightCycle/24)%24;
    const hour=this.gameTime;
    if(hour>=6&&hour<18){this.dayNightAlpha=0}
    else if(hour>=18&&hour<20){this.dayNightAlpha=(hour-18)/2*0.4}
    else if(hour>=20||hour<6){this.dayNightAlpha=0.6}
    const baseSpeed=280;const sprintSpeed=480;let dx=0,dy=0;
    if(this.keys['w']||this.keys['arrowup'])dy=-1;if(this.keys['s']||this.keys['arrowdown'])dy=1;if(this.keys['a']||this.keys['arrowleft'])dx=-1;if(this.keys['d']||this.keys['arrowright'])dx=1;
    let isSprinting=false;if(this.keys['shift'])isSprinting=true;
    if(this.joystick.active){const jLen=Math.sqrt(this.joystick.dx*this.joystick.dx+this.joystick.dy*this.joystick.dy);if(jLen>0.9)isSprinting=true}
    let speed=isSprinting?sprintSpeed:baseSpeed;
    speed*=1+G.stats.agility/200;
    // 沙尘暴减速已移除
    const isNight=hour>=20||hour<6;
    const ch=CHARACTERS[selectedChar];if(isNight&&ch&&ch.skills&&ch.skills.find(s=>s.effect==='nightSpeed'&&s.unlocked)){speed*=1.2}
    if(this.me.sitting){dx=0;dy=0;this.me.moving=false;this.me.animState='sit'}
    const isMovingNow=(dx!==0||dy!==0)||(this.joystick.active&&(this.joystick.dx!==0||this.joystick.dy!==0))||this.me.moving;
    if(dx!==0||dy!==0){const len=Math.sqrt(dx*dx+dy*dy);dx/=len;dy/=len;this.lastDir.x=dx;this.lastDir.y=dy;this.me.faceDir=dx<0?-1:1;this.me.x+=dx*speed*dt;this.me.y+=dy*speed*dt;this.me.moving=true;this.me.animState='walk'}
    else if(this.joystick.active&&(this.joystick.dx!==0||this.joystick.dy!==0)){if(this.me.moving){this.me.moving=false;this.me.tx=this.me.x;this.me.ty=this.me.y;}this.lastDir.x=this.joystick.dx;this.lastDir.y=this.joystick.dy;this.me.faceDir=this.joystick.dx<0?-1:1;this.me.x+=this.joystick.dx*speed*dt;this.me.y+=this.joystick.dy*speed*dt;this.me.moving=true;this.me.animState='walk'}
    else if(this.me.moving){const tx=this.me.tx,ty=this.me.ty;const ddx=tx-this.me.x,ddy=ty-this.me.y;const dist=Math.sqrt(ddx*ddx+ddy*ddy);if(dist<5){this.me.moving=false;this.me.animState='idle'}else{const mx=(ddx/dist)*speed*dt,my=(ddy/dist)*speed*dt;this.me.x+=mx;this.me.y+=my;this.me.faceDir=mx<0?-1:1;this.me.animState='walk'}}
    else if(!this.me.sitting){this.me.animState='idle'}
    const chClimb=CHARACTERS[selectedChar];const hasClimb=chClimb&&chClimb.skills&&chClimb.skills.find(s=>s.effect==='climb'&&s.unlocked);const margin=hasClimb?0:16;this.me.x=Math.max(margin,Math.min(this.mapW-margin,this.me.x));this.me.y=Math.max(margin,Math.min(this.mapH-margin,this.me.y));
    const edgeDist=Math.min(this.me.x,this.me.y,this.mapW-this.me.x,this.mapH-this.me.y);
    const bw=$('boundary-warning');if(bw)bw.style.display=edgeDist<50?'block':'none';
    this.checkTableInteraction();this._lightAngle+=dt*0.5;
    this.updateWeather(dt);this.updateNPCs(dt);
    const newRegion=this.getRegionAt(this.me.x,this.me.y);
    if(newRegion!==this.currentRegion){this.currentRegion=newRegion;if(newRegion){this._regionFlash=0.7;this._regionFlashColor=newRegion==='slum'?'rgb(100,80,50)':newRegion==='black'?'rgb(150,50,50)':'rgb(80,120,80)';this._regionToastName=this.getRegionName(newRegion);this._regionToastTime=3.5;}}
    const now=Date.now();if(now-this.lastBroadcast>100){this.lastBroadcast=now;this.broadcastPos()}
    for(const[id,p]of this.others){if(now-p.lastSeen>10000)this.others.delete(id)}
    for(const[id,p]of this.others){if(p.tx!==undefined){p.x+=(p.tx-p.x)*0.15;p.y+=(p.ty-p.y)*0.15}if(p.fadeIn<1)p.fadeIn=Math.min(1,p.fadeIn+0.05);if(p.scale<1)p.scale=Math.min(1,p.scale+0.04);if(p.reaction&&now-p.reactionTime>2000)p.reaction=null;if(p.warpParticles){for(let i=p.warpParticles.length-1;i>=0;i--){const wp=p.warpParticles[i];wp.x+=wp.vx;wp.y+=wp.vy;wp.life-=dt*2;if(wp.life<=0)p.warpParticles.splice(i,1)}}}
    if(isMovingNow&&Math.random()<.2){const pCount=isSprinting?1:0;for(let pi=0;pi<pCount;pi++){this.walkParticles.push({x:this.me.x+(Math.random()-.5)*8,y:this.me.y+12,vy:-Math.random()*.6-.3,life:1,size:1.5+Math.random(),color:isSprinting?'#ffdd88':'#b4a078'});}if(Math.random()<.06)Sound.step()}
    // 辐射雨绿色轨迹已移除
    this.greenTrails=[];
    for(let i=this.walkParticles.length-1;i>=0;i--){const wp=this.walkParticles[i];wp.y+=wp.vy*dt*60;wp.life-=dt*2;if(wp.life<=0)this.walkParticles.splice(i,1)}if(this.walkParticles.length>20)this.walkParticles.length=20;
    for(const ap of this.ambientParticles){ap.x+=ap.vx*dt;ap.y+=ap.vy*dt;if(ap.x<0)ap.x+=this.mapW;if(ap.x>this.mapW)ap.x-=this.mapW;if(ap.y<0)ap.y+=this.mapH;if(ap.y>this.mapH)ap.y-=this.mapH}
    for(const dp of this._dustParticles){dp.x+=dp.vx*dt;dp.y+=dp.vy*dt;if(dp.x<0)dp.x+=this.mapW;if(dp.x>this.mapW)dp.x-=this.mapW;if(dp.y<0)dp.y+=this.mapH;if(dp.y>this.mapH)dp.y-=this.mapH}
    // 喷泉粒子已移除
    this.fountainTime+=dt;
    for(const crate of this.lootCrates){crate.sparkleTime+=dt*3;if(crate.cooldown>0){crate.cooldown-=dt;if(crate.cooldown<0)crate.cooldown=0}if(crate.openAnim>0){crate.openAnim-=dt*2;if(crate.openAnim<0)crate.openAnim=0}}
    for(const b of this.barrels){
      if(b.state==='rolling'){b.x+=b.vx*dt*60;b.y+=b.vy*dt*60;b.vx*=0.95;b.vy*=0.95;if(Math.sqrt(b.vx*b.vx+b.vy*b.vy)<10){b.state='explode';b.explodeAnim=1;this.doBarrelExplosion(b.x,b.y)}}
      if(b.state==='explode'){b.explodeAnim-=dt;if(b.explodeAnim<=0){b.state='dead';b.respawnTimer=30}}
      if(b.state==='dead'){b.respawnTimer-=dt;if(b.respawnTimer<=0){b.state='idle';b.x=50+Math.random()*(this.mapW-100);b.y=50+Math.random()*(this.mapH-100)}}
    }
    if(this.portal){this.portal.active=true;const pdx=this.me.x-this.portal.x,pdy=this.me.y-this.portal.y;if(Math.sqrt(pdx*pdx+pdy*pdy)<30&&this.portal.active){this.doPortalTeleport()}}
    for(const scrap of this.scraps){if(scrap.collected)continue;const sdx=this.me.x-scrap.x,sdy=this.me.y-scrap.y;if(Math.sqrt(sdx*sdx+sdy*sdy)<20){scrap.collected=true;this.scrapCount++;const chVal=CHARACTERS[selectedChar];const hasScrapValue=chVal&&chVal.skills&&chVal.skills.find(s=>s.effect==='scrapValue'&&s.unlocked);const val=hasScrapValue?2:1;G.chips+=val;Sound.chip();toast(`收集废金属 +${val} (${this.scrapCount})`);updateChips();}}
    if(this._screenShake>0){this._screenShake-=dt*5;if(this._screenShake<0)this._screenShake=0}
    if(this._transitionAlpha!==this._transitionTarget){const diff=this._transitionTarget-this._transitionAlpha;this._transitionAlpha+=diff*Math.min(1,dt*3)}
  },

  doAction(){
    // 检查附近的交互对象
    if(this.me.sitting){this.leaveTable();return}
    // 检查NPC（优先）
    for(const npc of this.npcs){
      const dx=this.me.x-npc.x,dy=this.me.y-npc.y;
      if(Math.sqrt(dx*dx+dy*dy)<40){
        if(npc.type==='merchant'){this.openNPCShop(npc);return}
        else if(npc.type==='beggar'){this.giveToBeggar(npc);return}
        return;
      }
    }
    if(this._hoveredTable){this.joinTable(this._hoveredTable);return}
    // 检查物资箱
    for(const c of this.lootCrates){
      const dx=c.x-this.me.x,dy=c.y-this.me.y;
      if(Math.sqrt(dx*dx+dy*dy)<30&&c.cooldown<=0){this.openCrate(c);return}
    }
    // 检查油桶
    for(const b of this.barrels){
      if(b.state!=='idle')continue;
      const dx=b.x-this.me.x,dy=b.y-this.me.y;
      if(Math.sqrt(dx*dx+dy*dy)<30){this.kickBarrel(b);return}
    }
    // 检查长椅
    for(const b of this.benches){
      const dx=b.x-this.me.x,dy=b.y-this.me.y;
      if(Math.sqrt(dx*dx+dy*dy)<40){sitOnBench();return}
    }
  },
  checkTableInteraction(){
    const hint=$('interact-hint');if(!hint)return;
    let nearTable=null;let minDist=Infinity;
    for(const t of this.tables){const dx=t.x-this.me.x,dy=t.y-this.me.y;const dist=Math.sqrt(dx*dx+dy*dy);if(dist<70&&dist<minDist){minDist=dist;nearTable=t}}
    this._hoveredTable=nearTable;
    // 检查物资箱
    let nearCrate=null;for(const c of this.lootCrates){const dx=c.x-this.me.x,dy=c.y-this.me.y;if(Math.sqrt(dx*dx+dy*dy)<30&&c.cooldown<=0){nearCrate=c;break}}
    // 检查油桶
    let nearBarrel=null;for(const b of this.barrels){if(b.state!=='idle')continue;const dx=b.x-this.me.x,dy=b.y-this.me.y;if(Math.sqrt(dx*dx+dy*dy)<30){nearBarrel=b;break}}
    // 检查长椅
    let nearBench=null;for(const b of this.benches){const dx=b.x-this.me.x,dy=b.y-this.me.y;if(Math.sqrt(dx*dx+dy*dy)<40){nearBench=b;break}}
    // 检查NPC
    let nearNPC=null;
    for(const npc of this.npcs){const dx=this.me.x-npc.x,dy=this.me.y-npc.y;if(Math.sqrt(dx*dx+dy*dy)<40){nearNPC=npc;break}}
    // 更新交互按钮
    const actionBtn=$('action-btn');
    if(actionBtn){
      if(nearNPC||nearTable||nearCrate||nearBarrel||nearBench||this.me.sitting){
        actionBtn.style.display='block';
        if(this.me.sitting)actionBtn.textContent='🚪';
        else if(nearNPC)actionBtn.textContent=nearNPC.type==='merchant'?'🛒':nearNPC.type==='beggar'?'🪙':'🛡️';
        else if(nearTable)actionBtn.textContent='🎮';
        else if(nearCrate)actionBtn.textContent='📦';
        else if(nearBarrel)actionBtn.textContent='⚽';
        else actionBtn.textContent='🪑';
      }else{
        actionBtn.style.display='none';
      }
    }
    if(this.me.sitting){hint.textContent='点击退出桌子';hint.style.display='block';hint.style.fontSize='16px';return;}
    if(nearNPC){
      const npc=nearNPC;
      if(npc.type==='merchant'){hint.textContent='🛒 点击交互 — 打开商店';hint.style.display='block';hint.style.fontSize='14px';hint.style.opacity=1;}
      else if(npc.type==='beggar'){hint.textContent='🪙 点击交互 — 施舍物资';hint.style.display='block';hint.style.fontSize='14px';hint.style.opacity=1;}
      else if(npc.type==='guard'){hint.textContent='🛡️ 守卫正在巡逻';hint.style.display='block';hint.style.fontSize='14px';hint.style.opacity=1;}
      return;
    }
    if(nearTable){const status=nearTable.players>=nearTable.max?' (满员)':nearTable.code?` (${nearTable.players}/${nearTable.max})`:' (空桌)';hint.textContent=`${nearTable.label}${status} — 点击加入`;hint.style.display='block';hint.style.fontSize='14px';hint.style.opacity=1;if(this.keys['e']){this.keys['e']=false;this.joinTable(nearTable)}}else if(nearCrate){hint.textContent='📦 点击交互 — 打开物资箱';hint.style.display='block';hint.style.fontSize='13px';hint.style.opacity=1;if(this.keys['e']){this.keys['e']=false;this.openCrate(nearCrate)}}else if(nearBarrel){hint.textContent='⚽ 点击交互 — 踢油桶';hint.style.display='block';hint.style.fontSize='13px';hint.style.opacity=1;if(this.keys['e']){this.keys['e']=false;this.kickBarrel(nearBarrel)}}else if(nearBench){hint.textContent='🪑 点击交互 — 坐下';hint.style.display='block';hint.style.fontSize='13px';hint.style.opacity=1;if(this.keys['e']){this.keys['e']=false;sitOnBench()}}else{hint.style.display='none'}
  },

  openCrate(crate){
    if(crate.cooldown>0||crate.opened&&crate.cooldown<=0){crate.opened=false}
    crate.opened=true;crate.openAnim=1;crate.cooldown=60;
    const isScrap=Math.random()<0.3;const amount=isScrap?1:(1+Math.floor(Math.random()*5));
    if(isScrap){const chVal=CHARACTERS[selectedChar];const hasScrapValue=chVal&&chVal.skills&&chVal.skills.find(s=>s.effect==='scrapValue'&&s.unlocked);const val=hasScrapValue?2:1;G.chips+=val;toast(`物资箱：获得废金属 x${val}`)}
    else{G.chips+=amount;toast(`物资箱：获得${amount}单位物资`)}
    Sound.chip();updateChips();save();
  },
  kickBarrel(barrel){
    const dx=this.me.x-barrel.x,dy=this.me.y-barrel.y;const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<1)dist=1;
    barrel.vx=-(dx/dist)*(200+Math.random()*100);barrel.vy=-(dy/dist)*(200+Math.random()*100);
    barrel.state='rolling';Sound.click();
  },
  doBarrelExplosion(x,y){
    this._screenShake=2;Sound.lose();
    for(let i=0;i<20;i++){this._dustParticles.push({x,y,vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8-2,size:2+Math.random()*4,alpha:0.8})}
    for(const[id,p]of this.others){const dx=p.x-x,dy=p.y-y;if(Math.sqrt(dx*dx+dy*dy)<100){p.chatBubble={text:'啊！',name:p.name||'幸存者',emoji:p.emoji||'🐦',ts:Date.now()}}}
  },
  doPortalTeleport(){
    const targets=[[this.mapW-100,this.mapH-100],[this.mapW-100,100],[100,this.mapH-100],[this.mapW/2,this.mapH/2]];
    const target=targets[Math.floor(Math.random()*targets.length)];
    this.portalParticles=[];for(let i=0;i<20;i++){this.portalParticles.push({x:this.me.x,y:this.me.y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:1,color:'#b8960f'})}
    this.me.x=target[0];this.me.y=target[1];this.me.moving=false;
    toast('传送门：你被传送到了地图另一端！');Sound.win();
  },

  joinTable(table){
    if(table.players>=table.max){toast('这桌满了');return}
    if(table.code){
      this.me.sitting=true;
      this.me.moving=false;
      this.me.sitTable=table;
      toast(`已坐到 ${table.label}，点击退出才能移动`);
      Sound.join();
      const hint=$('interact-hint');
      if(hint)hint.textContent='已入座 — 点击退出桌子';
    }else{toast('空桌子，先搭一个吧');showCreateModal()}
  },
  leaveTable(){
    this.me.sitting=false;
    this.me.sitTable=null;
    toast('已离开桌子');
  },

  broadcastPos(){if(!G.mqtt||!G.mqttConnected)return;const msg={type:'pos',x:Math.round(this.me.x),y:Math.round(this.me.y),name:G.user,emoji:this.me.emoji,sitting:this.me.sitting,animState:this.me.animState,faceDir:this.me.faceDir};G.mqtt.publish(`wl_pos_v6/${G.myId}`,JSON.stringify(msg),{qos:0})},

  handlePos(msg,fromId){
    if(fromId===G.myId)return;let mx=typeof msg.x==='number'&&!isNaN(msg.x)?msg.x:0;let my=typeof msg.y==='number'&&!isNaN(msg.y)?msg.y:0;mx=Math.max(0,Math.min(this.mapW,mx));my=Math.max(0,Math.min(this.mapH,my));const existing=this.others.get(fromId);if(existing){existing.tx=mx;existing.ty=my;existing.emoji=msg.emoji||'🐦';existing.name=msg.name||'幸存者';existing.lastSeen=Date.now();if(msg.sitting!==undefined)existing.sitting=msg.sitting;if(msg.animState)existing.animState=msg.animState;if(msg.faceDir)existing.faceDir=msg.faceDir;}else{this.others.set(fromId,{x:mx,y:my,tx:mx,ty:my,emoji:msg.emoji||'🐦',name:msg.name||'幸存者',lastSeen:Date.now(),fadeIn:0,scale:0,reaction:null,reactionTime:0,warpParticles:[],sitting:msg.sitting||false,animState:msg.animState||'idle',faceDir:msg.faceDir||1});for(let i=0;i<12;i++){const p=this.others.get(fromId);if(p)p.warpParticles.push({x:mx,y:my,vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*3,life:1})}}
  },

  updateTablesFromState(){
    this.tables.forEach(t=>{t.code='';t.players=0;t.host=''});const usedIdx=new Set();
    for(const code in G.knownRooms){const r=G.knownRooms[code];if(Date.now()-r.ts>30000)continue;const idx=this.tables.findIndex((x,i)=>x.game===r.game&&x.code===''&&!usedIdx.has(i));if(idx!==-1){usedIdx.add(idx);const t=this.tables[idx];t.code=code;t.players=r.players||1;t.max=MAX_SEATS;t.host=r.name||''}}
    if(G.isHost&&G.roomCode){const idx=this.tables.findIndex((x,i)=>x.game===G.gameType&&!usedIdx.has(i));if(idx!==-1){usedIdx.add(idx);const t=this.tables[idx];t.code=G.roomCode;t.players=G.roomPeers.length;t.max=MAX_SEATS;t.host=G.user}}
  },

  // ==================== 核心绘制 ====================
  draw(){
    const ctx=this.ctx;if(!ctx)return;if(this.canvas.width<100||this.canvas.height<100)this.resize();
    this._updateCamera();ctx.fillStyle='#1a1610';ctx.fillRect(0,0,this.w,this.h);
    ctx.save();ctx.translate(-this.camera.x,-this.camera.y);
    // 地板
    this._drawFloor(ctx);
    // 墙壁
    ctx.fillStyle='#7a6540';
    ctx.fillRect(0,0,this.mapW,20);ctx.fillRect(0,this.mapH-20,this.mapW,20);
    ctx.fillRect(0,0,20,this.mapH);ctx.fillRect(this.mapW-20,0,20,this.mapH);
    // 装饰物
    if(this._cachedDecor){ctx.drawImage(this._cachedDecor,0,0)}else{const dc=document.createElement('canvas');dc.width=this.mapW;dc.height=this.mapH;const dctx=dc.getContext('2d');dctx.imageSmoothingEnabled=false;_drawDecorFunc(dctx,this.mapW,this.mapH);this._cachedDecor=dc;ctx.drawImage(dc,0,0)}
    // 废金属
    this._drawScraps(ctx);
    // 物资箱
    for(const crate of this.lootCrates){this._drawCrate(ctx,crate)}
    // 油桶
    for(const b of this.barrels){if(b.state!=='dead')this._drawBarrel(ctx,b)}
    // 传送门
    if(this.portal)this._drawPortal(ctx,this.portal);
    // 长椅（像素风格）
    for(const b of this.benches){const bx=Math.floor(b.x),by=Math.floor(b.y);ctx.fillStyle='#5a4a30';ctx.fillRect(bx-22,by-9,44,18);ctx.strokeStyle='#7a6a4a';ctx.lineWidth=2;ctx.strokeRect(bx-22,by-9,44,18);ctx.fillStyle='#3a3020';ctx.fillRect(bx-18,by-14,36,5);ctx.fillRect(bx-18,by+9,36,5)}
    // 桌子
    for(const t of this.tables){const dx=t.x-this.me.x,dy=t.y-this.me.y;const dist=Math.sqrt(dx*dx+dy*dy);const isHovered=dist<50;const isFull=t.code&&t.players>=t.max;_drawTable(ctx,t,isHovered,isFull,this.time)}
    // 绿色轨迹已移除（辐射雨已移除）
    // NPC
    this.drawNPCs(ctx);
    // 其他玩家
    for(const[id,p]of this.others){
      const pdx=p.x-this.me.x,pdy=p.y-this.me.y;const pDist=Math.sqrt(pdx*pdx+pdy*pdy);
      let pAlpha=1;if(G.weather.type==='fog'&&pDist>300)pAlpha=Math.max(0.1,1-(pDist-300)/400);
      // 沙尘暴透明度已移除
      ctx.globalAlpha=pAlpha;
      _drawAnimatedPlayer(ctx,p.x,p.y,p.emoji||'🐦',p,false,this.time);
      ctx.globalAlpha=1;
    }
    // 自己
    _drawAnimatedPlayer(ctx,this.me.x,this.me.y,this.me.emoji,this.me,true,this.time);
    // 行走粒子
    _drawWalkParticles(ctx,this.walkParticles);
    // 环境粒子
    _drawAmbientParticles(ctx,this.ambientParticles);
    // 灰尘粒子
    _drawDustParticles(ctx,this._dustParticles);
    // 天气粒子极简化（最多5个）
    let wpCount=0;
    for(const wp of this.weatherParticles){
      if(wpCount>=5)break;
      ctx.globalAlpha=Math.min(1,wp.life);
      ctx.fillStyle=wp.color||'rgba(200,200,220,0.02)';
      ctx.fillRect(Math.floor(wp.x),Math.floor(wp.y),Math.floor(wp.size)||2,Math.floor(wp.size)||2);
      wpCount++;
    }
    ctx.globalAlpha=1;
    ctx.restore();
    // 小地图
    Lobby._drawMinimap(ctx);
    // 欢迎消息
    Lobby._drawWelcome(ctx);
    // 功能引导提示
    Lobby._drawFeatureGuide(ctx);
    // 暗角
    this._drawVignette(ctx);
    // 摇杆
    this._drawJoystick(ctx);
    // 转场
    this._drawTransition(ctx);
    // 昼夜遮罩简化
    if(this.dayNightAlpha>0.01){ctx.fillStyle=`rgba(10,10,30,${this.dayNightAlpha*0.12})`;ctx.fillRect(0,0,this.w,this.h)}
    // 天气遮罩 - 沙尘暴和辐射雨已移除，雾极简化
    if(G.weather.type==='fog'){ctx.fillStyle='rgba(200,200,220,0.02)';ctx.fillRect(0,0,this.w,this.h)}
    // 灯笼光晕已移除（减少光污染）
    // 区域切换闪烁已移除
    // 区域名称toast简化
    if(this._regionToastTime>0){
      this._regionToastTime-=0.016;
      const ta=Math.min(1,this._regionToastTime/0.8);
      ctx.globalAlpha=ta;
      ctx.fillStyle='#b8960f';
      ctx.font='bold 14px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(this._regionToastName,this.w/2,this.h/2-40);
      ctx.globalAlpha=1;
      if(this._regionToastTime<=0)this._regionToastName='';
    }
    // 天气UI
    this._drawWeatherUI(ctx);
    // 时间钟表
    this._drawClock(ctx);
  },

  _drawWeatherUI(ctx){
    ctx.fillStyle='#d4c8a8';
    ctx.font='10px monospace';
    ctx.textAlign='left';
    ctx.textBaseline='top';
    const icon=this.getWeatherIcon(G.weather.type);
    const name=this.getWeatherName(G.weather.type);
    ctx.fillText(`${icon} ${name}`,8,8);
  },

  _updateCamera(){
    const targetX=this.me.x-this.w/2;const targetY=this.me.y-this.h/2;
    this.camera.x+=(targetX-this.camera.x)*0.08;this.camera.y+=(targetY-this.camera.y)*0.08;
    this.camera.x=Math.max(0,Math.min(this.mapW-this.w,this.camera.x));this.camera.y=Math.max(0,Math.min(this.mapH-this.h,this.camera.y));
  },

  getRegionAt(x,y){
    if(x>=0&&x<=400&&y>=400&&y<=750)return'slum';
    if(x>=600&&x<=1000&&y>=0&&y<=350)return'black';
    if(x>=300&&x<=700&&y>=200&&y<=550)return'safe';
    return'neutral';
  },
  getRegionColor(r){return{slum:'#4a3828',black:'#6a2828',safe:'#3a4a2a'}[r]||'#4a4028'},
  getRegionName(r){return{slum:'贫民区',black:'黑市区',safe:'安全区'}[r]||''},
  _drawFloor(ctx){
    const tm=this.sprites['tilemap'];
    if(tm&&tm.complete&&tm.width>=16){
      // Kenney tilemap: 203x186, 16x16格子
      // 前2行是草地/泥土地板图块
      const tileSize=16;
      const cols=Math.floor(tm.width/tileSize); // ~12列
      const startX=Math.floor(this.camera.x/tileSize)*tileSize;
      const startY=Math.floor(this.camera.y/tileSize)*tileSize;
      const endX=startX+this.w+tileSize*2;
      const endY=startY+this.h+tileSize*2;

      for(let tx=startX;tx<endX;tx+=tileSize){
        for(let ty=startY;ty<endY;ty+=tileSize){
          if(tx<0||ty<0||tx>=this.mapW||ty>=this.mapH)continue;
          const region=this.getRegionAt(tx+tileSize/2,ty+tileSize/2);

          // 选择图块：根据区域和位置
          let tileIdx=0;
          if(region==='slum'){
            // 贫民窟：用泥土/深色图块
            tileIdx=((Math.abs(Math.floor(tx/tileSize))%3)*cols)+Math.abs(Math.floor(ty/tileSize))%2;
          }else if(region==='black'){
            // 黑市：用石头/深色图块
            tileIdx=((Math.abs(Math.floor(tx/tileSize))%3)*cols)+2;
          }else if(region==='safe'){
            // 安全区：用草地/浅色图块
            tileIdx=((Math.abs(Math.floor(tx/tileSize))%4)*cols)+Math.abs(Math.floor(ty/tileSize))%3;
          }else{
            // 中立区：混合
            tileIdx=((Math.abs(Math.floor(tx/tileSize))+Math.abs(Math.floor(ty/tileSize)))%6)*cols+Math.abs(Math.floor(ty/tileSize))%3;
          }

          const sx=(tileIdx%cols)*tileSize;
          const sy=Math.floor(tileIdx/cols)*tileSize;

          if(sx+tileSize<=tm.width&&sy+tileSize<=tm.height){
            ctx.drawImage(tm,sx,sy,tileSize,tileSize,Math.floor(tx),Math.floor(ty),tileSize,tileSize);
          }
        }
      }
    }else{
      // 后备：纯色
      const tileSize=16;
      const startX=Math.floor(this.camera.x/tileSize)*tileSize;
      const startY=Math.floor(this.camera.y/tileSize)*tileSize;
      for(let tx=startX;tx<startX+this.w+tileSize;tx+=tileSize){
        for(let ty=startY;ty<startY+this.h+tileSize;ty+=tileSize){
          if(tx<0||ty<0||tx>=this.mapW||ty>=this.mapH)continue;
          ctx.fillStyle=this.getRegionColor(this.getRegionAt(tx+tileSize/2,ty+tileSize/2));
          ctx.fillRect(Math.floor(tx),Math.floor(ty),tileSize,tileSize);
        }
      }
    }
    this._drawRegionBorders(ctx);
  },
  _drawRegionBorders(ctx){
    ctx.strokeStyle='rgba(100,80,60,0.4)';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(400,400);ctx.lineTo(400,750);
    ctx.moveTo(600,0);ctx.lineTo(600,350);
    ctx.moveTo(300,200);ctx.lineTo(700,200);
    ctx.moveTo(300,550);ctx.lineTo(700,550);
    ctx.stroke();
  },

  _drawVignette(ctx){
    // 极度简化：只画一层极淡遮罩
    ctx.fillStyle='rgba(10,8,6,0.03)';
    ctx.fillRect(0,0,this.w,this.h);
  },

  _drawJoystick(ctx){
    if(!this.joystick.active&&this.joystick.opacity<=0)return;
    const cx=Math.floor(this.joystick.cx),cy=Math.floor(this.joystick.cy);
    const op=this.joystick.opacity||0.6;
    ctx.fillStyle=`rgba(255,255,255,${0.1*op})`;
    ctx.fillRect(cx-40,cy-40,80,80);
    ctx.strokeStyle=`rgba(255,255,255,${0.2*op})`;
    ctx.lineWidth=2;
    ctx.strokeRect(cx-40,cy-40,80,80);
    const ix=Math.floor(cx+this.joystick.dx*40);
    const iy=Math.floor(cy+this.joystick.dy*40);
    ctx.fillStyle=`rgba(212,168,32,${op})`;
    ctx.fillRect(ix-12,iy-12,24,24);
    ctx.strokeStyle=`rgba(255,255,255,${0.25*op})`;
    ctx.lineWidth=1;
    ctx.strokeRect(ix-12,iy-12,24,24);
    if(!this.joystick.active&&op>0){this.joystick.opacity=Math.max(0,op-0.02)}
  },

  _drawTransition(ctx){
    if(this._transitionAlpha>0.01){ctx.fillStyle=`rgba(10,8,6,${this._transitionAlpha})`;ctx.fillRect(0,0,this.w,this.h)}
  },

  _drawScraps(ctx){
    for(const scrap of this.scraps){
      if(scrap.collected)continue;
      const sx=Math.floor(scrap.x),sy=Math.floor(scrap.y);
      ctx.fillStyle='#8a8070';
      ctx.fillRect(sx-3,sy-3,6,6);
      ctx.strokeStyle='#a09080';
      ctx.lineWidth=1;
      ctx.strokeRect(sx-3,sy-3,6,6);
    }
  },

  _drawCrate(ctx,crate){
    const x=Math.floor(crate.x),y=Math.floor(crate.y);
    const tm=this.sprites['tilemap'];
    if(tm&&tm.complete&&tm.width>=16){
      // Kenney tilemap 宝箱在右下角区域（约第10-11行，第8-10列）
      const tileSize=16;
      const cols=Math.floor(tm.width/tileSize);
      // 宝箱图块位置：第10行第8列
      const sx=8*tileSize;
      const sy=10*tileSize;
      const drawSize=32;
      if(sx+tileSize<=tm.width&&sy+tileSize<=tm.height){
        ctx.drawImage(tm,sx,sy,tileSize,tileSize,x-drawSize/2,y-drawSize/2,drawSize,drawSize);
      }
    }else{
      // 后备：像素矩形
      const size=26;
      ctx.fillStyle='#6a5a3a';
      ctx.fillRect(x-size,y-size/2,size*2,size);
      ctx.strokeStyle='#b8960f';
      ctx.lineWidth=2;
      ctx.strokeRect(x-size,y-size/2,size*2,size);
    }
    if(!crate.opened){
      ctx.fillStyle='#b8960f';
      ctx.font='14px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText('📦',x,y);
    }else{
      ctx.fillStyle='#7a7060';
      ctx.font='10px monospace';
      ctx.fillText('空',x,y);
    }
    if(crate.cooldown>0){
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.font='10px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(`${Math.ceil(crate.cooldown)}s`,x,y+20);
    }
  },
  _drawBarrel(ctx,b){
    const x=Math.floor(b.x),y=Math.floor(b.y);
    const tm=this.sprites['tilemap'];
    if(tm&&tm.complete&&tm.width>=16){
      // Kenney tilemap 桶图块在右下角区域（约第10-11行，第10-11列）
      const tileSize=16;
      const sx=10*tileSize;
      const sy=10*tileSize;
      const drawSize=28;
      if(sx+tileSize<=tm.width&&sy+tileSize<=tm.height){
        ctx.drawImage(tm,sx,sy,tileSize,tileSize,x-drawSize/2,y-drawSize/2,drawSize,drawSize);
      }
    }else{
      // 后备：像素矩形
      const r=16;
      ctx.fillStyle=b.state==='explode'?'#ff6622':'#c4463a';
      ctx.fillRect(x-r,y-r,r*2,r*2);
      ctx.strokeStyle='#8b2020';
      ctx.lineWidth=2;
      ctx.strokeRect(x-r,y-r,r*2,r*2);
    }
    if(b.state==='explode'&&b.explodeAnim>0){
      ctx.fillStyle=`rgba(255,100,30,${b.explodeAnim})`;
      ctx.fillRect(x-26,y-26,52,52);
    }
  },
  _drawPortal(ctx,portal){
    const x=Math.floor(portal.x),y=Math.floor(portal.y);
    const tm=this.sprites['tilemap'];
    if(tm&&tm.complete&&tm.width>=16){
      // Kenney tilemap 门/拱门图块在中间区域（约第6-7行，第6-8列）
      const tileSize=16;
      const sx=6*tileSize;
      const sy=6*tileSize;
      const drawSize=40;
      if(sx+tileSize<=tm.width&&sy+tileSize<=tm.height){
        ctx.drawImage(tm,sx,sy,tileSize,tileSize,x-drawSize/2,y-drawSize/2,drawSize,drawSize);
      }
    }else{
      // 后备：像素矩形
      ctx.fillStyle='#4a3a20';
      ctx.fillRect(x-20,y-20,40,40);
      ctx.strokeStyle='#b8960f';
      ctx.lineWidth=2;
      ctx.strokeRect(x-20,y-20,40,40);
    }
    ctx.fillStyle='#b8960f';
    ctx.font='9px monospace';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('传送门',x,y+28);
  },

  startLoop(){
    let last=performance.now();let skipped=0;
    const loop=(now)=>{
      if(document.hidden){this.animId=requestAnimationFrame(loop);return}
      let dt=(now-last)/1000;last=now;if(dt>0.1){dt=0.016;skipped++;if(skipped>5)skipped=0}this.time+=dt;this.update(dt);
    // 交互动作计时恢复
    if(this.me.animState==='interact'){this.me.animTimer-=dt;if(this.me.animTimer<=0)this.me.animState='idle'}
    this.draw();this.animId=requestAnimationFrame(loop);
    };this.animId=requestAnimationFrame(loop);
  },

  stop(){if(this.animId){cancelAnimationFrame(this.animId);this.animId=null}if(this._onResize){window.removeEventListener('resize',this._onResize);this._onResize=null}if(this._onKeyDown){window.removeEventListener('keydown',this._onKeyDown);this._onKeyDown=null}if(this._onKeyUp){window.removeEventListener('keyup',this._onKeyUp);this._onKeyUp=null}if(this._onTouchStart&&this.canvas){this.canvas.removeEventListener('touchstart',this._onTouchStart);this.canvas.removeEventListener('touchmove',this._onTouchMove);this.canvas.removeEventListener('touchend',this._onTouchEnd);this.canvas.removeEventListener('touchcancel',this._onTouchEnd);this._onTouchStart=null;this._onTouchMove=null;this._onTouchEnd=null}if(this._sprintHintTimer){clearTimeout(this._sprintHintTimer);this._sprintHintTimer=null}},

  showTutorial(){
    const steps=[{text:'WASD或方向键移动角色',x:this.w/2,y:this.h/2+60},{text:'走近桌子按E或点击加入',x:this.w/2,y:this.h/2+60},{text:'点击右上角搭新桌创建房间',x:this.w/2,y:80},{text:'Enter键打开聊天',x:this.w/2,y:this.h-80}];let idx=0;
    const showNext=()=>{if(idx>=steps.length){localStorage.setItem('wl_tutorial','1');return}const s=steps[idx];const div=document.createElement('div');div.className='tutorial-overlay';div.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px';div.innerHTML=`<div style="background:var(--panel);border:1px solid var(--gold);padding:20px 28px;border-radius:4px;text-align:center;max-width:300px"><div style="font-size:14px;color:var(--text);margin-bottom:12px">${s.text}</div><button style="background:var(--gold);border:none;color:#1a1610;padding:8px 20px;border-radius:2px;font-size:12px;font-weight:700;cursor:pointer">下一步 (${idx+1}/${steps.length})</button></div>`;document.body.appendChild(div);div.querySelector('button').onclick=()=>{div.remove();idx++;showNext()}};showNext();
  },

  show(){this.init();if(!this.animId)this.startLoop()},hide(){this.stop()}
};

const _origRenderLobby=renderLobby;
renderLobby=function(){_origRenderLobby();Lobby.updateTablesFromState()};
function subscribeLobbyPos(){if(!G.mqtt)return;G.mqtt.subscribe('wl_pos_v6/+',{qos:0},(err)=>{if(err)console.warn('[Lobby] pos sub failed',err)})}
function bindLobbyCanvasClick(){
  const c=$('lobby-canvas');if(!c)return;
  c.addEventListener('click',e=>{
    if(Lobby._ignoreNextClick){Lobby._ignoreNextClick=false;return}
    const rect=c.getBoundingClientRect();
    const cx=e.clientX-rect.left+Lobby.camera.x;
    const cy=e.clientY-rect.top+Lobby.camera.y;
    // 先检查是否点击了功能引导栏按钮（屏幕坐标）
    const screenX=e.clientX-rect.left;
    const screenY=e.clientY-rect.top;
    if(Lobby._featureBtns){
      for(const btn of Lobby._featureBtns){
        if(screenX>=btn.x&&screenX<=btn.x+btn.w&&screenY>=btn.y&&screenY<=btn.y+btn.h){
          const msgs=[
            '昼夜循环：游戏内12分钟=24小时，夜晚灯笼亮起',
            '天气系统：沙尘暴减速、辐射雨收集物资、浓雾视野受限',
            '走近NPC商人按E键打开商店',
            '地图上有物资箱和油桶，走近点击收集',
            '地图左下角有传送门，走近点击传送到随机位置',
            '等级系统：打牌获得经验升级，解锁新技能'
          ];
          if(btn.idx===5){showSettings()}
          else{toast(msgs[btn.idx])}
          return;
        }
      }
    }
    // 检查是否点击了小地图
    const mx=Lobby.w-120-12,my=12;
    if(screenX>=mx&&screenX<=mx+120&&screenY>=my&&screenY<=my+80){
      const region=Lobby.getRegionName(Lobby.currentRegion)||'未知区域';
      toast(`📍 ${region} (${Math.round(Lobby.me.x)},${Math.round(Lobby.me.y)})`);
      return;
    }
    // 如果正在坐着，点击退出桌子
    if(Lobby.me.sitting){Lobby.leaveTable();return}
    // 先检查是否点击了桌子
    let clickedTable=false;
    for(const t of Lobby.tables){
      const dx=t.x-cx,dy=t.y-cy;
      if(Math.sqrt(dx*dx+dy*dy)<60){
        Lobby.joinTable(t);
        clickedTable=true;
        break;
      }
    }
    // 再检查是否点击了物资箱
    if(!clickedTable){
      for(const crate of Lobby.lootCrates){
        const dx=crate.x-cx,dy=crate.y-cy;
        if(Math.sqrt(dx*dx+dy*dy)<25){
          Lobby.openCrate(crate);
          clickedTable=true;
          break;
        }
      }
    }
    // 再检查是否点击了油桶
    if(!clickedTable){
      for(const b of Lobby.barrels){
        if(b.state==='dead')continue;
        const dx=b.x-cx,dy=b.y-cy;
        if(Math.sqrt(dx*dx+dy*dy)<20){
          Lobby.kickBarrel(b);
          clickedTable=true;
          break;
        }
      }
    }
    // 再检查是否点击了传送门
    if(!clickedTable&&Lobby.portal){
      const dx=Lobby.portal.x-cx,dy=Lobby.portal.y-cy;
      if(Math.sqrt(dx*dx+dy*dy)<30){
        // 传送
        Lobby.me.x=200+Math.random()*(Lobby.mapW-400);
        Lobby.me.y=200+Math.random()*(Lobby.mapH-400);
        Lobby.me.moving=false;
        toast('传送门将你传送到了另一个位置');
        clickedTable=true;
      }
    }
    // 如果没有点击任何交互物，则移动到点击位置
    if(!clickedTable){
      Lobby.me.tx=cx;Lobby.me.ty=cy;Lobby.me.moving=true;
    }
  });
}

// ==================== 辅助绘制函数 ====================
function _drawDecorFunc(ctx,w,h){
  ctx.imageSmoothingEnabled=false;
  const tm=Lobby.sprites['tilemap'];
  const tileSize=16;
  const cols=tm&&tm.complete?Math.floor(tm.width/tileSize):12;
  // 装饰位置列表：[x, y, 图块列, 图块行]
  // Kenney tilemap 树木大约在第3-5行，灌木在第2-3行
  const decorItems=[
    [35,35,3,3],[w-55,35,4,3],[35,h-55,3,4],[w-50,h-58,4,4],
    [300,300,5,3],[w-300,h-300,3,5],[w-300,300,4,3],[300,h-300,5,4],
    [w/2-40,h/2-30,3,3],[w/2+30,h/2+20,4,4],
    [120,80,5,3],[w-160,60,4,3],
    [90,h-140,3,4],[118,h-135,4,3],[108,h-150,5,4],
    [w-120,h-190,3,5]
  ];
  for(const[dx,dy,tc,tr]of decorItems){
    if(tm&&tm.complete&&tm.width>=16){
      const sx=tc*tileSize;
      const sy=tr*tileSize;
      const drawSize=32;
      if(sx+tileSize<=tm.width&&sy+tileSize<=tm.height){
        ctx.drawImage(tm,sx,sy,tileSize,tileSize,dx-drawSize/2,dy-drawSize/2,drawSize,drawSize);
      }
    }else{
      // 后备：纯色方块
      ctx.fillStyle='#4a3a20';
      ctx.fillRect(dx,dy,18,24);
      ctx.strokeStyle='#6a5a3a';
      ctx.lineWidth=1;
      ctx.strokeRect(dx,dy,18,24);
    }
  }
}

function _drawNameTag(ctx,x,y,name,isMe){
  const guildTag=getGuildTag();
  const fullName=guildTag+name;
  ctx.font=isMe?'bold 10px monospace':'10px monospace';
  let displayName=fullName;
  const maxNameW=120;
  let nameW=ctx.measureText(displayName).width;
  while(nameW>maxNameW&&displayName.length>1){displayName=displayName.slice(0,-1)+'...';nameW=ctx.measureText(displayName).width}
  const tagH=14;
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.fillRect(x-nameW/2-5,y-tagH/2,nameW+10,tagH);
  ctx.fillStyle=isMe?'#c4463a':'#a09080';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(displayName,x,y);
}

function _drawAnimatedPlayer(ctx,x,y,emoji,playerObj,isMe,time){
  const px=Math.floor(x),py=Math.floor(y);
  const p=playerObj||{};

  // 确定动画类型: 0=idle, 1=walk, 2=run, 3=hurt
  let animRow=0;
  if(p.animState==='walk')animRow=1;
  else if(p.animState==='sit')animRow=0;
  else if(p.animState==='interact')animRow=0;
  else animRow=0;

  // 确定动画帧
  let frame=0;
  if(p.animState==='walk'){
    frame=Math.floor(time*6)%12; // 12帧行走
  }else if(p.animState==='sit'){
    frame=Math.floor(time*2)%12; // 12帧idle
  }else if(p.animState==='interact'){
    frame=Math.floor(time*4)%12;
  }else{
    frame=Math.floor(time*3)%12; // 12帧idle呼吸
  }

  const sprite=Lobby.sprites['knight'];
  if(sprite&&sprite.complete&&sprite.width>48){
    // 小浣熊精灵图: 576x192, 4行(动画) x 12列(帧), 每帧48x48
    const cellW=48,cellH=48;
    const sx=frame*cellW;
    const sy=animRow*cellH;

    // 确定朝向: faceDir<0 向左, 需要水平翻转
    const faceDir=p.faceDir||1;
    const drawSize=32;
    const half=drawSize/2;

    ctx.save();
    ctx.translate(px,py);
    if(faceDir<0){
      // 向左: 水平翻转
      ctx.scale(-1,1);
      ctx.drawImage(sprite,sx,sy,cellW,cellH,-half,-half,drawSize,drawSize);
    }else{
      // 向右: 正常
      ctx.drawImage(sprite,sx,sy,cellW,cellH,-half,-half,drawSize,drawSize);
    }
    ctx.restore();
  }else{
    _drawPixelCharFallback(ctx,px,py,isMe);
  }

  // 名字标签
  if(p.name){
    ctx.fillStyle='rgba(0,0,0,0.7)';
    const nameW=Math.min(ctx.measureText(p.name).width,80);
    ctx.fillRect(px-nameW/2-4,py-30,nameW+8,12);
    ctx.fillStyle=isMe?'#4a7a3a':'#a09080';
    ctx.font='9px monospace';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(p.name,px,py-24);
  }
}

// 后备像素角色（当精灵图未加载时）
function _drawPixelCharFallback(ctx,px,py,isMe){
  // 元气骑士风格：大头小身体
  // 头部 10x10
  ctx.fillStyle=isMe?'#5a8a3c':'#7a7060';
  ctx.fillRect(px-5,py-16,10,10);
  // 身体 8x8
  ctx.fillStyle=isMe?'#4a7a2c':'#6a6050';
  ctx.fillRect(px-4,py-6,8,8);
  // 腿 3x4
  ctx.fillStyle=isMe?'#3a5a1c':'#5a5040';
  ctx.fillRect(px-4,py+2,3,4);
  ctx.fillRect(px+1,py+2,3,4);
  // 眼睛（2个白点）
  ctx.fillStyle='#fff';
  ctx.fillRect(px-3,py-13,2,2);
  ctx.fillRect(px+1,py-13,2,2);
}

function _drawNPCFallback(ctx,px,py,npc){
  // NPC后备：像素风格小人
  const colors=['#8a6050','#6a5080','#506a80','#806a50','#508060'];
  const c=colors[(npc.idx||0)%colors.length];
  ctx.fillStyle=c;
  ctx.fillRect(px-5,py-16,10,10); // 头
  ctx.fillRect(px-4,py-6,8,8); // 身体
  ctx.fillRect(px-4,py+2,3,4); // 左腿
  ctx.fillRect(px+1,py+2,3,4); // 右腿
  // 眼睛
  ctx.fillStyle='#fff';
  ctx.fillRect(px-3,py-13,2,2);
  ctx.fillRect(px+1,py-13,2,2);
}
function _drawWalkParticles(ctx,walkParticles){for(const wp of walkParticles){ctx.fillStyle=wp.color?`rgba(${hexToRgb(wp.color)},${wp.life*0.6})`:`rgba(180,160,120,${wp.life*0.6})`;ctx.fillRect(Math.floor(wp.x),Math.floor(wp.y),Math.floor(wp.size)||2,Math.floor(wp.size)||2)}}
function hexToRgb(hex){const num=parseInt(hex.replace('#',''),16);const r=(num>>16)&255;const g=(num>>8)&255;const b=num&255;return `${r},${g},${b}`;}

function _drawAmbientParticles(ctx,ambientParticles){ctx.fillStyle='rgba(200,180,140,0.2)';for(const ap of ambientParticles){ctx.fillRect(Math.floor(ap.x),Math.floor(ap.y),Math.floor(ap.size)||1,Math.floor(ap.size)||1)}}

function _drawDustParticles(ctx,dustParticles){for(const dp of dustParticles){ctx.fillStyle=`rgba(200,180,140,${dp.alpha*0.3})`;ctx.fillRect(Math.floor(dp.x),Math.floor(dp.y),Math.floor(dp.size)||1,Math.floor(dp.size)||1)}}

function _drawTable(ctx,t,isHovered,isFull,time){
  const x=Math.floor(t.x),y=Math.floor(t.y);
  const sprite=Lobby.sprites['village_objects'];
  if(sprite&&sprite.complete&&sprite.width>64){
    // village_objects 包含市场摊位，用第一个摊位作为桌子
    // 摊位大约在图片左上角区域
    const tw=48,th=32;
    ctx.drawImage(sprite,0,0,tw,th,x-tw/2,y-th/2,tw,th);
  }else{
    // 后备：像素矩形
    ctx.fillStyle=isFull?'#5a2020':(t.code?'#3a4a2a':'#3a3020');
    ctx.fillRect(x-32,y-16,64,32);
    ctx.strokeStyle=isFull?'#8b2020':(t.code?'#4a7a3a':'#5a4a30');
    ctx.lineWidth=2;
    ctx.strokeRect(x-32,y-16,64,32);
  }
  // 桌子标签
  ctx.fillStyle='rgba(0,0,0,0.7)';
  ctx.fillRect(x-20,y+18,40,12);
  ctx.fillStyle='#d4c8a8';
  ctx.font='8px monospace';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(t.label||'',x,y+24);
}

function _drawDecorOn(ctx,w,h){
    ctx.imageSmoothingEnabled=false;
    const tm=Lobby.sprites['tilemap'];
    const tileSize=16;
    // 装饰位置列表：[x, y, 图块列, 图块行]
    const decorItems=[
      [35,35,3,3],[w-55,35,4,3],[35,h-55,3,4],[w-50,h-58,4,4],
      [300,300,5,3],[w-300,h-300,3,5],[w-300,300,4,3],[300,h-300,5,4],
      [w/2-40,h/2-30,3,3],[w/2+30,h/2+20,4,4],
      [120,80,5,3],[w-160,60,4,3],
      [90,h-140,3,4],[118,h-135,4,3],[108,h-150,5,4],
      [w-120,h-190,3,5]
    ];
    for(const[dx,dy,tc,tr]of decorItems){
      if(tm&&tm.complete&&tm.width>=16){
        const sx=tc*tileSize;
        const sy=tr*tileSize;
        const drawSize=32;
        if(sx+tileSize<=tm.width&&sy+tileSize<=tm.height){
          ctx.drawImage(tm,sx,sy,tileSize,tileSize,dx-drawSize/2,dy-drawSize/2,drawSize,drawSize);
        }
      }else{
        ctx.fillStyle='#4a3a20';
        ctx.fillRect(dx,dy,18,24);
        ctx.strokeStyle='#6a5a3a';
        ctx.lineWidth=1;
        ctx.strokeRect(dx,dy,18,24);
      }
    }
  }

Lobby._drawMinimap = function(ctx){
    const mw=120,mh=80;const mx=this.w-mw-8,my=8;const sx=mw/this.mapW,sy=mh/this.mapH;
    // 像素风格小地图：简单矩形背景
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.fillRect(mx,my+4,mw,mh);
    ctx.strokeStyle='rgba(100,80,60,0.4)';
    ctx.lineWidth=1;
    ctx.strokeRect(mx,my+4,mw,mh);
    // 区域底色（纯色块）
    const mmy=my+4;
    ctx.fillStyle='#4a3828';ctx.fillRect(mx,mmy+400*sy,400*sx,350*sy);
    ctx.fillStyle='#6a2828';ctx.fillRect(mx+600*sx,mmy,400*sx,350*sy);
    ctx.fillStyle='#3a4a2a';ctx.fillRect(mx+300*sx,mmy+200*sy,400*sx,350*sy);
    // 桌子
    for(const t of this.tables){ctx.fillStyle=t.code?'#5a8a3c':'#7a7060';ctx.fillRect(mx+t.x*sx-2,mmy+t.y*sy-1,4,2)}
    // NPC位置
    for(const npc of this.npcs){ctx.fillStyle='#ffdd44';ctx.fillRect(mx+npc.x*sx-1,mmy+npc.y*sy-1,2,2)}
    // 其他玩家
    for(const[id,p]of this.others){ctx.fillStyle='#d4c8a8';ctx.fillRect(mx+p.x*sx-1,mmy+p.y*sy-1,2,2)}
    // 自己
    ctx.fillStyle='#c4463a';ctx.fillRect(mx+this.me.x*sx-2,mmy+this.me.y*sy-2,4,4);
    // 视野框
    ctx.strokeStyle='rgba(196,70,58,0.3)';ctx.lineWidth=1;
    const vx=mx+this.camera.x*sx,vy=mmy+this.camera.y*sy,vw=this.w*sx,vh=this.h*sy;
    ctx.strokeRect(vx,vy,vw,vh);
  };

Lobby._drawWelcome = function(ctx){
    if(this.time<this.welcomeTime){
      const fadeOut=Math.min(1,(this.welcomeTime-this.time)/0.5);
      ctx.globalAlpha=fadeOut;
      ctx.fillStyle='#b8960f';
      ctx.font='bold 12px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText('欢迎来到废土交易所',this.w/2,40);
      ctx.globalAlpha=1;
    }
  };
Lobby._drawFeatureGuide = function(ctx){
    // 手游版不需要功能引导栏，功能已移至底部导航
  };
Lobby._drawClock = function(ctx){
    const hour=Math.floor(this.gameTime);const minute=Math.floor((this.gameTime-hour)*60);
    const timeStr=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    const isNight=this.gameTime>=20||this.gameTime<6;
    ctx.fillStyle='#d4c8a8';
    ctx.font='10px monospace';
    ctx.textAlign='right';
    ctx.textBaseline='top';
    ctx.fillText(`${timeStr} ${isNight?'[夜]':'[日]'}`,this.w-8,8);
  };

function _renderPotChips(pot){const stacks=Math.min(Math.floor(pot/10)+1,10);let html='<div style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;vertical-align:middle">';for(let i=0;i<stacks;i++){html+=`<div style="font-size:13px;line-height:1;filter:drop-shadow(0 0 2px var(--gold-glow));transform:translateY(${-i*2}px)">🪙</div>`}html+=`<div style="font-size:16px;color:var(--gold);font-family:Special Elite,cursive;margin-top:2px">${pot}</div>`;html+='</div>';return html}
function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

