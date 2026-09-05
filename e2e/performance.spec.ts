import { expect, test } from "@playwright/test";

test("million-instance WebGPU scene holds its frame budget", async ({ page }) => {
  test.skip(process.env.NATURAL_GPU_BENCH !== "1", "Requires the dedicated Natural GPU runner");
  await page.goto("http://127.0.0.1:43300/?stress=1");
  await expect(page.locator("#stats")).toContainText("1,000,000 instances", { timeout: 60_000 });
  const samples = await page.evaluate(async () => {
    const result: number[] = [];
    let previous = performance.now();
    for (let frame = 0; frame < 180; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      if (frame >= 60) result.push(now - previous);
      previous = now;
    }
    return result.sort((left, right) => left - right);
  });
  const p95 = samples[Math.floor(samples.length * 0.95)] ?? Infinity;
  expect(p95).toBeLessThanOrEqual(16.7);
});
