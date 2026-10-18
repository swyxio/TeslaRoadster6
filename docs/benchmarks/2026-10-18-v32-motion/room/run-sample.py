import datetime,json,os,subprocess,sys,time
from pathlib import Path

count=int(sys.argv[1])
label=f'{count}-clients'
out=Path('evidence')
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds')
def sample():
 p=subprocess.run(['ps','-p','98794,98798,98799','-o','pid=,time=,pcpu=,rss='],capture_output=True,text=True)
 return {'utc':now(),'load_1_5_15':list(os.getloadavg()),'server_processes':p.stdout.strip().splitlines()}
start=now();begin=time.monotonic();samples=[sample()]
proc=subprocess.Popen(['pnpm','exec','tsx','scripts/load-room.ts','http://127.0.0.1:24401',str(count),'60'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
while True:
 try:
  proc.wait(timeout=5)
  break
 except subprocess.TimeoutExpired:
  samples.append(sample())
stdout,stderr=proc.communicate();end=now();elapsed=time.monotonic()-begin;samples.append(sample())
(out/f'{label}.stdout.json').write_text(stdout)
(out/f'{label}.stderr.txt').write_text(stderr)
try: result=json.loads(stdout)
except (ValueError,TypeError): result=None
report={'source_commit':'5aeb9e8addd15f829ffa3f5cb85f0a7dcb3e0411','clients':count,'outer_start_utc':start,'outer_end_utc':end,'outer_elapsed_seconds':round(elapsed,3),'returncode':proc.returncode,'server_process_sample_fields':'pid,cumulative_cpu_time,ps_percent_cpu,rss_kib','samples':samples,'result':result}
(out/f'{label}.evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2),flush=True)
if stderr: print('STDERR:',stderr,file=sys.stderr,flush=True)
sys.exit(proc.returncode)
