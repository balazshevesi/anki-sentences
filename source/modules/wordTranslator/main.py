from __future__ import annotations

import os
import unicodedata
from threading import Lock

import argostranslate.package
import argostranslate.translate
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Argos Translate API", version="0.1.0")

_install_lock = Lock()
_package_index_lock = Lock()
_available_packages: list[argostranslate.package.AvailablePackage] | None = None


class TranslateRequest(BaseModel):
    q: str = Field(min_length=1)
    source: str = Field(min_length=2)
    target: str = Field(min_length=2)
    alternatives: int = Field(default=0, ge=0, le=20)


class TranslateResponse(BaseModel):
    translatedText: str
    alternatives: list[str] = Field(default_factory=list)


def _is_symbol_or_punctuation(char: str) -> bool:
    category = unicodedata.category(char)
    return category.startswith("P") or category.startswith("S")


def _strip_edge_symbols(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        return ""

    start = 0
    end = len(trimmed)

    while start < end and _is_symbol_or_punctuation(trimmed[start]):
        start += 1

    while end > start and _is_symbol_or_punctuation(trimmed[end - 1]):
        end -= 1

    return trimmed[start:end].strip()


def _find_first_letter_index(value: str) -> int | None:
    for index, char in enumerate(value):
        if char.isalpha():
            return index
    return None


def _match_capitalization(source_text: str, translated_text: str) -> str:
    source_index = _find_first_letter_index(source_text)
    translated_index = _find_first_letter_index(translated_text)

    if source_index is None or translated_index is None:
        return translated_text

    source_is_capitalized = source_text[source_index].isupper()
    first_translated_char = translated_text[translated_index]
    adjusted_char = (
        first_translated_char.upper()
        if source_is_capitalized
        else first_translated_char.lower()
    )

    return (
        translated_text[:translated_index]
        + adjusted_char
        + translated_text[translated_index + 1 :]
    )


def _normalize_translation_candidate(candidate: str, source_text: str) -> str:
    without_edge_symbols = _strip_edge_symbols(candidate)
    if not without_edge_symbols:
        return ""

    return _match_capitalization(source_text, without_edge_symbols)


def _dedupe_key(value: str) -> str:
    letters_and_numbers_only = "".join(char for char in value if char.isalnum())
    return letters_and_numbers_only.casefold()


def _refresh_installed_languages() -> None:
    argostranslate.translate.get_installed_languages.cache_clear()


def _is_translation_available(from_code: str, to_code: str) -> bool:
    from_lang = argostranslate.translate.get_language_from_code(from_code)
    to_lang = argostranslate.translate.get_language_from_code(to_code)
    if from_lang is None or to_lang is None:
        return False

    return any(t.to_lang.code == to_lang.code for t in from_lang.translations_from)


def _get_translation(from_code: str, to_code: str):
    from_lang = argostranslate.translate.get_language_from_code(from_code)
    to_lang = argostranslate.translate.get_language_from_code(to_code)
    if from_lang is None:
        raise HTTPException(
            status_code=400, detail=f"Unsupported source language: {from_code}"
        )
    if to_lang is None:
        raise HTTPException(
            status_code=400, detail=f"Unsupported target language: {to_code}"
        )

    try:
        return from_lang.get_translation(to_lang)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "No translation package installed for this pair. "
                f"Requested: {from_code}->{to_code}"
            ),
        ) from exc


def _get_available_packages() -> list[argostranslate.package.AvailablePackage]:
    global _available_packages
    with _package_index_lock:
        if _available_packages is None:
            argostranslate.package.update_package_index()
            _available_packages = argostranslate.package.get_available_packages()
    return _available_packages


def _install_translation_package(from_code: str, to_code: str) -> None:
    with _install_lock:
        if _is_translation_available(from_code, to_code):
            return

        available_packages = _get_available_packages()
        package_to_install = next(
            (
                pkg
                for pkg in available_packages
                if pkg.from_code == from_code and pkg.to_code == to_code
            ),
            None,
        )

        if package_to_install is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No Argos model found for this pair. "
                    f"Requested: {from_code}->{to_code}"
                ),
            )

        download_path = package_to_install.download()
        argostranslate.package.install_from_path(download_path)
        _refresh_installed_languages()


def _preinstall_pairs() -> None:
    raw_pairs = os.getenv("ARGOS_PREINSTALL_PAIRS", "").strip()
    if not raw_pairs:
        return

    pairs = [item.strip() for item in raw_pairs.split(",") if item.strip()]
    for pair in pairs:
        from_code, separator, to_code = pair.partition(":")
        if separator != ":" or not from_code or not to_code:
            raise RuntimeError(
                "Invalid ARGOS_PREINSTALL_PAIRS format. Use: en:es,en:de"
            )
        _install_translation_package(from_code, to_code)


@app.on_event("startup")
def startup() -> None:
    _refresh_installed_languages()
    _preinstall_pairs()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/translate", response_model=TranslateResponse)
def translate(request: TranslateRequest) -> TranslateResponse:
    source = request.source.lower()
    target = request.target.lower()

    if source == "auto":
        raise HTTPException(
            status_code=400,
            detail="source='auto' is not supported. Use a language code like 'en'.",
        )

    _install_translation_package(source, target)

    try:
        translation = _get_translation(source, target)

        translated_text = _normalize_translation_candidate(
            translation.translate(request.q), request.q
        )
        if not translated_text:
            translated_text = _normalize_translation_candidate(request.q, request.q)
        if not translated_text:
            translated_text = request.q.strip()

        alternatives: list[str] = []

        if request.alternatives > 0:
            try:
                hypotheses = translation.hypotheses(request.q, request.alternatives + 1)
            except Exception:
                hypotheses = []

            source_key = _dedupe_key(
                _normalize_translation_candidate(request.q, request.q)
            )
            seen = {_dedupe_key(translated_text)}
            if source_key:
                seen.add(source_key)

            for hypothesis in hypotheses:
                alternative = _normalize_translation_candidate(
                    hypothesis.value, request.q
                )
                if not alternative:
                    continue

                normalized = _dedupe_key(alternative)
                if not normalized:
                    continue
                if normalized in seen:
                    continue

                seen.add(normalized)
                alternatives.append(alternative)
                if len(alternatives) >= request.alternatives:
                    break
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Translation failed: {exc}"
        ) from exc

    return TranslateResponse(translatedText=translated_text, alternatives=alternatives)
