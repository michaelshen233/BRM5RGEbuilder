import unittest
from rge.commands import generate, parse, SCHEMAS


class CommandTests(unittest.TestCase):
    def test_precise_roundtrip(self):
        code = 'tween 1231 %hiddenelevator 4 -9745.4404296875 118.8145523071289 -7712.59912109375 -0 19.99867265393957 0'
        parsed = parse(code)
        self.assertEqual(parsed['kind'], 'tween')
        self.assertEqual(generate(parsed['kind'], parsed['values']), code)
        self.assertEqual(parsed['values']['rx'], '-0')

    def test_each_supported_layout(self):
        for kind, spec in SCHEMAS.items():
            if kind == 'raw':
                continue
            with self.subTest(kind=kind):
                code = generate(kind, {f['key']: f['default'] for f in spec['fields']})
                self.assertEqual(parse(code)['kind'], kind)
                self.assertEqual(parse(code)['code'], code)

    def test_explosion_order_and_spelling(self):
        parsed = parse('explosion 10 150 -1 2 3 Motar')
        self.assertEqual(parsed['values']['value1'], '10')
        self.assertEqual(parsed['values']['value2'], '150')
        self.assertEqual(parsed['values']['effect'], 'Motar')
        self.assertEqual(SCHEMAS['explosion']['fields'][0]['label'], 'Power')
        self.assertEqual(SCHEMAS['explosion']['fields'][1]['label'], 'Radius')

    def test_teleport_optional_rotation_is_not_added(self):
        for code in ['teleport player Test 1 2 3', 'teleport player Test 1 2 3 100']:
            self.assertEqual(parse(code)['code'], code)
            self.assertEqual(parse(code)['kind'], 'teleport')

    def test_invalid_numbers(self):
        values = parse('move 1 %door 1 2 3 -0 0 0')['values']
        for key, value in [('world','0'),('world','-2'),('world','1.5'),('x','NaN'),('x','Infinity'),('x','1,2'),('target','%door wait 1')]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                generate('move', {**values, key:value})

    def test_malformed_and_unknown_are_preserved(self):
        for code in ['move1231 %door 0 1 2 0 0 0','explosion', 'spawn 1 Radar', 'custom   strange syntax', 'explosion 50 5 1 2 3 0 24 C4']:
            with self.subTest(code=code):
                self.assertEqual(parse(code)['kind'], 'raw')
                self.assertEqual(parse(code)['code'], code)

    def test_no_multiline_raw_injection(self):
        with self.assertRaises(ValueError):
            generate('raw', {'raw':'wait 1\nwait 2'})

    def test_negative_duration(self):
        with self.assertRaises(ValueError):
            generate('wait', {'duration':'-1'})


if __name__ == '__main__':
    unittest.main()
