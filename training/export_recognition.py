"""Export pinned audio-only word recognition and a local pronunciation lexicon.

No fitting, synthesis, provider calls or learner data. Inputs are retained local
public checkpoints. Word references are separate derivatives of training takes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

import cmudict
from onnxruntime.quantization import quantize_dynamic, QuantType
import recognition_model
import torch
import comparison
from phonetics import units

ROOT = Path(__file__).resolve().parents[1]
REVISION = recognition_model.REVISION
CHUNK = 48 * 1024 * 1024


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--recognizer-root', type=Path, required=True)
    parser.add_argument('--encoder-only', action='store_true', help='Retain the hash-pinned dictionary and word-reference files')
    args = parser.parse_args()
    comparison.DATA = args.data_root.resolve()
    torch.set_num_threads(8)
    output = ROOT / 'public/models/word-recognition-v1'
    output.mkdir(parents=True, exist_ok=True)
    cache = ROOT / 'artifacts/word-recognition-export'
    cache.mkdir(parents=True, exist_ok=True)
    model, tokenizer, _ = recognition_model.load(args.recognizer_root)
    previous = json.loads((output/'manifest.json').read_text()) if args.encoder_only else None

    class Encoder(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.model = model

        def forward(self, audio):
            return self.model(audio).logits

    packed = cache / 'recognizer.onnx'
    raw = cache / 'recognizer-f32.onnx'
    torch.onnx.export(Encoder(), (torch.zeros(1, 32000),), str(raw),
                      input_names=['input_values'], output_names=['logits'],
                      dynamic_axes={'input_values': {1: 'samples'}, 'logits': {1: 'frames'}},
                      opset_version=17, dynamo=False, external_data=False)
    quantize_dynamic(str(raw), str(packed), weight_type=QuantType.QInt8,
                     per_channel=True, op_types_to_quantize=['MatMul', 'Gemm'])
    (output / 'vocab.json').write_text(json.dumps(tokenizer.get_vocab(), sort_keys=True)+'\n')
    files = []

    def add(path, kind):
        files.append({'path': path.name, 'bytes': path.stat().st_size, 'sha256': sha(path), 'kind': kind})

    with packed.open('rb') as stream:
        i = 0
        while data := stream.read(CHUNK):
            path = output / f'recognizer-lv60-int8-{i:02d}.bin'
            path.write_bytes(data)
            add(path, 'recognizer')
            i += 1
    add(output / 'vocab.json', 'vocabulary')
    print('Recognizer exported', flush=True)
    if previous:
        import gzip
        for file in previous['files']:
            if file['kind'] in ['recognizer', 'vocabulary']:
                continue
            transport = file.get('transport')
            data = (output/(transport['path'] if transport else file['path'])).read_bytes()
            if transport:
                assert hashlib.sha256(data).hexdigest() == transport['sha256']
                data = gzip.decompress(data)
                if transport['encoding'] == 'gzip-shuffle2':
                    half = (len(data)+1)//2
                    decoded = bytearray(len(data))
                    decoded[::2], decoded[1::2] = data[:half], data[half:]
                    data = bytes(decoded)
            assert len(data) == file['bytes'] and hashlib.sha256(data).hexdigest() == file['sha256']
            files.append(file)
        lexicon_words = previous['lexiconWords']
    else:
        metadata = json.loads((ROOT/'public/models/blended-english-v3/comparison.json').read_text())
        words = set(w.lower() for w in cmudict.words() if re.fullmatch("[a-z]+(?:'[a-z]+)?", w.lower()))
        for script in metadata['scripts']:
            words.update(script.split())
        # Compact word -> US/GB syllable phonetic labels. Unknown phonemes stay absent.
        lexicon = {}
        for i, word in enumerate(sorted(words)):
            variants = []
            for language in ['en-us', 'en-gb']:
                phones, syllables, unknown = units([word], language, metadata['vocab'])
                if not unknown and phones and syllables:
                    labels = [' '.join(s['phonemes']) for s in syllables]
                    if labels not in variants:
                        variants.append(labels)
            if variants:
                lexicon[word] = variants
            if i % 10000 == 0:
                print(f'Lexicon {i}/{len(words)}', flush=True)
        path = output / 'lexicon.json'
        path.write_text(json.dumps(lexicon, ensure_ascii=False, separators=(',', ':'))+'\n')
        add(path, 'lexicon')
        lexicon_words = len(lexicon)
    manifest = {
        'schemaVersion': 1, 'id': 'audio-only-words-v1',
        'repository': recognition_model.REPOSITORY, 'revision': REVISION,
        'encoderBytes': packed.stat().st_size, 'encoderSha256': sha(packed),
        'sourceWeightSha256': recognition_model.WEIGHT_SHA,
        'sourceLoaderSha256': sha(ROOT/'training/recognition_model.py'),
        'sourceFilesSha256': recognition_model.SOURCE_FILES,
        'assetDirectory': 'models/word-recognition-v1/', 'files': files,
        'totalBytes': sum(f['bytes'] for f in files), 'lexiconWords': lexicon_words,
        'exporterSha256': sha(Path(__file__)),
        'representation': 'dynamic per-channel INT8 MatMul/Gemm weights; float32 convolution and other operations',
        'quantizer': {'runtime': __import__('onnxruntime').__version__, 'perChannel': True, 'weightType': 'QInt8', 'operators': ['MatMul', 'Gemm']},
        'limits': 'Audio-only greedy English CTC; estimated words/times, not correctness. No prompt input. Synthetic sound comparison remains separate.',
    }
    if previous:
        for key in ['referenceWords', 'referenceExporterSha256']:
            manifest[key] = previous[key]
    # Remove only superseded, task-owned recognizer chunks after the export succeeds.
    names = {f['path'] for f in files}
    for path in output.glob('recognizer-*.bin'):
        if path.name not in names:
            path.unlink()
    data = json.dumps(manifest, indent=2)+'\n'
    (output/'manifest.json').write_text(data)
    (ROOT/'src/speech/recognition-manifest.json').write_text(data)
    # Public upstream Apache-2.0 license is already vendored for the encoder family.
    (output/'LICENSE').write_bytes((ROOT/'public/models/blended-english-v3/ENCODER-LICENSE.txt').read_bytes())
    (output/'README.md').write_text(f'Audio-only word recognizer derived from {recognition_model.REPOSITORY} at {REVISION}. Apache-2.0. Local ONNX export, no new fitting. CMUdict supplies vocabulary spellings (BSD-style license in CMUDICT-LICENSE); phonetics are generated locally with eSpeak-ng. See training/WORD_RECOGNITION.md.\n')
    (output/'CMUDICT-LICENSE').write_text(cmudict.license_string())
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    main()
