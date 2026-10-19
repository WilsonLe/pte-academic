"""Local four-accent recognition compatibility checks; no human scoring claim."""
import sys,json
from pathlib import Path
import numpy as np,onnxruntime as ort
sys.path.insert(0,'training')
import comparison, recognition_model
import argparse
p=argparse.ArgumentParser(description='Verify local recognition export against pinned Python and prepare browser controls.')
p.add_argument('--data-root',type=Path,required=True)
p.add_argument('--recognizer-root',type=Path,required=True)
args=p.parse_args()
comparison.DATA=args.data_root.resolve()
comparison.torch.set_num_threads(8)
model,tokenizer,extractor=recognition_model.load(args.recognizer_root)
opts=ort.SessionOptions();opts.intra_op_num_threads=8
session=ort.InferenceSession('artifacts/word-recognition-export/recognizer.onnx',sess_options=opts,providers=['CPUExecutionProvider'])
manifest=json.loads((comparison.DATA/'reference-v3/manifest.json').read_text())
cases=[]
for accent in ['en-US','en-GB','en-AU','en-IN']:
 take=next(t for t in manifest['takes'] if t['id']=='passage-054' and t['accent']==accent and t['heldOut'])
 audio=comparison.load_audio(comparison.DATA/'reference-v3'/take['file'])
 inp=extractor(audio,sampling_rate=16000,return_tensors='np').input_values
 with comparison.torch.inference_mode():
  expected=tokenizer.decode(model(comparison.torch.from_numpy(inp)).logits[0].argmax(-1)).lower().strip()
 logits=session.run(None,{'input_values':inp})[0][0]
 actual=tokenizer.decode(logits.argmax(-1)).lower().strip()
 assert expected==actual,(accent,expected,actual)
 path=Path('artifacts/word-recognition-export')/f'control-{accent}.f32';audio.tofile(path)
 cases.append({'accent':accent,'expected':expected,'sourceText':take['text'],'pcm':str(path),'seconds':len(audio)/16000})
 print(accent,actual,flush=True)
Path('artifacts/word-recognition-export/cases.json').write_text(json.dumps(cases,indent=2))
