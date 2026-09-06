const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');

async function main() {
  const root = path.resolve(__dirname, '..');
  const state = path.join(root, '.wrangler', 'state');
  await fs.access(state);
  // Keep the port reserved while copying, so the normal dev command cannot start.
  const guard = net.createServer();
  await new Promise((resolve, reject) => {
    guard.once('error', reject);
    guard.listen(8787, '0.0.0.0', resolve);
  });
  const destination = path.join(root, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  try {
    await fs.mkdir(destination, { recursive: true });
    await fs.cp(state, path.join(destination, 'state'), { recursive: true });
    await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), source: '.wrangler/state' }, null, 2));
    console.log(`Backup concluído: ${destination}\nBaixe essa pasta para manter uma cópia fora do Codespaces.`);
  } finally { guard.close(); }
}
main().catch(error => {
  console.error(error.code === 'EADDRINUSE' ? 'Pare o Vox com Ctrl+C antes do backup. Encerre também qualquer Wrangler iniciado em outra porta.' : error.message);
  process.exitCode = 1;
});
