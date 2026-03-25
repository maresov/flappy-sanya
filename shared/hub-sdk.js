// GameHub SDK — localStorage-based auth + scores
(function () {
  const STORAGE_PLAYER = 'gamehub_player';
  const STORAGE_SCORES = 'gamehub_scores';

  function getPlayer() {
    try {
      const raw = localStorage.getItem(STORAGE_PLAYER);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.nickname ? data : null;
    } catch (e) {
      return null;
    }
  }

  function setPlayer(nickname) {
    if (!nickname || typeof nickname !== 'string') return;
    localStorage.setItem(STORAGE_PLAYER, JSON.stringify({ nickname: nickname.trim() }));
  }

  function _loadScores() {
    try {
      const raw = localStorage.getItem(STORAGE_SCORES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function _saveScores(scores) {
    localStorage.setItem(STORAGE_SCORES, JSON.stringify(scores));
  }

  function submitScore(gameSlug, score) {
    const player = getPlayer();
    if (!player) return;
    const scores = _loadScores();
    scores.push({
      gameSlug: gameSlug,
      nickname: player.nickname,
      score: score,
      date: new Date().toISOString()
    });
    _saveScores(scores);
  }

  function getLeaderboard(gameSlug, limit) {
    limit = limit || 10;
    const scores = _loadScores().filter(function (s) { return s.gameSlug === gameSlug; });
    // Group by nickname, keep best score per player
    const best = {};
    scores.forEach(function (s) {
      if (!best[s.nickname] || s.score > best[s.nickname].score) {
        best[s.nickname] = s;
      }
    });
    return Object.values(best)
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit)
      .map(function (s) { return { nickname: s.nickname, score: s.score, date: s.date }; });
  }

  function getMyScores(gameSlug) {
    var player = getPlayer();
    if (!player) return [];
    return _loadScores()
      .filter(function (s) { return s.gameSlug === gameSlug && s.nickname === player.nickname; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  function getAllMyScores() {
    var player = getPlayer();
    if (!player) return [];
    return _loadScores()
      .filter(function (s) { return s.nickname === player.nickname; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  function getMyBestScore(gameSlug) {
    var scores = getMyScores(gameSlug);
    return scores.length > 0 ? scores[0].score : null;
  }

  function backToHub() {
    // Navigate to hub root, handling relative paths from any game depth
    var path = window.location.pathname;
    // If we're at /flappy-sanya/games/slug/ -> go to /flappy-sanya/
    // Find the 'games/' segment and go one level above it
    var gamesIdx = path.indexOf('/games/');
    if (gamesIdx >= 0) {
      window.location.href = path.substring(0, gamesIdx + 1);
    } else {
      window.location.href = '/';
    }
  }

  window.GameHub = {
    getPlayer: getPlayer,
    setPlayer: setPlayer,
    submitScore: submitScore,
    getLeaderboard: getLeaderboard,
    getMyScores: getMyScores,
    getAllMyScores: getAllMyScores,
    getMyBestScore: getMyBestScore,
    backToHub: backToHub
  };
})();
