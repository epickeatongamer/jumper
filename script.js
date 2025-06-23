// script.js

const canvas     = document.getElementById('game');
const ctx        = canvas.getContext('2d');
const scoreEl    = document.getElementById('score');
const highEl     = document.getElementById('highScore');
const livesEl    = document.getElementById('lives');
const startBtn   = document.getElementById('startButton');
const restartBtn = document.getElementById('restartButton');
const infoPanel  = document.getElementById('infoPanel');

// world constants
const GRAVITY    = 0.6,
      SPEED      = 0.5,
      TILE_W     = 50,
      TILE_H     = 20,
      SCALE      = 1.5,
      CW         = TILE_W * SCALE,
      CH         = TILE_H * SCALE,
      BODY_H     = 40,
      LOWER_LEG  = 15,
      JUMP_VY    = -12;

// obstacle & heart logic
const OB_PROB     = 0.3,
      MIN_OB_DIST = 8,
      HEART_PROB  = 0.01;
let colsSinceOb  = MIN_OB_DIST;

// load runner frames
const FRAMES      = [];
const FRAME_COUNT = 9;
let FW = 0, FH = 0;
const RUN_SCALE = 0.24;
const RW = () => FW * RUN_SCALE;
const RH = () => FH * RUN_SCALE;
for (let i = 0; i < FRAME_COUNT; i++) {
  const img = new Image();
  img.src   = `frame_${i}.png`;
  img.onload= () => { if (!FW) { FW = img.width; FH = img.height; } };
  FRAMES.push(img);
}

// high-score & lives
let highScore = parseInt(localStorage.getItem('highScore')) || 0;
highEl.textContent = `HIGHSCORE: ${String(highScore).padStart(5,'0')}`;
let lives = 1.0;

// helper to redraw hearts
function updateLives() {
  livesEl.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const span = document.createElement('span');
    span.classList.add('heart');
    if (lives >= i)       span.classList.add('full');
    else if (lives + 0.5 >= i) span.classList.add('half');
    else                  span.classList.add('empty');
    livesEl.appendChild(span);
  }
}

// game state
let platforms = [], obstacles = [], hearts = [], player = null;
let lastTime = 0, frameCount = 0, score = 0;
let gameOver = false, allowRestart = false, allowAirJump = false;

// resize
function resizeCanvas(){
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
  if (player) player.y = canvas.height - (BODY_H + LOWER_LEG) - 10;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// initial fill
function initialFill(){
  platforms=[]; obstacles=[]; hearts=[];
  colsSinceOb = MIN_OB_DIST;
  const cols = Math.ceil(canvas.width/CW)+2;
  let x = -CW;
  for (let i=0; i<cols; i++){
    x+=CW;
    platforms.push({ x, y:canvas.height-CH, w:CW, h:CH });
  }
}

// spawn a column
function spawnOne(){
  const lastX = platforms.length ? platforms[platforms.length-1].x : -CW;
  const x = lastX + CW;
  platforms.push({ x, y:canvas.height-CH, w:CW, h:CH });

  colsSinceOb++;
  if (colsSinceOb>=MIN_OB_DIST && Math.random()<OB_PROB){
    const w1=CW*0.5, h1=CH*1.5;
    obstacles.push({
      x:x+(CW-w1)/2, y:canvas.height-CH-h1, w:w1, h:h1
    });
    colsSinceOb=0;
    if (Math.random()<0.3){
      const x2=x+CW;
      platforms.push({ x:x2, y:canvas.height-CH, w:CW, h:CH });
      const w2=CW*0.5, h2=CH*5;
      obstacles.push({
        x:x2+(CW-w2)/2, y:canvas.height-CH-h2, w:w2, h:h2
      });
    }
  }

  if (Math.random()<HEART_PROB){
    const size = CW*0.6;
    hearts.push({
      x: x+CW/2,
      y: canvas.height-CH-size,
      size
    });
  }
}

// Player
class Player {
  constructor(){
    this.x = 50;
    this.y = canvas.height - (BODY_H + LOWER_LEG) - 10;
    this.vy=0; this.onGround=false;
    this.hbW=RW()*0.8; this.hbX=(RW()-this.hbW)/2;
  }
  update(){
    this.vy+=GRAVITY; this.y+=this.vy; this.onGround=false;
    const footY=this.y+BODY_H+LOWER_LEG;

    // ground collision
    for(const p of platforms){
      const l=this.x+this.hbX, r=l+this.hbW;
      if(r>p.x&&l<p.x+p.w&&footY>p.y){
        this.y=p.y-(BODY_H+LOWER_LEG);
        this.vy=0; this.onGround=true; allowAirJump=true;
      }
    }

    // heart pickup
    hearts=hearts.filter(h=>{
      const l=this.x+this.hbX, r=l+this.hbW;
      if(l<h.x+h.size/2&&r>h.x-h.size/2&&
         this.y<h.y+h.size/2&&footY>h.y-h.size/2){
        lives=Math.min(3.0,lives+0.5);
        updateLives();
        return false;
      }
      return true;
    });

    // obstacle hit
    for(const o of obstacles){
      const l=this.x+this.hbX, r=l+this.hbW, b=footY;
      if(r>o.x&&l<o.x+o.w&&b>o.y){
        if(lives>=1){
          lives-=1; updateLives();
          obstacles=obstacles.filter(x=>x!==o);
        } else {
          gameOver=true;
        }
      }
    }
  }
  draw(){
    if(!FRAMES.length)return;
    const idx=Math.floor(frameCount/3)%FRAME_COUNT;
    const img=FRAMES[idx];
    ctx.drawImage(img,
      this.x,
      this.y-(RH()-(BODY_H+LOWER_LEG)),
      RW(),RH()
    );
  }
}

// input
window.addEventListener('keydown',e=>{
  if(e.code!=='Space')return;
  if(gameOver&&allowRestart){ startGame(); return; }
  if(!player)return;
  if(player.onGround){
    player.vy=JUMP_VY; player.onGround=false; allowAirJump=true;
  } else if(allowAirJump){
    player.vy=JUMP_VY; allowAirJump=false;
  }
});

// start/restart
function startGame(){
  startBtn.style.display='none';
  infoPanel.style.display='none';
  restartBtn.style.display='none';
  score=frameCount=0;
  lives=1.0; updateLives();
  scoreEl.textContent=`SCORE: 00000`;
  platforms=[]; obstacles=[]; hearts=[];
  initialFill();
  player=new Player();
  allowAirJump=true; gameOver=false; allowRestart=false;
  lastTime=performance.now();
  requestAnimationFrame(loop);
}
startBtn.onclick=restartBtn.onclick=startGame;

// main loop
function loop(ts){
  const dt=ts-lastTime; lastTime=ts;
  if(gameOver){
    restartBtn.style.display='block';
    infoPanel.style.display='block';
    if(score>highScore){
      highScore=score;
      localStorage.setItem('highScore',highScore);
      highEl.textContent=`HIGHSCORE: ${String(highScore).padStart(5,'0')}`;
    }
    setTimeout(()=>allowRestart=true,500);
    return;
  }

  frameCount++;
  if(frameCount%3===0){
    score++;
    scoreEl.textContent=`SCORE: ${String(score).padStart(5,'0')}`;
  }

  ctx.clearRect(0,0,canvas.width,canvas.height);
  const m=SPEED*dt;

  // draw ground
  ctx.fillStyle='#000';
  platforms.forEach(p=>{p.x-=m;ctx.fillRect(p.x,p.y,p.w,p.h)});
  platforms=platforms.filter(p=>p.x+p.w>0);

  // draw obstacles
  ctx.fillStyle='#e53e3e';
  obstacles.forEach(o=>{o.x-=m;ctx.fillRect(o.x,o.y,o.w,o.h)});
  obstacles=obstacles.filter(o=>o.x+o.w>0);

  // draw hearts
  hearts.forEach(h=>{h.x-=m});
  hearts=hearts.filter(h=>h.x+h.size/2>0);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  hearts.forEach(h=>{
    ctx.font=`${h.size}px serif`;
    ctx.fillText('❤️',h.x,h.y);
  });

  // refill
  while(
    platforms.length===0||
    platforms[platforms.length-1].x+platforms[platforms.length-1].w<canvas.width+CW
  ){
    spawnOne();
  }

  player.update();
  player.draw();

  requestAnimationFrame(loop);
}
