# Vox Voice

Aplicativo de comunidades, mensagens e chamadas de voz, com interface web e backend Cloudflare Workers.

## Usar no GitHub Codespaces

1. Envie este projeto para um repositório do GitHub, incluindo `.devcontainer`, `public`, `src`, os arquivos de configuração do Wrangler e os arquivos `package.json` e `package-lock.json`.
2. No repositório, abra **Code → Codespaces → Create codespace on main** (ou selecione a branch que contém o projeto).
3. Aguarde a instalação automática das dependências.
4. Para voz, copie `.dev.vars.example` para `.dev.vars` e preencha `METERED_TURN_USERNAME` e `METERED_TURN_PASSWORD` usando uma credencial ativa do projeto `vixvoice.metered.live`. A API Key pode ser usada como alternativa. Não envie essas credenciais ao GitHub. Reinicie o servidor após alterar o arquivo.
5. No terminal, execute `npm run dev`.
6. Na aba **Ports**, abra a porta **8787** no navegador pelo endereço HTTPS fornecido pelo Codespaces. Autorize o microfone quando solicitado.

A porta começa privada. Para testar com outras pessoas, altere **Port Visibility → Public**, se a política da conta permitir, e compartilhe o endereço HTTPS. Essa alteração disponibiliza a aplicação na internet.

O Codespaces executa o backend local do Wrangler, com contas e mensagens próprias. Crie uma conta de teste: os dados da aplicação publicada na Cloudflare não são copiados. O estado local fica em `.wrangler/state`, persiste entre reinicializações normais e é perdido se o codespace for excluído.

O comando `npm start` executa um servidor antigo de sinalização e não oferece as APIs de contas e comunidades da interface atual. Use `npm run dev` para o aplicativo completo. O Electron é o cliente desktop e não precisa ser iniciado no Codespaces.

O ambiente pode ser suspenso por inatividade e está sujeito à franquia e cobrança do GitHub. Para disponibilidade contínua, mantenha uma hospedagem de produção. As chamadas dependem também do microfone, da rede dos participantes e da configuração TURN.

## Transmissões por participante

Entre no canal de voz e clique em compartilhar tela. As telas disponíveis aparecem abaixo dos participantes, com o nome de quem transmite e um botão **Assistir**. Você escolhe qual tela abrir, pode trocar de participante, fechar ou ampliar a imagem. A voz continua tocando separadamente. Antes de compartilhar, escolha 480p, 720p ou 1080p e se deseja incluir áudio. O som depende da fonte e do navegador: prefira compartilhar uma aba com a opção de áudio marcada. O vídeo tem controles de volume próprios e só reproduz a transmissão escolhida. A resolução é uma preferência e pode ser ajustada pelo navegador. Para mudar a qualidade, pare e inicie outra transmissão.

## Preservar os dados

`npm run dev` usa explicitamente `.wrangler/state`, o mesmo diretório padrão das versões anteriores. Contas, servidores, membros, canais e mensagens permanecem nesse diretório após parar e reiniciar o Vox. Não apague `.wrangler` e não altere os nomes dos bindings/classes ou a configuração usada pelo comando. O último servidor selecionado é lembrado separadamente por conta no navegador.

Para criar uma cópia, pare todas as instâncias do Wrangler (inclusive em portas alternativas) com **Ctrl+C** e execute:

```sh
npm run backup
npm run dev
```

O backup inclui os bancos de contas e sessões: guarde-o em local privado. A pasta `backups` fica fora do Git; baixe a cópia para seu computador. Excluir o codespace também exclui o banco e os backups que só estiverem nele. Nunca copie um banco enquanto o servidor estiver gravando nele.

Para restaurar, pare o Vox, renomeie `.wrangler/state` para guardar o estado atual e copie a pasta `state` do backup para `.wrangler/state`. Inicie novamente com `npm run dev`. Isso restaura todos os dados para o momento da cópia.

Na instância Oracle, `deploy/vix-voice-backup.timer` executa um backup consistente diariamente por volta de 04:30 no horário de Brasília. O serviço é pausado somente durante a compactação e sempre volta a iniciar, inclusive quando o backup falha. Os sete arquivos mais recentes ficam em `/var/backups/vix-voice`, acompanhados por manifesto e checksum SHA-256. Consulte o próximo horário com `systemctl list-timers vix-voice-backup.timer` e os resultados com `journalctl -u vix-voice-backup.service`.

O monitor `deploy/vix-voice-health.timer` consulta o Worker e o banco de contas a cada minuto. Se a aplicação permanecer ativa, mas deixar de responder, o monitor reinicia o serviço e aguarda a recuperação. A verificação é ignorada durante o backup para não interromper a cópia consistente. Consulte o histórico com `journalctl -u vix-voice-health.service`.

O Worker local inicia com `--no-bundle` porque o código já está pronto para execução. Isso remove do processo permanente a etapa de empacotamento do esbuild e evita que uma falha desse processo derrube o serviço.

A sinalização das chamadas usa espera longa: cada participante mantém no máximo uma consulta pendente e recebe os eventos assim que eles chegam. Isso reduz significativamente a quantidade de requisições durante uma chamada sem adicionar atraso perceptível à negociação WebRTC.

Para restaurar na Oracle, primeiro copie o arquivo desejado para outro local. Pare `vix-voice`, renomeie o estado atual, extraia o arquivo na raiz `/home/ubuntu/vix-voice`, ajuste a propriedade de `.wrangler` para `ubuntu:ubuntu` e inicie o serviço. Mantenha também uma cópia fora da VM: os backups locais protegem contra erro e corrupção, mas não contra a perda do disco da instância.

## Gerenciar servidores

Clique na seta ao lado do nome do servidor para abrir as configurações. Donos e administradores podem editar o nome e o ícone, criar, renomear e excluir canais de voz. Somente o dono pode promover ou rebaixar administradores. Donos e administradores podem remover membros comuns; administradores não podem remover outros administradores, e o dono não pode ser removido. O servidor sempre mantém pelo menos um canal de voz.

Cada canal de voz é uma sala isolada: participantes, áudio, câmera e transmissão de tela só são enviados para pessoas que estiverem no mesmo canal.

## Executar localmente

Com Node.js 22 instalado:

```sh
npm ci
npm run dev
```

Abra `http://localhost:8787`. Configure `.dev.vars` como descrito acima para voz.

Documentação: [portas do Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace) e [desenvolvimento local do Workers](https://developers.cloudflare.com/workers/local-development/).
