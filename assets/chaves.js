/* Interruptores do portal (04/10/2026).
   CDM_FOODY: o Foody foi aposentado em 15/09/2026 (a Agua Verde passou para o TrackEat).
   false = as telas escondem o que so o Foody mostrava (dado parado desde setembro).
   PARA RELIGAR O FOODY: trocar false por true na linha abaixo e publicar so este arquivo.
   Vale em ate 10 minutos, sem mexer em tela nenhuma.
   Se este arquivo nao carregar, as telas mostram tudo como antes (o Foody aparece). */
window.CDM_FOODY = false;
(function () {
  if (window.CDM_FOODY !== false) return;
  try {
    var s = document.createElement('style');
    s.textContent = '.so-foody{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();
