// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../LiquidityMining.sol";

contract MockLiquidityMining is LiquidityMining {
    uint private _blockNumber;

    constructor (address _comptroller) LiquidityMining(msg.sender, _comptroller) {}

    function setBlockNumber(uint number) external {
        _blockNumber = number;
    }

    function getBlockNumber() public override view returns (uint) {
        return _blockNumber;
    }

    function transferTokens(address rewardToken, address user, uint amount) external returns (uint) {
        return transferReward(rewardToken, user, amount);
    }
}
