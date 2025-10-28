import speech_recognition as sr
import keyboard
import time
import io
from pydub import AudioSegment

def manual_trigger_listener():
    recognizer = sr.Recognizer()
    mic = sr.Microphone()

    recognizer.energy_threshold = 100
    recognizer.dynamic_energy_threshold = True
    recognizer.dynamic_energy_adjustment_damping = 0.15

    max_silence = 5        # seconds without speech before clearing buffer
    min_chunk = 1.0         # skip very short noises
    phrase_limit = 20       # max seconds per phrase (failsafe)

    with mic as source:
        print("Adjusting for ambient noise... (stay quiet)")
        recognizer.adjust_for_ambient_noise(source, duration=2)
        print(f"Energy threshold: {recognizer.energy_threshold:.2f}")
        print("Listening... (Press ENTER to process what you said, Ctrl+C to quit)\n")

        buffer_audio = AudioSegment.empty()
        last_voice_time = time.time()
        recording = False

        while True:
            try:
                # capture small chunk
                audio = recognizer.listen(source, timeout=None, phrase_time_limit=2)
                duration = len(audio.frame_data) / (audio.sample_rate * audio.sample_width)

                if duration < min_chunk:
                    continue

                chunk = AudioSegment(
                    data=audio.get_raw_data(),
                    sample_width=audio.sample_width,
                    frame_rate=audio.sample_rate,
                    channels=1
                )

                buffer_audio += chunk
                last_voice_time = time.time()
                recording = True

                # if key pressed -> process what we have
                if keyboard.is_pressed("space"):
                    if len(buffer_audio) < 500:
                        print("Nothing meaningful captured.\n")
                        buffer_audio = AudioSegment.empty()
                        continue

                    print("Processing your sentence...\n")
                    wav_bytes = io.BytesIO()
                    buffer_audio.export(wav_bytes, format="wav")
                    wav_bytes.seek(0)

                    with sr.AudioFile(wav_bytes) as src:
                        audio_data = recognizer.record(src)

                    try:
                        text = recognizer.recognize_google(audio_data)
                        print(f"You said: {text}\n")
                    except sr.UnknownValueError:
                        print("Couldn't understand that one.\n")

                    buffer_audio = AudioSegment.empty()
                    recording = False
                    time.sleep(1)  # small debounce for the key

                # if silence for >5 s and nothing pressed → discard buffer
                if recording and (time.time() - last_voice_time > max_silence):
                    print("Silence too long — buffer cleared.\n")
                    buffer_audio = AudioSegment.empty()
                    recording = False

            except KeyboardInterrupt:
                print("\nStopped listening.")
                break
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(0.5)

if __name__ == "__main__":
    manual_trigger_listener()
