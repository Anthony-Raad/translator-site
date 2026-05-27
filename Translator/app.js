const languages = [
  { code: "auto", name: "Auto detect", google: "auto", microsoft: "auto" },
  { code: "ar", name: "Arabic", rtl: true, speech: "ar-SA" },
  { code: "de", name: "German", speech: "de-DE" },
  { code: "en", name: "English", speech: "en-US" },
  { code: "es", name: "Spanish", speech: "es-ES" },
  { code: "fr", name: "French", speech: "fr-FR" },
  { code: "hi", name: "Hindi", speech: "hi-IN" },
  { code: "it", name: "Italian", speech: "it-IT" },
  { code: "ja", name: "Japanese", speech: "ja-JP" },
  { code: "ko", name: "Korean", speech: "ko-KR" },
  { code: "pt", name: "Portuguese", speech: "pt-BR" },
  { code: "ru", name: "Russian", speech: "ru-RU" },
  { code: "tr", name: "Turkish", speech: "tr-TR" },
  {
    code: "zh-Hans",
    name: "Chinese Simplified",
    google: "zh-CN",
    microsoft: "zh-Hans",
    speech: "zh-CN"
  }
];

const sourceSelect = document.querySelector("#sourceLanguage");
const targetSelect = document.querySelector("#targetLanguage");
const sourceText = document.querySelector("#sourceText");
const form = document.querySelector("#translatorForm");
const output = document.querySelector("#translationOutput");
const translateButton = document.querySelector("#translateButton");
const micButton = document.querySelector("#micButton");
const copyButton = document.querySelector("#copyButton");
const speakButton = document.querySelector("#speakButton");
const clearButton = document.querySelector("#clearButton");
const swapButton = document.querySelector("#swapButton");
const characterCount = document.querySelector("#characterCount");
const detectedLanguage = document.querySelector("#detectedLanguage");
const messageArea = document.querySelector("#messageArea");
const apiStatus = document.querySelector("#apiStatus");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognitionSupported = Boolean(SpeechRecognition);
let recognition = null;
let isListening = false;

let latestTranslation = "";
let translationProvider = "google";

function populateLanguageSelects() {
  const sourceOptions = languages
    .map((language) => `<option value="${language.code}">${language.name}</option>`)
    .join("");

  const targetOptions = languages
    .filter((language) => language.code !== "auto")
    .map((language) => `<option value="${language.code}">${language.name}</option>`)
    .join("");

  sourceSelect.innerHTML = sourceOptions;
  targetSelect.innerHTML = targetOptions;
  sourceSelect.value = "auto";
  targetSelect.value = "es";
}

function getLanguage(code) {
  return languages.find((language) => language.code === code);
}

function getProviderCode(code, provider) {
  const language = getLanguage(code);
  return language?.[provider] || language?.code || code;
}

function setMessage(text = "", type = "") {
  messageArea.textContent = text;
  messageArea.className = `message ${type}`.trim();
}

function setLoading(isLoading) {
  if (translateButton) {
    translateButton.disabled = isLoading;
  }
}

function setOutput(text, metadata = {}) {
  latestTranslation = text;
  output.textContent = text || "";
  output.dir = getLanguage(targetSelect.value)?.rtl ? "rtl" : "ltr";
  copyButton.disabled = !text;
  speakButton.disabled = !text || !("speechSynthesis" in window);

  if (!text) {
    output.innerHTML = '<span class="muted">Translated text will appear here.</span>';
    detectedLanguage.textContent = "";
    return;
  }

  if (metadata.detectedLanguage && sourceSelect.value === "auto") {
    const detected = getLanguage(metadata.detectedLanguage)?.name || metadata.detectedLanguage;
    detectedLanguage.textContent = `Detected: ${detected}`;
  } else {
    detectedLanguage.textContent = "";
  }
}

function updateCharacterCount() {
  characterCount.textContent = `${sourceText.value.length} / ${sourceText.maxLength}`;
}

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

function getRecognitionLanguage() {
  const speechLang = getLanguage(sourceSelect.value)?.speech;
  return sourceSelect.value === "auto"
    ? navigator.language || "en-US"
    : speechLang || sourceSelect.value || navigator.language || "en-US";
}

function createSpeechRecognition() {
  if (!recognitionSupported) {
    if (micButton) {
      micButton.disabled = true;
      micButton.title = "Speech recognition is not supported in this browser.";
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0]?.[0]?.transcript?.trim();
    if (!transcript) {
      return;
    }

    sourceText.value = transcript;
    updateCharacterCount();
    setMessage("");
    autoTranslate();
  });

  recognition.addEventListener("start", () => {
    isListening = true;
    if (micButton) {
      micButton.classList.add("listening");
      micButton.setAttribute("aria-label", "Stop listening");
      micButton.title = "Stop listening";
    }
    setMessage("Listening...", "success");
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    if (micButton) {
      micButton.classList.remove("listening");
      micButton.setAttribute("aria-label", "Speak to translate");
      micButton.title = "Speak to translate";
    }
    if (!normalizeText(sourceText.value)) {
      setMessage("");
    }
  });

  recognition.addEventListener("error", (event) => {
    setMessage(`Speech recognition error: ${event.error}`, "error");
    isListening = false;
    if (micButton) {
      micButton.classList.remove("listening");
    }
  });
}

function toggleListening() {
  if (!recognition) {
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  recognition.lang = getRecognitionLanguage();
  try {
    recognition.start();
  } catch (error) {
    setMessage("Unable to start speech recognition.", "error");
  }
}

function debounce(fn, delay = 500) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function canAutoTranslate() {
  const text = normalizeText(sourceText.value);
  return text && sourceSelect.value !== targetSelect.value;
}

const autoTranslate = debounce(() => {
  if (canAutoTranslate()) {
    translateText();
  } else if (!normalizeText(sourceText.value)) {
    setOutput("");
    setMessage("");
  }
}, 500);

async function translateText() {
  const text = normalizeText(sourceText.value);
  const from = sourceSelect.value;
  const to = targetSelect.value;

  if (!text) {
    setMessage("Enter text before translating.", "error");
    sourceText.focus();
    return;
  }

  if (from === to) {
    setMessage("Choose two different languages.", "error");
    targetSelect.focus();
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const payload =
      translationProvider === "microsoft"
        ? await translateWithBackend(text, from, to)
        : await translateWithGoogle(text, from, to);

    setOutput(payload.translatedText, {
      detectedLanguage: payload.detectedLanguage
    });
    setMessage("Translation ready.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function translateWithBackend(text, from, to) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      from: getProviderCode(from, "microsoft"),
      to: getProviderCode(to, "microsoft")
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Translation request failed.");
  }

  return payload;
}

async function translateWithGoogle(text, from, to) {
  const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.search = new URLSearchParams({
    client: "gtx",
    sl: getProviderCode(from, "google"),
    tl: getProviderCode(to, "google"),
    dt: "t",
    q: text
  }).toString();

  const response = await fetch(endpoint.toString());
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error("Google Translate request failed.");
  }

  const translatedText = Array.isArray(payload[0])
    ? payload[0].map((part) => part?.[0] || "").join("")
    : "";

  if (!translatedText) {
    throw new Error("Google Translate returned an unexpected response.");
  }

  return {
    translatedText,
    detectedLanguage: payload[2] || null
  };
}

async function checkApiStatus() {
  try {
    const response = await fetch("/api/health");
    const payload = await response.json();

    translationProvider = payload.ready ? "microsoft" : "google";
    apiStatus.textContent = payload.ready ? "Microsoft API" : "Google API";
    apiStatus.className = "status-pill ready";
  } catch {
    translationProvider = "google";
    apiStatus.textContent = "Google API";
    apiStatus.className = "status-pill ready";
  }
}

function copyTranslation() {
  if (!latestTranslation) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(latestTranslation).then(
      () => setMessage("Copied translation.", "success"),
      () => fallbackCopy()
    );
    return;
  }

  fallbackCopy();
}

function fallbackCopy() {
  const scratch = document.createElement("textarea");
  scratch.value = latestTranslation;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.top = "-1000px";
  document.body.appendChild(scratch);
  scratch.select();
  document.execCommand("copy");
  scratch.remove();
  setMessage("Copied translation.", "success");
}

function speakTranslation() {
  if (!latestTranslation || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(latestTranslation);
  utterance.lang = getLanguage(targetSelect.value)?.speech || targetSelect.value;
  window.speechSynthesis.speak(utterance);
}

function clearText() {
  sourceText.value = "";
  updateCharacterCount();
  setOutput("");
  setMessage("");
  sourceText.focus();
}

function swapLanguages() {
  if (sourceSelect.value === "auto") {
    sourceSelect.value = targetSelect.value;
    targetSelect.value = "en";
  } else {
    const oldSource = sourceSelect.value;
    sourceSelect.value = targetSelect.value;
    targetSelect.value = oldSource;
  }

  if (latestTranslation) {
    sourceText.value = latestTranslation;
    setOutput("");
    updateCharacterCount();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  translateText();
});

sourceText.addEventListener("input", () => {
  updateCharacterCount();
  setMessage("");
  autoTranslate();
});

sourceSelect.addEventListener("change", () => {
  setMessage("");
  autoTranslate();
});

targetSelect.addEventListener("change", () => {
  output.dir = getLanguage(targetSelect.value)?.rtl ? "rtl" : "ltr";
  setMessage("");
  autoTranslate();
});

copyButton.addEventListener("click", copyTranslation);
speakButton.addEventListener("click", speakTranslation);
clearButton.addEventListener("click", clearText);
swapButton.addEventListener("click", swapLanguages);
if (micButton) {
  micButton.addEventListener("click", toggleListening);
}

populateLanguageSelects();
createSpeechRecognition();
updateCharacterCount();
setOutput("");
checkApiStatus();
