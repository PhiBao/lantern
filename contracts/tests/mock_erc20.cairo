/// A minimal ERC20 mock for testing the Lantern contract.
/// Only implements what Lantern needs: balance_of, approve, transfer_from.

#[starknet::interface]
pub trait IMockERC20<T> {
    fn mint(ref self: T, to: starknet::ContractAddress, amount: u256);
    fn balance_of(self: @T, account: starknet::ContractAddress) -> u256;
    fn approve(ref self: T, spender: starknet::ContractAddress, amount: u256) -> bool;
    fn transfer(ref self: T, recipient: starknet::ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: T,
        sender: starknet::ContractAddress,
        recipient: starknet::ContractAddress,
        amount: u256,
    ) -> bool;
    fn allowance(self: @T, owner: starknet::ContractAddress, spender: starknet::ContractAddress) -> u256;
}

#[starknet::contract]
pub mod MockERC20 {
    use starknet::storage::{
        StorageMapReadAccess, StorageMapWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        balances: starknet::storage::Map<ContractAddress, u256>,
        allowances: starknet::storage::Map<(ContractAddress, ContractAddress), u256>,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(embed_v0)]
    impl MockERC20Impl of super::IMockERC20<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            let bal = self.balances.read(to);
            self.balances.write(to, bal + amount);
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self.allowances.write((caller, spender), amount);
            true
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            let bal = self.balances.read(caller);
            assert(bal >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.write(caller, bal - amount);
            let recipient_bal = self.balances.read(recipient);
            self.balances.write(recipient, recipient_bal + amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let caller = get_caller_address();
            let allowed = self.allowances.read((sender, caller));
            assert(allowed >= amount, 'INSUFFICIENT_ALLOWANCE');
            self.allowances.write((sender, caller), allowed - amount);
            let bal = self.balances.read(sender);
            assert(bal >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.write(sender, bal - amount);
            let recipient_bal = self.balances.read(recipient);
            self.balances.write(recipient, recipient_bal + amount);
            true
        }

        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
            self.allowances.read((owner, spender))
        }
    }
}
