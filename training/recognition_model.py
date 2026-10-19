"""Pinned public audio-only recognizer; independent of the v3 phonetic encoder."""
import hashlib
from pathlib import Path
from transformers import Wav2Vec2ForCTC, Wav2Vec2CTCTokenizer, Wav2Vec2FeatureExtractor

REPOSITORY = 'facebook/wav2vec2-large-960h-lv60-self'
REVISION = '54074b1c16f4de6a5ad59affb4caa8f2ea03a119'
WEIGHT_SHA = '00b604cf4d28e86559e8adaeb3a186daa89dc37f5ab216771a0a15a26db0de9f'

SOURCE_FILES = {
    'pytorch_model.bin': WEIGHT_SHA,
    'config.json': 'bcb82b508db66c6772b34a978bcc6a411f9ea99c33cd9dee337119b5f6ddb797',
    'preprocessor_config.json': 'c403ce09975b90dff0dd8302c42d422e9de1f166cd7772df23490069893cb0cf',
    'vocab.json': '19727f8944fe6459fc3f240ae2c198395b740f6a029bd23e06656266b83bcf64',
    'tokenizer_config.json': 'c9a86ca4c3d72d4cda976512cd786cc65d87fe22afcd4164c8470f1dde7c9758',
    'special_tokens_map.json': 'bb7068de1150661a10b55f9e4b12a0e77af8bf91f5e45e1b58afaf1d0e17f675',
}


def verify_source(source: Path):
    for name, expected in SOURCE_FILES.items():
        with (source / name).open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if digest != expected:
            raise ValueError('Recognition source integrity mismatch: '+name)


def load(source: Path):
    """Local-only load. Verify weights and configuration before deserializing."""
    source = source.resolve()
    verify_source(source)
    model = Wav2Vec2ForCTC.from_pretrained(
        source, local_files_only=True, use_safetensors=False,
        attn_implementation='eager').eval()
    tokenizer = Wav2Vec2CTCTokenizer.from_pretrained(source, local_files_only=True)
    extractor = Wav2Vec2FeatureExtractor.from_pretrained(source, local_files_only=True)
    return model, tokenizer, extractor
