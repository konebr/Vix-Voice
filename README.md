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

## Executar localmente

Com Node.js 22 instalado:

```sh
npm ci
npm run dev
```

Abra `http://localhost:8787`. Configure `.dev.vars` como descrito acima para voz.

Documentação: [portas do Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace) e [desenvolvimento local do Workers](https://developers.cloudflare.com/workers/local-development/).
