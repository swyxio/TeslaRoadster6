#!/usr/bin/env python3
"""Run one authorized eight-Session, twenty-second preview diagnostic."""
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

source = Path(sys.argv[1]).resolve()
origin = sys.argv[2].rstrip('/')
commit = sys.argv[3]
url = urlsplit(origin)
if url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.workers.dev') or url.hostname == 'bay-drive.swyxio.workers.dev' or url.path or url.query or url.fragment or url.username or url.password:
    raise SystemExit('Expected a specific non-production HTTPS workers.dev preview origin')
evidence = Path(__file__).resolve().parent
output = evidence / 'preview-session-20.evidence.json'
if output.exists():
    raise SystemExit(f'Refusing to overwrite {output}')
template = (evidence / 'session-diagnostic-template.ts').read_text()
if template.count('__PREVIEW_ORIGIN__') != 1:
    raise SystemExit('Unexpected diagnostic template')
script = source / 'scripts' / 'session-diagnostic-once.ts'
script.write_text(template.replace('__PREVIEW_ORIGIN__',json.dumps(origin)))
command = ['pnpm', 'exec', 'tsx', str(script), origin]
def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
start_utc, started = stamp(), time.monotonic()
process = subprocess.Popen(command, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
samples = []
while True:
    samples.append({'utc':stamp(),'load_1_5_15':os.getloadavg()})
    try:
        stdout, stderr = process.communicate(timeout=5)
        break
    except subprocess.TimeoutExpired:
        if time.monotonic() - started > 70:
            process.kill(); stdout, stderr = process.communicate()
            stderr += '\nHarness exceeded the 70-second outer timeout.\n'
            break
end_utc=stamp()
try:
    result=json.loads(stdout)
except json.JSONDecodeError:
    result=None
hashes={str(path.relative_to(source)):digest(path) for path in [script,source/'src/session.ts',source/'src/motion-clock.ts',source/'src/tick-prediction.ts',source/'worker/index.ts',source/'shared/tick-input.ts',source/'pnpm-lock.yaml']}
record={'origin':origin,'source_commit':commit,'outer_start_utc':start_utc,'outer_end_utc':end_utc,
        'outer_elapsed_seconds':round(time.monotonic()-started,3),'returncode':process.returncode,'source_sha256':hashes,
        'host_load_samples':samples,'result':result,'stdout':stdout,'stderr':stderr}
output.write_text(json.dumps(record,indent=2)+'\n')
(evidence/'session-diagnostic-once.ts').write_text(script.read_text())
summary={'evidence':str(output),'returncode':process.returncode,'outer_start_utc':start_utc,'outer_end_utc':end_utc,
         'source_sha256':hashes,'stderr':stderr,
         'result':{key:value for key,value in result.items() if key!='rejections'} if result else None,
         'rejection_details':len(result.get('rejections',[])) if result else None}
print(json.dumps(summary,indent=2))
sys.exit(process.returncode if process.returncode else (0 if result else 1))
