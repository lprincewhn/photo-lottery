const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

test("browser: imports, invalid files, independent drawing, reset, repeat and mobile layout", async () => {
  const root = path.resolve(__dirname, "../public");
  const server = http.createServer(async (request, response) => {
    const files = { "/": ["index.html", "text/html"], "/styles.css": ["styles.css", "text/css"], "/app.js": ["app.js", "text/javascript"], "/lottery.js": ["lottery.js", "text/javascript"] };
    const match = files[request.url];
    if (!match) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", match[1]);
    response.end(await fs.readFile(path.join(root, match[0])));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    const network = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.locator("#draw").isDisabled(), true);
    assert.equal(await page.locator("#reset").isDisabled(), true);
    assert.equal(await page.locator("#folder-input").getAttribute("webkitdirectory"), "");
    const buffers = await page.evaluate(() => {
      return ["林", "陈", "王"].map((name, index) => {
        const canvas = document.createElement("canvas");
        canvas.width = 300;
        canvas.height = 300;
        const context = canvas.getContext("2d");
        context.fillStyle = ["#735252", "#526a72", "#626f4e"][index];
        context.fillRect(0, 0, 300, 300);
        context.fillStyle = "#fff1d9";
        context.font = "100px sans-serif";
        context.textAlign = "center";
        context.fillText(name, 150, 180);
        return canvas.toDataURL("image/png").split(",")[1];
      });
    });
    const photo = (name, index = 0) => ({ name, mimeType: "image/png", buffer: Buffer.from(buffers[index], "base64") });
    const initialRequests = network.length;
    await page.locator("#files-input").setInputFiles([
      photo("林晓.png"), photo("陈晨.png", 1), photo("王小雨.png", 2), photo("林晓.jpg"),
      { name: "损坏.png", mimeType: "image/png", buffer: Buffer.from("broken") },
      { name: "说明.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") },
    ]);
    await page.waitForFunction(() => document.querySelector("#total").textContent === "3");
    assert.match(await page.locator("#import-status").textContent(), /跳过 3/);
    assert.equal(await page.locator("#candidates li").count(), 3);
    assert.equal(await page.locator("#import-errors li").count(), 3);
    await page.locator("#draw").click();
    assert.equal(await page.locator("#choose-folder").isDisabled(), true);
    assert.equal(await page.locator("#no-repeat").isDisabled(), true);
    assert.equal(await page.locator("#history li").count(), 0);
    await page.locator("#draw").click();
    assert.equal(await page.locator("#history li").count(), 1);
    assert.equal(await page.locator("#remaining").textContent(), "2");
    assert.equal(await page.locator("#candidates .selected").count(), 1);
    assert.equal(await page.locator("#winner-photo").isVisible(), true);
    const results = [await page.locator("#winner-name").textContent()];
    await fs.mkdir(path.resolve(__dirname, "../test-results"), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, "../test-results/desktop.png"), fullPage: true });
    for (let i = 0; i < 2; i++) {
      await page.locator("#draw").click();
      await page.locator("#draw").click();
      results.push(await page.locator("#winner-name").textContent());
    }
    assert.equal(new Set(results).size, 3);
    assert.equal(await page.locator("#draw").isDisabled(), true);
    assert.equal(await page.locator("#remaining").textContent(), "0");
    await page.locator("#no-repeat").uncheck();
    assert.equal(await page.locator("#draw").isEnabled(), true);
    await page.locator("#draw").click();
    await page.locator("#draw").click();
    assert.equal(await page.locator("#history li").count(), 4);
    await page.locator("#no-repeat").check();
    assert.equal(await page.locator("#draw").isDisabled(), true);
    await page.locator("#reset").click();
    assert.equal(await page.locator("#history li").count(), 0);
    assert.equal(await page.locator("#remaining").textContent(), "3");
    assert.equal(await page.locator("#candidates .selected").count(), 0);

    await page.locator("#files-input").setInputFiles([{ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("bad") }]);
    await page.waitForFunction(() => document.querySelector("#import-status").textContent.includes("没有可用"));
    assert.equal(await page.locator("#total").textContent(), "3");
    assert.equal(await page.locator("#error").isVisible(), true);
    await page.locator("#files-input").setInputFiles([photo("<img onerror=alert(1)>.png")]);
    await page.waitForFunction(() => document.querySelector("#total").textContent === "1");
    assert.equal(await page.locator("#candidates .name").textContent(), "<img onerror=alert(1)>");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Space");
    assert.match(await page.locator("#draw").textContent(), /停止/);
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#history li").count(), 1);
    assert.equal(await page.locator("#draw").isDisabled(), true);
    await page.locator("#reset").click();

    // Exercise real directory input with nested files and a duplicate name.
    const directory = path.resolve(__dirname, "../test-results/photos");
    await fs.mkdir(path.join(directory, "nested"), { recursive: true });
    await fs.writeFile(path.join(directory, "林晓.png"), Buffer.from(buffers[0], "base64"));
    await fs.writeFile(path.join(directory, "nested", "陈晨.png"), Buffer.from(buffers[1], "base64"));
    await fs.writeFile(path.join(directory, "nested", "林晓.png"), Buffer.from(buffers[0], "base64"));
    await page.locator("#folder-input").setInputFiles(directory);
    await page.waitForFunction(() => document.querySelector("#total").textContent === "2");
    assert.match(await page.locator("#import-status").textContent(), /跳过 1/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#draw").click();
    const stablePhoto = await page.locator("#winner-photo").getAttribute("src");
    await page.waitForTimeout(250);
    assert.equal(await page.locator("#winner-photo").getAttribute("src"), stablePhoto);
    await page.locator("#draw").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.resolve(__dirname, "../test-results/mobile.png"), fullPage: true });
    assert.equal(network.length, initialRequests, "Import and draw must make no network requests");
    await page.reload();
    assert.equal(await page.locator("#total").textContent(), "0");
    assert.equal(await page.locator("#history li").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
