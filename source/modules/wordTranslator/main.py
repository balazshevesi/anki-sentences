from __future__ import annotations

import os
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

        translated_text = translation.translate(request.q)
        alternatives: list[str] = []

        if request.alternatives > 0:
            try:
                hypotheses = translation.hypotheses(request.q, request.alternatives + 1)
            except Exception:
                hypotheses = []

            seen = {translated_text.strip().casefold()}
            for hypothesis in hypotheses:
                alternative = hypothesis.value.strip()
                if not alternative:
                    continue

                normalized = alternative.casefold()
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
