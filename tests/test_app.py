from io import BytesIO
import os
from pathlib import Path
import unittest
from app import app
from rge.commands import generate


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_page_and_assets(self):
        for path in ['/', '/assets/app.js', '/assets/app.css', '/assets/mark.svg', '/api/schema']:
            with self.client.get(path) as response:
                self.assertEqual(response.status_code, 200, path)
        self.assertIn("frame-ancestors 'none'", self.client.get('/').headers['Content-Security-Policy'])

    def test_generation(self):
        response = self.client.post('/api/generate', json={'kind':'wait','values':{'duration':'0.20'}})
        self.assertEqual(response.json['code'], 'wait 0.20')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_invalid_json_shapes(self):
        for data in [[], None, 2, 'wait 1']:
            self.assertEqual(self.client.post('/api/generate', json=data).status_code,400)
        self.assertEqual(self.client.post('/api/generate', json={'kind':'wait','values':[]}).status_code,400)
        self.assertEqual(self.client.post('/api/generate', json={'kind':'made-up'}).status_code,400)

    def test_pasted_lines(self):
        result=self.client.post('/api/parse',json={'code':'wait 1\n\nmove1231 %door 0 0 0 0 0 0'})
        self.assertEqual(result.status_code,200)
        self.assertEqual([e['kind'] for e in result.json['entries']],['wait','raw'])

    def test_limits(self):
        self.assertEqual(self.client.post('/api/parse',json={'code':'wait 1\n'*2001}).status_code,400)
        self.assertEqual(self.client.post('/api/parse',json={'code':''}).status_code,400)
        self.assertEqual(self.client.post('/api/import-workbook',data={'file':(BytesIO(b'x'*6000000),'large.xlsx')}).status_code,400)

    def test_bad_upload(self):
        self.assertEqual(self.client.post('/api/import-workbook',data={'file':(BytesIO(b'not excel'),'bad.xlsx')}).status_code,400)
        self.assertEqual(self.client.post('/api/import-workbook',data={'file':(BytesIO(b'x'),'bad.txt')}).status_code,400)

    @unittest.skipUnless(os.environ.get('RGE_TEST_WORKBOOK'), 'Set RGE_TEST_WORKBOOK to test the source workbook')
    def test_source_workbook(self):
        payload=Path(os.environ['RGE_TEST_WORKBOOK']).read_bytes()
        response=self.client.post('/api/import-workbook',data={'file':(BytesIO(payload),'BRM5RGE.xlsx')})
        self.assertEqual(response.status_code,200)
        entries=response.json['entries']
        self.assertEqual(len(entries),198)
        self.assertEqual(sum(e['kind']=='raw' for e in entries),4)
        self.assertEqual(response.json['missingFormulaResults'],[])
        for e in entries:
            if e['kind']!='raw':
                self.assertEqual(generate(e['kind'],e['values']), ' '.join(e['original'].split()), e['source'])
        self.assertTrue(any(e['formula'] for e in entries))


if __name__ == '__main__':
    unittest.main()
