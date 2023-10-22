// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * This is the 3rd iteration of the prototype.
 */

import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { requestSuiFromFaucetV1, getFaucetHost } from "@mysten/sui.js/faucet";
import { fromB64, fromHEX, isValidSuiObjectId } from "@mysten/sui.js/utils";
import { program } from "commander";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import inquirer from "inquirer";
import { KioskClient, Network, KioskTransaction } from "@mysten/kiosk";
import blake2b from "blake2b";
import { bcs } from "@mysten/sui.js/bcs";
import { promisify } from "util";

/** Wait for the given number of ms */
const wait = promisify(setTimeout);

/** How long to wait before polls (3m is the timeout in the App) */
const WAIT_TIME = 10 * 1000;

/** Status code for player that doesn't know the target yet */
const WAITING = "Searching";
/** Status code for Guest player */
const GUEST = "Guest";
/** Status code for Host player */
const HOST = "Host";

// === Sui Devnet Environment ===

const pkg =
  "0x4feb2885ae048bc8f1b0a951e48fa3302e9fbc559456f727689eb32310c7834c";
const theGame = {
  objectId:
    "0x3348fd7c5523219c315d69803c8db30b11d9b8a787d50699d93d0682aebb2b39",
  initialSharedVersion: 73,
  mutable: true,
};

/** The built-in client for the application */
const client = new SuiClient({ url: getFullnodeUrl("devnet") });
const kioskClient = new KioskClient({
  client,
  network: Network.CUSTOM,
});

const keys = [
  {
    schema: "ED25519",
    privateKey: "qx8t50sEo23Ahi2T8EpauMKpDutQYN+12KGgDIeocc0=",
  },
  {
    schema: "ED25519",
    privateKey: "7rUeO3yZXxfNNHlgp+pVu8lrYIp1AC+d8BOOcTlmIi4=",
  },
];

/** The private key for the address; only for testing purposes */
const myKey = keys[process.env.KEY || 0];
const keypair = Ed25519Keypair.fromSecretKey(fromB64(myKey.privateKey));
const address = keypair.toSuiAddress();

// === CLI Bits ===

program
  .name("capymon-v3")
  .description("A prototype for Capymon on devnet")
  .version("0.0.1");

program
  .command("init")
  .description("Prepare the environment and set up a Kiosk")
  .action(newAccount);

program
  .command("new-player")
  .description("Create a new player account")
  .action(newPlayer);

program.command("play").description("Play the game").action(play);

program.parse(process.argv);

// === Commands / Actions ===

/**
 * Create a new Account and install the extension on the Kiosk:
 * - creates Kiosk if there wasn't one
 * - installes the Game Extension into the Kiosk
 *
 * Fails if:
 * - Kiosk exists and has the extension already
 */
async function newAccount() {
  await checkOrRequestGas();

  const { kioskOwnerCaps, kioskIds } = await kioskClient.getOwnedKiosks({
    address,
  });

  // If there's already a Kiosk, check that it has the extension.
  if (kioskOwnerCaps.length !== 0) {
    let { data, error } = await getExtension(kioskIds[0]);

    // Error means dynamic field fetching failed.
    if (!error) {
      throw new Error("Extension already installed! Use `new-player` instead");
    }

    let tx = new TransactionBlock();
    let cap = tx.objectRef(kioskOwnerCaps[0]);
    let kioskArg = tx.object(kioskIds[0]);

    tx.moveCall({
      target: `${pkg}::the_game::install`,
      arguments: [kioskArg, cap],
    });

    let { result } = await signAndExecute(tx);
    console.log("Extension added!; %o", result.effects.status);

    return;
  }

  // If there's no Kiosk, create one and install the extension.

  let tx = new TransactionBlock();
  let kioskTx = new KioskTransaction({ transactionBlock: tx, kioskClient });

  kioskTx.create();
  kioskTx.shareAndTransferCap(address);
  kioskTx.finalize();

  let { result } = await signAndExecute(tx);

  console.log("Kiosk created!; %o", result.effects.status);

  // reusing the variable
  tx = new TransactionBlock();

  let kiosk = result.effects.created.find((e) => "Shared" in e.owner);
  let kioskArg = tx.sharedObjectRef({
    objectId: kiosk.reference.objectId,
    initialSharedVersion: kiosk.owner.Shared.initial_shared_version,
    mutable: true,
  });

  let capRef = result.effects.created.find(
    (e) => "AddressOwner" in e.owner
  ).reference;
  let capArg = tx.objectRef(capRef);

  tx.moveCall({
    target: `${pkg}::the_game::install`,
    arguments: [kioskArg, capArg],
  });

  let { result: installResult } = await signAndExecute(tx);
  console.log("Extension installed!; %o", installResult.effects.status);
}

/**
 * Create a new Player account:
 * - checks that there's a Kiosk
 * - checks that the Kiosk has the extension
 * - creates a new Player account
 *
 * Fail if:
 * - Kiosk does not exist
 * - Kiosk does not have the extension
 * - Player already exists
 */
async function newPlayer() {
  let { kioskOwnerCaps, kioskIds } = await kioskClient.getOwnedKiosks({
    address,
  });

  if (kioskOwnerCaps.length === 0) {
    throw new Error("Kiosk does not exist; run `init` first!");
  }

  let { data: extData, error: extErr } = await getExtension(kioskIds[0]);

  if (extErr) {
    throw new Error("Extension not installed; run `init` first!");
  }

  let { data: playerData, error } = await getPlayer(extData.storage);

  if (playerData) {
    throw new Error("Player already exists!");
  }

  let cap = kioskOwnerCaps[0];
  let kioskId = kioskIds[0];

  let type = await chooseType();
  let tx = new TransactionBlock();

  tx.moveCall({
    target: `${pkg}::the_game::new_player`,
    arguments: [tx.object(kioskId), tx.objectRef(cap), tx.pure.u8(type)],
  });

  let { result } = await signAndExecute(tx);

  console.log("Player created!; %o", result.effects.status);

  let { data: player } = await getPlayer(extData.storage);

  console.log("Player: %o", player.content.fields.value.fields);
}

/**
 * Play the game:
 * - submit a request to the Matchmaker
 * - wait for the match to be found
 *
 * Fails if:
 * - Kiosk does not exist
 * - Kiosk does not have the extension
 * - Player does not exist
 */
async function play() {
  let { kioskOwnerCaps, kioskIds } = await kioskClient.getOwnedKiosks({
    address,
  });

  if (kioskOwnerCaps.length === 0) {
    throw new Error("Kiosk does not exist; run `init` first!");
  }

  let { data: extData, error: extErr } = await getExtension(kioskIds[0]);

  if (extErr) {
    throw new Error("Extension not installed; run `init` first!");
  }

  let { data: playerData, error } = await getPlayer(extData.storage);

  if (!playerData) {
    throw new Error("Player does not exist!");
  }

  let { data: matchData, error: matchDataError } = await getMatchStatus(
    extData.storage
  );

  if (matchData && matchData.status == WAITING) {
    let { data, error } = await client.getOwnedObjects({
      owner: kioskIds[0],
      options: { showContent: true },
    });

    if (error) {
      throw new Error("Failed to fetch invites for the Kiosk!");
    }

    // Filter out invites by type (we should be extra careful about this one).
    let invite = data.find(
      (o) => o.data.content.type == `${pkg}::the_game::Invite`
    );
    if (!invite) {
      console.log('Still searching; do you want to cancel the search?');
      let { cancel } = await inquirer.prompt([
        {
          type: "confirm",
          name: "cancel",
          prefix: ">",
          message: "Cancel the search?",
        },
      ]);

      if (cancel) {
        let tx = new TransactionBlock();
        let gameArg = tx.sharedObjectRef(theGame);
        let kioskArg = tx.object(kioskIds[0]);
        let capArg = tx.objectRef(kioskOwnerCaps[0]);

        tx.moveCall({
          target: `${pkg}::the_game::cancel`,
          arguments: [gameArg, kioskArg, capArg],
        });

        let { result } = await signAndExecute(tx);
        console.log("Match search cancelled!; %o", result.effects.status);
      }

      return;
    }

    let hostKiosk = invite.data.content.fields.kiosk;

    /* construct arguments (including the Receiving Ref!) */
    let tx = new TransactionBlock();
    let myKiosk = tx.object(kioskIds[0]);
    let capArg = tx.objectRef(kioskOwnerCaps[0]);
    let hostKioskArg = tx.object(hostKiosk);
    let inviteArg = tx.receivingObjectRef(invite.data);

    tx.moveCall({
      target: `${pkg}::the_game::join`,
      arguments: [myKiosk, capArg, hostKioskArg, inviteArg],
    });

    let { result } = await signAndExecute(tx);
    console.log("Joined the match!; %o", result.effects.status);

    /* Join the match at the Host with my Cap */

    let hostId = invite.data.content.fields.kiosk;
    let myCap = kioskOwnerCaps[0].objectId;
    let player = "p2";

    let { data: extData } = await getExtension(hostId);
    if (!extData) {
      throw new Error("Host does not have the extension installed!");
    }

    let extensionStorageId = extData.storage;

    return listenAndPlayV2(hostId, extensionStorageId, myCap, player);
  }

  // We are the host, the only thing we need to make sure of is that another
  // player has joined (you're P1, they're P2).
  if (matchData && matchData.status == HOST) {
    console.log("You are the host!");
    console.log(JSON.stringify(matchData, null, 4));

    // host extension storage
    let extensionStorageId = extData.storage;
    let myCap = kioskOwnerCaps[0].objectId;
    let hostId = kioskIds[0];
    let player = "p1";

    return listenAndPlayV2(hostId, extensionStorageId, myCap, player);
  }

  if (matchData && matchData.status == GUEST) {
    console.log("You are the guest and joined the match");
    console.log(JSON.stringify(matchData, null, 4));

    let hostId = matchData.data.hostId;
    let myCap = kioskOwnerCaps[0].objectId;
    let player = "p2";

    let { data: extData } = await getExtension(hostId);
    if (!extData) {
      throw new Error("Host does not have the extension installed!");
    }

    let extensionStorageId = extData.storage;

    return listenAndPlayV2(hostId, extensionStorageId, myCap, player);
  }

  //     console.log("Still searching; do you want to cancel the search?");
  //     let res = await inquirer.prompt([
  //       {
  //         type: "confirm",
  //         name: "cancel",
  //         prefix: ">",
  //         message: "Cancel the search?",
  //       },
  //     ]);

  //       let tx = new TransactionBlock();
  //       let cap = tx.objectRef(kioskOwnerCaps[0]);
  //       let matchArg = tx.sharedObjectRef(theGame);
  //       let kioskArg = tx.object(kioskIds[0]);
  //       tx.moveCall({
  //         target: `${pkg}::the_game::cancel_search`,
  //         arguments: [kioskArg, matchArg, cap],
  //       });

  // if there's no matchId, then we need to request a match

  let tx = new TransactionBlock();
  let cap = tx.objectRef(kioskOwnerCaps[0]);
  let kioskArg = tx.object(kioskIds[0]);
  let matchArg = tx.sharedObjectRef(theGame);

  tx.moveCall({
    target: `${pkg}::the_game::play`,
    arguments: [matchArg, kioskArg, cap],
  });

  let { result } = await signAndExecute(tx);
  console.log("Match search started!; %o", result.effects.status);
}

async function listenAndPlayV2(
  hostId,
  extensionStorageId,
  capId,
  player = "p1",
  move = null
) {
  let { data, error } = await getMatchStatus(extensionStorageId);

  if (error) {
    throw new Error(`Could not fetch match status: ${error}; Unknown error`);
  }

  let { status, battle, action } = data;

  if (status !== HOST || !battle) {
    throw new Error("There's no match happening or inputs are incorrect");
  }

  console.log(
    "Current battle history is: %o",
    battle.history.map((hit) => stripFields(hit))
  );

  let other = player == "p1" ? "p2" : "p1";

  switch (true) {
    // Waiting for the P2 to join
    case battle[other] == null:
      action = "wait";
      break;
    // Winner is defined - time to wrap up (host action)
    case battle.winner != null:
      action = "end";
      break;
    // If current commitment is null and next_move is null
    case battle[player].commitment == null && battle[player].next_move == null:
      action = "commit";
      break;
    // If I have committed and the other has committed - reveal
    case battle[player].commitment != null && battle[other].commitment != null:
      action = "reveal";
      break;
    // If I have committed and the other has not - wait
    case battle[player].commitment != null && battle[other].next_move != null:
      action = "reveal";
      break;
    // By default we wait
    default:
      action = "wait";
  }

  if (action == "commit") {
    let myTypeIdx = battle[player].stats.types[0];
    let myType = typesDefinitions()[myTypeIdx];

    let theirTypeIdx = battle[other].stats.types[0];
    let theirType = typesDefinitions()[theirTypeIdx];

    /* Console Interface messages */ {
      console.log("Your type is %s:", myType.name);
      console.log("- %s", myType.description);

      console.log("Your opponent type is: %s", theirType.name);
      console.log("Your HP / Opponent HP");
      console.log(
        `%s / %s`,
        formatHP(battle[player].stats.hp),
        formatHP(battle[other].stats.hp)
      );
    } /* End Console Interface */

    let salt = [1, 2, 3, 4];
    let move = await chooseMove(battle[player].moves);
    let { result } = await commit(hostId, capId, move, salt);

    console.log("Committed!", result.effects.status);

    return listenAndPlayV2(hostId, extensionStorageId, capId, player, move);
  }

  if (action == "reveal") {
    if (move == null) {
      console.log("Game restarted, secret lost");
      console.log("Please a move again (has to be the same)");
      move = await chooseMove(battle[player].moves);
    }

    let salt = [1, 2, 3, 4];
    let { result } = await reveal(hostId, capId, move, salt);

    console.log("Revealed!", result.effects.status);

    return listenAndPlayV2(hostId, extensionStorageId, capId, player, move);
  }

  if (action == "wait") {
    await wait(WAIT_TIME);
    return listenAndPlayV2(hostId, extensionStorageId, capId, player, move);
  }

  if (action == "end") {
    console.log("Battle has ended!");
    console.log("Winner is: %s", battle.winner);
    return;
  }

  return console.log(
    "You're the player %s and your action is %s",
    player,
    action
  );
}

// === Transactions ===

/** Submit a commitment with an attack */
function commit(hostId, capId, move, salt, gas = null) {
  let data = new Uint8Array([move, 1, 2, 3, 4]);
  let hash = Array.from(blake2b(32).update(data).digest());

  let tx = new TransactionBlock();

  tx.moveCall({
    target: `${pkg}::the_game::commit`,
    arguments: [
      tx.object(hostId),
      tx.object(capId),
      tx.pure(bcs.vector(bcs.u8()).serialize(hash).toBytes()),
      tx.object("0x6"), // clock
    ],
  });

  return signAndExecute(tx, gas);
}

/** Reveal the commitment by providing the Move and Salt */
function reveal(hostId, capId, move, salt, gas = null) {
  let tx = new TransactionBlock();

  tx.moveCall({
    target: `${pkg}::the_game::reveal`,
    arguments: [
      tx.object(hostId),
      tx.object(capId),
      tx.pure.u8(move),
      tx.pure(bcs.vector(bcs.u8()).serialize(salt).toBytes()),
      tx.object("0x6"), // clock
    ],
  });

  return signAndExecute(tx, gas);
}

// === Fetching and Listening ===

function formatHP(hp) {
  return +(hp / 100000000).toFixed(2);
}

/** Sign the TransactionBlock and send the tx to the network */
async function signAndExecute(tx, gasObj = null) {
  if (gasObj) {
    tx.setGasPayment([gasObj]);
    tx.setGasBudget("100000000");
    tx.setGasPrice(1000);
  }

  const result = await client.signAndExecuteTransactionBlock({
    signer: keypair,
    transactionBlock: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
      showEvents: true,
    },
  });

  return {
    result,
    gas: result.effects.gasObject.reference,
  };
}

/** Try to fetch the Extension in a given Kiosk */
async function getExtension(kioskId) {
  const { data, error } = await client.getDynamicFieldObject({
    parentId: kioskId,
    name: {
      type: `0x2::kiosk_extension::ExtensionKey<${pkg}::the_game::Game>`,
      value: {
        dummy_field: false,
      },
    },
  });

  if (error) {
    return { error };
  }

  // remind me to shoot myself in the head
  const fields = data.content.fields.value.fields;

  return {
    data: {
      is_enabled: fields.is_enabled,
      permissions: +fields.permissions,
      storage: fields.storage.fields.id.id, // and for this
    },
  };
}

/** Get the player in the Extension Storage */
async function getPlayer(extensionStorageId) {
  const { data, error } = await client.getDynamicFieldObject({
    parentId: extensionStorageId,
    name: {
      type: `${pkg}::the_game::PlayerKey`,
      value: {
        dummy_field: false,
      },
    },
  });

  return { data, error };
}

/** Get the MatchID from the Extension Storage */
async function getMatchStatus(extensionStorageId) {
  const { data, error } = await client.getDynamicFieldObject({
    parentId: extensionStorageId,
    name: {
      type: `${pkg}::the_game::MatchKey`,
      value: {
        dummy_field: false,
      },
    },
  });

  if (error) {
    return { error };
  }

  let value = data.content.fields.value;

  // means that we're searching for a match but haven't found one yet
  if (value.type.includes('::pool::Order')) {
    return {
      data: {
        status: WAITING,
        data: {
          order: value.fields
        }
      },
    };
  }

  if (typeof value == "string" && value.startsWith("0x")) {
    return {
      data: {
        status: GUEST,
        data: {
          hostId: data.content.fields.value,
        },
      },
    };
  }

  return {
    data: { status: HOST, battle: stripFields(value.fields) },
  };
}

/** Prompt to choose a type of the Player */
function chooseType() {
  return inquirer
    .prompt([
      {
        type: "list",
        name: "type",
        prefix: ">",
        message: "Choose your type (don't worry, you can start over later)",
        choices: [
          { name: "Water: Water is super effective against Fire", value: 0 },
          { name: "Fire: Fire is super effective against Air", value: 1 },
          { name: "Air: Air is super effective against Earth", value: 2 },
          { name: "Earth: Earth is super effective against Water", value: 3 },
        ],
      },
    ])
    .then((res) => res.type);
}

/**
 * Prompt a list to the user
 * @param moves number[]
 * */
function chooseMove(moves) {
  return inquirer
    .prompt([
      {
        type: "list",
        name: "move",
        prefix: ">",
        message: "Choose your move",
        choices: moves.map((id) => {
          let move = movesDefinitions()[id];
          return {
            name: `${move.name} (${move.type}: ${move.power}) Type: ${move.category}`,
            value: id,
          };
        }),
      },
    ])
    .then((res) => res.move);
}

/** Check that the account has at least 1 coin, if not - request from faucet */
async function checkOrRequestGas() {
  console.log("Checking for gas...");
  let coins = await client.getCoins({ owner: address });
  if (coins.data.length == 0) {
    console.log("No gas found; requesting from faucet...");
    await requestFromFaucet();
    return new Promise((resolve) => setTimeout(resolve, 10000));
  }
  console.log("All good!");
}

/** Request some SUI to the main address */
function requestFromFaucet() {
  return requestSuiFromFaucetV1({
    host: getFaucetHost("devnet"),
    recipient: address,
  });
}

/** Returns available types with hints */
function typesDefinitions() {
  return [
    { name: "Water", description: "Water is super effective against Fire" },
    { name: "Fire", description: "Fire is super effective against Air" },
    { name: "Air", description: "Air is super effective against Earth" },
    { name: "Earth", description: "Earth is super effective against Water" },
  ];
}

/** Return available moves and their power + type */
function movesDefinitions() {
  return [
    {
      name: "Hydro Pump",
      type: "Water",
      category: "Physical",
      power: 90,
      effectiveness: [10, 20, 5, 10],
    },
    {
      name: "Aqua Tail",
      type: "Water",
      category: "Special",
      power: 85,
      effectiveness: [10, 20, 5, 10],
    },
    {
      name: "Inferno",
      type: "Fire",
      category: "Physical",
      power: 85,
      effectiveness: [5, 10, 20, 10],
    },
    {
      name: "Flamethrower",
      type: "Fire",
      category: "Special",
      power: 90,
      effectiveness: [5, 10, 20, 10],
    },
    {
      name: "Quake Strike",
      type: "Earth",
      category: "Physical",
      power: 80,
      effectiveness: [20, 5, 10, 10],
    },
    {
      name: "Earthquake",
      type: "Earth",
      category: "Special",
      power: 85,
      effectiveness: [20, 5, 10, 10],
    },
    {
      name: "Gust",
      type: "Air",
      category: "Physical",
      power: 75,
      effectiveness: [10, 5, 10, 20],
    },
    {
      name: "Air Slash",
      type: "Air",
      category: "Special",
      power: 80,
      effectiveness: [10, 5, 10, 20],
    },
  ];
}

function stripFields(obj) {
  let res = {};
  if (obj.type && obj.fields) {
    obj = obj.fields;
  }

  for (let i in obj) {
    if (!obj[i]) {
      res[i] = obj[i];
    } else if (obj[i].type && obj[i].fields) {
      res[i] = stripFields(obj[i].fields);
    } else {
      res[i] = obj[i];
    }
  }
  return res;
}
