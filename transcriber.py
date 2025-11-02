import whisper, sys, os

file_path = sys.argv[1]
output_text = file_path.replace(".wav", ".txt")

model = whisper.load_model("base")
result = model.transcribe(file_path)

with open(output_text, "w", encoding="utf-8") as f:
    f.write(result["text"])

print("Transcription saved to", output_text)
