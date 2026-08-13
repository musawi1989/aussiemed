var swiper = new Swiper( '.swiper-container.two', {
    pagination: '.swiper-pagination',
    paginationClickable: true,
    // Navigation arrows
  navigation: {
    nextEl: '.swiper-button-next',
    prevEl: '.swiper-button-prev',
  },
    effect: 'coverflow',
    loop: true,
    centeredSlides: true,
    slidesPerView: 1.5,
    lazyLoading: true,
    lazyLoadingInPrevNext: true,
    speed: 1000,   
    additionalSlide: 1,
    coverflow: {
      rotate: 0,
      stretch: 150,
      depth: 200,
      modifier: 1,
      slideShadows : false,
    }
} );
