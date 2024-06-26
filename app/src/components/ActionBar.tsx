// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { getFaucetHost, requestSuiFromFaucetV1 } from "@mysten/sui.js/faucet";
import { unsafe_getConnectedAddress } from "../helpers/account";
import { useEffect } from "react";
import { MIST_PER_SUI } from "@mysten/sui.js/utils";
import { useBalance } from "../hooks/useBalance";

export type ActionBarProps = {
  email: string;
  logout: () => void;
};

export function ActionBar({ email, logout }: ActionBarProps) {
  const { balance, getBalance } = useBalance();

  useEffect(() => {
    getBalance();
  }, [email]);

  const requestTokens = async () => {
    requestSuiFromFaucetV1({
      host: getFaucetHost("devnet"),
      recipient: unsafe_getConnectedAddress(email),
    }).then(() => {
      getBalance();
    });
  };

  const beautifyBalance = () => {
    return BigInt(balance) / MIST_PER_SUI;
  };

  return (
    <div className="grid md:grid-cols-2 max-md:text-center gap-10 items-center border-b-2 pb-2 border-gray-700">
      <div className="md:flex gap-5 items-center">
        <button onClick={requestTokens} className="py-0">
          Request Devnet Tokens
        </button>
        <p>Your balance: {beautifyBalance().toString()} SUI</p>
      </div>
      <div className="text-center md:text-right">
        You are connected as: {email},{" "}
        <button
          className="underline p-0 border-none bg-transparent"
          onClick={logout}
        >
          Logout?
        </button>
      </div>
    </div>
  );
}
