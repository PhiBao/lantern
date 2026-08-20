/// Lantern — private crowdfunding on Starknet.
///
/// Public: goal, raised total, backer count, deadline.
/// Private: donor identities.
///
/// A stateful anonymizer contract implementing `privacy_invoke`.
/// The pool calls this contract atomically during STRK20 transactions.
///
/// Three operations:
/// - Donate: park funds, increment tally, store refund commitment.
/// - ClaimRefund: return funds to giver if goal not met after deadline.
/// - ClaimPayout: send all raised funds to organizer if goal met after deadline.

#[starknet::interface]
pub trait ILantern<T> {
    /// Create a new campaign. Called directly by the organizer (not via pool).
    fn create_campaign(
        ref self: T,
        token: starknet::ContractAddress,
        goal: u128,
        deadline: u64,
        payout_commitment_hash: felt252,
    ) -> u32;

    /// Read a campaign by id.
    fn get_campaign(self: @T, campaign_id: u32) -> contracts::types::Campaign;

    /// Total number of campaigns created.
    fn campaign_count(self: @T) -> u32;

    /// Read a donation commitment entry.
    fn get_donation(self: @T, commitment_hash: felt252) -> contracts::types::DonationEntry;

    /// Read the organizer's payout commitment for a campaign.
    fn get_payout_commitment(self: @T, campaign_id: u32) -> felt252;

    /// The privacy_invoke entrypoint called by the pool.
    /// Returns Span<OpenNoteDeposit> serialized.
    ///
    /// Parameters follow a fixed layout so the pool/wallet can extract
    /// the input token and amount for the withdrawal:
    /// - token: the ERC-20 being moved (withdraw for donate, approve for claims)
    /// - amount: the amount being moved (donation amount, or 0 for claims)
    /// - operation: which Lantern operation to perform
    /// - campaign_id: target campaign
    /// - commitment_hash: Poseidon commitment (donate) or 0 (claims)
    /// - note_id: open note to credit (claims) or 0 (donate)
    /// - secret: commitment preimage (claims) or 0 (donate)
    fn privacy_invoke(
        ref self: T,
        token: starknet::ContractAddress,
        amount: u128,
        operation: contracts::types::LanternOperation,
        campaign_id: u32,
        commitment_hash: felt252,
        note_id: felt252,
        secret: felt252,
    ) -> Span<contracts::types::OpenNoteDeposit>;
}

/// Domain-separation tags for commitment hashes.
pub const LANTERN_DONATE_TAG: felt252 = 'LANTERN_DONATE:V1';
pub const LANTERN_PAYOUT_TAG: felt252 = 'LANTERN_PAYOUT:V1';

/// Computes a donation commitment hash: poseidon(TAG, campaign_id, secret).
pub fn compute_donation_commitment(campaign_id: u32, secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span(
        [LANTERN_DONATE_TAG, campaign_id.into(), secret].span(),
    )
}

/// Computes a payout commitment hash: poseidon(TAG, campaign_id, secret).
pub fn compute_payout_commitment(campaign_id: u32, secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span(
        [LANTERN_PAYOUT_TAG, campaign_id.into(), secret].span(),
    )
}

#[starknet::contract]
pub mod Lantern {
    use core::num::traits::Zero;
    use contracts::ierc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{
        StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};

    use contracts::errors::errors;
    use contracts::types::{Campaign, DonationEntry, LanternOperation, OpenNoteDeposit};
    use super::{ILantern, compute_donation_commitment};

    #[storage]
    struct Storage {
        /// The STRK20 privacy pool address — only this can call privacy_invoke.
        pool: ContractAddress,
        /// Auto-incrementing campaign counter.
        next_campaign_id: u32,
        /// campaign_id -> Campaign.
        campaigns: starknet::storage::Map<u32, Campaign>,
        /// commitment_hash -> DonationEntry.
        donations: starknet::storage::Map<felt252, DonationEntry>,
        /// campaign_id -> organizer's payout commitment hash.
        payout_commitments: starknet::storage::Map<u32, felt252>,
        /// token -> accounted balance (prevents tally inflation).
        accounted_balance: starknet::storage::Map<ContractAddress, u256>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, pool: ContractAddress) {
        assert(pool.is_non_zero(), 'ZERO_POOL');
        self.pool.write(pool);
        self.next_campaign_id.write(1);
    }

    #[abi(embed_v0)]
    pub impl LanternImpl of ILantern<ContractState> {
        fn create_campaign(
            ref self: ContractState,
            token: ContractAddress,
            goal: u128,
            deadline: u64,
            payout_commitment_hash: felt252,
        ) -> u32 {
            assert(token.is_non_zero(), errors::ZERO_TOKEN);
            assert(goal.is_non_zero(), errors::ZERO_GOAL);
            assert(deadline > get_block_timestamp(), errors::DEADLINE_IN_PAST);
            assert(payout_commitment_hash.is_non_zero(), errors::ZERO_COMMITMENT);

            let id = self.next_campaign_id.read();
            self.next_campaign_id.write(id + 1);

            let campaign = Campaign {
                organizer: get_caller_address(),
                token,
                goal,
                raised: 0,
                backer_count: 0,
                deadline,
                payout_claimed: false,
            };

            self.campaigns.write(id, campaign);
            self.payout_commitments.write(id, payout_commitment_hash);

            id
        }

        fn get_campaign(self: @ContractState, campaign_id: u32) -> Campaign {
            let campaign = self.campaigns.read(campaign_id);
            assert(campaign.token.is_non_zero(), errors::CAMPAIGN_NOT_FOUND);
            campaign
        }

        fn campaign_count(self: @ContractState) -> u32 {
            self.next_campaign_id.read() - 1
        }

        fn get_donation(self: @ContractState, commitment_hash: felt252) -> DonationEntry {
            self.donations.read(commitment_hash)
        }

        fn get_payout_commitment(self: @ContractState, campaign_id: u32) -> felt252 {
            self.payout_commitments.read(campaign_id)
        }

        fn privacy_invoke(
            ref self: ContractState,
            token: ContractAddress,
            amount: u128,
            operation: LanternOperation,
            campaign_id: u32,
            commitment_hash: felt252,
            note_id: felt252,
            secret: felt252,
        ) -> Span<OpenNoteDeposit> {
            // Only the pool can call this.
            let pool_addr = self.pool.read();
            assert(get_caller_address() == pool_addr, errors::CALLER_NOT_POOL);

            // `token` and `amount` are extracted by the pool/wallet for withdrawal.
            // The contract uses measured-delta accounting independently.
            // `token` is validated against campaign.token inside each handler.

            match operation {
                LanternOperation::Donate => {
                    self.handle_donate(campaign_id, commitment_hash)
                },
                LanternOperation::ClaimRefund => {
                    self.handle_claim_refund(campaign_id, note_id, secret)
                },
                LanternOperation::ClaimPayout => {
                    self.handle_claim_payout(campaign_id, note_id, secret)
                },
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Donate: measure the actual token delta, increment tally, store commitment.
        fn handle_donate(
            ref self: ContractState, campaign_id: u32, commitment_hash: felt252,
        ) -> Span<OpenNoteDeposit> {
            // Validate campaign exists and is active.
            let mut campaign = self.campaigns.read(campaign_id);
            assert(campaign.token.is_non_zero(), errors::CAMPAIGN_NOT_FOUND);
            assert(get_block_timestamp() <= campaign.deadline, errors::CAMPAIGN_ENDED);
            assert(commitment_hash.is_non_zero(), errors::ZERO_COMMITMENT);

            // Check commitment doesn't already exist.
            let existing = self.donations.read(commitment_hash);
            assert(existing.token.is_zero(), errors::COMMITMENT_EXISTS);

            // Measure actual tokens received via balance delta.
            let token_dispatcher = IERC20Dispatcher { contract_address: campaign.token };
            let current_balance: u256 = token_dispatcher
                .balance_of(starknet::get_contract_address());
            let previously_accounted: u256 = self.accounted_balance.read(campaign.token);
            let delta: u256 = current_balance - previously_accounted;

            // Safe u256 -> u128: the pool works in u128, so this should always fit.
            assert(delta <= 0xffffffffffffffffffffffffffffffff_u256, 'OVERFLOW');
            let amount: u128 = delta.try_into().unwrap();
            assert(amount.is_non_zero(), errors::ZERO_DONATION);

            // Update accounted balance.
            self.accounted_balance.write(campaign.token, current_balance);

            // Update campaign tally.
            campaign.raised = campaign.raised + amount;
            campaign.backer_count = campaign.backer_count + 1;
            self.campaigns.write(campaign_id, campaign);

            // Store donation entry for refund.
            self
                .donations
                .write(
                    commitment_hash,
                    DonationEntry {
                        campaign_id, token: campaign.token, amount, claimed: false,
                    },
                );

            // Return empty span — funds stay parked in the contract.
            [].span()
        }

        /// ClaimRefund: verify secret, check goal not met + past deadline, return funds.
        fn handle_claim_refund(
            ref self: ContractState, campaign_id: u32, note_id: felt252, secret: felt252,
        ) -> Span<OpenNoteDeposit> {
            let campaign = self.campaigns.read(campaign_id);
            assert(campaign.token.is_non_zero(), errors::CAMPAIGN_NOT_FOUND);
            assert(get_block_timestamp() > campaign.deadline, errors::CAMPAIGN_NOT_ENDED);
            assert(campaign.raised < campaign.goal, errors::GOAL_ALREADY_MET);

            // Recompute commitment from secret.
            let commitment_hash = compute_donation_commitment(campaign_id, secret);
            let mut entry = self.donations.read(commitment_hash);
            assert(entry.token.is_non_zero(), errors::COMMITMENT_NOT_FOUND);
            assert(!entry.claimed, errors::ALREADY_CLAIMED);

            // Mark claimed.
            entry.claimed = true;
            self.donations.write(commitment_hash, entry);

            // Update accounted balance (funds leaving).
            let prev_accounted = self.accounted_balance.read(entry.token);
            self.accounted_balance.write(entry.token, prev_accounted - entry.amount.into());

            // Approve pool to pull the tokens.
            let pool_addr = self.pool.read();
            IERC20Dispatcher { contract_address: entry.token }
                .approve(spender: pool_addr, amount: entry.amount.into());

            // Return deposit instruction for the giver's open note.
            [OpenNoteDeposit { note_id, token: entry.token, amount: entry.amount }].span()
        }

        /// ClaimPayout: verify organizer secret, check goal met + past deadline, return all.
        fn handle_claim_payout(
            ref self: ContractState, campaign_id: u32, note_id: felt252, secret: felt252,
        ) -> Span<OpenNoteDeposit> {
            let mut campaign = self.campaigns.read(campaign_id);
            assert(campaign.token.is_non_zero(), errors::CAMPAIGN_NOT_FOUND);
            assert(get_block_timestamp() > campaign.deadline, errors::CAMPAIGN_NOT_ENDED);
            assert(campaign.raised >= campaign.goal, errors::GOAL_NOT_MET);
            assert(!campaign.payout_claimed, errors::PAYOUT_ALREADY_CLAIMED);

            // Verify the payout commitment.
            let stored_commitment = self.payout_commitments.read(campaign_id);
            let computed = super::compute_payout_commitment(campaign_id, secret);
            assert(computed == stored_commitment, errors::COMMITMENT_NOT_FOUND);

            // Mark payout as claimed.
            campaign.payout_claimed = true;
            self.campaigns.write(campaign_id, campaign);

            let payout_amount = campaign.raised;

            // Update accounted balance.
            let prev_accounted = self.accounted_balance.read(campaign.token);
            self.accounted_balance.write(campaign.token, prev_accounted - payout_amount.into());

            // Approve pool.
            let pool_addr = self.pool.read();
            IERC20Dispatcher { contract_address: campaign.token }
                .approve(spender: pool_addr, amount: payout_amount.into());

            // Return deposit instruction for organizer's open note.
            [OpenNoteDeposit { note_id, token: campaign.token, amount: payout_amount }].span()
        }
    }
}
