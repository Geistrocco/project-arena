"""Regression checks for source squad grouping and category normalization."""
import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).with_name('prepare-futbalnet-teams.py')
spec = importlib.util.spec_from_file_location('prepare', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreparationTest(unittest.TestCase):
    def test_distinct_squads_and_registration_aliases(self):
        parent = [{'id': 'msk-senec', 'name': 'MŠK Senec', 'source_id': 'msk-senec.futbalnet.sk', 'status': 'active'}]
        base = {'_id': 'one', 'appSpace': 'msk-senec.futbalnet.sk', 'ageCategory': 'U09', 'gender': 'M', 'category': 'A', 'season': '2026/2027'}
        teams = [base, base | {'_id': 'another-competition'}, base | {'_id': 'b', 'category': 'B'}, base | {'_id': 'girls', 'gender': 'F'}, base | {'_id': 'adults', 'ageCategory': 'ADULTS'}]
        rows = module.prepare(parent, [{'teams': teams}])
        self.assertEqual({r['category'] for r in rows}, {'U9', 'U9 B', 'U9 dievčatá', 'Muži'})
        self.assertTrue(all(r['season'] == '2026/27' for r in rows))
        primary = next(r for r in rows if r['category'] == 'U9')
        self.assertEqual(primary['registration_ids'], ['another-competition', 'one'])
        self.assertIn('/teams/M/U09/A?seasonName=2026%2F2027', primary['source_url'])
        self.assertIn('chlapci A', primary['name'])
        self.assertEqual(rows, module.prepare(parent, [{'teams': teams[::-1]}]))
        with self.assertRaises(ValueError):
            module.prepare(parent, [{'teams': [base | {'appSpace': 'unknown'}]}])
        with self.assertRaises(ValueError):
            module.prepare(parent, [{'teams': [base | {'gender': 'unknown'}]}])


if __name__ == '__main__':
    unittest.main()
