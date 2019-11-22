(function($) {
  "use strict";
  let auth,
    defaultColors = {
      c0: "#FFF",
      c1: "#D8D8D8",
      c2: "#60678B",
      c3: "#283350",
      c4: "#1C2242",
      c5: "#57D3C3",
      t1: "#ebff06",
      t2: "#000000"
    },
    fbdb,
    isOnline = true,
    lastGame = {},
    logging = false,
    messageTimer,
    modalTimer,
    scoringEventsTimer;
  // last game player data key
  lastGame.game = [];
  // localData Object
  const localData = {};
  localData.settings = {};
  localData.settings.appColors = {
    c0: defaultColors.c0,
    c1: defaultColors.c1,
    c2: defaultColors.c2,
    c3: defaultColors.c3,
    c4: defaultColors.c4,
    c5: defaultColors.c5
  };
  // ---------------------------------------------------
  // Ready
  // ---------------------------------------------------
  $(window).load(function() {
    // Load FireBase Settings
    const config = {
      apiKey: cs.apiKey,
      authDomain: cs.authDomain,
      databaseURL: cs.databaseURL
    };
    firebase.initializeApp(config);
    auth = firebase.auth();
    fbdb = firebase.database();
    init();
  });
  const init = () => {
    // Make sure they're logged in
    auth.onAuthStateChanged(function(user) {
      if (!user) {
        window.location = "./index.html";
      }
    });
    initLoader();
    initHeader();
    initEvents();
    initSettingsListener();
    initPlayersListener();
    initOfflineDetect();
    sidebarInit();
    rankingToggle("doubles");
  };
  const initHeader = () => {
    $(".app header").html(
      tmpl("appHeader", {
        addScore: i18n.app.appHeader.addScore,
        doubles: i18n.app.appHeader.doubles,
        logOut: i18n.app.appHeader.logOut,
        settings: i18n.app.appHeader.settings,
        singles: i18n.app.appHeader.singles
      })
    );
    $(".app .name").on("click", function() {
      sidebarShow();
      return false;
    });
  };
  const initLoader = () => {
    $(".loader").html(
      tmpl("loader", {
        loading: i18n.app.loader.loading
      })
    );
  };
  // ---------------------------------------------------
  // Events
  // ---------------------------------------------------
  function initEvents() {
    // Log out
    $(".logout").on("click", function() {
      auth.signOut().then(
        function() {
          window.location = "./index.html#logout";
        },
        function(error) {
          console.log("Failed to log out");
        }
      );
      return false;
    });
    // Ranking toggle
    $(".ranking-toggle").on("click", function() {
      const thisView = $(this).data("view");
      rankingToggle(thisView);
      return false;
    });
    // Settings Link
    $(".settings").on("click", function() {
      sidebarToggle();
      return false;
    });
    // Add Score
    $(".add-score").on("click", function() {
      // Hide sidebar if it's showing
      $("body").removeClass("show-sidebar");
      // Show stats modal
      modalShow();
      // Populate from JS template
      $(".modal").html(
        tmpl("scoreAdd", {
          addScoreButton: i18n.app.scoreAdd.addScoreButton,
          addScoreTitle: i18n.app.scoreAdd.addScoreTitle,
          teamOnePlayers: i18n.app.scoreAdd.teamOnePlayers,
          teamOneScore: i18n.app.scoreAdd.teamOneScore,
          teamTwoPlayers: i18n.app.scoreAdd.teamTwoPlayers,
          teamTwoScore: i18n.app.scoreAdd.teamTwoScore
        })
      );
      // Update add score player selection
      scoringPopulatePlayerSelection();
      // Player select event
      $(".players-select a")
        .off("click")
        .on("click", function() {
          if (!$(this).hasClass("is-disabled")) {
            $(this).toggleClass("selected");
          }
          return false;
        });
      return false;
    });
  }
  // ---------------------------------------------------
  // Offline
  // ---------------------------------------------------
  function initOfflineDetect() {
    setTimeout(function() {
      var connectedRef = firebase.database().ref(".info/connected");
      connectedRef.on("value", function(snap) {
        if (snap.val() === false) {
          messageShow("warning", i18n.app.messages.notConnected + "...", true);
          isOnline = false;
        } else {
          isOnline = true;
        }
      });
    }, 2000);
  }
  // ---------------------------------------------------
  // Onboarding
  // ---------------------------------------------------
  function initOnboarding() {
    // Sidebar
    sidebarToggle();
  }
  // ---------------------------------------------------
  // Listeners
  // ---------------------------------------------------
  function initPlayersListener() {
    fbdb.ref("/players/").on("value", function(snapshot) {
      // Update local data set
      localDataUpdate(snapshot.val());
      // Update doubles rankings
      doublesRankingsUpdate();
      // Rankings events
      rankingsEvents();
    });
  }
  function initSettingsListener() {
    fbdb.ref("/settings/").on("value", function(snapshot) {
      // Update local data set
      localSettingsUpdate(snapshot.val());
      // Update colors
      $(".css-block").html(
        tmpl("cssBlock", {
          c0: localData.settings.appColors.c0,
          c1: localData.settings.appColors.c1,
          c2: localData.settings.appColors.c2,
          c3: localData.settings.appColors.c3,
          c4: localData.settings.appColors.c4,
          c5: localData.settings.appColors.c5,
          t1: localData.settings.appColors.t1,
          t2: localData.settings.appColors.t2
        })
      );
      // Update org name
      sidebarBasicSettingsUpdate();
      // Hide loader if it's still showing
      var loader = $(".loader");
      if (loader.is(":visible")) {
        $(".app header").show();
        loader.fadeOut();
      }
    });
  }
  function initUndo() {
    $(".undo")
      .off("click")
      .on("click", function() {
        // Undo game/player scores
        for (var i = 0; i < lastGame.players.scores.length; i++) {
          var data = lastGame.players.scores[i],
            player = data.player,
            type = lastGame.players.type,
            key = data.key,
            points = data.pointsNew - data.lastMovement,
            movement = "",
            lost,
            won;
          if (data.won) {
            (lost = data.gamesLost), (won = parseInt(data.gamesWon, 10) - 1);
            if (won < 0) {
              won = 0;
            }
          } else {
            (lost = parseInt(data.gamesLost, 10) - 1), (won = data.gamesWon);
            if (lost < 0) {
              lost = 0;
            }
          }
          scoringUndo(player, type, key, points, movement, lost, won);
        }
        messageShow("success", i18n.app.messages.gameUndone, true);
      });
  }
  // ---------------------------------------------------
  // Copy of JSON locally
  // ---------------------------------------------------
  const localDataUpdate = data => {
    // Reset everything
    localData.playersArray = [];
    localData.playersByDoubles = [];
    localData.playersByKey = {};
    localData.playersBySingles = [];
    // Update localData.playersByKey
    localData.playersByKey = data;
    // Assemble playerList array
    for (let key in data) {
      if (data.hasOwnProperty(key)) {
        localData.playersArray.push({
          doubles_last_movement: data[key].doubles_last_movement,
          doubles_lost: data[key].doubles_lost,
          doubles_points: data[key].doubles_points,
          doubles_won: data[key].doubles_won,
          dt: data[key].dt,
          key: key,
          name: data[key].name,
          singles_last_movement: data[key].singles_last_movement,
          singles_lost: data[key].singles_lost,
          singles_points: data[key].singles_points,
          singles_won: data[key].singles_won,
          status: data[key].status,
          last_game_goals: data[key].last_game_goals
        });
      }
    }
    localData.playersArray = localData.playersArray.slice(0);
    localData.playersArray.sort(function(a, b) {
      const x = a.name.toLowerCase();
      const y = b.name.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    // Sort by doubles array
    localData.playersByDoubles = localData.playersArray.slice(0);
    localData.playersByDoubles = localData.playersByDoubles
      .sort(function(a, b) {
        return b.doubles_points - a.doubles_points;
      })
      .filter(player => player.doubles_won + player.doubles_lost !== 0);

    for (let i = 0; i < localData.playersByDoubles.length; i++) {
      localData.playersByDoubles[i]["doubles_rank"] = i + 1;
      localData.playersByKey[
        localData.playersByDoubles[i]["key"]
      ].doubles_rank = i + 1;
    }
    // Sort by singles array
    localData.playersBySingles = localData.playersArray.slice(0);
    localData.playersBySingles.sort(function(a, b) {
      return b.singles_points - a.singles_points;
    });
    // Add singles rank to array
    for (let i = 0; i < localData.playersBySingles.length; i++) {
      localData.playersBySingles[i]["singles_rank"] = i + 1;
      localData.playersByKey[
        localData.playersBySingles[i]["key"]
      ].singles_rank = i + 1;
    }
  };
  function localSettingsUpdate(data) {
    // Blank slate
    if (null === data) {
      return initOnboarding();
    }
    localData.settings.orgName =
      typeof data.orgName !== "undefined" ? data.orgName : "";
    localData.settings.gameType =
      typeof data.gameType !== "undefined" ? data.gameType : "";
    if (typeof data.appColors === "undefined") {
      data.appColors = {};
    }
    localData.settings.appColors.c0 =
      typeof data.appColors.c0 !== "undefined"
        ? data.appColors.c0
        : defaultColors.c0;
    localData.settings.appColors.c1 =
      typeof data.appColors.c1 !== "undefined"
        ? data.appColors.c1
        : defaultColors.c1;
    localData.settings.appColors.c2 =
      typeof data.appColors.c2 !== "undefined"
        ? data.appColors.c2
        : defaultColors.c2;
    localData.settings.appColors.c3 =
      typeof data.appColors.c3 !== "undefined"
        ? data.appColors.c3
        : defaultColors.c3;
    localData.settings.appColors.c4 =
      typeof data.appColors.c4 !== "undefined"
        ? data.appColors.c4
        : defaultColors.c4;
    localData.settings.appColors.c5 =
      typeof data.appColors.c5 !== "undefined"
        ? data.appColors.c5
        : defaultColors.c5;

    localData.settings.appColors.t1 =
      typeof data.appColors.t1 !== "undefined"
        ? data.appColors.t1
        : defaultColors.t1;

    localData.settings.appColors.t2 =
      typeof data.appColors.t2 !== "undefined"
        ? data.appColors.t2
        : defaultColors.t2;
  }
  // ---------------------------------------------------
  // Messages
  // ---------------------------------------------------
  function messageShow(type, txt, autoHide) {
    var message = $(".message");
    message.html(txt).addClass("show");
    if (autoHide) {
      clearTimeout(messageTimer);
      messageTimer = setTimeout(function() {
        message.removeClass("show");
      }, 7000);
    }
  }
  // ---------------------------------------------------
  // Modal
  // ---------------------------------------------------
  function modalEvents() {
    $(".modal-close, .modal-backdrop")
      .off("click")
      .on("click", function() {
        modalHide();
        $(".message").removeClass("show");
        return false;
      });
    $(".modal")
      .off("click")
      .on("click", function(e) {
        e.stopPropagation();
      });
  }
  function modalHide() {
    var modalBackdrop = $(".modal-backdrop");
    // Remove show class
    modalBackdrop.removeClass("show");
    // Brief time out for transition
    clearTimeout(modalTimer);
    modalTimer = setTimeout(function() {
      // Display hide
      modalBackdrop.hide();
    }, 200);
  }
  function modalShow() {
    var modalBackdrop = $(".modal-backdrop");
    // Display block
    modalBackdrop.show();
    // Brief time out for transition
    clearTimeout(modalTimer);
    modalTimer = setTimeout(function() {
      // Add show class
      modalBackdrop.addClass("show");
      // Events
      modalEvents();
    }, 200);
  }
  // ---------------------------------------------------
  // Player Settings
  // ---------------------------------------------------
  function playerSettingsUpdate() {
    var playerSettingsUi = "";
    var playersArray = localData.playersArray;
    for (var i = 0; i < playersArray.length; i++) {
      playerSettingsUi += tmpl("playersRow", {
        deleteLink: i18n.app.playersRow.deleteLink,
        key: playersArray[i].key,
        playerName: playersArray[i].name,
        playerStatus: playersArray[i].status ? "Active" : "Inactive",
        avatar: playersArray[i].avatar || ""
      });
    }
    $(".players-list").html(playerSettingsUi);
    playerSettingsEvents();
  }
  function playerSettingsEvents() {
    // Delete Event
    $(".player .player-delete").on("click", function() {
      var key = $(this)
        .closest(".player")
        .data("id");
      if (confirm("Delete " + localData.playersByKey[key].name + "?")) {
        fbdb
          .ref("/players/" + key)
          .remove()
          .then(function() {
            messageShow("success", i18n.app.messages.playerDeleted, true);
            playerSettingsUpdate();
          })
          .catch(function(error) {
            console.log("Failed to delete player");
          });
      }
      return false;
    });
    // Update Event
    $(".player input").keyup(function(event) {
      var key = $(this)
        .closest(".player")
        .data("id");
      if (event.keyCode === 13) {
        fbdb
          .ref("/players/" + key)
          .update(
            {
              name: $(this).val()
            },
            function() {
              messageShow("success", i18n.app.messages.playerUpdated, true);
              playerSettingsUpdate();
            }
          )
          .catch(function(error) {
            console.log("Failed to update player");
          });
      }
      return false;
    });
    // Update Status
    $(".player .player-status").on("click", function() {
      var currentStatus = $(this).text();
      var key = $(this)
        .closest(".player")
        .data("id");
      var newStatus = true;
      if ("Active" === currentStatus) {
        newStatus = false;
      }
      fbdb
        .ref("/players/" + key)
        .update(
          {
            status: newStatus
          },
          function() {
            messageShow("success", i18n.app.messages.playerStatusUpdated, true);
            playerSettingsUpdate();
          }
        )
        .catch(function(error) {
          console.log("Failed to update player status");
        });
      return false;
    });
    $(".players-add-link").on("click", function() {
      $(".players-add").slideDown();
      $(".players-add-form textarea").focus();
      $(this).hide();
      setTimeout(function() {
        sidebarResetHeight();
      }, 600);
      return false;
    });
  }
  // ---------------------------------------------------
  // Rankings | Leaderboard
  // ---------------------------------------------------
  const doublesRankingsUpdate = () => {
    const doublesArray = localData.playersByDoubles;
    let doublesRankings = "";
    let doublesTopRankings = "";
    for (let i = 0; i < doublesArray.length; i++) {
      if (doublesArray[i].status) {
        const doublesLastMovement = doublesArray[i].doubles_last_movement
          ? doublesArray[i].doubles_last_movement.toFixed(2)
          : "";
        const doublesPoints = doublesArray[i].doubles_points
          ? doublesArray[i].doubles_points.toFixed(2)
          : "";
        if (i < 3) {
          doublesTopRankings += tmpl("rankingsRow", {
            key: doublesArray[i].key,
            lastMovement: rankingMovementStyles(doublesLastMovement),
            lastGoalsScored: doublesArray[i].last_game_goals,
            name: doublesArray[i].name,
            points: doublesPoints,
            rank: doublesArray[i].doubles_rank,
            type: "doubles"
          });
        } else {
          doublesRankings += tmpl("rankingsRow", {
            key: doublesArray[i].key,
            lastMovement: rankingMovementStyles(doublesLastMovement),
            name: doublesArray[i].name,
            points: doublesPoints,
            rank: doublesArray[i].doubles_rank,
            lastGoalsScored: doublesArray[i].last_game_goals,
            type: "doubles"
          });
        }
      }
    }
    $(".doubles .top-rankings").html(doublesTopRankings);
    $(".doubles .rankings").html(doublesRankings);
  };
  const rankingsEvents = () => {
    // Show stats
    $(".ranking").on("click", function() {
      // Hide sidebar if it's showing
      $("body").removeClass("show-sidebar");
      // Player key
      const thisKey = $(this).data("id");
      // Show stats modal
      modalShow();
      $(".modal").html(
        tmpl("stats", {
          forText: i18n.app.stats.forText,
          name: localData.playersByKey[thisKey].name,
          playerStats: i18n.app.stats.playerStats,
          avatar: localData.playersByKey[thisKey].avatar || ""
        })
      );
      // Player stats
      const doublesPlayed =
        localData.playersByKey[thisKey].doubles_lost +
        localData.playersByKey[thisKey].doubles_won;
      const singlesPlayed =
        localData.playersByKey[thisKey].singles_lost +
        localData.playersByKey[thisKey].singles_won;
      $(".stats-player").html(
        tmpl("statsPlayer", {
          doubles: i18n.app.statsPlayer.doubles,
          doubles_lost: localData.playersByKey[thisKey].doubles_lost,
          doubles_played: doublesPlayed,
          doubles_rank: localData.playersByKey[thisKey].doubles_rank,
          doubles_won: localData.playersByKey[thisKey].doubles_won,
          doubles_goals: localData.playersByKey[thisKey].doubles_goals,
          doubles_points: localData.playersByKey[thisKey].doubles_points,
          gamesLost: i18n.app.statsPlayer.gamesLost,
          gamesPlayed: i18n.app.statsPlayer.gamesPlayed,
          gamesWon: i18n.app.statsPlayer.gamesWon,
          goalsScored: i18n.app.statsPlayer.goalsScored,
          ranking: i18n.app.statsPlayer.ranking,
          singles: i18n.app.statsPlayer.singles,
          singles_lost: localData.playersByKey[thisKey].singles_lost,
          singles_played: singlesPlayed,
          singles_rank: localData.playersByKey[thisKey].singles_rank,
          singles_won: localData.playersByKey[thisKey].singles_won,
          singles_goals: localData.playersByKey[thisKey].singles_goals
        })
      );
      // Player games stats
      let lastTwentyGames = "";
      const lastTwentyGamesData = [];
      let playersGames = {};
      fbdb
        .ref("/playersgame/" + thisKey)
        .limitToLast(20)
        .once("value")
        .then(function(snapshot) {
          playersGames = snapshot.val();
          // To array
          for (let key in playersGames) {
            lastTwentyGamesData.unshift({
              dt: playersGames[key].dt,
              key: key,
              t1p1: playersGames[key].t1p1,
              t1p2: playersGames[key].t1p2 || "",
              t2p1: playersGames[key].t2p1,
              t2p2: playersGames[key].t2p2 || "",
              t1_points: playersGames[key].t1_points,
              t2_points: playersGames[key].t2_points,
              won: playersGames[key].won
            });
          }
          // Iterate through array
          for (let i = 0; i < lastTwentyGamesData.length; i++) {
            // Game status
            let gameStatus = "Lost";
            if (lastTwentyGamesData[i].won) {
              gameStatus = "Won";
            }
            if (
              !localData.playersByKey[lastTwentyGamesData[i].t1p1] ||
              !localData.playersByKey[lastTwentyGamesData[i].t2p1]
            ) {
              continue;
            }
            // Players
            let t1 =
              localData.playersByKey[lastTwentyGamesData[i].t1p1].name || "";
            let t2 =
              localData.playersByKey[lastTwentyGamesData[i].t2p1].name || "";
            if (lastTwentyGamesData[i].t1p2) {
              if (!localData.playersByKey[lastTwentyGamesData[i].t1p2]) {
                continue;
              }
              var t1p2 =
                localData.playersByKey[lastTwentyGamesData[i].t1p2].name || "";
              t1 += " & " + t1p2;
            }
            if (lastTwentyGamesData[i].t2p2) {
              if (!localData.playersByKey[lastTwentyGamesData[i].t2p2]) {
                continue;
              }
              var t2p2 =
                localData.playersByKey[lastTwentyGamesData[i].t2p2].name || "";
              t2 += " & " + t2p2;
            }
            // Piece it all together
            lastTwentyGames += tmpl("statsPlayerGames", {
              status: gameStatus,
              t1: t1,
              t1Score: lastTwentyGamesData[i].t1_points,
              t2: t2,
              t2Score: lastTwentyGamesData[i].t2_points
            });
          }
          if (!lastTwentyGames) {
            lastTwentyGames =
              "<li>No games have been entered for this user.</li>";
          }
          // Add it to the DOM
          $(".stats-player-games ul").html(lastTwentyGames);
        })
        .catch(function(error) {
          console.log("Unable to pull player game history");
          console.log(error);
        });
    });
  };
  function rankingMovementStyles(movement) {
    if (movement > 0) {
      movement = '<span class="movement-positive">+ ' + movement + "</span>";
    }
    return movement;
  }
  const rankingToggle = viewType => {
    const doubles = $(".doubles");
    const singles = $(".singles");
    // Active link
    $(".ranking-toggle").removeClass("is-selected");
    $('.ranking-toggle[data-view="' + viewType + '"]').addClass("is-selected");
    // Hide/show singles/doubles
    if ("singles" === viewType) {
      doubles.hide();
      singles.fadeIn();
    } else {
      singles.hide();
      doubles.fadeIn();
    }
  };

  // ---------------------------------------------------
  // Scoring
  // ---------------------------------------------------
  function scoringPopulatePlayerSelection() {
    var playersArray = localData.playersArray;
    var playerScoresUi = "";
    for (var i = 0; i < playersArray.length; i++) {
      if (playersArray[i].status) {
        playerScoresUi += tmpl("scorePlayers", {
          key: playersArray[i].key,
          playerName: playersArray[i].name
        });
      }
    }
    $(".t1-players, .t2-players").html(playerScoresUi);
    clearTimeout(scoringEventsTimer);
    scoringEventsTimer = setTimeout(function() {
      scoringEvents();
    }, 300);
  }

  // ---------------------------------------------------
  // Sidebar
  // ---------------------------------------------------
  function sidebarBasicSettingsUpdate() {
    $("#orgName")
      .val(localData.settings.orgName)
      .focus();
    $(".org").text(localData.settings.orgName);
    // Update game type
    var gameType = "";
    if ("air-hockey" === localData.settings.gameType) {
      gameType = "Air Hockey";
    } else if ("billiards" === localData.settings.gameType) {
      gameType = "Billiards";
    } else if ("foosball" === localData.settings.gameType) {
      gameType = "Foosball";
    } else if ("shuffleboard" === localData.settings.gameType) {
      gameType = "Shuffleboard";
    } else {
      gameType = "Table Tennis";
    }
    $(".game-type").text(gameType);
    $('input[value="' + localData.settings.gameType + '"]').prop(
      "checked",
      true
    );
    var lang = localStorage.getItem("lang") || "en";
    $('.lang option[value="' + lang + '"]').attr("selected", true);
  }
  function sidebarHideIris() {
    $(".iris-picker").hide();
  }
  function sidebarInit() {
    $(".sidebar header").html(
      tmpl("sidebarHeader", {
        settings: i18n.app.sidebarHeader.settings
      })
    );
    $(".sidebar .sidebar-menu").html(
      tmpl("sidebarMenu", {
        basics: i18n.app.sidebarMenu.basics,
        colors: i18n.app.sidebarMenu.colors,
        players: i18n.app.sidebarMenu.players,
        users: i18n.app.sidebarMenu.users
      })
    );
    sidebarInitEvents();
    // resize event
    $(window).resize(function() {
      sidebarResetHeight();
    });
  }
  function sidebarInitEvents() {
    $(".sidebar-basics")
      .off("click")
      .on("click", function() {
        sidebarInitBasic();
        sidebarResetHeight();
        return false;
      });
    $(".sidebar-colors")
      .off("click")
      .on("click", function() {
        sidebarInitColor();
        sidebarResetHeight();
        return false;
      });
    $(".sidebar-players")
      .off("click")
      .on("click", function() {
        sidebarInitPlayer();
        sidebarResetHeight();
        return false;
      });
    $(".sidebar-users")
      .off("click")
      .on("click", function() {
        sidebarInitUser();
        sidebarResetHeight();
        return false;
      });
    // Sidebar close
    $(".sidebar .sidebar-close")
      .off("click")
      .on("click", function() {
        $("body").removeClass("show-sidebar");
        return false;
      });
  }
  function sidebarInitBasic() {
    $(".sidebar-body").html(
      tmpl("settingsBasics", {
        companyOrClub: i18n.app.settingsBasics.companyOrClub,
        gameAirHockey: i18n.app.settingsBasics.gameAirHockey,
        gameBilliards: i18n.app.settingsBasics.gameBilliards,
        gameFoosball: i18n.app.settingsBasics.gameFoosball,
        gameShuffleboard: i18n.app.settingsBasics.gameShuffleboard,
        gameTableTennis: i18n.app.settingsBasics.gameTableTennis,
        language: i18n.app.settingsBasics.language,
        nextButton: i18n.app.global.nextButton,
        orgName: i18n.app.settingsBasics.orgName,
        whatGame: i18n.app.settingsBasics.whatGame
      })
    );
    sidebarInitBasicEvents();
    sidebarBasicSettingsUpdate();
    // Update menu bar
    $(".sidebar-menu .c-button").removeClass("active");
    $(".sidebar-basics").addClass("active");
  }
  function sidebarInitBasicEvents() {
    // Update company name
    $("#orgName")
      .off("blur")
      .on("blur", function() {
        var name = $(this).val();
        if (name !== localData.settings.orgName && name !== "") {
          fbdb
            .ref("/settings/")
            .update(
              {
                orgName: $(this).val()
              },
              function() {
                messageShow("success", i18n.app.messages.nameUpdated, true);
              }
            )
            .catch(function(error) {
              console.log("Failed to update name");
            });
        }
        return false;
      });
    // Update game type
    $('input[name="gameType"]')
      .off("change")
      .on("change", function() {
        fbdb
          .ref("/settings/")
          .update(
            {
              gameType: $(this).val()
            },
            function() {
              messageShow("success", i18n.app.messages.gameTypeUpdated, true);
            }
          )
          .catch(function(error) {
            console.log("Failed to update game type");
          });
        return false;
      });
    // Select language
    $(".lang").on("change", function() {
      localStorage.setItem("lang", $(this).val());
      location.reload();
    });
    // Next button
    $(".basics .next")
      .off("click")
      .on("click", function() {
        sidebarInitColor();
        return false;
      });
  }
  function sidebarInitColor() {
    $(".sidebar-body").html(
      tmpl("settingsColors", {
        c0: localData.settings.appColors.c0,
        c1: localData.settings.appColors.c1,
        c2: localData.settings.appColors.c2,
        c3: localData.settings.appColors.c3,
        c4: localData.settings.appColors.c4,
        c5: localData.settings.appColors.c5,
        highlightColor: i18n.app.settingsColors.highlightColor,
        nextButton: i18n.app.global.nextButton,
        primaryBackground: i18n.app.settingsColors.primaryBackground,
        primaryButton: i18n.app.settingsColors.primaryButton,
        primaryText: i18n.app.settingsColors.primaryText,
        resetColors: i18n.app.settingsColors.resetColors,
        secondaryBackground: i18n.app.settingsColors.secondaryBackground,
        secondaryText: i18n.app.settingsColors.secondaryText
      })
    );
    sidebarInitColorEvents();
    // Update menu bar
    $(".sidebar-menu .c-button").removeClass("active");
    $(".sidebar-colors").addClass("active");
  }
  function sidebarInitColorEvents() {
    // Iris
    $(".color-picker").each(function(index) {
      var $this = $(this);
      $this
        .iris({
          palettes: true,
          change: function(event, ui) {
            var newColor = ui.color.toString();
            var id = event.target.id;

            if (!["c0", "c1", "c2", "c3", "c4", "c5"].includes(id)) {
              return false;
            }

            var colorUpdate = { c0: newColor };
            if ("c1" === id) {
              colorUpdate = { c1: newColor };
            } else if ("c2" === id) {
              colorUpdate = { c2: newColor };
            } else if ("c3" === id) {
              colorUpdate = { c3: newColor };
            } else if ("c4" === id) {
              colorUpdate = { c4: newColor };
            } else if ("c5" === id) {
              colorUpdate = { c5: newColor };
            }

            if (newColor !== localData.settings.appColors[id]) {
              fbdb
                .ref("/settings/appColors/")
                .update(colorUpdate, function() {
                  $("." + id + " .swatch").css("background", newColor);
                  messageShow("success", i18n.app.messages.colorUpdated, true);
                })
                .catch(function(error) {
                  console.log("Failed to update color");
                });
            }
          }
        })
        .off("focus")
        .on("focus", function() {
          sidebarHideIris();
          $this.iris("show");
        })
        .off("click")
        .on("click", function(e) {
          e.stopPropagation();
        });
      $(".iris-picker")
        .off("click")
        .on("click", function(e) {
          e.stopPropagation();
        });
      $(".sidebar")
        .off("click")
        .on("click", function() {
          sidebarHideIris();
        });
    });
    // Reset colors
    $(".reset-colors")
      .off("click")
      .on("click", function() {
        if (confirm(i18n.app.settingsColors.resetColors + "?")) {
          fbdb
            .ref("/settings/appColors/")
            .remove()
            .then(function() {
              sidebarInitColor();
            });
        }
        return false;
      });
    // Next button
    $(".colors .next")
      .off("click")
      .on("click", function() {
        sidebarInitPlayer();
        return false;
      });
  }
  function sidebarInitPlayer() {
    $(".sidebar-body").html(
      tmpl("settingsPlayers", {
        addPlayers: i18n.app.settingsPlayers.addPlayers,
        nextButton: i18n.app.global.nextButton,
        onePerLine: i18n.app.settingsPlayers.onePerLine
      })
    );
    // Update player settings
    playerSettingsUpdate();
    sidebarInitPlayerEvents();
    // Update menu bar
    $(".sidebar-menu .c-button").removeClass("active");
    $(".sidebar-players").addClass("active");
  }
  function sidebarInitPlayerEvents() {
    // Add Players
    $(".players-add form")
      .off("click")
      .on("submit", function() {
        var playersField = $(".players-add form textarea");
        $.each(playersField.val().split("\n"), function(index, player) {
          if (!player) {
            return false;
          }
          // Grab a new players key
          var newPlayerKey = fbdb
            .ref()
            .child("players")
            .push().key;
          // Add new player
          var dbPlayers = fbdb.ref("/players/" + newPlayerKey);
          dbPlayers
            .set({
              doubles_last_movement: "",
              doubles_lost: 0,
              doubles_points: 100,
              doubles_won: 0,
              dt: Date.now(),
              name: player,
              singles_last_movement: "",
              singles_lost: 0,
              singles_points: 100,
              singles_won: 0,
              status: true,
              slack_user: "" // Added this to see if it auto updates in the db
            })
            .then(function() {
              playerSettingsUpdate();
              messageShow("success", i18n.app.messages.playerAdded, true);
            })
            .catch(function(error) {
              console.log("Failed to add player");
            });
        });
        // Reset textarea
        playersField.val("").focus();
        // Reset sidebar height
        sidebarResetHeight();
        return false;
      });
    // Next button
    $(".players-view .next")
      .off("click")
      .on("click", function() {
        sidebarInitUser();
        return false;
      });
  }
  function sidebarInitUser() {
    $(".sidebar-body").html(
      tmpl("settingsUsers", {
        manageLogins: i18n.app.settingsUsers.manageLogins,
        nextButton: i18n.app.global.nextButton
      })
    );
    sidebarInitUserEvents();
    // Update menu bar
    $(".sidebar-menu .c-button").removeClass("active");
    $(".sidebar-users").addClass("active");
  }
  function sidebarInitUserEvents() {
    // Account edit link
    $(".account-manage")
      .off("click")
      .on("click", function() {
        var authDomainSplit = config.authDomain.split(".");
        window.location =
          "https://console.firebase.google.com/project/" +
          authDomainSplit[0] +
          "/authentication/users";
        return false;
      });
    // Next button
    $(".users .next")
      .off("click")
      .on("click", function() {
        sidebarInitBasic();
        return false;
      });
  }
  function sidebarResetHeight() {
    $(".sidebar").css("height", "400px");
    var sidebarHeight = parseInt($(".sidebar-container").height());
    var windowHeight = parseInt($(window).height());
    var newSidebarHeight = Math.max(sidebarHeight, windowHeight);
    $(".sidebar").css("height", newSidebarHeight + "px");
  }
  function sidebarShow() {
    $("body").addClass("show-sidebar");
    sidebarInitBasic();
    sidebarResetHeight();
  }
  function sidebarToggle() {
    var body = $("body");
    if (body.hasClass("show-sidebar")) {
      body.removeClass("show-sidebar");
    } else {
      sidebarShow();
    }
  }
})(jQuery);
