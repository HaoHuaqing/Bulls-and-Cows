const test = require("node:test");
const assert = require("node:assert/strict");
const { isValid4UniqueDigits, scoreGuess } = require("./gameRules");

test("isValid4UniqueDigits should validate 4 unique digits", () => {
  assert.equal(isValid4UniqueDigits("1234"), true);
  assert.equal(isValid4UniqueDigits("0123"), true);
  assert.equal(isValid4UniqueDigits("1123"), false);
  assert.equal(isValid4UniqueDigits("123"), false);
  assert.equal(isValid4UniqueDigits("12a4"), false);
});

test("scoreGuess should return exact match 4A0B", () => {
  assert.deepEqual(scoreGuess("1234", "1234"), { A: 4, B: 0 });
});

test("scoreGuess should return 0A4B for all digits swapped", () => {
  assert.deepEqual(scoreGuess("1234", "4321"), { A: 0, B: 4 });
});

test("scoreGuess should return mixed A/B values", () => {
  assert.deepEqual(scoreGuess("4271", "4712"), { A: 1, B: 3 });
  assert.deepEqual(scoreGuess("4271", "4056"), { A: 1, B: 0 });
});

test("scoreGuess should throw on invalid input", () => {
  assert.throws(() => scoreGuess("1123", "1234"), /Invalid secret/);
  assert.throws(() => scoreGuess("1234", "1224"), /Invalid guess/);
});
