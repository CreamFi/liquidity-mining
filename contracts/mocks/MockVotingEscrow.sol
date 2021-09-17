// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract MockVotingEscrow {
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function setBalance(address user, uint amount) external {
        _balances[user] = amount;
    }

    function setTotalSupply(uint amount) external {
        _totalSupply = amount;
    }
}
