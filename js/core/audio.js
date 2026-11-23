/* 音效层：
   1) 天气环境音：Web Audio 实时合成，不依赖音频文件
   2) 解包资源音效 / 背景音乐：读取 assets/audio/ 下的 mp3
   浏览器要求首次用户手势后才能出声，因此统一在 pointerdown / keydown 时解锁 */
(function () {
  const DG = window.DG;
  const A = DG.audio = {};

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let amb = null;          // 当前环境音 { gain, nodes }
  let current = null;      // 当前天气 id（未解锁时先记住，解锁后补播）
  let unlocked = false;
  let enabled = true;
  // 环境音整体音量：天气底噪只做氛围铺垫，压在主音量之下不抢战斗音效
  const AMB_LEVEL = 0.2;
  let ambVol = 1;          // 天气音量倍率（设置里的滑块，0-1）
  let musicOn = true;      // 背景音乐开关（不影响界面与战斗音效）
  try {
    const s = DG.settings && DG.settings.get ? DG.settings.get() : null;
    if (s) {
      enabled = s.audio !== false;
      if (typeof s.ambientVol === 'number') ambVol = Math.max(0, Math.min(1, s.ambientVol / 100));
      if (s.music === false) musicOn = false;
    }
  } catch (e) { /* 忽略读取失败 */ }

  // 天气音效当前应输出的增益（暂停战斗时压到 0）
  const ambLevel = () => AMB_LEVEL * ambVol;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.42 : 0;
    master.connect(ctx.destination);
    // 2 秒白噪声，所有环境音共用一份，省内存也省生成开销
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 系统抢占音频焦点（来电、其他应用播放、蓝牙切换）会让上下文自己挂起：
    // 只要页面在前台，就立刻尝试恢复，不等下一次手势
    ctx.onstatechange = () => {
      if (!ctx || document.hidden) return;
      if (ctx.state === 'closed') { rebuild(); return; }
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
        return;
      }
      // 从挂起/中断恢复：部分内核中断后旧的 BufferSource 不会续播，
      // 这里重建长音频源，避免“上下文 running 但一片安静”
      reviveLongSources();
    };
    return ctx;
  }

  function noiseSource() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  function unlock() {
    if (unlocked) { wakeAudio(); return; }
    const c = ensure();
    unlocked = true;
    if (c && c.state !== 'running') c.resume().catch(() => {});
    if (current) buildAmbient(current);
    preloadAll();
    resumeBgm();
  }

  // 系统可能在任何时候挂起音频上下文（来电、锁屏、息屏、切后台、系统省电）
  function ensureRunning() {
    if (!ctx) return;
    if (ctx.state === 'closed') { rebuild(); return; }
    if (ctx.state === 'running') return;
    const p = ctx.resume();
    if (p && p.catch) p.catch(() => {});
  }

  /* ---------------- 回前台 / 解锁后的强制恢复 ----------------
     浏览器最小化、切换应用、锁屏、音频焦点被抢占后，AudioContext 常常停在
     suspended / interrupted，单次 resume() 也可能被拒绝。这里做三件事：
       1) 等待挂起操作真正结束，再发 resume，避免 suspend/resume 竞态
       2) 连续重试，直到上下文回到 running
       3) 恢复成功后校验 BGM / 环境音节点，必要时重新起播，做到“回来必有声” */
  let suspendPromise = null;
  let wakeSeq = 0;
  let rebuilding = false;
  let lastRebuildAt = 0;
  // 连续重建次数：上下文被系统反复拒绝恢复时限流，避免一直新建音频图耗电
  let rebuildStreak = 0;

  function suspendAudio() {
    if (ctx && unlocked && ctx.state === 'running') {
      const p = ctx.suspend();
      // 记录挂起 Promise：回前台时先等它落地，防止“先 resume 又被旧 suspend 挂起”
      suspendPromise = p && p.then ? p.then(() => {}, () => {}) : Promise.resolve();
    }
    if (bgmEl) bgmEl.pause();
  }

  // 恢复成功后，确认背景音乐与环境音确实在响
  function hardRecover(force) {
    if (!ctx || (!force && document.hidden) || ctx.state !== 'running') return;
    rebuildStreak = 0;
    // 主音量被异常事件压死（来电 / 蓝牙切换中途）时补回，避免“上下文在跑却没声”
    if (master && enabled && master.gain.value < 0.05) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.42, t + 0.2);
    }
    if (enabled && musicOn && bgmKey) {
      if (bgmNodes.src) {
        const g = bgmNodes.gain && bgmNodes.gain.gain;
        // 增益被意外压死或上下文被系统重建：重新起播当前曲目
        if (!g || g.value < 0.005) startBgmNode(bgmKey, BGM_FADE);
      } else if (bgmEl) {
        if (bgmEl.paused) {
          const p = bgmEl.play();
          if (p && p.catch) p.catch(() => {});
        }
      } else if (bgmFailed[bgmKey] && !bgmBroken[bgmKey]) {
        playBgmHtml(bgmKey);
      } else {
        loadBgm(bgmKey);
      }
    }
    if (current) {
      if (!amb) buildAmbient(current);
      else if (!battlePaused) {
        const g = amb.gain.gain;
        // 只在环境音明显偏低时补拉，避免看门狗每轮都重排渐变
        if (g.value < ambLevel() * 0.5) fadeGain(g, ambLevel(), 300);
      }
    }
  }

  function wakeAudio(force) {
    // force=true 来自用户手势：此时用户就在前台操作，即使 visibility 状态还没刷新
    // （部分手机内核回到前台时先派发 focus 再更新 visible）也必须立刻恢复
    const blocked = () => !force && document.hidden;
    if (blocked()) return;
    if (!ctx) {
      // 上下文丢失但曾经解锁过：直接重建，保证下一次音效有输出
      if (unlocked) rebuild();
      return;
    }
    // 是否处于被系统挂起/中断状态：恢复后需要重建长音频播放源。
    // 部分手机内核中断后不会让旧的 BufferSource 自动续播，
    // 表现就是上下文 running、界面正常，但 BGM 和环境音彻底没声。
    const wasAsleep = ctx.state !== 'running';
    // 在手势回调栈内同步 resume 一次：严格自动播放策略（iOS Safari / 省电模式）
    // 只认手势里发出的 resume，延迟到 Promise 里再调会被拒绝
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      try {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* 忽略 */ }
    }
    const token = ++wakeSeq;
    const pending = suspendPromise;
    suspendPromise = null;
    // 页面被冻结时 suspend() 的 Promise 可能永远不落地，最多等 500ms 就继续尝试恢复
    const wait = pending
      ? Promise.race([pending, new Promise(r => setTimeout(r, 500))])
      : Promise.resolve();
    wait.then(() => {
      if (token !== wakeSeq || blocked()) return;
      if (!ctx) return;
      if (ctx.state === 'closed') { rebuild(); return; }
      let tries = 0;
      const attempt = () => {
        if (token !== wakeSeq || blocked()) return;
        if (!ctx) return;
        if (ctx.state === 'closed') { rebuild(); return; }
        if (ctx.state === 'running') {
          if (wasAsleep) reviveLongSources();
          hardRecover(force);
          return;
        }
        // 不能依赖 resume() 的 Promise：页面被冻结 / 音频焦点被抢占时
        // 该 Promise 可能永远不落地，必须靠定时器自己重试
        try {
          const p = ctx.resume();
          if (p && p.then) p.then(() => {
            if (token === wakeSeq && !blocked() && ctx && ctx.state === 'running') {
              if (wasAsleep) reviveLongSources();
              hardRecover(force);
            }
          }, () => {});
        } catch (e) { /* 旧内核没有 resume */ }
        tries++;
        if (tries <= 5) {
          setTimeout(attempt, 160 * tries);
        } else if (!blocked() && Date.now() - lastRebuildAt > 2500 &&
                   (rebuildStreak < 4 || Date.now() - lastRebuildAt > 30000)) {
          // 重试仍拿不回来：上下文已卡死，换一张新的音频图（含 BGM / 环境音补播）
          rebuild();
        }
      };
      attempt();
    });
  }

  // 上下文被浏览器彻底关闭（bfcache 恢复、系统回收）：重建音频图并补播
  function rebuild() {
    if (rebuilding) return;
    rebuilding = true;
    lastRebuildAt = Date.now();
    rebuildStreak++;
    try {
      if (ctx && ctx.close) {
        const p = ctx.close();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* 已关闭 */ }
    ctx = null;
    master = null;
    noiseBuf = null;
    sfxBus = null;
    musicBus = null;
    amb = null;
    bgmNodes = { key: null, src: null, gain: null, bornAt: 0 };
    Object.keys(buffers).forEach(k => delete buffers[k]);
    Object.keys(failed).forEach(k => delete failed[k]);
    Object.keys(lastPlay).forEach(k => delete lastPlay[k]);
    Object.keys(htmlPool).forEach(k => delete htmlPool[k]);
    Object.keys(bgmBuffers).forEach(k => delete bgmBuffers[k]);
    Object.keys(bgmLoop).forEach(k => delete bgmLoop[k]);
    Object.keys(bgmLoading).forEach(k => delete bgmLoading[k]);
    Object.keys(bgmFailed).forEach(k => delete bgmFailed[k]);
    Object.keys(bgmBroken).forEach(k => delete bgmBroken[k]);
    preloadQueue.length = 0;
    preloadActive = 0;
    if (enabled) {
      const c = ensure();
      if (c) {
        unlocked = true;
        if (c.state !== 'running') c.resume().catch(() => {});
        preloadAll();
        if (current) buildAmbient(current);
        resumeBgm();
      }
    }
    rebuilding = false;
  }

  let lastReviveAt = 0;
  // 中断恢复后重建长音频播放源：BGM 与环境音的 BufferSource 在部分手机内核上
  // 被系统中断后不会自动续播（上下文 running 但没声），只能重新创建节点
  function reviveLongSources() {
    if (!ctx || ctx.state !== 'running' || !unlocked || !enabled) return;
    const now = Date.now();
    if (now - lastReviveAt < 1200) return;
    lastReviveAt = now;
    if (bgmKey && musicOn && !bgmEl) {
      // startBgmNode 内部会把旧节点淡出并接手，相当于一次无缝重连
      if (bgmBuffers[bgmKey]) startBgmNode(bgmKey, 320);
      else resumeBgm();
    } else if (bgmEl && bgmHtmlKey && bgmEl.paused) {
      const p = bgmEl.play();
      if (p && p.catch) p.catch(() => {});
    }
    // 环境音噪声源同样要重建，否则回到前台后只剩 BGM
    if (current) {
      if (amb) {
        amb.nodes.forEach(n => { try { n.stop(); } catch (e) { /* 已停止 */ } });
        amb = null;
      }
      buildAmbient(current);
    }
  }

  // 已解锁后，每次手势都顺手检查一次：避免中断后一直静音
  function onGesture() {
    if (!unlocked) { unlock(); return; }
    // 手势即代表用户在前台操作，强制恢复，避免 visibility 状态滞后导致一直静音
    wakeAudio(true);
    healBgm(true);
  }
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture);
  window.addEventListener('touchstart', onGesture, { passive: true });

  // 切后台时挂起音频，回来再恢复，避免后台一直占 CPU
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendAudio();
    else wakeAudio();
  });
  // 离开页面（含进入 bfcache）时先挂起：部分内核在音频仍在播放时拒绝缓存页面
  window.addEventListener('pagehide', () => { suspendAudio(); });
  window.addEventListener('focus', () => {
    if (document.hidden) return;
    wakeAudio();
  });
  window.addEventListener('pageshow', () => {
    if (document.hidden) return;
    wakeAudio();
  });
  // 移动端从后台恢复时部分浏览器只派发 resume / 页面重新可见
  window.addEventListener('resume', () => {
    if (document.hidden) return;
    wakeAudio();
  });
  document.addEventListener('resume', () => {
    if (document.hidden) return;
    wakeAudio();
  });

  function stopAmbient(fade) {
    if (!amb) return;
    const a = amb;
    amb = null;
    const t = ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.6));
    const ms = ((fade || 0.6) * 1000) + 140;
    setTimeout(() => {
      a.nodes.forEach(n => { try { n.stop(); } catch (e) { /* 已停止 */ } });
    }, ms);
  }

  // 环境音：不同天气用「带通噪声 + 低通噪声」的比例和滤波频率区分
  function buildAmbient(id) {
    if (!ctx) return;
    const c = ctx;
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.value = 0.0001;
    out.connect(master);
    const nodes = [out];

    const addNoise = (type, freq, q, vol) => {
      const src = noiseSource();
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start();
      nodes.push(src);
      return { src: src, f: f, g: g };
    };

    if (id === 'rain') {
      addNoise('bandpass', 1350, 0.5, 0.5);
      addNoise('lowpass', 380, 0.7, 0.22);
    } else if (id === 'storm') {
      addNoise('bandpass', 1150, 0.6, 0.46);
      addNoise('lowpass', 240, 0.7, 0.5);
    } else if (id === 'snow') {
      addNoise('lowpass', 560, 0.6, 0.28);
      addNoise('bandpass', 2100, 1.6, 0.05);
    } else if (id === 'wind') {
      const w = addNoise('bandpass', 480, 1.4, 0.5);
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 0.13;
      lg.gain.value = 250;
      lfo.connect(lg);
      lg.connect(w.f.frequency);
      lfo.start();
      nodes.push(lfo);
    } else if (id === 'sandstorm') {
      addNoise('bandpass', 1050, 0.8, 0.44);
      addNoise('highpass', 520, 0.7, 0.22);
    } else {
      out.gain.value = 0;
    }

    out.gain.linearRampToValueAtTime(battlePaused ? 0.0001 : ambLevel(), t + 0.9);
    amb = { gain: out, nodes: nodes };
  }

  // 雷声：低频轰鸣 + 高频炸裂，略微延迟，跟画面白闪错开更自然
  function thunder(strength) {
    if (!ctx || !unlocked || !enabled) return;
    const c = ctx;
    const t = c.currentTime + 0.12 + Math.random() * 0.3;
    const s = Math.max(0.25, Math.min(1, strength || 0.6));

    const rumble = noiseSource();
    const rf = c.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 300;
    const rg = c.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.85 * s, t + 0.08);
    rg.gain.exponentialRampToValueAtTime(0.22 * s, t + 0.55);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    rumble.connect(rf);
    rf.connect(rg);
    rg.connect(master);
    rumble.start(t);
    rumble.stop(t + 2.2);

    const crack = noiseSource();
    const cf = c.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 2400;
    const cg = c.createGain();
    cg.gain.setValueAtTime(0.45 * s, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    crack.connect(cf);
    cf.connect(cg);
    cg.connect(master);
    crack.start(t);
    crack.stop(t + 0.3);
  }

  // 战吼冲击波：低频声浪下坠 + 空气冲击噪声，叠在 barb-warcry 人声之上
  function warcryBurst() {
    if (!ctx || !master || !unlocked || !enabled) return;
    const c = ctx;
    const t = c.currentTime;
    // 胸腔共鸣：锯齿波快速下滑，低通随之下沉，像一声吼炸开
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.55);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.5);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    osc.connect(lp);
    lp.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + 0.8);

    // 气浪：带通噪声快速下扫，模拟冲击波从身边推开的"呼"
    const n = noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.exponentialRampToValueAtTime(260, t + 0.5);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(master);
    n.start(t);
    n.stop(t + 0.65);
  }

  // 首领受击：闷响 + 冲击噪声 + 暴击金属泛音 + 劈砍划痕。
  // 与 barbHit 采样叠加，专门强化「打在首领身上」的分量；bodySize 越小音高越低沉。
  let lastBossHitAt = 0;
  function bossHitBurst(crit, chop, pitch) {
    if (!ctx || !master || !unlocked || !enabled) return;
    const c = ctx;
    const t = c.currentTime;
    const gap = lastBossHitAt ? t - lastBossHitAt : 9;
    if (gap < 0.045) return;                  // 连击同帧去重
    lastBossHitAt = t;
    const soft = gap < 0.12 ? 0.5 : 1;        // 高频连击时自动让位，避免糊成一片
    const p = pitch || 1;
    const s = (crit ? 1 : 0.72) * soft;
    ensureSfxBus();
    const bus = sfxBus || master;
    // 胸腔闷响：正弦快速下坠，暴击频率更低、余音更长
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime((crit ? 150 : 118) * p, t);
    osc.frequency.exponentialRampToValueAtTime((crit ? 40 : 52) * p, t + (crit ? 0.34 : 0.22));
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.6 * s, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + (crit ? 0.42 : 0.28));
    osc.connect(og); og.connect(bus);
    osc.start(t); osc.stop(t + 0.5);
    // 冲击噪声：带通短爆，像沉闷的撞击
    const n = noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = crit ? 1.4 : 0.9;
    bp.frequency.setValueAtTime((crit ? 1500 : 900) * p, t);
    bp.frequency.exponentialRampToValueAtTime((crit ? 420 : 300) * p, t + 0.16);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.34 * s, t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp); bp.connect(ng); ng.connect(bus);
    n.start(t); n.stop(t + 0.24);
    // 暴击：高频金属泛音，交代「击穿了硬壳」
    if (crit) {
      const ring = c.createOscillator();
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(1180 * p, t + 0.005);
      ring.frequency.exponentialRampToValueAtTime(760 * p, t + 0.3);
      const rg = c.createGain();
      rg.gain.setValueAtTime(0.0001, t + 0.005);
      rg.gain.exponentialRampToValueAtTime(0.15 * soft, t + 0.02);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      ring.connect(rg); rg.connect(bus);
      ring.start(t + 0.005); ring.stop(t + 0.4);
    }
    // 劈砍：高频短划痕，和斩痕特效同步
    if (chop) {
      const sw = noiseSource();
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2600;
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.17 * s, t + 0.01);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      sw.connect(hp); hp.connect(sg); sg.connect(bus);
      sw.start(t); sw.stop(t + 0.16);
    }
  }

  /* ---------------- 解包音频资源（assets/audio） ---------------- */
  const AUDIO_DIR = 'assets/audio/';

  // 音效键 -> 文件；键名保持语义化，场景代码只引用键
  const FILES = {
    barbAttack: 'barb-attack.mp3',
    barbHit: 'barb-hit.mp3',
    barbBehit: 'barb-behit.mp3',
    barbWhirlwind: 'barb-whirlwind.mp3',
    barbCharge: 'barb-charge.mp3',
    barbShockwave: 'barb-shockwave.mp3',
    barbWarcry: 'barb-warcry.mp3',
    rangerArrow: 'ranger-arrow.mp3',
    rangerMultishot: 'ranger-multishot.mp3',
    rangerRoll: 'ranger-roll.mp3',
    rangerSnipe: 'ranger-snipe.mp3',
    rangerArrowrain: 'ranger-arrowrain.mp3',
    rangerBehit: 'ranger-behit.mp3',
    rangerBuff: 'ranger-buff.mp3',
    skillFrost: 'skill-frost.mp3',
    skillThunder: 'skill-thunder.mp3',
    skillChargeArc: 'skill-charge-arc.mp3',
    monsterYell: 'monster-yell.mp3',
    monsterAttack: 'monster-attack.mp3',
    monsterDeath: 'monster-death.mp3',
    uiClick: 'ui-click.mp3',
    uiSelect: 'ui-select.mp3',
    uiOpen: 'ui-open.mp3',
    uiClose: 'ui-close.mp3',
    uiLevelup: 'ui-levelup.mp3',
    stageLevelup: 'stage-levelup.mp3',
    stageCoin: 'stage-coin.mp3',
    stagePickup: 'stage-pickup.mp3',
    stageEquip: 'stage-equip.mp3'
  };

  // 背景音乐：登录大厅 / 主城大厅 / 普通战斗 / 首领战
  // bgm-login 为原包 bgm/main_scene（本地缓存缺失，已按原 CDN 地址补下）
  // login / lobby 已替换为 Kevin MacLeod "Inner Sanctum" / "Gathering Darkness"（CC BY 4.0）
  // 统一转 AAC（m4a）：源码即 96kbps MP3，改用 72k 立体声 / 48k 单声道 AAC，
  // 体积降约 30%，听感基本不变，且 iOS / 微信 / Android 原生支持
  const BGM = {
    login: 'bgm-login.m4a',
    lobby: 'bgm-lobby.m4a',
    battle: 'bgm-battle.m4a',
    boss: 'bgm-boss.m4a'
  };

  // 各职业常用音效：进城/进副本前预热，避免首击时还在解码
  const CLASS_SFX = {
    warrior: ['barbAttack', 'barbHit', 'barbWhirlwind', 'barbCharge', 'barbShockwave', 'barbWarcry', 'barbBehit'],
    ranger: ['rangerArrow', 'rangerMultishot', 'rangerRoll', 'rangerSnipe', 'rangerArrowrain', 'rangerBehit', 'rangerBuff'],
    mage: ['skillChargeArc', 'skillFrost', 'skillThunder', 'barbBehit']
  };

  const BGM_LEVEL = 0.32;      // 单曲目标音量（经音乐总线输出）
  const BGM_FADE = 600;        // 换曲交叉淡化时长
  const BGM_DUCK = 0.22;       // 暂停战斗时音乐压低比例

  const buffers = {};      // key -> AudioBuffer（Web Audio 解码成功）
  const failed = {};       // key -> true（fetch 失败，改用 <audio> 兜底）
  const htmlPool = {};     // key -> [{ el, busy }]
  const lastPlay = {};     // key -> 上次播放时间（音频时钟），做同音效节流
  let sfxBus = null;

  // —— 背景音乐（Web Audio 双轨交叉淡化）——
  const bgmBuffers = {};   // key -> AudioBuffer
  const bgmLoop = {};      // key -> { start, end } 去编码填充后的循环点
  const bgmFailed = {};    // key -> true（下载失败，回退 <audio>）
  const bgmLoading = {};   // key -> Promise（同一首曲只发一次请求）
  let musicBus = null;
  let bgmNodes = { key: null, src: null, gain: null, bornAt: 0 };
  let bgmKey = null;       // 期望播放的曲目（静音/未解锁时也记住）
  let battlePaused = false;
  // <audio> 兜底（只在 mp3 拉取失败时使用）
  let bgmEl = null;
  let bgmHtmlKey = null;
  const bgmBroken = {};    // key -> true（兜底元素也报错，停止重试）

  const fileUrl = (key) => AUDIO_DIR + (FILES[key] || key);
  const bgmUrl = (key) => AUDIO_DIR + (BGM[key] || key);

  function ensureSfxBus() {
    if (sfxBus) return;
    if (!ensure()) return;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = enabled ? 1 : 0;
    sfxBus.connect(master);
  }

  function ensureMusicBus() {
    if (musicBus) return musicBus;
    if (!ensure()) return null;
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? (battlePaused ? BGM_DUCK : 1) : 0.0001;
    musicBus.connect(master);
    return musicBus;
  }

  // 线性淡化：始终基于音频时钟调度，不受主线程掉帧与后台节流影响
  function fadeGain(param, to, ms) {
    if (!ctx || !param) return;
    const t = ctx.currentTime;
    const from = Math.max(0.0001, param.value);
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(Math.max(0.0001, to), t + ms / 1000);
  }

  /* ---------------- 音效 ---------------- */

  async function loadBuffer(key) {
    if (buffers[key] || failed[key]) return;
    const c = ensure();
    if (!c) { failed[key] = true; return; }
    try {
      const res = await fetch(fileUrl(key));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.arrayBuffer();
      buffers[key] = await c.decodeAudioData(data);
    } catch (e) {
      // file:// 或服务端不支持 fetch 时，退回 HTMLAudioElement 播放
      failed[key] = true;
      preloadHtml(key);
    }
  }

  function preloadHtml(key) {
    if (htmlPool[key]) return;
    const list = [];
    for (let i = 0; i < 2; i++) {
      const el = new Audio(fileUrl(key));
      el.preload = 'auto';
      el.load();
      list.push({ el: el, busy: false });
    }
    htmlPool[key] = list;
  }

  // 预热队列：限制并发，避免解锁瞬间 29 个请求抢带宽
  const preloadQueue = [];
  let preloadActive = 0;
  const PRELOAD_CONCURRENCY = 3;

  function pumpPreload() {
    while (preloadActive < PRELOAD_CONCURRENCY && preloadQueue.length) {
      const key = preloadQueue.shift();
      if (buffers[key] || failed[key]) continue;
      preloadActive++;
      loadBuffer(key).then(() => {
        preloadActive--;
        pumpPreload();
      }, () => {
        preloadActive--;
        pumpPreload();
      });
    }
  }

  function queuePreload(keys) {
    (keys || []).forEach(key => {
      if (!FILES[key] || buffers[key] || failed[key]) return;
      if (preloadQueue.indexOf(key) >= 0) return;
      preloadQueue.push(key);
    });
    pumpPreload();
  }

  function preloadAll() {
    queuePreload(Object.keys(FILES));
  }

  function playBuffer(key, opt) {
    if (!ctx || !buffers[key]) return false;
    ensureSfxBus();
    if (!sfxBus) return false;
    const c = ctx;
    const t = c.currentTime;
    const rate = opt.rate || 1;
    const vol = opt.vol == null ? 0.9 : opt.vol;
    const src = c.createBufferSource();
    src.buffer = buffers[key];
    src.playbackRate.value = rate;
    const g = c.createGain();
    // 6ms 起音 + 40ms 收尾，消除爆点（爆炸/骨头碎裂声尤其明显）
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    const dur = src.buffer.duration / rate;
    if (dur > 0.12) {
      g.gain.setValueAtTime(vol, t + dur - 0.04);
      g.gain.linearRampToValueAtTime(0.0001, t + dur - 0.005);
    }
    src.connect(g);
    g.connect(sfxBus);
    // 播完立即断开，避免节点在长局战斗里无限累积
    src.onended = () => {
      try { src.disconnect(); } catch (e) { /* 已断开 */ }
      try { g.disconnect(); } catch (e) { /* 已断开 */ }
    };
    src.start();
    return true;
  }

  function playHtml(key, opt) {
    let list = htmlPool[key] || (preloadHtml(key), htmlPool[key]);
    if (!list) return;
    let slot = list.find(s => !s.busy);
    if (!slot) {
      const el = new Audio(fileUrl(key));
      el.preload = 'auto';
      slot = { el: el, busy: false };
      list.push(slot);
    }
    const el = slot.el;
    slot.busy = true;
    try {
      el.currentTime = 0;
      el.volume = Math.min(1, (opt.vol == null ? 0.9 : opt.vol) * 0.85);
      el.playbackRate = opt.rate || 1;
      const p = el.play();
      if (p && p.catch) p.catch(() => { slot.busy = false; });
    } catch (e) { slot.busy = false; }
    el.onended = () => { slot.busy = false; };
  }

  // 播放一个音效：opt = { vol, rate, gap }，gap 为同音效最小间隔（秒）
  function play(key, opt) {
    if (!enabled || !FILES[key]) return;
    // 从后台回来时上下文可能还被系统挂着：走完整的唤醒重试，避免这一声被吞掉
    if (ctx && ctx.state !== 'running' && !document.hidden) wakeAudio();
    opt = opt || {};
    const now = ctx ? ctx.currentTime : ((window.performance && performance.now ? performance.now() : Date.now()) / 1000);
    const gap = opt.gap == null ? 0.035 : opt.gap;
    if (lastPlay[key] != null && now - lastPlay[key] < gap) return;
    lastPlay[key] = now;

    // 已解码：立即起音；解码失败：走 <audio> 兜底
    if (buffers[key]) { playBuffer(key, opt); return; }
    if (failed[key]) { if (unlocked) playHtml(key, opt); return; }
    // 仍在解码：丢弃这一声（迟到的音效比没有更破坏手感），并提到队首尽快就绪
    queuePreload([key]);
  }

  /* ---------------- 背景音乐 ---------------- */

  // mp3 编码在首尾有填充静音，循环时接缝会出现空档：只裁掉极小的首尾静音
  function trimLoop(buf) {
    const ch = buf.getChannelData(0);
    const n = ch.length;
    const sr = buf.sampleRate;
    const headMax = Math.min(n, Math.floor(sr * 0.08));
    const tailMax = Math.min(n, Math.floor(sr * 0.15));
    let head = 0;
    for (let i = 0; i < headMax; i++) {
      if (Math.abs(ch[i]) > 0.02) { head = i; break; }
      head = i;
    }
    let tail = n;
    for (let i = n - 1; i >= n - tailMax; i--) {
      if (Math.abs(ch[i]) > 0.02) { tail = i + 1; break; }
      tail = i;
    }
    const start = Math.max(0, head - Math.floor(sr * 0.01)) / sr;
    const end = Math.min(n, tail + Math.floor(sr * 0.01)) / sr;
    if (end - start < 1) return null;
    return { start: start, end: end };
  }

  // 手机端把背景音乐重采样为 22.05kHz 单声道再缓存：
  // 解码后的 PCM 内存约为原来的 1/4，长时间游玩不会因 4 首曲子常驻而吃满内存。
  function downmixBgm(buf) {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    if (!coarse || !buf) return Promise.resolve(buf);
    const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctor) return Promise.resolve(buf);
    const rate = Math.min(22050, buf.sampleRate);
    if (buf.sampleRate <= 22050 && buf.numberOfChannels <= 1) return Promise.resolve(buf);
    try {
      const off = new Ctor(1, Math.ceil(buf.duration * rate), rate);
      const src = off.createBufferSource();
      src.buffer = buf;
      src.connect(off.destination);
      src.start();
      return off.startRendering().catch(() => buf);
    } catch (e) {
      return Promise.resolve(buf);
    }
  }

  // 只保留当前曲目的解码缓存：切歌后释放旧曲，把常驻内存从「全部 BGM」压到「一首」
  function releaseBgmBuffers(keepKey) {
    for (const k of Object.keys(bgmBuffers)) {
      if (k === keepKey) continue;
      delete bgmBuffers[k];
      delete bgmLoop[k];
    }
  }

  function loadBgm(key) {
    if (bgmBuffers[key] || bgmFailed[key]) return Promise.resolve(bgmBuffers[key] || null);
    if (bgmLoading[key]) return bgmLoading[key];
    bgmLoading[key] = (async () => {
      const c = ensure();
      if (!c) { bgmFailed[key] = true; return null; }
      try {
        const res = await fetch(bgmUrl(key));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.arrayBuffer();
        const raw = await c.decodeAudioData(data);
        const buf = await downmixBgm(raw);
        bgmBuffers[key] = buf;
        bgmLoop[key] = trimLoop(buf);
        // 解码期间场景已经切到这首曲目：直接接上，避免一直静音或停在上一首
        if (bgmKey === key && enabled && musicOn && unlocked && bgmNodes.key !== key) startBgmNode(key, 300);
        return buf;
      } catch (e) {
        bgmFailed[key] = true;
        if (bgmKey === key && enabled && musicOn) playBgmHtml(key);
        return null;
      } finally {
        delete bgmLoading[key];
      }
    })();
    return bgmLoading[key];
  }

  function startBgmNode(key, fadeMs) {
    const buf = bgmBuffers[key];
    const bus = ensureMusicBus();
    if (!buf || !bus) return false;
    if (bgmNodes.src) stopBgmNodes(fadeMs);
    const c = ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = bgmLoop[key];
    if (lp) { src.loopStart = lp.start; src.loopEnd = lp.end; }
    const g = c.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(bus);
    src.start();
    bgmNodes = { key: key, src: src, gain: g, bornAt: Date.now() };
    // 刚起播的曲目不需要立刻被恢复逻辑重建
    lastReviveAt = Date.now();
    releaseBgmBuffers(key);
    fadeGain(g.gain, BGM_LEVEL, fadeMs == null ? BGM_FADE : fadeMs);
    if (c.state === 'suspended') {
      const p = c.resume();
      if (p && p.catch) p.catch(() => {});
    }
    return true;
  }

  function stopBgmNodes(ms) {
    const nodes = bgmNodes;
    bgmNodes = { key: null, src: null, gain: null, bornAt: 0 };
    if (!nodes.src) return;
    const dur = ms == null ? 450 : ms;
    if (nodes.gain) fadeGain(nodes.gain.gain, 0.0001, dur);
    const src = nodes.src;
    const g = nodes.gain;
    setTimeout(() => {
      try { src.stop(); } catch (e) { /* 已停止 */ }
      try { src.disconnect(); } catch (e) { /* 已断开 */ }
      if (g) { try { g.disconnect(); } catch (e) { /* 已断开 */ } }
    }, dur + 60);
  }

  // <audio> 兜底：仅当 mp3 无法 fetch/解码时使用
  function fadeTo(el, from, to, ms, done) {
    if (!el) return;
    const token = (el._fade = (el._fade || 0) + 1);
    const t0 = Date.now();
    el.volume = Math.max(0, Math.min(1, from));
    const timer = setInterval(() => {
      if (el._fade !== token) { clearInterval(timer); return; }
      const k = Math.min(1, (Date.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) {
        clearInterval(timer);
        if (done) done();
      }
    }, 30);
  }

  function playBgmHtml(key) {
    if (!unlocked || bgmBroken[key]) return;
    if (bgmEl && bgmHtmlKey === key) {
      if (bgmEl.paused) {
        const p = bgmEl.play();
        if (p && p.catch) p.catch(() => {});
      }
      return;
    }
    if (bgmEl) {
      const old = bgmEl;
      bgmEl = null;
      fadeTo(old, old.volume, 0, 400, () => { old.pause(); });
    }
    const el = new Audio(bgmUrl(key));
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    // 文件损坏/404 时清掉引用并标记，避免看门狗反复重试
    el.addEventListener('error', () => {
      bgmBroken[key] = true;
      if (bgmEl === el) { bgmEl = null; bgmHtmlKey = null; }
    });
    bgmEl = el;
    bgmHtmlKey = key;
    releaseBgmBuffers(null);
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
    fadeTo(el, 0, BGM_LEVEL, 500);
  }

  function resumeBgm() {
    if (!bgmKey || !enabled || !musicOn) return;
    // 未解锁（还没有任何用户手势）时不下载音频：单曲 2MB+，提前拉会抢占登录页带宽，
    // 而浏览器在解锁前本来也不允许出声
    if (!unlocked) return;
    ensureRunning();
    if (bgmNodes.src) {
      fadeGain(bgmNodes.gain.gain, BGM_LEVEL, 400);
      return;
    }
    if (bgmBuffers[bgmKey]) { startBgmNode(bgmKey, 400); return; }
    if (bgmFailed[bgmKey] && !bgmBroken[bgmKey]) { playBgmHtml(bgmKey); return; }
    loadBgm(bgmKey);
  }

  let lastHeal = 0;
  // 看门狗：处理「放着放着没声」——上下文被挂起、节点增益卡在 0、节点意外丢失
  function healBgm(force) {
    if (!bgmKey || !enabled || !musicOn || !unlocked || (!force && document.hidden)) return;
    const now = Date.now();
    if (!force && now - lastHeal < 1200) return;
    lastHeal = now;
    ensureRunning();
    if (bgmNodes.src) {
      // 淡入过程不打扰；持续 1.5 秒以上仍近乎无声才补回音量
      const g = bgmNodes.gain && bgmNodes.gain.gain;
      if (g && !battlePaused && now - bgmNodes.bornAt > 1500 && g.value < 0.02) {
        fadeGain(g, BGM_LEVEL, 350);
      }
      return;
    }
    if (bgmEl) {
      if (bgmEl.paused) {
        const p = bgmEl.play();
        if (p && p.catch) p.catch(() => {});
      }
      return;
    }
    resumeBgm();
  }
  // 前台看门狗：即使没收到 visibility / focus 事件，也定期把被系统挂起的上下文拉回来
  setInterval(() => {
    if (document.hidden) return;
    // 上下文被内核对掉（页面被冻结回收）：直接重建音频图
    if (!ctx) { if (unlocked) rebuild(); return; }
    if (ctx.state !== 'running') wakeAudio();
    healBgm(false);
  }, 2500);

  // 切换背景音乐：同一首不重启；切换时双轨交叉淡化，旧曲在淡出结束点精确停止
  function playBgm(key) {
    if (!BGM[key]) return;
    bgmKey = key;
    if (!enabled || !musicOn) return;
    // 切场景时上下文可能仍被系统挂着：先唤醒再起播，避免新场景一路静音
    if (ctx && ctx.state !== 'running' && !document.hidden) wakeAudio();

    if (bgmNodes.src && bgmNodes.key === key) {
      resumeBgm();
      return;
    }
    if (!unlocked) return;   // 等首次手势解锁后再由 resumeBgm 下载并起播，避免首屏抢带宽

    if (bgmBuffers[key]) { startBgmNode(key, BGM_FADE); return; }
    if (bgmFailed[key]) { playBgmHtml(key); return; }
    // 尚未解码：先取回并解码，完成时若仍是当前曲目会自动淡入
    loadBgm(key);
  }

  function stopBgm() {
    bgmKey = null;
    stopBgmNodes(450);
    if (bgmEl) {
      const old = bgmEl;
      bgmEl = null;
      bgmHtmlKey = null;
      fadeTo(old, old.volume, 0, 400, () => { old.pause(); });
    }
  }

  /* ---------------- 对外接口 ---------------- */
  A.setAmbient = function (id) {
    current = id;
    if (!ctx || !unlocked) return;   // 等首次手势解锁后自动补播
    stopAmbient(0.5);
    buildAmbient(id);
  };

  A.stop = function () {
    current = null;
    if (ctx) stopAmbient(0.7);
  };

  A.thunder = thunder;
  A.warcryBurst = warcryBurst;
  A.bossHit = bossHitBurst;

  A.play = play;
  A.playBgm = playBgm;
  A.stopBgm = stopBgm;
  A.preload = preloadAll;

  // 按职业技能预热，进入主城/副本前调用
  A.preloadClass = function (classId) {
    queuePreload(CLASS_SFX[classId] || []);
  };

  A.preloadKeys = function (keys) {
    queuePreload(keys || []);
  };

  // 战斗暂停（打开暂停卡、养成面板、切出窗口）：音乐与环境音同步压低
  A.setBattlePaused = function (v) {
    battlePaused = !!v;
    if (!ctx) return;
    if (musicBus) fadeGain(musicBus.gain, musicOn ? (battlePaused ? BGM_DUCK : 1) : 0.0001, 250);
    if (amb) fadeGain(amb.gain.gain, battlePaused ? 0.0001 : ambLevel(), 250);
  };

  // 天气环境音音量：0-1，实时调整当前正在播放的底噪
  A.setAmbientVolume = function (v) {
    ambVol = Math.max(0, Math.min(1, Number(v) || 0));
    if (amb && ctx) fadeGain(amb.gain.gain, battlePaused ? 0.0001 : ambLevel(), 200);
  };

  // 背景音乐单独开关：只影响 BGM，界面音效与战斗音效保持原样
  A.setMusicEnabled = function (v) {
    musicOn = !!v;
    if (!musicOn) {
      stopBgmNodes(300);
      if (bgmEl) {
        const old = bgmEl;
        bgmEl = null;
        bgmHtmlKey = null;
        fadeTo(old, old.volume, 0, 300, () => { old.pause(); });
      }
    } else {
      if (musicBus) fadeGain(musicBus.gain, battlePaused ? BGM_DUCK : 1, 250);
      if (enabled) resumeBgm();
    }
  };

  A.setEnabled = function (v) {
    enabled = !!v;
    if (DG.settings) DG.settings.set({ audio: enabled });
    if (sfxBus) sfxBus.gain.value = enabled ? 1 : 0;
    if (enabled) {
      // 静音期间切过场景：重新开启时按当前场景补播 BGM
      resumeBgm();
    } else {
      stopBgmNodes(250);
      if (bgmEl) bgmEl.pause();
    }
    if (!ctx) { if (enabled) unlock(); return; }
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(enabled ? 0.42 : 0, t + 0.25);
    if (enabled) unlock();
  };

  A.getEnabled = function () { return enabled; };

  // 自检用：当前 BGM 运行状态（不含敏感数据，可安全打印）
  A.getBgmState = function () {
    return {
      key: bgmKey,
      playing: !!(bgmNodes.src || (bgmEl && !bgmEl.paused)),
      ctxState: ctx ? ctx.state : 'none',
      gain: bgmNodes.gain ? Math.round(bgmNodes.gain.gain.value * 1000) / 1000 : 0,
      fallback: !!bgmEl,
      unlocked: unlocked,
      musicOn: musicOn,
      enabled: enabled
    };
  };

  // UI 点击音效：统一委托，避免每个按钮重复接事件；data-sfx="none" 可关闭
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('button, .btn, [data-sfx]');
    if (!btn) return;
    const key = btn.getAttribute('data-sfx');
    if (key === 'none') return;
    play(key || 'uiClick', { vol: 0.5, gap: 0.06 });
  }, true);
})();
