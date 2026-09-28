"use strict";

const { Lottery, personName } = globalThis.PhotoLottery;
const lottery = new Lottery();
const $ = (id) => document.getElementById(id);
let importing = false;
let animation;
let animationPosition = 0;
const candidateNodes = new Map();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const supportedImage = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

function clearPortrait() {
  $("winner-photo").hidden = true;
  $("winner-photo").removeAttribute("src");
  $("winner-photo").alt = "";
  $("placeholder").hidden = false;
}

function showPortrait(person) {
  $("winner-photo").src = person.url;
  $("winner-photo").alt = person.name;
  $("winner-photo").hidden = false;
  $("placeholder").hidden = true;
}

function render() {
  const available = lottery.eligible.length;
  $("total").textContent = lottery.people.length;
  $("remaining").textContent = available;
  $("drawn").textContent = lottery.history.length;
  $("candidate-count").textContent = `/ ${lottery.people.length}`;
  $("draw").disabled = importing || !available;
  $("draw").textContent = lottery.running ? "停止 · 揭晓幸运" : "开始抽签 ↗";
  $("draw").classList.toggle("rolling", lottery.running);
  $("reset").disabled = importing || lottery.running || !lottery.history.length;
  for (const id of ["choose-folder", "choose-files", "no-repeat"]) {
    $(id).disabled = importing || lottery.running;
  }
  $("stage-state").textContent = importing ? "正在导入" : lottery.running ? "幸运流转中" :
    !lottery.people.length ? "等待导入" : !available ? "本轮已抽完" : "准备就绪";
  $("history-empty").hidden = lottery.history.length > 0;
  $("candidates-empty").hidden = lottery.people.length > 0;
  const drawn = new Set(lottery.history.map((person) => person.id));
  for (const [id, node] of candidateNodes) {
    node.classList.toggle("selected", drawn.has(id));
    node.querySelector(".selected-badge").hidden = !drawn.has(id);
  }
}

function renderCandidates() {
  candidateNodes.clear();
  const fragment = document.createDocumentFragment();
  for (const person of lottery.people) {
    const item = document.createElement("li");
    const image = document.createElement("img");
    image.src = person.url;
    image.alt = person.name;
    image.loading = "lazy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = person.name;
    const badge = document.createElement("span");
    badge.className = "selected-badge";
    badge.textContent = "已抽中";
    badge.hidden = true;
    item.append(image, name, badge);
    fragment.append(item);
    candidateNodes.set(person.id, item);
  }
  $("candidates").replaceChildren(fragment);
}

function resetDisplay() {
  clearPortrait();
  $("history").replaceChildren();
  $("winner-name").textContent = "幸运，即将揭晓";
  $("result-label").textContent = "READY WHEN YOU ARE";
  $("result-hint").textContent = lottery.people.length ? "准备好了？开始这一轮幸运" : "从右侧导入本地照片开始";
}

function validatePhoto(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error("读取超时")), 10000);
    function finish(error) {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      image.src = "";
      if (error) reject(error);
      else resolve();
    }
    image.onload = () => finish(image.naturalWidth ? undefined : new Error("图片尺寸无效"));
    image.onerror = () => finish(new Error("损坏或浏览器不支持"));
    image.src = url;
  });
}

async function importPhotos(fileList) {
  if (!fileList.length) return;
  if (importing || lottery.running) {
    showError("请先停止抽签或等待当前导入完成。");
    return;
  }
  if (lottery.people.length && !window.confirm("重新导入会替换全部候选人并清空抽签记录，是否继续？")) return;
  const files = Array.from(fileList).sort((a, b) =>
    (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, "zh-CN"));
  if (files.length > 2000) {
    showError("一次最多选择 2000 个文件，请缩小照片文件夹后重试。原名单未更改。");
    return;
  }
  importing = true;
  showError("");
  render();
  const people = [];
  const names = new Set();
  const errors = [];
  let committed = false;
  try {
    for (const [index, file] of files.entries()) {
      $("import-status").textContent = `正在读取 ${index + 1} / ${files.length}…`;
      const path = file.webkitRelativePath || file.name;
      const name = personName(file.name);
      let reason;
      if (!supportedImage.test(file.name)) reason = "不支持的格式（支持 JPG / PNG / WebP / GIF / BMP / AVIF）";
      else if (!name) reason = "文件名中没有姓名";
      else if (names.has(name)) reason = "姓名重复，已保留第一张有效照片";
      else if (file.size > 25 * 1024 * 1024) reason = "单张照片超过 25 MB";
      else if (!file.size) reason = "空文件";
      if (reason) {
        errors.push(`${path}：${reason}`);
        continue;
      }
      const url = URL.createObjectURL(file);
      try {
        await validatePhoto(url);
      } catch (error) {
        URL.revokeObjectURL(url);
        errors.push(`${path}：${error.message}`);
        continue;
      }
      names.add(name);
      people.push({ id: people.length, name, url });
    }
    if (people.length) {
      const previousPeople = lottery.people;
      lottery.replace(people);
      committed = true;
      resetDisplay();
      renderCandidates();
      previousPeople.forEach((person) => URL.revokeObjectURL(person.url));
      $("import-status").textContent = `已导入 ${people.length} 位候选人${errors.length ? `，跳过 ${errors.length} 个文件` : "，照片仅保留在当前页面"}。`;
    } else {
      $("import-status").textContent = "没有可用照片，原名单和记录未更改。";
      showError("没有导入任何照片。请使用浏览器支持的图片格式，并查看未导入的文件详情。");
    }
    $("import-errors").replaceChildren(...errors.map((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      return item;
    }));
    $("import-details").hidden = !errors.length;
  } catch (error) {
    if (!committed) people.forEach((person) => URL.revokeObjectURL(person.url));
    throw error;
  } finally {
    importing = false;
    render();
  }
}

for (const [button, input] of [["choose-folder", "folder-input"], ["choose-files", "files-input"]]) {
  $(button).addEventListener("click", () => $(input).click());
  $(input).addEventListener("change", async (event) => {
    try {
      await importPhotos(event.target.files);
    } catch (error) {
      showError(`导入失败：${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
}

function draw() {
  if ($("draw").disabled) return;
  showError("");
  try {
    if (!lottery.running) {
      lottery.start();
      $("result-label").textContent = "WHO WILL BE NEXT?";
      $("winner-name").textContent = "幸运流转中…";
      $("result-hint").textContent = "点击停止，揭晓本次抽签结果";
      // This sequential slideshow is visual only. The winner is sampled separately on stop.
      const candidates = lottery.eligible;
      animationPosition = 0;
      showPortrait(candidates[animationPosition]);
      if (!reducedMotion.matches) {
        animation = setInterval(() => {
          animationPosition = (animationPosition + 1) % candidates.length;
          showPortrait(candidates[animationPosition]);
        }, 110);
      }
    } else {
      const winner = lottery.stop();
      clearInterval(animation);
      showPortrait(winner);
      $("result-label").textContent = `LUCKY MOMENT / ${String(lottery.history.length).padStart(2, "0")}`;
      $("winner-name").textContent = winner.name;
      $("result-hint").textContent = lottery.eligible.length ? "恭喜你，幸运在这一刻定格！" : "全部候选人已抽完，可重置开启新一轮";
      const item = document.createElement("li");
      const image = document.createElement("img");
      image.src = winner.url;
      image.alt = "";
      const name = document.createElement("span");
      name.className = "history-name";
      name.textContent = winner.name;
      const round = document.createElement("span");
      round.className = "round";
      round.textContent = `第 ${lottery.history.length} 次`;
      item.append(image, name, round);
      $("history").prepend(item);
    }
  } catch (error) {
    clearInterval(animation);
    lottery.running = false;
    showError(`抽签失败：${error.message}`);
  }
  render();
}

$("draw").addEventListener("click", draw);
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && event.target === document.body) {
    event.preventDefault();
    draw();
  }
});
$("no-repeat").addEventListener("change", (event) => {
  lottery.noRepeat = event.target.checked;
  if (lottery.people.length) {
    $("result-hint").textContent = lottery.eligible.length ? "准备好了？开始这一轮幸运" : "全部候选人已抽完，可重置开启新一轮";
  }
  render();
});
$("reset").addEventListener("click", () => {
  if (!window.confirm("清空所有抽签记录，让全部候选人重新参与？照片会保留。")) return;
  lottery.reset();
  resetDisplay();
  showError("");
  render();
});
$("fullscreen").hidden = !document.fullscreenEnabled;
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    showError(`无法切换全屏：${error.message}`);
  }
});
document.addEventListener("fullscreenchange", () => {
  $("fullscreen").textContent = document.fullscreenElement ? "⛶ 退出全屏" : "⛶ 全屏展示";
});
window.addEventListener("beforeunload", (event) => {
  if (lottery.history.length || lottery.running || importing) {
    event.preventDefault();
    event.returnValue = "";
  }
});
render();
