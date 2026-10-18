import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

directory = Path(__file__).resolve().parent
root = directory.parents[2]
count = int(sys.argv[1])
if count not in (8, 64):
    raise ValueError('Only 8 and 64 clients are allowed')
output = directory / f'preview-{count}.json'
if output.exists():
    raise RuntimeError('Refusing to overwrite prior evidence')

def utc():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')

def sha(path):
    return hashlib.sha256((root / path).read_bytes()).hexdigest()

commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
start = utc()
began = time.monotonic()
process = subprocess.Popen(
    ['pnpm', 'exec', 'tsx', str(directory / 'preview-once.ts'), str(count)],
    cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
)
samples = []
while True:
    samples.append({'utc': utc(), 'load_1_5_15': os.getloadavg()})
    try:
        stdout, stderr = process.communicate(timeout=5)
        break
    except subprocess.TimeoutExpired:
        if time.monotonic() - began > 130:
            process.kill()
            stdout, stderr = process.communicate()
            stderr += '\nOuter timeout after 130 seconds'
            break
try:
    result = json.loads(stdout)
except json.JSONDecodeError:
    result = None
record = {
    'commit': commit,
    'clients': count,
    'startUtc': start,
    'endUtc': utc(),
    'outerSeconds': round(time.monotonic() - began, 3),
    'returncode': process.returncode,
    'sourceSha256': {path: sha(path) for path in [
        'docs/benchmarks/2026-10-18-capacity-preview/preview-once.ts',
        'tests/room-input-client.ts', 'worker/index.ts', 'worker/protocol.ts',
        'shared/game.ts', 'wrangler.jsonc',
    ]},
    'hostLoadSamples': samples,
    'result': result,
    'stdout': stdout,
    'stderr': stderr,
}
output.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: v for k, v in record.items() if k not in ('hostLoadSamples', 'stdout')}, indent=2))
sys.exit(process.returncode if process.returncode else (0 if result else 1))
