(function () {
    "use strict";

    function init() {
        const storyNode = document.querySelector('tw-story');

        if (storyNode) {
            // Вынесли логику в отдельную функцию, чтобы вызвать её и сразу, и при изменениях
            const checkTags = () => {
                const isHidden = storyNode.getAttribute('tags') === 'hide_header';
                document.querySelectorAll('[data-menu-hide]').forEach(el => {
                    el.classList.toggle('menu-hide', isHidden);
                });
            };

            // 1. Запускаем один раз принудительно прямо сейчас для первого пассажа
            checkTags();

            // 2. Вешаем обсервер на будущие изменения пассажей
            const observer = new MutationObserver(checkTags);
            observer.observe(storyNode, {attributes: true, attributeFilter: ['tags']});
        }
    }

    window.observers = Object.assign(window.observers || {}, {
        init
    });
})();
