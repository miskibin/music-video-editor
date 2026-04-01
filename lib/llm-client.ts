export const LLM_BASE_URL_STORAGE = 'mve_llm_base_url';
export const LLM_API_KEY_STORAGE = 'mve_llm_api_key';
export const LLM_MODEL_STORAGE = 'mve_llm_model_name';

export interface SavedLlmSettings {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
}

export interface LlmConnectionSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmConnectionTestResult {
  ok: true;
  model: string;
  provider: 'openai-compatible';
}

export function readSavedLlmSettings(): SavedLlmSettings {
  if (typeof window === 'undefined') {
    return { baseUrl: null, apiKey: null, model: null };
  }

  return {
    baseUrl: window.localStorage.getItem(LLM_BASE_URL_STORAGE),
    apiKey: window.localStorage.getItem(LLM_API_KEY_STORAGE),
    model: window.localStorage.getItem(LLM_MODEL_STORAGE),
  };
}

export function saveLlmSettings(settings: Partial<LlmConnectionSettings>) {
  if (typeof window === 'undefined') {
    return;
  }

  const baseUrl = settings.baseUrl?.trim() ?? '';
  const apiKey = settings.apiKey?.trim() ?? '';
  const model = settings.model?.trim() ?? '';

  if (baseUrl) {
    window.localStorage.setItem(LLM_BASE_URL_STORAGE, baseUrl);
  } else {
    window.localStorage.removeItem(LLM_BASE_URL_STORAGE);
  }

  if (apiKey) {
    window.localStorage.setItem(LLM_API_KEY_STORAGE, apiKey);
  }

  if (model) {
    window.localStorage.setItem(LLM_MODEL_STORAGE, model);
  } else {
    window.localStorage.removeItem(LLM_MODEL_STORAGE);
  }
}

export function clearSavedLlmSettings() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(LLM_BASE_URL_STORAGE);
  window.localStorage.removeItem(LLM_API_KEY_STORAGE);
  window.localStorage.removeItem(LLM_MODEL_STORAGE);
}

export async function testLlmConnection(settings: LlmConnectionSettings): Promise<LlmConnectionTestResult> {
  const response = await fetch('/api/llm/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: settings.baseUrl.trim(),
      apiKey: settings.apiKey.trim(),
      model: settings.model.trim(),
    }),
  });

  const data = (await response.json()) as {
    ok?: true;
    model?: string;
    provider?: 'openai-compatible';
    error?: string;
    detail?: string;
  };

  if (!response.ok || !data.ok) {
    const message = [data.error, data.detail].filter(Boolean).join(': ');
    throw new Error(message || 'LLM connection test failed');
  }

  return {
    ok: true,
    model: data.model ?? settings.model.trim(),
    provider: 'openai-compatible',
  };
}