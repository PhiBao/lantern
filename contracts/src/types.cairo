use starknet::ContractAddress;

/// A campaign stored onchain.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct Campaign {
    /// Creator address (for payout gating, not revealed to donors).
    pub organizer: ContractAddress,
    /// ERC-20 token accepted for this campaign.
    pub token: ContractAddress,
    /// Target amount in token's smallest unit.
    pub goal: u128,
    /// Total raised so far (measured, not caller-supplied).
    pub raised: u128,
    /// Number of unique donations (not unique donors — we can't know that).
    pub backer_count: u32,
    /// Unix timestamp after which no donations accepted.
    pub deadline: u64,
    /// Whether the organizer has claimed payout.
    pub payout_claimed: bool,
}

/// Mirrors the pool's expected return type from privacy_invoke.
#[derive(Serde, Copy, Drop)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

/// Stored per donation commitment for refund tracking.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct DonationEntry {
    pub campaign_id: u32,
    pub token: ContractAddress,
    pub amount: u128,
    pub claimed: bool,
}

/// Operations the pool can request via privacy_invoke.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum LanternOperation {
    Donate,
    ClaimRefund,
    ClaimPayout,
}
