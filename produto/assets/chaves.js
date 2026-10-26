/* Interruptores do portal.
   PDG_FOODY: liga/desliga o que vem do sistema de entregas antigo (Foody).
   false = as telas escondem o que so esse sistema mostrava. */
window.PDG_FOODY = false;
(function () {
  if (window.PDG_FOODY !== false) return;
  try {
    var s = document.createElement('style');
    s.textContent = '.so-foody{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();
