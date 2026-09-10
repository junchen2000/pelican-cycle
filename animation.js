(function () {
  'use strict';

  const GEOMETRY = Object.freeze({
    wheelRadius: 91,
    crankRadius: 26,
    crankX: 486,
    crankY: 451,
    cycleSeconds: 1.45,
    gearRatio: 1.5
  });

  function createClock({ playing = true, speed = 1 } = {}) {
    let motionSeconds = 0;
    let lastTimestamp = null;

    return {
      tick(timestampMilliseconds) {
        if (playing && lastTimestamp !== null) {
          motionSeconds += (timestampMilliseconds - lastTimestamp) / 1000 * speed;
        }
        lastTimestamp = timestampMilliseconds;
        return motionSeconds;
      },

      setPlaying(value) {
        if (playing === value) return;
        playing = value;
        // The first resumed frame anchors without including any paused time.
        if (playing) lastTimestamp = null;
      },

      setSpeed(value) {
        speed = value;
      },

      resetTimestamp() {
        lastTimestamp = null;
      }
    };
  }

  function getPose(seconds) {
    const angle = seconds * 2 * Math.PI / GEOMETRY.cycleSeconds;
    const wheelAngle = angle * GEOMETRY.gearRatio;
    const distance = wheelAngle * GEOMETRY.wheelRadius;
    const pedalX = GEOMETRY.crankRadius * Math.cos(angle);
    const pedalY = GEOMETRY.crankRadius * Math.sin(angle);

    return {
      wheelDegrees: wheelAngle * 180 / Math.PI % 360,
      crankDegrees: angle * 180 / Math.PI % 360,
      nearFoot: {
        x: GEOMETRY.crankX + pedalX,
        y: GEOMETRY.crankY + pedalY
      },
      farFoot: {
        x: GEOMETRY.crankX - pedalX,
        y: GEOMETRY.crankY - pedalY
      },
      bodyBob: Math.sin(angle * 2) * 2.2,
      roadOffset: distance % 180,
      cloudOffset: distance * 0.08 % 1200,
      plantOffset: distance % 1200
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GEOMETRY, createClock, getPose };
  }

  if (typeof document === 'undefined') return;

  const nodes = {
    rearSpokes: document.getElementById('rear-spokes'),
    frontSpokes: document.getElementById('front-spokes'),
    crank: document.getElementById('crank'),
    nearFoot: document.getElementById('near-foot'),
    farFoot: document.getElementById('far-foot'),
    body: document.getElementById('pelican-body'),
    scarf: document.getElementById('scarf-tail'),
    eye: document.getElementById('pelican-eye'),
    pouch: document.getElementById('pouch-fold'),
    nearLeg: document.getElementById('near-leg'),
    nearLegBorder: document.getElementById('near-leg-border'),
    farLeg: document.getElementById('far-leg'),
    farLegBorder: document.getElementById('far-leg-border'),
    road: document.getElementById('road-marks'),
    clouds: document.getElementById('clouds'),
    plants: document.getElementById('plants'),
    toggle: document.getElementById('toggle-play'),
    status: document.getElementById('ride-status'),
    hint: document.getElementById('ride-hint'),
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speed-value')
  };
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motionPreference.matches;
  const speed = Number(nodes.speed.value);
  const clock = createClock({ playing, speed });
  let frameId = null;
  let pageHidden = false;

  function render(seconds) {
    const pose = getPose(seconds);
    const phase = pose.crankDegrees * Math.PI / 180;
    nodes.rearSpokes.setAttribute('transform', `rotate(${pose.wheelDegrees} 338 489)`);
    nodes.frontSpokes.setAttribute('transform', `rotate(${pose.wheelDegrees} 673 489)`);
    nodes.crank.setAttribute('transform', `rotate(${pose.crankDegrees} 486 451)`);
    nodes.nearFoot.setAttribute('transform', `translate(${pose.nearFoot.x} ${pose.nearFoot.y})`);
    nodes.farFoot.setAttribute('transform', `translate(${pose.farFoot.x} ${pose.farFoot.y})`);
    nodes.body.setAttribute('transform', `translate(0 ${pose.bodyBob})`);
    nodes.scarf.setAttribute('transform', `rotate(${Math.sin(phase * 2) * 4} 532 236)`);

    // A short blink at the end of each 4.8 motion seconds, never on a separate timer.
    const blinkTime = seconds % 4.8;
    const blinkScale = blinkTime > 4.68
      ? 1 - 0.92 * Math.sin((blinkTime - 4.68) / 0.12 * Math.PI)
      : 1;
    nodes.eye.setAttribute('transform', `translate(594 159) scale(1 ${blinkScale})`);
    nodes.pouch.setAttribute('d', `M631 202q21 ${28 + Math.sin(phase) * 1.5} 62 28`);

    const nearLeg = `M479 ${343 + pose.bodyBob}Q530 390 ${pose.nearFoot.x - 4} ${pose.nearFoot.y - 8}`;
    const farLeg = `M468 ${344 + pose.bodyBob}Q519 390 ${pose.farFoot.x - 4} ${pose.farFoot.y - 8}`;
    nodes.nearLeg.setAttribute('d', nearLeg);
    nodes.nearLegBorder.setAttribute('d', nearLeg);
    nodes.farLeg.setAttribute('d', farLeg);
    nodes.farLegBorder.setAttribute('d', farLeg);
    nodes.road.setAttribute('transform', `translate(${-pose.roadOffset} 0)`);
    nodes.clouds.setAttribute('transform', `translate(${-pose.cloudOffset} 0)`);
    nodes.plants.setAttribute('transform', `translate(${-pose.plantOffset} 0)`);
  }

  function updatePlayback(reducedMotionInitial = false) {
    nodes.toggle.setAttribute('aria-label', playing ? '暂停动画' : '继续播放动画');
    nodes.toggle.classList.toggle('is-paused', !playing);
    nodes.status.textContent = playing ? '自在骑行中' : '停一停，看风景';
    nodes.hint.textContent = playing ? '只有海风，没有待办'
      : reducedMotionInitial ? '已减少动态，点按播放出发' : '准备好了，就继续出发';
  }

  function updateSpeed() {
    const value = Number(nodes.speed.value);
    clock.setSpeed(value);
    nodes.speedValue.textContent = String(value) + '×';
    nodes.speed.setAttribute('aria-valuetext', value + ' 倍速');
    nodes.speed.style.setProperty('--progress', `${(value - 0.5) / 1.5 * 100}%`);
  }

  function suspendFrames() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    clock.resetTimestamp();
  }

  function scheduleFrame() {
    if (playing && !document.hidden && !pageHidden && frameId === null) {
      frameId = requestAnimationFrame(onFrame);
    }
  }

  function onFrame() {
    frameId = null;
    if (!playing || document.hidden || pageHidden) {
      clock.resetTimestamp();
      return;
    }
    // Use the same timestamp source for frames and control events.
    render(clock.tick(performance.now()));
    scheduleFrame();
  }

  function flushVisibleFrame() {
    if (!document.hidden && !pageHidden) render(clock.tick(performance.now()));
  }

  function setPlayback(value) {
    if (playing === value) return;
    flushVisibleFrame();
    playing = value;
    clock.setPlaying(playing);
    updatePlayback();
    suspendFrames();
    scheduleFrame();
  }

  function syncVisibility() {
    suspendFrames();
    scheduleFrame();
  }

  nodes.toggle.addEventListener('click', () => setPlayback(!playing));
  nodes.speed.addEventListener('input', () => {
    // Charge elapsed time at the old speed before applying the new one.
    flushVisibleFrame();
    updateSpeed();
  });
  const onMotionPreferenceChange = event => {
    if (event.matches) setPlayback(false);
  };
  if (typeof motionPreference.addEventListener === 'function') {
    motionPreference.addEventListener('change', onMotionPreferenceChange);
  } else {
    motionPreference.addListener(onMotionPreferenceChange);
  }
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pagehide', () => {
    pageHidden = true;
    suspendFrames();
  });
  window.addEventListener('pageshow', () => {
    pageHidden = false;
    syncVisibility();
  });

  render(0);
  updatePlayback(motionPreference.matches);
  updateSpeed();
  scheduleFrame();
})();
