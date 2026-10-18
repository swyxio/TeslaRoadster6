#!/usr/bin/env python3
"""Run exactly one bounded eight-client preview check and retain raw evidence."""
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

source = Path(sys.argv[1]).resolve()
origin = sys.argv[2]
commit = sys.argv[3]
evidence = Path(__file__).resolve().parent
output = evidence / 'preview-8.evidence.json'
if output.exists():
    raise SystemExit(f'Refusing to overwrite {output}')
script = source / 'scripts' / 'preview-capacity-once.ts'
command = ['pnpm', 'exec', 'tsx', str(script), origin, '8', '60']
def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
start_utc, started = stamp(), time.monotonic()
process = subprocess.Popen(command, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
samples = []
while True:
    samples.append({'utc': stamp(), 'load_1_5_15': os.getloadavg()})
    try:
        stdout, stderr = process.communicate(timeout=5)
        break
    except subprocess.TimeoutExpired:
        if time.monotonic() - started > 130:
            process.kill()
            stdout, stderr = process.communicate()
            stderr += '\nHarness exceeded the 130-second outer timeout.\n'
            break
end_utc = stamp()
result = None
try:
    result = json.loads(stdout)
except json.JSONDecodeError:
    pass
record = {'origin': origin, 'source_commit': commit, 'outer_start_utc': start_utc, 'outer_end_utc': end_utc,
          'outer_elapsed_seconds': round(time.monotonic() - started, 3), 'returncode': process.returncode,
          'load_room_sha256': digest(source / 'scripts' / 'load-room.ts'), 'preview_harness_sha256': digest(script),
          'client_fixture_sha256': digest(source / 'tests' / 'room-input-client.ts'), 'host_load_samples': samples,
          'result': result, 'stdout': stdout, 'stderr': stderr}
output.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
sys.exit(process.returncode if process.returncode else (0 if result else 1))
