// GameHub SDK — Supabase-only backend
(function () {
  var STORAGE_PLAYER = 'gamehub_player';

  // ============ SUPABASE CLIENT ============
  var sb = null;

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

  // ============ PLAYER ============

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
    var pin = (nickname === ADMIN_NICK) ? ADMIN_PIN : _generatePin();
    if (!_hasSupabase()) {
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

  // ============ SUBMIT SCORE ============

  function submitScore(gameSlug, score) {
    var player = getPlayer();
    if (!player || _isAnonymous()) return;
    if (!_hasSupabase()) return;
    _submitToSupabase(player.nickname, gameSlug, score);
  }

  function _submitToSupabase(nickname, gameSlug, score) {
    sb.from('players')
      .select('id')
      .eq('nickname', nickname)
      .single()
      .then(function (res) {
        if (res.error || !res.data) {
          // Player not found — create for score tracking
          sb.from('players')
            .insert({ nickname: nickname })
            .select('id')
            .single()
            .then(function (res2) {
              if (res2.data) _insertScore(res2.data.id, gameSlug, score);
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
    return []; // Sync version returns empty — use async
  }

  function getLeaderboardAsync(gameSlug, limit) {
    limit = limit || 10;
    if (!_hasSupabase()) return Promise.resolve([]);

    return sb.from('leaderboard')
      .select('nickname, score, created_at')
      .eq('game_slug', gameSlug)
      .order('score', { ascending: false })
      .limit(limit)
      .then(function (res) {
        if (res.error || !res.data) return [];
        return res.data.map(function (row) {
          return { nickname: row.nickname, score: row.score, date: row.created_at };
        });
      })
      .catch(function () {
        return [];
      });
  }

  // ============ MY SCORES ============

  function getMyScores(gameSlug) {
    return []; // Sync version returns empty — use async
  }

  function getAllMyScores() {
    return []; // Sync version returns empty — use async
  }

  function getMyBestScore(gameSlug) {
    return null; // Sync version returns null — use async
  }

  function getMyBestScoreAsync(gameSlug) {
    var player = getPlayer();
    if (!player || _isAnonymous() || !_hasSupabase()) {
      return Promise.resolve(null);
    }

    return sb.from('scores')
      .select('score, players!inner(nickname)')
      .eq('game_slug', gameSlug)
      .eq('players.nickname', player.nickname)
      .order('score', { ascending: false })
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || res.data.length === 0) return null;
        return res.data[0].score;
      })
      .catch(function () {
        return null;
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

  // ============ ADMIN ============

  var ADMIN_NICK = 'Админ';
  var ADMIN_PIN = '42-42';

  function isAdmin() {
    var player = getPlayer();
    return player && player.nickname === ADMIN_NICK;
  }

  function adminClearScores(gameSlug) {
    if (!isAdmin()) return Promise.resolve({error: 'not_admin'});
    if (!_hasSupabase()) return Promise.resolve({error: 'no_supabase'});

    return sb.from('scores')
      .delete()
      .eq('game_slug', gameSlug)
      .then(function(res) {
        if (res.error) return {error: res.error.message};
        return {ok: true};
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
    isSupabaseReady: _hasSupabase,
    isAdmin: isAdmin,
    adminClearScores: adminClearScores
  };
})();
