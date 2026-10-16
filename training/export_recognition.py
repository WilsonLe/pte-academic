"""Export pinned audio-only word recognition and a local pronunciation lexicon.

No fitting, synthesis, provider calls or learner data. Inputs are retained local
public checkpoints. Word references are separate derivatives of training takes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

import cmudict
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import torch
import comparison
from phonetics import units

ROOT = Path(__file__).resolve().parents[1]
REVISION = "22aad52d435eb6dbaf354bdad9b0da84ce7d6156"
CHUNK = 48 * 1024 * 1024


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    args = parser.parse_args()
    comparison.DATA = args.data_root.resolve()
    torch.set_num_threads(8)
    output = ROOT / 'public/models/word-recognition-v1'
    output.mkdir(parents=True, exist_ok=True)
    cache = ROOT / 'artifacts/word-recognition-export'
    cache.mkdir(parents=True, exist_ok=True)
    recognizer = comparison.Acoustic(kind='words', device='cpu')
    assert recognizer.revision == REVISION
    recognizer.model.set_attn_implementation('eager')

    class Encoder(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.model = recognizer.model

        def forward(self, audio):
            return self.model(audio).logits

    packed = cache / 'recognizer.onnx'
    if not packed.exists():
        raw = cache / 'recognizer-f32.onnx'
        torch.onnx.export(Encoder(), (torch.zeros(1, 32000),), str(raw),
                          input_names=['input_values'], output_names=['logits'],
                          dynamic_axes={'input_values': {1: 'samples'}, 'logits': {1: 'frames'}},
                          opset_version=17, dynamo=False, external_data=False)
        graph = onnx.load(str(raw))
        casts = []
        for value in graph.graph.initializer:
            if value.data_type == TensorProto.FLOAT and len(value.raw_data) >= 1024:
                name = value.name
                replacement = numpy_helper.from_array(numpy_helper.to_array(value).astype(np.float16), name+'__fp16')
                value.CopyFrom(replacement)
                casts.append(helper.make_node('Cast', [replacement.name], [name], to=TensorProto.FLOAT))
        nodes = list(graph.graph.node)
        del graph.graph.node[:]
        graph.graph.node.extend(casts + nodes)
        onnx.save(graph, str(packed))
    (output / 'vocab.json').write_text(json.dumps(recognizer.vocab, sort_keys=True)+'\n')
    files = []

    def add(path, kind):
        files.append({'path': path.name, 'bytes': path.stat().st_size, 'sha256': sha(path), 'kind': kind})

    with packed.open('rb') as stream:
        i = 0
        while data := stream.read(CHUNK):
            path = output / f'recognizer-{i:02d}.bin'
            path.write_bytes(data)
            add(path, 'recognizer')
            i += 1
    add(output / 'vocab.json', 'vocabulary')
    print('Recognizer exported', flush=True)
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
    manifest = {
        'schemaVersion': 1, 'id': 'audio-only-words-v1',
        'repository': 'facebook/wav2vec2-base-960h', 'revision': REVISION,
        'encoderBytes': packed.stat().st_size, 'encoderSha256': sha(packed),
        'sourceWeightSha256': sha(recognizer.path/'model.safetensors'),
        'assetDirectory': 'models/word-recognition-v1/', 'files': files,
        'totalBytes': sum(f['bytes'] for f in files), 'lexiconWords': len(lexicon),
        'exporterSha256': sha(Path(__file__)),
        'representation': 'float16 constant storage; float32 operations',
        'limits': 'Audio-only greedy English CTC; estimated words/times, not correctness. No prompt input. Synthetic sound comparison remains separate.',
    }
    data = json.dumps(manifest, indent=2)+'\n'
    (output/'manifest.json').write_text(data)
    (ROOT/'src/speech/recognition-manifest.json').write_text(data)
    # Public upstream Apache-2.0 license is already vendored for the encoder family.
    (output/'LICENSE').write_bytes((ROOT/'public/models/blended-english-v3/ENCODER-LICENSE.txt').read_bytes())
    (output/'README.md').write_text(f'Audio-only word recognizer derived from facebook/wav2vec2-base-960h at {REVISION}. Apache-2.0. Local ONNX export, no new fitting. CMUdict supplies vocabulary spellings (BSD-style license in CMUDICT-LICENSE); phonetics are generated locally with eSpeak-ng. See training/WORD_RECOGNITION.md.\n')
    (output/'CMUDICT-LICENSE').write_text(cmudict.license_string())
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    main()
