"""Align bundled review examples locally. No synthesis, fitting or network access."""
import argparse
import hashlib
import json
from pathlib import Path
import comparison


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True,
                        help='Existing local pronunciation artifacts containing pinned encoders')
    args = parser.parse_args()
    comparison.DATA = args.data_root.resolve()
    comparison.torch.set_num_threads(8)
    acoustic = comparison.Acoustic(device='auto')
    root = Path(__file__).resolve().parents[1]
    narration = json.loads((root / 'content/narration.json').read_text())
    references = {}
    candidates = json.loads((root / 'public/models/blended-english-v3/comparison.json').read_text())['scripts']
    for question in json.loads((root / 'content/questions.json').read_text()):
        if question['type'] not in ['read-aloud', 'repeat-sentence']:
            continue
        text = question.get('text') or question['audioText']
        audio_path = question.get('audio') or f"audio/{question['id']}-reference.mp3"
        path = root / 'public' / audio_path
        audio = comparison.load_audio(path)
        logs, hidden = acoustic.run(audio)
        key = ' '.join(comparison.tokenize(text.replace('’', "'")))
        variants = []
        for variant in candidates[key]:
            units = [dict(s) for s in variant['syllables']]
            _, _, aligned = comparison.Aligner(acoustic.vocab).align_units(audio, variant['phones'], units, logs, hidden, 'hidden-ctc-v1')
            variants.append({'language': variant['language'], 'syllables': [{
                'word': s['word'], 'wordIndex': s['wordIndex'], 'syllableIndex': s['syllableIndex'],
                'label': ' '.join(s['phonemes']), 'start': round(s['start'], 4), 'end': round(s['end'], 4),
                'confidence': round(s['alignmentConfidence'], 4),
            } for s in aligned]})
        syllables = variants[0]['syllables']
        take = next(t for t in narration['takes'] if t['audio'] == audio_path)
        audio_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        assert audio_hash == take['audioSha256']
        references[question['id']] = {
            'audio': audio_path,
            'audioSha256': audio_hash,
            'scriptSha256': hashlib.sha256(text.encode()).hexdigest(),
            'synthetic': True,
            'listeningStatus': take['listeningStatus'],
            'alignerRevision': acoustic.revision,
            'syllables': syllables,
            'variants': variants,
        }
        print(question['id'], len(syllables), flush=True)
    (root / 'src/speech/reference-clips.json').write_text(json.dumps(references, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
