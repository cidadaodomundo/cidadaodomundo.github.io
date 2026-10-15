# App de pedido na mesa do Cidadão do Mundo — plano (15/10/2026)

Pedido do Fábio, 15/10: um app igual ao Goomer, com a cara do Cidadão. O cliente pede da mesa no tablet, paga com Pix num QR Code, e **só depois de pago o pedido sai na impressora**. Dá para escolher se o pedido é **por mesa ou por cartão**.

Protótipo para clicar: https://claude.ai/artifact/YPAJV5Fam1d7NTKA2rZZsm

> **Atualizado 15/10, decisões do Fábio:** "os tablets são nossos" e "vamos deixar sem o Pix por enquanto". Agora o pedido do tablet vai **direto para a cozinha** e o cliente **paga no fim, no caixa**, como hoje. O Pix continua pronto no desenho, desligado (o gerente liga quando quiser). O que trava o próximo passo agora é **só o Saipos**.

---

## 1. O que o Goomer faz hoje (engenharia reversa)

| O que | Como o Goomer faz | No app do Cidadão |
|---|---|---|
| Cardápio no tablet | Categorias, foto, preço, adicionais ("Deseja turbinar o seu prato? 1 a 3") | Igual, com a fonte e as cores da casa |
| Modo de pedir | Dois modos: **Mesa** (pedido vai pelo número da mesa) e **Comanda/Ficha** (cada um no seu cartão) | Três: **Mesa**, **Cartão** ou **o cliente escolhe** na hora |
| Pagamento | Pede primeiro, paga no fim, no caixa | **Por enquanto, igual:** paga no fim, no caixa. Pix antes da cozinha fica desligado |
| Chegar na cozinha | Integração com o Saipos (pedida ao suporte do Saipos) e o Saipos imprime | Mesmo caminho: mandar o pedido do tablet para o Saipos (ver item 3) |
| Gerente | Painel do Goomer, botão "Publicar alterações" | Ajuste escondido no tablet (modo, mesa, Pix liga/desliga) |
| Conta | Gestor de mesas, conta no fim | Botão **Minha conta** no tablet: soma o que a mesa ou o cartão já pediu |

Fontes: central de ajuda do Goomer ("Modo de Operação") e páginas do Saipos sobre a integração com o Goomer. O que já se sabia no caderno: Goomer na Água Verde (loja 269560) e no São Braz (270370), mesmo login; o adicional do tablet já saiu errado na comanda do São Braz (07/09).

## 2. Como o pedido anda no app novo

**Hoje (Pix desligado):** cliente monta o pedido, toca em **Enviar para a cozinha**, escolhe mesa ou cartão, e o pedido vai para o Saipos, que imprime. Paga no fim, no caixa.

**Quando o Pix for ligado:**

1. Cliente monta o pedido no tablet.
2. Toca em **Pagar com Pix**. Se a loja estiver no modo cartão, digita o número do cartão.
3. O sistema pede ao banco um **Pix com valor fixo** e mostra o QR. Prazo para pagar: 10 minutos (o gerente muda).
4. O banco avisa o sistema que o Pix caiu. O sistema confere se o **valor pago é igual ao do pedido**.
5. Só então o pedido vai para o Saipos, que imprime na cozinha e no bar como já faz hoje.
6. Se o prazo acabar, o pedido é cancelado e **nada imprime**.

## 3. As peças e o que falta para cada uma

| Peça | O que é | Situação |
|---|---|---|
| Tela do tablet | Página web aberta em tela cheia no tablet | Protótipo pronto. Falta ligar no cardápio de verdade e nas fotos |
| Cardápio | Vem do Saipos (já lemos no banco) | ⚠️ Última leitura do salão no banco: **17/09/2026**. Precisa voltar a ler |
| Pix | Um banco ou intermediário que gere Pix com valor e **avise quando cair** | **Adiado** pelo Fábio em 15/10 |
| Impressora | O pedido entra no Saipos e o Saipos imprime | **Falta pedir ao Saipos** acesso à API de pedidos. O Saipos diz ter "API aberta", mas a documentação não é pública |
| Banco de dados | Supabase, que já usamos | Pronto para receber as tabelas de pedido |

**Plano B para a impressora:** imprimir direto numa impressora da loja, sem passar pelo Saipos. É mais rápido de fazer, mas o pedido **não entra no caixa, no estoque nem na nota fiscal do Saipos**. Só serve como emergência.

## 4. O que só o Fábio decide

1. ~~Qual banco recebe o Pix~~ — **adiado** (15/10).
2. **Pedir ao suporte do Saipos** a integração de pedidos (a mesma que o Goomer usa) para o app próprio. **É o que trava agora.**
3. ~~Os tablets são da casa?~~ — **sim, são nossos** (15/10).
4. **Modo de cada loja:** mesa, cartão ou o cliente escolhe.
5. (Só quando o Pix for ligado) **Item que acaba depois de pago:** devolve o Pix na hora (o banco permite) ou troca por outro?

## 5. Cuidados que já estão no desenho

- Cliente aparece só pelo número da mesa ou do cartão.
- Botão **Minha conta**: o cliente vê o que já pediu antes de ir ao caixa.

Quando o Pix for ligado:

- Pix com **valor fixo e código único por pedido**. O app do banco não deixa o cliente mudar o valor, e mesmo assim o sistema confere.
- Pedido não pago **nunca imprime**. A tela da cozinha do protótipo mostra isso separado: pagos, esperando Pix e cancelados.
- Nota fiscal sai pelo Saipos, como hoje, porque o pedido entra nele.

## 6. Ordem de trabalho proposta

1. Fábio pede ao Saipos a integração de pedidos (item 4).
2. Ligar o pedido do tablet no Saipos, em teste, numa loja.
3. Tablet piloto numa mesa da Água Verde, ao lado do Goomer.
4. Se der certo, trocar loja por loja.
5. (Depois, se quiser) ligar o Pix antes da cozinha.
