(function (root) {
  "use strict";

  function personName(filename) {
    return filename.replace(/\.[^.]+$/, "").trim().normalize("NFC");
  }

  function randomIndex(length, cryptoSource = globalThis.crypto) {
    if (!Number.isSafeInteger(length) || length < 1 || length > 0x100000000) {
      throw new RangeError("候选人数无效");
    }
    // Reject the uneven tail so every candidate has exactly the same probability.
    const limit = 0x100000000 - (0x100000000 % length);
    const value = new Uint32Array(1);
    do {
      cryptoSource.getRandomValues(value);
    } while (value[0] >= limit);
    return value[0] % length;
  }

  class Lottery {
    constructor() {
      this.people = [];
      this.history = [];
      this.noRepeat = true;
      this.running = false;
    }

    get eligible() {
      const drawn = new Set(this.history.map((person) => person.id));
      return this.people.filter((person) => !this.noRepeat || !drawn.has(person.id));
    }

    replace(people) {
      if (this.running) throw new Error("请先停止抽签");
      this.people = [...people];
      this.history = [];
    }

    start() {
      if (this.running) throw new Error("抽签已经开始");
      if (!this.eligible.length) throw new Error("没有可抽取的候选人");
      this.running = true;
    }

    stop(cryptoSource) {
      if (!this.running) throw new Error("请先开始抽签");
      const eligible = this.eligible;
      const winner = eligible[randomIndex(eligible.length, cryptoSource)];
      this.history.push(winner);
      this.running = false;
      return winner;
    }

    reset() {
      if (this.running) throw new Error("请先停止抽签");
      this.history = [];
    }
  }

  const api = { personName, randomIndex, Lottery };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PhotoLottery = api;
})(globalThis);
