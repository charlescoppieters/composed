# Audio Generation & Sound APIs Research

> Research for Composed -- AI layer for music jamming app
> Last updated: 2026-03-14

---

## Table of Contents

1. [ElevenLabs Sound Effects API](#1-elevenlabs-sound-effects-api)
2. [ElevenLabs Other Relevant APIs](#2-elevenlabs-other-relevant-apis)
3. [OpenAI Audio APIs](#3-openai-audio-apis)
4. [Stability AI -- Stable Audio](#4-stability-ai--stable-audio)
5. [Meta AudioCraft / MusicGen](#5-meta-audiocraft--musicgen)
6. [Suno](#6-suno)
7. [Udio](#7-udio)
8. [Bark (Suno Open Source)](#8-bark-suno-open-source)
9. [Riffusion](#9-riffusion)
10. [Comparison Matrix](#10-comparison-matrix)
11. [Practical Recommendations for POC](#11-practical-recommendations-for-poc)

---

## 1. ElevenLabs Sound Effects API

### Overview

ElevenLabs provides a text-to-sound-effects API that converts natural language descriptions into high-quality audio. It understands both everyday language and professional audio terminology (Foley, cinematic design, game audio, etc.). This is the most accessible, production-ready sound effects generation API currently available.

### Endpoint

```
POST https://api.elevenlabs.io/v1/sound-generation
Content-Type: application/json
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `text` | string | **Yes** | -- | Natural language description of the desired sound effect |
| `duration_seconds` | number | No | Auto | Duration in seconds. Range: **0.5 -- 30s** max. If omitted, AI chooses duration. |
| `loop` | boolean | No | `false` | Creates seamlessly looping audio (v2 model only) |
| `prompt_influence` | number | No | `0.3` | How strictly to follow the prompt (0.0 = creative, 1.0 = strict) |
| `model_id` | string | No | `eleven_text_to_sound_v2` | Model to use |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `output_format` | string | Format as `codec_samplerate_bitrate`. E.g., `mp3_44100_128` |

### Supported Output Formats

- **MP3**: 22050 -- 44100 Hz
- **PCM**: 8000 -- 48000 Hz
- **Opus**: 48000 Hz
- **ulaw_8000**, **alaw_8000**
- **WAV downloads**: 48kHz (industry standard for film/TV/game)

### Authentication

Header: `xi-api-key: <your_api_key>`

### Response

- **200**: Binary audio stream (`application/octet-stream`)
- **422**: Validation error (JSON)

### Code Example (Python)

```python
import os
from elevenlabs import ElevenLabs, play

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

# Basic generation
audio = client.text_to_sound_effects.convert(
    text="Punchy 808 kick drum, single hit, deep sub bass",
    duration_seconds=2.0,
    prompt_influence=0.5,
)
play(audio)

# Looping ambient texture
ambient = client.text_to_sound_effects.convert(
    text="Warm analog synth pad, C minor, slow evolving texture",
    duration_seconds=15.0,
    loop=True,
    prompt_influence=0.7,
)
```

### Code Example (cURL)

```bash
curl -X POST "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Lo-fi hip hop drum loop, dusty vinyl crackle, 85 BPM",
    "duration_seconds": 10,
    "prompt_influence": 0.5
  }' \
  --output sfx.mp3
```

### Pricing (Credit System)

ElevenLabs uses a credit-based system shared across all their APIs:

| Scenario | Cost |
|----------|------|
| Auto duration (AI decides) | ~100--200 credits per generation |
| Manual duration | ~20--40 credits per second of audio |
| Max duration per generation | 30 seconds |

**Plan credits/month:**

| Plan | Monthly Price | Credits/Month |
|------|--------------|---------------|
| Free | $0 | 10,000 |
| Starter | $5 | 30,000 |
| Creator | $11 | 100,000 |
| Pro | $99 | 500,000 |
| Scale | $330 | 2,000,000 |
| Business | $1,320 | 11,000,000 |
| Enterprise | Custom | Custom |

At ~40 credits/second, the Pro plan ($99/mo) gives you roughly **12,500 seconds** (~3.5 hours) of generated sound effects per month. Enough for heavy prototyping.

### Prompting Best Practices

- **Simple one-shots**: `"Glass shattering on concrete"`, `"Snare drum rimshot, tight and punchy"`
- **Musical elements**: `"90s hip-hop drum loop, 90 BPM, boom bap style"`
- **Complex sequences**: `"Footsteps on gravel approaching, then a metallic door creaks open"`
- **Professional terms**: Use keywords like `impact`, `whoosh`, `ambience`, `one-shot`, `loop`, `stem`, `braam`, `glitch`, `drone`, `riser`, `stinger`
- **BPM and key**: Including tempo and key info significantly improves musical results

### Key Strengths for Music Production

- Excellent for **one-shot samples** (kicks, snares, hits, textures)
- **Loop mode** for seamless ambient/textural loops
- Professional output quality at **48kHz WAV**
- Fast generation (typically 2--5 seconds latency)
- Understands music production terminology
- `prompt_influence` slider allows creative exploration vs. precision

### Limitations

- **30 second max** per generation
- No explicit variation/iteration API (must re-request with same prompt; stochastic output gives natural variation)
- No stem separation or multi-track output
- No melodic/harmonic conditioning (text only)
- Credit cost adds up at scale

---

## 2. ElevenLabs Other Relevant APIs

### Text-to-Speech (TTS)

Potentially useful for vocal samples, spoken word, vocal chops.

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

- Models: `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2_5`
- 29+ languages, highly realistic voices
- **Voice cloning**: Clone a voice from audio samples (Instant or Professional)
- **Voice design**: Generate entirely new voices from text descriptions
- Streaming support for real-time output
- Output formats: mp3, pcm, opus, wav

**Relevance for music production**: Could generate vocal samples, ad-libs, spoken intros, vocal textures. Voice cloning could be used to create consistent "vocalist" personas.

### Speech-to-Speech

Transform audio input while preserving speech characteristics. Could be used for vocal effect processing.

### Audio Isolation

Separates vocals from background audio. Useful as a **stem separation** tool, though limited compared to dedicated tools like Demucs.

### SDK Availability

Official SDKs: Python, TypeScript/Node.js, Go, Ruby, Java, PHP, C#, Swift.

---

## 3. OpenAI Audio APIs

### Current Offerings (as of March 2026)

OpenAI does **not** offer sound effect or music generation APIs. Their audio APIs are focused on speech:

### Text-to-Speech (TTS)

```
POST https://api.openai.com/v1/audio/speech
```

| Model | Quality | Latency | Pricing |
|-------|---------|---------|---------|
| `tts-1` | Standard | Low | $15/1M characters |
| `tts-1-hd` | High | Higher | $30/1M characters |
| `gpt-4o-mini-tts` | Highest | Medium | $0.60/1M input tokens + $12/1M audio output tokens (~$0.015/min) |

**Voices**: alloy, echo, fable, onyx, nova, shimmer

**Output formats**: WAV, MP3, AAC, FLAC, Opus

**Key feature of gpt-4o-mini-tts**: Accepts instructions for tone/style ("speak in a whisper", "sound excited"), making it more controllable than standard TTS.

```python
from openai import OpenAI
client = OpenAI()

response = client.audio.speech.create(
    model="gpt-4o-mini-tts",
    voice="alloy",
    input="One, two, three, four!",
    instructions="Speak like a band leader counting in a song. Energetic and rhythmic.",
    response_format="wav",
)
response.stream_to_file("count_in.wav")
```

### Speech-to-Text (Transcription)

```
POST https://api.openai.com/v1/audio/transcriptions
```

Models: `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1`, `gpt-4o-transcribe-diarize`

**Relevance**: Could transcribe vocal recordings, detect lyrics, provide speaker diarization for multi-person jams.

### Realtime API

WebSocket-based streaming audio I/O for low-latency voice interaction. Could power a conversational AI "band leader" or vocal coach feature.

### What Is Coming

- **New audio model (Q1 2026)**: Reportedly launching by end of March 2026 with more natural speech.
- **Music generation tool (in development)**: OpenAI is building a music generation tool that would generate music from text and audio prompts, add accompaniment to existing tracks, etc. Partnered with Juilliard students for training data annotation. **Not yet available via API.**

### Relevance for Music Production

OpenAI's audio offerings are primarily speech-focused today. The upcoming music generation tool could be significant but has no public timeline for API access. Current TTS could be used for vocal sample generation and count-ins.

---

## 4. Stability AI -- Stable Audio

### Overview

Stable Audio 2.5 is a diffusion-based model that generates music and sound effects from text prompts. It produces structured compositions up to **3 minutes** at **44.1kHz stereo** -- significantly longer and more musically coherent than most competitors.

### API Access Options

Stable Audio does not have a single canonical API host. It is available through multiple platforms:

#### Option A: fal.ai (Recommended for simplicity)

**Text-to-Audio:**
```
POST https://fal.run/fal-ai/stable-audio-25
```

**Audio-to-Audio:**
```
POST https://fal.run/fal-ai/stable-audio-25/audio-to-audio
```

#### Option B: AIML API

```
POST /v2/generate/audio    (submit generation)
GET  /v2/generate/audio     (poll for results)
```
Body: `{ "model": "stable-audio", "prompt": "...", "seconds_total": 30 }`

#### Option C: Replicate

```
POST https://api.replicate.com/v1/predictions
```
Model: `stability-ai/stable-audio-2.5`

### Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `prompt` | string | -- | -- | Text description of desired audio |
| `seconds_total` | integer | 30 | 1--190 | Duration of generated audio |
| `num_inference_steps` | integer | 8--100 | 4--1000 | Denoising steps (quality vs speed) |
| `guidance_scale` | integer | 1 | 1--25 | Prompt adherence (higher = stricter) |
| `seed` | integer | random | -- | For reproducibility |
| `audio_url` | string | -- | -- | (Audio-to-audio only) Source audio to transform |
| `strength` | float | 0.8 | 0.01--1.0 | (Audio-to-audio) How much to deviate from input |

### Code Example (fal.ai / JavaScript)

```javascript
import { fal } from "@fal-ai/client";

// Text-to-Audio
const result = await fal.subscribe("fal-ai/stable-audio-25", {
  input: {
    prompt: "Jazzy lo-fi hip hop beat, mellow piano chords, vinyl crackle, 82 BPM, key of Eb minor",
    seconds_total: 60,
    num_inference_steps: 50,
    guidance_scale: 7,
  },
});
console.log(result.audio.url); // WAV file URL

// Audio-to-Audio transformation
const transformed = await fal.subscribe("fal-ai/stable-audio-25/audio-to-audio", {
  input: {
    prompt: "Add reverb and make it sound like it's playing in a cathedral",
    audio_url: "https://example.com/my-recording.wav",
    strength: 0.6,
  },
});
```

### Output

- Format: **WAV** (44.1kHz stereo)
- Includes seed in response for reproducibility

### Pricing

| Platform | Cost |
|----------|------|
| fal.ai | ~$0.03--0.10 per generation (GPU-time based) |
| Replicate | ~$0.05--0.15 per generation |
| AIML API | Credit-based, varies |
| Stability AI direct | Credit-based (pricing updated Aug 2025) |

### Prompt Tips

Stable Audio responds well to **technical musical descriptions**:
- Include **BPM** and **key** for rhythmic/harmonic accuracy
- Specify **instruments**, **genre**, **mood**
- Describe **structure**: "intro, verse, chorus" for longer compositions
- Works for both music and sound effects

### Key Strengths

- **Up to 3 minutes** of coherent audio (longest of any API)
- **Audio-to-audio** transformation (style transfer, remixing)
- **Audio inpainting** (fill in gaps in existing audio)
- Good musical structure and coherence
- Reproducible outputs via seed
- 44.1kHz stereo quality
- Claimed generation in **under 2 seconds** on Stability infrastructure (varies by platform)

### Limitations

- No official first-party API with stable pricing (relies on third-party hosts)
- Quality varies with inference steps (tradeoff vs latency)
- Not as strong on isolated one-shot samples as ElevenLabs SFX
- Commercial license required for some use cases

---

## 5. Meta AudioCraft / MusicGen

### Overview

AudioCraft is Meta's open-source PyTorch library containing **MusicGen** (music) and **AudioGen** (sound effects). Fully open-source with permissive licensing for the code. Available models range from 300M to 3.5B parameters.

### Models

| Model | Parameters | Capabilities |
|-------|-----------|--------------|
| `facebook/musicgen-small` | 300M | Text-to-music |
| `facebook/musicgen-medium` | 1.5B | Text-to-music |
| `facebook/musicgen-melody` | 1.5B | Text + melody conditioning |
| `facebook/musicgen-large` | 3.5B | Text-to-music (highest quality) |

### API Access via Replicate

```
POST https://api.replicate.com/v1/predictions
```

**Model**: `meta/musicgen`

**Cost**: ~$0.05/run (~20 runs per $1) on Nvidia A100 GPU

**Typical generation time**: ~36 seconds

### Parameters (Replicate)

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | string | Text description of desired music |
| `model_version` | string | `melody` or `large` |
| `duration` | integer | Length in seconds (default: 8) |
| `input_audio` | file | (Melody model) Audio for melodic conditioning |
| `temperature` | float | Sampling temperature |
| `top_k` | integer | Top-k sampling |
| `top_p` | float | Nucleus sampling |

### Code Example (Python, self-hosted)

```python
from audiocraft.models import MusicGen

model = MusicGen.get_pretrained("facebook/musicgen-melody")
model.set_generation_params(duration=15)

# Text-only generation
wav = model.generate(["funky bass groove, slap bass, 110 BPM"])

# Melody-conditioned generation
import torchaudio
melody, sr = torchaudio.load("my_hummed_melody.wav")
wav = model.generate_with_chroma(
    ["jazz piano arrangement of this melody"],
    melody[None].expand(1, -1, -1),
    sr,
)
```

### Key Strengths

- **Fully open source** -- can self-host, no API costs at scale
- **Melody conditioning** -- hum or play a melody, get a full arrangement
- Good quality for the price (free if self-hosted)
- Active research community

### Limitations

- **Requires GPU** (16GB+ VRAM for medium models)
- **Slower** generation (~36s on A100 for a clip)
- Model weights are **CC-BY-NC 4.0** (non-commercial without license)
- Quality below Suno/Udio for full songs
- No real-time generation
- Not actively maintained by Meta (last major update 2024)

---

## 6. Suno

### Overview

Suno is the leading consumer AI music generator, producing full songs with vocals, instrumentation, and lyrics from text prompts. As of 2026, they are on **v5** (launched Sept 2025) and **v5 Turbo**.

### API Access

**Suno does not offer an official public REST API.** Access is available through:

1. **Partner integrations** (limited beta, select developers)
2. **Third-party wrapper APIs** (unofficial but functional)

### Third-Party API Endpoints (e.g., via sunoapi.org, apiframe.ai)

```
POST /api/generate
POST /api/custom_generate
POST /api/generate_lyrics
```

**Custom generate parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | string | Song description |
| `lyrics` | string | Custom lyrics |
| `tags` | string | Style/genre tags |
| `title` | string | Song title |
| `model` | string | `suno-v5`, `suno-v5-turbo` |
| `make_instrumental` | boolean | Generate without vocals |
| `wait_audio` | boolean | Block until complete |

### Performance

- **First audio chunk**: 10--15 seconds
- **Full generation**: 20--30 seconds for a complete clip
- **Output**: Full song with vocals, up to ~4 minutes

### Pricing (Third-Party)

- Pay-as-you-go: ~$0.02--0.05 per track
- Subscription: ~$10--30/month for 500--2000 generations

### Key Strengths

- **Best overall song quality** -- vocals, lyrics, full arrangements
- Fast generation
- Covers virtually any genre
- v5 significantly improved fidelity and vocal authenticity
- Label partnerships (Warner settlement) provide legal clarity

### Limitations

- **No official API** -- reliant on third-party wrappers
- No fine-grained control over individual elements (stems, instruments)
- Cannot isolate or extract individual samples
- Not designed for loop/sample generation
- Legal/licensing still evolving
- Outputs are full songs, not building blocks for production

---

## 7. Udio

### Overview

Udio is Suno's primary competitor, positioned as the more "producer-friendly" option with stem downloads and remixing capabilities. As of 2026, they offer the **v4 model** with 48kHz stereo and compositions up to 10 minutes.

### API Access

Udio launched a **Developer Platform in 2025**:

- API access restricted to **Pro and Enterprise tiers**
- Generate API key at Settings > Developer Portal
- Official SDKs for **Python** and **Node.js**

### Key Capabilities

- Text-to-music generation
- Stem downloads (separate tracks)
- Remixing/extending existing audio
- 48kHz stereo output
- Up to 10-minute compositions (v4)

### Pricing

| Plan | Price | Notes |
|------|-------|-------|
| Free | $0 | 10 daily credits, no API |
| Standard | $10/month | Limited API |
| Pro | $30/month | Full API access |
| Enterprise | Custom | Dedicated infrastructure |

### Key Strengths

- **Stem separation** built in -- huge for music production
- More granular control than Suno
- High audio quality (48kHz)
- Official API (Pro+ tier)
- Better for producers who want to manipulate individual layers

### Limitations

- API restricted to paid tiers
- Less documentation than competitors
- Newer platform, API maturity still developing

---

## 8. Bark (Suno Open Source)

### Overview

Bark is Suno's open-source transformer-based text-to-audio model. It generates speech, music snippets, and sound effects from text prompts. Think of it as a general-purpose audio generation model rather than a music-specific one.

### Architecture

GPT-style autoregressive transformer using EnCodec tokenization. Similar approach to AudioLM and VALL-E.

### Capabilities

- Multilingual speech (13+ languages, 100+ speaker presets)
- Music generation (short clips)
- Sound effects
- Non-verbal audio (laughter, sighs, crying)
- Special token control: `[laughs]`, `[sighs]`, `[music]`

### Access

- **Self-hosted**: Apache 2.0 code, model weights for commercial use
- **Replicate**: `suno-ai/bark` (API access)
- **HuggingFace Transformers**: From v4.31.0+

### Relevance for Music Production

Limited. Bark is primarily a speech model that happens to handle some audio. Quality for music is significantly below dedicated music models. Best used for:
- Vocal sample generation
- Spoken word / ad-libs
- Non-verbal vocal textures

---

## 9. Riffusion

### Overview

Riffusion generates music by creating spectrogram images and converting them to audio. Originally open-source, it pivoted to a mobile-first consumer app in 2024.

### Current Status (2026)

- **Mobile app focus** (photo-to-song, text-to-song)
- Web app sunsetted (July 2024)
- No public API
- Original open-source model still available on GitHub

### Relevance

Minimal for a production API integration. The original technique (spectrogram diffusion) was innovative but has been superseded by dedicated audio models. Not recommended for a POC.

---

## 10. Comparison Matrix

### Sound Effects / Sample Generation

| Feature | ElevenLabs SFX | Stable Audio 2.5 | MusicGen | Bark |
|---------|---------------|-------------------|----------|------|
| **Primary Use** | Sound effects, one-shots | Music + SFX | Music | Speech + audio |
| **Max Duration** | 30s | 190s | ~30s | ~15s |
| **Output Quality** | 48kHz WAV | 44.1kHz stereo WAV | 32kHz | 24kHz |
| **Latency** | 2--5s | 2--15s | ~36s | ~10s |
| **API Maturity** | Production | Via 3rd party hosts | Via Replicate | Via Replicate |
| **Loop Support** | Yes | No | No | No |
| **Audio-to-Audio** | No | Yes | Yes (melody) | No |
| **Cost/Generation** | ~$0.01--0.05 | ~$0.03--0.15 | ~$0.05 | ~$0.03 |
| **Self-Hostable** | No | Yes (open weights) | Yes | Yes |
| **One-Shot Quality** | Excellent | Good | Fair | Poor |
| **Musical Coherence** | Fair (short) | Excellent | Good | Poor |

### Full Song / Music Generation

| Feature | Suno v5 | Udio v4 | Stable Audio 2.5 | MusicGen |
|---------|---------|---------|-------------------|----------|
| **Song Quality** | Excellent | Excellent | Good | Fair |
| **Vocals** | Yes | Yes | No | No |
| **Max Duration** | ~4min | 10min | 3min | ~30s |
| **Stem Output** | No | Yes | No | No |
| **Official API** | No | Yes (Pro+) | Via 3rd party | Via Replicate |
| **Latency** | 20--30s | 20--40s | 2--15s | ~36s |
| **Cost/Track** | $0.02--0.05 | Subscription | $0.03--0.15 | $0.05 |
| **Instrumental Only** | Yes | Yes | Yes | Yes |
| **Style Control** | Tags/prompt | Tags/prompt | Prompt | Prompt |
| **Commercial License** | Yes (paid plans) | Yes (paid plans) | Check license | CC-BY-NC |

### Speech / Voice APIs

| Feature | ElevenLabs TTS | OpenAI TTS | Bark |
|---------|---------------|------------|------|
| **Quality** | Best-in-class | Very good | Good |
| **Voice Cloning** | Yes | No | No (presets) |
| **Streaming** | Yes | Yes | No |
| **Expressiveness Control** | Voice design | Instructions param | Speaker presets |
| **Languages** | 29+ | ~50+ | 13+ |
| **Cost** | Credit-based | $0.015/min (mini) | Free (self-hosted) |
| **Latency** | <1s (turbo) | <1s | ~10s |

---

## 11. Practical Recommendations for POC

### Goal: Sample Retrieval + Generation for Music Production

The POC needs to help musicians **find and create sounds** during a jam session. This means low latency, good one-shot/loop quality, and easy integration.

### Recommended Stack

#### Tier 1: Core (Start Here)

**ElevenLabs Sound Effects API** -- Primary sample generator

- Best option for **one-shot samples** (drums, hits, textures, effects)
- Fast enough for near-real-time use (2--5s latency)
- Loop mode for ambient/textural backing
- Production-quality output (48kHz)
- Simple REST API, excellent SDKs
- Affordable for prototyping ($99/mo Pro plan gives ~3.5 hours of generated audio)

```python
# POC: Generate a sample from user's text description
async def generate_sample(description: str, duration: float = 2.0) -> bytes:
    response = client.text_to_sound_effects.convert(
        text=description,
        duration_seconds=duration,
        prompt_influence=0.5,
        model_id="eleven_text_to_sound_v2",
    )
    return b"".join(chunk for chunk in response)
```

#### Tier 2: Extended Capabilities (Add When Needed)

**Stable Audio 2.5 (via fal.ai)** -- Musical phrase/loop generation

- Better for **longer musical phrases** and **backing tracks** (up to 3 min)
- Audio-to-audio for transforming user recordings
- Use when user needs a chord progression, melody, or full backing loop
- Slightly higher latency but more musically coherent output

```python
# POC: Generate a backing track from description
async def generate_backing(description: str, seconds: int = 30) -> str:
    result = await fal.subscribe("fal-ai/stable-audio-25", {
        "input": {
            "prompt": description,
            "seconds_total": seconds,
            "guidance_scale": 7,
            "seed": random_seed(),  # store for regeneration
        }
    })
    return result["audio"]["url"]
```

#### Tier 3: Nice-to-Have (Future Features)

- **Udio API** (if Pro plan budget allows) -- stem separation for user uploads, full song generation
- **OpenAI TTS** (`gpt-4o-mini-tts`) -- vocal count-ins, spoken cues, AI "band leader" voice
- **MusicGen** (self-hosted) -- melody conditioning (hum a melody, get an arrangement), zero marginal cost at scale

### Architecture Recommendation

```
User Request ("funky bass loop 95 BPM")
        |
   [Prompt Router] -- decides which API to call based on request type
        |
   +---------+-----------+-----------+
   |         |           |           |
  SFX    Musical      Voice     Transform
 (11Labs)  (Stable)   (OpenAI)   (Stable a2a)
   |         |           |           |
   +----+----+-----------+-----------+
        |
   [Audio Cache / Library]  -- cache results, allow favoriting/saving
        |
   [Playback Engine]  -- low-latency playback in jam session
```

### Key POC Decisions

1. **Start with ElevenLabs SFX only.** It covers 80% of the "generate a sample from text" use case. Simple API, fast, good quality.

2. **Cache aggressively.** Same prompt with same seed won't give identical results on ElevenLabs (no seed param), but caching generated samples saves credits and enables a "sample library" feature.

3. **Add Stable Audio for musical content.** When users need chord progressions, melodies, or longer loops, Stable Audio's longer duration and better musical coherence fills the gap.

4. **Defer full song generation.** Suno/Udio are amazing for complete songs but not useful for a jamming workflow where users need individual building blocks.

5. **Consider latency budget.** For a jam session, 2--5 seconds (ElevenLabs) is acceptable for "search and find a sound." 20--30 seconds (Suno/Udio) is not. Pre-generation and caching can help.

6. **Watch the OpenAI music model launch.** If it ships with an API in Q1--Q2 2026, it could change the landscape significantly given OpenAI's infrastructure and developer tooling.

### Estimated Monthly Costs (POC)

| Service | Plan | Cost | What You Get |
|---------|------|------|--------------|
| ElevenLabs | Pro | $99/mo | ~12,500s of SFX generation |
| fal.ai (Stable Audio) | Pay-as-you-go | ~$20--50/mo | ~500 generations |
| OpenAI (TTS) | Pay-as-you-go | ~$5--10/mo | Vocal samples, count-ins |
| **Total** | | **~$125--160/mo** | Covers heavy prototyping |

---

## Sources

- [ElevenLabs Sound Effects Docs](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
- [ElevenLabs API Reference -- Sound Generation](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
- [ElevenLabs Pricing](https://elevenlabs.io/pricing)
- [OpenAI Audio Guides](https://developers.openai.com/api/docs/guides/audio/)
- [OpenAI Pricing](https://openai.com/api/pricing/)
- [Stability AI -- Stable Audio 2.5](https://stability.ai/stable-audio)
- [Stable Audio on fal.ai](https://fal.ai/models/fal-ai/stable-audio-25/audio-to-audio/api)
- [Stable Audio on AIML API](https://docs.aimlapi.com/api-references/music-models/stability-ai/stable-audio)
- [Meta AudioCraft GitHub](https://github.com/facebookresearch/audiocraft)
- [MusicGen on Replicate](https://replicate.com/meta/musicgen)
- [Suno API Docs (third-party)](https://docs.sunoapi.org/)
- [Udio Help Center -- Public API](https://help.udio.com/en/articles/10756277-udio-public-api)
- [Bark on GitHub](https://github.com/suno-ai/bark)
- [OpenAI Music Tool Report (TechCrunch)](https://techcrunch.com/2025/10/25/openai-reportedly-developing-new-generative-music-tool/)
