from __future__ import annotations

import asyncio
import io
import json
import os
import re
import time
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from xml.sax.saxutils import escape as xml_escape

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import Response

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
OUTPUTS_DIR = ROOT_DIR / "outputs"
PREVIEWS_DIR = OUTPUTS_DIR / "previews"
HISTORY_FILE = OUTPUTS_DIR / "history.json"
MAX_HISTORY_ITEMS = 100

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

# Load local .env or parent backend/.env if present
for _candidate_env in (
    ROOT_DIR / ".env",
    ROOT_DIR.parent / ".env",
    ROOT_DIR.parent.parent / ".env",
):
    if _candidate_env.exists():
        for _line in _candidate_env.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(
                    _k.strip(), _v.strip().strip('"').strip("'")
                )

_EXECUTOR = ThreadPoolExecutor(max_workers=6)

# Explicit AWS region resolution: prefer AWS_DEFAULT_REGION over AWS_REGION
DEFAULT_AWS_REGION = (
    os.environ.get("AWS_DEFAULT_REGION", "").strip()
    or os.environ.get("POLLY_AWS_REGION", "").strip()
    or os.environ.get("AWS_REGION", "").strip()
    or "us-east-1"
)
DEFAULT_POLLY_S3_BUCKET = os.environ.get("POLLY_S3_BUCKET_NAME", "").strip()
DEFAULT_POLLY_S3_PREFIX = os.environ.get(
    "POLLY_S3_KEY_PREFIX", "polly-outputs/"
).strip()

POLLY_REGIONS: list[dict[str, Any]] = [
    {
        "id": "us-east-1",
        "label": "US East (N. Virginia) · us-east-1",
        "engines": ["generative", "long-form", "neural", "standard"],
        "recommended": True,
    },
    {
        "id": "us-west-2",
        "label": "US West (Oregon) · us-west-2",
        "engines": ["generative", "neural", "standard"],
        "recommended": False,
    },
    {
        "id": "eu-central-1",
        "label": "Europe (Frankfurt) · eu-central-1",
        "engines": ["generative", "neural", "standard"],
        "recommended": False,
    },
    {
        "id": "eu-west-1",
        "label": "Europe (Ireland) · eu-west-1",
        "engines": ["neural", "standard"],
        "recommended": False,
    },
    {
        "id": "eu-west-2",
        "label": "Europe (London) · eu-west-2",
        "engines": ["neural", "standard"],
        "recommended": False,
    },
    {
        "id": "ap-southeast-2",
        "label": "Asia Pacific (Sydney) · ap-southeast-2",
        "engines": ["neural", "standard"],
        "recommended": False,
    },
    {
        "id": "ap-northeast-1",
        "label": "Asia Pacific (Tokyo) · ap-northeast-1",
        "engines": ["neural", "standard"],
        "recommended": False,
    },
    {
        "id": "ap-south-1",
        "label": "Asia Pacific (Mumbai) · ap-south-1",
        "engines": ["neural", "standard"],
        "recommended": False,
    },
    {
        "id": "ca-central-1",
        "label": "Canada (Central) · ca-central-1",
        "engines": ["neural", "standard"],
        "recommended": False,
    },
]

POLLY_ENGINES: list[dict[str, Any]] = [
    {
        "id": "generative",
        "label": "Generative",
        "badge": "Most Realistic · Adaptive Prosody",
        "description": "Next-generation LLM-powered voice engine producing emotionally adaptive, human-like conversational speech.",
        "default_sample_rate": "24000",
        "sample_rates": {
            "mp3": ["8000", "16000", "22050", "24000"],
            "ogg_vorbis": ["8000", "16000", "22050", "24000"],
            "wav": ["8000", "16000"],
            "pcm": ["8000", "16000"],
            "json": [],
        },
        "speech_mark_types": ["sentence", "word"],
        "price_per_1m_chars": 30.0,
    },
    {
        "id": "neural",
        "label": "Neural (NTTS)",
        "badge": "High Quality · Visemes + Styles",
        "description": "Natural neural text-to-speech supporting Newscaster/Conversational styles, Viseme lip-sync marks, and rich SSML.",
        "default_sample_rate": "24000",
        "sample_rates": {
            "mp3": ["8000", "16000", "22050", "24000"],
            "ogg_vorbis": ["8000", "16000", "22050", "24000"],
            "wav": ["8000", "16000"],
            "pcm": ["8000", "16000"],
            "json": [],
        },
        "speech_mark_types": ["viseme", "word", "sentence", "ssml"],
        "price_per_1m_chars": 16.0,
    },
    {
        "id": "long-form",
        "label": "Long-Form",
        "badge": "Expressive Narration",
        "description": "Designed for audiobooks, articles, and long-form video narration with sustained natural cadence.",
        "default_sample_rate": "24000",
        "sample_rates": {
            "mp3": ["8000", "16000", "22050", "24000"],
            "ogg_vorbis": ["8000", "16000", "22050", "24000"],
            "wav": ["8000", "16000"],
            "pcm": ["8000", "16000"],
            "json": [],
        },
        "speech_mark_types": ["viseme", "word", "sentence", "ssml"],
        "price_per_1m_chars": 100.0,
    },
    {
        "id": "standard",
        "label": "Standard",
        "badge": "Full SSML Effects · Fast",
        "description": "Classic TTS supporting every acoustic SSML effect including vocal-tract-length, whispered, soft phonation, and auto-breaths.",
        "default_sample_rate": "22050",
        "sample_rates": {
            "mp3": ["8000", "16000", "22050", "24000"],
            "ogg_vorbis": ["8000", "16000", "22050", "24000"],
            "wav": ["8000", "16000"],
            "pcm": ["8000", "16000"],
            "json": [],
        },
        "speech_mark_types": ["viseme", "word", "sentence", "ssml"],
        "price_per_1m_chars": 4.0,
    },
]

OUTPUT_FORMATS: list[dict[str, Any]] = [
    {
        "id": "mp3",
        "polly_format": "mp3",
        "label": "MP3 · Standard Audio (.mp3)",
        "media_type": "audio/mpeg",
        "ext": "mp3",
        "sample_rates": ["8000", "16000", "22050", "24000"],
        "default_sample_rate": "24000",
    },
    {
        "id": "wav",
        "polly_format": "pcm",
        "label": "WAV · 16-bit PCM (.wav · Ready for InfiniteTalk)",
        "media_type": "audio/wav",
        "ext": "wav",
        "sample_rates": ["8000", "16000"],
        "default_sample_rate": "16000",
    },
    {
        "id": "ogg_vorbis",
        "polly_format": "ogg_vorbis",
        "label": "Ogg Vorbis (.ogg)",
        "media_type": "audio/ogg",
        "ext": "ogg",
        "sample_rates": ["8000", "16000", "22050", "24000"],
        "default_sample_rate": "24000",
    },
    {
        "id": "pcm",
        "polly_format": "pcm",
        "label": "Raw PCM · Headerless 16-bit LE (.pcm)",
        "media_type": "audio/pcm",
        "ext": "pcm",
        "sample_rates": ["8000", "16000"],
        "default_sample_rate": "16000",
    },
    {
        "id": "json",
        "polly_format": "json",
        "label": "Speech Marks Only (.json)",
        "media_type": "application/json",
        "ext": "json",
        "sample_rates": [],
        "default_sample_rate": "",
    },
]

SPEECH_MARK_TYPES: list[dict[str, Any]] = [
    {
        "id": "viseme",
        "label": "Visemes (Lip-Sync Shapes)",
        "description": "Mouth/face viseme IDs with millisecond timestamps",
        "engines": ["neural", "long-form", "standard"],
    },
    {
        "id": "word",
        "label": "Word Timestamps",
        "description": "Start/end byte offsets and timestamps for every spoken word",
        "engines": ["generative", "neural", "long-form", "standard"],
    },
    {
        "id": "sentence",
        "label": "Sentence Boundaries",
        "description": "Sentence start/end offsets and timestamps",
        "engines": ["generative", "neural", "long-form", "standard"],
    },
    {
        "id": "ssml",
        "label": "SSML <mark/> Bookmarks",
        "description": "Custom <mark name=\"...\"/> trigger timestamps",
        "engines": ["neural", "long-form", "standard"],
    },
]

SSML_SNIPPETS: list[dict[str, Any]] = [
    {
        "id": "break_500ms",
        "label": "Pause 500ms",
        "category": "Timing",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<break time="500ms"/>',
        "wrap": False,
    },
    {
        "id": "break_strong",
        "label": "Strong Pause",
        "category": "Timing",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<break strength="strong"/>',
        "wrap": False,
    },
    {
        "id": "prosody_rate_Pitch",
        "label": "Prosody (Rate/Pitch/Vol)",
        "category": "Prosody",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<prosody rate="105%" pitch="+4%" volume="loud">{text}</prosody>',
        "wrap": True,
    },
    {
        "id": "emphasis_strong",
        "label": "Strong Emphasis",
        "category": "Prosody",
        "engines": ["standard", "long-form"],
        "snippet": '<emphasis level="strong">{text}</emphasis>',
        "wrap": True,
    },
    {
        "id": "domain_news",
        "label": "Newscaster Style",
        "category": "Style",
        "engines": ["neural"],
        "snippet": '<amazon:domain name="news">{text}</amazon:domain>',
        "wrap": True,
    },
    {
        "id": "domain_conversational",
        "label": "Conversational Style",
        "category": "Style",
        "engines": ["neural"],
        "snippet": '<amazon:domain name="conversational">{text}</amazon:domain>',
        "wrap": True,
    },
    {
        "id": "effect_drc",
        "label": "Dynamic Range Compression",
        "category": "Acoustic Effects",
        "engines": ["neural", "standard"],
        "snippet": '<amazon:effect name="drc">{text}</amazon:effect>',
        "wrap": True,
    },
    {
        "id": "effect_whispered",
        "label": "Whispered Voice",
        "category": "Acoustic Effects",
        "engines": ["standard"],
        "snippet": '<amazon:effect name="whispered">{text}</amazon:effect>',
        "wrap": True,
    },
    {
        "id": "effect_soft",
        "label": "Soft Phonation",
        "category": "Acoustic Effects",
        "engines": ["standard"],
        "snippet": '<amazon:effect phonation="soft">{text}</amazon:effect>',
        "wrap": True,
    },
    {
        "id": "effect_timbre",
        "label": "Vocal Tract Timbre (+10%)",
        "category": "Acoustic Effects",
        "engines": ["standard"],
        "snippet": '<amazon:effect vocal-tract-length="+10%">{text}</amazon:effect>',
        "wrap": True,
    },
    {
        "id": "auto_breaths",
        "label": "Auto-Breaths",
        "category": "Breathing",
        "engines": ["standard"],
        "snippet": '<amazon:auto-breaths volume="medium" frequency="medium" duration="medium">{text}</amazon:auto-breaths>',
        "wrap": True,
    },
    {
        "id": "single_breath",
        "label": "Insert Breath",
        "category": "Breathing",
        "engines": ["standard"],
        "snippet": '<amazon:breath duration="medium" volume="medium"/>',
        "wrap": False,
    },
    {
        "id": "say_as_spell",
        "label": "Spell Out",
        "category": "Interpretation",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<say-as interpret-as="characters">{text}</say-as>',
        "wrap": True,
    },
    {
        "id": "say_as_digits",
        "label": "Speak Digits",
        "category": "Interpretation",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<say-as interpret-as="digits">{text}</say-as>',
        "wrap": True,
    },
    {
        "id": "say_as_date",
        "label": "Date Format",
        "category": "Interpretation",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<say-as interpret-as="date" format="mdy">{text}</say-as>',
        "wrap": True,
    },
    {
        "id": "phoneme_ipa",
        "label": "IPA Phoneme",
        "category": "Pronunciation",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<phoneme alphabet="ipa" ph="pɪˈkɑːn">{text}</phoneme>',
        "wrap": True,
    },
    {
        "id": "sub_alias",
        "label": "Sub / Alias",
        "category": "Pronunciation",
        "engines": ["generative", "neural", "long-form", "standard"],
        "snippet": '<sub alias="World Wide Web Consortium">{text}</sub>',
        "wrap": True,
    },
    {
        "id": "lang_switch",
        "label": "Language Switch (fr-FR)",
        "category": "Pronunciation",
        "engines": ["neural", "standard"],
        "snippet": '<lang xml:lang="fr-FR">{text}</lang>',
        "wrap": True,
    },
    {
        "id": "custom_mark",
        "label": "SSML Bookmark <mark/>",
        "category": "Timing",
        "engines": ["neural", "long-form", "standard"],
        "snippet": '<mark name="cue_point_1"/>',
        "wrap": False,
    },
]

# Built-in fallback catalog of real Amazon Polly voices (used if AWS credentials are not yet active)
FALLBACK_VOICES: list[dict[str, Any]] = [
    {"Id": "Ruth", "Name": "Ruth", "Gender": "Female", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["generative", "long-form", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Matthew", "Name": "Matthew", "Gender": "Male", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["generative", "long-form", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Danielle", "Name": "Danielle", "Gender": "Female", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["generative", "long-form", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Gregory", "Name": "Gregory", "Gender": "Male", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["long-form", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Joanna", "Name": "Joanna", "Gender": "Female", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Stephen", "Name": "Stephen", "Gender": "Male", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Patrick", "Name": "Patrick", "Gender": "Male", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["long-form"], "AdditionalLanguageCodes": []},
    {"Id": "Salli", "Name": "Salli", "Gender": "Female", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Kimberly", "Name": "Kimberly", "Gender": "Female", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Kendra", "Name": "Kendra", "Gender": "Female", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Ivy", "Name": "Ivy", "Gender": "Female", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Kevin", "Name": "Kevin", "Gender": "Male", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Justin", "Name": "Justin", "Gender": "Male", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Joey", "Name": "Joey", "Gender": "Male", "LanguageCode": "en-US", "LanguageName": "US English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Amy", "Name": "Amy", "Gender": "Female", "LanguageCode": "en-GB", "LanguageName": "British English", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Brian", "Name": "Brian", "Gender": "Male", "LanguageCode": "en-GB", "LanguageName": "British English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Emma", "Name": "Emma", "Gender": "Female", "LanguageCode": "en-GB", "LanguageName": "British English", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Arthur", "Name": "Arthur", "Gender": "Male", "LanguageCode": "en-GB", "LanguageName": "British English", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Olivia", "Name": "Olivia", "Gender": "Female", "LanguageCode": "en-AU", "LanguageName": "Australian English", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Kajal", "Name": "Kajal", "Gender": "Female", "LanguageCode": "en-IN", "LanguageName": "Indian English", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": ["hi-IN"]},
    {"Id": "Aria", "Name": "Aria", "Gender": "Female", "LanguageCode": "en-NZ", "LanguageName": "New Zealand English", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Ayanda", "Name": "Ayanda", "Gender": "Female", "LanguageCode": "en-ZA", "LanguageName": "South African English", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Niamh", "Name": "Niamh", "Gender": "Female", "LanguageCode": "en-IE", "LanguageName": "Irish English", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Lupe", "Name": "Lupe", "Gender": "Female", "LanguageCode": "es-US", "LanguageName": "US Spanish", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Pedro", "Name": "Pedro", "Gender": "Male", "LanguageCode": "es-US", "LanguageName": "US Spanish", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Lucia", "Name": "Lucia", "Gender": "Female", "LanguageCode": "es-ES", "LanguageName": "Castilian Spanish", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Sergio", "Name": "Sergio", "Gender": "Male", "LanguageCode": "es-ES", "LanguageName": "Castilian Spanish", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Mia", "Name": "Mia", "Gender": "Female", "LanguageCode": "es-MX", "LanguageName": "Mexican Spanish", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Andres", "Name": "Andrés", "Gender": "Male", "LanguageCode": "es-MX", "LanguageName": "Mexican Spanish", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Lea", "Name": "Léa", "Gender": "Female", "LanguageCode": "fr-FR", "LanguageName": "French", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Remi", "Name": "Rémi", "Gender": "Male", "LanguageCode": "fr-FR", "LanguageName": "French", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Gabrielle", "Name": "Gabrielle", "Gender": "Female", "LanguageCode": "fr-CA", "LanguageName": "Canadian French", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Liam", "Name": "Liam", "Gender": "Male", "LanguageCode": "fr-CA", "LanguageName": "Canadian French", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Vicki", "Name": "Vicki", "Gender": "Female", "LanguageCode": "de-DE", "LanguageName": "German", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Daniel", "Name": "Daniel", "Gender": "Male", "LanguageCode": "de-DE", "LanguageName": "German", "SupportedEngines": ["generative", "neural"], "AdditionalLanguageCodes": []},
    {"Id": "Bianca", "Name": "Bianca", "Gender": "Female", "LanguageCode": "it-IT", "LanguageName": "Italian", "SupportedEngines": ["generative", "neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Adriano", "Name": "Adriano", "Gender": "Male", "LanguageCode": "it-IT", "LanguageName": "Italian", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Camila", "Name": "Camila", "Gender": "Female", "LanguageCode": "pt-BR", "LanguageName": "Brazilian Portuguese", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Thiago", "Name": "Thiago", "Gender": "Male", "LanguageCode": "pt-BR", "LanguageName": "Brazilian Portuguese", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Takumi", "Name": "Takumi", "Gender": "Male", "LanguageCode": "ja-JP", "LanguageName": "Japanese", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Kazuha", "Name": "Kazuha", "Gender": "Female", "LanguageCode": "ja-JP", "LanguageName": "Japanese", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Tomoko", "Name": "Tomoko", "Gender": "Female", "LanguageCode": "ja-JP", "LanguageName": "Japanese", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Seoyeon", "Name": "Seoyeon", "Gender": "Female", "LanguageCode": "ko-KR", "LanguageName": "Korean", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Zhiyu", "Name": "Zhiyu", "Gender": "Female", "LanguageCode": "cmn-CN", "LanguageName": "Chinese Mandarin", "SupportedEngines": ["neural", "standard"], "AdditionalLanguageCodes": []},
    {"Id": "Hala", "Name": "Hala", "Gender": "Female", "LanguageCode": "ar-AE", "LanguageName": "Arabic (Gulf)", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
    {"Id": "Zayd", "Name": "Zayd", "Gender": "Male", "LanguageCode": "ar-AE", "LanguageName": "Arabic (Gulf)", "SupportedEngines": ["neural"], "AdditionalLanguageCodes": []},
]

SAMPLE_GREETINGS: dict[str, str] = {
    "en": "Hello! I am {name}, an Amazon Polly {engine} voice ready to narrate your video workflow.",
    "es": "¡Hola! Soy {name}, una voz de Amazon Polly lista para dar vida a tus proyectos de video.",
    "fr": "Bonjour ! Je suis {name}, une voix Amazon Polly prête à accompagner vos créations vidéo.",
    "de": "Hallo! Ich bin {name}, eine Stimme von Amazon Polly für Ihre Videoproduktion.",
    "it": "Ciao! Sono {name}, una voce di Amazon Polly pronta per i tuoi progetti video.",
    "pt": "Olá! Eu sou {name}, uma voz da Amazon Polly pronta para narrar seus vídeos.",
    "ja": "こんにちは。私はAmazon Pollyの{name}です。動画のナレーションをお手伝いします。",
    "ko": "안녕하세요! 저는 비디오 프로젝트를 위한 아마존 폴리 음성 {name}입니다.",
    "cmn": "您好！我是 Amazon Polly 语音 {name}，随时准备为您的视频配音。",
    "hi": "नमस्ते! मैं {name} हूँ, आपके वीडियो प्रोजेक्ट्स के लिए अमेज़न पॉली की आवाज़।",
    "ar": "مرحباً! أنا {name}، صوت من أمازون بولي جاهز لتسجيل مقاطع الفيديو الخاصة بك.",
}

# Cache for DescribeVoices: key = (region, include_additional) -> (timestamp, voices_list)
_VOICES_CACHE: dict[tuple[str, bool], tuple[float, list[dict[str, Any]]]] = {}
_VOICES_CACHE_TTL = 600.0

SSML_TAG_RE = re.compile(r"<[^>]+>")


def _load_history() -> list[dict[str, Any]]:
    try:
        if HISTORY_FILE.exists():
            data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []


def _save_history(items: list[dict[str, Any]]) -> None:
    try:
        OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
        HISTORY_FILE.write_text(
            json.dumps(items[:MAX_HISTORY_ITEMS], indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass


HISTORY: list[dict[str, Any]] = _load_history()


def _prune_old_outputs() -> None:
    """Keep disk usage bounded on t3.small by pruning unreferenced output files beyond MAX_HISTORY_ITEMS."""
    try:
        referenced = {
            item.get("filename")
            for item in HISTORY[:MAX_HISTORY_ITEMS]
            if item.get("filename")
        }
        files = sorted(
            [p for p in OUTPUTS_DIR.iterdir() if p.is_file() and p.name != "history.json"],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for fpath in files[MAX_HISTORY_ITEMS * 2 :]:
            if fpath.name not in referenced:
                fpath.unlink(missing_ok=True)
    except Exception:
        pass


def normalize_region(region: str | None) -> str:
    candidate = (region or "").strip() or DEFAULT_AWS_REGION
    if not re.match(r"^[a-z]{2}(-[a-z]+)+-\d+$", candidate):
        return DEFAULT_AWS_REGION
    return candidate


def get_polly_client(region: str | None = None):
    target_region = normalize_region(region)
    boto_cfg = BotoConfig(
        region_name=target_region,
        connect_timeout=8,
        read_timeout=30,
        retries={"max_attempts": 2, "mode": "standard"},
    )
    return boto3.client("polly", region_name=target_region, config=boto_cfg)


def inspect_aws_credentials(region: str | None = None) -> dict[str, Any]:
    target_region = normalize_region(region)
    try:
        session = boto3.Session(region_name=target_region)
        creds = session.get_credentials()
        if creds is None:
            return {
                "configured": False,
                "source": "unconfigured",
                "region": target_region,
                "default_region": DEFAULT_AWS_REGION,
                "access_key_hint": None,
                "s3_bucket": DEFAULT_POLLY_S3_BUCKET,
                "s3_prefix": DEFAULT_POLLY_S3_PREFIX,
            }
        frozen = creds.get_frozen_credentials()
        if not frozen or not frozen.access_key:
            return {
                "configured": False,
                "source": "unconfigured",
                "region": target_region,
                "default_region": DEFAULT_AWS_REGION,
                "access_key_hint": None,
                "s3_bucket": DEFAULT_POLLY_S3_BUCKET,
                "s3_prefix": DEFAULT_POLLY_S3_PREFIX,
            }
        key = frozen.access_key
        masked = f"{key[:4]}…{key[-4:]}" if len(key) >= 8 else "configured"
        method = getattr(creds, "method", "boto3-chain")
        return {
            "configured": True,
            "source": method,
            "region": target_region,
            "default_region": DEFAULT_AWS_REGION,
            "access_key_hint": masked,
            "s3_bucket": DEFAULT_POLLY_S3_BUCKET,
            "s3_prefix": DEFAULT_POLLY_S3_PREFIX,
        }
    except Exception:
        return {
            "configured": False,
            "source": "unconfigured",
            "region": target_region,
            "default_region": DEFAULT_AWS_REGION,
            "access_key_hint": None,
            "s3_bucket": DEFAULT_POLLY_S3_BUCKET,
            "s3_prefix": DEFAULT_POLLY_S3_PREFIX,
        }


def wrap_pcm_as_wav(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    """Wrap raw 16-bit signed little-endian mono PCM bytes from Amazon Polly into a RIFF WAV file."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit signed integer
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


def strip_ssml_tags(text: str) -> str:
    return SSML_TAG_RE.sub("", text)


def count_billed_characters(text: str, text_type: str) -> int:
    if text_type == "ssml":
        return len(strip_ssml_tags(text))
    return len(text)


def format_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.2f} MB"


class ProsodyOverrides(BaseModel):
    rate: str = Field(default="100%", description="x-slow, slow, medium, fast, x-fast, or percentage e.g. 100%")
    pitch: str = Field(default="0%", description="default, x-low, low, medium, high, x-high, or +/-% (not supported on generative)")
    volume: str = Field(default="default", description="default, silent, x-soft, soft, medium, loud, x-loud, or +/-dB")
    domain: str = Field(default="none", description="none, news, conversational (neural only)")
    effect_drc: bool = Field(default=False, description="Dynamic range compression (neural/standard)")
    effect_whispered: bool = Field(default=False, description="Whispered speech (standard only)")
    effect_soft: bool = Field(default=False, description="Soft phonation (standard only)")
    vocal_tract_length: str = Field(default="default", description="default or e.g. +10%, -10% (standard only)")
    auto_breaths: bool = Field(default=False, description="Automatic breathing sounds (standard only)")


def compose_effective_text(
    text: str,
    text_type: str,
    engine: str,
    prosody: ProsodyOverrides | None,
) -> tuple[str, str]:
    """
    Return `(effective_text, effective_text_type)`.
    If `text_type == 'ssml'`, ensures `<speak>...</speak>` wrapper exists.
    If `text_type == 'text'` and any prosody/style override is non-default, builds engine-safe SSML.
    """
    raw = text.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    if text_type == "ssml":
        if not raw.lower().startswith("<speak"):
            raw = f"<speak>{raw}</speak>"
        return raw, "ssml"

    if prosody is None:
        return raw, "text"

    has_rate = prosody.rate and prosody.rate not in ("100%", "medium", "default")
    has_pitch = (
        engine in ("neural", "standard")
        and prosody.pitch
        and prosody.pitch not in ("0%", "+0%", "-0%", "medium", "default")
    )
    has_volume = prosody.volume and prosody.volume not in ("default", "medium", "0dB")
    has_domain = engine == "neural" and prosody.domain in ("news", "conversational")
    has_drc = engine in ("neural", "standard") and prosody.effect_drc
    has_whispered = engine == "standard" and prosody.effect_whispered
    has_soft = engine == "standard" and prosody.effect_soft
    has_timbre = (
        engine == "standard"
        and prosody.vocal_tract_length
        and prosody.vocal_tract_length not in ("default", "100%", "0%")
    )
    has_breaths = engine == "standard" and prosody.auto_breaths

    if not any(
        (
            has_rate,
            has_pitch,
            has_volume,
            has_domain,
            has_drc,
            has_whispered,
            has_soft,
            has_timbre,
            has_breaths,
        )
    ):
        return raw, "text"

    inner = xml_escape(raw)

    if has_whispered:
        inner = f'<amazon:effect name="whispered">{inner}</amazon:effect>'
    if has_soft:
        inner = f'<amazon:effect phonation="soft">{inner}</amazon:effect>'
    if has_timbre:
        vtl = xml_escape(prosody.vocal_tract_length)
        inner = f'<amazon:effect vocal-tract-length="{vtl}">{inner}</amazon:effect>'
    if has_breaths:
        inner = f'<amazon:auto-breaths volume="medium" frequency="medium" duration="medium">{inner}</amazon:auto-breaths>'
    if has_rate or has_pitch or has_volume:
        attrs: list[str] = []
        if has_rate:
            attrs.append(f'rate="{xml_escape(prosody.rate)}"')
        if has_pitch:
            attrs.append(f'pitch="{xml_escape(prosody.pitch)}"')
        if has_volume:
            attrs.append(f'volume="{xml_escape(prosody.volume)}"')
        attr_str = " ".join(attrs)
        inner = f"<prosody {attr_str}>{inner}</prosody>"
    if has_domain:
        inner = f'<amazon:domain name="{xml_escape(prosody.domain)}">{inner}</amazon:domain>'
    if has_drc:
        inner = f'<amazon:effect name="drc">{inner}</amazon:effect>'

    return f"<speak>{inner}</speak>", "ssml"


def validate_polly_params(
    *,
    engine: str,
    output_format: str,
    sample_rate: str,
    speech_mark_types: list[str],
    lexicon_names: list[str],
) -> tuple[str, str, list[str]]:
    """Validate and normalize `(polly_output_format, sample_rate, speech_mark_types)`."""
    engine_meta = next((e for e in POLLY_ENGINES if e["id"] == engine), None)
    if not engine_meta:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported engine '{engine}'. Choose from: generative, neural, long-form, standard.",
        )

    fmt_meta = next((f for f in OUTPUT_FORMATS if f["id"] == output_format), None)
    if not fmt_meta:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported output_format '{output_format}'. Choose from: mp3, wav, ogg_vorbis, pcm, json.",
        )

    if len(lexicon_names) > 5:
        raise HTTPException(
            status_code=400,
            detail="Amazon Polly allows up to 5 LexiconNames per request.",
        )

    polly_format = fmt_meta["polly_format"]
    allowed_rates = engine_meta["sample_rates"].get(output_format, [])
    norm_rate = (sample_rate or "").strip()
    if output_format == "json":
        norm_rate = ""
    elif norm_rate and norm_rate not in allowed_rates:
        norm_rate = (
            fmt_meta["default_sample_rate"]
            if fmt_meta["default_sample_rate"] in allowed_rates
            else (allowed_rates[-1] if allowed_rates else "")
        )
    elif not norm_rate and allowed_rates:
        default_eng_rate = engine_meta["default_sample_rate"]
        norm_rate = (
            default_eng_rate
            if default_eng_rate in allowed_rates
            else allowed_rates[-1]
        )

    valid_marks = [m for m in speech_mark_types if m in ("sentence", "word", "viseme", "ssml")]
    if output_format == "json" and not valid_marks:
        valid_marks = ["word", "sentence"]

    return polly_format, norm_rate, valid_marks


def parse_speech_marks_stream(raw_bytes: bytes) -> list[dict[str, Any]]:
    marks: list[dict[str, Any]] = []
    text = raw_bytes.decode("utf-8", errors="replace")
    for line in text.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        try:
            marks.append(json.loads(line_str))
        except json.JSONDecodeError:
            continue
    return marks


def _fetch_voices_sync(
    region: str, include_additional: bool = True
) -> tuple[list[dict[str, Any]], str, str | None]:
    cache_key = (region, include_additional)
    now = time.time()
    cached = _VOICES_CACHE.get(cache_key)
    if cached and (now - cached[0]) < _VOICES_CACHE_TTL:
        return cached[1], "aws-live", None

    try:
        client = get_polly_client(region)
        voices: list[dict[str, Any]] = []
        next_token: str | None = None
        while True:
            kwargs: dict[str, Any] = {
                "IncludeAdditionalLanguageCodes": include_additional
            }
            if next_token:
                kwargs["NextToken"] = next_token
            resp = client.describe_voices(**kwargs)
            voices.extend(resp.get("Voices") or [])
            next_token = resp.get("NextToken")
            if not next_token:
                break

        voices.sort(key=lambda v: (v.get("LanguageName", ""), v.get("Name", "")))
        _VOICES_CACHE[cache_key] = (now, voices)
        return voices, "aws-live", None
    except (NoCredentialsError, BotoCoreError, ClientError) as exc:
        return FALLBACK_VOICES, "fallback-catalog", str(exc)


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=12000)
    text_type: str = Field(default="text", pattern="^(text|ssml)$")
    voice_id: str = Field(default="Ruth", min_length=1)
    engine: str = Field(default="generative", pattern="^(generative|long-form|neural|standard)$")
    region: str = Field(default=DEFAULT_AWS_REGION)
    output_format: str = Field(default="mp3", pattern="^(mp3|wav|ogg_vorbis|pcm|json)$")
    sample_rate: str = Field(default="24000")
    language_code: str = Field(default="")
    lexicon_names: list[str] = Field(default_factory=list)
    speech_mark_types: list[str] = Field(default_factory=lambda: ["viseme", "word", "sentence"])
    include_speech_marks: bool = Field(default=True)
    prosody: ProsodyOverrides | None = Field(default=None)
    title: str = Field(default="")


class PreviewVoiceRequest(BaseModel):
    voice_id: str = Field(..., min_length=1)
    engine: str = Field(default="neural")
    region: str = Field(default=DEFAULT_AWS_REGION)
    language_code: str = Field(default="en-US")
    text: str = Field(default="")


class AsyncSynthesisTaskRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=200000)
    text_type: str = Field(default="text", pattern="^(text|ssml)$")
    voice_id: str = Field(default="Ruth", min_length=1)
    engine: str = Field(default="long-form", pattern="^(generative|long-form|neural|standard)$")
    region: str = Field(default=DEFAULT_AWS_REGION)
    output_format: str = Field(default="mp3", pattern="^(mp3|ogg_vorbis|pcm|json)$")
    sample_rate: str = Field(default="24000")
    language_code: str = Field(default="")
    lexicon_names: list[str] = Field(default_factory=list)
    speech_mark_types: list[str] = Field(default_factory=list)
    output_s3_bucket_name: str = Field(default="")
    output_s3_key_prefix: str = Field(default="")
    sns_topic_arn: str = Field(default="")


class PutLexiconRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=20, pattern="^[0-9A-Za-z]{1,20}$")
    content: str = Field(..., min_length=10)
    region: str = Field(default=DEFAULT_AWS_REGION)


app = FastAPI(title="Amazon Polly Voice Generation Studio")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")


@app.middleware("http")
async def disable_frontend_caching(request: Request, call_next) -> Response:
    response = await call_next(request)
    if request.url.path.endswith("/") or "/static/" in request.url.path:
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.get("/")
async def serve_index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health")
async def health_check() -> dict[str, Any]:
    return {"status": "healthy", "service": "polly-studio"}


@app.get("/api/status")
async def api_status(region: str = Query(default=DEFAULT_AWS_REGION)) -> dict[str, Any]:
    norm_region = normalize_region(region)
    cred_info = inspect_aws_credentials(norm_region)
    return {
        "status": "ready" if cred_info["configured"] else "credentials_missing",
        "aws": cred_info,
        "history_count": len(HISTORY),
    }


@app.get("/api/options")
async def api_options() -> dict[str, Any]:
    return {
        "default_region": DEFAULT_AWS_REGION,
        "default_s3_bucket": DEFAULT_POLLY_S3_BUCKET,
        "default_s3_prefix": DEFAULT_POLLY_S3_PREFIX,
        "regions": POLLY_REGIONS,
        "engines": POLLY_ENGINES,
        "output_formats": OUTPUT_FORMATS,
        "speech_mark_types": SPEECH_MARK_TYPES,
        "ssml_snippets": SSML_SNIPPETS,
        "limits": {
            "sync_billed_chars": 3000,
            "sync_total_chars": 6000,
            "async_billed_chars": 100000,
            "async_total_chars": 200000,
            "max_lexicons": 5,
        },
    }


@app.get("/api/voices")
async def api_voices(
    region: str = Query(default=DEFAULT_AWS_REGION),
    engine: str = Query(default=""),
    language_code: str = Query(default=""),
    gender: str = Query(default=""),
    search: str = Query(default=""),
    include_additional: bool = Query(default=True),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    norm_region = normalize_region(region)
    if refresh:
        _VOICES_CACHE.pop((norm_region, include_additional), None)

    loop = asyncio.get_running_loop()
    all_voices, source, warning = await loop.run_in_executor(
        _EXECUTOR, _fetch_voices_sync, norm_region, include_additional
    )

    # Collect available languages across all voices in this region
    languages_map: dict[str, dict[str, Any]] = {}
    engine_counts: dict[str, int] = {
        "generative": 0,
        "long-form": 0,
        "neural": 0,
        "standard": 0,
    }
    for v in all_voices:
        lc = v.get("LanguageCode", "")
        ln = v.get("LanguageName", lc)
        if lc and lc not in languages_map:
            languages_map[lc] = {"code": lc, "name": ln, "count": 0}
        if lc:
            languages_map[lc]["count"] += 1
        for eng in v.get("SupportedEngines") or []:
            if eng in engine_counts:
                engine_counts[eng] += 1

    filtered = all_voices
    if engine:
        filtered = [
            v for v in filtered if engine in (v.get("SupportedEngines") or [])
        ]
    if language_code:
        filtered = [
            v
            for v in filtered
            if v.get("LanguageCode") == language_code
            or (
                include_additional
                and language_code in (v.get("AdditionalLanguageCodes") or [])
            )
        ]
    if gender:
        filtered = [
            v
            for v in filtered
            if (v.get("Gender") or "").lower() == gender.lower()
        ]
    if search.strip():
        q = search.strip().lower()
        filtered = [
            v
            for v in filtered
            if q in (v.get("Name") or "").lower()
            or q in (v.get("Id") or "").lower()
            or q in (v.get("LanguageName") or "").lower()
            or q in (v.get("LanguageCode") or "").lower()
        ]

    languages = sorted(languages_map.values(), key=lambda x: x["name"])
    return {
        "region": norm_region,
        "source": source,
        "warning": warning,
        "total_count": len(all_voices),
        "filtered_count": len(filtered),
        "engine_counts": engine_counts,
        "languages": languages,
        "voices": filtered,
    }


def _synthesize_sync(req: SynthesizeRequest) -> dict[str, Any]:
    norm_region = normalize_region(req.region)
    effective_text, effective_text_type = compose_effective_text(
        req.text, req.text_type, req.engine, req.prosody
    )
    billed_chars = count_billed_characters(effective_text, effective_text_type)
    total_chars = len(effective_text)

    if billed_chars > 3000 or total_chars > 6000:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Real-time SynthesizeSpeech supports up to 3,000 billed characters "
                f"(6,000 total with SSML). Current: {billed_chars} billed / {total_chars} total. "
                f"Use the 'Long-Form S3 Async Task' tab for texts up to 100,000 characters."
            ),
        )

    polly_format, norm_rate, valid_marks = validate_polly_params(
        engine=req.engine,
        output_format=req.output_format,
        sample_rate=req.sample_rate,
        speech_mark_types=req.speech_mark_types,
        lexicon_names=req.lexicon_names,
    )

    client = get_polly_client(norm_region)
    call_kwargs: dict[str, Any] = {
        "Engine": req.engine,
        "OutputFormat": polly_format,
        "Text": effective_text,
        "TextType": effective_text_type,
        "VoiceId": req.voice_id,
    }
    if norm_rate:
        call_kwargs["SampleRate"] = norm_rate
    if req.language_code.strip():
        call_kwargs["LanguageCode"] = req.language_code.strip()
    if req.lexicon_names:
        call_kwargs["LexiconNames"] = req.lexicon_names
    if polly_format == "json":
        call_kwargs["SpeechMarkTypes"] = valid_marks

    try:
        response = client.synthesize_speech(**call_kwargs)
    except NoCredentialsError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "AWS credentials are not configured on the server. "
                "Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_DEFAULT_REGION to backend/.env "
                "or attach an IAM Role with AmazonPollyFullAccess to the EC2 instance."
            ),
        ) from exc
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=400, detail=f"Amazon Polly error: {exc}") from exc

    stream = response.get("AudioStream")
    raw_bytes = stream.read() if stream else b""
    if stream:
        stream.close()

    request_chars = int(response.get("RequestCharacters") or billed_chars)
    fmt_meta = next(f for f in OUTPUT_FORMATS if f["id"] == req.output_format)
    item_id = uuid.uuid4().hex[:12]
    ext = fmt_meta["ext"]
    filename = f"polly_{req.voice_id.lower()}_{req.engine}_{item_id}.{ext}"
    output_path = OUTPUTS_DIR / filename

    speech_marks: list[dict[str, Any]] = []
    if req.output_format == "wav":
        wav_bytes = wrap_pcm_as_wav(raw_bytes, int(norm_rate or 16000))
        output_path.write_bytes(wav_bytes)
        file_size = len(wav_bytes)
    elif req.output_format == "json":
        speech_marks = parse_speech_marks_stream(raw_bytes)
        output_path.write_text(
            json.dumps(speech_marks, indent=2), encoding="utf-8"
        )
        file_size = output_path.stat().st_size
    else:
        output_path.write_bytes(raw_bytes)
        file_size = len(raw_bytes)

    # Optionally fetch companion Speech Marks alongside audio synthesis
    speech_marks_warning: str | None = None
    if req.output_format != "json" and req.include_speech_marks and valid_marks:
        engine_meta = next(e for e in POLLY_ENGINES if e["id"] == req.engine)
        compatible_marks = [
            m for m in valid_marks if m in engine_meta["speech_mark_types"]
        ]
        if compatible_marks:
            marks_kwargs: dict[str, Any] = {
                "Engine": req.engine,
                "OutputFormat": "json",
                "Text": effective_text,
                "TextType": effective_text_type,
                "VoiceId": req.voice_id,
                "SpeechMarkTypes": compatible_marks,
            }
            if req.language_code.strip():
                marks_kwargs["LanguageCode"] = req.language_code.strip()
            if req.lexicon_names:
                marks_kwargs["LexiconNames"] = req.lexicon_names
            try:
                marks_resp = client.synthesize_speech(**marks_kwargs)
                marks_stream = marks_resp.get("AudioStream")
                marks_bytes = marks_stream.read() if marks_stream else b""
                if marks_stream:
                    marks_stream.close()
                speech_marks = parse_speech_marks_stream(marks_bytes)
            except Exception as exc:
                speech_marks_warning = f"Audio succeeded, speech marks skipped: {exc}"

    created_iso = datetime.now(timezone.utc).isoformat()
    word_count = max(1, len(strip_ssml_tags(effective_text).split()))
    duration_est = round(
        (speech_marks[-1]["time"] / 1000.0 + 0.35)
        if speech_marks and isinstance(speech_marks[-1].get("time"), (int, float))
        else max(1.0, (word_count / 2.6)),
        1,
    )

    snippet = strip_ssml_tags(effective_text).strip()
    title = req.title.strip() or (snippet[:64] + ("…" if len(snippet) > 64 else ""))

    record: dict[str, Any] = {
        "id": item_id,
        "title": title,
        "filename": filename,
        "url": f"api/output/{filename}",
        "download_url": f"api/output/{filename}?download=1",
        "api_url": f"/api/polly/api/output/{filename}",
        "server_path": str(output_path.resolve()),
        "media_type": fmt_meta["media_type"],
        "voice_id": req.voice_id,
        "engine": req.engine,
        "region": norm_region,
        "output_format": req.output_format,
        "sample_rate": norm_rate,
        "language_code": req.language_code.strip() or None,
        "lexicon_names": req.lexicon_names,
        "text": req.text,
        "text_type": req.text_type,
        "effective_text": effective_text,
        "effective_text_type": effective_text_type,
        "billed_characters": billed_chars,
        "total_characters": total_chars,
        "request_characters": request_chars,
        "size_bytes": file_size,
        "size_display": format_size(file_size),
        "duration_estimate_seconds": duration_est,
        "speech_marks": speech_marks,
        "speech_marks_count": len(speech_marks),
        "speech_marks_warning": speech_marks_warning,
        "created_at": created_iso,
    }

    HISTORY.insert(0, record)
    del HISTORY[MAX_HISTORY_ITEMS:]
    _save_history(HISTORY)
    _prune_old_outputs()
    return record


@app.post("/api/synthesize")
async def api_synthesize(req: SynthesizeRequest) -> dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _synthesize_sync, req)


def _preview_voice_sync(req: PreviewVoiceRequest) -> dict[str, Any]:
    norm_region = normalize_region(req.region)
    safe_voice = re.sub(r"[^a-zA-Z0-9_-]", "", req.voice_id)
    safe_engine = re.sub(r"[^a-zA-Z0-9_-]", "", req.engine)
    preview_filename = f"preview_{norm_region}_{safe_voice}_{safe_engine}.mp3"
    preview_path = PREVIEWS_DIR / preview_filename

    if not req.text.strip() and preview_path.exists() and preview_path.stat().st_size > 0:
        return {
            "voice_id": req.voice_id,
            "engine": req.engine,
            "region": norm_region,
            "cached": True,
            "url": f"api/output/previews/{preview_filename}",
        }

    lang_prefix = (req.language_code or "en-US").split("-")[0].lower()
    template = SAMPLE_GREETINGS.get(lang_prefix, SAMPLE_GREETINGS["en"])
    sample_text = req.text.strip() or template.format(
        name=req.voice_id, engine=req.engine
    )

    client = get_polly_client(norm_region)
    try:
        resp = client.synthesize_speech(
            Engine=req.engine,
            OutputFormat="mp3",
            SampleRate="24000" if req.engine != "standard" else "22050",
            Text=sample_text,
            TextType="text",
            VoiceId=req.voice_id,
        )
    except NoCredentialsError as exc:
        raise HTTPException(
            status_code=503,
            detail="AWS credentials are not configured on the server.",
        ) from exc
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=400, detail=f"Amazon Polly preview error: {exc}") from exc

    stream = resp.get("AudioStream")
    audio_bytes = stream.read() if stream else b""
    if stream:
        stream.close()

    if not req.text.strip():
        preview_path.write_bytes(audio_bytes)
        return {
            "voice_id": req.voice_id,
            "engine": req.engine,
            "region": norm_region,
            "cached": False,
            "url": f"api/output/previews/{preview_filename}",
        }

    temp_name = f"preview_custom_{uuid.uuid4().hex[:8]}.mp3"
    (PREVIEWS_DIR / temp_name).write_bytes(audio_bytes)
    return {
        "voice_id": req.voice_id,
        "engine": req.engine,
        "region": norm_region,
        "cached": False,
        "url": f"api/output/previews/{temp_name}",
    }


@app.post("/api/preview")
async def api_preview(req: PreviewVoiceRequest) -> dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _preview_voice_sync, req)


@app.get("/api/history")
async def api_history() -> dict[str, Any]:
    return {"items": HISTORY}


@app.delete("/api/history/{item_id}")
async def api_delete_history(item_id: str) -> dict[str, Any]:
    idx = next((i for i, item in enumerate(HISTORY) if item.get("id") == item_id), -1)
    if idx < 0:
        raise HTTPException(status_code=404, detail="History item not found.")
    removed = HISTORY.pop(idx)
    fname = removed.get("filename")
    if fname:
        (OUTPUTS_DIR / Path(fname).name).unlink(missing_ok=True)
    _save_history(HISTORY)
    return {"deleted": item_id}


def _start_async_task_sync(req: AsyncSynthesisTaskRequest) -> dict[str, Any]:
    norm_region = normalize_region(req.region)
    bucket = req.output_s3_bucket_name.strip() or DEFAULT_POLLY_S3_BUCKET
    if not bucket:
        raise HTTPException(
            status_code=400,
            detail="An S3 bucket name is required for StartSpeechSynthesisTask (provide OutputS3BucketName or set POLLY_S3_BUCKET_NAME in backend/.env).",
        )

    polly_format, norm_rate, valid_marks = validate_polly_params(
        engine=req.engine,
        output_format=req.output_format,
        sample_rate=req.sample_rate,
        speech_mark_types=req.speech_mark_types,
        lexicon_names=req.lexicon_names,
    )

    client = get_polly_client(norm_region)
    kwargs: dict[str, Any] = {
        "Engine": req.engine,
        "OutputFormat": polly_format,
        "OutputS3BucketName": bucket,
        "Text": req.text,
        "TextType": req.text_type,
        "VoiceId": req.voice_id,
    }
    prefix = req.output_s3_key_prefix.strip() or DEFAULT_POLLY_S3_PREFIX
    if prefix:
        kwargs["OutputS3KeyPrefix"] = prefix
    if norm_rate:
        kwargs["SampleRate"] = norm_rate
    if req.language_code.strip():
        kwargs["LanguageCode"] = req.language_code.strip()
    if req.lexicon_names:
        kwargs["LexiconNames"] = req.lexicon_names
    if polly_format == "json" and valid_marks:
        kwargs["SpeechMarkTypes"] = valid_marks
    if req.sns_topic_arn.strip():
        kwargs["SnsTopicArn"] = req.sns_topic_arn.strip()

    try:
        resp = client.start_speech_synthesis_task(**kwargs)
    except NoCredentialsError as exc:
        raise HTTPException(
            status_code=503, detail="AWS credentials are not configured on the server."
        ) from exc
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(
            status_code=400, detail=f"StartSpeechSynthesisTask failed: {exc}"
        ) from exc

    task = resp.get("SynthesisTask") or {}
    return _serialize_synthesis_task(task, norm_region)


def _serialize_synthesis_task(task: dict[str, Any], region: str) -> dict[str, Any]:
    creation = task.get("CreationTime")
    return {
        "task_id": task.get("TaskId"),
        "task_status": task.get("TaskStatus"),
        "task_status_reason": task.get("TaskStatusReason"),
        "output_uri": task.get("OutputUri"),
        "creation_time": creation.isoformat() if hasattr(creation, "isoformat") else str(creation or ""),
        "request_characters": task.get("RequestCharacters"),
        "sns_topic_arn": task.get("SnsTopicArn"),
        "lexicon_names": task.get("LexiconNames") or [],
        "output_format": task.get("OutputFormat"),
        "sample_rate": task.get("SampleRate"),
        "speech_mark_types": task.get("SpeechMarkTypes") or [],
        "text_type": task.get("TextType"),
        "voice_id": task.get("VoiceId"),
        "language_code": task.get("LanguageCode"),
        "engine": task.get("Engine"),
        "region": region,
    }


@app.post("/api/tasks")
async def api_start_task(req: AsyncSynthesisTaskRequest) -> dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _start_async_task_sync, req)


@app.get("/api/tasks")
async def api_list_tasks(
    region: str = Query(default=DEFAULT_AWS_REGION),
    status: str = Query(default=""),
) -> dict[str, Any]:
    norm_region = normalize_region(region)

    def _list() -> dict[str, Any]:
        client = get_polly_client(norm_region)
        kwargs: dict[str, Any] = {"MaxResults": 25}
        if status in ("scheduled", "inProgress", "completed", "failed"):
            kwargs["Status"] = status
        try:
            resp = client.list_speech_synthesis_tasks(**kwargs)
            tasks = [
                _serialize_synthesis_task(t, norm_region)
                for t in (resp.get("SynthesisTasks") or [])
            ]
            return {"region": norm_region, "tasks": tasks}
        except (NoCredentialsError, BotoCoreError, ClientError) as exc:
            return {"region": norm_region, "tasks": [], "warning": str(exc)}

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _list)


@app.get("/api/tasks/{task_id}")
async def api_get_task(
    task_id: str, region: str = Query(default=DEFAULT_AWS_REGION)
) -> dict[str, Any]:
    norm_region = normalize_region(region)

    def _get() -> dict[str, Any]:
        client = get_polly_client(norm_region)
        try:
            resp = client.get_speech_synthesis_task(TaskId=task_id)
            return _serialize_synthesis_task(
                resp.get("SynthesisTask") or {}, norm_region
            )
        except (NoCredentialsError, BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _get)


@app.get("/api/lexicons")
async def api_list_lexicons(
    region: str = Query(default=DEFAULT_AWS_REGION),
) -> dict[str, Any]:
    norm_region = normalize_region(region)

    def _list() -> dict[str, Any]:
        client = get_polly_client(norm_region)
        try:
            resp = client.list_lexicons()
            items = []
            for lex in resp.get("Lexicons") or []:
                attrs = lex.get("Attributes") or {}
                last_mod = attrs.get("LastModified")
                items.append(
                    {
                        "name": lex.get("Name"),
                        "alphabet": attrs.get("Alphabet"),
                        "language_code": attrs.get("LanguageCode"),
                        "lexemes_count": attrs.get("LexemesCount"),
                        "lexicon_arn": attrs.get("LexiconArn"),
                        "size": attrs.get("Size"),
                        "last_modified": (
                            last_mod.isoformat()
                            if hasattr(last_mod, "isoformat")
                            else str(last_mod or "")
                        ),
                    }
                )
            return {"region": norm_region, "lexicons": items}
        except (NoCredentialsError, BotoCoreError, ClientError) as exc:
            return {"region": norm_region, "lexicons": [], "warning": str(exc)}

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _list)


@app.get("/api/lexicons/{name}")
async def api_get_lexicon(
    name: str, region: str = Query(default=DEFAULT_AWS_REGION)
) -> dict[str, Any]:
    norm_region = normalize_region(region)

    def _get() -> dict[str, Any]:
        client = get_polly_client(norm_region)
        try:
            resp = client.get_lexicon(Name=name)
            lex = resp.get("Lexicon") or {}
            attrs = resp.get("LexiconAttributes") or {}
            return {
                "name": lex.get("Name", name),
                "content": lex.get("Content", ""),
                "alphabet": attrs.get("Alphabet"),
                "language_code": attrs.get("LanguageCode"),
                "lexemes_count": attrs.get("LexemesCount"),
                "size": attrs.get("Size"),
            }
        except (NoCredentialsError, BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _get)


@app.post("/api/lexicons")
async def api_put_lexicon(req: PutLexiconRequest) -> dict[str, Any]:
    norm_region = normalize_region(req.region)

    def _put() -> dict[str, Any]:
        client = get_polly_client(norm_region)
        try:
            client.put_lexicon(Name=req.name, Content=req.content)
            return {"saved": req.name, "region": norm_region}
        except (NoCredentialsError, BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _put)


@app.delete("/api/lexicons/{name}")
async def api_delete_lexicon(
    name: str, region: str = Query(default=DEFAULT_AWS_REGION)
) -> dict[str, Any]:
    norm_region = normalize_region(region)

    def _del() -> dict[str, Any]:
        client = get_polly_client(norm_region)
        try:
            client.delete_lexicon(Name=name)
            return {"deleted": name, "region": norm_region}
        except (NoCredentialsError, BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _del)


@app.get("/api/output/previews/{filename}")
async def serve_preview_output(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    target = (PREVIEWS_DIR / safe_name).resolve()
    if target.parent != PREVIEWS_DIR.resolve() or not target.exists():
        raise HTTPException(status_code=404, detail="Preview file not found.")
    return FileResponse(target, media_type="audio/mpeg", filename=safe_name)


@app.get("/api/output/{filename}")
async def serve_output_file(
    filename: str, download: int = Query(default=0)
) -> FileResponse:
    safe_name = Path(filename).name
    target = (OUTPUTS_DIR / safe_name).resolve()
    if target.parent != OUTPUTS_DIR.resolve() or not target.exists():
        raise HTTPException(status_code=404, detail="Output file not found.")

    suffix = target.suffix.lower().lstrip(".")
    media_map = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "pcm": "audio/pcm",
        "json": "application/json",
    }
    media_type = media_map.get(suffix, "application/octet-stream")
    if download:
        return FileResponse(target, media_type=media_type, filename=safe_name)
    return FileResponse(target, media_type=media_type)
