use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use contracts::lantern::{ILanternDispatcher, ILanternDispatcherTrait};
use contracts::types::{LanternOperation};

use super::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};

const POOL_ADDR: felt252 = 0x1234;
const ORGANIZER_ADDR: felt252 = 0xAAAA;
const DONOR_ADDR: felt252 = 0xBBBB;

fn deploy_mock_erc20() -> (ContractAddress, IMockERC20Dispatcher) {
    let contract_class = declare("MockERC20").unwrap().contract_class();
    let (addr, _) = contract_class.deploy(@ArrayTrait::new()).unwrap();
    (addr, IMockERC20Dispatcher { contract_address: addr })
}

fn deploy_lantern(pool: ContractAddress) -> (ContractAddress, ILanternDispatcher) {
    let contract_class = declare("Lantern").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    calldata.append(pool.into());
    let (addr, _) = contract_class.deploy(@calldata).unwrap();
    (addr, ILanternDispatcher { contract_address: addr })
}

fn pool_addr() -> ContractAddress {
    POOL_ADDR.try_into().unwrap()
}

fn organizer_addr() -> ContractAddress {
    ORGANIZER_ADDR.try_into().unwrap()
}

fn donor_addr() -> ContractAddress {
    DONOR_ADDR.try_into().unwrap()
}

#[test]
fn test_create_campaign() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, _) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());

    let payout_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_PAYOUT:V1', 1, 0x9999].span(),
    );

    let id = lantern.create_campaign(token_addr, 1000_u128, 2000_u64, payout_hash);
    assert!(id == 1, "first campaign should have id 1");

    let campaign = lantern.get_campaign(1);
    assert!(campaign.goal == 1000, "goal mismatch");
    assert!(campaign.raised == 0, "raised should start at 0");
    assert!(campaign.backer_count == 0, "backer count should start at 0");
    assert!(campaign.deadline == 2000, "deadline mismatch");
    assert!(campaign.organizer == organizer_addr(), "organizer mismatch");
    assert!(campaign.token == token_addr, "token mismatch");

    stop_cheat_caller_address(lantern.contract_address);
}

#[test]
#[should_panic(expected: 'ZERO_GOAL')]
fn test_create_campaign_zero_goal() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, _) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());

    lantern.create_campaign(token_addr, 0_u128, 2000_u64, 0x1234);
}

#[test]
#[should_panic(expected: 'DEADLINE_IN_PAST')]
fn test_create_campaign_past_deadline() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, _) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 3000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());

    lantern.create_campaign(token_addr, 1000_u128, 2000_u64, 0x1234);
}

#[test]
fn test_donate_increments_tally() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, mock_token) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());
    let payout_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_PAYOUT:V1', 1, 0x9999].span(),
    );
    lantern.create_campaign(token_addr, 5000_u128, 2000_u64, payout_hash);
    stop_cheat_caller_address(lantern.contract_address);

    // Simulate pool sending tokens to the lantern contract before calling privacy_invoke.
    mock_token.mint(lantern.contract_address, 500_u256);

    // Call privacy_invoke as the pool.
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    let commitment_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_DONATE:V1', 1, 0xDEAD].span(),
    );
    let result = lantern
        .privacy_invoke(token_addr, 500, LanternOperation::Donate, 1, commitment_hash, 0, 0);
    stop_cheat_caller_address(lantern.contract_address);

    // Should return empty span (funds parked).
    assert!(result.len() == 0, "donate should return empty span");

    // Tally should reflect measured amount.
    let campaign = lantern.get_campaign(1);
    assert!(campaign.raised == 500, "raised should be 500");
    assert!(campaign.backer_count == 1, "backer count should be 1");

    // Donation entry should be stored.
    let entry = lantern.get_donation(commitment_hash);
    assert!(entry.amount == 500, "donation amount mismatch");
    assert!(entry.campaign_id == 1, "campaign id mismatch");
}

#[test]
#[should_panic(expected: 'CALLER_NOT_POOL')]
fn test_donate_not_pool() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, _) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());
    let payout_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_PAYOUT:V1', 1, 0x9999].span(),
    );
    lantern.create_campaign(token_addr, 5000_u128, 2000_u64, payout_hash);
    stop_cheat_caller_address(lantern.contract_address);

    // Call as non-pool address — should fail.
    start_cheat_caller_address(lantern.contract_address, donor_addr());
    let commitment_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_DONATE:V1', 1, 0xDEAD].span(),
    );
    lantern.privacy_invoke(token_addr, 500, LanternOperation::Donate, 1, commitment_hash, 0, 0);
}

#[test]
fn test_claim_refund() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, mock_token) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());
    let payout_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_PAYOUT:V1', 1, 0x9999].span(),
    );
    lantern.create_campaign(token_addr, 5000_u128, 2000_u64, payout_hash);
    stop_cheat_caller_address(lantern.contract_address);

    // Donate 500 (below goal of 5000).
    mock_token.mint(lantern.contract_address, 500_u256);
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    let secret: felt252 = 0xDEAD;
    let commitment_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_DONATE:V1', 1, secret].span(),
    );
    lantern.privacy_invoke(token_addr, 500, LanternOperation::Donate, 1, commitment_hash, 0, 0);
    stop_cheat_caller_address(lantern.contract_address);

    // Advance past deadline — goal not met.
    start_cheat_block_timestamp(lantern.contract_address, 3000);

    // Claim refund — amount=0 since no withdrawal needed (contract holds funds).
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    let note_id: felt252 = 0xAABB;
    let result = lantern
        .privacy_invoke(token_addr, 0, LanternOperation::ClaimRefund, 1, 0, note_id, secret);
    stop_cheat_caller_address(lantern.contract_address);

    // Should return one OpenNoteDeposit.
    assert!(result.len() == 1, "refund should return one deposit");
    let deposit = *result.at(0);
    assert!(deposit.note_id == note_id, "note_id mismatch");
    assert!(deposit.amount == 500, "refund amount mismatch");
    assert!(deposit.token == token_addr, "token mismatch");

    // Donation should be marked claimed.
    let entry = lantern.get_donation(commitment_hash);
    assert!(entry.claimed, "should be marked claimed");
}

#[test]
#[should_panic(expected: 'ALREADY_CLAIMED')]
fn test_double_claim_refund() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, mock_token) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());
    let payout_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_PAYOUT:V1', 1, 0x9999].span(),
    );
    lantern.create_campaign(token_addr, 5000_u128, 2000_u64, payout_hash);
    stop_cheat_caller_address(lantern.contract_address);

    mock_token.mint(lantern.contract_address, 500_u256);
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    let secret: felt252 = 0xDEAD;
    let commitment_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_DONATE:V1', 1, secret].span(),
    );
    lantern.privacy_invoke(token_addr, 500, LanternOperation::Donate, 1, commitment_hash, 0, 0);
    stop_cheat_caller_address(lantern.contract_address);

    start_cheat_block_timestamp(lantern.contract_address, 3000);

    start_cheat_caller_address(lantern.contract_address, pool_addr());
    lantern.privacy_invoke(token_addr, 0, LanternOperation::ClaimRefund, 1, 0, 0xAABB, secret);
    // Second claim should panic.
    lantern.privacy_invoke(token_addr, 0, LanternOperation::ClaimRefund, 1, 0, 0xAABB, secret);
}

#[test]
fn test_claim_payout() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, mock_token) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());
    let payout_secret: felt252 = 0x9999;
    let payout_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_PAYOUT:V1', 1, payout_secret].span(),
    );
    // Goal = 500 so one donation can meet it.
    lantern.create_campaign(token_addr, 500_u128, 2000_u64, payout_hash);
    stop_cheat_caller_address(lantern.contract_address);

    // Donate exactly the goal.
    mock_token.mint(lantern.contract_address, 500_u256);
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    let donate_commitment = core::poseidon::poseidon_hash_span(
        ['LANTERN_DONATE:V1', 1, 0xDEAD].span(),
    );
    lantern.privacy_invoke(token_addr, 500, LanternOperation::Donate, 1, donate_commitment, 0, 0);
    stop_cheat_caller_address(lantern.contract_address);

    // Advance past deadline — goal met.
    start_cheat_block_timestamp(lantern.contract_address, 3000);

    // Claim payout.
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    let note_id: felt252 = 0xCCDD;
    let result = lantern
        .privacy_invoke(token_addr, 0, LanternOperation::ClaimPayout, 1, 0, note_id, payout_secret);
    stop_cheat_caller_address(lantern.contract_address);

    assert!(result.len() == 1, "payout should return one deposit");
    let deposit = *result.at(0);
    assert!(deposit.note_id == note_id, "note_id mismatch");
    assert!(deposit.amount == 500, "payout amount mismatch");

    // Campaign should be marked as paid out.
    let campaign = lantern.get_campaign(1);
    assert!(campaign.payout_claimed, "should be marked paid out");
}

#[test]
#[should_panic(expected: 'GOAL_NOT_MET')]
fn test_payout_when_goal_not_met() {
    let (_, lantern) = deploy_lantern(pool_addr());
    let (token_addr, mock_token) = deploy_mock_erc20();

    start_cheat_block_timestamp(lantern.contract_address, 1000);
    start_cheat_caller_address(lantern.contract_address, organizer_addr());
    let payout_secret: felt252 = 0x9999;
    let payout_hash = core::poseidon::poseidon_hash_span(
        ['LANTERN_PAYOUT:V1', 1, payout_secret].span(),
    );
    lantern.create_campaign(token_addr, 5000_u128, 2000_u64, payout_hash);
    stop_cheat_caller_address(lantern.contract_address);

    // Donate only 500 (goal = 5000).
    mock_token.mint(lantern.contract_address, 500_u256);
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    let donate_commitment = core::poseidon::poseidon_hash_span(
        ['LANTERN_DONATE:V1', 1, 0xDEAD].span(),
    );
    lantern.privacy_invoke(token_addr, 500, LanternOperation::Donate, 1, donate_commitment, 0, 0);
    stop_cheat_caller_address(lantern.contract_address);

    start_cheat_block_timestamp(lantern.contract_address, 3000);

    // Try to claim payout — should fail.
    start_cheat_caller_address(lantern.contract_address, pool_addr());
    lantern.privacy_invoke(token_addr, 0, LanternOperation::ClaimPayout, 1, 0, 0xCCDD, payout_secret);
}
