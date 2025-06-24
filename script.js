// script.js

// — DOM References —
const canvas       = document.getElementById('game');
const ctx          = canvas.getContext('2d');
const scoreEl      = document.getElementById('score');
const highEl       = document.getElementById('highScore');
const livesEl      = document.getElementById('lives');
const startBtn     = document.getElementById('startButton');
const restartBtn   = document.getElementById('restartButton');
const achBtn       = document.getElementById('achievementsButton');
const achPanel     = document.getElementById('achievementsPanel');
const distLabel    = document.getElementById('distanceLabel');
const distBar      = document.getElementById('distanceBar');
const distText     = document.getElementById('distanceText');
const obsLabel     = document.getElementById('obstacleLabel');
const obsBar       = document.getElementById('obstacleBar');
const obsText      = document.getElementById('obstacleText');
const popup        = document.getElementById('achievementPopup');
const pauseOverlay = document.getElementById('pauseOverlay');
const infoPanel    = document.getElementById('infoPanel');
const body         = document.body;

// — Constants —
const GRAVITY     = 0.6;
const BASE_SPEED  = 0.5;
const TILE_W      = 50, TILE_H = 20, SCALE = 1.5;
const CW          = TILE_W * SCALE, CH = TILE_H * SCALE;
const BODY_H      = 40, LOWER_LEG = 15;
const JUMP_VY     = -12, OB_PROB = 0.3, MIN_OB_DIST = 4, HEART_PROB = 0.01;

// Runner frames
const FRAME_URLS   = [
  'frame_0.png','frame_1.png','frame_2.png',
  'frame_3.png','frame_4.png','frame_5.png',
  'frame_6.png','frame_7.png','frame_8.png'
];
let FRAMES = [], FW = 0, FH = 0;
const RUN_SCALE    = 0.24;
const RW = () => FW * RUN_SCALE;
const RH = () => FH * RUN_SCALE;

// Parallax
const PARALLAX_LAYERS = [
  { src:'city_far.png',   speed:0.1, scale:1.0, yOffset:0.7 },
  { src:'city_mid.png',   speed:0.2, scale:1.0, yOffset:0.6 },
  { src:'city_front.png', speed:0.4, scale:1.0, yOffset:0.5 }
];
let layers = [];

// — State —
let highScore        = +localStorage.getItem('highScore') || 0;
let lives            = 1.0;
let streak           = 0;
let platforms        = [];
let obstacles        = [];
let hearts           = [];
let particles        = [];
let colSinceOb       = MIN_OB_DIST;
let player           = null;
let lastTime         = 0;
let frameCount       = 0;
let score            = 0;
let cumDistance      = 0;
let cumObstacles     = 0;
let distanceTarget   = 250, distanceTier = 1;
let obstacleTarget   = 50,  obstacleTier = 1;
let gameOver         = false;
let allowRestart     = false;
let allowAirJump     = false;
let wasOnGround      = false;
let paused           = false;
let currentSpeed     = BASE_SPEED;
let multiplier       = 1;

// Disable Start until assets loaded
startBtn.disabled = true;

// — Preload — 
Promise.all(FRAME_URLS.map(url => new Promise(res => {
  const img = new Image(); img.src = url;
  img.onload = () => { if (!FW) { FW = img.width; FH = img.height; } res(img); };
}))).then(imgs => { FRAMES = imgs; checkReady(); });

Promise.all(PARALLAX_LAYERS.map(cfg => new Promise(res => {
  const img = new Image(); img.src = cfg.src;
  img.onload = () => res({ img, ...cfg, x: 0 });
}))).then(pls => { layers = pls; checkReady(); });

function checkReady() {
  if (FRAMES.length === FRAME_URLS.length && layers.length === PARALLAX_LAYERS.length) {
    body.classList.add('start-screen');
    startBtn.disabled = false;
    [startBtn, restartBtn].forEach(b => b.onclick = startGame);
  }
}

// — Popup — 
function showPopup(text) {
  popup.textContent = text;
  popup.style.opacity = 1;
  setTimeout(() => popup.style.opacity = 0, 2000);
}

// — UI Init — 
highEl.textContent = `HIGHSCORE: ${String(highScore).padStart(5,'0')}`;
resizeCanvas(); window.addEventListener('resize', resizeCanvas);
updateLives(); updateScoreUI(); updateStreakBar(); updateAchievementPanel();
achBtn.addEventListener('click', () => achPanel.classList.toggle('hidden'));

// — Input — 
window.addEventListener('keydown', e => {
  if(e.code === 'Space') {
    if(!player){ startGame(); return; }
    if(gameOver && allowRestart){ startGame(); return; }
    if(player.onGround){ player.vy = JUMP_VY; player.onGround = false; allowAirJump = true; }
    else if(allowAirJump){ player.vy = JUMP_VY; allowAirJump = false; }
  }
  else if(e.code === 'Escape' && player) {
    paused = !paused;
    pauseOverlay.style.display = paused ? 'flex' : 'none';
    if(!paused){ lastTime = performance.now(); requestAnimationFrame(loop); }
  }
});

// — Start / Restart — 
function startGame() {
  body.classList.remove('start-screen','game-over');
  [startBtn, infoPanel, restartBtn, pauseOverlay].forEach(e => e.style.display = 'none');
  paused = false; score = 0; frameCount = 0; lives = 1; streak = 0;
  cumDistance = 0; distanceTarget = 250; distanceTier = 1;
  colSinceOb = MIN_OB_DIST; cumObstacles = 0; obstacleTarget = 50; obstacleTier = 1;
  multiplier = 1; currentSpeed = BASE_SPEED;

  updateScoreUI(); updateLives(); updateStreakBar(); updateAchievementPanel();
  platforms = []; obstacles = []; hearts = []; particles = []; initialFill();
  player = new Player(); allowAirJump = true; gameOver = false; allowRestart = false;
  lastTime = performance.now(); resizeCanvas(); requestAnimationFrame(loop);
}

// — Main Loop — 
function loop(ts){
  if(paused) return;
  const dt = ts - lastTime; lastTime = ts;

  if(gameOver){
    body.classList.add('game-over');
    restartBtn.style.display = 'block';
    infoPanel.style.display = 'block';
    if(score > highScore){
      highScore = score;
      localStorage.setItem('highScore', highScore);
      highEl.textContent = `HIGHSCORE: ${String(highScore).padStart(5,'0')}`;
    }
    setTimeout(() => allowRestart = true, 500);
    return;
  }

  frameCount++;
  if(frameCount % 3 === 0){
    score++; cumDistance++;
    updateScoreUI(); checkDistanceMilestone();
  }

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Parallax draw
  layers.forEach(l => {
    l.x = (l.x - l.speed) % (canvas.width * l.scale);
    const w = canvas.width * l.scale, h = l.img.height * (w/l.img.width),
          y = (canvas.height - h) * l.yOffset;
    ctx.drawImage(l.img, l.x, y, w, h);
    ctx.drawImage(l.img, l.x + w, y, w, h);
  });

  const m = currentSpeed * dt;

  // Ground
  ctx.fillStyle = '#000';
  platforms.forEach(p => { p.x -= m; ctx.fillRect(p.x,p.y,p.w,p.h); });
  platforms = platforms.filter(p => p.x + p.w > 0);

  // Obstacles
  ctx.fillStyle = '#e53e3e';
  obstacles.forEach(o => { o.x -= m; ctx.fillRect(o.x,o.y,o.w,o.h); });
  obstacles = obstacles.filter(o => o.x + o.w > 0);

  // Hearts
  hearts.forEach(h => h.x -= m);
  hearts = hearts.filter(h => h.x + h.size/2 > 0);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  hearts.forEach(h => { ctx.font = `${h.size}px serif`; ctx.fillText('❤️',h.x,h.y); });

  // Dust
  particles.forEach(p => p.update(dt));
  particles = particles.filter(p => p.a > 0);
  particles.forEach(p => p.draw());

  // Refill
  while(platforms.length===0||platforms.at(-1).x+platforms.at(-1).w<canvas.width+CW){
    spawnOne();
  }

  // Player
  player.update(dt);
  player.draw();

  requestAnimationFrame(loop);
}

// — Milestones — 
function checkDistanceMilestone(){
  if(cumDistance >= distanceTarget){
    showPopup(`Milestone reached! Reach ${distanceTarget+250} for next milestone`);
    distanceTier++; distanceTarget += 250; updateAchievementPanel();
  }
}
function checkObstacleMilestone(){
  if(cumObstacles >= obstacleTarget){
    showPopup(`Milestone reached! Clear ${obstacleTarget+50} obstacles for next milestone`);
    obstacleTier++; obstacleTarget += 50; updateAchievementPanel();
  }
}

// — UI Updates — 
function updateScoreUI(){ scoreEl.textContent = `SCORE: ${String(score).padStart(5,'0')}`; }
function updateLives(){
  livesEl.innerHTML='';
  for(let i=1;i<=3;i++){
    const sp=document.createElement('span'); sp.classList.add('heart');
    if(lives>=i) sp.classList.add('full');
    else if(lives+0.5>=i) sp.classList.add('half');
    else sp.classList.add('empty');
    livesEl.appendChild(sp);
  }
}
function updateStreakBar(){
  const c=Math.min(streak,50), bar=document.getElementById('streakBar');
  bar.style.width=(c/50*100)+'%';
  let col='blue';
  if(streak<=30) col='blue';
  else if(streak<=40){ const t=(streak-30)/10; col=`rgb(${Math.round(255*t)},${Math.round(165*t)},0)`; }
  else { const t=(streak-40)/10; col=`rgb(255,${Math.round(165-165*t)},0)`; }
  bar.style.backgroundColor=col; multiplier=streak>=50?1.5:1;
}
function updateAchievementPanel(){
  distLabel.textContent=`${distanceTier}: Distance`;
  const dDone=Math.min(cumDistance,distanceTarget);
  distBar.style.width=(dDone/distanceTarget*100)+'%';
  distText.textContent=`${dDone} / ${distanceTarget}`;
  obsLabel.textContent=`${obstacleTier}: Obstacles`;
  const oDone=Math.min(cumObstacles,obstacleTarget);
  obsBar.style.width=(oDone/obstacleTarget*100)+'%';
  obsText.textContent=`${oDone} / ${obstacleTarget}`;
}

// — Helpers & Spawners — 
function initialFill(){
  platforms=[]; obstacles=[]; hearts=[]; particles=[]; colSinceOb=MIN_OB_DIST;
  let x=-CW, cols=Math.ceil(canvas.width/CW)+2;
  for(let i=0;i<cols;i++){ x+=CW; platforms.push({x,y:canvas.height-CH,w:CW,h:CH}); }
}
function spawnOne(){
  colSinceOb++;
  const last=platforms.at(-1), x=last.x+last.w;
  platforms.push({x,y:canvas.height-CH,w:CW,h:CH});
  if(colSinceOb>=MIN_OB_DIST&&Math.random()<OB_PROB){
    const w1=CW*0.5,h1=CH*1.5;
    obstacles.push({x:x+(CW-w1)/2,y:canvas.height-CH-h1,w:w1,h:h1,counted:false});
    colSinceOb=0;
  }
  if(Math.random()<HEART_PROB){
    const size=CW*0.6; hearts.push({x:x+CW/2,y:canvas.height-CH-size,size});
  }
}
function resizeCanvas(){ canvas.width=window.innerWidth; canvas.height=window.innerHeight; }

// — Dust — 
class Dust {
  constructor(x,y){ const s=Math.random()+0.5; this.vx=-s;this.vy=-s; this.x=x+(Math.random()*10-5); this.y=y; this.a=1; this.sz=(Math.random()*3+2)*2; }
  update(dt){ const m=currentSpeed*dt; this.x+=this.vx*dt*0.1-m; this.y+=this.vy*dt*0.1; this.a-=dt*0.001; }
  draw(){ ctx.save(); ctx.globalAlpha=Math.max(0,this.a); ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(this.x,this.y,this.sz,0,2*Math.PI); ctx.fill(); ctx.restore(); }
}

// — Player — 
class Player {
  constructor(){ this.x=50; this.y=canvas.height-(BODY_H+LOWER_LEG)-10; this.vy=0; this.onGround=false; this.hbW=RW()*0.8; this.hbX=(RW()-this.hbW)/2; }
  update(dt){
    this.vy+=GRAVITY; this.y+=this.vy; this.onGround=false;
    const footY=this.y+BODY_H+LOWER_LEG;
    for(const p of platforms){
      const l=this.x+this.hbX, r=l+this.hbW;
      if(r>p.x&&l<p.x+p.w&&footY>p.y){
        this.y=p.y-(BODY_H+LOWER_LEG); this.vy=0; this.onGround=true; allowAirJump=true;
      }
    }
    if(this.onGround&&!wasOnGround){ for(let i=0;i<8;i++) particles.push(new Dust(this.x+RW()/2,this.y+BODY_H+LOWER_LEG)); }
    wasOnGround=this.onGround;
    hearts=hearts.filter(h=>{
      const l=this.x+this.hbX,r=l+this.hbW;
      if(l<h.x+h.size/2&&r>h.x-h.size/2&&this.y<h.y+h.size/2&&footY>h.y-h.size/2){
        lives=Math.min(3,lives+0.5); updateLives(); return false;
      }
      return true;
    });
    const front=this.x+this.hbX;
    obstacles.forEach(o=>{ if(!o.counted&&o.x+o.w<front){ o.counted=true; streak++; cumObstacles++; updateStreakBar(); checkObstacleMilestone(); } });
    for(const o of obstacles){
      const l=this.x+this.hbX,r=l+this.hbW,b=footY;
      if(r>o.x&&l<o.x+o.w&&b>o.y){
        streak=0; updateStreakBar();
        if(lives>1){ lives--; updateLives(); obstacles=obstacles.filter(x=>x!==o); }
        else gameOver=true;
      }
    }
  }
  draw(){
    if(!FRAMES.length) return;
    const idx=Math.floor(frameCount/3)%FRAME_URLS.length;
    ctx.drawImage(FRAMES[idx], this.x, this.y-(RH()-(BODY_H+LOWER_LEG)), RW(), RH());
  }
}
