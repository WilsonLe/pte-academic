"""Local English pronunciation variants; eSpeak is used only for phonemization."""

from functools import lru_cache
import os
from pathlib import Path
import espeakng_loader

os.environ["ESPEAK_DATA_PATH"] = str(Path(espeakng_loader.get_data_path()).parent)
from phonemizer.backend import EspeakBackend
from phonemizer.backend.espeak.wrapper import EspeakWrapper
from phonemizer.separator import Separator

EspeakWrapper.set_library(espeakng_loader.get_library_path())
VOWELS = set("aeiouɑɐɒæəɚɛɜɞɪɔɵʊʌɨʉœøy")
CLUSTERS = [
    "p l",
    "p ɹ",
    "b l",
    "b ɹ",
    "t ɹ",
    "d ɹ",
    "k l",
    "k ɹ",
    "ɡ l",
    "ɡ ɹ",
    "f l",
    "f ɹ",
    "θ ɹ",
    "ʃ ɹ",
    "s p",
    "s t",
    "s k",
    "s m",
    "s n",
    "s l",
    "s w",
    "t w",
    "d w",
    "k w",
    "ɡ w",
    "s p l",
    "s p ɹ",
    "s t ɹ",
    "s k ɹ",
    "s k w",
    "p j",
    "b j",
    "t j",
    "d j",
    "k j",
    "ɡ j",
    "f j",
    "v j",
    "m j",
    "n j",
    "h j",
    "s j",
]
ONSETS = {tuple(x.split()) for x in CLUSTERS} | {()}
_BACKENDS = {}


def vowel(phone):
    return phone[0] in VOWELS or phone in {"əl", "l̩", "n̩"}


def backend(language):
    if language not in _BACKENDS:
        _BACKENDS[language] = EspeakBackend(
            language, with_stress=True, language_switch="remove-flags"
        )
    return _BACKENDS[language]


@lru_cache(maxsize=30000)
def word_phones(word, language):
    result = backend(language).phonemize(
        [word], separator=Separator(phone=" ", word="|"), strip=True
    )[0]
    values = []
    stress = 0
    for token in result.replace("|", " ").split():
        if "ˈ" in token:
            stress = 1
        elif "ˌ" in token:
            stress = 2
        token = token.replace("ˈ", "").replace("ˌ", "").replace("̩", "̩")
        if not token:
            continue
        if vowel(token):
            values.append(token + str(stress))
            stress = 0
        else:
            values.append(token)
    return tuple(values)


def warm(words):
    # Populate each backend in one call, avoiding repeated library initialization.
    for lang in ["en-us", "en-gb"]:
        backend(lang)
        for word in words:
            word_phones(word, lang)


def syllabify(phones):
    nuclei = [i for i, p in enumerate(phones) if p[-1:].isdigit()]
    if not nuclei:
        return []
    cuts = [0]
    for a, b in zip(nuclei, nuclei[1:]):
        cut = b
        for start in range(a + 1, b + 1):
            onset = tuple(phones[start:b])
            if len(onset) <= 1 or onset in ONSETS:
                cut = start
                break
        cuts.append(cut)
    cuts.append(len(phones))
    return [list(range(a, b)) for a, b in zip(cuts, cuts[1:])]


def units(words, language, vocab):
    phones = []
    syllables = []
    unknown = []
    for wi, word in enumerate(words):
        pron = list(word_phones(word, language))
        if not pron or any(p.rstrip("012") not in vocab for p in pron):
            unknown.append(
                {"word": word, "wordIndex": wi, "status": "unsupported-phonetics"}
            )
            continue
        offset = len(phones)
        for si, indexes in enumerate(syllabify(pron)):
            selected = [pron[i] for i in indexes]
            syllables.append(
                {
                    "word": word,
                    "wordIndex": wi,
                    "syllableIndex": si,
                    "phonemes": selected,
                    "phoneIndexes": [offset + i for i in indexes],
                    "stress": max(int(p[-1]) for p in selected if p[-1:].isdigit()),
                    "pronunciationVariant": language,
                }
            )
        phones.extend(pron)
    return phones, syllables, unknown
