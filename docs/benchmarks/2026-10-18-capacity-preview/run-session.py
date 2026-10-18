import gzip
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
script = directory / f'session-{count}.ts'
label = sys.argv[2] if len(sys.argv) > 2 else ''
if label not in ('', 'after'):
    raise ValueError('Only the baseline and after runs are allowed')
output = directory / f'preview-session-{count}{"-" + label if label else ""}.json.gz'
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
    ['pnpm', 'exec', 'tsx', str(script),
     'https://codex-restore-room-capacity-bay-drive.swyxio.workers.dev'],
    cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
)
samples = []
while True:
    samples.append({'utc': utc(), 'load_1_5_15': os.getloadavg()})
    try:
        stdout, stderr = process.communicate(timeout=5)
        break
    except subprocess.TimeoutExpired:
        if time.monotonic() - began > 90:
            process.kill()
            stdout, stderr = process.communicate()
            stderr += '\nOuter timeout after 90 seconds'
            break
try:
    result = json.loads(stdout)
except json.JSONDecodeError:
    result = None
record = {
    'commit': commit, 'startUtc': start, 'endUtc': utc(),
    'outerSeconds': round(time.monotonic() - began, 3), 'returncode': process.returncode,
    'sourceSha256': {path: sha(path) for path in [
        f'docs/benchmarks/2026-10-18-capacity-preview/session-{count}.ts',
        'src/session.ts', 'src/motion-clock.ts', 'src/tick-prediction.ts',
        'worker/index.ts', 'shared/tick-input.ts', 'wrangler.jsonc',
    ]},
    'hostLoadSamples': samples, 'result': result,
    'stdoutOnFailure': stdout if result is None else '', 'stderr': stderr,
}
with gzip.open(output, 'wt', encoding='utf-8') as stream:
    json.dump(record, stream, indent=2)
    stream.write('\n')
summary = {k: v for k, v in record.items() if k not in ('hostLoadSamples', 'result')}
summary['result'] = {k: v for k, v in result.items() if k != 'rejections'} if result else None
summary['rejectionDetails'] = len(result.get('rejections', [])) if result else None
print(json.dumps(summary, indent=2))
sys.exit(process.returncode if process.returncode else (0 if result else 1))
