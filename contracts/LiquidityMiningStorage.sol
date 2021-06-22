// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract LiquidityMiningStorage {
    /// @notice The admin that can set reward rates and emergency stop.
    address public admin;

    /// @notice The comptroller that wants to distribute rewards.
    address public comptroller;

    /// @notice The support reward tokens.
    address[] public rewardTokens;

    /// @notice The support reward tokens.
    mapping(address => bool) public rewardTokensMap;

    /// @notice The portion of rewards rates of each reward token for every supply market
    mapping(address => mapping(address => uint)) public rewardSupplySpeeds;

    /// @notice The portion of rewards rates of each reward token for every borrow market
    mapping(address => mapping(address => uint)) public rewardBorrowSpeeds;

    struct RewardState {
        uint index;
        uint block;
    }

    /// @notice The market reward supply state for each market
    mapping(address => mapping(address => RewardState)) public rewardSupplyState;

    /// @notice The market reward borrow state for each market
    mapping(address => mapping(address => RewardState)) public rewardBorrowState;

    /// @notice The supply index for each market for each supplier as of the last time they accrued rewards
    mapping(address => mapping(address => mapping(address => uint))) public rewardSupplierIndex;

    /// @notice The borrow index for each market for each borrower as of the last time they accrued rewards
    mapping(address => mapping(address => mapping(address => uint))) public rewardBorrowerIndex;

    /// @notice The reward accrued but not yet transferred to each user
    mapping(address => mapping(address => uint)) public rewardAccrued;
}
