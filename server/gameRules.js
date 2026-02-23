const ROOM_CODE_LENGTH = 6;

function isValid4UniqueDigits(value) {
  if (typeof value !== "string" || !/^[0-9]{4}$/.test(value)) {
    return false;
  }
  return new Set(value).size === 4;
}

function scoreGuess(secret, guess) {
  if (!isValid4UniqueDigits(secret)) {
    throw new Error("Invalid secret");
  }
  if (!isValid4UniqueDigits(guess)) {
    throw new Error("Invalid guess");
  }

  let a = 0;
  let overlap = 0;

  for (let i = 0; i < 4; i += 1) {
    if (secret[i] === guess[i]) {
      a += 1;
    }
    if (secret.includes(guess[i])) {
      overlap += 1;
    }
  }

  return {
    A: a,
    B: overlap - a
  };
}

function normalizeRoomCode(input) {
  return String(input || "").trim();
}

function generateRoomCode(existingCodes) {
  const maxTries = 3000;
  for (let i = 0; i < maxTries; i += 1) {
    const code = String(Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH)).padStart(
      ROOM_CODE_LENGTH,
      "0"
    );
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  throw new Error("Unable to allocate room code");
}

module.exports = {
  isValid4UniqueDigits,
  scoreGuess,
  normalizeRoomCode,
  generateRoomCode
};
