# Infraestrutura do Vix Voice

## Produção e homologação

- Produção: `vix-voice.service`, porta local 8787 e estado em `/opt/vix-voice/app/.wrangler/state`.
- Homologação: `vix-voice-staging.service`, porta local 8788 e estado em `/var/lib/vix-voice-staging/state`.
- A homologação nunca reutiliza contas, mensagens ou arquivos da produção.

Uma versão deve responder em `/api/auth/health` na homologação antes de ser instalada em produção.

## Backups

`vix-voice-backup.timer` cria diariamente um arquivo consistente e seu SHA-256. Rastros temporários de observabilidade são excluídos. `vix-voice-offsite.timer` envia a cópia validada para a VPS de contingência.

Para restaurar, use:

```bash
sudo vix-voice-restore /var/backups/vix-voice/vix-voice-DATA.tar.gz
```

O comando valida o checksum, troca o estado, inicia o serviço e consulta a saúde. Se a aplicação não responder, ele recoloca o estado anterior automaticamente.

## Métricas

`vix-voice-metrics.timer` registra uma amostra por minuto em `/var/log/vix-voice/metrics.jsonl`, com retenção de sete dias. Cada linha contém CPU, memória, disco, carga, status HTTP, latência e totais agregados de conexões e salas de voz.

## Próxima migração de dados

Durable Objects locais ainda guardam banco, avatares, capas e anexos. A próxima entrega de infraestrutura deve mover arquivos para armazenamento compatível com S3 e depois migrar o banco para PostgreSQL externo. Isso permitirá múltiplas instâncias de aplicação sem divergência de dados.
# Voz hospedada na VPS (SFU)

As salas de voz em grupo usam LiveKit em modo SFU. Cada participante publica um único fluxo para a VPS e recebe do servidor os fluxos autorizados da mesma sala. Não existe malha de áudio entre participantes.

- Sinalização TLS: `wss://app.vix-voice.com.br/rtc`, encaminhada pelo Caddy para `127.0.0.1:7880`.
- Mídia preferencial: UDP `50000:50100` diretamente entre o cliente e o SFU.
- Contingência: TCP `7881` e o Coturn próprio em `3478` para redes restritivas.
- Serviço: `vix-voice-livekit.service` com reinício automático.
- Credenciais: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` e `LIVEKIT_URL` nos arquivos `.dev.vars`, nunca nos ativos públicos.
- Salas: `server:<server-id>:voice:<channel-id>`, com token JWT de duas horas limitado à sala e ao usuário autenticado.

O arquivo `livekit.yaml.example` documenta as portas e limites. `install-livekit.sh` instala a versão fixada do servidor, preserva o proxy do site e reinicia os serviços depois de validar o Caddy.
