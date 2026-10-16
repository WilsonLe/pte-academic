"""Prepare local-only PCM controls for browser verification; no generation or training."""
import json
from argparse import Namespace
from comparison import DATA,ROOT,load_audio,predict

def main():
    folder=DATA/'browser-verification';folder.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((DATA/'reference-v3/manifest.json').read_text())
    cases=[]
    for voice in ['am_puck','bm_george','au_bloke','in_dhruv']:
        for pid in ['passage-083','passage-054']:
            take=next(t for t in manifest['takes'] if t['takeId']==pid+'--'+voice)
            audio=load_audio(DATA/'reference-v3'/take['file']);pcm=folder/(take['takeId']+'.f32');audio.tofile(pcm)
            for wrong in ([False,True] if pid=='passage-054' else [False]):
                name=take['takeId']+('-wrong' if wrong else '')
                text=take['text'].replace('red ship','red sheep') if wrong else take['text']
                output=folder/(name+'.json')
                if not output.exists():predict(Namespace(model=str(ROOT/'training/checkpoints/blended-english-v3/model.pt'),audio=str(DATA/'reference-v3'/take['file']),text=text,output=str(output),device='cpu'))
                expected=json.loads(output.read_text());cases.append({'name':name,'pcm':str(pcm.relative_to(ROOT)),'text':text,'expected':expected})
    (folder/'cases.json').write_text(json.dumps(cases,indent=2)+'\n')
    print('Prepared',len(cases),'existing development controls; PCM remains ignored.')
if __name__=='__main__':main()
