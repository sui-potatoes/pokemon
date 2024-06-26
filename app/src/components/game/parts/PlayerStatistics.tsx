// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PlayerStats } from "../../../helpers/game";
import HealthBar from "./HealthBar";

export type PlayerStatsProps = {
  currentPlayer: PlayerStats | null;
  otherPlayer: PlayerStats | null;
};

export function SinglePlayerStats({
  player,
  isCurrent,
}: {
  player: PlayerStats | null;
  isCurrent?: boolean;
}) {
  const attributes: Record<string, string> = {
    level: "Lv.",
    attack: "Att.",
    defense: "Def.",
    special_attack: "Sp. Att.",
    special_defense: "Sp. Def.",
    speed: "Speed",
    type: "Type",
  };

  if (!player) return <p>Waiting for player...</p>;

  return (
    <div className={`hitespace-wrap break-words ${!isCurrent && "text-right"}`}>
      <h2 className={`md:text-3xl ${isCurrent ? "text-left" : "text-right"}`}>
        {isCurrent ? "YOU" : "Other Player"}
      </h2>
      <div
        className={`bg-black bg-opacity-40 w-fit ${
          !isCurrent && "flex ml-auto justify-end"
        }`}
      >
        <HealthBar
          initialHp={player?.initial_hp ?? 0n}
          currentHp={player?.hp ?? 0n}
        />
      </div>

      {true && (
        <div
          className={`flex flex-wrap gap-5 ${
            isCurrent ? "text-left" : "flex justify-end"
          }`}
        >
          {Object.keys(attributes).map((key: string) => {
            return (
              <span className="flex-shrink-0 text-md" key={key}>
                {attributes[key]}:{" "}
                {/* @ts-ignore-next-line */}
                {key === "type" ? player[key]?.name : player[key]}
              </span>
            );
          })}
        </div>
      )}

      <img
        src="assets/capy_player.png"
        className={`w-[80px] md:w-[160px] 2xl:w-[200px] mt-3 ${
          !isCurrent && "scale-x-[-1] ml-auto"
        }`}
      />
    </div>
  );
}

export function PlayerStatistics({
  currentPlayer,
  otherPlayer,
}: PlayerStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-10 items-center max-w-[1000px] mx-auto">
      <SinglePlayerStats player={currentPlayer} isCurrent />
      <SinglePlayerStats player={otherPlayer} />
    </div>
  );
}
