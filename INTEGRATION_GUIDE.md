# Dolwin Bash Integration Guide (Client Spec)

This document follows only the client PDF contract:
`Dolwin Bash Game Integration – JavaScript Interface Specification`.

## 1. Game Event Callbacks (Game -> Platform)

### 1.1 Game Ready

```js
window.gameReady()
```

Called when game is fully loaded and ready.

### 1.2 Round Start

```js
window.onRoundStart(betAmount)
```

Called when player presses Play.

- `betAmount` (`Number`): selected bet.

### 1.3 Round End

```js
window.onRoundEnd(roundId, winAmount)
```

Called when round animation finishes.

- `roundId` (`String`): round id from platform `startGame(...)`.
- `winAmount` (`Number`): final displayed win amount.

### 1.4 Error Event

```js
window.onGameError(error)
```

Called when unexpected game/runtime error occurs.

- `error` (`String`): error message.

### 1.5 Autoplay Start

```js
window.onAutoplayStart(betAmount, numberOfSpins)
```

Called when autoplay starts.

- `betAmount` (`Number`)
- `numberOfSpins` (`Number`)

---

## 2. Platform Control Functions (Platform -> Game)

### 2.1 Update Balance

```js
window.updateBalance(balance)
```

- `balance` (`Number`): wallet balance shown in game.

### 2.2 Start Game

```js
window.startGame(roundId, betAmount, winAmount, crashPoint)
```

- `roundId` (`String`)
- `betAmount` (`Number`)
- `winAmount` (`Number`)
- `crashPoint` (`Number`)

Behavior:
- starts round with provided round id
- applies provided bet to UI
- final displayed result honors platform win/crash data

### 2.3 Update Multiplier

```js
window.updateMultiplier(multiplier)
```

- `multiplier` (`Number`)

### 2.4 Update Bet Amount

```js
window.updateBetAmount(betAmount)
```

- `betAmount` (`Number`)

### 2.5 Update Autoplay Remaining Spins

```js
window.updateAutoplayRemainingSpins(remainingSpins)
```

- `remainingSpins` (`Number`)

### 2.6 Set Translations

```js
window.setTranslations({
  play: "Play",
  replay: "Replay",
  balance: "Balance",
  bet: "Bet",
  multiplier: "Multiplier",
  combo: "Combo",
  roundEnded: "Round ended",
  roundOver: "Round over",
  youWon: "You won!",
  payout: "Payout",
  distance: "Distance",
  autoplaySettings: "Autoplay settings",
  autoplaySpins: "Numbers of autospins:",
  startAutoplay: "Start autoplay",
  speed: "Speed",
  speedButtonTitle: "Speed: {mode}",
  loadingAssets: "Preparing Game Assets",
  waiting: "WAIT...",
  waitingServer: "Waiting for server...",
  stopAutoplay: "Stop autoplay",
  muteToggle: "Mute / Unmute",
  close: "Close",
  insufficientBalanceTitle: "INSUFFICIENT BALANCE",
  insufficientBalanceHint: "Please reduce bet amount.",
  insufficientBalanceDetail: "Bet {bet} is greater than balance {balance}.",
  ok: "OK",
  state: "State",
  previous: "Prev"
})
```

Behavior:
- applies platform-provided language map to in-game UI text
- can be called at `gameReady` and again when language changes

---

## 3. Round Flow (Per Client Spec)

1. Game loads  
2. Game calls `gameReady()`  
3. Platform calls `updateBalance(balance)`  
4. Player presses Play  
5. Game calls `onRoundStart(betAmount)`  
6. Platform validates and determines round result  
7. Platform calls `startGame(roundId, betAmount, winAmount, crashPoint)`  
8. Game starts **only now** (server-authoritative round start) and plays animation  
9. Game calls `onRoundEnd(roundId, winAmount)`  
10. Platform settles wallet and may call `updateBalance(balance)` again

---

## 4. Host Integration Skeleton

```js
window.gameReady = async () => {
  const balance = await walletApi.getBalance();
  window.updateBalance(balance);
  window.setTranslations(await i18nApi.getGameTranslations("dolwin-bash"));
};

window.onRoundStart = async (betAmount) => {
  const round = await gameApi.createRound({ betAmount });
  window.startGame(round.roundId, round.betAmount, round.winAmount, round.crashPoint);
};

window.onRoundEnd = async (roundId, winAmount) => {
  await gameApi.settleRound({ roundId, winAmount });
  const balance = await walletApi.getBalance();
  window.updateBalance(balance);
};

window.onAutoplayStart = (betAmount, numberOfSpins) => {
  // Optional tracking/logging
};

window.onGameError = (error) => {
  console.error("Dolwin game error:", error);
};
```

