"""Generate the original, nonlinguistic device-check sound (no question audio)."""

import math
from pathlib import Path
import struct
import wave


RATE = 16000
DURATION = 3
TONES = ((0.2, 440), (1.0, 660), (1.8, 880))
TONE_SECONDS = 0.35
FADE_SECONDS = 0.02
PEAK = 0.16


def main():
    samples = []
    for index in range(RATE * DURATION):
        time = index / RATE
        value = 0.0
        for start, frequency in TONES:
            local = time - start
            if 0 <= local < TONE_SECONDS:
                envelope = min(
                    1.0, local / FADE_SECONDS, (TONE_SECONDS - local) / FADE_SECONDS
                )
                value = PEAK * envelope * math.sin(2 * math.pi * frequency * local)
                break
        samples.append(round(value * 32767))

    destination = Path(__file__).resolve().parents[1] / "public/audio/headphone-check.wav"
    with wave.open(str(destination), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(struct.pack(f"<{len(samples)}h", *samples))


if __name__ == "__main__":
    main()
