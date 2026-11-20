import importlib.util,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
TMP=tempfile.TemporaryDirectory()
os.environ.update(MC_ROOT=TMP.name+'/servers',MC_BACKUP_ROOT=TMP.name+'/backups',MC_PORT_MIN='28000',MC_PORT_MAX='28009',MC_MEMORY_BUDGET_MIB='7168',MC_MAX_SERVERS='3')
spec=importlib.util.spec_from_file_location('helper',Path(__file__).parents[1]/'helper.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);h.ROOT.mkdir()
class Safety(unittest.TestCase):
 def config(self):return dict(name='sample',version='1.21.1',memory=2048,port=28000,mods=[],datapacks=[],javaTag='java21')
 def test_path_escape(self):
  for n in ['../other','/tmp/other','other;id','other-name']:
   with self.assertRaises(ValueError):h.folder(n)
 def test_budget_includes_overhead(self):
  c=self.config();c['memory']=6657
  with patch.object(h,'java',return_value='java21'),patch.object(h,'check_projects',return_value=[]):
   with self.assertRaises(ValueError):h.validate(c)
 def test_port_scope(self):
  c=self.config();c['port']=27999
  with self.assertRaises(ValueError):h.validate(c)
 def test_unknown_keys(self):
  c=self.config();c['image']='arbitrary'
  with self.assertRaises(ValueError):h.validate(c)
 def test_wrong_java(self):
  c=self.config();c['javaTag']='java25'
  with patch.object(h,'java',return_value='java21'):
   with self.assertRaises(ValueError):h.validate(c)
 def test_unlabelled_container_refused(self):
  i={'Config':{'Labels':{}},'Mounts':[]}
  with patch.object(h,'run',side_effect=['abcdef',json.dumps([i])]):
   with self.assertRaises(ValueError):h.container('sample')
 def test_wrong_storage_refused(self):
  i={'Config':{'Labels':{h.LABEL:'true','io.mc.name':'sample'}},'Mounts':[{'Destination':'/data','Source':'/wrong'}]}
  with patch.object(h,'run',side_effect=['abcdef',json.dumps([i])]):
   with self.assertRaises(ValueError):h.container('sample')
 def test_backup_failure_blocks_config_change(self):
  c=self.config()
  with patch.object(h,'read',return_value=c),patch.object(h,'java',return_value='java21'),patch.object(h,'validate'),patch.object(h,'backup',side_effect=ValueError('replica failed')),patch.object(h,'atomic') as write,patch.object(h,'recreate') as recreate:
   with self.assertRaises(ValueError):h.action('apply-config','sample',{'memory':1024})
   write.assert_not_called();recreate.assert_not_called()
if __name__=='__main__':unittest.main()
