#!/usr/bin/env python3
"""A deliberately small, authenticated control boundary for managed Minecraft worlds."""
import socketserver, socket
import base64, datetime as dt, fcntl, hashlib, hmac, io, json, os, re, shutil, subprocess, tarfile, threading, urllib.parse, urllib.request, uuid, zipfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT=Path(os.environ['MC_ROOT']).resolve()
BACKUPS=Path(os.environ['MC_BACKUP_ROOT']).resolve()
LABEL='io.mc.managed'
LOCK=threading.RLock()
def run(args,timeout=180):
 p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 if p.returncode: raise ValueError('Operation failed; inspect private service diagnostics')
 return p.stdout.decode(errors='replace')
def atomic(p,value):
 t=p.with_name(p.name+'.tmp');t.write_text(json.dumps(value,indent=2)+'\n');t.chmod(0o600);t.replace(p)
def slug(s):
 if not isinstance(s,str) or not re.fullmatch('[a-z][a-z0-9]{0,23}',s): raise ValueError('Use a lowercase name with letters and numbers')
 return s
def folder(name):
 p=ROOT/slug(name)
 if p.is_symlink() or p.resolve().parent!=ROOT:raise ValueError('Invalid server directory')
 return p
def read(name):return json.loads((folder(name)/'config.json').read_text())
def configs():return [json.loads(p.read_text()) for p in ROOT.glob('*/config.json') if not p.parent.is_symlink()]
def get_json(url):
 req=urllib.request.Request(url,headers={'User-Agent':'mc-control/1.0 (self-hosted Minecraft manager)'})
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
def releases():return get_json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')['versions']
def java(version):
 v=next((v for v in releases() if v['id']==version and v['type']=='release'),None)
 if not v:raise ValueError('Choose an official stable Minecraft release')
 major=get_json(v['url'])['javaVersion']['majorVersion']
 if major not in [8,16,17,21,25]:raise ValueError('Java image needs operator review')
 return 'java'+str(major)
def no_downgrade(current,target):
 if current==target:return
 versions={v['id']:v for v in releases() if v['type']=='release'}
 if target not in versions or current not in versions:raise ValueError('Unknown release')
 if versions[target]['releaseTime']<versions[current]['releaseTime']:raise ValueError('Downgrading a world is unsafe; restore a matching backup instead')

def project_versions(project,version,kind='mod'):
 
 if not re.fullmatch('[a-zA-Z0-9_-]{1,80}',project):raise ValueError('Invalid project')
 q=urllib.parse.urlencode({'game_versions':json.dumps([version]),'loaders':json.dumps(['fabric' if kind=='mod' else 'datapack'])})
 return get_json('https://api.modrinth.com/v2/project/'+project+'/version?'+q)
def check_projects(c,version):
 result=[]
 for kind,key in [('mod','mods'),('datapack','datapacks')]:
  for p in c[key]:
   project=get_json('https://api.modrinth.com/v2/project/'+p)
   if kind=='mod' and (project['server_side']=='unsupported' or project['client_side']=='required'):raise ValueError('Mod requires client installation or does not support servers: '+p)
   builds=project_versions(p,version,kind)
   result.append({'project':p,'kind':kind,'compatible':bool(builds),'version':builds[0]['version_number'] if builds else None,'id':builds[0]['id'] if builds else None})
 return result

def validate(c,creating=False):
 keys={'name','version','memory','port','mods','datapacks','javaTag'}
 if set(c)!=keys:raise ValueError('Unknown or missing config keys')
 slug(c['name'])
 if not isinstance(c['version'],str) or not re.fullmatch(r'[0-9]+\.[0-9]+(?:\.[0-9]+)?',c['version']):raise ValueError('Invalid version')
 if type(c['port'])!=int or not int(os.environ['MC_PORT_MIN'])<=c['port']<=int(os.environ['MC_PORT_MAX']):raise ValueError('Port outside allowed range')
 if type(c['memory'])!=int or not 512<=c['memory']<=int(os.environ['MC_MEMORY_BUDGET_MIB'])-512:raise ValueError('Memory is MiB and must fit budget')
 for k in ['mods','datapacks']:
  if not isinstance(c[k],list) or len(c[k])>50:raise ValueError('Invalid project list')
  for p in c[k]:
   if not isinstance(p,str) or not re.fullmatch('[a-zA-Z0-9_-]{1,80}',p):raise ValueError('Invalid project')
 others=[x for x in configs() if x['name']!=c['name']]
 if creating and len(others)>=int(os.environ['MC_MAX_SERVERS']):raise ValueError('Server count limit reached')
 if any(x['port']==c['port'] for x in others):raise ValueError('Port already allocated')
 if sum(x['memory']+512 for x in others)+c['memory']+512>int(os.environ['MC_MEMORY_BUDGET_MIB']):raise ValueError('Total container memory budget exceeded')
 if c['javaTag']!=java(c['version']):raise ValueError('Java image must match Minecraft release')
 checks=check_projects(c,c['version'])
 if any(not x['compatible'] for x in checks):raise ValueError('Some projects have no compatible build')
 return c

def compose(c):
 p=folder(c['name']);secret=p/'rcon.secret'
 if not secret.exists():secret.write_text(uuid.uuid4().hex);secret.chmod(0o600)
 # All paths and image tags come from validated config and operator-owned roots.
 env={'UID':'0','GID':'0','EULA':'TRUE','TYPE':'FABRIC','VERSION':c['version'],'MEMORY':str(c['memory'])+'M','INIT_MEMORY':'512M','USE_AIKAR_FLAGS':'TRUE','REMOVE_OLD_MODS':'TRUE','ENABLE_RCON':'TRUE','RCON_PASSWORD_FILE':'/run/secrets/rcon','RCON_PORT':'25575','ONLINE_MODE':'TRUE','MODRINTH_PROJECTS':','.join(c['mods']),'MODRINTH_DOWNLOAD_DEPENDENCIES':'required','MODRINTH_ALLOWED_VERSION_TYPE':'alpha','LEVEL':'world','MAX_PLAYERS':'20','VIEW_DISTANCE':'10','ENABLE_ROLLING_LOGS':'true'}
 # Datapack URLs are selected server-side from Modrinth rather than accepting arbitrary URLs.
 urls=[];managed={}
 for item in c['datapacks']:
  v=project_versions(item,c['version'],'datapack')[0];f=next((f for f in v['files'] if f['primary']),v['files'][0]);
  filename=f['filename']
  if Path(filename).name!=filename:raise ValueError('Unsafe Modrinth filename')
  managed[filename]=f['hashes']['sha512'];urls.append(f['url'])
 manifest=p/'managed-datapacks.json';previous=json.loads(manifest.read_text()) if manifest.exists() else {}
 packdir=p/'data/world/datapacks'
 for filename,digest in previous.items():
  dest=packdir/filename
  if filename not in managed or managed[filename]!=digest:
   if dest.exists():
    with dest.open('rb') as stream:actual=hashlib.file_digest(stream,'sha512').hexdigest()
    if actual!=digest:raise ValueError('Managed datapack changed locally; operator review required')
    dest.unlink()
 for filename in managed:
  if (packdir/filename).exists() and filename not in previous:raise ValueError('Datapack filename conflicts with an unmanaged file')
 atomic(manifest,managed)
 if urls:env['DATAPACKS']=','.join(urls)
 d={'name':'mc-'+c['name'],'services':{'server':{'image':'itzg/minecraft-server:'+c['javaTag'],'labels':{LABEL:'true','io.mc.name':c['name']},'restart':'unless-stopped','mem_limit':str(c['memory']+512)+'m','memswap_limit':str(c['memory']+512)+'m','cpus':float(os.environ.get('MC_CPUS','2')),'pids_limit':512,'ports':['0.0.0.0:'+str(c['port'])+':25565/tcp'],'environment':env,'volumes':[str(p/'data')+':/data',str(secret)+':/run/secrets/rcon:ro'],'networks':['game'],'logging':{'driver':'json-file','options':{'max-size':'10m','max-file':'3'}},'stop_grace_period':'120s'}},'networks':{'game':{}}}
 atomic(p/'compose.json',d)

def container(name,optional=False):
 ids=run(['docker','ps','-aq','--filter','label='+LABEL+'=true','--filter','label=io.mc.name='+slug(name)]).split()
 if not ids and optional:return None
 if len(ids)!=1:raise ValueError('Expected exactly one managed container')
 info=json.loads(run(['docker','inspect',ids[0]]))[0]
 if info['Config']['Labels'].get(LABEL)!='true' or info['Config']['Labels'].get('io.mc.name')!=name:raise ValueError('Container is not managed')
 mounts=info['Mounts']
 if not any(m['Destination']=='/data' and m['Source']==str(folder(name)/'data') for m in mounts):raise ValueError('Container root mismatch')
 return info

def recreate(c):
 old=container(c['name'],True)
 if old and old['State']['Running']:run(['docker','stop','--time','120',old['Id']])
 compose(c)
 run(['docker','compose','-f',str(folder(c['name'])/'compose.json'),'up','-d','--pull','always'],timeout=900)
def rcon(name,command):
 if not isinstance(command,str) or not 1<=len(command)<=1024 or '\n' in command or '\r' in command:raise ValueError('Invalid console command')
 return run(['docker','exec',container(name)['Id'],'rcon-cli',command],60)

def backup(name):
 p=folder(name);stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
 base=BACKUPS/name;base.mkdir(parents=True,exist_ok=True);stage=base/(stamp+'.partial');stage.mkdir()
 info=container(name,True);live=info and info['State']['Running']
 try:
  if live:rcon(name,'save-off');rcon(name,'save-all flush')
  archive=stage/'world.tar.gz'
  with tarfile.open(archive,'w:gz',compresslevel=1) as t:
   for part in ['data','config.json','compose.json','rcon.secret','managed-datapacks.json']:
    if (p/part).exists():t.add(p/part,arcname=part,recursive=True)
 finally:
  if live:rcon(name,'save-on')
 with archive.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
 (stage/'SHA256SUMS').write_text(digest+'  world.tar.gz\n');(stage/'COMPLETE').touch()
 dest=base/stamp;stage.rename(dest)
 # Targets are operator configuration, never request parameters. Publish only after checksum verification.
 for target in json.loads(os.environ['MC_BACKUP_TARGETS']):
  host=target['host'];remote=target['path']+'/'+name;incoming=remote+'/.incoming-'+stamp
  import shlex
  q=shlex.quote
  command='set -eu; umask 077; mkdir -p '+q(incoming)+'; tar -C '+q(incoming)+' -xf -; cd '+q(incoming)+'; sha256sum -c --status SHA256SUMS; cd ..; mv '+q('.incoming-'+stamp)+' '+q(stamp)
  with subprocess.Popen(['ssh',host,command],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) as proc:
   with tarfile.open(fileobj=proc.stdin,mode='w|') as t:
    for item in dest.iterdir():t.add(item,arcname=item.name)
   proc.stdin.close()
   if proc.wait()!=0:raise ValueError('Backup replication failed; local snapshot retained')
 atomic(p/'backup-success.json',{'at':stamp,'targets':len(json.loads(os.environ['MC_BACKUP_TARGETS']))})
 # Only this application's completed snapshot format is eligible for retention.
 completed=sorted([x for x in base.iterdir() if re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{6}',x.name) and (x/'COMPLETE').is_file()],reverse=True)
 weekly={}
 for x in completed:weekly.setdefault(dt.datetime.strptime(x.name[:16],'%Y%m%dT%H%M%SZ').strftime('%G-%V'),x)
 keep=set(completed[:14])|set(list(weekly.values())[:8])
 for x in completed:
  if x in keep:continue
  for target in json.loads(os.environ['MC_BACKUP_TARGETS']):
   remote=target['path']+'/'+name+'/'+x.name
   run(['ssh',target['host'],'test -f '+q(remote+'/COMPLETE')+' && rm -r -- '+q(remote)],60)
  shutil.rmtree(x)
 return {'snapshot':stamp,'replicated':True}

def status(c):
 i=container(c['name'],True);result={**c,'state':i['State']['Status'] if i else 'absent','players':None}
 if i and i['State']['Running']:
  try:result['players']=rcon(c['name'],'list')
  except Exception:pass
 p=folder(c['name'])/'backup-success.json'
 if p.exists():result['backup']=json.loads(p.read_text())
 return result

def action(verb,name,payload):
 if verb=='list':return [status(c) for c in configs()]
 if verb=='versions':return [v['id'] for v in releases() if v['type']=='release'][:40]
 if verb=='limits':return {k:os.environ[k] for k in ['MC_PORT_MIN','MC_PORT_MAX','MC_MEMORY_BUDGET_MIB','MC_MAX_SERVERS']}
 if verb=='create-server':
  c=dict(payload);c['name']=slug(c['name']);c.setdefault('mods',[]);c.setdefault('datapacks',[]);c['javaTag']=java(c['version'])
  if folder(c['name']).exists():raise ValueError('Server already exists')
  validate(c,True);folder(c['name']).mkdir();(folder(c['name'])/'data').mkdir();atomic(folder(c['name'])/'config.json',c);recreate(c)
  return status(c)
 c=read(name)
 if verb=='status':return status(c)
 if verb=='logs':
  logs=subprocess.run(['docker','logs','--tail','200',container(name)['Id']],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30,check=True)
  return {'text':logs.stdout.decode(errors='replace')}
 if verb in ['start','stop','restart']:
  args=['docker',verb]
  if verb in ['stop','restart']:args+=['--time','120']
  run(args+[container(name)['Id']]);return status(c)
 if verb=='rcon':return {'text':rcon(name,payload['command'])}
 if verb=='backup-now':return backup(name)
 if verb in ['check-upgrade','check-updates']:
  target=payload.get('version',c['version']);no_downgrade(c['version'],target);j=java(target)
  return {'version':target,'javaTag':j,'projects':check_projects(c,target)}
 if verb=='apply-config':
  if set(payload)-{'version','memory','mods','datapacks','port'}:raise ValueError('Unknown config keys')
  updated={**c,**payload};no_downgrade(c['version'],updated['version']);updated['javaTag']=java(updated['version']);validate(updated)
  # Back up and verify both remote replicas before changing any config or image.
  backup(name);atomic(folder(name)/'config.json',updated);recreate(updated);return status(updated)
 if verb=='upload-datapack':
  filename=payload['filename'];data=base64.b64decode(payload['data'],validate=True)
  if not re.fullmatch(r'[a-zA-Z0-9_.-]+\.zip',filename) or len(data)>16*1024*1024:raise ValueError('Invalid datapack upload')
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   if 'pack.mcmeta' not in z.namelist() or sum(x.file_size for x in z.infolist())>128*1024*1024:raise ValueError('Invalid datapack')
   if any(Path(x.filename).is_absolute() or '..' in Path(x.filename).parts for x in z.infolist()):raise ValueError('Unsafe datapack paths')
  backup(name);dest=folder(name)/'data/world/datapacks';dest.mkdir(parents=True,exist_ok=True)
  if (dest/filename).exists():raise ValueError('Datapack already exists')
  (dest/filename).write_bytes(data);return {'uploaded':filename,'note':'Run reload or restart to load the datapack'}
 raise ValueError('Unknown verb')

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  token=Path(os.environ['MC_HELPER_SECRET_FILE']).read_text().strip()
  if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):self.send_error(401);return
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size>24*1024*1024:raise ValueError('Request too large')
   p=json.loads(self.rfile.read(size));
   if set(p)-{'verb','name','payload'}:raise ValueError('Unknown request keys')
   with LOCK:result=action(p['verb'],p.get('name'),p.get('payload',{}))
   body=json.dumps(result).encode();self.send_response(200)
  except (ValueError,KeyError,FileNotFoundError) as e:body=json.dumps({'error':str(e)}).encode();self.send_response(400)
  except Exception:body=b'{"error":"Operation failed; see private service diagnostics"}';self.send_response(500)
  self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
if __name__=='__main__':
 os.umask(0o077);ROOT.mkdir(parents=True,exist_ok=True)
 if not any('rootless' in x for x in json.loads(run(['docker','info','--format','{{json .SecurityOptions}}']))):raise RuntimeError('Rootless Docker is required')
 if os.environ.get('MC_HELPER_SOCKET'):
  class UnixServer(socketserver.ThreadingMixIn,socketserver.UnixStreamServer):daemon_threads=True
  path=Path(os.environ['MC_HELPER_SOCKET']);path.parent.mkdir(parents=True,exist_ok=True)
  if path.exists():
   if not path.is_socket():raise RuntimeError('Socket path is not a socket')
   path.unlink()
  server=UnixServer(str(path),Handler);path.chmod(0o600)
  threading.Thread(target=server.serve_forever,daemon=True).start()
 ThreadingHTTPServer(('127.0.0.1',int(os.environ['MC_HELPER_PORT'])),Handler).serve_forever()
