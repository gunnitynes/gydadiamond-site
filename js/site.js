// Slideshows on the PHOTOS page: autoplay, arrows, swipe and arrow keys.
document.querySelectorAll('.slideshow').forEach(function (show) {
  var slides = show.querySelectorAll('.slide');
  var count = show.querySelector('.count');
  var i = 0, timer = null;
  var auto = show.dataset.autoplay === 'true';
  var speed = Math.max(1.5, parseFloat(show.dataset.speed) || 3) * 1000;

  function go(n) {
    slides[i].classList.remove('on');
    i = (n + slides.length) % slides.length;
    slides[i].classList.add('on');
    if (count) count.textContent = (i + 1) + ' / ' + slides.length;
  }
  function restart() {
    if (timer) clearInterval(timer);
    if (auto && slides.length > 1) timer = setInterval(function () { go(i + 1); }, speed);
  }
  show.querySelector('.prev').addEventListener('click', function () { go(i - 1); restart(); });
  show.querySelector('.next').addEventListener('click', function () { go(i + 1); restart(); });
  show.querySelector('.slides').addEventListener('click', function () { go(i + 1); restart(); });
  show.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
  show.addEventListener('mouseleave', restart);

  var x0 = null;
  show.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  show.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { go(dx < 0 ? i + 1 : i - 1); restart(); }
  });
  show.tabIndex = 0;
  show.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { go(i - 1); restart(); }
    if (e.key === 'ArrowRight') { go(i + 1); restart(); }
  });

  // Only autoplay while the slideshow is on screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) restart(); else if (timer) clearInterval(timer); });
    }).observe(show);
  } else restart();
});
