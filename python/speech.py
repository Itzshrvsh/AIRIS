import whisper
import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
import os
import time
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
SAMPLE_RATE = 16000
OUTPUT_FILE = "sample.wav"
STOP_FLAG = "stop.txt"

print("STARTED", flush=True)

recording = []
with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32") as stream:
    while not os.path.exists(STOP_FLAG):
        data, _ = stream.read(1024)
        recording.append(data)
    print("STOPPED", flush=True)

recording = np.concatenate(recording, axis=0)
wav.write(OUTPUT_FILE, SAMPLE_RATE, (recording * 32767).astype(np.int16))

model = whisper.load_model("base")
result = model.transcribe(OUTPUT_FILE)
print(result["text"], flush=True)

os.remove(STOP_FLAG)
