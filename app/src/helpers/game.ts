// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { TransactionBlock } from "@mysten/sui.js/transactions";
import { signAndExecute } from "./transactions";
import { SuiEvent, SuiObjectData } from "@mysten/sui.js/client";
import { SharedObjectRef } from "@mysten/sui.js/bcs";
import { getSuiClient } from "./account";
import blake2b from "blake2b";
import { PlayerType, TYPES } from "./game_v2";

export const GAME_PACKAGE_ADDRESS =
  "0xe9143d117939e95c9fc623760c23799420ce2173199f2668d891a87430beff48";

/// Events to track
export const PlayerJoined = "::PlayerJoined";
export const RoundResult = "::RoundResult";
export const PlayerCommit = "::PlayerCommit";
export const PlayerReveal = "::PlayerReveal";

export enum GameTypes {
  PVB = "PVB",
  PVP = "PVP",
  PVP_V2 = "PVP_V2",
}

export type GameMove = {
  name: string;
  value: number;
  icon: string;
  keyStroke: string;
  soundEffect: string;
};

export const MOVES: GameMove[] = [
  {
    name: "Fire",
    value: 0,
    icon: "assets/fire.png",
    keyStroke: "KeyQ",
    soundEffect: "assets/effect.wav",
  },
  {
    name: "Air",
    value: 1,
    icon: "assets/air.png",
    keyStroke: "KeyW",
    soundEffect: "assets/effect.wav",
  },
  {
    name: "Water",
    value: 2,
    icon: "assets/water.png",
    keyStroke: "KeyE",
    soundEffect: "assets/effect.wav",
  },
];

export type GameStatus = {
  round: number;
  isOver: boolean;
  playerOne: PlayerStats | null;
  playerTwo: PlayerStats | null;
  gameId: string;
  initialSharedVersion: number;
};
export type PlayerStats = {
  attack: number;
  defense: number;
  initial_hp: bigint;
  hp: bigint;
  level: number;
  special_attack: number;
  special_defense: number;
  speed: number;
  type: PlayerType;
  types: number[];
  moves: number[];
  account?: string;
  next_attack?: number;
  next_round?: number;
};

export type JoinGameProps = {
  email?: string | null;
  arena: SharedObjectRef;
};

export const joinAsSecondPlayer = async ({ arena }: JoinGameProps) => {
  let txb = new TransactionBlock();

  txb.moveCall({
    target: `${GAME_PACKAGE_ADDRESS}::arena_pvp::join`,
    arguments: [txb.sharedObjectRef(arena)],
  });

  return signAndExecute(txb);
};

export const parseGameStatsFromArena = async (
  arenaId: string,
  isPvP: boolean = false
) => {
  const { data } = await getSuiClient().getObject({
    id: arenaId,
    options: {
      showContent: true,
      showOwner: true, // find the initialSharedVersion
    },
  });

  const fields = (data?.content as { fields: any })?.fields;

  if (fields.p1) fields.player_one = fields.p1;
  if (fields.p2) fields.player_two = fields.p2;

  const playerOne = isPvP
    ? fields.player_one?.fields?.stats?.fields
    : fields.player_stats?.fields;
  const playerTwo = isPvP
    ? fields.player_two?.fields?.stats?.fields
    : fields.bot_stats?.fields;

  return {
    playerOne: playerOne && {
      ...playerOne,
      ...(isPvP
        ? {
            moves: fields.player_one?.fields?.player?.fields.moves,
            type: TYPES.find((x) => x.value === playerOne.types[0]),
            initial_hp:
              fields.player_one?.fields?.starting_hp ||
              fields.player_one?.fields?.player?.fields?.stats?.fields?.hp,
            account:
              fields.player_one?.fields?.account ||
              fields.player_one?.fields?.kiosk_id,
            next_attack: fields.player_one?.fields?.next_attack,
            next_round: fields.player_one?.fields?.next_round,
          }
        : {
            initial_hp: playerOne.hp,
          }),
    },
    playerTwo: playerTwo && {
      ...playerTwo,
      ...(isPvP
        ? {
            moves: fields.player_two?.fields?.player?.fields.moves,
            type: TYPES.find((x) => x.value === playerTwo.types[0]),
            initial_hp:
              fields.player_two?.fields?.starting_hp ||
              fields.player_two?.fields?.player?.fields?.stats?.fields?.hp,
            account:
              fields.player_two?.fields?.account ||
              fields.player_two?.fields?.kiosk_id,
            next_attack: fields.player_two?.fields?.next_attack,
            next_round: fields.player_two?.fields?.next_round,
          }
        : {
            initial_hp: playerTwo.hp,
          }),
    },
    round: fields.round,
    isOver: !!fields.winner,
    gameId: arenaId,
    //@ts-ignore-next-line
    initialSharedVersion: data?.owner?.Shared.initial_shared_version,
  } as GameStatus;
};

export const parseGameStatsFromEvent = (events: SuiEvent[]) => {
  const event = events![0].parsedJson as {
    player_stats: PlayerStats;
    bot_stats: PlayerStats;
  };

  return {
    player: event.player_stats,
    bot: event.bot_stats,
  };
};

export type CreateArenaProps = {
  isPvP: boolean;
};

export async function createArena({ isPvP }: CreateArenaProps) {
  const txb = new TransactionBlock();

  txb.moveCall({
    target: `${GAME_PACKAGE_ADDRESS}::${isPvP ? "arena_pvp" : "arena"}::new`,
  });

  const { events, objectChanges } = await signAndExecute(txb);

  const arena = objectChanges?.find(
    (x) =>
      "objectType" in x &&
      x.objectType.endsWith(isPvP ? "arena_pvp::Arena" : "arena::Arena")
  ) as SuiObjectData;

  const arenaObj = {
    mutable: true,
    objectId: arena.objectId,
    initialSharedVersion: arena.version,
  };

  return {
    arena: arenaObj,
    pvpStats: isPvP && (await parseGameStatsFromArena(arenaObj.objectId)),
    pvbStats: parseGameStatsFromEvent(events!),
  };
}

export type MakeArenaMoveProps = {
  arena: SharedObjectRef;
  move: GameMove;
};

export async function makeArenaMove({ arena, move }: MakeArenaMoveProps) {
  const txb = new TransactionBlock();

  txb.moveCall({
    target: `${GAME_PACKAGE_ADDRESS}::arena::attack`,
    arguments: [txb.sharedObjectRef(arena), txb.pure(move.value, "u8")],
  });

  const { events } = await signAndExecute(txb);

  const event = events![0].parsedJson as {
    bot_hp: bigint;
    player_hp: bigint;
  };

  return {
    bot_hp: event.bot_hp,
    player_hp: event.player_hp,
  };
}

export async function commitPvPMove({ arena, move }: MakeArenaMoveProps) {
  let data = new Uint8Array([move.value, 1, 2, 3, 4]);
  let hash = Array.from(blake2b(32).update(data).digest());

  const txb = new TransactionBlock();

  txb.moveCall({
    target: `${GAME_PACKAGE_ADDRESS}::arena_pvp::commit`,
    arguments: [txb.sharedObjectRef(arena), txb.pure(hash, "vector<u8>")],
  });

  return signAndExecute(txb);
}

export async function revealPvPMove({ arena, move }: MakeArenaMoveProps) {
  const txb = new TransactionBlock();

  txb.moveCall({
    target: `${GAME_PACKAGE_ADDRESS}::arena_pvp::reveal`,
    arguments: [
      txb.sharedObjectRef(arena),
      txb.pure(move.value, "u8"),
      txb.pure([1, 2, 3, 4], "vector<u8>"),
    ],
  });

  return signAndExecute(txb);
}

/** Subscribe to all emitted events for a specified arena */
export function listenToArenaEvents(
  arenaId: string,
  cb: (inputs: any) => void
) {
  return getSuiClient().subscribeEvent({
    filter: {
      All: [
        { MoveModule: { module: "arena_pvp", package: GAME_PACKAGE_ADDRESS } },
        {
          MoveEventModule: {
            module: "arena_pvp",
            package: GAME_PACKAGE_ADDRESS,
          },
        },
        { Package: GAME_PACKAGE_ADDRESS },
      ],
    },
    onMessage: (event: SuiEvent) => {
      let cond =
        event.packageId == GAME_PACKAGE_ADDRESS &&
        event.transactionModule == "arena_pvp" &&
        (event.parsedJson as { arena: string }).arena == arenaId;

      if (cond) {
        cb(event);
      } else {
        console.log("Not tracked: %o", event);
      }
    },
  });
}
