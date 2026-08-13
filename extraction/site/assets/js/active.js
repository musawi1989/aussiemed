(function ($) {
    'use strict';

    var $window = $(window);

    // :: Nav Active Code
    if ($.fn.classyNav) {
        $('#essenceNav').classyNav();
    }

    $(document).ready(function() {
        // 1. Initialize Swiper Sliders
        if (typeof Swiper !== 'undefined') {
            var thumbs = new Swiper(".product-thumbs-slider", {
                direction: "vertical",
                spaceBetween: 10,
                slidesPerView: 4,
                freeMode: true,
                watchSlidesProgress: true,
                breakpoints: {
                    0: { direction: "horizontal" },
                    768: { direction: "vertical" }
                }
            });

            var main = new Swiper(".product-main-slider", {
                spaceBetween: 10,
                watchOverflow: true,
                navigation: {
                    nextEl: ".swiper-button-next",
                    prevEl: ".swiper-button-prev",
                },
                thumbs: {
                    swiper: thumbs,
                },
            });

            // --- ZOOM ON HOVER LOGIC ---
            $('.product-main-slider .swiper-slide').on('mousemove', function(e) {
                const img = $(this).find('img');
                const offsetX = e.pageX - $(this).offset().left;
                const offsetY = e.pageY - $(this).offset().top;
                const x = (offsetX / $(this).width()) * 100;
                const y = (offsetY / $(this).height()) * 100;
                
                img.css({
                    'transform-origin': x + '% ' + y + '%',
                    'transform': 'scale(1.5)'
                });
            }).on('mouseleave', function() {
                $(this).find('img').css({
                    'transform-origin': 'center center',
                    'transform': 'scale(1)'
                });
            });
        }

        // 2. Quantity Selector Logic
        $(document).on('click', '.qty-btn, .qty_plus, .qty_minus', function() {
            var isPlus = $(this).hasClass('qty_plus') || $(this).text().trim() === '+';
            var input = $(this).siblings('.qty-input, .qty_count');
            var val = parseInt(input.val()) || 1;
            
            if(isPlus) {
                input.val(val + 1);
            } else if(val > 1) {
                input.val(val - 1);
            }
        });

        // 3. GLightbox Initialization
        if (typeof GLightbox !== 'undefined') {
            const lightbox = GLightbox({
                selector: '.glightbox',
                touchNavigation: true,
                loop: true,
                zoomable: true
            });

            // Zoom Icon Trigger Logic
            $(document).on('click', '.zoom-icon', function() {
                const activeSlideLink = $('.product-main-slider .swiper-slide-active .glightbox')[0];
                if (activeSlideLink) {
                    activeSlideLink.click();
                }
            });
        }

        // 4. Address Radio Toggle Logic
        $('input[name="AddressOption"]').on('change', function() {
            const newAddressDiv = $('#use_new_address');
            this.value === "0" ? newAddressDiv.show() : newAddressDiv.hide();
        });

        // 5. Custom Select Dropdowns
        const allSelects = $('.custom-select');
        allSelects.each(function() {
            const select = $(this);
            const trigger = select.find('.select-trigger');
            const options = select.find('.option');
            const text = select.find('.selected-text');

            trigger.on('click', function(e) {
                e.stopPropagation();
                allSelects.not(select).removeClass('open');
                select.toggleClass('open');
            });

            options.on('click', function() {
                text.text($(this).text());
                select.removeClass('open');
            });
        });

        $(window).on('click', function() {
            allSelects.removeClass('open');
        });

        // 6. Grid / List View Toggle
        $(document).on('click', '.grid_view_style', function (e) {
            e.preventDefault();

            $('.product-listing-wrapper')
                .addClass('grid_view')
                .removeClass('list_view');

            $('.list_view_style').removeClass('active');
            $(this).addClass('active');
        });

        $(document).on('click', '.list_view_style', function (e) {
            e.preventDefault();

            $('.product-listing-wrapper')
                .addClass('list_view')
                .removeClass('grid_view');

            $('.grid_view_style').removeClass('active');
            $(this).addClass('active');
        });

    });

    // :: Global Click Delegation (Tabs & Sidebar)
    document.addEventListener("click", function (e) {
        // Tab System
        if (e.target.classList.contains("tab-item")) {
            const tab = e.target.dataset.tab;
            $(".tab-item").removeClass("active");
            $(".tab-content").removeClass("active");
            $(e.target).addClass("active");
            $(`.tab-content[data-content="${tab}"]`).addClass("active");
        }

        // Sidebar
        if (e.target.id === 'filterOpen') {
            $('.product-listing-sidebar, .sidebar-overlay').addClass('active');
            $('body').css('overflow', 'hidden');
        }
        if (e.target.id === 'filterClose' || e.target.classList.contains('sidebar-overlay')) {
            $('.product-listing-sidebar, .sidebar-overlay').removeClass('active');
            $('body').css('overflow', '');
        }
    });

    // :: Owl Carousel
    if ($.fn.owlCarousel) {
        $('.brand-cursol-slider').owlCarousel({
            loop: true, margin: 20, autoplay: true, dots: false, nav: false,
            responsive: { 0: { items: 1 }, 575: { items: 3 }, 992: { items: 6 } }
        });
        $('.products-cursol-slider').owlCarousel({
            loop: false, margin: 20, dots: false, nav: true,
            responsive: { 0: { items: 1 }, 575: { items: 2 }, 992: { items: 5 } }
        });
    }

    // Show/Hide "Scroll to Top" button based on scroll position
    $window.on('scroll', function () {
        if ($(this).scrollTop() > 400) {
            $('#scrollToTop').addClass('active');
        } else {
            $('#scrollToTop').removeClass('active');
        }
    });

    // Click event to scroll to top smoothly
    $('#scrollToTop').on('click', function () {
        $('html, body').animate({
            scrollTop: 0
        }, 500); // 500ms duration for the smooth scroll
        return false;
    });


    // :: Sticky Header & AOS
    $window.on('scroll', function () {
        $('.header_panel').toggleClass('sticky', $window.scrollTop() > 200);
    });

    window.addEventListener('load', function() {
        if (typeof AOS !== 'undefined') {
            AOS.init({ duration: 1000, once: true });
        }
    });

})(jQuery);