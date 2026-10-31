export async function checkApiHealth() {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`API health check failed with status ${response.status}`);
  }

  const result = await response.json();

  if (result.status !== "ok") {
    throw new Error("API returned an unexpected health status");
  }
}
