export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const RETRY_DELAYS_MS = [0, 2000, 4000, 8000, 12000, 15000];
const HEALTH_TIMEOUT_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchHealthOnce() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store",
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

// The free-tier backend sleeps when idle and can take up to a minute to wake.
// Retries with backoff; calls onWaking after the first failed attempt so the
// UI can show a "waking the backend" notice instead of an error.
export async function checkBackendHealth({ onWaking } = {}) {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt]) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
    if (await fetchHealthOnce()) {
      return;
    }
    onWaking?.(attempt + 1, RETRY_DELAYS_MS.length);
  }
  throw new Error("The backend did not respond after several wake-up attempts.");
}

export function buildBackendError(error) {
  return `The backend could not be reached at ${API_BASE_URL}. Check the deployed API URL and CORS allowed origins, then reload the page. ${error.message}`;
}
