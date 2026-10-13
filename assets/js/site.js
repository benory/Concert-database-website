(function () {
  "use strict";

  const toggle = document.querySelector(".nav-toggle");
  const navigation = document.getElementById("primary-navigation");
  if (!toggle || !navigation) return;

  function closeNavigation() {
    toggle.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  }

  toggle.addEventListener("click", function () {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    navigation.classList.toggle("is-open", !open);
  });

  navigation.addEventListener("click", function (event) {
    if (event.target.closest("a")) closeNavigation();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeNavigation();
      toggle.focus();
    }
  });

  window.matchMedia("(min-width: 761px)").addEventListener("change", function (event) {
    if (event.matches) closeNavigation();
  });
}());
