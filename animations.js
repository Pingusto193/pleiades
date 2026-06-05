(function () {
 const body = document.body;
 if (!body) return;

 const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const hasIntersectionObserver = 'IntersectionObserver' in window;

 const revealSelector = [
  '.hero',
  '.section',
  '.footer',
  '.auth-promo',
  '.auth-form',
  '.onboarding-section',
  '.hero-metric',
  '.dashboard-stat',
  '.dashboard-progress',
  '.week-node',
  '.orbit-core',
  '.app-content > *',
  '.stat-card',
  '.main-cta-card',
  '.weekly-progress',
  '.week-day',
  '.achievement-card',
  '.session-setup-card',
  '.favorite-subjects-card',
  '.method-big-card',
  '.timer-card',
  '.session-progress-card',
  '.result-card',
  '.modal-card',
  '.calendar-header',
  '.cal-legend',
  '.calendar-grid',
  '.month-summary',
  '.summary-stat',
  '.subject-card',
  '.add-subject-card',
  '.upgrade-card',
  '.profile-hero-card',
  '.profile-tabs',
  '.tab-content > *',
  '.ach-full-card',
  '.history-item',
  '.settings-card',
  '.stats-simple-intro',
  '.stats-simple-card',
  '.stats-section-card',
  '.stats-insight',
  '.stats-subject-card',
  '.profile-proof-grid span',
  '.quick-stat',
  '.profile-level-card',
  '.step-card',
  '.method-card',
  '.reward-item',
  '.pricing-plan',
  '.cog-feat',
  '.profile-preview'
 ].join(',');

 const hoverSelector = [
  '.step-card',
  '.method-card',
  '.reward-item',
  '.pricing-plan',
  '.stat-card',
  '.main-cta-card',
  '.achievement-card',
  '.session-setup-card',
  '.favorite-subjects-card',
  '.method-big-card',
  '.timer-card',
  '.session-progress-card',
  '.result-card',
  '.summary-stat',
  '.subject-card',
  '.add-subject-card',
  '.upgrade-card',
  '.profile-hero-card',
  '.profile-level-card',
  '.quick-stat',
  '.ach-full-card',
  '.history-item',
  '.settings-card',
  '.stats-simple-card',
  '.stats-section-card',
  '.stats-insight',
  '.stats-subject-card',
  '.cog-feat',
  '.profile-preview',
  '.mockup-card',
  '.hero-metric',
  '.dashboard-stat',
  '.dashboard-progress',
  '.week-node',
  '.profile-proof-grid span'
 ].join(',');

 const counterSelector = [
  '[data-count]',
  '.stat-card-num',
  '.topbar-streak',
  '.profile-streak-big',
  '.level-xp',
  '.quick-stat strong',
  '.summary-stat strong',
  '.stats-simple-card strong',
  '.stats-pie-center strong',
  '.stats-horizontal-bar-head span',
  '.session-prog-row strong',
  '.session-prog-pct',
  '.block-stat strong',
  '.result-stat',
  '.reward-icon'
 ].join(',');

 const progressSelector = [
  '[data-progress]',
  '.mockup-progress-fill',
  '.level-fill',
  '.level-fill-big',
  '.week-bar',
  '.stats-week-bar',
  '.stats-horizontal-bar-fill'
 ].join(',');

 let revealObserver;
 let counterObserver;
 let progressObserver;
 let mutationFrame = 0;

 function isElement(node) {
  return node && node.nodeType === 1;
 }

 function getElements(root, selector) {
  if (!root) return [];
  const elements = [];
  if (isElement(root) && root.matches(selector)) elements.push(root);
  const base = root.querySelectorAll ? root : document;
  return elements.concat(Array.from(base.querySelectorAll(selector)));
 }

 function formatCount(element, value) {
  const prefix = element.dataset.countPrefix || '';
  const suffix = element.dataset.countSuffix || '';
  element.textContent = `${prefix}${Math.round(value)}${suffix}`;
 }

 function parseCounter(element) {
  if (element.dataset.countAnimating === 'true') return false;

  if (element.dataset.count && element.dataset.autoCount !== 'true') {
   const source = `${element.dataset.countPrefix || ''}${element.dataset.count}${element.dataset.countSuffix || ''}`;
   if (!element.dataset.countSource) element.dataset.countSource = source;
   return true;
  }

  const text = element.textContent.replace(/\s+/g, ' ').trim();
  if (!text || text.includes(':')) return false;

  const match = text.match(/^([^0-9-]*)(-?\d+)(.*)$/);
  if (!match) return false;

  element.dataset.countPrefix = match[1];
  element.dataset.count = match[2];
  element.dataset.countSuffix = match[3];
  element.dataset.countDuration = element.dataset.countDuration || '950';
  element.dataset.autoCount = 'true';

  if (element.dataset.countSource !== text) {
   element.dataset.countSource = text;
   element.dataset.counted = 'false';
  }

  return true;
 }

 function animateCount(element) {
  if (element.dataset.counted === 'true') return;
  element.dataset.counted = 'true';

  const target = Number(element.dataset.count || 0);
  const duration = Number(element.dataset.countDuration || 1100);

  if (reduceMotion || !Number.isFinite(target)) {
   formatCount(element, target);
   element.dataset.countSource = element.textContent;
   return;
  }

  const start = performance.now();
  element.dataset.countAnimating = 'true';

  function tick(now) {
   const elapsed = Math.min((now - start) / duration, 1);
   const eased = 1 - Math.pow(1 - elapsed, 3);
   formatCount(element, target * eased);

   if (elapsed < 1) {
    requestAnimationFrame(tick);
    return;
   }

   formatCount(element, target);
   element.dataset.countSource = element.textContent;
   element.dataset.countAnimating = 'false';
  }

  requestAnimationFrame(tick);
 }

 function getProgressProperty(bar) {
  if (bar.dataset.progressProperty) return bar.dataset.progressProperty;
  if (bar.classList.contains('week-bar') || bar.classList.contains('stats-week-bar')) return 'height';
  return 'width';
 }

 function parseProgress(bar) {
  if (bar.dataset.motionProgressReady === 'true') return true;
  if (bar.id === 'sessionProgBar') return false;

  const property = getProgressProperty(bar);
  const inlineValue = bar.style[property];
  const computedValue = window.getComputedStyle(bar)[property];
  const target = bar.dataset.progress || inlineValue || computedValue;

  if (!target || target === 'auto' || target === '0px') return false;

  bar.dataset.progressProperty = property;
  bar.dataset.progressTarget = target;
  bar.dataset.motionProgressReady = 'true';
  bar.classList.add(property === 'height' ? 'motion-progress-height' : 'motion-progress-width');

  if (!reduceMotion) bar.style[property] = '0%';
  return true;
 }

 function growProgress(bar) {
  if (bar.dataset.grown === 'true') return;
  bar.dataset.grown = 'true';

  const property = bar.dataset.progressProperty || getProgressProperty(bar);
  const target = bar.dataset.progressTarget || bar.dataset.progress || bar.style[property];

  if (!target) return;

  bar.classList.add('motion-progress-grown');
  requestAnimationFrame(() => {
   bar.style[property] = target;
  });
 }

 function observeReveal(element) {
  if (element.dataset.revealReady === 'true') return;
  element.dataset.revealReady = 'true';
  element.classList.add('scroll-reveal');

  if (reduceMotion || !hasIntersectionObserver) {
   element.classList.add('is-visible');
   return;
  }

  revealObserver.observe(element);
 }

 function observeCounter(element) {
  if (!parseCounter(element)) return;

  if (reduceMotion || !hasIntersectionObserver) {
   animateCount(element);
   return;
  }

  counterObserver.observe(element);
 }

 function observeProgress(element) {
  if (!parseProgress(element)) return;

  if (reduceMotion || !hasIntersectionObserver) {
   growProgress(element);
   return;
  }

  progressObserver.observe(element);
 }

 function enhanceAll(root) {
  getElements(root, hoverSelector).forEach((element) => element.classList.add('motion-hover-card'));
  getElements(root, revealSelector).forEach(observeReveal);
  getElements(root, counterSelector).forEach(observeCounter);
  getElements(root, progressSelector).forEach(observeProgress);
 }

 function setupObservers() {
  if (!hasIntersectionObserver || reduceMotion) return;

  revealObserver = new IntersectionObserver((entries, observer) => {
   entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
   });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  counterObserver = new IntersectionObserver((entries, observer) => {
   entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    animateCount(entry.target);
    observer.unobserve(entry.target);
   });
  }, { threshold: 0.35 });

  progressObserver = new IntersectionObserver((entries, observer) => {
   entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    growProgress(entry.target);
    observer.unobserve(entry.target);
   });
  }, { threshold: 0.35 });
 }

 function setupParallax() {
  const hero = document.querySelector('.hero');
  if (!hero || reduceMotion) return;

  let ticking = false;

  function update() {
   const rect = hero.getBoundingClientRect();
   const progress = Math.min(Math.max(-rect.top / Math.max(rect.height, 1), 0), 1);
   const content = hero.querySelector('.hero-content');
   const visual = hero.querySelector('.hero-visual');

   hero.style.setProperty('--hero-parallax-y', `${progress * 46}px`);
   if (content) content.style.transform = `translate3d(0, ${progress * -14}px, 0)`;
   if (visual) visual.style.transform = `translate3d(0, ${progress * -22}px, 0)`;
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

 function setupFloatingElements() {
  const floating = Array.from(document.querySelectorAll('.mockup-streak-card, .auth-streak-preview'));
  if (!floating.length || reduceMotion) return;

  let frameId = 0;
  let start = performance.now();

  function tick(now) {
   const elapsed = (now - start) / 1000;
   floating.forEach((element, index) => {
    if (window.innerWidth <= 680 && element.classList.contains('mockup-streak-card')) {
     element.style.transform = '';
     return;
    }
    const y = Math.sin(elapsed * 1.35 + index * .55) * 8;
    element.style.transform = `translate3d(0, ${y}px, 0)`;
   });
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

 function isOwnCounterMutation(mutation) {
  const parent = mutation.target.parentElement;
  return parent && parent.dataset && parent.dataset.countAnimating === 'true';
 }

 function setupMutationObserver() {
  if (!('MutationObserver' in window)) return;

  const observer = new MutationObserver((mutations) => {
   if (mutations.every(isOwnCounterMutation)) return;
   if (mutationFrame) return;

   mutationFrame = requestAnimationFrame(() => {
    mutationFrame = 0;
    enhanceAll(document);
   });
  });

  observer.observe(document.body, {
   childList: true,
   subtree: true,
   characterData: true,
   attributes: true,
   attributeFilter: ['style', 'class']
  });
 }

 function setupTabs() {
  document.addEventListener('click', (event) => {
   const button = event.target.closest('.tab-btn');
   if (!button) return;

   requestAnimationFrame(() => {
    document.querySelectorAll('.tab-content').forEach((tab) => {
     const isVisible = tab.style.display !== 'none';
     tab.classList.toggle('tab-motion-active', isVisible);
    });
    enhanceAll(document);
   });
  });
 }

 setupObservers();
 body.classList.add('motion-ready');
 requestAnimationFrame(() => body.classList.add('hero-loaded'));
 enhanceAll(document);
 setupParallax();
 setupFloatingElements();
 setupMutationObserver();
 setupTabs();
})();
