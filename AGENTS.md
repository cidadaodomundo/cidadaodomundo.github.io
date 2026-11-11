# Regras permanentes do portal Cidadão do Mundo

## Chegada do dia e Prova Real da Hellen

Pedido expresso do Fábio em 11/11/2026. Este contrato só pode ser reduzido ou alterado mediante nova instrução explícita do Fábio.

- Manter SEMPRE visíveis, por motoboy e por turno: entrada combinada, chegada observada, saída registrada, tempo registrado, direito ao garantido e direito à refeição. Não esconder esses campos em detalhes, abas secundárias ou responsividade móvel.
- Garantido e refeição são campos separados, com estado e motivo. Fonte ausente, conflito ou falta de escala deve aparecer como pendência; nunca assumir perda de direito nem inventar chegada/saída.
- Último sinal do aplicativo, última entrega, fim previsto da escala e saída real são informações diferentes. Só chamar de saída registrada quando houver batida correspondente. Intervalo bruto pode incluir pausas e não deve ser chamado de horas líquidas trabalhadas.
- Fontes de chegada (leitor de segundos, API de reserva, balcão), diferença e média ficam na ficha, conforme a regra vigente. Registros e lacres originais devem ser preservados.
- Hellen deve ter atalho no grupo Hellen e acesso de consulta à Chegada com entrada/chegada/saída/garantido/refeição. O módulo hellen_chegada concede consulta detalhada; não torna Hellen administradora e não concede os poderes de alterar direitos reservados ao dono.
- A Prova Real deve usar os horários, horas e direitos guardados no mesmo lacre que explica o valor financeiro; consultas atuais ficam identificadas separadamente.
- Regra confirmada pelo Fábio neste chat: 4h × R$20 = R$80 de piso. Paga-se o maior entre piso aplicável e taxas. A planilha que completou dois turnos de4h até R$120 estava errada. Não mudar o piso para forçar coincidência com essa planilha.
- Ao editar chegada/index.html, hellen/index.html ou a resposta de chegada_conferir, executar node tests/chegada-contrato.cjs e conferir a permissão somente de consulta. Não remover este teste para contornar uma falha.

## Lista de motoboys — ajuste expresso do Fábio em 11/11/2026

- Título: Motoboys rodando no dia. Uma lista por loja, sem seção separada de fora da escala; essa indicação fica abaixo do nome.
- Garantido e refeição separados: Sim verde e Não vermelho. Direito mantido sem prova continua verde com motivo de conferência; ausência de decisão não vira vermelho.
- Manter entrada combinada, chegada, saída e tempo registrado visíveis. Explicações, fontes, comparação, observação e ações ficam na ficha.
- A tela atualiza de 10 em 10 segundos enquanto visível, sem sobrepor requisições, e retoma a leitura ao voltar à aba. Isso não altera a frequência dos coletores.
- Mostrar a chegada com segundos informada pela fila do Track quando disponível. Distinguir esse evento do horário de leitura e de chegada física.
- Incluir escalas jaison* e colado/whatsapp desde 11/11/2026, sem duplicar o mesmo turno. Não reescrever históricos ou lacres anteriores.
