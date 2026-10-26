/* Interruptores do portal.
   CDM_FOODY: liga/desliga o que vem do sistema de entregas antigo (Foody).
   false = as telas escondem o que so esse sistema mostrava. */
window.CDM_FOODY = false;
(function () {
  if (window.CDM_FOODY !== false) return;
  try {
    var s = document.createElement('style');
    s.textContent = '.so-foody{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();
