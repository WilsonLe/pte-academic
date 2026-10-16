"""Bundle word clips derived only from retained synthetic training references.

These are estimated corpus segments, not isolated studio takes or human gold.
No validation/test/held-out voice is added to the pronunciation reference bank.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
import comparison

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    args = parser.parse_args()
    data = args.data_root.resolve()
    corpus = data/'reference-v3'
    manifest = json.loads((corpus/'manifest.json').read_text())
    sources = {t['takeId']: t for t in manifest['takes']
               if t['split'] == 'train' and not t['heldOut']}
    chosen = {}
    for i, path in enumerate(sorted((data/'features-v4').glob('*.npz'))):
        if path.stem not in sources:
            continue
        with np.load(path, allow_pickle=False) as prepared:
            record = json.loads(str(prepared['metadata']))
            take = sources[path.stem]
            if str(prepared['audio_sha256']) != take['audioSha256']:
                raise ValueError('Reference feature/audio identity mismatch')
        words = {}
        for s in record['syllables']:
            words.setdefault(s['wordIndex'], []).append(s)
        for syllables in words.values():
            confidence = min(s['alignmentConfidence'] for s in syllables)
            start, end = syllables[0]['start'], syllables[-1]['end']
            if confidence < .4 or end-start < .08 or end-start > 2:
                continue
            key = (syllables[0]['word'], take['accent'])
            if key not in chosen or confidence > chosen[key]['confidence']:
                chosen[key] = dict(take=take, syllables=syllables,
                                   start=start, end=end, confidence=confidence)
    # Existing original review examples also enter the global word library, not
    # a question-specific lookup. They never influence audio-only recognition.
    question_refs = json.loads((ROOT/'src/speech/reference-clips.json').read_text())
    for qid, ref in question_refs.items():
        by_word = {}
        for syllable in ref['variants'][0]['syllables']:
            by_word.setdefault(syllable['wordIndex'], []).append(syllable)
        for syllables in by_word.values():
            word = syllables[0]['word']
            key = (word, 'en-US')
            if key in chosen:
                continue
            start, end = syllables[0]['start'], syllables[-1]['end']
            if min(s['confidence'] for s in syllables) < .03 or end-start < .05:
                continue
            chosen[key] = dict(take={
                'takeId': 'review-'+qid, 'file': ref['audio'], 'audioSha256': ref['audioSha256'],
                'listeningStatus': ref['listeningStatus'], 'review': True,
            }, syllables=[dict(s, phonemes=s['label'].split(' ')) for s in syllables],
                start=start, end=end, confidence=min(s['confidence'] for s in syllables))
    output = ROOT/'public/models/word-recognition-v1' 
    cache = ROOT/'artifacts/word-recognition-export'
    cache.mkdir(parents=True, exist_ok=True)
    references = {}
    decoded = {}
    for accent in ['en-US', 'en-GB', 'en-AU', 'en-IN']:
        samples = []
        offset = 0
        for (word, group), value in sorted(chosen.items()):
            if group != accent:
                continue
            take = value['take']
            if take['file'] not in decoded:
                source = ROOT/'public'/take['file'] if take.get('review') else corpus/take['file']
                if hashlib.sha256(source.read_bytes()).hexdigest() != take['audioSha256']:
                    raise ValueError('Reference source hash mismatch')
                decoded[take['file']] = comparison.load_audio(source)
            audio = decoded[take['file']]
            # Clip exactly the estimated word span, with no other prompt input.
            a, b = int(value['start']*16000), int(value['end']*16000)
            clip = audio[a:b]
            start = offset/16000
            references.setdefault(word, []).append({
                'accent': 'en' if take.get('review') else accent, 'audio': f'word-reference-{accent}.mp3',
                'start': round(start, 5), 'end': round(start+len(clip)/16000, 5),
                'sourceTake': take['takeId'], 'sourceAudioSha256': take['audioSha256'],
                'synthetic': True, 'listeningStatus': take['listeningStatus'],
                'confidence': round(value['confidence'], 4),
                'syllables': [{
                    'word': word, 'wordIndex': 0, 'syllableIndex': s['syllableIndex'],
                    'label': ' '.join(s['phonemes']),
                    'start': round(start+s['start']-value['start'], 5),
                    'end': round(start+s['end']-value['start'], 5),
                } for s in value['syllables']],
            })
            samples.extend([clip, np.zeros(2400, dtype=np.float32)])
            offset += len(clip)+2400
        raw = cache/f'reference-{accent}.f32'
        np.concatenate(samples).astype(np.float32).tofile(raw)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', '16000',
                        '-ac', '1', '-i', str(raw), '-codec:a', 'libmp3lame', '-b:a', '48k',
                        str(output/f'word-reference-{accent}.mp3')], check=True)
        print(accent, len(samples)//2, flush=True)
        decoded.clear()
    index = {'schemaVersion': 1, 'synthetic': True,
             'sourceManifestSha256': hashlib.sha256((corpus/'manifest.json').read_bytes()).hexdigest(),
             'referenceSplit': 'train plus original question review examples', 'heldOutVoices': False,
             'words': references}
    (output/'word-references.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':'))+'\n')
    path = output/'manifest.json'
    exported = json.loads(path.read_text())
    exported['files'] = [f for f in exported['files'] if f['kind'] not in ['reference-index', 'reference-audio']]
    for source in [output/'word-references.json', *sorted(output.glob('word-reference-*.mp3'))]:
        exported['files'].append({'path': source.name, 'bytes': source.stat().st_size,
                                  'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                                  'kind': 'reference-index' if source.suffix == '.json' else 'reference-audio'})
    exported['totalBytes'] = sum(f['bytes'] for f in exported['files'])
    exported['referenceExporterSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    exported['referenceWords'] = len(references)
    result = json.dumps(exported, indent=2)+'\n'
    path.write_text(result)
    (ROOT/'src/speech/recognition-manifest.json').write_text(result)
    print('Reference words', len(references), flush=True)


if __name__ == '__main__':
    main()
