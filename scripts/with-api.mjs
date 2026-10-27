import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const python = process.env.PYTHON_BIN || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
const port = Number(process.env.PACZKOMETEO_API_PORT || 8787);
const api = spawn(python, ['api/inpost.py'], { stdio: 'inherit' });
let vite;
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM');
  vite?.kill('SIGTERM');
  process.exitCode = code;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop());
api.once('error', () => { console.error('Nie można uruchomić Pythona. Utwórz .venv i zainstaluj requirements.txt.'); stop(1); });
api.once('exit', code => { if (!stopping) stop(code || 1); });

let ready = false;
for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (response.ok) { ready = true; break; }
  } catch { /* Wait for the local reader to bind its port. */ }
  await new Promise(resolve => setTimeout(resolve, 100));
}
if (!ready) {
  console.error('Nie udało się uruchomić odczytu InPost. Zainstaluj: .venv/bin/pip install -r requirements.txt');
  stop(1);
} else if (!stopping) {
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], { stdio: 'inherit' });
  vite.once('error', () => stop(1));
  vite.once('exit', code => stop(code || 0));
}
