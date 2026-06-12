/* Gomoku online wiring — uses the shared OnlineLobby (one room number works
 * across all games). Host plays black (1), guest plays white (2). */
(function () {
  const Game = window.GomokuGame;
  window.OnlineLobby.init({
    gameId: "gomoku",
    hostColor: 1,   // black
    guestColor: 2,  // white
    basePrefix: "../",
    startOnline: (myColor, send) => Game.startOnline(myColor, send),
    applyRemote: (msg) => {
      if (msg.t === "move") Game.remoteMove(msg.row, msg.col);
    },
    onPeerLeft: () => Game.peerLeft(),
  });
})();
