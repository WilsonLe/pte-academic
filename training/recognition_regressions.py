"""Prepare retained issue150 native-codec diagnostics, without generating/uploading audio.

These synthetic recordings are kept outside Git. The script requires the exact
retained PCM and verifies its SHA before preparing browser test fixtures.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

CASES = [
    ('read-aloud', ['closes', 'strengthens'], []),
    ('describe-image', ['bus'], ['bust']),
    ('retell-lecture', ['retrieval', 'retention', 'across'], ['retrievale', 'retension']),
    ('summarize-group-discussion', ['another', 'attendance'], ['attendants']),
]
# Exact app-native decoded PCM, not a script treated as a human transcript.
HASHES = {
    'read-aloud': '685a59bd010556ee0cd74dbdcd4cb0af9d395e13ec96ed57dec81db5c883ec8b',
    'describe-image': 'b724c01071c94056db8664496f6bf58c43afe2adeaabfdde8ba19354874da9e7',
    'retell-lecture': '27d93f04877982132648e9e8faf628c70cd7411f728ec5fa1eb2244614f24c36',
    'summarize-group-discussion': '39a47b596432b94b1d56fb117792bd177ed6643748c0a26df82ca651ac609844',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture-root', type=Path, required=True)
    args = parser.parse_args()
    output = Path('artifacts/word-recognition-export')
    output.mkdir(parents=True, exist_ok=True)
    cases = []
    for name, required, rejected in CASES:
        source = args.capture_root / (name+'.f32')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if digest != HASHES[name]:
            raise ValueError('Retained native recording integrity mismatch: '+name)
        target = output / ('regression-'+name+'.f32')
        shutil.copyfile(source, target)
        cases.append({'name': name, 'pcm': str(target), 'sha256': digest,
                      'required': required, 'rejected': rejected,
                      'provenance': 'Retained synthetic native MediaRecorder capture, issue150; not a human speech benchmark.'})
    (output/'regressions.json').write_text(json.dumps(cases, indent=2)+'\n')


if __name__ == '__main__':
    main()
