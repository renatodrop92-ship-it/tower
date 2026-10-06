import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GameState } from "../shared/types";

const origin = "http://127.0.0.1:3111";
const directory = mkdtempSync(join(tmpdir(), "tower-arena-e2e-"));
let server: ChildProcess;
let output = "";
let databaseIndex = 0;
async function startServer() {
  output = "";
  server = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts", "--production"],
    {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        PORT: "3111",
        ARENA_DB_PATH: join(directory, `arena-${databaseIndex}.sqlite`),
      },
      stdio: "pipe",
    },
  );
  server.stdout?.on("data", (chunk) => {
    output += String(chunk);
  });
  server.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw Error(output);
        try {
          return (await fetch(`${origin}/api/health`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
}
async function stopServer() {
  if (server.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    server.once("close", () => resolve());
    server.kill();
  });
}
async function state(request: APIRequestContext): Promise<GameState> {
  return (await request.get("/api/state")).json();
}
async function post(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(`/api/${path}`, {
    data,
    headers: { "X-Arena-Control": "local" },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
const score = (page: Page, index: number) =>
  page.locator(".team-total strong").nth(index);

test.beforeEach(async () => {
  databaseIndex++;
  await startServer();
});
test.afterEach(stopServer);
test.afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

test("cartoon animations follow gifts, target the correct tower and do not replay on reload", async ({
  page,
  context,
  request,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await post(request, "command", { command: "finish" });
  const settings = (await state(request)).config;
  settings.game.autoRestart = false;
  settings.game.target = 300;
  settings.game.mode = "simulator";
  settings.appearance.background = "normal";
  settings.appearance.backgroundImage = "";
  await post(request, "config", settings);
  await post(request, "command", { command: "newRound" });
  await page.goto("/live");
  await expect(page.locator(".cartoon-arena")).toBeVisible();
  await expect(page.locator(".ct-art")).toHaveAttribute(
    "src",
    "/assets/backgrounds/lula-bolsonaro-cartoon-v1.png",
  );
  await expect(
    page.locator(".gift-toast,.arena-grid,.team-portrait"),
  ).toHaveCount(0);
  await expect(page.locator(".ct-event")).toHaveCount(0);
  const control = await context.newPage();
  await control.goto("/control");
  await expect(control.locator(".cartoon-arena")).toBeVisible();
  await post(request, "simulate", {
    type: "combo",
    giftId: "teamA-rose",
    quantity: 3,
    username: "ana",
  });
  await expect(
    page.locator('.ct-event[data-kind="gift"][data-target="teamA"]'),
  ).toBeVisible({ timeout: 1500 });
  const firstId = await page.locator(".ct-event").getAttribute("data-event-id");
  await expect(page.locator(".ct-event-banner")).toContainText("@ana");
  await expect(page.locator(".ct-combo")).toHaveText("×3");
  await expect(score(page, 0)).toHaveText("15");
  await expect(score(control, 0)).toHaveText("15");
  expect(
    await page
      .locator(".ct-gift-drop")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("ct-delivery");
  await page.screenshot({ path: info.outputPath("reactive-combo.png") });
  await page.reload();
  await expect(score(page, 0)).toHaveText("15");
  await expect(page.locator(".ct-event")).toHaveCount(0);
  await post(request, "simulate", {
    type: "gift",
    giftId: "teamA-rose",
    username: "bia",
  });
  await expect(page.locator('.ct-event[data-kind="gift"]')).toBeVisible();
  expect(
    await page.locator(".ct-event").getAttribute("data-event-id"),
  ).not.toBe(firstId);
  await expect(page.locator(".ct-event")).toHaveCount(0, { timeout: 4000 });
  await post(request, "simulate", {
    type: "action",
    team: "teamB",
    action: "SHIELD",
    duration: 20,
  });
  await expect(
    page.locator('.ct-event[data-kind="shield"][data-target="teamB"]'),
  ).toBeVisible();
  await expect(page.locator(".ct-teamB .ct-energy-shield")).toBeVisible();
  await expect(page.locator(".ct-event")).toHaveCount(0, { timeout: 4000 });
  await post(request, "simulate", {
    type: "action",
    team: "teamA",
    action: "ATTACK",
    value: 20,
  });
  await expect(
    page.locator(
      '.ct-event[data-kind="blocked"][data-target="teamB"] .ct-projectile',
    ),
  ).toBeAttached();
  await expect(page.locator(".ct-impact")).toHaveText("BLOQUEADO!");
  await expect(page.locator(".ct-event")).toHaveCount(0, { timeout: 4000 });
  await post(request, "simulate", {
    type: "action",
    team: "teamB",
    action: "MEGA_ATTACK",
    value: 10,
  });
  await expect(
    page.locator('.ct-event[data-kind="mega"][data-target="teamA"] .ct-mega'),
  ).toBeAttached();
  await expect(score(page, 0)).toHaveText("10");
  await expect(page.locator(".ct-event")).toHaveCount(0, { timeout: 4000 });
  await post(request, "simulate", {
    type: "action",
    team: "teamA",
    action: "MULTIPLIER",
    value: 2,
    duration: 20,
  });
  await expect(
    page.locator('.ct-event[data-kind="multiplier"] .ct-impact'),
  ).toHaveText("×2");
  await expect(page.locator(".ct-teamA .ct-boost")).toContainText("×2");
  await expect(page.locator(".ct-event")).toHaveCount(0, { timeout: 4000 });
  await post(request, "simulate", { type: "like", likes: 1000 });
  await expect(page.locator('.ct-event[data-kind="likes"]')).toBeVisible();
  await post(request, "command", { command: "pause" });
  await expect(page.locator(".ct-event")).toHaveCount(0);
  await post(request, "command", { command: "resume" });
  await expect(page.locator(".ct-event")).toHaveCount(0);
  await post(request, "simulate", {
    type: "gift",
    giftId: "teamA-rose",
    quantity: 29,
  });
  await expect(page.locator(".ct-victory")).toContainText("Lula");
  await expect(page.locator(".ct-victory")).toContainText("VENCEU A RODADA!");
  await expect(page.locator(".ct-event")).toHaveCount(0);
  await post(request, "command", { command: "newRound" });
  await expect(score(page, 0)).toHaveText("0");
  await expect(page.locator(".ct-victory")).toHaveCount(0);
  await expect(page.locator(".ct-energy-shield")).toHaveCount(0);
  await expect(page.locator(".ct-event")).toHaveCount(0, { timeout: 4000 });
  expect(errors).toEqual([]);
});

test("operator → simulator → authoritative state → two live views → durable restart", async ({
  page,
  context,
  request,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  const initial = await state(request);
  initial.config.game.restartSeconds = 2;
  await post(request, "config", initial.config);
  await page.goto("/control");
  await expect(
    page.getByText("Sincronizado", { exact: false }).first(),
  ).toBeVisible();
  const live = await context.newPage();
  live.on("pageerror", (error) => errors.push(error.message));
  await live.setViewportSize({ width: 1080, height: 1920 });
  await live.goto("/live");
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await page
    .getByRole("button", { name: "Simular presente", exact: true })
    .click();
  await expect(score(live, 0)).toHaveText("5");
  await page.getByLabel("Quantidade / combo").fill("3");
  await page.getByRole("button", { name: "Combo ×3", exact: true }).click();
  await expect(score(live, 0)).toHaveText("20");
  await page
    .getByRole("button", { name: "Bolsonaro Time B", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simular presente", exact: true })
    .click();
  await expect(score(live, 1)).toHaveText("15");
  await page.getByRole("button", { name: "Escudo", exact: true }).click();
  await expect(live.locator(".shielded")).toHaveCount(1);
  await page.getByRole("button", { name: "Lula Time A", exact: true }).click();
  await page.getByRole("button", { name: "Ataque", exact: true }).click();
  await expect
    .poll(async () =>
      (await state(request)).visuals.some((v) => v.kind === "blocked"),
    )
    .toBe(true);
  await expect(score(live, 1)).toHaveText("15");
  await page
    .getByRole("button", { name: "Multiplicador ×2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simular presente", exact: true })
    .click();
  await expect(score(live, 0)).toHaveText("50");
  await page.getByRole("button", { name: "+1.000 likes", exact: true }).click();
  await expect.poll(async () => (await state(request)).totalLikes).toBe(1000);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Simular presente", exact: true }),
  ).toBeDisabled();
  const paused = await request.post("/api/simulate", {
    data: { type: "like", likes: 10 },
    headers: { "X-Arena-Control": "local" },
  });
  expect(paused.status()).toBe(400);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await live.reload();
  await expect(score(live, 0)).toHaveText("50");
  await page.getByLabel("Quantidade / combo").fill("25");
  await page.getByRole("button", { name: "Combo ×25", exact: true }).click();
  await expect(
    live.getByText("VENCEU A RODADA!", { exact: true }),
  ).toBeVisible();
  const won = await state(request);
  expect(won.teams.teamA.wins).toBe(1);
  expect(won.history).toHaveLength(1);
  await live.screenshot({ path: info.outputPath("victory.png") });
  await expect(score(live, 0)).toHaveText("0", { timeout: 6000 });
  await expect.poll(async () => (await state(request)).roundNumber).toBe(2);
  await page.getByLabel("Quantidade / combo").fill("1");
  await page
    .getByRole("button", { name: "Simular presente", exact: true })
    .click();
  await expect(score(live, 0)).toHaveText("5");
  await stopServer();
  await startServer();
  await page.reload();
  await live.reload();
  await expect(score(live, 0)).toHaveText("5");
  expect((await state(request)).status).toBe("PAUSED");
  expect((await state(request)).teams.teamA.wins).toBe(1);
  expect((await state(request)).history).toHaveLength(1);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await expect.poll(async () => (await state(request)).nextRoundAt).toBe(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Partida", exact: true })
    .click();
  await page.getByLabel("Meta de blocos", { exact: true }).fill("500");
  await page
    .getByRole("button", { name: "Salvar configurações", exact: true })
    .click();
  await expect
    .poll(async () => (await state(request)).config.game.target)
    .toBe(500);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Aparência", exact: true })
    .click();
  await page.getByLabel("Fundo", { exact: true }).selectOption("transparent");
  await page
    .getByRole("button", { name: "Salvar configurações", exact: true })
    .click();
  await expect(live.locator(".arena")).toHaveClass(/bg-transparent/);
  expect(
    await live
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  await page.getByLabel("Fundo", { exact: true }).selectOption("normal");
  await page
    .getByRole("button", { name: "Salvar configurações", exact: true })
    .click();
  await expect(live.locator(".arena")).toHaveClass(/bg-normal/);
  await post(request, "command", { command: "newRound" });
  for (const [username, team, quantity] of [
    ["ana", "teamA", 28],
    ["bia", "teamB", 20],
    ["leo", "teamA", 5],
  ]) {
    await post(request, "simulate", {
      type: "gift",
      username,
      giftId: `${team}-rose`,
      quantity: Number(quantity),
    });
  }
  await expect(live.locator(".live-ranking > div")).toHaveCount(3);
  const footer = await live.locator(".disclaimer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThan(1820);
  await expect(live.getByRole("button")).toHaveCount(0);
  await live.screenshot({ path: info.outputPath("live-1080x1920.png") });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("control-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("control-mobile.png"),
    fullPage: true,
  });
  await live.setViewportSize({ width: 390, height: 693 });
  const mobileFooter = await live.locator(".disclaimer").boundingBox();
  expect(mobileFooter!.y + mobileFooter!.height).toBeLessThan(693);
  await live.screenshot({ path: info.outputPath("live-mobile.png") });
  const burstStart = Date.now();
  await Promise.all([
    ...Array.from({ length: 50 }, (_, i) =>
      post(request, "simulate", {
        type: "gift",
        username: `burst-${i}`,
        giftId: "teamA-rose",
        quantity: 1,
      }),
    ),
    ...Array.from({ length: 100 }, () =>
      post(request, "simulate", { type: "like", likes: 10 }),
    ),
  ]);
  await expect(score(live, 0)).toHaveText("415");
  const burst = await state(request);
  expect(burst.totalLikes).toBe(1000);
  expect(burst.gifts).toBe(103);
  await info.attach("burst-result", {
    body: JSON.stringify({
      events: 150,
      elapsedMs: Date.now() - burstStart,
      scoreA: burst.teams.teamA.score,
      likes: burst.totalLikes,
    }),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
