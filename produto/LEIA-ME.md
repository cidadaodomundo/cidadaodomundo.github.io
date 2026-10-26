# Portal de Gestão — cópia-produto (protótipo)

Portal de gestão para restaurantes com delivery e salão: pedidos ao vivo, tempo de entrega,
cancelamentos, avaliações, ponto e RH, pagamento de motoboys, cozinha, estoque, contas e
painel do dono — tudo numa tela só, com um menu diferente para cada pessoa.

Esta pasta é um **protótipo vendável**: funciona sozinha, com um restaurante de exemplo
(**Burger Modelo**, lojas Centro, Norte e Sul) e **dados inventados na hora**, dentro do
navegador. Ela **não conversa com banco de dados nenhum** e **não tem nenhum dado real**:
nenhum nome, telefone, documento, endereço, mensagem ou número de conta de restaurante algum.

---

## 1. Ver funcionando

Precisa de um servidor de arquivos simples (o navegador não deixa abrir direto do disco).
Na pasta `produto/`:

```
python3 -m http.server 8080        # ou: npx serve .
```

Abra `http://localhost:8080/` e escolha como entrar:

| Botão | Usuário | O que vê |
|---|---|---|
| 👑 Dono | `dono` | tudo, inclusive valores em R$ |
| 🧑‍🍳 Gerente | `gerente` | delivery e gestão, sem dinheiro |
| 🗂 Escritório | `escritorio` | RH, folha, contas e pagamentos |
| 🛵 Delivery | `delivery` | só as telas do delivery |

A senha de todos é `demo`. Qualquer tela também abre direto (ex.: `/fila/`), já como Dono.

Também funciona hospedado em qualquer lugar de arquivos estáticos (GitHub Pages, Netlify,
uma subpasta de outro site): **todos os caminhos são relativos**.

---

## 2. Trocar a marca — um arquivo só

Tudo o que muda de um cliente para outro está em **`config.js`**:

```js
produto: 'Portal de Gestão',
marca:   'Burger Modelo',
logo:    'assets/logo.svg',
cores:   { brand: '#E0A81C', brandInk: '#111110' },
lojas:   [ {id:'centro', nome:'Centro', curto:'CEN'}, ... ],
modo:    'demo',            // 'demo' ou 'supabase'
supabaseUrl: '', supabaseChave: ''
```

As telas montam os seletores de loja a partir de `lojas`, então o cliente pode ter 1, 3 ou 8 lojas.

---

## 3. Como a demonstração funciona

```
tela (HTML)  ──fetch──▶  config.js decide o endereço
                          │
             modo 'demo'  ▼                       modo 'supabase'
     assets/demo/backend.js (intercepta)          Supabase do cliente
             │                                     (/rest/v1/rpc/<porta>)
             ├─ assets/demo/mundo.js   restaurante fictício (pessoas, motoboys, cardápio,
             │                         pedidos do dia, ponto) — sempre igual para o mesmo dia
             ├─ assets/demo/comum.js   login, menu por papel, anotações
             └─ assets/demo/telas/*.js uma "porta de mentira" por tela, no mesmo formato
                                       que o banco de verdade devolveria
```

* Cada tela chama o banco exatamente como faria em produção (`POST /rest/v1/rpc/<porta>` ou
  `GET /rest/v1/<tabela>?select=...`). Em modo demo, `backend.js` responde no lugar do banco.
* **Trava de segurança:** em modo demo, qualquer pedido para a internet que não seja fonte do
  Google, biblioteca pública (cdnjs/jsdelivr/unpkg) ou mapa (OpenStreetMap) é **bloqueado** e
  anotado em `DEMO.bloqueados`. A demonstração não consegue falar com servidor nenhum.
* Os pedidos são "sorteados" de forma repetível: o mesmo dia e a mesma loja geram sempre os
  mesmos pedidos, e todas as telas leem a mesma fonte — os números batem entre si.
* O que a pessoa grava na demonstração (anotações, marcações) fica só no navegador dela.

---

## 4. Ligar no banco de verdade

1. Crie um projeto Supabase para o cliente.
2. Implemente as **portas** (funções SQL) que cada tela usa — a lista completa, tela por tela,
   com os parâmetros e o formato da resposta, está em **`CONTRATO-DE-DADOS.md`**. O formato de
   cada resposta também pode ser lido no arquivo `assets/demo/telas/<tela>.js` correspondente:
   ele é o "molde" do que o banco precisa devolver.
3. Em `config.js`: `modo: 'supabase'`, `supabaseUrl` e `supabaseChave` (a chave **publishable**,
   que é pública por natureza).
4. Pronto: as mesmas telas passam a ler o banco. Os arquivos de `assets/demo/` deixam de ser
   carregados.

### Regras de segurança que o portal original aprendeu na prática

* **A chave publishable é pública.** Proteção de verdade é no banco: dado de pessoa nunca sai
  por tabela aberta; sai por **função `SECURITY DEFINER` que valida o token** da sessão
  (`p_token`) e o módulo da pessoa.
* Função nova no Postgres nasce executável por `PUBLIC`: sempre `revoke execute ... from public`
  e só então `grant ... to anon`.
* **Valor em R$ só para o dono**: a porta nem coloca a chave do dinheiro no JSON quando a pessoa
  não é admin; a tela mostra `—`.
* O papel `anon` tem tempo-limite curto (no original, 3 s). Porta pesada: `alter function ...
  set statement_timeout` ou guardar o resultado pronto numa tabela de cache.
* O menu (`portal_eu`) é só visão; a trava real é a porta checar o módulo de quem pede.
* Login: `portal_login(p_usuario, p_senha)` devolve `{token, nome, admin, modulos[]}`;
  `portal_eu(p_token, p_tela)` revalida a sessão a cada tela.

---

## 5. Juntar com outro portal

Três caminhos, do mais simples ao mais completo:

1. **Lado a lado:** copie a pasta `produto/` para dentro do outro site (ex.: `/operacao/`).
   Como os caminhos são relativos, funciona em qualquer subpasta.
2. **Mesmo menu:** acrescente as telas do outro portal à lista `MODULOS` de
   `assets/demo/comum.js` (em demonstração) ou à tabela `portal_modulo` (em produção). O hub
   abre qualquer endereço numa moldura.
3. **Mesmo banco:** aponte `config.js` para o Supabase do outro portal e implemente lá as portas
   do `CONTRATO-DE-DADOS.md`, reaproveitando as tabelas que o outro portal já tem.

---

## 6. O que ficou de fora desta cópia (de propósito)

* **Tudo de aplicativo de mensagens** — telas de leitura de grupos e conversas, ligação de números, respostas sugeridas,
  botões de mandar mensagem, e qualquer texto vindo de conversa.
* **Telas pessoais ou internas do restaurante de origem** — agenda pessoal do dono, roteiro de
  obra do sistema, mapa interno dos robôs, telas feitas para uma pessoa específica, telas de uma
  loja específica, negócio paralelo de distribuição, reunião semanal, central de SAC por
  mensagem, páginas legais (privacidade/termos) do restaurante de origem.
* **Qualquer dado real** — nomes, apelidos, telefones, documentos, endereços, coordenadas,
  contas, chaves, IDs de lojas e de aplicativos, cardápio próprio, comentários de histórico.

---

## 7. Testar

```
node _ferramentas/testar-tela.cjs fila/ --shot fila.png
node _ferramentas/testar-tela.cjs rh/ --papel gerente --largura 390
```

Abre a tela num Chromium de verdade (Playwright) e mostra erros de JavaScript, portas sem dados
na demonstração, arquivos faltando e qualquer tentativa de acessar a internet. Sai com código 1
se algo estiver errado.

---

## 8. Telas

Veja a lista completa, com o que cada uma faz e as portas que usa, em `CONTRATO-DE-DADOS.md`.

---

**Propriedade e licença:** definir em contrato antes de distribuir ou vender.
