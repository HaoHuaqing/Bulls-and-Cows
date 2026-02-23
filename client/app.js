(function bootstrap() {
  const socket = io();

  const createRoomBtn = document.getElementById("create-room-btn");
  const joinRoomBtn = document.getElementById("join-room-btn");
  const joinRoomInput = document.getElementById("join-room-input");
  const identityText = document.getElementById("identity-text");
  const socketText = document.getElementById("socket-text");
  const statusText = document.getElementById("status-text");
  const turnText = document.getElementById("turn-text");
  const secretStateText = document.getElementById("secret-state-text");
  const attemptText = document.getElementById("attempt-text");
  const hintText = document.getElementById("hint-text");
  const secretInput = document.getElementById("secret-input");
  const setSecretBtn = document.getElementById("set-secret-btn");
  const secretPreview = document.getElementById("secret-preview");
  const guessInput = document.getElementById("guess-input");
  const submitGuessBtn = document.getElementById("submit-guess-btn");
  const historyBody = document.getElementById("history-body");
  const restartBtn = document.getElementById("restart-btn");
  const messageText = document.getElementById("message-text");

  let role = "none";
  let roomCode = "";
  let state = null;

  function roleLabel(value) {
    if (value === "host") {
      return "Host";
    }
    if (value === "guest") {
      return "Guest";
    }
    return "-";
  }

  function isValid4UniqueDigits(value) {
    return /^[0-9]{4}$/.test(value) && new Set(value).size === 4;
  }

  function setMessage(text, isError = false) {
    messageText.textContent = text || "";
    messageText.style.color = isError ? "#b91c1c" : "#065f46";
  }

  function updateIdentity() {
    identityText.textContent = `Role: ${role} | Room: ${roomCode || "-"}`;
  }

  function renderHistory() {
    historyBody.innerHTML = "";
    const history = state && state.history ? state.history : [];
    history.forEach((item) => {
      const tr = document.createElement("tr");
      const time = new Date(item.at).toLocaleTimeString();
      tr.innerHTML = `<td>${roleLabel(item.by)}</td><td>${item.no}</td><td>${item.guess}</td><td>${item.A}A${item.B}B</td><td>${time}</td>`;
      historyBody.appendChild(tr);
    });
  }

  function renderState() {
    if (!state) {
      statusText.textContent = "Status: not in room";
      turnText.textContent = "Turn: -";
      secretStateText.textContent = "Secrets: -";
      attemptText.textContent = "Attempts: -";
      hintText.textContent = "";
      secretPreview.textContent = "Current secret: -";
      setSecretBtn.disabled = true;
      secretInput.disabled = true;
      submitGuessBtn.disabled = true;
      guessInput.disabled = true;
      renderHistory();
      return;
    }

    const statusMap = {
      waiting_guest: "Waiting guest",
      waiting_secrets: "Waiting both players to set secrets",
      playing: "Playing",
      final_chance: "Final chance",
      finished: "Finished"
    };
    statusText.textContent = `Status: ${statusMap[state.status] || state.status}`;
    turnText.textContent = `Turn: ${roleLabel(state.turnRole)}`;
    secretStateText.textContent = `Secrets: Host ${state.secretSet.host ? "set" : "pending"} | Guest ${
      state.secretSet.guest ? "set" : "pending"
    }`;
    attemptText.textContent = `Attempts: Me ${state.guessCounts.me}${state.solvedAtAttempt.me !== null ? ` (solved in ${state.solvedAtAttempt.me})` : ""} | Opponent ${state.guessCounts.opponent}${
      state.solvedAtAttempt.opponent !== null ? ` (solved in ${state.solvedAtAttempt.opponent})` : ""
    }`;

    if (state.status === "finished") {
      if (state.winner === "draw") {
        hintText.textContent = "Round result: Draw (same attempts).";
      } else if (state.winner === role) {
        hintText.textContent = "Round result: You win.";
      } else {
        hintText.textContent = `Round result: ${roleLabel(state.winner)} wins.`;
      }
    } else if (state.status === "waiting_guest") {
      hintText.textContent = "Waiting for guest to join.";
    } else if (state.status === "waiting_secrets") {
      if (!state.mySecret) {
        hintText.textContent = "Set your own 4-digit secret first.";
      } else {
        hintText.textContent = "Waiting for opponent to set secret.";
      }
    } else if (state.status === "playing") {
      hintText.textContent = state.turnRole === role ? "Your turn: guess opponent secret." : "Wait for opponent turn.";
    } else if (state.status === "final_chance") {
      hintText.textContent =
        state.finalChanceRole === role
          ? "Opponent (starter) guessed correctly. This is your final equal-attempt chance."
          : "You guessed correctly as starter. Waiting opponent's final chance.";
    } else {
      hintText.textContent = "";
    }

    const canSetSecret =
      role !== "none" && (state.status === "waiting_guest" || state.status === "waiting_secrets");
    setSecretBtn.disabled = !canSetSecret;
    secretInput.disabled = !canSetSecret;
    secretPreview.textContent = state.mySecret ? `Current secret: ${state.mySecret}` : "Current secret: -";

    const canGuess =
      role !== "none" && (state.status === "playing" || state.status === "final_chance") && state.turnRole === role;
    submitGuessBtn.disabled = !canGuess;
    guessInput.disabled = !canGuess;

    restartBtn.disabled = role === "none";

    renderHistory();
  }

  createRoomBtn.addEventListener("click", () => {
    socket.emit("room:create", (res) => {
      if (!res || !res.ok) {
        setMessage("Failed to create room.", true);
        return;
      }
      role = "host";
      roomCode = res.roomCode;
      state = null;
      updateIdentity();
      renderState();
      setMessage(`Room created: ${roomCode}`);
    });
  });

  joinRoomBtn.addEventListener("click", () => {
    const targetCode = joinRoomInput.value.trim();
    if (!/^[0-9]{6}$/.test(targetCode)) {
      setMessage("Room code must be 6 digits.", true);
      return;
    }
    socket.emit("room:join", { roomCode: targetCode }, (res) => {
      if (!res || !res.ok) {
        setMessage(res && res.reason ? res.reason : "Join room failed.", true);
        return;
      }
      role = "guest";
      roomCode = targetCode;
      state = null;
      updateIdentity();
      renderState();
      setMessage(`Joined room: ${roomCode}`);
    });
  });

  setSecretBtn.addEventListener("click", () => {
    const secret = secretInput.value.trim();
    if (!isValid4UniqueDigits(secret)) {
      setMessage("Secret must be 4 unique digits.", true);
      return;
    }
    socket.emit("secret:set", { secret }, (res) => {
      if (!res || !res.ok) {
        setMessage(res && res.reason ? res.reason : "Set secret failed.", true);
        return;
      }
      setMessage("Secret set.");
      secretInput.value = "";
    });
  });

  submitGuessBtn.addEventListener("click", () => {
    const guess = guessInput.value.trim();
    if (!isValid4UniqueDigits(guess)) {
      setMessage("Guess must be 4 unique digits.", true);
      return;
    }
    socket.emit("guess:submit", { guess }, (res) => {
      if (!res || !res.ok) {
        setMessage(res && res.reason ? res.reason : "Submit guess failed.", true);
        return;
      }
      setMessage(`Result: ${res.entry.A}A${res.entry.B}B`);
      guessInput.value = "";
    });
  });

  restartBtn.addEventListener("click", () => {
    socket.emit("round:restart", (res) => {
      if (!res || !res.ok) {
        setMessage(res && res.reason ? res.reason : "Restart failed.", true);
        return;
      }
      setMessage("Round restarted. Both players should set secrets again.");
      secretInput.value = "";
      guessInput.value = "";
    });
  });

  socket.on("state:update", (nextState) => {
    state = nextState;
    renderState();
  });

  socket.on("room:closed", (payload) => {
    setMessage((payload && payload.reason) || "Room closed.", true);
    role = "none";
    roomCode = "";
    state = null;
    updateIdentity();
    renderState();
  });

  socket.on("connect", () => {
    socketText.textContent = `Socket: connected (${socket.id})`;
  });

  socket.on("disconnect", () => {
    socketText.textContent = "Socket: disconnected";
    setMessage("Disconnected from server.", true);
  });

  updateIdentity();
  renderState();
})();
