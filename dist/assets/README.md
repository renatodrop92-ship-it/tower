# Lula vs. Bolsonaro — arte cartoon

- Imagem: `backgrounds/lula-bolsonaro-cartoon-v1.png`
- Animação interativa: `/live`; o endereço `animations/lula-bolsonaro-cartoon-v1.html` também redireciona para ela.

Esta arte já é o tema padrão da LIVE e da prévia do painel. Em **Aparência**, mantenha fundo **Normal**. Imagem de fundo vazia usa a arte padrão; se quiser indicar o arquivo explicitamente, use:

`/assets/backgrounds/lula-bolsonaro-cartoon-v1.png`

O PNG é uma imagem estática. As animações são implementadas em React/CSS e acionadas por eventos do servidor: presente, combo, ataque, escudo, multiplicador, meta de likes e vitória.

A pontuação nunca é produzida pela animação. O simulador e o TikTok alimentam o mesmo motor. Ao recarregar, a tela recupera torres e efeitos ativos, sem repetir notificações antigas de presentes. Pausar descarta animações pendentes; nova rodada limpa os efeitos visuais anteriores.

Os dois endereços antigos da prévia redirecionam para `/live`. O ciclo automático original foi arquivado em `design/archive/cartoon-demo-v1.html`, fora da pasta pública. A imagem original gerada e o prompt estão preservados.
