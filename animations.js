(function () {
 const body = document.body;
 if (!body || !body.classList.contains('landing-page')) return;

 const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const progressBars = Array.from(document.querySelectorAll('[data-progress]'));

 function formatCount(element, value) {
  const prefix = element.dataset.countPrefix || '';
  const suffix = element.dataset.countSuffix || '';
  element.textContent = `${prefix}${Math.round(value)}${suffix}`;
 }

 function animateCount(element) {
  if (element.dataset.counted === 'true') return;
  element.dataset.counted = 'true';

  const target = Number(element.dataset.count || 0);
  const duration = Number(element.dataset.countDuration || 1100);

  if (reduceMotion || !Number.isFinite(target)) {
   formatCount(element, target);
   return;
  }

  const start = performance.now();

  function tick(now) {
   const elapsed = Math.min((now - start) / duration, 1);
   const eased = 1 - Math.pow(1 - elapsed, 3);
   formatCount(element, target * eased);

   if (elapsed < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
 }

 function growProgress(bar) {
  if (bar.dataset.grown === 'true') return;
  bar.dataset.grown = 'true';

  const target = Number(bar.dataset.progress || 0);
  const width = `${Math.max(0, Math.min(target, 100))}%`;

  if (reduceMotion) {
   bar.style.width = width;
   return;
  }

  bar.classList.add('progress-grown');
  requestAnimationFrame(() => {
   bar.style.width = width;
  });
 }

 function setupProgressBars() {
  progressBars.forEach((bar) => {
   const target = bar.dataset.progress || parseFloat(bar.style.width) || 0;
   bar.dataset.progress = target;
   if (!reduceMotion) {
    bar.classList.add('progress-animate');
    bar.style.width = '0%';
   }
  });
 }

 function setupRevealObserver() {
  const revealTargets = Array.from(document.querySelectorAll('.hero, .section, .footer'));
  const counters = Array.from(document.querySelectorAll('[data-count]'));

  if (reduceMotion || !('IntersectionObserver' in window)) {
   revealTargets.forEach((target) => target.classList.add('is-visible'));
   counters.forEach(animateCount);
   progressBars.forEach(growProgress);
   return;
  }

  revealTargets.forEach((target) => target.classList.add('scroll-reveal'));

  const revealObserver = new IntersectionObserver((entries, observer) => {
   entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
   });
  }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

  revealTargets.forEach((target) => revealObserver.observe(target));

  const countObserver = new IntersectionObserver((entries, observer) => {
   entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    animateCount(entry.target);
    observer.unobserve(entry.target);
   });
  }, { threshold: 0.45 });

  counters.forEach((counter) => countObserver.observe(counter));

  const progressObserver = new IntersectionObserver((entries, observer) => {
   entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    growProgress(entry.target);
    observer.unobserve(entry.target);
   });
  }, { threshold: 0.45 });

  progressBars.forEach((bar) => progressObserver.observe(bar));
 }

 function setupParallax() {
  const hero = document.querySelector('.hero');
  if (!hero || reduceMotion) return;

  let ticking = false;

  function update() {
   const rect = hero.getBoundingClientRect();
   const progress = Math.min(Math.max(-rect.top / Math.max(rect.height, 1), 0), 1);
   const bgY = progress * 46;
   const contentY = progress * -14;
   const visualY = progress * -22;

   hero.style.setProperty('--hero-parallax-y', `${bgY}px`);
   const content = hero.querySelector('.hero-content');
   const visual = hero.querySelector('.hero-visual');
   if (content) content.style.transform = `translate3d(0, ${contentY}px, 0)`;
   if (visual) visual.style.transform = `translate3d(0, ${visualY}px, 0)`;
   ticking = false;
  }

  function requestUpdate() {
   if (ticking) return;
   ticking = true;
   requestAnimationFrame(update);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  requestUpdate();
 }

 function setupStreakFloat() {
  const streakCard = document.querySelector('.mockup-streak-card');
  if (!streakCard || reduceMotion) return;

  let frameId = 0;
  let start = performance.now();

  function tick(now) {
   if (window.innerWidth <= 680) {
    streakCard.style.transform = '';
    frameId = requestAnimationFrame(tick);
    return;
   }

   const elapsed = (now - start) / 1000;
   const y = Math.sin(elapsed * 1.35) * 8;
   streakCard.style.transform = `translate3d(0, ${y}px, 0)`;
   frameId = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', () => {
   if (document.hidden) {
    cancelAnimationFrame(frameId);
    frameId = 0;
    return;
   }

   start = performance.now();
   if (!frameId) frameId = requestAnimationFrame(tick);
  });

  frameId = requestAnimationFrame(tick);
 }

 setupProgressBars();
 body.classList.add('motion-ready');
 requestAnimationFrame(() => body.classList.add('hero-loaded'));
 setupRevealObserver();
 setupParallax();
 setupStreakFloat();
})();
