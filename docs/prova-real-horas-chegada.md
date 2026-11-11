# Prova Real: horas, chegada e direitos

Pedido do Fabio em11/11/2026: sempre colocar na Prova Real da Hellen as horas de cada motoboy e o horario de chegada para conferir garantido e rango.

Cada comanda mostra dados do proprio lacre: tempo entre chegada e ultima entrega, horarios com segundos, horas da escala, garantido vigente e piso calculado, valor/hora, quantidade de refeicoes de direito, cobranca de lanche e entrada/chegada por turno. Tempo bruto pode incluir pausas; nao e ponto trabalhista nem altera o calculo.

O payload jornadas_lacradas usa o mesmo lacre_id e a mesma identidade canonica que formam a comparacao financeira. Lojas diferentes permanecem separadas. Turnos sao lidos dos insumos guardados no mesmo lacre, sem recalcular o passado com a regra atual. Ausencias aparecem como nao informado; nunca assumir zero horas ou direito perdido.

Confirmacao do Fabio neste chat: a planilha estava errada ao completar ate R$120 os turnos de4h. O garantido aplicavel era4h xR$20=R$80; o maior entre taxas e piso permanece valendo. Esta mudanca so exibe o que foi lacrado e nao reescreve nenhuma planilha ou pagamento.

Verificacoes: JS passou em node --check; renderizador exercitado nas nove comandas do dia10/11; casos adicionais para virada da meia-noite, hora decimal7,53 =>7h32, dado ausente e escape de HTML. O piso de4h permanece exibido como R$80. Valores e autorizacao da RPC preservados.

Estado: RPC aditiva aplicada e retrocompativel; publicacao do HTML aguarda autorizacao explicita apos bloqueio da aprovacao automatica. Nao afirmar que a tela em producao ja mudou.
