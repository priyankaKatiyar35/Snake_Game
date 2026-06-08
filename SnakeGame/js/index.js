(() => {
  // ---------- config ----------
  const COLS = 20, ROWS = 20;
  const MODES = {
    chill:  {step:150, ramp:0,    wrap:true },
    normal: {step:110, ramp:0.6,  wrap:false},
    insane: {step:80,  ramp:1.3,  wrap:false},
  };

  // ---------- persistence ----------
  let memBest = 0;
  const store = {
    get(){ try{ return +(localStorage.getItem('neonSnakeBest')||0) }catch(e){ return memBest } },
    set(v){ memBest=v; try{ localStorage.setItem('neonSnakeBest',v) }catch(e){} }
  };

  // ---------- canvas ----------
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const SIZE = 600;
  cv.width = SIZE*dpr; cv.height = SIZE*dpr; ctx.scale(dpr,dpr);
  const CELL = SIZE/COLS;

  // ---------- audio (synth, no files needed) ----------
  let actx, muted=false, musicTimer=null;
  function audio(){ if(!actx){ try{actx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){} } if(actx&&actx.state==='suspended')actx.resume(); return actx; }
  function blip(freq,dur,type='square',vol=.16){
    const a=audio(); if(!a||muted)return;
    const o=a.createOscillator(), g=a.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(vol,a.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime+dur);
  }
  const sEat   = ()=>{blip(660,.07,'square',.18);setTimeout(()=>blip(990,.07,'square',.16),55);};
  const sPower = ()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>blip(f,.09,'triangle',.18),i*55));};
  const sTurn  = ()=>blip(300,.03,'sine',.06);
  const sDeath = ()=>{[440,330,220,140].forEach((f,i)=>setTimeout(()=>blip(f,.16,'sawtooth',.16),i*90));};
  const ARP=[262,330,392,330]; let arpI=0;
  function startMusic(){ stopMusic(); musicTimer=setInterval(()=>{ if(!muted){blip(ARP[arpI%4],.18,'triangle',.05);blip(ARP[arpI%4]/2,.18,'sine',.04);} arpI++; },220); }
  function stopMusic(){ if(musicTimer){clearInterval(musicTimer);musicTimer=null;} }

  // ---------- state ----------
  let state='menu', mode='normal';
  let snake, prevSnake, dir, nextDir, queue, food, power, score, best=store.get();
  let stepMs, lastStep=0, combo=1, comboUntil=0, shake=0, particles=[];

  const $=id=>document.getElementById(id);
  const scoreEl=$('score'), bestEl=$('best');
  const startScreen=$('startScreen'), pauseScreen=$('pauseScreen'), overScreen=$('overScreen');
  bestEl.textContent=best;

  function reset(){
    snake=[{x:10,y:12},{x:9,y:12},{x:8,y:12}];
    prevSnake=snake.map(s=>({...s}));
    dir={x:1,y:0}; nextDir={x:1,y:0}; queue=[];
    score=0; combo=1; comboUntil=0; particles=[]; shake=0;
    stepMs=MODES[mode].step;
    spawnFood(); power=null;
    scoreEl.textContent=0;
  }
  function freeCell(){
    let c; const occ=new Set(snake.map(s=>s.x+','+s.y));
    do{ c={x:(Math.random()*COLS)|0,y:(Math.random()*ROWS)|0}; }while(occ.has(c.x+','+c.y));
    return c;
  }
  function spawnFood(){ food=freeCell(); }
  function maybePower(){
    if(power) return;
    if(Math.random()<0.25){ power={...freeCell(), born:performance.now(), ttl:6000}; }
  }

  // ---------- loop ----------
  function tick(t){
    requestAnimationFrame(tick);
    if(state==='playing' && t-lastStep>=stepMs){ lastStep=t; step(); }
    draw(t);
  }
  function step(){
    dir=nextDir;
    if(queue.length){ const q=queue.shift(); if(!(q.x===-dir.x&&q.y===-dir.y)){nextDir=q;} }
    prevSnake=snake.map(s=>({...s}));
    let nx=snake[0].x+dir.x, ny=snake[0].y+dir.y;
    const wrap=MODES[mode].wrap;
    if(wrap){ nx=(nx+COLS)%COLS; ny=(ny+ROWS)%ROWS; }
    else if(nx<0||nx>=COLS||ny<0||ny>=ROWS){ return die(); }
    for(let i=0;i<snake.length-1;i++){ if(snake[i].x===nx&&snake[i].y===ny) return die(); }

    snake.unshift({x:nx,y:ny});
    let grew=false;

    if(nx===food.x&&ny===food.y){
      grew=true;
      const now=performance.now();
      combo = now<comboUntil ? Math.min(combo+1,9) : 1;
      comboUntil = now+2200;
      score += 1*combo;
      burst(food.x,food.y,'#ff2079'); sEat();
      spawnFood(); maybePower();
      if(MODES[mode].ramp) stepMs=Math.max(45, MODES[mode].step - score*MODES[mode].ramp);
    }
    else if(power && nx===power.x && ny===power.y){
      grew=true;
      score += 5; combo=Math.min(combo+1,9); comboUntil=performance.now()+2200;
      burst(power.x,power.y,'#ffd54a',26); sPower();
      power=null;
    }
    else { snake.pop(); }

    if(grew){ prevSnake.push({...snake[snake.length-1]}); }
    if(power && performance.now()-power.born>power.ttl) power=null;

    scoreEl.textContent=score;
    if(score>best){ best=score; bestEl.textContent=best; store.set(best); }
  }
  function die(){
    state='over'; shake=16; sDeath(); stopMusic();
    $('finalScore').textContent=score;
    const nb=$('newBest');
    nb.style.display = (score>0 && score>=best) ? 'block':'none';
    setTimeout(()=>{ overScreen.classList.remove('hide'); }, 450);
  }

  // ---------- particles ----------
  function burst(cx,cy,color,n=16){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, sp=1+Math.random()*3.5;
      particles.push({x:cx*CELL+CELL/2,y:cy*CELL+CELL/2,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,color});
    }
  }

  // ---------- draw ----------
  function lerp(a,b,t){ return a+(b-a)*t; }
  function rrect(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill(); }

  function draw(t){
    ctx.save();
    if(shake>0){ ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake); shake*=.88; if(shake<.4)shake=0; }
    ctx.clearRect(-20,-20,SIZE+40,SIZE+40);

    // board grid
    ctx.strokeStyle='rgba(0,240,255,.06)'; ctx.lineWidth=1;
    for(let i=1;i<COLS;i++){ ctx.beginPath();ctx.moveTo(i*CELL,0);ctx.lineTo(i*CELL,SIZE);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,i*CELL);ctx.lineTo(SIZE,i*CELL);ctx.stroke(); }

    // food (pulsing)
    const pulse=.5+.5*Math.sin(t/180);
    drawGem(food.x,food.y,'#ff2079', .5+pulse*.5, 6+pulse*4);

    // power-up (golden, with ttl ring)
    if(power){
      const left=1-(performance.now()-power.born)/power.ttl;
      const blink = left<0.3 ? (Math.sin(t/80)>0?1:.25) : 1;
      drawGem(power.x,power.y,'#ffd54a', blink, 10);
      ctx.strokeStyle='rgba(255,213,74,.8)'; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(power.x*CELL+CELL/2,power.y*CELL+CELL/2,CELL*.5, -Math.PI/2, -Math.PI/2+Math.PI*2*Math.max(0,left));
      ctx.stroke();
    }

    // snake (interpolated)
    const tt = state==='playing' ? Math.min((t-lastStep)/stepMs,1) : 1;
    for(let i=snake.length-1;i>=0;i--){
      let from = prevSnake[i]||snake[i], to=snake[i];
      let fx=from.x, fy=from.y;
      if(Math.abs(fx-to.x)>1||Math.abs(fy-to.y)>1){ fx=to.x; fy=to.y; } // wrap snap
      const x=lerp(fx,to.x,tt)*CELL, y=lerp(fy,to.y,tt)*CELL;
      const head=(i===0);
      const g=ctx.createLinearGradient(x,y,x+CELL,y+CELL);
      if(head){ g.addColorStop(0,'#aaff66'); g.addColorStop(1,'#39ff14'); }
      else { const f=1-i/snake.length; g.addColorStop(0,'#00f0ff'); g.addColorStop(1,`rgba(57,255,20,${.45+f*.55})`); }
      ctx.fillStyle=g;
      ctx.shadowColor= head?'#39ff14':'#00f0ff'; ctx.shadowBlur= head?22:10;
      const pad= head?1:2.5;
      rrect(x+pad,y+pad,CELL-pad*2,CELL-pad*2, head?7:6);
      ctx.shadowBlur=0;
      if(head) drawEyes(x,y);
    }

    // particles
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx;p.y+=p.vy;p.vy+=.06;p.life-=.03;
      if(p.life<=0){ particles.splice(i,1); continue; }
      ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
      ctx.shadowColor=p.color; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.arc(p.x,p.y,3*p.life+1,0,7); ctx.fill();
    }
    ctx.globalAlpha=1; ctx.shadowBlur=0;

    // combo flash
    if(combo>1 && performance.now()<comboUntil){
      ctx.font="700 22px 'Press Start 2P', monospace";
      ctx.fillStyle='rgba(255,32,121,.9)'; ctx.shadowColor='#ff2079'; ctx.shadowBlur=18;
      ctx.textAlign='center'; ctx.fillText('x'+combo, SIZE/2, 40); ctx.shadowBlur=0;
    }
    ctx.restore();
  }
  function drawGem(gx,gy,color,alpha,glow){
    const x=gx*CELL+CELL/2, y=gy*CELL+CELL/2;
    ctx.globalAlpha=alpha; ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=glow;
    ctx.beginPath(); ctx.arc(x,y,CELL*0.32,0,7); ctx.fill();
    ctx.globalAlpha=1; ctx.shadowBlur=0;
  }
  function drawEyes(x,y){
    const cx=x+CELL/2, cy=y+CELL/2, o=CELL*0.18;
    ctx.fillStyle='#05130a';
    const ex=dir.x*o, ey=dir.y*o, sx=dir.y*o*.7, sy=dir.x*o*.7;
    [[ex+sx,ey-sy],[ex-sx,ey+sy]].forEach(([dx,dy])=>{
      ctx.beginPath(); ctx.arc(cx+dx,cy+dy,CELL*0.10,0,7); ctx.fill();
    });
  }

  // ---------- controls ----------
  const DIRS={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
  function turn(d){
    if(state!=='playing')return;
    const last = queue.length?queue[queue.length-1]:nextDir;
    if(d.x===-last.x&&d.y===-last.y)return;
    if(queue.length<2) queue.push(d);
    sTurn();
  }
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    if(k==='arrowup'||k==='w')turn(DIRS.up);
    else if(k==='arrowdown'||k==='s')turn(DIRS.down);
    else if(k==='arrowleft'||k==='a')turn(DIRS.left);
    else if(k==='arrowright'||k==='d')turn(DIRS.right);
    else if(k===' '||k==='p'){ if(state==='playing')pause(); else if(state==='paused')resume(); }
    else if(k==='enter'){ if(state==='over')begin(); }
  });
  // d-pad
  $('pad').querySelectorAll('button').forEach(b=>{
    const fire=ev=>{ev.preventDefault();turn(DIRS[b.dataset.dir]);};
    b.addEventListener('touchstart',fire,{passive:false});
    b.addEventListener('mousedown',fire);
  });
  // swipe
  let tsx,tsy;
  cv.addEventListener('touchstart',e=>{const t=e.touches[0];tsx=t.clientX;tsy=t.clientY;},{passive:true});
  cv.addEventListener('touchend',e=>{
    if(tsx==null)return; const t=e.changedTouches[0];
    const dx=t.clientX-tsx, dy=t.clientY-tsy;
    if(Math.abs(dx)<20&&Math.abs(dy)<20)return;
    if(Math.abs(dx)>Math.abs(dy)) turn(dx>0?DIRS.right:DIRS.left);
    else turn(dy>0?DIRS.down:DIRS.up);
    tsx=tsy=null;
  },{passive:true});

  // ---------- flow ----------
  function begin(){
    audio();
    reset(); state='playing'; lastStep=performance.now();
    startScreen.classList.add('hide'); overScreen.classList.add('hide'); pauseScreen.classList.add('hide');
    if(!muted) startMusic();
  }
  function pause(){ state='paused'; pauseScreen.classList.remove('hide'); stopMusic(); }
  function resume(){ state='playing'; lastStep=performance.now(); pauseScreen.classList.add('hide'); if(!muted)startMusic(); }

  $('startBtn').onclick=begin;
  $('retryBtn').onclick=begin;
  $('resumeBtn').onclick=resume;
  $('pauseBtn').onclick=()=>{ if(state==='playing')pause(); else if(state==='paused')resume(); };
  $('muteBtn').onclick=()=>{ muted=!muted; $('muteBtn').textContent=muted?'🔇':'🔊'; if(muted)stopMusic(); else if(state==='playing')startMusic(); };
  $('modes').querySelectorAll('.mode').forEach(m=>{
    m.onclick=()=>{ mode=m.dataset.mode; $('modes').querySelectorAll('.mode').forEach(x=>x.classList.remove('on')); m.classList.add('on'); };
  });
  // auto-pause when tab/window loses focus
  window.addEventListener('blur',()=>{ if(state==='playing')pause(); });

  // boot
  reset(); state='menu';
  requestAnimationFrame(tick);
})();
