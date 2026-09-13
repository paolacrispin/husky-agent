// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./IERC20.sol";

/// @notice The official WHSK predeploy (standard OP Stack WETH9) — see
/// WHSK_ADDRESS in docs/06-repo-and-tooling.md. Not our own contract; this
/// interface exists only so Seed.s.sol can wrap native HSK for liquidity.
interface IWHSK is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
