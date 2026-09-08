const test = require("node:test");
const assert = require("node:assert/strict");
const { Lottery, personName, randomIndex } = require("../public/lottery.js");
const zero = { getRandomValues: (values) => { values[0] = 0; return values; } };
const people = [{ id: 0, name: "张三" }, { id: 1, name: "李四" }, { id: 2, name: "王五" }];

test("names remove only the final extension and normalize whitespace/Unicode", () => {
  assert.equal(personName(" 张三.jpg"), "张三");
  assert.equal(personName("王.五.PNG"), "王.五");
  assert.equal(personName(".jpg"), "");
  assert.equal(personName("e\u0301.jpg"), "é");
});

test("random selection rejects the biased tail and supports one candidate", () => {
  const sequence = [0xffffffff, 5];
  assert.equal(randomIndex(3, { getRandomValues: (values) => { values[0] = sequence.shift(); } }), 2);
  assert.equal(sequence.length, 0);
  assert.equal(randomIndex(1, zero), 0);
  for (const invalid of [0, -1, 1.5, NaN, 0x100000001]) {
    assert.throws(() => randomIndex(invalid, zero), RangeError);
  }
});

test("no-repeat draws exhaust every candidate exactly once", () => {
  const lottery = new Lottery();
  assert.throws(() => lottery.start());
  lottery.replace(people);
  for (const person of people) {
    lottery.start();
    assert.throws(() => lottery.start());
    assert.throws(() => lottery.reset());
    assert.throws(() => lottery.replace([]));
    assert.equal(lottery.stop(zero), person);
    assert.throws(() => lottery.stop(zero));
  }
  assert.equal(lottery.eligible.length, 0);
  assert.equal(new Set(lottery.history).size, people.length);
  assert.throws(() => lottery.start());
  lottery.reset();
  assert.equal(lottery.eligible.length, people.length);
  assert.equal(lottery.history.length, 0);
});

test("repeat mode and switching back respect all historical winners", () => {
  const lottery = new Lottery();
  lottery.replace(people);
  lottery.noRepeat = false;
  for (let i = 0; i < 4; i++) {
    lottery.start();
    assert.equal(lottery.stop(zero), people[0]);
  }
  assert.equal(lottery.eligible.length, 3);
  lottery.noRepeat = true;
  assert.deepEqual(lottery.eligible, people.slice(1));
  lottery.replace([people[0]]);
  assert.equal(lottery.history.length, 0);
  assert.equal(lottery.eligible.length, 1);
});

test("result is sampled only at stop and RNG errors never record a winner", () => {
  const lottery = new Lottery();
  lottery.replace(people);
  lottery.start();
  assert.equal(lottery.history.length, 0);
  assert.throws(() => lottery.stop({ getRandomValues() { throw new Error("RNG unavailable"); } }));
  assert.equal(lottery.history.length, 0);
  assert.equal(lottery.stop({ getRandomValues: (values) => { values[0] = 2; } }), people[2]);
});
