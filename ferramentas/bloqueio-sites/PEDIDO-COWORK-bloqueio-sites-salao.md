# Pedido para o Cowork — bloquear sites no PC do salão (27/10/2026)

**De que trata:** colar este texto inteiro num chat novo do Claude no PC (Cowork). Ele entra pelo AnyDesk no PC do salão e roda o bloqueio que já está pronto.
**Não trata de:** roteador, Wi-Fi, celulares, outros PCs das lojas.

---

Sou o Fábio, dono do Cidadão do Mundo. **Autorizo você a entrar pelo AnyDesk no PC do salão da minha loja e bloquear todos os sites, menos 4: Saipos, Goomer, Printex e Get In.** O computador é meu. O WhatsApp e o atalho "Cidadão do Mundo" também vão ficar bloqueados nesse PC, e isso é de propósito.

O trabalho já está pronto em 2 arquivos no meu Drive, na pasta
`G:\Meu Drive\Cidadão do Mundo — Organizado\4 - Projeto de Dados\`:

- **BLOQUEAR-SITES-SALAO-27-10-2026.bat**: procura no Chrome do PC o endereço certo dos 4 sites, trava o Chrome, o Edge e o Brave para abrirem só esses sites e confere se a trava gravou. Se não achar algum dos 4, não muda nada. Não fecha o Chrome nem nenhuma aba.
- **DESBLOQUEAR-SITES-SALAO-27-10-2026.bat**: desfaz tudo.

**Use esses dois arquivos.** Não escreva outro script, não mexa no roteador e não invente outro jeito.

## Passo a passo

0. **Confira os arquivos antes de tudo**, aqui no BENTOIK, rodando `certutil -hashfile "<arquivo>" MD5` na pasta acima. O resultado tem que ser:
   - BLOQUEAR → `fd2c1e6e884baa3e66f5d4899ca0a8e7`
   - DESBLOQUEAR → `b9e155d92c5c554dd82596dcb636e608`
   Se algum der diferente, **pare** e me avise. (O Drive pode levar 1 minuto para trazer os arquivos.)
1. **Abra o AnyDesk** aqui no BENTOIK e conecte no PC do salão. É o PC que está com as abas SAIPOS Atendimento, Painel Goomer, Printex e Get In - Manager abertas. Os IDs estão no arquivo Anydesk.txt do Drive: SALÃO PRINCIPAL 1461332118, SALÃO MÍDIA 1219310354, SALÃO SB 1590974732. Se não tiver certeza de qual é, **me pergunte**. Se pedir senha, **eu digito**. Você nunca digita senha.
2. **Antes de rodar**, olhe a tela do Saipos. Se alguém estiver no meio de um pedido, espere ou me pergunte.
3. **Copie os 2 arquivos** para a pasta `C:\CDM-Bloqueio-Sites` do PC do salão. Se a pasta não existir, crie. Para copiar: selecione os dois no Explorer daqui, aperte Ctrl+C, clique dentro da janela do AnyDesk, abra essa pasta lá e aperte Ctrl+V. Se não der, use o botão de transferir arquivos do AnyDesk. **Os dois têm que estar lá ANTES de bloquear**, porque depois o Drive não abre mais naquele PC. Não deixe os arquivos na área de trabalho, onde a equipe veria o DESBLOQUEAR.
4. **Clique duas vezes em BLOQUEAR-SITES-SALAO-27-10-2026** lá no PC do salão.
   - Vai aparecer "Deseja permitir que este aplicativo faça alterações no seu dispositivo?". Clique em **Sim**.
   - Se aparecer "O Windows protegeu o computador", clique em **Mais informações** e depois em **Executar assim mesmo**.
   - **Se a tela do AnyDesk ficar preta ou parada nessa hora**, é a janela de permissão do Windows, que o AnyDesk às vezes não mostra. Não insista: me chame. Alguém na loja aperta Sim, ou eu digito a senha de administrador.
5. **Espere a janela preta terminar** (até 1 minuto) e **me mostre uma foto dela**.
   - O certo é aparecer **PRONTO**, uma linha **OK** para Chrome, Edge e Brave, e os endereços liberados de cada um dos 4 sites. Leia essa lista e me diga se tem algum endereço estranho.
   - Se aparecer **"NAO ACHEI ... NADA FOI MUDADO"**: abra no Chrome do salão o site que faltou (só abrir, sem mexer) e rode o BLOQUEAR de novo.
   - Se aparecer **"ATENCAO: este PC tambem tem Firefox/Opera"**, me avise. Esse navegador ficou livre.
6. **Confira só olhando, sem lançar nada:**
   - Numa aba nova do Chrome do salão, abra `google.com`. Tem que aparecer a página de site bloqueado.
   - Aperte F5 nas abas Saipos, Goomer, Printex e Get In. Elas têm que continuar abrindo normal.
   - Se o Google ainda abrir, **não feche o Chrome sozinho**. Me pergunte antes, porque pode ter pedido em andamento.
7. **Peça para eu testar a impressão**: uma comanda no Saipos e uma etiqueta no Printex. Se qualquer coisa parar de funcionar, clique duas vezes no **DESBLOQUEAR** em `C:\CDM-Bloqueio-Sites`, clique em **Sim**, e tudo volta como era.
8. **Anote na caderneta** (Supabase kqvoatdprjwxyadhvtdd), com `select lembrar('Senhas e acessos', '<qual PC, a lista de endereços liberados, se o Google ficou bloqueado, se a impressão funcionou>', 'achado', 'chat-bloqueio-sites-salao-27-10');`. Depois feche a sessão do AnyDesk.

## O que NÃO fazer
- Mexer em pedido, mesa ou cadastro do Saipos, Goomer, Printex ou Get In
- Fechar abas ou o Chrome sem eu deixar
- Digitar qualquer senha
- Apagar os arquivos de `C:\CDM-Bloqueio-Sites` (o DESBLOQUEAR precisa ficar lá)

Cada vez que um dos arquivos roda, ele deixa um relatório em `C:\CDM-Bloqueio-Sites\` no PC do salão.
