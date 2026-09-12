// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {HuskyAgentPair} from "./HuskyAgentPair.sol";
import {IHuskyAgentFactory} from "./interfaces/IHuskyAgentFactory.sol";

/// @notice Creates and tracks one HuskyAgentPair per token combination, via
/// CREATE2 so pair addresses are deterministic and computable off-chain.
contract HuskyAgentFactory is IHuskyAgentFactory {
    /// @dev Exists for future use; never activated in v1 (see docs/02-contracts-spec.md).
    address public feeTo;
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "HuskyAgentFactory: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "HuskyAgentFactory: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "HuskyAgentFactory: PAIR_EXISTS");

        bytes memory bytecode = type(HuskyAgentPair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(pair != address(0), "HuskyAgentFactory: CREATE2_FAILED");
        HuskyAgentPair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "HuskyAgentFactory: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "HuskyAgentFactory: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }
}
