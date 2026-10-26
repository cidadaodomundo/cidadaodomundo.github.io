/* =====================================================================
   CONFIGURACAO DO PORTAL — o unico arquivo que muda de um cliente para outro.

   Para entregar o portal para um restaurante novo:
     1. troque o nome, o logo, as cores e as lojas abaixo;
     2. deixe modo:'demo' para mostrar com dados de exemplo, OU
        troque para modo:'supabase' e preencha supabaseUrl e supabaseChave
        com o banco do cliente (veja LEIA-ME.md, parte "Ligar no banco de verdade").

   Em modo 'demo' o portal NAO acessa a internet para buscar dados:
   tudo o que aparece na tela e inventado na hora, dentro do navegador.
   ===================================================================== */
window.PORTAL_CFG = {
  produto: 'Portal de Gestão',
  marca: 'Burger Modelo',
  slogan: 'Hamburgueria artesanal',
  logo: 'assets/logo.svg',              /* caminho a partir da pasta do portal, ou endereco https:// */
  cores: { brand: '#E0A81C', brandInk: '#111110' },
  lojas: [
    { id: 'centro', nome: 'Centro', curto: 'CEN' },
    { id: 'norte',  nome: 'Norte',  curto: 'NOR' },
    { id: 'sul',    nome: 'Sul',    curto: 'SUL' }
  ],
  contatoSenha: 'o administrador do portal',   /* "Esqueceu a senha? Fale com ..." */

  modo: 'demo',                         /* 'demo' ou 'supabase' */
  supabaseUrl: '',                      /* ex.: https://abcdefgh.supabase.co */
  supabaseChave: ''                     /* chave publishable (publica) do projeto */
};

/* ---------------------------------------------------------------------
   Daqui para baixo nao precisa mexer.
   Calcula os enderecos usados por todas as telas e, em modo demo,
   carrega o "banco de mentira" (assets/demo/) antes de qualquer tela.
   Cada tela inclui este arquivo assim:
     <script src="../config.js" data-demo="telas/nome-da-tela.js"></script>
   --------------------------------------------------------------------- */
(function () {
  'use strict';
  var C = window.PORTAL_CFG;
  var eu = document.currentScript;
  var src = (eu && eu.src) || location.href;
  C.raiz = src.replace(/[?#].*$/, '').replace(/config\.js$/, '');
  C.url = function (p) { return C.raiz + String(p || '').replace(/^\/+/, ''); };
  C.logoUrl = /^(https?:)?\/\//.test(C.logo) ? C.logo : C.url(C.logo);

  var demo = C.modo !== 'supabase' || !C.supabaseUrl;
  C.demo = demo;
  var base = demo ? 'https://demo.invalid' : String(C.supabaseUrl).replace(/\/+$/, '');
  C.rest = base + '/rest/v1/';
  C.funcoes = base + '/functions/v1/';
  C.chave = demo ? 'demo' : C.supabaseChave;

  try {
    var r = document.documentElement.style;
    r.setProperty('--brand', C.cores.brand);
    r.setProperty('--brand-ink', C.cores.brandInk);
  } catch (e) {}

  if (!demo) return;
  var extras = String((eu && eu.getAttribute('data-demo')) || '').split(/\s+/).filter(Boolean);
  var lista = ['assets/demo/backend.js', 'assets/demo/mundo.js', 'assets/demo/comum.js']
    .concat(extras.map(function (f) { return 'assets/demo/' + f; }));
  for (var i = 0; i < lista.length; i++) {
    document.write('<script src="' + C.url(lista[i]) + '"><\/script>');
  }
})();
