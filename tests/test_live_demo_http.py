import http.client
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from scripts import serve, evidence_api
from scripts.evidence_store import EvidenceStore
from scripts.live_demo_preparation import PreparationStore


class QuietHandler(serve.SpaRequestHandler):
    def log_message(self, *args):
        pass


class LiveHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.store = EvidenceStore(root/'evidence')
        self.preparations = PreparationStore(root/'cad')
        for patcher in (patch.dict(os.environ, {'WORKSPACE_ACCESS_TOKEN':'test-only-'+'x'*40}),
                        patch.object(evidence_api,'_store',self.store), patch.object(evidence_api,'_login_attempts',[]),
                        patch.object(serve,'local_fea_service',return_value=Mock()),
                        patch.object(serve,'cleanup_default_preparations',return_value=0),
                        patch('scripts.live_demo_preparation.PreparationStore',return_value=self.preparations)):
            patcher.start(); self.addCleanup(patcher.stop)
        self.server = serve.LocalWorkspaceServer(('127.0.0.1',0),QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'
        self.cookie, self.csrf = '', ''
        self.addCleanup(self.close_server)

    def close_server(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def request(self,method,path,body=None,headers=None):
        connection = http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        connection.request(method,path,json.dumps(body) if body is not None else None,
                           {'Origin':self.origin,'Content-Type':'application/json','Cookie':self.cookie,'X-CSRF-Token':self.csrf,**(headers or {})})
        response = connection.getresponse(); data = json.loads(response.read()); cookie = response.getheader('Set-Cookie'); status = response.status; connection.close()
        return status,data,cookie

    def test_operator_surface_requires_session_csrf_scope_and_origin(self):
        self.assertEqual(401,self.request('GET','/api/private/live-demo?workspace=unknown')[0])
        status,data,cookie = self.request('POST','/api/private/session',{'accessToken':'test-only-'+'x'*40})
        self.assertEqual(200,status); self.cookie = cookie.split(';')[0]; self.csrf = data['csrfToken']
        status,data,_ = self.request('POST','/api/private/workspaces',{'name':'Test','policy':{'cadDays':7,'quoteDays':30,'metadataUntilDeletion':True,'accepted':True}})
        self.assertEqual(201,status); workspace = data['result']['id']; path = '/api/private/live-demo?workspace='+workspace
        self.assertEqual([],self.request('GET',path)[1]['result'])
        self.assertEqual(403,self.request('GET',path,headers={'Origin':'https://attacker.invalid'})[0])
        self.assertEqual(403,self.request('POST',path,{},headers={'X-CSRF-Token':'invalid'})[0])
        self.assertEqual(422,self.request('POST',path,{'action':'advance'})[0])
        self.assertEqual(404,self.request('GET','/api/private/live-demo?workspace=other')[0])
        body = {'action':'reconcile','preparationId':'a'*64,'approval':None,'mapping':None,'level':0,
                'kind':'mesh','identity':'','simulation':'','reconciliation':{'stage':'mesh-create-0'}}
        with patch('scripts.simscale_live.LiveClient'), patch('scripts.simscale_live.LiveWorkflow') as workflow:
            workflow.return_value.reconcile.return_value = {'status':'RECONCILED'}
            status,data,_ = self.request('POST',path,body)
            self.assertEqual(200,status)
            self.assertEqual('RECONCILED',data['result']['status'])
            workflow.return_value.reconcile.assert_called_once_with(body['reconciliation'])
