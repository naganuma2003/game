/* Othello online wiring — uses the shared OnlineLobby (one room number works
 * across all games). Host plays black (1), guest plays white (2). */
(function () {
  const Game = window.OthelloGame;
  window.OnlineLobby.init({
    gameId: "othello",
    hostColor: 1,   // black
    guestColor: 2,  // white
    basePrefix: "../",
    startOnline: (myColor, send) => Game.startOnline(myColor, send),
    applyRemote: (msg) => {
      if (msg.t === "move") Game.remoteMove(msg.row, msg.col);
      else if (msg.t === "pass") Game.remotePass();
    },
    onPeerLeft: () => Game.peerLeft(),
  });
})();
