function resetCurrentInningsPlayerStats(match) {
    Object.values(match.teams || {}).forEach((team) => {
        team.players = (team.players || []).map((player) => ({
            ...player,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            wickets: 0,
            bowlerBalls: 0,
            runsConceded: 0,
            out: false
        }));
    });

    (match.balls || []).forEach((ball) => {
        if (Number(ball.innings) !== Number(match.currentInnings)) {
            return;
        }

        const battingTeam = Object.values(match.teams).find(
            (item) => item.name === ball.battingTeam
        );
        const bowlingTeam = Object.values(match.teams).find(
            (item) => item.name === ball.bowlingTeam
        );
        const batter = battingTeam?.players.find(
            (player) => player.id === ball.strikerId
        );
        const bowler = bowlingTeam?.players.find(
            (player) => player.id === ball.bowlerId
        );
        const runs = Number(ball.runs) || 0;
        const extras = Number(ball.extras) || 0;
        const wickets = Number(ball.wickets) || 0;
        const legalDelivery = ball.legalDelivery !== false;

        if (batter) {
            batter.runs += runs;
            if (legalDelivery) {
                batter.balls += 1;
            }
            if (runs === 4) {
                batter.fours += 1;
            }
            if (runs === 6) {
                batter.sixes += 1;
            }
            if (wickets > 0) {
                batter.out = true;
            }
        }

        if (bowler) {
            if (legalDelivery) {
                bowler.bowlerBalls += 1;
            }
            bowler.runsConceded += runs + extras;
            bowler.wickets += wickets;
        }
    });
}


function undoLegacyDelivery(match) {
    const removedBall = match.balls?.[match.balls.length - 1];
    if (!removedBall) {
        return "There is no recorded delivery available to undo.";
    }

    const teams = Object.values(match.teams || {});
    const battingTeam = teams.find((team) => team.name === removedBall.battingTeam);
    const bowlingTeam = teams.find((team) => team.name === removedBall.bowlingTeam);
    if (!battingTeam || !bowlingTeam) {
        return "Cannot undo this delivery because its team data is unavailable.";
    }

    match.balls.pop();
    const runs = Number(removedBall.runs) || 0;
    const extras = Number(removedBall.extras) || 0;
    const wickets = Number(removedBall.wickets) || 0;
    const legalDelivery = removedBall.legalDelivery !== false;

    battingTeam.runs = Math.max(0, (Number(battingTeam.runs) || 0) - runs - extras);
    battingTeam.extras = Math.max(0, (Number(battingTeam.extras) || 0) - extras);
    battingTeam.wickets = Math.max(0, (Number(battingTeam.wickets) || 0) - wickets);
    battingTeam.balls = Math.max(
        0,
        (Number(battingTeam.balls) || 0) - (legalDelivery ? 1 : 0)
    );

    if (
        match.currentInnings === 2 &&
        Number(removedBall.innings) === 1 &&
        !match.balls.some((ball) => Number(ball.innings) === 2)
    ) {
        match.currentInnings = 1;
        match.battingTeam = removedBall.battingTeam;
        match.bowlingTeam = removedBall.bowlingTeam;
        match.target = null;
    }

    match.status = "LIVE";
    match.result = null;
    match.playerOfMatch = null;
    match.activePlayers = {
        strikerId: removedBall.strikerId || null,
        nonStrikerId: removedBall.nonStrikerId || null,
        bowlerId: removedBall.bowlerId || null
    };

    resetCurrentInningsPlayerStats(match);
    return null;
}


module.exports = { undoLegacyDelivery };