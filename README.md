# Vox Voice

Aplicativo de comunidades, mensagens e chamadas de voz, com interface web e backend Cloudflare Workers.

## Usar no GitHub Codespaces

1. Envie este projeto para um repositório do GitHub, incluindo `.devcontainer`, `public`, `src`, os arquivos de configuração do Wrangler e os arquivos `package.json` e `package-lock.json`.
2. No repositório, abra **Code → Codespaces → Create codespace on main** (ou selecione a branch que contém o projeto).
3. Aguarde a instalação automática das dependências.
4. Para voz, copie `.dev.vars.example` para `.dev.vars` e preencha `METERED_TURN_API_KEY` com a chave do projeto `vixvoice.metered.live`. Não envie essa chave ao GitHub. Reinicie o servidor após alterar o arquivo.
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

## Executar localmente

Com Node.js 22 instalado:

```sh
npm ci
npm run dev
```

Abra `http://localhost:8787`. Configure `.dev.vars` como descrito acima para voz.

Documentação: [portas do Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace) e [desenvolvimento local do Workers](https://developers.cloudflare.com/workers/local-development/).
