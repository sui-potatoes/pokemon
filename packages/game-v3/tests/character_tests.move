// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module game::character_tests {
    use game::character::{Self as char, stats};

    const BASE_XP: u64 = 250;

    #[test]
    /// Test the level xp requirement.
    /// Compares the results against the formula and current setup.
    fun test_level_xp_requirement() {
        assert!(char::level_xp_requirement(1) == 250, 1);
        assert!(char::level_xp_requirement(2) == 1000, 2);
        assert!(char::level_xp_requirement(3) == 2250, 3);
        assert!(char::level_xp_requirement(4) == 4000, 4);
        assert!(char::level_xp_requirement(5) == 6250, 5);
        assert!(char::level_xp_requirement(6) == 9000, 6);
        assert!(char::level_xp_requirement(7) == 12250, 7);
        assert!(char::level_xp_requirement(8) == 16000, 8);
        assert!(char::level_xp_requirement(9) == 20250, 9);
    }

    #[test]
    fun test_add_xp() {
        let ctx = &mut sui::tx_context::dummy();
        let mut character = char::new(
            0,
            vector[ 0, 0, 0, 0, 0, 0 ],
            vector[ 0, 0, 0, 0, 0, 0 ],
            ctx
        );

        assert!(character.stats().level() == 1, 1);
        assert!(character.xp() == BASE_XP, 2);

        character.add_xp(1000);

        assert!(character.stats().level() == 2, 3);
        assert!(character.xp() == 1000 + BASE_XP, 4);

        character.add_xp(4000);

        assert!(character.stats().level() == 4, 5);
        assert!(character.xp() == 5000 + BASE_XP, 6);
    }
}
