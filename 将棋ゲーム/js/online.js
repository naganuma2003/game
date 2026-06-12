/* Shogi online wiring — uses the shared OnlineLobby (one room number works
 * across all games). Host plays 先手(0), guest plays 後手(1). */
(function () {
  const Game = window.ShogiGame;
  window.OnlineLobby.init({
    gameId: "shogi",
    hostColor: 0,   // sente
    guestColor: 1,  // gote
    basePrefix: "../",
    startOnline: (myColor, send) => Game.startOnline(myColor, send),
    applyRemote: (msg) => {
      if (msg.t === "move") Game.remoteMove(msg.move);
    },
    onPeerLeft: () => Game.peerLeft(),
  });
})();
