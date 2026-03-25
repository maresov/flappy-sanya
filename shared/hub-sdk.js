// GameHub SDK — Supabase backend + localStorage fallback
(function () {
  var STORAGE_PLAYER = 'gamehub_player';
  var STORAGE_SCORES = 'gamehub_scores';

  // ============ SUPABASE CLIENT ============
  var sb = null; // Supabase client instance

  function _initSupabase() {
    if (sb) return sb;
    var cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) return null;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
    try {
      sb = window.supabase.createClient(cfg.url, cfg.anonKey);
      return sb;
    } catch (e) {
      console.warn('[GameHub] Supabase init failed:', e);
      return null;
    }
  }

  function _hasSupabase() {
    return !!_initSupabase();
  }

  // ============ PLAYER (local + Supabase sync) ============

  function getPlayer() {
    try {
      var raw = localStorage.getItem(STORAGE_PLAYER);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data && data.nickname ? data : null;
    } catch (e) {
      return null;
    }
  }

  function setPlayer(nickname) {
    if (!nickname || typeof nickname !== 'string') return;
    var trimmed = nickname.trim();
    localStorage.setItem(STORAGE_PLAYER, JSON.stringify({ nickname: trimmed }));
    // Sync to Supabase (fire and forget)
    _syncPlayerToSupabase(trimmed);
  }

  function _syncPlayerToSupabase(nickname) {
    // No-op: player creation is now handled by registerPlayer/verifyPin
  }

  // ============ PIN-BASED AUTH ============

  function _generatePin() {
    var a = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    var b = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    return a + '-' + b;
  }

  function checkNickname(nickname) {
    if (!_hasSupabase()) return Promise.resolve({exists: false});
    return sb.from('players').select('id').eq('nickname', nickname).then(function(res) {
      return {exists: !res.error && res.data && res.data.length > 0};
    });
  }

  function registerPlayer(nickname) {
    var pin = _generatePin();
    if (!_hasSupabase()) {
      // Offline fallback: just set locally, no pin
      setPlayer(nickname);
      return Promise.resolve({pin: null, offline: true});
    }
    return sb.from('players').insert({nickname: nickname, pin: pin}).select('id, nickname, pin').single().then(function(res) {
      if (res.error) {
        if (res.error.code === '23505') return {error: 'nickname_taken'};
        return {error: res.error.message};
      }
      localStorage.setItem(STORAGE_PLAYER, JSON.stringify({nickname: nickname}));
      return {pin: res.data.pin};
    });
  }

  function verifyPin(nickname, pin) {
    if (!_hasSupabase()) return Promise.resolve({ok: true});
    return sb.from('players').select('id, pin').eq('nickname', nickname).single().then(function(res) {
      if (res.error || !res.data) return {ok: false, error: 'not_found'};
      if (res.data.pin === pin) {
        localStorage.setItem(STORAGE_PLAYER, JSON.stringify({nickname: nickname}));
        return {ok: true};
      }
      return {ok: false, error: 'wrong_pin'};
    });
  }

  // ============ ANONYMOUS CHECK ============

  function _isAnonymous() {
    var player = getPlayer();
    return !player || player.nickname === 'Аноним';
  }

  var _sessionScores = [];

  // ============ LOCAL STORAGE SCORES (fallback) ============

  function _loadLocalScores() {
    try {
      var raw = localStorage.getItem(STORAGE_SCORES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function _saveLocalScores(scores) {
    localStorage.setItem(STORAGE_SCORES, JSON.stringify(scores));
  }

  // ============ SUBMIT SCORE ============

  function submitScore(gameSlug, score) {
    var player = getPlayer();
    if (!player) return;

    var entry = {
      gameSlug: gameSlug,
      nickname: player.nickname,
      score: score,
      date: new Date().toISOString()
    };

    // Anonymous: session only
    if (_isAnonymous()) {
      _sessionScores.push(entry);
      return;
    }

    // Always save locally (instant, offline-safe)
    var localScores = _loadLocalScores();
    localScores.push(entry);
    _saveLocalScores(localScores);

    // Also push to Supabase
    if (_hasSupabase()) {
      _submitToSupabase(player.nickname, gameSlug, score);
    }
  }

  function _submitToSupabase(nickname, gameSlug, score) {
    // First get player_id
    sb.from('players')
      .select('id')
      .eq('nickname', nickname)
      .single()
      .then(function (res) {
        if (res.error || !res.data) {
          // Player not found — create first, then submit
          sb.from('players')
            .insert({ nickname: nickname })
            .select('id')
            .single()
            .then(function (res2) {
              if (res2.data) {
                _insertScore(res2.data.id, gameSlug, score);
              }
            });
          return;
        }
        _insertScore(res.data.id, gameSlug, score);
      });
  }

  function _insertScore(playerId, gameSlug, score) {
    sb.from('scores')
      .insert({ player_id: playerId, game_slug: gameSlug, score: score })
      .then(function (res) {
        if (res.error) console.warn('[GameHub] Score submit error:', res.error.message);
      });
  }

  // ============ LEADERBOARD ============

  function getLeaderboard(gameSlug, limit) {
    limit = limit || 10;

    // If Supabase available, return a promise-like that also works sync
    // For backwards compat, we return local data immediately
    // and provide an async version
    return _getLocalLeaderboard(gameSlug, limit);
  }

  // Async version — returns Promise with Supabase data
  function getLeaderboardAsync(gameSlug, limit) {
    limit = limit || 10;
    if (!_hasSupabase() || _isAnonymous()) {
      return Promise.resolve(_getLocalLeaderboard(gameSlug, limit));
    }

    return sb.from('leaderboard')
      .select('nickname, score, created_at')
      .eq('game_slug', gameSlug)
      .order('score', { ascending: false })
      .limit(limit)
      .then(function (res) {
        if (res.error || !res.data) {
          return _getLocalLeaderboard(gameSlug, limit);
        }
        return res.data.map(function (row) {
          return { nickname: row.nickname, score: row.score, date: row.created_at };
        });
      })
      .catch(function () {
        return _getLocalLeaderboard(gameSlug, limit);
      });
  }

  function _getLocalLeaderboard(gameSlug, limit) {
    var scores = _getAllLocalScores().filter(function (s) { return s.gameSlug === gameSlug; });
    var best = {};
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

  function _getAllLocalScores() {
    if (_isAnonymous()) return _sessionScores;
    return _loadLocalScores().filter(function (s) { return s.nickname !== 'Аноним'; });
  }

  // ============ MY SCORES ============

  function getMyScores(gameSlug) {
    var player = getPlayer();
    if (!player) return [];
    return _getAllLocalScores()
      .filter(function (s) { return s.gameSlug === gameSlug && s.nickname === player.nickname; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  function getAllMyScores() {
    var player = getPlayer();
    if (!player) return [];
    return _getAllLocalScores()
      .filter(function (s) { return s.nickname === player.nickname; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  function getMyBestScore(gameSlug) {
    var scores = getMyScores(gameSlug);
    return scores.length > 0 ? scores[0].score : null;
  }

  // Async version — checks Supabase for best score
  function getMyBestScoreAsync(gameSlug) {
    var player = getPlayer();
    if (!player || _isAnonymous() || !_hasSupabase()) {
      return Promise.resolve(getMyBestScore(gameSlug));
    }

    return sb.from('scores')
      .select('score, players!inner(nickname)')
      .eq('game_slug', gameSlug)
      .eq('players.nickname', player.nickname)
      .order('score', { ascending: false })
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || res.data.length === 0) {
          return getMyBestScore(gameSlug);
        }
        var supaScore = res.data[0].score;
        var localScore = getMyBestScore(gameSlug) || 0;
        return Math.max(supaScore, localScore);
      })
      .catch(function () {
        return getMyBestScore(gameSlug);
      });
  }

  // ============ NAVIGATION ============

  function backToHub() {
    var path = window.location.pathname;
    var gamesIdx = path.indexOf('/games/');
    if (gamesIdx >= 0) {
      window.location.href = path.substring(0, gamesIdx + 1);
    } else {
      window.location.href = '/';
    }
  }

  // ============ MIGRATE LOCAL DATA TO SUPABASE ============

  function migrateToSupabase() {
    if (!_hasSupabase() || _isAnonymous()) return Promise.resolve(false);

    var player = getPlayer();
    var localScores = _loadLocalScores().filter(function (s) {
      return s.nickname === player.nickname;
    });

    if (localScores.length === 0) return Promise.resolve(true);

    // Ensure player exists
    return sb.from('players')
      .upsert({ nickname: player.nickname }, { onConflict: 'nickname' })
      .select('id')
      .single()
      .then(function (res) {
        if (res.error || !res.data) return false;
        var playerId = res.data.id;

        // Batch insert local scores (only best per game to avoid duplicates)
        var bestPerGame = {};
        localScores.forEach(function (s) {
          if (!bestPerGame[s.gameSlug] || s.score > bestPerGame[s.gameSlug].score) {
            bestPerGame[s.gameSlug] = s;
          }
        });

        var rows = Object.values(bestPerGame).map(function (s) {
          return { player_id: playerId, game_slug: s.gameSlug, score: s.score };
        });

        return sb.from('scores')
          .insert(rows)
          .then(function (res2) {
            if (res2.error) {
              console.warn('[GameHub] Migration partial error:', res2.error.message);
            }
            return true;
          });
      })
      .catch(function (e) {
        console.warn('[GameHub] Migration failed:', e);
        return false;
      });
  }

  // ============ PUBLIC API ============

  window.GameHub = {
    getPlayer: getPlayer,
    setPlayer: setPlayer,
    submitScore: submitScore,
    getLeaderboard: getLeaderboard,
    getLeaderboardAsync: getLeaderboardAsync,
    getMyScores: getMyScores,
    getAllMyScores: getAllMyScores,
    getMyBestScore: getMyBestScore,
    getMyBestScoreAsync: getMyBestScoreAsync,
    checkNickname: checkNickname,
    registerPlayer: registerPlayer,
    verifyPin: verifyPin,
    backToHub: backToHub,
    migrateToSupabase: migrateToSupabase,
    isSupabaseReady: _hasSupabase
  };
})();
