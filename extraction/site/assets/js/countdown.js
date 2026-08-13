
  const counters = document.querySelectorAll('.counter');
  const speed = 100; // lower = faster

  const startCounting = () => {
    counters.forEach(counter => {
      const updateCount = () => {
        const target = +counter.getAttribute('data-target');
        const count = +counter.innerText;
        const increment = target / speed;

        if (count < target) {
          counter.innerText = Math.ceil(count + increment);
          setTimeout(updateCount, 20);
        } else {
          counter.innerText = target >= 1000 ? (target / 1000) + "k+" : target + "+";
        }
      };
      updateCount();
    });
  };

  // Start count when visible
  window.addEventListener('scroll', () => {
    const section = document.querySelector('.countdownStart-section');
    const sectionTop = section.getBoundingClientRect().top;
    const triggerPoint = window.innerHeight / 1.2;
    if (sectionTop < triggerPoint) {
      startCounting();
    }
  });