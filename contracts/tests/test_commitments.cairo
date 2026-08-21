/// Cross-language parity tests.
///
/// These lock the Cairo commitment derivation against the values produced by
/// starknet.js `hash.computePoseidonHashOnElements` in the frontend. If either
/// side changes, these fail — which is the point: a silent mismatch would make
/// refunds permanently unclaimable.
///
/// NOTE: secrets must fit in felt252 (< 2^251). The frontend generates 248-bit
/// secrets to stay safely inside the field.
use contracts::lantern::{compute_donation_commitment, compute_payout_commitment};

/// Reference vectors generated with starknet.js 10.4.0:
///
/// ```js
/// const PAYOUT_TAG = '0x' + Buffer.from('LANTERN_PAYOUT:V1').toString('hex');
/// const DONATE_TAG = '0x' + Buffer.from('LANTERN_DONATE:V1').toString('hex');
/// hash.computePoseidonHashOnElements([PAYOUT_TAG, '1', SECRET])
/// hash.computePoseidonHashOnElements([DONATE_TAG, '1', SECRET])
/// ```
const SECRET: felt252 = 0x1a2b3c4d5e6f7788990011223344556677889900aabbccddeeff0011223344;
const EXPECTED_PAYOUT_C1: felt252 =
    0x31a85510f4f85ab2ff017d6aca3947ab38498decae952444b3fb804363a320a;
const EXPECTED_DONATE_C1: felt252 =
    0x6b501900b5ad2061db0ea5f53b1724cd546b2192651a24af65f06476a58b996;

#[test]
fn test_payout_commitment_matches_starknetjs() {
    let computed = compute_payout_commitment(1, SECRET);
    assert!(
        computed == EXPECTED_PAYOUT_C1,
        "payout commitment must match starknet.js reference vector",
    );
}

#[test]
fn test_donation_commitment_matches_starknetjs() {
    let computed = compute_donation_commitment(1, SECRET);
    assert!(
        computed == EXPECTED_DONATE_C1,
        "donation commitment must match starknet.js reference vector",
    );
}

#[test]
fn test_donation_commitment_is_campaign_scoped() {
    // Same secret, different campaign => different commitment.
    // This is what prevents replaying a commitment across campaigns.
    let c1 = compute_donation_commitment(1, SECRET);
    let c2 = compute_donation_commitment(2, SECRET);
    assert!(c1 != c2, "commitments must be campaign-scoped");
}

#[test]
fn test_donate_and_payout_tags_are_separated() {
    // Same campaign, same secret, different domain tag => different commitment.
    // This prevents a donor's refund commitment being used as a payout commitment.
    let donate = compute_donation_commitment(1, SECRET);
    let payout = compute_payout_commitment(1, SECRET);
    assert!(donate != payout, "domain separation must hold");
}
