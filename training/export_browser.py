"""Export accepted v3 sound comparison for local browser inference; no fitting or synthesis."""
import argparse
import json
from pathlib import Path
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import torch
from comparison import Acoustic, DATA, ROOT, digest, load_checkpoint, tokenize
from phonetics import units

MODEL_SHA = '2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b'
CHUNK_BYTES = 48 * 1024 * 1024

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', default='public/models/blended-english-v3')
    args = p.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    cache = DATA / 'browser-export'; cache.mkdir(parents=True, exist_ok=True)
    model_path = ROOT / 'training/checkpoints/blended-english-v3/model.pt'
    if digest(model_path) != MODEL_SHA:
        raise ValueError('Accepted v3 checkpoint identity changed.')
    c, _ = load_checkpoint(model_path)
    torch.set_num_threads(12)
    acoustic = Acoustic(device='cpu'); acoustic.model.set_attn_implementation('eager')
    class Encoder(torch.nn.Module):
        def __init__(self):
            super().__init__(); self.model = acoustic.model
        def forward(self, values):
            result = self.model(values, output_hidden_states=False)
            return acoustic._captured, result.logits
    raw = cache / 'export-fp32.onnx'
    torch.onnx.export(Encoder(), (torch.zeros(1, 32000),), str(raw),
        input_names=['input_values'], output_names=['hidden7', 'logits'],
        dynamic_axes={'input_values': {1: 'samples'}, 'hidden7': {1: 'frames'}, 'logits': {1: 'frames'}},
        opset_version=17, dynamo=False, external_data=False)
    graph = onnx.load(str(raw)); casts=[]
    for value in graph.graph.initializer:
        if value.data_type == TensorProto.FLOAT and len(value.raw_data) >= 1024:
            name = value.name
            replacement = numpy_helper.from_array(numpy_helper.to_array(value).astype(np.float16), name+'__fp16')
            value.CopyFrom(replacement)
            casts.append(helper.make_node('Cast', [replacement.name], [name], to=TensorProto.FLOAT))
    nodes=list(graph.graph.node); del graph.graph.node[:]; graph.graph.node.extend(casts+nodes)
    packed = cache / 'export-fp16-storage.onnx'; onnx.save(graph, str(packed))
    scripts={}
    def script(text):
        text=text.replace("’", "'").replace("‘", "'")
        key=' '.join(tokenize(text))
        if not key or key in scripts: return
        variants=[]
        for language in ['en-us', 'en-gb']:
            phones, syllables, unknown=units(tokenize(text), language, acoustic.vocab)
            if not unknown and phones and syllables:
                variants.append({'language':language, 'phones':phones, 'syllables':syllables})
        scripts[key]=variants
    questions=json.loads((ROOT/'content/questions.json').read_text())
    for q in questions:
        if q['type'] in ['read-aloud','repeat-sentence']: script(q.get('text') if q['type']=='read-aloud' else q.get('audioText'))
    # Existing development controls only, not raw training audio or fresh test inputs.
    config=json.loads((ROOT/'training/reference-corpus-v3.json').read_text())
    for passage in config['passages']:
        if passage['id'] in ['passage-054','passage-083']:
            script(passage['text']); script(passage['text'].replace('red ship','red sheep'))
    def values(value): return value.detach().cpu().tolist()
    state=c['state_dict']
    metadata={'schemaVersion':1, 'format':'blended-english-v3-browser-sound-v1',
        'modelSha256':MODEL_SHA,'referenceAccents':c['referenceAccents'],
        'encoder':list(c['encoder']), 'featureRepresentation':c['featureRepresentation'],
        'classes':c['classes'],'mean':values(c['mean']),'std':values(c['std']),
        'project':{k:values(v) for k,v in state.items() if k.startswith('project.')},
        'bank':{k:values(v) for k,v in c['bank'].items()}, 'calibration':c['calibration'],
        'duration':c['duration'],'vocab':acoustic.vocab,'scripts':scripts,
        'maxAudioSeconds':45,'confidenceThreshold':0.03,
        'scoreMeaning':'0–100 synthetic-reference sound similarity; not correctness or proficiency. Stress assessment remains Python-only.'}
    meta_path=output/'comparison.json'; meta_path.write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n')
    files=[]
    def add(path,kind): files.append({'path':path.name,'bytes':path.stat().st_size,'sha256':digest(path),'kind':kind})
    add(meta_path,'metadata')
    with packed.open('rb') as stream:
        index=0
        while data:=stream.read(CHUNK_BYTES):
            part=output/f'encoder-{index:02d}.bin';part.write_bytes(data);add(part,'encoder');index+=1
    manifest={'schemaVersion':1,'id':'blended-english-v3-fp16-storage-f32-v1',
        'modelSha256':MODEL_SHA,'encoderSha256':digest(packed),'encoderBytes':packed.stat().st_size,
        'assetDirectory':'models/blended-english-v3/','files':files,'totalBytes':sum(f['bytes'] for f in files),
        'exporterSha256':digest(Path(__file__)),'encoderRevision':list(c['encoder']),
        'source':'training/checkpoints/blended-english-v3/model.pt',
        'quantization':'float16 constant storage with explicit float32 casts/operations; comparison head/bank/calibration unchanged',
        'limits':'Sound similarity only; expected-text scripts; <=45s. Required automatic download; local cached inference.'}
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    (output/'manifest.json').write_text(text)
    (ROOT/'src/speech/comparison-manifest.json').write_text(text)
    print(json.dumps({'files':len(files),'bytes':manifest['totalBytes'],'modelSha256':MODEL_SHA,'scripts':len(scripts)},indent=2))

if __name__=='__main__': main()
