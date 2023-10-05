import { TransactionBlock } from "@mysten/sui.js/transactions";
import { getSuiClient, unsafe_getPrivateKey } from "./account";

export async function signAndExecute(txb: TransactionBlock){
    return getSuiClient().signAndExecuteTransactionBlock({
        transactionBlock: txb,
        signer: unsafe_getPrivateKey(),
        options: {
            showEffects: true,
            showObjectChanges: true,
            showEvents: true,
        },
    })
}
