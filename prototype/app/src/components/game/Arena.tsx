import { useEffect, useState } from "react";
import { GameMove, GameTypes, PlayerStats, commitPvPMove, makeArenaMove, parseGameStatsFromArena, revealPvPMove } from "../../helpers/game";
import { SharedObjectRef } from "@mysten/sui.js/bcs";
import { Moves } from "./parts/Moves";
import { ArenaTitle } from "./parts/ArenaTitle";
import { ArenaResult } from "./parts/ArenaResult";
import { PlayerStatistics } from "./parts/PlayerStatistics";
import { unsafe_getConnectedAddress } from "../../helpers/account";

export type ArenaProps = {
    arena: SharedObjectRef;
    gameType: GameTypes;
    end: () => void;
}
export function Arena({
    arena,
    gameType = GameTypes.PVB,
    end
}: ArenaProps) {

    const [isExpectingMove, setIsExpectingMove] = useState<boolean>(false);

    const [result, setResult] = useState<string | null>(null);

    const [currentPlayer, setCurrentPlayer] = useState<PlayerStats | null>(null);
    const [otherPlayer, setOtherPlayer] = useState<PlayerStats | null>(null);

    const getGameStatus = async (arenaId: string) => {

        setIsExpectingMove(false);
        const stats = await parseGameStatsFromArena(arenaId, gameType === GameTypes.PVP);

        const currentPlayer = stats.playerOne?.account === unsafe_getConnectedAddress() ? stats.playerOne : stats.playerTwo;
        const otherPlayer  = stats.playerOne?.account !== unsafe_getConnectedAddress() ? stats.playerOne : stats.playerTwo;

        setCurrentPlayer(currentPlayer);
        setOtherPlayer(otherPlayer);


        if(currentPlayer?.hp.toString() === '0'){
            setResult("You Lost!");
            return;
        }else if (otherPlayer?.hp.toString() === '0'){
            setResult("You won!");
            return;
        }

        if(!currentPlayer) throw new Error("Cant join a game where you are not taking part");

        if(!otherPlayer){
            // we poll to get the status of the game until another player joins.
            setTimeout(() => { getGameStatus(arenaId) }, 2500); 
            return;
        }
        // for Player vs Bot, we always expect a move.
        if(gameType === GameTypes.PVB){
            setIsExpectingMove(true);
            return;
        }

        // if we are waiting to reveal, and the other player attacked.
        // It's time to reveal!
        if((currentPlayer.next_attack && otherPlayer.next_attack) || 
             (currentPlayer.next_attack && currentPlayer.next_round! < otherPlayer.next_round!)) {
            console.log("Pending reveal is triggered!");
            // now we reveal.
            await revealPvPMove({ arena, move: JSON.parse(localStorage.getItem('lastMove') as string)});
            // we refetch game state after revealing.
            getGameStatus(arenaId);

            return;
        }

        // if we are pending reveal & the other player hasn't attacked yet. We are polling until they attack.
        if(currentPlayer.next_attack && !otherPlayer.next_attack){
            console.log("Pending reveal but waiting for the other player to commit first")
            setTimeout(() => { getGameStatus(arenaId) }, 1000);
            return;
        }
        // If we don't have the next attack, we are expecting a move.
        if(!currentPlayer.next_attack && currentPlayer.next_round! <= otherPlayer.next_round!) {
            setIsExpectingMove(true);
            return;
        } 

        // in any other case. poll! :D
        setTimeout(()=>{
            getGameStatus(arenaId)
        }, 1000)

        
    }

    const makePvBMove = async (move: GameMove) => {
        setIsExpectingMove(false);

        if (!arena || !currentPlayer || !otherPlayer) throw new Error("Arena or players are not set.");

        const { bot_hp, player_hp } = await makeArenaMove({ arena, move });

        setCurrentPlayer({ ...currentPlayer, hp: player_hp });
        setOtherPlayer({ ...otherPlayer, hp: bot_hp });

        if (bot_hp.toString() === '0') {
            setResult("You Won!")
        } else if (player_hp.toString() === '0') {
            setResult("You Lost!")
        } else {
            setIsExpectingMove(true);
        }
    }

    /// Commits the move.
    const commitMove = async (move: GameMove) => {
        localStorage.setItem('lastMove', JSON.stringify(move));
        await commitPvPMove({ arena, move });
        getGameStatus(arena.objectId);
        setIsExpectingMove(false);
    }

    useEffect(() => {
        getGameStatus(arena.objectId);
    }, []);


    return (

        <div>
            <ArenaTitle arena={arena} />
            <ArenaResult result={result} end={end} />

            {!result &&
                <>
                    <PlayerStatistics
                        currentPlayer={currentPlayer} 
                        otherPlayer={otherPlayer} />

                    {isExpectingMove && <Moves makeMove={
                        gameType === GameTypes.PVB ? makePvBMove : commitMove} />}

                    {!isExpectingMove && <div className="text-center py-12">Waiting for the other player's move</div>}
                </>
            }

        </div>
    )
}
